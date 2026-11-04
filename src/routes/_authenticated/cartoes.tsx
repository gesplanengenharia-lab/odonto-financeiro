import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, Legend } from "recharts";
import { pageHead } from "@/lib/head";
import { addMonths, formatBRL, formatMonth, monthKey, monthRange, nextMonths, todayISO } from "@/lib/finance";
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
  const current = monthKey(today);
  const [month, setMonth] = useState(current);
  const from = `${monthKey(addMonths(`${current}-01`, -12))}-01`;
  const to = monthRange(monthKey(addMonths(`${current}-01`, 12))).end;
  const { data = [], isLoading } = useQuery(txnsByDueQuery(from, to));
  const { setPaid } = useTxnMutations();

  const cards = data.filter((t) => t.kind === "entrada" && (t.payment_method === "credito" || t.payment_method === "debito"));
  const pending = cards.filter((t) => t.status === "pendente");
  const due = pending.filter((t) => t.due_date <= today);
  const futureNet = pending.filter((t) => t.due_date > today).reduce((s, t) => s + t.net_amount, 0);
  const monthRows = cards.filter((t) => monthKey(t.due_date) === month);
  const monthGross = monthRows.reduce((s, t) => s + t.gross_amount, 0);
  const monthFee = monthRows.reduce((s, t) => s + t.fee_amount, 0);

  const projection = useMemo(
    () =>
      nextMonths(current, 12).map((k) => {
        const rows = cards.filter((t) => monthKey(t.due_date) === k);
        return {
          mes: formatMonth(k),
          Líquido: Math.round(rows.reduce((s, t) => s + t.net_amount, 0) * 100) / 100,
          Taxas: Math.round(rows.reduce((s, t) => s + t.fee_amount, 0) * 100) / 100,
        };
      }),
    [cards, current],
  );

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
          due.length > 0 && (
            <Button onClick={confirmDue} disabled={setPaid.isPending}>
              Confirmar {due.length} recebimento(s) até hoje
            </Button>
          )
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="A cair nos próximos meses" value={futureNet} tone="primary" hint="Valor líquido" />
        <StatCard label="Vencido, não confirmado" value={due.reduce((s, t) => s + t.net_amount, 0)} tone="warning" hint="Confira no extrato" />
        <StatCard label={`Bruto em ${formatMonth(month)}`} value={monthGross} tone="income" />
        <StatCard label={`Taxas em ${formatMonth(month)}`} value={monthFee} tone="expense" hint={monthGross ? `${((monthFee / monthGross) * 100).toFixed(1).replace(".", ",")}% do bruto` : undefined} />
      </div>

      <div className="surface-card mt-4 p-6">
        <h2 className="text-base font-semibold">Agenda de recebíveis — próximos 12 meses</h2>
        <div className="mt-4 h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={projection}>
              <CartesianGrid vertical={false} stroke="var(--border)" />
              <XAxis dataKey="mes" tickLine={false} axisLine={false} fontSize={12} stroke="var(--muted-foreground)" />
              <YAxis tickLine={false} axisLine={false} fontSize={11} stroke="var(--muted-foreground)" tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
              <Tooltip formatter={(v: number) => formatBRL(v)} />
              <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="Líquido" stackId="a" fill="var(--primary)" />
              <Bar dataKey="Taxas" stackId="a" fill="var(--expense)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="mb-3 mt-8 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">Parcelas por data de recebimento</h2>
        <MonthPicker value={month} onChange={setMonth} />
      </div>
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando…</p>
      ) : monthRows.length === 0 ? (
        <EmptyState title="Nenhum recebível de cartão neste mês" />
      ) : (
        <TxnTable rows={monthRows} showFee />
      )}
    </div>
  );
}
