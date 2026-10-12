import type { Key } from '../../i18n';

/** The name of a stop pack's country or region ("Austria", "USA: Northeast"). */
export function countryName(tr: (key: Key) => string, id: string): string {
  return tr(`country.${id}` as Key);
}
