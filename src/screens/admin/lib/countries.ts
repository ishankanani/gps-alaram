// ISO 3166-1 alpha-2 countries with English short names, for the country picker, price rows and
// user meta lines. Flags are regional-indicator emoji built from the code. Pure.

const DATA =
  'AD:Andorra|AE:United Arab Emirates|AF:Afghanistan|AG:Antigua and Barbuda|AI:Anguilla|AL:Albania|AM:Armenia|' +
  'AO:Angola|AQ:Antarctica|AR:Argentina|AS:American Samoa|AT:Austria|AU:Australia|AW:Aruba|AX:Åland Islands|' +
  'AZ:Azerbaijan|BA:Bosnia and Herzegovina|BB:Barbados|BD:Bangladesh|BE:Belgium|BF:Burkina Faso|BG:Bulgaria|' +
  'BH:Bahrain|BI:Burundi|BJ:Benin|BL:Saint Barthélemy|BM:Bermuda|BN:Brunei|BO:Bolivia|BQ:Caribbean Netherlands|' +
  'BR:Brazil|BS:Bahamas|BT:Bhutan|BV:Bouvet Island|BW:Botswana|BY:Belarus|BZ:Belize|CA:Canada|' +
  'CC:Cocos (Keeling) Islands|CD:Congo (DRC)|CF:Central African Republic|CG:Congo|CH:Switzerland|' +
  'CI:Côte d’Ivoire|CK:Cook Islands|CL:Chile|CM:Cameroon|CN:China|CO:Colombia|CR:Costa Rica|CU:Cuba|' +
  'CV:Cape Verde|CW:Curaçao|CX:Christmas Island|CY:Cyprus|CZ:Czechia|DE:Germany|DJ:Djibouti|DK:Denmark|' +
  'DM:Dominica|DO:Dominican Republic|DZ:Algeria|EC:Ecuador|EE:Estonia|EG:Egypt|EH:Western Sahara|ER:Eritrea|' +
  'ES:Spain|ET:Ethiopia|FI:Finland|FJ:Fiji|FK:Falkland Islands|FM:Micronesia|FO:Faroe Islands|FR:France|' +
  'GA:Gabon|GB:United Kingdom|GD:Grenada|GE:Georgia|GF:French Guiana|GG:Guernsey|GH:Ghana|GI:Gibraltar|' +
  'GL:Greenland|GM:Gambia|GN:Guinea|GP:Guadeloupe|GQ:Equatorial Guinea|GR:Greece|' +
  'GS:South Georgia and the South Sandwich Islands|GT:Guatemala|GU:Guam|GW:Guinea-Bissau|GY:Guyana|' +
  'HK:Hong Kong|HM:Heard and McDonald Islands|HN:Honduras|HR:Croatia|HT:Haiti|HU:Hungary|ID:Indonesia|' +
  'IE:Ireland|IL:Israel|IM:Isle of Man|IN:India|IO:British Indian Ocean Territory|IQ:Iraq|IR:Iran|IS:Iceland|' +
  'IT:Italy|JE:Jersey|JM:Jamaica|JO:Jordan|JP:Japan|KE:Kenya|KG:Kyrgyzstan|KH:Cambodia|KI:Kiribati|KM:Comoros|' +
  'KN:Saint Kitts and Nevis|KP:North Korea|KR:South Korea|KW:Kuwait|KY:Cayman Islands|KZ:Kazakhstan|LA:Laos|' +
  'LB:Lebanon|LC:Saint Lucia|LI:Liechtenstein|LK:Sri Lanka|LR:Liberia|LS:Lesotho|LT:Lithuania|LU:Luxembourg|' +
  'LV:Latvia|LY:Libya|MA:Morocco|MC:Monaco|MD:Moldova|ME:Montenegro|MF:Saint Martin|MG:Madagascar|' +
  'MH:Marshall Islands|MK:North Macedonia|ML:Mali|MM:Myanmar|MN:Mongolia|MO:Macao|MP:Northern Mariana Islands|' +
  'MQ:Martinique|MR:Mauritania|MS:Montserrat|MT:Malta|MU:Mauritius|MV:Maldives|MW:Malawi|MX:Mexico|' +
  'MY:Malaysia|MZ:Mozambique|NA:Namibia|NC:New Caledonia|NE:Niger|NF:Norfolk Island|NG:Nigeria|NI:Nicaragua|' +
  'NL:Netherlands|NO:Norway|NP:Nepal|NR:Nauru|NU:Niue|NZ:New Zealand|OM:Oman|PA:Panama|PE:Peru|' +
  'PF:French Polynesia|PG:Papua New Guinea|PH:Philippines|PK:Pakistan|PL:Poland|PM:Saint Pierre and Miquelon|' +
  'PN:Pitcairn Islands|PR:Puerto Rico|PS:Palestine|PT:Portugal|PW:Palau|PY:Paraguay|QA:Qatar|RE:Réunion|' +
  'RO:Romania|RS:Serbia|RU:Russia|RW:Rwanda|SA:Saudi Arabia|SB:Solomon Islands|SC:Seychelles|SD:Sudan|' +
  'SE:Sweden|SG:Singapore|SH:Saint Helena|SI:Slovenia|SJ:Svalbard and Jan Mayen|SK:Slovakia|SL:Sierra Leone|' +
  'SM:San Marino|SN:Senegal|SO:Somalia|SR:Suriname|SS:South Sudan|ST:São Tomé and Príncipe|SV:El Salvador|' +
  'SX:Sint Maarten|SY:Syria|SZ:Eswatini|TC:Turks and Caicos Islands|TD:Chad|TF:French Southern Territories|' +
  'TG:Togo|TH:Thailand|TJ:Tajikistan|TK:Tokelau|TL:Timor-Leste|TM:Turkmenistan|TN:Tunisia|TO:Tonga|TR:Türkiye|' +
  'TT:Trinidad and Tobago|TV:Tuvalu|TW:Taiwan|TZ:Tanzania|UA:Ukraine|UG:Uganda|UM:U.S. Outlying Islands|' +
  'US:United States|UY:Uruguay|UZ:Uzbekistan|VA:Vatican City|VC:Saint Vincent and the Grenadines|VE:Venezuela|' +
  'VG:British Virgin Islands|VI:U.S. Virgin Islands|VN:Vietnam|VU:Vanuatu|WF:Wallis and Futuna|WS:Samoa|' +
  'XK:Kosovo|YE:Yemen|YT:Mayotte|ZA:South Africa|ZM:Zambia|ZW:Zimbabwe';

