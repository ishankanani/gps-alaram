# StopWake (working name)

A location alarm that never lets you miss your stop. Pick a destination, fall asleep on the train, and
the phone wakes you before you get there, even in silent mode and with the screen locked.

Android first. iOS follows with v1.1 (see the product plan).

## Status

This is the **core engine** milestone from the build plan (weeks 3–5): reliable tracking, the
trigger rules, the GPS watchdog and the alarm, plus just enough UI to test them on real trips.
The plan's gate before moving on: **20 real trips with zero missed stops**.

| Works now | Not yet |
| --- | --- |
| Arrive and Leave alarms, radius 100 m – 5 km | Map picker (search, pasted coordinates and "use where I am" for now) |
| "Also ring N minutes before arrival" | Saved routes, multi-stop, weekday schedules (v1.1) |
| Full-screen lock-screen alarm, rings in silent mode | Hard-to-dismiss challenges (type the stop name, shake) |
| Gentle / Normal / Heavy sleeper (escalating volume, vibration, flashlight) | German and Hindi |
| GPS-lost warning and dead-reckoning fallback alarm | iOS (AlarmKit) |
| Adaptive GPS rate for battery | Pro tier, RevenueCat, store listing |
| Favourites and recent places, setup checklist with a test alarm | Own geocoder (uses the public Photon service) |
| A CSV log of every trip, shareable from the app | Play Store signing key |

## Try it on a phone

1. Open the latest **Android** run under the repo's **Actions** tab and download the **StopWake-apk** artifact.
2. Unzip it and install the APK (allow installs from unknown sources when asked).
3. Open StopWake, tap **Check setup & test the alarm**, and fix everything marked red or amber.
4. After each real trip, use **Share trip log** on the last screen. The logs are what we tune on.

## How it works

```
 App (Expo / React Native)                Native Android (modules/trip-alarm)
 ─────────────────────────                ────────────────────────────────────
 Search, setup checks,  ── startTrip ──▶  TripService  (foreground service, type "location")
 live status screen     ◀── events ────     │  GPS + network fixes (LocationManager)
                                            ▼
                                          TripEngine  (pure Kotlin, unit tested)
                                            │  trigger rules · adaptive rate · watchdog
                                            ▼
                                          AlarmPlayer + AlarmActivity
                                            alarm stream, escalating, over the lock screen
```

Everything that decides when to ring runs natively, inside a foreground service that keeps
working with the app closed. JavaScript only draws the screens. There is no backend; nothing
leaves the phone except place searches.

**Permissions.** The trip starts while the app is open, so Android grants location to the
service with plain *while using the app* permission. The app never asks for background
("all the time") location, which avoids the Play Store's background-location review.

### When it rings (arrive mode)

The first of these wins:

1. A fix lands inside the radius.
2. Two consecutive fixes straddle the radius. At 300 km/h a train covers 415 m between fixes and can skip a small circle.
3. The estimated time of arrival drops below the "minutes before" setting.
4. You came close and are now moving away. This catches a pin placed off the actual route; the alarm offers **Not yet, keep tracking**.
5. GPS went quiet (tunnel, underground) and dead reckoning from the last speed says you have arrived. This alarm also offers **Not yet**.

Coarse cell-tower fixes cannot ring a small circle. For the minutes trigger they count only
when their error is worth under 30 seconds of travel.

### Tracking rate

| Distance to the stop | Fixes | Why |
| --- | --- | --- |
| Far (> 20 km and > 30 min) | GPS every 2 min, network every 1 min | Battery on long trips |
| Middle (5–20 km or < 30 min) | Every 30 s | ETA becomes meaningful |
| Near (< 5 km or < 15 min) | GPS every 5 s, CPU kept awake | Never overshoot the radius |

The "minutes before" setting moves these boundaries out. A watchdog notices when fixes stop
arriving. It runs on a Handler, backed by an AlarmManager alarm that also fires in doze or
after Android killed the app. If the app was killed or the phone rebooted mid-trip, you get a
"Tracking stopped" alarm instead of silence.

## Develop

```bash
npm install
npm run check          # typecheck, lint, JS tests
npm run test:engine    # trip engine tests on the JVM, including 1000 simulated trips
npx expo run:android   # build and run on a connected phone (needs the Android SDK)
```

The engine tests need only a JDK. They compile the engine sources from the Android module and
replay synthetic trips with GPS noise, station stops and tunnels. Any change to the trigger
rules should keep them green, and a missed stop seen on a real trip should become a new scenario
in `TripEngineTest`.

```
App.tsx                      screen flow
src/screens/                 Home, Setup, Tracking, Done
src/lib/                     place search, formatting, local storage
modules/trip-alarm/
  android/…/tripalarm/       TripService, AlarmPlayer, AlarmActivity, receivers, JS bridge
  android/…/engine/          TripEngine, SpeedEstimator, Geo (no Android imports)
  engine-tests/              JVM test project for the engine
  src/                       typed JS wrapper
```
