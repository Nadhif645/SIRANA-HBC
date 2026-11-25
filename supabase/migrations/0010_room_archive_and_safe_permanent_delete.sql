alter table public.rooms
  add column if not exists is_archived boolean not null default false;

-- Permanent room deletion also removes its booking rows and booking history.
alter table public.room_bookings
  drop constraint if exists room_bookings_room_id_fkey;
alter table public.room_bookings
  add constraint room_bookings_room_id_fkey
  foreign key (room_id) references public.rooms(id) on delete cascade;

-- Keep the rule effective even for direct SQL or requests outside the UI.
create or replace function public.prevent_unsafe_room_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  jakarta_now timestamp without time zone := statement_timestamp() at time zone 'Asia/Jakarta';
begin
  if exists (
    select 1
    from public.damage_tickets as ticket
    where ticket.room_id = old.id
      and ticket.status not in ('selesai', 'ditolak')
  ) then
    raise exception 'Ruangan tidak dapat dihapus permanen karena masih ada laporan kerusakan yang belum selesai.'
      using errcode = 'P0001';
  end if;

  if exists (
    select 1
    from public.room_bookings as booking
    where booking.room_id = old.id
      and booking.status in ('diajukan_sarpras', 'menunggu_kepsek', 'disetujui')
      and booking.booking_date + booking.end_time > jakarta_now
  ) then
    raise exception 'Ruangan tidak dapat dihapus permanen karena masih memiliki booking aktif atau yang akan berlangsung.'
      using errcode = 'P0001';
  end if;

  return old;
end;
$$;

drop trigger if exists prevent_unsafe_room_delete on public.rooms;
create trigger prevent_unsafe_room_delete
before delete on public.rooms
for each row execute function public.prevent_unsafe_room_delete();

-- Keep Sarpras permissions explicit for projects applying this migration directly.
drop policy if exists rooms_sarpras_insert on public.rooms;
create policy rooms_sarpras_insert
  on public.rooms for insert to authenticated
  with check (public.current_profile_role() = 'sarpras');

drop policy if exists rooms_sarpras_update on public.rooms;
create policy rooms_sarpras_update
  on public.rooms for update to authenticated
  using (public.current_profile_role() = 'sarpras')
  with check (public.current_profile_role() = 'sarpras');

drop policy if exists rooms_sarpras_delete on public.rooms;
create policy rooms_sarpras_delete
  on public.rooms for delete to authenticated
  using (public.current_profile_role() = 'sarpras');