export type Country = { code: string; name: string };

/** Folds accents and case for searching ("Reunion" finds "Réunion"). */
function fold(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

/** Every country, sorted by English name. */
export const COUNTRIES: readonly Country[] = DATA.split('|')
  .map((entry) => {
    const [code, name] = entry.split(':');
    return { code, name };
  })
  .sort((a, b) => (fold(a.name) < fold(b.name) ? -1 : fold(a.name) > fold(b.name) ? 1 : 0));

const BY_CODE = new Map(COUNTRIES.map((c) => [c.code, c.name]));

/** The English name of an ISO code, or the code itself when unknown. */
export function countryName(code: string | null | undefined): string {
  if (!code) return '';
  const upper = code.toUpperCase();
  return BY_CODE.get(upper) ?? upper;
}

export function isCountryCode(code: string): boolean {
  return BY_CODE.has(code.toUpperCase());
}

/** "DE" → 🇩🇪; anything that isn't two letters → an empty string. */
export function flagEmoji(code: string | null | undefined): string {
  if (!code || !/^[A-Za-z]{2}$/.test(code)) return '';
  const base = 0x1f1e6;
  const upper = code.toUpperCase();
  return String.fromCodePoint(base + upper.charCodeAt(0) - 65, base + upper.charCodeAt(1) - 65);
}

/** Countries whose name or code matches; an exact code comes first. */
export function searchCountries(query: string, list: readonly Country[] = COUNTRIES): Country[] {
  const q = fold(query.trim());
  if (!q) return [...list];
  const exact = list.filter((c) => c.code.toLowerCase() === q);
  const rest = list.filter((c) => c.code.toLowerCase() !== q && fold(c.name).includes(q));
  const starts = rest.filter((c) => fold(c.name).startsWith(q));
  const contains = rest.filter((c) => !fold(c.name).startsWith(q));
  return [...exact, ...starts, ...contains];
}
