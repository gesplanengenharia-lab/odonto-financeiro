import type { SupabaseClient } from "@supabase/supabase-js";
import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Json, Database } from "@/integrations/supabase/types";
import type { TreasuryKind } from "./treasury";
import { assertCanLinkPaidTransaction, assertCanReconcilePaidTransaction } from "./treasury-linking";
import { treasuryTodayISO } from "./treasury-time";

type Table<Row, Insert, Update = Partial<Insert>> = {
  Row: Row; Insert: Insert; Update: Update; Relationships: [];
};
export type FinancialAccount = {
  id: string; name: string; kind: "banco" | "caixa"; currency: string;
  opening_date: string; opening_balance: number; active: boolean;
  created_by: string | null; created_at: string;
};
export type FinancialMovement = {
  id: string; kind: TreasuryKind; account_id: string;
  destination_account_id: string | null; movement_date: string;
  amount: number; description: string; created_by: string | null;
  created_at: string; voided_at: string | null; voided_by: string | null;
  void_reason: string | null;
};
export type FinancialReconciliation = {
  id: string; account_id: string; reconciliation_date: string;
  statement_balance: number; expected_balance: number; difference: number;
  notes: string | null; created_by: string | null; created_at: string;
};
export type NewAccount = Pick<FinancialAccount, "name" | "kind" | "opening_date" | "opening_balance">;
export type NewMovement = Pick<FinancialMovement, "kind" | "account_id" | "destination_account_id" | "movement_date" | "amount" | "description">;
export type NewReconciliation = Pick<FinancialReconciliation, "account_id" | "reconciliation_date" | "statement_balance" | "notes">;
type ExistingTransactions = Database["public"]["Tables"]["transactions"];
export type PaidFinancialTransaction = {
  id: string;
  kind: "entrada" | "saida";
  description: string;
  person: string | null;
  status: "pago" | "pendente";
  paid_date: string | null;
  due_date: string;
  payment_method: string;
  fee_amount: number;
  gross_amount: number;
  net_amount: number;
  financial_account_id: string | null;
  reconciled_at: string | null;
  reconciled_by: string | null;
};
type ExtendedTransactions = {
  Row: ExistingTransactions["Row"] & Pick<PaidFinancialTransaction, "financial_account_id" | "reconciled_at" | "reconciled_by">;
  Insert: ExistingTransactions["Insert"] & Partial<Pick<PaidFinancialTransaction, "financial_account_id" | "reconciled_at" | "reconciled_by">>;
  Update: ExistingTransactions["Update"] & Partial<Pick<PaidFinancialTransaction, "financial_account_id" | "reconciled_at" | "reconciled_by">>;
  Relationships: ExistingTransactions["Relationships"];
};

type TreasuryDatabase = Omit<Database, "public"> & {
  public: Omit<Database["public"], "Tables" | "Functions"> & {
    Tables: Omit<Database["public"]["Tables"], "transactions"> & {
      transactions: ExtendedTransactions;
      financial_accounts: Table<FinancialAccount, NewAccount>;
      financial_schema_versions: Table<{ version: number }, never>;
      treasury_movements: Table<FinancialMovement, NewMovement, Partial<NewMovement> & { void_reason?: string; voided_at?: string }>;
      bank_reconciliations: Table<FinancialReconciliation, NewReconciliation>;
    };
    Functions: Database["public"]["Functions"] & {
      treasury_balances_snapshot: { Args: { _as_of: string; _account_ids: string[] }; Returns: Json };
      financial_account_balance: { Args: { _account_id: string; _as_of: string; _confirmed_only?: boolean }; Returns: number };
    };
  };
};
/**
 * Typed adapter for the already deployed, additive Treasury v1 schema.
 * The Lovable-generated Database type still reflects the older schema.
 * No service-role credentials are used: database RLS is authoritative.
 */
export const treasuryDb = supabase as unknown as SupabaseClient<TreasuryDatabase>;

