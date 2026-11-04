import { z } from "zod";
const month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
export const financialQuestionSchema = z
  .object({
    question: z.string().trim().min(3).max(1500),
    fromMonth: month,
    toMonth: month,
  })
  .refine((d) => {
    const months =
      (Number(d.toMonth.slice(0, 4)) - Number(d.fromMonth.slice(0, 4))) * 12 +
      Number(d.toMonth.slice(5)) -
      Number(d.fromMonth.slice(5));
    return months >= 0 && months < 12;
  }, "Selecione até 12 meses, em ordem cronológica.");
export type FinancialQuestion = z.infer<typeof financialQuestionSchema>;
