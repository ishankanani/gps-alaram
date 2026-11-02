# Publishing StopWake on Google Play

A step-by-step checklist from zero to production. Answers to every form are in
[play-console-answers.md](play-console-answers.md); listing texts in [listing/](listing/);
graphics in [graphics/](graphics/) and [screenshots/](screenshots/).

| What | Where |
| --- | --- |
| Package name | `com.ishankanani.gpsalarm` (can never change after the first upload) |
| Version | `expo.version` in `app.json` (now **1.0.0**) = versionName; versionCode = the Release workflow's run number |
| Build | `.github/workflows/release.yml` (Actions → Release → Run workflow, or push a tag `v1.0.0`) |
| Direct APK download | https://github.com/ishankanani/gps-alaram/releases/download/latest-apk/StopWake.apk |
| Privacy policy | https://ishankanani.github.io/gps-alaram/privacy/ |
| Account deletion | https://ishankanani.github.io/gps-alaram/account-deletion/ |
| Terms | https://ishankanani.github.io/gps-alaram/terms/ |

## 1. Create a Google Play developer account

1. Go to https://play.google.com/console/signup and sign in with the Google account that should own the app.
2. Choose **Personal** (or Organization if you have a company with a D-U-N-S number).
3. Pay the one-time **25 USD** fee and verify your identity (ID document) and your phone number. Verification can take a few days.
4. **New personal accounts must run a closed test with at least 12 testers for 14 days** before they can apply for production (step 11). Plan for it.

## 2. Create the app

Play Console → **Create app**: name *StopWake*, default language *English (United States)*, **App**, **Free**,
accept the declarations → Create.

## 3. Create the upload key and add it to GitHub

The upload key signs what you upload; Google re-signs with the app signing key it keeps (Play App Signing).
Run this once on your computer (needs a JDK, e.g. from Android Studio or `sudo apt install openjdk-17-jdk`):

```bash
keytool -genkeypair -v -storetype PKCS12 \
  -keystore stopwake-upload.keystore -alias upload \
  -keyalg RSA -keysize 2048 -validity 10000 \
  -dname "CN=Ishan Kanani, O=StopWake, C=DE"
# it asks for a password: use a long random one; the key password is the same for PKCS12

base64 -w0 stopwake-upload.keystore > stopwake-upload.keystore.b64     # macOS: base64 -i stopwake-upload.keystore -o stopwake-upload.keystore.b64
```

**Back up `stopwake-upload.keystore` and the password** (password manager + an offline copy). Never commit it
(`.gitignore` already ignores `*.jks`, and keystores belong outside the repo anyway).

In GitHub: repository → **Settings → Secrets and variables → Actions → Secrets → New repository secret**:

| Secret | Value |
| --- | --- |
| `ANDROID_UPLOAD_KEYSTORE_BASE64` | the content of `stopwake-upload.keystore.b64` |
| `ANDROID_UPLOAD_KEYSTORE_PASSWORD` | the keystore password |
| `ANDROID_UPLOAD_KEY_ALIAS` | `upload` |
| `ANDROID_UPLOAD_KEY_PASSWORD` | the key password (same as the keystore password for PKCS12) |

On the **Variables** tab, set the build settings the app needs in production:

