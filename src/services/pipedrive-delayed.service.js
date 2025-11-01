/**
 * Pipedrive Delayed Sync Service
 * Stores sync requests in KV for delayed processing (7 minutes after form submission)
 */

import { findOrCreatePerson } from './pipedrive.service.js';
import { createLogger } from '../utils/workerLogger.js';
import { fetchWithRetry } from '../utils/fetchWithRetry.js';

const DELAY_MINUTES = 7;
const KV_PREFIX = 'pipedrive_sync:';
const IDEMPOTENCY_PREFIX = 'idempotency:';

/**
 * Generate idempotency key from form data
 */
function generateIdempotencyKey(trackingData) {
  // Use event_id + email + timestamp hash for idempotency
  const keyData = `${trackingData.event_id}:${trackingData.email}:${trackingData.created_at}`;
  // Simple hash function
  let hash = 0;
  for (let i = 0; i < keyData.length; i++) {
    const char = keyData.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return `idemp_${Math.abs(hash).toString(36)}`;
}

/**
 * Check if sync was already processed (idempotency check)
 */
async function checkIdempotency(env, idempotencyKey) {
  if (!env.CACHE) return false;
  
  try {
    const existing = await env.CACHE.get(`${IDEMPOTENCY_PREFIX}${idempotencyKey}`);
    return existing !== null;
  } catch (error) {
    return false;
  }
}

/**
 * Mark sync as processed (idempotency marker)
 */
async function markIdempotency(env, idempotencyKey) {
  if (!env.CACHE) return;
  
  try {
    // Store idempotency marker for 24 hours
    await env.CACHE.put(
      `${IDEMPOTENCY_PREFIX}${idempotencyKey}`,
      'processed',
      { expirationTtl: 86400 } // 24 hours
    );
  } catch (error) {
    // Silently fail - idempotency check is best-effort
  }
}

/**
 * Schedule a delayed Pipedrive sync
 * Stores sync data in KV with scheduled_at timestamp
 * Includes idempotency protection to prevent duplicate syncs
 */
export async function scheduleDelayedSync(env, trackingData) {
  const logger = createLogger(env);
  
  if (!env.CACHE) {
    await logger.error('KV CACHE not available for delayed sync');
    return false;
  }
  
  try {
    // Generate idempotency key to prevent duplicate syncs
    const idempotencyKey = generateIdempotencyKey(trackingData);
    
    // Check if this sync was already scheduled/processed
    const alreadyProcessed = await checkIdempotency(env, idempotencyKey);
    if (alreadyProcessed) {
      await logger.debug('Duplicate sync prevented via idempotency check', {
        event_id: trackingData.event_id,
        idempotency_key: idempotencyKey.substring(0, 16) + '...'
      });
      return true; // Return true as sync was already scheduled
    }
    
    const scheduledAt = Date.now() + (DELAY_MINUTES * 60 * 1000);
    const key = `${KV_PREFIX}${trackingData.event_id}:${scheduledAt}`;
    
    // Store sync data with scheduled timestamp and idempotency key
    await env.CACHE.put(key, JSON.stringify({
      ...trackingData,
      scheduled_at: scheduledAt,
      created_at: Date.now(),
      idempotency_key: idempotencyKey
    }), {
      expirationTtl: Math.floor((DELAY_MINUTES * 60) + 60) // TTL = delay + 1 minute buffer
    });
    
    // Mark as scheduled for idempotency
    await markIdempotency(env, idempotencyKey);
    
    await logger.info('Scheduled delayed Pipedrive sync', {
      event_id: trackingData.event_id,
      scheduled_at: new Date(scheduledAt).toISOString(),
      delay_minutes: DELAY_MINUTES,
      idempotency_key: idempotencyKey.substring(0, 16) + '...'
    });
    
    return true;
  } catch (error) {
    await logger.error('Failed to schedule delayed sync', {
      error: error.message,
      event_id: trackingData.event_id
    });
    return false;
  }
}

/**
 * Process pending delayed syncs
 * Called by scheduled worker
 * Optimized with batching for high-volume scenarios
 */
export async function processDelayedSyncs(env) {
  const logger = createLogger(env);
  
  if (!env.CACHE) {
    await logger.error('KV CACHE not available for processing delayed syncs');
    return { processed: 0, failed: 0 };
  }
  
  try {
    const now = Date.now();
    let processed = 0;
    let failed = 0;
    const BATCH_SIZE = 50; // Process in batches to avoid memory issues
    
    // List all pending sync keys with pagination support
    let cursor = null;
    let allKeys = [];
    
    do {
      const listOptions = {
        prefix: KV_PREFIX,
        limit: 1000
      };
      
      if (cursor) {
        listOptions.cursor = cursor;
      }
      
      const keysResult = await env.CACHE.list(listOptions);
      allKeys = allKeys.concat(keysResult.keys);
      cursor = keysResult.cursor;
      
      // Prevent infinite loops - limit to 10 pages (10,000 keys max per run)
      if (!cursor || allKeys.length >= 10000) break;
    } while (cursor);
    
    // Process keys in batches
    for (let i = 0; i < allKeys.length; i += BATCH_SIZE) {
      const batch = allKeys.slice(i, i + BATCH_SIZE);
      
      // Process batch concurrently (limited concurrency)
      const batchPromises = batch.map(async (key) => {
        try {
          // Parse timestamp from key (format: pipedrive_sync:event_id:timestamp)
          const keyParts = key.name.split(':');
          if (keyParts.length !== 3) return { processed: false };
          
          const scheduledAt = parseInt(keyParts[2]);
          
          // Only process if scheduled time has passed
          if (scheduledAt <= now) {
            const syncData = await env.CACHE.get(key.name, 'json');
            
            if (syncData) {
              // Check idempotency before processing
              if (syncData.idempotency_key) {
                const alreadyProcessed = await checkIdempotency(env, syncData.idempotency_key);
                if (alreadyProcessed && syncData.processed_at) {
                  // Already processed, skip and delete
                  await env.CACHE.delete(key.name);
                  return { processed: true, skipped: true };
                }
              }
              
              // Execute sync with timeout protection (wrapped in try-catch)
              try {
                // Set a timeout for the entire sync operation
                const syncTimeout = new Promise((_, reject) => {
                  setTimeout(() => reject(new Error('Sync timeout after 30 seconds')), 30000);
                });
                
                const syncPromise = findOrCreatePerson(env, syncData);
                const result = await Promise.race([syncPromise, syncTimeout]);
                
                // Update database with sync status
                const eventId = parseInt(syncData.event_id);
                if (eventId) {
                  try {
                    await env.DB.prepare(`
                      UPDATE tracking_events 
                      SET 
                        pipedrive_sync_status = ?,
                        pipedrive_sync_at = datetime('now'),
                        pipedrive_person_id = ?
                      WHERE id = ?
                    `).bind(
                      result.status || 'error',
                      result.personId || null,
                      eventId
                    ).run();
                  } catch (dbError) {
                    await logger.error('Failed to update sync status in database', {
                      error: dbError.message,
                      event_id: syncData.event_id
                    });
                  }
                }
                
                if (result && result.status === 'synced') {
                  await logger.info('Processed delayed Pipedrive sync', {
                    event_id: syncData.event_id,
                    person_id: result.personId,
                    status: result.status,
                    reason: result.reason,
                    delay_minutes: Math.round((now - syncData.created_at) / 60000)
                  });
                  
                  // Mark as processed in idempotency store
                  if (syncData.idempotency_key) {
                    await markIdempotency(env, syncData.idempotency_key);
                  }
                  
                  // Delete key after successful sync
                  await env.CACHE.delete(key.name);
                  return { processed: true, skipped: false };
                } else {
                  await logger.info('Delayed sync completed - person not found or error', {
                    event_id: syncData.event_id,
                    status: result?.status || 'unknown',
                    reason: result?.reason || 'No result'
                  });
                  
                  // Mark as processed in idempotency store even if not found
                  if (syncData.idempotency_key) {
                    await markIdempotency(env, syncData.idempotency_key);
                  }
                  
                  // Delete key after processing (even if not found)
                  await env.CACHE.delete(key.name);
                  return { processed: true, skipped: false }; // Processed = true means we handled it
                }
              } catch (syncError) {
                // Update database with error status
                const eventId = parseInt(syncData.event_id);
                if (eventId) {
                  try {
                    await env.DB.prepare(`
                      UPDATE tracking_events 
                      SET 
                        pipedrive_sync_status = ?,
                        pipedrive_sync_at = datetime('now')
                      WHERE id = ?
                    `).bind('error', eventId).run();
                  } catch (dbError) {
                    // Ignore DB errors during error handling
                  }
                }
                
                await logger.error('Delayed sync execution failed', {
                  error: syncError.message,
                  event_id: syncData.event_id,
                  timeout: syncError.message.includes('timeout')
                });
                return { processed: false };
              }
            } else {
              // Key expired or invalid
              await env.CACHE.delete(key.name);
              return { processed: false };
            }
          }
          
          return { processed: false };
        } catch (error) {
          await logger.error('Error processing delayed sync', {
            error: error.message,
            key: key.name
          });
          return { processed: false };
        }
      });
      
      // Wait for batch to complete (with concurrency limit)
      const batchResults = await Promise.allSettled(batchPromises);
      
      for (const result of batchResults) {
        if (result.status === 'fulfilled') {
          if (result.value.processed) {
            processed++;
          } else if (!result.value.skipped) {
            failed++;
          }
        } else {
          failed++;
        }
      }
      
      // Small delay between batches to prevent overwhelming the system
      if (i + BATCH_SIZE < allKeys.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    
    return { processed, failed };
  } catch (error) {
    await logger.error('Failed to process delayed syncs', {
      error: error.message,
      stack: error.stack
    });
    return { processed: 0, failed: 0 };
  }
}

