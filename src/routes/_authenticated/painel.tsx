import { useFinancialMonth } from "@/hooks/use-financial-month";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { pageHead } from "@/lib/head";
import { formatBRL, formatDate, formatMonth, monthKey, todayISO } from "@/lib/finance";
import { overviewQuery } from "@/lib/performance-queries";
import { AlertsPanel, CompositionPanel, KpiStrip } from "@/components/finance/PainelResumo";
import { MonthPicker, PeriodTag } from "@/components/finance/ui";
import { Button } from "@/components/ui/button";
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
  const query = useQuery(overviewQuery(month));
  const snapshot = query.data;
  const m = snapshot?.cash;
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

      {query.isPending ? (
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
      ) : query.isError || !snapshot || !m ? (
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
              void query.refetch();
            }}
          >
            <RefreshCw className="h-4 w-4" /> Tentar novamente
          </Button>
        </div>
      ) : (
        <>
          <KpiStrip
            month={month}
            billing={snapshot.billing}
            cash={m}
            composition={snapshot.composition}
            margin={snapshot.margin}
            comparison={snapshot.comparison}
          />

          {!snapshot.comparison.future && (
            <p className="text-xs text-muted-foreground" aria-label="Período da comparação">
              Comparação: {formatDate(snapshot.comparison.start)} a{" "}
              {formatDate(snapshot.comparison.end)} contra{" "}
              {formatDate(snapshot.comparison.previousStart)} a{" "}
              {formatDate(snapshot.comparison.previousEnd)}
              {snapshot.comparison.partial
                ? " · mesmos dias do mês anterior, limitado ao último dia existente."
                : " · meses completos."}
            </p>
          )}

          {snapshot.noExpenses && (
            <p
              role="status"
              className="rounded-lg border border-warning/30 bg-warning/5 px-4 py-3 text-sm"
            >
              Nenhuma despesa por competência foi registrada neste mês. Confira os lançamentos antes
              de interpretar a margem como desempenho da clínica.
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
              <p className="tabular mt-1 text-xl font-semibold">
                {formatBRL(snapshot.overduePatients)}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">Todos os meses · até ontem</p>
            </Link>
          </section>
          <div className="grid items-start gap-5 xl:grid-cols-[1.5fr_1fr]">
            <CompositionPanel month={month} data={snapshot.composition} />
            <AlertsPanel alerts={snapshot.alerts} />
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
