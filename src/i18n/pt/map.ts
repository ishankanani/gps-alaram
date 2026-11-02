import type { Strings } from '../en';

export const map: Partial<Strings> = {
  // Map controls and overlays
  'map.control.locate': 'Mostrar minha localização',
  'map.control.locateDenied': 'A localização está desativada. Abrir configuração',
  'map.control.credits': 'Créditos do mapa',
  'map.zoomHint': 'Aproxime o mapa para ver todas as paradas',
  'map.offline': 'Offline · as paradas e os alarmes funcionam',
  'map.firstOffline': 'Na primeira vez, o mapa precisa de internet. A busca e os alarmes funcionam offline.',
  'map.pinCrosshair': 'Posição do marcador',

  // Update required
  'map.update.body': 'Atualize o StopWake. Seus alarmes continuam funcionando.',
  'map.update.action': 'Atualizar',
  'map.announcement.open': 'Saiba mais',

  // Country pack suggestion
  'map.pack.title': 'Paradas de {country} · {size}',
  'map.pack.body': 'Baixe-as para encontrar paradas aqui, mesmo sem internet.',
  'map.pack.download': 'Baixar',
  'map.pack.downloading': 'Baixando {percent}%',
  'map.pack.installing': 'Instalando…',
  'map.pack.failed': 'O download parou. Tente de novo.',
  'map.pack.hint': 'Procurando {country}? Baixe as paradas de lá ({size}).',

  // Browse mode
  'map.nearby.title': 'Paradas próximas',
  'map.nearby.within': 'A menos de {distance}',
  'map.nearby.showAll': 'Mostrar todas as próximas',
  'map.nearby.showFewer': 'Mostrar menos',
  'map.nearby.emptyTitle': 'Nenhuma parada por perto',
  'map.nearby.emptyBody': 'Pesquise o seu destino.',
  'map.location.title': 'Veja as paradas perto de você',
  'map.location.body': 'Permita a localização para listar as paradas ao seu redor.',
  'map.location.allow': 'Permitir localização',
  'map.location.deniedBody': 'A localização está desativada para o StopWake. Ative-a para listar as paradas ao seu redor.',
  'map.location.openSetup': 'Abrir configuração',
  'map.longPressHint': 'Mantenha o mapa pressionado para soltar um marcador em qualquer lugar.',

  // Search mode
  'map.search.leaveHere': 'Tocar quando eu sair daqui',
  'map.search.leaveHereBody': 'Acorda você assim que se afastar de onde está agora',
  'map.search.dropPin': 'Soltar um marcador no mapa',
  'map.search.tip': 'Dica: cole coordenadas ou um link do Google Maps.',
  'map.search.stops': 'Paradas',
  'map.search.addressesOffline': 'Endereços precisam de internet. As paradas funcionam offline.',
  'map.search.noResultsTitle': 'Nenhum resultado para “{query}”',
  'map.search.noResultsBody': 'Confira a grafia ou acrescente a cidade, por exemplo “Bahnhofstraße Ulm”.',
  'map.search.recentsCleared': 'Paradas recentes apagadas',
  'map.search.undo': 'Desfazer',

  // Pin mode
  'map.pin.title': 'Mova o mapa para posicionar o marcador',
  'map.pin.finding': 'Procurando o endereço…',
  'map.pin.use': 'Usar este local',

  // Stop mode
  'map.stop.minutes': '{minutes} min',
  'map.stop.trainWarning': 'De trem, {distance} são só segundos. Acordar 2 min antes?',
  'map.stop.useTwoMinutes': 'Usar 2 min',
  'map.stop.options': 'Opções do alarme',
  'map.stop.optionsArrive': 'Chegar',
  'map.stop.optionsLeave': 'Sair',
  'map.stop.whenLabel': 'Quando o alarme toca',
  'map.stop.strengthLabel': 'Intensidade do alarme',
  'map.stop.demo': 'Experimente uma viagem de demonstração',
  'map.stop.demoBody': 'Uma simulação de 1 minuto para ver e ouvir o alarme.',
  'map.stop.switch': 'Mudar o alarme para esta parada',
  'map.stop.saved': 'Salvo nos favoritos',
  'map.stop.removed': 'Removido dos favoritos',
  'map.stop.notFound': 'Essa parada não está entre as paradas deste telefone.',

  // The rule line
  'map.rule.time': 'Toca cerca de {minutes} min antes de chegar',
  'map.rule.distance': 'Toca a {distance} da parada',
  'map.rule.leave': 'Toca quando você estiver a {distance}',
};
