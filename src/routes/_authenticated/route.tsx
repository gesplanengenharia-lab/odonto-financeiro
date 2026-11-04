import { createFileRoute, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { myAccessQuery } from "@/lib/queries";
import { canUse, firstAllowedPath } from "@/lib/access";
import { AppShell } from "@/components/finance/AppShell";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ context, location }) => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/auth" });
    const access = await context.queryClient.fetchQuery({ ...myAccessQuery(), staleTime: 0 });
    const module = location.pathname.split("/").filter(Boolean)[0] ?? "painel";
    const destination = firstAllowedPath(access);
    if (!canUse(access, module) && destination) throw redirect({ to: destination, replace: true });
  },
  component: AppShell,
});

