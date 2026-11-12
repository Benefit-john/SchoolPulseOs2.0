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
        and (registration_code_expires_at is null or registration_code_expires_at > now())
      )
    );

  if not found then
    return array[]::public.app_role[];
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