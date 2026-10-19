-- StopWake on Supabase, part 1: tables, helpers, triggers and Row Level Security.
--
-- Mirrors server/src/db/migrations/0001-init.sql (the Node server stays in the repo) with Supabase
-- Auth in place of our own users/sessions: auth.users holds email + password, public.profiles
-- holds everything else. Guests have no row: the app keeps their data on the phone until they
-- create an account or sign in.
--
-- Security model
--   * RLS is enabled on every table in this file.
--   * A user reads (and for synced data, writes) only rows with user_id = auth.uid().
--   * Admins (profiles.role = 'admin' AND status = 'active', read by public.is_admin(), a SECURITY
--     DEFINER helper; JWT claims are never trusted) can read everything.
--   * Nobody but SECURITY DEFINER functions writes profiles, plans, grants, promo codes, prices,
--     settings, notes or the audit log. Admin mutations are RPCs in part 3, each checking
--     is_admin(), validating input and writing one audit row.

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------------------------
-- Profiles
-- ---------------------------------------------------------------------------------------------

create table public.profiles (
  id                uuid primary key references auth.users (id) on delete cascade,
  public_id         text not null unique
                    check (public_id ~ '^SW-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$'),
  email             text check (email is null or (email = lower(email) and length(email) between 3 and 254)),
  email_verified_at timestamptz,
  display_name      text check (display_name is null or char_length(display_name) between 1 and 60),
  country           text check (country is null or country ~ '^[A-Z]{2}$'),
  language          text check (language is null or language in ('da','de','en','fi','fr','hi','it','ja','nb','nl','sv')),
  role              text not null default 'user' check (role in ('user', 'admin')),
  status            text not null default 'active' check (status in ('active', 'disabled')),
  disabled_at       timestamptz,
  disabled_reason   text check (disabled_reason is null or char_length(disabled_reason) <= 500),
  -- Denormalized effective plan (backend-spec 1.3), recomputed by public.recompute_plan() in the
  -- same transaction as every entitlement change. 'infinity' = lifetime.
  plan              text not null default 'free' check (plan in ('free', 'monthly', 'yearly', 'lifetime')),
  plan_source       text check (plan_source in ('store', 'grant', 'promo')),
  plan_until        timestamptz,
  plan_will_renew   boolean not null default false,
  plan_trial        boolean not null default false,
  plan_ref          text check (plan_ref is null or plan_ref ~ '^(store|grant):[0-9]+$'),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  last_seen_at      timestamptz,
  check ((status = 'disabled') = (disabled_at is not null)),
  check ((plan = 'free') = (plan_source is null)),
  check ((plan = 'free') = (plan_until is null)),
  check ((plan = 'free') = (plan_ref is null))
);
create index profiles_created_at   on public.profiles (created_at);
create index profiles_last_seen_at on public.profiles (last_seen_at);
create index profiles_plan_until   on public.profiles (plan_until) where plan_until is not null;
create index profiles_country      on public.profiles (country);
create index profiles_admins       on public.profiles (role) where role = 'admin';
create index profiles_email        on public.profiles (email);

-- One row per app installation an account used (dashboard app versions, user detail).
create table public.devices (
  id            bigint generated always as identity primary key,
  user_id       uuid not null references public.profiles (id) on delete cascade,
  install_id    uuid not null,
  platform      text not null check (platform in ('android', 'ios')),
  app_version   text not null check (app_version ~ '^\d{1,3}\.\d{1,3}\.\d{1,3}$'),
  build         integer check (build is null or build between 0 and 999999999),
  os_version    text check (os_version is null or char_length(os_version) <= 40),
  country       text check (country is null or country ~ '^[A-Z]{2}$'),
  language      text check (language is null or char_length(language) <= 10),
  created_at    timestamptz not null default now(),
  last_seen_at  timestamptz not null default now(),
  unique (user_id, install_id)
);
create index devices_last_seen_at on public.devices (last_seen_at);

-- ---------------------------------------------------------------------------------------------
-- Data synced from the phone (offline-first, last write wins on updated_at)
--
-- updated_at is the phone's clock when the item last changed (the LWW clock); synced_at is set by
-- the server on every accepted write and is what phones pull incrementally. Deletions are
-- tombstones (deleted = true, value null) so they reach the other phones.
-- ---------------------------------------------------------------------------------------------

