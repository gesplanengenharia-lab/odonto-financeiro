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
  Plus,
  X,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { canUse, firstAllowedPath } from "@/lib/access";
import { myAccessQuery } from "@/lib/queries";
import { Button } from "@/components/ui/button";
import { LaunchDialog } from "@/components/finance/LaunchDialog";
import clinicLogo from "@/assets/essencial-logo.png";
import { cn } from "@/lib/utils";

const NAV_GROUPS = [
  {
    label: "Principal",
    items: [
      { to: "/painel", label: "Visão dos sócios", icon: LayoutDashboard },
      { to: "/lancamentos", label: "Entradas e saídas", icon: ArrowLeftRight },
      { to: "/contas", label: "Pagar e receber", icon: CalendarClock },
      { to: "/colaboradores", label: "Equipe", icon: Users },
      { to: "/relatorios", label: "Relatórios", icon: BarChart3 },
    ],
  },
  {
    label: "Mais ferramentas",
    items: [
      { to: "/cartoes", label: "Cartões", icon: CreditCard },
      { to: "/boletos", label: "Boletos", icon: Receipt },
      { to: "/inadimplentes", label: "Pacientes em atraso", icon: AlertTriangle },
      { to: "/tesouraria", label: "Contas bancárias", icon: Landmark },
      { to: "/provisao", label: "Previsão de caixa", icon: TrendingUp },
      { to: "/simulacao", label: "Simular pagamentos", icon: Calculator },
      { to: "/assistente", label: "Assistente", icon: MessageCircle },
      { to: "/configuracoes", label: "Configurações", icon: Settings },
      { to: "/analytics", label: "Uso do sistema", icon: Activity },
    ],
  },
] as const;

