// Wraps app.json (backend-spec 7.2): checks the server URL the build talks to and adds the
// native config that depends on it.
//
// - EXPO_PUBLIC_API_URL unset or empty: a local build without accounts (the app works as before).
// - https://…: production and staging.
// - http://10.0.2.2, localhost or 127.0.0.1 (any port): a local server, for the emulator or
//   `adb reverse`; only then is cleartext allowed, and only for those hosts.
// Anything else stops the build: the app must never send tokens over plain HTTP to the internet.

const LOCAL_HTTP = /^http:\/\/(10\.0\.2\.2|localhost|127\.0\.0\.1)(:\d{1,5})?$/;
const HTTPS = /^https:\/\/[^\s/?#]+(\/[^\s?#]*)?$/;

/** @param {{ config: import('expo/config').ExpoConfig }} context */
module.exports = ({ config }) => {
  const url = (process.env.EXPO_PUBLIC_API_URL ?? '').trim().replace(/\/+$/, '');
  if (url && !HTTPS.test(url) && !LOCAL_HTTP.test(url)) {
    throw new Error(
      `EXPO_PUBLIC_API_URL must be https://… or http://10.0.2.2, http://localhost or http://127.0.0.1 (with an optional port); got "${url}".`,
    );
  }

  const plugins = [...(config.plugins ?? [])];
  // Keeps the install id and the session token out of Android Auto Backup: a restored phone
  // starts as a new guest instead of sharing a session with the old one.
  plugins.push(['expo-secure-store', { configureAndroidBackup: true }]);
  if (LOCAL_HTTP.test(url)) plugins.push('./plugins/with-local-cleartext');

  // AdMob (docs/ads.md): the real app ids when the build sets them, else Google's test ids from app.json.
  const admobAndroid = (process.env.EXPO_PUBLIC_ADMOB_ANDROID_APP_ID ?? '').trim();
  const admobIos = (process.env.EXPO_PUBLIC_ADMOB_IOS_APP_ID ?? '').trim();
  const withAdmob = plugins.map((plugin) =>
    Array.isArray(plugin) && plugin[0] === 'react-native-google-mobile-ads'
      ? [
          plugin[0],
          { ...plugin[1], ...(admobAndroid ? { androidAppId: admobAndroid } : {}), ...(admobIos ? { iosAppId: admobIos } : {}) },
        ]
      : plugin,
  );

  return { ...config, plugins: withAdmob };
};
