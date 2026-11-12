drop policy if exists "school admins update branding" on public.schools;
create policy "school admins update branding"
on public.schools
for update
to authenticated
using (public.has_school_role(id, array['admin']::public.app_role[]))
with check (public.has_school_role(id, array['admin']::public.app_role[]));