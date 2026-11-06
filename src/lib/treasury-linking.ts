/** Pré-validação para evitar vinculações silenciosas ou conciliações indevidas. */
export type PaidLinkCandidate = {
  id: string;
  status: string;
  paid_date: string | null;
  financial_account_id: string | null;
  reconciled_at: string | null;
};
export type AccountLinkTarget = {
  id: string;
  active: boolean;
  opening_date: string;
};
export function assertCanLinkPaidTransaction(
  transaction: PaidLinkCandidate,
  account: AccountLinkTarget,
  today: string,
): void {
  if (transaction.status !== "pago" || !transaction.paid_date) {
    throw new Error("Apenas lançamentos efetivamente pagos e datados podem ser vinculados.");
  }
  if (transaction.financial_account_id !== null || transaction.reconciled_at !== null) {
    throw new Error("Lançamento já possui vínculo bancário. Atualize a tela.");
  }
  if (!account.active || account.opening_date > transaction.paid_date) {
    throw new Error("Conta inativa ou aberta após a data do pagamento.");
  }
  if (transaction.paid_date > today) {
    throw new Error("A data de pagamento está no futuro. Revise o lançamento antes de vincular.");
  }
}
export function assertCanReconcilePaidTransaction(
  transaction: PaidLinkCandidate,
  today: string,
): void {
  if (transaction.status !== "pago" || !transaction.paid_date || !transaction.financial_account_id) {
    throw new Error("É necessário haver pagamento efetivo, data e conta vinculada.");
  }
  if (transaction.reconciled_at !== null) {
    throw new Error("Lançamento já conciliado. Atualize a tela.");
  }
  if (transaction.paid_date > today) {
    throw new Error("Não é possível conciliar um pagamento futuro.");
  }
}
