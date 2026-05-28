# Módulo Marketing — Cutover Plan (Spec 015)

> **Status:** v1.0 · 2026-05-28 (após merge de todas as 14 specs)
> **Fim da Fase 9 · Implementação.** Próxima fase: rodar piloto e abrir pra igreja.

---

## 1. Smoke tests automatizados

Suite Playwright em `e2e/tests/marketing.spec.ts`:

- `/marketing` carrega Kanban com 4 colunas
- `/marketing/calendario` carrega com botão "Hoje"
- `/marketing/analytics` carrega com 4 cards de KPI
- Navegação header entre Kanban → Calendário → Analytics → Kanban

Rodar local: `npm run test:e2e -- marketing.spec.ts`. Configurar `E2E_TEST_EMAIL`
e `E2E_TEST_PASSWORD` apontando pra Pedro Paiva (nível 5 via boost).

Fluxos completos (criar → aprovar → atribuir → entregar → NPS) **NÃO** são
automatizados porque dependem de:
- 3+ usuários distintos (solicitante, diretor de origem, produtor)
- Reset de estado de banco
- Microsoft Graph configurado (upload SharePoint)

Esses fluxos vão pro smoke manual abaixo.

---

## 2. Smoke tests manuais (checklist obrigatório antes do go-live)

### A. Permissões

- [ ] Pedro Paiva (`coordenador-marketing` + área Marketing) acessa `/marketing` e vê todos os cards
- [ ] Allan/Cauã/Letícia/Lorena Pariz acessam e veem todos os cards (read)
- [ ] Allan move estado do **próprio** card OK → backend 200
- [ ] Allan tenta mover estado de card **do Cauã** → backend 403 + UI bloqueia
- [ ] Pedro Menezes (diretor Criativo) acessa `/marketing` e vê tudo read-only (nível 1)
- [ ] Arthur Serpa (diretor Ministerial) acessa `/marketing` em modo read-only
- [ ] Funcionário sem área Marketing **não** vê o menu

### B. Fluxo solicitação → kanban (origem=solicitacao)

- [ ] Pr. Wesley (qualquer funcionário ministerial) cria solicitação categoria=marketing
- [ ] Bloco rosa "Detalhes da demanda (Marketing)" aparece no form
- [ ] Estimativa preliminar aparece (mensagem "tipo não calibrado" enquanto `esforco_medio_h` for NULL)
- [ ] Solicitação cai em `aguardando_aprovacao_origem` na fila do **Arthur Serpa**
- [ ] Arthur vê aba "Aprovar (1)" em `/solicitacoes`
- [ ] Arthur clica Aprovar
- [ ] Solicitação muda pra `pendente` · trigger cria card em `/marketing` com etiquetas + prazo preliminar
- [ ] Pedro Paiva atribui o card pro Cauã + confirma prazo
- [ ] Wesley recebe notificação "Prazo confirmado: DD/MM"
- [ ] Cauã move card pra "em_producao" · Wesley **não** recebe ping (só admin/produtor)
- [ ] Cauã anexa arquivo de teste · upload vai pra `Criativo/Marketing/AAAA/AAAA-MM/...` no SharePoint
- [ ] Cauã move card pra "aguardando_solicitante"
- [ ] Wesley recebe notificação "Preview pronto"
- [ ] Wesley abre detalhe no `/solicitacoes` aba Minhas · vê bloco `MarketingCardBlock` com preview + 2 botões
- [ ] **Sugerir revisão (1x)** funciona · motivo obrigatório ≥5 chars · botão some · card volta pra `em_producao` no FIM da fila (`ordem_fila` incrementada)
- [ ] Segunda tentativa de sugerir revisão → backend 400 "Card já teve revisão"
- [ ] Cauã re-trabalha · volta pra `aguardando_solicitante`
- [ ] Wesley clica "Aprovar entrega" · card vira concluído + solicitação `status='concluido'`
- [ ] `NpsBlock` aparece em `/solicitacoes` · Wesley dá nota 9 + comentário
- [ ] KPI `ADM-C-Q-MARKETING` atualizado (verificar `kpi_valores_calculados`)

### C. Casos especiais

- [ ] Eduardo Gnisci cria solicitação categoria=marketing · vai direto pra `pendente` (dispensa)
- [ ] Pr. Juninho cria solicitação · idem (dispensa via `is_diretoria_geral`)
- [ ] Membro sem `rh_funcionarios` ativo → POST `/api/solicitacoes` falha com 403 e mensagem clara
- [ ] Card origem=evento criado via ciclo criativo de Eventos · `event_tasks.area='marketing'` → trigger dispara → card aparece no `/marketing` com origem='evento'
- [ ] Pedro cria task interna via "+ Nova task interna" → card aparece com origem='interna'
- [ ] Solicitação rejeitada não pode ser reaberta (status `rejeitado` imutável)

### D. Calendário + Analytics

