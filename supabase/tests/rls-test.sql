-- Behaviour and Row Level Security checks, run by supabase/tests/run-local.sh against the local
-- stub (supabase/tests/local-stub.sql). Every check raises on failure.

-- Two people: alice (becomes admin) and bob.
insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
  ('11111111-1111-4111-8111-111111111111', 'Alice@Example.com', now(), '{"display_name":"Alice","language":"de","country":"de"}'),
  ('22222222-2222-4222-8222-222222222222', 'bob@example.com', null, '{"display_name":"  ","language":"xx"}');
insert into auth.sessions (user_id) values ('22222222-2222-4222-8222-222222222222'), ('22222222-2222-4222-8222-222222222222');
update public.profiles set role = 'admin' where id = '11111111-1111-4111-8111-111111111111';

create or replace function pg_temp.check(ok boolean, what text) returns void language plpgsql as $$
begin
  if not coalesce(ok, false) then raise exception 'CHECK FAILED: %', what; end if;
end $$;
grant execute on function pg_temp.check(boolean, text) to anon, authenticated;

-- Runs sql as a signed-in user and returns the error code it raised (null when it worked).
create or replace function pg_temp.err(sql text) returns text language plpgsql as $$
begin
  execute sql;
  return null;
exception when others then
  return sqlerrm;
end $$;
grant execute on function pg_temp.err(text) to anon, authenticated;

-- The sign-up trigger.
select pg_temp.check((select email = 'alice@example.com' and display_name = 'Alice' and language = 'de' and country = 'DE'
  and public_id ~ '^SW-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$' from public.profiles where id = '11111111-1111-4111-8111-111111111111'),
  'profile from sign-up metadata');
select pg_temp.check((select display_name is null and language is null from public.profiles where id = '22222222-2222-4222-8222-222222222222'),
  'invalid metadata dropped');

-- ---- bob, a normal user ----
set role authenticated;
set request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';

select pg_temp.check((select count(*) from public.profiles) = 1, 'bob sees only his profile');
select pg_temp.check(pg_temp.err($$update public.profiles set role = 'admin'$$) like '%permission denied%', 'bob cannot write profiles');
select pg_temp.check(pg_temp.err($$select public.admin_dashboard(30)$$) like '%permission denied%' or
                     pg_temp.err($$select public.admin_dashboard(30)$$) = 'forbidden', 'bob cannot read the dashboard');
select pg_temp.check(pg_temp.err($$select public.write_audit('x', null, null, null, null, '{}')$$) like '%permission denied%', 'write_audit is private');
select pg_temp.check(pg_temp.err($$select public.recompute_plan(auth.uid())$$) like '%permission denied%', 'recompute_plan is private');
select pg_temp.check(pg_temp.err($$insert into public.audit_log (actor_label, action) values ('x', 'y')$$) like '%permission denied%', 'no audit inserts');
select pg_temp.check(pg_temp.err($$insert into public.grants (user_id, plan, source, starts_at, ends_at, reason)
  values (auth.uid(), 'lifetime', 'admin', now(), null, 'me')$$) like '%permission denied%', 'no self grants');
select pg_temp.check(pg_temp.err($$insert into public.favourites (user_id, item_key, value, updated_at)
  values ('11111111-1111-4111-8111-111111111111', 'k', '{}', now())$$) like '%row-level security%', 'no rows for others');

