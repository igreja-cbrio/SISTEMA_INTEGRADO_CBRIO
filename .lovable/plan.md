

## Plano: Observações ao mudar status + notificações bidirecionais

### 1. Dialog de detalhe com campo de observações (`src/pages/Solicitacoes.jsx`)

Quando o responsável clicar em Aprovar, Rejeitar ou Concluir no `DetailDialog`, em vez de executar imediatamente, abrir um mini-formulário inline com:
- `Textarea` para observações (opcional)
- Botão de confirmar a ação

O `DetailDialog` passará a ter estado interno (`actionPending`, `observacoes`) e chamará `onStatusChange(id, newStatus, observacoes)`.

O `handleStatusChange` no componente pai será atualizado para enviar `{ status, observacoes }` via `api.update`.

Os botões rápidos no `SolicitacaoCard` do Kanban também passarão a abrir o `DetailDialog` (ou chamar sem observações — mantendo comportamento atual para agilidade).

### 2. Backend: notificações bidirecionais (`backend/routes/solicitacoes.js`)

No `PATCH /:id`, após atualizar o status:
- **Notificar o solicitante** (já faz isso parcialmente) — garantir que `targetIds` inclui `data.solicitante_id`
- **Notificar os responsáveis da área** — usar `resolverDestinatarios(modulo)` do `notificar.js` para encontrar quem deve ser avisado, e incluir no `targetIds` (ou fazer duas chamadas a `notificar`)

Na criação (`POST /`), já notifica responsáveis — OK.

### Arquivos modificados

| Arquivo | Mudança |
|---------|---------|
| `src/pages/Solicitacoes.jsx` | `DetailDialog` com campo de observações antes de confirmar ação; `handleStatusChange` passa observações |
| `backend/routes/solicitacoes.js` | `PATCH` envia notificação ao solicitante E aos responsáveis da área |

