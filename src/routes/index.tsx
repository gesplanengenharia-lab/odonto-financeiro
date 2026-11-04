import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { ArrowRight, CreditCard, LineChart, Receipt, Users, Wallet } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Essencial Odontologia — controle de entradas, saídas e cartões" },
      {
        name: "description",
        content: "Sistema financeiro para clínica odontológica: entradas, saídas, cartões parcelados, boletos, Pix, provisão e inadimplência.",
      },
      { property: "og:title", content: "Essencial Odontologia" },
      { property: "og:description", content: "Entradas, saídas, cartões, boletos, provisão e margem de lucro da sua clínica em um só lugar." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

const features = [
  { icon: Receipt, title: "Entradas e saídas", text: "Dinheiro, Pix, cartão, boleto e transferência, com categoria e natureza fixa ou variável." },
  { icon: CreditCard, title: "Cartões parcelados", text: "Taxa da maquininha descontada e data de cada parcela cair na conta." },
  { icon: LineChart, title: "Provisão e margem", text: "Quanto vai entrar e sair nos próximos meses, lucro e margem por mês." },
  { icon: Users, title: "Inadimplentes", text: "Pacientes com boletos e parcelas vencidas, com dias de atraso." },
];

function Index() {
  const navigate = useNavigate();
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/painel", replace: true });
    });
  }, [navigate]);

  return (
    <div className="min-h-screen bg-background">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <div className="flex items-center gap-2 font-display text-lg font-semibold">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground"><Wallet className="h-4 w-4" /></span>
          Essencial Odontologia
        </div>
        <Button asChild variant="outline">
          <Link to="/auth">Entrar</Link>
        </Button>
      </header>

      <main className="mx-auto max-w-6xl px-6 pb-20 pt-10">
        <section className="surface-ink relative overflow-hidden px-8 py-14 sm:px-14 sm:py-20">
          <p className="text-sm font-semibold uppercase tracking-widest text-ink-muted">Clínica odontológica</p>
          <h1 className="mt-4 max-w-3xl text-4xl font-semibold leading-tight sm:text-5xl">
            O caixa da clínica, claro do dia de hoje aos próximos 12 meses.
          </h1>
          <p className="mt-5 max-w-xl text-base text-ink-muted">
            Lance atendimentos e despesas uma vez. O sistema calcula taxas de cartão, parcelas, vencimentos, provisão e margem de lucro.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild size="lg" variant="secondary">
              <Link to="/auth">
                Acessar o sistema <ArrowRight />
              </Link>
            </Button>
          </div>
        </section>

        <section className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {features.map((f) => (
            <div key={f.title} className="surface-card p-6">
              <f.icon className="h-5 w-5 text-primary" />
              <h2 className="mt-4 text-base font-semibold">{f.title}</h2>
              <p className="mt-2 text-sm text-muted-foreground">{f.text}</p>
            </div>
          ))}
        </section>
      </main>
    </div>
  );
}

