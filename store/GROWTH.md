# StopWake growth notes

Proposals only: nothing here is built yet unless it says so. Numbers come from the data
(`store/src/coverage-stats.json`, built by `npm run build:coverage`): **17 countries,
1,400,444 stops** (1,405,833 rows across the Germany database and the 19 packs; stops that are in
two databases near a border are counted once). Say "1.4M" / "1,4 Mio.", never more.

## 1. Positioning

**One line:** StopWake lets you stop watching for your stop.

People don't buy a "GPS alarm". They buy relief from a small, recurring fear: *what if I miss my
stop?* That fear costs attention on every ride (glancing at the window, counting stations, half
listening to announcements) and sometimes a lot more (a 20-minute ride back at midnight). StopWake
gives the attention back.

Who feels it most, in the order we should talk to them:

| Rider | The worry | The promise (headline voice) |
| --- | --- | --- |
| Shift workers, students, long commutes | "If I close my eyes, I'll wake up at the end of the line." | *Doze off. We'll wake you.* |
| New in a city, tourists, expats | "I can't read the signs or catch the announcement." | *New city? Already covered.* |
| Underground and rural riders | "No signal, so no map." | *Find any stop, even offline.* |
| Parents and busy heads | "One more thing to keep an eye on." | *The school run, on autopilot.* |
| Everyone, every day | "I spend the whole ride on alert." | *Give your attention back.* |

Proof points, in this order: it rings even on silent; it works offline and in tunnels;
1.4M stops in 17 countries (now visible on the zoomed-out map); private (location only during a
trip, decided on the phone); free.

What we are not: a journey planner or a live-departures app. Don't compete with DB Navigator,
Citymapper or Google Maps on routing; be the thing you use *with* them.

## 2. Store creatives

- **Icon** (done): a folded map with a transit line and stations; the amber pin is *your stop*,
  ringing. Variants in `store/graphics/variants/` (`compare.png` shows 48 px). Test A (city map)
  against B (default) with a Play *store listing experiment* (icon only, 50/50, 2 weeks, metric:
  first-time installers). Keep C as the fallback if B reads as "a maps app".
- **Feature graphic** (done): Europe drawn from the app's real coverage dots, Munich ringing.
- **Screenshots** (done): order and captions in `store/listing/screenshots.json`. The first three
  carry the emotional promise (alarm, trip, stop); the coverage map and infographic come fourth and
  fifth, when the visitor asks "does it work where I live?". Set `a` is the default; run set `b`
  as a Play experiment on the first three screenshots only (that is where conversion moves).
- **Listing texts** (done): `store/listing/en.md` and `de.md` lead with the worry, then how it works.
  The other 9 languages still have the feature-first text; translate the new en text once the
  experiment says which voice wins.

## 3. ASO keywords per country

Play has no keyword field: the title, short description and the first lines of the full
description carry the keywords; repeat the main ones naturally 3 to 5 times. The App Store
keyword field (100 characters, no spaces after commas, no words already in the name or subtitle)
is in `listing/en.md` and `listing/de.md`.

| Country (pack) | Language | Primary | Secondary |
| --- | --- | --- | --- |
| Germany (built in) | de | Haltestellen Wecker, Bus Wecker, GPS Wecker | Zug Wecker, nicht verschlafen, Ausstieg Erinnerung, Pendler, ÖPNV offline, U-Bahn, S-Bahn |
| Austria | de-AT | Haltestellen Wecker, Öffi Wecker | Bim, U-Bahn Wien, Pendler, offline |
| Switzerland | de-CH, fr-CH | Haltestellen Wecker, ÖV Wecker / réveil arrêt | Tram, Postauto, SBB, Pendler |
| Luxembourg | fr, de | réveil arrêt bus, Haltestellen Wecker | tram, gratuit transport, frontalier |
| Netherlands | nl | halte wekker, OV wekker, bus wekker | trein wekker, niet in slaap vallen, forens, offline |
| Belgium | nl, fr | halte wekker / réveil arrêt bus | STIB, De Lijn, TEC, navetteur |
| United Kingdom | en-GB | bus stop alarm, train stop alarm, wake me at my stop | tube, commute, sleep on train, location alarm, offline |
| Ireland | en-GB | bus stop alarm, Luas, wake me up stop | DART, commute, offline |
| Sweden | sv | hållplats alarm, väckarklocka buss | pendling, tunnelbana, tåg, offline |
| Norway | nb | holdeplass alarm, buss vekkerklokke | T-bane, pendler, tog, offline |
| Denmark | da | stoppested alarm, bus vækkeur | S-tog, metro, pendler, offline |
| Finland | fi | pysäkki herätys, bussi herätys | raitiovaunu, metro, juna, työmatka |
| France | fr | réveil arrêt bus, alarme GPS, ne pas rater son arrêt | métro, RER, tram, trajet, hors ligne |
| United States | en-US | bus stop alarm, GPS alarm, location alarm | subway alarm, commute nap, wake me there, train alarm, offline |
| Canada | en-CA, fr-CA | bus stop alarm / réveil arrêt bus | TTC, STM, GO train, commute |
| Australia | en-AU | bus stop alarm, train alarm, location alarm | tram Melbourne, Opal, Myki, commute |
| Japan | ja | 乗り過ごし防止, 降車アラーム, 目覚まし 電車 | バス, 地下鉄, GPS アラーム, 寝過ごし, オフライン |

