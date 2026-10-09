/** Languages that write 1,2 km. */
const DECIMAL_COMMA = new Set(['de', 'fr', 'nl', 'it', 'sv', 'nb', 'da', 'fi']);

function decimal(value: number, lang: string): string {
  const text = value.toFixed(1);
  return DECIMAL_COMMA.has(lang) ? text.replace('.', ',') : text;
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

/** Thousands separators: 12.345 in German, 12 345 in French and the Nordic languages. */
const THOUSANDS: Record<string, string> = { de: '.', nl: '.', it: '.', da: '.', fr: '\u00a0', sv: '\u00a0', nb: '\u00a0', fi: '\u00a0' };

/** 12345 as 12,345 in English. */
export function formatCount(n: number, lang = 'en'): string {
  return Math.round(n)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, THOUSANDS[lang] ?? ',');
}
