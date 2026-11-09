import { afterEach, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type { Txn } from "./finance";
import { overviewSnapshot } from "./overview";
import { loadOverview, overviewScope } from "./overview.server";

const row: Txn = {
  id: "one",
  kind: "entrada",
  description: "PRIVATE DESCRIPTION",
  person: "PRIVATE PATIENT",
  category_id: null,
  nature: null,
  payment_method: "pix",
  status: "pago",
  competence_date: "2026-10-01",
  due_date: "2026-10-02",
  paid_date: "2026-11-02",
  gross_amount: 100,
  fee_amount: 0,
  net_amount: 100,
  installment_number: 1,
  installment_total: 1,
  group_id: null,
  notes: "PRIVATE NOTE",
};
function database(rows: Txn[], admin = true) {
  const ranges: number[] = [];
  const scopes: string[] = [];
  const db = {
    from: (table: string) => {
      let offset = 0,
        limit = 1000;
      const b = {
        select: () => b,
        eq: () => b,
        or: (scope: string) => {
          scopes.push(scope);
          return b;
        },
        order: () => b,
        range: (from: number, to: number) => {
          offset = from;
          limit = to - from + 1;
          ranges.push(from);
          return b;
        },
        then: (resolve: (v: unknown) => unknown) =>
          Promise.resolve({
            data:
              table === "user_roles"
                ? admin
                  ? [{ role: "admin" }]
                  : []
                : rows.slice(offset, offset + limit),
            error: null,
          }).then(resolve),
      };
      return b;
    },
  } as unknown as SupabaseClient<Database>;
  return { db, ranges, scopes };
}
afterEach(() => vi.useRealTimers());
it("returns exact summaries across more than five thousand rows without exposing patient records", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-09T12:00:00-03:00"));
  const rows = Array.from({ length: 5001 }, (_, i) => ({
    ...row,
    id: String(i),
    net_amount: 100.1,
    gross_amount: 100.1,
  }));
  const fake = database(rows);
  const actual = await loadOverview(fake.db, "verified-user", "2026-11");
  expect(actual).toEqual(overviewSnapshot(rows, "2026-11", "2026-11-09"));
  expect(actual.cash.received).toBe(500600.1);
  expect(actual.composition.count).toBe(5001);
  expect(fake.ranges).toEqual([0, 1000, 2000, 3000, 4000, 5000]);
  expect(JSON.stringify(actual)).not.toMatch(/PRIVATE|PATIENT|DESCRIPTION|NOTE/);
});
it("retains old installments settled now, missing payment dates and outstanding old bills", () => {
  const scope = overviewScope("2026-11", "2026-11-09");
  expect(scope).toContain("paid_date.gte.2026-10-01,paid_date.lte.2026-11-30");
  expect(scope).toContain("and(status.eq.pago,paid_date.is.null)");
  expect(scope).toContain("and(status.eq.pendente,due_date.lte.2026-11-30)");
  const snapshot = overviewSnapshot(
    [
      row,
      {
        ...row,
        id: "old-bill",
        kind: "saida",
        status: "pendente",
        paid_date: null,
        due_date: "2025-01-01",
      },
    ],
    "2026-11",
    "2026-11-09",
  );
  expect(snapshot.cash.received).toBe(100);
  expect(snapshot.cash.priorToPay).toBe(100);
  expect(snapshot.alerts.find((a) => a.id === "overdue_bills")?.amount).toBe(100);
});
it("rejects a non-administrator before any transaction query", async () => {
  const fake = database([row], false);
  await expect(loadOverview(fake.db, "member", "2026-11")).rejects.toThrow("Sem permissão");
  expect(fake.ranges).toHaveLength(0);
});
it("flags sales with no registered competence expenses without changing the accounting result", () => {
  const current = { ...row, competence_date: "2026-11-01" };
  expect(overviewSnapshot([current], "2026-11", "2026-11-09").noExpenses).toBe(true);
  expect(
    overviewSnapshot(
      [current, { ...current, id: "expense", kind: "saida", status: "pendente" }],
      "2026-11",
      "2026-11-09",
    ).noExpenses,
  ).toBe(false);
});
