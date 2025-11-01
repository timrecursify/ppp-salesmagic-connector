/**
 * Pipedrive Service
 * Direct integration with Pipedrive API for Person creation/updates
 */

import { createLogger } from '../utils/workerLogger.js';
import { fetchJSONWithRetry } from '../utils/fetchWithRetry.js';
import { getPipedriveCircuitBreaker } from '../utils/circuitBreaker.js';

// Pipedrive Person field mappings (custom field keys)
const FIELD_MAPPING = {
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
  // Only include non-null values
  for (const [ourKey, pipedriveKey] of Object.entries(FIELD_MAPPING)) {
    if (trackingData[ourKey] && 
        !['name', 'email', 'first_name', 'last_name'].includes(ourKey)) {
      // Convert to string and trim
      const value = String(trackingData[ourKey]).trim();
      if (value && value !== 'null' && value !== 'undefined') {
        pipedriveData[pipedriveKey] = value;
      }
    }
  }
  
  return pipedriveData;
}

/**
 * Search for person by email
 */
async function searchPersonByEmail(apiKey, email) {
  const baseUrl = 'https://api.pipedrive.com/v1';
  
  if (!email) {
    return null;
  }
  
  try {
    const circuitBreaker = getPipedriveCircuitBreaker();
    
    // Use circuit breaker to wrap the API call
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
            // Retry on network errors or 5xx errors
            if (error) return true;
            if (response && response.status >= 500) return true;
            return false;
          }
        }
      );
    });
    
    if (emailData.success && emailData.data && emailData.data.items && emailData.data.items.length > 0) {
      return emailData.data.items[0].item.id;
    }
    
    return null;
  } catch (error) {
    // Circuit breaker errors are handled gracefully
    return null;
  }
}

/**
 * Search for person by name (first_name + last_name)
 */
async function searchPersonByName(apiKey, firstName, lastName) {
  const baseUrl = 'https://api.pipedrive.com/v1';
  
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
      return nameData.data.items[0].item.id;
    }
    
    return null;
  } catch (error) {
    // Circuit breaker errors are handled gracefully
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
  const apiKey = env.PIPEDRIVE_API_KEY;
  const circuitBreaker = getPipedriveCircuitBreaker();
  
  if (!apiKey) {
    await logger.error('PIPEDRIVE_API_KEY not configured');
    return { personId: null, status: 'error', reason: 'API key not configured' };
  }
  
  try {
    const pipedriveData = mapToPipedriveFields(trackingData);
    
    // Check circuit breaker state before attempting
    const breakerState = circuitBreaker.getState();
    if (breakerState.state === 'OPEN' && !breakerState.canAttempt) {
      await logger.warn('Pipedrive API circuit breaker is OPEN, skipping sync', {
        event_id: trackingData.event_id,
        nextAttempt: new Date(breakerState.nextAttempt).toISOString()
      });
      return { personId: null, status: 'error', reason: 'Circuit breaker open' };
    }
    
    let existingPersonId = null;
    let searchMethod = null;
    
    // Step 1: Search by email first
    if (trackingData.email) {
      existingPersonId = await searchPersonByEmail(apiKey, trackingData.email);
      if (existingPersonId) {
        searchMethod = 'email';
      }
    }
    
    // Step 2: If not found by email, search by name
    if (!existingPersonId && trackingData.first_name && trackingData.last_name) {
      existingPersonId = await searchPersonByName(
      apiKey,
        trackingData.first_name,
        trackingData.last_name
      );
      if (existingPersonId) {
        searchMethod = 'name';
      }
    }
    
    // If person not found, return null status
    if (!existingPersonId) {
      await logger.info('Person not found in Pipedrive', {
        event_id: trackingData.event_id,
        email: trackingData.email || 'none',
        first_name: trackingData.first_name || 'none',
        last_name: trackingData.last_name || 'none'
      });
      return { personId: null, status: 'not_found', reason: 'Person not found by email or name' };
    }
    
    // Update existing person
    const baseUrl = 'https://api.pipedrive.com/v1';
    const params = new URLSearchParams({ api_token: apiKey });
    
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
      
      if (updateResult.success) {
        await logger.info('Updated person in Pipedrive', {
          person_id: existingPersonId,
        event_id: trackingData.event_id,
        search_method: searchMethod
        });
      return { personId: updateResult.data.id, status: 'synced', reason: `Found by ${searchMethod}` };
      } else {
        await logger.error('Failed to update person in Pipedrive', {
          error: updateResult.error,
        person_id: existingPersonId,
        event_id: trackingData.event_id
      });
      return { personId: existingPersonId, status: 'error', reason: updateResult.error || 'Update failed' };
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

