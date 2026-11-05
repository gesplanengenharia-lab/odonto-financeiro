import { QueryFeedback } from "@/components/finance/QueryFeedback";
import { useFinancialMonth } from "@/hooks/use-financial-month";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { readPayroll } from "@/lib/payroll";
import { pageHead } from "@/lib/head";
import { cashValue, monthRange, PAYMENT_LABELS, type PaymentMethod } from "@/lib/finance";
import { txnsByCompetenceQuery } from "@/lib/queries";
import { LaunchDialog, NativeSelect } from "@/components/finance/LaunchDialog";
import { TxnTable } from "@/components/finance/TxnTable";
import { EmptyState, MonthPicker, PageHeader, StatCard } from "@/components/finance/ui";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/_authenticated/lancamentos")({
  head: () => pageHead("Lançamentos", "Todas as entradas e saídas da clínica."),
  component: Lancamentos,
});

function Lancamentos() {
  const [month, setMonth] = useFinancialMonth();
  const [kind, setKind] = useState("");
  const [method, setMethod] = useState("");
  const [search, setSearch] = useState("");
  const { start, end } = monthRange(month);
  const query = useQuery(txnsByCompetenceQuery(start, end));
  const { data = [], isLoading } = query;

  const rows = data.filter(
    (t) =>
      !readPayroll(t) &&
      (!kind || t.kind === kind) &&
      (!method || t.payment_method === method) &&
      (!search || `${t.description} ${t.person ?? ""}`.toLowerCase().includes(search.toLowerCase())),
  );
  const ent = rows.filter((t) => t.kind === "entrada").reduce((s, t) => s + t.gross_amount, 0);
  const sai = rows.filter((t) => t.kind === "saida").reduce((s, t) => s + cashValue(t), 0);

  return (
    <div>
      <PageHeader
        title="Lançamentos"
        subtitle="Entradas e saídas pela data do atendimento ou da compra"
        actions={
          <>
            <MonthPicker value={month} onChange={setMonth} />
            <LaunchDialog />
          </>
        }
      />
      <QueryFeedback loading={query.isPending} error={query.isError} retry={() => void query.refetch()}>
      <p className="mb-4 text-xs text-muted-foreground">Remunerações são geridas em Colaboradores e já integram o DRE geral. Os totais abaixo consideram somente os lançamentos desta lista.</p>
      <div className="mb-4 grid gap-4 sm:grid-cols-3">
        <StatCard label="Entradas (bruto)" value={ent} tone="income" />
        <StatCard label="Saídas" value={sai} tone="expense" />
        <StatCard label="Diferença" value={ent - sai} tone="primary" />
      </div>
      <div className="mb-4 flex flex-wrap gap-2">
        <Input className="max-w-xs bg-card" aria-label="Buscar descrição ou paciente" placeholder="Buscar descrição ou paciente" value={search} onChange={(e) => setSearch(e.target.value)} />
        <NativeSelect aria-label="Filtrar entradas e saídas" className="w-40" value={kind} onChange={(e) => setKind(e.target.value)}>
          <option value="">Entradas e saídas</option>
          <option value="entrada">Só entradas</option>
          <option value="saida">Só saídas</option>
        </NativeSelect>
        <NativeSelect aria-label="Filtrar forma de pagamento" className="w-48" value={method} onChange={(e) => setMethod(e.target.value)}>
          <option value="">Todas as formas</option>
          {(Object.keys(PAYMENT_LABELS) as PaymentMethod[]).map((m) => (
            <option key={m} value={m}>
              {PAYMENT_LABELS[m]}
            </option>
          ))}
        </NativeSelect>
      </div>
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando…</p>
      ) : rows.length === 0 ? (
        <EmptyState title="Nenhum lançamento neste mês">Use “Novo lançamento” para registrar atendimentos, vendas e despesas.</EmptyState>
      ) : (
        <TxnTable rows={rows} showFee dateField="competence_date" />
      )}
      </QueryFeedback>
    </div>
  );
}

