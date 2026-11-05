import { Link } from "@tanstack/react-router";
import {
  cashPixMonth,
  formatBRL,
  formatDate,
  formatMonth,
  formatPct,
  monthBilling,
  PAYMENT_LABELS,
} from "@/lib/finance";
import { EmptyState, StatCard } from "@/components/finance/ui";

type Billing = ReturnType<typeof monthBilling>;
type CashPix = ReturnType<typeof cashPixMonth>;

const pct = (v: number | null) => (v === null ? "—" : formatPct(v));

export function BillingTab({
  month,
  billing,
  history,
  historyLoading,
}: {
  month: string;
  billing: Billing;
  history: { month: string; billing: Billing }[];
  historyLoading: boolean;
}) {
  const methods = billing.byMethod.filter(
    (r) => r.amount > 0 || history.some((h) => (h.billing.byMethod.find((x) => x.method === r.method)?.amount ?? 0) > 0),
  );
  return (
    <div className="mt-2 space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Total faturado" value={billing.total} tone="primary" hint="Valor bruto pela data do atendimento/venda" />
        <StatCard label="Já recebido deste faturamento" value={billing.received} tone="income" />
        <StatCard label="Ainda a receber deste faturamento" value={billing.pending} tone="warning" hint="Parcelas futuras e pendentes" />
      </div>

      <section className="surface-card overflow-hidden" aria-labelledby="billing-title">
        <div className="p-5">
          <h2 id="billing-title" className="text-base font-semibold">
            Faturamento por forma de pagamento — {formatMonth(month, true)}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            O que a clínica de fato faturou no mês, mesmo que seja recebido em parcelas depois.
          </p>
        </div>
        {billing.count === 0 ? (
          <div className="px-5 pb-5">
            <EmptyState title="Nenhuma entrada com competência neste mês" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead className="bg-muted/40 text-xs text-muted-foreground">
                <tr>
                  <th className="px-5 py-3 text-left">Forma</th>
                  <th className="px-5 py-3 text-right">Faturado</th>
                  <th className="px-5 py-3 text-right">% do total</th>
                  <th className="px-5 py-3 text-right">Já recebido</th>
                  <th className="px-5 py-3 text-right">A receber</th>
                </tr>
              </thead>
              <tbody>
                {billing.byMethod.filter((r) => r.amount > 0).map((r) => (
                  <tr key={r.method} className="border-t border-border">
                    <th scope="row" className="px-5 py-3 text-left font-medium">{PAYMENT_LABELS[r.method]}</th>
                    <td className="tabular px-5 py-3 text-right font-semibold">{formatBRL(r.amount)}</td>
                    <td className="tabular px-5 py-3 text-right text-muted-foreground">{pct(r.percent)}</td>
                    <td className="tabular px-5 py-3 text-right text-income">{formatBRL(r.received)}</td>
                    <td className="tabular px-5 py-3 text-right text-warning">{formatBRL(r.pending)}</td>
                  </tr>
                ))}
                <tr className="border-t border-border bg-muted/30 font-semibold">
                  <th scope="row" className="px-5 py-3 text-left">Total</th>
                  <td className="tabular px-5 py-3 text-right">{formatBRL(billing.total)}</td>
                  <td className="tabular px-5 py-3 text-right">100%</td>
                  <td className="tabular px-5 py-3 text-right">{formatBRL(billing.received)}</td>
                  <td className="tabular px-5 py-3 text-right">{formatBRL(billing.pending)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="surface-card overflow-hidden" aria-labelledby="billing-history-title">
        <div className="p-5">
          <h2 id="billing-history-title" className="text-base font-semibold">Faturamento mês a mês — 6 meses</h2>
          <p className="mt-1 text-sm text-muted-foreground">Valores brutos por competência, por forma de pagamento.</p>
        </div>
        {historyLoading ? (
          <p className="px-5 pb-5 text-sm text-muted-foreground" role="status">Carregando…</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="bg-muted/40 text-xs text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 text-left">Forma</th>
                  {history.map((h) => (
                    <th key={h.month} className="px-4 py-3 text-right">{formatMonth(h.month)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {methods.map((r) => (
                  <tr key={r.method} className="border-t border-border">
                    <th scope="row" className="px-4 py-3 text-left font-medium">{PAYMENT_LABELS[r.method]}</th>
                    {history.map((h) => (
                      <td key={h.month} className="tabular px-4 py-3 text-right">
                        {formatBRL(h.billing.byMethod.find((x) => x.method === r.method)?.amount ?? 0)}
                      </td>
                    ))}
                  </tr>
                ))}
                <tr className="border-t border-border bg-muted/30 font-semibold">
                  <th scope="row" className="px-4 py-3 text-left">Total faturado</th>
                  {history.map((h) => (
                    <td key={h.month} className="tabular px-4 py-3 text-right">{formatBRL(h.billing.total)}</td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

export function CashPixTab({ month, data }: { month: string; data: CashPix }) {
  const coverage = Math.min(100, data.coveragePct ?? 0);
  return (
    <div className="mt-2 space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Dinheiro recebido" value={data.dinheiro} tone="income" />
        <StatCard label="Pix recebido" value={data.pix} tone="income" />
        <StatCard
          label="Contas do mês"
          value={data.bills}
          tone="expense"
          hint={`${formatBRL(data.billsPaid)} pagas · ${formatBRL(data.billsOpen)} em aberto (inclui atrasadas)`}
        />
        <StatCard
          label={data.balance < 0 ? "Falta para pagar tudo" : "Sobra após pagar tudo"}
          value={data.balance}
          tone={data.balance >= 0 ? "income" : "expense"}
          hint={`Com o que ainda deve entrar em dinheiro/Pix (${formatBRL(data.expected)}): ${formatBRL(data.projectedBalance)}`}
        />
      </div>

      <section className="surface-card p-5" aria-labelledby="coverage-title">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="coverage-title" className="text-base font-semibold">Quanto das contas o dinheiro + Pix já cobre</h2>
          <span className="tabular font-semibold">{pct(data.coveragePct)}</span>
        </div>
        <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
          <div className={`h-full ${data.balance >= 0 ? "bg-income" : "bg-warning"}`} style={{ width: `${coverage}%` }} />
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          {formatBRL(data.received)} recebidos em dinheiro e Pix em {formatMonth(month, true)} para{" "}
          {formatBRL(data.bills)} em contas.{" "}
          <Link to="/contas" className="text-primary hover:underline">Ver contas</Link>
        </p>
      </section>

      <section className="surface-card overflow-hidden" aria-labelledby="cashpix-list-title">
        <div className="p-5">
          <h2 id="cashpix-list-title" className="text-base font-semibold">Entradas em dinheiro e Pix do mês</h2>
        </div>
        {data.entries.length === 0 ? (
          <div className="px-5 pb-5">
            <EmptyState title="Nenhuma entrada em dinheiro ou Pix neste mês" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead className="bg-muted/40 text-xs text-muted-foreground">
                <tr>
                  <th className="px-5 py-3 text-left">Data</th>
                  <th className="px-5 py-3 text-left">Descrição</th>
                  <th className="px-5 py-3 text-left">Forma</th>
                  <th className="px-5 py-3 text-right">Valor</th>
                </tr>
              </thead>
              <tbody>
                {data.entries.map((t) => (
                  <tr key={t.id} className="border-t border-border">
                    <td className="tabular px-5 py-3">{formatDate(t.paid_date || t.due_date)}</td>
                    <td className="px-5 py-3">
                      {t.description}
                      {t.person && <span className="ml-1 text-xs text-muted-foreground">· {t.person}</span>}
                    </td>
                    <td className="px-5 py-3">{PAYMENT_LABELS[t.payment_method]}</td>
                    <td className="tabular px-5 py-3 text-right text-income">{formatBRL(Number(t.net_amount))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
