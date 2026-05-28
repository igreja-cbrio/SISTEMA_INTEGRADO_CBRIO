# Módulo Marketing — Decomposição em Specs (Fase 8)

> **Status:** v1.0 · 2026-05-28
> **Pré-requisito:** Segurança aprovada (`06-seguranca-autorizacao.md`)
> **Próxima fase:** Fase 9 — Implementação (Claude Code roda spec por spec)

---

## 1. Princípios de decomposição

- Cada spec = 1 PR (ou pequeno conjunto coeso) num branch dedicado.
- Cada spec cabe numa sessão de Claude Code de até 1-2h.
- Specs ordenadas por **dependência técnica**, não só prioridade do RICE.
- Cada spec tem **critério objetivo de "pronto"**.
- Vertical slices preferíveis a horizontal layers (entrega valor cedo).
- **Spec 001 é TRANSVERSAL** (mexe no backbone de Solicitações) — atenção redobrada.

---

## 2. Mapa de specs

| # | Spec | Depende de | Esforço | Fase |
|---|---|---|---|---|
| 001 | Aprovação hierárquica no Solicitações (TRANSVERSAL) | — | M-L | Fundação |
| 002 | Schema base do Marketing (migrations) | 001 | M | Fundação |
| 003 | Seed inicial (equipe · etiquetas · recorrentes · permissões) | 002 | S | Fundação |
| 004 | Backend · CRUD de cards + atribuição + transições de estado | 003 | M-L | Core |
| 005 | Backend · estimativa preliminar + cycle time + recálculo KPI | 004 | M | Core |
| 006 | Backend · upload SharePoint via Microsoft Graph | 004 | M | Core |
| 007 | Frontend Kanban `/marketing` (card · filtros · estados · task interna) | 004 | L | Core |
| 008 | Frontend Calendário `/marketing/calendario` (visões líder + colaborador) | 005 | L | Core |
| 009 | Frontend Admin `/marketing/admin` (4 abas CRUD) | 003 | M | Core |
| 010 | Frontend · bloco Marketing em `/solicitacoes/nova` (etiquetas + estimativa live) | 005 | S-M | Core |
| 011 | Frontend · aba "Aprovar" em `/solicitacoes` (diretor de origem) | 001 | S-M | Core |
| 012 | Frontend · sugestão de revisão (1x) + estado aguardando + NPS | 007 | S-M | Polish |
| 013 | Frontend Analytics `/marketing/analytics` (4 KPIs + gargalo Arthur) | 005 | M | Polish |
| 014 | Notificações (10 eventos integrados ao `notificacaoGenerator.js`) | 004,011 | S-M | Polish |
| 015 | Testes E2E + smoke + cutover do go-live | todos | M | Polish |

**Total estimado:** ~3-4 sprints (~3-4 semanas de trabalho focado), MVP-ready.

---

## 3. Fases agrupadas

### Fase A · Fundação (specs 001-003 · ~1 semana)
Backbone pronto, schema completo, equipe e catálogos vinculados. Nada visível ainda
pra usuário final, mas teste de fumaça (criar uma solicitação Marketing manualmente
via SQL) já funciona.

### Fase B · Core (specs 004-011 · ~2-2,5 semanas)
Funcionalidade principal entregue: solicitar → aprovar → Kanban → calendário →
entregar → baixar. Marketing já é usável internamente nesse ponto.

### Fase C · Polish (specs 012-015 · ~0,5-1 semana)
Revisão, analytics, notificações, testes E2E, cutover.

---

## 4. Specs detalhadas

### Spec 001 · Aprovação hierárquica no Solicitações (TRANSVERSAL)

**Objetivo.** Adicionar aprovação hierárquica pelo diretor da área de origem no
backbone de Solicitações. Afeta TODAS as áreas, não só Marketing.

**Pré-requisitos.** Listar `DISTINCT profile.area` no banco e mapear cada valor a
uma das 3 diretorias antes do deploy.

