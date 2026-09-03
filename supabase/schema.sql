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
  custom_goal text,
  created_at timestamptz not null default now()
);

-- Migration for projects created before custom_goal existed.
alter table public.profiles add column if not exists custom_goal text;

-- ─────────────────────────────────────────────────────────────────────────────
-- Entries: one row per (challenge, user, date). Answers are stored as a JSON
-- object of { question_id: boolean }. Points are computed and stored on save.
--
-- Uniqueness is deliberately NOT declared here: challenge_id is added further
-- down (multi-challenge migration), so the real constraint --
-- unique (challenge_id, user_id, date) -- is created alongside it.
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  answers jsonb not null,
  points int not null check (points >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
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

-- ─────────────────────────────────────────────────────────────────────────────
-- Messages: group chat / message board. Any authenticated user can read every
-- message; each user can only insert / delete their own.
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  body text,
  image_path text,
  created_at timestamptz not null default now(),
  constraint messages_body_or_image check (
    (body is not null and length(trim(body)) > 0) or image_path is not null
  )
);

create index if not exists messages_created_at_idx on public.messages(created_at desc);

alter table public.messages enable row level security;

drop policy if exists "messages read" on public.messages;
create policy "messages read" on public.messages
  for select to authenticated using (true);

drop policy if exists "messages insert own" on public.messages;
create policy "messages insert own" on public.messages
  for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists "messages delete own" on public.messages;
create policy "messages delete own" on public.messages
  for delete to authenticated using (auth.uid() = user_id);

-- Realtime: stream new messages to subscribed clients.
do $do$ begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'messages'
  ) then
    alter publication supabase_realtime add table public.messages;
  end if;
end $do$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Chat images: private storage bucket. Uploads must be inside a folder named
-- after the user's auth.uid() so we can enforce ownership via storage RLS.
-- ─────────────────────────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public)
  values ('chat-images', 'chat-images', false)
  on conflict (id) do nothing;

drop policy if exists "chat_images_read_auth" on storage.objects;
create policy "chat_images_read_auth" on storage.objects
  for select to authenticated using (bucket_id = 'chat-images');

drop policy if exists "chat_images_insert_own" on storage.objects;
create policy "chat_images_insert_own" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'chat-images' and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "chat_images_delete_own" on storage.objects;
create policy "chat_images_delete_own" on storage.objects
  for delete to authenticated using (
    bucket_id = 'chat-images' and (storage.foldername(name))[1] = auth.uid()::text
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- Multi-challenge: each challenge has its own roster, entries, and chat.
-- Lets users start a new round, save old ones, and invite people via code.
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.challenges (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  start_date date not null,
  days int not null default 30 check (days between 1 and 365),
  invite_code text not null unique
    default upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6)),
  created_by uuid references auth.users(id) on delete set null,
  goals jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

-- Migration: add goals column on existing projects + seed defaults so the
-- first round keeps working with the original 9-item checklist.
alter table public.challenges add column if not exists goals jsonb;
update public.challenges set goals = '[
  {"id":"exercise","text":"30 minutes of exercise","points":3},
  {"id":"core","text":"Extra 5 minutes of core","points":1},
  {"id":"nutrition","text":"Hit your nutrition goal","points":3},
  {"id":"sleep","text":"More than 7 hours of sleep","points":2},
  {"id":"water","text":"More than 60 oz of water","points":2},
  {"id":"stretch","text":"Stretched or foam rolled","points":1},
  {"id":"noAlcohol","text":"No alcohol today","points":2},
  {"id":"screen","text":"Less than 1 hr non-work screen time","points":2},
  {"id":"custom","text":"Personal goal","points":2}
]'::jsonb where goals is null;
do $$ begin alter table public.challenges alter column goals set default '[]'::jsonb; exception when others then null; end $$;
do $$ begin alter table public.challenges alter column goals set not null; exception when others then null; end $$;

