# Critiques of design direction A

Two reviews of docs/design/ui-direction-a.md: a product designer and a React Native engineer with an accessibility specialist. Implement every **must** change and the **should** changes; the direction document stays the base.

## Product design

### Keep
- The seven principles as the north star, especially 'Map first, one thumb', 'Two taps to sleep', 'Readable half asleep', 'Honest about reliability' and 'One system, admin included'.
- Token architecture: light and dark parity with measured WCAG pairs, surface steps for depth in dark mode, one elevation recipe, hex literals only in tokens.ts and colors.ts, and Vitest checks for token completeness and contrast.
- The calm map recolour as a pure, snapshot-tested prepareStyle over OpenFreeMap Liberty, so offline packs and caches keep working. 3D buildings, POI clutter, rotation and pitch are off. It is the biggest single upgrade visible in screenshots (compare today's 04-map.png).
- The transport colour table: German sign shapes (S circle, U square), colours darkened so white text reaches 4.5:1, the same in both themes, spoken labels for TalkBack, and a +N overflow badge.
- Inter embedded through the expo-font config plugin: no runtime wait, and the same metrics on Samsung and Xiaomi phones. Every live number uses tabular figures, numbers never truncate, and the Hindi/Japanese line-height and font-scale rules stay.
- One MapSheet with browse, search and stop modes on a stack, where Android back pops one mode. Search and stop are sheet modes, not routes, and the tab bar hides in both.
- Stop sheet behaviour: defaults by stop kind, the last choice remembered, the plain rule line ('Rings about 2 min before you arrive'), the train-distance warning with a one-tap 'Use 2 min', options behind a single disclosure, and the demo trip.
- Trip screen anatomy: DestinationCard plus one panel, an honest GPS badge, '≈' estimates underground, the wake-point dot on the progress bar, End trip deliberately weaker and behind a confirm, and the TripBar on every tab while a trip is minimised.
- Native alarm: dark full screen, slide to dismiss that must start on the thumb, a 56 dp Snooze, and 'Not yet, keep tracking' only when the trigger is uncertain.
- Arrived variants (ended by you, couldn't start, stopped by the phone with 'Fix battery settings'), and feedback chips that feed alarm tuning and the Activity on-time rate.
- The reliability checklist: required vs recommended items, battery-saver paths per phone brand, Test the alarm, refresh on return from Settings, a title that follows the entry point, and sending 'Not now' users through Setup at their first Start alarm.
- Paywall basics: Restore at the top right, yearly preselected, the per-month figure, a saving shown only from 10 %, a CTA that names price and period, 'Free until 17 Oct, then €9.99 a year' beside the button, the auto-renew line, an entry message per locked feature, pending/already-Pro/gift states, and the admin previewRegion.
- Account: the plan-card state table by source (store, trial, gift, code, lifetime, billing problem), the copyable SW- ID chip used in Account, the Help mail subject and admin, and sign-up turning the guest into the account with the same ID ('Nothing is lost').
- Admin ground rules: the server confirms every change (no optimistic UI), you can't act on yourself or remove the last admin and the helpers say why, cached data is read-only offline, every admin TopBar carries an 'Admin' badge, lists pull to refresh, the same components are used at higher density, and stopwake://admin/user/{id} deep-links to a user.
- ConfirmDialog (type-to-confirm, required reason, async confirm with spinner and inline error) replacing every Alert.alert, plus the hard rule that a ModalSheet never holds a text input.
- Copy system: sentence case, verb-first buttons, no jargon, a non-breaking space before units, 'about' and '≈' for estimates, exact dates and prices in money copy, the glossary, 30 % room for German, and placeholders instead of joined fragments.
- State discipline: skeleton timing (show after 150 ms, keep at least 300 ms), the EmptyState formula (what is missing, how to fill it, a button that does it), offline treated as normal with one quiet pill, Undo and Retry toasts, reduced motion, and the haptics map.
- Definition of done: light and dark, 360x640 at font scale 1.3 and 2.0 with German strings, 48 dp targets, each row read as one TalkBack item, no hex or Alert.alert in screens, and npm run check passing.
- Screenshot plumbing: a seeded server in CI, the demo status bar, the stopwake://debug/seed deep link for favourites, recents and trips, a screenshot build that hides test banners, and paywall captures per region.
- Saved (a menu on each row, Undo on remove, a banner at the Free limit) and Activity (monthly on-time rate, outcome badges, demo trips left out, history kept on the phone). Both give their tabs real value.
- The app icon idea (white pin with an amber sunrise on indigo), and the rule that illustrations are built from real components at 0.8 scale, never stock art.

### Changes

#### [must] Paywall: price formatting and maths

**Problem.** Section 4.3 says to format prices with Intl.NumberFormat, round the per-month figure down and round the saving to the nearest percent. backend-spec 5.2/5.3 is binding and tested in pricing.test.ts, and it says the opposite: formatPrice() with no Intl, perMonth = Math.round, yearlySaving = Math.floor. The two rules give different numbers: CHF 0.91 vs 0.92 a month (the AdminPrice example uses 0.91), £0.74 vs £0.75, A$1.41 vs A$1.42, and India 'Save 58 %' vs 57 %. The AdminPricing CHF example also shows lifetime 17.00, but pricing.ts has 16.00.

**Change.** Replace rules 2 to 4 of 'How prices are chosen' with references to pricing.ts:
- Format every amount with formatPrice(minor, row, appLanguage).
- Per month = perMonth(row).
- Saving = yearlySaving(row), shown only at 10 % or more.

When the store is connected, use product.priceString and product.pricePerMonthString, and compute the saving as floor(1 - yearly.price / (12 x monthly.price)) from the store's numeric prices.

Fix the examples: 'CHF 11.00 / year · CHF 0.92 a month · save 58 %', CHF lifetime 16.00, India 'Save 57 %'.

#### [must] Paywall: trial eligibility

**Problem.** The '7 days free' badge, the 'Start 7-day free trial' button, the TrialTimeline and Account's 'Get Pro · 7 days free' all take the trial from config trialDays. On Google Play the trial-7d offer exists only for eligible new customers. Play returns only offers the user qualifies for, and RevenueCat exposes it as product.defaultOption.freePhase; today's src/lib/pro.ts already reads it. A returning subscriber would be promised a free week and charged at once. That breaks Play's subscription policy and generates refunds and 1-star reviews.

**Change.** Show trial UI only when the store returns a free phase for this user. Config trialDays applies only to builds without a store and to CI.

Without a trial:
- no trial badge
- the button reads 'Get Pro for €9.99 a year'
- no timeline
- the footer helper reads '€9.99 a year. Renews until you cancel.'
- the Account button reads 'Get Pro'

#### [must] Paywall: plans above the fold

**Problem.** On the 411x914 dp capture device the stack is: status bar, TopBar 56, hero about 170, reason banner about 88, a 6-row comparison table with footnote about 354, and a section header about 50. When the paywall opens from a locked feature, the first PlanCard starts near y = 750 while the sticky footer starts near y = 776. Users see 'Start 7-day free trial' before any plan, and on a 360x640 phone the plans are a full screen down. Half the table rows are ticks in both columns, which dilutes what Pro adds.

**Change.** Reorder the paywall:
1. TopBar with close and Restore.
2. A headline that follows the reason: heavy 'Wake up, even from deep sleep'; favourites 'Keep every stop one tap away'; offline map 'See the map underground'; no reason 'StopWake Pro'.
3. Three compact benefit rows (24 icon, title, one line), with the feature that opened the paywall first and highlighted.
4. The three PlanCards.
5. The trust row, then the legal text.

Below the legal text, add a collapsed 'Compare Free and Pro' showing only the rows that differ.

QA rule: on 411x914 all three PlanCards sit above the footer; on 360x640 the selected one does.

#### [should] Paywall: PlanCard badges

**Problem.** The yearly card has two badges next to its title, amber '7 days free' and green 'Save 58 %', plus the price column. Green is a status colour, so principle 4 ('status colours are never decorative') breaks on the most important card. At 360 dp in German ('7 Tage gratis', '58 % sparen') the title row wraps unpredictably. 'Cancel anytime' on Monthly suggests Yearly can't be cancelled.

**Change.** Give each card one badge.
- Yearly: an accent 'Save 58 %' pill (accentSoft/accentInk) that wraps below the title, never beside the price. The trial moves into the subtitle: '€0.83 a month · first 7 days free'.
- Monthly subtitle: 'Billed monthly'.
- Lifetime keeps 'Pay once, keep it'.

Remove the success tone from PlanCards.

#### [should] Paywall: trust and trial reminder

**Problem.** Trust rests on one legal line. The footnote 'Pro never shows ads' suggests the Free plan has ads, which it doesn't. The two-step TrialTimeline leaves out the step proven to lift trial starts and cut refunds and angry reviews: a reminder before the first charge.

**Change.** Add a trust row under the plans, three 20 dp icons with bodyS text:
- 'Paid through Google Play'
- 'Cancel anytime in Google Play'
- 'No ads, no tracking. Trips stay on your phone' (true per backend section 0)

Make TrialTimeline three steps:
1. 'Today: Pro unlocks'
2. '15 Oct: we'll remind you'
3. '17 Oct: €9.99 a year starts unless you cancel'

Schedule a local notification two days before the trial ends, from the store expiry: 'Your free trial ends on 17 Oct' with the action 'Manage'.

Delete 'Pro never shows ads'.

#### [should] Paywall: store fallback and price source line

**Problem.** The spec prints 'Prices from Google Play.' even when the store is connected. No top-10 app shows this; it reads like debug text. When the store doesn't answer, the spec shows a red danger banner and ignores backend 5.3, which says: skeleton for at most 5 s, then the table price with the button disabled.

**Change.** Hide the source line whenever store prices are shown, and in screenshot builds.

After 5 s with no store answer, show the config price row with a warning Banner, not a danger one: 'Google Play isn't answering. These prices are a guide; Google Play shows the final price before you pay.' Include 'Try again' and keep the button disabled. This banner is the only place text like 'Prices for Switzerland in CHF' appears.

#### [should] Paywall: code link and gift state

**Problem.** backend 7.4 requires 'Have a code?' on the paywall whenever features.redeemCodes is true; the UI spec doesn't have it. In the 'Granted Pro' state the plans stay below under 'Subscribe for later'. A subscription bought there starts billing at once and runs alongside the gift, and users will feel tricked.

**Change.** Add a ghost Button S 'Have a code?' under the legal note that opens Redeem; hide it when redeemCodes is false.

For gifts and codes, show the Card 'Pro is a gift until 31 Dec 2026' with 'We'll remind you a week before it ends'. Put the plans behind a ghost 'See plans' with the note 'A subscription starts billing today; it doesn't add to your gift.'

#### [should] Monetisation: upsell at the moment of need

**Problem.** The paywall opens only from locked controls and the Account card. The strongest moment for the main Pro feature goes unused: a trip where the rider says the alarm came too late, or snoozed twice.

**Change.** On Arrived, for Free users whose feedback is 'Too late' or who snoozed twice, show an inline promo Card under the feedback: 'Slept through it? Heavy sleeper reaches full volume within seconds, with strong vibration.' Its button is 'Try Pro free', or 'Get Pro' when the store offers no trial, and opens the Paywall with reason heavy.

Never show it on the alarm, the Trip screen or a demo trip, and at most once every 14 days.

#### [nice] Paywall: per-month price in small-unit currencies

**Problem.** '₹33.25 a month' and '9,92 kr a month' look fussy in markets where prices are read in whole units. 'Save 58 %' is written with a hard-coded space, which is wrong in English.

**Change.** For INR, JPY, SEK, NOK and DKK, show the per-month line in whole units rounded down ('about ₹33 a month'). The billed price stays exact. Format percentages per locale: 'Save 58%' in English, '58 % sparen' in German.

#### [must] Permissions: privacy copy

**Problem.** 'StopWake never tracks you in the background' is false. A running trip tracks location with the screen locked, through a foreground service. It is the sentence a Play reviewer or a privacy-minded user is most likely to call deceptive.

**Change.** Use 'Only while a trip is running. Your location stays on this phone.' The second sentence is true: the server stores no locations or trips (backend section 0). Give the Arrived row 'Share trip log' the subtitle 'Includes this trip's GPS points', so the one exception the user starts themselves is explicit.

#### [should] Onboarding and permission priming

**Problem.** The new flow is 3 intro pages, then Permissions, then Setup. On Permissions, one 'Allow access' tap chains a location dialog, a notifications dialog and the full-screen alarm Settings page. Setup then lists the same items again. The flow is longer than today's two screens, repeats itself, and sends a new user out of the app to Settings before they have seen the map.

**Change.** Cut the intro to at most two pages:
- Page 1: 'Never miss your stop' with the language chip.
- Page 2: 'Pick a stop. Choose when.' with the 'rings on silent' line folded in.

Merge Permissions and Setup into one 'Get ready' stepper.
- Required steps (location, notifications) show one system prompt each.
- Each step has its own sentence, an illustration showing which choices to tap ('Precise', 'While using the app'), and a verb button ('Allow location').
- A step ticks when the user returns.
- Below the steps, a Recommended checklist (lock-screen alarm, exact alarms, battery) and 'Test the alarm'.
- Continue is enabled once the required steps are done.

'Not now' still lands on the map, with Setup at the first Start alarm.

#### [nice] Onboarding: country coverage copy

**Problem.** Page 2 ('Every stop in Germany and 16 more countries, even offline') and the paywall comparison row suggest all 17 countries are already on the phone. Only Germany is built in; the others are downloads.

**Change.** Use 'Every stop in Germany is built in. Add 16 more countries in a tap. All of them work offline.'

#### [should] Map home: browse sheet content

**Problem.** At half height the sheet's main content is 'Nearby stops'. Riders set alarms for where they are going, which is almost never within 1.5 km. Favourites shrink to one chip row, and recents appear only when there are no favourites. The avatar in the search row duplicates the Account tab and narrows the most important control.

**Change.** Order the browse sheet:
1. Search field, full width, no avatar.
2. Favourite chips.
3. Up to 3 'Recent' rows (badges plus 'Yesterday'); a tap opens stop mode.
4. 'Nearby stops', capped at 3 rows with 'Show all nearby'.

New users with no history see Nearby as specified. If a Pro cue is wanted, put the Pro ring on the Account tab icon. Show the long-press hint only in the first 3 sessions.

#### [should] Map: selected stop and attribution

**Problem.** Today's 06-stop.png shows the selected pin on the sheet edge with its own label half hidden ('München Hbf'). The spec keeps both the stop's dot and label and the StopPin. It also never says where map attribution goes once the sheet and tab bar cover the bottom; today the MapLibre 'i' button floats over content. OpenStreetMap's licence (ODbL) and OpenFreeMap/OpenMapTiles expect attribution on the map itself; a Settings footer isn't enough.

**Change.** While a StopPin shows, filter that stop out of the dot and label layers. Fly the camera so the pin tip sits in the middle of the visible map (bottom padding = sheet height + 24).

Put a compact attribution control at the bottom left: a 16 dp 'i' in a surface2 pill with a 48 dp hit area. It moves with the sheet top like the MapControl column; place it above the Trip panel too. Hide the MapLibre logo.

#### [nice] Map: transit lines

**Problem.** With every rail line grey, the calm map loses the orientation Citymapper and Google Maps give riders ('which line am I on?'). Store screenshots then read as a generic city map.

**Change.** Tint the OpenMapTiles transportation subclasses subway, light_rail and tram in their mode colours, at about 45 % opacity and 1.5 to 2 dp wide, under the stop layers. Extend the rule 'transport colours only in…' to name these lines.

#### [nice] Search: 'Use my current location'

**Problem.** Picking your own position as a destination only makes sense in leave mode, so for most users the first search row is a puzzle.

**Change.** Rename it 'Ring when I leave here' (icon map-marker-radius-outline) and open stop mode with 'When I leave' preselected. Otherwise remove the row.

#### [should] Trip: hero number

**Problem.** Distance is always the 44 dp hero, even when the rider chose 'wake 2 min before'. The reassuring fact, when the alarm will ring, then needs mental maths at arm's length, which goes against principle 3.

**Change.** Make the hero follow the rule's unit.
- Minutes: 'Arrives' with '6 min' as numXL; distance and 'at 08:21' are secondary.
- Distance: the distance stays the hero.

Add the predicted ring time to the rule pill: 'Rings at about 08:19 · Normal'. Estimated states keep '≈'.

#### [should] Trip: night use

**Problem.** Riders use the app half asleep in dark carriages. In light mode Trip is a white panel and the TripBar a filled indigo bar; in dark mode the TripBar is a light #8E94FF bar. Both glare at 23:00, which goes against principle 3 ('readable half asleep').

**Change.** Give Trip, the TripBar and the in-app AlarmCard a night treatment, as Google Maps navigation does:
- Dark tokens apply automatically between local sunset and sunrise, worked out offline from the position, whatever the app theme.
- Add Settings › Appearance › 'Trip screen: Automatic / Day / Night'.
- In dark, the TripBar uses surface3 with a primary stripe on its leading edge instead of a primary fill.

#### [should] Trip: starting a second trip

**Problem.** With a trip minimised, the user can open any stop and tap Start alarm. The spec never says what happens to the running trip.

**Change.** While a trip runs, the stop-mode footer reads 'Switch alarm to this stop' and opens a ConfirmDialog: 'Switch to Ostbahnhof?' / 'The alarm for München Hbf stops.' with the buttons 'Keep current' and 'Switch'. 'Start alarm' in a Saved row's menu behaves the same way.

#### [should] Alarm: accessibility and dismiss size

**Problem.** Slide to dismiss must start on the thumb, which TalkBack and Switch Access users can't do reliably. On the ringing TripBar, 'I'm awake' is a 36 dp Button S, although section 2.7 requires 56 dp for dismiss actions.

**Change.** Give the native slide track a custom accessibility action 'Dismiss alarm', and announce 'Wake up. München Hbf in about 2 min' to TalkBack. When the alarm rings while the app is open, always show Trip with the AlarmCard (Button L 'I'm awake'). The ringing TripBar only offers 'Open alarm'.

#### [must] Account: guest layout

**Problem.** For a Free guest the tab stacks three cards:
1. the Profile card;
2. an info Banner with two side-by-side buttons, primary 'Create account' and secondary 'Sign in';
3. the Plan card with a primary 'Get Pro · 7 days free'.
That is two filled primary buttons in one region, against the spec's own rule in 2.1, and three buttons before the first list row.

**Change.** Merge identity and the guest prompt into one card: 64 dp guest Avatar, 'Guest', the ID chip, one line of benefit copy, a tonal 'Create free account' and a ghost 'Sign in'. 'Get Pro' stays the only primary button, in the Plan card.

If the guest has a gift or code, add a warning line to that card: 'Your gift is tied to this phone. Create an account to keep it if you reinstall.' (backend 3.8).

#### [must] Account and sign-in: false sync promises

**Problem.** Sign up says 'Keeps Pro and favourites on every phone' and Sign in says 'Keep Pro and your settings on every phone'. The server stores no favourites, trips or settings (backend section 0), so both promise a sync that doesn't exist. The guest banner says 'Keep Pro on every phone' even to Free guests.

**Change.** - Sign up: 'Free. Your plan, gifts and codes come with you to any phone.' plus the footnote 'Favourites and trip history stay on this phone.'
- Sign in: 'Get your plan back on this phone.'
- Guest card for Free guests: 'Create a free account so codes and gifts stay yours.'

Use the same wording wherever onboarding or the paywall mentions accounts.

#### [must] Forgot password: code format and no-mail mode

**Problem.** The spec asks for 'a 6-digit code' in a numeric one-time-code field. Reset codes are 8 Crockford characters such as K3P9-7XQ2 (backend 1.1 and the mail subject in 6.6), which a digits keyboard can't type. The spec also misses servers without mail: forgot-password then returns 503 mail_unavailable, and 7.6 says to offer 'Email support for a code'.

**Change.** - Step 1: 'We'll email you an 8-character code.'
- Step 2: a code field for letters and digits, with capitals on, the dash inserted automatically and pasting accepted, and the helper 'Valid for 30 minutes'.

When config auth.passwordReset is false, step 1 becomes 'Email support with your ID SW-7K3P-92QX to get a code', with a prefilled mailto, followed by the same step 2. Admin-issued codes last 60 minutes. Error: 'This code is wrong or has expired.'

#### [must] Delete account

**Problem.** DELETE /v1/me needs the account password (a wrong one returns 401 invalid_credentials), but the screen only asks the user to type DELETE. Two other responses have no design: 409 subscription_active and 409 last_admin. 'Export my data' (GET /me/export, listed in 7.6) is missing.

**Change.** - For accounts, add a 'Your password' field above the type-to-confirm field; guests skip it.
- On 409 subscription_active, show the Google Play warning Banner with 'Open Google Play', and change the button to 'Delete anyway' (resend with acknowledgeSubscription).
- On last_admin, show inline 'You're the only admin. Make someone else an admin first.'
- Add 'Download my data' to DeleteAccount and to Account › Account; it opens the share sheet with stopwake-SW-….json.

#### [should] Account: states the backend defines

**Problem.** The spec misses several cases the backend defines (7.2 to 7.6):
- signing out other devices (sign-out-all with keepCurrent)
- a local build with no server ('This build works without an account')
- auth.signUpEnabled or features.redeemCodes set to false
- 'Continue without account' for a disabled account
- the toast after a guest is merged on sign-in
- other phones being signed out after a password change
- cancelled and paused subscriptions on the plan card
The trial row has no action, so a trial user can't see how to cancel.

**Change.** Add:
- 'Sign out other phones' in EditProfile, toast '2 phones signed out'.
- ChangePassword success toast 'Password changed. Other phones were signed out.'
- A local-build Account card: 'This build works without an account'.
- Hide 'Create account' and 'Redeem a code' when their flags are off.
- Disabled banner actions: 'Contact support' and 'Continue as a new guest'.
- Merge toast: 'Your guest plan moved to your account'.

Plan card rows:
- Trial: '… ends 17 Oct, then €9.99 a year', with 'Manage subscription'.
- Cancelled: 'Pro until 12 Oct 2027 · won't renew', with 'Resubscribe'.
- Paused: 'Paused in Google Play', with 'Manage subscription'.

#### [should] Account vs Settings structure

**Problem.** Account lists Settings, Alarm reliability and Help & support, and Settings lists 'Permissions & reliability' and 'Help & support' again. That gives two ways in and three levels (Account › Settings › AlarmDefaults) for content a 4-tab app can show on one screen. The dot on the Account tab also lights up for recommended items some phones can never fix (battery on some brands), which teaches users to ignore it.

**Change.** Either fold Settings into the Account tab as sections (Plan, Alarm, Display, Maps and stops, Reliability, Support, Legal, Account), or keep the Settings screen and remove the duplicated rows from it. Show the Account tab dot only for a missing required item or a billing problem.

#### [should] Redeem: clipboard

**Problem.** Redeem reads the clipboard as soon as it opens to label a 'Paste SPRING26' chip. On Android 12 and later this shows 'StopWake pasted from your clipboard' every time, which looks like snooping.

**Change.** On open, call Clipboard.hasStringAsync(), which shows no system toast, and show an assist chip 'Paste code' without the value. Read and check the clipboard only when the chip is tapped, then fill the field or show 'That doesn't look like a code.'

#### [should] Errors area: one table

**Problem.** Error copy is scattered across screens, and some of it needs data the API doesn't send. 'This code expired on 30 Sep 2026' needs a date, but promo_expired carries no details. These codes have no copy at all: already_lifetime, redeem_disabled, signup_disabled, rate_limited (which has retryAfterSeconds), too_common, same_as_email, network and timeout. backend 7.7 requires a complete errors.<code> area in all 11 languages.

**Change.** Add a table to section 5: error code → user copy → where it shows (inline, Banner, toast) → action. It becomes src/i18n/en/errors.ts. Examples:
- promo_expired: 'This code has expired.'
- already_lifetime: 'You have Pro for life already, so you don't need a code.'
- rate_limited: 'Too many tries. Try again in 12 min.'
- too_common: 'This password is too common. Try a longer one.'
- network: 'Couldn't reach StopWake. Check your connection.' with Retry.
- Photon address search failing online: 'Addresses aren't available right now. Stops still work.'

#### [nice] Restore purchases while signed out

**Problem.** RevenueCat's restore setting moves the subscription to whoever restores. A user who signed out and taps Restore purchases moves their Pro from their account to a throwaway guest.

**Change.** If this phone was signed in before, 'Restore purchases' first asks 'Sign in instead?' / 'Restoring moves your subscription to this guest ID.', with 'Sign in' as the primary button and 'Restore here' as the alternative.

#### [should] Ratings: in-app review

**Problem.** A top-10 listing needs a rating of 4.5 or more. The spec only has a 'Rate StopWake' link in Settings and no moment that asks for a review.

**Change.** After the second trip rated 'Right time', call the Play in-app review flow from Arrived, after the thank-you toast. Do it at most once every 90 days and never after a problem outcome. This needs expo-store-review (npx expo install expo-store-review).

#### [must] Admin dashboard

**Problem.** The dashboard doesn't match GET /admin/dashboard or the tiles in backend 7.7.
- The '7 days / 30 days / All' control has nothing to drive: the days parameter accepts 7, 30 or 90 and only changes the sign-ups series, and the spec draws no sign-up chart.
- 'Users by plan' mixes plan and source in one bar, so a lifetime gift (seed user Hannah) is counted in both Lifetime and Granted, and the Free segment dwarfs every Pro slice.
- The 'Pro, free' tile needs grant and promo users at once, which a single users filter can't express.
- The API returns no recent sign-ups.
- Missing: trials, estimated MRR, active users, app versions, and the webhook health panel the deploy guide relies on for monitoring (6.10 §10).

**Change.** Tiles:
- Users (+ new in 7 days)
- Active in 7 days
- Pro (share of users)
- Trials
- Estimated MRR (USD, store)
- Billing issues (warning tone when above 0)

Cards:
- Sign-ups: stacked bars for guests and accounts, with its own 7/30/90 control, labelled UTC.
- Pro by source (Store, Gift, Code) and Pro by plan (Monthly, Yearly, Lifetime) as two separate breakdowns, each adding up to Pro.
- Top countries: users, Pro and conversion %.
- App versions: devices in the last 30 days, with the minimum version marked.
- Store connection: configured or not, last event, errors in 24 h, unmatched in 7 days, sandbox active, linking to Store events.

Also:
- Fill 'Recent sign-ups' with a second call: GET /admin/users?kind=account&sort=created&limit=5.
- Show 'Updated 10:42' from generatedAt.
- Use a chart palette with no status colours.

#### [must] Admin: Store events screen

**Problem.** The store-events routes (GET and POST /admin/store-events), the AdminStoreEvents screen in 7.7 and the deploy guide's monitoring all assume this screen exists. The UI spec has no screen, menu entry or screenshot for it. An admin can't see or retry a RevenueCat webhook that was unmatched or failed, for example a purchase that never unlocked Pro.

**Change.** Add AdminStoreEvents:
- Entry points: a 'Store events' row in Manage with an error count Badge, and the dashboard's Store connection card.
- Status chips: All · Errors · Unmatched · Processed · Stale · Ignored.
- Dense rows: event type (e.g. 'BILLING_ISSUE'), user (name, SW-ID or 'No matching user'), time, and a status Badge (danger for errors, warning for unmatched).
- Detail: KeyValueRows, then the payload JSON in a monospace block that scrolls and can be copied.
- 'Retry' on error and unmatched events, behind a ConfirmDialog with no reason field (the API takes none).

Add it to the storyboard.

#### [must] AdminUser: actions that contradict the API

**Problem.** - 'Send password reset code' implies an email, but POST /reset-code returns a code shown once to the admin and never logged (2.10, 4.5).
- Delete asks the admin to type the user's email, but the API's confirm value is the public ID, and guests have no email.
- Revoke is one button in the plan card's 2x2 grid, but each revoke targets one grant and a user can have several. In the grid it also sits within 8 dp of Grant, against the 16 dp rule in 2.7.
- Disable and Delete appear both in the overflow menu and in the Danger zone.

**Change.** - 'Create reset code' (accounts only) opens a Dialog with the code in numM tabular figures, a Copy button, and 'Valid for 60 minutes. Shown once. Give it to the user through support.'
- Delete uses type-to-confirm with the user's SW- ID.
- Move Revoke and Extend into each active row under 'Gifts and codes', as a row menu with 'Add time' and 'Revoke'. The plan card keeps 'Give Pro' (primary) and 'Change plan' (secondary).
- The overflow menu keeps the non-destructive actions: reset code, sign out everywhere, admin role, refresh from Google Play. Disable, Enable and Delete live only in the Danger zone.

#### [must] AdminUser: missing data and actions

**Problem.** The user detail response contains data the spec never shows:
- devices and active sessions
- whether the email is verified and a password is set
- merged-into, and when and why the account was disabled
- store subscriptions with order ID, sandbox flag, grace period, cancel reason, and local and USD price
- codes redeemed, the last 20 audit entries and the last 10 store events
Backend 7.7 also lists Edit (PATCH), Refresh from RevenueCat (/sync), and editing and deleting notes. The spec's 'Open in RevenueCat' link needs a RevenueCat project id that no backend setting provides.

**Change.** New sections:
- Devices: 'Android 14 · app 1.0.0 (42) · last seen 2 h ago · 1 session'.
- History: the user's audit entries; a tap opens the before → after sheet.
- Store events.
- Codes redeemed.

Store subscription:
- Play order ID (GPA.…) with copy, a Sandbox Badge, grace-until date, cancel reason, and '€9.99 · US$11.59'.
- 'Refresh from Google Play'. If the server answers 503 not_configured, show 'Store sync isn't set up on the server'.
- Replace the RevenueCat link with 'Copy RevenueCat ID'.

Also add:
- 'Edit user' for name, email, country and language.
- Edit and delete on notes.
- For disabled users, a danger Banner: 'Disabled 5 days ago: "Promo code abuse with several guest accounts"' with Enable.
- For merged users, a neutral Banner: 'Merged into SW-… on 3 Oct' with Open.

#### [must] Admin plan changes: Give Pro, Change plan, Add time

**Problem.** - AdminGrant has no plan choice, but GrantRequest requires one.
- Its duration presets differ from 7.7, which has 6 months and no 7 days.
- The spec makes the reason multiline; the API takes one line of 3 to 500 characters.
- Grant (new, separate gift), Extend (adds to the latest gift) and Change plan (revokes all gifts, then adds one) are three overlapping ideas, and nothing shows what each will do. A gift to someone whose store plan lasts longer changes nothing visible.
- The Revoke dialog's 'goes back to Free now' is false when another entitlement remains.

**Change.** One 'Give Pro' screen:
- Plan SegmentedControl (Monthly · Yearly · Lifetime), preset from the duration.
- Duration chips: 7 days · 1 month · 3 months · 6 months · 1 year · Custom date.
- When a gift is active, two radio rows: 'Add to current gift (31 Dec → 31 Jan)', which calls extend, and 'Start a separate gift', which calls grants.
- A one-line reason field with a /500 counter and quick chips: 'Beta tester', 'Support compensation', 'Press', 'Partner'.

Every plan action (give, change, add time, revoke) shows a 'Plan now → After' preview worked out from the user detail data. Example: 'Pro · Yearly (Google Play) until 12 Oct 2027 → unchanged: their store plan runs longer'.

The success toast adds: 'The app picks this up within 15 min while it's open.'

#### [must] Admin: reasons and re-authentication

**Problem.** Principle 7 and the admin rules require a reason for every change to a role, status, price, setting or code. The API stores a reason only for grant, change plan, extend, revoke, disable and delete. The requests for role, enable, promo codes, prices and settings have no reason field, so a reason typed there never reaches the audit log.

The 'Confirm it's you' dialog for admin sessions older than 30 days (401 reauth_required, backend 4.2 and 7.7) isn't designed. Asking for the admin's password before Make admin and Delete has no API field either.

**Change.** Ask for a reason only where the API stores one, as 7.7 says ('wherever the API takes one'). For the other actions, either ask the backend to add a reason field first or show no reason field.

Specify one shared 'Confirm it's you' Dialog: the admin's email, a password field, then POST /auth/sign-in with the current session token, then a silent retry of the request. Cancel leaves the admin screens. Make admin and Delete run the same password check before the change, and the spec should say so.

#### [must] Admin: promo codes

**Problem.** - The chips (Active, Expired, Off, All) miss the API's scheduled and exhausted statuses.
- 'One per person' has no API field: every user can redeem a code only once anyway (409 promo_already_redeemed).
- 'Generate' makes 8 characters without 0, O, 1, I or L. When the code is left empty, the server generates XXXX-XXXX-XXXX in Crockford base32, which keeps 0 and 1 and drops I, L, O and U.
- AdminPromoNew has no plan, start date, description or on/off.
- There is no edit (PATCH, refused with promo_in_use once used) and no delete for unused codes.
- 'Copy link' copies stopwake://redeem/…, which messengers don't make tappable and which does nothing without the app installed.

**Change.** - Chips: Active · Scheduled · Used up · Expired · Off · All.
- Remove 'One per person'.
- 'Generate' leaves the field empty, with the helper 'A code like K3P9-7XQ2-M4TD is made when you save'.
- The form adds plan, duration, max uses (empty means unlimited), valid from and until, description (up to 200 characters) and active.
- AdminPromo gets Edit; plan and duration lock after the first use, with a footnote saying why.
- Show 'Delete code' only when it has no redemptions; otherwise offer 'Turn off'.
- For sharing, add a server page /r/CODE that opens the app or the Play listing with the code shown, and copy that https link. Until it exists, label the stopwake:// link 'For testers'.

#### [must] Admin: pricing by country

**Problem.** Prices are saved per country key (PUT /prices/:country), and the built-in table has 20 keys. EUR alone covers DE, AT, LU, NL, BE, IE, FI, FR and EU in four formats, so the 'By currency' view with 11 groups matches nothing an admin can save.
- An override is marked only by a 6 dp dot, which is colour alone.
- Missing from 7.7: Add country, Reset all, the 'lifetime not above yearly' warning, a 'Default' trial option, currency and format for new rows, and previews in English and native style.
- Bare 64 dp number columns ('2.20') show no currency and cut off the country name at 360 dp.

**Change.** List one row per price key:
- Built-in countries A to Z, then override-only rows (the seed has Poland), then 'Other euro countries' (EU) and 'Everyone else' (DEFAULT).
- Each row shows flag and name, then 'CHF 2.20 / mo · CHF 11.00 / yr · CHF 16.00 once · 7-day trial' formatted by formatPrice, plus an 'Edited' Badge when overridden.

List actions:
- A '+' in the TopBar opens 'Add country': ISO country, currency and a format preset.
- The footer has a ghost danger 'Reset all prices' with type-to-confirm RESET.

AdminPrice:
- Trial chips: Default (7) · 0 · 3 · 7 · 14 · 30.
- Format under Advanced.
- Both warnings.
- A preview line in English and in native style: 'CHF 11.00 a year · CHF 0.92 a month · save 58 %'.
- 'Preview paywall', with its buy button disabled and labelled 'Preview only'.

#### [must] Admin: app settings

**Problem.** - The announcement tones (Info, Warning, Promo) aren't API levels; the API has info, success, warning and critical.
- The 'Everyone / Free / Pro' audience doesn't exist; the API targets countries and an app version range.
- The 140-character message ignores the API's 60-character title, 280-character body, per-language texts, start date and dismissible flag.
- 'Apps pick up changes within an hour' is false: phones refetch config on start or return to foreground once their copy is 6 hours old.
- Missing settings: privacy and terms links, sign-ups on/off, codes on/off (the kill switch in 3.4), minimum and latest app version, and plan cache days.
- 'Heavy sleeper alarm: on' meaning 'needs Pro' reads backwards and invites giving Pro features away by accident.

**Change.** Announcement editor:
- Level: Info · Success · Warning · Critical.
- Title (/60) and body (/280); English required, plus 'Add translation'.
- Link.
- Countries multi-select (empty means everyone).
- App versions from and to.
- Start and end dates.
- Dismissible switch.
- A live preview of the map banner.
- 'Show again to people who dismissed it' (saves under a new id).

New sections: Links; Sign-ups and codes; App versions, with the footer 'Older versions show a permanent Update banner. Alarms keep working.'; Plan cache.

Also:
- Feature rows read 'Heavy sleeper needs Pro'.
- Each row shows 'Default' or 'Edited by Alex Admin · 1 d ago', with 'Reset to default'.
- The publish dialog says 'Phones pick this up within about 6 hours.'

#### [must] Admin: audit log

**Problem.** Audit details never contain emails (backend 4.6), so rows like 'admin@… granted Pro … to anna.keller@example.com' can't be built. The API filters by action prefix, by admin and by user separately; the spec has one ambiguous search for 'User, admin or ID'. Admin sign-ins and failed sign-ins are the only security signal, since there is no admin two-factor login (4.12), yet they have no filter or emphasis.

**Change.** Rows name people by display name or public ID: 'Sam Support disabled SW-N0NP-GYZK', with the subtitle 'Promo code abuse with several guest accounts'.

Filters:
- Action chips: All · Gifts and plans · Codes · Prices · Settings · Accounts · Sign-ins.
- Pickers 'Admin: anyone' and 'User: anyone' that accept SW- IDs.
- Endless scroll using the 'before' parameter.

Failed admin sign-ins get a warning-tone icon, and their detail sheet shows the IP address and request id.

#### [should] Admin: user list and finding a user

**Problem.** - The chips (All, Free, Pro, Granted, Lifetime) differ from 7.7: All, Pro, Free, Trial, Guests, Accounts, Admins, Disabled.
- The API can search by Google Play order ID ('GPA.…'), which refund requests quote, but the spec doesn't offer it.
- Paging is described as a cursor, but the API uses limit/offset with a total.
- Finding a user from a support email takes three taps from AdminHome.

**Change.** - Chips: All · Pro · Trial · Free · Accounts · Guests · Admins · Disabled, plus Source (Store, Gift, Code), Country and Sort.
- Search placeholder: 'Email, name, SW-ID or Play order ID'.
- 'Load more' with '50 of 200'.
- Put the same search field at the top of AdminHome. An exact SW-ID or internal ID opens that user directly, and an SW-ID on the clipboard is offered as a 'Paste' chip.
- Pro rows show when the plan ends: 'Yearly · until 12 Oct 2027'.

#### [should] Admin: language, states and environment

**Problem.** - Admin strings are English, but shared pieces (Cancel, toasts, PlanBadge, dates) follow the app language, so a German-speaking admin sees mixed screens.
- Loading and error states for the dashboard and user detail aren't designed: a user deleted while open (404), or losing the admin role mid-session (403).
- Make admin can fail because admin passwords need at least 12 characters (backend 4.1).
- Nothing shows which server the admin is changing.

**Change.** - Wrap the admin screens in an I18nProvider fixed to English with en-GB formats.
- AdminHome shows skeleton tiles while loading.
- A failed load shows 'Couldn't load users' with the server message, request id and Retry.
- 404: 'This user no longer exists' with Back.
- 403: leave the admin screens with the toast 'You're no longer an admin'.
- Make admin with a short password: 'Their password is under 12 characters. Ask them to change it first.'
- AdminHome footer: 'Server api.… · v1.0.0 (abc1234)' from /v1/health.
- Admin TopBars show a warning 'Staging' Badge when the API URL is plain http or isn't the release URL.

#### [should] Map banners: priority

**Problem.** The banner priority list has no 'Update StopWake' banner, which backend 6.5 requires to stay up below app.minVersion, and no critical announcements. As written, a country-pack suggestion would outrank a critical safety notice.

**Change.** Priority from highest:
1. Trip stopped by the phone.
2. Update required: always shown, not dismissible, 'Update StopWake. Your alarms keep working.' with an 'Update' button that opens app.updateUrl.
3. Critical announcement.
4. Offline.
5. Country pack suggestion.
6. Other announcements.
7. Zoom hint.

Map announcement levels to Banner tones: info → info, success → success, warning → warning, critical → danger.

#### [must] Screenshot storyboard: data from the seed

**Problem.** The storyboard's data doesn't exist in the binding seed (backend 6.7) or in CI:
- 12,481 users, where CI seeds 40 plus 160 extra guests (200 in total)
- admin@stopwake.example, where CI uses admin@example.com
- Anna Keller
- codes SPRING26, PRESS2026 and WELCOME7, where the seed has WELCOME-2026, BETA-TESTERS, PRESS-2026, SUMMER-26 and STOPWAKE-DEMO
- a CHF price override, where the seed overrides PL
- the announcement 'New: stops for France are here.', where the seed has 'winter-timetables', switched off
- Redeem giving '1 month, until 10 Nov 2026', where the screenshot code STOPWAKE-DEMO gives 1 year, until 10 Oct 2027
Backend 6.8 also suggests its own screenshot list with different numbering.

**Change.** Rewrite every account and admin shot from the seed:
- Dashboard: 200 users, 20 Pro (10.0 %), 2 trials, Store 14 · Gift 3 · Code 3.
- User detail: Lena Weber (store yearly, note about Wear OS).
- Gift example: Aoife Murphy ('Press review copy').
- Disabled example: Noah Keller.
- Codes as seeded, with Poland marked Edited.
- The winter-timetables announcement shown as an unpublished draft.

Mark 6.8's list as replaced by this storyboard, so there is one numbering.

Decision for the owner: if a bigger dashboard is wanted, add a seed option that also creates Pro users. Adding only guests would show a 0.16 % Pro share.

#### [must] Screenshot storyboard: coverage and capture order

**Problem.** The storyboard has 32 shots, paywalls for only 2 countries, and 8 of about 15 admin screens. Missing: promo detail, new promo, change plan, price editor, store events, sign-up, a signed-in Account with a code, and any dark shot beyond the map.

Shots also change server state, so order matters:
- redeeming a code before the paywall shots hides the plans;
- publishing the announcement adds a banner to later map shots;
- signing in as admin merges the emulator's guest into the admin account.

**Change.** 38 shots in this order (* = store listing pick):
1. As a guest: welcome, get-ready, map-nearby*, map-dark, search*, stop*, stop-options (Heavy sleeper locked), trip*, Saved with the TripBar (trip minimised), trip-underground*, alarm*, arrived, activity*, account-guest.
2. Paywalls, before redeeming: en-DE €9.99, en-CH CHF 11.00, en-GB £8.99, en-JP ¥1,500, en-IN ₹399.
3. Redeem STOPWAKE-DEMO, then: sign-up (the new account later appears under Recent sign-ups), account signed in ('Code STOPWAKE-DEMO · until 10 Oct 2027'), settings, countries.
4. Sign out, then as admin: sign-in, dashboard, users (Pro filter), user (Lena), Give Pro (Felix Becker, 1 month, 'Support compensation'), change plan (Jonas, store warning), promo codes, WELCOME-2026 with its redemptions, new code, pricing (Poland edited), price editor (Switzerland with previews), settings (announcement draft), audit (today's gift on top), store events (Elsa's billing issue).

Also keep an uncommitted QA set: the stop sheet in German and Hindi, plus Account, paywall and Settings at 360x640 with font scale 1.3.

#### [must] Store listing images

**Problem.** The store picks are raw 720x1600 captures, a 2.22:1 ratio. Google Play rejects screenshots whose long side is more than twice the short side, and Play's promotional placements need at least four screenshots at 1080x1920, 9:16 ([median.co](https://median.co/blog/google-play-store-screenshot-size-requirements), [apptweak.com](https://www.apptweak.com/aso-blog/app-screenshot-icon-video-guidelines-ios-gp)). The picks also include the paywall ('Pro, priced for your country'), which tells a store visitor nothing about the app.

**Change.** Add a step in tools/ that builds 1080x1920 PNGs (RGB, no transparency):
- A caption block at the top in Inter Bold, 64 to 72 px, white on #4146D8 (or on #0B0F16 for the alarm and dark shots).
- The capture below it, scaled to about 1,350 px tall, with 40 px rounded corners and a soft shadow.
- English and German versions; Germany is 55 % of seed users.

Order and captions:
1. Stop sheet: 'Pick your stop. Choose when.'
2. Alarm: 'Rings even on silent'
3. Trip: 'Sleep. StopWake watches the map.'
4. Underground: 'Keeps going in tunnels'
5. Search: 'Finds any stop, even offline'
6. Map: 'Every stop around you'
7. Activity: 'See how every trip went'
8. A dark trip.

Leave the paywall out.

#### [nice] Typography: list row hierarchy

**Problem.** Row titles (bodyL 16, weight 500) and subtitles and banners (bodyM 15) differ by 1 dp, so only weight and colour separate them. Dense admin rows also end up looser than they need to be.

**Change.** Set bodyM to 14/20 for subtitles, meta lines and banners, and keep 16/22 for row titles and key sentences. That is the step Material and iOS lists use: it sharpens hierarchy and tightens admin rows without changing control sizes. Re-check the measured contrast list afterwards.

#### [nice] Visual: signature moments

**Problem.** The system is consistent but generic. The paywall hero is the stock crown in a circle, Arrived uses a checkered flag, and the icon's pin-and-sunrise motif, the one thing StopWake owns, appears only in onboarding illustrations. Next to competitors, the screenshots won't be recognisable at a glance.

**Change.** Make the sunrise arc and the amber wake ring the signature:
- Arrived hero: the arc rises over the horizon in 280 ms (static with reduced motion).
- Paywall hero: a small illustration built from real components at 0.8 scale, matching the reason (AlarmCard 'Heavy sleeper', a starred list, a dimmed underground map tile).
- Splash: fades into the map with the same pin.

Keep the crown only inside PlanBadge.

#### [nice] Empty states: demo trip

**Problem.** On day one, Activity's empty state offers only 'Plan a trip'. The demo trip, the best way to build trust in the alarm, is hidden behind 'Alarm options'.

**Change.** In the Activity empty state and the first-run Saved empty state, the primary button is 'Find a stop' and the secondary is 'Try a 1-minute demo trip', which plays the real alarm. Setup offers the same demo trip as 'Test on the lock screen'.

## Engineering and accessibility

### Keep
- Principles 1-7 as the decision filter. Map first and one thumb, with primary actions in the bottom 45 %. 'Two taps to sleep' with per-kind defaults and a single disclosure for options. Honest reliability copy ('about 2 min', ≈ for estimates). Offline treated as a normal state.
- Token architecture: tokens.ts and colors.ts in pure TypeScript with no react-native import, light and dark pairs, hex literals only in token files, and Vitest tests for token completeness, contrast pairs and the map recolour snapshot.
- The text-contrast table is accurate (I recomputed it). text 16.6/16.9. textSecondary at least 6.03 on every surface and on fill. textTertiary at least 4.69 on bg and surfaces, and 4.44 on light fill, exactly as the spec says. White on primary 6.79. onPrimary on dark primary 7.16. accentInk on accentSoft 5.74. The darker S-Bahn, tram and ferry fills give white text 4.71, 4.76 and 4.88.
- A calm recolour of the same Liberty style through a pure prepareStyle(style, lang, scheme), so offline packs and tile caches keep working. Hiding building-3d, one-way arrows and most POIs also saves GPU time on mid-range phones.
- MapSheet built with plain Animated and PanResponder (no gesture-handler or reanimated). Only the header drags, content scrolls only at half and expanded, animations stay on the native driver (transform and opacity), Android back pops one mode at a time, and every drag has a tap or back equivalent.
- ModalSheet as a native formSheet with fitToContents and our own grabber on Android, plus the hard rule that sheets never contain text inputs (this avoids Android formSheet keyboard bugs). Anything that needs typing goes to a full-screen modal with a TopBar.
- Dialog and ConfirmDialog on RN Modal (statusBarTranslucent, navigationBarTranslucent, own 200 ms animation) with an async onConfirm, a spinner, an inline error and type-to-confirm. Removing every Alert.alert.
- Embedding Inter through the expo-font config plugin with no runtime useFonts. I checked the expo-font 57 plugin: it writes res/font/xml_inter.xml and calls ReactFontManager.addCustomFont, so fontFamily 'Inter' plus fontWeight works, and so does the AlarmActivity lookup getIdentifier('xml_inter', 'font', ...).
- AppText rules: tabular-nums on every live or columnar number (Inter has the tnum feature), includeFontPadding false, Hindi ×1.25 and Japanese ×1.15 line height with zero tracking applied in one place, uppercase only in PlanBadge, numbers never truncated.
- Controls sized with minHeight, button labels allowed 2 lines, a maxFontSizeMultiplier per token, and a Definition of done that tests 360 × 640 dp at font scale 1.3.
- Navigation shape. One native-stack root with Tabs as a single route, and pushed screens that cover the tab bar (no per-tab stacks needed). Trip as fullScreenModal (gestureEnabled false, slide_from_bottom), Arrived with a fade. Search and stop are sheet modes, not routes. stopwake:// links. contentStyle bg and setBackgroundColorAsync prevent white flashes.
- Touch rules: 48 dp minimum, 56 dp full-width trip-critical actions, End trip deliberately weaker, at least 16 dp between destructive and primary actions, map stop hitbox 16.
- Motion rules: native driver only, transform and opacity only, no number tickers or bounce. Reduced motion zeroes durations and flyTo. Skeletons appear after 150 ms and stay at least 300 ms.
- Elevation through a single elevation(level) helper with opaque backgrounds on Android; in dark mode, depth comes from surface steps plus overlayBorder.
- MaterialCommunityIcons only, through the direct import. Every glyph name in the spec exists in @expo/vector-icons 15.1.1 (checked against the glyph map).
- NativeUserLocation tinted through Map tintColor works as written on Android. MapLibre RN 11.5 applies tintColor to the location component's foreground, bearing and accuracy colours.
- Loading, empty, error and offline states listed per screen, and the Definition of done checklist.
- The admin area built from the same components. No optimistic UI, every mutation confirmed by the server, rules against acting on yourself and removing the last admin, and the before → after diff sheet for audit entries.
- Paywall price precedence (store, then remote config, then the built-in table). Money copy that always states the period, the renewal and how to cancel, and a TrialTimeline with real dates.
- Copy rules: sentence case, buttons that start with a verb, a non-breaking space before units, placeholders instead of concatenated fragments, a 30 % expansion budget, and the glossary.
- Screenshot approach: a fixed 411 × 914 dp device, demo status bar, a seeded server, an EXPO_PUBLIC_SCREENSHOTS seed link, and the store-listing picks marked.

### Changes

#### [must] Account and auth screens vs backend-spec 2.6-2.8 and 7.6

**Problem.** Screens built from ui-direction-a would call the API wrongly or miss states. Forgot password asks for a '6-digit code' in a numeric one-time-code field, but reset codes are 8 Crockford characters (XXXX-XXXX). E-mailed codes last 30 min and admin-issued ones 60 min. DeleteAccount has only 'Type DELETE', but DELETE /v1/me requires `password` for accounts and returns 409 subscription_active unless `acknowledgeSubscription` is sent. Account has no 'Sign out other devices' (POST /auth/sign-out-all) and no 'Export my data' (GET /me/export). Redeem promises 'expired on 30 Sep 2026', but promo_expired carries no date, and there is no copy for already_lifetime, redeem_disabled or rate_limited. Config-driven states are missing: auth.signUpEnabled=false, auth.passwordReset=false ('Email support for a code'), features.redeemCodes=false, a local build without EXPO_PUBLIC_API_URL ('This build works without an account'), the disabled account's 'Continue without account', the app.minVersion 'Update StopWake' banner (6.5), and announcements with level 'critical' or dismissible=false.

**Change.** Treat backend-spec as authoritative for anything that touches an endpoint, and patch 4.3 as follows. Reset step 2 reads 'Enter the 8-character code' and uses the `code` field: autoCapitalize 'characters', the default keyboard, any separator accepted. DeleteAccount gets a secure 'Your password' field for accounts, and sends acknowledgeSubscription: true once the subscription Banner has been shown. Account gets 'Sign out other phones' and 'Download my data' (share sheet). Add details.expiresAt to promo_expired, or drop the date, and write the missing error strings. Add a table of config-driven states per screen: hide Create account, Forgot password and Redeem when off; a local-build empty state; a disabled-account banner with 'Continue without account'. Put 'Update StopWake' first in the map banner priority, and show critical announcements as a danger Banner with no close button.

#### [must] Admin confirmations vs admin API (reasons, password, delete)

**Problem.** 4.3 requires a reason for every change to a role, price, setting or code, and the acting admin's password for Make admin and Delete user. The API doesn't support this. SetRoleRequest, PriceUpdateRequest, PromoCreate/UpdateRequest and PATCH /admin/settings have no reason field. No admin request carries a password: the server only answers 401 reauth_required when the admin session is older than 30 days. AdminDeleteUserRequest.confirm is the user's public ID, not their email. 4.3 also blocks removing your own admin role, which the API allows unless you are the last admin. The settings publish dialog promises 'Apps pick up changes within an hour', but 7.3 refetches config only when the cache is more than 6 h old.

**Change.** Decide once and write it in both docs. Either add `reason` (3-500 chars) to the role, price, promo and settings requests and their audit details, or drop the UI requirement for those four. Replace requirePassword with a step-up the server enforces: role changes and user deletion return reauth_required unless the session was created in the last 10 min, and the app's existing 'Confirm it's you' dialog handles it and retries once. Delete user: type the public ID, normalised as in 1.1. Make the self-demotion rule the same in both docs. Change the publish copy to the real delay, or add a 1 h foreground config refetch to 7.3.

#### [must] Admin promo codes, grants, dashboard and user filters vs API

**Problem.** AdminPromoNew's Generate button makes 8 characters without 0, O, 1, I or L. When `code` is omitted, the server generates 12-character Crockford codes (XXXX-XXXX-XXXX, which do contain 0 and 1). The 'One per person' switch has no API field, because the server always rejects a second redemption by the same user. 'Gives' chips lack the required `plan`. There is no 'Valid from', no edit (PATCH; plan and duration lock once used) and no delete-when-unused, and the Scheduled and Exhausted statuses are missing. AdminGrant presets (7 d, 1 m, 3 m, 1 y, Lifetime) differ from 7.7 (1 m, 3 m, 6 m, 1 y, Lifetime, plus a plan control), and GrantRequest.plan is required. AdminHome offers 7 days / 30 days / All, but `days` accepts 7, 30 or 90 and only affects signupsByDay. Its 'Users by plan' bar needs store-only counts per plan; AdminDashboard returns byPlan and bySource as separate totals over all Pro users, so those can't be derived. AdminUsers lacks Trial, Guests and Accounts filters. The 'Granted' chip and the 'Pro, free (grants and codes)' tile need source = grant + promo, but `source` takes a single value.

**Change.** Rewrite these screens field by field from backend 2.2 and 2.10. Let the server generate codes (omit `code`). Drop the 'One per person' switch and state it as a rule. Add Plan (Monthly/Yearly/Lifetime), Duration, Valid from/until, Edit, Delete-if-unused, and status chips Active/Scheduled/Exhausted/Expired/Off/All. AdminGrant gets the plan control and the 7.7 presets. Dashboard: a 7/30/90 days segmented control and tiles from AdminDashboard (users, Pro share, trials, est. MRR). Add `pro.storeByPlan` to the API so the bar can show Free | Store monthly | Store yearly | Store lifetime | Gifted (grant + promo). Map each Users chip to exactly one query (plan=pro|trial|lifetime, kind=guest|account, role=admin, status=disabled), and accept `source=grant,promo`.

#### [must] Admin coverage (the owner wants an admin who can do everything)

**Problem.** The API supports admin actions the UI spec never draws, so they won't be built. Missing: refresh a user from RevenueCat (/sync); edit a user's name, email, country and language (PATCH); edit and delete notes; the user's devices, store subscriptions, audit history and store events; a reset code shown once with Copy (the UI says 'Send password reset code' instead); Add country and Reset all prices; settings for privacy and terms links, sign-up on/off, codes on/off, minimum and latest app version, and plan cache days; and the whole AdminStoreEvents screen with Retry. The announcement editor offers tone 'Promo' and audience Everyone/Free/Pro, which AnnouncementSetting can't express (its levels are info/success/warning/critical, and it targets by country and app version). It also lacks title, per-language texts, start date and dismissible, and caps the body at 140 characters where the API allows 280. Route names differ too: AdminPromos / AdminPromo / AdminPricing vs AdminPromoCodes / AdminPromoCode / AdminPrices.

**Change.** Add all of these to 4.3 using existing components (KeyValueRows, dense rows, ConfirmDialog with a reason), and use the backend's route names. Announcement editor: a Level segmented control (Info/Success/Warning/Critical), Title (up to 60), Body (up to 280), optional per-language texts in a collapsed section, a Countries picker, app version min/max, Starts and Ends DateFields, a Dismissible switch, and the live Banner preview. Drop the Free/Pro audience, or add it to AnnouncementSetting first.

#### [must] Paywall and admin price formatting

**Problem.** 4.3 formats table prices with Intl.NumberFormat(`${lang}-${region}`) and rounds the per-month price down. Backend 5.2 instead defines a deterministic formatPrice() with no Intl, perMonth = Math.round and yearlySaving = Math.floor; its table gives CHF 0.92 a month where the AdminPrice preview says 'CHF 0.91'. Hermes on Android uses the platform's ICU and Vitest uses Node's, so Intl output (NBSP vs NNBSP, symbol placement) differs between tests, the CI emulator and real phones.

**Change.** State that every table price, per-month figure and saving comes from formatPrice, perMonth and yearlySaving in src/lib/pricing.ts. Store-connected builds show product.priceString and pricePerMonthString. Fix the CHF example to 0.92. With a store connected, compute 'Save N %' from the store's numeric prices (product.price), not the table, and hide it below 10 %.

#### [must] Screenshot storyboard vs demo seed (backend 6.7)

**Problem.** Section 6 depends on data the seed doesn't create: 12,481 users; admin@stopwake.example (the seed uses admin@example.com); a guest with ID SW-7K3P-92QX (in the seed that is Lena Weber's account); anna.keller@example.com with a gift until 31 Dec 2026; codes SPRING26, PRESS2026 and WELCOME7 (the seed has WELCOME-2026, BETA-TESTERS, PRESS-2026, SUMMER-26 and STOPWAKE-DEMO); the 'New: stops for France' announcement (the seed has a disabled 'winter-timetables' one); and the flag `--seed screenshots` (the seed command is `cli.ts seed --demo`). Shots 17-19 and 25-32 can't be produced as written.

**Change.** Rewrite those rows against seed 6.7. For example: #19 Hannah Wagner's lifetime gift or Aoife Murphy's yearly grant, #29 the five seeded codes, #25 KPIs from `seed --demo --extra-guests=N` with a fixed --now. Use the same admin email in both docs. Add a CI check that fails when a storyboard row names a user, code or text the seed doesn't contain.

#### [must] MapSheet layout model (Animated + PanResponder)

**Problem.** The spec gives snap points and gesture rules but not the layout model, and the obvious build fails in four ways. (a) If a full-height sheet is moved with translateY, the inner ScrollView extends below the screen at peek and half, so its last rows can never be scrolled into view. (b) A sticky footer pinned to that sheet's bottom is off-screen whenever the sheet is translated. (c) Stop mode 'fits its content up to 80 %', a different sizing model from the browse snaps, and nothing says whether stop mode has detents or what dragging it does. (d) The header holds Pressables (SearchField, Avatar) that take the touch on press-in.

**Change.** Specify two models in one component. Browse and search: an absolutely positioned sheet whose height is `expanded`, with translateY = expanded − snapHeight on the native driver. After each settle, set the ScrollView's contentContainerStyle.paddingBottom to expanded − snapHeight + the visible tab bar height, so all content is reachable. Stop mode: a single detent. Its layout height is min(measured content + footer, 0.8 × frame height), and translateY is used only to enter, exit and drag to dismiss (release past 25 % of its height, or vy > 0.6, returns to the previous mode). The footer lives inside this auto-height sheet. On the header, use onMoveShouldSetPanResponderCapture (|dy| > 8 and |dy| > |dx|) and refuse termination while dragging. Never call setState in onPanResponderMove.

#### [must] Custom TabBar: height, layering and the TripBar

**Problem.** With a custom `tabBar`, bottom-tabs 7.20 keeps useBottomTabBarHeight() at its initial default (49 + inset, or tabBarStyle.height) unless the bar reports its own height. tabBarStyle.position is also ignored. Saved, Activity and Account would pad their content by the wrong amount. Hiding the bar (200 ms) while the sheet re-snaps to new 'heights above the tab bar' (280 ms) leaves a gap where the bar was. The TripBar 'docks above the tab bar on every tab', but the spec doesn't say where it is rendered, or whether it appears on pushed root screens (Settings, Countries, Paywall) that cover the tabs.

**Change.** The custom bar positions itself absolutely (left, right and bottom 0) and calls useContext(BottomTabBarHeightCallbackContext)?.(height) from onLayout; that context is exported by @react-navigation/bottom-tabs. Render the TripBar inside that component, above the tab items, with pointerEvents='box-none' on its margins. The reported height then includes it, and it hides with the bar. Pushed screens show no TripBar; the ongoing notification leads back to the trip. The MapSheet always extends to the screen bottom behind the bar: measure snaps from the screen bottom and give the content paddingBottom equal to the visible bar height. Hide the bar and resize the sheet with the same 200 ms standard timing.

#### [must] Native trip data behind Trip, Arrived, Activity and TripDetail

**Problem.** These screens need data the native module doesn't provide. TripEndedEvent has no endedAt, ring time, distance or ETA at ring, distance travelled or GPS-lost time. ActiveTrip has no kind, modes or stop id. Nothing persists finished trips: a trip that ends, or is stopped by the OS, while no JS listener is attached never reaches Activity. That is exactly the 'Stopped by phone' outcome, and it leaves 'Arrived shows on the next foreground' with no source. The snooze countdown needs a snooze end time. The progress bar needs the first-fix distance, which JS loses when it restarts. ETA can be null while distance is known (today's demo-ride screenshot shows 'Arrival in –'), and the spec has no state for that.

**Change.** Spec the native contract. TripStore writes one record per trip when it ends: the Activity › Data fields plus rangAt, distanceAtRingM, etaAtRingSec, gpsLostMs, endedAt and outcome. Add listTrips(since), getLastEndedTrip() and ackEndedTrip(id) for the Arrived-on-foreground rule, TripOptions.kind / modes / stopId, and TripStatus.startDistanceM and snoozeUntil. Add a trip state for 'distance known, speed unknown': 'Arrives' shows '—' with the caption 'Working out your speed…'.

#### [must] Touch targets: hitSlop on Android

**Problem.** The 48 dp claims for 36 dp chips (hitSlop 6), Button S (36 dp), the 40 dp IconButton (hitSlop 4) and the 36 dp sheet Avatar rely on hitSlop. React Native never extends a touch area beyond the parent's bounds. A horizontal chip ScrollView as tall as its 36 dp chips gives them 36 dp targets, and Button S in a SectionHeader row has the same problem.

**Change.** Make the Pressable itself at least 48 × 48 (minHeight and minWidth) and draw the smaller visual as an inner View. Where that won't work, the parent must reserve room for the slop; for chip rows, use contentContainerStyle paddingVertical 6 with a matching negative margin. Add a Maestro or dev-only check that every tappable bound is at least 48 dp.

#### [must] Contrast (WCAG AA): token fixes

**Problem.** I recomputed the pairs. Text mostly passes, with two exceptions. Light `danger` #D92D20 on `bg` is 4.46, which affects error lines and destructive text on bg screens such as Sign in and Redeem. In dark mode the `place` colour is theme primary #8E94FF under a white glyph (KindIcon, dropped-pin StopPin, trip puck arrow), which is 2.68, below the 3:1 icons need. Non-text contrast (WCAG 1.4.11, level AA) also fails for states users must see: the resting TextField border #E3E7ED on white is 1.24 (the fill alone is 1.14), the switch's off track #C5CCD6 on white is 1.62 (1.82 in dark), and the selected segment thumb against its track is 1.14 in light and 1.28 in dark.

**Change.** Change light danger to #C8261A (5.18 on bg; white on it is about 5.6). Make `place` a fixed #4146D8 in both themes, like the transport colours, and keep the trip puck #4146D8 in dark. Add a new fieldBorder: light #7A8597 (3.73 on white, 3.45 on bg) and dark #6B778A (3.88 on surface1). Use it for the switch's off track, and as a 1 px border on the segment thumb (about 3.2:1 against the track in both themes). Add these pairs to the Vitest contrast test.

#### [must] Accessibility: live regions and dismissing the alarm

**Problem.** The TripBar is accessibilityLiveRegion='polite' while its subtitle (distance, ETA) changes on every status update, so TalkBack would speak continuously. The native alarm can only be dismissed by sliding. That contradicts 2.7 ('Nothing time-critical depends on a gesture') for the most time-critical control, and is unreliable for TalkBack and Switch Access users.

**Change.** Put no live region on changing values. Announce only state changes (GPS lost or back, estimating, ringing, snoozed, ended) with announceForAccessibility, at most one every 10 s. In AlarmActivity, when an accessibility service is on, add an accessibility action 'Dismiss alarm' on the slider and on the root that dismisses on double-tap. Keep the slide for everyone else.

#### [should] Performance: number of live MapLibre views

**Problem.** Native-stack keeps Tabs mounted under Trip, and with it the Map tab's MapLibre TextureView. TripDetail adds a 220 dp live TripMap, and Trip can be presented above TripDetail. That is two or three GL contexts and tile caches on a mid-range phone, in the same process as the trip's foreground service.

**Change.** Rule: at most one interactive map mounted at a time. Unmount HomeMap while Trip or Arrived is on top, keeping the camera in a ref for initialViewState. Render TripDetail's map as an image with StaticMapImageManager.createImage. It accepts a style object, so add the trail, zone and destination to the prepared style as inline GeoJSON sources and layers, pass bounds and output 'file', and cache the result per trip id. Set preferredFramesPerSecond={30} on the Trip map. Test tab switches and closing Trip on a device, checking for a blank map after react-native-screens detaches the screen.

#### [should] Navigation: ModalSheet results, sizing and the admin guard

**Problem.** One generic ModalSheet route serves every picker and menu, but the spec doesn't say how the choice gets back to the caller. Callbacks in params aren't serializable and break linking. Android formSheet with fitToContents measures its content, so a flex: 1 root collapses to nothing, and long content such as the audit diff doesn't fit. The admin guard 'checked on focus' still registers the admin routes and deep links for every user.

**Change.** Define openSheet(spec): Promise<string | null>. It pushes ModalSheet with serializable params ({ requestId, title, options: [{ id, label, icon, selected, destructive }] }) and resolves from a module-level map on tap or on beforeRemove. Sheet content never has a flex: 1 root; more than 6 rows uses sheetAllowedDetents [0.5, 1] with a ScrollView. Register the Admin Stack.Group only when the cached session's role is 'admin' (React Navigation's conditional-screens pattern), so admin links do nothing for other users, and keep leaving the admin stack on 403.