select pg_temp.check((public.me('{"installId":"9b2f4c1e-7f43-4a55-9d7e-3b5c7e1f0a11","platform":"android","appVersion":"1.0.0","build":"12"}') #>> '{user,kind}') = 'account', 'me works');
select pg_temp.check((public.me() #>> '{plan,plan}') = 'free', 'bob is free');
select pg_temp.check((select count(*) from public.devices) = 1, 'device recorded');
select pg_temp.check((public.update_me('{"displayName":"Bob","country":"se","language":"sv"}') #>> '{user,country}') = 'SE', 'update_me');
select pg_temp.check(pg_temp.err($$select public.update_me('{"language":"xx"}')$$) = 'validation_failed', 'update_me validates');

-- Sync: last write wins.
select public.sync_push('favourites', '[{"key":"a","value":{"id":"a","name":"A"},"updatedAt":1000},{"key":"b","value":{"id":"b"},"updatedAt":1000}]');
select public.sync_push('favourites', '[{"key":"a","value":{"id":"a","name":"old"},"updatedAt":500},{"key":"b","deleted":true,"updatedAt":2000}]');
select pg_temp.check((select value ->> 'name' from public.favourites where item_key = 'a') = 'A', 'older write ignored');
select pg_temp.check((select deleted and value is null from public.favourites where item_key = 'b'), 'tombstone stored');
select pg_temp.check(pg_temp.err($$select public.sync_push('profiles', '[]')$$) = 'bad_request', 'sync table whitelist');
select pg_temp.check((public.sync_push('trip_history', '[{"key":"t1","value":{"id":"t1"},"updatedAt":99999999999999}]') ->> 'accepted')::int = 1, 'future clock clamped');
select pg_temp.check((select updated_at <= now() + interval '5 minutes' from public.trip_history where item_key = 't1'), 'clamped');

-- Sign out other phones keeps none here (no session id claim): both sessions go.
select pg_temp.check((public.sign_out_other_sessions() ->> 'revoked')::int = 2, 'sign out others');

-- Promo before any code exists.
select pg_temp.check(pg_temp.err($$select public.redeem_promo('nope')$$) = 'promo_invalid', 'unknown promo');

-- Anonymous: config only.
reset request.jwt.claim.sub;
set role anon;
select pg_temp.check(public.public_config() ? 'settings', 'anon reads config');
select pg_temp.check(pg_temp.err($$select public.me()$$) like '%permission denied%', 'anon cannot call me');
select pg_temp.check(pg_temp.err($$select count(*) from public.profiles$$) like '%permission denied%', 'anon reads no profiles');

-- ---- alice, the admin ----
set role authenticated;
set request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

select pg_temp.check((select count(*) from public.profiles) >= 2, 'admin sees all profiles');
select pg_temp.check((public.admin_dashboard(7) #>> '{users,admins}')::int = 1, 'dashboard');
select pg_temp.check((public.admin_users('{"q":"bob"}') ->> 'total')::int = 1, 'user search by name');
select pg_temp.check((public.admin_users('{"q":"bob@"}') ->> 'total')::int = 1, 'user search by email');
select pg_temp.check((public.admin_users(jsonb_build_object('q', (select public_id from public.profiles where email = 'bob@example.com'))) ->> 'total')::int = 1, 'search by public id');
select pg_temp.check((public.admin_users('{"sort":"email","order":"asc","limit":1}') #>> '{items,0,email}') = 'alice@example.com', 'sorting');

select public.admin_grant('22222222-2222-4222-8222-222222222222', '{"plan":"monthly","reason":"Thanks"}');
select pg_temp.check((select plan = 'monthly' from public.profiles where id = '22222222-2222-4222-8222-222222222222'), 'grant gives Pro');
select pg_temp.check(pg_temp.err($$select public.admin_grant('22222222-2222-4222-8222-222222222222', '{"plan":"monthly"}')$$) = 'validation_failed', 'reason required');
select pg_temp.check(pg_temp.err($$select public.admin_grant('22222222-2222-4222-8222-222222222222', '{"plan":"lifetime","durationDays":3,"reason":"x"}')$$) = 'validation_failed', 'lifetime takes no days');
select pg_temp.check((public.admin_extend('22222222-2222-4222-8222-222222222222', '{"days":10,"reason":"More"}') #>> '{plan,plan}') = 'monthly', 'extend');
select pg_temp.check(jsonb_array_length(public.admin_change_plan('22222222-2222-4222-8222-222222222222', '{"plan":"lifetime","reason":"Upgrade"}') -> 'revokedGrantIds') = 1, 'change plan revokes');
select pg_temp.check((public.admin_user('22222222-2222-4222-8222-222222222222') #>> '{plan,plan}') = 'lifetime', 'lifetime now');
select pg_temp.check((public.admin_user('22222222-2222-4222-8222-222222222222') #>> '{plan,expiresAt}') is null, 'lifetime has no end');
select pg_temp.check(pg_temp.err($$select public.admin_extend('22222222-2222-4222-8222-222222222222', '{"days":10,"reason":"x"}')$$) = 'already_lifetime', 'no extend of lifetime');
select public.admin_change_plan('22222222-2222-4222-8222-222222222222', '{"plan":"free","reason":"Back to free"}');
select pg_temp.check((select plan = 'free' from public.profiles where id = '22222222-2222-4222-8222-222222222222'), 'back to free');

-- Promo codes, and bob redeeming one.
select public.admin_create_promo('{"code":"summer 2026","plan":"monthly","durationDays":14,"maxRedemptions":1}');
select pg_temp.check(pg_temp.err($$select public.admin_create_promo('{"code":"SUMMER-2026","plan":"monthly"}')$$) = 'code_taken', 'code taken');
select pg_temp.check((public.admin_create_promo('{"plan":"yearly"}') #>> '{promoCode,code}') ~ '^[0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z]{4}$', 'generated code');
select pg_temp.check((public.admin_promo_codes('active', 'summer', 10, 0) ->> 'total')::int = 1, 'promo list');
set request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';
select pg_temp.check((public.redeem_promo(' summer  2026 ') #>> '{plan,source}') = 'promo', 'redeem');
select pg_temp.check(pg_temp.err($$select public.redeem_promo('SUMMER-2026')$$) = 'promo_already_redeemed', 'once per account');
set request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
select pg_temp.check(pg_temp.err($$select public.admin_delete_promo((select id from public.promo_codes where code = 'SUMMER-2026'))$$) = 'promo_in_use', 'used codes stay');
select pg_temp.check(pg_temp.err($$select public.admin_update_promo((select id from public.promo_codes where code = 'SUMMER-2026'), '{"durationDays":30}')$$) = 'promo_in_use', 'no plan change after use');
select pg_temp.check((public.admin_update_promo((select id from public.promo_codes where code = 'SUMMER-2026'), '{"active":false}') #>> '{promoCode,status}') = 'inactive', 'deactivate');

-- Notes, roles, disabling, prices, settings, audit.
select pg_temp.check((public.admin_add_note('22222222-2222-4222-8222-222222222222', 'Called support') #>> '{note,body}') = 'Called support', 'note');
select pg_temp.check(pg_temp.err($$select public.admin_set_role('11111111-1111-4111-8111-111111111111', 'user')$$) = 'last_admin', 'last admin guard');
select pg_temp.check(pg_temp.err($$select public.admin_disable('11111111-1111-4111-8111-111111111111', 'x')$$) = 'cannot_target_self', 'no self disable');
select pg_temp.check((public.admin_disable('22222222-2222-4222-8222-222222222222', 'Abuse') #>> '{user,status}') = 'disabled', 'disable');
set request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';
select pg_temp.check(pg_temp.err($$select public.me()$$) = 'account_disabled', 'disabled user is told');
set request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
select public.admin_enable('22222222-2222-4222-8222-222222222222');

select pg_temp.check(jsonb_array_length(public.admin_put_price('DE', '{"currency":"EUR","monthly":199,"yearly":1999,"lifetime":4999,
  "format":{"symbol":"€","position":"after","space":true,"decimal":",","group":".","decimals":2,"trimWhole":false,"grouping":"standard","wordSymbol":false}}', false) -> 'warnings') = 0, 'price');
select pg_temp.check(pg_temp.err($$select public.admin_put_price('JP', '{"currency":"JPY","monthly":300,"yearly":3000,"lifetime":9000,
  "format":{"symbol":"¥","position":"before","space":false,"decimal":".","group":",","decimals":2,"trimWhole":false,"grouping":"standard","wordSymbol":false}}', true)$$) = 'validation_failed', 'JPY has no decimals');
select pg_temp.check((select format is null from public.country_prices where country = 'DE'), 'implicit format not stored');
select pg_temp.check(pg_temp.err($$select public.admin_patch_settings('{"limits.freeFavourites":500}')$$) = 'validation_failed', 'settings range');
select pg_temp.check(pg_temp.err($$select public.admin_patch_settings('{"nope":1}')$$) = 'validation_failed', 'unknown key');
select public.admin_patch_settings('{"limits.freeFavourites":5,"announcement":{"id":"hello","enabled":true,"level":"info","dismissible":true,"texts":{"en":{"body":"Hi"}}}}');
select pg_temp.check((public.public_config() #>> '{settings,limits.freeFavourites}')::int = 5, 'config shows the setting');
select public.admin_patch_settings('{"limits.freeFavourites":null}');
select pg_temp.check(not (public.public_config() -> 'settings') ? 'limits.freeFavourites', 'null resets');
select pg_temp.check((public.admin_audit(null, null, '22222222-2222-4222-8222-222222222222', null, 3) ->> 'nextBefore') is not null, 'audit pages');
select pg_temp.check(jsonb_array_length(public.admin_audit('grant', null, null, null, 50) -> 'items') >= 2, 'audit filter by prefix');
select pg_temp.check((public.admin_store_events(null, null, null, 50) -> 'items') = '[]'::jsonb, 'no store events yet');

-- The append-only audit log, even for the owner.
reset role;
select pg_temp.check(pg_temp.err($$update public.audit_log set action = 'x'$$) like '%append-only%', 'audit append-only');
select pg_temp.check(pg_temp.err($$delete from public.audit_log$$) like '%append-only%', 'audit no delete');
set role authenticated;

-- Deleting: the admin deletes bob (confirm = his public id); then alice can't delete herself as last admin.
select pg_temp.check(pg_temp.err($$select public.admin_delete_user('22222222-2222-4222-8222-222222222222', 'SW-0000-0000', 'x')$$) = 'confirm_mismatch', 'confirm');
select public.admin_delete_user('22222222-2222-4222-8222-222222222222',
  (select lower(replace(public_id, '-', '')) from public.profiles where id = '22222222-2222-4222-8222-222222222222'), 'Asked by email');
select pg_temp.check(not exists (select 1 from public.favourites where user_id = '22222222-2222-4222-8222-222222222222'), 'data cascades');
select pg_temp.check(pg_temp.err($$select public.delete_my_account(false)$$) = 'last_admin', 'last admin cannot delete');
reset role;
select pg_temp.check(not exists (select 1 from auth.users where id = '22222222-2222-4222-8222-222222222222'), 'auth user gone');
select pg_temp.check(exists (select 1 from public.audit_log where action = 'user.delete'), 'delete audited');
