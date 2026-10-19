import type { Strings } from '../en';

/** Strings of the map home: MapSheet browse, search and stop modes, banners and map controls (English keys in ../en/map.ts). */
export const map: Partial<Strings> = {
  // Map controls and overlays
  'map.control.locate': 'Vis posisjonen min',
  'map.control.locateDenied': 'Posisjon er slått av. Åpne oppsett',
  'map.control.credits': 'Kartkilder',
  'map.zoomHint': 'Zoom inn for å se alle holdeplasser',
  'map.offline': 'Offline · holdeplasser og alarmer fungerer',
  'map.firstOffline': 'Kartet krever internett første gang. Søk og alarmer fungerer uten nett.',
  'map.pinCrosshair': 'Nålens posisjon',

  // Update required (below the server's minimum version; alarms keep working)
  'map.update.body': 'Oppdater StopWake. Alarmene dine fungerer som før.',
  'map.update.action': 'Oppdater',
  'map.announcement.open': 'Les mer',

  // Country pack suggestion
  'map.pack.title': 'Holdeplasser i {country} · {size}',
  'map.pack.body': 'Last dem ned for å finne holdeplasser her, også uten internett.',
  'map.pack.download': 'Last ned',
  'map.pack.downloading': 'Laster ned {percent} %',
  'map.pack.installing': 'Installerer…',
  'map.pack.failed': 'Nedlastingen stoppet. Prøv igjen.',
  'map.pack.hint': 'Leter du etter {country}? Last ned holdeplassene ({size}).',

  // Browse mode
  'map.nearby.title': 'Holdeplasser i nærheten',
  'map.nearby.within': 'Innen {distance}',
  'map.nearby.showAll': 'Vis alle i nærheten',
  'map.nearby.showFewer': 'Vis færre',
  'map.nearby.emptyTitle': 'Ingen holdeplasser i nærheten',
  'map.nearby.emptyBody': 'Søk etter reisemålet ditt i stedet.',
  'map.location.title': 'Se holdeplasser nær deg',
  'map.location.body': 'Gi tilgang til posisjon for å vise holdeplassene rundt deg.',
  'map.location.allow': 'Tillat posisjon',
  'map.location.deniedBody': 'Posisjon er slått av for StopWake. Slå den på for å vise holdeplassene rundt deg.',
  'map.location.openSetup': 'Åpne oppsett',
  'map.longPressHint': 'Trykk og hold på kartet for å sette en nål hvor som helst.',

  // Search mode
  'map.search.leaveHere': 'Alarm når jeg drar herfra',
  'map.search.leaveHereBody': 'Vekker deg så snart du er unna stedet du er nå',
  'map.search.dropPin': 'Sett en nål på kartet',
  'map.search.tip': 'Tips: Lim inn koordinater eller en Google Maps-lenke.',
  'map.search.stops': 'Holdeplasser',
  'map.search.addressesOffline': 'Adresser krever internett. Holdeplasser fungerer uten nett.',
  'map.search.noResultsTitle': 'Ingen treff for «{query}»',
  'map.search.noResultsBody': 'Sjekk stavemåten eller legg til stedsnavnet, for eksempel «Bahnhofstraße Ulm».',
  'map.search.recentsCleared': 'Nylige stopp er tømt',
  'map.search.undo': 'Angre',

  // Pin mode (drop a pin without long-press)
  'map.pin.title': 'Flytt kartet for å plassere nålen',
  'map.pin.finding': 'Finner adressen…',
  'map.pin.use': 'Bruk dette stedet',

  // Stop mode
  'map.stop.minutes': '{minutes} min',
  'map.stop.trainWarning': '{distance} er bare noen sekunder på et tog. Bli vekket 2 min før i stedet?',
  'map.stop.useTwoMinutes': 'Bruk 2 min',
  'map.stop.options': 'Alarmvalg',
  'map.stop.optionsArrive': 'Kommer frem',
  'map.stop.optionsLeave': 'Drar',
  'map.stop.whenLabel': 'Når alarmen ringer',
  'map.stop.strengthLabel': 'Alarmstyrke',
  'map.stop.demo': 'Ta en prøvetur',
  'map.stop.demoBody': 'En simulering på 1 minutt, så du kan se og høre alarmen.',
  'map.stop.switch': 'Flytt alarmen til dette stoppet',
  'map.stop.saved': 'Lagret i favoritter',
  'map.stop.removed': 'Fjernet fra favoritter',
  'map.stop.notFound': 'Det stoppet finnes ikke blant holdeplassene på denne telefonen.',

  // The rule line (also on the Trip screen)
  'map.rule.time': 'Ringer omtrent {minutes} min før du er fremme',
  'map.rule.distance': 'Ringer {distance} før stoppet',
  'map.rule.leave': 'Ringer når du er {distance} unna',
};
