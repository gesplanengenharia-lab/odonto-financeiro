import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { boletoReceivables, formatBRL, formatMonth, monthKey, todayISO } from "@/lib/finance";
import { txnsByDueQuery } from "@/lib/queries";
import { pageHead } from "@/lib/head";
import { TxnTable } from "@/components/finance/TxnTable";
import { EmptyState, MonthPicker, PageHeader, StatCard } from "@/components/finance/ui";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/boletos")({
  head: () => pageHead("Boletos", "Boletos recebidos, em aberto e agenda dos próximos meses."),
  component: Boletos,
});

function Boletos() {
  const today = todayISO();
  const [month, setMonth] = useState(monthKey(today));
  const { data = [], isLoading, isError, refetch } = useQuery(txnsByDueQuery());
  const agenda = useMemo(() => boletoReceivables(data, month, today), [data, month, today]);
  return (
    <div>
      <PageHeader title="Boletos" subtitle="Recebimentos e previsão dos boletos à vista e parcelados"
        actions={<MonthPicker value={month} onChange={setMonth} />} />
      {isLoading ? <p role="status" className="text-sm text-muted-foreground">Carregando boletos…</p> : isError ? (
        <div className="surface-card p-6">
          <p role="alert">Não foi possível carregar os boletos.</p>
          <Button className="mt-3" variant="outline" onClick={() => void refetch()}>Tentar novamente</Button>
        </div>
      ) : <>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label={`Recebido em ${formatMonth(month)}`} value={agenda.received} tone="income" hint="Pela data efetiva do recebimento" />
          <StatCard label={`Em aberto em ${formatMonth(month)}`} value={agenda.open} tone="primary" hint="Pelo vencimento, incluindo atrasados do mês" />
          <StatCard label="A receber nos 23 meses seguintes" value={agenda.future} tone="primary" hint="Após o mês selecionado, somente pendentes" />
          <StatCard label="Boletos atrasados" value={agenda.overdue} tone="warning" hint="Todos os vencidos até ontem e ainda pendentes" />
        </div>

        <section className="surface-card mt-4 p-6" aria-labelledby="boleto-agenda-title">
          <h2 id="boleto-agenda-title" className="text-base font-semibold">Agenda de boletos — 24 meses</h2>
          <p className="mt-1 text-sm text-muted-foreground">Mês selecionado e 23 seguintes. Somente valores ainda em aberto, por vencimento.</p>
          <div className="mt-4 h-64" aria-hidden="true">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={agenda.projection}>
                <CartesianGrid vertical={false} stroke="var(--border)" />
                <XAxis dataKey="month" tickFormatter={(v: string) => formatMonth(v)} tickLine={false} axisLine={false} fontSize={12} />
                <YAxis tickFormatter={(v: number) => `${Math.round(v / 1000)}k`} tickLine={false} axisLine={false} fontSize={11} />
                <Tooltip labelFormatter={(v) => formatMonth(String(v), true)} formatter={(v: number) => formatBRL(v)} />
                <Bar dataKey="amount" name="A receber" fill="var(--primary)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-border text-left text-muted-foreground">
                <th className="py-3">Mês</th><th className="py-3 text-right">Parcelas em aberto</th><th className="py-3 text-right">A receber</th><th className="py-3 text-right">Detalhes</th>
              </tr></thead>
              <tbody>{agenda.projection.map((row) => <tr key={row.month} className="border-b border-border/60">
                <th scope="row" className="py-2 text-left font-medium">{formatMonth(row.month, true)}</th>
                <td className="tabular text-right">{row.count}</td><td className="tabular text-right">{formatBRL(row.amount)}</td>
                <td className="text-right"><Button variant="ghost" size="sm" onClick={() => setMonth(row.month)} aria-label={`Ver boletos de ${formatMonth(row.month, true)}`}>Ver mês</Button></td>
              </tr>)}</tbody>
            </table>
          </div>
        </section>

        <h2 className="mb-3 mt-8 text-lg font-semibold">Boletos com vencimento em {formatMonth(month, true)}</h2>
        {agenda.monthRows.length === 0 ? <EmptyState title="Nenhum boleto com vencimento neste mês" /> : <TxnTable rows={agenda.monthRows} />}
      </>}
    </div>
  );
}
