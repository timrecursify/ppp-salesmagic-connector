/**
 * Tracking Routes for Cloudflare Workers
 * Refactored with service layer and extracted handlers - compact and maintainable
 */

import { Hono } from 'hono';
import { validateTrackingRequest, detectBots, securityHeaders } from '../middleware/security.js';
import { getClientIP } from '../middleware/privacy.js';
import { trackingRateLimit } from '../middleware/rateLimit.js';
import { createLogger } from '../utils/workerLogger.js';
import { generateVisitorCookie, isValidVisitorCookie } from '../utils/cookies.js';
import { extractUTMParams, extractAttributionFromURLs, createAttributionSummary } from '../services/utm.service.js';
import { findOrCreateVisitor } from '../services/visitor.service.js';
import { createOrUpdateSession } from '../services/session.service.js';
import { 
  extractFormDataFromURL, 
  parseFormData, 
  extractGeographicData, 
  determineEventType 
} from '../handlers/tracking.handlers.js';
import { insertTrackingEvent } from '../handlers/eventInsertion.handler.js';
import { prepareAndSchedulePipedriveSync } from '../handlers/pipedriveSync.handler.js';

const app = new Hono();

// Apply global middleware for tracking routes
app.use('*', securityHeaders);
app.use('*', detectBots);
app.use('*', trackingRateLimit);

/**
 * POST /track - Main tracking endpoint
 */
app.post('/track', validateTrackingRequest, async (c) => {
  const startTime = Date.now();
  const logger = createLogger(c.env);
  let validatedData;
  
  try {
    validatedData = c.get('validatedData');
    
    if (!validatedData) {
      await logger.error('No validated data found');
      return c.json({
        success: false,
        error: 'Validation failed',
        processing_time: Date.now() - startTime
      }, 400);
    }

    const {
      pixel_id,
      project_id,
      page_url,
      visitor_cookie,
      event_type = 'pageview',
      referrer_url,
      page_title,
      form_data
    } = validatedData;

    // Validate pixel exists and is active
    const pixel = await c.env.DB.prepare(
      'SELECT id, project_id, active FROM pixels WHERE id = ?'
    ).bind(pixel_id).first();

    if (!pixel) {
      await logger.error('Pixel not found', { pixel_id });
      return c.json({
        success: false,
        error: 'Invalid pixel_id',
        processing_time: Date.now() - startTime
      }, 400);
    }

    if (!pixel.active) {
      await logger.error('Pixel is inactive', { pixel_id });
      return c.json({
        success: false,
        error: 'Pixel is inactive',
        processing_time: Date.now() - startTime
      }, 400);
    }

    const finalProjectId = project_id || pixel.project_id;

    // Extract form data from URL or provided data
    let finalFormData = form_data;
    
    // Log form data received for debugging
    if (form_data) {
      await logger.debug('Form data received', {
        form_data_type: typeof form_data,
        form_data_length: typeof form_data === 'string' ? form_data.length : 'N/A',
        has_form_data: true
      }).catch(() => {});
    }
    
    if (!finalFormData && page_url) {
      finalFormData = extractFormDataFromURL(page_url);
    }
    if (!finalFormData && referrer_url) {
      finalFormData = extractFormDataFromURL(referrer_url);
    }

    const finalEventType = determineEventType(finalFormData, event_type);
    
    // Log event type determination
    if (finalFormData || finalEventType === 'form_submit') {
      await logger.debug('Form submission detected', {
        has_form_data: !!finalFormData,
        event_type: event_type,
        final_event_type: finalEventType
      }).catch(() => {});
    }

    // Get client IP and geographic data from Cloudflare
    const clientIP = getClientIP(c);
    const { country, region, city } = extractGeographicData(c);

    // Generate or validate visitor cookie
    let visitorCookie = visitor_cookie;
    if (!visitorCookie || !isValidVisitorCookie(visitorCookie)) {
      visitorCookie = generateVisitorCookie();
    }

    // Find or create visitor
    const visitor = await findOrCreateVisitor(
      c.env,
      visitorCookie,
      clientIP,
      validatedData.user_agent || 'unknown'
    );

    // Extract UTM parameters (from request + URL + referrer)
    let utmData = extractUTMParams(validatedData);
    const urlAttribution = extractAttributionFromURLs(page_url, referrer_url);
    utmData = { ...urlAttribution, ...utmData };
    
    const attribution = createAttributionSummary(utmData);

    // Create or update session
    const session = await createOrUpdateSession(
      c.env,
      visitor.id,
      pixel_id,
      utmData
    );

    // Prepare user agent header
    const userAgentHeader = c.req.header('User-Agent') || validatedData.user_agent || 'unknown';

    // Insert tracking event using handler
    const finalEventId = await insertTrackingEvent(c.env, {
      projectId: finalProjectId,
      pixelId: pixel_id,
      visitorId: visitor.id,
      sessionId: session.id,
      eventType: finalEventType,
      pageUrl: page_url,
      referrerUrl: referrer_url,
      pageTitle: page_title,
      userAgent: userAgentHeader,
      clientIP,
      country,
      region,
      city,
      utmData,
      attribution,
      viewportData: validatedData.viewport,
      formData: finalFormData,
      screenData: validatedData.screen
    });

    // Send to Pipedrive if form submission
    if (finalFormData || finalEventType === 'form_submit') {
      await prepareAndSchedulePipedriveSync(c.env, logger, {
        eventId: finalEventId,
        visitorId: visitor.id,
        sessionId: session.id,
        pixelId: pixel_id,
        projectId: finalProjectId,
        pageUrl: page_url,
        referrerUrl: referrer_url,
        pageTitle: page_title,
        userAgent: userAgentHeader,
        country,
        region,
        city,
        attribution,
        utmData,
        formData: finalFormData,
        screenData: validatedData.screen,
        eventType: finalEventType,
        clientIP
      });
      
      if (c.env.executionCtx) {
        // Ensure async operations are tracked
        c.env.executionCtx.waitUntil(
          Promise.resolve().catch(() => {})
        );
      }
    }

    const processingTime = Date.now() - startTime;

    return c.json({
      success: true,
      visitor_cookie: visitorCookie,
      visitor_id: visitor.id,
      session_id: session.id,
      event_id: finalEventId,
      processing_time: processingTime,
      attribution: {
        source: attribution.source,
        medium: attribution.medium,
        campaign: attribution.campaign
      }
    }, 200);

  } catch (error) {
    const errorDetails = {
      error: error?.message || String(error),
      stack: error?.stack,
      path: c.req.path,
      method: c.req.method,
      pixel_id: validatedData?.pixel_id || 'unknown',
      page_url: validatedData?.page_url || 'unknown'
    };

    await logger.error('Tracking endpoint error', errorDetails);

    const isDev = c.env.ENVIRONMENT === 'development';
    
    return c.json({
      success: false,
      error: isDev ? errorDetails.error : 'Internal server error',
      ...(isDev && { details: errorDetails }),
      processing_time: Date.now() - startTime
    }, 500);
  }
});

