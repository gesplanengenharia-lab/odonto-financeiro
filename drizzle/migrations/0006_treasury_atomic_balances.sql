-- Additive security update. Never rewrites transactions or opening balances.
-- All account balances and both reconciliation views share one MVCC snapshot.
DO $migration$
BEGIN
  IF to_regclass('public.financial_schema_versions') IS NULL THEN
    RAISE EXCEPTION 'Instale a estrutura de tesouraria v1 antes desta atualizacao.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.financial_schema_versions WHERE version = 2) THEN
    IF to_regprocedure('public.treasury_balances_snapshot(date,uuid[])') IS NULL THEN
      RAISE EXCEPTION 'Versao 2 encontrada sem a funcao de saldos esperada. Revise a instalacao.';
    END IF;
    RETURN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.financial_schema_versions WHERE version = 1) THEN
    RAISE EXCEPTION 'Estrutura de tesouraria v1 incompleta.';
  END IF;

  -- Editing the identity shown on a reconciled item requires a new statement check.
  CREATE OR REPLACE FUNCTION finance_private.guard_transaction_treasury() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $txn$
  DECLARE a public.financial_accounts%ROWTYPE; explicit_confirmation boolean := false;
  BEGIN
    IF TG_OP = 'DELETE' THEN
      PERFORM id FROM public.financial_accounts WHERE id = OLD.financial_account_id FOR UPDATE;
      RETURN OLD;
    END IF;
    IF TG_OP = 'UPDATE' THEN
      PERFORM id FROM public.financial_accounts WHERE id IN (OLD.financial_account_id, NEW.financial_account_id) ORDER BY id FOR UPDATE;
      explicit_confirmation := NEW.reconciled_at IS NOT NULL AND (NEW.reconciled_at, NEW.reconciled_by) IS DISTINCT FROM (OLD.reconciled_at, OLD.reconciled_by);
      IF NOT explicit_confirmation AND (NEW.kind, NEW.net_amount, NEW.gross_amount, NEW.fee_amount, NEW.status, NEW.paid_date, NEW.financial_account_id, NEW.payment_method, NEW.description, NEW.person, NEW.due_date)
         IS DISTINCT FROM (OLD.kind, OLD.net_amount, OLD.gross_amount, OLD.fee_amount, OLD.status, OLD.paid_date, OLD.financial_account_id, OLD.payment_method, OLD.description, OLD.person, OLD.due_date) THEN
        NEW.reconciled_at := NULL; NEW.reconciled_by := NULL;
      END IF;
    ELSE
      explicit_confirmation := NEW.reconciled_at IS NOT NULL;
    END IF;
    IF NEW.financial_account_id IS NOT NULL THEN
      SELECT * INTO a FROM public.financial_accounts WHERE id = NEW.financial_account_id FOR UPDATE;
      IF NOT FOUND THEN RAISE EXCEPTION 'Conta financeira inexistente.'; END IF;
      IF NEW.status = 'pago' AND coalesce(NEW.paid_date, NEW.due_date) < a.opening_date THEN RAISE EXCEPTION 'Pagamento anterior ao saldo inicial da conta.'; END IF;
      IF NOT a.active AND (TG_OP = 'INSERT' OR NEW.financial_account_id IS DISTINCT FROM OLD.financial_account_id) THEN RAISE EXCEPTION 'Conta arquivada nao aceita novos vinculos.'; END IF;
    END IF;
    IF explicit_confirmation THEN
      IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin') OR NEW.reconciled_by IS DISTINCT FROM auth.uid()
        OR NEW.status <> 'pago' OR NEW.financial_account_id IS NULL OR NEW.paid_date IS NULL
        OR NEW.paid_date > (now() AT TIME ZONE 'America/Sao_Paulo')::date THEN RAISE EXCEPTION 'Conciliacao exige administrador, conta e pagamento efetivo.'; END IF;
      NEW.reconciled_at := clock_timestamp();
    END IF;
    RETURN NEW;
  END;
  $txn$;
  REVOKE ALL ON FUNCTION finance_private.guard_transaction_treasury() FROM PUBLIC, anon, authenticated, service_role;

  CREATE FUNCTION public.treasury_balances_snapshot(_as_of date, _account_ids uuid[] DEFAULT NULL)
    RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = '' AS $snapshot$
  DECLARE result jsonb;
  BEGIN
    IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin') THEN
      RAISE EXCEPTION 'Acesso exclusivo de administradores.' USING ERRCODE = '42501';
    END IF;
    IF _as_of IS NULL OR _as_of > (now() AT TIME ZONE 'America/Sao_Paulo')::date THEN
      RAISE EXCEPTION 'Informe uma data de posicao valida, sem antecipar recebimentos.';
    END IF;
    WITH accounts AS (
      SELECT id, opening_date, opening_balance FROM public.financial_accounts
      WHERE _account_ids IS NULL OR id = ANY(_account_ids)
    ), operating AS (
      SELECT a.id,
        sum(CASE WHEN t.kind = 'entrada' THEN t.net_amount ELSE -t.gross_amount END) AS posted,
        sum(CASE WHEN t.kind = 'entrada' THEN t.net_amount ELSE -t.gross_amount END)
          FILTER (WHERE t.reconciled_at IS NOT NULL) AS confirmed
      FROM accounts a JOIN public.transactions t ON t.financial_account_id = a.id
      WHERE t.status = 'pago' AND coalesce(t.paid_date,t.due_date) BETWEEN a.opening_date AND _as_of
      GROUP BY a.id
    ), legs AS (
      SELECT m.account_id AS id, m.movement_date, CASE WHEN m.kind IN ('aporte','financiamento') THEN m.amount ELSE -m.amount END AS amount
      FROM public.treasury_movements m WHERE m.voided_at IS NULL
      UNION ALL
      SELECT m.destination_account_id, m.movement_date, m.amount
      FROM public.treasury_movements m WHERE m.voided_at IS NULL AND m.kind = 'transferencia'
    ), capital AS (
      SELECT a.id, sum(l.amount) AS amount FROM accounts a JOIN legs l ON l.id = a.id
      WHERE l.movement_date BETWEEN a.opening_date AND _as_of GROUP BY a.id
    )
    SELECT coalesce(jsonb_agg(jsonb_build_object(
      'id', a.id,
      'posted', CASE WHEN a.opening_date <= _as_of THEN a.opening_balance + coalesce(o.posted,0) + coalesce(c.amount,0) ELSE NULL END,
      'confirmed', CASE WHEN a.opening_date <= _as_of THEN a.opening_balance + coalesce(o.confirmed,0) + coalesce(c.amount,0) ELSE NULL END
    ) ORDER BY a.id), '[]'::jsonb) INTO result
    FROM accounts a LEFT JOIN operating o ON o.id = a.id LEFT JOIN capital c ON c.id = a.id;
    RETURN result;
  END;
  $snapshot$;
  REVOKE ALL ON FUNCTION public.treasury_balances_snapshot(date,uuid[]) FROM PUBLIC, anon;
  GRANT EXECUTE ON FUNCTION public.treasury_balances_snapshot(date,uuid[]) TO authenticated;
  INSERT INTO public.financial_schema_versions(version) VALUES (2);
  PERFORM pg_notify('pgrst','reload schema');
END;
$migration$;
