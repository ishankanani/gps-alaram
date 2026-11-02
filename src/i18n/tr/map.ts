import type { Strings } from '../en';

export const map: Partial<Strings> = {
  // Map controls and overlays
  'map.control.locate': 'Konumumu göster',
  'map.control.locateDenied': 'Konum kapalı. Kurulumu aç',
  'map.control.credits': 'Harita katkıları',
  'map.zoomHint': 'Tüm durakları görmek için yakınlaştır',
  'map.offline': 'Çevrimdışı · duraklar ve alarmlar çalışır',
  'map.firstOffline': 'Harita ilk seferde internete ihtiyaç duyar. Arama ve alarmlar çevrimdışı çalışır.',
  'map.pinCrosshair': 'İğne konumu',

  // Update required
  'map.update.body': 'StopWake’i güncelle. Alarmların çalışmaya devam eder.',
  'map.update.action': 'Güncelle',
  'map.announcement.open': 'Daha fazla bilgi',

  // Country pack suggestion
  'map.pack.title': '{country} durakları · {size}',
  'map.pack.body': 'Burada internetsiz de durak bulabilmek için indir.',
  'map.pack.download': 'İndir',
  'map.pack.downloading': 'İndiriliyor %{percent}',
  'map.pack.installing': 'Yükleniyor…',
  'map.pack.failed': 'İndirme durdu. Tekrar dene.',
  'map.pack.hint': '{country} mi arıyorsun? Duraklarını indir ({size}).',

  // Browse mode
  'map.nearby.title': 'Yakındaki duraklar',
  'map.nearby.within': '{distance} içinde',
  'map.nearby.showAll': 'Yakındakilerin tümünü göster',
  'map.nearby.showFewer': 'Daha azını göster',
  'map.nearby.emptyTitle': 'Yakında durak yok',
  'map.nearby.emptyBody': 'Bunun yerine hedefini ara.',
  'map.location.title': 'Yakınındaki durakları gör',
  'map.location.body': 'Çevrendeki durakları listelemek için konuma izin ver.',
  'map.location.allow': 'Konuma izin ver',
  'map.location.deniedBody': 'StopWake için konum kapalı. Çevrendeki durakları listelemek için aç.',
  'map.location.openSetup': 'Kurulumu aç',
  'map.longPressHint': 'Haritanın herhangi bir yerine iğne bırakmak için uzun bas.',

  // Search mode
  'map.search.leaveHere': 'Buradan ayrıldığımda çal',
  'map.search.leaveHereBody': 'Şu an bulunduğun yerden uzaklaştığında seni uyandırır',
  'map.search.dropPin': 'Haritaya iğne bırak',
  'map.search.tip': 'İpucu: koordinat ya da Google Haritalar bağlantısı yapıştır.',
  'map.search.stops': 'Duraklar',
  'map.search.addressesOffline': 'Adresler için internet gerekir. Duraklar çevrimdışı çalışır.',
  'map.search.noResultsTitle': '“{query}” için sonuç yok',
  'map.search.noResultsBody': 'Yazımı kontrol et ya da şehri ekle, örneğin “Bahnhofstraße Ulm”.',
  'map.search.recentsCleared': 'Son duraklar temizlendi',
  'map.search.undo': 'Geri al',

  // Pin mode
  'map.pin.title': 'İğneyi yerleştirmek için haritayı kaydır',
  'map.pin.finding': 'Adres bulunuyor…',
  'map.pin.use': 'Bu noktayı kullan',

  // Stop mode
  'map.stop.minutes': '{minutes} dk',
  'map.stop.trainWarning': 'Trende {distance} yalnızca birkaç saniyedir. Bunun yerine 2 dk önce uyandırılsın mı?',
  'map.stop.useTwoMinutes': '2 dk kullan',
  'map.stop.options': 'Alarm seçenekleri',
  'map.stop.optionsArrive': 'Varış',
  'map.stop.optionsLeave': 'Ayrılış',
  'map.stop.whenLabel': 'Alarm ne zaman çalar',
  'map.stop.strengthLabel': 'Alarm şiddeti',
  'map.stop.demo': 'Deneme yolculuğu yap',
  'map.stop.demoBody': 'Alarmı görüp duymak için 1 dakikalık bir simülasyon.',
  'map.stop.switch': 'Alarmı bu durağa geçir',
  'map.stop.saved': 'Favorilere eklendi',
  'map.stop.removed': 'Favorilerden çıkarıldı',
  'map.stop.notFound': 'Bu durak, bu telefondaki duraklar arasında yok.',

  // The rule line
  'map.rule.time': 'Varmadan yaklaşık {minutes} dk önce çalar',
  'map.rule.distance': 'Duraktan {distance} önce çalar',
  'map.rule.leave': '{distance} uzaklaştığında çalar',
};