create table public.favourites (
  user_id    uuid not null references public.profiles (id) on delete cascade,
  item_key   text not null check (char_length(item_key) between 1 and 200),
  value      jsonb check (value is null or (jsonb_typeof(value) = 'object' and octet_length(value::text) <= 8192)),
  deleted    boolean not null default false,
  updated_at timestamptz not null,
  synced_at  timestamptz not null default now(),
  primary key (user_id, item_key),
  check (deleted or value is not null)
);
create index favourites_synced on public.favourites (user_id, synced_at);

create table public.recents (
  user_id    uuid not null references public.profiles (id) on delete cascade,
  item_key   text not null check (char_length(item_key) between 1 and 200),
  value      jsonb check (value is null or (jsonb_typeof(value) = 'object' and octet_length(value::text) <= 8192)),
  deleted    boolean not null default false,
  updated_at timestamptz not null,
  synced_at  timestamptz not null default now(),
  primary key (user_id, item_key),
  check (deleted or value is not null)
);
create index recents_synced on public.recents (user_id, synced_at);

create table public.trip_history (
  user_id    uuid not null references public.profiles (id) on delete cascade,
  item_key   text not null check (char_length(item_key) between 1 and 200),   -- the native trip id
  value      jsonb check (value is null or (jsonb_typeof(value) = 'object' and octet_length(value::text) <= 65536)),
  deleted    boolean not null default false,
  updated_at timestamptz not null,
  synced_at  timestamptz not null default now(),
  primary key (user_id, item_key),
  check (deleted or value is not null)
);
create index trip_history_synced on public.trip_history (user_id, synced_at);

-- ---------------------------------------------------------------------------------------------
-- Plans: promo codes, grants, store subscriptions, store events (kept for when premium launches)
-- ---------------------------------------------------------------------------------------------

