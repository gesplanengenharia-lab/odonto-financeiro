begin;
create table if not exists public.clinic_monthly_goals (
  id uuid primary key default gen_random_uuid(),
  month date not null unique check (extract(day from month) = 1),
  break_even numeric(14,2) not null check (break_even > 0 and break_even <= 999999999),
  target numeric(14,2) not null,
  super_target numeric(14,2) not null,
  mega_target numeric(14,2) not null check (mega_target <= 999999999),
  version integer not null default 1,
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid(),
  constraint clinic_goals_order check (break_even < target and target < super_target and super_target < mega_target)
);
alter table public.clinic_monthly_goals enable row level security;
revoke all on public.clinic_monthly_goals from public, anon, authenticated;
grant select, insert, update on public.clinic_monthly_goals to authenticated;
drop policy if exists clinic_goals_admin_read on public.clinic_monthly_goals;
create policy clinic_goals_admin_read on public.clinic_monthly_goals for select to authenticated using (public.has_role((select auth.uid()), 'admin'::public.app_role));
drop policy if exists clinic_goals_admin_insert on public.clinic_monthly_goals;
create policy clinic_goals_admin_insert on public.clinic_monthly_goals for insert to authenticated with check (public.has_role((select auth.uid()), 'admin'::public.app_role));
drop policy if exists clinic_goals_admin_update on public.clinic_monthly_goals;
create policy clinic_goals_admin_update on public.clinic_monthly_goals for update to authenticated using (public.has_role((select auth.uid()), 'admin'::public.app_role)) with check (public.has_role((select auth.uid()), 'admin'::public.app_role));
create or replace function finance_private.stamp_clinic_goals()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if TG_OP = 'UPDATE' then
    if NEW.id is distinct from OLD.id or NEW.month is distinct from OLD.month then raise exception 'A referência da meta não pode ser alterada.'; end if;
    NEW.version := OLD.version + 1;
  else
    NEW.version := 1;
  end if;
  NEW.updated_at := clock_timestamp();
  NEW.updated_by := auth.uid();
  return NEW;
end;
$$;
revoke all on function finance_private.stamp_clinic_goals() from public, anon;
drop trigger if exists stamp_clinic_goals on public.clinic_monthly_goals;
create trigger stamp_clinic_goals before insert or update on public.clinic_monthly_goals for each row execute function finance_private.stamp_clinic_goals();
drop trigger if exists audit_clinic_goals on public.clinic_monthly_goals;
create trigger audit_clinic_goals after insert or update on public.clinic_monthly_goals for each row execute function finance_private.audit_financial_change();
commit;
