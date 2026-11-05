import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BillingTab, CashPixTab } from "@/components/finance/PainelTabs";
import { cashPixMonth, monthBilling, type Txn } from "@/lib/finance";
import type { ReactNode } from "react";
vi.mock("@tanstack/react-router", () => ({ Link: ({ children }: { children: ReactNode }) => <span>{children}</span> }));
afterEach(cleanup);
const row = (patch: Partial<Txn> = {}): Txn => ({ id: "receipt", kind: "entrada", description: "Atendimento",
  person: null, category_id: null, nature: null, payment_method: "pix", status: "pago",
  competence_date: "2026-11-01", due_date: "2026-11-01", paid_date: "2026-11-01", gross_amount: 100,
  fee_amount: 0, net_amount: 100, installment_number: 1, installment_total: 1, group_id: null, notes: null, ...patch });
describe("abas de faturamento e dinheiro/Pix/débito", () => {
  it("exibe falha do histórico e permite tentar novamente sem mostrar meses zerados", () => {
    const retry = vi.fn();
    render(<BillingTab month="2026-11" billing={monthBilling([row()], "2026-11")}
      history={[{month: "2026-10", billing: monthBilling([], "2026-10")}]} historyLoading={false} historyError onRetryHistory={retry} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Não foi possível carregar o histórico");
    expect(screen.queryByRole("columnheader", {name: /outubro/i})).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", {name: "Tentar novamente"})); expect(retry).toHaveBeenCalledOnce();
  });
  it("não apresenta 100% de faturamento quando a receita é zero", () => {
    render(<BillingTab month="2026-11" billing={monthBilling([row({gross_amount: 0, net_amount: 0})], "2026-11")}
      history={[]} historyLoading={false} historyError={false} onRetryHistory={() => {}} />);
    const table = screen.getAllByRole("table")[0]!;
    expect(within(table).queryByText("100%")).not.toBeInTheDocument();
  });
  it("detalha só dinheiro, Pix e débito efetivamente atribuídos ao mês de recebimento", () => {
    const data = cashPixMonth([row({description:"Pix de venda anterior", competence_date:"2026-10-01"}),
      row({id:"card", payment_method:"credito", description:"Recebimento de cartão"}),
      row({id:"debit", payment_method:"debito", gross_amount:100, fee_amount:2, net_amount:98, description:"Débito recebido no mês"}),
      row({id:"boleto",payment_method:"boleto",description:"Boleto à vista quitado"}),
      row({id:"parcelado",payment_method:"boleto",installment_total:3,description:"Boleto parcelado quitado"}),
      row({id:"future", status:"pendente", paid_date:null, due_date:"2026-12-01", description:"Pix futuro"})], "2026-11", "2026-11-05");
    render(<CashPixTab month="2026-11" data={data} />);
    expect(screen.getByText("Pix de venda anterior")).toBeInTheDocument();
    expect(screen.getByText("Débito recebido no mês")).toBeInTheDocument();
    expect(screen.getByText("Débito recebido").closest(".surface-card")).toHaveTextContent("98,00");
    expect(screen.queryByText("Recebimento de cartão")).not.toBeInTheDocument();
    expect(screen.getByText("Boleto à vista quitado")).toBeInTheDocument();
    expect(screen.getByText("Boleto à vista recebido").closest(".surface-card")).toHaveTextContent("100,00");
    expect(screen.queryByText("Boleto parcelado quitado")).not.toBeInTheDocument();
    expect(screen.queryByText("Pix futuro")).not.toBeInTheDocument();
    expect(screen.getByText(/não representa o saldo bancário disponível/)).toBeInTheDocument();
  });
});

