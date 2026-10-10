# StopWake 1.0: architecture decisions

These decisions frame the production redesign. Specs in this folder build on them.

## Backend: StopWake Cloud (own server, in this repo)

- `server/`: Node 22 + TypeScript (run with Node's type stripping, like `tools/`), HTTP API with
  a small router, SQLite through the built-in `node:sqlite` (WAL mode, one file on a persistent
  volume), no native dependencies. Ships as a Docker image; deploy to any host with a disk
  (Fly.io, Railway, Render with a disk, a VPS). Runs in CI next to the emulator for screenshots.
- Why not Supabase/Firebase: the whole stack must run in CI for tests and screenshots without
  third-party accounts, and the admin rules (grants, promo codes, audit log) live in our code.
- Auth: every install gets a **guest account** automatically (no sign-up needed to use the app),
  shown as a short user ID (e.g. `SW-7K3P-92QX`) that support/admin can look up. Users can
  **sign up** (email + password) to keep Pro across phones; the guest account becomes that
  account. Passwords: scrypt with per-user salt. Sessions: random opaque tokens stored hashed,
  revocable (disable user, sign out everywhere). Login rate limiting. Account deletion in-app
  (Play policy).
- Roles: `user`, `admin`. First admin from env `ADMIN_EMAIL` + `ADMIN_PASSWORD` at server start,
  or `node server/cli.ts make-admin <email>`.
- Plans: `free`, `monthly`, `yearly`, `lifetime`. Effective plan = the best of
  (a) the store subscription (Google Play through RevenueCat; RevenueCat app user id = our user
  id, its webhook updates the server) and (b) admin grants / promo codes with an expiry (or none
  for lifetime). The app caches the effective plan with its expiry so Pro works offline.
- Admin can: see a dashboard; search and filter users; grant free Pro for a period or lifetime;
  change a user's plan manually; extend or revoke grants; make/remove admins; disable/enable and
  delete accounts; add notes; create and deactivate promo codes; edit country prices and app
  settings (free limits, which features are Pro, trial length, announcement banner, support
  email); read the audit log of every admin action.
- Remote config: the app fetches public config (prices for its country, limits, Pro features,
  announcement) and caches it; built-in defaults apply offline and before first contact.

## Pricing by country

The paywall shows the plan prices in the user's local currency, by the phone's region (or the
store's localized prices when Google Play is connected, which are authoritative). The price
table (also the setup sheet for Play Console) lives in `src/lib/pricing.ts` with server-side
overrides editable by admins. Euro countries €9.99/yr, €1.99/mo, €14.99 lifetime; CHF, GBP, SEK,
NOK, DKK, USD, CAD, AUD, JPY, INR set to equivalent local price points; other countries USD.

## App structure

- React Navigation 7 (native stack + bottom tabs) replaces the hand-rolled screen switcher.
  Tabs: **Map**, **Saved**, **Activity**, **Account**. A running trip shows full-screen above the
  tabs. Admin screens are a stack reached from Account when the signed-in user is an admin.
- A real design system in `src/ui/`: tokens (color, type scale, spacing, radius, elevation) for
  light and dark, and components (Text, Button, IconButton, Card, ListItem, Section, TextField,
  Badge, Avatar, Switch row, Segmented, Sheet, Dialog, Toast, EmptyState, Skeleton, Screen header).
- Strings: English per feature area in `src/i18n/en/*.ts`; the other ten languages follow the
  same split; missing keys fall back to English at runtime and a test requires completeness.
