import { useFinancialMonth } from "@/hooks/use-financial-month";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { lazy, Suspense, useMemo, useState } from "react";
import { Calculator } from "lucide-react";
import {
  addMonths,
  cashMargin,
  cashPixMonth,
  cashValue,
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
  monthKey,
  monthRange,
  nextMonths,
  PAYMENT_LABELS,
  summarize,
  todayISO,
  addDays,
} from "@/lib/finance";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { QueryFeedback } from "./QueryFeedback";
import { analysisRowsQuery } from "@/lib/performance-queries";
import { CostsPanel, DefaultPanel } from "./PainelResumo";
import { categoriesQuery, txnsByCompetenceQuery } from "@/lib/queries";
import { EmptyState, KindBadge, Money, Pct, StatCard } from "./ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
const FinancialReports = lazy(() =>
  import("./FinancialReports").then((m) => ({ default: m.FinancialReports })),
);
const GrowthPanel = lazy(() => import("./GrowthPanel").then((m) => ({ default: m.GrowthPanel })));
const Forecast90Panel = lazy(() =>
  import("./Forecast90Panel").then((m) => ({ default: m.Forecast90Panel })),
);
const BillingTab = lazy(() => import("./PainelTabs").then((m) => ({ default: m.BillingTab })));
const CashPixTab = lazy(() => import("./PainelTabs").then((m) => ({ default: m.CashPixTab })));

const ClinicDre = lazy(() => import("./ClinicDre").then((m) => ({ default: m.ClinicDre })));