Notes: "wake me there", "乗り過ごし防止" (prevent riding past) and "nicht verschlafen" are the
problem phrases people type; prefer them over "GPS" in subtitles. Re-check volumes in the Play
Console's *Store performance → Search terms* after 4 weeks and swap the secondary terms.

## 4. Psychological hooks inside the app (small copy changes)

Each change is one string; keys are in `src/i18n/en/`. They need the 10 other languages before
they ship (and the 8 new ones the i18n work adds).

| Where | Key | Today | Proposed | Why |
| --- | --- | --- | --- | --- |
| Onboarding, page 2 | `onboarding.page2.title` | Pick a stop. Choose when. | Close your eyes. We'll watch. | Names the relief, not the steps. |
| Onboarding, page 2 | `onboarding.page2.body` | Wake 2 minutes or 300 metres before you arrive. It rings even on silent, and works offline. | We wake you 2 minutes before your stop, even on silent, even underground. | "even underground" answers the no-signal doubt up front. |
| Map, zoomed out (new) | `map.coverage` (new) | none | 1.4M stops in 17 countries. Tap to zoom in. | A small chip over the coverage dots: makes "we cover all these stops" explicit. |
| Trip screen | `trip.info.lock` | You can lock your phone. It rings even on silent. | Lock your phone and rest. It rings even on silent. | Permission to relax. |
| Trip screen, first trip only (new) | `trip.info.firstTrip` (new) | none | First ride with StopWake? Keep the phone in your pocket, we'll do the watching. | First-trip anxiety is the biggest drop-off moment. |
| Arrived | `trip.arrived.title` | You made it | Right stop. You made it. | Rewards the moment the fear didn't come true. |
| Arrived | `done.saveBody` | Next time it is one tap away. | Same ride tomorrow? It's one tap away. | Plants the habit (the commute). |
| Setup, privacy line | `onboarding.setup.privacy` | Only while a trip is running. Your location stays on this phone. | Only while a trip runs. Your location never leaves this phone. | Stronger, still true (the alarm is decided on the phone; sync is opt-in and has no location). Check with the privacy policy before shipping. |
| Countries | `countries.body` | (as is) | Going abroad? Download the stops before you leave, they work without roaming. | Moves the download to before the trip, when there's Wi-Fi. |
| Upsell after a late wake | `trip.upsell.title` | Slept through it? | Deep sleeper? | Less blame, same offer. |

## 5. Rating and referral prompts

**Ask for a rating after the 3rd successful arrival**, never earlier, and only when all of these hold:
- the trip ended with *Arrived* (the alarm rang and was dismissed), not ended by hand or stopped
  by a battery saver;
- the rider tapped **Right time** in "Did it wake you at the right time?" on this trip (if they
  skipped the question, ask on the next qualifying trip; never after *Too early* / *Too late*);
- at least 2 days since install, at least 2 days since the last ask, at most 3 asks per year;
- no full-screen ad on this Arrived visit (ads rule: the rating sheet replaces the interstitial).

Show it on Arrived, 1.5 s after the feedback tap, with the native sheet (`expo-store-review`,
needs `npx expo install expo-store-review` and a dev build). Never a custom "rate 5 stars" screen
first: both stores forbid gating and the native sheet converts better. Pure rule to add next to
`src/ads/rules.ts`: `shouldAskForReview(history, trip, now)`, tested like the ad rules. Count the
arrivals in the same on-device history the Activity tab uses.

**Referral:** after the 5th arrival, one line on Arrived: "Know someone who naps on the bus?
Share StopWake" with the system share sheet and a store link (with a campaign parameter for Play,
`&referrer=utm_source%3Dshare`). No rewards: they invite fraud and need terms; the ask is enough.
Also add *Share StopWake* to Settings next to *Rate StopWake*.

**Win-back:** none for now (no push marketing; it would undermine "private by design").

## 6. Ads sanity check

Current rules (`src/ads/rules.ts`, `docs/ads.md`) are sound for trust:
- Never on Trip, Arrived's first 3 s, Setup, Onboarding, sign-in or buying, and never while a
  trip runs or the alarm rings. Keep it that way: one ad between a sleeper and their alarm would
  cost more ratings than all ads earn.
- Interstitial at most every 30 min and 3 per day; app-open not on the first 2 launches, then
  every 4 h at most.

Changes worth making:
1. **No interstitial on the first 3 Arrived visits** (the same window as the rating ask): the first
   successful trips are when people decide to keep the app.
2. **Rating ask beats the interstitial** on that Arrived (see 5).
3. **No app-open ad when the app is opened from the trip notification or the alarm** (a sleepy
   rider tapping the notification must land on the trip, not an ad). Check that
   `appOpenMinBackgroundMs` covers it; add an explicit rule if not.
4. **Banner on the map only in browse mode** (already so); never cover the coverage chip
   proposed in 4 with it.
5. Keep the store screenshots ad-free (the Screenshots workflow sets `EXPO_PUBLIC_ADS_OFF=1`).

## 7. What to measure

- Store: first-time installers per listing visitor, per country and experiment arm.
- In app (on-device counters, no tracking SDK needed): onboarding done; first trip started within
  24 h; first Arrived; 3rd Arrived (the rating moment); 7-day return.
- The *Right time / Too early / Too late* answers per stop kind: the honest quality metric and the
  input for when to ask for ratings.
