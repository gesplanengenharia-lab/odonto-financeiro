// Pure finance rules for the clinic. No I/O here so it can be tested.

export type AccountFilters = {
  channel?: "cartoes" | "boletos" | "pacientes" | undefined;
  status?: "pendente" | "pago" | "todos" | undefined;
  kind?: Kind | undefined;
  month?: string | undefined;
  period?: "todos" | "atrasados" | "7" | "30" | undefined;
  method?: PaymentMethod | undefined;
};

/** URL filters contain no patient names and reject invalid or unrelated values. */
export function accountFilters(search: Record<string, unknown>): AccountFilters {
  const filters: AccountFilters = {};
  if (
    search["channel"] === "cartoes" ||
    search["channel"] === "boletos" ||
    search["channel"] === "pacientes"
  )
    filters.channel = search["channel"];
  if (
    search["status"] === "pendente" ||
    search["status"] === "pago" ||
    search["status"] === "todos"
  )
    filters.status = search["status"];
  if (search["kind"] === "entrada" || search["kind"] === "saida") filters.kind = search["kind"];
  if (typeof search["month"] === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(search["month"]))
    filters.month = search["month"];
  if (["todos", "atrasados", "7", "30"].includes(String(search["period"])))
    filters.period = search["period"] as AccountFilters["period"];
  if (typeof search["method"] === "string" && Object.hasOwn(PAYMENT_LABELS, search["method"]))
    filters.method = search["method"] as PaymentMethod;
  return filters;
}

/** One scope for the visible rows and their totals, including card receivables. */
export function openAccounts(
  txns: Txn[],
  filters: AccountFilters,
  today = todayISO(),
  search = "",
) {
  const normalize = (value: string) =>
    value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLocaleLowerCase("pt-BR");
  const needle = normalize(search.trim());
  const rows = txns
    .filter((t) => {
      if (t.kind !== (filters.kind ?? "saida")) return false;
      if (filters.status !== "todos" && t.status !== (filters.status ?? "pendente")) return false;
      if (
        filters.channel === "cartoes" &&
        t.payment_method !== "credito" &&
        t.payment_method !== "debito"
      )
        return false;
      if (filters.channel === "boletos" && t.payment_method !== "boleto") return false;
      if (
        filters.channel === "pacientes" &&
        (t.payment_method === "credito" || t.payment_method === "debito")
      )
        return false;
      if (filters.month && monthKey(t.due_date) !== filters.month) return false;
      if (filters.method && t.payment_method !== filters.method) return false;
      if (needle && !normalize(`${t.person ?? ""} ${t.description}`).includes(needle)) return false;
      if (filters.period === "atrasados") return isOverdue(t, today);
      if (filters.period === "7" || filters.period === "30")
        return t.due_date >= today && t.due_date <= addDays(today, Number(filters.period));
      return true;
    })
    .sort((a, b) => a.due_date.localeCompare(b.due_date) || a.id.localeCompare(b.id));
  const sum = (list: Txn[]) =>
    list.reduce((total, row) => total + Math.round(cashValue(row) * 100), 0) / 100;
  return {
    rows,
    total: sum(rows),
    overdue: sum(rows.filter((t) => isOverdue(t, today))),
    nextWeek: sum(
      rows.filter(
        (t) => t.status === "pendente" && t.due_date >= today && t.due_date <= addDays(today, 7),
      ),
    ),
  };
}

