import { describe, expect, it } from "vitest";
import {
  dashboardDay,
  monthBilling,
  cashPixMonth,
  boletoReceivables,
  dashboardIndicators,
  dashboardCosts,
  dashboardMonth,
  dashboardFunding,
  type Txn,
  buildLaunchRows,
  buildLaunchPlan,
  cardFeePercent,
  isDefaulted,
  summarize,
  addMonths,
  type CardSettings,
} from "./finance";

const settings: CardSettings = {
  debit_fee: 1.5,
  debit_days: 1,
  credit_fee_1x: 3.2,
  credit_fee_2_6: 4.5,
  credit_fee_7_12: 5.5,
  credit_days: 30,
};
let n = 0;
const gid = () => `g${++n}`;

describe("taxas de cartão", () => {
  it("usa a faixa de taxa pelo número de parcelas", () => {
    expect(cardFeePercent(settings, "credito", 1)).toBe(3.2);
    expect(cardFeePercent(settings, "credito", 6)).toBe(4.5);
    expect(cardFeePercent(settings, "credito", 7)).toBe(5.5);
    expect(cardFeePercent(settings, "debito", 1)).toBe(1.5);
    expect(cardFeePercent(settings, "pix", 1)).toBe(0);
  });
});

describe("lançamento parcelado no crédito", () => {
  it("divide R$1.000 em 3x com taxa e recebimento a cada 30 dias", () => {
    const rows = buildLaunchRows(
      { kind: "entrada", description: "Implante", payment_method: "credito", amount: 1000, date: "2026-11-04", installments: 3 },
      settings,
      gid,
    );
    expect(rows.map((r) => r.gross_amount)).toEqual([333.33, 333.33, 333.34]);
    expect(rows.map((r) => r.due_date)).toEqual(["2026-12-04", "2027-01-03", "2027-02-02"]);
    expect(rows[0]!.fee_amount).toBe(15); // 4.5% de 333.33
    expect(rows[0]!.net_amount).toBe(318.33);
    expect(rows.every((r) => r.status === "pendente")).toBe(true);
    expect(rows.every((r) => r.competence_date === "2026-11-04")).toBe(true);
  });

  it("débito cai no dia seguinte com taxa de 1,5%", () => {
    const row = buildLaunchRows(
      { kind: "entrada", description: "Consulta", payment_method: "debito", amount: 200, date: "2026-11-04", installments: 5 },
      settings,
      gid,
    )[0]!;
    expect(row.due_date).toBe("2026-11-05");
    expect(row.fee_amount).toBe(3);
    expect(row.installment_total).toBe(1);
  });
});

describe("boletos e despesas fixas", () => {
  it("boleto em 4x vence mensalmente a partir do primeiro vencimento, sem taxa", () => {
    const rows = buildLaunchRows(
      { kind: "entrada", description: "Ortodontia", payment_method: "boleto", amount: 1200, date: "2026-11-04", first_due_date: "2026-11-10", installments: 4 },
      settings,
      gid,
    );
    expect(rows.map((r) => r.due_date)).toEqual(["2026-11-10", "2026-12-10", "2027-01-10", "2027-02-10"]);
    expect(rows.every((r) => r.fee_amount === 0)).toBe(true);
  });

  it("despesa fixa repetida por 12 meses gera 12 lançamentos", () => {
    const rows = buildLaunchRows(
      { kind: "saida", description: "Aluguel", payment_method: "boleto", nature: "fixa", amount: 4500, date: "2026-11-05", installments: 1, repeat_months: 12 },
      settings,
      gid,
    );
    expect(rows).toHaveLength(12);
    expect(rows[11]!.due_date).toBe("2027-10-05");
    expect(rows.every((r) => r.nature === "fixa" && r.gross_amount === 4500)).toBe(true);
  });

  it("pix pago à vista entra como pago", () => {
    const row = buildLaunchRows(
      { kind: "entrada", description: "Limpeza", payment_method: "pix", amount: 150, date: "2026-11-04", installments: 1, paid: true },
      settings,
      gid,
    )[0]!;
    expect(row.status).toBe("pago");
    expect(row.paid_date).toBe("2026-11-04");
  });

  it("fim de mês não pula mês", () => {
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
  });
});

