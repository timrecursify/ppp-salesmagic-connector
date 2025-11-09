/**
 * Security Middleware for Cloudflare Workers
 * Implements security headers and input validation
 */

import { createLogger } from '../utils/workerLogger.js';

/**
 * Security headers middleware
 */
export const securityHeaders = async (c, next) => {
  await next();

  // Security headers
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('X-Frame-Options', 'DENY');
  c.header('X-XSS-Protection', '1; mode=block');
  c.header('Referrer-Policy', 'strict-origin-when-cross-origin');
  c.header('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  
  // Content Security Policy
  const csp = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https:",
    "connect-src 'self' https:",
    "font-src 'self'",
    "object-src 'none'",
    "media-src 'none'",
    "frame-src 'none'"
  ].join('; ');
  
  c.header('Content-Security-Policy', csp);

  // Strict Transport Security (for HTTPS)
  if (c.req.header('cf-visitor')?.includes('https')) {
    c.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  }
};

/**
 * Input validation utilities
 */
export const validators = {
  // URL validation
  isValidURL: (url) => {
    try {
      const parsed = new URL(url);
      return ['http:', 'https:'].includes(parsed.protocol);
    } catch {
      return false;
    }
  },

  // UTM parameter validation
  isValidUTMParam: (param) => {
    if (!param || typeof param !== 'string') return false;
    
    // Check length
    if (param.length > 500) return false;
    
    // Check for dangerous characters
    const dangerousPattern = /<script|javascript:|data:|vbscript:|on\w+=/i;
    return !dangerousPattern.test(param);
  },

  // Cookie validation
  isValidCookie: (cookie) => {
    if (!cookie || typeof cookie !== 'string') return false;
    return /^pxl_[a-f0-9]{16}$/.test(cookie);
  },

  // Pixel ID validation
  isValidPixelId: (pixelId) => {
    if (!pixelId || typeof pixelId !== 'string') return false;
    // UUID-like format or custom format
    return /^[a-zA-Z0-9\-_]{8,64}$/.test(pixelId);
  },

  // User agent validation
  isValidUserAgent: (userAgent) => {
    if (!userAgent || typeof userAgent !== 'string') return false;
    if (userAgent.length > 1000) return false;
    
    // Check for suspicious patterns
    const suspiciousPattern = /<script|javascript:|data:/i;
    return !suspiciousPattern.test(userAgent);
  },

  // IP address validation
  isValidIP: (ip) => {
    if (!ip || typeof ip !== 'string') return false;
    
    // IPv4 pattern
    const ipv4Pattern = /^(\d{1,3}\.){3}\d{1,3}$/;
    // IPv6 pattern (simplified)
    const ipv6Pattern = /^([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$/;
    
    return ipv4Pattern.test(ip) || ipv6Pattern.test(ip);
  },

  // JSON validation
  isValidJSON: (str) => {
    try {
      JSON.parse(str);
      return true;
    } catch {
      return false;
    }
  }
};

/**
 * Input sanitization utilities
 */
export const sanitizers = {
  // HTML entity encoding
  escapeHTML: (str) => {
    if (!str || typeof str !== 'string') return '';
    
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  },

  // URL encoding
  encodeURL: (str) => {
    if (!str || typeof str !== 'string') return '';
    return encodeURIComponent(str);
  },

  // Trim and normalize whitespace
  normalizeString: (str) => {
    if (!str || typeof str !== 'string') return '';
    return str.trim().replace(/\s+/g, ' ').substring(0, 1000);
  },

  // Clean UTM parameters
  cleanUTMParam: (param) => {
    if (!param || typeof param !== 'string') return null;
    
    // Remove dangerous characters
    const cleaned = param
      .replace(/<script.*?>.*?<\/script>/gi, '')
      .replace(/javascript:/gi, '')
      .replace(/data:/gi, '')
      .replace(/vbscript:/gi, '')
      .replace(/on\w+=/gi, '')
      .trim();
    
    return cleaned.length > 0 && cleaned.length <= 500 ? cleaned : null;
  },

  // Clean form data JSON
  cleanFormData: (formDataInput) => {
    // Accept both string (JSON) and object
    let formDataString = null;
    
    if (formDataInput === null || formDataInput === undefined) {
      return null;
    }
    
    if (typeof formDataInput === 'string') {
      formDataString = formDataInput;
      
      // Handle double-stringified JSON (bug in pixel.js)
      // If the string looks like JSON but parses to another JSON string, parse again
      try {
        const firstParse = JSON.parse(formDataString);
        if (typeof firstParse === 'string') {
          // It's double-stringified, parse again
          try {
            const secondParse = JSON.parse(firstParse);
            if (typeof secondParse === 'object' && !Array.isArray(secondParse)) {
              formDataString = JSON.stringify(secondParse);
            }
          } catch (e) {
            // Not valid JSON, use original
          }
        } else {
          // Already parsed correctly
          formDataString = JSON.stringify(firstParse);
        }
      } catch (e) {
        // Not valid JSON string, try to use as-is
      }
    } else if (typeof formDataInput === 'object') {
      // Convert object to JSON string
      try {
        formDataString = JSON.stringify(formDataInput);
      } catch (e) {
        return null;
      }
    } else {
      return null;
    }
    
    if (!formDataString || formDataString.length === 0) {
      return null;
    }
    
    try {
      // Parse to validate JSON structure
      const formData = JSON.parse(formDataString);
      
      // Validate it's an object
      if (typeof formData !== 'object' || Array.isArray(formData)) {
        return null;
      }
      
      // Clean all fields - accept all form fields but maintain strict sanitization
      // Normalize field names for consistency (first-name -> first_name, etc.)
      function normalizeFieldName(key) {
        if (!key || typeof key !== 'string') return null;
        // Convert hyphens to underscores, lowercase
        return key.toLowerCase().trim().replace(/-/g, '_');
      }
      
      // Check if field name indicates email (for validation)
      function isEmailField(name) {
        if (!name) return false;
        const normalized = name.toLowerCase();
        return normalized.indexOf('email') !== -1 || 
               normalized.indexOf('mail') !== -1 ||
               normalized === 'e-mail' ||
               normalized === 'e_mail';
      }
      
      const cleanedData = {};
      let hasEmail = false;
      
      for (const [key, value] of Object.entries(formData)) {
        // Validate key
        if (typeof key !== 'string' || key.length === 0 || key.length > 100) {
          continue; // Skip invalid keys
        }
        
        // Normalize field name
        const normalizedKey = normalizeFieldName(key);
        if (!normalizedKey) continue;
        
        // Sanitize key (remove dangerous chars but keep hyphens, underscores, etc.)
        const cleanKey = normalizedKey.replace(/[<>'"]/g, '').trim();
        if (!cleanKey) continue;
        
        // Check for email field (for validation requirement)
        if (isEmailField(cleanKey) || cleanKey === 'email') {
          hasEmail = true;
        }
        
        // Accept string, number, boolean, or null values
        if (value === null || value === undefined) {
          cleanedData[cleanKey] = null;
        } else if (typeof value === 'string') {
          // Sanitize string values (XSS protection)
          const cleanValue = value
            .replace(/<script.*?>.*?<\/script>/gi, '')
            .replace(/javascript:/gi, '')
            .replace(/data:/gi, '')
            .replace(/vbscript:/gi, '')
            .replace(/on\w+=/gi, '')
            .trim();
          
          // Store if non-empty and within length limit
          if (cleanValue.length > 0 && cleanValue.length <= 2000) {
            cleanedData[cleanKey] = cleanValue;
          }
        } else if (typeof value === 'number') {
          // Accept numbers (convert to string for storage)
          cleanedData[cleanKey] = String(value);
        } else if (typeof value === 'boolean') {
          // Accept booleans (convert to string)
          cleanedData[cleanKey] = String(value);
        }
        // Skip arrays and objects (too complex to sanitize safely)
      }
      
      // Normalize email field name if present
      for (const key in cleanedData) {
        if (isEmailField(key) && key !== 'email') {
          cleanedData.email = cleanedData[key];
          // Keep original key too if it's different (e.g., email_address)
          // This preserves field structure while ensuring email is accessible
        }
      }
      
      // Only return if we have at least email (required for Pipedrive search)
      if (!hasEmail && !cleanedData.email) {
        return null; // Require email field
      }
      
      // Return JSON string if we have valid data
      return Object.keys(cleanedData).length > 0 ? JSON.stringify(cleanedData) : null;
      
    } catch (error) {
      return null;
    }
  }
};

/**
 * Request validation middleware
 */
export const validateTrackingRequest = async (c, next) => {
  let body;
  
  try {
    body = await c.req.json();
  } catch (error) {
    // Log validation error (but don't expose details to client)
    const logger = createLogger(c.env);
    logger.error('Validation error - invalid JSON', {
      error: error.message,
      path: c.req.path,
      method: c.req.method
    }).catch(() => {});
    return c.json({
      success: false,
      error: 'Invalid request format - expected JSON'
    }, 400);
  }

  const errors = [];

  // Validate required fields
  if (!body.pixel_id) {
    errors.push('pixel_id is required');
  } else if (!validators.isValidPixelId(body.pixel_id)) {
    errors.push('Invalid pixel_id format');
  }

  if (!body.page_url) {
    errors.push('page_url is required');
  } else if (!validators.isValidURL(body.page_url)) {
    errors.push('Invalid page_url format');
  }

  // Validate optional fields
  if (body.referrer_url && !validators.isValidURL(body.referrer_url)) {
    errors.push('Invalid referrer_url format');
  }

  // Validate UTM parameters
  const utmParams = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'];
  for (const param of utmParams) {
    if (body[param] && !validators.isValidUTMParam(body[param])) {
      errors.push(`Invalid ${param} format`);
    }
  }

  // Validate visitor cookie
  if (body.visitor_cookie && !validators.isValidCookie(body.visitor_cookie)) {
    errors.push('Invalid visitor_cookie format');
  }

  // Validate form data if present - be more permissive
  if (body.form_data !== undefined && body.form_data !== null && body.form_data !== '') {
    // Accept form_data as either JSON string or object
    if (typeof body.form_data === 'string') {
      // String might be JSON string or already stringified
      if (body.form_data.trim().length > 0 && !validators.isValidJSON(body.form_data)) {
        // If it's not valid JSON, it might be a plain string - allow it
        // This handles edge cases where form_data is sent as plain string
      }
    } else if (typeof body.form_data === 'object') {
      // Allow object - will be stringified in cleanFormData
    }
    // Don't reject other types - let cleanFormData handle it
  }

  if (errors.length > 0) {
    return c.json({
      success: false,
      error: 'Validation failed',
      details: errors
    }, 400);
  }

  // Sanitize and store validated data
  c.set('validatedData', {
    ...body,
    utm_source: sanitizers.cleanUTMParam(body.utm_source),
    utm_medium: sanitizers.cleanUTMParam(body.utm_medium),
    utm_campaign: sanitizers.cleanUTMParam(body.utm_campaign),
    utm_content: sanitizers.cleanUTMParam(body.utm_content),
    utm_term: sanitizers.cleanUTMParam(body.utm_term),
    page_title: sanitizers.normalizeString(body.page_title),
    form_data: sanitizers.cleanFormData(body.form_data),
    // Explicitly preserve viewport and screen data from pixel
    viewport: body.viewport && typeof body.viewport === 'object' 
      ? {
          width: typeof body.viewport.width === 'number' ? body.viewport.width : (parseInt(body.viewport.width) || null),
          height: typeof body.viewport.height === 'number' ? body.viewport.height : (parseInt(body.viewport.height) || null)
        }
      : null,
    screen: body.screen && typeof body.screen === 'object'
      ? {
          width: typeof body.screen.width === 'number' ? body.screen.width : (parseInt(body.screen.width) || null),
          height: typeof body.screen.height === 'number' ? body.screen.height : (parseInt(body.screen.height) || null)
        }
      : null,
    user_agent: c.req.header('User-Agent') || 'unknown'
  });

  // Continue to next middleware/handler
  return await next();
};

/**
 * Content-Type validation middleware
 */
export const validateContentType = (expectedType = 'application/json') => {
  return async (c, next) => {
    const contentType = c.req.header('Content-Type');
    
    if (c.req.method === 'POST' && !contentType?.includes(expectedType)) {
      return c.json({
        success: false,
        error: `Expected Content-Type: ${expectedType}`
      }, 400);
    }

    return await next();
  };
};

/**
 * Request size limiting middleware
 */
export const limitRequestSize = (maxSize = 10240) => { // 10KB default
  return async (c, next) => {
    const contentLength = c.req.header('Content-Length');
    
    if (contentLength && parseInt(contentLength) > maxSize) {
      return c.json({
        success: false,
        error: 'Request entity too large'
      }, 413);
    }

    return await next();
  };
};

/**
 * Bot detection middleware - Enhanced to block bots
 */
export const detectBots = async (c, next) => {
  const userAgent = c.req.header('User-Agent') || '';
  
  // Comprehensive bot patterns including search engine crawlers and ad bots
  const botPatterns = [
    // Search engine bots
    /AdsBot-Google/i,
    /Googlebot/i,
    /bingbot/i,
    /YandexBot/i,
    /DuckDuckBot/i,
    /BaiduSpider/i,
    /SeznamBot/i,
    
    // Social media bots
    /facebookexternalhit/i,
    /twitterbot/i,
    /linkedinbot/i,
    /WhatsApp/i,
    /Telegram/i,
    /Applebot/i,
    /Slackbot/i,
    
    // Monitoring and testing tools
    /GTmetrix/i,
    /Pingdom/i,
    /UptimeRobot/i,
    /StatusCake/i,
    /Site24x7/i,
    /Monitor/i,
    /Uptime/i,
    /PageSpeed/i,
    /Lighthouse/i,
    /WebPageTest/i,
    
    // Generic bot patterns
    /bot/i,
    /crawler/i,
    /spider/i,
    /scraper/i,
    /monitor/i,
    /check/i,
    /test/i,
    
    // Automated tools
    /curl/i,
    /wget/i,
    /python/i,
    /java/i,
    /php/i,
    /node/i,
    /perl/i
  ];

  const isBot = botPatterns.some(pattern => pattern.test(userAgent));
  
  // Additional bot detection checks
  const isAutomated = userAgent.includes('HeadlessChrome') ||
                     userAgent.includes('PhantomJS') ||
                     userAgent.includes('Selenium') ||
                     userAgent.includes('automation');
  
  if (isBot || isAutomated) {
    // Log bot access for monitoring
    const logger = createLogger(c.env);
    logger.info('Bot request blocked', {
      userAgent: userAgent,
      ip: c.req.header('CF-Connecting-IP') || 'unknown',
      url: c.req.url,
      path: c.req.path,
      method: c.req.method
    }).catch(() => {});
    
    // Return empty response for bots - don't waste resources
    return c.text('', 204);
  }
  
  // Store bot detection result for legitimate requests
  c.set('isBot', false);
  c.set('botUserAgent', null);

  return await next();
}; 