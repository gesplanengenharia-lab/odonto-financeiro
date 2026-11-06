import { useMemo, useState } from "react";
import { forecast90, parseForecastOpening, formatBRL, formatDate, type Txn } from "@/lib/finance";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function Forecast90Panel({ rows, today }: { rows: Txn[]; today: string }) {
  const [opening, setOpening] = useState("");
  const [delay, setDelay] = useState(0);
  const amount = parseForecastOpening(opening);
  const plan = useMemo(() => forecast90(rows, today, amount, delay), [rows, today, amount, delay]);
  const money = (value: number | null) => (value === null ? "Informe o saldo" : formatBRL(value));
  return (
    <section className="surface-card p-5" aria-labelledby="forecast90-title">
      <h2 id="forecast90-title" className="text-base font-semibold">
        Vai faltar dinheiro nos próximos 90 dias?
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        De {formatDate(plan.start)} a {formatDate(plan.end)}, a partir de hoje, independentemente do
        mês do painel.
      </p>
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="forecast90-opening">Saldo disponível agora (R$)</Label>
          <Input
            id="forecast90-opening"
            className="mt-2"
            inputMode="decimal"
            placeholder="Ex.: 15.000,00"
            value={opening}
            onChange={(event) => setOpening(event.target.value)}
            aria-invalid={opening.trim() !== "" && amount === null}
            aria-describedby="forecast90-help"
          />
          <p id="forecast90-help" className="mt-2 text-xs text-muted-foreground">
            Informe o saldo conferido agora, já incluindo o que foi recebido e pago. É uma hipótese
            desta simulação; não altera contas ou lançamentos.
          </p>
          {opening.trim() !== "" && amount === null && (
            <p role="alert" className="mt-1 text-xs text-expense">
              Informe um valor como 1.500,00 ou 0,00.
            </p>
          )}
        </div>
        <div>
          <Label htmlFor="forecast90-delay">Cenário de recebimentos</Label>
          <select
            id="forecast90-delay"
            value={delay}
            onChange={(event) => setDelay(Number(event.target.value))}
            className="mt-2 h-9 w-full rounded-md border border-input bg-card px-3 text-sm"
          >
            <option value={0}>Nas datas previstas</option>
            <option value={15}>Atraso de 15 dias</option>
            <option value={30}>Atraso de 30 dias</option>
          </select>
          <p className="mt-2 text-xs text-muted-foreground">
            O cenário desloca somente receitas pendentes. Pagamentos mantêm seus vencimentos.
          </p>
        </div>
      </div>
      <dl className="mt-6 grid gap-4 border-y border-border py-4 sm:grid-cols-3" aria-live="polite">
        <div>
          <dt className="text-xs text-muted-foreground">Saldo no final dos 90 dias</dt>
          <dd className="tabular mt-1 font-semibold">{money(plan.closing)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Menor saldo previsto</dt>
          <dd className="tabular mt-1 font-semibold">{money(plan.minimum)}</dd>
          {plan.minimumDate && (
            <p className="text-xs text-muted-foreground">Em {formatDate(plan.minimumDate)}</p>
          )}
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Aporte estimado para cobrir faltas</dt>
          <dd className="tabular mt-1 font-semibold">{money(plan.contribution)}</dd>
          {plan.firstDeficit && (
            <p className="text-xs text-expense">
              Primeira falta em {formatDate(plan.firstDeficit)}
            </p>
          )}
        </div>
      </dl>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[480px] text-sm">
          <caption className="sr-only">Previsão de caixa de 90 dias por período</caption>
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted-foreground">
              <th className="py-3">Período</th>
              <th className="text-right">A receber</th>
              <th className="text-right">A pagar</th>
              <th className="text-right">Saldo ao final</th>
            </tr>
          </thead>
          <tbody>
            {plan.months.map((row) => (
              <tr key={row.month} className="border-b border-border/60">
                <th scope="row" className="py-3 text-left font-medium">
                  {formatDate(row.start)} a {formatDate(row.end)}
                </th>
                <td className="tabular text-right">{formatBRL(row.income)}</td>
                <td className="tabular text-right">{formatBRL(row.expenses)}</td>
                <td className="tabular text-right">{money(row.balance)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-4 text-xs text-muted-foreground">
        Inclui {formatBRL(plan.overdueBills)} de contas já vencidas no primeiro dia. Exclui{" "}
        {formatBRL(plan.excludedOverdueIncome)} de recebíveis atrasados e todos os lançamentos já
        pagos. O aporte considera a pior posição diária, mesmo que o saldo final seja positivo.
      </p>
      {plan.shiftedBeyond > 0 && (
        <p className="mt-2 text-xs text-warning">
          Neste cenário, {formatBRL(plan.shiftedBeyond)} de recebimentos passam para depois dos 90
          dias.
        </p>
      )}
      <p className="mt-2 text-xs text-muted-foreground">
        Somente compromissos cadastrados. Custos futuros dos tratamentos precisam estar lançados
        para entrar na conta. Não inclui novas vendas hipotéticas. Posição ao fim de cada dia, sem
        simular a ordem das movimentações dentro do dia. Os valores informados são mantidos apenas
        enquanto esta análise estiver aberta.
      </p>
    </section>
  );
}
