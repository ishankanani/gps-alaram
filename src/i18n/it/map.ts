import type { Strings } from '../en';

/** Strings of the map home: MapSheet browse, search and stop modes, banners and map controls (English keys in ../en/map.ts). */
export const map: Partial<Strings> = {
  // Map controls and overlays
  'map.control.locate': 'Mostra la mia posizione',
  'map.control.locateDenied': 'Posizione disattivata. Apri la configurazione',
  'map.control.credits': 'Crediti della mappa',
  'map.zoomHint': 'Ingrandisci per vedere tutte le fermate',
  'map.offline': 'Offline · fermate e sveglie funzionano',
  'map.firstOffline': 'La prima volta la mappa richiede internet. Ricerca e sveglie funzionano offline.',
  'map.pinCrosshair': 'Posizione del segnaposto',

  // Update required (below the server's minimum version; alarms keep working)
  'map.update.body': 'Aggiorna StopWake. Le tue sveglie continuano a funzionare.',
  'map.update.action': 'Aggiorna',
  'map.announcement.open': 'Scopri di più',

  // Country pack suggestion
  'map.pack.title': 'Fermate: {country} · {size}',
  'map.pack.body': 'Scaricale per trovare le fermate qui, anche senza internet.',
  'map.pack.download': 'Scarica',
  'map.pack.downloading': 'Download al {percent}%',
  'map.pack.installing': 'Installazione…',
  'map.pack.failed': 'Il download si è interrotto. Riprova.',
  'map.pack.hint': 'Cerchi le fermate ({country})? Scaricale ({size}).',

  // Browse mode
  'map.nearby.title': 'Fermate vicine',
  'map.nearby.within': 'Entro {distance}',
  'map.nearby.showAll': 'Mostra tutte le vicine',
  'map.nearby.showFewer': 'Mostra meno',
  'map.nearby.emptyTitle': 'Nessuna fermata vicina',
  'map.nearby.emptyBody': 'Cerca invece la tua destinazione.',
  'map.location.title': 'Vedi le fermate vicino a te',
  'map.location.body': 'Consenti la posizione per elencare le fermate intorno a te.',
  'map.location.allow': 'Consenti la posizione',
  'map.location.deniedBody': 'La posizione è disattivata per StopWake. Attivala per elencare le fermate intorno a te.',
  'map.location.openSetup': 'Apri la configurazione',
  'map.longPressHint': 'Tieni premuto sulla mappa per mettere un segnaposto dove vuoi.',

  // Search mode
  'map.search.leaveHere': 'Suona quando mi allontano da qui',
  'map.search.leaveHereBody': 'Ti sveglia quando ti allontani dalla posizione in cui sei ora',
  'map.search.dropPin': 'Metti un segnaposto sulla mappa',
  'map.search.tip': 'Suggerimento: incolla coordinate o un link di Google Maps.',
  'map.search.stops': 'Fermate',
  'map.search.addressesOffline': 'Gli indirizzi richiedono internet. Le fermate funzionano offline.',
  'map.search.noResultsTitle': 'Nessun risultato per “{query}”',
  'map.search.noResultsBody': 'Controlla come è scritto o aggiungi la località, ad esempio “Via Nassa Lugano”.',
  'map.search.recentsCleared': 'Fermate recenti cancellate',
  'map.search.undo': 'Annulla',

  // Pin mode (drop a pin without long-press)
  'map.pin.title': 'Sposta la mappa per posizionare il segnaposto',
  'map.pin.finding': 'Cerco l’indirizzo…',
  'map.pin.use': 'Usa questo punto',

  // Stop mode
  'map.stop.minutes': '{minutes} min',
  'map.stop.trainWarning': 'In treno, {distance} sono solo pochi secondi. Meglio svegliarti 2 min prima?',
  'map.stop.useTwoMinutes': 'Usa 2 min',
  'map.stop.options': 'Opzioni della sveglia',
  'map.stop.optionsArrive': 'Arrivo',
  'map.stop.optionsLeave': 'Partenza',
  'map.stop.whenLabel': 'Quando suona la sveglia',
  'map.stop.strengthLabel': 'Intensità della sveglia',
  'map.stop.demo': 'Prova un viaggio demo',
  'map.stop.demoBody': 'Una simulazione di 1 minuto per vedere e sentire la sveglia.',
  'map.stop.switch': 'Sposta la sveglia su questa fermata',
  'map.stop.saved': 'Aggiunto ai preferiti',
  'map.stop.removed': 'Rimosso dai preferiti',
  'map.stop.notFound': 'Questa fermata non è tra quelle presenti su questo telefono.',

  // The rule line (also on the Trip screen)
  'map.rule.time': 'Suona circa {minutes} min prima dell’arrivo',
  'map.rule.distance': 'Suona {distance} prima della fermata',
  'map.rule.leave': 'Suona quando ti allontani di oltre {distance}',
};
