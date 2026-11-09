import { canUse } from "./access";
import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  transactionDetails,
  type CardSettings,
  type NewTxnRow,
  type Txn,
  type Kind,
  type Nature,
  type TransactionDetails,
} from "./finance";

export interface Category {
  id: string;
  name: string;
  kind: Kind;
  nature: Nature | null;
}

const PAGE = 1000;

async function fetchTxns(
  filter: {
    column: "due_date" | "competence_date";
    from?: string | undefined;
    to?: string | undefined;
    status?: "pendente";
  },
  signal?: AbortSignal,
) {
  const all: Txn[] = [];
  for (let page = 0; ; page++) {
    let q = supabase
      .from("transactions")
      .select("*")
      .order(filter.column, { ascending: true })
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .range(page * PAGE, page * PAGE + PAGE - 1);
    if (filter.from) q = q.gte(filter.column, filter.from);
    if (filter.to) q = q.lte(filter.column, filter.to);
    if (filter.status) q = q.eq("status", filter.status);
    const { data, error } = await (signal ? q.abortSignal(signal) : q);
    if (error) throw error;
    all.push(...((data ?? []) as unknown as Txn[]));
    if (!data || data.length < PAGE) break;
  }
  return all.map((t) => ({
    ...t,
    gross_amount: Number(t.gross_amount),
    fee_amount: Number(t.fee_amount),
    net_amount: Number(t.net_amount),
  }));
}

export const txnsByDueQuery = (from?: string, to?: string) =>
  queryOptions({
    queryKey: ["txns", "due", from ?? "", to ?? ""],
    queryFn: ({ signal }) => fetchTxns({ column: "due_date", from, to }, signal),
  });

export const txnsByCompetenceQuery = (from?: string, to?: string) =>
  queryOptions({
    queryKey: ["txns", "competence", from ?? "", to ?? ""],
    queryFn: ({ signal }) => fetchTxns({ column: "competence_date", from, to }, signal),
  });

export const pendingQuery = () =>
  queryOptions({
    queryKey: ["txns", "pending"],
    queryFn: ({ signal }) => fetchTxns({ column: "due_date", status: "pendente" }, signal),
  });

export const categoriesQuery = () =>
  queryOptions({
    queryKey: ["categories"],
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("categories")
        .select("id,name,kind,nature")
        .order("name");
      if (error) throw error;
      return (data ?? []) as Category[];
    },
  });

export const cardSettingsQuery = () =>
  queryOptions({
    queryKey: ["card_settings"],
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("card_settings")
        .select("*")
        .eq("id", 1)
        .maybeSingle();
      if (error) throw error;
      const d = data ?? {
        debit_fee: 1.5,
        debit_days: 1,
        credit_fee_1x: 3.2,
        credit_fee_2_6: 4.5,
        credit_fee_7_12: 5.5,
        credit_days: 30,
      };
      return {
        debit_fee: Number(d.debit_fee),
        debit_days: Number(d.debit_days),
        credit_fee_1x: Number(d.credit_fee_1x),
        credit_fee_2_6: Number(d.credit_fee_2_6),
        credit_fee_7_12: Number(d.credit_fee_7_12),
        credit_days: Number(d.credit_days),
      } as CardSettings;
    },
  });

export const myAccessQuery = () =>
  queryOptions({
    queryKey: ["my_access"],
    queryFn: async () => {
      const { data: userData } = await supabase.auth.getUser();
      const user = userData.user;
      if (!user)
        return {
          user: null,
          roles: [] as string[],
          modules: [] as string[],
          permissionsReady: false,
          name: "",
        };
      const [{ data: roles, error: roleError }, { data: profile, error: profileError }] =
        await Promise.all([
          supabase.from("user_roles").select("role,allowed_modules").eq("user_id", user.id),
          supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle(),
        ]);
      if (profileError) throw profileError;
      if (roleError) {
        if (!roleError.message.includes("allowed_modules")) throw roleError;
        // Rolling deployment: admins can apply the migration; members fail closed.
        const fallback = await supabase.from("user_roles").select("role").eq("user_id", user.id);
        if (fallback.error) throw fallback.error;
        return {
          user,
          roles: (fallback.data ?? []).map((r) => r.role as string),
          modules: [] as string[],
          permissionsReady: false,
          name: profile?.full_name || user.email || "",
        };
      }
      return {
        user,
        roles: (roles ?? []).map((r) => r.role as string),
        modules: [...new Set((roles ?? []).flatMap((r) => r.allowed_modules ?? []))],
        permissionsReady: true,
        name: profile?.full_name || user.email || "",
      };
    },
  });

