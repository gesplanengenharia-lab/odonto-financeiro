import { Link, Outlet, useNavigate, useLocation } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
  LayoutDashboard,
  Calculator,
  Users,
  MessageCircle,
  Activity,
  ArrowLeftRight,
  CalendarClock,
  Landmark,
  CreditCard,
  Receipt,
  TrendingUp,
  AlertTriangle,
  BarChart3,
  Settings,
  LogOut,
  Menu,
  X,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { canUse, firstAllowedPath } from "@/lib/access";
import { myAccessQuery } from "@/lib/queries";
import { Button } from "@/components/ui/button";
import clinicLogo from "@/assets/essencial-logo.png";
import { cn } from "@/lib/utils";

const nav = [
  { group: "Visão geral", to: "/painel", label: "Painel", icon: LayoutDashboard },
  { group: "Equipe", to: "/colaboradores", label: "Colaboradores", icon: Users },
  { group: "Gestão", to: "/simulacao", label: "Simulação", icon: Calculator },
  { group: "Financeiro", to: "/lancamentos", label: "Lançamentos", icon: ArrowLeftRight },
  { group: "Financeiro", to: "/contas", label: "Contas a pagar e receber", icon: CalendarClock },
  { group: "Financeiro", to: "/tesouraria", label: "Tesouraria", icon: Landmark },
  { group: "Financeiro", to: "/cartoes", label: "Cartões", icon: CreditCard },
  { group: "Financeiro", to: "/boletos", label: "Boletos", icon: Receipt },
  { group: "Gestão", to: "/provisao", label: "Provisão", icon: TrendingUp },
  { group: "Financeiro", to: "/inadimplentes", label: "Inadimplentes", icon: AlertTriangle },
  { group: "Gestão", to: "/relatorios", label: "Relatórios", icon: BarChart3 },
  { group: "Gestão", to: "/assistente", label: "Assistente financeiro", icon: MessageCircle },
  { group: "Administração", to: "/analytics", label: "Analytics de uso", icon: Activity },
  { group: "Administração", to: "/configuracoes", label: "Configurações", icon: Settings },
] as const;

