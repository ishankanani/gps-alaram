import type { Strings } from '../en';

/** Strings of the map home: MapSheet browse, search and stop modes, banners and map controls (English keys in ../en/map.ts). */
export const map: Partial<Strings> = {
  // Map controls and overlays
  'map.control.locate': 'Vis min placering',
  'map.control.locateDenied': 'Placering er slået fra. Åbn opsætning',
  'map.control.credits': 'Kortkilder',
  'map.zoomHint': 'Zoom ind for at se alle stop',
  'map.offline': 'Offline · stop og alarmer virker',
  'map.firstOffline': 'Kortet kræver internet første gang. Søgning og alarmer virker offline.',
  'map.pinCrosshair': 'Nålens position',

  // Update required (below the server's minimum version; alarms keep working)
  'map.update.body': 'Opdater StopWake. Dine alarmer virker stadig.',
  'map.update.action': 'Opdater',
  'map.announcement.open': 'Læs mere',

  // Country pack suggestion
  'map.pack.title': 'Stoppesteder i {country} · {size}',
  'map.pack.body': 'Download dem for at finde stoppesteder her, også uden internet.',
  'map.pack.download': 'Download',
  'map.pack.downloading': 'Downloader {percent}¤%',
  'map.pack.installing': 'Installerer…',
  'map.pack.failed': 'Downloadet blev afbrudt. Prøv igen.',
  'map.pack.hint': 'Leder du efter {country}? Download stoppestederne ({size}).',

  // Browse mode
  'map.nearby.title': 'Stoppesteder i nærheden',
  'map.nearby.within': 'Inden for {distance}',
  'map.nearby.showAll': 'Vis alle i nærheden',
  'map.nearby.showFewer': 'Vis færre',
  'map.nearby.emptyTitle': 'Ingen stoppesteder i nærheden',
  'map.nearby.emptyBody': 'Søg i stedet efter din destination.',
  'map.location.title': 'Se stoppesteder i nærheden',
  'map.location.body': 'Tillad placering for at se stoppesteder omkring dig.',
  'map.location.allow': 'Tillad placering',
  'map.location.deniedBody': 'Placering er slået fra for StopWake. Slå den til for at se stoppesteder omkring dig.',
  'map.location.openSetup': 'Åbn opsætning',
  'map.longPressHint': 'Tryk længe på kortet for at sætte en nål hvor som helst.',

  // Search mode
  'map.search.leaveHere': 'Alarm, når jeg forlader stedet',
  'map.search.leaveHereBody': 'Vækker dig, når du er kommet væk fra det sted, du er på nu',
  'map.search.dropPin': 'Sæt en nål på kortet',
  'map.search.tip': 'Tip: Indsæt koordinater eller et Google Maps-link.',
  'map.search.stops': 'Stoppesteder',
  'map.search.addressesOffline': 'Adresser kræver internet. Stoppesteder virker offline.',
  'map.search.noResultsTitle': 'Ingen resultater for “{query}”',
  'map.search.noResultsBody': 'Tjek stavemåden, eller tilføj byen, for eksempel “Vestergade Aarhus”.',
  'map.search.recentsCleared': 'Seneste stoppesteder ryddet',
  'map.search.undo': 'Fortryd',

  // Pin mode (drop a pin without long-press)
  'map.pin.title': 'Flyt kortet for at placere nålen',
  'map.pin.finding': 'Finder adressen…',
  'map.pin.use': 'Brug dette sted',

  // Stop mode
  'map.stop.minutes': '{minutes}¤min.',
  'map.stop.trainWarning': '{distance} er kun få sekunder i et tog. Så hellere væk mig 2¤min. før?',
  'map.stop.useTwoMinutes': 'Brug 2¤min.',
  'map.stop.options': 'Alarmindstillinger',
  'map.stop.optionsArrive': 'Ankomst',
  'map.stop.optionsLeave': 'Afgang',
  'map.stop.whenLabel': 'Når alarmen ringer',
  'map.stop.strengthLabel': 'Alarmstyrke',
  'map.stop.demo': 'Prøv en demotur',
  'map.stop.demoBody': 'En simulation på 1 minut, så du kan se og høre alarmen.',
  'map.stop.switch': 'Skift alarmen til dette stop',
  'map.stop.saved': 'Gemt som favorit',
  'map.stop.removed': 'Fjernet fra favoritter',
  'map.stop.notFound': 'Det stop findes ikke blandt stoppestederne på denne telefon.',

  // The rule line (also on the Trip screen)
  'map.rule.time': 'Ringer ca. {minutes}¤min. før du er fremme',
  'map.rule.distance': 'Ringer {distance} før stoppet',
  'map.rule.leave': 'Ringer når du er {distance} væk',
};
