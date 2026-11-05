import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { pageHead } from "@/lib/head";
import {
  addMonths,
  cashValue,
  dashboardDay,
  dashboardIndicators,
  dashboardCosts,
  dashboardMonth,
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
  monthBilling,
  cashPixMonth,
} from "@/lib/finance";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BillingTab, CashPixTab } from "@/components/finance/PainelTabs";
import { categoriesQuery, txnsByCompetenceQuery, txnsByDueQuery } from "@/lib/queries";
import { LaunchDialog } from "@/components/finance/LaunchDialog";
import {
  EmptyState,
  KindBadge,
  MonthPicker,
  Money,
  PageHeader,
  StatCard,
} from "@/components/finance/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/_authenticated/painel")({
  head: () => pageHead("Painel", "Resumo financeiro do mês da clínica."),
  component: Painel,
});

function Painel() {
  const today = todayISO();
  const [month, setMonth] = useState(monthKey(today));
  const [selectedDay, setSelectedDay] = useState(today);
  const day = monthKey(selectedDay) === month ? selectedDay : `${month}-01`;
  const { start, end } = monthRange(month);
  // All dates are required: an old installment may have been settled this month.
  const cashQuery = useQuery(txnsByDueQuery());
  const compQuery = useQuery(txnsByCompetenceQuery(start, end));
  const historyStart = addMonths(start, -5);
  const historyQuery = useQuery(txnsByCompetenceQuery(historyStart, end));
  const categoryQuery = useQuery(categoriesQuery());
  const cash = useMemo(() => cashQuery.data ?? [], [cashQuery.data]);
  const comp = compQuery.data ?? [];
  const m = useMemo(() => dashboardMonth(cash, month, today), [cash, month, today]);
  const daily = useMemo(() => dashboardDay(cash, day), [cash, day]);
  const s = summarize(comp);
  const pending = cash.filter((t) => t.status === "pendente");
  const defaulted = pending.filter((t) => isDefaulted(t, today));
  const defaultedTotal = summarize(defaulted).grossRevenue;
  const upcoming = pending
    .filter((t) => t.due_date >= today && t.due_date <= addDays(today, 7))
    .slice(0, 8);
  const indicators = dashboardIndicators(cash, comp, month, today);
  const costs = dashboardCosts(comp, categoryQuery.data ?? []);
  const pct = (value: number | null) => (value === null ? "—" : formatPct(value));
  const billing = monthBilling(comp, month);
  const liquid = useMemo(() => cashPixMonth(cash, month, today), [cash, month, today]);
  const historyMonths = nextMonths(monthKey(historyStart), 6);
  const history = nextMonths(monthKey(addMonths(start, -5)), 6).map((k) => {
    const row = dashboardMonth(cash, k, today);
    return { mes: formatMonth(k), Recebido: row.received, Pago: row.paid };
  });
  const dreRows = [
    { label: "Receita bruta", cash: m.cashDre.grossRevenue, comp: s.grossRevenue },
    { label: "(−) Taxas de cartão", cash: -m.cashDre.cardFees, comp: -s.cardFees },
    { label: "(=) Receita líquida", cash: m.cashDre.netRevenue, comp: s.netRevenue, strong: true },
    { label: "(−) Despesas fixas", cash: -m.cashDre.fixedExpenses, comp: -s.fixedExpenses },
    {
      label: "(−) Despesas variáveis / sem natureza",
      cash: -m.cashDre.variableExpenses,
      comp: -s.variableExpenses,
    },
    { label: "(=) Resultado gerencial", cash: m.cashDre.profit, comp: s.profit, strong: true },
  ];

  return (
    <div>
      <PageHeader
        title="Painel"
        subtitle="Recebimentos, despesas e indicadores do mês"
        actions={
          <>
            <MonthPicker value={month} onChange={setMonth} />
            <Button asChild variant="outline">
              <Link to="/simulacao">Simulação</Link>
            </Button>
            <LaunchDialog />
          </>
        }
      />
      {cashQuery.isPending || compQuery.isPending ? (
        <div className="surface-card p-8 text-sm text-muted-foreground" role="status">
          Carregando o financeiro de {formatMonth(month, true)}…
        </div>
      ) : cashQuery.isError || compQuery.isError ? (
        <div className="surface-card p-6" role="alert">
          <p className="font-semibold text-expense">Não foi possível carregar o painel.</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Confira a conexão e tente novamente para visualizar os valores.
          </p>
          <Button
            className="mt-3"
            variant="outline"
            onClick={() => {
              void cashQuery.refetch();
              void compQuery.refetch();
            }}
          >
            Tentar novamente
          </Button>
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Já entrou no mês"
              value={m.received}
              tone="income"
              hint="Recebimentos líquidos pela data de pagamento"
            />
            <StatCard
              label="Ainda deve entrar"
              value={m.toReceive}
              tone="primary"
              hint="Pendentes a vencer no mês, sem os atrasados"
            />
            <StatCard
              label="Contas em aberto do mês"
              value={m.toPay}
              tone="expense"
              hint={`${formatBRL(m.paid)} já pagos neste mês`}
            />
            <StatCard
              label="Movimento previsto do mês"
              value={m.projected}
              tone={m.projected >= 0 ? "income" : "expense"}
              hint="Entradas − saídas, incluindo contas anteriores em aberto"
            />
          </div>

          <section
            className="mt-4 grid gap-4 sm:grid-cols-3"
            aria-label="Faturamento e caixa do mês"
          >
            <StatCard
              label="Faturado no mês · competência"
              value={billing.total}
              tone="primary"
              hint={`${billing.count} lançamento(s) de ${formatMonth(month, true)}, incluindo parcelas futuras`}
            />
            <StatCard
              label="Dinheiro + Pix recebido"
              value={liquid.received}
              tone="income"
              hint={`Dinheiro ${formatBRL(liquid.dinheiro)} · Pix ${formatBRL(liquid.pix)}`}
            />
            <StatCard
              label={liquid.balance < 0 ? "Falta para as contas" : "Sobra após as contas"}
              value={liquid.balance}
              tone={liquid.balance >= 0 ? "income" : "expense"}
              hint={`Dinheiro + Pix − ${formatBRL(liquid.bills)} em contas do mês`}
            />
          </section>

          <Tabs defaultValue="geral" className="mt-6">
            <TabsList className="h-auto flex-wrap">
              <TabsTrigger value="geral">Visão geral</TabsTrigger>
              <TabsTrigger value="faturamento">Faturamento do mês</TabsTrigger>
              <TabsTrigger value="caixa">Dinheiro e Pix</TabsTrigger>
            </TabsList>

            <TabsContent value="faturamento">
              <BillingTab
                month={month}
                billing={billing}
                history={historyMonths.map((k) => ({
                  month: k,
                  billing: monthBilling(historyQuery.data ?? [], k),
                }))}
                historyLoading={historyQuery.isPending}
              />
            </TabsContent>

            <TabsContent value="caixa">
              <CashPixTab month={month} data={liquid} />
            </TabsContent>

            <TabsContent value="geral">
          <section
            className="mt-2 grid gap-4 sm:grid-cols-2"
            aria-label="Lucro e margem do mês"
          >
            <StatCard
              label={m.cashDre.profit < 0 ? "Prejuízo do mês · caixa" : "Lucro do mês · caixa"}
              value={m.cashDre.profit}
              tone={m.cashDre.profit >= 0 ? "income" : "expense"}
              hint={<><strong className="text-base">{m.cashDre.grossRevenue > 0 ? formatPct(m.cashDre.margin) : "—"}</strong> de margem · recebido menos despesas pagas no mês. Não inclui parcelas futuras nem saldo inicial.</>}
            />
            <StatCard
              label={s.profit < 0 ? "Prejuízo do mês · competência" : "Lucro do mês · competência"}
              value={s.profit}
              tone={s.profit >= 0 ? "income" : "expense"}
              hint={<><strong className="text-base">{pct(indicators.profitPct)}</strong> de margem · vendas menos despesas atribuídas ao mês, incluindo valores ainda pendentes.</>}
            />
          </section>
          <section
            className="mt-4 grid gap-4 sm:grid-cols-3"
            aria-label="Indicadores percentuais do mês"
          >
            <StatCard
              label="Inadimplência do mês"
              value={indicators.defaultedAmount}
              tone="warning"
              hint={`${pct(indicators.defaultPct)} dos valores não-cartão com vencimento no mês até ontem`}
            />
            <StatCard
              label="Despesas fixas"
              value={s.fixedExpenses}
              tone="expense"
              hint={`${pct(indicators.fixedPct)} das despesas do mês · competência`}
            />
            <StatCard
              label="Despesas variáveis / sem natureza"
              value={s.variableExpenses}
              tone="expense"
              hint={`${pct(indicators.variablePct)} das despesas do mês · competência`}
            />
          </section>
          <p className="mt-2 text-xs text-muted-foreground">
            Inadimplência: valores ainda pendentes ÷ total com vencimento já passado no mês, sem
            cartões. Despesas não incluem taxas de cartão. “—” indica ausência de base para
            calcular.
          </p>
          {m.missingPaidDates > 0 && (
            <p className="mt-2 text-xs text-warning">
              {m.missingPaidDates} lançamento(s) pago(s) sem data de pagamento: o vencimento foi
              usado como referência.
            </p>
          )}

          <section className="surface-card mt-4 overflow-hidden" aria-labelledby="methods-title">
            <div className="p-5 sm:p-6">
              <h2 id="methods-title" className="text-base font-semibold">
                Recebimentos por forma de pagamento · caixa
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                O que cai no mês pela data de recebimento (o faturamento por competência está na
                aba “Faturamento do mês”). Valores líquidos. Cartões já descontam as taxas; parcelas aparecem no respectivo mês
                de recebimento. O percentual mostra a participação no total líquido já recebido no
                mês.
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[660px] text-sm">
                <thead className="bg-muted/40 text-xs text-muted-foreground">
                  <tr>
                    <th className="px-5 py-3 text-left">Forma</th>
                    <th className="px-5 py-3 text-right">Já entrou</th>
                    <th className="px-5 py-3 text-right">A vencer no mês</th>
                    <th className="px-5 py-3 text-right">Atrasado no mês</th>
                    <th className="px-5 py-3 text-right">Total do mês*</th>
                  </tr>
                </thead>
                <tbody>
                  {m.byMethod.map((r) => (
                    <tr key={r.method} className="border-t border-border">
                      <th scope="row" className="px-5 py-3 text-left font-medium">
                        {PAYMENT_LABELS[r.method]}
                      </th>
                      <td className="tabular px-5 py-3 text-right text-income">
                        {formatBRL(r.received)}
                        <span className="ml-2 text-xs text-muted-foreground">
                          {pct(
                            indicators.byMethod.find((item) => item.method === r.method)
                              ?.receivedPct ?? null,
                          )}
                        </span>
                      </td>
                      <td className="tabular px-5 py-3 text-right">{formatBRL(r.expected)}</td>
                      <td className="tabular px-5 py-3 text-right text-warning">
                        {formatBRL(r.overdue)}
                      </td>
                      <td className="tabular px-5 py-3 text-right font-semibold">
                        {formatBRL(r.total)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="px-5 py-3 text-xs text-muted-foreground">
              * Recebido pela data de pagamento + pendentes pelo vencimento. O total inclui
              atrasados; a projeção de fechamento não.
            </p>
          </section>

          <section className="surface-card mt-4 p-5 sm:p-6" aria-labelledby="costs-title">
            <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
              <h2 id="costs-title" className="text-base font-semibold">
                Onde estão os custos do mês
              </h2>
              <span className="tabular font-semibold">{formatBRL(s.totalExpenses)}</span>
            </div>
            <p className="mb-4 text-xs text-muted-foreground">
              Despesas por competência, pagas e pendentes. Percentuais sobre o total de despesas,
              sem taxas de cartão.
            </p>
            {categoryQuery.isPending ? (
              <p role="status">Carregando categorias…</p>
            ) : categoryQuery.isError ? (
              <p role="alert">
                Não foi possível carregar as categorias.{" "}
                <button className="underline" onClick={() => void categoryQuery.refetch()}>
                  Tentar novamente
                </button>
              </p>
            ) : (
              <div className="grid gap-4 lg:grid-cols-2">
                {costs
                  .filter((group) => group.nature !== null || group.rows.length > 0)
                  .map((group) => (
                    <div key={group.label} className="rounded-xl border border-border p-4">
                      <div className="flex flex-wrap justify-between gap-2">
                        <h3 className="font-semibold">{group.label}</h3>
                        <span className="tabular font-semibold">
                          {formatBRL(group.amount)}{" "}
                          <span className="text-xs font-normal text-muted-foreground">
                            {pct(group.percent)} do total
                          </span>
                        </span>
                      </div>
                      {group.rows.length === 0 ? (
                        <p className="mt-4 text-sm text-muted-foreground">
                          Sem despesas neste grupo.
                        </p>
                      ) : (
                        <ul className="mt-4 space-y-4">
                          {group.rows.map((row) => (
                            <li key={row.id ?? "none"}>
                              <div className="flex justify-between gap-3 text-sm">
                                <span>{row.name}</span>
                                <span className="tabular shrink-0">
                                  {formatBRL(row.amount)}{" "}
                                  <span className="text-xs text-muted-foreground">
                                    {pct(row.percent)}
                                  </span>
                                </span>
                              </div>
                              <div
                                className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted"
                                aria-hidden="true"
                              >
                                <div
                                  className={`h-full ${group.nature === "fixa" ? "bg-primary" : group.nature === "variavel" ? "bg-expense" : "bg-warning"}`}
                                  style={{ width: `${row.percent ?? 0}%` }}
                                />
                              </div>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ))}
              </div>
            )}
          </section>

          <section className="surface-card mt-4 overflow-hidden" aria-labelledby="daily-title">
            <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 id="daily-title" className="text-base font-semibold">
                  Fechamento diário — conferência
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Confira os lançamentos pagos com o extrato, os comprovantes e o dinheiro do dia.
                </p>
              </div>
              <div className="shrink-0">
                <Label htmlFor="closing-day">Dia da conferência</Label>
                <Input
                  id="closing-day"
                  className="mt-2 w-44"
                  type="date"
                  value={day}
                  onChange={(e) => {
                    if (e.target.value) {
                      setSelectedDay(e.target.value);
                      setMonth(monthKey(e.target.value));
                    }
                  }}
                />
              </div>
            </div>
            <div className="grid gap-3 px-5 pb-5 sm:grid-cols-3">
              <StatCard
                label="Entrou no dia"
                value={daily.received}
                tone="income"
                hint="Recebimentos líquidos confirmados"
              />
              <StatCard
                label="Saiu no dia"
                value={daily.paid}
                tone="expense"
                hint="Pagamentos confirmados"
              />
              <StatCard
                label="Movimento líquido do dia"
                value={daily.movement}
                tone={daily.movement >= 0 ? "income" : "expense"}
                hint="Entradas − saídas; não é o saldo bancário"
              />
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <caption className="sr-only">Conferência de {formatDate(day)}</caption>
                <thead className="bg-muted/40 text-xs text-muted-foreground">
                  <tr>
                    <th className="px-5 py-3 text-left">Forma de pagamento</th>
                    <th className="px-5 py-3 text-right">Entradas</th>
                    <th className="px-5 py-3 text-right">Saídas</th>
                    <th className="px-5 py-3 text-right">Movimento líquido</th>
                  </tr>
                </thead>
                <tbody>
                  {daily.byMethod.map((r) => (
                    <tr key={r.method} className="border-t border-border">
                      <th scope="row" className="px-5 py-3 text-left font-medium">
                        {PAYMENT_LABELS[r.method]}
                      </th>
                      <td className="tabular px-5 py-3 text-right text-income">
                        {formatBRL(r.received)}
                      </td>
                      <td className="tabular px-5 py-3 text-right text-expense">
                        {formatBRL(r.paid)}
                      </td>
                      <td className="tabular px-5 py-3 text-right font-semibold">
                        {formatBRL(r.movement)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="space-y-2 border-t border-border px-5 py-4 text-xs text-muted-foreground">
              <p>
                {daily.count
                  ? `${daily.count} lançamento(s) com pagamento confirmado em ${formatDate(day)}.`
                  : `Nenhum pagamento confirmado em ${formatDate(day)}.`}
              </p>
              <p>
                Vendas no cartão atribuídas a este dia:{" "}
                <strong>{formatBRL(daily.cardSales)}</strong> (bruto). Venda e recebimento são
                momentos diferentes: no caixa acima entram apenas os cartões marcados como recebidos
                nesta data, já líquidos de taxas.
              </p>
              <p>
                Conferência calculada com os lançamentos atuais; não registra aprovação, não
                bloqueia alterações e não faz conciliação bancária automática.
              </p>
              {daily.missingPaidDates > 0 && (
                <p className="text-warning">
                  {daily.missingPaidDates} lançamento(s) pago(s), em todo o cadastro, não têm data
                  de pagamento e não entram na conferência diária.
                </p>
              )}
            </div>
          </section>

          <div className="mt-4 grid gap-4 xl:grid-cols-2">
            <section className="surface-card overflow-hidden" aria-labelledby="dre-title">
              <div className="p-5">
                <h2 id="dre-title" className="text-base font-semibold">
                  DRE gerencial do mês
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Caixa: o que foi recebido e pago. Competência: receitas e despesas atribuídas ao
                  mês, mesmo sem pagamento.
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[480px] text-sm">
                  <thead className="bg-muted/40 text-xs text-muted-foreground">
                    <tr>
                      <th className="px-5 py-3 text-left">Composição</th>
                      <th className="px-5 py-3 text-right">Caixa realizado</th>
                      <th className="px-5 py-3 text-right">Competência</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dreRows.map((r) => (
                      <tr
                        key={r.label}
                        className={`border-t border-border ${r.strong ? "bg-muted/30 font-semibold" : ""}`}
                      >
                        <th scope="row" className="px-5 py-3 text-left font-[inherit]">
                          {r.label}
                        </th>
                        <td className="tabular px-5 py-3 text-right">{formatBRL(r.cash)}</td>
                        <td className="tabular px-5 py-3 text-right">{formatBRL(r.comp)}</td>
                      </tr>
                    ))}
                    <tr className="border-t border-border">
                      <th scope="row" className="px-5 py-3 text-left font-medium">
                        Margem sobre receita bruta
                      </th>
                      <td className="tabular px-5 py-3 text-right">
                        {m.cashDre.grossRevenue ? formatPct(m.cashDre.margin) : "—"}
                      </td>
                      <td className="tabular px-5 py-3 text-right">
                        {s.grossRevenue ? formatPct(s.margin) : "—"}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p className="px-5 py-3 text-xs text-muted-foreground">
                Resumo dos lançamentos existentes. O cadastro atual não separa aportes,
                investimentos e retiradas do resultado operacional; o saldo inicial da simulação não
                entra nesta DRE.
              </p>
            </section>
            <div className="surface-card p-5">
              <h2 className="text-base font-semibold">Entradas e saídas realizadas — 6 meses</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Somente valores pagos, pela data efetiva de pagamento.
              </p>
              <div className="mt-4 h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={history} barGap={4}>
                    <CartesianGrid vertical={false} stroke="var(--border)" />
                    <XAxis
                      dataKey="mes"
                      tickLine={false}
                      axisLine={false}
                      fontSize={12}
                      stroke="var(--muted-foreground)"
                    />
                    <YAxis
                      tickLine={false}
                      axisLine={false}
                      fontSize={11}
                      stroke="var(--muted-foreground)"
                      tickFormatter={(v) => `${Math.round(v / 1000)}k`}
                    />
                    <Tooltip
                      formatter={(v: number) => formatBRL(v)}
                      contentStyle={{ borderRadius: 8, border: "1px solid var(--border)" }}
                    />
                    <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="Recebido" fill="var(--income)" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="Pago" fill="var(--expense)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-3">
            <StatCard
              label="Inadimplência total atual"
              value={defaultedTotal}
              tone="warning"
              hint={
                <Link to="/inadimplentes" className="text-primary hover:underline">
                  {defaulted.length} parcela(s) vencida(s) em todos os meses
                </Link>
              }
            />
            <div className="surface-card p-5 lg:col-span-2">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-base font-semibold">Vencimentos dos próximos 7 dias</h2>
                <Button asChild variant="link" size="sm">
                  <Link to="/contas">Ver todas</Link>
                </Button>
              </div>
              <p className="mb-3 text-xs text-muted-foreground">
                Agenda a partir de hoje, independente do mês selecionado.
              </p>
              {upcoming.length === 0 ? (
                <EmptyState title="Nada vencendo esta semana" />
              ) : (
                <ul className="divide-y divide-border">
                  {upcoming.map((t) => (
                    <li
                      key={t.id}
                      className="flex items-center justify-between gap-3 py-2.5 text-sm"
                    >
                      <div className="flex min-w-0 items-center gap-2">
                        <KindBadge kind={t.kind} />
                        <span className="truncate">{t.description}</span>
                      </div>
                      <div className="flex shrink-0 items-center gap-3">
                        <span className="tabular text-xs text-muted-foreground">
                          {formatDate(t.due_date)}
                        </span>
                        <Money value={cashValue(t)} kind={t.kind} />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
}
