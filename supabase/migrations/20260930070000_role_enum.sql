-- Add the full SchoolPulseOS role set before role-scoped policies are applied.
alter type public.app_role add value if not exists 'principal';
alter type public.app_role add value if not exists 'bursar';
alter type public.app_role add value if not exists 'security';
alter type public.app_role add value if not exists 'librarian';
alter type public.app_role add value if not exists 'nurse';
alter type public.app_role add value if not exists 'driver';