/** Compare equivalent calendar periods; never compare a partial month to a full one. */
export function managementComparison(txns: Txn[], month: string, today = todayISO()) {
  const current = monthRange(month);
  const previousMonth = monthKey(addMonths(current.start, -1));
  const previous = monthRange(previousMonth);
  const future = month > monthKey(today);
  const partial = month === monthKey(today);
  const end = partial ? today : current.end;
  const previousEnd = partial
    ? `${previousMonth}-${String(Math.min(Number(today.slice(8)), Number(previous.end.slice(8)))).padStart(2, "0")}`
    : previous.end;
  const summarizePeriod = (start: string, until: string) => {
    const inRange = (date: string) => date >= start && date <= until;
    const sales = txns.filter((t) => t.kind === "entrada" && inRange(t.competence_date));
    const paid = txns.filter((t) => t.status === "pago" && inRange(t.paid_date || t.due_date));
    const revenue = round2(sales.reduce((s, t) => s + t.gross_amount, 0));
    const received = round2(
      paid.filter((t) => t.kind === "entrada").reduce((s, t) => s + t.net_amount, 0),
    );
    const expenses = round2(
      paid.filter((t) => t.kind === "saida").reduce((s, t) => s + t.gross_amount, 0),
    );
    return {
      sales: revenue,
      received,
      expenses,
      result: round2(received - expenses),
      margin: cashMargin(received - expenses, received),
      recorded: txns.some((t) => inRange(t.competence_date)) || paid.length > 0,
    };
  };
  const now = summarizePeriod(current.start, end);
  const before = summarizePeriod(previous.start, previousEnd);
  const change = (value: number, base: number) => ({
    delta: !future && before.recorded ? round2(value - base) : null,
    percent: !future && base > 0 ? round2(((value - base) / base) * 100) : null,
  });
  return {
    month,
    previousMonth,
    start: current.start,
    end,
    previousStart: previous.start,
    previousEnd,
    partial,
    future,
    now,
    before,
    sales: change(now.sales, before.sales),
    received: change(now.received, before.received),
    expenses: change(now.expenses, before.expenses),
    result: change(now.result, before.result),
    marginPoints:
      !future && now.margin !== null && before.margin !== null
        ? round2(now.margin - before.margin)
        : null,
  };
}

export function managementHistory(txns: Txn[], month: string, today = todayISO()) {
  return nextMonths(monthKey(addMonths(`${month}-01`, -5)), 6).map((key) => {
    const comparison = managementComparison(txns, key, today);
    const available = !comparison.future && comparison.now.recorded;
    return {
      month: key,
      partial: comparison.partial,
      available,
      sales: available ? comparison.now.sales : null,
      received: available ? comparison.now.received : null,
      paid: available ? comparison.now.expenses : null,
      result: available ? comparison.now.result : null,
      margin: available ? comparison.now.margin : null,
    };
  });
}

