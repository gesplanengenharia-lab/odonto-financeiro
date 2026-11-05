import {
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
  type SelectHTMLAttributes,
} from "react";
import { useQuery } from "@tanstack/react-query";
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
import { cn } from "@/lib/utils";
import {
  buildLaunchPlan,
  addMonths,
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

export function NativeSelect({
  className,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & { children: ReactNode }) {
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

export function LaunchDialog({
  defaultKind = "entrada",
  trigger,
}: {
  defaultKind?: Kind;
  trigger?: ReactNode;
}) {
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
  const [hasEntry, setHasEntry] = useState(false);
  const [entryAmount, setEntryAmount] = useState("");
  const [entryMethod, setEntryMethod] = useState<PaymentMethod>("pix");
  const [entryDue, setEntryDue] = useState(todayISO());
  const [entryPaid, setEntryPaid] = useState(true);
  const [paid, setPaid] = useState(true);
  const [notes, setNotes] = useState("");

  const isCard = method === "debito" || method === "credito";
  const cats = categories.filter((c) => c.kind === kind);
  const value = Number(amount.replace(/\./g, "").replace(",", ".")) || 0;

  const withEntry = kind === "entrada" && hasEntry;
  const entryValue = Number(entryAmount.replace(/\./g, "").replace(",", ".")) || 0;
  const plan = useMemo(() => {
    if (!settings || value <= 0) return { rows: [], remaining: 0, entryAmount: 0, error: "" };
    try {
      return {
        ...buildLaunchPlan(
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
            paid: paid && canSettle && (!withEntry || firstDue <= todayISO()),
            notes,
            ...(withEntry
              ? {
                  down_payment: {
                    amount: entryValue,
                    payment_method: entryMethod,
                    first_due_date: entryDue,
                    paid: entryPaid && canSettle && entryDue <= todayISO(),
                  },
                }
              : {}),
          },
          settings,
          () => crypto.randomUUID(),
        ),
        error: "",
      };
    } catch (error) {
      return {
        rows: [],
        remaining: 0,
        entryAmount: 0,
        error: error instanceof Error ? error.message : "Confira as condições de pagamento.",
      };
    }
  }, [
    settings,
    value,
    kind,
    description,
    person,
    categoryId,
    nature,
    method,
    date,
    firstDue,
    installments,
    paid,
    notes,
    canSettle,
    withEntry,
    entryValue,
    entryMethod,
    entryDue,
    entryPaid,
  ]);
  const rows = plan.rows;
  const totalFee = rows.reduce((sum, row) => sum + row.fee_amount, 0);
  const totalNet = rows.reduce((sum, row) => sum + row.net_amount, 0);

  function onCategory(id: string) {
    setCategoryId(id);
    const c = categories.find((x) => x.id === id);
    if (c?.nature) setNature(c.nature);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!rows.length) {
      toast.error(plan.error || "Informe um valor maior que zero");
      return;
    }
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
              setHasEntry(false);
              setPaid(true);
            }}
            className={cn(
              "rounded-md py-2 text-sm font-semibold transition-colors",
              kind === k
                ? k === "entrada"
                  ? "bg-income text-primary-foreground"
                  : "bg-expense text-primary-foreground"
                : "text-muted-foreground",
            )}
          >
            {k === "entrada" ? "Entrada (receita)" : "Saída (despesa)"}
          </button>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5 sm:col-span-2">
          <Label htmlFor="desc">Descrição</Label>
          <Input
            id="desc"
            required
            placeholder={kind === "entrada" ? "Ex.: Implante unitário" : "Ex.: Aluguel da sala"}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
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
            <NativeSelect
              id="nature"
              value={nature}
              onChange={(e) => setNature(e.target.value as Nature)}
            >
              <option value="fixa">Fixa</option>
              <option value="variavel">Variável</option>
            </NativeSelect>
          </div>
        )}
        <div className="grid gap-1.5">
          <Label htmlFor="amount">
            {kind === "entrada" ? "Valor total da venda (R$)" : "Valor total (R$)"}
          </Label>
          <Input
            id="amount"
            required
            inputMode="decimal"
            placeholder="0,00"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="date">
            {kind === "entrada" ? "Data do atendimento / venda" : "Data da compra"}
          </Label>
          <Input
            id="date"
            type="date"
            required
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>
        {kind === "entrada" && (
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input
              type="checkbox"
              className="h-4 w-4 accent-primary"
              checked={hasEntry}
              onChange={(e) => {
                setHasEntry(e.target.checked);
                setPaid(!e.target.checked);
                if (e.target.checked) {
                  setEntryDue(date);
                  setFirstDue(addMonths(date, 1));
                }
              }}
            />{" "}
            Pagamento com entrada e saldo restante
          </label>
        )}
        {withEntry && (
          <fieldset className="grid gap-4 rounded-lg border border-border p-4 sm:col-span-2 sm:grid-cols-2">
            <legend className="px-1 text-sm font-semibold">Entrada</legend>
            <div className="grid gap-1.5">
              <Label htmlFor="entry-amount">Valor da entrada (R$)</Label>
              <Input
                id="entry-amount"
                required
                inputMode="decimal"
                placeholder="0,00"
                value={entryAmount}
                onChange={(e) => setEntryAmount(e.target.value)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="entry-method">Forma de pagamento da entrada</Label>
              <NativeSelect
                id="entry-method"
                value={entryMethod}
                onChange={(e) => setEntryMethod(e.target.value as PaymentMethod)}
              >
                {(Object.keys(PAYMENT_LABELS) as PaymentMethod[]).map((m) => (
                  <option key={m} value={m}>
                    {PAYMENT_LABELS[m]}
                  </option>
                ))}
              </NativeSelect>
            </div>
            {entryMethod !== "credito" && entryMethod !== "debito" ? (
              <>
                <div className="grid gap-1.5">
                  <Label htmlFor="entry-due">Vencimento da entrada</Label>
                  <Input
                    id="entry-due"
                    type="date"
                    required
                    value={entryDue}
                    onChange={(e) => setEntryDue(e.target.value)}
                  />
                </div>
                <label className="flex items-center gap-2 self-end pb-2 text-sm">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-primary"
                    checked={entryPaid && canSettle && entryDue <= todayISO()}
                    disabled={!canSettle || entryDue > todayISO()}
                    onChange={(e) => setEntryPaid(e.target.checked)}
                  />
                  Entrada já recebida
                </label>
              </>
            ) : (
              <p className="text-xs text-muted-foreground sm:col-span-2">
                Entrada no cartão à vista. A taxa e a data de recebimento seguem as configurações da
                maquininha.
              </p>
            )}
            {rows.length > 0 && (
              <p className="text-sm font-medium sm:col-span-2">
                Saldo restante: {formatBRL(plan.remaining)}
              </p>
            )}
          </fieldset>
        )}
        <div className="grid gap-1.5">
          <Label htmlFor="method">
            {withEntry ? "Forma de pagamento do restante" : "Forma de pagamento"}
          </Label>
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
        {method !== "debito" && (
          <div className="grid gap-1.5">
            <Label htmlFor="inst">
              {withEntry
                ? "Parcelas do restante"
                : method === "credito"
                  ? "Parcelas no cartão"
                  : "Parcelas mensais"}
            </Label>
            <NativeSelect
              id="inst"
              value={installments}
              onChange={(e) => setInstallments(Number(e.target.value))}
            >
              {Array.from({ length: method === "credito" ? 12 : 24 }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>
                  {n === 1 ? (withEntry ? "Parcela única" : "À vista") : `${n}x`}
                </option>
              ))}
            </NativeSelect>
          </div>
        )}
        {!isCard && (
          <div className="grid gap-1.5">
            <Label htmlFor="due">
              {withEntry
                ? "1º vencimento do restante"
                : installments > 1
                  ? "1º vencimento"
                  : "Vencimento"}
            </Label>
            <Input
              id="due"
              type="date"
              required
              value={firstDue}
              onChange={(e) => setFirstDue(e.target.value)}
            />
          </div>
        )}
        {!isCard && (
          <label className="flex items-center gap-2 self-end pb-2 text-sm">
            <input
              type="checkbox"
              className="h-4 w-4 accent-primary"
              disabled={!canSettle || (withEntry && firstDue > todayISO())}
              checked={paid && canSettle && (!withEntry || firstDue <= todayISO())}
              onChange={(e) => setPaid(e.target.checked)}
            />
            {withEntry
              ? "1ª parcela restante já foi paga"
              : installments > 1
                ? "1ª parcela já foi paga"
                : "Já foi pago"}
          </label>
        )}
        {kind === "entrada" && (
          <p className="text-xs text-muted-foreground sm:col-span-2">
            Entradas recebem baixa automática na data de vencimento. Se o paciente não pagar,
            desfaça a baixa em Lançamentos para ele aparecer em Inadimplentes.
          </p>
        )}
        <div className="grid gap-1.5 sm:col-span-2">
          <Label htmlFor="notes">Observações</Label>
          <Textarea id="notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
      </div>

      {plan.error && (
        <p role="alert" className="text-sm text-expense">
          {plan.error}
        </p>
      )}
      {rows.length > 0 && (
        <div className="rounded-lg border border-border bg-muted/60 p-4 text-sm">
          {withEntry && (
            <p className="mb-3 font-medium">
              Entrada {formatBRL(plan.entryAmount)} + saldo {formatBRL(plan.remaining)} = total da
              venda {formatBRL(value)}
            </p>
          )}
          <div className="flex flex-wrap gap-x-6 gap-y-1">
            <span>
              <strong>{rows.length}</strong> lançamento{rows.length > 1 ? "s" : ""}
            </span>
            {totalFee > 0 && kind === "entrada" && (
              <span>
                Taxas de cartão: <strong className="text-expense">{formatBRL(totalFee)}</strong>
              </span>
            )}
            <span>
              {kind === "entrada" ? "Líquido total" : "Total"}:{" "}
              <strong>{formatBRL(totalNet)}</strong>
            </span>
          </div>
          <ul className="mt-3 grid max-h-36 gap-1 overflow-y-auto text-xs text-muted-foreground">
            {rows.map((r, i) => (
              <li key={i} className="tabular flex justify-between">
                <span>
                  {withEntry && i === 0
                    ? "Entrada"
                    : `${withEntry ? "Saldo · " : ""}${r.installment_total > 1 ? `Parcela ${r.installment_number}/${r.installment_total}` : "Parcela única"}`}{" "}
                  · {PAYMENT_LABELS[r.payment_method]} ·{" "}
                  {r.payment_method === "credito" || r.payment_method === "debito"
                    ? "previsto em"
                    : "vence"}{" "}
                  {formatDate(r.due_date)}
                </span>
                <span className="text-right">
                  {formatBRL(r.net_amount)}
                  {r.fee_amount > 0 && (
                    <span className="ml-2 text-muted-foreground">
                      (taxa {formatBRL(r.fee_amount)})
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancelar
        </Button>
        <Button type="submit" disabled={create.isPending || !rows.length}>
          {create.isPending ? "Salvando..." : "Salvar"}
        </Button>
      </div>
    </form>
  );
}
