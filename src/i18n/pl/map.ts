import type { Strings } from '../en';

export const map: Partial<Strings> = {
  // Map controls and overlays
  'map.control.locate': 'Pokaż moją lokalizację',
  'map.control.locateDenied': 'Lokalizacja jest wyłączona. Otwórz konfigurację',
  'map.control.credits': 'Autorzy mapy',
  'map.zoomHint': 'Przybliż mapę, aby zobaczyć wszystkie przystanki',
  'map.offline': 'Offline · przystanki i alarmy działają',
  'map.firstOffline': 'Za pierwszym razem mapa potrzebuje internetu. Wyszukiwanie i alarmy działają offline.',
  'map.pinCrosshair': 'Pozycja pinezki',

  // Update required
  'map.update.body': 'Zaktualizuj StopWake. Twoje alarmy nadal działają.',
  'map.update.action': 'Aktualizuj',
  'map.announcement.open': 'Dowiedz się więcej',

  // Country pack suggestion
  'map.pack.title': 'Przystanki: {country} · {size}',
  'map.pack.body': 'Pobierz je, aby wyszukiwać tu przystanki, także bez internetu.',
  'map.pack.download': 'Pobierz',
  'map.pack.downloading': 'Pobieranie {percent}%',
  'map.pack.installing': 'Instalowanie…',
  'map.pack.failed': 'Pobieranie zostało przerwane. Spróbuj ponownie.',
  'map.pack.hint': 'Szukasz przystanków: {country}? Pobierz je ({size}).',

  // Browse mode
  'map.nearby.title': 'Pobliskie przystanki',
  'map.nearby.within': 'W promieniu {distance}',
  'map.nearby.showAll': 'Pokaż wszystkie w pobliżu',
  'map.nearby.showFewer': 'Pokaż mniej',
  'map.nearby.emptyTitle': 'Brak przystanków w pobliżu',
  'map.nearby.emptyBody': 'Wyszukaj zamiast tego swój cel.',
  'map.location.title': 'Zobacz przystanki w pobliżu',
  'map.location.body': 'Zezwól na lokalizację, aby wyświetlić przystanki wokół ciebie.',
  'map.location.allow': 'Zezwól na lokalizację',
  'map.location.deniedBody': 'Lokalizacja jest wyłączona dla StopWake. Włącz ją, aby wyświetlić przystanki wokół ciebie.',
  'map.location.openSetup': 'Otwórz konfigurację',
  'map.longPressHint': 'Przytrzymaj mapę, aby postawić pinezkę w dowolnym miejscu.',

  // Search mode
  'map.search.leaveHere': 'Zadzwoń, gdy stąd odjadę',
  'map.search.leaveHereBody': 'Obudzi cię, gdy oddalisz się od miejsca, w którym jesteś teraz',
  'map.search.dropPin': 'Postaw pinezkę na mapie',
  'map.search.tip': 'Wskazówka: wklej współrzędne lub link z Map Google.',
  'map.search.stops': 'Przystanki',
  'map.search.addressesOffline': 'Adresy wymagają internetu. Przystanki działają offline.',
  'map.search.noResultsTitle': 'Brak wyników dla „{query}”',
  'map.search.noResultsBody': 'Sprawdź pisownię lub dodaj miejscowość, na przykład „Bahnhofstraße Ulm”.',
  'map.search.recentsCleared': 'Wyczyszczono ostatnie przystanki',
  'map.search.undo': 'Cofnij',

  // Pin mode
  'map.pin.title': 'Przesuń mapę, aby ustawić pinezkę',
  'map.pin.finding': 'Szukam adresu…',
  'map.pin.use': 'Użyj tego miejsca',

  // Stop mode
  'map.stop.minutes': '{minutes} min',
  'map.stop.trainWarning': 'W pociągu {distance} to tylko kilka sekund. Obudzić 2 min wcześniej?',
  'map.stop.useTwoMinutes': 'Użyj 2 min',
  'map.stop.options': 'Opcje alarmu',
  'map.stop.optionsArrive': 'Przyjazd',
  'map.stop.optionsLeave': 'Wyjazd',
  'map.stop.whenLabel': 'Kiedy dzwoni alarm',
  'map.stop.strengthLabel': 'Siła alarmu',
  'map.stop.demo': 'Wypróbuj przejazd demonstracyjny',
  'map.stop.demoBody': '1-minutowa symulacja, w której zobaczysz i usłyszysz alarm.',
  'map.stop.switch': 'Przełącz alarm na ten przystanek',
  'map.stop.saved': 'Zapisano w ulubionych',
  'map.stop.removed': 'Usunięto z ulubionych',
  'map.stop.notFound': 'Tego przystanku nie ma wśród przystanków na tym telefonie.',

  // The rule line
  'map.rule.time': 'Dzwoni około {minutes} min przed przyjazdem',
  'map.rule.distance': 'Dzwoni {distance} przed przystankiem',
  'map.rule.leave': 'Dzwoni, gdy będziesz {distance} stąd',
};
