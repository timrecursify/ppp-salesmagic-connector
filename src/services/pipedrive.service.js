/**
 * Pipedrive Service
 * Direct integration with Pipedrive API for Person creation/updates
 */

import { createLogger } from '../utils/workerLogger.js';
import { fetchJSONWithRetry } from '../utils/fetchWithRetry.js';
import { getPipedriveCircuitBreaker } from '../utils/circuitBreaker.js';

// Create logger instance for mapToPipedriveFields (static function)
const staticLogger = createLogger({});

// Pipedrive Person field mappings (custom field keys)
export const FIELD_MAPPING = {
  // Standard fields (used for search only, not updated)
  name: 'name',
  email: 'email',
  first_name: 'first_name',
  last_name: 'last_name',
  
  // UTM Parameters
  utm_source: 'b2be79ec6d74810f141ff0c10950d09a251841d5', // Source
  utm_medium: '793eed228dab55f371b7a463d6272c25c10d2592', // UTM_Medium
  utm_campaign: '0c0266c6a8ca36806465ba11d0a0b7cd01401107', // SP UTM Campaign
  utm_content: '8f230578a37b1f6cc9735b2659d00f69a407cedd', // UTM_Content
  utm_term: '69ce2c893d7c87679967b12727805d693463a5fe', // UTM_Term
  
  // Click IDs
  gclid: '9aad4a1b8a9bcd93dc31ec8c4efea5f2d3123c58', // GCLID
  fbclid: '6d9fa7cac69ac961197fe160a6e0303cc103db3c', // Facebook Click ID
  msclkid: 'f97bbfff4e3665f129094b276f7c48dd3715bcdf', // Microsoft Click ID
  ttclid: 'd8e9e151f85917536c0867947a0ad9e1c9c5fc8d', // Tik Tok Click ID
  
  // Tracking IDs
  event_id: '8cf49560ecaa68f90d3e4e103a8267ca5d4dc621', // Event ID
  session_id: 'b0067e0f4c9d31fe12a9067ea0c2f728079ada9e', // Session ID
  visitor_id: '38cf8a494a313dddb37b05eb5230c14470a71208', // Visitor ID
  pixel_id: '5365d081bd139123cdac311b49c9b207f6a2ff7b', // Pixel ID
  project_id: '7aea416f749df1c9b88bbf3a75d0377475b771e4', // Project ID
  
  // Page Data
  page_url: 'a5fda325cf12108a3156d8572d3e5df1b1157c8f', // Page URL
  page_title: '82da01c675c40d01b47c044e88a43a2b840172b7', // Page Title
  referrer_url: 'c588a1f5f600988d32bb9acc23365423d39fba2f', // Referrer URL
  
  // Geographic
  country: 'e00b50a52507ef7229b956dc1997b01eef506db7', // Country
  region: '918f46e1e4c8ecdae4b300ac8fdc38b2ebf52dab', // Region
  city: 'c068cb8babf4d594f68f14bda5093f51c45d6527', // City
  location: 'af8fe5c5442ad675f6f0bffa123fa15f92794842', // Location (combined city/region/country)
  
  // Ad Data
  ad_group: 'e94db8ffea0cdb798171a5011f7e67e56d111941', // Ad_Group
  ad_id: 'be273aec0e4263097e79c469b84512667e20ccff', // Ad_ID
  search_query: '3fbc29539c444f99220a09890ad579f7501e1ffe', // Search Query
  
  // Device/Browser
  user_agent: '56e5c28437b29d4e11e48a0af2985a0318257ef3', // Useragent
  screen_resolution: '783ba423096fe12674cee2db61812f65413d3ced', // Screen Resolution
  device_type: 'a15bd6127ea55f527e904922e5185ad1fceb8367', // Device Type
  operating_system: 'c6af69e1287659f160d38c5194221e55081d7cec', // Operating System
  event_type: '1bcb4f1e92d4add82f1e71254913bde0063b99b0', // Event Type
  
  // New fields
  last_visited_on: '937a29aadcfc5a4c8d019712d64c2de19df1d0fa', // Last Visited On
  visited_pages: '1eeecc0ef962b8b79d5da5c0fea6148c86d97380', // Visited Web Pages
  session_duration: 'cff9425cb26b594ad315d1afe09308c1766d42aa', // Session Duration
  ip_address: '511d65babf591015ec6be0b58434327933c6f703' // IP Address
};

