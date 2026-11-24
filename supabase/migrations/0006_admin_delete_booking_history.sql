grant delete on public.room_bookings to authenticated;

drop policy if exists room_bookings_admin_delete on public.room_bookings;
create policy room_bookings_admin_delete
  on public.room_bookings for delete to authenticated
  using (public.current_profile_role() = 'admin');

grant delete on storage.objects to authenticated;

drop policy if exists booking_files_admin_delete on storage.objects;
create policy booking_files_admin_delete
  on storage.objects for delete to authenticated
  using (
    bucket_id in ('booking-letters', 'sarpras-reports')
    and public.current_profile_role() = 'admin'
  );
