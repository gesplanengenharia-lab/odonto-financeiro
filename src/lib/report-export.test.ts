import { describe, expect, it } from "vitest";
import { buildLaunchRows, type CardSettings, type Txn } from "./finance";
import {
  financialCsv,
  financialPrintHtml,
  filterReportRows,
  validReportRange,
} from "./report-export";
const settings: CardSettings = {
  debit_fee: 0,
  debit_days: 1,
  credit_fee_1x: 0,
  credit_fee_2_6: 0,
  credit_fee_7_12: 0,
  credit_days: 30,
};
const make = (patch: Partial<Txn>): Txn => ({
  ...buildLaunchRows(
    {
      kind: "entrada",
      description: "Consulta",
      payment_method: "pix",
      amount: 100,
      date: "2026-11-01",
      installments: 1,
    },
    settings,
    () => "group",
  )[0]!,
  id: "row",
  ...patch,
});
const filter = { start: "2026-11-01", end: "2026-11-30", category: "all" };
describe("exportação financeira", () => {
  it("filtra por competência e categoria com extremos inclusivos", () => {
    const rows = [
      make({ id: "a", category_id: "cat" }),
      make({ id: "b", category_id: "cat", competence_date: "2026-11-30" }),
      make({ id: "c", category_id: "cat", competence_date: "2026-12-01" }),
      make({ id: "d" }),
    ];
    expect(filterReportRows(rows, { ...filter, category: "cat" }).map((r) => r.id)).toEqual([
      "a",
      "b",
    ]);
    expect(filterReportRows(rows, { ...filter, category: "none" }).map((r) => r.id)).toEqual(["d"]);
    expect(validReportRange("2026-02-30", "2026-03-31")).toBe(false);
    expect(validReportRange("2026-12-01", "2026-11-01")).toBe(false);
    expect(filterReportRows(rows, { ...filter, start: "" })).toEqual([]);
  });
  it("CSV preserva acentos, separadores e aspas sem executar fórmulas", () => {
    const csv = financialCsv(
      [make({ description: '=HYPERLINK("x");\nAvaliação', category_id: "cat" })],
      [{ id: "cat", name: "+Comando", kind: "entrada" }],
      filter,
    );
    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(csv).toContain('"\'=HYPERLINK(""x"");\nAvaliação"');
    expect(csv).toContain('"\'+Comando"');
    expect(csv).toContain('"100,00"');
    expect(csv).toContain("\r\n");
  });
  it("PDF usa os mesmos filtros e escapa conteúdo HTML", () => {
    const html = financialPrintHtml(
      [
        make({ description: '<script>alert("x")</script>', category_id: "cat" }),
        make({ description: "FORA", category_id: "other" }),
      ],
      [{ id: "cat", name: "Categoria <b>", kind: "entrada" }],
      { ...filter, category: "cat" },
    );
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("FORA");
    expect(html).toContain("1 lançamento(s)");
    expect(html).toContain("Essencial Odontologia");
    expect(html).toContain("thead {display:table-header-group;}");
  });
  it("exportação vazia tem cabeçalho e mensagem explícita", () => {
    expect(financialCsv([], [], filter)).toContain("Período inicial");
    expect(financialPrintHtml([], [], filter)).toContain(
      "Sem lançamentos para os filtros selecionados.",
    );
  });
});
