/**
 * Tracking Event Handler Utilities
 * Extracted handlers for tracking route to reduce complexity
 */

/**
 * Extract form data from URL parameters
 * ONLY extracts: first_name, last_name, email (UTM params handled separately)
 */
export function extractFormDataFromURL(url) {
  if (!url) return null;
  
  // ONLY allow these fields - nothing else!
  const allowedFields = {
    'first_name': ['fname', 'firstname', 'first_name', 'first-name', 'f_name'],
    'last_name': ['lname', 'lastname', 'last_name', 'last-name', 'l_name'],
    'email': ['email', 'mail', 'e-mail', 'email_address', 'emailaddress']
  };
  
  const trackingParams = [
    'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term',
    'gclid', 'fbclid', 'msclkid', 'ttclid', 'twclid', 'li_fat_id',
    'sc_click_id', 'igshid', 'yclid', 'region', 'ad_group', 'ad_id',
    'search_query', 'gad_source', 'gad_campaignid', 'gbraid', 'wbraid'
  ];
  
  try {
    const urlObj = new URL(url);
    const formData = {};
    
    for (const [key, value] of urlObj.searchParams.entries()) {
      const normalizedKey = key.toLowerCase().trim();
      
      // Skip tracking parameters (handled separately)
      if (trackingParams.includes(normalizedKey)) continue;
      
      // Only extract allowed fields
      for (const [fieldKey, aliases] of Object.entries(allowedFields)) {
        if (aliases.includes(normalizedKey) && value && value.trim()) {
          formData[fieldKey] = decodeURIComponent(value.trim());
          break;
        }
      }
    }
    
    // Only return if we have at least email (required for Pipedrive search)
    return formData.email && Object.keys(formData).length > 0 ? JSON.stringify(formData) : null;
  } catch (e) {
    return null;
  }
}

/**
 * Parse form data and extract contact info
 */
export function parseFormData(formDataStr) {
  if (!formDataStr) return {};
  
  try {
    return typeof formDataStr === 'string' ? JSON.parse(formDataStr) : formDataStr;
  } catch (e) {
    return {};
  }
}

/**
 * Extract geographic data from Cloudflare request context
 */
export function extractGeographicData(c) {
  let country = null;
  let region = null;
  let city = null;
  
  try {
    if (c.req?.raw?.cf) {
      const cf = c.req.raw.cf;
      country = cf.country || null;
      region = cf.region || null;
      city = cf.city || null;
    }
  } catch (cfError) {
    // CF data optional
  }
  
  return { country, region, city };
}

/**
 * Determine event type based on form data and original event type
 */
export function determineEventType(formData, originalEventType) {
  return (formData || originalEventType === 'form_submit' || originalEventType === 'form_submission') 
    ? 'form_submit' 
    : originalEventType;
}

