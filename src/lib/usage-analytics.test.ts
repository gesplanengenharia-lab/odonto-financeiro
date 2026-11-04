import { describe, expect, it } from "vitest";
import { usageAnalytics, usageDay } from "./usage-analytics";
describe("analytics de uso", () => {
  it("aplica fuso de Brasília e conta parcelas, autores únicos e baixas por pagamento", () => {
    expect(usageDay("2026-11-02T01:00:00Z")).toBe("2026-11-01");
    const result = usageAnalytics(
      [{ created_at: "2026-11-02T01:00:00Z" }],
      [
        {
          created_at: "2026-11-01T12:00:00Z",
          created_by: "u",
          kind: "entrada",
          status: "pago",
          paid_date: "2026-11-02",
        },
        {
          created_at: "2026-11-01T13:00:00Z",
          created_by: "u",
          kind: "entrada",
          status: "pendente",
          paid_date: null,
        },
        {
          created_at: "2026-10-01T12:00:00Z",
          created_by: "v",
          kind: "saida",
          status: "pago",
          paid_date: "2026-11-02",
        },
        {
          created_at: "2026-11-02T12:00:00Z",
          created_by: null,
          kind: "saida",
          status: "pago",
          paid_date: null,
        },
      ],
      "2026-11-01",
      "2026-11-02",
    )!;
    expect(result.registrations).toBe(1);
    expect(result.launches).toBe(3);
    expect(result.settled).toBe(2);
    expect(result.activeCreators).toBe(1);
    expect(result.missingPaidDates).toBe(1);
    expect(result.days[0]?.registrations).toBe(1);
    expect(result.days[1]?.settled).toBe(2);
  });
  it("baixa desfeita não conta e período inválido não calcula indicadores", () => {
    expect(
      usageAnalytics(
        [],
        [
          {
            created_at: "2026-11-01T12:00:00Z",
            created_by: "u",
            kind: "entrada",
            status: "pendente",
            paid_date: "2026-11-02",
          },
        ],
        "2026-11-01",
        "2026-11-02",
      )?.settled,
    ).toBe(0);
    expect(usageAnalytics([], [], "2026-11-02", "2026-11-01")).toBeNull();
    expect(usageAnalytics([], [], "2024-01-01", "2026-11-01")).toBeNull();
    expect(usageAnalytics([], [], "2026-11-01", "2026-11-02")?.days).toHaveLength(2);
  });
});
