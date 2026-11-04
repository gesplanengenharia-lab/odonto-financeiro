import { describe, expect, it } from "vitest";
import { payrollTotal, type Txn } from "./finance";
import { readPayroll, payrollSchema } from "./payroll";
describe("remuneração mensal", () => {
  it("soma salário, adicionais, comissão, bônus, férias e rescisão e desconta uma vez", () => {
    expect(
      payrollTotal({
        base: 2000,
        additional: 100,
        commission: 300,
        bonus: 150,
        discount: 50,
        termination: 1000,
        vacation: 500,
      }),
    ).toBe(4000);
    expect(payrollTotal({ base: 0.1, additional: 0.2, commission: 0, bonus: 0, discount: 0 })).toBe(
      0.3,
    );
  });
  it("recusa valores inválidos e descontos maiores que a remuneração", () => {
    const p = { base: 100, additional: 0, commission: 0, bonus: 0, discount: 101 };
    expect(() => payrollTotal(p)).toThrow();
    expect(() => payrollTotal({ ...p, base: NaN })).toThrow();
    expect(() => payrollTotal({ ...p, discount: -1 })).toThrow();
  });
  it("identifica apenas despesas da folha e preserva valores mensais separados", () => {
    const p = payrollSchema.parse({
      source: "essencial-payroll-v1",
      group: "dentista",
      name: "Teste",
      role: "",
      base: 100,
      additional: 0,
      commission: 0,
      bonus: 0,
      discount: 0,
    });
    const t = { kind: "saida", notes: JSON.stringify(p) } as Txn;
    expect(readPayroll(t)?.base).toBe(100);
    expect(readPayroll({ ...t, notes: "Observação comum" })).toBeNull();
    expect(readPayroll({ ...t, kind: "entrada" })).toBeNull();
    expect(p.termination).toBe(0);
    expect(p.vacation).toBe(0);
  });
});
