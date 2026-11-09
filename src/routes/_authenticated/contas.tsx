import { QueryFeedback } from "@/components/finance/QueryFeedback";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { pageHead } from "@/lib/head";
import {
  accountFilters,
  openAccounts,
  formatMonth,
  PAYMENT_LABELS,
  todayISO,
  type AccountFilters,
} from "@/lib/finance";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { txnsByDueQuery } from "@/lib/queries";
import { NativeSelect } from "@/components/finance/LaunchDialog";
import { TxnTable } from "@/components/finance/TxnTable";
import { EmptyState, PageHeader, StatCard } from "@/components/finance/ui";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/_authenticated/contas")({
  head: () =>
    pageHead("Contas a pagar e receber", "Boletos, Pix e parcelas pendentes com vencimento."),
  validateSearch: accountFilters,
  component: Contas,
});

function Contas() {
  const filters = Route.useSearch();
  const navigate = Route.useNavigate();
  const [search, setSearch] = useState("");
  const tab = filters.kind ?? "saida";
  const period = filters.period ?? "todos";
  const method = filters.method ?? "";
  const query = useQuery(txnsByDueQuery());
  const { data = [], isLoading } = query;
  const today = todayISO();
  const scope = openAccounts(data, filters, today, search);
  const rows = scope.rows;
  const update = (patch: AccountFilters) =>
    void navigate({ search: (previous) => ({ ...previous, ...patch }), replace: true });

  return (
    <div>
      <PageHeader
        title="Contas a pagar e receber"
        subtitle={
          filters.month
            ? `Vencimentos de ${formatMonth(filters.month, true)} · ${tab === "entrada" ? "a receber" : "a pagar"}`
            : "Contas organizadas pelo vencimento"
        }
      />
      <QueryFeedback
        loading={query.isPending}
        error={query.isError}
        retry={() => void query.refetch()}
      >
        <Tabs
          value={tab}
          onValueChange={(v) =>
            update({ kind: v as "entrada" | "saida", channel: undefined, method: undefined })
          }
          className="mb-4"
        >
          <TabsList>
            <TabsTrigger value="saida">A pagar</TabsTrigger>
            <TabsTrigger value="entrada">A receber</TabsTrigger>
          </TabsList>
        </Tabs>

        {tab === "entrada" && (
          <div className="mb-4 flex flex-wrap gap-2" aria-label="Tipos de recebíveis">
            {(
              [
                ["todos", "Todos"],
                ["cartoes", "Cartões"],
                ["boletos", "Boletos"],
                ["atrasados", "Atrasados"],
              ] as const
            ).map(([key, label]) => (
              <Button
                key={key}
                size="sm"
                variant={
                  (
                    key === "atrasados"
                      ? period === "atrasados"
                      : period !== "atrasados" && (filters.channel ?? "todos") === key
                  )
                    ? "default"
                    : "outline"
                }
                onClick={() =>
                  update({
                    channel:
                      key === "cartoes" || key === "boletos"
                        ? key
                        : key === "atrasados"
                          ? "pacientes"
                          : undefined,
                    method: undefined,
                    period: key === "atrasados" ? "atrasados" : "todos",
                    status: key === "atrasados" ? "pendente" : filters.status,
                  })
                }
              >
                {label}
              </Button>
            ))}
          </div>
        )}
        <div className="mb-4 grid gap-4 sm:grid-cols-3">
          <StatCard label="Atrasado" value={scope.overdue} tone="expense" />
          <StatCard label="Próximos 7 dias" value={scope.nextWeek} tone="warning" />
          <StatCard label="Total nesta lista" value={scope.total} tone="primary" />
        </div>

        <div className="mb-4 flex flex-wrap items-end gap-3">
          <label className="grid gap-1 text-xs text-muted-foreground">
            Buscar na lista
            <Input
              aria-label="Buscar paciente, fornecedor ou descrição"
              placeholder="Paciente, fornecedor ou descrição"
              className="w-64 bg-card"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
          <label className="grid gap-1 text-xs text-muted-foreground">
            Mês do vencimento
            <Input
              aria-label="Mês do vencimento"
              type="month"
              className="w-44 bg-card"
              value={filters.month ?? ""}
              onChange={(event) => update({ month: event.target.value || undefined })}
            />
          </label>
          <NativeSelect
            aria-label="Situação das contas"
            className="w-48"
            value={filters.status ?? "pendente"}
            onChange={(event) =>
              update({ status: event.target.value as AccountFilters["status"], period: "todos" })
            }
          >
            <option value="pendente">Em aberto</option>
            <option value="pago">{tab === "entrada" ? "Recebidos" : "Pagos"}</option>
            <option value="todos">Todas as situações</option>
          </NativeSelect>
          <NativeSelect
            aria-label="Filtrar vencimentos"
            className="w-48"
            value={period}
            onChange={(e) => update({ period: e.target.value as AccountFilters["period"] })}
          >
            <option value="todos">Todos os vencimentos</option>
            <option value="atrasados">Atrasados</option>
            <option value="7">Próximos 7 dias</option>
            <option value="30">Próximos 30 dias</option>
          </NativeSelect>
          <NativeSelect
            aria-label="Filtrar forma de pagamento"
            className="w-48"
            value={method}
            onChange={(e) =>
              update({ method: (e.target.value || undefined) as AccountFilters["method"] })
            }
          >
            <option value="">Todas as formas</option>
            {(Object.keys(PAYMENT_LABELS) as (keyof typeof PAYMENT_LABELS)[]).map((m) => (
              <option key={m} value={m}>
                {PAYMENT_LABELS[m]}
              </option>
            ))}
          </NativeSelect>
          {(filters.month ||
            filters.method ||
            filters.channel ||
            filters.status ||
            period !== "todos" ||
            search) && (
            <Button
              variant="ghost"
              onClick={() => {
                setSearch("");
                update({
                  month: undefined,
                  method: undefined,
                  period: undefined,
                  channel: undefined,
                  status: undefined,
                });
              }}
            >
              Limpar filtros
            </Button>
          )}
        </div>
        <p className="mb-3 text-xs text-muted-foreground">
          {rows.length} conta(s) nesta lista. Os totais acima respeitam o mês, a busca e os filtros
          selecionados.
        </p>
        {tab === "entrada" && (
          <p className="mb-3 text-xs text-muted-foreground">
            Cartões, boletos e demais recebíveis reunidos. O mês selecionado é o do vencimento,
            inclusive para parcelas recebidas.
          </p>
        )}
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Carregando…</p>
        ) : rows.length === 0 ? (
          <EmptyState title="Nenhuma conta com estes filtros" />
        ) : (
          <TxnTable rows={rows} />
        )}
      </QueryFeedback>
    </div>
  );
}
