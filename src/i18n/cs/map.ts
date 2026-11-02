import type { Strings } from '../en';

export const map: Partial<Strings> = {
  // Map controls and overlays
  'map.control.locate': 'Zobrazit mou polohu',
  'map.control.locateDenied': 'Poloha je vypnutá. Otevřít nastavení',
  'map.control.credits': 'Autoři mapy',
  'map.zoomHint': 'Přibliž mapu pro zobrazení všech zastávek',
  'map.offline': 'Offline · zastávky a budíky fungují',
  'map.firstOffline': 'Mapa potřebuje poprvé internet. Hledání a budíky fungují offline.',
  'map.pinCrosshair': 'Poloha značky',

  // Update required
  'map.update.body': 'Aktualizuj StopWake. Budíky fungují dál.',
  'map.update.action': 'Aktualizovat',
  'map.announcement.open': 'Zjistit více',

  // Country pack suggestion
  'map.pack.title': 'Zastávky: {country} · {size}',
  'map.pack.body': 'Stáhni je a hledej tu zastávky i bez internetu.',
  'map.pack.download': 'Stáhnout',
  'map.pack.downloading': 'Stahování {percent} %',
  'map.pack.installing': 'Instalace…',
  'map.pack.failed': 'Stahování se zastavilo. Zkus to znovu.',
  'map.pack.hint': 'Hledáš zastávky: {country}? Stáhni je ({size}).',

  // Browse mode
  'map.nearby.title': 'Zastávky v okolí',
  'map.nearby.within': 'Do {distance}',
  'map.nearby.showAll': 'Zobrazit všechny v okolí',
  'map.nearby.showFewer': 'Zobrazit méně',
  'map.nearby.emptyTitle': 'V okolí nejsou žádné zastávky',
  'map.nearby.emptyBody': 'Zkus raději vyhledat cíl.',
  'map.location.title': 'Zobraz zastávky ve svém okolí',
  'map.location.body': 'Povol polohu, aby se zobrazily zastávky kolem tebe.',
  'map.location.allow': 'Povolit polohu',
  'map.location.deniedBody': 'Poloha je pro StopWake vypnutá. Zapni ji, aby se zobrazily zastávky kolem tebe.',
  'map.location.openSetup': 'Otevřít nastavení',
  'map.longPressHint': 'Dlouhým stisknutím mapy umístíš značku kamkoli.',

  // Search mode
  'map.search.leaveHere': 'Zazvonit, až odtud odjedu',
  'map.search.leaveHereBody': 'Probudí tě, jakmile se vzdálíš od místa, kde jsi teď',
  'map.search.dropPin': 'Umístit značku na mapu',
  'map.search.tip': 'Tip: vlož souřadnice nebo odkaz z Map Google.',
  'map.search.stops': 'Zastávky',
  'map.search.addressesOffline': 'Adresy potřebují internet. Zastávky fungují offline.',
  'map.search.noResultsTitle': 'Pro „{query}“ nic nenalezeno',
  'map.search.noResultsBody': 'Zkontroluj pravopis nebo přidej město, například „Bahnhofstraße Ulm“.',
  'map.search.recentsCleared': 'Nedávné zastávky vymazány',
  'map.search.undo': 'Zpět',

  // Pin mode
  'map.pin.title': 'Posunutím mapy umísti značku',
  'map.pin.finding': 'Hledám adresu…',
  'map.pin.use': 'Použít toto místo',

  // Stop mode
  'map.stop.minutes': '{minutes} min',
  'map.stop.trainWarning': 'Ve vlaku je {distance} jen pár vteřin. Probudit o 2 min dřív?',
  'map.stop.useTwoMinutes': 'Použít 2 min',
  'map.stop.options': 'Možnosti budíku',
  'map.stop.optionsArrive': 'Příjezd',
  'map.stop.optionsLeave': 'Odjezd',
  'map.stop.whenLabel': 'Kdy budík zazvoní',
  'map.stop.strengthLabel': 'Síla budíku',
  'map.stop.demo': 'Vyzkoušej ukázkovou jízdu',
  'map.stop.demoBody': 'Minutová simulace, v níž budík uvidíš i uslyšíš.',
  'map.stop.switch': 'Přepnout budík na tuto zastávku',
  'map.stop.saved': 'Uloženo do oblíbených',
  'map.stop.removed': 'Odebráno z oblíbených',
  'map.stop.notFound': 'Tato zastávka není mezi zastávkami v tomto telefonu.',

  // The rule line
  'map.rule.time': 'Zazvoní asi {minutes} min před příjezdem',
  'map.rule.distance': 'Zazvoní {distance} před zastávkou',
  'map.rule.leave': 'Zazvoní, když budeš {distance} odsud',
};