#### [should] Navigation: presenting Trip and Arrived

**Problem.** Trip is presented on a status event and replaced by Arrived on onTripEnded, both from outside any screen, while the user may be on a pushed screen or a modal. `replace` only works when Trip is focused. Tapping the ongoing notification should reopen a minimised Trip, but no link is defined. At cold start during a trip, the Map renders first and Trip then slides in over it.

**Change.** Use createNavigationContainerRef. Present Trip with navigationRef.navigate('Trip'), triggered once per new trip id. When the trip ends, use replace only if Trip is the focused route; otherwise navigate('Arrived'). Give the notification's content intent the link stopwake://trip, mapped to Trip, which also clears the minimised flag. At cold start, read TripAlarm.getActiveTrip() (it is synchronous) and pass initialState [Tabs, Trip].

#### [should] Ambiguity: starting a trip while one is running

**Problem.** Nothing says what Start alarm does (from stop mode, the Saved menu or Ride again) while another trip is active; startTrip would silently replace it. What the home map shows while a trip is minimised isn't specified either.

**Change.** Add a ConfirmDialog: 'Replace your trip to München Hbf?' / 'The current alarm stops and the new one starts.', with 'Keep current' and a primary 'Replace'. While a trip is minimised, the home map shows its StopPin and amber zone.

