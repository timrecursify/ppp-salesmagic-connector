/**
 * Analytics Routes for Cloudflare Workers
 * Provides data insights and reporting functionality
 */

import { Hono } from 'hono';
import { apiRateLimit } from '../middleware/rateLimit.js';
import { requireAuth } from '../middleware/auth.js';
import { createLogger } from '../utils/workerLogger.js';
import { getPipedriveCircuitBreaker } from '../utils/circuitBreaker.js';

const app = new Hono();

// Apply rate limiting and authentication to analytics routes
app.use('*', apiRateLimit);
app.use('*', requireAuth);

/**
 * GET /stats/:pixelId - Get basic statistics for a pixel
 */
app.get('/stats/:pixelId', async (c) => {
  try {
    const pixelId = c.req.param('pixelId');
    // Validate and clamp days parameter (1-365) to prevent DoS via expensive queries
    const rawDays = parseInt(c.req.query('days') || '30');
    const days = Math.min(Math.max(isNaN(rawDays) ? 30 : rawDays, 1), 365);
    
    // Validate pixel exists and user has access
    const pixel = await c.env.DB.prepare(
      'SELECT * FROM pixels WHERE id = ? AND active = 1'
    ).bind(pixelId).first();

    if (!pixel) {
      return c.json({ success: false, error: 'Pixel not found' }, 404);
    }

    // Get date range
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    // Get basic statistics
    const stats = await c.env.DB.prepare(`
      SELECT 
        COUNT(*) as total_events,
        COUNT(DISTINCT visitor_id) as unique_visitors,
        COUNT(DISTINCT session_id) as unique_sessions,
        COUNT(DISTINCT page_url) as unique_pages
      FROM tracking_events 
      WHERE pixel_id = ? 
        AND timestamp >= ? 
        AND timestamp <= ?
        AND archived = 0
    `).bind(pixelId, startDate.toISOString(), endDate.toISOString()).first();

    // Get top UTM sources
    const topSources = await c.env.DB.prepare(`
      SELECT 
        utm_source,
        COUNT(*) as count
      FROM tracking_events 
      WHERE pixel_id = ? 
        AND timestamp >= ? 
        AND timestamp <= ?
        AND archived = 0
        AND utm_source IS NOT NULL
      GROUP BY utm_source
      ORDER BY count DESC
      LIMIT 10
    `).bind(pixelId, startDate.toISOString(), endDate.toISOString()).all();

    // Get top pages
    const topPages = await c.env.DB.prepare(`
      SELECT 
        page_url,
        COUNT(*) as count
      FROM tracking_events 
      WHERE pixel_id = ? 
        AND timestamp >= ? 
        AND timestamp <= ?
        AND archived = 0
      GROUP BY page_url
      ORDER BY count DESC
      LIMIT 10
    `).bind(pixelId, startDate.toISOString(), endDate.toISOString()).all();

    // Get daily breakdown
    const dailyStats = await c.env.DB.prepare(`
      SELECT 
        DATE(timestamp) as date,
        COUNT(*) as events,
        COUNT(DISTINCT visitor_id) as visitors
      FROM tracking_events 
      WHERE pixel_id = ? 
        AND timestamp >= ? 
        AND timestamp <= ?
        AND archived = 0
      GROUP BY DATE(timestamp)
      ORDER BY date DESC
    `).bind(pixelId, startDate.toISOString(), endDate.toISOString()).all();

    return c.json({
      success: true,
      data: {
        pixel_id: pixelId,
        date_range: {
          start: startDate.toISOString(),
          end: endDate.toISOString(),
          days: days
        },
        summary: stats,
        top_sources: topSources.results || [],
        top_pages: topPages.results || [],
        daily_breakdown: dailyStats.results || []
      }
    });

  } catch (error) {
    const logger = createLogger(c.env);
    logger.error('Analytics error', {
      error: error.message,
      stack: error.stack,
      pixel_id: c.req.param('pixelId'),
      path: c.req.path
    }).catch(() => {});
    return c.json({
      success: false,
      error: 'Failed to retrieve analytics data'
    }, 500);
  }
});

