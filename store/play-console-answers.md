# Play Console answers for StopWake

Everything Google Play asks about the app, with the answer and the reason. Re-check this file
whenever a permission, SDK or data flow changes. The step-by-step guide is
[PLAY_CONSOLE_GUIDE.md](PLAY_CONSOLE_GUIDE.md).

## App details

| Field | Answer |
| --- | --- |
| App name | StopWake (listing titles per language in `listing/<lang>.md`) |
| Default language | English (United States) – en-US |
| App or game | App |
| Free or paid | Free |
| Category | **Maps & Navigation** (alternative: Travel & Local) |
| Tags (pick up to 5) | Public transit, Navigation, Alarm clock, Travel, Commute (choose the closest ones Play offers) |
| Contact email | `SUPPORT_EMAIL` placeholder: use a real inbox you read (also set it as the repository variable `SUPPORT_EMAIL` for the Pages workflow) |
| Website | https://ishankanani.github.io/gps-alaram/ |
| Privacy policy | https://ishankanani.github.io/gps-alaram/privacy/ |
| Account deletion URL | https://ishankanani.github.io/gps-alaram/account-deletion/ |

## App access

**All functionality is available without special access.** Every feature works without signing in;
the optional account only syncs favourites and trips. (If a reviewer should try the account, add a
test email and password under "App access → Add instructions"; not required.)

## Ads

**Yes, my app contains ads** (Google AdMob: banner, interstitial, rewarded, app open; `docs/ads.md`).

## Content rating (IARC questionnaire)

Category: **All other app types** (utility / productivity / reference).

| Question | Answer |
| --- | --- |
| Violence, blood, fear, sexuality, nudity, profanity, crude humour | No |
| Controlled substances (drugs, alcohol, tobacco) | No |
| Gambling, simulated gambling, real-money gambling | No |
| Users can interact or exchange content with other users (chat, posts, voice) | **No** (accounts are private; nothing is visible to other users) |
| Shares the user's current physical location with other users | **No** |
| Allows users to purchase digital goods | **No** (free_ads build; answer Yes once Pro / in-app purchases are switched on) |
| Unrestricted internet access / web browser | No (only opens the privacy and help pages) |
| Contains ads | Yes (declared separately above) |
| "Is the app a news app?" / "COVID-19 app?" / "Government app?" | No |

Expected rating: **Everyone / PEGI 3 / USK 0**.

## Target audience and content

| Field | Answer |
| --- | --- |
| Target age groups | **18 and over** (recommended; simplest with AdMob and no Families policy obligations). 13–17 is possible, but then the ads must be set up for mixed audiences. Do **not** pick any age under 13. |
| Could the app unintentionally appeal to children? | No |
| Store presence: "Appeals to children" | No |

## News, health, financial, government, VPN declarations

Not applicable: answer No / not a news app / no health features / no financial features.

## Data safety form

How data flows, as built (see `site/privacy/index.html`):

- The trip alarm runs on the phone; GPS fixes are not sent anywhere **unless the user signs in**,
  in which case the trip history (destination, times, a simplified route of each trip), favourites
  and recent stops are synced to Supabase.
- Address search and the "which country am I looking at" lookup send the search text or the
  coordinates of a map point to Photon (photon.komoot.io). Nothing is stored by us.
- Google AdMob (Mobile Ads SDK + UMP) collects the advertising ID, IP address, device and app info,
  ad interactions and diagnostics.

### Overview answers

| Question | Answer |
| --- | --- |
| Does your app collect or share any of the required user data types? | **Yes** |
| Is all of the user data collected by your app encrypted in transit? | **Yes** (HTTPS only; cleartext is disabled in release builds) |
| Do you provide a way for users to request that their data is deleted? | **Yes**: in the app (Account → Delete account / Delete my data) and at the account deletion URL |
| Account creation methods | Username/email and password; "My app allows users to create an account" |
| Independent security review | No |

### Data types

| Data type | Collected | Shared | Optional? | Processed ephemerally | Purposes |
| --- | --- | --- | --- | --- | --- |
| **Location → Approximate location** | Yes | No | Required (address/country lookup, ads) | Yes for Photon lookups | App functionality; Advertising or marketing (AdMob derives coarse location from the IP address) |
| **Location → Precise location** | Yes | No | **Optional** (only with an account: synced trip history) | No | App functionality |
| **Personal info → Email address** | Yes | No | Optional (account) | No | App functionality, Account management |
| **Personal info → Name** | Yes | No | Optional (display name) | No | Account management |
| **Personal info → User IDs** | Yes | No | Optional (StopWake ID, Supabase user id) | No | App functionality, Account management, Fraud prevention, security and compliance |
| **App activity → App interactions** | Yes | **Yes** (AdMob) | Required | No | Advertising or marketing, Analytics |
| **App activity → In-app search history** | Yes | No | Required to search addresses | **Yes** (sent to Photon, not stored) | App functionality |
| **App activity → Other user-generated content** | Yes | No | Optional (favourites with their names, synced) | No | App functionality |
| **App info and performance → Diagnostics** | Yes | **Yes** (AdMob SDK) | Required | No | Advertising or marketing, Analytics |
| **Device or other IDs** | Yes | **Yes** (advertising ID to Google AdMob) | Required | No | Advertising or marketing, Fraud prevention, security and compliance |

