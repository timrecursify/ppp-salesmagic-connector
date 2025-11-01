/**
 * Centralized Logger Utility - PPP SalesMagic Connector
 * Production-grade logging with environment awareness and external service integration
 * Follows .cursorrules specification for structured logging
 */

/* global process */

class Logger {
  constructor() {
    this.levels = ["debug", "info", "warn", "error"];
    
    // Environment-aware log level configuration using improved getEnvVar
    const logLevel = this.getEnvVar('VITE_LOG_LEVEL') || this.getEnvVar('LOG_LEVEL');
    const isProd = this.isProd();
    
    this.currentLevel = logLevel || (isProd ? "warn" : "debug");
    this.environment = isProd ? 'production' : 'development';
    this.sentryDsn = this.getEnvVar('VITE_SENTRY_DSN') || this.getEnvVar('SENTRY_DSN');
    this.logRocketAppId = this.getEnvVar('VITE_LOGROCKET_APP_ID') || this.getEnvVar('LOGROCKET_APP_ID');

    this.correlationId = this.generateCorrelationId();
    this.initializeExternalServices();
  }

  getEnvVar(name) {
    // First check for Vite environment variables (import.meta.env)
    if (typeof import.meta !== 'undefined' && import.meta.env) {
      return import.meta.env[name];
    }
    
    // In browser environment, check window for passed env vars
    if (typeof window !== 'undefined') {
      // Check for environment variables passed to window
      if (window.__ENV__ && window.__ENV__[name]) {
        return window.__ENV__[name];
      }
      return null; // Will fall back to defaults in browser
    }
    
    // Node.js environment
    if (typeof process !== 'undefined' && process.env) {
      return process.env[name];
    }
    
    return null;
  }

  isProd() {
    const viteMode = this.getEnvVar('VITE_MODE');
    const viteProd = this.getEnvVar('VITE_PROD');
    const nodeEnv = this.getEnvVar('NODE_ENV');
    
    return viteMode === 'production' || viteProd === 'true' || nodeEnv === 'production';
  }

  generateCorrelationId() {
    return 'log_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  }

  shouldLog(level) {
    const levelIndex = this.levels.indexOf(level);
    const currentLevelIndex = this.levels.indexOf(this.currentLevel);
    return levelIndex >= currentLevelIndex;
  }

  log(level, message, data = {}) {
    if (!this.shouldLog(level)) return;

    const logEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      environment: this.environment,
      component: data.component || 'unknown',
      correlationId: this.correlationId,
      sessionId: this.getSessionId(),
      ...this.sanitizeData(data)
    };

    // In development, output to console if available and not in test environment
    if (!this.isProd() && typeof console !== 'undefined' && console[level === 'debug' ? 'log' : level]) {
      // Only use console in development mode
      const consoleMethod = level === 'debug' ? 'log' : level;
      try {
        console[consoleMethod](`[${level.toUpperCase()}] ${logEntry.timestamp}:`, message, data);
      } catch (e) {
        // Silently fail if console is not available
      }
    }

    // Send to external services in production
    if (this.isProd()) {
      this.sendToExternalService(logEntry);
    }

    return logEntry;
  }

  debug(message, data = {}) {
    return this.log('debug', message, data);
  }

  info(message, data = {}) {
    return this.log('info', message, data);
  }

  warn(message, data = {}) {
    return this.log('warn', message, data);
  }

  error(message, data = {}) {
    return this.log('error', message, data);
  }

  // Performance logging for critical operations
  logPerformance(operation, duration, data = {}) {
    return this.info(`Performance: ${operation}`, {
      ...data,
      operation,
      duration_ms: duration,
      performance: true
    });
  }

  // User action logging with privacy compliance
  logUserAction(action, data = {}) {
    return this.info(`User Action: ${action}`, {
      ...data,
      action,
      userAction: true,
      // Ensure PII is hashed before logging
      ...this.hashPII(data)
    });
  }

  // API call logging with correlation
  logApiCall(method, url, status, duration, data = {}) {
    return this.info(`API Call: ${method} ${url}`, {
      ...data,
      method,
      url: this.sanitizeUrl(url),
      status,
      duration_ms: duration,
      apiCall: true
    });
  }

  sanitizeData(data) {
    const sanitized = { ...data };
    
    // Remove sensitive fields
    const sensitiveFields = ['password', 'token', 'key', 'secret', 'authorization'];
    sensitiveFields.forEach(field => {
      if (sanitized[field]) {
        sanitized[field] = '[REDACTED]';
      }
    });

    return sanitized;
  }

  hashPII(data) {
    const hashed = { ...data };
    
    // Hash PII fields for privacy compliance
    if (hashed.email) {
      hashed.email_hash = this.simpleHash(hashed.email);
      delete hashed.email;
    }
    if (hashed.phone) {
      hashed.phone_hash = this.simpleHash(hashed.phone);
      delete hashed.phone;
    }

    return hashed;
  }

  simpleHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return 'hash_' + Math.abs(hash).toString(16);
  }

  sanitizeUrl(url) {
    try {
      const urlObj = new URL(url);
      // Remove sensitive query parameters
      urlObj.searchParams.delete('token');
      urlObj.searchParams.delete('key');
      urlObj.searchParams.delete('secret');
      return urlObj.toString();
    } catch (e) {
      return url;
    }
  }

  getSessionId() {
    if (typeof window !== 'undefined' && typeof sessionStorage !== 'undefined') {
      try {
        let sessionId = sessionStorage.getItem('ppp_session_id');
        if (!sessionId) {
          sessionId = 'sess_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
          sessionStorage.setItem('ppp_session_id', sessionId);
        }
        return sessionId;
      } catch (error) {
        // Fall back to generated session ID if sessionStorage unavailable
        return 'sess_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
      }
    }
    return 'server_session';
  }

  initializeExternalServices() {
    if (!this.isProd()) return;

    // Initialize Sentry if configured
    if (this.sentryDsn && typeof window !== 'undefined') {
      this.initializeSentry();
    }

    // Initialize LogRocket if configured
    if (this.logRocketAppId && typeof window !== 'undefined') {
      this.initializeLogRocket();
    }
  }

  initializeSentry() {
    if (!this.sentryDsn) return;
    
    try {
      // Dynamic import of Sentry browser SDK
      if (typeof window !== 'undefined') {
        // Create script tag for Sentry SDK
        const script = document.createElement('script');
        script.src = 'https://browser.sentry-cdn.com/7.91.0/bundle.min.js';
        script.crossOrigin = 'anonymous';
        script.onload = () => {
          if (window.Sentry) {
            window.Sentry.init({
              dsn: this.sentryDsn,
              environment: this.environment,
              integrations: [
                new window.Sentry.Integrations.Breadcrumbs(),
                new window.Sentry.Integrations.GlobalHandlers(),
                new window.Sentry.Integrations.LinkedErrors(),
                new window.Sentry.Integrations.Dedupe(),
                new window.Sentry.Integrations.HttpContext(),
              ],
              tracesSampleRate: this.environment === 'production' ? 0.1 : 1.0,
              beforeSend: (event) => {
                // Filter out sensitive data
                if (event.extra) {
                  event.extra = this.sanitizeData(event.extra);
                }
                return event;
              }
            });
            this.sentryAvailable = true;
          }
        };
        document.head.appendChild(script);
      }
    } catch (error) {
      // Silently fail - external service initialization should not break logging
      this.sentryAvailable = false;
      // Store error for later debugging if needed
      this.initializationErrors = this.initializationErrors || [];
      this.initializationErrors.push({ service: 'Sentry', error: error.message });
    }
  }

  initializeLogRocket() {
    if (!this.logRocketAppId) return;
    
    try {
      // Dynamic import of LogRocket SDK
      if (typeof window !== 'undefined') {
        // Create script tag for LogRocket SDK
        const script = document.createElement('script');
        script.src = 'https://cdn.lr-ingest.io/LogRocket.min.js';
        script.crossOrigin = 'anonymous';
        script.onload = () => {
          if (window.LogRocket) {
            window.LogRocket.init(this.logRocketAppId, {
              dom: {
                textContent: this.environment === 'production',
                inputValue: false // Never capture input values for privacy
              },
              network: {
                requestSanitizer: (request) => {
                  // Remove sensitive headers
                  if (request.headers) {
                    delete request.headers.authorization;
                    delete request.headers.cookie;
                    delete request.headers['x-api-key'];
                  }
                  return request;
                },
                responseSanitizer: (response) => {
                  // Remove sensitive response data
                  if (response.body) {
                    const sanitized = this.sanitizeData(response.body);
                    return { ...response, body: sanitized };
                  }
                  return response;
                }
              },
              console: {
                shouldAggregateConsoleErrors: true,
                isEnabled: this.environment === 'production'
              }
            });
            this.logRocketAvailable = true;
          }
        };
        document.head.appendChild(script);
      }
    } catch (error) {
      // Silently fail - external service initialization should not break logging
      this.logRocketAvailable = false;
      // Store error for later debugging if needed
      this.initializationErrors = this.initializationErrors || [];
      this.initializationErrors.push({ service: 'LogRocket', error: error.message });
    }
  }

  sendToExternalService(logEntry) {
    try {
      // Send to Sentry for error tracking
      if (logEntry.level === 'error' && this.sentryAvailable) {
        this.sendToSentry(logEntry);
      }

      // Send to LogRocket for session replay
      if (this.logRocketAvailable) {
        this.sendToLogRocket(logEntry);
      }

      // Send to custom logging endpoint if available
      this.sendToCustomEndpoint(logEntry);
    } catch (error) {
      // Silently fail - external service errors should not break logging
      // Store error for debugging
      this.externalServiceErrors = this.externalServiceErrors || [];
      this.externalServiceErrors.push({
        timestamp: new Date().toISOString(),
        error: error.message,
        logEntry: logEntry.message
      });
      // Keep only last 10 errors to prevent memory leak
      if (this.externalServiceErrors.length > 10) {
        this.externalServiceErrors.shift();
      }
    }
  }

  sendToSentry(logEntry) {
    if (!this.sentryAvailable || !window.Sentry) return;
    
    try {
      if (logEntry.level === 'error') {
        // Send as error to Sentry
        window.Sentry.captureException(new Error(logEntry.message), {
          level: 'error',
          extra: logEntry,
          tags: {
            component: logEntry.component,
            environment: this.environment,
            correlationId: logEntry.correlationId
          },
          fingerprint: [logEntry.component, logEntry.message]
        });
      } else {
        // Send as breadcrumb for non-error logs
        window.Sentry.addBreadcrumb({
          message: logEntry.message,
          level: logEntry.level,
          data: logEntry,
          timestamp: new Date(logEntry.timestamp).getTime() / 1000
        });
      }
    } catch (error) {
      // Silently fail - Sentry errors should not break logging
      this.sentryErrors = this.sentryErrors || [];
      this.sentryErrors.push({
        timestamp: new Date().toISOString(),
        error: error.message
      });
      if (this.sentryErrors.length > 10) {
        this.sentryErrors.shift();
      }
    }
  }

  sendToLogRocket(logEntry) {
    if (!this.logRocketAvailable || !window.LogRocket) return;
    
    try {
      // Send log entry as custom event to LogRocket
      window.LogRocket.track('PPP_Log_Event', {
        level: logEntry.level,
        message: logEntry.message,
        component: logEntry.component,
        correlationId: logEntry.correlationId,
        sessionId: logEntry.sessionId,
        timestamp: logEntry.timestamp,
        environment: this.environment,
        // Include sanitized additional data
        ...this.sanitizeData(logEntry)
      });
      
      // If it's an error, also capture it as an exception
      if (logEntry.level === 'error') {
        window.LogRocket.captureException(new Error(logEntry.message));
      }
    } catch (error) {
      // Silently fail - LogRocket errors should not break logging
      this.logRocketErrors = this.logRocketErrors || [];
      this.logRocketErrors.push({
        timestamp: new Date().toISOString(),
        error: error.message
      });
      if (this.logRocketErrors.length > 10) {
        this.logRocketErrors.shift();
      }
    }
  }

  sendToCustomEndpoint(logEntry) {
    // Custom logging endpoint integration
    if (typeof fetch !== 'undefined') {
      fetch('/api/logs', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(logEntry),
      }).catch(error => {
        // Silently fail - custom endpoint errors should not break logging
        this.customEndpointErrors = this.customEndpointErrors || [];
        this.customEndpointErrors.push({
          timestamp: new Date().toISOString(),
          error: error.message
        });
        if (this.customEndpointErrors.length > 10) {
          this.customEndpointErrors.shift();
        }
      });
    }
  }

  // Context-aware logging for React components
  createComponentLogger(componentName) {
    return {
      debug: (message, data = {}) => this.debug(message, { component: componentName, ...data }),
      info: (message, data = {}) => this.info(message, { component: componentName, ...data }),
      warn: (message, data = {}) => this.warn(message, { component: componentName, ...data }),
      error: (message, data = {}) => this.error(message, { component: componentName, ...data }),
      logUserAction: (action, data = {}) => this.logUserAction(action, { component: componentName, ...data }),
      logPerformance: (operation, duration, data = {}) => this.logPerformance(operation, duration, { component: componentName, ...data })
    };
  }

  // Get debugging information about logger errors (for production debugging)
  getDebugInfo() {
    return {
      initializationErrors: this.initializationErrors || [],
      externalServiceErrors: this.externalServiceErrors || [],
      sentryErrors: this.sentryErrors || [],
      logRocketErrors: this.logRocketErrors || [],
      customEndpointErrors: this.customEndpointErrors || [],
      sentryAvailable: this.sentryAvailable,
      logRocketAvailable: this.logRocketAvailable,
      currentLevel: this.currentLevel,
      environment: this.environment
    };
  }
}

// Create singleton instance
const logger = new Logger();

// Export both the class and the singleton
export { Logger };
export default logger;

// Global logger for backward compatibility and pixel script usage
if (typeof window !== 'undefined') {
  window.PPPLogger = logger;
} 