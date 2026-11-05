import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import type { Nature, Txn } from "@/lib/finance";
import { readPayroll } from "@/lib/payroll";
import { categoriesQuery, useTxnMutations } from "@/lib/queries";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "./LaunchDialog";

export function EditTxnDialog({ txn, onClose }: { txn: Txn; onClose: () => void }) {
  const [description, setDescription] = useState(txn.description);
  const [person, setPerson] = useState(txn.person ?? "");
  const [gross, setGross] = useState(txn.gross_amount.toFixed(2).replace(".", ","));
  const [fee, setFee] = useState(txn.fee_amount.toFixed(2).replace(".", ","));
  const [competence, setCompetence] = useState(txn.competence_date);
  const [due, setDue] = useState(txn.due_date);
  const [category, setCategory] = useState(txn.category_id ?? "");
  const [nature, setNature] = useState<Nature | "">(txn.nature ?? "");
  const query = useQuery(categoriesQuery());
  const { edit } = useTxnMutations();
  const parse = (value: string) => value.trim() === "" ? Number.NaN : Number(value.replace(/\./g, "").replace(",", "."));
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (edit.isPending || readPayroll(txn)) return;
    try {
      await edit.mutateAsync({ original: txn, details: { description, person, category_id: category || null,
        nature: nature || null, competence_date: competence, due_date: due, gross_amount: parse(gross), fee_amount: parse(fee) } });
      toast.success("Lançamento atualizado."); onClose();
    } catch (error) { toast.error(error instanceof Error ? error.message : "Não foi possível salvar."); }
  }
  return <Dialog open onOpenChange={(open) => { if (!open && !edit.isPending) onClose(); }}>
    <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
      <DialogHeader><DialogTitle>Editar lançamento</DialogTitle></DialogHeader>
      <p className="text-sm text-muted-foreground">A alteração vale somente para esta parcela. O recebimento e as demais parcelas são preservados.</p>
      <form className="space-y-4" onSubmit={save}>
        <fieldset disabled={edit.isPending} className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1 sm:col-span-2"><Label htmlFor="edit-description">Descrição</Label><Input id="edit-description" value={description} onChange={(e) => setDescription(e.target.value)} required /></div>
          <div className="space-y-1 sm:col-span-2"><Label htmlFor="edit-person">Paciente ou fornecedor</Label><Input id="edit-person" value={person} onChange={(e) => setPerson(e.target.value)} /></div>
          <div className="space-y-1"><Label htmlFor="edit-competence">Competência</Label><Input id="edit-competence" type="date" value={competence} onChange={(e) => setCompetence(e.target.value)} required /></div>
          <div className="space-y-1"><Label htmlFor="edit-due">Vencimento</Label><Input id="edit-due" type="date" value={due} onChange={(e) => setDue(e.target.value)} required /></div>
          <div className="space-y-1"><Label htmlFor="edit-gross">Valor bruto (R$)</Label><Input id="edit-gross" inputMode="decimal" value={gross} onChange={(e) => setGross(e.target.value)} required /></div>
          {txn.kind === "entrada" && <div className="space-y-1"><Label htmlFor="edit-fee">Taxa desta parcela (R$)</Label><Input id="edit-fee" inputMode="decimal" value={fee} onChange={(e) => setFee(e.target.value)} required /></div>}
          <div className="space-y-1"><Label htmlFor="edit-category">Categoria</Label><NativeSelect id="edit-category" value={category} onChange={(e) => setCategory(e.target.value)} disabled={query.isPending || query.isError}><option value="">Sem categoria</option>{(query.data ?? []).filter((c) => c.kind === txn.kind).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</NativeSelect></div>
          {txn.kind === "saida" && <div className="space-y-1"><Label htmlFor="edit-nature">Natureza</Label><NativeSelect id="edit-nature" value={nature} onChange={(e) => setNature(e.target.value as Nature | "")}><option value="">Sem natureza</option><option value="fixa">Fixa</option><option value="variavel">Variável</option></NativeSelect></div>}
        </fieldset>
        {query.isError && <p role="alert" className="text-sm text-expense">Não foi possível carregar as categorias. Feche e tente novamente.</p>}
        <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={onClose} disabled={edit.isPending}>Cancelar</Button><Button type="submit" disabled={edit.isPending || query.isPending || query.isError}>{edit.isPending ? "Salvando…" : "Salvar alterações"}</Button></div>
      </form>
    </DialogContent>
  </Dialog>;
}
