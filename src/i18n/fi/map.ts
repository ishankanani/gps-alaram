import type { Strings } from '../en';

/** Strings of the map home: MapSheet browse, search and stop modes, banners and map controls (English keys in ../en/map.ts). */
export const map: Partial<Strings> = {
  // Map controls and overlays
  'map.control.locate': 'Näytä sijaintini',
  'map.control.locateDenied': 'Sijainti on pois päältä. Avaa asetukset',
  'map.control.credits': 'Kartan lähteet',
  'map.zoomHint': 'Lähennä nähdäksesi kaikki pysäkit',
  'map.offline': 'Offline · pysäkit ja herätykset toimivat',
  'map.firstOffline': 'Kartta tarvitsee internetin ensimmäisellä kerralla. Haku ja herätykset toimivat ilman verkkoa.',
  'map.pinCrosshair': 'Nastan sijainti',

  // Update required (below the server's minimum version; alarms keep working)
  'map.update.body': 'Päivitä StopWake. Herätyksesi toimivat edelleen.',
  'map.update.action': 'Päivitä',
  'map.announcement.open': 'Lue lisää',

  // Country pack suggestion
  'map.pack.title': 'Pysäkit: {country} · {size}',
  'map.pack.body': 'Lataa ne, niin löydät täältä pysäkit myös ilman internetiä.',
  'map.pack.download': 'Lataa',
  'map.pack.downloading': 'Ladataan {percent} %',
  'map.pack.installing': 'Asennetaan…',
  'map.pack.failed': 'Lataus keskeytyi. Yritä uudelleen.',
  'map.pack.hint': 'Pysäkit: {country}. Lataa ne ({size}), niin löydät ne täältä.',

  // Browse mode
  'map.nearby.title': 'Lähellä olevat pysäkit',
  'map.nearby.within': 'Enintään {distance} päässä',
  'map.nearby.showAll': 'Näytä kaikki lähellä olevat',
  'map.nearby.showFewer': 'Näytä vähemmän',
  'map.nearby.emptyTitle': 'Ei pysäkkejä lähellä',
  'map.nearby.emptyBody': 'Hae sen sijaan määränpäätäsi.',
  'map.location.title': 'Näe lähellä olevat pysäkit',
  'map.location.body': 'Salli sijainti, niin näet ympärilläsi olevat pysäkit.',
  'map.location.allow': 'Salli sijainti',
  'map.location.deniedBody': 'StopWakella ei ole lupaa käyttää sijaintia. Salli se, niin näet ympärilläsi olevat pysäkit.',
  'map.location.openSetup': 'Avaa asetukset',
  'map.longPressHint': 'Pudota nasta mihin tahansa painamalla karttaa pitkään.',

  // Search mode
  'map.search.leaveHere': 'Herätä, kun lähden täältä',
  'map.search.leaveHereBody': 'Herättää, kun olet siirtynyt pois nykyisestä sijainnistasi',
  'map.search.dropPin': 'Pudota nasta kartalle',
  'map.search.tip': 'Vinkki: liitä koordinaatit tai Google Maps -linkki.',
  'map.search.stops': 'Pysäkit',
  'map.search.addressesOffline': 'Osoitteet vaativat internetin. Pysäkit toimivat ilman verkkoa.',
  'map.search.noResultsTitle': 'Ei tuloksia haulle ”{query}”',
  'map.search.noResultsBody': 'Tarkista kirjoitusasu tai lisää paikkakunta, esimerkiksi ”Rautatienkatu Tampere”.',
  'map.search.recentsCleared': 'Viimeisimmät pysäkit tyhjennetty',
  'map.search.undo': 'Kumoa',

  // Pin mode (drop a pin without long-press)
  'map.pin.title': 'Siirrä karttaa asettaaksesi nastan',
  'map.pin.finding': 'Haetaan osoitetta…',
  'map.pin.use': 'Käytä tätä paikkaa',

  // Stop mode
  'map.stop.minutes': '{minutes} min',
  'map.stop.trainWarning': 'Junassa {distance} on vain muutama sekunti. Herätetäänkö sen sijaan 2 min aiemmin?',
  'map.stop.useTwoMinutes': 'Käytä 2 min',
  'map.stop.options': 'Herätyksen asetukset',
  'map.stop.optionsArrive': 'Saapuminen',
  'map.stop.optionsLeave': 'Lähtö',
  'map.stop.whenLabel': 'Kun herätys soi',
  'map.stop.strengthLabel': 'Herätyksen voimakkuus',
  'map.stop.demo': 'Kokeile demomatkaa',
  'map.stop.demoBody': 'Minuutin simulaatio, jossa näet ja kuulet herätyksen.',
  'map.stop.switch': 'Siirrä herätys tälle pysäkille',
  'map.stop.saved': 'Lisätty suosikkeihin',
  'map.stop.removed': 'Poistettu suosikeista',
  'map.stop.notFound': 'Tätä pysäkkiä ei ole tämän puhelimen pysäkeissä.',

  // The rule line (also on the Trip screen)
  'map.rule.time': 'Soi noin {minutes} min ennen kuin olet perillä',
  'map.rule.distance': 'Soi {distance} ennen pysäkkiä',
  'map.rule.leave': 'Soi, kun olet {distance} päässä',
};
