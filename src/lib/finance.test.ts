import { describe, expect, it } from "vitest";
import {
  dashboardMonth,
  dashboardFunding,
  type Txn,
  buildLaunchRows,
  cardFeePercent,
  isDefaulted,
  summarize,
  addMonths,
  type CardSettings,
} from "./finance";

const settings: CardSettings = {
  debit_fee: 1.5,
  debit_days: 1,
  credit_fee_1x: 3.2,
  credit_fee_2_6: 4.5,
  credit_fee_7_12: 5.5,
  credit_days: 30,
};
let n = 0;
const gid = () => `g${++n}`;

describe("taxas de cartão", () => {
  it("usa a faixa de taxa pelo número de parcelas", () => {
    expect(cardFeePercent(settings, "credito", 1)).toBe(3.2);
    expect(cardFeePercent(settings, "credito", 6)).toBe(4.5);
    expect(cardFeePercent(settings, "credito", 7)).toBe(5.5);
    expect(cardFeePercent(settings, "debito", 1)).toBe(1.5);
    expect(cardFeePercent(settings, "pix", 1)).toBe(0);
  });
});

describe("lançamento parcelado no crédito", () => {
  it("divide R$1.000 em 3x com taxa e recebimento a cada 30 dias", () => {
    const rows = buildLaunchRows(
      { kind: "entrada", description: "Implante", payment_method: "credito", amount: 1000, date: "2026-11-04", installments: 3 },
      settings,
      gid,
    );
    expect(rows.map((r) => r.gross_amount)).toEqual([333.33, 333.33, 333.34]);
    expect(rows.map((r) => r.due_date)).toEqual(["2026-12-04", "2027-01-03", "2027-02-02"]);
    expect(rows[0]!.fee_amount).toBe(15); // 4.5% de 333.33
    expect(rows[0]!.net_amount).toBe(318.33);
    expect(rows.every((r) => r.status === "pendente")).toBe(true);
    expect(rows.every((r) => r.competence_date === "2026-11-04")).toBe(true);
  });

  it("débito cai no dia seguinte com taxa de 1,5%", () => {
    const row = buildLaunchRows(
      { kind: "entrada", description: "Consulta", payment_method: "debito", amount: 200, date: "2026-11-04", installments: 5 },
      settings,
      gid,
    )[0]!;
    expect(row.due_date).toBe("2026-11-05");
    expect(row.fee_amount).toBe(3);
    expect(row.installment_total).toBe(1);
  });
});

describe("boletos e despesas fixas", () => {
  it("boleto em 4x vence mensalmente a partir do primeiro vencimento, sem taxa", () => {
    const rows = buildLaunchRows(
      { kind: "entrada", description: "Ortodontia", payment_method: "boleto", amount: 1200, date: "2026-11-04", first_due_date: "2026-11-10", installments: 4 },
      settings,
      gid,
    );
    expect(rows.map((r) => r.due_date)).toEqual(["2026-11-10", "2026-12-10", "2027-01-10", "2027-02-10"]);
    expect(rows.every((r) => r.fee_amount === 0)).toBe(true);
  });

  it("despesa fixa repetida por 12 meses gera 12 lançamentos", () => {
    const rows = buildLaunchRows(
      { kind: "saida", description: "Aluguel", payment_method: "boleto", nature: "fixa", amount: 4500, date: "2026-11-05", installments: 1, repeat_months: 12 },
      settings,
      gid,
    );
    expect(rows).toHaveLength(12);
    expect(rows[11]!.due_date).toBe("2027-10-05");
    expect(rows.every((r) => r.nature === "fixa" && r.gross_amount === 4500)).toBe(true);
  });

  it("pix pago à vista entra como pago", () => {
    const row = buildLaunchRows(
      { kind: "entrada", description: "Limpeza", payment_method: "pix", amount: 150, date: "2026-11-04", installments: 1, paid: true },
      settings,
      gid,
    )[0]!;
    expect(row.status).toBe("pago");
    expect(row.paid_date).toBe("2026-11-04");
  });

  it("fim de mês não pula mês", () => {
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
  });
});

describe("inadimplência", () => {
  it("boleto vencido e não pago é inadimplente; cartão não", () => {
    expect(isDefaulted({ kind: "entrada", status: "pendente", due_date: "2026-10-01", payment_method: "boleto" }, "2026-11-04")).toBe(true);
    expect(isDefaulted({ kind: "entrada", status: "pendente", due_date: "2026-10-01", payment_method: "credito" }, "2026-11-04")).toBe(false);
    expect(isDefaulted({ kind: "entrada", status: "pago", due_date: "2026-10-01", payment_method: "boleto" }, "2026-11-04")).toBe(false);
  });
});

describe("margem de lucro", () => {
  it("lucro = receita líquida - despesas; margem sobre a receita bruta", () => {
    const s = summarize([
      { kind: "entrada", gross_amount: 10000, fee_amount: 400, net_amount: 9600, nature: null },
      { kind: "saida", gross_amount: 3000, fee_amount: 0, net_amount: 3000, nature: "fixa" },
      { kind: "saida", gross_amount: 2000, fee_amount: 0, net_amount: 2000, nature: "variavel" },
    ]);
    expect(s.profit).toBe(4600);
    expect(s.margin).toBe(46);
    expect(s.fixedExpenses).toBe(3000);
  });
});

