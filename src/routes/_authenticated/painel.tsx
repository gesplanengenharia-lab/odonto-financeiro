import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { pageHead } from "@/lib/head";
import {
  addMonths,
  cashValue,
  formatBRL,
  formatDate,
  formatMonth,
  formatPct,
  isDefaulted,
  monthKey,
  monthRange,
  nextMonths,
  PAYMENT_LABELS,
  summarize,
  todayISO,
  addDays,
  type PaymentMethod,
} from "@/lib/finance";
import { pendingQuery, txnsByCompetenceQuery, txnsByDueQuery } from "@/lib/queries";
import { LaunchDialog } from "@/components/finance/LaunchDialog";
import { EmptyState, KindBadge, MonthPicker, Money, PageHeader, StatCard } from "@/components/finance/ui";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/painel")({
  head: () => pageHead("Painel", "Resumo financeiro do mês da clínica."),
  component: Painel,
});

const CHART = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)", "var(--muted-foreground)"];

function Painel() {
  const [month, setMonth] = useState(monthKey(todayISO()));
  const { start, end } = monthRange(month);
  const histStart = `${monthKey(addMonths(start, -5))}-01`;

  const { data: cash = [] } = useQuery(txnsByDueQuery(histStart, end));
  const { data: comp = [] } = useQuery(txnsByCompetenceQuery(start, end));
  const { data: pending = [] } = useQuery(pendingQuery());

  const monthCash = cash.filter((t) => t.due_date >= start && t.due_date <= end);
  const sum = (f: (t: (typeof cash)[number]) => boolean) => monthCash.filter(f).reduce((s, t) => s + cashValue(t), 0);
  const received = sum((t) => t.kind === "entrada" && t.status === "pago");
  const toReceive = sum((t) => t.kind === "entrada" && t.status === "pendente");
  const paid = sum((t) => t.kind === "saida" && t.status === "pago");
  const toPay = sum((t) => t.kind === "saida" && t.status === "pendente");
  const s = summarize(comp);
  const defaulted = pending.filter((t) => isDefaulted(t));
  const defaultedTotal = defaulted.reduce((a, t) => a + t.gross_amount, 0);

  const history = useMemo(
    () =>
      nextMonths(monthKey(histStart), 6).map((k) => {
        const rows = cash.filter((t) => monthKey(t.due_date) === k);
        return {
          mes: formatMonth(k),
          Entradas: rows.filter((t) => t.kind === "entrada").reduce((a, t) => a + cashValue(t), 0),
          Saídas: rows.filter((t) => t.kind === "saida").reduce((a, t) => a + cashValue(t), 0),
        };
      }),
    [cash, histStart],
  );

  const byMethod = useMemo(() => {
    const map = new Map<PaymentMethod, number>();
    comp.filter((t) => t.kind === "entrada").forEach((t) => map.set(t.payment_method, (map.get(t.payment_method) ?? 0) + t.gross_amount));
    return [...map.entries()].map(([k, v]) => ({ name: PAYMENT_LABELS[k], value: Math.round(v * 100) / 100 }));
  }, [comp]);

  const today = todayISO();
  const upcoming = pending.filter((t) => t.due_date >= today && t.due_date <= addDays(today, 7)).slice(0, 8);

  return (
    <div>
      <PageHeader
        title="Painel"
        subtitle="Visão do caixa e do resultado do mês"
        actions={
          <>
            <MonthPicker value={month} onChange={setMonth} />
            <LaunchDialog />
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Recebido" value={received} tone="income" hint={`+ ${formatBRL(toReceive)} a receber no mês`} />
        <StatCard label="Pago" value={paid} tone="expense" hint={`+ ${formatBRL(toPay)} a pagar no mês`} />
        <StatCard label="Saldo realizado" value={received - paid} tone="primary" hint={`Previsto no mês: ${formatBRL(received + toReceive - paid - toPay)}`} />
        <StatCard
          label="Inadimplência"
          value={defaultedTotal}
          tone="warning"
          hint={<Link to="/inadimplentes" className="text-primary hover:underline">{defaulted.length} parcela(s) vencida(s)</Link>}
        />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <div className="surface-ink p-6 lg:col-span-1">
          <p className="text-xs font-semibold uppercase tracking-wider text-ink-muted">Resultado do mês (competência)</p>
          <p className="tabular mt-3 font-display text-3xl font-semibold">{formatBRL(s.profit)}</p>
          <p className="mt-1 text-sm text-ink-muted">Margem de lucro {formatPct(s.margin)}</p>
          <dl className="mt-6 grid gap-2 text-sm">
            {[
              ["Receita bruta", s.grossRevenue],
              ["Taxas de cartão", -s.cardFees],
              ["Despesas fixas", -s.fixedExpenses],
              ["Despesas variáveis", -s.variableExpenses],
            ].map(([l, v]) => (
              <div key={l as string} className="flex justify-between border-b border-ink-foreground/10 pb-2">
                <dt className="text-ink-muted">{l}</dt>
                <dd className="tabular font-semibold">{formatBRL(v as number)}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="surface-card p-6 lg:col-span-2">
          <h2 className="text-base font-semibold">Entradas x saídas — últimos 6 meses</h2>
          <div className="mt-4 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={history} barGap={4}>
                <CartesianGrid vertical={false} stroke="var(--border)" />
                <XAxis dataKey="mes" tickLine={false} axisLine={false} fontSize={12} stroke="var(--muted-foreground)" />
                <YAxis tickLine={false} axisLine={false} fontSize={11} stroke="var(--muted-foreground)" tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
                <Tooltip formatter={(v: number) => formatBRL(v)} contentStyle={{ borderRadius: 8, border: "1px solid var(--border)" }} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="Entradas" fill="var(--income)" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Saídas" fill="var(--expense)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className="surface-card p-6">
          <h2 className="text-base font-semibold">Receita por forma de pagamento</h2>
          {byMethod.length === 0 ? (
            <p className="mt-6 text-sm text-muted-foreground">Nenhuma receita neste mês.</p>
          ) : (
            <div className="mt-2 h-60">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={byMethod} dataKey="value" nameKey="name" innerRadius={55} outerRadius={85} paddingAngle={2}>
                    {byMethod.map((_, i) => (
                      <Cell key={i} fill={CHART[i % CHART.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v: number) => formatBRL(v)} />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <div className="surface-card p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold">Vencimentos dos próximos 7 dias</h2>
            <Button asChild variant="link" size="sm">
              <Link to="/contas">Ver todas</Link>
            </Button>
          </div>
          {upcoming.length === 0 ? (
            <EmptyState title="Nada vencendo esta semana" />
          ) : (
            <ul className="mt-3 divide-y divide-border">
              {upcoming.map((t) => (
                <li key={t.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                  <div className="flex min-w-0 items-center gap-2">
                    <KindBadge kind={t.kind} />
                    <span className="truncate">{t.description}</span>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <span className="tabular text-xs text-muted-foreground">{formatDate(t.due_date)}</span>
                    <Money value={cashValue(t)} kind={t.kind} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
