

## Plano: Criar tabelas de logística no banco de dados

### Diagnóstico

O dashboard de logística mostra zeros porque as tabelas que o backend consulta (`log_fornecedores`, `log_solicitacoes_compra`, `log_pedidos`, `log_recebimentos`, `log_notas_fiscais`, `log_pedido_itens`, `log_movimentacoes`) **não existem** no banco de dados. A única tabela existente é `solicitacoes`.

### Implementação

**Migration SQL** — criar as 7 tabelas necessárias com RLS:

1. **`log_fornecedores`** — id, razao_social, nome_fantasia, cnpj, email, telefone, contato, categoria, ativo (default true), observacoes, created_at
2. **`log_solicitacoes_compra`** — id, titulo, descricao, justificativa, valor_estimado, urgencia, status (default 'pendente'), area, solicitante_id, aprovado_por, observacoes, created_at
3. **`log_pedidos`** — id, solicitacao_id (FK → log_solicitacoes_compra), fornecedor_id (FK → log_fornecedores), descricao, valor_total, data_pedido (default now), data_prevista, status (default 'aguardando'), codigo_rastreio, transportadora, created_by, created_at
4. **`log_recebimentos`** — id, pedido_id (FK → log_pedidos), recebido_por, observacoes, status (default 'ok'), created_at
5. **`log_notas_fiscais`** — id, numero, serie, fornecedor_id (FK), pedido_id (FK), valor, data_emissao, chave_acesso, tipo (default 'entrada'), observacoes, created_by, created_at
6. **`log_pedido_itens`** — id, pedido_id (FK), descricao, quantidade, unidade (default 'un'), valor_unitario, created_at
7. **`log_movimentacoes`** — id, codigo_item, descricao, tipo, quantidade, origem, destino, observacoes, responsavel_id, data_movimentacao, created_at

**RLS**: Todas as tabelas terão RLS habilitada com política de leitura para usuários autenticados e políticas de escrita para autenticados (o backend já usa service role key, mas é boa prática).

### Nenhuma alteração de código

O backend (`backend/routes/logistica.js`) e o frontend (`Logistica.jsx`) já estão prontos — só faltam as tabelas.

### Arquivos envolvidos

| Ação | Detalhe |
|------|---------|
| Migration SQL | Criar 7 tabelas `log_*` com foreign keys e RLS |

