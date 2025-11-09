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
  const startTime = Date.now();
  
  await logger.info('prepareAndSchedulePipedriveSync - function called', {
    component: 'pipedrive-sync-handler',
    event_id: eventId,
    event_type: eventType,
    has_form_data: !!formData,
    form_data_length: formData ? formData.length : 0
  });
  
  if (!formData && eventType !== 'form_submit') {
    await logger.info('prepareAndSchedulePipedriveSync - skipped: no form data or not form_submit', {
      component: 'pipedrive-sync-handler',
      event_id: eventId,
      event_type: eventType,
      has_form_data: !!formData
    });
    return null;
  }

  const formDataParsed = parseFormData(formData);
  
  await logger.info('prepareAndSchedulePipedriveSync - form data parsed', {
    component: 'pipedrive-sync-handler',
    event_id: eventId,
    parsed_fields: formDataParsed ? Object.keys(formDataParsed).join(', ') : 'none'
  });
  
  // Extract email and name with all field name variations
  function extractEmailAndName(parsed) {
    if (!parsed || typeof parsed !== 'object') return { email: null, first_name: null, last_name: null };
    
    // Email extraction - check all variations
    let email = parsed.email || parsed.Email || parsed.EMAIL || 
                parsed['email'] || parsed['e-mail'] || parsed['e_mail'] || null;
    
    // If not found, search for any field containing 'email' or 'mail'
    if (!email) {
      const emailKey = Object.keys(parsed).find(k => {
        const lower = k.toLowerCase();
        return (lower.includes('email') || lower.includes('mail')) && parsed[k];
      });
      if (emailKey) {
        email = parsed[emailKey];
      }
    }
    
    // First name extraction - check all variations
    const first_name = parsed.first_name || parsed['first_name'] || parsed['first-name'] || 
                       parsed.firstName || parsed.FirstName || parsed.FIRST_NAME ||
                       parsed.fname || parsed.Fname || parsed['f-name'] || parsed['f_name'] ||
                       (parsed.name ? parsed.name.split(' ')[0] : null);
    
    // Last name extraction - check all variations
    const last_name = parsed.last_name || parsed['last_name'] || parsed['last-name'] || 
                      parsed.lastName || parsed.LastName || parsed.LAST_NAME ||
                      parsed.lname || parsed.Lname || parsed['l-name'] || parsed['l_name'] ||
                      (parsed.name && parsed.name.split(' ').length > 1 ? parsed.name.split(' ').slice(1).join(' ') : null);
    
    return { email, first_name, last_name };
  }
  
  const { email, first_name, last_name } = extractEmailAndName(formDataParsed);
  
  await logger.info('prepareAndSchedulePipedriveSync - extracted contact info', {
    component: 'pipedrive-sync-handler',
    event_id: eventId,
    email: email || 'NO EMAIL',
    has_email: !!email,
    first_name: first_name || 'none',
    last_name: last_name || 'none'
  });
  
  if (!email || email === 'NO EMAIL') {
    await logger.warn('prepareAndSchedulePipedriveSync - skipped: no email', {
      component: 'pipedrive-sync-handler',
      event_id: eventId,
      form_data_keys: formDataParsed ? Object.keys(formDataParsed).join(', ') : 'none'
    });
    return null; // Skip sync if no email
  }
  
  
  // Parse browser/device data for Pipedrive
  let browserDataParsed = {};
  let deviceDataParsed = {};
  try {
    browserDataParsed = extractBrowserData(userAgent);
    deviceDataParsed = extractDeviceData(userAgent);
    if (typeof browserDataParsed === 'string') {
      try {
        browserDataParsed = JSON.parse(browserDataParsed);
      } catch (parseError) {
        try {
          await logger.warn('Failed to parse browser data JSON', {
            component: 'pipedrive-sync-handler',
            error: parseError.message,
            stack: parseError.stack,
            event_id: eventId
          });
        } catch (logError) {
          console.error('[pipedrive-sync-handler] Failed to log browser parse error', {
            original_error: parseError.message,
            logging_error: logError.message,
            event_id: eventId
          });
        }
        browserDataParsed = {};
      }
    }
    if (typeof deviceDataParsed === 'string') {
      try {
        deviceDataParsed = JSON.parse(deviceDataParsed);
      } catch (parseError) {
        try {
          await logger.warn('Failed to parse device data JSON', {
            component: 'pipedrive-sync-handler',
            error: parseError.message,
            stack: parseError.stack,
            event_id: eventId
          });
        } catch (logError) {
          console.error('[pipedrive-sync-handler] Failed to log device parse error', {
            original_error: parseError.message,
            logging_error: logError.message,
            event_id: eventId
          });
        }
        deviceDataParsed = {};
      }
    }
  } catch (e) {
    // Ignore parse errors - already handled above
  }

  // SIMPLIFIED: Use UTM data from parameters (already computed and stored in database)
  // No need to query database - utmData/attribution are computed from same source as DB insert
  // This eliminates race conditions, retry logic, and unnecessary database queries
  try {
    await logger.info('Using UTM data from request parameters', {
      component: 'pipedrive-sync-handler',
      event_id: eventId,
      utm_source: attribution?.source || 'NULL',
      utm_medium: attribution?.medium || 'NULL',
      utm_campaign: attribution?.campaign || 'NULL',
      has_utmData: !!utmData
    });
  } catch (logError) {
    console.error('[pipedrive-sync-handler] Failed to log UTM data info', {
      logging_error: logError.message,
      event_id: eventId
    });
  }

  // Fetch visitor data for last_visited_on
  let visitorRecord = null;
  try {
    visitorRecord = await env.DB.prepare(
      'SELECT last_seen FROM visitors WHERE id = ?'
    ).bind(visitorId).first();
  } catch (dbError) {
    try {
      await logger.warn('Failed to fetch visitor record for Pipedrive sync', {
        component: 'pipedrive-sync-handler',
        visitor_id: visitorId,
        error: dbError.message,
        stack: dbError.stack
      });
    } catch (logError) {
      console.error('[pipedrive-sync-handler] Failed to log visitor fetch error', {
        original_error: dbError.message,
        logging_error: logError.message,
        visitor_id: visitorId
      });
    }
  }

  // Fetch session data for session_duration
  let sessionRecord = null;
  try {
    sessionRecord = await env.DB.prepare(
      'SELECT started_at, last_activity FROM sessions WHERE id = ?'
    ).bind(sessionId).first();
  } catch (dbError) {
    try {
      await logger.warn('Failed to fetch session record for Pipedrive sync', {
        component: 'pipedrive-sync-handler',
        session_id: sessionId,
        error: dbError.message,
        stack: dbError.stack
      });
    } catch (logError) {
      console.error('[pipedrive-sync-handler] Failed to log session fetch error', {
        original_error: dbError.message,
        logging_error: logError.message,
        session_id: sessionId
      });
    }
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
    try {
      await logger.warn('Failed to fetch visited pages for Pipedrive sync', {
        component: 'pipedrive-sync-handler',
        visitor_id: visitorId,
        error: dbError.message,
        stack: dbError.stack
      });
    } catch (logError) {
      console.error('[pipedrive-sync-handler] Failed to log visited pages fetch error', {
        original_error: dbError.message,
        logging_error: logError.message,
        visitor_id: visitorId
      });
    }
  }

  // Format additional data
  const lastVisitedOn = visitorRecord?.last_seen 
    ? formatDateForPipedrive(visitorRecord.last_seen) 
    : null;
  
  const sessionDuration = sessionRecord?.started_at && sessionRecord?.last_activity
    ? formatSessionDuration(sessionRecord.started_at, sessionRecord.last_activity)
    : null;
  
  const location = formatLocation(city, region, country);
  
  // Use clientIP directly (same value stored in database at event insertion)
  const ipAddress = clientIP || null;

  // CRITICAL FIX: Use utmData directly (actual UTM values), not attribution (fallback values)
  // attribution.source has fallback logic that replaces missing UTM with "direct"/"unknown"/"none"
  // We need the actual UTM parameter values stored in database, not inferred fallbacks
  const utmSource = utmData?.utm_source || null;
  const utmMedium = utmData?.utm_medium || null;
  const utmCampaign = utmData?.utm_campaign || null;
  const utmContent = utmData?.utm_content || null;
  const utmTerm = utmData?.utm_term || null;
  
  try {
    await logger.info('UTM parameters extracted for Pipedrive sync', {
      component: 'pipedrive-sync-handler',
      event_id: eventId,
      utm_source: utmSource || 'NULL',
      utm_medium: utmMedium || 'NULL',
      utm_campaign: utmCampaign || 'NULL',
      utm_content: utmContent || 'NULL',
      utm_term: utmTerm || 'NULL',
      source: 'request_parameters' // From same request that inserted event
    });
  } catch (logError) {
    console.error('[pipedrive-sync-handler] Failed to log UTM extraction info', {
      logging_error: logError.message,
      event_id: eventId
    });
  }
  
  const pipedriveData = {
    // Contact info (only used for search, not updated)
    email: email || null,
    first_name: first_name || null,
    last_name: last_name || null,
    name: formDataParsed.name || (first_name && last_name ? `${first_name} ${last_name}` : first_name || last_name) || null,
    
    // UTM parameters (use database values first, then fallback to attribution/utmData)
    // CRITICAL: Only include if not null/undefined - mapToPipedriveFields will exclude nulls
    utm_source: utmSource,
    utm_medium: utmMedium,
    utm_campaign: utmCampaign,
    utm_content: utmContent,
    utm_term: utmTerm,
    
    // Click IDs (from utmData - same source as database)
    gclid: utmData?.gclid || null,
    fbclid: utmData?.fbclid || null,
    msclkid: utmData?.msclkid || null,
    ttclid: utmData?.ttclid || null,
    twclid: utmData?.twclid || null,
    li_fat_id: utmData?.li_fat_id || null,
    sc_click_id: utmData?.sc_click_id || null,
    
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
    
    // Ad data (from utmData - same source as database)
    campaign_region: utmData?.campaign_region || null,
    ad_group: utmData?.ad_group || null,
    ad_id: utmData?.ad_id || null,
    search_query: utmData?.search_query || null,
    
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

  // Schedule delayed Pipedrive sync (7 minutes after form submission)
  await logger.info('prepareAndSchedulePipedriveSync - calling scheduleDelayedSync', {
    component: 'pipedrive-sync-handler',
    event_id: eventId,
    email: email,
    has_cache: !!env.CACHE,
    pipedrive_data_keys: Object.keys(pipedriveData).length
  });
  
  const scheduleStart = Date.now();
  const syncScheduled = await scheduleDelayedSync(env, pipedriveData);
  const scheduleDuration = Date.now() - scheduleStart;
  const totalDuration = Date.now() - startTime;
  
  if (syncScheduled) {
    await logger.info('prepareAndSchedulePipedriveSync - SUCCESS', {
      component: 'pipedrive-sync-handler',
      event_id: eventId,
      email: email,
      scheduled_at: new Date(Date.now() + 7 * 60 * 1000).toISOString(),
      delay_minutes: 7,
      schedule_duration_ms: scheduleDuration,
      total_duration_ms: totalDuration
    });
  } else {
    await logger.error('prepareAndSchedulePipedriveSync - FAILED to schedule', {
      component: 'pipedrive-sync-handler',
      event_id: eventId,
      email: email,
      has_cache: !!env.CACHE,
      schedule_duration_ms: scheduleDuration,
      total_duration_ms: totalDuration
    });
  }
  
  return syncScheduled;
}