**Escopo INCLUÍDO:**
- Migration `<timestamp>_solicitacoes_aprovacao_hierarquica.sql`:
  - Tabela `setor_diretor` + seed (3 linhas).
  - Colunas novas em `solicitacoes` (8 colunas).
  - Novo valor `aguardando_aprovacao_origem` no enum/CHECK de status.
  - Trigger `fn_solicitacoes_roteamento_aprovacao` (BEFORE INSERT).
  - Índice parcial pra fila do diretor.
  - Policies RLS atualizadas.
  - Audit trigger estendido.
- Backend (`backend/routes/solicitacoes.js`):
  - `PATCH /api/solicitacoes/:id/aprovar-origem` (diretor aprova).
  - `PATCH /api/solicitacoes/:id/rejeitar-origem` (motivo obrigatório).
  - Endpoint `GET /api/solicitacoes?aba=aprovar` filtra por
    `aprovacao_origem_diretor_id = auth.uid()` AND `aprovacao_origem_status = 'pendente'`.
  - Bloqueio de POST se `current_user_funcionario_id() IS NULL` (membros não solicitam).
- Frontend (`src/pages/admin/Solicitacoes.jsx` ou similar):
  - Nova aba "Aprovar" com badge contador.
  - Card de aprovação com botões + modal de motivo na rejeição.
  - Status visível pro solicitante na aba "Minhas" ("Aguardando aprovação de X").
- Notificações (`notificacaoGenerator.js`):
  - Nova solicitação aguardando aprovação → diretor.
  - Aprovada → solicitante + responsável da área alvo.
  - Rejeitada → solicitante com motivo.

**Escopo EXCLUÍDO:**
- Escalação automática se diretor demora >24h (Fase 11).
- Histórico de aprovação visual rico (audit log basta no MVP).

**Arquivos criados/modificados:**
- `supabase/migrations/<timestamp>_solicitacoes_aprovacao_hierarquica.sql` (novo)
- `backend/routes/solicitacoes.js` (modificado)
- `backend/services/notificacaoGenerator.js` (modificado)
- `src/pages/admin/Solicitacoes.jsx` (modificado)
- `src/api.js` (modificado · namespace solicitacoes)
- `docs/SEGURANCA_RUNBOOK.md` (modificado · registrar mudança transversal)
- `CLAUDE.md` (atualizar)

**Critérios de sucesso:**
- [ ] Pr.Wesley cria solicitação → vai pra Arthur Serpa.
- [ ] Eduardo cria solicitação → status = `dispensada`.
- [ ] Pr.Pedrão cria solicitação → status = `dispensada`.
- [ ] Membro sem `rh_funcionarios` → POST falha com 403.
- [ ] Rejeição registra motivo e status fica imutável.
- [ ] Audit log captura mudanças nos novos campos.
- [ ] Solicitações pré-existentes não quebram (`aprovacao_origem_status` NULL aceitável).

**Risco transversal.** Testes manuais em pelo menos 2 áreas existentes (cozinha,
manutenção) pra garantir que o fluxo antigo segue funcionando.

---

### Spec 002 · Schema base do Marketing

**Objetivo.** Criar todas as tabelas novas do módulo Marketing.

**Escopo INCLUÍDO:**
- Migration `<timestamp>_marketing_schema.sql`:
  - `marketing_membros`
  - `marketing_etiquetas_tipo` (+ seed de 8 valores)
  - `marketing_etiquetas_destino` (+ seed de 5 valores)
  - `marketing_kanban_cards`
  - `marketing_entregaveis`
  - `marketing_capacidade_override`
  - `marketing_compromissos_recorrentes`
- Triggers: `fn_marketing_cards_estado_ts`, audit log.
- RLS policies (todas conforme Fase 7).
- Índices (8 índices estratégicos).
- Adicionar 5 tabelas à whitelist `app_soft_deletable_tables()`.

**Critérios de sucesso:**
- [ ] Migration aplica sem erro no Supabase.
- [ ] Etiquetas (tipo/destino) carregam seed corretamente.
- [ ] CHECK constraints funcionam (origem ↔ FK correto).
- [ ] RLS bloqueia non-marketing levels de fazer SELECT.

