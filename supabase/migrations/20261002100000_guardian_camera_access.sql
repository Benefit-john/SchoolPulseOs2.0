create table if not exists public.guardian_camera_access (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  camera_id uuid not null references public.cctv_cameras(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  enabled boolean not null default true,
  granted_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (camera_id, student_id)
);

create index if not exists guardian_camera_student_idx
  on public.guardian_camera_access(student_id, enabled);
create index if not exists guardian_camera_camera_idx
  on public.guardian_camera_access(camera_id, enabled);

alter table public.guardian_camera_access enable row level security;

create policy "admins manage guardian camera access"
  on public.guardian_camera_access
  for all to authenticated
  using (public.has_school_role(school_id, array['admin']::public.app_role[]))
  with check (
    public.has_school_role(school_id, array['admin']::public.app_role[])
    and exists (
      select 1 from public.cctv_cameras camera
      where camera.id = camera_id and camera.school_id = guardian_camera_access.school_id
    )
    and exists (
      select 1 from public.students student
      where student.id = student_id and student.school_id = guardian_camera_access.school_id
    )
  );

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

create policy "guardians read approved child cameras"
  on public.cctv_cameras
  for select to authenticated
  using (
    exists (
      select 1 from public.guardian_camera_access access
      join public.guardian_links link on link.student_id = access.student_id
      where access.camera_id = cctv_cameras.id
        and access.enabled
        and link.parent_id = auth.uid()
    )
  );


