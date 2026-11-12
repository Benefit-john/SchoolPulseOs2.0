create table if not exists public.fee_invoices (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  student_name_snapshot text,
  title text not null,
  term text not null,
  amount numeric(12,2) not null check (amount > 0),
  currency text not null default 'NGN' check (currency = 'NGN'),
  due_at date not null,
  status text not null default 'unpaid' check (status in ('unpaid','partial','paid','cancelled')),
  allowed_installment_counts smallint[] not null default array[2,3]::smallint[],
  installment_due_dates_2 date[] not null default '{}'::date[],
  installment_due_dates_3 date[] not null default '{}'::date[],
  chosen_installment_count smallint,
  is_legacy_balance boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  check (array[2,3]::smallint[] @> allowed_installment_counts),
  check (chosen_installment_count is null or chosen_installment_count between 1 and 3)
);

create table if not exists public.fee_invoice_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.fee_invoices(id) on delete cascade,
  description text not null,
  amount numeric(12,2) not null check (amount > 0),
  created_at timestamptz not null default now()
);
create index if not exists fee_invoice_items_invoice_idx on public.fee_invoice_items(invoice_id);

create unique index if not exists fee_invoice_legacy_student_unique
  on public.fee_invoices(student_id) where is_legacy_balance;
create index if not exists fee_invoice_student_due_idx
  on public.fee_invoices(student_id, due_at);

create table if not exists public.fee_installments (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.fee_invoices(id) on delete cascade,
  sequence smallint not null check (sequence between 1 and 3),
  amount numeric(12,2) not null check (amount > 0),
  paid_amount numeric(12,2) not null default 0 check (paid_amount >= 0 and paid_amount <= amount),
  due_at date not null,
  status text not null default 'unpaid' check (status in ('unpaid','partial','paid')),
  created_at timestamptz not null default now(),
  unique (invoice_id, sequence)
);
create index if not exists fee_installment_invoice_due_idx
  on public.fee_installments(invoice_id, due_at);

create or replace function public.refresh_student_invoice_balance()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  affected_student_id uuid;
begin
  affected_student_id := case when tg_op = 'DELETE' then old.student_id else new.student_id end;
  update public.students student
  set balance = (
    select coalesce(sum(greatest(0, invoice.amount - coalesce(paid.total_paid, 0))), 0)
    from public.fee_invoices invoice
    left join lateral (
      select sum(installment.paid_amount) as total_paid
      from public.fee_installments installment where installment.invoice_id = invoice.id
    ) paid on true
    where invoice.student_id = affected_student_id and invoice.status <> 'cancelled'
  )
  where student.id = affected_student_id;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;
drop trigger if exists refresh_student_invoice_balance_trigger on public.fee_invoices;
create trigger refresh_student_invoice_balance_trigger
  after insert or update or delete on public.fee_invoices
  for each row execute function public.refresh_student_invoice_balance();

alter table public.payments
  add column if not exists invoice_id uuid references public.fee_invoices(id) on delete set null,
  add column if not exists installment_id uuid references public.fee_installments(id) on delete set null,
  add column if not exists payer_user_id uuid references auth.users(id) on delete set null;

alter table public.notification_outbox
  add column if not exists payment_id uuid references public.payments(id) on delete set null;
create unique index if not exists notification_payment_channel_unique
  on public.notification_outbox(payment_id, channel) where payment_id is not null;

alter table public.fee_invoices enable row level security;
alter table public.fee_installments enable row level security;
alter table public.fee_invoice_items enable row level security;

drop policy if exists "guardians read linked invoices" on public.fee_invoices;
create policy "guardians read linked invoices" on public.fee_invoices
  for select to authenticated using (
    exists (
      select 1 from public.guardian_links link
      where link.parent_id = auth.uid() and link.student_id = fee_invoices.student_id
    )
  );
drop policy if exists "school finance manage invoices" on public.fee_invoices;
create policy "school finance manage invoices" on public.fee_invoices
  for all to authenticated
  using (public.has_school_role(school_id, array['admin','bursar']::public.app_role[]))
  with check (public.has_school_role(school_id, array['admin','bursar']::public.app_role[]));