Not collected: financial info, health, messages, photos and videos, audio, files and docs, calendar,
contacts, web browsing history, installed apps, phone number, address, race/religion/etc.

Notes for the form:
- "Shared" means transferred to a third party. Data sent to service providers that process it on
  your behalf (Supabase) is not "shared". Google's own Play SDK index lists what the AdMob SDK
  collects; keep the AdMob rows as Shared to be safe.
- If Pro is switched on later (RevenueCat + Google Play Billing), add **Financial info → Purchase history**.

## Permissions and their justification

Final merged manifest (check the "Check the result" step of the Release workflow, which prints the
permissions of every build):

| Permission | From | Why StopWake needs it | Play declaration |
| --- | --- | --- | --- |
| `ACCESS_FINE_LOCATION`, `ACCESS_COARSE_LOCATION` | trip-alarm, expo-location | Measure the distance to the chosen stop during a trip; show nearby stops on the map. Asked "while using the app". | None (no background location) |
| `ACCESS_BACKGROUND_LOCATION` | — | **Not requested** (removed with `blockedPermissions` in app.json). Location keeps working with the screen off because the trip runs in a foreground service the user started. | **No background location declaration needed** |
| `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_LOCATION` | trip-alarm (`TripService`, `foregroundServiceType="location"`) | The running trip: follows GPS with the screen locked and shows the ongoing "On the way to …" notification until the user ends the trip or arrives. | **Foreground service declaration: Location** (see below) |
| `USE_FULL_SCREEN_INTENT` | trip-alarm (`AlarmActivity`) | The arrival alarm opens full screen over the lock screen, like a clock app's alarm. | **Full-screen intent declaration: "Alarm clock / alarms set by the user"** |
| `SCHEDULE_EXACT_ALARM` | trip-alarm (`WatchdogReceiver`) | A watchdog alarm (`setExactAndAllowWhileIdle`) that checks the trip in Doze and notices if the system stopped it, so the user is still warned. The user grants it in setup (Alarms & reminders); `USE_EXACT_ALARM` is **not** used. | None (only `USE_EXACT_ALARM` needs a declaration) |
| `POST_NOTIFICATIONS` | trip-alarm | The ongoing trip notification and the alarm notification. | None |
| `VIBRATE`, `WAKE_LOCK` | trip-alarm, template | Vibrate with the alarm; keep the CPU awake for GPS during a trip. | None |
| `RECEIVE_BOOT_COMPLETED` | trip-alarm (`BootReceiver`) | After a reboot during a trip, tell the user that the trip was stopped (no location is started from the background). | None |
| `INTERNET`, `ACCESS_NETWORK_STATE` | template, expo-network, AdMob | Map tiles, address search, stop downloads, account sync, ads; offline banner. | None |
| `com.google.android.gms.permission.AD_ID` | AdMob SDK | Advertising ID for ads (answer "Yes, uses advertising ID" in **App content → Advertising ID**, purposes: Advertising or marketing, Analytics, Fraud prevention). | **Advertising ID declaration** |
| `ACCESS_ADSERVICES_AD_ID`, `ACCESS_ADSERVICES_ATTRIBUTION`, `ACCESS_ADSERVICES_TOPICS` | AdMob SDK (Privacy Sandbox) | Google's on-device ad APIs. | Covered by the Advertising ID answer |
| `com.android.vending.BILLING` | RevenueCat (`react-native-purchases`) | Kept for the later Pro switch (docs/ads.md); unused in the free_ads build. | None |
| Removed: `SYSTEM_ALERT_WINDOW`, `READ/WRITE_EXTERNAL_STORAGE` | template | Not needed. | — |

Target SDK: **36** (React Native 0.86 default, `node_modules/react-native/gradle/libs.versions.toml`),
above Play's requirement for new apps and updates (API 35 since 31 Aug 2025). Min SDK 24.

### Foreground service declaration (App content → Foreground service permissions)

- Type: **Location**.
- Task: *"While a trip the user started is running, StopWake follows the phone's GPS position to ring
  an alarm shortly before the user's chosen public-transport stop. The service starts only when the
  user taps Start alarm, shows a persistent notification, and stops when the user arrives, dismisses
  the alarm or ends the trip."*
- User impact if deferred or interrupted: *"The user would not be woken and would miss their stop."*
- Video link: a 30–60 s screen recording (YouTube unlisted / Drive link) showing: pick a stop → Start
  alarm → the ongoing notification → lock the phone → the alarm rings full screen → dismiss. The
  demo trip (stop sheet → Alarm options → Try a demo trip) records this in one minute.

### Full-screen intent declaration (App content → Full-screen intent)

- Choose: **"Alarm clock or timer"** / *"My app sets alarms that the user schedules"*.
- Explanation: *"The user schedules an alarm to wake them before their stop; when it rings, the alarm
  is shown full screen over the lock screen like a clock alarm."*

### Exact alarms

`SCHEDULE_EXACT_ALARM` is user-granted on Android 14+ and needs no Play declaration. Do not add
`USE_EXACT_ALARM` (reserved for alarm-clock and calendar apps; Play reviews it strictly).
