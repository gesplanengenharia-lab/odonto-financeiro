import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Target, Trophy, ShieldCheck, TrendingUp } from "lucide-react";
import { toast } from "sonner";
import {
  addMonths,
  clinicGoalsProgress,
  formatBRL,
  formatMonth,
  formatPct,
  monthKey,
  monthRange,
  suggestClinicGoals,
  todayISO,
  type ClinicGoalTargets,
} from "@/lib/finance";
import { clinicDre } from "@/lib/clinic-dre";
import { clinicGoalsQuery, saveClinicGoals, type ClinicGoalConfig } from "@/lib/goals-queries";
import { analysisRowsQuery } from "@/lib/performance-queries";
import { myAccessQuery, txnsByCompetenceQuery } from "@/lib/queries";
import { QueryFeedback } from "./QueryFeedback";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const fields = [
  [
    "break_even",
    "Clínica se paga",
    "Valor líquido necessário para cobrir o custo mensal planejado.",
  ],
  ["target", "Meta", "Primeiro objetivo acima do custo da clínica."],
  ["super_target", "Super Meta", "Resultado acima da meta principal."],
  ["mega_target", "Mega Meta", "Objetivo de maior crescimento para o mês."],
] as const;
const emptyDraft = () => ({ break_even: "", target: "", super_target: "", mega_target: "" });
const draftOf = (goals: ClinicGoalTargets) => ({
  break_even: String(goals.break_even),
  target: String(goals.target),
  super_target: String(goals.super_target),
  mega_target: String(goals.mega_target),
});

