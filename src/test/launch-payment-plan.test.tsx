import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LaunchDialog } from "@/components/finance/LaunchDialog";
const state = vi.hoisted(() => ({ create: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/queries", () => ({
  cardSettingsQuery: () => ({ queryKey: ["settings"] }),
  categoriesQuery: () => ({ queryKey: ["categories"] }),
  myAccessQuery: () => ({ queryKey: ["access"] }),
  useTxnMutations: () => ({ create: { mutateAsync: state.create, isPending: false } }),
}));
vi.mock("@tanstack/react-query", () => ({
  useQuery: (q: { queryKey: string[] }) => ({
    data:
      q.queryKey[0] === "settings"
        ? {
            debit_fee: 1.5,
            debit_days: 1,
            credit_fee_1x: 3.2,
            credit_fee_2_6: 4.5,
            credit_fee_7_12: 5.5,
            credit_days: 30,
          }
        : q.queryKey[0] === "categories"
          ? []
          : { roles: ["admin"], modules: [], permissionsReady: true },
  }),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
beforeEach(() => {
  vi.stubGlobal("crypto", { randomUUID: () => "a4db6532-5569-4fb6-a9de-707f6792f694" });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  state.create.mockClear();
});
function open() {
  render(<LaunchDialog />);
  fireEvent.click(screen.getByRole("button", { name: "Novo lançamento" }));
  fireEvent.change(screen.getByLabelText("Descrição"), { target: { value: "Implante" } });
  fireEvent.change(screen.getByLabelText("Valor total da venda (R$)"), {
    target: { value: "1.000,00" },
  });
  fireEvent.change(screen.getByLabelText("Data do atendimento / venda"), {
    target: { value: "2026-11-05" },
  });
}
describe("novo lançamento com entrada e saldo", () => {
  it("salva entrada Pix e somente o saldo no cartão, sem a opção de repetir", async () => {
    open();
    expect(screen.queryByLabelText("Repetir todo mês")).not.toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("Pagamento com entrada e saldo restante"));
    fireEvent.change(screen.getByLabelText("Valor da entrada (R$)"), {
      target: { value: "200,00" },
    });
    fireEvent.change(screen.getByLabelText("Forma de pagamento do restante"), {
      target: { value: "credito" },
    });
    fireEvent.change(screen.getByLabelText("Parcelas do restante"), { target: { value: "4" } });
    expect(screen.getByText(/Entrada R\$/)).toHaveTextContent(/saldo R\$.*800,00/);
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));
    await waitFor(() => expect(state.create).toHaveBeenCalledOnce());
    const rows = state.create.mock.calls[0]![0];
    expect(rows).toHaveLength(5);
    expect(rows[0]).toMatchObject({ payment_method: "pix", gross_amount: 200 });
    expect(
      rows
        .slice(1)
        .every(
          (r: { payment_method: string; gross_amount: number }) =>
            r.payment_method === "credito" && r.gross_amount === 200,
        ),
    ).toBe(true);
    expect(new Set(rows.map((r: { group_id: string }) => r.group_id)).size).toBe(1);
  });
  it("mantém boleto programado pendente e bloqueia entrada acima do total", async () => {
    open();
    fireEvent.click(screen.getByLabelText("Pagamento com entrada e saldo restante"));
    fireEvent.change(screen.getByLabelText("Valor da entrada (R$)"), {
      target: { value: "1.100,00" },
    });
    expect(screen.getByRole("alert")).toHaveTextContent("A entrada deve ser menor");
    expect(screen.getByRole("button", { name: "Salvar" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Valor da entrada (R$)"), {
      target: { value: "200,00" },
    });
    fireEvent.change(screen.getByLabelText("Forma de pagamento da entrada"), {
      target: { value: "boleto" },
    });
    fireEvent.change(screen.getByLabelText("Vencimento da entrada"), {
      target: { value: "2050-01-10" },
    });
    expect(screen.getByLabelText("Entrada já recebida")).toBeDisabled();
    expect(screen.getByLabelText("Entrada já recebida")).not.toBeChecked();
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));
    await waitFor(() => expect(state.create).toHaveBeenCalledOnce());
    expect(state.create.mock.calls[0]![0][0]).toMatchObject({
      payment_method: "boleto",
      status: "pendente",
      paid_date: null,
      due_date: "2050-01-10",
    });
  });
  it("repete o valor mensal sem dividi-lo e bloqueia duplo envio", async () => {
    open();
    fireEvent.click(screen.getByRole("button", { name: "Saída (despesa)" }));
    fireEvent.click(screen.getByLabelText("Repetir despesa mensalmente"));
    fireEvent.change(screen.getByLabelText("Despesa recorrente"), { target: { value: "3" } });
    expect(screen.queryByLabelText("Parcelas mensais")).not.toBeInTheDocument();
    let finish!: () => void;
    state.create.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    const form = screen.getByRole("button", { name: "Salvar" }).closest("form")!;
    fireEvent.submit(form);
    fireEvent.submit(form);
    expect(state.create).toHaveBeenCalledOnce();
    expect(
      state.create.mock.calls[0]![0].map((r: { gross_amount: number }) => r.gross_amount),
    ).toEqual([1000, 1000, 1000]);
    finish();
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "Salvar" })).not.toBeInTheDocument(),
    );
  });
  it("começa simples e limpa parcelas ao voltar ao pagamento único", async () => {
    open();
    expect(screen.queryByLabelText("Parcelas mensais")).not.toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("Dividir em parcelas"));
    fireEvent.change(screen.getByLabelText("Parcelas mensais"), { target: { value: "3" } });
    fireEvent.click(screen.getByLabelText("Dividir em parcelas"));
    expect(screen.queryByLabelText("Parcelas mensais")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));
    await waitFor(() => expect(state.create).toHaveBeenCalledOnce());
    expect(state.create.mock.calls[0]![0]).toHaveLength(1);
  });
  it("mantém despesa simples sem pagamento com entrada ou repetição", () => {
    open();
    fireEvent.click(screen.getByRole("button", { name: "Saída (despesa)" }));
    expect(
      screen.queryByLabelText("Pagamento com entrada e saldo restante"),
    ).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Repetir todo mês")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Forma de pagamento")).toBeInTheDocument();
  });
});