describe("dashboard mensal", () => {
  const row = (patch: Partial<Txn> = {}): Txn => ({
    id: "test",
    kind: "entrada",
    description: "Teste",
    person: null,
    category_id: null,
    nature: null,
    payment_method: "pix",
    status: "pendente",
    competence_date: "2026-11-01",
    due_date: "2026-11-20",
    paid_date: null,
    gross_amount: 100,
    fee_amount: 0,
    net_amount: 100,
    installment_number: 1,
    installment_total: 1,
    group_id: null,
    notes: null,
    ...patch,
  });

  it("atribui recebimentos e pagamentos ao mês efetivo, sem duplicar vencimentos antigos", () => {
    const rows = [
      row({ status: "pago", due_date: "2026-10-15", paid_date: "2026-11-03" }),
      row({
        kind: "saida",
        status: "pago",
        due_date: "2026-10-01",
        paid_date: "2026-11-02",
        gross_amount: 40,
        net_amount: 40,
      }),
      row({ status: "pago", paid_date: "2026-12-01" }),
    ];
    const nov = dashboardMonth(rows, "2026-11", "2026-11-04");
    expect(nov.received).toBe(100);
    expect(nov.paid).toBe(40);
    expect(nov.realized).toBe(60);
    expect(nov.byMethod.find((r) => r.method === "pix")?.received).toBe(100);
    expect(dashboardMonth(rows, "2026-10", "2026-11-04").received).toBe(0);
    expect(dashboardMonth(rows, "2026-12", "2026-11-04").received).toBe(100);
  });

  it("usa cartão líquido e exclui recebíveis vencidos da previsão, inclusive cartões", () => {
    const m = dashboardMonth(
      [
        row({ payment_method: "credito", fee_amount: 5, net_amount: 95 }),
        row({ payment_method: "boleto", due_date: "2026-11-01" }),
        row({ payment_method: "debito", due_date: "2026-11-02", fee_amount: 2, net_amount: 98 }),
        row({ due_date: "2026-11-04", payment_method: "dinheiro" }),
        row({ due_date: "2026-12-01" }),
      ],
      "2026-11",
      "2026-11-04",
    );
    expect(m.toReceive).toBe(195);
    expect(m.overdueReceivable).toBe(198);
    expect(m.receivable).toBe(393);
    expect(m.projected).toBe(195);
    expect(m.byMethod.reduce((v, r) => v + r.expected, 0)).toBe(m.toReceive);
    expect(m.byMethod.reduce((v, r) => v + r.overdue, 0)).toBe(m.overdueReceivable);
  });

  it("inclui despesas antigas pendentes, sem contar recebíveis antigos como caixa", () => {
    const m = dashboardMonth(
      [
        row({ kind: "saida", due_date: "2026-10-01", gross_amount: 250, net_amount: 250 }),
        row({ kind: "saida", gross_amount: 200, net_amount: 200 }),
        row({ due_date: "2026-10-20", gross_amount: 1000, net_amount: 1000 }),
        row(),
      ],
      "2026-11",
      "2026-11-04",
    );
    expect(m.priorToPay).toBe(250);
    expect(m.priorToReceive).toBe(1000);
    expect(m.toPay).toBe(200);
    expect(m.projected).toBe(-350);
    expect(dashboardFunding(m.projected, 150)).toEqual({ closing: -200, contribution: 200 });
    expect(dashboardFunding(m.projected, 400)).toEqual({ closing: 50, contribution: 0 });
  });

  it("mantém DRE por competência e caixa separados, sem descontar a taxa duas vezes", () => {
    const paid = row({
      status: "pago",
      paid_date: "2026-11-01",
      payment_method: "credito",
      fee_amount: 5,
      net_amount: 95,
    });
    const future = row({ due_date: "2026-12-01" });
    const expense = row({
      kind: "saida",
      nature: "fixa",
      status: "pago",
      paid_date: "2026-11-02",
      gross_amount: 50,
      net_amount: 50,
    });
    const m = dashboardMonth([paid, future, expense], "2026-11", "2026-11-04");
    expect(m.cashDre.profit).toBe(45);
    expect(m.realized).toBe(45);
    expect(summarize([paid, future, expense]).profit).toBe(145);
  });

  it("expõe datas ausentes, aceita saldo negativo e arredonda centavos", () => {
    const m = dashboardMonth(
      [
        row({ status: "pago", gross_amount: 0.1, net_amount: 0.1 }),
        row({ status: "pago", gross_amount: 0.2, net_amount: 0.2 }),
      ],
      "2026-11",
      "2026-11-04",
    );
    expect(m.missingPaidDates).toBe(2);
    expect(m.received).toBe(0.3);
    expect(dashboardFunding(m.projected, -0.5)).toEqual({ closing: -0.2, contribution: 0.2 });
  });

  it("mês vazio não gera receitas, despesas ou margem fictícias", () => {
    const m = dashboardMonth([], "2027-01", "2026-11-04");
    expect(m.received).toBe(0);
    expect(m.toPay).toBe(0);
    expect(m.projected).toBe(0);
    expect(m.byMethod).toHaveLength(6);
    expect(m.cashDre.margin).toBe(0);
  });
});
