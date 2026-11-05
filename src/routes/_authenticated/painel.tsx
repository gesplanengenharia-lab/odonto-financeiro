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
  const [tab, setTab] = useState("resumo");
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
        subtitle="O essencial do mês, com detalhes nas abas"
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
        <Tabs value={tab} onValueChange={setTab}>
          <div className="overflow-x-auto pb-1">
            <TabsList
              aria-label="Detalhes do painel"
              className="h-auto w-max min-w-full justify-start"
            >
              <TabsTrigger value="resumo">Resumo</TabsTrigger>
              <TabsTrigger value="faturamento">Faturamento</TabsTrigger>
              <TabsTrigger value="recebimentos">Recebimentos</TabsTrigger>
              <TabsTrigger value="caixa">Dinheiro, Pix e débito</TabsTrigger>
              <TabsTrigger value="dre">DRE e custos</TabsTrigger>
              <TabsTrigger value="diario">Fechamento diário</TabsTrigger>
            </TabsList>
          </div>
          {m.missingPaidDates > 0 && (
            <p className="mt-2 text-xs text-warning">
              {m.missingPaidDates} lançamento(s) pago(s) sem data de pagamento: o vencimento foi
              usado como referência.
            </p>
          )}
          <TabsContent value="resumo" className="space-y-4">
            <section
              className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
              aria-label="Resumo financeiro do mês"
            >
              <StatCard
                label="Faturamento do mês"
                value={billing.total}
                tone="primary"
                hint="Vendas por competência, incluindo parcelas futuras"
              />
              <StatCard
                label="Recebido no caixa"
                value={m.received}
                tone="income"
                hint="Todas as formas, pela data do recebimento"
              />
              <StatCard
                label="Despesas pagas"
                value={m.paid}
                tone="expense"
                hint="Saídas pela data do pagamento"
              />
              <StatCard
                label={m.cashDre.profit < 0 ? "Prejuízo do mês · caixa" : "Lucro do mês · caixa"}
                value={m.cashDre.profit}
                tone={m.cashDre.profit >= 0 ? "income" : "expense"}
                hint={
                  <>
                    <strong>
                      {m.cashDre.grossRevenue > 0 ? formatPct(m.cashDre.margin) : "—"}
                    </strong>{" "}
                    de margem · recebido menos pago
                  </>
                }
              />
            </section>
            <section
              className="surface-card overflow-hidden"
              aria-labelledby="month-attention-title"
            >
              <div className="px-5 py-4 border-b border-border">
                <h2 id="month-attention-title" className="font-semibold">
                  Para acompanhar
                </h2>
              </div>
              <dl className="divide-y divide-border">
                <div className="flex items-center justify-between gap-4 px-5 py-3">
                  <dt>
                    <button
                      type="button"
                      className="text-sm font-medium text-primary hover:underline"
                      onClick={() => setTab("caixa")}
                    >
                      Dinheiro, Pix e débito recebidos
                    </button>
                    <p className="text-xs text-muted-foreground">
                      Parte do total recebido no caixa
                    </p>
                  </dt>
                  <dd className="tabular font-semibold text-income">
                    {formatBRL(liquid.received)}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-4 px-5 py-3">
                  <dt>
                    <button
                      type="button"
                      className="text-sm font-medium text-primary hover:underline"
                      onClick={() => setTab("recebimentos")}
                    >
                      Ainda deve entrar no mês
                    </button>
                    <p className="text-xs text-muted-foreground">
                      A vencer, sem incluir os atrasados
                    </p>
                  </dt>
                  <dd className="tabular font-semibold">{formatBRL(m.toReceive)}</dd>
                </div>
                <div className="flex items-center justify-between gap-4 px-5 py-3">
                  <dt>
                    <Link to="/contas" className="text-sm font-medium text-primary hover:underline">
                      Contas em aberto do mês
                    </Link>
                    {m.priorToPay > 0 && (
                      <p className="text-xs text-warning">
                        Mais {formatBRL(m.priorToPay)} de meses anteriores
                      </p>
                    )}
                  </dt>
                  <dd className="tabular font-semibold text-expense">{formatBRL(m.toPay)}</dd>
                </div>
              </dl>
            </section>
            {defaultedTotal > 0 && (
              <p className="rounded-lg border border-warning/30 bg-warning/5 px-4 py-3 text-sm">
                <Link to="/inadimplentes" className="font-medium text-warning hover:underline">
                  {formatBRL(defaultedTotal)} em recebimentos atrasados
                </Link>
                <span className="text-muted-foreground">
                  {" "}
                  · {defaulted.length} parcela(s), considerando todos os meses.
                </span>
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              Faturamento e recebimento são visões diferentes. O resultado de caixa usa os
              lançamentos pagos e não representa o saldo bancário.
            </p>
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
          </TabsContent>
          <TabsContent value="faturamento">
            <BillingTab
              month={month}
              billing={billing}
              history={historyMonths.map((k) => ({
                month: k,
                billing: monthBilling(historyQuery.data ?? [], k),
              }))}
              historyLoading={historyQuery.isPending}
              historyError={historyQuery.isError}
              onRetryHistory={() => {
                void historyQuery.refetch();
              }}
            />
          </TabsContent>
          <TabsContent value="recebimentos">
            <section
              className="grid gap-4 sm:grid-cols-2"
              aria-label="Inadimplência dos recebimentos"
            >
              <StatCard
                label="Inadimplência do mês"
                value={indicators.defaultedAmount}
                tone="warning"
                hint={`${pct(indicators.defaultPct)} dos valores não-cartão com vencimento no mês até ontem`}
              />
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
            </section>
            <section className="surface-card mt-4 overflow-hidden" aria-labelledby="methods-title">
              <div className="p-5 sm:p-6">
                <h2 id="methods-title" className="text-base font-semibold">
                  Recebimentos por forma de pagamento · caixa
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  O que cai no mês pela data de recebimento (o faturamento por competência está na
                  aba “Faturamento”). Valores líquidos. Cartões já descontam as taxas;
                  parcelas aparecem no respectivo mês de recebimento. O percentual mostra a
                  participação no total líquido já recebido no mês.
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

            <div className="surface-card p-5 mt-4">
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
          </TabsContent>
          <TabsContent value="caixa">
            <CashPixTab month={month} data={liquid} />
          </TabsContent>
          <TabsContent value="dre" className="space-y-4">
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
          </TabsContent>
          <TabsContent value="diario">
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
                  momentos diferentes: no caixa acima entram apenas os cartões marcados como
                  recebidos nesta data, já líquidos de taxas.
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
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}

