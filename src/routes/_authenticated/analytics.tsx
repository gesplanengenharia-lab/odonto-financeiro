import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
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
import { pageHead } from "@/lib/head";
import { addDays, formatDate, todayISO } from "@/lib/finance";
import { usageQuery } from "@/lib/queries";
import { usageAnalytics } from "@/lib/usage-analytics";
import { PageHeader, StatCard } from "@/components/finance/ui";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
export const Route = createFileRoute("/_authenticated/analytics")({
  head: () => pageHead("Analytics", "Uso dos principais fluxos do sistema."),
  component: Analytics,
});
function Analytics() {
  const [start, setStart] = useState(addDays(todayISO(), -29));
  const [end, setEnd] = useState(todayISO());
  const query = useQuery(usageQuery());
  const metrics = usageAnalytics(
    query.data?.profiles ?? [],
    query.data?.transactions ?? [],
    start,
    end,
  );
  return (
    <div>
      <PageHeader
        title="Analytics de uso"
        subtitle="Cadastros, lançamentos e pagamentos considerados a partir dos registros existentes"
      />
      <div className="surface-card mb-4 flex flex-wrap items-end gap-4 p-4">
        <div>
          <Label htmlFor="usage-start">Data inicial</Label>
          <Input
            id="usage-start"
            type="date"
            value={start}
            onChange={(e) => setStart(e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="usage-end">Data final</Label>
          <Input id="usage-end" type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
        </div>
        <Button variant="outline" disabled={query.isFetching} onClick={() => void query.refetch()}>
          {query.isFetching ? "Atualizando…" : "Atualizar dados"}
        </Button>
      </div>
      {!metrics ? (
        <p role="alert" className="text-expense">
          Selecione um período válido de até 366 dias.
        </p>
      ) : query.isPending ? (
        <p role="status">Carregando indicadores de uso…</p>
      ) : query.isError ? (
        <p role="alert" className="text-expense">
          Não foi possível carregar os indicadores. Tente atualizar os dados.
        </p>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Cadastros de usuários"
              value={metrics.registrations}
              raw={String(metrics.registrations)}
              hint="Contas criadas no período"
            />
            <StatCard
              label="Lançamentos criados"
              value={metrics.launches}
              raw={String(metrics.launches)}
              hint={`${metrics.incoming} entradas · ${metrics.outgoing} saídas (parcelas)`}
            />
            <StatCard
              label="Pagamentos considerados"
              value={metrics.settled}
              raw={String(metrics.settled)}
              tone="income"
              hint="Ainda pagas, pela data de pagamento"
            />
            <StatCard
              label="Usuários que lançaram"
              value={metrics.activeCreators}
              raw={String(metrics.activeCreators)}
              tone="primary"
              hint={`${metrics.daysWithActivity} dia(s) com atividade no período`}
            />
          </div>
          <div className="surface-card mt-4 p-5">
            <h2 className="font-semibold">Evolução diária dos fluxos</h2>
            <div className="mt-4 h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={metrics.days}>
                  <CartesianGrid vertical={false} stroke="var(--border)" />
                  <XAxis
                    dataKey="day"
                    tickFormatter={(d: string) => formatDate(d).slice(0, 5)}
                    fontSize={11}
                  />
                  <YAxis allowDecimals={false} fontSize={11} />
                  <Tooltip labelFormatter={(d) => formatDate(String(d))} />
                  <Legend />
                  <Bar dataKey="registrations" name="Cadastros" fill="var(--chart-3)" />
                  <Bar dataKey="launches" name="Lançamentos" fill="var(--primary)" />
                  <Bar dataKey="settled" name="Pagamentos" fill="var(--income)" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div className="surface-card mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="p-3">Dia</th>
                  <th className="p-3 text-right">Cadastros</th>
                  <th className="p-3 text-right">Lançamentos</th>
                  <th className="p-3 text-right">Pagamentos</th>
                </tr>
              </thead>
              <tbody>
                {metrics.days.map((d) => (
                  <tr key={d.day} className="border-b border-border/60">
                    <th scope="row" className="p-3 text-left font-normal">
                      {formatDate(d.day)}
                    </th>
                    <td className="tabular p-3 text-right">{d.registrations}</td>
                    <td className="tabular p-3 text-right">{d.launches}</td>
                    <td className="tabular p-3 text-right">{d.settled}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-4 space-y-2 text-xs text-muted-foreground">
            <p>
              Cadastros são contas de usuários, não pacientes. Cada parcela/recorrência criada conta
              como um lançamento; os números não representam cliques ou sessões.
            </p>
            <p>
              Os pagamentos usam a data informada ou o vencimento automático. Exceções e registros excluídos deixam de aparecer. Este painel mede o estado atual,
              não é uma trilha imutável de auditoria.
            </p>
            <p>
              Cadastros e criação de lançamentos usam o fuso de Brasília. Usuários que lançaram são
              identificados pelo autor registrado; lançamentos sem autor não aumentam essa contagem.
            </p>
            {metrics.missingPaidDates > 0 && (
              <p className="text-warning">
                {metrics.missingPaidDates} conta(s) paga(s) sem data no cadastro não entram na
                contagem diária de pagamentos.
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
