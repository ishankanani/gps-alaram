export function formatDistance(meters: number, useMiles = false): string {
  if (useMiles) {
    const miles = meters / 1609.344;
    if (miles < 0.1) return `${Math.round((meters * 3.28084) / 10) * 10} ft`;
    return `${miles.toFixed(1)} mi`;
  }
  if (meters < 1000) return `${Math.round(meters / 10) * 10} m`;
  if (meters < 10_000) return `${(meters / 1000).toFixed(1)} km`;
  return `${Math.round(meters / 1000)} km`;
}

export function formatDuration(seconds: number): string {
  const minutes = Math.round(seconds / 60);
  if (minutes < 1) return '<1 min';
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
}

/** Short label for a radius chip: 500 m, 1 km. */
export function formatRadius(meters: number, useMiles = false): string {
  if (useMiles) return formatDistance(meters, true);
  return meters < 1000 ? `${meters} m` : `${meters / 1000} km`;
}