#### [should] Gestures: dropping a pin without long-press

**Problem.** 2.7 says long-press is never the only way, yet search mode's 'Drop a pin on the map' only collapses the sheet and shows 'Long-press where you want to go'. Long-press remains the only way, and TalkBack users and many motor-impaired users can't do it on a map.

**Change.** Make 'Drop a pin' enter a pin mode. A fixed crosshair sits at the map centre, and the sheet at peek shows the reverse-geocoded address (coordinates when offline), a Button L 'Use this spot' and a ghost 'Cancel'. Panning moves the map under the crosshair. Keep long-press as a shortcut.

#### [should] Font: exact Inter files and weights

**Problem.** The spec hand-vendors TTFs from rsms/inter; the brief allows @expo-google-fonts/inter instead. I inspected @expo-google-fonts/inter@0.4.2. Its static TTFs are Inter 4.001 with family name 'Inter' (Medium and SemiBold carry typographic family 'Inter', not 'Inter 18pt'). They include the tnum, case and zero features and every symbol the copy uses (NBSP, NNBSP, ’, ≈, →, −, ₹, ł, č, ∞). They have no Devanagari or CJK glyphs, so the intended system fallback applies. Each file is about 335 KiB. The package has no `exports` field, so the plugin's require.resolve finds deep paths. Its index.js requires all 18 TTFs, so importing the package from JS would bundle every one of them.

