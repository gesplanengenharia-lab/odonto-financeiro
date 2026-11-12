import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";
import { ClinicDre } from "@/components/finance/ClinicDre";
import { CLINIC_DRE_LINES } from "@/lib/clinic-dre";
const state = vi.hoisted(() => ({ payload: null as Record<string, unknown> | null, error: false }));
const rows = [
  {
    id: "original",
    kind: "saida",
    description: "Pagamento sem identificação",
    person: null,
    category_id: null,
    nature: "variavel",
    payment_method: "pix",
    status: "pago",
    competence_date: "2026-09-01",
    due_date: "2026-10-05",
    paid_date: "2026-11-06",
    gross_amount: 200,
    net_amount: 200,
    fee_amount: 0,
    notes: JSON.stringify({ reconciliation: { source: "original" } }),
  },
];
vi.mock("@/lib/queries", () => ({
  txnsByCompetenceQuery: (from: string, to: string) => ({
    queryKey: ["txns", "competence", from, to],
    queryFn: async () => {
      if (state.error) throw new Error("Falha de consulta");
      return rows;
    },
  }),
  categoriesQuery: () => ({ queryKey: ["categories"], queryFn: async () => [] }),
  myAccessQuery: () => ({
    queryKey: ["access"],
    queryFn: async () => ({ roles: ["admin"], user: { id: "admin" } }),
  }),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => {
      const builder = {
        update: (payload: Record<string, unknown>) => {
          state.payload = payload;
          return builder;
        },
        eq: () => builder,
        is: () => builder,
        select: async () => ({ data: [{ id: "original" }], error: null }),
      };
      return builder;
    },
  },
}));
afterEach(() => {
  cleanup();
  state.payload = null;
  state.error = false;
});
function mount() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <ClinicDre month="2026-11" />
    </QueryClientProvider>,
  );
}
it("exibe a estrutura exata e abre a composição no mês de referência", async () => {
  mount();
  const table = await screen.findByRole("table");
  const labels = within(table)
    .getAllByRole("rowheader")
    .map((h) => h.textContent?.replace("*", ""));
  expect(labels).toEqual([...CLINIC_DRE_LINES.map(([, label]) => label), "LUCRO"]);
  fireEvent.click(screen.getByRole("button", { name: "Detalhar DEMAIS DESPESAS em set/26" }));
  const details = screen.getByRole("region", { name: "Lançamentos da linha" });
  expect(within(details).getAllByText("Pagamento sem identificação")).toHaveLength(2);
  expect(within(details).getByText("06/11/2026")).toBeInTheDocument();
});
it("corrige referência e linha preservando o pagamento, valores e histórico", async () => {
  mount();
  fireEvent.click(
    await screen.findByRole("button", { name: "Detalhar DEMAIS DESPESAS em set/26" }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Ajustar referência / linha" }));
  fireEvent.change(screen.getByLabelText("Mês de referência"), { target: { value: "2026-08" } });
  fireEvent.change(screen.getByRole("combobox", { name: "Linha do DRE" }), {
    target: { value: "pro_labore" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Salvar referência e linha" }));
  await waitFor(() => expect(state.payload).not.toBeNull());
  expect(state.payload?.["competence_date"]).toBe("2026-08-01");
  expect(state.payload).not.toHaveProperty("paid_date");
  expect(state.payload).not.toHaveProperty("gross_amount");
  expect(JSON.parse(state.payload?.["notes"] as string)).toMatchObject({
    reconciliation: { source: "original" },
    clinic_dre_line: "pro_labore",
  });
});
it("falha de consulta não apresenta totais zerados como se estivessem conferidos", async () => {
  state.error = true;
  mount();
  expect(await screen.findByRole("alert")).toHaveTextContent("Não foi possível carregar");
  expect(screen.queryByRole("table")).not.toBeInTheDocument();
});
