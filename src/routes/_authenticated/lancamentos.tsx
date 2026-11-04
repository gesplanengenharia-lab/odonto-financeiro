import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { pageHead } from "@/lib/head";
import { cashValue, monthKey, monthRange, PAYMENT_LABELS, todayISO, type PaymentMethod } from "@/lib/finance";
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
  const [month, setMonth] = useState(monthKey(todayISO()));
  const [kind, setKind] = useState("");
  const [method, setMethod] = useState("");
  const [search, setSearch] = useState("");
  const { start, end } = monthRange(month);
  const { data = [], isLoading } = useQuery(txnsByCompetenceQuery(start, end));

  const rows = data.filter(
    (t) =>
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
      <div className="mb-4 grid gap-4 sm:grid-cols-3">
        <StatCard label="Entradas (bruto)" value={ent} tone="income" />
        <StatCard label="Saídas" value={sai} tone="expense" />
        <StatCard label="Diferença" value={ent - sai} tone="primary" />
      </div>
      <div className="mb-4 flex flex-wrap gap-2">
        <Input className="max-w-xs bg-card" placeholder="Buscar descrição ou paciente" value={search} onChange={(e) => setSearch(e.target.value)} />
        <NativeSelect className="w-40" value={kind} onChange={(e) => setKind(e.target.value)}>
          <option value="">Entradas e saídas</option>
          <option value="entrada">Só entradas</option>
          <option value="saida">Só saídas</option>
        </NativeSelect>
        <NativeSelect className="w-48" value={method} onChange={(e) => setMethod(e.target.value)}>
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
    </div>
  );
}
