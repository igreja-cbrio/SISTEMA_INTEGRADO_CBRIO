

## Plano: Corrigir busca de compras e rastreio do Mercado Livre

### Diagnóstico
O problema provável é que `ml_user_id` está nulo ou incorreto no banco, fazendo com que a query `/orders/search?buyer=null` retorne vazio silenciosamente. O `mlFetch` não verifica erros da API — retorna o JSON "cru" (que pode ser um objeto de erro), e o frontend interpreta como lista vazia.

### Correções em `backend/routes/ml.js`

**1. Garantir `ml_user_id` no endpoint `/status`**
Ao verificar o status, se o token funciona mas `ml_user_id` está nulo no banco, salvar o `user.id` automaticamente. Isso resolve cenários onde o callback não gravou o ID.

**2. Adicionar validação de erro no `mlFetch`**
Verificar se a resposta da API do ML é um erro (campos `error` ou `status >= 400`) e lançar exceção com mensagem útil, em vez de retornar silenciosamente.

**3. Fallback seller na rota `/orders`**
Se a busca por `buyer` retornar 0 resultados, tentar buscar por `seller` (caso a conta seja vendedora e não compradora). Retornar o que tiver dados.

**4. Logs detalhados**
Adicionar `console.log` nos endpoints de orders e shipments para registrar a resposta bruta da API, facilitando debug futuro.

### Arquivo alterado
- `backend/routes/ml.js`

### Após implementação
Será necessário fazer redeploy no Vercel para aplicar as mudanças.

