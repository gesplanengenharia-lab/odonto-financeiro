-- Automatic payments follow the due date; explicit exceptions remain pending.
alter table public.transactions add column auto_settle boolean not null default true;

-- Preserve existing permissions: members with payment access may edit only
-- payment state/date/mode; financial details remain administrator-only.
create or replace function public.guard_transaction_update()
returns trigger language plpgsql security invoker set search_path = public as $$
begin
  if auth.uid() is not null and not public.has_role(auth.uid(), 'admin') and
    (to_jsonb(new) - 'status' - 'paid_date' - 'auto_settle') is distinct from
    (to_jsonb(old) - 'status' - 'paid_date' - 'auto_settle') then
    raise exception 'Only administrators may edit transaction details' using errcode = '42501';
  end if;
  return new;
end;
$$;
