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
  // Use event_id + email + current timestamp for idempotency
  // Note: created_at may not be set yet when scheduling, so use current time
  const timestamp = trackingData.created_at || Date.now();
  const keyData = `${trackingData.event_id}:${trackingData.email}:${timestamp}`;
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
  
  await logger.info('scheduleDelayedSync called', {
    component: 'pipedrive-delayed-service',
    event_id: trackingData.event_id,
    email: trackingData.email,
    has_cache: !!env.CACHE
  });
  
  if (!env.CACHE) {
    await logger.error('CRITICAL: KV CACHE not available for delayed sync', {
      component: 'pipedrive-delayed-service',
      event_id: trackingData.event_id
    });
    return false;
  }
  
  try {
    const scheduledAt = Date.now() + (DELAY_MINUTES * 60 * 1000);
    const key = `${KV_PREFIX}${trackingData.event_id}:${scheduledAt}`;
    
    await logger.info('scheduleDelayedSync - preparing sync data', {
      component: 'pipedrive-delayed-service',
      event_id: trackingData.event_id,
      email: trackingData.email,
      kv_key: key,
      scheduled_at_iso: new Date(scheduledAt).toISOString(),
      has_utm_source: trackingData.hasOwnProperty('utm_source'),
      utm_source_value: trackingData.utm_source || 'NULL',
      has_utm_medium: trackingData.hasOwnProperty('utm_medium'),
      utm_medium_value: trackingData.utm_medium || 'NULL',
      has_utm_campaign: trackingData.hasOwnProperty('utm_campaign'),
      utm_campaign_value: trackingData.utm_campaign || 'NULL',
      total_fields: Object.keys(trackingData).length
    });
    
    // Create timestamp first, then generate idempotency key with it
    const createdAt = Date.now();
    const trackingDataWithTimestamp = {
      ...trackingData,
      created_at: createdAt
    };
    const idempotencyKey = generateIdempotencyKey(trackingDataWithTimestamp);
    
    await logger.info('scheduleDelayedSync - idempotency key generated', {
      component: 'pipedrive-delayed-service',
      event_id: trackingData.event_id,
      idempotency_key_prefix: idempotencyKey.substring(0, 16)
    });
    
    // Check if this sync was already scheduled/processed
    const idempCheckStart = Date.now();
    const alreadyProcessed = await checkIdempotency(env, idempotencyKey);
    const idempCheckDuration = Date.now() - idempCheckStart;
    
    await logger.info('scheduleDelayedSync - idempotency check completed', {
      component: 'pipedrive-delayed-service',
      event_id: trackingData.event_id,
      already_processed: alreadyProcessed,
      check_duration_ms: idempCheckDuration
    });
    
    if (alreadyProcessed) {
      await logger.warn('scheduleDelayedSync - duplicate sync prevented', {
        component: 'pipedrive-delayed-service',
        event_id: trackingData.event_id,
        idempotency_key_prefix: idempotencyKey.substring(0, 16)
      });
      return true; // Return true as sync was already scheduled
    }
    
    // Store sync data with scheduled timestamp and idempotency key
    const kvPayload = {
      ...trackingData,
      scheduled_at: scheduledAt,
      created_at: createdAt,
      idempotency_key: idempotencyKey
    };
    const kvPayloadString = JSON.stringify(kvPayload);
    const ttlSeconds = Math.floor((DELAY_MINUTES * 60) + (30 * 60));
    
    await logger.info('scheduleDelayedSync - attempting KV write', {
      component: 'pipedrive-delayed-service',
      event_id: trackingData.event_id,
      kv_key: key,
      payload_size_bytes: kvPayloadString.length,
      ttl_seconds: ttlSeconds,
      ttl_minutes: Math.floor(ttlSeconds / 60)
    });
    
    const kvWriteStart = Date.now();
    try {
      await env.CACHE.put(key, kvPayloadString, {
        expirationTtl: ttlSeconds
      });
      const kvWriteDuration = Date.now() - kvWriteStart;
      
      await logger.info('scheduleDelayedSync - KV write SUCCESS', {
        component: 'pipedrive-delayed-service',
        event_id: trackingData.event_id,
        kv_key: key,
        write_duration_ms: kvWriteDuration
      });
      
      // Verify write succeeded by reading back the key
      const verifyStart = Date.now();
      try {
        const verification = await env.CACHE.get(key);
        const verifyDuration = Date.now() - verifyStart;
        
        if (!verification) {
          throw new Error('KV write verification failed - data not found after write');
        }
        
        await logger.info('scheduleDelayedSync - KV write VERIFIED', {
          component: 'pipedrive-delayed-service',
          event_id: trackingData.event_id,
          kv_key: key,
          verify_duration_ms: verifyDuration
        });
      } catch (verifyError) {
        const verifyDuration = Date.now() - verifyStart;
        await logger.error('scheduleDelayedSync - KV write verification FAILED', {
          component: 'pipedrive-delayed-service',
          event_id: trackingData.event_id,
          kv_key: key,
          error: verifyError.message,
          stack: verifyError.stack,
          verify_duration_ms: verifyDuration
        });
        // Throw to trigger retry or error handling
        throw verifyError;
      }
    } catch (kvError) {
      const kvWriteDuration = Date.now() - kvWriteStart;
      await logger.error('scheduleDelayedSync - KV write FAILED', {
        component: 'pipedrive-delayed-service',
        event_id: trackingData.event_id,
        kv_key: key,
        error: kvError.message,
        stack: kvError.stack,
        write_duration_ms: kvWriteDuration
      });
      throw kvError;
    }
    
    // Mark as scheduled for idempotency
    const idempMarkStart = Date.now();
    try {
      await markIdempotency(env, idempotencyKey);
      const idempMarkDuration = Date.now() - idempMarkStart;
      
      await logger.info('scheduleDelayedSync - idempotency marked SUCCESS', {
        component: 'pipedrive-delayed-service',
        event_id: trackingData.event_id,
        mark_duration_ms: idempMarkDuration
      });
    } catch (idempError) {
      const idempMarkDuration = Date.now() - idempMarkStart;
      await logger.error('scheduleDelayedSync - idempotency mark FAILED', {
        component: 'pipedrive-delayed-service',
        event_id: trackingData.event_id,
        error: idempError.message,
        stack: idempError.stack,
        mark_duration_ms: idempMarkDuration
      });
      throw idempError;
    }
    
    await logger.info('scheduleDelayedSync - sync scheduled SUCCESSFULLY', {
      component: 'pipedrive-delayed-service',
      event_id: trackingData.event_id,
      email: trackingData.email,
      kv_key: key,
      scheduled_at: new Date(scheduledAt).toISOString(),
      delay_minutes: DELAY_MINUTES,
      ttl_minutes: Math.floor(ttlSeconds / 60)
    });
    
    return true;
  } catch (error) {
    await logger.error('scheduleDelayedSync - FATAL ERROR', {
      component: 'pipedrive-delayed-service',
      event_id: trackingData.event_id,
      email: trackingData.email,
      error: error.message,
      stack: error.stack,
      error_type: error.constructor.name
    });
    return false;
  }
}

