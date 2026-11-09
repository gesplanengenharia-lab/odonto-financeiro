export const METRIC_COLUMNS =
  "id,kind,category_id,nature,payment_method,status,competence_date,due_date,paid_date,gross_amount,fee_amount,net_amount,installment_total";

import {
  cashMargin,
  dashboardAlerts,
  dashboardMonth,
  defaultedReceivables,
  managementComparison,
  monthBilling,
  receiptComposition,
  type Txn,
} from "./finance";

/** Shared exact accounting rules: the transport returns summaries, never patient rows. */
export function overviewSnapshot(rows: Txn[], month: string, today: string) {
  const cash = dashboardMonth(rows, month, today);
  const billing = monthBilling(rows, month);
  return {
    cash,
    billing,
    composition: receiptComposition(rows, month),
    margin: cashMargin(cash.realized, cash.received),
    comparison: managementComparison(rows, month, today),
    overduePatients: defaultedReceivables(rows, month, false, today).total,
    alerts: dashboardAlerts(rows, today),
    noExpenses:
      billing.total > 0 &&
      !rows.some((t) => t.kind === "saida" && t.competence_date.slice(0, 7) === month),
  };
}
