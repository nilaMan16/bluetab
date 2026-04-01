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

create or replace function public.join_trip_by_invite_code(
  p_invite_code text,
  p_member_id text,
  p_member_name text,
  p_member_email text default null
)
returns public.trips
language plpgsql
security definer
set search_path = public
as $$
declare
  trip_row public.trips;
  next_members jsonb;
begin
  select *
  into trip_row
  from public.trips
  where invite_code = upper(trim(p_invite_code))
  limit 1;

  if trip_row is null then
    raise exception 'TRIP_NOT_FOUND';
  end if;

  if coalesce(trip_row.members, '[]'::jsonb) @> jsonb_build_array(jsonb_build_object('id', p_member_id)) then
    return trip_row;
  end if;

  next_members := coalesce(trip_row.members, '[]'::jsonb) || jsonb_build_array(
    jsonb_build_object(
      'id', p_member_id,
      'name', nullif(trim(p_member_name), ''),
      'email', nullif(trim(coalesce(p_member_email, '')), '')
    )
  );

  update public.trips
  set members = next_members,
      updated_at = timezone('utc', now())
  where id = trip_row.id
  returning * into trip_row;

  return trip_row;
end;
$$;

grant execute on function public.join_trip_by_invite_code(text, text, text, text) to authenticated;
