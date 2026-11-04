import { afterEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { askFinancialData } from "./financial-assistant.server";
import { financialQuestionSchema } from "./financial-assistant-schema";
import { financialAssistantContext, type Txn } from "./finance";
const question = { question: "Quanto recebemos?", fromMonth: "2026-11", toMonth: "2026-11" };
const row = {
  kind: "entrada",
  status: "pago",
  paid_date: "2026-11-02",
  competence_date: "2026-11-01",
  due_date: "2026-10-01",
  payment_method: "credito",
  gross_amount: 100,
  net_amount: 95,
  fee_amount: 5,
  category_id: null,
  nature: null,
  person: "PATIENT_PRIVATE",
  description: "PRIVATE_DESCRIPTION",
  notes: "PRIVATE_NOTES",
  id: "PRIVATE_ID",
} as Txn;
function db(roles: unknown[] = [{ role: "admin" }], queryError = false) {
  const chain = (table: string): Record<string, unknown> => {
    const value = {
      data: table === "user_roles" ? roles : table === "transactions" ? [row] : [],
      error: queryError && table === "transactions" ? new Error("private db details") : null,
    };
    const q: Record<string, unknown> = {
      then: (resolve: (v: unknown) => unknown) => Promise.resolve(resolve(value)),
    };
    for (const key of ["select", "eq", "order", "range", "limit"]) q[key] = () => q;
    return q;
  };
  return { from: vi.fn(chain) } as unknown as SupabaseClient<Database>;
}
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
describe("assistente financeiro", () => {
  it("limita intervalo e tamanho da pergunta", () => {
    expect(financialQuestionSchema.safeParse({ ...question, toMonth: "2027-11" }).success).toBe(
      false,
    );
    expect(financialQuestionSchema.safeParse({ ...question, toMonth: "2026-10" }).success).toBe(
      false,
    );
    expect(financialQuestionSchema.safeParse({ ...question, fromMonth: "2026-13" }).success).toBe(
      false,
    );
    expect(
      financialQuestionSchema.safeParse({ ...question, question: "x".repeat(1501) }).success,
    ).toBe(false);
  });
  it("contexto não contém registros pessoais e usa cálculos reais", () => {
    const context = financialAssistantContext([row], [], "2026-11", "2026-11", "2026-11-04");
    expect(JSON.stringify(context)).not.toContain("PRIVATE");
    expect(context.meses[0]?.recebido_liquido).toBe(95);
    expect(context.dre_competencia.profit).toBe(95);
  });
  it("nega não membros antes de consultar dados ou gateway", async () => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    vi.stubEnv("LOVABLE_API_KEY", "test-key");
    const client = db([]);
    const result = await askFinancialData(client, "not-member", question);
    expect(result.ok).toBe(false);
    expect(client.from).toHaveBeenCalledTimes(1);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("não inventa resposta quando falta configuração ou dados falham", async () => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    vi.stubEnv("LOVABLE_API_KEY", "");
    expect((await askFinancialData(db(), "missing-config", question)).ok).toBe(false);
    vi.stubEnv("LOVABLE_API_KEY", "test-key");
    expect((await askFinancialData(db(undefined, true), "db-error", question)).ok).toBe(false);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("usa endpoint autenticado do gateway e envia somente agregados", async () => {
    vi.stubEnv("LOVABLE_API_KEY", "test-key");
    const fetcher = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: "Recebido: R$ 95,00." }, finish_reason: "stop" }],
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetcher);
    const result = await askFinancialData(db(), "valid-user", question);
    expect(result.ok).toBe(true);
    expect(fetcher.mock.calls[0]?.[0]).toBe("https://ai.gateway.lovable.dev/v1/chat/completions");
    const init = fetcher.mock.calls[0]?.[1] as RequestInit;
    expect(init.body).not.toContain("PRIVATE");
    expect(init.body).toContain("recebido_liquido");
    expect((init.headers as Record<string, string>)["Authorization"]).toBe("Bearer test-key");
  });
  it.each([402, 429, 500])("trata erro HTTP %s sem expor corpo do provedor", async (status) => {
    vi.stubEnv("LOVABLE_API_KEY", "test-key");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("PRIVATE_ERROR", { status })));
    const result = await askFinancialData(db(), `http-${status}`, question);
    expect(result.ok).toBe(false);
    expect(JSON.stringify(result)).not.toContain("PRIVATE_ERROR");
  });
});