---

### Spec 003 · Seed inicial (equipe · permissões · módulo)

**Objetivo.** Cadastrar a equipe inicial e habilitar permissões.

**Escopo INCLUÍDO:**
- Migration `<timestamp>_marketing_seed_inicial.sql`:
  - Inserir módulo `marketing` em `public.modulos` (rota `/marketing`,
    categoria ministerial · ordem 999).
  - Copiar matriz default de `coordenador-marketing × marketing` baseada em outro
    cargo similar (ou seed direto: cargos novos do Marketing).
  - `AREA_MODULO_BOOST['marketing'] = 'marketing'` (atualizar middleware).
  - `ROUTE_MODULE_MAP['marketing'] = ['marketing']`.
  - Verificar/criar `rh_funcionarios` + `profiles` pra Allan/Aline/Cauã/Lorena Pariz/Letícia
    (CASE NOT EXISTS).
  - Vincular cada um a `marketing_membros` com habilidade.
  - Inserir `marketing_compromissos_recorrentes` (seed preliminar do Marcos).
- Bust de cache de permissões (chamar `bustPermissionCaches()` após deploy).

**Critérios de sucesso:**
- [ ] Pedro Paiva ao logar tem nível 5 em `marketing` via boost.
- [ ] Allan/Aline/Cauã/Lorena/Letícia têm linhas em `marketing_membros`.
- [ ] Recorrentes aparecem no banco com os horários preliminares.
- [ ] Item de menu "Marketing" aparece em Ministerial pro Pedro.

---

### Spec 004 · Backend · CRUD de cards + atribuição + transições

**Objetivo.** Endpoints REST pros cards do Kanban.

**Escopo INCLUÍDO:**
- `backend/routes/marketing.js` (novo):
  - `GET /api/marketing/cards` (filtros: estado · origem · etiqueta · atribuido_a)
  - `GET /api/marketing/cards/:id`
  - `POST /api/marketing/cards` (origem='interna' apenas · level ≥5)
  - `PATCH /api/marketing/cards/:id` (atribuição · prazo · etiquetas · estado · raia_rapida)
  - `PATCH /api/marketing/cards/:id/sugerir-revisao` (motivo obrigatório · 1x apenas · ordem_fila atualizada pro fim)
  - `DELETE /api/marketing/cards/:id` (soft via `app_soft_delete`)
- Trigger `tg_marketing_cards_solicitacao_sync` quando solicitação muda pra
  `pendente` (área Marketing), cria card automaticamente com origem='solicitacao'.
- Trigger `tg_marketing_cards_evento_sync` quando `kanban_tasks` de área 'marketing'
  é criada via ciclo criativo de Eventos, cria card com origem='evento'.

**Critérios de sucesso:**
- [ ] Pedro cria task interna via POST.
- [ ] Solicitação aprovada gera card automaticamente.
- [ ] Cauã move card próprio entre estados.
- [ ] Cauã NÃO consegue mover card de outro (RLS).
- [ ] Sugerir revisão atualiza `ordem_fila` pro fim.
- [ ] Segunda tentativa de sugerir revisão no mesmo card é bloqueada.

---

### Spec 005 · Backend · estimativa preliminar + cycle time + KPIs

**Objetivo.** Cálculo de capacidade + estimativa de prazo + KPIs auto-coletados.

**Escopo INCLUÍDO:**
- Função SQL `fn_marketing_calcular_capacidade_semana(data_ref)` retorna
  capacidade disponível por membro descontando recorrentes + overrides.
- Função `fn_marketing_estimar_prazo(etiqueta_tipo_id, etiqueta_destino_id)` lê
  `esforco_medio_h` da etiqueta + capacidade da equipe + prazo desejado, e devolve
  data sugerida.
- Endpoint `GET /api/marketing/estimar?tipo=X&destino=Y&data_alvo=DD/MM/YYYY` →
  retorna estimativa preliminar em dias.
- KPIs `MKT-*` registrados em `kpi_indicadores_taticos` + `fonte_auto` apontando
  pra coletores do Marketing.
