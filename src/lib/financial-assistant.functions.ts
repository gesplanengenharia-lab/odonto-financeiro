import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { financialQuestionSchema } from "./financial-assistant-schema";
import { askFinancialData } from "./financial-assistant.server";

export const askFinancialAssistant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(financialQuestionSchema)
  .handler(({ data, context }) => askFinancialData(context.supabase, context.userId, data));
