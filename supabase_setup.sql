-- Ekhaya FC — Supabase setup (run once in SQL Editor, then press "Run")
-- Creates the single-row org state table + policies so the app can read/write.

create table if not exists public.app_state (
  org_id text primary key,
  data   jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- Allow authenticated + anon (publishable key) access via RLS.
alter table public.app_state enable row level security;

drop policy if exists app_state_select on public.app_state;
create policy app_state_select on public.app_state
  for select using (true);

drop policy if exists app_state_insert on public.app_state;
create policy app_state_insert on public.app_state
  for insert with check (true);

drop policy if exists app_state_update on public.app_state;
create policy app_state_update on public.app_state
  for update using (true) with check (true);

grant select, insert, update on public.app_state to anon, authenticated;