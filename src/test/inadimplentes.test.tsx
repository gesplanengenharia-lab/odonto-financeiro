import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { Route } from "@/routes/_authenticated/inadimplentes";
import { TxnTable } from "@/components/finance/TxnTable";
import type { Txn } from "@/lib/finance";
import { toast } from "sonner";
const state=vi.hoisted(()=>({rows:[] as Txn[],mutate:vi.fn().mockResolvedValue(undefined),isError:false}));
vi.mock("@tanstack/react-router",()=>({createFileRoute:()=> (options:object)=>({options})}));
vi.mock("@/lib/queries",()=>({pendingQuery:()=>({queryKey:["pending"]}),myAccessQuery:()=>({queryKey:["access"]}),
  categoriesQuery:()=>({queryKey:["categories"]}),useTxnMutations:()=>({setPaid:{mutateAsync:state.mutate,isPending:false},remove:{mutateAsync:vi.fn()}})}));
vi.mock("@tanstack/react-query",()=>({useQuery:(q:{queryKey:string[]})=>q.queryKey[0]==="access"
  ?{data:{roles:["admin"],modules:[],permissionsReady:true}}:q.queryKey[0]==="categories"?{data:[]}:{data:state.rows,isLoading:false,isError:state.isError}}));
vi.mock("sonner",()=>({toast:{success:vi.fn(),error:vi.fn()}}));
const Page=Route.options.component as ()=>ReactNode;
const row=(patch:Partial<Txn>={}):Txn=>({id:"a",kind:"entrada",person:"Paciente outubro",description:"Tratamento",payment_method:"boleto",
 status:"pendente",due_date:"2026-10-15",paid_date:null,competence_date:"2026-08-01",gross_amount:150,net_amount:150,fee_amount:0,
 installment_number:1,installment_total:1,group_id:null,notes:null,category_id:null,nature:null,...patch});
beforeEach(()=>{vi.useFakeTimers({toFake:["Date"]});vi.setSystemTime(new Date("2026-11-05T12:00:00Z"));});
afterEach(()=>{cleanup();vi.useRealTimers();vi.clearAllMocks();state.rows=[];state.isError=false;});
it("mostra paciente e valor por mês de vencimento e remove a dívida quando recebida",()=>{
 state.rows=[row(),row({id:"b",person:"Paciente novembro",due_date:"2026-11-01",gross_amount:200})];
 const view=render(<Page />);
 expect(screen.getByText("Inadimplência em nov/26").closest(".surface-card")).toHaveTextContent("200,00");
 expect(screen.getByText("Paciente outubro")).toBeInTheDocument();
 fireEvent.click(screen.getByRole("button",{name:"Somente mês selecionado"}));
 expect(screen.queryByText("Paciente outubro")).not.toBeInTheDocument();
 expect(screen.getByText("Paciente novembro")).toBeInTheDocument();
 state.rows=[state.rows[0]!,{...state.rows[1]!,status:"pago"}];view.rerender(<Page />);
 expect(screen.queryByText("Paciente novembro")).not.toBeInTheDocument();
 expect(screen.getByText("Inadimplência em nov/26").closest(".surface-card")).toHaveTextContent("0,00");
});
it("botão Não recebido desfaz apenas a baixa do boleto e informa a inadimplência",async()=>{
 render(<TxnTable rows={[row({status:"pago",paid_date:"2026-10-15"})]} />);
 fireEvent.click(screen.getByRole("button",{name:"Marcar boleto como não recebido"}));
 await waitFor(()=>expect(state.mutate).toHaveBeenCalledWith({ids:["a"],paid:false}));
 expect(toast.success).toHaveBeenCalledWith("Marcado como inadimplente. Consulte a aba Inadimplentes.");
});
it("não mostra totais zerados como sucesso quando a consulta falha",()=>{
 state.isError=true;render(<Page />);expect(screen.getByRole("alert")).toHaveTextContent("Não foi possível carregar");
 expect(screen.queryByText("Total em atraso — todos os meses")).not.toBeInTheDocument();
});
