-- Run this in the Supabase SQL editor.

create extension if not exists "pgcrypto";

create table if not exists public.uploads (
  id uuid primary key default gen_random_uuid(),
  original_name text not null,
  stored_name text not null,
  uploaded_at timestamptz not null default now(),
  year integer,
  month integer,
  category text not null default 'other',
  uploaded_by uuid references auth.users(id),
  data_json jsonb not null default '{}'::jsonb,
  data_version integer not null default 1
);

create index if not exists uploads_uploaded_at_idx on public.uploads (uploaded_at desc);
