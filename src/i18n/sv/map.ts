import type { Strings } from '../en';

/** Strings of the map home: MapSheet browse, search and stop modes, banners and map controls (English keys in ../en/map.ts). */
export const map: Partial<Strings> = {
  // Map controls and overlays
  'map.control.locate': 'Visa min plats',
  'map.control.locateDenied': 'Plats är avstängd. Öppna inställningar',
  'map.control.credits': 'Kartkällor',
  'map.zoomHint': 'Zooma in för att se alla hållplatser',
  'map.offline': 'Offline · hållplatser och larm fungerar',
  'map.firstOffline': 'Kartan kräver internet första gången. Sökning och larm fungerar offline.',
  'map.pinCrosshair': 'Nålens position',

  // Update required (below the server's minimum version; alarms keep working)
  'map.update.body': 'Uppdatera StopWake. Dina larm fungerar som vanligt.',
  'map.update.action': 'Uppdatera',
  'map.announcement.open': 'Läs mer',

  // Country pack suggestion
  'map.pack.title': 'Hållplatser i {country} · {size}',
  'map.pack.body': 'Ladda ned dem för att hitta hållplatser här, även utan internet.',
  'map.pack.download': 'Ladda ned',
  'map.pack.downloading': 'Laddar ned {percent} %',
  'map.pack.installing': 'Installerar…',
  'map.pack.failed': 'Nedladdningen avbröts. Försök igen.',
  'map.pack.hint': 'Letar du efter {country}? Ladda ned hållplatserna ({size}).',

  // Browse mode
  'map.nearby.title': 'Hållplatser i närheten',
  'map.nearby.within': 'Inom {distance}',
  'map.nearby.showAll': 'Visa alla i närheten',
  'map.nearby.showFewer': 'Visa färre',
  'map.nearby.emptyTitle': 'Inga hållplatser i närheten',
  'map.nearby.emptyBody': 'Sök efter ditt resmål i stället.',
  'map.location.title': 'Se hållplatser nära dig',
  'map.location.body': 'Tillåt plats för att lista hållplatserna runt dig.',
  'map.location.allow': 'Tillåt plats',
  'map.location.deniedBody': 'Plats är avstängd för StopWake. Slå på den för att lista hållplatserna runt dig.',
  'map.location.openSetup': 'Öppna inställningar',
  'map.longPressHint': 'Tryck länge på kartan för att sätta ut en nål var som helst.',

  // Search mode
  'map.search.leaveHere': 'Larm när jag åker härifrån',
  'map.search.leaveHereBody': 'Väcker dig när du har lämnat platsen där du är nu',
  'map.search.dropPin': 'Sätt ut en nål på kartan',
  'map.search.tip': 'Tips: klistra in koordinater eller en Google Maps-länk.',
  'map.search.stops': 'Hållplatser',
  'map.search.addressesOffline': 'Adresser kräver internet. Hållplatser fungerar offline.',
  'map.search.noResultsTitle': 'Inga träffar för ”{query}”',
  'map.search.noResultsBody': 'Kontrollera stavningen eller lägg till orten, till exempel ”Storgatan Uppsala”.',
  'map.search.recentsCleared': 'Senaste hållplatserna har rensats',
  'map.search.undo': 'Ångra',

  // Pin mode (drop a pin without long-press)
  'map.pin.title': 'Flytta kartan för att placera nålen',
  'map.pin.finding': 'Söker efter adressen…',
  'map.pin.use': 'Använd den här platsen',

  // Stop mode
  'map.stop.minutes': '{minutes} min',
  'map.stop.trainWarning': '{distance} är bara några sekunder på ett tåg. Bli väckt 2 min före i stället?',
  'map.stop.useTwoMinutes': 'Använd 2 min',
  'map.stop.options': 'Larmalternativ',
  'map.stop.optionsArrive': 'Kommer fram',
  'map.stop.optionsLeave': 'Lämnar',
  'map.stop.whenLabel': 'När larmet ringer',
  'map.stop.strengthLabel': 'Larmstyrka',
  'map.stop.demo': 'Testa en demoresa',
  'map.stop.demoBody': 'En simulering på 1 minut så att du kan se och höra larmet.',
  'map.stop.switch': 'Byt larmet till den här hållplatsen',
  'map.stop.saved': 'Sparad som favorit',
  'map.stop.removed': 'Borttagen från favoriter',
  'map.stop.notFound': 'Den hållplatsen finns inte bland hållplatserna på den här telefonen.',

  // The rule line (also on the Trip screen)
  'map.rule.time': 'Ringer cirka {minutes} min innan du är framme',
  'map.rule.distance': 'Ringer {distance} före hållplatsen',
  'map.rule.leave': 'Ringer när du är {distance} bort',
};
