CREATE TABLE users (
  id                  TEXT PRIMARY KEY,                    -- UUID v4; RevenueCat app user id
  public_id           TEXT NOT NULL UNIQUE CHECK (public_id GLOB 'SW-[0-9A-HJKMNP-TV-Z][0-9A-HJKMNP-TV-Z][0-9A-HJKMNP-TV-Z][0-9A-HJKMNP-TV-Z]-[0-9A-HJKMNP-TV-Z][0-9A-HJKMNP-TV-Z][0-9A-HJKMNP-TV-Z][0-9A-HJKMNP-TV-Z]'),
  email               TEXT UNIQUE CHECK (email IS NULL OR (email = lower(email) AND length(email) BETWEEN 3 AND 254)),  -- NULL = guest
  email_verified_at   INTEGER,
  password_hash       TEXT,                                -- scrypt$v=1$… ; NULL for guests
  password_changed_at INTEGER,
  display_name        TEXT CHECK (display_name IS NULL OR length(display_name) BETWEEN 1 AND 60),
  role                TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  status              TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled', 'merged')),
  disabled_at         INTEGER,
  disabled_reason     TEXT,
  merged_into         TEXT REFERENCES users(id) ON DELETE CASCADE,
  country             TEXT CHECK (country IS NULL OR country GLOB '[A-Z][A-Z]'),
  language            TEXT CHECK (language IS NULL OR language IN ('da','de','en','fi','fr','hi','it','ja','nb','nl','sv')),
  -- Denormalized effective plan (section 1.3), recomputed in the same transaction as any entitlement change.
  plan                TEXT NOT NULL DEFAULT 'free' CHECK (plan IN ('free', 'monthly', 'yearly', 'lifetime')),
  plan_source         TEXT CHECK (plan_source IN ('store', 'grant', 'promo')),
  plan_until          INTEGER,                             -- end of access; 253402300799999 = lifetime
  plan_will_renew     INTEGER NOT NULL DEFAULT 0 CHECK (plan_will_renew IN (0, 1)),
  plan_trial          INTEGER NOT NULL DEFAULT 0 CHECK (plan_trial IN (0, 1)),
  plan_ref            TEXT CHECK (plan_ref IS NULL OR plan_ref GLOB 'store:*' OR plan_ref GLOB 'grant:*'),
  created_at          INTEGER NOT NULL,
  updated_at          INTEGER NOT NULL,
  signed_up_at        INTEGER,
  last_seen_at        INTEGER,
  CHECK ((email IS NULL) = (password_hash IS NULL)),
  CHECK (role = 'user' OR email IS NOT NULL),              -- guests can never be admins
  CHECK ((status = 'merged') = (merged_into IS NOT NULL)),
  CHECK ((status = 'disabled') = (disabled_at IS NOT NULL)),
  CHECK ((plan = 'free') = (plan_source IS NULL)),
  CHECK ((plan = 'free') = (plan_until IS NULL)),
  CHECK ((plan = 'free') = (plan_ref IS NULL))
) STRICT;
CREATE INDEX users_created_at   ON users(created_at);
CREATE INDEX users_last_seen_at ON users(last_seen_at);
CREATE INDEX users_plan_until   ON users(plan_until) WHERE plan_until IS NOT NULL;
CREATE INDEX users_country      ON users(country);
CREATE INDEX users_merged_into  ON users(merged_into) WHERE merged_into IS NOT NULL;
CREATE INDEX users_admins       ON users(role) WHERE role = 'admin';

CREATE TABLE devices (                                     -- one row per app installation
  id               INTEGER PRIMARY KEY,
  install_id_hash  TEXT NOT NULL UNIQUE,
  user_id          TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,  -- the user this install is signed in as
  platform         TEXT NOT NULL CHECK (platform IN ('android', 'ios')),
  app_version      TEXT NOT NULL,
  build            INTEGER,
  os_version       TEXT,
  country          TEXT,
  language         TEXT,
  created_at       INTEGER NOT NULL,
  last_seen_at     INTEGER NOT NULL
) STRICT;
CREATE INDEX devices_user_id      ON devices(user_id);
CREATE INDEX devices_last_seen_at ON devices(last_seen_at);

