# Módulo Marketing — Decisões em aberto (tracker)

> **Contexto criado em 2026-05-27 · atualizado em 2026-05-28.** Tracker das decisões
> estratégicas do módulo. Marcos fechou D-01 a D-12 em batch (D-08 pendente
> esclarecer · pode esperar). Arquitetura derivada das decisões fechadas vive em
> `arquitetura-emergente.md`. As 5 decisões já fechadas em "seguir líderes de
> mercado" estão na seção 6 de `00-metodo-spec-driven-adaptado.md`.

---

## Rastreador

| ID | Pergunta | Status | Síntese |
|---|---|---|---|
| D-01 | Solicitações estendido ou intake próprio? | ✅ fechada (2026-05-28) | Estender + braço pro marketing dentro |
| D-02 | Kanban unificado evento+avulsa? | ✅ fechada (2026-05-28) | Unificado · origem identificada · etiquetas · Pedro pode criar tasks internas |
| D-03 | Subáreas formais ou time genérico? | ✅ fechada (2026-05-28) | Tags de habilidade · equipe inicial: Allan/Aline/Cauã/Lorena Pariz/Letícia |
| D-04 | Quem pode solicitar? | ✅ fechada (2026-05-28 · refinada) | **Todo funcionário** (não membros) · aprovação hierárquica obrigatória do diretor de origem (**mudança TRANSVERSAL no Solicitações**) |
| D-05 | Quem aprova urgência? | ✅ fechada (2026-05-28) | Pedro aceita/recusa com motivo · escalação off-system |
| D-06 | North Star? | ✅ fechada (2026-05-28) | Tudo metrificado alimenta OKR dos quadrantes de marketing |
| D-07 | Prazo preliminar visível pro solicitante? | ✅ fechada (2026-05-28) | Sim · imediato · Pedro confirma depois |
| D-08 | Gatilho do forecasting automático? | ⏳ pendente esclarecer | (ver bloco D-08; pode esperar pra Fase 11) |
| D-09 | Storage dos arquivos? | ✅ fechada (2026-05-28) | SharePoint · responsável anexa · solicitante baixa via aba de Solicitações |
| D-10 | Migrar histórico? | ✅ fechada (2026-05-28) | Começa do zero |
| D-11 | Matriz de permissões? | ✅ fechada (2026-05-28) | Solicitante acompanha via aba Solicitações (não entra no módulo) · restante conforme proposto |
| D-12 | Notificações? | ✅ fechada (2026-05-28) | Todas + 3 novas pro fluxo de aprovação hierárquica |
| D-13 | Recorrentes fixos | reservada Fase 6 | sketch em `arquitetura-emergente.md §3` |
| D-14 | Revisões | ✅ fechada (2026-05-28 · antecipada) | Máx 1 revisão · só se necessário (não é padrão) · vai pro FIM da fila · `tem_revisao boolean` |

---

## Arquitetura

### D-01 · Solicitações estendido OU intake próprio do Marketing?

**Opções.** (A) Estender Solicitações · (B) Intake próprio.

**Decisão final.** ✅ **(A) ESTENDER** (2026-05-28). Marcos: *"estender, usar o módulo
que já existe e criar esse braço pro marketing"*. Tabelas próprias só pra
capacidade/calendário/recorrentes/etiquetas — detalhe em `arquitetura-emergente.md §3`.

---

### D-02 · Kanban unificado ou separado?

**Decisão final.** ✅ **UNIFICADO COM ORIGEM IDENTIFICADA** (2026-05-28). Acréscimos do Marcos:
- **Etiquetas** (tags) por tipo de demanda — vira `marketing_etiquetas`.
- **Pedro cria tarefas internas direto** (origem='interna'), sem passar por Solicitações
  — pra trabalho proativo (campanha, série, identidade) que ele identifica como necessário.

Resultado: `marketing_kanban_cards.origem ∈ {solicitacao, evento, interna}`. Cada card carrega
a etiqueta de tipo + habilidade alvo. Detalhe em `arquitetura-emergente.md §3`.

---

### D-03 · Estrutura da equipe

**Decisão final.** ✅ **TAGS DE HABILIDADE NO PROFILE** (2026-05-28). Cargos continuam
`assistente-marketing` genérico — sem inflar a árvore de cargos.

Equipe inicial:

| Nome | Habilidade |
|---|---|
| Allan | videomaker |
| Aline | fotografo |
| Cauã | designer |
| Lorena Pariz¹ | social_media |
| Letícia | social_media_assistente |

¹ Lorena **Pariz** (Marketing, social media) ≠ Lorena **Andrade** (Integração,
`lider-ministerial`). Não confundir.

Modelo: tabela `marketing_membros (profile_id, habilidade, horas_semanais)`. Vincular
`profiles` via email com `rh_funcionarios`; se não existirem (caso da Letícia /
Lorena Pariz / Cauã), criar como parte do seed (spec dedicada).

---

### D-04 · Quem pode solicitar?

