import { EditTxnDialog } from "@/components/finance/EditTxnDialog";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { pageHead } from "@/lib/head";
import { daysLate, formatBRL, formatDate, isDefaulted, PAYMENT_LABELS, type Txn } from "@/lib/finance";
import { pendingQuery } from "@/lib/queries";
import { EmptyState, PageHeader, StatCard } from "@/components/finance/ui";

export const Route = createFileRoute("/_authenticated/inadimplentes")({
  head: () => pageHead("Inadimplentes", "Pacientes com boletos e parcelas vencidas."),
  component: Inadimplentes,
});

function Inadimplentes() {
  const { data = [], isLoading } = useQuery(pendingQuery());
  const late = data.filter((t) => isDefaulted(t));

  const groups = useMemo(() => {
    const map = new Map<string, Txn[]>();
    late.forEach((t) => {
      const k = t.person?.trim() || "Sem paciente informado";
      map.set(k, [...(map.get(k) ?? []), t]);
    });
    return [...map.entries()]
      .map(([person, rows]) => ({
        person,
        rows,
        total: rows.reduce((s, t) => s + t.gross_amount, 0),
        maxDays: Math.max(...rows.map((t) => daysLate(t.due_date))),
      }))
      .sort((a, b) => b.total - a.total);
  }, [late]);

  const total = late.reduce((s, t) => s + t.gross_amount, 0);
  const over30 = late.filter((t) => daysLate(t.due_date) > 30).reduce((s, t) => s + t.gross_amount, 0);

  return (
    <div>
      <PageHeader title="Inadimplentes" subtitle="Boletos, Pix e parcelas de pacientes vencidos e não pagos" />
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Total em atraso" value={total} tone="expense" />
        <StatCard label="Atraso acima de 30 dias" value={over30} tone="warning" />
        <StatCard label="Pacientes" value={groups.length} raw={String(groups.length)} tone="primary" />
      </div>

      <div className="mt-6 grid gap-4">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Carregando…</p>
        ) : groups.length === 0 ? (
          <EmptyState title="Nenhum paciente inadimplente">Nenhuma exceção de não recebimento foi registrada para cobranças vencidas. Para registrar uma, edite o lançamento em Contas.</EmptyState>
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
                      <EditTxnDialog txn={t} />
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