drop policy if exists "guardians read linked invoice items" on public.fee_invoice_items;
create policy "guardians read linked invoice items" on public.fee_invoice_items
  for select to authenticated using (
    exists (
      select 1 from public.fee_invoices invoice
      join public.guardian_links link on link.student_id = invoice.student_id
      where invoice.id = fee_invoice_items.invoice_id and link.parent_id = auth.uid()
    )
  );
drop policy if exists "school finance manage invoice items" on public.fee_invoice_items;
create policy "school finance manage invoice items" on public.fee_invoice_items
  for all to authenticated using (
    exists (
      select 1 from public.fee_invoices invoice
      where invoice.id = fee_invoice_items.invoice_id
        and public.has_school_role(invoice.school_id, array['admin','bursar']::public.app_role[])
    )
  ) with check (
    exists (
      select 1 from public.fee_invoices invoice
      where invoice.id = fee_invoice_items.invoice_id
        and public.has_school_role(invoice.school_id, array['admin','bursar']::public.app_role[])
    )
  );

drop policy if exists "guardians read linked installments" on public.fee_installments;
create policy "guardians read linked installments" on public.fee_installments
  for select to authenticated using (
    exists (
      select 1 from public.fee_invoices invoice
      join public.guardian_links link on link.student_id = invoice.student_id
      where invoice.id = fee_installments.invoice_id and link.parent_id = auth.uid()
    )
  );
drop policy if exists "school finance manage installments" on public.fee_installments;
create policy "school finance manage installments" on public.fee_installments
  for all to authenticated using (
    exists (
      select 1 from public.fee_invoices invoice
      where invoice.id = fee_installments.invoice_id
        and public.has_school_role(invoice.school_id, array['admin','bursar']::public.app_role[])
    )
  ) with check (
    exists (
      select 1 from public.fee_invoices invoice
      where invoice.id = fee_installments.invoice_id
        and public.has_school_role(invoice.school_id, array['admin','bursar']::public.app_role[])
    )
  );

drop policy if exists "admin bursar manage payments" on public.payments;
drop policy if exists "tenant admins manage payments" on public.payments;

grant select on public.fee_invoices, public.fee_installments, public.fee_invoice_items to authenticated;
grant insert, update, delete on public.fee_invoices, public.fee_installments, public.fee_invoice_items to authenticated;

insert into public.fee_invoices (
  school_id, student_id, student_name_snapshot, title, term, amount, currency, due_at, allowed_installment_counts, is_legacy_balance
)
select
  student.school_id,
  student.id,
  student.full_name,
  'Outstanding school fees',
  'Current balance',
  student.balance,
  'NGN',
  coalesce(student.fee_due_at::date, current_date + 30),
  array[2,3]::smallint[],
  true
from public.students student
where student.balance > 0 and student.active
on conflict (student_id) where is_legacy_balance do nothing;

insert into public.fee_installments (invoice_id, sequence, amount, due_at)
select invoice.id, 1, invoice.amount, invoice.due_at
from public.fee_invoices invoice
where invoice.is_legacy_balance
  and not exists (
    select 1 from public.fee_installments installment where installment.invoice_id = invoice.id
  );

insert into public.fee_invoice_items (invoice_id, description, amount)
select invoice.id, 'Outstanding school fees', invoice.amount
from public.fee_invoices invoice
where invoice.is_legacy_balance
  and not exists (
    select 1 from public.fee_invoice_items item where item.invoice_id = invoice.id
  );

update public.payments payment
set invoice_id = invoice.id, installment_id = installment.id
from public.fee_invoices invoice
join public.fee_installments installment on installment.invoice_id = invoice.id and installment.sequence = 1
where payment.status = 'pending'
  and payment.invoice_id is null
  and payment.student_id = invoice.student_id
  and invoice.is_legacy_balance;

