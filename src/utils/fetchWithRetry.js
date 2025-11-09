/**
 * Fetch utility with timeout and retry logic for production reliability
 * Used for external API calls (Pipedrive, archive endpoint, etc.)
 */

/**
 * Fetch with timeout and exponential backoff retry
 * @param {string} url - URL to fetch
 * @param {object} options - Fetch options (method, headers, body, etc.)
 * @param {object} retryOptions - Retry configuration
 * @param {number} retryOptions.timeout - Timeout in milliseconds (default: 5000)
 * @param {number} retryOptions.maxRetries - Maximum retry attempts (default: 3)
 * @param {number} retryOptions.initialDelay - Initial delay before retry in ms (default: 1000)
 * @param {function} retryOptions.shouldRetry - Function to determine if should retry (default: retry on network errors)
 * @returns {Promise<Response>} Fetch response
 */
export async function fetchWithRetry(url, options = {}, retryOptions = {}) {
  const {
    timeout = 5000,
    maxRetries = 3,
    initialDelay = 1000,
    shouldRetry = (error, response) => {
      // Retry on network errors or 5xx server errors
      if (error) return true;
      if (response && response.status >= 500) return true;
      return false;
    }
  } = retryOptions;

  let lastError = null;
  let lastResponse = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    let timeoutId = null;
    try {
      // Create abort controller for timeout
      const controller = new AbortController();
      timeoutId = setTimeout(() => controller.abort(), timeout);

      try {
        const response = await fetch(url, {
          ...options,
          signal: controller.signal
        });

        if (timeoutId) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }

        // Check if response is successful (2xx status)
        if (response.ok) {
          return response;
        }

        // Check if we should retry based on response status
        if (!shouldRetry(null, response)) {
          return response;
        }

        lastResponse = response;

        // If this is the last attempt, return the response anyway
        if (attempt === maxRetries) {
          return response;
        }

        // Wait before retrying (exponential backoff)
        const delay = initialDelay * Math.pow(2, attempt);
        await new Promise(resolve => setTimeout(resolve, delay));

      } catch (fetchError) {
        if (timeoutId) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }

        // Check if error is due to abort (timeout)
        if (fetchError.name === 'AbortError') {
          lastError = new Error(`Request timeout after ${timeout}ms`);
        } else {
          lastError = fetchError;
        }

        // Check if we should retry
        if (!shouldRetry(lastError, null)) {
          throw lastError;
        }

        // If this is the last attempt, throw the error
        if (attempt === maxRetries) {
          throw lastError;
        }

        // Wait before retrying (exponential backoff)
        const delay = initialDelay * Math.pow(2, attempt);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    } finally {
      // Ensure timeout is always cleared
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
    }
  }

  // Should never reach here, but just in case
  if (lastResponse) return lastResponse;
  throw lastError || new Error('Fetch failed after retries');
}

/**
 * Convenience wrapper for JSON fetch with retry
 */
export async function fetchJSONWithRetry(url, options = {}, retryOptions = {}) {
  const response = await fetchWithRetry(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers
    }
  }, retryOptions);

  // Check if response is OK
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  return response.json();
}

