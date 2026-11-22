-- Phase 16: remember when a person last confirmed their recovery key still opens their vault.
-- Run once in the Supabase SQL editor. Safe to run again. Only a date is stored; the app works without it (it then asks by the setup date).
alter table public.user_keys add column if not exists recovery_checked_at timestamptz;
