/**
 * Cookie Utilities Service
 * Unified cookie generation for visitors and sessions
 */

/**
 * Generate random cookie value
 */
function generateCookieValue(length = 16) {
  const randomBytes = Array.from(crypto.getRandomValues(new Uint8Array(length)))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
  return randomBytes;
}

/**
 * Generate visitor cookie
 */
export function generateVisitorCookie() {
  return `pxl_${generateCookieValue(8)}`;
}

/**
 * Generate session cookie
 */
export function generateSessionCookie() {
  return `sess_${Date.now()}_${generateCookieValue(8)}`;
}

/**
 * Validate visitor cookie format
 */
export function isValidVisitorCookie(cookie) {
  return cookie && /^pxl_[a-f0-9]{16}$/.test(cookie);
}

