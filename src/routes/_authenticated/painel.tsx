import { GrowthPanel } from "@/components/finance/GrowthPanel";
import { Forecast90Panel } from "@/components/finance/Forecast90Panel";
import { useFinancialMonth } from "@/hooks/use-financial-month";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useRef, useState } from "react";
import { Calculator, RefreshCw } from "lucide-react";
import { pageHead } from "@/lib/head";
import {
  addMonths,
  cashMargin,
  cashPixMonth,
  cashValue,
  dashboardAlerts,
  dashboardCosts,
  dashboardDay,
  dashboardIndicators,
  dashboardMonth,
  defaultedReceivables,
  formatBRL,
  formatDate,
  formatMonth,
  formatPct,
  monthBilling,
  managementComparison,
  monthKey,
  monthRange,
  nextMonths,
  PAYMENT_LABELS,
  receiptComposition,
  summarize,
  todayISO,
  addDays,
} from "@/lib/finance";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BillingTab, CashPixTab } from "@/components/finance/PainelTabs";
import { AlertsPanel, CostsPanel, DefaultPanel, KpiStrip } from "@/components/finance/PainelResumo";
import { categoriesQuery, txnsByCompetenceQuery, txnsByDueQuery } from "@/lib/queries";

import {
  EmptyState,
  KindBadge,
  MonthPicker,
  Money,
  Pct,
  PeriodTag,
  StatCard,
} from "@/components/finance/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/_authenticated/painel")({
  head: () =>
    pageHead(
      "Painel financeiro",
      "Faturamento, recebimentos, despesas, resultado e alertas do mês da clínica.",
    ),
  component: Painel,
});

