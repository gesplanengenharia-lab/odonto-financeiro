import { QueryFeedback } from "@/components/finance/QueryFeedback";
import { useFinancialMonth } from "@/hooks/use-financial-month";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { toast } from "sonner";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, Legend } from "recharts";
import { canUse } from "@/lib/access";
import { myAccessQuery } from "@/lib/queries";
import { pageHead } from "@/lib/head";
import { cardReceivables, formatBRL, formatMonth, todayISO } from "@/lib/finance";
import { txnsByDueQuery, useTxnMutations } from "@/lib/queries";
import { TxnTable } from "@/components/finance/TxnTable";
import { EmptyState, MonthPicker, PageHeader, StatCard } from "@/components/finance/ui";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/cartoes")({
  head: () => pageHead("Cartões", "Recebíveis de cartão de crédito e débito, taxas e datas de recebimento."),
  component: Cartoes,
});

function Cartoes() {
  const today = todayISO();
  const [month, setMonth] = useFinancialMonth();
  const query = useQuery(txnsByDueQuery());
  const { data = [], isLoading } = query;
  const { setPaid } = useTxnMutations();
  const { data: access } = useQuery(myAccessQuery());

  const agenda = useMemo(() => cardReceivables(data, month, today), [data, month, today]);
  const monthRows = agenda.monthRows;
  const due = data.filter((t) => t.kind === "entrada" && (t.payment_method === "credito" || t.payment_method === "debito") && t.status === "pendente" && t.due_date <= today);
  const projection = agenda.projection.map((r) => ({mes: formatMonth(r.month), Líquido: r.amount}));

  async function confirmDue() {
    const byDate = new Map<string, string[]>();
    due.forEach((t) => byDate.set(t.due_date, [...(byDate.get(t.due_date) ?? []), t.id]));
    try {
      for (const [date, ids] of byDate) await setPaid.mutateAsync({ ids, paid: true, date });
      toast.success(`${due.length} parcela(s) confirmada(s) como recebida(s)`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    }
  }

  return (
    <div>
      <PageHeader
        title="Cartões"
        subtitle="Quanto entrou e quanto ainda vai cair na conta, já descontada a taxa da maquininha"
        actions={
          <><MonthPicker value={month} onChange={setMonth} />{due.length > 0 && (
            <Button onClick={confirmDue} disabled={setPaid.isPending || !canUse(access, "baixar")}>
              Confirmar {due.length} recebimento(s) até hoje
            </Button>
          )}</>
        }
      />

      <QueryFeedback loading={query.isPending} error={query.isError} retry={() => void query.refetch()}>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label={`Recebido em ${formatMonth(month)}`} value={agenda.received} tone="income" hint="Líquido, pela data do recebimento" />
        <StatCard label={`Em aberto em ${formatMonth(month)}`} value={agenda.open} tone="primary" hint="Por vencimento, incluindo atrasados do mês" />
        <StatCard label="A receber nos 23 meses seguintes" value={agenda.future} tone="primary" hint="Somente parcelas pendentes, após o mês selecionado" />
        <StatCard label="Recebimentos atrasados" value={agenda.overdue} tone="warning" hint="Pendentes com vencimento até ontem, todos os meses" />
      </div>

      <div className="surface-card mt-4 p-6">
        <h2 className="text-base font-semibold">Agenda de recebíveis — 24 meses</h2>
        <p className="mt-1 text-sm text-muted-foreground">Mês selecionado e 23 seguintes. Somente parcelas em aberto, já descontadas as taxas.</p>
        <p className="mt-2 text-xs text-muted-foreground">Vencimentos de {formatMonth(month)}, pagos e pendentes: {formatBRL(agenda.monthGross)} brutos · {formatBRL(agenda.monthFees)} em taxas.</p>
        <div className="mt-4 h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={projection}>
              <CartesianGrid vertical={false} stroke="var(--border)" />
              <XAxis dataKey="mes" tickLine={false} axisLine={false} fontSize={12} stroke="var(--muted-foreground)" />
              <YAxis tickLine={false} axisLine={false} fontSize={11} stroke="var(--muted-foreground)" tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
              <Tooltip formatter={(v: number) => formatBRL(v)} />
              <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="Líquido" stackId="a" fill="var(--primary)" />

            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="mb-3 mt-8 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">Parcelas por data de recebimento</h2>
      </div>
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando…</p>
      ) : monthRows.length === 0 ? (
        <EmptyState title="Nenhum recebível de cartão neste mês" />
      ) : (
        <TxnTable rows={monthRows} showFee />
      )}
      </QueryFeedback>
    </div>
  );
}

