# Módulo Marketing — Architectural Decision Records (Fase 5)

> **Status:** v1.0 · 2026-05-28
> **Pré-requisito:** PRD aprovado (`02-prd.md`) · Design aprovado (`03-design-ux.md`)
> **Próxima fase:** Fase 6 — Modelagem de Dados (`05-modelagem-dados.md`)

> Todos os ADRs derivam da escolha **"seguir líderes de mercado"** (Marcos 2026-05-28)
> e do refinamento das decisões D-01 a D-14 em `decisoes-em-aberto.md`.

---

## ADR-001 · Time tracking via Kanban timestamps (não manual)

**Contexto.** Equipes criativas resistem fortemente a apontamento manual de horas
(literatura: timesheets viram dado podre · designers sub-reportam o tempo de
pensar). O motor de capacidade precisa de dado limpo.

**Decisão.** Cycle time derivado automaticamente de `estado_atualizado_em` em
`marketing_kanban_cards` quando um card muda de estado. Sem timesheet.

**Alternativas consideradas.**
- Apontamento manual de horas (rejeitado · adoção morre).
- Tracking automático de tela (invasivo · destrói moral).

**Líderes de referência.** Kanban flow metrics (Businessmap · ProKanban · Teamhood).

**Consequências.**
- ✅ Sem fricção pra equipe.
- ⚠️ Estimativas precisam de 6-8 semanas de dado pra calibrar.
- ⚠️ Mudanças manuais de estado podem distorcer; mitigar com permissão limitada de
  edição retroativa.

---

## ADR-002 · Prazo capacity-based com humano-no-loop → throughput automático no futuro

**Contexto.** Prazo fixo (7 dias pra qualquer arte) é desconectado da realidade da
fila. Prazo calculado precisa nascer da capacidade real.

**Decisão.** No MVP, **estimativa preliminar** calculada no intake + **prazo
confirmado pelo Pedro** após aprovação do diretor de origem. Evolução pra
forecasting automático (D-08) condicionada a 8 semanas + CV cycle time ≤ 30% (Fase 11).

**Alternativas consideradas.**
- Prazo fixo por etiqueta (rejeitado · ignora fila).
- Forecasting automático desde dia 0 (rejeitado · sem dado pra ancorar).
- Sempre humano-no-loop pra sempre (rejeitado · perde escalabilidade).

**Líderes de referência.** Float · Resource Guru · Runn (capacity-based scheduling).

**Consequências.**
- ✅ Prazo realista desde o começo.
- ✅ Pedro mantém controle no MVP (segurança política).
- ⚠️ Pedro vira gargalo se a fila inflar — mitigado pelo volume baixo (5-10/sem).

---

## ADR-003 · Intake via request queue (estende Solicitações existente)

**Contexto.** Solicitações já é o backbone de demanda interna do CBRio (SLA · kanban ·
NPS · alçadas). Marketing precisa de intake estruturado.

**Decisão.** **Estender Solicitações** (D-01) — adicionar Marketing nas áreas
suportadas + campos específicos (etiquetas duplas) quando área alvo = Marketing.
Tabelas de capacidade/calendário/recorrentes ficam separadas, no schema do Marketing.

**Alternativas consideradas.**
- Intake próprio (`marketing_solicitacoes`) paralelo (rejeitado · reinventa SLA/Kanban/NPS).
- Marketing fora do Solicitações (rejeitado · perde unificação do backbone).

**Líderes de referência.** Adobe Workfront request queues · Wrike request forms.

**Consequências.**
- ✅ Reuso máximo do backbone.
- ✅ Solicitante usa interface que já conhece.
- ⚠️ Toda mudança no Solicitações reflete no Marketing — coordenar com Matheus.

---

## ADR-004 · Triagem com prioridade + raia rápida (urgência aceita pelo Pedro)

**Contexto.** Quando demanda > capacidade, medir não basta. Precisa de mecanismo de
priorização e de "raia rápida" pra urgências legítimas.

**Decisão (D-05).** Solicitante marca urgente · Pedro **aceita** (raia rápida ·
prioridade alta no Kanban) ou **recusa com motivo** (vai pro fluxo normal · motivo
registrado). Escalação Pedro → Pedro Menezes acontece off-system.

**Alternativas consideradas.**
- Urgência auto-aprovada (rejeitado · "urgente" perderia sentido).
- Aprovação de urgência pela diretoria geral (rejeitado · burocrático).

**Líderes de referência.** Creative Operations Playbook (Kelly Hendricks) ·
Atlassian help desk triage patterns.

