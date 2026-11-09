import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { loadOverview } from "./overview.server";
export const getOverview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/) }))
  .handler(({ data, context }) => loadOverview(context.supabase, context.userId, data.month));
