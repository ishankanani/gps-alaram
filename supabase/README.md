# StopWake on Supabase

Accounts (sign-up, sign-in, password reset), the user data synced from phones (favourites, recents,
trip history), plans and the whole admin area run on a Supabase project. The Node server in
`server/` stays in the repo but the app no longer talks to it.

| File | What |
| --- | --- |
| `migrations/20261019000001_schema.sql` | Tables, helpers, triggers, Row Level Security |
| `migrations/20261019000002_plans_and_me.sql` | Plan logic, the user's RPCs, promo redemption, export, account deletion, sync, public config |
| `migrations/20261019000003_admin.sql` | Admin RPCs (each checks the admin role, validates, writes the audit log) and execute privileges |
| `seed.sql` | Demo data for a development project (12 demo accounts that can't sign in) |
| `tests/` | A local check: `local-stub.sql` stands in for Supabase's `auth` schema, `rls-test.sql` tests RLS and the RPCs |

## 1. Create the project

1. At [supabase.com](https://supabase.com) create a project (pick a region near your users, e.g. Frankfurt).
2. Keep the database password somewhere safe; the app never needs it.

## 2. Run the migrations

Either way works; run the three files **in order**.

- **SQL editor**: Dashboard → SQL Editor → New query, paste `migrations/20261019000001_schema.sql`,
  Run; then `…02…`, then `…03…`. For a development project you may also run `seed.sql`.
- **CLI**: `npx supabase login`, `npx supabase link --project-ref <ref>`, `npx supabase db push`
  (runs every file in `migrations/`). `npx supabase db reset` against a local stack also runs `seed.sql`.

## 3. Set up email auth

Dashboard → Authentication:

1. **Sign In / Providers → Email**: enabled. "Confirm email" on is recommended (the app then says
   "Check your email…" after sign-up, and sign-in waits for the confirmation).
2. **Email OTP length: 8**, **Email OTP expiration: 1800 s** (the app says codes are valid for 30 minutes
   and accepts 6–10 digits).
3. **Emails → Templates → Reset password**: the app resets passwords with a code, not a link. Put the
   code in the template, e.g.
   `<p>Your StopWake code: <strong>{{ .Token }}</strong></p><p>It works for 30 minutes.</p>`
4. **SMTP**: the built-in mailer sends only a few mails an hour; set your own SMTP server
   (Authentication → Emails → SMTP settings) before launch.
5. **URL Configuration**: the Site URL is used in the confirmation link; a page of yours (or the
   project URL) is fine — the app doesn't need a deep link.

## 4. Make the first admin

Create your account in the app (or Authentication → Users → Add user), then in the SQL editor:

```sql
update public.profiles set role = 'admin' where email = 'you@example.com';
```

From then on admins promote others in the app (Admin → user → Make admin). The last active admin
can't lose the role, be disabled or delete their account.

## 5. Connect the app

Dashboard → Project Settings → API (or "Connect"): copy the **Project URL** and the **anon / publishable
key**. For builds set them as environment variables (EAS: `eas env:create`, GitHub: repository variables
`SUPABASE_URL` and `SUPABASE_ANON_KEY` used by `.github/workflows/android.yml`; locally a `.env` file):

```
EXPO_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=<anon key>
```

Without them the app works fully offline without accounts, as before.

> **Never put the `service_role` key (or the database password) in the app, an `EXPO_PUBLIC_*`
> variable, or the repo.** It bypasses Row Level Security: anyone who unpacks the APK would own the
> database. The anon key is meant to be public; RLS and the functions below decide what it may do.

## How it is secured

- **RLS on every table.** Users read their own profile, devices, grants, redemptions and subscriptions,
  and read/write only their own favourites, recents and trip history. Admins can read everything.
  Settings and country prices are readable by everyone (they are the public remote config).
- **Admins** are rows with `profiles.role = 'admin'` and `status = 'active'`, checked by
  `public.is_admin()` (SECURITY DEFINER, reads the table). JWT claims and anything the app sends are never
  trusted for roles.
- **No direct writes** to profiles, plans, grants, promo codes, prices, settings, notes or the audit log:
  only SECURITY DEFINER functions (with a fixed `search_path`) change them. Every admin function calls
  `require_admin()`, validates its input (same rules as the old server) and writes one `audit_log` row in
  the same transaction. The audit log is append-only (a trigger), except the GDPR scrub on deletion.
- **Execute privileges**: the migrations revoke EXECUTE on all functions and grant only the API
  (`me`, `update_me`, `my_plan`, `redeem_promo`, `export_my_data`, `sign_out_other_sessions`,
  `delete_my_account`, `sync_push`, the `admin_*` functions, and `public_config` for signed-out phones).
  Internal helpers like `write_audit` and `recompute_plan` can't be called from the app. If you add
  functions by hand, grant them explicitly.
- **Sign-up** creates the profile in a trigger on `auth.users` (public id `SW-XXXX-XXXX`, name, language and
  country from the sign-up metadata, validated). With the setting `auth.signUpEnabled = false` the trigger
  refuses new users.

## Account deletion

`delete_my_account()` (the user, after re-entering their password) and `admin_delete_user()` delete the
row in `auth.users` from a SECURITY DEFINER function owned by `postgres`; everything else cascades
(profile, synced data, grants, redemptions, notes, devices) and audit entries about the user are scrubbed.
This works on Supabase today. If a future platform change stops `postgres` from deleting auth users,
move that one statement into an Edge Function that calls `supabase.auth.admin.deleteUser(id)` with the
service role key (kept as an Edge Function secret, never in the app), and have the RPC call it.

## Sync

Phones sync favourites, recents and trip history offline-first: `updated_at` is the phone's clock of the
last change (last write wins, clamped to now + 5 minutes), deletions are tombstones, `synced_at` is the
server's clock that phones pull incrementally. Signed out, nothing leaves the phone; at sign-in the phone's
data is merged into the account and the account's into the phone (`src/lib/cloudSync.ts`, `src/api/sync.ts`).

## Premium later

Plans keep the server's rules (`plan_candidates`, `recompute_plan`, `plan_json`): admin grants and promo
codes already give Pro. `store_subscriptions` and `store_events` wait for a RevenueCat webhook (an Edge
Function with the service role writing those tables, then `recompute_plan(user_id)`); until then the admin
"Store events" screen shows "Available when premium launches" and "Refresh from Google Play" reports nothing.

## Checking the SQL locally

With Postgres 15+ and `psql` (no Supabase needed):

```
sudo -u postgres supabase/tests/run-local.sh
```

It creates a throwaway database, a stand-in `auth` schema and the `anon` / `authenticated` roles, runs the
migrations and the seed, then `tests/rls-test.sql` (RLS, privileges, every RPC's happy path and guards) and
prints `OK`.
