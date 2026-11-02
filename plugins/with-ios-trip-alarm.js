// iOS settings of the trip alarm module (modules/trip-alarm/ios) that depend on the build.
//
// Critical Alerts ring through the Ring/Silent switch and Focus, but Apple must grant the
// entitlement first (store/APP_STORE_GUIDE.md has the request text). Until then builds must not
// claim it, or signing fails. With `criticalAlerts: true` (app.config.js sets it when the build
// has IOS_CRITICAL_ALERTS=1) this plugin:
//   - adds com.apple.developer.usernotifications.critical-alerts to the entitlements, and
//   - sets StopWakeCriticalAlerts in Info.plist, which the native module reads to ask for the
//     permission and to send the alarm as a Critical Alert once the user allows it.
// Without it, StopWakeCriticalAlerts is false and the alarm is a Time Sensitive notification.
const { withEntitlementsPlist, withInfoPlist } = require('expo/config-plugins');

const ENTITLEMENT = 'com.apple.developer.usernotifications.critical-alerts';

/**
 * @param {import('expo/config').ExpoConfig} config
 * @param {{ criticalAlerts?: boolean }} [options]
 */
module.exports = function withIosTripAlarm(config, options = {}) {
  const critical = options.criticalAlerts === true;
  config = withInfoPlist(config, (cfg) => {
    cfg.modResults.StopWakeCriticalAlerts = critical;
    return cfg;
  });
  return withEntitlementsPlist(config, (cfg) => {
    if (critical) cfg.modResults[ENTITLEMENT] = true;
    else delete cfg.modResults[ENTITLEMENT];
    return cfg;
  });
};
