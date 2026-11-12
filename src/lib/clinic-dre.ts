import { monthKey, type Txn } from "./finance";
import { readPayroll } from "./payroll";
const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

export const CLINIC_DRE_LINES = [
  ["pro_labore", "PRÓ LABORE"],
  ["occupancy", "ALUGUEL + IPTU + CONDOMÍNIO"],
  ["utilities", "AGUA/LUZ/INTERNET"],
  ["monitoring", "ALARME/MONITORAMENTO"],
  ["insurance", "SEGURO DA CLINICA"],
  ["lab_external", "LABORATÓRIO EXTERNO"],
  ["lab_internal", "LABORATÓRIO INTERNO"],
  ["implants", "MATERIAL ODONTOLÓGICO ESPECÍFICO - IMPLANTES"],
  ["aligners", "MATERIAL ODONTOLÓGICO ESPECÍFICO- ALINHADORES"],
  ["hof", "MATERIAL ODONTOLÓGICO ESPECÍFICO - HOF"],
  ["dental", "MATERIAL ODONTOLÓGICO BÁSICO - DENTAL"],
  ["payroll", "PAGAMENTO -FOLHA DE PAGAMENTO FUNCIONÁRIOS"],
  ["evaluator", "PAGAMENTO AVALIADOR"],
  ["dentists", "PAGAMENTO -EQUIPE CLÍNICA - DENTISTAS"],
  ["bonuses", "PAGAMENTO -COMISSÕES/BONIFICAÇÕES"],
  ["marketing", "PAGAMENTO -MARKETING - IMPULSIONAMENTO + AGÊNCIA"],
  ["clinicorp", "SOFTWARE- CLINICORP"],
  ["crm", "SOFTWARE- CRM - APP NOVISALES"],
  ["select", "PAGAMENTO -MENSALIDADE SELECT CLUB"],
  ["select_guest", "PAGAMENTO -MENSALIDADE SELECT CLUB ACOMPANHANTE"],
  ["sales_pro", "PAGAMENTO -SALES PRO TREINAMENTO"],
  ["travel", "PAGAMENTO -DESPESA VIAJENS SÃO PAULO - HOTE/GASOLINA/ALIMENTAÇÃO"],
  ["accounting", "CONTABIIDADE"],
  ["taxes", "IMPOSTOS SOBRE NOTAS E/OU RECIBOS (DAS e/ou DARFS)"],
  ["social", "FGTS/ GPS"],
  ["supplies", "DESPESAS EXTRAS VARIAVEIS - SUPERMECADO/PAPELARIA/PADARIA/ETC"],
  ["refunds", "DEVOLUÇÃO DE TRATAMENTO"],
  ["reserve", "FUNDO DE RESERVA"],
  ["improvements", "FUNDO DE MELHORIAS"],
  ["vacation_fund", "FUNDO 13 E FÉRIAS"],
  ["other_funds", "OUTROS FUNDOS"],
  ["other", "DEMAIS DESPESAS"],
] as const;
export type ClinicDreLine = (typeof CLINIC_DRE_LINES)[number][0];
const keys = new Set<string>(CLINIC_DRE_LINES.map(([key]) => key));
export const FUND_LINES = new Set<ClinicDreLine>([
  "reserve",
  "improvements",
  "vacation_fund",
  "other_funds",
]);
export function transactionNotes(notes: string | null): Record<string, unknown> {
  try {
    const value: unknown = JSON.parse(notes ?? "{}");
    return value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : { original_note: notes };
  } catch {
    return { original_note: notes };
  }
}
const normalize = (text: string) =>
  text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
