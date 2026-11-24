-- Allow cleanup of failed uploads, but keep PDFs that are linked to a report.
drop policy if exists sarpras_reports_delete_own on storage.objects;
create policy sarpras_reports_delete_own
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'sarpras-reports'
    and (storage.foldername(name))[1] = auth.uid()::text
    and public.current_profile_role() = 'sarpras'
    and not exists (
      select 1 from public.damage_tickets as t
      where t.sarpras_report_path = name
    )
    and not exists (
      select 1 from public.room_bookings as b
      where b.sarpras_report_path = name
    )
  );
