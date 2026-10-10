// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ["dist/*", "android/*", "ios/*", "modules/trip-alarm/engine-tests/*", "server/data/*"],
  },
  {
    // StopWake Cloud (server/) runs on Node 22, not React Native.
    files: ["server/**/*.ts"],
    languageOptions: {
      globals: { ...require("globals").node },
    },
  },
]);
