import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";
import { MonthlySheetImport } from "@/components/finance/MonthlySheetImport";
const state = vi.hoisted(() => ({
  errors: [] as string[],
  calls: [] as { dry: boolean; rows: unknown[] }[],
  created: false,
}));
const entries = [
  {
    source_key: "new",
    label: "Novo lançamento",
    sheet: "Entradas",
    row: 8,
    transactions: [
      {
        kind: "entrada",
        gross_amount: 100,
        net_amount: 98,
        competence_date: "2026-11-01",
        paid_date: null,
      },
    ],
  },
  {
    source_key: "possible",
    label: "Pagamento semelhante",
    sheet: "Saídas",
    row: 8,
    transactions: [
      {
        kind: "saida",
        gross_amount: 50,
        net_amount: 50,
        competence_date: "2026-11-01",
        paid_date: "2026-11-01",
      },
    ],
  },
];
vi.mock("@/lib/queries", () => ({
  cardSettingsQuery: () => ({ queryKey: ["settings"], queryFn: async () => ({}) }),
  myAccessQuery: () => ({ queryKey: ["access"], queryFn: async () => ({ roles: ["admin"] }) }),
}));
vi.mock("read-excel-file/browser", () => ({ default: async () => [] }));
vi.mock("@/lib/monthly-sheet", () => ({
  parseMonthlySheets: async () => ({ entries, errors: state.errors, month: "2026-11" }),
}));
vi.mock("@/lib/monthly-sheet-api", () => ({
  importMonthlySheet: async (rows: unknown[], _name: string, dry: boolean) => {
    state.calls.push({ dry, rows });
    if (!dry) state.created = true;
    return {
      rows: entries.map((e) => ({
        source_key: e.source_key,
        status: state.created ? "imported" : e.source_key === "new" ? "new" : "possible_duplicate",
      })),
      inserted: dry ? 0 : 2,
      dry_run: dry,
    };
  },
}));
afterEach(() => {
  cleanup();
  state.errors = [];
  state.calls = [];
  state.created = false;
});
async function mountAndUpload() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <MonthlySheetImport />
    </QueryClientProvider>,
  );
  const input = await screen.findByLabelText("Planilha do mês");
  await waitFor(() => expect(input).toBeEnabled());
  fireEvent.change(input, { target: { files: [new File(["test"], "mensal.xlsx")] } });
}
it("envia primeiro para conferência e só grava as linhas selecionadas após a confirmação", async () => {
  await mountAndUpload();
  const button = await screen.findByRole("button", { name: "Importar 1 linha(s) selecionada(s)" });
  expect(state.calls.every((c) => c.dry)).toBe(true);
  expect(screen.getByRole("checkbox", { name: "Importar Saídas linha 8" })).not.toBeChecked();
  fireEvent.click(screen.getByRole("checkbox", { name: "Importar Saídas linha 8" }));
  fireEvent.click(screen.getByRole("button", { name: "Importar 2 linha(s) selecionada(s)" }));
  await waitFor(() => expect(state.calls.some((c) => !c.dry)).toBe(true));
  const call = state.calls.find((c) => !c.dry)!;
  expect(call.rows[1]).toMatchObject({ source_key: "possible", allow_existing: true });
  expect(button).toBeDefined();
});
it("erro de preenchimento não pode ser ignorado pelo botão de conferir novamente", async () => {
  state.errors = ["Entradas · linha 9: Valor inválido."];
  await mountAndUpload();
  expect(await screen.findByRole("alert")).toHaveTextContent("Valor inválido");
  expect(state.calls).toHaveLength(0);
  expect(screen.queryByRole("button", { name: "Conferir novamente" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /Importar \d/ })).not.toBeInTheDocument();
});
