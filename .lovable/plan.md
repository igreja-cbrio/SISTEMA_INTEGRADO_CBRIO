

## Plano: Adicionar "Infraestrutura" + separar visão colaborador vs. responsável

### Resumo

1. Adicionar categoria **"Infraestrutura"** nas solicitações
2. Separar a página em **duas visões**: colaboradores comuns veem apenas uma **lista simples** das suas solicitações (sem Kanban); responsáveis de área e admins veem o **Kanban** com as solicitações da sua categoria

---

### 1. Adicionar categoria "Infraestrutura"

**Frontend (`src/pages/Solicitacoes.jsx`)**:
- Adicionar `{ value: 'infraestrutura', label: 'Infraestrutura', color: 'bg-yellow-500/15 text-yellow-700 dark:text-yellow-400' }` ao array `CATEGORIAS`

**Backend (`backend/routes/solicitacoes.js`)**:
- Adicionar `infraestrutura: 'administrativo'` ao mapa `CATEGORIA_MODULO` (ou outro módulo se preferir)

---

### 2. Separar visão: colaborador vs. responsável

A lógica de quem vê o Kanban usará o sistema de permissões granulares já existente (`canAccessModule`). O conceito:

- **Colaborador comum** (sem permissão de módulo relevante): vê apenas o botão "Nova Solicitação" + uma **lista/tabela** das suas próprias solicitações com status, sem Kanban
- **Responsável de área / admin / diretor** (quem tem `canAccessModule` em módulos como DP, Financeiro, Logística, etc.): vê o **Kanban completo** com filtro por categoria

**Frontend (`src/pages/Solicitacoes.jsx`)**:
- Usar `useAuth()` para verificar: `isAdmin` ou `canAccessModule(['DP','Pessoas','Financeiro','Logística','Patrimônio','Membresia'])` → `isResponsavel`
- Se `isResponsavel`: mostrar Kanban (como está hoje) + drag-and-drop + botões de ação
- Se não: mostrar lista simples das próprias solicitações (cards ou tabela), com status visual (badge), sem ações de aprovação
- O botão "Nova Solicitação" aparece para **todos**

**Backend (`backend/routes/solicitacoes.js`)**:
- A rota GET já filtra: não-admin vê apenas `solicitante_id = req.userId`. Isso funciona bem para colaboradores comuns
- Para responsáveis que não são admin/diretor mas têm permissão granular, adicionar lógica: se o usuário tem permissão no módulo correspondente à categoria, pode ver solicitações daquela categoria (usando `req.user.granular.modulePerms`)

---

### Arquivos modificados

| Arquivo | Mudança |
|---------|---------|
| `src/pages/Solicitacoes.jsx` | Adicionar "Infraestrutura", criar visão lista para colaboradores, condicionar Kanban a responsáveis |
| `backend/routes/solicitacoes.js` | Adicionar "infraestrutura" ao mapa, permitir responsáveis de módulo verem solicitações da sua categoria |

