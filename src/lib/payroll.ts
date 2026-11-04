import { z } from "zod";
import type { Txn } from "./finance";
const money = z.number().finite().min(0).max(999999999);
export const payrollSchema = z.object({
  source: z.literal("essencial-payroll-v1"),
  group: z.enum(["funcionario", "dentista"]),
  name: z.string().trim().min(1).max(120),
  role: z.string().trim().max(120),
  termination: money.default(0),
  vacation: money.default(0),
  base: money,
  additional: money,
  commission: money,
  bonus: money,
  discount: money,
});
export type Payroll = z.infer<typeof payrollSchema>;
export function readPayroll(txn: Txn): Payroll | null {
  if (txn.kind !== "saida" || !txn.notes) return null;
  try {
    const result = payrollSchema.safeParse(JSON.parse(txn.notes));
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

/** Reuse identity and recurring amounts only; never repeat one-off payments or settlement. */
export function nextPayrollMonth(payroll: Payroll): Payroll {
  return { ...payroll, commission: 0, bonus: 0, discount: 0, vacation: 0, termination: 0 };
}