describe("inadimplência", () => {
  it("boleto vencido e não pago é inadimplente; cartão não", () => {
    expect(isDefaulted({ kind: "entrada", status: "pendente", due_date: "2026-10-01", payment_method: "boleto" }, "2026-11-04")).toBe(true);
    expect(isDefaulted({ kind: "entrada", status: "pendente", due_date: "2026-10-01", payment_method: "credito" }, "2026-11-04")).toBe(false);
    expect(isDefaulted({ kind: "entrada", status: "pago", due_date: "2026-10-01", payment_method: "boleto" }, "2026-11-04")).toBe(false);
  });
});

describe("margem de lucro", () => {
  it("lucro = receita líquida - despesas; margem sobre a receita bruta", () => {
    const s = summarize([
      { kind: "entrada", gross_amount: 10000, fee_amount: 400, net_amount: 9600, nature: null },
      { kind: "saida", gross_amount: 3000, fee_amount: 0, net_amount: 3000, nature: "fixa" },
      { kind: "saida", gross_amount: 2000, fee_amount: 0, net_amount: 2000, nature: "variavel" },
    ]);
    expect(s.profit).toBe(4600);
    expect(s.margin).toBe(46);
    expect(s.fixedExpenses).toBe(3000);
  });
});

describe("dashboard mensal", () => {
  const row = (patch: Partial<Txn> = {}): Txn => ({
    id: "test",
    kind: "entrada",
    description: "Teste",
    person: null,
    category_id: null,
    nature: null,
    payment_method: "pix",
    status: "pendente",
    competence_date: "2026-11-01",
    due_date: "2026-11-20",
    paid_date: null,
    gross_amount: 100,
    fee_amount: 0,
    net_amount: 100,
    installment_number: 1,
    installment_total: 1,
    group_id: null,
    notes: null,
    ...patch,
  });

  it("atribui recebimentos e pagamentos ao mês efetivo, sem duplicar vencimentos antigos", () => {
    const rows = [
      row({ status: "pago", due_date: "2026-10-15", paid_date: "2026-11-03" }),
      row({
        kind: "saida",
        status: "pago",
        due_date: "2026-10-01",
        paid_date: "2026-11-02",
        gross_amount: 40,
        net_amount: 40,
      }),
      row({ status: "pago", paid_date: "2026-12-01" }),
    ];
    const nov = dashboardMonth(rows, "2026-11", "2026-11-04");
    expect(nov.received).toBe(100);
    expect(nov.paid).toBe(40);
    expect(nov.realized).toBe(60);
    expect(nov.byMethod.find((r) => r.method === "pix")?.received).toBe(100);
    expect(dashboardMonth(rows, "2026-10", "2026-11-04").received).toBe(0);
    expect(dashboardMonth(rows, "2026-12", "2026-11-04").received).toBe(100);
  });

  it("usa cartão líquido e exclui recebíveis vencidos da previsão, inclusive cartões", () => {
    const m = dashboardMonth(
      [
        row({ payment_method: "credito", fee_amount: 5, net_amount: 95 }),
        row({ payment_method: "boleto", due_date: "2026-11-01" }),
        row({ payment_method: "debito", due_date: "2026-11-02", fee_amount: 2, net_amount: 98 }),
        row({ due_date: "2026-11-04", payment_method: "dinheiro" }),
        row({ due_date: "2026-12-01" }),
      ],
      "2026-11",
      "2026-11-04",
    );
    expect(m.toReceive).toBe(195);
    expect(m.overdueReceivable).toBe(198);
    expect(m.receivable).toBe(393);
    expect(m.projected).toBe(195);
    expect(m.byMethod.reduce((v, r) => v + r.expected, 0)).toBe(m.toReceive);
    expect(m.byMethod.reduce((v, r) => v + r.overdue, 0)).toBe(m.overdueReceivable);
  });

  it("inclui despesas antigas pendentes, sem contar recebíveis antigos como caixa", () => {
    const m = dashboardMonth(
      [
        row({ kind: "saida", due_date: "2026-10-01", gross_amount: 250, net_amount: 250 }),
        row({ kind: "saida", gross_amount: 200, net_amount: 200 }),
        row({ due_date: "2026-10-20", gross_amount: 1000, net_amount: 1000 }),
        row(),
      ],
      "2026-11",
      "2026-11-04",
    );
    expect(m.priorToPay).toBe(250);
    expect(m.priorToReceive).toBe(1000);
    expect(m.toPay).toBe(200);
    expect(m.projected).toBe(-350);
    expect(dashboardFunding(m.projected, 150)).toEqual({ closing: -200, contribution: 200 });
    expect(dashboardFunding(m.projected, 400)).toEqual({ closing: 50, contribution: 0 });
  });

  it("mantém DRE por competência e caixa separados, sem descontar a taxa duas vezes", () => {
    const paid = row({
      status: "pago",
      paid_date: "2026-11-01",
      payment_method: "credito",
      fee_amount: 5,
      net_amount: 95,
    });
    const future = row({ due_date: "2026-12-01" });
    const expense = row({
      kind: "saida",
      nature: "fixa",
      status: "pago",
      paid_date: "2026-11-02",
      gross_amount: 50,
      net_amount: 50,
    });
    const m = dashboardMonth([paid, future, expense], "2026-11", "2026-11-04");
    expect(m.cashDre.profit).toBe(45);
    expect(m.realized).toBe(45);
    expect(summarize([paid, future, expense]).profit).toBe(145);
  });

  it("expõe datas ausentes, aceita saldo negativo e arredonda centavos", () => {
    const m = dashboardMonth(
      [
        row({ status: "pago", gross_amount: 0.1, net_amount: 0.1 }),
        row({ status: "pago", gross_amount: 0.2, net_amount: 0.2 }),
      ],
      "2026-11",
      "2026-11-04",
    );
    expect(m.missingPaidDates).toBe(2);
    expect(m.received).toBe(0.3);
    expect(dashboardFunding(m.projected, -0.5)).toEqual({ closing: -0.2, contribution: 0.2 });
  });

  it("mês vazio não gera receitas, despesas ou margem fictícias", () => {
    const m = dashboardMonth([], "2027-01", "2026-11-04");
    expect(m.received).toBe(0);
    expect(m.toPay).toBe(0);
    expect(m.projected).toBe(0);
    expect(m.byMethod).toHaveLength(7);
    expect(m.cashDre.margin).toBe(0);
  });
});