export function AppShell() {
  const { data: access, isLoading, isError, refetch } = useQuery({ ...myAccessQuery(), refetchInterval: 30_000 });
  const location = useLocation();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const userId = access?.user?.id;

  // Patient receivables settle automatically on their due date (also scheduled daily on the server).
  useEffect(() => {
    if (!userId) return;
    void supabase.rpc("auto_settle_due_entries").then(({ data }) => {
      if (data && data > 0) void Promise.all([
        qc.invalidateQueries({ queryKey: ["txns"] }),
        qc.invalidateQueries({ queryKey: ["treasury"] }),
      ]);
    });
  }, [userId, qc]);

  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  if (isLoading) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">Carregando…</div>;
  }

  if (isError || !access) return <div className="p-8"><p role="alert">Não foi possível verificar suas permissões.</p><Button variant="outline" onClick={() => void refetch()}>Tentar novamente</Button></div>;

  if (access && access.roles.length === 0) {
    return (
      <div className="flex min-h-screen items-center justify-center px-6">
        <div className="surface-card max-w-md p-8 text-center">
          <h1 className="text-xl font-semibold">Aguardando aprovação</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Sua conta ({access.user?.email}) foi criada. Peça ao administrador da clínica para liberar seu acesso em
            Configurações → Equipe.
          </p>
          <div className="mt-6 flex justify-center gap-2">
            <Button variant="outline" onClick={() => qc.invalidateQueries({ queryKey: ["my_access"] })}>Verificar novamente</Button>
            <Button variant="ghost" onClick={signOut}>Sair</Button>
          </div>
        </div>
      </div>
    );
  }

  const sidebar = (
    <nav className="flex h-full flex-col bg-sidebar px-3 py-5 text-sidebar-foreground">
      <div className="mb-6 flex items-center gap-2 px-3 font-display text-base font-semibold text-sidebar-accent-foreground">
        <img src={clinicLogo} alt="Essencial Odontologia" className="w-full max-w-[210px] rounded-lg bg-[#976f67] p-3" />
      </div>
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-1">
        {["Visão geral", "Financeiro", "Equipe", "Gestão", "Administração"].map((group) => {
          const items = nav.filter((item) => item.group === group && canUse(access, item.to.slice(1)));
          if (!items.length) return null;
          return <section key={group} aria-label={group}>
            <h2 className="mb-2 px-3 font-sans text-[11px] font-semibold uppercase tracking-[0.16em] text-sidebar-foreground/65">{group}</h2>
            <ul className="space-y-1">{items.map((item) => <li key={item.to}>
              <Link to={item.to} onClick={() => setOpen(false)}
                className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                activeProps={{ className: "bg-sidebar-accent text-sidebar-accent-foreground shadow-sm" }}>
                <item.icon className="h-4 w-4 shrink-0" />{item.label}
              </Link>
            </li>)}</ul>
          </section>;
        })}
      </div>
      <div className="mt-4 border-t border-sidebar-border px-3 pt-4">
        <p className="truncate text-sm font-semibold text-sidebar-accent-foreground">{access?.name}</p>
        <p className="text-xs capitalize text-sidebar-foreground/70">{access?.roles.includes("admin") ? "Administrador" : "Membro"}</p>
        <button onClick={signOut} className="mt-3 flex items-center gap-2 text-sm text-sidebar-foreground/80 hover:text-sidebar-accent-foreground">
          <LogOut className="h-4 w-4" /> Sair
        </button>
      </div>
    </nav>
  );

  return (
    <div className="min-h-screen bg-background lg:grid lg:grid-cols-[260px_1fr]">
      <a href="#main-content" className="sr-only z-[60] rounded-lg bg-card p-3 text-primary focus:not-sr-only focus:fixed focus:left-4 focus:top-4">Ir para o conteúdo</a>
      <aside className="sticky top-0 hidden h-screen lg:block">{sidebar}</aside>

      <div className="flex items-center justify-between border-b border-border bg-card px-4 py-3 lg:hidden">
        <img src={clinicLogo} alt="Essencial Odontologia" className="h-14 w-auto rounded-md bg-[#976f67] p-2" />
        <Button variant="ghost" size="icon" aria-label="Abrir menu" onClick={() => setOpen(true)}>
          <Menu />
        </Button>
      </div>
      <div className={cn("fixed inset-0 z-50 lg:hidden", open ? "block" : "hidden")}>
        <div className="absolute inset-0 bg-foreground/40" onClick={() => setOpen(false)} />
        <div className="relative h-full w-72">
          <button aria-label="Fechar menu" className="absolute right-3 top-4 z-10 text-sidebar-foreground" onClick={() => setOpen(false)}>
            <X className="h-5 w-5" />
          </button>
          {sidebar}
        </div>
      </div>

      <main id="main-content" className="mx-auto w-full min-w-0 max-w-[1680px] px-4 py-6 sm:px-8 sm:py-8 lg:px-10">
        {canUse(access, location.pathname.split("/").filter(Boolean)[0] ?? "painel") ? <Outlet /> : <div className="surface-card p-6"><h1 className="text-xl font-semibold">Acesso restrito</h1><p className="mt-2 text-sm text-muted-foreground">{!access.permissionsReady ? "As permissões individuais ainda precisam ser ativadas pelo administrador." : "Peça ao administrador para liberar os módulos necessários ao seu trabalho."}</p>{firstAllowedPath(access) && <Button className="mt-4" onClick={() => navigate({ to: firstAllowedPath(access)! })}>Abrir módulo autorizado</Button>}<Button className="ml-2 mt-4" variant="outline" onClick={() => void refetch()}>Verificar acesso</Button></div>}
      </main>
    </div>
  );
}


