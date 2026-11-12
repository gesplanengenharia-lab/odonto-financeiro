import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";
import { ClinicGoals } from "@/components/finance/ClinicGoals";
import type { ClinicGoalConfig } from "@/lib/goals-queries";
import type { ClinicGoalTargets } from "@/lib/finance";
const state = vi.hoisted(() => ({
  configs: {} as Record<string, ClinicGoalConfig>,
  saves: [] as unknown[][],
  fail: false,
}));
vi.mock("@/lib/finance", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/finance")>()),
  todayISO: () => "2026-11-12",
}));
vi.mock("@/lib/goals-queries", () => ({
  clinicGoalsQuery: (month: string) => ({
    queryKey: ["clinic-goals", month],
    queryFn: async () => {
      if (state.fail) throw new Error("Sem conexão");
      return state.configs[month] ?? null;
    },
  }),
  saveClinicGoals: async (
    month: string,
    goals: ClinicGoalTargets,
    before: ClinicGoalConfig | null,
  ) => {
    state.saves.push([month, goals, before]);
    state.configs[month] = {
      ...goals,
      id: "new",
      month: month + "-01",
      version: 1,
      updated_at: "now",
      updated_by: "admin",
    };
  },
}));
vi.mock("@/lib/performance-queries", () => ({
  analysisRowsQuery: () => ({
    queryKey: ["txns", "cash"],
    queryFn: async () => [
      {
        id: "receipt",
        kind: "entrada",
        status: "pago",
        paid_date: "2026-11-06",
        competence_date: "2026-09-01",
        due_date: "2026-11-06",
        net_amount: 500,
        gross_amount: 500,
        fee_amount: 0,
      },
    ],
  }),
}));
vi.mock("@/lib/queries", () => ({
  myAccessQuery: () => ({
    queryKey: ["access"],
    queryFn: async () => ({ roles: ["admin"], user: { id: "admin" } }),
  }),
  txnsByCompetenceQuery: () => ({
    queryKey: ["txns", "expenses"],
    queryFn: async () => [
      {
        id: "expense",
        kind: "saida",
        status: "pago",
        competence_date: "2026-11-01",
        gross_amount: 100000,
        description: "Aluguel",
        category_id: null,
        notes: null,
      },
    ],
  }),
}));
afterEach(() => {
  cleanup();
  state.configs = {};
  state.saves = [];
  state.fail = false;
});
function mount() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <ClinicGoals month="2026-11" />
    </QueryClientProvider>,
  );
}
it("sugestão preenche apenas o planejamento e salva no mês selecionado", async () => {
  mount();
  fireEvent.click(await screen.findByRole("button", { name: "Definir metas do mês" }));
  const suggest = screen.getByRole("button", { name: "Sugerir metas pelas despesas" });
  await waitFor(() => expect(suggest).toBeEnabled());
  fireEvent.click(suggest);
  expect(screen.getByLabelText("Clínica se paga (R$)")).toHaveValue(100000);
  expect(state.saves).toHaveLength(0);
  fireEvent.click(screen.getByRole("button", { name: "Salvar metas deste mês" }));
  await waitFor(() => expect(state.saves).toHaveLength(1));
  expect(state.saves[0]).toEqual([
    "2026-11",
    { break_even: 100000, target: 120000, super_target: 150000, mega_target: 200000 },
    null,
  ]);
  expect(await screen.findByRole("progressbar", { name: "Meta" })).toHaveAttribute("aria-valuenow");
});
it("metas do mês anterior não se aplicam ao mês atual sem uma cópia explícita", async () => {
  state.configs["2026-10"] = {
    id: "oct",
    month: "2026-10-01",
    break_even: 1000,
    target: 1500,
    super_target: 2000,
    mega_target: 2500,
    version: 3,
    updated_at: "",
    updated_by: null,
  };
  mount();
  expect(await screen.findByText(/Nenhuma meta salva nesta referência/)).toBeInTheDocument();
  expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Definir metas do mês" }));
  fireEvent.click(await screen.findByRole("button", { name: "Copiar metas de out/26" }));
  expect(screen.getByLabelText("Meta (R$)", { exact: true })).toHaveValue(1500);
  expect(state.saves).toHaveLength(0);
});
it("edição mantém a versão do planejamento aberto para impedir sobrescrita silenciosa", async () => {
  const before = {
    id: "nov",
    month: "2026-11-01",
    break_even: 1000,
    target: 1500,
    super_target: 2000,
    mega_target: 2500,
    version: 7,
    updated_at: "",
    updated_by: null,
  };
  state.configs["2026-11"] = before;
  mount();
  fireEvent.click(await screen.findByRole("button", { name: "Editar metas do mês" }));
  fireEvent.change(screen.getByLabelText("Mega Meta (R$)"), { target: { value: "3000" } });
  fireEvent.click(screen.getByRole("button", { name: "Salvar metas deste mês" }));
  await waitFor(() => expect(state.saves).toHaveLength(1));
  expect(state.saves[0]?.[2]).toEqual(before);
  expect((state.saves[0]?.[1] as ClinicGoalTargets).mega_target).toBe(3000);
});
it("falha na consulta não apresenta progresso zerado nem permite definir um substituto", async () => {
  state.fail = true;
  mount();
  expect(await screen.findByRole("alert")).toHaveTextContent("Não foi possível carregar");
  expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Definir metas do mês" })).toBeDisabled();
});
