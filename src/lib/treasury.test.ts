import { describe, expect, it } from "vitest";
import { calculateAccountBalance, treasuryKindLabel, type TreasuryMovement, type TreasuryTransaction } from "./treasury";

const account = { id: "conta-a", opening_date: "2026-11-01", opening_balance: 100 };
const other = { id: "conta-b", opening_date: "2026-11-01", opening_balance: 50 };
const paid = (patch: Partial<TreasuryTransaction> = {}): TreasuryTransaction => ({
  financial_account_id: "conta-a",
  status: "pago",
  kind: "entrada",
  paid_date: "2026-11-03",
  due_date: "2026-11-03",
  net_amount: 20.05,
  gross_amount: 21,
  reconciled_at: null,
  ...patch,
});
const movement = (patch: Partial<TreasuryMovement>): TreasuryMovement => ({
  account_id: "conta-a",
  destination_account_id: null,
  movement_date: "2026-11-03",
  kind: "aporte",
  amount: 10,
  voided_at: null,
  ...patch,
});

describe("saldo de tesouraria: cálculo isolado", () => {
  it("soma entradas líquidas e subtrai saídas brutas sem antecipar pendências", () => {
    const rows = [
      paid(),
      paid({ kind: "saida", gross_amount: 7.03, net_amount: 6 }),
      paid({ status: "pendente", net_amount: 900 }),
      paid({ paid_date: "2026-12-01", net_amount: 200 }),
      paid({ financial_account_id: null, net_amount: 300 }),
    ];
    expect(calculateAccountBalance(account, "2026-11-05", rows, [])).toBe(113.02);
  });

  it("não conta baixas automáticas como conciliadas", () => {
    const rows = [paid(), paid({ net_amount: 4, reconciled_at: "2026-11-04T10:00:00Z" })];
    expect(calculateAccountBalance(account, "2026-11-05", rows, [], true)).toBe(104);
    expect(calculateAccountBalance(account, "2026-11-05", rows, [])).toBe(124.05);
  });

  it("transferências afetam as duas contas uma única vez e não são receita", () => {
    const movements = [movement({ kind: "transferencia", amount: 12.45, destination_account_id: other.id })];
    expect(calculateAccountBalance(account, "2026-11-05", [], movements)).toBe(87.55);
    expect(calculateAccountBalance(other, "2026-11-05", [], movements)).toBe(62.45);
  });

  it("ignora movimentos cancelados e respeita datas iniciais", () => {
    const movements = [
      movement({ kind: "aporte", amount: 50, voided_at: "2026-11-04T00:00:00Z" }),
      movement({ kind: "aporte", amount: 25, movement_date: "2026-10-31" }),
      movement({ kind: "retirada", amount: 3.23 }),
      movement({ kind: "financiamento", amount: 8 }),
      movement({ kind: "amortizacao", amount: 2 }),
      movement({ kind: "investimento", amount: 5 }),
    ];
    expect(calculateAccountBalance(account, "2026-11-05", [], movements)).toBe(97.77);
  });

  it("rejeita datas inválidas e valores não finitos", () => {
    expect(() => calculateAccountBalance(account, "2026-02-30", [], [])).toThrow();
    expect(() => calculateAccountBalance(account, "2026-10-31", [], [])).toThrow();
    expect(() => calculateAccountBalance({ ...account, opening_balance: Infinity }, "2026-11-05", [], [])).toThrow();
  });

  it("identifica movimentos patrimoniais separadamente da DRE", () => {
    expect(treasuryKindLabel("aporte")).toBe("Aporte de capital");
    expect(treasuryKindLabel("transferencia")).toBe("Transferência entre contas");
  });
});
