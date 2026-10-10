# StopWake 1.0: build plan

The spec is `ui-direction-a.md` (the base) plus `ui-critiques.md` (apply every **must** change and
the **should** changes), `backend-spec.md` (server, contract, app integration in section 7) and
`decisions.md`. Several engineers work in one checkout at the same time, so every package owns
its files. Nobody runs `git commit`; the lead commits.

## Shared files (owned by the lead; change them only with a note in your report)

- `src/api/types.ts` (wire contract) and `src/lib/pricing.ts` (prices by country).
- `package.json` dependencies (scripts belong to package S). Everything needed is installed:
  React Navigation 7, react-native-screens, react-native-svg, expo-linear-gradient, expo-haptics,
  expo-secure-store, expo-clipboard, expo-application, expo-web-browser, @expo-google-fonts/inter.
  Do not add dependencies; if one is truly needed, say so in the report.
- `modules/trip-alarm/**` (native trip service and alarm). The JS API stays as it is.

## Package S: server (`server/**`)

Root `package.json` scripts, `tsconfig.json` exclude, the `server` block of `eslint.config.js`,
and the `checks` and `server-image` jobs of `.github/workflows/android.yml`.

## Package F: foundation (first; the app packages build on it)

Owns until done, then frozen (later packages only add files):
- `src/ui/tokens.ts`, `src/ui/colors.ts`, `src/ui/theme.tsx`, `src/ui/fonts.ts`,
  `src/ui/components/*` (every component of ui-direction-a section 3), `src/ui/index.ts`.
  The old `src/ui/components.tsx` and `src/ui/theme.ts` are removed once nothing imports them.
- `app.json` (font plugin, scheme `stopwake`), `app.config.js` if needed.
- `src/navigation/*`: every route of section 4.1 registered with its params type, a placeholder
  screen file per route in the folder of the package that will build it, linking, Android back.
- `src/state/*`: providers that take over today's `App.tsx` logic: saved data (favourites,
  recents, preferences), the trip lifecycle with the native module (status listener, trail,
  launch, demo, stop, setup check, language sync, Trip and Arrived presentation), and toasts.
- `App.tsx` (thin: providers + navigation).
- `src/i18n/en/<area>.ts` for every area below (empty objects to start), spread into
  `src/i18n/en/index.ts`, and the same empty files for the other ten languages.

## Packages after F (in parallel)

| Package | Owns | i18n areas |
|---|---|---|
| A: account, plan, paywall | `src/api/**` except `types.ts` and `admin*.ts`; `src/lib/entitlement.ts`, `src/lib/remoteConfig.ts`, `src/lib/pro.ts`, `src/lib/plans.ts`; `src/screens/account/**`, `src/screens/paywall/**`, `src/screens/auth/**`; `app.config.js` and `plugins/` for the API URL and local cleartext (backend-spec 7.2) | `account`, `paywall`, `errors` |
| D: admin | `src/api/admin*.ts`, `src/screens/admin/**` | `admin` (English only) |
| M: map and trip | `src/map/**`, `src/screens/map/**`, `src/screens/trip/**`, `src/lib/stations/**` (search and packs logic only if needed) | `map`, `trip` |
| L: everything else | `src/screens/saved/**`, `src/screens/activity/**`, `src/screens/settings/**`, `src/screens/onboarding/**`, `src/screens/setup/**`, `src/lib/history.ts` | `saved`, `activity`, `settings`, `onboarding` |

A package that needs something from another package's files (a new route param, a component
change, a provider function) writes it in its report instead of editing the file.

## Package E: e2e and screenshots (after all)

`e2e/**`, `.github/workflows/screenshots.yml`: the server seeded in CI (backend-spec 6.8), Maestro
flows for the storyboard (ui-direction-a section 6), screenshots of every screen including the
paywall in several countries and every admin screen.

## Then

Translations of every new user-facing area into the other ten languages (admin stays English),
a review pass (security of the server, regressions in the trip and alarm flow, the spec's
definition of done), and CI until the Android build and the screenshots are green.

## Checks every package leaves passing

`npm run typecheck`, `npm run lint`, `npm test` (Vitest), and for S also `npm run typecheck:server`
and `npm run test:server`. The dictionaries test may fail only for missing translations of new
areas until the translation step.
