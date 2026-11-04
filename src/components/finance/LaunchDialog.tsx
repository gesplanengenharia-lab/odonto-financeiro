import { useMemo, useState, type FormEvent, type ReactNode, type SelectHTMLAttributes } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  buildLaunchRows,
  cardFeePercent,
  formatBRL,
  formatDate,
  PAYMENT_LABELS,
  todayISO,
  type Kind,
  type Nature,
  type PaymentMethod,
} from "@/lib/finance";
import { canUse } from "@/lib/access";
import { cardSettingsQuery, categoriesQuery, myAccessQuery, useTxnMutations } from "@/lib/queries";

export function NativeSelect({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement> & { children: ReactNode }) {
  return (
    <select
      className={cn(
        "flex h-9 w-full rounded-md border border-input bg-card px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
        className,
      )}
      {...props}
    >
      {children}
    </select>
  );
}

export function LaunchDialog({ defaultKind = "entrada", trigger }: { defaultKind?: Kind; trigger?: ReactNode }) {
  const [open, setOpen] = useState(false);
  const { data: access } = useQuery(myAccessQuery());
  if (!canUse(access, "lancamentos")) return null;
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger ?? <Button>Novo lançamento</Button>}</DialogTrigger>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="font-display">Novo lançamento</DialogTitle>
        </DialogHeader>
        {open && <LaunchForm defaultKind={defaultKind} onDone={() => setOpen(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function LaunchForm({ defaultKind, onDone }: { defaultKind: Kind; onDone: () => void }) {
  const { data: categories = [] } = useQuery(categoriesQuery());
  const { data: settings } = useQuery(cardSettingsQuery());
  const { create } = useTxnMutations();
  const { data: access } = useQuery(myAccessQuery());
  const canSettle = canUse(access, "baixar");

  const [kind, setKind] = useState<Kind>(defaultKind);
  const [description, setDescription] = useState("");
  const [person, setPerson] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [nature, setNature] = useState<Nature>("variavel");
  const [method, setMethod] = useState<PaymentMethod>("pix");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(todayISO());
  const [firstDue, setFirstDue] = useState(todayISO());
  const [installments, setInstallments] = useState(1);
  const [repeat, setRepeat] = useState(1);
  const [paid, setPaid] = useState(true);
  const [notes, setNotes] = useState("");

  const isCard = method === "debito" || method === "credito";
  const cats = categories.filter((c) => c.kind === kind);
  const value = Number(amount.replace(/\./g, "").replace(",", ".")) || 0;

  const rows = useMemo(() => {
    if (!settings || value <= 0) return [];
    return buildLaunchRows(
      {
        kind,
        description,
        person,
        category_id: categoryId || null,
        nature,
        payment_method: method,
        amount: value,
        date,
        first_due_date: firstDue,
        installments,
        repeat_months: repeat,
        paid: paid && canSettle,
        notes,
      },
      settings,
      () => crypto.randomUUID(),
    );
  }, [settings, value, kind, description, person, categoryId, nature, method, date, firstDue, installments, repeat, paid, notes, canSettle]);

  const totalFee = rows.reduce((s, r) => s + r.fee_amount, 0);
  const totalNet = rows.reduce((s, r) => s + r.net_amount, 0);
  const feePct = settings && kind === "entrada" ? cardFeePercent(settings, method, installments) : 0;

  function onCategory(id: string) {
    setCategoryId(id);
    const c = categories.find((x) => x.id === id);
    if (c?.nature) setNature(c.nature);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!rows.length) { toast.error("Informe um valor maior que zero"); return; }
    try {
      await create.mutateAsync(rows);
      toast.success(rows.length > 1 ? `${rows.length} lançamentos criados` : "Lançamento criado");
      onDone();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao salvar");
    }
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-4">
      <div className="grid grid-cols-2 gap-2 rounded-lg bg-muted p-1">
        {(["entrada", "saida"] as const).map((k) => (
          <button
            type="button"
            key={k}
            onClick={() => {
              setKind(k);
              setCategoryId("");
            }}
            className={cn(
              "rounded-md py-2 text-sm font-semibold transition-colors",
              kind === k ? (k === "entrada" ? "bg-income text-primary-foreground" : "bg-expense text-primary-foreground") : "text-muted-foreground",
            )}
          >
            {k === "entrada" ? "Entrada (receita)" : "Saída (despesa)"}
          </button>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5 sm:col-span-2">
          <Label htmlFor="desc">Descrição</Label>
          <Input id="desc" required placeholder={kind === "entrada" ? "Ex.: Implante unitário" : "Ex.: Aluguel da sala"} value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="person">{kind === "entrada" ? "Paciente" : "Fornecedor"}</Label>
          <Input id="person" value={person} onChange={(e) => setPerson(e.target.value)} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="cat">Categoria</Label>
          <NativeSelect id="cat" value={categoryId} onChange={(e) => onCategory(e.target.value)}>
            <option value="">Sem categoria</option>
            {cats.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </NativeSelect>
        </div>
        {kind === "saida" && (
          <div className="grid gap-1.5">
            <Label htmlFor="nature">Tipo de despesa</Label>
            <NativeSelect id="nature" value={nature} onChange={(e) => setNature(e.target.value as Nature)}>
              <option value="fixa">Fixa</option>
              <option value="variavel">Variável</option>
            </NativeSelect>
          </div>
        )}
        <div className="grid gap-1.5">
          <Label htmlFor="method">Forma de pagamento</Label>
          <NativeSelect
            id="method"
            value={method}
            onChange={(e) => {
              setMethod(e.target.value as PaymentMethod);
              setInstallments(1);
            }}
          >
            {(Object.keys(PAYMENT_LABELS) as PaymentMethod[]).map((m) => (
              <option key={m} value={m}>
                {PAYMENT_LABELS[m]}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="amount">Valor total (R$)</Label>
          <Input id="amount" required inputMode="decimal" placeholder="0,00" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="date">{kind === "entrada" ? "Data do atendimento / venda" : "Data da compra"}</Label>
          <Input id="date" type="date" required value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        {method !== "debito" && (
          <div className="grid gap-1.5">
            <Label htmlFor="inst">{method === "credito" ? "Parcelas no cartão" : "Parcelas mensais"}</Label>
            <NativeSelect id="inst" value={installments} onChange={(e) => setInstallments(Number(e.target.value))}>
              {Array.from({ length: method === "credito" ? 12 : 24 }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>
                  {n === 1 ? "À vista" : `${n}x`}
                </option>
              ))}
            </NativeSelect>
          </div>
        )}
        {!isCard && (
          <div className="grid gap-1.5">
            <Label htmlFor="due">{installments > 1 ? "1º vencimento" : "Vencimento"}</Label>
            <Input id="due" type="date" required value={firstDue} onChange={(e) => setFirstDue(e.target.value)} />
          </div>
        )}
        <div className="grid gap-1.5">
          <Label htmlFor="repeat">Repetir todo mês</Label>
          <NativeSelect id="repeat" value={repeat} onChange={(e) => setRepeat(Number(e.target.value))}>
            <option value={1}>Não repetir</option>
            {[2, 3, 6, 12, 24].map((n) => (
              <option key={n} value={n}>
                Por {n} meses
              </option>
            ))}
          </NativeSelect>
        </div>
        {!isCard && (
          <label className="flex items-center gap-2 self-end pb-2 text-sm">
            <input type="checkbox" className="h-4 w-4 accent-primary" disabled={!canSettle} checked={paid && canSettle} onChange={(e) => setPaid(e.target.checked)} />
            {installments > 1 || repeat > 1 ? "1ª parcela já foi paga" : "Já foi pago"}
          </label>
        )}
        <div className="grid gap-1.5 sm:col-span-2">
          <Label htmlFor="notes">Observações</Label>
          <Textarea id="notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
      </div>

      {rows.length > 0 && (
        <div className="rounded-lg border border-border bg-muted/60 p-4 text-sm">
          <div className="flex flex-wrap gap-x-6 gap-y-1">
            <span>
              <strong>{rows.length}</strong> lançamento{rows.length > 1 ? "s" : ""}
            </span>
            {isCard && kind === "entrada" && (
              <span>
                Taxa {feePct.toLocaleString("pt-BR")}%: <strong className="text-expense">{formatBRL(totalFee)}</strong>
              </span>
            )}
            <span>
              {kind === "entrada" ? "Líquido a receber" : "Total"}: <strong>{formatBRL(totalNet)}</strong>
            </span>
          </div>
          <ul className="mt-3 grid max-h-36 gap-1 overflow-y-auto text-xs text-muted-foreground">
            {rows.slice(0, 24).map((r, i) => (
              <li key={i} className="tabular flex justify-between">
                <span>
                  {r.installment_total > 1 ? `Parcela ${r.installment_number}/${r.installment_total}` : "Parcela única"} · {isCard ? "cai em" : "vence"} {formatDate(r.due_date)}
                </span>
                <span>{formatBRL(r.net_amount)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancelar
        </Button>
        <Button type="submit" disabled={create.isPending}>
          {create.isPending ? "Salvando..." : "Salvar"}
        </Button>
      </div>
    </form>
  );
}

