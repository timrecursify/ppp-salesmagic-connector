/**
 * URL Utilities Service
 * Unified URL parameter extraction and parsing
 */

/**
 * Extract all query parameters from URL
 */
export function extractURLParams(url) {
  if (!url) return {};
  
  try {
    const urlObj = new URL(url);
    const params = {};
    
    for (const [key, value] of urlObj.searchParams.entries()) {
      params[key.toLowerCase()] = decodeURIComponent(value);
    }
    
    return params;
  } catch (e) {
    return {};
  }
}

/**
 * Extract specific parameters from URL
 */
export function extractSpecificParams(url, paramKeys) {
  const allParams = extractURLParams(url);
  const extracted = {};
  
  for (const key of paramKeys) {
    const keyLower = key.toLowerCase();
    if (allParams[keyLower]) {
      extracted[keyLower] = allParams[keyLower];
    }
  }
  
  return extracted;
}

