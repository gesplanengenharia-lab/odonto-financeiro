import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent, type ReactNode } from "react";
import { toast } from "sonner";
import { ArrowLeftRight, Landmark, Plus, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader, EmptyState, StatCard } from "@/components/finance/ui";
import { QueryFeedback } from "@/components/finance/QueryFeedback";
import { pageHead } from "@/lib/head";
import { formatBRL, todayISO } from "@/lib/finance";
import { myAccessQuery } from "@/lib/queries";
import {
  accountsQuery, movementsQuery, reconciliationsQuery, accountBalancesQuery,
  addTreasuryAccount, addTreasuryMovement, addBankReconciliation,
  type FinancialAccount, type NewAccount, type NewMovement, type NewReconciliation,
} from "@/lib/treasury-api";
import { treasuryKindLabel, type TreasuryKind } from "@/lib/treasury";

export const Route = createFileRoute("/_authenticated/tesouraria")({
  head: () => pageHead("Tesouraria", "Contas, caixa, capital e conciliação bancária."),
  component: Tesouraria,
});
function moneyInput(value: string): number {
  const cleaned = value.trim().replace(/\s/g, "").replace(",", ".");
  if (!/^-?\d+(\.\d{1,2})?$/.test(cleaned)) throw new Error("Informe um valor válido, com até duas casas decimais.");
  const parsed = Number(cleaned);
  if (!Number.isFinite(parsed) || Math.abs(parsed) > 999999999999.99) throw new Error("Valor fora do limite permitido.");
  return parsed;
}
function isISODate(date: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const parsed = new Date(date + "T00:00:00Z");
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date;
}
function FormField({ label, children }: { label: string; children: ReactNode }) {
  return <label className="grid gap-1.5 text-sm font-medium">{label}{children}</label>;
}
function SelectField({ label, value, onChange, children }: { label: string; value: string; onChange: (v: string) => void; children: ReactNode }) {
  return <FormField label={label}><select className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm" value={value} onChange={(e) => onChange(e.target.value)}>{children}</select></FormField>;
}
const movementKinds: TreasuryKind[] = ["aporte", "retirada", "investimento", "transferencia", "financiamento", "amortizacao"];