/**
 * GET /project/:projectId/stats - Get project-level statistics
 */
app.get('/project/:projectId/stats', async (c) => {
  try {
    const projectId = c.req.param('projectId');
    // Validate and clamp days parameter (1-365) to prevent DoS via expensive queries
    const rawDays = parseInt(c.req.query('days') || '30');
    const days = Math.min(Math.max(isNaN(rawDays) ? 30 : rawDays, 1), 365);
    
    // Validate project exists
    const project = await c.env.DB.prepare(
      'SELECT * FROM projects WHERE id = ? AND active = 1'
    ).bind(projectId).first();

    if (!project) {
      return c.json({ success: false, error: 'Project not found' }, 404);
    }

    // Get date range
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    // Get project-level statistics
    const stats = await c.env.DB.prepare(`
      SELECT 
        COUNT(*) as total_events,
        COUNT(DISTINCT visitor_id) as unique_visitors,
        COUNT(DISTINCT session_id) as unique_sessions,
        COUNT(DISTINCT pixel_id) as active_pixels
      FROM tracking_events 
      WHERE project_id = ? 
        AND timestamp >= ? 
        AND timestamp <= ?
        AND archived = 0
    `).bind(projectId, startDate.toISOString(), endDate.toISOString()).first();

    // Get pixel breakdown
    const pixelStats = await c.env.DB.prepare(`
      SELECT 
        p.id as pixel_id,
        p.name as pixel_name,
        COUNT(te.id) as events,
        COUNT(DISTINCT te.visitor_id) as visitors
      FROM pixels p
      LEFT JOIN tracking_events te ON p.id = te.pixel_id 
        AND te.timestamp >= ? 
        AND te.timestamp <= ?
        AND te.archived = 0
      WHERE p.project_id = ? AND p.active = 1
      GROUP BY p.id, p.name
      ORDER BY events DESC
    `).bind(startDate.toISOString(), endDate.toISOString(), projectId).all();

    return c.json({
      success: true,
      data: {
        project_id: projectId,
        date_range: {
          start: startDate.toISOString(),
          end: endDate.toISOString(),
          days: days
        },
        summary: stats,
        pixel_breakdown: pixelStats.results || []
      }
    });

  } catch (error) {
    const logger = createLogger(c.env);
    logger.error('Project analytics error', {
      error: error.message,
      stack: error.stack,
      project_id: c.req.param('projectId'),
      path: c.req.path
    }).catch(() => {});
    return c.json({
      success: false,
      error: 'Failed to retrieve project analytics'
    }, 500);
  }
});

/**
 * GET /export/:pixelId - Export tracking data for a pixel
 */
