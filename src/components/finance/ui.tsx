import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { formatBRL, isOverdue, type Txn } from "@/lib/finance";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { addMonths, formatMonth, monthKey } from "@/lib/finance";

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl font-semibold text-foreground sm:text-3xl">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

type Tone = "default" | "income" | "expense" | "warning" | "primary";
const toneText: Record<Tone, string> = {
  default: "text-foreground",
  income: "text-income",
  expense: "text-expense",
  warning: "text-warning",
  primary: "text-primary",
};
const toneDot: Record<Tone, string> = {
  default: "bg-muted-foreground",
  income: "bg-income",
  expense: "bg-expense",
  warning: "bg-warning",
  primary: "bg-primary",
};

export function StatCard({
  label,
  value,
  hint,
  tone = "default",
  raw,
}: {
  label: string;
  value: number;
  hint?: ReactNode;
  tone?: Tone;
  raw?: string;
}) {
  return (
    <div className="surface-card p-5">
      <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        <span className={cn("h-1.5 w-1.5 rounded-full", toneDot[tone])} />
        {label}
      </div>
      <div className={cn("tabular mt-2 font-display text-2xl font-semibold", toneText[tone])}>
        {raw ?? formatBRL(value)}
      </div>
      {hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}

export function StatusBadge({ t }: { t: Pick<Txn, "status" | "due_date" | "automatic_payment" | "kind"> }) {
  const overdue = isOverdue(t);
  const cls =
    t.status === "pago"
      ? "bg-income-soft text-income"
      : overdue
        ? "bg-expense-soft text-expense"
        : "bg-warning-soft text-warning";
  const label = t.automatic_payment ? (t.kind === "entrada" ? "Recebido automaticamente" : "Pago automaticamente") : t.status === "pago" ? "Pago" : overdue ? "Atrasado" : "Pendente";
  return <span className={cn("inline-flex rounded-full px-2 py-0.5 text-xs font-semibold", cls)}>{label}</span>;
}

export function KindBadge({ kind }: { kind: "entrada" | "saida" }) {
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2 py-0.5 text-xs font-semibold",
        kind === "entrada" ? "bg-income-soft text-income" : "bg-expense-soft text-expense",
      )}
    >
      {kind === "entrada" ? "Entrada" : "Saída"}
    </span>
  );
}

export function MonthPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="surface-card flex items-center gap-1 p-1">
      <Button variant="ghost" size="icon" aria-label="Mês anterior" onClick={() => onChange(monthKey(addMonths(`${value}-01`, -1)))}>
        <ChevronLeft />
      </Button>
      <span className="min-w-36 text-center text-sm font-semibold capitalize">{formatMonth(value, true)}</span>
      <Button variant="ghost" size="icon" aria-label="Próximo mês" onClick={() => onChange(monthKey(addMonths(`${value}-01`, 1)))}>
        <ChevronRight />
      </Button>
    </div>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border px-6 py-14 text-center">
      <p className="font-display text-base font-semibold text-foreground">{title}</p>
      {children && <div className="mt-2 max-w-md text-sm text-muted-foreground">{children}</div>}
    </div>
  );
}

export function Money({ value, kind, className }: { value: number; kind?: "entrada" | "saida"; className?: string }) {
  return (
    <span className={cn("tabular font-semibold", kind === "entrada" && "text-income", kind === "saida" && "text-expense", className)}>
      {kind === "saida" ? "− " : ""}
      {formatBRL(value)}
    </span>
  );
}

