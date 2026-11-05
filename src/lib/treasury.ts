/**
 * Cálculos locais de tesouraria. Não alteram nem conciliam o banco.
 * Valores monetários são somados em centavos para evitar deriva de ponto flutuante.
 * A fonte autoritativa do saldo continua sendo public.financial_account_balance().
 */
export type TreasuryKind = "aporte" | "retirada" | "investimento" | "transferencia" | "financiamento" | "amortizacao";
export type TreasuryAccount = { id: string; opening_date: string; opening_balance: number };
export type TreasuryMovement = {
  account_id: string;
  destination_account_id: string | null;
  movement_date: string;
  kind: TreasuryKind;
  amount: number;
  voided_at: string | null;
};
export type TreasuryTransaction = {
  financial_account_id: string | null;
  status: string;
  kind: string;
  paid_date: string | null;
  due_date: string;
  net_amount: number;
  gross_amount: number;
  reconciled_at: string | null;
};

function cents(value: number): number {
  if (!Number.isFinite(value)) throw new Error("Valor financeiro inválido.");
  return Math.round(value * 100);
}
function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + "T00:00:00Z");
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/** Reproduz a semântica da função SQL para validação e pré-visualização. */
export function calculateAccountBalance(
  account: TreasuryAccount,
  asOf: string,
  transactions: readonly TreasuryTransaction[],
  movements: readonly TreasuryMovement[],
  confirmedOnly = false,
): number {
  if (!validDate(account.opening_date) || !validDate(asOf) || asOf < account.opening_date)
    throw new Error("Conta ou data de consulta inválida.");

  let total = cents(account.opening_balance);
  for (const transaction of transactions) {
    if (transaction.financial_account_id !== account.id || transaction.status !== "pago") continue;
    const date = transaction.paid_date ?? transaction.due_date;
    if (date < account.opening_date || date > asOf) continue;
    if (confirmedOnly && !transaction.reconciled_at) continue;
    total += transaction.kind === "entrada" ? cents(transaction.net_amount) : -cents(transaction.gross_amount);
  }
  for (const movement of movements) {
    if (movement.voided_at || movement.movement_date < account.opening_date || movement.movement_date > asOf) continue;
    if (movement.kind === "transferencia") {
      if (movement.account_id === account.id) total -= cents(movement.amount);
      if (movement.destination_account_id === account.id) total += cents(movement.amount);
    } else if (movement.account_id === account.id) {
      total += movement.kind === "aporte" || movement.kind === "financiamento" ? cents(movement.amount) : -cents(movement.amount);
    }
  }
  if (!Number.isSafeInteger(total)) throw new Error("Saldo excede o limite seguro de cálculo.");
  return total / 100;
}

/** Patrimônio não integra receita e despesa operacional da DRE. */
export function treasuryKindLabel(kind: TreasuryKind): string {
  return {
    aporte: "Aporte de capital",
    retirada: "Retirada",
    investimento: "Investimento",
    transferencia: "Transferência entre contas",
    financiamento: "Entrada de financiamento",
    amortizacao: "Amortização",
  }[kind];
}
