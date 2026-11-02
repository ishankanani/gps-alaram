-- StopWake speaks 19 languages now: ar, cs, es, ko, pl, pt, tr and zh join da, de, en, fi, fr, hi,
-- it, ja, nb, nl and sv. Run after the first three migrations (a fresh project may run all four).
--
-- The language list is written into the profile check, the sign-up trigger, PATCH /me, the admin
-- user edit and the announcement validator. Rather than repeat those function bodies, this patches
-- the list wherever it appears, in the stored definitions, and does nothing when it is already
-- current.

do $$
declare
  old_list constant text := $l$('da','de','en','fi','fr','hi','it','ja','nb','nl','sv')$l$;
  new_list constant text := $l$('ar','cs','da','de','en','es','fi','fr','hi','it','ja','ko','nb','nl','pl','pt','sv','tr','zh')$l$;
  fn record;
  con record;
  def text;
begin
  -- profiles.language check constraint
  for con in
    select c.conname
    from pg_constraint c
    where c.conrelid = 'public.profiles'::regclass and c.contype = 'c'
      and pg_get_constraintdef(c.oid) like '%language%' and pg_get_constraintdef(c.oid) like '%''ja''%'
      and pg_get_constraintdef(c.oid) not like '%''ko''%'
  loop
    execute format('alter table public.profiles drop constraint %I', con.conname);
    execute format('alter table public.profiles add constraint %I check (language is null or language in %s)', con.conname, new_list);
  end loop;

  -- functions that list the languages
  for fn in
    select p.oid
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prokind = 'f' and pg_get_functiondef(p.oid) like '%' || old_list || '%'
  loop
    def := replace(pg_get_functiondef(fn.oid), old_list, new_list);
    execute def;
  end loop;
end
$$;