function Tesouraria() {
  const { data: access, isPending: checkingAccess } = useQuery(myAccessQuery());
  const admin = access?.roles.includes("admin") ?? false;
  const qc = useQueryClient();
  const accounts = useQuery({ ...accountsQuery(), enabled: admin });
  const movements = useQuery({ ...movementsQuery(), enabled: admin });
  const reconciliations = useQuery({ ...reconciliationsQuery(), enabled: admin });
  const [asOf, setAsOf] = useState(todayISO());
  const rows = accounts.data ?? [];
  const balances = useQuery({ ...accountBalancesQuery(rows, asOf), enabled: admin && rows.length > 0 && isISODate(asOf) });
  const [mode, setMode] = useState<"contas" | "movimentos" | "conferencias">("contas");
  const [showCreate, setShowCreate] = useState<"conta" | "movimento" | "conferencia" | null>(null);

  const createAccount = useMutation({ mutationFn: addTreasuryAccount, onSuccess: async () => {
    await qc.invalidateQueries({ queryKey: ["treasury"] }); setShowCreate(null); toast.success("Conta cadastrada."); },
    onError: (error) => toast.error(error.message) });
  const createMovement = useMutation({ mutationFn: addTreasuryMovement, onSuccess: async () => {
    await qc.invalidateQueries({ queryKey: ["treasury"] }); setShowCreate(null); toast.success("Movimentação registrada."); },
    onError: (error) => toast.error(error.message) });
  const createReconciliation = useMutation({ mutationFn: addBankReconciliation, onSuccess: async () => {
    await qc.invalidateQueries({ queryKey: ["treasury"] }); setShowCreate(null); toast.success("Conferência registrada."); },
    onError: (error) => toast.error(error.message) });

  if (checkingAccess) return <p className="p-6 text-sm text-muted-foreground">Verificando acesso…</p>;
  if (!admin) return <div className="surface-card p-6" role="alert">A Tesouraria é exclusiva para administradores.</div>;

  const activeAccounts = rows.filter((a) => a.active);
  const total = rows.filter((a) => a.opening_date <= asOf)
    .reduce((sum, a) => sum + (balances.data?.[a.id] ?? 0), 0);
  return (
    <div>
      <PageHeader title="Tesouraria" subtitle="Posição financeira por conta, movimentos patrimoniais e conferências de extrato"
        actions={<div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setShowCreate("conta")}><Plus className="mr-1 h-4 w-4" />Nova conta</Button>
          <Button variant="outline" disabled={activeAccounts.length === 0} onClick={() => setShowCreate("movimento")}><ArrowLeftRight className="mr-1 h-4 w-4" />Movimento</Button>
          <Button disabled={activeAccounts.length === 0} onClick={() => setShowCreate("conferencia")}><ShieldCheck className="mr-1 h-4 w-4" />Conferir saldo</Button>
        </div>} />
      <div className="mb-5 rounded-xl border border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
        <strong className="text-foreground">Controle separado do resultado operacional.</strong> Aportes, financiamentos e transferências movimentam patrimônio, não faturamento.
        Lançamentos antigos sem conta vinculada não compõem os saldos bancários. Baixa automática não equivale a conciliação.
      </div>
      <div className="mb-5 flex flex-wrap items-end gap-3">
        <FormField label="Posição em"><Input type="date" value={asOf} max={todayISO()} onChange={(e) => setAsOf(e.target.value)} /></FormField>
        <Button variant="outline" onClick={() => { void accounts.refetch(); void balances.refetch(); void movements.refetch(); void reconciliations.refetch(); }}>Atualizar posição</Button>
      </div>
      <QueryFeedback loading={accounts.isPending || (rows.length > 0 && balances.isPending)}
        error={accounts.isError || balances.isError} retry={() => { void accounts.refetch(); void balances.refetch(); }}>
        {rows.length === 0 ? (
          <EmptyState title="Nenhuma conta cadastrada">Cadastre uma conta com o saldo e a data de abertura reais. Não crie saldos fictícios para compensar lançamentos antigos.</EmptyState>
        ) : (
          <div className="mb-6 grid gap-3 md:grid-cols-3">
            <StatCard label="Saldo financeiro atribuído" value={total} hint="Soma das contas cadastradas; não representa todo o caixa histórico" tone="primary" />
            <StatCard label="Contas ativas" value={0} raw={String(activeAccounts.length)} hint="Bancos e caixa físico" />
            <StatCard label="Movimentos patrimoniais" value={0} raw={String((movements.data ?? []).filter((m) => !m.voided_at).length)} hint="Aportes, transferências e outras movimentações" />
          </div>
        )}
      </QueryFeedback>

      <div className="mb-4 flex flex-wrap gap-2" role="tablist" aria-label="Visões da tesouraria">
        {([["contas", "Contas e saldos"], ["movimentos", "Movimentações"], ["conferencias", "Conciliações"]] as const).map(([value, label]) => (
          <Button key={value} size="sm" variant={mode === value ? "default" : "outline"} role="tab" aria-selected={mode === value} onClick={() => setMode(value)}>{label}</Button>
        ))}
      </div>

      {mode === "contas" && (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {rows.map((account) => (
            <div key={account.id} className="surface-card p-5">
              <div className="flex items-center justify-between gap-2"><Landmark className="h-5 w-5 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">{account.active ? "Ativa" : "Inativa"}</span></div>
              <h2 className="mt-3 font-semibold">{account.name}</h2>
              <p className="text-xs text-muted-foreground">{account.kind === "caixa" ? "Caixa físico" : "Conta bancária"} · Abertura {account.opening_date.split("-").reverse().join("/")}</p>
              <p className="mt-4 font-display text-2xl font-semibold tabular-nums">
                {account.opening_date > asOf ? "Ainda não aberta" : balances.isError ? "Indisponível" : balances.data?.[account.id] === undefined ? "Calculando…" : formatBRL(balances.data?.[account.id] ?? 0)}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">Saldo inicial: {formatBRL(account.opening_balance)}</p>
            </div>
          ))}
        </div>
      )}
      {mode === "movimentos" && (
        <QueryFeedback loading={movements.isPending} error={movements.isError} retry={() => void movements.refetch()}>
          {(movements.data ?? []).length === 0 ? <EmptyState title="Nenhuma movimentação patrimonial registrada" /> : (
            <div className="surface-card overflow-x-auto"><table className="w-full text-left text-sm">
              <thead className="border-b border-border bg-muted/30 text-muted-foreground"><tr><th className="p-3">Data</th><th className="p-3">Operação</th><th className="p-3">Conta</th><th className="p-3">Descrição</th><th className="p-3 text-right">Valor</th></tr></thead>
              <tbody>{(movements.data ?? []).map((m) => <tr key={m.id} className="border-b border-border/70">
                <td className="p-3 whitespace-nowrap">{m.movement_date.split("-").reverse().join("/")}</td>
                <td className="p-3">{treasuryKindLabel(m.kind)}{m.voided_at && <span className="ml-2 text-expense">(cancelado)</span>}</td>
                <td className="p-3">{rows.find((a) => a.id === m.account_id)?.name ?? "Conta não encontrada"}{m.destination_account_id && " → " + (rows.find((a) => a.id === m.destination_account_id)?.name ?? "Conta não encontrada")}</td>
                <td className="p-3">{m.description}</td><td className="p-3 text-right font-semibold tabular-nums">{formatBRL(m.amount)}</td>
              </tr>)}</tbody></table></div>
          )}
        </QueryFeedback>
      )}
      {mode === "conferencias" && (
        <QueryFeedback loading={reconciliations.isPending} error={reconciliations.isError} retry={() => void reconciliations.refetch()}>
          {(reconciliations.data ?? []).length === 0 ? <EmptyState title="Nenhuma conferência bancária registrada" /> : (
            <div className="surface-card overflow-x-auto"><table className="w-full text-left text-sm">
              <thead className="border-b border-border bg-muted/30 text-muted-foreground"><tr><th className="p-3">Data</th><th className="p-3">Conta</th><th className="p-3 text-right">Saldo no sistema</th><th className="p-3 text-right">Extrato</th><th className="p-3 text-right">Diferença</th></tr></thead>
              <tbody>{(reconciliations.data ?? []).map((r) => <tr key={r.id} className="border-b border-border/70">
                <td className="p-3">{r.reconciliation_date.split("-").reverse().join("/")}</td>
                <td className="p-3">{rows.find((a) => a.id === r.account_id)?.name ?? "Conta não encontrada"}</td>
                <td className="p-3 text-right">{formatBRL(r.expected_balance)}</td>
                <td className="p-3 text-right">{formatBRL(r.statement_balance)}</td>
                <td className={`p-3 text-right font-semibold ${Math.abs(r.difference) > 0.001 ? "text-expense" : "text-income"}`}>{formatBRL(r.difference)}</td>
              </tr>)}</tbody></table></div>
          )}
        </QueryFeedback>
      )}

      {showCreate && <div className="fixed inset-0 z-[70] flex items-center justify-center overflow-y-auto bg-foreground/50 p-3" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) setShowCreate(null); }}>
        <div className="surface-card my-auto w-full max-w-lg p-6" role="dialog" aria-modal="true" aria-label="Novo registro de tesouraria">
          {showCreate === "conta" && <AccountForm busy={createAccount.isPending} save={(v) => createAccount.mutate(v)} close={() => setShowCreate(null)} />}
          {showCreate === "movimento" && <MovementForm accounts={activeAccounts} busy={createMovement.isPending} save={(v) => createMovement.mutate(v)} close={() => setShowCreate(null)} />}
          {showCreate === "conferencia" && <ReconciliationForm accounts={activeAccounts} busy={createReconciliation.isPending} save={(v) => createReconciliation.mutate(v)} close={() => setShowCreate(null)} />}
        </div>
      </div>}
    </div>
  );
}

