-- Private photo storage for damage reports submitted by approved teachers.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'damage-photos',
  'damage-photos',
  false,
  3145728,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update set
  public = false,
  file_size_limit = 3145728,
  allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

drop policy if exists damage_photos_upload_own on storage.objects;
create policy damage_photos_upload_own
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'damage-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
    and public.current_profile_role() = 'guru'
  );

drop policy if exists damage_photos_delete_unlinked_own on storage.objects;
create policy damage_photos_delete_unlinked_own
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'damage-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
    and not exists (
      select 1 from public.damage_tickets as t
      where t.photo_url = name
    )
  );

drop policy if exists booking_letters_delete_unlinked_own on storage.objects;
create policy booking_letters_delete_unlinked_own
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'booking-letters'
    and (storage.foldername(name))[1] = auth.uid()::text
    and not exists (
      select 1 from public.room_bookings as b
      where b.letter_path = name
    )
  );

drop policy if exists damage_photos_read_authorized on storage.objects;
create policy damage_photos_read_authorized
  on storage.objects for select to authenticated
  using (
    bucket_id = 'damage-photos'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or (
        public.current_profile_role() in ('sarpras', 'kepsek', 'admin')
        and exists (
          select 1 from public.damage_tickets as t
          where t.photo_url = name
        )
      )
    )
  );
