-- Restore permissions narrowed by the later fee/webhook migration.
-- Security can view cameras; only admins can create or edit camera records.
drop policy if exists "admins read cameras" on public.cctv_cameras;
drop policy if exists "admins and security read cameras" on public.cctv_cameras;
create policy "admins and security read cameras"
  on public.cctv_cameras
  for select to authenticated
  using (public.has_school_role(school_id, array['admin','security']::public.app_role[]));

drop policy if exists "admin bursar manage payments" on public.payments;
create policy "admin bursar manage payments"
  on public.payments
  for all to authenticated
  using (public.has_school_role(school_id, array['admin','bursar']::public.app_role[]))
  with check (public.has_school_role(school_id, array['admin','bursar']::public.app_role[]));

grant select, insert, update, delete on public.payments to authenticated;
