import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { useFinancialMonth } from "@/hooks/use-financial-month";
import { monthKey, todayISO } from "@/lib/finance";
afterEach(cleanup);
function View({name}:{name:string}) {const [month,setMonth]=useFinancialMonth();return <div><output aria-label={name}>{month}</output><button onClick={()=>setMonth("2026-09")}>Selecionar setembro {name}</button></div>;}
it("preserva o período ao trocar de tela e atualiza consumidores simultaneamente",()=>{
 const view=render(<><View name="Painel"/><View name="Boletos"/></>);
 fireEvent.click(screen.getByText("Selecionar setembro Painel"));
 expect(screen.getByLabelText("Boletos")).toHaveTextContent("2026-09");
 view.unmount();render(<View name="Relatórios"/>);
 expect(screen.getByLabelText("Relatórios")).toHaveTextContent("2026-09");
});
it("ignora período salvo inválido sem formar consultas com datas impossíveis",()=>{
 window.sessionStorage.setItem("essencial-financial-month","2026-99");render(<View name="Painel"/>);
 expect(screen.getByLabelText("Painel")).toHaveTextContent(monthKey(todayISO()));
});
