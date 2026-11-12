-- SchoolPulseOS multi-school operations schema.
-- Existing auth/profile tables remain the source of identity; all operational data is tenant-scoped.

create table if not exists public.schools (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  logo_path text,
  timezone text not null default 'Africa/Lagos',
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.school_memberships (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null,
  created_at timestamptz not null default now(),
  unique (school_id, user_id)
);

alter table public.students add column if not exists school_id uuid references public.schools(id) on delete cascade;
alter table public.students add column if not exists class_name text;
alter table public.students add column if not exists guardian_name text;
alter table public.students add column if not exists guardian_email text;
alter table public.students add column if not exists guardian_phone text;
alter table public.students add column if not exists balance numeric(12,2) not null default 0;
alter table public.students add column if not exists active boolean not null default true;

create table if not exists public.attendance_records (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  status text not null check (status in ('present','absent','late','checked_out')),
  recorded_on date not null default current_date,
  recorded_at timestamptz not null default now(),
  recorded_by uuid not null references auth.users(id) on delete restrict,
  gate text,
  notes text,
  unique (school_id, student_id, recorded_on)
);

create table if not exists public.staff_directory (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  full_name text not null,
  email text,
  phone text,
  role_title text not null,
  department text,
  access_label text not null default 'Standard',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.visitors (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  full_name text not null,
  company text,
  purpose text not null,
  host text not null,
  checked_in_at timestamptz not null default now(),
  checked_out_at timestamptz,
  registered_by uuid not null references auth.users(id) on delete restrict
);

create table if not exists public.activity_events (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  event_type text not null,
  message text not null,
  tone text not null default 'info' check (tone in ('success','info','warning','danger')),
  created_at timestamptz not null default now()
);

create table if not exists public.notification_preferences (
  school_id uuid primary key references public.schools(id) on delete cascade,
  check_in_email boolean not null default true,
  check_in_sms boolean not null default true,
  attendance_email boolean not null default true,
  attendance_sms boolean not null default true,
  updated_at timestamptz not null default now()
);

create table if not exists public.notification_outbox (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  student_id uuid references public.students(id) on delete set null,
  channel text not null check (channel in ('email','sms')),
  event_type text not null,
  recipient text not null,
  subject text,
  body text not null,
  status text not null default 'queued' check (status in ('queued','sending','sent','failed')),
  provider_message_id text,
  error_message text,
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  student_id uuid references public.students(id) on delete set null,
  amount numeric(12,2) not null check (amount > 0),
  currency text not null default 'NGN',
  method text not null,
  status text not null default 'pending' check (status in ('pending','paid','failed','refunded')),
  paystack_reference text unique,
  paid_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists school_memberships_user_idx on public.school_memberships(user_id);
create index if not exists students_school_idx on public.students(school_id, active);
create index if not exists attendance_school_day_idx on public.attendance_records(school_id, recorded_on desc);
create index if not exists activity_school_created_idx on public.activity_events(school_id, created_at desc);
create index if not exists notification_outbox_due_idx on public.notification_outbox(status, next_attempt_at);

create or replace function public.is_school_member(_school_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.school_memberships where school_id = _school_id and user_id = auth.uid())
$$;

create or replace function public.has_school_role(_school_id uuid, _roles public.app_role[])
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.school_memberships where school_id = _school_id and user_id = auth.uid() and role = any(_roles))
$$;

create or replace function public.create_school(_name text, _slug text)
returns uuid language plpgsql security definer set search_path = public as $$
declare new_school_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  insert into public.schools (name, slug, created_by) values (_name, lower(regexp_replace(_slug, '[^a-zA-Z0-9-]+', '-', 'g')), auth.uid()) returning id into new_school_id;
  insert into public.school_memberships (school_id, user_id, role) values (new_school_id, auth.uid(), 'admin');
  insert into public.notification_preferences (school_id) values (new_school_id);
  return new_school_id;
end;
$$;

revoke all on function public.create_school(text, text) from public;
grant execute on function public.create_school(text, text) to authenticated;
revoke all on function public.is_school_member(uuid) from public;
grant execute on function public.is_school_member(uuid) to authenticated;
revoke all on function public.has_school_role(uuid, public.app_role[]) from public;
grant execute on function public.has_school_role(uuid, public.app_role[]) to authenticated;

alter table public.schools enable row level security;
alter table public.school_memberships enable row level security;
alter table public.students enable row level security;
alter table public.attendance_records enable row level security;
alter table public.staff_directory enable row level security;
alter table public.visitors enable row level security;
alter table public.activity_events enable row level security;
alter table public.notification_preferences enable row level security;
alter table public.notification_outbox enable row level security;
alter table public.payments enable row level security;

drop policy if exists "school members read schools" on public.schools;
create policy "school members read schools" on public.schools for select to authenticated using (public.is_school_member(id) or created_by = auth.uid());
drop policy if exists "school members read memberships" on public.school_memberships;
create policy "school members read memberships" on public.school_memberships for select to authenticated using (user_id = auth.uid() or public.has_school_role(school_id, array['admin']::public.app_role[]));
drop policy if exists "tenant members read students" on public.students;
create policy "tenant members read students" on public.students for select to authenticated using (public.is_school_member(school_id));
drop policy if exists "tenant admins manage students" on public.students;
create policy "tenant admins manage students" on public.students for all to authenticated using (public.has_school_role(school_id, array['admin']::public.app_role[])) with check (public.has_school_role(school_id, array['admin']::public.app_role[]));
drop policy if exists "tenant members read attendance" on public.attendance_records;
create policy "tenant members read attendance" on public.attendance_records for select to authenticated using (public.is_school_member(school_id));
drop policy if exists "tenant staff write attendance" on public.attendance_records;
create policy "tenant staff write attendance" on public.attendance_records for insert to authenticated with check (public.has_school_role(school_id, array['admin','teacher','staff']::public.app_role[]));
drop policy if exists "tenant staff update attendance" on public.attendance_records;
create policy "tenant staff update attendance" on public.attendance_records for update to authenticated using (public.has_school_role(school_id, array['admin','teacher','staff']::public.app_role[])) with check (public.has_school_role(school_id, array['admin','teacher','staff']::public.app_role[]));
drop policy if exists "tenant members read staff" on public.staff_directory;
create policy "tenant members read staff" on public.staff_directory for select to authenticated using (public.is_school_member(school_id));
drop policy if exists "tenant admins manage staff" on public.staff_directory;
create policy "tenant admins manage staff" on public.staff_directory for all to authenticated using (public.has_school_role(school_id, array['admin']::public.app_role[])) with check (public.has_school_role(school_id, array['admin']::public.app_role[]));
drop policy if exists "tenant members read visitors" on public.visitors;
create policy "tenant members read visitors" on public.visitors for select to authenticated using (public.is_school_member(school_id));
drop policy if exists "tenant staff manage visitors" on public.visitors;
create policy "tenant staff manage visitors" on public.visitors for insert to authenticated with check (public.has_school_role(school_id, array['admin','staff']::public.app_role[]));
create policy "tenant staff update visitors" on public.visitors for update to authenticated using (public.has_school_role(school_id, array['admin','staff']::public.app_role[])) with check (public.has_school_role(school_id, array['admin','staff']::public.app_role[]));
drop policy if exists "tenant members read activity" on public.activity_events;
create policy "tenant members read activity" on public.activity_events for select to authenticated using (public.is_school_member(school_id));
drop policy if exists "tenant staff write activity" on public.activity_events;
create policy "tenant staff write activity" on public.activity_events for insert to authenticated with check (public.is_school_member(school_id));
drop policy if exists "tenant admins manage preferences" on public.notification_preferences;
create policy "tenant admins manage preferences" on public.notification_preferences for all to authenticated using (public.has_school_role(school_id, array['admin']::public.app_role[])) with check (public.has_school_role(school_id, array['admin']::public.app_role[]));
drop policy if exists "tenant members read notifications" on public.notification_outbox;
create policy "tenant members read notifications" on public.notification_outbox for select to authenticated using (public.is_school_member(school_id));
drop policy if exists "tenant staff enqueue notifications" on public.notification_outbox;
create policy "tenant staff enqueue notifications" on public.notification_outbox for insert to authenticated with check (public.has_school_role(school_id, array['admin','teacher','staff']::public.app_role[]));
drop policy if exists "tenant members read payments" on public.payments;
create policy "tenant members read payments" on public.payments for select to authenticated using (public.is_school_member(school_id));
drop policy if exists "tenant admins manage payments" on public.payments;
create policy "tenant admins manage payments" on public.payments for all to authenticated using (public.has_school_role(school_id, array['admin']::public.app_role[])) with check (public.has_school_role(school_id, array['admin']::public.app_role[]));


-- Parent and student portal content.
create table if not exists public.school_announcements (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  title text not null,
  body text not null,
  published_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null
);
create table if not exists public.class_timetables (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  class_name text not null,
  day_of_week smallint not null check (day_of_week between 0 and 6),
  start_time time not null,
  end_time time not null,
  subject text not null,
  teacher text
);
create table if not exists public.student_results (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  term text not null,
  subject text not null,
  score numeric(5,2),
  grade text,
  published_at timestamptz not null default now()
);
create table if not exists public.student_assignments (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  student_id uuid references public.students(id) on delete cascade,
  class_name text,
  title text not null,
  description text,
  due_at timestamptz,
  status text not null default 'assigned' check (status in ('assigned','submitted','graded','overdue'))
);
create table if not exists public.portal_messages (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  sender_id uuid references auth.users(id) on delete set null,
  recipient_user_id uuid not null references auth.users(id) on delete cascade,
  student_id uuid references public.students(id) on delete set null,
  subject text not null,
  body text not null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists announcements_school_idx on public.school_announcements(school_id, published_at desc);
create index if not exists timetable_school_class_idx on public.class_timetables(school_id, class_name, day_of_week, start_time);
create index if not exists results_student_idx on public.student_results(school_id, student_id, published_at desc);
create index if not exists assignments_student_idx on public.student_assignments(school_id, student_id, due_at);
create index if not exists messages_recipient_idx on public.portal_messages(recipient_user_id, created_at desc);

alter table public.school_announcements enable row level security;
alter table public.class_timetables enable row level security;
alter table public.student_results enable row level security;
alter table public.student_assignments enable row level security;
alter table public.portal_messages enable row level security;

create policy "members read announcements" on public.school_announcements for select to authenticated using (public.is_school_member(school_id));
create policy "admins manage announcements" on public.school_announcements for all to authenticated using (public.has_school_role(school_id, array['admin']::public.app_role[])) with check (public.has_school_role(school_id, array['admin']::public.app_role[]));
create policy "members read timetables" on public.class_timetables for select to authenticated using (public.is_school_member(school_id));
create policy "staff manage timetables" on public.class_timetables for all to authenticated using (public.has_school_role(school_id, array['admin','teacher']::public.app_role[])) with check (public.has_school_role(school_id, array['admin','teacher']::public.app_role[]));
create policy "guardians and students read results" on public.student_results for select to authenticated using (exists (select 1 from public.guardian_links gl where gl.parent_id = auth.uid() and gl.student_id = student_results.student_id) or exists (select 1 from public.student_accounts sa where sa.user_id = auth.uid() and sa.student_id = student_results.student_id) or public.has_school_role(school_id, array['admin','teacher']::public.app_role[]));
create policy "staff manage results" on public.student_results for all to authenticated using (public.has_school_role(school_id, array['admin','teacher']::public.app_role[])) with check (public.has_school_role(school_id, array['admin','teacher']::public.app_role[]));
create policy "guardians and students read assignments" on public.student_assignments for select to authenticated using (exists (select 1 from public.guardian_links gl where gl.parent_id = auth.uid() and gl.student_id = student_assignments.student_id) or exists (select 1 from public.student_accounts sa where sa.user_id = auth.uid() and sa.student_id = student_assignments.student_id) or public.has_school_role(school_id, array['admin','teacher']::public.app_role[]));
create policy "staff manage assignments" on public.student_assignments for all to authenticated using (public.has_school_role(school_id, array['admin','teacher']::public.app_role[])) with check (public.has_school_role(school_id, array['admin','teacher']::public.app_role[]));
create policy "recipients read messages" on public.portal_messages for select to authenticated using (recipient_user_id = auth.uid() or sender_id = auth.uid() or public.has_school_role(school_id, array['admin','teacher','staff']::public.app_role[]));
create policy "members send messages" on public.portal_messages for insert to authenticated with check (sender_id = auth.uid() and public.is_school_member(school_id));
create policy "recipients update messages" on public.portal_messages for update to authenticated using (recipient_user_id = auth.uid()) with check (recipient_user_id = auth.uid());

-- Private school asset bucket. Paths begin with the school UUID.
insert into storage.buckets (id, name, public) values ('school-assets', 'school-assets', false) on conflict (id) do nothing;
create policy "school members read school assets" on storage.objects for select to authenticated using (bucket_id = 'school-assets' and public.is_school_member((storage.foldername(name))[1]::uuid));
create policy "admins upload school assets" on storage.objects for insert to authenticated with check (bucket_id = 'school-assets' and public.has_school_role((storage.foldername(name))[1]::uuid, array['admin']::public.app_role[]));
create policy "admins update school assets" on storage.objects for update to authenticated using (bucket_id = 'school-assets' and public.has_school_role((storage.foldername(name))[1]::uuid, array['admin']::public.app_role[])) with check (bucket_id = 'school-assets' and public.has_school_role((storage.foldername(name))[1]::uuid, array['admin']::public.app_role[]));
create policy "admins delete school assets" on storage.objects for delete to authenticated using (bucket_id = 'school-assets' and public.has_school_role((storage.foldername(name))[1]::uuid, array['admin']::public.app_role[]));

create policy "members upload own profile images" on storage.objects for insert to authenticated with check (bucket_id = 'school-assets' and (storage.foldername(name))[2] = 'avatars' and (storage.foldername(name))[3] = auth.uid()::text and public.is_school_member((storage.foldername(name))[1]::uuid));
create policy "members update own profile images" on storage.objects for update to authenticated using (bucket_id = 'school-assets' and (storage.foldername(name))[2] = 'avatars' and (storage.foldername(name))[3] = auth.uid()::text and public.is_school_member((storage.foldername(name))[1]::uuid)) with check (bucket_id = 'school-assets' and (storage.foldername(name))[2] = 'avatars' and (storage.foldername(name))[3] = auth.uid()::text and public.is_school_member((storage.foldername(name))[1]::uuid));

-- Replace broad member read policies with least-privilege portal access.
drop policy if exists "tenant members read students" on public.students;
create policy "role scoped read students" on public.students for select to authenticated using (
  public.has_school_role(school_id, array['admin','teacher','staff']::public.app_role[])
  or exists (select 1 from public.guardian_links gl where gl.parent_id = auth.uid() and gl.student_id = students.id)
  or exists (select 1 from public.student_accounts sa where sa.user_id = auth.uid() and sa.student_id = students.id)
);
drop policy if exists "tenant members read attendance" on public.attendance_records;
create policy "role scoped read attendance" on public.attendance_records for select to authenticated using (
  public.has_school_role(school_id, array['admin','teacher','staff']::public.app_role[])
  or exists (select 1 from public.guardian_links gl where gl.parent_id = auth.uid() and gl.student_id = attendance_records.student_id)
  or exists (select 1 from public.student_accounts sa where sa.user_id = auth.uid() and sa.student_id = attendance_records.student_id)
);
drop policy if exists "tenant members read payments" on public.payments;
create policy "role scoped read payments" on public.payments for select to authenticated using (
  public.has_school_role(school_id, array['admin','teacher','staff']::public.app_role[])
  or exists (select 1 from public.guardian_links gl where gl.parent_id = auth.uid() and gl.student_id = payments.student_id)
  or exists (select 1 from public.student_accounts sa where sa.user_id = auth.uid() and sa.student_id = payments.student_id)
);
drop policy if exists "tenant members read visitors" on public.visitors;
create policy "staff read visitors" on public.visitors for select to authenticated using (public.has_school_role(school_id, array['admin','staff']::public.app_role[]));
drop policy if exists "tenant members read activity" on public.activity_events;
create policy "staff read activity" on public.activity_events for select to authenticated using (public.has_school_role(school_id, array['admin','teacher','staff']::public.app_role[]));

-- Admin step-up authentication: Twilio Verify is used for SMS codes; passkey public keys never leave this database.
create table if not exists public.admin_passkeys (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  credential_id text not null unique,
  public_key text not null,
  counter bigint not null default 0,
  transports text[] not null default '{}',
  label text not null default 'This device',
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);
create index if not exists admin_passkeys_user_idx on public.admin_passkeys(user_id);
alter table public.admin_passkeys enable row level security;
create policy "admins read own passkeys" on public.admin_passkeys for select to authenticated using (user_id = auth.uid() and public.has_role(auth.uid(), 'admin'));

create table if not exists public.auth_challenges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  challenge text not null,
  purpose text not null check (purpose in ('passkey-registration', 'passkey-authentication')),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists auth_challenges_lookup_idx on public.auth_challenges(user_id, purpose, expires_at);
alter table public.auth_challenges enable row level security;
