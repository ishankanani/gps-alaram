import type { Strings } from '../en';

/** Strings of the map home: MapSheet browse, search and stop modes, banners and map controls (English keys in ../en/map.ts). */
export const map: Partial<Strings> = {
  // Map controls and overlays
  'map.control.locate': 'Mijn locatie tonen',
  'map.control.locateDenied': 'Locatie staat uit. Instellingen openen',
  'map.control.credits': 'Kaartbronnen',
  'map.zoomHint': 'Zoom in om alle haltes te zien',
  'map.offline': 'Offline · haltes en alarmen werken',
  'map.firstOffline': 'De kaart heeft de eerste keer internet nodig. Zoeken en alarmen werken offline.',
  'map.pinCrosshair': 'Positie van de speld',

  // Update required (below the server's minimum version; alarms keep working)
  'map.update.body': 'Werk StopWake bij. Je alarmen blijven werken.',
  'map.update.action': 'Bijwerken',
  'map.announcement.open': 'Meer informatie',

  // Country pack suggestion
  'map.pack.title': 'Haltes in {country} · {size}',
  'map.pack.body': 'Download ze om hier haltes te vinden, ook zonder internet.',
  'map.pack.download': 'Downloaden',
  'map.pack.downloading': 'Downloaden {percent}%',
  'map.pack.installing': 'Installeren…',
  'map.pack.failed': 'De download is gestopt. Probeer het opnieuw.',
  'map.pack.hint': '{country}: haltes downloaden ({size}).',

  // Browse mode
  'map.nearby.title': 'Haltes in de buurt',
  'map.nearby.within': 'Binnen {distance}',
  'map.nearby.showAll': 'Alles in de buurt tonen',
  'map.nearby.showFewer': 'Minder tonen',
  'map.nearby.emptyTitle': 'Geen haltes in de buurt',
  'map.nearby.emptyBody': 'Zoek in plaats daarvan naar je bestemming.',
  'map.location.title': 'Zie haltes bij jou in de buurt',
  'map.location.body': 'Sta locatie toe om de haltes om je heen te tonen.',
  'map.location.allow': 'Locatie toestaan',
  'map.location.deniedBody': 'Locatie staat uit voor StopWake. Zet het aan om de haltes om je heen te tonen.',
  'map.location.openSetup': 'Instellingen openen',
  'map.longPressHint': 'Houd de kaart ingedrukt om overal een speld te plaatsen.',

  // Search mode
  'map.search.leaveHere': 'Alarm als ik hier wegga',
  'map.search.leaveHereBody': 'Wekt je zodra je weg bent van waar je nu bent',
  'map.search.dropPin': 'Plaats een speld op de kaart',
  'map.search.tip': 'Tip: plak coördinaten of een Google Maps-link.',
  'map.search.stops': 'Haltes',
  'map.search.addressesOffline': 'Voor adressen heb je internet nodig. Haltes werken ook offline.',
  'map.search.noResultsTitle': 'Niets gevonden voor “{query}”',
  'map.search.noResultsBody': 'Controleer de spelling of voeg de plaats toe, bijvoorbeeld “Stationsweg Leiden”.',
  'map.search.recentsCleared': 'Recente haltes gewist',
  'map.search.undo': 'Ongedaan maken',

  // Pin mode (drop a pin without long-press)
  'map.pin.title': 'Verschuif de kaart om de speld te plaatsen',
  'map.pin.finding': 'Adres zoeken…',
  'map.pin.use': 'Deze plek gebruiken',

  // Stop mode
  'map.stop.minutes': '{minutes} min',
  'map.stop.trainWarning': '{distance} is in de trein maar een paar seconden. Liever 2 min vooraf wekken?',
  'map.stop.useTwoMinutes': 'Gebruik 2 min',
  'map.stop.options': 'Alarmopties',
  'map.stop.optionsArrive': 'Aankomst',
  'map.stop.optionsLeave': 'Vertrek',
  'map.stop.whenLabel': 'Wanneer het alarm afgaat',
  'map.stop.strengthLabel': 'Alarmsterkte',
  'map.stop.demo': 'Probeer een demorit',
  'map.stop.demoBody': 'Een simulatie van 1 minuut om het alarm te zien en te horen.',
  'map.stop.switch': 'Alarm naar deze halte verplaatsen',
  'map.stop.saved': 'Toegevoegd aan favorieten',
  'map.stop.removed': 'Verwijderd uit favorieten',
  'map.stop.notFound': 'Deze halte staat niet bij de haltes op deze telefoon.',

  // The rule line (also on the Trip screen)
  'map.rule.time': 'Gaat ongeveer {minutes} min voor aankomst af',
  'map.rule.distance': 'Gaat {distance} voor de halte af',
  'map.rule.leave': 'Gaat af als je {distance} weg bent',
};
