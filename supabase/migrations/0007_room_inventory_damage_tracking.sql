create table if not exists public.room_inventory_items (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  name text not null check (length(btrim(name)) > 0),
  quantity integer check (quantity is null or quantity >= 0),
  active_damaged_quantity integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint room_inventory_items_damage_within_quantity check (
    active_damaged_quantity >= 0
    and active_damaged_quantity <= coalesce(quantity, 0)
  )
);

create index if not exists room_inventory_items_room_active_idx
  on public.room_inventory_items (room_id, is_active, name);
create unique index if not exists room_inventory_items_active_name_idx
  on public.room_inventory_items (room_id, lower(name))
  where is_active;

alter table public.damage_tickets
  add column if not exists room_id uuid references public.rooms(id) on delete set null,
  add column if not exists inventory_item_id uuid references public.room_inventory_items(id) on delete set null,
  add column if not exists damaged_quantity integer;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'damage_tickets_damaged_quantity_positive'
      and conrelid = 'public.damage_tickets'::regclass
  ) then
    alter table public.damage_tickets
      add constraint damage_tickets_damaged_quantity_positive
      check (damaged_quantity is null or damaged_quantity > 0);
  end if;
end;
$$;

create index if not exists damage_tickets_inventory_active_idx
  on public.damage_tickets (inventory_item_id, status)
  where inventory_item_id is not null;

insert into public.room_inventory_items (room_id, name, quantity)
select r.id, seed.name, seed.quantity
from (values
  ('Laboratorium IPA', 'Meja Praktikum Siswa', 25),
  ('Laboratorium IPA', 'Meja Demonstrasi Guru', 1),
  ('Laboratorium IPA', 'Kursi Laboratorium Siswa', 25),
  ('Laboratorium IPA', 'Kursi Kerja Low Back Guru', 2),
  ('Laboratorium IPA', 'Meja Penyimpanan Alat Demonstrasi', 2),
  ('Laboratorium IPA', 'Meja Preparasi', 1),
  ('Laboratorium IPA', 'Instalasi Listrik & Grounding', null),
  ('Laboratorium IPA', 'Instalasi Air Bersih & Limbah', null),
  ('Laboratorium IPA', 'Ventilasi & Exhaust System', 4),
  ('Laboratorium IPA', 'APAR Dry Chemical 6 kg', 2),
  ('Laboratorium IPA', '8 Gallons (30L)', 1),
  ('Laboratorium IPA', 'P3K & Rambu K3 Laboratorium', null),
  ('Laboratorium IPA', 'Whiteboard', 2),
  ('Laboratorium IPA', 'Infocus Projector', 1),
  ('Laboratorium IPA', 'Wall Screen Projector', 1),
  ('Laboratorium IPA', 'Tirai gulung jendela', null),
  ('Laboratorium IPA', 'AC', null),
  ('Laboratorium IPA', 'Rak Sepatu', 1),

  ('Lab Bahasa', 'AC Split 1–1.5 PK', 2),
  ('Lab Bahasa', 'Ruang Design Kedap Suara', 1),
  ('Lab Bahasa', 'Rak Sepatu', 1),
  ('Lab Bahasa', 'Tempat Sampah Injak', 2),
  ('Lab Bahasa', 'Papan Nama Ruangan', 1),
  ('Lab Bahasa', 'Foto Presiden & Wakil, Garuda', 1),
  ('Lab Bahasa', 'Printer', 1),
  ('Lab Bahasa', 'Terminal/Listrik', 32),
  ('Lab Bahasa', 'Switch Hub LAN (24 port)', null),
  ('Lab Bahasa', 'Proyektor + Screen', 1),
  ('Lab Bahasa', 'Poster Berbahasa', 10),
  ('Lab Bahasa', 'Globe Dunia', 1),
  ('Lab Bahasa', 'Flags (Bendera) semua negara', 3),
  ('Lab Bahasa', 'Wi-Fi Router/AP', 2),

  ('Laboratorium Komputer', 'Komputer desktop', 30),
  ('Laboratorium Komputer', 'Meja komputer', 30),
  ('Laboratorium Komputer', 'Kursi siswa', 30),
  ('Laboratorium Komputer', 'Meja guru', 1),
  ('Laboratorium Komputer', 'Kursi guru', 1),
  ('Laboratorium Komputer', 'Proyektor', 1),
  ('Laboratorium Komputer', 'Layar proyektor', 1),
  ('Laboratorium Komputer', 'Papan tulis', 1),
  ('Laboratorium Komputer', 'AC split', 2),
  ('Laboratorium Komputer', 'Switch jaringan 24 port', 2),
  ('Laboratorium Komputer', 'Wi-Fi Router/AP', 2),

  ('Ruang Aula HBC', 'Karpet aula gulung', 10),
  ('Ruang Aula HBC', 'Infocus projector', 1),
  ('Ruang Aula HBC', 'Layar proyektor', 1),
  ('Ruang Aula HBC', 'Lemari penyimpanan', 2),

  ('Ruang Perpustakaan', 'Rak buku', 12),
  ('Ruang Perpustakaan', 'Meja baca', 6),
  ('Ruang Perpustakaan', 'Kursi baca', 35),
  ('Ruang Perpustakaan', 'Meja petugas perpustakaan', 1),
  ('Ruang Perpustakaan', 'Kursi petugas', 2),
  ('Ruang Perpustakaan', 'Komputer katalog', 1),
  ('Ruang Perpustakaan', 'Printer', 1),
  ('Ruang Perpustakaan', 'AC split', 2),
  ('Ruang Perpustakaan', 'Tempat sampah', 2),

  ('Sport Hall HBC', 'Bola basket', 10),
  ('Sport Hall HBC', 'Bola voli', 10),
  ('Sport Hall HBC', 'Bola futsal', 10),
  ('Sport Hall HBC', 'Net voli', 2),
  ('Sport Hall HBC', 'Ring basket', 2),
  ('Sport Hall HBC', 'Gawang futsal', 2),
  ('Sport Hall HBC', 'Matras olahraga', 20),
  ('Sport Hall HBC', 'Bangku pemain', 4),
  ('Sport Hall HBC', 'Papan skor', 1),
  ('Sport Hall HBC', 'Sound system', 1)
) as seed(room_name, name, quantity)
join public.rooms as r
  on lower(r.name) = lower(seed.room_name)
  or (seed.room_name = 'Lab Bahasa' and lower(r.name) = 'laboratorium bahasa')