describe("conferência diária", () => {
  it("separa venda no cartão de recebimento líquido e não presume datas ausentes", () => {
    const rows = buildLaunchRows(
      {
        kind: "entrada",
        description: "Cartão",
        payment_method: "credito",
        amount: 1000,
        date: "2026-11-04",
        installments: 2,
      },
      settings,
      gid,
    ).map((t, i) => ({ ...t, id: `card-${i}` }));
    const paid = {
      ...rows[0]!,
      id: "paid",
      competence_date: "2026-10-01",
      status: "pago" as const,
      paid_date: "2026-11-04",
    };
    const expense = {
      ...paid,
      id: "expense",
      kind: "saida" as const,
      payment_method: "dinheiro" as const,
      gross_amount: 100,
      net_amount: 100,
      fee_amount: 0,
    };
    const missing = { ...paid, id: "missing", paid_date: null, due_date: "2026-11-04" };
    const daily = dashboardDay([...rows, paid, expense, missing], "2026-11-04");
    expect(daily.cardSales).toBe(1000);
    expect(daily.received).toBe(477.5);
    expect(daily.paid).toBe(100);
    expect(daily.movement).toBe(377.5);
    expect(daily.count).toBe(2);
    expect(daily.missingPaidDates).toBe(1);
    expect(daily.byMethod.find((r) => r.method === "dinheiro")?.movement).toBe(-100);
    expect(dashboardDay([...rows, paid, expense], "2026-11-05").count).toBe(0);
  });
});


