// Writes modules/trip-alarm/shared/native-strings.json from the Android L10n.kt tables, so the iOS
// port can load the same native alarm and notification texts. Run: node tools/export-native-strings.mjs
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const source = 'modules/trip-alarm/android/src/main/java/com/ishankanani/gpsalarm/tripalarm/L10n.kt';
const target = 'modules/trip-alarm/shared/native-strings.json';

const kt = readFileSync(source, 'utf8');
const languages = {};
for (const table of kt.matchAll(/private val ([A-Z]{2}) = mapOf\(([\s\S]*?)\n {2}\)\n/g)) {
  const strings = {};
  for (const [, key, text] of table[2].matchAll(/"(\w+)" to "(.*?)",\n/g)) strings[key] = text;
  languages[table[1].toLowerCase()] = strings;
}

const keys = Object.keys(languages.en);
for (const [lang, strings] of Object.entries(languages)) {
  const missing = keys.filter((k) => !(k in strings));
  if (missing.length) throw new Error(`${lang} misses ${missing.join(', ')}`);
}

const sorted = { en: languages.en, ...Object.fromEntries(Object.entries(languages).filter(([l]) => l !== 'en').sort(([a], [b]) => a.localeCompare(b))) };
const out = {
  _comment:
    'Native alarm-screen and notification strings per language, generated from android/.../L10n.kt (the source of truth) by tools/export-native-strings.mjs. {name} placeholders are replaced at run time. ar is written right to left.',
  languages: sorted,
};
mkdirSync('modules/trip-alarm/shared', { recursive: true });
writeFileSync(target, `${JSON.stringify(out, null, 2)}\n`);
console.log(`${Object.keys(sorted).length} languages, ${keys.length} keys -> ${target}`);
