import { beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";

type Row = Record<string, unknown>;
const fake = vi.hoisted(() => ({
  rows: {} as Record<string, Row[]>, error: null as Error | null,
  rpcValue: 0 as unknown, writes: 0,
  ranges: [] as [string, number, number][],
}));

// Evaluate the actual PostgREST filters against a row changed after the UI read.
// No network, real credentials or clinic data are used.
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  auth: { getUser: async () => ({ data: { user: { id: "admin" } }, error: null }) },
  rpc: async () => ({ data: fake.rpcValue, error: fake.error }),
  from: (table: string) => {
    let patch: Row | null = null;
    let start = 0, end = Infinity;
    const filters: ((row: Row) => boolean)[] = [];
    const execute = () => {
      if (fake.error) return { data: null, error: fake.error };
      const data = (fake.rows[table] ?? []).filter(row => filters.every(f => f(row))).slice(start, end + 1);
      if (patch) for (const row of data) { Object.assign(row, patch); fake.writes++; }
      return { data, error: null };
    };
    const q = {
      select: () => q, order: () => q,
      update: (value: Row) => { patch = value; return q; },
      eq: (key: string, value: unknown) => { filters.push(row => row[key] === value); return q; },
      is: (key: string, value: unknown) => { filters.push(row => row[key] === value); return q; },
      not: (key: string, _op: string, value: unknown) => { filters.push(row => row[key] !== value); return q; },
      in: (key: string, values: unknown[]) => { filters.push(row => values.includes(row[key])); return q; },
      range: (from: number, to: number) => { start = from; end = to; fake.ranges.push([table, from, to]); return q; },
      maybeSingle: async () => { const r = execute(); return { ...r, data: r.data?.[0] ?? null }; },
      then: (resolve: (value: ReturnType<typeof execute>) => unknown) => Promise.resolve(execute()).then(resolve),
    };
    return q;
  },
} }));

import {
  accountsQuery, accountBalancesQuery, paidFinancialTransactionsQuery, treasuryReadyQuery,
  linkPaidFinancialTransaction, confirmPaidFinancialTransaction,
  type PaidFinancialTransaction, type FinancialAccount,
} from "./treasury-api";
import { useTxnMutations } from "./queries";

const txn: PaidFinancialTransaction = {
  id: "transaction", kind: "entrada", description: "Recebimento de teste", person: "Paciente de teste",
  payment_method: "pix", fee_amount: 0, gross_amount: 100, net_amount: 100,
  due_date: "2026-08-01", paid_date: "2026-08-01", status: "pago",
  financial_account_id: null, reconciled_at: null, reconciled_by: null,
};
const account: FinancialAccount = {
  id: "account", name: "Conta de teste", kind: "banco", currency: "BRL", active: true,
  opening_date: "2026-08-01", opening_balance: 10, created_by: "admin", created_at: "2026-08-01",
};
const queryClient = () => new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });

beforeEach(() => {
  fake.rows = { transactions: [{ ...txn }], user_roles: [{ user_id: "admin", role: "admin", allowed_modules: [] }], profiles: [{ id: "admin", full_name: "Teste" }] };
  fake.error = null; fake.rpcValue = 0; fake.writes = 0; fake.ranges = [];
});

describe("concorrência na vinculação e conciliação", () => {
  it.each([
    ["kind", "saida"], ["person", "Outra pessoa"], ["description", "Outra operação"],
    ["due_date", "2026-08-02"], ["payment_method", "dinheiro"], ["fee_amount", 1],
    ["gross_amount", 101], ["net_amount", 99], ["status", "pendente"], ["paid_date", "2026-08-02"],
  ])("recusa vínculo e confirmação quando %s mudou", async (field, value) => {
    fake.rows["transactions"] = [{ ...txn, [field]: value }];
    await expect(linkPaidFinancialTransaction({ transaction: txn, account })).rejects.toThrow(/mudou/);
    const linked = { ...txn, financial_account_id: account.id };
    fake.rows["transactions"] = [{ ...linked, [field]: value }];
    await expect(confirmPaidFinancialTransaction(linked)).rejects.toThrow(/alterada/);
    expect(fake.writes).toBe(0);
  });

  it.each([null, "Paciente de teste"])("preserva valores e datas ao vincular paciente %s", async (person) => {
    const original = { ...txn, person };
    fake.rows["transactions"] = [{ ...original }];
    await linkPaidFinancialTransaction({ transaction: original, account });
    expect(fake.rows["transactions"]?.[0]).toEqual({ ...original, financial_account_id: account.id });
    await confirmPaidFinancialTransaction({ ...original, financial_account_id: account.id });
    expect(fake.rows["transactions"]?.[0]).toEqual({
      ...original, financial_account_id: account.id, reconciled_by: "admin", reconciled_at: expect.any(String),
    });
  });

  it("recusa confirmação duplicada e nova atribuição após atualização concorrente", async () => {
    fake.rows["transactions"] = [{ ...txn, financial_account_id: "outra-conta" }];
    await expect(linkPaidFinancialTransaction({ transaction: txn, account })).rejects.toThrow();
    const linked = { ...txn, financial_account_id: account.id };
    fake.rows["transactions"] = [{ ...linked, reconciled_at: "2026-08-02", reconciled_by: "outro-admin" }];
    await expect(confirmPaidFinancialTransaction(linked)).rejects.toThrow();
    expect(fake.writes).toBe(0);
  });

  it("propaga negativa do banco sem anunciar sucesso", async () => {
    fake.error = new Error("permission denied");
    await expect(linkPaidFinancialTransaction({ transaction: txn, account })).rejects.toThrow("permission denied");
    expect(fake.writes).toBe(0);
  });
});

