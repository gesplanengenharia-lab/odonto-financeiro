import { describe, expect, it } from "vitest";
import { CLINIC_DRE_LINES, clinicDre, clinicDreAllocations, transactionNotes } from "./clinic-dre";
import type { Txn } from "./finance";
const row = (patch: Partial<Txn> = {}): Txn => ({
  id: "expense",
  kind: "saida",
  description: "Outros",
  person: null,
  category_id: null,
  nature: "fixa",
  payment_method: "pix",
  status: "pago",
  competence_date: "2026-09-01",
  due_date: "2026-10-05",
  paid_date: "2026-11-06",
  gross_amount: 100,
  net_amount: 100,
  fee_amount: 0,
  installment_number: 1,
  installment_total: 1,
  group_id: null,
  notes: null,
  ...patch,
});
const salary = {
  source: "essencial-payroll-v1",
  group: "funcionario",
  name: "Lidi",
  role: "CRC",
  base: 2237.09,
  commission: 0,
  bonus: 200,
  discount: 0,
  additional: 0,
};
describe("DRE da clínica por referência", () => {
  it("mantém todas as 32 linhas na ordem solicitada, incluindo linhas sem movimentos", () => {
    expect(CLINIC_DRE_LINES).toHaveLength(32);
    expect(CLINIC_DRE_LINES[0]?.[1]).toBe("PRÓ LABORE");
    expect(CLINIC_DRE_LINES[31]?.[1]).toBe("DEMAIS DESPESAS");
    expect(Object.keys(clinicDre([], ["2026-09"])[0]!.totals)).toHaveLength(32);
  });
  it("usa competência, nunca pagamento ou vencimento, e inclui pendentes da referência", () => {
    const months = clinicDre(
      [row(), row({ id: "pending", status: "pendente", paid_date: null, gross_amount: 50 })],
      ["2026-09", "2026-10", "2026-11"],
    );
    expect(months.map((m) => m.expenses)).toEqual([150, 0, 0]);
  });
  it("separa comissões e bônus da folha sem repetir salário nem desconto", () => {
    const allocations = clinicDreAllocations(
      row({ gross_amount: 2437.09, notes: JSON.stringify(salary) }),
    );
    expect(allocations.map((a) => [a.line, a.amount])).toEqual([
      ["payroll", 2237.09],
      ["bonuses", 200],
    ]);
    const discounted = clinicDreAllocations(
      row({
        gross_amount: 90,
        notes: JSON.stringify({ ...salary, base: 100, bonus: 20, discount: 30 }),
      }),
    );
    expect(discounted.map((a) => a.amount)).toEqual([70, 20]);
  });
  it("não confunde facetas de Jéssica com avaliador nem pró-labore com cartão pessoal", () => {
    expect(
      clinicDreAllocations(
        row({
          notes: JSON.stringify({
            ...salary,
            name: "Jessica",
            role: "Avaliação/Facetas",
            group: "dentista",
            base: 100,
            bonus: 0,
            commission: 0,
          }),
        }),
      )[0]?.line,
    ).toBe("dentists");
    expect(
      clinicDreAllocations(row({ description: "Jessica - Pagamentos cartao porto seguro" }))[0]
        ?.line,
    ).toBe("other");
  });
  it.each([
    ["Funchal-IPTU", "occupancy"],
    ["Brintel- monitoramento", "monitoring"],
    ["Select Acompanhante - Mentoria", "select_guest"],
    ["Select - Mentoria", "select"],
    ["Hotel SP - Select", "travel"],
    ["Gasolina SP - Sales Pro", "travel"],
    ["Sales Pro - Curso Avaliador", "sales_pro"],
    ["Imposto - FGTS mês de agosto", "social"],
    ["Imposto - Simples Nacional mês de Setembro", "taxes"],
    ["Bomsenso Contabilidade", "accounting"],
    ["Dental Cremer Jessica - Pagamentos", "dental"],
    ["Laboratório interno", "lab_internal"],
    ["Risum laboratorio - Hyrax", "lab_external"],
    ["Paciente jessica - estorno", "refunds"],
    ["Jessica -estorno padaria", "supplies"],
    ["Pagamento Avaliador", "evaluator"],
  ])("classifica %s como %s", (description, line) => {
    expect(clinicDreAllocations(row({ description }))[0]?.line).toBe(line);
  });
  it("não duplica fundos como despesa nem produz reservas sem lançamento", () => {
    const result = clinicDre(
      [
        row({ kind: "entrada", gross_amount: 1000, fee_amount: 10 }),
        row(),
        row({ description: "Fundo de reserva", gross_amount: 50 }),
      ],
      ["2026-09"],
    )[0]!;
    expect(result).toMatchObject({
      revenue: 990,
      expenses: 100,
      funds: 50,
      profit: 890,
      available: 840,
    });
    expect(result.totals.vacation_fund).toBe(0);
  });
  it("classificação manual prevalece sobre sugestão e preserva notas legadas", () => {
    const txn = row({
      description: "Laboratório",
      notes: JSON.stringify({ clinic_dre_line: "lab_internal" }),
    });
    expect(clinicDreAllocations(txn)[0]).toMatchObject({
      line: "lab_internal",
      manual: true,
      amount: 100,
    });
    expect(transactionNotes("Nota antiga")).toEqual({ original_note: "Nota antiga" });
  });
});
