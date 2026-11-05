-- Additive treasury foundation. No historical transaction is reclassified or assigned.
-- One atomic block: safe in Drizzle and in the Lovable SQL editor.
DO $setup$
BEGIN
  PERFORM set_config('lock_timeout', '5s', true);
  IF to_regclass('public.transactions') IS NULL OR to_regclass('public.user_roles') IS NULL
     OR to_regprocedure('public.has_role(uuid,public.app_role)') IS NULL THEN
    RAISE EXCEPTION 'Banco financeiro original nao identificado. Nenhuma alteracao aplicada.';
  END IF;
  IF to_regclass('public.financial_schema_versions') IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM public.financial_schema_versions WHERE version = 1) THEN
      RAISE NOTICE 'Estrutura de tesouraria v1 ja instalada. Nenhuma alteracao reaplicada.';
      RETURN;
    END IF;
    RAISE EXCEPTION 'Estrutura financeira parcial encontrada. Revisar antes de continuar.';
  END IF;
  LOCK TABLE public.transactions IN SHARE ROW EXCLUSIVE MODE;

  CREATE SCHEMA IF NOT EXISTS finance_private;
  REVOKE ALL ON SCHEMA finance_private FROM PUBLIC, anon, authenticated;

  CREATE TABLE public.financial_schema_versions (
    version integer PRIMARY KEY,
    installed_at timestamptz NOT NULL DEFAULT now()
  );
  CREATE TABLE public.financial_accounts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 100),
    kind text NOT NULL CHECK (kind IN ('banco', 'caixa')),
    currency text NOT NULL DEFAULT 'BRL' CHECK (currency = 'BRL'),
    opening_date date NOT NULL,
    opening_balance numeric(14,2) NOT NULL DEFAULT 0 CHECK (opening_balance <> 'NaN'::numeric),
    active boolean NOT NULL DEFAULT true,
    created_by uuid DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now()
  );
  CREATE TABLE public.treasury_movements (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    kind text NOT NULL CHECK (kind IN ('aporte', 'retirada', 'investimento', 'transferencia', 'financiamento', 'amortizacao')),
    account_id uuid NOT NULL REFERENCES public.financial_accounts(id) ON DELETE RESTRICT,
    destination_account_id uuid REFERENCES public.financial_accounts(id) ON DELETE RESTRICT,
    movement_date date NOT NULL,
    amount numeric(14,2) NOT NULL CHECK (amount > 0 AND amount <> 'NaN'::numeric),
    description text NOT NULL CHECK (length(btrim(description)) BETWEEN 1 AND 500),
    created_by uuid DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    voided_at timestamptz,
    voided_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
    void_reason text,
    CHECK ((kind = 'transferencia' AND destination_account_id IS NOT NULL AND destination_account_id <> account_id)
        OR (kind <> 'transferencia' AND destination_account_id IS NULL)),
    CHECK ((voided_at IS NULL AND voided_by IS NULL AND void_reason IS NULL)
        OR (voided_at IS NOT NULL AND voided_by IS NOT NULL AND void_reason IS NOT NULL AND length(btrim(void_reason)) BETWEEN 3 AND 500))
  );
  CREATE TABLE public.bank_reconciliations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id uuid NOT NULL REFERENCES public.financial_accounts(id) ON DELETE RESTRICT,
    reconciliation_date date NOT NULL,
    statement_balance numeric(14,2) NOT NULL CHECK (statement_balance <> 'NaN'::numeric),
    expected_balance numeric(14,2) NOT NULL CHECK (expected_balance <> 'NaN'::numeric),
    difference numeric(14,2) GENERATED ALWAYS AS (statement_balance - expected_balance) STORED,
    notes text CHECK (length(notes) <= 1000),
    created_by uuid DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now()
  );
  CREATE TABLE public.financial_audit_log (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    table_name text NOT NULL,
    record_id text NOT NULL,
    operation text NOT NULL CHECK (operation IN ('INSERT', 'UPDATE', 'DELETE')),
    actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    origin text NOT NULL CHECK (origin IN ('usuario', 'sistema')),
    old_data jsonb,
    new_data jsonb,
    created_at timestamptz NOT NULL DEFAULT clock_timestamp()
  );

  ALTER TABLE public.transactions
    ADD COLUMN financial_account_id uuid REFERENCES public.financial_accounts(id) ON DELETE RESTRICT,
    ADD COLUMN reconciled_at timestamptz,
    ADD COLUMN reconciled_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
    ADD CONSTRAINT transactions_reconciliation_check CHECK (
      (reconciled_at IS NULL AND reconciled_by IS NULL) OR
      (reconciled_at IS NOT NULL AND reconciled_by IS NOT NULL AND financial_account_id IS NOT NULL AND status = 'pago' AND paid_date IS NOT NULL)
    );
  COMMENT ON COLUMN public.transactions.reconciled_at IS 'Confirmacao explicita no extrato; baixa automatica nao concilia.';
  COMMENT ON TABLE public.treasury_movements IS 'Movimentos patrimoniais e transferencias; nao integram receita de pacientes nem despesa operacional do DRE.';

  CREATE INDEX financial_accounts_creator_idx ON public.financial_accounts(created_by);
  CREATE INDEX treasury_account_date_idx ON public.treasury_movements(account_id, movement_date);
  CREATE INDEX treasury_destination_date_idx ON public.treasury_movements(destination_account_id, movement_date) WHERE destination_account_id IS NOT NULL;
  CREATE INDEX treasury_creator_idx ON public.treasury_movements(created_by);
  CREATE INDEX treasury_voider_idx ON public.treasury_movements(voided_by) WHERE voided_by IS NOT NULL;
  CREATE INDEX bank_reconciliation_account_date_idx ON public.bank_reconciliations(account_id, reconciliation_date);
  CREATE INDEX bank_reconciliation_creator_idx ON public.bank_reconciliations(created_by);
  CREATE INDEX financial_audit_record_idx ON public.financial_audit_log(table_name, record_id, created_at DESC);
  CREATE INDEX financial_audit_actor_idx ON public.financial_audit_log(actor_id);
  CREATE INDEX transactions_financial_account_idx ON public.transactions(financial_account_id, paid_date) WHERE financial_account_id IS NOT NULL;
  CREATE INDEX transactions_reconciler_idx ON public.transactions(reconciled_by) WHERE reconciled_by IS NOT NULL;

  ALTER TABLE public.financial_schema_versions ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.financial_accounts ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.treasury_movements ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.bank_reconciliations ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.financial_audit_log ENABLE ROW LEVEL SECURITY;
  REVOKE ALL ON public.financial_schema_versions, public.financial_accounts, public.treasury_movements,
    public.bank_reconciliations, public.financial_audit_log FROM PUBLIC, anon, authenticated, service_role;
  GRANT SELECT ON public.financial_schema_versions, public.financial_audit_log TO authenticated;
  GRANT SELECT, INSERT, UPDATE ON public.financial_accounts, public.treasury_movements TO authenticated;
  GRANT SELECT, INSERT ON public.bank_reconciliations TO authenticated;
  CREATE POLICY treasury_version_admin_read ON public.financial_schema_versions FOR SELECT TO authenticated USING (public.has_role((SELECT auth.uid()), 'admin'));
  CREATE POLICY treasury_audit_admin_read ON public.financial_audit_log FOR SELECT TO authenticated USING (public.has_role((SELECT auth.uid()), 'admin'));
  CREATE POLICY treasury_accounts_admin ON public.financial_accounts FOR ALL TO authenticated
    USING (public.has_role((SELECT auth.uid()), 'admin')) WITH CHECK (public.has_role((SELECT auth.uid()), 'admin'));
  CREATE POLICY treasury_movements_admin ON public.treasury_movements FOR ALL TO authenticated
    USING (public.has_role((SELECT auth.uid()), 'admin')) WITH CHECK (public.has_role((SELECT auth.uid()), 'admin'));
  CREATE POLICY treasury_reconciliations_admin_read ON public.bank_reconciliations FOR SELECT TO authenticated USING (public.has_role((SELECT auth.uid()), 'admin'));
  CREATE POLICY treasury_reconciliations_admin_insert ON public.bank_reconciliations FOR INSERT TO authenticated WITH CHECK (public.has_role((SELECT auth.uid()), 'admin'));

  CREATE FUNCTION finance_private.audit_financial_change() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $audit$
  BEGIN
    IF TG_OP = 'UPDATE' AND to_jsonb(NEW) = to_jsonb(OLD) THEN RETURN NEW; END IF;
    INSERT INTO public.financial_audit_log(table_name, record_id, operation, actor_id, origin, old_data, new_data)
    VALUES (TG_TABLE_NAME, CASE WHEN TG_OP = 'DELETE' THEN OLD.id::text ELSE NEW.id::text END, TG_OP,
      auth.uid(), CASE WHEN auth.uid() IS NULL THEN 'sistema' ELSE 'usuario' END,
      CASE WHEN TG_OP IN ('UPDATE','DELETE') THEN to_jsonb(OLD) END,
      CASE WHEN TG_OP IN ('INSERT','UPDATE') THEN to_jsonb(NEW) END);
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END;
  $audit$;
  REVOKE ALL ON FUNCTION finance_private.audit_financial_change() FROM PUBLIC, anon, authenticated, service_role;

  CREATE FUNCTION finance_private.guard_financial_account() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $account$
  BEGIN
    IF TG_OP = 'INSERT' THEN
      IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Apenas administradores podem cadastrar contas.'; END IF;
      NEW.created_by := auth.uid(); NEW.created_at := clock_timestamp();
    ELSE
      IF (NEW.id, NEW.created_by, NEW.created_at) IS DISTINCT FROM (OLD.id, OLD.created_by, OLD.created_at) THEN RAISE EXCEPTION 'Identidade da conta nao pode ser alterada.'; END IF;
      IF (NEW.opening_date, NEW.opening_balance, NEW.currency, NEW.kind) IS DISTINCT FROM (OLD.opening_date, OLD.opening_balance, OLD.currency, OLD.kind)
        AND (EXISTS (SELECT 1 FROM public.transactions WHERE financial_account_id = OLD.id)
          OR EXISTS (SELECT 1 FROM public.treasury_movements WHERE account_id = OLD.id OR destination_account_id = OLD.id)
          OR EXISTS (SELECT 1 FROM public.bank_reconciliations WHERE account_id = OLD.id)) THEN
        RAISE EXCEPTION 'Conta com movimentos: saldo e data iniciais nao podem ser reescritos.';
      END IF;
    END IF;
    RETURN NEW;
  END;
  $account$;
  REVOKE ALL ON FUNCTION finance_private.guard_financial_account() FROM PUBLIC, anon, authenticated, service_role;

  CREATE FUNCTION finance_private.guard_treasury_movement() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $movement$
  DECLARE a record;
  BEGIN
    IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Apenas administradores podem registrar movimentos.'; END IF;
    IF TG_OP = 'UPDATE' THEN
      IF (to_jsonb(NEW) - 'voided_at' - 'voided_by' - 'void_reason') IS DISTINCT FROM (to_jsonb(OLD) - 'voided_at' - 'voided_by' - 'void_reason')
        OR OLD.voided_at IS NOT NULL OR NEW.voided_at IS NULL THEN RAISE EXCEPTION 'Movimento registrado e imutavel; use cancelamento com justificativa.'; END IF;
      NEW.voided_by := auth.uid(); NEW.voided_at := clock_timestamp();
    ELSE
      IF NEW.voided_at IS NOT NULL OR NEW.voided_by IS NOT NULL OR NEW.void_reason IS NOT NULL THEN RAISE EXCEPTION 'Novo movimento nao pode nascer cancelado.'; END IF;
      IF NEW.movement_date > (now() AT TIME ZONE 'America/Sao_Paulo')::date THEN RAISE EXCEPTION 'Registre apenas movimentos efetivamente realizados.'; END IF;
      NEW.created_by := auth.uid(); NEW.created_at := clock_timestamp();
    END IF;
    FOR a IN SELECT * FROM public.financial_accounts WHERE id IN (NEW.account_id, NEW.destination_account_id) ORDER BY id FOR UPDATE LOOP
      IF NEW.movement_date < a.opening_date THEN RAISE EXCEPTION 'Movimento anterior ao saldo inicial da conta.'; END IF;
      IF TG_OP = 'INSERT' AND NOT a.active THEN RAISE EXCEPTION 'Conta arquivada nao aceita novos movimentos.'; END IF;
    END LOOP;
    RETURN NEW;
  END;
  $movement$;
  REVOKE ALL ON FUNCTION finance_private.guard_treasury_movement() FROM PUBLIC, anon, authenticated, service_role;

  CREATE FUNCTION finance_private.guard_transaction_treasury() RETURNS trigger
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
      IF NOT explicit_confirmation AND (NEW.kind, NEW.net_amount, NEW.gross_amount, NEW.fee_amount, NEW.status, NEW.paid_date, NEW.financial_account_id, NEW.payment_method)
         IS DISTINCT FROM (OLD.kind, OLD.net_amount, OLD.gross_amount, OLD.fee_amount, OLD.status, OLD.paid_date, OLD.financial_account_id, OLD.payment_method) THEN
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

  CREATE FUNCTION public.financial_account_balance(_account_id uuid, _as_of date, _confirmed_only boolean DEFAULT false) RETURNS numeric
    LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $balance$
  DECLARE a public.financial_accounts%ROWTYPE; operating numeric; treasury numeric;
  BEGIN
    IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Acesso exclusivo de administradores.'; END IF;
    SELECT * INTO a FROM public.financial_accounts WHERE id = _account_id;
    IF NOT FOUND OR _as_of IS NULL OR _as_of < a.opening_date THEN RAISE EXCEPTION 'Conta ou data de consulta invalida.'; END IF;
    SELECT coalesce(sum(CASE WHEN kind = 'entrada' THEN net_amount ELSE -gross_amount END),0) INTO operating
      FROM public.transactions WHERE financial_account_id = a.id AND status = 'pago'
      AND coalesce(paid_date,due_date) BETWEEN a.opening_date AND _as_of
      AND (NOT _confirmed_only OR reconciled_at IS NOT NULL);
    SELECT coalesce(sum(CASE
      WHEN kind = 'transferencia' AND account_id = a.id THEN -amount
      WHEN kind = 'transferencia' AND destination_account_id = a.id THEN amount
      WHEN kind IN ('aporte','financiamento') THEN amount ELSE -amount END),0) INTO treasury
      FROM public.treasury_movements WHERE voided_at IS NULL AND movement_date BETWEEN a.opening_date AND _as_of
      AND (account_id = a.id OR destination_account_id = a.id);
    RETURN a.opening_balance + operating + treasury;
  END;
  $balance$;
  REVOKE ALL ON FUNCTION public.financial_account_balance(uuid,date,boolean) FROM PUBLIC, anon, authenticated, service_role;
  GRANT EXECUTE ON FUNCTION public.financial_account_balance(uuid,date,boolean) TO authenticated;

  CREATE FUNCTION finance_private.prepare_bank_reconciliation() RETURNS trigger
    LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $reconciliation$
  BEGIN
    IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Apenas administradores podem conferir saldos.'; END IF;
    IF NEW.reconciliation_date > (now() AT TIME ZONE 'America/Sao_Paulo')::date THEN RAISE EXCEPTION 'Nao e possivel conferir saldo futuro.'; END IF;
    PERFORM id FROM public.financial_accounts WHERE id = NEW.account_id FOR UPDATE;
    NEW.expected_balance := public.financial_account_balance(NEW.account_id, NEW.reconciliation_date, false);
    NEW.created_by := auth.uid(); NEW.created_at := clock_timestamp();
    RETURN NEW;
  END;
  $reconciliation$;
  REVOKE ALL ON FUNCTION finance_private.prepare_bank_reconciliation() FROM PUBLIC, anon, authenticated, service_role;

  CREATE FUNCTION public.set_transaction_reconciliation(_transaction_id uuid, _account_id uuid, _paid_date date, _confirmed boolean DEFAULT true) RETURNS uuid
    LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $confirm$
  DECLARE result uuid;
  BEGIN
    IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Acesso exclusivo de administradores.'; END IF;
    IF _confirmed THEN
      UPDATE public.transactions SET financial_account_id = _account_id, status = 'pago', paid_date = _paid_date,
        reconciled_at = clock_timestamp(), reconciled_by = auth.uid() WHERE id = _transaction_id RETURNING id INTO result;
    ELSE
      UPDATE public.transactions SET reconciled_at = NULL, reconciled_by = NULL WHERE id = _transaction_id RETURNING id INTO result;
    END IF;
    IF result IS NULL THEN RAISE EXCEPTION 'Lancamento nao encontrado ou sem permissao.'; END IF;
    RETURN result;
  END;
  $confirm$;
  REVOKE ALL ON FUNCTION public.set_transaction_reconciliation(uuid,uuid,date,boolean) FROM PUBLIC, anon, authenticated, service_role;
  GRANT EXECUTE ON FUNCTION public.set_transaction_reconciliation(uuid,uuid,date,boolean) TO authenticated;

  CREATE TRIGGER treasury_accounts_guard BEFORE INSERT OR UPDATE ON public.financial_accounts FOR EACH ROW EXECUTE FUNCTION finance_private.guard_financial_account();
  CREATE TRIGGER treasury_movements_guard BEFORE INSERT OR UPDATE ON public.treasury_movements FOR EACH ROW EXECUTE FUNCTION finance_private.guard_treasury_movement();
  CREATE TRIGGER treasury_transactions_guard BEFORE INSERT OR UPDATE OR DELETE ON public.transactions FOR EACH ROW EXECUTE FUNCTION finance_private.guard_transaction_treasury();
  CREATE TRIGGER bank_reconciliation_prepare BEFORE INSERT ON public.bank_reconciliations FOR EACH ROW EXECUTE FUNCTION finance_private.prepare_bank_reconciliation();
  CREATE TRIGGER financial_transactions_audit AFTER INSERT OR UPDATE OR DELETE ON public.transactions FOR EACH ROW EXECUTE FUNCTION finance_private.audit_financial_change();
  CREATE TRIGGER financial_accounts_audit AFTER INSERT OR UPDATE OR DELETE ON public.financial_accounts FOR EACH ROW EXECUTE FUNCTION finance_private.audit_financial_change();
  CREATE TRIGGER financial_movements_audit AFTER INSERT OR UPDATE OR DELETE ON public.treasury_movements FOR EACH ROW EXECUTE FUNCTION finance_private.audit_financial_change();
  CREATE TRIGGER financial_reconciliations_audit AFTER INSERT ON public.bank_reconciliations FOR EACH ROW EXECUTE FUNCTION finance_private.audit_financial_change();
  CREATE TRIGGER financial_categories_audit AFTER INSERT OR UPDATE OR DELETE ON public.categories FOR EACH ROW EXECUTE FUNCTION finance_private.audit_financial_change();
  CREATE TRIGGER financial_permissions_audit AFTER INSERT OR UPDATE OR DELETE ON public.user_roles FOR EACH ROW EXECUTE FUNCTION finance_private.audit_financial_change();
  CREATE TRIGGER financial_card_settings_audit AFTER UPDATE ON public.card_settings FOR EACH ROW EXECUTE FUNCTION finance_private.audit_financial_change();
  INSERT INTO public.financial_schema_versions(version) VALUES (1);
  PERFORM pg_notify('pgrst', 'reload schema');
END;
$setup$;