**Change.** Install it with `npx expo install @expo-google-fonts/inter@0.4.2` and embed exactly four upright weights: 400 Regular, 500 Medium, 600 SemiBold and 700 Bold (about 1.31 MiB in total). No italics, and no 100-300 or 800-900 weights. Android fontDefinitions under fontFamily 'Inter', with weights 400/500/600/700: @expo-google-fonts/inter/400Regular/Inter_400Regular.ttf, .../500Medium/Inter_500Medium.ttf, .../600SemiBold/Inter_600SemiBold.ttf and .../700Bold/Inter_700Bold.ttf. Use the same four paths in ios.fonts. The plugin still writes res/font/xml_inter.xml. Never import the package from JS. In Licences, list Inter (OFL 1.1) using the package's LICENSE_FONT.

#### [should] Font scale 1.3 and Hindi: sizes that are still fixed

**Problem.** Several sizes break at font scale 1.3. The TabBar's 64 dp has to hold 8 + a 30 dp indicator + 4 + a labelS line of 21 dp (26 dp with Hindi's ×1.25), which is 63-68 dp. Badge and PlanBadge heights of 18-22 dp are shorter than a 21-26 dp labelS line. ComparisonTable's 72 dp cells can't fit 'Unbegrenzt' or 'Onbeperkt' at labelM × 1.3 (about 95-100 dp). StatTile labels are limited to one line, but 'Pünktlich geweckt' needs about 149 dp in a 126 dp tile. PlanCard puts the title and two badges ('7 Tage gratis', '58 % sparen'; Finnish '7 päivää ilmaiseksi') on one line in about 180 dp. The onboarding page (a 46 % illustration, a 2-line display title, a 3-line body and the footer) comes to about 700 dp on a 640 dp phone.

