-- Module permissions: admin-only management and least-privilege financial operations.
alter table public.user_roles add column allowed_modules text[] not null
  default array['lancamentos','contas','cartoes','inadimplentes','baixar']::text[];
alter table public.user_roles add constraint user_roles_allowed_modules_check
  check (allowed_modules <@ array['lancamentos','contas','cartoes','inadimplentes','baixar']::text[]);
grant update (allowed_modules) on public.user_roles to authenticated;
create policy "Admins update module permissions" on public.user_roles for update to authenticated
  using (public.has_role(auth.uid(), 'admin')) with check (public.has_role(auth.uid(), 'admin'));

create or replace function public.can_use_module(_user_id uuid, _module text)
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_role(_user_id, 'admin') or exists (
    select 1 from public.user_roles where user_id = _user_id and role = 'membro'
      and _module = any(allowed_modules)
  )
$$;

-- Do not allow a role/permission update to expose other staff profiles.
drop policy "Read roles" on public.user_roles;
create policy "Read roles" on public.user_roles for select to authenticated
  using (user_id = auth.uid() or public.has_role(auth.uid(), 'admin'));
drop policy "Own profile read" on public.profiles;
create policy "Own profile read" on public.profiles for select to authenticated
  using (id = auth.uid() or public.has_role(auth.uid(), 'admin'));

drop policy "Team inserts categories" on public.categories;
drop policy "Team updates categories" on public.categories;
drop policy "Team deletes categories" on public.categories;
create policy "Admins insert categories" on public.categories for insert to authenticated with check (public.has_role(auth.uid(), 'admin'));
create policy "Admins update categories" on public.categories for update to authenticated using (public.has_role(auth.uid(), 'admin')) with check (public.has_role(auth.uid(), 'admin'));
create policy "Admins delete categories" on public.categories for delete to authenticated using (public.has_role(auth.uid(), 'admin'));
drop policy "Team updates card settings" on public.card_settings;
create policy "Admins update card settings" on public.card_settings for update to authenticated using (public.has_role(auth.uid(), 'admin')) with check (public.has_role(auth.uid(), 'admin'));

-- Operational members need transaction rows for their authorized workflows.
-- Restrict writes independently of which screen is visible.
drop policy "Team reads transactions" on public.transactions;
create policy "Authorized operations read transactions" on public.transactions for select to authenticated using (
  public.has_role(auth.uid(), 'admin') or public.can_use_module(auth.uid(), 'lancamentos') or
  public.can_use_module(auth.uid(), 'contas') or public.can_use_module(auth.uid(), 'cartoes') or
  public.can_use_module(auth.uid(), 'inadimplentes')
);
drop policy "Team inserts transactions" on public.transactions;
create policy "Authorized launches insert transactions" on public.transactions for insert to authenticated with check (
  public.can_use_module(auth.uid(), 'lancamentos') and created_by = auth.uid()
  and (status = 'pendente' or public.can_use_module(auth.uid(), 'baixar'))
);
drop policy "Team updates transactions" on public.transactions;
create policy "Authorized settlements update transactions" on public.transactions for update to authenticated
  using (public.can_use_module(auth.uid(), 'baixar')) with check (public.can_use_module(auth.uid(), 'baixar'));
drop policy "Team deletes transactions" on public.transactions;
create policy "Admins delete transactions" on public.transactions for delete to authenticated using (public.has_role(auth.uid(), 'admin'));

-- Members may only change settlement fields, never amounts, dates, ownership or descriptions.
create or replace function public.guard_transaction_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not public.has_role(auth.uid(), 'admin') and
    (to_jsonb(new) - 'status' - 'paid_date') is distinct from (to_jsonb(old) - 'status' - 'paid_date') then
    raise exception 'Only administrators may edit transaction details' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger guard_transaction_update before update on public.transactions
for each row execute function public.guard_transaction_update();
