import { afterEach, expect, it, vi } from "vitest";
import { saveClinicGoals, type ClinicGoalConfig } from "./goals-queries";
const state = vi.hoisted(() => ({
  filters: [] as unknown[][],
  writes: 0,
  data: [{ id: "goals" }] as unknown[],
  error: null as null | { code: string },
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => {
      const builder = {
        insert: () => {
          state.writes++;
          return builder;
        },
        update: () => {
          state.writes++;
          return builder;
        },
        eq: (...args: unknown[]) => {
          state.filters.push(args);
          return builder;
        },
        select: async () => ({ data: state.data, error: state.error }),
      };
      return builder;
    },
  },
}));
const goals = { break_even: 1000, target: 1500, super_target: 2000, mega_target: 2500 };
const before: ClinicGoalConfig = {
  ...goals,
  id: "goals",
  month: "2026-11-01",
  version: 7,
  updated_at: "",
  updated_by: null,
};
afterEach(() => {
  state.filters = [];
  state.writes = 0;
  state.data = [{ id: "goals" }];
  state.error = null;
});
it("vincula atualização ao ID, mês e versão que foram abertos na edição", async () => {
  await saveClinicGoals("2026-11", goals, before);
  expect(state.filters).toEqual([
    ["id", "goals"],
    ["month", "2026-11-01"],
    ["version", 7],
  ]);
});
it("uma edição concorrente não recebe mensagem de sucesso", async () => {
  state.data = [];
  await expect(saveClinicGoals("2026-11", goals, before)).rejects.toThrow(
    "mudaram enquanto você editava",
  );
});
it("duas criações simultâneas não sobrescrevem o planejamento de outro usuário", async () => {
  state.error = { code: "23505" };
  await expect(saveClinicGoals("2026-11", goals, null)).rejects.toThrow("Outro usuário já definiu");
});
it("metas fora de ordem não chegam ao banco", async () => {
  await expect(saveClinicGoals("2026-11", { ...goals, target: 1000 }, null)).rejects.toThrow();
  expect(state.writes).toBe(0);
});
