import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { Route } from "@/routes/_authenticated/boletos";
import { todayISO, type Txn } from "@/lib/finance";
const state = vi.hoisted(() => ({
  data: [] as Txn[],
  isLoading: false,
  isError: false,
  refetch: vi.fn(),
}));
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: object) => ({ options }),
}));
vi.mock("@tanstack/react-query", () => ({ useQuery: () => state }));
vi.mock("@/lib/queries", () => ({ txnsByDueQuery: () => ({}) }));
vi.mock("@/components/finance/TxnTable", () => ({
  TxnTable: ({ rows }: { rows: Txn[] }) => (
    <div>
      {rows.map((r) => (
        <p key={r.id}>{r.person}</p>
      ))}
    </div>
  ),
}));
vi.mock("recharts", () => ({
  ResponsiveContainer: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  BarChart: () => null,
  Bar: () => null,
  CartesianGrid: () => null,
  Tooltip: () => null,
  XAxis: () => null,
  YAxis: () => null,
}));
const Page = Route.options.component as () => ReactNode;
afterEach(() => {
  cleanup();
  state.data = [];
  state.isLoading = false;
  state.isError = false;
  vi.clearAllMocks();
});
describe("página de boletos", () => {
  it("abre mês futuro pela agenda e mostra o paciente com vencimento naquele mês", () => {
    const nextYear = String(Number(todayISO().slice(0, 4)) + 1);
    const day = `${nextYear}-01-10`;
    state.data = [
      {
        id: "future",
        kind: "entrada",
        payment_method: "boleto",
        status: "pendente",
        due_date: day,
        competence_date: todayISO(),
        paid_date: null,
        net_amount: 200,
        gross_amount: 200,
        fee_amount: 0,
        person: "Paciente futuro",
        description: "Tratamento",
        category_id: null,
        nature: null,
        installment_number: 2,
        installment_total: 12,
        group_id: null,
        notes: null,
      },
    ];
    render(<Page />);
    expect(screen.queryByText("Paciente futuro")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: `Ver boletos de Janeiro de ${nextYear}` }));
    expect(screen.getByText("Paciente futuro")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: `Boletos com vencimento em Janeiro de ${nextYear}` }),
    ).toBeInTheDocument();
  });
  it("filtra a lista pelo paciente e situação sem alterar os totais", () => {
    const day = todayISO();
    state.data = ["Ana Silva", "João Lima"].map(
      (person, i) =>
        ({
          id: String(i),
          kind: "entrada",
          payment_method: "boleto",
          status: i === 0 ? "pago" : "pendente",
          due_date: day,
          competence_date: day,
          paid_date: i === 0 ? day : null,
          net_amount: 200,
          gross_amount: 200,
          fee_amount: 0,
          person,
          description: "Tratamento",
          category_id: null,
          nature: null,
          installment_number: 1,
          installment_total: 1,
          group_id: null,
          notes: null,
        }) as Txn,
    );
    render(<Page />);
    fireEvent.change(screen.getByLabelText("Paciente"), { target: { value: "joao" } });
    expect(screen.getByText("João Lima")).toBeInTheDocument();
    expect(screen.queryByText("Ana Silva")).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Situação"), { target: { value: "pago" } });
    expect(screen.queryByText("João Lima")).not.toBeInTheDocument();
    expect(screen.getByText(/0 de 2 lançamentos/)).toBeInTheDocument();
  });
  it("mostra falha e nova tentativa sem apresentar cartões zerados", () => {
    state.isError = true;
    render(<Page />);
    expect(screen.getByRole("alert")).toHaveTextContent("Não foi possível carregar os boletos");
    expect(screen.queryByText("Boletos atrasados")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));
    expect(state.refetch).toHaveBeenCalledOnce();
  });
  it("informa carregamento sem mostrar ausência de recebíveis", () => {
    state.isLoading = true;
    render(<Page />);
    expect(screen.getByRole("status")).toHaveTextContent("Carregando boletos");
    expect(screen.queryByText("Nenhum boleto com vencimento neste mês")).not.toBeInTheDocument();
  });
});
