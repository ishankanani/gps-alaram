-- StopWake on Supabase, part 2: plan logic (backend-spec 3, mirrored from server/src/domain/plans.ts),
-- the signed-in user's RPCs, promo redemption, export, account deletion, sync and the public config.
--
-- Every function that reads or writes another table than the caller could through RLS is SECURITY
-- DEFINER with a fixed search_path, and works only on auth.uid()'s rows. Execute privileges are set
-- at the end of part 3.

-- ---------------------------------------------------------------------------------------------
-- Settings with their defaults (the app has the same defaults in src/api/supabase/config.ts)
-- ---------------------------------------------------------------------------------------------

create or replace function public.setting(p_key text) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(
    (select s.value from public.settings s where s.key = p_key),
    case p_key
      when 'limits.freeFavourites' then '3'::jsonb
      when 'pro.features' then '{"heavyAlarm":true,"unlimitedFavourites":true,"offlineMap":true}'::jsonb
      when 'pricing.trialDays' then '7'::jsonb
      when 'announcement' then 'null'::jsonb
      when 'support.email' then '""'::jsonb
      when 'links.privacy' then '""'::jsonb
      when 'links.terms' then '""'::jsonb
      when 'app.minVersion' then '"0.0.0"'::jsonb
      when 'app.latestVersion' then '"0.0.0"'::jsonb
      when 'auth.signUpEnabled' then 'true'::jsonb
      when 'promo.redeemEnabled' then 'true'::jsonb
      when 'plan.cacheDays' then '30'::jsonb
      when 'store.productPlans' then '{}'::jsonb
    end)
$$;

-- ---------------------------------------------------------------------------------------------
-- Entitlements and the effective plan
-- ---------------------------------------------------------------------------------------------

/**
 * Every grant and store subscription of a user as a plan candidate, best first: latest end
 * ('infinity' = lifetime), then plan rank lifetime > yearly > monthly, then source rank
 * store > grant > promo, then ref. `counts` is whether it gives Pro right now (3.2).
 */
create type public.plan_candidate as (
  ref text, source text, plan text, end_at timestamptz, will_renew boolean, trial boolean,
  status text, display_status text, starts_at timestamptz, promo_code text, store text, product_id text, counts boolean
);

create or replace function public.plan_candidates(p_user uuid, p_now timestamptz default now())
returns setof public.plan_candidate
language sql stable security definer set search_path = public, pg_temp as $$
  select c.* from (
    select 'grant:' || g.id as ref,
           case g.source when 'admin' then 'grant' else 'promo' end as source,
           g.plan,
           coalesce(g.ends_at, 'infinity'::timestamptz) as end_at,
           false as will_renew,
           false as trial,
           case when g.revoked_at is not null then 'revoked'
                when g.ends_at is not null and g.ends_at <= p_now then 'expired' else 'active' end as status,
           case when g.revoked_at is not null then 'revoked'
                when g.ends_at is not null and g.ends_at <= p_now then 'expired' else 'active' end as display_status,
           g.starts_at,
           pc.code as promo_code,
           null::text as store,
           null::text as product_id,
           (g.revoked_at is null and g.starts_at <= p_now and (g.ends_at is null or g.ends_at > p_now)) as counts
      from public.grants g left join public.promo_codes pc on pc.id = g.promo_code_id
     where g.user_id = p_user
    union all
    select 'store:' || s.id,
           'store',
           s.plan,
           case when s.expires_at is null then 'infinity'::timestamptz
                else greatest(s.expires_at, coalesce(s.grace_until, '-infinity'::timestamptz)) end,
           s.will_renew and s.status in ('active', 'trialing', 'grace_period'),
           s.status = 'trialing',
           s.status,
           case when s.status in ('expired', 'refunded') then s.status
                when s.expires_at is not null and greatest(s.expires_at, coalesce(s.grace_until, '-infinity'::timestamptz)) <= p_now then 'expired'
                else s.status end,
           s.purchased_at,
           null,
           s.store,
           s.product_id,
           (s.status not in ('expired', 'refunded') and s.environment = 'production'
            and (s.expires_at is null or greatest(s.expires_at, coalesce(s.grace_until, '-infinity'::timestamptz)) > p_now))
      from public.store_subscriptions s
     where s.user_id = p_user
  ) c
  order by c.end_at desc,
           case c.plan when 'lifetime' then 3 when 'yearly' then 2 else 1 end desc,
           case c.source when 'store' then 3 when 'grant' then 2 else 1 end desc,
           c.ref asc
