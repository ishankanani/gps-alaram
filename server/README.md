# StopWake Cloud

The small server behind StopWake accounts, plans and the admin area: guest IDs (`SW-XXXX-XXXX`),
optional email accounts, Pro from Google Play (via RevenueCat webhooks), gifted plans and promo
codes, prices per country, remote settings and an audit log of every admin action.

- Node 22 only, **no npm dependencies**: `node:http`, `node:sqlite` (one file, WAL), `scrypt`.
- One process, one SQLite file on a persistent disk. Run **exactly one instance**.
- The design and the full API are in [`docs/design/backend-spec.md`](../docs/design/backend-spec.md).

## Run it locally

```sh
npm run server:seed   # demo data: 40 users (Lena Weber, promo STOPWAKE-DEMO, …) + 160 guests
ADMIN_EMAIL=admin@example.com ADMIN_PASSWORD=StopWake-admin-2026 npm run server
curl http://127.0.0.1:8787/v1/health
```

The app finds the server through `EXPO_PUBLIC_API_URL` at build time: `http://10.0.2.2:8787` in the
Android emulator. On a phone with a local server, use `adb reverse tcp:8787 tcp:8787` and
`http://localhost:8787`.

Checks: `npm run typecheck:server` and `npm run test:server`.

## Deploy

### 1. Choose a host (persistent disk, single instance)

**Fly.io (recommended)**, from the repository root:

```sh
cp server/deploy/fly.toml.example fly.toml        # set app and PUBLIC_URL
fly launch --no-deploy
fly volumes create stopwake_data --size 1 --region fra
fly secrets set ADMIN_EMAIL=you@example.com ADMIN_PASSWORD='…at least 12 characters…' \
  REVENUECAT_WEBHOOK_SECRET=$(openssl rand -hex 32) \
  SMTP_URL='smtps://user:pass@smtp.example.com:465' MAIL_FROM='StopWake <no-reply@example.com>' \
  SUPPORT_EMAIL=support@example.com
fly deploy
fly scale count 1
```

**Railway / Render:** a Docker service built from `server/Dockerfile` (build context: the
repository root) with a volume or disk mounted at `/data`, and the variables of
[`deploy/.env.example`](deploy/.env.example).

**VPS:**

```sh
docker build -f server/Dockerfile -t stopwake-cloud .
docker run -d --name stopwake --restart unless-stopped -p 127.0.0.1:8787:8787 \
  -v stopwake:/data --env-file server/deploy/.env stopwake-cloud
```

Put Caddy (automatic TLS: `api.example.com { reverse_proxy 127.0.0.1:8787 }`) or nginx in front
and set `TRUST_PROXY=1`.

### 2. DNS and TLS

Point `api.<domain>` at the host (a CNAME on Fly, then `fly certs add api.<domain>`) and set
`PUBLIC_URL=https://api.<domain>`. In production the server refuses a non-https `PUBLIC_URL`
unless `ALLOW_HTTP=true`.

### 3. The first admin

With `ADMIN_EMAIL` and `ADMIN_PASSWORD` set, the account is created (or promoted) at start. Sign in
from the app (Account → Sign in) and **Admin** appears on the Account tab. From the admin area you
can give any user a free plan, change or extend a plan, revoke it, disable accounts, create promo
codes, edit prices per country and change remote settings. Every action lands in the audit log.

Other admins, from a shell on the host:

```sh
node server/cli.ts make-admin someone@example.com          # fly ssh console -C "node server/cli.ts make-admin …"
node server/cli.ts grant SW-7K3P-92QX yearly --days=365 --reason="Support goodwill"
node server/cli.ts stats
```

`ADMIN_PASSWORD_RESET=true` overwrites the bootstrap admin's password at the next start (break glass).

### 4. Google Play and RevenueCat

- Play Console: subscription `stopwake_pro` with base plans `monthly` and `yearly` (offer
  `trial-7d`), one-time product `stopwake_lifetime`. Set the price of every country in
  `src/lib/pricing.ts` explicitly; elsewhere USD 1.99 / 9.99 / 14.99.
- RevenueCat: the three products on entitlement `pro`, offering `default`, Restore behaviour
  *Transfer*, and the webhook `https://api.<domain>/v1/webhooks/revenuecat` with the header
  `Authorization: Bearer <REVENUECAT_WEBHOOK_SECRET>` for production and sandbox.
- Send a test event from RevenueCat: the store events screen shows it as `ignored`.
- Optional: `REVENUECAT_API_KEY` (v1 secret key) enables "Refresh from RevenueCat" and deletes the
  RevenueCat customer when a user deletes their account.
