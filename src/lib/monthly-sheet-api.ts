import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import type { Database, Json } from "@/integrations/supabase/types";
import type { ImportEntry } from "./monthly-sheet";
export type ImportRowResult = {
  reference?: string;
  source_key: string;
  status:
    | "new"
    | "imported"
    | "changed"
    | "possible_duplicate"
    | "created"
    | "not_found"
    | "ambiguous"
    | "already_settled";
};
export type ImportResult = {
  rows: ImportRowResult[];
  inserted: number;
  settled: number;
  dry_run: boolean;
};
type ImportDatabase = Omit<Database, "public"> & {
  public: Omit<Database["public"], "Functions"> & {
    Functions: Database["public"]["Functions"] & {
      import_monthly_sheet: {
        Args: { _entries: Json; _file_name: string; _dry_run: boolean };
        Returns: Json;
      };
    };
  };
};
const db = supabase as unknown as SupabaseClient<ImportDatabase>;
export async function importMonthlySheet(
  entries: ImportEntry[],
  fileName: string,
  dryRun = true,
): Promise<ImportResult> {
  const { data, error } = await db.rpc("import_monthly_sheet", {
    _entries: entries.map((e) => ({
      source_key: e.source_key,
      operation: e.operation ?? "create",
      transactions: e.transactions,
      allow_existing: e.allow_existing ?? false,
    })) as unknown as Json,
    _file_name: fileName.slice(0, 240),
    _dry_run: dryRun,
  });
  if (error) throw new Error(error.message);
  return data as unknown as ImportResult;
}
