grant delete on public.damage_tickets to authenticated;

drop policy if exists damage_tickets_admin_delete on public.damage_tickets;
create policy damage_tickets_admin_delete
  on public.damage_tickets for delete to authenticated
  using (public.current_profile_role() = 'admin');

-- Keep inventory damage totals correct when an active report is deleted.
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

  if tg_op = 'DELETE' then
    was_active := old.status not in ('selesai', 'ditolak');
    if old.inventory_item_id is not null and was_active and coalesce(old.damaged_quantity, 0) > 0 then
      update public.room_inventory_items as item
      set active_damaged_quantity = item.active_damaged_quantity - old.damaged_quantity,
          updated_at = now()
      where item.id = old.inventory_item_id
        and item.active_damaged_quantity >= old.damaged_quantity;
      if not found then
        raise exception using errcode = '23514', message = 'Jumlah rusak aktif pada dataset tidak konsisten.';
      end if;
    end if;
    return old;
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

drop trigger if exists damage_tickets_track_inventory_delete on public.damage_tickets;
create trigger damage_tickets_track_inventory_delete
before delete on public.damage_tickets
for each row execute function public.track_damage_ticket_inventory();

-- Allow admins to remove attached report photos after deleting the ticket row.
drop policy if exists damage_photos_admin_delete on storage.objects;
create policy damage_photos_admin_delete
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'damage-photos'
    and public.current_profile_role() = 'admin'
  );
