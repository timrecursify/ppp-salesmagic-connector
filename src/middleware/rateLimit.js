/**
 * Rate Limiting Middleware using Durable Objects
 * Replaces Redis-based rate limiting with Cloudflare's Durable Objects
 */

import { createLogger } from '../utils/workerLogger.js';

export class RateLimiter {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.storage = state.storage;
  }

  async fetch(request) {
    const url = new URL(request.url);
    const key = url.searchParams.get('key');
    const limit = parseInt(url.searchParams.get('limit') || '1000');
    const window = parseInt(url.searchParams.get('window') || '3600'); // 1 hour in seconds

    if (!key) {
      return new Response('Missing key parameter', { status: 400 });
    }

    // Get current count and timestamp
    const now = Math.floor(Date.now() / 1000);
    const data = await this.storage.get(key) || { count: 0, resetTime: now + window };

    // Reset if window has passed
    if (now >= data.resetTime) {
      data.count = 0;
      data.resetTime = now + window;
    }

    // Check if over limit
    const isOverLimit = data.count >= limit;
    
    if (!isOverLimit) {
      data.count++;
      await this.storage.put(key, data);
    }

    return new Response(JSON.stringify({
      allowed: !isOverLimit,
      count: data.count,
      limit: limit,
      resetTime: data.resetTime,
      remaining: Math.max(0, limit - data.count)
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

/**
 * Rate limiting middleware factory
 */
export function createRateLimit(options = {}) {
  const {
    windowMs = 3600000, // 1 hour
    max = 1000,
    keyGenerator = (c) => {
      const clientIP = c.req.header('CF-Connecting-IP') || 
                      c.req.header('X-Forwarded-For') || 
                      c.req.header('X-Real-IP') || 
                      'unknown';
      return `rate_limit:${clientIP}`;
    },
    message = 'Too many requests'
  } = options;

  return async (c, next) => {
    try {
      const key = keyGenerator(c);
      
      // Shard rate limiter by IP prefix (first octet) to distribute load
      // Extract first octet of IP for sharding
      const clientIP = c.req.header('CF-Connecting-IP') || 
                      c.req.header('X-Forwarded-For')?.split(',')[0]?.trim() || 
                      c.req.header('X-Real-IP') || 
                      'unknown';
      
      // Create shard key from IP prefix (first octet for IPv4, first 4 hex digits for IPv6)
      let shardKey = 'global';
      if (clientIP !== 'unknown') {
        if (clientIP.includes('.')) {
          // IPv4: use first octet
          const parts = clientIP.split('.');
          if (parts.length >= 1) {
            shardKey = `shard_${parts[0]}`;
          }
        } else if (clientIP.includes(':')) {
          // IPv6: use first 4 hex digits
          const parts = clientIP.split(':');
          if (parts.length >= 1) {
            shardKey = `shard_${parts[0].substring(0, 4)}`;
          }
        }
      }
      
      const rateLimiterId = c.env.RATE_LIMITER.idFromName(shardKey);
      const rateLimiter = c.env.RATE_LIMITER.get(rateLimiterId);

      const response = await rateLimiter.fetch(
        `https://dummy.com/?key=${encodeURIComponent(key)}&limit=${max}&window=${Math.floor(windowMs / 1000)}`
      );

      const result = await response.json();

      // Add rate limit headers
      c.header('X-RateLimit-Limit', max.toString());
      c.header('X-RateLimit-Remaining', result.remaining.toString());
      c.header('X-RateLimit-Reset', result.resetTime.toString());

      if (!result.allowed) {
        return c.json({
          success: false,
          error: message,
          retryAfter: result.resetTime - Math.floor(Date.now() / 1000)
        }, 429);
      }

      await next();
    } catch (error) {
      const logger = createLogger(c.env);
      logger.error('Rate limiting error', {
        error: error.message,
        stack: error.stack,
        path: c.req.path,
        method: c.req.method
      }).catch(() => {});
      // On error, allow request to proceed
      await next();
    }
  };
}

// Pre-configured rate limiters for different endpoint types
export const trackingRateLimit = createRateLimit({
  windowMs: 60000, // 1 minute
  max: 100, // 100 requests per minute per IP
  message: 'Too many tracking requests'
});

export const apiRateLimit = createRateLimit({
  windowMs: 3600000, // 1 hour
  max: 1000, // 1000 requests per hour per IP
  message: 'API rate limit exceeded'
});

export const managementRateLimit = createRateLimit({
  windowMs: 3600000, // 1 hour
  max: 100, // 100 requests per hour per IP
  message: 'Management API rate limit exceeded'
}); 