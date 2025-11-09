/**
 * Tracking Event Handler Utilities
 * Extracted handlers for tracking route to reduce complexity
 */

/**
 * Extract form data from URL parameters
 * Extracts all non-UTM parameters as form data (maintains backward compatibility)
 */
export function extractFormDataFromURL(url) {
  if (!url) return null;
  
  // Normalize field names for consistency
  function normalizeFieldName(name) {
    if (!name) return null;
    return name.toLowerCase().trim().replace(/-/g, '_');
  }
  
  // Check if field name indicates email (for validation)
  function isEmailField(name) {
    if (!name) return false;
    const normalized = name.toLowerCase();
    return normalized.indexOf('email') !== -1 || 
           normalized.indexOf('mail') !== -1 ||
           normalized === 'e-mail' ||
           normalized === 'e_mail';
  }
  
  const trackingParams = [
    'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term',
    'gclid', 'fbclid', 'msclkid', 'ttclid', 'twclid', 'li_fat_id',
    'sc_click_id', 'igshid', 'yclid', 'region', 'ad_group', 'ad_id',
    'search_query', 'gad_source', 'gad_campaignid', 'gbraid', 'wbraid'
  ];
  
  try {
    const urlObj = new URL(url);
    const formData = {};
    let hasEmail = false;
    
    for (const [key, value] of urlObj.searchParams.entries()) {
      const normalizedKey = normalizeFieldName(key);
      
      // Skip tracking parameters (handled separately)
      if (!normalizedKey || trackingParams.includes(normalizedKey)) continue;
      
      // Skip empty values
      if (!value || !value.trim()) continue;
      
      // Normalize field name and store
      const cleanKey = normalizedKey.replace(/[<>'"]/g, '').trim();
      if (!cleanKey) continue;
      
      // Special handling for common field name variations
      let fieldKey = cleanKey;
      if (cleanKey === 'first-name' || cleanKey === 'firstname' || cleanKey === 'fname' || cleanKey === 'f_name') {
        fieldKey = 'first_name';
      } else if (cleanKey === 'last-name' || cleanKey === 'lastname' || cleanKey === 'lname' || cleanKey === 'l_name') {
        fieldKey = 'last_name';
      } else if (isEmailField(cleanKey)) {
        fieldKey = 'email';
        hasEmail = true;
      }
      
          formData[fieldKey] = decodeURIComponent(value.trim());
    }
    
    // Normalize email field if present
    for (const key in formData) {
      if (isEmailField(key) && key !== 'email') {
        formData.email = formData[key];
        hasEmail = true;
      }
    }
    
    // Only return if we have at least email (required for Pipedrive search)
    return hasEmail && formData.email && Object.keys(formData).length > 0 ? JSON.stringify(formData) : null;
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

