import { describe, expect, it } from "vitest";
import {
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
    expect(rows[0].fee_amount).toBe(15); // 4.5% de 333.33
    expect(rows[0].net_amount).toBe(318.33);
    expect(rows.every((r) => r.status === "pendente")).toBe(true);
    expect(rows.every((r) => r.competence_date === "2026-11-04")).toBe(true);
  });

  it("débito cai no dia seguinte com taxa de 1,5%", () => {
    const [row] = buildLaunchRows(
      { kind: "entrada", description: "Consulta", payment_method: "debito", amount: 200, date: "2026-11-04", installments: 5 },
      settings,
      gid,
    );
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
    expect(rows[11].due_date).toBe("2027-10-05");
    expect(rows.every((r) => r.nature === "fixa" && r.gross_amount === 4500)).toBe(true);
  });

  it("pix pago à vista entra como pago", () => {
    const [row] = buildLaunchRows(
      { kind: "entrada", description: "Limpeza", payment_method: "pix", amount: 150, date: "2026-11-04", installments: 1, paid: true },
      settings,
      gid,
    );
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
