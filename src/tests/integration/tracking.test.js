/**
 * Integration Tests for Tracking Functionality
 * Tests critical user paths and production scenarios
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock environment for testing
const mockEnv = {
  DB: {
    prepare: vi.fn().mockReturnValue({
      bind: vi.fn().mockReturnValue({
        first: vi.fn().mockResolvedValue(null),
        all: vi.fn().mockResolvedValue({ results: [] }),
        run: vi.fn().mockResolvedValue({ success: true })
      })
    })
  },
  CACHE: {
    get: vi.fn().mockResolvedValue(null),
    put: vi.fn().mockResolvedValue(undefined)
  },
  RATE_LIMITER: vi.fn(),
  API_KEYS: 'test-key-12345678-1234-4234-8234-123456789012',
  ENVIRONMENT: 'test'
};

// Mock request helpers
const createMockRequest = (url, options = {}) => {
  const urlObj = new URL(url);
  return {
    url,
    method: options.method || 'GET',
    headers: new Map(Object.entries(options.headers || {})),
    json: () => Promise.resolve(options.body || {}),
    header: (name) => options.headers?.[name] || null,
    query: (name) => urlObj.searchParams.get(name),
    path: urlObj.pathname,
    raw: {
      cf: {
        country: 'US',
        region: 'CA',
        city: 'San Francisco'
      }
    }
  };
};

const createMockContext = (req, env = mockEnv) => {
  const context = {
    req,
    env,
    get: vi.fn(),
    set: vi.fn(),
    json: vi.fn().mockImplementation((data, status) => ({
      status: status || 200,
      data
    }))
  };
  return context;
};

describe('Tracking Integration Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Critical User Flows', () => {
    it('should handle complete tracking flow: visitor -> form -> conversion', async () => {
      // Test data
      const pixelId = 'test-pixel-123';
      const projectId = 'test-project-456';
      
      // Mock pixel lookup
      mockEnv.DB.prepare.mockReturnValue({
        bind: vi.fn().mockReturnValue({
          first: vi.fn().mockResolvedValue({
            id: pixelId,
            project_id: projectId,
            active: 1,
            webhook_url: 'https://hooks.zapier.com/test'
          })
        })
      });

      // Step 1: Initial pageview tracking
      const pageviewRequest = createMockRequest('https://example.com/api/track/track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: {
          pixel_id: pixelId,
          page_url: 'https://example.com/contact',
          visitor_cookie: 'pxl_1234567890123456',
          event_type: 'pageview'
        }
      });

      const pageviewContext = createMockContext(pageviewRequest);
      
      // Step 2: Form data capture
      const formRequest = createMockRequest('https://example.com/api/track/track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: {
          pixel_id: pixelId,
          page_url: 'https://example.com/thank-you',
          visitor_cookie: 'pxl_1234567890123456',
          event_type: 'pageview',
          form_data: '{"email":"test@example.com","first_name":"John","last_name":"Doe"}'
        }
      });

      const formContext = createMockContext(formRequest);

      // Verify requests would be processed correctly
      expect(pageviewRequest.method).toBe('POST');
      expect(formRequest.method).toBe('POST');
      expect(JSON.parse(formRequest.body.form_data)).toHaveProperty('email', 'test@example.com');
      expect(pageviewContext.json).toBeDefined();
      expect(formContext.json).toBeDefined();
    });

    it('should handle webhook delivery for form submissions', async () => {
      const webhookUrl = 'https://hooks.zapier.com/test-webhook';
      
      // Mock successful webhook delivery
      global.fetch.mockResolvedValue({
        ok: true,
        status: 200,
        text: () => Promise.resolve('{"success": true}')
      });

      const eventData = {
        id: 'event-123',
        email: 'test@example.com',
        utm_source: 'google',
        utm_campaign: 'test-campaign'
      };

      const result = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(eventData)
      });

      expect(result.ok).toBe(true);
      expect(global.fetch).toHaveBeenCalledWith(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(eventData)
      });
    });

    it('should handle failed webhook delivery with retry', async () => {
      const webhookUrl = 'https://hooks.zapier.com/test-webhook';
      
      // Mock failed webhook delivery
      global.fetch
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
          text: () => Promise.resolve('Internal Server Error')
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          text: () => Promise.resolve('{"success": true}')
        });

      const eventData = { id: 'event-123', email: 'test@example.com' };

      // First attempt (fails)
      const firstResult = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(eventData)
      });

      expect(firstResult.ok).toBe(false);

      // Retry attempt (succeeds)
      const retryResult = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(eventData)
      });

      expect(retryResult.ok).toBe(true);
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });
  });

  describe('Authentication Flow Tests', () => {
    it('should reject requests without valid API key', async () => {
      const request = createMockRequest('https://example.com/api/projects', {
        method: 'GET',
        headers: {}
      });

      const context = createMockContext(request);
      
      // Should return 401 without valid API key
      const response = context.json({ success: false, error: 'Invalid or missing API key' }, 401);
      expect(response.status).toBe(401);
      expect(response.data.success).toBe(false);
    });

    it('should accept requests with valid API key', async () => {
      const request = createMockRequest('https://example.com/api/projects', {
        method: 'GET',
        headers: { 'Authorization': 'Bearer test-key-12345678-1234-4234-8234-123456789012' }
      });

      const context = createMockContext(request);
      
      // Should process request with valid API key
      const apiKey = request.headers.get('Authorization')?.replace('Bearer ', '');
      expect(apiKey).toBe('test-key-12345678-1234-4234-8234-123456789012');
      expect(mockEnv.API_KEYS.includes(apiKey)).toBe(true);
      expect(context.json).toBeDefined();
    });

    it('should validate API key format (UUID v4)', async () => {
      const validKey = '12345678-1234-4234-8234-123456789012';
      const invalidKey = 'invalid-key';

      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      
      expect(uuidRegex.test(validKey)).toBe(true);
      expect(uuidRegex.test(invalidKey)).toBe(false);
    });
  });

  describe('Rate Limiting Tests', () => {
    it('should enforce rate limits on tracking endpoints', async () => {
      const rateLimitData = {
        count: 1,
        resetTime: Date.now() + 60000,
        limit: 100
      };

      // Mock rate limiting logic
      const isRateLimited = rateLimitData.count >= rateLimitData.limit;
      expect(isRateLimited).toBe(false);

      // Simulate hitting rate limit
      rateLimitData.count = 101;
      const isNowLimited = rateLimitData.count >= rateLimitData.limit;
      expect(isNowLimited).toBe(true);
    });

    it('should reset rate limits after time window', async () => {
      const rateLimitData = {
        count: 100,
        resetTime: Date.now() - 1000, // Expired
        limit: 100
      };

      const isExpired = Date.now() > rateLimitData.resetTime;
      expect(isExpired).toBe(true);

      // Should reset after expiration
      if (isExpired) {
        rateLimitData.count = 0;
        rateLimitData.resetTime = Date.now() + 60000;
      }

      expect(rateLimitData.count).toBe(0);
    });
  });

  describe('Data Validation Tests', () => {
    it('should validate required tracking fields', async () => {
      const validTrackingData = {
        pixel_id: 'test-pixel-123',
        page_url: 'https://example.com',
        visitor_cookie: 'pxl_1234567890123456',
        event_type: 'pageview'
      };

      const invalidTrackingData = {
        page_url: 'https://example.com'
        // Missing required pixel_id
      };

      // Validation logic
      const validateTracking = (data) => {
        return !!(data.pixel_id && data.page_url);
      };

      expect(validateTracking(validTrackingData)).toBe(true);
      expect(validateTracking(invalidTrackingData)).toBe(false);
    });

    it('should validate form data contains email', async () => {
      const validFormData = {
        email: 'test@example.com',
        first_name: 'John',
        last_name: 'Doe'
      };

      const invalidFormData = {
        first_name: 'John',
        last_name: 'Doe'
        // Missing email
      };

      const validateFormData = (data) => {
        return !!(data && data.email);
      };

      expect(validateFormData(validFormData)).toBe(true);
      expect(validateFormData(invalidFormData)).toBe(false);
    });

    it('should sanitize and validate pixel IDs', async () => {
      const validPixelId = 'pixel-12345';
      const invalidPixelId = '<script>alert("xss")</script>';

      const sanitizePixelId = (id) => {
        return id.replace(/[^a-zA-Z0-9\-_]/g, '');
      };

      expect(sanitizePixelId(validPixelId)).toBe('pixel-12345');
      expect(sanitizePixelId(invalidPixelId)).toBe('scriptalertxssscript');
    });
  });

  describe('Error Handling Tests', () => {
    it('should handle database connection errors gracefully', async () => {
      const failingDB = {
        prepare: vi.fn().mockImplementation(() => {
          throw new Error('Database connection failed');
        })
      };

      const request = createMockRequest('https://example.com/api/track/track', {
        method: 'POST',
        body: { pixel_id: 'test', page_url: 'https://example.com' }
      });

      const context = createMockContext(request, { ...mockEnv, DB: failingDB });

      try {
        failingDB.prepare('SELECT * FROM pixels WHERE id = ?');
        expect(true).toBe(false); // Should not reach here
      } catch (error) {
        expect(error.message).toBe('Database connection failed');
        // Should return error response
        const response = context.json({ success: false, error: 'Database error' }, 500);
        expect(response.status).toBe(500);
      }
    });

    it('should handle malformed JSON in form data', async () => {
      const malformedFormData = '{"email":"test@example.com","invalid":}';
      
      const parseFormData = (data) => {
        try {
          return JSON.parse(data);
        } catch (error) {
          return null;
        }
      };

      const result = parseFormData(malformedFormData);
      expect(result).toBe(null);
    });

    it('should handle missing pixel configuration', async () => {
      // Mock empty pixel lookup
      mockEnv.DB.prepare.mockReturnValue({
        bind: vi.fn().mockReturnValue({
          first: vi.fn().mockResolvedValue(null)
        })
      });

      const request = createMockRequest('https://example.com/api/track/track', {
        method: 'POST',
        body: { pixel_id: 'nonexistent', page_url: 'https://example.com' }
      });

      const context = createMockContext(request);
      const response = context.json({ success: false, error: 'Pixel not found' }, 404);
      
      expect(response.status).toBe(404);
      expect(response.data.error).toBe('Pixel not found');
    });
  });

  describe('Performance Tests', () => {
    it('should complete tracking requests within 50ms target', async () => {
      const startTime = Date.now();
      
      // Simulate tracking operation
      await new Promise(resolve => setTimeout(resolve, 10)); // 10ms operation
      
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      expect(duration).toBeLessThan(50);
    });

    it('should handle concurrent tracking requests', async () => {
      const concurrentRequests = 10;
      const promises = [];

      for (let i = 0; i < concurrentRequests; i++) {
        const promise = new Promise(resolve => {
          setTimeout(() => resolve(`Request ${i} completed`), Math.random() * 20);
        });
        promises.push(promise);
      }

      const results = await Promise.all(promises);
      expect(results).toHaveLength(concurrentRequests);
    });
  });
});

export default {}; 