-- SIRANA HBC initial schema
-- Run once in Supabase SQL Editor for the new, empty project.

create extension if not exists pgcrypto;

create sequence if not exists public.ticket_number_seq;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  full_name text not null,
  role text not null default 'guru'
    check (role in ('guru', 'sarpras', 'admin', 'kepsek')),
  requested_role text not null default 'guru'
    check (requested_role in ('guru', 'sarpras', 'kepsek', 'admin')),
  approval_status text not null default 'pending'
    check (approval_status in ('pending', 'approved', 'rejected')),
  is_active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.current_profile_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select p.role
  from public.profiles as p
  where p.id = auth.uid()
    and p.is_active
    and p.approval_status = 'approved'
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name, role, requested_role, approval_status, is_active)
  values (
    new.id,
    new.email,
    coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''), split_part(new.email, '@', 1)),
    'guru',
    case
      when new.raw_user_meta_data ->> 'requested_role' in ('guru', 'sarpras', 'kepsek')
        then new.raw_user_meta_data ->> 'requested_role'
      else 'guru'
    end,
    'pending',
    false
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

create table if not exists public.rooms (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  location text not null,
  capacity integer not null check (capacity > 0),
  facilities text,
  status text not null default 'tentatif'
    check (status in ('tersedia', 'tentatif', 'terpakai')),
  occupied_from timestamp without time zone,
  occupied_until timestamp without time zone,
  constraint rooms_occupancy_valid check (
    (occupied_from is null and occupied_until is null)
    or (occupied_from is not null and occupied_until is not null and occupied_from < occupied_until)
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.rooms (code, name, location, capacity, facilities, status)
values
  ('HBC.B.01.030', 'Ruang Aula HBC', 'Gedung B, Lantai 1', 100, null, 'tentatif'),
  ('HBC.SH.01.032', 'Sport Hall HBC', 'Gedung Penunjang', 100, null, 'tentatif'),
  ('SMPHBC.A.03.013', 'Laboratorium IPA', 'Gedung A, Lantai 3', 24, null, 'tentatif'),
  ('SMPHBC.A.03.014', 'Laboratorium Komputer', 'Gedung A, Lantai 3', 30, null, 'tentatif'),
  ('SMPHBC.A.03.015', 'Ruang Perpustakaan', 'Gedung A, Lantai 3', 35, null, 'tentatif')
on conflict (code) do nothing;

create table if not exists public.room_bookings (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete restrict,
  requested_by uuid not null references public.profiles(id) on delete restrict,
  booking_date date not null,
  start_time time not null,
  end_time time not null,
  requested_capacity integer not null check (requested_capacity > 0),
  purpose text not null,
  letter_path text not null,
  status text not null default 'diajukan_sarpras'
    check (status in ('diajukan_sarpras', 'menunggu_kepsek', 'disetujui', 'ditolak', 'dibatalkan')),
  sarpras_note text,
  decision_note text,
  recommended_by uuid references public.profiles(id) on delete set null,
  decided_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint room_bookings_valid_time check (
    start_time >= time '07:00'
    and end_time <= time '16:00'
    and start_time < end_time
  ),
  constraint room_bookings_weekday check (extract(isodow from booking_date) between 1 and 5)
);

alter table public.room_bookings
  drop constraint if exists room_bookings_no_active_overlap;

create or replace function public.check_room_booking_schedule()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  room_capacity integer;
  room_status text;
  occupied_from timestamp without time zone;
  occupied_until timestamp without time zone;
begin
  if new.status not in ('diajukan_sarpras', 'menunggu_kepsek', 'disetujui') then
    return new;
  end if;

  select r.capacity, r.status, r.occupied_from, r.occupied_until
  into room_capacity, room_status, occupied_from, occupied_until
  from public.rooms as r
  where r.id = new.room_id
  for update;

  if room_capacity is null then
    raise exception 'Ruangan tidak ditemukan.';
  end if;
  if room_status <> 'tersedia' then
    raise exception 'Ruangan belum dikonfirmasi tersedia untuk booking.';
  end if;
  if new.requested_capacity > room_capacity then
    raise exception 'Jumlah pengguna melebihi kapasitas ruangan (% orang).', room_capacity;
  end if;
  if occupied_from is not null
    and new.booking_date + new.start_time < occupied_until
    and new.booking_date + new.end_time > occupied_from then
    raise exception 'Jadwal bertabrakan dengan pemakaian ruangan yang dicatat Admin.';
  end if;
  if exists (
    select 1
    from public.room_bookings as b
    where b.room_id = new.room_id
      and b.booking_date = new.booking_date
      and b.id is distinct from new.id
      and b.status in ('diajukan_sarpras', 'menunggu_kepsek', 'disetujui')
      and new.start_time < b.end_time
      and new.end_time > b.start_time
  ) then
    raise exception 'Jadwal bertabrakan dengan booking aktif lain di ruangan ini.';
  end if;

  return new;
end;
$$;

drop trigger if exists room_bookings_capacity_guard on public.room_bookings;
drop trigger if exists room_bookings_schedule_guard on public.room_bookings;
create trigger room_bookings_schedule_guard
before insert or update of room_id, booking_date, start_time, end_time, requested_capacity, status
on public.room_bookings
for each row execute function public.check_room_booking_schedule();

create or replace function public.check_room_occupancy_schedule()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.occupied_from is null then
    return new;
  end if;

  if exists (
    select 1
    from public.room_bookings as b
    where b.room_id = new.id
      and b.status in ('diajukan_sarpras', 'menunggu_kepsek', 'disetujui')
      and new.occupied_from < b.booking_date + b.end_time
      and new.occupied_until > b.booking_date + b.start_time
  ) then
    raise exception 'Waktu pemakaian ruangan bertabrakan dengan booking yang sudah tercatat.';
  end if;

  return new;
end;
$$;

drop trigger if exists rooms_occupancy_guard on public.rooms;
create trigger rooms_occupancy_guard
before update of occupied_from, occupied_until on public.rooms
for each row execute function public.check_room_occupancy_schedule();

create index if not exists room_bookings_date_room_idx
  on public.room_bookings (booking_date, room_id);
create index if not exists room_bookings_requester_idx
  on public.room_bookings (requested_by, created_at desc);

create table if not exists public.damage_tickets (
  id uuid primary key default gen_random_uuid(),
  ticket_number text not null unique default (
    'HBC-' || to_char(current_date, 'YYMMDD') || '-' || lpad(nextval('public.ticket_number_seq')::text, 4, '0')
  ),
  reported_by uuid not null references public.profiles(id) on delete restrict,
  title text not null,
  category text not null,
  equipment text not null,
  location text not null,
  description text not null,
  photo_url text,
  status text not null default 'diajukan'
    check (status in (
      'diajukan',
      'verifikasi_sarpras',
      'verifikasi_lapangan',
      'menunggu_kepsek',
      'proses_perbaikan',
      'selesai',
      'ditolak'
    )),
  verified_by uuid references public.profiles(id) on delete set null,
  field_verified_at timestamptz,
  decided_by uuid references public.profiles(id) on delete set null,
  decision_note text,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists damage_tickets_reporter_idx
  on public.damage_tickets (reported_by, created_at desc);
create index if not exists damage_tickets_status_idx
  on public.damage_tickets (status, created_at desc);

-- The schedule view exposes only room and time occupancy, not requester or purpose.
create or replace view public.booking_slots as
select id, room_id, booking_date, start_time, end_time, requested_capacity, status
from public.room_bookings
where status in ('diajukan_sarpras', 'menunggu_kepsek', 'disetujui');

grant usage on schema public to authenticated;
grant select, update on public.profiles to authenticated;
grant select, insert, update, delete on public.rooms to authenticated;
grant select, insert, update on public.room_bookings to authenticated;
grant select on public.booking_slots to authenticated;
grant select, insert, update on public.damage_tickets to authenticated;
grant usage, select on sequence public.ticket_number_seq to authenticated;

alter table public.profiles enable row level security;
alter table public.rooms enable row level security;
alter table public.room_bookings enable row level security;
alter table public.damage_tickets enable row level security;

-- Profiles: users read their own profile; Admin manages all accounts and roles.
drop policy if exists profiles_read_self_or_admin on public.profiles;
create policy profiles_read_self_or_admin
  on public.profiles for select to authenticated
  using (id = auth.uid() or public.current_profile_role() = 'admin');

drop policy if exists profiles_admin_update on public.profiles;
create policy profiles_admin_update
  on public.profiles for update to authenticated
  using (public.current_profile_role() = 'admin')
  with check (public.current_profile_role() = 'admin');

-- Rooms: all signed-in roles can see the catalog; Admin maintains it.
drop policy if exists rooms_read_authenticated on public.rooms;
create policy rooms_read_authenticated
  on public.rooms for select to authenticated
  using (true);

drop policy if exists rooms_admin_insert on public.rooms;
create policy rooms_admin_insert
  on public.rooms for insert to authenticated
  with check (public.current_profile_role() = 'admin');

drop policy if exists rooms_admin_update on public.rooms;
create policy rooms_admin_update
  on public.rooms for update to authenticated
  using (public.current_profile_role() = 'admin')
  with check (public.current_profile_role() = 'admin');

drop policy if exists rooms_admin_delete on public.rooms;
create policy rooms_admin_delete
  on public.rooms for delete to authenticated
  using (public.current_profile_role() = 'admin');

-- Booking details are visible only to the requester and staff roles.
drop policy if exists room_bookings_read_authorized on public.room_bookings;
create policy room_bookings_read_authorized
  on public.room_bookings for select to authenticated
  using (
    requested_by = auth.uid()
    or public.current_profile_role() in ('sarpras', 'kepsek', 'admin')
  );

drop policy if exists room_bookings_insert_guru on public.room_bookings;
create policy room_bookings_insert_guru
  on public.room_bookings for insert to authenticated
  with check (
    requested_by = auth.uid()
    and public.current_profile_role() = 'guru'
    and letter_path like auth.uid()::text || '/%'
    and exists (
      select 1 from public.profiles as p
      where p.id = auth.uid() and p.is_active and p.approval_status = 'approved'
    )
  );

drop policy if exists room_bookings_sarpras_review on public.room_bookings;
create policy room_bookings_sarpras_review
  on public.room_bookings for update to authenticated
  using (
    public.current_profile_role() = 'sarpras'
    and status = 'diajukan_sarpras'
  )
  with check (
    public.current_profile_role() = 'sarpras'
    and status in ('menunggu_kepsek', 'ditolak')
  );

drop policy if exists room_bookings_kepsek_decision on public.room_bookings;
create policy room_bookings_kepsek_decision
  on public.room_bookings for update to authenticated
  using (
    public.current_profile_role() = 'kepsek'
    and status = 'menunggu_kepsek'
  )
  with check (
    public.current_profile_role() = 'kepsek'
    and status in ('disetujui', 'ditolak')
  );

drop policy if exists room_bookings_guru_cancel on public.room_bookings;
create policy room_bookings_guru_cancel
  on public.room_bookings for update to authenticated
  using (
    requested_by = auth.uid()
    and status in ('diajukan_sarpras', 'menunggu_kepsek')
  )
  with check (
    requested_by = auth.uid()
    and status = 'dibatalkan'
  );

-- Ticket reports: Guru submits; Sarpras verifies; Principal decides; Admin can manage.
drop policy if exists damage_tickets_read_authorized on public.damage_tickets;
create policy damage_tickets_read_authorized
  on public.damage_tickets for select to authenticated
  using (
    reported_by = auth.uid()
    or public.current_profile_role() in ('sarpras', 'kepsek', 'admin')
  );

drop policy if exists damage_tickets_insert_guru on public.damage_tickets;
create policy damage_tickets_insert_guru
  on public.damage_tickets for insert to authenticated
  with check (
    reported_by = auth.uid()
    and public.current_profile_role() = 'guru'
    and exists (
      select 1 from public.profiles as p
      where p.id = auth.uid() and p.is_active and p.approval_status = 'approved'
    )
  );

drop policy if exists damage_tickets_sarpras_update on public.damage_tickets;
create policy damage_tickets_sarpras_update
  on public.damage_tickets for update to authenticated
  using (public.current_profile_role() = 'sarpras')
  with check (
    public.current_profile_role() = 'sarpras'
    and status in ('verifikasi_sarpras', 'verifikasi_lapangan', 'menunggu_kepsek', 'selesai')
  );

drop policy if exists damage_tickets_kepsek_decision on public.damage_tickets;
create policy damage_tickets_kepsek_decision
  on public.damage_tickets for update to authenticated
  using (
    public.current_profile_role() = 'kepsek'
    and status = 'menunggu_kepsek'
  )
  with check (
    public.current_profile_role() = 'kepsek'
    and status in ('proses_perbaikan', 'ditolak')
  );

drop policy if exists damage_tickets_admin_update on public.damage_tickets;
create policy damage_tickets_admin_update
  on public.damage_tickets for update to authenticated
  using (public.current_profile_role() = 'admin')
  with check (public.current_profile_role() = 'admin');

-- Booking letters remain private and can only be read by the requester and reviewers.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('booking-letters', 'booking-letters', false, 8388608, array['application/pdf'])
on conflict (id) do update set
  public = false,
  file_size_limit = 8388608,
  allowed_mime_types = array['application/pdf'];

drop policy if exists booking_letters_upload_own on storage.objects;
create policy booking_letters_upload_own
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'booking-letters'
    and (storage.foldername(name))[1] = auth.uid()::text
    and public.current_profile_role() = 'guru'
    and exists (
      select 1 from public.profiles as p
      where p.id = auth.uid() and p.is_active and p.approval_status = 'approved'
    )
  );

drop policy if exists booking_letters_read_own_or_reviewers on storage.objects;
create policy booking_letters_read_own_or_reviewers
  on storage.objects for select to authenticated
  using (
    bucket_id = 'booking-letters'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or (
        public.current_profile_role() in ('sarpras', 'kepsek', 'admin')
        and exists (
          select 1 from public.room_bookings as b
          where b.letter_path = name
        )
      )
    )
  );
