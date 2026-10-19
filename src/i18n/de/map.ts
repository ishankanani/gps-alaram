import type { Strings } from '../en';

/** Strings of the map home: MapSheet browse, search and stop modes, banners and map controls (English keys in ../en/map.ts). */
export const map: Partial<Strings> = {
  // Map controls and overlays
  'map.control.locate': 'Meinen Standort anzeigen',
  'map.control.locateDenied': 'Standort ist aus. Einrichtung öffnen',
  'map.control.credits': 'Kartenquellen',
  'map.zoomHint': 'Hineinzoomen, um alle Haltestellen zu sehen',
  'map.offline': 'Offline · Haltestellen und Alarme funktionieren',
  'map.firstOffline': 'Beim ersten Mal braucht die Karte Internet. Suche und Alarme funktionieren offline.',
  'map.pinCrosshair': 'Position der Markierung',

  // Update required (below the server's minimum version; alarms keep working)
  'map.update.body': 'Aktualisiere StopWake. Deine Alarme funktionieren weiter.',
  'map.update.action': 'Aktualisieren',
  'map.announcement.open': 'Mehr erfahren',

  // Country pack suggestion
  'map.pack.title': 'Haltestellen: {country} · {size}',
  'map.pack.body': 'Lade sie herunter, um hier Haltestellen zu finden, auch ohne Internet.',
  'map.pack.download': 'Laden',
  'map.pack.downloading': 'Lädt {percent} %',
  'map.pack.installing': 'Wird installiert …',
  'map.pack.failed': 'Der Download wurde unterbrochen. Versuche es erneut.',
  'map.pack.hint': 'Du suchst {country}? Lade die Haltestellen herunter ({size}).',

  // Browse mode
  'map.nearby.title': 'Haltestellen in der Nähe',
  'map.nearby.within': 'Im Umkreis von {distance}',
  'map.nearby.showAll': 'Alle in der Nähe anzeigen',
  'map.nearby.showFewer': 'Weniger anzeigen',
  'map.nearby.emptyTitle': 'Keine Haltestellen in der Nähe',
  'map.nearby.emptyBody': 'Suche stattdessen nach deinem Ziel.',
  'map.location.title': 'Haltestellen in deiner Nähe sehen',
  'map.location.body': 'Erlaube den Standort, um die Haltestellen um dich herum aufzulisten.',
  'map.location.allow': 'Standort erlauben',
  'map.location.deniedBody': 'Der Standort ist für StopWake aus. Schalte ihn ein, um die Haltestellen um dich herum aufzulisten.',
  'map.location.openSetup': 'Einrichtung öffnen',
  'map.longPressHint': 'Drücke lange auf die Karte, um irgendwo eine Markierung zu setzen.',

  // Search mode
  'map.search.leaveHere': 'Klingeln, wenn ich hier weggehe',
  'map.search.leaveHereBody': 'Weckt dich, sobald du dich von deinem jetzigen Standort entfernst',
  'map.search.dropPin': 'Markierung auf der Karte setzen',
  'map.search.tip': 'Tipp: Füge Koordinaten oder einen Google-Maps-Link ein.',
  'map.search.stops': 'Haltestellen',
  'map.search.addressesOffline': 'Adressen brauchen Internet. Haltestellen gehen auch offline.',
  'map.search.noResultsTitle': 'Keine Treffer für „{query}“',
  'map.search.noResultsBody': 'Prüfe die Schreibweise oder ergänze den Ort, z. B. „Bahnhofstraße Ulm“.',
  'map.search.recentsCleared': 'Letzte Haltestellen geleert',
  'map.search.undo': 'Rückgängig',

  // Pin mode (drop a pin without long-press)
  'map.pin.title': 'Verschiebe die Karte, um die Markierung zu setzen',
  'map.pin.finding': 'Adresse wird gesucht …',
  'map.pin.use': 'Diesen Ort verwenden',

  // Stop mode
  'map.stop.minutes': '{minutes} Min.',
  'map.stop.trainWarning': '{distance} sind im Zug nur Sekunden. Lieber 2 Min. vorher wecken?',
  'map.stop.useTwoMinutes': '2 Min. nutzen',
  'map.stop.options': 'Alarmoptionen',
  'map.stop.optionsArrive': 'Ankunft',
  'map.stop.optionsLeave': 'Verlassen',
  'map.stop.whenLabel': 'Wann der Alarm klingelt',
  'map.stop.strengthLabel': 'Alarmstärke',
  'map.stop.demo': 'Probefahrt starten',
  'map.stop.demoBody': 'Eine Simulation von 1 Minute, damit du den Alarm siehst und hörst.',
  'map.stop.switch': 'Alarm auf diese Haltestelle umstellen',
  'map.stop.saved': 'Zu Favoriten hinzugefügt',
  'map.stop.removed': 'Aus Favoriten entfernt',
  'map.stop.notFound': 'Diese Haltestelle gehört nicht zu den Haltestellen auf diesem Handy.',

  // The rule line (also on the Trip screen)
  'map.rule.time': 'Klingelt etwa {minutes} Min. vor der Ankunft',
  'map.rule.distance': 'Klingelt {distance} vor der Haltestelle',
  'map.rule.leave': 'Klingelt, wenn du {distance} entfernt bist',
};
