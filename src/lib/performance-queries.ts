import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { METRIC_COLUMNS } from "./overview";
import { getOverview } from "./overview.functions";
import { addDays, addMonths, monthRange, type AccountFilters, type Txn } from "./finance";
import type { Database, Json } from "@/integrations/supabase/types";
import type { SupabaseClient } from "@supabase/supabase-js";

export const overviewQuery = (month: string) =>
  queryOptions({
    queryKey: ["txns", "overview", month],
    queryFn: () => getOverview({ data: { month } }),
    staleTime: 60_000,
  });
export type AccountsPage = {
  rows: Txn[];
  count: number;
  total: number;
  overdue: number;
  nextWeek: number;
};
type PerformanceDatabase = Omit<Database, "public"> & {
  public: Omit<Database["public"], "Functions"> & {
    Functions: Database["public"]["Functions"] & {
      finance_accounts_page: {
        Args: { _filters: Json; _search: string; _page: number; _today: string };
        Returns: Json;
      };
    };
  };
};
const db = supabase as unknown as SupabaseClient<PerformanceDatabase>;
export const accountsPageQuery = (
  filters: AccountFilters,
  search: string,
  page: number,
  today: string,
) =>
  queryOptions({
    queryKey: ["txns", "accounts-page", filters, search, page, today],
    staleTime: 30_000,
    queryFn: async ({ signal }) => {
      const { data, error } = await db
        .rpc("finance_accounts_page", {
          _filters: filters as Json,
          _search: search.trim(),
          _page: page,
          _today: today,
        })
        .abortSignal(signal);
      if (error) throw error;
      return data as unknown as AccountsPage;
    },
  });

/** Only rows relevant to the active analysis. Cash follows paid_date, never due_date alone. */
export function analysisScope(view: string, month: string, today: string, day: string) {
  const { start, end } = monthRange(month);
  const paid = (from: string, to: string) =>
    `and(status.eq.pago,paid_date.gte.${from},paid_date.lte.${to}),and(status.eq.pago,paid_date.is.null,due_date.gte.${from},due_date.lte.${to})`;
  if (view === "evolucao") {
    const from = addMonths(start, -5);
    return `and(competence_date.gte.${from},competence_date.lte.${end}),${paid(from, end)}`;
  }
  if (view === "previsao90") return `and(status.eq.pendente,due_date.lte.${addDays(today, 89)})`;
  if (view === "diario")
    return `${paid(day, day)},and(payment_method.in.(credito,debito),competence_date.eq.${day}),and(status.eq.pago,paid_date.is.null)`;
  const pendingEnd = end > addDays(today, 7) ? end : addDays(today, 7);
  return `${paid(start, end)},and(status.eq.pendente,due_date.lte.${pendingEnd})`;
}
export const analysisRowsQuery = (view: string, month: string, today: string, day: string) =>
  queryOptions({
    queryKey: ["txns", "analysis", analysisScope(view, month, today, day)],
    staleTime: 60_000,
    queryFn: async ({ signal }) => {
      const rows: Txn[] = [];
      for (let offset = 0; ; offset += 1000) {
        const selected =
          view === "evolucao" || view === "previsao90"
            ? supabase.from("transactions").select(METRIC_COLUMNS)
            : supabase.from("transactions").select("*");
        const { data, error } = await selected
          .or(analysisScope(view, month, today, day))
          .order("id")
          .range(offset, offset + 999)
          .abortSignal(signal);
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
        if (!data || data.length < 1000) return rows;
      }
    },
  });