export const accountsQuery = () => queryOptions({
  queryKey: ["treasury", "accounts"],
  queryFn: async (): Promise<FinancialAccount[]> => {
    const all: FinancialAccount[] = [];
    for (let page = 0; ; page++) {
      const { data, error } = await treasuryDb.from("financial_accounts")
        .select("*").order("created_at", { ascending: true }).order("id", { ascending: true })
        .range(page * 500, (page + 1) * 500 - 1);
      if (error) throw error;
      all.push(...(data ?? []).map((a) => ({ ...a, opening_balance: Number(a.opening_balance) })));
      if (!data || data.length < 500) return all;
    }
  },
});
export const movementsQuery = () => queryOptions({
  queryKey: ["treasury", "movements"],
  queryFn: async (): Promise<FinancialMovement[]> => {
    const all: FinancialMovement[] = [];
    for (let page = 0; ; page++) {
      const { data, error } = await treasuryDb.from("treasury_movements").select("*")
        .order("movement_date", { ascending: false })
        .order("id", { ascending: true })
        .range(page * 500, (page + 1) * 500 - 1);
      if (error) throw error;
      all.push(...(data ?? []).map((m) => ({ ...m, amount: Number(m.amount) })));
      if (!data || data.length < 500) break;
    }
    return all;
  },
});
export const reconciliationsQuery = () => queryOptions({
  queryKey: ["treasury", "reconciliations"],
  queryFn: async (): Promise<FinancialReconciliation[]> => {
    const all: FinancialReconciliation[] = [];
    for (let page = 0; ; page++) {
      const { data, error } = await treasuryDb.from("bank_reconciliations").select("*")
        .order("reconciliation_date", { ascending: false }).order("id", { ascending: true })
        .range(page * 500, (page + 1) * 500 - 1);
      if (error) throw error;
      all.push(...(data ?? []).map((r) => ({
        ...r,
        statement_balance: Number(r.statement_balance),
        expected_balance: Number(r.expected_balance),
        difference: Number(r.difference),
      })));
      if (!data || data.length < 500) break;
    }
    return all;
  },
});
export const treasuryReadyQuery = () => queryOptions({
  queryKey: ["treasury", "ready"],
  queryFn: async () => {
    const { data, error } = await treasuryDb.from("financial_schema_versions").select("version").eq("version", 2).maybeSingle();
    if (error) throw error;
    return data?.version === 2;
  },
});

/** One read-only SQL statement: all accounts, both views, one database snapshot. */
export const accountBalancesQuery = (accounts: FinancialAccount[], asOf: string) => queryOptions({
  queryKey: ["treasury", "balances", asOf, accounts.map((a) => a.id).sort().join(",")],
  enabled: accounts.length > 0,
  queryFn: async () => {
    const { data, error } = await treasuryDb.rpc("treasury_balances_snapshot", {
      _as_of: asOf, _account_ids: accounts.map((a) => a.id),
    });
    if (error) throw error;
    const invalid = () => new Error("O banco retornou saldo inválido ou incompleto. Atualize a posição.");
    if (!Array.isArray(data) || data.length !== accounts.length) throw invalid();
    const pending = new Map(accounts.map(a => [a.id, a]));
    const posted: Record<string, number> = {}, confirmed: Record<string, number> = {};
    const amount = (value: Json | undefined): number => {
      if ((typeof value !== "number" && typeof value !== "string") || String(value).trim() === "" || !Number.isFinite(Number(value))) throw invalid();
      return Number(value);
    };
    for (const row of data) {
      if (!row || typeof row !== "object" || Array.isArray(row) || typeof row["id"] !== "string") throw invalid();
      const account = pending.get(row["id"]);
      if (!account) throw invalid();
      pending.delete(account.id);
      if (account.opening_date > asOf) {
        if (row["posted"] !== null || row["confirmed"] !== null) throw invalid();
      } else {
        posted[account.id] = amount(row["posted"]);
        confirmed[account.id] = amount(row["confirmed"]);
      }
    }
    return { posted, confirmed };
  },
});
export async function addTreasuryAccount(input: NewAccount) {
  const { error } = await treasuryDb.from("financial_accounts").insert(input);
  if (error) throw error;
}
export async function addTreasuryMovement(input: NewMovement) {
  const { error } = await treasuryDb.from("treasury_movements").insert(input);
  if (error) throw error;
}
export async function addBankReconciliation(input: NewReconciliation) {
  // expected_balance is always recalculated by the database trigger; the placeholder only satisfies the column type.
  const { error } = await treasuryDb.from("bank_reconciliations").insert({ ...input, expected_balance: 0 });
  if (error) throw error;
}

