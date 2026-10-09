/** German writes 1,2 km. */
function decimal(value: number, lang: string): string {
  const text = value.toFixed(1);
  return lang === 'de' ? text.replace('.', ',') : text;
}

export function formatDistance(meters: number, useMiles = false, lang = 'en'): string {
  if (useMiles) {
    const miles = meters / 1609.344;
    if (miles < 0.1) return `${Math.round((meters * 3.28084) / 10) * 10} ft`;
    return `${decimal(miles, lang)} mi`;
  }
  if (meters < 1000) return `${Math.round(meters / 10) * 10} m`;
  if (meters < 10_000) return `${decimal(meters / 1000, lang)} km`;
  return `${Math.round(meters / 1000)} km`;
}

export function formatDuration(seconds: number): string {
  const minutes = Math.round(seconds / 60);
  if (minutes < 1) return '<1 min';
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
}

/** Short label for a radius chip: 500 m, 1 km. */
export function formatRadius(meters: number, useMiles = false, lang = 'en'): string {
  if (useMiles) return formatDistance(meters, true, lang);
  return meters < 1000 ? `${meters} m` : `${meters / 1000} km`;
}

/** Download sizes: 850 KB, 4.2 MB, 38 MB. */
export function formatBytes(bytes: number, lang = 'en'): string {
  if (bytes < 1_000_000) return `${Math.max(1, Math.round(bytes / 1000))} KB`;
  if (bytes < 10_000_000) return `${decimal(bytes / 1_000_000, lang)} MB`;
  return `${Math.round(bytes / 1_000_000)} MB`;
}

/** 12345 as 12,345 (12.345 in German). */
export function formatCount(n: number, lang = 'en'): string {
  const text = Math.round(n)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return lang === 'de' ? text.replace(/,/g, '.') : text;
}