**Consequências.**
- ✅ Urgência tem dono claro.
- ✅ Recusa registrada vira dado de "urgência abusiva" pra retro.
- ⚠️ Pedro pode ficar pressionado · escalação off-system serve de válvula.

---

## ADR-005 · Estado "aguardando solicitante" (separa relógio equipe × solicitante)

**Contexto.** Atraso em demanda criativa frequentemente é do solicitante (sumiu
após o briefing, demorou a aprovar revisão). Sem separação, equipe leva a culpa.

**Decisão.** Estado explícito `aguardando_solicitante` no Kanban. Cycle time da
equipe **pausa** durante esse estado. Tempo nesse estado vira KPI próprio.

**Alternativas consideradas.**
- Sem estado separado (rejeitado · equipe leva culpa).
- Notificação simples de "sua vez" sem mudar estado (rejeitado · não fica no dado).

**Líderes de referência.** Wrike proofing workflow.

**Consequências.**
- ✅ Maior ROI político: prova com dado quando o atraso não foi da equipe.
- ✅ Cycle time da equipe fica limpo.
- ⚠️ Solicitantes podem "esquecer" cards lá · mitigado com notificação 24h.

---

## ADR-006 · Aprovação hierárquica TRANSVERSAL no Solicitações (3 diretorias)

**Contexto (D-04).** Solicitações hoje vai direto pra área alvo. Marcos quer
controle hierárquico: solicitação passa pelo diretor de origem do solicitante antes.

**Decisão.** Mudança **transversal** no Solicitações (afeta TODAS as áreas, não só
Marketing) — vai como **spec 001**, anterior às específicas do Marketing.

3 diretorias apenas (Marcos 2026-05-28): Gestão (Eduardo) · Criativo (Pedro Menezes)
· Ministerial (Arthur Serpa). Cada `profile.area` mapeada a uma delas.

**Dispensas:** diretores do próprio setor · `is_diretoria_geral=true` (Pedrão ·
Juninho · 3 diretores) · fallback super-admins se faltar mapping.

**Alternativas consideradas.**
- Sem aprovação (rejeitado · Marcos quer controle).
- Aprovação opcional por área (rejeitado · inconsistente).
- N diretores por setor (rejeitado · Marcos definiu só 3).

**Consequências.**
- ✅ Liderança tem visibilidade do que vai pra fila.
- ⚠️ Possível gargalo no Arthur (80% das demandas) — monitorar.
- ⚠️ Mudança afeta cozinha, manutenção, financeiro, etc — testes obrigatórios.

---

## ADR-007 · Kanban unificado com 3 origens (solicitação · evento · interna)

**Contexto (D-02).** A capacidade real da equipe é a soma do trabalho REAL,
independente de onde veio.

**Decisão.** Um único Kanban Marketing. Campo `origem` em `marketing_kanban_cards`
com 3 valores: `solicitacao` · `evento` · `interna`. Cada um aponta pra FK
correspondente (ou nenhum, se interna).

**Alternativas consideradas.**
- Dois Kanbans separados (rejeitado · "duplicação invisível" · calendário mente).
- Kanban só pra solicitações (rejeitado · ignora trabalho de evento e interno do Pedro).

**Consequências.**
- ✅ Capacidade reflete realidade.
- ✅ Pedro pode criar tasks proativas (campanha · série · identidade) sem passar por
  Solicitações.
- ⚠️ UI precisa identificar origem de forma clara · resolvido com badge no card.

---

## ADR-008 · Tags de habilidade no profile (não subáreas formais)

**Contexto (D-03).** Equipe pequena (5 pessoas) com habilidades distintas
(videomaker · fotografo · designer · social · social_assistente). Subáreas formais
criariam silos.

**Decisão.** Tabela `marketing_membros` com `profile_id + habilidade + horas_semanais`.
Todos mantêm cargo genérico `assistente-marketing`. Roteamento por habilidade da
etiqueta tipo (`marketing_etiquetas_tipo.habilidade_padrao`).

**Alternativas consideradas.**
- Cargos por subárea (`marketing-design`, `marketing-conteudo`, etc) — rejeitado ·
  infla árvore de cargos · cross-functional perde.
- Sem habilidades (todos fazem tudo) — rejeitado · roteamento manual é overhead pro Pedro.

**Líderes de referência.** Cross-functional in-house creative team patterns
(Wonderful · Creative Operations playbooks).

**Consequências.**
- ✅ Flexibilidade pra equipe pequena.
- ✅ Roteamento automático sem cargo separado.
- ✅ Marcos pode editar habilidade na admin sem migration.

---

## ADR-009 · Etiquetas DUPLAS (tipo × destino)

