/**
 * Frontend Logger Unit Tests
 * Tests for log level gating, PII hashing, and environment detection
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Logger } from '../utils/logger.js';

// Mock environment variables
const mockEnv = {
  VITE_LOG_LEVEL: 'debug',
  VITE_MODE: 'development',
  NODE_ENV: 'test'
};

// Mock console methods
const mockConsole = {
  log: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn()
};

// Mock window and DOM
const mockWindow = {
  location: {
    href: 'https://test.example.com/test-page',
    hostname: 'test.example.com'
  }
};

// Mock sessionStorage
const mockSessionStorage = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn()
};

describe('Frontend Logger', () => {
  let logger;
  let originalConsole;
  let originalWindow;
  let originalSessionStorage;

  beforeEach(() => {
    // Store original globals
    originalConsole = global.console;
    originalWindow = global.window;
    originalSessionStorage = global.sessionStorage;

    // Mock globals
    global.console = mockConsole;
    global.window = mockWindow;
    global.sessionStorage = mockSessionStorage;

    // Mock import.meta.env
    vi.stubGlobal('import.meta', {
      env: mockEnv
    });

    // Reset all mocks
    vi.clearAllMocks();
    
    // Create fresh logger instance
    logger = new Logger();
  });

  afterEach(() => {
    // Restore original globals
    global.console = originalConsole;
    global.window = originalWindow;
    global.sessionStorage = originalSessionStorage;
    
    // Clear all mocks
    vi.clearAllMocks();
  });

  describe('Environment Detection', () => {
    it('should detect development environment', () => {
      expect(logger.environment).toBe('development');
      expect(logger.currentLevel).toBe('debug');
    });

    it('should detect production environment', () => {
      mockEnv.VITE_MODE = 'production';
      const prodLogger = new Logger();
      
      expect(prodLogger.environment).toBe('production');
      expect(prodLogger.currentLevel).toBe('warn');
    });

    it('should use custom log level from environment', () => {
      mockEnv.VITE_LOG_LEVEL = 'error';
      const customLogger = new Logger();
      
      expect(customLogger.currentLevel).toBe('error');
    });
  });

  describe('Log Level Gating', () => {
    it('should log debug messages when level is debug', () => {
      logger.currentLevel = 'debug';
      
      logger.debug('Test debug message');
      expect(mockConsole.log).toHaveBeenCalledWith(
        expect.stringContaining('[DEBUG]'),
        'Test debug message',
        expect.any(Object)
      );
    });

    it('should not log debug messages when level is info', () => {
      logger.currentLevel = 'info';
      
      logger.debug('Test debug message');
      expect(mockConsole.log).not.toHaveBeenCalled();
    });

    it('should log info messages when level is info', () => {
      logger.currentLevel = 'info';
      
      logger.info('Test info message');
      expect(mockConsole.info).toHaveBeenCalledWith(
        expect.stringContaining('[INFO]'),
        'Test info message',
        expect.any(Object)
      );
    });

    it('should log warn messages when level is warn', () => {
      logger.currentLevel = 'warn';
      
      logger.warn('Test warn message');
      expect(mockConsole.warn).toHaveBeenCalledWith(
        expect.stringContaining('[WARN]'),
        'Test warn message',
        expect.any(Object)
      );
    });

    it('should log error messages at all levels', () => {
      logger.currentLevel = 'error';
      
      logger.error('Test error message');
      expect(mockConsole.error).toHaveBeenCalledWith(
        expect.stringContaining('[ERROR]'),
        'Test error message',
        expect.any(Object)
      );
    });
  });

  describe('PII Hashing', () => {
    it('should hash email addresses', () => {
      const data = { email: 'test@example.com', name: 'John Doe' };
      const hashed = logger.hashPII(data);
      
      expect(hashed).not.toHaveProperty('email');
      expect(hashed).toHaveProperty('email_hash');
      expect(hashed.email_hash).toMatch(/^hash_[a-f0-9]+$/);
      expect(hashed.name).toBe('John Doe');
    });

    it('should hash phone numbers', () => {
      const data = { phone: '+1234567890', name: 'John Doe' };
      const hashed = logger.hashPII(data);
      
      expect(hashed).not.toHaveProperty('phone');
      expect(hashed).toHaveProperty('phone_hash');
      expect(hashed.phone_hash).toMatch(/^hash_[a-f0-9]+$/);
      expect(hashed.name).toBe('John Doe');
    });

    it('should hash both email and phone', () => {
      const data = { email: 'test@example.com', phone: '+1234567890' };
      const hashed = logger.hashPII(data);
      
      expect(hashed).not.toHaveProperty('email');
      expect(hashed).not.toHaveProperty('phone');
      expect(hashed).toHaveProperty('email_hash');
      expect(hashed).toHaveProperty('phone_hash');
    });

    it('should leave non-PII data unchanged', () => {
      const data = { name: 'John Doe', age: 30, city: 'New York' };
      const hashed = logger.hashPII(data);
      
      expect(hashed).toEqual(data);
    });
  });

  describe('Data Sanitization', () => {
    it('should redact sensitive fields', () => {
      const data = {
        password: 'secret123',
        token: 'abc123',
        key: 'apikey',
        secret: 'supersecret',
        authorization: 'Bearer token',
        name: 'John Doe'
      };
      
      const sanitized = logger.sanitizeData(data);
      
      expect(sanitized.password).toBe('[REDACTED]');
      expect(sanitized.token).toBe('[REDACTED]');
      expect(sanitized.key).toBe('[REDACTED]');
      expect(sanitized.secret).toBe('[REDACTED]');
      expect(sanitized.authorization).toBe('[REDACTED]');
      expect(sanitized.name).toBe('John Doe');
    });

    it('should not modify data without sensitive fields', () => {
      const data = { name: 'John Doe', age: 30 };
      const sanitized = logger.sanitizeData(data);
      
      expect(sanitized).toEqual(data);
    });
  });

  describe('URL Sanitization', () => {
    it('should remove sensitive query parameters', () => {
      const url = 'https://example.com/page?token=secret&key=apikey&name=john&secret=pass';
      const sanitized = logger.sanitizeUrl(url);
      
      expect(sanitized).not.toContain('token=secret');
      expect(sanitized).not.toContain('key=apikey');
      expect(sanitized).not.toContain('secret=pass');
      expect(sanitized).toContain('name=john');
    });

    it('should handle malformed URLs gracefully', () => {
      const malformedUrl = 'not-a-url';
      const sanitized = logger.sanitizeUrl(malformedUrl);
      
      expect(sanitized).toBe(malformedUrl);
    });
  });

  describe('Session Management', () => {
    it('should generate session ID if not exists', () => {
      mockSessionStorage.getItem.mockReturnValue(null);
      
      const sessionId = logger.getSessionId();
      
      expect(sessionId).toMatch(/^sess_\d+_[a-z0-9]+$/);
      expect(mockSessionStorage.setItem).toHaveBeenCalledWith(
        'ppp_session_id',
        sessionId
      );
    });

    it('should return existing session ID', () => {
      const existingSessionId = 'sess_1234567890_abcdef';
      mockSessionStorage.getItem.mockReturnValue(existingSessionId);
      
      const sessionId = logger.getSessionId();
      
      expect(sessionId).toBe(existingSessionId);
      expect(mockSessionStorage.setItem).not.toHaveBeenCalled();
    });

    it('should handle sessionStorage errors gracefully', () => {
      mockSessionStorage.getItem.mockImplementation(() => {
        throw new Error('Storage error');
      });
      
      const sessionId = logger.getSessionId();
      
      expect(sessionId).toMatch(/^sess_\d+_[a-z0-9]+$/);
    });
  });

  describe('Correlation ID Generation', () => {
    it('should generate unique correlation IDs', () => {
      const id1 = logger.generateCorrelationId();
      const id2 = logger.generateCorrelationId();
      
      expect(id1).toMatch(/^log_\d+_[a-z0-9]+$/);
      expect(id2).toMatch(/^log_\d+_[a-z0-9]+$/);
      expect(id1).not.toBe(id2);
    });
  });

  describe('Structured Logging', () => {
    it('should include required metadata in log entries', () => {
      const testData = { component: 'TestComponent', action: 'test' };
      
      logger.info('Test message', testData);
      
      expect(mockConsole.info).toHaveBeenCalledWith(
        expect.stringContaining('[INFO]'),
        'Test message',
        expect.objectContaining({
          component: 'TestComponent',
          action: 'test'
        })
      );
    });

    it('should include correlation ID in log entries', () => {
      logger.info('Test message');
      
      const logEntry = logger.log('info', 'Test message', {});
      
      expect(logEntry).toHaveProperty('correlationId');
      expect(logEntry.correlationId).toMatch(/^log_\d+_[a-z0-9]+$/);
    });

    it('should include timestamp in log entries', () => {
      const logEntry = logger.log('info', 'Test message', {});
      
      expect(logEntry).toHaveProperty('timestamp');
      expect(new Date(logEntry.timestamp)).toBeInstanceOf(Date);
    });
  });

  describe('Performance Logging', () => {
    it('should log performance metrics', () => {
      const operation = 'database_query';
      const duration = 125;
      const metadata = { query: 'SELECT * FROM users' };
      
      logger.logPerformance(operation, duration, metadata);
      
      expect(mockConsole.info).toHaveBeenCalledWith(
        expect.stringContaining('[INFO]'),
        `Performance: ${operation}`,
        expect.objectContaining({
          operation,
          duration_ms: duration,
          performance: true,
          query: 'SELECT * FROM users'
        })
      );
    });
  });

  describe('User Action Logging', () => {
    it('should log user actions with PII hashing', () => {
      const action = 'form_submit';
      const data = { email: 'test@example.com', button: 'submit' };
      
      logger.logUserAction(action, data);
      
      expect(mockConsole.info).toHaveBeenCalledWith(
        expect.stringContaining('[INFO]'),
        `User Action: ${action}`,
        expect.objectContaining({
          action,
          userAction: true,
          button: 'submit',
          email_hash: expect.stringMatching(/^hash_[a-f0-9]+$/)
        })
      );
    });
  });

  describe('API Call Logging', () => {
    it('should log API calls with sanitized URLs', () => {
      const method = 'POST';
      const url = 'https://api.example.com/users?token=secret';
      const status = 200;
      const duration = 250;
      
      logger.logApiCall(method, url, status, duration);
      
      expect(mockConsole.info).toHaveBeenCalledWith(
        expect.stringContaining('[INFO]'),
        `API Call: ${method} ${url}`,
        expect.objectContaining({
          method,
          status,
          duration_ms: duration,
          apiCall: true
        })
      );
    });
  });
}); 