import { createFileRoute } from "@tanstack/react-router";
import { ManagementDetails } from "@/components/finance/ManagementDetails";
import { pageHead } from "@/lib/head";
import { useFinancialMonth } from "@/hooks/use-financial-month";
import { MonthPicker, PageHeader } from "@/components/finance/ui";

const views = [
  "metas",
  "evolucao",
  "previsao90",
  "faturamento",
  "formas",
  "contas",
  "dre",
  "referencia",
  "diario",
  "exportar",
];
export const Route = createFileRoute("/_authenticated/relatorios")({
  head: () => pageHead("Gestão", "Crescimento, resultado, previsão e relatórios em um só lugar."),
  validateSearch: (search: Record<string, unknown>): { view?: string } =>
    typeof search["view"] === "string" && views.includes(search["view"])
      ? { view: search["view"] }
      : {},
  component: Management,
});
function Management() {
  const [month, setMonth] = useFinancialMonth();
  const { view } = Route.useSearch();
  const navigate = Route.useNavigate();
  return (
    <div>
      <PageHeader
        title="Gestão"
        subtitle="Crescimento, resultado e previsão da clínica"
        actions={
          view !== "exportar" ? <MonthPicker value={month} onChange={setMonth} /> : undefined
        }
      />
      <ManagementDetails
        key={view ?? "evolucao"}
        initialTab={view ?? "evolucao"}
        onSelect={(value) => {
          void navigate({ search: { view: value }, replace: true });
        }}
      />
    </div>
  );
}
