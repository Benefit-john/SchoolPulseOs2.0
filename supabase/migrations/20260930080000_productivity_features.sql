-- SchoolPulseOS productivity features: threads, reminders, coursework, reporting, and safer onboarding.

alter table public.students add column if not exists registration_code_expires_at timestamptz;
alter table public.students add column if not exists registration_code_used_at timestamptz;
alter table public.students add column if not exists fee_due_at timestamptz;
alter table public.notification_preferences add column if not exists fee_due_email boolean not null default true;
alter table public.notification_preferences add column if not exists fee_due_sms boolean not null default true;
alter table public.activity_events add column if not exists action text;
alter table public.activity_events add column if not exists target_type text;
alter table public.activity_events add column if not exists target_id uuid;
alter table public.activity_events add column if not exists metadata jsonb not null default '{}'::jsonb;

create table if not exists public.school_classes (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  name text not null,
  year_group text,
  class_teacher_id uuid references public.staff_directory(id) on delete set null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (school_id, name)
);
create table if not exists public.class_subjects (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  class_id uuid not null references public.school_classes(id) on delete cascade,
  name text not null,
  code text,
  teacher_id uuid references public.staff_directory(id) on delete set null,
  active boolean not null default true,
  unique (class_id, name)
);
alter table public.students add column if not exists class_id uuid references public.school_classes(id) on delete set null;
alter table public.student_results add column if not exists class_id uuid references public.school_classes(id) on delete set null;
alter table public.student_results add column if not exists subject_id uuid references public.class_subjects(id) on delete set null;
alter table public.student_assignments add column if not exists class_id uuid references public.school_classes(id) on delete set null;
alter table public.student_assignments add column if not exists subject_id uuid references public.class_subjects(id) on delete set null;

create table if not exists public.message_threads (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  student_id uuid references public.students(id) on delete set null,
  subject text not null,
  created_by uuid not null references auth.users(id) on delete restrict,
  last_message_at timestamptz not null default now(),
  archived_at timestamptz,
  created_at timestamptz not null default now()
);
create table if not exists public.message_thread_members (
  thread_id uuid not null references public.message_threads(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  last_read_at timestamptz,
  primary key (thread_id, user_id)
);
create table if not exists public.message_thread_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.message_threads(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete restrict,
  body text not null,
  attachment_path text,
  created_at timestamptz not null default now()
);
create index if not exists message_threads_school_last_idx on public.message_threads(school_id, last_message_at desc);
create index if not exists thread_messages_thread_created_idx on public.message_thread_messages(thread_id, created_at);

create table if not exists public.homework_submissions (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  assignment_id uuid not null references public.student_assignments(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  submitted_by uuid not null references auth.users(id) on delete restrict,
  body text,
  attachment_path text,
  status text not null default 'submitted' check (status in ('submitted','returned','graded')),
  grade text,
  feedback text,
  submitted_at timestamptz not null default now(),
  graded_at timestamptz,
  unique (assignment_id, student_id)
);
create index if not exists homework_submissions_student_idx on public.homework_submissions(school_id, student_id, submitted_at desc);

create table if not exists public.term_report_cards (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  term text not null,
  generated_by uuid not null references auth.users(id) on delete restrict,
  snapshot jsonb not null default '{}'::jsonb,
  generated_at timestamptz not null default now(),
  unique (school_id, student_id, term)
);

alter table public.school_classes enable row level security;
alter table public.class_subjects enable row level security;
alter table public.message_threads enable row level security;
alter table public.message_thread_members enable row level security;
alter table public.message_thread_messages enable row level security;
alter table public.homework_submissions enable row level security;
alter table public.term_report_cards enable row level security;

create policy "school members read classes" on public.school_classes for select to authenticated using (public.is_school_member(school_id));
create policy "admin teacher manage classes" on public.school_classes for all to authenticated using (public.has_school_role(school_id, array['admin','teacher']::public.app_role[])) with check (public.has_school_role(school_id, array['admin','teacher']::public.app_role[]));
create policy "school members read subjects" on public.class_subjects for select to authenticated using (public.is_school_member(school_id));
create policy "admin teacher manage subjects" on public.class_subjects for all to authenticated using (public.has_school_role(school_id, array['admin','teacher']::public.app_role[])) with check (public.has_school_role(school_id, array['admin','teacher']::public.app_role[]));

create policy "thread members read threads" on public.message_threads for select to authenticated using (exists (select 1 from public.message_thread_members m where m.thread_id = message_threads.id and m.user_id = auth.uid()));
create policy "thread members create threads" on public.message_threads for insert to authenticated with check (created_by = auth.uid() and public.is_school_member(school_id));
create policy "thread members update threads" on public.message_threads for update to authenticated using (exists (select 1 from public.message_thread_members m where m.thread_id = message_threads.id and m.user_id = auth.uid()));
create policy "thread members read membership" on public.message_thread_members for select to authenticated using (user_id = auth.uid() or exists (select 1 from public.message_thread_members m where m.thread_id = message_thread_members.thread_id and m.user_id = auth.uid()));
create policy "thread creators add members" on public.message_thread_members for insert to authenticated with check (exists (select 1 from public.message_threads t where t.id = thread_id and t.created_by = auth.uid()));
create policy "thread members read messages" on public.message_thread_messages for select to authenticated using (exists (select 1 from public.message_thread_members m where m.thread_id = message_thread_messages.thread_id and m.user_id = auth.uid()));
create policy "thread members send messages" on public.message_thread_messages for insert to authenticated with check (sender_id = auth.uid() and exists (select 1 from public.message_thread_members m where m.thread_id = message_thread_messages.thread_id and m.user_id = auth.uid()));

create policy "students read own submissions" on public.homework_submissions for select to authenticated using (submitted_by = auth.uid() or exists (select 1 from public.guardian_links gl where gl.parent_id = auth.uid() and gl.student_id = homework_submissions.student_id) or public.has_school_role(school_id, array['admin','teacher']::public.app_role[]));
create policy "students submit own homework" on public.homework_submissions for insert to authenticated with check (submitted_by = auth.uid() and exists (select 1 from public.student_accounts sa where sa.user_id = auth.uid() and sa.student_id = homework_submissions.student_id));
create policy "admin teacher grade submissions" on public.homework_submissions for update to authenticated using (public.has_school_role(school_id, array['admin','teacher']::public.app_role[])) with check (public.has_school_role(school_id, array['admin','teacher']::public.app_role[]));

create policy "portal users read own reports" on public.term_report_cards for select to authenticated using (public.has_school_role(school_id, array['admin','principal','teacher']::public.app_role[]) or exists (select 1 from public.guardian_links gl where gl.parent_id = auth.uid() and gl.student_id = term_report_cards.student_id) or exists (select 1 from public.student_accounts sa where sa.user_id = auth.uid() and sa.student_id = term_report_cards.student_id));
create policy "admin teacher generate reports" on public.term_report_cards for all to authenticated using (public.has_school_role(school_id, array['admin','teacher']::public.app_role[])) with check (public.has_school_role(school_id, array['admin','teacher']::public.app_role[]));

grant select, insert, update, delete on public.school_classes, public.class_subjects, public.message_threads, public.message_thread_members, public.message_thread_messages, public.homework_submissions, public.term_report_cards to authenticated;
grant all on public.school_classes, public.class_subjects, public.message_threads, public.message_thread_members, public.message_thread_messages, public.homework_submissions, public.term_report_cards to service_role;
