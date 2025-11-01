/**
 * Privacy Middleware for GDPR Compliance and Data Protection
 */

/**
 * Do Not Track compliance middleware - DISABLED for non-GDPR regions
 */
export const respectDNT = async (c, next) => {
  // DNT compliance disabled as requested - not targeting GDPR regions
  // const dnt = c.req.header('DNT') || c.req.header('Sec-GPC');
  
  // Always allow tracking regardless of DNT headers
  c.set('dntEnabled', false);
  return await next();
};

/**
 * Get client IP with proper privacy handling
 */
export const getClientIP = (c) => {
  const cfIP = c.req.header('CF-Connecting-IP');
  const forwardedIP = c.req.header('X-Forwarded-For')?.split(',')[0]?.trim();
  const realIP = c.req.header('X-Real-IP');
  
  return cfIP || forwardedIP || realIP || 'unknown';
};

/**
 * Anonymize IP address
 */
export const anonymizeIP = (ip) => {
  if (!ip || typeof ip !== 'string') return 'unknown';
  
  if (ip.includes('.')) {
    const parts = ip.split('.');
    if (parts.length === 4) {
      return `${parts[0]}.${parts[1]}.${parts[2]}.0`;
    }
  }
  
  if (ip.includes(':')) {
    const parts = ip.split(':');
    if (parts.length >= 4) {
      return `${parts.slice(0, 4).join(':')}::`;
    }
  }
  
  return 'anonymized';
};

/**
 * Combined privacy middleware
 */
export const privacyMiddleware = async (c, next) => {
  return await respectDNT(c, next);
}; 