import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { pageHead } from "@/lib/head";
import {
  formatBRL,
  formatDate,
  monthKey,
  monthRange,
  payrollTotal,
  todayISO,
  type Txn,
  type PaymentMethod,
} from "@/lib/finance";
import { payrollSchema, readPayroll, type Payroll } from "@/lib/payroll";
import { categoriesQuery, myAccessQuery, txnsByCompetenceQuery } from "@/lib/queries";
import { supabase } from "@/integrations/supabase/client";
import { MonthPicker, PageHeader } from "@/components/finance/ui";
import { NativeSelect } from "@/components/finance/LaunchDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/_authenticated/colaboradores")({
  head: () => pageHead("Colaboradores", "Remuneração mensal de funcionários e dentistas."),
  component: Colaboradores,
});
function Colaboradores() {
  const [month, setMonth] = useState(monthKey(todayISO()));
  return (
    <div>
      <PageHeader
        title="Colaboradores"
        subtitle="Salários, comissões e pagamentos de dentistas por mês"
        actions={<MonthPicker value={month} onChange={setMonth} />}
      />
      <MonthlyPayroll key={month} month={month} />
    </div>
  );
}
const fields = [
  ["base", "Salário fixo / valor do dentista"],
  ["additional", "Adicionais"],
  ["commission", "Comissão"],
  ["bonus", "Bonificação"],
  ["termination", "Acerto final / rescisão"],
  ["vacation", "Férias"],
  ["discount", "Descontos"],
] as const;
function MonthlyPayroll({ month }: { month: string }) {
  const range = monthRange(month);
  const query = useQuery(txnsByCompetenceQuery(range.start, range.end));
  const categories = useQuery(categoriesQuery());
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Txn | null>(null);
  const [form, setForm] = useState<Payroll | null>(null);
  const [due, setDue] = useState(range.end);
  const [method, setMethod] = useState<PaymentMethod>("pix");
  const [category, setCategory] = useState("");
  const [removeId, setRemoveId] = useState<string | null>(null);
  const rows = (query.data ?? []).flatMap((txn) => {
    const payroll = readPayroll(txn);
    return payroll ? [{ txn, payroll }] : [];
  });
  const invalidate = () => qc.invalidateQueries({ queryKey: ["txns"] });
  async function requireAdmin() {
    const access = await qc.fetchQuery({ ...myAccessQuery(), staleTime: 0 });
    if (!access.roles.includes("admin") || !access.user)
      throw new Error("Apenas administradores podem alterar a folha.");
    return access.user.id;
  }
  const save = useMutation({
    mutationFn: async () => {
      const userId = await requireAdmin();
      const data = payrollSchema.parse(form);
      const amount = payrollTotal(data);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(due)) throw new Error("Informe o vencimento.");
      const payload = {
        kind: "saida" as const,
        description: `${data.group === "funcionario" ? "Funcionário" : "Dentista"}: ${data.name}`,
        person: data.name,
        category_id: category || null,
        nature: data.group === "funcionario" ? ("fixa" as const) : ("variavel" as const),
        payment_method: method,
        competence_date: range.start,
        due_date: due,
        gross_amount: amount,
        net_amount: amount,
        fee_amount: 0,
        notes: JSON.stringify(data),
      };
      const result = editing
        ? await supabase
            .from("transactions")
            .update(payload)
            .eq("id", editing.id)
            .eq("status", "pendente")
            .select("id")
        : await supabase
            .from("transactions")
            .insert({ ...payload, status: "pendente", created_by: userId })
            .select("id");
      if (result.error) throw result.error;
      if (!result.data?.length)
        throw new Error("O lançamento mudou. Atualize a folha antes de editar.");
    },
    onSuccess: async () => {
      await invalidate();
      setForm(null);
      setEditing(null);
      toast.success("Remuneração salva neste mês");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Não foi possível salvar"),
  });
  const remove = useMutation({
    mutationFn: async (id: string) => {
      await requireAdmin();
      const result = await supabase
        .from("transactions")
        .delete()
        .eq("id", id)
        .eq("status", "pendente")
        .select("id");
      if (result.error) throw result.error;
      if (!result.data?.length)
        throw new Error("Pagamento já baixado ou alterado. Atualize a folha.");
    },
    onSuccess: async () => {
      await invalidate();
      setRemoveId(null);
      toast.success("Retirado apenas deste mês");
    },
    onError: (e) => toast.error(e.message),
  });
  function open(txn?: Txn, payroll?: Payroll) {
    setEditing(txn ?? null);
    setRemoveId(null);
    setForm(
      payroll ?? {
        source: "essencial-payroll-v1",
        group: "funcionario",
        name: "",
        role: "",
        termination: 0,
        vacation: 0,
        base: 0,
        additional: 0,
        commission: 0,
        bonus: 0,
        discount: 0,
      },
    );
    setDue(txn?.due_date ?? range.end);
    setMethod(txn?.payment_method ?? "pix");
    setCategory(txn?.category_id ?? "");
  }
  let total: number | null = null;
  if (form) {
    try {
      total = payrollTotal(form);
    } catch {
      /* invalid total is shown below */
    }
  }
  if (query.isPending) return <p role="status">Carregando folha…</p>;
  if (query.isError)
    return (
      <div role="alert">
        Não foi possível carregar a folha.{" "}
        <Button onClick={() => void query.refetch()}>Tentar novamente</Button>
      </div>
    );
  return (
    <>
      <div className="surface-card mb-4 p-5">
        <p className="text-sm text-muted-foreground">
          Cada inclusão vale somente para o mês selecionado. Salvar cria uma despesa pendente que já
          aparece em Contas e no DRE. Faça a baixa em Contas quando pagar. Edite aqui para evitar
          lançar a mesma remuneração duas vezes.
        </p>
        <Button className="mt-3" onClick={() => open()} disabled={!!form}>
          Acrescentar colaborador neste mês
        </Button>
      </div>
      {form && (
        <form
          className="surface-card mb-4 space-y-4 p-5"
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            if (!save.isPending) save.mutate();
          }}
        >
          <h2 className="text-lg font-semibold">
            {editing ? "Editar remuneração deste mês" : "Acrescentar colaborador"}
          </h2>
          <fieldset disabled={save.isPending} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <label>
              Grupo
              <NativeSelect
                value={form.group}
                onChange={(e) => setForm({ ...form, group: e.target.value as Payroll["group"] })}
              >
                <option value="funcionario">Funcionário fixo</option>
                <option value="dentista">Dentista</option>
              </NativeSelect>
            </label>
            <label>
              Nome
              <Input
                required
                maxLength={120}
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </label>
            <label>
              Função
              <Input
                maxLength={120}
                value={form.role}
                onChange={(e) => setForm({ ...form, role: e.target.value })}
              />
            </label>
            {fields.map(([key, label]) => (
              <div key={key}>
                <Label htmlFor={`pay-${key}`}>{label} (R$)</Label>
                <Input
                  id={`pay-${key}`}
                  type="number"
                  min="0"
                  max="999999999"
                  step="0.01"
                  required
                  value={form[key]}
                  onChange={(e) =>
                    setForm({ ...form, [key]: e.target.value === "" ? 0 : Number(e.target.value) })
                  }
                />
              </div>
            ))}
            <label>
              Vencimento
              <Input required type="date" value={due} onChange={(e) => setDue(e.target.value)} />
            </label>
            <label>
              Forma de pagamento
              <NativeSelect
                value={method}
                onChange={(e) => setMethod(e.target.value as PaymentMethod)}
              >
                <option value="pix">Pix</option>
                <option value="dinheiro">Dinheiro</option>
                <option value="transferencia">Transferência</option>
                <option value="boleto">Boleto</option>
              </NativeSelect>
            </label>
            <label>
              Categoria
              <NativeSelect value={category} onChange={(e) => setCategory(e.target.value)}>
                <option value="">Sem categoria</option>
                {(categories.data ?? [])
                  .filter((c) => c.kind === "saida")
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
              </NativeSelect>
            </label>
          </fieldset>
          <p className="font-semibold" aria-live="polite">
            Total a pagar: {total === null ? "Descontos ou valores inválidos" : formatBRL(total)}
          </p>
          <Button
            disabled={
              save.isPending || total === null || categories.isPending || categories.isError
            }
            type="submit"
          >
            {save.isPending ? "Salvando…" : "Salvar neste mês"}
          </Button>{" "}
          <Button
            disabled={save.isPending}
            type="button"
            variant="outline"
            onClick={() => setForm(null)}
          >
            Cancelar
          </Button>
          {categories.isError && (
            <p role="alert">
              Não foi possível carregar categorias.{" "}
              <button type="button" className="underline" onClick={() => void categories.refetch()}>
                Tentar novamente
              </button>
            </p>
          )}
        </form>
      )}
      {(["funcionario", "dentista"] as const).map((group) => {
        const entries = rows.filter((r) => r.payroll.group === group);
        return (
          <section key={group} className="surface-card mb-4 overflow-hidden">
            <div className="flex justify-between gap-3 p-5">
              <h2 className="text-lg font-semibold">
                {group === "funcionario" ? "Funcionários fixos" : "Dentistas"}
              </h2>
              <strong>{formatBRL(entries.reduce((sum, r) => sum + r.txn.gross_amount, 0))}</strong>
            </div>
            {!entries.length ? (
              <p className="px-5 pb-5 text-muted-foreground">
                Nenhum colaborador neste grupo no mês.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr>
                      {[
                        "Nome / função",
                        "Base",
                        "Adicionais",
                        "Comissão",
                        "Bonificação",
                        "Acerto final",
                        "Férias",
                        "Descontos",
                        "Total",
                        "Vencimento / situação",
                        "Ações",
                      ].map((h) => (
                        <th key={h} className="px-4 py-3 text-left">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {entries.map(({ txn, payroll }) => (
                      <tr key={txn.id} className="border-t border-border">
                        <td className="px-4 py-3">
                          {payroll.name}
                          <p className="text-xs text-muted-foreground">{payroll.role}</p>
                        </td>
                        {fields.map(([key]) => (
                          <td key={key} className="px-4 py-3 tabular whitespace-nowrap">
                            {formatBRL(payroll[key])}
                          </td>
                        ))}
                        <td className="px-4 py-3 font-semibold tabular whitespace-nowrap">
                          {formatBRL(txn.gross_amount)}
                        </td>
                        <td className="px-4 py-3">
                          {formatDate(txn.due_date)}
                          <p>
                            {txn.status === "pago"
                              ? `Pago em ${formatDate(txn.paid_date)}`
                              : "Pendente"}
                          </p>
                        </td>
                        <td className="px-4 py-3">
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={txn.status === "pago" || !!form || remove.isPending}
                            onClick={() => open(txn, payroll)}
                          >
                            Editar
                          </Button>{" "}
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={txn.status === "pago" || !!form || remove.isPending}
                            onClick={() => setRemoveId(txn.id)}
                          >
                            Retirar do mês
                          </Button>
                          {removeId === txn.id && (
                            <div className="mt-2">
                              <p>Retirar esta despesa pendente somente deste mês?</p>
                              <Button
                                size="sm"
                                disabled={remove.isPending}
                                onClick={() => remove.mutate(txn.id)}
                              >
                                Confirmar retirada
                              </Button>{" "}
                              <Button size="sm" variant="outline" onClick={() => setRemoveId(null)}>
                                Cancelar
                              </Button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="px-5 pb-4 text-xs text-muted-foreground">
              {group === "funcionario"
                ? "Despesas classificadas como fixas, incluindo os ajustes mensais informados."
                : "Despesas classificadas como variáveis."}{" "}
              Para editar ou retirar um pagamento já baixado, desfaça a baixa em Contas primeiro.
            </p>
          </section>
        );
      })}
    </>
  );
}
