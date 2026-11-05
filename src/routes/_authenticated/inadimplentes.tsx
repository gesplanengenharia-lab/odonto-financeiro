import { useFinancialMonth } from "@/hooks/use-financial-month";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { canUse } from "@/lib/access";
import { myAccessQuery } from "@/lib/queries";
import { pageHead } from "@/lib/head";
import { daysLate, defaultedReceivables, formatBRL, formatDate, formatMonth, PAYMENT_LABELS, todayISO, type Txn } from "@/lib/finance";
import { pendingQuery, useTxnMutations } from "@/lib/queries";
import { EmptyState, MonthPicker, PageHeader, StatCard } from "@/components/finance/ui";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/inadimplentes")({
  head: () => pageHead("Inadimplentes", "Pacientes com boletos e parcelas vencidas."),
  component: Inadimplentes,
});

function Inadimplentes() {
  const today = todayISO();
  const [month, setMonth] = useFinancialMonth();
  const [onlyMonth, setOnlyMonth] = useState(false);
  const { data = [], isLoading, isError, refetch } = useQuery(pendingQuery());
  const { setPaid } = useTxnMutations();
  const { data: access } = useQuery(myAccessQuery());
  const { groups, total, monthTotal, over30 } = useMemo(
    () => defaultedReceivables(data, month, onlyMonth, today), [data, month, onlyMonth, today],
  );

  async function pay(t: Txn) {
    try {
      await setPaid.mutateAsync({ ids: [t.id], paid: true });
      toast.success("Pagamento registrado");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    }
  }

  return (
    <div>
      <PageHeader title="Inadimplentes" subtitle="Boletos, Pix e parcelas de pacientes vencidos e não pagos"
        actions={<><MonthPicker value={month} onChange={setMonth} /><Button variant="outline" aria-pressed={onlyMonth} onClick={() => setOnlyMonth(!onlyMonth)}>{onlyMonth ? "Mostrar todos os meses" : "Somente mês selecionado"}</Button></>} />
      <p className="mb-4 text-sm text-muted-foreground">Ao desfazer a baixa de uma cobrança vencida, ela aparece aqui automaticamente com o paciente e o valor. O mês considera o vencimento, não a data da venda.</p>
      {isLoading ? <p role="status">Carregando…</p> : isError ? <div className="surface-card p-6"><p role="alert">Não foi possível carregar os inadimplentes.</p><Button className="mt-3" variant="outline" onClick={() => void refetch()}>Tentar novamente</Button></div> : <>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total em atraso — todos os meses" value={total} tone="expense" />
        <StatCard label={`Inadimplência em ${formatMonth(month)}`} value={monthTotal} tone="expense" hint="Vencidas nesse mês e ainda não recebidas" />
        <StatCard label="Atraso acima de 30 dias" value={over30} tone="warning" hint={onlyMonth ? "No mês selecionado" : "Todos os meses"} />
        <StatCard label={onlyMonth ? "Pacientes do mês" : "Pacientes — todos os meses"} value={groups.length} raw={String(groups.length)} tone="primary" />
      </div>

      <h2 className="mt-6 text-lg font-semibold">{onlyMonth ? `Pacientes com vencimentos em ${formatMonth(month, true)}` : "Pacientes com valores em atraso — todos os meses"}</h2>
      <div className="mt-3 grid gap-4">
        {groups.length === 0 ? (
          <EmptyState title="Nenhum paciente inadimplente">{onlyMonth ? "Nenhuma cobrança vencida e pendente no mês selecionado." : "Todas as cobranças vencidas estão em dia."}</EmptyState>
        ) : (
          groups.map((g) => (
            <div key={g.person} className="surface-card p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="text-base font-semibold">{g.person}</h2>
                  <p className="text-xs text-muted-foreground">
                    {g.rows.length} parcela(s) · maior atraso {g.maxDays} dia(s)
                  </p>
                </div>
                <span className="tabular font-display text-lg font-semibold text-expense">{formatBRL(g.total)}</span>
              </div>
              <ul className="mt-3 divide-y divide-border text-sm">
                {g.rows.map((t) => (
                  <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <span>
                      {t.description}
                      {t.installment_total > 1 && <span className="text-muted-foreground"> · {t.installment_number}/{t.installment_total}</span>}
                      <span className="text-muted-foreground"> · {PAYMENT_LABELS[t.payment_method]}</span>
                    </span>
                    <span className="flex items-center gap-3">
                      <span className="tabular text-xs text-muted-foreground">
                        venceu {formatDate(t.due_date)} ({daysLate(t.due_date)}d)
                      </span>
                      <span className="tabular font-semibold">{formatBRL(t.gross_amount)}</span>
                      <Button size="sm" variant="outline" disabled={!canUse(access, "baixar")} onClick={() => pay(t)}>
                        Recebido
                      </Button>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))
        )}
      </div>
      </>}
    </div>
  );
}