function AccountForm({ busy, save, close }: { busy: boolean; save: (v: NewAccount) => void; close: () => void }) {
  const [name, setName] = useState(""); const [kind, setKind] = useState<"banco" | "caixa">("banco");
  const [date, setDate] = useState(todayISO()); const [balance, setBalance] = useState("");
  function submit(e: FormEvent) {
    e.preventDefault();
    try {
      if (!isISODate(date) || date > todayISO()) throw new Error("Data inicial inválida.");
      if (!name.trim() || name.trim().length > 100) throw new Error("Informe o nome da conta.");
      if (balance.trim() === "") throw new Error("Confirme o saldo inicial real, inclusive zero.");
      save({ name: name.trim(), kind, opening_date: date, opening_balance: moneyInput(balance) });
    } catch (error) { toast.error((error as Error).message); }
  }
  return <form onSubmit={submit} className="grid gap-4"><h2 className="text-xl font-semibold">Cadastrar conta</h2>
    <FormField label="Nome"><Input required maxLength={100} value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Banco principal ou caixa físico" /></FormField>
    <SelectField label="Tipo" value={kind} onChange={(v) => setKind(v as "banco" | "caixa")}><option value="banco">Conta bancária</option><option value="caixa">Caixa físico</option></SelectField>
    <FormField label="Data de abertura"><Input required type="date" max={todayISO()} value={date} onChange={(e) => setDate(e.target.value)} /></FormField>
    <FormField label="Saldo inicial real (R$)"><Input required inputMode="decimal" value={balance} onChange={(e) => setBalance(e.target.value)} placeholder="0,00" /></FormField>
    <p className="text-xs text-muted-foreground">Utilize o saldo efetivo da data informada. Não inclua lançamentos anteriores novamente.</p>
    <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={close}>Cancelar</Button><Button type="submit" disabled={busy}>{busy ? "Salvando…" : "Cadastrar"}</Button></div>
  </form>;
}