/**
 * GET /pixel.gif - Fallback image pixel for JavaScript-disabled browsers
 * Note: Middleware already applied globally to this route
 */
app.get('/pixel.gif', async (c) => {
  const startTime = Date.now();
  const logger = createLogger(c.env);

  try {
    const pixelId = c.req.query('pixel_id');
    const projectId = c.req.query('project_id');
    const pageUrl = c.req.query('page_url');
    const referrerUrl = c.req.query('referrer_url') || c.req.header('Referer');

    if (!pixelId || !pageUrl) {
      const gif = 'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
      return new Response(
        Uint8Array.from(atob(gif), c => c.charCodeAt(0)),
        {
          headers: {
            'Content-Type': 'image/gif',
            'Cache-Control': 'no-cache, no-store, must-revalidate'
          }
        }
      );
    }

    const pixel = await c.env.DB.prepare(
      'SELECT id, project_id, active FROM pixels WHERE id = ?'
    ).bind(pixelId).first();

    if (!pixel || !pixel.active) {
      const gif = 'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
      return new Response(
        Uint8Array.from(atob(gif), c => c.charCodeAt(0)),
        {
          headers: {
            'Content-Type': 'image/gif',
            'Cache-Control': 'no-cache, no-store, must-revalidate'
          }
        }
      );
    }

    const finalProjectId = projectId || pixel.project_id;
    const clientIP = getClientIP(c);
    const cf = c.req.raw?.cf || {};
    const country = cf.country || null;
    const region = cf.region || null;
    const city = cf.city || null;

    const visitorCookie = generateVisitorCookie();
    const visitor = await findOrCreateVisitor(
      c.env,
      visitorCookie,
      clientIP,
      c.req.header('User-Agent') || 'unknown'
    );

    const utmData = extractAttributionFromURLs(pageUrl, referrerUrl);
    const attribution = createAttributionSummary(utmData);

    const session = await createOrUpdateSession(
      c.env,
      visitor.id,
      pixelId,
      utmData
    );

    const browserData = extractBrowserData(c.req.header('User-Agent') || 'unknown');
    const deviceData = extractDeviceData(c.req.header('User-Agent') || 'unknown');

    await c.env.DB.prepare(`
      INSERT INTO tracking_events (
        project_id, pixel_id, visitor_id, session_id, event_type,
        page_url, referrer_url, user_agent, ip_address,
        country, region, city,
        utm_source, utm_medium, utm_campaign, utm_content, utm_term,
        gclid, fbclid, msclkid, ttclid, twclid, li_fat_id, sc_click_id,
        browser_data, device_data, viewport_data,
        campaign_region, ad_group, ad_id, search_query
      )
      VALUES (?, ?, ?, ?, 'pageview', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      finalProjectId || null,
      pixelId,
      visitor.id,
      session.id,
      decodeURIComponent(pageUrl),
      referrerUrl ? decodeURIComponent(referrerUrl) : null,
      c.req.header('User-Agent') || 'unknown',
      clientIP,
      country,
      region,
      city,
      attribution.source,
      attribution.medium,
      attribution.campaign,
      utmData.utm_content,
      utmData.utm_term,
      utmData.gclid ?? null,
      utmData.fbclid ?? null,
      utmData.msclkid ?? null,
      utmData.ttclid ?? null,
      utmData.twclid ?? null,
      utmData.li_fat_id ?? null,
      utmData.sc_click_id ?? null,
      browserData,
      deviceData,
      '{}',
      utmData.campaign_region ?? null,
      utmData.ad_group ?? null,
      utmData.ad_id ?? null,
      utmData.search_query ?? null
    ).run();

    await logger.debug('Fallback pixel tracking stored', {
      visitor_id: visitor.id,
      pixel_id: pixelId
    });

    const gif = 'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
    return new Response(
      Uint8Array.from(atob(gif), c => c.charCodeAt(0)),
      {
        headers: {
          'Content-Type': 'image/gif',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Set-Cookie': `ppp_visitor=${visitorCookie}; Path=/; Max-Age=31536000; SameSite=Lax`
        }
      }
    );

  } catch (error) {
    await logger.error('Pixel GIF endpoint error', {
      error: error.message,
      stack: error.stack
    });

    const gif = 'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
    return new Response(
      Uint8Array.from(atob(gif), c => c.charCodeAt(0)),
      {
        headers: {
          'Content-Type': 'image/gif',
          'Cache-Control': 'no-cache, no-store, must-revalidate'
        }
      }
    );
  }
});

export default app;
