# Tesouraria — auditoria e liberação

Auditoria realizada em 05/11/2026, calendário America/Sao_Paulo.
Repositório: `gesplanengenharia-lab/odonto-financeiro`.
Branch: `feature/tesouraria-integracao-segura`, PR #2, em rascunho.
Base auditada: `3aed7350ef767d3eeca25ebd0053597841747c64`.

## Banco original: confirmado por consultas de leitura

Projeto Lovable: `60585b0d-f363-536a-b06e-3c59acaccdb0`, banco habilitado,
PostgreSQL 17.11. A auditoria de dados foi somente leitura. Depois da auditoria, a migração aditiva 0006 foi aplicada ao banco original com autorização do usuário; ela alterou apenas a estrutura e o marcador de versão. Nenhuma transação, conta, baixa, confirmação ou movimentação foi criada ou reescrita.

| Verificação | Resultado observado |
| --- | --- |
| Versão da Tesouraria | 1 na auditoria inicial; 2 após aplicação da migração aditiva 0006 |
| Lançamentos | 838 |
| Baixas sem conta | 328 |
| Baixas vinculadas / conciliadas | 0 / 0 |
| Entradas pagas com auto_settle habilitado | 300 |
| Contas / movimentos / conferências / eventos de auditoria | 0 / 0 / 0 / 0 |
| RLS nas cinco tabelas da Tesouraria | Ativo, políticas administrativas |
| Privilégios anônimos nas novas tabelas | Nenhum grant encontrado |
| Funções privadas de gatilho | Sem EXECUTE para authenticated/anon |
| Função de saldo | SECURITY INVOKER, search_path vazio, restrita a administrador |
| Corpos das sete funções v1 da Tesouraria | Correspondem à migração 0005 da branch |

As seis consultas de integridade retornaram **zero anomalias**: conciliação sem
baixa/conta/data/autor, pagamento anterior à abertura, movimento anterior à
abertura, destino de transferência anterior à abertura, cancelamento sem motivo
e diferença de extrato inconsistente. Como ainda não há movimentação bancária,
esses resultados não substituem um teste de fluxo real.

As colunas necessárias foram encontradas com os tipos esperados. Os gatilhos de
proteção e auditoria estão instalados. A baixa automática existente não implica
confirmação bancária e não foi executada pela auditoria.

A consulta complementar de integridade também foi executada manualmente no SQL Editor do Lovable. Resultado para os 838 lançamentos: PostgreSQL **17.11**, versão de Tesouraria **1**, **zero baixas pagas sem data**, **zero baixas com data futura** e **zero valores para revisar** (NaN, negativos ou diferença líquido/bruto/taxa acima da tolerância). A consulta retornou apenas contagens agregadas; nenhum dado individual de paciente foi exposto. O limite do conector impediu execução automática por esta sessão, mas não impediu a validação manual mostrada na captura do usuário.

## Correções da branch

- Vínculo e confirmação comparam também paciente, descrição, direção da operação,
  forma de pagamento, taxa e vencimento. Mudanças concorrentes recusam a ação.
- Baixas e edições invalidam os saldos e os pagamentos da Tesouraria; isso inclui
  a baixa automática feita ao abrir o aplicativo.
- Contas são paginadas, com ordenação estável. Retornos bancários inválidos,
  incompletos ou com IDs incorretos geram erro, sem saldos artificiais.
- Erro de atualização oculta valores conciliados em cache. Datas inválidas ou
  futuras não exibem uma posição financeira.
- A migração aditiva `0006_treasury_atomic_balances.sql` calcula todos os saldos
  e ambas as visões em uma única instrução SQL, com o mesmo snapshot MVCC.
  Transferências aparecem nas duas contas simultaneamente.
- A mesma atualização invalida uma conciliação se paciente, descrição ou
  vencimento forem alterados depois da conferência. Mantém os controles de
  acesso e a trilha de auditoria existentes.
- A interface exige o marcador v2 antes de disponibilizar as operações da
  Tesouraria. Banco v1 apresenta aviso de validação pendente. Outros módulos
  continuam com suas permissões existentes.

**A migração 0006 foi gerada pelo Drizzle, testada em banco isolado e aplicada ao banco original.** A verificação posterior confirmou PostgreSQL 17.11, versão 2, função presente, `SECURITY INVOKER`, `STABLE`, execução concedida a `authenticated` e negada a `anon`. As funções privadas de gatilho seguem sem `EXECUTE` para usuários autenticados. Os 838 lançamentos e as contagens zero de contas, movimentos, conferências e auditoria foram preservados. A chamada administrativa somente de leitura retornou `[]`, como esperado sem contas cadastradas. A migração não preencheu contas em lançamentos antigos nem criou transações.

## Verificações executadas

- Vitest: **141 testes em 20 arquivos aprovados**.
- TypeScript: `tsc --noEmit`, sem erros.
- Build Vite/TanStack: aprovado.
- ESLint nos cinco arquivos TypeScript alterados: sem erros, com a regra de
  formatação Prettier desabilitada para preservar o estilo existente.
- PostgreSQL isolado PGlite 0.5.15 / PostgreSQL 18.6: **58 verificações aprovadas**,
  incluindo RLS, preservação de histórico, rollback, reaplicação, transferência,
  cancelamento, concorrência otimista e invalidação de conciliação.
- Chromium local: desktop 1440×1000 e celular 390×844, dados fictícios, sem acesso
  à produção. Fluxos de vínculo manual, confirmação explícita, erro de consulta,
  contas vazias e bloqueio do banco v1 aprovados; sem erro JavaScript nem
  transbordamento horizontal da página. A tabela móvel possui rolagem interna.

O PostgreSQL isolado não é a instância original 17.11. O teste de navegador local
não comprova a integração autenticada da prévia Lovable com o banco real.

## Condições antes de mesclar ou publicar

1. Validar o fluxo da interface na prévia Lovable conectada à branch, com usuário
   administrador. O banco não possui membros cadastrados para testar a negativa
   de acesso com uma conta real; essa regra foi conferida no RLS e em ambiente
   PostgreSQL isolado. Não criar lançamentos fictícios na clínica.
2. Confirmar sincronização da branch e CI do commit mais recente.

No momento da auditoria, o Lovable estava sincronizado com `main` em `b22af582dde542332928f879600ac8572a2b13af`. A migração 0006 já está instalada no banco original, mas a interface ainda não foi mesclada nem publicada. Manter o PR como rascunho até a validação da prévia autenticada.
