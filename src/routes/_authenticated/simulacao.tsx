import { useFinancialMonth } from "@/hooks/use-financial-month";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { pageHead } from "@/lib/head";
import {
  dashboardFunding,
  dashboardMonth,
  formatBRL,
  formatMonth,
  todayISO,
} from "@/lib/finance";
import { txnsByDueQuery } from "@/lib/queries";
import { MonthPicker, PageHeader } from "@/components/finance/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/_authenticated/simulacao")({
  head: () => pageHead("Simulação", "Projeção de caixa e aporte para o fechamento do mês."),
  component: Simulacao,
});

function Simulacao() {
  const today = todayISO();
  const [month, setMonth] = useFinancialMonth();
  const [openings, setOpenings] = useState<Record<string, string>>({});
  const cashQuery = useQuery(txnsByDueQuery());
  const m = dashboardMonth(cashQuery.data ?? [], month, today);
  const opening = openings[month] ?? "";
  const openingValue = Number(opening.replace(/\./g, "").replace(",", "."));
  const openingValid =
    opening.trim() !== "" &&
    /^-?(?:\d{1,3}(?:\.\d{3})+|\d+)(?:,\d{1,2})?$/.test(opening.trim()) &&
    Number.isFinite(openingValue);
  const funding = openingValid ? dashboardFunding(m.projected, openingValue) : null;

  return (
    <div>
      <PageHeader
        title="Simulação"
        subtitle="Veja se o saldo previsto cobre as contas cadastradas do mês"
        actions={<MonthPicker value={month} onChange={setMonth} />}
      />
      {cashQuery.isPending ? (
        <div className="surface-card p-8 text-sm text-muted-foreground" role="status">
          Carregando simulação…
        </div>
      ) : cashQuery.isError ? (
        <div className="surface-card p-6" role="alert">
          <p>Não foi possível carregar a simulação.</p>
          <Button className="mt-3" variant="outline" onClick={() => void cashQuery.refetch()}>
            Tentar novamente
          </Button>
        </div>
      ) : (
        <section className="surface-card mt-4 p-5 sm:p-6" aria-labelledby="closing-title">
          <div className="grid gap-6 lg:grid-cols-2">
            <div>
              <h2 id="closing-title" className="text-lg font-semibold">
                Vai dar para pagar as contas?
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Simule o fechamento de {formatMonth(month, true)} com o saldo que havia no início do
                mês.
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
            Projeção baseada apenas nos lançamentos cadastrados e no status atual. Não garante saldo
            em cada dia: contas podem vencer antes dos recebimentos. Recebíveis atrasados do mês (
            {formatBRL(m.overdueReceivable)}) e anteriores ({formatBRL(m.priorToReceive)}) ficam
            fora da previsão até serem pagos.
          </p>
          {m.missingPaidDates > 0 && (
            <p className="mt-2 text-xs text-warning">
              {m.missingPaidDates} lançamento(s) pago(s) sem data de pagamento: o vencimento foi
              usado como referência.
            </p>
          )}
        </section>
      )}
    </div>
  );
}
