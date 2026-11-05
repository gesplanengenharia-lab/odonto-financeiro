import clinicLogo from "@/assets/essencial-logo.png?inline";
import { formatBRL, formatDate, formatPct, PAYMENT_LABELS, summarize, type Txn } from "./finance";

export interface ReportFilter {
  start: string;
  end: string;
  category: string;
}
export interface ReportCategory {
  id: string;
  name: string;
  kind: string;
}
export function validReportRange(start: string, end: string) {
  const valid = (s: string) =>
    /^\d{4}-\d{2}-\d{2}$/.test(s) &&
    !Number.isNaN(Date.parse(s)) &&
    new Date(s).toISOString().slice(0, 10) === s;
  return valid(start) && valid(end) && start <= end;
}
export function filterReportRows(rows: Txn[], filter: ReportFilter) {
  if (!validReportRange(filter.start, filter.end)) return [];
  return rows.filter(
    (t) =>
      t.competence_date >= filter.start &&
      t.competence_date <= filter.end &&
      (filter.category === "all" ||
        (filter.category === "none" ? !t.category_id : t.category_id === filter.category)),
  );
}
export function reportCategoryLabel(categories: ReportCategory[], id: string) {
  if (id === "all") return "Todas as categorias";
  if (id === "none") return "Sem categoria";
  const c = categories.find((c) => c.id === id);
  return c
    ? `${c.name} (${c.kind === "entrada" ? "receita" : "despesa"})`
    : "Categoria não encontrada";
}
const csvText = (value: string) => {
  // Prevent spreadsheet formula execution, including leading whitespace/control characters.
  const safe =
    /^[\s\u0000-\u001f]*[=+@-]/.test(value) || /^[\t\r\n]/.test(value) ? `'${value}` : value;
  return `"${safe.replace(/"/g, '""')}"`;
};
const decimal = (n: number) => Number(n).toFixed(2).replace(".", ",");
export function financialCsv(rows: Txn[], categories: ReportCategory[], filter: ReportFilter) {
  const header = [
    "Período inicial",
    "Período final",
    "Filtro categoria",
    "Competência",
    "Vencimento",
    "Pagamento",
    "Tipo",
    "Descrição",
    "Categoria",
    "Natureza",
    "Forma",
    "Status",
    "Parcela",
    "Valor bruto",
    "Taxa",
    "Valor líquido",
  ];
  const selected = filterReportRows(rows, filter);
  const lines = selected.map((t) =>
    [
      filter.start,
      filter.end,
      reportCategoryLabel(categories, filter.category),
      t.competence_date,
      t.due_date,
      t.paid_date ?? "",
      t.kind === "entrada" ? "Entrada" : "Saída",
      t.description,
      categories.find((c) => c.id === t.category_id)?.name ?? "Sem categoria",
      t.nature ?? "",
      PAYMENT_LABELS[t.payment_method],
      t.automatic_payment ? "Pago automaticamente no vencimento" : t.status === "pago" ? "Pago" : "Pendente",
      `${t.installment_number}/${t.installment_total}`,
      decimal(t.gross_amount),
      decimal(t.fee_amount),
      decimal(t.net_amount),
    ]
      .map(csvText)
      .join(";"),
  );
  return "\uFEFF" + [header.map(csvText).join(";"), ...lines].join("\r\n");
}
export const escapeReportHtml = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
export function financialPrintHtml(
  rows: Txn[],
  categories: ReportCategory[],
  filter: ReportFilter,
) {
  const selected = filterReportRows(rows, filter);
  const s = summarize(selected);
  const title = `Essencial Odontologia - Relatório financeiro - ${formatDate(filter.start)} a ${formatDate(filter.end)}`;
  const e = escapeReportHtml;
  const summary: [string, number][] = [
    ["Receita bruta", s.grossRevenue],
    ["Taxas de cartão", -s.cardFees],
    ["Receita líquida", s.netRevenue],
    ["Despesas fixas", -s.fixedExpenses],
    ["Despesas variáveis / sem natureza", -s.variableExpenses],
    ["Resultado gerencial", s.profit],
  ];
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${e(title)}</title><style>
    @page { size: A4 landscape; margin: 12mm; } * { box-sizing:border-box; } body { font:12px Arial,sans-serif; color:#172c32; margin:24px; }  .clinic-logo {width:180px;height:auto;display:block;background:#976f67;padding:12px;border-radius:6px;print-color-adjust:exact;-webkit-print-color-adjust:exact;} header {margin-top:16px;break-inside:avoid;} h1 {font-size:22px;margin-bottom:8px;} h2 {font-size:16px;margin-top:25px;} p {line-height:1.5;} table {width:100%;border-collapse:collapse;margin:12px 0;} th,td {padding:7px 8px;border-bottom:1px solid #dce3e5;text-align:left;vertical-align:top;overflow-wrap:anywhere;} th {background:#edf3f3;} .num {text-align:right;white-space:nowrap;} .muted {color:#52656c;} .summary {max-width:600px;} .details {table-layout:fixed;font-size:10px;} thead {display:table-header-group;} tr {break-inside:avoid;} button {padding:10px 16px;background:#145c59;color:white;border:0;border-radius:6px;cursor:pointer;} @media print { body {margin:0;} button {display:none;} h2 {break-after:avoid;} }
  </style></head><body><button id="print-report">Imprimir / Salvar como PDF</button><header><img class="clinic-logo" src="${e(clinicLogo)}" alt="Essencial Odontologia"><h1>${e(title)}</h1></header><p>${e(reportCategoryLabel(categories, filter.category))}<br>Regime de competência · ${selected.length} lançamento(s)</p><h2>Demonstrativo gerencial</h2><table class="summary"><tbody>${summary.map(([label, value]) => `<tr><td>${e(label)}</td><td class="num">${e(formatBRL(value))}</td></tr>`).join("")}<tr><td>Margem sobre receita bruta</td><td class="num">${s.grossRevenue ? e(formatPct(s.margin)) : "—"}</td></tr></tbody></table><p class="muted">Valores pela competência, incluindo pendentes. Este resultado não representa saldo bancário. O cadastro atual não distingue aportes, investimentos e retiradas do resultado operacional.</p><h2>Lançamentos do período</h2><table class="details"><thead><tr><th style="width:9%">Competência</th><th style="width:9%">Vencimento</th><th style="width:9%">Pagamento</th><th style="width:8%">Tipo</th><th style="width:20%">Descrição / Categoria</th><th style="width:12%">Forma / Status</th><th style="width:5%">Parcela</th><th class="num" style="width:10%">Bruto</th><th class="num" style="width:8%">Taxa</th><th class="num" style="width:10%">Líquido</th></tr></thead><tbody>${selected.map((t) => `<tr><td>${e(formatDate(t.competence_date))}</td><td>${e(formatDate(t.due_date))}</td><td>${e(formatDate(t.paid_date))}</td><td>${t.kind === "entrada" ? "Entrada" : "Saída"}</td><td>${e(t.description)}<br><span class="muted">${e(categories.find((c) => c.id === t.category_id)?.name ?? "Sem categoria")}</span></td><td>${e(PAYMENT_LABELS[t.payment_method])}<br>${t.automatic_payment ? "Pago automaticamente no vencimento" : t.status === "pago" ? "Pago" : "Pendente"}</td><td>${t.installment_number}/${t.installment_total}</td><td class="num">${e(formatBRL(t.gross_amount))}</td><td class="num">${e(formatBRL(t.fee_amount))}</td><td class="num">${e(formatBRL(t.net_amount))}</td></tr>`).join("") || '<tr><td colspan="10">Sem lançamentos para os filtros selecionados.</td></tr>'}</tbody></table></body></html>`;
}
export function downloadFinancialCsv(
  rows: Txn[],
  categories: ReportCategory[],
  filter: ReportFilter,
) {
  const url = URL.createObjectURL(
    new Blob([financialCsv(rows, categories, filter)], { type: "text/csv;charset=utf-8" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = `financeiro_${filter.start}_${filter.end}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function printFinancialPdf(rows: Txn[], categories: ReportCategory[], filter: ReportFilter) {
  const popup = window.open("", "_blank");
  if (!popup) throw new Error("Permita pop-ups para abrir o relatório em PDF.");
  popup.opener = null;
  popup.document.open();
  popup.document.write(financialPrintHtml(rows, categories, filter));
  popup.document.close();
  popup.document.getElementById("print-report")?.addEventListener("click", () => popup.print());
  popup.focus();
  const logo = popup.document.querySelector("img");
  if (logo && !logo.complete) {
    logo.addEventListener("load", () => popup.print(), { once: true });
    logo.addEventListener("error", () => popup.print(), { once: true });
  } else popup.print();
}
