

## Plano: Adicionar rotas faltantes no backend de Logística

### Problema
O frontend chama endpoints de Logística que não existem no backend (`/api/logistica/notas`, `/api/logistica/movimentacoes`, `/api/logistica/pedidos/:id/itens`, `/api/logistica/itens/:id`). Esses retornam 404 com "Endpoint de API não encontrado".

### O que será feito

**1. Adicionar rotas faltantes em `backend/routes/logistica.js`:**
- `GET /notas` — listar notas fiscais
- `POST /notas` — criar nota fiscal
- `DELETE /notas/:id` — remover nota fiscal
- `GET /pedidos/:id/itens` — listar itens de um pedido
- `POST /pedidos/:id/itens` — adicionar item a um pedido
- `DELETE /itens/:id` — remover item de pedido
- `GET /movimentacoes` — listar movimentações
- `POST /movimentacoes` — criar movimentação
- `GET /movimentacoes/historico/:codigo` — histórico por código

**2. Tabelas Supabase necessárias (SQL para você executar):**
- `log_notas_fiscais` — notas fiscais vinculadas a pedidos/fornecedores
- `log_pedido_itens` — itens individuais de cada pedido
- `log_movimentacoes` — registro de movimentações de materiais

### Detalhes técnicos
- As rotas seguem o mesmo padrão já existente no arquivo (authenticate + authorize, queries Supabase, tratamento de erros)
- RLS habilitado sem políticas públicas (acesso via service_role)
- Será gerado o SQL completo para criar as tabelas

