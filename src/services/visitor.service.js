/**
 * Visitor Service
 * Handles visitor CRUD operations
 */

import { createLogger } from '../utils/workerLogger.js';

/**
 * Find or create visitor by cookie
 * Handles race conditions gracefully with UNIQUE constraint violation recovery
 */
export async function findOrCreateVisitor(env, visitorCookie, ipAddress, userAgent) {
  const logger = createLogger(env);
  
  try {
    // Try to find existing visitor
    const existing = await env.DB.prepare(
      'SELECT * FROM visitors WHERE visitor_cookie = ?'
    ).bind(visitorCookie).first();

    if (existing) {
      // Update last_seen and visit_count
      await env.DB.prepare(`
        UPDATE visitors 
        SET last_seen = datetime('now'), visit_count = visit_count + 1
        WHERE id = ?
      `).bind(existing.id).run();

      await logger.debug('Found existing visitor', { visitor_id: existing.id });
      
      // Return updated visitor object (avoid redundant query)
      return {
        ...existing,
        visit_count: existing.visit_count + 1,
        last_seen: new Date().toISOString()
      };
    }

    // Create new visitor
    const visitorId = crypto.randomUUID();
    const now = new Date().toISOString();
    
    try {
      await env.DB.prepare(`
        INSERT INTO visitors (id, visitor_cookie, first_seen, last_seen, visit_count, user_agent, ip_address)
        VALUES (?, ?, datetime('now'), datetime('now'), 1, ?, ?)
      `).bind(visitorId, visitorCookie, userAgent, ipAddress).run();

      await logger.debug('Created new visitor', { visitor_id: visitorId });
      
      // Return constructed visitor object instead of querying DB
      return {
        id: visitorId,
        visitor_cookie: visitorCookie,
        first_seen: now,
        last_seen: now,
        visit_count: 1,
        user_agent: userAgent,
        ip_address: ipAddress
      };
    } catch (insertError) {
      // Handle race condition: if another request created the visitor simultaneously
      if (insertError.message && insertError.message.includes('UNIQUE constraint failed')) {
        await logger.debug('Race condition detected - visitor created concurrently, retrying SELECT', {
          visitor_cookie: visitorCookie.substring(0, 8) + '...'
        });
        
        // Retry SELECT to get the visitor that was created by concurrent request
        const retryExisting = await env.DB.prepare(
          'SELECT * FROM visitors WHERE visitor_cookie = ?'
        ).bind(visitorCookie).first();
        
        if (retryExisting) {
          // Update last_seen and visit_count
          await env.DB.prepare(`
            UPDATE visitors 
            SET last_seen = datetime('now'), visit_count = visit_count + 1
            WHERE id = ?
          `).bind(retryExisting.id).run();
          
          await logger.debug('Retrieved visitor after race condition', { visitor_id: retryExisting.id });
          
          return {
            ...retryExisting,
            visit_count: retryExisting.visit_count + 1,
            last_seen: new Date().toISOString()
          };
        }
      }
      
      // Re-throw if it's not a UNIQUE constraint error
      throw insertError;
    }
  } catch (error) {
    await logger.error('Error in findOrCreateVisitor', { 
      error: error.message,
      stack: error.stack
    });
    throw error;
  }
}