**Change.** Write all of these as minHeight and let content wrap. TabBar: minHeight 64, with the indicator shrinking to 28 dp when the label is large. Badges: minHeight with paddingVertical 1. StatTile labels: 2 lines. PlanCard: a flexWrap title row with the badges wrapping below. ComparisonTable: show the Pro cell as the `infinity` icon labelled 'Unlimited', or give it an 88 dp minimum. Onboarding: illustration flex: 1 with a 160 dp minimum and a 46 % maximum.

#### [should] Long German, Finnish, French and CJK strings

**Problem.** The 32 dp single-line offline pill can't hold the existing strings: they are 54-57 characters in German and French. 'Offline: Haltestellen und Alarm funktionieren trotzdem' is about 410 dp at labelM, wider than a 360 dp screen. A 12-character limit doesn't keep tab labels in one tab: 'Gespeichert' or 'Tallennetut' needs about 96 dp at labelS × 1.3 against 90 dp per tab, and Japanese 'アクティビティ' is 7 full-width characters, about 109 dp. 'Minutes before' and 'Distance before' become 17-character German labels next to an 18 dp icon in segments of about 160 dp. The guest banner puts 'Konto erstellen' and 'Anmelden' side by side in buttons of about 144 dp.

**Change.** Offline pill: minHeight 32, maxWidth = screen width − 32, up to 2 lines with radius md when wrapped, and shorter copy ('Offline · stops and alarms work'). Tab labels: numberOfLines 1 with adjustsFontSizeToFit (minimumFontScale 0.85), and a width budget (at most 84 dp at labelS × 1.3) tested across all 11 dictionaries instead of a character count. Segments: keep today's short labels (Time / Distance; Zeit / Entfernung) under the 'Wake me' header, and drop the icon above font scale 1.15. Guest banner: stack the two buttons at full width.

