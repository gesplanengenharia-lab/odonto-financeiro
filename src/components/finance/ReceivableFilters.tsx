import type { Txn } from "@/lib/finance";
import { todayISO } from "@/lib/finance";
import { Input } from "@/components/ui/input";

export type ReceivableStatus = "todos" | "pago" | "pendente" | "vencido";

export function filterReceivables(
  rows: Txn[],
  patient: string,
  status: ReceivableStatus,
  today = todayISO(),
) {
  const normalize = (value: string) =>
    value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLocaleLowerCase("pt-BR");
  const search = normalize(patient.trim());
  return rows.filter(
    (row) =>
      (!search || normalize(row.person ?? "").includes(search)) &&
      (status === "todos" ||
        (status === "vencido"
          ? row.status === "pendente" && row.due_date < today
          : row.status === status)),
  );
}

export function ReceivableFilters({
  patient,
  status,
  onPatient,
  onStatus,
  count,
  total,
}: {
  patient: string;
  status: ReceivableStatus;
  onPatient: (value: string) => void;
  onStatus: (value: ReceivableStatus) => void;
  count: number;
  total: number;
}) {
  return (
    <div className="surface-card mb-4 grid gap-3 p-4 sm:grid-cols-[1fr_220px]">
      <label className="grid gap-1.5 text-sm font-medium">
        Paciente
        <Input
          placeholder="Buscar pelo nome"
          value={patient}
          onChange={(e) => onPatient(e.target.value)}
        />
      </label>
      <label className="grid gap-1.5 text-sm font-medium">
        Situação
        <select
          className="h-9 rounded-md border border-input bg-card px-3 text-sm"
          value={status}
          onChange={(e) => onStatus(e.target.value as ReceivableStatus)}
        >
          <option value="todos">Todas as situações</option>
          <option value="pago">Recebidos</option>
          <option value="pendente">Em aberto</option>
          <option value="vencido">Vencidos e não recebidos</option>
        </select>
      </label>
      <p className="text-xs text-muted-foreground sm:col-span-2" aria-live="polite">
        {count} de {total} lançamentos na lista. Os indicadores e a agenda mantêm os totais do
        período.
      </p>
    </div>
  );
}