- Rotating the webhook secret: set the new one as `REVENUECAT_WEBHOOK_SECRET` and the old one as
  `REVENUECAT_WEBHOOK_SECRET_PREVIOUS`, update RevenueCat, then remove the old one.

Changing a price in the admin area changes what the app shows; what Google charges must be changed
in Play Console too.

### 5. Mail

Any SMTP provider works (Postmark, Mailgun, SES, Brevo). Set up SPF and DKIM for the `MAIL_FROM`
domain. Mail is only used for password reset codes and email-change notices. Without mail, users
can still get a reset code from an admin (user → Reset code).

### 6. App builds

Set the repository variable `STOPWAKE_API_URL=https://api.<domain>` (Settings → Secrets and
variables → Actions → Variables). The Android workflow inlines it as `EXPO_PUBLIC_API_URL`.
Without it the app is built without accounts.

### 7. Backups and restore

- Built in: a daily snapshot at 03:00 UTC to `/data/backups` (14 daily + 8 weekly kept), and one
  at start when the newest is older than 26 h. By hand: `node server/cli.ts backup --out=/data/manual.db`.
- Snapshots on the same volume do not survive losing the volume: also keep host snapshots (Fly
  takes daily volume snapshots) and optionally Litestream
  (`litestream replicate /data/stopwake.db s3://…`).
- **Restore:** stop the app; copy the backup to `/data/stopwake.db`; delete `stopwake.db-wal` and
  `stopwake.db-shm`; start the app (migrations run); then
  `node server/cli.ts reapply-deletions --since=<backup time> --from=<the newer db file>` so
  accounts deleted after the backup stay deleted. Test this once before you need it.

### 8. Upgrades and rollback

Deploy a new image. Migrations run at start, after an automatic pre-migration backup. To roll back
a release that changed the schema, restore that pre-migration backup.

### 9. Monitoring

The host's health check (`GET /v1/health`), the JSON logs, and the admin dashboard's webhook panel
(errors in the last 24 h, unmatched events in the last 7 days). Optionally an external uptime check
on `/v1/health`.

### 10. Legal pages and Play Console Data safety

`/privacy`, `/terms` and `/account-deletion` are served from `server/static/*.html`, with
`{{SUPPORT_EMAIL}}` and `{{PUBLIC_URL}}` filled in. They are templates: adapt them and have them
reviewed before you publish.

Data safety:
- Collected: email (optional; account management), user IDs (StopWake ID, install ID), purchase
  history (via RevenueCat), app info (app and OS version).
- Not collected: location (it stays on the phone), contacts.
- Account deletion URL: `https://api.<domain>/account-deletion`.

## Environment

| Variable | Default | Notes |
|---|---|---|
| `NODE_ENV` | `development` | `production` turns on the startup checks |
| `HOST` / `PORT` | `127.0.0.1` / `8787` | the Docker image sets `HOST=0.0.0.0` |
| `DATA_DIR` | `server/data` | Docker: `/data` |
| `DATABASE_PATH` | `${DATA_DIR}/stopwake.db` | |
| `BACKUPS`, `BACKUP_DIR`, `BACKUP_HOUR_UTC`, `BACKUP_KEEP_DAILY`, `BACKUP_KEEP_WEEKLY` | on in production / `${DATA_DIR}/backups` / `3` / `14` / `8` | |
| `PUBLIC_URL` | `http://localhost:${PORT}` | https in production unless `ALLOW_HTTP=true` |
| `TRUST_PROXY` | `0` | number of trusted proxy hops |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` / `ADMIN_PASSWORD_RESET` | – / – / `false` | first admin |
| `REVENUECAT_WEBHOOK_SECRET` / `REVENUECAT_WEBHOOK_SECRET_PREVIOUS` | – | without it the webhook answers 503 |
| `REVENUECAT_API_KEY` / `REVENUECAT_ENTITLEMENT` | – / `pro` | |
| `STORE_SANDBOX_GRANTS_PRO` | `true` | tester purchases give Pro, never counted as revenue |
| `APP_PACKAGE` | `com.ishankanani.gpsalarm` | |
| `SUPPORT_EMAIL` | `support@example.com` | shown to users |
| `MAIL_MODE` | `smtp` with `SMTP_URL`, else `off` | `smtp`, `log` (files in `${DATA_DIR}/outbox`), `off` |
| `SMTP_URL` / `MAIL_FROM` | – / `StopWake <no-reply@localhost>` | |
| `SESSION_DAYS` / `ADMIN_SESSION_DAYS` | `180` / `30` | |
| `SCRYPT_N` / `SCRYPT_P` | `32768` / `3` | |
| `RATE_LIMITS` | `on` | cannot be turned off in production |
| `LOG_LEVEL` | `info` | |