- Coletor `kpiAutoCollector.js` ganha `marketing.prazo_no_alvo`,
  `marketing.lead_time_medio`, `marketing.throughput`, `marketing.razao_demanda_capacidade`.
- Trigger SQL de recálculo em insert/update/delete de cards.

**Critérios de sucesso:**
- [ ] Estimativa preliminar retorna em < 500ms.
- [ ] Capacidade semanal desconta recorrentes corretamente.
- [ ] KPIs aparecem em `/painel-area/marketing` com dado.
- [ ] Card concluído atualiza KPIs em real-time via trigger.

---

### Spec 006 · Backend · upload SharePoint via Microsoft Graph

**Objetivo.** Anexar entregáveis no SharePoint via Graph API.

**Escopo INCLUÍDO:**
- `backend/services/sharepointMarketing.js` (novo):
  - `uploadEntregavel(cardId, file)` → autentica com Graph (reusa
    `getGraphToken` do Cérebro) → upload pra biblioteca configurada via
    `SHAREPOINT_MARKETING_LIBRARY_ID` → grava `marketing_entregaveis` no banco.
  - Retry exponencial em falha de rede (3 tentativas).
- Endpoint `POST /api/marketing/cards/:id/entregaveis` (multipart).
- Endpoint `GET /api/marketing/cards/:id/entregaveis` (lista · com signed URL).
- `GET /api/marketing/entregaveis/:id/download` → gera signed URL temporária do
  Graph e redireciona.

**Critérios de sucesso:**
- [ ] Upload de PNG 5MB funciona.
- [ ] Upload de MP4 30MB funciona.
- [ ] Retry funciona em falha simulada de rede.
- [ ] Solicitante baixa entregável via `/solicitacoes?aba=minhas`.

---

### Spec 007 · Frontend Kanban `/marketing`

**Objetivo.** UI do Kanban com card, filtros, estados, task interna.

**Escopo INCLUÍDO:**
- `src/pages/marketing/MarketingKanban.jsx`:
  - 4 colunas (Fila · Em produção · Aguardando solicitante · Concluído).
  - Filtros: origem · etiqueta tipo · etiqueta destino · atribuído.
  - Card com badges (etiqueta tipo+destino · atribuído · prazo · urgência · revisão).
  - Drag-and-drop entre estados (com confirmação se for estado regressivo).
  - Painel lateral (Drawer) de detalhe + edição.
  - Botão "+ Nova task interna" → modal de criação.
- Componentes novos:
  - `<MarketingKanbanCard />`
  - `<EtiquetaSeletor />`
- Rota em `src/App.tsx` com `<ModuleGuard moduleSlug="marketing" nivelMinimo={3}>`.
- Item de menu em `AppShell.jsx`.

**Critérios de sucesso:**
- [ ] Pedro vê todos os cards.
- [ ] Cauã vê todos read-only e edita só os próprios.
- [ ] Filtros funcionam combinados.
- [ ] Drag entre estados respeita regras (não pula estado).
- [ ] Mobile responsivo.

---

### Spec 008 · Frontend Calendário `/marketing/calendario`

**Objetivo.** Visualização semanal de capacidade.

**Escopo INCLUÍDO:**
- `src/pages/marketing/MarketingCalendario.jsx`:
  - Grid 7 colunas (Seg-Dom) × N linhas (membros).
  - Slots livres em cinza · ocupados coloridos por etiqueta tipo · recorrentes
    com ícone.
  - Navegação ± semana + botão "Hoje".
  - Variante visão coordenador (todos) vs colaborador (só própria linha).
  - Click em slot livre → lista cards da fila pra atribuir.
- Componente novo: `<MarketingCalendarGrid />`.

**Critérios de sucesso:**
- [ ] Pedro vê grid de 4-5 linhas.
- [ ] Cauã vê só sua linha.
- [ ] Recorrentes aparecem (Aline dom · Allan qua · Lorena diário).
- [ ] Overrides aparecem (testar com 1 férias simulada).

---

### Spec 009 · Frontend Admin `/marketing/admin`

