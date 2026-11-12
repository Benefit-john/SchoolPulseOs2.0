create or replace function public.apply_verified_paystack_payment(
  _reference text,
  _paid_at timestamptz
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  payment_row public.payments%rowtype;
begin
  select *
  into payment_row
  from public.payments
  where paystack_reference = _reference
  for update;

  if not found then
    return false;
  end if;

  if payment_row.status = 'paid' then
    return true;
  end if;

  if payment_row.status <> 'pending' or payment_row.student_id is null then
    return false;
  end if;

  update public.students
  set balance = greatest(0, balance - payment_row.amount)
  where id = payment_row.student_id
    and school_id = payment_row.school_id;

  if not found then
    return false;
  end if;

  update public.payments
  set status = 'paid', paid_at = _paid_at
  where id = payment_row.id;

  return true;
end;
$$;

revoke all on function public.apply_verified_paystack_payment(text, timestamptz) from public, anon, authenticated;
grant execute on function public.apply_verified_paystack_payment(text, timestamptz) to service_role;