/**
 * Map our tracking data to Pipedrive Person format
 * NOTE: Only includes custom fields, NOT name/email/phone (used only for search)
 */
function mapToPipedriveFields(trackingData) {
  const pipedriveData = {};
  
  // DO NOT include name/email in payload - these are only for search
  // Pipedrive already has this data from form submission, we only update tracking fields
  
  // Map custom fields (Pipedrive expects custom field keys directly as properties)
  // Include all non-null values (including "none", "unknown", "direct" - these are valid UTM values)
  const excludedFields = [];
  const includedFields = [];
  
  for (const [ourKey, pipedriveKey] of Object.entries(FIELD_MAPPING)) {
    // Skip name/email fields (used for search only, not updated)
    if (['name', 'email', 'first_name', 'last_name'].includes(ourKey)) {
      continue;
    }
    
    // Check if field exists in trackingData (including empty strings, "none", "unknown", etc.)
    if (trackingData.hasOwnProperty(ourKey) && trackingData[ourKey] !== null && trackingData[ourKey] !== undefined) {
      // Convert to string and trim
      const value = String(trackingData[ourKey]).trim();
      // Only exclude actual null/undefined strings, not valid values like "none" or "unknown"
      if (value !== '' && value !== 'null' && value !== 'undefined') {
        pipedriveData[pipedriveKey] = value;
        includedFields.push(`${ourKey}=${value.substring(0, 50)}`);
      } else {
        excludedFields.push(`${ourKey} (empty/null string: "${value}")`);
      }
    } else {
      // Field doesn't exist or is null/undefined
      if (['utm_source', 'utm_medium', 'utm_campaign'].includes(ourKey)) {
        excludedFields.push(`${ourKey} (${trackingData.hasOwnProperty(ourKey) ? 'null/undefined' : 'missing'})`);
      }
    }
  }
  
  // Log UTM field mapping for debugging (critical for troubleshooting)
  if (trackingData.event_id && (excludedFields.some(f => f.includes('utm_')) || includedFields.some(f => f.includes('utm_')))) {
    try {
      staticLogger.info('mapToPipedriveFields - UTM field mapping', {
        component: 'pipedrive-service',
        event_id: trackingData.event_id,
        utm_fields_included: includedFields.filter(f => f.includes('utm_')),
        utm_fields_excluded: excludedFields.filter(f => f.includes('utm_')),
        total_fields_mapped: Object.keys(pipedriveData).length,
        has_utm_source_in_trackingData: trackingData.hasOwnProperty('utm_source'),
        utm_source_value: trackingData.utm_source || 'NULL',
        has_utm_medium_in_trackingData: trackingData.hasOwnProperty('utm_medium'),
        utm_medium_value: trackingData.utm_medium || 'NULL'
      }).catch((logError) => {
        console.error('[pipedrive-service] Failed to log UTM field mapping', {
          logging_error: logError.message,
          event_id: trackingData.event_id
        });
      });
    } catch (logError) {
      console.error('[pipedrive-service] Failed to log UTM field mapping (outer catch)', {
        logging_error: logError.message,
        event_id: trackingData.event_id
      });
    }
  }
  
  return pipedriveData;
}

/**
 * Search for person by email
 * IMPROVED: Try exact match first, then broader search, with detailed logging
 */
