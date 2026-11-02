import type { Strings } from '../en';

export const alarm: Partial<Strings> = {
  'wakeStyle.title': '起こし方',
  'wakeStyle.soundVibration': '音 + バイブ',
  'wakeStyle.vibrate': 'バイブのみ',
  'wakeStyle.sound': '音のみ',
  'wakeStyle.soundVibration.body': '音と振動で知らせます。',
  'wakeStyle.vibrate.body': '音を出さず、強い振動を繰り返します。スマホは手に持つかポケットに入れてください。',
  'wakeStyle.sound.body': '振動せずに音だけで知らせます。',
  'setup.timeSensitive.title': '即時通知',
  'setup.timeSensitive.why': '「睡眠」や「おやすみモード」などの集中モード中でもアラームを届けます。',
  'setup.sound.title': '通知のサウンド',
  'setup.sound.why': 'iPhoneがロック中のときは、通知のサウンドでアラームが鳴ります。',
  'onboarding.setup.ok.timeSensitive': '即時通知を許可済み',
  'onboarding.setup.ok.sound': '通知のサウンドがオン',
  'setup.ios.silent':
    '着信/サイレントスイッチやアクションボタンが消音になっていると、アラームは振動だけになります。移動中はiPhoneを着信モードにして、音量を上げておいてください。',
  'onboarding.setup.hint.locationIos': '次の画面で「正確な位置情報」をオンのまま、「Appの使用中は許可」を選んでください。',
  'onboarding.setup.hint.preciseIos': 'アプリの設定で「位置情報」を開き、「正確な位置情報」をオンにしてください。',
};
