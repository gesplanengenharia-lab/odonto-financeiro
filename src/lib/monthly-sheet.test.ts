import { describe, expect, it } from "vitest";
import { webcrypto } from "node:crypto";
import readExcel from "read-excel-file/node";
import { parseMonthlySheets, sheetDate, type RawSheet } from "./monthly-sheet";
import type { CardSettings } from "./finance";
const rates: CardSettings = {
  debit_fee: 2,
  debit_days: 1,
  credit_fee_1x: 3,
  credit_fee_2_6: 4,
  credit_fee_7_12: 5,
  credit_days: 30,
};
Object.defineProperty(globalThis, "crypto", { value: webcrypto, configurable: true });
const template = () =>
  readExcel("public/modelos/Essencial_Lancamentos_Mensais.xlsx") as unknown as Promise<RawSheet[]>;
describe("planilha mensal e importação", () => {
  it("a baixa de parcela exige vencimento e recebimento, sem recalcular a taxa antiga", async () => {
    const sheets = await template();
    sheets[0]!.data[7] = [
      "E0001",
      "01/11/2026",
      "Paciente Teste",
      "Parcela 2",
      100,
      "Cartão de crédito",
      1,
      "10/11/2026",
      "12/11/2026",
      "",
      "",
      "Baixa de parcela",
    ];
    const result = await parseMonthlySheets(sheets, rates, "2026-11-12");
    expect(result.errors).toEqual([]);
    expect(result.entries[0]!.operation).toBe("settle");
    expect(result.entries[0]!.transactions[0]!.fee_amount).toBe(0);
    sheets[0]!.data[7]![7] = "";
    expect((await parseMonthlySheets(sheets, rates, "2026-11-12")).errors[0]).toContain(
      "preencha primeiro vencimento",
    );
  });
  it("o modelo entregue abre com duas abas, sem exemplos importáveis nem erros", async () => {
    const sheets = await template();
    expect(sheets.map((s) => s.sheet)).toEqual(["Entradas", "Saídas"]);
    const result = await parseMonthlySheets(sheets, rates, "2026-11-12");
    expect(result).toMatchObject({ entries: [], errors: [], month: "2026-11" });
  });
  it("recebe primeira parcela na data real e distribui o saldo com taxas e referência preservadas", async () => {
    const sheets = await template();
    sheets[0]!.data[7] = [
      "E0001",
      "01/11/2026",
      "Paciente Teste",
      "Implantes",
      1000,
      "Cartão de crédito",
      3,
      "10/11/2026",
      "12/11/2026",
      4,
      "",
    ];
    const result = await parseMonthlySheets(sheets, rates, "2026-11-12");
    expect(result.errors).toEqual([]);
    const rows = result.entries[0]!.transactions;
    expect(rows.map((t) => t.gross_amount)).toEqual([333.33, 333.33, 333.34]);
    expect(rows.map((t) => t.due_date)).toEqual(["2026-11-10", "2026-12-10", "2027-01-10"]);
    expect(rows.map((t) => t.status)).toEqual(["pago", "pendente", "pendente"]);
    expect(rows[0]!.paid_date).toBe("2026-11-12");
    expect(rows.every((t) => t.competence_date === "2026-11-01")).toBe(true);
    expect(rows.reduce((s, t) => s + t.fee_amount, 0)).toBeCloseTo(39.99);
    const again = await parseMonthlySheets(sheets, rates, "2026-11-12");
    expect(again.entries).toEqual(result.entries);
  });
  it("mantém referência e pagamento diferentes e identifica a equipe para o DRE", async () => {
    const sheets = await template();
    sheets[1]!.data[7] = [
      "S0001",
      "10/2026",
      "06/11/2026",
      "06/11/2026",
      "Lidiane",
      "Salário",
      2400,
      "Pix",
      "Fixa",
      "Funcionário",
      "",
      "",
    ];
    const result = await parseMonthlySheets(sheets, rates, "2026-11-12");
    expect(result.errors).toEqual([]);
    expect(result.entries[0]!.transactions[0]).toMatchObject({
      competence_date: "2026-10-01",
      paid_date: "2026-11-06",
      person: "Lidi",
      status: "pago",
    });
    expect(JSON.parse(result.entries[0]!.transactions[0]!.notes!)).toMatchObject({
      source: "essencial-payroll-v1",
      group: "funcionario",
      base: 2400,
    });
  });
  it("datas futuras não recebem baixa e números inválidos não passam silenciosamente", async () => {
    const sheets = await template();
    sheets[0]!.data[7] = [
      "E0001",
      "01/11/2026",
      "Paciente Teste",
      "Facetas",
      -10,
      "Pix",
      1,
      "",
      "14/11/2026",
      "",
      "",
    ];
    const result = await parseMonthlySheets(sheets, rates, "2026-11-12");
    expect(result.entries).toHaveLength(0);
    expect(result.errors[0]).toContain("linha 8");
    sheets[0]!.data[7]![4] = 100;
    sheets[0]!.data[7]![8] = "14/11/2026";
    expect((await parseMonthlySheets(sheets, rates, "2026-11-12")).errors[0]).toContain("futura");
  });
  it("código duplicado é bloqueado, e a ordem das linhas não muda a identidade", async () => {
    const sheets = await template();
    const row = [
      "E0001",
      "01/11/2026",
      "Paciente Teste",
      "Facetas",
      100,
      "Pix",
      1,
      "",
      "12/11/2026",
      "",
      "",
    ];
    sheets[0]!.data[7] = row;
    sheets[0]!.data[8] = [...row];
    expect((await parseMonthlySheets(sheets, rates, "2026-11-12")).errors[0]).toContain(
      "Código repetido",
    );
    sheets[0]!.data[8] = [];
    const before = await parseMonthlySheets(sheets, rates, "2026-11-12");
    sheets[0]!.data[7] = [];
    sheets[0]!.data[9] = row;
    const after = await parseMonthlySheets(sheets, rates, "2026-11-12");
    expect(after.entries[0]!.source_key).toBe(before.entries[0]!.source_key);
    expect(after.entries[0]!.transactions).toEqual(before.entries[0]!.transactions);
  });
  it("formato ou mês divergente é rejeitado antes de qualquer gravação", async () => {
    const sheets = await template();
    sheets[1]!.data[2]![1] = "12/2026";
    expect((await parseMonthlySheets(sheets, rates, "2026-11-12")).errors[0]).toContain(
      "mesmo arquivo e mês",
    );
    expect(() => sheetDate("31/02/2026")).toThrow();
  });
});
