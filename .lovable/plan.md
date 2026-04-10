
Objetivo

- Corrigir o erro real da criação de solicitação, que continua falhando mesmo com o botão e o toast funcionando.

O que eu revisei

- Fluxo frontend em `src/pages/Solicitacoes.jsx`
- Cliente de API em `src/api.js`
- Rota backend em `backend/routes/solicitacoes.js`
- Middleware de autenticação em `backend/middleware/auth.js`
- Migration da tabela `solicitacoes` em `supabase/migrations/20260410011300_ee3f7612-3ff5-4d13-8e37-6cdb2a573043.sql`
- Serviço de notificação em `backend/services/notificar.js`

Do I know what the issue is?

- Sim, o problema mais provável está identificado.

Problema exato

- A UI permite criar solicitação com categoria `infraestrutura`.
- O backend também aceita `infraestrutura` em `backend/routes/solicitacoes.js`.
- Mas a tabela `public.solicitacoes` foi criada com um `CHECK` que só permite:
  - `ti`, `compras`, `reembolso`, `espaco`, `ferias`, `outro`
- `infraestrutura` não está nessa constraint.
- No print do usuário, a categoria selecionada é exatamente `Infraestrutura`.
- Resultado: o insert falha no banco e o backend devolve o erro genérico “Erro ao criar solicitação”.

Há um segundo risco já visível

- Após o insert, a rota chama `notificar()` em modo assíncrono.
- Esse serviço depende das tabelas `notificacoes` e `notificacao_regras`.
- Pelas migrations lidas, essas tabelas não aparecem no projeto.
- Isso provavelmente não derruba a criação porque o código usa `.catch(...)`, mas continua gerando erro de backend em log e precisa ser tratado.

Plano de correção

1. Ajustar o schema da tabela `solicitacoes`
- Criar uma migration para atualizar a regra da coluna `categoria`
- Incluir `infraestrutura` entre os valores permitidos
- Aproveitar para revisar se `espaco` e demais categorias da UI continuam alinhadas com o banco

2. Endurecer a rota de criação para evitar novos desencontros
- Em `backend/routes/solicitacoes.js`, validar `categoria` contra a mesma lista usada pela UI/backend
- Se vier categoria inválida, retornar `400` com mensagem específica, em vez de deixar quebrar no banco
- Isso evita outro ciclo de erro “genérico”

3. Melhorar a mensagem de erro da criação
- No `catch` da rota, retornar `e.message` ou `error.message` quando for seguro
- Assim, se houver nova falha de schema/constraint, o usuário verá algo acionável e não apenas “Erro ao criar solicitação”

4. Blindar notificações para não poluir o fluxo
- Verificar se o projeto realmente precisa das tabelas `notificacoes` e `notificacao_regras`
- Se elas ainda não existirem, tenho duas opções de implementação:
  - criar essas tabelas corretamente no banco, ou
  - proteger o serviço para ignorar ausência dessas tabelas sem gerar erro
- Eu seguiria a primeira opção se o módulo de notificações já fizer parte do produto

Arquivos envolvidos

- `supabase/migrations/...` nova migration para ajustar a constraint de `solicitacoes`
- `backend/routes/solicitacoes.js`
- possivelmente migrations para `notificacoes` e `notificacao_regras` se confirmarmos esse bloco

Resultado esperado

- Criar solicitação com categoria `Infraestrutura` passa a funcionar
- O erro deixa de ser genérico
- O fluxo fica consistente entre frontend, backend e banco

Detalhe técnico

- O conflito principal é este desalinhamento:
```text
Frontend/backend aceitam:
ti, compras, reembolso, espaco, infraestrutura, ferias, outro

Banco aceita hoje:
ti, compras, reembolso, espaco, ferias, outro
```
- Ou seja, `infraestrutura` quebra no insert.
