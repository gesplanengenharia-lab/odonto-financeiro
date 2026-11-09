import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { addDays, addMonths, monthRange, type Txn } from "./finance";
import { METRIC_COLUMNS, overviewSnapshot } from "./overview";

/** Bound settled/competence history; older open items and missing dates still matter. */
export function overviewScope(month: string, today: string) {
  const { start, end } = monthRange(month);
  const from = addMonths(start, -1);
  const pendingEnd = end > addDays(today, 7) ? end : addDays(today, 7);
  return `and(competence_date.gte.${from},competence_date.lte.${end}),and(status.eq.pago,paid_date.gte.${from},paid_date.lte.${end}),and(status.eq.pago,paid_date.is.null),and(status.eq.pendente,due_date.lte.${pendingEnd})`;
}
export async function loadOverview(db: SupabaseClient<Database>, userId: string, month: string) {
  const { data: roles, error: accessError } = await db
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);
  if (accessError || !roles?.some((r) => r.role === "admin"))
    throw new Error("Sem permissão para visualizar o painel.");
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const rows: Txn[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await db
      .from("transactions")
      .select(METRIC_COLUMNS)
      .or(overviewScope(month, today))
      .order("id")
      .range(offset, offset + 999);
    if (error) throw error;
    rows.push(
      ...(data ?? []).map(
        (t) =>
          ({
            ...t,
            gross_amount: Number(t.gross_amount),
            fee_amount: Number(t.fee_amount),
            net_amount: Number(t.net_amount),
          }) as Txn,
      ),
    );
    if (!data || data.length < 1000) break;
  }
  return overviewSnapshot(rows, month, today);
}
