import type { Strings } from '../en';

export const map: Partial<Strings> = {
  // Map controls and overlays
  'map.control.locate': '내 위치 보기',
  'map.control.locateDenied': '위치가 꺼져 있어요. 설정 열기',
  'map.control.credits': '지도 저작권 정보',
  'map.zoomHint': '확대하면 모든 정류장이 보여요',
  'map.offline': '오프라인 · 정류장과 알람은 작동해요',
  'map.firstOffline': '처음에는 지도에 인터넷이 필요해요. 검색과 알람은 오프라인에서도 작동해요.',
  'map.pinCrosshair': '핀 위치',

  // Update required
  'map.update.body': 'StopWake를 업데이트하세요. 알람은 계속 작동해요.',
  'map.update.action': '업데이트',
  'map.announcement.open': '자세히 보기',

  // Country pack suggestion
  'map.pack.title': '{country} 정류장 · {size}',
  'map.pack.body': '다운로드하면 이곳의 정류장을 인터넷 없이도 찾을 수 있어요.',
  'map.pack.download': '다운로드',
  'map.pack.downloading': '다운로드 중 {percent}%',
  'map.pack.installing': '설치 중…',
  'map.pack.failed': '다운로드가 중단되었어요. 다시 시도하세요.',
  'map.pack.hint': '{country}을(를) 찾고 있나요? 정류장을 다운로드하세요({size}).',

  // Browse mode
  'map.nearby.title': '주변 정류장',
  'map.nearby.within': '{distance} 이내',
  'map.nearby.showAll': '주변 정류장 모두 보기',
  'map.nearby.showFewer': '줄여서 보기',
  'map.nearby.emptyTitle': '주변에 정류장이 없어요',
  'map.nearby.emptyBody': '대신 목적지를 검색해 보세요.',
  'map.location.title': '내 주변 정류장 보기',
  'map.location.body': '위치를 허용하면 주변 정류장을 보여 드려요.',
  'map.location.allow': '위치 허용',
  'map.location.deniedBody': 'StopWake의 위치가 꺼져 있어요. 켜면 주변 정류장을 보여 드려요.',
  'map.location.openSetup': '설정 열기',
  'map.longPressHint': '지도를 길게 누르면 어디에나 핀을 놓을 수 있어요.',

  // Search mode
  'map.search.leaveHere': '여기를 떠날 때 알림',
  'map.search.leaveHereBody': '지금 있는 곳에서 멀어지면 깨워 드려요',
  'map.search.dropPin': '지도에 핀 놓기',
  'map.search.tip': '팁: 좌표나 Google 지도 링크를 붙여 넣어 보세요.',
  'map.search.stops': '정류장',
  'map.search.addressesOffline': '주소 검색은 인터넷이 필요해요. 정류장은 오프라인에서도 검색돼요.',
  'map.search.noResultsTitle': '“{query}” 검색 결과가 없어요',
  'map.search.noResultsBody': '철자를 확인하거나 “Bahnhofstraße Ulm”처럼 도시 이름을 함께 입력하세요.',
  'map.search.recentsCleared': '최근 정류장을 지웠어요',
  'map.search.undo': '실행 취소',

  // Pin mode
  'map.pin.title': '지도를 움직여 핀 위치를 정하세요',
  'map.pin.finding': '주소를 찾는 중…',
  'map.pin.use': '이 위치 사용',

  // Stop mode
  'map.stop.minutes': '{minutes}분',
  'map.stop.trainWarning': '기차에서는 {distance}가 몇 초에 불과해요. 대신 2분 전에 깨울까요?',
  'map.stop.useTwoMinutes': '2분으로 설정',
  'map.stop.options': '알람 옵션',
  'map.stop.optionsArrive': '도착',
  'map.stop.optionsLeave': '출발',
  'map.stop.whenLabel': '알람이 울리는 시점',
  'map.stop.strengthLabel': '알람 세기',
  'map.stop.demo': '데모 이동 해보기',
  'map.stop.demoBody': '알람을 보고 들어볼 수 있는 1분짜리 시뮬레이션이에요.',
  'map.stop.switch': '알람을 이 정류장으로 변경',
  'map.stop.saved': '즐겨찾기에 저장했어요',
  'map.stop.removed': '즐겨찾기에서 삭제했어요',
  'map.stop.notFound': '이 휴대전화에 있는 정류장 중에 없는 정류장이에요.',

  // The rule line
  'map.rule.time': '도착 약 {minutes}분 전에 울려요',
  'map.rule.distance': '정류장 {distance} 전에 울려요',
  'map.rule.leave': '{distance} 멀어지면 울려요',
};
