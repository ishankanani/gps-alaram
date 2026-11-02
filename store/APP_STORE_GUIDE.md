# StopWake on the App Store

Everything needed to put StopWake on iPhone: the Apple accounts, signing in GitHub Actions,
TestFlight, the App Privacy answers, review notes and the Critical Alerts request. The Google Play
counterpart is [PLAY_CONSOLE_GUIDE.md](PLAY_CONSOLE_GUIDE.md).

## What the iPhone app does differently

The JavaScript app is the same; the trip alarm module has an iOS side (`modules/trip-alarm/ios`)
with the same API and the same trip engine, ported from Kotlin to Swift and tested against the
same scenarios (`modules/trip-alarm/ios-engine-tests`, bit-for-bit the same results on 1000
simulated trips).

| | Android | iPhone |
| --- | --- | --- |
| Tracking with the screen locked | Foreground service, "while using the app" | Background location updates (`location` background mode), "While Using the App" plus the blue location indicator. "Always" is never asked for; if the rider grants it anyway, the app also picks a trip up again after iOS closed it |
| Battery | GPS every 2 min far away, 30 s in between, 5 s near | Accuracy by distance: ~100 m far away (mostly Wi-Fi/cell), 10 m in between, best near the stop |
| Watchdog | Handler + AlarmManager | Timer + a "Tracking stopped" notification kept 3 minutes ahead; it fires if iOS closes the app mid-trip |
| The alarm | Full-screen alarm over the lock screen, alarm stream (rings in silent mode) | Time Sensitive notifications with a 28 s alarm sound, repeated every 30 s for 10 minutes (Vibrate only: a silent sound every 10 s, each one vibrates), with Dismiss / Snooze / Not yet buttons; in the app, sound and vibration until dismissed |
| Silent mode | Rings | Follows the Ring/Silent switch (vibration only) until Apple grants **Critical Alerts**, which ring through it |
| Setup checklist | Precise location, notifications, full-screen alarm, exact alarms, battery | Precise location, notifications, Time Sensitive notifications, notification sounds, and a note about the Ring/Silent switch and Focus |