describe("indicadores e composição de custos", () => {
  const txn = (overrides: Partial<Txn> = {}) => ({ kind: "entrada", payment_method: "pix", status: "pago", paid_date: "2026-11-02", due_date: "2026-11-01", competence_date: "2026-11-01", gross_amount: 100, net_amount: 100, fee_amount: 0, nature: null, category_id: null, ...overrides }) as Txn;
  it("compara os recebimentos líquidos, preservando prejuízo e despesas por competência", () => {
    const cash = [txn(), txn({payment_method: "dinheiro", gross_amount: 50, net_amount: 50}), txn({payment_method: "credito", gross_amount: 60, net_amount: 50, fee_amount: 10}), txn({paid_date: "2026-10-30"})];
    const comp = [txn(), txn({kind: "saida", nature: "fixa", gross_amount: 120}), txn({kind: "saida", nature: "variavel", gross_amount: 30})];
    const m = dashboardIndicators(cash, comp, "2026-11", "2026-11-04");
    expect(m.byMethod.find(r => r.method === "pix")?.receivedPct).toBe(50);
    expect(m.byMethod.find(r => r.method === "dinheiro")?.receivedPct).toBe(25);
    expect(m.byMethod.find(r => r.method === "credito")?.receivedPct).toBe(25);
    expect(m.profitPct).toBe(-50);
    expect(m.fixedPct).toBe(80);
    expect(m.variablePct).toBe(20);
  });
  it("inadimplência usa a mesma base vencida no mês e exclui cartões e meses anteriores", () => {
    const rows = [txn({status: "pendente"}), txn({gross_amount: 300}), txn({payment_method: "credito", status: "pendente", gross_amount: 900}), txn({status: "pendente", due_date: "2026-11-04"}), txn({status: "pendente", due_date: "2026-11-20"}), txn({status: "pendente", due_date: "2026-10-01"})];
    const m = dashboardIndicators(rows, [], "2026-11", "2026-11-04");
    expect(m.defaultedAmount).toBe(100);
    expect(m.dueAmount).toBe(400);
    expect(m.defaultPct).toBe(25);
    expect(dashboardIndicators(rows, [], "2026-12", "2026-11-04").defaultPct).toBeNull();
  });
  it("não inventa percentuais para base vazia", () => {
    const m = dashboardIndicators([], [], "2026-11");
    expect([m.profitPct, m.fixedPct, m.variablePct, m.defaultPct]).toEqual([null,null,null,null]);
    expect(m.byMethod.every(r => r.receivedPct === null)).toBe(true);
  });
  it("agrupa categorias pela natureza do lançamento e reconcilia todos os custos", () => {
    const rows = [txn({kind:"saida",nature:"fixa",category_id:"a",gross_amount:100}),txn({kind:"saida",nature:"fixa",category_id:"a",gross_amount:50}),txn({kind:"saida",nature:"variavel",category_id:"a",gross_amount:30}),txn({kind:"saida",nature:null,gross_amount:20}),txn()];
    const costs = dashboardCosts(rows,[{id:"a",name:"Serviços"}]);
    expect(costs.map(g=>g.amount)).toEqual([150,30,20]);
    expect(costs.map(g=>g.percent)).toEqual([75,15,10]);
    expect(costs[0]!.rows[0]!).toMatchObject({name:"Serviços",amount:150,percent:75});
    expect(costs[2]!.rows[0]!.name).toBe("Sem categoria");
    expect(costs.reduce((sum,g)=>sum+g.amount,0)).toBe(summarize(rows).totalExpenses);
  });
});

it("parcela cheque sem taxas e considera atraso na inadimplência", () => {
 const rows=buildLaunchRows({kind:"entrada",description:"Cheque",payment_method:"cheque",amount:3500,date:"2026-09-11",first_due_date:"2026-10-01",installments:7},settings,gid);
 expect(rows).toHaveLength(7);
 expect(rows.every(r=>r.gross_amount===500 && r.fee_amount===0 && r.status==="pendente")).toBe(true);
 expect(rows[6]!.due_date).toBe("2027-04-01");
 expect(isDefaulted(rows[0]!,"2026-11-01")).toBe(true);
});

