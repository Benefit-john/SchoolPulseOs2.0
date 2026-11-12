  create table if not exists public.registration_validation_rate_limits (
  bucket_key text primary key,
  window_started_at timestamptz not null,
  attempt_count integer not null check (attempt_count > 0)
);

create index if not exists registration_validation_rate_limits_window_idx
  on public.registration_validation_rate_limits(window_started_at);

alter table public.registration_validation_rate_limits enable row level security;
revoke all on public.registration_validation_rate_limits from public, anon, authenticated;
grant all on public.registration_validation_rate_limits to service_role;

create or replace function public.allow_registration_validation(
  _student_code text,
  _source_ip text default null
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_time timestamptz := clock_timestamp();
  student_attempts integer;
  source_attempts integer;
begin
  insert into public.registration_validation_rate_limits as limits
    (bucket_key, window_started_at, attempt_count)
  values ('student:' || md5(lower(btrim(_student_code))), current_time, 1)
  on conflict (bucket_key) do update
  set window_started_at = case
        when limits.window_started_at <= current_time - interval '5 minutes'
          then current_time
        else limits.window_started_at
      end,
      attempt_count = case
        when limits.window_started_at <= current_time - interval '5 minutes' then 1
        else least(limits.attempt_count + 1, 1000)
      end
  returning attempt_count into student_attempts;

  if nullif(btrim(_source_ip), '') is not null then
    insert into public.registration_validation_rate_limits as limits
      (bucket_key, window_started_at, attempt_count)
    values ('ip:' || md5(btrim(_source_ip)), current_time, 1)
    on conflict (bucket_key) do update
    set window_started_at = case
          when limits.window_started_at <= current_time - interval '5 minutes'
            then current_time
          else limits.window_started_at
        end,
        attempt_count = case
          when limits.window_started_at <= current_time - interval '5 minutes' then 1
          else least(limits.attempt_count + 1, 1000)
        end
    returning attempt_count into source_attempts;
  end if;

  delete from public.registration_validation_rate_limits
  where window_started_at < current_time - interval '1 day';

  return student_attempts <= 10
    and (source_attempts is null or source_attempts <= 60);
end;
$$;

revoke all on function public.allow_registration_validation(text, text)
  from public, anon, authenticated;
grant execute on function public.allow_registration_validation(text, text) to service_role;

create or replace function public.complete_registration()
returns public.app_role[]
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  current_user_id uuid := auth.uid();
  metadata jsonb := auth.jwt() -> 'user_metadata';
  requested_role text := metadata ->> 'intended_role';
  student public.students%rowtype;
  existing_roles public.app_role[];
  registration_code_valid boolean := false;
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;

  insert into public.profiles (id, full_name)
  values (
    current_user_id,
    nullif(metadata ->> 'full_name', '')
  )
  on conflict (id) do nothing;

  select array_agg(role) into existing_roles
  from public.user_roles
  where user_id = current_user_id;

  if coalesce(cardinality(existing_roles), 0) > 0 then
    return existing_roles;
  end if;

  if requested_role = 'admin' then
    perform pg_advisory_xact_lock(hashtextextended('schoolpulse-first-admin', 0));
    if exists (select 1 from public.user_roles where role = 'admin') then
      return array[]::public.app_role[];
    end if;
    insert into public.user_roles (user_id, role) values (current_user_id, 'admin');
    return array['admin'::public.app_role];
  end if;

  if requested_role not in ('parent', 'student') then
    return array[]::public.app_role[];
  end if;

  select * into student
  from public.students
  where student_code = metadata ->> 'student_code'
    and (
      (
        metadata ->> 'date_of_birth' is not null
        and to_char(date_of_birth, 'YYYY-MM-DD') = metadata ->> 'date_of_birth'
      )
      or (
        metadata ->> 'registration_code' is not null
        and registration_code = metadata ->> 'registration_code'
        and registration_code_used_at is null
        and (registration_code_expires_at is null or registration_code_expires_at > now())
      )
    )
  for update;

  if not found then
    return array[]::public.app_role[];
  end if;

  registration_code_valid :=
    metadata ->> 'registration_code' is not null
    and student.registration_code = metadata ->> 'registration_code'
    and student.registration_code_used_at is null
    and (student.registration_code_expires_at is null or student.registration_code_expires_at > now());

  if registration_code_valid then
    update public.students
    set registration_code_used_at = now()
    where id = student.id;
  end if;

  insert into public.user_roles (user_id, role)
  values (current_user_id, requested_role::public.app_role);

  if requested_role = 'parent' then
    insert into public.guardian_links (parent_id, student_id, relationship)
    values (
      current_user_id,
      student.id,
      coalesce(nullif(metadata ->> 'relationship', ''), 'Guardian')
    );
  else
    insert into public.student_accounts (user_id, student_id)
    values (current_user_id, student.id);
  end if;

  return array[requested_role::public.app_role];
end;
$$;

revoke all on function public.complete_registration() from public;
grant execute on function public.complete_registration() to authenticated;
