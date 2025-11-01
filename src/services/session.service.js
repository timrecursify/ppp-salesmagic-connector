/**
 * Session Service
 * Handles session management and first-visit attribution
 */

import { createLogger } from '../utils/workerLogger.js';
import { createAttributionSummary } from './utm.service.js';
import { generateSessionCookie } from '../utils/cookies.js';

/**
 * Create or update session with UTM attribution
 */
export async function createOrUpdateSession(env, visitorId, pixelId, utmData) {
  const logger = createLogger(env);
  
  try {
    const attribution = createAttributionSummary(utmData);
    
    // Look for existing active session (within last 30 minutes)
    const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    
    const existing = await env.DB.prepare(`
      SELECT * FROM sessions 
      WHERE visitor_id = ? 
        AND pixel_id = ? 
        AND datetime(last_activity) > datetime(?)
      ORDER BY last_activity DESC
      LIMIT 1
    `).bind(visitorId, pixelId, thirtyMinutesAgo).first();

    if (existing) {
      // Update existing session
      await env.DB.prepare(`
        UPDATE sessions 
        SET 
          last_activity = datetime('now'),
          page_views = page_views + 1,
          utm_source = ?,
          utm_medium = ?,
          utm_campaign = ?,
          utm_content = ?,
          utm_term = ?,
          campaign_region = ?,
          ad_group = ?,
          ad_id = ?,
          search_query = ?
        WHERE id = ?
      `).bind(
        attribution.source || null,
        attribution.medium || null,
        attribution.campaign || null,
        utmData.utm_content || null,
        utmData.utm_term || null,
        utmData.campaign_region || null,
        utmData.ad_group || null,
        utmData.ad_id || null,
        utmData.search_query || null,
        existing.id
      ).run();

      logger.debug('Updated existing session', { session_id: existing.id }).catch(() => {});
      
      // Return updated session object (avoid redundant query)
      const now = new Date().toISOString();
      return {
        ...existing,
        last_activity: now,
        page_views: existing.page_views + 1,
        utm_source: attribution.source || existing.utm_source,
        utm_medium: attribution.medium || existing.utm_medium,
        utm_campaign: attribution.campaign || existing.utm_campaign,
        utm_content: utmData.utm_content || existing.utm_content,
        utm_term: utmData.utm_term || existing.utm_term,
        campaign_region: utmData.campaign_region || existing.campaign_region,
        ad_group: utmData.ad_group || existing.ad_group,
        ad_id: utmData.ad_id || existing.ad_id,
        search_query: utmData.search_query || existing.search_query
      };
    }

    // Check for first-visit attribution (if no UTM in current visit)
    let finalUtmData = { ...utmData };
    if (!utmData.utm_source) {
      const firstSession = await env.DB.prepare(`
        SELECT utm_source, utm_medium, utm_campaign, utm_content, utm_term
        FROM sessions
        WHERE visitor_id = ? AND pixel_id = ? AND utm_source IS NOT NULL
        ORDER BY started_at ASC
        LIMIT 1
      `).bind(visitorId, pixelId).first();
      
      if (firstSession && firstSession.utm_source) {
        // Use first-visit attribution
        finalUtmData = {
          ...finalUtmData,
          utm_source: firstSession.utm_source,
          utm_medium: firstSession.utm_medium,
          utm_campaign: firstSession.utm_campaign,
          utm_content: finalUtmData.utm_content || firstSession.utm_content,
          utm_term: finalUtmData.utm_term || firstSession.utm_term,
          attribution_type: 'first_visit'
        };
      }
    }

    // Create new session
    const sessionId = crypto.randomUUID();
    const sessionCookie = generateSessionCookie();
    const finalAttribution = createAttributionSummary(finalUtmData);
    const now = new Date().toISOString();
    
    try {
      await env.DB.prepare(`
        INSERT INTO sessions (
          id, visitor_id, pixel_id, session_cookie, started_at, last_activity,
          page_views, utm_source, utm_medium, utm_campaign, utm_content, utm_term,
          campaign_region, ad_group, ad_id, search_query
        )
        VALUES (?, ?, ?, ?, datetime('now'), datetime('now'), 1, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        sessionId,
        visitorId,
        pixelId,
        sessionCookie,
        finalAttribution.source || null,
        finalAttribution.medium || null,
        finalAttribution.campaign || null,
        finalUtmData.utm_content || null,
        finalUtmData.utm_term || null,
        finalUtmData.campaign_region || null,
        finalUtmData.ad_group || null,
        finalUtmData.ad_id || null,
        finalUtmData.search_query || null
      ).run();

      logger.debug('Created new session', { session_id: sessionId }).catch(() => {});
      
      // Return constructed session object instead of querying DB
      return {
        id: sessionId,
        visitor_id: visitorId,
        pixel_id: pixelId,
        session_cookie: sessionCookie,
        started_at: now,
        last_activity: now,
        page_views: 1,
        utm_source: finalAttribution.source || null,
        utm_medium: finalAttribution.medium || null,
        utm_campaign: finalAttribution.campaign || null,
        utm_content: finalUtmData.utm_content || null,
        utm_term: finalUtmData.utm_term || null,
        campaign_region: finalUtmData.campaign_region || null,
        ad_group: finalUtmData.ad_group || null,
        ad_id: finalUtmData.ad_id || null,
        search_query: finalUtmData.search_query || null
      };
    } catch (insertError) {
      // Handle race condition: if session cookie somehow collides (extremely rare)
      if (insertError.message && insertError.message.includes('UNIQUE constraint failed')) {
        logger.warn('Session cookie collision detected, regenerating', {
          visitor_id: visitorId,
          pixel_id: pixelId
        }).catch(() => {});
        
        // Retry with new session cookie (extremely unlikely to collide twice)
        const newSessionCookie = generateSessionCookie();
        const newSessionId = crypto.randomUUID();
        
        await env.DB.prepare(`
          INSERT INTO sessions (
            id, visitor_id, pixel_id, session_cookie, started_at, last_activity,
            page_views, utm_source, utm_medium, utm_campaign, utm_content, utm_term,
            campaign_region, ad_group, ad_id, search_query
          )
          VALUES (?, ?, ?, ?, datetime('now'), datetime('now'), 1, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(
          newSessionId,
          visitorId,
          pixelId,
          newSessionCookie,
          finalAttribution.source || null,
          finalAttribution.medium || null,
          finalAttribution.campaign || null,
          finalUtmData.utm_content || null,
          finalUtmData.utm_term || null,
          finalUtmData.campaign_region || null,
          finalUtmData.ad_group || null,
          finalUtmData.ad_id || null,
          finalUtmData.search_query || null
        ).run();
        
        return {
          id: newSessionId,
          visitor_id: visitorId,
          pixel_id: pixelId,
          session_cookie: newSessionCookie,
          started_at: now,
          last_activity: now,
          page_views: 1,
          utm_source: finalAttribution.source || null,
          utm_medium: finalAttribution.medium || null,
          utm_campaign: finalAttribution.campaign || null,
          utm_content: finalUtmData.utm_content || null,
          utm_term: finalUtmData.utm_term || null,
          campaign_region: finalUtmData.campaign_region || null,
          ad_group: finalUtmData.ad_group || null,
          ad_id: finalUtmData.ad_id || null,
          search_query: finalUtmData.search_query || null
        };
      }
      
      // Re-throw if it's not a UNIQUE constraint error
      throw insertError;
    }
  } catch (error) {
    logger.error('Error in createOrUpdateSession', { 
      error: error.message,
      stack: error.stack,
      visitor_id: visitorId,
      pixel_id: pixelId
    }).catch(() => {});
    throw error;
  }
}