**Decisão final.** ✅ **TODO FUNCIONÁRIO, COM APROVAÇÃO HIERÁRQUICA OBRIGATÓRIA** (2026-05-28 · refinada).

Marcos 2026-05-28 (#1): *"as solicitações sempre passam pelos diretores de área —
Pr.Wesley solicitar → Arthur Serpa (diretor ministerial) aprovar → marketing"*.

Marcos 2026-05-28 (#2, refinamento): *"membros não fazem solicitações"* — restringe
a usuários com vínculo `rh_funcionarios` ativo. RLS bloqueia POST
`/api/solicitacoes` se `current_user_funcionario_id() IS NULL`.

**Impacto.** É **mudança transversal no Solicitações** — afeta TODAS as áreas (cozinha,
manutenção, financeiro, etc), não só Marketing. Marcos: *"isso temos que mudar no
módulo de solicitações primeiro"*. Vai como **spec 001** (anterior às specs específicas
do Marketing). Detalhamento em `arquitetura-emergente.md §2` (schema delta) e §8 (spec).

**Regras chave:**
- Solicitante de setor X → solicitação vai pro diretor de X primeiro (`setor_diretor` mapping).
- Setores confirmados: Gestão → Eduardo · Criativo → Pedro Menezes · Ministerial → Arthur Serpa.
  **Outros setores: a confirmar** com Marcos (pendência #1).
- **Dispensam aprovação** (auto-aprovada · `aprovacao_origem_status='dispensada'`):
  solicitante = diretor do próprio setor · solicitante tem `is_diretoria_geral=true`.
- **Diretor rejeita** → solicitante notificado com motivo · status `rejeitada` · imutável
  (não reabrir · cria nova com ajustes · pendência #5).

---

### D-05 · Quem aprova urgência?

**Decisão final.** ✅ **PEDRO ACEITA/RECUSA COM MOTIVO** (2026-05-28). Escalação
Pedro → Pedro Menezes acontece off-system (WhatsApp). Sistema só precisa da aba
de aceite/recusa.

Schema: `urgencia_decisao` enum + `urgencia_decidida_por` + `urgencia_motivo_recusa`.

**Ordem.** Urgência é decidida pelo Pedro **DEPOIS** da aprovação do diretor de
origem. Se diretor rejeita, urgência nem é considerada.

---

## Medição

### D-06 · North Star

**Decisão final.** ✅ **TUDO METRIFICADO ALIMENTA OKR DOS QUADRANTES DE MARKETING**
(2026-05-28). KPIs `ADM-C-*` existentes (SLA + NPS criativo) passam a ter dado real
assim que o módulo entrar no ar. KPIs novos propostos em `arquitetura-emergente.md §7`:
MKT-PRAZO · MKT-DEM-CAP · MKT-LEAD · MKT-THROUGHPUT.

---

### D-07 · Prazo preliminar visível pro solicitante?

**Decisão final.** ✅ **SIM, IMEDIATO** (2026-05-28). Campo `prazo_preliminar`
calculado no submit (lê capacidade atual + tipo da demanda); `prazo_confirmado`
preenchido pelo Pedro depois da aprovação do diretor de origem.

Observação: o `prazo_confirmado` final reflete o tempo entre solicitação e
aprovação do diretor. Se ficar 3 dias na fila do diretor, o prazo final fica 3 dias
maior. Comportamento esperado.

---

### D-08 · Gatilho do forecasting automático · ⏳ PENDENTE

**Reexplicação simples (depois do "não entendi" do Marcos).** Hoje decidimos que o
prazo final é confirmado pelo Pedro (porque o sistema ainda não conhece a velocidade
real da equipe). Conforme o sistema usa, ele acumula tempo real de cada tipo de
tarefa (cycle time). Em algum momento ele pode calcular sozinho: *"85% de chance de
ficar pronto até 12/06"*. Aí Pedro só intervém em casos atípicos.

**Pergunta.** Quando soltar o automático?
- (A) Nunca · Pedro confirma todo prazo pra sempre.
- (B) Quando houver dado consistente · gatilho objetivo: 8 semanas de uso + desvio padrão / média do cycle time ≤ 30%.

**Recomendação Claude.** (B) — auditável. Mas **não bloqueia nada agora**: fica pra
**Fase 11 (operação)**. Default no MVP: humano-no-loop sempre.

**Decisão final.** ___ (pode esperar pra Fase 11)

---

## Operação

### D-09 · Storage dos arquivos entregues

**Decisão final.** ✅ **SHAREPOINT** (2026-05-28). Marcos: *"quando terminada a
demanda o responsável anexa na solicitação, e esse documento aparece pra ser baixado
no módulo de Solicitações do solicitante, sendo salvo no SharePoint"*.

Schema: tabela `marketing_entregaveis (card_id, sharepoint_path, sharepoint_item_id,
nome_arquivo, ...)`. Upload via Microsoft Graph (mesma stack do Cérebro CBRio).

---

### D-10 · Migrar histórico

**Decisão final.** ✅ **COMEÇA DO ZERO** (2026-05-28).

---

## Permissões & Notificações

### D-11 · Matriz de permissões/visualização

**Decisão final.** ✅ **CONFORME PROPOSTO + AJUSTE** (2026-05-28). Marcos: *"o
solicitante deve acompanhar pela aba de solicitações, o restante pode ser assim"*.

Ajuste: **solicitante NÃO entra no módulo Marketing diretamente** — acompanha pela
aba de Solicitações que já existe pra ele (não precisa de UI nova nem permissão no
módulo Marketing). Matriz completa em `arquitetura-emergente.md §5`.

---

### D-12 · Notificações

**Decisão final.** ✅ **TUDO + 3 NOVAS** (2026-05-28). Marcos: *"concordo"*.

Adicionadas pelo fluxo de aprovação hierárquica (D-04):
- Nova solicitação aguardando aprovação → diretor de origem.
- Aprovada pelo diretor de origem → solicitante + responsável da área alvo.
- Rejeitada pelo diretor de origem → solicitante (com motivo).

Lista completa em `arquitetura-emergente.md §6`.

---

## Reservadas pra Fase 6 (Modelagem)

### D-13 · Compromissos recorrentes fixos

Sketch preliminar em `arquitetura-emergente.md §3` (tabela
`marketing_compromissos_recorrentes`). Fechar na Fase 6.

### D-14 · Revisões · ✅ Fechada antecipadamente (2026-05-28)

**Decisão final.** ✅ **MÁXIMO 1 REVISÃO POR SOLICITAÇÃO · NÃO É PADRÃO DE PROCESSO**.

Marcos 2026-05-28: *"geralmente nenhuma, é pedido, é respondido, acaba ai. Pode
colocar uma opção de sugerir revisão nas solicitações de marketing de 1 vez no
máximo, mas não é padrão de processo, só se houver necessidade (e geralmente não
tem), e caso seja solicitado a revisão, vai para o fim da fila de demandas"*.

Tradução técnica:
- Schema: `tem_revisao boolean DEFAULT false` em `marketing_kanban_cards` (não
  `revisao_n smallint`).
- UI: botão "Sugerir revisão" no preview do solicitante · aparece **1 vez** (some
  depois de marcado).
- Comportamento: card volta pra `em_producao` E vai pro **fim da fila** (campo
  `ordem_fila bigserial`).
- Sem alerta automático (volume baixo · regra hard de 1x).

Implicação cultural: incentiva briefing melhor no início da solicitação.

---

## Pendências menores

### Resolvidas em 2026-05-28

1. ✅ **Mapeamento setor → diretor.** **Apenas 3 diretorias**: Gestão → Eduardo
   Gnisci · Criativo → Pedro Menezes · Ministerial → Arthur Serpa. Todo
   **funcionário** se enquadra em uma das 3 (mapear cada `profile.area` existente
   pra uma delas na implementação). Marcos: *"todos os pedidos de funcionário devem
   passar para aprovação do superior direto (um desses)"*.

2. ✅ **Pastores seniores que solicitam.** Pulam aprovação. Marcos: *"os próprios
   diretores e o pedrão e juninho pulam isso"* (via `is_diretoria_geral=true`).

3. ✅ **Diretor de origem ausente/de férias.** Fallback pros **super-admins**
   (Marcos + Matheus) recebem + alerta. Marcos: *"pode ser para os admins"*.

4. ✅ **Pedro cria task interna no Kanban.** Etiqueta e atribuição **não
   obrigatórias** — mas Pedro **pode (e deve poder)** preencher ambas. Marcos: *"ele
   deve poder colocar a etiqueta e atribuir a algum dos seus colaboradores, e ele
   cria task direto no marketing não em solicitações"*. Reforça que origem='interna'
   nasce direto no `/marketing`, **fora do fluxo de Solicitações**.

5. ✅ **Solicitação rejeitada pode ser reaberta?** **Não.** Marcos: *"não, não
   pode reabrir"*. Solicitante cria nova com ajustes. Histórico imutável.

### Também resolvida em 2026-05-28

6. ✅ **Membros não-funcionários que solicitam.** **Não acontece.** Marcos:
   *"membros não fazem solicitações"*. Apenas **funcionários** (vínculo
   `rh_funcionarios` ativo) podem criar solicitação. RLS bloqueia POST
   `/api/solicitacoes` se `current_user_funcionario_id() IS NULL`. Não há fallback
   porque não há solicitante sem vínculo de funcionário.

---

**Todas as 14 decisões estratégicas + 6 pendências menores estão fechadas.** Só
D-08 (gatilho do forecasting automático) fica reservada pra Fase 11, default =
sempre humano-no-loop. Próximo bloqueio do PRD: dado do **discovery interno**
(taxonomia de demanda, esforço médio, recorrentes, ciclos de revisão).