$$;

/** Recomputes profiles.plan_* (call in the transaction that changed grants, subscriptions or status). */
create or replace function public.recompute_plan(p_user uuid) returns void
language plpgsql volatile security definer set search_path = public, pg_temp as $$
#variable_conflict use_variable
declare
  st text;
  b_ref text; b_source text; b_plan text; b_end timestamptz; b_renew boolean; b_trial boolean;
begin
  select status into st from public.profiles where id = p_user;
  if st is null then return; end if;
  if st = 'active' then
    select c.ref, c.source, c.plan, c.end_at, c.will_renew, c.trial
      into b_ref, b_source, b_plan, b_end, b_renew, b_trial
      from public.plan_candidates(p_user, now()) c where c.counts limit 1;
  end if;
  update public.profiles
     set plan = coalesce(b_plan, 'free'), plan_source = b_source, plan_until = b_end,
         plan_will_renew = coalesce(b_renew, false), plan_trial = coalesce(b_trial, false), plan_ref = b_ref
   where id = p_user
     and (plan, plan_source, plan_until, plan_will_renew, plan_trial, plan_ref)
         is distinct from (coalesce(b_plan, 'free'), b_source, b_end, coalesce(b_renew, false), coalesce(b_trial, false), b_ref);
end
$$;

create or replace function public.entitlement_json(c public.plan_candidate) returns jsonb
language sql immutable set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'id', c.ref, 'source', c.source, 'plan', c.plan, 'status', c.display_status,
    'startsAt', public.iso(c.starts_at), 'endsAt', public.iso(c.end_at), 'willRenew', c.will_renew,
    'promoCode', c.promo_code, 'store', c.store, 'productId', c.product_id)
$$;

/** Entitlement[]: the counting ones (p_all = false; empty unless the user is active) or every one. */
create or replace function public.entitlements_json(p_user uuid, p_all boolean default false) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
#variable_conflict use_variable
declare out jsonb := '[]'::jsonb; c public.plan_candidate; st text;
begin
  select status into st from public.profiles where id = p_user;
  if not p_all and st is distinct from 'active' then return out; end if;
  for c in select * from public.plan_candidates(p_user, now()) loop
    if p_all or c.counts then out := out || jsonb_build_array(public.entitlement_json(c)); end if;
  end loop;
  return out;
end
$$;

/** The wire EffectivePlan (3.2, 3.7). */
create or replace function public.plan_json(p_user uuid) returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
#variable_conflict use_variable
declare
  p public.profiles;
  c public.plan_candidate;
  t timestamptz := now();
  cap timestamptz;
  cache_until timestamptz;
  free jsonb;
begin
  free := jsonb_build_object('plan', 'free', 'isPro', false, 'source', null, 'status', null, 'expiresAt', null,
    'willRenew', false, 'trial', false, 'store', null, 'productId', null, 'promoCode', null,
    'checkedAt', public.iso(t), 'cacheUntil', public.iso(t));
  select * into p from public.profiles where id = p_user;
  if p.id is null or p.status <> 'active' or p.plan = 'free' or p.plan_until is null or p.plan_until <= t then
    return free;
  end if;
  select * into c from public.plan_candidates(p_user, t) x where x.ref = p.plan_ref;
  if c.ref is null or not c.counts then
    -- The columns point at a row that moved or ended: repair them and answer from the repair.
    perform public.recompute_plan(p_user);
    select * into p from public.profiles where id = p_user;
    if p.plan = 'free' then return free; end if;
    select * into c from public.plan_candidates(p_user, t) x where x.ref = p.plan_ref;
    if c.ref is null then return free; end if;
  end if;
  cap := t + make_interval(days => coalesce((public.setting('plan.cacheDays'))::int, 30));
  if not isfinite(p.plan_until) then
    cache_until := cap;
  else
    cache_until := least(cap, p.plan_until + case when p.plan_will_renew and p.plan_source = 'store'
                                                   and c.status in ('active', 'trialing') then interval '72 hours' else interval '0' end);
  end if;
  return jsonb_build_object(
    'plan', p.plan, 'isPro', true, 'source', p.plan_source, 'status', c.status,
    'expiresAt', public.iso(p.plan_until), 'willRenew', p.plan_will_renew, 'trial', p.plan_trial,
    'store', c.store, 'productId', c.product_id,
    'promoCode', case when c.source = 'promo' then c.promo_code end,
    'checkedAt', public.iso(t), 'cacheUntil', public.iso(cache_until));
