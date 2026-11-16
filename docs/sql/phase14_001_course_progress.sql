-- Experiments in Creativity: optional sync of a person's course progress across their devices.
-- The content column holds ciphertext only (encrypted in the browser with the person's vault key); the server cannot read it.
-- Run once in the Supabase SQL editor. Safe to run again.

create table if not exists public.course_progress (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  content     text not null,
  key_version integer not null default 1,
  updated_at  timestamptz not null default now()
);

alter table public.course_progress enable row level security;

drop policy if exists "course_progress_select_own" on public.course_progress;
drop policy if exists "course_progress_insert_own" on public.course_progress;
drop policy if exists "course_progress_update_own" on public.course_progress;
drop policy if exists "course_progress_delete_own" on public.course_progress;

create policy "course_progress_select_own" on public.course_progress for select using (auth.uid() = user_id);
create policy "course_progress_insert_own" on public.course_progress for insert with check (auth.uid() = user_id);
create policy "course_progress_update_own" on public.course_progress for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "course_progress_delete_own" on public.course_progress for delete using (auth.uid() = user_id);
