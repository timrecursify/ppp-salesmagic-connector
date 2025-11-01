/**
 * UTM Service
 * Handles UTM parameter extraction and attribution logic
 */

const UTM_PARAMS = [
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term',
  'gclid', 'fbclid', 'msclkid', 'ttclid', 'twclid', 'li_fat_id',
  'sc_click_id', 'campaign_region', 'ad_group', 'ad_id', 'search_query'
];

/**
 * Extract UTM parameters from data object
 */
export function extractUTMParams(data) {
  return Object.fromEntries(
    UTM_PARAMS.map(key => [key, data[key] || null])
  );
}

/**
 * Extract UTM parameters from URL string
 */
export function extractUTMParamsFromURL(url) {
  if (!url) return {};
  
  try {
    const urlObj = new URL(url);
    const params = {};
    
    for (const [key, value] of urlObj.searchParams.entries()) {
      const keyLower = key.toLowerCase();
      if (UTM_PARAMS.includes(keyLower) || keyLower.startsWith('utm_')) {
        params[keyLower] = decodeURIComponent(value);
      }
    }
    
    return params;
  } catch (e) {
    return {};
  }
}

/**
 * Extract attribution from multiple sources (page URL + referrer)
 */
export function extractAttributionFromURLs(pageUrl, referrerUrl) {
  const attribution = {};
  
  // Extract from page URL (primary source)
  if (pageUrl) {
    Object.assign(attribution, extractUTMParamsFromURL(pageUrl));
  }
  
  // Fallback to referrer URL if params missing
  if (referrerUrl) {
    const referrerParams = extractUTMParamsFromURL(referrerUrl);
    for (const [key, value] of Object.entries(referrerParams)) {
      if (!attribution[key] && value) {
        attribution[key] = value;
      }
    }
  }
  
  return attribution;
}

/**
 * Create attribution summary from UTM data
 */
export function createAttributionSummary(utmData) {
  const source = utmData.utm_source || 
    (utmData.gclid ? 'google' : null) ||
    (utmData.fbclid ? 'facebook' : null) ||
    (utmData.msclkid ? 'microsoft' : null) ||
    (utmData.ttclid ? 'tiktok' : null) ||
    (utmData.twclid ? 'twitter' : null) ||
    'direct';

  const medium = utmData.utm_medium || 
    (utmData.gclid ? 'cpc' : null) ||
    (utmData.fbclid ? 'social' : null) ||
    'unknown';

  const campaign = utmData.utm_campaign || 
    utmData.ad_group || 
    'none';

  return { source, medium, campaign };
}