**Contexto (Marcos 2026-05-28).** Classificação só por tipo (Artes/Vídeos) perde a
dimensão de contexto (Interno/Externo/Campanha). Solicitante quer dizer "Arte
Interna" ou "Vídeo Institucional".

**Decisão.** Duas tabelas separadas: `marketing_etiquetas_tipo` (8 valores) e
`marketing_etiquetas_destino` (5 valores). Card tem dois FKs.

**Alternativas consideradas.**
- Uma tabela com combinações pré-feitas (rejeitado · 40 linhas redundantes).
- Tags livres (rejeitado · sem analytics).
- Só tipo (rejeitado · perde dimensão de destino).

**Consequências.**
- ✅ Analytics por dois eixos.
- ⚠️ UI tem dois selects · simplificar com sugestão.

---

## ADR-010 · Storage SharePoint via Microsoft Graph (D-09)

**Contexto.** Arquitetura 3 camadas do CBRio: Supabase=vivo · SharePoint=arquivos ·
Obsidian=inteligência. Marcos confirma: arquivos entregues no SharePoint.

**Decisão.** Entregáveis fazem upload via Microsoft Graph (mesma stack já usada
pelo Cérebro CBRio). Banco guarda só `sharepoint_path` + `sharepoint_item_id` em
`marketing_entregaveis`. Solicitante baixa via aba de Solicitações com signed URL
ou link direto (validar RLS da biblioteca).

**Alternativas consideradas.**
- Supabase Storage (rejeitado · custo cresce · não coerente com arquitetura).
- Link externo Drive/Frame.io (rejeitado · perde controle e auditoria).

**Consequências.**
- ✅ Reuso de stack existente (Graph já configurado).
- ✅ Cérebro pode indexar entregáveis no futuro.
- ⚠️ Latência de upload depende de Graph · retry exponencial obrigatório.

---

## ADR-011 · Revisão hard-limit de 1× · vai pro fim da fila (D-14)

**Contexto (Marcos 2026-05-28).** Cultura da equipe é "pediu→entregou→acabou".
Permitir N rodadas de revisão incentiva briefing ruim.

**Decisão.** `tem_revisao boolean` em `marketing_kanban_cards`. Botão "Sugerir
revisão" aparece **1 vez** (some após uso). Quando solicitada, card volta pra
`em_producao` E `ordem_fila` é atualizada pro fim da fila (despriorizado).

**Alternativas consideradas.**
- N rodadas com contador `revisao_n` + alerta em N=3 (rejeitado · cultura não casa).
- Sem revisão (rejeitado · casos legítimos existem).

**Consequências.**
- ✅ Incentiva briefing bom de início.
- ✅ Schema simples (boolean, não contador).
- ⚠️ Solicitante pode reclamar do hard-limit · documentar como regra cultural.

---

## ADR-012 · KPIs do módulo alimentam OKR (D-06)

**Contexto (Marcos 2026-05-28).** *"Tudo que metrificarmos nesse módulo deve
alimentar os OKR dos quadrantes de marketing"*.

**Decisão.** 4 KPIs novos (`MKT-PRAZO` · `MKT-DEM-CAP` · `MKT-LEAD` ·
`MKT-THROUGHPUT`) registrados em `kpi_indicadores_taticos` com `area='marketing'`.
KPIs `ADM-C-*` existentes (3 SLA + 3 NPS criativo) passam a ter dado real.

**Periodicidade:** semanal pra todos os 4 novos. Triggers SQL pra recálculo
real-time (mesmo padrão do `kpiAutoCollector.js`).

**Valor na matriz NSM (mandala):** `valores='{}'` (não entra na mandala · KPI
operacional · fica em `/minha-area` e `/painel-area/marketing`).

**Consequências.**
- ✅ Mesmo padrão de outros módulos.
- ✅ Cascateamento automático.
- ⚠️ Definir `meta_valor_absoluto` por KPI antes do go-live.

---

## Checklist de validação

- [x] Stack herdada e justificada (sem novas tecnologias)
- [x] 12 ADRs documentados, cada um com decisão + alternativas + consequências
- [x] Custos validados (zero novo provedor)
- [x] Padrões definidos (Kanban timestamps · capacity-based · request queue · raia rápida · aguardando_solicitante · 3 origens · tags habilidade · etiquetas duplas · SharePoint · revisão 1x · KPIs OKR)
- [x] Estratégia de observabilidade clara (KPIs auto-coletados + audit log padrão)
- [x] CI/CD herdado do CBRio (deploy autônomo · branch dedicada · PR+merge)
- [ ] Aprovado pra Fase 6

Marcos aprova esta versão em: ___ (data)
