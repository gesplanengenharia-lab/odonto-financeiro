import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { pageHead } from "@/lib/head";
import { cashValue, isOverdue, PAYMENT_LABELS, todayISO, addDays, type PaymentMethod } from "@/lib/finance";
import { pendingQuery } from "@/lib/queries";
import { LaunchDialog, NativeSelect } from "@/components/finance/LaunchDialog";
import { TxnTable } from "@/components/finance/TxnTable";
import { EmptyState, PageHeader, StatCard } from "@/components/finance/ui";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/_authenticated/contas")({
  head: () => pageHead("Contas a pagar e receber", "Boletos, Pix e parcelas pendentes com vencimento."),
  component: Contas,
});

function Contas() {
  const [tab, setTab] = useState<"entrada" | "saida">("saida");
  const [period, setPeriod] = useState("todos");
  const [method, setMethod] = useState("");
  const { data = [], isLoading } = useQuery(pendingQuery());
  const today = todayISO();

  const ofKind = data.filter((t) => t.kind === tab && (tab === "saida" || (t.payment_method !== "credito" && t.payment_method !== "debito")));
  const rows = ofKind.filter((t) => {
    if (method && t.payment_method !== method) return false;
    if (period === "atrasados") return isOverdue(t, today);
    if (period === "7") return t.due_date >= today && t.due_date <= addDays(today, 7);
    if (period === "30") return t.due_date >= today && t.due_date <= addDays(today, 30);
    return true;
  });
  const total = (f: (t: (typeof data)[number]) => boolean) => ofKind.filter(f).reduce((s, t) => s + cashValue(t), 0);

  return (
    <div>
      <PageHeader
        title="Contas a pagar e receber"
        subtitle="Tudo que está pendente, com vencimento. Clique no ✓ para dar baixa."
        actions={<LaunchDialog defaultKind={tab} />}
      />
      <Tabs value={tab} onValueChange={(v) => setTab(v as "entrada" | "saida")} className="mb-4">
        <TabsList>
          <TabsTrigger value="saida">A pagar</TabsTrigger>
          <TabsTrigger value="entrada">A receber</TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="mb-4 grid gap-4 sm:grid-cols-3">
        <StatCard label="Atrasado" value={total((t) => isOverdue(t, today))} tone="expense" />
        <StatCard label="Próximos 7 dias" value={total((t) => t.due_date >= today && t.due_date <= addDays(today, 7))} tone="warning" />
        <StatCard label="Total pendente" value={total(() => true)} tone="primary" />
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        <NativeSelect className="w-48" value={period} onChange={(e) => setPeriod(e.target.value)}>
          <option value="todos">Todos os vencimentos</option>
          <option value="atrasados">Atrasados</option>
          <option value="7">Próximos 7 dias</option>
          <option value="30">Próximos 30 dias</option>
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
      {tab === "entrada" && (
        <p className="mb-3 text-xs text-muted-foreground">Recebíveis de cartão ficam na página Cartões.</p>
      )}
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando…</p>
      ) : rows.length === 0 ? (
        <EmptyState title="Nenhuma conta pendente aqui" />
      ) : (
        <TxnTable rows={rows} />
      )}
    </div>
  );
}