create table if not exists public.challenge_members (
  challenge_id uuid not null references public.challenges(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (challenge_id, user_id)
);

create index if not exists challenge_members_user_idx on public.challenge_members(user_id);

-- Add challenge_id to entries + messages (nullable for migration).
alter table public.entries  add column if not exists challenge_id uuid references public.challenges(id) on delete cascade;
alter table public.messages add column if not exists challenge_id uuid references public.challenges(id) on delete cascade;

-- One-time backfill: create "Round 1" from settings, enroll all existing
-- profiles, and link every existing entry + message to it.
do $$
declare
  first_challenge uuid;
  s record;
begin
  if exists (select 1 from public.challenges) then return; end if;

  select challenge_start_date, challenge_days into s from public.settings where id = 1;
  insert into public.challenges (name, start_date, days)
    values ('Round 1', coalesce(s.challenge_start_date, current_date), coalesce(s.challenge_days, 30))
    returning id into first_challenge;

  insert into public.challenge_members (challenge_id, user_id)
    select first_challenge, id from public.profiles
    on conflict do nothing;

  update public.entries  set challenge_id = first_challenge where challenge_id is null;
  update public.messages set challenge_id = first_challenge where challenge_id is null;
end $$;

-- Lock down the schema once backfilled.
do $$ begin alter table public.entries  alter column challenge_id set not null; exception when others then null; end $$;
do $$ begin alter table public.messages alter column challenge_id set not null; exception when others then null; end $$;

create index if not exists entries_challenge_idx  on public.entries(challenge_id);
create index if not exists messages_challenge_idx on public.messages(challenge_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- Scope entry uniqueness to the challenge.
--
-- The original single-challenge schema declared `unique (user_id, date)`, which
-- survived the multi-challenge migration above. That constraint spans every
-- challenge, so a user could only ever hold ONE row per calendar day in the
-- whole table: saving a day from challenge B did ON CONFLICT (user_id, date)
-- DO UPDATE against the row that belonged to challenge A, re-stamping its
-- challenge_id. The day silently disappeared from challenge A's leaderboard and
-- that member's total appeared to reset.
--
-- Drop any unique constraint on exactly (user_id, date) and replace it with a
-- per-challenge one. Because the old constraint was strictly narrower, no
-- duplicates can exist and the new constraint always applies cleanly.
-- ─────────────────────────────────────────────────────────────────────────────
do $$
declare
  c record;
begin
  for c in
    select con.conname
    from pg_constraint con
    where con.conrelid = 'public.entries'::regclass
      and con.contype = 'u'
      and (
        select array_agg(att.attname::text order by att.attname)
        from unnest(con.conkey) as k
        join pg_attribute att
          on att.attrelid = con.conrelid and att.attnum = k
      ) = array['date', 'user_id']
  loop
    execute format('alter table public.entries drop constraint %I', c.conname);
  end loop;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.entries'::regclass
      and conname = 'entries_challenge_user_date_key'
  ) then
    alter table public.entries
      add constraint entries_challenge_user_date_key
      unique (challenge_id, user_id, date);
  end if;
end $$;

-- Helper for RLS: SECURITY DEFINER avoids recursing through challenge_members.
create or replace function public.is_challenge_member(cid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.challenge_members
    where challenge_id = cid and user_id = auth.uid()
  );
$$;

revoke all on function public.is_challenge_member(uuid) from public;
grant execute on function public.is_challenge_member(uuid) to authenticated;

alter table public.challenges        enable row level security;
alter table public.challenge_members enable row level security;

-- Any authenticated user can read challenges (so they can look up by invite
-- code). The actual sensitive data — entries and messages — stays scoped to
-- members via is_challenge_member().
drop policy if exists "challenges read members"      on public.challenges;
drop policy if exists "challenges read all auth"     on public.challenges;
drop policy if exists "challenges insert own"        on public.challenges;
drop policy if exists "challenges update by creator" on public.challenges;
create policy "challenges read all auth" on public.challenges
  for select to authenticated using (true);
create policy "challenges insert own" on public.challenges
  for insert to authenticated with check (created_by = auth.uid());
create policy "challenges update by creator" on public.challenges
  for update to authenticated using (created_by = auth.uid()) with check (created_by = auth.uid());

drop policy if exists "members read peers"   on public.challenge_members;
drop policy if exists "members insert self"  on public.challenge_members;
drop policy if exists "members delete self"  on public.challenge_members;
create policy "members read peers" on public.challenge_members
  for select to authenticated using (is_challenge_member(challenge_id));
create policy "members insert self" on public.challenge_members
  for insert to authenticated with check (user_id = auth.uid());
create policy "members delete self" on public.challenge_members
  for delete to authenticated using (user_id = auth.uid());

grant insert on public.challenge_members to authenticated;

-- Re-scope entries + messages so callers only see challenges they're in.
drop policy if exists "entries read"        on public.entries;
drop policy if exists "entries insert own"  on public.entries;
drop policy if exists "entries update own"  on public.entries;
create policy "entries read" on public.entries
  for select to authenticated using (is_challenge_member(challenge_id));
create policy "entries insert own" on public.entries
  for insert to authenticated with check (auth.uid() = user_id and is_challenge_member(challenge_id));
create policy "entries update own" on public.entries
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id and is_challenge_member(challenge_id));

drop policy if exists "messages read"       on public.messages;
drop policy if exists "messages insert own" on public.messages;
create policy "messages read" on public.messages
  for select to authenticated using (is_challenge_member(challenge_id));
create policy "messages insert own" on public.messages
  for insert to authenticated with check (auth.uid() = user_id and is_challenge_member(challenge_id));

-- ─────────────────────────────────────────────────────────────────────────────
-- RPCs to create a challenge or join by invite code (both bypass RLS safely).
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.create_challenge(p_name text, p_start_date date, p_days int default 30)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  cid uuid;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if p_name is null or length(trim(p_name)) = 0 then raise exception 'Name is required'; end if;
  if p_days < 1 or p_days > 365 then raise exception 'Days must be between 1 and 365'; end if;
  if p_start_date is null then raise exception 'Start date is required'; end if;

  insert into public.challenges (name, start_date, days, created_by)
    values (trim(p_name), p_start_date, p_days, auth.uid())
    returning id into cid;

  insert into public.challenge_members (challenge_id, user_id) values (cid, auth.uid());
  return cid;
end;
$$;

revoke all on function public.create_challenge(text, date, int) from public;
grant execute on function public.create_challenge(text, date, int) to authenticated;

create or replace function public.join_challenge(p_code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  cid uuid;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if p_code is null or length(trim(p_code)) = 0 then raise exception 'Code is required'; end if;

  select id into cid from public.challenges where invite_code = upper(trim(p_code));
  if cid is null then
    raise exception 'No challenge with that code';
  end if;

  insert into public.challenge_members (challenge_id, user_id)
    values (cid, auth.uid())
    on conflict do nothing;

  return cid;
end;
$$;

revoke all on function public.join_challenge(text) from public;
grant execute on function public.join_challenge(text) to authenticated;
