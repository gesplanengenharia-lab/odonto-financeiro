import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";
import { Route } from "@/routes/_authenticated/colaboradores";
import type { Txn } from "@/lib/finance";

const state = vi.hoisted(() => ({ payload: null as Record<string, unknown> | null }));
vi.mock("@/hooks/use-financial-month", () => ({ useFinancialMonth: () => ["2026-11", vi.fn()] }));
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: unknown) => ({ options }),
}));
const payroll = {
  source: "essencial-payroll-v1",
  group: "funcionario",
  name: "Lidiane",
  role: "CRC",
  base: 100,
  additional: 0,
  commission: 0,
  bonus: 0,
  discount: 0,
};
const rows = [
  {
    id: "nov-payment",
    kind: "saida",
    description: "Funcionário: Lidiane",
    person: "Lidiane",
    category_id: null,
    nature: "fixa",
    payment_method: "pix",
    status: "pago",
    competence_date: "2026-09-01",
    due_date: "2026-10-05",
    paid_date: "2026-11-06",
    gross_amount: 100,
    net_amount: 100,
    fee_amount: 0,
    notes: JSON.stringify({ ...payroll, reconciliation: { reference: "original" } }),
  },
  {
    id: "oct-payment",
    kind: "saida",
    status: "pago",
    competence_date: "2026-11-01",
    paid_date: "2026-10-30",
    gross_amount: 200,
    notes: JSON.stringify({ ...payroll, name: "Dentista outubro", group: "dentista", base: 200 }),
  },
  {
    id: "pending",
    kind: "saida",
    status: "pendente",
    competence_date: "2026-11-01",
    paid_date: null,
    gross_amount: 300,
    notes: JSON.stringify({ ...payroll, name: "Pendente novembro", base: 300 }),
  },
] as Txn[];
vi.mock("@/lib/queries", () => ({
  txnsByPaidQuery: (from: string, to: string) => ({
    queryKey: ["txns", "paid", from, to],
    queryFn: async () =>
      rows.filter(
        (t) => t.status === "pago" && t.paid_date && t.paid_date >= from && t.paid_date <= to,
      ),
  }),
  txnsByCompetenceQuery: (from?: string, to?: string) => ({
    queryKey: ["txns", "competence", from ?? "", to ?? ""],
    queryFn: async () =>
      rows.filter((t) => (!from || t.competence_date >= from) && (!to || t.competence_date <= to)),
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
        select: async () => ({ data: [{ id: "nov-payment" }], error: null }),
      };
      return builder;
    },
  },
}));
afterEach(() => {
  cleanup();
  state.payload = null;
});
function mount() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const Page = Route.options.component as () => React.ReactNode;
  render(
    <QueryClientProvider client={client}>
      <Page />
    </QueryClientProvider>,
  );
}
it("mostra em novembro apenas o pagamento efetivo, mesmo com competência de setembro", async () => {
  mount();
  expect(await screen.findByText("Lidiane")).toBeInTheDocument();
  expect(screen.getByText("09/2026")).toBeInTheDocument();
  expect(screen.queryByText("Dentista outubro")).not.toBeInTheDocument();
  expect(screen.queryByText("Pendente novembro")).not.toBeInTheDocument();
  fireEvent.change(screen.getByRole("combobox", { name: "Organizar por" }), {
    target: { value: "competence" },
  });
  expect(await screen.findByText("Pendente novembro")).toBeInTheDocument();
  expect(screen.getByText("Dentista outubro")).toBeInTheDocument();
});
it("editar pela data do pagamento preserva competência e histórico de conferência", async () => {
  mount();
  fireEvent.click(await screen.findByRole("button", { name: "Editar" }));
  fireEvent.click(screen.getByRole("button", { name: "Salvar neste mês" }));
  await waitFor(() => expect(state.payload).not.toBeNull());
  expect(state.payload?.["competence_date"]).toBe("2026-09-01");
  expect(state.payload?.["paid_date"]).toBe("2026-11-06");
  expect(JSON.parse(state.payload?.["notes"] as string).reconciliation).toEqual({
    reference: "original",
  });
});