#### [should] i18n: plurals, relative times and clock format

**Problem.** translator() only substitutes {placeholders}, but the copy needs plurals: '2 things to fix' / '1 thing to improve', 'Favourites · 2 of 3', '11 of 12 trips', '3 countries', '1 area', 'in 82 days', '2 h ago', 'Yesterday, 18:40'. Hermes on Android has historically lacked Intl.PluralRules and Intl.RelativeTimeFormat (verify on the target build), and the codebase deliberately avoids Intl in format.ts and pricing.ts. Formatting times 'in the locale's time format' also ignores the phone's 24-hour setting.

**Change.** Add t(key, { count }) with key.one and key.other variants and a small per-language rule table (fr and hi treat 0 as one; ja has only other). Add deterministic formatRelative(), formatDate(style) and formatTime(), with month and weekday names in the dictionaries. Use expo-localization's getCalendars()[0].uses24hourClock for 'at 08:21'. Extend the dictionaries test to require both plural forms.

#### [should] Dark mode: the in-app Appearance override

**Problem.** The spec says the system scheme is 'overridden by Settings › Appearance' but not how. If the override lives only in ThemeProvider, native parts keep following the system: StatusBar style 'auto', the Android navigation-bar icon colour, Switch and ActivityIndicator defaults, formSheet backgrounds, text-selection handles and the keyboard.