app.get('/export/:pixelId', async (c) => {
  try {
    const pixelId = c.req.param('pixelId');
    const format = c.req.query('format') || 'json';
    // Validate and clamp days parameter (1-365) to prevent DoS via expensive queries
    const rawDays = parseInt(c.req.query('days') || '30');
    const days = Math.min(Math.max(isNaN(rawDays) ? 30 : rawDays, 1), 365);
    // Validate and clamp limit parameter (1-10000) to prevent DoS
    const rawLimit = parseInt(c.req.query('limit') || '1000');
    const limit = Math.min(Math.max(isNaN(rawLimit) ? 1000 : rawLimit, 1), 10000);
    
    // Validate pixel exists
    const pixel = await c.env.DB.prepare(
      'SELECT * FROM pixels WHERE id = ? AND active = 1'
    ).bind(pixelId).first();

    if (!pixel) {
      return c.json({ success: false, error: 'Pixel not found' }, 404);
    }

    // Get date range
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    // Get tracking data
    const events = await c.env.DB.prepare(`
      SELECT 
        id,
        event_type,
        page_url,
        referrer_url,
        page_title,
        utm_source,
        utm_medium,
        utm_campaign,
        utm_content,
        utm_term,
        country,
        timestamp,
        created_at
      FROM tracking_events 
      WHERE pixel_id = ? 
        AND timestamp >= ? 
        AND timestamp <= ?
        AND archived = 0
      ORDER BY timestamp DESC
      LIMIT ?
    `).bind(pixelId, startDate.toISOString(), endDate.toISOString(), limit).all();

    if (format === 'csv') {
      // Convert to CSV format
      const csvData = events.results || [];
      if (csvData.length === 0) {
        return c.text('No data available', 404);
      }

      const headers = Object.keys(csvData[0]);
      const csvContent = [
        headers.join(','),
        ...csvData.map(row => 
          headers.map(header => 
            JSON.stringify(row[header] || '')
          ).join(',')
        )
      ].join('\n');

      return new Response(csvContent, {
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="pixel_${pixelId}_export.csv"`
        }
      });
    }

    // Return JSON format
    return c.json({
      success: true,
      data: {
        pixel_id: pixelId,
        export_date: new Date().toISOString(),
        date_range: {
          start: startDate.toISOString(),
          end: endDate.toISOString()
        },
        events: events.results || [],
        total_exported: (events.results || []).length
      }
    });

  } catch (error) {
    const logger = createLogger(c.env);
    logger.error('Export error', {
      error: error.message,
      stack: error.stack,
      pixel_id: c.req.param('pixelId'),
      path: c.req.path
    }).catch(() => {});
    return c.json({
      success: false,
      error: 'Failed to export data'
    }, 500);
  }
});

/**
 * GET /realtime/:pixelId - Get real-time statistics
 */
app.get('/realtime/:pixelId', async (c) => {
  try {
    const pixelId = c.req.param('pixelId');
    
    // Validate pixel exists
    const pixel = await c.env.DB.prepare(
      'SELECT * FROM pixels WHERE id = ? AND active = 1'
    ).bind(pixelId).first();

    if (!pixel) {
      return c.json({ success: false, error: 'Pixel not found' }, 404);
    }

    // Get last 24 hours of data
    const endDate = new Date();
    const startDate = new Date();
    startDate.setHours(startDate.getHours() - 24);

    // Get hourly breakdown
    const hourlyStats = await c.env.DB.prepare(`
      SELECT 
        strftime('%Y-%m-%d %H:00:00', timestamp) as hour,
        COUNT(*) as events,
        COUNT(DISTINCT visitor_id) as visitors
      FROM tracking_events 
      WHERE pixel_id = ? 
        AND timestamp >= ? 
        AND timestamp <= ?
        AND archived = 0
      GROUP BY strftime('%Y-%m-%d %H:00:00', timestamp)
      ORDER BY hour DESC
      LIMIT 24
    `).bind(pixelId, startDate.toISOString(), endDate.toISOString()).all();

    // Get recent events
    const recentEvents = await c.env.DB.prepare(`
      SELECT 
        page_url,
        utm_source,
        utm_medium,
        utm_campaign,
        country,
        timestamp
      FROM tracking_events 
      WHERE pixel_id = ? 
        AND timestamp >= ?
        AND archived = 0
      ORDER BY timestamp DESC
      LIMIT 10
    `).bind(pixelId, startDate.toISOString()).all();

    return c.json({
      success: true,
      data: {
        pixel_id: pixelId,
        updated_at: new Date().toISOString(),
        hourly_breakdown: hourlyStats.results || [],
        recent_events: recentEvents.results || []
      }
    });

  } catch (error) {
    const logger = createLogger(c.env);
    logger.error('Real-time analytics error', {
      error: error.message,
      stack: error.stack,
      pixel_id: c.req.param('pixelId'),
      path: c.req.path
    }).catch(() => {});
    return c.json({
      success: false,
      error: 'Failed to retrieve real-time data'
    }, 500);
  }
});

/**
 * GET /metrics - Performance metrics tracking endpoint
 * Provides system health and performance metrics
 */
app.get('/metrics', async (c) => {
  try {
    const logger = createLogger(c.env);
    
    // Get circuit breaker state for Pipedrive API
    const circuitBreaker = getPipedriveCircuitBreaker();
    const breakerState = circuitBreaker.getState();
    
    // Get delayed sync queue stats
    let delayedSyncStats = { pending: 0, total: 0 };
    if (c.env.CACHE) {
      try {
        const keys = await c.env.CACHE.list({ prefix: 'pipedrive_sync:' });
        delayedSyncStats.total = keys.keys.length;
        
        const now = Date.now();
        delayedSyncStats.pending = keys.keys.filter(key => {
          const keyParts = key.name.split(':');
          if (keyParts.length !== 3) return false;
          const scheduledAt = parseInt(keyParts[2]);
          return !isNaN(scheduledAt) && scheduledAt <= now;
        }).length;
      } catch (error) {
        await logger.warn('Failed to get delayed sync stats', { error: error.message }).catch(() => {});
      }
    }
    
    // Get database stats
    const dbStats = await c.env.DB.prepare(`
      SELECT 
        COUNT(*) as total_events,
        COUNT(DISTINCT visitor_id) as unique_visitors,
        COUNT(DISTINCT session_id) as unique_sessions,
        COUNT(DISTINCT pixel_id) as active_pixels
      FROM tracking_events
      WHERE archived = 0
    `).first();
    
    // Get recent error rate (last hour)
    const oneHourAgo = new Date(Date.now() - 3600000).toISOString();
    const errorStats = await c.env.DB.prepare(`
      SELECT 
        COUNT(*) as total_events,
        SUM(CASE WHEN form_data IS NOT NULL THEN 1 ELSE 0 END) as form_submissions
      FROM tracking_events
      WHERE timestamp >= ? AND archived = 0
    `).bind(oneHourAgo).first();
    
    // Get Pipedrive sync stats (from logs or stored metrics)
    const pipedriveStats = {
      circuit_breaker_state: breakerState.state,
      circuit_breaker_failures: breakerState.failureCount,
      circuit_breaker_next_attempt: breakerState.canAttempt ? null : new Date(breakerState.nextAttempt).toISOString(),
      delayed_sync_pending: delayedSyncStats.pending,
      delayed_sync_total: delayedSyncStats.total
    };
    
    return c.json({
      success: true,
      timestamp: new Date().toISOString(),
      metrics: {
        database: {
          total_events: dbStats?.total_events || 0,
          unique_visitors: dbStats?.unique_visitors || 0,
          unique_sessions: dbStats?.unique_sessions || 0,
          active_pixels: dbStats?.active_pixels || 0
        },
        recent_activity: {
          events_last_hour: errorStats?.total_events || 0,
          form_submissions_last_hour: errorStats?.form_submissions || 0
        },
        pipedrive: pipedriveStats,
        system: {
          environment: c.env.ENVIRONMENT || 'production',
          cache_available: !!c.env.CACHE,
          database_available: !!c.env.DB
        }
      }
    });
    
  } catch (error) {
    const logger = createLogger(c.env);
    await logger.error('Metrics error', {
      error: error.message,
      stack: error.stack,
      path: c.req.path
    }).catch(() => {});
    return c.json({
      success: false,
      error: 'Failed to retrieve metrics'
    }, 500);
  }
});

/**
 * GET /debug/utm-analysis - Debug UTM parameter issues
 */
app.get('/debug/utm-analysis', async (c) => {
  try {
    // Get recent events with detailed UTM analysis
    const recentEvents = await c.env.DB.prepare(`
      SELECT 
        id,
        page_url,
        utm_source,
        utm_medium,
        utm_campaign,
        utm_content,
        utm_term,
        gclid,
        fbclid,
        msclkid,
        form_data,
        created_at,
        browser_data,
        device_data
      FROM tracking_events 
      WHERE created_at >= datetime('now', '-48 hours')
      ORDER BY created_at DESC
      LIMIT 100
    `).all();

    // Analyze the data
    const analysis = {
      total_events: recentEvents.results?.length || 0,
      events_with_utm: 0,
      events_with_gclid: 0,
      events_with_form_data: 0,
      events_sent_to_pipedrive: 0,
      utm_sources: {},
      page_url_analysis: {},
      missing_utm_with_params: 0,
      sample_events: []
    };

    // Process each event
    for (const event of recentEvents.results || []) {
      // Count events with UTM data
      if (event.utm_source || event.utm_medium || event.utm_campaign) {
        analysis.events_with_utm++;
      }
      
      if (event.gclid || event.fbclid || event.msclkid) {
        analysis.events_with_gclid++;
      }
      
        if (event.form_data) {
          analysis.events_with_form_data++;
        }
        
        // Count events that would be sent to Pipedrive (form submissions)
        if (event.form_data || event.event_type === 'form_submit') {
          analysis.events_sent_to_pipedrive++;
        }

      // Count UTM sources
      if (event.utm_source) {
        analysis.utm_sources[event.utm_source] = (analysis.utm_sources[event.utm_source] || 0) + 1;
      }

      // Check if URL has UTM parameters but they weren't captured
      if (event.page_url && event.page_url.includes('utm_') && !event.utm_source) {
        analysis.missing_utm_with_params++;
      }

      // Analyze page URLs
      try {
        const url = new URL(event.page_url);
        const hostname = url.hostname;
        analysis.page_url_analysis[hostname] = (analysis.page_url_analysis[hostname] || 0) + 1;
      } catch (e) {
        // Invalid URL
      }

      // Collect sample events for detailed analysis
      if (analysis.sample_events.length < 10) {
        analysis.sample_events.push({
          id: event.id,
          page_url: event.page_url,
          utm_source: event.utm_source,
          utm_medium: event.utm_medium,
          utm_campaign: event.utm_campaign,
          gclid: event.gclid,
          has_form_data: !!event.form_data,
          created_at: event.created_at,
          url_has_utm: event.page_url && event.page_url.includes('utm_'),
          browser_data: event.browser_data ? JSON.parse(event.browser_data) : null
        });
      }
    }

    // Calculate percentages
    analysis.utm_capture_rate = analysis.total_events > 0 
      ? Math.round((analysis.events_with_utm / analysis.total_events) * 100) 
      : 0;
    
    analysis.pipedrive_delivery_rate = analysis.events_with_form_data > 0 
      ? Math.round((analysis.events_sent_to_pipedrive / analysis.events_with_form_data) * 100) 
      : 0;

    return c.json({
      success: true,
      analysis: analysis,
      recommendations: [
        analysis.missing_utm_with_params > 0 ? 
          `Found ${analysis.missing_utm_with_params} events with UTM parameters in URL but not captured - check pixel script UTM extraction` : null,
        analysis.events_with_form_data > analysis.events_sent_to_pipedrive ? 
          `${analysis.events_with_form_data - analysis.events_sent_to_pipedrive} form submissions may not have been sent to Pipedrive - check integration configuration` : null,
        analysis.utm_capture_rate < 50 ? 
          `Low UTM capture rate (${analysis.utm_capture_rate}%) - users may be visiting directly or UTM extraction is failing` : null,
        analysis.events_with_utm === 0 ? 
          'No UTM parameters captured in last 48 hours - check if users are coming from paid ads with UTM parameters' : null
      ].filter(Boolean)
    });

  } catch (error) {
    const logger = createLogger(c.env);
    logger.error('UTM analysis error', {
      error: error.message,
      stack: error.stack,
      pixel_id: c.req.param('pixelId'),
      path: c.req.path
    }).catch(() => {});
    return c.json({
      success: false,
      error: 'Failed to analyze UTM data'
    }, 500);
  }
});

export default app; 