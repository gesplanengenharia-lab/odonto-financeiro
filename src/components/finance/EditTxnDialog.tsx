import { useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { Pencil } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { canUse } from "@/lib/access";
import { categoriesQuery, myAccessQuery, useTxnMutations } from "@/lib/queries";
import { readPayroll } from "@/lib/payroll";
import {
  PAYMENT_LABELS,
  todayISO,
  txnEditDetails,
  transactionNoteText,
  transactionNoteUpdate,
  type Txn,
  type PaymentMode,
  type PaymentMethod,
  type Nature,
} from "@/lib/finance";
import { NativeSelect } from "./LaunchDialog";

export function EditTxnDialog({ txn }: { txn: Txn }) {
  const [open, setOpen] = useState(false);
  const { data: access } = useQuery(myAccessQuery());
  if (!canUse(access, "baixar")) return null;
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Editar lançamento"
          title="Editar lançamento"
        >
          <Pencil />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Editar lançamento</DialogTitle>
        </DialogHeader>
        {open && (
          <EditForm
            txn={txn}
            detailsAllowed={!!access?.roles.includes("admin") && !readPayroll(txn)}
            onDone={() => setOpen(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
function EditForm({
  txn,
  detailsAllowed,
  onDone,
}: {
  txn: Txn;
  detailsAllowed: boolean;
  onDone: () => void;
}) {
  const { data: categories = [] } = useQuery(categoriesQuery());
  const { update } = useTxnMutations();
  const [mode, setMode] = useState<PaymentMode>(
    (txn.recorded_status ?? txn.status) === "pago"
      ? "pago"
      : txn.auto_settle
        ? "automatico"
        : "pendente",
  );
  const [paidDate, setPaidDate] = useState(txn.paid_date ?? todayISO());
  const [details, setDetails] = useState({
    description: txn.description,
    person: txn.person,
    category_id: txn.category_id,
    nature: txn.nature,
    payment_method: txn.payment_method,
    competence_date: txn.competence_date,
    due_date: txn.due_date,
    gross_amount: String(txn.gross_amount),
    fee_amount: String(txn.fee_amount),
    notes: transactionNoteText(txn.notes),
  });
  const set = <K extends keyof typeof details>(key: K, value: (typeof details)[K]) =>
    setDetails((d) => ({ ...d, [key]: value }));
  async function save(e: FormEvent) {
    e.preventDefault();
    try {
      const patch = detailsAllowed
        ? txnEditDetails(txn.kind, {
            ...details,
            notes: transactionNoteUpdate(txn.notes, details.notes),
            gross_amount: Number(details.gross_amount),
            fee_amount: Number(details.fee_amount),
          })
        : undefined;
      await update.mutateAsync({ txn, mode, paidDate, ...(patch ? { details: patch } : {}) });
      toast.success("Lançamento atualizado");
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível salvar");
    }
  }
  return (
    <form onSubmit={save} className="grid gap-4">
      <p className="text-sm text-muted-foreground">
        {txn.person ? `${txn.person} · ` : ""}
        {txn.description}
        {txn.installment_total > 1
          ? ` · Parcela ${txn.installment_number}/${txn.installment_total}`
          : ""}
        . A edição vale somente para este lançamento.
      </p>
      <div className="grid gap-1.5">
        <Label htmlFor="edit-payment-mode">Situação do pagamento</Label>
        <NativeSelect
          id="edit-payment-mode"
          value={mode}
          onChange={(e) => setMode(e.target.value as PaymentMode)}
        >
          <option value="automatico">Automático no vencimento</option>
          <option value="pendente">
            {txn.kind === "entrada"
              ? "Não recebido — manter pendente"
              : "Não pago — manter pendente"}
          </option>
          <option value="pago">
            {txn.kind === "entrada"
              ? "Recebido em outra data / confirmado"
              : "Pago em outra data / confirmado"}
          </option>
        </NativeSelect>
      </div>
      {mode === "pago" && (
        <div className="grid gap-1.5">
          <Label htmlFor="edit-paid-date">Data efetiva do pagamento</Label>
          <Input
            id="edit-paid-date"
            type="date"
            required
            max={todayISO()}
            value={paidDate}
            onChange={(e) => setPaidDate(e.target.value)}
          />
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        No modo automático, o valor entra no caixa no vencimento. “Não recebido” ou “Não pago”
        mantém a pendência até você editar novamente.
      </p>
      {detailsAllowed ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-1.5 sm:col-span-2">
            <Label htmlFor="edit-description">Descrição</Label>
            <Input
              id="edit-description"
              required
              maxLength={500}
              value={details.description}
              onChange={(e) => set("description", e.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="edit-person">
              {txn.kind === "entrada" ? "Paciente" : "Fornecedor"}
            </Label>
            <Input
              id="edit-person"
              maxLength={200}
              value={details.person ?? ""}
              onChange={(e) => set("person", e.target.value || null)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="edit-category">Categoria</Label>
            <NativeSelect
              id="edit-category"
              value={details.category_id ?? ""}
              onChange={(e) => set("category_id", e.target.value || null)}
            >
              <option value="">Sem categoria</option>
              {categories
                .filter((c) => c.kind === txn.kind)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
            </NativeSelect>
          </div>
          {txn.kind === "saida" && (
            <div className="grid gap-1.5">
              <Label htmlFor="edit-nature">Tipo de despesa</Label>
              <NativeSelect
                id="edit-nature"
                value={details.nature ?? ""}
                onChange={(e) => set("nature", (e.target.value as Nature) || null)}
              >
                <option value="">Sem natureza</option>
                <option value="fixa">Fixa</option>
                <option value="variavel">Variável</option>
              </NativeSelect>
            </div>
          )}
          <div className="grid gap-1.5">
            <Label htmlFor="edit-method">Forma de pagamento</Label>
            <NativeSelect
              id="edit-method"
              value={details.payment_method}
              onChange={(e) => set("payment_method", e.target.value as PaymentMethod)}
            >
              {Object.entries(PAYMENT_LABELS).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="edit-gross">Valor desta parcela (R$)</Label>
            <Input
              id="edit-gross"
              required
              type="number"
              step="0.01"
              min="0"
              value={details.gross_amount}
              onChange={(e) => set("gross_amount", e.target.value)}
            />
          </div>
          {txn.kind === "entrada" && (
            <div className="grid gap-1.5">
              <Label htmlFor="edit-fee">Taxa desta parcela (R$)</Label>
              <Input
                id="edit-fee"
                required
                type="number"
                step="0.01"
                min="0"
                value={details.fee_amount}
                onChange={(e) => set("fee_amount", e.target.value)}
              />
            </div>
          )}
          <div className="grid gap-1.5">
            <Label htmlFor="edit-competence">Data de competência</Label>
            <Input
              id="edit-competence"
              required
              type="date"
              value={details.competence_date}
              onChange={(e) => set("competence_date", e.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="edit-due">Vencimento / recebimento previsto</Label>
            <Input
              id="edit-due"
              required
              type="date"
              value={details.due_date}
              onChange={(e) => set("due_date", e.target.value)}
            />
          </div>
          <div className="grid gap-1.5 sm:col-span-2">
            <Label htmlFor="edit-notes">Observações</Label>
            <Textarea
              id="edit-notes"
              maxLength={10000}
              value={details.notes ?? ""}
              onChange={(e) => set("notes", e.target.value)}
            />
          </div>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          {readPayroll(txn)
            ? "Valores e dados da remuneração são editados na aba Colaboradores."
            : "Valores e dados do lançamento são editados pelo administrador."}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancelar
        </Button>
        <Button type="submit" disabled={update.isPending}>
          {update.isPending ? "Salvando…" : "Salvar alterações"}
        </Button>
      </div>
    </form>
  );
}