/** Only a valid, explicitly entered amount is an opening-balance assumption. */
export function parseForecastOpening(text: string): number | null {
  const value = text.trim();
  if (!/^-?(?:\d{1,3}(?:\.\d{3})+|\d+)(?:,\d{1,2})?$/.test(value)) return null;
  const amount = Number(value.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(amount) && Math.abs(amount) <= 9999999999.99 ? amount : null;
}

/** Daily closing balances for exactly 90 days. Overdue bills enter on day one;
 * overdue income is excluded. A delay scenario shifts pending income only.
 * No paid item is counted again; no future sales, loans or fictional cash. */
export function forecast90(txns: Txn[], start: string, opening: number | null, delayDays = 0) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || toISO(parseISO(start)) !== start)
    throw new Error("Informe uma data inicial válida.");
  if (!Number.isInteger(delayDays) || delayDays < 0 || delayDays > 90)
    throw new Error("Confira os dias de atraso da simulação.");
  if (opening !== null && (!Number.isFinite(opening) || Math.abs(opening) > 9999999999.99))
    throw new Error("Informe um saldo inicial válido.");
  const end = addDays(start, 89);
  const cents = (value: number) => Math.round(value * 100);
  const daily = Array.from({ length: 90 }, (_, i) => ({
    date: addDays(start, i),
    income: 0,
    expenses: 0,
  }));
  const indexes = new Map(daily.map((day, i) => [day.date, i]));
  let overdueBills = 0,
    excludedOverdueIncome = 0,
    shiftedBeyond = 0;
  txns
    .filter((t) => t.status === "pendente")
    .forEach((t) => {
      const amount = cents(t.kind === "entrada" ? t.net_amount : t.gross_amount);
      let date = t.due_date;
      if (t.kind === "entrada") {
        if (date < start) {
          excludedOverdueIncome += amount;
          return;
        }
        date = addDays(date, delayDays);
        if (t.due_date <= end && date > end) shiftedBeyond += amount;
      } else if (date < start) {
        overdueBills += amount;
        date = start;
      }
      const i = indexes.get(date);
      if (i === undefined) return;
      if (t.kind === "entrada") daily[i]!.income += amount;
      else daily[i]!.expenses += amount;
    });
  let balance = opening === null ? null : cents(opening);
  let minimum = balance;
  let minimumDate: string | null = balance !== null ? start : null;
  let firstDeficit: string | null = balance !== null && balance < 0 ? start : null;
  const days = daily.map((day) => {
    if (balance !== null) {
      balance += day.income - day.expenses;
      if (minimum === null || balance < minimum) {
        minimum = balance;
        minimumDate = day.date;
      }
      if (balance < 0 && firstDeficit === null) firstDeficit = day.date;
    }
    return {
      date: day.date,
      income: day.income / 100,
      expenses: day.expenses / 100,
      balance: balance === null ? null : balance / 100,
    };
  });
  const buckets = new Map<
    string,
    {
      month: string;
      start: string;
      end: string;
      income: number;
      expenses: number;
      balance: number | null;
    }
  >();
  days.forEach((day) => {
    const key = monthKey(day.date);
    const bucket = buckets.get(key) ?? {
      month: key,
      start: day.date,
      end: day.date,
      income: 0,
      expenses: 0,
      balance: null,
    };
    bucket.end = day.date;
    bucket.income = round2(bucket.income + day.income);
    bucket.expenses = round2(bucket.expenses + day.expenses);
    bucket.balance = day.balance;
    buckets.set(key, bucket);
  });
  return {
    start,
    end,
    days,
    months: [...buckets.values()],
    delayDays,
    income: daily.reduce((s, day) => s + day.income, 0) / 100,
    expenses: daily.reduce((s, day) => s + day.expenses, 0) / 100,
    closing: balance === null ? null : balance / 100,
    minimum: minimum === null ? null : minimum / 100,
    minimumDate,
    firstDeficit,
    contribution: minimum === null ? null : Math.max(0, -minimum) / 100,
    overdueBills: overdueBills / 100,
    excludedOverdueIncome: excludedOverdueIncome / 100,
    shiftedBeyond: shiftedBeyond / 100,
  };
}

export type Kind = "entrada" | "saida";
export type PaymentMethod =
  "dinheiro" | "pix" | "debito" | "credito" | "boleto" | "transferencia" | "cheque";
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

export type NewTxnRow = Omit<Txn, "id">;

export type TransactionDetails = Pick<
  Txn,
  | "description"
  | "person"
  | "category_id"
  | "nature"
  | "competence_date"
  | "due_date"
  | "gross_amount"
  | "fee_amount"
  | "net_amount"
