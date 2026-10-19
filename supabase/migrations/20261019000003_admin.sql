-- StopWake on Supabase, part 3: the admin area (backend-spec 2.10, mirrored from server/src/domain).
--
-- Every function here starts with public.require_admin() (an active profile with role = 'admin',
-- read from the table, never from JWT claims), validates its input, and every mutation writes
-- exactly one audit row in the same transaction. Answers are the wire types of src/api/types.ts,
-- so the admin screens keep working unchanged. The end of this file sets execute privileges for
-- all three parts.

-- ---------------------------------------------------------------------------------------------
-- Small validators
-- ---------------------------------------------------------------------------------------------

/** An integer JSON number, or null (anything else, including 1.5 and "3"). */
create or replace function public.json_int(v jsonb) returns bigint
language sql immutable set search_path = public, pg_temp as $$
  select case when v is not null and jsonb_typeof(v) = 'number' and (v #>> '{}')::numeric = trunc((v #>> '{}')::numeric)
                   and abs((v #>> '{}')::numeric) < 1e15
              then (v #>> '{}')::numeric::bigint end
$$;

/** A timestamp from an ISO 8601 string, or null when it isn't one. */
create or replace function public.json_time(v jsonb) returns timestamptz
language plpgsql immutable set search_path = public, pg_temp as $$
begin
  if v is null or jsonb_typeof(v) <> 'string' or (v #>> '{}') !~ '^\d{4}-\d{2}-\d{2}T' then return null; end if;
  return (v #>> '{}')::timestamptz;
exception when others then
  return null;
end
$$;

/** The reason every admin mutation needs: 1–500 characters after trimming. Raises validation_failed. */
create or replace function public.require_reason(p text) returns text
language plpgsql immutable set search_path = public, pg_temp as $$
declare r text := btrim(coalesce(p, ''));
begin
  if r = '' then perform public.validation_failed('{"reason":"required"}'); end if;
  if char_length(r) > 500 then perform public.validation_failed('{"reason":"too_long"}'); end if;
  return r;
end
$$;

create or replace function public.is_version(v text) returns boolean
language sql immutable set search_path = public, pg_temp as $$
  select v is not null and v ~ '^\d{1,3}\.\d{1,3}\.\d{1,3}$'
$$;

create or replace function public.compare_versions(a text, b text) returns integer
language sql immutable set search_path = public, pg_temp as $$
  select case when x < y then -1 when x > y then 1 else 0 end
    from (select string_to_array(a, '.')::int[] as x, string_to_array(b, '.')::int[] as y) v
$$;

create or replace function public.is_https_url(v jsonb) returns boolean
language sql immutable set search_path = public, pg_temp as $$
  select v is not null and jsonb_typeof(v) = 'string' and char_length(v #>> '{}') between 8 and 300
     and (v #>> '{}') ~ '^https://[^\s/?#]+\.[^\s]*$'
$$;

-- ---------------------------------------------------------------------------------------------
-- Wire shapes
-- ---------------------------------------------------------------------------------------------

create or replace function public.admin_list_item_json(p public.profiles, notes_count bigint) returns jsonb
language plpgsql stable set search_path = public, pg_temp as $$
declare pro boolean := p.status = 'active' and p.plan <> 'free' and p.plan_until is not null and p.plan_until > now();
begin
  return jsonb_build_object(
    'id', p.id, 'publicId', p.public_id, 'kind', 'account', 'email', p.email, 'displayName', p.display_name,
    'role', p.role, 'status', p.status, 'country', p.country, 'language', p.language,
    'plan', case when pro then p.plan else 'free' end,
    'planSource', case when pro then p.plan_source end,
    'planExpiresAt', case when pro then public.iso(p.plan_until) end,
    'willRenew', pro and p.plan_will_renew, 'trial', pro and p.plan_trial,
    'createdAt', public.iso(p.created_at), 'lastSeenAt', public.iso(p.last_seen_at), 'notesCount', notes_count);
end
$$;

create or replace function public.admin_user_json(p public.profiles) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select public.admin_list_item_json(p, (select count(*) from public.admin_notes n where n.user_id = p.id))
    || jsonb_build_object(
      'emailVerified', p.email_verified_at is not null, 'signedUpAt', public.iso(p.created_at),
      'disabledAt', public.iso(p.disabled_at), 'disabledReason', p.disabled_reason, 'mergedInto', null,
      'passwordSet', true,
      'activeSessions', (select count(*) from auth.sessions s where s.user_id = p.id and (s.not_after is null or s.not_after > now())))
$$;

create or replace function public.admin_grant_json(g public.grants) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'kind', 'grant', 'id', g.id, 'source', g.source, 'plan', g.plan,
    'status', case when g.revoked_at is not null then 'revoked' when g.ends_at is not null and g.ends_at <= now() then 'expired' else 'active' end,
    'startsAt', public.iso(g.starts_at), 'endsAt', public.iso(g.ends_at), 'reason', g.reason,
    'promoCode', (select pc.code from public.promo_codes pc where pc.id = g.promo_code_id),
    'createdBy', public.admin_ref(g.created_by), 'createdAt', public.iso(g.created_at), 'updatedAt', public.iso(g.updated_at),
    'revokedAt', public.iso(g.revoked_at), 'revokedBy', public.admin_ref(g.revoked_by), 'revokeReason', g.revoke_reason)
$$;

create or replace function public.audit_entry_json(a public.audit_log) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'id', a.id, 'at', public.iso(a.at),
    'actor', jsonb_build_object('id', a.actor_id, 'label', a.actor_label,
                                'displayName', (select p.display_name from public.profiles p where p.id = a.actor_id)),
    'action', a.action,
    'target', jsonb_build_object('type', a.target_type, 'id', a.target_id, 'label', a.target_label),
    'userId', a.target_user_id, 'details', a.details, 'ip', null)
$$;

create or replace function public.promo_status(pc public.promo_codes) returns text
language sql stable set search_path = public, pg_temp as $$
  select case when not pc.active then 'inactive'
              when pc.expires_at is not null and pc.expires_at <= now() then 'expired'
              when pc.starts_at is not null and pc.starts_at > now() then 'scheduled'
              when pc.max_redemptions is not null and pc.redemption_count >= pc.max_redemptions then 'exhausted'
              else 'active' end
$$;

create or replace function public.promo_json(pc public.promo_codes) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'id', pc.id, 'code', pc.code, 'plan', pc.plan, 'durationDays', pc.duration_days, 'maxRedemptions', pc.max_redemptions,
    'redemptionCount', pc.redemption_count, 'startsAt', public.iso(pc.starts_at), 'expiresAt', public.iso(pc.expires_at),
    'active', pc.active, 'status', public.promo_status(pc), 'description', pc.description,
    'createdBy', public.admin_ref(pc.created_by), 'createdAt', public.iso(pc.created_at), 'updatedAt', public.iso(pc.updated_at))
$$;

create or replace function public.promo_audit_view(pc public.promo_codes) returns jsonb
language sql stable set search_path = public, pg_temp as $$
  select jsonb_build_object('plan', pc.plan, 'durationDays', pc.duration_days, 'maxRedemptions', pc.max_redemptions,
    'startsAt', public.iso(pc.starts_at), 'expiresAt', public.iso(pc.expires_at), 'active', pc.active, 'description', pc.description)
$$;

create or replace function public.store_event_json(e public.store_events) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'id', e.id, 'type', e.type, 'status', e.status, 'appUserId', e.app_user_id, 'user', public.admin_ref(e.user_id),
    'environment', e.environment, 'eventAt', public.iso(e.event_at), 'receivedAt', public.iso(e.received_at),
    'processedAt', public.iso(e.processed_at), 'error', e.error)
$$;

create or replace function public.price_override_json(c public.country_prices) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object('country', c.country, 'currency', c.currency, 'monthly', c.monthly_minor, 'yearly', c.yearly_minor,
    'lifetime', c.lifetime_minor, 'trialDays', c.trial_days, 'format', c.format,
    'updatedAt', public.iso(c.updated_at), 'updatedBy', public.admin_ref(c.updated_by))
$$;

/** Raises last_admin when p would leave the project without an active admin. */
create or replace function public.guard_last_admin(p public.profiles) returns void
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if p.role = 'admin' and p.status = 'active'
     and not exists (select 1 from public.profiles o where o.role = 'admin' and o.status = 'active' and o.id <> p.id) then
    perform public.api_error('last_admin', 409, 'This is the last admin');
  end if;
end
$$;

-- ---------------------------------------------------------------------------------------------
-- Reads
-- ---------------------------------------------------------------------------------------------

create or replace function public.admin_dashboard(p_days integer default 30) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  t timestamptz := now();
  days integer := case when p_days in (7, 30, 90) then p_days else 30 end;
  today date := (t at time zone 'UTC')::date;
  u record;
  pro record;
  total bigint;
begin
  perform public.require_admin();
  select count(*) as total, count(*) filter (where role = 'admin') as admins, count(*) filter (where status = 'disabled') as disabled,
         count(*) filter (where created_at >= today::timestamp at time zone 'UTC') as new_today,
         count(*) filter (where created_at >= t - interval '7 days') as new7, count(*) filter (where created_at >= t - interval '30 days') as new30,
         count(*) filter (where last_seen_at >= t - interval '1 day') as act1, count(*) filter (where last_seen_at >= t - interval '7 days') as act7,
         count(*) filter (where last_seen_at >= t - interval '30 days') as act30
    into u from public.profiles;
  total := u.total;
  select count(*) as n, count(*) filter (where plan_trial) as trials,
         count(*) filter (where plan_source = 'store') as s_store, count(*) filter (where plan_source = 'grant') as s_grant,
         count(*) filter (where plan_source = 'promo') as s_promo,
         count(*) filter (where plan = 'monthly') as p_monthly, count(*) filter (where plan = 'yearly') as p_yearly,
         count(*) filter (where plan = 'lifetime') as p_lifetime
    into pro from public.profiles where status = 'active' and plan_until is not null and plan_until > t;

  return jsonb_build_object(
    'generatedAt', public.iso(t),
    'users', jsonb_build_object('total', u.total, 'accounts', u.total, 'guests', 0, 'admins', u.admins, 'disabled', u.disabled,
      'new', jsonb_build_object('today', u.new_today, 'last7d', u.new7, 'last30d', u.new30),
      'active', jsonb_build_object('last1d', u.act1, 'last7d', u.act7, 'last30d', u.act30)),
    'pro', jsonb_build_object('total', pro.n,
      'share', case when total > 0 then round(pro.n::numeric / total, 4) else 0 end,
      'trials', pro.trials,
      'bySource', jsonb_build_object('store', pro.s_store, 'grant', pro.s_grant, 'promo', pro.s_promo),
      'byPlan', jsonb_build_object('monthly', pro.p_monthly, 'yearly', pro.p_yearly, 'lifetime', pro.p_lifetime)),
    'store', (select jsonb_build_object(
        'active', count(*) filter (where environment = 'production' and live),
        'renewing', count(*) filter (where environment = 'production' and live and will_renew),
        'billingIssues', count(*) filter (where environment = 'production' and live and status in ('billing_issue', 'grace_period')),
        'mrrUsd', coalesce(round(sum(case when environment = 'production' and live and status <> 'trialing' then
                    case plan when 'monthly' then coalesce(price_usd, 0) when 'yearly' then coalesce(price_usd, 0) / 12 else 0 end else 0 end), 2), 0),
        'lifetime30d', count(*) filter (where environment = 'production' and plan = 'lifetime' and status <> 'refunded' and purchased_at >= t - interval '30 days'),
        'sandboxActive', count(*) filter (where environment = 'sandbox' and live))
      from (select s.*, (s.status not in ('expired', 'refunded') and (s.expires_at is null
              or greatest(s.expires_at, coalesce(s.grace_until, '-infinity'::timestamptz)) > t)) as live
              from public.store_subscriptions s) x),
    'promo', jsonb_build_object(
      'activeCodes', (select count(*) from public.promo_codes pc where public.promo_status(pc) = 'active'),
      'redemptions30d', (select count(*) from public.promo_redemptions r where r.redeemed_at >= t - interval '30 days')),
    'signupsByDay', (select jsonb_agg(jsonb_build_object('date', to_char(d, 'YYYY-MM-DD'), 'guests', 0,
        'accounts', (select count(*) from public.profiles p where (p.created_at at time zone 'UTC')::date = d)) order by d)
      from generate_series((today - (days - 1))::timestamp, today::timestamp, interval '1 day') as g(d0), lateral (select g.d0::date as d) dd),
    'countries', coalesce((select jsonb_agg(jsonb_build_object('country', c.country, 'users', c.users, 'pro', c.pro) order by c.users desc, c.country)
      from (select country, count(*) as users,
                   count(*) filter (where status = 'active' and plan_until is not null and plan_until > t) as pro
              from public.profiles where country is not null group by country order by users desc, country limit 10) c), '[]'::jsonb),
    'appVersions', coalesce((select jsonb_agg(jsonb_build_object('version', v.app_version, 'devices', v.n) order by v.n desc, v.app_version desc)
      from (select app_version, count(*) as n from public.devices where last_seen_at >= t - interval '30 days' group by app_version) v), '[]'::jsonb),
    'webhooks', jsonb_build_object('configured', false,
      'lastEventAt', (select public.iso(max(received_at)) from public.store_events),
      'errors24h', (select count(*) from public.store_events where status = 'error' and received_at >= t - interval '1 day'),
      'unmatched7d', (select count(*) from public.store_events where status = 'unmatched' and received_at >= t - interval '7 days')),
    'recentAudit', coalesce((select jsonb_agg(public.audit_entry_json(a) order by a.id desc)
      from (select * from public.audit_log order by id desc limit 10) a), '[]'::jsonb));
end
$$;

/**
 * GET /v1/admin/users. p_query: { q, plan, source, kind, role, status, country, sort, order, limit, offset }.
 * Sort columns come from a whitelist; every value is a bound parameter.
 */
create or replace function public.admin_users(p_query jsonb default '{}'::jsonb) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  q jsonb := coalesce(p_query, '{}'::jsonb);
  v_q text := nullif(btrim(q ->> 'q'), '');
  v_plan text := q ->> 'plan';
  v_source text := q ->> 'source';
  v_kind text := q ->> 'kind';
  v_role text := q ->> 'role';
  v_status text := q ->> 'status';
  v_country text := upper(q ->> 'country');
  v_limit integer := least(greatest(coalesce(public.json_int(q -> 'limit'), 50), 1), 100);
  v_offset integer := greatest(coalesce(public.json_int(q -> 'offset'), 0), 0);
  dir text := case when q ->> 'order' = 'asc' then 'asc' else 'desc' end;
  sort_sql text;
  v_uuid uuid;
  v_pid text;
  v_like text;
  body text;
  where_sql text := 'true';
  total bigint;
  items jsonb;
  pro_sql constant text := '(u.status = ''active'' and u.plan_until is not null and u.plan_until > now())';
begin
  perform public.require_admin();
  sort_sql := case q ->> 'sort'
    when 'lastSeen' then 'u.last_seen_at'
    when 'email' then 'u.email'
    when 'planUntil' then '(case when ' || pro_sql || ' then u.plan_until end)'
    when 'publicId' then 'u.public_id'
    else 'u.created_at' end;

  if v_status = 'merged' or v_kind = 'guest' then
    return jsonb_build_object('items', '[]'::jsonb, 'total', 0, 'limit', v_limit, 'offset', v_offset);
  end if;
  if v_status in ('active', 'disabled') then where_sql := where_sql || ' and u.status = $1'; end if;
  if v_role in ('user', 'admin') then where_sql := where_sql || ' and u.role = $2'; end if;
  if v_country ~ '^[A-Z]{2}$' then where_sql := where_sql || ' and u.country = $3'; end if;
  if v_plan = 'pro' then where_sql := where_sql || ' and ' || pro_sql;
  elsif v_plan = 'free' then where_sql := where_sql || ' and not ' || pro_sql;
  elsif v_plan = 'trial' then where_sql := where_sql || ' and ' || pro_sql || ' and u.plan_trial';
  elsif v_plan in ('monthly', 'yearly', 'lifetime') then where_sql := where_sql || ' and ' || pro_sql || ' and u.plan = $4';
  end if;
  if v_source in ('store', 'grant', 'promo') then where_sql := where_sql || ' and ' || pro_sql || ' and u.plan_source = $5'; end if;

  if v_q is not null then
    v_like := '%' || replace(replace(replace(v_q, '\', '\\'), '%', '\%'), '_', '\_') || '%';
    if v_q ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      v_uuid := lower(v_q)::uuid;
      where_sql := where_sql || ' and u.id = $6';
    elsif v_q ~* '^gpa\.' then
      v_like := replace(replace(replace(v_q, '\', '\\'), '%', '\%'), '_', '\_') || '%';
      where_sql := where_sql || ' and u.id in (select s.user_id from public.store_subscriptions s where s.original_transaction_id like $8)';
    else
      if v_q ~* '^sw[\s-]*[0-9a-z][0-9a-z\s-]*$' then
        body := substr(translate(regexp_replace(upper(v_q), '[^A-Z0-9]', '', 'g'), 'OIL', '011'), 3);
        if char_length(body) between 4 and 8 and body ~ '^[0-9A-HJKMNP-TV-Z]+$' then
          v_pid := 'SW-' || substr(body, 1, 4) || case when char_length(body) > 4 then '-' || substr(body, 5) else '' end
                   || case when char_length(body) = 8 then '' else '%' end;
        end if;
      elsif v_q ~* '^[0-9a-z]{4}-?[0-9a-z]{4}$' then
        v_pid := public.normalize_public_id(v_q);
      end if;
      if v_pid is not null then
        where_sql := where_sql || ' and (u.public_id like $7 or u.email ilike $8 or u.display_name ilike $8)';
      elsif position('@' in v_q) > 0 then
        where_sql := where_sql || ' and u.email ilike $8';
      else
        where_sql := where_sql || ' and (u.email ilike $8 or u.display_name ilike $8)';
      end if;
    end if;
  end if;

  execute format('select count(*) from public.profiles u where %s', where_sql)
    into total using v_status, v_role, v_country, v_plan, v_source, v_uuid, v_pid, v_like;
  execute format(
    'select coalesce(jsonb_agg(public.admin_list_item_json(r, r_notes) order by r_ord), ''[]''::jsonb) from (
       select u as r, (select count(*) from public.admin_notes n where n.user_id = u.id) as r_notes,
              row_number() over (order by %1$s %2$s nulls last, u.created_at %2$s, u.id %2$s) as r_ord
         from public.profiles u where %3$s
        order by %1$s %2$s nulls last, u.created_at %2$s, u.id %2$s limit $9 offset $10) x',
    sort_sql, dir, where_sql)
    into items using v_status, v_role, v_country, v_plan, v_source, v_uuid, v_pid, v_like, v_limit, v_offset;
  return jsonb_build_object('items', items, 'total', total, 'limit', v_limit, 'offset', v_offset);
end
$$;

/** GET /v1/admin/users/:id: the AdminUserDetail. */
create or replace function public.admin_user(p_ref text) returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare p public.profiles;
begin
  perform public.require_admin();
  p := public.find_profile(p_ref);
  return jsonb_build_object(
    'user', public.admin_user_json(p),
    'plan', public.plan_json(p.id),
    'grants', coalesce((select jsonb_agg(public.admin_grant_json(g) order by g.created_at desc, g.id desc)
      from public.grants g where g.user_id = p.id), '[]'::jsonb),
    'storeSubscriptions', coalesce((select jsonb_agg(jsonb_build_object(
        'kind', 'store', 'id', s.id, 'store', s.store, 'environment', s.environment, 'productId', s.product_id, 'plan', s.plan,
        'status', case when s.status in ('expired', 'refunded') then s.status
                       when s.expires_at is not null and greatest(s.expires_at, coalesce(s.grace_until, '-infinity'::timestamptz)) <= now() then 'expired'
                       else s.status end,
        'periodType', s.period_type, 'willRenew', s.will_renew, 'purchasedAt', public.iso(s.purchased_at),
        'expiresAt', public.iso(s.expires_at), 'graceUntil', public.iso(s.grace_until), 'cancelReason', s.cancel_reason,
        'originalTransactionId', s.original_transaction_id, 'country', s.country, 'currency', s.currency,
        'priceLocal', s.price_local, 'priceUsd', s.price_usd, 'lastEventType', s.last_event_type,
        'lastEventAt', public.iso(s.last_event_at)) order by s.purchased_at desc)
      from public.store_subscriptions s where s.user_id = p.id), '[]'::jsonb),
    'devices', coalesce((select jsonb_agg(jsonb_build_object(
        'id', d.id, 'platform', d.platform, 'appVersion', d.app_version, 'build', d.build, 'osVersion', d.os_version,
        'country', d.country, 'language', d.language, 'createdAt', public.iso(d.created_at), 'lastSeenAt', public.iso(d.last_seen_at),
        'activeSessions', 0) order by d.last_seen_at desc)
      from public.devices d where d.user_id = p.id), '[]'::jsonb),
    'redemptions', coalesce((select jsonb_agg(jsonb_build_object(
        'promoCodeId', r.promo_code_id, 'code', pc.code, 'redeemedAt', public.iso(r.redeemed_at), 'grantId', r.grant_id,
        'grantStatus', case when g.id is null then null when g.revoked_at is not null then 'revoked'
                            when g.ends_at is not null and g.ends_at <= now() then 'expired' else 'active' end)
        order by r.redeemed_at desc, r.id desc)
      from public.promo_redemptions r join public.promo_codes pc on pc.id = r.promo_code_id
      left join public.grants g on g.id = r.grant_id where r.user_id = p.id), '[]'::jsonb),
    'notes', coalesce((select jsonb_agg(jsonb_build_object('id', n.id, 'body', n.body, 'author', public.admin_ref(n.author_id),
        'createdAt', public.iso(n.created_at), 'updatedAt', public.iso(n.updated_at)) order by n.created_at desc, n.id desc)
      from public.admin_notes n where n.user_id = p.id), '[]'::jsonb),
    'audit', coalesce((select jsonb_agg(public.audit_entry_json(a) order by a.id desc)
      from (select * from public.audit_log where target_user_id = p.id order by id desc limit 20) a), '[]'::jsonb),
    'storeEvents', coalesce((select jsonb_agg(public.store_event_json(e) order by e.received_at desc, e.id desc)
      from (select * from public.store_events where user_id = p.id order by received_at desc, id desc limit 10) e), '[]'::jsonb));
end
$$;

-- ---------------------------------------------------------------------------------------------
-- A user
-- ---------------------------------------------------------------------------------------------

/** PATCH /v1/admin/users/:id: displayName, country, language. Email changes happen in Supabase Auth. */
create or replace function public.admin_update_user(p_ref text, p_body jsonb) returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  p public.profiles;
  b jsonb := coalesce(p_body, '{}'::jsonb);
  fields jsonb := '{}'::jsonb;
  name text; lang text; ctry text;
  before jsonb; after jsonb;
begin
  perform public.require_admin();
  p := public.find_profile(p_ref);
  name := p.display_name; lang := p.language; ctry := p.country;
  if b ? 'email' then fields := fields || '{"email":"not_allowed"}'; end if;
  if b ? 'displayName' then
    if jsonb_typeof(b -> 'displayName') = 'null' then name := null;
    elsif jsonb_typeof(b -> 'displayName') <> 'string' then fields := fields || '{"displayName":"invalid"}';
    else
      name := nullif(btrim(b ->> 'displayName'), '');
      if char_length(name) > 60 then fields := fields || '{"displayName":"too_long"}'; end if;
    end if;
  end if;
  if b ? 'language' then
    if jsonb_typeof(b -> 'language') = 'null' then lang := null;
    elsif (b ->> 'language') in ('da','de','en','fi','fr','hi','it','ja','nb','nl','sv') then lang := b ->> 'language';
    else fields := fields || '{"language":"invalid"}';
    end if;
  end if;
  if b ? 'country' then
    if jsonb_typeof(b -> 'country') = 'null' then ctry := null;
    elsif (b ->> 'country') ~ '^[A-Z]{2}$' then ctry := b ->> 'country';
    else fields := fields || '{"country":"invalid"}';
    end if;
  end if;
  if fields <> '{}'::jsonb then perform public.validation_failed(fields); end if;
  before := jsonb_build_object('displayName', p.display_name is not null, 'country', p.country, 'language', p.language);
  update public.profiles set display_name = name, language = lang, country = ctry where id = p.id returning * into p;
  after := jsonb_build_object('displayName', p.display_name is not null, 'country', p.country, 'language', p.language);
  perform public.write_audit('user.update', 'user', p.id::text, p.id, p.public_id, jsonb_build_object('before', before, 'after', after));
  return jsonb_build_object('user', public.admin_user_json(p));
end
$$;

/** DELETE /v1/admin/users/:id: confirm = the user's public id. Deletes the auth user (everything cascades). */
create or replace function public.admin_delete_user(p_ref text, p_confirm text, p_reason text) returns void
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  me uuid := public.require_admin();
  p public.profiles := public.find_profile(p_ref);
  reason text := public.require_reason(p_reason);
begin
  if p.id = me then perform public.api_error('cannot_target_self', 409, 'Delete your own account from the Account tab'); end if;
  if public.normalize_public_id(p_confirm) is distinct from p.public_id then
    perform public.api_error('confirm_mismatch', 400, 'Type the public id to confirm');
  end if;
  perform public.guard_last_admin(p);
  update public.audit_log set details = '{"scrubbed": true}'::jsonb
   where target_user_id = p.id and details <> '{"scrubbed": true}'::jsonb;
  perform public.write_audit('user.delete', 'user', p.id::text, p.id, p.public_id, jsonb_build_object('reason', reason));
  delete from auth.users where id = p.id;
end
$$;

/** Ends of a monthly or yearly grant: durationDays (1–3650) or endsAt (now + 1 h … + 10 y); lifetime takes neither. */
create or replace function public.resolve_grant_end(p_plan text, p_body jsonb) returns timestamptz
language plpgsql stable set search_path = public, pg_temp as $$
declare
  has_days boolean := p_body ? 'durationDays' and jsonb_typeof(p_body -> 'durationDays') <> 'null';
  has_end boolean := p_body ? 'endsAt' and jsonb_typeof(p_body -> 'endsAt') <> 'null';
  days bigint := public.json_int(p_body -> 'durationDays');
  ends timestamptz := public.json_time(p_body -> 'endsAt');
begin
  if p_plan = 'lifetime' then
    if has_days then perform public.validation_failed('{"durationDays":"not_allowed"}'); end if;
    if has_end then perform public.validation_failed('{"endsAt":"not_allowed"}'); end if;
    return null;
  end if;
  if has_days and has_end then perform public.validation_failed('{"endsAt":"not_allowed"}'); end if;
  if has_end then
    if ends is null then perform public.validation_failed('{"endsAt":"invalid_date"}'); end if;
    if ends <= now() then perform public.validation_failed('{"endsAt":"in_past"}'); end if;
    if ends <= now() + interval '1 hour' or ends > now() + interval '3653 days' then
      perform public.validation_failed('{"endsAt":"out_of_range"}');
    end if;
    return ends;
  end if;
  if has_days then
    if days is null then perform public.validation_failed('{"durationDays":"invalid"}'); end if;
    if days < 1 or days > 3650 then perform public.validation_failed('{"durationDays":"out_of_range"}'); end if;
    return now() + make_interval(days => days::int);
  end if;
  return now() + make_interval(days => case p_plan when 'monthly' then 30 else 365 end);
end
$$;

create or replace function public.require_paid_plan(p jsonb, p_allow_free boolean default false) returns text
language plpgsql immutable set search_path = public, pg_temp as $$
begin
  if p is null or jsonb_typeof(p) = 'null' then perform public.validation_failed('{"plan":"required"}'); end if;
  if (p #>> '{}') in ('monthly', 'yearly', 'lifetime') or (p_allow_free and (p #>> '{}') = 'free') then return p #>> '{}'; end if;
  perform public.validation_failed('{"plan":"invalid"}');
  return null;
end
$$;

/** POST /v1/admin/users/:id/grants: { plan, durationDays?, endsAt?, reason }. */
create or replace function public.admin_grant(p_ref text, p_body jsonb) returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  me uuid := public.require_admin();
  p public.profiles := public.find_profile(p_ref);
  b jsonb := coalesce(p_body, '{}'::jsonb);
  v_plan text := public.require_paid_plan(b -> 'plan');
  reason text := public.require_reason(b ->> 'reason');
  ends timestamptz := public.resolve_grant_end(v_plan, b);
  g public.grants;
begin
  insert into public.grants (user_id, plan, source, starts_at, ends_at, reason, created_by)
  values (p.id, v_plan, 'admin', now(), ends, reason, me) returning * into g;
  perform public.recompute_plan(p.id);
  perform public.write_audit('grant.create', 'grant', g.id::text, p.id, p.public_id,
    jsonb_build_object('plan', v_plan, 'endsAt', public.iso(ends), 'reason', reason));
  return jsonb_build_object('grant', public.admin_grant_json(g), 'plan', public.plan_json(p.id));
end
$$;

/** POST /v1/admin/users/:id/grants/:grantId/revoke: { reason }. */
create or replace function public.admin_revoke_grant(p_ref text, p_grant_id bigint, p_reason text) returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  me uuid := public.require_admin();
  p public.profiles := public.find_profile(p_ref);
  reason text := public.require_reason(p_reason);
  g public.grants;
begin
  select * into g from public.grants where id = p_grant_id and user_id = p.id for update;
  if g.id is null then perform public.api_error('not_found', 404, 'No such grant'); end if;
  if g.revoked_at is not null then perform public.api_error('already_revoked', 409, 'This grant is already revoked'); end if;
  update public.grants set revoked_at = now(), revoked_by = me, revoke_reason = reason, updated_at = now()
   where id = g.id returning * into g;
  perform public.recompute_plan(p.id);
  perform public.write_audit('grant.revoke', 'grant', g.id::text, p.id, p.public_id,
    jsonb_build_object('plan', g.plan, 'reason', reason));
  return jsonb_build_object('grant', public.admin_grant_json(g), 'plan', public.plan_json(p.id));
end
$$;

/**
 * POST /v1/admin/users/:id/extend: { days? | endsAt?, grantId?, plan?, reason }. Pushes the end of
 * grantId or of the active non-lifetime grant ending last; without one, creates a grant from now.
 */
create or replace function public.admin_extend(p_ref text, p_body jsonb) returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  me uuid := public.require_admin();
  p public.profiles := public.find_profile(p_ref);
  b jsonb := coalesce(p_body, '{}'::jsonb);
  reason text := public.require_reason(b ->> 'reason');
  has_days boolean := b ? 'days' and jsonb_typeof(b -> 'days') <> 'null';
  has_end boolean := b ? 'endsAt' and jsonb_typeof(b -> 'endsAt') <> 'null';
  days bigint := public.json_int(b -> 'days');
  ends timestamptz := public.json_time(b -> 'endsAt');
  grant_id bigint := public.json_int(b -> 'grantId');
  v_plan text := b ->> 'plan';
  g public.grants;
  before timestamptz;
  after timestamptz;
  created boolean := false;
begin
  if has_days = has_end then perform public.validation_failed(case when has_days then '{"endsAt":"not_allowed"}' else '{"days":"required"}' end::jsonb); end if;
  if has_days and (days is null or days < 1 or days > 3650) then perform public.validation_failed('{"days":"out_of_range"}'); end if;
  if has_end and ends is null then perform public.validation_failed('{"endsAt":"invalid_date"}'); end if;
  if v_plan is not null and v_plan not in ('monthly', 'yearly') then perform public.validation_failed('{"plan":"invalid"}'); end if;
  if b ? 'grantId' and jsonb_typeof(b -> 'grantId') <> 'null' then
    select * into g from public.grants where id = grant_id and user_id = p.id for update;
    if g.id is null then perform public.api_error('not_found', 404, 'No such grant'); end if;
    if g.revoked_at is not null then perform public.api_error('already_revoked', 409, 'This grant is revoked'); end if;
    if g.ends_at is null then perform public.api_error('already_lifetime', 409, 'A lifetime grant cannot be extended'); end if;
  else
    select * into g from public.grants
     where user_id = p.id and revoked_at is null and starts_at <= now() and ends_at is not null and ends_at > now()
     order by ends_at desc, id desc limit 1 for update;
    if g.id is null and exists (select 1 from public.grants where user_id = p.id and revoked_at is null and ends_at is null) then
      perform public.api_error('already_lifetime', 409, 'The user already has a lifetime grant');
    end if;
  end if;
  if g.id is not null then
    before := g.ends_at;
    after := case when has_days then greatest(g.ends_at, now()) + make_interval(days => days::int) else ends end;
    if after <= now() + interval '1 hour' or after > now() + interval '7303 days' then
      perform public.validation_failed(case when has_days then '{"days":"out_of_range"}' else '{"endsAt":"out_of_range"}' end::jsonb);
    end if;
    update public.grants set ends_at = after, updated_at = now() where id = g.id returning * into g;
  else
    after := case when has_days then now() + make_interval(days => days::int) else ends end;
    if after <= now() + interval '1 hour' then perform public.validation_failed('{"endsAt":"out_of_range"}'); end if;
    insert into public.grants (user_id, plan, source, starts_at, ends_at, reason, created_by)
    values (p.id, coalesce(v_plan, case when has_days and days >= 365 then 'yearly' else 'monthly' end), 'admin', now(), after, reason, me)
    returning * into g;
    created := true;
  end if;
  perform public.recompute_plan(p.id);
  perform public.write_audit('grant.extend', 'grant', g.id::text, p.id, p.public_id,
    jsonb_build_object('before', public.iso(before), 'after', public.iso(after), 'created', created, 'reason', reason));
  return jsonb_build_object('grant', public.admin_grant_json(g), 'plan', public.plan_json(p.id));
end
$$;

/** POST /v1/admin/users/:id/plan: revokes every active grant, then (unless free) adds one new grant. */
create or replace function public.admin_change_plan(p_ref text, p_body jsonb) returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  me uuid := public.require_admin();
  p public.profiles := public.find_profile(p_ref);
  b jsonb := coalesce(p_body, '{}'::jsonb);
  v_plan text := public.require_paid_plan(b -> 'plan', true);
  reason text := public.require_reason(b ->> 'reason');
  ends timestamptz;
  revoked jsonb;
  g public.grants;
  before_plan text := p.plan;
begin
  if v_plan <> 'free' then ends := public.resolve_grant_end(v_plan, b); end if;
  with r as (
    update public.grants set revoked_at = now(), revoked_by = me,
           revoke_reason = left('Replaced by plan change: ' || reason, 500), updated_at = now()
     where user_id = p.id and revoked_at is null and starts_at <= now() and (ends_at is null or ends_at > now())
     returning id)
  select coalesce(jsonb_agg(id order by id), '[]'::jsonb) into revoked from r;
  if v_plan <> 'free' then
    insert into public.grants (user_id, plan, source, starts_at, ends_at, reason, created_by)
    values (p.id, v_plan, 'admin', now(), ends, reason, me) returning * into g;
  end if;
  perform public.recompute_plan(p.id);
  perform public.write_audit('plan.change', 'user', p.id::text, p.id, p.public_id,
    jsonb_build_object('before', before_plan, 'after', v_plan, 'endsAt', public.iso(ends), 'revokedGrantIds', revoked, 'reason', reason));
  return jsonb_build_object(
    'plan', public.plan_json(p.id), 'revokedGrantIds', revoked,
    'grant', case when g.id is null then null else public.admin_grant_json(g) end,
    'warnings', case when exists (select 1 from public.plan_candidates(p.id, now()) c where c.source = 'store' and c.counts)
                     then '["store_subscription_active"]'::jsonb else '[]'::jsonb end);
end
$$;

/** POST /v1/admin/users/:id/role: { role }. The last active admin can't lose the role. */
create or replace function public.admin_set_role(p_ref text, p_role text) returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  p public.profiles;
  before text;
begin
  perform public.require_admin();
  p := public.find_profile(p_ref);
  if p_role is null or p_role not in ('user', 'admin') then perform public.validation_failed('{"role":"invalid"}'); end if;
  before := p.role;
  if p_role = 'user' then perform public.guard_last_admin(p); end if;
  if before <> p_role then
    update public.profiles set role = p_role where id = p.id returning * into p;
    perform public.write_audit('user.role', 'user', p.id::text, p.id, p.public_id, jsonb_build_object('before', before, 'after', p_role));
  end if;
  return jsonb_build_object('user', public.admin_user_json(p));
end
$$;

/** POST /v1/admin/users/:id/disable: { reason }. Signs the user out everywhere; their plan becomes free. */
create or replace function public.admin_disable(p_ref text, p_reason text) returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  me uuid := public.require_admin();
  p public.profiles := public.find_profile(p_ref);
  reason text := public.require_reason(p_reason);
  n integer;
begin
  if p.id = me then perform public.api_error('cannot_target_self', 409, 'You cannot disable yourself'); end if;
  perform public.guard_last_admin(p);
  if p.status <> 'disabled' then
    update public.profiles set status = 'disabled', disabled_at = now(), disabled_reason = reason where id = p.id returning * into p;
    delete from auth.sessions where user_id = p.id;
    get diagnostics n = row_count;
    perform public.recompute_plan(p.id);
    select * into p from public.profiles where id = p.id;
    perform public.write_audit('user.disable', 'user', p.id::text, p.id, p.public_id, jsonb_build_object('reason', reason, 'revokedSessions', n));
  end if;
  return jsonb_build_object('user', public.admin_user_json(p));
end
$$;

create or replace function public.admin_enable(p_ref text) returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare p public.profiles;
begin
  perform public.require_admin();
  p := public.find_profile(p_ref);
  if p.status = 'disabled' then
    update public.profiles set status = 'active', disabled_at = null, disabled_reason = null where id = p.id;
    perform public.recompute_plan(p.id);
    select * into p from public.profiles where id = p.id;
    perform public.write_audit('user.enable', 'user', p.id::text, p.id, p.public_id, '{}'::jsonb);
  end if;
  return jsonb_build_object('user', public.admin_user_json(p));
end
$$;

/** POST /v1/admin/users/:id/sign-out-all: ends every Supabase session (refresh tokens go with them). */
create or replace function public.admin_sign_out_all(p_ref text) returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  p public.profiles;
  n integer;
begin
  perform public.require_admin();
  p := public.find_profile(p_ref);
  delete from auth.sessions where user_id = p.id;
  get diagnostics n = row_count;
  perform public.write_audit('user.sign_out_all', 'user', p.id::text, p.id, p.public_id, jsonb_build_object('revoked', n));
  return jsonb_build_object('revoked', n);
end
$$;

/**
 * Before the app asks Supabase Auth to email a password reset code to this user (POST
 * /v1/admin/users/:id/reset-code): checks the admin, records it, and returns the address.
 */
create or replace function public.admin_reset_email(p_ref text) returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare p public.profiles;
begin
  perform public.require_admin();
  p := public.find_profile(p_ref);
  if p.email is null then perform public.api_error('not_an_account', 409, 'This user has no email address'); end if;
  perform public.write_audit('user.reset_code', 'user', p.id::text, p.id, p.public_id, jsonb_build_object('via', 'email'));
  return jsonb_build_object('email', p.email);
end
$$;

-- ---------------------------------------------------------------------------------------------
-- Notes (bodies never go into the audit log)
-- ---------------------------------------------------------------------------------------------

create or replace function public.note_json(n public.admin_notes) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object('id', n.id, 'body', n.body, 'author', public.admin_ref(n.author_id),
    'createdAt', public.iso(n.created_at), 'updatedAt', public.iso(n.updated_at))
$$;

create or replace function public.require_note_body(p text) returns text
language plpgsql immutable set search_path = public, pg_temp as $$
declare b text := btrim(coalesce(p, ''));
begin
  if b = '' then perform public.validation_failed('{"body":"required"}'); end if;
  if char_length(b) > 2000 then perform public.validation_failed('{"body":"too_long"}'); end if;
  return b;
end
$$;

create or replace function public.admin_add_note(p_ref text, p_body text) returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  me uuid := public.require_admin();
  p public.profiles := public.find_profile(p_ref);
  b text := public.require_note_body(p_body);
  n public.admin_notes;
begin
  insert into public.admin_notes (user_id, author_id, body) values (p.id, me, b) returning * into n;
  perform public.write_audit('note.create', 'note', n.id::text, p.id, p.public_id, jsonb_build_object('length', char_length(b)));
  return jsonb_build_object('note', public.note_json(n));
end
$$;

create or replace function public.admin_update_note(p_id bigint, p_body text) returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  b text;
  n public.admin_notes;
begin
  perform public.require_admin();
  b := public.require_note_body(p_body);
  update public.admin_notes set body = b, updated_at = now() where id = p_id returning * into n;
  if n.id is null then perform public.api_error('not_found', 404, 'No such note'); end if;
  perform public.write_audit('note.update', 'note', n.id::text, n.user_id, (select public_id from public.profiles where id = n.user_id),
    jsonb_build_object('length', char_length(b)));
  return jsonb_build_object('note', public.note_json(n));
end
$$;

create or replace function public.admin_delete_note(p_id bigint) returns void
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare n public.admin_notes;
begin
  perform public.require_admin();
  delete from public.admin_notes where id = p_id returning * into n;
  if n.id is null then perform public.api_error('not_found', 404, 'No such note'); end if;
  perform public.write_audit('note.delete', 'note', n.id::text, n.user_id, (select public_id from public.profiles where id = n.user_id), '{}'::jsonb);
end
$$;

-- ---------------------------------------------------------------------------------------------
-- Promo codes
-- ---------------------------------------------------------------------------------------------

create or replace function public.admin_promo_codes(p_status text default 'all', p_q text default null, p_limit integer default 50, p_offset integer default 0)
returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 100);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_like text := case when nullif(btrim(p_q), '') is null then null
                      else '%' || replace(replace(replace(btrim(p_q), '\', '\\'), '%', '\%'), '_', '\_') || '%' end;
  total bigint;
  items jsonb;
begin
  perform public.require_admin();
  select count(*) into total from public.promo_codes pc
   where (coalesce(p_status, 'all') = 'all' or public.promo_status(pc) = p_status)
     and (v_like is null or pc.code ilike v_like or pc.description ilike v_like);
  select coalesce(jsonb_agg(public.promo_json(x) order by x.created_at desc, x.id desc), '[]'::jsonb) into items from (
    select * from public.promo_codes pc
     where (coalesce(p_status, 'all') = 'all' or public.promo_status(pc) = p_status)
       and (v_like is null or pc.code ilike v_like or pc.description ilike v_like)
     order by pc.created_at desc, pc.id desc limit v_limit offset v_offset) x;
  return jsonb_build_object('items', items, 'total', total, 'limit', v_limit, 'offset', v_offset);
end
$$;

create or replace function public.admin_promo_code(p_id bigint) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare pc public.promo_codes;
begin
  perform public.require_admin();
  select * into pc from public.promo_codes where id = p_id;
  if pc.id is null then perform public.api_error('not_found', 404, 'No such code'); end if;
  return jsonb_build_object('promoCode', public.promo_json(pc),
    'redemptions', coalesce((select jsonb_agg(jsonb_build_object(
        'user', jsonb_build_object('id', u.id, 'publicId', u.public_id, 'displayName', u.display_name, 'email', u.email),
        'redeemedAt', public.iso(r.redeemed_at), 'grantId', r.grant_id,
        'grantStatus', case when g.id is null then null when g.revoked_at is not null then 'revoked'
                            when g.ends_at is not null and g.ends_at <= now() then 'expired' else 'active' end)
        order by r.redeemed_at desc, r.id desc)
      from (select * from public.promo_redemptions where promo_code_id = pc.id order by redeemed_at desc, id desc limit 100) r
      join public.profiles u on u.id = r.user_id left join public.grants g on g.id = r.grant_id), '[]'::jsonb));
end
$$;

/**
 * Validates PromoCreateRequest / PromoUpdateRequest into a promo_codes row (existing = the row
 * being updated, or null). Raises validation_failed with every bad field.
 */
create or replace function public.promo_from_body(b jsonb, existing public.promo_codes) returns public.promo_codes
language plpgsql stable set search_path = public, pg_temp as $$
declare
  r public.promo_codes := existing;
  fields jsonb := '{}'::jsonb;
  creating boolean := existing.id is null;
  v_code text;
  plan_changes boolean;
  n bigint;
begin
  if b is null or jsonb_typeof(b) <> 'object' then perform public.api_error('bad_request', 400, 'Expected an object'); end if;
  if creating and b ? 'code' and jsonb_typeof(b -> 'code') <> 'null' then
    if jsonb_typeof(b -> 'code') <> 'string' then fields := fields || '{"code":"invalid"}';
    else
      v_code := public.normalize_promo_code(b ->> 'code');
      if char_length(v_code) < 4 then fields := fields || '{"code":"too_short"}';
      elsif char_length(v_code) > 32 then fields := fields || '{"code":"too_long"}';
      else r.code := v_code;
      end if;
    end if;
  end if;
  if b ? 'plan' then
    if (b ->> 'plan') in ('monthly', 'yearly', 'lifetime') then
      plan_changes := r.plan is distinct from (b ->> 'plan');
      r.plan := b ->> 'plan';
    else fields := fields || '{"plan":"invalid"}';
    end if;
  elsif creating then fields := fields || '{"plan":"required"}';
  end if;
  if b ? 'durationDays' then
    if jsonb_typeof(b -> 'durationDays') = 'null' then r.duration_days := null;
    else
      n := public.json_int(b -> 'durationDays');
      if n is null then fields := fields || '{"durationDays":"invalid"}';
      elsif n < 1 or n > 3650 then fields := fields || '{"durationDays":"out_of_range"}';
      else r.duration_days := n;
      end if;
    end if;
  elsif coalesce(plan_changes, false) then
    r.duration_days := null;
  end if;
  if b ? 'maxRedemptions' then
    if jsonb_typeof(b -> 'maxRedemptions') = 'null' then r.max_redemptions := null;
    else
      n := public.json_int(b -> 'maxRedemptions');
      if n is null then fields := fields || '{"maxRedemptions":"invalid"}';
      elsif n < 1 or n > 1000000 or n < coalesce(existing.redemption_count, 0) then fields := fields || '{"maxRedemptions":"out_of_range"}';
      else r.max_redemptions := n;
      end if;
    end if;
  end if;
  if b ? 'startsAt' then
    if jsonb_typeof(b -> 'startsAt') = 'null' then r.starts_at := null;
    elsif public.json_time(b -> 'startsAt') is null then fields := fields || '{"startsAt":"invalid_date"}';
    else r.starts_at := public.json_time(b -> 'startsAt');
    end if;
  end if;
  if b ? 'expiresAt' then
    if jsonb_typeof(b -> 'expiresAt') = 'null' then r.expires_at := null;
    elsif public.json_time(b -> 'expiresAt') is null then fields := fields || '{"expiresAt":"invalid_date"}';
    else r.expires_at := public.json_time(b -> 'expiresAt');
    end if;
  end if;
  if b ? 'description' then
    if jsonb_typeof(b -> 'description') = 'null' then r.description := '';
    elsif jsonb_typeof(b -> 'description') <> 'string' then fields := fields || '{"description":"invalid"}';
    elsif char_length(btrim(b ->> 'description')) > 200 then fields := fields || '{"description":"too_long"}';
    else r.description := btrim(b ->> 'description');
    end if;
  end if;
  if b ? 'active' then
    if jsonb_typeof(b -> 'active') = 'boolean' then r.active := (b ->> 'active')::boolean;
    else fields := fields || '{"active":"invalid"}';
    end if;
  end if;
  if r.plan = 'lifetime' and r.duration_days is not null and not fields ? 'durationDays' then
    fields := fields || '{"durationDays":"not_allowed"}';
  end if;
  if r.plan in ('monthly', 'yearly') and r.duration_days is null and not fields ? 'durationDays' then
    r.duration_days := case r.plan when 'monthly' then 30 else 365 end;
  end if;
  if r.starts_at is not null and r.expires_at is not null and r.expires_at <= r.starts_at and not fields ? 'expiresAt' then
    fields := fields || '{"expiresAt":"out_of_range"}';
  end if;
  if fields <> '{}'::jsonb then perform public.validation_failed(fields); end if;
  r.description := coalesce(r.description, '');
  r.active := coalesce(r.active, true);
  return r;
end
$$;

create or replace function public.admin_create_promo(p_body jsonb) returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  me uuid := public.require_admin();
  r public.promo_codes := public.promo_from_body(p_body, null::public.promo_codes);
  custom boolean := r.code is not null;
  s text;
  attempt integer := 0;
begin
  loop
    if not custom then
      s := public.random_crockford(12);
      r.code := substr(s, 1, 4) || '-' || substr(s, 5, 4) || '-' || substr(s, 9, 4);
    end if;
    begin
      insert into public.promo_codes (code, plan, duration_days, max_redemptions, starts_at, expires_at, active, description, created_by)
      values (r.code, r.plan, r.duration_days, r.max_redemptions, r.starts_at, r.expires_at, r.active, r.description, me)
      returning * into r;
      exit;
    exception when unique_violation then
      if custom then perform public.api_error('code_taken', 409, 'This code already exists'); end if;
      attempt := attempt + 1;
      if attempt > 5 then raise; end if;
    end;
  end loop;
  perform public.write_audit('promo.create', 'promo_code', r.id::text, null, r.code, public.promo_audit_view(r));
  return jsonb_build_object('promoCode', public.promo_json(r));
end
$$;

create or replace function public.admin_update_promo(p_id bigint, p_body jsonb) returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  before public.promo_codes;
  r public.promo_codes;
begin
  perform public.require_admin();
  select * into before from public.promo_codes where id = p_id for update;
  if before.id is null then perform public.api_error('not_found', 404, 'No such code'); end if;
  r := public.promo_from_body(p_body, before);
  if before.redemption_count > 0 and (r.plan is distinct from before.plan or r.duration_days is distinct from before.duration_days) then
    perform public.api_error('promo_in_use', 409, 'Plan and duration cannot change after the code was redeemed');
  end if;
  update public.promo_codes set plan = r.plan, duration_days = r.duration_days, max_redemptions = r.max_redemptions,
         starts_at = r.starts_at, expires_at = r.expires_at, active = r.active, description = r.description, updated_at = now()
   where id = p_id returning * into r;
  perform public.write_audit('promo.update', 'promo_code', r.id::text, null, r.code,
    jsonb_build_object('before', public.promo_audit_view(before), 'after', public.promo_audit_view(r)));
  return jsonb_build_object('promoCode', public.promo_json(r));
end
$$;

create or replace function public.admin_delete_promo(p_id bigint) returns void
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare pc public.promo_codes;
begin
  perform public.require_admin();
  select * into pc from public.promo_codes where id = p_id for update;
  if pc.id is null then perform public.api_error('not_found', 404, 'No such code'); end if;
  if pc.redemption_count > 0 then
    perform public.api_error('promo_in_use', 409, 'Codes that were redeemed cannot be deleted; deactivate it instead');
  end if;
  delete from public.promo_codes where id = p_id;
  perform public.write_audit('promo.delete', 'promo_code', pc.id::text, null, pc.code, public.promo_audit_view(pc));
end
$$;

-- ---------------------------------------------------------------------------------------------
-- Prices (the app merges the overrides with the built-in rows of src/lib/pricing.ts)
-- ---------------------------------------------------------------------------------------------

create or replace function public.admin_prices() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform public.require_admin();
  return jsonb_build_object(
    'items', coalesce((select jsonb_agg(public.price_override_json(c) order by c.country) from public.country_prices c), '[]'::jsonb),
    'defaultTrialDays', public.setting('pricing.trialDays'));
end
$$;

/** A clean PriceFormat, or null when invalid. */
create or replace function public.valid_price_format(f jsonb) returns boolean
language sql immutable set search_path = public, pg_temp as $$
  select f is not null and jsonb_typeof(f) = 'object'
     and jsonb_typeof(f -> 'symbol') = 'string' and char_length(f ->> 'symbol') between 1 and 8
     and (f ->> 'symbol') = btrim(f ->> 'symbol') and (f ->> 'symbol') !~ '[[:cntrl:]]'
     and (f ->> 'position') in ('before', 'after')
     and jsonb_typeof(f -> 'space') = 'boolean' and jsonb_typeof(f -> 'trimWhole') = 'boolean' and jsonb_typeof(f -> 'wordSymbol') = 'boolean'
     and (f ->> 'decimal') in ('.', ',')
     and (f ->> 'group') in ('.', ',', ' ', U&'\00A0', U&'\2019') and (f ->> 'group') <> (f ->> 'decimal')
     and (f -> 'decimals') in ('0'::jsonb, '2'::jsonb)
     and (f ->> 'grouping') in ('standard', 'indian')
$$;

/**
 * PUT /v1/admin/prices/:country. p_body is the PriceUpdateRequest with `format` always set (the app
 * fills in the default format when the admin gave none); p_explicit_format = whether the admin gave
 * one (only then is it stored, so defaults keep following the built-in rows).
 */
create or replace function public.admin_put_price(p_country text, p_body jsonb, p_explicit_format boolean default false) returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  me uuid := public.require_admin();
  b jsonb := coalesce(p_body, '{}'::jsonb);
  fields jsonb := '{}'::jsonb;
  cur text := b ->> 'currency';
  m bigint := public.json_int(b -> 'monthly');
  y bigint := public.json_int(b -> 'yearly');
  l bigint := public.json_int(b -> 'lifetime');
  trial bigint;
  fmt jsonb := b -> 'format';
  before public.country_prices;
  r public.country_prices;
  warnings jsonb := '[]'::jsonb;
  k text;
begin
  if p_country is null or p_country !~ '^(EU|DEFAULT|[A-Z]{2})$' then perform public.api_error('not_found', 404, 'Unknown price key'); end if;
  if cur is null then fields := fields || '{"currency":"required"}';
  elsif cur !~ '^[A-Z]{3}$' then fields := fields || '{"currency":"invalid"}';
  end if;
  foreach k in array array['monthly', 'yearly', 'lifetime'] loop
    if not b ? k or jsonb_typeof(b -> k) = 'null' then fields := fields || jsonb_build_object(k, 'required');
    elsif public.json_int(b -> k) is null then fields := fields || jsonb_build_object(k, 'invalid');
    elsif public.json_int(b -> k) < 1 or public.json_int(b -> k) > 100000000 then fields := fields || jsonb_build_object(k, 'out_of_range');
    end if;
  end loop;
  if b ? 'trialDays' and jsonb_typeof(b -> 'trialDays') <> 'null' then
    trial := public.json_int(b -> 'trialDays');
    if trial is null then fields := fields || '{"trialDays":"invalid"}';
    elsif trial < 0 or trial > 30 then fields := fields || '{"trialDays":"out_of_range"}';
    end if;
  end if;
  if fmt is null or jsonb_typeof(fmt) = 'null' then fields := fields || '{"format":"required"}';
  elsif not public.valid_price_format(fmt) then fields := fields || '{"format":"invalid"}';
  elsif cur ~ '^[A-Z]{3}$' and (fmt -> 'decimals') <> (case when cur in ('JPY', 'KRW', 'CLP', 'VND', 'ISK') then '0' else '2' end)::jsonb then
    fields := fields || '{"format":"invalid"}';
  end if;
  if fields <> '{}'::jsonb then perform public.validation_failed(fields); end if;

  select * into before from public.country_prices where country = p_country;
  insert into public.country_prices (country, currency, monthly_minor, yearly_minor, lifetime_minor, trial_days, format, updated_at, updated_by)
  values (p_country, cur, m, y, l, trial, case when p_explicit_format then fmt end, now(), me)
  on conflict (country) do update set currency = excluded.currency, monthly_minor = excluded.monthly_minor,
    yearly_minor = excluded.yearly_minor, lifetime_minor = excluded.lifetime_minor, trial_days = excluded.trial_days,
    format = excluded.format, updated_at = excluded.updated_at, updated_by = excluded.updated_by
  returning * into r;
  if y >= 12 * m then warnings := warnings || '["yearly_not_cheaper"]'; end if;
  if l <= y then warnings := warnings || '["lifetime_not_above_yearly"]'; end if;
  perform public.write_audit('price.update', 'price', p_country, null, p_country, jsonb_build_object(
    'before', case when before.country is null then null else jsonb_build_object('currency', before.currency,
      'monthly', before.monthly_minor, 'yearly', before.yearly_minor, 'lifetime', before.lifetime_minor, 'trialDays', before.trial_days) end,
    'after', jsonb_build_object('currency', cur, 'monthly', m, 'yearly', y, 'lifetime', l, 'trialDays', trial)));
  return jsonb_build_object('item', public.price_override_json(r) || jsonb_build_object('format', fmt), 'warnings', warnings);
end
$$;

create or replace function public.admin_delete_price(p_country text) returns void
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare c public.country_prices;
begin
  perform public.require_admin();
  delete from public.country_prices where country = p_country returning * into c;
  if c.country is null then perform public.api_error('not_found', 404, 'No override for this key'); end if;
  perform public.write_audit('price.delete', 'price', c.country, null, c.country, jsonb_build_object('currency', c.currency,
    'monthly', c.monthly_minor, 'yearly', c.yearly_minor, 'lifetime', c.lifetime_minor));
end
$$;

create or replace function public.admin_reset_prices() returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare n integer;
begin
  perform public.require_admin();
  delete from public.country_prices where true;
  get diagnostics n = row_count;
  perform public.write_audit('price.reset', 'price', null, null, null, jsonb_build_object('removed', n));
  return jsonb_build_object('removed', n);
end
$$;

-- ---------------------------------------------------------------------------------------------
-- Settings (the app adds the defaults: src/api/supabase/config.ts)
-- ---------------------------------------------------------------------------------------------

/** null when v is a valid value for the key, else the FieldError. */
create or replace function public.setting_error(p_key text, v jsonb) returns text
language plpgsql immutable set search_path = public, pg_temp as $$
declare
  n bigint;
  e record;
  lang text;
  txt jsonb;
  t1 timestamptz;
  t2 timestamptz;
begin
  case p_key
    when 'limits.freeFavourites', 'pricing.trialDays', 'plan.cacheDays' then
      n := public.json_int(v);
      if n is null then return 'invalid'; end if;
      if (p_key = 'limits.freeFavourites' and (n < 0 or n > 100)) or (p_key = 'pricing.trialDays' and (n < 0 or n > 30))
         or (p_key = 'plan.cacheDays' and (n < 1 or n > 90)) then return 'out_of_range'; end if;
      return null;
    when 'auth.signUpEnabled', 'promo.redeemEnabled' then
      return case when jsonb_typeof(v) = 'boolean' then null else 'invalid' end;
    when 'app.minVersion', 'app.latestVersion' then
      return case when jsonb_typeof(v) = 'string' and public.is_version(v #>> '{}') then null else 'invalid' end;
    when 'links.privacy', 'links.terms' then
      return case when public.is_https_url(v) then null else 'invalid' end;
    when 'support.email' then
      return case when jsonb_typeof(v) = 'string' and char_length(v #>> '{}') <= 254
                   and (v #>> '{}') ~ '^[^\s@]{1,64}@[^\s@]+\.[^\s@]{2,}$' then null else 'invalid' end;
    when 'pro.features' then
      if jsonb_typeof(v) <> 'object' or (select count(*) from jsonb_object_keys(v)) <> 3 then return 'invalid'; end if;
      if jsonb_typeof(v -> 'heavyAlarm') <> 'boolean' or jsonb_typeof(v -> 'unlimitedFavourites') <> 'boolean'
         or jsonb_typeof(v -> 'offlineMap') <> 'boolean' then return 'invalid'; end if;
      return null;
    when 'store.productPlans' then
      if jsonb_typeof(v) <> 'object' then return 'invalid'; end if;
      if (select count(*) from jsonb_object_keys(v)) > 50 then return 'out_of_range'; end if;
      for e in select key, value from jsonb_each(v) loop
        if char_length(e.key) not between 1 and 100 or e.key <> btrim(e.key) or (e.value #>> '{}') not in ('monthly', 'yearly', 'lifetime')
           or jsonb_typeof(e.value) <> 'string' then return 'invalid'; end if;
      end loop;
      return null;
    when 'announcement' then
      if jsonb_typeof(v) = 'null' then return null; end if;
      if jsonb_typeof(v) <> 'object' then return 'invalid'; end if;
      if jsonb_typeof(v -> 'id') <> 'string' or (v ->> 'id') !~ '^[a-z0-9-]{1,64}$' then return 'invalid'; end if;
      if jsonb_typeof(v -> 'enabled') <> 'boolean' or jsonb_typeof(v -> 'dismissible') <> 'boolean' then return 'invalid'; end if;
      if (v ->> 'level') is null or (v ->> 'level') not in ('info', 'success', 'warning', 'critical') then return 'invalid'; end if;
      if jsonb_typeof(v -> 'texts') <> 'object' or jsonb_typeof(v #> '{texts,en}') <> 'object' then return 'invalid'; end if;
      for lang, txt in select key, value from jsonb_each(v -> 'texts') loop
        if lang not in ('da','de','en','fi','fr','hi','it','ja','nb','nl','sv') or jsonb_typeof(txt) <> 'object' then return 'invalid'; end if;
        if jsonb_typeof(txt -> 'body') <> 'string' or char_length(btrim(txt ->> 'body')) not between 1 and 280 then return 'invalid'; end if;
        if txt ? 'title' and jsonb_typeof(txt -> 'title') not in ('null', 'string') then return 'invalid'; end if;
        if jsonb_typeof(txt -> 'title') = 'string' and char_length(btrim(txt ->> 'title')) > 60 then return 'invalid'; end if;
      end loop;
      if v ? 'url' and jsonb_typeof(v -> 'url') <> 'null' and not public.is_https_url(v -> 'url') then return 'invalid'; end if;
      if v ? 'countries' and jsonb_typeof(v -> 'countries') <> 'null' then
        if jsonb_typeof(v -> 'countries') <> 'array' or jsonb_array_length(v -> 'countries') not between 1 and 250 then return 'invalid'; end if;
        if exists (select 1 from jsonb_array_elements(v -> 'countries') c where jsonb_typeof(c) <> 'string' or (c #>> '{}') !~ '^[A-Z]{2}$') then
          return 'invalid';
        end if;
      end if;
      if v ? 'minAppVersion' and jsonb_typeof(v -> 'minAppVersion') <> 'null' and not public.is_version(v ->> 'minAppVersion') then return 'invalid'; end if;
      if v ? 'maxAppVersion' and jsonb_typeof(v -> 'maxAppVersion') <> 'null' and not public.is_version(v ->> 'maxAppVersion') then return 'invalid'; end if;
      if public.is_version(v ->> 'minAppVersion') and public.is_version(v ->> 'maxAppVersion')
         and public.compare_versions(v ->> 'minAppVersion', v ->> 'maxAppVersion') > 0 then return 'invalid'; end if;
      if v ? 'startsAt' and jsonb_typeof(v -> 'startsAt') <> 'null' then
        t1 := public.json_time(v -> 'startsAt');
        if t1 is null then return 'invalid'; end if;
      end if;
      if v ? 'endsAt' and jsonb_typeof(v -> 'endsAt') <> 'null' then
        t2 := public.json_time(v -> 'endsAt');
        if t2 is null then return 'invalid'; end if;
      end if;
      if t1 is not null and t2 is not null and t2 <= t1 then return 'invalid'; end if;
      return null;
    else
      return 'unknown_key';
  end case;
end
$$;

create or replace function public.admin_settings() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform public.require_admin();
  return jsonb_build_object('items', coalesce((select jsonb_agg(jsonb_build_object('key', s.key, 'value', s.value,
      'updatedAt', public.iso(s.updated_at), 'updatedBy', public.admin_ref(s.updated_by)) order by s.key)
    from public.settings s), '[]'::jsonb));
end
$$;

/** PATCH /v1/admin/settings: { key: value | null } (null = back to the default). All or nothing. */
create or replace function public.admin_patch_settings(p_values jsonb) returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  me uuid := public.require_admin();
  e record;
  err text;
  fields jsonb := '{}'::jsonb;
  keys jsonb := '[]'::jsonb;
  before jsonb := '{}'::jsonb;
  after jsonb := '{}'::jsonb;
  summary jsonb;
begin
  if p_values is null or jsonb_typeof(p_values) <> 'object' or p_values = '{}'::jsonb then
    perform public.validation_failed('{"values":"invalid"}');
  end if;
  for e in select key, value from jsonb_each(p_values) loop
    if jsonb_typeof(e.value) = 'null' and public.setting_error(e.key, '0'::jsonb) is distinct from 'unknown_key' then continue; end if;
    err := public.setting_error(e.key, e.value);
    if err is not null then fields := fields || jsonb_build_object(e.key, err); end if;
  end loop;
  if fields <> '{}'::jsonb then perform public.validation_failed(fields); end if;
  for e in select key, value from jsonb_each(p_values) order by key loop
    summary := public.setting(e.key);
    before := before || jsonb_build_object(e.key, case when e.key = 'announcement' and jsonb_typeof(summary) = 'object'
      then jsonb_build_object('id', summary -> 'id', 'enabled', summary -> 'enabled') else summary end);
    if jsonb_typeof(e.value) = 'null' then
      delete from public.settings where key = e.key;
    else
      insert into public.settings (key, value, updated_at, updated_by) values (e.key, e.value, now(), me)
      on conflict (key) do update set value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by;
    end if;
    summary := public.setting(e.key);
    after := after || jsonb_build_object(e.key, case when e.key = 'announcement' and jsonb_typeof(summary) = 'object'
      then jsonb_build_object('id', summary -> 'id', 'enabled', summary -> 'enabled') else summary end);
    keys := keys || to_jsonb(e.key);
  end loop;
  perform public.write_audit('settings.update', 'settings', null, null,
    (select string_agg(k, ', ') from jsonb_array_elements_text(keys) k),
    jsonb_build_object('keys', keys, 'before', before, 'after', after));
  return public.admin_settings();
end
$$;

-- ---------------------------------------------------------------------------------------------
-- Audit and store events
-- ---------------------------------------------------------------------------------------------

/** GET /v1/admin/audit: { action, actor (public id or label), user (public id or uuid), before (id), limit }. */
create or replace function public.admin_audit(p_action text default null, p_actor text default null, p_user text default null,
                                              p_before bigint default null, p_limit integer default 50) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 100);
  v_actor text := coalesce(public.normalize_public_id(p_actor), nullif(btrim(p_actor), ''));
  target uuid;
  items jsonb;
  last_id bigint;
  more boolean;
begin
  perform public.require_admin();
  if nullif(btrim(p_user), '') is not null then
    if p_user ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then target := lower(p_user)::uuid;
    else
      select id into target from public.profiles where public_id = public.normalize_public_id(p_user);
      if target is null then
        -- A deleted user: their entries keep the public id as the label.
        select a.target_user_id into target from public.audit_log a
         where a.target_label = public.normalize_public_id(p_user) and a.target_user_id is not null order by a.id desc limit 1;
      end if;
      if target is null then return jsonb_build_object('items', '[]'::jsonb, 'nextBefore', null); end if;
    end if;
  end if;
  select coalesce(jsonb_agg(public.audit_entry_json(a) order by a.id desc), '[]'::jsonb), min(a.id), count(*) > v_limit
    into items, last_id, more
    from (select * from public.audit_log a
           where (nullif(btrim(p_action), '') is null or a.action = p_action or a.action like p_action || '.%')
             and (v_actor is null or a.actor_label = v_actor)
             and (target is null or a.target_user_id = target)
             and (p_before is null or a.id < p_before)
           order by a.id desc limit v_limit + 1) a;
  if more then
    items := items - (jsonb_array_length(items) - 1);
    last_id := (items -> (jsonb_array_length(items) - 1) ->> 'id')::bigint;
  end if;
  return jsonb_build_object('items', items, 'nextBefore', case when more then last_id end);
end
$$;

create or replace function public.admin_store_events(p_status text default null, p_user text default null,
                                                     p_before text default null, p_limit integer default 50) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 100);
  target uuid;
  cursor_at timestamptz;
  evs public.store_events[];
  more boolean;
begin
  perform public.require_admin();
  if nullif(btrim(p_user), '') is not null then target := (public.find_profile(p_user)).id; end if;
  if p_before is not null then select received_at into cursor_at from public.store_events where id = p_before; end if;
  select array_agg(e order by e.received_at desc, e.id desc) into evs from (
    select * from public.store_events e
     where (p_status is null or e.status = p_status) and (target is null or e.user_id = target)
       and (cursor_at is null or (e.received_at, e.id) < (cursor_at, p_before))
     order by e.received_at desc, e.id desc limit v_limit + 1) e;
  more := coalesce(array_length(evs, 1), 0) > v_limit;
  if more then evs := evs[1:v_limit]; end if;
  return jsonb_build_object(
    'items', coalesce((select jsonb_agg(public.store_event_json(r) order by ord) from unnest(evs) with ordinality as u(r, ord)), '[]'::jsonb),
    'nextBefore', case when more then evs[v_limit].id end);
end
$$;

create or replace function public.admin_store_event(p_id text) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare e public.store_events;
begin
  perform public.require_admin();
  select * into e from public.store_events where id = p_id;
  if e.id is null then perform public.api_error('not_found', 404, 'No such event'); end if;
  return jsonb_build_object('event', public.store_event_json(e), 'payload', e.payload);
end
$$;

-- ---------------------------------------------------------------------------------------------
-- Execute privileges (all three parts)
--
-- Supabase grants EXECUTE on new functions to anon and authenticated by default. Internal helpers
-- (write_audit, recompute_plan, find_profile, ...) must not be callable from the app, so start
-- from nothing and grant only the API.
-- ---------------------------------------------------------------------------------------------

revoke execute on all functions in schema public from public, anon, authenticated;

-- RLS policies call is_admin() with the caller's privileges.
grant execute on function public.is_admin() to authenticated;

-- The public config (signed out too).
grant execute on function public.public_config() to anon, authenticated;

-- The signed-in user.
grant execute on function
  public.me(jsonb), public.update_me(jsonb), public.my_plan(), public.redeem_promo(text), public.export_my_data(),
  public.sign_out_other_sessions(), public.delete_my_account(boolean), public.sync_push(text, jsonb)
  to authenticated;

-- The admin area (each function checks require_admin() itself).
grant execute on function
  public.admin_dashboard(integer), public.admin_users(jsonb), public.admin_user(text),
  public.admin_update_user(text, jsonb), public.admin_delete_user(text, text, text),
  public.admin_grant(text, jsonb), public.admin_revoke_grant(text, bigint, text), public.admin_extend(text, jsonb),
  public.admin_change_plan(text, jsonb), public.admin_set_role(text, text), public.admin_disable(text, text),
  public.admin_enable(text), public.admin_sign_out_all(text), public.admin_reset_email(text),
  public.admin_add_note(text, text), public.admin_update_note(bigint, text), public.admin_delete_note(bigint),
  public.admin_promo_codes(text, text, integer, integer), public.admin_promo_code(bigint),
  public.admin_create_promo(jsonb), public.admin_update_promo(bigint, jsonb), public.admin_delete_promo(bigint),
  public.admin_prices(), public.admin_put_price(text, jsonb, boolean), public.admin_delete_price(text), public.admin_reset_prices(),
  public.admin_settings(), public.admin_patch_settings(jsonb),
  public.admin_audit(text, text, text, bigint, integer),
  public.admin_store_events(text, text, text, integer), public.admin_store_event(text)
  to authenticated;

-- Functions created later by hand don't become callable by accident.
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;
