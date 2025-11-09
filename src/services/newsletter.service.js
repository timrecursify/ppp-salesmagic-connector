/**
 * Newsletter Bot Integration Service
 * Automatically adds form submissions to the newsletter mailing list
 */

import { createLogger } from '../utils/workerLogger.js';

/**
 * Add contact to newsletter bot
 * @param {Object} env - Environment variables
 * @param {Object} formData - Parsed form data with email and first_name
 * @returns {Promise<Object>} Result object with success status
 */
export async function addToNewsletter(env, formData) {
  const logger = createLogger(env);
  
  // Validate required fields
  if (!formData || !formData.email) {
    try {
      await logger.debug('Newsletter signup skipped - no email', {
        component: 'newsletter-service',
        has_form_data: !!formData
      });
    } catch (logError) {
      console.error('[newsletter-service] Failed to log no email', {
        logging_error: logError.message
      });
    }
    return { success: false, reason: 'no_email' };
  }

  const email = formData.email.toLowerCase().trim();
  const firstName = formData.first_name || formData.name || 'Guest';
  
  // Validate email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    try {
      await logger.warn('Newsletter signup skipped - invalid email format', {
        component: 'newsletter-service',
        email: email.substring(0, 10) + '...'
      });
    } catch (logError) {
      console.error('[newsletter-service] Failed to log invalid email', {
        logging_error: logError.message
      });
    }
    return { success: false, reason: 'invalid_email' };
  }

  // Get newsletter bot API URL and auth token from environment
  const newsletterApiUrl = env.NEWSLETTER_API_URL || 'https://ppp-newsletter.tim-611.workers.dev/api/contacts';
  const newsletterAuthToken = env.NEWSLETTER_AUTH_TOKEN;

  if (!newsletterAuthToken) {
    try {
      await logger.warn('Newsletter signup skipped - auth token not configured', {
        component: 'newsletter-service',
        email: email.substring(0, 10) + '...'
      });
    } catch (logError) {
      console.error('[newsletter-service] Failed to log auth token missing', {
        logging_error: logError.message
      });
    }
    return { success: false, reason: 'not_configured' };
  }

  // Extract wedding date from form data if available, otherwise use default
  let weddingDate;
  const weddingDateField = formData.wedding_date || 
                          formData['input_comp-kfmqou8s'] || 
                          formData['input_comp_kfmqou8s'] ||
                          formData.event_date ||
                          formData.date;
  
  if (weddingDateField) {
    try {
      // Parse various date formats: MM/DD/YYYY, YYYY-MM-DD, MM-DD-YYYY, etc.
      let parsedDate;
      const dateStr = String(weddingDateField).trim();
      
      // Try parsing different formats
      if (dateStr.match(/^\d{4}-\d{2}-\d{2}$/)) {
        // YYYY-MM-DD format
        parsedDate = new Date(dateStr);
      } else if (dateStr.match(/^\d{2}\/\d{2}\/\d{4}$/)) {
        // MM/DD/YYYY format
        const parts = dateStr.split('/');
        parsedDate = new Date(parseInt(parts[2]), parseInt(parts[0]) - 1, parseInt(parts[1]));
      } else if (dateStr.match(/^\d{2}-\d{2}-\d{4}$/)) {
        // MM-DD-YYYY format
        const parts = dateStr.split('-');
        parsedDate = new Date(parseInt(parts[2]), parseInt(parts[0]) - 1, parseInt(parts[1]));
      } else {
        // Try native Date parsing
        parsedDate = new Date(dateStr);
      }
      
      // Validate parsed date
      if (parsedDate && !isNaN(parsedDate.getTime())) {
        // Ensure date is in the future (wedding dates should be future dates)
        const now = new Date();
        now.setHours(0, 0, 0, 0);
        if (parsedDate >= now) {
          weddingDate = parsedDate.toISOString().split('T')[0]; // YYYY-MM-DD format
        }
      }
    } catch (dateError) {
      try {
        await logger.debug('Failed to parse wedding date from form data', {
          component: 'newsletter-service',
          wedding_date_field: weddingDateField,
          error: dateError.message
        });
      } catch (logError) {
        console.error('[newsletter-service] Failed to log date parse error', {
          original_error: dateError.message,
          logging_error: logError.message
        });
      }
    }
  }
  
  // Default wedding date: 1 year from now if not extracted from form
  if (!weddingDate) {
    const defaultWeddingDate = new Date();
    defaultWeddingDate.setFullYear(defaultWeddingDate.getFullYear() + 1);
    weddingDate = defaultWeddingDate.toISOString().split('T')[0]; // YYYY-MM-DD format
  }

  const contactData = {
    email: email,
    first_name: firstName,
    wedding_date: weddingDate
  };

  try {
    const startTime = Date.now();
    
    try {
      await logger.debug('Adding contact to newsletter', {
        component: 'newsletter-service',
        email: email.substring(0, 10) + '...',
        first_name: firstName
      });
    } catch (logError) {
      console.error('[newsletter-service] Failed to log newsletter add attempt', {
        logging_error: logError.message
      });
    }

    const response = await fetch(newsletterApiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${newsletterAuthToken}`
      },
      body: JSON.stringify(contactData),
      // Set timeout to prevent blocking
      signal: AbortSignal.timeout(5000) // 5 second timeout
    });

    const duration = Date.now() - startTime;

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      
      try {
        await logger.warn('Newsletter signup failed', {
          component: 'newsletter-service',
          email: email.substring(0, 10) + '...',
          status: response.status,
          statusText: response.statusText,
          error: errorText.substring(0, 200),
          duration
        });
      } catch (logError) {
        console.error('[newsletter-service] Failed to log signup failure', {
          status: response.status,
          logging_error: logError.message
        });
      }

      // Don't throw error - newsletter signup is non-critical
      return { 
        success: false, 
        reason: 'api_error',
        status: response.status,
        error: errorText.substring(0, 100)
      };
    }

    const result = await response.json().catch(() => ({}));

    try {
      await logger.info('Contact added to newsletter successfully', {
        component: 'newsletter-service',
        email: email.substring(0, 10) + '...',
        first_name: firstName,
        duration,
        contact_id: result.id || null
      });
    } catch (logError) {
      console.error('[newsletter-service] Failed to log signup success', {
        logging_error: logError.message
      });
    }

    return { 
      success: true, 
      contact_id: result.id || null,
      duration
    };

  } catch (error) {
    // Handle timeout and network errors gracefully
    const isTimeout = error.name === 'AbortError' || error.name === 'TimeoutError';
    
    try {
      await logger.warn('Newsletter signup error', {
        component: 'newsletter-service',
        email: email.substring(0, 10) + '...',
        error_type: error.name,
        error_message: error.message,
        is_timeout: isTimeout
      });
    } catch (logError) {
      console.error('[newsletter-service] Failed to log newsletter error', {
        original_error: error.message,
        logging_error: logError.message
      });
    }

    // Don't throw error - newsletter signup is non-critical
    return { 
      success: false, 
      reason: isTimeout ? 'timeout' : 'network_error',
      error: error.message
    };
  }
}