function MovementForm({ accounts, busy, save, close }: { accounts: FinancialAccount[]; busy: boolean; save: (v: NewMovement) => void; close: () => void }) {
  const [kind, setKind] = useState<TreasuryKind>("aporte");
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [destination, setDestination] = useState("");
  const [date, setDate] = useState(todayISO());
  const [amount, setAmount] = useState(""); const [description, setDescription] = useState("");
  function submit(e: FormEvent) {
    e.preventDefault();
    try {
      const from = accounts.find((a) => a.id === accountId);
      if (!from) throw new Error("Selecione a conta de origem.");
      const dest = kind === "transferencia" ? accounts.find((a) => a.id === destination) : null;
      if (kind === "transferencia" && (!dest || dest.id === from.id)) throw new Error("Selecione outra conta de destino.");
      if (!isISODate(date) || date > todayISO() || date < from.opening_date || (dest && date < dest.opening_date)) throw new Error("Data incompatível com a abertura das contas.");
      if (!description.trim() || description.trim().length > 500) throw new Error("Descreva o motivo da operação.");
      const number = moneyInput(amount);
      if (number <= 0) throw new Error("O valor deve ser positivo.");
      save({ kind, account_id: accountId, destination_account_id: dest?.id ?? null,
        movement_date: date, amount: number, description: description.trim() });
    } catch (error) { toast.error((error as Error).message); }
  }
  return <form onSubmit={submit} className="grid gap-4"><h2 className="text-xl font-semibold">Novo movimento patrimonial</h2>
    <p className="text-xs text-muted-foreground">Não utilize para registrar vendas de pacientes ou despesas operacionais. Essas pertencem a Lançamentos.</p>
    <SelectField label="Operação" value={kind} onChange={(v) => setKind(v as TreasuryKind)}>{movementKinds.map((k) => <option key={k} value={k}>{treasuryKindLabel(k)}</option>)}</SelectField>
    <SelectField label={kind === "transferencia" ? "Conta de origem" : "Conta"} value={accountId} onChange={setAccountId}>{accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</SelectField>
    {kind === "transferencia" && <SelectField label="Conta de destino" value={destination} onChange={setDestination}><option value="">Selecione</option>{accounts.filter((a) => a.id !== accountId).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</SelectField>}
    <FormField label="Data efetiva"><Input required type="date" max={todayISO()} value={date} onChange={(e) => setDate(e.target.value)} /></FormField>
    <FormField label="Valor (R$)"><Input required inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0,00" /></FormField>
    <FormField label="Descrição / identificação"><Input required maxLength={500} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Ex.: aporte de capital — sócio" /></FormField>
    <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={close}>Cancelar</Button><Button type="submit" disabled={busy}>{busy ? "Registrando…" : "Registrar movimento"}</Button></div>
  </form>;
}

function ReconciliationForm({ accounts, busy, save, close }: { accounts: FinancialAccount[]; busy: boolean; save: (v: NewReconciliation) => void; close: () => void }) {
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [date, setDate] = useState(todayISO()); const [balance, setBalance] = useState("");
  const [notes, setNotes] = useState("");
  function submit(e: FormEvent) {
    e.preventDefault();
    try {
      const account = accounts.find((a) => a.id === accountId);
      if (!account || !isISODate(date) || date > todayISO() || date < account.opening_date) throw new Error("Conta ou data inválida.");
      if (balance.trim() === "") throw new Error("Informe o valor no extrato, mesmo que seja zero.");
      if (notes.length > 1000) throw new Error("Observações muito longas.");
      save({ account_id: accountId, reconciliation_date: date, statement_balance: moneyInput(balance), notes: notes.trim() || null });
    } catch (error) { toast.error((error as Error).message); }
  }
  return <form onSubmit={submit} className="grid gap-4"><h2 className="text-xl font-semibold">Conferir saldo</h2>
    <p className="text-xs text-muted-foreground">Registra a diferença entre o extrato e o saldo no sistema. Não confirma automaticamente lançamentos individuais.</p>
    <SelectField label="Conta" value={accountId} onChange={setAccountId}>{accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</SelectField>
    <FormField label="Data do extrato"><Input required type="date" max={todayISO()} value={date} onChange={(e) => setDate(e.target.value)} /></FormField>
    <FormField label="Saldo conforme extrato (R$)"><Input required inputMode="decimal" value={balance} onChange={(e) => setBalance(e.target.value)} placeholder="0,00" /></FormField>
    <FormField label="Observações (opcional)"><Input maxLength={1000} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Extrato bancário / referência" /></FormField>
    <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={close}>Cancelar</Button><Button type="submit" disabled={busy}>{busy ? "Conferindo…" : "Registrar conferência"}</Button></div>
  </form>;
}
