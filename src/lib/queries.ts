import { effectivePayment, todayISO, type PaymentMode, paymentPatch, txnEditDetails } from "./finance";
import { readPayroll } from "./payroll";
import { canUse } from "./access";
import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { CardSettings, NewTxnRow, Txn, Kind, Nature } from "./finance";

export interface Category {
  id: string;
  name: string;
  kind: Kind;
  nature: Nature | null;
}

const PAGE = 1000;

async function fetchTxns(filter: { column: "due_date" | "competence_date"; from?: string | undefined; to?: string | undefined }) {
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
    const { data, error } = await q;
    if (error) throw error;
    all.push(...((data ?? []) as unknown as Txn[]));
    if (!data || data.length < PAGE) break;
  }
  return all.map((t) => effectivePayment({ ...t,
    gross_amount: Number(t.gross_amount), fee_amount: Number(t.fee_amount), net_amount: Number(t.net_amount),
  }));
}

export const txnsByDueQuery = (from?: string, to?: string) =>
  queryOptions({
    queryKey: ["txns", "due", from ?? "", to ?? "", todayISO()],
    refetchInterval: 60_000,
    queryFn: () => fetchTxns({ column: "due_date", from, to }),
  });

export const txnsByCompetenceQuery = (from?: string, to?: string) =>
  queryOptions({
    queryKey: ["txns", "competence", from ?? "", to ?? "", todayISO()],
    refetchInterval: 60_000,
    queryFn: () => fetchTxns({ column: "competence_date", from, to }),
  });

export const pendingQuery = () => queryOptions({
  queryKey: ["txns", "pending", todayISO()], refetchInterval: 60_000,
  queryFn: async () => (await fetchTxns({ column: "due_date" })).filter(t => t.status === "pendente"),
});

export const categoriesQuery = () =>
  queryOptions({
    queryKey: ["categories"],
    queryFn: async () => {
      const { data, error } = await supabase.from("categories").select("id,name,kind,nature").order("name");
      if (error) throw error;
      return (data ?? []) as Category[];
    },
  });

export const cardSettingsQuery = () =>
  queryOptions({
    queryKey: ["card_settings"],
    queryFn: async () => {
      const { data, error } = await supabase.from("card_settings").select("*").eq("id", 1).maybeSingle();
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
      if (!user) return { user: null, roles: [] as string[], modules: [] as string[], permissionsReady: false, name: "" };
      const [{ data: roles, error: roleError }, { data: profile, error: profileError }] = await Promise.all([
        supabase.from("user_roles").select("role,allowed_modules").eq("user_id", user.id),
        supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle(),
      ]);
      if (profileError) throw profileError;
      if (roleError) {
        if (!roleError.message.includes("allowed_modules")) throw roleError;
        // Rolling deployment: admins can apply the migration; members fail closed.
        const fallback = await supabase.from("user_roles").select("role").eq("user_id", user.id);
        if (fallback.error) throw fallback.error;
        return { user, roles: (fallback.data ?? []).map((r) => r.role as string), modules: [] as string[], permissionsReady: false, name: profile?.full_name || user.email || "" };
      }
      return {
        user, roles: (roles ?? []).map((r) => r.role as string),
        modules: [...new Set((roles ?? []).flatMap((r) => r.allowed_modules ?? []))],
        permissionsReady: true, name: profile?.full_name || user.email || "",
      };
    },
  });

export function useTxnMutations() {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ["txns"] });
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
    onSuccess: invalidate,
  });

  const update = useMutation({
    mutationFn: async ({ txn, mode, paidDate, details }: { txn: Txn; mode: PaymentMode; paidDate: string;
      details?: Pick<Txn, "description" | "person" | "category_id" | "nature" | "payment_method" | "competence_date" | "due_date" | "gross_amount" | "fee_amount" | "net_amount" | "notes"> }) => {
      await requirePermission("baixar");
      if (details) {
        const access = await qc.fetchQuery({ ...myAccessQuery(), staleTime: 0 });
        if (!access.roles.includes("admin")) throw new Error("Somente administradores editam valores e dados do lançamento.");
        if (readPayroll(txn)) throw new Error("Edite a remuneração na aba Colaboradores.");
      }
      const patch = paymentPatch(mode, paidDate);
      const validated = details ? txnEditDetails(txn.kind, details) : undefined;
      let q = supabase.from("transactions").update({ ...validated, ...patch }).eq("id", txn.id)
        .eq("status", txn.recorded_status ?? txn.status).eq("due_date", txn.due_date)
        .eq("gross_amount", txn.gross_amount).eq("fee_amount", txn.fee_amount)
        .eq("description", txn.description).eq("payment_method", txn.payment_method)
        .eq("competence_date", txn.competence_date).eq("net_amount", txn.net_amount);
      for (const field of ["person", "category_id", "nature"] as const)
        q = txn[field] === null ? q.is(field, null) : q.eq(field, txn[field]);
      q = txn.notes === null ? q.is("notes", null) : q.eq("notes", txn.notes);
      q = (txn.recorded_paid_date ?? (txn.recorded_status === undefined ? txn.paid_date : null)) === null
        ? q.is("paid_date", null) : q.eq("paid_date", txn.recorded_paid_date ?? txn.paid_date!);
      if (txn.auto_settle !== undefined) q = q.eq("auto_settle", txn.auto_settle);
      const { data, error } = await q.select("id");
      if (error) throw error;
      if (!data?.length) throw new Error("O lançamento mudou. Atualize a página antes de editar.");
    },
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: async ({ id, groupId }: { id: string; groupId?: string | null }) => {
      await requirePermission("excluir");
      const q = supabase.from("transactions").delete();
      const { error } = groupId ? await q.eq("group_id", groupId) : await q.eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  return { create, update, remove };
}

/** Aggregate usage source: metadata only, without patients or financial values. */
export const usageQuery = () =>
  queryOptions({
    queryKey: ["txns", "usage", todayISO()],
    refetchInterval: 60_000,
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
              .select("created_at,created_by,status,paid_date,kind,due_date,auto_settle")
              .order("id")
              .range(page * PAGE, (page + 1) * PAGE - 1);
            if (error) throw error;
            rows.push(...(data ?? []).map(t => ({ ...t, ...effectivePayment(t as unknown as Txn) })));
            if (!data || data.length < PAGE) return rows;
          }
        })(),
      ]);
      return { profiles, transactions };
    },
  });
