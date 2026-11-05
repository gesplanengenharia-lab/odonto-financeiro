import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, Trash2, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatDate, isDefaulted, PAYMENT_LABELS, type Txn } from "@/lib/finance";
import { canUse } from "@/lib/access";
import { categoriesQuery, myAccessQuery, useTxnMutations } from "@/lib/queries";
import { KindBadge, Money, StatusBadge } from "./ui";

export function TxnTable({ rows, showFee = false, dateField = "due_date" }: { rows: Txn[]; showFee?: boolean; dateField?: "due_date" | "competence_date" }) {
  const { data: categories = [] } = useQuery(categoriesQuery());
  const catName = (id: string | null) => categories.find((c) => c.id === id)?.name ?? "—";
  const { data: access } = useQuery(myAccessQuery());
  const { setPaid, remove } = useTxnMutations();

  async function toggle(t: Txn) {
    try {
      await setPaid.mutateAsync({ ids: [t.id], paid: t.status !== "pago" });
      toast.success(t.kind === "entrada" && t.payment_method === "boleto" && t.status === "pago"
        ? isDefaulted({ ...t, status: "pendente" })
          ? "Marcado como inadimplente. Consulte a aba Inadimplentes."
          : "Marcado como pendente; aparecerá em Inadimplentes após o vencimento."
        : t.status === "pago" ? "Marcado como pendente" : "Baixa registrada");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    }
  }

  async function del(t: Txn) {
    const all = t.group_id && t.installment_total > 1 ? confirm("Excluir todas as parcelas deste lançamento? (Cancelar = só esta)") : false;
    if (!all && !confirm("Excluir este lançamento?")) return;
    try {
      await remove.mutateAsync({ id: t.id, groupId: all ? t.group_id : null });
      toast.success("Excluído");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    }
  }

  return (
    <div className="surface-card overflow-x-auto">
      <table className="w-full min-w-[820px] text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
            <th className="px-4 py-3 font-medium">{dateField === "due_date" ? "Vencimento" : "Data"}</th>
            <th className="px-4 py-3 font-medium">Descrição</th>
            <th className="px-4 py-3 font-medium">Categoria</th>
            <th className="px-4 py-3 font-medium">Forma</th>
            <th className="px-4 py-3 font-medium">Status</th>
            {showFee && <th className="px-4 py-3 text-right font-medium">Taxa</th>}
            <th className="px-4 py-3 text-right font-medium">Valor</th>
            <th className="px-2 py-3" />
          </tr>
        </thead>
        <tbody>
          {rows.map((t) => (
            <tr key={t.id} className="border-b border-border/60 last:border-0 hover:bg-muted/50">
              <td className="tabular whitespace-nowrap px-4 py-3">{formatDate(t[dateField])}</td>
              <td className="px-4 py-3">
                <div className="flex items-center gap-2">
                  <KindBadge kind={t.kind} />
                  <span className="font-medium">{t.description}</span>
                  {t.installment_total > 1 && (
                    <span className="tabular text-xs text-muted-foreground">
                      {t.installment_number}/{t.installment_total}
                    </span>
                  )}
                </div>
                {t.person && <div className="mt-0.5 text-xs text-muted-foreground">{t.person}</div>}
              </td>
              <td className="px-4 py-3 text-muted-foreground">
                {catName(t.category_id)}
                {t.nature && <span className="ml-1 text-xs">({t.nature === "fixa" ? "fixa" : "variável"})</span>}
              </td>
              <td className="px-4 py-3 text-muted-foreground">{PAYMENT_LABELS[t.payment_method]}</td>
              <td className="px-4 py-3">
                <StatusBadge t={t} />
              </td>
              {showFee && (
                <td className="tabular px-4 py-3 text-right text-muted-foreground">
                  {t.fee_amount > 0 ? `− ${t.fee_amount.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : "—"}
                </td>
              )}
              <td className="px-4 py-3 text-right">
                <Money value={t.kind === "entrada" ? t.net_amount : t.gross_amount} kind={t.kind} />
              </td>
              <td className="whitespace-nowrap px-2 py-3 text-right">
                {canUse(access, "baixar") && <Button
                  variant="ghost"
                  size={t.kind === "entrada" && t.payment_method === "boleto" && t.status === "pago" ? "sm" : "icon"}
                  aria-label={t.kind === "entrada" && t.payment_method === "boleto" && t.status === "pago" ? "Marcar boleto como não recebido" : t.status === "pago" ? "Desfazer baixa" : "Dar baixa"}
                  title={t.status === "pago" ? "Desfazer baixa" : "Dar baixa (pago/recebido)"}
                  disabled={setPaid.isPending}
                  onClick={() => toggle(t)}
                >
                  {t.status === "pago" ? <Undo2 /> : <Check className="text-income" />}
                  {t.kind === "entrada" && t.payment_method === "boleto" && t.status === "pago" && "Não recebido"}
                </Button>}
                {canUse(access, "excluir") && <Button variant="ghost" size="icon" aria-label="Excluir" title="Excluir" onClick={() => del(t)}>
                  <Trash2 className="text-muted-foreground" />
                </Button>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

