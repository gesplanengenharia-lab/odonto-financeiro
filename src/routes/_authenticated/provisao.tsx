import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { pageHead } from "@/lib/head";
import { cashValue, formatBRL, formatMonth, monthKey, monthRange, nextMonths, todayISO } from "@/lib/finance";
import { txnsByDueQuery } from "@/lib/queries";
import { PageHeader, StatCard } from "@/components/finance/ui";
import { NativeSelect } from "@/components/finance/LaunchDialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/_authenticated/provisao")({
  head: () => pageHead("Provisão", "Projeção de entradas e saídas para os próximos meses."),
  component: Provisao,
});

function Provisao() {
  const current = monthKey(todayISO());
  const [months, setMonths] = useState(6);
  const [opening, setOpening] = useState("");
  const keys = nextMonths(current, months);
  const from = `${current}-01`;
  const to = monthRange(keys[keys.length - 1]!).end;
  const { data = [] } = useQuery(txnsByDueQuery(from, to));
  const openingValue = Number(opening.replace(/\./g, "").replace(",", ".")) || 0;

  const table = useMemo(() => {
    let balance = openingValue;
    return keys.map((k) => {
      const rows = data.filter((t) => monthKey(t.due_date) === k && t.status === "pendente");
      const card = rows.filter((t) => t.kind === "entrada" && (t.payment_method === "credito" || t.payment_method === "debito")).reduce((s, t) => s + cashValue(t), 0);
      const other = rows.filter((t) => t.kind === "entrada" && t.payment_method !== "credito" && t.payment_method !== "debito").reduce((s, t) => s + cashValue(t), 0);
      const fixed = rows.filter((t) => t.kind === "saida" && t.nature === "fixa").reduce((s, t) => s + cashValue(t), 0);
      const variable = rows.filter((t) => t.kind === "saida" && t.nature !== "fixa").reduce((s, t) => s + cashValue(t), 0);
      const result = card + other - fixed - variable;
      balance += result;
      return { key: k, mes: formatMonth(k), card, other, fixed, variable, result, balance: Math.round(balance * 100) / 100 };
    });
  }, [data, keys.join(","), openingValue]);

  const totIn = table.reduce((s, r) => s + r.card + r.other, 0);
  const totOut = table.reduce((s, r) => s + r.fixed + r.variable, 0);

  return (
    <div>
      <PageHeader
        title="Provisão"
        subtitle="O que ainda vai entrar e sair (lançamentos pendentes), mês a mês"
        actions={
          <div className="flex items-end gap-2">
            <div className="grid gap-1">
              <Label htmlFor="op" className="text-xs">Saldo atual em conta (R$)</Label>
              <Input id="op" className="w-40 bg-card" inputMode="decimal" placeholder="0,00" value={opening} onChange={(e) => setOpening(e.target.value)} />
            </div>
            <NativeSelect className="w-36" value={months} onChange={(e) => setMonths(Number(e.target.value))}>
              <option value={3}>3 meses</option>
              <option value={6}>6 meses</option>
              <option value={12}>12 meses</option>
            </NativeSelect>
          </div>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Entradas previstas" value={totIn} tone="income" />
        <StatCard label="Saídas previstas" value={totOut} tone="expense" />
        <StatCard label={`Saldo projetado em ${formatMonth(keys[keys.length - 1]!)}`} value={table[table.length - 1]?.balance ?? 0} tone="primary" />
      </div>

      <div className="surface-card mt-4 p-6">
        <h2 className="text-base font-semibold">Saldo projetado</h2>
        <div className="mt-4 h-60">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={table}>
              <defs>
                <linearGradient id="bal" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="var(--primary)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} stroke="var(--border)" />
              <XAxis dataKey="mes" tickLine={false} axisLine={false} fontSize={12} stroke="var(--muted-foreground)" />
              <YAxis tickLine={false} axisLine={false} fontSize={11} stroke="var(--muted-foreground)" tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
              <Tooltip formatter={(v: number) => formatBRL(v)} />
              <Area type="monotone" dataKey="balance" name="Saldo" stroke="var(--primary)" strokeWidth={2} fill="url(#bal)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="surface-card mt-4 overflow-x-auto">
        <table className="w-full min-w-[760px] text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="px-4 py-3 font-medium">Mês</th>
              <th className="px-4 py-3 text-right font-medium">Cartões (líquido)</th>
              <th className="px-4 py-3 text-right font-medium">Boletos, Pix e outros</th>
              <th className="px-4 py-3 text-right font-medium">Despesas fixas</th>
              <th className="px-4 py-3 text-right font-medium">Despesas variáveis</th>
              <th className="px-4 py-3 text-right font-medium">Resultado</th>
              <th className="px-4 py-3 text-right font-medium">Saldo acumulado</th>
            </tr>
          </thead>
          <tbody className="tabular">
            {table.map((r) => (
              <tr key={r.key} className="border-b border-border/60 last:border-0">
                <td className="px-4 py-3 font-medium capitalize">{formatMonth(r.key, true)}</td>
                <td className="px-4 py-3 text-right text-income">{formatBRL(r.card)}</td>
                <td className="px-4 py-3 text-right text-income">{formatBRL(r.other)}</td>
                <td className="px-4 py-3 text-right text-expense">{formatBRL(r.fixed)}</td>
                <td className="px-4 py-3 text-right text-expense">{formatBRL(r.variable)}</td>
                <td className={`px-4 py-3 text-right font-semibold ${r.result >= 0 ? "text-income" : "text-expense"}`}>{formatBRL(r.result)}</td>
                <td className={`px-4 py-3 text-right font-semibold ${r.balance >= 0 ? "text-foreground" : "text-expense"}`}>{formatBRL(r.balance)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        Dica: cadastre despesas fixas (aluguel, salários) com “Repetir todo mês” para que apareçam aqui. Contas atrasadas de meses anteriores ficam em Contas a pagar e receber.
      </p>
    </div>
  );
}