/**
 * Retry failed syncs from database
 * Finds NULL status syncs older than 15 minutes and re-schedules them
 */
async function retryFailedSyncs(env, logger) {
  const startTime = Date.now();
  
  try {
    await logger.info('retryFailedSyncs - starting', {
      component: 'pipedrive-delayed-service'
    });
    
    // Find syncs that should have completed but are still NULL (max 3 retries)
    const dbQueryStart = Date.now();
    const failedSyncs = await env.DB.prepare(`
      SELECT id, form_data, pipedrive_retry_count
      FROM tracking_events 
      WHERE event_type = 'form_submit'
        AND pipedrive_sync_status IS NULL
        AND pipedrive_retry_count < 3
        AND created_at < datetime('now', '-15 minutes')
      LIMIT 10
    `).all();
    const dbQueryDuration = Date.now() - dbQueryStart;
    
    await logger.info('retryFailedSyncs - DB query completed', {
      component: 'pipedrive-delayed-service',
      found_count: failedSyncs.results ? failedSyncs.results.length : 0,
      query_duration_ms: dbQueryDuration
    });
    
    if (failedSyncs.results && failedSyncs.results.length > 0) {
      await logger.warn(`retryFailedSyncs - found failed syncs`, {
        component: 'pipedrive-delayed-service',
        failed_count: failedSyncs.results.length,
        event_ids: failedSyncs.results.map(e => e.id).join(',')
      });
      
      for (const event of failedSyncs.results) {
        const retryCount = (event.pipedrive_retry_count || 0) + 1;
        
        await logger.info(`retryFailedSyncs - processing event ${event.id}`, {
          component: 'pipedrive-delayed-service',
          event_id: event.id,
          current_retry_count: event.pipedrive_retry_count,
          new_retry_count: retryCount
        });
        
        // Update retry count
        const dbUpdateStart = Date.now();
        try {
          const updateResult = await env.DB.prepare(`
            UPDATE tracking_events 
            SET pipedrive_retry_count = ?,
                pipedrive_last_retry_at = datetime('now')
            WHERE id = ?
          `).bind(retryCount, event.id).run();
          const dbUpdateDuration = Date.now() - dbUpdateStart;
          
          await logger.info(`retryFailedSyncs - DB update SUCCESS`, {
            component: 'pipedrive-delayed-service',
            event_id: event.id,
            rows_affected: updateResult.changes || 0,
            update_duration_ms: dbUpdateDuration
          });
        } catch (dbError) {
          const dbUpdateDuration = Date.now() - dbUpdateStart;
          await logger.error(`retryFailedSyncs - DB update FAILED`, {
            component: 'pipedrive-delayed-service',
            event_id: event.id,
            error: dbError.message,
            stack: dbError.stack,
            update_duration_ms: dbUpdateDuration
          });
          continue;
        }
        
        // Re-schedule the sync immediately (no delay for retries)
        // CRITICAL: Must rebuild full tracking data from database, not just email
        const formData = JSON.parse(event.form_data || '{}');
        if (formData.email) {
          // Fetch complete event data from database to rebuild full tracking payload
          let fullEventData = null;
          try {
            const eventQuery = await env.DB.prepare(`
              SELECT 
                e.id, e.visitor_id, e.session_id, e.pixel_id, e.project_id,
                e.page_url, e.referrer_url, e.page_title, e.user_agent,
                e.country, e.region, e.city, e.ip_address,
                e.utm_source, e.utm_medium, e.utm_campaign, e.utm_content, e.utm_term,
                e.gclid, e.fbclid, e.msclkid, e.ttclid, e.twclid, e.li_fat_id, e.sc_click_id,
                e.campaign_region, e.ad_group, e.ad_id, e.search_query,
                v.last_seen as visitor_last_seen,
                s.started_at as session_started_at,
                s.last_activity as session_last_activity
              FROM tracking_events e
              LEFT JOIN visitors v ON e.visitor_id = v.id
              LEFT JOIN sessions s ON e.session_id = s.id
              WHERE e.id = ?
            `).bind(event.id).first();
            
            if (eventQuery) {
              // Extract email and name from form_data
              const email = formData.email || formData.Email || formData.EMAIL || null;
              const first_name = formData.first_name || formData.firstName || formData['first-name'] || formData.FirstName || (formData.name ? formData.name.split(' ')[0] : null);
              const last_name = formData.last_name || formData.lastName || formData['last-name'] || formData.LastName || (formData.name && formData.name.split(' ').length > 1 ? formData.name.split(' ').slice(1).join(' ') : null);
              
              // Rebuild full tracking data payload
              fullEventData = {
                event_id: String(eventQuery.id),
                visitor_id: eventQuery.visitor_id,
                session_id: eventQuery.session_id,
                pixel_id: eventQuery.pixel_id,
                project_id: eventQuery.project_id,
                email: email,
                first_name: first_name,
                last_name: last_name,
                name: formData.name || (first_name && last_name ? `${first_name} ${last_name}` : first_name || last_name) || null,
                page_url: eventQuery.page_url,
                page_title: eventQuery.page_title,
                referrer_url: eventQuery.referrer_url,
                country: eventQuery.country,
                region: eventQuery.region,
                city: eventQuery.city,
                ip_address: eventQuery.ip_address,
                utm_source: eventQuery.utm_source,
                utm_medium: eventQuery.utm_medium,
                utm_campaign: eventQuery.utm_campaign,
                utm_content: eventQuery.utm_content,
                utm_term: eventQuery.utm_term,
                gclid: eventQuery.gclid,
                fbclid: eventQuery.fbclid,
                msclkid: eventQuery.msclkid,
                ttclid: eventQuery.ttclid,
                twclid: eventQuery.twclid,
                li_fat_id: eventQuery.li_fat_id,
                sc_click_id: eventQuery.sc_click_id,
                campaign_region: eventQuery.campaign_region,
                ad_group: eventQuery.ad_group,
                ad_id: eventQuery.ad_id,
                search_query: eventQuery.search_query,
                user_agent: eventQuery.user_agent,
                retry_attempt: retryCount,
                is_retry: true
              };
            }
          } catch (dbError) {
            await logger.error(`retryFailedSyncs - failed to fetch full event data`, {
              component: 'pipedrive-delayed-service',
              event_id: event.id,
              error: dbError.message,
              stack: dbError.stack
            });
          }
          
          if (fullEventData) {
            // Schedule with 1 minute delay for retries
            const scheduledAt = Date.now() + (1 * 60 * 1000);
            const key = `${KV_PREFIX}${event.id}:${scheduledAt}`;
            
            // Generate idempotency key for retry
            const createdAt = Date.now();
            const idempotencyKey = generateIdempotencyKey({
              ...fullEventData,
              created_at: createdAt
            });
            
            const kvWriteStart = Date.now();
            try {
              await env.CACHE.put(key, JSON.stringify({
                ...fullEventData,
                scheduled_at: scheduledAt,
                created_at: createdAt,
                idempotency_key: idempotencyKey
              }), {
                expirationTtl: 600 // 10 minutes for retries
              });
              const kvWriteDuration = Date.now() - kvWriteStart;
              
              await logger.info(`retryFailedSyncs - KV write SUCCESS`, {
                component: 'pipedrive-delayed-service',
                event_id: event.id,
                kv_key: key,
                retry_count: retryCount,
                has_full_data: true,
                write_duration_ms: kvWriteDuration
              });
            } catch (kvError) {
              const kvWriteDuration = Date.now() - kvWriteStart;
              await logger.error(`retryFailedSyncs - KV write FAILED`, {
                component: 'pipedrive-delayed-service',
                event_id: event.id,
                kv_key: key,
                error: kvError.message,
                stack: kvError.stack,
                write_duration_ms: kvWriteDuration
              });
            }
          } else {
            await logger.error(`retryFailedSyncs - could not rebuild full tracking data`, {
              component: 'pipedrive-delayed-service',
              event_id: event.id,
              has_email: !!formData.email
            });
          }
        } else {
          await logger.warn(`retryFailedSyncs - no email found`, {
            component: 'pipedrive-delayed-service',
            event_id: event.id,
            form_data_keys: Object.keys(formData).join(',')
          });
        }
      }
      
      const totalDuration = Date.now() - startTime;
      await logger.info('retryFailedSyncs - completed', {
        component: 'pipedrive-delayed-service',
        retried_count: failedSyncs.results.length,
        total_duration_ms: totalDuration
      });
      
      return failedSyncs.results.length;
    }
    
    await logger.info('retryFailedSyncs - no failed syncs found', {
      component: 'pipedrive-delayed-service',
      total_duration_ms: Date.now() - startTime
    });
    
    return 0;
  } catch (error) {
    await logger.error('retryFailedSyncs - FATAL ERROR', {
      component: 'pipedrive-delayed-service',
      error: error.message,
      stack: error.stack,
      total_duration_ms: Date.now() - startTime
    });
    return 0;
  }
}

