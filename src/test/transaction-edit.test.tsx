import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TxnTable } from "@/components/finance/TxnTable";
import type { Txn } from "@/lib/finance";
const state = vi.hoisted(() => ({ update: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/queries", () => ({
  categoriesQuery: () => ({ queryKey: ["categories"] }),
  myAccessQuery: () => ({ queryKey: ["access"] }),
  useTxnMutations: () => ({ update: { mutateAsync: state.update, isPending: false }, remove: {} }),
}));
vi.mock("@tanstack/react-query", () => ({
  useQuery: (options: { queryKey: string[] }) => ({
    data:
      options.queryKey[0] === "categories"
        ? []
        : { roles: ["admin"], modules: [], permissionsReady: true },
  }),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
const txn: Txn = {
  id: "one",
  kind: "entrada",
  description: "Tratamento",
  person: "Paciente",
  category_id: null,
  nature: null,
  payment_method: "boleto",
  status: "pago",
  recorded_status: "pendente",
  auto_settle: true,
  automatic_payment: true,
  paid_date: "2026-09-01",
  recorded_paid_date: null,
  competence_date: "2026-08-01",
  due_date: "2026-09-01",
  gross_amount: 100,
  fee_amount: 0,
  net_amount: 100,
  installment_number: 1,
  installment_total: 2,
  group_id: "sale",
  notes: null,
};
afterEach(() => {
  cleanup();
  state.update.mockClear();
});
describe("edição de lançamentos sem baixa manual", () => {
  it("substitui baixar/desfazer por editar e salva não recebido como exceção da parcela", async () => {
    render(<TxnTable rows={[txn]} />);
    expect(screen.queryByRole("button", { name: /baixa/i })).not.toBeInTheDocument();
    expect(screen.getByText("Recebido automaticamente")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Editar lançamento" }));
    expect(screen.getByLabelText("Situação do pagamento")).toHaveValue("automatico");
    fireEvent.change(screen.getByLabelText("Situação do pagamento"), {
      target: { value: "pendente" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Salvar alterações" }));
    await waitFor(() =>
      expect(state.update).toHaveBeenCalledWith(expect.objectContaining({ txn, mode: "pendente" })),
    );
    expect(state.update).toHaveBeenCalledTimes(1);
  });
  it("permite editar o valor da parcela preservando o grupo e as outras parcelas", async () => {
    render(<TxnTable rows={[txn]} />);
    fireEvent.click(screen.getByRole("button", { name: "Editar lançamento" }));
    fireEvent.change(screen.getByLabelText("Valor desta parcela (R$)"), {
      target: { value: "120.50" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Salvar alterações" }));
    await waitFor(() =>
      expect(state.update).toHaveBeenCalledWith(
        expect.objectContaining({
          txn,
          details: expect.objectContaining({ gross_amount: 120.5, net_amount: 120.5 }),
        }),
      ),
    );
    expect(state.update.mock.calls[0]?.[0].details).not.toHaveProperty("group_id");
  });
});
