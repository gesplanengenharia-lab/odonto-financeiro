// Pure finance rules for the clinic. No I/O here so it can be tested.

export type Kind = "entrada" | "saida";
export type PaymentMethod = "dinheiro" | "pix" | "debito" | "credito" | "boleto" | "transferencia" | "cheque";
export type Status = "pago" | "pendente";
export type Nature = "fixa" | "variavel";

export const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  dinheiro: "Dinheiro",
  pix: "Pix",
  debito: "Cartão de débito",
  credito: "Cartão de crédito",
  boleto: "Boleto",
  transferencia: "Transferência",
  cheque: "Cheque",
};

export const NATURE_LABELS: Record<Nature, string> = { fixa: "Fixa", variavel: "Variável" };

export interface CardSettings {
  debit_fee: number;
  debit_days: number;
  credit_fee_1x: number;
  credit_fee_2_6: number;
  credit_fee_7_12: number;
  credit_days: number;
}

export interface Txn {
  id: string;
  kind: Kind;
  description: string;
  person: string | null;
  category_id: string | null;
  nature: Nature | null;
  payment_method: PaymentMethod;
  status: Status;
  auto_settle?: boolean;
  recorded_status?: Status;
  recorded_paid_date?: string | null;
  automatic_payment?: boolean;
  competence_date: string;
  due_date: string;
  paid_date: string | null;
  gross_amount: number;
  fee_amount: number;
  net_amount: number;
  installment_number: number;
  installment_total: number;
  group_id: string | null;
  notes: string | null;
}

export interface NewLaunchInput {
  kind: Kind;
  description: string;
  person?: string | null;
  category_id?: string | null;
  nature?: Nature | null;
  payment_method: PaymentMethod;
  amount: number; // total value
  date: string; // competence date (atendimento / compra) YYYY-MM-DD
  first_due_date?: string; // for boleto/pix/etc: first due date
  installments: number; // 1..24
  repeat_months?: number; // recurring (fixed expense): number of months, 1 = no repeat
  paid?: boolean; // first installment already paid (non-card)
  notes?: string | null;
}

export type NewTxnRow = Omit<Txn, "id" | "recorded_status" | "recorded_paid_date" | "automatic_payment">;

const round2 = (n: number) => Math.round(n * 100) / 100;

/** ISO date helpers working on calendar dates (no timezone drift). */
export function parseISO(d: string): Date {
  const [y = 1970, m = 1, day = 1] = d.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, day));
}
export function toISO(d: Date): string {
  return d.toISOString().slice(0, 10);
}
export function addDays(iso: string, days: number): string {
  const d = parseISO(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return toISO(d);
}
export function addMonths(iso: string, months: number): string {
  const d = parseISO(iso);
  const day = d.getUTCDate();
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, 1));
  const lastDay = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate();
  target.setUTCDate(Math.min(day, lastDay));
  return toISO(target);
}
export function monthKey(iso: string): string {
  return iso.slice(0, 7);
}
export function todayISO(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
}

/** Automatic settlement is a planning assumption, not bank reconciliation.
 * Keep stored fields for optimistic edits; explicit exceptions never auto-settle. */
export function effectivePayment(t: Txn, today = todayISO()): Txn {
  const status = t.recorded_status ?? t.status;
  const paidDate = t.recorded_status !== undefined ? t.recorded_paid_date ?? null : t.paid_date;
  const automatic = t.auto_settle === true && status === "pendente" && t.due_date <= today;
  return { ...t, recorded_status: status, recorded_paid_date: paidDate,
    automatic_payment: automatic, status: automatic ? "pago" : status,
    paid_date: automatic ? t.due_date : paidDate };
}

export type PaymentMode = "automatico" | "pendente" | "pago";
export function paymentPatch(mode: PaymentMode, paidDate: string, today = todayISO()) {
  if (mode === "pago" && (!/^\d{4}-\d{2}-\d{2}$/.test(paidDate) ||
      Number.isNaN(Date.parse(paidDate)) || new Date(paidDate).toISOString().slice(0, 10) !== paidDate || paidDate > today))
    throw new Error("Informe uma data de pagamento válida, até hoje.");
  return { auto_settle: mode === "automatico", status: mode === "pago" ? "pago" as const : "pendente" as const,
    paid_date: mode === "pago" ? paidDate : null };
}

/** Fee % charged by the card machine for a given method / number of installments. */
export function cardFeePercent(settings: CardSettings, method: PaymentMethod, installments: number) {
  if (method === "debito") return Number(settings.debit_fee);
  if (method !== "credito") return 0;
  if (installments <= 1) return Number(settings.credit_fee_1x);
  if (installments <= 6) return Number(settings.credit_fee_2_6);
  return Number(settings.credit_fee_7_12);
}

