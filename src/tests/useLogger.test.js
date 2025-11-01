/**
 * useLogger Hook Unit Tests
 * Tests for React hook functionality and component lifecycle logging
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useLogger } from '../hooks/useLogger.js';

// Mock the logger
const mockLogger = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  logUserAction: vi.fn(),
  logPerformance: vi.fn(),
  logApiCall: vi.fn()
};

// Mock the logger module
vi.mock('../utils/logger.js', () => ({
  default: mockLogger
}));

describe('useLogger Hook', () => {
  const testComponentName = 'TestComponent';

  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Component Lifecycle Logging', () => {
    it('should log component mount on hook initialization', () => {
      renderHook(() => useLogger(testComponentName));

      expect(mockLogger.debug).toHaveBeenCalledWith(
        `${testComponentName} mounted`,
        { component: testComponentName }
      );
    });

    it('should log component unmount on cleanup', () => {
      const { unmount } = renderHook(() => useLogger(testComponentName));

      // Clear the mount log call
      mockLogger.debug.mockClear();

      unmount();

      expect(mockLogger.debug).toHaveBeenCalledWith(
        `${testComponentName} unmounted`,
        { component: testComponentName }
      );
    });

    it('should handle component name changes', () => {
      const { rerender } = renderHook(
        ({ componentName }) => useLogger(componentName),
        { initialProps: { componentName: 'InitialComponent' } }
      );

      expect(mockLogger.debug).toHaveBeenCalledWith(
        'InitialComponent mounted',
        { component: 'InitialComponent' }
      );

      // Clear previous calls
      mockLogger.debug.mockClear();

      // Rerender with new component name
      rerender({ componentName: 'UpdatedComponent' });

      expect(mockLogger.debug).toHaveBeenCalledWith(
        'InitialComponent unmounted',
        { component: 'InitialComponent' }
      );

      expect(mockLogger.debug).toHaveBeenCalledWith(
        'UpdatedComponent mounted',
        { component: 'UpdatedComponent' }
      );
    });
  });

  describe('Logging Methods', () => {
    it('should provide logUserAction method', () => {
      const { result } = renderHook(() => useLogger(testComponentName));

      act(() => {
        result.current.logUserAction('button_click', { buttonId: 'submit' });
      });

      expect(mockLogger.logUserAction).toHaveBeenCalledWith(
        'button_click',
        { component: testComponentName, buttonId: 'submit' }
      );
    });

    it('should provide logError method', () => {
      const { result } = renderHook(() => useLogger(testComponentName));
      const testError = new Error('Test error');
      const context = { userId: '123' };

      act(() => {
        result.current.logError(testError, context);
      });

      expect(mockLogger.error).toHaveBeenCalledWith(
        `Error in ${testComponentName}`,
        {
          component: testComponentName,
          error: testError.message,
          userId: '123'
        }
      );
    });

    it('should provide logInfo method', () => {
      const { result } = renderHook(() => useLogger(testComponentName));
      const message = 'Test info message';
      const data = { key: 'value' };

      act(() => {
        result.current.logInfo(message, data);
      });

      expect(mockLogger.info).toHaveBeenCalledWith(
        `${testComponentName}: ${message}`,
        { component: testComponentName, key: 'value' }
      );
    });

    it('should provide logPerformance method', () => {
      const { result } = renderHook(() => useLogger(testComponentName));
      const operation = 'data_fetch';
      const duration = 150;
      const metadata = { endpoint: '/api/users' };

      act(() => {
        result.current.logPerformance(operation, duration, metadata);
      });

      expect(mockLogger.logPerformance).toHaveBeenCalledWith(
        operation,
        duration,
        { component: testComponentName, endpoint: '/api/users' }
      );
    });

    it('should provide logApiCall method', () => {
      const { result } = renderHook(() => useLogger(testComponentName));
      const method = 'GET';
      const url = '/api/users';
      const status = 200;
      const duration = 100;
      const metadata = { cacheHit: true };

      act(() => {
        result.current.logApiCall(method, url, status, duration, metadata);
      });

      expect(mockLogger.logApiCall).toHaveBeenCalledWith(
        method,
        url,
        status,
        duration,
        { component: testComponentName, cacheHit: true }
      );
    });

    it('should provide logFormSubmission method', () => {
      const { result } = renderHook(() => useLogger(testComponentName));
      const formData = { name: 'John', email: 'john@example.com' };
      const validationStatus = 'valid';

      act(() => {
        result.current.logFormSubmission(formData, validationStatus);
      });

      expect(mockLogger.info).toHaveBeenCalledWith(
        `${testComponentName}: Form submitted`,
        {
          component: testComponentName,
          formSubmission: true,
          validationStatus,
          fieldCount: 2,
          hasEmail: true,
          hasName: true
        }
      );
    });

    it('should provide logStateChange method', () => {
      const { result } = renderHook(() => useLogger(testComponentName));
      const stateName = 'isLoading';
      const oldValue = false;
      const newValue = true;

      act(() => {
        result.current.logStateChange(stateName, oldValue, newValue);
      });

      expect(mockLogger.debug).toHaveBeenCalledWith(
        `${testComponentName}: State changed`,
        {
          component: testComponentName,
          stateChange: true,
          stateName,
          oldValue,
          newValue
        }
      );
    });
  });

  describe('Error Handling', () => {
    it('should handle errors gracefully when logging methods fail', () => {
      mockLogger.error.mockImplementation(() => {
        throw new Error('Logger error');
      });

      const { result } = renderHook(() => useLogger(testComponentName));

      // This should not throw an error
      expect(() => {
        act(() => {
          result.current.logError(new Error('Test error'), {});
        });
      }).not.toThrow();
    });

    it('should handle missing component name gracefully', () => {
      const { result } = renderHook(() => useLogger());

      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Unknown mounted',
        { component: 'Unknown' }
      );

      act(() => {
        result.current.logInfo('Test message');
      });

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Unknown: Test message',
        { component: 'Unknown' }
      );
    });
  });

  describe('Memoization', () => {
    it('should memoize returned methods to prevent unnecessary re-renders', () => {
      const { result, rerender } = renderHook(() => useLogger(testComponentName));

      const firstResult = result.current;
      
      // Rerender with same component name
      rerender();
      
      const secondResult = result.current;

      // Methods should be referentially equal
      expect(firstResult.logUserAction).toBe(secondResult.logUserAction);
      expect(firstResult.logError).toBe(secondResult.logError);
      expect(firstResult.logInfo).toBe(secondResult.logInfo);
      expect(firstResult.logPerformance).toBe(secondResult.logPerformance);
      expect(firstResult.logApiCall).toBe(secondResult.logApiCall);
    });

    it('should create new methods when component name changes', () => {
      const { result, rerender } = renderHook(
        ({ componentName }) => useLogger(componentName),
        { initialProps: { componentName: 'Component1' } }
      );

      const firstResult = result.current;
      
      // Rerender with different component name
      rerender({ componentName: 'Component2' });
      
      const secondResult = result.current;

      // Methods should be different references
      expect(firstResult.logUserAction).not.toBe(secondResult.logUserAction);
      expect(firstResult.logError).not.toBe(secondResult.logError);
      expect(firstResult.logInfo).not.toBe(secondResult.logInfo);
    });
  });
}); 