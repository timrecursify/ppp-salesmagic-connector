/**
 * useLogger React Hook - PPP SalesMagic Connector
 * Production-grade component logging with lifecycle tracking
 * Follows .cursorrules specification for React component logging
 */

import { useEffect, useCallback } from 'react';
import logger from '../utils/logger.js';

export const useLogger = (componentName) => {
  // Log component lifecycle events
  useEffect(() => {
    logger.debug(`${componentName} mounted`, { 
      component: componentName,
      lifecycle: 'mount'
    });
    
    return () => {
      logger.debug(`${componentName} unmounted`, { 
        component: componentName,
        lifecycle: 'unmount'
      });
    };
  }, [componentName]);

  // Create component-specific logger methods
  const componentLogger = useCallback(() => {
    return {
      // User action logging
      logUserAction: (action, data = {}) => {
        logger.logUserAction(`User: ${action}`, { 
          component: componentName, 
          action, 
          ...data 
        });
      },

      // Error logging with component context
      logError: (error, context = {}) => {
        logger.error(`Error in ${componentName}`, { 
          component: componentName, 
          error: error.message,
          stack: error.stack,
          name: error.name,
          ...context 
        });
      },

      // Info logging with component context
      logInfo: (message, data = {}) => {
        logger.info(`${componentName}: ${message}`, { 
          component: componentName, 
          ...data 
        });
      },

      // Debug logging with component context
      logDebug: (message, data = {}) => {
        logger.debug(`${componentName}: ${message}`, { 
          component: componentName, 
          ...data 
        });
      },

      // Warning logging with component context
      logWarn: (message, data = {}) => {
        logger.warn(`${componentName}: ${message}`, { 
          component: componentName, 
          ...data 
        });
      },

      // Performance logging for component operations
      logPerformance: (operation, duration, data = {}) => {
        logger.logPerformance(`${componentName}: ${operation}`, duration, { 
          component: componentName, 
          ...data 
        });
      },

      // Form submission logging
      logFormSubmission: (formData, validationStatus = 'valid') => {
        logger.logUserAction('Form Submission', {
          component: componentName,
          formType: formData.formType || 'unknown',
          validationStatus,
          fieldCount: Object.keys(formData).length,
          hasEmail: !!formData.email,
          hasPhone: !!formData.phone,
          // PII will be hashed by the logger
          ...formData
        });
      },

      // State change logging for important component state
      logStateChange: (stateName, oldValue, newValue, data = {}) => {
        logger.debug(`${componentName}: State Change`, {
          component: componentName,
          stateName,
          oldValue: typeof oldValue === 'object' ? '[Object]' : oldValue,
          newValue: typeof newValue === 'object' ? '[Object]' : newValue,
          ...data
        });
      },

      // API call logging from components
      logApiCall: (method, url, status, duration, data = {}) => {
        logger.logApiCall(method, url, status, duration, {
          component: componentName,
          ...data
        });
      },

      // Custom event logging
      logEvent: (eventName, data = {}) => {
        logger.info(`${componentName}: ${eventName}`, {
          component: componentName,
          eventName,
          ...data
        });
      }
    };
  }, [componentName]);

  return componentLogger();
};

export default useLogger; 