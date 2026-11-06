import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  formatBRL,
  formatDate,
  formatMonth,
  formatPct,
  managementComparison,
  managementHistory,
  type Txn,
} from "@/lib/finance";

export function GrowthPanel({ rows, month, today }: { rows: Txn[]; month: string; today: string }) {
  const history = managementHistory(rows, month, today);
  const comparison = managementComparison(rows, month, today);
  const priorities: string[] = [];
  if (!comparison.future) {
    if (
      comparison.sales.percent !== null &&
      comparison.received.percent !== null &&
      comparison.sales.percent > comparison.received.percent &&
      comparison.sales.percent > 0
    ) {
      priorities.push(
        `Vendas variaram ${formatPct(comparison.sales.percent)} e recebimentos ${formatPct(comparison.received.percent)}. Revise entradas e prazos dos contratos para entender o efeito no capital de giro.`,
      );
    }
    if (
      comparison.expenses.percent !== null &&
      comparison.received.percent !== null &&
      comparison.expenses.percent > comparison.received.percent &&
      comparison.expenses.percent > 0
    ) {
      priorities.push(
        `Pagamentos variaram ${formatPct(comparison.expenses.percent)}, acima da variação dos recebimentos (${formatPct(comparison.received.percent)}). Confira as categorias de despesas e os próximos vencimentos.`,
      );
    }
    if (comparison.result.delta !== null && comparison.result.delta < 0) {
      priorities.push(
        `O resultado de caixa caiu ${formatBRL(Math.abs(comparison.result.delta))}. Confira se a diferença decorre do calendário de pagamentos ou da operação antes de decidir cortes.`,
      );
    }
  }
  const money = (value: number | null) => (value === null ? "Sem registros" : formatBRL(value));
  return (
    <section className="surface-card p-5" aria-labelledby="growth-title">
      <h2 id="growth-title" className="text-base font-semibold">
        A clínica está crescendo?
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Vendas por competência; recebimentos e pagamentos pela data da baixa. Valores em reais.
      </p>
      <div className="mt-5 h-64" aria-hidden="true">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={history.map((row) => ({
              ...row,
              label: `${formatMonth(row.month)}${row.partial ? "*" : ""}`,
            }))}
          >
            <CartesianGrid vertical={false} stroke="var(--border)" />
            <XAxis dataKey="label" fontSize={11} tickLine={false} axisLine={false} />
            <YAxis
              fontSize={11}
              tickFormatter={(value: number) => `${Math.round(value / 1000)} mil`}
              tickLine={false}
              axisLine={false}
            />
            <Tooltip formatter={(value: number) => formatBRL(value)} />
            <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
            <Bar dataKey="sales" name="Vendas" fill="var(--primary)" radius={[3, 3, 0, 0]} />
            <Bar
              dataKey="received"
              name="Recebimentos"
              fill="var(--income)"
              radius={[3, 3, 0, 0]}
            />
            <Bar dataKey="paid" name="Pagamentos" fill="var(--expense)" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <caption className="sr-only">Evolução financeira dos últimos seis meses</caption>
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted-foreground">
              <th className="py-3">Mês</th>
              <th className="text-right">Vendas</th>
              <th className="text-right">Recebimentos</th>
              <th className="text-right">Pagamentos</th>
              <th className="text-right">Resultado de caixa</th>
              <th className="text-right">Margem de caixa</th>
            </tr>
          </thead>
          <tbody>
            {history.map((row) => (
              <tr key={row.month} className="border-b border-border/60">
                <th scope="row" className="py-3 pr-3 text-left font-medium">
                  {formatMonth(row.month)}
                  {row.partial ? "*" : ""}
                </th>
                <td className="tabular text-right">{money(row.sales)}</td>
                <td className="tabular text-right">{money(row.received)}</td>
                <td className="tabular text-right">{money(row.paid)}</td>
                <td className="tabular text-right">{money(row.result)}</td>
                <td className="tabular text-right">
                  {!row.available
                    ? "Sem registros"
                    : row.margin === null
                      ? "Sem base"
                      : formatPct(row.margin)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        * Mês atual somente até {formatDate(today)}. Meses futuros e meses sem registros não são
        tratados como desempenho realizado. Resultado de caixa não é lucro dos tratamentos.
      </p>
      {priorities.length > 0 && (
        <div className="mt-5 border-t border-border pt-4">
          <h3 className="text-sm font-semibold">Onde olhar primeiro</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {formatDate(comparison.start)} a {formatDate(comparison.end)} contra{" "}
            {formatDate(comparison.previousStart)} a {formatDate(comparison.previousEnd)}.
          </p>
          <ul className="mt-3 list-disc space-y-2 pl-4 text-sm text-muted-foreground">
            {priorities.slice(0, 3).map((text) => (
              <li key={text}>{text}</li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
