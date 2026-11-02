import type { Strings } from '../en';

export const map: Partial<Strings> = {
  // Map controls and overlays
  'map.control.locate': '显示我的位置',
  'map.control.locateDenied': '定位已关闭。打开设置',
  'map.control.credits': '地图版权信息',
  'map.zoomHint': '放大地图以查看所有站点',
  'map.offline': '离线 · 站点和闹钟仍可使用',
  'map.firstOffline': '首次使用地图需要联网。搜索和闹钟可离线使用。',
  'map.pinCrosshair': '标记点位置',

  // Update required
  'map.update.body': '请更新 StopWake。你的闹钟仍可正常使用。',
  'map.update.action': '更新',
  'map.announcement.open': '了解更多',

  // Country pack suggestion
  'map.pack.title': '{country}的站点 · {size}',
  'map.pack.body': '下载后，即使没有网络也能在这里查找站点。',
  'map.pack.download': '下载',
  'map.pack.downloading': '正在下载 {percent}%',
  'map.pack.installing': '正在安装…',
  'map.pack.failed': '下载已中断，请重试。',
  'map.pack.hint': '在找{country}？下载它的站点（{size}）。',

  // Browse mode
  'map.nearby.title': '附近站点',
  'map.nearby.within': '{distance} 以内',
  'map.nearby.showAll': '显示全部附近站点',
  'map.nearby.showFewer': '收起',
  'map.nearby.emptyTitle': '附近没有站点',
  'map.nearby.emptyBody': '试试直接搜索你的目的地。',
  'map.location.title': '查看你附近的站点',
  'map.location.body': '允许定位，即可列出你周围的站点。',
  'map.location.allow': '允许定位',
  'map.location.deniedBody': 'StopWake 的定位已关闭。开启后即可列出你周围的站点。',
  'map.location.openSetup': '打开设置',
  'map.longPressHint': '长按地图，可在任意位置放置标记点。',

  // Search mode
  'map.search.leaveHere': '离开这里时响铃',
  'map.search.leaveHereBody': '你一离开当前所在位置就叫醒你',
  'map.search.dropPin': '在地图上放置标记点',
  'map.search.tip': '提示：可以粘贴坐标或 Google 地图链接。',
  'map.search.stops': '站点',
  'map.search.addressesOffline': '搜索地址需要联网。站点可离线使用。',
  'map.search.noResultsTitle': '没有找到“{query}”的结果',
  'map.search.noResultsBody': '请检查拼写，或加上城市名，例如“Bahnhofstraße Ulm”。',
  'map.search.recentsCleared': '已清除最近站点',
  'map.search.undo': '撤销',

  // Pin mode
  'map.pin.title': '移动地图以放置标记点',
  'map.pin.finding': '正在查找地址…',
  'map.pin.use': '使用此位置',

  // Stop mode
  'map.stop.minutes': '{minutes} 分钟',
  'map.stop.trainWarning': '乘火车时，{distance} 只有几秒钟。改为提前 2 分钟叫醒？',
  'map.stop.useTwoMinutes': '改用 2 分钟',
  'map.stop.options': '闹钟选项',
  'map.stop.optionsArrive': '到达',
  'map.stop.optionsLeave': '离开',
  'map.stop.whenLabel': '闹钟响起的时机',
  'map.stop.strengthLabel': '闹钟强度',
  'map.stop.demo': '试试演示行程',
  'map.stop.demoBody': '一段 1 分钟的模拟，让你看到并听到闹钟效果。',
  'map.stop.switch': '将闹钟切换到此站点',
  'map.stop.saved': '已加入收藏',
  'map.stop.removed': '已取消收藏',
  'map.stop.notFound': '这部手机上的站点中没有这个站点。',

  // The rule line
  'map.rule.time': '约在到达前 {minutes} 分钟响铃',
  'map.rule.distance': '距站点 {distance} 时响铃',
  'map.rule.leave': '离开 {distance} 时响铃',
};
