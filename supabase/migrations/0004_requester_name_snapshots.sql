-- Preserve applicant names on the submitted record so staff can identify requesters
-- without broadening read access to profiles.

alter table public.damage_tickets
  add column if not exists reported_by_name text;

alter table public.room_bookings
  add column if not exists requested_by_name text;

update public.damage_tickets as t
set reported_by_name = p.full_name
from public.profiles as p
where p.id = t.reported_by and t.reported_by_name is null;

update public.room_bookings as b
set requested_by_name = p.full_name
from public.profiles as p
where p.id = b.requested_by and b.requested_by_name is null;

alter table public.damage_tickets
  alter column reported_by_name set not null;

alter table public.room_bookings
  alter column requested_by_name set not null;

create or replace function public.snapshot_damage_reporter_name()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  select p.full_name into new.reported_by_name
  from public.profiles as p
  where p.id = new.reported_by;
  return new;
end;
$$;

drop trigger if exists damage_tickets_reporter_name_snapshot on public.damage_tickets;
create trigger damage_tickets_reporter_name_snapshot
before insert or update of reported_by on public.damage_tickets
for each row execute function public.snapshot_damage_reporter_name();

create or replace function public.snapshot_booking_requester_name()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  select p.full_name into new.requested_by_name
  from public.profiles as p
  where p.id = new.requested_by;
  return new;
end;
$$;

drop trigger if exists room_bookings_requester_name_snapshot on public.room_bookings;
create trigger room_bookings_requester_name_snapshot
before insert or update of requested_by on public.room_bookings
for each row execute function public.snapshot_booking_requester_name();