**Objetivo.** CRUD pra Pedro/Marcos editarem direto na UI sem migration.

**Escopo INCLUÍDO:**
- `src/pages/marketing/MarketingAdmin.jsx`:
  - 4 abas: Membros · Etiquetas (tipo/destino) · Recorrentes · Overrides.
  - Tabelas com inline edit + botões Editar/Remover.
  - Confirmação em delete.
  - Acesso restrito a nível 5 em `marketing`.

**Critérios de sucesso:**
- [ ] Pedro edita hora/duração de recorrente sem chamar dev.
- [ ] Pedro edita `esforco_medio_h` de etiqueta.
- [ ] Marcos cadastra férias da equipe pra próxima semana.

---

### Spec 010 · Frontend bloco Marketing em `/solicitacoes/nova`

**Objetivo.** Estender o form existente do Solicitações com campos do Marketing.

**Escopo INCLUÍDO:**
- Modificar `src/pages/admin/Solicitacoes.jsx` (componente de form):
  - Quando área alvo = Marketing, mostrar bloco extra:
    - `<EtiquetaSeletor />` (tipo + destino).
    - Habilidade sugerida (badge informativo).
    - `<EstimativaPreliminarBadge />` (chama `GET /api/marketing/estimar` debounced).
- Atualizar `src/api.js` com namespace `marketing`.

**Critérios de sucesso:**
- [ ] Estimativa atualiza em < 1s após mudar etiqueta/data.
- [ ] Estimativa é label "preliminar" (não confunde com confirmado).
- [ ] Bloco só aparece se área alvo = Marketing.

---

### Spec 011 · Frontend aba "Aprovar" em `/solicitacoes` (diretor)

**Objetivo.** UI pro diretor de origem aprovar/rejeitar.

**Escopo INCLUÍDO:**
- Nova aba "Aprovar" em `/solicitacoes` (visível só se user é diretor de origem).
- Badge contador na aba.
- Lista de pendências com card resumido.
- Painel lateral com detalhes + botões [Aprovar] / [Rejeitar com motivo].
- Modal de motivo na rejeição.

**Critérios de sucesso:**
- [ ] Arthur Serpa vê pendências do Ministerial.
- [ ] Eduardo vê pendências da Gestão.
- [ ] Aprovação muda status visível em < 1s.
- [ ] Rejeição com motivo registra audit log.

---

### Spec 012 · Frontend revisão (1x) + estado aguardando + NPS

**Objetivo.** Botão "Sugerir revisão" no preview do solicitante + integração NPS.

**Escopo INCLUÍDO:**
- Em `/solicitacoes?aba=minhas`:
  - Quando card em estado `aguardando_solicitante`:
    - Preview embarcado (link/imagem).
    - Botão [Aprovar entrega] → libera anexo final.
    - Botão [Sugerir revisão (1x)] → modal de motivo → some após uso.
  - Quando concluído + sem NPS:
    - Modal de NPS (0-10 + comentário) reaproveita do Solicitações existente.
- Componente novo: `<RevisaoSugerirButton />`.

**Critérios de sucesso:**
- [ ] Botão "Sugerir revisão" some após uso (não aparece de novo).
- [ ] Card volta pra `em_producao` e `ordem_fila` é atualizada pro fim.
- [ ] NPS preenchido alimenta `ADM-C-NPS`.

---

### Spec 013 · Frontend Analytics `/marketing/analytics`

**Objetivo.** Dashboard de KPIs do módulo.

**Escopo INCLUÍDO:**
- `src/pages/marketing/MarketingAnalytics.jsx`:
  - 4 cards principais: `MKT-PRAZO` · `MKT-DEM-CAP` · `MKT-LEAD` · `MKT-THROUGHPUT`.
  - Gráfico de linha temporal (4-12 semanas).
  - Bloco específico "Tempo médio de aprovação por diretor" (monitora gargalo do Arthur).
  - Filtros por etiqueta tipo/destino.
  - Acesso: nível ≥1 (read).