**Change.** Apply the choice with Appearance.setColorScheme('light' | 'dark' | 'unspecified') (the RN 0.86 API), from saved preferences, before the first render. ThemeProvider then reads useColorScheme(). Keep userInterfaceStyle 'automatic' in app.json.

#### [should] Dark mode: cold start and map flashes

**Problem.** The splash spec (#4146D8 light, #0B0F16 dark) needs the expo-splash-screen config plugin, which isn't installed, so dark-mode cold starts flash the template splash. The map also shows MapLibre's light default until its first frame, which flashes over the dark UI.

**Change.** Add expo-splash-screen (npx expo install) with backgroundColor #4146D8, dark.backgroundColor #0B0F16 and the pin image. Remove android.adaptiveIcon.backgroundImage so backgroundColor takes effect. Render the map at opacity 0 over a `map.placeholder` View and fade it in on onDidFinishLoadingStyle; TextureView supports alpha.

#### [should] MapLibre: prop names and recolour robustness

**Problem.** rotateEnabled and pitchEnabled don't exist in MapLibre RN 11.5; the props are touchRotate and touchPitch. The recolour matches Liberty layer ids by string, OpenFreeMap updates its live style, and the repo has no pinned copy of it. A renamed id would silently revert that layer to yellow roads, and today's test only uses a hand-made 6-layer style.

**Change.** Use touchRotate={false} and touchPitch={false} on both maps. Commit a pinned copy of the Liberty style as a test fixture. Test that every rule in 2.1.1 matches at least one layer, and list the line and fill layers no rule matches. Add fallback rules keyed on source-layer and type (transportation lines, landcover and landuse fills) for ids that no rule matches.

#### [should] MapLibre: pin, selected stop, trip puck and attribution

**Problem.** The StopPin's 0.6 → 1 scale runs around the view's centre, so the tip lifts off the stop. The selected stop's own dot and label stay under the pin; today's 06-stop screenshot shows 'München Hbf' hidden by the pin and the sheet. The trip puck is a view Marker repositioned on every camera frame, which lags during the 800 ms fitBounds on mid-range phones. MapLibre's attribution button is about 28 dp and placed with attributionPosition, a static prop that can't follow a dragged sheet.

**Change.** Pin: transformOrigin 'bottom'. While the pin shows, filter the selected stop's id out of the stop dot and label layers. Trip puck: draw it as GL layers (a circle, plus a symbol with an arrow image registered through <Images> and icon-rotate from the heading) on a GeoJSONSource updated per fix. Set attribution={false} and add a 48 dp 'Map credits' MapControl that calls mapRef.showAttribution() and moves with the sheet like the locate button.

#### [should] MapSheet: camera padding, snap maths and the keyboard

**Problem.** 'Camera bottom padding equals the sheet height' implies a native prop update on every drag frame. 'available = window height − …' uses window dimensions, which under Android edge-to-edge (on by default for targetSdk 35+) don't reliably match the root view. With edge-to-edge, adjustResize no longer shrinks the window, so search results and form footers end up under the keyboard.

**Change.** Update Camera padding only when the sheet settles and when the mode changes. Compute snaps from useSafeAreaFrame().height and the insets. In search mode, pad the results by the keyboard height from keyboardDidShow and keyboardDidHide, and focus the TextInput when the expand animation finishes. Form screens use KeyboardAvoidingView behavior='padding' on Android too; verify on Android 15+.

#### [should] Accessibility: off-screen, faded and decorative content

**Problem.** At peek and half, MapSheet rows below the visible area are still focusable by TalkBack, and map controls faded to opacity 0 are still focusable and tappable. Onboarding illustrations are 'real components at 0.8 scale', so TalkBack would read and activate a fake 'Start alarm' button, and they grow with font scale. Changing sheet mode leaves TalkBack focus on an element that no longer exists.

**Change.** Set importantForAccessibility='no-hide-descendants' on sheet content outside the visible snap. Faded controls get pointerEvents='none' and leave the accessibility tree below opacity 0.5. Illustrations: pointerEvents='none', importantForAccessibility='no-hide-descendants', allowFontScaling={false} inside, and one accessibilityLabel on the panel. After a mode change, move focus to the new header with AccessibilityInfo.sendAccessibilityEvent(ref, 'focus').

#### [should] Accessibility: roles, toast timing and alarm-screen contrast

**Problem.** Chips only get the generic button role, though choice chips are single-select and filter chips are multi-select, and the custom tab bar has no roles. Undo and Retry toasts vanish after 4-6 s, which can be too short for screen-reader or switch users. On the native alarm screen, the slide track #222A3A on #0B0F16 is 1.33:1 and the Snooze border #3A4558 is 1.99:1, so their extent is hard to see in a dark room.

**Change.** Choice chip rows: accessibilityRole 'radiogroup' containing 'radio' chips. Filter chips: 'checkbox' with a checked state. Tab bar: 'tablist' and 'tab' with a selected state. Toast duration = AccessibilityInfo.getRecommendedTimeoutMillis(base). Alarm screen: track #3A4558 with a 2 px #5A667A stroke (3.3:1), and the same #5A667A stroke on Snooze.

#### [should] Non-text contrast of amber marks on light surfaces

**Problem.** Amber #FFB020 is 1.83:1 on white and 1.60:1 on `fill`. The filled favourite star, the trip progress bar's wake-point dot and the Pro avatar ring are hard to see in daylight; the ring is the only Pro cue in the MapSheet. The light `map.ahead` dotted line is 2.65:1 on land.

**Change.** Light mode only: the filled star in accentInk #8A5300 (6.33:1); a 1.5 px accentInk ring around the wake-point dot; for the Pro ring, add a 1 px accentInk outer stroke or a small crown badge; light `map.ahead` at opacity 0.9.

#### [should] Performance: grouped Sections in long lists

**Problem.** Section is defined as a container View with overflow: hidden and inset dividers, which can't wrap virtualized rows. Activity history, AdminUsers (50 per page), Audit and promo redemptions are long lists.

**Change.** Also define Section as row styling: isFirst and isLast props set the corner radius, divider and ripple clipping per row, so SectionList and FlatList can render grouped sections. Keep the container form for short static screens like Settings. Drive all skeleton pulses from one shared Animated.Value.

#### [should] Haptics on Android

**Problem.** In expo-haptics 57, selectionAsync, impactAsync and notificationAsync drive Android's Vibrator, and the library's own docs point to performAndroidHapticsAsync instead. They feel buzzy and ignore the system touch-feedback setting.

**Change.** Add a haptics facade. On Android, use performAndroidHapticsAsync with AndroidHaptics.Segment_Tick for selection, Confirm for alarm start and success, and Reject for validation errors; iOS keeps the current mapping. Drop the JS haptic on ringing, since the native alarm already vibrates.

#### [should] Paywall honesty: trial eligibility

**Problem.** Account's Free card says 'Get Pro · 7 days free' and the yearly PlanCard always shows '7 days free', but Google only offers the trial to eligible users. pro.ts already derives trialDays from RevenueCat's defaultOption.freePhase.

**Change.** Show trial copy (badge, button label, footer helper, TrialTimeline) only when the store plan's trialDays is above 0, or, in builds without a store, when the config's trialDays is above 0. Otherwise use 'Get Pro' and 'Subscribe for €9.99 a year'.

#### [should] Screenshots and QA automation

**Problem.** The storyboard is almost entirely light-theme English (one dark shot) and drops today's German and Hindi shots, while the Definition of done requires 360 × 640 dp at font scale 1.3, German strings that fit and Hindi line heights. The Maestro flows tap visible English text ('Distance', 'Use 2 min instead'), which the redesign changes and which breaks in other languages.

**Change.** Add a QA run that isn't for the store: every screen at 360 × 640 dp with font scale 1.3 in German and Finnish, plus Hindi and dark mode, using `adb shell settings put system font_scale 1.3` and `cmd locale set-app-locales`. Give key controls stable testIDs (for example sheet-search, stop-start, trip-end, alarm-dismiss) and switch the flows to `id:` selectors.

#### [nice] Font weights on Android 7-8.1

**Problem.** minSdk is 24. RN applies weights from an XML font family with Typeface.create(tf, weight, italic) only on API 28+. Below that it maps any weight under 700 to Regular, so 500 and 600 render as Regular and only 700 as Bold, and titles, buttons and labels lose their hierarchy. The native alarm's 28 sp SemiBold also needs API 28.

**Change.** Document this, or have AppText map the 600 tokens to 700 when Platform.Version < 28. In AlarmActivity, use Typeface.create(family, 600, false) on API 28+, otherwise Typeface.create(family, Typeface.BOLD).

#### [nice] Icon font loading on cold start

**Problem.** @expo/vector-icons renders an empty <Text /> until Font.loadAsync resolves (see createIconSet). Tab icons, map controls and icon buttons therefore pop in after the first frame, and icon-only buttons change size, despite the spec's goal of no runtime font wait.

**Change.** Hold the native splash until MaterialCommunityIcons.loadFont() resolves (capped at 1 s), using expo-splash-screen's preventAutoHideAsync and hideAsync. Give icon slots a fixed width and height so a late glyph never shifts the layout.

#### [nice] Battery: home location and the nearby list

**Problem.** The spec doesn't say how often the home position and the nearby list refresh. Re-querying the stops database and re-rendering on every fix wastes battery and JS time.

**Change.** Only while the Map tab is focused and the app is in the foreground: watchPositionAsync with Balanced accuracy and distanceInterval 50 m. Recompute the nearby list after moving more than 75 m or after a pack install. Stop watching when the tab is blurred or the app goes to the background.

#### [nice] Spec rules that contradict each other

**Problem.** A guest's Account screen shows two filled primary buttons in one region (the banner's 'Create account' and the Free card's 'Get Pro'), against the one-primary rule in 2.1. EditProfile puts its main 'Save' in the TopBar's top-right corner, against 2.7, where top corners hold only back, close, Restore and overflow. The Dialog rule 'stack the buttons if the labels don't fit' needs a measuring step it doesn't define.

**Change.** Make the guest banner's buttons secondary and ghost. Forms like EditProfile use a StickyFooter 'Save', and 'Save' is removed from the TopBar's trailing slot. Dialog actions: a row with flexWrap 'wrap-reverse' and justifyContent 'flex-end' (Cancel first, confirm last) puts the confirm button on top when they wrap, with no measuring.

#### [nice] Toast placement

**Problem.** '12 above the highest bottom element' needs each screen to tell a root-level ToastHost what sits at the bottom (TabBar, TripBar, StickyFooter or sheet footer), and the spec doesn't say how. On Android, RN Modal dialogs are separate windows, so a toast shown while one is open renders under its scrim.

**Change.** Add a useToastInset(height) hook that screens and the custom tab bar call; the focused screen wins, and the default is the bottom inset + 16. Hold toasts until any open Dialog closes.

#### [nice] Behaviours an engineer would have to guess

**Problem.** Unspecified behaviours: what a guest's 'Delete my data' deletes (local data only, or DELETE /v1/me too); whether the Saved edit-mode minus removes at once (with Undo) or asks first; what 'Start alarm' from the Saved menu shows, since no stop sheet opens; how Language opens as a modal from onboarding but as a card from Settings; the text of the Countries 'iOS: an info Banner'; DateField's 'decimal' keyboard, which shows a decimal key for day, month and year; and the React Navigation 7 theme, which needs a fonts object.

**Change.** Guest delete: DELETE /v1/me, clear local data, create a new guest. The edit-mode minus removes immediately with an Undo toast. Saved 'Start alarm' starts with the stop's defaults and shows 'Alarm set · rings about 2 min before'. Language takes its presentation from route params ('modal' when opened from onboarding). Write the iOS banner copy. DateField uses keyboardType 'number-pad'. The navigation theme extends DefaultTheme and DarkTheme with fonts set to Inter 400, 500, 600 and 700.

#### [nice] Map labels: font scale and dark-mode sprites

**Problem.** MapLibre text sizes ignore the system font scale, so stop names stay at 12-14 px at font scale 1.3. In dark mode, Liberty's sprite POI icons (poi_r1 at 0.7 opacity) and the white highway shields were designed for a light map.

**Change.** Multiply the stop-label text-size by min(PixelRatio.getFontScale(), 1.3). In dark mode, hide the poi_r1 icons (keep their labels) and the highway-shield layers, or set them to opacity 0.5.
