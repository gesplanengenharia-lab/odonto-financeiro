import { describe, expect, it } from "vitest";
import { clinicGoalsProgress, suggestClinicGoals, validateClinicGoals, type Txn } from "./finance";
const goals = { break_even: 1000, target: 1500, super_target: 2000, mega_target: 2500 };
const row = (patch: Partial<Txn> = {}): Txn => ({
  id: "receipt",
  kind: "entrada",
  description: "Tratamento",
  person: null,
  category_id: null,
  nature: null,
  payment_method: "pix",
  status: "pago",
  competence_date: "2026-09-01",
  due_date: "2026-10-05",
  paid_date: "2026-11-06",
  gross_amount: 600,
  net_amount: 580,
  fee_amount: 20,
  installment_number: 1,
  installment_total: 12,
  group_id: null,
  notes: null,
  ...patch,
});
describe("metas de recebimentos da clínica", () => {
  it("conta só o líquido recebido no mês, incluindo parcelas de vendas anteriores", () => {
    const data = clinicGoalsProgress(
      [
        row(),
        row({ id: "old", paid_date: "2026-10-31" }),
        row({ id: "future", paid_date: "2026-11-30" }),
        row({ id: "unpaid", status: "pendente", paid_date: null, due_date: "2026-11-20" }),
        row({ id: "expense", kind: "saida" }),
        row({ id: "missing", paid_date: null, due_date: "2026-11-10" }),
      ],
      "2026-11",
      goals,
      "2026-11-12",
    );
    expect(data.received).toBe(580);
    expect(data.upcoming).toBe(580);
    expect(data.withUpcoming).toBe(1160);
    expect(data.missingPaidDates).toBe(1);
    expect(data.levels[0]).toMatchObject({ remaining: 420, reached: false, percent: 58 });
  });
  it("recebíveis vencidos não são somados ao cenário de recebimento futuro", () => {
    const data = clinicGoalsProgress(
      [row({ status: "pendente", paid_date: null, due_date: "2026-11-01" })],
      "2026-11",
      goals,
      "2026-11-12",
    );
    expect(data).toMatchObject({ received: 0, upcoming: 0, overdue: 580, withUpcoming: 0 });
    expect(data.levels.every((level) => !level.reached)).toBe(true);
  });
  it("muda o próximo nível, limita faltante a zero e calcula o ritmo diário", () => {
    const data = clinicGoalsProgress([row({ net_amount: 1500 })], "2026-11", goals, "2026-11-12");
    expect(data.next?.label).toBe("Super Meta");
    expect(data.levels[0]).toMatchObject({ reached: true, percent: 150, remaining: 0 });
    expect(data.daysRemaining).toBe(19);
    expect(data.next?.daily).toBe(26.32);
    expect(data.projection).toBe(3750);
    expect(data.surplus).toBe(500);
  });
  it("não divide por zero no fechamento e não projeta mês futuro ou passado", () => {
    const closed = clinicGoalsProgress([], "2026-10", goals, "2026-11-12");
    expect(closed).toMatchObject({ daysRemaining: 0, projection: null });
    expect(closed.next?.daily).toBeNull();
    const future = clinicGoalsProgress([], "2026-12", goals, "2026-11-12");
    expect(future).toMatchObject({ daysRemaining: 31, projection: null });
  });
  it("não inventa metas quando ainda não há planejamento salvo", () => {
    const empty = clinicGoalsProgress([row()], "2026-11", null, "2026-11-12");
    expect(empty).toMatchObject({ received: 580, levels: [], next: null, surplus: null });
  });
  it("sugere valores editáveis sem aplicar nem mudar os lançamentos", () => {
    expect(suggestClinicGoals(100000)).toEqual({
      break_even: 100000,
      target: 120000,
      super_target: 150000,
      mega_target: 200000,
    });
    expect(() => suggestClinicGoals(0)).toThrow();
  });
  it("mega meta alcançada não cria próximo objetivo negativo", () => {
    const data = clinicGoalsProgress([row({ net_amount: 3000 })], "2026-11", goals, "2026-11-12");
    expect(data.next).toBeNull();
    expect(data.levels.every((level) => level.reached && level.remaining === 0)).toBe(true);
  });
  it.each([
    { ...goals, break_even: 0 },
    { ...goals, break_even: 0.001 },
    { ...goals, target: 1000 },
    { ...goals, super_target: NaN },
    { ...goals, mega_target: 9999999999 },
    { ...goals, target: -10 },
  ])("recusa metas inválidas ou fora de ordem", (value) => {
    expect(() => validateClinicGoals(value)).toThrow();
  });
});
