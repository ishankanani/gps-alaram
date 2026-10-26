// Release builds for Google Play (store/PLAY_CONSOLE_GUIDE.md): signs `release` with the upload key
// when the build passes it as Gradle properties, and turns on R8 and resource shrinking.
//
// The key never touches git: .github/workflows/release.yml decodes the keystore from repository
// secrets into the runner's temp folder and hands the paths and passwords to Gradle through
// ORG_GRADLE_PROJECT_* environment variables:
//
//   STOPWAKE_UPLOAD_STORE_FILE      absolute path of the .jks / .keystore
//   STOPWAKE_UPLOAD_STORE_PASSWORD  keystore password
//   STOPWAKE_UPLOAD_KEY_ALIAS       key alias
//   STOPWAKE_UPLOAD_KEY_PASSWORD    key password
//
// Without STOPWAKE_UPLOAD_STORE_FILE the release build stays signed with the template's debug key
// (fine for testers, refused by Play). STOPWAKE_MINIFY=false at prebuild turns R8 off again.
const fs = require('fs');
const path = require('path');
const { withAppBuildGradle, withGradleProperties, withDangerousMod } = require('expo/config-plugins');

const MARK = '// stopwake-release-signing';

const SIGNING = `
        ${MARK}
        release {
            if (findProperty('STOPWAKE_UPLOAD_STORE_FILE')) {
                storeFile file(findProperty('STOPWAKE_UPLOAD_STORE_FILE'))
                storePassword findProperty('STOPWAKE_UPLOAD_STORE_PASSWORD')
                keyAlias findProperty('STOPWAKE_UPLOAD_KEY_ALIAS')
                keyPassword findProperty('STOPWAKE_UPLOAD_KEY_PASSWORD')
            }
        }`;

// Classes of the trip alarm module are started by the system (service, receivers, activity) and
// called from the Expo module registry; keep them whole so R8 cannot rename what JNI/reflection uses.
const PROGUARD = `
# stopwake-release-signing: keep the trip alarm module (started by the system and by Expo's registry).
-keep class com.ishankanani.gpsalarm.tripalarm.** { *; }
`;

function withSigning(config) {
  return withAppBuildGradle(config, (cfg) => {
    let gradle = cfg.modResults.contents;
    if (gradle.includes(MARK)) return cfg;
    // Add the release signing config next to the template's debug one.
    gradle = gradle.replace(/signingConfigs\s*\{/, (m) => `${m}${SIGNING}`);
    // In buildTypes.release, use it when the upload key is there.
    gradle = gradle.replace(
      /(release\s*\{[^}]*?)signingConfig signingConfigs\.debug/,
      `$1signingConfig findProperty('STOPWAKE_UPLOAD_STORE_FILE') ? signingConfigs.release : signingConfigs.debug`,
    );
    if (!gradle.includes("signingConfigs.release : signingConfigs.debug")) {
      throw new Error('with-release-signing: could not find the release signingConfig in app/build.gradle');
    }
    cfg.modResults.contents = gradle;
    return cfg;
  });
}

function withShrinking(config) {
  const on = (process.env.STOPWAKE_MINIFY ?? 'true').trim() !== 'false';
  config = withGradleProperties(config, (cfg) => {
    const set = (key, value) => {
      const item = cfg.modResults.find((p) => p.type === 'property' && p.key === key);
      if (item) item.value = value;
      else cfg.modResults.push({ type: 'property', key, value });
    };
    set('android.enableMinifyInReleaseBuilds', String(on));
    set('android.enableShrinkResourcesInReleaseBuilds', String(on));
    return cfg;
  });
  return withDangerousMod(config, [
    'android',
    async (cfg) => {
      const file = path.join(cfg.modRequest.platformProjectRoot, 'app', 'proguard-rules.pro');
      const current = fs.existsSync(file) ? await fs.promises.readFile(file, 'utf8') : '';
      if (!current.includes('stopwake-release-signing')) await fs.promises.writeFile(file, current + PROGUARD);
      return cfg;
    },
  ]);
}

/** @param {import('expo/config').ExpoConfig} config */
module.exports = function withReleaseSigning(config) {
  return withShrinking(withSigning(config));
};
