-- Idempotent performance update; no transaction data or RLS policies are changed.
begin;
set local lock_timeout = '2s';
set local statement_timeout = '30s';
create index if not exists transactions_status_due_id_idx on public.transactions (status, due_date, id);
create index if not exists transactions_paid_date_idx on public.transactions (paid_date) where status = 'pago';
create or replace function public.finance_accounts_page(
  _filters jsonb default '{}'::jsonb, _search text default '', _page integer default 0,
  _today date default (now() at time zone 'America/Sao_Paulo')::date
) returns jsonb language sql stable security invoker set search_path = '' as $fn$
with settings as (
  select coalesce(_filters->>'kind','saida') as kind,
    coalesce(_filters->>'status','pendente') as status,
    _filters->>'channel' as channel, _filters->>'method' as method,
    coalesce(_filters->>'period','todos') as period,
    case when _filters->>'month' is not null then ((_filters->>'month') || '-01')::date end as month_start,
    regexp_replace(normalize(lower(trim(coalesce(_search,''))), NFD), U&'[\0300-\036f]', '', 'g') as needle
), scoped as materialized (
  select t.*, case when t.kind='entrada' then t.net_amount else t.gross_amount end as cash_value
  from public.transactions t cross join settings s
  where t.kind=s.kind and (s.status='todos' or t.status=s.status)
    and (s.month_start is null or (t.due_date>=s.month_start and t.due_date<(s.month_start+interval '1 month')))
    and (s.method is null or t.payment_method=s.method)
    and (s.channel is null or (s.channel='cartoes' and t.payment_method in ('credito','debito'))
      or (s.channel='boletos' and t.payment_method='boleto')
      or (s.channel='pacientes' and t.payment_method not in ('credito','debito')))
    and (s.period='todos' or (s.period='atrasados' and t.status='pendente' and t.due_date<_today)
      or (s.period in ('7','30') and t.due_date>=_today and t.due_date<=_today+(case s.period when '7' then 7 when '30' then 30 else 0 end)))
    and (s.needle='' or strpos(regexp_replace(normalize(lower(coalesce(t.person,'') || ' ' || t.description), NFD), U&'[\0300-\036f]', '', 'g'), s.needle)>0)
), page_rows as (
  select * from scoped order by due_date,id limit 50 offset greatest(0,least(coalesce(_page,0),1000000))*50
)
select jsonb_build_object(
  'count', (select count(*) from scoped),
  'total', coalesce((select sum(round(cash_value,2)) from scoped),0),
  'overdue', coalesce((select sum(round(cash_value,2)) from scoped where status='pendente' and due_date<_today),0),
  'nextWeek', coalesce((select sum(round(cash_value,2)) from scoped where status='pendente' and due_date between _today and _today+7),0),
  'rows', coalesce((select jsonb_agg(to_jsonb(p)-'cash_value' order by due_date,id) from page_rows p),'[]'::jsonb)
);
$fn$;
revoke all on function public.finance_accounts_page(jsonb,text,integer,date) from public,anon;
grant execute on function public.finance_accounts_page(jsonb,text,integer,date) to authenticated;
commit;
