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

create index if not exists fee_invoice_student_due_idx
  on public.fee_invoices(student_id, due_at);

alter table public.fee_invoices enable row level security;

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

grant select, insert, update, delete on public.fee_invoices to authenticated;

notify pgrst, 'reload schema';