on conflict do nothing;

create or replace function public.guard_room_inventory_quantity()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.active_damaged_quantity > coalesce(new.quantity, 0) then
    raise exception using errcode = '23514', message = 'Jumlah barang tidak boleh lebih kecil dari jumlah rusak aktif.';
  end if;
  if not new.is_active and new.active_damaged_quantity > 0 then
    raise exception using errcode = '23514', message = 'Barang dengan laporan kerusakan aktif belum dapat dihapus.';
  end if;
  return new;
end;
$$;

drop trigger if exists room_inventory_items_guard_quantity on public.room_inventory_items;
create trigger room_inventory_items_guard_quantity
before update of quantity, is_active on public.room_inventory_items
for each row execute function public.guard_room_inventory_quantity();

create or replace function public.track_damage_ticket_inventory()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  was_active boolean;
  becomes_active boolean;
begin
  if tg_op = 'INSERT' then
    if new.room_id is null or new.damaged_quantity is null or new.damaged_quantity < 1 then
      raise exception using errcode = '23514', message = 'Ruangan dan jumlah barang rusak wajib diisi.';
    end if;
    if new.inventory_item_id is not null then
      update public.room_inventory_items as item
      set active_damaged_quantity = item.active_damaged_quantity + new.damaged_quantity,
          updated_at = now()
      where item.id = new.inventory_item_id
        and item.room_id = new.room_id
        and item.is_active
        and item.quantity is not null
        and item.quantity - item.active_damaged_quantity >= new.damaged_quantity;
      if not found then
        raise exception using errcode = '23514', message = 'Jumlah yang dilaporkan melebihi stok tersedia atau barang tidak aktif.';
      end if;
    end if;
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if pg_trigger_depth() = 1 and (
      new.room_id is distinct from old.room_id
      or new.inventory_item_id is distinct from old.inventory_item_id
      or new.damaged_quantity is distinct from old.damaged_quantity
    ) then
      raise exception using errcode = '23514', message = 'Ruangan, barang, dan jumlah pada laporan tidak dapat diubah.';
    end if;

    was_active := old.status not in ('selesai', 'ditolak');
    becomes_active := new.status not in ('selesai', 'ditolak');

    if old.inventory_item_id is not null and was_active and not becomes_active then
      update public.room_inventory_items as item
      set active_damaged_quantity = item.active_damaged_quantity - old.damaged_quantity,
          updated_at = now()
      where item.id = old.inventory_item_id
        and item.active_damaged_quantity >= old.damaged_quantity;
      if not found then
        raise exception using errcode = '23514', message = 'Jumlah rusak aktif pada dataset tidak konsisten.';
      end if;
    elsif old.inventory_item_id is not null and not was_active and becomes_active then
      update public.room_inventory_items as item
      set active_damaged_quantity = item.active_damaged_quantity + new.damaged_quantity,
          updated_at = now()
      where item.id = new.inventory_item_id
        and item.is_active
        and item.quantity is not null
        and item.quantity - item.active_damaged_quantity >= new.damaged_quantity;
      if not found then
        raise exception using errcode = '23514', message = 'Jumlah yang dilaporkan melebihi stok tersedia atau barang tidak aktif.';
      end if;
    end if;
    return new;
  end if;

  return new;
