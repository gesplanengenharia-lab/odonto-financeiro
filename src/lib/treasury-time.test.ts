import { describe, expect, it } from "vitest";
import { treasuryTodayISO } from "./treasury-time";
describe("Calendário financeiro de São Paulo", () => {
  it("usa a data de São Paulo quando UTC já está no dia seguinte", () => {
    expect(treasuryTodayISO(new Date("2026-11-06T01:30:00Z"))).toBe("2026-11-05");
    expect(treasuryTodayISO(new Date("2026-11-06T03:01:00Z"))).toBe("2026-11-06");
  });
  it("mantém a conversão de datas sem depender do timezone do computador", () => {
    expect(treasuryTodayISO(new Date("2026-06-01T02:59:59Z"))).toBe("2026-05-31");
    expect(treasuryTodayISO(new Date("2026-06-01T03:00:00Z"))).toBe("2026-06-01");
  });
  it("rejeita instantes inválidos", () => {
    expect(() => treasuryTodayISO(new Date(NaN))).toThrow("Instante inválido.");
  });
});
