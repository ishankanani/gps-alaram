import type { Strings } from '../en';

export const alarm: Partial<Strings> = {
  'wakeStyle.title': '叫醒方式',
  'wakeStyle.soundVibration': '声音 + 震动',
  'wakeStyle.vibrate': '仅震动',
  'wakeStyle.sound': '仅声音',
  'wakeStyle.soundVibration.body': '响铃并震动。',
  'wakeStyle.vibrate.body': '静音，伴有强烈的重复震动。请把手机拿在手里或放在口袋里。',
  'wakeStyle.sound.body': '只响铃，不震动。',
  'setup.timeSensitive.title': '时效性通知',
  'setup.timeSensitive.why': '让闹钟能够穿透“睡眠”“勿扰”等专注模式。',
  'setup.sound.title': '通知声音',
  'setup.sound.why': 'iPhone 锁屏时，闹钟通过通知声音响起。',
  'onboarding.setup.ok.timeSensitive': '已允许时效性通知',
  'onboarding.setup.ok.sound': '通知声音已开启',
  'setup.ios.silent': '如果响铃/静音开关或操作按钮设为静音，闹钟只会震动。出行期间请让 iPhone 保持响铃并调大音量。',
  'onboarding.setup.hint.locationIos': '在接下来的窗口中，保持“精确”开启，并选择“使用 App 时允许”。',
  'onboarding.setup.hint.preciseIos': '在应用的设置中，打开“位置”并开启“精确位置”。',
};
