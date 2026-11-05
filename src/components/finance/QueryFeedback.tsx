import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";

export function QueryFeedback({ loading, error, retry, children }: {
  loading: boolean; error: boolean; retry: () => void; children: ReactNode;
}) {
  if (loading) return <div className="surface-card p-8 text-sm text-muted-foreground" role="status">Carregando informações financeiras…</div>;
  if (error) return <div className="surface-card p-6"><p role="alert">Não foi possível carregar os dados. Os valores não estão disponíveis para conferência.</p><Button className="mt-3" variant="outline" onClick={retry}>Tentar novamente</Button></div>;
  return <>{children}</>;
}
