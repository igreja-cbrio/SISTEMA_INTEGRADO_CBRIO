
Objetivo

- Corrigir o fluxo de criação de solicitação, que hoje entra em “Criando...” mas falha sem retorno visível.

Diagnóstico

- O clique do botão está funcionando: `src/pages/Solicitacoes.jsx` já entra em `submitting`.
- O problema mais provável está no backend de solicitações:
  - `backend/routes/solicitacoes.js` usa `req.userId` e `req.userProfile`
  - mas o middleware `authenticate` popula `req.user.userId`, `req.user.role`, `req.user.granular` e `req.user.name`
- Isso quebra o fluxo:
  - `GET /solicitacoes` filtra com usuário indefinido e tende a trazer lista vazia
  - `POST /solicitacoes` tenta salvar `solicitante_id: undefined`, então a criação falha
  - o erro não aparece para o usuário porque a página usa `toast` do Sonner, mas o app não está montando o `<Toaster />`

Implementação

1. Corrigir `backend/routes/solicitacoes.js`
- trocar `req.userId` por `req.user.userId`
- trocar `req.userProfile?.role` por `req.user.role`
- trocar `req.userProfile?.granular?.modulePerms` por `req.user.granular?.modulePerms`
- trocar `req.userProfile?.name` por `req.user.name`
- centralizar isso em variáveis locais no início de cada rota para evitar novas regressões

2. Restaurar feedback visual na interface
- montar o `Toaster` do Sonner no app raiz (`src/App.tsx` ou `src/main.tsx`)
- manter os `toast.success` e `toast.error` já existentes em `src/pages/Solicitacoes.jsx`

3. Validar o fluxo
- abrir a tela de Solicitações e confirmar que a listagem volta a carregar
- criar uma solicitação de Infraestrutura
- verificar se:
  - o dialog fecha
  - aparece toast de sucesso ou erro
  - a solicitação entra na lista/kanban
- se houver erro, ele deixa de ficar “silencioso” e passa a aparecer corretamente

Observação técnica

- Se depois disso ainda falhar no preview, o próximo ponto a validar é a configuração do backend, porque `backend/utils/supabase.js` depende de `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY`, enquanto a `.env` atual expõe principalmente variáveis `VITE_*`.

Arquivos envolvidos

- `backend/routes/solicitacoes.js`
- `src/App.tsx` ou `src/main.tsx`
- `src/pages/Solicitacoes.jsx`