export function useTxnMutations() {
  const qc = useQueryClient();
  const invalidate = (rows?: Pick<Txn, "due_date" | "competence_date">[], treasury = true) =>
    Promise.all([
      qc.invalidateQueries({
        predicate: (query) => {
          const [root, mode, from, to] = query.queryKey;
          if (root !== "txns") return false;
          // Keep unrelated monthly lists cached. Global alerts and outstanding totals
          // can change across months, so snapshots are deliberately invalidated.
          if (
            rows?.length &&
            (mode === "due" || mode === "competence") &&
            typeof from === "string" &&
            typeof to === "string" &&
            from &&
            to
          )
            return rows.some((row) => {
              const date = mode === "due" ? row.due_date : row.competence_date;
              return date >= from && date <= to;
            });
          return true;
        },
      }),
      ...(treasury ? [qc.invalidateQueries({ queryKey: ["treasury"] })] : []),
    ]);
  const requirePermission = async (module: string) => {
    const access = await qc.fetchQuery({ ...myAccessQuery(), staleTime: 0 });
    if (!canUse(access, module)) throw new Error("Você não tem permissão para esta operação.");
  };

  const create = useMutation({
    mutationFn: async (rows: NewTxnRow[]) => {
      await requirePermission("lancamentos");
      if (rows.some((r) => r.status === "pago")) await requirePermission("baixar");
      const { data: u } = await supabase.auth.getUser();
      const { error } = await supabase
        .from("transactions")
        .insert(rows.map((r) => ({ ...r, created_by: u.user?.id ?? null })));
      if (error) throw error;
    },
    onSuccess: (_, rows) =>
      invalidate(
        rows,
        rows.some((row) => row.status === "pago"),
      ),
  });

  const setPaid = useMutation({
    mutationFn: async ({ ids, paid, date }: { ids: string[]; paid: boolean; date?: string }) => {
      await requirePermission("baixar");
      const { error } = await supabase
        .from("transactions")
        // Undoing a payment marks the row as manual so the daily auto-settle won't re-pay it (inadimplência).
        .update(
          paid
            ? { status: "pago", paid_date: date ?? new Date().toISOString().slice(0, 10) }
            : { status: "pendente", paid_date: null, auto_settle: false },
        )
        .in("id", ids);
      if (error) throw error;
    },
    onSuccess: () => invalidate(),
  });

  const remove = useMutation({
    mutationFn: async ({ id, groupId }: { id: string; groupId?: string | null }) => {
      await requirePermission("excluir");
      const q = supabase.from("transactions").delete();
      const { error } = groupId ? await q.eq("group_id", groupId) : await q.eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => invalidate(),
  });

  const edit = useMutation({
    mutationFn: async ({
      original,
      details,
    }: {
      original: Txn;
      details: Omit<TransactionDetails, "net_amount">;
    }) => {
      await requirePermission("editar"); // Only administrators have this capability.
      const patch = transactionDetails(original, details);
      let query = supabase
        .from("transactions")
        .update(patch)
        .eq("id", original.id)
        .eq("gross_amount", original.gross_amount)
        .eq("fee_amount", original.fee_amount)
        .eq("due_date", original.due_date)
        .eq("competence_date", original.competence_date)
        .eq("status", original.status)
        .eq("description", original.description)
        .eq("net_amount", original.net_amount);
      for (const field of ["person", "category_id", "nature", "paid_date"] as const) {
        const value = original[field];
        query = value === null ? query.is(field, null) : query.eq(field, value);
      }
      const { data, error } = await query.select("id").maybeSingle();
      if (error) throw error;
      if (!data)
        throw new Error(
          "O lançamento foi alterado por outra pessoa ou você não tem permissão. Atualize a lista e tente novamente.",
        );
    },
    onSuccess: (_, { original, details }) =>
      invalidate(
        [original, { ...original, ...transactionDetails(original, details) }],
        original.status === "pago",
      ),
  });

  return { create, setPaid, remove, edit };
}

/** Aggregate usage source: metadata only, without patients or financial values. */
export const usageQuery = () =>
  queryOptions({
    queryKey: ["txns", "usage"],
    queryFn: async () => {
      const [profiles, transactions] = await Promise.all([
        (async () => {
          const rows: { created_at: string }[] = [];
          for (let page = 0; ; page++) {
            const { data, error } = await supabase
              .from("profiles")
              .select("created_at")
              .order("id")
              .range(page * PAGE, (page + 1) * PAGE - 1);
            if (error) throw error;
            rows.push(...(data ?? []));
            if (!data || data.length < PAGE) return rows;
          }
        })(),
        (async () => {
          const rows: import("./usage-analytics").UsageTransaction[] = [];
          for (let page = 0; ; page++) {
            const { data, error } = await supabase
              .from("transactions")
              .select("created_at,created_by,status,paid_date,kind")
              .order("id")
              .range(page * PAGE, (page + 1) * PAGE - 1);
            if (error) throw error;
            rows.push(...(data ?? []));
            if (!data || data.length < PAGE) return rows;
          }
        })(),
      ]);
      return { profiles, transactions };
    },
  });