>;
export function transactionDetails(
  original: Txn,
  input: Omit<TransactionDetails, "net_amount">,
): TransactionDetails {
  const validDate = (value: string) =>
    /^\d{4}-\d{2}-\d{2}$/.test(value) && toISO(parseISO(value)) === value;
  if (!input.description.trim()) throw new Error("Informe a descrição do lançamento.");
  if (!validDate(input.competence_date) || !validDate(input.due_date))
    throw new Error("Confira a competência e o vencimento.");
  if (
    !Number.isFinite(input.gross_amount) ||
    input.gross_amount < 0 ||
    input.gross_amount > 9999999999.99
  )
    throw new Error("Informe um valor válido.");
  if (
    !Number.isFinite(input.fee_amount) ||
    input.fee_amount < 0 ||
    input.fee_amount > input.gross_amount
  )
    throw new Error("A taxa deve ficar entre zero e o valor bruto.");
  const gross = round2(input.gross_amount);
  const fee = original.kind === "entrada" ? round2(input.fee_amount) : 0;
  return {
    ...input,
    description: input.description.trim(),
    person: input.person?.trim() || null,
    nature: original.kind === "saida" ? input.nature : null,
    gross_amount: gross,
    fee_amount: fee,
    net_amount: round2(gross - fee),
  };
}

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
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Fee % charged by the card machine for a given method / number of installments. */
export function cardFeePercent(
  settings: CardSettings,
  method: PaymentMethod,
  installments: number,
) {
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
  const feePct =
    input.kind === "entrada" ? cardFeePercent(settings, input.payment_method, installments) : 0;
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
export function isDefaulted(
  t: Pick<Txn, "kind" | "status" | "due_date" | "payment_method">,
  today = todayISO(),
) {
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

/** Outstanding default follows the original due month, never the sale month. */
export function defaultedReceivables(
  txns: Txn[],
  month: string,
  onlyMonth = false,
  today = todayISO(),
) {
  const late = txns.filter((t) => isDefaulted(t, today));
  const total = (rows: Txn[]) => round2(rows.reduce((sum, t) => sum + Number(t.gross_amount), 0));
  const monthRows = late.filter((t) => monthKey(t.due_date) === month);
  const rows = onlyMonth ? monthRows : late;
  const map = new Map<string, Txn[]>();
  rows.forEach((t) => {
    const person = t.person?.trim() || "Sem paciente informado";
    map.set(person, [...(map.get(person) ?? []), t]);
  });
  const groups = [...map.entries()]
    .map(([person, items]) => ({
      person,
      rows: items,
      total: total(items),
      maxDays: Math.max(...items.map((t) => daysLate(t.due_date, today))),
    }))
    .sort((a, b) => b.total - a.total);
  return {
    groups,
    total: total(late),
    monthTotal: total(monthRows),
    over30: total(rows.filter((t) => daysLate(t.due_date, today) > 30)),
  };
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
export function summarize(
  txns: Pick<Txn, "kind" | "gross_amount" | "fee_amount" | "net_amount" | "nature">[],
): Summary {
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
    ? [
        "Janeiro",
        "Fevereiro",
        "Março",
        "Abril",
        "Maio",
        "Junho",
        "Julho",
        "Agosto",
        "Setembro",
        "Outubro",
        "Novembro",
        "Dezembro",
      ]
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

/** Faturamento: gross receivables by competence_date (what the clinic billed in
 * the month), regardless of when each installment is paid. */
export function monthBilling(txns: Txn[], month: string) {
  const { start, end } = monthRange(month);
  const rows = txns.filter(
    (t) => t.kind === "entrada" && t.competence_date >= start && t.competence_date <= end,
  );
  const gross = (list: Txn[]) => round2(list.reduce((v, t) => v + Number(t.gross_amount), 0));
  const total = gross(rows);
  const byMethod = (Object.keys(PAYMENT_LABELS) as PaymentMethod[]).map((method) => {
    const list = rows.filter((t) => t.payment_method === method);
    const amount = gross(list);
    const received = gross(list.filter((t) => t.status === "pago"));
    return {
      method,
      amount,
      received,
      pending: round2(amount - received),
      count: list.length,
      percent: total > 0 ? round2((amount / total) * 100) : null,
    };
  });
  const received = gross(rows.filter((t) => t.status === "pago"));
  return { total, received, pending: round2(total - received), count: rows.length, byMethod };
}

export const LIQUID_METHODS: PaymentMethod[] = ["dinheiro", "pix", "debito"];

/** Boleto agenda follows due dates; actual receipts follow payment dates. */
export function boletoReceivables(txns: Txn[], month: string, today = todayISO()) {
  const boletos = txns.filter((t) => t.kind === "entrada" && t.payment_method === "boleto");
  const total = (rows: Txn[]) => round2(rows.reduce((sum, t) => sum + Number(t.net_amount), 0));
  const pending = boletos.filter((t) => t.status === "pendente");
  const monthRows = boletos
    .filter((t) => monthKey(t.due_date) === month)
    .sort(
      (a, b) =>
        a.due_date.localeCompare(b.due_date) || (a.person ?? "").localeCompare(b.person ?? ""),
    );
  const projection = nextMonths(month, 24).map((key) => {
    const rows = pending.filter((t) => monthKey(t.due_date) === key);
    return { month: key, amount: total(rows), count: rows.length };
  });
  return {
    received: total(
      boletos.filter((t) => t.status === "pago" && monthKey(t.paid_date || t.due_date) === month),
    ),
    open: projection[0]!.amount,
    future: round2(projection.slice(1).reduce((sum, row) => sum + row.amount, 0)),
    overdue: total(pending.filter((t) => t.due_date < today)),
    monthRows,
    projection,
  };
}

const isLiquidEntry = (t: Txn) =>
  LIQUID_METHODS.includes(t.payment_method) ||
  (t.payment_method === "boleto" && t.installment_total === 1);

/** Cash, Pix, debit and single-payment boleto received in the month (by payment date)
 * pay the month's bills: paid + open bills of the month + older open bills. */
export function cashPixMonth(txns: Txn[], month: string, today = todayISO()) {
  const m = dashboardMonth(txns, month, today);
  const liquid = dashboardMonth(txns.filter(isLiquidEntry), month, today);
  const pick = (method: PaymentMethod) => liquid.byMethod.find((r) => r.method === method)!;
  const dinheiro = pick("dinheiro").received;
  const pix = pick("pix").received;
  const debito = pick("debito").received;
  const boletoAvista = pick("boleto").received;
  const received = liquid.received;
  const expected = liquid.toReceive;
  const billsOpen = round2(m.toPay + m.priorToPay);
  const bills = round2(m.paid + billsOpen);
  const { start, end } = monthRange(month);
  const entries = txns
    .filter(
      (t) =>
        t.kind === "entrada" &&
        t.status === "pago" &&
        isLiquidEntry(t) &&
        (t.paid_date || t.due_date) >= start &&
        (t.paid_date || t.due_date) <= end,
    )
    .sort((a, b) => (b.paid_date || b.due_date).localeCompare(a.paid_date || a.due_date));
  return {
    dinheiro,
    pix,
    debito,
    boletoAvista,
    received,
    expected,
    billsPaid: m.paid,
    billsOpen,
    bills,
    balance: round2(received - bills),
    projectedBalance: round2(received + expected - bills),
    coveragePct: bills > 0 ? round2((received / bills) * 100) : null,
    entries,
  };
}

/** Opening balance is a simulation, not an inferred bank balance or a new entry. */
export function dashboardFunding(projected: number, opening: number) {
  const closing = round2(opening + projected);
  return { closing, contribution: round2(Math.max(0, -closing)) };
}

/** Same conservative cash basis as the monthly simulation, carrying old bills once. */
export function cashFlowProjection(
  txns: Txn[],
  month: string,
  months: number,
  opening: number,
  today = todayISO(),
) {
  let balance = opening;
  return nextMonths(month, months).map((key, index) => {
    const m = dashboardMonth(txns, key, today);
    const { start, end } = monthRange(key);
    const expenses = txns.filter(
      (t) =>
        t.kind === "saida" &&
        (t.status === "pago"
          ? (t.paid_date || t.due_date) >= start && (t.paid_date || t.due_date) <= end
          : (t.due_date >= start && t.due_date <= end) || (index === 0 && t.due_date < start)),
    );
    const fixed = round2(
      expenses.filter((t) => t.nature === "fixa").reduce((sum, t) => sum + cashValue(t), 0),
    );
    const variable = round2(
      expenses.filter((t) => t.nature !== "fixa").reduce((sum, t) => sum + cashValue(t), 0),
    );
    const card = round2(
      m.byMethod
        .filter((r) => r.method === "credito" || r.method === "debito")
        .reduce((sum, r) => sum + r.received + r.expected, 0),
    );
    const other = round2(m.totalExpected - card);
    const result = round2(m.realized + m.toReceive - m.toPay - (index === 0 ? m.priorToPay : 0));
    balance = round2(balance + result);
    return { key, mes: formatMonth(key), card, other, fixed, variable, result, balance };
  });
}

export function cardReceivables(txns: Txn[], month: string, today = todayISO()) {
  const cards = txns.filter(
    (t) =>
      t.kind === "entrada" && (t.payment_method === "credito" || t.payment_method === "debito"),
  );
  const m = dashboardMonth(cards, month, today);
  const sum = (rows: Txn[]) => round2(rows.reduce((v, t) => v + Number(t.net_amount), 0));
  const pending = cards.filter((t) => t.status === "pendente");
  const monthRows = cards.filter((t) => monthKey(t.due_date) === month);
  const projection = nextMonths(month, 24).map((key) => ({
    month: key,
    amount: sum(pending.filter((t) => monthKey(t.due_date) === key)),
  }));
  return {
    received: m.received,
    open: round2(m.toReceive + m.overdueReceivable),
    overdue: sum(pending.filter((t) => t.due_date < today)),
    future: round2(projection.slice(1).reduce((v, r) => v + r.amount, 0)),
    projection,
    monthGross: round2(monthRows.reduce((v, t) => v + Number(t.gross_amount), 0)),
    monthFees: round2(monthRows.reduce((v, t) => v + Number(t.fee_amount), 0)),
    monthRows,
  };
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
export function dashboardIndicators(
  txns: Txn[],
  competence: Txn[],
  month: string,
  today = todayISO(),
) {
  const cash = dashboardMonth(txns, month, today);
  const summary = summarize(competence);
  const share = (value: number, total: number) =>
    total > 0 ? round2((value / total) * 100) : null;
  const { start, end } = monthRange(month);
  const due = txns.filter(
    (t) =>
      t.kind === "entrada" &&
      t.payment_method !== "credito" &&
      t.payment_method !== "debito" &&
      t.due_date >= start &&
      t.due_date <= end &&
      t.due_date < today,
  );
  const dueAmount = round2(due.reduce((sum, t) => sum + Number(t.gross_amount), 0));
  const defaultedAmount = round2(
    due.filter((t) => isDefaulted(t, today)).reduce((sum, t) => sum + Number(t.gross_amount), 0),
  );
  return {
    byMethod: cash.byMethod.map((row) => ({
      method: row.method,
      receivedPct: share(row.received, cash.received),
    })),
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
  const percent = (value: number) =>
    summary.totalExpenses > 0 ? round2((value / summary.totalExpenses) * 100) : null;
  return groups.map((group) => {
    const values = new Map<string | null, number>();
    for (const txn of txns.filter((t) => t.kind === "saida" && t.nature === group.nature)) {
      values.set(txn.category_id, (values.get(txn.category_id) ?? 0) + Number(txn.gross_amount));
    }
    const amount = round2([...values.values()].reduce((sum, value) => sum + value, 0));
    return {
      ...group,
      amount,
      percent: percent(amount),
      rows: [...values]
        .map(([id, value]) => ({
          id,
          name: categories.find((c) => c.id === id)?.name ?? "Sem categoria",
          amount: round2(value),
          percent: percent(value),
        }))
        .sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name, "pt-BR")),
    };
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
  const amounts = [
    values.base,
    values.additional,
    values.commission,
    values.bonus,
    values.discount,
    values.termination ?? 0,
    values.vacation ?? 0,
  ];
  if (amounts.some((value) => !Number.isFinite(value) || value < 0 || value > 999999999))
    throw new Error("Informe valores positivos válidos, com até duas casas decimais.");
  const cents = (value: number) => Math.round(value * 100);
  const total =
    cents(values.base) +
    cents(values.additional) +
    cents(values.commission) +
    cents(values.bonus) +
    cents(values.termination ?? 0) +
    cents(values.vacation ?? 0) -
    cents(values.discount);
  if (total < 0) throw new Error("Os descontos não podem superar a remuneração do mês.");
  return total / 100;
}

export interface DownPaymentInput {
  amount: number;
  payment_method: PaymentMethod;
  first_due_date?: string;
  paid?: boolean;
}

/** A sale has one competence and one total; the down payment and balance
 * generate separate payment rows linked by the same group, never recurrences. */
export function buildLaunchPlan(
  input: NewLaunchInput & { down_payment?: DownPaymentInput },
  settings: CardSettings,
  makeGroupId: () => string,
) {
  const validDate = (date: string) =>
    /^\d{4}-\d{2}-\d{2}$/.test(date) &&
    !Number.isNaN(Date.parse(date)) &&
    new Date(date).toISOString().slice(0, 10) === date;
  const cents = (amount: number) => {
    if (
      !Number.isFinite(amount) ||
      amount <= 0 ||
      amount > 999999999 ||
      Math.abs(round2(amount) - amount) > 0.000001
    )
      throw new Error("Informe um valor positivo, com até duas casas decimais.");
    return Math.round(amount * 100);
  };
  const total = cents(input.amount);
  if (!validDate(input.date) || (input.first_due_date && !validDate(input.first_due_date)))
    throw new Error("Informe datas válidas para a venda e os vencimentos.");
  if (
    !Number.isInteger(input.installments) ||
    input.installments < 1 ||
    input.installments > (input.payment_method === "credito" ? 12 : 24)
  )
    throw new Error("Confira a quantidade de parcelas.");
  const { down_payment: down, ...sale } = input;
  const repeat = input.repeat_months ?? 1;
  if (!Number.isInteger(repeat) || repeat < 1 || repeat > 24)
    throw new Error("A recorrência deve ter de 1 a 24 meses.");
  if (repeat > 1 && (input.kind !== "saida" || input.installments !== 1 || down))
    throw new Error("Recorrência é destinada a despesas mensais sem parcelamento.");
  const common = { ...sale, repeat_months: repeat };
  if (!down)
    return {
      rows: buildLaunchRows(common, settings, makeGroupId),
      entryAmount: 0,
      remaining: total / 100,
    };
  if (input.kind !== "entrada") throw new Error("Pagamento com entrada é destinado às receitas.");
  const entry = cents(down.amount);
  if (entry >= total)
    throw new Error(
      "A entrada deve ser menor que o valor total. Para pagamento integral, desmarque a opção de entrada.",
    );
  if (down.first_due_date && !validDate(down.first_due_date))
    throw new Error("Informe uma data válida para a entrada.");
  const group = makeGroupId();
  const remaining = (total - entry) / 100;
  const entryRows = buildLaunchRows(
    {
      ...common,
      amount: entry / 100,
      description: `${sale.description} · Entrada`,
      payment_method: down.payment_method,
      installments: 1,
      first_due_date: down.first_due_date || sale.date,
      paid: !!down.paid,
    },
    settings,
    () => group,
  );
  const balanceRows = buildLaunchRows(
    { ...common, amount: remaining, description: `${sale.description} · Saldo` },
    settings,
    () => group,
  );
  return {
    rows: [...entryRows, ...balanceRows].map((row) => ({ ...row, group_id: group })),
    entryAmount: entry / 100,
    remaining,
  };
}

// ---------------------------------------------------------------------------
// Executive dashboard (painel) — every figure declares its period and base.

/** Cash margin = cash result ÷ receipts of the same month. Null = no base. */
export function cashMargin(realized: number, received: number) {
  return received > 0 ? round2((realized / received) * 100) : null;
}

export type ReceiptGroupKey =
  | "dinheiro"
  | "pix"
  | "debito"
  | "boleto_avista"
  | "credito"
  | "boleto_parcelado"
  | "cheque"
  | "transferencia";

export const RECEIPT_GROUP_LABELS: Record<ReceiptGroupKey, string> = {
  dinheiro: "Dinheiro",
  pix: "Pix",
  debito: "Cartão de débito",
  boleto_avista: "Boleto à vista",
  credito: "Cartão de crédito",
  boleto_parcelado: "Boleto parcelado",
  cheque: "Cheque",
  transferencia: "Transferência",
};

const receiptGroup = (t: Txn): ReceiptGroupKey =>
  t.payment_method === "boleto"
    ? isLiquidEntry(t)
      ? "boleto_avista"
      : "boleto_parcelado"
    : t.payment_method;

/** Receipts of the month (by payment date, net) split by form, with the
 * upfront subtotal (cash, Pix, debit, single boleto). Percent base = total received. */
export function receiptComposition(txns: Txn[], month: string) {
  const { start, end } = monthRange(month);
  const settled = txns.filter((t) => {
    const date = t.paid_date || t.due_date;
    return t.kind === "entrada" && t.status === "pago" && date >= start && date <= end;
  });
  const total = round2(settled.reduce((sum, t) => sum + cashValue(t), 0));
  const share = (v: number) => (total > 0 ? round2((v / total) * 100) : null);
  const upfrontKeys: ReceiptGroupKey[] = ["dinheiro", "pix", "debito", "boleto_avista"];
  const rows = (Object.keys(RECEIPT_GROUP_LABELS) as ReceiptGroupKey[]).map((key) => {
    const amount = round2(
      settled.filter((t) => receiptGroup(t) === key).reduce((s, t) => s + cashValue(t), 0),
    );
    return {
      key,
      label: RECEIPT_GROUP_LABELS[key],
      amount,
      percent: share(amount),
      upfront: upfrontKeys.includes(key),
    };
  });
  const upfront = round2(rows.filter((r) => r.upfront).reduce((s, r) => s + r.amount, 0));
  return {
    total,
    upfront,
    upfrontPct: share(upfront),
    other: round2(total - upfront),
    otherPct: share(round2(total - upfront)),
    rows,
    count: settled.length,
  };
}

/** Pending patient receivables from the selected month on, never including
 * overdue rows (those belong to inadimplência / card confirmation). */
export function futureReceivables(txns: Txn[], month: string, today = todayISO(), count = 3) {
  const open = txns.filter(
    (t) => t.kind === "entrada" && t.status === "pendente" && t.due_date >= today,
  );
  const keys = nextMonths(month, count + 1);
  const last = keys[keys.length - 1]!;
  const sum = (rows: Txn[]) => round2(rows.reduce((s, t) => s + cashValue(t), 0));
  const months = keys.map((key) => {
    const rows = open.filter((t) => monthKey(t.due_date) === key);
    return { month: key, amount: sum(rows), count: rows.length };
  });
  const laterRows = open.filter((t) => monthKey(t.due_date) > last);
  const later = sum(laterRows);
  const total = round2(months.reduce((s, m) => s + m.amount, 0) + later);
  return {
    months,
    later,
    laterCount: laterRows.length,
    total,
    cardShare: sum(
      open.filter(
        (t) =>
          monthKey(t.due_date) >= month &&
          (t.payment_method === "credito" || t.payment_method === "debito"),
      ),
    ),
  };
}

export interface DashboardAlert {
  id: "defaulted" | "overdue_bills" | "bills_week" | "cards_unconfirmed" | "missing_paid_date";
  tone: "expense" | "warning" | "info";
  title: string;
  amount: number | null;
  count: number;
  to: "/inadimplentes" | "/contas" | "/cartoes" | "/lancamentos";
}

/** Situations that need action today — independent of the selected month. */
export function dashboardAlerts(txns: Txn[], today = todayISO()): DashboardAlert[] {
  const sum = (rows: Txn[]) => round2(rows.reduce((s, t) => s + cashValue(t), 0));
  const pending = txns.filter((t) => t.status === "pendente");
  const overdueBills = pending.filter((t) => t.kind === "saida" && t.due_date < today);
  const weekBills = pending.filter(
    (t) => t.kind === "saida" && t.due_date >= today && t.due_date <= addDays(today, 7),
  );
  const defaulted = txns.filter((t) => isDefaulted(t, today));
  const cards = pending.filter(
    (t) =>
      t.kind === "entrada" &&
      (t.payment_method === "credito" || t.payment_method === "debito") &&
      t.due_date < today,
  );
  const missing = txns.filter((t) => t.status === "pago" && !t.paid_date);
  const alerts: DashboardAlert[] = [
    {
      id: "overdue_bills",
      tone: "expense",
      title: "Contas vencidas e não pagas",
      amount: sum(overdueBills),
      count: overdueBills.length,
      to: "/contas",
    },
    {
      id: "defaulted",
      tone: "warning",
      title: "Recebimentos de pacientes em atraso",
      amount: sum(defaulted),
      count: defaulted.length,
      to: "/inadimplentes",
    },
    {
      id: "cards_unconfirmed",
      tone: "warning",
      title: "Repasses de cartão vencidos sem confirmação",
      amount: sum(cards),
      count: cards.length,
      to: "/cartoes",
    },
    {
      id: "bills_week",
      tone: "info",
      title: "Contas que vencem nos próximos 7 dias",
      amount: sum(weekBills),
      count: weekBills.length,
      to: "/contas",
    },
    {
      id: "missing_paid_date",
      tone: "info",
      title: "Lançamentos pagos sem data de pagamento",
      amount: null,
      count: missing.length,
      to: "/lancamentos",
    },
  ];
  return alerts.filter((a) => a.count > 0);
}
