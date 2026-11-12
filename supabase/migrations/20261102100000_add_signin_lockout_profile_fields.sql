alter table public.profiles
  add column if not exists failed_sign_in_attempts integer not null default 0,
  add column if not exists sign_in_locked_until timestamptz;

alter table public.profiles
  add constraint profiles_failed_sign_in_attempts_nonnegative
  check (failed_sign_in_attempts >= 0);

create or replace function public.lookup_signin_profile(_identifier text)
returns table (
  id uuid,
  phone text,
  sign_in_locked_until timestamptz,
  failed_sign_in_attempts integer
)
language sql
stable
security definer
set search_path = public, auth, pg_temp
as $$
  select profile.id, profile.phone, profile.sign_in_locked_until, profile.failed_sign_in_attempts
  from public.profiles as profile
  left join auth.users as auth_user on auth_user.id = profile.id
  where profile.phone = _identifier
    or auth_user.email = lower(_identifier)
  limit 1
$$;

revoke all on function public.lookup_signin_profile(text) from public, anon, authenticated;
grant execute on function public.lookup_signin_profile(text) to service_role;