describe("faturamento por competência e caixa em dinheiro/Pix", () => {
  const txn = (overrides: Partial<Txn> = {}) => ({ kind: "entrada", payment_method: "pix", status: "pago", paid_date: "2026-11-02", due_date: "2026-11-01", competence_date: "2026-11-01", gross_amount: 100, net_amount: 100, fee_amount: 0, nature: null, category_id: null, ...overrides }) as Txn;

  it("faturamento soma o valor bruto pela competência, incluindo parcelas futuras", () => {
    const rows = [
      txn(),
      txn({ payment_method: "credito", status: "pendente", paid_date: null, due_date: "2027-01-01", gross_amount: 300 }),
      txn({ competence_date: "2026-10-31", gross_amount: 999 }),
      txn({ kind: "saida", gross_amount: 50 }),
    ];
    const b = monthBilling(rows, "2026-11");
    expect(b.total).toBe(400);
    expect(b.received).toBe(100);
    expect(b.pending).toBe(300);
    expect(b.byMethod.find((r) => r.method === "credito")?.percent).toBe(75);
    expect(b.byMethod.find((r) => r.method === "pix")?.percent).toBe(25);
  });

  it("dinheiro e Pix recebidos no mês pagam as contas do mês e as anteriores em aberto", () => {
    const rows = [
      txn({ gross_amount: 500, net_amount: 500 }),
      txn({ payment_method: "dinheiro", gross_amount: 200, net_amount: 200 }),
      txn({ payment_method: "boleto", installment_total: 2, gross_amount: 1000, net_amount: 1000 }),
      txn({ kind: "saida", gross_amount: 300 }),
      txn({ kind: "saida", status: "pendente", paid_date: null, due_date: "2026-11-20", gross_amount: 250 }),
      txn({ kind: "saida", status: "pendente", paid_date: null, due_date: "2026-10-10", gross_amount: 100 }),
    ];
    const c = cashPixMonth(rows, "2026-11", "2026-11-05");
    expect(c.received).toBe(700);
    expect(c.bills).toBe(650);
    expect(c.billsOpen).toBe(350);
    expect(c.balance).toBe(50);
    expect(c.entries).toHaveLength(2);
  });
});


it("mantém venda parcelada integral na competência e recebimentos nos meses correspondentes", () => {
  const rows: Txn[] = buildLaunchRows({kind:"entrada",description:"Venda parcelada",payment_method:"credito",
    amount:1000,date:"2026-08-10",installments:3},settings,gid).map((r,i) => ({...r,id:`credit-${i}`,
      status: i === 0 ? "pago" : "pendente", paid_date: i === 0 ? "2026-09-09" : null}));
  expect(monthBilling(rows,"2026-08").total).toBe(1000);
  expect(monthBilling(rows,"2026-09").total).toBe(0);
  expect(monthBilling(rows,"2026-08").byMethod.find(r=>r.method==="credito")?.percent).toBe(100);
  expect(dashboardMonth(rows,"2026-08","2026-09-10").received).toBe(0);
  expect(dashboardMonth(rows,"2026-09","2026-09-10").received).toBe(rows[0]!.net_amount);
  expect(cashPixMonth(rows,"2026-09","2026-09-10").received).toBe(0);
});

it("separa dinheiro/Pix pendentes e pagamentos de outros meses do caixa selecionado", () => {
  const rows: Txn[] = buildLaunchRows({kind:"entrada",description:"Pix parcelado",payment_method:"pix",
    amount:300,date:"2026-08-10",first_due_date:"2026-08-10",installments:3},settings,gid).map((r,i) => ({...r,id:`pix-${i}`,
      status:i<2?"pago":"pendente",paid_date:i===0?"2026-08-10":i===1?"2026-09-10":null}));
  expect(monthBilling(rows,"2026-08").total).toBe(300);
  expect(monthBilling(rows,"2026-09").total).toBe(0);
  expect(cashPixMonth(rows,"2026-08","2026-09-11").received).toBe(100);
  expect(cashPixMonth(rows,"2026-09","2026-09-11").received).toBe(100);
  expect(cashPixMonth(rows,"2026-10","2026-09-11").received).toBe(0);
});


