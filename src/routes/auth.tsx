import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import "@lovable.dev/cloud-auth-js/styles.css";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Entrar — Financeiro da Clínica" },
      { name: "description", content: "Acesse o sistema financeiro da clínica com seu e-mail ou conta Google." },
      { property: "og:title", content: "Entrar — Financeiro da Clínica" },
      { property: "og:description", content: "Acesso da equipe ao sistema financeiro da clínica." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});

type Mode = "signin" | "signup" | "forgot";

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/painel", replace: true });
    });
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" && session) navigate({ to: "/painel", replace: true });
    });
    return () => data.subscription.unsubscribe();
  }, [navigate]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin, data: { full_name: name } },
        });
        if (error) throw error;
        if (!data.session) setSent("Enviamos um link de confirmação para o seu e-mail. Confirme para entrar.");
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/reset-password`,
        });
        if (error) throw error;
        setSent("Se o e-mail estiver cadastrado, você receberá um link para criar uma nova senha.");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro ao entrar";
      toast.error(msg === "Invalid login credentials" ? "E-mail ou senha incorretos" : msg);
    } finally {
      setLoading(false);
    }
  }

  async function social(provider: "google" | "lovable") {
    const result = await lovable.auth.signInWithOAuth(provider, { redirect_uri: window.location.origin });
    if (result.error) toast.error("Não foi possível entrar. Tente novamente.");
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="surface-ink hidden rounded-none p-12 lg:flex lg:flex-col lg:justify-between">
        <Link to="/" className="font-display text-lg font-semibold">
          Financeiro da Clínica
        </Link>
        <div>
          <h2 className="max-w-md text-3xl font-semibold leading-tight">Cada parcela, cada boleto, cada taxa no lugar certo.</h2>
          <p className="mt-4 max-w-md text-ink-muted">Acesso exclusivo da equipe da clínica.</p>
        </div>
        <p className="text-xs text-ink-muted">Dados protegidos e visíveis apenas para membros aprovados.</p>
      </div>

      <div className="flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">
          <h1 className="text-2xl font-semibold">
            {mode === "signin" ? "Entrar" : mode === "signup" ? "Criar conta" : "Recuperar senha"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {mode === "signup"
              ? "O primeiro cadastro vira administrador. Os demais precisam ser aprovados."
              : mode === "forgot"
                ? "Informe seu e-mail para receber o link."
                : "Use seu e-mail ou uma das opções abaixo."}
          </p>

          {sent ? (
            <div className="surface-card mt-6 p-5 text-sm">
              {sent}
              <Button variant="link" className="mt-2 px-0" onClick={() => { setSent(null); setMode("signin"); }}>
                Voltar para entrar
              </Button>
            </div>
          ) : (
            <>
              {mode !== "forgot" && (
                <div className="mt-6 grid gap-2">
                  <Button variant="outline" type="button" onClick={() => social("google")}>
                    Continuar com Google
                  </Button>
                  <button type="button" className="lovable-auth-button" onClick={() => social("lovable")}>
                    Continue with Lovable
                  </button>
                  <div className="my-2 flex items-center gap-3 text-xs text-muted-foreground">
                    <span className="h-px flex-1 bg-border" /> ou <span className="h-px flex-1 bg-border" />
                  </div>
                </div>
              )}

              <form onSubmit={onSubmit} className="mt-4 grid gap-4">
                {mode === "signup" && (
                  <div className="grid gap-1.5">
                    <Label htmlFor="name">Nome</Label>
                    <Input id="name" required value={name} onChange={(e) => setName(e.target.value)} />
                  </div>
                )}
                <div className="grid gap-1.5">
                  <Label htmlFor="email">E-mail</Label>
                  <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
                </div>
                {mode !== "forgot" && (
                  <div className="grid gap-1.5">
                    <Label htmlFor="password">Senha</Label>
                    <Input id="password" type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} />
                  </div>
                )}
                <Button type="submit" disabled={loading}>
                  {loading ? "Aguarde..." : mode === "signin" ? "Entrar" : mode === "signup" ? "Criar conta" : "Enviar link"}
                </Button>
              </form>

              <div className="mt-4 flex flex-col gap-1 text-sm">
                {mode === "signin" && (
                  <>
                    <button className="text-left text-primary hover:underline" onClick={() => setMode("signup")}>Não tem conta? Criar conta</button>
                    <button className="text-left text-muted-foreground hover:underline" onClick={() => setMode("forgot")}>Esqueci minha senha</button>
                  </>
                )}
                {mode !== "signin" && (
                  <button className="text-left text-primary hover:underline" onClick={() => setMode("signin")}>Já tenho conta</button>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
