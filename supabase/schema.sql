create extension if not exists "pgcrypto";

create table if not exists public.trips (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  title text not null default '',
  destination text not null default '',
  tagline text not null default '',
  start_date date,
  end_date date,
  currency text not null default 'USD',
  invite_code text not null unique,
  cover_mood text not null default '',
  itinerary jsonb not null default '[]'::jsonb,
  places jsonb not null default '[]'::jsonb,
  expenses jsonb not null default '[]'::jsonb,
  checklist jsonb not null default '[]'::jsonb,
  notes text not null default '',
  members jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.trips enable row level security;

create policy "Trip members can read trips"
on public.trips
for select
to authenticated
using (
  owner_id = auth.uid()
  or members @> jsonb_build_array(jsonb_build_object('id', auth.uid()::text))
);

create policy "Owners and members can insert trips"
on public.trips
for insert
to authenticated
with check (
  owner_id = auth.uid()
  or members @> jsonb_build_array(jsonb_build_object('id', auth.uid()::text))
);

create policy "Owners and members can update trips"
on public.trips
for update
to authenticated
using (
  owner_id = auth.uid()
  or members @> jsonb_build_array(jsonb_build_object('id', auth.uid()::text))
)
with check (
  owner_id = auth.uid()
  or members @> jsonb_build_array(jsonb_build_object('id', auth.uid()::text))
);
