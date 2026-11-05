ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS auto_settle boolean NOT NULL DEFAULT true;
COMMENT ON COLUMN public.transactions.auto_settle IS 'Entradas pendentes com auto_settle recebem baixa automática na data de vencimento; desfazer a baixa desliga.';

CREATE OR REPLACE FUNCTION public.guard_transaction_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if auth.uid() is not null and not public.has_role(auth.uid(), 'admin') and
    (to_jsonb(new) - 'status' - 'paid_date' - 'auto_settle') is distinct from (to_jsonb(old) - 'status' - 'paid_date' - 'auto_settle') then
    raise exception 'Only administrators may edit transaction details' using errcode = '42501';
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.auto_settle_due_entries()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare n integer;
begin
  if auth.uid() is not null and not public.is_team_member(auth.uid()) then
    raise exception 'Not a team member' using errcode = '42501';
  end if;
  update public.transactions
     set status = 'pago', paid_date = due_date
   where kind = 'entrada' and status = 'pendente' and auto_settle
     and due_date <= (now() at time zone 'America/Sao_Paulo')::date;
  get diagnostics n = row_count;
  return n;
end;
$function$;

REVOKE ALL ON FUNCTION public.auto_settle_due_entries() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.auto_settle_due_entries() TO authenticated, service_role;