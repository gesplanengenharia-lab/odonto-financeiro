import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { pageHead } from "@/lib/head";
import { cardSettingsQuery, categoriesQuery, myAccessQuery } from "@/lib/queries";
import type { CardSettings, Kind, Nature } from "@/lib/finance";
import { PageHeader } from "@/components/finance/ui";
import { NativeSelect } from "@/components/finance/LaunchDialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/_authenticated/configuracoes")({
  head: () => pageHead("Configurações", "Taxas da maquininha, categorias e equipe."),
  component: Configuracoes,
});

function Configuracoes() {
  return (
    <div>
      <PageHeader title="Configurações" subtitle="Taxas da maquininha, categorias e acesso da equipe" />
      <Tabs defaultValue="taxas">
        <TabsList>
          <TabsTrigger value="taxas">Taxas do cartão</TabsTrigger>
          <TabsTrigger value="categorias">Categorias</TabsTrigger>
          <TabsTrigger value="equipe">Equipe</TabsTrigger>
        </TabsList>
        <TabsContent value="taxas" className="mt-4">
          <CardRates />
        </TabsContent>
        <TabsContent value="categorias" className="mt-4">
          <Categories />
        </TabsContent>
        <TabsContent value="equipe" className="mt-4">
          <Team />
        </TabsContent>
      </Tabs>
    </div>
  );
}

const rateFields: { key: keyof CardSettings; label: string; suffix: string }[] = [
  { key: "debit_fee", label: "Débito — taxa", suffix: "%" },
  { key: "debit_days", label: "Débito — dias para cair", suffix: "dias" },
  { key: "credit_fee_1x", label: "Crédito à vista — taxa", suffix: "%" },
  { key: "credit_fee_2_6", label: "Crédito 2 a 6x — taxa", suffix: "%" },
  { key: "credit_fee_7_12", label: "Crédito 7 a 12x — taxa", suffix: "%" },
  { key: "credit_days", label: "Crédito — dias entre parcelas", suffix: "dias" },
];

function CardRates() {
  const qc = useQueryClient();
  const { data } = useQuery(cardSettingsQuery());
  const [form, setForm] = useState<Record<string, string>>({});
  useEffect(() => {
    if (data) setForm(Object.fromEntries(Object.entries(data).map(([k, v]) => [k, String(v).replace(".", ",")])));
  }, [data]);

  async function save(e: FormEvent) {
    e.preventDefault();
    const payload = Object.fromEntries(Object.entries(form).map(([k, v]) => [k, Number(v.replace(",", "."))]));
    const { error } = await supabase.from("card_settings").update({ ...payload, updated_at: new Date().toISOString() }).eq("id", 1);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["card_settings"] });
    toast.success("Taxas salvas");
  }

  return (
    <form onSubmit={save} className="surface-card max-w-2xl p-6">
      <p className="text-sm text-muted-foreground">
        Usadas para calcular a taxa descontada e a data de cada parcela nos novos lançamentos de cartão. Lançamentos antigos não mudam.
      </p>
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        {rateFields.map((f) => (
          <div key={f.key} className="grid gap-1.5">
            <Label htmlFor={f.key}>{f.label}</Label>
            <div className="flex items-center gap-2">
              <Input id={f.key} inputMode="decimal" value={form[f.key] ?? ""} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} />
              <span className="w-10 text-sm text-muted-foreground">{f.suffix}</span>
            </div>
          </div>
        ))}
      </div>
      <Button type="submit" className="mt-6">Salvar taxas</Button>
    </form>
  );
}

