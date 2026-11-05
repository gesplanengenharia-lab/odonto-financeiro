import type { SupabaseClient } from "@supabase/supabase-js";
import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import type { TreasuryKind } from "./treasury";

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
type TreasuryDatabase = Omit<Database, "public"> & {
  public: Omit<Database["public"], "Tables" | "Functions"> & {
    Tables: Database["public"]["Tables"] & {
      financial_accounts: Table<FinancialAccount, NewAccount>;
      treasury_movements: Table<FinancialMovement, NewMovement, Partial<NewMovement> & { void_reason?: string; voided_at?: string }>;
      bank_reconciliations: Table<FinancialReconciliation, NewReconciliation>;
    };
    Functions: Database["public"]["Functions"] & {
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
    const { data, error } = await treasuryDb.from("financial_accounts")
      .select("*").order("created_at", { ascending: true });
    if (error) throw error;
    return (data ?? []).map((a) => ({ ...a, opening_balance: Number(a.opening_balance) }));
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
    const { data, error } = await treasuryDb.from("bank_reconciliations").select("*")
      .order("reconciliation_date", { ascending: false }).limit(500);
    if (error) throw error;
    return (data ?? []).map((r) => ({ ...r, statement_balance: Number(r.statement_balance),
      expected_balance: Number(r.expected_balance), difference: Number(r.difference) }));
  },
});
export const accountBalancesQuery = (accounts: FinancialAccount[], asOf: string) => queryOptions({
  queryKey: ["treasury", "balances", asOf, accounts.map((a) => a.id).join(",")],
  enabled: accounts.length > 0,
  queryFn: async () => {
    const pairs = await Promise.all(accounts.filter((a) => a.opening_date <= asOf).map(async (a) => {
      const { data, error } = await treasuryDb.rpc("financial_account_balance", {
        _account_id: a.id, _as_of: asOf, _confirmed_only: false,
      });
      if (error) throw error;
      return [a.id, Number(data)] as const;
    }));
    return Object.fromEntries(pairs) as Record<string, number>;
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
  const { error } = await treasuryDb.from("bank_reconciliations").insert(input);
  if (error) throw error;
}
