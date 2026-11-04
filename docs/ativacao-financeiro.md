# Ativação das melhorias — Essencial Odontologia

## Banco e permissões
Aplicar a migração `drizzle/migrations/0001_team_module_permissions.sql` no mesmo banco do projeto antes de liberar os membros. O arquivo está registrado no journal do Drizzle. Não reaplicar a migração inicial. A migração deve ser executada integralmente em transação pelo executor de migrações.

Sem a nova coluna, o aplicativo mantém o acesso administrativo e bloqueia os módulos dos membros. Configurações → Equipe informa a pendência. Depois da migração, membros recebem lançamentos, contas, cartões, inadimplentes e baixas por padrão; o administrador ajusta cada pessoa. Gestão, relatórios/DRE, provisões, IA, analytics e exclusões permanecem exclusivos de administradores.

As políticas do banco controlam inserção, baixa e exclusão. Membros que operam o financeiro precisam ler os lançamentos; a restrição de dashboard/DRE é por função do aplicativo, não uma promessa de ocultar valores presentes nos lançamentos operacionais.

## Assistente de IA
O servidor utiliza a autenticação Supabase já existente e exige papel admin. Configurar `LOVABLE_API_KEY` como segredo de execução do servidor (nunca VITE_*). `SUPABASE_URL` e `SUPABASE_PUBLISHABLE_KEY` são exigidos pelo middleware existente. Opcional: `LOVABLE_AI_MODEL`; padrão `google/gemini-3.7-flash`. Endpoint: `https://ai.gateway.lovable.dev/v1/chat/completions`.

Não foram usadas credenciais reais nem feita chamada faturável durante os testes. Validar a disponibilidade do modelo e uma consulta autenticada após configurar o ambiente. Só resumos e a pergunta são enviados; não são enviados nomes, descrições ou notas de pacientes. Limite local de cinco consultas por minuto por usuário/instância, além das quotas do gateway; não é um limitador global distribuído.

## Conferência e exportações
Fechamento diário é conferência dos lançamentos atuais, sem bloqueio, aprovação persistida ou conciliação automática. O saldo inicial mensal é uma simulação mantida enquanto a tela permanece aberta.

PDF usa a impressão nativa: selecionar Salvar como PDF. CSV baixa os lançamentos por competência, período e categoria. Valores dos relatórios não representam saldo bancário.

Analytics usa registros existentes: cadastros de usuários, parcelas criadas e contas ainda pagas pela data de pagamento. Exclusões e baixas desfeitas alteram os indicadores; não é trilha histórica de eventos.

## Validação pendente
Conferir no ambiente conectado: migração aplicada, permissões de admin/membro, consultas reais ao gateway, impressão/PDF, sincronização e aparência no Lovable. O navegador utilizado nesta implementação não tinha acesso ao projeto privado do Lovable.