create table public.promo_codes (
  id                bigint generated always as identity primary key,
  code              text not null unique check (char_length(code) between 4 and 32 and code ~ '^[A-Z0-9-]+$'),
  plan              text not null check (plan in ('monthly', 'yearly', 'lifetime')),
  duration_days     integer check (duration_days is null or duration_days between 1 and 3650),
  max_redemptions   integer check (max_redemptions is null or max_redemptions between 1 and 1000000),
  redemption_count  integer not null default 0 check (redemption_count >= 0),
  starts_at         timestamptz,
  expires_at        timestamptz,
  active            boolean not null default true,
  description       text not null default '' check (char_length(description) <= 200),
  created_by        uuid references public.profiles (id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  check ((plan = 'lifetime') = (duration_days is null)),
  check (starts_at is null or expires_at is null or expires_at > starts_at),
  check (max_redemptions is null or redemption_count <= max_redemptions)
);

create table public.grants (                       -- free Pro given by an admin or a promo code
  id             bigint generated always as identity primary key,
  user_id        uuid not null references public.profiles (id) on delete cascade,
  plan           text not null check (plan in ('monthly', 'yearly', 'lifetime')),
  source         text not null check (source in ('admin', 'promo')),
  promo_code_id  bigint references public.promo_codes (id) on delete set null,
  starts_at      timestamptz not null,
  ends_at        timestamptz,                      -- null only for lifetime
  reason         text not null check (char_length(reason) between 1 and 500),
  created_by     uuid references public.profiles (id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  revoked_at     timestamptz,
  revoked_by     uuid references public.profiles (id) on delete set null,
  revoke_reason  text,
  check ((plan = 'lifetime') = (ends_at is null)),
  check (ends_at is null or ends_at > starts_at),
  check (source = 'promo' or promo_code_id is null),
  check ((revoked_at is null) = (revoke_reason is null))
);
create index grants_user       on public.grants (user_id, revoked_at, ends_at);
create index grants_promo_code on public.grants (promo_code_id) where promo_code_id is not null;

create table public.promo_redemptions (
  id             bigint generated always as identity primary key,
  promo_code_id  bigint not null references public.promo_codes (id) on delete cascade,
  user_id        uuid not null references public.profiles (id) on delete cascade,
  grant_id       bigint references public.grants (id) on delete set null,
  redeemed_at    timestamptz not null default now(),
  unique (promo_code_id, user_id)
);
create index promo_redemptions_user      on public.promo_redemptions (user_id);
create index promo_redemptions_code_time on public.promo_redemptions (promo_code_id, redeemed_at);

-- Written by a future RevenueCat webhook (an Edge Function with the service role), never by the app.
create table public.store_subscriptions (
  id                       bigint generated always as identity primary key,
  user_id                  uuid not null references public.profiles (id) on delete cascade,
  store                    text not null check (store in ('play_store', 'app_store', 'stripe', 'amazon', 'promotional', 'test_store', 'other')),
  environment              text not null check (environment in ('production', 'sandbox')),
  product_id               text not null check (char_length(product_id) between 1 and 200),
  plan                     text not null check (plan in ('monthly', 'yearly', 'lifetime')),
  original_transaction_id  text not null check (char_length(original_transaction_id) between 1 and 200),
  rc_app_user_id           text not null,
  status                   text not null check (status in ('trialing', 'active', 'grace_period', 'billing_issue', 'paused', 'expired', 'refunded')),
  period_type              text check (period_type in ('trial', 'intro', 'normal', 'promotional', 'prepaid')),
  will_renew               boolean not null default true,
  purchased_at             timestamptz not null,
  expires_at               timestamptz,            -- null = lifetime
  grace_until              timestamptz,
  cancel_reason            text,
  country                  text,
  currency                 text,
  price_local              numeric,
  price_usd                numeric,
  last_event_id            text,
  last_event_type          text,
  last_event_at            timestamptz not null,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  unique (store, original_transaction_id),
  check (plan <> 'lifetime' or not will_renew)
);
create index store_subscriptions_user on public.store_subscriptions (user_id);

create table public.store_events (                 -- RevenueCat deliveries (empty until premium launches)
  id            text primary key check (char_length(id) between 1 and 100),
  type          text not null,
  app_user_id   text,
  user_id       uuid references public.profiles (id) on delete set null,
  environment   text,
  event_at      timestamptz,
  received_at   timestamptz not null default now(),
  processed_at  timestamptz,
  status        text not null check (status in ('processed', 'stale', 'ignored', 'unmatched', 'error')),
  error         text,
  payload       jsonb not null default '{}' check (octet_length(payload::text) <= 65536)
);
create index store_events_received_at on public.store_events (received_at);
create index store_events_user        on public.store_events (user_id, received_at);

-- ---------------------------------------------------------------------------------------------
-- Admin: notes, audit log, settings, prices
-- ---------------------------------------------------------------------------------------------

create table public.admin_notes (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  author_id   uuid references public.profiles (id) on delete set null,
  body        text not null check (char_length(body) between 1 and 2000),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index admin_notes_user on public.admin_notes (user_id, created_at);

create table public.audit_log (                    -- no foreign keys: entries outlive users
  id              bigint generated always as identity primary key,
  at              timestamptz not null default now(),
  actor_id        uuid,
  actor_label     text not null,                   -- the actor's public id, or 'system' / 'sql'
  action          text not null,
  target_type     text check (target_type in ('user', 'grant', 'promo_code', 'price', 'settings', 'note', 'store_event')),
  target_id       text,
  target_user_id  uuid,
  target_label    text,
  details         jsonb not null default '{}'::jsonb
);
create index audit_log_at          on public.audit_log (at);
create index audit_log_target_user on public.audit_log (target_user_id, at);
create index audit_log_actor       on public.audit_log (actor_id, at);
create index audit_log_action      on public.audit_log (action, at);

create table public.settings (                     -- only values that differ from the defaults
  key         text primary key check (key in (
                'limits.freeFavourites', 'pro.features', 'pricing.trialDays', 'announcement', 'support.email',
                'links.privacy', 'links.terms', 'app.minVersion', 'app.latestVersion', 'auth.signUpEnabled',
                'promo.redeemEnabled', 'plan.cacheDays', 'store.productPlans')),
  value       jsonb not null,
  updated_at  timestamptz not null default now(),
  updated_by  uuid references public.profiles (id) on delete set null
);

create table public.country_prices (               -- admin overrides of src/lib/pricing.ts BUILTIN_PRICES
  country         text primary key check (country in ('DEFAULT', 'EU') or country ~ '^[A-Z]{2}$'),
  currency        text not null check (currency ~ '^[A-Z]{3}$'),
  monthly_minor   integer not null check (monthly_minor between 1 and 100000000),
  yearly_minor    integer not null check (yearly_minor between 1 and 100000000),
  lifetime_minor  integer not null check (lifetime_minor between 1 and 100000000),
  trial_days      integer check (trial_days is null or trial_days between 0 and 30),
  format          jsonb,                           -- PriceFormat; null = the built-in/currency default
  updated_at      timestamptz not null default now(),
  updated_by      uuid references public.profiles (id) on delete set null
);

-- ---------------------------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------------------------

/** ISO 8601 in UTC with milliseconds, like the server's iso(); null for null and 'infinity'. */
create or replace function public.iso(t timestamptz) returns text
language sql immutable parallel safe set search_path = public, pg_temp as $$
  select case when t is null or not isfinite(t) then null
              else to_char(t at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') end
$$;

/**
 * Raises an API error the app maps to ApiError (src/api/supabase/errors.ts): MESSAGE is the
 * error code, DETAIL a JSON object { message, fields?, details? }, HINT the HTTP-like status.
 */
create or replace function public.api_error(p_code text, p_status integer, p_message text, p_extra jsonb default '{}'::jsonb)
returns void language plpgsql immutable set search_path = public, pg_temp as $$
begin
  raise exception using
    errcode = 'P0001',
    message = p_code,
    detail = (jsonb_build_object('message', p_message) || coalesce(p_extra, '{}'::jsonb))::text,
    hint = p_status::text;
end
$$;

create or replace function public.validation_failed(p_fields jsonb) returns void
language plpgsql immutable set search_path = public, pg_temp as $$
begin
  perform public.api_error('validation_failed', 400, 'Some fields are invalid', jsonb_build_object('fields', p_fields));
end
$$;

/** True when the caller is an active admin. Reads the table, never the JWT's claims. */
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin' and p.status = 'active')
$$;

/** Raises unauthorized / forbidden unless the caller is an active admin. */
create or replace function public.require_admin() returns uuid
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare uid uuid := auth.uid();
begin
  if uid is null then perform public.api_error('unauthorized', 401, 'Not signed in'); end if;
  if not public.is_admin() then perform public.api_error('forbidden', 403, 'Admins only'); end if;
  return uid;
end
$$;

/** 8 random Crockford base-32 characters. */
create or replace function public.random_crockford(n integer) returns text
language plpgsql volatile set search_path = public, pg_temp as $$
declare
  alphabet constant text := '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  bytes bytea := extensions.gen_random_bytes(n);
  out text := '';
begin
  for i in 0 .. n - 1 loop
    out := out || substr(alphabet, (get_byte(bytes, i) % 32) + 1, 1);
  end loop;
  return out;
end
$$;

create or replace function public.new_public_id() returns text
language plpgsql volatile set search_path = public, pg_temp as $$
declare s text;
begin
  loop
    s := public.random_crockford(8);
    s := 'SW-' || substr(s, 1, 4) || '-' || substr(s, 5, 4);
    exit when not exists (select 1 from public.profiles where public_id = s);
  end loop;
  return s;
end
$$;

/** Public id in any form people type it (sw7k3p92qx, 7K3P-92QX, SW-7K3P-92QX), or null. */
create or replace function public.normalize_public_id(p text) returns text
language plpgsql immutable set search_path = public, pg_temp as $$
declare body text;
begin
  if p is null or length(p) > 100 then return null; end if;
  body := translate(regexp_replace(upper(normalize(p, NFKC)), '[^A-Z0-9]', '', 'g'), 'OIL', '011');
  if length(body) = 10 and left(body, 2) = 'SW' then body := substr(body, 3); end if;
  if body !~ '^[0-9A-HJKMNP-TV-Z]{8}$' then return null; end if;
  return 'SW-' || substr(body, 1, 4) || '-' || substr(body, 5, 4);
end
$$;

/** The profile an admin route names: the UUID or a public id. Raises not_found. */
create or replace function public.find_profile(p_ref text) returns public.profiles
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare r public.profiles;
begin
  if p_ref ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    select * into r from public.profiles where id = lower(p_ref)::uuid;
  else
    select * into r from public.profiles where public_id = public.normalize_public_id(p_ref);
  end if;
  if r.id is null then perform public.api_error('not_found', 404, 'No such user'); end if;
  return r;
end
$$;

/** AdminRef JSON ({ id, publicId, displayName }) or null. */
create or replace function public.admin_ref(p_id uuid) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select case when p_id is null then null else
    (select jsonb_build_object('id', p.id, 'publicId', p.public_id, 'displayName', p.display_name)
       from public.profiles p where p.id = p_id) end
$$;

/** Masks email addresses in free text an admin typed (reasons), like the server's scrubText. */
create or replace function public.scrub_text(p text) returns text
language sql immutable set search_path = public, pg_temp as $$
  select regexp_replace(p, '[^\s@]+@[^\s@]+\.[^\s@]+', '[email]', 'g')
$$;

/** One audit row; actor = the caller (or 'sql' in the SQL editor). */
create or replace function public.write_audit(
  p_action text, p_target_type text, p_target_id text, p_target_user uuid, p_target_label text, p_details jsonb
) returns bigint
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  uid uuid := auth.uid();
  label text;
  new_id bigint;
  clean jsonb := coalesce(p_details, '{}'::jsonb);
begin
  select public_id into label from public.profiles where id = uid;
  if clean ? 'reason' and jsonb_typeof(clean -> 'reason') = 'string' then
    clean := jsonb_set(clean, '{reason}', to_jsonb(public.scrub_text(clean ->> 'reason')));
  end if;
  insert into public.audit_log (actor_id, actor_label, action, target_type, target_id, target_user_id, target_label, details)
  values (uid, coalesce(label, case when uid is null then 'sql' else 'system' end), p_action, p_target_type, p_target_id,
          p_target_user, p_target_label, clean)
  returning id into new_id;
  return new_id;
end
$$;

-- ---------------------------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------------------------

-- The audit log is append-only, except the GDPR scrub that replaces details with {"scrubbed":true}.
create or replace function public.audit_log_guard() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'audit_log is append-only';
  end if;
  if new.details = '{"scrubbed": true}'::jsonb and new.id = old.id and new.at = old.at and new.action = old.action
     and new.actor_label = old.actor_label and new.actor_id is not distinct from old.actor_id
     and new.target_type is not distinct from old.target_type and new.target_id is not distinct from old.target_id
     and new.target_user_id is not distinct from old.target_user_id and new.target_label is not distinct from old.target_label then
    return new;
  end if;
  raise exception 'audit_log is append-only';
end
$$;
create trigger audit_log_append_only before update or delete on public.audit_log
  for each row execute function public.audit_log_guard();

create or replace function public.touch_updated_at() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  new.updated_at := now();
  return new;
end
$$;
create trigger profiles_updated_at before update on public.profiles for each row execute function public.touch_updated_at();

-- synced_at is the server's clock of every accepted write (what phones pull incrementally).
create or replace function public.touch_synced_at() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  new.synced_at := clock_timestamp();
  return new;
end
$$;
create trigger favourites_synced_at   before insert or update on public.favourites   for each row execute function public.touch_synced_at();
create trigger recents_synced_at      before insert or update on public.recents      for each row execute function public.touch_synced_at();
create trigger trip_history_synced_at before insert or update on public.trip_history for each row execute function public.touch_synced_at();

-- A profile for every new auth user (sign-up). display_name, language and country come from the
-- sign-up metadata and are validated here; anything invalid is dropped, never fatal.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  name text := nullif(btrim(meta ->> 'display_name'), '');
  lang text := meta ->> 'language';
  ctry text := upper(meta ->> 'country');
  signup_enabled jsonb;
begin
  select value into signup_enabled from public.settings where key = 'auth.signUpEnabled';
  if signup_enabled = 'false'::jsonb then
    raise exception 'signup_disabled' using errcode = 'P0001', hint = '403';
  end if;
  if name is not null and char_length(name) > 60 then name := left(name, 60); end if;
  if lang is null or lang not in ('da','de','en','fi','fr','hi','it','ja','nb','nl','sv') then lang := null; end if;
  if ctry is null or ctry !~ '^[A-Z]{2}$' then ctry := null; end if;
  insert into public.profiles (id, public_id, email, email_verified_at, display_name, language, country)
  values (new.id, public.new_public_id(), lower(new.email), new.email_confirmed_at, name, lang, ctry);
  return new;
end
$$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Keeps the profile's copy of the email (admin search) in step with Supabase Auth.
create or replace function public.handle_user_email() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  update public.profiles
     set email = lower(new.email), email_verified_at = new.email_confirmed_at
   where id = new.id
     and (email is distinct from lower(new.email) or email_verified_at is distinct from new.email_confirmed_at);
  return new;
end
$$;
create trigger on_auth_user_email after update of email, email_confirmed_at on auth.users
  for each row execute function public.handle_user_email();

-- ---------------------------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------------------------

alter table public.profiles            enable row level security;
alter table public.devices             enable row level security;
alter table public.favourites          enable row level security;
alter table public.recents             enable row level security;
alter table public.trip_history        enable row level security;
alter table public.promo_codes         enable row level security;
alter table public.grants              enable row level security;
alter table public.promo_redemptions   enable row level security;
alter table public.store_subscriptions enable row level security;
alter table public.store_events        enable row level security;
alter table public.admin_notes         enable row level security;
alter table public.audit_log           enable row level security;
alter table public.settings            enable row level security;
alter table public.country_prices      enable row level security;

-- Table privileges: read through RLS; writes only where a policy below allows them. Everything
-- else goes through the SECURITY DEFINER functions of parts 2 and 3.
revoke all on all tables in schema public from anon, authenticated;
grant select on public.profiles, public.devices, public.favourites, public.recents, public.trip_history,
  public.promo_codes, public.grants, public.promo_redemptions, public.store_subscriptions, public.store_events,
  public.admin_notes, public.audit_log to authenticated;
grant insert, update, delete on public.favourites, public.recents, public.trip_history to authenticated;
-- Settings and prices make up the public remote config (no secrets in either).
grant select on public.settings, public.country_prices to anon, authenticated;

-- profiles: your own row; admins every row. No write policies (RPCs only).
create policy profiles_select_own   on public.profiles for select to authenticated using (id = auth.uid());
create policy profiles_select_admin on public.profiles for select to authenticated using (public.is_admin());

create policy devices_select_own   on public.devices for select to authenticated using (user_id = auth.uid());
create policy devices_select_admin on public.devices for select to authenticated using (public.is_admin());

-- Synced data: full access to your own rows; admins read (support), never write.
create policy favourites_own   on public.favourites for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy favourites_admin on public.favourites for select to authenticated using (public.is_admin());
create policy recents_own      on public.recents for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy recents_admin    on public.recents for select to authenticated using (public.is_admin());
create policy trips_own        on public.trip_history for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy trips_admin      on public.trip_history for select to authenticated using (public.is_admin());

-- Plans: users see their own grants, redemptions and subscriptions; admins see all.
create policy grants_select_own     on public.grants for select to authenticated using (user_id = auth.uid());
create policy grants_select_admin   on public.grants for select to authenticated using (public.is_admin());
create policy redemptions_own       on public.promo_redemptions for select to authenticated using (user_id = auth.uid());
create policy redemptions_admin     on public.promo_redemptions for select to authenticated using (public.is_admin());
create policy subscriptions_own     on public.store_subscriptions for select to authenticated using (user_id = auth.uid());
create policy subscriptions_admin   on public.store_subscriptions for select to authenticated using (public.is_admin());

-- Admin-only tables.
create policy promo_codes_admin  on public.promo_codes  for select to authenticated using (public.is_admin());
create policy store_events_admin on public.store_events for select to authenticated using (public.is_admin());
create policy notes_admin        on public.admin_notes  for select to authenticated using (public.is_admin());
create policy audit_admin        on public.audit_log    for select to authenticated using (public.is_admin());

-- Public config.
create policy settings_read on public.settings       for select to anon, authenticated using (true);
create policy prices_read   on public.country_prices for select to anon, authenticated using (true);
