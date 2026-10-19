-- Demo data for a development project (never production): 12 demo accounts with plans, a promo
-- code, a note, synced favourites and audit rows, so the admin area has something to show.
--
-- Run it in the SQL editor (or `supabase db reset` runs it locally). The demo accounts have no
-- password and can't sign in; they only fill the lists. Remove them with:
--   delete from auth.users where email like '%@demo.stopwake.invalid';
-- Running it twice does nothing the second time.

do $$
declare
  names text[] := array['Anna Becker', 'Jonas Weber', 'Mia Schulz', 'Lukas Wagner', 'Sofia Rossi', 'Emma Martin',
                        'Noah Jensen', 'Ella Virtanen', 'Liam Johansson', 'Aarav Sharma', 'Yuki Tanaka', 'Lotte de Vries'];
  countries text[] := array['DE', 'DE', 'AT', 'CH', 'IT', 'FR', 'DK', 'FI', 'SE', 'IN', 'JP', 'NL'];
  langs text[] := array['de', 'de', 'de', 'de', 'it', 'fr', 'da', 'fi', 'sv', 'hi', 'ja', 'nl'];
  uid uuid;
  ids uuid[] := '{}';
  promo_id bigint;
  g_id bigint;
begin
  if exists (select 1 from auth.users where email like '%@demo.stopwake.invalid') then
    raise notice 'Demo data exists already';
    return;
  end if;

  for i in 1 .. array_length(names, 1) loop
    uid := gen_random_uuid();
    insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, raw_user_meta_data, created_at)
    values (uid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
            'demo' || i || '@demo.stopwake.invalid', now() - make_interval(days => 40 - i * 3),
            jsonb_build_object('display_name', names[i], 'language', langs[i], 'country', countries[i]),
            now() - make_interval(days => 40 - i * 3));
    update public.profiles
       set created_at = now() - make_interval(days => 40 - i * 3),
           last_seen_at = now() - make_interval(hours => i * 7)
     where id = uid;
    insert into public.devices (user_id, install_id, platform, app_version, build, os_version, country, language, last_seen_at)
    values (uid, gen_random_uuid(), 'android', case when i % 3 = 0 then '0.9.0' else '1.0.0' end, 10 + i % 3,
            (12 + i % 3)::text, countries[i], langs[i], now() - make_interval(hours => i * 7));
    ids := ids || uid;
  end loop;

  -- Plans: two admin gifts (one lifetime), one promo redemption.
  insert into public.grants (user_id, plan, source, starts_at, ends_at, reason)
  values (ids[1], 'yearly', 'admin', now() - interval '10 days', now() + interval '355 days', 'Beta tester');
  insert into public.grants (user_id, plan, source, starts_at, ends_at, reason)
  values (ids[2], 'lifetime', 'admin', now() - interval '5 days', null, 'Press');

  insert into public.promo_codes (code, plan, duration_days, max_redemptions, description)
  values ('WELCOME-2026', 'monthly', 30, 100, 'Launch newsletter') returning id into promo_id;
  insert into public.promo_codes (code, plan, duration_days, active, description)
  values ('OLD-CODE', 'monthly', 14, false, 'Switched off');
  insert into public.grants (user_id, plan, source, promo_code_id, starts_at, ends_at, reason)
  values (ids[5], 'monthly', 'promo', promo_id, now() - interval '3 days', now() + interval '27 days', 'Promo code WELCOME-2026')
  returning id into g_id;
  insert into public.promo_redemptions (promo_code_id, user_id, grant_id, redeemed_at) values (promo_id, ids[5], g_id, now() - interval '3 days');
  update public.promo_codes set redemption_count = 1 where id = promo_id;

  perform public.recompute_plan(u) from unnest(ids) as u;

  -- A disabled account, a note, synced data and a few audit rows.
  update public.profiles set status = 'disabled', disabled_at = now() - interval '1 day', disabled_reason = 'Spam' where id = ids[12];
  insert into public.admin_notes (user_id, body) values (ids[1], 'Reported the tunnel issue on line S1, fixed in 1.0.0.');
  insert into public.favourites (user_id, item_key, value, updated_at)
  values (ids[1], 'stop:de:8000105', '{"id":"stop:de:8000105","name":"Frankfurt (Main) Hbf","context":"Frankfurt am Main","latitude":50.107145,"longitude":8.663789}', now());
  insert into public.audit_log (actor_label, action, target_type, target_id, target_user_id, target_label, details)
  select 'sql', 'grant.create', 'grant', g.id::text, g.user_id, p.public_id, jsonb_build_object('plan', g.plan, 'reason', g.reason)
    from public.grants g join public.profiles p on p.id = g.user_id where g.source = 'admin';
  insert into public.audit_log (actor_label, action, target_type, target_id, target_label, details)
  values ('sql', 'promo.create', 'promo_code', promo_id::text, 'WELCOME-2026', '{"plan":"monthly","durationDays":30}');
end
$$;