function Categories() {
  const qc = useQueryClient();
  const { data = [] } = useQuery(categoriesQuery());
  const [name, setName] = useState("");
  const [kind, setKind] = useState<Kind>("saida");
  const [nature, setNature] = useState<Nature>("variavel");

  async function add(e: FormEvent) {
    e.preventDefault();
    const { error } = await supabase.from("categories").insert({ name, kind, nature: kind === "saida" ? nature : null });
    if (error) return toast.error(error.message);
    setName("");
    qc.invalidateQueries({ queryKey: ["categories"] });
    toast.success("Categoria criada");
  }
  async function remove(id: string) {
    if (!confirm("Excluir categoria? Os lançamentos ficam sem categoria.")) return;
    const { error } = await supabase.from("categories").delete().eq("id", id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["categories"] });
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_1fr_1fr]">
      <form onSubmit={add} className="surface-card grid content-start gap-3 p-6">
        <h2 className="text-base font-semibold">Nova categoria</h2>
        <Input required placeholder="Nome" value={name} onChange={(e) => setName(e.target.value)} />
        <NativeSelect value={kind} onChange={(e) => setKind(e.target.value as Kind)}>
          <option value="entrada">Receita</option>
          <option value="saida">Despesa</option>
        </NativeSelect>
        {kind === "saida" && (
          <NativeSelect value={nature} onChange={(e) => setNature(e.target.value as Nature)}>
            <option value="fixa">Despesa fixa</option>
            <option value="variavel">Despesa variável</option>
          </NativeSelect>
        )}
        <Button type="submit">Adicionar</Button>
      </form>
      {(["entrada", "saida"] as const).map((k) => (
        <div key={k} className="surface-card p-6">
          <h2 className="text-base font-semibold">{k === "entrada" ? "Receitas" : "Despesas"}</h2>
          <ul className="mt-3 divide-y divide-border text-sm">
            {data
              .filter((c) => c.kind === k)
              .map((c) => (
                <li key={c.id} className="flex items-center justify-between py-1.5">
                  <span>
                    {c.name}
                    {c.nature && <span className="ml-2 text-xs text-muted-foreground">{c.nature === "fixa" ? "fixa" : "variável"}</span>}
                  </span>
                  <Button variant="ghost" size="icon" aria-label="Excluir categoria" onClick={() => remove(c.id)}>
                    <Trash2 className="text-muted-foreground" />
                  </Button>
                </li>
              ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function Team() {
  const { data: me } = useQuery(myAccessQuery());
  const isAdmin = me?.roles.includes("admin");
  const qc = useQueryClient();
  const { data, refetch } = useQuery({
    queryKey: ["team"],
    queryFn: async () => {
      const [{ data: profiles, error }, { data: roles }] = await Promise.all([
        supabase.from("profiles").select("id,full_name,email,created_at").order("created_at"),
        supabase.from("user_roles").select("user_id,role"),
      ]);
      if (error) throw error;
      return (profiles ?? []).map((p) => ({ ...p, roles: (roles ?? []).filter((r) => r.user_id === p.id).map((r) => r.role as string) }));
    },
  });

  async function grant(userId: string, role: "membro" | "admin") {
    const { error } = await supabase.from("user_roles").insert({ user_id: userId, role });
    if (error) return toast.error(error.message);
    toast.success(role === "admin" ? "Agora é administrador" : "Acesso liberado");
    refetch();
    qc.invalidateQueries({ queryKey: ["my_access"] });
  }
  async function revoke(userId: string) {
    if (!confirm("Remover o acesso desta pessoa?")) return;
    const { error } = await supabase.from("user_roles").delete().eq("user_id", userId);
    if (error) return toast.error(error.message);
    toast.success("Acesso removido");
    refetch();
  }

  return (
    <div className="surface-card max-w-3xl p-6">
      <p className="text-sm text-muted-foreground">
        Novos usuários criam a conta na tela de entrada e aparecem aqui como “Aguardando”. {isAdmin ? "Libere o acesso de quem faz parte da equipe." : "Só administradores podem liberar acessos."}
      </p>
      <ul className="mt-4 divide-y divide-border">
        {(data ?? []).map((p) => {
          const status = p.roles.includes("admin") ? "Administrador" : p.roles.includes("membro") ? "Membro" : "Aguardando";
          return (
            <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div>
                <p className="text-sm font-semibold">{p.full_name || p.email}</p>
                <p className="text-xs text-muted-foreground">{p.email}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${status === "Aguardando" ? "bg-warning-soft text-warning" : "bg-secondary text-secondary-foreground"}`}>
                  {status}
                </span>
                {isAdmin && p.id !== me?.user?.id && (
                  <>
                    {p.roles.length === 0 && <Button size="sm" onClick={() => grant(p.id, "membro")}>Liberar acesso</Button>}
                    {p.roles.includes("membro") && !p.roles.includes("admin") && (
                      <Button size="sm" variant="outline" onClick={() => grant(p.id, "admin")}>Tornar admin</Button>
                    )}
                    {p.roles.length > 0 && (
                      <Button size="sm" variant="ghost" onClick={() => revoke(p.id)}>Remover</Button>
                    )}
                  </>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
