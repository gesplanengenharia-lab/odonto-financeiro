import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { QueryFeedback } from "@/components/finance/QueryFeedback";
import { EmptyState, StatCard } from "@/components/finance/ui";
import { formatBRL } from "@/lib/finance";
import {
  paidFinancialTransactionsQuery, linkPaidFinancialTransaction, confirmPaidFinancialTransaction,
  type FinancialAccount, type PaidFinancialTransaction,
} from "@/lib/treasury-api";

type Filter = "sem-conta" | "a-confirmar" | "conciliados" | "todos";
const PAGE_SIZE = 25;

export function TreasuryLinking({ accounts }: { accounts: FinancialAccount[] }) {
  const query = useQuery(paidFinancialTransactionsQuery());
  const client = useQueryClient();
  const [filter, setFilter] = useState<Filter>("sem-conta");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<Record<string, string>>({});
  const rows = query.data ?? [];
  const accountNames = useMemo(() => new Map(accounts.map((account) => [account.id, account.name])), [accounts]);
  const counters = {
    noAccount: rows.filter((row) => !row.financial_account_id).length,
    toConfirm: rows.filter((row) => row.financial_account_id && !row.reconciled_at).length,
    confirmed: rows.filter((row) => !!row.reconciled_at).length,
  };
  const filtered = rows.filter((row) => {
    const matchesFilter = filter === "todos"
      || (filter === "sem-conta" && !row.financial_account_id)
      || (filter === "a-confirmar" && row.financial_account_id && !row.reconciled_at)
      || (filter === "conciliados" && !!row.reconciled_at);
    const phrase = search.trim().toLocaleLowerCase("pt-BR");
    return matchesFilter && (!phrase
      || row.description.toLocaleLowerCase("pt-BR").includes(phrase)
      || (row.person ?? "").toLocaleLowerCase("pt-BR").includes(phrase));
  });
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const visible = filtered.slice(Math.min(page, pages - 1) * PAGE_SIZE, (Math.min(page, pages - 1) + 1) * PAGE_SIZE);
  const refresh = async () => {
    await Promise.all([
      client.invalidateQueries({ queryKey: ["treasury"] }),
      client.invalidateQueries({ queryKey: ["txns"] }),
    ]);
  };
  const linking = useMutation({
    mutationFn: linkPaidFinancialTransaction,
    onSuccess: async () => { await refresh(); toast.success("Conta vinculada. Confira o lançamento no extrato antes de conciliar."); },
    onError: (error) => toast.error(error.message),
  });
  const confirming = useMutation({
    mutationFn: confirmPaidFinancialTransaction,
    onSuccess: async () => { await refresh(); toast.success("Lançamento conciliado com o extrato."); },
    onError: (error) => toast.error(error.message),
  });
  const busy = linking.isPending || confirming.isPending;
  function handleLink(transaction: PaidFinancialTransaction) {
    const account = accounts.find((item) => item.id === selected[transaction.id]);
    if (!account) { toast.error("Selecione a conta onde o valor efetivamente entrou ou saiu."); return; }
    if (!confirm(`Confirma que o valor de ${formatBRL(transaction.kind === "entrada" ? transaction.net_amount : transaction.gross_amount)} da operação "${transaction.description}" foi movimentado na conta ${account.name} na data ${transaction.paid_date}?\n\nEssa ação altera a posição bancária, mas não concilia o extrato.`)) return;
    linking.mutate({ transaction, account });
  }
  function handleConfirm(transaction: PaidFinancialTransaction) {
    if (!confirm(`Você conferiu esse lançamento no extrato real da conta ${accountNames.get(transaction.financial_account_id ?? "") ?? "selecionada"}?\n\nData: ${transaction.paid_date}\nValor: ${formatBRL(transaction.kind === "entrada" ? transaction.net_amount : transaction.gross_amount)}\n\nSó confirme se os dados coincidem.`)) return;
    confirming.mutate(transaction);
  }
  return (
    <div>
      <div className="mb-4 rounded-xl border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
        <strong className="text-foreground">Vinculação não é conciliação.</strong> Os pagamentos antigos continuam sem conta atribuída até confirmação manual.
        Associe apenas o que efetivamente aparece na conta, com a data correta. Depois confira no extrato para conciliar.
        Pagamentos automáticos exigem conferência, pois a baixa por vencimento não comprova recebimento.
      </div>
      <QueryFeedback loading={query.isPending} error={query.isError} retry={() => void query.refetch()}>
        <div className="mb-4 grid gap-3 sm:grid-cols-3">
          <StatCard label="Pagos sem conta" value={0} raw={String(counters.noAccount)} hint="Atribuição bancária pendente" tone="warning" />
          <StatCard label="Vinculados a conferir" value={0} raw={String(counters.toConfirm)} hint="Extrato ainda não confirmado" />
          <StatCard label="Conciliados" value={0} raw={String(counters.confirmed)} hint="Validação explícita no extrato" tone="income" />
        </div>
        <div className="mb-4 flex flex-wrap gap-3">
          <label className="grid gap-1 text-sm text-muted-foreground">Situação
            <select className="h-10 rounded-lg border border-input bg-background px-3 text-sm"
              value={filter} onChange={(e) => { setFilter(e.target.value as Filter); setPage(0); }}>
              <option value="sem-conta">Pagos sem conta</option><option value="a-confirmar">Vinculados, não conciliados</option>
              <option value="conciliados">Conciliados</option><option value="todos">Todos os pagos</option>
            </select>
          </label>
          <label className="grid min-w-[220px] flex-1 gap-1 text-sm text-muted-foreground">Busca por paciente ou descrição
            <Input value={search} onChange={(e) => { setSearch(e.target.value); setPage(0); }} placeholder="Buscar lançamento" />
          </label>
        </div>
        {filtered.length === 0 ? <EmptyState title="Nenhum lançamento para os filtros escolhidos" /> : (
          <>
            <div className="surface-card overflow-x-auto">
              <table className="w-full min-w-[900px] text-left text-sm" aria-label="Vinculação de pagamentos bancários">
                <thead className="border-b border-border bg-muted/30 text-muted-foreground">
                  <tr><th className="p-3">Data paga</th><th className="p-3">Descrição / paciente</th><th className="p-3">Situação bancária</th><th className="p-3 text-right">Valor</th><th className="p-3">Ação</th></tr>
                </thead>
                <tbody>
                  {visible.map((entry) => {
                    const available = accounts.filter((a) => a.active && a.opening_date <= (entry.paid_date ?? ""));
                    const amount = entry.kind === "entrada" ? entry.net_amount : entry.gross_amount;
                    return <tr key={entry.id} className="border-b border-border/70">
                      <td className="whitespace-nowrap p-3">{entry.paid_date?.split("-").reverse().join("/") ?? "—"}</td>
                      <td className="p-3"><p className="font-medium">{entry.description}</p>
                        {entry.person && <p className="text-xs text-muted-foreground">{entry.person}</p>}
                        <p className="text-xs text-muted-foreground">{entry.kind === "entrada" ? "Recebimento" : "Pagamento"}</p>
                      </td>
                      <td className="p-3">
                        {!entry.financial_account_id ? <span className="text-warning">Sem conta</span> : (
                          <><p>{accountNames.get(entry.financial_account_id) ?? "Conta não localizada"}</p>
                            <p className={entry.reconciled_at ? "text-xs text-income" : "text-xs text-warning"}>{entry.reconciled_at ? "Conciliado" : "A conferir no extrato"}</p></>
                        )}
                      </td>
                      <td className="p-3 text-right font-semibold tabular-nums">{entry.kind === "saida" ? "− " : ""}{formatBRL(amount)}</td>
                      <td className="p-3">
                        {!entry.financial_account_id ? <div className="flex items-center gap-2">
                          <select aria-label={`Conta do lançamento ${entry.description}`} className="h-9 max-w-[185px] rounded-md border border-input bg-background px-2 text-xs"
                            value={selected[entry.id] ?? ""} disabled={busy || available.length === 0}
                            onChange={(e) => setSelected((prior) => ({ ...prior, [entry.id]: e.target.value }))}>
                            <option value="">Conta real</option>{available.map((a) => <option value={a.id} key={a.id}>{a.name}</option>)}
                          </select>
                          <Button size="sm" variant="outline" disabled={busy || available.length === 0} onClick={() => handleLink(entry)}>Vincular</Button>
                        </div> : !entry.reconciled_at ? <Button size="sm" disabled={busy} onClick={() => handleConfirm(entry)}>Confirmar no extrato</Button> : (
                          <span className="text-xs text-income">Verificado</span>
                        )}
                        {!entry.financial_account_id && available.length === 0 && <p className="mt-1 text-xs text-warning">Sem conta ativa na data</p>}
                      </td>
                    </tr>;
                  })}
                </tbody>
              </table>
            </div>
            <div className="mt-3 flex items-center justify-between gap-3 text-sm text-muted-foreground">
              <span>{filtered.length} lançamento(s) · Página {Math.min(page, pages - 1) + 1} de {pages}</span>
              <div className="flex gap-2"><Button size="sm" variant="outline" disabled={page <= 0} onClick={() => setPage((p) => p - 1)}>Anterior</Button>
                <Button size="sm" variant="outline" disabled={page >= pages - 1} onClick={() => setPage((p) => p + 1)}>Próxima</Button></div>
            </div>
          </>
        )}
      </QueryFeedback>
    </div>
  );
}
