import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ComponentType, ReactNode } from "react";
import type { Txn } from "@/lib/finance";

const state = vi.hoisted(() => ({ rows: [] as Txn[], pending: false, error: false }));
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: { component: ComponentType }) => ({ options }),
  Link: ({ children }: { children: ReactNode }) => <span>{children}</span>,
}));
vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({
    data: state.rows,
    isPending: state.pending,
    isError: state.error,
    refetch: vi.fn(),
  }),
}));
vi.mock("@/lib/queries", () => ({ txnsByDueQuery: vi.fn(), txnsByCompetenceQuery: vi.fn() }));
vi.mock("@/components/finance/LaunchDialog", () => ({ LaunchDialog: () => null }));
vi.mock("recharts", () => ({
  ResponsiveContainer: () => null,
  Bar: () => null,
  BarChart: () => null,
  CartesianGrid: () => null,
  Legend: () => null,
  Tooltip: () => null,
  XAxis: () => null,
  YAxis: () => null,
}));
import { Route } from "@/routes/_authenticated/painel";
const Panel = Route.options.component as ComponentType;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 10, 4, 12));
  state.pending = false;
  state.error = false;
  state.rows = [
    {
      id: "expense",
      kind: "saida",
      description: "Aluguel",
      person: null,
      category_id: null,
      nature: "fixa",
      payment_method: "boleto",
      status: "pendente",
      competence_date: "2026-11-01",
      due_date: "2026-11-10",
      paid_date: null,
      gross_amount: 500,
      net_amount: 500,
      fee_amount: 0,
      installment_number: 1,
      installment_total: 1,
      group_id: null,
      notes: null,
    },
  ];
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("Painel", () => {
  it("só calcula aporte com saldo válido e preserva simulações separadas por mês", () => {
    render(<Panel />);
    expect(screen.getByText("Informe o saldo inicial para calcular o aporte")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Saldo inicial do mês (R$)"), {
      target: { value: "100,00" },
    });
    expect(screen.getByText(/Aporte estimado para fechar o mês:/)).toHaveTextContent(/400,00/);
    fireEvent.click(screen.getByRole("button", { name: "Próximo mês" }));
    expect(screen.getByLabelText("Saldo inicial do mês (R$)")).toHaveValue("");
    expect(screen.getByText("Informe o saldo inicial para calcular o aporte")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Mês anterior" }));
    expect(screen.getByLabelText("Saldo inicial do mês (R$)")).toHaveValue("100,00");
    fireEvent.change(screen.getByLabelText("Saldo inicial do mês (R$)"), {
      target: { value: "abc" },
    });
    expect(screen.queryByText(/Aporte estimado para fechar o mês:/)).not.toBeInTheDocument();
    expect(screen.getByLabelText("Saldo inicial do mês (R$)")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
  });
  it("não exibe saldos zerados enquanto carrega", () => {
    state.pending = true;
    render(<Panel />);
    expect(screen.getByRole("status")).toHaveTextContent("Carregando o financeiro");
    expect(screen.queryByText("Já entrou no mês")).not.toBeInTheDocument();
  });
  it("não apresenta previsão financeira quando há erro de consulta", () => {
    state.error = true;
    render(<Panel />);
    expect(screen.getByRole("alert")).toHaveTextContent("Não foi possível carregar o painel");
    expect(screen.queryByText("Movimento previsto do mês")).not.toBeInTheDocument();
  });
});