it("inclui débito líquido no caixa imediato, pela data de recebimento, sem antecipar pendências", () => {
  const debit: Txn = { ...buildLaunchRows({kind:"entrada",description:"Débito",payment_method:"debito",
    amount:1000,date:"2026-10-31",installments:1},settings,gid)[0]!, id:"debit",status:"pago",paid_date:"2026-11-01" };
  const rows = [debit,
    {...debit,id:"cash",payment_method:"dinheiro" as const,gross_amount:50,net_amount:50,fee_amount:0},
    {...debit,id:"pix",payment_method:"pix" as const,gross_amount:100,net_amount:100,fee_amount:0},
    {...debit,id:"pending",status:"pendente" as const,paid_date:null,due_date:"2026-11-20",gross_amount:200,fee_amount:3,net_amount:197},
    {...debit,id:"overdue",status:"pendente" as const,paid_date:null,due_date:"2026-11-01",gross_amount:100,fee_amount:1.5,net_amount:98.5},
    {...debit,id:"old",paid_date:"2026-10-30"},
    {...debit,id:"credit",payment_method:"credito" as const},
    {...debit,id:"expense",kind:"saida" as const,gross_amount:400,net_amount:400,fee_amount:0},
  ];
  const cash = cashPixMonth(rows,"2026-11","2026-11-05");
  expect(cash.debito).toBe(985);
  expect(cash.received).toBe(1135);
  expect(cash.expected).toBe(197);
  expect(cash.balance).toBe(735);
  expect(cash.projectedBalance).toBe(932);
  expect(cash.entries.map(t=>t.id).sort()).toEqual(["cash","debit","pix"]);
});


describe("entrada e saldo restante da venda", () => {
  const sale = {kind:"entrada" as const,description:"Tratamento",person:"Paciente",category_id:"cat",payment_method:"credito" as const,
    amount:1000,date:"2026-11-05",installments:4,paid:false};
  it("gera entrada Pix e somente o saldo parcelado no cartão, sem duplicar competência", () => {
    const plan = buildLaunchPlan({...sale,down_payment:{amount:200,payment_method:"pix",first_due_date:"2026-11-05",paid:true}},settings,()=>"sale");
    expect(plan.remaining).toBe(800);expect(plan.rows).toHaveLength(5);
    expect(plan.rows[0]).toMatchObject({gross_amount:200,net_amount:200,fee_amount:0,status:"pago",payment_method:"pix"});
    expect(plan.rows.slice(1).every(r=>r.gross_amount===200&&r.fee_amount===9&&r.net_amount===191&&r.status==="pendente")).toBe(true);
    expect(new Set(plan.rows.map(r=>r.group_id))).toEqual(new Set(["sale"]));
    expect(plan.rows.every(r=>r.competence_date===sale.date&&r.person==="Paciente"&&r.category_id==="cat")).toBe(true);
    const rows=plan.rows.map((r,i)=>({...r,id:String(i)}));
    expect(monthBilling(rows,"2026-11").total).toBe(1000);
    expect(dashboardMonth(rows,"2026-11","2026-11-05").received).toBe(200);
    expect(rows.reduce((v,r)=>v+r.net_amount,0)).toBe(964);
  });
  it.each(["pix","dinheiro","boleto","cheque","credito","debito"] as const)("aceita entrada em %s com taxas próprias e saldo em boleto", method => {
    const plan=buildLaunchPlan({...sale,payment_method:"boleto",first_due_date:"2026-12-05",installments:3,
      down_payment:{amount:200,payment_method:method,first_due_date:"2026-11-20",paid:false}},settings,()=>"sale");
    expect(plan.rows).toHaveLength(4);expect(plan.rows[0]!.payment_method).toBe(method);
    expect(plan.rows.slice(1).map(r=>r.due_date)).toEqual(["2026-12-05","2027-01-05","2027-02-05"]);
    expect(plan.rows.slice(1).map(r=>r.gross_amount)).toEqual([266.66,266.66,266.68]);
    expect(plan.rows.reduce((s,r)=>Math.round(s+r.gross_amount*100),0)).toBe(100000);
    expect(plan.rows.slice(1).every(r=>r.fee_amount===0)).toBe(true);
    if(method==="credito")expect(plan.rows[0]!.fee_amount).toBe(6.4);
    if(method==="debito")expect(plan.rows[0]!.fee_amount).toBe(3);
  });
  it("ignora recorrência no novo plano e cria só as parcelas escolhidas", () => {
    const plan=buildLaunchPlan({...sale,repeat_months:12},settings,()=>"sale");
    expect(plan.rows).toHaveLength(4);expect(plan.rows.reduce((s,r)=>s+r.gross_amount,0)).toBe(1000);
  });
  it.each([0,-1,1000,1100,Number.NaN])("bloqueia entrada inválida %s",amount=>{
    expect(()=>buildLaunchPlan({...sale,down_payment:{amount,payment_method:"pix"}},settings,()=>"sale")).toThrow();
  });
  it("permite saldo em dinheiro/Pix parcelado e não arredonda a venda para cima",()=>{
    const plan=buildLaunchPlan({...sale,amount:100.01,payment_method:"pix",first_due_date:"2026-12-05",installments:3,
      down_payment:{amount:20,payment_method:"dinheiro",paid:true}},settings,()=>"sale");
    expect(plan.rows.map(r=>r.gross_amount)).toEqual([20,26.67,26.67,26.67]);
  });
});


