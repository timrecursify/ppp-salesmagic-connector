/**
 * Data Formatting Utilities for Pipedrive
 * Formats dates, durations, and location data for Pipedrive fields
 */

/**
 * Format date as human-readable string
 * Format: "January 27, 2025 at 2:30 PM"
 */
export function formatDateForPipedrive(dateString) {
  if (!dateString) return null;
  
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return null;
    
    const month = date.toLocaleString('en-US', { month: 'long' });
    const day = date.getDate();
    const year = date.getFullYear();
    const time = date.toLocaleString('en-US', { 
      hour: 'numeric', 
      minute: '2-digit', 
      hour12: true 
    });
    
    return `${month} ${day}, ${year} at ${time}`;
  } catch (error) {
    return null;
  }
}

/**
 * Calculate and format session duration
 * Format: "15 minutes" or "1h 23m" or "45s"
 */
export function formatSessionDuration(startedAt, lastActivity) {
  if (!startedAt || !lastActivity) return null;
  
  try {
    const start = new Date(startedAt);
    const end = new Date(lastActivity);
    
    if (isNaN(start.getTime()) || isNaN(end.getTime())) return null;
    
    const durationMs = end.getTime() - start.getTime();
    if (durationMs < 0) return null;
    
    const hours = Math.floor(durationMs / (1000 * 60 * 60));
    const minutes = Math.floor((durationMs % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((durationMs % (1000 * 60)) / 1000);
    
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    } else if (minutes > 0) {
      return `${minutes} minute${minutes !== 1 ? 's' : ''}`;
    } else {
      return `${seconds} second${seconds !== 1 ? 's' : ''}`;
    }
  } catch (error) {
    return null;
  }
}

/**
 * Format location string from city, region, country
 * Format: "Washington, DC, USA" or "City, Region, Country"
 */
export function formatLocation(city, region, country) {
  const parts = [];
  
  if (city && city.trim()) parts.push(city.trim());
  if (region && region.trim()) parts.push(region.trim());
  if (country && country.trim()) parts.push(country.trim());
  
  return parts.length > 0 ? parts.join(', ') : null;
}

