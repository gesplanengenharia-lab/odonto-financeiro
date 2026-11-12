import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, Upload } from "lucide-react";
import { toast } from "sonner";
import { cardSettingsQuery, myAccessQuery } from "@/lib/queries";
import { formatBRL, formatDate, todayISO } from "@/lib/finance";
import { parseMonthlySheets, type ImportEntry } from "@/lib/monthly-sheet";
import { importMonthlySheet, type ImportResult } from "@/lib/monthly-sheet-api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
const labels = {
  new: "Novo",
  imported: "Já importado",
  changed: "Alterado desde a importação",
  possible_duplicate: "Possível duplicidade",
  created: "Importado",
  not_found: "Parcela não encontrada — conferir em Contas",
  ambiguous: "Mais de uma parcela — conferir em Contas",
  already_settled: "Parcela já recebida",
};
export function MonthlySheetImport() {
  const settings = useQuery(cardSettingsQuery()),
    access = useQuery(myAccessQuery()),
    qc = useQueryClient();
  const [entries, setEntries] = useState<ImportEntry[]>([]),
    [fileName, setFileName] = useState(""),
    [errors, setErrors] = useState<string[]>([]),
    [parseErrors, setParseErrors] = useState(false),
    [review, setReview] = useState<ImportResult | null>(null),
    [busy, setBusy] = useState(false),
    [selected, setSelected] = useState(new Set<string>()),
    [message, setMessage] = useState("");
  const generation = useRef(0);
  const admin = access.data?.roles.includes("admin") ?? false;
  async function check(rows = entries, name = fileName) {
    const result = await importMonthlySheet(rows, name, true);
    setReview(result);
    setSelected(new Set(result.rows.filter((r) => r.status === "new").map((r) => r.source_key)));
    return result;
  }
  async function read(file: File) {
    const run = ++generation.current;
    setBusy(true);
    setReview(null);
    setEntries([]);
    setErrors([]);
    setParseErrors(false);
    setMessage("");
    setFileName(file.name);
    try {
      if (!settings.data) throw new Error("Aguarde o carregamento das taxas do cartão.");
      if (!/\.xlsx$/i.test(file.name) || file.size > 5 * 1024 * 1024)
        throw new Error("Use um arquivo .xlsx de até 5 MB.");
      const { default: readExcel } = await import("read-excel-file/browser");
      const sheets = await readExcel(file);
      const parsed = await parseMonthlySheets(sheets, settings.data, todayISO());
      if (run !== generation.current) return;
      setEntries(parsed.entries);
      setErrors(parsed.errors);
      setParseErrors(parsed.errors.length > 0);
      if (!parsed.errors.length && parsed.entries.length) await check(parsed.entries, file.name);
      else if (!parsed.entries.length && !parsed.errors.length)
        setErrors(["O arquivo não tem linhas preenchidas."]);
    } catch (e) {
      if (run === generation.current)
        setErrors([e instanceof Error ? e.message : "Não foi possível ler o arquivo."]);
    } finally {
      if (run === generation.current) setBusy(false);
    }
  }
  async function submit() {
    setBusy(true);
    setMessage("");
    try {
      const latest = await qc.fetchQuery({ ...myAccessQuery(), staleTime: 0 });
      if (!latest.roles.includes("admin"))
        throw new Error("Apenas administradores podem confirmar a importação.");
      const rows = entries
        .filter((e) => selected.has(e.source_key))
        .map((e) => ({
          ...e,
          allow_existing:
            review?.rows.find((r) => r.source_key === e.source_key)?.status ===
            "possible_duplicate",
        }));
      if (!rows.length) throw new Error("Selecione os lançamentos que deseja importar.");
      const result = await importMonthlySheet(rows, fileName, false);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["txns"] }),
        qc.invalidateQueries({ queryKey: ["treasury"] }),
      ]);
      const skipped = result.rows.filter((r) => r.status !== "created").length;
      setMessage(
        result.inserted +
          " lançamento(s) / parcela(s) gravados. " +
          (result.settled ?? 0) +
          " parcela(s) existente(s) baixada(s)." +
          (skipped
            ? " " + skipped + " linha(s) não foram inseridas; confira a situação abaixo."
            : ""),
      );
      toast.success("Importação concluída.");
      await check(entries, fileName);
    } catch (e) {
      setReview(null);
      setErrors([
        e instanceof Error
          ? e.message
          : "Não foi possível confirmar. Confira novamente antes de reenviar.",
      ]);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="surface-card my-4 space-y-4 p-5" aria-label="Importação mensal do Excel">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold">Importar planilha mensal</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Preencha Entradas e Saídas durante o mês. Confira abaixo antes de gravar.
          </p>
        </div>
        <Button asChild variant="outline">
          <a href="/modelos/Essencial_Lancamentos_Mensais.xlsx" download>
            <Download className="mr-2 h-4 w-4" />
            Baixar modelo Excel
          </a>
        </Button>
      </div>
      {!admin ? (
        <p className="text-sm text-muted-foreground">
          A confirmação da importação mensal é restrita aos administradores.
        </p>
      ) : (
        <>
          <label className="block text-sm font-medium">
            Planilha do mês
            <Input
              className="mt-2"
              type="file"
              accept=".xlsx"
              disabled={busy || settings.isPending || settings.isError}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void read(f);
              }}
            />
          </label>
          {settings.isError && (
            <p role="alert">
              Não foi possível carregar as taxas.{" "}
              <button className="underline" onClick={() => void settings.refetch()}>
                Tentar novamente
              </button>
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            Use um arquivo por mês. Preserve os códigos das linhas. Datas de recebimento/pagamento
            em branco geram pendências. Parcelas futuras são criadas automaticamente; a data de
            recebimento quita somente a primeira.
          </p>
          {busy && <p role="status">Processando planilha…</p>}
          {!!errors.length && (
            <div role="alert" className="rounded-lg border border-expense/30 p-3 text-sm">
              <strong>Corrija antes de importar:</strong>
              <ul className="mt-2 list-disc pl-5">
                {errors.slice(0, 30).map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
              {errors.length > 30 && <p>Mais {errors.length - 30} erro(s) no arquivo.</p>}
              {entries.length > 0 && !parseErrors && (
                <Button
                  className="mt-3"
                  variant="outline"
                  disabled={busy}
                  onClick={() => {
                    setBusy(true);
                    setErrors([]);
                    void check()
                      .catch(() => setErrors(["Falha ao conferir novamente."]))
                      .finally(() => setBusy(false));
                  }}
                >
                  Conferir novamente
                </Button>
              )}
            </div>
          )}
          {message && (
            <p role="status" className="text-sm font-semibold text-income">
              {message}
            </p>
          )}
          {review && (
            <>
              <div className="flex flex-wrap justify-between gap-3 text-sm">
                <p>
                  {entries.length} linha(s) lidas · {selected.size} selecionada(s)
                </p>
                <strong>
                  Total bruto selecionado:{" "}
                  {formatBRL(
                    entries
                      .filter((e) => selected.has(e.source_key))
                      .reduce(
                        (s, e) => s + e.transactions.reduce((n, t) => n + t.gross_amount, 0),
                        0,
                      ),
                  )}
                </strong>
              </div>
              <div className="max-h-[440px] overflow-auto">
                <table className="w-full min-w-[860px] text-sm">
                  <thead className="bg-muted">
                    <tr>
                      {[
                        "Importar",
                        "Origem",
                        "Descrição",
                        "Operação",
                        "Referência",
                        "Pagamento",
                        "1º vencimento",
                        "Valor bruto",
                        "Parcelas",
                        "Situação",
                      ].map((h) => (
                        <th key={h} className="p-3 text-left">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {entries.map((e) => {
                      const checked = review.rows.find((r) => r.source_key === e.source_key);
                      const status = checked?.status ?? "changed",
                        t = e.transactions[0]!;
                      return (
                        <tr key={e.source_key} className="border-t border-border">
                          <td className="p-3">
                            <input
                              type="checkbox"
                              aria-label={"Importar " + e.sheet + " linha " + e.row}
                              disabled={busy || !["new", "possible_duplicate"].includes(status)}
                              checked={selected.has(e.source_key)}
                              onChange={(event) =>
                                setSelected((old) => {
                                  const next = new Set(old);
                                  if (event.target.checked) next.add(e.source_key);
                                  else next.delete(e.source_key);
                                  return next;
                                })
                              }
                            />
                          </td>
                          <td className="p-3">
                            {e.sheet} · {e.row}
                          </td>
                          <td className="p-3">{e.label}</td>
                          <td className="p-3">
                            {e.operation === "settle" ? "Baixa de parcela" : "Novo lançamento"}
                          </td>
                          <td className="p-3">
                            {formatDate(checked?.reference ?? t.competence_date)}
                          </td>
                          <td className="p-3">
                            {t.paid_date ? formatDate(t.paid_date) : "Pendente"}
                          </td>
                          <td className="p-3">{formatDate(t.due_date)}</td>
                          <td className="p-3 whitespace-nowrap">
                            {formatBRL(e.transactions.reduce((s, t) => s + t.gross_amount, 0))}
                          </td>
                          <td className="p-3">{e.transactions.length}</td>
                          <td className="p-3">{labels[status]}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-muted-foreground">
                Linhas já importadas não são repetidas. Linhas alteradas precisam de ajuste no
                sistema. Marcar “Possível duplicidade” confirma que se trata de outro pagamento,
                mesmo havendo um lançamento semelhante.
              </p>
              <Button disabled={busy || !selected.size} onClick={() => void submit()}>
                <Upload className="mr-2 h-4 w-4" />
                Importar {selected.size} linha(s) selecionada(s)
              </Button>
            </>
          )}
        </>
      )}
    </section>
  );
}
