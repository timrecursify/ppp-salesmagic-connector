/**
 * Tracking Event Insertion Handler
 * Handles inserting tracking events into database
 */

import { extractBrowserData, extractDeviceData } from '../utils/browser.js';
import { extractUTMParams, extractAttributionFromURLs, createAttributionSummary } from '../services/utm.service.js';

/**
 * Insert tracking event into database
 */
export async function insertTrackingEvent(env, {
  projectId,
  pixelId,
  visitorId,
  sessionId,
  eventType,
  pageUrl,
  referrerUrl,
  pageTitle,
  userAgent,
  clientIP,
  country,
  region,
  city,
  utmData,
  attribution,
  viewportData,
  formData,
  screenData
}) {
  // Prepare browser and device data
  const browserData = extractBrowserData(userAgent);
  const deviceData = extractDeviceData(userAgent);
  const viewportDataJson = viewportData ? JSON.stringify(viewportData) : '{}';

  // Store tracking event
  const eventResult = await env.DB.prepare(`
    INSERT INTO tracking_events (
      project_id, pixel_id, visitor_id, session_id, event_type,
      page_url, referrer_url, page_title, user_agent, ip_address,
      country, region, city,
      utm_source, utm_medium, utm_campaign, utm_content, utm_term,
      gclid, fbclid, msclkid, ttclid, twclid, li_fat_id, sc_click_id,
      browser_data, device_data, viewport_data, form_data,
      campaign_region, ad_group, ad_id, search_query,
      pipedrive_sync_status, pipedrive_sync_at, pipedrive_person_id
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    projectId || null,
    pixelId,
    visitorId,
    sessionId,
    eventType,
    pageUrl,
    referrerUrl || null,
    pageTitle || null,
    userAgent,
    clientIP || null,
    country || null,
    region || null,
    city || null,
    attribution.source || null,
    attribution.medium || null,
    attribution.campaign || null,
    utmData.utm_content ?? null,
    utmData.utm_term ?? null,
    utmData.gclid ?? null,
    utmData.fbclid ?? null,
    utmData.msclkid ?? null,
    utmData.ttclid ?? null,
    utmData.twclid ?? null,
    utmData.li_fat_id ?? null,
    utmData.sc_click_id ?? null,
    browserData,
    deviceData,
    viewportDataJson,
    formData || null,
    utmData.campaign_region ?? null,
    utmData.ad_group ?? null,
    utmData.ad_id ?? null,
    utmData.search_query ?? null,
    null, // pipedrive_sync_status (will be set when sync runs)
    null, // pipedrive_sync_at (will be set when sync runs)
    null  // pipedrive_person_id (will be set when sync runs)
  ).run();

  const eventId = eventResult.meta.last_row_id;
  
  // Fallback: query for ID if last_row_id not available
  let finalEventId = eventId;
  if (!finalEventId && eventResult.meta.changes > 0) {
    // Use timestamp-based query to ensure we get the correct event
    // Increased delay from 10ms to 50ms for better D1 consistency
    await new Promise(resolve => setTimeout(resolve, 50));
    
    // More specific query with additional WHERE conditions to avoid race conditions
    const inserted = await env.DB.prepare(`
      SELECT id FROM tracking_events 
      WHERE visitor_id = ? 
        AND session_id = ? 
        AND event_type = ?
        AND page_url = ?
        AND timestamp >= datetime(?, "-2 seconds") 
      ORDER BY id DESC 
      LIMIT 1
    `).bind(
      visitorId, 
      sessionId, 
      eventType,
      pageUrl,
      new Date().toISOString()
    ).first();
    
    if (inserted?.id) {
      finalEventId = inserted.id;
    } else {
      // If still not found, try one more time with longer delay
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const retryInserted = await env.DB.prepare(`
        SELECT id FROM tracking_events 
        WHERE visitor_id = ? 
          AND session_id = ? 
          AND timestamp >= datetime(?, "-3 seconds") 
        ORDER BY id DESC 
        LIMIT 1
      `).bind(visitorId, sessionId, new Date().toISOString()).first();
      
      if (retryInserted?.id) {
        finalEventId = retryInserted.id;
      }
    }
  }

  if (!finalEventId) {
    // Log warning instead of throwing to prevent blocking the entire request
    console.error('CRITICAL: Failed to get event ID after insert', {
      meta: eventResult.meta,
      visitor_id: visitorId,
      session_id: sessionId,
      event_type: eventType,
      page_url: pageUrl
    });
    
    // Return a fallback value or throw based on severity
    throw new Error(`Failed to get event ID after database insert. Changes: ${eventResult.meta.changes}`);
  }

  return finalEventId;
}