CREATE TABLE sessions (
  id            INTEGER PRIMARY KEY,
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_id     INTEGER REFERENCES devices(id) ON DELETE SET NULL,
  token_hash    TEXT NOT NULL UNIQUE CHECK (length(token_hash) = 64),
  method        TEXT NOT NULL CHECK (method IN ('guest', 'sign_up', 'sign_in', 'reset')),
  created_at    INTEGER NOT NULL,
  last_used_at  INTEGER NOT NULL,
  expires_at    INTEGER NOT NULL CHECK (expires_at > created_at)
) STRICT;
CREATE INDEX sessions_user_id    ON sessions(user_id);
CREATE INDEX sessions_device_id  ON sessions(device_id);
CREATE INDEX sessions_expires_at ON sessions(expires_at);

CREATE TABLE password_reset_tokens (
  id          INTEGER PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code_hash   TEXT NOT NULL CHECK (length(code_hash) = 64),
  via         TEXT NOT NULL CHECK (via IN ('email', 'admin')),
  created_by  TEXT REFERENCES users(id) ON DELETE SET NULL,
  attempts    INTEGER NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 5),
  created_at  INTEGER NOT NULL,
  expires_at  INTEGER NOT NULL CHECK (expires_at > created_at),
  used_at     INTEGER
) STRICT;
CREATE INDEX password_reset_tokens_user ON password_reset_tokens(user_id, created_at);

CREATE TABLE promo_codes (
  id                INTEGER PRIMARY KEY,
  code              TEXT NOT NULL UNIQUE CHECK (length(code) BETWEEN 4 AND 32 AND code NOT GLOB '*[^A-Z0-9-]*'),
  plan              TEXT NOT NULL CHECK (plan IN ('monthly', 'yearly', 'lifetime')),
  duration_days     INTEGER CHECK (duration_days IS NULL OR duration_days BETWEEN 1 AND 3650),
  max_redemptions   INTEGER CHECK (max_redemptions IS NULL OR max_redemptions BETWEEN 1 AND 1000000),
  redemption_count  INTEGER NOT NULL DEFAULT 0 CHECK (redemption_count >= 0),
  starts_at         INTEGER,                               -- NULL = valid now
  expires_at        INTEGER,                               -- NULL = no end
  active            INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  description       TEXT NOT NULL DEFAULT '' CHECK (length(description) <= 200),
  created_by        TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at        INTEGER NOT NULL,
  updated_at        INTEGER NOT NULL,
  CHECK ((plan = 'lifetime') = (duration_days IS NULL)),
  CHECK (starts_at IS NULL OR expires_at IS NULL OR expires_at > starts_at),
  CHECK (max_redemptions IS NULL OR redemption_count <= max_redemptions)
) STRICT;

CREATE TABLE grants (                                      -- free Pro given by an admin or a promo code
  id             INTEGER PRIMARY KEY,
  user_id        TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan           TEXT NOT NULL CHECK (plan IN ('monthly', 'yearly', 'lifetime')),
  source         TEXT NOT NULL CHECK (source IN ('admin', 'promo')),
  promo_code_id  INTEGER REFERENCES promo_codes(id) ON DELETE SET NULL,
  starts_at      INTEGER NOT NULL,
  ends_at        INTEGER,                                  -- NULL only for lifetime
  reason         TEXT NOT NULL CHECK (length(reason) BETWEEN 1 AND 500),
  created_by     TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at     INTEGER NOT NULL,
  updated_at     INTEGER NOT NULL,
  revoked_at     INTEGER,
  revoked_by     TEXT REFERENCES users(id) ON DELETE SET NULL,
  revoke_reason  TEXT,
  CHECK ((plan = 'lifetime') = (ends_at IS NULL)),
  CHECK (ends_at IS NULL OR ends_at > starts_at),
  CHECK (source = 'promo' OR promo_code_id IS NULL),
  CHECK ((revoked_at IS NULL) = (revoke_reason IS NULL))
) STRICT;
CREATE INDEX grants_user       ON grants(user_id, revoked_at, ends_at);
CREATE INDEX grants_promo_code ON grants(promo_code_id) WHERE promo_code_id IS NOT NULL;