| Variable | Value |
| --- | --- |
| `ADMOB_ANDROID_APP_ID` | your AdMob app id `ca-app-pub-…~…` (step 13) |
| `ADMOB_ANDROID_BANNER`, `ADMOB_ANDROID_INTERSTITIAL`, `ADMOB_ANDROID_REWARDED`, `ADMOB_ANDROID_APP_OPEN` | the ad unit ids `ca-app-pub-…/…` |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY` | optional, for accounts (`supabase/README.md`) |
| `SUPPORT_EMAIL` | your contact address, shown on the privacy pages |
| `ADMOB_PUBLISHER_ID` | `pub-…` for app-ads.txt (step 14) |

Without the four secrets the Release workflow still builds, but signs with the **debug key** and warns
(Play rejects such an AAB). Without the AdMob variables the build shows Google's **test ads**: fine for
the internal test, never for production.

## 4. Build the release

GitHub → **Actions → Release → Run workflow** (or `git tag v1.0.0 && git push origin v1.0.0`).
After ~30 minutes:

- the run's **artifact** `StopWake-1.0.0-<code>` holds the **.aab** (for Play) and the **.apk**;
- a **pre-release** on the Releases page has the APK, and the `latest-apk` release always has the newest
  one as `StopWake.apk` (link in the table above, to send to testers);
- the run summary shows the signing certificate, target SDK and every permission.

Every run gets a new versionCode (the run number). Bump `expo.version` in `app.json` for each public release (1.0.1, 1.1.0, …).

## 5. Play App Signing and the first upload

1. Play Console → your app → **Test and release → Testing → Internal testing → Create new release**.
2. Under *App integrity* accept **Play App Signing** with a Google-generated app signing key (the default).
3. Upload `StopWake-1.0.0-<code>.aab`, release name `1.0.0`, release notes from `listing/en.md`
   (add the other languages with *Add release notes in other languages*).
4. Save → **Review release** → **Start rollout to Internal testing**.
5. Testers: *Internal testing → Testers* → create an email list (you and friends), copy the opt-in link and open
   it on the phones. The app appears in Play within minutes.

If you lose the upload key later, request an upload key reset in *App integrity* (possible because Google
holds the app signing key).

## 6. Store listing

**Grow users → Store presence → Main store listing** (and *Store listings → Add translations* for each language):

- App name, short description, full description: `listing/<lang>.md` (Play language codes: en-US, de-DE,
  fr-FR, it-IT, nl-NL, da-DK, sv-SE, no-NO, fi-FI, hi-IN, ja-JP). `node store/tools/check-listing.mjs` checks the lengths
  (also of the App Store fields in `listing/en.md` and `listing/de.md`, and of the screenshot captions).
- App icon: `graphics/icon-512.png` (512 × 512, 32-bit PNG). Logo variants and a 48 px comparison:
  `graphics/variants/` (B, the folded map, is the default; sources in `src/variants/` and `src/glyph.svg.part`).
- Feature graphic: `graphics/feature-graphic-1024x500.png` (German listing: `graphics/feature-graphic-de-1024x500.png`).
- Phone screenshots: `screenshots/play/en/01…08-*.png` (and `screenshots/play/de/` for the German listing),
  1080 × 1920, in the store order of `listing/screenshots.json`; Play shows 8. The App Store sets are
  `screenshots/ios-6.9/` (1320 × 2868) and `screenshots/ios-6.5/` (1284 × 2778), upload 01 to 10.
  `screenshots/b/` has the same screens with the alternative captions for a store listing experiment
  (store/GROWTH.md). They are produced by **Actions → Screenshots → Run workflow** (an emulator drives the
  app, see `e2e/`), which commits the raw shots to `docs/screenshots` and the framed ones to
  `store/screenshots/`. To frame your own phone screenshots instead: name them like the `raw` entries of
  `listing/screenshots.json` (`en-05-alarm.png`, `en-04-trip.png`, …), then
  `npm i --no-save playwright && npx playwright install chromium && node store/tools/compose-screenshots.mjs <folder>`.
  The coverage infographic needs no raw shot. Play needs at least 2.
- **Store settings**: category *Maps & Navigation*, tags, contact email, website (play-console-answers.md).

## 7. App content (Policy → App content)

Work through every card, using [play-console-answers.md](play-console-answers.md):

1. **Privacy policy**: `https://ishankanani.github.io/gps-alaram/privacy/` (step 12 publishes it).
2. **App access**: *All functionality is available without special access*.
3. **Ads**: *Yes, my app contains ads*.
4. **Content rating**: start the questionnaire, email, category *All other app types*, answers from the file → Everyone.
5. **Target audience**: **18+** (recommended) → not appealing to children.
6. **Data safety**: the table in the file. Account deletion URL: `https://ishankanani.github.io/gps-alaram/account-deletion/`.
7. **Advertising ID**: *Yes*, purposes Advertising, Analytics, Fraud prevention.
8. **Government apps / Financial features / Health / News**: No.
9. **Foreground service permissions**: *Location*, with the description and a video link (record a demo trip, upload unlisted to YouTube).
10. **Full-screen intent**: *Alarm clock*. (Background location is **not** requested, so there is no location-permissions declaration.)

