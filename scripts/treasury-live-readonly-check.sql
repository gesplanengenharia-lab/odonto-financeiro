-- Diagnóstico SOMENTE LEITURA — Essencial Financeiro / Tesouraria v1.
-- Execute apenas no SQL Editor do projeto Lovable Cloud ORIGINAL.
-- Não contém INSERT, UPDATE, DELETE, ALTER, CREATE nem comandos de migração.
-- O retorno contém contagens agregadas: não expõe pacientes nem valores individuais.

SELECT
  (SELECT count(*) FROM public.transactions) AS total_lancamentos,
  (SELECT count(*) FROM public.financial_accounts) AS contas_cadastradas,
  (SELECT count(*) FROM public.treasury_movements) AS movimentos_patrimoniais,
  (SELECT count(*) FROM public.bank_reconciliations) AS conferencias_registradas,
  (SELECT max(version) FROM public.financial_schema_versions) AS versao_tesouraria;

-- Indicadores de consistência; o resultado esperado de cada anomalia é zero.
SELECT 'conciliado_sem_baixa_ou_conta' AS verificacao, count(*) AS anomalias
FROM public.transactions t
WHERE t.reconciled_at IS NOT NULL AND
  (t.status <> 'pago' OR t.paid_date IS NULL OR t.financial_account_id IS NULL OR t.reconciled_by IS NULL)
UNION ALL
SELECT 'pagamento_anterior_a_abertura', count(*)
FROM public.transactions t
JOIN public.financial_accounts a ON a.id = t.financial_account_id
WHERE t.status = 'pago' AND coalesce(t.paid_date, t.due_date) < a.opening_date
UNION ALL
SELECT 'movimento_anterior_a_abertura', count(*)
FROM public.treasury_movements m
JOIN public.financial_accounts a ON a.id = m.account_id
WHERE m.movement_date < a.opening_date
UNION ALL
SELECT 'transferencia_destino_anterior_a_abertura', count(*)
FROM public.treasury_movements m
JOIN public.financial_accounts a ON a.id = m.destination_account_id
WHERE m.kind = 'transferencia' AND m.movement_date < a.opening_date
UNION ALL
SELECT 'cancelamento_sem_justificativa', count(*)
FROM public.treasury_movements m
WHERE m.voided_at IS NOT NULL AND
  (m.voided_by IS NULL OR nullif(btrim(m.void_reason), '') IS NULL)
UNION ALL
SELECT 'conferencia_com_diferenca_inconsistente', count(*)
FROM public.bank_reconciliations r
WHERE r.difference IS DISTINCT FROM (r.statement_balance - r.expected_balance);

-- RLS deve estar habilitado nas cinco tabelas financeiras novas.
SELECT n.nspname AS esquema, c.relname AS tabela, c.relrowsecurity AS rls_ativo
FROM pg_catalog.pg_class c
JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind = 'r'
  AND c.relname IN ('financial_accounts','treasury_movements','bank_reconciliations',
                    'financial_audit_log','financial_schema_versions')
ORDER BY c.relname;

-- Distribuição de pagamentos bancários: somente contagens, sem exposição de dados sensíveis.
SELECT
 count(*) FILTER (WHERE status = 'pago' AND financial_account_id IS NULL) AS baixas_sem_conta,
 count(*) FILTER (WHERE status = 'pago' AND financial_account_id IS NOT NULL AND reconciled_at IS NULL) AS vinculados_nao_conciliados,
 count(*) FILTER (WHERE status = 'pago' AND financial_account_id IS NOT NULL AND reconciled_at IS NOT NULL) AS conciliados,
 count(*) FILTER (WHERE kind = 'entrada' AND status = 'pago' AND auto_settle) AS entradas_baixadas_com_auto_settle_habilitado
FROM public.transactions;

-- Verificação complementar: executar após a liberação do limite de consultas.
-- Esta consulta não foi executada na auditoria de 05/11/2026: o conector
-- informou que o limite do plano foi atingido. Não presumir resultado zero.
SELECT
 count(*) FILTER (WHERE status = 'pago' AND paid_date IS NULL) AS baixas_sem_data,
 count(*) FILTER (WHERE status = 'pago' AND paid_date > (now() AT TIME ZONE 'America/Sao_Paulo')::date) AS baixas_futuras,
 count(*) FILTER (WHERE gross_amount::text = 'NaN' OR net_amount::text = 'NaN' OR fee_amount::text = 'NaN'
   OR gross_amount < 0 OR fee_amount < 0 OR net_amount < 0
   OR abs(net_amount - (gross_amount - fee_amount)) > 0.005) AS valores_a_revisar
FROM public.transactions;