CREATE TABLE promo_redemptions (
  id             INTEGER PRIMARY KEY,
  promo_code_id  INTEGER NOT NULL REFERENCES promo_codes(id) ON DELETE CASCADE,
  user_id        TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  grant_id       INTEGER REFERENCES grants(id) ON DELETE SET NULL,
  redeemed_at    INTEGER NOT NULL,
  UNIQUE (promo_code_id, user_id)
) STRICT;
CREATE INDEX promo_redemptions_user      ON promo_redemptions(user_id);
CREATE INDEX promo_redemptions_code_time ON promo_redemptions(promo_code_id, redeemed_at);

CREATE TABLE store_subscriptions (                         -- one row per store purchase (original transaction)
  id                       INTEGER PRIMARY KEY,
  user_id                  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  store                    TEXT NOT NULL CHECK (store IN ('play_store', 'app_store', 'stripe', 'amazon', 'promotional', 'test_store', 'other')),
  environment              TEXT NOT NULL CHECK (environment IN ('production', 'sandbox')),
  product_id               TEXT NOT NULL CHECK (length(product_id) BETWEEN 1 AND 200),
  plan                     TEXT NOT NULL CHECK (plan IN ('monthly', 'yearly', 'lifetime')),
  original_transaction_id  TEXT NOT NULL CHECK (length(original_transaction_id) BETWEEN 1 AND 200),
  rc_app_user_id           TEXT NOT NULL,                  -- app_user_id of the last event
  status                   TEXT NOT NULL CHECK (status IN ('trialing', 'active', 'grace_period', 'billing_issue', 'paused', 'expired', 'refunded')),
  period_type              TEXT CHECK (period_type IN ('trial', 'intro', 'normal', 'promotional', 'prepaid')),
  will_renew               INTEGER NOT NULL DEFAULT 1 CHECK (will_renew IN (0, 1)),
  purchased_at             INTEGER NOT NULL,
  expires_at               INTEGER,                        -- NULL = lifetime (non-renewing, non-expiring)
  grace_until              INTEGER,
  cancel_reason            TEXT,
  country                  TEXT,
  currency                 TEXT,
  price_local              REAL,
  price_usd                REAL,
  last_event_id            TEXT,
  last_event_type          TEXT,
  last_event_at            INTEGER NOT NULL,
  created_at               INTEGER NOT NULL,
  updated_at               INTEGER NOT NULL,
  UNIQUE (store, original_transaction_id),
  CHECK (plan != 'lifetime' OR will_renew = 0)
) STRICT;
CREATE INDEX store_subscriptions_user   ON store_subscriptions(user_id);
CREATE INDEX store_subscriptions_active ON store_subscriptions(environment, status, expires_at);

CREATE TABLE webhook_events (                              -- RevenueCat deliveries: idempotency + debugging
  id            TEXT PRIMARY KEY CHECK (length(id) BETWEEN 1 AND 100),   -- event.id
  type          TEXT NOT NULL,
  app_user_id   TEXT,
  user_id       TEXT REFERENCES users(id) ON DELETE SET NULL,
  environment   TEXT,
  event_at      INTEGER,                                   -- event_timestamp_ms
  received_at   INTEGER NOT NULL,
  processed_at  INTEGER,
  status        TEXT NOT NULL CHECK (status IN ('processed', 'stale', 'ignored', 'unmatched', 'error')),
  error         TEXT,
  payload       TEXT NOT NULL CHECK (json_valid(payload) AND length(payload) <= 65536)  -- event JSON without subscriber_attributes
) STRICT;
CREATE INDEX webhook_events_received_at ON webhook_events(received_at);
CREATE INDEX webhook_events_user        ON webhook_events(user_id, received_at);
CREATE INDEX webhook_events_status      ON webhook_events(status, received_at);
CREATE INDEX webhook_events_app_user    ON webhook_events(app_user_id);

