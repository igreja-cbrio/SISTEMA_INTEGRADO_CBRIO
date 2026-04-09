
Objetivo: corrigir o fluxo do Mercado Livre para que as abas "Compras ML" e "Rastreio" parem de ficar vazias.

Diagnóstico confirmado
- `GET /api/ml/status` responde `connected: true` e retorna `user_id`, então o token do ML está válido.
- `GET /api/ml/orders` ainda responde `400 { error: "ml_user_id não configurado. Reconecte o ML." }`, então a busca de compras quebra antes de consultar os pedidos.
- `GET /api/ml/shipments` responde `[]`, então o frontend mostra estado vazio.
- No frontend não existe tratamento de `?ml_callback=1&code=...`, então o fluxo de reconexão/autorização do ML está incompleto.
- O botão atual de refresh do Rastreio tem um bug extra: ele espera `d.shipments`, mas o backend retorna um array puro.

Implementação

1. Backend ML (`backend/routes/ml.js`)
- Criar um helper para resolver o usuário do ML via `/users/me` sempre que necessário, sem depender apenas de `ml_user_id` salvo no banco.
- Usar esse helper em `/status`, `/orders` e `/shipments`.
- Persistir `ml_user_id` quando estiver vazio/divergente e validar de fato os erros do Supabase ao salvar.
- Extrair a lógica de busca buyer/seller para um helper reutilizável:
  - tentar `buyer`
  - se vier vazio, tentar `seller`
  - se ambas falharem por erro da API, retornar erro estruturado em vez de “vazio silencioso”
- Manter o contrato atual das respostas:
  - `/orders` continua retornando o payload do ML com `results`
  - `/shipments` continua retornando um array
- Garantir que o cache de shipments só armazene respostas válidas.

2. Frontend API (`src/api.js`)
- Adicionar `ml.authCallback(code)` para chamar `POST /ml/auth-callback`.
- Remover ou substituir o método órfão `authUrl` se ele não existir no backend.
- Manter `ml.shipments(params)` retornando array, sem mudar o formato esperado pelo restante da tela.

3. UI de Logística (`src/pages/admin/logistica/Logistica.jsx`)
- Implementar o callback OAuth:
  - ler `ml_callback` e `code` da URL
  - chamar `ml.authCallback(code)`
  - limpar a URL
  - recarregar status e pedidos
- Corrigir `loadOrders` para preencher `localError` quando a API falhar, em vez de só fazer `console.error`.
- Adicionar erro visível também na aba `Rastreio`.
- Corrigir os botões `Atualizar` e `Tentar novamente` do Rastreio para usar `setShipments(d || [])` (hoje `d.shipments || []` zera a lista).
- Ajustar a mensagem de estado vazio para diferenciar:
  - “nenhum dado encontrado”
  - “erro ao carregar / reconecte o ML”

Arquivos envolvidos
- `backend/routes/ml.js`
- `src/api.js`
- `src/pages/admin/logistica/Logistica.jsx`

Validação
- Confirmar no Network:
  - `/api/ml/status` => 200 com `connected: true`
  - `/api/ml/orders` => 200 com `results`
  - `/api/ml/shipments?refresh=1` => 200 com array
- Testar o fluxo completo:
  - desconectar
  - conectar novamente
  - voltar do Mercado Livre
  - abrir `Compras ML`
  - abrir `Rastreio`
  - clicar em `Atualizar`
- Fazer redeploy do projeto publicado, porque o preview está consumindo `https://crmcbrio.vercel.app/api`.

Detalhes técnicos
- Hoje o problema principal não é cache: o backend publicado ainda depende de `ml_user_id` salvo no banco, mesmo quando `/status` já consegue descobrir o usuário real via `/users/me`.
- As gravações no Supabase precisam checar `{ error }`, porque `update/insert` não lançam exceção automaticamente.
- Se depois da correção ainda aparecer `401`, revisar as variáveis do Vercel, principalmente `SUPABASE_SERVICE_ROLE_KEY`.