export function clinicDreOverride(txn: Txn): ClinicDreLine | null {
  const value = transactionNotes(txn.notes)["clinic_dre_line"];
  return typeof value === "string" && keys.has(value) ? (value as ClinicDreLine) : null;
}
export interface DreAllocation {
  txn: Txn;
  line: ClinicDreLine;
  amount: number;
  detail: string;
  manual: boolean;
}
export function clinicDreAllocations(txn: Txn, category = ""): DreAllocation[] {
  if (txn.kind !== "saida") return [];
  const entry = (
    line: ClinicDreLine,
    amount = txn.gross_amount,
    detail = txn.description,
    manual = false,
  ): DreAllocation => ({ txn, line, amount: round2(amount), detail, manual });
  const override = clinicDreOverride(txn);
  if (override) return [entry(override, txn.gross_amount, txn.description, true)];
  const p = readPayroll(txn);
  if (p) {
    // Clinical fees remain in dentists; only employee commissions and explicit bonuses move out.
    const extras = Math.min(
      txn.gross_amount,
      p.bonus + (p.group === "funcionario" ? p.commission : 0),
    );
    const base = round2(txn.gross_amount - extras);
    const allocations: DreAllocation[] = [];
    if (base)
      allocations.push(
        entry(
          p.group === "funcionario" ? "payroll" : "dentists",
          base,
          p.group === "funcionario"
            ? "Folha, adicionais, férias e acertos, líquidos dos descontos"
            : "Remuneração clínica",
        ),
      );
    if (extras)
      allocations.push(entry("bonuses", extras, "Comissões / bonificações discriminadas na folha"));
    return allocations;
  }
  const d = normalize(txn.description),
    c = normalize(category);
  let line: ClinicDreLine = "other";
  if (/pro\s*-?\s*labore/.test(d)) line = "pro_labore";
  else if (/aluguel|iptu|condominio/.test(d)) line = "occupancy";
  else if (/fundo.*reserva/.test(d)) line = "reserve";
  else if (/fundo.*melhoria/.test(d)) line = "improvements";
  else if (/fundo.*(13|ferias)/.test(d)) line = "vacation_fund";
  else if (/fundo/.test(d)) line = "other_funds";
  else if (/fgts|\bgps\b|inss/.test(d)) line = "social";
  else if (/clinicorp/.test(d)) line = "clinicorp";
  else if (/novis|novisales|software.*crm/.test(d)) line = "crm";
  else if (
    /(\bsp\b|sao paulo)/.test(d) &&
    /hotel|gasolina|almoco|cafe|airbnb|viage|aliment/.test(d)
  )
    line = "travel";
  else if (/select.*acompanhante/.test(d)) line = "select_guest";
  else if (/select/.test(d) && /mentoria|mensalidade|club/.test(d)) line = "select";
  else if (/sales\s*pro/.test(d)) line = "sales_pro";
  else if (/contabil/.test(d)) line = "accounting";
  else if (/(imposto|simples nacional|\bdas\b|\bdarf)/.test(d)) line = "taxes";
  else if (/seguro.*clinica|clinica.*seguro/.test(d)) line = "insurance";
  else if (/brintel|monitoramento|alarme/.test(d)) line = "monitoring";
  else if (/cemig|copasa|internet|\bvivo\b|energia eletrica/.test(d + " " + c)) line = "utilities";
  else if (/laboratorio.*interno/.test(d)) line = "lab_internal";
  else if (/laboratorio|protetico/.test(d) || /laboratorio/.test(c)) line = "lab_external";
  else if (/implante|neodent|straumann/.test(d)) line = "implants";
  else if (/alinhador|invisalign/.test(d)) line = "aligners";
  else if (/\bhof\b|harmonizacao/.test(d)) line = "hof";
  else if (/dental|material odontologico/.test(d + " " + c)) line = "dental";
  else if (/avaliador/.test(d)) line = "evaluator";
  else if (/bonifica|comissao|comisao/.test(d)) line = "bonuses";
  else if (/marketing|trafego|facebook|radio/.test(d + " " + c)) line = "marketing";
  else if (/estorn|devolu/.test(d) && /pacient|cliente|tratamento/.test(d)) line = "refunds";
  else if (/supermerc|mart minas|papelaria|padaria|para copias|\bifood\b/.test(d))
    line = "supplies";
  else if (/salario|vale transporte|transcard/.test(d) || /salarios/.test(c)) line = "payroll";
  return [entry(line)];
}
export function clinicDre(
  rows: Txn[],
  months: string[],
  categories: { id: string; name: string }[] = [],
) {
  const categoryNames = new Map(categories.map((c) => [c.id, c.name]));
  return months.map((month) => {
    const current = rows.filter((t) => monthKey(t.competence_date) === month);
    const allocations = current.flatMap((t) =>
      clinicDreAllocations(t, categoryNames.get(t.category_id ?? "") ?? ""),
    );
    const totals = Object.fromEntries(
      CLINIC_DRE_LINES.map(([key]) => [
        key,
        round2(allocations.filter((a) => a.line === key).reduce((sum, a) => sum + a.amount, 0)),
      ]),
    ) as Record<ClinicDreLine, number>;
    const revenue = round2(
      current
        .filter((t) => t.kind === "entrada")
        .reduce((sum, t) => sum + t.gross_amount - t.fee_amount, 0),
    );
    const expenses = round2(
      allocations.filter((a) => !FUND_LINES.has(a.line)).reduce((sum, a) => sum + a.amount, 0),
    );
    const funds = round2(
      allocations.filter((a) => FUND_LINES.has(a.line)).reduce((sum, a) => sum + a.amount, 0),
    );
    return {
      month,
      allocations,
      totals,
      revenue,
      expenses,
      funds,
      profit: round2(revenue - expenses),
      available: round2(revenue - expenses - funds),
    };
  });
}