/** Split a total into N parts in cents; remainder goes to the last part. */
export function splitAmount(total: number, parts: number): number[] {
  const cents = Math.round(total * 100);
  const base = Math.floor(cents / parts);
  const out = Array.from({ length: parts }, () => base);
  out[parts - 1] = base + (cents - base * parts);
  return out.map((c) => c / 100);
}

/**
 * Turn one launch form into the rows to store:
 * - Débito: one row, received after `debit_days`, fee deducted.
 * - Crédito: N installments, installment i received at date + credit_days * i, fee deducted.
 * - Other methods: N installments monthly from first_due_date (no fee).
 * - repeat_months > 1 repeats the whole launch monthly (fixed expenses, rents, salaries).
 */
export function buildLaunchRows(
  input: NewLaunchInput,
  settings: CardSettings,
  makeGroupId: () => string,
): NewTxnRow[] {
  const isCard = input.payment_method === "debito" || input.payment_method === "credito";
  const installments =
    input.payment_method === "debito" ? 1 : Math.max(1, Math.floor(input.installments || 1));
  const repeat = Math.max(1, Math.floor(input.repeat_months || 1));
  const feePct = input.kind === "entrada" ? cardFeePercent(settings, input.payment_method, installments) : 0;
  const rows: NewTxnRow[] = [];

  for (let r = 0; r < repeat; r++) {
    const competence = addMonths(input.date, r);
    const firstDue = addMonths(input.first_due_date || input.date, r);
    const groupId = installments > 1 || repeat > 1 ? makeGroupId() : null;
    const parts = splitAmount(input.amount, installments);

    parts.forEach((gross, i) => {
      let due: string;
      if (input.payment_method === "debito") due = addDays(competence, Number(settings.debit_days));
      else if (input.payment_method === "credito")
        due = addDays(competence, Number(settings.credit_days) * (i + 1));
      else due = addMonths(firstDue, i);

      const fee = isCard ? round2((gross * feePct) / 100) : 0;
      const paidNow = !isCard && !!input.paid && i === 0 && r === 0;

      rows.push({
        kind: input.kind,
        description: input.description,
        person: input.person || null,
        category_id: input.category_id || null,
        nature: input.kind === "saida" ? input.nature || null : null,
        payment_method: input.payment_method,
        status: paidNow ? "pago" : "pendente",
        competence_date: competence,
        due_date: due,
        paid_date: paidNow ? due : null,
        gross_amount: gross,
        fee_amount: fee,
        net_amount: round2(gross - fee),
        installment_number: i + 1,
        installment_total: installments,
        group_id: groupId,
        notes: input.notes || null,
      });
    });
  }
  return rows;
}

export function isOverdue(t: Pick<Txn, "status" | "due_date">, today = todayISO()) {
  return t.status === "pendente" && t.due_date < today;
}

/** A patient is in default when a non-card receivable is past due and unpaid. */
export function isDefaulted(t: Pick<Txn, "kind" | "status" | "due_date" | "payment_method">, today = todayISO()) {
  return (
    t.kind === "entrada" &&
    t.payment_method !== "debito" &&
    t.payment_method !== "credito" &&
    isOverdue(t, today)
  );
}

export function daysLate(due: string, today = todayISO()) {
  return Math.max(0, Math.round((parseISO(today).getTime() - parseISO(due).getTime()) / 86400000));
}

export interface Summary {
  grossRevenue: number;
  cardFees: number;
  netRevenue: number;
  fixedExpenses: number;
  variableExpenses: number;
  totalExpenses: number;
  profit: number;
  margin: number; // % of gross revenue
}

/** DRE-style summary (by competence). */
export function summarize(txns: Pick<Txn, "kind" | "gross_amount" | "fee_amount" | "net_amount" | "nature">[]): Summary {
  let grossRevenue = 0,
    cardFees = 0,
    fixedExpenses = 0,
    variableExpenses = 0;
  for (const t of txns) {
    if (t.kind === "entrada") {
      grossRevenue += Number(t.gross_amount);
      cardFees += Number(t.fee_amount);
    } else if (t.nature === "fixa") fixedExpenses += Number(t.gross_amount);
    else variableExpenses += Number(t.gross_amount);
  }
  const netRevenue = grossRevenue - cardFees;
  const totalExpenses = fixedExpenses + variableExpenses;
  const profit = netRevenue - totalExpenses;
  return {
    grossRevenue: round2(grossRevenue),
    cardFees: round2(cardFees),
    netRevenue: round2(netRevenue),
    fixedExpenses: round2(fixedExpenses),
    variableExpenses: round2(variableExpenses),
    totalExpenses: round2(totalExpenses),
    profit: round2(profit),
    margin: grossRevenue > 0 ? round2((profit / grossRevenue) * 100) : 0,
  };
}

