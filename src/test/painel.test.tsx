import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
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
vi.mock("@/lib/queries", () => ({
  txnsByDueQuery: vi.fn(),
  txnsByCompetenceQuery: vi.fn(),
  categoriesQuery: vi.fn(),
}));
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
import { Route as SimulationRoute } from "@/routes/_authenticated/simulacao";
const Simulation = SimulationRoute.options.component as ComponentType;

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

describe("Painel e simulação", () => {
  it("mostra os quatro indicadores principais e mantém a simulação em área própria", () => {
    render(<Panel />);
    expect(screen.queryByLabelText("Saldo inicial do mês (R$)")).not.toBeInTheDocument();
    const kpis = screen.getByLabelText("Indicadores principais do mês");
    expect(kpis.children).toHaveLength(4);
    expect(screen.queryByRole("tab")).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("Ver análises e fechamento diário"));
    fireEvent.mouseDown(screen.getByRole("tab", { name: "À vista × contas" }), {
      button: 0,
      ctrlKey: false,
    });
    expect(screen.getByText("Abrir simulação de caixa")).toBeInTheDocument();
  });
  it("margem de caixa usa os recebimentos e mantém a DRE nos detalhes", () => {
    state.rows.push({
      ...state.rows[0]!,
      id: "paid",
      kind: "entrada",
      nature: null,
      status: "pago",
      paid_date: "2026-11-03",
      gross_amount: 1000,
      net_amount: 1000,
    });
    state.rows.push({
      ...state.rows[1]!,
      id: "future",
      status: "pendente",
      paid_date: null,
      due_date: "2026-12-03",
      gross_amount: 1000,
      net_amount: 1000,
    });
    render(<Panel />);
    const kpis = within(screen.getByLabelText("Indicadores principais do mês"));
    expect(kpis.getByText("Sobra do mês")).toBeInTheDocument();
    expect(kpis.getByText("100,0%")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Ver análises e fechamento diário"));
    fireEvent.mouseDown(screen.getByRole("tab", { name: "DRE e custos" }), {
      button: 0,
      ctrlKey: false,
    });
    const dre = within(screen.getByRole("region", { name: /DRE gerencial do mês/ }));
    expect(dre.getByText(/75,0%/)).toBeInTheDocument();
    expect(dre.getByText(/1.500,00/)).toBeInTheDocument();
  });
  it("sem recebimentos mostra 'sem base para cálculo' em vez de inventar margem", () => {
    render(<Panel />);
    const kpis = within(screen.getByLabelText("Indicadores principais do mês"));
    expect(kpis.getByText("sem base para cálculo")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Precisa de atenção" })).toBeInTheDocument();
  });
  it("mostra crescimento nos detalhes sem acrescentar cartões na tela inicial", () => {
    render(<Panel />);
    expect(screen.getByLabelText("Indicadores principais do mês").children).toHaveLength(4);
    expect(screen.getByLabelText("Período da comparação")).toHaveTextContent(
      "01/11/2026 a 04/11/2026 contra 01/10/2026 a 04/10/2026",
    );
    expect(
      screen.queryByRole("table", { name: "Evolução financeira dos últimos seis meses" }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("Ver análises e fechamento diário"));
    expect(
      screen.getByRole("table", { name: "Evolução financeira dos últimos seis meses" }),
    ).toBeInTheDocument();
  });
  it("abre previsão de 90 dias, exige saldo válido e permite cenário sem alterar lançamentos", () => {
    render(<Panel />);
    fireEvent.click(screen.getByText("Ver análises e fechamento diário"));
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Caixa 90 dias" }), {
      button: 0,
      ctrlKey: false,
    });
    const region = within(
      screen.getByRole("region", { name: "Vai faltar dinheiro nos próximos 90 dias?" }),
    );
    expect(region.getAllByText("Informe o saldo").length).toBeGreaterThan(0);
    fireEvent.change(region.getByLabelText("Saldo disponível agora (R$)"), {
      target: { value: "100,00" },
    });
    expect(region.getByText("Primeira falta em 10/11/2026")).toBeInTheDocument();
    const original = JSON.stringify(state.rows);
    fireEvent.change(region.getByLabelText("Cenário de recebimentos"), { target: { value: "30" } });
    expect(JSON.stringify(state.rows)).toBe(original);
    fireEvent.change(region.getByLabelText("Saldo disponível agora (R$)"), {
      target: { value: "abc" },
    });
    expect(region.getByRole("alert")).toHaveTextContent("Informe um valor");
  });
  it("não calcula aporte quando a consulta da simulação falha", () => {
    state.error = true;
    render(<Simulation />);
    expect(screen.getByRole("alert")).toHaveTextContent("Não foi possível carregar a simulação");
    expect(screen.queryByLabelText("Saldo inicial do mês (R$)")).not.toBeInTheDocument();
  });

  it("só calcula aporte com saldo válido e preserva simulações separadas por mês", () => {
    render(<Simulation />);
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
  it("mantém a conferência diária alinhada ao mês e permite escolher outra data", () => {
    render(<Panel />);
    fireEvent.click(screen.getByText("Ver análises e fechamento diário"));
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Fechamento diário" }), {
      button: 0,
      ctrlKey: false,
    });
    expect(screen.getByLabelText("Dia da conferência")).toHaveValue("2026-11-04");
    fireEvent.click(screen.getByRole("button", { name: "Próximo mês" }));
    expect(screen.getByLabelText("Dia da conferência")).toHaveValue("2026-12-01");
    fireEvent.change(screen.getByLabelText("Dia da conferência"), {
      target: { value: "2027-01-08" },
    });
    expect(screen.getByLabelText("Dia da conferência")).toHaveValue("2027-01-08");
    expect(screen.getAllByText("Janeiro de 2027").length).toBeGreaterThan(0);
    expect(screen.getByText("Nenhum pagamento confirmado em 08/01/2027.")).toBeInTheDocument();
  });
  it("não exibe saldos zerados enquanto carrega", () => {
    state.pending = true;
    render(<Panel />);
    expect(screen.getByRole("status", { name: /Carregando o financeiro/ })).toBeInTheDocument();
    expect(screen.queryByLabelText("Indicadores principais do mês")).not.toBeInTheDocument();
  });
  it("não apresenta previsão financeira quando há erro de consulta", () => {
    state.error = true;
    render(<Panel />);
    expect(screen.getByRole("alert")).toHaveTextContent("Não foi possível carregar o painel");
    expect(screen.queryByLabelText("Resumo financeiro do mês")).not.toBeInTheDocument();
  });
});