/** Somente transações com baixa e data efetiva; consulta paginada para não omitir parcelas antigas. */
export const paidFinancialTransactionsQuery = () => queryOptions({
  queryKey: ["treasury", "paid-transactions"],
  queryFn: async (): Promise<PaidFinancialTransaction[]> => {
    const all: PaidFinancialTransaction[] = [];
    for (let page = 0; ; page++) {
      const { data, error } = await treasuryDb.from("transactions")
        .select("id,kind,description,person,status,paid_date,due_date,payment_method,fee_amount,gross_amount,net_amount,financial_account_id,reconciled_at,reconciled_by")
        .eq("status", "pago").not("paid_date", "is", null)
        .order("paid_date", { ascending: false }).order("id", { ascending: true })
        .range(page * 500, (page + 1) * 500 - 1);
      if (error) throw error;
      all.push(...(data ?? []).map((row) => ({
        ...row,
        kind: row.kind as PaidFinancialTransaction["kind"],
        status: row.status as PaidFinancialTransaction["status"],
        gross_amount: Number(row.gross_amount),
        fee_amount: Number(row.fee_amount),
        net_amount: Number(row.net_amount),
      })));
      if (!data || data.length < 500) break;
    }
    return all;
  },
});
/** Vincula sem mudar status, valor, vencimento ou data do pagamento. */
export async function linkPaidFinancialTransaction(input: {
  transaction: PaidFinancialTransaction;
  account: FinancialAccount;
}) {
  const { transaction, account } = input;
  assertCanLinkPaidTransaction(transaction, account, treasuryTodayISO());
  let query = treasuryDb.from("transactions")
    .update({ financial_account_id: account.id })
    .eq("id", transaction.id).eq("status", "pago")
    .eq("paid_date", transaction.paid_date!)
    .eq("kind", transaction.kind)
    .eq("description", transaction.description)
    .eq("due_date", transaction.due_date)
    .eq("payment_method", transaction.payment_method)
    .eq("fee_amount", transaction.fee_amount)
    .eq("gross_amount", transaction.gross_amount)
    .eq("net_amount", transaction.net_amount)
    .is("financial_account_id", null)
    .is("reconciled_at", null)
    .is("reconciled_by", null);
  query = transaction.person === null ? query.is("person", null) : query.eq("person", transaction.person);
  const { data, error } = await query.select("id").maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("O lançamento mudou ou não há permissão. Atualize a lista antes de vincular.");
}
/** Confirma uma transação já paga e vinculada após conferência humana do extrato. */
export async function confirmPaidFinancialTransaction(transaction: PaidFinancialTransaction) {
  assertCanReconcilePaidTransaction(transaction, treasuryTodayISO());
  const { data: identity, error: identityError } = await treasuryDb.auth.getUser();
  if (identityError) throw identityError;
  if (!identity.user) throw new Error("Sessão expirada. Entre novamente.");
  let query = treasuryDb.from("transactions")
    .update({ reconciled_at: new Date().toISOString(), reconciled_by: identity.user.id })
    .eq("id", transaction.id).eq("status", "pago")
    .eq("paid_date", transaction.paid_date!)
    .eq("kind", transaction.kind)
    .eq("description", transaction.description)
    .eq("due_date", transaction.due_date)
    .eq("payment_method", transaction.payment_method)
    .eq("fee_amount", transaction.fee_amount)
    .eq("financial_account_id", transaction.financial_account_id!)
    .eq("gross_amount", transaction.gross_amount)
    .eq("net_amount", transaction.net_amount)
    .is("reconciled_at", null)
    .is("reconciled_by", null);
  query = transaction.person === null ? query.is("person", null) : query.eq("person", transaction.person);
  const { data, error } = await query.select("id").maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("A transação já foi alterada, conciliada ou você não tem permissão. Atualize a lista.");
}

