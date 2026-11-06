import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import {
  AlertCircle,
  AlertTriangle,
  ArrowDownRight,
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  CircleHelp,
  CreditCard,
  Receipt,
  TrendingDown,
  TrendingUp,
  Wallet,
} from "lucide-react";
import {
  dashboardAlerts,
  dashboardCosts,
  dashboardMonth,
  defaultedReceivables,
  formatBRL,
  formatMonth,
  futureReceivables,
  monthBilling,
  receiptComposition,
  summarize,
  type DashboardAlert,
} from "@/lib/finance";
import { Panel, PeriodTag, Pct } from "@/components/finance/ui";
import { cn } from "@/lib/utils";

const share = (value: number, total: number) => (total > 0 ? Math.round((value / total) * 1000) / 10 : null);

function MoreLink({ to, children }: { to: "/inadimplentes" | "/contas" | "/provisao" | "/relatorios" | "/cartoes"; children: ReactNode }) {
  return (
    <Link to={to} className="inline-flex items-center gap-0.5 text-sm font-medium text-primary hover:underline">
      {children}
      <ChevronRight className="h-4 w-4" aria-hidden="true" />
    </Link>
  );
}

/* ------------------------------------------------------------------ KPIs */

export function KpiStrip({
  month,
  billing,
  cash,
  composition,
  margin,
}: {
  month: string;
  billing: ReturnType<typeof monthBilling>;
  cash: ReturnType<typeof dashboardMonth>;
  composition: ReturnType<typeof receiptComposition>;
  margin: number | null;
}) {
  const label = formatMonth(month);
  const receivedShare = share(billing.received, billing.total);
  const profit = cash.realized >= 0;
  return (
    <section aria-label="Indicadores principais do mês" className="surface-card grid overflow-hidden sm:grid-cols-2 xl:grid-cols-4">
      <Kpi
        icon={<Receipt className="h-4 w-4" />}
        title="Faturamento"
        tag={`Competência · ${label}`}
        value={formatBRL(billing.total)}
        valueClass="text-foreground"
      >
        {billing.count === 0 ? (
          <span>Nenhuma venda registrada com competência neste mês.</span>
        ) : (
          <>
            <span>Vendas do mês, incluindo parcelas futuras.</span>
            <span className="block">
              <Pct value={receivedShare} className="font-semibold text-foreground" /> já recebido ·{" "}
              <strong className="tabular font-semibold text-foreground">{formatBRL(billing.pending)}</strong> a receber
            </span>
          </>
        )}
      </Kpi>
      <Kpi
        icon={<Wallet className="h-4 w-4" />}
        title="Recebimentos"
        tag={`Caixa · ${label}`}
        value={formatBRL(cash.received)}
        valueClass="text-income"
      >
        <span>Tudo o que entrou, pela data do recebimento.</span>
        <span className="block">
          À vista <strong className="tabular font-semibold text-foreground">{formatBRL(composition.upfront)}</strong> · demais{" "}
          <strong className="tabular font-semibold text-foreground">{formatBRL(composition.other)}</strong>
        </span>
      </Kpi>
      <Kpi
        icon={<ArrowDownRight className="h-4 w-4" />}
        title="Despesas pagas"
        tag={`Caixa · ${label}`}
        value={formatBRL(cash.paid)}
        valueClass="text-expense"
      >
        <span>Saídas pela data do pagamento.</span>
        <span className="block">
          <strong className="tabular font-semibold text-foreground">{formatBRL(cash.toPay)}</strong> ainda em aberto no mês
          {cash.priorToPay > 0 && (
            <span className="text-warning"> · +{formatBRL(cash.priorToPay)} de meses anteriores</span>
          )}
        </span>
      </Kpi>
      <div className="surface-ink m-0 flex flex-col gap-3 rounded-none p-5 sm:p-6">
        <div className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-2 text-sm font-semibold">
            {profit ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
            Resultado de caixa
          </span>
          <span className="rounded-full border border-ink-foreground/20 px-2 py-0.5 text-[11px] font-medium text-ink-muted">
            {label}
          </span>
        </div>
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-ink-muted">{profit ? "Sobra do mês" : "Falta no mês"}</p>
          <p className="tabular mt-0.5 text-[1.85rem] font-bold leading-tight tracking-tight">
            {profit ? "" : "− "}
            {formatBRL(Math.abs(cash.realized))}
          </p>
        </div>
        <p className="text-xs leading-relaxed text-ink-muted">
          Margem de caixa{" "}
          {margin === null ? (
            <span className="font-semibold text-ink-foreground">sem base para cálculo</span>
          ) : (
            <strong className="tabular text-sm text-ink-foreground">
              {margin.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%
            </strong>
          )}
          <span className="block">Recebimentos − despesas pagas; margem = resultado ÷ recebimentos. Não é saldo bancário.</span>
        </p>
      </div>
    </section>
  );
}

function Kpi({
  icon,
  title,
  tag,
  value,
  valueClass,
  children,
}: {
  icon: ReactNode;
  title: string;
  tag: string;
  value: string;
  valueClass: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 border-b border-border p-5 sm:p-6 xl:border-b-0 xl:border-r sm:[&:nth-child(odd)]:border-r xl:[&:nth-child(3)]:border-r">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <span className="text-primary">{icon}</span>
          {title}
        </span>
        <PeriodTag>{tag}</PeriodTag>
      </div>
      <p className={cn("tabular text-[1.85rem] font-bold leading-tight tracking-tight", valueClass)}>{value}</p>
      <p className="space-y-0.5 text-xs leading-relaxed text-muted-foreground">{children}</p>
    </div>
  );
}

/* ------------------------------------------------------- Composition */

export function CompositionPanel({ month, data }: { month: string; data: ReturnType<typeof receiptComposition> }) {
  const rows = data.rows.filter((r) => r.amount > 0);
  return (
    <Panel
      id="composition-title"
      title="Como o dinheiro entrou"
      tag={<PeriodTag>Caixa · {formatMonth(month, true)} · valores líquidos</PeriodTag>}
      className="lg:col-span-2"
    >
      {data.total === 0 ? (
        <p className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
          Nenhum recebimento confirmado neste mês.
        </p>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl bg-income-soft px-4 py-3">
              <p className="text-xs font-semibold text-income">À vista — dinheiro, Pix, débito e boleto à vista</p>
              <p className="tabular mt-1 text-xl font-bold text-foreground">{formatBRL(data.upfront)}</p>
              <p className="text-xs text-muted-foreground">
                <Pct value={data.upfrontPct} /> do recebido · disponível para pagar as contas
              </p>
            </div>
            <div className="rounded-xl bg-muted px-4 py-3">
              <p className="text-xs font-semibold text-muted-foreground">Parcelados e outros — crédito, boleto parcelado, cheque</p>
              <p className="tabular mt-1 text-xl font-bold text-foreground">{formatBRL(data.other)}</p>
              <p className="text-xs text-muted-foreground">
                <Pct value={data.otherPct} /> do recebido
              </p>
            </div>
          </div>
          <ul className="mt-5 space-y-3" aria-label="Recebimentos por forma de pagamento">
            {rows.map((r) => (
              <li key={r.key} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1.5 sm:grid-cols-[11rem_minmax(0,1fr)_auto]">
                <span className="flex items-center gap-2 text-sm font-medium">
                  {r.label}
                  {r.upfront && (
                    <span className="rounded bg-income-soft px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide text-income">à vista</span>
                  )}
                </span>
                <span className="order-3 col-span-2 h-2 overflow-hidden rounded-full bg-muted sm:order-none sm:col-span-1" aria-hidden="true">
                  <span className={cn("block h-full rounded-full", r.upfront ? "bg-income" : "bg-primary/70")} style={{ width: `${r.percent ?? 0}%` }} />
                </span>
                <span className="text-right text-sm">
                  <span className="tabular font-semibold">{formatBRL(r.amount)}</span>
                  <span className="ml-2 inline-block w-12 text-xs text-muted-foreground">
                    <Pct value={r.percent} />
                  </span>
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-5 border-t border-border pt-3 text-xs text-muted-foreground">
            Percentuais sobre {formatBRL(data.total)} recebidos no mês ({data.count} lançamento{data.count === 1 ? "" : "s"}). Inclui baixas
            automáticas por vencimento — a confirmação no extrato é feita na Tesouraria.
          </p>
        </>
      )}
    </Panel>
  );
}

/* ------------------------------------------------------------- Alerts */

const alertIcon: Record<DashboardAlert["id"], typeof AlertCircle> = {
  overdue_bills: AlertCircle,
  defaulted: AlertTriangle,
  cards_unconfirmed: CreditCard,
  bills_week: CalendarClock,
  missing_paid_date: CircleHelp,
};
const alertTone: Record<DashboardAlert["tone"], string> = {
  expense: "bg-expense-soft text-expense",
  warning: "bg-warning-soft text-warning",
  info: "bg-info-soft text-info",
};
const alertLabel: Record<DashboardAlert["tone"], string> = { expense: "Urgente", warning: "Atenção", info: "Agenda" };

export function AlertsPanel({ alerts }: { alerts: ReturnType<typeof dashboardAlerts> }) {
  return (
    <Panel id="alerts-title" title="Precisa de atenção" tag={<PeriodTag>Hoje · todos os meses</PeriodTag>}>
      {alerts.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 rounded-xl bg-income-soft px-4 py-8 text-center">
          <CheckCircle2 className="h-6 w-6 text-income" aria-hidden="true" />
          <p className="text-sm font-semibold text-foreground">Nada pendente de ação hoje</p>
          <p className="text-xs text-muted-foreground">Sem contas vencidas, atrasos ou repasses pendentes.</p>
        </div>
      ) : (
        <ul className="-mx-2 space-y-1">
          {alerts.map((a) => {
            const Icon = alertIcon[a.id];
            return (
              <li key={a.id}>
                <Link to={a.to} className="flex items-start gap-3 rounded-lg px-2 py-2.5 transition-colors hover:bg-muted">
                  <span className={cn("mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg", alertTone[a.tone])}>
                    <Icon className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium leading-snug text-foreground">{a.title}</span>
                    <span className="text-xs text-muted-foreground">
                      <span className="font-semibold">{alertLabel[a.tone]}</span> · {a.count} lançamento{a.count === 1 ? "" : "s"}
                    </span>
                  </span>
                  {a.amount !== null && <span className="tabular shrink-0 pt-0.5 text-sm font-semibold">{formatBRL(a.amount)}</span>}
                  <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

/* ------------------------------------------------------ Future receivables */

export function FuturePanel({
  month,
  currentMonth,
  data,
}: {
  month: string;
  currentMonth: string;
  data: ReturnType<typeof futureReceivables>;
}) {
  const max = Math.max(...data.months.map((m) => m.amount), data.later, 1);
  const last = data.months[data.months.length - 1]!.month;
  return (
    <Panel
      id="future-title"
      title="Recebíveis futuros"
      tag={<PeriodTag>A partir de {formatMonth(month)} · sem atrasados</PeriodTag>}
      action={<MoreLink to="/provisao">Provisão</MoreLink>}
    >
      <p className="tabular text-2xl font-bold tracking-tight">{formatBRL(data.total)}</p>
      <p className="text-xs text-muted-foreground">ainda vão entrar, pelos vencimentos cadastrados</p>
      <ul className="mt-4 space-y-2.5">
        {data.months.map((m, i) => (
          <BarRow
            key={m.month}
            label={i === 0 && m.month === currentMonth ? `${formatMonth(m.month)} · restante` : formatMonth(m.month)}
            amount={m.amount}
            width={(m.amount / max) * 100}
          />
        ))}
        <BarRow label={`Após ${formatMonth(last)}`} amount={data.later} width={(data.later / max) * 100} muted />
      </ul>
      <p className="mt-auto border-t border-border pt-3 text-xs text-muted-foreground">
        Inclui {formatBRL(data.cardShare)} de cartões. Previsão não é dinheiro disponível.
      </p>
    </Panel>
  );
}

function BarRow({ label, amount, width, muted }: { label: string; amount: number; width: number; muted?: boolean }) {
  return (
    <li className="grid grid-cols-[6.5rem_minmax(0,1fr)_auto] items-center gap-3 text-sm">
      <span className={cn("truncate", muted && "text-muted-foreground")}>{label}</span>
      <span className="h-2 overflow-hidden rounded-full bg-muted" aria-hidden="true">
        <span className={cn("block h-full rounded-full", muted ? "bg-primary/35" : "bg-primary/70")} style={{ width: `${width}%` }} />
      </span>
      <span className="tabular text-right font-semibold">{formatBRL(amount)}</span>
    </li>
  );
}

/* ---------------------------------------------------------- Default */

export function DefaultPanel({
  month,
  data,
  monthRate,
  monthBase,
}: {
  month: string;
  data: ReturnType<typeof defaultedReceivables>;
  monthRate: number | null;
  monthBase: number;
}) {
  const parcels = data.groups.reduce((s, g) => s + g.rows.length, 0);
  return (
    <Panel
      id="default-title"
      title="Inadimplência"
      tag={<PeriodTag>Pacientes · vencidos até ontem</PeriodTag>}
      action={<MoreLink to="/inadimplentes">Ver todos</MoreLink>}
    >
      <p className={cn("tabular text-2xl font-bold tracking-tight", data.total > 0 ? "text-warning" : "text-foreground")}>
        {formatBRL(data.total)}
      </p>
      <p className="text-xs text-muted-foreground">
        {data.total > 0
          ? `em aberto · ${parcels} parcela${parcels === 1 ? "" : "s"} de ${data.groups.length} paciente${data.groups.length === 1 ? "" : "s"}, todos os meses`
          : "Nenhum paciente em atraso."}
      </p>
      <dl className="mt-4 divide-y divide-border rounded-lg border border-border text-sm">
        <div className="flex items-center justify-between gap-3 px-3 py-2">
          <dt>Venceu em {formatMonth(month)}</dt>
          <dd className="tabular font-semibold">{formatBRL(data.monthTotal)}</dd>
        </div>
        <div className="flex items-center justify-between gap-3 px-3 py-2">
          <dt>
            Taxa de {formatMonth(month)}
            <span className="block text-[11px] text-muted-foreground">sobre {formatBRL(monthBase)} vencidos no mês, exceto cartões</span>
          </dt>
          <dd className="font-semibold">
            <Pct value={monthRate} />
          </dd>
        </div>
        <div className="flex items-center justify-between gap-3 px-3 py-2">
          <dt>Há mais de 30 dias</dt>
          <dd className="tabular font-semibold">{formatBRL(data.over30)}</dd>
        </div>
      </dl>
      {data.groups.length > 0 && (
        <ul className="mt-4 space-y-2 text-sm" aria-label="Maiores atrasos">
          {data.groups.slice(0, 3).map((g) => (
            <li key={g.person} className="flex items-center justify-between gap-3">
              <span className="min-w-0 truncate">
                {g.person}
                <span className="ml-1.5 text-xs text-muted-foreground">{g.maxDays} dias</span>
              </span>
              <span className="tabular shrink-0 font-semibold">{formatBRL(g.total)}</span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

/* ------------------------------------------------------------ Costs */

export function CostsPanel({
  month,
  summary,
  costs,
  categoriesState,
  onRetry,
  onOpenDre,
}: {
  month: string;
  summary: ReturnType<typeof summarize>;
  costs: ReturnType<typeof dashboardCosts>;
  categoriesState: "loading" | "error" | "ready";
  onRetry: () => void;
  onOpenDre: () => void;
}) {
  const segments = costs.filter((g) => g.amount > 0);
  const top = costs.flatMap((g) => g.rows.map((r) => ({ ...r, nature: g.nature }))).sort((a, b) => b.amount - a.amount).slice(0, 4);
  const color = (nature: string | null) => (nature === "fixa" ? "bg-primary" : nature === "variavel" ? "bg-chart-4" : "bg-muted-foreground/50");
  return (
    <Panel
      id="costs-title"
      title="Custos fixos e variáveis"
      tag={<PeriodTag>Competência · {formatMonth(month)} · pagos e em aberto</PeriodTag>}
      action={
        <button type="button" onClick={onOpenDre} className="inline-flex items-center gap-0.5 text-sm font-medium text-primary hover:underline">
          DRE <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </button>
      }
    >
      <p className="tabular text-2xl font-bold tracking-tight text-expense">{formatBRL(summary.totalExpenses)}</p>
      <p className="text-xs text-muted-foreground">em despesas atribuídas ao mês</p>
      {summary.totalExpenses === 0 ? (
        <p className="mt-4 rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
          Nenhuma despesa com competência neste mês.
        </p>
      ) : (
        <>
          <div className="mt-4 flex h-2.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
            {segments.map((g) => (
              <span key={g.label} className={cn("h-full", color(g.nature))} style={{ width: `${g.percent ?? 0}%` }} />
            ))}
          </div>
          <ul className="mt-3 space-y-1.5 text-sm">
            {costs
              .filter((g) => g.nature !== null || g.amount > 0)
              .map((g) => (
                <li key={g.label} className="flex items-center justify-between gap-3">
                  <span className="flex items-center gap-2">
                    <span className={cn("h-2.5 w-2.5 rounded-sm", color(g.nature))} aria-hidden="true" />
                    {g.label}
                  </span>
                  <span className="text-right">
                    <span className="tabular font-semibold">{formatBRL(g.amount)}</span>
                    <span className="ml-2 inline-block w-12 text-xs text-muted-foreground">
                      <Pct value={g.percent} />
                    </span>
                  </span>
                </li>
              ))}
          </ul>
          <div className="mt-4 border-t border-border pt-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Maiores categorias</p>
            {categoriesState === "loading" ? (
              <p className="text-sm text-muted-foreground" role="status">Carregando categorias…</p>
            ) : categoriesState === "error" ? (
              <p className="text-sm text-expense" role="alert">
                Não foi possível carregar as categorias.{" "}
                <button type="button" className="underline" onClick={onRetry}>
                  Tentar novamente
                </button>
              </p>
            ) : (
              <ul className="space-y-1.5 text-sm">
                {top.map((r) => (
                  <li key={`${r.nature}-${r.id}`} className="flex items-center justify-between gap-3">
                    <span className="min-w-0 truncate">{r.name}</span>
                    <span className="tabular shrink-0 font-semibold">{formatBRL(r.amount)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <p className="mt-3 text-xs text-muted-foreground">Percentuais sobre o total de despesas do mês.</p>
        </>
      )}
    </Panel>
  );
}

