import type { Strings } from '../en';

export const map: Partial<Strings> = {
  // Map controls and overlays
  'map.control.locate': 'إظهار موقعي',
  'map.control.locateDenied': 'الموقع متوقف. افتح الإعداد',
  'map.control.credits': 'حقوق الخريطة',
  'map.zoomHint': 'قرّب الخريطة لرؤية جميع المحطات',
  'map.offline': 'بدون اتصال · المحطات والمنبّهات تعمل',
  'map.firstOffline': 'تحتاج الخريطة إلى الإنترنت في المرة الأولى. البحث والمنبّهات يعملان بدون اتصال.',
  'map.pinCrosshair': 'موضع الدبوس',

  // Update required
  'map.update.body': 'حدّث StopWake. منبّهاتك ما زالت تعمل.',
  'map.update.action': 'تحديث',
  'map.announcement.open': 'اعرف المزيد',

  // Country pack suggestion
  'map.pack.title': 'محطات {country} · {size}',
  'map.pack.body': 'نزّلها للعثور على المحطات هنا، حتى بدون إنترنت.',
  'map.pack.download': 'نزّل',
  'map.pack.downloading': 'جارٍ التنزيل {percent}%',
  'map.pack.installing': 'جارٍ التثبيت…',
  'map.pack.failed': 'توقف التنزيل. حاول مجددًا.',
  'map.pack.hint': 'تبحث عن {country}؟ نزّل محطاتها ({size}).',

  // Browse mode
  'map.nearby.title': 'المحطات القريبة',
  'map.nearby.within': 'خلال {distance}',
  'map.nearby.showAll': 'عرض كل المحطات القريبة',
  'map.nearby.showFewer': 'عرض أقل',
  'map.nearby.emptyTitle': 'لا توجد محطات قريبة',
  'map.nearby.emptyBody': 'ابحث عن وجهتك بدلًا من ذلك.',
  'map.location.title': 'شاهد المحطات القريبة منك',
  'map.location.body': 'اسمح بالوصول إلى الموقع لعرض المحطات من حولك.',
  'map.location.allow': 'السماح بالموقع',
  'map.location.deniedBody': 'الموقع متوقف لتطبيق StopWake. شغّله لعرض المحطات من حولك.',
  'map.location.openSetup': 'افتح الإعداد',
  'map.longPressHint': 'اضغط مطولًا على الخريطة لوضع دبوس في أي مكان.',

  // Search mode
  'map.search.leaveHere': 'نبّهني عندما أغادر هنا',
  'map.search.leaveHereBody': 'يوقظك بمجرد ابتعادك عن موقعك الحالي',
  'map.search.dropPin': 'ضع دبوسًا على الخريطة',
  'map.search.tip': 'نصيحة: الصق الإحداثيات أو رابط خرائط Google.',
  'map.search.stops': 'المحطات',
  'map.search.addressesOffline': 'العناوين تحتاج إلى الإنترنت. المحطات تعمل بدون اتصال.',
  'map.search.noResultsTitle': 'لا توجد نتائج لـ «{query}»',
  'map.search.noResultsBody': 'تحقق من الإملاء أو أضف اسم المدينة، مثل «Bahnhofstraße Ulm».',
  'map.search.recentsCleared': 'تم مسح المحطات الأخيرة',
  'map.search.undo': 'تراجع',

  // Pin mode
  'map.pin.title': 'حرّك الخريطة لوضع الدبوس',
  'map.pin.finding': 'جارٍ البحث عن العنوان…',
  'map.pin.use': 'استخدم هذا الموضع',

  // Stop mode
  'map.stop.minutes': '{minutes} د',
  'map.stop.trainWarning': 'في القطار، {distance} تعني ثوانيَ فقط. هل تفضّل الإيقاظ قبل دقيقتين؟',
  'map.stop.useTwoMinutes': 'استخدم دقيقتين',
  'map.stop.options': 'خيارات المنبّه',
  'map.stop.optionsArrive': 'الوصول',
  'map.stop.optionsLeave': 'المغادرة',
  'map.stop.whenLabel': 'متى يرنّ المنبّه',
  'map.stop.strengthLabel': 'قوة المنبّه',
  'map.stop.demo': 'جرّب رحلة تجريبية',
  'map.stop.demoBody': 'محاكاة لمدة دقيقة لتشاهد المنبّه وتسمعه.',
  'map.stop.switch': 'انقل المنبّه إلى هذه المحطة',
  'map.stop.saved': 'تم الحفظ في المفضلة',
  'map.stop.removed': 'تمت الإزالة من المفضلة',
  'map.stop.notFound': 'هذه المحطة ليست ضمن المحطات الموجودة على هذا الهاتف.',

  // The rule line
  'map.rule.time': 'يرنّ قبل وصولك بحوالي {minutes} د',
  'map.rule.distance': 'يرنّ قبل المحطة بـ {distance}',
  'map.rule.leave': 'يرنّ عندما تبتعد {distance}',
};
