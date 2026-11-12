begin;
create index if not exists transactions_monthly_import_match_idx on public.transactions(kind,payment_method,gross_amount,paid_date,due_date);
create table if not exists public.monthly_sheet_rows (
  source_key text primary key,
  payload_hash text not null,
  transaction_ids uuid[] not null,
  file_name text not null,
  imported_at timestamptz not null default now(),
  imported_by uuid default auth.uid()
);
alter table public.monthly_sheet_rows enable row level security;
revoke all on public.monthly_sheet_rows from public,anon,authenticated;
grant select,insert on public.monthly_sheet_rows to authenticated;
drop policy if exists monthly_sheet_admin_read on public.monthly_sheet_rows;
create policy monthly_sheet_admin_read on public.monthly_sheet_rows for select to authenticated using (public.has_role((select auth.uid()),'admin'::public.app_role));
drop policy if exists monthly_sheet_admin_insert on public.monthly_sheet_rows;
create policy monthly_sheet_admin_insert on public.monthly_sheet_rows for insert to authenticated with check (public.has_role((select auth.uid()),'admin'::public.app_role));
create or replace function public.import_monthly_sheet(_entries jsonb,_file_name text,_dry_run boolean default true)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare e jsonb; item jsonb; t public.transactions%rowtype; old_hash text; h text; k text; result jsonb:='[]'::jsonb;
ids uuid[]; new_id uuid; duplicate_found boolean; entry_status text; inserted_count integer:=0; settled_count integer:=0; signature text; seen text[]:='{}'; total_rows integer:=0; operation text; matches uuid[]; updated_count integer;
begin
  if not public.has_role(auth.uid(),'admin'::public.app_role) then raise exception 'Apenas administradores podem importar a planilha mensal.'; end if;
  if _dry_run is null or _entries is null or _file_name is null or jsonb_typeof(_entries)<>'array' or jsonb_array_length(_entries)>2000 or length(_file_name)>240 then raise exception 'Arquivo inválido ou muito grande.'; end if;
  perform pg_advisory_xact_lock(hashtextextended('essencial-monthly-sheet',0));
  for e in select * from jsonb_array_elements(_entries) loop
    k:=e->>'source_key';
    if k is null or length(k)>180 or k !~ '^[0-9a-fA-F-]{36}:[0-9]{4}-[0-9]{2}:(entrada|saida):[A-Za-z0-9_-]+$' or jsonb_typeof(e->'transactions')<>'array' or jsonb_array_length(e->'transactions') not between 1 and 24 then raise exception 'Identificação de linha inválida.'; end if;
    total_rows:=total_rows+jsonb_array_length(e->'transactions');
    if total_rows>10000 then raise exception 'Limite de 10.000 lançamentos por importação.'; end if;
    operation:=coalesce(e->>'operation','create');
    if operation not in ('create','settle') then raise exception 'Operação inválida.';end if;
    h:=encode(extensions.digest(jsonb_build_array(operation,e->'transactions')::text,'sha256'),'hex');
    select payload_hash into old_hash from public.monthly_sheet_rows where source_key=k;
    if found then
      entry_status:=case when old_hash=h then 'imported' else 'changed' end;
      if not _dry_run and entry_status='changed' then raise exception 'Linha já importada foi alterada. Corrija pelo sistema: %',k; end if;
      result:=result||jsonb_build_array(jsonb_build_object('source_key',k,'status',entry_status));continue;
    end if;
    if operation='settle' then
      t:=jsonb_populate_record(null::public.transactions,e->'transactions'->0);
      if jsonb_array_length(e->'transactions')<>1 or t.kind is distinct from 'entrada' or t.status is distinct from 'pago' or t.gross_amount is null or t.gross_amount<=0 or t.gross_amount>999999999 or nullif(trim(t.person),'') is null or t.due_date is null or t.paid_date is null or t.paid_date>(now() at time zone 'America/Sao_Paulo')::date then raise exception 'Dados insuficientes para baixar a parcela.';end if;
      select array_agg(x.id) into matches from public.transactions x where x.kind='entrada' and x.status='pendente' and x.paid_date is null and x.gross_amount=t.gross_amount and x.due_date=t.due_date and x.payment_method=t.payment_method and translate(lower(trim(coalesce(x.person,''))),'áàâãäéèêëíìîïóòôõöúùûüç','aaaaaeeeeiiiiooooouuuuc')=translate(lower(trim(t.person)),'áàâãäéèêëíìîïóòôõöúùûüç','aaaaaeeeeiiiiooooouuuuc');
      if coalesce(array_length(matches,1),0)<>1 then
        entry_status:=case when coalesce(array_length(matches,1),0)>1 then 'ambiguous' else 'not_found' end;
        if entry_status='not_found' and exists(select 1 from public.transactions x where x.kind='entrada' and x.status='pago' and x.gross_amount=t.gross_amount and x.due_date=t.due_date and x.payment_method=t.payment_method and x.paid_date=t.paid_date and translate(lower(trim(coalesce(x.person,''))),'áàâãäéèêëíìîïóòôõöúùûüç','aaaaaeeeeiiiiooooouuuuc')=translate(lower(trim(t.person)),'áàâãäéèêëíìîïóòôõöúùûüç','aaaaaeeeeiiiiooooouuuuc')) then entry_status:='already_settled';end if;
        if not _dry_run and entry_status<>'already_settled' then raise exception 'Parcela ausente ou ambígua. Confira em Contas.';end if;
        result:=result||jsonb_build_array(jsonb_build_object('source_key',k,'status',entry_status));continue;
      end if;
      if _dry_run then result:=result||jsonb_build_array(jsonb_build_object('source_key',k,'status','new','reference',(select competence_date from public.transactions where id=matches[1])));continue;end if;
      update public.transactions set status='pago',paid_date=t.paid_date,auto_settle=false where id=matches[1] and status='pendente' and paid_date is null and gross_amount=t.gross_amount and due_date=t.due_date and payment_method=t.payment_method;
      get diagnostics updated_count = row_count;
      if updated_count<>1 then raise exception 'A parcela mudou durante a importação. Confira novamente.';end if;
      insert into public.monthly_sheet_rows(source_key,payload_hash,transaction_ids,file_name) values(k,h,matches,_file_name);
      settled_count:=settled_count+1;
      result:=result||jsonb_build_array(jsonb_build_object('source_key',k,'status','created'));continue;
    end if;
    duplicate_found:=false; signature:='';
    for item in select * from jsonb_array_elements(e->'transactions') loop
      t:=jsonb_populate_record(null::public.transactions,item);
      if t.kind not in ('entrada','saida') or t.kind is null or t.gross_amount is null or t.gross_amount<=0 or t.gross_amount>999999999 or t.fee_amount is null or t.fee_amount<0 or t.net_amount is distinct from t.gross_amount-t.fee_amount or t.net_amount<0 or t.description is null or length(t.description)>500 or t.competence_date is null or t.due_date is null or t.status not in ('pago','pendente') or t.status is null or (t.status='pago' and (t.paid_date is null or t.paid_date>(now() at time zone 'America/Sao_Paulo')::date)) or (t.status='pendente' and t.paid_date is not null) then raise exception 'Valores ou datas inválidos na linha %',k; end if;
      signature:=signature||jsonb_build_array(t.kind,lower(trim(coalesce(nullif(t.person,''),t.description))),t.gross_amount,case when t.paid_date is null then t.competence_date::text||':'||t.due_date::text else t.paid_date::text end,t.payment_method)::text;
      if exists(select 1 from public.transactions x where x.kind=t.kind
        and ((nullif(trim(t.person),'') is not null and translate(lower(trim(coalesce(x.person,''))),'áàâãäéèêëíìîïóòôõöúùûüç','aaaaaeeeeiiiiooooouuuuc')=translate(lower(trim(t.person)),'áàâãäéèêëíìîïóòôõöúùûüç','aaaaaeeeeiiiiooooouuuuc'))
          or (nullif(trim(t.person),'') is null and lower(trim(x.description))=lower(trim(t.description))))
        and x.gross_amount=t.gross_amount and x.payment_method=t.payment_method
        and ((t.paid_date is not null and x.paid_date=t.paid_date) or (x.paid_date is null and x.due_date=t.due_date and (x.competence_date=t.competence_date or t.paid_date is not null)))) then duplicate_found:=true; end if;
    end loop;
    if signature=any(seen) then duplicate_found:=true; end if;
    seen:=array_append(seen,signature);
    if duplicate_found and not coalesce((e->>'allow_existing')::boolean,false) then
      result:=result||jsonb_build_array(jsonb_build_object('source_key',k,'status','possible_duplicate'));continue;
    end if;
    if _dry_run then
      result:=result||jsonb_build_array(jsonb_build_object('source_key',k,'status','new'));continue;
    end if;
    ids:='{}';
    for item in select * from jsonb_array_elements(e->'transactions') loop
      t:=jsonb_populate_record(null::public.transactions,item);
      insert into public.transactions(kind,description,person,category_id,nature,payment_method,status,competence_date,due_date,paid_date,gross_amount,fee_amount,net_amount,installment_number,installment_total,group_id,notes,created_by,auto_settle)
      values(t.kind,t.description,t.person,t.category_id,t.nature,t.payment_method,t.status,t.competence_date,t.due_date,t.paid_date,t.gross_amount,t.fee_amount,t.net_amount,t.installment_number,t.installment_total,t.group_id,t.notes,auth.uid(),false)
      returning id into new_id;
      ids:=array_append(ids,new_id);inserted_count:=inserted_count+1;
    end loop;
    insert into public.monthly_sheet_rows(source_key,payload_hash,transaction_ids,file_name) values(k,h,ids,_file_name);
    result:=result||jsonb_build_array(jsonb_build_object('source_key',k,'status','created'));
  end loop;
  return jsonb_build_object('rows',result,'inserted',inserted_count,'settled',settled_count,'dry_run',_dry_run);
end;
$$;
revoke all on function public.import_monthly_sheet(jsonb,text,boolean) from public,anon;
grant execute on function public.import_monthly_sheet(jsonb,text,boolean) to authenticated;
notify pgrst,'reload schema';
commit;
