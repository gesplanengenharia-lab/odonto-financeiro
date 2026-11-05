import { describe, expect, it } from "vitest";
import { assertCanLinkPaidTransaction, assertCanReconcilePaidTransaction, type PaidLinkCandidate } from "./treasury-linking";
const today = "2026-11-05";
const txn: PaidLinkCandidate = { id: "t1", status: "pago", paid_date: "2026-11-04", financial_account_id: null, reconciled_at: null };
const account = { id: "a1", active: true, opening_date: "2026-11-01" };

describe("vínculo bancário consciente", () => {
  it("permite vincular pagamento ocorrido após a abertura da conta", () => {
    expect(() => assertCanLinkPaidTransaction(txn, account, today)).not.toThrow();
  });
  it("impede pendências, baixa sem data e pagamentos futuros", () => {
    expect(() => assertCanLinkPaidTransaction({ ...txn, status: "pendente" }, account, today)).toThrow();
    expect(() => assertCanLinkPaidTransaction({ ...txn, paid_date: null }, account, today)).toThrow();
    expect(() => assertCanLinkPaidTransaction({ ...txn, paid_date: "2026-11-06" }, account, today)).toThrow();
  });
  it("impede conta inativa ou aberta depois do pagamento", () => {
    expect(() => assertCanLinkPaidTransaction(txn, { ...account, active: false }, today)).toThrow();
    expect(() => assertCanLinkPaidTransaction(txn, { ...account, opening_date: "2026-11-05" }, today)).toThrow();
  });
  it("impede reatribuir automaticamente contas de lançamentos conciliados ou já vinculados", () => {
    expect(() => assertCanLinkPaidTransaction({ ...txn, financial_account_id: "a1" }, account, today)).toThrow();
    expect(() => assertCanLinkPaidTransaction({ ...txn, reconciled_at: "2026-11-05T10:00:00Z" }, account, today)).toThrow();
  });
});
describe("conciliação manual", () => {
  const linked = { ...txn, financial_account_id: "a1" };
  it("aceita pagamento efetivo vinculado sem confirmação", () => {
    expect(() => assertCanReconcilePaidTransaction(linked, today)).not.toThrow();
  });
  it("rejeita dupla conciliação e pagamentos sem conta ou sem data", () => {
    expect(() => assertCanReconcilePaidTransaction(txn, today)).toThrow();
    expect(() => assertCanReconcilePaidTransaction({ ...linked, paid_date: null }, today)).toThrow();
    expect(() => assertCanReconcilePaidTransaction({ ...linked, reconciled_at: "2026-11-05T12:00:00Z" }, today)).toThrow();
    expect(() => assertCanReconcilePaidTransaction({ ...linked, paid_date: "2026-11-06" }, today)).toThrow();
  });
});
