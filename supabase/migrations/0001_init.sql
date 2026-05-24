-- RepPolice v2 — initial schema
-- Run this in the Supabase SQL editor for your project.

------------------------------------------------------------------------
-- 1. submissions table
------------------------------------------------------------------------

create table if not exists public.submissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  storage_path text not null,
  original_filename text,
  file_size_bytes bigint,
  mime_type text,
  status text not null default 'uploaded'
    check (status in ('uploaded', 'analyzing', 'done', 'failed')),
  created_at timestamptz not null default now()
);

create index if not exists submissions_user_id_created_at_idx
  on public.submissions (user_id, created_at desc);

alter table public.submissions enable row level security;

-- Users can see only their own submissions
drop policy if exists "submissions_select_own" on public.submissions;
create policy "submissions_select_own"
  on public.submissions
  for select
  to authenticated
  using (user_id = auth.uid());

-- Users can insert rows only for themselves
drop policy if exists "submissions_insert_own" on public.submissions;
create policy "submissions_insert_own"
  on public.submissions
  for insert
  to authenticated
  with check (user_id = auth.uid());

------------------------------------------------------------------------
-- 2. storage bucket: videos
------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('videos', 'videos', false)
on conflict (id) do nothing;

-- Files are scoped per-user under {user_id}/...
-- These policies limit access to the user's own folder.

drop policy if exists "videos_select_own" on storage.objects;
create policy "videos_select_own"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'videos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "videos_insert_own" on storage.objects;
create policy "videos_insert_own"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'videos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
