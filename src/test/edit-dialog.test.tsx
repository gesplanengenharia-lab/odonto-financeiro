import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { EditTxnDialog } from "@/components/finance/EditTxnDialog";
import type { Txn } from "@/lib/finance";
const state=vi.hoisted(()=>({edit:vi.fn().mockResolvedValue(undefined)}));
vi.mock("@tanstack/react-query",()=>({useQuery:()=>({data:[],isPending:false,isError:false})}));
vi.mock("@/lib/queries",()=>({categoriesQuery:()=>({}),useTxnMutations:()=>({edit:{mutateAsync:state.edit,isPending:false}})}));
vi.mock("sonner",()=>({toast:{success:vi.fn(),error:vi.fn()}}));
afterEach(()=>{cleanup();vi.clearAllMocks();});
it("formulário de edição usa os valores informados sem redistribuir as parcelas",async()=>{
 const txn:Txn={id:"edit",kind:"entrada",description:"Tratamento",person:"Paciente",category_id:null,nature:null,payment_method:"boleto",status:"pago",competence_date:"2026-10-01",due_date:"2026-11-01",paid_date:"2026-11-01",gross_amount:300,fee_amount:0,net_amount:300,installment_number:2,installment_total:3,group_id:"sale",notes:null};
 const close=vi.fn();render(<EditTxnDialog txn={txn} onClose={close}/>);
 fireEvent.change(screen.getByLabelText("Valor bruto (R$)"),{target:{value:"450,50"}});
 fireEvent.change(screen.getByLabelText("Paciente ou fornecedor"),{target:{value:"Paciente corrigido"}});
 fireEvent.click(screen.getByRole("button",{name:"Salvar alterações"}));
 await waitFor(()=>expect(state.edit).toHaveBeenCalledOnce());
 expect(state.edit.mock.calls[0]![0]).toMatchObject({original:txn,details:{gross_amount:450.5,person:"Paciente corrigido",fee_amount:0}});
 expect(close).toHaveBeenCalledOnce();
});