function Painel() {
  const today = todayISO();
  const currentMonth = monthKey(today);
  const [month, setMonth] = useFinancialMonth();
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [tab, setTab] = useState("evolucao");
  const detailsRef = useRef<HTMLElement>(null);
  const [selectedDay, setSelectedDay] = useState(today);
  const day = monthKey(selectedDay) === month ? selectedDay : `${month}-01`;
  const { start, end } = monthRange(month);
  // All dates are required: an old installment may have been settled this month.
  const cashQuery = useQuery(txnsByDueQuery());
  const compQuery = useQuery(txnsByCompetenceQuery(start, end));
  const historyStart = addMonths(start, -5);
  const historyQuery = useQuery({
    ...txnsByCompetenceQuery(historyStart, end),
    enabled: detailsOpen,
  });
  const categoryQuery = useQuery(categoriesQuery());
  const cash = useMemo(() => cashQuery.data ?? [], [cashQuery.data]);
  const comp = useMemo(() => compQuery.data ?? [], [compQuery.data]);
  const m = useMemo(() => dashboardMonth(cash, month, today), [cash, month, today]);
  const daily = useMemo(() => dashboardDay(cash, day), [cash, day]);
  const s = summarize(comp);
  const pending = cash.filter((t) => t.status === "pendente");
  const upcoming = pending
    .filter((t) => t.due_date >= today && t.due_date <= addDays(today, 7))
    .slice(0, 8);
  const indicators = dashboardIndicators(cash, comp, month, today);
  const costs = dashboardCosts(comp, categoryQuery.data ?? []);
  const pct = (value: number | null) => (value === null ? "sem base" : formatPct(value));
  const billing = monthBilling(comp, month);
  const composition = useMemo(() => receiptComposition(cash, month), [cash, month]);
  const alerts = useMemo(() => dashboardAlerts(cash, today), [cash, today]);
  const defaulted = useMemo(
    () => defaultedReceivables(cash, month, false, today),
    [cash, month, today],
  );
  const liquid = useMemo(() => cashPixMonth(cash, month, today), [cash, month, today]);
  const margin = cashMargin(m.realized, m.received);
  const historyMonths = nextMonths(monthKey(historyStart), 6);
  const comparison = useMemo(() => managementComparison(cash, month, today), [cash, month, today]);
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
  const periodNote =
    month === currentMonth
      ? "Mês atual · valores realizados até hoje"
      : month < currentMonth
        ? "Mês encerrado"
        : "Mês futuro · apenas previsões";
  const openTab = (value: string) => {
    setTab(value);
    detailsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
            Essencial Odontologia
          </p>
          <h1 className="mt-1 text-[1.9rem] leading-tight sm:text-[2.25rem]">Visão dos sócios</h1>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            {formatMonth(month, true)}
            <PeriodTag>{periodNote}</PeriodTag>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <MonthPicker value={month} onChange={setMonth} />
          {month !== currentMonth && (
            <Button variant="ghost" size="sm" onClick={() => setMonth(currentMonth)}>
              Ir para o mês atual
            </Button>
          )}
        </div>
      </header>

      {cashQuery.isPending || compQuery.isPending ? (
        <div
          className="space-y-6"
          role="status"
          aria-label={`Carregando o financeiro de ${formatMonth(month, true)}`}
        >
          <Skeleton className="h-44 w-full rounded-2xl" />
          <div className="grid gap-6 lg:grid-cols-3">
            <Skeleton className="h-72 rounded-2xl lg:col-span-2" />
            <Skeleton className="h-72 rounded-2xl" />
          </div>
          <span className="sr-only">Carregando…</span>
        </div>
      ) : cashQuery.isError || compQuery.isError ? (
        <div className="surface-card p-6" role="alert">
          <p className="font-semibold text-expense">Não foi possível carregar o painel.</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Nenhum valor foi exibido para não mostrar saldos incorretos. Confira a conexão e tente
            novamente.
          </p>
          <Button
            className="mt-3 gap-2"
            variant="outline"
            onClick={() => {
              void cashQuery.refetch();
              void compQuery.refetch();
            }}
          >
            <RefreshCw className="h-4 w-4" /> Tentar novamente
          </Button>
        </div>
      ) : (
        <>
          <KpiStrip
            month={month}
            billing={billing}
            cash={m}
            composition={composition}
            margin={margin}
            comparison={comparison}
          />

          {!comparison.future && (
            <p className="text-xs text-muted-foreground" aria-label="Período da comparação">
              Comparação: {formatDate(comparison.start)} a {formatDate(comparison.end)} contra{" "}
              {formatDate(comparison.previousStart)} a {formatDate(comparison.previousEnd)}
              {comparison.partial
                ? " · mesmos dias do mês anterior, limitado ao último dia existente."
                : " · meses completos."}
            </p>
          )}

          {m.missingPaidDates > 0 && (
            <p className="text-xs text-warning">
              {m.missingPaidDates} lançamento(s) pago(s) neste mês sem data de pagamento: o
              vencimento foi usado como referência.
            </p>
          )}

          <section
            aria-label="Pendências do mês"
            className="grid gap-4 border-y border-border py-5 sm:grid-cols-3"
          >
            <Link to="/contas" className="rounded-lg px-3 py-2 hover:bg-muted">
              <p className="text-sm text-muted-foreground">A receber no mês</p>
              <p className="tabular mt-1 text-xl font-semibold">
                {formatBRL(m.toReceive + m.overdueReceivable)}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">Inclui vencidos deste mês</p>
            </Link>
            <Link to="/contas" className="rounded-lg px-3 py-2 hover:bg-muted">
              <p className="text-sm text-muted-foreground">A pagar no mês</p>
              <p className="tabular mt-1 text-xl font-semibold">{formatBRL(m.toPay)}</p>
              <p className="mt-1 text-xs text-muted-foreground">Contas ainda em aberto</p>
            </Link>
            <Link to="/inadimplentes" className="rounded-lg px-3 py-2 hover:bg-muted">
              <p className="text-sm text-muted-foreground">Pacientes em atraso</p>
              <p className="tabular mt-1 text-xl font-semibold">{formatBRL(defaulted.total)}</p>
              <p className="mt-1 text-xs text-muted-foreground">Todos os meses · até ontem</p>
            </Link>
          </section>
          <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
            <section className="surface-card p-5" aria-label="Recebimentos do mês por forma">
              <h2 className="text-base">Como entrou</h2>
              {composition.rows.filter((row) => row.amount > 0).length === 0 ? (
                <p className="py-8 text-sm text-muted-foreground">Nenhum recebimento neste mês.</p>
              ) : (
                <ul className="mt-3 divide-y divide-border">
                  {composition.rows
                    .filter((row) => row.amount > 0)
                    .map((row) => (
                      <li
                        key={row.key}
                        className="flex items-center justify-between gap-3 py-3 text-sm"
                      >
                        <span>{row.label}</span>
                        <strong className="tabular font-medium">{formatBRL(row.amount)}</strong>
                      </li>
                    ))}
                </ul>
              )}
              <p className="mt-3 text-xs text-muted-foreground">
                Baixas registradas no sistema. Confirmação bancária na Tesouraria.
              </p>
            </section>
            <AlertsPanel alerts={alerts} />
          </div>
          <div>
            <button
              type="button"
              aria-expanded={detailsOpen}
              aria-controls="financial-details"
              onClick={() => setDetailsOpen(!detailsOpen)}
              className="w-full rounded-lg border border-border bg-card px-5 py-4 text-left text-sm font-medium hover:bg-muted"
            >
              {detailsOpen ? "Ocultar análises detalhadas" : "Ver análises e fechamento diário"}
            </button>
            {detailsOpen && (
              <div id="financial-details" className="mt-5 space-y-6">
                <section
                  ref={detailsRef}
                  aria-labelledby="details-title"
                  className="scroll-mt-6 space-y-4"
                >
                  <div>
                    <h2 id="details-title" className="text-xl">
                      Aprofundar a análise
                    </h2>
                    <p className="text-sm text-muted-foreground">
                      Detalhes de {formatMonth(month, true)} por assunto.
                    </p>
                  </div>
                  <Tabs value={tab} onValueChange={setTab}>
                    <div className="overflow-x-auto pb-1">
                      <TabsList
                        aria-label="Análises detalhadas"
                        className="h-auto w-max min-w-full justify-start"
                      >
                        <TabsTrigger value="evolucao">Crescimento</TabsTrigger>
                        <TabsTrigger value="previsao90">Caixa 90 dias</TabsTrigger>
                        <TabsTrigger value="faturamento">Faturamento</TabsTrigger>
                        <TabsTrigger value="formas">Recebimentos e agenda</TabsTrigger>
                        <TabsTrigger value="contas">À vista × contas</TabsTrigger>
                        <TabsTrigger value="dre">DRE e custos</TabsTrigger>
                        <TabsTrigger value="diario">Fechamento diário</TabsTrigger>
                      </TabsList>
                    </div>
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
                    <TabsContent value="formas" className="space-y-4">
                      <DefaultPanel
                        month={month}
                        data={defaulted}
                        monthRate={indicators.defaultPct}
                        monthBase={indicators.dueAmount}
                      />

                      <section
                        className="surface-card overflow-hidden"
                        aria-labelledby="methods-title"
                      >
                        <div className="p-5 sm:p-6">
                          <h2 id="methods-title" className="text-base font-semibold">
                            Recebimentos por forma de pagamento · caixa
                          </h2>
                          <p className="mt-1 text-sm text-muted-foreground">
                            O que cai no mês pela data de recebimento (o faturamento por competência
                            está na aba “Faturamento”). Valores líquidos. Cartões já descontam as
                            taxas; parcelas aparecem no respectivo mês de recebimento. O percentual
                            mostra a participação no total líquido já recebido no mês.
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
                                  <td className="tabular px-5 py-3 text-right">
                                    {formatBRL(r.expected)}
                                  </td>
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
                          * Recebido pela data de pagamento + pendentes pelo vencimento. O total
                          inclui atrasados; a projeção de fechamento não.
                        </p>
                      </section>
                      <div className="surface-card p-5 mt-4">
                        <div className="flex items-center justify-between gap-2">
                          <h2 className="text-base font-semibold">
                            Vencimentos dos próximos 7 dias
                          </h2>
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
                    <TabsContent value="contas" className="space-y-4">
                      <div className="surface-card flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <h2 className="text-base">Simulação de pagamento das contas</h2>
                          <p className="text-sm text-muted-foreground">
                            Abaixo, o que entrou à vista em {formatMonth(month, true)} comparado às
                            contas do mês. Para projetar com saldo inicial e aportes, use a
                            simulação.
                          </p>
                        </div>
                        <Button asChild variant="outline" className="shrink-0 gap-2">
                          <Link to="/simulacao">
                            <Calculator className="h-4 w-4" /> Abrir simulação de caixa
                          </Link>
                        </Button>
                      </div>
                      <CashPixTab month={month} data={liquid} />
                    </TabsContent>
                    <TabsContent value="dre" className="space-y-4">
                      <CostsPanel
                        month={month}
                        summary={s}
                        costs={costs}
                        categoriesState={
                          categoryQuery.isPending
                            ? "loading"
                            : categoryQuery.isError
                              ? "error"
                              : "ready"
                        }
                        onRetry={() => void categoryQuery.refetch()}
                        onOpenDre={() => openTab("dre")}
                      />
                      <section className="surface-card overflow-hidden" aria-labelledby="dre-title">
                        <div className="p-5">
                          <h2 id="dre-title" className="text-base font-semibold">
                            DRE gerencial do mês — caixa × competência
                          </h2>
                          <p className="mt-1 text-sm text-muted-foreground">
                            Caixa: o que foi recebido e pago. Competência: receitas e despesas
                            atribuídas ao mês, mesmo sem pagamento.
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
                                  <td className="tabular px-5 py-3 text-right">
                                    {formatBRL(r.cash)}
                                  </td>
                                  <td className="tabular px-5 py-3 text-right">
                                    {formatBRL(r.comp)}
                                  </td>
                                </tr>
                              ))}
                              <tr className="border-t border-border">
                                <th scope="row" className="px-5 py-3 text-left font-medium">
                                  Margem (resultado ÷ receita)
                                </th>
                                <td className="tabular px-5 py-3 text-right">
                                  <Pct value={cashMargin(m.cashDre.profit, m.cashDre.netRevenue)} />
                                </td>
                                <td className="tabular px-5 py-3 text-right">
                                  <Pct value={s.grossRevenue > 0 ? s.margin : null} />
                                </td>
                              </tr>
                            </tbody>
                          </table>
                        </div>
                        <p className="px-5 py-3 text-xs text-muted-foreground">
                          Resumo dos lançamentos existentes. O cadastro atual não separa aportes,
                          investimentos e retiradas do resultado operacional; o saldo inicial da
                          simulação não entra nesta DRE.
                        </p>
                      </section>
                      <section
                        className="surface-card mt-4 p-5 sm:p-6"
                        aria-labelledby="costs-detail-title"
                      >
                        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
                          <h2 id="costs-detail-title" className="text-base font-semibold">
                            Custos do mês por categoria
                          </h2>
                          <span className="tabular font-semibold">
                            {formatBRL(s.totalExpenses)}
                          </span>
                        </div>
                        <p className="mb-4 text-xs text-muted-foreground">
                          Despesas por competência, pagas e pendentes. Percentuais sobre o total de
                          despesas, sem taxas de cartão.
                        </p>
                        {categoryQuery.isPending ? (
                          <p role="status">Carregando categorias…</p>
                        ) : categoryQuery.isError ? (
                          <p role="alert">
                            Não foi possível carregar as categorias.{" "}
                            <button
                              className="underline"
                              onClick={() => void categoryQuery.refetch()}
                            >
                              Tentar novamente
                            </button>
                          </p>
                        ) : (
                          <div className="grid gap-4 lg:grid-cols-2">
                            {costs
                              .filter((group) => group.nature !== null || group.rows.length > 0)
                              .map((group) => (
                                <div
                                  key={group.label}
                                  className="rounded-xl border border-border p-4"
                                >
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
                      <section
                        className="surface-card overflow-hidden"
                        aria-labelledby="daily-title"
                      >
                        <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-end sm:justify-between">
                          <div>
                            <h2 id="daily-title" className="text-base font-semibold">
                              Fechamento diário — conferência
                            </h2>
                            <p className="mt-1 text-sm text-muted-foreground">
                              Confira os lançamentos pagos com o extrato, os comprovantes e o
                              dinheiro do dia.
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
                            <strong>{formatBRL(daily.cardSales)}</strong> (bruto). Venda e
                            recebimento são momentos diferentes: no caixa acima entram apenas os
                            cartões marcados como recebidos nesta data, já líquidos de taxas.
                          </p>
                          <p>
                            Conferência calculada com os lançamentos atuais; não registra aprovação,
                            não bloqueia alterações e não faz conciliação bancária automática.
                          </p>
                          {daily.missingPaidDates > 0 && (
                            <p className="text-warning">
                              {daily.missingPaidDates} lançamento(s) pago(s), em todo o cadastro,
                              não têm data de pagamento e não entram na conferência diária.
                            </p>
                          )}
                        </div>
                      </section>
                    </TabsContent>
                    <TabsContent value="evolucao">
                      <GrowthPanel rows={cash} month={month} today={today} />
                    </TabsContent>
                    <TabsContent value="previsao90">
                      <Forecast90Panel rows={cash} today={today} />
                    </TabsContent>
                  </Tabs>
                </section>
                <details className="group surface-card px-5 py-4 text-sm">
                  <summary className="cursor-pointer select-none font-medium text-foreground marker:text-primary">
                    Como ler estes números
                  </summary>
                  <ul className="mt-3 list-disc space-y-1.5 pl-5 text-muted-foreground">
                    <li>
                      <strong className="text-foreground">Faturamento (competência)</strong>: vendas
                      atribuídas ao mês, inclusive parcelas que só serão recebidas depois.
                    </li>
                    <li>
                      <strong className="text-foreground">Recebimentos (caixa)</strong>: o que foi
                      considerado recebido no mês, pela data do recebimento. Inclui baixas
                      automáticas por vencimento, que não comprovam o depósito no banco.
                    </li>
                    <li>
                      <strong className="text-foreground">Resultado de caixa</strong>: recebimentos
                      menos despesas pagas no mês. Não é o saldo bancário — o saldo das contas fica
                      na Tesouraria.
                    </li>
                    <li>
                      <strong className="text-foreground">Margem de caixa</strong>: resultado de
                      caixa dividido pelos recebimentos do mês. Quando não há recebimentos, aparece
                      “Sem base para cálculo”.
                    </li>
                    <li>
                      Aportes, transferências e financiamentos não são faturamento nem lucro
                      operacional.
                    </li>
                  </ul>
                </details>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