async function searchPersonByEmail(apiKey, email) {
  const baseUrl = 'https://api.pipedrive.com/v1';
  const logger = createLogger({});
  
  // CRITICAL DEBUG: Always log with console.log as fallback
  console.log('[pipedrive-service] searchPersonByEmail called', {
    email: email?.substring(0, 15) + '...',
    has_api_key: !!apiKey
  });
  
  if (!email) {
    console.log('[pipedrive-service] searchPersonByEmail - NO EMAIL provided');
    return null;
  }
  
  try {
    const circuitBreaker = getPipedriveCircuitBreaker();
    console.log('[pipedrive-service] Circuit breaker status:', {
      state: circuitBreaker.getState ? circuitBreaker.getState() : 'unknown'
    });
    
    // STRATEGY 1: Try exact match with fields=email (strictest)
    try {
      const emailData = await circuitBreaker.execute(async () => {
        const emailParams = new URLSearchParams({ 
          api_token: apiKey,
          term: email,
          fields: 'email',
          exact_match: 'true'
        });
        
        return await fetchJSONWithRetry(
          `${baseUrl}/persons/search?${emailParams}`,
          {},
          {
            timeout: 5000,
            maxRetries: 2,
            initialDelay: 1000,
            shouldRetry: (error, response) => {
              if (error) return true;
              if (response && response.status >= 500) return true;
              return false;
            }
          }
        );
      });
      
      if (emailData.success && emailData.data && emailData.data.items && emailData.data.items.length > 0) {
        const personId = emailData.data.items[0].item.id;
        await logger.info('Pipedrive email search - exact match found', {
          component: 'pipedrive-service',
          email: email.substring(0, 15) + '...',
          person_id: personId,
          search_strategy: 'exact_match'
        });
        return personId;
      }
      
      await logger.info('Pipedrive email search - no exact match', {
        component: 'pipedrive-service',
        email: email.substring(0, 15) + '...',
        items_found: emailData.data?.items?.length || 0
      });
    } catch (exactMatchError) {
      await logger.warn('Pipedrive email exact match search failed', {
        component: 'pipedrive-service',
        email: email.substring(0, 15) + '...',
        error: exactMatchError.message
      });
    }
    
    // STRATEGY 2: Try broader search without exact_match AND without fields restriction
    // CRITICAL: When fields=email, Pipedrive might not search structured email fields [{ value, label }]
    // Searching without fields parameter does a broader search across all person data
    try {
      const broadData = await circuitBreaker.execute(async () => {
        const broadParams = new URLSearchParams({ 
          api_token: apiKey,
          term: email
          // NO exact_match - allows case-insensitive matching
          // NO fields - searches across ALL person fields (name, email, phone, etc.)
        });
        
        return await fetchJSONWithRetry(
          `${baseUrl}/persons/search?${broadParams}`,
          {},
          {
            timeout: 5000,
            maxRetries: 2,
            initialDelay: 1000,
            shouldRetry: (error, response) => {
              if (error) return true;
              if (response && response.status >= 500) return true;
              return false;
            }
          }
        );
      });
      
      console.log('[pipedrive-service] Broad search response:', {
        success: broadData.success,
        has_data: !!broadData.data,
        items_count: broadData.data?.items?.length || 0
      });
      
      if (broadData.success && broadData.data && broadData.data.items && broadData.data.items.length > 0) {
        console.log('[pipedrive-service] Broad search - FOUND RESULTS:', broadData.data.items.length);
        await logger.info('Pipedrive broad search - API returned results', {
          component: 'pipedrive-service',
          email: email.substring(0, 15) + '...',
          items_count: broadData.data.items.length,
          search_strategy: 'broad_no_fields'
        });
        
        // Manually validate email match (case-insensitive)
        const searchLower = email.toLowerCase();
        for (const item of broadData.data.items) {
          const person = item.item;
          
          // CRITICAL: Collect ALL possible email values from different field structures
          const emailValues = [];
          
          // 1. person.email - can be string OR array of objects
          if (person.email) {
            if (typeof person.email === 'string') {
              emailValues.push(person.email);
            } else if (Array.isArray(person.email)) {
              // Handle array format: [{ value: "email@...", label: "work" }]
              for (const emailObj of person.email) {
                if (emailObj && emailObj.value) {
                  emailValues.push(emailObj.value);
                }
              }
            }
          }
          
          // 2. person.primary_email - always string if exists
          if (person.primary_email) {
            emailValues.push(person.primary_email);
          }
          
          // 3. person.emails - array (note plural)
          if (person.emails && Array.isArray(person.emails)) {
            for (const emailItem of person.emails) {
              if (typeof emailItem === 'string') {
                emailValues.push(emailItem);
              } else if (emailItem && emailItem.value) {
                emailValues.push(emailItem.value);
              }
            }
          }
          
          // Remove duplicates and nulls
          const uniqueEmails = [...new Set(emailValues.filter(Boolean))];
          
          console.log(`[pipedrive-service] Checking person ${person.id}:`, {
            name: person.name,
            emails: uniqueEmails,
            searching_for: email
          });
          
          await logger.info('Pipedrive broad search - checking person', {
            component: 'pipedrive-service',
            person_id: person.id,
            person_name: person.name || 'N/A',
            emails_found: uniqueEmails,
            emails_count: uniqueEmails.length,
            searching_for: email.substring(0, 15) + '...'
          });
          
          // Check if any email matches (case-insensitive)
          for (const personEmail of uniqueEmails) {
            if (personEmail.toLowerCase() === searchLower) {
              await logger.info('Pipedrive email search - broad match found', {
                component: 'pipedrive-service',
                email: email.substring(0, 15) + '...',
                person_id: person.id,
                search_strategy: 'broad_match',
                matched_email: personEmail,
                all_emails_found: uniqueEmails.length
              });
              return person.id;
            }
          }
        }
        
        await logger.warn('Pipedrive email search - items found but no email match', {
          component: 'pipedrive-service',
          email: email.substring(0, 15) + '...',
          items_found: broadData.data.items.length
        });
      }
    } catch (broadError) {
      await logger.error('Pipedrive email broad search failed', {
        component: 'pipedrive-service',
        email: email.substring(0, 15) + '...',
        error: broadError.message,
        stack: broadError.stack
      });
    }
    
    console.log('[pipedrive-service] searchPersonByEmail - NO MATCH FOUND');
    return null;
  } catch (error) {
    console.error('[pipedrive-service] FATAL ERROR in searchPersonByEmail:', error);
    await logger.error('Pipedrive email search - FATAL ERROR', {
      component: 'pipedrive-service',
      email: email.substring(0, 15) + '...',
      error: error.message,
      stack: error.stack,
      error_type: error.constructor.name
    });
    return null;
  }
}