export function ManagementDetails({
  initialTab = "evolucao",
  onSelect,
}: {
  initialTab?: string;
  onSelect?: (value: string) => void;
}) {
  const today = todayISO();
  const [month, setMonth] = useFinancialMonth();
  const [tab, setTab] = useState(initialTab === "contas" ? "formas" : initialTab);
  const [selectedDay, setSelectedDay] = useState(today);
  const day = monthKey(selectedDay) === month ? selectedDay : `${month}-01`;
  const { start, end } = monthRange(month);
  const needsCash = tab !== "exportar" && tab !== "faturamento" && tab !== "referencia";
  const needsCompetence = ["formas", "dre"].includes(tab);
  const cashQuery = useQuery({ ...analysisRowsQuery(tab, month, today, day), enabled: needsCash });
  const compQuery = useQuery({ ...txnsByCompetenceQuery(start, end), enabled: needsCompetence });
  const historyStart = addMonths(start, -5);
  const historyQuery = useQuery({
    ...txnsByCompetenceQuery(historyStart, end),
    enabled: tab === "faturamento",
  });
  const categoryQuery = useQuery({ ...categoriesQuery(), enabled: tab === "dre" });
  const cash = useMemo(() => cashQuery.data ?? [], [cashQuery.data]);
  const comp = useMemo(
    () =>
      tab === "faturamento"
        ? (historyQuery.data ?? []).filter((t) => monthKey(t.competence_date) === month)
        : (compQuery.data ?? []),
    [tab, month, historyQuery.data, compQuery.data],
  );
  const m = useMemo(
    () => dashboardMonth(["formas", "dre"].includes(tab) ? cash : [], month, today),
    [cash, month, today, tab],
  );
  const daily = useMemo(() => dashboardDay(tab === "diario" ? cash : [], day), [cash, day, tab]);
  const s = summarize(comp);
  const pending = cash.filter((t) => t.status === "pendente");
  const upcoming = pending
    .filter((t) => t.due_date >= today && t.due_date <= addDays(today, 7))
    .sort((a, b) => a.due_date.localeCompare(b.due_date) || a.id.localeCompare(b.id))
    .slice(0, 8);
  const indicators = useMemo(
    () => dashboardIndicators(tab === "formas" ? cash : [], comp, month, today),
    [cash, comp, month, today, tab],
  );
  const costs = useMemo(
    () => dashboardCosts(tab === "dre" ? comp : [], categoryQuery.data ?? []),
    [comp, categoryQuery.data, tab],
  );
  const pct = (value: number | null) => (value === null ? "sem base" : formatPct(value));
  const billing = monthBilling(comp, month);
  const defaulted = useMemo(
    () => defaultedReceivables(tab === "formas" ? cash : [], month, false, today),
    [cash, month, today, tab],
  );
  const liquid = useMemo(
    () => cashPixMonth(tab === "formas" ? cash : [], month, today),
    [cash, month, today, tab],
  );
  const historyMonths = nextMonths(monthKey(historyStart), 6);
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
  const openTab = (value: string) => {
    setTab(value);
    onSelect?.(value);
  };

  return (
    <div id="financial-details" className="mt-5 space-y-6">
      <section aria-labelledby="details-title" className="scroll-mt-6 space-y-4">
        <div>
          <h2 id="details-title" className="text-xl">
            Aprofundar a análise
          </h2>
          <p className="text-sm text-muted-foreground">
            Detalhes de {formatMonth(month, true)} por assunto.
          </p>
        </div>
        <Tabs value={tab} onValueChange={openTab}>
          <div className="overflow-x-auto pb-1">
            <TabsList
              aria-label="Análises detalhadas"
              className="h-auto w-max min-w-full justify-start"
            >
              <TabsTrigger value="evolucao">Crescimento</TabsTrigger>
              <TabsTrigger value="previsao90">Caixa 90 dias</TabsTrigger>
              <TabsTrigger value="faturamento">Faturamento</TabsTrigger>
              <TabsTrigger value="formas">Recebimentos e contas</TabsTrigger>
              <TabsTrigger value="referencia">DRE por referência</TabsTrigger>
              <TabsTrigger value="dre">DRE e custos</TabsTrigger>
              <TabsTrigger value="diario">Fechamento diário</TabsTrigger>
              <TabsTrigger value="exportar">Exportar</TabsTrigger>
            </TabsList>
          </div>
          <QueryFeedback
            loading={
              (needsCash && cashQuery.isPending) ||
              (needsCompetence && compQuery.isPending) ||
              (tab === "faturamento" && historyQuery.isPending)
            }
            error={
              (needsCash && cashQuery.isError) ||
              (needsCompetence && compQuery.isError) ||
              (tab === "faturamento" && historyQuery.isError)
            }
            retry={() => {
              if (needsCash) void cashQuery.refetch();
              if (needsCompetence) void compQuery.refetch();
              if (tab === "faturamento") void historyQuery.refetch();
            }}
          >
            <Suspense
              fallback={
                <p role="status" className="surface-card p-6 text-sm">
                  Carregando análise…
                </p>
              }
            >
              <TabsContent value="referencia">
                <ClinicDre month={month} />
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
              <TabsContent value="formas" className="space-y-4">
                <DefaultPanel
                  month={month}
                  data={defaulted}
                  monthRate={indicators.defaultPct}
                  monthBase={indicators.dueAmount}
                />

                <section className="surface-card overflow-hidden" aria-labelledby="methods-title">
                  <div className="p-5 sm:p-6">
                    <h2 id="methods-title" className="text-base font-semibold">
                      Recebimentos por forma de pagamento · caixa
                    </h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      O que cai no mês pela data de recebimento (o faturamento por competência está
                      na aba “Faturamento”). Valores líquidos. Cartões já descontam as taxas;
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

                <div className="surface-card flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h2 className="text-base">Simulação de pagamento das contas</h2>
                    <p className="text-sm text-muted-foreground">
                      Abaixo, o que entrou à vista em {formatMonth(month, true)} comparado às contas
                      do mês. Para projetar com saldo inicial e aportes, use a simulação.
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
                    categoryQuery.isPending ? "loading" : categoryQuery.isError ? "error" : "ready"
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
                      Caixa: o que foi recebido e pago. Competência: receitas e despesas atribuídas
                      ao mês, mesmo sem pagamento.
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
                    investimentos e retiradas do resultado operacional; o saldo inicial da simulação
                    não entra nesta DRE.
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
                    <span className="tabular font-semibold">{formatBRL(s.totalExpenses)}</span>
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
                <section className="surface-card overflow-hidden" aria-labelledby="daily-title">
                  <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-end sm:justify-between">
                    <div>
                      <h2 id="daily-title" className="text-base font-semibold">
                        Fechamento diário — conferência
                      </h2>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Confira os lançamentos pagos com o extrato, os comprovantes e o dinheiro do
                        dia.
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
                        {daily.missingPaidDates} lançamento(s) pago(s), em todo o cadastro, não têm
                        data de pagamento e não entram na conferência diária.
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
              <TabsContent value="exportar">
                <FinancialReports />
              </TabsContent>
            </Suspense>
          </QueryFeedback>
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
            <strong className="text-foreground">Recebimentos (caixa)</strong>: o que foi considerado
            recebido no mês, pela data do recebimento. Inclui baixas automáticas por vencimento, que
            não comprovam o depósito no banco.
          </li>
          <li>
            <strong className="text-foreground">Resultado de caixa</strong>: recebimentos menos
            despesas pagas no mês. Não é o saldo bancário — o saldo das contas fica na Tesouraria.
          </li>
          <li>
            <strong className="text-foreground">Margem de caixa</strong>: resultado de caixa
            dividido pelos recebimentos do mês. Quando não há recebimentos, aparece “Sem base para
            cálculo”.
          </li>
          <li>
            Aportes, transferências e financiamentos não são faturamento nem lucro operacional.
          </li>
        </ul>
      </details>
    </div>
  );
}
