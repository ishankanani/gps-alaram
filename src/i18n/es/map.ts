import type { Strings } from '../en';

export const map: Partial<Strings> = {
  // Map controls and overlays
  'map.control.locate': 'Mostrar mi ubicación',
  'map.control.locateDenied': 'La ubicación está desactivada. Abrir configuración',
  'map.control.credits': 'Créditos del mapa',
  'map.zoomHint': 'Acerca el mapa para ver todas las paradas',
  'map.offline': 'Sin conexión · las paradas y las alarmas funcionan',
  'map.firstOffline': 'La primera vez, el mapa necesita internet. La búsqueda y las alarmas funcionan sin conexión.',
  'map.pinCrosshair': 'Posición del marcador',

  // Update required
  'map.update.body': 'Actualiza StopWake. Tus alarmas siguen funcionando.',
  'map.update.action': 'Actualizar',
  'map.announcement.open': 'Más información',

  // Country pack suggestion
  'map.pack.title': 'Paradas de {country} · {size}',
  'map.pack.body': 'Descárgalas para encontrar paradas aquí, también sin internet.',
  'map.pack.download': 'Descargar',
  'map.pack.downloading': 'Descargando {percent} %',
  'map.pack.installing': 'Instalando…',
  'map.pack.failed': 'La descarga se detuvo. Inténtalo de nuevo.',
  'map.pack.hint': '¿Buscas {country}? Descarga sus paradas ({size}).',

  // Browse mode
  'map.nearby.title': 'Paradas cercanas',
  'map.nearby.within': 'A menos de {distance}',
  'map.nearby.showAll': 'Mostrar todas las cercanas',
  'map.nearby.showFewer': 'Mostrar menos',
  'map.nearby.emptyTitle': 'No hay paradas cerca',
  'map.nearby.emptyBody': 'Busca tu destino en su lugar.',
  'map.location.title': 'Ve las paradas cercanas',
  'map.location.body': 'Permite la ubicación para listar las paradas de tu alrededor.',
  'map.location.allow': 'Permitir ubicación',
  'map.location.deniedBody': 'La ubicación está desactivada para StopWake. Actívala para listar las paradas de tu alrededor.',
  'map.location.openSetup': 'Abrir configuración',
  'map.longPressHint': 'Mantén pulsado el mapa para colocar un marcador donde quieras.',

  // Search mode
  'map.search.leaveHere': 'Avisarme cuando salga de aquí',
  'map.search.leaveHereBody': 'Te despierta en cuanto te alejes de donde estás ahora',
  'map.search.dropPin': 'Colocar un marcador en el mapa',
  'map.search.tip': 'Consejo: pega coordenadas o un enlace de Google Maps.',
  'map.search.stops': 'Paradas',
  'map.search.addressesOffline': 'Las direcciones necesitan internet. Las paradas funcionan sin conexión.',
  'map.search.noResultsTitle': 'Sin resultados para «{query}»',
  'map.search.noResultsBody': 'Revisa la ortografía o añade la ciudad, por ejemplo «Bahnhofstraße Ulm».',
  'map.search.recentsCleared': 'Paradas recientes borradas',
  'map.search.undo': 'Deshacer',

  // Pin mode
  'map.pin.title': 'Mueve el mapa para colocar el marcador',
  'map.pin.finding': 'Buscando la dirección…',
  'map.pin.use': 'Usar este punto',

  // Stop mode
  'map.stop.minutes': '{minutes} min',
  'map.stop.trainWarning': 'En tren, {distance} son solo segundos. ¿Mejor despertar 2 min antes?',
  'map.stop.useTwoMinutes': 'Usar 2 min',
  'map.stop.options': 'Opciones de la alarma',
  'map.stop.optionsArrive': 'Llegar',
  'map.stop.optionsLeave': 'Salir',
  'map.stop.whenLabel': 'Cuándo suena la alarma',
  'map.stop.strengthLabel': 'Intensidad de la alarma',
  'map.stop.demo': 'Prueba un viaje de demostración',
  'map.stop.demoBody': 'Una simulación de 1 minuto para ver y oír la alarma.',
  'map.stop.switch': 'Cambiar la alarma a esta parada',
  'map.stop.saved': 'Guardada en favoritos',
  'map.stop.removed': 'Quitada de favoritos',
  'map.stop.notFound': 'Esa parada no está entre las paradas de este teléfono.',

  // The rule line
  'map.rule.time': 'Suena unos {minutes} min antes de llegar',
  'map.rule.distance': 'Suena a {distance} de la parada',
  'map.rule.leave': 'Suena cuando estés a {distance}',
};