end
$$;

create or replace function public.plan_response_json(p_user uuid) returns jsonb
language sql volatile security definer set search_path = public, pg_temp as $$
  select jsonb_build_object('plan', public.plan_json(p_user), 'entitlements', public.entitlements_json(p_user, false))
$$;

/** The wire User. Every profile is an account (guests live only on the phone). */
create or replace function public.user_json(p public.profiles) returns jsonb
language sql stable set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'id', p.id, 'publicId', p.public_id, 'kind', 'account', 'email', p.email,
    'emailVerified', p.email_verified_at is not null, 'displayName', p.display_name, 'role', p.role,
    'country', p.country, 'language', p.language, 'createdAt', public.iso(p.created_at),
    'signedUpAt', public.iso(p.created_at))
$$;

-- ---------------------------------------------------------------------------------------------
-- The signed-in user
-- ---------------------------------------------------------------------------------------------

/** The caller's active profile; raises unauthorized (no profile) or account_disabled. */
create or replace function public.current_profile() returns public.profiles
language plpgsql stable security definer set search_path = public, pg_temp as $$
#variable_conflict use_variable
declare p public.profiles;
begin
  if auth.uid() is null then perform public.api_error('unauthorized', 401, 'Not signed in'); end if;
  select * into p from public.profiles where id = auth.uid();
  if p.id is null then perform public.api_error('unauthorized', 401, 'No profile for this session'); end if;
  if p.status = 'disabled' then
    perform public.api_error('account_disabled', 403, 'This account is disabled',
      jsonb_build_object('details', jsonb_build_object('publicId', p.public_id, 'supportEmail', public.setting('support.email') #>> '{}')));
  end if;
  return p;
end
$$;

/**
 * GET /v1/me: { user, plan, entitlements }. With p_device ({ installId, platform, appVersion, build,
 * osVersion, country, language }) it also records the installation (invalid values are dropped).
 */
create or replace function public.me(p_device jsonb default null) returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
#variable_conflict use_variable
declare
  p public.profiles := public.current_profile();
  install uuid;
  version text;
begin
  if p.last_seen_at is null or p.last_seen_at < now() - interval '5 minutes' then
    update public.profiles set last_seen_at = now() where id = p.id;
  end if;
  if p_device is not null and jsonb_typeof(p_device) = 'object' then
    begin
      install := (p_device ->> 'installId')::uuid;
    exception when others then install := null;
    end;
    version := p_device ->> 'appVersion';
    if install is not null and version ~ '^\d{1,3}\.\d{1,3}\.\d{1,3}$' and (p_device ->> 'platform') in ('android', 'ios') then
      insert into public.devices (user_id, install_id, platform, app_version, build, os_version, country, language)
      values (p.id, install, p_device ->> 'platform', version,
              case when (p_device ->> 'build') ~ '^\d{1,9}$' then (p_device ->> 'build')::int end,
              left(p_device ->> 'osVersion', 40),
              case when (p_device ->> 'country') ~ '^[A-Z]{2}$' then p_device ->> 'country' end,
              left(p_device ->> 'language', 10))
      on conflict (user_id, install_id) do update
        set platform = excluded.platform, app_version = excluded.app_version, build = excluded.build,
            os_version = excluded.os_version, country = excluded.country, language = excluded.language,
            last_seen_at = now();
    end if;
  end if;
  return jsonb_build_object('user', public.user_json(p)) || public.plan_response_json(p.id);
end
$$;

/** PATCH /v1/me for displayName, language and country (email and password go through Supabase Auth). */
create or replace function public.update_me(p_body jsonb) returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
#variable_conflict use_variable
declare
  p public.profiles := public.current_profile();
  fields jsonb := '{}'::jsonb;
  name text := p.display_name;
  lang text := p.language;
  ctry text := p.country;
begin
  if p_body is null or jsonb_typeof(p_body) <> 'object' then perform public.api_error('bad_request', 400, 'Expected an object'); end if;
  if p_body ? 'displayName' then
    if jsonb_typeof(p_body -> 'displayName') = 'null' then name := null;
    elsif jsonb_typeof(p_body -> 'displayName') <> 'string' then fields := fields || '{"displayName":"invalid"}';
    else
      name := nullif(btrim(p_body ->> 'displayName'), '');
      if name is not null and char_length(name) > 60 then fields := fields || '{"displayName":"too_long"}'; end if;
    end if;
  end if;
  if p_body ? 'language' then
    if jsonb_typeof(p_body -> 'language') = 'null' then lang := null;
    elsif (p_body ->> 'language') in ('da','de','en','fi','fr','hi','it','ja','nb','nl','sv') then lang := p_body ->> 'language';
    else fields := fields || '{"language":"invalid"}';
    end if;
  end if;
  if p_body ? 'country' then
    if jsonb_typeof(p_body -> 'country') = 'null' then ctry := null;
    elsif upper(p_body ->> 'country') ~ '^[A-Z]{2}$' then ctry := upper(p_body ->> 'country');
    else fields := fields || '{"country":"invalid"}';
    end if;
  end if;
  if fields <> '{}'::jsonb then perform public.validation_failed(fields); end if;
  update public.profiles set display_name = name, language = lang, country = ctry where id = p.id returning * into p;
  return jsonb_build_object('user', public.user_json(p));
end
$$;

/** GET /v1/plan. */
create or replace function public.my_plan() returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
#variable_conflict use_variable
declare p public.profiles := public.current_profile();
begin
  return public.plan_response_json(p.id);
end
$$;

/** Promo codes are words: NFKC, upper case, whitespace runs to '-', only A-Z 0-9 -, no double or edge '-'. */
create or replace function public.normalize_promo_code(p text) returns text
language sql immutable set search_path = public, pg_temp as $$
  select btrim(regexp_replace(regexp_replace(regexp_replace(upper(normalize(btrim(coalesce(p, '')), NFKC)),
         '\s+', '-', 'g'), '[^A-Z0-9-]', '', 'g'), '-{2,}', '-', 'g'), '-')
$$;

/** POST /v1/promo/redeem (3.4): promo days stack after the user's active gifts. */
create or replace function public.redeem_promo(p_code text) returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
#variable_conflict use_variable
declare
  p public.profiles := public.current_profile();
  v_code text := public.normalize_promo_code(p_code);
  promo public.promo_codes;
  t timestamptz := now();
  latest timestamptz;
  ends timestamptz;
  g public.grants;
  c public.plan_candidate;
begin
  if public.setting('promo.redeemEnabled') = 'false'::jsonb then
    perform public.api_error('redeem_disabled', 403, 'Redeeming codes is switched off');
  end if;
  if char_length(v_code) < 4 or char_length(v_code) > 32 then perform public.api_error('promo_invalid', 400, 'Unknown or inactive code'); end if;
  select * into promo from public.promo_codes where promo_codes.code = v_code for update;
  if promo.id is null or not promo.active or (promo.starts_at is not null and promo.starts_at > t) then
    perform public.api_error('promo_invalid', 400, 'Unknown or inactive code');
  end if;
  if promo.expires_at is not null and promo.expires_at <= t then perform public.api_error('promo_expired', 400, 'This code has expired'); end if;
  if exists (select 1 from public.promo_redemptions r where r.promo_code_id = promo.id and r.user_id = p.id) then
    perform public.api_error('promo_already_redeemed', 409, 'This code was already redeemed on this account');
  end if;
  if p.plan_until is not null and not isfinite(p.plan_until) then
    perform public.api_error('already_lifetime', 409, 'This account already has lifetime Pro');
  end if;
  if promo.max_redemptions is not null and promo.redemption_count >= promo.max_redemptions then
    perform public.api_error('promo_exhausted', 400, 'This code has been fully redeemed');
  end if;
  update public.promo_codes set redemption_count = redemption_count + 1, updated_at = t where id = promo.id;
  if promo.plan <> 'lifetime' then
    select max(ends_at) into latest from public.grants
     where user_id = p.id and revoked_at is null and starts_at <= t and ends_at > t;
    ends := greatest(t, coalesce(latest, t)) + make_interval(days => promo.duration_days);
  end if;
  insert into public.grants (user_id, plan, source, promo_code_id, starts_at, ends_at, reason, created_at, updated_at)
  values (p.id, promo.plan, 'promo', promo.id, t, ends, 'Promo code ' || promo.code, t, t)
  returning * into g;
  insert into public.promo_redemptions (promo_code_id, user_id, grant_id, redeemed_at) values (promo.id, p.id, g.id, t);
  perform public.recompute_plan(p.id);
  select * into c from public.plan_candidates(p.id, t) x where x.ref = 'grant:' || g.id;
  return public.plan_response_json(p.id) || jsonb_build_object('grant', public.entitlement_json(c));
end
$$;

/** GET /v1/me/export: everything stored about the caller, including the synced data. */
create or replace function public.export_my_data() returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
#variable_conflict use_variable
declare p public.profiles;
begin
  if auth.uid() is null then perform public.api_error('unauthorized', 401, 'Not signed in'); end if;
  select * into p from public.profiles where id = auth.uid();
  if p.id is null then perform public.api_error('unauthorized', 401, 'No profile for this session'); end if;
  return jsonb_build_object(
    'exportedAt', public.iso(now()),
    'user', public.user_json(p),
    'plan', public.plan_json(p.id),
    'entitlements', public.entitlements_json(p.id, true),
    'devices', coalesce((select jsonb_agg(jsonb_build_object('platform', d.platform, 'appVersion', d.app_version,
        'osVersion', d.os_version, 'country', d.country, 'language', d.language,
        'createdAt', public.iso(d.created_at), 'lastSeenAt', public.iso(d.last_seen_at)) order by d.created_at)
      from public.devices d where d.user_id = p.id), '[]'::jsonb),
    'promoRedemptions', coalesce((select jsonb_agg(jsonb_build_object('code', pc.code, 'redeemedAt', public.iso(r.redeemed_at)) order by r.redeemed_at)
      from public.promo_redemptions r join public.promo_codes pc on pc.id = r.promo_code_id where r.user_id = p.id), '[]'::jsonb),
    'sessions', coalesce((select jsonb_agg(jsonb_build_object('createdAt', public.iso(s.created_at),
        'lastUsedAt', public.iso(coalesce(s.updated_at, s.created_at)), 'expiresAt', public.iso(s.not_after)) order by s.created_at)
      from auth.sessions s where s.user_id = p.id), '[]'::jsonb),
    'favourites', coalesce((select jsonb_agg(f.value order by f.updated_at desc) from public.favourites f where f.user_id = p.id and not f.deleted), '[]'::jsonb),
    'recents', coalesce((select jsonb_agg(r.value order by r.updated_at desc) from public.recents r where r.user_id = p.id and not r.deleted), '[]'::jsonb),
    'trips', coalesce((select jsonb_agg(t.value order by t.updated_at desc) from public.trip_history t where t.user_id = p.id and not t.deleted), '[]'::jsonb));
end
$$;

/** Signs out the caller's other phones (POST /v1/auth/sign-out-all with keepCurrent). */
create or replace function public.sign_out_other_sessions() returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
#variable_conflict use_variable
declare
  uid uuid := auth.uid();
  current_session uuid;
  n integer;
begin
  if uid is null then perform public.api_error('unauthorized', 401, 'Not signed in'); end if;
  begin
    current_session := (auth.jwt() ->> 'session_id')::uuid;
  exception when others then current_session := null;
  end;
  delete from auth.sessions s where s.user_id = uid and s.id is distinct from current_session;
  get diagnostics n = row_count;
  return jsonb_build_object('revoked', n);
end
$$;

/**
 * DELETE /v1/me: deletes the caller's auth user, which cascades to the profile, synced data,
 * grants, redemptions and notes. The app asks for the password first (Supabase sign-in).
 * 409 last_admin; 409 subscription_active unless acknowledged.
 */
create or replace function public.delete_my_account(p_acknowledge_subscription boolean default false) returns void
language plpgsql volatile security definer set search_path = public, pg_temp as $$
#variable_conflict use_variable
declare p public.profiles;
begin
  if auth.uid() is null then perform public.api_error('unauthorized', 401, 'Not signed in'); end if;
  select * into p from public.profiles where id = auth.uid() for update;
  if p.id is null then perform public.api_error('unauthorized', 401, 'No profile for this session'); end if;
  if p.role = 'admin' and p.status = 'active'
     and not exists (select 1 from public.profiles o where o.role = 'admin' and o.status = 'active' and o.id <> p.id) then
    perform public.api_error('last_admin', 409, 'The last admin cannot delete their account');
  end if;
  if not coalesce(p_acknowledge_subscription, false) and exists (
       select 1 from public.plan_candidates(p.id, now()) c where c.source = 'store' and c.counts and c.will_renew) then
    perform public.api_error('subscription_active', 409, 'A store subscription is still renewing');
  end if;
  update public.audit_log set details = '{"scrubbed": true}'::jsonb
   where target_user_id = p.id and details <> '{"scrubbed": true}'::jsonb;
  perform public.write_audit('user.delete', 'user', p.id::text, p.id, p.public_id, jsonb_build_object('self', true));
  delete from auth.users where id = p.id;
end
$$;

-- ---------------------------------------------------------------------------------------------
-- Sync (favourites, recents, trip history): last write wins on updated_at
-- ---------------------------------------------------------------------------------------------

/**
 * Upserts the caller's items: p_items = [{ key, value, deleted, updatedAt (ms since epoch) }],
 * at most 500 per call. A row changes only when the incoming updatedAt is newer. Clocks more than
 * 5 minutes ahead are clamped to now + 5 min. SECURITY INVOKER: RLS applies.
 */
create or replace function public.sync_push(p_table text, p_items jsonb) returns jsonb
language plpgsql volatile security invoker set search_path = public, pg_temp as $$
#variable_conflict use_variable
declare n integer;
begin
  if auth.uid() is null then perform public.api_error('unauthorized', 401, 'Not signed in'); end if;
  if p_table not in ('favourites', 'recents', 'trip_history') then perform public.api_error('bad_request', 400, 'Unknown table'); end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' then perform public.api_error('bad_request', 400, 'Expected an array'); end if;
  if jsonb_array_length(p_items) > 500 then perform public.api_error('payload_too_large', 413, 'At most 500 items per call'); end if;
  execute format($sql$
    insert into public.%1$I as t (user_id, item_key, value, deleted, updated_at)
    select auth.uid(), x.key, case when coalesce(x.deleted, false) then null else x.value end, coalesce(x.deleted, false),
           least(to_timestamp(x."updatedAt" / 1000.0), now() + interval '5 minutes')
      from jsonb_to_recordset($1) as x(key text, value jsonb, deleted boolean, "updatedAt" double precision)
     where x.key is not null and x."updatedAt" is not null and (coalesce(x.deleted, false) or jsonb_typeof(x.value) = 'object')
    on conflict (user_id, item_key) do update
      set value = excluded.value, deleted = excluded.deleted, updated_at = excluded.updated_at
      where t.updated_at < excluded.updated_at
  $sql$, p_table) using p_items;
  get diagnostics n = row_count;
  return jsonb_build_object('accepted', n, 'serverTime', public.iso(now()));
end
$$;

-- ---------------------------------------------------------------------------------------------
-- Public config (the app builds RemoteConfig from it: src/api/supabase/config.ts)
-- ---------------------------------------------------------------------------------------------

create or replace function public.public_config() returns jsonb
language sql stable security invoker set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'settings', coalesce((select jsonb_object_agg(s.key, s.value) from public.settings s), '{}'::jsonb),
    'prices', coalesce((select jsonb_agg(jsonb_build_object('country', c.country, 'currency', c.currency,
        'monthly', c.monthly_minor, 'yearly', c.yearly_minor, 'lifetime', c.lifetime_minor,
        'trialDays', c.trial_days, 'format', c.format) order by c.country) from public.country_prices c), '[]'::jsonb),
    'version', md5(coalesce((select string_agg(s.key || s.value::text, '|' order by s.key) from public.settings s), '')
                || coalesce((select string_agg(c.country || c.updated_at::text, '|' order by c.country) from public.country_prices c), '')))
$$;
