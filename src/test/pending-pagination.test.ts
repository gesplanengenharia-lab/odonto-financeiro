import { expect, it, vi } from "vitest";
import { pendingQuery } from "@/lib/queries";
import type { Txn } from "@/lib/finance";
const state = vi.hoisted(() => ({ ranges: [] as [number, number][], filters: [] as unknown[][] }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => {
      let from = 0,
        to = 0;
      const builder = {
        select: () => builder,
        order: () => builder,
        eq: (...args: unknown[]) => {
          state.filters.push(args);
          return builder;
        },
        range: (a: number, b: number) => {
          from = a;
          to = b;
          state.ranges.push([a, b]);
          return builder;
        },
        then: (resolve: (value: unknown) => unknown) =>
          Promise.resolve({
            data: Array.from({ length: Math.max(0, Math.min(to + 1, 5001) - from) }, (_, i) => ({
              id: String(from + i),
              gross_amount: "100.10",
              fee_amount: "0",
              net_amount: "100.10",
            })),
            error: null,
          }).then(resolve),
      };
      return builder;
    },
  },
}));
it("carrega todas as pendências acima de 5 mil sem truncar os totais", async () => {
  const query = pendingQuery();
  const rows = await (query.queryFn as unknown as (ctx: { signal: undefined }) => Promise<Txn[]>)({
    signal: undefined,
  });
  expect(rows).toHaveLength(5001);
  expect(rows[5000]!.id).toBe("5000");
  expect(rows[0]!.net_amount).toBe(100.1);
  expect(state.ranges).toHaveLength(6);
  expect(state.filters.every((args) => args[0] === "status" && args[1] === "pendente")).toBe(true);
});