## 8. Countries

**Test and release → Production → Countries / regions → Add countries**: start with the countries that have stop
data (Germany, Austria, Switzerland, Luxembourg, Netherlands, Belgium, France, UK, Ireland, Denmark, Sweden, Norway,
Finland, USA, Canada, Australia, Japan) or *all countries* (search for addresses and pins work everywhere).

## 9. Closed testing (required for new personal accounts)

*Testing → Closed testing → Create track* → promote the internal release (or upload the same AAB) → add a
Google Group or email list with **at least 12 testers**, who must stay opted in for **14 days**. Fix what they report.

## 10. Pre-launch report

After each upload Play runs the app on real devices (*Testing → Pre-launch report*). Check crashes and
accessibility warnings; the "App access" answer lets the robot use the app without signing in.

## 11. Production

*Dashboard → Apply for production access* (after the closed test) → answer the questions → then
*Production → Create new release* → promote the tested release → **Start rollout** (a staged rollout of
20 % first is wise). Review takes from a few hours to several days.

## 12. Privacy pages on GitHub Pages

1. GitHub → repository **Settings → Pages → Build and deployment → Source: GitHub Actions**.
2. Set the variable `SUPPORT_EMAIL` (step 3).
3. **Actions → Pages → Run workflow** (it also runs on every push to `main` that changes `site/`).
   If the branch is not `main`, allow it in *Settings → Environments → github-pages → Deployment branches*.
4. Check https://ishankanani.github.io/gps-alaram/privacy/ , …/terms/ and …/account-deletion/.
5. Put the same links into the app: Admin → Settings → `links.privacy` and `links.terms` (Supabase `app_settings`),
   so Settings → Privacy policy / Terms of use open them.

## 13. AdMob

1. https://admob.google.com → **Apps → Add app → Android → "Yes, it's listed"** (after the Play listing is
   live; before that choose "No" and link it later), name StopWake.
2. Create ad units: Banner, Interstitial, Rewarded, App open. Put the app id and unit ids into the repository
   variables (step 3) and build again.
3. **Privacy & messaging → European regulations → create a GDPR message** for the app (and the US states
   message): the app shows it through Google's UMP SDK (docs/ads.md).
4. Payments: add your payment info and tax details.

## 14. app-ads.txt

AdMob checks `app-ads.txt` at the **root of the developer website domain** in your Play listing. On GitHub Pages,
the root of `ishankanani.github.io` is the *user site*, not this project, so:

1. Create a public repository named **`ishankanani.github.io`** with one file `app-ads.txt`:
   ```
   google.com, pub-XXXXXXXXXXXXXXXX, DIRECT, f08c47fec0942fa0
   ```
   (your publisher id from AdMob → Settings; enable Pages for that repo from the `main` branch).
2. In Play Console → Store settings → **Website**: `https://ishankanani.github.io` (the root, not `/gps-alaram`).
3. AdMob → Apps → View all apps → app-ads.txt tab → *Check for updates*. Verification can take a day.

The Pages workflow of this repository also writes `https://ishankanani.github.io/gps-alaram/app-ads.txt`
when `ADMOB_PUBLISHER_ID` is set, which helps if you move the website to a custom domain later
(then app-ads.txt must be at that domain's root).

## Every later release

1. Change `expo.version` in `app.json`, commit, push a tag `vX.Y.Z` (or run the Release workflow).
2. Upload the AAB to internal testing, try it, promote to production with release notes in `listing/<lang>.md`.
3. If you add a permission, SDK or data flow, update `play-console-answers.md`, the Data safety form and the privacy policy.
