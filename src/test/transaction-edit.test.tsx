import { renderHook, act, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { useTxnMutations } from "@/lib/queries";
import type { Txn } from "@/lib/finance";
const state=vi.hoisted(()=>({update:vi.fn(),eq:vi.fn(),is:vi.fn(),data:{id:"a"} as {id:string}|null}));
vi.mock("@/integrations/supabase/client",()=>({supabase:{from:()=>{
 const builder={update:(v:unknown)=>{state.update(v);return builder;},eq:(...v:unknown[])=>{state.eq(...v);return builder;},is:(...v:unknown[])=>{state.is(...v);return builder;},select:()=>builder,maybeSingle:async()=>({data:state.data,error:null})};return builder;
}}}));
afterEach(()=>{cleanup();vi.restoreAllMocks();vi.clearAllMocks();state.data={id:"a"};});
const original:Txn={id:"a",kind:"entrada",description:"Venda",person:null,category_id:null,nature:null,payment_method:"boleto",status:"pago",competence_date:"2026-10-01",due_date:"2026-10-01",paid_date:"2026-10-01",gross_amount:100,fee_amount:0,net_amount:100,installment_number:1,installment_total:3,group_id:"group",notes:null};
const details={description:"Venda corrigida",person:"Paciente",category_id:null,nature:null,competence_date:"2026-10-01",due_date:"2026-11-01",gross_amount:200,fee_amount:0};
function setup(admin=true){const client=new QueryClient({defaultOptions:{mutations:{retry:false}}});vi.spyOn(client,"fetchQuery").mockResolvedValue({roles:[admin?"admin":"membro"],modules:["baixar"],permissionsReady:true});const wrapper=({children}:{children:ReactNode})=><QueryClientProvider client={client}>{children}</QueryClientProvider>;return renderHook(()=>useTxnMutations(),{wrapper});}
it("edita somente detalhes e protege contra concorrência sem alterar baixas ou outras parcelas",async()=>{
 const h=setup();await act(async()=>{await h.result.current.edit.mutateAsync({original,details});});
 expect(state.update).toHaveBeenCalledWith({...details,net_amount:200});
 expect(state.eq).toHaveBeenCalledWith("id","a");expect(state.eq).toHaveBeenCalledWith("gross_amount",100);
 expect(state.eq).toHaveBeenCalledWith("status","pago");expect(state.is).toHaveBeenCalledWith("person",null);
});
it("bloqueia edição para membro mesmo quando ele pode desfazer baixas",async()=>{
 const h=setup(false);await act(async()=>{await expect(h.result.current.edit.mutateAsync({original,details})).rejects.toThrow("permissão");});expect(state.update).not.toHaveBeenCalled();
});
it("avisa quando o registro mudou antes da gravação",async()=>{
 state.data=null;const h=setup();await act(async()=>{await expect(h.result.current.edit.mutateAsync({original,details})).rejects.toThrow("alterado por outra pessoa");});
});
