-- Roles
create type public.app_role as enum ('admin', 'membro');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  email text,
  created_at timestamptz not null default now()
);
grant select, insert, update on public.profiles to authenticated;
grant all on public.profiles to service_role;
alter table public.profiles enable row level security;

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  role public.app_role not null,
  unique (user_id, role)
);
grant select, insert, delete on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
alter table public.user_roles enable row level security;

create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role)
$$;

create or replace function public.is_team_member(_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id)
$$;

-- profiles policies
create policy "Own profile read" on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_team_member(auth.uid()));
create policy "Own profile update" on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
create policy "Own profile insert" on public.profiles for insert to authenticated
  with check (id = auth.uid());

-- user_roles policies
create policy "Read roles" on public.user_roles for select to authenticated
  using (user_id = auth.uid() or public.is_team_member(auth.uid()));
create policy "Admins grant roles" on public.user_roles for insert to authenticated
  with check (public.has_role(auth.uid(), 'admin'));
create policy "Admins revoke roles" on public.user_roles for delete to authenticated
  using (public.has_role(auth.uid(), 'admin') and user_id <> auth.uid());

-- New user trigger: create profile; first user becomes admin
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, email)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)), new.email)
  on conflict (id) do nothing;

  if not exists (select 1 from public.user_roles where role = 'admin') then
    insert into public.user_roles (user_id, role) values (new.id, 'admin');
  end if;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Categories
create table public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  kind text not null check (kind in ('entrada', 'saida')),
  nature text check (nature in ('fixa', 'variavel')),
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.categories to authenticated;
grant all on public.categories to service_role;
alter table public.categories enable row level security;
create policy "Team reads categories" on public.categories for select to authenticated using (public.is_team_member(auth.uid()));
create policy "Team inserts categories" on public.categories for insert to authenticated with check (public.is_team_member(auth.uid()));
create policy "Team updates categories" on public.categories for update to authenticated using (public.is_team_member(auth.uid())) with check (public.is_team_member(auth.uid()));
create policy "Team deletes categories" on public.categories for delete to authenticated using (public.is_team_member(auth.uid()));

-- Card settings (single row)
create table public.card_settings (
  id int primary key default 1 check (id = 1),
  debit_fee numeric(6,3) not null default 1.5,
  debit_days int not null default 1,
  credit_fee_1x numeric(6,3) not null default 3.2,
  credit_fee_2_6 numeric(6,3) not null default 4.5,
  credit_fee_7_12 numeric(6,3) not null default 5.5,
  credit_days int not null default 30,
  updated_at timestamptz not null default now()
);
grant select, update on public.card_settings to authenticated;
grant all on public.card_settings to service_role;
alter table public.card_settings enable row level security;
create policy "Team reads card settings" on public.card_settings for select to authenticated using (public.is_team_member(auth.uid()));
create policy "Team updates card settings" on public.card_settings for update to authenticated using (public.is_team_member(auth.uid())) with check (public.is_team_member(auth.uid()));
insert into public.card_settings (id) values (1);

-- Transactions
create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('entrada', 'saida')),
  description text not null,
  person text,
  category_id uuid references public.categories(id) on delete set null,
  nature text check (nature in ('fixa', 'variavel')),
  payment_method text not null check (payment_method in ('dinheiro', 'pix', 'debito', 'credito', 'boleto', 'transferencia')),
  status text not null default 'pendente' check (status in ('pago', 'pendente')),
  competence_date date not null default current_date,
  due_date date not null,
  paid_date date,
  gross_amount numeric(12,2) not null check (gross_amount >= 0),
  fee_amount numeric(12,2) not null default 0,
  net_amount numeric(12,2) not null,
  installment_number int not null default 1,
  installment_total int not null default 1,
  group_id uuid,
  notes text,
  created_by uuid,
  created_at timestamptz not null default now()
);
create index transactions_due_date_idx on public.transactions (due_date);
create index transactions_competence_idx on public.transactions (competence_date);
create index transactions_group_idx on public.transactions (group_id);
grant select, insert, update, delete on public.transactions to authenticated;
grant all on public.transactions to service_role;
alter table public.transactions enable row level security;
create policy "Team reads transactions" on public.transactions for select to authenticated using (public.is_team_member(auth.uid()));
create policy "Team inserts transactions" on public.transactions for insert to authenticated with check (public.is_team_member(auth.uid()));
create policy "Team updates transactions" on public.transactions for update to authenticated using (public.is_team_member(auth.uid())) with check (public.is_team_member(auth.uid()));
create policy "Team deletes transactions" on public.transactions for delete to authenticated using (public.is_team_member(auth.uid()));

-- Default categories
insert into public.categories (name, kind, nature) values
  ('Consultas e avaliações', 'entrada', null),
  ('Clínica geral', 'entrada', null),
  ('Ortodontia', 'entrada', null),
  ('Implantes', 'entrada', null),
  ('Estética e clareamento', 'entrada', null),
  ('Prótese', 'entrada', null),
  ('Endodontia', 'entrada', null),
  ('Outras receitas', 'entrada', null),
  ('Aluguel', 'saida', 'fixa'),
  ('Salários e encargos', 'saida', 'fixa'),
  ('Pró-labore', 'saida', 'fixa'),
  ('Energia elétrica', 'saida', 'fixa'),
  ('Água', 'saida', 'fixa'),
  ('Internet e telefone', 'saida', 'fixa'),
  ('Contabilidade', 'saida', 'fixa'),
  ('Sistemas e softwares', 'saida', 'fixa'),
  ('Materiais odontológicos', 'saida', 'variavel'),
  ('Laboratório de prótese', 'saida', 'variavel'),
  ('Comissão de dentistas', 'saida', 'variavel'),
  ('Marketing', 'saida', 'variavel'),
  ('Manutenção de equipamentos', 'saida', 'variavel'),
  ('Impostos', 'saida', 'variavel'),
  ('Tarifas bancárias', 'saida', 'variavel'),
  ('Outras despesas', 'saida', 'variavel');