/**
 * Search for person by name (first_name + last_name)
 * IMPROVED: Added detailed logging for debugging
 */
async function searchPersonByName(apiKey, firstName, lastName) {
  const baseUrl = 'https://api.pipedrive.com/v1';
  const logger = createLogger({});
  
  if (!firstName && !lastName) {
    return null;
  }
  
  // Build search term from name components
  const nameParts = [];
  if (firstName) nameParts.push(firstName.trim());
  if (lastName) nameParts.push(lastName.trim());
  const searchTerm = nameParts.join(' ').trim();
  
  if (!searchTerm) {
    return null;
  }
  
  try {
    const circuitBreaker = getPipedriveCircuitBreaker();
    
    // Use circuit breaker to wrap the API call
    const nameData = await circuitBreaker.execute(async () => {
      const nameParams = new URLSearchParams({ 
        api_token: apiKey,
        term: searchTerm,
        fields: 'name'
      });
      
      return await fetchJSONWithRetry(
        `${baseUrl}/persons/search?${nameParams}`,
        {},
        {
          timeout: 5000,
          maxRetries: 2,
          initialDelay: 1000,
          shouldRetry: (error, response) => {
            // Retry on network errors or 5xx errors
            if (error) return true;
            if (response && response.status >= 500) return true;
            return false;
          }
        }
      );
    });
    
    if (nameData.success && nameData.data && nameData.data.items && nameData.data.items.length > 0) {
      // Return first match
      const personId = nameData.data.items[0].item.id;
      await logger.info('Pipedrive name search - match found', {
        component: 'pipedrive-service',
        search_term: searchTerm,
        person_id: personId,
        items_found: nameData.data.items.length
      });
      return personId;
    }
    
    await logger.info('Pipedrive name search - no match', {
      component: 'pipedrive-service',
      search_term: searchTerm,
      items_found: nameData.data?.items?.length || 0
    });
    
    return null;
  } catch (error) {
    await logger.error('Pipedrive name search - FATAL ERROR', {
      component: 'pipedrive-service',
      search_term: searchTerm,
      error: error.message,
      stack: error.stack,
      error_type: error.constructor.name
    });
    return null;
  }
}

