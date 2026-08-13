# CLAUDE-LEGADO.md · arquivo histórico do CLAUDE.md

> **Este arquivo NÃO é referência viva e NÃO é carregado por sessão.**
> Ele preserva, verbatim, as seções do `CLAUDE.md` que foram condensadas ou
> aposentadas na auditoria de contexto de **2026-06-10** — diários de
> implementação de módulos já consolidados, ondas de migration concluídas,
> pendências resolvidas e planos nunca implementados. Serve como time-lapse da
> evolução do sistema e como registro de decisões que mudaram (pra não repetir
> o mesmo erro). O estado atual e as regras vigentes estão SEMPRE no
> `CLAUDE.md` da raiz — em caso de conflito, o `CLAUDE.md` vence.

As seções abaixo seguem a ordem em que estavam no arquivo original.

---

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


---

# Condensação de 2026-08-12 · texto integral das seções esfriadas

Movido do `CLAUDE.md` pela regra de manutenção do próprio arquivo ("quando o
assunto esfria, condensar pra estado final + decisões + lições e mover o texto
longo pro legado"). **Isto NÃO é referência viva** — as leis, o estado atual e as
lições de cada uma destas seções continuam no `CLAUDE.md`, em forma condensada.
O que está aqui é a narrativa de implementação (medições da época, diários de PR,
ondas concluídas), guardada só pra arqueologia de decisão.

## [movido] ⚠️ Contrato de Inscrição · toda porta pública de inscrição (F3.1 · 2026-07-28)

## ⚠️ Contrato de Inscrição · toda porta pública de inscrição (F3.1 · 2026-07-28)

Decisão do Marcos (specs completas em `docs/modulo-inscricoes/fase1-unificacao.md`
e `fase2-specs.md` · decisões D1–D9 + ajuste 28/07): as 7 portas de inscrição
(batismo, apresentação, grupos, líderes, next, voluntariado, eventos externos)
convergem pro mesmo contrato de campos padrão — **nome completo em campo único
sem abreviação** (split 1º token→nome, resto→sobrenome onde a tabela exige) ·
**telefone 10–11 dígitos** digits-only · **CPF com DV** · **e-mail** ·
**nascimento validado** · **sexo obrigatório (`masculino|feminino`, NUNCA
"outro")** · **endereço fixo-opcional** · **termos LGPD com snapshot** ·
**opt-in WhatsApp explícito default false**. Regras valem SÓ para inscrições
novas — **dado legado nunca é alterado nem re-validado** (inscrições antigas do
Celebra com só nome+telefone continuam válidas para sempre).

- **Usar SEMPRE** `backend/services/inscricaoContrato.js` (validações,
  `processarIdentidade` = matcher+observação, `registrarConsentimentos`,
  textos canônicos) e `src/lib/inscricao.js` (máscaras/validações client).
  NÃO recriar cópias locais de máscara/CPF — era assim que divergia.
- **Consentimentos** vão para a tabela `inscricao_consentimentos`
  (migration `20260728121000` · append-only via backend · tipos: termos_lgpd,
  imagem, menor_responsavel, whatsapp). O ESTADO do opt-in continua nas
  colunas `whatsapp_optin/_em` de cada tabela.
- Rollout F3.1 **CONCLUÍDO (2026-07-28)**: eventos externos ✅ apresentação ✅
  líderes ✅ voluntariado ✅ next ✅ batismo ✅ **grupos ✅** — as 7 portas no
  contrato. Plano de migração + bugs: `docs/modulo-inscricoes/`. Próximas
  fases: **M6b** (whitelist soft-delete de vol_inscricoes + contadores SQL) e
  **F3.2** (espinha `inscricoes` + módulo /inscricoes + migração do ext —
  specs em `docs/modulo-inscricoes/fase2-specs.md`).
- **F3.2 · PR 1 — ESPINHA criada (2026-07-28 · migration `20260729000100`):**
  6 tabelas novas (`insc_series` recorrência/edições · `insc_eventos` ·
  `inscricoes` tronco · `insc_pagamentos` sem deleted_at, financeiro não se
  apaga · `insc_checkins` · `insc_sorteios`) + RLS por
  `current_user_module_level('inscricoes')` (slug entra no catálogo na PR do
  módulo — até lá só service_role/super-admin) + audit de PII em
  inscricoes/pagamentos + whitelist soft-delete (series/eventos/inscricoes).
  `chk_inscricoes_contrato`: completude do contrato exigida SÓ quando
  `legado_fonte IS NULL` — linha migrada do Celebra (nome+telefone) entra
  intacta. **NADA consome ainda** — UI/página pública nas PRs seguintes.
- **F3.2 · PR 2 — MÓDULO `/inscricoes` no ar (2026-07-28 · migration
  `20260729010000` = catálogo+matriz seed de eventos-externos):** abas
  **Calendário** (home) e **Eventos** (cards + form-builder com o bloco dos
  campos padrão TRAVADOS + "Adicionar campo" com key opaca + **"Nova edição"**
  — evento avulso vira série na hora; série gera edição com rótulo
  YYYY-MM/YYYY); área OBRIGATÓRIA validada contra o catálogo `areas`;
  eventos nascem em **rascunho**. Abas Todas/Pessoas/Dashboard visíveis
  desabilitadas ("próximas entregas"). Backend `routes/inscricoes.js`
  (authorizeModule 'inscricoes'; DELETE=nível 4 via app_soft_delete).
- **F3.2 · PR 3 — página pública da espinha (2026-07-28 · SEM migration):**
  `/evento/:slug` virou **FONTE DUPLA** em `publicEventoExterno.js` — resolve
  PRIMEIRO na espinha (insc_eventos `publicado`; rascunho/arquivado = 404;
  encerrado mostra "encerradas") e cai no ext quando o slug não existe lá →
  **QRs antigos do Celebra intactos, eventos novos no mesmo endereço**.
  Espinha inscreve com o contrato pleno: dedup por (evento,cpf) com merge
  preservador (re-inscrição reativa cancelada), vagas contadas, número da
  sorte SÓ quando tem_sorteio, matcher read-only (`inscricoes_formulario`) +
  consentimentos porta `inscricoes`, notificação módulo `inscricoes`.
  **Evento `pagamento_ativo` NÃO abre** até o Pix (F3.3) — aviso na página.
  Publicar no /inscricoes agora EXPÕE o formulário; botão de copiar link nos
  cards; banner de transição no /eventos-externos. Falta da SPEC-04: backfill
  ext→espinha com contagens (próxima PR, com validação do Marcos).
- **F3.2 · form público no modelo do Grupos (2026-07-28 · SEM migration):**
  `EventoExterno.tsx` reescrito no layout do InscricaoGrupos — campos em
  CAIXA (label em cima, fonte 16 anti-zoom iOS), grid lado a lado
  (auto-fit 220px), cartão 720px, container 100dvh + margin:auto (fix
  iPhone). Itens largos (textarea/pills/rede/imagem) ocupam a linha toda
  (`gridColumn 1/-1`). ZERO mudança de lógica — validações/consentimentos/
  payload/honeypot idênticos; vale pras DUAS fontes (espinha + ext).
  Dados de teste do Marcos (evento "teste" + inscrição + série) soft-
  deletados a pedido em 28/07.
- **F3.2 · PR 4 — feedback do teste do Marcos (2026-07-28 · migration
  20260729020000):** aba Eventos AGRUPADA — série recorrente = **1 card**
  ("um quadrado Next") que abre modal com TODAS as edições dentro (Publicar/
  link/Editar por edição + Duplicar evento) — nunca 1 card por edição.
  `insc_series.recorre_ate` (DATE, informativo: "mensal até X") — setável na
  criação e editável no modal da série (PUT /series/:id nível 3). Botão
  **Publicar de 1 clique** (card avulso + linha da edição) — resolve o
  "Evento não encontrado" (evento nasce rascunho; copiar link de rascunho
  agora avisa em toast). GET /areas **colapsa áreas administrativas** numa
  opção única "Administração" (regex nome área/setor: RH, Patrimônio, T.I.,
  Financeiro…; `areaValida` aceita); áreas de culto/ministeriais seguem
  individuais. Máscara de hora hh:mm no modal ("1930"→"19:30"). "Nova
  edição"→"Duplicar evento". Abas Todas/Pessoas/Dashboard seguem
  desabilitadas por design (próximas entregas).
- **F3.2 · PR 5 — detalhe do evento da espinha (2026-07-28 · SEM migration):**
  página `/inscricoes/evento/:id` (`InscricaoEventoDetalhe.tsx` · adaptação da
  tela do Eventos Externos, MESMA UX: roleta animada, prêmio a prêmio,
  inscritos expansíveis, edição de inscrição com `dados` MESCLADO) plugada na
  espinha + o que ela tem a mais: badge de status + **Publicar** no cabeçalho,
  **cancelar/reativar inscrição** (status confirmada|cancelada — 'recebida' é
  exclusiva do fluxo de pagamento), **exportar CSV** (só com `pode_exportar`
  da matriz; separador `;` + BOM pro Excel). Backend novo em
  `routes/inscricoes.js`: `POST /eventos/:id/sortear` (pool = ativas
  não-canceladas COM número da sorte; exclui já sorteados; `permitir_repetir`),
  `PATCH/DELETE /eventos/:id/inscricoes/:inscricaoId` (merge preservador /
  app_soft_delete nível 3), `GET /eventos/:id` agora embute `sorteios`, lista
  de inscritos agora traz `dados`. Cards avulsos e edições da série linkam pro
  detalhe. **Pré-requisito da virada do Celebra** (a operação do dia 29/08 —
  conferir inscritos + sortear no palco — passa a existir no módulo novo).
- **F3.2 · PR 7 — as 3 abas finais do /inscricoes (2026-07-28 · migration
  `20260729050000` = `vw_inscricoes_unificadas`):** módulo COMPLETO nas 5 abas.
  A view (M9 da F1 + SPEC-03/09/10) é UNION ALL das **10 fontes** (espinha,
  ext residual pós-virada via `NOT EXISTS legado_ref`, batismo, apresentação
  ×2, grupos, líderes, next matrículas, next legado, voluntariado) com
  **ontologia canônica de 7 estados** (CASE por porta · original preservado em
  `status_original`), normalizações SÓ na leitura, **área derivada por porta**
  (`fn_insc_area_display`), **séries DERIVADAS do SPEC-10 tempo 1**
  (`serie_chave`/`edicao_rotulo`: batismo/apresentação = mensal, next = turma,
  grupos = temporada), `compareceu` (check-in por porta mensurável) e
  `evento_data`. **REVOKE anon/authenticated** — acesso só via backend.
  Endpoints em routes/inscricoes.js: `GET /unificadas` (busca única
  nome/CPF/telefone + filtros porta/status/área/período, paginação
  server-side, `escapePostgrestValue` na busca), `GET /unificadas/pessoas`
  (rollup por pessoa · âncora membro_id>CPF>telefone>nome · **nível ≥2** ·
  default só 2+ inscrições) e `GET /unificadas/dashboard` (cards SPEC-09 +
  série diária BRT + comparador edição×edição + ranking + por porta;
  arrecadação lê `insc_pagamentos` pagos — nasce 0 e acorda com o Pix).
  Abas: `InscricoesTodas.tsx` (tabela + export CSV gated `pode_exportar`),
  `InscricoesPessoas.tsx` (chips por inscrição + link Membresia; "sem
  cadastro" aponta Entradas), `InscricoesDashboard.tsx` (stat tiles + área/
  barras hue único da casa via `gradFill`, 1 eixo, labels seletivos).
- **F3.2 · PR 6 — VIRADA do Eventos Externos pra espinha (2026-07-28 ·
  migration `20260729040000` + script):** decisão do Marcos (checkpoint 28/07):
  virada completa AGORA — o ext só tinha os 2 eventos do Celebra 2026, ambos
  AO VIVO (85+15 inscrições, sorteio no palco 29/08), nenhum histórico
  encerrado. Migration = `legado_ref/legado_fonte` em `insc_eventos` + UNIQUEs
  parciais de idempotência nas duas tabelas. Script
  `backend/scripts/_migrar_ext_espinha.cjs` (dry-run default · `--exec` ·
  `--verificar`): copia eventos como RASCUNHO (área "Sede" — decisão Marcos) →
  inscrições com id/created_at/nº da sorte/dados/soft-delete preservados →
  verificação PRÉ-flip (aborta se contagem divergir) → **FLIP
  rascunho→publicado = a virada** (fonte dupla passa a servir a espinha no
  MESMO /evento/:slug; QRs intactos) → catch-up da janela → verificação FINAL
  (SPEC-04 §3: contagens por evento + amostra 20 campo a campo + sorteios).
  **ROLLBACK = soft-delete dos eventos migrados na espinha** (público volta ao
  ext na hora). Junto: rota `/eventos-externos*` → redirect `/inscricoes`,
  item saiu do menu (AppShell), **escrita nas rotas `/api/eventos-externos`
  → 410** (leitura fica pra conferência; arquivos EventosExternos*.tsx ficam
  no repo até 1 ciclo sem divergência — rollback = restaurar 2 rotas).
  ext_* NÃO é dropado (SPEC-04 §4).
- **F3.4 · SPEC-06 — CHECK-IN QR (2026-07-28 · SEM migration):** comprovante
  com QR na tela de sucesso + tela de check-in do dia (operação do Celebra
  29/08). **Token ASSINADO em vez de coluna nova** — HMAC-SHA256 do id da
  inscrição (`services/inscricaoComprovante.js` · segredo = `INSC_QR_SECRET`
  opcional com fallback no `CRON_SECRET`; sem segredo é fail-closed, NUNCA
  literal — lição do MEM_QR_SALT); vale retroativo pras ~100 inscrições
  migradas do Celebra sem backfill. O QR codifica a URL pública `/i/c/<token>`
  (`InscricaoComprovante.tsx` — a pessoa reabre quando quiser; portaria
  escaneia o MESMO QR). Token aparece na tela de sucesso do form (fonte
  espinha), na re-inscrição e — evento pago — na tela `/pagamento/:token` SÓ
  com `pago` do servidor. Tela `/inscricoes/evento/:id/checkin`
  (`InscricaoEventoCheckin.tsx` · nível 2 = operar check-in, SPEC-08): leitura
  de QR CONTÍNUA (html5-qrcode; a do voluntariado para no 1º scan), busca por
  nome local + **CPF/telefone server-side** (`/checkin/buscar` — CPF não viaja
  na lista, mesma régua do detalhe), contadores ao vivo (polling 15s),
  "Inscrever na hora" = form público (mesma validação), tela cheia via
  Fullscreen API. Backend em routes/inscricoes.js: GET/POST
  `/eventos/:id/checkin` + DELETE desfazer — **duplo check-in AVISADO** (23505
  do UNIQUE vira `ja_checkin` com hora, não erro); `cancelada` bloqueia;
  **`recebida` (pago pendente) só entra com `confirmar_pendente`** = decisão
  de quem está na porta, auditada pelo `por`; comprovante de OUTRO evento é
  erro distinto (diz qual). POST exige `checkin_ativo` (botão Ativar na tela ·
  PUT nível 3). Marcar check-in acorda sozinho o card de comparecimento do
  dashboard (`compareceu` da view unificada já media).
- **F3.4 · SPEC-07 — confirmação WhatsApp da espinha (2026-07-28 · SEM
  migration):** `services/inscricaoWhatsapp.js` → fila `whatsapp_envios`
  (retry/backoff · falha TERMINAL avisa gente; contexto `inscricoes.confirmacao`
  roteia o aviso pro módulo). **Regras: opt-in D4 é lei (sem
  `whatsapp_optin=true` NÃO envia) · kill-switch = env
  `WHATSAPP_TEMPLATE_INSCRICAO_EVENTO` (vazia = no-op gracioso, padrão
  notificarMembro) · dispara SÓ em transição real** — evento gratuito: inscrição
  NOVA na porta pública (nasce confirmada); evento pago: dentro do gate
  `confirmouAgora` do handler `pagamentos/handlers/inscricao.js`
  (recebida→confirmada — reentrega de webhook não reenvia). Re-inscrição/merge
  NÃO reenvia (fila sem dedup por contexto — re-escaneada de QR viraria spam).
  Mensagem: {{1}} 1º nome · {{2}} evento · {{3}} data/hora · {{4}} **link do
  comprovante /i/c/<token> como variável de body** (técnica do
  grupos_renovacao_temporada). **PRA ATIVAR: criar template UTILITY pt_BR
  `inscricao_evento_confirmacao` na Meta** ("Oi {{1}}! Sua inscrição no {{2}}
  está confirmada. 📅 {{3}} · Seu comprovante (apresente na entrada): {{4}}") **e
  setar o NOME na env** — até lá tudo no-op. A notificação interna de nova
  inscrição (bullet 1 da spec) já existia desde a PR 3; espelhos read-only =
  F3.5.
- **Portas públicas do sistema na aba Eventos (2026-07-28 · SEM migration ·
  pedido do Marcos):** o cérebro de inscrições mostra TODAS as portas públicas,
  não só a espinha — **1 card por porta** (grupos, líderes, next, batismo,
  apresentação, voluntariado; decisão do Marcos: detalhe no MODAL, senão a
  lista explode — mesmo racional do card de série). `GET /inscricoes/portas`
  (nível 1): catálogo `PORTAS_SISTEMA` no código (link público, módulo dono,
  rota de gestão) + contagens/edições da view unificada (séries derivadas
  SPEC-10 t1 = temporada/turma/mês) + aberto/fechado BEST-EFFORT (grupos =
  `mem_temporadas.inscricoes_abertas` · next = `next_turmas.status='aberta'` ·
  demais = contínuas; falha → null, nunca 500). Modal
  (`InscricoesPortas.tsx`): status, link + copiar + QR, inscrições 30d/total,
  edições recentes, botão "Gerenciar no módulo". **⚠️ INVENTÁRIO 100%
  somente-leitura — nenhuma escrita por aqui, NEM super-admin** (cada porta tem
  lógica-satélite no módulo dono: broadcast de temporada, turma do totem, 4º
  domingo; segundo caminho de escrita antes da F3.5 é a classe de bug que o
  desenho evita — "operar daqui" chega com a F3.5/SPEC-10 t2, quando o card
  migra de seção). Marcos validou o formato em 28/07.
- **Porta 7 · Grupos (2026-07-28 · migration `20260728235000` = M5):** e-mail
  obrigatório (D2) + anti-abreviação + endereço opcional (vai pro cadastro
  pendente, nunca sobrescreve membro) no form recém-lançado (toque mínimo);
  telefone passa a gravar **digits-only** no pedido e no cadastro (legado
  backfillado com BACKUP em `_bk_20260728_grupo_pedidos_telefone`;
  `contato_divergente` não muda — já normalizava os 2 lados); termos+optin na
  satélite (porta `grupos`, snapshot = texto exibido); **CHECK de origem
  ganhou app|totem|mapa → DESTRAVOU o fanout do app** (validado: preenche
  membro_id ⇒ XOR ok; limitação: pedido via app não dispara WhatsApp pro
  líder — é trigger SQL; follow-up do módulo de Comunicação).
- **Porta 6 · Batismo (2026-07-28 · SEM migration — a tabela já tinha tudo):**
  nome vira campo único (split no server, tolera payload antigo); nascimento
  ganhou validação real e o rótulo "(opcional)" mentiroso caiu; **sexo
  obrigatório** (form manda canônico, server segue gravando `M/F`); **termos
  LGPD + CONSENTIMENTO DE IMAGEM** (fotos da cerimônia — pré-requisito de
  fotos→marketing da revisão estrutural) + optin na satélite; `GET /textos`;
  **honeypot agora ponta-a-ponta** (front envia `website`, server trata);
  **resposta `duplicado:true` agora é EXIBIDA** (antes o front mostrava
  "Inscrição confirmada!" pra quem já estava inscrito); fix de fuso no
  `proximoQuartoDomingoISO` (formato local, não UTC); horário obrigatório no
  submit quando há horários; `status='rejeitado'` segue FORA do CHECK
  (referências defensivas no código são vocabulário morto — não legalizar).

---

## [movido] Sweep dos formulários de inscrição · achados e correções (2026-07-28)

## Sweep dos formulários de inscrição · achados e correções (2026-07-28)

Auditoria multi-agente das 7 portas pós-módulo de inscrições (pedido do
Marcos). Relatório completo ficou na conversa; aqui o que virou código e o
que segue pendente:

- **Fix TDZ (reporte do Ariel · PR #2113):** a aba /ministerial/voluntariado/
  inscricoes quebrava com "Cannot access 'R' before initialization" — o
  `useMemo` de `interessesPessoa` (PR #2073) referenciava
  `areasDirecionamento` declarado 104 linhas abaixo. Bloco movido pra cima.
  ⚠️ Lição: array de deps de hook avalia NO RENDER — const usada em
  useMemo/useQuery precisa estar declarada ANTES. Verificador determinístico:
  `npx tsc -p tsconfig.app.json --noEmit` e filtrar TS2448/TS2454 (o
  `npx tsc --noEmit` cru NÃO checa nada — o tsconfig raiz é só references).
  Mesmo padrão latente: `publicNext.js` usa `turmaAbertaAtual()` antes da
  declaração (salvo por hoisting de `async function` — NÃO converter pra
  arrow const sem mover).
- **P0 Celebra (PR #2115):** dedup da espinha com fallback por telefone p/
  linha migrada sem CPF (guarda `nomesMesmaPessoa`); merge enriquece a linha
  legada; GET /:slug com try/catch + RPC de vagas best-effort fail-open;
  corrida devolve o nº da sorte; front esconde nº vazio e SEMPRE avisa
  re-inscrição.
- **P0 segurança de menor (PR desta seção):** form público de apresentação
  grava `kids_responsaveis` com **autorizado_buscar: false SEMPRE** (o
  default true da coluna dava vínculo de RETIRADA de criança a qualquer um
  com CPF válido + nome/nascimento de criança cadastrada — a lei do vínculo
  documentado vale pra TODA porta pública); consentimento de menor (art. 14)
  saiu de dentro do `.then()` do matcher (falha de identidade não apaga mais
  a prova legal); "exige dados de menor" no voluntariado virou a MESMA união
  nos dois lados (flag `exige_dados_menor` das opções marcadas ∪ área
  kids/bridge) — critérios divergentes davam form insubmissível ou
  antecedentes prometidos sem triagem aberta.
- **P1 FEITO (PR da onda 2 · migration `20260729070000`):** CHECK de
  `vol_inscricoes.status` += 'desistente' (bloco descobre o nome real do
  CHECK inline no catálogo antes de dropar); `ja_inscritas` EXIBIDA na
  apresentação (0 criadas + já inscritas = erro claro, não sucesso falso) e
  `ja_inscrito` no voluntariado (título/mensagem do server); **renovação de
  grupos passou a gravar**: enriquecimento e opt-in subiram pra ANTES do
  dedup e a resposta de renovação registra os termos na satélite (refId =
  vínculo ativo ou pedido pendente); **opt-in propagado na aprovação**
  (aprovarPedidoCore + promoverInscricaoLider: cadastro pendente com optin
  liga o membro promovido — só liga, nunca desliga) + estado persistido no
  membro na apresentação (padrão batismo); `TEXTOS.whatsapp` criado no
  inscricaoContrato (snapshot do consentimento de WhatsApp gravava VAZIO nas
  7 portas); template de confirmação de grupos GATED pelo opt-in (D4) +
  AVISO_OPTIN exibido no form quando desmarcado.
- **P2 FEITO (PR da onda 3):** batismo/apresentação/voluntariado/next saíram
  do `publicLimiter` 30/15min (mounts antes dele no server.js, padrão
  NPS/grupos/eventos) — cada router ganhou limiter próprio generoso
  (600/15min · env `PUBLIC_FORM_RATE_LIMIT_MAX`); o Next trocou o 10/min do
  router inteiro (que dava 429 no TOTEM de check-in na 10ª marcação) pelo
  generoso; estritos de 10/15min ficaram SÓ no probing (vol lookup-cpf/
  request-login/register · batismo GET /acesso). ⚠️ Limiter no `router.use` E
  na rota = conta 2× (mesma instância) — os POSTs perderam o middleware
  por-rota por isso. Bomba de hoisting do publicNext desarmada
  (`turmaAbertaAtual` declarada antes do 1º uso, com comentário-guarda).
- **P3-crítico FEITO (PR do totem de bebês):** a porta
  `membresia.js POST /totem/apresentacao-bebe` entrou no contrato — nome
  completo do bebê sem abreviação, `validarNascimento` real, **sexo
  obrigatório** (aceita M/F e canônico, grava M/F; opção "Outro" saiu da
  tela), **dedup no POST** (bebê+telefone+cerimônia → 409), **consentimento
  de MENOR obrigatório** (checkbox no TotemMembro com o texto canônico do
  `GET /textos` da apresentação + `registrarConsentimentos` na satélite,
  porta 'apresentacao').
- **P3-refactor FEITO (2026-07-28 · SEM migration · comportamento preservado):**
  (1) **cpfValido/emailValido viraram imports de `inscricaoContrato`** nas 4
  portas (batismo/vol/next/grupos) — as cópias locais eram idênticas ao
  canônico (conferido lado a lado antes de trocar), então a troca é
  zero-diff; `emailValido` foi EXPORTADO do contrato (regex única, sem
  normalizar — quem normaliza é validarCamposPadrao) e o próprio
  validarCamposPadrao passou a usá-lo. ⚠️ Decisão de escopo: NÃO migramos os
  handlers inteiros pra `validarCamposPadrao` — portas vivas com mensagens/
  fluxos próprios; o risco do sweep era a CÓPIA divergir, e o import resolve.
  `publicMembresia.js` entrou no mesmo padrão no follow-up (PR seguinte, 28/07
  — porta de PESSOA, mesma troca zero-diff; grandfathering de CPF legado
  intocado nos call sites). Cópia que FICOU: `publicDevocional.js` (módulo do
  Matheus — não mexer sem alinhar). ⚠️ Segue vivo o follow-up de 18/07:
  `utils/cpf` é uma 2ª fonte (o membresia.js autenticado usa; o
  `normalizarCpf` de lá NÃO valida DV) — consolidar exige sessão própria. (2) tipo `data` do form-builder ganhou DatePicker no
  form público (gravava texto livre em qualquer formato). (3) **QR com
  `?temporada=` antiga não vence mais a aberta**: InscricaoGrupos valida o
  param contra `inscricoes_abertas` e IGNORA temporada fechada (QR impresso
  vive pra sempre — lição da virada); falha na consulta mantém o
  comportamento antigo. (4) **endereço de grupos deixou de ser write-only**:
  aprovarPedidoCore + promoverInscricaoLider agora copiam `endereco` do
  cadastro pendente pro membro SÓ-ONDE-VAZIO (junto de foto/sexo/nascimento);
  o descarte pra membro EXISTENTE permanece por decisão de 28/07 (endereço de
  membro muda na Membresia, não por form de grupo). (5) e2e do Next
  atualizado pro contrato (#nome_completo/CPF válido gerado/BirthDatePicker/
  sexo/motivo/termos — os seletores #nome/#sobrenome estavam mortos); ⚠️ e2e
  não foi EXECUTADO nesta entrega (exige app rodando + cria inscrição real).

---

## [movido] Auditoria do sistema (2026-06-08) · correção dos 4 CRÍTICOS

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

---

## [movido] ⚠️ Grupos · auditoria pré-abertura + 5 correções (2026-07-31 · PR #2209 · SEM migration)

## ⚠️ Grupos · auditoria pré-abertura + 5 correções (2026-07-31 · PR #2209 · SEM migration)

Pedido do Marcos na véspera ("rode agentes para checar tudo no módulo, pois é
domingo que vamos abrir de fato essas inscrições"). 5 agentes em lentes distintas
(porta pública · WhatsApp · aprovação · dados de produção · busca/features), cada
achado **reconferido contra o banco vivo antes de virar código** — dois se
dissolveram na verificação. Corrigido:

1. **⚠️ O aviso ao líder podia NÃO SAIR — e não saiu em 30/07.** O bloco de
   notificação rodava em `(async () => {…})()` **sem await**, com o `res.json()`
   logo depois: em serverless o container congela ao responder e o trabalho
   pendente é descartado. Prova: dos 3 pedidos pendentes, o do Bruno (30/07
   22:28) tem **0 envios e 0 notificações** — a líder Jane não recebeu NADA em
   toda a tabela, com telefone válido. Agora o WhatsApp ao líder é **AWAITED e
   vem PRIMEIRO** (era o 4º passo, atrás de um `notificar()` que sem regra
   configurada escreve pra 16 admins ≈ 32 round-trips). Enfileirar é 1 INSERT,
   então o custo em latência é baixo. A notificação in-app segue fire-and-forget
   de propósito — a coordenação tem a Caixa de entrada como caminho garantido.
   **Regra que fica: em porta pública serverless, o que não pode se perder vai
   awaited; fire-and-forget só pro que tem caminho alternativo.**
2. **⚠️ Telefone colado com "+55" gravava número inexistente.** A máscara
   truncava em 11 dígitos **ANTES** de normalizar o prefixo (o bug era a ORDEM,
   não a ausência da normalização): `"+55 21 99999-8888"` → `55219999988`, que
   passa nas duas validações. **15 cadastros em produção** nesse padrão,
   incluindo o `55219969835` do "carlos" da Barra — mesma classe do incidente de
   26/07. Helper único `tirarCodigoPais` (`src/lib/inscricao.js` + espelho
   `tirarCodigoPaisTelefone` no `inscricaoContrato.js`), aplicado na máscara, na
   validação e **nos 2 pontos de gravação** do `publicGrupos.js` (o `telDigitos`
   lia o body cru — corrigir só a validação não bastava).
   ⚠️⚠️ **DDD 55 é Santa Maria/RS**: só remove o `55` quando o resto AINDA é
   telefone completo (12–13 dígitos). `replace(/^55/,'')` destruiria todo número
   legítimo de lá. `src/test/telefoneCodigoPais.test.ts` é **mutation-testado**
   contra exatamente essa simplificação.
3. **Mensagem de aprovação ignorava o opt-in (LGPD).** `notificarPessoaAprovada`
   era a ÚNICA do fluxo sem gate — e é a mais comum. 3 pessoas reais que
   marcaram "não quero" receberam (Ester Lima, Michele Jeane, Douglas Ferreira),
   contra o texto do próprio formulário. O opt-in efetivo é lido do membro
   promovido (ou do cadastro pendente) **no ponto do envio**, não de variável de
   escopo anterior — que muda conforme o caminho da aprovação.
4. **Teto de requisições 1.000 → 10.000 por IP** (igual ao NPS, que calibrou com
   multidão real): no culto a igreja sai por UM IP (subsolo sem 4G) e cada pessoa
   gasta ~4 requisições ⇒ 1.000 dava ~250 pessoas/15min. E o **429 aparecia como
   "Nenhum grupo encontrado com esses filtros"** (`if (!r.ok) return []` no
   `api.js`) — a pessoa concluiria que os grupos acabaram. Agora propaga com
   mensagem própria e o `GrupoSelector` mostra o erro + **"Tentar de novo"**;
   **erro vem ANTES do vazio na renderização**, nunca disfarçado dele.
5. **A fila da coordenação mostrava pedido apagado.** `/pedidos/list` e as 2
   contagens do badge não filtravam `deleted_at` — 16 soft-deletados da limpeza
   de 17/07, e os cards de resumo somam a lista no cliente. Latente pior: um
   PENDENTE apagado apareceria **clicável** e aprovar devolveria 404 seco
   (`aprovarPedidoCore` filtra).

**Reparos de DADO aplicados no mesmo dia** (backup em
`scratchpad/backup_reparo_prelancamento.json` · script `reparo_prelancamento.js`
com dry-run por padrão):
- **Telefone da Thatianna Almeida Lage** `996969257` → `21996969257`. Era
  **regressão da consolidação de 30/07** (o merge manteve o registro truncado).
  Só escrevi porque havia **3 evidências independentes**: envio a esse número em
  28/07 com `delivered_at` E `read_at`; `mem_merge_log` "Consolidacao
  Tathiana/Thatianna Almeida"; e um 3º cadastro vivo (`610fa1a4` "Tathiana
  Case") com o número completo — que **segue como duplicata a consolidar**.
- **11 opt-ins restaurados** (a pessoa marcou "quero receber" e a promoção
  pré-fix de 28/07 não propagava). ⚠️ O match exige **telefone + NOME**: minha
  1ª versão casava só por telefone e teria ligado consentimento de quem não
  pediu (família compartilha número) — a lei "telefone sozinho nunca identifica"
  vale também pra reparo de dado.
- **8 bairros unificados** (o filtro público compara `.eq` exato): `BARRA DA
  TIJUCA` era 19+5 em duas grafias → **24 num valor só**; `RECREIO` idem; e o
  typo real `RIO DE JANEIRP/RJ` corrigido. Régua: variante MAIS FREQUENTE vence.

⚠️ **ABERTO na véspera** (não é código): **DESIREE CASTELO PESSANHA** (líder do
CURSO ALIANÇA, grupo de casais) segue com telefone de 9 dígitos `996013179` —
**não há evidência do número real**, então NÃO inventei DDD; precisa confirmar
com ela. **Teto da Meta = TIER_250** (250 destinatários únicos/24h · qualidade
GREEN): cada inscrição gasta 2 (líder + pessoa) ⇒ **~125 inscrições/dia**, e
decisão do Marcos foi gastar os 250 no domingo, com o excedente saindo segunda
pelo retry da fila. **Falha de entrega reportada pela Meta (`failed` no webhook)
não avisa ninguém** e não há como **reenviar o link ao líder** (o token vale 7
dias): os dois viram trabalho pós-domingo.

### ✅ Geocodificação dos 13 presenciais FEITA (2026-07-31 · só dado, sem código)

Os 13 grupos presenciais sem `lat/lng` foram geocodificados (autorizado pelo
Marcos na véspera). Estado atual: **87 ativos = 55 com coordenada + 32 sem, e os
32 são TODOS online** — nenhum grupo presencial fica de fora da visão Mapa.
Script `scratchpad/geo_grupos.js` (dry-run por padrão · backup do estado anterior
em `backup_geo_grupos.json`) replica FIELMENTE a lógica do
`POST /api/grupos/geocode-batch`: mesma ordem de tentativas (CEP via ViaCEP →
texto do endereço → **centróide do bairro**), mesmo guard `inRJ`, mesmo atalho de
coordenada fixa da sede, e o `sleep(1100)` da política de 1 req/s do Nominatim.
Resultado: 6 por `texto_endereco` · 6 por `bairro` · 1 tratado à parte.

⚠️ **Grupo online NÃO é identificado por coluna `modalidade` — ela não existe.** A
régua real (grupos.js:3779) é `bairro === 'Online'` OU `local` contendo "online".
Quem escrever rotina nova de endereço precisa usar essa, senão vai "consertar"
grupo online que está certo do jeito que está.

⚠️ **6 dos 13 caíram em CENTRÓIDE DE BAIRRO, e isso vai parecer bug.** Três grupos
do Recreio ficaram com coordenada **idêntica** (`-23.01852, -43.46340`) → no mapa
os pins se empilham e parecem um só. É o 3º fallback do endpoint por desenho ("pin
aproximado no bairro certo" é melhor que grupo invisível), disparado quando o
Nominatim não acha o logradouro (casos reais: `Rua Nicette Bruno 75`,
`Rua Gernica 100`). Só melhora com endereço mais completo no cadastro (CEP resolve)
— não com mais uma rodada de geocode.

⚠️ **O `inRJ` do endpoint NUNCA resolveria o `GRUPO DE CONEXÃO FLORIPA`** (Lagoa da
Conceição, **Florianópolis/SC** · CEP 88062000): o guard recusa toda coordenada
fora do RJ metropolitano, de propósito (evita casar bairro homônimo em outra
cidade). Resolvi por script separado (`geo_floripa.js`) exigindo **3 evidências
convergentes**: o logradouro do cadastro é EXATAMENTE o que o ViaCEP devolve para
o CEP, o bairro confere, e o Nominatim achou a mesma avenida em Florianópolis/SC
(guard de caixa de SC + o `display_name` tem que citar a cidade do CEP). **Grupo
presencial fora do RJ é ponto cego permanente do botão "Endereços"** — se a igreja
abrir grupo em outro estado, a coordenada dele não sai por lá.
✅ Antes de gravar, conferi que o pin de SC **não estraga o enquadramento**: o
`GruposMapView` não usa `fitBounds` (zoom fixo 12/13) e o centro inicial é
`coords do membro > withCoords[0] > default Rio`, com a lista ordenada por NOME —
o 1º com coordenada é "BRIDGE ADOLESCENTES" (B), então o de Floripa (G) nunca
assume o centro. ⚠️ Se algum dia o 1º grupo por nome for de outro estado, o mapa
abre lá para quem não tem geolocalização.
⚠️ Existem DOIS grupos com "Floripa" no nome: o `00001115` (presencial, este) e o
`00000031` "Grupo de Conexão RJ, Floripa, SP - OnLine" (online, segue sem
coordenada, correto). Filtrar por nome aqui pega os dois — usar código.

### ✅ Pinos empilhados RESOLVIDOS na exibição (2026-07-31 · `src/lib/pinosMapa.ts`)

Decisão do Marcos: *"não vou ter o CEP dessas pessoas, consegue separar um pouco,
na mesma rua, coloca mais a frente outro mais atrás — é o que podemos fazer,
depois fazemos um levantamento cadastral."*

**Números reais medidos antes de mexer (a nota anterior de "3 grupos do Recreio"
subestimava): 19 grupos empilhados em 5 coordenadas**, entre os 81 visíveis na
busca pública — a maior pilha com **7 grupos** no mesmo ponto da Barra
(`-23.00149,-43.38804`), mais 4 no Recreio, 4 na Barra, e 2 pares.

`espalharPinosSobrepostos` (`src/lib/pinosMapa.ts`) agrupa por coordenada
arredondada a 5 casas (≈1 m) e, quando há colisão, distribui os pinos numa
**roseta** de raio 45 m (~meia quadra · anéis de 6, raio crescente). O balão
ganha "Localização aproximada — confirme o endereço com o líder".

- ⚠️ **É SÓ EXIBIÇÃO** — `mem_grupos.lat/lng` não é tocado. A coordenada guardada
  segue honesta ("centro do bairro"); gravar precisão inventada faria o
  levantamento cadastral futuro perder a distinção entre endereço real e chute.
- ⚠️ **Determinístico** (ordena por id): pino que muda de lugar a cada refresh é
  pior que pino empilhado — a pessoa perde o que já tinha achado. Guarda
  mutation-testada em `src/test/espalharPinos.test.ts`.
- ⚠️ **A coordenada deslocada NÃO pode vazar do render**: `onGroupSelect`,
  `onPinClick` e o "Como chegar" recebem sempre o grupo ORIGINAL (`origPorId`);
  só o desenho do marcador e o `flyTo` usam a posição deslocada (`posPorId`).
- ⚠️ Vive em `src/lib` e não no componente porque `GruposMapView` importa
  `maplibre-gl`, que não carrega em jsdom — função pura em lib é testável.
- ⚠️ Neste arquivo **`Map` é o COMPONENTE do maplibre** (import do topo), não o
  `Map` do JS: `new Map<...>()` ali é erro de tipo (TS2350/TS2558). Os índices
  por id são objetos (`Record<string, MapGroup>`) de propósito.

---

## [movido] ⚠️ Next · backfill de 13/05, contagem dupla e identidades (2026-07-29)

## ⚠️ Next · backfill de 13/05, contagem dupla e identidades (2026-07-29)

Investigação a pedido do Marcos ("Kelly Veiga com 24 inscrições, 23 do Next").
**Nada disso era import repetido** — é o desenho de duas camadas somadas sem
dedup. Números medidos em produção antes da correção:

- **O que o backfill `20260513160100` fez**: digitalizou **56 listas de presença**
  do Next (34 de 2025 · 22 de 2026 · `next_eventos.arquivo_origem` guarda o PDF,
  `total_lista`/`presentes_*` e a anotação do rodapé) e criou **1 linha em
  `next_inscricoes` por NOME POR LISTA** — soma dos `total_lista` = 2.443 ≈ as
  2.421 linhas criadas, **zero duplicata dentro do mesmo evento**. ⚠️ **Lista
  impressa é ROSTER, não chamada** (76 nomes na folha × 34 presentes, no exemplo
  do próprio arquivo): o nome fica sendo impresso nas sessões seguintes, então
  762 pessoas viraram 2.423 linhas (mediana 3, máx 17). No MESMO instante o
  import agrupou as aparições em **1.188 `next_matriculas`** por
  `origem_mes_key = <mês>|<membro_id>`.
- **Kelly**: 18 linhas legadas (18 eventos distintos · **4 com presença**) + 7
  matrículas (2025-03 a 2025-09, **todas "formado"**). Ela não fez o Next 7×: o
  nome estava no roster de 7 meses. ⚠️ **O status `formado` das 1.188 foi
  INFERIDO do roster** — dado de negócio errado, e corrigir depende da régua de
  quem conduz o Next (não é decisão de código · segue PENDENTE).
- **A view somava as duas camadas**: 1.839 (`next`) + 2.423 (`next_legado`) =
  **4.262 de 5.911 linhas = 72% da `vw_inscricoes_unificadas`**. O ramo do `ext`
  já deduplicava por `legado_ref`; o do Next não tinha nada. E
  `next_matriculas.origem_inscricao_id` está **NULL nos 1.847 registros** (a
  ponte foi criada e nunca preenchida) — o vínculo aproveitável é o
  `origem_mes_key`, preenchido em 1.189.
- **A presença não subiu pro modelo novo**: 994 linhas legadas com check-in
  contra **4** matrículas → o `compareceu` da porta `next` era ~sempre falso e
  quem media presença era só o KPI `frequencia_next`, que lê a tabela legada.

**Correções (migration `20260729190000`):** o ramo 9 da view passa a mostrar só
o que **não** tem matrícula, no máximo 1 linha por (mês × pessoa) e com a
aparição COM presença ganhando o `DISTINCT ON` (não perde `compareceu`); a
edição deixa de ser NULL (vira o mês, na mesma série derivada do ramo 8 — era o
chip "sem edição" que não abria nada). Backfill sobe a 1ª presença de cada
(mês × pessoa) pra matrícula (~588). Resultado esperado: Next na view cai de
4.262 → ~2.124 e matrículas com presença sobem de 4 → ~592.

⚠️ **NÃO apagar nem desligar `next_inscricoes`.** As duas camadas carregam fatos
**diferentes**: matrícula = inscrição/estado do mês · legado = aparição/presença
por encontro. As presenças reais moram na legada e o `frequencia_next` lê de lá.

**App parou de escrever só na camada morta** (`services/nextMatricula.js` ·
`espelharMatriculaDoEncontro`): `POST /app/next/inscrever` e o check-in por
geolocalização continuam gravando a presença por encontro em `next_inscricoes`
E agora espelham a **matrícula do mês** (turma do mês → turma aberta → sem
turma = espera), chave `origem_mes_key` (UNIQUE ⇒ idempotente). É **best-effort**
de propósito: o write primário já respondeu ao app e não se desfaz porque o
espelho falhou. A PARTE 3 da migration acrescenta `'app'` ao CHECK de
`next_matriculas.origem` — sem isso o espelho falharia com 23514 **em silêncio**.
⚠️ **Resíduo consciente**: o ramo `next` do `fn_app_inscricoes_fanout`
(rede de segurança pra builds ANTIGOS do app) segue inserindo só na legada — a
função foi patchada dinamicamente em prod (20260729060000) e um
`CREATE OR REPLACE` do arquivo do repo REVERTERIA aquele patch. Não vale o risco
por um caminho legado; a linha aparece como `next_legado` (sem contagem dupla).

**Identidades do backfill** (`backend/scripts/_next_identidades_pendencias.cjs`
· dry-run por padrão): o import resolveu a pessoa pelo matcher e gerou
`membro_id` **determinístico (UUID v5 de nome+telefone)**, então telefone
transcrito errado na lista manuscrita ou telefone de família compartilhado
produziu (a) **25 membros com vínculo divergente** — 63 linhas do Next apontando
pra um cadastro de OUTRA pessoa (ex.: "Lucas Abreu de almeida" → membro "Livia
Quintella"; "Sophia Macedo Joseph" → "LAYANE … BELLO JOSEPH", mesmo telefone =
mãe/filha) — **21 enfileiradas** em `identidade_pendencias` (`vinculo_divergente`
· 4 já estavam lá) e visíveis em /entradas → Conflitos de CPF; (b) **25 pares de
duplicata** que a `duplicidadePolicy` aceita e a aba "Possíveis duplicidades"
já calcula sozinha (o script só confere); (c) **58 `membro_id` órfãos** — ⚠️
**`merge_membros` NÃO repointa `next_inscricoes`/`next_matriculas`**, então
fundir membro deixa a linha do Next apontando pra um id que sumiu (mesma classe
do incidente Kids de 22/07). Corrigir exige o `mem_merge_log`. **PENDENTE.**
⚠️ Lei mantida: o script **nunca** funde, religa ou apaga — só enfileira pra
decisão humana.

### ⚠️ `criado_em` da view unificada = DATA DO FATO, não data do import (2026-07-29)

Marcos, olhando o gráfico de inscrições por dia: *"temos 2401 inscrições no dia
13/05/26 e outro volume grande de 470 no dia 30/06 — se temos os números por
inscrição (Next março, abril, maio…), não conseguimos colocar tudo na data que
aconteceu o evento e não no dia que importamos?"* Dá — e **a data real já estava
no banco nas três portas**; a view é que lia a coluna errada. Migration
`20260730130000`, sem reescrever um dado.

Picos que eram data de import: **13/05/2026 = 2.422** (next 1.109 · voluntariado
749 · batismo 564) · **30/06 = 472** · 20/07 = 99 · 21/07 = 95.

| porta | fonte da data do fato | precisão | regra |
|---|---|---|---|
| voluntariado | `data_inscricao` (749/749 preenchidas) | dia | `coalesce(data_inscricao, created_at)` |
| batismo | `data_batismo` (564/564) | dia | `least(data_batismo, created_at)` |
| next | mês da turma (`origem_mes`) | mês | mês só quando registrado DEPOIS do mês da turma |

Três detalhes que a simulação contra produção obrigou a acertar (não simplificar):

- **`least()` no batismo, não `coalesce()`**: batismo AGENDADO tem `data_batismo`
  no FUTURO (havia registro pra 23/08/2026) — usar a cerimônia ali colocaria
  inscrição no futuro. `least()` = "a evidência mais antiga de que a linha
  existe": cerimônia nas 564 do backfill (2024/2025 < 13/05/2026), created_at nas
  agendadas. E `least()` ignora NULL, então as 2 linhas sem data caem sozinhas.
- **No next, o mês SÓ vale se a linha foi registrada depois do mês da turma.**
  Sem essa guarda, matrícula real feita em 20/07 na turma de julho seria empurrada
  pro dia 1º — eu estragaria a precisão do dado NOVO, que é o que precisa ficar
  certo. Medido: em 30/06, 399 de 426 são backfill (turmas de 2024) e 27 mantêm o
  dia (inscrição de junho pra turma de julho, data real). Em 26/07 e 28/07,
  nenhuma é movida.
- **Meio-dia em BRT** ao converter DATE→timestamptz. `'2025-03-01'::date::timestamptz`
  é meia-noite UTC = 21h do dia ANTERIOR no fuso da igreja, e o dia apareceria
  errado no gráfico.

**Portas NÃO tocadas de propósito** (nunca tiveram import em massa, o `created_at`
delas já é o momento real): espinha, eventos externos, apresentação ×2, grupos,
líderes. **O `created_at` de toda tabela fica INTACTO** — continua respondendo
"esta linha entrou no sistema em 13/05 pelo import X". Daqui pra frente as duas
datas nascem iguais.

Resultado simulado (3.544 linhas): o maior dia passa a ser **27/07 = 138** (dia
real), os picos de import desaparecem e o volume se espalha por 2024-02→2026-08
com 40–200/mês. **Zero linha com data no futuro.**

⚠️ **Resíduo conhecido**: turmas "/02" do mesmo mês (Maio/02, Junho/02, Julho/02
2026 · ~64 matrículas) ficam na data do import — `next_turmas.origem_mes` é
UNIQUE, então a segunda turma de um mês não pode ter a chave, e a alternativa
seria adivinhar o mês pelo NOME (texto livre). Preferi não adivinhar.

⚠️ **PENDENTE**: os coletores `next.batismos`/`voluntarios`/`dizimo` ainda janelam
por `next_matriculas.created_at`, então maio/2026 continua recebendo o backfill
nesses 3 KPIs. Consertar muda valores de períodos JÁ FECHADOS e pede recoleta —
passo separado, combinado com o Marcos.

### ⚠️ Next · o DIA do backfill: sessão real primeiro, semana depois (2026-07-30)

Pedido do Marcos: *"não quero mudar o KPI do next, quero que altere o dia das
inscrições, já que não temos o dia certo — ao invés de usar sempre o dia 1 e
colocar todas lá, divide pelas semanas do mês e separa as inscrições, aí vamos
poder comparar o dado atual com o dado da semana do ano passado."* Migration
`20260730160000`.

**A premissa "não temos o dia certo" só valia para 31%.** Antes de estimar,
medi: as 56 listas digitalizadas do Next **têm data de sessão** (56 datas
distintas, dias 1 a 27 — são encontros semanais). Cruzando `next_inscricoes` ×
`next_eventos`, **1.109 das 1.604 matrículas de backfill (69%) têm a data REAL
da 1ª sessão em que a pessoa apareceu naquele mês**. O dia estava no PDF e não
estava sendo lido.

`fn_next_data_fato(created_at, origem_mes, primeira_sessao, id)` — fonte única,
3 níveis do mais verdadeiro pro menos:

| nível | regra | linhas | natureza |
|---|---|---|---|
| 1 | registrada durante/antes da própria turma → `created_at` | 286 | real, intocado |
| 2 | backfill com aparição → **dia da 1ª sessão do mês** (`vw_next_primeira_sessao_mes`) | 1.109 | **real** |
| 3 | backfill sem aparição → dia 1/8/15/22 pelo hash do id | 495 | estimativa declarada |

Efeito medido em produção (simulado antes de aplicar): o **dia 1º sai de 1.614
para ~280** linhas e a **semana 1 sai de 88% (1.660/1.890) para 43%** — 814 ·
291 · 445 · 314 · 27 pelas semanas 1–5. Zero linha no futuro.

- **Por que 1/8/15/22 e não uma data de sessão plausível**: o padrão de 7 em 7 a
  partir do dia 1º é **visivelmente sintético**. Quem vê volume no dia 8 de um
  mês sem encontro no dia 8 sabe que é aproximação. Escolher "13/04 porque teve
  sessão nesse dia" seria fingir precisão — o oposto da régua do legado.
- **`(h % 4 + 4) % 4`, não `abs(h) % 4`**: `hashtext` pode devolver `INT_MIN` e
  `abs(INT_MIN)` estoura com 22003 — a leitura da linha inteira falharia.
- **View, não coluna materializada**, pra `vw_next_primeira_sessao_mes`: dado
  derivado de presença não pode ficar velho. Corrigir uma presença corrige a
  data sozinha. `GROUP BY (membro_id, mes)` garante 1 linha por chave → o
  `LEFT JOIN` **não pode multiplicar linha** (conferido: 1.890 antes e depois).
- **A view unificada foi reconstruída por substituição textual** do arquivo da
  `20260730130000` (2 trechos do ramo do Next), não transcrita à mão —
  transcrever 258 linhas de `UNION ALL` é onde nasce erro. 7 statements
  validados no pglast, `REVOKE anon/authenticated` preservado.

✅ **A comparação YoY que ele quer é confiável**: turmas de **2025 são 100% data
real** (843 · zero estimadas) e 2026 é 266 real + 96 estimadas (73%). As
estimativas se concentram em **2024** (399), que ninguém compara. Ou seja:
2026 × 2025 por semana bate real contra real do lado de 2025.

⚠️ **NÃO mexe em KPI** (decisão dele nesta conversa): NEXT-01/02/03 seguem
`ativo=false` medindo `indicou_*`, e os coletores seguem janelando por
`created_at`. `created_at` de `next_matriculas` fica **intacto** — muda a
LEITURA. A migration `20260730140000` do PR #2164 (que criava
`vw_next_matriculas_kpi` e mudava os coletores) **nunca foi aplicada** e foi
**superada** por esta: `fn_next_data_fato` nasce aqui já com a assinatura final
de 4 argumentos.

---

## [movido] Totem Kids · check-in infantil (estado consolidado · aguardando hardware)

## Totem Kids · check-in infantil (estado consolidado · aguardando hardware)

Substitui o Planning Center: mãe dá o nome no totem, voluntário imprime 2
etiquetas (criança + recibo) com código de segurança de 4 chars; no checkout o
código libera a saída; TVs nas salas chamam o pickup (código gigante + TTS).
Plano completo: `docs/checkin-kids-plano.md` (10 decisões fechadas: 0-12 anos ·
só manned no MVP · foto opcional nunca na etiqueta · código sem expiração +
cron 23h `fn_kids_checkout_forcado_pendentes()` · app pra mãe NUNCA · impressão
via `window.print` na Brother QL-820NWB default do Windows).

- **Schema**: `kids_criancas/responsaveis/salas/sessoes/estacoes/checkins/
  etiquetas_log` (+ trigger que consolida `cultos.presencial_kids`/
  `decisoes_kids` ao encerrar sessão e cria decisão kids em
  `cultos_decisoes_pessoas`). Rotas `/ministerial/totem-kids*` + admin
  `/admin/totem-kids`. Permissão: boost área KIDS (Mariane) + "líder Kids do
  dia" dinâmico via `vol_check_ins`.
- **Pagers físicos** (2026-06-02): transmissor LRS Freedom T7470 (protocolo
  LRSN = XML/TCP). Agente local `pager-bridge/` (Node · só conexões de saída ·
  bearer `PAGER_BRIDGE_TOKEN` · `DRY_RUN=1` testa sem hardware) consome a fila
  `kids_pager_envios`; catálogo `kids_pagers`; `kids_checkins.pager_id`. Aba
  Pagers no admin.
- **Pré-check-in pelo app (2026-06-14)**: o responsável prepara o check-in dos
  filhos no app de membros e gera um código/QR de 6 chars; no totem o voluntário
  digita/escaneia, confere e imprime. **NÃO substitui a mediação presencial** —
  entrada/retirada continuam com o voluntário; o app NÃO faz checkout remoto
  (decisão de segurança). Tabela `kids_pre_checkins` (código único, crianca_ids,
  status pendente/usado/expirado/cancelado, expira em 12h · RLS: responsável vê/
  cria só os próprios via `current_user_membro_id()`, equipe kids ≥1 lê) +
  `fn_kids_pre_checkin_codigo()` (migration `20260614120000` · aplicada em prod).
  App: `GET/POST /api/app/kids/{meus-filhos,pre-checkin}` (valida que todas as
  crianças são filhos `autorizado_buscar` do membro · 403 senão · cancela
  pendente anterior). Totem: `GET /totem-kids/pre-checkin/codigo/:codigo`
  (responsável + filhos com sala sugerida · 404/410) e `POST /pre-checkin/:id/
  consumir` (auditoria). `TotemKidsCheckin` ganhou o card "Chegou pelo app?" que
  enfileira os filhos e reusa o fluxo de check-in 1 a 1 (confere+imprime). PR #1017.
- **Vínculo criança↔responsável pelo app + aprovação (2026-06-14)**: o vínculo
  NUNCA é automático (segurança de menor). O responsável pede pelo app e envia
  **documentos de identidade** (criança obrigatório + pai e/ou mãe, ao menos um);
  a equipe Kids confere e aprova/rejeita. Tabela `kids_vinculo_solicitacoes`
  (PII de menor · `deleted_at` + whitelist + RLS contextual + audit trigger ·
  migration `20260614160000` · aplicada em prod). Documentos num bucket
  **privado** `kids-documentos`: o app sobe direto pra `{auth.uid}/...` (storage
  policy só de INSERT no próprio prefixo · sem leitura via client) e manda só os
  PATHS; a equipe vê via **signed URL** (15 min) gerada pelo backend (service
  role). App: `POST /app/kids/solicitar-vinculo` (valida prefixo do path = uid) +
  `GET /app/kids/minhas-solicitacoes`. Totem: `GET/POST
  /totem-kids/vinculo-solicitacoes[...]` (list · detalhe com signed URLs ·
  aprovar = cria criança se nova + upsert `kids_responsaveis` autorizado_buscar ·
  rejeitar com motivo). Tela `TotemKidsVinculos` (rota
  `/ministerial/totem-kids/vinculos` · botão "Vínculos" no check-in).
- **Modo totem na tela de check-in (2026-06-14)**: botão "Modo totem" em
  `TotemKidsCheckin` entra em fullscreen (Fullscreen API) + overlay
  `fixed inset-0 z-[60]` cobrindo o AppShell; esconde a navegação e deixa só o
  check-in. Sair exige **PIN** (criado na 1ª vez · localStorage
  `cbrio-totem-kids-pin`), igual ao totem de membros (`TotemMembro.tsx`).
- **Foto da criança pelo app + consentimento ECA/LGPD (2026-06-17)**: o
  responsável autorizado pode adicionar (opcional) a foto da criança na tela do
  filho no app, com **consentimento explícito** (ECA Lei 8.069/90 arts. 17/18 ·
  LGPD Lei 13.709/18 art. 14 · texto + checkbox · versão em
  `kids_criancas.foto_consentimento_versao`). Migration `20260617200000`
  (aplicada): `foto_storage_path` (bucket **privado** `kids-documentos`,
  prefixo `foto-crianca/`), `foto_consentimento_por/_versao` (foto_url +
  foto_consentimento_em já existiam). App: `POST /app/kids/filho/:id/foto`
  (exige `consentimento:true`) e `/foto/remover` (revoga + apaga). **Exibição
  só com consentimento, via signed URL** — helper `fotoVisivelCrianca()` em
  `totemKids.js` resolve a foto do app na busca, detalhe, listagem e
  pré-check-in por código (foto_url legada do sistema segue inalterada).
  ⚠️ As views de checkout-por-código e roster de sala ainda leem foto_url
  legado (não mostram foto do app · não é o ponto de identificação na entrada).
- **Confiabilidade operacional para o 3º teste (2026-07-17)**: a sessão atual
  agora é escolhida somente entre cultos de **hoje em BRT**, respeitando a janela
  de horário (não reutiliza sessão antiga/futura aberta por engano). O checkout
  valida no servidor o código digitado e o responsável autorizado; o front passa
  o ID clicado diretamente, eliminando a corrida de `setState`. Check-in individual
  e em lote exigem `data_nascimento` antes de qualquer INSERT; o totem abre modal
  obrigatório para completar a idade de cada criança da família. Os botões antigos
  de reimpressão rápida continuam imprimindo só a etiqueta infantil; foi adicionada
  a opção **Reimprimir completo** (2 etiquetas da criança + recibo/QR do responsável,
  mesmo código). A impressão registra `sucesso` quando recebe `afterprint` e
  `enviada` apenas como fallback de quiosque. Códigos de segurança têm retry
  automático (5 tentativas) e trava transacional por código/grupo na migration
  `20260717160000_kids_codigo_seguranca_integridade.sql` (**aplicada em produção
  manualmente em 2026-07-17**); irmãos/multi-culto do mesmo `checkin_grupo_id`
  podem compartilhar o código, famílias diferentes não.
- **⚠️ Check-in v5 · destino do culto + modo ensaio (2026-07-22 · decisão do
  Marcos, validada por conselho deliberativo — não regredir)**: invariante =
  *check-in só é dado real se o dia (BRT) do check-in for o dia do culto*.
  3 camadas: (1) TELA — chip **"Registrando em: <culto>"** sempre visível
  (mesmo com 1 sessão, quando o seletor some); o seletor lista SÓ cultos de
  HOJE do **período atual** (manhã = os 3 da manhã; o das 19h e ensaios ficam
  fora do fluxo da criança); o culto da janela do relógio vem **PRÉ-MARCADO
  por criança** (recalculado na hora, não pelo poll · "automático com
  confirmação visível" — revisa o seletor-vazio de 14/07; voltar ao 100%
  manual = 1 linha no effect de `crianca?.id`); sem culto de hoje aberto,
  sessão de culto FUTURO destrava a tela em **MODO ENSAIO** explícito (banner
  âmbar + rótulo `TESTE ·` + etiqueta/recibo com faixa TESTE + botão "Encerrar
  ensaio e limpar testes"). (2) SERVIDOR — `POST /checkin`(/lote) recusa 409
  sessão de culto futuro quando há culto de hoje aberto; `cultos_extras` só do
  MESMO dia do primário. (3) DADOS — sweep lazy fecha ensaio ativado em dia
  anterior e **soft-deleta check-ins de ensaio** (corte = min(meia-noite do
  dia do culto, início−2h) — nunca pega culto de virada); sessões de cultos de
  HOJE são limpas de resíduo de ensaio na carga; Encerrar manual com check-ins
  a +2h do início → 409 `precisa_confirmar_limpeza` e o front pergunta (humano
  decide · Painel/AbaSessoes). Migration `20260722120000` (idempotente ·
  consolidação passa a ignorar `deleted_at` — sem ela a limpeza não afeta o
  KPI consolidado — e o radar de ausentes ignora culto de dia futuro).
  Decisão do conselho: **Painel ao vivo NÃO ganha botão Ativar** (superfície
  de monitoramento). Residual documentado: ensaio no MESMO dia do culto conta
  como real até o Encerrar perguntar (ensaie com culto de outro dia).
- **⚠️ LEI · criança nova NUNCA entra em família existente automaticamente
  (Marcos 2026-07-22 · caso Benjamin/Mariane Gaia)**: o `POST /criancas` (fluxo
  normal) herdava `mem_membros.familia_id` do responsável — a Mariane (tia do
  Samuel, agrupada na família da irmã pela MEMBRESIA) cadastrou o próprio filho
  e ele nasceu na família da irmã, com **duas mães** na mesma família. Agora o
  fluxo normal **sempre cria `mem_familias` nova** ("Família <sobrenome da
  criança>"); juntar núcleos é ato explícito — botão "Cadastrar criança na
  família" (`amigo_de_crianca_id`) ou Gestão/Entradas (Vincular famílias).
  Efeito colateral aceito: irmão cadastrado pela via errada ("Nova criança" em
  vez do botão da família) nasce em família separada — corrige-se juntando as
  famílias, o inverso (criança na família alheia) é que era irreversível de
  detectar. Diagnóstico do dia: na base inteira só 2 famílias tinham 2+ mães
  (a do caso + Nicolle duplicada nos filhos do Juninho · ambas corrigidas).
- **⚠️ Vínculo do Kids × limpeza da Membresia (incidente 2026-07-22 · lei)**: a
  antiga rotina "depurar inativos" da era PCO (removida no #1861) soft-deletou
  em 20/06 **129 mem_membros que eram responsáveis ATIVOS** em
  `kids_responsaveis` (sem passar por merge · mem_merge_log vazio). Sintoma: o
  responsável aparecia no check-in (embed não filtra `deleted_at`), mas TODA
  edição falhava com 500 genérico (`PATCH /totem-kids/membro/:id` filtrava
  `deleted_at IS NULL` + `.single()` → 0 linhas · caso Julliane Gaia, mãe do
  Samuel). Reparo por script (repontar vínculo pra gêmeo vivo por telefone/nome
  · `app_restore` dos sem gêmeo). Código: o PATCH devolve **404 claro** com
  `cadastro_desativado`; busca/irmãos/`GET /criancas/:id` **filtram responsável
  com membro deletado**. **Regra: qualquer limpeza/soft-delete em massa de
  `mem_membros` DEVE checar antes `kids_responsaveis` (e repontar/poupar quem
  é responsável ativo).**
- **Saneamento da base Kids (2026-07-17 · `scripts/kids_integridade_auto.cjs
  --auto`)**: executado com backup JSON antes das mutações. Foram fundidos 2
  responsáveis realmente duplicados (mesmo telefone + grafia quase idêntica),
  corrigidos 71 vínculos legados excedentes de `mae`/`pai` para `outro` sem remover
  pessoas autorizadas, consolidadas 15 crianças na família evidenciada pelo mesmo
  pai/mãe, diferenciadas 551 famílias homônimas por sobrenomes e recuperados 116
  vínculos de crianças sem responsável a partir dos responsáveis já autorizados
  dos irmãos da mesma família. Resultado auditado: zero criança com mais de uma
  `mae` ou mais de um `pai`, zero CPF duplicado; quatro telefones compartilhados
  por pessoas de nomes diferentes foram preservados. Nenhuma criança atingiu com
  segurança o critério de soft-delete (sem idade + sem responsável + sem atividade
  há mais de 1 ano), portanto nenhuma foi apagada. O script é conservador e deve
  sempre rodar primeiro sem `--auto` para diagnóstico.
- **Fotos do app assinadas em LOTE (2026-07-21 · Onda 1 performance)**: as
  listas (gestão de crianças, busca do totem, irmãos, pré-check-in por código)
  resolvem foto via `anexarFotosEmLote` (`totemKids.js` · `createSignedUrls` =
  1 chamada pra N fotos + cache em memória ~25 min; falha degrada pra sem
  foto). O detalhe individual segue com `fotoVisivelCrianca`.
- **Ajustes pós-culto 26/07 (2026-07-27 · sem migration)**: (1) o diálogo do
  pager não perde mais o foco — o effect que devolve o foco à busca ao limpar a
  seleção agora PULA enquanto `pagerFluxo` está aberto (era ele que roubava o
  teclado 50ms depois do check-in da família; o número ia parar na busca).
  (2) **Check-out com 3 buscas**: código (padrão) + NOME da criança + nº do
  PAGER — `GET /totem-kids/checkins-abertos/buscar?nome=|pager=` acha check-ins
  ABERTOS e o clique entra no MESMO fluxo do código (`porCodigo`). (3) **Card
  de pagers do painel é clicável**: abre a MESMA ficha das salas (com
  check-out) — `pagers-em-uso` devolve `checkin_id`/`crianca_id`/`checkin_at`
  e o Dialog da ficha abre standalone (`!!salaDetalhe || !!criancaSelId`).
  (4) **Família imprime em 1 job + 1 log**: `imprimirEtiquetasLote` (imprimir.ts)
  junta 2 etiquetas por criança + recibo 1× + aniversários num documento só e o
  `POST /etiquetas-log` aceita `{eventos:[...]}` (lote) — irmãos não disparam
  mais 1 impressão + 2-3 POSTs por criança. (5) **Seleção da busca refaz
  `GET /criancas/:id`** (`selecionarCrianca`): edição de cadastro (mãe/data de
  nascimento) reflete na hora — antes a etiqueta saía com o retrato velho da
  busca (casos Alice Lopes/idade em 26/07).
- **⚠️ Incidente "Contribuinte NNN" como responsável (26/07 · corrigido
  2026-07-27)**: o import financeiro de 24/07 criou ~95 `mem_membros` com CPF
  REAL e nome mascarado do extrato ("Contribuinte 059412..." · via
  `fin_resolver_ou_criar_contribuinte`). O dedup por CPF do check-in ("CPF já é
  de outra pessoa → usa a existente") trocava o responsável selecionado pelo
  fantasma → 6 etiquetas de 4 famílias saíram com "Contribuinte" como mãe.
  Guardas permanentes: `ehNomePlaceholder` (membroMatch · exportado) — match
  por CPF em registro-placeholder com nome real na porta **renomeia o registro**
  (fantasma vira o cadastro real); nos 2 check-ins (`/checkin` e `/checkin/lote`),
  dono do CPF sendo placeholder **não rouba a identidade** —
  `transferirCpfDePlaceholder` migra o CPF pro cadastro selecionado (real) e o
  telefone do fantasma vira contato secundário (`fn_registrar_contato`).
  Dados reparados via script guardado (CPF Mariane Malafaia/Suellen Santana
  transferidos; vínculos mae→fantasma de Fiorella/Noah removidos — recriam no
  próximo check-in manual, já com a guarda). ⚠️ Os fantasmas restantes seguem
  no banco (lastro financeiro): nenhum fluxo de PESSOAS deve exibi-los nem
  preferi-los — usar `ehNomePlaceholder` em busca/vínculo novos.
- **Pager de INCLUSÃO é OBRIGATÓRIO (Mari 2026-08-03 · sem migration)**: no
  diálogo do pager, família com criança de inclusão (`tem_espectro` ou
  `tem_limitacao_fisica` entre as obrigadas · `PagerFluxo.inclusao`) NÃO tem a
  válvula "Sem pager disponível — imprimir mesmo assim" e o diálogo não fecha
  por fora/Esc — só conclui com número. Menores de 4 anos sem inclusão mantêm
  a válvula (o painel segue mostrando "pendentes" como rede). E o card **Pagers
  em uso** do painel ao vivo agora mostra **em qual culto** cada pager está
  (chip com a hora · `pagers-em-uso` devolve `culto_nome` via join da sessão) —
  o histórico por culto com devolução já existia na **Conferência de pagers**
  (28/07 · `ConferenciaPagers` no painel + `GET /pagers/conferencia`).
- **Devolução do pager = CHECK-OUT (Mari/Marcos 2026-08-03 · sem migration)**:
  os dois registros andavam desacoplados ("Devolvido" não dava baixa → pager
  seguia "em uso" com o número travado; check-out não carimbava devolução → a
  conferência acusava "não devolvido" de pager já na mão da equipe). Agora:
  (1) `POST /checkout` (métodos individuais) carimba `pager_devolvido_at` nas
  linhas da família com pager; (2) o botão **"Devolvido" da conferência também
  dá a baixa** (fecha as linhas abertas do grupo · metodo 'painel' ·
  responsavel_checkout_nome "Devolução do pager (conferência)" · devolve
  `baixados` pro toast); (3) `POST /checkin/:id/reabrir` limpa a devolução
  (criança volta, pager volta pra família). ⚠️ A **baixa em massa**
  (`checkout_forcado` · endpoint próprio) NÃO carimba devolução DE PROPÓSITO —
  é o que sustenta o alerta "foi pra casa" da conferência. Desfazer a marcação
  de devolvido não reabre check-out (pra isso, o reabrir da ficha).
- **Pendências operacionais**: aplicar migration
  `20260522300000_totem_kids_chamadas_display.sql`; Brother no Windows do totem
  (docs/totem-kids-setup-brother.md); comprar/parear 6 Fire TV Sticks;
  `PAGER_BRIDGE_TOKEN` no Vercel + .env do agente; confirmar porta TCP/NetPage
  com a LRS; teste num culto pequeno. Estado/dados: 660 famílias + 894 crianças
  importadas (56% com responsável · resto via auto-cadastro no 1º check-in).
  Diário completo no legado.

---

## [movido] Racional histórico da escolha do Asaas (28/07 · superado, mantido pro registro)

### Racional histórico da escolha do Asaas (28/07 · superado, mantido pro registro)

**PSP brasileiro único (Asaas), checkout hospedado, página pública web.** O que
elimina as alternativas é fato verificado, não preferência:

- **Stripe está fora pra cartão**: não faz **parcelamento no Brasil**, e
  parcelar é requisito declarado essencial. (PIX lá também é invite-only.)
  Segue vivo só onde já está: 3 Edge Functions `generosidade-*` no app,
  desligadas por feature flag.
- **Santander não é adquirente** — nunca fará cartão/parcelado/Apple Pay. Segue
  no que já faz: **leitura** de extrato/saldo pra conciliação. O PIX cobrança e
  o boleto existem em código mas estão desligados, com paths de API **não
  confirmados** (`pixCobrancaService.js` testa 8 candidatos), **sem webhook**, e
  boleto exige convênio de cobrança com a agência.
- **Juros do parcelado = repassados ao inscrito** (a igreja recebe cheio, sem
  antecipação). As 3 opções ficam configuráveis por edição no schema.
- **Boleto e Apple Pay ficam pra fase 2**: boleto prende vaga por 3 dias em
  evento com data fixa; Apple Pay exige merchant/domínio novo, reescrever
  `modules/apple-pay` (hoje Stripe-only) **e não faz parcelado**.
- **O inscrito paga em página pública** (`/retiro/<slug>`), fora do login; o app
  só abre o link no navegador. Tira a Apple do caminho (a Generosidade já foi
  travada por guideline 3.2.2(iv)), tira o PCI de cima de nós, e a venda não
  depende de release aprovado.

---

## [movido] ✅ Tela de pagamento: Pix e boleto nossos, cartão hospedado (2026-07-30 · PR #2168 · SEM migration)

### ✅ Tela de pagamento: Pix e boleto nossos, cartão hospedado (2026-07-30 · PR #2168 · SEM migration)

Pedido do Marcos ("preciso de um modal na hora do pagamento, cartão, pix,
boleto"). Antes, `EventoExterno.tsx` mandava a pessoa **direto pro
`checkout_url`** (`window.location.href`) ao enviar o formulário: saía do domínio
no meio do fluxo e, ao fechar a aba, ela perdia o link. Agora vai pra
`/pagamento/:token`, que é endereçável e à qual ela pode voltar.

**⚠️ LEI (nº 5 do núcleo, aplicada à UI · não regredir): cartão continua no
checkout do Asaas.** Número de cartão não entra no nosso domínio, no nosso
Express nem nos nossos logs. Coletar PAN em formulário nosso ampliaria o escopo
PCI-DSS da igreja — muda a responsabilidade legal num vazamento, não é questão
de gosto. **Pix e boleto NÃO são dados sensíveis** (QR e linha digitável), por
isso são nativos. Foi assim que se conseguiu quase toda a sensação de fluxo
integrado com zero exposição.

- `PagamentoInscricao.tsx`: abas **Pix** (QR + copiar) · **Boleto** (linha
  digitável + PDF) · **Cartão** (abre o Asaas). Oferece só a interseção de
  `pagamento_metodos` do evento com a capacidade do provider — o `GET
  /public/evento/pagamento/:token` passou a devolver `metodos` e `parcelas_max`
  (config, não PII). Cobrança antiga sem `metodos` cai nos três.
- **Cada aba tem caminho nativo E de reserva.** Se o provedor não devolveu o
  artefato (QR, linha do boleto), a aba manda pro checkout em vez de aparecer
  vazia ou mentir.
- `providers/asaas.js` ganhou **`buscarPixQrCode`** (`GET
  /payments/:id/pixQrCode` · chamada separada do `POST /payments`).
  **Best-effort por decisão:** quando ela roda, a cobrança **já existe e já
  reservou vaga** — deixar o erro propagar faria a pessoa perder a inscrição por
  causa de um enfeite de tela. 5 testes cobrem isso (sucesso, `success:false`,
  erro HTTP, falha de rede, id ausente).
- ⚠️ **EM ABERTO (resolver no 1º teste em sandbox):** não está confirmado se o
  Asaas devolve QR de Pix e `bankSlipUrl` numa cobrança `billingType:
  'UNDEFINED'` (o pagador ainda não escolheu método). Se NÃO devolver, o plano é
  a pessoa escolher o método ANTES da cobrança existir, criando com `billingType`
  específico — mais invasivo (exige passar o método pela fachada até o adapter).
  Não decidir isso por suposição.
- `backend/.env.example` **não tinha nenhuma** entrada `PAG_*`/`ASAAS_*` (só o
  CLAUDE.md). Agora tem as quatro, com o aviso de que o prefixo da chave precisa
  casar com o ambiente — e que o adapter **lança na primeira chamada, não no
  boot**, então chave errada só aparece ao criar a primeira cobrança.
- Saiu o rótulo "Valor (R$) · Pix chega na próxima fase" (`Inscricoes.tsx`) — a
  fase chegou e o texto mentia pra quem cria evento.

### ✅ A forma de pagamento é ESCOLHIDA, não adivinhada (2026-07-30 · achado do 1º teste)

Marcos testou em sandbox e reportou: *"só está aparecendo a opção de pagar com
boleto, mesmo eu selecionando cartão; quando selecionei pix também"*. A fatura do
Asaas veio **só com boleto**.

⚠️ **Isto RESPONDE (e corrige) a pergunta que ficou aberta acima:**
`billingType: 'UNDEFINED'` **não** garante uma fatura com as três formas — o
Asaas monta a página com o que a **CONTA** tem habilitado, e conta sem chave Pix
cadastrada rende boleto puro. Nossa tela então oferecia abas de Pix e cartão que
não existiam do outro lado. Palpite sobre capacidade de conta alheia é sempre
assim: silencioso e errado.

- `providers/asaas.js` → **`definirMetodo`**: `PUT /payments/:id` com
  `billingType` PIX/CREDIT_CARD/BOLETO e busca do artefato real (QR via
  `/pixQrCode`, linha digitável via `/identificationField`, `invoiceUrl`). Aqui o
  QR **não** é best-effort — a pessoa PEDIU Pix; erro do provedor (conta sem
  chave Pix, cartão não liberado) precisa aparecer na hora da escolha.
- `cobrancas.definirMetodo` persiste forma + artefatos e **não toca em valor,
  status nem vaga** — trocar de forma não é pagar nem cancelar. Recusa cobrança
  que já recebeu dinheiro: ali o método é fato consumado, e reescrevê-lo apagaria
  como o dinheiro entrou. Artefato só é sobrescrito quando vem algo novo (trocar
  pra cartão não apaga o QR que a pessoa talvez volte a usar).
- **`POST /api/public/evento/pagamento/:token/metodo`** valida contra
  `metodos_ofertados` do EVENTO (forma fora da lista não é oferecida nem por
  chamada direta) e, em erro do provedor, responde **502 com o estado atual** no
  corpo — a tela não regride pra vazio e mantém o caminho de reserva.
- A tela prepara a forma ao clicar na aba (carregando/erro visíveis) e ficou
  **mobile-first**: media query real (`CSS_MOBILE`), cabeçalho reservando o canto
  do `PublicThemeToggle` (que é `position: fixed` e deitava sobre o título no
  celular), QR proporcional e alvos de toque de 48px.
- ⚠️ **Correção de registro em `aplicarStatus`**: `extra.ctx` ia pro UPDATE como
  se fosse coluna. Ninguém passava `ctx` ainda, então o furo estava latente — o
  PostgREST recusaria o UPDATE inteiro (42703) e a transição não aconteceria.
  Agora `ctx` é separado das colunas.
- ⚠️ **`cancelar` ganhou `preservar_dominio`** (e o handler respeita): cancelar a
  cobrança por decisão NOSSA (bolsa concedida, valor corrigido) não pode cancelar
  a inscrição de quem acabou de ganhar a vaga.
- ⚠️ **Flake removido do gate de deploy**: 4 testes de guarda de ambiente faziam
  chamada de **rede real** ao sandbox do Asaas (um falhou por tempo aqui). Rede
  stubada — determinístico e sem bater em API de terceiro a cada deploy. Teste
  vermelho bloqueia produção; teste que depende de rede não pode entrar aqui.

---

## [movido] ✅ 3 formas validadas em sandbox · e a tela não troca a forma sozinha (2026-07-30 · SEM migration)

### ✅ 3 formas validadas em sandbox · e a tela não troca a forma sozinha (2026-07-30 · SEM migration)

Com as formas habilitadas na conta sandbox (Marcos, 30/07), o teste passou nas
**três**: Pix devolve QR, boleto devolve linha digitável e cartão abre a fatura do
Asaas com o formulário de crédito/débito.

⚠️ **Não era regressão** o print de "cliquei em cartão e a fatura não oferece
cartão": era uma **aba antiga da fatura**, aberta quando a cobrança ainda estava em
boleto/UNDEFINED. `invoiceUrl` é a mesma URL a cada troca de método, então uma aba
esquecida mostra o estado velho. Ao aplicar `CREDIT_CARD`, a fatura mostra cartão.
Régua de diagnóstico: o campo **FORMA** da nossa tela é o que o servidor gravou —
se ele diz `cartao`, o Asaas confirmou o `billingType` (senão a guarda de 30/07
teria lançado). Conferir a fatura sempre reabrindo pelo botão, nunca por aba velha.

**Bug corrigido na mesma leva — a pré-seleção reescrevia a forma da cobrança.** O
`useEffect` de pré-seleção olhava só `metodoSel` (estado local, nulo em TODO
carregamento) e sempre pré-selecionava `metodos[0]` = Pix, chamando `escolherMetodo`
→ `POST /metodo` → forma reescrita no provedor. Efeito real: quem escolhia **cartão
em 6×**, saía pra pagar e voltava pra conferir tinha a cobrança **convertida em
Pix**, e o `installmentCount: null` que Pix/boleto mandam **desfazia o
parcelamento**. Na tela aparecia como aba "Pix" com QR sobre um campo FORMA dizendo
"cartao" — a mesma "duas verdades" que o fix do `catch` havia resolvido só no
caminho de erro. Agora: **a forma muda SÓ quando a pessoa troca**; o carregamento
pré-seleciona `pag.metodo` quando ele está entre os métodos oferecidos, semeando
`preparados` com a MESMA chave do `escolherMetodo` (`cartao:<n>`) pra não disparar
POST redundante, e alinha `parcelasSel` com `pag.parcelas` (senão o seletor exibiria
"1×" numa cobrança em 6×). Cai em `metodos[0]` só quando a cobrança ainda não tem
forma.

⚠️ **Armadilha de CSS que vai reaparecer**: `textAlign: 'center'` no container **não
centraliza `<img>`** neste projeto — o `@tailwind base` aplica o preflight, que faz
`img { display: block }`, e sem `margin auto` a imagem encosta à esquerda enquanto o
texto ao redor fica centralizado (foi o QR do Pix). `.pgto-qr` ganhou
`display: block; margin-inline: auto`.

**Apple Pay / Google Pay NÃO existem na fatura do Asaas** (verificado no produto em
30/07): as formas da fatura são Boleto · Pix · Cartão de Crédito · Cartão de Débito,
e cartão é formulário de PAN/titular/validade/CVV. O que o Asaas divulga como
Apple/Google/Samsung Pay é o **app maquininha por aproximação (NFC / Tap on
Phone)** — presencial. Carteira digital no checkout web exigiria outro gateway; não
é ajuste de tela. (No Safari o autofill do cartão da Apple Wallet preenche o campo
com Face ID — ajuda a digitar, mas não é Apple Pay.)

**Estado do teste (2026-07-30):** conta Asaas no CNPJ da igreja criada e **"Em
análise"** (produção não recebe); volume do lançamento **já avisado por escrito**
ao Asaas. Teste vai em **preview + sandbox**, com as envs no escopo **Preview
só** — produção fica no provider `manual` e recusa evento pago com aviso, o que
é a rede de segurança. ⚠️ O webhook do sandbox precisa do **Protection Bypass
for Automation** na query string: o projeto `crmcbrio` tem `ssoProtection` em
`all_except_custom_domains`, então sem o bypass a entrega toma 401 da Vercel
antes de chegar na rota. Roteiro completo de teste ficou na conversa.
⚠️ Conferir na aba Cron Jobs se `pagamentos-webhook/cron/tick` registrou (45
crons vs teto documentado de 40) — sem ele, vaga reservada e não paga nunca
expira.

---

## [movido] 🎨 Personalização da fatura do Asaas (pesquisado em 30/07 · não é código)

### 🎨 Personalização da fatura do Asaas (pesquisado em 30/07 · não é código)

- **Dá pra marcar, não pra redesenhar**: a API `salvar-personalizacao-da-fatura`
  aceita 4 campos (`logoFile`, `logoBackgroundColor`, `infoBackgroundColor`,
  `fontColor`) e passa por **aprovação manual do Asaas** (algumas horas). A
  estrutura da página é deles.
- Conta de **associação** pode trocar "Cobrança" → "Doação" na fatura (Minha
  conta → Personalização → Fatura).
- ⚠️ **Cartão na nossa página está FORA, com fonte**: o Asaas **não oferece
  tokenização client-side**, então o PAN passaria pelo nosso Express e a
  aplicação precisaria de **SAQ-D**. É a lei nº 5 do núcleo, agora documentada.
  Pix e boleto seguem nativos (QR e linha digitável não são dado sensível) e o
  Asaas só aparece no cartão.


---

# Condensação de 2026-08-12 · texto integral das seções esfriadas

Movido do `CLAUDE.md` pela regra de manutenção do próprio arquivo ("quando o
assunto esfria, condensar pra estado final + decisões + lições e mover o texto
longo pro legado"). **Isto NÃO é referência viva** — as leis, o estado atual e as
lições de cada uma destas seções continuam no `CLAUDE.md`, em forma condensada.
O que está aqui é a narrativa de implementação (medições da época, diários de PR,
ondas concluídas), guardada só pra arqueologia de decisão.

## [movido] ✅ Lista de inscritos: idade, sexo, pagamento e impressão agrupada (2026-07-28 · SEM migration)

### ✅ Lista de inscritos: idade, sexo, pagamento e impressão agrupada (2026-07-28 · SEM migration)

O que o Marcos pediu na abertura ("saber os inscritos, idade de cada um, forma
de pagamento de cada um, imprimir a lista separada por idade ou faixa ou sexo"),
sobre a tela que o Marcos Paulo já entregou (`InscricaoEventoDetalhe.tsx`).

- **`GET /inscricoes/eventos/:id/inscricoes`** passou a devolver
  `data_nascimento`, `sexo`, `membro_id` e um bloco `pagamento` lido da
  **`vw_insc_pagamento_estado`** (best-effort: a lista abre mesmo se a view
  faltar). **CPF continua fora de propósito** — é o campo mais sensível e serve
  pro matcher, não pra tela. ⚠️ A leitura virou **paginada**: tinha
  `.limit(2000)`, que o cap de 1000 do PostgREST truncava em silêncio (a lista
  parecia completa).
- **`src/lib/faixaEtaria.ts`** — espelho EXATO de `fn_faixa_etaria`
  (<13 criança · 13–17 adolescente · 18–30 jovem · 31+ adulto). Existe em JS
  porque chamar a função SQL por linha seria uma consulta por pessoa. ⚠️ **Se a
  régua mudar no banco, mudar aqui também** — duas réguas fariam a lista
  impressa discordar do KPI. Data é parseada como LOCAL (`+T00:00:00`): sem
  isso, em fuso negativo, quem nasceu dia 1º vira um dia mais velho e no limiar
  muda de faixa. 22 testes em `src/test/faixaEtaria.test.ts`.
- **`src/lib/imprimirListaInscritos.ts`** — A4 no molde do
  `imprimirListaPresencaBatismo` (`thead` repetido por folha,
  `page-break-inside: avoid`, `escapeHtml`). Agrupa por **faixa / sexo / status
  / pagamento / sem agrupar**, com subtotal por grupo e total geral. A ordem dos
  grupos é a operacional (Criança→Adulto), não A-Z. Coluna redundante com o
  agrupamento é omitida. Chave desconhecida vai pro fim em vez de desaparecer.
  ⚠️ **Telefone/e-mail ficam FORA por padrão** — é PII que vira papel na mão de
  voluntário; só sai marcando a caixa (com aviso na própria tela).
- Idade, sexo e situação do pagamento aparecem na linha da pessoa e no detalhe;
  o CSV ganhou nascimento/idade/faixa/sexo/pagamento/forma.

### ✅ Aba "Inscrições" na ficha do membro (2026-07-28 · SEM migration)

"Abrir um membro e ver as inscrições dele", em TODAS as portas — não só a
espinha. `GET /membresia/membros/:id/inscricoes` junta `inscricoes` (com
pagamento) + `ext_inscricoes` (eventos legados do Celebra) +
`batismo_inscricoes` + `next_inscricoes` + `vol_inscricoes` +
`mem_grupo_pedidos`, ordenado por data, com `por_porta` pra contagem no
cabeçalho. **Kids fica FORA** — dado de menor, mesmo corte da timeline e do
export LGPD.

- É COMPLEMENTO da timeline, não substituto: a timeline é feed cronológico
  misto; aqui a pergunta é "em que esta pessoa se inscreveu, e como pagou".
- Pagamento resolvido em **UMA** consulta à `vw_insc_pagamento_estado` (`.in()`
  em lotes de ≤200 — lista grande estoura a URL do PostgREST), best-effort.
- No NEXT o status exibido é **`compareceu`** quando há `check_in_at` — é o
  check-in que diz se a pessoa FOI, e é o marco que a jornada de 90d cobra.
- Data da INSCRIÇÃO e data do EVENTO aparecem separadas: juntá-las faz ler
  "inscrito em março" como "foi em março".
- Junto: a **timeline ganhou a espinha** (`tipo: 'inscricao'` + cor no
  `TIMELINE_COR`) — ela agregava todas as portas antigas mas não a nova, então
  evento/retiro do módulo /inscricoes não aparecia na história da pessoa.

---

## [movido] ✅ Adapter do Asaas (2026-07-28 · SEM migration)

### ✅ Adapter do Asaas (2026-07-28 · SEM migration)

`providers/asaas.js` — **o único arquivo do sistema que conhece a linguagem do
Asaas**. String de status do PSP, nome de campo, formato de payload: tudo morre
ali. `'PAYMENT_RECEIVED'` em qualquer outro arquivo é bug de arquitetura.

**A escolha foi REVERIFICADA na documentação em 28/07** (não é memória): a
página de installments da Stripe lista Mastercard Installments, México e Japão —
**Brasil não está lá**, e parcelar é requisito. ⚠️ Correção de registro: a
afirmação anterior de que "o Pix da Stripe é invite-only" está **errada** — a
página de suporte da Stripe lista Pix e boleto como suportados no Brasil. O que
elimina a Stripe é o parcelado, só isso.

**Fatos da API que não são óbvios (e cujo desconhecimento custa caro):**

1. **`PAYMENT_CONFIRMED` ≠ `PAYMENT_RECEIVED`, e no cartão há ~32 dias entre os
   dois.** Confirmado = o pagador pagou. Recebido = o dinheiro está disponível.
   **A PESSOA é confirmada no CONFIRMED** (esperar o RECEIVED faria quem paga
   com cartão passar um mês fora da lista do retiro); **o DINHEIRO é marcado no
   RECEIVED** (`repassado_em`, que é o que concilia com o extrato). É exatamente
   por isso que o núcleo separa razão auxiliar de caixa.
2. **Parcelado no cartão vira N cobranças no Asaas**, uma por parcela, cada uma
   com id e eventos próprios — mas o pagador autorizou tudo na primeira. Daí o
   `quita_cobranca` do adapter → `statusFinal` em `registrarPagamento`. **Sem
   isso a cobrança ficaria `pago_parcial` por 12 meses e a inscrição nunca seria
   confirmada.**
3. **`PAYMENT_OVERDUE` NÃO expira nada.** Vencido no Asaas ≠ expirado nosso: Pix
   e boleto seguem pagáveis. Quem libera a vaga é o nosso cron, pelo
   `expira_em`. Mapear OVERDUE pra `expirada` liberaria a vaga de quem ainda vai
   pagar.
4. **A verificação do webhook NÃO é HMAC**: o Asaas devolve no header
   `asaas-access-token` o token que VOCÊ cadastrou no painel → comparação
   `timingSafeEqual`. `rawBody` fica sem uso no adapter (o contrato o recebe
   porque outros PSPs assinam o corpo). **Fail-closed** sem segredo.
5. **A fila de webhook é INTERROMPIDA após 15 falhas consecutivas** e as
   pendências ficam guardadas só **14 dias**. É a razão de responder 200 pra
   tudo menos assinatura inválida — e por que token inválido agora
   **`notificar()` na primeira ocorrência** (dedup por dia): token mal
   configurado, em silêncio, viraria pagamento aprovado que nunca chega.
6. Header `access_token` (não Bearer) **+ `User-Agent` EXIGIDO** — sem ele a
   chamada falha de um jeito difícil de diagnosticar.
7. **A key carrega o ambiente no prefixo** (`$aact_hmlg_` = sandbox ·
   `$aact_prod_` = produção) → guarda que **lança no boot** se cruzarem. É a
   diferença entre "o teste não cobrou" e "o teste cobrou de verdade".
   ⚠️ A guarda olha **`VERCEL_ENV` ANTES de `NODE_ENV`**, e isso não é detalhe:
   a Vercel define `NODE_ENV=production` em **todo** deploy, inclusive
   **preview**. Só pelo NODE_ENV, o preview seria tratado como produção e a
   key de sandbox seria recusada — justamente no ambiente onde o sandbox
   precisa rodar. Mesmo raciocínio no `baseUrl()` (preview usa a API de
   sandbox). Testar sandbox = envs no escopo **Preview** da Vercel + webhook
   apontando pro alias estável da branch, NUNCA a chave de sandbox em Production.
8. `billingType: 'UNDEFINED'` faz o Asaas montar UMA página (`invoiceUrl`) onde
   o pagador escolhe Pix/cartão/boleto → checkout hospedado, e dado de cartão
   nunca passa pelo nosso Express.
9. **Taxa = `value` − `netValue`, os dois do payload.** Não viola a lei 6 (é a
   única forma como o Asaas expressa a tarifa); o proibido é derivar de tabela
   de preço nossa.
10. Sandbox (`sandbox.asaas.com`, API `api-sandbox.asaas.com/v3`) **não exige
    CNPJ nem contrato** e **não tem endpoint pra confirmar pagamento** — usa-se
    os botões da interface. É assim que se testa CONFIRMED e RECEIVED separados.

Mudanças no núcleo que o parcelado exigiu: `registrarPagamento` aceita
`statusFinal` (o derivado da soma disparia `aoPagarParcial` antes de `aoPagar` —
dois avisos pra um pagamento) e, na reentrega do mesmo pagamento com
`repassado_em`, **atualiza a linha em vez de duplicar** (é o CONFIRMED→RECEIVED
normal). `sincronizar` passa o mesmo `statusFinal`, senão o cron discordaria do
webhook no parcelado.

Testes: `src/test/pagamentosAsaas.test.ts` (31) — mapa completo de eventos,
OVERDUE que não expira, guardas de ambiente, idempotência por id de EVENTO (não
de pagamento) e uma asserção de que o evento normalizado **não carrega
PAN/CVV/validade/nome impresso**.

**Envs:** `ASAAS_API_KEY` · `ASAAS_BASE_URL` (opcional, default por `NODE_ENV`)
· `ASAAS_WEBHOOK_SECRET` · `PAG_PROVIDER_PADRAO=asaas`. Nenhuma obrigatória: sem
elas o sistema segue no provider `manual`.

**Abrir conta (associação/igreja):** CNPJ + razão social · **estatuto registrado
em cartório** · **ata da eleição da diretoria atual** (prova o mandato) · docs
do presidente ou tesoureiro · procuração se quem opera não é o representante.
⚠️ **Avisar o Asaas por escrito do volume do lançamento** — CNPJ religioso com
~150 transações em 72h é o padrão que dispara retenção de saldo por 30–90 dias.

---

## [movido] ✅ Fundação pós-auditoria: catálogo, QR e check-in auditável (2026-07-28)

### ✅ Fundação pós-auditoria: catálogo, QR e check-in auditável (2026-07-28)

- `backend/services/inscricaoPortas.js` é o registro canônico das **7 portas de
  inscrição e 10 fontes** da view. Porta/alias novo entra ali e precisa deixar
  `inscricaoPortas.test.js` verde. O registro **descreve**, não troca escritor:
  satélites continuam gravando onde sempre gravaram até a migração individual
  da F3.5; `/evento/:slug` continua espinha→fallback ext.
- `fn_insc_portas_resumo` agrega o inventário no PostgreSQL. O backend mantém
  fallback paginado enquanto a migration não entrou — deploy em duas etapas
  não derruba a aba Eventos.
- `insc_checkin_eventos` é ledger append-only. Marcar, liberar pendência e
  desfazer usam RPCs atômicas; override exige motivo na tela. `insc_checkins`
  continua sendo o estado atual, portanto dashboard e operação antigos não
  mudam.
- `insc_qr_tokens` guarda **somente SHA-256**, emissão/canal/revogação. Token
  legado sem registro continua válido; registro explicitamente revogado é
  recusado no comprovante e no check-in. Nunca guardar/devolver token bruto no
  inventário. Revogação é individual e não gira o segredo global.
- A workflow de produção roda Vitest + contratos de campos/portas/QR **antes**
  do Vercel. Rotas públicas e aliases são garantia coberta por teste; não
  remover nem renomear para “limpar” legado. ⚠️ Isso é **gate de deploy**: teste
  vermelho (inclusive flaky) bloqueia produção, e `workflow_dispatch` roda o
  mesmo job — não existe bypass. Teste novo aqui precisa ser determinístico (a
  lição é o `faixaEtaria.test.ts`, que dependia da HORA da execução:
  `toISOString()` vira UTC e depois das 21h BRT o cálculo caía um ano).

### ✅ Reparos da fundação · reativação de QR, leitura do ledger e busca (2026-07-29)

Auditoria da entrega acima (revisão pedida pelo Marcos). Os pontos críticos
estavam de fato resolvidos; o que faltava era operacional:

- **⚠️ LEI · ledger append-only NÃO tem FK com `ON DELETE SET NULL`**
  (migration `20260729100000`): `insc_checkin_eventos.ator_id` apontava pra
  `profiles` com SET NULL, e SET NULL **é um UPDATE** — o trigger de
  imutabilidade (`RAISE EXCEPTION 'append-only'`) abortava. Efeito: apagar um
  profile que já operou a portaria falhava para sempre. Ator em ledger é
  **SNAPSHOT** (UUID sem FK). Vale pra qualquer trilha append-only nova.
- **Revogar QR passou a ter volta** (`PATCH /inscricoes/qrs/:id/reativar` ·
  nível 3 · motivo obrigatório). O comprovante é HMAC determinístico do id da
  inscrição: **o hash nunca muda**, `fn_insc_qr_registrar` (ON CONFLICT) não
  limpa `revogado_em` e não existe rotação — sem reativar, um clique errado
  tirava a pessoa do check-in por QR permanentemente (só entrava por busca).
  Histórico (quem revogou/reativou e por quê) vai pro `app_audit_log` via
  trigger `trg_audit_insc_qr_tokens` — a revogação sai do estado, não da
  trilha. ⚠️ Rotação real de token exigiria nonce no HMAC (não temos): revogar
  = "desligar o QR desta inscrição", nunca "trocar o QR da pessoa".
- **Trilha do check-in ficou LEGÍVEL**: `GET /eventos/:id/checkin/historico`
  (nível 2) + painel "Trilha da portaria" na tela de check-in (sob demanda —
  a tela roda polling de 15s). O ledger existia sem nenhum leitor: a pergunta
  "quem liberou a entrada dessa pessoa com pagamento pendente?" só era
  respondível no SQL Editor. Desfazer agora **grava o motivo digitado** (o
  `del()` do `src/api.js` aceita corpo; antes o backend lia `req.body.motivo`
  que nunca chegava e a trilha registrava sempre o texto genérico).
- **Inventário de QR com busca e paginação SERVER-SIDE** + filtro por evento:
  a busca filtrava só a página carregada (50), então num evento do tamanho do
  Celebra a maioria das pessoas era inencontrável. Tabela/coluna ausente
  responde **aviso**, não 500 (a aba quebrava se a migration não estivesse
  aplicada — era a única rota nova sem fallback de deploy em duas etapas).
- **`inscricaoPortas.test.js` fechou nos 2 sentidos**: além de catálogo→App.tsx
  (protege contra renomear/remover), agora App.tsx→catálogo — rota com cara de
  porta de inscrição fora de `PORTAS_INSCRICAO` quebra o CI (allowlist
  explícita de telas internas no próprio teste).

---

## [movido] ⚠️ Forma de pagamento por PESSOA · a view lia a coluna errada (2026-07-30 · migration `20260730180000`)

### ⚠️ Forma de pagamento por PESSOA · a view lia a coluna errada (2026-07-30 · migration `20260730180000`)

Pergunta do Marcos: *"pelo sistema vou conseguir saber a forma de pagamento de
cada pessoa?"* Ia responder "sim" — e estava **errado**: a tela mostrava **"Pix"
pra todo mundo**.

`vw_insc_pagamento_estado` resolve status, valor, `pago_em` e `expira_em` com
`COALESCE(motor, espelho)` — **menos `metodo`**, que lia `ip.metodo` cru, só do
espelho `insc_pagamentos`. E o espelho (a) nascia com `cobranca.metodo || 'pix'`
(palpite gravado como fato, já que na criação a pessoa **ainda não escolheu**),
(b) **nunca era atualizado** (`espelhar()` só tocava status/pago_em) e (c) não
**podia** guardar a verdade: `NOT NULL CHECK (metodo IN ('pix','cartao'))` —
**boleto não cabia** e "ainda não escolheu" não cabia. O método certo sempre
existiu em `pag_cobrancas.metodo`; era só a LEITURA no lugar errado.

- Migration: `metodo` do espelho vira **nullable** com CHECK no vocabulário
  ÚNICO de `pag_cobrancas.metodo` / `pagamentos/tipos.js`
  (pix|boleto|cartao|apple_pay|dinheiro|transferencia — nome real do CHECK
  descoberto no catálogo antes de dropar) e a view passa a
  `COALESCE(c.metodo, ip.metodo)`. **Sem backfill**: onde há cobrança o motor
  responde; onde não há (pagamento manual) o espelho É a verdade.
- Os 2 writers pararam de chutar (`cobranca.metodo || null`) e `espelhar()`
  propaga a forma quando ela existe.
- Herdaram o conserto de graça: badge da lista, CSV, e o agrupamento "por
  pagamento" da lista impressa.
- **Placar ganhou "Como pagaram"** — o MESMO laço que soma o arrecadado agora
  conta por forma (custo zero), com **isentas separadas** (bolsa integral não
  pagou nada, então não tem forma). `metodo` nulo aparece como "Forma não
  informada" em vez de virar Pix.

### ⚠️ A forma confirmada é a que o PSP DEVOLVEU (2026-07-30 · SEM migration)

2º teste do Marcos em sandbox: com a aba **Cartão** selecionada, o campo FORMA
seguia dizendo `boleto` — e a fatura do Asaas respondia **"Não há formas de
pagamento disponíveis no momento"**.

**Duas causas, em camadas diferentes:**

1. **Conta** (não é código): a conta sandbox estava sem **nenhuma** forma
   habilitada — sem chave Pix cadastrada, cartão não liberado. Nada funciona em
   sandbox até habilitar as formas lá. É o nível abaixo do "só boleto" de mais
   cedo: não era `billingType: UNDEFINED`, era conta vazia. **Habilitadas pelo
   Marcos em 30/07** — o teste das 3 abas passou a ser possível.
2. **Código**: `providers/asaas.js definirMetodo` devolvia `{ metodo }` = a forma
   **PEDIDA**, e `cobrancas.definirMetodo` gravava `r.metodo || metodo`. Se o
   Asaas responde 200 **ignorando** o `billingType` (conta sem aquele meio), a
   gente gravava `cartao` numa cobrança que segue boleto — a única coluna do
   núcleo que não passava por `metodoDeBillingType`, violando a lei nº 2.
   Agora o adapter mapeia `p.billingType` de volta e **LANÇA** quando divergir do
   pedido; o chamador já transforma isso em 502 com o estado atual no corpo.
   4 testes novos, um deles mutation-testado (reverter a guarda deixa vermelho).

**A tela não pode mostrar duas verdades** (`PagamentoInscricao.tsx`): a aba vinha
de `metodoSel` (local, no clique) e o FORMA de `pag.metodo` (servidor). Quando
divergiam, a pessoa via "Cartão" sobre uma cobrança boleto **e um botão que
prometia pagar com cartão** — era ele que levava à fatura sem forma nenhuma.
Agora: o `catch` devolve a aba pra forma que o servidor confirmou; `falhas`
(ESTADO, não ref — precisa re-renderizar) guarda forma→motivo, a aba recusada
fica riscada com `title`, e no lugar do QR/linha/botão entra um bloco dizendo que
aquela forma não está disponível + o caminho de reserva. O erro passou a **nomear
a forma** (com 3 abas, "não conseguimos preparar esta forma" não diz qual).

Junto: `POST /pagamento/:token/metodo` responde **409** quando
`cobrancas.definirMetodo` devolve `alterada: false` (cobrança com dinheiro dentro
ou terminal) — era um **200 silencioso**: a aba mudava, o servidor não, e a tela
não dizia nada.

---

## [movido] ⚠️ CENSO / recadastramento da membresia (2026-08-03 · migrations `20260803160000` + `20260803160100`)

## ⚠️ CENSO / recadastramento da membresia (2026-08-03 · migrations `20260803160000` + `20260803160100`)

Demanda do **Arthur Serpa**: por um mês, 1 minuto de cada culto pra igreja
escanear um QR e preencher o cadastro. Decisão do Marcos: **formulário ÚNICO**
(não dividir em duas etapas — "prefiro aumentar o tempo de preenchimento"), então
o censo é o próprio `/cadastro-membresia`, com `?censo=1` no QR.

**Decisão de arquitetura: NÃO é evento no módulo de Inscrições.** `inscricoes` é
tronco PARALELO ao de pessoas — `membro_id` é nullable e nada o preenche, então um
"evento censo" daria milhares de linhas numa tabela que **não é a membresia**, e a
promoção inscrição→membro teria que ser construída do zero. O formulário de
membresia já escreve na espinha de identidade (matcher canônico +
`duplicado_de_id` + `registrarObservacaoSegura` + consentimento LGPD + fila de
aprovação). De quebra, `chk_inscricoes_contrato` exige
telefone+CPF+email+nascimento+sexo — Inscrições é *mais* exigente que a porta de
pessoa, não menos.

### ⚠️ O censo é UPDATE pra maioria — e era aí que ele morria

Toda pessoa que já existe gerava `mem_cadastros_pendentes` com
`status='duplicado'` pra resolver **UMA POR UMA** (`aprovar`/`rejeitar` são por
registro; `membros/merge` é por grupo de duplicata — **não existe endpoint em
lote**). Com base viva na casa dos **3.900**, é trabalho humano que ninguém vaza
em um mês: a campanha morreria na fila, não na coleta.

**`services/censoReconciliar.js`** generaliza a política do `cpfReconciliar`
(cujo cabeçalho, aliás, já citava "censo") de um campo pra nove:

- campo **VAZIO** no cadastro → **preenche** (enriquecimento)
- valor **igual** (tolerando caixa/espaço/máscara/timestamp) → no-op
- valor **diferente** num campo que já tinha → **CONFLITO**: não grava, vai pra
  decisão humana com **os dois lados à vista**
  (`mem_cadastros_pendentes.censo_conflitos`)
- sem conflito → linha vira **`status='aplicado'`**: sai da fila mas continua
  existindo como prova do que a pessoa enviou e do que ela consentiu

⚠️ **Telefone e e-mail divergentes NÃO são conflito** — a decisão de 2026-07-17
(Contrato de porta, item 3) é **ACUMULAR** em `mem_contatos` via
`registrarContatoDaPorta` (a MESMA função do matcher, importada — não duplicada).
Tratar contato como conflito jogaria na fila humana o caso mais comum do censo
(trocou de número) e o principal continuaria velho.

⚠️ **Gate de confiança: só `matched_by='cpf'` aplica sozinho.** Match por
telefone+nome / e-mail+nome / nascimento+nome são sinais que a **família
compartilha** — mãe e filha com o telefone da casa casam por telefone+nome, e o
único sinal de que erramos é o nascimento. Com sinal fraco só aplica se o
nascimento confere **dos dois lados**; senão não toca em nada e a linha segue pra
fila. **O "sou eu" do lookup também é FRACO**: é validado só contra o telefone,
então quem clica pode estar reconhecendo o cadastro do cônjuge.

⚠️ **Guarda de corrida tudo-ou-nada**: o UPDATE leva `.is(campo, null)` em cada
coluna que escreve. Entre o read e o write alguém da equipe pode ter preenchido na
tela de Membresia, e **sobrescrever edição humana com dado de formulário é
exatamente o que esta política existe pra não fazer**. 0 linhas → relê, reavalia e
o que foi preenchido vira conflito. UMA retentativa, sem laço.

⚠️ **Efeito colateral bom**: telefone que **não normaliza** (os 9 dígitos sem DDD
da auditoria de 31/07, tipo `996013179`) conta como destino vazio → o censo
**conserta** em vez de abrir conflito com um número inutilizável.

⚠️ **O censo NÃO promove ninguém a membro.** `vinculo_declarado`
(`membro|congregado|visitante`) é **autodeclarado** e nunca encosta em
`mem_membros.status` — mesma política do `converteu_na_cbrio`. Quem é membro
continua sendo decisão da igreja (batismo, curso, carta), e esse número alimenta
OKR/KPI. Foi o ponto levantado com o Arthur antes de codar: o QR do culto é
escaneado por membro, congregado, visitante e pai de criança.

### ⚠️ Rate limit: a membresia era a única porta pública fora do sweep

Achado que **quebrava o censo na 3ª pessoa**: `/api/public/membresia` era montada
**depois** de `app.use('/api/public', publicLimiter)` (30/15min) e tinha teto
próprio de **10/15min COMPARTILHADO** entre submissão e os lookups que o
formulário dispara enquanto a pessoa digita (`lookup-cpf`,
`lookup-nome-telefone`, `verificar-familia`). Cada pessoa gasta 3-5 requisições e
no WiFi da igreja todas saem por **1 IP** (NAT) — o autocomplete queimava a cota
antes de alguém conseguir enviar. Corrigido no padrão do sweep de 28/07:

- mount **antes** do `publicLimiter` + entrada no `skip()` do limiter global
- **dois baldes separados**: submissão `PUBLIC_MEMBRESIA_RATE_LIMIT_MAX`
  (10000/15min · calibragem já validada em multidão real do NPS e dos grupos) ·
  probing `PUBLIC_MEMBRESIA_LOOKUP_RATE_LIMIT_MAX` (3000/15min · teto menor
  porque esses endpoints respondem "esta pessoa existe na base?"). **NÃO
  unificar** — foi a cota compartilhada que quebrava o formulário.
- ⚠️ limiter fica **só nas rotas**, nunca em `router.use` **e** na rota (conta 2×
  a mesma requisição · lição do sweep de 28/07)
- ⚠️ A borda do Vercel é separada: **regra no Firewall antes do primeiro
  domingo**, como no NPS.

### ⚠️ Dois contadores que iam mentir em silêncio no primeiro domingo

- **`GET /cadastros/kpis`** fazia `.select('status')` sem paginação → o PostgREST
  capa em **1000 linhas** server-side, então a partir da 1001ª submissão os
  contadores **congelavam sem erro**. Virou COUNT no banco por status
  (`head: true`, zero linhas transferidas).
- **`notificar()` de cada submissão**: sem regra configurada o fallback é **TODOS
  os admin/diretor**, então 700 respostas × 16 admins ≈ 11 mil linhas por
  domingo. Agora submissão que o reconciliador RESOLVEU **não notifica** — aviso
  é pra trabalho pendente; volume se acompanha pelo painel, não pelo sino.

### Cobertura · a pergunta que define um censo

`GET /membresia/censo/cobertura` (nível 1) e `/censo/faltantes` (nível 2 · carrega
telefone). Marcadores em `mem_membros`: `censo_respondido_em` +
`censo_vinculo_declarado`. Painel = **bloco recolhível acima da lista** na aba
Cadastros (`components/membresia/PainelCenso.jsx`) — não aba nova: a Caixa de
entrada dos Grupos já provou que separar em aba faz ninguém achar.

- ⚠️ **A JANELA vai colada no número**, no payload e no título ("de 03/08 até
  hoje"). Reportar "176 pessoas" sem dizer o período fez um número **correto**
  parecer errado uma vez.
- ⚠️ **Pedidos × PESSOAS**: quem responde 2× conta 1 pessoa (mesma régua de
  vínculo × pessoa dos Grupos). Repetir **não é erro**, e a tela diz isso.
- ⚠️ **Nome-placeholder fica FORA do denominador** (`nome NOT ILIKE
  'contribuinte%'` · espelha `ehNomePlaceholder`): descrição de extrato não é
  pessoa a censar, e incluí-la faz a cobertura nascer artificialmente baixa.
- ⚠️ Dia da curva é calculado **em BRT**: `created_at` é UTC e às 21h do Rio o dia
  UTC já virou — sem o deslocamento o culto da noite cai no dia seguinte.
- **Marcado como respondido mesmo com conflito**: coberta é quem RESPONDEU, não
  quem teve os campos aplicados.
- ⚠️ Aprovar linha `aplicado` é **bloqueado** (400): o caminho de atualização
  reaplicaria o formulário inteiro sobre o cadastro, inclusive por cima de valor
  que a equipe corrigiu depois.

### ⚠️ DUAS colagens — uma tabela cada (deadlock 40P01)

A mudança mexe em **duas tabelas vivas** (`mem_cadastros_pendentes` e
`mem_membros`), então virou **duas migrations**, aplicadas em colagens
SEPARADAS: `20260803160000` (pendentes) e `20260803160100` (membros). O SQL
Editor roda a colagem inteira numa transação só; DDL que trava duas tabelas
pode se abraçar com uma consulta de produção que as toca na ordem inversa →
`40P01 deadlock detected`, e a vítima é a migração (rollback total). Foi o que
aconteceu na `20260728150000`. `mem_membros` é a tabela mais quente do sistema
(toda porta de pessoa a toca), por isso vai sozinha. As duas partes são
INDEPENDENTES e idempotentes — qualquer ordem, re-rodar sem medo — e os avisos
do backend dizem **qual parte** falta.

⚠️ Conferir no **catálogo** (`information_schema` / `pg_constraint` /
`pg_indexes`), nunca por `RAISE NOTICE`: o SQL Editor do Supabase não mostra
notice. As queries de conferência estão comentadas no fim de cada arquivo.

### Tolerância à migration ausente (deploy em 2 etapas)

O formulário funciona **com ou sem** a migration: o insert tenta com as colunas do
censo e, em `42703`, repete **sem elas** (a submissão é o que não pode se perder —
lição do `parcelas_max`, agora numa porta pública). O painel responde **aviso**,
nunca 500, e cobre também aplicação **parcial** (número errado é pior que número
ausente). O reconciliador roda **depois** do insert de propósito: se estourar, a
linha continua `duplicado` e vai pra fila — que era o comportamento de sempre.

Teste: `npm run test:censo` (`backend/services/censoReconciliar.test.js` · 10
blocos, sem banco/rede/relógio, **no gate de deploy**). Mutation-testados: tratar
contato como conflito, e o gate de nascimento divergente — é ele que impede o
censo escrever o endereço de uma pessoa no cadastro de outra.

**Pendências operacionais (não são código):** regra no Firewall do Vercel pra rota
do censo · `vinculo_declarado` validado com o Arthur · gerar/imprimir o QR com
`?censo=1` · teto da Meta se quiserem cobrar por WhatsApp quem falta.

---

## [movido] ⚠️ Censo · convite de atualização cadastral p/ quem está SEM CPF (2026-08-04 · migration `20260804120000`)

## ⚠️ Censo · convite de atualização cadastral p/ quem está SEM CPF (2026-08-04 · migration `20260804120000`)

Pedido do Matheus: *"disparar um WhatsApp e um e-mail para todas as pessoas que
não têm CPF cadastrado, mas que tenham o celular ou e-mail, pedindo bem
objetivamente para atualizar seus dados cadastrais, clicando no link (deve ir
junto o link de cadastro de membresia)"*.

⚠️ **NÃO é campanha nova — é o CANAL do censo que já existe.** O link é o mesmo
`/cadastro-membresia?censo=1` do QR impresso do culto, então a resposta cai no
`censoReconciliar` (preenche campo vazio · conflito vai pra fila humana · nunca
sobrescreve edição da equipe) e a cobertura conta sozinha em
`censo_respondido_em`. Criar um formulário próprio pra isso teria duas verdades
sobre "quem respondeu o censo". Card **"Convidar quem está sem CPF"** dentro do
`PainelCenso` (aba Cadastros da Membresia), não tela nova.

**⚠️⚠️ A LEI: o teto da Meta manda no tamanho da rodada, e furá-lo DESCARTA
convite em silêncio.** A conta está em **TIER_250** (250 destinatários únicos/24h)
e a fila **desiste de uma mensagem 36h depois de criada**
(`whatsappFila.IDADE_MIN_DESISTIR_H`). Enfileirar as ~2.000 pessoas de uma vez
não entrega 2.000 devagar: entrega ~250 e as outras ~1.750 **morrem na fila em
dois dias**, sem erro, e a pessoa nunca soube do censo. Por isso:
`TETO_RODADA_WHATSAPP = 200` (folga pros avisos operacionais que dividem a cota
do dia), reenvio é **rodada nova**, e o que ficou de fora é **declarado**
(`adiados`) na tela. Subir esse número sem o tier ter subido é regressão —
`src/test/censoConvite.test.ts` trava em 250.

- **`backend/utils/censoConvite.js`** = régua PURA (quem recebe, quantos saem),
  em `utils/` pra ser testável no gate de deploy. O serviço
  (`services/censoDisparo.js`) lê o banco e envia; **não duplicar régua lá**.
- **`mem_censo_convites`** (migration aplicada 04/08 · conferida no catálogo):
  1 linha por (membro, canal, rodada), UNIQUE parcial. É o que faz o reenvio
  pegar **só quem não respondeu** — sem ela o 2º disparo manda de novo pra todo
  mundo, que é como campanha legítima vira spam e derruba a nota da conta.
  ⚠️ **Não guarda telefone nem e-mail**: o contato vive em `mem_membros` e muda
  quando a pessoa corrige; copiar aqui criaria uma segunda verdade que envelhece.
  Sem PII própria ⇒ fora da whitelist de soft-delete. `enviado_por` é **snapshot
  sem FK**; a FK de `membro_id` existe (lei nº 10 — é ela que faz `merge_membros`
  repontar a tabela) e foi **conferida no `pg_constraint`**, não no arquivo.
- **Números medidos em 04/08** (vivos, sem CPF, nome de gente): **2.658 sem CPF**
  = 2.086 visitante + 571 membro_ativo. Alcançáveis: **2.358** (2.026 por
  telefone · 1.055 por e-mail). ⚠️ **Só 33 têm `whatsapp_optin = true`** — a
  campanha inteira depende de o template ser aceito como **UTILITY** (opt-in é
  exigido só em Marketing, e o gate é a env `WHATSAPP_OPTIN_OBRIGATORIO`). Se a
  Meta reclassificar pra Marketing, o público cai de 2.026 pra 33 e o caminho
  passa a ser o e-mail.
- **Default é `membro_ativo` (517 pessoas), não a base toda.** Visitante entra só
  marcando o chip: são ~1.800 pessoas ⇒ **9 rodadas/dias** no tier atual, e é
  gente que não pediu contato. O default responde a pergunta certa ("a membresia
  está com CPF?") numa semana em vez de num mês.
- **E-mail sai pelo Microsoft Graph** (decisão do Matheus em 04/08: *"não usamos
  o resend para disparo, usamos o microsoft"*) — `services/email.js` já tem Graph
  como primário, e o `Mail.Send` do app Azure **passou a estar configurado** (a
  pendência registrada em 02/07 caiu). ⚠️ O laço de e-mail tem **orçamento de
  tempo** (`ORCAMENTO_EMAIL_MS = 200s`) além do teto de quantidade: o
  `enviarEmail` faz 3 tentativas com backoff (1,5s + 3s), então uma rodada com
  muitos endereços ruins passaria de 300s de `maxDuration` — e função morta no
  meio **não registra o que já enviou**, fazendo a próxima rodada repetir.
- **Disparo SEMPRE manual, sem cron** (lei dos envios de Grupos, 20/07), com
  prévia + **confirmação digitando o número** — é o freio mais forte do sistema e
  cabe aqui porque é o único disparo que fala com centenas de pessoas que não
  pediram nada. Rota do POST é **nível 4**, não 3: editar cadastro é uma coisa,
  falar com 200 pessoas no número institucional é outra.
- **Relay do "Entrar com Apple" (`@privaterelay.appleid.com`) NÃO recebe e-mail**:
  é caixa técnica que a pessoa não lê, e mandar ali a marcaria como convidada.
- **✅ CANAL DE WHATSAPP ABERTO (05/08/2026):** template **`atualizacao_cadastro`**
  aprovado pela Meta (**UTILITY · pt_BR · 2 variáveis**: {{1}} primeiro nome,
  {{2}} o link **como variável de body**, não botão — técnica do
  `grupos_renovacao_temporada` que mantém a categoria) e a env
  **`WHATSAPP_TEMPLATE_CENSO_ATUALIZACAO=atualizacao_cadastro`** setada em
  Production + Preview, **com redeploy** (`vercel redeploy` do deployment de
  produção · conferido no `vercel inspect` que `cbrio.org` e `www.cbrio.org`
  foram realiasados — o log do redeploy só cita `cbrio.com.br`, e acreditar nele
  faria a gente concluir que o ERP tinha ficado no deploy velho).
  ⚠️ Não editar template aprovado: se precisar mudar texto, criar `_v2` (edição
  volta pra revisão da Meta e o envio para).

### ⚠️⚠️ "Aprovar o template" NÃO liga o canal — e a tela dizia que ligou (05/08)

Incidente: o Matheus aprovou o template, apertou disparar **duas vezes** (18:42 e
18:43) e veio perguntar quem havia respondido pelo WhatsApp. **Nada tinha saído**
— a env não existia, então `whatsappPronto()` mantinha o canal fechado. A guarda
funcionou (zero linhas de WhatsApp em `mem_censo_convites`, audiência intacta),
mas a TELA mostrava caixa **verde** com *"Rodada N disparada"* e o motivo real
(`template_nao_configurado`) como **slug cru** no fim da linha.

- **Régua: envio que não enviou ninguém NÃO pode aparecer como sucesso.** Sem
  nenhum envio a caixa fica âmbar, diz "Nada foi enviado — nenhuma pessoa foi
  convidada" e o motivo vem como frase inteira (incluindo o lembrete de que **a
  Vercel só aplica env nova em deployment novo**). A dica de "rode a próxima
  rodada amanhã" desaparece quando não houve rodada.
- **Diagnóstico com evidência, não suposição:** `mem_censo_convites` (6 rodadas,
  todas e-mail) + `whatsapp_envios` (zero do censo) + `vercel env ls` (nenhuma
  env de template do censo, sob nenhum nome) + runtime logs (os dois POST com
  200). "Ele disse que disparou" não é dado.

### ⚠️⚠️ CANÁRIO · a env existir não prova que o template funciona

`whatsappPronto()` só olha se a env está **setada**. Nome com um caractere errado,
template não aprovado ou com nº de variáveis diferente **passa pela guarda** — e
`enfileirarLote` **INSERE sem tentar enviar**. O estrago: as ~200 pessoas viram
`mem_censo_convites` (convidadas), a Meta recusa tudo depois (**132001 é falha
PERMANENTE, sem retry**) e a rodada seguinte as pula. **Convite perdido pra
sempre** — o mesmo dano que o semáforo evita, entrando pela porta do lado.

Agora a **primeira mensagem vai sozinha e SÍNCRONA** (`fila.enfileirar`, que tenta
na hora). Recusa **permanente** ⇒ rodada abortada, `motivo: 'template_recusado'`,
**ninguém registrado** (nem a primeira, que não foi entregue). Falha
**passageira** (teto do TIER_250) segue enfileirando normal — ali a fila é dona da
entrega e o convite conta. Custo do canário: 1 mensagem.

⚠️ A distinção usa o `permanente` que a fila já expõe (`falhaPermanente`), não uma
régua nova — duas réguas pra decidir "isso é definitivo?" divergiriam.

**Audiência medida em 05/08 (o que a rodada de WhatsApp pega):** sem CPF, com
telefone alcançável e **ainda não convidada em nenhum canal** — **118**
`membro_ativo` (cabe numa rodada só) e **1.202** visitantes (≈7 rodadas no teto
de 200/dia). Os outros 449 `membro_ativo` já receberam e-mail, então só entram
marcando **canal cruzado** (reforço deliberado).

---

## [movido] ⚠️⚠️ APP × ERP · varredura de tabelas e variáveis (2026-08-05)

## ⚠️⚠️ APP × ERP · varredura de tabelas e variáveis (2026-08-05)

Pedido do Marcos: *"quero que você avalie todos as variáveis e tabelas dentro do
nosso sistema mobile, pois algumas coisas acho que não fica alinhado, vi um caso
aqui do next que diz que nao tem turma aberta, mas tem no sistema... isso é só um
exemplo, mas provavelmente tem outras"*. Tinha. Inventário: **22 tabelas lidas
DIRETO pelo app** (anon key + RLS) + **~30 pelas rotas `/api/app/*`**. O padrão
que gera divergência é sempre o mesmo — **o app reproduz a régua do ERP em vez de
consumi-la**, e quando a régua muda de um lado, o outro não sabe.

**⚠️ LEI que sai daqui: quem decide o que é "válido" é o BACKEND, não o app.**
O app lê tabela direto pelo que é dado DELE (perfil, devocional, cartão). Régua
de negócio — o que está aberto, quem pode se inscrever, qual status vale — vem de
endpoint. Foi assim que grupos (04/08) e Next (hoje) foram consertados.

### 1 · NEXT lia a camada APOSENTADA (o caso que ele reportou) — CORRIGIDO

Medido em 05/08: `next_eventos` tem **8 'agendado' cuja data máxima é 21/06**
(todos no passado) e o app filtrava `.gte('data', hoje)` → lista vazia → *"não há
encontros do NEXT agendados"*. No mesmo instante, `next_turmas` tinha **2 turmas
ABERTAS**: "Agosto/01 2026" (encontros 02 e 09/08 · 35 matrículas) e "Agosto/02
2026" (16 e 23/08 · 3). Os 3 endpoints de MEMBRO do app estavam no modelo antigo
enquanto os de RESPONSÁVEL (escritos depois) já estavam no vivo — dois modelos no
mesmo arquivo. Agora `/next/me`, `/next/inscrever` e `/next/encontros/:id/checkin`
leem **turma → encontro → matrícula → presença**. Simulado contra produção antes
de mergear: de `[]` para **3 encontros** (09, 16 e 23/08).
- ⚠️ **De brinde, conserta o KPI**: `frequencia_next` passou a ler `next_presencas`
  em 22/07 (migration 20260722250000) e o check-in do app carimbava
  `next_inscricoes.check_in_at` — **check-in pelo celular não contava** desde
  então. Agora grava presença no modelo vivo.
- ⚠️ **`next_turmas.origem_mes` é NULL nas turmas de 2026** (só a de dez/2024 tem),
  então `resolverTurma(mes)` do espelho nunca casava por mês e caía na "turma
  aberta mais recente" = Agosto/02 (16/08), não a em curso. Por isso o
  `/next/inscrever` escolhe a turma do **próximo encontro**, não a mais nova.
- ⚠️ `espelharMatriculaDoEncontro` (services/nextMatricula.js) ficou **dormente** —
  só `chaveMesMembro` é importado. Não apagar: o serviço documenta a chave
  `origem_mes_key` e o porquê do espelho.
- ⚠️ 1 Next por mês por pessoa é regra do banco (UNIQUE `origem_mes_key`): quem já
  tem matrícula em agosto e tenta a 2ª turma recebe `jaInscrito`, não erro.

### 2 · Status que NÃO EXISTE no banco (grupos) — CORRIGIDO no app

`grupo-detalhe.tsx` decidia se a pessoa podia pedir entrada com
`pedido.status !== "recusado"` — e **"recusado" nunca existiu**: o CHECK é
`pendente|aprovado|rejeitado|devolvido|encaminhado`. Quem levou recusa ficava com
"aguardando aprovação" **pra sempre**, em qualquer grupo. Medido: 20 pedidos vivos
rejeitados/devolvidos (14 pessoas · 1 com conta no app). Comparação de string
contra enum do banco sem fonte única é a mesma classe do `"recusado"`: **listar os
status que valem, e comentar de onde vêm**.

### 3 · Filtros que o ERP aplica e o app não (RLS não cobre) — CORRIGIDOS

- **`mem_grupos`**: a policy é `FOR SELECT USING (true)` (catálogo) — não filtra
  nada. O app abria grupo por id sem `deleted_at`/`ativo`: **137 soft-deletados +
  38 `ativo=false` vivos** eram abríveis por deep link, com botão "Quero
  participar".
- **`mem_contribuicoes`** (comprovante de IR) e **`vol_inscricoes`** (soft-delete
  LIBERADO em 28/07 pela M6b): sem `deleted_at IS NULL`. Hoje 0 apagadas nas duas
  → **gatilho armado, não estrago**; o filtro é o que impede o dia em que houver.
- ✅ **`app_destaques` NÃO tem esse problema** (alarme meu que caiu): a policy
  `destaques_publicos` filtra `ativo` + janela `publica_em/expira_em` no banco. O
  arquivo vive no repo do APP (`supabase/destaques.sql`), não nas migrations do
  ERP — ver o item 5.

### 4 · Dia em UTC no app (a mesma armadilha do `/culto/agora`)

`lib/cultos.ts` calculava "hoje" com `toISOString()`. Das 21h BRT em diante o dia
UTC já virou, então **o culto de quarta (20h) saía da lista de "próximos" durante
o próprio culto**. Corrigido com a régua do `hojeBRT()` do backend. ⚠️ Toda data
de operação da igreja é BRT — vale pro app como já valia pro censo, pro Kids e pro
`cultoDeAgora`.

### 5 · O app tem 4 portas de inscrição; o sistema tem 7

O hub `/inscricoes` do app oferecia Batismo · Grupos · NEXT · Voluntariado (+
"Eventos abertos"). Faltava **Apresentação de crianças** — o "apresentação de
bebês" que ele viu na aba do sistema. Entrou como **porta WEB** (abre
`cbrio.org/apresentacao-criancas` no navegador in-app, como os eventos): a porta
exige dado de CRIANÇA e consentimento de MENOR (art. 14 §1º) com snapshot do
texto, e uma 2ª implementação seria um segundo caminho de escrita de pessoa —
exatamente o que o Contrato de porta existe pra impedir. Seguem fora do app (por
serem de gestão, não de membro): líderes/anfitriões e o totem de bebês.

⚠️ **O SCHEMA DO APP VIVE NO REPO DO APP**, não nas migrations do ERP:
`app_destaques`, `app_notificacoes`, `app_push_tokens`, `app_grupos_temporada`,
`app_solicitacoes_exclusao`, `handle_new_user_membro` e cia. estão em
`igreja-cbrio/Aplicativo-CBRio/supabase/*.sql`. **É por isso que a lei do gatilho
de `auth.users` (04/08) registrou "nunca foi commitado"** — não estava neste repo;
está no outro. Auditoria de tabela `app_*` que só olhe `supabase/migrations/`
daqui conclui que a tabela não existe.

### Alarmes meus que NÃO se sustentaram (registrados de propósito)

- **"o sexo do app está sendo descartado"**: a gravação de `mem_membros.genero`
  **já está na main** (`appIdentidade.js` · e melhor que a minha versão: filtra
  `deleted_at`). Ia "consertar" o que funciona.
- **"`app_destaques` ignora `ativo`/janela"**: a RLS filtra (item 3).
- Números que corrigi na 2ª medição: os "113 rejeitados" de grupos eram **20
  vivos** (o resto é teste de julho soft-deletado) e `vol_inscricoes`
  soft-deletadas são **0**, não "várias".

**Fica em aberto (não é código):** o `/completar-cadastro` do app **exige** sexo e
CPF no cabeçalho do arquivo mas o CPF **não bloqueia** no código (decisão da
revisão da Apple) — o cabeçalho mente pra próxima sessão e foi corrigido no repo
do app. E os gates `exigirCpf: true` / `completo: falta.length === 0` seguem
represados até o build iOS ser aprovado.

### Rodada 2 · "corrigir todos esses achados" (mesmo dia)

Ele mandou fechar tudo. O que entrou DEPOIS da 1ª rodada:

- **⚠️ `resolveMembroApp` ignorava soft-delete no caminho do profile.** Os outros
  dois caminhos (e-mail e CPF) filtravam `deleted_at` e este não — então cadastro
  que a equipe APAGOU continuava servindo o app inteiro, e tudo que a pessoa
  fizesse (inscrição, matrícula, devocional) pousava num membro que o ERP
  considera fora da base. Caso real: a limpeza de 04/08 soft-deletou **3 cadastros
  que têm conta no app**. Sem membro, o `CadastroGate` manda completar o cadastro
  e o matcher resolve — que é o efeito desejado.
- **`tipo:'next'` no `POST /app/inscricoes` MENTIA.** Ia pro ramo `next` do
  `fn_app_inscricoes_fanout`, que procura `next_eventos` agendado e futuro — e não
  existe nenhum desde 21/06: a linha virava `'processado'` e **nada era criado**,
  com a pessoa vendo "enviado". Agora passa pela MESMA régua do `/next/inscrever`
  (helper `matricularNoNextAberto`, extraído pra não haver duas réguas de "em qual
  turma essa pessoa entra"). Medido: **0 linhas `tipo='next'`** em
  `app_inscricoes` — é rede de segurança pra build antigo, mas rede que mentia.
  ⚠️ O ramo SQL do fanout **não foi tocado** (patch dinâmico da 20260729060000
  seria revertido por um `CREATE OR REPLACE` do repo): ele segue no-op, e agora
  isso é inofensivo porque o JS resolve antes.
- **`vol_inscricoes.status` tem 7 valores e o app tratava 3.** Medido: `integrado`
  575 · `inscrito` 80 · `enviado_ministerio` 68 · **`nao_responde` 69 ·
  `nao_pode_ou_duplicata` 19 · `kids` 3**. A divergência era na MESMA abertura do
  app: o hub fazia `=== 'integrado' ? ativo : pendente` (quem a equipe encerrou
  via "Pendente") e a tela de Servir só reconhecia 3 status (a mesma pessoa caía
  no `else` e via o FORMULÁRIO). Régua única agora em `lib/volStatus.ts` do app —
  status novo no ERP entra lá; desconhecido vira "nenhum" (deixa a pessoa agir),
  nunca "pendente" (fila que ninguém está tratando).
- **11 leituras do app sem `deleted_at`** em tabela soft-deletable (`mem_membros`
  ×5, `mem_devocionais` ×4, `mem_grupos` ×2, `cultos`) — a RLS não filtra nada
  disso. ⚠️ No `grupo-editar` entrou só `deleted_at`, NÃO `ativo`: o líder precisa
  poder editar grupo pausado; quem trava a inscrição é a face pública.
- **O dia em BRT virou helper** (`lib/dataBRT.ts`, espelho do `hojeBRT()` daqui):
  além da lista de cultos, a chave de cache dela e o filtro de indisponibilidade
  do voluntariado estavam em UTC. ⚠️ O check-in do devocional segue em hora do
  APARELHO de propósito (o "hoje" de quem lê é o do lugar onde a pessoa está).
- **Botão FÍSICO do Android = a mesma árvore da seta** (`BackHandler` no
  `(app)/_layout.tsx`). ⚠️ Na Home e em `/completar-cadastro` ele NÃO intercepta —
  engolir o back na raiz é como se faz um app que não fecha, e a Play Store
  reclama disso.

**Auditoria automática que passou** (registro pra não refazer): rodei as **38
consultas literais do app contra o schema de produção** — `0 erros de coluna`.
Isso importa porque select que nomeia coluna inexistente faz o PostgREST recusar
a query INTEIRA, e o app trata como "vazio" (foi assim que o `parcelas_max` e a
minha própria sonda do `next_turmas` enganaram antes). Também conferido:
`kids_vinculo_solicitacoes` usa `pendente|aprovado|rejeitado|cancelado` e o app
compara os certos.

**Segue represado por decisão, não por esquecimento:** `exigirCpf: true` /
`completo: falta.length === 0` no `/identidade/status` — ligar isso hoje travaria
as contas de revisão da Apple na tela de cadastro (o revisor não tem CPF
brasileiro), que é a rejeição clássica de "não passamos do registro". Ligar junto,
depois da aprovação do build iOS.

---

## [movido] Solicitações · backbone administrativo (estado consolidado)

## Solicitações · backbone administrativo (estado consolidado)

### Form de criação reusável · NovaSolicitacaoForm (2026-07-03)
O form oficial de "Nova Solicitação" vive em
`src/components/solicitacoes/NovaSolicitacaoForm.jsx` (extraído da página).
Props: `prefill`, `categoriasPermitidas`, `onCreated(criada)`, `onCancel`,
`onDirtyChange` (o host liga o `useConfirmarSaida` · fechar com rascunho pede
confirmação). `Solicitacoes.jsx` é o consumidor nº 1; a Produção abre o mesmo
form a partir da ocorrência do culto. **Ponto de entrada novo = reusar esse
componente** (não duplicar intake) — aprovação/SLA/roteamento/KPI ficam 100% no
backend, iguais pra qualquer host.

### Form · dualidades resolvidas (decisões do Marcos · 2026-07-07)
Auditoria de perguntas repetidas no intake. Decisões (só frontend · backend
intocado → bundles antigos abertos seguem enviando normal):
- **Total de Compras é CALCULADO** (não digitável): "Valor estimado (R$)" saiu
  de `showValueField` pra compras; o form mostra "Total estimado do pedido"
  somado dos itens (respeita R$ total/por unid.) e o backend soma server-side
  (fallback que já existia). Reembolso/Pagamento mantêm o campo.
- **Justificativa única**: urgente NÃO abre 2ª caixa — o porquê vai na
  "Justificativa do pedido" (label ganha "(inclua o porquê da urgência) *" e a
  validação exige ≥5 chars só na urgência MANUAL). No submit o form copia a
  justificativa pra `justificativa_urgencia` (mapa de urgência frequente
  continua alimentado).
- **Urgente automático pela data**: `data_necessaria` mais curta que o
  `sla_resolucao_horas` padrão (não-urgente) da categoria → `eh_urgente=true`
  automático + aviso âmbar; checkbox fica marcado/desabilitado. Marketing fora
  (prazo é da triagem). Urgência automática não exige justificativa (auto-texto
  "Data necessária abaixo do prazo padrão").
- **Mantidos de propósito**: Descrição × Itens (necessidade ≠ o que comprar) e
  Fornecedor sugerido × Link por item (casos diferentes: contato conhecido ×
  compra online).
- Resíduo `urgencia: 'normal'` removido do FORM_INITIAL (select saiu da UI em
  2026-05-30 · coluna segue com default 'normal' no backend).

### ⚠️ Compras · valor do item: seletor total/unitário · grava TOTAL DA LINHA (2026-07-07)
Caso real (aventais/coletes): Marcos pôs 30 coletes · R$ 1.000 esperando "essa
linha custa ~R$ 1.000", mas o backend somava `valor × quantidade` → pedido de
R$ 60.000. Solução em 2 passos (mesmo dia): (1) valor do item passou a ser o
total da linha; (2) Marcos pediu ESCOLHA explícita → cada item ganhou um
seletor **"R$ total" | "R$ por unid."** (`valor_tipo`, default 'total' · sem
migration — campo só do payload). O POST normaliza: 'unitario' → `valor ×
quantidade`; `solicitacao_itens.valor_estimado` guarda **SEMPRE o total da
linha** e a soma do pedido NUNCA multiplica de novo. No modo unitário o form
mostra "= R$ X no total da linha" ao vivo. Bundle antigo (sem valor_tipo) cai
em 'total'. Dado histórico pode ter mistura de semânticas (era ambíguo) — o
valor é estimativa editável, sem migração.

### Fotos anexadas no intake · Serviços/Serviço externo (2026-07-07)
Pedido do Marcos: quem pede **Serviços (manutenção)** ou **Serviço externo
(cotação)** pode anexar até 3 fotos no form pra quem atende/cota avaliar pela
imagem (goteira, equipamento, referência). Compras NÃO ganhou o campo — já tem
foto POR ITEM (`solicitacao_itens.imagem_url`).
- **Coluna `solicitacoes.imagens_url` (jsonb · array de URLs)** · migration
  `20260707120000` (aditiva/idempotente). Upload client-side pro bucket
  `solicitacoes` (path `fotos/` · bucket+policies já existiam da 20260623200000),
  mesmo padrão do comprovante/foto-de-item.
- `NovaSolicitacaoForm.jsx`: campo `imagens` (Files) + componente `FotosAnexos`
  (thumbnails + adicionar/remover · cap `MAX_FOTOS=3`) exibido só pra
  `infraestrutura`/`servico`; no submit sobe as fotos e manda `imagens_url`.
- Backend POST: sanitiza (strings · cap 5 · 2000 chars) e **só inclui a coluna
  no insert quando há foto** — flows antigos não tocam a coluna (tolera a
  migration ainda não aplicada; só o caminho novo exige ela).
- Detalhe (`Solicitacoes.jsx` DetailDialog): bloco genérico "Fotos anexadas"
  (thumbnails clicáveis · abre em tamanho real) pra qualquer categoria com
  `imagens_url` — o GET usa `select('*')`, a coluna flui sozinha.

### Co-aprovadores de origem + e-mail das aprovações (2026-06-22)
Pedido (gestão): a vice-diretora **Juliana Leão** (`juliana.leao@cbrio.org` ·
cargo `diretor-rh` · solicitações nível 2) aprova as solicitações de origem do
**setor Gestão JUNTO com o Eduardo Gnisci** — qualquer um dos dois (não os dois).
- **Tabela `setor_coaprovadores`** (migration `20260622140000` · aditiva ·
  `setor` FK `setor_diretor` + `profile_id` FK `profiles` + `nome` snapshot · RLS
  catálogo: read autenticado / write super-admin / service). Seed: Gestão→Juliana.
  Para outro setor, é só inserir uma linha.
- **`solicitacoes.js`** (helpers `setoresQueCoaprova`/`diretorIdsQuePodeAprovar`/
  `podeAprovarOrigem`/`coaprovadorIdsParaDiretor` · **best-effort**, degradam pro
  diretor-só se a tabela faltar): aba `aprovar` e `meu-papel` (`eh_diretor_origem`
  + contagem) incluem os setores co-aprovados; `aprovar-origem`/`rejeitar-origem`
  aceitam co-aprovador (motivo registra quem foi · NÃO sobrescreve o diretor_id);
  o GET lista devolve `aprovacao_origem_aprovadores` (nomes) e a UI mostra
  "Aguardando aprovação de **Eduardo ou Juliana**". O alerta de origem no POST
  notifica diretor + co-aprovadores.
- **Kanban · coluna "Aguardando aprovação" (2026-06-22)**: `aguardando_aprovacao_origem`
  ganhou coluna PRÓPRIA no board da aba "Atender" (`KANBAN_COLUMNS` · `readOnly:true`,
  match `aguardando_aprovacao_origem`). Antes sumia do quadro (aparecia só na Lista) —
  o responsável da área (ex.: Amaury em compras) vê que a solicitação está vindo mas
  **não pode movê-la** (card não-arrastável + coluna não aceita drop · quem aprova é o
  diretor/co-aprovador na aba "Aprovar"). Grid do board foi pra 7 colunas.
- **E-mail das aprovações**: `notificar({..., email:true})` (novo param) manda
  e-mail pros mesmos destinatários do aviso in-app (herda a dedup). Hoje ligado
  só no alerta "Aprovar solicitação" (vai pros aprovadores · ex.: Eduardo +
  Juliana). Canal em `services/email.js`: **primário = Microsoft Graph** (mesma
  config do SharePoint/Cérebro · `MICROSOFT_TENANT_ID/CLIENT_ID/CLIENT_SECRET` +
  `getGraphToken`), **fallback = Resend**. Remetente Graph = `GRAPH_MAIL_SENDER ||
  MERGE_MAIL_SENDER || noreply@cbrio.org` (caixa real do tenant · app Azure
  precisa de `Mail.Send`). `FRONTEND_URL` vira o link "Abrir no sistema".
  No-op gracioso se nenhum canal estiver configurado.
- ⚠️ Aplicar a migration `20260622140000` antes do merge (backend tolera ausência,
  mas o recurso só funciona com a tabela criada).

Fonte única dos KPIs administrativos (SLA, NPS, throughput, urgência). Schema:
`sla_definicoes` (prazos por área/subcategoria), `area_alcadas`,
`solicitacoes_eventos` (audit), views `vw_solicitacoes_sla` (alimenta KPIs ADM
em `painel.js`) e `vw_reserva_espacos`. Triggers calculam SLA e decidem
aprovação financeira por alçada.

- **Dois portões em sequência**: (1) **aprovação de origem** (Spec 001 ·
  transversal): toda solicitação passa pelo diretor do SETOR do solicitante
  (Gestão=Eduardo Gnisci · Criativo=Pedro Menezes · Ministerial=Arthur Serpa ·
  tabela `setor_diretor` + `fn_normalizar_setor()`); diretores/diretoria geral/
  service_role dispensam; rejeitada é IMUTÁVEL (cria nova). (2) **aprovação
  financeira**: compras/reembolso/pagamento SEMPRE (sem bypass por
  valor · decisão de 22/05).
- **⚠️ Lição (service_role × trigger)**: o backend insere com `auth.uid()=NULL`,
  então a regra de roteamento NÃO pode viver só em trigger que lê `auth.uid()`
  — o POST chama `fn_solicitacoes_rotear_origem(uuid)` via RPC e grava o
  resultado; o trigger fica de rede de segurança. (Bug que marcava tudo
  `dispensada` e esvaziava a aba Aprovar.)
- **Categorias vigentes no form**: TI · Compras · Reembolso · Reserva de Espaço
  · Serviços (=manutenção interna → `infraestrutura`, sem gate financeiro) · Pagamento ·
  Marketing (por dor) · Férias/Licença. `servico` (contratação externa) e
  `outro` saíram do form (slugs seguem na CHECK pra linhas históricas).
  Roteamento: Compras→Amaury+financeiro · Serviços→Amaury · Pagamento/Reembolso→financeiro ·
  Reserva→Amaury · TI→TI · Marketing→Pedro · Férias→RH.
- **`area_cliente` é TEXT derivada de quem preenche** (kpi_areas → usuario_areas
  → profile.area · ignora o body). Lições de CHECK: a constraint de `categoria`
  precisa acompanhar `ALLOWED_CATEGORIES` (bug A); `area_cliente` era enum de 6
  áreas de culto e estourava com as 21 sub-áreas (bug C · virou text).
- **Kanban agrupa os 10 status reais** em 5 colunas via `match[]`
  (`aguardando_aprovacao_origem` fica fora — vive na aba Aprovar). NPS
  pós-conclusão (card destacado + lembrete cron 24h) alimenta os 11 KPIs
  ADM-*-Q automaticamente.
- **Follow-ups ainda válidos**: expor subcategorias de RH no form
  (vaga_nova/treinamento/documentacao/duvida), calendário visual de reservas,
  dashboard de urgência frequente, painel solicitante × responsável separados.
  Detalhes/pendências originais no legado.

---

## [movido] Compras · escanear nota fiscal → financeiro lançar (2026-06-12)

## Compras · escanear nota fiscal → financeiro lançar (2026-06-12)

Pedido do Marcos (via gestão): Amaury/Pery escaneiam a nota fiscal da compra
(foto ou PDF) na aba **Notas Fiscais** do `/admin/logistica`, o sistema extrai
os dados + sugere a categoria contábil, e a nota vai pra fila do financeiro
lançar — rastreabilidade de cada compra ponta a ponta.

- **Fluxo**: scan (`POST /logistica/notas/escanear` · multer 15MB jpg/png/webp/pdf)
  → arquivo no bucket `log-arquivos/notas-fiscais/` → **Haiku com visão**
  (`services/nfScanner.js` · `extrairNotaFiscal`) extrai emitente/CNPJ/número/
  chave/data/valor/itens/resumo → `sugerirCategoria` reusa o
  `financeiroClassificador.classificarLancamento` (memória do fornecedor +
  regras por CNPJ) com **fallback Haiku** escolhendo no plano de contas de
  despesa → nota nasce `status='registrada'` já preenchida → compras revisa no
  modal (categoria sugerida editável · `GET /logistica/notas/aux/categorias`) →
  **"Enviar pro financeiro"** (`status='enviada_financeiro'` + `notificar()`
  módulo financeiro) → o financeiro vê em **Operacional → Notas de compras**
  (`NotasCompras.jsx` · `GET /financeiro-v2/notas-compras`) → **Lançar**
  (`POST /notas-compras/:id/lancar`) cria `fin_transacoes` (despesa) e
  **concilia com o extrato**: se existe exatamente 1 débito OFX não
  classificado com o mesmo valor em [emissão, emissão+15d], a transação nasce
  `conciliado` linkada ao bruto (e o item da fila de classificação vira
  `ignorado`); senão nasce `pendente` (exige escolher a conta bancária).
  **Devolver** (`/rejeitar`) → `status='rejeitada'` + notifica logística;
  compras corrige e reenvia. Lançar também chama `aprenderClassificacao` com o
  CNPJ do fornecedor → o próximo débito dele já vem sugerido na fila OFX.
- **Tudo em `log_notas_fiscais`** (sem tabela nova) · migration
  `20260612120000_nf_scan_compras.sql`: colunas de fluxo (status/descricao/
  itens/extracao_raw/sugestao_*/enviada_*/lancada_*/transacao_id/
  rejeitada_motivo) + **catch-up de drift git↔prod** (a tabela viva já tinha
  storage_path/origem/ml_order_id/xml_content/emitente_* fora do git, e NÃO
  tinha tipo/observacoes/created_by da migration original — o POST /notas
  manual estava quebrado em prod por inserir `tipo`; consertado junto).
- **Decisões**: review-before-apply nas 2 pontas (compras revisa a extração ·
  financeiro confirma a categoria antes de virar transação — nada entra
  direto); a sugestão de categoria fica em colunas `sugestao_*` (a transação
  guarda o final · `classificacao_origem` mapeia memoria/regra/ia/manual);
  notificações: envio→financeiro, lançada/devolvida→logistica, cron 3+ dias
  parada→financeiro (`notificacaoGenerator`).
- ⚠️ **Limitação conhecida (follow-up)**: NF lançada como `pendente` (sem
  débito no extrato ainda) NÃO é conciliada automaticamente quando o OFX
  chegar depois — o débito aparece na fila de classificação normal e, se
  aprovado lá, duplica a despesa. Hábito: ao reconhecer o débito de uma NF já
  lançada, **ignorar** o item da fila. Conciliação retroativa automática fica
  pra uma próxima leva.
- Sem env nova (`ANTHROPIC_API_KEY` já existe). Modelo: Haiku 4.5 (regra da
  casa pra classificação).

## Compras · aba Compras (ledger do Pery) + scan + vínculo fiscal (2026-06-18)

Pedido do Matheus: a aba **Compras** da Logística substitui a planilha manual
"CONTROLE DE COMPRAS FIXOS E VARIÁVEIS" que o Pery alimentava à mão. NÃO confundir
com a aba **Notas Fiscais** (fluxo Amaury→financeiro que CRIA `fin_transacoes`): aqui a
compra é o registro operacional do Pery e VINCULA com a saída que JÁ existe no
balanço (sentido inverso).

- **Tabela `log_compras`** (migration `20260618160000` · aditiva): espelha a
  planilha (data_compra, n_pedido, comprador, fornecedor, materiais, `centro_custo`
  = coluna TORRE, valor, forma_pgto, status_entrega, parcelas) + scan
  (origem_registro planilha|scan|manual, storage_path, emitente_cnpj, numero_nota,
  extracao_raw/confianca) + aprovação (`status_aprovacao` pendente|aprovada|
  rejeitada · planilha nasce aprovada, scan nasce pendente) + vínculo fiscal
  (`fin_transacao_id` FK + `vinculo_status` nao_vinculada|sugerida|confirmada).
  PII-leve: `deleted_at` + whitelist (anexada lendo a lista viva) + RLS por módulo
  `logistica` (SELECT≥1, write≥2, delete super-admin) + service_role. `import_chave`
  UNIQUE (hash conteúdo+linha) = idempotência da importação.
- **Importação** (`services/comprasImporter.js` · `POST /logistica/compras/importar`
  multer xlsx): lê as 3 abas (FIXOS/VARIÁVEL/CARTÃO) com header detectado por
  conteúdo (robusto a offset de range — a aba CARTÃO começa em A2). Upsert por
  `import_chave` (reimportar o mesmo arquivo não duplica). Carga inicial 2026 = 502
  compras (R$ 341.598,33). Botão "Importar planilha" na aba.
- **Scan** (`POST /logistica/compras/escanear` · reusa `nfScanner.extrairNotaFiscal`
  Haiku): foto/PDF → IA extrai → compra nasce `pendente` → **fila de aprovação do
  Pery** (ele confere e aprova/rejeita/edita · o sistema NUNCA lança sozinho) →
  `notificar('logistica')`. Botão "Escanear nota" (input capture=camera no mobile).
- **Vínculo com a saída do balanço** (`services/comprasMatch.js` · `GET
  /compras/:id/sugestoes-vinculo` + `POST /vincular|/desvincular`): sugere
  `fin_transacoes` tipo='despesa' por valor (±2%) + janela de data (−7/+45d) +
  similaridade de texto (fornecedor/materiais × descrição), ranqueado, marcando as
  já vinculadas a outra compra. **Confirmação SEMPRE manual** (nunca vincula
  sozinho) — serve pra quem lança o financeiro cruzar a info fiscal certinha.
- **Frontend**: `src/pages/admin/logistica/LogisticaCompras.jsx` (aba nova índice 4 ·
  reindexou ComprasML→5/Rastreio→6/Estoque→7/Solicitações→8) — KPIs, fila de
  aprovação, tabela com filtros (comprador/centro/pagamento/status/vínculo/mês),
  modais de conferência e de vínculo. `api.js`: `logistica.compras.*`.
- **Visual vidro**: o módulo Logística inteiro migrou do estilo sólido pro tema
  vidro (StatCards translúcidos com tint do acento em vez de fundo sólido, KPI/modais
  com `var(--panel)`+blur); tabelas seguem nítidas (regra de ouro).
- Sem env nova (`ANTHROPIC_API_KEY` já existe). ⚠️ Aplicar a migration
  `20260618160000` antes do merge; depois importar a planilha pela própria aba.

### Consolidação com financeiro/RH + câmera (2026-06-18 · 2ª leva)

Migration `20260618210000` (aplicada): `log_compras.comprador_id` (FK
`rh_funcionarios`) + `log_fornecedores.endereco`.

- **Centro de custo = do financeiro**: o campo deixou de ser texto livre e passou
  a referenciar `fin_centros_custo` (`centro_custo_id`). **Vincular a saída do
  balanço consolida**: a compra herda o `centro_custo_id` da `fin_transacoes`
  vinculada. Endpoint `GET /logistica/compras/aux/centros-custo` (ativo +
  aceita_lancamento). O texto `centro_custo` (TORRE) vira fallback histórico.
- **Comprador = colaborador real** (`rh_funcionarios`): `comprador_id` + select no
  modal (`GET /compras/aux/compradores` = ativos). Backfill por mapeamento
  confirmado pelo Matheus (Erivelton/Pery/Amaury de Araújo Junior/Yago Coelho
  Torres/Juliana/Marcos Paulo/Juninho=Pedro Luis Barreto Litwinczuk Júnior) ·
  495/502 (os 7 restantes = "Cartão"/vazio).
- **Fornecedor find-or-create**: ao lançar/escanear/aprovar, `resolverFornecedor`
  acha por CNPJ/nome ou **cria** em `log_fornecedores`. A aba Fornecedores
  **sinaliza "Incompleto"** (badge âmbar + filtro) quando falta CNPJ/endereço/
  telefone. Backfill criou os fornecedores das 502 compras.
- **Escanear nota = câmera**: o botão abre `CameraModal` (getUserMedia
  facingMode environment) com captura + fallback "Enviar foto/arquivo".
- `COMPRA_SELECT` (logistica.js) embute fornecedor + `centro_fin:fin_centros_custo`
  + `comprador_fn:rh_funcionarios`. ⚠️ Aplicar `20260618210000` + `NOTIFY pgrst`
  (os embeds precisam do schema recarregado).

### Nota fiscal por foto no WhatsApp (2026-06-18 · 3ª leva)

Qualquer número manda **"nota fiscal"** pro bot → ele pede a(s) foto(s), aceita
**várias** (uma de cada vez, perguntando "tem mais?"), e ao finalizar extrai
TODAS com **Opus 4.8** (`claude-opus-4-8` · melhor visão) e cria uma **compra
pendente por nota** na aba Compras (aguardando aprovação · nada entra direto).

- **`services/whatsappNota.js`** · `tratarNotaFiscal({m,telefone,texto,messageId})`:
  intercepta no `publicWhatsapp.js` **ANTES da checagem de líder** (logo após o
  dedup) — qualquer número usa. Só assume quando há **sessão de nota aberta** ou
  **gatilho** (`ehGatilho`: "nota fiscal"/"nf"/"enviar nota", ou "nota" sozinha
  curta sem números — não dispara em relato de culto/grupo); senão devolve
  `false` e o fluxo normal segue. Sessão = `whatsapp_coletas` (status
  `aguardando_info`, `parsed.fonte='nota_fiscal'`, `fotos[]`, `msg_ids[]` dedup),
  janela 60 min. Foto → `baixarMedia` (Meta) → bucket `log-arquivos`
  (`compras/whatsapp/...`). "não/acabou/só essa" finaliza · "sim/mais" pede a
  próxima · "cancelar" descarta.
- **`services/comprasShared.js`** (novo · extraído de logistica.js):
  `resolverFornecedor` (find-or-create), `matchCompradorPorTelefone` (casa o
  telefone do remetente com `rh_funcionarios` ativo → sugere comprador) e
  `criarCompraPendenteDeNota` (cria `log_compras` pendente · `origem_registro='whatsapp'`).
  `nfScanner.extrairNotaFiscal(buffer, mime, model)` ganhou o param de modelo
  (default Haiku; WhatsApp passa Opus).
- **Sem migration, sem env nova** (reusa `whatsapp_coletas` + `log_compras` +
  `WHATSAPP_ACCESS_TOKEN`/`ANTHROPIC_API_KEY`). Notifica `logistica` ao criar.
  ⚠️ Custo: Opus por nota é mais caro — decisão do Matheus ("melhor modelo").

---

## [movido] Grupos × Bot WhatsApp · estudo semanal + relato do encontro (2026-06-10)

## Grupos × Bot WhatsApp · estudo semanal + relato do encontro (2026-06-10)

Marcos: o bot manda o ESTUDO DA SEMANA pros líderes de grupos e, no dia
seguinte ao encontro, o líder responde por TEXTO ou ÁUDIO quantos foram,
QUEM foi e um resumo (+ FOTO) — vira histórico por grupo e alimenta a aba
Relatórios. Áudio: decisão do Marcos = código pronto agora, a chave de
transcrição ele cria depois.

- **Limitação Meta:** a Cloud API NÃO posta em grupo de WhatsApp → estudo é
  broadcast **1:1** pros líderes com escopo `grupos`. Fora da janela de 24h
  exige TEMPLATE aprovado: envs opcionais `WHATSAPP_TEMPLATE_ESTUDO_GRUPO` e
  `WHATSAPP_TEMPLATE_LEMBRETE_GRUPO` (fallback automático; sem elas tenta
  texto livre e loga a falha na coleta).
- **Serviço `services/whatsappGrupos.js`** (arquivo novo · não mexe nos do
  fluxo de culto): `enviarEstudoSemanal()` (material `estudo_semana=true` em
  `mem_grupo_documentos` · marca-se na aba Materiais · 1 por vez),
  `enviarLembretesEncontro()` (grupos com `dia_semana` = ontem → pergunta ao
  líder · líder resolvido por `whatsapp_lideres.grupo_id` OU profile→membro
  = `mem_grupos.lider_id`), `tratarMensagemGrupos()` (interceptor do webhook),
  `aplicarColetaGrupoEncontro()` (fila → RPC `registrar_encontro_grupo` =
  encontro real + presenças nominais; fotos/visitantes/não-reconhecidos vão
  nas observações), `transcreverAudio()` (OpenAI Whisper · env
  `OPENAI_API_KEY` opcional + `OPENAI_TRANSCRIBE_MODEL` default whisper-1 ·
  sem chave o bot pede texto).
- **Sessão de relato** = `whatsapp_coletas` (SEM migration de estado):
  `parsed={fonte:'grupo_encontro', grupo_id, data_encontro, presentes,
  visitantes, resumo, nomes_presentes:[{membro_id,nome}], nao_reconhecidos,
  fotos[]}`. Dedup por `whatsapp_message_id` sintético:
  `lembrete:<grupoId>:<data>` e `estudo:<AAAA-Wss>:<liderId>`.
- **Match nominal**: Haiku recebe a LISTA de membros do grupo e devolve os
  nomes casados (apelido/typo ok); o JS revalida contra a lista (não confia
  100% no modelo) e o que não casa vira `nao_reconhecidos` (provável
  visitante). Revisão-antes-de-aplicar mantida (fila /admin/whatsapp).
- **Webhook (`publicWhatsapp.js`)**: aceita `audio`/`image` além de texto;
  interceptor de grupos roda DEPOIS do institucional e ANTES do fast-path do
  formulário: assume quando (a) há sessão `grupo_encontro` aberta, (b) mídia
  de líder com escopo grupos, ou (c) texto de líder SÓ-grupos (substitui a
  orientação templated antiga). Multi-escopo digitando texto sem sessão segue
  o fluxo de culto. Foto → Storage `eventos-anexos` + `mem_grupo_documentos`
  (etiqueta "Fotos de grupos", `grupo_ids=[grupo]`) → aparece em Materiais.
- **Rotas `routes/whatsappGrupos.js`** (`/api/whatsapp-grupos` · server.js):
  `GET /cron/diario` (CRON_SECRET · vercel.json `0 12 * * *` = 9h BRT ·
  **desde 2026-07-20 só** sync de líderes + estudo no dia
  `WHATSAPP_ESTUDO_DIA` default 1=segunda — sem cobrança/lembrete automático),
  `PATCH /materiais/:docId/estudo-semana` e `POST /enviar-estudo|lembretes`
  (manual · grupos≥3). Aba Materiais ganhou botão/badge 📖 "Estudo da semana"
  (`api.grupos.marcarEstudoSemana`).
- **Migration `20260610220000`**: só `mem_grupo_documentos.estudo_semana
  boolean default false`. ⚠️ Aplicar antes do merge.
- **Envs**: `OPENAI_API_KEY` (áudio · Marcos cria depois) ·
  `WHATSAPP_TEMPLATE_*` (proativo fora da janela 24h · criar na Meta) ·
  `WHATSAPP_ESTUDO_DIA` (opcional). Sem nenhuma delas o resto funciona
  (texto/foto dentro da janela de 24h).

### Refinamentos (2026-06-10 · 2ª rodada do Marcos)

- **Auto-sync de líderes** (`sincronizarLideresGrupos()`): vínculo no bot é
  AUTOMÁTICO a partir de `mem_grupos.lider_id` + `mem_membros.telefone`
  (normalizado pra 55+DDD). Colunas novas em `whatsapp_lideres` (migration
  `20260610230000`): `origem` manual|auto (o sync SÓ gerencia os 'auto' —
  cria, troca grupo_id, desativa quando deixa de ser líder; manual é
  intocável) e `recebe_lembretes` (opt-out). Roda no cron diário + hook
  fire-and-forget após POST/PUT de grupo (`syncWhatsappLideres` em grupos.js)
  + `POST /api/whatsapp-grupos/sincronizar-lideres` manual.
- **Estudo da semana vai pro GRUPO de WhatsApp via coordenador**: a Cloud API
  não posta em grupo → o bot manda pro(s) vínculo(s) com `papel='coordenador'`
  (ex.: Pr. Nélio) a mensagem pronta com "👉 Encaminhe no grupo dos líderes".
  NÃO é mais broadcast por líder (decisão do Marcos: "não há necessidade").
- **⚠️ REVISTO 2026-07-20 (decisão do Marcos · lei): líder NUNCA recebe
  cobrança/lembrete automático de relato — nem com temporada ativa.** A
  cobrança de 4 semanas (`enviarCobrancasSemRelato`) foi REMOVIDA do código
  (função + endpoint + chamada no cron; em 20/07 ela disparou 40 mensagens
  indevidas pra líderes de temporada não-iniciada). O que o líder recebe:
  (1) **1×/mês** o pedido de chamada do mês — cron `frequencia-mensal` em
  `publicGrupos.js` (template `grupos_frequencia_mes`, link `/g/f/<token>`),
  agora **gated por temporada ativa EM CURSO** (data_inicio<=hoje<=data_fim);
  desde 2026-07-21 o cron **enfileira em LOTE** na fila `whatsapp_envios`
  (`enfileirarLote` · leituras de roster/líder em lote em vez de 2 queries por
  grupo; a entrega sai no cron horário da fila com retry/backoff);
  (2) lembrete avulso **só por disparo manual da coordenação**
  (`POST /whatsapp-grupos/enviar-lembretes` · Naná — ainda sem botão na UI).
  Não recriar cobrança automática.
- **Opt-out**: o extrator Haiku devolve `opt_out` quando o líder pede pra
  parar → `recebe_lembretes=false` + confirmação (responder/registrar segue
  funcionando · coordenador religa via PUT /api/whatsapp/lideres/:id).
- **Visão do Pr. Nélio**: aba Relatórios do /grupos ganhou o card "Grupos sem
  relatório de encontro" (`GET /grupos/kpis/sem-relato` · conta encontro
  registrado por QUALQUER via · destaque vermelho 4+ semanas/nunca, âmbar
  2-4 · mostra líder, dia e último relato).

---

## [movido] Entradas · fluxo operacional de saneamento (2026-07-18)

## Entradas · fluxo operacional de saneamento (2026-07-18)

Marcos definiu Entradas como uma **fila de exceções acionáveis**, não como
outra tela de busca/cópia da Membresia. Estado publicado em produção no commit
`81c3c35b` (migration aplicada manualmente antes do deploy):

- Navegação visível ficou somente com **Possíveis duplicidades**, **Vincular
  famílias** e **Conflitos de CPF**. Foram removidos `Todos`/`Base inteira`,
  `Buscar pessoas` e a antiga apresentação genérica `Sem vínculo`.
- **Possíveis duplicidades** é pré-filtrada no backend pela política canônica
  `backend/services/duplicidadePolicy.js`: CPF igual entra com prioridade alta;
  CPF, nascimento ou gênero conflitante exclui o par; sem CPF, nome precisa ter
  similaridade Dice >= 0,90 **ou ser uma versão abreviada/contida do outro nome**
  (mesmo primeiro nome + >=75% dos tokens do nome menor); telefone/e-mail só
  contam junto com nome compatível. Telefone sozinho NUNCA significa duplicata
  (caso que motivou a
  correção: Davi Lucas Bernardo Conceição × Bianca Silva Bernardo, mesmo
  telefone e identidades diferentes, recebia 90%). A UI mostra estado vazio
  explícito quando toda a base foi analisada e não há candidato.
- Cada lado do comparador mostra suas **origens operacionais comprovadas**
  (Conversão, Grupos, Next, Batismo, Visitas e Voluntariado), com detalhe/rota
  quando disponível. O legado não guarda proveniência por campo; portanto o
  selo diz onde o cadastro pode ser conferido com a equipe, não afirma de qual
  módulo veio cada valor individual.
- **Vincular famílias** sugere somente pessoas vivas/ativas com identidade
  distinta. Telefone compartilhado exige também sobrenome significativo em
  comum; endereço+CEP exatos podem sugerir famílias com sobrenomes diferentes.
  CPF igual, nome muito parecido ou nome curto contido no completo fica na lente
  de duplicidade, não na familiar (caso-regressão: Ana Carolina Pereira Vieira
  Ferreira × Ana Carolina Vieira). A ação mantém os cadastros separados e os
  agrupa na mesma família. **Não vincular** persiste `sem_vinculo/descartado` em
  `entradas_resolucoes`, remove o par da fila e impede que volte no recálculo.
  Cache backend: 10 min, compartilhado entre resumo/duplicidades/famílias e
  invalidado pelas ações de resolução. Snapshot da implantação anterior: 107 sugestões (26 para família existente, 81 para nova; todas
  por telefone — endereço não acrescentou pares naquele momento).
- Vocabulário do produto e do código é sempre **Família**. O termo técnico
  legado em inglês foi removido de UI, comentários, documentação e scripts sem
  quebrar a leitura das colunas antigas do Planning Center (chaves montadas por
  compatibilidade). Auditoria de 2026-07-18 encontrou 529 nomes antigos em
  `mem_familias`; migration
  `20260718170000_familias_vocabulario_portugues.sql` aplicada em produção por
  Marcos em 2026-07-18 normaliza para `Família <nome>`.
- **Conflitos de CPF** mantém os 254 casos legados para resolução manual, com a
  origem legível (`vol_ficha` = **Ficha de Voluntariado**, `wifi` = **Portal
  Wi-Fi**). Conflitos concretos (`cpf_conflito`, `cpf_divergente`,
  `vinculo_divergente`) continuam entrando; sinal fraco genérico não entra mais.

**Guarda de novas pendências fracas:** migration
`20260718120000_entradas_bloqueia_cpf_sinal_fraco.sql` cria trigger `BEFORE
INSERT` em `identidade_pendencias` que descarta somente
`tipo='cpf_para_confirmar'`. A evidência permanece na tabela de origem até uma
identidade forte aparecer. `reconciliarCpfTardio({confianca:'fraca'})` também
retorna `sinal_fraco_ignorado` quando os dois nascimentos não podem ser
conferidos; não contamina `mem_membros` e não cria trabalho humano. Não remover
essa guarda nem transformar telefone/e-mail isolado em identidade.

**Ficha pública de voluntariado corrigida na fonte:**
`InscricaoVoluntariado.tsx` e `POST /api/public/voluntariado/inscrever-form`
exigem, nos dois lados, nome completo sem abreviação, e-mail válido, telefone,
CPF com DV válido e data de nascimento válida. Nome da mãe + consentimento para
antecedentes continuam exclusivos de Kids/Bridge. Em produção, requisição sem
CPF responde `400 {"error":"CPF obrigatório"}` e não grava inscrição.

**Contagem da Membresia:** o número operacional verdadeiro na auditoria era
**3.665** pessoas `active=true AND deleted_at IS NULL`. Os **4.239** mostrados
antes incluíam 574 registros soft-deletados porque `GET /membresia/membros` não
filtrava `deleted_at`; o endpoint agora filtra.

**Correção da fila vazia (2026-07-18 · publicada):** a rota combinava
`vw_nb_duplicados_suspeitos` com a triagem nova usando `Promise.all`; a view
legada excedia o `statement_timeout` e descartava junto o resultado válido da
triagem. O frontend convertia o erro em `items=[]`, exibindo falsamente “nenhuma
duplicata”. A rota não consulta mais a view: pagina a base viva, forma candidatos
por CPF, telefone, e-mail, nascimento e blocos de nome, aplica
`duplicidadePolicy` como filtro final, exclui decisões de
`mem_duplicados_ignorados` e devolve **todos** os pares. Diagnóstico real após o
fix: 525 pares em ~10 s; Ana Carolina Pereira Vieira Ferreira × Ana Carolina
Vieira presente com “Telefone e nome compatíveis”; resumo quente em 235 ms.
Origens são enriquecidas em lotes de 100 UUIDs para não estourar a URL do
PostgREST. No frontend, as filas usam cache de sessão (`staleTime/gcTime =
Infinity`, sem refetch em mount/foco/reconexão): trocar de aba ou sair/voltar ao
módulo não recarrega. Recarregamento explícito força recálculo; resoluções
invalidam backend e React Query. Erros agora têm estado próprio e nunca parecem
fila vazia. Sem migration.

---

## [movido] Bot WhatsApp · Flows — REDESENHO + root cause do bloqueio (2026-06-09)

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

---

## [movido] Grupos · aba Visitas (agendar + registrar) + guards por módulo (2026-06-10)

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
- **Consolidação de abas (2026-06-10 · aprovada pelo Marcos):** 8 abas.
  **"Caixa de entrada"** = Pedidos + Encaminhados em sub-abas (pills), com a
  distinção EXPLÍCITA que o Marcos pediu: *pedido* = a própria pessoa pediu
  (viu o QR, escolheu, preencheu → líder aprova) · *encaminhado* = sugestão
  do cuidado pastoral (a pessoa NÃO pediu; precisa de contato explicando o
  que é grupo de conexão + devolutiva). Badge da aba = pedidos pendentes +
  encaminhados sem desfecho (`encaminhamentos.resumo('grupos')`).
  **"Configurações"** (soEditor) = Temporadas + Endereços em sub-abas.
  Chaves antigas de URL seguem funcionando (`TAB_LEGADO`: pedidos/
  encaminhados→entrada · geocode/temporadas→config · tarefas→visitas, com a
  sub-aba certa pré-selecionada). `PedidosGrupo` ganhou prop `embedded`
  (esconde o h1 quando dentro da Caixa de entrada). Decisão: NÃO juntar
  Grupos/Relatórios/Mapa/Materiais/Visitas/QR (públicos e usos distintos).
- **Aba "Pessoas" (2026-06-10 · pedido do Marcos):** o papel vive em 3
  lugares (`mem_grupo_membros.funcao` · `mem_grupos.lider_id` ·
  `mem_grupos.supervisor_id`) — por isso "é difícil ver quem é o quê".
  `GET /grupos/pessoas/papeis` agrega 1 linha por pessoa com papel efetivo
  (rank: coordenador>supervisor>líder>co-líder>treinamento>membro>visitante;
  visitante = frequentador com <3 presenças, mesma régua do detalhe).
  Participações paginadas (cap 1000 do PostgREST) + `.in()` em chunks.
  `GruposPessoas.jsx`: cards-filtro clicáveis por papel + busca + card
  destacado **"Líderes em treinamento"** (Marcos trocou o card "Candidatos a
  promoção"/sinais de sugestão por esse · 2026-06-10) + modal **Promover**
  (muda `funcao` via PUT
  /membros/:id/funcao; promover a supervisor também vincula grupos via PUT
  /:id/supervisor — exige nível 5). ⚠️ NÃO há histórico de quando a função
  mudou (sem coluna `funcao_desde`) — "tempo em treinamento" exigiria
  migration futura.
- **Ajustes 2026-06-10:** filtro "Local" REMOVIDO da lista de grupos (era o
  texto livre `local`, cheio de endereço; o filtro de Bairro já cobre).
  Cards de resumo da aba Visitas viraram BOTÕES-FILTRO (clique em "Sem
  visita há 2+ meses" filtra a lista · Marcos não tinha achado as pills).
