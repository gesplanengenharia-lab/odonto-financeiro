import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { OPERATIONAL_MODULES } from "@/lib/access";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
export function MemberPermissions({ userId, modules }: { userId: string; modules: string[] }) {
  const [draft, setDraft] = useState(modules);
  const [saving, setSaving] = useState(false);
  const qc = useQueryClient();
  const signature = modules.join(",");
  useEffect(() => {
    setDraft(signature ? signature.split(",") : []);
  }, [signature]);
  async function save() {
    setSaving(true);
    try {
      const { data, error } = await supabase
        .from("user_roles")
        .update({ allowed_modules: draft })
        .eq("user_id", userId)
        .eq("role", "membro")
        .select("id");
      if (error) throw error;
      if (!data?.length)
        throw new Error(
          "A permissão não foi salva. Atualize a equipe e confira seu acesso de administrador.",
        );
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["team"] }),
        qc.invalidateQueries({ queryKey: ["my_access"] }),
      ]);
      toast.success("Permissões salvas");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Não foi possível salvar as permissões.",
      );
    } finally {
      setSaving(false);
    }
  }
  return (
    <div className="w-full rounded-lg border border-border p-3">
      <p className="mb-3 text-xs font-semibold">Funções liberadas para esta pessoa</p>
      <div className="grid gap-2 sm:grid-cols-2">
        {OPERATIONAL_MODULES.map((m) => (
          <label key={m.key} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              disabled={saving}
              checked={draft.includes(m.key)}
              onChange={(e) =>
                setDraft((previous) =>
                  e.target.checked ? [...previous, m.key] : previous.filter((key) => key !== m.key),
                )
              }
            />
            {m.label}
          </label>
        ))}
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        Dashboard, DRE/relatórios, provisões, IA, analytics, configurações e exclusão de lançamentos
        são exclusivos de administradores.
      </p>
      <Button size="sm" className="mt-3" disabled={saving} onClick={save}>
        {saving ? "Salvando…" : "Salvar permissões"}
      </Button>
    </div>
  );
}