/** Cash value of a row: what actually lands in / leaves the account. */
export function cashValue(t: Pick<Txn, "kind" | "net_amount" | "gross_amount">) {
  return t.kind === "entrada" ? Number(t.net_amount) : Number(t.gross_amount);
}

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
export const formatBRL = (n: number) => brl.format(n || 0);
export const formatPct = (n: number) =>
  `${(n || 0).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
export function formatDate(iso: string | null) {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}
const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
export function formatMonth(key: string, long = false) {
  const [y = "", m = "1"] = key.split("-");
  const names = long
    ? ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"]
    : MONTHS;
  return `${names[Number(m) - 1]}${long ? " de " : "/"}${long ? y : y.slice(2)}`;
}
export function monthRange(key: string) {
  const start = `${key}-01`;
  const end = addDays(addMonths(start, 1), -1);
  return { start, end };
}
export function nextMonths(fromKey: string, count: number) {
  return Array.from({ length: count }, (_, i) => monthKey(addMonths(`${fromKey}-01`, i)));
}

/** Settled cash uses paid_date; pending cash uses due_date. Legacy paid rows
 * without paid_date fall back to due_date and are disclosed in the dashboard.
 * Overdue receivables are excluded from the conservative closing forecast.
 */
export function dashboardMonth(txns: Txn[], month: string, today = todayISO()) {
  const { start, end } = monthRange(month);
  const within = (date: string) => date >= start && date <= end;
  const settled = txns.filter((t) => t.status === "pago" && within(t.paid_date || t.due_date));
  const pending = txns.filter((t) => t.status === "pendente" && within(t.due_date));
  const total = (rows: Txn[], kind: Kind) =>
    round2(rows.filter((t) => t.kind === kind).reduce((v, t) => v + cashValue(t), 0));
  const received = total(settled, "entrada");
  const paid = total(settled, "saida");
  const receivable = total(pending, "entrada");
  const overdueReceivable = total(
    pending.filter((t) => t.due_date < today),
    "entrada",
  );
  const toReceive = round2(receivable - overdueReceivable);
  const toPay = total(pending, "saida");
  const priorPending = txns.filter((t) => t.status === "pendente" && t.due_date < start);
  const priorToPay = total(priorPending, "saida");
  const priorToReceive = total(priorPending, "entrada");
  const realized = round2(received - paid);
  const projected = round2(realized + toReceive - toPay - priorToPay);
  const byMethod = (Object.keys(PAYMENT_LABELS) as PaymentMethod[]).map((method) => {
    const received = total(
      settled.filter((t) => t.payment_method === method),
      "entrada",
    );
    const open = pending.filter((t) => t.payment_method === method);
    const overdue = total(
      open.filter((t) => t.due_date < today),
      "entrada",
    );
    const expected = round2(total(open, "entrada") - overdue);
    return { method, received, expected, overdue, total: round2(received + expected + overdue) };
  });
  return {
    received,
    paid,
    receivable,
    overdueReceivable,
    toReceive,
    toPay,
    priorToPay,
    priorToReceive,
    realized,
    projected,
    byMethod,
    totalExpected: round2(received + toReceive),
    totalOut: round2(paid + toPay + priorToPay),
    missingPaidDates: settled.filter((t) => !t.paid_date).length,
    cashDre: summarize(settled),
  };
}

/** Opening balance is a simulation, not an inferred bank balance or a new entry. */
export function dashboardFunding(projected: number, opening: number) {
  const closing = round2(opening + projected);
  return { closing, contribution: round2(Math.max(0, -closing)) };
}

/** Daily reconciliation only includes confirmed payment dates; never infer a day. */
export function dashboardDay(txns: Txn[], day: string) {
  const settled = txns.filter((t) => t.status === "pago" && t.paid_date === day);
  const total = (rows: Txn[], kind: Kind) =>
    round2(rows.filter((t) => t.kind === kind).reduce((sum, t) => sum + cashValue(t), 0));
  const received = total(settled, "entrada");
  const paid = total(settled, "saida");
  const byMethod = (Object.keys(PAYMENT_LABELS) as PaymentMethod[]).map((method) => {
    const rows = settled.filter((t) => t.payment_method === method);
    const received = total(rows, "entrada");
    const paid = total(rows, "saida");
    return { method, received, paid, movement: round2(received - paid) };
  });
  const cardSales = summarize(
    txns.filter(
      (t) =>
        t.kind === "entrada" &&
        t.competence_date === day &&
        (t.payment_method === "credito" || t.payment_method === "debito"),
    ),
  ).grossRevenue;
  return {
    received,
    paid,
    movement: round2(received - paid),
    byMethod,
    cardSales,
    count: settled.length,
    missingPaidDates: txns.filter((t) => t.status === "pago" && !t.paid_date).length,
  };
}

/** Only aggregate finance data crosses the AI gateway boundary. */
export function financialAssistantContext(
  txns: Txn[],
  categories: { id: string; name: string }[],
  fromMonth: string,
  toMonth: string,
  today = todayISO(),
) {
  const count =
    (Number(toMonth.slice(0, 4)) - Number(fromMonth.slice(0, 4))) * 12 +
    Number(toMonth.slice(5)) -
    Number(fromMonth.slice(5)) +
    1;
  const { start } = monthRange(fromMonth);
  const { end } = monthRange(toMonth);
  const competence = txns.filter((t) => t.competence_date >= start && t.competence_date <= end);
  const ids = [...new Set(competence.map((t) => t.category_id))];
  return {
    moeda: "BRL",
    hoje: today,
    periodo: { inicio: start, fim: end },
    dre_competencia: summarize(competence),
    categorias_competencia: ids.map((id) => ({
      categoria: categories.find((c) => c.id === id)?.name ?? "Sem categoria",
      resumo: summarize(competence.filter((t) => t.category_id === id)),
    })),
    meses: nextMonths(fromMonth, count).map((month) => {
      const m = dashboardMonth(txns, month, today);
      return {
        mes: month,
        recebido_liquido: m.received,
        pago: m.paid,
        a_receber_a_vencer: m.toReceive,
        a_receber_atrasado: m.overdueReceivable,
        a_pagar_pendente: m.toPay,
        despesas_anteriores_pendentes: m.priorToPay,
        recebiveis_anteriores_pendentes: m.priorToReceive,
        movimento_realizado: m.realized,
        movimento_projetado_sem_saldo_inicial: m.projected,
        formas_de_recebimento: m.byMethod,
        pagos_sem_data: m.missingPaidDates,
        dre: summarize(txns.filter((t) => monthKey(t.competence_date) === month)),
      };
    }),
    limites: [
      "Pagamentos automáticos são considerados realizados no vencimento, salvo exceções editadas. Não são conciliação bancária.",
      "Dados representam o status atual; não são snapshots históricos.",
      "Projeção exclui recebíveis atrasados e inclui despesas anteriores ainda pendentes. Não some saldos projetados de meses diferentes: despesas anteriores podem se repetir.",
      "Saldo bancário inicial não está disponível; não afirme aporte necessário ou saldo bancário.",
      "Taxas já descontadas dos recebimentos líquidos. Pendentes não são caixa realizado.",
      "Cadastro não separa aportes, retiradas e investimentos da operação.",
      "Pagos sem data usam vencimento como referência mensal.",
    ],
  };
}

/** Monthly ratios use explicit, matching cohorts. Null means no denominator.
 * Default rate: outstanding non-card receivables / all non-card receivables
 * due earlier than today within the selected month (including settled rows).
 */
export function dashboardIndicators(txns: Txn[], competence: Txn[], month: string, today = todayISO()) {
  const cash = dashboardMonth(txns, month, today);
  const summary = summarize(competence);
  const share = (value: number, total: number) => total > 0 ? round2(value / total * 100) : null;
  const { start, end } = monthRange(month);
  const due = txns.filter(t => t.kind === "entrada" && t.payment_method !== "credito" && t.payment_method !== "debito"
    && t.due_date >= start && t.due_date <= end && t.due_date < today);
  const dueAmount = round2(due.reduce((sum, t) => sum + Number(t.gross_amount), 0));
  const defaultedAmount = round2(due.filter(t => isDefaulted(t, today)).reduce((sum, t) => sum + Number(t.gross_amount), 0));
  return {
    byMethod: cash.byMethod.map(row => ({ method: row.method, receivedPct: share(row.received, cash.received) })),
    profitPct: share(summary.profit, summary.grossRevenue),
    fixedPct: share(summary.fixedExpenses, summary.totalExpenses),
    variablePct: share(summary.variableExpenses, summary.totalExpenses),
    defaultedAmount,
    dueAmount,
    defaultPct: share(defaultedAmount, dueAmount),
  };
}

/** Expense categories retain each transaction's nature, including unclassified rows. */
export function dashboardCosts(txns: Txn[], categories: { id: string; name: string }[]) {
  const summary = summarize(txns);
  const groups = [
    { nature: "fixa", label: "Custos fixos" },
    { nature: "variavel", label: "Custos variáveis" },
    { nature: null, label: "Sem natureza definida" },
  ] as const;
  const percent = (value: number) => summary.totalExpenses > 0 ? round2(value / summary.totalExpenses * 100) : null;
  return groups.map(group => {
    const values = new Map<string | null, number>();
    for (const txn of txns.filter(t => t.kind === "saida" && t.nature === group.nature)) {
      values.set(txn.category_id, (values.get(txn.category_id) ?? 0) + Number(txn.gross_amount));
    }
    const amount = round2([...values.values()].reduce((sum, value) => sum + value, 0));
    return { ...group, amount, percent: percent(amount), rows: [...values].map(([id, value]) => ({
      id, name: categories.find(c => c.id === id)?.name ?? "Sem categoria", amount: round2(value), percent: percent(value),
    })).sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name, "pt-BR")) };
  });
}

export interface PayrollAmounts {
  termination?: number;
  vacation?: number;
  base: number;
  additional: number;
  commission: number;
  bonus: number;
  discount: number;
}

/** Monthly remuneration in integer cents. Discounts cannot create a negative payment. */
export function payrollTotal(values: PayrollAmounts) {
  const amounts = [values.base, values.additional, values.commission, values.bonus, values.discount, values.termination ?? 0, values.vacation ?? 0];
  if (amounts.some(value => !Number.isFinite(value) || value < 0 || value > 999999999))
    throw new Error("Informe valores positivos válidos, com até duas casas decimais.");
  const cents = (value: number) => Math.round(value * 100);
  const total = cents(values.base) + cents(values.additional) + cents(values.commission) + cents(values.bonus) + cents(values.termination ?? 0) + cents(values.vacation ?? 0) - cents(values.discount);
  if (total < 0) throw new Error("Os descontos não podem superar a remuneração do mês.");
  return total / 100;
}

export type TxnDetailsInput = Pick<Txn, "description" | "person" | "category_id" | "nature" | "payment_method" | "competence_date" | "due_date" | "gross_amount" | "fee_amount" | "notes">;
export function txnEditDetails(kind: Kind, data: TxnDetailsInput) {
  const validDate = (date: string) => /^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(Date.parse(date)) && new Date(date).toISOString().slice(0, 10) === date;
  if (!data.description.trim() || data.description.length > 500 || (data.person?.length ?? 0) > 200 || (data.notes?.length ?? 0) > 10000)
    throw new Error("Confira a descrição, o nome e as observações.");
  if (!validDate(data.competence_date) || !validDate(data.due_date)) throw new Error("Informe datas válidas.");
  if (![data.gross_amount, data.fee_amount].every(v => Number.isFinite(v) && v >= 0 && v <= 999999999) || data.fee_amount > data.gross_amount)
    throw new Error("Informe valores válidos; a taxa não pode superar o valor da parcela.");
  if (!(data.payment_method in PAYMENT_LABELS) || (data.nature !== null && !["fixa", "variavel"].includes(data.nature))) throw new Error("Confira a forma e a natureza.");
  const gross = round2(data.gross_amount), fee = kind === "entrada" ? round2(data.fee_amount) : 0;
  return { ...data, description: data.description.trim(), gross_amount: gross, fee_amount: fee,
    net_amount: round2(gross - fee) };
}

/** Keep import/payroll metadata out of editable observation text. */
function managedNotes(notes: string | null): Record<string, unknown> | null {
  try {
    const data: unknown = JSON.parse(notes ?? "");
    if (data && typeof data === "object" && !Array.isArray(data) && "source" in data &&
      typeof data.source === "string" && (data.source.startsWith("essencial-entradas-v1:") || data.source === "essencial-payroll-v1"))
      return data as Record<string, unknown>;
  } catch { /* Ordinary free text. */ }
  return null;
}
export function transactionNoteText(notes: string | null) {
  const metadata = managedNotes(notes);
  return metadata ? typeof metadata["observation"] === "string" ? metadata["observation"] : "" : notes ?? "";
}
export function transactionNoteUpdate(original: string | null, text: string | null) {
  const metadata = managedNotes(original);
  return metadata ? JSON.stringify({ ...metadata, observation: text ?? "" }) : text || null;
}