describe("consultas financeiras sem omissões ou zeros artificiais", () => {
  it.each([null, "", false, "invalido", Infinity])("recusa retorno de saldo inválido: %s", async (value) => {
    fake.rpcValue = [{ id: account.id, posted: value, confirmed: 0 }];
    await expect(queryClient().fetchQuery(accountBalancesQuery([account], "2026-08-01"))).rejects.toThrow(/saldo inválido/);
  });

  it("aceita zero real e valor numérico retornado pelo PostgreSQL", async () => {
    for (const value of [0, "123.45"]) {
      fake.rpcValue = [{ id: account.id, posted: value, confirmed: value }];
      expect(await queryClient().fetchQuery(accountBalancesQuery([account], "2026-08-01"))).toEqual({ posted: { account: Number(value) }, confirmed: { account: Number(value) } });
    }
  });

  it.each([[], null, [{ id: "outra-conta", posted: 10, confirmed: 10 }], [{ id: "account", posted: 10 }]])("recusa conjunto de saldos incompleto ou incorreto", async (value) => {
    fake.rpcValue = value;
    await expect(queryClient().fetchQuery(accountBalancesQuery([account], "2026-08-01"))).rejects.toThrow(/saldo inválido/);
  });

  it("não transforma conta ainda não aberta em saldo zero", async () => {
    fake.rpcValue = [{ id: account.id, posted: null, confirmed: null }];
    expect(await queryClient().fetchQuery(accountBalancesQuery([account], "2026-07-31"))).toEqual({ posted: {}, confirmed: {} });
  });

  it("não libera tesouraria com apenas a estrutura v1", async () => {
    fake.rows["financial_schema_versions"] = [{ version: 1 }];
    expect(await queryClient().fetchQuery(treasuryReadyQuery())).toBe(false);
    fake.rows["financial_schema_versions"].push({ version: 2 });
    expect(await queryClient().fetchQuery(treasuryReadyQuery())).toBe(true);
  });

  it("não trunca contas nem pagamentos na primeira página", async () => {
    fake.rows["financial_accounts"] = Array.from({ length: 1001 }, (_, i) => ({ ...account, id: String(i) }));
    fake.rows["transactions"] = Array.from({ length: 1001 }, (_, i) => ({ ...txn, id: String(i) }));
    expect(await queryClient().fetchQuery(accountsQuery())).toHaveLength(1001);
    expect(await queryClient().fetchQuery(paidFinancialTransactionsQuery())).toHaveLength(1001);
    expect(fake.ranges.filter(([table]) => table === "financial_accounts")).toHaveLength(3);
  });
});

it("invalidates tesouraria e operações após desfazer uma baixa", async () => {
  const client = queryClient();
  client.setQueryData(["treasury", "balances"], { account: 110 });
  client.setQueryData(["txns", "due"], [txn]);
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  const { result, unmount } = renderHook(() => useTxnMutations(), { wrapper });
  await act(async () => { await result.current.setPaid.mutateAsync({ ids: [txn.id], paid: false }); });
  expect(client.getQueryState(["treasury", "balances"])?.isInvalidated).toBe(true);
  expect(client.getQueryState(["txns", "due"])?.isInvalidated).toBe(true);
  expect(fake.rows["transactions"]?.[0]).toMatchObject({ status: "pendente", paid_date: null, auto_settle: false });
  unmount(); client.clear();
});
