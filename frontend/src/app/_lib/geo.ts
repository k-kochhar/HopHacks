/**
 * Geolocation utilities
 */

/**
 * Calculate distance between two points using Haversine formula
 * @param lat1 Latitude of first point
 * @param lon1 Longitude of first point  
 * @param lat2 Latitude of second point
 * @param lon2 Longitude of second point
 * @returns Distance in meters
 */
export function toMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000; // Earth's radius in meters
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

/**
 * Format coordinates for display
 * @param lat Latitude
 * @param lon Longitude
 * @returns Formatted coordinate string
 */
export function formatCoord(lat: number, lon: number): string {
  return `${lat.toFixed(5)}, ${lon.toFixed(5)}`;
}

// Default campus center coordinates (Johns Hopkins University)
export const DEFAULT_LAT = 39.3299;
export const DEFAULT_LON = -76.6205;
