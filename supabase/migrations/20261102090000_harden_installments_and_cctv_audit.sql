-- Keep derived student balances correct when fee installments are inserted, changed, or removed.
create or replace function public.refresh_student_invoice_balance_from_installment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  affected_invoice_id uuid;
  affected_student_id uuid;
begin
  affected_invoice_id := case when tg_op = 'DELETE' then old.invoice_id else new.invoice_id end;
  select student_id into affected_student_id
  from public.fee_invoices
  where id = affected_invoice_id;

  if affected_student_id is not null then
    update public.students student
    set balance = (
      select coalesce(sum(greatest(0, invoice.amount - coalesce(paid.total_paid, 0))), 0)
      from public.fee_invoices invoice
      left join lateral (
        select sum(installment.paid_amount) as total_paid
        from public.fee_installments installment
        where installment.invoice_id = invoice.id
      ) paid on true
      where invoice.student_id = affected_student_id
        and invoice.status <> 'cancelled'
    )
    where student.id = affected_student_id;
  end if;

  if tg_op = 'UPDATE' and old.invoice_id is distinct from new.invoice_id then
    select student_id into affected_student_id
    from public.fee_invoices
    where id = old.invoice_id;
    if affected_student_id is not null then
      update public.students student
      set balance = (
        select coalesce(sum(greatest(0, invoice.amount - coalesce(paid.total_paid, 0))), 0)
        from public.fee_invoices invoice
        left join lateral (
          select sum(installment.paid_amount) as total_paid
          from public.fee_installments installment
          where installment.invoice_id = invoice.id
        ) paid on true
        where invoice.student_id = affected_student_id
          and invoice.status <> 'cancelled'
      )
      where student.id = affected_student_id;
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists refresh_student_invoice_balance_from_installment_trigger
  on public.fee_installments;
create trigger refresh_student_invoice_balance_from_installment_trigger
after insert or update or delete on public.fee_installments
for each row execute function public.refresh_student_invoice_balance_from_installment();

-- Security staff can view approved camera feeds and must be able to create an audit row.
drop policy if exists "admins log camera views" on public.camera_view_events;
drop policy if exists "guardians log camera views" on public.camera_view_events;
drop policy if exists "authorized users log camera views" on public.camera_view_events;
create policy "authorized users log camera views"
  on public.camera_view_events
  for insert to authenticated
  with check (
    public.has_school_role(school_id, array['admin','security']::public.app_role[])
    or exists (
      select 1
      from public.guardian_camera_access access
      where access.camera_id = camera_view_events.camera_id
        and access.school_id = camera_view_events.school_id
        and access.parent_id = auth.uid()
        and access.active
    )
  );

grant insert on public.camera_view_events to authenticated;

do $$
begin
  alter table public.cctv_cameras
    add constraint cctv_stream_url_https_no_credentials
    check (
      stream_url is null
      or (
        stream_url like 'https://%'
        and stream_url !~ '^https://[^/]*@'
      )
    );
exception
  when duplicate_object then null;
end;
$$;
