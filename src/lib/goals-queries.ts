import { queryOptions } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { validateClinicGoals, type ClinicGoalTargets } from "./finance";

export type ClinicGoalConfig = ClinicGoalTargets & {
  id: string;
  month: string;
  version: number;
  updated_at: string;
  updated_by: string | null;
};
type GoalsDatabase = Omit<Database, "public"> & {
  public: Omit<Database["public"], "Tables"> & {
    Tables: Database["public"]["Tables"] & {
      clinic_monthly_goals: {
        Row: ClinicGoalConfig;
        Insert: ClinicGoalTargets & { month: string };
        Update: Partial<ClinicGoalTargets>;
        Relationships: [];
      };
    };
  };
};
const db = supabase as unknown as SupabaseClient<GoalsDatabase>;
export const clinicGoalsQuery = (month: string) =>
  queryOptions({
    queryKey: ["clinic-goals", month],
    staleTime: 60_000,
    queryFn: async ({ signal }) => {
      const { data, error } = await db
        .from("clinic_monthly_goals")
        .select("*")
        .eq("month", month + "-01")
        .abortSignal(signal)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return {
        ...data,
        ...validateClinicGoals({
          break_even: Number(data.break_even),
          target: Number(data.target),
          super_target: Number(data.super_target),
          mega_target: Number(data.mega_target),
        }),
      };
    },
  });
export async function saveClinicGoals(
  month: string,
  goals: ClinicGoalTargets,
  before: ClinicGoalConfig | null,
) {
  const payload = validateClinicGoals(goals);
  const result = before
    ? await db
        .from("clinic_monthly_goals")
        .update(payload)
        .eq("id", before.id)
        .eq("month", month + "-01")
        .eq("version", before.version)
        .select("id")
    : await db
        .from("clinic_monthly_goals")
        .insert({ ...payload, month: month + "-01" })
        .select("id");
  if (result.error?.code === "23505")
    throw new Error("Outro usuário já definiu as metas deste mês. Atualize para conferir.");
  if (result.error) throw result.error;
  if (!result.data?.length)
    throw new Error("As metas mudaram enquanto você editava. Atualize antes de salvar.");
}
