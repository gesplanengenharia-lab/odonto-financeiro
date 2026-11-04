import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { pageHead } from "@/lib/head";
import { addMonths, formatMonth, monthKey, todayISO } from "@/lib/finance";
import { financialQuestionSchema } from "@/lib/financial-assistant-schema";
import { askFinancialAssistant } from "@/lib/financial-assistant.functions";
import { PageHeader } from "@/components/finance/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/_authenticated/assistente")({
  head: () =>
    pageHead("Assistente financeiro", "Pergunte sobre receitas, despesas e provisões da clínica."),
  component: Assistente,
});
function Assistente() {
  const month = monthKey(todayISO());
  const [fromMonth, setFrom] = useState(month);
  const [toMonth, setTo] = useState(monthKey(addMonths(`${month}-01`, 2)));
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [answers, setAnswers] = useState<
    {
      question: string;
      answer: string;
      from: string;
      to: string;
      truncated: boolean;
      generatedAt: string;
    }[]
  >([]);
  const ask = useServerFn(askFinancialAssistant);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    const data = financialQuestionSchema.safeParse({ question, fromMonth, toMonth });
    if (!data.success) {
      setError(
        "Escreva uma pergunta de 3 a 1.500 caracteres e selecione até 12 meses em ordem cronológica.",
      );
      return;
    }
    setBusy(true);
    setError("");
    try {
      const result = await ask({ data: data.data });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setAnswers((previous) =>
        [
          {
            question: data.data.question,
            answer: result.answer,
            from: result.fromMonth,
            to: result.toMonth,
            truncated: result.truncated,
            generatedAt: result.generatedAt,
          },
          ...previous,
        ].slice(0, 10),
      );
      setQuestion("");
    } catch {
      setError("Não foi possível consultar. Verifique sua sessão e tente novamente.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div>
      <PageHeader
        title="Assistente financeiro"
        subtitle="Perguntas em linguagem natural, respondidas com os dados cadastrados da clínica"
      />
      <form onSubmit={submit} className="surface-card space-y-4 p-5 sm:p-6">
        <div className="flex flex-wrap gap-4">
          <div>
            <Label htmlFor="ai-from">Mês inicial</Label>
            <Input
              id="ai-from"
              type="month"
              value={fromMonth}
              disabled={busy}
              onChange={(e) => setFrom(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="ai-to">Mês final</Label>
            <Input
              id="ai-to"
              type="month"
              value={toMonth}
              disabled={busy}
              onChange={(e) => setTo(e.target.value)}
            />
          </div>
        </div>
        <div>
          <Label htmlFor="ai-question">O que você quer saber?</Label>
          <Textarea
            id="ai-question"
            className="mt-2 min-h-28"
            value={question}
            maxLength={1500}
            disabled={busy}
            placeholder="Quanto ainda temos a receber e a pagar no período?"
            onChange={(e) => setQuestion(e.target.value)}
          />
        </div>
        <div className="flex flex-wrap gap-2">
          {[
            "Qual foi o resultado por competência no período?",
            "Quanto entrou por Pix e cartão em cada mês?",
            "Quais despesas mais pesam no período?",
            "O que temos a receber e a pagar nos próximos meses?",
          ].map((q) => (
            <Button
              key={q}
              type="button"
              variant="outline"
              size="sm"
              className="h-auto whitespace-normal text-left"
              disabled={busy}
              onClick={() => setQuestion(q)}
            >
              {q}
            </Button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          Cada pergunta usa o período selecionado e os dados atuais. São enviados ao AI Gateway do
          Lovable apenas resumos financeiros e sua pergunta. Não inclua nomes de pacientes ou dados
          pessoais. O assistente não altera lançamentos; confira os valores antes de decidir.
        </p>
        <Button type="submit" disabled={busy || !question.trim()}>
          {busy ? "Consultando dados e IA…" : "Perguntar ao assistente"}
        </Button>
        {busy && (
          <p role="status" className="text-sm text-muted-foreground">
            Preparando a resposta…
          </p>
        )}
        {error && (
          <p role="alert" className="text-sm text-expense">
            {error}
          </p>
        )}
      </form>
      {answers.length > 0 && (
        <div className="mt-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Respostas desta sessão</h2>
            <Button variant="ghost" disabled={busy} onClick={() => setAnswers([])}>
              Limpar respostas
            </Button>
          </div>
          {answers.map((a, i) => (
            <article key={`${a.generatedAt}-${i}`} className="surface-card p-5">
              <p className="text-xs text-muted-foreground">
                {formatMonth(a.from, true)} a {formatMonth(a.to, true)} ·{" "}
                {new Date(a.generatedAt).toLocaleString("pt-BR")}
              </p>
              <h3 className="mt-2 font-semibold">{a.question}</h3>
              <p className="mt-4 whitespace-pre-wrap break-words text-sm leading-7">{a.answer}</p>
              {a.truncated && (
                <p className="mt-3 text-xs text-warning">
                  A resposta atingiu o limite de tamanho. Faça uma pergunta mais específica.
                </p>
              )}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
