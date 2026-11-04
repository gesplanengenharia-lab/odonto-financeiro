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
  dashboardFunding,
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
} from "@/lib/finance";
import { txnsByCompetenceQuery, txnsByDueQuery } from "@/lib/queries";
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
  const [openings, setOpenings] = useState<Record<string, string>>({});
  const { start, end } = monthRange(month);
  // All dates are required: an old installment may have been settled this month.
  const cashQuery = useQuery(txnsByDueQuery());
  const compQuery = useQuery(txnsByCompetenceQuery(start, end));
  const cash = useMemo(() => cashQuery.data ?? [], [cashQuery.data]);
  const comp = compQuery.data ?? [];
  const m = useMemo(() => dashboardMonth(cash, month, today), [cash, month, today]);
  const s = summarize(comp);
  const pending = cash.filter((t) => t.status === "pendente");
  const defaulted = pending.filter((t) => isDefaulted(t, today));
  const defaultedTotal = summarize(defaulted).grossRevenue;
  const upcoming = pending
    .filter((t) => t.due_date >= today && t.due_date <= addDays(today, 7))
    .slice(0, 8);
  const opening = openings[month] ?? "";
  const openingValue = Number(opening.replace(/\./g, "").replace(",", "."));
  const openingValid =
    opening.trim() !== "" &&
    /^-?(?:\d{1,3}(?:\.\d{3})+|\d+)(?:,\d{1,2})?$/.test(opening.trim()) &&
    Number.isFinite(openingValue);
  const funding = openingValid ? dashboardFunding(m.projected, openingValue) : null;
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
        subtitle="O que entrou, o que falta receber e como o mês deve fechar"
        actions={
          <>
            <MonthPicker value={month} onChange={setMonth} />
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

          <section className="surface-card mt-4 p-5 sm:p-6" aria-labelledby="closing-title">
            <div className="grid gap-6 lg:grid-cols-2">
              <div>
                <h2 id="closing-title" className="text-lg font-semibold">
                  Vai dar para pagar as contas?
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Simule o fechamento de {formatMonth(month, true)} com o saldo que havia no início
                  do mês.
                </p>
                <div className="mt-4 max-w-sm">
                  <Label htmlFor="opening-balance">Saldo inicial do mês (R$)</Label>
                  <Input
                    id="opening-balance"
                    className="mt-2"
                    inputMode="decimal"
                    placeholder="Ex.: 15.000,00"
                    value={opening}
                    aria-invalid={opening !== "" && !openingValid}
                    aria-describedby="opening-help"
                    onChange={(e) => setOpenings((prev) => ({ ...prev, [month]: e.target.value }))}
                  />
                  <p id="opening-help" className="mt-2 text-xs text-muted-foreground">
                    Some banco e dinheiro disponíveis no primeiro dia. Simulação por mês, mantida
                    apenas enquanto esta tela estiver aberta; não cria lançamento.
                  </p>
                  {opening !== "" && !openingValid && (
                    <p className="mt-1 text-xs text-expense">Use um valor como 1.500,00 ou 0,00.</p>
                  )}
                </div>
              </div>
              <div
                className={`rounded-xl p-5 ${funding && funding.closing < 0 ? "bg-expense-soft" : "bg-muted/50"}`}
                aria-live="polite"
              >
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {funding
                    ? "Saldo projetado no fechamento"
                    : "Informe o saldo inicial para calcular o aporte"}
                </p>
                <p
                  className={`tabular mt-2 font-display text-3xl font-semibold ${funding && funding.closing < 0 ? "text-expense" : "text-income"}`}
                >
                  {funding ? formatBRL(funding.closing) : "—"}
                </p>
                <p className="mt-2 text-sm font-medium">
                  {funding
                    ? funding.contribution > 0
                      ? `Aporte estimado para fechar o mês: ${formatBRL(funding.contribution)}`
                      : "O saldo previsto cobre as contas cadastradas no fechamento."
                    : `Sem saldo inicial, o movimento previsto é ${formatBRL(m.projected)}.`}
                </p>
                <dl className="mt-4 space-y-2 text-sm">
                  <div className="flex justify-between gap-3">
                    <dt>Entradas já recebidas + a vencer</dt>
                    <dd className="tabular">{formatBRL(m.totalExpected)}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt>Pagamentos feitos + contas em aberto</dt>
                    <dd className="tabular">− {formatBRL(m.totalOut)}</dd>
                  </div>
                  <div className="flex justify-between gap-3 text-muted-foreground">
                    <dt>Inclui contas anteriores em aberto</dt>
                    <dd className="tabular">{formatBRL(m.priorToPay)}</dd>
                  </div>
                </dl>
              </div>
            </div>
            <p className="mt-4 border-t border-border pt-3 text-xs text-muted-foreground">
              Projeção baseada apenas nos lançamentos cadastrados e no status atual. Não garante
              saldo em cada dia: contas podem vencer antes dos recebimentos. Recebíveis atrasados do
              mês ({formatBRL(m.overdueReceivable)}) e anteriores ({formatBRL(m.priorToReceive)})
              ficam fora da previsão até serem pagos.
            </p>
            {m.missingPaidDates > 0 && (
              <p className="mt-2 text-xs text-warning">
                {m.missingPaidDates} lançamento(s) pago(s) sem data de pagamento: o vencimento foi
                usado como referência.
              </p>
            )}
          </section>

          <section className="surface-card mt-4 overflow-hidden" aria-labelledby="methods-title">
            <div className="p-5 sm:p-6">
              <h2 id="methods-title" className="text-base font-semibold">
                Entradas por forma de pagamento
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Valores líquidos. Cartões já descontam as taxas; parcelas aparecem no respectivo mês
                de recebimento.
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
        </>
      )}
    </div>
  );
}
