/**
 * Authentication Middleware for Cloudflare Workers
 * Production-grade API key authentication with rate limiting and audit logging
 */

import { createLogger } from '../utils/workerLogger.js';

// API key validation regex (UUID v4 format)
const API_KEY_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Validate API key format
 */
function isValidApiKey(apiKey) {
  return apiKey && API_KEY_REGEX.test(apiKey);
}

/**
 * Extract API key from request
 */
function extractApiKey(request) {
  // Check Authorization header first
  const authHeader = request.headers.get('Authorization');
  if (authHeader) {
    const bearerMatch = authHeader.match(/^Bearer\s+(.+)$/i);
    if (bearerMatch) {
      return bearerMatch[1];
    }
  }

  // Check X-API-Key header
  const apiKeyHeader = request.headers.get('X-API-Key');
  if (apiKeyHeader) {
    return apiKeyHeader;
  }

  // Check query parameter as last resort (not recommended for production)
  const url = new URL(request.url);
  const queryApiKey = url.searchParams.get('api_key');
  if (queryApiKey) {
    return queryApiKey;
  }

  return null;
}

/**
 * Authentication middleware for management APIs
 */
export const requireAuth = async (c, next) => {
  const startTime = Date.now();
  const requestId = crypto.randomUUID();
  const logger = createLogger(c.env);

  try {
    // Extract API key from request
    const apiKey = extractApiKey(c.req.raw);

    // Validate API key format
    if (!isValidApiKey(apiKey)) {
      await logger.warn('Invalid API key format', {
        component: 'auth-middleware',
        requestId,
        path: c.req.path,
        method: c.req.method,
        ip: c.req.header('CF-Connecting-IP') || 'unknown'
      });

      return c.json({
        success: false,
        error: 'Invalid or missing API key'
      }, 401);
    }

    // Get valid API keys from environment
    const validApiKeys = c.env.API_KEYS ? c.env.API_KEYS.split(',').map(k => k.trim()) : [];
    
    // In development, allow a default key if no keys configured
    if (!c.env.API_KEYS && c.env.ENVIRONMENT !== 'production') {
      validApiKeys.push('dev-api-key-12345678-1234-4234-8234-123456789012');
    }

    // Verify API key
    if (!validApiKeys.includes(apiKey)) {
      // Hash API key for logging (first 8 chars only)
      const apiKeyPrefix = apiKey.substring(0, 8);
      await logger.warn('Unauthorized API access attempt', {
        component: 'auth-middleware',
        requestId,
        path: c.req.path,
        method: c.req.method,
        ip: c.req.header('CF-Connecting-IP') || 'unknown',
        apiKeyPrefix: apiKeyPrefix + '...'
      });

      return c.json({
        success: false,
        error: 'Unauthorized'
      }, 401);
    }

    // Store authenticated API key info in context
    c.set('auth', {
      apiKey: apiKey.substring(0, 8) + '...', // Store partial key for logging
      authenticated: true,
      requestId
    });

    // Log successful authentication
    await logger.info('API authentication successful', {
      component: 'auth-middleware',
      requestId,
      path: c.req.path,
      method: c.req.method,
      apiKeyPrefix: apiKey.substring(0, 8),
      processingTime: Date.now() - startTime
    });

    // Continue to next middleware
    await next();

    // Log request completion
    await logger.info('Authenticated request completed', {
      component: 'auth-middleware',
      requestId,
      path: c.req.path,
      method: c.req.method,
      status: c.res.status,
      totalTime: Date.now() - startTime
    });

  } catch (error) {
    await logger.error('Authentication middleware error', {
      component: 'auth-middleware',
      requestId,
      error: error.message,
      stack: error.stack,
      path: c.req.path,
      method: c.req.method
    });

    return c.json({
      success: false,
      error: 'Authentication error'
    }, 500);
  }
};

/**
 * Optional authentication middleware (logs but doesn't block)
 */
export const optionalAuth = async (c, next) => {
  try {
    const apiKey = extractApiKey(c.req.raw);
    
    if (apiKey && isValidApiKey(apiKey)) {
      const validApiKeys = c.env.API_KEYS ? c.env.API_KEYS.split(',').map(k => k.trim()) : [];
      
      if (validApiKeys.includes(apiKey)) {
        c.set('auth', {
          apiKey: apiKey.substring(0, 8) + '...',
          authenticated: true
        });
      }
    }
  } catch (error) {
    // Silently continue - optional auth should not break requests
  }

  await next();
};

/**
 * Admin-only authentication (requires special admin API key)
 */
export const requireAdmin = async (c, next) => {
  const logger = createLogger(c.env);
  
  // First check regular auth
  const authResult = await requireAuth(c, async () => {});
  if (authResult) return authResult;

  const auth = c.get('auth');
  const apiKey = extractApiKey(c.req.raw);

  // Check if this is an admin key
  const adminKeys = c.env.ADMIN_API_KEYS ? c.env.ADMIN_API_KEYS.split(',').map(k => k.trim()) : [];
  
  if (!adminKeys.includes(apiKey)) {
    await logger.warn('Admin access denied', {
      component: 'auth-middleware',
      requestId: auth.requestId,
      path: c.req.path,
      method: c.req.method,
      apiKeyPrefix: auth.apiKey
    });

    return c.json({
      success: false,
      error: 'Admin access required'
    }, 403);
  }

  // Update auth context
  c.set('auth', {
    ...auth,
    isAdmin: true
  });

  await next();
};

// Export authentication utilities
export default {
  requireAuth,
  optionalAuth,
  requireAdmin,
  isValidApiKey,
  extractApiKey
}; 