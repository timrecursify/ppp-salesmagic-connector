/**
 * Circuit Breaker Pattern for External API Calls
 * Prevents cascading failures when external services are down
 */

class CircuitBreaker {
  constructor(options = {}) {
    this.failureThreshold = options.failureThreshold || 5;
    this.resetTimeout = options.resetTimeout || 60000; // 1 minute
    this.state = 'CLOSED'; // CLOSED, OPEN, HALF_OPEN
    this.failureCount = 0;
    this.nextAttempt = Date.now();
    this.successCount = 0;
    this.name = options.name || 'circuit-breaker';
  }

  async execute(fn, ...args) {
    const now = Date.now();

    // Check if circuit should transition from OPEN to HALF_OPEN
    if (this.state === 'OPEN') {
      if (now >= this.nextAttempt) {
        this.state = 'HALF_OPEN';
        this.successCount = 0;
      } else {
        throw new Error(`Circuit breaker ${this.name} is OPEN. Retry after ${new Date(this.nextAttempt).toISOString()}`);
      }
    }

    try {
      const result = await fn(...args);
      
      // On success, reset failure count
      if (this.state === 'HALF_OPEN') {
        this.successCount++;
        if (this.successCount >= 2) {
          // Two successful calls in HALF_OPEN state, close the circuit
          this.state = 'CLOSED';
          this.failureCount = 0;
          this.successCount = 0;
        }
      } else {
        this.failureCount = 0;
      }
      
      return result;
    } catch (error) {
      this.failureCount++;
      
      if (this.failureCount >= this.failureThreshold) {
        this.state = 'OPEN';
        this.nextAttempt = now + this.resetTimeout;
      }
      
      throw error;
    }
  }

  getState() {
    return {
      state: this.state,
      failureCount: this.failureCount,
      nextAttempt: this.nextAttempt,
      canAttempt: Date.now() >= this.nextAttempt
    };
  }

  reset() {
    this.state = 'CLOSED';
    this.failureCount = 0;
    this.successCount = 0;
    this.nextAttempt = Date.now();
  }
}

// Global circuit breaker instance for Pipedrive API
let pipedriveCircuitBreaker = null;

export function getPipedriveCircuitBreaker() {
  if (!pipedriveCircuitBreaker) {
    pipedriveCircuitBreaker = new CircuitBreaker({
      name: 'pipedrive-api',
      failureThreshold: 5,
      resetTimeout: 60000 // 1 minute
    });
  }
  return pipedriveCircuitBreaker;
}

export default CircuitBreaker;