/**
 * Find and update person in Pipedrive
 * Searches by email first, then by name if email not found
 * Returns person ID if found and updated, null if not found
 * Does NOT create new persons
 */
export async function findOrCreatePerson(env, trackingData) {
  const logger = createLogger(env);
  const startTime = Date.now();
  const apiKey = env.PIPEDRIVE_API_KEY;
  const circuitBreaker = getPipedriveCircuitBreaker();
  
  await logger.info('findOrCreatePerson - function called', {
    component: 'pipedrive-service',
    event_id: trackingData.event_id,
    email: trackingData.email,
    has_api_key: !!apiKey
  });
  
  if (!apiKey) {
    await logger.error('findOrCreatePerson - FATAL: PIPEDRIVE_API_KEY not configured', {
      component: 'pipedrive-service',
      event_id: trackingData.event_id
    });
    return { personId: null, status: 'error', reason: 'API key not configured' };
  }
  
  try {
    const pipedriveData = mapToPipedriveFields(trackingData);
    
    await logger.info('findOrCreatePerson - data mapped', {
      component: 'pipedrive-service',
      event_id: trackingData.event_id,
      field_count: Object.keys(pipedriveData).length
    });
    
    // Check circuit breaker state before attempting
    const breakerState = circuitBreaker.getState();
    
    await logger.info('findOrCreatePerson - circuit breaker checked', {
      component: 'pipedrive-service',
      event_id: trackingData.event_id,
      breaker_state: breakerState.state,
      can_attempt: breakerState.state !== 'OPEN' || breakerState.canAttempt
    });
    
    if (breakerState.state === 'OPEN' && !breakerState.canAttempt) {
      await logger.warn('findOrCreatePerson - circuit breaker OPEN', {
        component: 'pipedrive-service',
        event_id: trackingData.event_id,
        nextAttempt: new Date(breakerState.nextAttempt).toISOString()
      });
      return { personId: null, status: 'error', reason: 'Circuit breaker open' };
    }
    
    let existingPersonId = null;
    let searchMethod = null;
    
    // Step 1: Search by email first
    if (trackingData.email) {
      const emailSearchStart = Date.now();
      await logger.info('findOrCreatePerson - searching by email', {
        component: 'pipedrive-service',
        event_id: trackingData.event_id,
        email: trackingData.email
      });
      
      existingPersonId = await searchPersonByEmail(apiKey, trackingData.email);
      const emailSearchDuration = Date.now() - emailSearchStart;
      
      if (existingPersonId) {
        searchMethod = 'email';
        await logger.info('findOrCreatePerson - person found by email', {
          component: 'pipedrive-service',
          event_id: trackingData.event_id,
          person_id: existingPersonId,
          search_duration_ms: emailSearchDuration
        });
      } else {
        await logger.info('findOrCreatePerson - person NOT found by email', {
          component: 'pipedrive-service',
          event_id: trackingData.event_id,
          email: trackingData.email,
          search_duration_ms: emailSearchDuration
        });
      }
    }
    
    // Step 2: If not found by email, search by name
    if (!existingPersonId && trackingData.first_name && trackingData.last_name) {
      const nameSearchStart = Date.now();
      await logger.info('findOrCreatePerson - searching by name', {
        component: 'pipedrive-service',
        event_id: trackingData.event_id,
        first_name: trackingData.first_name,
        last_name: trackingData.last_name
      });
      
      existingPersonId = await searchPersonByName(
      apiKey,
        trackingData.first_name,
        trackingData.last_name
      );
      const nameSearchDuration = Date.now() - nameSearchStart;
      
      if (existingPersonId) {
        searchMethod = 'name';
        await logger.info('findOrCreatePerson - person found by name', {
          component: 'pipedrive-service',
          event_id: trackingData.event_id,
          person_id: existingPersonId,
          search_duration_ms: nameSearchDuration
        });
      } else {
        await logger.info('findOrCreatePerson - person NOT found by name', {
          component: 'pipedrive-service',
          event_id: trackingData.event_id,
          search_duration_ms: nameSearchDuration
        });
      }
    }
    
    // If person not found, return null status
    if (!existingPersonId) {
      const totalDuration = Date.now() - startTime;
      await logger.warn('findOrCreatePerson - person NOT FOUND in Pipedrive', {
        component: 'pipedrive-service',
        event_id: trackingData.event_id,
        total_duration_ms: totalDuration,
        email: trackingData.email || 'none',
        first_name: trackingData.first_name || 'none',
        last_name: trackingData.last_name || 'none'
      });
      return { personId: null, status: 'not_found', reason: 'Person not found by email or name' };
    }
    
    // Update existing person
    const baseUrl = 'https://api.pipedrive.com/v1';
    const params = new URLSearchParams({ api_token: apiKey });
    
    await logger.info('findOrCreatePerson - attempting Pipedrive API update', {
      component: 'pipedrive-service',
      event_id: trackingData.event_id,
      person_id: existingPersonId,
      field_count: Object.keys(pipedriveData).length,
      url: `${baseUrl}/persons/${existingPersonId}`
    });
    
    const apiUpdateStart = Date.now();
    try {
      const updateResult = await circuitBreaker.execute(async () => {
        return await fetchJSONWithRetry(
          `${baseUrl}/persons/${existingPersonId}?${params}`,
          {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(pipedriveData)
          },
          {
            timeout: 5000,
            maxRetries: 2,
            initialDelay: 1000,
            shouldRetry: (error, response) => {
              if (error) return true;
              if (response && response.status >= 500) return true;
              return false;
            }
          }
        );
      });
      const apiUpdateDuration = Date.now() - apiUpdateStart;
      const totalDuration = Date.now() - startTime;
      
      if (updateResult.success) {
        await logger.info('findOrCreatePerson - Pipedrive API update SUCCESS', {
          component: 'pipedrive-service',
          person_id: existingPersonId,
          event_id: trackingData.event_id,
          search_method: searchMethod,
          api_duration_ms: apiUpdateDuration,
          total_duration_ms: totalDuration
        });
        return { personId: updateResult.data.id, status: 'synced', reason: `Found by ${searchMethod}` };
      } else {
        await logger.error('findOrCreatePerson - Pipedrive API update FAILED', {
          component: 'pipedrive-service',
          error: updateResult.error,
          person_id: existingPersonId,
          event_id: trackingData.event_id,
          api_duration_ms: apiUpdateDuration,
          total_duration_ms: totalDuration
        });
        return { personId: existingPersonId, status: 'error', reason: updateResult.error || 'Update failed' };
      }
    } catch (apiError) {
      const apiUpdateDuration = Date.now() - apiUpdateStart;
      const totalDuration = Date.now() - startTime;
      await logger.error('findOrCreatePerson - Pipedrive API update EXCEPTION', {
        component: 'pipedrive-service',
        error: apiError.message,
        stack: apiError.stack,
        person_id: existingPersonId,
        event_id: trackingData.event_id,
        api_duration_ms: apiUpdateDuration,
        total_duration_ms: totalDuration
      });
      throw apiError;
    }
  } catch (error) {
    // Check if error is from circuit breaker
    if (error.message && error.message.includes('Circuit breaker')) {
      await logger.warn('Pipedrive API circuit breaker prevented request', {
        event_id: trackingData.event_id,
        error: error.message
      });
      return { personId: null, status: 'error', reason: 'Circuit breaker error' };
    } else {
      await logger.error('Error in findOrCreatePerson', {
        error: error.message,
        stack: error.stack,
        event_id: trackingData.event_id
      });
      return { personId: null, status: 'error', reason: error.message || 'Unknown error' };
    }
  }
}

