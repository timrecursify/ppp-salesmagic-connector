/**
 * Pipedrive Sync Preparation Handler
 * Prepares and schedules Pipedrive sync for form submissions
 */

import { parseFormData } from './tracking.handlers.js';
import { scheduleDelayedSync } from '../services/pipedrive-delayed.service.js';
import { extractBrowserData, extractDeviceData } from '../utils/browser.js';
import { formatDateForPipedrive, formatSessionDuration, formatLocation } from '../utils/pipedriveFormatters.js';

/**
 * Prepare and schedule Pipedrive sync for form submission
 */
export async function prepareAndSchedulePipedriveSync(env, logger, {
  eventId,
  visitorId,
  sessionId,
  pixelId,
  projectId,
  pageUrl,
  referrerUrl,
  pageTitle,
  userAgent,
  country,
  region,
  city,
  attribution,
  utmData,
  formData,
  screenData,
  eventType,
  clientIP
}) {
  if (!formData && eventType !== 'form_submit') {
    return null;
  }

  const formDataParsed = parseFormData(formData);
  
  // Log for debugging
  await logger.debug('Preparing Pipedrive sync', {
    event_id: eventId,
    has_form_data: !!formData,
    form_data_keys: formDataParsed ? Object.keys(formDataParsed).join(', ') : 'none',
    email: formDataParsed.email || 'none'
  }).catch(() => {});
  
  // Parse browser/device data for Pipedrive
  let browserDataParsed = {};
  let deviceDataParsed = {};
  try {
    browserDataParsed = extractBrowserData(userAgent);
    deviceDataParsed = extractDeviceData(userAgent);
    if (typeof browserDataParsed === 'string') {
      browserDataParsed = JSON.parse(browserDataParsed);
    }
    if (typeof deviceDataParsed === 'string') {
      deviceDataParsed = JSON.parse(deviceDataParsed);
    }
  } catch (e) {
    // Ignore parse errors
  }

  // Fetch complete event data from database (includes all columns)
  // Add error handling in case event doesn't exist (shouldn't happen, but be defensive)
  let eventRecord = null;
  try {
    eventRecord = await env.DB.prepare(
      'SELECT gclid, fbclid, msclkid, ttclid, twclid, li_fat_id, sc_click_id, utm_content, utm_term, campaign_region, ad_group, ad_id, search_query, ip_address FROM tracking_events WHERE id = ?'
    ).bind(eventId).first();
  } catch (dbError) {
    await logger.warn('Failed to fetch event record for Pipedrive sync', {
      event_id: eventId,
      error: dbError.message
    }).catch(() => {});
    // Continue with null eventRecord - will use utmData fallback
  }

  // Fetch visitor data for last_visited_on
  let visitorRecord = null;
  try {
    visitorRecord = await env.DB.prepare(
      'SELECT last_seen FROM visitors WHERE id = ?'
    ).bind(visitorId).first();
  } catch (dbError) {
    await logger.warn('Failed to fetch visitor record for Pipedrive sync', {
      visitor_id: visitorId,
      error: dbError.message
    }).catch(() => {});
  }

  // Fetch session data for session_duration
  let sessionRecord = null;
  try {
    sessionRecord = await env.DB.prepare(
      'SELECT started_at, last_activity FROM sessions WHERE id = ?'
    ).bind(sessionId).first();
  } catch (dbError) {
    await logger.warn('Failed to fetch session record for Pipedrive sync', {
      session_id: sessionId,
      error: dbError.message
    }).catch(() => {});
  }

  // Fetch visited pages for visitor (aggregate all unique page URLs)
  let visitedPages = null;
  try {
    const pagesResult = await env.DB.prepare(
      'SELECT DISTINCT page_url FROM tracking_events WHERE visitor_id = ? AND page_url IS NOT NULL ORDER BY timestamp DESC LIMIT 50'
    ).bind(visitorId).all();
    
    if (pagesResult.results && pagesResult.results.length > 0) {
      visitedPages = pagesResult.results.map(row => row.page_url).filter(Boolean).join(', ');
    }
  } catch (dbError) {
    await logger.warn('Failed to fetch visited pages for Pipedrive sync', {
      visitor_id: visitorId,
      error: dbError.message
    }).catch(() => {});
  }

  // Format additional data
  const lastVisitedOn = visitorRecord?.last_seen 
    ? formatDateForPipedrive(visitorRecord.last_seen) 
    : null;
  
  const sessionDuration = sessionRecord?.started_at && sessionRecord?.last_activity
    ? formatSessionDuration(sessionRecord.started_at, sessionRecord.last_activity)
    : null;
  
  const location = formatLocation(city, region, country);
  
  // Use IP from event record if available, otherwise use clientIP parameter
  const ipAddress = eventRecord?.ip_address || clientIP || null;

  // Prepare tracking data for Pipedrive (use columns directly, not JSON)
  const pipedriveData = {
    // Contact info (only used for search, not updated)
    email: formDataParsed.email || null,
    first_name: formDataParsed.first_name || null,
    last_name: formDataParsed.last_name || null,
    name: formDataParsed.name || null,
    
    // UTM parameters
    utm_source: attribution.source || null,
    utm_medium: attribution.medium || null,
    utm_campaign: attribution.campaign || null,
    utm_content: eventRecord?.utm_content || utmData.utm_content || null,
    utm_term: eventRecord?.utm_term || utmData.utm_term || null,
    
    // Click IDs (from columns)
    gclid: eventRecord?.gclid || utmData.gclid || null,
    fbclid: eventRecord?.fbclid || utmData.fbclid || null,
    msclkid: eventRecord?.msclkid || utmData.msclkid || null,
    ttclid: eventRecord?.ttclid || utmData.ttclid || null,
    twclid: eventRecord?.twclid || utmData.twclid || null,
    li_fat_id: eventRecord?.li_fat_id || utmData.li_fat_id || null,
    sc_click_id: eventRecord?.sc_click_id || utmData.sc_click_id || null,
    
    // Tracking IDs
    event_id: String(eventId),
    visitor_id: visitorId,
    session_id: sessionId,
    pixel_id: pixelId,
    project_id: projectId || null,
    
    // Page data
    page_url: pageUrl || null,
    page_title: pageTitle || null,
    referrer_url: referrerUrl || null,
    
    // Geographic
    country: country || null,
    region: region || null,
    city: city || null,
    location: location,
    
    // Ad data (from columns)
    campaign_region: eventRecord?.campaign_region || utmData.campaign_region || null,
    ad_group: eventRecord?.ad_group || utmData.ad_group || null,
    ad_id: eventRecord?.ad_id || utmData.ad_id || null,
    search_query: eventRecord?.search_query || utmData.search_query || null,
    
    // Device/Browser
    user_agent: userAgent,
    screen_resolution: screenData?.width && screenData?.height
      ? `${screenData.width}x${screenData.height}`
      : null,
    device_type: deviceDataParsed.type || null,
    operating_system: browserDataParsed.os || null,
    event_type: eventType,
    
    // New fields
    last_visited_on: lastVisitedOn,
    visited_pages: visitedPages,
    session_duration: sessionDuration,
    ip_address: ipAddress
  };

  // Schedule delayed Pipedrive sync (10 minutes after form submission)
  const syncScheduled = await scheduleDelayedSync(env, pipedriveData);
  
  if (syncScheduled) {
    await logger.debug('Delayed Pipedrive sync scheduled', {
      event_id: eventId,
      scheduled_at: new Date(Date.now() + 10 * 60 * 1000).toISOString()
    }).catch(() => {});
  } else {
    await logger.warn('Failed to schedule delayed Pipedrive sync', {
      event_id: eventId
    }).catch(() => {});
  }
  
  return syncScheduled;
}

