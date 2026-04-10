

## Plano: Módulo "Solicitações" (serviço geral com Kanban)

### Visão Geral

Transformar a página "Solicitar Compra" em um módulo completo de **Solicitações** que permite ao colaborador solicitar diversos tipos de serviço (TI, Compras, Reembolso, Reserva de Espaço, Férias, etc.). Os responsáveis de cada área veem as solicitações em formato **Kanban**, filtradas por categoria.

---

### 1. Criar nova tabela no banco de dados

Criar tabela `solicitacoes` (separada da `log_solicitacoes_compra`) com colunas:

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| id | uuid PK | |
| titulo | text NOT NULL | O que precisa |
| descricao | text | Detalhes |
| justificativa | text | Por quê |
| categoria | text NOT NULL | `ti`, `compras`, `reembolso`, `espaco`, `ferias`, `outro` |
| urgencia | text | `baixa`, `normal`, `alta`, `critica` |
| status | text DEFAULT 'pendente' | `pendente`, `em_analise`, `aprovado`, `rejeitado`, `concluido` |
| valor_estimado | numeric | |
| solicitante_id | uuid FK profiles | Quem pediu |
| responsavel_id | uuid FK profiles | Quem está tratando |
| area_solicitante | text | Área de quem pediu |
| observacoes | text | Notas do responsável |
| created_at | timestamptz | |
| updated_at | timestamptz | |

RLS: Solicitante vê as próprias; responsáveis de área veem as da sua categoria; admin/diretor veem tudo.

### 2. Criar rotas backend (`backend/routes/solicitacoes.js`)

- `GET /solicitacoes` — lista com filtros (categoria, status, solicitante)
- `POST /solicitacoes` — criar (qualquer usuário autenticado)
- `PATCH /solicitacoes/:id` — atualizar status, responsável, observações
- Rota aberta para criação (não requer admin), leitura filtrada por permissão

### 3. Criar API client (`src/api.js`)

Adicionar namespace `solicitacoes` com `list`, `create`, `update`.

### 4. Criar página `src/pages/Solicitacoes.jsx`

Duas visões na mesma página:

**a) Formulário de nova solicitação** (dialog/modal)
- Campo categoria (select): TI, Compras, Reembolso, Reserva de Espaço, Férias, Outro
- Campos dinâmicos conforme categoria (ex: valor para Reembolso/Compras, datas para Férias/Espaço)
- Título, descrição, justificativa, urgência

**b) Kanban dos responsáveis**
- Colunas: Pendente → Em Análise → Aprovado → Concluído (+ Rejeitado)
- Cards com título, solicitante, urgência, categoria (badge colorido), data
- Filtro por categoria no topo
- Drag-and-drop para mudar status (ou botões de ação no card)
- Colaborador comum: vê apenas suas solicitações
- Responsável/admin: vê solicitações da sua área em Kanban

### 5. Atualizar navegação

- Renomear rota de `/solicitar-compra` para `/solicitacoes`
- Atualizar `App.tsx` (lazy import + rota)
- Atualizar `AppShell.jsx` — label "Solicitações", ícone `ClipboardList`, descrição "TI, compras, reembolso, espaços e férias"

### 6. Notificações

Usar o sistema `notificar()` existente para avisar responsáveis quando uma nova solicitação chegar na sua categoria.

---

### Arquivos criados/modificados

| Arquivo | Ação |
|---------|------|
| Migration SQL (tabela `solicitacoes`) | Criar |
| `backend/routes/solicitacoes.js` | Criar |
| `backend/server.js` | Registrar nova rota |
| `src/pages/Solicitacoes.jsx` | Criar (formulário + Kanban) |
| `src/api.js` | Adicionar namespace `solicitacoes` |
| `src/App.tsx` | Atualizar rota |
| `src/components/layout/AppShell.jsx` | Renomear menu item |
| `src/pages/SolicitarCompra.jsx` | Remover (substituído) |

