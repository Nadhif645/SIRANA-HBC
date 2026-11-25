-- Allow approved, active Wakasek Sarpras accounts to manage room data.
-- current_profile_role() returns a role only for approved, active profiles.

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
