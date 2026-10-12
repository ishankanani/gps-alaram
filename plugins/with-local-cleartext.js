// Allows cleartext HTTP to a StopWake server on this machine only (backend-spec 7.2): the emulator's
// host alias 10.0.2.2, and localhost / 127.0.0.1 for a phone behind `adb reverse`. Everything else
// stays HTTPS-only. app.config.js adds this plugin only when EXPO_PUBLIC_API_URL is such a local
// http URL, so release builds for Google Play never contain it.
const fs = require('fs');
const path = require('path');
const { AndroidConfig, withAndroidManifest, withDangerousMod } = require('expo/config-plugins');

const NAME = 'stopwake_network_security_config';

const XML = `<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
  <base-config cleartextTrafficPermitted="false" />
  <domain-config cleartextTrafficPermitted="true">
    <domain includeSubdomains="false">10.0.2.2</domain>
    <domain includeSubdomains="false">localhost</domain>
    <domain includeSubdomains="false">127.0.0.1</domain>
  </domain-config>
</network-security-config>
`;

/** @param {import('expo/config').ExpoConfig} config */
function withLocalCleartext(config) {
  config = withDangerousMod(config, [
    'android',
    async (cfg) => {
      const dir = path.join(cfg.modRequest.platformProjectRoot, 'app', 'src', 'main', 'res', 'xml');
      await fs.promises.mkdir(dir, { recursive: true });
      await fs.promises.writeFile(path.join(dir, `${NAME}.xml`), XML);
      return cfg;
    },
  ]);
  return withAndroidManifest(config, (cfg) => {
    const app = AndroidConfig.Manifest.getMainApplicationOrThrow(cfg.modResults);
    app.$['android:networkSecurityConfig'] = `@xml/${NAME}`;
    return cfg;
  });
}

module.exports = withLocalCleartext;
