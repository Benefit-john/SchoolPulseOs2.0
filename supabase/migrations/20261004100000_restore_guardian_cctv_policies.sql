-- Restore parent CCTV access after the admin-only policy migration.
-- Access remains scoped through an approved guardian link and enabled grant.

drop policy if exists "guardians read their approved camera access" on public.guardian_camera_access;
create policy "guardians read their approved camera access"
  on public.guardian_camera_access
  for select to authenticated
  using (
    enabled
    and exists (
      select 1 from public.guardian_links link
      where link.parent_id = auth.uid()
        and link.student_id = guardian_camera_access.student_id
    )
  );

drop policy if exists "guardians read approved child cameras" on public.cctv_cameras;
create policy "guardians read approved child cameras"
  on public.cctv_cameras
  for select to authenticated
  using (
    exists (
      select 1
      from public.guardian_camera_access access
      join public.guardian_links link on link.student_id = access.student_id
      where access.camera_id = cctv_cameras.id
        and access.enabled
        and link.parent_id = auth.uid()
    )
  );

drop policy if exists "guardians log camera views" on public.camera_view_events;
create policy "guardians log camera views"
  on public.camera_view_events
  for insert to authenticated
  with check (
    viewer_id = auth.uid()
    and exists (
      select 1
      from public.guardian_camera_access access
      join public.guardian_links link on link.student_id = access.student_id
      where access.camera_id = camera_view_events.camera_id
        and access.school_id = camera_view_events.school_id
        and access.enabled
        and link.parent_id = auth.uid()
    )
  );

grant select on public.guardian_camera_access to authenticated;
grant select on public.cctv_cameras to authenticated;
grant insert on public.camera_view_events to authenticated;
