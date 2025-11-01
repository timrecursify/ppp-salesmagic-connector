/**
 * Browser Detection Service
 * Unified browser/device detection from User-Agent
 */

/**
 * Extract browser and OS data from User-Agent
 */
export function extractBrowserData(userAgent) {
  if (!userAgent || typeof userAgent !== 'string') {
    userAgent = 'unknown';
  }
  
  // Browser detection
  let browser = 'unknown';
  if (userAgent.includes('Chrome')) browser = 'Chrome';
  else if (userAgent.includes('Firefox')) browser = 'Firefox';
  else if (userAgent.includes('Safari')) browser = 'Safari';
  else if (userAgent.includes('Edge')) browser = 'Edge';
  else if (userAgent.includes('Opera')) browser = 'Opera';

  // OS detection
  let os = 'unknown';
  if (userAgent.includes('Windows')) os = 'Windows';
  else if (userAgent.includes('Mac')) os = 'macOS';
  else if (userAgent.includes('Linux')) os = 'Linux';
  else if (userAgent.includes('Android')) os = 'Android';
  else if (userAgent.includes('iOS')) os = 'iOS';

  return JSON.stringify({ browser, os, user_agent: userAgent });
}

/**
 * Extract device type from User-Agent
 */
export function extractDeviceData(userAgent) {
  const isMobile = /Mobile|Android|iPhone|iPad/i.test(userAgent);
  const isTablet = /iPad|Android/i.test(userAgent) && !/Mobile/i.test(userAgent);
  const isDesktop = !isMobile && !isTablet;

  return JSON.stringify({
    type: isMobile ? 'mobile' : isTablet ? 'tablet' : 'desktop',
    mobile: isMobile,
    tablet: isTablet,
    desktop: isDesktop
  });
}

