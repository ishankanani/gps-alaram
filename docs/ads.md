# Ads and monetization

StopWake launches **free for everyone, with ads** (Google AdMob). Pro (RevenueCat subscriptions)
is kept in the code and comes back with one setting.

## The switch

`src/lib/monetization.ts`

| `EXPO_PUBLIC_MONETIZATION` | What the app does |
| --- | --- |
| `free_ads` (default, also when unset or unknown) | Every Pro feature is unlocked for all (Heavy sleeper, unlimited favourites, offline maps). Paywall and Redeem close as soon as they open, plan cards, "Get Pro", PRO badges/locks and upsells are hidden, RevenueCat is never configured. Ads show. |
| `premium` | Exactly the Pro behaviour from before: RevenueCat, paywall, gates from the remote config. Users with Pro see **no ads**; free users see ads. |

One gate for everything:

- `featureUnlocked(feature, isPro, proFeatures)`: used by the plan gates in `src/lib/plans.ts`
  (`strengthAllowed`, `canAddFavourite`, `offlineMapAllowed`), so every screen gets the change.
- `premiumEnabled()`: whether anything Pro-related (paywall, plans, restore, badges, upsells) is shown.
- `adsEnabled(isPro)`: whether this user gets ads.

The remote config can override the build: `setRemoteMonetizationMode('premium' | 'free_ads' | null)`
(null goes back to the build value). Hook it to a `monetization` field of the remote config.

### Switching to premium later

1. Set up RevenueCat and the Play products (see the Pro docs), set `EXPO_PUBLIC_REVENUECAT_ANDROID_KEY`.
2. Build with `EXPO_PUBLIC_MONETIZATION=premium` (EAS: in the profile's `env`, or as an EAS
   environment variable), or flip the remote config's `monetization` field to `premium`.
3. Nothing else: the paywall, gates, plan cards and Restore come back; Pro users stop seeing ads.

## Placements and rules

All ad code is in `src/ads/`. The rules are pure functions in `src/ads/rules.ts` (unit-tested in
`src/ads/__tests__/rules.test.ts`); `src/ads/runtime.ts` talks to the SDK. Ads never block or
delay starting a trip or the alarm: nothing on those paths awaits an ad, and every failure is silent.

| Format | Where | Rules |
| --- | --- | --- |
| Anchored adaptive banner | Bottom of Map (browse mode only), Saved, Activity, Settings | Never on Trip, Arrived, the alarm, Setup/permissions, Onboarding, sign-in, Paywall. Hidden while the alarm rings and during the reward. A failed load collapses to nothing. |
| Interstitial | When the user leaves Arrived (Done / back) after a trip that arrived or was ended normally, shown over the map | Preloaded in advance. Not in Arrived's first 3 s, never after a failed alarm or "stopped by the phone", never while a trip runs or the alarm rings. At most once per 30 min and 3 per day. |
| Rewarded | Settings › Ads › "Watch a video, no ads for 24 h" | The user asks for it. Watched to the end: 24 h without banners, interstitials and app-open ads (a second watch extends, up to 48 h). |
| App-open | Cold start (if the ad is ready within 8 s) and returns to the foreground after ≥ 30 s away | Never while a trip runs or the alarm rings, on Trip/Arrived/Setup/Onboarding/sign-in/Paywall, on the first 2 launches, more than once per 4 h, or within 60 s of another full-screen ad. Ads older than 4 h are reloaded. |

**Why the reward is "no ads for 24 h":** in `free_ads` everything is already unlocked, so the only
honest thing to give is a break from ads; it doubles as a "support the app" button. In `premium`
mode the same `showRewarded()` can later unlock a Pro feature for 24 h (e.g. Heavy sleeper) by
extending the reward branch in `runtime.ts`.

The counters (launches, last ads, the reward) are stored on the device in `stopwake-ads.json`.

## Consent (EU/EEA, UK, Germany)

Before any request, `runtime.ts` runs Google's UMP (`AdsConsent.gatherConsent()`), which shows
the consent form where it is required. Ads are requested only when UMP says `canRequestAds`.
Without consent to personalised ads (or when UMP fails and the last known state is used), all
requests are **non-personalised** (`requestNonPersonalizedAdsOnly`). When UMP requires it,
Settings shows "Privacy choices for ads", which opens UMP's privacy options form.

In AdMob: **Privacy & messaging → European regulations → create a GDPR message** for the app
(and publish it), otherwise UMP has no form to show and EEA users get no ads.

## Setting up AdMob

1. Create an account at <https://admob.google.com> (with the Google account that owns the Play
   listing) and complete payments/tax info.
2. **Apps → Add app → Android**, link it to the Play listing `com.ishankanani.gpsalarm` (or add it
   unpublished and link later). Copy the **App ID** (`ca-app-pub-XXXXXXXXXXXXXXXX~YYYYYYYYYY`).
3. **Ad units → Add ad unit**, four times:
   - Banner (used as anchored adaptive), name e.g. `browse_banner`
   - Interstitial, `arrived_interstitial`
   - Rewarded, `ad_free_24h`, reward e.g. 1 × "ad-free day"
   - App open, `app_open`
4. Create the GDPR message (above).
5. Add test devices (AdMob → Settings → Test devices) for your own phones; never click real ads.

## Environment variables

Defaults are Google's official **test** ids, which always serve test ads. Real ids only in
release builds (EAS env / `.env.local`, never committed if you prefer to keep them private):

| Variable | What |
| --- | --- |
| `EXPO_PUBLIC_MONETIZATION` | `free_ads` (default) or `premium` |
| `EXPO_PUBLIC_ADMOB_ANDROID_APP_ID` | AdMob app id (Android), read by `app.config.js` into the native manifest |
| `EXPO_PUBLIC_ADMOB_IOS_APP_ID` | AdMob app id (iOS) |
| `EXPO_PUBLIC_ADMOB_ANDROID_BANNER` | Banner unit |
| `EXPO_PUBLIC_ADMOB_ANDROID_INTERSTITIAL` | Interstitial unit |
| `EXPO_PUBLIC_ADMOB_ANDROID_REWARDED` | Rewarded unit |
| `EXPO_PUBLIC_ADMOB_ANDROID_APP_OPEN` | App-open unit |
| `EXPO_PUBLIC_ADMOB_IOS_BANNER` / `_INTERSTITIAL` / `_REWARDED` / `_APP_OPEN` | The iOS units |

A unit that is missing or does not look like `ca-app-pub-<16 digits>/<10 digits>` falls back to
the test unit (`src/ads/units.ts`). The app ids in `app.json` are Google's test app ids; the
config plugin is `react-native-google-mobile-ads`. Check with `npx expo config --type introspect`.

The library has native code: it needs a development or EAS build (not Expo Go).

## app-ads.txt

AdMob verifies that you own the app through `app-ads.txt` on the developer website listed in
the Play Store:

1. Put the website URL in Play Console → Store presence → Store settings → Contact details.
2. Serve `https://<that domain>/app-ads.txt` (domain root, plain text) containing the line AdMob
   shows under **Apps → View all apps → app-ads.txt**, of the form
   `google.com, pub-XXXXXXXXXXXXXXXX, DIRECT, f08c47fec0942fa0`.
3. AdMob checks within about 24 h; until then, ad serving may be limited.

## Launch checklist

- Real app id and four unit ids set in the release profile; test ids only in development.
- GDPR message published in AdMob; the Play Console Data safety form declares the AdMob SDK
  (advertising id, approximate location, app interactions) and "contains ads" is ticked.
- `app-ads.txt` live.
