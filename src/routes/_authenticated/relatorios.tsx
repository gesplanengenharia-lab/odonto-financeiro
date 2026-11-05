import { useFinancialMonth } from "@/hooks/use-financial-month";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { pageHead } from "@/lib/head";
import {
  addMonths,
  formatBRL,
  formatMonth,
  formatPct,
  monthKey,
  monthRange,
  nextMonths,
  summarize,
  todayISO,
  type Txn,
} from "@/lib/finance";
import { categoriesQuery, txnsByCompetenceQuery } from "@/lib/queries";
import { MonthPicker, PageHeader, StatCard } from "@/components/finance/ui";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  filterReportRows,
  validReportRange,
  downloadFinancialCsv,
  printFinancialPdf,
} from "@/lib/report-export";
import { NativeSelect } from "@/components/finance/LaunchDialog";

export const Route = createFileRoute("/_authenticated/relatorios")({
  head: () => pageHead("Relatórios", "Resultado, margem de lucro e despesas por categoria."),
  component: Relatorios,
});

function Relatorios() {
  const [month, setMonth] = useFinancialMonth();
  const [scope, setScope] = useState<"mes" | "ano" | "custom">("mes");
  const [category, setCategory] = useState("all");
  const [customStart, setCustomStart] = useState(monthRange(month).start);
  const [customEnd, setCustomEnd] = useState(monthRange(month).end);
  const year = month.slice(0, 4);
  const range =
    scope === "custom"
      ? { start: customStart, end: customEnd }
      : scope === "mes"
        ? monthRange(month)
        : { start: `${year}-01-01`, end: `${year}-12-31` };
  const trendStart = `${monthKey(addMonths(`${month}-01`, -11))}-01`;

  const rangeValid = validReportRange(range.start, range.end);
  const reportQuery = useQuery({
    ...txnsByCompetenceQuery(range.start, range.end),
    enabled: rangeValid,
  });
  const filter = { ...range, category };
  const data = filterReportRows(reportQuery.data ?? [], filter);
  const { data: trendData = [] } = useQuery(
    txnsByCompetenceQuery(trendStart, monthRange(month).end),
  );
  const categoryQuery = useQuery(categoriesQuery());
  const categories = categoryQuery.data ?? [];
  const exportReady =
    rangeValid &&
    !reportQuery.isFetching &&
    !reportQuery.isError &&
    !reportQuery.isPending &&
    !categoryQuery.isPending &&
    !categoryQuery.isError;
  const exportReport = (format: "csv" | "pdf") => {
    if (!exportReady) return;
    try {
      (format === "csv" ? downloadFinancialCsv : printFinancialPdf)(data, categories, filter);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível exportar.");
    }
  };
  const s = summarize(data);

  const byCategory = (kind: "entrada" | "saida") => {
    const map = new Map<string, number>();
    data
      .filter((t) => t.kind === kind)
      .forEach((t) => {
        const name = categories.find((c) => c.id === t.category_id)?.name ?? "Sem categoria";
        map.set(name, (map.get(name) ?? 0) + t.gross_amount);
      });
    const total = [...map.values()].reduce((a, b) => a + b, 0);
    return [...map.entries()]
      .map(([name, value]) => ({ name, value, pct: total ? (value / total) * 100 : 0 }))
      .sort((a, b) => b.value - a.value);
  };
  const expenses = byCategory("saida");
  const revenues = byCategory("entrada");

  const trend = useMemo(
    () =>
      nextMonths(monthKey(trendStart), 12).map((k) => {
        const sm = summarize(
          filterReportRows(trendData, {
            start: trendStart,
            end: monthRange(month).end,
            category,
          }).filter((t: Txn) => monthKey(t.competence_date) === k),
        );
        return { mes: formatMonth(k), Margem: sm.margin, Lucro: sm.profit };
      }),
    [trendData, trendStart, month, category],
  );

  const pctOfRevenue = (v: number) =>
    s.grossRevenue ? formatPct((v / s.grossRevenue) * 100) : "—";

  return (
    <div>
      <PageHeader
        title="Relatórios"
        subtitle="Resultado pela data do atendimento/compra (regime de competência)"
        actions={
          <>
            <NativeSelect
              className="w-32"
              value={scope}
              onChange={(e) => setScope(e.target.value as "mes" | "ano" | "custom")}
            >
              <option value="mes">Mensal</option>
              <option value="ano">Anual</option>
              <option value="custom">Personalizado</option>
            </NativeSelect>
            {scope === "mes" ? (
              <MonthPicker value={month} onChange={setMonth} />
            ) : scope === "ano" ? (
              <NativeSelect
                className="w-28"
                value={year}
                onChange={(e) => setMonth(`${e.target.value}-01`)}
              >
                {Array.from({ length: 6 }, (_, i) => Number(todayISO().slice(0, 4)) + 1 - i).map(
                  (y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ),
                )}
              </NativeSelect>
            ) : null}
          </>
        }
      />

      <div className="surface-card mb-4 flex flex-wrap items-end gap-4 p-4">
        {scope === "custom" && (
          <>
            <div>
              <Label htmlFor="report-start">Data inicial</Label>
              <Input
                id="report-start"
                type="date"
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="report-end">Data final</Label>
              <Input
                id="report-end"
                type="date"
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
              />
            </div>
          </>
        )}
        <div>
          <Label htmlFor="report-category">Categoria</Label>
          <NativeSelect
            id="report-category"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            <option value="all">Todas as categorias</option>
            <option value="none">Sem categoria</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.kind === "entrada" ? "receita" : "despesa"})
              </option>
            ))}
          </NativeSelect>
        </div>
        <Button variant="outline" disabled={!exportReady} onClick={() => exportReport("csv")}>
          Exportar CSV
        </Button>
        <Button disabled={!exportReady} onClick={() => exportReport("pdf")}>
          Exportar PDF
        </Button>
        <p className="w-full text-xs text-muted-foreground">
          CSV: lançamentos filtrados, compatível com Excel. PDF: demonstrativo e lançamentos;
          escolha “Salvar como PDF” na janela de impressão. O gráfico de 12 meses mantém seu
          intervalo histórico e acompanha a categoria selecionada.
        </p>
        {!rangeValid && (
          <p role="alert" className="text-sm text-expense">
            Informe um período válido, com data inicial anterior ou igual à final.
          </p>
        )}
        {(reportQuery.isError || categoryQuery.isError) && (
          <p role="alert" className="text-sm text-expense">
            Não foi possível carregar o relatório.{" "}
            <button
              className="underline"
              onClick={() => {
                void reportQuery.refetch();
                void categoryQuery.refetch();
              }}
            >
              Tentar novamente
            </button>
          </p>
        )}
        {rangeValid && reportQuery.isPending && (
          <p role="status" className="text-sm text-muted-foreground">
            Carregando relatório…
          </p>
        )}
      </div>
      {exportReady && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Receita bruta" value={s.grossRevenue} tone="income" />
            <StatCard
              label="Despesas totais"
              value={s.totalExpenses + s.cardFees}
              tone="expense"
              hint={`${pctOfRevenue(s.totalExpenses + s.cardFees)} da receita`}
            />
            <StatCard label="Lucro líquido" value={s.profit} tone="primary" />
            <StatCard
              label="Margem de lucro"
              value={s.margin}
              raw={formatPct(s.margin)}
              tone={s.margin >= 0 ? "income" : "expense"}
            />
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <div className="surface-card p-6">
              <h2 className="text-base font-semibold">Demonstrativo de resultado</h2>
              <table className="tabular mt-4 w-full text-sm">
                <tbody>
                  {[
                    ["Receita bruta", s.grossRevenue, "100%", "font-semibold"],
                    [
                      "(−) Taxas de cartão",
                      -s.cardFees,
                      pctOfRevenue(s.cardFees),
                      "text-muted-foreground",
                    ],
                    [
                      "= Receita líquida",
                      s.netRevenue,
                      pctOfRevenue(s.netRevenue),
                      "font-semibold",
                    ],
                    [
                      "(−) Despesas fixas",
                      -s.fixedExpenses,
                      pctOfRevenue(s.fixedExpenses),
                      "text-muted-foreground",
                    ],
                    [
                      "(−) Despesas variáveis",
                      -s.variableExpenses,
                      pctOfRevenue(s.variableExpenses),
                      "text-muted-foreground",
                    ],
                    [
                      "= Lucro líquido",
                      s.profit,
                      pctOfRevenue(s.profit),
                      "font-semibold text-primary",
                    ],
                  ].map(([label, v, p, cls]) => (
                    <tr key={label as string} className="border-b border-border/60 last:border-0">
                      <td className={`py-2.5 ${cls}`}>{label}</td>
                      <td className={`py-2.5 text-right ${cls}`}>{formatBRL(v as number)}</td>
                      <td className="w-20 py-2.5 text-right text-xs text-muted-foreground">{p}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="mt-5">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Fixa x variável
                </p>
                <div className="mt-2 flex h-3 overflow-hidden rounded-full bg-muted">
                  <div
                    className="bg-primary"
                    style={{
                      width: `${s.totalExpenses ? (s.fixedExpenses / s.totalExpenses) * 100 : 0}%`,
                    }}
                  />
                  <div
                    className="bg-expense"
                    style={{
                      width: `${s.totalExpenses ? (s.variableExpenses / s.totalExpenses) * 100 : 0}%`,
                    }}
                  />
                </div>
                <div className="mt-2 flex justify-between text-xs text-muted-foreground">
                  <span>
                    Fixas{" "}
                    {s.totalExpenses ? formatPct((s.fixedExpenses / s.totalExpenses) * 100) : "—"}
                  </span>
                  <span>
                    Variáveis{" "}
                    {s.totalExpenses
                      ? formatPct((s.variableExpenses / s.totalExpenses) * 100)
                      : "—"}
                  </span>
                </div>
              </div>
            </div>

            <div className="surface-card p-6">
              <h2 className="text-base font-semibold">Margem de lucro — 12 meses</h2>
              <div className="mt-4 h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={trend}>
                    <CartesianGrid vertical={false} stroke="var(--border)" />
                    <XAxis
                      dataKey="mes"
                      tickLine={false}
                      axisLine={false}
                      fontSize={11}
                      stroke="var(--muted-foreground)"
                    />
                    <YAxis
                      tickLine={false}
                      axisLine={false}
                      fontSize={11}
                      stroke="var(--muted-foreground)"
                      tickFormatter={(v) => `${v}%`}
                    />
                    <Tooltip
                      formatter={(v: number, n) => (n === "Margem" ? formatPct(v) : formatBRL(v))}
                    />
                    <Line
                      type="monotone"
                      dataKey="Margem"
                      stroke="var(--primary)"
                      strokeWidth={2.5}
                      dot={{ r: 3 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <CategoryList
              title="Despesas por categoria"
              rows={expenses}
              tone="bg-expense"
              revenue={s.grossRevenue}
            />
            <CategoryList title="Receitas por categoria" rows={revenues} tone="bg-income" />
          </div>
        </>
      )}
    </div>
  );
}

function CategoryList({
  title,
  rows,
  tone,
  revenue,
}: {
  title: string;
  rows: { name: string; value: number; pct: number }[];
  tone: string;
  revenue?: number;
}) {
  return (
    <div className="surface-card p-6">
      <h2 className="text-base font-semibold">{title}</h2>
      {rows.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">Sem lançamentos no período.</p>
      ) : (
        <ul className="mt-4 grid gap-3">
          {rows.map((r) => (
            <li key={r.name}>
              <div className="flex justify-between text-sm">
                <span>{r.name}</span>
                <span className="tabular font-semibold">
                  {formatBRL(r.value)}{" "}
                  <span className="ml-1 text-xs font-normal text-muted-foreground">
                    {formatPct(r.pct)}
                  </span>
                </span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                <div className={`h-full ${tone}`} style={{ width: `${r.pct}%` }} />
              </div>
              {revenue ? (
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {formatPct((r.value / revenue) * 100)} da receita
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