it("inclui boleto em parcela única pelo recebimento e separa parcelas, pendências e meses", () => {
  const boleto: Txn = {...buildLaunchRows({kind:"entrada", description:"Boleto à vista", payment_method:"boleto",
    amount:1450, date:"2026-10-15", installments:1, paid:true}, settings, gid)[0]!, id:"vista"};
  const rows: Txn[] = [boleto,
    {...boleto,id:"parcela",installment_total:3},
    {...boleto,id:"outro-mes",paid_date:"2026-09-30"},
    {...boleto,id:"pendente",status:"pendente",paid_date:null,due_date:"2026-10-25",gross_amount:100,net_amount:100},
    {...boleto,id:"atrasado",status:"pendente",paid_date:null,due_date:"2026-10-01",gross_amount:200,net_amount:200},
    {...boleto,id:"parcela-pendente",installment_total:3,status:"pendente",paid_date:null,due_date:"2026-10-25"},
    {...boleto,id:"despesa",kind:"saida",gross_amount:500,net_amount:500},
  ];
  const cash=cashPixMonth(rows,"2026-10","2026-10-20");
  expect(cash.boletoAvista).toBe(1450);
  expect(cash.received).toBe(1450);
  expect(cash.expected).toBe(100);
  expect(cash.balance).toBe(950);
  expect(cash.projectedBalance).toBe(1050);
  expect(cash.coveragePct).toBe(290);
  expect(cash.entries.map(t=>t.id)).toEqual(["vista"]);
  expect(dashboardMonth(rows,"2026-10","2026-10-20").received).toBe(2900);
});

it("agenda de boletos separa pagamento, vencimento e pendências durante 24 meses", () => {
  const boleto: Txn = {...buildLaunchRows({kind:"entrada",description:"Boleto",payment_method:"boleto",
    amount:100,date:"2026-10-01",installments:1,paid:false},settings,gid)[0]!,id:"open"};
  const rows: Txn[] = [boleto,
    {...boleto,id:"late",due_date:"2026-09-15",net_amount:40},
    {...boleto,id:"received",status:"pago",due_date:"2026-09-20",paid_date:"2026-10-02",net_amount:80},
    {...boleto,id:"paid-elsewhere",status:"pago",paid_date:"2026-11-01"},
    {...boleto,id:"future",due_date:"2027-01-10",installment_total:12,net_amount:200},
    {...boleto,id:"last",due_date:"2028-09-30",net_amount:300},
    {...boleto,id:"outside",due_date:"2028-10-01",net_amount:999},
    {...boleto,id:"expense",kind:"saida",net_amount:1000},
    {...boleto,id:"credit",payment_method:"credito",net_amount:2000},
  ];
  const a=boletoReceivables(rows,"2026-10","2026-10-05");
  expect(a.received).toBe(80);expect(a.open).toBe(100);expect(a.future).toBe(500);expect(a.overdue).toBe(140);
  expect(a.monthRows.map(t=>t.id)).toEqual(["open","paid-elsewhere"]);
  expect(a.projection).toHaveLength(24);
  expect(a.projection[23]).toEqual({month:"2028-09",amount:300,count:1});
  expect(boletoReceivables(rows,"2027-01","2026-10-05").open).toBe(200);
  expect(boletoReceivables([],"2026-10").projection.every(row=>row.amount===0&&row.count===0)).toBe(true);
});
