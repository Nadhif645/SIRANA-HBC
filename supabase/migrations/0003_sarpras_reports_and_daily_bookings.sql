-- Sarpras recommendations are stored with each ticket/booking and attached as private PDFs.
-- Booking dates now accept every day of the week.

alter table public.damage_tickets
  add column if not exists rejection_stage text,
  add column if not exists sarpras_report text,
  add column if not exists sarpras_report_path text;

alter table public.room_bookings
  add column if not exists rejection_stage text,
  add column if not exists sarpras_report text,
  add column if not exists sarpras_report_path text;

alter table public.room_bookings
  drop constraint if exists room_bookings_weekday;

alter table public.room_bookings
  add constraint room_bookings_weekday
  check (extract(isodow from booking_date) between 1 and 7);

-- Sarpras may reject a report during initial, desk, or field verification.
drop policy if exists damage_tickets_sarpras_update on public.damage_tickets;
create policy damage_tickets_sarpras_update
  on public.damage_tickets for update to authenticated
  using (
    public.current_profile_role() = 'sarpras'
    and status in ('diajukan', 'verifikasi_sarpras', 'verifikasi_lapangan', 'proses_perbaikan')
  )
  with check (
    public.current_profile_role() = 'sarpras'
    and status in ('verifikasi_sarpras', 'verifikasi_lapangan', 'menunggu_kepsek', 'proses_perbaikan', 'selesai', 'ditolak')
  );

-- Recommendation PDFs are private. Only Sarpras can upload them; requesters and reviewers can read linked files.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('sarpras-reports', 'sarpras-reports', false, 3145728, array['application/pdf'])
on conflict (id) do update set
  public = false,
  file_size_limit = 3145728,
  allowed_mime_types = array['application/pdf'];

drop policy if exists sarpras_reports_upload on storage.objects;
create policy sarpras_reports_upload
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'sarpras-reports'
    and (storage.foldername(name))[1] = auth.uid()::text
    and public.current_profile_role() = 'sarpras'
  );

drop policy if exists sarpras_reports_read_authorized on storage.objects;
create policy sarpras_reports_read_authorized
  on storage.objects for select to authenticated
  using (
    bucket_id = 'sarpras-reports'
    and (
      exists (
        select 1 from public.damage_tickets as t
        where t.sarpras_report_path = name
          and (
            t.reported_by = auth.uid()
            or public.current_profile_role() in ('sarpras', 'kepsek', 'admin')
          )
      )
      or exists (
        select 1 from public.room_bookings as b
        where b.sarpras_report_path = name
          and (
            b.requested_by = auth.uid()
            or public.current_profile_role() in ('sarpras', 'kepsek', 'admin')
          )
      )
    )
  );

drop policy if exists sarpras_reports_delete_own on storage.objects;
create policy sarpras_reports_delete_own
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'sarpras-reports'
    and (storage.foldername(name))[1] = auth.uid()::text
    and public.current_profile_role() = 'sarpras'
  );
