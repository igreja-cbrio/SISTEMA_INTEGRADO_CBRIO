# CLAUDE.md

Guia operacional para o Claude Code quando trabalhar neste repositório.

## Grupos · aba Visitas (agendar + registrar) + guards por módulo (2026-06-10)

Marcos: abas do `/grupos` centralizadas (estouravam a largura) e a aba
**Tarefas** virou **Visitas** — supervisores, coordenadores e os donos do
módulo (Pr. Nélio + Natasha) **programam** e registram visitas aos grupos de
conexão. Botão **"Agendar visita"** em toda página de grupo; filtro **"Sem
visita há 2+ meses"** na aba; `/grupos?tab=visitas` abre direto nela.

- **Reusa a infra da supervisão** (`grupo_supervisao_visitas` +
  `vw_grupos_supervisao` · 20260513140000) — NÃO criou tabela nova. Migration
  `20260610130000`: coluna `status` (`agendada|realizada|cancelada` · default
  `realizada`), `responsavel_id` (FK profiles · quem vai visitar),
  `supervisor_id` nullable, `updated_at`. A view conta `ultima_visita`/
  `visitas_mes_atual` **só com status='realizada'** (agendada futura não zera
  o semáforo) + nova `proxima_visita` (min agendada >= hoje).
- **Backend** (`routes/grupos.js`): `GET /visitas/painel` (grupos + agenda +
  histórico + papel), `POST /:id/visitas` aceita `status`/`responsavel_id`
  (agendar pra outra pessoa → `notificar()` o designado), `PATCH
  /visitas/:visitaId` (concluir/cancelar/reagendar). Coletor
  `grupos.lideres_acompanhados` filtra `status='realizada'`. Cron
  (`notificacaoGenerator.gerarNotificacoesGrupos`) ganhou alerta **agregado
  semanal** "N grupos sem visita há 60+ dias" → módulo grupos.
- **`getMeuPerfilGrupo` agora recebe `req.user`** e dá papel `admin` pra quem
  tem **nível >=3 no módulo grupos** (boost de área) — Nélio/Natasha enxergam
  tudo na supervisão/visitas sem precisar de funcao na hierarquia.
- **⚠️ Guards trocados** (achado de auditoria): rotas de escrita usavam
  `authorize('admin','diretor')` (role/nível global · bloqueava os donos do
  módulo) e várias estavam SEM guard (aprovar/rejeitar pedido — cria membro!,
  remover membro, encontros, materiais). Tudo virou
  `authorizeModule('grupos', N)`: CRUD/aprovações=3 · lançar encontro/
  material=2 · temporadas/supervisor=5. UI esconde remover membro/encontro de
  quem não edita (`podeEditarGrupos`).
- **Frontend**: `GruposVisitas.jsx` (aba + `AgendarVisitaModal` exportado,
  usado no detalhe do grupo). Aba antiga Tarefas (`ProcessosTarefas`) saiu do
  Grupos (segue em Cuidados/NEXT). Abas centralizadas (`flexWrap` + center),
  página 1100→1240px e padding 32→20px, "Validar endereços"→"Endereços",
  bleeds das abas embutidas corrigidos no mobile (`.cbrio-grupos-bleed`).
- ⚠️ Aplicar a migration `20260610130000` antes do merge (o painel e o POST
  com status quebram sem as colunas). APLICADA em prod 2026-06-10.
- **Abas Endereços e Temporadas só aparecem pra quem edita** (`soEditor` +
  filtro por `podeEditarGrupos`; deep-link `?tab=` de não-editor cai em
  Grupos via `tabAtiva`). **QR Inscrição fica visível a todos** — decisão do
  Marcos: qualquer um pode mandar o QR de um grupo quando precisar.

## Eventos · update/delete resiliente + filtro Série por category_id (2026-06-09)

Sintoma recorrente: **"Erro ao atualizar/excluir evento"** mas a mudança
**persistia** (aparecia ao recarregar). Causa: `PUT /events/:id` e
`DELETE /events/:id` (`routes/events.js`) misturavam o **write primário** (que
já commita) com **operações secundárias** num único `try/catch` — uma falha
lateral retornava **500 com o dado já gravado**. Gatilho mais comum no PUT: o
`EventFormModal` sempre manda `date`, então diferença de formato dispara o
recálculo do ciclo, e um `new Date(prazo).toISOString()` numa fase/tarefa com
data inválida estoura `RangeError`. Mesma classe de bug já resolvida só no
`PATCH /:id/status` (tag `patch-status-resilient-v1`). **PR #940** estendeu o
padrão a update/delete:
- **PUT**: só o `update` primário pode retornar 500; recálculo de ciclo (com
  guarda `isNaN` contra data inválida), `audit_log`, `enqueueSync` e o `select`
  pós-update viram **best-effort** (só logam). Resposta = linha atualizada ou,
  se o select falhar, o próprio payload aplicado.
- **DELETE**: cascata de dependências best-effort via helper `safe()`; só o
  `delete` primário de `events` decide sucesso/erro.
- **Frontend** (`Eventos.jsx` `saveEvent`): em erro de servidor numa edição,
  refaz o `GET` e confirma se gravou antes de exibir erro (igual ao
  `toggleEventStatus`). **Regra do módulo**: write primário decide a resposta;
  o resto é best-effort.

**Filtro série vs evento robusto (`routes/cycles.js` `GET /kpis/cross`):** antes
discriminava por `event_categories.name === 'Série'` (string exata, por evento)
→ quebrava com acento/caixa e ao renomear a categoria. Agora resolve o
`category_id` da categoria "Série" **uma vez** (lookup tolerante · `unaccent` +
`lower` via `normalize('NFD')`) e compara por id; o filtro de `concluido` ficou
consistente nos 3 modos (todos/serie/evento). Renomear um **evento** nunca
afeta a classificação (sempre foi por UUID). ⚠️ Não há coluna `slug`/flag em
`event_categories` — a categoria "Série" segue identificada pelo nome
normalizado; renomeá-la pra algo sem relação com "serie" ainda mudaria o
conjunto (improvável · é categoria estrutural). Renomear séries/eventos é
seguro: nada no código depende do nome (tudo liga por `events.id`).

## Bot WhatsApp · Flows — REDESENHO + root cause do bloqueio (2026-06-09)

**ROOT CAUSE do `Integrity requirements not met`:** a **WABA estava BLOCKED por
falta de método de pagamento** (`error 141006`) — NÃO era app não-publicado
(FLOW/APP/BUSINESS = AVAILABLE no `health_status`). Marcos adicionou cartão → WABA
virou AVAILABLE. Resta a trava de integridade de **publicar/enviar Flow**
(139000/4233020), provável **propagação pós-pagamento** (cai em horas/~48h após a
conta ficar 100% conforme). Diagnóstico via scripts (untracked-ish · só ops, não
runtime): `backend/scripts/_publish_flows_existentes.js` (GET `health_status` +
publish dos flows existentes), `_diag_whatsapp.js` (coletas · timestamps em **UTC**,
BRT = −3), `_atualizar_flow_culto.js` (sobe o JSON novo pro flow existente). HMAC,
webhook, campo `messages` e `ia_ativa` estão OK (a msg chega e grava coleta).

**REDESENHO do fluxo (decisões do Marcos · 2026-06-09):**
- **Cadastro de pessoa SAIU do WhatsApp.** O Flow coleta só os **números**
  (frequência + nº de decisões). O cadastro nominal das pessoas que decidiram é no
  **computador** (aba Decisões → Pessoas do `/integracao` · reusa o que já existe).
  `flow-pessoa.json` e o loop `enviarFormularioPessoa`/token `pessoa:` foram
  **REMOVIDOS** · a coleta do culto vira `parseado` direto. `parsed.a_cadastrar` =
  nº de decisões a cadastrar no desktop. `aplicarColetaFlow` (routes/whatsapp.js)
  só cria as submissões templo/kids (não cria mais `cultos_decisoes_pessoas`).
- **Formulário do culto reordenado** (`flow-culto.json` · 1 Flow, 3 telas):
  **Frequência** (presencial + kids) → **Decisões** (presencial + online + kids) →
  **Qual culto?** (dropdown com as datas, no fim). Cultos vão **pré-carregados no
  envio** e a navegação entre telas é **local/instantânea** — por isso 1 Flow é
  melhor que 2 formulários (que pagariam a entrega da Meta 2×; não há latência entre
  telas pra esconder). **Frequência ONLINE removida** do form (vem da API ·
  `online_pico`). **Decisões online** ficam no form mas NÃO viram submissão
  (`cultos_dados_submissoes.ambiente` só aceita templo/kids) → vão na **observação**
  pro coordenador lançar na aba Online. ⚠️ números encadeados entre telas = `type:number`.
- **Mensagens padrão (sem IA · corta latência):** saudação + confirmação
  **personalizadas com o 1º nome** (`whatsappFlowColeta.js`); **FAQ institucional
  por palavra-chave** (`whatsappParser.js` `faqInstitucional()` · horários/endereço/
  missão) responde na hora sem Haiku · IA só pra texto livre com números ou pergunta
  institucional fora do padrão. (Form-trigger `pedeFormulario` já era sem-LLM.)
- `flowsConfigurados()` deixou de exigir `WHATSAPP_FLOW_PESSOA_ID` (só `FLOW_CULTO_ID`).
- ⚠️ **Pra ativar quando a Meta liberar (em ordem):** (1) `node
  backend/scripts/_atualizar_flow_culto.js` (sobe o JSON novo no flow
  `1163668689265932` · precisa `WHATSAPP_ACCESS_TOKEN` no .env); (2)
  `_publish_flows_existentes.js` ou publicar pela UI; (3) **remover
  `WHATSAPP_FLOW_MODE=draft` do Vercel**; (4) redeploy; (5) testar
  ("quero lançar culto" → deve abrir o formulário). Enquanto isso, o bot **já coleta
  por TEXTO** (fallback conversacional).

## Bot WhatsApp · coleta por FORMULÁRIO (WhatsApp Flows · 2026-06-08)

Marcos pediu um **formulário nativo** (WhatsApp Flows) pra facilitar o
lançamento — em vez de digitar "culto das 8:30 - 200". Fluxo desenhado:
líder PEDE pra lançar → bot manda o Flow **Culto** (seletor de culto →
frequência → decisões) → se houver decisões, bot pede os dados de **cada
pessoa que decidiu** (Flow **Pessoa**, em loop) pra ela **entrar na jornada**
(nome, celular, CPF opcional + tipo presencial/online/kids · Kids = dados do
**responsável**, LGPD) → vira coleta `parseado` (fila do coordenador aplicar).

**Decisões de arquitetura (performance + segurança):**
- Flow **navega entre telas localmente** (sem endpoint por tela) → rápido, não
  espera servidor entre campos. Seletor de culto vai **pré-carregado** no envio.
- Webhook responde 200 imediato; processa async. Ao enviar, ack na hora.
- **Atrás de env-gate:** sem `WHATSAPP_FLOW_CULTO_ID`/`WHATSAPP_FLOW_PESSOA_ID`
  o bot fica **idêntico ao de hoje** (texto livre). Só ativa quando os Flows
  forem publicados na Meta e os ids setados no Vercel + redeploy.
- **Sem migration:** estado fica no `whatsapp_coletas.parsed`
  (`{fonte:'flow', culto_id, freq, dec, pessoas:[...], pendentes}`). Mantém a
  **revisão-antes-de-aplicar** (nada entra direto no banco).

**Arquivos:**
- `backend/whatsapp-flows/flow-culto.json` (3 telas) + `flow-pessoa.json` (1 tela
  com campos do responsável `visible` quando tipo=kids). Flow JSON v7.0.
- `services/whatsappFlows.js` · `enviarFlow()` (mensagem interactive type=flow) +
  `flowsConfigurados()`.
- `services/whatsappFlowColeta.js` · orquestra: `pedeFormulario(texto)` (heurística),
  `enviarFormularioCulto()` (lista cultos 14d), `tratarFlowReply()` (roteia por
  `flow_token`: `culto` cria a coleta + dispara loop de pessoas; `pessoa:<id>`
  empilha a pessoa e manda a próxima até `pendentes=0`).
- `publicWhatsapp.js` · webhook agora aceita `interactive`/`nfm_reply`
  (`processarFlowReply`) e, pra líder reconhecido que PEDE lançar, manda o Flow
  em vez da coleta conversacional.
- `routes/whatsapp.js` · `aplicarColetaFlow()` no `POST /coletas/:id/aplicar`:
  usa `parsed.culto_id`, cria submissão(ões) templo/kids (fila `/integracao`) e
  insere cada pessoa em `cultos_decisoes_pessoas` (trigger resolve membro/NSM).
- `scripts/publish-whatsapp-flows.js` · publica os 2 Flows na WABA → devolve os
  flow_id (exige `WHATSAPP_BUSINESS_ACCOUNT_ID` + token com
  `whatsapp_business_management`).

**⚠️ Pra ativar (ordem):** rodar `node backend/scripts/publish-whatsapp-flows.js`
→ setar `WHATSAPP_FLOW_CULTO_ID` e `WHATSAPP_FLOW_PESSOA_ID` no Vercel → redeploy.
**Limitações v1 (refinar no teste E2E):** Flow JSON v7.0 precisa validar no
publish (pode pedir ajuste de versão/sintaxe); reentrega de resposta de PESSOA
não tem dedup por message_id (só a do CULTO tem); frequência online (pico) não
vira submissão (só as decisões online viram pessoa). `pessoas[]` no parsed.

## Bot WhatsApp · agente IA conversacional + institucional (2026-05-27, 2ª PR)

Evolução do bot passivo: agora tem **2 personas** (Claude Haiku nas duas).
Migration `20260527150000_whatsapp_agente_ia.sql`.

**Persona 1 · líder/assistente cadastrado → coleta CONVERSACIONAL (multi-turno):**
- Entende texto livre, mescla com o que já coletou, **pergunta o que faltou**
  (campos obrigatórios: grupos=presentes+decisões, integração=presencial+decisões),
  tira dúvida de como reportar. Quando completa → status `parseado` (fila).
- Estado da conversa fica numa coleta `status='aguardando_info'` por **7 dias**
  (`JANELA_CONVERSA_MIN`, ajustado 2026-06-08 · era 30 min e fragmentava em 2 cards
  quando o líder mandava frequência e decisões em momentos diferentes). Mensagem
  seguinte do mesmo telefone continua a sessão até completar (aí vira `parseado`).
- Novo status `aguardando_info` no CHECK de `whatsapp_coletas`.

**Persona 2 · número desconhecido → assistente INSTITUCIONAL:**
- Responde sobre a igreja (missão/visão/valores/horários/endereço) usando SÓ o
  conteúdo cadastrado · NÃO coleta dado · coleta logada como `status='ignorado'`,
  `modulo_destino='institucional'`.

**Config editável** (`whatsapp_config`, singleton id=1): `ia_ativa` (toggle
liga/desliga o bot sem mexer no webhook) + `institucional jsonb`
(missao, visao, valores[], horarios, endereco, sobre, instrucoes_extra).
Horários já vêm seedados; resto a equipe preenche em `/admin/whatsapp` aba
Configuração. RLS read integracao/grupos≥1; write service_role.

`whatsapp_lideres` ganhou coluna `papel` (lider/assistente/coordenador · display).

**Backend**: `services/whatsappParser.js` reescrito · `parseConversa()` (merge +
faltando + resposta natural) e `responderInstitucional()`. `routes/whatsapp.js`
ganhou GET/PUT `/config` + `papel` no vínculo. Webhook (`publicWhatsapp.js`)
roteia known→conversa, unknown→institucional, com dedup por message_id e
lookup de sessão aberta (`lider_id + status=aguardando_info + created_at>now-30min`).

## OKR · KR medido pelo KPI (Frente B1 · 2026-06-03)

Marcos: "o KR é pra ser respondido pelo **KPI central** do indicador · **sem entrada manual**;
o que precisar de mais coisa pra preencher, **remove**". Diagnóstico (ao vivo): a cascata de KRs
está OK (1 geral + N área-específicos via `kr_pai_id`+`agregacao_cascata`, **sem duplicata real**),
MAS **0 KRs eram medidos** e só **5 de 29 objetivos** têm KPI com fonte → **83% dos KRs (428/513)**
estão sob objetivos **sem nenhuma medição** (voluntários, grupos, doadores, capelania, NPS…). Marcos
decidiu **NÃO apagar em massa**: ligar os medidos agora + roadmap de dar fonte ao resto.

**B1 (mecanismo · não-destrutivo · migration `20260603220000`):** `kpi_krs.fonte_kpi_id` (→ o KPI
tático que mede o KR). `estrategia.js` `enriquecerKrs()` anexa `realizado`/`kr_status`/`percentual_meta`
do **`vw_kpi_trajetoria_atual`** (cobre KPIs manual + calculado); **KR geral agrega dos filhos medidos**
(avg p/ %). `EstruturaOkr.jsx` mostra "realizado vs meta · no alvo/fora". **Ligados** (12 KRs específicos):
batismo-90d→`X-BAT90`, reunião→`AMI-21/SED-17/BRG-19/ONL-04`, Next-90d→`X-NEXT90` (criei os específicos
do Next nesta migration). ⚠️ Importante: a matriz/painel lê `vw_kpi_trajetoria_atual` (que pega
`kpi_registros` qd `tipo_calculo='manual'`), por isso os KPIs da Frente A aparecem lá.

**PRÓXIMO (B2/B3):** (1) ligar os KRs dos demais objetivos JÁ medidos (frequência cultos, batismo
crescimento…); (2) **triagem de remoção ✅ FEITA** (migration `20260603230000` · Marcos aprovou):
201 KRs não-mensuráveis-por-KPI desativados (`ativo=false`, reversível) — floor "0 X", contagem-de-meses,
processo/cadência e o vago "Make a Difference". Sobram ~316, todos "número vs meta". (3) **roadmap**: dar fonte/coletor aos 24 objetivos sem medição (voluntários,
grupos, doadores, capelania, aconselhamento, NPS…), aí seus KRs passam a ser respondidos. **NUNCA
entrada manual** (decisão do Marcos). Ver `project_okr_kr_medicao`.

## Jornada na NSM · 3 marcos medidos + KRs (Frente A · 2026-06-03)

Marcos: levar os 3 marcos pra matriz/mandala, medidos pela lógica de coorte do tracker.
Metas: **Batismo ≥30%/90d · Next ≥30%/90d · Reunião aceita ≥70%**. Contato (100%) fica no
operacional (não vira KPI · a escalação já existe).

**Achado do audit (consulta ao vivo):** os objetivos já existiam, mas o tático que os media
era **crescimento de volume**, não o % de coorte 90d. E os **KRs (`kpi_krs`) são só texto-alvo,
sem valor medido** e estão **duplicados** (~6-7 cópias/objetivo, resíduo da cascata) — Marcos
levantou isso → **Frente B**. Então, na Frente A:
- **Batismo (obj `ac906f19`) e Next (obj `68c17f72`):** CRIADOS táticos de coorte por área
  (`AMI/BRG/ONL/SED-BAT90` e `-NEXT90` · `valores=['seguir']` · mensal · meta 30 ·
  `tipo_calculo='manual'` · `fonte_auto` cuidados.batismo_90d_pct/next_90d_pct). O de crescimento
  CONTINUA (métrica diferente, não duplicata).
- **Atendidos (obj `5ffafa58`):** RELIGADOS os táticos existentes (`AMI-21/SED-17/BRG-19/ONL-04`)
  → "% que aceitou a reunião", `fonte_auto='cuidados.reuniao_aceita_pct'`, meta 70 (sem KPI novo).
- **KRs:** trocado "1 ciclo NEXT/trimestre" → "Next em ≤90d"; "contato ≤7d" → "aceita reunião".

**Coletores (`kpiAutoCollector.js`):** `cuidados.{reuniao_aceita_pct,batismo_90d_pct,next_90d_pct}`
(coorte mensal por área · helper `cohortNoPrazoPct` cruza `cui_convertidos` × `batismo_inscricoes`/
`next_inscricoes` por membro/cpf/nome, janela 90d). **`coletarTodos` agora passa `area: ind.area`**
ao coletor (retrocompatível) → 1 coletor serve N áreas (não precisa fonte por área).
`tipo_calculo='manual'` → a view lê de `kpi_registros` (que o coletor JS popula). `meta_valor_absoluto`
fica NULL nos %s (não normaliza por periodicidade · é %, não volume).

**Migration `20260603190000_jornada_nsm_kpis.sql`.** ⚠️ Aplicar antes do merge; depois rodar o
coletor: `POST /api/kpis/v2/coletar` body `{ fontes: ['cuidados.'] }` (ou esperar o cron diário).

**Frente B (A FAZER · Marcos pediu "rever a lógica dos KR"):** KRs hoje não têm valor/medição
(só texto) e estão duplicados. Projeto: deduplicar + dar fonte/medição a cada KR (ligar ao tático
que o mede via `kpi_krs.kpi_id`, ou marcar 'manual') + `estrategia.js`/gestão mostrar "% atingido
por KR". Começa por um diagnóstico dos 75 KRs (quais medem automático, quais são duplicata, quais
precisam de fonte).

## Jornada do novo convertido · 90 dias + responsabilidade por área (2026-06-03)

Marcos: medir 3 marcos por novo convertido a partir da conversão — **Contato pastoral ≤3d**,
**Batismo ≤90d**, **Next ≤90d** — com a responsabilidade seguindo a **ÁREA DE CULTO** da
conversão. Cadeia: Integração CONTA → Cuidados REÚNE no encontro e PONTUA o destino → **líder
da área** acompanha as fases → **Marcelo Soares** (`supervisor-jornada`) supervisiona de Cuidados
e **cobra** quem não fez o contato. Áreas→líder: AMI→Arthur · Online→Renata · Bridge→Lillian ·
Domingo/Sede→Marcelo. Kids fora (LGPD · não vira convertido).

**Migration `20260603160000_jornada_novos_convertidos.sql`** (aditiva): `cui_convertidos` +=
`area` (ami/bridge/online/sede), `primeiro_contato_em`, `primeiro_contato_por`. Trigger
`tg_cultos_dec_pessoas_to_cuidados` recriado pra gravar `area` (online se a decisão foi online;
senão pelo nome do tipo de culto). Backfill da `area` pelos cultos existentes (+ override 'online'
via `cultos_decisoes_pessoas`).

**Backend (`routes/cuidados.js`):**
- `agendar-encontro` e o novo `registrar-contato` carimbam `primeiro_contato_em` na 1ª vez (SLA 3d).
- `GET /cuidados/jornada-convertidos?area=` → convertidos com os 3 marcos (status semáforo:
  feito/no_prazo/vencendo/atrasado/inscrito) + resumo (% por marco). Cruza `batismo_inscricoes`
  + `next_inscricoes` por membro/cpf/nome (paginado p/ o cap de 1000).
- `registrar-contato` deixa o líder marcar o contato sem precisar agendar a reunião ainda.

**Escalação (`notificacaoGenerator.js` · `gerarNotificacoesJornadaConvertidos`):** sem contato
em ~2 dias → notifica o **módulo da área** (líder); >3 dias → também notifica **cuidados**
(Marcelo cobra). Dedup por convertido/dia. ⚠️ pra mirar Arthur/Renata/Lillian, configurar os
destinatários dos módulos `ami`/`bridge`/`online` em `/admin` (NotificacaoRegras) · senão cai
no fallback admin.

**Frontend — componente reusável `src/components/JornadaConvertidos.tsx`** (3 marcos semáforo +
% no topo + filtros + botão "marcar contato"), montado em:
- **Cuidados** aba **"Primeiros passos"** (cockpit do Marcelo · todas as áreas + filtro).
- **`/ami` e `/bridge`** (PainelArea) e **`/online`** (Online.tsx) → filtrado pela área
  (Arthur/Lillian/Renata veem só a sua gente).
- **Integração** aba **"Next"** (`view="next"` · cobertura do Next em 90d, todas as áreas).
- `api.js`: `cuidados.jornadaConvertidos` + `cuidados.convertidos.registrarContato`.

**Next em Integração:** decisão do Marcos = aba de **cobertura/funil** reusando `/api/next`
(o módulo `/next` standalone continua pro admin de eventos). **Fase 2:** formalizar os 3 marcos
como **KPIs na matriz/NSM** (hoje os % já aparecem no tracker, mas fora da matriz).

⚠️ **Aplicar a migration `20260603160000` antes do merge.**

## Cuidados · Encontro pastoral + Encaminhamento da jornada (2026-06-03)

Marcos: na aba **Convertidos** (`/ministerial/cuidados`), (1) filtro **"Já atendidas"**;
(2) o encontro pastoral vira registro real (data + **hora** + **quem vai atender** +
**compareceu**); (3) o **desfecho** encaminha a pessoa pros próximos valores
(**Jornada 180 / Grupos / Voluntários**) e cada área recebe numa **caixa de entrada**
onde registra contato + **devolutiva** (Pendente/Não respondeu/Em dúvida/Engajou/Sem
interesse). É a **amarração conversão→valores** que faltava (alimenta o NSM · ver
`project_jornada_gaps`).

**Decisões do Marcos (travadas):** SEM opção "não se converteu" (não interrompe o
fluxo, qualidade de entrada é da Integração · NÃO mexe em trilha/NSM); **sem rótulo de
dor** (guarda a *direção*, não o *diagnóstico* · motivo sensível só em observação
discreta); **toda pessoa sai com ≥1 encaminhamento**; o "primeiro contato" (encontro)
é o diferencial → continua sendo **agendado** (data/hora/quem). A tarefa-automática na
aba Tarefas + agenda-da-área foram **descartadas** em favor do registro de contato +
devolutiva na caixa de entrada da área.

**Migration `20260603120000_cuidados_encontro_encaminhamento.sql`** (aditiva · idempotente):
- `cui_convertidos` += `encontro_hora`, `encontro_responsavel_id/nome`, `encontro_status`
  (agendado/realizado/faltou/cancelado), `encontro_compareceu`, `desfecho_em/por/observacoes`.
- `jornada_encaminhamentos` (pessoa×destino · `destino` jornada180/grupos/voluntarios ·
  `valor_alvo` · `status`=devolutiva · encaminhado/recebido/resolvido) + filho
  `jornada_encaminhamento_contatos` (log: data_contato, canal, observacao, devolutiva,
  feito_por · CASCADE, sem soft-delete próprio). Padrão PII: `deleted_at` + whitelist
  `app_soft_deletable_tables()` + RLS contextual **por módulo do destino** (cuidados vê
  tudo; grupos/voluntariado veem o seu) + service_role.

**Backend:**
- `routes/cuidados.js`: `POST /convertidos/:id/agendar-encontro` (notifica o pastor via
  `targetIds`), `…/cancelar-encontro`, `…/desfecho` (cria os encaminhamentos só se
  compareceu + notifica as áreas). Mapa `DESTINO_META` (destino→valor+módulo notif+link).
- `routes/encaminhamentos.js` (`/api/encaminhamentos`, montado no `server.js`):
  `GET /` (?destino=&status=), `GET /resumo`, `GET /:id` (+ log de contatos),
  `POST /:id/contato` (insere + atualiza pai: status=devolutiva, recebido_em na 1ª vez,
  resolvido em engajou/sem_interesse), `PATCH /:id`. Auth **in-handler por módulo do
  destino** (`req.user.granular.modulePerms` · admin/diretor=5) — não usa authorizeModule.

**Frontend:**
- `Cuidados.tsx`: filtros "Já atendidas"/"Aguardando desfecho"; modais
  `AgendarEncontroModal` (data/hora/quem · select de `users`) e `DesfechoModal`
  (compareceu? + destinos `DESTINOS_ENC` + observação discreta); ficha do convertido
  mostra o encontro (data/hora/quem/status) + botões Agendar/Reagendar/Desfecho;
  botões na linha da tabela. Bloco de encontro saiu do `ConvertidoModal` (virou fluxo
  dedicado). Aba **Jornada 180** recebe `<EncaminhamentosInbox destino="jornada180">`.
- **Componente reusável** `src/components/EncaminhamentosInbox.tsx` (lista + dialog com
  log de contato + form de devolutiva) usado nos 3 destinos. Filtros: **A contatar /
  Já atendidos** (recebido_em set · já houve contato) **/ Engajaram / Todos** + contagem no topo.
- **Grupos.jsx**: aba **"Encaminhados"** (`pageTab='encaminhados'` · `destino=grupos`).
- **Voluntariado**: `VolEncaminhados.tsx` + rota `encaminhados` no `index.tsx` + item no
  `VolNavBar` (`destino=voluntarios`).
- `api.js`: `cuidados.convertidos.{agendarEncontro,cancelarEncontro,desfecho}` + namespace
  `encaminhamentos.{list,resumo,get,contato,updateStatus}`.

**Cobertura de batismo (Integração · mesma PR · SEM migration):** trilho **universal** —
todo convertido deve ser chamado pro batismo, a Integração acompanha independente do
Cuidados. `GET /kpis/batismos/cobertura-convertidos` cruza `cui_convertidos` ×
`batismo_inscricoes` (por `membro_id`, CPF ou nome · **paginado** p/ o cap de 1000 do
PostgREST) → card **"Convertidos chamados pro batismo"** na aba Batismos (`Batismos.tsx`):
% batizados + nº inscritos + nº não inscritos + botão "Ver quem falta" (lista dos
pendentes). `api.kpis.batismos.coberturaConvertidos()`.

⚠️ **Aplicar a migration `20260603120000` antes do merge** (APLICADA em prod 2026-06-03).
Follow-ups (próximas PRs): "engajou" cruzar com o sinal real do valor (grupo/voluntário),
fechar-o-loop (aceite na área cria o pedido de grupo / inscrição de voluntário nativos),
funil de analytics encaminhados→aderiram.

## Juninho (presidente) · acesso restrito a 3 telas (2026-06-03)

Marcos: o Pr. Juninho deve ver **só 3 telas** (Dashboard do sistema · Monitoramento
OKR · Dashboard Semanal) pra não se confundir enquanto o time desenvolve o resto.
Manter o **cargo pastor-presidente** (só ele tem), mas rebaixar o acesso —
**sem criar módulo novo** (decisão do Marcos: nada de "lógica morta" que ele perceba
e queira o sistema todo).

**Conta ativa = `juninho.lit@cbrio.org`** (a `juninho@cbrio.com.br` está abandonada
desde abr/2026 · duplicata conhecida).

**Por que mexer no role:** o frontend trata `role ∈ {admin,diretor}` como **admin**
(`isAdmin` em AuthContext) e `itemAllowed`/`sectionAllowed` fazem `if (isAdmin) return
true` → vê tudo ignorando a matriz. Logo, restringir EXIGE rebaixar o role.

**Migration `20260603240000_juninho_presidente_3_telas.sql`:**
1. `profiles.role` `'diretor'→'assistente'` em `juninho.lit@cbrio.org` (+`is_membro_only=false`
   pra cair no `/dashboard`, não no webapp de devocional). **NÃO** toca o cargo →
   `/perfil` segue mostrando "Pastor Presidente". OBS: a CHECK `profiles_role_check` só
   aceita `assistente|admin|diretor` — `'assistente'` é o único role não-admin (não existe
   `'membro'` como role aqui).
2. Zera a matriz do cargo `pastor-presidente` (cargo_id 32 · só o Juninho o tem) → some
   todo item de menu gateado por módulo.

**Mudanças no menu (`AppShell.jsx`) pra deixar exatamente as 3 visíveis:**
- **Monitoramento OKR**: removido o `module: 'painel-cbrio'` → vira **sem-módulo** (igual
  ao Dashboard Semanal). Aparece pro Juninho (e pros demais que veem o menu · benigno, é
  read-only macro). Necessário porque dividia o módulo com o **Painel CBRio**, que precisa
  continuar escondido pro Juninho.
- **Integração** e **Grupos**: GANHARAM `module: 'integracao'`/`'grupos'` (antes eram
  sem-módulo e vazavam pra qualquer não-admin). Agora só aparecem pra quem tem o módulo —
  correção que também os esconde do Juninho.
- **Dashboard Semanal** segue sem-módulo (alvo · aparece). **Dashboard do sistema**
  (`/dashboard`) é o landing pós-login + logo (não é item de menu).

**Dashboard Semanal · aba Financeiro gateada:** `DashboardSemanal.jsx` esconde a aba
Financeiro (que puxa de `/financeiro-v2`, gateado) pra quem não tem `canFinanceiro` —
senão quebraria pra ele. As outras abas (semanal/mensal/média-móvel/kpis/metas/IA) e o
`/monitoramento-okr` puxam de endpoints **authenticate-only**, então funcionam com a
matriz zerada.

**⚠️ Pós-merge (obrigatório):** aplicar a migration → **bust de cache**
(`POST /api/permissoes/cache/bust` ou botão em `/admin/permissoes`) → **Juninho
logout/login** pra renovar o JWT. Sem isso a matriz antiga fica no cache 5 min.

## Permissões · "Acesso base" (role) editável na tela de Usuários (2026-06-03)

Marcos: poder **promover/rebaixar o `profiles.role` sem SQL** (motivado pelo caso
do Juninho, que precisou de migration só pra virar `assistente`). O `role` controla
o `isAdmin` do frontend (`role ∈ {admin,diretor}` → vê o sistema inteiro, ignora a
matriz; `assistente` → segue cargo + áreas + overrides). Antes só dava pra mudar via
SQL direto. **SEM migration** (é `UPDATE` em `profiles` via service_role).

- **Backend** (`routes/permissoes.js`): `PUT /usuario/:id/role` (já sob
  `authorize('admin','diretor')` do topo do arquivo). Valida `role ∈
  {assistente,admin,diretor}` (= CHECK `profiles_role_check` · não existe `'membro'`
  como role). `:id` é o **UUID do profile** (a lista de colaboradores vem de
  `profiles`) → `UPDATE profiles SET role` direto pelo id (não passa por
  `resolverUsuarioId`, que resolve a tabela `usuarios`/int). Anti-autoescalação via
  `bloqueiaAutoEdicao(req, null)` — ninguém muda o próprio acesso base. `bustPermissionCaches()`.
- **api.js**: `permissoes.setRole(id, role)`.
- **Frontend** (`src/pages/admin/Usuarios.jsx`): no diálogo de edição, seção
  **"Acesso base"** (entre Cargo e Áreas) com select assistente/diretor/admin +
  texto explicando que admin/diretor liberam tudo. Estado `role` inicia de
  `colaborador.role` (o `GET /colaboradores` já devolve `role`). `patchColaborador`
  no pai sincroniza lista + diálogo aberto após salvar (o role NÃO vem do
  `GET /usuario/:id`, que lê `usuarios`, não `profiles`).
- ⚠️ Mudar o role **exige logout/login** da pessoa afetada pra renovar o
  acesso no frontend (toast já avisa). É a mesma capacidade do `setCargo` (que via
  boost de área concede nível 5), só que sobre o role — escopo aprovado pelo Marcos.

## Auditoria do sistema (2026-06-08) · correção dos 4 CRÍTICOS

Auditoria ampla do ERP (workflow multi-agente · find → verificação adversarial →
síntese): **29 achados confirmados** (4 críticos · 13 altos · 8 médios · 4 baixos).
Fio condutor: backend roda com `service_role` (bem guardado), mas o **frontend usa a
anon key** e várias tabelas **escaparam das ondas de lockdown de RLS** → acesso direto
ao banco só com a RLS no caminho. Esta entrega corrige **só os 4 críticos**.

**Migration `20260608120000_auditoria_criticos_rls_fn.sql`** (restritiva · idempotente):
- **#1 `usuarios`**: as policies `"Authenticated write/update/delete usuarios"` eram
  `USING(true)`/`WITH CHECK(true)` → qualquer logado editava o próprio `cargo_id` pela
  anon key (**escalonamento de privilégio**). Dropadas; write recriado com
  `is_super_admin()`; SELECT segue aberto (ModuleGuard lê o cargo); `usuarios_service`
  FOR ALL pro backend. + trigger `trg_audit_usuarios` (`audit_log_changes('cargo_id,deleted_at')`).
- **#2 `cui_atendimentos`** (timeline pastoral · PII): a auditoria viu `USING(true)` no
  **arquivo** da migration `20260420151621`, mas a tabela **não existe em prod** (aquela
  parte nunca foi aplicada · drift git↔prod). Então a trava roda **guardada por
  `to_regclass`**: no-op se a tabela não existir, lockdown por módulo (`cuidados`/`integracao`:
  SELECT≥1, INSERT≥2, UPDATE≥3, DELETE só super-admin) se existir. ⚠️ Drift a investigar:
  `notificacaoGenerator.js:519` lê `cui_atendimentos` (tabela ausente) — query latente morta.
- **#4 `fin_metas_progresso`**: a 20260529070000 recriou com 3º param (`p_meta_id` DEFAULT)
  sem dropar a versão `(date,date)` → overload ambíguo (o RPC do Dashboard Financeiro
  podia resolver errado). `DROP FUNCTION ...(date,date)` deixa só a de 3 args.

**Fix #3 (backend, sem migration) — `routes/integracao.js`:** `DELETE /visitantes/:id`
fazia **hard-delete sem authorize** (qualquer logado destruía PII — o endpoint usa
service_role, bypassa a RLS). Agora: `authorizeModule('integracao', 4)` + `app_soft_delete`
(`int_visitantes` já tem `deleted_at` + está na whitelist) + GET `/visitantes` passou a
filtrar `deleted_at IS NULL`.

**⚠️ Aplicar a migration `20260608120000` antes do merge.** Após aplicar, **bust de
cache** de permissões não é necessário (RLS é avaliada no banco), mas o efeito é imediato.
**Restam 25 achados** (13 altos − 1 crítico-virou-fix + …) p/ próximas levas: família de
hard-deletes (devocionais/cultos/grupos/projects/rh), injeção PostgREST em `pessoas.js`
(`.or()` com email cru → `escapePostgrestValue`), cascata de meta sobrescrevendo % (BAT90/
NEXT90), rotas no pool pg (agents/meetings), `/cerebro/status` e webhook do Cérebro sem auth,
API.Bible key hardcoded. Relatório completo arquivado.

### Remediação · em andamento (2026-06-08)
- ✅ **Injeção PostgREST em `pessoas.js`** corrigida (`GET /lookup` + fallbacks
  `int_visitantes`/`next_inscricoes`): `req.query.email` agora passa por
  `escapePostgrestValue` antes de entrar no `.or()` (cpf/tel já eram digit-only).
- ⚠️ **A "família de hard-deletes" NÃO é troca mecânica uniforme** (medido o raio de
  impacto): `cultos` (82 refs em migrations), `kpi_indicadores_taticos` (74),
  `cultos_decisoes_pessoas` (23), `mem_grupo_encontros` (14) são **agregados em
  KPI/NSM** → soft-delete ingênuo deixa a linha "deletada" **continuando a contar**
  (pior que hard-delete). Esses exigem varredura de filtro `deleted_at IS NULL` em
  todos os read-sites + funções SQL — tarefa deliberada, NÃO um swap de 1 linha.
  Seguros pra troca rápida: `rh_documentos` (não agregado) e `projects` (a
  `projects.js` já faz soft-delete → reads já filtram). Os demais aguardam decisão.
- Lição reforçada: validar achado contra o **schema/uso vivo**, não só o arquivo
  (ver o caso `cui_atendimentos`, que nem existe em prod).

### Leva 2 · fixes discretos de auth/secret (2026-06-08 · sem migration)
- **`cerebro.js` `/status`**: era público (vazava estatísticas + resumos de docs) →
  agora `authenticate` + `authorizeModule('cerebro', 1)`.
- **`cerebro.js` webhook**: passa a validar `clientState` (o Graph ecoa o
  `CRON_SECRET || 'cbrio-cerebro'` setado na subscription) — ignora notificação forjada
  (evitava disparo de Graph delta + Haiku por quem chutasse a URL).
- **`online.js` OAuth**: `signState`/`verifyState` falham fechado (sem `CRON_SECRET` não
  assina/valida) — removido o fallback literal `'dev'`. `CRON_SECRET` é env obrigatória
  em prod, então sem efeito lá.
- **`membresia.js` `/totem/next/status`**: `membro_id`/`email` no `.or()` passam por
  `escapePostgrestValue` (injeção PostgREST · cpf é digit-only).
- **`bible.js`** (chave API.Bible hardcoded): fix pronto, mas **em PR separado e
  represado** (módulo devocional é do Matheus). Bloqueado em: setar `BIBLE_API_KEY` no
  Vercel + **rotacionar** a chave exposta `4CAuTct2…` (está no histórico do git → comprometida).
  Mergear só depois disso, senão `/bible` → 503 e o devocional para de puxar o texto bíblico.

### Leva 3 · soft-deletes seguros + medição (2026-06-08 · sem migration)
- **`rh_documentos`** (`rh.js`): hard-delete → `app_soft_delete`; as 2 leituras (docs
  vencendo + lista por funcionário) passam a filtrar `deleted_at IS NULL`. Documentos
  não são agregados em KPI → conversão segura.
- **`projects`** (`revisoes.js` `DELETE /projeto/:id`): a cascata de hard-deletes virou
  `app_soft_delete('projects')` — alinhado com `projects.js` (que já faz soft-delete +
  filtra `deleted_at`). Preserva os filhos e é reversível.
- **`next_90d_pct`** (`kpiAutoCollector.js`): o coletor de coorte agora **seleciona e
  popula `cpf`** no marco `next` (antes consultava `byCpf` sem popular → subcontagem do
  KR/KPI de Next 90d). Match por membro_id/cpf/nome, como o marco batismo.
- ⚠️ **Soft-deletes AGREGADOS pendentes** (NÃO fazer swap ingênuo): `cultos`,
  `kpi_indicadores_taticos`, `cultos_decisoes_pessoas`, `mem_grupo_encontros`,
  `mem_devocionais`, `mem_familias` — exigem varredura de filtro `deleted_at` em todos
  os read-sites + funções SQL antes de converter (senão poluem KPI). Tarefa deliberada.

### Leva 4 · guarda na cascata de meta (OKR/medição · COM migration)
- **Migration `20260608140000_cascata_meta_guarda_percentual.sql`** (CREATE OR REPLACE
  de `aplicar_meta_institucional` + re-run): KPI de **percentual** (`unidade='%'` ·
  BAT90/NEXT90/reunião) **não recebe mais `meta_valor_absoluto` da cascata** — fica NULL
  (a view cai no `meta_valor` = o alvo %). Antes a cascata gravava uma contagem anual
  (baseline×1.3) nesses, e a normalização quebrava o semáforo. Só não estourava por
  acidente (baseline `frequencia_next`=0). A re-run zera o absoluto herrado por engano.
  ⚠️ **Aplicar a migration.** Protege os coorte KRs do funil conversão→batismo/Next.
- **Pendente (OKR/medição · médio):** `_kpi_agregar_dado('batismos'/'novos_convertidos_atend')`
  ignora o parâmetro de área (`20260508170000:91-100`) → baseline igual em todas as áreas.
  Fica pra uma próxima (precisa investigar por que o ramo ignora a área).

### Leva 5 · pool-pg → cliente supabase REST (2026-06-08 · sem migration · PR #920)
O pool pg direto (`utils/db`) **não conecta no serverless do Vercel** (mesma lição do
`fn_monitoramento_okr_raw`). Rotas que liam/gravavam por `db.query()` sem fallback
estavam **quebradas em prod (500)**. Migradas pro cliente `supabase` (REST · service_role):
- **`agents.js`**: `GET /sessions`, `GET /sessions/:id/messages`, `DELETE /sessions/:id`,
  `PATCH /queue/:id/{approve,reject}` e `GET /log` (histórico do chat IA + **reject da fila
  de aprovação do agente financeiro** · eram 500 em prod). `GET /queue` perdeu a tentativa
  pg-first (ia sempre pro fallback). Persist de sessão/mensagens + log de uso idem.
  `dbInsert` virou REST puro; `agent_log.details` é jsonb → passa objeto (sem `JSON.stringify`).
- **`meetings.js`**: rota inteira (`meetings` + `pendencies`) → REST. `participants` (array pg)
  passa array JS nativo; UPDATE/PATCH retornam null se o id não existe (paridade com `RETURNING *`).
- Sem mudança de autorização (guards `authorize`/`authenticate` idênticos · service_role
  bypassa RLS nos 2 canais).
- **`bible.js` #913 MERGED** (chave API.Bible hardcoded removida · `BIBLE_API_KEY` setada no
  Vercel + chave rotacionada · fail-closed 503 se faltar a env).

### Remediação · ainda em aberto (2026-06-08)
Levas 1-5 + bible #913 cobriram os 4 críticos + altos/médios discretos + o pool-pg do
agents/meetings + a chave da api.bible. Resta (heavier · vale sessão dedicada):
- **RLS de `mem_cadastros_pendentes`** (form público com anon insert · alto · exige mover o
  form pro backend `/api/public/*` + migration de lockdown).
- **`_kpi_agregar_dado`** ignora o param de área no baseline de `batismos`/`novos_convertidos_atend`
  (`20260508170000:91-100` · médio · investigar por que o ramo ignora a área).
- **pool-pg restante (baixo)**: `projects.js` (/views, /workload) e `patrimonio.js` (/dashboard
  fallback) ainda usam `query()` — mesmo padrão do agents/meetings, menor impacto.
- **Baixos**: `MEM_QR_SALT` fallback literal (`publicMembresia.js:576` · depende de env, como o
  bible); cron morto/não-timing-safe em `voluntariado-sync.js`.
- **Soft-deletes AGREGADOS** (cultos/kpi_taticos/decisões/encontros/devocionais/famílias) ·
  exigem varredura de filtro `deleted_at` em todos os read-sites + funções SQL (não é swap).

## ⚠️ REGRA GLOBAL · acentuação correta do português do Brasil (SEMPRE)

**Toda vez** que implementar QUALQUER coisa neste sistema (nova feature, fix,
refactor, label, mensagem de toast, placeholder, título, texto de botão, texto
de notificação, e-mail, copy de página, comentário visível ao usuário, etc.),
o texto em português **DEVE** estar com a **acentuação correta do português do
Brasil**. Isso é obrigatório e não-negociável — não regredir.

- Acentos agudos (á é í ó ú), circunflexos (â ê ô), til (ã õ), crase/grave (à),
  cedilha (ç) e trema histórico quando aplicável. Ex.: "você", "usuário",
  "permissões", "configurações", "ministério", "relatório", "ação", "não",
  "está", "três", "código", "horário", "será", "número", "página", "área",
  "índice", "saúde", "também", "responsável", "início", "próximo".
- Vale para **todo texto visível ao usuário** no frontend (`src/`), mensagens
  do backend (`backend/`), e-mails/notificações, e qualquer copy nova.

**Exceção crítica (NÃO acentuar):** identificadores de código e dados nunca
recebem acento — **slugs** de módulo/rota (`permissoes`, `solicitacoes`,
`integracao`, `configuracoes`), **valores de enum** do banco, **chaves de
objeto**, nomes de **variáveis/funções/arquivos**, **colunas** SQL e qualquer
string que seja comparada/persistida como identificador. Acentuar esses quebra
matching, RLS, rotas e o banco. A regra de acentuar vale para o **conteúdo
exibido**, não para os identificadores técnicos.

## Totem Kids · integração com PAGERS físicos (2026-06-02)

Eduardo/Marcos: integrar os pagers que a igreja já usa ao pickup do Totem Kids —
no check-in o voluntário entrega um pager numerado à família; no pickup o sistema
faz **aquele** pager vibrar ("caso vibre, suba para ver sua criança").

**Hardware real (confirmado por foto):** transmissor **LRS Freedom T7470** com
porta **RJ-45 (rede)** + coasters redondos da LRS. (Há também um Retekess TD163 +
coasters R8500, mas a LRS foi escolhida porque o **protocolo é público**: LRSN =
XML sobre TCP, comando `<PageRequest pager="2;NUMERO" color="R" message="Flash5Min"/>`.)

**Arquitetura — agente local (mesmo padrão do Brother/worker financeiro):** o
Vercel serverless não alcança o transmissor físico, então um **agente local**
(`pager-bridge/`, Node puro) roda num PC da recepção, na rede do Freedom. Ele faz
só conexões de **saída** (HTTPS pro backend + TCP pro Freedom) e autentica por
**bearer token** (`PAGER_BRIDGE_TOKEN`) — **não** carrega service_role nem abre porta.

**Migration `20260602140000_kids_pagers.sql`** (ADITIVA · idempotente):
- `kids_pagers` · catálogo de cada pager (`numero` = ID no LRS, `cor` char R/B/G/Y/O/P/W,
  `tipo_lrs` default 2 = Guest, `responsavel_padrao_id`, `ativo`, soft-delete · na
  whitelist `app_soft_deletable_tables()`).
- `kids_checkins.pager_id` · qual pager a família levou (FK SET NULL).
- `kids_pager_envios` · fila de saída que o agente consome (`status`
  pendente→enviado/erro/cancelado, `origem` chamada/rechamada/teste/manual, snapshot
  `pager_numero`/`cor`).
- Trigger `fn_kids_checkout_cancela_pager` · cancela envios pendentes quando a
  criança já saiu (checkout). RLS contextual `current_user_module_level('kids')`
  (read≥1 · write≥3 · delete super-admin · service_role all).

**Backend (`routes/totemKids.js`):** CRUD `/pager/pagers` (kids≥3), `/pager/em-uso`
(quem está com cada pager agora), `/pager/pagers/:id/testar` (enfileira toque de teste),
`/pager/envios` (histórico). No `POST /chamadas` (pickup, já existia e aciona a TV da
sala), se o checkin tem `pager_id` ativo → insere `kids_pager_envios`. Endpoints do
agente (bearer token · bypassam JWT): `GET /pager/bridge/fila` + `POST
/pager/bridge/envios/:id/resultado`. `POST /checkin` aceita `pager_id`.

**Frontend:** nova aba **"Pagers"** em `/admin/totem-kids` (CRUD + cor + vínculo a
responsável padrão + botão "Testar toque" + aviso do agente). No check-in
(`TotemKidsCheckin.tsx`) um select opcional "Pager da família" (lista só ativos e não
em uso). `api.js`: `totemKids.pagers.{list,create,update,remove,testar,emUso,envios}`.

**Agente `pager-bridge/`:** `index.js` (poll da fila → LRSN/TCP → reporta) + `.env.example`
+ `README.md`. Roda com `npm start` (Node 18+). `DRY_RUN=1` testa sem hardware.

**⚠️ Pendências operacionais (não-código):**
- **Aplicar a migration** antes do merge (o backend chama as tabelas novas).
- Definir `PAGER_BRIDGE_TOKEN` no **Vercel** (backend) e no `.env` do agente (mesmo valor).
- Confirmar com a LRS que a **Ethernet do Freedom aceita paging local (NetPage/LRSN)** e
  qual a **porta TCP** (`LRS_PORT`, default 5000 é chute). Se a Ethernet só servir SMS em
  nuvem, habilitar NetPage ou usar um TX-7471 — o comando LRSN já está implementado.

## Monitoramento OKR · aba /monitoramento-okr (2026-06-02)

Marcos pediu uma aba nova na **Inteligência** reproduzindo a planilha
**"CBRio_cabeca_Juninho"** (ótica enxuta do Pr. Juninho · 1 NSM → 9 OKRs em 4
blocos de Área Responsável → ~25 indicadores táticos), que se alimente sozinha
onde já temos dado. **Decisão explícita do Marcos:** NÃO integrar à lógica dos
25 OKRs / 150 KPIs do `/painel` — é uma ótica paralela, só reproduzir e exibir
(não questionar a lógica da planilha).

**Arquitetura (read-only · SEM migration · não toca o sistema OKR existente):**
- **A estrutura fixa da planilha vive no frontend** (`src/pages/MonitoramentoOkr.jsx`,
  consts `NSM`/`BLOCOS`) — textos, alvos, objetivos, área envolvida e memória de
  cálculo exatos da planilha. É o modelo do Juninho, versionado em código.
- **O backend devolve só os VALORES VIVOS** dos indicadores com fonte real
  (`GET /api/painel/monitoramento-okr` em `backend/routes/painel.js`), indexados
  por chave estável em `metricas[chave]`. Indicador sem fonte → o front mostra
  pílula **"manual"** + a memória de cálculo (honesto · a maioria das fontes
  operacionais ainda é nascente — ver abaixo).
- Rota `/monitoramento-okr` (`App.tsx`, lazy) · item "Monitoramento OKR" em
  Inteligência > Visão macro (`AppShell.jsx`, `module:'painel-cbrio'`, ícone
  Compass) · `api.painel.monitoramentoOkr()`. Cache de 5 min (mesmo
  `painelCache` do resto de `/painel`).

**7 indicadores auto-alimentados (colunas verificadas contra o banco em 2026-06-02):**
- **NSM central** (`vw_nsm_painel` segmento='central') = a Estrela do Norte do
  Juninho na veia · hoje 5,9% vs alvo ≥50%.
- **OKR Batismos** = batismos realizados 90d ÷ conversões 90d (`cultos`) · ~14,5%.
- **Nº batismos/mês** (`batismo_inscricoes` status='realizado' · último mês
  completo + média de 6 meses).
- **Tempo decisão→batismo** = avg(`batismo_inscricoes.data_batismo` −
  `mem_trilha_valores`(etapa='conversao')`.data_conclusao`) · ~57d (alvo ≤90).
- **Nº DS online** = soma `cultos.decisoes_online` 90d.
- **% assentos ocupados** = média `cultos.presencial_adulto` do Templo
  (Domingo+Quarta+AMI, exclui Bridge via `vol_service_types.name`) ÷ 1200 ·
  ~30,3% (mesma regra do card de ocupação da Integração).
- **Rotatividade staff** = demissões 12m ÷ ativos (`rh_funcionarios`) · ~2%.

**Manual (sem fonte ainda · mostram alvo + memória de cálculo):** prazo/café/Next,
% grupos, % voluntários, % dizimistas (tabelas `mem_grupo_membros` /
`mem_voluntarios` / `mem_contribuicoes` ainda **vazias** em prod), NPS culto
on/presencial, follow-up online, retenção/compart./cliques YouTube, eficiência
financeira, Q12 (Gallup), treinamentos, cronogramas/orçamentos de expansão.
Quando essas fontes ganharem dado (módulos NPS, grupos, voluntariado,
financeiro, produção), basta **adicionar um ramo no endpoint** + a chave `live`
no tático correspondente em `BLOCOS` — sem mexer na estrutura.

### Ajustes pós-avaliação do Marcos (2026-06-02 · v2)

- **Pílula "manual" removida.** Tático sem fonte mostra só **"—"** (cinza); ao
  **expandir** ele exibe a memória de cálculo + um bloco **"Para puxar automático,
  preciso de: …"** (campo `precisa` no `BLOCOS`) — vira a lista do que o Marcos
  precisa mandar pra cada indicador virar automático.
- **Número inline + cor binária** em todo tático: verde no alvo / vermelho fora
  (`avaliar()` agora retorna só verde/vermelho; sem alvo numérico comparável →
  neutro teal, sem julgar — ex.: "+20% YoY" e "Nº batismos/mês"). NSM e OKR
  idem (binário).
- **Linha clicável → expande** (accordion inline, `ChevronDown` rotativo). Quando
  o indicador tem série, mostra **gráfico de barras mensal** (recharts · 6 meses
  completos) com linha tracejada no alvo. Backend passou a devolver `serie:
  [{mes,valor}]` em `okr_batismos`/`batismos_mes` (batismos/mês), `ds_online` e
  `assentos` (% ocupação/mês). `tempo_batismo`/`rotativ`/NSM ficam só com o número.
- **"Café" → Acompanhamento "1º Encontro"** em todo o 1º OKR (nome + 2 táticos),
  a pedido do Marcos.

### Ajustes v3 (2026-06-03 · "0 vs lógica a criar")

- **Memória de cálculo ("Como medir: Planilha…") REMOVIDA** de todos os táticos
  (a planilha some da visão — o sistema substitui). O campo `memoria` segue no
  `BLOCOS` mas não renderiza mais.
- **4 táticos viraram automáticos** porque a fonte já existe no banco (hoje ~0):
  **% frequência em Grupos**, **% Voluntários ativos**, **% dizimistas regulares**
  (÷ membros ativos · base 328) e **% convertidos atendidos no Acompanhamento**
  (`cui_convertidos.atendido_apos_culto` ÷ conversões 90d). Mostram o **número**
  (0/x% · vermelho fora do alvo) em vez de "—". Backend: 5 queries novas no
  endpoint (base membros ativos + as 4). `addM` já inclui valor **0** (só pula
  null/NaN), então 0% aparece.
- **Distinção pedida pelo Marcos:** **número (incl. 0)** = o sistema já mede ·
  **"—" + "preciso de"** = lógica de automação ainda a criar (NPS culto,
  follow-up online, YouTube, eficiência financeira, Q12, treinamentos, expansão,
  prazo 1º contato, Acompanhamento→Next).
- ⚠️ **Base do %** = `membros ativos` (`mem_membros.status='membro_ativo'`, hoje
  328) — provisório. Quando grupos/voluntários/dízimos começarem a popular,
  confirmar com o Marcos qual é o "total da igreja" certo (a planilha do Juninho
  diz "total de pessoas na igreja", que pode ser > membros ativos).
- **Bloco "Ministerial — Geracionais" REMOVIDO** (2026-06-03 · pedido do Marcos):
  era um bloco de Área Responsável só com a nota do censo e sem OKRs — saiu do
  `BLOCOS`. Restam 3 blocos: Ministerial · Criativo · Operações (+ a NSM no topo).

### 🔴 Fix · endpoint usava pool pg direto (não conectava no Vercel) → RPC (2026-06-03)

**Sintoma:** a aba mostrava "—" em TUDO (até batismos/mês e assentos, que têm
dado). A request `GET /api/painel/monitoramento-okr` devolvia **`200` com
`metricas: {}`** (vazio) em produção — confirmado no DevTools do Marcos. Em
testes locais sempre vinha cheio, o que mascarou o problema por dias.

**Causa raiz:** o endpoint era o **único do `/painel` usando o pool pg direto**
(`query()` de `utils/supabase`, que conecta via `DATABASE_URL`). Esse pool **não
conecta no serverless do Vercel** (o resto do painel usa o cliente `supabase`
REST sobre HTTPS, que sempre funciona). As 15 queries estouravam, o wrapper
`uma()` engolia cada erro e devolvia `metricas` vazio com `200`. Por isso nunca
apareceu dado em prod — só nos testes locais (a máquina alcança o Postgres direto).

**Correção (migration `20260603220000_fn_monitoramento_okr_raw.sql` + `painel.js`):**
- Função SQL **`fn_monitoramento_okr_raw()`** (STABLE SECURITY DEFINER) devolve as
  ~15 métricas em JSONB — **1 query no banco** em vez de 15 no pool.
- O endpoint passa a chamar **`supabase.rpc('fn_monitoramento_okr_raw')`** (mesmo
  canal REST do resto do painel) e monta `metricas` com a MESMA lógica de antes
  (guardas + `addM` + série). Nenhuma mudança de comportamento/valores.
- ⚠️ **Lição:** no Vercel, preferir o cliente `supabase` (REST) a `query()`/pool
  pg em rotas serverless. Se precisar de SQL complexo, encapsular numa função e
  chamar via `supabase.rpc()` (padrão da `fn_grupos_kpis_relatorio`).

### Engajamento de Conteúdo · estrutura no Online + 0 no monitoramento (2026-06-03)

Marcos: os 3 táticos do OKR **"Engajamento de Conteúdo"** (Retenção média ≥40%,
Taxa de compartilhamento ≥5%, Cliques em séries ≥15%) — que viriam da API do
YouTube — devem virar **KPI específico no módulo Online**, com a **estrutura pronta
pra receber** o dado e o `/monitoramento-okr` mostrando **0** (não "—") até a 1ª
coleta. (Exceção explícita à raia "não mexer em outros módulos" — o Marcos avisou.)

**Migration `20260603260000_online_engajamento.sql`:**
- Tabela `online_engajamento` (channel-level **mensal** · `mes` UNIQUE ·
  `retencao_media_pct`/`taxa_compartilhamento_pct`/`cliques_series_pct` ·
  `fonte` default 'manual' · não é PII, sem soft-delete · RLS no padrão das
  `online_*`: `service_role FOR ALL` + `authenticated FOR SELECT`). Um futuro
  coletor da YouTube Analytics faz UPSERT por mês.
- `CREATE OR REPLACE fn_monitoramento_okr_raw()` += chave **`engajamento`** via
  subqueries escalares com `COALESCE 0` → **sempre 1 linha (0 quando a tabela está
  vazia)**, pra a aba mostrar 0 e não "—". Resto da função idêntico.

**Backend:** `painel.js` (monitoramento-okr) destrutura `r.engajamento` + 3 `addM`
(`eng_retencao`/`eng_compartilhamento`/`eng_cliques_series`, '%'). `online.js`:
`GET /engajamento` (authenticate · level 1) devolve o mês mais recente ou zeros.

**Frontend:** `MonitoramentoOkr.jsx` — os 3 táticos ganharam `live`+`alvoNum`+
`cmp:'gte'` (mesmo shape de `freq_grupos`), perderam `memoria`/`precisa` → mostram
**0% em vermelho** (abaixo do alvo). `Online.tsx` — card **"Engajamento de conteúdo"**
(3 `StatCard`: retenção/compartilhamento/cliques) lendo `online.engajamento()`,
com aviso "aguardando API do YouTube". `api.js`: `online.engajamento()`.

**⚠️ A API do YouTube NÃO foi ligada** (retenção até existe por culto em
`cultos.online_retencao_pct_*`; compartilhamento e CTR de séries não têm coleta —
exigem YouTube Analytics custom report). Só a **estrutura** ficou pronta. Pra ligar
de verdade: coletor que faz UPSERT em `online_engajamento` por mês. ⚠️ Aplicar a
migration antes do merge.

## Produção de Culto · aba /producao (2026-06-02)

Marcos: criar aba pra área de **Produção de Culto** com (A) KPIs técnicos
preenchidos POR CULTO (espelhando a Integração) e (B) os KPIs gerais que já
existem (SLA de solicitações + NPS interno).

**Achado que enxugou o trabalho:** `producao` já era área de Solicitações (SLA
24/72 · coord Pedro Fernandes) e os KPIs gerais já existiam — `ADM-C-G-PRODUCAO`
(% no SLA) e `ADM-C-Q-PRODUCAO` (NPS interno). A Parte B só **expõe** isso (não
recria). Ver "OKR Criativo" (`20260512280000`).

**Decisões (Marcos · 2026-06-02):**
- Ocorrências = **log unificado** (tipo técnica/estrutura · descrição = rastro ·
  severidade), não 2 campos soltos.
- Checklist **itemizado** (template editável + marcação por culto → "% executado").
- Pontualidade: duração-alvo **60 min** (`vol_service_types.meta_duracao_min`,
  configurável por tipo no futuro) · observação **SEMPRE opcional** (nunca bloqueia
  salvar, mesmo passando do tempo).
- Os 4 KPIs por culto são **ESPECÍFICOS, não cascateiam**: `is_okr=false`,
  `valores='{}'`, `objetivo_geral_id=NULL`. Aparecem no painel da área mas ficam
  FORA da matriz NSM e da cascata OKR (separação que o Marcos pediu).

**Migration `20260602140000_producao_culto_fundacao.sql`:**
- Módulo `producao` em `modulos` + matriz copiada de `kids` (read universal nível 1).
- Tabelas: `culto_producao` (satélite 1:1 de `cultos` · duração + obs),
  `culto_producao_ocorrencias` (log), `producao_checklist_itens` (template ·
  `service_type_id` NULL = vale pra todos), `culto_producao_checklist` (marcação).
- `vol_service_types.meta_duracao_min int default 60`.
- 4 KPIs `PROD-CULTO-{PONTUAL,CHECKLIST,FALHAS,ESTAB}` (`tipo_kpi='operacional'` ·
  ⚠️ `tipo_kpi` só aceita `qualitativo|quantitativo|operacional`, NÃO `'tatico'` ·
  `tipo_calculo='manual'`, `fonte_auto='producao.*'`).
- Estende `kpi_calcular_valor_auto` com 4 ramos `producao.*` e `kpi_recalcular_para_data`
  passa a cobrir `fonte_auto LIKE 'producao.%'`. Triggers AFTER ROW em
  culto_producao/ocorrencias/checklist → recalc em tempo real (data via lookup).
  Seed de 6 itens de checklist.

**Boost (`backend/middleware/auth.js`):** `AREA_MODULO_BOOST['producao']='producao'`
+ `ROUTE_MODULE_MAP['producao']=['producao']` + `painel-area` inclui producao.
⚠️ pós-migration: atribuir a área "Produção" ao Pedro Fernandes em /admin/permissoes
+ cache bust + logout/login → vira admin nível 5.

**Backend (`routes/producao.js` · `/api/producao`):** `GET /semana?inicio&fim`
(cultos da `vw_culto_stats` + produção mesclada); `GET /culto/:id`; `PUT /culto/:id`
(nível 2 · upsert satélite); `POST /culto/:id/ocorrencias` + `DELETE /ocorrencias/:id`;
`PUT /culto/:id/checklist` (bulk); `GET/POST/PATCH/DELETE /checklist-itens` (template,
nível 3); `GET /acumulado`; `GET /desempenho` (KPIs próprios + SLA + NPS comparativo
via `vw_kpi_trajetoria_atual`).

**Frontend (`src/pages/ministerial/Producao.jsx` · rota `/producao`):** 6 sub-abas —
Preenchimento (calendário semanal + modal: pontualidade, ocorrências, checklist,
obs), Acumulado, Detalhado, Checklists (admin), Solicitações (fila
`area_responsavel='producao'` reusando a API `solicitacoes` · andamento por select),
Desempenho. `api.js` ganhou namespace `producao`. Menu em Criativo (`module:'producao'`).

**Notificações (2026-06-02):** ocorrência crítica (`severidade='critica'`) dispara
`notificar()` urgente (módulo `producao` · responsáveis da área + regras). Módulo
`producao` registrado em `NotificacaoRegras.jsx`. Nova solicitação já é notificada
pelo backbone de Solicitações.

**Intake de Solicitações (2026-06-02 · migration `20260602160000`):** categoria
**`producao`** no form de Solicitações roteia `area_responsavel='producao'` (só campos
básicos · uso: movimentação de material, configuração de equipamentos). CHECK de
`categoria` estendido; SLA da produção já existia (24/72). Backend: `ALLOWED_CATEGORIES`
+ `CATEGORIA_MODULO['producao']='producao'` + `CATEGORIA_TO_AREA_RESP` +
`MODULO_CATEGORIAS`. Frontend: `CATEGORIAS` + `CATEGORIA_HINT` (sem bloco específico ·
validação base titulo+categoria). Isso alimenta a fila da aba Solicitações da Produção
+ o KPI `ADM-C-G-PRODUCAO` (SLA).

## Integração · % de ocupação de assentos na aba Frequência (2026-06-02 · sem migration)

Marcos: card (estilo do de batismo) na aba **Frequência** (`/integracao` →
`VisualizacaoFrequencia.tsx`, value `vis_frequencia`) com a **% média de assentos
ocupados**, **toggle Templo/Kids** + **seletor por culto**.

- **Conta:** `% = média da presença por culto ÷ capacidade`. Como a capacidade é
  constante, isso equivale à média das ocupações por culto. Conta só cultos com
  presença lançada (>0) no modo escolhido (culto sem dado não derruba a média).
- **Capacidades (constantes no código):** Templo **1200** · Kids **250**.
- **Templo** usa `presencial_adulto`; **Kids** usa `presencial_kids` (÷250 · seletor
  só mostra cultos com Kids = Domingo + Quarta).
- **Exclui Bridge e Online** do seletor de Templo (`foraDoTemplo` = regex no nome).
  **AMI entra no Templo** (decisão do Marcos · 2026-06-02). Domingo + Quarta + AMI.
- **100% client-side:** reusa o `cultos.list({data_inicio,data_fim})` que a aba já
  carrega — sem backend, sem migration, sem mudança no `api.js`. Respeita o período
  (3m/6m/12m/2a/5a) já selecionado na aba.
- **UI:** `Armchair` + número grande (`X%`) + média/culto, nº de cultos e capacidade.
  `ocupacao.alvo` faz fallback p/ 'todos' quando o culto selecionado não existe no modo.

## Grupos · aba Relatórios de KPIs (2026-06-02)

Marcos: "crie uma área dentro de grupos que seja possível ver os relatórios de
kpis de grupos, como fizemos em integração... frequência, número de líderes,
número de grupos, satisfação dos líderes e quantidade de líderes em treinamento".

Nova aba **Relatórios** em `/grupos` (`src/pages/ministerial/Grupos.jsx`),
espelhando o estilo de relatório da Integração (`VisualizacaoFrequencia.tsx`):
seletor de período (3/6/12/24 meses) → linha de `StatisticsCard` → gráfico
Recharts de frequência por mês → lista de líderes em treinamento. Respeita o
filtro de **temporada** já presente na página. Read-only (visível a qualquer
nível ≥1 no módulo · não gated por `podeEditarGrupos`).

**5 métricas → fontes reais (todas computadas, não dependem do cache de KPI):**
- **Nº de grupos** · `mem_grupos` ativos (`deleted_at IS NULL`, `ativo=true`)
- **Nº de líderes** · count distinct `mem_grupos.lider_id` dos grupos ativos
- **Líderes em treinamento** · `mem_grupo_membros.funcao='lider_treinamento'` (ativos)
- **Satisfação dos líderes** · último `dados_brutos` com `tipo_id='nps_lideres'`
  (preenchido em /dados-brutos ou módulo NPS · mostra "—" se não houver)
- **Frequência** · `mem_grupo_encontros` + `mem_grupo_encontro_presencas`
  (`presente=true`) · média por encontro + série mensal de presenças

**Modelo de líder (refinamento Marcos · 2026-06-02):** uma só noção de líder = o
**responsável pelo grupo** (`mem_grupos.lider_id`). A única outra função relevante
é **líder em treinamento** (opcional). Por isso o relatório lista nominalmente os
líderes em treinamento (nome + grupo) em vez da distribuição genérica de papéis.

- **Marcar/desmarcar líder em treinamento** · na lista de membros do grupo
  (`Grupos.jsx` detalhe) há a coluna **Treino**: quem edita grupos
  (`podeEditarGrupos`) liga/desliga via `api.setFuncaoMembro(participacao_id, ...)`
  (`'lider_treinamento'` ↔ `'frequentador'`). `GET /:id` passou a devolver `funcao`
  em cada membro.
- **`PUT /membros/:rowId/funcao`** · autorização ampliada (era só
  admin/coordenador/supervisor da hierarquia): agora aceita também quem tem
  **grupos ≥ 3** no módulo (mesma regra do `podeEditarGrupos`), pros líderes de
  área (boost) conseguirem marcar. Ajuste no check do route handler (não em
  `auth.js`/RLS/login).
- **`GET /api/grupos/kpis/lideres-treinamento?temporada=`** · lista os
  `funcao='lider_treinamento'` ativos (nome + grupo) · alimenta o card do relatório
  (`api.lideresTreinamento`). Volume pequeno (sem risco do cap de 1000 linhas).

**Migration `20260602120000_grupos_kpis_relatorio.sql`** (ADITIVA · `CREATE OR
REPLACE FUNCTION` · sem mudança de schema): RPC `fn_grupos_kpis_relatorio(p_temporada
text, p_meses int)` que agrega **tudo numa chamada** (STABLE SECURITY DEFINER).
Motivo de ser RPC e não query no backend: encontros+presenças crescem rápido e
bateriam no **cap de 1000 linhas do PostgREST** (silenciaria a frequência). ⚠️
Aplicar a migration antes do merge (o backend chama a RPC).

**Backend** (`backend/routes/grupos.js`): `GET /api/grupos/kpis/relatorio?temporada=&meses=`
(nível 1 · só `authenticate`) chama a RPC. Colocado **antes de `/:id`** (senão o
Express casa `/kpis` como `/:id`).

**Frontend**: `api.relatorioKpis(params)` em `src/api.js`; componente
`RelatorioGrupos` no fim de `Grupos.jsx`; aba `relatorios` (ícone `BarChart3`)
logo após "Grupos" na barra de abas.

## Batismos · tempo de conversão até o batismo (2026-06-02 · sem migration)

Marcos: mostrar, na área de Batismos (`/integracao` aba Batismos), o **tempo de
conversão até o batismo** — por pessoa (na janela do membro) e uma média geral
em dias de todos os membros batizados.

- **Data de conversão** = `mem_trilha_valores.data_conclusao` da etapa
  `'conversao'` (mesma fonte do "Seguir a Jesus" da Jornada; criada pelo trigger
  quando o visitante decide / decisão de culto vira trilha). **Data do batismo** =
  `batismo_inscricoes.data_batismo`. Dias = `data_batismo − data_conversao`.
- **Backend** (`routes/kpis.js` `GET /batismos`): além de `membro:membro_id(...)`,
  busca em **lote** as trilhas `etapa='conversao'` dos membros vinculados e
  devolve por inscrição `data_conversao` + `dias_conversao_batismo` (campos
  aditivos · `membro` segue com o mesmo shape). Sem migration · sem mudança no
  `api.js` (a lista só ganha 2 campos).
- **Frontend** (`Batismos.tsx`):
  - **Visão geral** · card "Tempo médio de conversão até o batismo" (após os 4
    KPIs, antes do gráfico): média em dias entre os batismos **realizados** com
    conversão registrada, + n de membros, mín e máx. Ignora dias negativos
    (conversão posterior ao batismo = inconsistência).
  - **Por membro** · no `ModalDetalheBatismo`, bloco azul que recalcula ao vivo
    conforme a data do batismo é editada; trata 3 casos (tem conversão+data →
    "N dias"; tem conversão sem data → pede a data; sem conversão na jornada →
    aviso). Só aparece quando a inscrição tem `membro_id`.
- Membros batizados **sem** etapa `conversao` na trilha (ex.: importados direto)
  ficam de fora da média — honesto: só medimos quando há as duas datas.

## Marketing · REDESENHO em fases (2026-05-30) · EM ANDAMENTO

Após feedback profundo do Pedro, o módulo Marketing está sendo redesenhado de
"balcão que decide sozinho" → "mesa de comando do Pedro" (sistema assiste, não
decide). Plano em **6 fases, cada uma 1 PR**. Resumo:

- **Fluxo-alvo:** solicitante pede por **DOR** (não "faça X") → diretor aprova (Spec 001
  segue valendo) → cai na **Triagem** do Pedro → ele decide a solução (pode ≠ pedido),
  cria a **campanha com N cards** (dono + duração-dias + paralela/foco) + os 2 prazos →
  **planner por slots/dia** → produção → revisão (buffer) → entrega.
- **2 prazos:** entrega ao solicitante (na campanha · conservador: simples 3-4 sem ·
  complexa 5-8 sem · Pedro escolhe) × produção interna (no card · deadline do designer).
- **Capacidade vira SLOTS/DIA por pessoa** (não horas) · planner arrastável (barras
  contínuas, máx 3/dia) · recorrentes só contam se `eh_demanda_calendario`.
- **Revisa o que está em prod:** intake cascata (#797), estimativa+piso-7d (#803),
  auto-assign (#806) e padrões por fase (#808) viram **sugestão/triagem**; órfãos no
  Pedro (Spec 023) saem; Pedro fica **fora dos slots** (é gestor).

### Fase 0 · Fundação de dados (`20260530140000_marketing_redesenho_f0_fundacao.sql`)
**ADITIVA · não muda comportamento** (as Fases 1-5 ligam os usos):
- Tabela `marketing_campanhas` (origem solicitacao|evento|interna · solicitacao_id · event_id ·
  titulo · dor_descricao · publico_alvo · complexidade · prazo_entrega · status · RLS).
- `marketing_kanban_cards` += `campanha_id`, `prazo_producao`, `duracao_dias`, `pode_paralelo`.
- `marketing_membros` += `slots_dia` (default 3 · configurável por pessoa).
- `marketing_compromissos_recorrentes` += `eh_demanda_calendario`.
- CHECK de `estado` aceita os novos (triagem/backlog/pesquisa/producao/revisao/concluido)
  **E** os legados (fila/em_producao/aguardando_solicitante · removidos na Fase 3 após remap).
- Soft-delete de campanhas: incluir na whitelist `app_soft_deletable_tables()` na Fase 2
  (quando o delete de campanha existir · evita reescrever a lista grande às cegas agora).

### Fase 1 · Intake por dor (`20260530150000_solicitacoes_marketing_dor.sql`)
O form de `/solicitacoes` (categoria=marketing) deixa de pedir grupo→entregável e passa a
pedir a **dor**: título + descrição (a dor) + **público-alvo** (select) + "tem algo em mente?"
(opcional). A estimativa de prazo saiu do form (o Pedro define na triagem · Fase 2).
- Migration: `solicitacoes` += `mkt_publico_alvo`, `mkt_ideia_inicial` (ADITIVO).
- Backend (`routes/solicitacoes.js` POST): aceita os 2 campos; `marketing_tipo_id`/`destino`
  ficam null no intake (Pedro classifica depois).
- Frontend (`Solicitacoes.jsx`): bloco "Detalhes da demanda (Marketing)" reescrito (público +
  ideia + aviso de 3–8 sem); removidos cascata grupo→tipo, carga de etiquetas, habilidade
  sugerida e estimativa. `MKT_GRUPO_*` → `MKT_PUBLICO_OPCOES`. `marketingValid` = público preenchido.
- Efeito colateral de graça: sem `marketing_tipo_id` no intake, o auto-assign (#806) e a
  estimativa/piso-7d (#803) já não disparam pra solicitações novas (só agiam com tipo). A
  Fase 2 formaliza (trigger cria campanha em Triagem).

### Fase 2 · Triagem + Campanha (`20260530160000_marketing_redesenho_f2_triagem.sql`)
A solicitação-dor aprovada vira uma **campanha em triagem** (não mais card direto). O Pedro
abre a Triagem, define a solução e cria os **entregáveis** (cards de produção).
- Migration: `fn_marketing_cards_solicitacao_sync` recriada → INSERT em `marketing_campanhas`
  (status='triagem') em vez de `marketing_kanban_cards`. Aposenta auto-assign (#806) e
  estimativa/piso-7d (#803). 1 campanha por solicitação (idempotente).
- Backend (`routes/marketing.js`): `GET /campanhas` (filtro status · +solicitante +total_cards),
  `GET /campanhas/:id` (com cards), `PATCH`/`DELETE` (soft via deleted_at), `POST /campanhas/:id/cards`
  (materializa: card origem='interna' + `campanha_id`, estado 'fila'; campanha vira 'ativa').
- Frontend: tela nova **`/marketing/triagem`** (`MarketingTriagem.jsx`, nível 5) — lista campanhas
  em triagem; ao abrir, mostra a dor + complexidade/prazo de entrega + cria entregáveis (etiqueta,
  dono, duração-dias, paralela/foco). Item "Triagem" no `MarketingNav` (só coord). `api.js`:
  `marketing.campanhas.{list,get,update,remove,criarCard}`.
- **Card materializado** nasce origem='interna' + `campanha_id` (o CHECK aceita; evita o UNIQUE
  de `solicitacao_id`) em estado 'fila' (visível na coluna Fila atual; Fase 3 remapeia p/ backlog).
- **Pendente p/ sub-fases:** eventos/ciclo criativo ainda nascem card direto (não triados); o
  solicitante ainda acompanha via card (Fase 3 liga via-campanha); régua de 6 colunas (Fase 3).
- ⚠️ Aplicar a migration antes do merge.

### Fase 2 · ajustes pós-teste (2026-05-30 · `20260530170000_marketing_entregavel_datas.sql`)
- **Intake** (`Solicitacoes.jsx`): bloco Marketing = só o aviso de 3–8 sem (removidos público-alvo e "tem algo em mente"); SLA azul oculto p/ marketing; removido o select "Urgência (sentimento)" (redundante c/ `eh_urgente`). `marketingValid` sempre true.
- **Migration**: `marketing_kanban_cards` += `data_inicio`, `data_fim` (datas de produção do entregável).
- **Triagem** (`MarketingTriagem.jsx`): mostra **a data que o cliente pediu** + **urgência**; cada entregável tem **início+fim** (duração derivada) e mostra o **dono**; **entrega interna** = max(data_fim); o prazo de entrega tem "seguir a data pedida" e, se o Pedro mudar, **o solicitante é notificado** (`PATCH /campanhas` dispara `marketing_prazo_ajustado`).
- **Backend**: `GET /campanhas` e `/campanhas/:id` retornam `data_pedida` + `eh_urgente` (da solicitação) e o `dono_nome` de cada entregável; `POST /campanhas/:id/cards` aceita `data_inicio`/`data_fim`.
- ⚠️ Aplicar a migration antes do merge.

### Fase 4 · fundação da capacidade (slots/dia · 2026-05-30 · SEM migration)
Primeira parte do planner — a régua de **3/dia** já vale na triagem; o calendário arrastável (visual) vem na Fase 4b.
- **Backend** `GET /marketing/capacidade-dia?membro_id&inicio&fim` → ocupação de slots por dia do membro, a partir dos intervalos `data_inicio→data_fim` dos cards ativos (paralela conta 1/dia · foco enche o dia). `slots_dia` vem de `marketing_membros` (default 3).
- **Triagem** (`MarketingTriagem.jsx`): ao definir dono + início + fim do entregável, simula a agenda do dono e avisa **"sobrecarrega em N/total dia(s)"** (âmbar) ou **"cabe (≤ slots/dia)"** (verde). Não bloqueia — o Pedro decide.
- `api.capacidadeDia(membroId, inicio, fim)`.
- **Dias úteis (2026-05-30):** capacidade, aviso da triagem e `duracao_dias` contam **só seg–sex** (fim de semana não consome slot · `getDay()` ≠ 0/6). ⚠️ exceção da Aline (fotógrafa só domingo) fica pra Fase 4b.
### Fase 4b · planner visual arrastável (`/marketing/planner` · 2026-05-30 · SEM migration)
- **`MarketingPlanner.jsx`**: Gantt **mensal de dias úteis** (seg–sex), uma **raia por pessoa**, **barras contínuas** por entregável (`data_inicio→data_fim`) empilhadas em lanes. Navegação de mês + filtro por pessoa. Dias em excesso (> `slots_dia`) ficam **vermelhos**; 🎯 = foco (não paralela). Item no nav só p/ coord.
- **Drag (HTML5 nativo, sem lib):** arrastar a barra pra outro dia/pessoa → recalcula `data_fim` mantendo a **duração em dias úteis** → `PATCH /cards/:id` (otimista). Coluna do drop = `clientX` relativo à raia.
- **Backend:** `GET /marketing/planner?inicio&fim` (membros + barras); `PATCH /cards/:id` agora aceita `data_inicio`/`data_fim`/`pode_paralelo` (admin) e recalcula `duracao_dias`. Helper `diasUteisInclusive` (DRY, POST + PATCH). `api.planner`.
- **Pendente (incrementos 4b):** "levar tudo" (mover campanha inteira), auto-rascunho na triagem, flag recorrente "é demanda de calendário", exceção da Aline (domingo). **Fase 5 (limpeza):** remover `MKT_PUBLICO_OPCOES`/`URGENCIAS` ociosos no intake.

## Marketing · CONSOLIDAÇÃO em 4 abas (2026-05-30 · aprovada) — "Kanban melhor que o Trello"
Reduzir o módulo a **Kanban · Planner · Analytics · Admin**. As outras abas somem e renascem no Kanban: **Triagem**→1ª coluna · **Fila**→ordenação dentro da coluna · **Ciclo Criativo**→ÉPICO de evento · **Calendário**→descontinuado (Planner é o sucessor). Decisões (Marcos): épico = agrupa **cards reais** (subdemanda = card com dono/data/fase, entra no Planner; épico é a visão por fase com %), **NÃO** checklist-style · **tudo é campanha** (1 peça = campanha de 1 entregável). Faseamento: **F-A** 6 colunas → **F-B** triagem no card (remove aba Triagem+Fila) → **F-C** épico (remove Ciclo) → **F-D** limpeza (remove Calendário; recorrentes/detalhe→Planner) → **F-E** acabamento + KPIs.

### F-A · régua de 6 colunas no Kanban (2026-05-30 · SEM migration)
- `MarketingKanban.jsx`: 4 colunas → **6** (Triagem→Backlog→Pesquisa→Produção→Revisão→Concluído), em **scroll horizontal** (estilo Trello). Constante `ESTADOS` ganhou `aceita: []` agrupando o canônico novo + o legado (backlog←fila, producao←em_producao, revisao←aguardando_solicitante) — **sem migration**; o drop grava o canônico novo (CHECK da F0 já aceita os 6).
- Cards ordenados na coluna por **urgente → `ordem_fila`** (absorve a visão da Fila). Card mostra o **prazo de produção** (`prazo_producao`/`data_fim`, fallback no legado); SLA individual passou a contar `producao` também.
### F-B/C/D/E · consolidação completa (2026-05-30 · SEM migration · 1 PR)
- **F-B · triagem no card:** a coluna Triagem lista as **campanhas** (`status='triagem'`); clicar abre o `MarketingTriagemSheet` (extraído de MarketingTriagem, reusável) — complexidade, 2 prazos, criar entregáveis c/ aviso de 3/dia. Nav perde **Triagem** e **Fila**; rotas redirecionam pro Kanban.
- **F-C · épico:** toggle **Quadro | Épicos** no Kanban → `MarketingEpicos.jsx`: campanhas e eventos como épicos expansíveis, cada um com subdemandas (cards reais) + **barra de progresso**; eventos mantêm **batch** (etiqueta/dono por fase) + link Eventos (absorve o **Ciclo**). Nav perde **Ciclo**.
- **F-D:** **Calendário descontinuado** (Planner é o sucessor, slots não horas); nav perde Calendário; rota redireciona.
- **F-E:** deletados os 4 órfãos (`MarketingTriagem/Fila/Calendario/CicloCriativo.jsx`) + lazy imports; **busca por título** no Kanban.
- **✅ NAV FINAL: Kanban · Planner · Analytics · Admin** (+ toggle Quadro/Épicos dentro do Kanban). Telas órfãs = 0.
### Acabamento do card + limpeza · NO AR (PR #828 · 2026-05-30)
- Card: **avatar** (inicial do dono), **mini-barra de progresso** do checklist, **2º prazo** (entrega da campanha) — `enrichCards` agora traz `checklist {feitos,total}` + `campanha {prazo_entrega}`. Realtime do Kanban também escuta `marketing_campanhas` (coluna Triagem auto-atualiza). `MKT_PUBLICO_OPCOES` removido do intake (`URGENCIAS` fica, ainda usado).
- **Fase 5 · KPIs NO AR (sem migration):** `entregue_em` + trigger `fn_marketing_cards_estado_ts` JÁ existiam (não precisou migration). Coletores em `kpiAutoCollector.js` ajustados ao redesenho: **MKT-PRAZO** passa a usar `prazo_producao || prazo_confirmado`; **MKT-DEM-CAP reescrito em SLOTS** (slot-dias úteis ocupados na semana ÷ Σ`slots_dia`×5 · não horas), corrigindo os estados legados que tinham ficado órfãos pós-régua. MKT-LEAD/THROUGHPUT já ok. `/estimar` + `fn_marketing_estimar_prazo` marcados **@deprecated** (intake por dor não usa mais; não dropados — aposentar após validar a triagem). Os KPIs populam com ~1 semana de histórico real.
- **Resta só:** **reordenar-arrastando vertical** no Kanban (drag HTML5 · NÃO-crítico; urgente→`ordem_fila` já cobre a prioridade).

### UI Trello-like no Kanban (2026-05-30 · pedido do Marcos · sem migration)
Repaginação visual da aba (mantém toda a lógica): **listas com fundo cinza** (`bg-muted/50`, `rounded-xl`) + **bolinha de cor** por coluna (`ESTADOS.dot`); **cards estilo Trello** = `<div>` branco arredondado com sombra, **etiquetas em barras coloridas no topo** (componente `Etiqueta`, cor de `etiqueta_tipo`/`destino`/fase), **faixa de prioridade** no topo (urgente rosa / revisão âmbar), badges de meta (prazo · checklist · SLA · 🚩 entrega) e **avatar redondo** (inicial). `CampanhaCard` no mesmo estilo. Objetivo: o Pedro sentir o board do Trello dele.

### Consertos de fluxo · pós-auditoria (2026-05-31 · sem migration)
Varredura completa do módulo (2 auditorias + benchmark). Consertado:
- **🔴 Solicitante↔campanha RELIGADO** (furo crítico): os cards triados têm `campanha_id` mas não `solicitacao_id`, e o solicitante buscava por `solicitacao_id` → tinha perdido o acompanhamento. `solicitacoes.js` (GET list) agora traz `marketing_campanha` = campanha (por `solicitacao_id`) + entregáveis (por `campanha_id`, com dono/estado). Novo `MarketingCampanhaBlock` em `Solicitacoes.jsx` mostra status + prazo + barra de progresso + lista de entregáveis. O `MarketingCardBlock` legado fica de fallback p/ cards antigos com `solicitacao_id`.
- **Materialização da triagem grava `estado:'backlog'`** (não mais `'fila'`) em `POST /campanhas/:id/cards`.
- Bugfix do filtro **"Não atribuído"** no Kanban (escondia tudo) + Select de estado no drawer normaliza legados (`fila→backlog`…) em vez de cair em `'fila'`.
- **Falso alarme da auditoria:** "arrastar card pra Triagem some o card" NÃO procede — a coluna Triagem usa `TriagemColumn`, sem `onDrop`.
- **Aprovação da DEMANDA COMPLETA (2026-05-31):** decisão do Marcos = aprovar a campanha inteira (NÃO por entregável). `POST /campanhas/:id/aprovar` (exige todos os entregáveis `concluido` → campanha `concluida` + solicitação `concluido` p/ NPS) e `POST /campanhas/:id/revisar` (1x · reabre os concluídos pra `revisao` + `tem_revisao`/`motivo_revisao` no card + notifica os donos · SEM migration). `MarketingCampanhaBlock` mostra **Aprovar entrega / Pedir revisão** só quando "tudo pronto" (status `ativa` + todos concluídos). `api.campanhas.aprovar/revisar`.
- **Limpeza pós-auditoria (2026-05-31):** ✅ Pedro (`habilidade='coordenador'`) **fora das raias** do Planner e do cálculo DEM-CAP (`.neq('habilidade','coordenador')`); ✅ **Admin edita `slots_dia`** no membro (não mais horas) — POST/PATCH `/admin/membros` aceitam `slots_dia`; ✅ api.js limpo dos mortos (`capacidade`, `estimar`, `fila.list/reordenar`, `decidirUrgencia` · `fila.posicao` fica). ✅ **DROP** dos mortos (migration `20260531120000`: `fn_marketing_calcular_capacidade_semana`, `fn_marketing_estimar_prazo`, tabela `marketing_grupo_padrao`) + endpoints backend `/capacidade`, `/estimar`, `/fila`, `/fila/reordenar` removidos · `decidir-urgencia` fica inerte (sem chamador). ⚠️ aplicar a migration antes do merge.
- **Resta (menor):** `sugerir-revisao`/`aprovar-entrega` de CARD (legado) em estados antigos — só afetam o fluxo pré-redesenho; Analytics vazio até juntar histórico.

## /novosite · prévia da home do novo site público (2026-05-30)

Ambiente isolado pra testar o redesign do site público **cbrio.com.br** dentro
do ERP, sem afetar nada. Endpoint **`/novosite`** · página PÚBLICA standalone
(FORA do AppShell e do ProtectedRoute · sem login), **não-listada** (nenhum link
em menu · só via URL direta) e **noindex** (meta `noindex,nofollow` + `Disallow:
/novosite` no `robots.txt` · vive no domínio real). É um TESTE de layout.

**Origem do design:** handoff de marca em `~/Downloads/site cbrio` (brief +
copy PT-BR + tokens.css + assets SVG + PDF "When Culture Changes Everything"),
originalmente pensado pra Astro · adaptado num único componente React.

- **Página**: `src/pages/public/NovoSite.tsx` · home completa, autocontida.
  Tokens da marca como CSS vars escopadas em `.ns` (petróleo #00839D, areia
  #EDE0D4, etc), fonte Urbanist, ondas SVG inline (assinatura visual), marquee
  de valores, reveals no scroll (IntersectionObserver), header sticky
  transparente→sólido + drawer mobile. Copy real; **missão no hero**
  ("Empoderados por Deus para alcançar pessoas pra Jesus" · Mt 28:19). Seções:
  Hero · Boas-vindas+marquee · Comece aqui/visita · Jornada (6 cards) · Valores ·
  Online · História+stats 2021→2025 · Galeria (bento) · CTA · Footer.
  **CTAs são visuais (sem href/redirect)** e a nav faz scroll interno — decisão
  do Marcos ("é teste, sem funcionalidades/redirects").
- **Vídeo de hero** (estilo mosaic.org / eaglebrookchurch.com): aftermovie da
  igreja (adoração + batismo) como fundo. Source 4K/951MB (`telao_1920_1080.mp4`)
  transcodado p/ loop web 1080p · 28s · sem áudio → `public/novosite/hero.webm`
  (VP9 ~5MB) + `hero.mp4` (H.264 ~6.4MB). Poster = foto `hero.webp`, fade-in ao
  tocar, e **só carrega em ≥768px sem prefers-reduced-motion** (mobile/a11y ficam
  só na foto · economia de dados). Transcode via ffmpeg do pacote python
  `imageio_ffmpeg` (não há ffmpeg no PATH).
- **Fotos**: 10 fotos reais da igreja otimizadas em WebP
  (`public/novosite/*.webp` · ~840 KB no total) + SVGs de marca em
  `public/novosite/brand/`.
- **Rota** em `src/App.tsx` (seção "Rotas publicas", lazy). Sem backend/migration ·
  rota de frontend (Vercel reescreve não-`/api` pra `index.html`).
- **Link do Next LIGADO (2026-06-01):** `LINKS.next = https://www.cbrio.org/next/inscrever`
  em `novosite/shared.tsx`; o card "Next" da Jornada virou link (`href: LINKS.next`,
  cta "Inscreva-se no Next", sem mais `soon`). Rota `/next/inscrever` existe em
  `App.tsx` → `InscricaoNext`. Pendências de conteúdo do /novosite agora: zero.
- **Ajustes pós-prints (2026-05-30):** galeria virou layout **bento** (1 destaque
  2x2 + apoio · `.ns-gallery-bento`/`.ns-g-feat`); **Jornada com 6 cards** (incluídos
  *Investir tempo com Deus* + *Next*, sem link ainda); **menu sobre o vídeo
  corrigido** — o reset `.ns a{color:inherit}` (especificidade 0,1,1) vencia
  `.ns-nav-link`/`.ns-logo` (0,1,0) e deixava o menu escuro/invisível; agora
  `.ns-header .ns-nav-link` e `.ns-header .ns-logo` forçam branco + scrim escuro
  no topo (`.ns-header::before`, some ao rolar). Mais respiro no hero
  (título→"Mt 28:19") e na visita (legenda→horários). ⚠️ Não regredir o menu branco.
  Botões do CTA final centralizados (`.ns-cta .ns-hero-actions{justify-content:center}` ·
  `.ns-center-x` só dá margin auto, que não centraliza itens flex).
- **Links ligados + página Quem Somos (2026-05-30):** todos os CTAs/rodapé têm destino.
  Refator: chrome/estilos extraídos p/ `src/pages/public/novosite/shared.tsx` (SVGs,
  `LINKS`, `NAV`, `SiteHeader`, `SiteFooter`, `Action`, `useChrome`, `useGo`,
  `useHashScroll`) + `novosite/styles.ts` (`NS_CSS`) — usados pela home e por
  **`/novosite/quem-somos`** (página nova · rota em `App.tsx` · história/missão/stats
  da copy "When Culture", fotos atuais). Destinos: membro/grupos/batismo/voluntariado →
  `cbrio.org/...`; assistir/online + footer Assista → `cbrio.tv`; Instagram →
  `instagram.com/igrejacbrio/`; YouTube → `cbrio.tv`; **contato = CBZap**
  `wa.me/5521997567770`; "Como chegar" → Google Maps (busca "CBRio"); endereço
  Av. das Américas 7907 · Open Mall (subsolo). "Comece aqui"/"Quarta com Deus" →
  scroll `#visita`. Agenda ganhou **sábado: Bridge 17h (teens) · AMI 20h (jovens)**.
  Nav cross-page via `useGo` (âncora rola na página atual; senão navega p/
  `/novosite#secao` e `useHashScroll` rola no destino). ⚠️ Botões agora são `<a>` →
  regras `.ns-btn.ns-btn-*` usam **dupla classe** p/ a cor vencer o reset `.ns a`
  (mesma armadilha do menu · não regredir).

## Solicitações · 5 fluxos da administração · +Pagamentos +Serviços (2026-06-01)

Marcos: a administração recebe **5 fluxos distintos com donos diferentes**
(Reembolso, Reserva de Espaço, Compras, Pagamentos, Serviços), mas só 3 existiam.
**Compras** era flat (só `valor_estimado`) e **Pagamentos/Serviços não existiam** —
caíam no "Outro" (`area_responsavel=NULL` · sem dono, sem SLA, sem aprovação
financeira automática · sumiam do radar e poluíam os KPIs adm). Decisão: adicionar
os 2 fluxos + enriquecer Compras, com **form guiado por intenção + revelação
progressiva** (cada fluxo só mostra os próprios campos · não fica mais pesado).

**Migration `20260601120000_solicitacoes_pagamentos_servicos.sql`** (aditiva · idempotente):
- CHECK de `categoria` aceita `'pagamento'` e `'servico'`.
- Gatilho `tg_solicitacoes_calcula_sla` · lista de "sempre exige Yago" passa a ser
  `compras/reembolso/pagamento/servico` (preserva a interação com a aprovação de
  origem da Spec 001 · o portão financeiro só entra DEPOIS do diretor de origem).
- Colunas novas (compartilhadas · reuso máximo): `favorecido_nome`,
  `favorecido_documento`, `itens`, `link_referencia`, `recorrente`, `recorrencia`.
  Reusa `documento_url`/`forma_pagamento`/`chave_pix`/`banco`/`agencia`/`conta`/
  `valor_estimado` e **`data_necessaria` como vencimento** do pagamento.
- Seed SLA: `financeiro/pagamento` (48/120 · urgente 24/48) e
  `logistica_compras/servico` (72/336 · urgente 24/72). Obs: `financeiro` **não tem
  subcategoria `default`** → pagamento PRECISA de linha própria (senão cai no
  fallback 24/48 hardcoded da `calcular_sla_deadlines`).

**Roteamento (backend `routes/solicitacoes.js`):**
- `pagamento` → `financeiro` (subcat `pagamento`) · módulo notif `financeiro`.
- `servico` → `logistica_compras` (subcat `servico`) · módulo notif `logistica` ·
  **dono = Amaury/Compras** (decisão do Marcos · logística já negocia fornecedor).
- `aprovar-financeiro` pós-Yago: `compras/servico` → `logistica_compras` (status
  `pendente`, Amaury compra/contrata) · `reembolso/pagamento` → `financeiro` (status
  `em_atendimento`, financeiro paga). `acaoMsg` por categoria na notificação.
- `ALLOWED_CATEGORIES`, `CATEGORIA_MODULO`, `CATEGORIA_TO_AREA_RESP`,
  `MODULO_CATEGORIAS` atualizados. POST aceita os campos novos por fluxo.

**Frontend (`src/pages/Solicitacoes.jsx`):**
- 2 categorias novas + `CATEGORIA_HINT` (dica curta por categoria · reduz erro de
  classificação · "já gastou do bolso? use Reembolso").
- Blocos por fluxo: Compras (itens+qtd, link, fornecedor), Serviço (o quê,
  fornecedor, proposta, recorrência), Pagamento (favorecido, boleto/NF, vencimento,
  forma boleto/PIX/transf, recorrência). `data_necessaria` vira "Vencimento *" no
  pagamento. Validações `comprasValid`/`servicoValid`/`pagamentoValid`.
- `DocDropzone` extraído (componente reusável · reembolso/pagamento/serviço) ·
  removidos `dragOver`/`fileInputRef` do nível da página. `RecorrenteToggle` novo.
- Preview "Prazo esperado" passou a casar **subcategoria** (CATEGORIAS ganhou `sub`)
  → corrige também o reembolso, que mostrava o SLA de outra subcat.
- Detalhe renderiza os campos novos por categoria.

**Os 2 portões valem pros novos:** diretor de origem (Spec 001) → Yago (financeiro).
**Decisões mantidas:** compras/pagamento/serviço **sempre** passam pelo Yago (sem
bypass por valor · decisão de 22/05). **Follow-up não feito:** expor as subcategorias
de RH que o backbone já tem (`vaga_nova/treinamento/documentacao/duvida` · hoje o form
só mostra Férias/Licença). ⚠️ Aplicar a migration antes do merge.

### Ajustes pós-avaliação do Marcos (2026-06-01 · sem migration)

Depois de avaliar em prod, o Marcos refinou o significado dos fluxos. **Tudo
frontend + backend, sem migration** (reúso da coluna `itens`):

- **"Serviços" agora é MANUTENÇÃO INTERNA** (goteira, ar, elétrica → equipe da
  igreja). Virou rótulo da categoria `infraestrutura` (→ `manutencao`, **NÃO** passa
  pelo Yago). A categoria `servico` (contratação externa → logistica_compras + Yago)
  **saiu do form** · contratar/pagar gente de fora agora é **Pagamento**. Os slugs
  `servico`/`outro` continuam na CHECK do banco (linhas históricas), só não são mais
  oferecidos. O SLA `logistica_compras/servico` fica dormente.
- **"Outro" removido** do form (tirava o pretexto de furar o fluxo).
- **Reembolso:** campo passa a ser **"Valor (exato da nota)"** obrigatório (era
  "valor estimado"). **"Motivo do reembolso" removido** — era redundante com a
  "Justificativa do pedido" (auditoria de redundância pedida pelo Marcos · os blocos
  extras devem **complementar**, não repetir os campos gerais).
- **Reserva de Espaço:** a Descrição vira "qual evento/finalidade" + campo novo
  **"Material ou arrumação específica"** (gravado em `itens`). Detalhe da reserva
  agora renderiza espaço/data/horário/pessoas + material.
- **Seletor de área REMOVIDO do form.** O backend deriva `area_cliente` de quem
  preenche — `kpi_areas[0]` (slug) → 1ª área de `usuario_areas` (nome normalizado p/
  slug via `_slugArea`) → `profile.area`. Ignora qualquer `area_cliente` do body.
  Crucial pros KPIs ADM ficarem corretos sem depender do solicitante escolher certo.
- **Labels:** "Categoria" → **"Qual tipo de solicitação?"**, "Título" → **"Título da
  solicitação"**, "Descrição" → **"Descrição da necessidade"**, "Justificativa" →
  **"Justificativa do pedido"**.
- **`DocDropzone`/`RecorrenteToggle`** seguem reusáveis (reembolso/pagamento). Limpei
  os órfãos do seletor (`AREAS_MACRO`, `SUB_TO_MACRO`, `CARGO_TO_SUBAREA`, `cargoSlug`).
- **Amaury** cadastrado em `area_solicitacoes_responsaveis` nas 4 áreas de logística
  (`logistica_compras` = Compras · `manutencao` = Serviços · `reserva_espaco` ·
  `logistica_estoque`) · via SQL no painel (limpeza/cozinha ficam com a Jéssica).

**Mapa final de roteamento:** Compras→Amaury(logística)+Yago · Serviços(manutenção
interna)→Amaury(manutenção, sem Yago) · Pagamento→Yago(financeiro) · Reembolso→Yago ·
Reserva→Amaury(reserva_espaco) · TI→TI · Marketing→Pedro · Férias/Licença→RH.

## Solicitações · fix da ENTRADA do fluxo (validação E2E Marketing · 2026-05-28)

Validação ponta a ponta do fluxo de Solicitações de Marketing revelou que o módulo
foi marcado como "concluído" mas **nunca tinha rodado em prod** (0 solicitações
marketing, 0 cards `origem='solicitacao'`) — e quebrava no primeiro clique. 3 bugs
latentes na entrada, todos corrigidos na migration `20260528500000_solicitacoes_fix_entrada.sql`:

- **BUG A · `solicitacoes_categoria_check` rejeitava `marketing`/`reserva_espaco`/`licenca`.**
  O form e o backend (`ALLOWED_CATEGORIES`) oferecem, mas a CHECK só tinha
  `{ti,compras,reembolso,espaco,infraestrutura,ferias,outro}`. INSERT estourava → 500.
  Fix: CHECK ampliada pra incluir as 3 (mantém `espaco` legado).

- **BUG C · `area_cliente` era enum `area_kpi` (só 6 áreas de culto).** O form de
  "Sub-área" manda 21 valores (integracao, cuidados, grupos, rh, financeiro, marketing…);
  qualquer um fora de `{kids,ami,bridge,sede,online,cba}` → `invalid input value for enum`.
  Fix: `area_cliente` vira **`text`** em `solicitacoes` E `area_alcadas` (o enum `area_kpi`
  só era usado nesses 2 lugares · não toca KPI/NSM). Views `vw_solicitacoes_sla` e
  `vw_reserva_espacos` dropadas e recriadas idênticas (a 1ª alimenta KPIs ADM em `painel.js`).

- **BUG B · aprovação hierárquica (Spec 001) contornada inteira.** O backend insere via
  **service_role** (`auth.uid()=NULL`), então o trigger `fn_solicitacoes_roteamento_aprovacao`
  caía no branch de bypass e marcava TUDO como `dispensada` — a aba "Aprovar" do diretor
  nunca recebia nada (afeta todas as áreas, não só marketing). Fix: função nova
  **`fn_solicitacoes_rotear_origem(uuid)`** (espelha as regras de dispensa sem depender de
  `auth.uid()`); o backend (`routes/solicitacoes.js` POST `/`) chama via RPC e grava
  `aprovacao_origem_diretor_id/status/motivo` + `status` no insert. O **trigger continua de
  rede de segurança** (só dispensa quando ninguém setou `aprovacao_origem_status`).

**Interação com aprovação financeira (transversal):** como agora compras/reembolso também
passam pela aprovação de origem antes, o `PATCH /:id/aprovar-origem` decide o próximo status:
`aguardando_aprovacao_financeira` se `precisa_aprovacao_financeira AND aprovado_financeiro_em IS NULL`,
senão `pendente`. E `GET /pendentes-financeiro` exclui `status='aguardando_aprovacao_origem'`
(não mostra no financeiro antes do diretor aprovar).

**Validação:** migration + função + cadeia (routed→Arthur → aprovação → card materializa)
testadas em transação revertida (`ROLLBACK`) contra prod · zero persistência. Frontend não
precisou de mudança (já oferecia tudo). **Não enforçado ainda:** "só funcionários criam"
(D-04) — o trigger só checava isso com `auth.uid()` presente; deixado como follow-up pra não
gerar 403 surpresa em quem está sem vínculo `rh_funcionarios` no piloto.

## Solicitações · Kanban não esconde mais status do backbone (2026-05-28)

O board "Para Atender" (`src/pages/Solicitacoes.jsx`) só tinha 5 colunas casando 1:1
com 5 status (`pendente/em_analise/aprovado/rejeitado/concluido`), mas o
`solicitacoes_status_check` tem **10** status. Itens em `aguardando_aprovacao_financeira`,
`em_atendimento`, `aguardando_entrega` e `avaliado` não caíam em coluna nenhuma e
**sumiam do board** (ex: reembolso aprovado pelo financeiro vira `em_atendimento`).

Fix: cada `KANBAN_COLUMNS` ganhou um array `match` que agrupa os status reais
(o filtro usa `col.match.includes(status)`):
- Pendente ← `pendente`, `aguardando_aprovacao_financeira`
- Em Análise ← `em_analise`
- Em Andamento ← `aprovado`, `em_atendimento`, `aguardando_entrega`
- Concluído ← `concluido`, `avaliado`
- Rejeitado ← `rejeitado`

`aguardando_aprovacao_origem` fica **de fora de propósito** (vive na aba "Aprovar",
não é fila da área ainda). `STATUS_LABELS` ganhou os 4 status que faltavam, e o
card mostra um badge com o status real quando a coluna agrupa vários (`mostrarStatus`).
Drag-and-drop continua setando `col.key` (status canônico). Frontend puro · sem migration.

## Dados · Pr. Juninho nome + Pr. Pedrão (2026-05-28)

Migration `20260528510000_juninho_nome_exibicao.sql`: corrige o nome de exibição
`juninho` → `Juninho` na conta oficial (`juninho@cbrio.com.br` · Marcos confirmou),
sincronizando os text-mirrors legados (`projects.leader`/`responsible` · 2+2 linhas +
`usuarios.nome`) pra não desencontrar do filtro `escopo_proprio` de `/projetos` (mesmo
padrão da renomeação "Alda → Lorena"). A conta `juninho.lit@cbrio.org` (Pedro L. B.
Litwinczuk Júnior) **fica como está** · possível duplicata a tratar depois. **Pr. Pedrão
não tem conta** no sistema → nada a marcar em `is_diretoria_geral` (quando criarem,
marcar Pastor Senior).

## Marketing · intake em cascata (grupo → entregável) + destino interno (2026-05-28)

Marcos: o solicitante encarava 16 tipos soltos + escolhia destino · simplificado pra
**2 menus em cascata**, e o destino saiu da mão dele.

**Migration `20260528520000_marketing_etiquetas_grupo.sql`:** `marketing_etiquetas_tipo`
ganhou coluna `grupo` + seed dos 16:
- `rede_social` → Post · Carrossel · Story · Reels
- `video_foto` → Vídeo curto · Aftermovie · Motion · Foto evento · Foto retrato
- `artes` → Cartaz/Folder · Banner/Lona · Adesivo · Mockup · Telão LED · Logo · Identidade visual

**Form `/solicitacoes` (`Solicitacoes.jsx`, categoria=marketing):** menu1 = grupo
(`MKT_GRUPO_LABELS`/`MKT_GRUPO_ORDER` · derivado de `marketingGrupos`) → menu2 = entregáveis
filtrados por grupo (`marketingTipos.filter(t => t.grupo === form.marketing_grupo)`). Tipo
virou **obrigatório** (`marketingValid`). **Destino removido** do form (`marketing_grupo` é
UI-only · deletado do payload). Estimativa + habilidade sugerida mantidas.

**Destino → etiqueta interna do Pedro:** `solicitacoes.marketing_destino_id` fica null no
intake. O Pedro classifica no card do Kanban (label "Destino" → **"Etiqueta interna"** em
`MarketingKanban.jsx` · CardDrawer + NovaTaskForm). `marketing_etiquetas_destino` intocado.

**Backend:** `GET /etiquetas` usa `select('*')` → já retorna `grupo` (sem mudança).
`POST/PATCH /admin/etiquetas/tipo` passaram a aceitar `grupo` (re-map sem migration). UI do
admin pra editar grupo fica pra depois (hoje não há "add tipo novo" pelo admin · Spec 009).

⚠️ **Aplicar a migration ANTES do deploy** — senão `GET /etiquetas` não traz `grupo`,
`marketingGrupos` fica vazio e o menu 1 não mostra opção nenhuma.

### Estimativa preliminar · piso de 7 dias (2026-05-29)

Migration `20260529030000_marketing_estimar_piso_7dias.sql` recria
`fn_marketing_estimar_prazo` com **piso de 7 dias** (Marcos): se a carga horária
permite fazer em menos, mostra 7 (tempo mínimo viável pra equipe pensar+executar);
se a carga exige mais, vale o maior. `dias_uteis` passou a ser **dias corridos até a
data sugerida** (`data_sugerida - hoje`), pra bater com a data quando o solicitante
informa uma "data necessária" maior. Rótulo no form: "dias úteis" → "dias".
Inputs e limitações inalterados (usa `esforco_max_h` + capacidade da equipe inteira ÷5
× 0,6 · ainda não é per-habilidade, não conta o tempo de aprovação do diretor).

### Atribuição padrão por grupo (2026-05-29)

Migration `20260529040000_marketing_atribuicao_padrao_grupo.sql`: card de solicitação
**já nasce atribuído** ao responsável do grupo. Tabela `marketing_grupo_padrao`
(`grupo` PK → `membro_id`), seed por habilidade:
- `artes` → Cauã (designer) · `rede_social` → Lorena (social_media) · `video_foto` → Allan (videomaker)

Allan pega vídeos **e fotos** (Aline não tem login). `fn_marketing_cards_solicitacao_sync`
recriada: olha o `grupo` do `etiqueta_tipo_id` → busca o padrão → grava `atribuido_a` no
INSERT. **Pedro troca no card** quando quiser ("Atribuído a" · já existia · backend PATCH
`/cards` aceita). Sem tela pra editar os defaults (decisão "só seed" · ajustar via SQL se
mudar). Cards de evento/interna sem tipo não recebem default (Pedro aloca). ⚠️ Migration
sem dependência de código novo, mas aplicar antes do merge pra manter git↔prod em sincronia.
Obs: card auto-atribuído (criado pelo trigger) não dispara a notificação "card atribuído"
do backend — só quando o Pedro (re)atribui via API. Notificar no auto-assign fica de follow-up.

### Padrões por fase do ciclo criativo (2026-05-29)

Marcos+Pedro: ~80% dos cards de ciclo criativo seguem o mesmo padrão por
(categoria do evento × fase). Em vez do Pedro classificar tarefa por tarefa,
um padrão reutilizável aplica **etiqueta + esforço + dono automáticos** quando
o card de evento nasce.

**Migration `20260529060000_marketing_ciclo_padroes.sql`:**
- Tabela `marketing_ciclo_padroes` (`category_id` FK event_categories, `nome_fase`,
  `etiqueta_tipo_id`, `atribuido_a`, `ativo` · UNIQUE(category_id, nome_fase)).
- Chave = `(events.category_id × event_cycle_phases.nome_fase)`. O
  `cycle_phase_tasks` já carrega `event_id` + `event_phase_id` (ver `enrichCards`).
- `fn_marketing_cards_cycle_phase_sync` recriada (Spec 022): no **nascimento** do
  card resolve o par (categoria × fase) e preenche `etiqueta_tipo_id` + `atribuido_a`.
  **Só no INSERT** · UPDATE de card existente NÃO toca etiqueta/dono (respeita a
  classificação manual do Pedro). Sem match → nasce vazio como antes.
- `fn_marketing_aplicar_padroes_ciclo(category_id)` · backfill manual · aplica os
  padrões aos cards de evento ativos (fila/em_producao) **só nos campos NULL**
  (COALESCE · nunca sobrescreve). Retorna nro de cards afetados.
- Esforço vem de graça pela etiqueta (`esforco_max_h` · Spec 016).

**Backend (`routes/marketing.js`, nível 5):**
- `GET/POST/PATCH/DELETE /admin/ciclo-padroes` · CRUD (DELETE é hard · config sem PII)
- `GET /admin/ciclo-padroes/categorias` · event_categories ativas (select da UI)
- `GET /admin/ciclo-padroes/fases?category_id=X` · nomes de fase do catálogo
  (`cycle_phase_templates` da categoria · distinct por nome · fonte que casa com
  `event_cycle_phases.nome_fase`)
- `POST /admin/ciclo-padroes/aplicar` · chama a RPC de backfill

**Frontend:**
- Nova aba **"Padrões"** em `/marketing/admin` (5ª aba). Lista agrupada por
  categoria · select inline de etiqueta/dono · toggle ativo · remover.
- Form: categoria → fase (carrega fases da categoria) → etiqueta + dono (≥1).
- Botão **"Aplicar a cards ativos"** roda o backfill com confirmação + toast do count.
- `api.js`: `marketing.admin.cicloPadroes.{list,categorias,fases,create,update,remove,aplicar}`.

**Decisões:** chave (categoria × fase) sem granularidade por entregável (o refino
manual cobre o resto · Pedro ajusta no card); padrões só por UI (sem seed · Pedro
preenche). ⚠️ Aplicar a migration antes do merge.

### Checklists no card + anexos de referência (2026-05-29)

Inspirado no Trello do Pedro (board "Institucional" · épico com checklists + anexos de
referência). Quick win pra aproximar o card do fluxo deles antes da demo.

**Migration `20260529080000_marketing_card_checklist_referencias.sql`:**
- Tabela `marketing_card_checklist` (`card_id` FK CASCADE, `grupo` text nullable = "frente",
  `texto`, `feito`, `ordem` bigserial) + RLS (select authenticated · service_role all).
  Sem `deleted_at` · DELETE direto (item trivial, não-PII).
- Coluna `tipo` em `marketing_entregaveis`: `'entregavel'` (default) | `'referencia'` · CHECK.
  Distingue input (briefing/inspiração) de output (arquivo final).

**Backend (`routes/marketing.js` + `services/sharepointMarketing.js`):**
- `GET /cards/:id/checklist` (nível 1) · `POST /cards/:id/checklist` (nível 3) ·
  `PATCH /checklist/:itemId` (nível 3) · `DELETE /checklist/:itemId` (nível 3).
- `POST /cards/:id/entregaveis` aceita campo `tipo` (multipart). `uploadEntregavel({...,tipo})`
  grava a coluna e usa subpasta `Marketing/Referencias/AAAA/AAAA-MM` quando referência.
  A notificação "arquivo final" só dispara quando `tipo != 'referencia'`.

**Frontend (`MarketingKanban.jsx` · CardDrawer):**
- Bloco **Checklist**: itens agrupados por frente (`grupo`), barra de % (feitos/total),
  marcar/adicionar/remover inline. Enter adiciona e mantém a frente (vários itens seguidos).
- Bloco **Referências** (input): upload `tipo=referencia` · lista com download.
- Bloco **Entregáveis** (output): passa a filtrar `tipo != 'referencia'`.
- Gate por `isCoordenador` (nível 5 · cobre toda a equipe via boost de área) · diretoria (nível 1) read-only.
- `api.js`: `marketing.checklist.{list,create,update,remove}` + `entregaveis.upload(cardId, file, tipo)`.

**Decisões:** checklist é 1 nível com `grupo` text (não 2 tabelas) · cobre o caso do Trello e é
bem mais simples. Referência reusa toda a infra SharePoint (Graph) só com a coluna `tipo`.
⚠️ Aplicar a migration antes do merge.

## Marketing · Spec 024 · Tela /marketing/ciclo-criativo (2026-05-28)

Marcos: "ao colocar o horário no marketing, coloque alguma visualização para Pedro ir por fase do ciclo criativo colocando o horário e o dono de cada etapa do ciclo criativo, então isso vai pro calendário dessa pessoa."

**Migration `20260528400000_marketing_atribuir_orfaos_completos.sql`:**
- Atribui os 4 cards concluídos sem dono pro Pedro (Spec 023 filtrou só ativos)
- Zera os órfãos do módulo

**Endpoints novos (`routes/marketing.js`):**
- `GET /api/marketing/ciclo-criativo` (nível 1) · cards origem='evento' agrupados por evento → fase
- `PATCH /api/marketing/ciclo-criativo/batch` (nível 5) · aplica `etiqueta_tipo_id` e/ou `atribuido_a` pra array de `card_ids`

**Página nova `src/pages/marketing/MarketingCicloCriativo.jsx`:**
- Rota `/marketing/ciclo-criativo` · `nivelMinimo=5` (só coord)
- Layout accordion:
  - Card por evento (collapsible · default expandido)
  - Bloco roxo por fase (nome + numero + contador de tarefas)
  - Linha por tarefa com:
    - Título + descrição
    - Select inline **etiqueta tipo** (mostra esforço · ex: "Banner / Lona · 6h")
    - Select inline **dono** (membros · com habilidade)
    - Link "Abrir no Eventos" pra tarefa específica
- Botões batch por fase:
  - "Aplicar etiqueta X pra toda a fase"
  - "Atribuir membro Y pra toda a fase"
  - Mostra confirmação com count antes de aplicar
- Tarefas concluídas aparecem opaca · selects desabilitados (read-only)
- Salvamento inline · sem botão "salvar" · PATCH dispara on change

**`api.js`:** `marketing.ciclo.list()` + `marketing.ciclo.batch(cardIds, payload)`

**`MarketingNav.jsx`:** item "Ciclo" entre Calendário e Analytics (só pra coord)

**Fluxo operacional pro Pedro:**
1. Cycle phase task criada no /eventos com area=marketing → trigger cria card
2. Pedro abre `/marketing/ciclo-criativo`
3. Vê evento "Retiro AMI 2026" → fase "Brainstorming" → 5 tarefas
4. Aplica batch: "Atribuir Lorena pra todas" + "Etiqueta Story · 1h" (se cabível)
5. Refina caso a caso por linha
6. Cards atribuídos com etiqueta entram no calendário do membro automaticamente (Spec 005 + 020)

**Edição preserva separação:** atribuição/etiqueta no Marketing NÃO toca `cycle_phase_tasks.responsavel_id` ou `cycle_phase_tasks.area`. Conteúdo da tarefa continua sendo editado no /eventos.

## Marketing · Spec 023 · Pedro como membro + atribuição default órfãos (2026-05-28)

Marcos: "coloque também Pedro Paiva como uma das pessoas nesse calendário e coloque todas as tarefas sem dono para ele · ele vai conseguir ver o que precisa ser entregue e que não tem dono."

**Discussão sobre horas dos cards de ciclo criativo** (Marcos perguntou se valia botar no Eventos):
- **Decisão:** manter no Marketing. Pedro classifica `etiqueta_tipo_id` ao atribuir → esforço vem da etiqueta (Spec 005+017 já fazem). Outros módulos não consomem · centralizar no Eventos é overhead sem benefício hoje.

**Migration `20260528380000_marketing_pedro_membro_orfaos.sql`:**
- CHECK constraint `marketing_membros.habilidade` ganha `'coordenador'` (Pedro não se encaixa nas 5 habilidades técnicas)
- Mesma adição em `marketing_etiquetas_tipo.habilidade_padrao` (consistência · etiqueta pode sugerir coordenador)
- `INSERT marketing_membros` · Pedro Paiva · `coordenador` · 40h · idempotent via ON CONFLICT
- `UPDATE marketing_kanban_cards SET atribuido_a = pedro_membro_id WHERE atribuido_a IS NULL AND estado IN ('fila','em_producao','aguardando_solicitante')` · 105 cards do ciclo + qualquer outro órfão recebem Pedro como atribuído

**Por que não estoura a capacidade do Pedro:**
- Spec 018 fez `fn_marketing_calcular_capacidade_semana` somar cards via ROW_NUMBER ordenando por `ordem_fila` · só os primeiros cabem na capacidade · resto fica invisível no calendário (mas listado na Fila)
- Pedro reordena ou reatribui conforme distribui · o que sobra na fila dele aguarda

**Frontend (`MarketingAdmin.jsx`):**
- Constante `HABILIDADES` ganha `'coordenador'` no topo

## Marketing · Spec 022 · Ciclo criativo de Eventos aparece no Kanban (2026-05-28)

Marcos: "as demandas de ciclo criativo que ficam no módulo de eventos devem ser listadas aqui também, por fases · pode ficar com o Pedro a responsabilidade de delegar · preenchimento continua no módulo de eventos, só um clique que abre lá."

**Problema descoberto:** o trigger Spec 004 escutava `event_tasks` (tabela simples · 2 rows) mas o ciclo criativo real usa `cycle_phase_tasks` (689 rows · 105 com `area='marketing'`). Por isso 0 cards estavam materializando do ciclo.

**Mudança estrutural:**
- `marketing_kanban_cards` ganha coluna `cycle_phase_task_id uuid` (FK SET NULL)
- UNIQUE parcial garante 1 card por cycle_phase_task
- CHECK constraint atualizada · `origem='evento'` aceita `evento_task_id` OU `cycle_phase_task_id`
- Trigger novo `fn_marketing_cards_cycle_phase_sync` em `cycle_phase_tasks`:
  - AFTER INSERT/UPDATE OF area, status, titulo, descricao, prazo
  - `area=marketing` + status=`pendente`/`em-andamento`/`concluida` → card com estado correspondente
  - `area` mudou DE marketing → soft-delete do card (evita órfão)
  - Atualizações no ciclo refletem no card automaticamente

**Mapeamento status → estado:**
| cycle_phase_tasks.status | marketing_kanban_cards.estado |
|---|---|
| `pendente` | `fila` |
| `em-andamento` | `em_producao` |
| `concluida` | `concluido` (+ `entregue_em` preenchido) |

**Backfill (na migration):** 105 cards · 101 fila + 4 concluído.

**Backend (`routes/marketing.js`):**
- `enrichCards` resolve `cycle_phase_task_id` → objeto com:
  - `event_name` (do evento pai)
  - `fase` formatada `"3. Brainstorming e Conceito"`
  - `is_critical`, `prioridade`
  - `link` `/eventos/:event_id`

**Frontend:**
- `MarketingKanban` · drawer mostra bloco roxo "Origem · Ciclo criativo" com botão **"Abrir no Eventos"** (target=_blank)
- Card mini ganha badge roxo da fase + nome do evento ao lado
- `MarketingFila` · linha mostra "Fase · Evento" no segundo plano

**Filosofia da integração:**
- **Atribuição é local do Marketing** · Pedro define `atribuido_a` no card · NÃO toca `cycle_phase_tasks.responsavel_id`
- **Estado/conclusão é local do Eventos** · trigger sincroniza pro card · UI Marketing mostra mas não edita
- **Card é "espelho com atribuição local"** · vantagem dupla (visibilidade Marketing + autoridade Eventos)

**Capacidade:** os 105 cards entram no cálculo de `fn_marketing_calcular_capacidade_semana` se tiverem `atribuido_a` preenchido. Como nenhum tem ainda (Pedro distribui), eles ficam invisíveis no calendário até Pedro atribuir.

**Migration `20260528360000_marketing_cycle_phase_tasks.sql` aplicável depois da Spec 021.**

## Marketing · Spec 021 · Cleanup legacy + Aline + Notificações (2026-05-28)

Pós-auditoria · 3 ações Marcos:
1. **Remover legacy do módulo** · 7 etiquetas inativas (hard-delete) + 5 KPIs MKT-ONL-* (soft-delete) + migrar 1 card antigo
2. **Cadastrar Aline** sem e-mail · aparece pro Pedro (admin/calendário) e em RH com informações pendentes
3. **Configurar notificações** pro Pedro Paiva + Marcos

**Migration `20260528340000_marketing_cleanup_aline_notif.sql`:**

| Ação | Detalhe |
|---|---|
| Migra card "Impressos campanha de serviço" pro tipo `banner_lona` (6h) · era `artes` legacy (10h) | UPDATE marketing_kanban_cards |
| Hard-delete 7 tipos legacy (redes_sociais, artes, pecas_fisicas, videos, fotos, impressos, identidade_marca) · FK `ON DELETE SET NULL` em cards garante segurança | DELETE FROM marketing_etiquetas_tipo |
| Soft-delete 5 KPIs MKT-ONL-* sem fonte_auto (preserva audit) | UPDATE kpi_indicadores_taticos |
| Profile fantasma Aline · `role='assistente'` · `area='Criativo'` · email placeholder único | INSERT INTO profiles |
| `rh_funcionarios` Aline · email NULL · cargo "Fotografa de domingo (cobertura cultos)" · tipo_contrato `PJ` · observações listam o que tá pendente | INSERT |
| `marketing_membros` Aline · habilidade `fotografo` · `horas_semanais=6` | INSERT |
| Recorrente domingo 08:30 6h "Cobertura cultos domingo (08:30 · 10:00 · 11:30 · 19:00)" vinculado a Aline | INSERT compromisso + junction |
| Notificação · Pedro Paiva + Marcos recebem do módulo `marketing` | INSERT notificacao_regras |

**Padrão "profile fantasma" pra Aline:**
- Não existe em `auth.users` · não loga nunca
- Email placeholder `aline.pendente@cbrio.org` (sem `UNIQUE` em profiles.email · idempotente via WHERE NOT EXISTS)
- Aparece como pessoa normal no calendário (linha `Aline (fotografa domingo)` · habilidade `fotografo` · 6/6 alocadas via recorrente domingo)
- RH tem entrada com `nome`/`cargo` preenchidos · resto pendente
- Quando ganhar email/CPF, atualizar via UI normal de RH

**Pós-migração esperado:**
- Cauã passa de `10/40` pra `6/40` aloc (card "Impressos campanha de serviço" agora aponta pra banner_lona 6h)
- Aline `6/6` aloc todo domingo
- Etiquetas tipo · 16 ativas (sem inativas)
- KPIs MKT-* · 4 (PRAZO/LEAD/THROUGHPUT/DEM-CAP) · sem MKT-ONL-* legacy

## Marketing · Spec 020 · Recorrentes N:M (vários participantes) (2026-05-28)

Marcos: "queria que voce pudesse adicionar tarefas recorrentes que podem mais de uma pessoa · reunião de todo marketing · reunião específica com designer e redes sociais."

**Mudança estrutural · `marketing_compromissos_recorrentes` deixa de ser 1:1 e vira N:M:**
- Coluna `membro_id` **removida** da tabela principal
- Nova tabela junction `marketing_recorrentes_participantes` (`compromisso_id`, `membro_id` · PK composta)
- Cada participante recebe `duracao_h` na alocação (reunião 1h com 5 → cada um +1h, não 0.2h cada)

**Migration `20260528320000_marketing_recorrentes_nm.sql`:**
- `CREATE TABLE marketing_recorrentes_participantes` + RLS pattern do módulo
- Migra os 7 recorrentes existentes (1 participante cada) via `INSERT FROM`
- `ALTER TABLE ... DROP COLUMN membro_id` da tabela principal
- `CREATE OR REPLACE` da `fn_marketing_calcular_capacidade_semana` v4 · CTE `rec` faz JOIN com a junction

**Backend (`routes/marketing.js`):**
- `GET /compromissos-recorrentes` e `GET /admin/recorrentes` retornam `participantes_ids: uuid[]`
- `POST /admin/recorrentes` exige `participantes_ids` array (≥1 obrigatório) · INSERT compromisso + INSERT junction · rollback (soft-delete) se junction falhar
- `PATCH /admin/recorrentes/:id` aceita `participantes_ids` opcional · DELETE+INSERT na junction quando enviado

**Frontend admin (`MarketingAdmin.jsx` aba Recorrentes):**
- Linha mostra: dia · hora · duração · descrição · **chips de participantes** (1ª palavra do nome)
- Form ganha bloco de **multi-select com checkboxes** (todos visíveis em scroll) + atalhos "Todos" / "Limpar"
- Contador `Participantes * (3/5)` no label

**Frontend calendário (`MarketingCalendario.jsx`):**
- `recPorMembroDia` agora **expande** cada recorrente em N entradas (1 por participante)
- Reunião de todo Marketing aparece em todas as 5 linhas no mesmo dia/horário
- Sheet do membro mostra todos os recorrentes onde ele participa

**Compatibilidade:**
- Os 7 recorrentes existentes (Allan qua · Lorena seg-sáb) migram com 1 participante cada · UI mostra normalmente
- Capacidade calculada continua correta (cada participante soma `duracao_h`)

## Marketing · Spec 019 · Recorrentes como alocadas + sheet do membro (2026-05-28)

Pós-piloto · 2 ajustes apontados pelo Marcos:

**Fix · capacidade escondia recorrentes:**
- Antes: Lorena aparecia `0/22` (0 cards / 22h após subtrair 18h de recorrentes)
- Agora: Lorena aparece `18/40` (18h já alocadas com recorrentes / 40h base · 22h livre)
- Lógica nova em `fn_marketing_calcular_capacidade_semana` v3:
  - `horas_disponiveis = horas_base` (ou `override` se houver) · NÃO subtrai recorrentes
  - `horas_alocadas = horas_recorrentes + horas_cards`
  - `horas_livres = disponiveis − alocadas`
- Cards na fila continuam usando "capacidade pra cards" interna (`base − recorrentes`) pra decidir quantos cabem na semana · só o **display** mudou pra transparência

**Sheet de detalhe do membro (clique no nome):**
- No `/marketing/calendario`, nome do membro agora é um `<button>` clicável
- Abre `Sheet` lateral com:
  - Barra de progresso de capacidade (cor: verde · âmbar >90% · vermelho sobrecarga)
  - 3 stats em grid: horas Recorrentes / horas Cards / horas Livre
  - Aviso se override está ativo
  - Lista de compromissos recorrentes da semana
  - Lista de cards atribuídos · clicáveis (abre o sheet do card original)
- Cor primária no nome + hover underline indicam clicabilidade

**Migration `20260528300000_marketing_recorrentes_como_alocadas.sql`:**
- `CREATE OR REPLACE` da função · só mudança no SELECT final (disponiveis + alocadas)
- Não recria CTEs nem trigger · zero impacto em outras consultas

**Frontend:**
- `MembroLinha` recebe `onClickMembro` · wrapper vira `<button>`
- Display ganha texto secundário "(Xh recorr.)" quando há recorrentes
- Novo componente `MembroDetalhe` dentro do `Sheet`

## Marketing · Spec 018 · Fila de prioridade + nav unificada (2026-05-28)

Resolve 2 problemas pós-piloto:
- Botões de navegação inconsistentes entre as 4 telas
- Capacidade alocada baseada no prazo escondia ociosidade · cards com prazo distante não entravam na semana atual mesmo com equipe livre

### Item A · `MarketingNav` componente compartilhado

Header padronizado nas **5 telas** (Kanban · Fila · Calendário · Analytics · Admin). Destaca a atual (variant `default`) e mostra link pras outras. Admin só aparece pra coordenador (nível ≥5). Substitui os botões hardcoded espalhados.

### Item B · Fila de prioridade global (`/marketing/fila`)

Nova página com lista ordenada por `ordem_fila`:
- Cards em `em_producao` ficam no topo · não draggable (já sendo feitos)
- Cards em `fila` abaixo · drag-and-drop (HTML5 nativo · mesmo padrão do Kanban)
- Filtro: todos · sem atribuição · por membro
- Realtime via Supabase channel

**Decisões fechadas:**
1. Fila **global** com filtro por membro (não tabs por pessoa)
2. Cards sem atribuição entram na fila (Pedro distribui)
3. Reordenar afeta só `ordem_fila` · prazo intacto · UI sinaliza desencontro (`prazo em 4d · fora da prioridade` ou `prazo em 6m · adiantando`)
4. Só coord (nível 5) reordena · produtor vê só leitura
5. Calendário **continua mostrando capacidade baseada na fila** (já refletido no item C)
6. Solicitante vê posição (`Fila #3 de 12`) no `MarketingCardBlock`
7. `MKT-DEM-CAP` mantém

### Item C · Capacidade via fila (migration)

`fn_marketing_calcular_capacidade_semana` v2:
- Antes: somava `esforco_max_h` dos cards com `prazo_confirmado` na semana
- Agora: usa **fila do membro** com `ROW_NUMBER` ordenando `em_producao` primeiro → `ordem_fila` ASC. Inclui cards até o **acumulado anterior** estourar a capacidade (último card cabe parcialmente · próximo já não entra na semana mesmo se houver folga marginal)

Resultado: Pedro reordena a fila → calendário reflete imediatamente quem está ocupado com o que esta semana, sem depender do prazo.

### Endpoints novos

- `GET /api/marketing/fila` · lista cards fila + em_producao ordenados (nível ≥1, com filtro opcional `?atribuido_a=`)
- `PATCH /api/marketing/fila/reordenar` · array `{ ordens: [{ id, ordem }, ...] }` (só coord ≥5)
- `GET /api/marketing/fila/posicao/:cardId` · retorna `{ posicao, total, estado }` (solicitante do card OU membro Marketing OU admin)

### Frontend

- `api.js` ganha `marketing.fila.{list, reordenar, posicao}`
- `MarketingFila.jsx` · nova página
- `MarketingCardBlock` em Solicitacoes mostra badge "Fila #N de M" quando posicao retorna
- 5 botões cross-link em todas as telas via `MarketingNav`

### Migration `20260528280000_marketing_capacidade_via_fila.sql`

- `CREATE OR REPLACE FUNCTION fn_marketing_calcular_capacidade_semana` (v2 · lógica de fila)
- Backfill defensivo · normaliza `ordem_fila` pra inteiros sequenciais (em_producao primeiro · depois fila por ordem antiga)

## Marketing · Spec 017 · Refator etiquetas tipo · 16 entregas concretas (2026-05-28)

Marcos identificou que os 8 tipos guarda-chuva (Artes · Impressos · Mockup · etc) misturavam conceitos: "Artes" não é entrega, é produto base; "Impressos" = arte + impressão; esforço variava demais (post 30min vs banner 16h).

**Mudança:** substituídos os 8 tipos por 16 **entregas concretas**, agrupadas em 5 canais via cor:

| Canal | Cor | Entregas |
|---|---|---|
| Redes sociais | rosa (#EC4899/#F472B6) | Post · Carrossel · Story · Reels |
| Audiovisual | azul (#0EA5E9/#0284C7/#38BDF8/#7DD3FC) | Vídeo curto · Aftermovie · Motion · Foto evento · Foto retrato |
| Impressos | âmbar (#F59E0B/#FBBF24) | Cartaz/Folder · Banner/Lona · Adesivo |
| Eventos físicos | roxo (#A855F7) | Mockup · Telão LED |
| Marca | verde (#10B981/#059669) | Logo · Identidade visual completa |

**SLAs preliminares** (Pedro/Marcos refina via `/marketing/admin`):

| Entrega | esforco_max_h |
|---|---|
| Story | 1 |
| Post · Adesivo | 2 |
| Foto retrato | 3 |
| Carrossel · Reels · Vídeo curto · Cartaz/Folder · Mockup · Telão LED | 4 |
| Banner/Lona · Foto evento · Motion | 6 |
| Aftermovie · Logo | 16 |
| Identidade visual completa | 40 |

**Migration `20260528260000_marketing_etiquetas_refator.sql`:**
- `UPDATE ativo=false` nos 8 tipos antigos (preserva FK · 1 card existente continua referenciando · UI não mostra mais)
- `INSERT` (ou UPDATE via ON CONFLICT) dos 16 tipos novos com SLAs sugeridos
- Antigos vão pro fim da ordenação (cosmético)
- Coluna `nome` ganha COMMENT explicativo do refator

**Frontend/Backend · sem mudança de código.** Lista de tipos vem dinâmica do banco via `/api/marketing/etiquetas` (filtra `ativo=true`). Cores aplicadas inline a partir de `etiqueta_tipo.cor`. Estimativa preliminar (Spec 010) usa `esforco_max_h` (Spec 016) que já existe.

**Eixo "destino"** (interno/externo/institucional/eventos_séries/campanhas) **intocado** — foco da Spec 017 foi só no eixo tipo.

**Tipos antigos** (`ativo=false`): redes_sociais · artes · pecas_fisicas · mockup (slug antigo) · videos · fotos · impressos · identidade_marca. O slug `mockup` é reusado pelo tipo novo (CONFLICT DO UPDATE atualiza ele) · os outros 7 ficam dormentes.

## Marketing · Spec 016 · Bugfix 3 telas + esforco_max (proposta A · 2026-05-28)

Após o piloto começar, Marcos identificou 3 telas com crash + propôs trocar
o conceito de `esforco_medio_h` (média histórica) por `esforco_max_h` (SLA acordado).

**Bugs corrigidos:**

1. **Calendário** (`/marketing/calendario`) crashava porque as funções SQL da Spec 005 (`fn_marketing_segunda_da_semana`, `fn_marketing_calcular_capacidade_semana`, `fn_marketing_estimar_prazo`) NÃO foram aplicadas em prod — a primeira aplicação da Spec 005 falhou em transação por causa do `tipo_kpi='tatico'`, e o fix subsequente só re-aplicou KPIs+trigger. Recriadas nesta migration.

2. **Analytics** (`/marketing/analytics`) endpoint `/analytics/kpis` retornava 500 porque o backend selecionava colunas erradas de `kpi_valores_calculados`. Schema real: `kpi_id`, `periodo_referencia`, `valor_calculado`, `detalhes` (jsonb), `calculado_em` · não `periodo`, `valor`, `observacao`, `updated_at`. Backend agora normaliza pra shape estável.

3. **Admin > Etiquetas** crashava porque o componente `TipoRow` tinha `<SelectItem value="">` (rejeitado pelo Radix Select). Trocado por sentinela `__none__` convertida pra string vazia no `setHab`.

**Mudança conceitual `esforco_max_h` (proposta A):**

- Renomeada coluna `marketing_etiquetas_tipo.esforco_medio_h` → `esforco_max_h`
- Significado: tempo MÁXIMO acordado (SLA interno) · "story precisa ficar pronto em 3h"
- Usado pra 3 coisas:
  1. **Estimativa preliminar pessimista** · `fn_marketing_estimar_prazo` agora usa o `_max`
  2. **Capacidade alocada conservadora** · soma os `_max` dos cards (não lota fácil)
  3. **Badge SLA individual no card do Kanban** (novo):
     - `(now − estado_atualizado_em) > esforco_max × 1.5` → badge vermelho `"12h · 2.0× SLA"`
     - `> esforco_max` mas ≤ 1.5× → badge âmbar `"acima do SLA"`
     - Aparece quando `estado='em_producao'` · prioriza sobre badge de prazo final

**Migration `20260528240000_marketing_bugfix_e_esforco_max.sql`:**
- Recria 3 funções SQL faltantes (idempotent · CREATE OR REPLACE)
- `ALTER TABLE marketing_etiquetas_tipo RENAME COLUMN esforco_medio_h TO esforco_max_h`
- Funções já usam o nome novo internamente

**Backend (`routes/marketing.js`, `routes/solicitacoes.js`, `services/kpiAutoCollector.js`):** refs de `esforco_medio_h` → `esforco_max_h`.

**Frontend:**
- `MarketingAdmin` aba Etiquetas · label "Máx (h)" + descrição explicativa
- `MarketingKanban` · novo `slaIndividual` no `KanbanCard` que prioriza sobre `atraso` quando `estado='em_producao'`

## Marketing · Spec 015 · Testes E2E + Cutover (2026-05-28) · FIM DA FASE 9

Conclui as 15 specs do módulo Marketing. Próxima fase é piloto interno + abertura
pra igreja (ver `docs/modulo-marketing/15-cutover-plan.md`).

**Suite Playwright (`e2e/tests/marketing.spec.ts`):**
- `/marketing` carrega Kanban com 4 colunas
- `/marketing/calendario` carrega com botão "Hoje"
- `/marketing/analytics` carrega com 4 cards de KPI
- Navegação header entre Kanban → Calendário → Analytics → Kanban

Rodar: `npm run test:e2e -- marketing.spec.ts`. Requer `E2E_TEST_EMAIL` + `E2E_TEST_PASSWORD` (recomendado Pedro Paiva · nível 5).

**Smoke manual obrigatório antes do go-live** (checklist completo em `15-cutover-plan.md` §2):
- Permissões: Pedro/equipe vê tudo · produtor edita só estado do próprio · diretores read-only · sem-área não vê menu
- Fluxo end-to-end: solicitação → aprovação Arthur → atribuição Pedro → trabalho Cauã → preview → aprovação solicitante → NPS → KPI atualizado
- Casos especiais: diretor cria (dispensa) · membro sem RH (403) · evento gera card · task interna · rejeição imutável
- Calendário + Analytics · variantes coordenador vs colaborador
- **Smoke transversal**: solicitação cozinha + manutenção ainda funcionam (Spec 001 mexeu no backbone)

**Plano de cutover (`15-cutover-plan.md` §3):**
- T-7 dias: comunicação geral + Cérebro CBRio
- T-3 dias: treinamento Pedro+equipe (15min) + diretores (5min cada)
- T-0: soft launch · piloto interno 2 semanas só com Marketing usando
- T+14: abertura oficial pra igreja

**Pendências deferred (Fase 11):**
- Aline cadastrada (Pedro/Marcos via admin)
- Escalação automática >24h pra super-admin
- Modo pico fev/mai (D-08)
- Forecasting automático (D-08)
- Auto-calibragem de `esforco_medio_h`

**Critérios de "pronto pra abrir pra igreja"** (`15-cutover-plan.md` §5):
- [x] 15 specs implementadas e mergeadas
- [x] Migrations aplicadas em produção
- [x] Smoke automatizado
- [ ] Smoke manual completo
- [ ] Piloto 2 semanas sem incidentes
- [ ] `esforco_medio_h` calibrado
- [ ] Pedro Paiva usa sem suporte
- [ ] 3 diretores aprovaram ≥1 solicitação cada

## Marketing · Spec 014 · Notificações (10 eventos) (2026-05-28)

Spec 014 finaliza o sistema de notificações do módulo. Maioria já implementada nas specs anteriores · esta iteração fecha as 2 que faltavam + registra `marketing` no admin de regras.

**Eventos implementados (10):**

| # | Evento | Quem implementou | Trigger |
|---|---|---|---|
| 1 | Solicitação aguardando aprovação → diretor | Spec 001 | POST `/solicitacoes` |
| 2 | Aprovada pelo diretor → solicitante + responsável | Spec 001 | PATCH `/aprovar-origem` |
| 3 | Rejeitada pelo diretor → solicitante | Spec 001 | PATCH `/rejeitar-origem` |
| 4 | Aguardando aprovação há 24h → diretor (cron) | Spec 001 | `gerarNotificacoesSolicitacoes` |
| 5 | Card atribuído → produtor | Spec 004 | POST `/cards` + PATCH atribuir |
| 6 | **Prazo confirmado** → solicitante | **Spec 014** | PATCH `/cards/:id` (prazo_confirmado mudou) |
| 7 | Urgência aceita/recusada → solicitante | Spec 004 | PATCH `/decidir-urgencia` |
| 8 | Preview pronto (aguardando_solicitante) → solicitante | Spec 004 | PATCH `/cards/:id` (estado mudou) |
| 9 | Concluído → solicitante (pede NPS) | Spec 004 + Spec 012 | PATCH `/cards/:id` (estado=concluido) ou `/aprovar-entrega` |
| 10 | **Aguardando solicitante há 24h → solicitante** (cron) | **Spec 014** | `gerarNotificacoesMarketing` |

**Plus (não estavam na lista original mas valem):**
- Revisão sugerida → produtor (Spec 004)
- Aprovação hierárquica há 24h → diretor (Spec 001)
- Arquivo final anexado → solicitante (Spec 006)
- Entrega aprovada pelo solicitante → produtor (Spec 012)

**Backend novo (`routes/marketing.js`):**
- PATCH `/cards/:id` detecta `prazo_confirmado` mudando · dispara notificação se valor novo é não-nulo

**Backend novo (`services/notificacaoGenerator.js`):**
- `gerarNotificacoesMarketing()` busca cards `aguardando_solicitante` há ≥24h
- Notifica solicitante (1x/dia/card via chaveDedup com data)
- Registrado em `gerarTodasNotificacoes`

**Frontend (`pages/admin/NotificacaoRegras.jsx`):** array `MODULOS` ganha entrada `marketing` (rosa) com descrição dos eventos · admin pode configurar quem recebe cada categoria de notificação.

**Spec autônoma · sem migration.**

## Marketing · Spec 013 · Analytics /marketing/analytics (2026-05-28)

Dashboard de KPIs do módulo + bloco gargalo de aprovação dos diretores.

**Endpoints novos em `backend/routes/marketing.js`:**
- `GET /analytics/kpis?semanas=N` (nível 1) · retorna `{ snapshot, serie }` com os 4 KPIs MKT-* (last value + série temporal)
- `GET /analytics/aprovacoes-origem?dias=N` (nível 1) · tempo médio que cada diretor leva pra aprovar solicitações da área Marketing (gargalo se > 24h)

**Página nova: `src/pages/marketing/MarketingAnalytics.jsx`**
- Rota: `/marketing/analytics` · `moduleSlug=marketing nivelMinimo=1`
- 4 cards de snapshot · MKT-PRAZO · MKT-LEAD · MKT-THROUGHPUT · MKT-DEM-CAP
  - Badge "fora da meta" quando o valor está pior que meta
  - Ícone temático + cor por KPI
  - Observação do coletor abaixo
- Gráfico de linha temporal (recharts · LineChart) das 4 séries · seletor 4/8/12/24/52 semanas
- Bloco "Tempo médio de aprovação por diretor de origem" · lista os 3 diretores com tempo médio em horas · badge "gargalo" quando > 24h
- Header com botões Kanban/Calendário/(Admin)

**Header do Kanban:** botão "Analytics" adicionado pro todo mundo (nível 1+) — substitui necessidade do solicitante navegar manualmente.

**api.js:** namespace `marketing.analytics.{kpis,aprovacoesOrigem}`.

**Spec autônoma · sem migration.**

## Marketing · Spec 012 · Revisão (1x) + Aguardando + NPS (2026-05-28)

Solicitante revisa preview, aprova entrega ou pede revisão direto na aba
Minhas de `/solicitacoes`.

**Endpoint novo · `PATCH /api/marketing/cards/:id/aprovar-entrega`:**
- Permissão: solicitante do card (via `card.solicitacao.solicitante_id`) OU admin Marketing
- Estado precisa estar em `aguardando_solicitante` ou `em_producao`
- Move card pra `concluido` · notifica produtor · marca `solicitacao.status='concluido'` (acionando NPS via fluxo existente)

**Backend (`routes/solicitacoes.js` GET /):**
- Enriquece solicitações com `marketing_card` (id, estado, tem_revisao, prazo, atribuido, entregue_em) quando `area_responsavel='marketing'`

**Frontend (`Solicitacoes.jsx`):**
- Novo componente `MarketingCardBlock` dentro do DetailDialog (só aparece se `item.categoria='marketing'` e user é solicitante)
- Mostra:
  - Status do card (Na fila / Em produção / Aguardando sua revisão / Concluído)
  - Selo "Já teve revisão (1x)" quando aplicável
  - Lista de entregáveis (preview/download via signed URL do Graph)
- Botões aparecem só quando `estado='aguardando_solicitante'`:
  - **Aprovar entrega** → muda pra concluído + dispara NPS
  - **Sugerir revisão (1x)** → modal de motivo · só aparece se `!card.tem_revisao` · após uso some
- `api.js` ganha `marketing.aprovarEntrega(id)`

**Integração com NPS existente:**
- Quando solicitante aprova entrega · backend marca solicitação como `concluido`
- O `NpsBlock` (já existia no Solicitacoes.jsx) detecta `status='concluido' + nps_nota IS NULL` e mostra o form de avaliação
- KPIs `ADM-C-*-Q` alimentados automaticamente (trigger SQL existente)

**Spec autônoma · sem migration.**

## Marketing · Spec 011 · Aba Aprovar enriquecida com Marketing (2026-05-28)

Spec 011 já estava implementada na Spec 001 (aba "Aprovar", badge contador, lista,
botões Aprovar/Rejeitar com modal de motivo). Esta iteração agrega visibilidade do
contexto Marketing pro diretor decidir com mais informação.

**Backend (`routes/solicitacoes.js` GET /):**
- Resposta enriquecida com `marketing_tipo` e `marketing_destino` (objetos com nome/cor/habilidade_padrao/esforco_medio_h)
- Faz JOIN só quando há `marketing_tipo_id` ou `marketing_destino_id` no resultset

**Frontend (`Solicitacoes.jsx` AprovacaoOrigemCard):**
- Mostra área alvo (`area_responsavel`) e data necessária no subtitle do card
- Badge das etiquetas Marketing (tipo+destino) quando `categoria='marketing'`, coloridas pelo cor do banco
- Texto "sugere {habilidade}" derivado de `tipo.habilidade_padrao`

**Spec autônoma · sem migration.**

## Marketing · Spec 010 · Bloco Marketing em /solicitacoes/nova (2026-05-28)

Estende form de criação de Solicitações com bloco específico para Marketing.

**Migration `20260528220000_solicitacoes_marketing_etiquetas.sql`:**
- 2 colunas em `solicitacoes`: `marketing_tipo_id` (FK marketing_etiquetas_tipo) + `marketing_destino_id` (FK marketing_etiquetas_destino) · ambas NULL aceito
- Atualiza `fn_marketing_cards_solicitacao_sync` (Spec 004) para propagar etiquetas pro card automaticamente
- Quando card é materializado · trigger chama `fn_marketing_estimar_prazo` e preenche `prazo_preliminar` no card
- Backfill: cards já criados pegam etiquetas da solicitação correspondente se estavam vazias

**Backend (`routes/solicitacoes.js`):** POST aceita os 2 campos novos quando `categoria='marketing'`.

**Frontend (`pages/Solicitacoes.jsx`):**
- Bloco rosa "Detalhes da demanda (Marketing)" aparece quando `categoria='marketing'`
- Selects de tipo (8) + destino (5) · ambos opcionais (Pedro pode definir depois)
- Texto "Habilidade sugerida: X" baseado em `tipo.habilidade_padrao`
- **Estimativa preliminar** (debounce 350ms) chama `GET /api/marketing/estimar?tipo=X&data_alvo=Y`:
  - Mostra "Estimativa preliminar: DD/MM/YYYY (N dias úteis)"
  - Mostra observação do backend (cobrindo "tipo não calibrado" ou "equipe sem capacidade")
- Etiquetas carregadas lazy (só quando categoria='marketing' selecionada)

**Fluxo end-to-end:**
1. Pr. Wesley cria solicitação categoria=marketing
2. Pré-seleciona Tipo='Artes' Destino='Eventos e Séries'
3. Vê estimativa preliminar antes de enviar
4. Após aprovação do Pedro Menezes (Spec 001), trigger cria card com etiquetas + prazo preliminar já preenchidos
5. Pedro Paiva ajusta no Kanban se necessário

## Marketing · Spec 009 · Admin /marketing/admin (2026-05-28)

CRUD admin pra Pedro/Marcos editarem o módulo sem precisar de migration.

**Página nova: `src/pages/marketing/MarketingAdmin.jsx`** com 4 abas:

| Aba | CRUD |
|---|---|
| **Membros** | listar · editar inline (horas/observação/ativo) · adicionar via Dialog · soft-delete |
| **Etiquetas** | tipos (8) + destinos (5) · editar inline (esforço · habilidade · cor · ativo) · novos via futura iteração |
| **Recorrentes** | listar · adicionar · remover (soft-delete) |
| **Overrides** | listar · adicionar (membro · semana · horas · motivo) · remover · UNIQUE(membro, semana) |

**Endpoints novos em `backend/routes/marketing.js` (todos exigem nível 5):**
- `GET/POST/PATCH/DELETE /admin/membros[/:id]`
- `GET/POST/PATCH /admin/etiquetas/tipo[/:id]`
- `GET/POST/PATCH /admin/etiquetas/destino[/:id]`
- `GET/POST/PATCH/DELETE /admin/recorrentes[/:id]`
- `GET/POST/PATCH/DELETE /admin/overrides[/:id]`

**Rotas:**
- `/marketing/admin` · `moduleSlug=marketing nivelMinimo=5`

**Header do Kanban:** botão "Admin" (só pra coordenador) ao lado de Calendário.

**Calibragem do `esforco_medio_h`:** começa NULL nas 8 etiquetas (Spec 002). Aba Etiquetas permite Pedro/Marcos preencher após algumas semanas de cycle time real. NULL → estimativa volta "tipo não calibrado".

**Novo membro:** dropdown filtra `profiles.area ILIKE 'criativo'` (Aline pendente vai aparecer aqui quando o profile dela existir).

**API client (`src/api.js`):** `marketing.admin.{membros,etiquetasTipo,etiquetasDestino,recorrentes,overrides}.{list,create,update,remove}`.

**Spec autônoma · sem migration.**

## Marketing · Spec 008 · Frontend Calendário /marketing/calendario (2026-05-28)

Visualização semanal de capacidade da equipe · grid 7 dias × N membros consumindo
`GET /api/marketing/capacidade` (Spec 005).

**Página nova: `src/pages/marketing/MarketingCalendario.jsx`**
- Rota: `/marketing/calendario` · `moduleSlug=marketing nivelMinimo=1`
- Grid: 1 linha por membro × 7 colunas (Seg-Dom · ISO week)
- Linha do membro mostra: nome · habilidade · `horas_alocadas / horas_disponiveis · %` (vermelho se sobrecarga)
- Célula do dia mostra:
  - Compromissos recorrentes (Aline dom/Allan qua/Lorena seg-sáb) com ícone de repetição · cor cinza
  - Cards com prazo (confirmado OU preliminar) naquele dia · cor da etiqueta tipo · selo ⚡ se urgente
  - Vazio: cinza claro
- Navegação ±semana + botão "Hoje"
- Legenda visual no header (Recorrente · Urgente · Atrasado)
- Variantes:
  - **Coordenador (Pedro · admin)** vê todos os membros
  - **Colaborador (nível 3 via boost)** vê só a própria linha (filtro client-side por `profile_id`)
- Click num card abre Drawer com resumo · link "Abrir no Kanban" pra editar

**Header do Kanban (`MarketingKanban.jsx`):** ganhou botão "Calendário" pra alternar entre as 2 views.

**Realtime: não** (calendário é snapshot semanal · não precisa channel · usuário aperta "Atualizar" navegando).

**Layout responsivo:** overflow-x-auto · grid mínimo 700px · mobile faz scroll horizontal preservando legibilidade. Mesmo padrão do calendário de cultos em `/integracao`.

## Marketing · Spec 007 · Frontend Kanban /marketing (2026-05-28)

Primeira tela do módulo · Kanban completo com 4 colunas, filtros, drawer de detalhe e upload SharePoint integrado.

**Página nova: `src/pages/marketing/MarketingKanban.jsx`**
- 4 colunas: Fila · Em produção · Aguardando solicitante · Concluído
- Filtros (top): origem · tipo · destino · membro atribuído
- Drag-and-drop (Pedro Paiva + admins) entre estados · realtime via Supabase channel
- Card mostra: badge origem · etiqueta tipo+destino (com cor do banco) · atribuído · prazo · selos urgência/revisão · atraso em horas/dias
- Drawer lateral (Sheet) de detalhe + edição com:
  - Bloco "Origem · Solicitação" quando aplicável (mostra solicitante)
  - Form de edição (título · descrição · tipo · destino · atribuído · prazo · estado · raia rápida)
  - **Entregáveis** com upload (Spec 006 integrado) · link direto pra download Graph
  - Botão "Salvar" · "Cancelar" · "Excluir" (só admin · nível 5)
- Botão "+ Nova task interna" (só admin · nível 5) abre Dialog com form (origem='interna')
- Borda do card colorida:
  - Vermelha = urgente (`raia_rapida`)
  - Âmbar = revisão (`tem_revisao`)
  - Primary teal = padrão

**Rotas (`src/App.tsx`):**
- `/marketing` · `ModuleGuard moduleSlug="marketing" nivelMinimo=1` (read pra diretoria · 3+ pra equipe via boost)

**Menu (`AppShell.jsx`):**
- Item "Marketing" adicionado em Ministerial > Áreas (junto com Online/Kids/AMI/Bridge)
- `module: 'marketing'` · aparece pra quem tem leitura ≥ 1
- Item antigo `/criativo/marketing` removido (rota não existia)

**Comportamento `produtor vs coordenador`:**
- Coordenador (nível 5 via boost de área) · edita tudo · drag-and-drop · cria task interna · exclui
- Produtor (nível 3 via boost · todos os assistentes-marketing) · vê tudo · só pode trocar **estado** dos próprios cards (RLS no SQL + check no backend duplicam · UI já bloqueia campos no Drawer)
- Solicitante (nível 0 no módulo) · não acessa o Kanban · vê só preview do próprio card pelo módulo Solicitações (Spec 012)

**Realtime:** Supabase channel em `marketing_kanban_cards` recarrega lista quando qualquer card muda (debounced 500ms).

**Mobile responsivo:** colunas viram 1 (xs), 2 (md), 4 (xl). Drawer vira full-width no mobile.

## Marketing · Spec 006 · Upload SharePoint via Microsoft Graph (2026-05-28)

Spec 006 fecha o backend do módulo (Fase B Core). Entregáveis (arquivos finais
dos cards) vão pra biblioteca **Criativo** do CBRio Hub via Microsoft Graph,
reusando o pipeline do Cérebro/storageService.

**Serviço novo · `backend/services/sharepointMarketing.js`:**
- `uploadEntregavel({ cardId, userId, file })` · sobe pra `Criativo / Marketing / YYYY / YYYY-MM / <card-prefix>_<timestamp>_<nome>` + grava em `marketing_entregaveis`
- `listarEntregaveis(cardId)` · select do banco
- `getDownloadUrl(entregavelId)` · Graph retorna `@microsoft.graph.downloadUrl` com TTL ~1h
- `removerEntregavel(entregavelId, userId)` · soft-delete via UPDATE
- Retry exponencial (3 tentativas · 500ms / 1s / 2s) no upload
- Limite: 50 MB por arquivo
- Path sanitizado: tira acentos, troca espaços por `_`, max 120 chars

**Endpoints adicionados em `backend/routes/marketing.js`:**

| Endpoint | Nível min | Função |
|---|---|---|
| `GET /api/marketing/cards/:id/entregaveis` | 1 (com check de ownership do solicitante) | Lista arquivos do card |
| `POST /api/marketing/cards/:id/entregaveis` | 3 | Upload multipart (campo `arquivo`) |
| `GET /api/marketing/entregaveis/:id/download` | 1 (com ownership) | Redirect 302 pra signed URL do Graph |
| `DELETE /api/marketing/entregaveis/:id` | 5 | Soft delete |

**Ownership do solicitante:** RLS já bloqueia `marketing_entregaveis` pra quem não é da equipe Marketing, mas o backend duplica o check pra UX. Solicitante vê e baixa entregáveis dos próprios cards (`card.solicitacao_id` → `solicitacoes.solicitante_id = auth.uid()`).

**Frontend (`src/api.js`):** `marketing.entregaveis.list(cardId)`, `marketing.entregaveis.upload(cardId, file)`, `marketing.entregaveis.download(id)` (retorna URL pra `<a href>`), `marketing.entregaveis.remove(id)`.

**Notificação automática:** quando arquivo é anexado a um card já em `estado=concluido`, o solicitante recebe ping "Arquivo final pronto · disponível pra download".

**Reuso de infra · sem novas envs:** consome `MICROSOFT_TENANT_ID`, `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET`, `SHAREPOINT_SITE_ID` (mesmos do Cérebro). Bibliote `Criativo` no CBRio Hub já existe e está mapeada em `MODULE_LIBRARY_MAP`.

**Fallback:** se SharePoint não estiver configurado, upload falha com erro claro (não usa Supabase Storage como fallback aqui · arquivo de marketing precisa estar no SharePoint pra equipe acessar).

## Marketing · Spec 005 · Estimativa + capacidade + 4 KPIs (2026-05-28)

Conclui a Fase B Core (parte backend) · agora o módulo tem inteligência operacional
em cima do schema das specs 002-004.

**Migration `20260528200000_marketing_kpis_capacidade.sql`:**
- Helper `fn_marketing_segunda_da_semana(date)` · ISODOW → 1-7
- `fn_marketing_calcular_capacidade_semana(p_data_ref)` → 1 linha por membro:
  - `horas_base`, `horas_recorrentes`, `horas_override`, `horas_disponiveis`, `horas_alocadas`, `horas_livres`
  - Lógica: `disponiveis = COALESCE(override, base - recorrentes)` · `livres = disponiveis - alocadas`
- `fn_marketing_estimar_prazo(p_tipo_id, p_data_alvo)` → JSONB com `data_sugerida`, `dias_uteis`, `esforco_h`, `capacidade_dia`, `observacao`
  - Heurística MVP: `dias = ceil(esforço / (capacidade_diária × 0.6))` · `data_sugerida = max(hoje + dias + 1, data_alvo)`
  - Fator 60% reserva capacidade pra recorrentes + cards de evento
  - Sem `esforco_medio_h` → retorna estimativa cruzada com "tipo não calibrado · Pedro confirma depois"
- 4 KPIs novos (`valores='{}'::text[]` · não entram na mandala):

| ID | Indicador | Periodicidade | Meta | Fonte auto |
|---|---|---|---|---|
| `MKT-PRAZO` | % de demandas no prazo | semanal | ≥85% | `marketing.prazo_no_alvo` |
| `MKT-LEAD` | Lead time médio (dias) | semanal | ≤7 | `marketing.lead_time_medio` |
| `MKT-THROUGHPUT` | Cards entregues/semana | semanal | ≥5 | `marketing.throughput` |
| `MKT-DEM-CAP` | Razão demanda/capacidade (%) | semanal | ≤100 | `marketing.razao_demanda_capacidade` |

- Trigger `tg_marketing_cards_recalc_kpis_{ins,upd,del}` (AFTER STATEMENT) chama `kpi_recalcular_para_data(CURRENT_DATE)` quando cards mudam · pattern de dados_brutos.

**Coletores adicionados em `backend/services/kpiAutoCollector.js`:**
- `marketing.prazo_no_alvo` · % `entregue_em <= prazo_confirmado` sobre total entregue na semana
- `marketing.lead_time_medio` · avg `entregue_em - created_at` em dias
- `marketing.throughput` · count cards entregues na semana
- `marketing.razao_demanda_capacidade` · SNAPSHOT atual (não depende do período · soma esforço fila ÷ capacidade livre da semana corrente)

**Endpoints novos em `backend/routes/marketing.js`:**
- `GET /api/marketing/capacidade?semana=YYYY-MM-DD` · capacidade por membro (enriquecida com profile.name)
- `GET /api/marketing/estimar?tipo=<uuid>&data_alvo=YYYY-MM-DD` · estimativa preliminar via RPC

**Frontend (`src/api.js`):** namespace `marketing` ganhou `capacidade(semana)` e `estimar(tipo, dataAlvo)`.

**Calibragem:** `esforco_medio_h` das etiquetas começa NULL (Spec 002). Pedro/Marcos preenche via UI admin (Spec 009) baseado em cycle time real após algumas semanas no ar.

## Marketing · Spec 004 · Backend CRUD cards + sync triggers (2026-05-28)

Backend completo do Kanban + 2 triggers SQL que materializam cards
automaticamente a partir de Solicitações e do ciclo criativo de Eventos.

**Migration `20260528180000_marketing_cards_sync_triggers.sql`:**
- `fn_marketing_cards_solicitacao_sync` · AFTER INSERT/UPDATE em `solicitacoes`
  - Dispara quando `area_responsavel='marketing'` E status muda pra `pendente`
  - Cria card com `origem='solicitacao'` · idempotente via UNIQUE parcial
  - `raia_rapida=true` se `urgencia_decisao='aceita'` (Pedro decide depois no card)
- `fn_marketing_cards_evento_sync` · AFTER INSERT em `event_tasks`
  - Dispara quando `area ILIKE 'marketing'`
  - Cria card com `origem='evento'`, `prazo_preliminar = event_task.deadline`
- Backfill defensivo · solicitações em `pendente` + event_tasks de marketing pré-existentes ganham card no momento da migration

**Backend `backend/routes/marketing.js` (novo · montado em `/api/marketing`):**

| Endpoint | Nível mínimo | Função |
|---|---|---|
| `GET /etiquetas` | 1 | Catálogo tipos + destinos (ativos) |
| `GET /membros` | 1 | Equipe Marketing ativa (com profile.name) |
| `GET /compromissos-recorrentes` | 1 | Slots fixos |
| `GET /cards` | 1 | Lista (filtros: estado · origem · etiqueta · atribuido_a · raia_rapida) |
| `GET /cards/:id` | 1 | Detalhe + entregáveis |
| `POST /cards` | 5 | Task interna (origem='interna') |
| `PATCH /cards/:id` | 3 | Atualizar (produtor edita só `estado` do próprio · admin edita tudo) |
| `PATCH /cards/:id/sugerir-revisao` | qualquer | Solicitante OU produtor OU admin · 1x (D-14) |
| `PATCH /cards/:id/decidir-urgencia` | 5 | Pedro aceita/recusa raia rápida com motivo |
| `DELETE /cards/:id` | 5 | Soft delete via `app_soft_delete` |

**Notificações disparadas pelo backend:**
- Card atribuído → produtor
- Card → `aguardando_solicitante` → solicitante (preview pronto)
- Card → `concluido` → solicitante (pedir NPS)
- Revisão sugerida → produtor (com motivo)
- Urgência aceita/recusada → solicitante

**Decisões de permissão:**
- Produtor (`assistente-marketing` + área Marketing · nível 5 via boost) pode editar **apenas `estado`** dos próprios cards. RLS bloqueia outros campos pelo CHECK do middleware.
- Coordenador (Pedro Paiva · nível 5 via boost) edita tudo.
- POST `/cards` exige nível 5 (Pedro abre tasks internas)
- RLS no SQL **também** bloqueia produtor editando outros cards · backend só duplica check pra mensagem clara.

**Frontend (`src/api.js`):** namespace `marketing` com `etiquetas`, `membros`, `recorrentes`, `cards`, `card`, `criarCard`, `atualizarCard`, `removerCard`, `sugerirRevisao`, `decidirUrgencia`.

**Notas operacionais:**
- Solicitações criadas ANTES da migration ficam invisíveis ao Kanban a menos que estejam em `pendente` (backfill cobre).
- Card `solicitacao_id IS NOT NULL` reflete a solicitação no Solicitações · update do card NÃO mexe na solicitação (status sincronizado só na conclusão final, na Spec 012).
- Se solicitação for soft-deletada, FK fica com SET NULL (não quebra o card).

## Marketing · Spec 003 · Seed inicial (2026-05-28)

Spec 003 conclui a Fase A (Fundação). Após esta migration o módulo `/marketing`
aparece no menu pra equipe e o Pedro Paiva ganha nível 5 automático via boost.

**Migration `20260528160000_marketing_seed_inicial.sql`:**
- INSERT módulo `marketing` em `public.modulos` (rota `/marketing`, categoria ministerial, ordem 390)
- Seed matriz `cargo_modulo_permissao`:
  - `dev` · 5 + exportar + aprovar
  - `coordenador-marketing` (Pedro Paiva) · 3 base + boost via área Marketing → 5
  - `assistente-marketing` (Allan/Cauã/Letícia/Lorena Pariz) · 3 + escopo_proprio + boost → 5
  - `diretor-criativo` (Pedro Menezes) · 1 read
  - `diretor-ministerial` (Arthur) · 1 read
  - `diretor-administrativo` (Eduardo) · 1 read
  - `coordenador-estrategia`, `pastor-senior`, `pastor-presidente` · 1 read
  - Demais cargos · 0
- Estende `current_user_module_level()` SQL: adiciona `'marketing'` na lista de boost por área
- Seed `marketing_membros` (4 confirmados via pre-flight):
  - Allan Santana (videomaker · 40h/sem)
  - Cauã Pedreti (designer · 40h/sem · sem recorrente fixo)
  - Letícia Baldner (social_media_assistente · 30h/sem · sem recorrente)
  - Lorena Pariz (social_media · 40h/sem)
- Seed `marketing_compromissos_recorrentes`:
  - Allan · quarta 14:00 · 4h (preliminar · refinar)
  - Lorena Pariz · seg-sáb 09:00 · 3h/dia
- Aline (fotógrafa) · **PENDENTE** · sem profile/email · Pedro/Marcos cadastra via UI admin (Spec 009)

**Backend `middleware/auth.js`:**
- `ROUTE_MODULE_MAP['marketing']` = `['marketing']`
- `ROUTE_MODULE_MAP['marketing-admin']` = `['marketing']`
- `AREA_MODULO_BOOST['marketing']` = `'marketing'`

**Após aplicar a migration:**
1. Rodar bust de cache: `POST /api/permissoes/cache/bust` ou botão em `/admin/permissoes`
2. Pedro Paiva + os 4 assistentes precisam fazer logout/login pra renovar JWT (novo módulo no perms cache)
3. Item de menu "Marketing" começa a aparecer pra equipe

**Fluxo de permissão pós-migration:**
- Pedro Paiva (`coordenador-marketing` + área `Marketing`) → nível 5 (admin do módulo via boost)
- Allan/Cauã/Letícia/Lorena Pariz (`assistente-marketing` + área `Marketing`) → nível 5 via boost (mesmo padrão de Kids/AMI/Bridge/Online)
- Arthur Serpa / Eduardo / Pedro Menezes → nível 1 (read · analytics)
- Pastores seniores → nível 1 (read)
- Solicitante comum → 0 (não acessa o módulo · acompanha via `/solicitacoes` na aba "Minhas")

## Marketing · Spec 002 · Schema base do Marketing (2026-05-28)

7 tabelas novas + triggers + RLS + indices + whitelist soft-delete. Migration
`20260528140000_marketing_schema.sql`.

**Tabelas:**

| Tabela | Propósito | Volume/ano |
|---|---|---|
| `marketing_membros` | Equipe + habilidade (1 por membro · UNIQUE profile_id + habilidade) | ~10 |
| `marketing_etiquetas_tipo` | Catálogo 8 valores · `esforco_medio_h` editável (calibra via cycle time) | 8 |
| `marketing_etiquetas_destino` | Catálogo 5 valores | 5 |
| `marketing_kanban_cards` | 3 origens (solicitacao/evento/interna) + estado + ordem_fila bigserial | ~520 |
| `marketing_entregaveis` | Arquivos SharePoint (Spec 006 popula) | ~520 |
| `marketing_capacidade_override` | Férias/picos/atípicos por semana | ~50 |
| `marketing_compromissos_recorrentes` | Slots fixos (Aline dom · Allan qua · Lorena diário) | 3-10 |

**Decisões arquiteturais:**
- `evento_task_id` referencia **`event_tasks`** (não "kanban_tasks" como doc original sugeria · confirmado via information_schema).
- CHECK constraint forte em `marketing_kanban_cards`: a FK correta depende do `origem` (solicitacao_id NOT NULL apenas se origem='solicitacao' etc).
- `ordem_fila bigserial` · revisão (D-14) atualiza pro fim da fila via trigger `fn_marketing_cards_estado_ts`.
- UNIQUE parcial em `solicitacao_id` e `evento_task_id` (`deleted_at IS NULL`) garante **1 card por origem** (idempotência pros triggers de sync na Spec 004).
- Soft-delete em 5 tabelas (etiquetas catálogo não · usar `ativo` boolean).
- Audit log em `marketing_kanban_cards` (estado, atribuido_a, prazo_confirmado, tem_revisao, raia_rapida, deleted_at).

**RLS por tabela:**

| Tabela | SELECT | INSERT/UPDATE | DELETE |
|---|---|---|---|
| `marketing_membros` | nível≥1 OU super-admin | nível≥5 OU super-admin | super-admin |
| `marketing_etiquetas_tipo` | todos auth (catálogo) | nível≥5 OU super-admin | super-admin |
| `marketing_etiquetas_destino` | todos auth | nível≥5 OU super-admin | super-admin |
| `marketing_kanban_cards` | nível≥3 OR card.solicitacao_id pertence ao auth.uid() | INSERT nível≥5 + origem='interna' / UPDATE nível≥5 OU produtor do card | super-admin |
| `marketing_entregaveis` | nível≥3 OR via solicitacoes do auth.uid() | nível≥3 + enviado_por=auth.uid() | super-admin |
| `marketing_capacidade_override` | nível≥1 | nível≥5 | super-admin |
| `marketing_compromissos_recorrentes` | nível≥1 | nível≥5 | super-admin |

Todas têm `service_role FOR ALL USING(true)` (backend bypassa RLS).

**Trigger `fn_marketing_cards_estado_ts`:**
- BEFORE UPDATE
- Atualiza `estado_atualizado_em` quando muda estado (cycle time)
- Preenche `entregue_em` na transição para `concluido`
- Atualiza `ordem_fila` pro fim quando `tem_revisao` vira true (D-14)
- Atualiza `updated_at`

**Pendência (resolve na Spec 003):** seeds da equipe + módulo `marketing` em
`public.modulos` + boost `AREA_MODULO_BOOST['marketing']` em
`backend/middleware/auth.js`. Schema sozinho não dá acesso a ninguém.

## Marketing · Spec 001 · Aprovação hierárquica no Solicitações (TRANSVERSAL · 2026-05-28)

Primeira spec do módulo Marketing · **mudança transversal** no backbone de
Solicitações que afeta TODAS as áreas (cozinha, manutenção, financeiro, etc),
não só Marketing.

**O que mudou:**
- Toda nova solicitação **passa primeiro pelo diretor de origem** do setor do
  solicitante antes de cair na fila da área responsável.
- 3 setores oficiais (Marcos 2026-05-28):

  | Setor | Diretor |
  |---|---|
  | Gestão | Eduardo Gnisci |
  | Criativo | Pedro Menezes |
  | Ministerial | Arthur Serpa |

- `profile.area` mapeada pra setor via `fn_normalizar_setor()` (normaliza
  acento + Voluntariado → Ministerial).
- **Dispensam aprovação** (passa direto pra pendente):
  - Diretores de setor (Eduardo, Pedro Menezes, Arthur)
  - Diretoria geral (`is_diretoria_geral=true` · Pedrão, Juninho, etc)
  - Service role + caller sem `auth.uid()`
- **Fallback super-admins** (Marcos + Matheus) quando diretor não está
  mapeado · solicitação é dispensada e fica como "pre-resolvida".
- **Membros não-funcionários** (sem `rh_funcionarios` ativo) **não criam**
  solicitação · trigger `BEFORE INSERT` lança 42501. Backend retorna 403
  com mensagem clara.
- **Rejeitada é imutável** (Marcos 2026-05-28: "não, não pode reabrir").
  Solicitante cria nova com ajustes.

**Schema · 8 colunas novas em `solicitacoes`:**
`aprovacao_origem_diretor_id`, `aprovacao_origem_status` (pendente/aprovada/
rejeitada/dispensada), `aprovacao_origem_em`, `aprovacao_origem_motivo`,
`urgencia_decisao` (nao_aplicavel/pendente/aceita/recusada), `urgencia_decidida_por`,
`urgencia_motivo_recusa`, `urgencia_decidida_em`.

**Novo status no kanban:** `aguardando_aprovacao_origem` · vem antes de `pendente`.

**Tabela `setor_diretor`:**
- PK `setor` (text) · `diretor_id` UUID FK profiles · `diretor_nome` snapshot.
- Apenas super-admin altera (RLS).

**Backend (`backend/routes/solicitacoes.js`):**
- `GET /api/solicitacoes?aba=aprovar` filtra a fila do diretor (`aprovacao_origem_diretor_id = me` AND status=pendente).
- `PATCH /api/solicitacoes/:id/aprovar-origem` · diretor aprova → status='pendente'.
- `PATCH /api/solicitacoes/:id/rejeitar-origem` · motivo obrigatório · status='rejeitado' imutável.
- `GET /api/solicitacoes/meu-papel` agora retorna `eh_diretor_origem`, `setor_origem`, `pendentes_origem` (contador).
- `isAdminFallback()` helper · super-admin pode aprovar/rejeitar como fallback.
- Trigger lança 42501 pra não-funcionário · backend traduz pra HTTP 403.

**Frontend (`src/pages/Solicitacoes.jsx`):**
- Nova aba "Aprovar" com badge contador · visível só pra diretor de origem.
- Componente `AprovacaoOrigemCard` · botões inline Aprovar/Rejeitar com modal de motivo.
- View `aprovar` é default pro diretor com fila pendente > 0.
- Status `aguardando_aprovacao_origem` mostrado em violeta no badge.
- `api.js` ganhou `solicitacoes.aprovarOrigem(id)` e `solicitacoes.rejeitarOrigem(id, motivo)`.

**Notificações novas (`notificacaoGenerator.js`):**
- Imediata · `solicitacao_aprovacao_origem` quando solicitação cai no diretor.
- Imediata · aprovada → solicitante + responsáveis da área alvo.
- Imediata · rejeitada → solicitante com motivo.
- Cron diário · `solicitacao_aprovacao_origem_lembrete` pra solicitações
  paradas >24h aguardando diretor (1/dia por solicitação).

**Audit log:** trigger `trg_audit_solicitacoes` agora captura mudanças em
`aprovacao_origem_*`, `urgencia_*`, `status`, `deleted_at`, `nps_nota`.

**Migration `20260528120000_solicitacoes_aprovacao_hierarquica.sql`:**
- Idempotente · `IF NOT EXISTS`, `ON CONFLICT DO UPDATE`, `DROP IF EXISTS`.
- Backfill: solicitações pré-existentes ficam `dispensada` com motivo "Pre-migration · backward compat".
- Seta `is_diretoria_geral=true` em Eduardo e Pedro Menezes.

**O que NÃO mudou:**
- Fluxo pós-aprovação (pendente → em_atendimento → concluído → avaliado) idêntico.
- Aprovação financeira por alçada continua funcionando como segunda etapa.
- Solicitações abertas antes da migration seguem o fluxo antigo (status `aguardando_aprovacao_origem` não retroage).

**Pendência da Spec 001:** Aline (fotógrafa) ainda não tem profile/email
cadastrado · será resolvido na Spec 003 ou via admin Marketing (Spec 009).

## Bot WhatsApp · coleta passiva de dados de líderes (2026-05-27)

Líder manda os números da semana em texto livre no WhatsApp · webhook
Meta Cloud API → parse com Claude Haiku → cai numa fila pendente que o
coordenador confirma. **Nada é aplicado automaticamente** (review-before-apply,
mesmo padrão do mobile `cultos_dados_submissoes`). Cobaias: Grupos + Integração.

### Migration `20260527120000_whatsapp_coleta.sql`
- `whatsapp_lideres` · vínculo telefone (E.164 sem +) → profile + `escopo[]`
  (`grupos`/`integracao`) + `grupo_id` opcional. UNIQUE telefone entre ativos.
- `whatsapp_coletas` · log de mensagens: `whatsapp_message_id UNIQUE`
  (idempotência), `raw_text`, `parsed jsonb`, `modulo_destino`, `status`
  (recebido→parseado→aplicado/rejeitado/ignorado).
- Ambas com `deleted_at` + índice parcial + na whitelist
  `app_soft_deletable_tables()` + RLS (read integracao/grupos≥1 ou
  super-admin · write só service_role · todo fluxo passa pelo backend).

### Backend
- `routes/publicWhatsapp.js` (montado `/api/whatsapp/webhook` · público, ANTES
  do admin, fora do publicLimiter): GET verificação (hub.verify_token) + POST
  recebimento (responde 200 imediato, processa async · HMAC opcional via
  `WHATSAPP_APP_SECRET`, idempotência, identifica líder, parseia, ack).
- `routes/whatsapp.js` (montado `/api/whatsapp` · auth `authorizeModule('whatsapp-admin',3)`
  = integracao OU grupos nível 3): CRUD líderes + listar/aplicar/rejeitar coletas.
  Aplicar coleta de **integração** cria `cultos_dados_submissoes` pendente no
  culto mais recente (≤7d) · cai na fila `/integracao?tab=pendentes`. **Grupos**
  só marca aplicado (encontro exige lista nominal de presenças que o WhatsApp
  não fornece · lançamento manual).
- `services/whatsappSend.js` · envia texto via Graph API (gratis dentro da
  janela 24h). `services/whatsappParser.js` · Haiku interpreta texto livre →
  `{intent, modulo, dados, confianca, resumo}` (nunca lança · fallback seguro).
- `ROUTE_MODULE_MAP` ganhou `'whatsapp-admin': ['integracao','grupos']`.
- `server.js` · `express.json` agora captura `req.rawBody` (verify) pro HMAC.

### Frontend
- `/admin/whatsapp` (`src/pages/admin/Whatsapp.jsx`) · 2 abas: **Coletas**
  (revisar/aplicar/rejeitar com filtro por status) e **Líderes** (vincular
  telefone→profile + escopo + grupo · toggle ativo · remover). Menu em
  Administrativo > Configurações (`module: 'integracao'`). Route guard
  `moduleSlug="integracao" nivelMinimo={3}`.
- `api.js` · namespace `whatsapp`.

### Envs necessárias no Vercel (Marcos configura no painel Meta)
`WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_ACCESS_TOKEN` (System User, permanente),
`WHATSAPP_VERIFY_TOKEN` (inventar · usar no handshake do webhook),
`WHATSAPP_APP_SECRET` (prod · valida HMAC). URL do webhook =
`https://[dominio]/api/whatsapp/webhook`. Sem essas envs o backend sobe
normal · só não envia/recebe (parser e tela funcionam pra teste).

## Bot WhatsApp · agente IA + coleta por FORMULÁRIO (Flows) (2026-06-08)

Evolução do bot passivo (acima) em **2 personas conversacionais** + **coleta
por formulário nativo (WhatsApp Flows)**. Tudo no webhook `routes/publicWhatsapp.js`
(responde 200 imediato · processa async · HMAC fail-closed em prod · cap de 20
msgs/evento · toggle global `whatsapp_config.ia_ativa`). Número do bot: **21 99907-9031**.

**2 personas (`services/whatsappParser.js` · Claude Haiku):**
- **Número desconhecido → assistente INSTITUCIONAL** (`responderInstitucional`):
  responde missão/visão/horários a partir de `whatsapp_config.institucional`
  (jsonb editável em `/admin/whatsapp`). NÃO coleta dado.
- **Líder cadastrado → coleta** (`parseConversa`): multi-turno, mantém estado numa
  coleta `aguardando_info` por **7 dias** (`JANELA_CONVERSA_MIN`), pergunta o que
  falta, ao completar vira `parseado` (fila do coordenador em `/admin/whatsapp`).

**Coleta por FORMULÁRIO (Flows) — o caminho principal do líder:**
- `services/whatsappFlows.js` · `enviarFlow()` manda formulário de tela cheia
  (interactive `type:'flow'`). `WHATSAPP_FLOW_MODE=draft` no env permite testar
  como admin enquanto o app Meta está em modo dev (publish bloqueado por
  "integridade"). Em produção real (app Live): remover essa env.
- `services/whatsappFlowColeta.js` · orquestra: líder pede → Flow **culto**
  (seleciona culto dos últimos 14d + frequência presencial/kids/online + decisões
  presencial/online/kids) → se decisões > 0, **loop** pedindo Flow **pessoa** pra
  cada uma (entra na jornada) → ao completar vira `parseado`.
- Estado vive em `whatsapp_coletas.parsed` (`fonte:'flow'`, culto_id, freq, dec,
  pessoas[], pendentes) · **sem migration**. `flow_token` correlaciona a resposta:
  `'culto'` | `'pessoa:<coletaId>'`. Resposta chega no webhook como `nfm_reply`.
- JSONs em `backend/whatsapp-flows/{flow-culto,flow-pessoa}.json` · publicados na
  Meta pelo `backend/scripts/publish-whatsapp-flows.js` (roda 1×, devolve os ids).
  **Flow ids (draft):** culto `1163668689265932` · pessoa `1941771723206900`.
  ⚠️ tela Decisões usa campos **number** (não string) e **não** usa `visible`
  condicional (não suportado nessa versão de Flow) · senão a validação no publish quebra.

**Roteamento do líder (fix 2026-06-08 · `pedeFormulario`):** o gatilho antigo exigia
verbo (lançar/preencher) **E** substantivo (culto/decisão) na mesma frase → "quero o
formulário" não casava e caía na conversa lenta ("grupos ou integração?"). Regra nova,
robusta e **instantânea (sem LLM)**: líder que manda mensagem **sem números soltos** →
oferece o formulário do culto na hora (se escopo inclui `integracao` + Flows
configurados); só de grupos → orientação templated pra mandar os números por texto
(grupos não tem formulário · encontro exige lista nominal). O Haiku (mais lento) só
entra quando o líder **digita números soltos**. Coletas de formulário (`fonte:'flow'`)
são isoladas da sessão conversacional pros 2 modos não colidirem. Insert de dedup
defensivo (reentrega da Meta) antes de responder.

**Envs (Vercel · além das do bot passivo):** `WHATSAPP_FLOW_CULTO_ID`,
`WHATSAPP_FLOW_PESSOA_ID`, `WHATSAPP_FLOW_MODE=draft` (só enquanto o app não vai
Live), `WHATSAPP_BUSINESS_ACCOUNT_ID` (só pro script de publish). Sem
`FLOW_CULTO_ID`/`FLOW_PESSOA_ID`, `flowsConfigurados()` é false → o bot cai na
orientação por texto (diagnóstico: se o líder de integração não recebe o formulário,
checar essas envs no Vercel). `services/whatsappService.js` é OUTRO componente
(envio de templates transacionais · devocional/solicitações) · não é o webhook.

## ⚠️ Regra contábil · empréstimos NÃO são receita ordinária (2026-05-28)

Decisão do Marcos: em qualquer cálculo, agregação, KPI ou visualização de
**receita** da igreja, **empréstimos NÃO entram como receita ordinária**.

- Empréstimo é **entrada de caixa** (cashflow financiamento), não receita.
- Receita ordinária = dízimos, ofertas, contribuições, eventos pagos,
  campanhas, vendas. Origem operacional/ministerial.
- Receita extraordinária ≠ empréstimo. Doação grande extraordinária pode
  entrar como extraordinária; empréstimo segue como movimentação financeira
  separada (passivo a pagar).

Onde aplicar a regra:
- Dashboards/KPIs financeiros (DRE, "Receita total", "Receita do mês")
- Categorizações automáticas (`fin_padroes_classificacao`, agente
  executor financeiro)
- Relatórios de governança e dízimo/oferta
- Qualquer agregação `SUM(valor)` sobre lançamentos com tipo de
  receita: filtrar/excluir categoria de empréstimo

Quando criar nova view ou query de receita, garantir que a categoria
empréstimo (e tipos correlatos como "captação", "financiamento", "mútuo")
fique fora do total. Se houver dúvida sobre uma categoria nova, **perguntar
antes** de incluí-la em "receita".

## Agente Executor Financeiro · Worker Railway (2026-05-26)

Primeiro agente "ativo" do sistema (auditores existentes em
`backend/agents/*Auditor.js` só RELATAM findings · este AGE via tool use
com fila de aprovação humana). Roda no Railway porque agentes
long-running via Claude Agent SDK precisam de processo persistente
(timeout do Vercel serverless = 10s não cabe).

### Arquitetura

```
┌──────────────┐  POST /run/financeiro_executor   ┌──────────────────┐
│   Vercel     │ ───── HMAC-SHA256 ─────────────▶ │ Railway Worker   │
│  /api/agents │                                   │ (agent-worker/)  │
│              │ ◀──────────  202 ──────────────── │                  │
└──────────────┘                                   │ cron 3x/dia      │
                                                   │ (9h/14h/19h SP)  │
┌──────────────┐                                   │                  │
│   Supabase   │ ◀── service_role (bypass RLS) ─── │  Agent SDK loop  │
│ agent_runs   │     read fin_* tables             │  + MCP tools     │
│ agent_steps  │     write agent_queue (pending)   │  + SKILL.md      │
│ agent_queue  │                                   │                  │
└──────────────┘                                   └──────────────────┘
       ▲
       │ humano vê em /assistente-ia > "Fila de Aprovação"
       │ clica "Aprovar e aplicar" → POST /api/agents/queue/:id/apply
       │ backend/agents/apply/financeiroApply.js executa
```

### Tools financeiras (4 propose · 9 read · MCP in-process)

Read-only (`agent-worker/src/tools/financeiroRead.ts`):
- `listar_padroes_classificacao` · regras + identificadores de centavo
- `listar_fila_classificacao(limit)` · fin_fila_classificacao pending
- `listar_contas_pagar_pendentes(dias_para_vencer, limit)` · fin_contas_pagar
- `listar_alertas_abertos(severidade_minima)` · vw_fin_alertas_abertos
- `listar_reembolsos_pendentes(limit)` · fin_reembolsos pending
- `buscar_historico_pagador(nome?, documento?)` · classificações anteriores
- `buscar_transacao_match(valor, data, janela, fornecedor?)` · match conta×transacao
- `verificar_mes_fechado(data)` · fin_closing_mensal
- `verificar_proposta_existente(action_type, entity_id)` · idempotência

Propose (`agent-worker/src/tools/financeiroPropose.ts` · gravam em
`agent_queue` como `pending`):
- `propor_categorizar_transacao` → `action_type='fin.categorize_transaction'`
- `propor_pagar_conta` → `action_type='fin.mark_payable_paid'`
- `propor_decidir_reembolso` → `action_type='fin.reimbursement_decision'`
- `propor_atender_alerta` → `action_type='fin.atender_alerta'`

**Zero filesystem/bash.** AllowedTools whitelist explícita. Toda
mutation passa por `agent_queue` → humano aprova → handler em
`backend/agents/apply/financeiroApply.js` aplica.

### Tabela `agent_queue` (migration 20260526200000)

Estende a foundation de 20260512100000 com:
- `action_label text` · título curto pra UI
- `reasoning text` · explicação do agente (visível pro aprovador)
- `applied_at timestamptz` · quando a ação foi aplicada
- `apply_error text` · erro do handler se falhou
- Status enum estendido com `'applied'` (mantém `'executed'` pra
  backward-compat com auditores legados)

### Fluxo de aprovação (humano)

1. Agente roda (cron 3x/dia ou /api/agents/worker/trigger manual)
2. Pra cada item promissor, chama uma `propor_*` tool → linha em
   `agent_queue` com status=`pending`
3. Humano abre `/assistente-ia` > aba "Fila de Aprovação" e vê:
   - `action_label` (título)
   - `reasoning` (parágrafo destacado)
   - `payload` (collapsible)
4. Botão "Aprovar e aplicar" → `POST /api/agents/queue/:id/apply`:
   - status='approved' (race-safe)
   - chama `applyQueueAction(action_type, payload, reviewedBy)`
   - sucesso → status='applied', `applied_at=now()`
   - erro → status='failed', `apply_error=mensagem`
5. Botão "Rejeitar" → status='rejected'

### Regras absolutas pro agente (no SKILL.md)

1. **Nunca aplica direto** · só propõe
2. **Respeita closing mensal** · checa antes via `verificar_mes_fechado`
3. **Sempre com `reasoning`** · min 20 chars
4. **Sem invenção** · só com evidência (centavo/regra/histórico)
5. **Idempotência** · cheque `verificar_proposta_existente` antes
6. **Max 20 propostas/execução** · prioriza criticos > vencidas > fila antiga

### Variáveis de ambiente novas

No **Vercel**:
- `AGENT_WORKER_URL` · `https://sistemaintegradocbrio-production.up.railway.app` (produção · 2026-05-26)
- `AGENT_WORKER_HMAC_SECRET` · gere com `openssl rand -hex 32`

No **Railway** (todas):
- `ANTHROPIC_API_KEY`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `AGENT_WORKER_HMAC_SECRET` · MESMO valor do Vercel
- `TZ=America/Sao_Paulo`
- `SCHEDULER_ENABLED=1`
- Opcional: `FINANCEIRO_MODEL` (default `claude-sonnet-4-6`), `AGENT_MAX_TURNS` (default 20)

### Deploy do Worker

Ver `agent-worker/README.md` · resumo:
1. Railway > New Project > Deploy from GitHub repo
2. **Root Directory: `agent-worker`**
3. Build: `npm install && npm run build`
4. Start: `npm start`
5. Setar envs acima
6. Gerar domínio público
7. Copiar URL pra `AGENT_WORKER_URL` no Vercel

### Custo esperado

Sonnet 4.6 · ~15-20 turnos × ~25k tokens input + ~4k output = ~$0.10/execução
× 3/dia × 30d = **~$10/mês**.

### Plugar novos módulos (futuro)

Estrutura ja preparada · pra adicionar `module_membresia_executor`:
1. `agent-worker/src/skills/membresia/SKILL.md` · regras
2. `agent-worker/src/tools/membresiaRead.ts` + `membresiaPropose.ts`
3. `agent-worker/src/agents/membresiaExecutor.ts` · cópia do financeiro
4. `agent-worker/src/server.ts` · novo case em `/run/:agentType`
5. `agent-worker/src/scheduler.ts` · adicionar disparo
6. `backend/agents/apply/membresiaApply.js` · handlers
7. `backend/routes/agents.js` · importar e plugar no roteador apply

Action_type sempre `<modulo>.<verbo_obj>`. Frontend automaticamente
mostra as novas propostas agrupadas se `ACTION_META[action_type]` for
adicionado em `src/pages/admin/FilaAprovacao.jsx`.

## ⚠️ PostgREST do Supabase capa em 1000 linhas server-side (2026-05-25)

Bug pego em producao · cargo `supervisor-jornada` (cargo_id=63) criado,
matriz seedada com nivel 3 nos modulos da jornada, mas o Marcelo Soares
ficava com leitura=0 em tudo sem boost por area.

**Causa** · `supabase.from('cargo_modulo_permissao').select(...)`
retornava no maximo 1000 linhas. A matriz tinha ~1073 linhas. Os cargos
com id mais alto (incluindo supervisor-jornada=63) ficaram fora.

**Importante** · `.range(0, 19999)` no Supabase JS NAO contorna o limite.
O cap eh server-side no PostgREST (`db-max-rows` no projeto Supabase) e
vale pra qualquer cliente. Tentar passar do cap retorna ate o cap.

**Solucoes (em ordem de preferencia)**:

1. **Filtrar no DB** quando souber o filtro · ex: `.eq('cargo_id', X)`.
   Reduz pra ~30 linhas, longe do cap.
2. **Paginar com loop** quando precisar de tudo:
   ```js
   let all = [];
   let offset = 0;
   const pageSize = 1000;
   while (true) {
     const { data } = await supabase.from('tabela').select('*')
       .range(offset, offset + pageSize - 1);
     if (!data || data.length === 0) break;
     all = all.concat(data);
     if (data.length < pageSize) break;
     offset += pageSize;
   }
   ```
3. **RPC** com server-side aggregation quando precisar de stats.

**Aplicado em**:
- `getCargoMatrix(cargoId)` em `auth.js` · filtra por cargo (opcao 1)
- `GET /api/permissoes/matriz` · paginado (opcao 2)
- `GET /api/permissoes/diagnostico/:email` · paginado (opcao 2)

**Auditar quando crescer**:
- `mem_membros` (ja >1000), `mem_voluntarios`, `mem_contribuicoes`
- `cultos`, `mem_grupo_membros`, `nsm_eventos`
- Qualquer exports ou agg que `.select('*')` sem filtro/paginacao

Pra debug similar futuro · `/api/permissoes/diagnostico/:email` mostra
`matrix_stats.cargoMatrix_total_rows`. Se for exatamente 1000, sintoma
do cap presente.

## Cargo · supervisor-jornada (Marcelo Soares · 2026-05-25)

Marcelo Soares saiu de `assistente-ministerial` (Assistente Ministerio
Cuidados) e virou **`supervisor-jornada`** · callback de cuidado pastoral
que VE e PREENCHE dados de jornada em TODOS os ministerios.

**Conceito chave**: ele NAO substitui os lideres. Soma com eles como
rede de seguranca. Se Mariane (Kids), Arthur (AMI), Lillian (Bridge),
Renata (Online) ou Alda (Integracao) esquecerem de marcar uma decisao,
batismo, devocional ou checkin, Marcelo entra, corrige e mantem o NSM
saudavel.

**Matriz** (migration `20260525160000_supervisor_jornada_marcelo.sql`):
- Nivel 3 (CRUD) **SEM escopo_proprio** em: `integracao`, `cuidados`,
  `online`, `kids`, `ami`, `bridge`, `next`, `voluntariado`,
  `membresia`, `grupos`, `dados-brutos`, `minha-area`
- Nivel 1 (read) em: `dashboard`, `painel-cbrio`, `eventos`, `projetos`,
  `expansao`
- Nivel 2 em: `nps`, `solicitacoes`, `assistente-ia`
- Nivel 3 com escopo_proprio em: `perfil`
- Nivel 0 em: `rh`, `financeiro`, `logistica`, `patrimonio`, `gestao`,
  `governanca`, `ritual`, `planejamento`, `revisao-estrategica`,
  `cerebro`, `notificacoes-config`, `permissoes-admin`, `usuarios-admin`

**Diferenca chave vs `assistente-ministerial`**: o assistente tem
escopo_proprio=true em todos os modulos da jornada (so ve a sua area).
Supervisor-jornada tem escopo_proprio=false · ve todas as 6 areas
(kids/ami/bridge/sede/online/cba).

**Areas atribuidas em `usuario_areas`**: cuidados, integracao, kids, ami,
bridge, online. (CBA acompanhada pelo Pr. Nelio via grupos · sem area
formal nas 6 oficiais.)

**Apos aplicar a migration**:
- Marcos: rodar bust de cache em `/admin/permissoes` ou
  `POST /api/permissoes/cache/bust`
- Marcelo: fazer logout/login pra renovar JWT

## Modal de culto · campos vazios em vez de 0 (2026-05-26)

Schema de `cultos` tem `DEFAULT 0` em presencial_adulto/kids,
decisoes_presenciais/online/kids. Quando o calendario gera o culto
recorrente, esses campos vem `0` · `0 ?? ''` retorna `0` e o input
mostrava "0" (atrapalha digitacao · 0 nao some quando o cursor entra).

Fix em `CalendarioCultos.jsx` (ModalCulto) · helper `exibir(v)` trata
`0|null|undefined` como vazio. Submit ja faz `Number(x) || 0`, entao
vazio salva 0 no banco · o estado real nao muda, so a exibicao.

Trade-off conhecido: culto que realmente teve 0 pessoas (raro) aparece
vazio na reabertura · usuario reabre achando que nao foi preenchido.
Marcos aceitou o trade-off · vazio na maioria dos casos vale mais que
o zero literal em casos de borda.

## Cargo no /perfil le do sistema granular (2026-05-26)

`Perfil.jsx` mostrava `profile.role` (legacy: admin/diretor/lider/voluntario/
membro/assistente) como "Cargo" · isso fez o Marcelo continuar aparecendo
como "Assistente" mesmo apos a migration `supervisor-jornada` ter trocado
o `usuarios.cargo_id` corretamente.

Fix:
- `GET /api/auth/my-permissions` agora expoe `granular.cargoNome` e
  `granular.cargoSlug` (vem de `cargos.nome_completo`/`nome`/`slug`)
- `AuthContext` propaga via `cargoNome` e `cargoSlug`
- `Perfil.jsx` mostra `cargoNome || role || 'Membro'` no badge e no campo
  Cargo · cai pro role legacy so se o usuario nao estiver no sistema
  granular (caso raro · membros sem cadastro em `usuarios`)

`profile.role` continua existindo e sendo usado em outros lugares
(AuthContext.canAccessModule, ROLE_MAP em authorizeCycle etc). Nao
mexer · esse fix eh so de exibicao.

# ⚠️ REGRAS OBRIGATÓRIAS DE SEGURANÇA (não regredir · 2026-05-21)

Esta seção é a lei do projeto após a Auditoria de Segurança 2026-05-21
(PRs #586 → #642). Qualquer sessão futura do Claude DEVE seguir estas
regras. **Quebrar qualquer uma delas é regressão crítica.**

> 📖 **Referência completa**: `docs/SEGURANCA_RUNBOOK.md` · runbook
> canônico com TODAS as PRs, helpers, matriz de permissões, troubleshooting
> e frentes deferidas. Consultar pra contexto profundo.

## Proibições absolutas

1. **NUNCA criar policy RLS `USING(true) WITH CHECK(true)` em tabela
   com PII** (nome, CPF, telefone, email, endereço, salário, dados de
   menor, financeiro). Sempre usar helpers `current_user_*` ou
   `is_super_admin()`. Lista canônica de tabelas com PII está em
   `app_soft_deletable_tables()`.

2. **NUNCA fazer `DELETE` direto em tabela com `deleted_at`** (30
   tabelas listadas em `app_soft_deletable_tables()`). Sempre usar
   `app_soft_delete(table_name, id, deleted_by)` RPC. Hard delete só
   super-admin via SQL Editor com justificativa.

3. **NUNCA armazenar `responsavel`, `leader`, `gestor` como TEXT
   livre.** Sempre coluna `UUID` com `REFERENCES profiles(id)` ou
   `mem_membros(id)`. Comparação por `===` com `profile.name` quebra
   com renomeação ou typo. Lista de pontos onde isto ainda existe e
   precisa ser convertido: `area_responsaveis.responsavel_nome`,
   `projects.leader`, `projects.responsible`, `kanban_tasks.responsible`.

4. **NUNCA criar tabela com PII sem `deleted_at TIMESTAMPTZ`** + índice
   parcial `WHERE deleted_at IS NULL` + entrada na whitelist
   `app_soft_deletable_tables()`. PK composta é exceção (impede
   soft-delete via id::text · documentar a razão).

5. **NUNCA mudar matriz `cargo_modulo_permissao` ou `usuario_areas`
   direto no SQL Editor sem fazer bust de cache do middleware**
   depois (`POST /api/permissoes/cache/bust` ou botão em
   `/admin/permissoes`). E pedir que o user afetado faça logout/login
   pra renovar o JWT.

6. **NUNCA criar policy com `FOR ALL TO authenticated USING(true)`**
   exceto se for catálogo público (modulos, cargos, areas, igrejas
   read-only, rh_treinamentos catálogo).

7. **NUNCA adicionar policy de INSERT/UPDATE/DELETE pra role `anon`.**
   Forms públicos vão SEMPRE via backend (`/api/public/*`) que usa
   service_role.

8. **NUNCA expor `SUPABASE_SERVICE_ROLE_KEY` no frontend.** Já está em
   `backend/.env` apenas. Frontend usa `VITE_SUPABASE_ANON_KEY`.

9. **NUNCA criar policy que faça query recursiva em tabela com RLS
   sem usar SECURITY DEFINER no helper.** Causa stack overflow.
   Padrão: helper SQL `STABLE SECURITY DEFINER SET search_path = public`.

## Inventário de helpers SQL (usar SEMPRE em policies novas)

| Função | Retorna | Uso típico |
|---|---|---|
| `public.is_super_admin()` | BOOLEAN | Curto-circuito em policies. Marcos + Matheus + lista em `app_super_admins` |
| `public.current_user_membro_id()` | UUID | "Só meus dados" em tabelas com `membro_id` |
| `public.current_user_funcionario_id()` | UUID | "Só meus dados" em tabelas com `funcionario_id` |
| `public.current_user_module_level(slug)` | INTEGER | Nivel 0-5 do user no módulo (super-admin=5, override, matriz, area boost) |
| `public.user_is_kids_responsavel(crianca_id)` | BOOLEAN | Pai/mãe lê dados do filho |
| `public.user_is_lider_de(funcionario_id)` | BOOLEAN | Gestor hierárquico (via `rh_funcionarios.gestor_id`) |
| `public.app_soft_delete(table, id, by)` | BOOLEAN | Substitui DELETE direto |
| `public.app_restore(table, id)` | BOOLEAN | Desfaz soft-delete |
| `public.app_soft_deletable_tables()` | TEXT[] | Whitelist de 30 tabelas com soft-delete |

## Audit log · mudanças em dados sensíveis (2026-05-21)

Migration `20260521230000_onda3_audit_log_pii.sql` cria sistema de
auditoria pra rastrear mudanças em colunas sensíveis.

**Postgres não tem trigger de SELECT** · auditamos só
INSERT/UPDATE/DELETE. Pra "quem leu CPF" precisaria de proxy de queries
(overkill por agora).

### Tabela `app_audit_log`

Colunas: `id, table_name, row_id, action, user_id, user_email,
changes (JSONB), created_at`.

Imutável: RLS bloqueia UPDATE/DELETE. Só super-admin lê via SELECT.

### Função genérica `audit_log_changes()`

Trigger AFTER INSERT/UPDATE/DELETE com argumento opcional `TG_ARGV[0]`
= CSV de colunas a auditar. Se vazio, audita todas exceto
`updated_at`/`created_at`. Salva diff `{col: {old, new}}` em JSONB.

### Triggers ativos (8 tabelas críticas)

| Tabela | Colunas auditadas |
|---|---|
| `rh_funcionarios` | salario, remuneracao_bruta, grau_id, status, data_demissao, cpf, email, deleted_at |
| `mem_membros` | cpf, status, deleted_at, nome, email, telefone |
| `mem_contribuicoes` | valor, tipo, membro_id, deleted_at |
| `pcs_progressoes` | salarios, graus, aprovado_por, deleted_at |
| `batismo_inscricoes` | cpf, status, membro_id, deleted_at |
| `cultos_decisoes_pessoas` | cpf, responsavel_cpf, telefones, membro_id, deleted_at |
| `cargo_modulo_permissao` | nivel, pode_exportar, pode_aprovar, escopo_proprio |
| `app_super_admins` | email, ativo, nome |

### Consultar audit log (super-admin)

```sql
-- Quem mudou o salário do funcionário X?
SELECT user_email, changes->'salario', created_at
FROM app_audit_log
WHERE table_name = 'rh_funcionarios' AND row_id = '<uuid>'
  AND changes ? 'salario'
ORDER BY created_at DESC;

-- Histórico de alterações na matriz de permissões
SELECT user_email, changes, created_at
FROM app_audit_log
WHERE table_name = 'cargo_modulo_permissao'
ORDER BY created_at DESC LIMIT 100;
```

### Adicionar audit a nova tabela

```sql
CREATE TRIGGER trg_audit_nova_tabela
AFTER INSERT OR UPDATE OR DELETE ON public.nova_tabela
FOR EACH ROW EXECUTE FUNCTION public.audit_log_changes(
  'col_sensivel1,col_sensivel2,deleted_at'  -- TG_ARGV opcional
);
```

## UUID FKs canônicos · responsável/líder (transição em curso · 2026-05-21)

Memória `feedback_responsible_by_uuid`: "Responsáveis por UUID · profiles.id".
Migration `20260521220000_onda3_uuid_fks_responsavel.sql` adiciona colunas
UUID em 5 tabelas (mantém TEXT antigas backward-compatible).

### Estado da transição

| Tabela | Coluna TEXT antiga | Coluna UUID nova | Status |
|---|---|---|---|
| `area_responsaveis` | `responsavel_nome` | `responsavel_id` | ⚠️ Coexistem |
| `projects` | `leader` | `leader_id` | ⚠️ Coexistem |
| `projects` | `responsible` | `responsible_id` | ⚠️ Coexistem |
| `event_tasks` | `responsible` | `responsible_id` | ⚠️ Coexistem |
| `cycle_phase_tasks` | `responsavel_nome` | `responsavel_id` | ⚠️ Coexistem |
| `project_tasks` | `responsible` | `responsible_id` | ⚠️ Coexistem |

### Regras durante a transição

1. **Código novo** · SEMPRE usar `*_id` (UUID FK pra profiles)
2. **Código legado** · pode ler tanto TEXT quanto UUID (`leader_id` ou `leader`)
3. **Backend update** · ao mudar `*_id`, também atualizar TEXT (snapshot)
   pra retrocompatibilidade · ou remover coluna TEXT no PR follow-up
4. **Frontend** · trocar autocomplete de TEXT pra select de profiles UUID

### Migração futura · dropar colunas TEXT (PR follow-up)

Quando backend + frontend estiverem 100% usando os `*_id`:

```sql
ALTER TABLE area_responsaveis  DROP COLUMN responsavel_nome;
ALTER TABLE projects           DROP COLUMN leader, DROP COLUMN responsible;
ALTER TABLE event_tasks        DROP COLUMN responsible;
ALTER TABLE cycle_phase_tasks  DROP COLUMN responsavel_nome;
ALTER TABLE project_tasks      DROP COLUMN responsible;
```

## Padrão · adicionar nova tabela com PII

```sql
-- 1. Schema com deleted_at
CREATE TABLE public.nova_tabela_pii (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  membro_id UUID REFERENCES public.mem_membros(id) ON DELETE SET NULL,
  -- ... outras colunas ...
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

-- 2. Índice parcial pra performance
CREATE INDEX idx_nova_tabela_pii_active
  ON public.nova_tabela_pii (id) WHERE deleted_at IS NULL;

-- 3. Adicionar à whitelist (NUNCA esquecer)
CREATE OR REPLACE FUNCTION public.app_soft_deletable_tables()
RETURNS TEXT[] LANGUAGE sql IMMUTABLE AS $$
  SELECT ARRAY[
    'mem_membros', 'mem_familias', /* ... lista existente ... */,
    'nova_tabela_pii'  -- ← adicionar aqui
  ]::TEXT[]
$$;

-- 4. RLS obrigatório
ALTER TABLE public.nova_tabela_pii ENABLE ROW LEVEL SECURITY;

-- 5. Policies contextuais (5 mínimo)
CREATE POLICY nova_tabela_pii_select ON public.nova_tabela_pii
  FOR SELECT TO authenticated
  USING (
    membro_id = public.current_user_membro_id()
    OR public.current_user_module_level('modulo_relevante') >= 1
  );

CREATE POLICY nova_tabela_pii_insert ON public.nova_tabela_pii
  FOR INSERT TO authenticated
  WITH CHECK (public.current_user_module_level('modulo_relevante') >= 2);

CREATE POLICY nova_tabela_pii_update ON public.nova_tabela_pii
  FOR UPDATE TO authenticated
  USING (public.current_user_module_level('modulo_relevante') >= 3)
  WITH CHECK (public.current_user_module_level('modulo_relevante') >= 3);

CREATE POLICY nova_tabela_pii_delete ON public.nova_tabela_pii
  FOR DELETE TO authenticated
  USING (public.is_super_admin());

CREATE POLICY nova_tabela_pii_service ON public.nova_tabela_pii
  FOR ALL TO service_role USING (true) WITH CHECK (true);
```

## Padrão · adicionar novo módulo no menu/permissões

```sql
-- 1. INSERT no catálogo
INSERT INTO public.modulos (slug, nome, rota, categoria, ordem, descricao, ativo)
SELECT 'novo-modulo', 'Nome Modulo', '/nova-rota', 'ministerial', 999,
       'descricao', true
WHERE NOT EXISTS (SELECT 1 FROM public.modulos WHERE slug = 'novo-modulo');

-- 2. Seed matriz default · copia de modulo similar
DO $$
DECLARE base_modulo_id int;
BEGIN
  SELECT id INTO base_modulo_id FROM public.modulos WHERE slug = 'modulo_similar';
  INSERT INTO public.cargo_modulo_permissao (cargo_id, modulo_id, nivel, pode_exportar, pode_aprovar, escopo_proprio)
  SELECT cmp.cargo_id, novo.id, cmp.nivel, cmp.pode_exportar, cmp.pode_aprovar, cmp.escopo_proprio
    FROM public.cargo_modulo_permissao cmp
    CROSS JOIN public.modulos novo
   WHERE cmp.modulo_id = base_modulo_id
     AND novo.slug = 'novo-modulo'
  ON CONFLICT (cargo_id, modulo_id) DO NOTHING;
END $$;

-- 3. Se tem boost por área · adicionar a AREA_MODULO_BOOST em
-- backend/middleware/auth.js E no array da função current_user_module_level
-- (se módulo segue o padrão "área = slug")
```

## Padrão · adicionar super-admin

```sql
INSERT INTO public.app_super_admins (email, nome, added_by, notes)
VALUES ('email@cbrio.com.br', 'Nome', 'marcos', 'motivo')
ON CONFLICT (email) DO NOTHING;
```

Match é por email LOWER contra `auth.users.email`.
Desativar (preserva histórico): `UPDATE app_super_admins SET ativo = false WHERE email = '...'`.

## Padrão · backend executar soft-delete

```js
// ❌ ERRADO · hard delete irreversível
await supabase.from('mem_membros').delete().eq('id', memberId);

// ✅ CERTO · soft delete reversível
await supabase.rpc('app_soft_delete', {
  p_table_name: 'mem_membros',
  p_row_id: memberId,
  p_deleted_by: req.user?.id ?? null
});

// ✅ Listar só ativos
await supabase.from('mem_membros').select('*').is('deleted_at', null);

// ✅ Restaurar
await supabase.rpc('app_restore', {
  p_table_name: 'mem_membros',
  p_row_id: memberId
});
```

## FKs CASCADE → SET NULL (Phase 1 · 21 FKs convertidas)

**Não converter de volta pra CASCADE** as FKs que apontam para:
- `mem_membros` (11 filhas: contribuições, trilha, histórico, voluntariado, escalas, checkins, devocionais, grupo_membros, devocional_envios, nsm_eventos, grupo_encontro_presencas)
- `rh_funcionarios` (6 filhas: documentos, treinamentos, ferias, avaliacoes, avaliacoes_legacy, progressoes, pontuacao_colaborador)
- `cultos` (2 filhas: decisoes_pessoas, kids_sessoes)
- `kpi_indicadores_taticos` (2 filhas: registros, trajetoria)

CASCADE mantido intencionalmente:
- `mem_duplicados_ignorados` (par de dedup · sem sentido sem o membro)
- `mem_grupo_pedidos` (transient)
- `rh_escalas_extras`, `rh_materiais_funcionarios` (operacional)
- `kpi_krs`, `okr_revisoes` (estrutura OKR · parent-child)
- `kpi_valores_calculados` (cache · `kpi_id` é parte da PK composta)

## Inventário · 65 tabelas com RLS contextual (Onda 2 + 3)

| Bloco | Tabelas | Padrão de acesso |
|---|---|---|
| **P0 Super-admin** | `cargo_modulo_permissao`, `igrejas`, `kpi_metas`, `app_super_admins` | Write só super-admin; read aberto |
| **Onda 3 Soft-delete** | 30 tabelas com `deleted_at` | Use `app_soft_delete()` no backend |
| **Onda 2 Kids (LGPD)** | `kids_criancas`, `kids_responsaveis`, `kids_checkins`, `kids_sessoes`, `kids_salas`, `kids_estacoes`, `kids_etiquetas_log` | Responsável + kids≥1/2/3 + super-admin |
| **Onda 2 Financeiro/RH** | `mem_contribuicoes`, `rh_funcionarios`, `rh_documentos`, `rh_avaliacoes`, `rh_avaliacao_fatores`, `rh_treinamentos`, `rh_treinamentos_funcionarios`, `rh_ferias_licencas`, `pcs_*` (8 tabelas) | Próprio funcionário + módulo rh/financeiro |
| **Onda 2 PII** | `mem_membros`, `cultos_decisoes_pessoas`, `batismo_inscricoes`, `nsm_eventos`, `int_visitantes`, `cui_acompanhamentos`, `cui_jornada180`, `cui_convertidos` | Próprio + módulos relevantes (membresia/integracao/cuidados/painel) |

## Quando precisar quebrar uma regra (raro · justificar)

Algumas situações legítimas pra exceção:
- Tabela de catálogo público (ex: `modulos`, `cargos`, `areas`)
  pode ter `FOR SELECT USING(true)` se não contém PII
- Migration de hotfix urgente (incidente em produção) pode usar
  service_role bypass diretamente · mas DEVE incluir comentário no
  arquivo justificando + criar issue follow-up pra normalizar
- `kpi_valores_calculados` e `cargo_modulo_permissao` não têm
  `deleted_at` porque têm PK composta · documentado nas migrations

Sempre justifique no arquivo da migration com `COMMENT ON ... IS '...'`
ou comentário SQL `-- NOTA: ...`.

---

## Lockdown final · todas policies contextuais (2026-05-22)

Migration `20260522190000_lockdown_policies_legacy.sql` fechou as
últimas 13 tabelas com policies `USING(true)` legacy que escaparam
das ondas anteriores:

- **Kids (7)** · kids_criancas, kids_responsaveis, kids_checkins,
  kids_sessoes, kids_salas, kids_estacoes, kids_etiquetas_log ·
  policies legacy recriadas por migrations recentes do totem-kids
  (#587-#595) com sufixo `_write` em vez de `_insert`
- **Operacionais (6)** · mem_grupo_pedidos, grupo_supervisao_observacoes,
  grupo_supervisao_visitas, cui_atendimentos_agregado, vol_inscricoes,
  okr_revisoes

Validação pós-aplicação: **0 policies com `USING(true)` ou
`WITH CHECK(true)` em writes em todas as 53 tabelas auditadas** (excluídas
service_role e SELECT abertas pra catálogos legítimos).

### Estado final da defesa em profundidade

| Métrica | Valor |
|---|---|
| Total policies aplicadas | 541 |
| Policies user-facing | 462 |
| Policies service_role | 79 |
| Funções helpers SQL | 10 |
| Tabelas com `deleted_at` | 30 |
| Tabelas com audit log triggers | 8 |
| FKs CASCADE → SET NULL convertidas | 21 |
| Índices FK criados | 35 |

## RLS contextual PII · membros/decisões/batismos/cuidados (2026-05-21 · Onda 2 PR4)

Migration `20260521210000_onda2_rls_pii.sql` finaliza a Onda 2 RLS.
Substitui as policies `USING(true)` das 8 tabelas com PII mais sensível.

### Tabelas (8)

| Tabela | READ | INSERT/UPDATE | DELETE |
|---|---|---|---|
| `mem_membros` | próprio OR membresia≥1 | membresia≥3 (próprio update OK) | super-admin |
| `cultos_decisoes_pessoas` | linkado OR integracao/cuidados≥1 OR membresia≥3 | integracao≥2 ou kids≥2 (INSERT) · integracao/cuidados≥3 (UPDATE) | super-admin |
| `batismo_inscricoes` | linkado OR integracao≥1 OR membresia≥3 | integracao≥2 (INSERT) · ≥3 (UPDATE) | super-admin |
| `nsm_eventos` | linkado OR integracao/cuidados/painel-cbrio≥1 | integracao/cuidados≥2 · integracao≥3 (UPDATE) | super-admin |
| `int_visitantes` | linkado OR integracao/cuidados≥1 | integracao/cuidados≥2 (INSERT) · ≥3 (UPDATE) | super-admin |
| `cui_acompanhamentos`, `cui_jornada180`, `cui_convertidos` | próprio OR cuidados/integracao≥1 | cuidados/integracao≥2 (INSERT) · ≥3 (UPDATE) | super-admin |

### Conceito · "linkado"

Cada tabela define como a pessoa se identifica:
- `mem_membros.id` = `current_user_membro_id()`
- `cultos_decisoes_pessoas.membro_id` = `current_user_membro_id()`
- `batismo_inscricoes.membro_id` = `current_user_membro_id()`
- `nsm_eventos.membro_id` = `current_user_membro_id()`
- `int_visitantes.membresia_id` = `current_user_membro_id()`
- `cui_*.membro_id` = `current_user_membro_id()`

### Conceito · "vários módulos podem ver"

Decisões/batismos/visitantes/cuidados são naturalmente vistos por
**múltiplos cargos** com responsabilidades complementares. A RLS aceita
qualquer um:
- Alda Lorena (integracao) preenche decisões nos cultos
- Pastoral (cuidados) acompanha convertidos pós-decisão
- Painel CBRio (analytics) lê nsm_eventos pra mandalas

### DELETE bloqueado pra todos exceto super-admin

PII + LGPD pedem retenção mínima auditável. Use `app_soft_delete()`
(criada na Onda 3) pra "delete" reversível. Hard delete só Marcos/Matheus.

## RLS contextual Financeiro/RH (2026-05-21 · Onda 2 PR3)

Migration `20260521200000_onda2_rls_financeiro_rh.sql` substitui as
policies `USING(true)` das tabelas financeiras/RH/PCS por policies
contextuais. Resolve exposição de salários, CPF e dízimos via anon key.

### Helpers novos

- **`public.current_user_funcionario_id() → UUID`** · `rh_funcionarios.id`
  do user logado (match por email LOWER). NULL se não é funcionário ativo.
- **`public.user_is_lider_de(funcionario_id UUID) → BOOLEAN`** · TRUE se
  user logado é gestor direto (via `rh_funcionarios.gestor_id`).

### Matriz · tabelas afetadas

| Tabela | READ | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| `mem_contribuicoes` | próprias OR financeiro≥3 | financeiro≥3 | financeiro≥3 | super-admin |
| `rh_funcionarios` | próprio OR rh≥3 OR financeiro≥3 | rh≥3 | próprio OR rh≥3 | super-admin |
| `rh_documentos` | próprio OR rh≥3 | rh≥3 | rh≥3 | super-admin |
| `rh_avaliacoes` | próprio OR líder OR rh≥3 | próprio OR líder OR rh≥3 | mesmo | super-admin |
| `rh_avaliacao_fatores` | herda via avaliacao_id | herda | herda | super-admin |
| `rh_treinamentos` (catálogo) | todos | rh≥3 | rh≥3 | super-admin |
| `rh_treinamentos_funcionarios` | próprio OR rh≥3 | rh≥3 | rh≥3 | super-admin |
| `rh_ferias_licencas` | próprio OR líder OR rh≥3 | próprio OR rh≥3 | líder OR rh≥3 | super-admin |
| **PCS config**: graus, criterios, niveis_criterio, beneficios, beneficio_grau, reajustes_coletivos | rh≥1 | super-admin | super-admin | super-admin |
| **PCS histórico**: progressoes, pontuacao_colaborador, avaliacoes_funcionario | próprio OR rh≥3 | rh≥3 | rh≥3 | super-admin |

### Conceitos importantes

**Líder hierárquico** · vai pra `rh_avaliacoes` e `rh_ferias_licencas`.
A função `user_is_lider_de(funcionario_id)` consulta
`rh_funcionarios.gestor_id` (self-FK). Pra alguém aparecer como líder,
precisa estar em `gestor_id` do funcionário alvo.

**PCS dividido em 2 grupos** · tabelas de **configuração** (graus,
critérios, etc) ficam read pra todos com `rh≥1` (precisa ler pra
exibir nas avaliações), mas write é só super-admin (mudança crítica
de política salarial). Tabelas de **histórico individual**
(progressões, pontuação, avaliações) seguem o padrão "próprio funcionário
vê + RH≥3 vê tudo".

**Funcionários CLT/PJ que também são membros da igreja** · matches
por email LOWER em ambos os helpers (`current_user_membro_id()` e
`current_user_funcionario_id()`).

## RLS contextual Kids · LGPD menores (2026-05-21 · Onda 2)

Migration `20260521190000_onda2_rls_kids_lgpd.sql` substitui as
policies `USING(true)` das 7 tabelas Kids por policies contextuais.
LGPD com menores é o maior risco legal.

### Funções helpers (reutilizáveis nas próximas ondas)

- **`public.current_user_membro_id() → UUID`** · `mem_membros.id` do
  user logado (via `profiles.membro_id` ou fallback email LOWER).
  SECURITY DEFINER. Use em policies que precisam "só meus dados".

- **`public.current_user_module_level(slug TEXT) → INTEGER`** · replica
  `resolveEffectivePerms()` do middleware no SQL:
  - Super-admin → 5
  - Override em `permissoes_modulo` (com expira_em)
  - Default da matriz `cargo_modulo_permissao`
  - `AREA_MODULO_BOOST` (kids/ami/bridge/online/cuidados/grupos/
    integracao/voluntariado/next · escala pra 5 se user tem área
    correspondente em `usuario_areas`)
  - Usa extension `unaccent` pra normalizar acentos

- **`public.user_is_kids_responsavel(crianca_id UUID) → BOOLEAN`** ·
  TRUE se user é responsável da criança. Reusa
  `current_user_membro_id()`.

### Matriz de acesso · 7 tabelas Kids

| Tabela | READ | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| `kids_criancas` | responsável OR kids≥1 | kids≥3 | kids≥3 | super-admin |
| `kids_responsaveis` | próprio OR kids≥1 | kids≥3 | kids≥3 | super-admin |
| `kids_checkins` | responsável OR kids≥1 | kids≥2 | kids≥3 | super-admin |
| `kids_sessoes` | kids≥1 | kids≥3 | kids≥3 | super-admin |
| `kids_salas` | kids≥1 | kids≥5 | kids≥5 | super-admin |
| `kids_estacoes` | kids≥1 | kids≥5 | kids≥5 | super-admin |
| `kids_etiquetas_log` | kids≥3 | kids≥1 | **só super-admin** (audit) | super-admin |

Todas as tabelas têm policy `service_role FOR ALL USING (true)` pra
backend continuar funcionando via service_role.

### Como o boost por área funciona

Mariane Gaia tem cargo `coordenador-kids` + área `KIDS` em
`usuario_areas`. A função `current_user_module_level('kids')`:
1. Não é super-admin → segue
2. Pega cargo_id da Mariane via `usuarios` (match por email)
3. Olha matriz: `coordenador-kids × kids` (ex: nível 3)
4. AREA_MODULO_BOOST detecta área "KIDS" normalizada
5. Como `kids` está na whitelist de boost, retorna `max(3, 5) = 5`

### Pra responsável (pai/mãe) ler dados do filho

Não precisa ter cargo. Basta:
1. Estar em `mem_membros` (com email = profile.email)
2. Ter linha em `kids_responsaveis` linkando ao filho
3. `profiles.membro_id` apontar pra `mem_membros.id` (auto-linkado
   no primeiro login pelo backend ou via migration de sincronização)

SELECT só retorna filhos onde a pessoa é responsável.

### DELETE bloqueado · usar app_soft_delete

`kids_criancas`, `kids_checkins` etc · DELETE direto só super-admin.
Resto do staff usa `app_soft_delete()` (criada na Onda 3). LGPD pede
preservar histórico de auditoria.

## Soft-delete + FK fix · substitui PITR via código (2026-05-21)

Migration `20260521180000_onda3_soft_delete_fk_fix.sql` resolve o problema
de delete acidental irreversível sem custo de PITR (US$100/mês). Marcos
decidiu não pagar add-on e resolver via schema.

### Tabelas com `deleted_at` (30 críticas)

> Nota: `kpi_valores_calculados` e `cargo_modulo_permissao` ficaram **fora**
> da lista porque têm PK composta. A primeira é cache derivado (FK CASCADE
> → SET NULL no `kpi_id` já preserva valores) · a segunda é matriz de
> configuração (célula existe ou não existe, soft-delete não se aplica).


PII: `mem_membros`, `mem_familias`, `mem_grupos`, `mem_grupo_membros`,
`mem_voluntarios`, `mem_contribuicoes`, `mem_trilha_valores`,
`mem_devocionais`, `mem_historico`, `mem_grupo_encontros`,
`mem_grupo_pedidos`

Cultos: `cultos`, `cultos_decisoes_pessoas`, `batismo_inscricoes`,
`nsm_eventos`

Kids (LGPD): `kids_criancas`, `kids_checkins`, `kids_sessoes`

Cuidados/Integração: `cui_jornada180`, `cui_acompanhamentos`,
`cui_convertidos`, `int_visitantes`

KPI: `kpi_indicadores_taticos`, `kpi_metas`

RH: `rh_funcionarios`, `rh_documentos`, `pcs_progressoes`

Operacional: `projects`, `solicitacoes`, `usuarios`

### Como usar no backend

**Pra deletar** · trocar `.delete()` direto por chamada RPC:
```js
// ANTES (hard delete):
await supabase.from('mem_membros').delete().eq('id', memberId);

// DEPOIS (soft delete · reversível):
await supabase.rpc('app_soft_delete', {
  p_table_name: 'mem_membros',
  p_row_id: memberId,
  p_deleted_by: req.user.id
});
```

**Pra listar ativos** · filtrar `deleted_at IS NULL`:
```js
await supabase.from('mem_membros').select('*').is('deleted_at', null);
```

**Pra restaurar** · chama RPC `app_restore`:
```js
await supabase.rpc('app_restore', {
  p_table_name: 'mem_membros',
  p_row_id: memberId
});
```

### Whitelist · adicionar nova tabela

```sql
-- 1. ADD COLUMN deleted_at + indice parcial
ALTER TABLE public.nova_tabela ADD COLUMN deleted_at TIMESTAMPTZ;
CREATE INDEX idx_nova_tabela_active ON public.nova_tabela (id) WHERE deleted_at IS NULL;

-- 2. Atualizar app_soft_deletable_tables() pra incluir 'nova_tabela'
```

### FKs CASCADE → SET NULL (Phase 1)

**21 FKs convertidas.** Agora delete (ou soft-delete) de:

- **mem_membros** preserva 11 tabelas filhas históricas:
  contribuições, trilha de valores, histórico, voluntariado, escalas,
  checkins, devocionais, grupo_membros, devocional_envios,
  **nsm_eventos** (jornada NSM), **grupo_encontro_presencas**
- **rh_funcionarios** preserva 8 tabelas: documentos, treinamentos,
  férias, **avaliações** (PCS atual + legacy), **progressões**,
  **pontuação colaborador**
- **cultos** preserva decisões e sessões Kids
- **kpi_indicadores_taticos** preserva registros e trajetória
  (cálculos cacheados em `kpi_valores_calculados` continuam CASCADE
  porque `kpi_id` é parte da PK composta · recalculáveis)

**CASCADE intencionalmente mantidos** (parent-child verdadeiro · não
faz sentido preservar filho sem pai):
- `mem_duplicados_ignorados.membro_a/b_id` (par de dedup)
- `mem_grupo_pedidos.membro_id` (pedido transient)
- `rh_escalas_extras`, `rh_materiais_funcionarios` (operacional)
- `kpi_krs`, `okr_revisoes` (estrutura OKR)
- `kpi_valores_calculados` (cache · PK composta)

Colunas filhas que eram NOT NULL agora aceitam NULL (necessário pra
SET NULL funcionar). Backend continua sempre fornecendo valor em INSERT
· o NULL só aparece se o pai for deletado posteriormente.

### CASCADE que permanecem (Phase 2 futura)

- `auth.users → profiles` (identidade · MANTER)
- `mem_grupos`, `mem_ministerios`, `usuarios` (próximo PR)
- `kids_criancas → kids_responsaveis` (vai virar RESTRICT na onda Kids)

## Super-admin · lockdown crítico de tabelas sensíveis (2026-05-21)

Migration `20260521170000_p0_super_admin_lockdown.sql` criou estrutura
de super-admin pra resolver achados de auditoria. Antes, várias tabelas
sensíveis tinham policies `USING (true) WITH CHECK (true)` que permitiam
qualquer authenticated alterá-las via anon key direto.

### Tabela `app_super_admins`

Lista de pessoas com acesso elevado. Gerenciada por **email** (match
contra `auth.users.email`), não UUID — assim dá pra cadastrar antes
mesmo do signup. Bootstrap: Marcos (`infra@cbrio.com.br`) +
Matheus (`matheus.toscano@cbrio.org`).

Pra adicionar mais alguém:
```sql
INSERT INTO public.app_super_admins (email, nome, added_by, notes)
VALUES ('novo.admin@cbrio.com.br', 'Nome', 'marcos', 'motivo');
```

Pra desativar (preserva histórico):
```sql
UPDATE public.app_super_admins SET ativo = false WHERE email = '...';
```

### Função `is_super_admin()`

`SECURITY DEFINER` (evita recursão de RLS na própria tabela). Match
case-insensitive por email. Usar em policies:

```sql
CREATE POLICY tabela_write_super ON public.tabela
  FOR INSERT TO authenticated WITH CHECK (public.is_super_admin());
```

### Tabelas que ganharam lockdown nesta migration

| Tabela | Read | Write |
|---|---|---|
| `cargo_modulo_permissao` | authenticated | super-admin **(privilege escalation fix)** |
| `igrejas` | authenticated | super-admin |
| `kpi_metas` | authenticated | super-admin |
| `app_super_admins` | super-admin | super-admin |

UI `/admin/permissoes` continua funcionando porque salva via backend
(`PUT /api/permissoes/matriz/celula`) que usa service_role e bypassa RLS.

### `mem_grupo_pedidos` · anon insert removido

Policy `"Anon insert mem_grupo_pedidos"` era resíduo morto · o form
público `/inscricao-grupos` usa `POST /public/grupos/inscrever` (backend
com service_role). Drop seguro · sem mudança no fluxo público.

### Próximas ondas planejadas (auditoria 2026-05-21)

- **Onda 2** · RLS contextual em `kids_*`, `mem_contribuicoes`, `rh_funcionarios`,
  `pcs_*`, `cultos_decisoes_pessoas`, `batismo_inscricoes`, `mem_membros`
  (usuário lê só o próprio + super-admin lê tudo + cargos com permissão
  lêem por escopo de área)
- **Onda 3** · `deleted_at` em tabelas críticas, converter
  `area_responsaveis.responsavel_nome`/`projects.leader` pra UUID FK,
  CASCADE → SET NULL em FKs históricas, audit log de leituras de CPF/salário

## Totem Kids · estado 2026-05-25 (sessao encerrada · aguardando teste real)

Marcos: "deixe tudo no contexto para ser testado, quando for a hora te chamo
novamente". Codigo 100% implementado. Falta hardware (Fire TVs) + setup
Brother no Windows do totem + culto piloto.

### Estado atual
- **Banco**: 660 familias + 894 criancas importadas do PC (CSV attendance
  dez/25→mai/26) + 2637 vinculos kids_responsaveis · 498/892 com responsavel
  (56%) · 394 sem (vao preencher via modal auto-cadastro no 1o check-in)
- **App**: 100% funcional · checkin manned, checkout, decisoes, painel ao
  vivo, sala de decisoes, configuracoes, parear, display sala, display foyer,
  teste etiqueta
- **TV das salas**: codigo pronto · falta comprar 6 Fire TV Sticks (~R$ 1800)
- **Brother**: instrucoes em docs/totem-kids-setup-brother.md · Marcos ainda
  nao configurou no Windows do totem fisico
- **Etiqueta DK-1201** paisagem 90×29mm (corrigi de 29×90 retrato)
- **Migrations aplicadas no Supabase**: 1-5 (ver lista abaixo). Marcos
  precisa aplicar a #6 (`20260522300000_totem_kids_chamadas_display.sql`)
  quando voltar pra testar TVs.

### Pendencias quando voltar (ordem sugerida)
1. Aplicar `20260522300000_totem_kids_chamadas_display.sql` no Supabase
2. Configurar Brother no Windows do totem (docs/totem-kids-setup-brother.md)
3. Comprar 6 Fire TV Sticks + cabos HDMI
4. Setup pareamento de cada Fire TV (1 por sala + 1 foyer):
   - Admin → /configuracoes → Estacoes → cria "TV Infantil 1" tipo `display`
     vinculada a sala
   - Clica ✨ QR · escaneia no Silk Browser do Fire TV
   - Page `/parear?estacao=X&token=Y` valida + redireciona display-sala
   - Marca URL como homepage do Silk Browser
   - Repete pras 5 salas + 1 foyer
5. PC touch da recepcao · criar estacao tipo `self` + parear · checkout
   self-service (pai opera sem login)
6. Teste num culto pequeno (Quarta com Deus) antes do domingo grande
7. (Opcional) Agendar pg_cron 23h pra `fn_kids_checkout_forcado_pendentes()`

### Pedido original
Pedido do Eduardo (gestor) repassado pelo Marcos · substituir o **Planning
Center Check-Ins** por modulo proprio pra ministerio infantil. Diferente do
totem do voluntariado: crianca **nao** e escalada antes, mae digita o nome no
totem, voluntario imprime 2 etiquetas (crianca + recibo do responsavel) com
codigo de seguranca de 4 chars · no checkout, etiqueta da mae bate com etiqueta
da crianca pra liberar a saida.

Apos primeira implementacao, Marcos pediu **TVs nas salas chamando o pickup**
(2026-05-22): pai digita codigo na recepcao, sistema dispara chamada pra TV
da sala, professora ve "F8K3 · MARIA CLARA" gigante + TTS pt-BR "Maria Clara
sua familia chegou", leva crianca pra recepcao. Painel foyer agregado.

### Localizacao
- Menu **Ministerial > Ferramentas > Totem Kids** (vizinho do Totem Membro)
- Operacao: `/ministerial/totem-kids` (check-in), `/checkout`, `/painel`
- Admin (Mariane/coord-kids): `/admin/totem-kids` com 5 abas (Sessoes, Salas,
  Estacoes, Criancas, Auditoria)
- Painel KPI continua em `/kids` (nao mudou)

### Plano completo
`docs/checkin-kids-plano.md` · arquitetura, schema, fluxos, 10 decisoes
fechadas com o Marcos em 2026-05-21:
1. **0-12 anos** (13+ → AMI)
2. Estacoes MVP: **so manned** (voluntario sempre opera) · self/roster em v2
3. Foto: **opcional com consentimento**, NUNCA na etiqueta
4. Salas iniciais: 5 padrao (Bercario, Maternal, Infantil 1, Infantil 2, Pre-AMI)
5. Multi-campus: campo `igreja_id`, hoje so Sede
6. Override: coord-kids + admin + lider Kids do dia (3 papeis)
7. Codigo sem expiracao · cron noturno 23h fecha pendentes
8. App pra mae: **nunca** · so totem fisico
9. Historico pra mae: nao · so staff ve
10. Driver Brother: **navegador** (window.print + @page 62mm x 100mm) · Brother
    como printer default do Windows do totem. v2 = agente local TCP:9100

### Schema (7 tabelas + 1 view + 1 view historico + 3 triggers + 2 funcoes)
- `kids_criancas` (cadastro minimo · sem CPF · LGPD)
- `kids_responsaveis` (M:N criança × mem_membros)
- `kids_salas` (Berçário, Maternal, etc · faixa etaria em meses · igreja_id)
- `kids_sessoes` (1 por culto · FK cultos.id UNIQUE)
- `kids_estacoes` (totem fisico · printer_target informativo)
- `kids_checkins` (1 por sessao × crianca · codigo_seguranca + barras)
- `kids_etiquetas_log` (auditoria impressao + reimpressao)
- `fn_kids_gerar_codigo_seguranca()` · alfabeto 32 chars [A-HJ-NP-Z2-9] · 32^4 unicos
- Trigger `fn_kids_sessao_consolida_culto` · status='encerrada' → atualiza
  `cultos.presencial_kids` e `cultos.decisoes_kids` (alimenta KID-01 automatico)
- Trigger `fn_kids_decisao_para_culto` · `fez_decisao_jesus=true` → cria
  registro em `cultos_decisoes_pessoas` com tipo='kids' (schema da migration
  20260518150000 ja suportava)
- `fn_kids_checkout_forcado_pendentes()` · pra rodar via cron 23h

### Permissoes
- Coord-kids (Mariane) ganha nivel 5 automatico pelo `AREA_MODULO_BOOST` da
  area KIDS (auth.js linha ~99). Matriz default: 3 em `cargo_modulo_permissao`.
- Admin/diretor: sempre passa
- "Lider Kids do dia": verificado dinamicamente no backend (`isLiderKidsDoDia`)
  via `vol_check_ins` ativo hoje em culto com `has_kids=true`. Permite override
  no checkout sem ter cargo formal.
- ROUTE_MODULE_MAP estendido: `'totem-kids': ['kids']`

### Backend
- `backend/routes/totemKids.js` · todas as rotas (~600 linhas)
- Registrado em `server.js` linha ~123: `/api/totem-kids`
- Padrao igual aos outros: `authenticate` + `authorizeModule('kids', N)`

### Frontend
- `src/pages/ministerial/totemKids/`
  - `TotemKidsCheckin.tsx` · busca + flow + impressao
  - `TotemKidsCheckout.tsx` · codigo de 4 chars + match + override
  - `TotemKidsPainel.tsx` · ao vivo · refresh 15s · botao encerrar sessao
  - `lib/imprimir.ts` · usa `bwip-js` (added na PR) pra Code128 · window.print
  - `lib/idade.ts` · helpers de calc/format
- `src/pages/admin/totemKids/TotemKidsAdmin.tsx` · 5 abas
- Rotas em `src/App.tsx` linha ~422 (lazyWithRetry)
- Menu em `src/components/layout/AppShell.jsx` secao Ministerial > Ferramentas

### Setup do hardware (uma vez)
1. Brother QL-820NWB com cabo ethernet, IP fixo no DHCP da igreja
2. Driver Brother no Windows do totem
3. Brother como printer DEFAULT do Windows
4. Browser do totem com "Imprimir sem dialogo" (default em kiosk mode)
5. Etiqueta DK-22251 (62mm × 100mm continua)

### Migrations
- `20260521160000_totem_kids_schema.sql` · schema completo
- `20260521160100_totem_kids_seed.sql` · 5 salas + 1 estacao + ajuste matriz

### Dependencias adicionadas
- `bwip-js@4.10.1` (frontend · gera SVG do Code128 lazy)

### Proximos passos quando voltar
- Testar fluxo manned end-to-end num culto de menor movimento
- Configurar Brother como printer default no totem fisico
- Decidir se vamos adicionar Self/Roster (fase 2)
- Eventualmente: agente local TCP pra impressao programatica (v2)

## ⚠️ Pendencias de 2026-05-18 · estado atualizado 2026-05-19

Houve troca de frentes em 2026-05-19. Matheus migrou pra modulo
**Devocionais** (ver secao propria abaixo). Permissoes PR2 ficou com
o Marcos · YouTube OAuth fica em validacao manual.

### 1. Permissoes · PR 2/2 (UI admin) · MARCOS toca
PR #464 ja entregou schema/seeds/middleware/endpoints. Falta a UI:
- UI em `/admin/permissoes` pra editar a matriz cargo × modulo e overrides
  (consome `/api/permissoes/matriz`, `/matriz/celula`, `/cargo/:id`)
- UI em `/admin/usuarios` pra gerenciar cargo + areas por pessoa
  (consome `/api/permissoes/usuario/:id`, `/usuario/:id/cargo`,
  `/usuario/:id/areas`, `/usuario/:id/modulo`)
- Migrar `ModuleGuard` keys do front pra ler slugs novos diretamente
  (`canRH`, `canFinanceiro` etc viram aliases temporarios)

Endpoints completos em `backend/routes/permissoes.js` (linhas 15-298).
Detalhes do PR 1 no body do PR #464.

### 2. Permissoes · 6 itens da reuniao (decisao pendente)
Defaults ficam na matriz seedada · UI permite editar quando precisar.
Decisao final pode esperar a UI estar pronta:
1. Assistente do Online (ninguem atribuido)
2. Estrutura do Marketing (lideres de subarea ou todos assistentes?)
3. Cargo do Chico (provisorio `assistente-financeiro`, confirmar com Ju do RH)
4. Permissoes do Lider de Producao (reuniao foi interrompida)
5. Override flow formal (processo de pedido + aprovacao)
6. Inconsistencia `coordenador-financeiro × Financeiro`: planilha "4",
   resumo "4 + A + E" · segui a planilha

### 3. YouTube · validacao em prod (acao do Marcos · manual)
PRs #424, #461 e #468 mergeados em 2026-05-18. Live-monitor cron rodando
verde. Pendente checar:
- [ ] Migration `20260514210000_online_oauth_tokens.sql` aplicada?
- [ ] Envs `GOOGLE_OAUTH_CLIENT_ID` / `GOOGLE_OAUTH_CLIENT_SECRET` no Vercel?
- [ ] Admin clicou "Conectar canal" em `/online`?
Confirmar via `GET /api/online/oauth/status`.

### Untracked locais (decidir)
Marcos tem no working dir dele (nao commitou ainda):
- `docs/permissoes-mapa.md`, `docs/permissoes-mapa.xlsx`,
  `scripts/gerar_permissoes_xlsx.py` · artefatos da reuniao de
  permissoes. Combinar com ele se entram no repo ou ficam locais.

### Fix aplicado 2026-05-19 · KPIs ADM Criativo
Migration `20260519140000_recalcular_adm_criativo.sql` chama
`recalcular_todos_kpis_adm()` pra popular os 6 KPIs `ADM-C-*` (3 SLA
+ 3 NPS) que nunca tinham sido calculados desde o seed criativo
(20260512280000). Sem solicitacao nas areas producao/adoracao/marketing
ainda, valores ficam NULL · mas a linha existe em
`kpi_valores_calculados` e o painel para de mostrar lacuna estranha.

### Permissoes UI · matriz cargo × modulo (2026-05-19)
PR 2/2 da reuniao de permissoes (parcial · so matriz, falta tela de
usuarios). Tela em `/admin/permissoes` (arquivo
`src/pages/admin/Permissoes.jsx`):

- Filtros: cargo (select de 25) + busca por modulo
- Lista vertical de modulos agrupados por categoria (Estrategica /
  Ministerial / Operacional / Dados-IA-Admin)
- Cada linha: select de nivel 0-5 + checkboxes E (exportar) / A
  (aprovar) / * (escopo proprio)
- Salva por celula (UPSERT em `cargo_modulo_permissao` via
  `PUT /api/permissoes/matriz/celula`) · cache do middleware invalida
  automatico via `bustPermissionCaches()`
- Acesso restrito a `isAdmin` (entrada no menu Administrativo >
  Configuracoes)
- Rotas legacy `/permissoes` e `/admin/kpi-areas` redirecionam pra
  `/admin/permissoes`

**Falta pra fechar a PR2 inteira:**
- ~~`/admin/usuarios` · UI pra trocar cargo + areas + overrides~~ ✓ feito
  (2026-05-19 · ver `src/pages/admin/Usuarios.jsx`)
- Migrar `ModuleGuard` keys do front pra slugs novos (canRH, etc viram
  aliases temporarios) · TODO de polish, nao bloqueante · hoje os hooks
  ja lem dos slugs novos via AuthContext

### PainelArea v2 · saude + dados vs indicadores (2026-05-20)
Marcos pediu visualizacao mais bonita + separacao clara entre **dados**
(numeros brutos preenchidos) e **indicadores** (KPIs calculados) +
visualizacao de saude da area.

**Backend** (`backend/routes/painelArea.js`):
- Resposta passou a incluir `dados[]` agregados a partir de `dados_brutos`
  filtrados pela area · ultimo valor, total mes atual vs anterior,
  variacao %, historico de 6 registros pra sparkline
- Resposta inclui `saude` com score 0-100 calculado:
  - 50% % indicadores no alvo
  - 30% cobertura (KPIs com dado)
  - 20% % tipos de dado com registro nos ultimos 30 dias
- Score mapeado pra diagnostico: saudavel / atencao / risco / critico

**Frontend** (`src/pages/ministerial/PainelArea.jsx`):
- Header com **score circular** colorido por diagnostico (verde/ambar/
  vermelho) · ao lado do nome da area
- NPS do culto continua destacado em card no topo (antes das tabs)
- **3 tabs principais**:
  - **Saude** (default) · stats cards + barras de progresso (cobertura,
    dados recentes, % no alvo) + explicacao do score
  - **Dados** · linha por tipo de dado bruto, com mini-sparkline (SVG)
    dos ultimos 6 registros + variacao % vs mes anterior
  - **Indicadores** · KPIs calculados com filtro por valor da Jornada
    (pills · nao tabs)
- Coracao da decisao: dado eh `dados_brutos.valor` (numero absoluto),
  indicador eh KPI derivado em `kpi_indicadores_taticos`. UI deixa
  isso explicito.

### Modulos de culto · finalizacao (2026-05-20)
Decisoes do Marcos pos-organograma:

**Migration `20260520150000_cultos_finalizacao.sql`**:
- Modulo "CBKids" renomeado pra "Kids"
- 3 cargos novos · coordenador-kids, coordenador-ami, coordenador-bridge
  (matriz copiada do coordenador-online)
- **Matriz universal**: nivel 1 nos 4 modulos de culto (kids/ami/bridge/
  online) pra TODOS os cargos ativos · qualquer pessoa pode visualizar
- **Sem export**: `pode_exportar=false` forcado em todos os cargos nesses
  modulos · read-only de verdade
- Titulares atribuidos:
  - Mariane Gaia · coordenador-kids · area KIDS
  - Arthur Cecconi · coordenador-ami · area AMI
  - Lillian Xavier (novo cadastro · lillian.xavier@cbrio.org) ·
    coordenador-bridge · area Bridge
- Boost por area continua dando nivel 5 (admin) automatico pros titulares
  no proprio modulo

**Frontend PainelArea.jsx · reformulado**:
- SEM icones (header limpo com cor lateral sutil) · "evita cara de IA"
- Card destacado de NPS de culto (CULTO-NPS-*) no topo, antes da lista
  geral · separado dos outros KPIs por importancia
- Botao "Preencher dados" so aparece pra quem tem nivel 3+ no modulo
  (coordenador da area ou admin) · redireciona /integracao?aba=cultos
- Outros usuarios apenas leem · sem botao de acao

### Modulos kids/ami/bridge · drill-down de KPIs por area (2026-05-20)
Espelho do modulo Online · 3 paginas read-only com indicadores filtrados
por area de culto. Preenchimento continua via /integracao.

**Migration `20260520140000_modulos_area_culto.sql`**:
- INSERT 3 modulos em public.modulos: kids, ami, bridge (categoria=ministerial)
- Matriz default · copia da matriz do modulo `online` pra cada cargo

**Backend**:
- `backend/middleware/auth.js` · AREA_MODULO_BOOST estendido:
  - 'kids' → 'kids', 'ami' → 'ami', 'bridge' → 'bridge'
  - Pessoas com area "KIDS"/"AMI"/"Bridge" ganham nivel 5 no modulo correspondente
- `backend/middleware/auth.js` · ROUTE_MODULE_MAP estendido com kids/ami/bridge
  e 'painel-area' que aceita qualquer dos 4
- `backend/routes/painelArea.js` (novo) · `GET /api/painel-area/:area`
  retorna kpis ativos onde `kpi_indicadores_taticos.area ILIKE area`,
  agrupados por valor + trajetoria + lider. Protegido por
  `authorizeModule('painel-area', 1)` · nivel 1 suficiente (read-only).

**Frontend**:
- `src/pages/ministerial/PainelArea.jsx` (novo) · componente reusavel
  parametrizado por `area`. Header com cor+icone temático, 4 stats cards
  (total, no alvo, atrasado, critico), filtro por valor da Jornada,
  lista de KPIs com trajetoria + meta + lider. Click navega pro detalhe
  `/painel/kpi/:id`. Botao "Preencher dados" redireciona pra
  `/integracao?aba=cultos`.
- 3 wrappers · PainelKids.jsx, PainelAmi.jsx, PainelBridge.jsx (cada um
  renderiza `<PainelArea area="X" />`)
- 3 rotas em `src/App.tsx` com `<ModuleGuard moduleSlug="X">` (nivel 1)
- 3 itens de menu em AppShell · Ministerial > Areas, abaixo de Online,
  com `module: 'kids|ami|bridge'` pra filtragem automatica

**Cores temáticas**:
- Kids → pink-500 (#EC4899)
- AMI → violet-500 (#8B5CF6)
- Bridge → blue-500 (#3B82F6)
- Online → red-500 (#EF4444 · mantido)

### Eventos · escopo_proprio trata como "lider" no kanban (2026-05-19)
**Pedido**: Pedro Paiva (cargo `coordenador-marketing`, area Marketing)
precisa acessar Eventos, ver todas as tarefas e preencher · filtradas
pela area dele.

**Mudancas em `src/pages/eventos/Eventos.jsx`:**
- `accessLevel` agora le slugs novo + legado: `['eventos', 'Agenda']`
- Novo: `eventosEscopoProprio = modulePerms?.eventos?.escopo_proprio`
- `isLider` ganha condicao OR: `(accessLevel >= 3 || eventosEscopoProprio)`
  permite cargos com escopo (coord-marketing, lider-producao, etc) entrar
  no kanban filtrado pela area, mesmo com nivel < 3 na matriz base.
- `defaultArea` continua vindo de `userAreas[0]` quando isLider=true.

**Migration `20260519330000_coord_marketing_eventos_nivel3.sql`**:
- coord-marketing × eventos: 2 → 3 + escopo_proprio=true
- lider-producao × eventos: idem (mesma logica de filtro por area)

### Permissoes · auditoria + atribuicao em massa (2026-05-19)
Despejo do estado real (cargos, modulos, areas, usuarios+areas) gerou
3 PRs em sequencia:

**PR #526 · Limpeza** (`20260519300000_desativar_cargos_modulos_legados.sql`)
- 5 cargos `slug=null` viraram `ativo=false` (sobras do modelo "5 niveis")
- 2 modulos `slug=null` viraram `ativo=false` (Banco de Arquivos, Cultura)

**PR #528 · Atribuicao em massa** (`20260519310000_atribuir_cargos_em_massa.sql`)
- Cargo `dev` recebe nivel 5 em TODOS modulos ativos (upsert idempotente)
- Casos especiais por email:
  - Arthur Serpa → `diretor-ministerial`
  - Marcos (marcospaulo.almeida + marcos@cbrio.com) → `dev`
  - Yago Torres → `coordenador-financeiro`
  - Pedro Paiva → `coordenador-marketing`
  - Pedro Fernandes → `lider-producao`
- Inferencia por areas pra quem esta NULL:
  - 6 areas Gestao → `diretor-administrativo`
  - 4 areas Criativas → `diretor-criativo`
  - 4 areas Ministeriais → `lider-ministerial`
  - 1 area Ministerial / Online → `lider-ministerial` (boost cobre)
  - 1 area Gestao especifica → assistente correspondente
  - Fallback → `assistente-area`

**PR #530 · Convergencia de duplicidades** (`20260519320000_converger_duplicidades_usuarios.sql`)
- Apaga registros LIXO (email+cargo NULL e sem areas/overrides)
- Matheus consolidado em `matheus.toscano@cbrio.org` (tem 6 areas Gestao)
  com cargo `diretor-administrativo`; outros 3 emails removidos com
  defensiva de migrar FKs antes do delete
- Lorena Andrade ja era canonica em `lorena.andrade@cbrio.org` · lixo
  removido pelo filtro generico

Apos aplicar as 3, esperado: 0 usuarios sem cargo, 1 registro por
pessoa, matriz coerente com a hierarquia organizacional.

### ModuleGuard aceita slug + Expansao some pra lider-ministerial (2026-05-19)
**Bug 1**: Cuidados redirecionava pra dashboard mesmo com nivel 1.
ModuleGuard usava hook legado `canCuidados` (nivelMinimo=2). Lorena
com nivel 1 caia em `false`.

**Fix 1** em `src/App.tsx`:
- ModuleGuard ganha props `moduleSlug` e `nivelMinimo` (default 1)
- Quando `moduleSlug` informado, checa `modulePerms[slug].leitura >= nivelMinimo`
- Mantem `permKey` pra retrocompat (hooks canX legados)
- Rota `/ministerial/cuidados` migrada pra `moduleSlug="cuidados"`
- Rota `/expansao` migrada pra `moduleSlug="expansao"`
- Item de menu "Expansão" trocou `perm:canExpansao` → `module:expansao`

**Bug 2**: Lorena via Expansao no menu mesmo sem responsabilidade no
planejamento. Matriz padrao tinha `lider-ministerial × expansao = 2`.

**Fix 2** migration `20260519290000_lider_ministerial_expansao_zero.sql`:
- Cargo `lider-ministerial × expansao = 0`
- Quem precisa de acesso ganha override individual em /admin/permissoes
  > Usuarios > [pessoa] > Overrides

### Projetos · lider ministerial so ve aba Lista filtrada por area (2026-05-19)
Quando `modulePerms.projetos.escopo_proprio = true` (e nao eh admin/diretor),
Projetos.jsx aplica modo restrito:

- **UI**: forca `tab=1` (Lista) via useEffect · esconde TABS bar e botao
  "Novo Projeto"
- **Filtro**: ao inves de filtrar lista por `profile.name` (leader/responsible),
  filtra por `p.area in userAreas` (case-insensitive)
- Aba "Detail" (tab=4) continua acessivel via click num projeto da lista
- Admin/diretor sempre veem todas as abas + todos os projetos

Isso casa com o modelo "1 cargo + N areas" da PR boost-por-area: o lider
ministerial atribuido a area X ve so projetos da area X.

### Boost por area · 1 cargo + N areas = acesso modular (2026-05-19) ⭐
**Modelo aprovado**: o sistema tem 1 cargo unico `lider-ministerial`
(genérico) e as **áreas** da pessoa decidem onde ela ganha acesso
maximo (nivel 5). Atribui area "Cuidados" → vira admin de Cuidados.
Atribui "Grupos" → vira admin de Grupos. Sem precisar criar cargo
separado pra cada lider.

**Implementacao** em `backend/middleware/auth.js`:
- Constante `AREA_MODULO_BOOST` mapeia area normalizada → modulo slug:
  ```js
  { cuidados→cuidados, grupos→grupos, integracao→integracao,
    voluntariado→voluntariado, next→next, online→online }
  ```
- `_normalizarArea()` remove acentos · "Integração" vira "integracao"
- `resolveEffectivePerms()` ganha param `areas` · pra cada area que
  bate em `AREA_MODULO_BOOST`, escala `leitura+escrita` do modulo
  correspondente pra 5 (`Math.max`, so eleva nunca rebaixa)
- `authenticate()` carrega `userAreas` ANTES de chamar resolveEffectivePerms

**Migration `20260519280000_lider_ministerial_matriz_uniforme.sql`**:
- Os 6 modulos com boost (cuidados, grupos, integracao, voluntariado,
  next, online) vao pra `nivel=1` na matriz do `lider-ministerial`
- Sem boost continua: nivel 1 (so ve). Com boost: nivel 5 (admin)
- Outros modulos do cargo intocados: membresia=3, minha-area=3,
  projetos=3+escopo, nps=5

**Operacionalmente**:
- Pra cadastrar novo lider: atribuir cargo `lider-ministerial` + a area
  correspondente (Cuidados, Grupos, etc) em `/admin/permissoes` aba
  Usuários. Acesso vira automatico.
- Pra adicionar novo modulo com mesmo padrao: adicionar entrada em
  `AREA_MODULO_BOOST`.

### Devocional · RH vira membro + IA escreve texto biblico (2026-05-19)
**Problema 1**: tentar abrir devocional logado e receber "voce nao e'
membro". O `resolveMembro` em `devocionalMembro.js` exige
`profile.membro_id` ou match por email em `mem_membros`. Funcionarios
do RH nao estavam la.

**Fix 1** · migration `20260519260000_sync_rh_funcionarios_para_membros.sql`:
- Cria `mem_membros` pra cada `rh_funcionarios.status='ativo'` com email
- UPDATE `profiles.membro_id` linkando por email
- Idempotente · NOT EXISTS impede duplicacao

**Problema 2** · IA escrevia so a referencia ("Mateus 5:3") sem texto.
Schema ja tinha `devocional_itens.passagem_texto` e o front renderiza
(`DevocionalHoje.tsx:128`), mas o backend nem pedia nem salvava.

**Fix 2** em `backend/routes/devocionalPlanos.js`:
- systemPrompt agora exige `passagem_texto` (NAA/ARA) "pra pessoa poder
  ler sem abrir a Biblia"
- JSON format inclui o campo
- `.map()` salva `passagem_texto: o.passagem_texto`

**Importante**: devocionais ja gerados ANTES desta PR continuam sem
texto. Pra regenerar, usar `sobrescrever=true` no endpoint
`POST /api/devocional-planos/:id/gerar`.

### Mobile · menu hamburger + calendario com scroll horizontal (2026-05-19)
Sem nav no mobile · MegaMenu tinha `className="hidden md:block"` e nao
havia substituto. Pessoa entrava no `/dashboard` e nao tinha como
trocar de modulo.

**Fix**:
- Componente novo `MobileNavSheet` em `AppShell.jsx` · botao hamburger
  (`Menu` icon · md:hidden) abre Sheet lateral esquerdo com a lista
  completa de NAV_ITEMS filtrados (respeita matriz cargo×modulo).
- Search button colapsa pra so icon no mobile (esconde texto + ⌘K)
- Header passou a ter padding menor no mobile (`px-4 md:px-6`)

**Integracao mobile · calendario semanal**:
- 7 cards de dia ficavam apertados em telas estreitas.
- Agora wrapper tem `overflow-x: auto` + cada coluna tem
  `minmax(96px, 1fr)` · em mobile vira scroll horizontal preservando
  legibilidade; em desktop continua grade fixa de 7 colunas.
- Margens negativas (`marginLeft: -4`) compensam o padding pra grudar
  na borda da tela.

### Alda Lorena → Lorena · preferencia de nome (2026-05-19)
Lorena pediu pra ser chamada so de "Lorena" (Alda Lorena Cellos
Andrade e' o nome legal, fica intocado em rh_funcionarios/PCS).

Migration `20260519240000_alda_para_lorena.sql` atualiza:
- `profiles.name` · nome de visualizacao na UI
- `usuarios.nome` · sistema granular
- `area_responsaveis.responsavel_nome` · referencia da Integracao
- `projects.leader` + `projects.responsible` · CRITICO porque filtro
  escopo_proprio em /projetos compara profile.name com esses campos
- `kanban_tasks.responsible` + `cycle_phase_tasks.responsavel_nome`
  (se as tabelas existirem)

Textos fixos atualizados:
- `src/pages/ministerial/Online.tsx:559`
- `backend/routes/kpis.js:12` (comentario)

Idempotente · so muda registros que ainda tem "Alda Lorena".

### Fix · item "Cuidados" no menu (2026-05-19)
Hook legado `canCuidados` em AuthContext usa `nivelMinimo = 2`
(`canAccessModule(['cuidados', 'Cuidados'])` default). Aldas com
`cuidados=1` (so leitura) caem em `canCuidados=false` e Cuidados some
do menu.

Fix · item "Cuidados" no AppShell trocou de `perm: 'canCuidados'`
para `module: 'cuidados'`. O check do `module:` usa `leitura >= 1`
(definido em AppShell `itemAllowed`) que e' o correto pra exibicao.

**Mesmo padrao deve ser usado nos demais itens** que precisam aparecer
mesmo em nivel 1 (visualizar): troca `perm: 'canX'` -> `module: 'slug'`.
Hoje so Cuidados foi corrigido · outros items mantem perm legado e
serao migrados pessoa a pessoa quando o problema aparecer.

### Consolidacao Alda · migration unica idempotente (2026-05-19)
Migration `20260519230000_lider_ministerial_consolidado.sql` reune
TUDO que tinha sido espalhado nas anteriores (round 1 + round 2):

- Matriz cargo `lider-ministerial`: gestao=0, ritual=0, online=1,
  grupos=1, cuidados=1, voluntariado=5, nps=5, projetos=3+escopo_proprio
- Atribui cargo `lider-ministerial` ao registro da Alda em `usuarios`
  (busca por nome `%alda lorena%` ou email `%alda%`)
- Associa Alda a area `Integração` (idempotente · NOT EXISTS)

Pode rodar quantas vezes precisar · sem efeito colateral.

### Limpeza de codigo morto de permissoes (2026-05-19)
Apos auditoria estrutural pedida pelo Marcos, identificado e removido
o que sobrava do sistema antigo de "5 niveis por modulo":

**Removido (zero consumidores no projeto):**
- `PERMISSIONS{}` map · era usado pra retornar `req.user.permissions`
  com flags `canEditAll`/`canViewMarketing`/etc. Nenhum handler lia.
- `req.user.permissions` · saida do PERMISSIONS, nao consumida.
- `req.user.mappedRole` · campo nunca lido externamente.
- `mappedRole` variavel no `authenticate` · calculo inutil.
- Export de `PERMISSIONS` do module.exports.

**Mantido (com TODO de migracao gradual):**
- `ROLE_MAP{}` · ainda usado internamente por `authorizeCycle` em
  `cycles.js`. Migrar quando regras de ciclo criativo forem revisadas
  pra usar `authorizeModule('eventos', nivel)`.
- `profile.role` em `req.user.role` · usado em queries de membresia,
  voluntariado, NEXT. Nao decide permissao de modulo (matriz decide),
  mas continua identificando o tipo de usuario base.
- Hooks `canRH`, `canFinanceiro`, etc no `AuthContext` · aliases que
  ja leem `modulePerms[slug]`. 15+ telas dependem. Manter ate migracao
  pra `getAccessLevel(['slug'])` direto.

**Decisao arquitetural · permissao = cargo + matriz**

A unica fonte de verdade pra permissao de modulo eh:
1. Cargo do usuario em `usuarios.cargo_id`
2. Matriz default `cargo_modulo_permissao`
3. Overrides individuais `permissoes_modulo` (com expiracao)

Qualquer permissao nova daqui pra frente:
- Backend: `authorizeModule('slug', nivelMinimo)` em vez de `authorize('admin','diretor')`
- Frontend: `getAccessLevel(['slug'])` em vez de hooks `canX`
- Itens de menu: campo `module: 'slug'` no AppShell em vez de `perm: 'canX'`

### Fix sync v2 · coluna `nome` NOT NULL (2026-05-19)
Migration `20260519200000_sync_profiles_para_usuarios.sql` falhou em
prod com `null value in column "nome" of relation "usuarios" violates
not-null constraint`. Tabela `usuarios` em prod tem `nome` NOT NULL
(schema de 20260413145129).

Fix:
- Nova migration `20260519210000_sync_profiles_usuarios_com_nome.sql`
  inclui `nome` com `COALESCE(p.name, split_part(email, '@', 1))`
- Auto-provision em `backend/middleware/auth.js` agora envia `nome`
  no insertPayload (fallback parte do email)
- `resolverUsuarioId` em `backend/routes/permissoes.js` mesmo padrao
  de fallback

### Sync profiles → usuarios + UI mostra cargo atual (2026-05-19)
**Problema diagnosticado**: a tabela `usuarios` so era populada por
auto-provision quando alguem logava apos o middleware granular ter
sido implementado. Profiles antigos (como Alda Lorena, que ja logava
antes) ficavam fora · backend retornava `granular = null` · front caia
no fallback de "carregando" que mostra tudo no menu.

**Fix em 3 partes:**

1. **Migration `20260519200000_sync_profiles_para_usuarios.sql`** ·
   backfilla TODOS os profiles ativos em usuarios com cargo default por
   role (mesmo mapeamento do auto-provision):
   - admin/diretor → diretor-administrativo
   - voluntario → voluntario
   - demais → membro (mais restritivo · ajustar caso a caso)
   Idempotente · NOT EXISTS impede duplicacao.

2. **GET /api/permissoes/colaboradores** agora enriquece cada
   colaborador com `cargo_id`, `cargo_slug` e `cargo_nome` via LEFT JOIN
   manual em usuarios (LowerCase email pra bater).

3. **UI Usuarios** (em `/admin/permissoes` aba Usuarios):
   - Cada linha mostra o cargo atual (ou badge amber "Sem cargo")
   - Linhas "Sem cargo" tem border amber pra destacar
   - Filtro novo "⚠️ Sem cargo (N)" aparece quando ha pessoas sem cargo
   - Permite o admin localizar e atribuir rapidamente

### Cache bust manual de permissoes (2026-05-19)
**Problema**: `cargo_modulo_permissao` tem cache 5min no middleware
(`backend/middleware/auth.js` linha 59) que so invalida automaticamente
quando o write passa pelo PUT /matriz/celula. Quando rodamos UPDATE
direto no Supabase SQL Editor, o cache do backend continua com a
matriz antiga ate 5min ou ate `bustPermissionCaches()` ser chamado.

**Solucao**: novo endpoint `POST /api/permissoes/cache/bust` (admin)
que chama `bustPermissionCaches()`. Exposto no front em
`/admin/permissoes` como botao "Forçar bust de cache" ao lado do
"Atualizar". Usar SEMPRE depois de rodar migration de matriz direto
no SQL.

### Ajustes round 2 Alda · cuidados leitura + projetos escopo proprio (2026-05-19)
Apos PR #492, Marcos refinou mais 2 pontos pra cargo `lider-ministerial`:

**Migration `20260519180000_alda_round2_ajustes.sql`:**
- cuidados: 3 → 1 (ve sem editar)
- projetos: 2 → 3 com `escopo_proprio=true` (ve so projetos onde
  ela e' `leader` ou `responsible`)

**Frontend Cuidados (`Cuidados.tsx`)** · `podeEditarCuidados =
getAccessLevel(['cuidados']) >= 3` esconde:
- Botoes "Novo" (Acompanhamento / Encontro Jornada180 / Convertido)
- Botoes "Concluir" e Trash em cada item
- Disable nos checkboxes "atendido_apos_culto" e "cadastrado"
- Disable nos botoes "Salvar" da aba Agregado

**Frontend Projetos (`Projetos.jsx`)** · respeita
`modulePerms.projetos.escopo_proprio`:
- Em `loadList`, depois do fetch, filtra `list` por
  `p.leader === profile.name OR p.responsible === profile.name`
  (case-insensitive). Cobre TODAS as views (lista, kanban, gantt,
  timeline) porque ja sai filtrado da fonte.
- Admin/diretor sempre veem tudo.
- Limitacao conhecida: campos `leader`/`responsible` sao texto livre
  hoje (memoria pede UUID, mas migracao ainda nao aconteceu). Se o nome
  estiver com typo, falha o match. Migracao futura · resolver.

### Ajustes pos-teste Alda Lorena · cargo lider-ministerial (2026-05-19)
Marcos testou logado como Alda (lider de Integracao) e mapeou 8
problemas. Esta PR ajusta de uma vez:

**Migration `20260519160000_matriz_lider_ministerial_ajustes.sql`** ·
muda nivel default do cargo `lider-ministerial` em 5 modulos:
- gestao: 1 → 0 (some do menu)
- online: 3 → 1 (so leitura · modulo eh somente leitura per design)
- grupos: 3 → 1 (so leitura · nao cria/edita grupo)
- voluntariado: 3 → 5 (gerencia time completo da area)
- nps: 2 → 5 (cria pesquisas, vincula, analisa)

**Menu (AppShell)** · gateway de visibilidade:
- Items podem declarar `module: '<slug>'` · so aparece se
  `modulePerms[slug].leitura >= 1`
- Items 'Painel CBRio', 'NPS', 'Minha Area', 'Gestao (PMO)' ganham
  module key (era visivel pra qualquer um antes)
- Totem Membro: trocou `perm: canMembresia` → `perm: isAdmin`
- Grupo "Criativo" do menu agora tem `roles: ['admin', 'diretor']`
- Helper `sectionAllowed(section)` filtra grupos por role

**Painel.jsx** · botao "Ritual Mensal" envolvido em `{isAdmin && ...}`
(antes mostrava pra todo mundo e o /ritual e' diretoria-only).

**Backend NPS** · `authorize('admin', 'diretor')` virou
`authorizeModule('nps', 3)` em 4 endpoints (gerar-perguntas, POST /,
PUT /:id, POST /:id/analisar). Lider com nivel 3+ em `nps` cria e
analisa pesquisas da sua area.

**Online.tsx** · `OAuthStatusCard` retorna null pra quem nao tem
`getAccessLevel(['online']) >= 3`; botao "Sincronizar agora" do header
escondido pela mesma condicao.

**Grupos.jsx** · `podeEditarGrupos` deriva de
`getAccessLevel(['grupos']) >= 3`. Esconde botoes:
- Editar / Desativar / Reativar grupo
- Registrar encontro (chamada) · Adicionar membro
- Novo Grupo · Upload material · Trash material

QR/Link, visualizacao de membros, materiais e KPIs continuam
acessiveis (so leitura).

### Fix · profile UUID vs usuarios INTEGER (2026-05-19)
**Bug encontrado:** tabela `usuarios` em prod tem `id INTEGER` (legado da
migration 20260410), mas frontend mandava `profile.id` (UUID). Erro
ao mudar cargo: `invalid input syntax for type integer`.

**Solucao**: helper `resolverUsuarioId(idParam)` em `permissoes.js`
agora detecta se eh UUID ou int. Se UUID, busca `profiles.email`,
procura/cria registro em `usuarios` por email e retorna o int id.
Aplicado em todos endpoints que tocam usuarios: GET/:id, PUT/cargo,
PUT/areas, PUT/modulo, DELETE/modulo. Lazy-create no momento do
primeiro write (nao polui a tabela com profiles que ninguem editou).

### Usuarios UI · cargo + areas + overrides (2026-05-19)
**Local: aba "Usuários" dentro de `/admin/permissoes`** (era pagina
separada `/admin/usuarios` · foi consolidado em 2026-05-19 a pedido
do Marcos). Rota legacy `/admin/usuarios` redireciona pra
`/admin/permissoes?aba=usuarios`.

Componente `src/pages/admin/Usuarios.jsx` (export default · sem header
proprio, ja vem dentro do shell de Permissoes):

- Lista de colaboradores via `GET /api/permissoes/colaboradores` (filtra
  out membros, volutarios, cadastros pendentes via mem_cadastros_pendentes)
- Busca por nome/email + filtro por cargo
- Click em "Editar" abre Dialog com 3 secoes:
  1. **Cargo** · Select que dispara `PUT /usuario/:id/cargo` no change
  2. **Areas** · chips toggle (clicaveis), salva com botao explicito via
     `PUT /usuario/:id/areas` (multi)
  3. **Overrides** · lista com nivel + modificadores + motivo + expira_em
     + botao remover (`DELETE /usuario/:id/modulo/:moduloId`). Form pra
     criar novo override via `PUT /usuario/:id/modulo` (envia
     nivel_leitura + nivel_escrita iguais · UI futura pode separar)

Acesso restrito a `isAdmin` · entrada no menu Administrativo >
Configuracoes.

### NPS pos-conclusao 2026-05-19 · ataque ao gap dos 11 ADM-*-Q
A UI de avaliacao NPS pos-conclusao ja existia em `Solicitacoes.jsx`
(componente `NpsBlock` dentro do `DetailDialog`), mas era descoberta
passiva · solicitante so via se abrisse o modal de detalhe.

Mudancas em 2026-05-19:
- **Card destacado** na listagem (border-l-4 amber + badge "⭐ Avalie")
  quando solicitacao tem `status='concluido'`, `solicitante_id=user`,
  `nps_nota IS NULL`. So aparece pro solicitante · responsaveis veem
  o Kanban normal.
- **Notificacao especial** quando admin marca concluido · titulo
  "Avalie: <titulo>" + mensagem chamando pra avaliar. Tipo
  `solicitacao_avaliar` (era `solicitacao_status`).
- **Cron diario** em `notificacaoGenerator.js` ·
  `gerarNotificacoesSolicitacoes()` re-lembra solicitantes com
  solicitacao concluida ha >=24h, <=14d, sem `nps_nota`. ChaveDedup
  unico por solicitacao · so 1 lembrete, depois conta com o badge.

Destrava os **11 KPIs ADM-*-Q** (Gestao + Criativo NPS) que dependiam de
`nps_nota` em `solicitacoes` (formula `agg_solicitacoes_kpi` linha 235
de `20260512140000_kpis_adm_operacionais.sql` faz
`avg(nps_nota) FROM vw_solicitacoes_sla`). Trigger SQL
`tg_solicitacoes_recalc_kpis` recalcula automaticamente no UPDATE.

---


## Modulo Devocionais (Matheus · novo · 2026-05-19)

Matheus esta iniciando o modulo de Devocionais. Marcos pesquisou alternativas
com Claude antes da escolha e bateu o martelo em **API.Bible + logica
propria no CBRio**. Toda a pesquisa esta consolidada aqui pra Matheus pegar
sem refazer o caminho.

### Contexto da decisao (NAO refazer essa pesquisa)

**1. Por que NAO usar YouVersion como backend de dados**
- API publica do YouVersion = so conteudo biblico (`X-YVP-App-Key`) + OAuth
  login que retorna **apenas perfil**, nao progresso de plano
- Libs github (tushortz/Glowstudent) com `plan_progress()`/`plan_completions()`
  sao **scraping nao-oficial · violam ToS · frageis**
- **YouVersion Connect** (dashboard de igrejas): so agregado, delay de 3 dias,
  sem API, sem export, sem per-member. Nao da pra cruzar com `profiles.id`
- Outros apps (Glorify, Lectio 365, Pray.com, Olive Tree, Logos, Bible.is):
  nenhum expoe progresso por usuario a terceiros
- Conclusao: gap #3 da jornada (devocional) precisa de modulo proprio

**2. Por que API.Bible foi escolhida**
- Desacopla "conteudo biblico" (commodity, API.Bible resolve com licenca
  oficial DBL) de "jornada + engajamento" (diferencial CBRio)
- Login + dado no CBRio · leitura in-app puxando versos da API.Bible
- Marcos JA tem conta API.Bible (Matheus tambem) · app key em
  `API_BIBLE_KEY` no env

**3. Traducoes selecionadas (Starter plan = 3 licenciadas + open access)**
- **ARA, NAA, NTLH** (todas SBB, entram via DBL · cabem nas 3 slots Starter)
- **NVT** fica como roadmap pra upgrade Pro (Tyndale/Mundo Cristao,
  disponibilidade incerta no Starter)
- ~~NVI~~ descartada (licenca restrita)
- **Default sugerida: NAA** (linguagem contemporanea + fidelidade)

**4. Rate limits**
- Starter: 5k req/dia · Pro: 150k req/mes
- Estimativa CBRio (1000 pessoas × 1 passagem/dia × cache 30d) ≈ 330 req/dia
  · folga grande
- Logica de monitoring obrigatoria pra detectar quando virar Pro (Marcos
  ja autorizou pagar upgrade quando justificar)

### Arquitetura definida

| Camada | Decisao |
|---|---|
| Conteudo biblico | apenas `referencia_biblica` no banco · texto e FETCH via API.Bible |
| Devocional (intro/reflexao/pergunta) | markdown no banco em `devocionais_dias` |
| Cache | `devocionais_passagem_cache` (TTL 30d · texto biblico nao muda) + SW + IndexedDB |
| Provider | abstracao `BibleProvider` (services/) pra trocar fonte sem rewrite |
| Auth do membro | Supabase Auth padrao (localStorage persiste · `persistSession: true` explicito) |
| Webapp mobile | `/devocionais/*` fora do AppShell (estilo `/public/*` existente) |
| Admin | nova aba em `Cuidados.tsx` · gate `canCuidados` |
| Recomendacao | keya em "Investir Tempo com Deus" (1 dos 5 valores da jornada calculada em `/api/jornada/membros`) |

### Banco · tabelas a criar

```
devocionais_planos (id, titulo, descricao, dias_total, ativo,
                    created_by profiles.id UUID, ordem)

devocionais_dias (plano_id, dia_numero, titulo, referencia_biblica,
                  intro_markdown, reflexao_markdown, pergunta, audio_url?)

devocionais_checkin (id, user_id profiles.id, plano_id, dia_numero,
                     completed_at, fonte enum 'webapp|admin|import',
                     observacao?)
  UNIQUE (user_id, plano_id, dia_numero)

devocionais_traducoes (id, codigo 'ntlh|naa|ara|nvt', nome,
                       bible_id_externo, ativa bool, ordem,
                       plano_minimo 'starter|pro')
  seed: ARA/NAA/NTLH ativa=true · NVT ativa=false plano_minimo=pro

devocionais_passagem_cache (referencia, traducao_id, conteudo_jsonb,
                            html, copyright, fetched_at, expires_at)
  UNIQUE (referencia, traducao_id) · TTL 30 dias

devocionais_uso_api (data, traducao_id, requests, cache_hits, errors)
  agregacao diaria pro dashboard de monitoring

vw_devocional_status_membro (ultimo_checkin, streak, plano_em_curso,
                              dias_ultimos_30)
```

RLS: membro le/escreve so os proprios `devocionais_checkin` · admin
(`canCuidados`) le todos.

Atualizar calculo de "Investir Tempo com Deus" em `/api/jornada/membros`
pra ler `vw_devocional_status_membro` (regra: >=X check-ins/30d · X a
definir com Marcos).

### Backend · endpoints novos

```
GET  /api/devocionais/planos                         · lista ativos
GET  /api/devocionais/planos/:id/dias                · conteudo do plano
GET  /api/devocionais/me/recomendado                 · plano sugerido pela jornada
GET  /api/devocionais/me/historico                   · checkins do proprio user
POST /api/devocionais/checkin                        · {plano_id, dia_numero}
GET  /api/devocionais/traducoes                      · so ativa=true
GET  /api/devocionais/passagem?ref=Sl+1&traducao=ntlh
     1. lookup cache (TTL 30d)
     2. miss · chama API.Bible · grava cache · incrementa uso_api
     3. retorna {referencia, traducao, html, copyright}

GET  /api/admin/devocionais/membros                  · gated canCuidados
GET  /api/admin/devocionais/uso-api                  · agregacao 30d + projecao
POST|PUT|DELETE /api/admin/devocionais/planos        · CRUD planos/dias
```

**Alert silencioso de upgrade**: se `requests_dia > 0.7 * 5000` por 3
dias seguidos, criar notificacao admin pro Marcos (NAO quebrar · so
avisa).

**Graceful degradation**: se API.Bible cair · servir cache mesmo expirado
+ banner "leitura offline".

### Logica de recomendacao

```
recomendarPlano(userId):
  - novo (<90d desde cui_jornada180.data_encontro OU sem trilha)
    → plano "Primeiros Passos"
  - sem checkins ultimos 14d
    → plano "Reiniciando o Habito" (7 dias)
  - ativo
    → continua plano em curso ou sugere proximo da trilha
```

Documentar em `docs/modulo-devocionais.md` (espelho do
`docs/modulo-grupos-supervisao.md`).

### Webapp mobile (`/devocionais/*`)

- Rota fora do AppShell em `App.tsx` (estilo `/public/cadastro-membresia`)
- `manifest-devocionais.json` clonando padrao `manifest-membresia.json`
  (instalavel iOS/Android)
- Service worker · cache do dia atual offline (network-first + fallback)
- IndexedDB · pre-fetch passagem do dia + proximos 2 dias do plano em
  curso (economiza API hits + funciona offline)
- Telas:
  - `/devocionais/login` · magic link OU OAuth (Google/Microsoft ja
    configurados)
  - `/devocionais` (home) · card "Recomendado pra voce" + lista
    "Explorar outros planos" + "Continuar lendo"
  - `/devocionais/plano/:id/dia/:n` · leitor (intro → **passagem HTML
    da API.Bible** → reflexao → pergunta) + botao "Fiz hoje" → POST
    checkin + feedback de streak
  - `/devocionais/historico` · streak + calendario
- **Seletor de traducao** sutil no header do leitor (chip "NAA ▾")
- Preferencia salva em `profiles.devocional_traducao_preferida` (FK pra
  `devocionais_traducoes`)
- Rodape com **copyright dinamico** vindo da API.Bible (exigencia SBB/Tyndale)
- Bottom nav fixa (Home / Historico / Perfil)
- Garantir `persistSession: true, autoRefreshToken: true` no client
  Supabase da webapp · refresh token Supabase = 1 ano (Marcos quer "nao
  ter que ficar logando sempre")
- **iOS PWA quirk**: testar localStorage em standalone mode (Safari tem
  particularidades)

### Admin · nova aba em `Cuidados.tsx`

Adicionar `<TabsTrigger>` "Devocionais" no padrao shadcn ja existente
(arquivo: `src/pages/ministerial/Cuidados.tsx` · gate
`canCuidados`).

Subaba **"Membros"**:
- tabela: nome, ultimo checkin, streak, plano atual, status
  (ativo/inativo/sem plano)
- filtros: por area (usar `usuario_areas`, NAO `profile.area` ·
  profile.area = SETOR, nao area)
- responsaveis via UUID (`profiles.id`), nunca texto livre
- drawer de detalhe do membro com historico de checkins

Subaba **"Planos"**:
- CRUD planos e dias
- editor markdown pra intro/reflexao/pergunta
- campo `referencia_biblica` valida formato canonico ("Sl 1",
  "Jo 3.16-21")

Subaba **"KPI"**:
- adesao semanal · streak medio · % ativos · reaproveitar componentes
  KPI existentes

Subaba **"Uso da API"**:
- grafico linha requests/dia ultimos 30d com linha de limite (5k)
- card cache hit rate (%) · quanto melhor, mais longe do upgrade
- card projecao mensal vs. Pro (150k req/mes)
- botao "Marcar upgrade Pro feito" · libera NVT (atualiza flag
  `plano_minimo`)

Subaba **"Traducoes"**:
- toggle on/off · reordenar · marcar default

### Decisoes ainda pendentes (Matheus precisa fechar com Marcos)

1. **Conteudo devocional** · quem escreve os planos "Primeiros Passos" e
   "Reiniciando o Habito"? (Marcos ou pastoral?)
2. **Plano unico oficial** ou multiplos paralelos? (afeta UI da home)
3. **Traducao default** · NAA, NTLH ou ARA? (recomendacao da pesquisa: NAA)
4. **Push/lembrete diario** · PWA push, WhatsApp via N8N, ou nada na v1?
5. **Regra exata de "Investir Tempo com Deus"** · quantos checkins/30d
   contam como ativo? (3? 5? 10?)
6. **Licenca API.Bible Starter** · formalmente "non-commercial use" ·
   confirmar com API.Bible que uso interno da igreja CBRio cobre

### Fechamento

- Testes Playwright · fluxo membro login → recomendado → checkin → admin ve
- Branch sugerida: `matheus-devocionais`
- Quando mergear · atualizar `[[project_jornada_gaps]]` removendo o gap #3
- Atualizar CLAUDE.md a cada commit (feedback persistente do Marcos)

---


## Deploy autônomo (fluxo padrão)

Para qualquer feature/fix/refactor solicitado pelo usuário, Claude está
autorizado a executar o ciclo completo **até produção** sem perguntar a cada
etapa:

1. Implementar em uma branch de feature (`claude/<descrição>`).
2. Commit com mensagem descritiva.
3. `git push -u origin <branch>`.
4. Abrir PR de `<branch>` → `main` com descrição detalhada e test plan.
5. Aguardar o CI do Vercel (preview) ficar verde.
6. **Mergear o PR na `main`** — isso dispara o deploy de produção automático
   do Vercel.
7. Informar ao usuário a URL de produção (quando disponível) e o resumo
   do que foi entregue.

A autorização acima cobre features do dia a dia. Use um único comentário
resumo ao final; não peça confirmação entre etapas.

## Quando **parar e perguntar** antes de mergear

Mesmo com autorização durável, pare e peça confirmação explícita se a
mudança incluir qualquer destes itens:

- **Schema destrutivo no Supabase**: `DROP TABLE`, `DROP COLUMN`, mudanças
  incompatíveis em tipos de coluna, remoção de policies RLS em tabelas
  com dados.
- **Mudança em autenticação/autorização**: alterações em
  `backend/middleware/auth.js`, no fluxo de login, ou em policies RLS
  que ampliam acesso.
- **Remoção de módulos inteiros** ou rotas já usadas em produção.
- **Novas variáveis de ambiente obrigatórias** que o usuário precisa
  configurar no Vercel antes do merge — informe e aguarde confirmação
  de que foi adicionada.
- **Integrações com terceiros pagos** (APIs novas, serviços cobrados
  por uso) — confirme custo e credenciais antes.

## Migrations do Supabase

Sempre que uma PR incluir arquivos em `supabase/migrations/`:

1. Avisar claramente o usuário **antes do merge** que há migration nova.
2. **Colar o SQL completo da migration direto na conversa** (dentro de um
   bloco ```sql) para que o usuário possa copiar e rodar no SQL Editor
   sem precisar abrir o arquivo. NÃO basta apontar o caminho do arquivo —
   sempre enviar o conteúdo na mensagem.
3. Aguardar confirmação do usuário de que a migration foi aplicada no
   Supabase de produção antes de mergear — senão o backend em prod
   quebra ao chamar a tabela/coluna.

A única exceção é quando a mudança é puramente idempotente e
backwards-compatible (ex.: `ADD COLUMN IF NOT EXISTS` opcional) e o
código tolera ausência da coluna.

## Convenções do repositório

### Design do sistema (obrigatório preservar)

- Paleta primária: `#00B39D` (usar `C.primary` / `C.primaryBg`).
- Variáveis CSS: `--cbrio-bg`, `--cbrio-card`, `--cbrio-text`,
  `--cbrio-text2`, `--cbrio-text3`, `--cbrio-border`, `--cbrio-input-bg`,
  `--cbrio-modal-bg`, `--cbrio-overlay`, `--cbrio-table-header`.
- Componentes shadcn/ui já instalados — reusar antes de criar novos.
- Modal dentro de modal: z-index 1100 (maior que Dialog padrão 1000).
- Páginas públicas (sem login) renderizam **fora** do `AppShell` e
  **fora** do `ProtectedRoute` em `src/App.tsx`.

### Backend

- Cada arquivo em `backend/routes/` aplica `router.use(authenticate)`
  no topo — rotas públicas precisam ir em um arquivo separado
  (ex.: `publicMembresia.js` montado em `/api/public/...`).
- Rate limit global configurado em `backend/server.js`. Endpoints
  públicos devem adicionar rate limit dedicado mais restritivo.
- Usar `supabase` de `backend/utils/supabase.js` (service role, bypass
  de RLS) — os guards de permissão vêm dos middlewares.

### Frontend

- Rotas no `src/App.tsx` usam `lazyWithRetry` para code-splitting com
  retry automático em chunk load errors.
- API client em `src/api.js` — um `export const <modulo>` por módulo,
  com subnamespaces para sub-recursos.
- Nunca adicionar emoji em código a menos que o usuário peça.
- Evitar criar arquivos `.md` novos a menos que o usuário peça
  explicitamente (exceto este `CLAUDE.md`).

## Notificações

Todo módulo novo ou existente que gere eventos relevantes (aprovações
pendentes, vencimentos, alertas) **deve** incluir integração com o
sistema de notificações:

1. **Notificação imediata**: chamar `notificar()` de
   `backend/services/notificar.js` no momento em que o evento ocorre
   (ex.: novo cadastro, novo pedido, documento vencido).
2. **Notificação periódica**: adicionar função em
   `backend/services/notificacaoGenerator.js` para verificar itens
   pendentes/atrasados e gerar alertas automaticamente (chamado pelo
   cron diário).
3. **Regras de destinatário**: registrar o módulo no array `MODULOS` de
   `src/pages/admin/NotificacaoRegras.jsx` para que administradores
   possam configurar quem recebe as notificações daquele módulo.

Se nenhuma regra for configurada, o fallback envia para todos os
usuários com role `admin` ou `diretor`.

## Commits e PRs

- Mensagem de commit: prefixo `feat(<modulo>):`, `fix(<modulo>):`,
  `refactor(<modulo>):`, `chore:`, etc.
- Títulos de PR curtos (< 70 caracteres). Detalhes no corpo.
- PRs grandes podem agrupar múltiplos commits relacionados; PRs
  pequenos direto em `main` são aceitáveis via o fluxo padrão.

## O que Claude **não faz**

- Push direto em `main` (sempre via PR + merge).
- `git push --force` ou `git reset --hard` em branches remotas sem
  pedido explícito.
- Mergear PRs de outros contribuintes (só os próprios).
- Fechar issues/PRs alheios.
- Rodar comandos destrutivos no sistema de arquivos do usuário.
- Usar `gh` CLI (usar as ferramentas GitHub MCP).

## Deploy na Vercel — cuidados

- `vercel.json` usa `includeFiles` com exclusão de `node_modules` para
  não estourar o limite de 250 MB da serverless function.
- **Nunca adicionar dependências pesadas** (binários, browsers, etc.) no
  `backend/package.json` sem necessidade comprovada — cada MB conta.
- O pool de conexões Postgres (`backend/utils/supabase.js`) usa `max: 1`
  em ambiente Vercel (serverless) para não esgotar o pooler do Supabase.
- URL do webhook do Cerebro usa `FRONTEND_URL` / `VERCEL_URL` — não
  hardcodar domínios.
- Variáveis de ambiente obrigatórias na Vercel: `SUPABASE_URL`,
  `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL`, `ANTHROPIC_API_KEY`,
  `CRON_SECRET`, `FRONTEND_URL`.

## KPIs de Eventos — Plano aprovado (implementar em 3 PRs)

Sistema de score de performance operacional dos eventos com ciclo
criativo. Arquitetura de rollup em 4 niveis:

```
Nivel 4: Institucional (cross-eventos) → media dos KPIs
Nivel 3: Evento → media ponderada dos KPIs das areas
Nivel 2: Area → media ponderada dos scores dos documentos
Nivel 1: Documento → score 0-100 (4 criterios)
```

### Regras de scoring (Nivel 1)
- Entrega no prazo: 40pts (`delivered_at <= deadline`)
- Aprovado: 30pts (`approved_by IS NOT NULL`)
- Qualidade OK: 20pts (`quality_rating = 'ok'`)
- Documento anexado: 10pts (`file_name IS NOT NULL`)
- Documentos criticos (`momento_chave = true`) pesam **2x** na area

### Categorias
- **Series**: poucas mudancas entre edicoes (menor complexidade)
- **Eventos**: mais mudancas (maior complexidade)
- So eventos com **ciclo criativo ativo** entram no calculo

### Pesos de area (configuraveis por categoria)
Producao: 3 | Marketing: 2 | Logistica: 2 | Financeiro: 2 |
Cozinha/Limpeza/Manutencao: 1

### PRs planejadas
1. **Schema + Templates** — tabelas `event_document_templates` e
   `event_documents`, templates iniciais Serie/Evento
2. **Backend + Calculo** — endpoints de entrega, aprovacao, score,
   KPIs por nivel, filtro serie/evento
3. **Dashboard na Home de Eventos** — KPI cards, filtro
   Series/Eventos/Todos, rankings, evolucao temporal, KPI no detalhe

### Decisoes tomadas
- Escala 0-100 (nao A/B/C/D)
- Aprovador = responsavel da area
- Auto-aprovar apos X dias se ninguem reprovou (evitar gargalo)
- Dashboard na HOME de `/eventos` (nao dentro de cada evento)

## Cérebro CBRio — Base de Conhecimento

O Cérebro é o sistema automático que transforma documentos do
SharePoint em notas Obsidian contextualizadas. **Qualquer alteração
neste módulo deve respeitar a arquitetura abaixo.**

### Fluxo de dados

1. **Upload no SharePoint** → bibliotecas monitoradas (Gestão,
   Criativo, Ministerial, etc.)
2. **Detecção** → webhook do Microsoft Graph ou cron (`/api/cerebro/processar`)
   detecta arquivos novos via Delta Query
3. **Fila** → arquivo entra na tabela `cerebro_fila` com status
   `pendente`
4. **Processamento** → `backend/services/cerebroProcessor.js` baixa o
   arquivo, extrai texto via `textExtractor.js`, envia para
   **Claude Haiku** classificar e resumir (JSON estruturado)
5. **Nota gerada** → arquivo `.md` com frontmatter YAML completo é
   salvo na biblioteca "Cerebro CBRio" no SharePoint
6. **Obsidian** → qualquer membro com OneDrive sincronizado vê as
   notas aparecerem automaticamente no vault local

### Arquitetura dos arquivos

```
backend/
  routes/cerebro.js          — Webhook Graph + cron + subscriptions
  services/cerebroProcessor.js — Coração: baixa, classifica, gera nota
  services/textExtractor.js    — Extrai texto de PDF/DOCX/XLSX/PPTX/imagens
  services/storageService.js   — getGraphToken, downloadFile
```

### Regras do agente processador

- **Modelo**: usar `claude-haiku-4-5-20251001` (barato e rápido)
- **System prompt**: pedir JSON puro com campos `resumo`,
  `tipo_documento`, `tags`, `dados_chave`, `notas_relacionadas`,
  `area_vault`
- **Tags padrão**: `#membro`, `#evento`, `#projeto`, `#financeiro`,
  `#ministerio`, `#ata`, `#decisao`, `#pendente`, `#concluido`,
  `#marketing`, `#producao`, `#patrimonio`, `#administrativo`
- **Frontmatter YAML** obrigatório em toda nota gerada:
  ```yaml
  titulo, tipo, data_criacao, ultima_atualizacao,
  biblioteca_origem, pasta_origem, arquivo_original,
  tamanho, status, tags, processado_por: cerebro-cbrio
  ```
- **Nomenclatura** de notas: minúsculas, hífens, sem acentos,
  max 80 chars (ex: `relatorio-financeiro-marco-2026.md`)
- **Wikilinks**: notas relacionadas usam `[[nome-da-nota]]`

### Vault Obsidian — estrutura

```
cerebro-cbrio/
├── 01-crm-pessoas/    ← Membros, visitantes, líderes
├── 02-eventos/        ← Cultos, conferências, retiros
├── 03-projetos/       ← Projetos e iniciativas
├── 04-financas/       ← Receitas, despesas, relatórios
├── 05-comunicacao/    ← Campanhas, identidade visual
├── 06-ministerios/    ← Células, louvor, infantil, voluntários
├── 07-patrimonio/     ← Espaços, equipamentos
├── 08-administrativo/ ← Atas, docs legais, processos
├── 09-ensino-discipulado/ ← Cursos, trilhas, materiais
├── _dados-brutos/     ← Importados sem classificação
├── _relatorios-ia/    ← Relatórios gerados pelo Claude
└── _templates/        ← Templates reutilizáveis
```

### Mapa biblioteca → pasta vault

| SharePoint         | Vault                  |
|--------------------|------------------------|
| Gestão             | gestao                 |
| Criativo           | criativo               |
| Ministerial        | ministerial            |
| CRM e Pessoas      | crm-pessoas            |
| Eventos            | 02-eventos             |
| Projetos           | 03-projetos            |
| Financas           | 04-financas            |
| Comunicacao        | 05-comunicacao         |
| Ministerios        | 06-ministerios         |
| Patrimonio         | 07-patrimonio          |
| Administrativo     | 08-administrativo      |
| Ensino             | 09-ensino-discipulado  |

### Tabelas Supabase do Cérebro

- `cerebro_fila` — fila de processamento (status: pendente →
  processando → concluido/erro/ignorado)
- `cerebro_config` — configurações (bibliotecas monitoradas,
  extensões permitidas, delta links, limite de tokens)

### AGENTE-REGRAS.md — fonte única de verdade

As regras completas do agente vivem no **SharePoint** dentro do
vault "Cerebro CBRio", no arquivo `AGENTE-REGRAS.md`. O processador
(`cerebroProcessor.js`) baixa esse arquivo automaticamente antes de
cada execução e injeta as regras no system prompt do Haiku.

**NÃO manter cópia do AGENTE-REGRAS.md no repositório Git.** Se
precisar alterar regras, editar direto no SharePoint — as mudanças
valem imediatamente na próxima execução do cron.

Regras críticas resumidas (detalhes no SharePoint):
- 3 camadas: Supabase (operacional) → SharePoint (lastro) → Obsidian (inteligência derivada)
- Nomes: kebab-case, max 25 chars, semânticos, temporais com prefixo `YYYY-MM-DD-`
- Tags hierárquicas obrigatórias: `tipo/X`, `area/X`, `status/X`, `ano/X`
- Classificar por CONTEÚDO, não por pasta de origem
- Pastas de alto volume usam hierarquia `YYYY/MM/`
- MOCs (Map of Content) por ano em áreas de alto volume
- Resumos PROFUNDOS (min 40 linhas projetos, 35 eventos, 25 financeiro)
- Wikilinks APENAS para arquivos reais do vault
- Fotos: descrição visual via Haiku + metadados no frontmatter

### O que NÃO fazer

- **Nunca duplicar** o AGENTE-REGRAS.md no repo — fonte é o SharePoint
- **Nunca alterar o frontmatter** das notas sem manter todos os
  campos obrigatórios
- **Nunca salvar nota sem resumo** — se o Claude não conseguir
  gerar resumo, marcar como `erro` na fila
- **Nunca processar arquivos temporários** (começam com `~` ou `.`)
- **Nunca exceder 10 arquivos por execução do cron** — controlar
  custo de tokens
- **Nunca usar modelo caro** para classificação — Haiku é suficiente
- **Nunca hardcodar o Site ID do SharePoint** — usar constante
  `HUB_SITE_ID` em `cerebroProcessor.js`
- **Nunca gerar resumos rasos** de 2-3 linhas — inutiliza o Cérebro

### Variáveis de ambiente necessárias

```
AZURE_CLIENT_ID, AZURE_CLIENT_SECRET, AZURE_TENANT_ID
ANTHROPIC_API_KEY
CRON_SECRET
```

## Eventos — Arquitetura de KPIs (a implementar)

Arquitetura aprovada em discussão (15/04/2026) para metrificação do módulo
de Eventos. **NÃO implementada ainda — aguardando sinal do usuário.**

### Princípio central (rollup hierárquico)

Cada documento entregue em cada fase alimenta o KPI da área; a soma dos
KPIs das áreas forma o KPI do evento; a agregação cross-eventos forma o
KPI institucional. **A unidade atômica de medição é o documento.**

```
Nível 4: Institucional (cross-eventos)   ← média dos eventos
Nível 3: Evento                          ← média ponderada das áreas
Nível 2: Área (dentro do evento)         ← média ponderada dos docs
Nível 1: Documento (score 0-100)         ← unidade atômica
```

### Nível 1 — Score do documento (0-100)

| Critério | Peso | Fonte |
|----------|------|-------|
| Entrega no prazo | 40pts | `delivered_at <= deadline_at` |
| Aprovado | 30pts | `approved_by IS NOT NULL` |
| Qualidade OK | 20pts | `quality_rating = 'ok'` |
| Documento anexado | 10pts | `file_name IS NOT NULL` |

Documentos críticos (`is_critical = true`) pesam 2x na área.

### Nível 2 — KPI da área

`KPI_AREA = Σ(score_doc × peso_doc) / Σ(peso_doc)` dentro de um evento.

### Nível 3 — KPI do evento

`KPI_EVENTO = Σ(KPI_AREA × peso_area) / Σ(peso_area)`

Pesos sugeridos de área (configuráveis por categoria de evento via
`event_area_weights`):
- Produção: 3
- Marketing, Logística, Financeiro: 2
- Cozinha, Limpeza, Manutenção: 1

### Nível 4 — KPI institucional

Dashboard cross-eventos: média no período, ranking de áreas cross-eventos,
ranking de responsáveis, evolução temporal.

### Mudanças de schema necessárias

```sql
-- 1. Template de documentos esperados por fase+área+categoria
CREATE TABLE event_document_templates (
  id uuid PRIMARY KEY,
  category_id uuid REFERENCES event_categories(id),
  phase_name text NOT NULL,
  area text NOT NULL,
  document_name text NOT NULL,
  is_critical boolean DEFAULT false,
  is_required boolean DEFAULT true,
  expected_format text,
  description text,
  sort_order int DEFAULT 0
);

-- 2. Campos de scoring em card_completions
ALTER TABLE card_completions
  ADD COLUMN delivered_at timestamptz,
  ADD COLUMN deadline_at timestamptz,
  ADD COLUMN approved_by uuid REFERENCES auth.users(id),
  ADD COLUMN approved_at timestamptz,
  ADD COLUMN quality_rating text CHECK (quality_rating IN ('ok','incompleto','reprovado')),
  ADD COLUMN score int,
  ADD COLUMN weight numeric DEFAULT 1;

-- 3. Pesos de área por categoria de evento
CREATE TABLE event_area_weights (
  category_id uuid REFERENCES event_categories(id),
  area text NOT NULL,
  weight numeric DEFAULT 1,
  PRIMARY KEY (category_id, area)
);

-- 4. Views de agregação
CREATE VIEW vw_event_area_kpi AS
  SELECT event_id, area,
    SUM(score * weight) / NULLIF(SUM(weight), 0) AS kpi_area,
    COUNT(*) AS total_docs,
    SUM(CASE WHEN score >= 70 THEN 1 ELSE 0 END) AS docs_ok,
    SUM(CASE WHEN delivered_at > deadline_at THEN 1 ELSE 0 END) AS docs_atrasados
  FROM card_completions
  GROUP BY event_id, area;

CREATE VIEW vw_event_kpi AS
  SELECT a.event_id,
    SUM(a.kpi_area * COALESCE(w.weight, 1)) /
      NULLIF(SUM(COALESCE(w.weight, 1)), 0) AS kpi_evento
  FROM vw_event_area_kpi a
  LEFT JOIN events e ON e.id = a.event_id
  LEFT JOIN event_area_weights w
    ON w.category_id = e.category_id AND w.area = a.area
  GROUP BY a.event_id;
```

### Fluxo operacional

1. Admin configura templates de documento por categoria de evento
2. Ao criar evento, sistema gera cards automaticamente dos templates
3. Área entrega → anexa arquivo + informa qualidade
4. Líder aprova → `approved_by` + `approved_at` preenchidos
5. Score recalculado automaticamente (trigger ou backend)
6. Dashboard reflete em tempo real via views

### Dashboard (3 abas + drill-down)

```
/eventos/kpis
├─ Institucional   → KPI médio, ranking cross-eventos
├─ Por Evento      → lista de eventos com KPI_evento
│   └─ Detalhe     → cards de áreas → lista de docs + score
└─ Por Área        → performance cross-eventos de cada área
```

### Perguntas pendentes antes de implementar

1. Escala de score: 0-100 ou A/B/C/D/F? (sugerido: 0-100)
2. Pesos do score: manter 40/30/20/10 ou ajustar?
3. Templates iniciais: genéricos ou por categoria (Culto/Conferência/Retiro)?
4. Aprovador: sempre responsável da área ou papel "supervisor" separado?
5. Escopo PR: tudo junto ou dividir (schema → dashboard)?

### Lacunas adicionais identificadas

- `event_expenses` não linka com `cycle_phase_tasks` (despesas isoladas)
- Voluntariado/escalas sem FK com eventos
- Patrimônio/logística sem integração com eventos
- `reopened_count` ausente em cards (para medir rework)

## Responsáveis por área (ciclo criativo)

A tabela `area_responsaveis` define quem é o líder padrão de cada área.
Ao ativar um ciclo criativo ou propagar um novo template, o sistema
preenche `responsavel_nome` automaticamente com o valor dessa tabela.

| Área | Responsável |
|------|-------------|
| cozinha | Jéssica Salviano |
| limpeza | Jéssica Salviano |
| manutencao | Amaury |
| compras | Amaury |
| producao | Pedro Fernandes |
| marketing | Pedro Paiva |
| financeiro | Yago Torres |
| adm | Marcos Paulo |
| integracao | Alda Lorena |

Para alterar: `PUT /api/cycles/area-responsaveis/:area` com
`{ "responsavel_nome": "Novo Nome" }`. Os eventos futuros usarão
o novo responsável; tarefas já criadas não são afetadas
retroativamente.

### Cultos · varredura fina + PainelArea v3 (2026-05-21)
Apos varredura nos modulos kids/ami/bridge/online, batemos 3 PRs:

**PR de hotfix + UX (esta)** · `claude/cultos-hotfix-lideres`:
- Migration `20260521120000_cultos_hotfix_lideres.sql`:
  - AMI-05 e AMI-06 com `fonte_auto = cultos.bridge_*` (cross-wiring de
    migration antiga) · zeradas pra null. AMI-01 ja cobre frequencia.
  - Lillian Xavier criada em rh_funcionarios (faltava cadastro RH)
  - `lider_funcionario_id` preenchido em TODOS os KPIs ativos das 4 areas:
    - kids   · Mariane Gaia      (323db85c-a46f...)
    - ami    · Arthur Cecconi    (92186f0c-85e8...)
    - bridge · Lillian Xavier    (gerado · 909b97ad-...)
    - online · Renata Martins    (b28e8b30-f7f2...)
- Backend `painelArea.js`:
  - Aceita `?periodo=30d|90d|180d|365d` ou `?desde&ate` (default 180d)
  - Nova seção `cultos_recentes` + `totais_cultos` · agrega de
    `vw_culto_stats` filtrada por area (logica espelho do kpiAutoCollector)
  - Resposta inclui `periodo: { desde, ate }`
- Frontend `PainelArea.jsx` v3:
  - Nova aba "Cultos" (tab default quando ha cultos) com cards de totais
    + lista de cultos do periodo
  - Filtro de periodo (30/90/180/365d) no header acima das tabs
  - Score com label maior + diagnostico em destaque
  - Breadcrumb "Painel CBRio > [Area]" com seta de volta
  - Sparkline com hover tooltip
  - Filtros "Sem valor" so aparecem quando count > 0
  - Ordem fixa dos valores da Jornada (seguir/conectar/investir/servir/gen)
  - Aba "Dados" agora explica que cultos vivem em outra aba

**Decisao arquitetural** (Marcos 2026-05-21): aba Cultos puxa direto da
`vw_culto_stats` filtrada por area, porque dados de culto (frequencia/
decisoes/batismos) vivem em `cultos.*` e nao em `dados_brutos`. A aba
Dados bruta continua existindo pra outros tipos (voluntarios, grupos,
devocionais por area) quando o onboarding evoluir.

**Bridge separado de AMI**: AMI-05/06 nao puxam mais cultos.bridge_*.
Bridge tem KPIs proprios (BRG-01, BRG-02 etc com fonte_auto cultos.bridge_*).
Marcos: "Bridge eh diferente de AMI, separe isso · os dados sao diferentes".

**PR KPIs semanais → YoY (2026-05-21)** · `claude/kpis-semanais-yoy`:
- Marcos: "todos os KPIs comparando com mesma semana do ano anterior · igreja
  tem eventos/liturgias mensais que fazem variar a frequencia". Aplicar so
  nos semanais por enquanto · mensais/semestrais ficam intocados.
- Migration `20260521140000_kpi_periodo_anterior_yoy_semanal.sql` · estende
  funcao SQL `_kpi_periodo_anterior` pra suportar `ano_anterior` em
  semanal/trimestral/semestral (mensal ja suportava). W53-2026 → NULL se
  ano anterior tem 52 semanas (edge case ISO).
- Migration `20260521150000_kpis_semanais_yoy.sql` · UPDATE 22 KPIs (todos
  delta_pct/delta_abs com periodicidade='semanal') · comparacao
  `semana_anterior|ciclo_anterior` → `ano_anterior`. Categorias:
  frequencia (5), conversoes (6), frequencia NEXT (5), NPS NEXT (5),
  YouTube comentarios (1).
- Mantido: 6 KPIs `evento_anterior` (batismos vs ultimo evento) ·
  faz sentido vs evento, nao ano. Mensais e semestrais nao alterados.
- Pos-migration, bulk recalc rodado · 11/22 com valor (resto sem dado
  em 2025 · Bridge novo, NEXT recente, YouTube comments etc). Marcos
  ja sabia · "alguns vao ficar sem dado pois nem todos tinhamos no ano
  passado".
- Triggers SQL (`tg_cultos_recalc_kpis`, `tg_dados_brutos_*`) ja apontam
  pra funcao atualizada · proximas semanas atualizam automatico.
- Frontend `KpiEditorModal.jsx` ja tinha 'ano_anterior' como opcao no
  dropdown · sem mudancas. Labels genericos "vs periodo anterior"
  funcionam pra qualquer comparacao.

Exemplos reais pos-migration:
- KIDS-01: -7.02% (W20-2026: 225 pessoas · W20-2025: 242)
- SED-21: +13.63% (1667 vs 1467)
- SED-18 decisoes: -78.57% (6 vs 28)
- ONL-13 decisoes online: -100% (0 vs 10)

**PR convertidos em "Seguir"** · `claude/cultos-convertidos-em-seguir`:
- Migration `20260521130000_convertidos_atendidos_em_seguir.sql`
- Marcos (2026-05-21): "conversoes nao esta em investir tempo com Deus,
  verifica isso". Apos varredura, 5 KPIs ("% solicitacoes de novos
  convertidos atendidos" · AMI-21, BRG-19, KIDS-19, ONL-04, SED-17)
  estavam em `valores=['investir']` por engano. Movido pra `['seguir']`.
- Logica: "Investir tempo com Deus" = devocional/jornada180 do cristao
  ativo. Atendimento pastoral a novo convertido = trilha de discipulado
  recem-decidido = pertence a "Seguir a Jesus".
- Demais cruzamentos validados como corretos · ver query de auditoria
  no banco se quiser refazer.

**Sobre cross-area**: confirmado por Marcos · `kpi_indicadores_taticos.area`
eh `text` singular (nao array). 9 areas distintas (4 cultos + cba + sede
+ financeiro/infraestrutura/rh). Nenhum KPI cobre 2 areas. Cruzamento
inter-area acontece via NSM (matriz Valor x Area) ou dashs agregados
(painel/mandalas, dash semanal do Matheus). Se precisar de cross-area
no futuro, e' analise · nao schema novo.

**PR NPS dos cultos** · `claude/cultos-nps-input`:
- Tipo `nps_culto` ja existia em `tipos_dado_bruto` (granularidade mensal,
  agregacao avg) e os 5 KPIs CULTO-NPS-* ja apontavam pra ele via
  formula_config.dado_tipo. Faltava o canal de input.
- Backend `painelArea.js` ganha `POST /:area/nps` (nivel >= 3) aceitando
  `{ nota: 0-10, mes?, qtd_respostas?, observacao? }` · faz UPSERT em
  `dados_brutos` (UNIQUE tipo_id+area+data+contexto). Trigger SQL existente
  recalcula o KPI automaticamente.
- Frontend `PainelArea.jsx`: botao "Registrar nota" no card NPS destacado.
  Dialog com mes (input type=month) + nota (0-10, step 0.1) + qtd
  avaliacoes (opcional) + observacao. Aparece so pra quem tem >=3 na area.
- Substitui canal definitivo quando modulo NPS rodar pesquisa pos-culto
  (formula vai espelhar agregada na mesma tipo_id='nps_culto').

**Pendente proximas PRs**:
- Drill-down decisoes (lista de pessoas no culto)
- Time da area (voluntarios ativos por area)
- Online · aba Saude + aba Dados (hoje sem)

### Cultos · rotas saem de /ministerial pra raiz (2026-05-21)
PR #576 mergeada. Marcos pediu: "tire o endpoint /ministerial coloque so /ami".
Os 4 modulos de culto agora moram na raiz:

| Antes                  | Depois    |
|------------------------|-----------|
| `/ministerial/online`  | `/online` |
| `/ministerial/kids`    | `/kids`   |
| `/ministerial/ami`     | `/ami`    |
| `/ministerial/bridge`  | `/bridge` |

Implementacao:
- `src/App.tsx` ganhou 4 rotas raiz + 4 `<Navigate>` redirects das antigas
  pra nao quebrar bookmarks
- `src/components/layout/AppShell.jsx` · menu items aponta pros novos paths
- Migration `20260521100000_rotas_cultos_raiz.sql` · UPDATE modulos.rota
  pros 4 slugs (kids/ami/bridge/online)
- PR #577 · ajusta os 4 `res.redirect` do callback OAuth YouTube
  (`backend/routes/online.js`) pra ja apontar `/online` em vez de
  `/ministerial/online` (evita double-redirect)

## Online · visao do canal YouTube (somente leitura)

Modulo `/online` mostra desempenho do canal YouTube CBRio com
inscritos, views, melhores videos do mes (por views e por engajamento) e
analise por serie de pregacao.

**Regra de negocio importante**: este modulo eh **somente leitura**. A
frequencia online dos cultos e as aceitacoes/conversoes online sao
preenchidas pela **Alda Lorena** (responsavel da Integracao) em
`/ministerial/integracao` (aba Cultos).

### Arquitetura

- Series de pregacao = playlists do YouTube. Para criar/editar serie,
  basta criar/editar playlist no YT Studio. Cron sincroniza.
- Tabelas:
  - `online_canal_snapshot` (1 linha por dia · inscritos, views totais)
  - `online_series` (espelha playlists)
  - `online_videos` (videos com statistics + serie_id + culto_id)
- View `vw_online_series_kpi` agrega totais por serie
- Cron diario 6h (`/api/online/cron/sync`) chama YouTube API e popula
  as tabelas. Custo ~40 unidades de quota/dia.
- Endpoint `POST /api/online/sync` permite refresh manual (admin/diretor)

### Variaveis de ambiente

- `YOUTUBE_API_KEY` (ja existe, usada pelo coletor de DS/DDUS) — **obrigatoria**
- `YOUTUBE_CHANNEL_ID` (opcional) — formato `UCxxxxxxxxxx`. Default
  hardcoded em `backend/services/youtubeCollector.js`
  (`DEFAULT_CHANNEL_ID = 'UCfjMVzaYlCS_VE3JuEJj2vQ'`, canal oficial CBRio).
  So setar a env se um dia o canal mudar.
- `GOOGLE_OAUTH_CLIENT_ID` / `GOOGLE_OAUTH_CLIENT_SECRET` — credenciais OAuth
  para coleta automatica via YouTube Analytics API (pico online, DS, DDUS)

### Coleta automatica (OAuth + Analytics API)

3 jobs autonomos · tokens persistidos em `online_oauth_tokens`:

- **live-monitor** · GitHub Actions
  (.github/workflows/online-live-monitor.yml) porque Vercel Hobby nao
  permite cron sub-diario. Secrets necessarios no repo:
  `CRON_SECRET` e `APP_BASE_URL`. Roda `*/5` apenas em janelas que
  cobrem horarios reais de culto + buffer pra eventos atipicos:
  Dom UTC 11-15 (BRT 08-13 · manha) · diario UTC 16-23 (BRT 13-21) ·
  diario UTC 0-4 (BRT 21-02). Pula UTC 05-10 (BRT 02-07) onde nao ha
  culto. So age (server-side) se ha culto na janela (30min antes ate
  4h depois do horario marcado). Detecta live ativa via
  `liveBroadcasts.list?broadcastStatus=active`, linka `youtube_video_id`
  no culto e atualiza `online_pico` quando `concurrentViewers > atual`.
  Pra evento atipico fora de janela, usar botao "Coletar pico agora"
  da UI em `/online`.
- **ds-collect** · cron `0 10 * * *` · pra cultos de ontem com video_id,
  grava `online_ds` = **total acumulado de views do video** no momento da coleta
  (snapshot da manha seguinte ao culto) via `videos.list?part=statistics`
  (`fetchVideoStatistics` · Data API · quase tempo real, SEM o atraso de 1-2d da
  Analytics que deixava o DS de ontem zerado). watch time / retencao do DS
  seguem vindo da Analytics como best-effort (podem atrasar). Os endpoints
  manuais `/coletar/ds` e `/coletar/ddus` rodam `backfillCultoVideoIds` antes,
  pra vincular o video ao culto (o coletor so age em culto ja vinculado).
- **ddus-collect** · cron `30 10 * * *` · pra cultos de 7 dias atras,
  grava `online_ddus` = **on-demand acumulado na semana** = `statistics.viewCount`
  AGORA (>= D+7) **menos o DS** (snapshot da manha seguinte). Mesma fonte do DS
  (Data API · sem o atraso da Analytics). So calcula se `online_ds` existe (o DS
  e o ponto de partida da subtracao · sem ele pula com `ds_ausente`). watch time
  / retencao do DDUS seguem da Analytics como best-effort.

Override manual continua funcionando · coletor so atualiza se valor `null`
ou `0` (DS/DDUS), ou se for `pico > online_pico atual`.

Endpoints OAuth:
- `GET /api/online/oauth/authorize` (admin/diretor) · retorna URL Google
- `GET /api/online/oauth/callback` (publico, valida state HMAC) · troca code
- `GET /api/online/oauth/status` · status atual
- `POST /api/online/oauth/disconnect` (admin/diretor) · revoga refresh_token

### O que **NAO fazer**

- Nunca permitir input de frequencia/aceitacoes neste modulo. Eh
  competencia da Integracao.
- Nunca consumir a API do YouTube live na resposta de `/dashboard`. Sempre
  ler do snapshot. Pra atualizar, usar cron ou botao "Sincronizar agora".
- Series sao playlists. Nao criar uma camada de "serie manual no banco" —
  fonte de verdade eh o YouTube.

## Grupos · hierarquia e supervisao

Modulo Grupos tem hierarquia formal de papeis (visitante → frequentador
→ lider_treinamento → lider → co_lider → supervisor → coordenador) e
fluxo de supervisao (visitas + observacoes mensais por grupo).

Tela: `/grupos/supervisao` (em `src/pages/ministerial/GruposSupervisao.jsx`).

**Documentação completa** com checklist de ativação + queries de
atribuição: `docs/modulo-grupos-supervisao.md`. Consultar antes de
popular dados reais de função/supervisor pra verificar permissões.

## Revisao Estrategica — edicao direta com impacto

Modulo para revisar projetos e marcos de expansao com visualizacao de
cascata. **Nao usa workflow de aprovacao** — o PMO edita direto.

### Fluxo
1. Diagnostico: KPIs + lista filtrada de itens atrasados/pendentes
2. Clicar num item: abre painel split (edicao + impacto)
3. Ao alterar `date_end` de um marco: recalcula cascata em tempo real
4. Salvar aplica direto e loga em `revision_log`

### Endpoints
- `GET /api/revisoes/diagnostico` — radar completo
- `GET /api/revisoes/simular/:tipo/:id?nova_data=X` — cascata de impacto
- `PUT /api/revisoes/projeto/:id` — editar projeto + log
- `PUT /api/revisoes/expansao/:id` — editar marco + log
- `GET /api/revisoes/historico?tipo=&item_id=` — log de alteracoes

### Tabelas
- `revision_log` — audit trail de cada campo alterado (campo, valor
  anterior, valor novo, motivo, quem, quando)

## Governanca — Ciclo mensal de reunioes

4 reunioes mensais interligadas que formam um ciclo de governanca:
```
Sem 1: OKR → Sem 2: DRE → Sem 3: KPI → Sem 4: Conselho
```

Extras (nao mensais): Diretoria Estatutaria (quadrimestral),
Assembleia Geral (semestral).

### Tabelas
- `governance_cycles` — um por mes (year, month, status)
- `governance_meeting_types` — tipos de reuniao (OKR, DRE, KPI, CC, DE, AG)
- `governance_meetings` — 4+ por ciclo, com pauta, ata, deliberacoes
- `governance_tasks` — demandas por reuniao
- `governance_task_templates` — demandas padrao por tipo

### Endpoints
- `POST /api/governanca/cycles` — criar ciclo mensal + reunioes + tarefas
- `POST /api/governanca/cycles/generate-year` — gerar ano inteiro
- `GET /api/governanca/cycle/:year/:month` — ciclo completo
- `PUT /api/governanca/meetings/:id` — atualizar reuniao
- `GET /api/governanca/meetings/:id/dados` — dados automaticos do sistema
- CRUD tarefas e templates

### Frontend
- `/governanca` — navegacao mensal, pipeline visual das 4 reunioes
- Detalhe: formulario (pauta/ata/deliberacoes) + demandas + dados automaticos

### KPIs
Marcos vai definir os KPIs especificos de cada reuniao. Estrutura
pronta para receber — por enquanto os dados automaticos puxam
resumos dos modulos (projetos, financeiro, cultos, pendencias).

## Contexto do projeto

Sistema ERP interno da CBRio (Igreja). Stack: React 18 + Vite +
TypeScript/JSX (misto), Express.js backend, Supabase
(PostgreSQL + Auth + RLS), deploy no Vercel (frontend estático +
serverless functions via `api/index.js`).

Módulos principais: Dashboard, Eventos, Projetos, Planejamento,
Expansão, RH, Financeiro, Logística, Patrimônio, **Membresia**,
Solicitações, Assistente IA, Permissões, **Cérebro CBRio**.

> **Processos**: removido na reuniao de permissoes (2026-05-18).
> A rota `/processos` foi descontinuada e redireciona pra `/eventos`. Schema
> da tabela `processos` permanece no banco mas o modulo nao aparece mais no
> menu nem no sistema de permissoes (linha marcada como obsoleta na matriz).

## Permissoes · matriz cargo x modulo (reuniao Marcos Paulo · 2026-05-18)

A matriz aprovada vive em duas tabelas (Supabase):

- `cargo_modulo_permissao` · **default por cargo** (matriz que veio da
  planilha · source of truth). Linha por (cargo, modulo) com nivel 0-5
  + modificadores (`pode_exportar`, `pode_aprovar`, `escopo_proprio`).
- `permissoes_modulo` · **override por usuario** (excecao individual).
  Tem os mesmos campos + `motivo` e `expira_em` (override temporario).

A view `vw_permissao_efetiva` ja faz o fallback `override -> default
do cargo -> 0`. Quando precisar consultar permissao efetiva, usa essa view
ao inves de juntar manualmente.

### Niveis 0-5

- `0` Sem acesso · modulo nao aparece no menu nem responde a URL
- `1` Ver (so leitura)
- `2` Ver + preencher dado bruto (lancar numeros)
- `3` Ver + editar (CRUD)
- `4` Ver + editar + deletar
- `5` Admin do modulo (configura regras, metas, seeds, deleta tudo)

### Modificadores

- `pode_exportar` (`+E`) · exportar dados (CPF, telefone, financeiro · LGPD)
- `pode_aprovar`  (`+A`) · aprovar workflows daquele modulo (ex: despesa)
- `escopo_proprio` (`*`) · acesso so da propria area / valor / setor

### 25 cargos (slugs)

`pastor-senior`, `pastor-presidente`, `diretor-administrativo`,
`coordenador-estrategia`, `diretor-ministerial`, `diretor-criativo`,
`lider-ministerial`, `assistente-area`, `assistente-ministerial`,
`coordenador-financeiro`, `assistente-financeiro`,
`coordenador-marketing`, `assistente-marketing`,
`lider-producao`, `assistente-producao`,
`lider-operacoes`, `lider-logistica`, `assistente-logistica`,
`assistente-operacoes`,
`diretor-rh`, `coordenador-voluntarios`, `voluntario`, `membro`,
`conselho`, `dev`.

### 30 modulos (slugs)

- **Estrategica**: `dashboard`, `painel-cbrio`, `minha-area`, `gestao`,
  `planejamento`, `ritual`, `governanca`, `revisao-estrategica`
- **Ministerial**: `integracao`, `cuidados`, `online`, `next`,
  `voluntariado`, `membresia`, `grupos`
- **Operacional**: `eventos`, `projetos`, `expansao`, `rh`, `financeiro`,
  `logistica`, `patrimonio`, `solicitacoes`
- **Dados / IA / Admin**: `dados-brutos`, `nps`, `notificacoes-config`,
  `assistente-ia`, `cerebro`, `perfil`, `permissoes-admin`, `usuarios-admin`

### Backend · como usar

```js
const { authorizeModule } = require('../middleware/auth');
// Bloqueia acesso ao endpoint se o usuario nao tiver nivel >= 2 em /financeiro
router.use(authenticate, authorizeModule('financeiro', 2));
```

`ROUTE_MODULE_MAP` em `backend/middleware/auth.js` mapeia routeKey -> slugs
de modulo. Quando criar rota nova, adicionar entrada la.

`req.user.granular.modulePerms[slug]` retorna
`{ leitura, escrita, pode_exportar, pode_aprovar, escopo_proprio }`.

### Frontend · como usar

```jsx
const { canFinanceiro, canMembresia, getAccessLevel } = useAuth();
if (!canFinanceiro) return <Navigate to="/dashboard" />;
const nivel = getAccessLevel(['financeiro']);
```

Hooks ja definidos em `src/contexts/AuthContext.jsx`: `canRH`, `canFinanceiro`,
`canLogistica`, `canPatrimonio`, `canMembresia`, `canProjetos`, `canExpansao`,
`canAgenda`, `canIA`, `canKPIs`, `canCuidados`, `canSolicitacoes`, `canNPS`,
`canDadosBrutos`, `canPainel`.

### Overrides com expiracao

`permissoes_modulo.expira_em` permite override temporario (cobrir licenca,
projeto pontual). Quando expira, o usuario volta automaticamente para o
default do cargo. O middleware filtra overrides expirados antes de compor
a permissao efetiva.

### Endpoints admin (`/api/permissoes/*`)

- `GET /matriz` · matriz completa (cargos, modulos, celulas)
- `PUT /matriz/celula` · editar uma celula da matriz (default por cargo)
- `GET /cargo/:id` · detalhe + celulas de um cargo
- `GET /usuario/:id` · permissoes efetivas + overrides + areas
- `PUT /usuario/:id/cargo` · trocar cargo do usuario
- `PUT /usuario/:id/modulo` · criar/atualizar override por modulo
- `DELETE /usuario/:id/modulo/:moduloId` · remover override

Todos exigem `authorize('admin','diretor')`. Ao editar matriz ou override,
o cache do middleware e' invalidado automaticamente.

### Itens pendentes da reuniao

Estes itens **nao** foram preenchidos na planilha e precisam de decisao:

1. **Assistente do Online** · ninguem definido como assistente da area
2. **Estrutura do Marketing** · todos como assistentes ou ter lideres de
   subarea (conteudo, design, redes sociais)?
3. **Cargo do Francisco (Chico)** · provisoriamente `assistente-financeiro`,
   confirmar com a Ju do RH
4. **Permissoes do Lider de Producao** · reuniao foi interrompida nessa
   parte · matriz atual usa um perfil generico (espelha outros lideres
   de area). Conferir com Bracinho/Marcos
5. **Override flow** · planilha decidiu nao pre-configurar overrides.
   Formalizar processo de pedido + aprovacao quando alguem precisar de
   acesso fora do cargo

## Membro Modelo — Fluxo da jornada nos 5 valores

A migration `20260430130000_membro_modelo_completo.sql` fechou os 4 gaps
do fluxo de membro, conectando os módulos ponta a ponta:

```
visitante (int_visitantes)
   ├── fez_decisao=true → [trigger] cria mem_membros + trilha 'conversao'
   │                          → KPI INTG-01, CBA-01 sobem (auto)
   │                          → Jornada mostra +1 em "Seguir Jesus"
   ├── inscreve no batismo (batismo_inscricoes)
   │
   └── batismo realizado (status='realizado')
                              → [trigger] trilha 'batismo'
                              → mem_membros.status = 'membro_ativo'
                              → int_visitantes.status = 'batizado'
```

**Tabela nova:** `mem_devocionais` (gap 3) — alimenta KID-04 via
`devocionais.familias` collector. Endpoint: `/api/devocionais` (CRUD +
stats). Cliente: `devocionais` em `src/api.js`.

**Cálculo dos 5 valores** (em `backend/routes/jornada.js`):
- **Seguir Jesus**: `mem_trilha_valores.etapa IN ('conversao','primeiro_contato','batismo')` + concluida
- **Conectar**: `mem_grupo_membros.saiu_em IS NULL`
- **Investir Tempo**: `cui_jornada180.data_encontro` nos últimos 90d (futuro: também `mem_devocionais`)
- **Servir**: `mem_voluntarios.ate IS NULL`
- **Generosidade**: `mem_contribuicoes.data` nos últimos 90d

**Membro Modelo**: derivado em tempo real pelo Jornada como
`COUNT(valores) >= 2` por membro. Não tem flag/coluna — é calculado.

## KPI Auto-Collector (separação AMI/Bridge)

`backend/services/kpiAutoCollector.js` agora tem coletores separados:
- `cultos.ami_freq` / `cultos.ami_conv` → AMI-01 / AMI-02
- `cultos.bridge_freq` / `cultos.bridge_conv` → AMI-05 / AMI-06
- `cultos.amibridge_*` ficam como DEPRECATED (não usar em fonte_auto novos)

Filtros em `isAmiCulto` (AMI ou sábado, exclui Bridge) e `isBridgeCulto`
(qualquer culto com 'bridge' no nome). Ajustar se nomenclatura de
cultos mudar.

## Cultos recorrentes — slots fixos e identidade única

Os horários de culto vivem em `vol_service_types` com `recurrence_day`
(0=Dom … 6=Sáb) + `recurrence_time`. A função
`gerar_cultos_recorrentes(data_inicio, data_fim)` materializa rows em
`public.cultos` para cada ocorrência no range — idempotente, pula slots
que já existem.

### Slots vigentes e config do modal

`vol_service_types` tem 3 colunas que configuram o `ModalCulto`:
- `presencial_label` (texto) · label do input de presencial
- `has_kids` (bool) · mostra campo Kids
- `has_online` (bool) · mostra decisoes_online + bloco Transmissão online

| Service Type | Dia | Hora | Presencial label | Kids | Online |
|--------------|-----|------|------------------|------|--------|
| Domingo 08:30 | Dom (0) | 08:30 | **Sede** | ✓ | ✓ |
| Domingo 10:00 | Dom (0) | 10:00 | **Sede** | ✓ | ✓ |
| Domingo 11:30 | Dom (0) | 11:30 | **Sede** | ✓ | ✓ |
| Domingo 19:00 | Dom (0) | 19:00 | **Sede** | ✓ | ✓ |
| Quarta com Deus | Qua (3) | 20:00 | Presencial | ✓ | ✓ |
| Bridge | Sáb (6) | 17:00 | Presencial | — | — |
| AMI | Sáb (6) | 20:00 | Presencial | — | ✓ |

Para adicionar um novo tipo de culto: `INSERT INTO vol_service_types
(name, recurrence_day, recurrence_time, presencial_label, has_kids,
has_online, color)`. Modal adapta automaticamente · não precisa
mexer no React.

### Identidade única do culto

- `cultos.id` é `uuid PRIMARY KEY DEFAULT gen_random_uuid()` — cada row
  tem ID único naturalmente.
- **UNIQUE (service_type_id, data)** em `cultos` garante que não exista
  2 rows pro mesmo slot lógico. Migração:
  `20260514110000_ami_sabado_20h_unique_culto.sql`.
- Série histórica de indicadores por culto cruza `cultos.service_type_id`
  com `cultos.data` sem ambiguidade — `(service_type_id, data)` é
  chave estável.

### Contagem de visitantes — descontinuada

A partir de 2026-05-14 (decisão do Marcos), **não contamos mais o número
de visitantes por culto**. Removido da UI:

- Aba "Visitantes" da página `/integracao` (e os componentes
  `TabVisitantes`, `VisitanteFormDialog`, `VisitanteDetailDialog`,
  `AcompanhamentoFormDialog`)
- Aba "Pendentes" (era acompanhamentos de visitantes — sem fonte de
  dados depois da remoção da aba Visitantes, ficaria sempre vazia)
- Card "Visitantes (30d)" e "Contatos hoje" do header
- Seção "Visitantes (1ª vez)" do modal de culto em `CalendarioCultos`
  (campos `visitantes` / `visitantes_online` não são mais preenchidos)
- Linha "X visit" dos cards do calendário semanal

Schema preservado: `cultos.visitantes`, `cultos.visitantes_online`,
`int_visitantes` e `int_acompanhamentos` continuam existindo no banco ·
só não há entrada pela UI.

**Coletor `cultos.conv_visit` ajustado**: antes somava
`decisões + visitantes`. Agora soma só decisões — `cultos.visitantes`
seria sempre zero e degradaria o KPI silenciosamente.

### KPIs do Online — só /minha-area (não entram no painel NSM)

`cultos.online_pico`, `cultos.online_ds`, `cultos.online_ddus` são
preenchidos no modal de culto (quando `service_type.has_online`).
Não têm cross-relação com outras áreas, então **não entram no painel
NSM** (mandalas, matriz Valor × Área). Aparecem apenas em
`/minha-area` para quem tem `kpi_areas = ['online']`.

| ID | Indicador | Coletor (mensal) |
|---|---|---|
| `ON-AUD-01` | Audiência online de pico (média) | `cultos.online_pico_avg` |
| `ON-DS-01` | Views D+1 (total) | `cultos.online_ds_total` |
| `ON-DDUS-01` | Views D+7 on-demand (total) | `cultos.online_ddus_total` |

**Como filtrar do painel**: os 3 têm `valores = '{}'` (array vazio) em
`kpi_indicadores_taticos` (coluna é NOT NULL). O endpoint
`/painel/mandalas` e `/painel/matriz` filtram com
`Array.isArray(k.valores) && k.valores.includes(v)`. Array vazio passa
no `isArray` mas `includes(v)` é false para todos os valores da
Jornada → KPI não entra em nenhuma célula.

Para futuros KPIs "só de visualização" (sem cross-impacto na
Jornada), basta deixar `valores = '{}'::text[]`.

### Recálculo automático · trigger SQL em tempo real

KPIs auto-cultos/batismos são recalculados via **trigger SQL** no
banco. Migration `20260514210000_kpis_trigger_realtime.sql` cria:

- `kpi_calcular_valor_auto(fonte, inicio, fim)` · CASE com a lógica de
  cada `fonte_auto` que começa com `cultos.` ou `batismos.`
- `kpi_recalcular_para_data(data)` · UPSERT em `kpi_registros` pra todos
  os KPIs ativos que cobrem a data, em todas as periodicidades aplicáveis
- Trigger `cultos_recalc_kpis AFTER INSERT/UPDATE/DELETE ON cultos`
- Trigger `batismos_recalc_kpis AFTER INSERT/UPDATE/DELETE ON batismo_inscricoes`

Latência: **zero** · KPIs sempre refletem o último dado salvo. Sem cron,
sem `setImmediate`. O backend só limpa o cache do `/painel` no PUT.

Editar culto antigo recalcula o período daquele culto (não o mês
corrente) automaticamente porque a função usa a `data` do row mudado.

Backfill na própria migration popula `kpi_registros` de todas as datas
existentes em `cultos` + `batismo_inscricoes` (`status='realizado'`) ·
não precisa esperar cron diário nem editar manualmente.

Tabs vigentes de `/integracao`: **Cultos · Frequência · Decisões · Batismos · Histórico**.

### Decisões · toggle Por culto | Pessoas (CPFs)

Aba "Decisões" tem o gráfico mensal no topo (Recharts) e, embaixo, um
`<DetalhamentoDecisoes>` com toggle entre 2 modos · estilo Batismos:

- **Por culto** (default) · tabela agregada por tipo de culto
  (Domingo/AMI/Bridge/Quarta) · cultos · presenciais · online · total
  · média.
- **Pessoas** · lê `vw_nsm_sem_dados` + carrega `cultos_decisoes_pessoas`
  de cada culto. Renderiza:
  - **Sem busca**: lista de cultos com expand (filtro Todos/Pendentes/Sem
    dados/Completos · botão "Adicionar pessoa (faltam N)" inline)
  - **Com busca**: tabela flat estilo `/integracao` aba Batismos (Nome ·
    CPF · Contato · Culto · Tipo · Vínculo membro)

A aba "Pessoas decididas" separada foi removida em 2026-05-14 · todo
o fluxo passa pela aba Decisões. Arquivo `DecisoesPessoas.tsx` deletado.

### Cadastro flexível · CPF/nascimento opcionais

Marcos: "no momento da conversão é difícil pedir CPF/nascimento · nome
e telefone são os dados mais fáceis · censo posterior preenche o resto".

**Obrigatórios em `cultos_decisoes_pessoas`:**
- `nome` (min 2 chars)
- `telefone` · 11 dígitos exatos (DDD + 9 + número · padrão BR)

**Opcionais (sem asterisco):**
- `cpf` · se preenchido, 11 dígitos exatos
- `data_nascimento`
- `email`, `idade`, `observacoes`

**Marcação visual:** pessoas com `cpf IS NULL` OU `data_nascimento IS NULL`
ganham badge `incompleto` (amber) em todas as listas. Borda esquerda do
card vira amber em vez de roxo.

**Endpoint pra censo posterior:** `GET /api/kpis/decisoes-pessoas/incompletos`
retorna `{ total, items[] }` com `falta_cpf` e `falta_nasc` booleanos.
Permite Marcos/Alda exportar a lista e correr atrás dos dados depois.

**Trigger BEFORE INSERT** (`tg_cultos_dec_pessoas_resolve_membro`) continua
funcionando: se CPF/nascimento estiverem presentes, tenta match em
`mem_membros`. Se ausentes, cai pra criar membro novo `status='visitante'`
com os dados disponíveis (nome + telefone). NSM não quebra · `nsm_eventos`
aceita CPF NULL.

### Kids · decisão de criança com dados do responsável (LGPD)

Marcos (2026-05-18): "incluir Kids nas decisões · salvar pelos dados do
responsável, só nome da criança. Crianças dificilmente seguirão a jornada
· não devem afetar o NSM. LGPD com menores".

**Schema** (migration `20260518150000_decisoes_kids_e_cutoff.sql`):
- `cultos_decisoes_pessoas.tipo_decisao` ganha `'kids'` (era só
  `presencial|online`)
- 3 colunas novas em `cultos_decisoes_pessoas`:
  - `responsavel_nome` text
  - `responsavel_telefone` text · 11 dígitos (obrigatório quando tipo=kids)
  - `responsavel_cpf` text · 11 dígitos (opcional)
- `cultos.decisoes_kids int DEFAULT 0` · campo agregado separado de
  `decisoes_presenciais` e `decisoes_online`

**Triggers · Kids fica de fora do pipeline padrão:**
- `tg_cultos_dec_pessoas_resolve_membro` retorna direto sem criar
  `mem_membros` automaticamente (LGPD · cadastro de menor exige
  intervenção pastoral consciente)
- `tg_cultos_dec_pessoas_jornada` retorna direto sem criar
  `mem_trilha_valores` etapa='conversao' nem `nsm_eventos`
- Resultado: criança não entra no NSM, nem no numerador nem no denominador

**Modal de culto** ganha o campo "Kids" na seção Decisões/conversões
quando `service_type.has_kids = true`. Layout adaptativo:
- só presencial → 1 coluna
- presencial + online → 2 colunas
- presencial + kids → 2 colunas
- presencial + online + kids → 3 colunas

**`DecisaoPessoaForm`** alterna estrutura conforme `tipo_decisao`:
- `presencial|online`: nome + telefone + CPF + nascimento + email
- `kids`: nome da criança + bloco rosa "Dados do responsável (LGPD)"
  com nome/telefone/CPF do responsável · esconde CPF/nascimento/email
  da criança

### Cutoff temporal · "de hoje pra cá" · ⚠️ REVERTIDO em 2026-06-09

Marcos (2026-05-18): "usa a data de hoje como base, não vamos conseguir pegar os
dados passados". A view `vw_nsm_sem_dados` filtrava `c.data >= DATE '2026-05-18'`.
**REVERTIDO** (migration `20260609160000_nsm_sem_dados_sem_cutoff.sql`): depois
que a NSM passou a contar fantasmas no denominador (janela móvel de 90d ·
20260515400000), o cutoff escondia gap que JÁ contava no card — a NSM mostrava
240 decisões e a aba Sem dados só 44 de gap. A view voltou a cobrir tudo; o
recorte de período é do consumidor (`?dias` no endpoint / janela na página).

### Membros duplicados · detecção + merge

Marcos (2026-05-18): "não impede cadastro duplicado · ter aba pra juntar
depois. Pessoa pode levantar a mão 2x em cultos diferentes ou cadastrar
em grupos sem saber que já tem".

**Schema** (migration `20260518170000_membros_duplicados.sql`):
- `vw_membros_duplicados` · view que detecta pares por 5 critérios:
  - `cpf_igual` (100%) · mesmo CPF normalizado de 11 dígitos
  - `nome_e_nascimento` (95%) · mesmo nome (case-insensitive) + mesma data nasc
  - `telefone_igual` (90%) · mesmo telefone normalizado
  - `email_igual` (85%) · mesmo email (lower/trim)
  - `nome_similar` (70%) · `pg_trgm.similarity() >= 0.7` + (mesmo CPF OR mesmo nasc)
- `mem_duplicados_ignorados` · pares confirmados "não é duplicata" · saem
  automaticamente da view · UNIQUE (a, b) + CHECK (a < b) garante idempotência
- `mem_merge_log` · audit com snapshot JSONB pré-merge
- Função `merge_membros(keep_id, merge_ids[], feito_por, observacao)`:
  - Atualiza FKs em 9+ tabelas conhecidas (grupo_membros, contribuicoes,
    trilha_valores, voluntarios, devocionais, cultos_decisoes_pessoas,
    nsm_eventos, jornada180, +6 opcionais via `EXCEPTION undefined_table`)
  - Resolve conflitos de UNIQUE deletando linhas duplicadas antes do UPDATE
    (ex: `mem_grupo_membros (membro_id) WHERE saiu_em IS NULL`)
  - Enriquece `keep` com dados que tinha em `merge` mas não em `keep`
    (CPF, telefone, email, nascimento, foto)
  - DELETE dos `merge_ids` no final · log com snapshot
  - Idempotente · IDs inexistentes / `keep_id` na lista são filtrados

**Endpoints** (`backend/routes/membresia.js`):
- `GET /api/membresia/duplicados?limit=200`
- `POST /api/membresia/duplicados/ignorar` (admin/diretor)
- `POST /api/membresia/membros/merge` (admin/diretor) · `{keep_id, merge_ids, observacao}`
- `GET /api/membresia/merge-log` (admin/diretor)

**UI** (`src/components/MembrosDuplicadosPanel.jsx`):
- Aba "Duplicados" em `/ministerial/membresia` (entre Jornada e Cadastros)
- Cards lado a lado com foto/nome/CPF/telefone/email/nasc · badges coloridos
  por motivo · botão "Manter este" + "Não é duplicata"
- Modal de confirmação destacando o cadastro que sumirá

### Cascata Seguir a Jesus → KPIs por área

Os dados preenchidos no modal de culto agora alimentam **7 KPIs** do
valor "seguir" automaticamente (antes só AMI tinha cobertura):

| KPI | Área | Coletor |
|---|---|---|
| `BRG-01` | Bridge | `cultos.bridge_freq` |
| `BRG-02` | Bridge | `cultos.bridge_conv` |
| `SED-21` | Sede | `cultos.sede_freq` |
| `SED-18` | Sede | `cultos.sede_conv` |
| `ONL-11` | Online | `cultos.online_freq` (pico online) |
| `ONL-13` | Online | `cultos.online_conv` (decisões online) |
| `KIDS-01` | Kids | `cultos.kids_freq` |

Migration: `20260514170000_kpis_seguir_fonte_auto.sql`.

Coletores filtram cultos por `service_type_name` (mais robusto que
nome livre): `isAmiCulto` checa `'ami'`, `isBridgeCulto` checa
`'bridge'`, `isSedeCulto` checa `domingo*` ou `'quarta com deus'`.
Online usa soma de `online_pico` direto, sem filtro de tipo.

### ⚠️ Meta absoluta × periodicidade do KPI · regra importante

**Sempre** que adicionar novo KPI tático com `tipo_calculo != 'manual'` E meta
cascateada via `aplicar_meta_institucional()`, lembrar:

- `aplicar_meta_institucional()` materializa `meta_valor_absoluto` SEMPRE em
  **escala anual** (baseline = ano anterior jan-dez × 1.30 / fator institucional).
- O **coletor automático** gera registros na **periodicidade do KPI**
  (semanal: soma da semana · mensal: soma do mês · etc).
- Comparar valor de UMA semana contra meta ANUAL gera percentual baixo falso
  (ex: 2.500 / 23.400 = 10.6% · vermelho falso positivo).

**Onde a normalização acontece**: `vw_kpi_trajetoria_atual` e
`vw_kpi_taticos_status` dividem `meta_valor_absoluto` pelo fator da
periodicidade do KPI:

| Periodicidade | Divisor |
|---------------|---------|
| `semanal`     | 52      |
| `mensal`      | 12      |
| `trimestral`  | 4       |
| `semestral`   | 2       |
| `anual`       | 1       |

Migration de referência: `20260515520000_normalizar_meta_periodicidade.sql`.

**Cuidados ao adicionar KPI novo:**
1. Decidir a **periodicidade** correta no `kpi_indicadores_taticos.periodicidade`
2. Garantir que o **coletor** (`fonte_auto` em `kpiAutoCollector.js`) retorna
   o valor agregado naquela periodicidade (semanal = 1 semana, não acumulado)
3. Se quiser meta **manual em escala não-anual** (ex: meta semanal direto),
   preencher `kpi_indicadores_taticos.meta_valor` SEM passar pela cascata
   (a view só normaliza quando `meta_valor_absoluto IS NOT NULL`)
4. KPIs com checkpoints granulares em `kpi_trajetoria` continuam com a meta
   do checkpoint (não passam pela normalização) · checkpoint já é por período

### Histórico de longo prazo · vw_culto_historico_anual

Visualizações Frequência/Decisões cobrem ranges 3m / 6m / 12m / 2a / 5a
(limit 5.000 cultos · folga ampla pra 5 anos × 7 slots × 52 sem = 1.820).

A aba **Histórico** (`HistoricoCultos.tsx`) usa a view
`vw_culto_historico_anual` (agregação SQL por ano + tipo de culto).
Como retorna 1 linha por `(ano, service_type)`, escala pra qualquer
volume de cultos sem limit no front · 50 anos × 7 tipos = 350 rows.

Visualizações usam **react-query** (`staleTime: 5min`) · trocar de
range não refaz fetch enquanto cache estiver quente.

### Calendário semanal

`/integracao` aba "Cultos" mostra grade Dom-Sáb (7 colunas) da semana
atual. Setas navegam ±1 semana; botão "Hoje" volta. Cada card mostra
horário + tipo de culto + status (preenchido/pendente). Click abre
modal de edição de dados de integração.
- **Permissão**: `canProcessos` via modulo "Processos" em
  `permissoes_modulo`

### Categorias de processo

| Categoria | Areas |
|-----------|-------|
| Ministerial | CBA, Cuidados, Grupos, Integracao, Voluntariado, NEXT, Generosidade |
| Geracional | AMI, CBKids |
| Criativo | (futuro) |
| Operacoes | (futuro) |

### OKR

Processos podem ser marcados como OKR (Objetivo Estrategico).
A aba OKR mostra apenas esses processos com seus indicadores
vinculados como resultados-chave. Futuramente alimenta o
planejamento estrategico.

### Decisoes de design

- `indicador_ids` é TEXT[] (nao junction table) porque KPIs sao
  constantes no frontend — sem tabela de KPIs no banco
- Soft delete: DELETE arquiva (status='arquivado'), nao remove
- Areas filtradas por categoria no modal de criacao
- Sem migration de KPIs — dados vivem em `src/data/indicadores.js`

## Sistema OKR/NSM 2026 (em construcao)

Sistema unificado de OKR/KPI/NSM, alinhado com Marcos+Matheus apos
estudo metodologico e validacao com lideres em mai/2026.

### Conceito central

- **1 NSM** (estrela-guia): "Novos convertidos engajados em ≥1 valor
  da CBRio em ate 60d da decisao"
- **5 valores** como colunas: Seguir, Conectar, Investir, Servir, Generosidade
- **6 areas** como linhas: Kids, Bridge, AMI, Sede, Online, CBA
- Matriz Valor × Area → ~150 KPIs distribuidos
- Cascata automatica: ponta alimenta o agregado

### 3 telas principais (objetivo final)

| Rota | Persona | Resumo |
|------|---------|--------|
| `/painel` | Diretoria + todos | NSM topo · carrossel de 6 mandalas · matriz colorida 6×5 · 3 alertas criticos |
| `/minha-area` | Lideres de area | KPIs da sua area agrupados por valor (nao periodicidade) |
| `/gestao` | Marcos + Matheus + Eduardo | Pulso · Configurar · Saude do sistema |
| `/ritual` | Diretoria geral (5 nominais) | Fluxo guiado mensal · regra de ouro causa-decisao-resp-proximo passo |

### Fase 1 — Mergeada em 2026-05-07 (PR #264)

Estruturas criadas:

```
igrejas (tabela)
  ├─ CBRio Sede + CBRio Online seedados
  └─ Igrejas externas CBA criadas via INSERT (tipo='cba_acompanhada')

mem_membros.igreja_id, int_visitantes.igreja_id
  └─ FK · default = CBRio Sede

profiles.is_diretoria_geral (bool) + funcao_diretoria (text)
  └─ Subconjunto nominal das 5 pessoas da diretoria geral
     (DISTINTO de role='diretor' que da acesso a /gestao)

kpi_trajetoria
  └─ Checkpoints intermediarios da meta por KPI por periodo
  └─ vw_kpi_trajetoria_atual calcula status (no_alvo/atras/critico)

nsm_eventos (append-only)
  └─ 1 linha por engajamento de pessoa em valor
  └─ Coluna calculada dentro_janela_60d (≤60d da decisao)

nsm_estado (1 linha por segmento)
  └─ Seedados: central, cbrio, online, cba
  └─ Extensivel: novos segmentos via INSERT (segmento_filtro JSON)
  └─ Recalculada por funcao recalcular_nsm() em cron horario

areas_kpi (formal)
  └─ 14 areas: 11 existentes + Bridge + Online + Sede
  └─ kpi_indicadores_taticos.area continua string referenciando areas_kpi.id
```

**Renomeacoes importantes:**
- "Instituicao" (planilha de Marcos+Matheus) → "Sede" (no banco)
- "OKR (Objetivo Especifico)" da planilha → tratamos como "Meta com
  trajetoria" no codigo (nao OKR formal, porque nao tem 3-5 KRs)

### Diretoria geral (5 nominais)

Eduardo Gnisci · Lider de Gestao (chefe do Marcos · tambem role=diretor)
Arthur Serpa · Lider Ministerial
Pedro Menezes · Lider Criativo
Pr. Pedrao · Pastor Senior
Pr. Juninho · Pastor Presidente

`is_diretoria_geral=true` em profiles → recebe alertas criticos no painel
e participa do `/ritual`. Marcar via UI no `/gestao` (Fase 4) ou direto:

```sql
UPDATE profiles SET is_diretoria_geral = true,
                    funcao_diretoria = 'Pastor Senior'
 WHERE email = 'pedrao@cbrio.com.br';
```

### Como rodar recalculo da NSM

```sql
-- Manual:
SELECT public.recalcular_nsm();

-- Cron (recomendado, horario):
SELECT cron.schedule('nsm-hourly', '0 * * * *',
  'SELECT public.recalcular_nsm()');

-- Ler painel:
SELECT * FROM vw_nsm_painel;
-- status: sem_dado | verde | amarelo | vermelho
```

### Fase 2 — Mergeada (PRs #266, #267, #268, #269, #270, fase 2E)

`/painel` central da CBRio com 4 secoes empilhadas + drilldowns:

```
/painel
  ├─ Camada 1: visao macro
  │    ├─ NSM Central card (gradient) + 3 segmentados (cbrio/online/cba)
  │    │    Click no card → camada 4 (lista de pessoas)
  │    ├─ Carrossel de 6 mandalas (slide 0 = 5 valores agregados,
  │    │    slides 1-5 = foco em cada valor com 6 areas)
  │    ├─ Matriz Valor × Area (6×5 colorida)
  │    │    Click numa celula → modal com KPIs daquela intersecao
  │    └─ Top 3 alertas criticos (KPIs criticos > OKR > menor % meta)
  │
  ├─ Camada 2: modal de drilldown
  │    └─ ModalCelula: lista KPIs da intersecao Area × Valor
  │       Click num KPI → camada 3
  │
  ├─ Camada 3: /painel/kpi/:id
  │    Detalhe 1 KPI: status atual, mini-grafico historico,
  │    trajetoria (checkpoints), revisoes OKR (regra de ouro)
  │
  └─ Camada 4: /painel/nsm/pessoas
       Lista de convertidos (filtro: engajados true/false, segmento, dias)
       Marca cada pessoa: dentro de janela 60d / urgente / vencida
       Vira ferramenta de acao pastoral
```

### Endpoints backend (`/api/painel/*`)

- `GET /api/nsm/painel`            → vw_nsm_painel (4 segmentos)
- `GET /api/nsm/eventos`           → eventos NSM (filtros: segmento, valor)
- `POST /api/nsm/recalcular`       → admin/diretor forca recalculo
- `GET /api/painel/mandalas`       → 6 mandalas em 1 chamada
- `GET /api/painel/matriz`         → grid 6×5
- `GET /api/painel/celula/:a/:v`   → KPIs da intersecao
- `GET /api/painel/alertas?limit=3`→ top KPIs em alerta
- `GET /api/painel/kpi/:id`        → detalhe completo (camada 3)
- `GET /api/painel/nsm/pessoas`    → pessoas convertidas (camada 4)
- `GET /api/painel/serie-temporal/dados` → catalogo valor×dado + lista de cultos
- `GET /api/painel/serie-temporal?valor=&dado=&culto=&inicio=&fim=&granularidade=`
   → serie agregada `[{periodo, valor}]` pra carrossel de tendencias

### NSM pessoas (camada 4) · filtros v2 (2026-06-09)

Ajustes do Marcos no drilldown `/painel/nsm/pessoas` (`PainelNsmPessoas.jsx` +
endpoint `GET /api/painel/nsm/pessoas`):
- **"Seguir a Jesus" marcado SEM atividade não exclui ninguém**: a própria
  conversão (que põe a pessoa na lista) já cumpre o valor · as atividades
  (1º Contato/Batismo/Next) refinam. Implementado no `matchFiltro` do backend
  + hint no card. ⚠️ NÃO muda o cálculo de `engajado` (engajamento segue sendo
  sinal pós-decisão · senão a NSM viraria 100% sempre).
- **Cards seguem o filtro**: endpoint devolve `match_engajados` /
  `match_nao_engajados` / `match_pct` (totais da lista filtrada por
  status+valores/atividades) além dos `total_*` do recorte; os 4 cards da UI
  usam os `match_*` (label vira "Pessoas no filtro") com nota do recorte
  completo embaixo.
- **Origem da decisão**: filtro Todos/Presencial/Online (`?tipo=` · filtra
  `cultos_decisoes_pessoas.tipo_decisao` na fonte, então muda o próprio
  universo). `?segmento=online` legado segue aceito. A página agora LÊ os
  query params da URL — os deep links dos cards NSM do `/painel`
  (`?segmento=online&engajados=false`) passaram a funcionar (antes ignorados).
- **v3 · fetch único + filtros instantâneos (2026-06-09)**: a página busca
  TUDO 1x no mount (universo do ano com `janela=acumulado&limit=1000` + a aba
  Sem dados com `dias=366`, em paralelo) e deriva Janela/Origem/Engajamento/
  valores client-side — useMemo espelhando o `matchFiltro` e a janela de
  engajamento do backend (recorte 30/60/90 = decisões em [fim−N, fim] ·
  atividades contam em [decisão, min(decisão+N, fim)]). Trocar filtro não faz
  round-trip; só trocar o **Ano** refaz o fetch. Backend intocado (os params
  do endpoint seguem suportados). ⚠️ payload capado em 1000 pessoas/ano —
  revisitar se um ano passar disso (paginação server-side).
- **Aba "Sem dados" só lista pendência**: cultos `gap_status='completo'`
  ficam fora da lista (nota informa quantos foram ocultados) · os 4 cards
  seguem resumindo o recorte inteiro (decisões × registradas × gap).
- **Reconciliação com o card NSM (2026-06-09)**: a aba Sem dados abre com um
  bloco fixo usando a janela OFICIAL do `nsm_estado` (móvel · 90d · via
  `nsm.painel()`): "X decisões no denominador · Y com pessoa cadastrada · Z
  sem dados" — bate com o card do `/painel` por construção. Exigiu remover o
  cutoff de 18/05 da `vw_nsm_sem_dados` (migration `20260609160000` · ver
  seção "Cutoff temporal · REVERTIDO"). O denominador da NSM (ex.: 240) NÃO é
  meta — é o total de decisões agregadas dos cultos nos últimos 90d; a meta da
  NSM é `meta_percentual` (50%). ⚠️ O numerador do card conta pessoa nominal
  com QUALQUER etapa concluída na trilha — como a etapa 'conversao' nasce
  concluída no ato, hoje ele mede na prática "decisões com pessoa cadastrada"
  (21/240), não engajamento pós-decisão (critério mais exigente da tela de
  pessoas). Alinhamento do numerador fica como decisão futura do Marcos.
- **Filtro de origem na aba Sem dados (2026-06-10)**: o segmented Origem
  (Todos/Presencial/Online) passou a valer pras 2 abas. A view ganhou
  `registradas_presencial/online` + `sem_dados_presencial/online` (migration
  `20260610120000` · colunas no FINAL · CREATE OR REPLACE) e o front projeta
  cards/lista/gap_status pela origem. Vínculo de membro não é separado por
  origem (oculto no modo filtrado). Fix junto: culto só-kids
  (`gap_status='sem_decisoes'`) não vaza mais como pendente na lista.

### Carrossel de valores (tendencias temporais · `/painel`)

Abaixo do carrossel de mandalas tem o `<CarrosselValores>` · um slide
por valor (Seguir/Conectar/Investir/Servir/Generosidade) com **3 filtros**:

- **Dado** · varia por valor. Catalogo em `SERIE_DADOS` (backend/routes/painel.js):
  - Seguir: Conversões · Frequência · Batismos
  - Conectar: Membros em grupos ativos · Novas entradas em grupos
  - Investir: Devocionais · Encontros Jornada 180
  - Servir: Voluntários ativos no mês · Novos voluntários
  - Generosidade: Valor doado (R$) · Doadores únicos no mês
- **Culto** (só Seguir · `dadoDef.filtra_culto = true`) · dropdown com
  os 7 service_types · default "Todos os cultos"
- **Período** · 3m / 6m / 12m (default) / 2a / 5a

Dados de snapshot (membros em grupos, voluntários ativos) calculam
"quantos estavam ativos no fim de cada período" via overlap
`desde <= fim AND (ate IS NULL OR ate > fim)`. Outros dados são
soma simples por período. Cache 5min por combo
`valor:dado:culto:inicio:fim:granularidade`.

Pra adicionar novo dado: incluir entrada em `SERIE_DADOS[valor]` em
`backend/routes/painel.js` + adicionar o branch correspondente em
`calcularSerie()`. Frontend pega automaticamente via `/serie-temporal/dados`.

### Dados extras no `SERIE_DADOS` (carrossel de tendências)

`SERIE_DADOS` tem dados não-óbvios que valem listar (alimentam o carrossel
de valores no `/painel`):
- `conectar.grupos_ativos` · count de grupos com pelo menos 1 membro ativo
  no fim de cada período (snapshot via `mem_grupo_membros`)
- `generosidade.dizimistas` e `generosidade.ofertantes` · distinct membros
  filtrando por `mem_contribuicoes.tipo = 'dizimo' | 'oferta'`

### Componentes do painel (`src/components/painel/`)

- `MandalaSlide.jsx` — uma mandala SVG (5 ou 6 setores)
- `CarrosselMandalas.jsx` — carrossel com setas, dots, swipe, teclado
- `CarrosselValores.jsx` — 5 slides com filtros + gráfico de linha (tendências)
- `MatrizValorArea.jsx` — tabela colorida com modal
- `ModalCelula.jsx` — drilldown da celula
- `AlertasCriticos.jsx` — top 3 KPIs em alerta

### Telas removidas pela Fase 2 (`PR #267`)

`/painel-kpis`, `/admin/cultura`, `/kpis`, `/kpis/guia` foram deletadas
e tem redirect pra `/painel`. Sidebar Inteligencia tem so 3 itens
agora: Painel CBRio · Meus KPIs · Assistente IA.

### Fase 6 — Dados brutos + calculo automatico (mergeada · 2026-05-07)

Mudanca conceitual: lider preenche **numero absoluto** (frequencia,
batismos, doacoes), sistema **calcula** o KPI (% crescimento, razao,
soma). Resolve confusao "preencher KPI" vs "preencher dado".

Estrutura criada:

```
tipos_dado_bruto (catalogo · ~35 tipos seedados)
  ├─ frequencia_culto · frequencia_next · frequencia_grupos
  ├─ conversoes · batismos · devocionais
  ├─ voluntarios_ativos · voluntarios_inativos_3m · voluntarios_recuperados
  ├─ voluntarios_checkin · voluntarios_treinamento
  ├─ doacoes_valor · doadores_count · doadores_recorrentes · doacoes_qualidade
  ├─ lideres_grupos · lideres_treinados · lideres_acompanhados · grupos_ativos
  ├─ solicitacoes_capelania · _aconselhamento · _capelania_recebidas · _aconselhamento_recebidas
  ├─ solicitacoes_servir_recebidas · solicitacoes_servir_alocadas
  ├─ inscricoes_jornada180 · novos_convertidos_atend
  └─ nps_next · nps_lideres · nps_voluntarios · nps_geral
       ↓
dados_brutos (registros · UNIQUE(tipo, area, data, contexto))
       ↓ (trigger automatico)
recalcular_kpis_por_dado() encontra KPIs ligados pela formula
       ↓
calcular_kpi() executa formula:
  - delta_pct: (atual - anterior) / anterior * 100
  - delta_abs: atual - anterior
  - razao: numerador / denominador * 100
  - contagem_janela: count em janela de N dias
  - soma_periodo: sum no periodo (mes/trim/sem/ano)
       ↓
kpi_valores_calculados (cache · UPSERT por kpi_id+periodo)
       ↓
vw_kpi_trajetoria_atual (view consolidada)
  - se tipo_calculo != 'manual': usa kpi_valores_calculados
  - senao: kpi_registros (legado · fallback)
```

`kpi_indicadores_taticos` ganha:
- `tipo_calculo` (manual | delta_pct | delta_abs | razao | contagem_janela | soma_periodo)
- `formula_config` (jsonb com parametros)

Dos 153 KPIs ativos, ~150 estao mapeados para calculo automatico.
~3 ficam manual (casos especiais).

### Tela `/dados-brutos` — onde o lider preenche

- Filtros: area · tipo · desde
- Tabela cronologica (desktop) / cards (mobile)
- Modal "Registrar dado": tipo + area + data + valor + observacao
- UNIQUE constraint: repreenchimento atualiza o valor

### Permissoes (regra geral do sistema OKR)

- **Leitura geral** (`/painel`, mandalas, matriz, alertas): qualquer autenticado
- **`/minha-area`**: filtro client-side por `profile.kpi_areas` OU `profile.kpi_valores`:
  - admin/diretor: vê tudo
  - sem `kpi_areas` e sem `kpi_valores` configurados: vê tudo (fallback MVP · vai apertar depois)
  - com permissões: KPI passa se `kpi.area` bate `kpi_areas` OU algum `kpi.valores[]` bate `kpi_valores`
- **`/integracao` escrita** (cultos, decisões, batismos): `authorizeIntegracao` em
  `backend/routes/kpis.js` exige `role IN ('admin','diretor')` OR `kpi_areas` contém `'integracao'`
- **`/dados-brutos`**: `useMyKpiAreas.canEditDado()` segue mesma lógica (area + valor + ministério)
- Admin/diretor: passa em todos os checks

**Caso de uso · líder de Integração (ex: Alda Lorena):**
- `kpi_areas = ['integracao']` → desbloqueia escrita em `/integracao`
- `kpi_valores = ['seguir']` → `/minha-area` mostra só KPIs Seguir (que estão nas 6 áreas
  sede/ami/bridge/online/kids/cba). Filtro client-side faz match por valor.
- Detalhes operacionais (query de diagnóstico + UPDATE): `docs/permissoes-alda.md`

### Modulos futuros (preparados na Fase 6)

- **NPS**: quando criar, alimenta `nps_*` em dados_brutos.
  KPIs de satisfacao ja apontam pra esses tipos.
- **Solicitacoes de membro** (capelania/aconselhamento/servir):
  quando criar, alimenta `solicitacoes_*_recebidas` e `*_atendidas`.
  KPIs ja apontam pra esses tipos.

### Voluntario inativo

Definicao operacional: **sem servir ha mais de 90 dias**.
- voluntarios_ativos: count distinct serviu nos ultimos 90 dias
- voluntarios_inativos_3m: count distinct sem servico ha 90+ dias
- voluntarios_recuperados: inativos que voltaram a servir no periodo

### Proximas fases (planejadas)

- **NPS** · modulo de avaliacoes (0-10) por contexto
- **Solicitacoes** · membro pede capelania/aconselhamento/voluntariado
- **Mobile responsive** · refinar `/minha-area`, expandir cards mobile
- **Permissoes finais** · refatorar quando estrutura estiver definida

### O que sera removido quando o sistema estiver pronto

- `/painel-kpis` (do Matheus, sera substituido por `/painel`)
- `/meus-kpis` (do Matheus, vira `/minha-area`)
- `/admin/cultura` (Mandala vira componente do `/painel`)
- `/kpis` legado (TabEstrategico/TabPorArea)
- `/processos` abas OKR/Agenda (limpas)

### Decisoes registradas

- NSM em **2 tabelas** (eventos + estado), nao view materializada — painel
  abre instantaneo lendo 1 linha
- Trajetoria em **tabela separada**, nao JSON — permite indexar e versionar
- Areas em **tabela formal**, mas sem migrar strings de
  kpi_indicadores_taticos — sem refactor destrutivo
- `is_diretoria_geral` **complementa** role='diretor', nao substitui
- Notificacoes **in-app apenas** (sino topbar) — sem email/SMS
- Ritual **sempre aberto** + modo guiado opcional — nao janela fechada

## Escala 50k pessoas (visao 5 anos · 5 campus)

Preparacao de banco/backend feita em 2026-05-11 para escalar ate 50k+
pessoas ativas (visao: 5 campus + online + CBA acompanhadas).

### View materializada · vw_pessoas_papeis_mat

Substitui `vw_pessoas_papeis` em queries pesadas (cruzamentos).
- 10 colunas booleanas pre-calculadas: 5 valores Jornada + 5 papeis
- 8 indices parciais (cada criterio do /cruzamentos)
- Refresh `CONCURRENTLY` (nao bloqueia SELECT)
- Cron Vercel horario: `/api/jornada/cron/refresh-papeis`
- Refresh manual: `POST /api/jornada/refresh-papeis` (admin/diretor)

A view `vw_pessoas_papeis` original continua existindo para backward compat
(ex: `backend/routes/membresia.js`).

### Funcao SQL · cruzar_pessoas(criterios, limit, offset)

`POST /api/jornada/cruzar` agora chama RPC que constroi WHERE dinamico
e retorna count + pagina em **1 query**. Antes carregava 50k linhas em
memoria + filtrava em JS.

Performance esperada em 50k pessoas:
- Cruzamento simples: ~50ms
- Cruzamento com 5 filtros: ~150ms
- Lista paginada (100): ~5ms adicional

### Statement-level trigger em dados_brutos

Antes: `FOR EACH ROW` · batch INSERT de 500 linhas = 500 chamadas a
`recalcular_kpi`. Agora: `FOR EACH STATEMENT` com transition tables
(`REFERENCING NEW TABLE AS inserted_rows`), pega DISTINCT (tipo, area, data)
e roda recalculo 1x por combo. **3 triggers separados** porque Postgres
exige (INSERT, UPDATE, DELETE).

### Cache em memoria no /api/painel

`mandalas`, `matriz`, `alertas` cacheiam por 5 min em `Map()` local de cada
instancia serverless. 10 usuarios simultaneos = 1 calculo (vs 10).
Invalidacao manual via `POST /api/painel/cache/bust` apos edicoes.

### Indices parciais criados (migration 20260511100000)

- `mem_contribuicoes (data DESC, membro_id)` · janelas de doacao
- `mem_voluntarios (membro_id) WHERE ate IS NULL` · ativos
- `mem_grupo_membros (membro_id) WHERE saiu_em IS NULL` · ativos
- `cui_jornada180 (data_encontro DESC, membro_id)` · janela 90d
- `cultos (data DESC)` · todos calculos KPI
- `dados_brutos (tipo_id, area, data DESC)` · agregar_dado
- `batismo_inscricoes (data_batismo DESC) WHERE status='realizado'`
- `mem_trilha_valores (membro_id, etapa) WHERE concluida=true`

### Paginacao server-side

- `/admin/cruzamentos` · 100 pessoas por pagina, controles Anterior/Proxima
- `POST /api/jornada/cruzar` aceita `{ criterios, limit, offset }`

### Proximos passos quando crescer (10k+ → 25k+)

- **Read replica do Supabase** · alivia leitura pesada
- **Particionamento de mem_contribuicoes por ano** · cresce ~600k/ano
- **Lazy load de KPIs por area** em `useKpis` (hoje cache global)
- **Server-side pagination no /membresia** (hoje carrega tudo)

## Solicitacoes · backbone administrativo (CONTEXTO PARA MATHEUS)

Em 2026-05-12 Marcos definiu que Solicitacoes vira a **fonte unica de
dados** dos KPIs administrativos. Toda interacao adm <-> ministerio passa
por la (sem WhatsApp, sem planilha). Isso viabiliza KPIs 100% automaticos
de SLA, NPS, throughput e urgencia frequente.

### O que ja foi feito

**Schema** (migration `20260512130000_solicitacoes_backbone_reset.sql`):
- Enum `area_adm_resp` · 8 areas (reserva_espaco, cozinha, manutencao,
  logistica_estoque, logistica_compras, ti, rh, financeiro)
- Enum `area_kpi` · 6 areas de culto (kids/ami/bridge/sede/online/cba)
- Tabela `sla_definicoes` · 24 prazos seedados (validados com Marcos)
- Tabela `area_alcadas` · limite R$1000 default por area
- Tabela `solicitacoes_eventos` · audit log completo
- Triggers automaticos: calcula SLA, decide aprovacao financeira por
  alcada, loga transicoes, auto-preenche respondido_em/concluido_em
- Views `vw_solicitacoes_sla` e `vw_reserva_espacos`

**UI parcial** (PR #333):
- Form com area_cliente, eh_urgente + justificativa, bloco reserva_espaco
  (espaco/data/horario/qtde), data_necessaria, badge SLA em tempo real
- Backend POST/PATCH aceita os campos novos
- Rotas `/sla-defs`, `/reservas-espaco`, `/alcadas`

### O que falta · pendente para Matheus avaliar/testar e refinar

Marcos pediu pra nao se aprofundar mais agora · Matheus testa depois e
decide o que melhorar. Lista priorizada:

1. **NPS pos-conclusao** (alta prioridade)
   - Campos `nps_nota` + `nps_comentario` ja existem
   - Falta UI: quando solicitante ve solicitacao 'concluida', modal
     pergunta "Como avalia? (0-10)" + comentario opcional
   - Sem isso, KPI cultural de NPS interno fica zerado

2. **Visualizacao de SLA nos cards do kanban**
   - View `vw_solicitacoes_sla` retorna `sla_resposta_status`,
     `sla_resolucao_status`, `horas_para_resposta`, `horas_total`
   - So precisa renderizar badge "atrasado Xh" / "no prazo" nos cards

3. **Kanban com novos status**
   - Schema adicionou: aguardando_aprovacao_financeira, em_atendimento,
     aguardando_entrega, avaliado
   - Avaliar: agrupar visualmente ou adicionar colunas extras

4. **Aprovacao financeira no fluxo**
   - Quando `precisa_aprovacao_financeira=true`, solicitacao deveria ir
     pra status `aguardando_aprovacao_financeira` antes do responsavel
     da area pegar. Hoje vai direto pra 'pendente'

5. **Painel solicitante separado do responsavel**
   - Hoje mesma pagina (filtrado backend). Solicitante quer "minhas
     pendencias com SLA". Responsavel quer "fila por urgencia + SLA
     estourando primeiro"

6. **Calendario visual de reservas de espaco**
   - Endpoint `/reservas-espaco` ja retorna
   - Falta UI calendario mensal com conflitos destacados

7. **Dashboard de urgencia frequente**
   - Marcos: "o sistema mapeia quem solicita urgencia frequente"
   - Top 10 solicitantes urgentes do trimestre · acao pastoral
     (geralmente sintoma de planejamento ruim, nao crise real)

8. **Notificacoes especificas**
   - Status muda de pendente -> em_atendimento: avisa solicitante
   - SLA pra estourar (24h antes): avisa responsavel

### Pontos de atencao tecnica

- `vw_solicitacoes_sla` e view regular, NAO materializada. Se volume
  crescer (>10k solicitacoes/ano), considerar materializar
- Trigger `tg_solicitacoes_calcula_sla` so calcula SLA quando
  `area_responsavel` esta preenchida. Backend ja auto-mapeia via
  `CATEGORIA_TO_AREA_RESP` mas SQL puro pode escapar
- `area_alcadas` esta em R$1000 default · Marcos pode ajustar por area
  depois (CBA grande gasta mais que Online pequeno)
