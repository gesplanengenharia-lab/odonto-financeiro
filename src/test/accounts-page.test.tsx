import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { ComponentType } from "react";
const state = vi.hoisted(() => ({
  filters: { kind: "entrada", month: "2026-11" },
  pending: false,
}));
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: { component: ComponentType }) => ({
    options,
    useSearch: () => state.filters,
    useNavigate: () => vi.fn(),
  }),
}));
vi.mock("@/lib/performance-queries", () => ({
  accountsPageQuery: (_filters: unknown, _search: string, page: number) => ({ page }),
}));
vi.mock("@tanstack/react-query", () => ({
  useQuery: ({ page }: { page: number }) => ({
    data: state.pending
      ? undefined
      : {
          rows: Array.from({ length: page === 0 ? 50 : 5 }, (_, i) => ({
            id: String(page * 50 + i),
          })),
          count: 55,
          total: 22418.79,
          overdue: 0,
          nextWeek: 6829.83,
        },
    isPending: state.pending,
    isError: false,
    isFetching: false,
    refetch: vi.fn(),
  }),
}));
vi.mock("@/components/finance/LaunchDialog", () => ({
  NativeSelect: ({ children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) => (
    <select {...props}>{children}</select>
  ),
}));
vi.mock("@/components/finance/TxnTable", () => ({
  TxnTable: ({ rows }: { rows: unknown[] }) => (
    <div data-testid="page-rows">{rows.length} registros exibidos</div>
  ),
}));
import { Route } from "@/routes/_authenticated/contas";
const Page = Route.options.component as ComponentType;
afterEach(() => {
  cleanup();
  state.pending = false;
  state.filters = { kind: "entrada", month: "2026-11" };
});
it("paginates 50 and 5 records while maintaining the total for all 55", () => {
  render(<Page />);
  expect(screen.getByTestId("page-rows")).toHaveTextContent("50 registros");
  expect(screen.getByText("R$ 22.418,79", { exact: false })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Próxima" }));
  expect(screen.getByTestId("page-rows")).toHaveTextContent("5 registros");
  expect(screen.getByText(/51–55 de 55/)).toBeInTheDocument();
  expect(screen.getByText("R$ 22.418,79", { exact: false })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Próxima" })).toBeDisabled();
});
it("resets to the first page when changing the selected month", () => {
  const view = render(<Page />);
  fireEvent.click(screen.getByRole("button", { name: "Próxima" }));
  state.filters = { kind: "entrada", month: "2026-10" };
  view.rerender(<Page />);
  expect(screen.getByText(/1–50 de 55/)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Anterior" })).toBeDisabled();
});
it("keeps filters available while loading and avoids presenting zero totals", () => {
  state.pending = true;
  render(<Page />);
  expect(screen.getByLabelText("Buscar paciente, fornecedor ou descrição")).toBeInTheDocument();
  expect(screen.getByLabelText("Mês do vencimento")).toBeInTheDocument();
  expect(screen.getByRole("status")).toHaveTextContent("Carregando");
  expect(screen.queryByText("Total nesta lista")).not.toBeInTheDocument();
});
