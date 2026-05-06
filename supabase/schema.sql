-- Race to Abs — Supabase schema
-- Run this once in your Supabase project's SQL Editor.

-- ─────────────────────────────────────────────────────────────────────────────
-- Settings: single shared row holding the global challenge start date.
-- Edit challenge_start_date in the Supabase Table Editor to set the kickoff day.
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.settings (
  id int primary key default 1,
  challenge_start_date date not null,
  challenge_days int not null default 30,
  constraint settings_singleton check (id = 1)
);

insert into public.settings (id, challenge_start_date, challenge_days)
values (1, current_date, 30)
on conflict (id) do nothing;

-- ─────────────────────────────────────────────────────────────────────────────
-- Profiles: one row per signed-in user. Just a display name.
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (length(trim(display_name)) > 0),
  created_at timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Entries: one row per (user, date). Answers are stored as a JSON object of
-- { question_id: boolean }. Points are computed and stored on save.
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  answers jsonb not null,
  points int not null check (points >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, date)
);

create index if not exists entries_date_idx on public.entries(date);
create index if not exists entries_user_idx on public.entries(user_id);

-- Keep updated_at fresh on UPDATE
create or replace function public.touch_updated_at() returns trigger as $$
begin
  new.updated_at := now();
  return new;
end
$$ language plpgsql;

drop trigger if exists entries_touch_updated_at on public.entries;
create trigger entries_touch_updated_at
before update on public.entries
for each row execute function public.touch_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- Row-Level Security
-- Read: any authenticated user can see all profiles/entries (for the leaderboard).
-- Write: each user can only insert/update/delete their own row.
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.settings enable row level security;
alter table public.profiles enable row level security;
alter table public.entries enable row level security;

drop policy if exists "settings read" on public.settings;
create policy "settings read" on public.settings
  for select to authenticated using (true);

drop policy if exists "profiles read" on public.profiles;
create policy "profiles read" on public.profiles
  for select to authenticated using (true);

drop policy if exists "profiles insert own" on public.profiles;
create policy "profiles insert own" on public.profiles
  for insert to authenticated with check (auth.uid() = id);

drop policy if exists "profiles update own" on public.profiles;
create policy "profiles update own" on public.profiles
  for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists "entries read" on public.entries;
create policy "entries read" on public.entries
  for select to authenticated using (true);

drop policy if exists "entries insert own" on public.entries;
create policy "entries insert own" on public.entries
  for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists "entries update own" on public.entries;
create policy "entries update own" on public.entries
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "entries delete own" on public.entries;
create policy "entries delete own" on public.entries
  for delete to authenticated using (auth.uid() = user_id);
