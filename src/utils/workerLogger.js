/**
 * Worker Logger - Production-grade logging for Cloudflare Workers
 * No console usage in production, structured logging with external service support
 */

class WorkerLogger {
  constructor(env) {
    this.env = env || {};
    this.levels = ["debug", "info", "warn", "error"];
    this.currentLevel = this.env.LOG_LEVEL || (this.env.ENVIRONMENT === 'production' ? "warn" : "debug");
    this.environment = this.env.ENVIRONMENT || 'production';
    this.logs = []; // Buffer for logs in production
    this.maxBufferSize = 100;
  }

  shouldLog(level) {
    const levelIndex = this.levels.indexOf(level);
    const currentLevelIndex = this.levels.indexOf(this.currentLevel);
    return levelIndex >= currentLevelIndex;
  }

  async log(level, message, data = {}) {
    if (!this.shouldLog(level)) return;

    const logEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      environment: this.environment,
      worker: 'ppp-pixel',
      ...data
    };

    // In production, buffer logs instead of console
    if (this.environment === 'production') {
      this.logs.push(logEntry);
      if (this.logs.length > this.maxBufferSize) {
        this.logs.shift(); // Remove oldest log
      }

      // Send to external service if critical
      if (level === 'error') {
        await this.sendToExternalService(logEntry);
      }
    } else {
      // Development mode - use console if available
      if (typeof console !== 'undefined' && console[level]) {
        try {
          console[level](`[${level.toUpperCase()}] ${logEntry.timestamp}:`, message, data);
        } catch (e) {
          // Silently fail
        }
      }
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

  // Get buffered logs for debugging
  getBufferedLogs() {
    return this.logs;
  }

  // Clear log buffer
  clearBuffer() {
    this.logs = [];
  }

  async sendToExternalService(logEntry) {
    // Send to external logging service if configured
    if (this.env.LOG_ENDPOINT) {
      try {
        await fetch(this.env.LOG_ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(logEntry)
        });
      } catch (e) {
        // Silently fail - don't break the application
      }
    }
  }

  // Create a context logger for specific operations
  createContextLogger(context) {
    const self = this;
    return {
      debug: (message, data = {}) => self.debug(message, { ...context, ...data }),
      info: (message, data = {}) => self.info(message, { ...context, ...data }),
      warn: (message, data = {}) => self.warn(message, { ...context, ...data }),
      error: (message, data = {}) => self.error(message, { ...context, ...data })
    };
  }
}

// Factory function to create logger instances
export function createLogger(env) {
  return new WorkerLogger(env);
}

// Export for use in Workers
export default WorkerLogger; 