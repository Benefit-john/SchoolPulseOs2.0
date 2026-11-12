-- SchoolPulseOS role expansion and least-privilege portal policies.
-- Apply after the existing multi-school operations migration.

create table if not exists public.cctv_cameras (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  name text not null,
  location text not null,
  stream_url text,
  status text not null default 'offline' check (status in ('online','offline','maintenance')),
  created_at timestamptz not null default now()
);

create table if not exists public.bus_routes (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  name text not null,
  vehicle_label text,
  driver_user_id uuid references auth.users(id) on delete set null,
  provider text,
  status text not null default 'not_connected' check (status in ('not_connected','scheduled','active','completed')),
  last_latitude numeric(9,6),
  last_longitude numeric(9,6),
  last_seen_at timestamptz,
  stops jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists cctv_school_idx on public.cctv_cameras(school_id);
create index if not exists bus_routes_school_idx on public.bus_routes(school_id);
create index if not exists bus_routes_driver_idx on public.bus_routes(driver_user_id);

alter table public.cctv_cameras enable row level security;
alter table public.bus_routes enable row level security;

-- Remove broad policies created by earlier migrations before adding role-scoped replacements.
drop policy if exists "Admins manage roster" on public.students;
drop policy if exists "tenant members read students" on public.students;
drop policy if exists "tenant admins manage students" on public.students;
drop policy if exists "role scoped read students" on public.students;

drop policy if exists "tenant members read attendance" on public.attendance_records;
drop policy if exists "tenant staff write attendance" on public.attendance_records;
drop policy if exists "tenant staff update attendance" on public.attendance_records;
drop policy if exists "role scoped read attendance" on public.attendance_records;

drop policy if exists "tenant members read staff" on public.staff_directory;
drop policy if exists "tenant admins manage staff" on public.staff_directory;

drop policy if exists "tenant members read visitors" on public.visitors;
drop policy if exists "tenant staff manage visitors" on public.visitors;
drop policy if exists "tenant staff update visitors" on public.visitors;
drop policy if exists "staff read visitors" on public.visitors;

drop policy if exists "tenant members read activity" on public.activity_events;
drop policy if exists "tenant staff write activity" on public.activity_events;
drop policy if exists "staff read activity" on public.activity_events;

drop policy if exists "tenant admins manage preferences" on public.notification_preferences;
drop policy if exists "tenant members read notifications" on public.notification_outbox;
drop policy if exists "tenant staff enqueue notifications" on public.notification_outbox;
drop policy if exists "tenant members read payments" on public.payments;
drop policy if exists "tenant admins manage payments" on public.payments;

drop policy if exists "members read announcements" on public.school_announcements;
drop policy if exists "admins manage announcements" on public.school_announcements;
drop policy if exists "members read timetables" on public.class_timetables;
drop policy if exists "staff manage timetables" on public.class_timetables;
drop policy if exists "guardians and students read results" on public.student_results;
drop policy if exists "staff manage results" on public.student_results;
drop policy if exists "guardians and students read assignments" on public.student_assignments;
drop policy if exists "staff manage assignments" on public.student_assignments;
drop policy if exists "recipients read messages" on public.portal_messages;
drop policy if exists "members send messages" on public.portal_messages;
drop policy if exists "recipients update messages" on public.portal_messages;

create policy "role read students" on public.students for select to authenticated using (
  public.has_school_role(school_id, array['admin','principal','teacher','bursar']::public.app_role[])
  or exists (select 1 from public.guardian_links gl where gl.parent_id = auth.uid() and gl.student_id = students.id)
  or exists (select 1 from public.student_accounts sa where sa.user_id = auth.uid() and sa.student_id = students.id)
);
create policy "admin manage students" on public.students for all to authenticated using (public.has_school_role(school_id, array['admin']::public.app_role[])) with check (public.has_school_role(school_id, array['admin']::public.app_role[]));

create policy "role read attendance" on public.attendance_records for select to authenticated using (
  public.has_school_role(school_id, array['admin','principal','teacher']::public.app_role[])
  or exists (select 1 from public.guardian_links gl where gl.parent_id = auth.uid() and gl.student_id = attendance_records.student_id)
  or exists (select 1 from public.student_accounts sa where sa.user_id = auth.uid() and sa.student_id = attendance_records.student_id)
);
create policy "admin teacher write attendance" on public.attendance_records for insert to authenticated with check (public.has_school_role(school_id, array['admin','teacher']::public.app_role[]));
create policy "admin teacher update attendance" on public.attendance_records for update to authenticated using (public.has_school_role(school_id, array['admin','teacher']::public.app_role[])) with check (public.has_school_role(school_id, array['admin','teacher']::public.app_role[]));

create policy "admin principal read staff" on public.staff_directory for select to authenticated using (public.has_school_role(school_id, array['admin','principal']::public.app_role[]));
create policy "admin manage staff" on public.staff_directory for all to authenticated using (public.has_school_role(school_id, array['admin']::public.app_role[])) with check (public.has_school_role(school_id, array['admin']::public.app_role[]));

create policy "admin security read visitors" on public.visitors for select to authenticated using (public.has_school_role(school_id, array['admin','security']::public.app_role[]));
create policy "admin security insert visitors" on public.visitors for insert to authenticated with check (public.has_school_role(school_id, array['admin','security']::public.app_role[]));
create policy "admin security update visitors" on public.visitors for update to authenticated using (public.has_school_role(school_id, array['admin','security']::public.app_role[])) with check (public.has_school_role(school_id, array['admin','security']::public.app_role[]));

create policy "admin security read activity" on public.activity_events for select to authenticated using (public.has_school_role(school_id, array['admin','security']::public.app_role[]));
create policy "trusted roles write activity" on public.activity_events for insert to authenticated with check (public.has_school_role(school_id, array['admin','teacher','security']::public.app_role[]));

create policy "admin manage notification preferences" on public.notification_preferences for all to authenticated using (public.has_school_role(school_id, array['admin']::public.app_role[])) with check (public.has_school_role(school_id, array['admin']::public.app_role[]));
create policy "admin teacher read notifications" on public.notification_outbox for select to authenticated using (public.has_school_role(school_id, array['admin','teacher']::public.app_role[]));
create policy "admin teacher enqueue notifications" on public.notification_outbox for insert to authenticated with check (public.has_school_role(school_id, array['admin','teacher']::public.app_role[]));

create policy "admin bursar read payments" on public.payments for select to authenticated using (
  public.has_school_role(school_id, array['admin','bursar']::public.app_role[])
  or exists (select 1 from public.guardian_links gl where gl.parent_id = auth.uid() and gl.student_id = payments.student_id)
  or exists (select 1 from public.student_accounts sa where sa.user_id = auth.uid() and sa.student_id = payments.student_id)
);
create policy "admin bursar manage payments" on public.payments for all to authenticated using (public.has_school_role(school_id, array['admin','bursar']::public.app_role[])) with check (public.has_school_role(school_id, array['admin','bursar']::public.app_role[]));

create policy "members read announcements" on public.school_announcements for select to authenticated using (public.is_school_member(school_id));
create policy "admin manage announcements" on public.school_announcements for all to authenticated using (public.has_school_role(school_id, array['admin']::public.app_role[])) with check (public.has_school_role(school_id, array['admin']::public.app_role[]));

create policy "portal roles read timetable" on public.class_timetables for select to authenticated using (public.has_school_role(school_id, array['admin','principal','teacher']::public.app_role[]) or exists (select 1 from public.guardian_links gl join public.students s on s.id = gl.student_id where gl.parent_id = auth.uid() and s.school_id = class_timetables.school_id and s.class_name = class_timetables.class_name) or exists (select 1 from public.student_accounts sa join public.students s on s.id = sa.student_id where sa.user_id = auth.uid() and s.school_id = class_timetables.school_id and s.class_name = class_timetables.class_name));
create policy "admin teacher manage timetable" on public.class_timetables for all to authenticated using (public.has_school_role(school_id, array['admin','teacher']::public.app_role[])) with check (public.has_school_role(school_id, array['admin','teacher']::public.app_role[]));

create policy "academic roles read results" on public.student_results for select to authenticated using (public.has_school_role(school_id, array['admin','teacher']::public.app_role[]) or exists (select 1 from public.guardian_links gl where gl.parent_id = auth.uid() and gl.student_id = student_results.student_id) or exists (select 1 from public.student_accounts sa where sa.user_id = auth.uid() and sa.student_id = student_results.student_id));
create policy "admin teacher manage results" on public.student_results for all to authenticated using (public.has_school_role(school_id, array['admin','teacher']::public.app_role[])) with check (public.has_school_role(school_id, array['admin','teacher']::public.app_role[]));

create policy "academic roles read assignments" on public.student_assignments for select to authenticated using (public.has_school_role(school_id, array['admin','teacher']::public.app_role[]) or exists (select 1 from public.guardian_links gl where gl.parent_id = auth.uid() and gl.student_id = student_assignments.student_id) or exists (select 1 from public.student_accounts sa where sa.user_id = auth.uid() and sa.student_id = student_assignments.student_id));
create policy "admin teacher manage assignments" on public.student_assignments for all to authenticated using (public.has_school_role(school_id, array['admin','teacher']::public.app_role[])) with check (public.has_school_role(school_id, array['admin','teacher']::public.app_role[]));

create policy "message participants read" on public.portal_messages for select to authenticated using (recipient_user_id = auth.uid() or sender_id = auth.uid() or public.has_school_role(school_id, array['admin','teacher']::public.app_role[]));
create policy "members send messages" on public.portal_messages for insert to authenticated with check (sender_id = auth.uid() and public.is_school_member(school_id));
create policy "recipients update messages" on public.portal_messages for update to authenticated using (recipient_user_id = auth.uid()) with check (recipient_user_id = auth.uid());

create policy "admin security read cameras" on public.cctv_cameras for select to authenticated using (public.has_school_role(school_id, array['admin','security']::public.app_role[]));
create policy "admin manage cameras" on public.cctv_cameras for all to authenticated using (public.has_school_role(school_id, array['admin']::public.app_role[])) with check (public.has_school_role(school_id, array['admin']::public.app_role[]));

create policy "admin driver read assigned routes" on public.bus_routes for select to authenticated using (public.has_school_role(school_id, array['admin']::public.app_role[]) or (public.has_school_role(school_id, array['driver']::public.app_role[]) and driver_user_id = auth.uid()));
create policy "admin manage routes" on public.bus_routes for all to authenticated using (public.has_school_role(school_id, array['admin']::public.app_role[])) with check (public.has_school_role(school_id, array['admin']::public.app_role[]));

grant select, insert, update, delete on public.cctv_cameras to authenticated;
grant all on public.cctv_cameras to service_role;
grant select, insert, update, delete on public.bus_routes to authenticated;
grant all on public.bus_routes to service_role;