Not yet on iPhone: the Live Activity / Dynamic Island for the running trip (see [Follow-ups](#follow-ups))
and the flashing light of Heavy sleeper.

## 1. Apple Developer Program

1. Enrol at <https://developer.apple.com/programs/enroll/> (99 USD a year). As an individual the
   seller name is your own name; as an organisation you need a D-U-N-S number and the seller name
   is the company.
2. Note the **Team ID** (developer.apple.com → Account → Membership details): it becomes the
   `APPLE_TEAM_ID` secret.

## 2. App ID and capabilities

developer.apple.com → Certificates, Identifiers & Profiles → Identifiers → **+** → App IDs → App:

- Description: StopWake. Bundle ID (explicit): **`com.ishankanani.gpsalarm`** (the same as Android).
- Capabilities: **Time Sensitive Notifications** (the alarm breaks through Focus).
  Later, after Apple's approval: **Critical Alerts** (section 9).
- Nothing else: no push notifications, no App Groups, no Sign in with Apple.

Automatic signing in CI also turns on the capabilities the build's entitlements ask for, so this
step mostly confirms the identifier is yours.

## 3. App Store Connect app

<https://appstoreconnect.apple.com> → Apps → **+** → New App:

| Field | Value |
| --- | --- |
| Platforms | iOS |
| Name | StopWake (localised names per language, like `listing/<lang>.md`) |
| Primary language | English (U.S.) |
| Bundle ID | com.ishankanani.gpsalarm |
| SKU | stopwake-ios |
| User access | Full access |

Then under App Information: category **Navigation** (secondary: Travel), content rights "No
third-party content" (the map tiles and stop data are open data with attribution in the app),
age rating questionnaire all "None" → **4+**. Privacy policy URL
<https://ishankanani.github.io/gps-alaram/privacy/>, support URL
<https://ishankanani.github.io/gps-alaram/>. The app supports iPhone only (`supportsTablet: false`),
so no iPad screenshots are needed.

**Export compliance:** the app only uses HTTPS from the system; `ITSAppUsesNonExemptEncryption` is
`false` in the build, so App Store Connect does not ask per build.

## 4. Signing and builds in GitHub Actions

The **iOS** workflow (`.github/workflows/ios.yml`) builds an unsigned simulator app on every push
(and runs the Swift engine tests). The signed App Store build runs by hand.

### Secrets

App Store Connect → Users and Access → Integrations → **App Store Connect API** → Team Keys → **+**:
name "GitHub", access **Admin** (Xcode needs it to create the distribution certificate and the
profile on the first build; App Manager works once those exist). Download the `.p8` (only once!).

GitHub → Settings → Secrets and variables → Actions → **Secrets**:

| Secret | Value |
| --- | --- |
| `ASC_KEY_ID` | the key id (10 characters) |
| `ASC_ISSUER_ID` | the issuer id shown above the keys list |
| `ASC_KEY_P8_BASE64` | `base64 -i AuthKey_XXXXXXXXXX.p8 \| pbcopy` (macOS) or `base64 -w0 AuthKey_…p8` (Linux) |
| `APPLE_TEAM_ID` | the Team ID from section 1 |
| `REVENUECAT_IOS_KEY` | optional, only when Pro is sold on iOS (RevenueCat's Apple public SDK key) |

**Variables** (same page, Variables tab), all optional:

| Variable | Value |
| --- | --- |
| `ADMOB_IOS_APP_ID` | the AdMob iOS app id (section 6). Without it the build shows Google's test ads |
| `ADMOB_IOS_BANNER`, `ADMOB_IOS_INTERSTITIAL`, `ADMOB_IOS_REWARDED`, `ADMOB_IOS_APP_OPEN` | the iOS ad unit ids |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY` | accounts (shared with Android) |
| `IOS_CRITICAL_ALERTS` | `1` only after Apple granted Critical Alerts (section 9) |

### Building and uploading

Actions → **iOS** → Run workflow → tick **signed** (and **testflight** to upload):

1. `expo prebuild`, `pod install`, `xcodebuild archive` with automatic signing through the API key
   (`-allowProvisioningUpdates`): Xcode creates the Apple Distribution certificate and the App
   Store profile itself, with the capabilities from the entitlements.
2. The IPA is exported and kept as the `StopWake-ipa` artifact.
3. With **testflight**, `xcrun altool --upload-app` sends it to App Store Connect. Processing takes
   5–30 minutes; then it appears under TestFlight.

The **build number** is the workflow's run number, so every upload is higher than the last; the
version shown to users is `version` in `app.json`.

Alternative: EAS Build and Submit (`npx eas-cli build -p ios --profile production --auto-submit`)
does the same in Expo's cloud and manages certificates for you, but needs an Expo account and an
`EXPO_TOKEN`; the GitHub workflow needs nothing beyond the Apple key.

### TestFlight

- **Internal testing** (up to 100 people with App Store Connect access): add a group, add the
  build; no review. Do the 20 real trips of the launch gate here.
- **External testing** (up to 10,000 by email or public link): the first build of each version
  goes through a short Beta App Review; use the review notes from section 8.
- Ask testers for the trip log after each trip (Activity → a trip → Share trip log).

## 5. On a phone before the first upload

On a Mac with Xcode: `npx expo run:ios --device` installs a development build on a connected
iPhone. Check before every release:

- [ ] Setup: precise location, notifications, Time Sensitive allowed; the silent-switch note shows.
- [ ] Demo ride with the phone locked: the alarm notification rings and repeats every 30 s; Dismiss
      from the lock screen ends the trip; Snooze rings again a minute later.
- [ ] The same with **Vibrate only** (no sound, a vibration every 10 s) and **Sound only**.
- [ ] Ring/Silent switch on silent: vibration only (expected until Critical Alerts).
- [ ] Sleep Focus on: the alarm still comes through (Time Sensitive).
- [ ] A real trip with the phone in a pocket; the blue location indicator shows all the way.
- [ ] Swipe the app away mid-trip: "Tracking stopped" arrives right away or within 3 minutes.
- [ ] Settings → Countries: a country pack downloads and unpacks (the native gunzip).
- [ ] Ads: the UMP consent form (EEA) and the tracking prompt appear once, after onboarding.

## 6. AdMob on iOS and the tracking prompt

1. AdMob → Apps → Add app → **iOS** (link it to the App Store listing once it exists). Copy the app
   id into `ADMOB_IOS_APP_ID` and create the four ad units like on Android (`docs/ads.md`).
2. Privacy & messaging: the **GDPR message** must include the iOS app. Also create an
   **IDFA explainer message** (Privacy & messaging → IDFA explainer) for the iOS app. Google's UMP
   SDK, which the app already runs before any ad request (`src/ads/runtime.ts`), then shows the
   explainer and Apple's App Tracking Transparency prompt with our
   `NSUserTrackingUsageDescription` (in 11 languages, `locales/`). Without the explainer
   message nothing asks for tracking and all ads are non-personalised on iOS, which is allowed.
3. The SKAdNetwork ids for Google and its buyers are in `app.json` (plugin
   `react-native-google-mobile-ads`, `skAdNetworkItems`). Google updates its list now and then:
   compare with <https://developers.google.com/admob/ios/3p-skadnetworks> before a release.
4. `site/app-ads.txt` is shared with Android.

## 7. App Privacy (App Store Connect → App Privacy)

The same data flows as on Android (`play-console-answers.md`). "Linked" means tied to the account;
nothing of our own is used for tracking. Google's AdMob SDK collects the advertising rows; check
them against Google's page "Prepare for Apple's App Privacy requirements" when the SDK is updated.
The app's privacy manifest (`ios.privacyManifests` in `app.json`) declares the same of our own data.

| Data type | Collected | Linked to the user | Used for tracking | Purposes |
| --- | --- | --- | --- | --- |
| Contact Info → Email Address | Yes (only with an account) | Yes | No | App Functionality |
| Contact Info → Name | Yes (optional display name) | Yes | No | App Functionality |
| Identifiers → User ID | Yes (account) | Yes | No | App Functionality |
| Identifiers → Device ID | Yes (AdMob: IDFA when allowed, IDFV) | No | **Yes** | Third-Party Advertising, Analytics |
| Location → Precise Location | Yes (only with an account: synced trip routes) | Yes | No | App Functionality |
| Location → Coarse Location | Yes (address search and country lookup by Photon; AdMob from the IP address) | No | No | App Functionality, Third-Party Advertising |
| User Content → Other User Content | Yes (favourites with their names, with an account) | Yes | No | App Functionality |
| Search History | Yes (address searches sent to Photon, not stored by us) | No | No | App Functionality |
| Usage Data → Product Interaction | Yes (AdMob) | No | **Yes** | Third-Party Advertising, Analytics |
| Usage Data → Advertising Data | Yes (AdMob) | No | **Yes** | Third-Party Advertising |
| Diagnostics → Crash Data, Performance Data, Other Diagnostic Data | Yes (AdMob SDK) | No | No | Analytics |

Not collected: health, financial info, contacts, photos, audio, browsing history, sensitive info.
With Pro on iOS (RevenueCat), add **Purchases → Purchase History** (App Functionality).

**Account deletion:** Apple requires it in the app; it is under Account → Delete account.

## 8. Review notes (App Review Information → Notes)

> StopWake is an alarm that wakes public-transport riders before their stop. The rider picks a stop
> on the map and taps "Start alarm". Only then does the app start location updates, with "While
> Using the App" permission and the `location` background mode, so the trip keeps being followed
> with the phone locked in a pocket; the blue location indicator shows the whole time. Updates stop
> as soon as the rider arrives, dismisses the alarm or ends the trip. The app never asks for
> "Always" permission and never uses location without a trip the rider started. Location is used
> only to ring the alarm; it is not shared or used for ads.
>
> The alarm is a Time Sensitive notification because riders often sleep with Focus on.
>
> How to test without travelling: allow location and notifications, tap any stop on the map, open
> "Alarm options" and choose "Try a demo trip". The ride is simulated and the alarm rings after
> about 40 seconds, also with the screen locked. An account is optional; every feature works
> without signing in.

Attach a short screen recording of the demo ride with the phone locked if review asks about
background location (Guideline 2.5.4).

## 9. Critical Alerts (later)

Critical Alerts ring through the Ring/Silent switch and Focus, like the Android alarm. Apple grants
the entitlement on request: <https://developer.apple.com/contact/request/notifications-critical-alerts-entitlement/>
(signed in as the Account Holder). Suggested text:

> StopWake (bundle id com.ishankanani.gpsalarm) is a location-based wake-up alarm for people on
> trains, trams and buses. Riders who may fall asleep on the way set an alarm for their stop
> themselves; StopWake follows that trip with GPS and must wake them shortly before they arrive.
> Missing a stop often means being stranded at night, on the last train or bus, far from home,
> which is a real safety concern for many riders, including people who travel alone.
>
> Today the alarm is a Time Sensitive notification, which the Ring/Silent switch silences: a rider
> who forgot the switch sleeps through their stop. We ask for Critical Alerts only for this one
> alarm: it is sent only for a trip the user started, once at the stop (plus a one-minute snooze the
> user chooses), never for marketing, news or any other message. The user picks how they are woken
> (sound and vibration, vibration only or sound only), allows Critical Alerts in a separate system
> prompt and can turn them off in Settings at any time.

After the approval:

1. developer.apple.com → Identifiers → the App ID → enable **Critical Alerts**.
2. GitHub variable `IOS_CRITICAL_ALERTS` = `1`. The config plugin (`plugins/with-ios-trip-alarm.js`)
   then adds the entitlement and `StopWakeCriticalAlerts` to Info.plist; the app asks for the
   Critical Alerts permission together with notifications and sends the alarm as a Critical Alert
   with the alarm sound at full volume (silent for Vibrate only); the in-app alarm then also plays
   through the silent switch.
3. Build with the workflow; Xcode refreshes the profile with the new capability.

Never set `IOS_CRITICAL_ALERTS=1` before the approval: signing fails without the capability.

## 10. Screenshots

iPhone only. App Store Connect needs the **6.9-inch** set (1320 × 2868 or 1290 × 2796 portrait,
e.g. the iPhone 16 Pro Max simulator); it scales them down for smaller iPhones. Optional
**6.5-inch** set (1242 × 2688 or 1284 × 2778, e.g. iPhone 11 Pro Max simulator) if you want
pixel-exact pictures there. 3 to 10 per language, PNG or JPEG without transparency. No iPad set is
needed because the app is iPhone-only. The same scenes as on Google Play work (map, a stop, the
trip, the alarm, arrived); take them in the simulator from the `StopWake-simulator` artifact
(`xcrun simctl install booted StopWake.app`) or a development build, and use a demo ride for the
trip and alarm scenes.

## Follow-ups

- **Live Activity / Dynamic Island** for the running trip (distance, minutes left, a Stop button).
  It needs a Widget Extension target, which `expo prebuild` cannot create from `app.json` alone: add
  it with a config plugin that creates the target (for example `@bacons/apple-targets`, or our own
  plugin writing the extension sources and the Xcode target), declare `NSSupportsLiveActivities`,
  share an `ActivityAttributes` type between the app and the extension, and start, update (at most
  every 15–30 s, from `TripController.emitStatus`) and end the activity in `TripController`. About
  a day of work plus testing on a device; not started, to keep the first iOS release buildable
  without hand-made Xcode targets.
- Heavy sleeper's flashing light on iPhone (torch through AVCaptureDevice, only with the app open).
- New app languages also need `locales/<lang>.json` (the iOS permission texts) and an entry in
  `locales` in `app.json`; missing ones fall back to English.
