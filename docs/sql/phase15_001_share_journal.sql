-- Phase 15: sharing one journal entry at a time with a connected therapist.
-- Run once in the Supabase SQL editor. Safe to run again.
-- The shared copy lives in shared_copies like worksheets, family history and check-ins, with category 'journal'.
-- It only widens the allowed list of categories; the row-level rules for shared_copies are unchanged.

do $$
declare c text;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.shared_copies'::regclass and contype = 'c' and pg_get_constraintdef(oid) ilike '%category%'
  loop
    execute format('alter table public.shared_copies drop constraint %I', c);
  end loop;
end $$;

alter table public.shared_copies
  add constraint shared_copies_category_check
  check (category in ('checkins', 'worksheets', 'family', 'intake', 'journal'));
