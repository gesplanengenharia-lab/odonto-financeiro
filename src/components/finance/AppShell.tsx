import { Link, Outlet, useNavigate, useLocation } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  LayoutDashboard,
  MessageCircle,
  Activity,
  ArrowLeftRight,
  CalendarClock,
  CreditCard,
  TrendingUp,
  AlertTriangle,
  BarChart3,
  Settings,
  LogOut,
  Menu,
  X,
  Wallet,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { canUse, firstAllowedPath } from "@/lib/access";
import { myAccessQuery } from "@/lib/queries";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const nav = [
  { to: "/painel", label: "Painel", icon: LayoutDashboard },
  { to: "/lancamentos", label: "Lançamentos", icon: ArrowLeftRight },
  { to: "/contas", label: "Contas a pagar e receber", icon: CalendarClock },
  { to: "/cartoes", label: "Cartões", icon: CreditCard },
  { to: "/provisao", label: "Provisão", icon: TrendingUp },
  { to: "/inadimplentes", label: "Inadimplentes", icon: AlertTriangle },
  { to: "/relatorios", label: "Relatórios", icon: BarChart3 },
  { to: "/assistente", label: "Assistente financeiro", icon: MessageCircle },
  { to: "/analytics", label: "Analytics de uso", icon: Activity },
  { to: "/configuracoes", label: "Configurações", icon: Settings },
] as const;

export function AppShell() {
  const { data: access, isLoading, isError, refetch } = useQuery({ ...myAccessQuery(), refetchInterval: 30_000 });
  const location = useLocation();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

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
      <div className="mb-8 flex items-center gap-2 px-3 font-display text-base font-semibold text-sidebar-accent-foreground">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground"><Wallet className="h-4 w-4" /></span>
        Essencial Odontologia
      </div>
      <ul className="flex flex-1 flex-col gap-1">
        {nav.filter((item) => canUse(access, item.to.slice(1))).map((item) => (
          <li key={item.to}>
            <Link
              to={item.to}
              onClick={() => setOpen(false)}
              className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              activeProps={{ className: "bg-sidebar-accent text-sidebar-accent-foreground" }}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
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
      <aside className="sticky top-0 hidden h-screen lg:block">{sidebar}</aside>

      <div className="flex items-center justify-between border-b border-border bg-card px-4 py-3 lg:hidden">
        <span className="font-display font-semibold">Essencial Odontologia</span>
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

      <main className="min-w-0 px-4 py-6 sm:px-8 sm:py-8">
        {canUse(access, location.pathname.split("/").filter(Boolean)[0] ?? "painel") ? <Outlet /> : <div className="surface-card p-6"><h1 className="text-xl font-semibold">Acesso restrito</h1><p className="mt-2 text-sm text-muted-foreground">{!access.permissionsReady ? "As permissões individuais ainda precisam ser ativadas pelo administrador." : "Peça ao administrador para liberar os módulos necessários ao seu trabalho."}</p>{firstAllowedPath(access) && <Button className="mt-4" onClick={() => navigate({ to: firstAllowedPath(access)! })}>Abrir módulo autorizado</Button>}<Button className="ml-2 mt-4" variant="outline" onClick={() => void refetch()}>Verificar acesso</Button></div>}
      </main>
    </div>
  );
}

