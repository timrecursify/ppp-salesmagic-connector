/**
 * PPP Tracking Pixel - Cloudflare Worker Implementation
 * High-performance tracking pixel with D1 database and Pipedrive integration
 * Performance target: <50ms response time, zero Core Web Vitals impact
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import trackingRoutes from './routes/tracking.js';
import analyticsRoutes from './routes/analytics.js';
import projectRoutes from './routes/projects.js';
import { RateLimiter } from './middleware/rateLimit.js';
import { securityHeaders } from './middleware/security.js';
import { privacyMiddleware } from './middleware/privacy.js';
import { createLogger } from './utils/workerLogger.js';
import { fetchWithRetry } from './utils/fetchWithRetry.js';
import pixelJS from './static/pixel.js';
import integrationHTML from './static/integration-example.html';

// Initialize Hono app
const app = new Hono();

// Global middleware
// Note: Hono logger disabled in production - use structured logging via workerLogger instead
// app.use('*', logger()); // Disabled for production - verbose console output
app.use('*', securityHeaders);

// CORS configuration for tracking pixel
app.use('*', cors({
  origin: ['*'], // Allow all origins for tracking pixel embedding
  allowMethods: ['GET', 'POST', 'OPTIONS'],
  allowHeaders: [
    'Content-Type',
    'Authorization',
    'X-Requested-With',
    'DNT',
    'Sec-GPC'
  ],
  maxAge: 86400
}));

// Privacy middleware
app.use('*', privacyMiddleware);

// Health check endpoint
app.get('/health', (_c) => {
  return _c.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    worker: 'PPP_Pixel',
    version: '1.0.0',
    uptime: Date.now() - _c.env.START_TIME || 0
  });
});

// Root endpoint with API information
app.get('/', (_c) => {
  return _c.json({
    name: 'PPP Tracking Pixel API',
    version: '1.0.0',
    description: 'Production-grade tracking pixel system on Cloudflare Workers',
    environment: _c.env.ENVIRONMENT || 'production',
    timestamp: new Date().toISOString(),
    endpoints: {
      health: '/health',
      tracking: '/api/track/*',
      analytics: '/api/analytics/* (requires authentication)',
      projects: '/api/projects/* (requires authentication)',
      pixel_script: '/static/pixel.js',
      integration_guide: '/static/integration-example.html'
    },
    authentication: {
      type: 'API Key',
      header: 'Authorization: Bearer <api-key> or X-API-Key: <api-key>',
      format: 'UUID v4 format (e.g., 12345678-1234-4234-8234-123456789012)',
      required_for: ['analytics', 'projects'],
      documentation: '/static/integration-example.html#authentication'
    },
    features: [
      'API Key Authentication',
      'GDPR Compliance',
      'Real-time Analytics',
      'Pipedrive Integration',
      'D1 Database Storage',
      'KV Caching',
      'Performance Monitoring',
      'Security Headers',
      'Rate Limiting',
      'Geographic Tracking',
      'Auto-archival (180 days)'
    ]
  });
});

// Serve static pixel.js
app.get('/static/pixel.js', async (_c) => {
  return new Response(pixelJS, {
    headers: {
      'Content-Type': 'application/javascript',
      'Cache-Control': 'no-cache, no-store, must-revalidate, max-age=0',
      'Pragma': 'no-cache',
      'Expires': '0'
    }
  });
});

// Redirect /pixel.js to /static/pixel.js for backward compatibility
app.get('/pixel.js', async (_c) => {
  return new Response(pixelJS, {
    headers: {
      'Content-Type': 'application/javascript',
      'Cache-Control': 'public, max-age=86400, immutable'
    }
  });
});

// Serve integration example
app.get('/static/integration-example.html', async (_c) => {
  return new Response(integrationHTML, {
    headers: {
      'Content-Type': 'text/html',
      'Cache-Control': 'public, max-age=3600'
    }
  });
});

// API Routes with rate limiting
app.route('/api/track', trackingRoutes);
app.route('/api/analytics', analyticsRoutes);
app.route('/api/projects', projectRoutes);

// 404 handler
app.notFound((c) => {
  return c.json({
    success: false,
    error: 'Route not found',
    path: c.req.path,
    method: c.req.method
  }, 404);
});

// Global error handler
app.onError((error, c) => {
  const logger = createLogger(c.env);
  logger.error('Worker error:', {
    error: error.message,
    stack: error.stack,
    path: c.req.path,
    method: c.req.method,
    cf: c.req.raw.cf
  });

  // Don't leak error details in production
  const isDev = c.env.ENVIRONMENT === 'development';
  
  return c.json({
    success: false,
    error: isDev ? error.message : 'Internal server error',
    timestamp: new Date().toISOString()
  }, 500);
});

// Export the Durable Object for rate limiting
export { RateLimiter } from './middleware/rateLimit.js';

// Export the Worker
export default {
  async fetch(request, env, ctx) {
    // Add environment and context to the app
    env.START_TIME = env.START_TIME || Date.now();
    env.executionCtx = ctx;
    
    // Pass execution context properly to Hono
    return app.fetch(request, env, ctx);
  },

  // Scheduled handler for cleanup and archival
  async scheduled(controller, env, ctx) {
    const logger = createLogger(env);
    const startTime = Date.now();
    
    await logger.info('Scheduled worker execution started', {
      component: 'scheduled-worker',
      cron: controller.cron,
      scheduled_time: new Date(controller.scheduledTime).toISOString(),
      execution_time: new Date().toISOString(),
      trigger_type: 'cron'
    });
    
    // Process delayed Pipedrive syncs first
    try {
      const { processDelayedSyncs } = await import('./services/pipedrive-delayed.service.js');
      const syncResult = await processDelayedSyncs(env);
      
      // Always log result, even if nothing was processed
      await logger.info('Scheduled worker - delayed Pipedrive syncs processed', {
        component: 'scheduled-worker',
        processed: syncResult.processed,
        failed: syncResult.failed,
        total: syncResult.processed + syncResult.failed,
        duration_ms: Date.now() - startTime,
        success_rate: syncResult.processed + syncResult.failed > 0 
          ? `${Math.round((syncResult.processed / (syncResult.processed + syncResult.failed)) * 100)}%`
          : 'N/A'
      });
    } catch (error) {
      await logger.error('Failed to process delayed syncs', {
        component: 'scheduled-worker',
        error: error.message,
        stack: error.stack,
        duration_ms: Date.now() - startTime
      });
    }
    
    // Cleanup and archival
    try {
      // Archive old data (older than ARCHIVE_DAYS)
      const rawArchiveDays = parseInt(env.ARCHIVE_DAYS || '180');
      const archiveDays = Math.min(Math.max(isNaN(rawArchiveDays) ? 180 : rawArchiveDays, 1), 365);
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - archiveDays);
      
      // Mark old events for archival
      const stmt = env.DB.prepare(`
        UPDATE tracking_events 
        SET archived = 1 
        WHERE created_at < ? AND archived = 0
      `);
      
      const result = await stmt.bind(cutoffDate.toISOString()).run();
      
      if (result.changes > 0) {
        await logger.info(`Marked ${result.changes} events for archival`);
        
        // Send to archive endpoint if configured
        if (env.ARCHIVE_ENDPOINT) {
          const archiveData = await env.DB.prepare(`
            SELECT * FROM tracking_events 
            WHERE archived = 1
            LIMIT 1000
          `).all();
          
          if (archiveData.results.length > 0) {
            try {
              const archiveResponse = await fetchWithRetry(
                env.ARCHIVE_ENDPOINT,
                {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    events: archiveData.results,
                    timestamp: new Date().toISOString()
                  })
                },
                {
                  timeout: 10000, // 10 second timeout for archive
                  maxRetries: 2,
                  initialDelay: 2000,
                  shouldRetry: (error, response) => {
                    // Retry on network errors or 5xx errors
                    if (error) return true;
                    if (response && response.status >= 500) return true;
                    return false;
                  }
                }
              );
              
              // Only delete after confirming archive succeeded
              if (archiveResponse.ok) {
                try {
                  const archiveResult = await archiveResponse.json();
                  if (archiveResult.success !== false) {
                    // Delete successfully archived events
                    await env.DB.prepare(`
                      DELETE FROM tracking_events 
                      WHERE archived = 1
                    `).run();
                  } else {
                    await logger.warn('Archive endpoint returned failure, not deleting events', {
                      archive_response: archiveResult
                    });
                  }
                } catch (parseError) {
                  await logger.error('Failed to parse archive response', {
                    error: parseError.message,
                    status: archiveResponse.status
                  });
                  // Don't delete if we can't verify success
                }
              } else {
                await logger.error('Archive endpoint returned non-OK status, not deleting events', {
                  status: archiveResponse.status,
                  statusText: archiveResponse.statusText
                });
              }
              
              await logger.info(`Archived and deleted ${archiveData.results.length} events`);
            } catch (archiveError) {
              await logger.error('Archive endpoint failed', {
                error: archiveError.message,
                stack: archiveError.stack,
                archive_endpoint: env.ARCHIVE_ENDPOINT,
                events_count: archiveData.results.length
              });
            }
          }
        }
      }
      
      // Clean up old sessions (older than 30 days)
      const sessionCutoff = new Date();
      sessionCutoff.setDate(sessionCutoff.getDate() - 30);
      
      const sessionCleanup = await env.DB.prepare(`
        DELETE FROM sessions 
        WHERE last_activity < ?
      `).bind(sessionCutoff.toISOString()).run();
      
      if (sessionCleanup.changes > 0) {
        await logger.info(`Cleaned up ${sessionCleanup.changes} old sessions`, {
          sessions_deleted: sessionCleanup.changes,
          cutoff_date: sessionCutoff.toISOString()
        });
      }
      
    } catch (error) {
      await logger.error('Scheduled cleanup failed', {
        error: error.message,
        stack: error.stack,
        task: 'scheduled_cleanup'
      });
    }
  }
}; 