CREATE TABLE notes (                                       -- admin-only notes on a user
  id          INTEGER PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  author_id   TEXT REFERENCES users(id) ON DELETE SET NULL,
  body        TEXT NOT NULL CHECK (length(body) BETWEEN 1 AND 2000),
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
) STRICT;
CREATE INDEX notes_user ON notes(user_id, created_at);

CREATE TABLE audit_log (                                   -- no foreign keys: entries outlive users
  id              INTEGER PRIMARY KEY,
  at              INTEGER NOT NULL,
  actor_id        TEXT,                                    -- users.id of the admin/user; NULL for env/cli/system
  actor_label     TEXT NOT NULL,                           -- public id, or 'env', 'cli', 'system'
  action          TEXT NOT NULL,
  target_type     TEXT CHECK (target_type IN ('user', 'grant', 'promo_code', 'price', 'settings', 'note', 'store_event')),
  target_id       TEXT,
  target_user_id  TEXT,                                    -- the user affected, for per-user history
  target_label    TEXT,                                    -- SW-…, promo code, country key, settings keys
  details         TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(details)),
  ip              TEXT,
  request_id      TEXT
) STRICT;
CREATE INDEX audit_log_at          ON audit_log(at);
CREATE INDEX audit_log_target_user ON audit_log(target_user_id, at);
CREATE INDEX audit_log_actor       ON audit_log(actor_id, at);
CREATE INDEX audit_log_action      ON audit_log(action, at);
-- Append-only, except the GDPR scrub (4.10), which may only replace details with {"scrubbed":true}.
CREATE TRIGGER audit_log_append_only BEFORE UPDATE ON audit_log
WHEN NOT (NEW.details = '{"scrubbed":true}' AND NEW.id = OLD.id AND NEW.at = OLD.at AND NEW.action = OLD.action
          AND NEW.actor_label = OLD.actor_label AND NEW.actor_id IS OLD.actor_id
          AND NEW.target_type IS OLD.target_type AND NEW.target_id IS OLD.target_id
          AND NEW.target_user_id IS OLD.target_user_id AND NEW.target_label IS OLD.target_label
          AND NEW.ip IS OLD.ip AND NEW.request_id IS OLD.request_id)
BEGIN
  SELECT RAISE(ABORT, 'audit_log is append-only');
END;

CREATE TABLE settings (                                    -- only values that differ from the defaults (6.5)
  key         TEXT PRIMARY KEY,
  value       TEXT NOT NULL CHECK (json_valid(value)),
  updated_at  INTEGER NOT NULL,
  updated_by  TEXT REFERENCES users(id) ON DELETE SET NULL
) STRICT;

CREATE TABLE country_prices (                              -- admin overrides of src/lib/pricing.ts BUILTIN_PRICES
  country         TEXT PRIMARY KEY CHECK (country IN ('DEFAULT', 'EU') OR country GLOB '[A-Z][A-Z]'),
  currency        TEXT NOT NULL CHECK (currency GLOB '[A-Z][A-Z][A-Z]'),
  monthly_minor   INTEGER NOT NULL CHECK (monthly_minor BETWEEN 1 AND 100000000),
  yearly_minor    INTEGER NOT NULL CHECK (yearly_minor BETWEEN 1 AND 100000000),
  lifetime_minor  INTEGER NOT NULL CHECK (lifetime_minor BETWEEN 1 AND 100000000),
  trial_days      INTEGER CHECK (trial_days IS NULL OR trial_days BETWEEN 0 AND 30),  -- NULL = setting pricing.trialDays
  format          TEXT CHECK (format IS NULL OR json_valid(format)),                  -- PriceFormat JSON; NULL = built-in/currency default
  updated_at      INTEGER NOT NULL,
  updated_by      TEXT REFERENCES users(id) ON DELETE SET NULL
) STRICT;