export function ClinicGoals({ month }: { month: string }) {
  const today = todayISO(),
    range = monthRange(month);
  const qc = useQueryClient();
  const config = useQuery(clinicGoalsQuery(month));
  const receipts = useQuery(analysisRowsQuery("metas", month, today, range.start));
  const access = useQuery(myAccessQuery());
  const [editing, setEditing] = useState(false);
  const [before, setBefore] = useState<ClinicGoalConfig | null>(null);
  const [draft, setDraft] = useState(emptyDraft);
  const priorMonth = monthKey(addMonths(range.start, -1));
  const previous = useQuery({ ...clinicGoalsQuery(priorMonth), enabled: editing });
  const expenses = useQuery({ ...txnsByCompetenceQuery(range.start, range.end), enabled: editing });
  const expenseBase = clinicDre(expenses.data ?? [], [month])[0]!.expenses;
  const progress = clinicGoalsProgress(receipts.data ?? [], month, config.data ?? null, today);
  const canEdit = access.data?.roles.includes("admin") ?? false;
  const save = useMutation({
    mutationFn: async () => {
      const permission = await qc.fetchQuery({ ...myAccessQuery(), staleTime: 0 });
      if (!permission.roles.includes("admin"))
        throw new Error("Apenas administradores podem definir as metas.");
      const goals = Object.fromEntries(
        fields.map(([key]) => [key, draft[key] === "" ? NaN : Number(draft[key])]),
      ) as ClinicGoalTargets;
      await saveClinicGoals(month, goals, before);
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["clinic-goals", month] });
      setEditing(false);
      toast.success("Metas deste mês salvas.");
    },
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : "Não foi possível salvar as metas."),
  });
  function open() {
    setBefore(config.data ?? null);
    setDraft(config.data ? draftOf(config.data) : emptyDraft());
    setEditing(true);
  }
  const reached = progress.levels.filter((level) => level.reached).length;
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">Metas da clínica</h2>
          <p className="text-sm text-muted-foreground">
            Recebimentos líquidos de {formatMonth(month, true)}. Cada mês tem seu próprio
            planejamento.
          </p>
        </div>
        {canEdit && !editing && (
          <Button onClick={open} disabled={config.isPending || config.isError}>
            <Target className="mr-2 h-4 w-4" />
            {config.data ? "Editar metas do mês" : "Definir metas do mês"}
          </Button>
        )}
      </div>
      <QueryFeedback
        loading={config.isPending || receipts.isPending}
        error={config.isError || receipts.isError}
        retry={() => {
          void config.refetch();
          void receipts.refetch();
        }}
      >
        {editing && (
          <form
            className="surface-card space-y-5 p-5 sm:p-6"
            onSubmit={(e) => {
              e.preventDefault();
              if (!save.isPending) save.mutate();
            }}
          >
            <div>
              <h3 className="font-semibold">Planejamento de {formatMonth(month, true)}</h3>
              <p className="text-sm text-muted-foreground">
                Defina valores líquidos a receber. A base para a clínica se pagar deve incluir os
                custos que você prevê para o mês.
              </p>
            </div>
            <fieldset
              disabled={save.isPending}
              className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
            >
              {fields.map(([key, label, hint]) => (
                <div key={key}>
                  <Label htmlFor={"goal-" + key}>{label} (R$)</Label>
                  <Input
                    className="mt-2"
                    id={"goal-" + key}
                    type="number"
                    step="0.01"
                    min="0.01"
                    max="999999999"
                    required
                    value={draft[key]}
                    onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
                  />
                  <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
                </div>
              ))}
            </fieldset>
            <div className="rounded-lg bg-muted/40 p-4">
              <p className="text-sm">
                Precisa de uma base? Despesas já lançadas na referência:{" "}
                <strong>
                  {expenses.isPending
                    ? "Carregando…"
                    : expenses.isError
                      ? "Indisponível"
                      : formatBRL(expenseBase)}
                </strong>
                .
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                A sugestão usa essas despesas, sem fundos, e propõe Meta +20%, Super Meta +50% e
                Mega Meta +100%, arredondadas para cima. Revise custos ainda não lançados; só será
                aplicada ao salvar.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={
                    save.isPending || expenses.isPending || expenses.isError || expenseBase <= 0
                  }
                  onClick={() => {
                    try {
                      setDraft(draftOf(suggestClinicGoals(expenseBase)));
                    } catch (e) {
                      toast.error(
                        e instanceof Error ? e.message : "Não foi possível sugerir metas.",
                      );
                    }
                  }}
                >
                  Sugerir metas pelas despesas
                </Button>
                {previous.data && (
                  <Button
                    type="button"
                    variant="outline"
                    disabled={save.isPending}
                    onClick={() => setDraft(draftOf(previous.data!))}
                  >
                    Copiar metas de {formatMonth(priorMonth)}
                  </Button>
                )}
              </div>
              {expenses.isError && (
                <button
                  type="button"
                  className="mt-2 text-xs underline"
                  onClick={() => void expenses.refetch()}
                >
                  Tentar carregar despesas novamente
                </button>
              )}
            </div>
            <Button type="submit" disabled={save.isPending}>
              {save.isPending ? "Salvando…" : "Salvar metas deste mês"}
            </Button>{" "}
            <Button
              type="button"
              variant="outline"
              disabled={save.isPending}
              onClick={() => setEditing(false)}
            >
              Cancelar
            </Button>
          </form>
        )}
        <section className="surface-card overflow-hidden">
          <div className="grid gap-6 p-5 sm:p-6 lg:grid-cols-[1.2fr_1fr]">
            <div>
              <p className="text-sm text-muted-foreground">Já recebido no mês · líquido de taxas</p>
              <p className="mt-2 text-3xl font-semibold tabular sm:text-4xl">
                {formatBRL(progress.received)}
              </p>
              <p className="mt-3 text-sm">
                {!config.data ? (
                  "Defina as metas para acompanhar quanto falta para a clínica se pagar."
                ) : progress.surplus! >= 0 ? (
                  <span className="text-income">
                    Custo planejado coberto · {formatBRL(progress.surplus!)} acima da base.
                  </span>
                ) : (
                  <span>
                    Faltam <strong>{formatBRL(-progress.surplus!)}</strong> para cobrir o custo
                    planejado.
                  </span>
                )}
              </p>
            </div>
            <div className="rounded-xl bg-muted/40 p-4">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-primary" />
                <h3 className="font-semibold">
                  {progress.next
                    ? "Próximo nível: " + progress.next.label
                    : config.data
                      ? "Mega Meta alcançada"
                      : "Seu próximo objetivo"}
                </h3>
              </div>
              {progress.next ? (
                <>
                  <p className="mt-2 text-2xl font-semibold tabular">
                    {formatBRL(progress.next.remaining)}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    a receber para atingir este nível
                  </p>
                  <p className="mt-3 text-sm">
                    {progress.next.daily === null ? (
                      "Mês encerrado: resultado final abaixo deste nível."
                    ) : (
                      <>
                        <strong>{formatBRL(progress.next.daily)}</strong> por dia corrido restante ·{" "}
                        {progress.daysRemaining} dia(s).
                      </>
                    )}
                  </p>
                </>
              ) : (
                <p className="mt-3 text-sm text-muted-foreground">
                  {config.data
                    ? "Os quatro níveis foram atingidos pelos recebimentos registrados."
                    : "Clínica se paga → Meta → Super Meta → Mega Meta."}
                </p>
              )}
            </div>
          </div>
        </section>
        {config.data ? (
          <section
            aria-label="Níveis de metas"
            className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
          >
            {progress.levels.map((level, i) => (
              <article
                key={level.key}
                className={"surface-card p-5 " + (level.reached ? "border-income/40" : "")}
              >
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-semibold">{level.label}</h3>
                  {i === 0 ? (
                    <ShieldCheck className="h-5 w-5 text-primary" />
                  ) : (
                    <Trophy
                      className={
                        "h-5 w-5 " + (level.reached ? "text-income" : "text-muted-foreground")
                      }
                    />
                  )}
                </div>
                <p className="mt-3 text-xl font-semibold tabular">{formatBRL(level.value)}</p>
                <div
                  className="mt-4 h-2 overflow-hidden rounded-full bg-muted"
                  role="progressbar"
                  aria-label={level.label}
                  aria-valuenow={Math.min(100, Math.max(0, level.percent))}
                  aria-valuemin={0}
                  aria-valuemax={100}
                >
                  <div
                    className={
                      "h-full rounded-full " + (level.reached ? "bg-income" : "bg-primary")
                    }
                    style={{ width: Math.min(100, Math.max(0, level.percent)) + "%" }}
                  />
                </div>
                <p className="mt-2 flex justify-between gap-2 text-xs">
                  <span>{formatPct(level.percent)} atingidos</span>
                  <span
                    className={
                      level.reached ? "text-income font-semibold" : "text-muted-foreground"
                    }
                  >
                    {level.reached ? "Alcançada" : "Em andamento"}
                  </span>
                </p>
                <p className="mt-4 text-sm">
                  {level.reached ? (
                    <span className="text-income">Objetivo do mês atingido.</span>
                  ) : (
                    <>
                      Faltam <strong>{formatBRL(level.remaining)}</strong>
                    </>
                  )}
                </p>
              </article>
            ))}
          </section>
        ) : (
          <div className="surface-card p-5 text-sm text-muted-foreground">
            Nenhuma meta salva nesta referência. Os valores não são repetidos automaticamente entre
            os meses.
          </div>
        )}
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="surface-card p-4">
            <h3 className="text-sm text-muted-foreground">A vencer no mês</h3>
            <p className="mt-2 text-xl font-semibold tabular">{formatBRL(progress.upcoming)}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Ainda não recebido; não conta como meta atingida.
            </p>
          </div>
          <div className="surface-card p-4">
            <h3 className="text-sm text-muted-foreground">Recebido + a vencer</h3>
            <p className="mt-2 text-xl font-semibold tabular">{formatBRL(progress.withUpcoming)}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Cenário se todos os recebíveis a vencer forem pagos.
            </p>
          </div>
          <div className="surface-card p-4">
            <h3 className="text-sm text-muted-foreground">
              {progress.projection === null
                ? "Atrasados desta referência de vencimento"
                : "Fechamento no ritmo atual"}
            </h3>
            <p className="mt-2 text-xl font-semibold tabular">
              {formatBRL(progress.projection ?? progress.overdue)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {progress.projection === null
                ? "Recebíveis vencidos e pendentes no mês selecionado."
                : "Estimativa pela média diária recebida; não é garantia de entrada."}
            </p>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          {config.data ? reached + " de 4 níveis alcançados. " : ""}Venda parcelada só conta quando
          a parcela é recebida. Baixas registradas no sistema, inclusive automáticas, devem ser
          conferidas com o banco. A base “Clínica se paga” é um orçamento de caixa, não o ponto de
          equilíbrio econômico calculado por margem de contribuição.
          {progress.missingPaidDates > 0
            ? " Há " +
              progress.missingPaidDates +
              " recebimento(s) sem data de pagamento, fora do progresso."
            : ""}
        </p>
      </QueryFeedback>
    </div>
  );
}
