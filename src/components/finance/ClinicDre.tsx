import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  CLINIC_DRE_LINES,
  FUND_LINES,
  clinicDre,
  clinicDreOverride,
  transactionNotes,
  type ClinicDreLine,
} from "@/lib/clinic-dre";
import {
  addMonths,
  formatBRL,
  formatDate,
  formatMonth,
  monthKey,
  monthRange,
  nextMonths,
  type Txn,
} from "@/lib/finance";
import { categoriesQuery, myAccessQuery, txnsByCompetenceQuery } from "@/lib/queries";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "./LaunchDialog";
import { QueryFeedback } from "./QueryFeedback";

export function ClinicDre({ month }: { month: string }) {
  const [count, setCount] = useState(6);
  const [selected, setSelected] = useState<{ month: string; line: ClinicDreLine } | null>(null);
  const [editing, setEditing] = useState<Txn | null>(null);
  const [reference, setReference] = useState("");
  const [line, setLine] = useState("");
  const start = monthKey(addMonths(monthRange(month).start, 1 - count));
  const months = nextMonths(start, count);
  const rows = useQuery(txnsByCompetenceQuery(monthRange(start).start, monthRange(month).end));
  const categories = useQuery(categoriesQuery());
  const access = useQuery(myAccessQuery());
  const qc = useQueryClient();
  const data = clinicDre(rows.data ?? [], months, categories.data ?? []);
  const active = data.find((m) => m.month === month)!;
  const details =
    data
      .find((m) => m.month === selected?.month)
      ?.allocations.filter((a) => a.line === selected?.line) ?? [];
  const canEdit = access.data?.roles.includes("admin") ?? false;
  const save = useMutation({
    mutationFn: async () => {
      if (!editing) throw new Error("Selecione um lançamento.");
      if (
        !/^\d{4}-\d{2}$/.test(reference) ||
        Number(reference.slice(5)) < 1 ||
        Number(reference.slice(5)) > 12
      )
        throw new Error("Informe o mês de referência.");
      if (line && !CLINIC_DRE_LINES.some(([key]) => key === line))
        throw new Error("Classificação inválida.");
      const latestAccess = await qc.fetchQuery({ ...myAccessQuery(), staleTime: 0 });
      if (!latestAccess.roles.includes("admin") || !latestAccess.user)
        throw new Error("Apenas administradores podem ajustar a referência.");
      const notes = transactionNotes(editing.notes);
      if (line) notes["clinic_dre_line"] = line;
      else delete notes["clinic_dre_line"];
      notes["clinic_dre_review"] = {
        previous_reference: editing.competence_date,
        reference: reference + "-01",
        reviewed_by: latestAccess.user.id,
        reviewed_at: new Date().toISOString(),
      };
      let update = supabase
        .from("transactions")
        .update({ competence_date: reference + "-01", notes: JSON.stringify(notes) })
        .eq("id", editing.id)
        .eq("kind", "saida")
        .eq("competence_date", editing.competence_date)
        .eq("gross_amount", editing.gross_amount)
        .eq("status", editing.status);
      update =
        editing.notes === null ? update.is("notes", null) : update.eq("notes", editing.notes);
      const result = await update.select("id");
      if (result.error) throw result.error;
      if (!result.data?.length)
        throw new Error("O lançamento mudou. Atualize a análise antes de salvar.");
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["txns"] });
      setEditing(null);
      toast.success("Referência e classificação atualizadas.");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Não foi possível atualizar."),
  });
  const beginEdit = (txn: Txn) => {
    setEditing(txn);
    setReference(monthKey(txn.competence_date));
    setLine(clinicDreOverride(txn) ?? "");
  };
  const close = () => {
    setSelected(null);
    setEditing(null);
  };
  return (
    <div className="space-y-4">
      <div className="surface-card flex flex-wrap items-end justify-between gap-4 p-5">
        <div>
          <h2 className="text-lg font-semibold">DRE por referência</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Mesma estrutura da sua gestão. Pagas e pendentes no mês de competência,
            independentemente da data de pagamento.
          </p>
        </div>
        <label>
          Período
          <NativeSelect
            value={count}
            onChange={(e) => {
              setCount(Number(e.target.value));
              close();
            }}
          >
            <option value={3}>3 meses</option>
            <option value={6}>6 meses</option>
            <option value={12}>12 meses</option>
          </NativeSelect>
        </label>
      </div>
      <QueryFeedback
        loading={rows.isPending || categories.isPending}
        error={rows.isError || categories.isError}
        retry={() => {
          void rows.refetch();
          void categories.refetch();
        }}
      >
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="surface-card p-4">
            <p className="text-sm text-muted-foreground">Receita líquida · {formatMonth(month)}</p>
            <strong className="text-xl">{formatBRL(active.revenue)}</strong>
          </div>
          <div className="surface-card p-4">
            <p className="text-sm text-muted-foreground">Despesas · referência do mês</p>
            <strong className="text-xl">{formatBRL(active.expenses)}</strong>
          </div>
          <div className="surface-card p-4">
            <p className="text-sm text-muted-foreground">Disponível após fundos</p>
            <strong className="text-xl">{formatBRL(active.available)}</strong>
          </div>
        </div>
        <section className="surface-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <caption className="sr-only">
                DRE por referência de {formatMonth(start)} a {formatMonth(month)}
              </caption>
              <thead className="bg-muted/40">
                <tr>
                  <th className="sticky left-0 z-10 min-w-72 bg-muted px-4 py-3 text-left">
                    DESPESAS / RESULTADO
                  </th>
                  {months.map((m) => (
                    <th
                      key={m}
                      className={`min-w-32 px-4 py-3 text-right whitespace-nowrap ${m === month ? "bg-primary/10" : ""}`}
                    >
                      {formatMonth(m)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {CLINIC_DRE_LINES.map(([key, label]) => (
                  <tr key={key} className="border-t border-border">
                    <th
                      scope="row"
                      className="sticky left-0 z-10 bg-background px-4 py-3 text-left text-xs font-medium"
                    >
                      {label}
                      {FUND_LINES.has(key) && <span className="ml-1 text-muted-foreground">*</span>}
                    </th>
                    {data.map((m) => (
                      <td
                        key={m.month}
                        className={`px-4 py-2 text-right tabular whitespace-nowrap ${m.month === month ? "bg-primary/5" : ""}`}
                      >
                        <button
                          type="button"
                          className="rounded px-1 py-1 hover:bg-muted focus-visible:outline focus-visible:outline-primary"
                          aria-label={`Detalhar ${label} em ${formatMonth(m.month)}`}
                          onClick={() => {
                            setSelected({ month: m.month, line: key });
                            setEditing(null);
                          }}
                        >
                          {formatBRL(m.totals[key])}
                        </button>
                      </td>
                    ))}
                  </tr>
                ))}
                <tr className="border-t-2 border-border bg-primary/10 font-semibold">
                  <th scope="row" className="sticky left-0 z-10 bg-muted px-4 py-4 text-left">
                    LUCRO
                  </th>
                  {data.map((m) => (
                    <td
                      key={m.month}
                      className={`px-5 py-4 text-right tabular whitespace-nowrap ${m.profit < 0 ? "text-expense" : "text-income"}`}
                    >
                      {formatBRL(m.profit)}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
          <div className="space-y-2 border-t border-border p-4 text-xs text-muted-foreground">
            <p>
              Clique em um valor para conferir os lançamentos, a referência e o pagamento. Zero
              significa ausência de lançamentos classificados naquela linha.
            </p>
            <p>
              Lucro gerencial = receitas líquidas de taxas atribuídas ao mês − despesas do mês. *
              Fundos são destinações do resultado, separados das despesas; não há provisões ou
              reservas automáticas. O disponível desconta os fundos registrados.
            </p>
            <p>
              Classificação automática pela descrição e pela folha. Valores sem identificação
              suficiente ficam em Demais despesas para revisão. Receita e resultado refletem os
              lançamentos existentes.
            </p>
          </div>
        </section>
        {selected && (
          <section className="surface-card p-5" aria-label="Lançamentos da linha">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h3 className="font-semibold">
                  {CLINIC_DRE_LINES.find(([key]) => key === selected.line)?.[1]}
                </h3>
                <p className="text-sm text-muted-foreground">
                  Referência: {formatMonth(selected.month, true)} ·{" "}
                  {formatBRL(details.reduce((sum, a) => sum + a.amount, 0))}
                </p>
              </div>
              <Button variant="outline" onClick={close} disabled={save.isPending}>
                Fechar
              </Button>
            </div>
            {!details.length ? (
              <p className="text-sm text-muted-foreground">
                Nenhum lançamento nesta linha e referência.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr>
                      {[
                        "Lançamento",
                        "Composição",
                        "Referência",
                        "Pagamento",
                        "Valor nesta linha",
                        "Classificação",
                      ].map((h) => (
                        <th key={h} className="p-2 text-left">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {details.map((a) => (
                      <tr key={a.txn.id + a.line} className="border-t border-border">
                        <td className="p-2">{a.txn.description}</td>
                        <td className="p-2 text-xs text-muted-foreground">{a.detail}</td>
                        <td className="p-2 whitespace-nowrap">
                          {formatMonth(monthKey(a.txn.competence_date))}
                        </td>
                        <td className="p-2 whitespace-nowrap">
                          {a.txn.status === "pago" ? formatDate(a.txn.paid_date) : "Pendente"}
                        </td>
                        <td className="p-2 tabular whitespace-nowrap">{formatBRL(a.amount)}</td>
                        <td className="p-2">
                          {a.manual ? "Revisada" : a.line === "other" ? "Revisar" : "Automática"}
                          {canEdit && (
                            <Button
                              className="ml-2"
                              size="sm"
                              variant="outline"
                              onClick={() => beginEdit(a.txn)}
                              disabled={save.isPending}
                            >
                              Ajustar referência / linha
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {editing && (
              <form
                className="mt-5 space-y-3 rounded-lg border border-border p-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!save.isPending) save.mutate();
                }}
              >
                <p className="font-medium">{editing.description}</p>
                <fieldset disabled={save.isPending} className="grid gap-4 sm:grid-cols-2">
                  <label>
                    Mês de referência
                    <Input
                      type="month"
                      required
                      value={reference}
                      onChange={(e) => setReference(e.target.value)}
                    />
                  </label>
                  <label>
                    Linha do DRE
                    <NativeSelect value={line} onChange={(e) => setLine(e.target.value)}>
                      <option value="">Automática (separar componentes da folha)</option>
                      {CLINIC_DRE_LINES.map(([key, label]) => (
                        <option key={key} value={key}>
                          {label}
                        </option>
                      ))}
                    </NativeSelect>
                  </label>
                </fieldset>
                <p className="text-xs text-muted-foreground">
                  A classificação manual aplica o valor inteiro à linha escolhida. A data de
                  pagamento e o valor serão preservados.
                </p>
                <Button type="submit" disabled={save.isPending}>
                  {save.isPending ? "Salvando…" : "Salvar referência e linha"}
                </Button>{" "}
                <Button
                  type="button"
                  variant="outline"
                  disabled={save.isPending}
                  onClick={() => setEditing(null)}
                >
                  Cancelar
                </Button>
              </form>
            )}
          </section>
        )}
      </QueryFeedback>
    </div>
  );
}