create or replace function public.create_fee_installment_plan(
  _invoice_id uuid,
  _parent_id uuid,
  _installment_count smallint
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  invoice_row public.fee_invoices%rowtype;
  base_amount numeric(12,2);
  due_date date;
  installment_amount numeric(12,2);
  installment_sequence smallint;
begin
  select * into invoice_row
  from public.fee_invoices
  where id = _invoice_id
  for update;

  if not found or invoice_row.status in ('paid','cancelled') then
    return false;
  end if;
  if invoice_row.chosen_installment_count is not null then
    return invoice_row.chosen_installment_count = _installment_count;
  end if;
  if not exists (
    select 1 from public.guardian_links
    where parent_id = _parent_id and student_id = invoice_row.student_id
  ) then
    return false;
  end if;
  if _installment_count < 1 or _installment_count > 3 then
    return false;
  end if;
  if _installment_count > 1 and not (_installment_count = any(invoice_row.allowed_installment_counts)) then
    return false;
  end if;
  if _installment_count > 1 and invoice_row.due_at <= current_date then
    return false;
  end if;
  if _installment_count = 2 and cardinality(invoice_row.installment_due_dates_2) not in (0, 2) then
    return false;
  end if;
  if _installment_count = 2 and cardinality(invoice_row.installment_due_dates_2) = 2 and (
    invoice_row.installment_due_dates_2[1] < current_date
    or invoice_row.installment_due_dates_2[1] >= invoice_row.installment_due_dates_2[2]
    or invoice_row.installment_due_dates_2[2] <> invoice_row.due_at
  ) then
    return false;
  end if;
  if _installment_count = 3 and cardinality(invoice_row.installment_due_dates_3) not in (0, 3) then
    return false;
  end if;
  if _installment_count = 3 and cardinality(invoice_row.installment_due_dates_3) = 3 and (
    invoice_row.installment_due_dates_3[1] < current_date
    or invoice_row.installment_due_dates_3[1] >= invoice_row.installment_due_dates_3[2]
    or invoice_row.installment_due_dates_3[2] >= invoice_row.installment_due_dates_3[3]
    or invoice_row.installment_due_dates_3[3] <> invoice_row.due_at
  ) then
    return false;
  end if;
  if exists (
    select 1
    from public.fee_installments installment
    join public.payments payment on payment.installment_id = installment.id
    where installment.invoice_id = _invoice_id and payment.status in ('pending','paid')
  ) then
    return false;
  end if;

  delete from public.fee_installments where invoice_id = _invoice_id;

  base_amount := round(invoice_row.amount / _installment_count, 2);
  for installment_sequence in 1.._installment_count loop
    installment_amount := case
      when installment_sequence = _installment_count
        then invoice_row.amount - base_amount * (_installment_count - 1)
      else base_amount
    end;
    if _installment_count = 2 and cardinality(invoice_row.installment_due_dates_2) = 2 then
      due_date := invoice_row.installment_due_dates_2[installment_sequence];
    elsif _installment_count = 3 and cardinality(invoice_row.installment_due_dates_3) = 3 then
      due_date := invoice_row.installment_due_dates_3[installment_sequence];
    else
      due_date := case
        when installment_sequence = _installment_count then invoice_row.due_at
        else greatest(
          current_date,
          current_date + ceil(
            ((invoice_row.due_at - current_date)::numeric * installment_sequence) / _installment_count
          )::integer
        )
      end;
    end if;
    insert into public.fee_installments (invoice_id, sequence, amount, due_at)
    values (_invoice_id, installment_sequence, installment_amount, due_date);
  end loop;

  update public.fee_invoices
  set chosen_installment_count = _installment_count
  where id = _invoice_id;
  return true;
end;
$$;

create or replace function public.create_paystack_payment(
  _school_id uuid,
  _student_id uuid,
  _invoice_id uuid,
  _installment_id uuid,
  _method text,
  _payer_user_id uuid,
  _reference text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  invoice_row public.fee_invoices%rowtype;
  installment_row public.fee_installments%rowtype;
  reserved_amount numeric(12,2);
  charge_amount numeric(12,2);
  new_payment_id uuid;
begin
  select * into invoice_row
  from public.fee_invoices
  where id = _invoice_id and school_id = _school_id and student_id = _student_id
  for update;
  if not found or invoice_row.status in ('paid','cancelled') then
    return null;
  end if;
  if not exists (
    select 1 from public.guardian_links
    where parent_id = _payer_user_id and student_id = _student_id
  ) then
    return null;
  end if;

  select * into installment_row
  from public.fee_installments
  where id = _installment_id and invoice_id = _invoice_id
  for update;
  if not found or installment_row.status = 'paid' then
    return null;
  end if;

  select coalesce(sum(amount), 0) into reserved_amount
  from public.payments
  where installment_id = _installment_id and status = 'pending';
  charge_amount := installment_row.amount - installment_row.paid_amount - reserved_amount;
  if charge_amount < 100 then
    return null;
  end if;

  insert into public.payments (
    school_id, student_id, invoice_id, installment_id, payer_user_id,
    amount, currency, method, status, paystack_reference
  ) values (
    _school_id, _student_id, _invoice_id, _installment_id, _payer_user_id,
    charge_amount, 'NGN', _method, 'pending', _reference
  ) returning id into new_payment_id;
  return jsonb_build_object('payment_id', new_payment_id, 'amount', charge_amount);
end;
$$;

create or replace function public.apply_verified_paystack_payment(
  _reference text,
  _paid_at timestamptz,
  _amount_minor bigint,
  _currency text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  payment_row public.payments%rowtype;
  installment_row public.fee_installments%rowtype;
  invoice_row public.fee_invoices%rowtype;
  invoice_paid numeric(12,2);
  new_paid_amount numeric(12,2);
  payment_email text;
begin
  select * into payment_row
  from public.payments
  where paystack_reference = _reference
  for update;
  if not found then
    return jsonb_build_object('ok', false, 'message', 'Payment reference not found');
  end if;
  if payment_row.status = 'paid' then
    return jsonb_build_object('ok', true, 'already_settled', true, 'payment_id', payment_row.id);
  end if;
  if payment_row.status <> 'pending'
    or upper(_currency) <> payment_row.currency
    or _amount_minor <> round(payment_row.amount * 100)::bigint then
    return jsonb_build_object('ok', false, 'message', 'Payment amount or currency mismatch');
  end if;

  select * into installment_row
  from public.fee_installments
  where id = payment_row.installment_id
  for update;
  if not found or payment_row.invoice_id is null then
    return jsonb_build_object('ok', false, 'message', 'Invoice installment not found');
  end if;
  if payment_row.amount > installment_row.amount - installment_row.paid_amount then
    return jsonb_build_object('ok', false, 'message', 'Installment is already fully allocated');
  end if;

  new_paid_amount := installment_row.paid_amount + payment_row.amount;
  update public.fee_installments
  set paid_amount = new_paid_amount,
      status = case when new_paid_amount >= amount then 'paid' else 'partial' end
  where id = installment_row.id;
  update public.payments
  set status = 'paid', paid_at = _paid_at
  where id = payment_row.id;

  select * into invoice_row from public.fee_invoices where id = payment_row.invoice_id for update;
  select coalesce(sum(paid_amount), 0) into invoice_paid
  from public.fee_installments where invoice_id = invoice_row.id;
  update public.fee_invoices
  set status = case
    when invoice_paid >= amount then 'paid'
    when invoice_paid > 0 then 'partial'
    else 'unpaid'
  end
  where id = invoice_row.id;

  update public.students student
  set balance = (
    select coalesce(sum(greatest(0, invoice.amount - coalesce(paid.total_paid, 0))), 0)
    from public.fee_invoices invoice
    left join lateral (
      select sum(item.paid_amount) as total_paid
      from public.fee_installments item where item.invoice_id = invoice.id
    ) paid on true
    where invoice.student_id = payment_row.student_id
      and invoice.status <> 'cancelled'
  )
  where student.id = payment_row.student_id and student.school_id = payment_row.school_id;

  select auth_user.email into payment_email
  from auth.users auth_user where auth_user.id = payment_row.payer_user_id;
  if payment_email is not null then
    insert into public.notification_outbox (
      school_id, student_id, payment_id, channel, event_type, recipient, subject, body
    ) values (
      payment_row.school_id,
      payment_row.student_id,
      payment_row.id,
      'email',
      'payment-confirmed',
      payment_email,
      'School fee payment confirmed',
      format('Your payment of NGN %s for %s has been confirmed. Reference: %s',
        payment_row.amount,
        invoice_row.title,
        payment_row.paystack_reference)
    ) on conflict (payment_id, channel) where payment_id is not null do nothing;
  end if;

  return jsonb_build_object(
    'ok', true,
    'already_settled', false,
    'payment_id', payment_row.id,
    'school_id', payment_row.school_id,
    'student_id', payment_row.student_id
  );
end;
$$;

create or replace function public.mark_paystack_payment_failed(_reference text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.payments
  set status = 'failed'
  where paystack_reference = _reference and status = 'pending';
  return found;
end;
$$;

create table if not exists public.payment_reconciliation_flags (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  payment_id uuid references public.payments(id) on delete set null,
  paystack_reference text not null,
  reason text not null,
  expected_amount_minor bigint,
  received_amount_minor bigint,
  expected_currency text,
  received_currency text,
  status text not null default 'open' check (status in ('open','reviewed','resolved')),
  created_at timestamptz not null default now(),
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz
);
create unique index if not exists payment_reconciliation_reference_unique
  on public.payment_reconciliation_flags(paystack_reference) where status = 'open';
create index if not exists payment_reconciliation_school_created_idx
  on public.payment_reconciliation_flags(school_id, created_at desc);
alter table public.payment_reconciliation_flags enable row level security;
drop policy if exists "finance read payment reconciliation" on public.payment_reconciliation_flags;
create policy "finance read payment reconciliation" on public.payment_reconciliation_flags
  for select to authenticated
  using (public.has_school_role(school_id, array['admin','bursar']::public.app_role[]));
grant select on public.payment_reconciliation_flags to authenticated;

create or replace function public.flag_paystack_reconciliation(
  _reference text,
  _reason text,
  _received_amount_minor bigint,
  _received_currency text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  payment_row public.payments%rowtype;
begin
  select * into payment_row
  from public.payments
  where paystack_reference = _reference
  for update;
  if not found then
    return false;
  end if;
  insert into public.payment_reconciliation_flags (
    school_id, payment_id, paystack_reference, reason,
    expected_amount_minor, received_amount_minor, expected_currency, received_currency
  ) values (
    payment_row.school_id, payment_row.id, _reference, _reason,
    round(payment_row.amount * 100)::bigint, _received_amount_minor,
    payment_row.currency, _received_currency
  ) on conflict (paystack_reference) where status = 'open' do nothing;
  return true;
end;
$$;
revoke all on function public.flag_paystack_reconciliation(text, text, bigint, text) from public, anon, authenticated;
grant execute on function public.flag_paystack_reconciliation(text, text, bigint, text) to service_role;

drop function if exists public.apply_verified_paystack_payment(text, timestamptz);
revoke all on function public.create_fee_installment_plan(uuid, uuid, smallint) from public, anon, authenticated;
revoke all on function public.create_paystack_payment(uuid, uuid, uuid, uuid, text, uuid, text) from public, anon, authenticated;
revoke all on function public.apply_verified_paystack_payment(text, timestamptz, bigint, text) from public, anon, authenticated;
revoke all on function public.mark_paystack_payment_failed(text) from public, anon, authenticated;
grant execute on function public.create_fee_installment_plan(uuid, uuid, smallint) to service_role;
grant execute on function public.create_paystack_payment(uuid, uuid, uuid, uuid, text, uuid, text) to service_role;
grant execute on function public.apply_verified_paystack_payment(text, timestamptz, bigint, text) to service_role;
grant execute on function public.mark_paystack_payment_failed(text) to service_role;

drop policy if exists "admin security read cameras" on public.cctv_cameras;
drop policy if exists "guardians read their approved camera access" on public.guardian_camera_access;
drop policy if exists "guardians read approved child cameras" on public.cctv_cameras;
create policy "admins read cameras" on public.cctv_cameras
  for select to authenticated using (public.has_school_role(school_id, array['admin']::public.app_role[]));

create table if not exists public.camera_view_events (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  camera_id uuid not null references public.cctv_cameras(id) on delete cascade,
  viewer_id uuid not null references auth.users(id) on delete cascade,
  viewed_at timestamptz not null default now()
);
create index if not exists camera_view_events_camera_time_idx
  on public.camera_view_events(camera_id, viewed_at desc);
alter table public.camera_view_events enable row level security;
drop policy if exists "admins read camera view history" on public.camera_view_events;
create policy "admins read camera view history" on public.camera_view_events
  for select to authenticated using (public.has_school_role(school_id, array['admin']::public.app_role[]));
drop policy if exists "admins log camera views" on public.camera_view_events;
create policy "admins log camera views" on public.camera_view_events
  for insert to authenticated with check (
    viewer_id = auth.uid()
    and public.has_school_role(school_id, array['admin']::public.app_role[])
  );
grant select, insert on public.camera_view_events to authenticated;