export function AppShell() {
  const {
    data: access,
    isLoading,
    isError,
    refetch,
  } = useQuery({ ...myAccessQuery(), refetchInterval: 30_000 });
  const location = useLocation();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const userId = access?.user?.id;

  // Patient receivables settle automatically on their due date (also scheduled daily on the server).
  useEffect(() => {
    if (!userId) return;
    void supabase.rpc("auto_settle_due_entries").then(({ data }) => {
      if (data && data > 0)
        void Promise.all([
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
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
        Carregando…
      </div>
    );
  }

  if (isError || !access)
    return (
      <div className="p-8">
        <p role="alert">Não foi possível verificar suas permissões.</p>
        <Button variant="outline" onClick={() => void refetch()}>
          Tentar novamente
        </Button>
      </div>
    );

  if (access && access.roles.length === 0) {
    return (
      <div className="flex min-h-screen items-center justify-center px-6">
        <div className="surface-card max-w-md p-8 text-center">
          <h1 className="text-xl font-semibold">Aguardando aprovação</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Sua conta ({access.user?.email}) foi criada. Peça ao administrador da clínica para
            liberar seu acesso em Configurações → Equipe.
          </p>
          <div className="mt-6 flex justify-center gap-2">
            <Button
              variant="outline"
              onClick={() => qc.invalidateQueries({ queryKey: ["my_access"] })}
            >
              Verificar novamente
            </Button>
            <Button variant="ghost" onClick={signOut}>
              Sair
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const initials = (access.name || "?")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
  const sidebar = (
    <nav
      aria-label="Menu principal"
      className="flex h-full flex-col bg-sidebar text-sidebar-foreground"
    >
      <div className="px-6 pb-5 pt-7">
        <Link
          to="/painel"
          onClick={() => setOpen(false)}
          aria-label="Essencial Odontologia — ir para o painel"
        >
          <img
            src={clinicLogo}
            alt="Essencial Odontologia"
            className="h-auto w-[150px] rounded-lg bg-brand px-3 py-2"
          />
        </Link>
        <p className="mt-3 text-[11px] font-semibold uppercase tracking-[0.2em] text-sidebar-primary">
          Gestão financeira
        </p>
      </div>
      <div className="px-4 pb-4">
        <LaunchDialog
          trigger={
            <Button className="w-full justify-center gap-2 bg-sidebar-primary text-sidebar-primary-foreground hover:bg-sidebar-primary/90">
              <Plus className="h-4 w-4" /> Novo lançamento
            </Button>
          }
        />
      </div>
      <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-3 pb-4">
        {NAV_GROUPS.map((group) => {
          const items = group.items.filter((item) => canUse(access, item.to.slice(1)));
          if (!items.length) return null;
          return (
            <details
              key={group.label}
              open={
                group.label === "Principal" || items.some((item) => item.to === location.pathname)
              }
              className="group"
              aria-label={group.label}
            >
              <summary
                className={
                  group.label === "Principal"
                    ? "hidden"
                    : "mb-3 cursor-pointer px-3 py-2 text-xs text-sidebar-foreground/65"
                }
              >
                {group.label}
              </summary>
              <h2 className="mb-1.5 px-3 font-sans text-[10.5px] font-semibold uppercase tracking-[0.18em] text-sidebar-foreground/55">
                {group.label === "Principal" ? "Financeiro" : "Ferramentas"}
              </h2>
              <ul className="space-y-0.5">
                {items.map((item) => (
                  <li key={item.to}>
                    <Link
                      to={item.to}
                      onClick={() => setOpen(false)}
                      className="group relative flex items-center gap-3 rounded-lg px-3 py-2 text-[13.5px] font-medium text-sidebar-foreground transition-colors hover:bg-sidebar-accent/70 hover:text-sidebar-accent-foreground"
                      activeProps={{
                        className: "bg-sidebar-accent text-sidebar-accent-foreground",
                      }}
                    >
                      {({ isActive }: { isActive: boolean }) => (
                        <>
                          <span
                            aria-hidden="true"
                            className={cn(
                              "absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-sidebar-primary transition-opacity",
                              isActive ? "opacity-100" : "opacity-0",
                            )}
                          />
                          <item.icon
                            className={cn(
                              "h-4 w-4 shrink-0",
                              isActive ? "text-sidebar-primary" : "text-sidebar-foreground/70",
                            )}
                          />
                          {item.label}
                        </>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            </details>
          );
        })}
      </div>
      <div className="flex items-center gap-3 border-t border-sidebar-border px-5 py-4">
        <span
          aria-hidden="true"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-sidebar-accent text-xs font-bold text-sidebar-accent-foreground"
        >
          {initials}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-sidebar-accent-foreground">
            {access.name}
          </p>
          <p className="text-xs text-sidebar-foreground/70">
            {access.roles.includes("admin") ? "Administrador" : "Equipe financeira"}
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={signOut}
          aria-label="Sair"
          className="text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        >
          <LogOut className="h-4 w-4" />
        </Button>
      </div>
    </nav>
  );

  return (
    <div className="min-h-screen bg-background lg:grid lg:grid-cols-[232px_1fr]">
      <a
        href="#main-content"
        className="sr-only z-[60] rounded-lg bg-card p-3 text-primary focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
      >
        Ir para o conteúdo
      </a>
      <aside className="sticky top-0 hidden h-screen border-r border-border lg:block">
        {sidebar}
      </aside>

      <div className="sticky top-0 z-40 flex items-center justify-between bg-sidebar px-4 py-2.5 lg:hidden">
        <Link to="/painel" aria-label="Essencial Odontologia — ir para o painel">
          <img
            src={clinicLogo}
            alt="Essencial Odontologia"
            className="h-10 w-auto rounded bg-brand px-2 py-1"
          />
        </Link>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Abrir menu"
          aria-expanded={open}
          onClick={() => setOpen(true)}
          className="text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        >
          <Menu />
        </Button>
      </div>
      <div className={cn("fixed inset-0 z-50 lg:hidden", open ? "block" : "hidden")}>
        <div className="absolute inset-0 bg-foreground/40" onClick={() => setOpen(false)} />
        <div className="relative h-full w-[min(18rem,85vw)] shadow-2xl">
          <button
            aria-label="Fechar menu"
            className="absolute right-3 top-4 z-10 text-sidebar-foreground"
            onClick={() => setOpen(false)}
          >
            <X className="h-5 w-5" />
          </button>
          {sidebar}
        </div>
      </div>

      <main
        id="main-content"
        className="mx-auto w-full min-w-0 max-w-[1440px] px-4 py-6 sm:px-8 sm:py-8 lg:px-10"
      >
        {canUse(access, location.pathname.split("/").filter(Boolean)[0] ?? "painel") ? (
          <Outlet />
        ) : (
          <div className="surface-card p-6">
            <h1 className="text-xl font-semibold">Acesso restrito</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {!access.permissionsReady
                ? "As permissões individuais ainda precisam ser ativadas pelo administrador."
                : "Peça ao administrador para liberar os módulos necessários ao seu trabalho."}
            </p>
            {firstAllowedPath(access) && (
              <Button className="mt-4" onClick={() => navigate({ to: firstAllowedPath(access)! })}>
                Abrir módulo autorizado
              </Button>
            )}
            <Button className="ml-2 mt-4" variant="outline" onClick={() => void refetch()}>
              Verificar acesso
            </Button>
          </div>
        )}
      </main>
    </div>
  );
}