end;
$$;

drop trigger if exists damage_tickets_track_inventory_insert on public.damage_tickets;
create trigger damage_tickets_track_inventory_insert
before insert on public.damage_tickets
for each row execute function public.track_damage_ticket_inventory();

drop trigger if exists damage_tickets_track_inventory_update on public.damage_tickets;
create trigger damage_tickets_track_inventory_update
before update of status, room_id, inventory_item_id, damaged_quantity
on public.damage_tickets
for each row execute function public.track_damage_ticket_inventory();

alter table public.room_inventory_items enable row level security;
revoke all on public.room_inventory_items from anon, authenticated;
grant select on public.room_inventory_items to authenticated;
grant insert (room_id, name, quantity) on public.room_inventory_items to authenticated;
grant update (name, quantity, is_active, updated_at) on public.room_inventory_items to authenticated;

drop policy if exists room_inventory_items_read on public.room_inventory_items;
create policy room_inventory_items_read
  on public.room_inventory_items for select to authenticated
  using (true);

drop policy if exists room_inventory_items_manager_insert on public.room_inventory_items;
create policy room_inventory_items_manager_insert
  on public.room_inventory_items for insert to authenticated
  with check (public.current_profile_role() in ('admin', 'sarpras'));

drop policy if exists room_inventory_items_manager_update on public.room_inventory_items;
create policy room_inventory_items_manager_update
  on public.room_inventory_items for update to authenticated
  using (public.current_profile_role() in ('admin', 'sarpras'))
  with check (public.current_profile_role() in ('admin', 'sarpras'));

drop policy if exists damage_tickets_insert_guru on public.damage_tickets;
create policy damage_tickets_insert_guru
  on public.damage_tickets for insert to authenticated
  with check (
    reported_by = auth.uid()
    and public.current_profile_role() = 'guru'
    and damaged_quantity > 0
    and exists (select 1 from public.rooms as room where room.id = damage_tickets.room_id)
    and (
      damage_tickets.inventory_item_id is null
      or exists (
        select 1 from public.room_inventory_items as item
        where item.id = damage_tickets.inventory_item_id
          and item.room_id = damage_tickets.room_id
          and item.is_active
      )
    )
    and exists (
      select 1 from public.profiles as p
      where p.id = auth.uid() and p.is_active and p.approval_status = 'approved'
    )
  );