/**
 * Process pending delayed syncs
 * Called by scheduled worker
 * Optimized with batching for high-volume scenarios
 */
export async function processDelayedSyncs(env) {
  const logger = createLogger(env);
  const startTime = Date.now();
  
  await logger.info('processDelayedSyncs - function called', {
    component: 'pipedrive-delayed-service',
    has_cache: !!env.CACHE,
    has_db: !!env.DB
  });
  
  if (!env.CACHE) {
    await logger.error('processDelayedSyncs - FATAL: KV CACHE not available', {
      component: 'pipedrive-delayed-service'
    });
    return { processed: 0, failed: 0 };
  }
  
  try {
    const now = Date.now();
    let processed = 0;
    let failed = 0;
    const BATCH_SIZE = 50; // Process in batches to avoid memory issues
    
    // List all pending sync keys with pagination support
    await logger.info('processDelayedSyncs - starting KV list operation', {
      component: 'pipedrive-delayed-service',
      kv_prefix: KV_PREFIX
    });
    
    let cursor = null;
    let allKeys = [];
    let pageCount = 0;
    const MAX_PAGES = 10;
    const kvListStartTime = Date.now();
    
    do {
      pageCount++;
      const listOptions = {
        prefix: KV_PREFIX,
        limit: 1000
      };
      
      if (cursor) {
        listOptions.cursor = cursor;
      }
      
      const pageStartTime = Date.now();
      try {
        const keysResult = await env.CACHE.list(listOptions);
        const pageDuration = Date.now() - pageStartTime;
        
        allKeys = allKeys.concat(keysResult.keys);
        cursor = keysResult.cursor;
        
        await logger.info(`processDelayedSyncs - KV list page ${pageCount} SUCCESS`, {
          component: 'pipedrive-delayed-service',
          page: pageCount,
          keys_in_page: keysResult.keys.length,
          total_keys_so_far: allKeys.length,
          has_more: !!cursor,
          page_duration_ms: pageDuration
        });
      } catch (kvError) {
        const pageDuration = Date.now() - pageStartTime;
        await logger.error(`processDelayedSyncs - KV list page ${pageCount} FAILED`, {
          component: 'pipedrive-delayed-service',
          page: pageCount,
          error: kvError.message,
          stack: kvError.stack,
          page_duration_ms: pageDuration
        });
        break;
      }
      
      // Prevent infinite loops - limit pages and total keys
      if (!cursor || allKeys.length >= 10000 || pageCount >= MAX_PAGES) break;
    } while (cursor);
    
    const kvListDuration = Date.now() - kvListStartTime;
    
    await logger.info('processDelayedSyncs - KV list operation completed', {
      component: 'pipedrive-delayed-service',
      total_keys: allKeys.length,
      pages_fetched: pageCount,
      total_duration_ms: kvListDuration
    });
    
    // Log summary of pending syncs
    await logger.info('Scheduled worker - pending syncs found', {
      component: 'scheduled-worker',
      total_keys: allKeys.length,
      pages_fetched: pageCount,
      scheduled_for_processing: allKeys.filter(k => {
        const parts = k.name.split(':');
        const scheduledAt = parseInt(parts[2]);
        return scheduledAt && scheduledAt <= now;
      }).length,
      scheduled_for_future: allKeys.filter(k => {
        const parts = k.name.split(':');
        const scheduledAt = parseInt(parts[2]);
        return scheduledAt && scheduledAt > now;
      }).length
    });
    
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
          if (!scheduledAt || isNaN(scheduledAt)) {
            await logger.warn('Invalid scheduled timestamp in KV key', {
              key: key.name,
              timestamp: keyParts[2]
            });
            await env.CACHE.delete(key.name);
            return { processed: false };
          }
          
          // Only process if scheduled time has passed
          if (scheduledAt <= now) {
            const syncData = await env.CACHE.get(key.name, 'json');
            
            if (syncData) {
              // Log what data we retrieved from KV (critical for debugging UTM issues)
              try {
                await logger.info('processDelayedSyncs - sync data retrieved from KV', {
                  component: 'pipedrive-delayed-service',
                  event_id: syncData.event_id,
                  email: syncData.email || 'unknown',
                  has_utm_source: syncData.hasOwnProperty('utm_source'),
                  utm_source_value: syncData.utm_source || 'NULL',
                  has_utm_medium: syncData.hasOwnProperty('utm_medium'),
                  utm_medium_value: syncData.utm_medium || 'NULL',
                  has_utm_campaign: syncData.hasOwnProperty('utm_campaign'),
                  utm_campaign_value: syncData.utm_campaign || 'NULL',
                  total_keys: Object.keys(syncData).length,
                  all_keys: Object.keys(syncData).join(', ')
                });
              } catch (logError) {
                console.error('[pipedrive-delayed-service] Failed to log KV sync data retrieval', {
                  logging_error: logError.message,
                  event_id: syncData.event_id
                });
              }
              
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
              let timeoutHandle = null;
              try {
                // Set a timeout for the entire sync operation
                const syncTimeout = new Promise((_, reject) => {
                  timeoutHandle = setTimeout(() => reject(new Error('Sync timeout after 30 seconds')), 30000);
                });
                
                const syncPromise = findOrCreatePerson(env, syncData);
                const result = await Promise.race([syncPromise, syncTimeout]);
                
                // Clear timeout if sync completed successfully
                if (timeoutHandle) {
                  clearTimeout(timeoutHandle);
                  timeoutHandle = null;
                }
                
                // Update database with sync status
                const eventId = parseInt(syncData.event_id);
                if (!eventId || isNaN(eventId)) {
                  await logger.error('Invalid event_id in sync processing', {
                    event_id: syncData.event_id
                  });
                  return { processed: false };
                }
                
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
                // Always clear timeout on error
                if (timeoutHandle) {
                  clearTimeout(timeoutHandle);
                  timeoutHandle = null;
                }
                
                // Update database with error status
                const eventId = parseInt(syncData.event_id);
                if (!eventId || isNaN(eventId)) {
                  await logger.error('Invalid event_id in sync error handler', {
                    event_id: syncData.event_id,
                    error: syncError.message
                  });
                  return { processed: false };
                }
                
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
                
                await logger.error('Delayed sync execution failed', {
                  error: syncError.message,
                  event_id: syncData.event_id,
                  timeout: syncError.message.includes('timeout')
                });
                return { processed: false };
              }
            } else {
              // Key expired or invalid - update database status to indicate expiration
              const eventId = parseInt(keyParts[1]); // Extract event_id from key
              if (eventId && !isNaN(eventId)) {
                try {
                  await env.DB.prepare(`
                    UPDATE tracking_events 
                    SET 
                      pipedrive_sync_status = ?,
                      pipedrive_sync_at = datetime('now')
                    WHERE id = ? AND pipedrive_sync_status IS NULL
                  `).bind('error', eventId).run();
                  
                  await logger.warn('KV sync entry expired before processing', {
                    event_id: eventId,
                    key: key.name,
                    scheduled_at: new Date(parseInt(keyParts[2])).toISOString()
                  });
                } catch (dbError) {
                  await logger.error('Failed to update status for expired sync entry', {
                    error: dbError.message,
                    event_id: eventId
                  });
                }
              }
              
              await env.CACHE.delete(key.name);
              return { processed: true, skipped: true }; // Mark as processed (handled, even if expired)
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
    
    // Retry failed syncs after processing current batch
    const retriedCount = await retryFailedSyncs(env, logger);
    
    // Log final summary
    await logger.info('Scheduled worker - processing complete', {
      component: 'scheduled-worker',
      processed,
      failed,
      retried: retriedCount,
      total: processed + failed,
      success_rate: processed + failed > 0 ? Math.round((processed / (processed + failed)) * 100) + '%' : 'N/A'
    });
    
    return { processed, failed, retried: retriedCount };
  } catch (error) {
    await logger.error('Failed to process delayed syncs', {
      component: 'scheduled-worker',
      error: error.message,
      stack: error.stack
    });
    return { processed: 0, failed: 0 };
  }
}