- [ ] Pedro vê calendário com Allan/Cauã/Letícia/Lorena
- [ ] Allan logado vê **só a própria linha** (filter client-side por profile_id)
- [ ] Recorrentes aparecem (Allan qua + Lorena seg-sáb)
- [ ] Adicionar override em `/marketing/admin` (férias 0h) · calendário reflete
- [ ] Cards com `prazo_confirmado` na semana aparecem na célula do dia
- [ ] Analytics: 4 cards de KPI carregam · gráfico temporal mostra séries
- [ ] Bloco "Tempo médio aprovação por diretor" mostra agregação

### E. Smoke nas outras áreas (não-marketing)

A Spec 001 é transversal · obrigatório validar fluxo antigo em pelo menos 2 áreas:

- [ ] Solicitação cozinha (categoria=outro · area_responsavel=cozinha) ainda funciona ponta-a-ponta
- [ ] Solicitação manutenção (categoria=infraestrutura) ainda funciona
- [ ] Solicitação pré-existente (criada antes da migration de 28/05) continua tramitando (status `aprovacao_origem_status='dispensada'` backfillado)

---

## 3. Plano de cutover

### 3.1. T-7 dias · Comunicação geral

- [ ] **Marcos** envia comunicado pra equipe pastoral + funcionários:
  > "A partir de [data], toda solicitação criada por funcionários passa primeiro pelo diretor de origem do setor (Eduardo Gestão · Pedro Menezes Criativo · Arthur Serpa Ministerial). Membros não-funcionários não criam solicitação. Demanda de Marketing ganha bloco específico no form com estimativa de prazo automática."
- [ ] Mensagem no grupo de WhatsApp da liderança
- [ ] Documentar regra no Cérebro CBRio

### 3.2. T-3 dias · Treinamento focado

- [ ] **Pedro Paiva e equipe** (15 min) · Marcos demonstra:
  - Kanban (`/marketing`) · 3 origens + drag-and-drop
  - Calendário (`/marketing/calendario`) · capacidade da semana
  - Admin (`/marketing/admin`) · calibrar `esforco_medio_h` após primeiras entregas
- [ ] **Eduardo · Pedro Menezes · Arthur Serpa** (5 min cada) · Marcos demonstra a aba "Aprovar" em `/solicitacoes`
- [ ] **Pastoral + lideranças** (e-mail) · usar campo Marketing no form quando solicitar criativo

### 3.3. T-0 · Soft launch (piloto interno 2 semanas)

- [ ] Apenas a equipe Marketing (Pedro + 4 produtores) usa o Kanban
- [ ] Apenas Marcos cria solicitações de teste pra calibrar
- [ ] Pedro preenche `esforco_medio_h` das 8 etiquetas baseado em cycle time real (`/marketing/admin` aba Etiquetas)
- [ ] Monitorar:
  - Tempo médio de aprovação dos 3 diretores (Analytics)
  - Volume de cards/semana (esperado 5-10)
  - Cards atrasados / fila acumulada (`MKT-DEM-CAP > 100%`)
  - Bugs/feedback da equipe

### 3.4. T+14 dias · Abrir pra igreja

- [ ] Comunicado oficial · todo funcionário pode solicitar via `/solicitacoes`
- [ ] Solicitação anterior via WhatsApp/e-mail é proibida (registra audit log)
- [ ] **Marcos monitora gargalo do Arthur Serpa** (80% das demandas são ministeriais conforme contexto operacional) · escalação automática vai pra Fase 11 se virar problema real

---

## 4. Pendências conhecidas (deferred · Fase 11)

| Item | Detalhe |
|---|---|
| **Aline cadastrada** | Não tem profile/email · Pedro/Marcos cadastra via `/marketing/admin` aba Membros quando souber |
| **Escalação automática >24h** | Diretor parado >24h hoje só recebe lembrete diário. Fase 11 pode escalar pra super-admin automaticamente |
| **Modo pico fev/mai** | Capacidade extra reservada · D-08 deferred · Fase 11 |
| **Forecasting automático** | Curva de previsão de fila baseada em throughput · D-08 deferred · Fase 11 |
| **Calibragem `esforco_medio_h`** | Manual pela aba Etiquetas. Auto-calibragem (avg `entregue_em - created_at` por tipo) pode automatizar · Fase 11 |
| **NPS público pós-conclusão** | Hoje NpsBlock só aparece no modal de detalhe da solicitação. Pode virar notificação push com link direto · Fase 11 |

---

## 5. Critérios de "pronto pra abrir pra igreja"

- [x] 15 specs implementadas e mergeadas
- [x] Todas as migrations aplicadas em produção
- [x] Smoke tests automatizados passam
- [ ] Smoke tests manuais (seção 2) · todos checados
- [ ] Piloto interno completou 2 semanas sem incidentes críticos
- [ ] `esforco_medio_h` calibrado nas 8 etiquetas (pelo menos as mais frequentes)
- [ ] Pedro Paiva confirma que módulo está usável sem suporte do Marcos
- [ ] Todos os 3 diretores aprovaram pelo menos 1 solicitação real cada
- [ ] CLAUDE.md atualizado refletindo o estado final

---

*Quando todos os itens da seção 5 estiverem checados, o módulo está pronto pra
substituir o fluxo informal (WhatsApp/e-mail) de demandas criativas na CBRio.*