**Critérios de sucesso:**
- [ ] 4 KPIs mostram valor calculado.
- [ ] Gargalo Arthur Serpa visível se tempo médio > 24h.
- [ ] Filtros recalcula em < 1s.

---

### Spec 014 · Notificações (10 eventos)

**Objetivo.** Integrar todos os eventos de notificação no `notificacaoGenerator.js`.

**Escopo INCLUÍDO:**
- Em `backend/services/notificacaoGenerator.js`:
  - Nova solicitação aguardando aprovação → diretor.
  - Aprovada/rejeitada pelo diretor → solicitante + responsável.
  - Prazo confirmado pelo coordenador → solicitante.
  - Urgência aceita/recusada → solicitante.
  - Mudança de status → solicitante + responsável.
  - "Aguardando solicitante" há 24h → solicitante (cron diário).
  - Concluído → pede NPS (solicitante).
  - SLA estourando em 24h → coord + responsável (cron diário).
- Registrar módulo `marketing` no array `MODULOS` de `src/pages/admin/NotificacaoRegras.jsx`.

**Critérios de sucesso:**
- [ ] 10 eventos testados manualmente disparam notificação.
- [ ] Cron diário gera "aguardando 24h" sem duplicar.
- [ ] Admin configura quem recebe via `NotificacaoRegras.jsx`.

---

### Spec 015 · Testes E2E + smoke + cutover do go-live

**Objetivo.** Validar fluxo ponta-a-ponta antes do go-live.

**Escopo INCLUÍDO:**
- Suite Playwright (`tests/e2e/marketing.spec.ts`):
  - Pr.Wesley cria solicitação → Arthur aprova → Pedro atribui → Cauã produz →
    Wesley revisa → entrega → NPS.
  - Pr.Wesley cria solicitação urgente → Pedro recusa urgência com motivo.
  - Eduardo cria solicitação → dispensada → vai direto.
  - Membro sem `rh_funcionarios` → POST falha.
- Smoke tests manuais (checklist):
  - Solicitação cozinha pré-existente continua funcionando.
  - Mudança de estado no Kanban atualiza KPIs.
  - Upload SharePoint funciona.
- Plano de cutover:
  - Comunicar a igreja (toda a equipe pastoral + funcionários) 1 semana antes.
  - Treinamento curto (15 min) pro Pedro e equipe.
  - Treinamento curto pros 3 diretores sobre a nova aba "Aprovar".
  - Soft launch: piloto interno na equipe Marketing por 2 semanas antes de abrir
    pras outras áreas.

**Critérios de sucesso:**
- [ ] Suite Playwright passa.
- [ ] Smoke tests passam.
- [ ] Pedro e equipe operam o módulo sem suporte.
- [ ] 3 diretores aprovam pelo menos 1 solicitação cada na primeira semana.

---

## 5. Estrutura de pastas para implementação

Quando o Claude Code começar a executar, criar pasta por spec:

```
docs/modulo-marketing/specs/
├── 001-aprovacao-hierarquica/
│   ├── spec.md         (esta seção, expandida)
│   └── notas.md        (anotações de execução)
├── 002-schema-base/
│   ├── spec.md
│   └── ...
└── ...
```

E `.claude/commands/executar-spec-marketing.md` (opcional) pro slash command
`/executar-spec-marketing NNN` rodar a spec correspondente.

---

## 6. Riscos da decomposição

- **Spec 001 é transversal.** Bug aqui afeta cozinha, manutenção, financeiro, etc.
  Testar fora do escopo Marketing antes de mergear.
- **Specs 007/008 são grandes (L).** Considerar quebrar em 2 PRs se passar de
  2h estimadas.
- **Spec 015 deve ser rodada após TODAS as outras** — não antecipar.

---

## 7. Validação

- [x] Todas as features do PRD têm specs cobrindo
- [x] Dependências sem ciclos
- [x] Cada spec tem critério objetivo
- [x] Ordem permite valor incremental (após Fase B já é usável)
- [x] Spec transversal isolada (001) e marcada
- [ ] Aprovado pra Fase 9 (implementação)

Marcos aprova esta versão em: ___ (data)
