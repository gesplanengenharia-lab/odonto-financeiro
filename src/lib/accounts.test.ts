import { describe, expect, it } from "vitest";
import { accountFilters, openAccounts, dashboardMonth, type Txn } from "./finance";

const txn = (overrides: Partial<Txn> = {}): Txn => ({
  id: "one",
  kind: "entrada",
  description: "Tratamento",
  person: "João",
  status: "pendente",
  payment_method: "boleto",
  competence_date: "2026-09-01",
  due_date: "2026-11-10",
  paid_date: null,
  gross_amount: 100,
  fee_amount: 0,
  net_amount: 100,
  nature: null,
  category_id: null,
  installment_number: 1,
  installment_total: 1,
  group_id: null,
  notes: null,
  ...overrides,
});

describe("caminho do painel às contas", () => {
  it("reproduz o valor a receber do painel por mês, incluindo repasses de cartão", () => {
    const rows = [
      txn(),
      txn({
        id: "card",
        payment_method: "credito",
        gross_amount: 200,
        net_amount: 190,
        fee_amount: 10,
      }),
      txn({ id: "old", due_date: "2026-10-01" }),
      txn({ id: "future", due_date: "2026-12-01" }),
      txn({ id: "paid", status: "pago", paid_date: "2026-11-01" }),
    ];
    const panel = dashboardMonth(rows, "2026-11", "2026-11-09");
    const list = openAccounts(rows, { kind: "entrada", month: "2026-11" }, "2026-11-09");
    expect(list.total).toBe(panel.toReceive + panel.overdueReceivable);
    expect(list.total).toBe(290);
    expect(list.rows.map((row) => row.id)).toEqual(["card", "one"]);
  });
  it("limita as contas e todos os totais ao mesmo mês e filtro de atraso", () => {
    const rows = [
      txn({ kind: "saida", due_date: "2026-11-05", gross_amount: 0.1 }),
      txn({ id: "two", kind: "saida", due_date: "2026-11-08", gross_amount: 0.2 }),
      txn({ id: "old", kind: "saida", due_date: "2026-10-01", gross_amount: 999 }),
      txn({ id: "next", kind: "saida", due_date: "2026-11-15" }),
    ];
    const list = openAccounts(
      rows,
      { kind: "saida", month: "2026-11", period: "atrasados" },
      "2026-11-09",
    );
    expect(list.total).toBe(0.3);
    expect(list.overdue).toBe(0.3);
    expect(list.nextWeek).toBe(0);
    expect(list.rows).toHaveLength(2);
  });
  it("respeita método, busca sem acentos e limites inclusivos dos próximos sete dias", () => {
    const rows = [
      txn({ due_date: "2026-11-09" }),
      txn({ id: "last", due_date: "2026-11-16" }),
      txn({ id: "beyond", due_date: "2026-11-17" }),
      txn({ id: "other", person: "Maria" }),
      txn({ id: "pix", payment_method: "pix" }),
    ];
    const list = openAccounts(
      rows,
      { kind: "entrada", period: "7", method: "boleto" },
      "2026-11-09",
      "joao",
    );
    expect(list.rows).toHaveLength(2);
    expect(list.nextWeek).toBe(200);
    expect(list.total).toBe(200);
  });
  it("consulta recebidos e atrasados sem misturar repasses de cartão com inadimplência do paciente", () => {
    const rows = [
      txn({ id: "late", due_date: "2026-11-01" }),
      txn({ id: "late-card", due_date: "2026-11-01", payment_method: "credito" }),
      txn({ id: "paid", status: "pago", paid_date: "2026-11-01" }),
    ];
    expect(
      openAccounts(rows, { kind: "entrada", channel: "cartoes" }, "2026-11-09").rows.map(
        (row) => row.id,
      ),
    ).toEqual(["late-card"]);
    expect(
      openAccounts(
        rows,
        { kind: "entrada", channel: "pacientes", period: "atrasados" },
        "2026-11-09",
      ).total,
    ).toBe(100);
    const received = openAccounts(rows, { kind: "entrada", status: "pago" }, "2026-11-09");
    expect(received.rows).toHaveLength(1);
    expect(received.nextWeek).toBe(0);
    expect(received.overdue).toBe(0);
  });
  it("descarta filtros inválidos e nunca leva nomes de pacientes para o endereço", () => {
    expect(
      accountFilters({
        kind: "entrada",
        month: "2026-11",
        period: "7",
        method: "pix",
        person: "João",
      }),
    ).toEqual({ kind: "entrada", month: "2026-11", period: "7", method: "pix" });
    expect(
      accountFilters({ kind: "invalid", month: "2026-13", period: "365", method: "toString" }),
    ).toEqual({});
    expect(openAccounts([txn()], {}, "2026-11-09").rows).toHaveLength(0);
  });
});
