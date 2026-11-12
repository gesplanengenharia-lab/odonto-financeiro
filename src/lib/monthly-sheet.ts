import {
  addMonths,
  buildLaunchRows,
  type CardSettings,
  type NewTxnRow,
  type PaymentMethod,
} from "./finance";
import { CLINIC_DRE_LINES } from "./clinic-dre";
import { ENTRY_HEADERS, EXPENSE_HEADERS, SHEET_VERSION } from "./monthly-sheet-format";
export type SheetCell = string | number | boolean | Date | null;
export type RawSheet = { sheet: string; data: unknown[][] };
export type ImportEntry = {
  operation?: "create" | "settle";
  source_key: string;
  label: string;
  sheet: string;
  row: number;
  transactions: NewTxnRow[];
  allow_existing?: boolean;
};
const clean = (v: unknown) => String(v ?? "").trim();
const norm = (v: unknown) =>
  clean(v)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ");
export function sheetDate(value: SheetCell | undefined, monthOnly = false): string {
  if (value instanceof Date) {
    if (!Number.isFinite(value.getTime())) throw new Error("Data inválida.");
    const iso = value.toISOString().slice(0, 10);
    return monthOnly ? iso.slice(0, 7) + "-01" : iso;
  }
  if (typeof value === "number")
    return sheetDate(new Date(Date.UTC(1899, 11, 30) + Math.round(value) * 86400000), monthOnly);
  let s = clean(value),
    m: RegExpMatchArray | null;
  if ((m = s.match(/^(\d{2})\/(\d{4})$/)) && monthOnly) s = m[2] + "-" + m[1] + "-01";
  else if ((m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/))) s = m[3] + "-" + m[2] + "-" + m[1];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || new Date(s + "T00:00:00Z").toISOString().slice(0, 10) !== s)
    throw new Error("Informe uma data válida (dd/mm/aaaa).");
  return monthOnly ? s.slice(0, 7) + "-01" : s;
}
const money = (v: SheetCell | undefined) => {
  const n =
    typeof v === "number"
      ? v
      : Number(
          clean(v)
            .replace(/R\$/g, "")
            .replace(/\s/g, "")
            .replace(/\.(?=\d{3}(\D|$))/g, "")
            .replace(",", "."),
        );
  if (
    !Number.isFinite(n) ||
    n <= 0 ||
    n > 999999999 ||
    Math.abs(n * 100 - Math.round(n * 100)) > 0.00001
  )
    throw new Error("Valor deve ser positivo e ter até duas casas decimais.");
  return n;
};
const methodOf = (v: SheetCell | undefined): PaymentMethod => {
  const options: Record<string, PaymentMethod> = {
    pix: "pix",
    dinheiro: "dinheiro",
    "cartao de credito": "credito",
    "cartao de debito": "debito",
    boleto: "boleto",
    cheque: "cheque",
    transferencia: "transferencia",
  };
  const method = options[norm(v)];
  if (!method) throw new Error("Escolha a forma de pagamento na lista.");
  return method;
};
const text = (v: SheetCell | undefined, label: string, max = 240) => {
  const s = clean(v);
  if (!s || s.length > max)
    throw new Error(label + " é obrigatório e deve ter até " + max + " caracteres.");
  return s;
};
async function stableUUID(key: string) {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(key));
  const hex = Array.from(new Uint8Array(hash))
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
  return (
    hex.slice(0, 8) +
    "-" +
    hex.slice(8, 12) +
    "-5" +
    hex.slice(13, 16) +
    "-a" +
    hex.slice(17, 20) +
    "-" +
    hex.slice(20, 32)
  );
}
/** Normalization and expansion use the same installment rules as daily launches. */
export async function parseMonthlySheets(
  sheets: RawSheet[],
  settings: CardSettings,
  today: string,
) {
  const entries: ImportEntry[] = [],
    errors: string[] = [],
    seen = new Set<string>();
  let fileMonth = "",
    workbookId = "";
  for (const [name, headers, kind] of [
    ["Entradas", ENTRY_HEADERS, "entrada"],
    ["Saídas", EXPENSE_HEADERS, "saida"],
  ] as const) {
    const sheet = sheets.find((s) => s.sheet === name);
    if (!sheet) {
      errors.push("Aba " + name + " ausente.");
      continue;
    }
    const rows = sheet.data as SheetCell[][];
    if (clean(rows[0]?.[13]) !== SHEET_VERSION) {
      errors.push(name + ": use o modelo oficial da Essencial.");
      continue;
    }
    const book = clean(rows[1]?.[13]);
    if (!/^[0-9a-f-]{36}$/i.test(book)) {
      errors.push(name + ": código de controle inválido.");
      continue;
    }
    let month: string;
    try {
      month = sheetDate(rows[2]?.[1], true).slice(0, 7);
    } catch {
      errors.push(name + ": informe o mês do arquivo em B3.");
      continue;
    }
    if (fileMonth && (month !== fileMonth || book !== workbookId)) {
      errors.push("As duas abas precisam pertencer ao mesmo arquivo e mês.");
      continue;
    }
    fileMonth = month;
    workbookId = book;
    if (headers.some((h, i) => clean(rows[6]?.[i]) !== h)) {
      errors.push(name + ": os nomes ou a ordem das colunas foram alterados.");
      continue;
    }
    for (let i = 7; i < rows.length; i++) {
      const r = rows[i] ?? [];
      if (r.slice(1, headers.length).every((v) => v === null || v === undefined || clean(v) === ""))
        continue;
      if (entries.length >= 2000) {
        errors.push("Limite de 2.000 linhas preenchidas por arquivo.");
        break;
      }
      try {
        const code = text(r[0], "Código", 30);
        if (!/^[A-Za-z0-9_-]+$/.test(code)) throw new Error("Código inválido.");
        const key = workbookId + ":" + fileMonth + ":" + kind + ":" + code;
        if (seen.has(key))
          throw new Error("Código repetido nesta aba. Não copie códigos já usados.");
        seen.add(key);
        let transactions: NewTxnRow[],
          description: string,
          operation: "create" | "settle" = "create";
        if (kind === "entrada") {
          const date = sheetDate(r[1]),
            person = text(r[2], "Paciente", 120);
          description = text(r[3], "Descrição");
          const amount = money(r[4]),
            method = methodOf(r[5]),
            installments = clean(r[6]) === "" ? 1 : Number(r[6]);
          if (!Number.isInteger(installments) || installments < 1 || installments > 24)
            throw new Error("Parcelas deve ser um número entre 1 e 24.");
          if ((method === "dinheiro" || method === "debito") && installments !== 1)
            throw new Error("Dinheiro e débito devem ter uma parcela.");
          const firstDue = clean(r[7]) ? sheetDate(r[7]) : null,
            paid = clean(r[8]) ? sheetDate(r[8]) : null;
          if (paid && paid > today)
            throw new Error(
              "Recebimento não pode ter data futura. Deixe em branco para a receber.",
            );
          const fee = clean(r[9]) === "" ? null : Number(clean(r[9]).replace(",", "."));
          const mode = norm(r[11]);
          if (mode && !["nova venda", "baixa de parcela"].includes(mode))
            throw new Error("Tipo de entrada inválido.");
          if (mode === "baixa de parcela") {
            if (!paid || !firstDue || installments !== 1 || fee !== null)
              throw new Error(
                "Para baixa de parcela, preencha primeiro vencimento e recebido em, use 1 parcela e deixe a taxa em branco.",
              );
            operation = "settle";
          }
          if (fee !== null && (!Number.isFinite(fee) || fee < 0 || fee > 100))
            throw new Error("Taxa deve ficar entre 0 e 100.");
          if (fee && method !== "credito" && method !== "debito")
            throw new Error("Taxa só se aplica a cartões.");
          const group = await stableUUID(key);
          const rates =
            operation === "settle"
              ? {
                  ...settings,
                  debit_fee: 0,
                  credit_fee_1x: 0,
                  credit_fee_2_6: 0,
                  credit_fee_7_12: 0,
                }
              : fee === null
                ? settings
                : {
                    ...settings,
                    debit_fee: fee,
                    credit_fee_1x: fee,
                    credit_fee_2_6: fee,
                    credit_fee_7_12: fee,
                  };
          transactions = buildLaunchRows(
            {
              kind: "entrada",
              description,
              person,
              amount,
              date,
              payment_method: method,
              installments,
              first_due_date: firstDue ?? date,
              paid: false,
            },
            rates,
            () => group,
          );
          transactions = transactions.map((t, n) => ({
            ...t,
            due_date: firstDue ? addMonths(firstDue, n) : t.due_date,
            status: paid && n === 0 ? "pago" : "pendente",
            paid_date: paid && n === 0 ? paid : null,
            notes: JSON.stringify({
              source: "essencial-monthly-v1",
              source_key: key,
              observation: clean(r[10]),
            }),
          }));
        } else {
          const competence = sheetDate(r[1], true),
            due = sheetDate(r[2]),
            paid = clean(r[3]) ? sheetDate(r[3]) : null;
          if (paid && paid > today)
            throw new Error("Pagamento não pode ter data futura. Deixe em branco para pendente.");
          const person = text(r[4], "Favorecido", 120);
          description = text(r[5], "Descrição");
          const amount = money(r[6]),
            method = methodOf(r[7]),
            nature = norm(r[8]);
          if (!["fixa", "variavel"].includes(nature)) throw new Error("Escolha Fixa ou Variável.");
          const group = norm(r[9]) || "geral";
          if (!["geral", "funcionario", "dentista", "avaliador"].includes(group))
            throw new Error("Grupo inválido.");
          const dre = clean(r[10]),
            line = CLINIC_DRE_LINES.find(([, label]) => label === dre)?.[0];
          if (dre && !line)
            throw new Error("Linha do DRE inválida. Use a lista ou deixe em branco.");
          const notes: Record<string, unknown> = {
            source: "essencial-monthly-v1",
            source_key: key,
            observation: clean(r[11]),
            ...(line ? { clinic_dre_line: line } : {}),
          };
          let name = person;
          if (group !== "geral") {
            name = ["lidi", "lidiane", "lidiana"].includes(norm(person)) ? "Lidi" : person;
            const mixedSalary = /salario|folha/.test(norm(description));
            const bonus = !mixedSalary && /^bonifica/.test(norm(description)),
              commission = !mixedSalary && /^comiss|^comisao/.test(norm(description)),
              termination = !mixedSalary && /^acerto|^rescis/.test(norm(description)),
              vacation = !mixedSalary && /^ferias/.test(norm(description));
            Object.assign(notes, {
              source: "essencial-payroll-v1",
              group: group === "funcionario" ? "funcionario" : "dentista",
              name,
              role: group === "avaliador" ? "Avaliador" : "",
              base: bonus || commission || termination || vacation ? 0 : amount,
              bonus: bonus ? amount : 0,
              commission: !bonus && commission ? amount : 0,
              additional: 0,
              discount: 0,
              termination: termination ? amount : 0,
              vacation: vacation ? amount : 0,
            });
          }
          transactions = [
            {
              kind: "saida",
              description:
                group === "geral"
                  ? description
                  : (group === "funcionario" ? "Funcionário: " : "Dentista: ") +
                    name +
                    " — " +
                    description,
              person: name,
              category_id: null,
              nature: nature as "fixa" | "variavel",
              payment_method: method,
              status: paid ? "pago" : "pendente",
              competence_date: competence,
              due_date: due,
              paid_date: paid,
              gross_amount: amount,
              net_amount: amount,
              fee_amount: 0,
              installment_number: 1,
              installment_total: 1,
              group_id: null,
              notes: JSON.stringify(notes),
            },
          ];
        }
        entries.push({
          operation,
          source_key: key,
          label: description,
          sheet: name,
          row: i + 1,
          transactions,
        });
      } catch (e) {
        errors.push(
          name +
            " · linha " +
            (i + 1) +
            ": " +
            (e instanceof Error ? e.message : "Dados inválidos."),
        );
      }
    }
  }
  if (entries.reduce((n, r) => n + r.transactions.length, 0) > 10000)
    errors.push("O arquivo gera mais de 10.000 parcelas. Divida a importação.");
  return { entries, errors, month: fileMonth };
}
