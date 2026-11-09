import { GrowthPanel } from "@/components/finance/GrowthPanel";
import { Forecast90Panel } from "@/components/finance/Forecast90Panel";
import { useFinancialMonth } from "@/hooks/use-financial-month";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Calculator,
  RefreshCw,
  ArrowUpRight,
  BarChart3,
  Receipt,
  CalendarCheck,
} from "lucide-react";
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
import {
  AlertsPanel,
  CompositionPanel,
  CostsPanel,
  DefaultPanel,
  KpiStrip,
} from "@/components/finance/PainelResumo";
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
  const { start, end } = monthRange(month);
  const cashQuery = useQuery(txnsByDueQuery());
  const compQuery = useQuery(txnsByCompetenceQuery(start, end));
  const cash = cashQuery.data ?? [];
  const comp = compQuery.data ?? [];
  const m = dashboardMonth(cash, month, today);
  const billing = monthBilling(comp, month);
  const composition = receiptComposition(cash, month);
  const margin = cashMargin(m.realized, m.received);
  const comparison = managementComparison(cash, month, today);
  const defaulted = defaultedReceivables(cash, month, false, today);
  const alerts = dashboardAlerts(cash, today);
  const periodNote =
    month === currentMonth
      ? "Mês atual · valores realizados até hoje"
      : month < currentMonth
        ? "Mês encerrado"
        : "Mês futuro · apenas previsões";
  return (
    <div className="executive-dashboard space-y-6">
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
            className="grid divide-y divide-border rounded-xl border border-border bg-card px-2 py-2 sm:grid-cols-3 sm:divide-x sm:divide-y-0"
          >
            <Link
              to="/contas"
              search={{ kind: "entrada", month }}
              className="rounded-lg px-3 py-2 hover:bg-muted"
            >
              <p className="text-sm text-muted-foreground">A receber no mês</p>
              <p className="tabular mt-1 text-xl font-semibold">
                {formatBRL(m.toReceive + m.overdueReceivable)}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">Inclui vencidos deste mês</p>
            </Link>
            <Link
              to="/contas"
              search={{ kind: "saida", month }}
              className="rounded-lg px-3 py-2 hover:bg-muted"
            >
              <p className="text-sm text-muted-foreground">A pagar no mês</p>
              <p className="tabular mt-1 text-xl font-semibold">{formatBRL(m.toPay)}</p>
              <p className="mt-1 text-xs text-muted-foreground">Contas ainda em aberto</p>
            </Link>
            <Link
              to="/contas"
              search={{ kind: "entrada", period: "atrasados", channel: "pacientes" }}
              className="rounded-lg px-3 py-2 hover:bg-muted"
            >
              <p className="text-sm text-muted-foreground">Pacientes em atraso</p>
              <p className="tabular mt-1 text-xl font-semibold">{formatBRL(defaulted.total)}</p>
              <p className="mt-1 text-xs text-muted-foreground">Todos os meses · até ontem</p>
            </Link>
          </section>
          <div className="grid items-start gap-5 xl:grid-cols-[1.5fr_1fr]">
            <CompositionPanel month={month} data={composition} />
            <AlertsPanel alerts={alerts} />
          </div>
          <div className="flex flex-wrap gap-3 border-t border-border pt-4">
            <Button asChild variant="outline">
              <Link to="/relatorios" search={{ view: "evolucao" }}>
                Abrir gestão · crescimento, resultado e previsão
              </Link>
            </Button>
            <Button asChild variant="ghost">
              <Link to="/relatorios" search={{ view: "diario" }}>
                Fechamento diário
              </Link>
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
