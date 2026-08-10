# CLAUDE.md

Guia operacional para o Claude Code quando trabalhar neste repositório.

## Como este arquivo é mantido (auditoria 2026-06-10)

Este arquivo contém **leis do projeto + estado atual dos módulos + lições aprendidas**.
A narrativa histórica de implementação (diários de specs, ondas de migration já
concluídas, planos abandonados) vive em **`docs/CLAUDE-LEGADO.md`** — que NÃO é
carregado por sessão e NÃO é referência viva (consultar só pra arqueologia de
decisões/time-lapse do sistema). Regras de manutenção:

- Seção nova entra **datada**. Quando o assunto esfria (mergeado + validado em
  prod), condensar a seção pra estado final + decisões + lições e mover o texto
  longo pro legado.
- Módulo descontinuado vira 1-3 linhas: o que era, quando e por que mudou
  (anti-regressão), com ponteiro pro legado.
- Nunca condensar/remover uma seção marcada como **lei/regra** (segurança,
  acentuação, contábil, PostgREST, meta×periodicidade) — elas ficam íntegras.
- Antes de tratar qualquer afirmação como verdade, validar contra o código/banco
  vivo (lição `cui_atendimentos`: achado de auditoria baseado em arquivo de
  migration que nunca foi aplicado em prod).

## ⚠️ LEI · Contrato de porta — toda entrada de PESSOA no sistema (2026-07-17)

Decisão do Marcos: dados de pessoa entram IGUAIS em todas as portas (Kids,
batismo, Next, voluntários, decisões, grupos, wifi, censo, formulários novos).
O formulário de cada porta continua MÍNIMO (pede só o que precisa); quem é
padronizado é o FUNIL pós-submit. Toda porta nova/alterada DEVE:

1. **Normalizar** antes de gravar: CPF/telefone digits-only, e-mail lower/trim,
   DV de CPF no servidor (com grandfathering: valor idêntico ao já armazenado
   passa sem DV — legado não pode travar edição).
2. **Passar pelo matcher canônico** (`backend/services/membroMatch.js` no JS ·
   `fn_link_or_create_membro`/`tg_cultos_dec_pessoas_resolve_membro` no SQL):
   CPF → e-mail+NOME → telefone+NOME → nascimento+NOME. NUNCA ligar por sinal
   fraco sozinho (família compartilha telefone/e-mail).
3. **Acumular contato divergente** em `mem_contatos` (migration 20260717120000 ·
   `fn_registrar_contato`): telefone/e-mail diferente do principal NÃO é
   conflito nem sobrescreve — vira contato secundário com fonte+data. O
   principal (`mem_membros.telefone/email`) só muda por ação humana. O matcher
   busca candidatos também nos secundários (anti-duplicata).
4. **CPF que chega depois** → `reconciliarCpfTardio` (consolida no membro;
   `confianca: 'fraca'` quando o vínculo veio de match fraco).
5. **Conflito de identidade** (CPF divergente/em uso, nascimento divergente) →
   `identidade_pendencias` (fila humana em Entradas > Identidade). NUNCA
   auto-fundir nem auto-decidir.

Uma pessoa = um cadastro (`mem_membros`) = fonte única que todos os módulos
leem. Módulo NÃO tem "base local de pessoas" — linha-satélite aponta pro
membro via `membro_id`.

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

## ⚠️ LEI · o gatilho de `auth.users` é a ÚNICA entrada de PESSOA fora do contrato (2026-08-04)

Marcos, ao ver cadastros recentes com nome errado: *"nós resolvemos as inscrições
padronizando entradas, porque estamos recebendo dados recentes errados?"*
Investigação a fundo (04/08). O Contrato de porta está **íntegro** — o furo é uma
entrada que ele nunca cobriu porque **não está no repositório**.

### O que foi medido

Inventário de TODOS os escritores de `mem_membros`: **um** em JS
(`services/membroMatch.js`, o matcher canônico) + 20 migrations (imports pontuais
e o matcher SQL). **`grep` exaustivo em `backend/`, `src/` e `supabase/`: nenhum
lugar do repo escreve `origem_cadastro='auth'`.** E o arquivo que o CLAUDE.md cita
como fonte (`supabase/handle_new_user_membro.sql`) **nunca foi commitado** — não
existe em nenhum commit de nenhuma branch (`git log --all --diff-filter=A`).

Origem: commit `04ce6ea2` (16/06, Matheus) — o app passou a mandar
`frequenta_area` por metadata e o gatilho foi estendido em prod pra criar
`mem_membros`. A migration daquele PR só criou a COLUNA; a mudança no gatilho
ficou fora do git.

O `handle_new_user` que ESTÁ no git (`20260410014723`) só escreve `profiles`:
`COALESCE(full_name, name, split_part(email,'@',1))`. A versão viva herdou esse
`COALESCE` e passou a aplicá-lo a `mem_membros.nome`.

### Por que isso viola o contrato inteiro

O gatilho **não** normaliza, **não** chama o matcher canônico (logo não deduplica),
**não** acumula contato em `mem_contatos`, **não** registra observação de
identidade e **não exige nenhum campo**. Medido nos 22 cadastros `origem='auth'`:
95% sem CPF, 95% sem telefone, 95% sem nascimento, 100% sem sexo, **15 com o nome
igual ao prefixo do e-mail**.

⚠️ **E já colidiu com uma porta correta.** Caso real de 02/08:

```
11:49  Maria Victória Lannes Campos → formulário público COM CPF  (mem_cadastros_pendentes)
11:57  "Victória Lannes"            → gatilho auth, sem chave     (mem_membros)
14:03  Maria Victória Lannes Campos → preencheu DE NOVO
```

O matcher teria ligado os dois por e-mail+nome. Ele não rodou. Ela preencheu duas
vezes porque nunca foi reconhecida.

⚠️ Sintoma que revela o estrago: `andre.texeira` e `kevyn.ricardo` têm o
**profile** com nome correto e o **membro** ainda com o prefixo — alguém corrigiu
na mão o lugar errado, e `mem_membros` é o que todo o sistema lê.

### Pior caso: Apple Sign-In com "Ocultar meu e-mail"

O relay (`sy9p84mryx@privaterelay.appleid.com`) tem prefixo aleatório, e a Apple só
manda o nome na **primeira** autorização. Resultado: pessoa cadastrada como
`sy9p84mryx`. Ritmo atual ~1/dia (`catiassgullo` 04/08, `juloora` 03/08,
`sy9p84mryx` 02/08).

### O que foi corrigido (sem tocar em auth)

1. **`membroMatch.ehNomeDerivadoDeEmail(nome, email)`** — irmã do
   `ehNomePlaceholder`. ⚠️ Exige o e-mail e compara com ele: **não** é heurística
   de "nome estranho", então não pega apelido nem nome curto legítimo. Contrato em
   `nomeDerivadoEmail.test.js` (**no gate de deploy**), com os casos reais de prod
   e mutation-test do falso positivo — trocar a igualdade por "contém" transforma
   a função numa máquina de sobrescrever nome de gente.
   ⚠️ Caso-limite documentado no teste: nome real IGUAL ao prefixo
   ("Marcelo Soares" × `marcelosoares@`) dá `true`. Aceitável porque o efeito é
   reescrever com o nome que a própria pessoa digitou + avisar humano — **nunca
   apagar**. Se um dia isso decidir algo destrutivo, a regra tem que mudar.
2. **`publicMembresia` manda `full_name` no `createUser`** — sem isso o gatilho
   gravava o prefixo do e-mail. E o ramo `else` (profile já existe, que é o caminho
   NORMAL porque o gatilho chega primeiro) passou a corrigir `profiles.name` **e** o
   `mem_membros.nome` que o gatilho criou, com guarda estreita
   (`ehNomeDerivadoDeEmail`) e `.eq('nome', valorAtual)` contra corrida.
3. **`origem_cadastro` no INSERT do matcher** — eram **2.163** cadastros com origem
   nula (o parâmetro `origem` só ia pra observação de identidade), e "de onde veio
   esse dado?" não tinha resposta. `'matcher'` genérico não é gravado.
4. **Aviso diário agregado** (`notificacaoGenerator`, tipo
   `cadastro_sem_nome_real`): 1 por dia, nunca 1 por pessoa (sem regra configurada
   o `notificar` cai no fallback de TODOS os admin/diretor). ⚠️ Isto **não conserta
   a causa** — existe pra o problema parar de crescer em silêncio enquanto o
   gatilho não é corrigido. A mensagem diz explicitamente **não apagar**.

### ✅ O gatilho ENTROU NO CONTRATO (migration `20260804140000`)

Marcos rodou o `pg_get_functiondef` em 04/08 e a definição viva foi commitada —
**este é o primeiro registro dele em git**. A migration substitui o corpo e:

- **normaliza** cpf/telefone (digits) e **valida o DV do CPF**: CPF inválido é
  DESCARTADO em vez de virar identidade errada. ⚠️ Antes entrava CRU do metadata,
  e CPF mascarado não casa com `uniq_mem_membros_cpf_ativo` (digits-only) nem com
  o lookup de dedup — fábrica silenciosa de duplicata.
- **delega o match a `fn_link_or_create_membro`** (canônico · CPF → telefone+NOME
  → e-mail+NOME): fecha o buraco do `email = new.email` sozinho (família
  compartilha endereço) e passa a **acumular contato divergente em
  `mem_contatos`**, que antes era descartado no ramo "membro já existe".
- ⚠️ Passa **`v_nome_meta` (o nome REAL, que pode ser NULL)** ao matcher, não o
  efetivo. Sem nome real ele cai no ramo legado de e-mail sozinho — seguro aqui,
  porque o e-mail É o da conta que autenticou — e então RECUSA criar, e o gatilho
  cria o stub. Passar o prefixo do e-mail como se fosse nome faria o ramo
  "e-mail + nome compatível" falhar contra o nome real já cadastrado e criar
  DUPLICATA: seria pior que o comportamento antigo.
- **completa só campo VAZIO** (nascimento, `frequenta_area`, `origem_cadastro`) —
  mesma política do censo e do CPF tardio. Sobrescrever é decisão humana.
- **liga cadastro pendente órfão**: CPF liga sozinho; por e-mail exige NOME
  compatível e respeita `nao_vincular_fraco`. É o conserto do caso da Maria
  Victória — a fila passa a mostrar "atualização cadastral" em vez de criar uma
  segunda pessoa.
- **melhora o nome** (no profile E no membro) quando o guardado é o prefixo do
  e-mail e chegou um real — era isso que deixava `andre.texeira`/`kevyn.ricardo`
  com profile certo e membro errado.

⚠️⚠️ **E desarma um risco que JÁ EXISTIA: o corpo antigo não tinha tratamento de
exceção.** Como o gatilho é AFTER INSERT em `auth.users`, qualquer erro ao gravar
`mem_membros`/`profiles` aborta o INSERT do usuário — **a pessoa não consegue
criar conta**. Duas pessoas com o mesmo CPF já bastavam (23505). Agora a
escrituração roda em bloco protegido: falha vira WARNING e o profile mínimo é
garantido. **Signup nunca deve falhar por causa da nossa escrituração.**

⚠️ **O que NÃO foi resolvido, e não é resolvível no banco:** sem nome do provedor,
o nome continua sendo o prefixo do e-mail — o banco não inventa nome de pessoa. O
conserto real é **o app pedir o nome na primeira tela** (repo do app, fora deste).
Até lá quem cobre é o aviso diário `cadastro_sem_nome_real`.

⚠️ Dependências conferidas AO VIVO antes de escrever (`fn_cpf_dv_valido`,
`fn_identidade_nomes_compativeis` chamadas por RPC; `fn_link_or_create_membro` e
`fn_registrar_contato` conferidos no catálogo do PostgREST — o matcher **não** foi
chamado em teste porque ele ESCREVE).

⚠️ **Teste funcional obrigatório após aplicar**: criar UMA conta nova e conferir
que (a) a conta é criada, (b) nasce 1 membro só, (c) o profile tem `membro_id`.
Rollback = colar a definição antiga (está no corpo do PR).

### ⚠️ O gatilho novo NÃO fecha o caso do nome ABREVIADO (05/08)

Aplicado e conferido ao vivo (o espelho SQL `fn_nome_derivado_de_email` bate com
o JS nos 8 casos, inclusive acento e relay da Apple). Mas sobra um furo que o
matcher não pode fechar: quando o provedor manda o nome **abreviado**, o ramo
"e-mail + NOME compatível" recusa e um fantasma nasce de novo.

Caso real medido: **Maria Victória existia DUAS vezes** —
`"Victória Lannes"` (auth, sem chave) e `"Maria Victória Lannes Campos"`
(`membresia_aprovacao`, com cpf+tel+nascimento). Os 2 pendentes dela foram
aprovados, então a aprovação criou um SEGUNDO membro em vez de ligar no fantasma.

⚠️ E a fila de Duplicatas **não enxergava o par**: `duplicidadePolicy` exige o
mesmo PRIMEIRO nome (`ta[0] !== tb[0]` → recusa), e o nome legal dela é *Maria*
enquanto ela usa *Victória*. Veredito medido antes do fix:
`{"incluir":false,"contradicoes":["Nomes incompatíveis"]}`.

**Ramo novo em `duplicidadePolicy`** (não afrouxei `nomesPodemSerMesmaPessoa`, que
tem casos-regressão documentados): e-mail EXATAMENTE igual + **exatamente um lado
é stub de login** (`origem_cadastro='auth'` sem cpf e sem telefone) + tokens do
nome menor **TODOS** contidos no maior → entra com prioridade **alta**.
⚠️ 100% de containment, não 75%: com 75% cônjuges no mesmo e-mail com sobrenome em
comum entrariam ("Ana Souza Lima" × "João Souza Lima" = 2 de 3 tokens). Está
mutation-testado. Aqui o e-mail não é o endereço da família — é a credencial que
autenticou, e é por isso que ele pesa mais que no caso geral.
⚠️ Os vetos de identidade (CPF/nascimento/gênero divergentes) rodam ANTES e
continuam mandando.

**`nomeEhEnderecoDeEmail`** — forma DIFERENTE do derivado-do-prefixo: o e-mail
está no campo do NOME (3 casos · 2 do `import_next_historico_2025_2026`, 1 do
wifi). Em 2 dos 3 a coluna `email` está VAZIA, então é também contato perdido. O
nome real não é derivável do endereço → aviso próprio pra humano, nunca exclusão.

**Cobertura do censo com DOIS recortes.** `/censo/cobertura` devolve `base` (todos
os ativos · inclui ~2.9 mil `visitante`) e `membros` (`status='membro_ativo'`), e o
painel virou um botão. ⚠️ Não é indecisão: "cobertura de quem?" é definição da
liderança, e escolher um faria o painel afirmar algo que não é nosso — além de
"quem falta" com 3 mil visitantes ser lista de cobrança inútil. `/censo/faltantes`
aceita `recorte=membros`.

**Testes no gate:** `test:duplicidade` (que existia e **não estava no gate**) e
`test:nome-email`.

### ✅ Pendências que a medição fechou (05/08)

- **pool-pg em `projects.js`/`patrimonio.js`**: `grep` não acha nenhum consumidor
  de `query()`/`pool` em `backend/` — `patrimonio.js:70` diz explicitamente que o
  fallback foi removido. A senha recusada do `DATABASE_URL` afeta **só script
  local**, nenhum endpoint de produção. Levantei como suspeita; a medição fechou.
- **Cadastros pendentes órfãos**: `status='pendente'` = **0** (a aprovação em lote
  de 04/08 drenou a fila). Não há backfill a fazer.
- **FKs pra `mem_membros`**: `profiles.membro_id`, `vol_profiles.membresia_id`,
  `next_matriculas.membro_id`, `mem_cadastros_pendentes.duplicado_de_id`,
  `mem_contribuicoes.membro_id`, `kids_responsaveis.membro_id` — **todas existem**
  (testadas pelo embed do PostgREST, que só funciona com FK) e **0 profiles
  apontando pra membro inexistente**. Fundir é seguro: `merge_membros` reaponta.
  ⚠️ Eu havia suspeitado do contrário pela lei nº 10; verifiquei em vez de assumir.

### ⏳ Em aberto, dependendo de DECISÃO (não de código)

- **`"22 pessoas -"`** — não é pessoa, é uma CONTAGEM: virou membro `membro_ativo`
  + batismo `realizado` de 26/01/2025 + trilha concluída. Apagar perde a
  informação de que 22 pessoas foram batizadas; manter infla membresia em 1 e
  sub-conta batismos em 21. Opções: (a) deixar e documentar; (b) soft-delete do
  membro + trilha, preservando o registro de batismo com observação.
- **O par da Maria Victória** — agora VISÍVEL na fila de Duplicatas com prioridade
  alta. Fundir é 1 clique da Naná (keep = o cadastro completo). Não fundi: hard
  delete de pessoa é "ok caso a caso".
- **Nome real da mãe do MURILO Mendes** (`Juliafuncionalfight@gmail.com`) — não
  vou adivinhar num registro de responsável Kids.
- **O app pedir o nome na primeira tela** — é o único conserto real do nome
  derivado do e-mail, e é no repo do app.

### Alarmes meus que NÃO se sustentaram (registrados de propósito)

- **`pco_import_2026` = 292 "nos últimos 30 dias"**: é **um import único de
  10/07**, dez dias antes da remoção do PCO. Artefato da minha janela, não
  vazamento.
- **`(null)` = 2.163 (649 recentes)**: não é porta sem controle — é o matcher
  canônico não preenchendo `origem_cadastro`. Os picos batem com dias reais de
  porta (23/06, 20-21/07, 02/08) e o dado é bom (CPF+telefone+nascimento).

Lição repetida 3× neste dia: **conferir o que a sonda devolveu, não a contagem.**

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

## ⚠️ Censo · o link do convite é PESSOAL, e é isso que dispensa o CPF (2026-08-04 · SEM migration)

Furo achado pelo Matheus horas depois do disparo entrar: *"se estou disparando mensagens para a
pessoa pedindo para ela completar o cadastro dela, como o sistema vai achar ela se ela não tiver
CPF cadastrado???"*. Não vai — e o link genérico `?censo=1` abria um **formulário em BRANCO de
cadastro novo**. Pedir "atualize seus dados" e entregar folha vazia não atualiza nada.

**A resposta: o sistema não precisa achar ninguém.** Quem manda a mensagem é ele, e ele já sabe
para quem está mandando. O link vai **pessoal**: `?censo=1&t=<token assinado com o membro_id>`.
Cobre as ~2.000 pessoas sem CPF — que são exatamente o público da campanha — com zero busca.

- **`backend/utils/censoToken.js`** — HMAC-SHA256 do `membro_id`, espelho da técnica do
  `inscricaoComprovante.js`. Segredo `CENSO_TOKEN_SECRET` com fallback no `CRON_SECRET`,
  **fail-closed**, **nunca literal** (lição do `MEM_QR_SALT`). **Namespace próprio**
  (`censo-atualizacao:`) — sem ele, um token do comprovante de inscrição (mesmo segredo!) seria
  aceito aqui e quem tem comprovante leria cadastro de membro. Há teste específico pra isso.
- **`GET /api/public/membresia/censo/meus-dados?t=`** é o **ÚNICO** endpoint público desta rota
  que devolve dado de pessoa. ⚠️ **Pode, porque a prova é o token ter chegado no contato DELA.**
  Os `lookup-cpf`/`lookup-nome-telefone` continuam devolvendo só primeiro nome + iniciais +
  telefone mascarado, e **é assim que tem que ficar**: CPF vaza e se compra, então CPF não é
  prova. ⚠️ **NUNCA aceitar `membro_id` cru na query** — seria enumerável (UUID vaza em log, em
  print, no histórico do navegador) e viraria extrator da base. Resposta de recusa é **neutra**:
  não distingue token malformado de segredo ausente de pessoa inexistente.
- **`token_censo` é chave FORTE no `censoReconciliar`** (entrou em `CHAVES_FORTES`, ao lado de
  `cpf`). Motivo diferente do CPF: não é dado que a pessoa digitou (e que poderia ser de outra
  pessoa da família) — é o link que o sistema emitiu e entregou. Tratá-lo como fraco jogaria na
  fila humana justamente o caminho criado pra resolver os cadastros sem CPF, e exigir CPF forte
  seria **circular** (é o CPF que eles estão vindo buscar).
- **Modo atualização no formulário**: abre preenchido, com `· falta preencher` **no próprio
  rótulo** dos campos incompletos (a lista vem do servidor pela MESMA
  `avaliarProntidao` da fila — a pessoa completa exatamente o que a equipe cobraria depois),
  tudo editável, foto. ⚠️ O formulário fica **escondido enquanto carrega**: renderizar vazio
  fazia a pessoa começar a digitar e o prefill sobrescrever o que ela escreveu.
- ⚠️ **Link ruim NÃO vira tela de erro** — degrada pro cadastro normal. E sem segredo o
  `montarLinkCenso` devolve o link genérico em vez de falhar: a campanha não para, só perde o
  preenchimento (a prévia avisa via `link_pessoal: false`).
- **O atalho "Já fiz meu cadastro e quero meu QR de membro" SAIU do formulário** (decisão dele):
  a carteirinha vive no app de membros, e numa página cuja tarefa é completar cadastro o atalho
  competia com a tarefa. `MemberWalletDialog` e as rotas `/wallet/*` **seguem existindo** (o app
  usa) — não apagar.

### ⚠️ O formulário de membresia não coletava SEXO — e isso travava a fila inteira

Achado ao construir a régua de obrigatórios: os 50 pendentes tinham `genero` preenchido (vêm de
outra porta), mas **`CadastroMembresia.jsx` nunca perguntou sexo** e o `POST /cadastro` nem
aceitava o campo. Consequência silenciosa: todo cadastro novo por essa porta nasce sem sexo, logo
**nunca fica "completo"** pela régua — ficaria na fila humana para sempre, e ninguém saberia por
quê. Contrato de Inscrição exige sexo em toda porta de pessoa; esta era a que faltava.
Corrigido nas 3 camadas: campo no form (`masculino|feminino`, **nunca "outro"**), whitelist no
backend, e `genero` entrou em `CAMPOS_CENSO` do reconciliador — sem isso o dado chegava do censo
e era **descartado em silêncio**.

## ⚠️⚠️ LEI · em operação LONGA, gravar o efeito DURANTE, não no fim (2026-08-04)

Três incidentes no mesmo dia, todos da mesma família. A lei que sai deles vale
pra qualquer coisa que faça N ações externas numa requisição:

**1 · Aprovação em massa (49 cadastros).** O servidor concluiu; o cliente abortou
em 30s (`request()` tem timeout padrão de 30s) e a tela disse *"Tempo esgotado ao
falar com o servidor. Recarregue a página ou tente de novo."* — para um trabalho
que **deu certo**. A lista continuou mostrando os 50 pendentes que já não
existiam. O caminho que a mensagem sugeria (tentar de novo) reprocessaria 49
cadastros. Correção: **pedaços de 8 com progresso real no botão**
("Aprovando 16 de 49…").

**2 · Disparo do censo (200 e-mails).** Mesma coisa, com prejuízo real: os 200
e-mails **saíram** e o registro em `mem_censo_convites` — que era **um único
insert no FIM** — falhou. Ninguém ficou marcado como convidado, e a rodada
seguinte teria reenviado pras mesmas 200 pessoas. Diagnóstico veio do
`get_runtime_logs` da Vercel (POST 200 + a mensagem do erro), **não** de
suposição: pelo que a tela mostrava, a conclusão natural era "nada saiu".

⇒ **A LEI: o registro do que já aconteceu vai em BLOCOS, durante o laço.** Morte
no meio (timeout da função, rede, deploy) deixa gravado o que já saiu, e a
próxima execução continua de onde parou em vez de duplicar. Registro no fim
transforma qualquer interrupção num bug com prejuízo externo.

⇒ **Corolário na UI: timeout de cliente NÃO é prova de que nada aconteceu.** A
mensagem nesses fluxos não pode dizer "tente de novo" — a do disparo agora diz
que o envio provavelmente continuou e manda conferir pela prévia. Em envio pra
fora, "tente de novo" é a instrução mais cara que a tela pode dar.

**3 · `ON CONFLICT` não usa índice PARCIAL.** A UNIQUE de `mem_censo_convites`
nasceu com `where membro_id is not null` e o upsert do PostgREST estourava
*"there is no unique or exclusion constraint matching the ON CONFLICT
specification"* — o Postgres exige que o statement repita o predicado do índice,
coisa que o `upsert()` do supabase-js não expressa. Índice recriado **sem
predicado** (`NULL` não conflita de qualquer forma: `NULLS DISTINCT` é o padrão).
Régua: **índice usado por `ON CONFLICT` nunca é parcial.**

⚠️ Os 200 convites foram **reconstruídos** com a MESMA ordem do disparo
(`created_at asc`, primeiros 200 elegíveis), com **deriva zero conferida** antes
(ninguém respondeu, ganhou CPF ou foi criado no intervalo). Verificação
independente que fechou: a prévia dizia "451 ficam para a próxima" e o sistema
recalculou **451** depois do reparo. Coluna `observacao` marca as linhas como
reconstrução — **não** usar `erro` pra isso (`erro` significa "o canal recusou",
e sujá-lo faz a contagem de falhas mentir).

## ⚠️ Censo · o CPF era DESCARTADO, e o painel dizia que estava tudo bem (2026-08-04)

O pior bug do dia, e o mais silencioso. `CAMPOS_CENSO` do `censoReconciliar`
exclui `cpf` **de propósito** (CPF tem serviço próprio, `cpfReconciliar`, que
trata conflito de identidade e CPF já pertencente a outro membro) — mas esse
serviço **nunca era chamado** no `publicMembresia.js`. Medido em produção: as
primeiras 4 pessoas do disparo preencheram o CPF, a submissão foi marcada
`aplicado` (sem conflito, tudo "certo"), e **o CPF não chegou a nenhum cadastro**.
A campanha existe pra coletar CPF de ~2.000 pessoas que não têm.

- Corrigido: o caminho do censo chama `reconciliarCpfTardio`, com `confianca`
  espelhando a força do vínculo — `cpf` e `token_censo` são fortes; sinal fraco
  exige nascimento conferível e vai pra fila humana se divergir (é o que impede
  gravar o CPF de uma pessoa no cadastro de outra da mesma família).
- Reparo: 4 CPFs consolidados. **2 casos NÃO foram gravados** porque o CPF
  informado já pertencia a outro cadastro — viraram `identidade_pendencias`
  (`cpf_conflito`). ⚠️ **Isso é GANHO, não erro:** é a pessoa duplicada se
  identificando: o convite foi pro cadastro sem CPF e ela respondeu com o CPF do
  outro. A campanha revela duplicata que ninguém achava.

**⚠️ A lição que passa do bug: o painel de cobertura NÃO mede a campanha.** Ele
tem a base inteira no denominador (200 convites com 8 respostas = "0,1%") e conta
**RESPOSTA, não CPF** — então as respostas subiam enquanto todos os CPFs eram
descartados, e **nada na tela denunciava**. Daí a `vw_censo_campanha` e o bloco
"O que as rodadas já trouxeram" no card: convidados → responderam → **passaram a
ter CPF** → viraram conflito. Métrica de campanha mede o OBJETIVO, não a
atividade; quando as duas divergem, é a atividade que engana.

## ⚠️ Censo · o OPT-IN também era descartado — e ele destrava o aniversário (2026-08-05)

Mesma família do bug do CPF, achado ao responder a pergunta do Matheus sobre o
disparo de aniversário dos voluntários. **Quem propaga consentimento é a
APROVAÇÃO** (`aprovarCadastroCore` / `promoverInscricaoLider`) — e a linha do
censo vira **`aplicado` e NUNCA é aprovada**, então o opt-in ficava só na
submissão. `CAMPOS_CENSO` não inclui `whatsapp_optin` (e não deve: consentimento
não é campo cadastral que se preenche por igualdade).

Medido em 05/08: **70 das 74 respostas marcaram a caixa (95%)** e só **13**
tinham chegado ao cadastro — **57 consentimentos válidos invisíveis** pra quem
decide se pode enviar. Corrigido no caminho do censo (`publicMembresia.js`) e os
57 reparados com a **data da submissão**, não a de hoje: `whatsapp_optin_em` é a
data da PROVA, e estampá-la com "agora" apagaria desde quando o consentimento
vale. Backup em `_bk_20260805_optin_censo`.

- ⚠️ **SÓ LIGA, NUNCA DESLIGA** (mesma política da aprovação): não marcar a caixa
  é ausência de consentimento NESTA submissão, não revogação do que a pessoa
  autorizou em outra porta. Revogar é ação dela.
- ⚠️ O UPDATE leva `.or('whatsapp_optin.is.null,whatsapp_optin.eq.false')` pra
  **preservar o `whatsapp_optin_em` de quem já havia consentido** — sobrescrever
  a data da prova é perder a informação, não atualizá-la.
- ⚠️ **O reparo pegou 58, não 57**: o Amaury respondeu o censo às 14:17 daquele
  dia, ENTRE o snapshot do backup e o UPDATE. Benigno (ele consentiu de fato) e
  é prova ao vivo de que o furo estava ativo até o commit. Régua: em reparo sobre
  porta pública VIVA, conferir quem entrou no alvo depois do backup em vez de
  tratar divergência de 1 como erro de contagem.

### A resposta sobre o aniversário dos voluntários: já está construído

Pergunta dele: *"agora todos os nossos formulários têm a checkbox — não podemos
usar isso para que a Meta não bloqueie o envio das mensagens de aniversário dos
voluntários?"* **Sim, e o raciocínio está certo: o impedimento nunca foi "a Meta
bloqueia Marketing", é que Marketing EXIGE opt-in.** Nada a construir — o
mecanismo existe ponta a ponta e está agendado:

- `vercel.json` → cron `/api/whatsapp-cron/aniversarios` (`0 12 * * *` = 9h BRT)
- `whatsappCron.js` filtra `whatsapp_optin = true` **e** vínculo de voluntário
  aberto (`mem_voluntarios.ate IS NULL`)
- `whatsappService.TEMPLATES_MARKETING = new Set(['aniversario'])` → o gate de
  opt-in do `notificarMembro` já vale exatamente pra este template
- templates `cbrio_aniversario` e `aniversario_voluntariado` **aprovados**, com
  `WHATSAPP_TEMPLATE_ANIVERSARIO2` setado em produção

**A única variável é o tamanho da audiência**, e ela cresce sozinha com a
campanha: de **178 voluntários** com nascimento + telefone, os que podem receber
foram de **21 → 36** só com o reparo acima. Nada enviado até 05/08 porque o cron
depende de cair no dia de alguém com opt-in.

## ⚠️ WhatsApp · falha de entrega AVISA GENTE, e o módulo vem do contexto (2026-08-05)

Autorizado pelo Matheus ao ligar o aniversário dos voluntários. Duas coisas
erradas no mesmo caminho, as duas silenciosas:

**1 · O `failed` do webhook não avisava ninguém.** A falha de entrega tem DOIS
caminhos e só um deles notificava:

| caminho | quando | antes |
|---|---|---|
| `whatsappFila.avisarFalhaTerminal` | a Meta **recusa na hora** (telefone inválido, código permanente) | ✅ notificava |
| `publicWhatsapp.processarStatuses` | a Meta **aceita** (200 + message_id) e depois reporta `failed` | 🔴 só gravava `failed_at` |

É no segundo que cai **"Message undeliverable" — número brasileiro válido SEM
WhatsApp**, o caso que o próprio CLAUDE.md registrava como "não avisa ninguém".

⚠️ **O `.select('id')` no UPDATE não é enfeite**: o `.is('failed_at', null)` faz
o UPDATE ser idempotente, mas sem saber **quantas linhas mudaram** a reentrega
da Meta (normal, e ela reentrega muitas vezes) avisaria de novo a cada entrega.
Mesma lição da guarda de idempotência: **o efeito colateral tem que estar
amarrado à transição real**, não à execução do handler.

⚠️ **Dedup por (MÓDULO, DIA)** neste caminho, diferente do por-envio da fila, e
de propósito: é aqui que caem os DISPAROS EM MASSA (aceito pra 200, `failed`
chegando um por um). Um aviso por mensagem × fallback de 16 admin/diretor =
centenas de linhas enterrando o sino — lição do censo e do lote de aprovação. O
detalhe fica em `whatsapp_envios.failed_at/erro_status`. E como o dedup do
`notificar` só vale enquanto **não lida**, falha nova depois de tratada volta a
avisar (desejado).

**2 · ⚠️ O PREFIXO DO CONTEXTO NÃO É UM MÓDULO.** `avisarFalhaTerminal` fazia
`contexto.split('.')[0]`, e o contexto do aniversário é **`app.aniversario`** —
o `app.` diz que o disparo nasceu de um evento do app, **não** que exista módulo
"app" (conferido no catálogo: não existe). Resultado: `resolverDestinatarios`
não achava regra e **todo** aviso de falha dos disparos do app caía no fallback
de TODOS os admin/diretor. Aviso que chega pra 16 pessoas e não é de nenhuma
não é tratado por ninguém.

- **`backend/utils/whatsappModulo.js`** = régua PURA (em `utils/` pra entrar no
  gate) mapeando contexto → `{modulo, link}`; `services/whatsappContexto.js` lê
  o banco e notifica. **Os dois caminhos usam a MESMA régua** — o mapa duplicado
  era garantia de divergirem.
- ⚠️ Os 9 slugs do mapa foram conferidos no catálogo `modulos` (todos existem e
  ativos). `voluntariado` tem 3 regras em `notificacao_regras`, então o aviso do
  aniversário vai pros responsáveis, não pro fallback.
- `src/test/whatsappModulo.test.ts` (9 casos · **no gate**) é **mutation-test da
  causa raiz**: voltar pro `split('.')[0]` fica vermelho, e há uma asserção de
  que todo módulo do mapa existe entre os slugs reais.
- O aviso **nomeia a pessoa** quando dá (`ref_id` é o membro nos contextos de
  `notificarMembro`) — "o telefone 21…" não diz a quem avisar.

## Comunicação · aba "Automáticas" · quem recebe o que o sistema manda sozinho (2026-08-05)

Pedido do Matheus: *"queria conseguir saber quem são as pessoas que recebem as
mensagens automáticas."* Até aqui a resposta só existia LENDO CÓDIGO — cada
disparo tem a régua de público dentro do seu cron, e nada no sistema dizia quem
se encaixa nela hoje.

Aba nova em `/comunicacao?tab=automaticas` (`GET /comunicacao/automaticas` ·
`services/comunicacaoAutomaticas.js`). Por disparo: a regra em português,
**quantas pessoas se encaixam agora**, **os nomes**, o que saiu de fato em 30
dias, e — o que faz a tela não mentir — **as travas**.

- ⚠️ **100% SOMENTE LEITURA.** Descreve o que os crons disparam; não envia, não
  agenda, não desliga. Mesma decisão do inventário de portas do /inscricoes:
  cada disparo tem lógica-satélite no módulo dono, e um 2º caminho de escrita é
  a classe de bug que o desenho evita.
- ⚠️ **`?pessoas=1` exige nível 2**: a lista carrega nome + telefone. "Quantos
  recebem" é gestão; "quem recebe, com telefone" é cadastro de gente. Sem nível,
  a resposta traz `pessoas_ocultas: true` — dizer que não veio, porque "nenhuma
  pessoa" é a leitura errada de "sem permissão".
- ⚠️⚠️ **PÚBLICO SEM A TRAVA AO LADO É NÚMERO QUE MENTE.** A chamada do mês
  mostraria **"95 líderes recebem"** enquanto o **kill-switch central dos envios
  automáticos de grupos está DESLIGADO** (`whatsapp_config.grupos_auto_envios`,
  default false desde o susto de 20/07) e o envio real é ZERO. Com trava ativa o
  card troca o rótulo pra **"se encaixam na regra"**, apaga a cor do número e
  abre uma faixa âmbar dizendo *por que* nada sai. Travas espelhadas:
  kill-switch, temporada em curso, e template sem env.
- ⚠️ **Público × enviados medem coisas diferentes** e a divergência é o
  diagnóstico: público é quem se ENCAIXA hoje, enviados é o que SAIU. Foi assim
  que o devocional apareceu como 22 no público, 0 entregues e 187 erros.
- ⚠️ **A régua daqui é ESPELHO do cron, não a fonte** — se o cron mudar, esta
  tela passa a mentir. Cada item declara o `fonte` (arquivo/rota que manda de
  verdade) e o resolver diz de qual função é espelho. Disparo automático NOVO
  tem que entrar no `CATALOGO`: o que não está no inventário fica invisível, e
  mensagem automática invisível é a que ninguém descobre que está errada.
- Público que falha **não derruba o inventário** (o item mostra o erro e os
  outros aparecem): esconder 3 disparos por causa de 1 seria trocar informação
  por silêncio.

### ⚠️ Achado ao construir: o "Estudo da semana" NÃO é automático

O CLAUDE.md dizia que o cron diário manda o estudo no `WHATSAPP_ESTUDO_DIA`.
**Não manda:** `whatsappGrupos.enviarEstudoSemanal` **não tem nenhum chamador**
(`grep` em todo o backend) e `/whatsapp-grupos/cron/diario` só executa
`sincronizarLideresGrupos()`. Ele saiu do catálogo — listar ali um automático
que não existe é o oposto do propósito da aba. O envio do estudo é MANUAL.

### Estado medido em 05/08 (o que a aba mostra)

| Disparo | Público | Situação |
|---|---|---|
| Parabéns de aniversário | **36** de 178 voluntários | funcionando |
| Lembrete de batismo | 0 (sem batismo amanhã) | funcionando |
| Chamada do mês (grupos) | 95 líderes | **travado** · kill-switch desligado |
| Devocional do dia | 22 (14 sem opt-in) | **quebrado** · 187 erros, 0 entregas |

## ⚠️ Folha por pessoa · o coordenador estratégico VÊ (decisão de 2026-08-05)

Registrado pra não ser re-sinalizado como problema: **o coordenador estratégico
pode ver a folha de pagamento por pessoa** (decisão do Matheus). Então
`SAIDAS_ALLOWLIST` em `backend/routes/financeiroV2.js` e o espelho em
`src/pages/admin/financeiro/DashboardFinanceiroSemanal.jsx` **ficam como estão** —
não "corrigir" removendo esse acesso.

⚠️ Pela LEI de não nomear pessoa como dono de fluxo, o que vale aqui é o PAPEL.
Quem ocupa o papel vive no banco (`usuario_areas` / cargo), não neste arquivo.

## ⚠️ Membresia · aprovação em massa da fila de cadastros (2026-08-04 · SEM migration)

Pedido do Matheus: selecionar alguns ou todos e aprovar de uma vez, *"mas o sistema deve ter uma
inteligência para ver se a pessoa está com esses dados obrigatórios preenchidos; se caso alguém
não estiver, não vai aprovar essas pessoas e fica para aprovação manual mesmo"*.

- **`backend/utils/prontidaoCadastro.js`** = régua PURA (testada no gate), espelhando o Contrato
  de Inscrição: nome completo **sem abreviação**, CPF com DV, telefone alcançável, e-mail,
  nascimento plausível (`hoje` injetado, parse local), sexo, e `aceita_termos` (a prova legal).
  Separa **`faltando`** (campo) de **`bloqueios`** (decisão humana). ⚠️ **Não inventar exigência
  aqui**: se o formulário público aceitou, a fila não pode exigir mais — senão o cadastro entra e
  nunca sai (foi exatamente o que o sexo ausente causava).
- **`aprovarCadastroCore()` foi EXTRAÍDO** do handler de 170 linhas, no padrão do
  `aprovarPedidoCore` dos Grupos; a rota individual virou casca fina. Duas cópias dessa lógica
  divergiriam, e o que ela faz é **criar pessoa** (matcher canônico, opt-in, histórico).
- **`POST /cadastros/aprovar-lote`** (teto 200): relê as linhas do banco e **reavalia a prontidão
  no SERVIDOR** — o payload diz *quais*, nunca *se pode*. ⚠️ **Sequencial de propósito**: cada
  aprovação passa pelo matcher e pode criar pessoa; em paralelo, dois cadastros da mesma família
  (telefone compartilhado) correriam no matcher ao mesmo tempo e poderiam gerar a duplicata que
  a fila de Entradas existe pra limpar.
- ⚠️ **`duplicado_de_id` preenchido NUNCA entra em lote**, mesmo com todos os dados: ali aprovar
  é o caminho de ATUALIZAÇÃO, que reaplica o formulário inteiro sobre o cadastro existente —
  inclusive por cima de valor que a equipe corrigiu depois (mesma razão pela qual o censo bloqueia
  reaprovar linha `aplicado`). É decisão humana, sempre.
- ⚠️ **O lote manda UM aviso com o resumo**, não um por pessoa: sem regra configurada o
  `notificar` cai no fallback de todos os admin/diretor (16), então 50 aprovações gerariam ~800
  linhas e enterrariam o sino. Lição do censo — aviso é pra trabalho PENDENTE, e lote aprovado é
  trabalho FEITO.
- **Não é mais permissivo que o manual**: o que o lote recusa continua aprovável na tela, com a
  pessoa vendo os dados. Nada fica inalcançável — fica pendente de gente, que era o pedido.
- Na tela: coluna de checkbox, "Selecionar os N completos", contagem de quantos precisam de
  aprovação manual, `Falta: CPF válido · sexo` **na linha da pessoa**, e diálogo de resultado com
  quem ficou de fora e por quê. `GET /cadastros` passou a anexar `prontidao` por linha
  (informativo — quem decide é o servidor).
- **Medição de 04/08**: os **50 pendentes estavam 100% completos** (CPF, telefone, e-mail,
  nascimento, sexo, termos, nome completo, nenhum duplicado) — o lote resolve os 50 num clique.

## Membresia · limpeza dos nomes que não são pessoa (2026-08-04 · SEM migration)

Pedido do Matheus: *"preciso fazer uma limpa nesses nomes, por exemplo ali que
está escrito nome riscado, claramente não é uma pessoa e veio de importação"*.
Medido antes de tocar: a base tinha **3.924 vivos** e o lixo era **24 nomes**,
dos quais **1** era lixo puro. A limpeza é pequena; o valor foi a triagem.

**⚠️ 5 dos 24 eram PESSOAS REAIS que o meu próprio padrão pegou** — o regex
`pessoa` casa com **sobrenome "Pessoa"**, comum no Brasil: `RENATA ANDRADE
PESSOA DE MIRANDA` (4 grupos, **69 contribuições**), `Carolina Pessoa`
(responsável por 4 crianças no Kids), `Maria Rosa De Oliveira pessoa`,
`Tatiana Pessoa`, e `Vivian … (certo)` (o "(certo)" é anotação da equipe, não
sujeira). **Régua: antes de apagar por padrão de nome, contar os vínculos
operacionais** (vol, next, grupos, batismo, contribuição, kids_resp) — foi isso
que separou pessoa de lixo, não a aparência do nome.

**8 são contas de sistema e NÃO foram apagadas** (decisão: esconder, não apagar):
`totem1-3` e `totem.kids1-4` têm **profile de login `@cbrio.org` apontando pra
elas** — apagar o cadastro quebra o vínculo do login do totem; e
`Apple Review (Demo)` é a conta proposital de revisão da App Store.
⚠️ **Follow-up em aberto**: elas contam como pessoa na lista de Membresia e nos
totais da base. O conserto certo é um filtro de exibição, não `deleted_at`.

**11 apagados** com `app_soft_delete` (backup em
`scratchpad/backup_membresia_sem_nome_20260804.json` · desfaz com
`app_restore`): `. f` · `Anônimo 1/2/3` · `(nome riscado - Guadelupe)` ·
`Josm... (ilegível)` · `Dianevieira26@gmail.com` (o nome era o e-mail) ·
`22 pessoas -` · e os 3 do app sem nome preenchido (`5rr9697fp4`,
`sy9p84mryx`, `pollyekley7788`).
- ⚠️ **Os 3 do app têm login e 2 têm push token ativo** (um criado no mesmo dia).
  O Matheus autorizou apagar sabendo disso; se alguém reclamar de acesso,
  `select app_restore('mem_membros','<id>')` resolve.
- ⚠️ **O histórico do Next sobreviveu de propósito**: `next_matriculas.nome` e
  `next_inscricoes.nome` são **NOT NULL**, então as 6 matrículas do backfill de
  listas manuscritas continuam existindo com o nome próprio. Apagar o cadastro
  **não** apagou a presença — conferido depois.
- ⚠️ **`22 pessoas -` era linha de planilha que o import virou pessoa**: ligada a
  um `batismo_inscricoes` cujo nome é literalmente "22 pessoas", realizado em
  26/01/2025. Decisão do Matheus: *"o número de batismo você mantém"* — então
  **só o cadastro de pessoa foi apagado** e a linha do batismo ficou intacta
  (`batismo_inscricoes.deleted_at` não foi tocado). Conferido: **226 batismos
  realizados em 2025**, o mesmo de antes. A contagem de batismo não faz join com
  `mem_membros`, então soft-delete de pessoa não a afeta.

## Cuidados · Visitas e Atendimentos ganhou visão POR PASTOR (2026-08-04 · SEM migration)

Pedido do Matheus: "clicar no pastor e ver os atendimentos dele" + melhorar o
filtro de data. Toggle **Por pessoa | Por pastor** no `TrilhaPessoas`; as duas
visões leem o MESMO `pessoas` já carregado (`GET /cuidados/trilha`), então trocar
não faz round-trip e as contagens não podem divergir — a condição de filtro virou
uma função só (`casaFiltros`), usada pelos dois lados.

- Na visão por pastor o filtro **"Quem atendeu" é escondido**: ali o recorte por
  responsável É a própria lista, e deixá-lo ligado mostraria um card só sem
  explicar por quê.
- **Visão por PASTOR é o DEFAULT da aba** (2ª rodada · 04/08): o uso real é a
  liderança olhando o próprio acompanhamento; achar uma pessoa específica tem o
  campo de busca, e a trilha dela fica a um clique dentro do card do pastor.
- **⚠️ Layout do período · foram DUAS causas, e a 1ª correção só pegou uma.**
  1. `Label` do shadcn é `<label>` (inline) e o `DatePicker` é um `Button`
     inline-flex — `space-y-1` não empilha dois inline, eles fluem na mesma linha.
     Daí as labels "De"/"Até" aparecerem COLADAS ao lado do calendário. Resolvido
     com `block` na label.
  2. **O que sobrou depois disso**: o Button do DatePicker tem `whitespace-nowrap`
     e o span do placeholder é `flex-1` **sem `truncate`**, então texto que não cabe
     **transborda pra fora do botão** e passa por cima do vizinho — o "até" ficava
     escrito por dentro do "Selecione a data". Com `w-[142px]`, sobravam ~94px de
     texto pra uma frase de ~110px.
  **Régua:** ao encaixar `DatePicker` em espaço estreito, encurtar o `placeholder`
  (aqui virou "Início"/"Fim", já que o grupo tem label própria) **e** medir a
  largura contra `w − px − (ícone + mr-2) − (X de limpar, quando há data)`. O
  `overflow-hidden` no botão é só cinto de segurança: ele CLIPA em vez de invadir o
  vizinho, mas não faz o texto caber.

⚠️ **`responsavel` é TEXTO LIVRE e isso limita a feature.** O form usa `<Input>`,
não select do catálogo `cui_responsaveis` — que EXISTE, é gerenciável na UI e tem
"Wesley Ramos" cadastrado. Resultado medido em 04/08: o mesmo pastor em **4
grafias** ("Pr. Wesley B. Ramos" 6 · "Pr. Wesley Barros" 2 · "Wesley Barros"
dentro de duplas · "Wesley Ramos" no catálogo), então a visão mostra **6 cards
para ~4 pessoas** e o total real dele (12) fica partido.
- **NÃO fundimos grafias** — casar "Wesley B. Ramos" com "Wesley Barros" é
  adivinhar identidade, o que a lei do Contrato de porta proíbe.
- O que É mecânico e foi feito: **separar DUPLA** (`X e Y`, `X, Y`, `X / Y`,
  `X & Y`) em pastores distintos. Visita conjunta conta pros dois, por isso o card
  diz **"participou de N"**, não "fez N" — e a soma dos cards (19) fica MAIOR que
  o total de atendimentos (15) de propósito. O dialog mostra "com: <campo
  original>" na linha do atendimento conjunto.
- **Correção de raiz FEITA no mesmo dia** (decisões do Matheus em 04/08):
  - **Campo virou seleção MÚLTIPLA do catálogo** (`RespSelector`, pílulas) — texto
    livre acabou, grafia nova não nasce mais. Marcar 2+ é suportado: visita em dupla
    conta pros dois. Guarda o NOME em lista `", "`-separada, **não id**: é o padrão
    do módulo (essas pessoas não logam, o catálogo é por nome, e renomear propaga).
    Trocar pra id exigiria satélite polimórfica (visita × acompanhamento) e deixaria
    os dois lados do módulo com réguas diferentes.
  - **Nome legado fora do catálogo é PRESERVADO** e aparece como pílula marcada com
    `*` (caso da "Léia Serpa"). Sumir com o nome de quem já atendeu seria perder
    histórico pra ganhar arrumação.
  - **Grafias do Wesley consolidadas** — "Sim, tudo Wesley Ramos", confirmado por
    ele; eu NÃO decidi isso. Resultado: de 6 cards pra **4 cards / 4 pessoas**, com
    os 12 atendimentos dele juntos. Backup em
    `scratchpad/backup_cui_visitas_responsavel_20260804.json`. "Marcelo Soares"
    entrou no catálogo (pessoa distinta e real — supervisor-jornada, não variação de
    grafia). **"Léia Serpa" NÃO foi tocada**: pode ou não ser a "Léia" inativa do
    catálogo, e isso é identidade — fica pendente de confirmação dele.
  - ⚠️ **Cascata de rename estendida a `cui_visitas`** (antes só `cui_convertidos`).
    Não dá pra usar `.eq()` como no convertido, porque o campo guarda LISTA: a troca
    é por **token exato**, read-modify-write. `replace()` de substring renomearia
    "Léia" dentro de "Léia Serpa", que é outra pessoa. É best-effort e devolve
    `renomeados_visitas` — o catálogo e os convertidos já foram renomeados com
    sucesso quando ela roda, então derrubar a resposta ali esconderia o trabalho
    feito.

## ⚠️ Entradas · ação de fila NÃO refaz a busca (2026-08-04 · SEM migration)

Reclamação do Matheus: "quando faço qualquer ação, demora pra atualizar, quero
algo fluido". Eram **~10s por clique** em Possíveis duplicidades.

**Causa:** cada ação (fundir / não é a mesma pessoa / adiar / reativar) chamava
`invalidateQueries` em `['next-batismo','duplicados']`, e o `GET /duplicados`
**RECALCULA a fila inteira** — pagina a base viva, forma candidatos por CPF,
telefone, e-mail, nascimento e blocos de nome, e aplica a `duplicidadePolicy`.
Pior: as ações de resolução invalidam também o **cache de 10 min do backend**,
então nem o `/resumo` voltava barato (ele recomputa `dup` também).

- **A régua:** a ação já foi confirmada pelo servidor — o par só precisa **SAIR da
  lista** (`setQueryData`) e o contador descer 1. **Nenhum refetch.** Recálculo de
  verdade continua no botão "Recarregar", que é explícito. De ~10s pra ~300ms.
- ⚠️ **Fundir remove MAIS de um par**: fundir A em B faz A deixar de existir, então
  todo outro par que cite A ficou órfão e sai junto — clicar num deles daria erro
  no servidor. Por isso `removerPares` filtra por `merge_ids`, não pelo `par_id`.
- ⚠️ **Fila oposta usa `refetchType: 'none'`**: marcar stale sem buscar. Recalcular
  a fila que a pessoa não está vendo pagaria exatamente os 10s que estamos
  evitando; ela recomputa quando a aba abrir.
- No `IdentidadePendenciasPanel` a mesma régua vale, com uma exceção: quando o
  `confirmarCpf` devolve conflito o servidor **abre uma pendência nova**, que a
  lista local não tem — só nesse caminho o refetch é necessário.
- **Filtro por CPF na fila de identidade** (pedido do mesmo dia): são chips
  separados de propósito, porque a distinção é de RISCO — `origem_id` começando
  com `cpf:` significa que a INSCRIÇÃO trouxe CPF (chave mais forte, ligar é
  seguro · 16 casos em 04/08); "só no cadastro" (~108) casou por telefone+nome, e
  telefone é compartilhado em família. Juntar os dois num "tem CPF" esconderia
  justamente a diferença que decide se pode ligar sem conferir.

## ⚠️ Entradas · "tem CPF" ≠ "achou PELO CPF" · e o lote (2026-08-05 · migration `20260805120000`)

Pedido do Matheus na aba **Conflitos de CPF**: *"gostaria que tivesse a
funcionalidade para eu marcar todos e aprovar, e ajeite esse bug, pois mesmo eu
marcando o filtro de mostrar só quem tem cpf preenchido, ele mostra pessoas que
não tem cpf preenchido. Pois quero ligar o cadastro em massa de todos aqueles
que tem cpf preenchido já."*

**O filtro não estava errado na conta — estava errado na PERGUNTA.** O chip lia
`origem_id`, que é a **chave da pessoa órfã** (`chavePessoa`: cpf > tel > nome).
`cpf:...` ali significa que **a INSCRIÇÃO trouxe CPF** — não que o candidato foi
achado por ele, e muito menos que o cadastro tem CPF. Caso do print (medido):
**Ana Luisa Dib Silvestre** — inscrição de batismo com CPF `194.117.357-89`,
candidato achado **por telefone+nome**, cadastro **sem CPF nenhum**. Ela entrava
em "Só com CPF" e o card mostrava `—`, porque **a tela só exibia o lado do
CADASTRO**: o CPF que a pessoa digitou não aparecia em lugar algum.
Das 7 pendências com chave `cpf:`, **4 casaram por telefone+nome/nome** — e a
tooltip prometia *"chave mais forte que existe, ligar é seguro sem conferir
nome"*. Era a tooltip a parte perigosa, não a contagem.

- **`avaliarForcaOrfa(insc, cad)`** (`services/inscricaoOrfas.js`) responde a
  pergunta certa: *este cadastro é essa pessoa?* Régua = os ramos do **matcher
  canônico**: CPF da inscrição igual ao do cadastro, ou **telefone igual +
  NOME COMPLETO idêntico**. ⚠️ Nada aqui é mais frouxo que o que já liga sozinho
  em toda porta; o que é mais frouxo — **primeiro nome igual + telefone**, que o
  enfileiramento aceita pra SUGERIR — fica fora, porque é exatamente mãe/filha
  no telefone da casa. Mutation-testado em `inscricaoOrfas.test.js`: afrouxar a
  comparação de nome deixa o gate vermelho.
- **2 VETOS, e vêm ANTES das evidências fortes**: nascimento conferível e
  divergente (contradição — nenhuma outra evidência compra de volta) e **CPF
  divergente dos dois lados**. Sem essa ordem, CPF diferente + telefone/nome
  batendo cairia no ramo forte, ou seja, escolheria a evidência que convém.
- **A tela mostra os DOIS lados** (`InscricaoBox` "O que a pessoa preencheu" ×
  "Cadastro candidato") + selo da força. É a correção de raiz do "mostra gente
  sem CPF": o CPF existe, é da inscrição, e agora aparece.
- **Chips**: rótulos passam a dizer de QUAL lado é o CPF ("CPF em algum lado" /
  "CPF na inscrição") e ganharam a ressalva na tooltip. Ficam porque servem aos
  **218 `cpf_para_confirmar`**; quem responde "dá pra ligar?" é o chip novo
  **"Pode ligar em lote"**.
- **`POST /identidade-pendencias/ligar-lote`** (nível 3 · teto 100): `ligarInscricaoCore`
  extraído (padrão `aprovarCadastroCore`) e o lote **REAVALIA a força no
  servidor** — o payload diz *quais*, nunca *se pode*. **Sequencial** (cada
  ligação passa pelo matcher e pode consolidar CPF tardio; em paralelo, duas
  pessoas da mesma família correriam no matcher juntas). `lerLinhasOrfas` roda
  **uma vez** pro lote. **UM aviso agregado** (lição do censo).
- ⚠️ **Chave morta é DECLARADA**: pendência cujas inscrições já foram ligadas
  mostra "Nada a ligar" em vez do botão que só devolveria 409. O Matheus passou
  **110 pendências na mão em 05/08** — clique que erra é caro.

**Cobertura honesta, medida em 05/08 (67 pendentes de `inscricao_sem_vinculo`):
20 vão em lote** (23 linhas de inscrição) · **40 seguem manuais** (a maioria
primeiro-nome-só + telefone) · **7 com chave morta**. Não são os 157 do chip
antigo — aquele número contava "CPF em algum lado", e CPF que não participou do
match não prova nada sobre ser a mesma pessoa.

### ⚠️ A trilha do "Ligar ao cadastro" nunca existiu (CHECK engolido)

Achado ao construir o lote: `entradas_resolucoes_acao_check` **não tinha**
`inscricao_vinculada`, então todo INSERT da trilha violava 23514 e o erro era
engolido pelo `console.warn` de `registrarResolucaoEntrada` (que só propaga se a
mensagem casar `/entradas_resolucoes|schema cache|does not exist/`).

Medido: **134 linhas** em `mem_identidade_observacoes` com origem
`fila_identidade%` (última 05/08 13:36) — as ligações **aconteceram de verdade**
— contra **ZERO** `acao='inscricao_vinculada'`. Ou seja: 134 vínculos de pessoa
criados por decisão humana, e a pergunta "quem ligou esta inscrição a este
cadastro?" sem resposta. Migration `20260805120000` acrescenta
`inscricao_vinculada` e `inscricao_vinculada_lote` (ação **própria** pro lote: a
decisão "ligou 20 confiando na régua" é diferente de "olhou os dois lados e
ligou", e compartilhar rótulo apaga a distinção). **Não reescreve o passado** —
as 134 seguem sem trilha, porque não há de onde tirar autor/momento.
⚠️ Régua que fica: **ação nova no backend precisa entrar nesse CHECK**, e
`registrarResolucaoEntrada` engolir erro significa que a falha aparece só quando
alguém for auditar.

## ⚠️ Totem · IDENTIDADE DE ESTAÇÃO (2026-08-05 · migrations `20260805130000` + `20260805130100` · PR #2291)

Fase 0 do pagamento presencial em inscrições (plano completo: totem com Pix →
provider TEF → agente com a DLL → conciliação → dinheiro em espécie). Esta leva
**não toca em dinheiro**: entrega só a identidade do equipamento, que é
pré-requisito de tudo o resto — o totem vai **receber dinheiro** e hoje não há
como saber QUAL totem cobrou.

**A troca:** a autenticação de totem era **conta de e-mail/senha por
computador** (`20260703160000_totem_membro_kiosk.sql`) — senha compartilhada num
PC de hall, sem revogação por dispositivo. Agora o totem de inscrições usa
credencial de EQUIPAMENTO: pareamento por código de uso único (8 caracteres,
alfabeto sem O/0/I/1, 15 min, queimado no 1º uso) → segredo `tk_<64 hex>`
guardado **só como sha256**, revogável individualmente.

- **`totem_estacoes`** (genérica: `finalidades text[]` serve inscrições agora e
  Kids/Membro/Voluntariado por adição) + **`totem_estacao_tokens`**
  (`tipo IN ('pareamento','dispositivo','agente')` · `linhagem` sobrevive à
  rotação e detecta clone). Campos de pinpad (`tef_*`) e impressora já na
  estação — a estação É o lugar físico com PC + pinpad + impressora, e com duas
  tabelas haveria duas verdades sobre "qual maquininha é essa".
- **Atribuição**: `pag_cobrancas.estacao_id`, `inscricoes.totem_estacao_id`,
  `inscricao_consentimentos.totem_estacao_id`. **Coluna, não `metadata` jsonb**
  — a conciliação do presencial é `GROUP BY estacao_id`, e em JSON isso é scan.
- Backend: `services/totemEstacao.js` · `middleware/totemEstacao.js` (header
  **dedicado `x-totem-token`**, NUNCA `Authorization`) · `routes/totem.js`
  (`/parear`, `/eu`) · gestão em `routes/inscricoes.js` (ver 1 · parear/revogar
  **4**). Front: `/inscricoes/totens` (link no cabeçalho do módulo) e
  `/totem/inscricoes` (**rota pública** · quem autentica é o equipamento).

⚠️ **NÃO generalizar `kids_estacoes` — e não "consertar" a inconsistência dela.**
Ela está amarrada ao Kids (`sala_id`, FKs vivas de check-in de MENOR) e o modelo
de token dela é o anti-padrão: UM token, em TEXTO PURO, na própria linha, numa
tabela cujo RLS deixa qualquer `authenticated` fazer SELECT — uma leitura
entrega a credencial de todos os totens. O pareamento planejado em
`20260521220000` **nunca foi implementado** (`grep parear` em `backend/` e `src/`
= zero; o front manda `estacao_id: null` e o backend engole o erro de FK
regravando null). A coluna ganhou COMMENT de depreciação; a adoção pelos outros
totens é fase futura (`kids_checkins.totem_estacao_id` nullable).
⚠️ `src/pages/atlas/atlas.html:418` e `docs/quiosque-lounge-identidade.md` §15.5
**descrevem como vivo** aquele pareamento inexistente — corrigir quando alguém
passar por lá.

⚠️ **Segurança, sem maquiagem: o token é bearer e extraível.** Fica no
`localStorage` de um PC de hall público; 20 segundos de acesso físico e alguém
sai com ele. O desenho faz o token roubado valer quase nada — autoriza 2
endpoints, **nunca** passa por `authorizeModule`, não popula `req.user`, não lê
lista de gente e não faz `cpf-lookup`. **É REDUÇÃO de risco**: a conta de
quiosque do `/totem` tem `membros-totem` no `ROUTE_MODULE_MAP` (`auth.js:56`),
ou seja uma sessão roubada de um PC do hall **hoje lê PII de membro**.
Mitigações: `ip_permitidos` (fail-closed), revogação em ≤60s (TTL do cache
espelhando `authUserCache`), e **nenhuma PII em storage em momento nenhum**.

⚠️ **NÃO expor `cpf-lookup` ao token de estação** (vai ser pedido, pra
pré-preencher membro): transforma token roubado num oráculo CPF → nome/telefone
da igreja inteira, de graça, e o ganho são 4 campos. Se for pedido, o caminho
seguro é POSSE FÍSICA (QR da carteirinha ou o reconhecimento facial que já
existe) devolvendo prefill one-shot amarrado à estação — com os consentimentos
recolhidos SEMPRE (consentimento anterior não é consentimento deste evento).

- **Régua PURA em `backend/utils/totemCerco.js`** (cerco de IP + alfabeto) pra
  entrar no gate. `src/test/totemCerco.test.ts` (16 casos) é **mutation-testado**:
  trocar o `return false` do IP incomparável por `return true` deixa 2 testes
  vermelhos — é essa mudança, de boa-fé, que transformaria o cerco num enfeite
  (bastaria o cliente chegar por IPv6). O cerco é **IPv4 e fail-closed** por
  decisão declarada.
- ⚠️ **Cerco de IP é conferido a CADA request, nunca no cache**: o cache guarda a
  linha do token, não a permissão daquele chamador.
- ⚠️ **Falha de INFRA na resolução do token devolve 503, não 401**: 401 fez o
  front apagar o pareamento, e desparear o totem por instabilidade de banco
  exigiria voluntário repareando no meio do culto. `ip_nao_permitido` também
  **não** limpa credencial (a credencial está boa; a rede é que está errada).
- ⚠️ **Queimar o código de pareamento vem ANTES de emitir**, condicionado
  (`.is('usado_em', null)`): é o UPDATE que serializa duas tentativas
  simultâneas. Emitir primeiro deixaria dois dispositivos pareados com um código
  de uso único. Conferido em transação revertida: 1ª tentativa 1 linha, 2ª **0**.
- Aplicadas e conferidas **no catálogo** (não no `success: true`): 3 FKs com
  `convalidated = true` · `totem_estacao_tokens` **sem nenhuma policy para
  `authenticated`** · 6 recusas de CHECK/UNIQUE validadas.

### ⚠️ O gate de deploy tem 8 passos, e o vitest é UM deles (lição de 05/08)

O deploy do #2291 **falhou** em `test:inscricao-portas` e travou a publicação
(inclusive de terceiros; produção seguiu no deployment anterior). Eu havia
rodado `npm test` (vitest · 341 verdes) e concluído que o gate estava coberto —
os outros **7 passos são scripts node** (`test:inscricao-contrato`,
`test:inscricao-portas`, `test:inscricao-orfas`, `test:inscricao-qr`,
`test:censo`, `test:nome-email`, `test:duplicidade`) e não passam pelo vitest.
**Rodar os 8 antes de mergear** (`.github/workflows/deploy-vercel.yml`).

O guarda que pegou foi o **App.tsx → catálogo** de `inscricaoPortas.test.js`,
que existe pra impedir porta de inscrição nova entrar sem registro: as rotas
casam com `inscri|inscrever|apresentacao`. Corrigido em #2293 —
`/totem/inscricoes` e `/inscricoes/totens` entraram em **`ROTAS_INTERNAS`**, não
no catálogo, porque `catalogoPublico()` alimenta o inventário **com link/QR pra
compartilhar** e o quiosque só funciona em dispositivo pareado (um "copiar link"
ali entregaria URL que não abre em lugar nenhum).
⚠️ **REVISITAR NA FASE 1**: quando o totem passar a inscrever de verdade, ele
vira porta (presencial) e precisa aparecer na view unificada e no inventário
como entrada própria em `PORTAS_INSCRICAO` (`escritores: ['inscricoes']`).

**Pendente da Fase 0** (não é código): pareamento exercitado ponta a ponta no
navegador — não há credencial de service role local pra subir o backend. Validar
cadastrando um totem em `/inscricoes/totens`, gerando o código e digitando em
`/totem/inscricoes`.

## ⚠️ Inscrições · `null` em coluna NOT NULL derruba o UPDATE inteiro (2026-08-04)

A Ariel não conseguia salvar edição de evento. Erro real no runtime da Vercel:
`null value in column "pagamento_expira_horas" violates not-null constraint`.
O form mandava `null` nesse campo sempre que o pagamento estava DESLIGADO — logo
**a edição de qualquer evento sem pagamento falhava com 500**, e levava embora
todos os outros campos que a pessoa havia editado (UPDATE é atômico).

- **A régua:** em coluna NOT NULL, `null` do cliente significa "não informado",
  **nunca "apagar"** — apagar é impossível. `CAMPOS_EVENTO_NAO_NULO` (6 colunas:
  `tem_sorteio`, `premios`, `checkin_ativo`, `pagamento_ativo`,
  `pagamento_expira_horas`, `juros_repassados`) descarta o null no POST e no PUT.
  Coluna nullable segue aceitando null, porque limpar é edição legítima.
- Lista conferida no catálogo (`is_nullable='NO'`), não decorada. Coluna NOT NULL
  nova entrando na whitelist tem que entrar nesse Set também.
- ⚠️ Diagnóstico veio do `get_runtime_errors` da Vercel, não de tentativa e erro:
  o handler devolve 500 genérico ("Erro ao atualizar evento") e o motivo real só
  existe no log. Para bug de save relatado por usuário, olhar lá primeiro.

## ⚠️ LEI · trocar a KEY de um campo de formulário ORFANA resposta (2026-08-03)

Incidente: o Matheus abriu uma inscrição do Patrocinadores do Celebra e o modal
mostrou **"—" em todas as 7 respostas**. O dado estava intacto em
`inscricoes.dados` — o que quebrou foi o VÍNCULO pergunta↔resposta.

**Causa:** `sanitizeCampos` (routes/inscricoes.js) testava
`/^c_[a-z0-9_]+$/` e, para toda chave que não casasse, chamava `novaKeyCampo()`.
Os eventos migrados do Celebra guardam a pergunta com chave em **formato slug do
rótulo** (`nome_da_empresa_negocio`), que não casa com aquele padrão. Então, na
PRIMEIRA vez que alguém abriu e **salvou** o evento no construtor (30/07 11:58),
as 7 chaves foram trocadas de uma vez e as 15 respostas ficaram órfãs.

⚠️ **O mesmo estava ARMADO para o "Celebra 2026"** (114 inscrições · evento em
29/08): a chave dele (`em_qual_ministerio_voce_serve`) também é slug, e as
respostas só continuavam casando porque **ninguém havia salvado aquele evento
pelo construtor**. Um clique em Salvar teria orfanado as 113.

- **A lei:** chave existente é **PRESERVADA byte a byte**. Chave nova só quando
  não existe nenhuma. **NUNCA derivar/normalizar a chave a partir do label** — o
  comentário do `novaKeyCampo` já dizia isso; a régua é que estava estreita demais
  e regenerava o que devia preservar.
- **`backend/utils/campoKey.js`** é a fonte única: `keyCampoPreservada()` aceita
  qualquer chave em `[a-z0-9_]{1,60}` (charset conferido contra o banco vivo — as
  **15** chaves de formulário de `insc_eventos`+`ext_eventos` e as **10** chaves
  presentes em respostas de `inscricoes`+`ext_inscricoes` passam todas).
  `src/test/campoKey.test.ts` (7 casos) é **mutation-test explícito**: voltar a
  exigir prefixo `c_` deixa o gate vermelho.
- **Reparo de dado aplicado** no evento Patrocinadores: as 7 chaves voltaram às
  ORIGINAIS, lidas de `ext_eventos.campos` (a tabela de origem NÃO foi dropada) e
  casadas por rótulo — derivado, não adivinhado. Dry-run antes: 7/7 acharam a
  original e 7/7 tinham resposta gravada. Depois: **15/15 inscrições casam** (era
  0/15). Backup do estado anterior em
  `scratchpad/backup_campos_patrocinadores_20260803.json` (não versionado).
- ⚠️ Se aparecer outro evento com respostas em "—", o diagnóstico é comparar
  `insc_eventos.campos->>'key'` com `jsonb_object_keys(inscricoes.dados)`; a cura
  é buscar a chave original em `ext_eventos`, nunca reescrever `dados`.

## ⚠️ Propostas · `/:id` engolia `/avaliar` e `/mural` (2026-08-03 · SEM migration)

As abas **Avaliar** e **Mural da reunião** não abriam: `GET /:id` é declarado na
linha ~248 de `routes/propostas.js` e as duas rotas LITERAIS vêm depois (~411 e
~468). No Express o primeiro match vence, então `GET /propostas/avaliar` caía no
handler de detalhe com `id='avaliar'`, o PostgREST recusava a comparação contra a
coluna `uuid` (22P02) e a resposta era **400**. Em cascata, nada chegava a
`APROVADO`/`CONSOLIDADO`, então **deliberação, ressalvas, recurso, pós-evento e a
consolidação do ciclo ficavam inalcançáveis** — com o backend inteiro pronto.
Mesma armadilha já registrada aqui para o Grupos ("rota `/kpis` declarada ANTES
de `/:id`").

- **Correção: guarda de UUID no `/:id`** (`if (!UUID_RE.test(id)) return next()`),
  não reordenação. Resolve E **previne recaída**: rota literal acrescentada depois
  passa a ser alcançada sozinha, sem depender de alguém lembrar de declará-la
  acima. Também evita mover um bloco de 60 linhas, que é onde o erro nasce.
- Comportamento provado em app Express mínimo (5.2.1): `/avaliar` → handler de
  avaliar · `/mural` → mural · uuid → detalhe · path desconhecido → 404.
- ⚠️ Só `GET /:id` tinha o problema. `PUT /:id` e `DELETE /:id` não têm rota
  literal declarada depois deles (`DELETE /anexos/:anexoId` vem ANTES).

## Kids · lista mensal de aniversariantes impressa (2026-08-03 · SEM migration)

`GET /totem-kids/aniversariantes?mes=1..12` + seletor de mês/agrupamento no
`KidsHub` + gerador A4 em `src/lib/imprimirAniversariantesKids.ts` (molde do
`imprimirListaPresencaBatismo`: thead repetido por folha, `page-break-inside`).

- **Agrupamento à escolha: por DIA ou por SALA** (decisão do Matheus). A sala é
  DERIVADA da idade em meses (`salaDaIdade`, mesma régua do `sugerirSala`), com o
  catálogo carregado 1× em vez de uma consulta por criança.
- ⚠️ **As faixas de `kids_salas` têm BURACOS** — Berçário acaba em 21 meses e
  Maternal começa em 24, e nada cobre 0–5. Medido em agosto/2026: 68
  aniversariantes, **5 sem sala nenhuma**. Por isso o agrupamento por sala tem o
  grupo "Sem sala definida pela idade" no fim: criança sem faixa não pode
  desaparecer da folha.
- **A lista impressa SAI COM TELEFONE** do responsável (decisão explícita dele —
  quem imprime vai ligar parabenizando). É a ÚNICA lista do sistema que imprime
  PII por padrão: a folha leva aviso âmbar pra não circular e descartar depois.
  Contraste proposital com `imprimirListaInscritos`, onde contato só sai marcando
  a caixa. Mudar isso é mexer só neste arquivo.
- **Idade que a criança COMPLETA**, não a idade de hoje: se o dia já passou no ano
  corrente, o próximo aniversário é no ano que vem. É o número que vai no bolo.
- ⚠️ **Bug de truncamento consertado junto**: o `/dashboard` lia as crianças com
  `.range(0, 999)` e a base passou de mil (**1.023 ativas com nascimento** em
  03/08) — **23 crianças ficavam de fora da lista da semana, em silêncio**. Virou
  `fetchCriancasPaginado`. É a lição do cap de 1000 do PostgREST outra vez: o
  código só quebra quando a base cresce, e sem aviso.
- Idade passou a aparecer **ao lado do nome** na lista de Crianças (antes estava
  na 2ª linha, misturada com o nome do responsável).

## ⚠️ App · entrada de PESSOA sob o Contrato de porta (2026-08-04 · migration `20260804200000`)

Decisão do Marcos: os LÍDERES de grupo são os primeiros a usar o app e é a
chance de fechar o cadastro de quem falta — então **entrar no app passa a
exigir cadastro de gente**, com um **caminho rápido por CPF** pra quem já está
na base. Fecha (na entrada do app) o furo do
`## ⚠️ LEI · o gatilho de auth.users`: medido em 04/08 · **21 cadastros**
`origem_cadastro='auth'` (20 sem CPF/telefone/nascimento · **13 com nome =
prefixo do e-mail** · **1 duplicata confirmada**: Victória Lannes × Maria
Victória Lannes Campos) e **26 das 43 contas do app** apontando pra cadastro
sem CPF.

**⚠️ LEI DESTE FLUXO · CPF IDENTIFICA, NÃO AUTENTICA.** CPF está em nota
fiscal, cadastro de loja, planilha — não é segredo. Vincular a conta só porque
alguém digitou um CPF entregaria a essa pessoa o grupo, os **filhos no Kids** e
o **histórico de contribuição** do dono do CPF. Então: CPF acha o cadastro → o
código vai pro **telefone QUE JÁ ESTÁ NO CADASTRO** (NUNCA pra número digitado
na hora) → quem prova posse é vinculado. Mesma régua de "prova de posse" dos
links do WhatsApp dos líderes.

- **`services/appIdentidade.js`** · `identificarPorCpf` (busca SÓ por CPF —
  aqui não vale o "achou por telefone/nome" do matcher, senão o CPF deixa de
  ser a régua) · `confirmarCodigo` · `completarCadastro` (formulário → matcher
  canônico `acharOuCriarGuardado`, origem `app_onboarding`).
- **Resposta MASCARADA** (`mascararNome`/`mascararTelefone`): quem digita um
  CPF vê "Marcos P. D. de A." e "(21) *****-8249" — nunca nome/telefone
  completo de terceiro. Guarda em `src/test/appIdentidade.test.ts` (8 casos):
  aumentar o que a máscara revela transforma o endpoint em coletor de dados
  com uma lista de CPFs.
- **Tetos**: `limiterStrict` (10/15min por IP) nas rotas de CPF/código +
  **5 envios por telefone/dia** no serviço (o dono do número não pediu nada) +
  6 tentativas de código + TTL 10 min + 1 verificação aberta por conta
  (UNIQUE parcial).
- **Código nunca em claro**: `app_verificacoes.codigo_hash` = sha256(código +
  id da linha como sal). Tabela **só service_role** (nenhuma policy pra
  authenticated — SELECT ali deixaria a anon key ler o alvo de vínculo alheio).
- **Envio direto, NÃO pela fila `whatsapp_envios`**: a fila guarda params em
  texto (código legível no banco) e faz retry/backoff — entrega atrasada de
  código de 10 min é inútil.
- **Fantasma é FUNDIDO**: se a conta estava pendurada num cadastro do gatilho
  (sem CPF/telefone/nascimento **e** nome placeholder/derivado do e-mail), o
  vínculo novo dispara `merge_membros` (⚠️ params com prefixo `p_`) e loga em
  `mem_merge_log`. Falha do merge não desfaz o vínculo — a duplicata sobra pra
  fila das Entradas, que é onde humano decide.
- **`GET /app/identidade/status`** diz o que falta; **`completo` ignora o CPF**
  (recomendado, não obrigatório — ninguém fica fora do app por não ter o
  documento em mãos). No app, `CadastroGate` só redireciona quando o servidor
  RESPONDE que falta algo: falha de rede não prende ninguém na tela.
- ⚠️⚠️ **O CÓDIGO VAI POR E-MAIL, não por WhatsApp** (migration
  `20260804210000`): a Meta **RECUSOU a categoria Autenticação** pra nossa
  conta do WhatsApp Business ("sua conta não pode usar esse tipo de mensagem")
  — e código de uso único NÃO pode ir em template utility (violação de política
  + derruba a nota de qualidade do número que fala com os 87 líderes). Canal =
  `services/email.js` (Graph; Resend só com `RESEND_FALLBACK=1`). Sem canal
  configurado o endpoint devolve `motivo:'sem_canal'` e a tela cai no
  formulário — nunca promete um código que não vai chegar.
  ⚠️ **E-mail COMPARTILHADO em família não serve de prova** (`motivo:
  'email_compartilhado'`): mãe e filho na mesma caixa significaria o filho
  digitar o CPF da mãe, ler o código e ver as CONTRIBUIÇÕES dela. Nesse caso o
  caminho rápido se recusa e a pessoa vai pro formulário, que resolve pelo
  matcher (nome+e-mail) e cai no cadastro DELA.
  ⚠️ Se algum dia a Meta liberar autenticação: o botão "Preenchimento
  automático" exige **nome do pacote + hash de assinatura de 11 chars**
  derivado do certificado do **Play App Signing** (não do keystore do EAS) —
  usar "Copiar código" evita isso e funciona no iOS também.
- ⚠️ Não substitui o gatilho de auth.users (que segue criando cadastro no
  signup) — este fluxo **reconcilia** depois. Trocar o gatilho continua
  dependendo da query no SQL Editor + alinhamento com o Matheus.

## Kids · idade exata, WhatsApp pessoal e gerencial dentro da trava (2026-08-03 · SEM migration)

Três pedidos do Matheus no mesmo dia, todos no Kids.

**1 · Filtro de idade EXATA** em `GestaoCriancas.tsx` (`/ministerial/totem-kids/criancas`).
Eram faixas fixas (`0-2 / 3-5 / 6-8 / 9-12`, em MESES), que não respondem "quantas
crianças de 4 anos eu tenho?". Agora o seletor lista as **idades que existem na
base**, com a contagem de cada uma, derivadas do `idade_meses` que o backend já
manda (`floor(meses/12)`).
- ⚠️ **Não recalcular a idade no cliente a partir de `data_nascimento`**: o filtro
  discordaria da coluna "Idade" da linha, e no dia do aniversário a diferença é de
  um ano inteiro. A fonte é `idade_meses` (`calcIdadeMeses` em routes/totemKids.js).
- ⚠️ Abaixo de 24 meses o `formatIdade` do backend mostra **meses** ("14 meses"),
  então filtrar "1 ano" traz linhas cuja coluna diz "12…23 meses". Está correto; é
  o único ponto em que rótulo do filtro e texto da linha não são idênticos.
- Criança **sem data de nascimento** ganhou opção PRÓPRIA no seletor. Antes ela
  desaparecia em silêncio de qualquer faixa — e é justamente a que a equipe precisa
  achar pra completar o cadastro.
- Segue 100% client-side (o único param que vai ao servidor é `ativo`).

**2 · O botão de WhatsApp da Apresentação de Crianças agora abre o WhatsApp DE QUEM
CLICA**, não o inbox institucional. Era `hrefConversa` (→ `/conversas`); virou
`hrefWhatsapp` (→ `wa.me`), helper NOVO no mesmo `src/lib/conversas.ts`. Decisão do
Matheus: quem fala com a família é a voluntária, pelo aparelho dela.
- ⚠️ **Isto é exceção consciente ao padrão da casa**, que é mandar pro inbox
  interno (`hrefConversa`, usado em Cuidados e afins). Só a Apresentação mudou —
  não replicar sem pedido, senão a conversa deixa de ficar registrada no
  /conversas.
- ⚠️ **`hrefWhatsapp` tem gap conhecido e DOCUMENTADO**: o `55` é condicional (≤11
  dígitos), então **estrangeiro de 11 dígitos leva 55** — o suíço `41765764538` do
  lançamento dos grupos vira `5541765764538`. **Nem lista de DDD desambigua**,
  porque `41` é DDD legítimo de Curitiba; resolver exige guardar o código de país
  separado na entrada. `src/test/hrefWhatsapp.test.ts` (10 casos) **fixa esse gap
  num teste** pra que mudá-lo seja consciente, não acidental.

**3 · Voluntário do Kids alcança o gerencial `/kids` dentro da trava de quiosque.**
`MODULO_TRAVA_PREFIXOS.kids` ganhou `/kids` (antes ficava fora de propósito) + card
"Indicadores e gestão" no `KidsHub`.
- ⚠️ **NÃO é mudança de permissão.** O cargo `voluntario-kids` já tinha `kids`
  nível 3, e `authorizeModule('painel-area', 1)` — o guard dos indicadores — usa
  `ROUTE_MODULE_MAP['painel-area'] = ['kids','ami','bridge','online','producao']`:
  **`painel-area` é routeKey, não slug de módulo** (não existe em `modulos`), então
  quem tem `kids` já passava. O que bloqueava era só a trava de rota.
- ⚠️ **O card no hub é obrigatório, não enfeite**: a trava esconde o menu inteiro
  (`AppShell` não renderiza MegaMenu nem MobileNavSheet quando `rotaTravada`), então
  sem ele o `/kids` fica inalcançável mesmo com permissão. De brinde, conserta o
  "Voltar ao Kids" do `ApresentacaoCriancas.tsx`, que já apontava pra `/kids` e
  ricocheteava em conta travada.
- ⚠️ **NÃO desligar `is_membro_only`** pra resolver isso. Além de derrubar a trava
  (que exige EXATAMENTE 1 módulo), faria aparecer o menu com **Painel CBRio e
  Dashboard Semanal**, que `menuAccess.PUBLICO_TODOS` marca como visíveis a
  qualquer logado. Voluntário do Kids passaria a ver os painéis macro da igreja.
- ⚠️ Corolário do mesmo mecanismo: **dar um 2º módulo a um cargo de quiosque
  DESLIGA a trava** (`slugsComAcesso.length === 1`). Quem precisar ampliar acesso
  de conta travada tem que mexer nos PREFIXOS, não na matriz.

## Dashboard Semanal · acumulado do ano até hoje × anos anteriores (2026-08-03 · SEM migration)

Pedido do Matheus na aba **Mensal**: *"quero ver o acumulado do ano até a data
atual, e comparar com os outros anos no mesmo período, a escolha dos indicadores
deve refletir"*. A aba só respondia "como foi **este mês**" e "mês a mês por
ano"; **nenhuma tela do sistema** respondia "como está o ano até aqui contra o
ano passado até aqui". Bloco novo (`YtdAcumuladoCard.jsx`) entre os filtros e o
gráfico mensal, seguindo Indicador / Culto / Anos comparados — o recorte de
**Meses não se aplica** (o período é sempre 1º de janeiro → hoje).

**⚠️ O corte é por DIA, não por mês fechado nem por ano inteiro.** Os cultos do
ano corrente nascem **pré-agendados até dezembro com frequência 0** (2026 tem 347
linhas em `cultos`, só ~199 até agosto). Somar "o ano" sem corte compararia 7
meses de 2026 com 12 de 2025 **e** inflaria o denominador de cultos — os dois
erros na mesma direção. Vale pra qualquer agregação "do ano" nova neste banco.

### ⚠️ O período é escolhido nos chips **Meses** · `resolverPeriodo` (2026-08-03)

Pedido do Matheus no mesmo dia: *"gostaria que eu pudesse escolher o filtro, para
filtrar o período específico que eu quisesse"*. **NÃO criei um segundo seletor de
período** — os chips **Meses** que já existiam passaram a valer também pro bloco
(antes ele os ignorava). Dois controles de período na mesma tela seriam duas
respostas pra "qual período estou vendo".

`resolverPeriodo({ meses, anos, hoje })` (puro, em `backend/utils/periodoYtd.js`)
traduz a seleção em UM período aplicado igual em todos os anos:

| meses marcados | anos comparados | período resolvido |
|---|---|---|
| jan…dez | inclui 2026 | 1º de jan a **3 de agosto** (parcial) |
| jan…jun | qualquer | 1º de jan a **30 de junho** (fechado) |
| jan…dez | **só 2024 × 2025** | 1º de jan a **31 de dezembro** (fechado) |
| mar, mai, jul | inclui 2026 | só esses 3 meses, somados |

⚠️ **A regra que preserva a comparação justa**: o período só é PARCIAL quando o
ano corrente está entre os comparados **E** os meses alcançam o mês de hoje. Sem
isso, "ano inteiro comparando 2024 × 2025" seria truncado em agosto e jogaria 5
meses de dado fora dos DOIS anos — e "ano inteiro incluindo 2026" compararia 12
meses de 2025 com 7 de 2026. Mês marcado depois do corte é **descartado** (não
há dado pra ele em ano nenhum do recorte).

⚠️ **Fevereiro fechado devolve `dia = 29` de propósito**: quem clampa 29→28 em ano
não bissexto é o `corteDoAno()`, que já é testado pra isso. Duplicar a regra no
`ULTIMO_DIA_DO_MES` daria duas réguas pra decidir a mesma coisa.

⚠️ **Seleção não-contígua (mar, mai, jul) tira o bloco de batismos do ar**, com
aviso: a contagem dele é por intervalo `gte/lte` de datas e incluiria abril e
junho. Total "quase certo" é pior que total ausente. O filtro por mês nos cultos
é conferido **linha a linha** (`mesesNoPeriodo.has(mes)`), porque a janela de datas
da query pega o intervalo inteiro.

⚠️ **Voluntariado só usa o corte por semana ISO quando o período é PARCIAL.**
Período fechado já termina no fim de um mês passado — cortar por semana ali
recortaria o último mês pela metade sem motivo.

**⚠️ Total absoluto e MÉDIA POR CULTO andam sempre juntos.** O nº de cultos no
mesmo período cresceu ano a ano porque a igreja abriu horários (154 em 2023 → 152
→ 186 → **199 em 2026**). Frequência até 03/08: 2024 **58.198** (383/culto) ·
2025 **65.097** (352/culto) · 2026 **63.235** (328/culto) — o total de 2026 quase
empata com 2025 **e a média por culto cai**, leitura que o total sozinho esconde.

- **`GET /dashboard-semanal/ytd?anos=&indicador=&culto=`** lê **`cultos` direto**:
  `vw_dashboard_semanal` perde `cultos.data` no `GROUP BY`, então "até hoje" não é
  filtrável nela (mesmo motivo do `/resumo-mes`). Reusa `colunasCultos()` /
  `somaColunas()` e a exclusão de `has_kids = false` pros indicadores de kids — a
  régua de `/yoy` e `/media-mes`, que **falta no `/mensal`**. Paginado pelo cap de
  1000 do PostgREST. Devolve total, cultos com dado, média por culto, Δ% do total
  E da média, curva acumulada mês a mês e batismos do mesmo período.
- **Voluntariado é a exceção do corte**: vem de `vw_dashboard_voluntariado`
  (check-ins reais), que agrega por semana ISO e **não tem coluna de data** →
  corte = **última semana ISO completa** (a corrente só fecha no domingo; incluí-la
  compararia 1 dia de agosto com 7 dias dos outros anos). Igual em todos os anos,
  então o YoY segue justo. ⚠️ O filtro de **culto não vale** ali: a view agrega por
  BLOCO (`b10c0000-…`), ids que não são os de `vol_service_types` — declarado em
  `avisos` em vez de devolver vazio em silêncio.
- **Ano sem dado é DECLARADO em `avisos`**, não escondido: os check-ins de
  voluntário só começam na **semana 16 de 2026** (zero histórico) e Online DS só
  existe a partir de 2024. Sem o aviso a tela pareceria quebrada.
- **⚠️ "Novos membros" ficou FORA do comparativo, de propósito**: `mem_membros`
  tem `created_at` mínimo em **2026-04-14** (base importada) e `data_membresia` /
  `data_batismo` / `data_conversao` estão **nulas nas 8.049 linhas** — não existe
  histórico pra comparar. O card mensal continua como está. Não "consertar"
  usando `created_at` como data de entrada: mediria o dia do import.
- Batismos entram por `batismo_inscricoes.data_batismo` (status `realizado`) e
  **não passam pelo filtro de culto** (batismo não acontece "num tipo de culto").
  YTD até 03/08: 2024 **143** · 2025 **134** · 2026 **89**.
- **`backend/utils/periodoYtd.js`** = helpers PUROS com o "agora" **injetado**
  (teste que lê o relógio da máquina é o que mordeu no `faixaEtaria.test.ts`).
  15 casos em `src/test/periodoYtd.test.ts`, guardas: (1) o dia vem do **fuso da
  igreja** — às 23h BRT o dia UTC já virou e o corte pegaria os cultos de AMANHÃ,
  que existem com valor 0; (2) **29/02 em ano não bissexto vira 28/02** —
  `'2025-02-29'` é data inexistente e o Postgres recusa a **query inteira**, não
  só a linha, então sem a guarda o comparativo quebraria por completo um dia a
  cada quatro anos; (3) semana corrente só conta quando fecha no domingo.

## Grupos · inscrição de CASAL numa tela só (2026-07-30 · migration 20260730140000)

Decisão do Marcos: em grupo com `mem_grupos.categoria = 'Casais'` (8 hoje,
inclusive o "CURSO ALIANÇA — CURSO DE CURA PARA CASAIS") o formulário público
`/inscricao-grupos` inscreve **os dois cônjuges de uma vez**, com **1 aviso de
WhatsApp pro líder** (os dois nomes) e **a aprovação pelo link decidindo o
casal junto** (idem recusa). A opção aparece **só** nessa categoria.

**Contrato de porta preservado:** cada cônjuge é UM cadastro próprio
(`mem_membros` ou `mem_cadastros_pendentes`) e UM pedido próprio em
`mem_grupo_pedidos` — nunca "dois nomes num campo de texto".

- **Migration `20260730140000_grupos_inscricao_casal.sql`** (aditiva ·
  idempotente): `mem_grupo_pedidos.casal_pedido_id uuid` auto-referência
  (`ON DELETE SET NULL`) + índice parcial + COMMENT. Os DOIS pedidos apontam um
  pro outro (vínculo **cruzado**) → qualquer um dos dois links de aprovação acha
  o par. Nenhuma tabela nova, nenhuma policy tocada.
- **Backend `publicGrupos.js` — extraído, NÃO duplicado:** o trecho
  "pessoa → pedido" do `POST /inscrever` virou a função pura
  **`processarPessoaPedido({ grupo, pessoa, contexto, principalId,
  principalMembroId })`**, que nunca escreve em `res` (devolve
  `{ok:true,pedido_id,…}` · `{ok:true,ja_membro|ja_pedido,…}` ·
  `{ok:false,status,codigo,campo,error}`). Titular e cônjuge usam a MESMA
  função. Ficam INLINE no handler as travas do GRUPO (fechado,
  `aceitando_inscricoes`, temporada, gênero × categoria) — são checadas uma
  vez, não por pessoa.
- **Regras do fluxo:** cônjuge validado com a MESMA régua
  (`services/inscricaoContrato.validarCamposPadrao`), erro volta com
  `campo:'conjuge.<campo>'`; **CPF igual ao do titular é 400** (é a mesma
  pessoa, não um casal — e é isso que torna seguro excluir o par do dedup);
  cônjuge em grupo não-casais é **ignorado em silêncio**; **se o cônjuge falha,
  o titular VALE** (201 com `conjuge:{ok:false,error}` — nunca desfaz o titular,
  nunca 500 com ele gravado).
- **Dedup:** `checarDuplicataInscricao` ganhou `ignorarMembroIds/
  ignorarPedidoIds` — marido e mulher compartilham telefone e e-mail (2 chaves
  fracas = dispara), então sem excluir o par o 2º cônjuge seria engolido como
  "já recebemos um pedido parecido".
- **Notificações:** UM `notificarLiderNovoPedido` com os dois nomes em `{{3}}` e
  os dois contatos em `{{4}}` (template `grupos_pedido_novo_lider_v2` já tinha
  as 5 variáveis · o service ganhou `pessoa.contato` opcional pra sobrescrever
  o {{4}}); `enviarInscricaoConfirmada` roda **por pessoa** (dois telefones,
  cada um gated pelo SEU opt-in · D4); notificação in-app diz "(casal)".
- **Aprovação (`/g/a/<token>`):** `GET /pedido/por-token` devolve `casal` (o
  pedido do cônjuge, só se no MESMO grupo) e a página mostra "X e Y querem
  entrar"; `POST /aprovar` aprova os dois pelo mesmo `aprovarPedidoCore`
  (idempotente: par já aprovado não quebra; par já rejeitado/devolvido/
  encaminhado NÃO é reaberto — aprova só este e informa) e a **recusa devolve
  os dois pra triagem**. Nenhuma validação de token afrouxada (segue amarrado
  ao líder atual + ao pedido).
- **Front `InscricaoGrupos.jsx`:** bloco "Inscrever meu cônjuge junto" no step
  1 quando `categoria === 'casais'` (reusa `Field`/`BirthDatePicker`/máscaras
  já existentes + `lib/inscricao`), erros nas chaves `conjuge.*`,
  **consentimento explícito** de que o cônjuge está ciente e concorda (LGPD ·
  vai como `consentimento_texto` dele) + opt-in próprio de WhatsApp, 1 POST só,
  tela de sucesso citando os dois e destaque honesto quando só a do cônjuge
  falhou.
- **Follow-ups conhecidos:** (1) a aprovação **logada** em `/grupos`
  (`aprovarPedidoCore` direto) decide **um pedido por vez** — o par junto só
  vale no link do WhatsApp; (2) a caixa de entrada não mostra selo de "casal"
  ainda.

## Grupos · busca sem acento + apelido do líder (2026-07-30 · migration 20260730170000)

Caso real: a Patrícia tentou se inscrever no grupo do "Antônio" no domingo e
**nenhum pedido dela existe no banco** — não conseguiu concluir. O líder está
cadastrado como **"ANTONIO MARCO PEREIRA"** (sem acento) e a busca era
acento-SENSÍVEL, então quem digitava a grafia correta não achava o grupo. Ele
também é conhecido como **"Tuninho"**, e não havia busca por apelido.

- **Régua ÚNICA de busca em 2 espelhos** (a filtragem acontece nos dois lados):
  `src/lib/busca.js` (cliente) e `backend/services/busca.js` (servidor) —
  `normalizarBusca` (NFD → tira diacrítico → lower → colapsa espaço → trim),
  `contemNormalizado(alvo, termo)` e `algumContemNormalizado(lista, termo)`.
  ⚠️ **Compara normalizado contra normalizado nos DOIS lados** (termo E alvo):
  normalizar só um não resolve nada. Mudou a regra num arquivo? Mudar no outro.
  Testes: `src/test/busca.test.ts` (acento nos 2 sentidos, cedilha, caixa,
  espaço, NFD×NFC · determinístico, sem depender de hora/locale).
  ⚠️ SÓ pra texto exibido — NUNCA em slug/enum/chave/coluna.
- **Onde já vale:** `publicGrupos.js` `GET /buscar` (filtros `lider_nome` e `q`)
  e `GET /lideres/buscar`; `GrupoSelector` (busca por grupo e por líder);
  `GruposMapView` (busca do mapa); lista de grupos do `/grupos` (admin).
  ⚠️ O filtro de `/lideres/buscar` **saiu do `ilike`** (que é acento-sensível e
  não alcança o apelido) pra JS — são dezenas de líderes por temporada.
- **`mem_membros.apelido`** = "como a pessoa é conhecida na igreja". Cadastrado
  pela equipe no form de edição do membro da **Membresia** (`PUT /membros/:id`
  grava `req.body` direto · o form manda `null` só quando havia apelido antes,
  pra permitir limpar). **Entra na BUSCA sem poluir a EXIBIÇÃO do nome real:**
  `lideres_nomes`/`lider_nome` seguem só com nomes reais; `lideres_busca` =
  nomes + apelidos (é nele que os filtros procuram, com fallback pros nomes pra
  bundle antigo/deploy em 2 etapas); `lideres_exibicao`/`lider_apelido` montam
  "Nome (Apelido)" no cartão do grupo, no balão do mapa e na confirmação do
  grupo escolhido (`InscricaoGrupos`) — é o "ah, é o Tuninho".
- ⚠️ **O `apelido` é selecionado em consulta ISOLADA e best-effort**
  (`buscarApelidos` em publicGrupos.js): se a migration não tiver sido aplicada,
  pedir a coluna faria o PostgREST recusar a query INTEIRA e derrubaria a busca
  de grupos pra todo mundo (lição do `parcelas_max`). Falha ali = "sem apelido
  nesta resposta", nunca busca quebrada.
- **Migration `20260730170000_membros_apelido.sql`** (aditiva/idempotente · sem
  FK/constraint/tabela nova) + seed do caso real (`apelido='Tuninho'` achando o
  id por `upper(btrim(nome))`, só quando `apelido IS NULL`). ⚠️ Numerada 170000
  porque **160000 já estava ocupado** (`..._next_dia_sessao_real_e_semana`).
  NÃO cadastrar outros apelidos por migration — é dado que a equipe preenche
  caso a caso na Membresia.
- **Limitações conhecidas:** o `/grupos/buscar` **autenticado** não devolve
  `lideres_busca`/apelido (a busca lá é acento-insensível, mas não acha por
  apelido); a ficha da pessoa da aba Pessoas do /grupos ainda não edita apelido;
  a Membresia não exibe o apelido no cabeçalho do membro (só no form).

## ⚠️ Página lida por verificador EXTERNO tem que ser HTML estático (2026-08-04)

A verificação da marca no **Google Auth Platform** (projeto `crm-cbrio` — o que
autoriza o "Entrar com Google" do app de membros) foi recusada com dois motivos,
ambos sobre a página inicial declarada no consentimento: *"your home page does
not explain the purpose of your app"* e *"the app name 'CBRio' does not match
the app name on your home page"*. **Verificada ✅ na tentativa seguinte**, com o
conserto abaixo (levou ~3h, não dias).

**A causa não era o texto — era o JavaScript.** O campo apontava para o ERP, que
é SPA: o verificador busca a página **sem executar JS**, recebe o shell vazio do
`index.html` e lê o `<title>` global (`CBRio · Comunidade Batista do Rio de
Janeiro`). Isso é, ao mesmo tempo, "não explica propósito" e "o nome não bate".

- **`public/aplicativo.html`** + rewrite em `vercel.json` (`/aplicativo →
  /aplicativo.html`, **antes** do catch-all do SPA) é a home page do app. Mesmo
  padrão do **`public/privacidade.html`**, que já existia e que o Google sempre
  aceitou — foi justamente essa diferença que revelou o mecanismo.
- ⚠️ **NÃO converter para rota React.** Já foi tentado (PR #2261) e é a versão
  que falha: o conteúdo precisa existir na resposta HTTP. Mesma régua vale para
  qualquer página que um robô de terceiro (Google, Apple, Meta) precise LER.
- ⚠️ **O `<title>` e o `<h1>` são exatamente `CBRio`** — o mesmo string do campo
  *App name* do consentimento e do `expo.name` do `app.json`. **Renomear o app no
  console exige renomear aqui**, senão o motivo 2 volta. O acoplamento está
  escrito no comentário do topo do arquivo.
- Rotas públicas servidas por rewrite estático hoje: `/privacidade`,
  `/aplicativo`. As por rota React: `/suporte`, `/politica-reembolso`.
- ⚠️ **Lição de método (erro meu, registrado):** procurei `"/privacidade"` no
  bundle de produção, não achei e concluí que a página não existia — ela existe,
  como arquivo estático. **Ausência de rota no bundle não prova ausência de
  página**: rewrite e arquivo em `public/` não passam pelo React Router. Para
  saber se uma URL pública existe, olhar `public/` e os `rewrites` do
  `vercel.json` também.
- Pendência conhecida (não bloqueou esta verificação): `cbrio.org`/`cbrio.com.br`
  estão verificados no **Search Console por outra conta Google** ("Play Console
  org"). Se uma verificação futura falhar por propriedade de domínio, é isso — e
  o conserto é adicionar a conta do console como proprietária, não é código.

## ⚠️ Google Tag Manager · SÓ no domínio público, nunca no ERP (2026-07-29)

Gustavo (tráfego pago, parceiro externo) precisava medir anúncio → o site não
tinha **nenhum** rastreamento (conferido no HTML e no bundle de prod: zero
Analytics, zero GTM, zero pixel). Container criado pelo Marcos:
**`GTM-M59RCB34`**, conta Google **`cblab@cbrio.com.br`** (endereço de função
do marketing, registrado como conta Google sem Gmail — a igreja é Microsoft
365). A igreja é dona; Gustavo entra como usuário com permissão *Publicar* no
container (não Admin).

**A LEI:** o GTM carrega **só** em `cbrio.com.br`/`www.cbrio.com.br`. **Nunca**
em `cbrio.org`. Motivo: este bundle serve os DOIS domínios (`SITE_PUBLICO_HOSTS`
em `src/App.tsx:549` → hostname público monta `SitePublicoRoutes`, o resto monta
o ERP). Um snippet solto no `index.html` carregaria o container em toda tela
logada — nome, CPF, telefone, contribuição, dado de menor no Kids indo pra
Google/Meta. Por isso o snippet em `index.html` tem **gate por hostname** antes
de injetar o `gtm.js`, espelhando a lista do `App.tsx`. **Mudou
`SITE_PUBLICO_HOSTS`? Muda a lista no `index.html` também.**

- **Sem `<noscript>` no ERP** (de propósito): o iframe do GTM só serve visitante
  com JS desligado e, sem JS, um SPA nem renderiza — não mediria nada e
  carregaria em `cbrio.org`, exatamente o vazamento que o gate evita. O site em
  Astro (HTML estático, renderiza sem JS) leva o noscript normal.
- **ID hardcoded, não env**: o liga/desliga de qualquer tag vive no painel do
  GTM (é o propósito da ferramenta) — env só somaria um ponto de falha na
  Vercel. Não trocar por `VITE_*` sem motivo novo.
- **SPA**: o GTM não detecta troca de rota sozinho. Contagem de navegação
  depende do gatilho *History Change* configurado pelo Gustavo no painel.
- **Site em Astro** (`~/cbrio-site`, repo `igreja-cbrio/site-cbrio`): mesmo
  container já instalado no `src/layouts/Base.astro` (sem gate — lá o app só é
  público). No cutover do DNS, o GTM sai daqui junto com o `SitePublicoRoutes`.

**Pendente (decisão do Marcos + Gustavo):** conversão de verdade (inscrição em
evento) acontece nas **portas públicas do ERP**, em `cbrio.org` — fora do
domínio público. Medir isso exige GTM nessas rotas específicas, com regra
explícita de não enviar dado pessoal. Não fazer por conta: cada porta pública é
um formulário com PII (ver as 2 LEIs de porta/inscrição acima). Também em
aberto: o domínio já tem **Search Console** verificado por outra conta Google
("Play Console org" · meta `google-site-verification` no `index.html`) e o canal
do YouTube usa uma terceira — consolidar identidade antes de ligar Ads↔YouTube.

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

## ⚠️ Módulo de Comunicação (WhatsApp central) · handoff pro MATHEUS (2026-07-28)

Decisão do Marcos (bloco C da revisão estrutural): fundir Conversas + Menu das
Conversas + Bot WhatsApp num módulo central com números, templates, mensagens
automáticas/programadas, chat ao vivo, erros, atendentes e dashboard de
custo/envios/respostas. **Contexto COMPLETO (inventário verificado no código +
fases C0–C5 + decisões em aberto): `docs/modulo-comunicacao/contexto-e-plano.md`.**
Regra de ouro: começar pelo **C0** (capturar `value.statuses` no webhook — sem
isso não existe relatório) e NÃO reescrever o chat de /conversas.
- **Porta 5 · Next (2026-07-28 · migration `20260728230000` = M7):** nome vira
  campo único (split no server, tolera payload antigo); **nascimento
  obrigatório+validado SÓ em `POST /inscrever`** — o walk-in do totem
  (`/checkin/:token/walkin`) segue "nunca travar o atendimento"; sexo
  obrigatório liga o writer da coluna (canônico `masculino|feminino` + CHECK);
  endereço opcional (coluna nova); termos+optin na satélite + `GET /textos`;
  optin agora TAMBÉM persiste na matrícula (`whatsapp_optin/_em`);
  `ja_voluntario` passou a checar por membro além de CPF; **saiu o seletor de
  evento do form** (o backend descartava `evento_id` desde a migração pra
  turmas); trigger `updated_at`.
- **Porta 4 · Voluntariado (2026-07-28 · migration `20260728210000` = M6a):**
  nome vira campo único (split no server, tolera payload antigo); + sexo
  obrigatório e endereço opcional (colunas novas); termos LGPD obrigatório +
  optin espelhados na satélite; **dedup novo** (CPF/membro × status
  inscrito|enviado_ministerio — antes reenviar DUPLICAVA); `GET /textos`.
  Soft-delete em 2 etapas: M6a criou `deleted_at` + TODOS os leitores JS
  filtrando (`voluntariado.js`, `app.js`, `totemKids.js`, `nextDirecionar.js`,
  `volEmailSender.js`); **M6b CONCLUÍDA (2026-07-28 · migration
  `20260729060000`)**: vol_inscricoes na whitelist `app_soft_deletable_tables`
  + patch DINÂMICO (pg_get_functiondef + regexp_replace, técnica da
  20260722250000 — imune a drift) nos contadores SQL: ramos
  `solicitacoes_servir_recebidas/alocadas` de `_kpi_agregar_dado` e dedup de
  voluntariado do `fn_app_inscricoes_fanout` ignoram soft-deletadas (inscrição
  excluída não bloqueia re-inscrição pelo app). **Soft-delete de
  vol_inscricoes LIBERADO — sempre via `app_soft_delete`.**
- **Porta 3 · Líderes/anfitriões (2026-07-28 · migration `20260728190000`):**
  e-mail obrigatório; anti-abreviação no nome; teto 11 no telefone; coluna
  `origem` (linhas antigas = formulario_publico, único writer que existiu);
  dedup ganhou CPF via cadastro pendente; **opt-in de WhatsApp virou checkbox
  EXPLÍCITO default false (D4 · substitui o "concluir É o consentimento" de
  24/07)** — o optin só grava se marcado; termos+optin espelhados em
  `inscricao_consentimentos` (porta `grupos_lider`, snapshot = texto exibido);
  trigger `updated_at`. Optins históricos (gravados como true pelo fluxo
  antigo): reclassificar com jurídico — decisão pendente, NÃO reverter em massa.
- **Porta 2 · Apresentação de crianças (2026-07-28 · migration `20260728170000`):**
  por criança agora vai nome completo + nascimento + sexo (obrigatórios só p/
  inscrições novas; `crianca_idade` legada é derivada do nascimento); e-mail do
  responsável obrigatório; endereço opcional; **consentimento de MENOR
  (`menor_responsavel`, art. 14 §1º) obrigatório** + imagem opcional + opt-in;
  matcher read-only no responsável → `responsavel_membro_id` + vínculo
  `kids_responsaveis` (parentesco só quando um único nome preenchido);
  `kids_criancas` reusa por (nome, nascimento) — acabou a criança órfã
  duplicada; dedup por (cpf, criança, data) → `ja_inscritas[]` na resposta;
  CHECK de status entrou **NOT VALID** (validar depois de conferir DISTINCTs).
- **Porta 1 · Eventos externos (2026-07-28 · migration `20260728150000`):**
  campos padrão obrigatórios só p/ inscrições NOVAS (legadas nome+telefone
  seguem válidas); dedup por CPF com fallback telefone — re-inscrição faz
  merge preservador de `dados` (nunca sobrescreve com vazio; anterior em
  `dados_anterior`) e ENRIQUECE linha legada em vez de duplicar; textos de
  consentimento via `GET /api/public/evento/textos` (snapshot gravado = sempre
  o canônico do backend); form-builder com key OPACA estável (`novaKeyCampo` —
  editar o label NÃO regera a key, senão orfana respostas antigas); rota
  montada ANTES do `publicLimiter` global (evento em massa = 1 IP) com limiter
  próprio generoso (`EVENTO_PUBLIC_RATE_LIMIT_MAX`, padrão 1000/15min).
- Teste: `node backend/services/inscricaoContrato.test.js`.

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

## ⚠️ Conselho deliberativo (skill `llm-council`) · acionar SEMPRE antes de responder (2026-06-28)

Pedido do usuário (gestao@cbrio.com.br · 2026-06-28): **antes de dar qualquer
resposta deliberada**, acionar a skill **`llm-council`** (em
`.claude/skills/llm-council/`). Fluxo de 3 estágios: conselheiros (subagentes com
lentes distintas) em paralelo → revisão por pares anonimizada → síntese do
presidente. A resposta final é a síntese; um bloco curto "Bastidores do conselho"
mostra a posição de cada lente e as divergências.

- **Acionar** em: decisões, análises, planos, arquitetura, trade-offs,
  recomendações, escolhas de schema/segurança/RLS.
- **Pular** (responder direto, dizendo numa linha que pulou por ser trivial):
  tarefas mecânicas e fatos únicos verificáveis (rodar comando, renomear arquivo,
  consultar um slug/linha de config). Acionar em tudo só multiplica custo/latência.
- ⚠️ Honestidade obrigatória: os conselheiros são o **mesmo modelo base** com
  personas diferentes (erros correlacionados) — é **brainstorm estruturado**, não
  oráculo. Consenso do conselho **não é evidência**; para fatos, validar contra o
  código/banco/fontes, não contra o "consenso".

## ⚠️ IA fora do ar = `ANTHROPIC_API_KEY` inválida na Vercel (2026-07-22)

Sintoma: telas/crons que usam IA quebram todos ao mesmo tempo com **401
`authentication_error` "API key is invalid"** — NPS (gerar perguntas), agente
primeiro-contato, agente batismo-next, Central de Agentes, cérebro, nfScanner,
parser do WhatsApp (todos compartilham a MESMA `ANTHROPIC_API_KEY`). Não é bug
de código: a chave foi **rotacionada/revogada** e o valor na Vercel ficou velho
(nesta ocorrência os 401 começaram ~18/07 nos agentes e apareceram no NPS em
22/07 quando alguém apertou o botão). Diferenciar: chave **ausente** → o guard
`clienteAnthropic()` lança "ANTHROPIC_API_KEY não configurada"; chave **inválida**
→ 401 da Anthropic. Correção (NÃO é deploy de código): gerar nova key no console
da Anthropic → atualizar `ANTHROPIC_API_KEY` (Production) na Vercel → **redeploy**
(a Vercel só aplica env nova em deployment novo; não há ignored build step, então
qualquer commit na main serve). Diagnóstico rápido: `get_runtime_errors` da Vercel
agrupa por `authentication_error`.

## ⚠️ LEI · NUNCA nomear pessoa como dono de fluxo neste arquivo (2026-08-05)

Reclamação do Matheus: *"que portão financeiro do Yago?? Yago já saiu do
financeiro faz tempo, agora é Alberto e Sonia Cristina. Nós já tínhamos resolvido
isso, se você tiver qualquer lixo no contexto, remova, nós já mudamos isso e toda
vez você traz isso."* Ele estava certo: o **banco já estava correto** (Yago em
`Gestao`, fora de todas as filas) e era ESTE ARQUIVO que carregava o nome antigo
em 7 lugares — e como ele é lido a cada sessão, o erro se repetia toda vez.

**A regra:** ao descrever fluxo de aprovação/roteamento, escrever o **PAPEL**
("o financeiro aprova", "o responsável da área"), nunca a pessoa. Quem é a pessoa
vive no BANCO e muda sem PR:

| Pergunta | Fonte de verdade |
|---|---|
| Quem aprova/atende por área? | `area_solicitacoes_responsaveis` |
| Quem é o diretor do setor (portão de origem)? | `setor_diretor` (+ `setor_coaprovadores`) |
| Responsável padrão de tarefa do ciclo criativo? | `area_responsaveis` |

Nome de pessoa só é aceitável aqui em **registro histórico datado** ("decisão do
Yago em 31/07", "spec do Yago") — que é fato passado e não vira instrução.

⚠️ Estado em 05/08, conferido no banco: **financeiro = Alberto Luiz Stassen da
Silva**. **Sonia Cristina Barreto Litwinczuk** (`cristina@cbrio.com.br`) é da área
Financeiro mas **NÃO está** em `area_solicitacoes_responsaveis` — então não vê a
fila de aprovação financeira. Pendente de decisão do Matheus.

## Contexto do projeto

Sistema ERP interno da CBRio (Igreja). Stack: React 18 + Vite +
TypeScript/JSX (misto), Express.js backend, Supabase
(PostgreSQL + Auth + RLS), deploy no Vercel (frontend estático +
serverless functions via `api/index.js`).

> **Processos**: removido na reuniao de permissoes (2026-05-18).
> A rota `/processos` foi descontinuada e redireciona pra `/eventos`. Schema
> da tabela `processos` permanece no banco mas o modulo nao aparece mais no
> menu nem no sistema de permissoes (linha marcada como obsoleta na matriz).

> **Apresentações**: desativado a pedido do Matheus (2026-07-06). Rotas
> `/admin/apresentacoes*` redirecionam pro `/dashboard`, item removido do menu
> Inteligência, mount `/api/apresentacoes` comentado no server.js e
> `modulos.ativo=false`. Schema (`apresentacoes*`) e código das páginas/rota
> permanecem pra eventual reativação.

> **Kids · hub × módulo (2026-07-06)**: o hub `/ministerial/kids` (KidsHub)
> ficou só com a OPERAÇÃO de culto (Check-in Totem, Crianças, Painel ao vivo,
> Etiqueta, Configurações + aniversariantes). O GERENCIAL (Frequência,
> Vínculos + solicitações, Equipe, Estoque, Batismos, Apresentação de crianças,
> Decisões) mudou pro módulo `/kids` da aba Cultos (PainelKids = seção Gestão
> [kids nível >=2] + PainelArea de indicadores).

> **Kids · Planning Center REMOVIDO do código (2026-07-20)**: decisão do Marcos
> ("começar a excluir tudo que vem do PCO"). A frequência do Kids é 100% do
> totem (`kids_checkins`): tela Frequência (`KidsFrequencia.tsx`) nativa, cron
> `/cron/resumo-kids` (ex `resumo-pco`) conta crianças únicas do totem, radar de
> ausentes (`fn_kids_ausentes_consecutivos` · migration `20260720210000`) lê
> `kids_checkins`, jornada/análise-frequência idem. Serviços
> `planningCenterKids*.js`, rotas `sync-pco`/`responsaveis-pco`/
> `sync-presencas-pco`/`pco-pessoa`/`depurar-inativos` e a aba Responsáveis do
> admin foram deletados. Ficaram no BANCO (sem leitor · dropar numa limpeza
> futura com aval): `kids_pco_presencas` e `kids_criancas.planning_center_id`.
> ⚠️ O PCO do VOLUNTARIADO (Planning Center Services · vol_*) é outro produto e
> segue vivo — não confundir.

> **Cuidados · Jornada 180 saiu do módulo (2026-07-22)**: decisão do Marcos — quem
> gerencia os grupos de Jornada 180 é o módulo **Grupos** (J180 é um tipo de grupo lá,
> `TIPOS_GRUPO`). Removida a aba "Jornada 180" do `/cuidados` (o `CuidadosJ180` + o
> `EncaminhamentosInbox destino="jornada180"`). Deep-link `?tab=jornada` redireciona
> pro dashboard. NÃO apaguei nada no banco: `cui_jornada180`/`j180_*` + rotas
> `/cuidados/j180/*`/`/jornada180` + `api.cuidados.j180`/`jornada180` ficam DORMENTES
> (alimentam o dashboard-series e KPIs · dropar só numa limpeza futura com aval). O
> `DESTINO_META.jornada180` (backend) fica só pra rotular encaminhamentos legados; o
> desfecho do convertido não oferece mais esse destino (só Next direciona hoje).

## Mapa do sistema · o que cada módulo faz, quem usa e o que alimenta

Visão de helicóptero (formato: o que faz · quem usa · **impacto** = o que
alimenta no sistema). Detalhes nas seções de cada módulo abaixo. A tese do
sistema inteiro: **a operação dos módulos ministeriais alimenta a NSM e os
~150 KPIs da matriz Valor × Área automaticamente** — usar o módulo É medir.

**Núcleo estratégico (OKR/NSM):**
- `/painel` · NSM + mandalas + matriz 6 áreas × 5 valores + alertas · diretoria
  e qualquer autenticado (leitura) · **é o destino final de todos os dados**.
- `/minha-area` · KPIs da própria área agrupados por valor · líderes de área.
- `/gestao` · configurar OKRs/metas/saúde do sistema · Marcos, Matheus, Eduardo.
- `/ritual` · fluxo guiado da reunião mensal (causa-decisão-responsável) ·
  diretoria geral (5 nominais).
- `/monitoramento-okr` · ótica enxuta da planilha do Pr. Juninho · leitura
  macro · paralela ao /painel por decisão (não integrar).
- `/dados-brutos` · líder lança número absoluto; o sistema calcula o KPI ·
  líderes com kpi_areas · **alimenta kpi_valores_calculados via trigger**.

**Jornada do convertido (a esteira que move a NSM):**
- `/integracao` · cultos, frequência, decisões (pessoas nominais), batismos ·
  equipe de Integração (Lorena) · **gera o DENOMINADOR da NSM (decisões) +
  KPIs Seguir de todas as áreas + dispara a trilha do convertido**.
- `/ministerial/cuidados` · encontro pastoral, jornada 90d (contato≤3d,
  batismo≤90d, Next≤90d), desfecho → encaminhamentos · Marcelo Soares
  (supervisor-jornada) + líderes de área · **devolutiva "engajou" materializa
  o vínculo real = NUMERADOR da NSM**.
- `/grupos` · grupos de conexão, caixa de entrada (pedidos+encaminhados),
  visitas de supervisão, pessoas/papéis · Pr. Nélio + Natasha · **alimenta
  Conectar (mem_grupo_membros) + KPIs de líderes**.
- `/voluntariado` · perfis, inscrições, escalas, totem check-in · coordenação
  de voluntários · **alimenta Servir (ponte vol_* → mem_voluntarios)**.
- `/devocionais` (webapp pública) · planos de leitura + check-in diário ·
  membros; admin é do Matheus · **alimenta Investir**.
- `/next` · eventos Next (inscrição/check-in) · admin de eventos · **alimenta
  o marco Next≤90d**; a cobertura aparece na aba Next da Integração.
- `/ministerial/membresia` · cadastro de membros, duplicados/merge, trilha ·
  secretaria/ministerial · **é a base de pessoas que todos os valores cruzam**.

**Áreas de culto (painéis read-only por área):**
- `/online` · canal YouTube (séries, DS/DDUS, pico via OAuth) · Renata ·
  coleta automática; frequência/decisões online quem lança é a Integração.
- `/kids` `/ami` `/bridge` · saúde + cultos + indicadores da área · Mariane /
  Arthur Cecconi / Lillian · leitura; preenchimento via /integracao.
- **Totem Kids** (`/ministerial/totem-kids`) · check-in/out infantil com
  etiqueta e pager · voluntários do Kids · **consolida presencial_kids e
  decisões kids nos cultos** (totems montados, em teste pro go-live).
  Displays de TV (`display-sala`/`display-foyer`, públicos via token de
  estação): usar `resolveApiBaseUrl` de `src/lib/api-base.js` pra montar a
  base da API — o padrão inline `VITE_API_URL || '/api'` não acrescenta
  `/api` quando a env não termina nele, o fetch cai no fallback do SPA e
  quebra com "Unexpected token '<'" (corrigido 2026-07-07).

**Operação administrativa:**
- `/solicitacoes` · backbone único adm↔ministérios (TI, compras, reembolso,
  pagamento, reserva, manutenção, marketing, RH) com 2 portões de aprovação ·
  todo funcionário · **fonte única dos KPIs ADM (SLA/NPS) — interação fora
  daqui não é medida**.
- `/marketing` · kanban/planner da equipe criativa (campanhas por dor,
  capacidade em slots/dia) · Pedro Paiva + equipe · alimenta KPIs MKT-*.
- `/producao` · KPIs técnicos por culto (pontualidade, checklist, ocorrências)
  · Pedro Fernandes · alimenta PROD-CULTO-* (fora da matriz NSM).
- `/eventos` · eventos + ciclo criativo por fases · áreas operacionais ·
  tarefas de marketing espelham no kanban do Pedro.
- `/projetos` · projetos do ANO CORRENTE · PMO/líderes (escopo por área).
- `/expansao` (= Planejamento Estratégico) · plurianual/marcos · diretoria.
- `/planejamento` (= Gestão Anual) · rascunhar próximo ano + resultados de
  anos fechados · PMO · grava direto em projects/events (fonte única).
- `/rh` `/financeiro-v2` `/logistica` `/patrimonio` · operação de gestão ·
  equipes respectivas · RH/financeiro alimentam rotatividade e DRE.
- `/governanca` · ciclo mensal OKR→DRE→KPI→Conselho · diretoria.
- `/revisao-estrategica` · editar projeto/marco vendo a cascata de impacto ·
  PMO · pouco usado (aba Acompanhamento do PE cobre a leitura).

**IA e automação (agem sobre os outros módulos):**
- **Bot WhatsApp** (webhook público) · líder reporta números do culto por
  formulário/texto; institucional responde dúvidas · líderes cadastrados ·
  **vira fila de revisão — nada entra direto no banco**.
- **Agente Executor Financeiro** (Railway) · propõe categorizações/pagamentos
  → fila de aprovação humana em `/assistente-ia` · o financeiro aprova.
- `/cerebro` · SharePoint → notas Obsidian classificadas por Haiku · todos via
  OneDrive · memória institucional de documentos.
- `/admin/*` · permissões (matriz cargo×módulo), usuários, WhatsApp, regras de
  notificação, totem kids · Marcos/admins.

**Públicos (fora do AppShell):** webapp devocional, cadastro de membresia,
inscrição em grupos/Next/batismo, `/privacidade` (exigência Meta/LGPD),
`/novosite` (teste de layout · não listado).

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

#### Tema "Vidro" (glass) · 2026-06-18 — base do visual do sistema

Visual atual = "vidro/command center" (spec original em `~/Downloads/cbriodesignvidro.md`).
Implementado **por tokens** (não reescreve páginas). NÃO regredir:
- **Tokens glass** em `src/index.css` (`:root` escuro + `[data-theme="light"]`):
  `--panel` (fundo translúcido do card), `--hairline`, `--hi` (brilho topo),
  `--shadow`/`--shadow-hover`, `--surface`, `--track`, `--teal`/`--mint`, `--app-bg`
  (fundo ambiente · glows radiais no `body`, `background-attachment: fixed`).
- **`.glass-surface`** (em `@layer components` p/ ser sobrescritível por utilitário):
  `var(--panel)` + `backdrop-filter: blur(14px) saturate(140%)` + borda `--hairline`
  + `box-shadow: var(--shadow), var(--hi)`. É a base do **`<Card>` shadcn**
  (`card.tsx` = `"glass-surface rounded-[16px] text-card-foreground"`) e da `.cbrio-card`.
- **`.glass-solid`** = variante NÍTIDA (sem blur, fundo `--cbrio-card`, `!important`) p/
  dado denso. **Regra de ouro:** dado denso (tabela/form/gráfico) fica nítido.
  Aplicado **automaticamente** por CSS `:has()`: `.glass-surface:has(table|.recharts-wrapper)`
  vira sólido. Cards aninhados não repetem blur (`.glass-surface .glass-surface` → sem blur).
- **Acessibilidade:** `prefers-reduced-transparency` → sólido; `prefers-reduced-motion` → sem hover.
- **AppShell** wrapper = `background: transparent` (deixa o fundo ambiente aparecer);
  header = `bg-card/40 backdrop-blur-xl`. Painel: `CarrosselMandalas`+`AlertasCriticos`
  usam vidro (`var(--panel)` inline); **matrizes/gráficos seguem sólidos** (dado denso).
- **NÃO aplicar vidro** (telas intencionais sólidas/brand): totem (`TotemMembro`,
  totemKids display), `GruposMapView`, `MemberWalletPass/Dialog`, `Login`, QR de
  impressão (`#fff`), scanner/câmera (`#000`), vídeo (`bg-black`). Popovers/dropdowns/
  selects/dialogs seguem **sólidos** de propósito (legibilidade) — não glassificar.
- Acento da marca segue `#00B39D` (`C.primary`).
- **Gráficos (recharts) no tema vidro:** tema global no `index.css` (grade
  `--hairline`, texto `--cbrio-text3`, tooltip de vidro). Gradientes via
  `src/components/charts/ChartGradients.tsx` (`<ChartGradients colors={[...]}/>`
  como 1º filho do chart + `fill={gradFill(cor)}` nas barras/áreas; cor sólida na
  legenda). Linhas, pizza/donut e charts com gradiente próprio ficam como estão.
  ⚠️ Toda cor passada a `gradFill()` PRECISA estar no array `colors` do mesmo
  chart, senão a barra renderiza vazia (build não pega — validar no preview).
- **Dashboard Semanal · resumo (regra de negócio):** card **Presenças** = templo
  + kids (`vw_dashboard_semanal.total_presencial`); **Decisões** = presenciais +
  online + **kids** (`aceitacoes_kids` = `cultos.decisoes_kids`); card **Kids**
  segue como recorte separado. Não reverter pra só-templo (resumo-semana/mês em
  `backend/routes/dashboardSemanal.js`).
- **⚠️ Semana: financeiro = QUARTA→TERÇA · frequência = SEG→DOM (2026-07-08):** as
  DUAS semanas divergem DE PROPÓSITO — não reunificar. O **financeiro** (contribuições
  do `DashboardFinanceiroSemanal.jsx` + views `vw_fin_semana_*` + endpoints
  `/dashboard/semana*`) usa `fn fin_semana_qua_ter` = **quarta→terça** (semana da igreja,
  como o financeiro interno concilia · revertido em `20260708160000` após a unificação
  seg-dom de `20260601130000` dar número diferente do fechamento). A **frequência dos
  cultos** (Dashboard Semanal de presença · `dashboardSemanal.js` · `isoWeekRange`) usa
  função JS PRÓPRIA **seg→dom** e NÃO chama a RPC. Mexer numa NÃO deve mexer na outra.

### Rodar local · preview no app Claude Code Desktop (2026-07-30)

Dois arquivos existem SÓ pra isso e não têm efeito em produção:

- **`.claude/launch.json`** — os 2 servidores do painel Navegador
  (Cmd+Shift+B no Mac · Ctrl+Shift+B no Windows): `front-vite` na **8080**
  (o `vite.config.ts` usa 8080, não a 3000 que o app assume) e `api-express`
  com `cwd: backend` na **3001**. Sem os dois no ar o sistema loga (Supabase é
  direto) mas toda tela que chama `/api/...` vem vazia.
  ⚠️ O front só acha a API com **`VITE_API_URL=http://localhost:3001`** no
  `.env` local — sem isso `resolveApiBaseUrl` (`src/lib/api-base.js`) cai em
  `/api` relativo, que bate no próprio Vite. O CORS já libera
  `http://localhost:8080` (`server.js`). `.env` é gitignored e pessoal, então a
  variável NÃO vive no repo.
- **`.worktreeinclude`** — o app desktop abre cada sessão numa **worktree**, que
  é checkout limpo e só traz o que está no Git; sem este arquivo a worktree
  nasce sem `.env` e o front sobe com "VITE_SUPABASE_URL: AUSENTE". Sintaxe de
  `.gitignore`; copia só o que casa E é gitignored. **Não** listar
  `node_modules` (milhares de arquivos por worktree — resolver com
  `npm install`, inclusive dentro de `backend/`).

⚠️ **`host: "::"` do `vite.config.ts` não sobe em container sem IPv6**
(`EAFNOSUPPORT`). No Mac/Windows funciona; em sessão cloud, subir com
`npx vite --host 127.0.0.1 --port 8080` em vez de mexer na config.
⚠️ Rodar local com o `.env` de produção significa **dados de produção**: editar
arquivo é seguro, clicar em botão que salva escreve na base viva.

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
- ⚠️ **Cliente Supabase (`src/supabaseClient.js`) usa `auth: { lock: noOpLock }` de
  propósito — NÃO reativar o lock padrão (Web Locks API).** O lock padrão tem timeout
  INFINITO ao adquirir; quando fica órfão (aba travada / refresh abortado / reload no
  meio de um refresh), o `getSession()` do carregamento (AuthContext) PENDURA PRA SEMPRE
  → "carregando infinito / não consigo acessar" (bug ativo supabase-js #1594/#2111 ·
  incidente 2026-06-26). O no-op desliga o Web Lock → corrige o deadlock e os warnings
  "lock ... stole it". Trade-off aceito: sem coordenação de refresh ENTRE ABAS (race raro
  e auto-recuperável, bem menos grave que travar o sistema). Cliente é único/singleton.
  Reforço: o **`AuthContext` tem timeout de 8s** no carregamento inicial (`getSession()` num
  `.finally()` + `safetyTimer`) — libera o "carregando" mesmo se algo pendurar por qualquer
  motivo. NÃO remover esse timeout. **E o `onAuthStateChange` só bloqueia a UI
  (`setLoading(true)`) no login REAL** — transição "sem sessão → com sessão" via
  `sessaoAtivaRef`, NÃO em todo evento `SIGNED_IN`. Motivo: o supabase-js re-dispara
  `SIGNED_IN` a cada FOCO de aba (Alt+Tab); bloquear nisso jogava o app no "carregando"
  (e travava) a cada Alt+Tab (incidente 2026-06-26). Não voltar a usar `_event === 'SIGNED_IN'` sozinho.
- **Tutorial/onboarding (`TutorialContext`) marca "visto" ao EXIBIR** (evento `tour:start`),
  não só no Concluir/Pular — regra "mostrou 1× não mostra mais", robusta a pular/fechar/
  clicar fora/recarregar (pedido do Marcos 2026-06-26). Persiste no backend
  (`/tutorial/complete`, service role, tabela `app_tutorial_progress`) **+ fallback
  `localStorage`** (`cbrio_tutorial_seen_<uid>`) caso o POST falhe. `completedTours` =
  união backend ∪ local. "Refazer tutorial" limpa os dois.
- **Tour `welcome` = só no PRIMEIRO ACESSO** (2026-06-30): NÃO tem `route` (não auto-dispara
  por rota — antes reaparecia no `/dashboard` a cada visita, pois a persistência podia falhar).
  É disparado UMA vez por `PrimeiroAcessoSenhaModal` logo após a troca da senha padrão
  (`aposTrocar` → `startTour('welcome')`, novo método do contexto). Como o gatilho (trocar a
  senha) só ocorre no 1º acesso, não depende da persistência pra não repetir. Quem já trocou a
  senha (logins email/senha antigos) e usuários OAuth (Google/MS, sem senha pra trocar) **não**
  veem o welcome automático — só via "Refazer tutorial" no /perfil (`restartTour`, que com
  `route` nula inicia na hora em qualquer página). Tours de MÓDULO seguem gated atrás de
  `welcome` visto (`completedTours.has('welcome')`), disparados por rota.
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
- ~~Usar `gh` CLI~~ — REVISTO 2026-06: o GitHub MCP saiu do ambiente; usar o
  `gh` CLI (autenticado) pra abrir/mergear PRs é o caminho autorizado.

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

## ⚠️ Avaliação externa de LLM (Google Stax) · regra de exportação (2026-07-13)

Kit de avaliação em `backend/scripts/_stax_export.js` + guia/rubricas em
`backend/scripts/stax-export/README.md` (piloto pedido pela gestão). Regras:

- **NUNCA subir pra ferramenta externa** (Stax ou similar): pedidos de oração,
  governança/atas de diretoria, relatos nominais de grupos, fila pastoral
  (`cui_*_fila`/convertidos), documentos do Cérebro e QUALQUER dado de Kids.
  Dado de igreja identifica convicção religiosa (categoria especial · LGPD
  art. 11); o Stax é experimental, sem DPA. Exportador pra esses fluxos não
  existe por decisão — não criar.
- Exportáveis (anonimizados · linha de texto livre com telefone/CPF/e-mail é
  DESCARTADA, não mascarada): números agregados de culto, categoria contábil de
  NF (CNPJ/fornecedor = dado PJ, mantido), extração de compras, comentários de
  NPS. CSVs `export_*.csv` são gitignored — nunca commitar dado real.
- Constatação no banco vivo (2026-07-13): filas de revisão quase sem veredito
  humano (0 coletas aplicadas/rejeitadas · 383 propostas do agente financeiro
  `pending` · 0 NF com sugestão) — datasets reais só ganham corpo com uso.
  A medição PERMANENTE de acurácia da IA deve sair de SQL interno sobre as
  filas (follow-up: aba em `/assistente-ia`); Stax é pra iterar prompt/modelo
  offline e conhecer a ferramenta (dataset demo sintético no repo).

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

10. **NUNCA criar coluna que aponta pra `mem_membros` (ou `profiles`) sem
    FOREIGN KEY.** Descoberto em 2026-07-30 investigando 58 ponteiros mortos nas
    tabelas do Next: **`merge_membros` descobre os filhos a repontar pelo
    CATÁLOGO** (`pg_constraint` · `confrelid = 'public.mem_membros'`) e faz
    **HARD delete** do membro fundido. Tabela com `membro_id uuid` *sem* FK é
    invisível pra ele — a cada fusão ela acumula ponteiro pra cadastro que não
    existe mais, silenciosamente (`next_inscricoes`/`next_matriculas` ficaram 2
    meses assim). Padrão: `REFERENCES public.mem_membros(id) ON DELETE SET NULL`
    (as 21 FKs convertidas em 2026-05-21). Vale pra QUALQUER tabela nova com
    coluna de pessoa — a FK não é enfeite de integridade, é o que faz a fusão de
    duplicatas funcionar. ⚠️ Ao ligar FK em tabela existente, resolver os órfãos
    ANTES (a constraint não é criável com violação).
    ⚠️⚠️ **`deleted_at` NÃO isenta de FK**: a constraint valida a tabela INTEIRA,
    inclusive linha soft-deletada. Foi assim que a 1ª tentativa da
    `20260730120000` morreu com 23503 — o tratamento de conflito soft-deletava a
    linha redundante e deixava o `membro_id` apontando pro cadastro morto.
    Corolário: rotina de saneamento que "resolve" ponteiro por soft-delete não
    resolve nada pra efeito de FK — tem que repontar ou anular a coluna. E
    **sempre pôr uma rede de segurança (`UPDATE ... SET col = NULL WHERE NOT
    EXISTS`) imediatamente antes do `ADD CONSTRAINT`**: a criação da FK não pode
    depender de a lógica de repoint ter sido perfeita.
    ⚠️⚠️⚠️ **`ADD COLUMN IF NOT EXISTS ... REFERENCES` engole a FK quando a coluna
    já existe** (descoberto em 2026-07-30 · `vol_profiles.membresia_id`, a ponte
    do valor SERVIR: 123 de 307 vínculos apontavam pra cadastro inexistente). O
    `IF NOT EXISTS` pula o comando **inteiro**, `REFERENCES` incluído — a
    migration de maio "declarava" a FK, a coluna existia de abril, e o banco
    nunca a teve. **É pior que esquecer**: quem lê o repo conclui que a
    integridade está garantida. Ao acrescentar `REFERENCES` a coluna que pode
    preexistir, usar `ALTER TABLE ... ADD CONSTRAINT` em bloco próprio (guardado
    por `pg_constraint`), nunca dentro do `ADD COLUMN`. **Auditar a FK no
    catálogo, não no arquivo da migration.**

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

## Histórico das ondas de lockdown RLS (maio/2026 · concluídas)

A Auditoria de Segurança 2026-05-21 (PRs #586→#642) rodou em ondas: P0
super-admin (`app_super_admins` + `is_super_admin()`), Onda 2 RLS contextual
(Kids/LGPD, Financeiro/RH, PII de membros/decisões/batismos/cuidados), Onda 3
soft-delete + FKs CASCADE→SET NULL, e o lockdown final de 2026-05-22. Estado
final: **541 policies, 0 `USING(true)` em writes**, 10 helpers SQL, 30 tabelas
com `deleted_at`, 8 tabelas com audit log, 21 FKs convertidas. As regras e
padrões resultantes estão nas seções acima (são a lei); a narrativa completa de
cada onda (matrizes tabela a tabela, decisões de cada PR) está em
`docs/CLAUDE-LEGADO.md`.

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

### Varredura Onda 1 aplicada (2026-07-21 · auditoria de performance)

Todos os pontos mapeados pela auditoria de 08/07 que liam base inteira com
select cru foram corrigidos (números de prod do dia: 3.698 membros ativos ·
20.196 contribuições · 1.422 vínculos de grupo ativos · 1.196 check-ins de
voluntário/90d — tudo acima do cap):
- `membresia /contribuicoes/kpis`: totais do ano truncados em 1000 de 3.018 e
  `.in()` com a lista inteira de membros (3,6k UUIDs → URL estoura e falha
  SILENCIOSO · a classificação ativo/irregular/inativo saía do nada). Paginado
  + cruzamento em JS + filtro `deleted_at` que faltava nos membros.
- Séries do carrossel do `/painel`: Generosidade (dizimistas/ofertantes,
  doações R$, doadores únicos), `entradas_grupos` e devocionais →
  `fetchAllPaginado`.
- Coletores do cron (`kpiAutoCollector.js`): `cuidados.engajados_valor` (sem
  `.in()` gigante), `voluntariado.ativos_semanal/trimestral`,
  `generosidade.recorrencia`, `cuidados.devocional_membros`,
  `devocionais.familias`. Helper `fetchAll` promovido a módulo-level — TODO
  coletor novo que ler tabela grande usa ele.
- `notificacaoGenerator` membro-sem-grupo: lia só os 1000 primeiros
  `membro_ativo` (são 1.083) e o `.in()` gigante falhava silencioso — TODO
  MUNDO parecia sem grupo. Paginado + cruzamento por Set.
Já estavam corrigidos (semana de formulários 14–17/07, validado): diretório
da Membresia, `membros_count` de Grupos, snapshots Conectar do painel.
**Regra permanente:** leitura de tabela que passa (ou vai passar) de 1000
linhas usa `fetchAll`/`fetchAllPaginado`; `.in()` sempre em lotes ≤200.

### Onda 2 (2026-07-21 · migration `20260721150000` · ⚠️ aplicar antes do merge)

Matcher + NSM (idempotente · backwards-compatible · mesmos resultados, só
mais barato): (1) `fn_link_or_create_membro` filtrava CPF/telefone com
`coalesce(coluna,'')` — expressão ≠ da do índice único de CPF (20260715120000)
→ planner ignorava o índice e fazia seq scan a cada decisão/cadastro; os
predicados agora usam a coluna crua + `IS NOT NULL` explícito (casa o índice
parcial). ⚠️ Lição permanente: **índice funcional só funciona se a query usar
a expressão IDÊNTICA**. (2) Índices novos: telefone digits + e-mail
lower(trim) em `mem_membros` (ramos 2 e 3 do matcher varriam a tabela) +
`batismo_inscricoes(membro_id)` (EXISTS da NSM). (3) Guarda
`pg_trigger_depth() > 1` nas funções de recálculo da NSM disparadas por
`nsm_eventos` e `cui_convertidos` — a cascata de cada decisão recalculava a
NSM 2x+ na rajada de domingo; escrita em cascata agora conta com o trigger de
`cultos` (depth 0), o cron horário e o recálculo manual; escrita direta
(serviço/backfill) segue recalculando na hora.

## Jornada NSM · engajamento de verdade (2026-06-10)

Contexto: Marcos vai liberar os módulos ministeriais dos 4 primeiros valores
(hoje só Integração usa de verdade) e pediu números honestos ("precisa ser 0
mesmo, até que o convertido entre em outro valor"). Auditoria completa em
2026-06-10 achou os fios soltos; esta leva liga os de código:

- **Numerador do card NSM = engajamento REAL** (migration `20260610160000`):
  `recalcular_nsm()` v3 conta engajado = sinal real em ≥1 valor em
  [decisão, decisão+60d] via `fn_nsm_valores_engajados(membro, decisão, dias)`
  (helper SQL · critério ÚNICO, espelha a tela /painel/nsm/pessoas: trilha
  1º contato/batismo · batismo realizado · Next check-in · grupo · devocional ·
  jornada180 · aconselhamento · voluntário · dízimo/oferta). `por_valor` do
  nsm_estado agora tem chaves = 5 valores (antes eram etapas da trilha · nada
  no front consumia). Antes o numerador aceitava QUALQUER etapa da trilha — e
  a etapa 'conversao' nasce concluída no ato → media "% com cadastro" (21/240
  falsos). Efeito: card foi a 0% até a esteira rodar — decisão do Marcos.
  ⚠️ Sinais novos (entrar em grupo etc.) só refletem no card no cron horário
  da NSM ou recálculo manual (os triggers do recalc são em cultos/cdp).
- **"Engajou" fecha o loop** (`encaminhamentos.js` + `EncaminhamentosInbox.tsx`):
  devolutiva 'engajou' materializa o vínculo REAL — grupos→`mem_grupo_membros`
  (UI exige escolher o grupo · `GET /encaminhamentos/aux/grupos`),
  voluntarios→`mem_voluntarios` (ministério "Voluntariado (geral)"),
  jornada180→`cui_jornada180` (1º encontro na data do contato). Idempotente
  (vínculo ativo existente não duplica). Encaminhamento sem membro → registra
  devolutiva + aviso (não conta na NSM até vincular).
- **Ponte Servir** (migration `20260610150000`): trigger sync
  `vol_profiles.membresia_id` → `mem_voluntarios` (ministério guarda-chuva
  "Voluntariado (geral)" · desde = criação do perfil) + backfills: vincula
  `vol_profiles`/`vol_inscricoes` órfãos a membros EXISTENTES por CPF/e-mail
  (nunca cria membro) e materializa `mem_voluntarios` dos perfis vinculados.
  O voluntariado real vive em vol_* — sem a ponte, Servir nunca etiquetava.
- **`findMembroByCpf` consertado** (`cuidados.js`): buscava o CPF no campo
  TELEFONE (mem_membros TEM coluna cpf) → jornada180/aconselhamento nasciam
  sem membro_id. Agora `.eq('cpf', clean)` + `deleted_at IS NULL`.
- **Generosidade**: fica pra unificação futura com o sistema financeiro
  externo (decisão do Marcos · base com entradas/saídas/transações será
  unificada depois). O critério da NSM já lê mem_contribuicoes quando vier.
- **KPIs nativos dos 4 valores (leva aprovada · migration `20260610180000`)**:
  "usar o módulo preenche o KPI". 3 pernas:
  (1) **10 ramos nativos novos** no `_kpi_agregar_dado`: lideres_treinados
  (`mem_grupo_membros.funcao='lider_treinamento'` · snapshot fim do período),
  lideres_acompanhados (`grupo_supervisao_visitas`×`mem_grupos.lider_id`),
  voluntarios_checkin (% `vol_schedules` com `vol_check_ins` · igreja toda),
  solicitacoes_servir_recebidas/alocadas (`vol_inscricoes` · funil por área
  própria · alocada = enviado_ministerio/integrado/kids),
  solicitacoes_capelania*/aconselh* (`cui_acompanhamentos` · capelania = motivo
  ILIKE '%capelania%' · atendida = responsavel_id preenchido · ⚠️ sem fila
  própria o % tende a 100 — ganha sentido com canal de solicitação futuro),
  frequencia_next (`next_inscricoes` com check-in · igreja toda · sem área);
  o ramo `batismos` passou a respeitar `area_kpi`.
  (2) **Área do batismo herdada da conversão**: trigger
  `fn_batismo_area_da_conversao` (BEFORE INSERT/UPDATE de batismo_inscricoes ·
  area_kpi 'sede' default vira a área de `cui_convertidos` quando
  ami/bridge/online) + backfill → liga os coletores `batismos.{ami,bridge,online}`.
  (3) **Gatilhos de recálculo**: trigger genérico `tg_kpi_recalc_nativo`
  (statement-level · TG_ARGV = CSV de dado_tipos · pula depth>1) em 12 tabelas
  nativas (mem_grupos, mem_grupo_membros, mem_voluntarios, mem_devocionais,
  cui_jornada180, cui_acompanhamentos, cui_convertidos, next_inscricoes,
  vol_check_ins, vol_inscricoes, grupo_supervisao_visitas, batismo_inscricoes)
  + `kpi_recalcular_todos()` como rede de segurança no cron diário
  `/api/kpis/v2/cron/coletar` (que TAMBÉM não estava agendado — agora está no
  vercel.json `0 7 * * *` · coleta fonte_auto + recalcula tudo).
  **Fora da leva (por design/decisão)**: 19 KPIs de NPS aguardam o módulo NPS;
  voluntarios_treinamento (5) sem fonte no vol_*; AMI-06/SED-15 manuais a
  redefinir; limitação documentada: frequencia_next/voluntarios_checkin e os
  ramos antigos de grupos/devocionais/jornada são da igreja toda (KPIs por
  área repetem o valor global).
- **Mandalas · Servir e Generosidade cascateiam por área (2026-06-10 ·
  migration `20260610220000`)**: `mem_voluntarios.area` +
  `mem_contribuicoes.area` (kids/sede/ami/bridge/online · nullable). Backfill
  de voluntários em 2 passes: área da `vol_inscricoes` da pessoa → senão a
  área onde MAIS SERVE nas escalas (vol_schedules×vol_services · team "kid"→
  kids · AMI/Bridge/Domingo/Quarta). Sync vol_profiles e o "Engajou"
  (encaminhamentos) preenchem a área daqui pra frente (engajou usa a área da
  conversão). Mandala: pétalas de Servir = voluntários por área · Generosidade
  = dizimistas por área · **sem área conta no CENTRO mas não nas pétalas**
  (não chutamos área · soma das pétalas pode ser < centro). Ramos de
  voluntários/doações no `_kpi_agregar_dado` respeitam a área do registro →
  KPIs por área param de repetir o global. `mem_contribuicoes.area` é
  estrutura pronta pra unificação financeira. Conectar/Investir seguem "—"
  nas pétalas (grupos/devocionais não têm dimensão de área de culto).

## ⚠️ LEI · guarda de idempotência tem que ser na MESMA chave do índice único (2026-08-04)

Incidente: o Marcelo cadastrava os dados de um convertido na aba Decisões da
Integração, apertava **Registrar** e recebia erro do servidor
(`POST /api/kpis/cultos/:id/decisoes-pessoas 500` · 3 tentativas seguidas às
17:54/17:55/17:56 no culto de 02/08). Nos logs:
`duplicate key value violates unique constraint "nsm_eventos_pessoa_valor_uq"`.

`tg_cultos_dec_pessoas_jornada` (AFTER INSERT ROW em
`cultos_decisoes_pessoas`) guardava o insert com
`NOT EXISTS (origem='culto_decisao' AND origem_id = NEW.id)` — idempotência por
**DECISÃO**. Mas o índice é por **PESSOA**:
`nsm_eventos_pessoa_valor_uq ON (COALESCE(membro_id::text, visitante_id::text, cpf), valor_engajado)`.
Quem já tinha evento `'seguir'` (decidiu num culto anterior) passava pela guarda
— `NEW.id` é outro —, o INSERT violava o índice, e **exceção em trigger AFTER
aborta o statement inteiro**: a decisão não era gravada e a pessoa ficava fora
do sistema. Raio: **386 pessoas** já têm evento `'seguir'`, então toda
re-decisão de qualquer uma delas era um 500 sem saída pela tela.

Migration `20260804180000`: `ON CONFLICT ... DO NOTHING` com o **mesmo alvo** que
`nsm_inserir_evento` (o outro escritor da tabela) já usava — a semântica do
índice é "primeiro engajamento por valor conta". Validado em produção com
INSERT real dentro de transação revertida: decisão gravada, evento `'seguir'`
segue **1**, zero resíduo.

- ⚠️ **NÃO afrouxar o índice**: é ele que faz a NSM contar PESSOAS engajadas, e
  não eventos. Removê-lo duplicaria gente no numerador.
- ⚠️ **A expressão do `ON CONFLICT` tem que ser IDÊNTICA à do índice** (mesma
  lição do índice funcional da Onda 2), senão o Postgres recusa a inferência.
- ⚠️ A migration foi escrita sobre a definição **VIVA** do banco, não sobre o
  arquivo `20260518150000`: prod tinha um `SET search_path` que o arquivo não
  tem, e replicar do arquivo teria apagado essa proteção em silêncio.
- **Nenhum número mudou**: a linha duplicada que agora é ignorada nunca chegou a
  existir (o INSERT falhava). Resíduo consciente: re-decisão não atualiza
  `data_decisao` do evento já existente.
- Régua que fica: **guarda `NOT EXISTS` só protege se checar a mesma chave que o
  índice**. Guarda numa chave e UNIQUE em outra = 500 que ninguém entende, e no
  fluxo de pessoa isso significa cadastro perdido.

## Planejamento Estratégico × Gestão Anual · virada conceitual (2026-06-10)

Reorganização por **horizonte de tempo** (Marcos). Dois módulos distintos — não
confundir, não misturar estratégico com rotina:

- **`expansao` (rota `/expansao`) = "Planejamento Estratégico"** (era "Expansão"). É o
  **plurianual / macro‑eixo**. "Expansão" virou só o nome do **plano vigente** (Quadriênio
  2026–2029 · Pr. Pedrão), não do módulo. Marcos/tarefas/Gantt/Timeline seguem iguais. Ganhou
  a aba **Acompanhamento** (tabela `pe_planos` · migration `20260609130000`): planos **em
  execução** (progresso agregado dos marcos do período) e **já executados** (com **parecer
  documental** + avaliação · snapshot congelado no encerramento). Encerrar/Reabrir/Novo plano.
- **`planejamento` (rota `/planejamento`) = "Gestão Anual"** (era o painel PMO consolidado).
  Página `src/pages/GestaoAnual.jsx`. Hub do que está **fora do ano corrente**: aba **Próximo
  ano** (rascunhar projetos/eventos do ano seguinte · criação **direta, sem aprovação** · botão
  "Gerar litúrgicos" via `event_liturgia_templates`) + **Resultados** (anos fechados ·
  planejado×realizado, read‑only). **Fonte única, duas lentes:** grava nos próprios
  `projects`/`events` por `year`/`date` — sem tabela paralela, sem "aprovar e copiar".
- **Projetos / Eventos = só o ANO CORRENTE.** O seletor de ano saiu dos dois (virou chip "ano
  corrente"); planejar/revisar outros anos é na Gestão Anual. `projects.year` / `events.date`→ano
  continuam; o filtro fica travado no ano atual.

⚠️ **Slugs e rotas NÃO mudaram** (`expansao`/`planejamento`) — só o `modulos.nome` de exibição
(migrations `20260609120000` e `20260610120000`). Nunca renomear slug/rota (quebra
ROUTE_MODULE_MAP, matriz de permissões e bookmarks).

### Legado REMOVIDO (não funciona mais assim · não tratar como ativo)
O antigo **"Planejamento Anual"** (propostas → aprovação diretor→diretoria → materializa em
event/project) foi **aposentado** — nunca foi usado (0 propostas). Removidos: telas
`/planejamento/anual` (`AnualCiclos.jsx` + `AnualCicloDetalhe.jsx`) e `Planejamento.jsx` (PMO);
tabelas `planejamento_propostas`/`_audit`/`_setores`/`_areas_setor` **dropadas** (migration
`20260610130000`). **Mantidos:** `event_liturgia_templates` (o hub usa) e `planejamento_ciclos`
(dormente · pode virar portão "ano aberto/fechado"). As colunas `events.proposta_id`/
`projects.proposta_id` ficaram (só a FK saiu · inócuas).

### Dívida técnica (código morto · sem chamador · NÃO é referência viva)
Para não arriscar a liturgia (arquivo de 760 linhas), ficaram intactos mas **órfãos**: o
namespace `planejamento` em `api.js` (exceto `gerarLiturgia`, que o hub usa) e os endpoints de
propostas/setores/ciclos em `backend/routes/planejamento.js`. Só `/planejamento/liturgia/*` é
vivo. Aparar quando der.

PRs: #938 (rename PE), #944 (Acompanhamento), #948 (rename Gestão Anual), #951 (hub), #952
(recorte de ano), #954 (limpeza · DROP). Migrations aplicadas em prod por Marcos.

## Grupos · Log de alterações (2026-07-20)

Pedido do Marcos (com a Naná saneando a listagem de grupos): rastrear **o que
mudou e quando** em `mem_grupos`/`mem_grupo_membros` — `created_at` só data o
INSERT, `updated_at` é sobrescrito em massa e edição/remoção não deixava rastro.
Migration `20260720230000_grupos_audit_log.sql` (idempotente ·
backwards-compatible) liga o `audit_log_changes()` genérico (app_audit_log ·
20260521230000) nas 2 tabelas, todas as colunas. Leitura:
`GET /grupos/:id/historico-alteracoes` (guard grupos>=3 · service role lê o
app_audit_log e resolve o nome do participante) + card **"Log de alterações"**
na ficha do grupo em `Grupos.jsx` (`LogAlteracoesCard` · carrega sob demanda).
Limitação conhecida: escrita via backend (service role) fica **sem autor**
(`auth.uid()` nulo → exibe "sistema") — autoria por request é evolução futura.
O log só grava a partir da aplicação da migration (nada retroativo).

## Grupos · Renovação de temporada pelo líder (2026-07-21)

Pedido do Marcos: 1×/semestre, com a temporada fechada (antes de abrir as
inscrições da próxima), TODOS os líderes recebem WhatsApp perguntando se
continuam com o grupo. **Disparo SEMPRE manual** da coordenação (lei de 20/07 —
nada automático pro líder), no card "Renovação de temporada" em Config >
Temporadas (`TemporadasGrupos.jsx` · nível 5 · re-executar reenvia SÓ aos
sem-resposta). Fluxo do líder no link público `/g/r/<token>`
(`GrupoRenovacao.jsx` · token `renov` 30d · molde da frequência):
- **SIM** → checklist do roster DESMARCADO ("quem provavelmente continua" ·
  estimativa explícita) + selecionar todos + modal de confirmação **com os
  NOMES** de quem sai. Não-marcado → `saiu_em` + `renovacao_id` (coluna FK
  dedicada em `mem_grupo_membros` — NUNCA tag em texto) + motivo humano.
  Pessoa segue no sistema e pode se reinscrever na abertura. **Reedição
  permitida** (última vence): re-marcar reativa SÓ vínculos com
  `renovacao_id` da própria renovação e sem outro vínculo ativo.
- **NÃO** → motivo obrigatório → o grupo NÃO fecha: vira 4ª origem na Caixa
  de entrada (`ren_nao_continua`) pra triagem da Naná (`PainelRenovacao`:
  fechar grupo / buscar líder / manter · nota obrigatória) + `notificar()`.
- **Sem resposta → roster INTOCADO** (lei: nunca remover por omissão).

Segurança do submit (conselho 21/07): o POST carrega a lista **exibida** — o
servidor só age sobre `exibidos ∩ roster ativo atual` (quem entrou depois da
tela aberta nunca é removido por submit atrasado); token morre com: geração
antiga (`token_geracao` na linha · reenvio incrementa), liderança trocada,
linha triada ou **inscrições da temporada abertas**. Schema:
`mem_grupo_renovacoes` (UNIQUE grupo+temporada · snapshot do líder ·
contadores/ids jsonb como cache de exibição · triagem_*) + RLS molde
mem_lider_inscricoes + audit trigger + whitelist (migration `20260721170000`,
que também DROPa `uniq_mem_grupo_membros_ativo` — formaliza o multi-grupo que
já valia em prod). Template Meta `grupos_renovacao_temporada` (UTILITY · {{1}}
nome {{2}} temporada {{3}} grupo {{4}} link como variável de body · env
override `WHATSAPP_TEMPLATE_GRUPOS_RENOVACAO`) via fila `whatsapp_envios`.
A pessoa removida NÃO é notificada (decisão pastoral) — o caminho de volta é o
broadcast de abertura das inscrições.

## Grupos · "Confira a lista do seu grupo" (2026-07-31 · migration `20260731120000`)

**3º fluxo do líder**, irmão da renovação mas SEM a pergunta "vai continuar?" e
SEM a trava de temporada aberta. Problema real: o roster está poluído (gente que
saiu, cadastros de teste da varredura de julho, importados de 10/07 que talvez
nunca tenham frequentado) e a coordenação (Naná/Pr. Nélio) não tem como saber —
**o líder é a única fonte confiável**. Os 2 links que existiam não resolvem: a
**frequência** (`/g/f/`) só MARCA PRESENÇA (não remove ninguém) e a **renovação**
(`/g/r/`) é BLOQUEADA com as inscrições da temporada abertas e fala de "preparar
a próxima temporada" (confuso no meio da T2).

O líder abre `/g/c/<token>` (`GrupoConfiraLista.jsx`), vê a lista atual **toda
marcada** e **DESMARCA quem não faz mais parte**.

**Decisões de produto (fechadas · não reabrir):**
- **Marca quem SAI** — o OPOSTO da renovação (que vem desmarcada). Aqui o padrão
  esperado é "a lista está certa" e o atrito fica só em quem sai.
- **Confirmação com os NOMES** de quem vai sair antes de aplicar (o líder tem
  que ver quem está removendo).
- **Motivo NÃO é obrigatório por pessoa** (atrito demais): é UM só, do lote, e
  OPCIONAL (`mem_grupo_conferencias.observacao` · vai também pro `motivo_saida`).
- **Remoção soft e rastreável**: `mem_grupo_membros.saiu_em` +
  **`conferencia_id`** (coluna dedicada espelhando o `renovacao_id` — NUNCA tag
  em texto). Reedição permitida (última vence), reativando SÓ o que ESTA
  conferência removeu.
- **NUNCA remover por omissão** (líder que não responde = roster intocado) e a
  **pessoa removida NÃO é notificada** (decisão pastoral vigente na renovação) —
  quem é notificada é a COORDENAÇÃO, quando houve remoção.
- **Repetível na temporada** (diferente da renovação, 1×/semestre): 1 linha por
  **(grupo, rodada)**. `temporada_id` é só SNAPSHOT informativo — de propósito
  não trava nada.
- ⚠️ **LIDERANÇA (`funcao IN ('lider','co_lider')`) NÃO É REMOVÍVEL por aqui.**
  Cenário real: co-líder Ana no roster; o líder desmarca achando que é
  participante → `saiu_em` gravado → o `GET /public/grupos/buscar` (que monta
  `lideres_busca`/`lideres_exibicao` com `funcao IN ('lider','co_lider')` +
  `saiu_em IS NULL`) para de devolver a Ana e **o grupo deixa de ser encontrável
  pelo nome dela** na página pública e no mapa, sem ninguém ser avisado. O roster
  devolve `funcao`/`papel`/`protegido` (papel de MAIOR nível entre os vínculos —
  multi-vínculo é real), a tela mostra badge de papel + cadeado e o **SERVIDOR
  força liderança exibida como mantida** (payload é do cliente; a decisão é
  nossa). Trocar liderança é ato de gestão (aba Pessoas do /grupos ·
  `PUT /membros/:id/funcao`), nunca efeito colateral de conferir lista.
- ⚠️ **Contagem é de PESSOAS, não de vínculos** (régua de 23/07): o `{{3}}` do
  template e o `membros_ativos` do painel contam `Set` de `membro_id`
  (`comRoster` = Map de Set · `membrosPorGrupo` idem). A UNIQUE de vínculo ativo
  foi dropada (multi-grupo real), então contar LINHAS diria "são 12 pessoas" no
  WhatsApp e mostraria 10 na tela.

**Segurança do submit** (lição registrada da renovação): o servidor só age sobre
`exibidos ∩ roster ativo atual` — quem entrou depois da tela aberta nunca é
removido por submit atrasado. O UPDATE de remoção leva **`.is('saiu_em', null)`**:
fechamento concorrente da coordenação não é sobrescrito (senão a saída MANUAL
dela passaria a apontar pra esta conferência e viraria reversível pela reedição
do líder). Token `conf` = `{ p: grupoId, c: conferenciaId, g: geração,
l: liderId }` (30d), mas a validade REAL é decidida a cada uso: geração × linha,
liderança atual e linha não triada.

⚠️ **RODADA NOVA MATA O LINK DA ANTERIOR em 2 camadas.** `nova_rodada` faz INSERT
de linha nova, então (1) o disparo **incrementa o `token_geracao` da linha
antiga** (o mecanismo de revogação que já existe · feito ANTES do insert — se
falhar, não abrimos rodada nova com dois links vivos) e (2) `contextoConferencia`
recusa 403 quando existe linha viva do mesmo grupo com `rodada` maior. Sem isso o
líder podia clicar na mensagem VELHA e remover gente gravando o `conferencia_id`
da rodada 1 — o painel (que lê só a última rodada) não contaria essas saídas e
mostraria a rodada 2 como "não respondeu": a coordenação decidiria sobre um
painel que subestima o que aconteceu.
⚠️ `ultimasConferencias` é **paginado com `.range()`** (não `.limit(1000)`): o
`order('rodada')` é CROSS-GROUP e num truncamento quem cai fora é justamente o
grupo que só tem rodada 1 → seria classificado como 'nova' → INSERT com rodada 1
bate 23505 contra o UNIQUE parcial → erro engolido em `erros.linha` e **o líder
nunca recebe**. Por isso o toast do disparo soma `erros.linha + erros.montar` e
avisa em âmbar quando > 0 — falha silenciosa aqui é líder sem mensagem.

**Disparo SEMPRE manual** (lei de 20/07 · **sem cron**), no card "Confira a lista
do grupo" da aba **Envios** (`GruposEnvios.jsx`), no padrão dos outros disparos:
audiência líder/bairro/rede/todos → prévia (contagem + exemplo + quem NÃO recebe
+ quem é pulado) → **confirmação DIGITANDO o número** (freio mais forte que os
outros cards: é o único disparo que muda o roster). Reenvio manda só pra quem
**não respondeu**; grupo que já respondeu só volta com `nova_rodada=true`.
Respeita bloqueio geral, `whatsapp_lideres.recebe_lembretes` (opt-out) e exige
roster (grupo vazio não tem lista pra conferir). **Painel de triagem no mesmo
card** (não criei tela nova): quem respondeu, quantos saíram, quem não respondeu,
+ "Marcar tratada" (nota curta obrigatória → status `triada`, que mata o link).

Template Meta **`grupos_confira_lista`** (UTILITY pt_BR · 4 variáveis · {{1}} 1º
nome do líder · {{2}} grupo · {{3}} quantidade de pessoas na lista · {{4}} o link
como **variável de body**, não botão — é o que mantém a categoria UTILITY). Env
de override `WHATSAPP_TEMPLATE_GRUPOS_CONFIRA` (default `grupos_confira_lista`).
Sai pela fila `whatsapp_envios` (retry/backoff), como todos os outros.

**Arquivos:** migration `20260731120000_grupos_confira_lista.sql` ·
`services/gruposWhatsapp.js` (`montarEnvioConfira`) · `services/gruposEnvios.js`
(`previewConfira`/`dispararConfira`/`ultimasConferencias`) · `routes/grupos.js`
(`/confira/painel`, `/confira/preview`, `/confira/disparar`, `/confira/:id/triar`)
· `routes/publicGrupos.js` (GET/POST `/grupo/confira`) ·
`pages/public/GrupoConfiraLista.jsx` + rota `/g/c/:token` · `api.js`
(`grupos.confira.*` + `gruposPublic.confiraPorToken/responderConfira`).

### Confira v2 · 4 categorias + pedidos pendentes (2026-08-04 · SEM migration)

Decisão do Marcos (a Naná preferiu o link WhatsApp ao app): a tela `/g/c/`
passou a separar o roster em **4 situações** — **Liderança** 🔒 · **Inscritos
nesta temporada** 🔒 (vínculo `created_at >= data_inicio` da temporada com
`inscricoes_abertas`) · **Renovações confirmadas** 🔒 (vínculo com linha em
`inscricao_consentimentos` porta `grupos` e `ref_id` = id do VÍNCULO — só a
renovação grava assim; é a derivação-remendo do handoff, o campo "confirmado
pra temporada X" segue pendência estrutural) · **Sem confirmação** (o ÚNICO
removível pela tela). Travar inscrito/renovado protege a evidência de quem
acabou de entrar/renovar — **o POST re-deriva as categorias e blinda no
SERVIDOR** (payload é do cliente), então bundle antigo aberto não fura.

- **+ Aguardando aprovação**: os `mem_grupo_pedidos` pendentes do grupo entram
  na tela; desmarcar = **DEVOLVE pra triagem** (`status='devolvido'` · lei de
  14/07 · motivo fixo · `decidido_por_nome = "<líder> (confira a lista)"` ·
  `registrarEventoPedido('recusado_lider', {origem:'confira_lista',
  conferencia_id})` awaited). O ✓ NÃO aprova (aprovação segue no link
  individual /g/a/ — evita aprovação em massa acidental + gasto de tier).
  Devolução é **one-way** pela tela (reedição não re-pendentifica — a triagem
  pode já ter realocado; o GET lista os já-devolvidos read-only via evento
  `detalhe->>conferencia_id`). Guardas no UPDATE: `.eq(grupo_id)` +
  `.eq(status,'pendente')` (ids alheios no payload não fazem nada).
- Notificação à coordenação ganhou a contagem de devolvidos e aponta
  `?tab=entrada` quando houve devolução. Resposta do POST +=
  `pedidos_devolvidos`. GET += `temporada` (label), `pedidos_pendentes`,
  `pedidos_devolvidos`.
- ⚠️ Sem temporada aberta a categoria 'inscrito' não existe e o fluxo segue
  funcionando (desenho original). Template Meta continua o MESMO
  (`grupos_confira_lista` aprovado 03/08 — 1 template pras 2 ocasiões, o
  contexto vive na tela; o {{3}} segue contando pessoas do roster).
- **'Inscrito' inclui o PILOTO pré-abertura (Marcos · 05/08 · SEM migration):**
  vínculo criado até **30 dias ANTES** da `data_inicio` conta como 'inscrito'
  **se e só se** existe `mem_grupo_pedidos` **aprovado** do mesmo membro no
  mesmo grupo (`membrosInscritosPreAbertura` em publicGrupos.js · aplicada no
  GET **e** na re-derivação do POST). Caso real: Nathália Pigatti, pedido
  aprovado 28/07 no piloto de 26-28/07 com a T2 abrindo 01/08 — caía em "Sem
  confirmação" removível. Exigir o pedido aprovado é o que separa confirmação
  real do import de 10/07: medido em 05/08, **8 pessoas em 4 grupos** flipam
  pra 'inscrito'; os ~380 vínculos restantes da janela (import, sem pedido)
  seguem removíveis. O `aprovarPedidoCore` sempre grava `membro_id` no claim —
  é isso que torna a chave (grupo, membro, aprovado) confiável.
- ⚠️ **Renovação × Confira vão virar UM fluxo** (decisão do Marcos · 05/08):
  a ideia é um pedido só — "deseja continuar o grupo?" e em seguida "escreva
  quem fica". **Por enquanto NADA foi disparado nem alterado nos 2 fluxos**
  ("por enquanto deixa assim, nao dispara nada") — a renovação (`/g/r/`) segue
  nunca disparada nesta temporada (0 linhas em `mem_grupo_renovacoes`) e o
  template `grupos_renovacao_temporada` segue aprovado e ocioso.

**Feedback Naná/Nélio (04/08 · teste real — os 2 responderam em minutos):**
(1) intro da tela virou 2 parágrafos curtos, SEM a explicação "quem sair
continua cadastrado…" no topo (as instruções curtas vivem no título de cada
seção; o modal de confirmação mantém a explicação completa). (2) A caixa de
entrada (`GruposEntrada.jsx`) ganhou o bloco recolhível **"Líderes · quem
falta responder"**: conferência da lista (responderam × receberam-e-não ×
nunca receberam · reusa `GET /grupos/confira/painel`, o MESMO endpoint do
card da aba Envios — lazy ao abrir) + **"Aprovações paradas"** (pedidos
`pendente` agrupados por grupo/líder com idade do mais antigo, client-side
sobre as linhas já carregadas — o nome do líder vem no próprio pedido via
`mem_grupos → mem_membros!lider_id`; segue os filtros da tela). ⚠️
`aprovacoesParadas` é useMemo declarado DEPOIS de `rowsBase` (lição TDZ).

⚠️ **Aplicar a migration antes do merge.** O fluxo NOVO tolera a ausência dela
(`schemaAusente()` → **503 com aviso claro** no público, `{disponivel:false, aviso}`
no painel), e **nenhum fluxo existente lê a tabela/coluna nova** — frequência e
renovação não piscam sem a migration (lição `parcelas_max`).
⚠️ `montarDestinatariosFrequencia` passou a devolver `roster_count` por grupo
(`comRoster` virou Map pra alimentar o {{3}} do template) — `.has()` segue
idêntico pros chamadores antigos.

## Grupos · triagem aprova POR CIMA da recusa + troca o grupo ali (2026-08-05 · SEM migration)

Caso real: **4 mulheres do ONLINE - MULHER ÚNICA devolvidas por engano** pela
líder na "Confira a lista" de 04/08 — e a Caixa de entrada só oferecia «Sugerir
outro grupo» (depende de a pessoa aceitar pelo WhatsApp) ou «Rejeitar de vez»:
o botão Aprovar só existia pra `status='pendente'`. Decisão do Marcos: recusa
por engano é frequente; a triagem (Naná) decide por cima, inclusive movendo a
pessoa de grupo, **sem autorização do líder**.

- **`POST /grupos/pedidos/:pedidoId/aprovar-direto`** (nível 3 · body
  `{ grupo_id? }`): aceita pendente/devolvido/rejeitado/encaminhado (aprovado é
  409). Reabre pra `pendente` + realoca o `grupo_id` (validado contra grupo
  vivo/ativo) **num UPDATE só com guarda de corrida** no status atual, registra
  o evento `aprovado_triagem` ({status_anterior, realocado_para} · **awaited**,
  serverless descarta trabalho pós-res.json) e delega ao **`aprovarPedidoCore`
  canônico** — vínculo, WhatsApp ao líder e à pessoa (gate de opt-in), evento
  'aprovado', tudo pelo caminho único. NÃO é um 2º fluxo de aprovação.
- **UI (`GruposEntrada.jsx` · PainelPedido)**: botão primário **«Aprovar mesmo
  assim»** em devolvido/rejeitado/encaminhado + ghost **«Aprovar em outro
  grupo»** no pendente — os dois abrem o mesmo painel inline com select de
  grupo (default «Manter: <grupo do pedido>»). Hints de devolvido/rejeitado
  citam o caminho novo; `EVENTO_META.aprovado_triagem` na timeline.
- ⚠️ A realocação NÃO passa pela sugestão (`sugerido_grupo_id` fica intocado;
  link /g/s/ vivo de um encaminhado morre sozinho porque o pedido vira
  aprovado). `api.aprovarPedidoDireto(id, grupoId)`.
- Os 6 casos de 05/08 (4 do MULHER ÚNICA + Eliane Rangel Fonseca + Bruno de
  Mendonca Paiva) foram aprovados por script ANTES desta feature (reabertura +
  `aprovarPedidoCore` · backup em `scratchpad/backup_pedidos_aprovacao_20260805.json`;
  confirmação de aprovado enfileirada na `whatsapp_envios` pra quem tem opt-in —
  Rafaela ficou de fora por `whatsapp_optin=false`).

## ⚠️ Grupos · membro existente ganha o que digitou no formulário (2026-08-06 · SEM migration)

Pedido do Marcos, depois da auditoria da temporada: *"recupere esses que já
foram e garanta que os próximos quando preencherem, já vir corretamente os
dados para os campos"*. O achado: quando o matcher liga a inscrição num
cadastro JÁ EXISTENTE (import antigo), o enriquecimento só-onde-vazio cobria
foto/sexo/nascimento — **CPF e e-mail digitados não chegavam ao cadastro**.
Medido em 06/08: 20 pessoas (aprovadas 26/07+ e pendentes) com cadastro de
import (13/05–23/06) sem CPF, e **os 20 CPFs digitados guardados em
`mem_identidade_observacoes`** — coletados e nunca aplicados. Mesma classe do
bug do CPF do censo (04/08), versão branda (evidência preservada).

- **`processarPessoaPedido` (publicGrupos.js)**, no ramo de membro existente:
  (1) o só-onde-vazio ganhou **e-mail e telefone** (política do censo: vazio
  preenche; divergente NUNCA sobrescreve — acumula em `mem_contatos` via
  `registrarContatoDaPorta`, a MESMA função do matcher); (2) depois do
  enriquecimento roda **`reconciliarCpfTardio`** com a confiança canônica do
  `_consolidarCpfNoMatch` ('forte' só em nome+nascimento; e-mail/telefone+nome
  = 'fraca'). Nascimento divergente ou CPF de outra pessoa segue virando
  `identidade_pendencias` — fila humana, nunca fusão. Best-effort: falha não
  derruba a porta.
- ⚠️ **A ordem (enriquecer ANTES de consolidar) é decisão, não descuido**: o
  formulário exige nascimento, o cadastro de import geralmente não tem — o
  gate 'fraca' do reconciliar exige nascimento dos 2 lados, e sem o
  preenchimento prévio quase nenhum CPF consolidaria (o pedido do Marcos é que
  os dados CHEGUEM). O caso perigoso (cadastro com nascimento DIFERENTE do
  digitado) continua barrado: só-onde-vazio não sobrescreve, e o reconciliar
  detecta a divergência e abre pendência.
- ⚠️ **`aprovarPedidoCore` NÃO enriquece pedido com `membro_id`** (só o ramo de
  cadastro pendente/promoção) — quem completa o cadastro agora é a INSCRIÇÃO.
  Registrado porque uma resposta anterior minha afirmou o contrário.
- **Reparo dos que já passaram** (script com dry-run + backup em
  `scratchpad/backup_reparo_cpf_email_grupos_20260806.json`): CPFs das
  observações consolidados via `reconciliarCpfTardio` + e-mails/telefones dos
  pedidos aplicados só-onde-vazio nos membros de pedidos aprovados (26/07+) e
  pendentes. Conflito de CPF virou pendência em Entradas, como manda o contrato.

## Grupos · Caixa de entrada ganhou o "Retrato do período" + contato impossível (2026-08-03 · SEM migration)

Depois da varredura do lançamento (domingo 02/08), o Marcos pediu: *"eu gostaria
de ter essa visualização dentro do sistema ali na aba de caixa de entrada"*. A
análise que eu fazia por script agora vive no módulo.

### ⚠️ O rótulo do período É parte do número (correção de 03/08 · mesmo dia)

O Marcos abriu o painel e perguntou: *"você me disse que tinham 176 pessoas
inscritas, mas agora diz 301 pedidos e 193 pessoas distintas, que números são
esses?"* **Nenhum estava errado** — o filtro padrão da aba é **180 dias** e somava
os **120 pedidos de julho** (demo, varredura da Nana, piloto de 26-28/07):
301 = 120 (julho) + 181 (agosto). O defeito era o título genérico "Retrato do
período", que não dizia QUAL período.

- O título passou a **nomear a janela**: "Retrato · temporada T2-2026 (01/08 a
  hoje)". Rótulo de agregado sem a janela ao lado é convite a ler o número errado.
- Opção **"Temporada atual"** (1ª do filtro): *"como foi a abertura?"* é a
  pergunta real e **nenhuma janela em DIAS a responde de forma estável** — hoje
  "7 dias" pega a abertura, em duas semanas não pega mais.
- Aviso âmbar quando a janela pega pedido de ANTES da temporada, com atalho pra
  trocar. É o caso que gerou a dúvida.
- **`src/lib/janelaPeriodo.js`** virou a fonte ÚNICA (lista + painel + rótulo).
  ⚠️ Antes `Date.now() - fPeriodo * 86400000` estava repetido em **3 lugares** — e
  com a opção nova (que não é número) cada um daria `NaN`; **NaN em comparação de
  data não filtra nada: mostraria tudo, em silêncio.**
  ⚠️ `data_inicio` é parseada com **`T12:00:00` local**: `new Date('2026-08-01')` é
  meia-noite UTC = 31/07 21h no Rio, e um pedido da véspera (temporada ANTERIOR)
  entraria como se fosse da nova. Guarda mutation-testada em
  `src/test/janelaPeriodo.test.ts` (7 casos, com `agora` injetado — teste que
  depende da hora da execução foi o que mordeu no `faixaEtaria.test.ts`).

**⚠️ NÃO virou sub-aba nem tela nova** — a Caixa de entrada é **lista única sem
sub-abas** por decisão dele (14/07). O retrato entrou como bloco recolhível
ACIMA da lista, e **derivado de `rowsBase`**, o mesmo objeto que já alimenta os
cards: segue origem/período/busca automaticamente. Se fosse um endpoint de
agregação próprio, a tela teria dois números para a mesma pergunta.

O painel mostra: **pedidos × PESSOAS distintas** (176 pedidos do domingo eram 160
pessoas — 14 pediram 2+ grupos, e um dos devolvidos foi exatamente alguém que se
inscreveu duas vezes sem perceber), novas × já cadastradas, "as mensagens
chegaram?" (líder avisado/falhou · pessoa avisada/falhou), por grupo + **quais
grupos não receberam nenhum pedido**, e barras por dia.

- `GET /grupos/entrada/cobertura?desde=` é o **único** dado que a lista não
  responde (grupos ativos sem pedido — 30 de 87 no lançamento). Ignora
  `modo_inscricao='fechado'`: grupo que não recebe inscrição pelo formulário não
  pode ser cobrado de divulgação. Carregado **lazy**, só quando o painel abre.
- `/grupos/pedidos/list` ganhou 3 campos por linha, em blocos **best-effort**
  (mesmo padrão dos que já existiam — falha loga e a lista segue de pé):
  `contato_status`, `avisos` (estado da entrega ao líder e à pessoa) e
  `pessoa_nova`. `pessoa_nova` = cadastro pendente, ou membro criado a menos de
  **10 min** do pedido (quem já existia tem `created_at` de dias/meses antes).

## ⚠️ Grupos · "dá pra falar com essa pessoa?" · services/contatoPessoa.js (2026-08-03)

Régua ÚNICA de contato, criada a partir de 2 casos reais do lançamento:

1. **Telefone que o nosso envio não alcança.** A Patricia Künzler digitou um
   número **suíço** (+41 76 576 45 38). O contrato de porta valida **quantidade
   de dígitos, não o DDD** — então passou: um pedido gravou `0765764538` (DDD
   "07" não existe) e outro `41765764538`. E `waSender.normalizarTelefone`
   **prefixa `55` em tudo que tem 10-11 dígitos**, então virou `5541765764538`,
   um número de Curitiba que não existe.
2. **Número brasileiro válido sem WhatsApp** — 2 receberam "Message
   undeliverable" da Meta.

**Decisões do Marcos (03/08):** telefone estrangeiro **deve poder se inscrever**,
só precisa gerar observação pra o líder procurar por e-mail; e *"número brasileiro
sem WhatsApp é a mesma coisa que estrangeiro: classifique como **número errado —
impossível contato**"* — daí o rótulo ser o MESMO nos dois casos.

- `telefoneAlcancavel()` espelha o normalizador do envio e acrescenta o que
  faltava: **DDD real** (lista da Anatel) e **o 9 do celular**.
  ⚠️ **DDD 55 é Santa Maria/RS e é legítimo** — mesma armadilha do
  `tirarCodigoPaisTelefone`; há teste dedicado pra isso.
- ⚠️ **NÃO bloqueia inscrição em lugar nenhum.** É classificação de LEITURA: pinta
  o selo na Caixa de entrada (número riscado, e-mail destacado, "Não recebe
  WhatsApp — fale por e-mail") e troca o `{{4}}` do template do líder, que antes
  entregava um número inexistente — o líder tentava, não conseguia, e concluía que
  a pessoa desistiu.
- ⚠️ **Sem coluna nova, de propósito**: o telefone É a evidência do caso 1 e
  `whatsapp_envios.failed_at` é a do caso 2. Coluna gravada ficaria velha quando a
  pessoa corrigisse o telefone.
- ⚠️ `whatsapp_envios.telefone` guarda **o que o chamador passou**, não uma forma
  canônica (grupos manda digits-only; `whatsapp_lideres` guarda com 55). O
  cruzamento usa os **8 últimos dígitos** — comparar cru dependeria de sorte.
- Testes: `src/test/contatoPessoa.test.ts` (14 casos, com os números reais do
  lançamento). Validado contra produção: dos 181 pedidos, **177 ok · 2
  numero_errado · 2 sem_whatsapp**, todos os 4 com e-mail disponível.

⚠️ **Follow-up conhecido (não feito)**: `41765764538` é um número suíço VÁLIDO e o
WhatsApp funciona internacionalmente — o que impede a entrega é o nosso envio
assumir Brasil e prefixar 55. Suportar internacional de verdade é mexer no funil
de envio (waSender) e vale sessão própria; hoje o caminho é o e-mail.

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

### ⚠️ Quem RECEBE a mensagem do grupo = `mem_grupos.lider_id`, e é UM só (2026-07-31)

Pergunta do Marcos na véspera: *"temos muitos líderes em um mesmo grupo, mas
devemos garantir que só um deles está recebendo mensagens a respeito daquele
grupo"*. **Isso já é garantido por construção** — conferido nos dois resolvedores:
`gruposWhatsapp.js` (novo pedido, frequência, renovação, confira, sugestão) e
`gruposEnvios.js` (`montarDestinatarios*`) leem **`grupo.lider_id`**, um único
`mem_membros`. Co-líder e `lider_treinamento` do roster **nunca** recebem. E medido:
**0 grupos com 2+ vínculos ativos em `whatsapp_lideres`** (o outro canal, do bot).

⚠️ **A régua frágil é outra: nada garante que o `lider_id` seja um líder do
roster** — e era exatamente aí que estava o problema. Medição de 31/07 nos 87
ativos: **3 grupos** cujo destinatário não estava entre os `funcao IN
('lider','co_lider')`, sendo 2 casos reais e graves:

- **CURSO ALIANÇA (00000057)**: recebia a **Desiree**, que no roster é
  **`frequentador`** (nem líder!) e cujo telefone tem 9 dígitos (`996013179` =
  inalcançável). Os 3 líderes de verdade (Carlos, Ester, **Paulo Pessanha**) não
  recebiam nada. Sintoma que confirma: o grupo tinha **0 vínculo no bot**, porque
  o auto-sync não cria vínculo com telefone inválido. → passou pro **Paulo**
  (`21999648788`), decisão do Marcos.
- **Cond. Península – JOVENS (T2-2026-005)**: recebia a **Marcella Martins Leta**,
  que **não tem vínculo nenhum no grupo**; o líder do roster é o **Vitor Leta**. →
  passou pro **Vitor** (`21994884484`), decisão do Marcos.

**Estado final (87 ativos): 0 destinatário com telefone inválido · 0 destinatário
que não é líder do roster · 0 grupo com 2+ vínculos no bot · 0 grupo sem
`lider_id`.** Isso também tirou o telefone da Desiree do caminho crítico do
lançamento (o grupo dela passou a ter destinatário alcançável) — o número dela
segue pendente como correção de CADASTRO, não de envio.

⚠️ **Trocar `lider_id` por UPDATE direto NÃO sincroniza o bot.** O
`syncWhatsappLideres` é hook do backend (POST/PUT de grupo); em script é preciso
chamar `sincronizarLideresGrupos()` na mão, senão os 2 canais discordam (o de
grupos manda pro novo líder e o bot continua no antigo). Foi o que aconteceu aqui
até rodar o sync (desativou o vínculo antigo e criou o novo).
⚠️ **O checkout principal está na branch `claude/poolpg-projects-patrimonio` e NEM
TEM `backend/services/whatsappGrupos.js`** — script que precise de serviço do
backend tem que resolver o require na **worktree de `origin/main`** (com
`node_modules`/`.env` do principal). É a lição de "ler da worktree, não do main",
agora com sintoma novo: `MODULE_NOT_FOUND` num arquivo que existe em produção.
⚠️ **Follow-up combinado (pós-domingo, decisão do Marcos):** criar verificação que
avise a coordenação quando o destinatário não for líder do roster. Sem ela, a
incoerência volta silenciosamente na próxima troca de liderança — porque a aba
Pessoas muda `mem_grupo_membros.funcao` e o `lider_id` do grupo é outro campo.

## ⚠️ Grupos × APP · temporada e lista de inscrição vêm do BACKEND (2026-08-04)

Item 1 da auditoria do app (03/08): o app mobile (`igreja-cbrio/Aplicativo-CBRio`)
lia DUAS fontes erradas — a tabela paralela **`app_grupos_temporada`** (1 linha ·
`aberta:false` desde 11/06 · nenhuma tela do web escrevia nela) pra decidir
"inscrições abertas?", e **`mem_grupos` cru** (só `ativo` + `deleted_at`) pra
listar grupos — ignorando `modo_inscricao='fechado'`, `aceitando_inscricoes`,
status e temporada. Resultado: o app dizia "temporada fechada" com a T2 aberta
e, se a flag paralela fosse virada, listaria grupo fechado/pausado.

- **`GET /api/public/grupos/app-inscricao`** (publicGrupos.js · sem auth, herda
  o limiter do router) devolve `{ aberta, titulo, grupos[] }`. `aberta` deriva
  da LISTA (`grupos.length > 0`), não de flag: grupo `sempre_aberto` mantém a
  inscrição possível mesmo fora de temporada. `titulo` = label da temporada com
  `inscricoes_abertas` (maior ano/numero).
- **Régua ÚNICA**: o filtro do `/buscar` virou o helper `buscarGruposInscriveis
  ({categoria, bairro, temporada})` e os DOIS endpoints o usam. Mudou a regra de
  "grupo inscritível"? Muda no helper — nunca criar cópia (foi a cópia que
  gerou a divergência app×web).
- ⚠️ A rota é declarada **ANTES de `GET /:id`** (Express casa na ordem — depois
  dela, `/app-inscricao` viraria `req.params.id`).
- **`app_grupos_temporada` ficou SEM leitor** (o app novo lê o endpoint) — não
  reintroduzir; dropar a tabela numa limpeza futura com aval do Marcos.
- No app: `lib/temporadaGrupos.ts` chama o endpoint (falha ⇒ `aberta:false`,
  fail-closed) e `inscricao-grupos.tsx` lista os grupos vindos dele.

**Item 2 (mesma leva) · recusa do líder pelo APP agora DEVOLVE (não rejeita):**
`POST /app/grupos/pedidos/:id/rejeitar` (app.js) gravava `rejeitado` (final) e
**notificava a pessoa** — aviso que o fluxo do líder deliberadamente não manda
(lei de 14/07: líder recusa → `devolvido`, triagem realoca; `rejeitado` é só da
equipe). Agora espelha o ramo de recusa do `POST /public/grupos/aprovar`:
`status='devolvido'` + motivo interno (trim/500) + `registrarEventoPedido
('recusado_lider', {origem:'app'})` **awaited** (serverless descarta trabalho
pendente pós-res.json; o serviço nunca lança) + notificação pra TRIAGEM
(`pedido_devolvido`, fire-and-forget — a Caixa de entrada é o caminho
garantido). A pessoa não recebe nada e continua na fila de realocação da Naná.
Medido antes do fix: **0 recusas reais** tinham passado pelo caminho errado
(os 16 `rejeitado` vivos eram teste de julho). A aprovação pelo app já era
correta (`aprovarPedidoCore` = regra única, registra evento).

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

## ⚠️ EVENTOS no app · a inscrição roda a MESMA função do site (2026-08-05)

Pedido do Marcos: *"ao clicar em inscrições, aparecem todos os eventos da igreja,
com um seletor de todos os eventos e eventos inscritos; nessa aba, ao clicar deve
aparecer minha inscrição naquele evento — e eu quero que os outros eventos tenham
inscrições PELO APP também, sem link externo como é o caso do celebra."*

**O que existia:** o app abria `cbrio.org/evento/<slug>` no navegador (WebBrowser)
e **não lia a tabela `inscricoes`** — então confirmar, cancelar, dar bolsa ou
marcar pago no web **não tinha onde aparecer**. Medido em 05/08: `GET /app/eventos`
devolvia só o CATÁLOGO.

**⚠️⚠️ LEI DESTE FLUXO: o app é um CLIENTE novo da porta, não uma porta nova.**
`POST /api/app/eventos/:id/inscrever` importa e executa **`inscreverEspinha`** de
`publicEventoExterno.js` — a mesma função do formulário público. Contrato de
campos (`validarCamposPadrao`), benefício pré-autorizado por CPF, **RPC atômica de
vaga** (`fn_insc_inscrever`, com o advisory lock), consentimentos
(`inscricao_consentimentos`), cobrança e WhatsApp rodam **idênticos**.
Reimplementar no app seria o "segundo caminho de escrita de pessoa" que o Contrato
de porta existe pra impedir. A única diferença é `p_origem`, que virou parâmetro:
`'app'` em vez de `'formulario_publico'` (a coluna é TEXT **sem CHECK**, conferido
no banco).

- **`GET /app/eventos`** ganhou `campos` (form-builder), `inscrito` (por pessoa) e
  os `textos` canônicos do consentimento — o app **exibe** o texto que o servidor
  manda; o snapshot gravado continua sendo o do servidor.
- **`GET /app/eventos/minhas`** = o que faltava: status, número da sorte, bolsa,
  respostas, **comprovante** (`/i/c/<token>` HMAC — o MESMO QR que a portaria lê)
  e o estado do pagamento pela `vw_insc_pagamento_estado`.
- **PAGAMENTO fica na página hospedada** (`/pagamento/<public_token>` da COBRANÇA,
  nunca o uuid): é lá que vivem Pix/boleto/cartão e o escopo PCI (lei nº 5 do
  núcleo de pagamentos). O app só abre o link que a resposta devolve.
- **Evento com campo `imagem` cai no form público** — o app não sobe arquivo pro
  pipeline daquele formulário, e é melhor mandar pro caminho que funciona do que
  mostrar um campo que não envia. Caso real: "Patrocinadores - Celebra 2026" (7
  campos, 1 deles `imagem`).

**⚠️ Dois erros meus que o probe pegou antes de subir** (e é por isso que a régua
é rodar a query contra produção, não ler o arquivo):
1. `vw_insc_pagamento_estado.status` **não existe** — a coluna é
   **`status_pagamento`** (a view também já entrega `checkout_url`, `pix_payload`
   e `boleto_linha_digitavel`). Pedir coluna inexistente faz o PostgREST recusar a
   query INTEIRA: o pagamento sairia **vazio em silêncio**.
2. `insc_pagamentos` **não tem `deleted_at`** (é razão financeira — "financeiro não
   se apaga", decisão da espinha) e eu havia filtrado por ele.
3. A resposta de `inscreverEspinha` tem **`pagamento` BOOLEAN**, não objeto: o link
   se monta do `public_token`. Eu havia tipado como objeto no app — a tela nunca
   acharia o link de pagamento.

**Conferido em produção antes do merge:** 3 eventos publicados (Celebra 2026 ·
Patrocinadores · RETIRO pago), `GET /eventos/minhas` devolvendo
`confirmada · Celebra 2026 · nº da sorte 1817 · comprovante` para um membro real.
As 2 inscrições pagas de "Retiro AMI 2027" **não** aparecem na view porque estão
soft-deletadas (teste de 30/07) — e o endpoint filtra `deleted_at` igual, então
os dois lados concordam. ⚠️ **Não há hoje nenhuma inscrição paga VIVA em
produção**, então o caminho "Pagar agora" não pôde ser exercitado com dado real —
ele usa a mesma view e o mesmo `public_token` do site, mas isso é construção, não
teste.

### Régua web × app · onde tinha que bater e não batia

- **`useAdminGrupo` do app decidia por `profiles.role`** (esquema APOSENTADO) +
  comparação com `lider_id` no cliente. Quem tem grupos ≥ 3 **pela matriz** (a
  coordenação de Grupos, por boost de área, tem role `assistente`) editava no web
  e **não** no app. Agora o app pergunta ao servidor: `GET /app/grupos/papel`, que
  já calcula `admin_grupos` pela matriz + `grupos_liderados`. Uma régua, no
  servidor — e mudança de cargo/área no web passa a valer na próxima abertura.
- **`resolveMembroApp`**: ver a rodada 2 acima (cadastro apagado servia o app).
- **6 telas do app passaram a recarregar ao FOCAR** (batismo, grupo-detalhe,
  buscador de grupos, devocional, culto-detalhe, escala do supervisor): o web e o
  app leem o MESMO banco, mas o que o web muda só aparecia se a tela fosse
  remontada. ⚠️ Formulário NÃO recarrega ao focar (perfil, grupo-editar,
  completar-cadastro) — refetch em cima do que a pessoa está digitando é pior que
  dado velho.

## ⚠️⚠️ GATE DA FICHA no app · entrar exige cadastro completo (2026-08-05)

Decisão do Marcos, depois de eu apontar o risco e ele reafirmar: *"o gate de CPF
precisa ter, todas as pessoas que entrarem no sistema devem pedir para
completarem o cadastro antes, após completar elas acessam normalmente."*

**Ligado.** `GET /app/identidade/status` passou a exigir a ficha FECHADA (nome de
gente + telefone + nascimento + **CPF** + **sexo**) e `completarCadastro` roda com
`exigirCpf: true, exigirSexo: true`. Antes o CPF era só informativo, e o efeito
medido era pior: a pessoa entrava "completa" e levava **400 na primeira
inscrição** (`POST /app/inscricoes` exige CPF) — 50 das 75 contas.

**Impacto medido em produção antes de subir** (88 contas do app): **12 entram
direto** · **71 vão ver a tela de cadastro** · 5 sem cadastro vivo (os
soft-deletados de 04/08 — o matcher cria/religa quando elas completarem). O que
falta nelas: **sexo em 70** (a coluna `genero` só começou a ser gravada hoje),
CPF em 49, nascimento em 44, telefone em 43.

### ⚠️ A ÚNICA isenção: contas de REVISÃO DE LOJA

`CONTAS_REVISAO_LOJA` em `services/appIdentidade.js` (3 e-mails declarados à
Apple/Google). Motivo: **o revisor não tem CPF brasileiro** — com o gate sem
isenção ele trava na tela de cadastro e o build é recusado com "não conseguimos
completar o registro", a rejeição mais comum de app com login. Isso não é bug de
usuário: **bloqueia o release inteiro**.

⚠️ **E por que não é só pôr um CPF nessas contas:** CPF com DV válido PERTENCE A
ALGUÉM REAL e é a chave mais forte do matcher — na primeira vez que essa pessoa
preenchesse um formulário, seria ligada à conta de revisão. Uma delas já teve um
CPF DV-válido, e ele foi anulado por isso.
⚠️ **Não acrescentar e-mail de gente nessa lista** — seria criar uma porta pra
entrar no app sem cadastro, exatamente o que o gate existe pra impedir.
✅ Conferido com a régua real: as 3 contas mostram `falta=[cpf]` e **PASSAM**.

### O app pergunta, não decide

`/identidade/status` devolve **`exige_cpf`** e a tela `completar-cadastro` só
bloqueia o CPF quando o servidor diz que sim. Falha de rede mantém o default
**true (fail-closed)**: sem isso, ficar offline viraria porta pra entrar sem
cadastro. É a mesma lei do resto — quem define o que é válido é o backend.

## 🔴 INCIDENTE · o portão do app trancou TODO MUNDO pra fora (2026-08-06)

O Marcos tentou entrar e não conseguiu: *"coloquei o CPF, recebi o e-mail de
confirmação, mas o app não entrou e voltou na primeira página"*. **O app ficou
inutilizável pra todas as contas** entre a aplicação da migration
`20260805150000` e este conserto. Causa: **duas falhas minhas somadas**, e
nenhuma delas apareceu antes porque **ninguém tinha concluído o cadastro pelo app
até hoje** (`mem_identidade_observacoes` com origem `app_onboarding` = **0**).

**Falha 1 · o caminho rápido não carimbava a confirmação.** Ao ligar o gate em
05/08, só o FORMULÁRIO marcava `app_ficha_confirmada_em`. Quem provava identidade
por CPF → código no e-mail ficava com a marca nula, `completo` seguia false e o
portão devolvia pra tela de cadastro. **Beco sem saída por construção.**
⇒ `confirmarCodigo` passa a carimbar. É legítimo: **ler o código enviado ao
e-mail DO CADASTRO é prova de POSSE** — mais forte que digitar um formulário, que
qualquer um digita. Não libera sozinho: `completo` continua exigindo a ficha
fechada; quem prova identidade com cadastro incompleto vai ao formulário, agora
**com os campos preenchidos** (a identidade deixou de ser palpite).

**Falha 2 · o portão perguntava ao servidor UMA vez e nunca mais.** `CadastroGate`
guardava `incompleto` da montagem; ao concluir, a tela navegava pra Home, o efeito
de rota via o valor velho e **devolvia pra tela de cadastro**. Laço infinito, por
QUALQUER caminho (formulário inclusive).
⇒ A tela chama `revalidarCadastro()` antes de navegar; o portão repergunta e só
então libera. ⚠️ A trava é um **ref** (`liberado`), não estado: `router.replace`
roda logo após o `setIncompleto(false)` e o commit do React pode não ter
acontecido — o ref fecha a janela de corrida.

### Lições (as duas valem além deste caso)

1. ⚠️⚠️ **Portão que decide com estado LIDO UMA VEZ vira armadilha quando a
   condição muda.** Qualquer gate assim precisa de um caminho explícito de
   revalidação — senão "resolver o problema" não tira a pessoa do bloqueio.
2. ⚠️⚠️ **Ligar uma exigência exige cobrir TODOS os caminhos que a satisfazem.**
   Eu liguei o gate cobrindo só um dos dois caminhos de conclusão. Régua: ao criar
   uma condição de acesso, listar quem pode satisfazê-la e conferir um a um.
3. **"Ninguém nunca fez isso" é sinal de alerta, não de segurança**: o zero em
   `app_onboarding` estava na minha frente desde 05/08 e eu o li como "recurso
   novo", quando era "caminho nunca exercitado".

## ⚠️⚠️ LEI · o LOGIN não liga ninguém a cadastro (2026-08-06 · migration `20260806120000`)

Fecha o desenho que o Marcos pediu em duas etapas. Palavras dele: *"sobre o
gatilho ligando o login, eu acho que deve ter, mas ele só deve ser acionado PÓS
PREENCHER TODOS OS DADOS, e todos que baixarem devem ser obrigados a preencher, e
somente após o preenchimento entrar no app; e com os dados completos, aí sim ir
para o módulo de duplicatas se houver algum matcher"*.

**O mecanismo de ligar continua existindo — mudou de MOMENTO.** `handle_new_user`
passa a criar **só a conta** (`profiles`, com `is_membro_only = true` e
`membro_id NULL`). Quem resolve identidade agora é
`POST /app/identidade/completar` → `acharOuCriarGuardado`, **com CPF na mão**; o
par duvidoso segue pra fila humana em /entradas.

- **Por que**: o gatilho ligava por **e-mail + nome** (sinal médio) e, com login
  do Google, é só isso que existe. A pessoa caía num cadastro que outra porta
  preencheu e **entrava no app herdando CPF, nascimento e sexo que nunca
  forneceu** — 9 de 89 contas, medido em 05/08. Caso concreto: o Pedro Paiva
  logou com o Gmail e foi ligado ao cadastro dele importado do Next.
- **Ritmo real**: ~2 logins de membro por dia (13 profiles em 7 dias). Desde o
  conserto de 04/08 o gatilho **não criava** cadastro (`origem='auth_signup'` = 0);
  ele vinha **ligando** — que é o que sai agora.
- ⚠️ **`is_membro_only = true` continua obrigatório** no INSERT: sem isso a pessoa
  cai no `/dashboard` do ERP em vez do app.
- ⚠️ **Os metadados não se perdem**: `cpf`, `telefone`, `nascimento` e
  `frequenta_area` ficam em `auth.users.raw_user_meta_data`.
  `appIdentidade.completarCadastro` aplica o `frequenta_area` (AMI/Bridge) ao
  concluir — sem isso a escolha da pessoa seria **descartada em silêncio**, que é
  o bug do CPF do censo se repetindo.
- ⚠️⚠️ **Consequência conhecida e aceita**: quem loga e ainda não preencheu fica
  **sem `mem_membros`**. No app é irrelevante (o portão bloqueia tudo até
  preencher). Fora dele — webapp do devocional — a pessoa vê "você não é membro"
  até completar. É honesto: ela ainda não é. A versão anterior criava um
  cadastro-fantasma só pra aquela tela não reclamar, e era esse o anti-padrão.
- ⚠️ **Não reescreve o passado**: os 24 cadastros `origem='auth'` e os vínculos já
  feitos ficam; o par duplicado deles vive na fila de /entradas. E
  `profiles.app_ficha_confirmada_em` (20260805150000) continua sendo o que fecha o
  furo das contas ANTIGAS, que já têm `membro_id` — as duas migrations são
  complementares, não alternativas.
- ⚠️ Staff (`rh_funcionarios` ativo) **nunca** teve cadastro criado pelo gatilho —
  esse ramo está intocado.

## ⚠️⚠️ LEI · no APP, dado HERDADO de vínculo não libera acesso (2026-08-05 · migration `20260805150000`)

Decisão do Marcos, ao ver que o login do Pedro Paiva não pediu cadastro:
*"qual CPF de Pedro Paiva que cadastrou no app? Data de nascimento, Sexo? Só tem
email e nome. Se ele pode preencher o cadastro, pra que fundir automaticamente
entende? O caso do app, mesmo que o sistema ache que alguém é igual, **NÃO deve
liberar acesso**; depois de preencher todos os dados aí sim pode se ter 100% de
certeza"*.

**O furo:** `GET /app/identidade/status` calculava o que "falta" **a partir do
cadastro que o vínculo encontrou**. Como o gatilho de `auth.users` liga por
e-mail + nome (sinal médio), quem caía num cadastro já completo **entrava no app
sem nunca ter provado nada** — herdando CPF, nascimento e sexo que um import
preencheu. **Medido antes de ligar: das 89 contas com cadastro vinculado, 9
passavam o gate — TODAS as 9 por herança** (confirmações reais pelo app: **0**).
Dois casos não-staff eram gente que logou com Gmail e caiu num cadastro do
`grupos_import_2026`.

- **`profiles.app_ficha_confirmada_em`** é a marca: `completo` exige ficha fechada
  **E** confirmação por ESTA conta. ⚠️ Fica em `profiles` (a CONTA), **não** em
  `mem_membros` — duas contas ligadas ao mesmo cadastro herdariam a confirmação
  uma da outra, que é o mesmo furo por outro caminho.
- **O app não pré-preenche dado herdado**: o status devolve
  `pode_preencher_com_vinculo`, e enquanto for false o formulário traz **só o
  nome** (o que veio do provedor do login). Pré-preencher CPF/nascimento seria
  fazer a pessoa "confirmar" o que ela não forneceu.
- ⚠️⚠️ **FAIL OPEN quando a coluna não existe** (deploy em 2 etapas): pedir coluna
  inexistente faz o PostgREST **recusar a query inteira**, e tratar isso como "não
  confirmou" prenderia TODO MUNDO na tela — inclusive depois de preencher, porque
  a gravação da marca falharia igual (**loop sem saída**). Sem a migration vale o
  comportamento antigo; com ela, o portão liga. Os dois lados degradam juntos, de
  propósito. O `select` da marca é **ISOLADO** pelo mesmo motivo.
- ⚠️ **O gatilho de `auth.users` NÃO foi alterado.** Ele continua ligando (CPF
  forte; e-mail+nome médio) — mudá-lo pra não ligar criaria duplicata em TODO
  login e inundaria a fila humana. O que mudou é que **o vínculo deixou de ser
  prova de acesso**; o par duplicado segue indo pra fila de /entradas, agora com
  CPF de verdade pra decidir. É exatamente o que ele pediu ("preencher tudo e
  depois vá para essa aba").
- ⚠️ **Efeito conhecido e correto**: as 9 contas (incluindo as do staff) veem a
  tela de cadastro **uma vez**. Régua aplicada a todo mundo, não regressão.
- ⚠️ Comentário desatualizado corrigido em `appIdentidade.completarCadastro`: ele
  dizia que CPF e sexo **não** eram exigidos (estado anterior a 05/08) enquanto o
  código exigia os dois — comentário que mente engana a próxima sessão.

## ⚠️⚠️ LEI · resposta de `/api/app` NUNCA é cacheável (2026-08-05 · PR #2313)

Incidente relatado pelo Matheus: *"Mesmo preenchendo tudo certo volto pra essa
tela e não consigo passar dela. Boto o cpf, recebo o código e volto pra ela."* A
tela é a de completar cadastro. A Joana Botafogo tentou **3× em dois minutos**.
Os dois com `profiles.membro_id` preenchido e a ficha COMPLETA no banco — ou
seja, **o servidor respondia `completo: true` e a pessoa não passava**.

**CAUSA: `res.json` do Express gera ETag e não manda `Cache-Control`.** O
`fetch` do React Native usa o cache HTTP do sistema (NSURLSession no iOS, OkHttp
no Android): guarda a resposta, revalida com `If-None-Match`, o Express responde
**304 sem corpo**, e a camada nativa entrega ao JS **a resposta ANTERIOR** — a
de antes de vincular, com `completo: false`. Medido nos runtime logs: **124 de
251** respostas de `/api/app/*` em 6h eram 304, e a sequência do Matheus aparece
literal (200 → 304 → confirma o código → 304).

- **A correção vale pro ROUTER INTEIRO** (`router.use` no topo de `app.js`):
  `Cache-Control: no-store` **+** `res.json` respondendo por
  `res.end(JSON.stringify(body))`. Assim GET novo do app nasce sem cache sem
  ninguém precisar lembrar.
- ⚠️ **`no-store` SOZINHO não resolve**: o `req.fresh` do Express compara o
  `If-None-Match` do REQUEST com o ETag da RESPOSTA e devolve 304 do mesmo
  jeito. Quem mata o 304 é **não emitir validador** — `res.end` não gera ETag.
- ⚠️ **Prova com `http.get` CRU, não `fetch`**: o `fetch` do Node (undici)
  injeta `Cache-Control: no-cache`, o que faz `fresh()` dar false e **mascara o
  304**. Minha 1ª tentativa de reproduzir falhou por isso. Antes → `304` corpo
  vazio; depois → `200` com o estado atual, `etag: undefined`.
- ⚠️ **Não "otimizar" devolvendo ETag em rota do app**: o corpo aqui é **estado
  da PESSOA** (o que falta no cadastro, meus grupos, meu perfil, minhas
  inscrições) e muda por ação dela na tela anterior — servir a versão anterior é
  sempre errado. Cache condicional é pra conteúdo, não pra estado.
- ⚠️ **Eram DUAS causas independentes** pro mesmo loop: esta (servidor) e a do
  app (`CadastroGate` nunca limpava o estado local `incompleto`, então rebatia
  mesmo depois de completar · PR #67 do Aplicativo-CBRio). Sem as duas, o loop
  volta.
- ⚠️ Descartado de propósito no cliente: `cache: "no-store"` no `apiGet` do app.
  O `fetch` do React Native é o polyfill `whatwg-fetch` sobre `XMLHttpRequest` e
  **ignora a opção `cache`** — seria decoração que se lê como proteção.

## ⚠️ GERENCIAR GRUPO pelo app · tudo do líder num lugar só (2026-08-05)

Pedido do Marcos: *"ao apertar gerenciar grupo, ali devem ter TODAS as opções
para se fazer em um grupo"* — e a lista dele: membros (com quem é líder ou em
treinamento), registro de frequência (com comentário do líder e pedido de ajuda),
aprovação de pedidos, saídas e transferências, estudos e editar o grupo.

**7 endpoints novos em `routes/app.js`**, todos com o MESMO gate do
`GET /grupos/:grupoId/membros` (helper `gateGrupoApp`: gere o grupo OU admin de
grupos), e reusando os escritores canônicos:

| endpoint | régua reusada |
|---|---|
| `PUT /grupos/:g/membros/:row/funcao` | — (whitelist própria, ver abaixo) |
| `POST /grupos/:g/membros/:row/sair` | soft (`saiu_em` + `motivo_saida`), como o "confira a lista" |
| `POST /grupos/:g/membros/:row/transferir` | cria **pedido** no destino (fila do outro líder) |
| `GET/POST /grupos/:g/encontros` | **RPC `registrar_encontro_grupo`** (o mesmo escritor do web e do WhatsApp) |
| `POST /grupos/:g/ajuda` | `notificar()` módulo grupos |
| `GET /grupos/:g/materiais` | `mem_grupo_documentos` (do grupo + os gerais) |

### ⚠️⚠️ O que o app NÃO pode fazer, e por quê

- ⚠️⚠️ **`funcao='lider'` é CADASTRO · `mem_grupos.lider_id` é a LÍDER
  PRINCIPAL** (corrigido 05/08 por esclarecimento do Marcos — eu tinha
  confundido as duas e bloqueado o app de marcar os outros líderes). Palavras
  dele: *"só o líder principal recebe mensagem e ele não pode remover a si
  mesmo, os outros seria apenas para sabermos no cadastro, mas não receberia
  mensagem nenhum"*. Então `FUNCOES_APP` é
  `frequentador · lider_treinamento · co_lider · **lider**`, e o que segue
  protegido é a **PESSOA** que é `lider_id`: o servidor recusa mudar a função
  dela e recusa registrar a saída dela (é ela que recebe o WhatsApp do grupo ·
  lei de 31/07: um destinatário só, e tem que ser líder do roster).
  ⚠️ `supervisor`/`coordenador` seguem FORA: são papéis da hierarquia de
  supervisão (`grupo_supervisao_*`), não do roster.
  ⚠️ O roster do app passou a devolver **`lider_id`** — sem ele a tela não
  distinguia as duas coisas e escondia o menu de ações de TODOS os líderes.
  A principal ganha badge "Líder principal" e é a única sem menu.
  ⚠️ Medido em 05/08: **30 dos 97 grupos ativos têm a principal FORA do roster
  ativo** — nesses ela não aparece na aba Membros (o bloqueio do servidor
  continua valendo). É o follow-up de 31/07 (avisar a coordenação quando o
  destinatário não é líder do roster), ainda aberto.
- **Transferência NÃO empurra ninguém pra dentro de outro grupo**: cria
  `mem_grupo_pedidos` no destino, `origem='app'`, pro líder de lá aprovar — o
  mesmo fluxo de quem se inscreve. E os destinos oferecidos são só os grupos que
  o próprio líder gerencia. A **saída** do grupo atual é um passo separado.
- **Presença só de quem está no roster ATIVO** (o servidor filtra a lista que o
  app manda) e **encontro no futuro é recusado**.
- **"Pedir ajuda" NÃO abre fila com "resolvido"** — chega como notificação
  persistida (`app_notificacoes`) + push pra quem cuida de Grupos. Fila com
  estado pediria tabela nova, e criar fila é decisão da coordenação. A tela diz
  "a coordenação recebe seu pedido", não "abrimos um ticket".

### ⚠️ Duas colunas que o probe pegou antes de subir

`mem_grupo_pedidos.observacoes` **não existe** — é **`observacao`** (singular). E
`mem_grupo_documentos` **não tem `url`**: os campos reais são `sharepoint_url` e
`storage_path` (o link é montado no backend). Nos dois casos, pedir coluna
inexistente faria o PostgREST recusar a operação INTEIRA — o INSERT da
transferência falharia e a aba de estudos apareceria vazia, em silêncio.

### Entradas e saídas · histórico discreto no web (2026-08-05 · SEM migration)

Pedido do Marcos sobre a transferência: *"ali eu pensei em ser apenas um
histórico de pessoas e no máximo um pedido que fica na tela do gerenciador do
sistema web pra aprovar — deve ser uma tela pequena, com pouco destaque, como se
fosse uma tela de histórico de entradas e saídas sem muita interação"*.

`GET /api/grupos/:id/entradas-saidas` (leitura pura · nível 1) devolve
`eventos[]` de entrada/saída derivados de `mem_grupo_membros` (a saída é soft, em
`saiu_em`, então a MESMA linha rende entrada e — se a pessoa saiu — saída, com
`motivo_saida`), ordenado desc e capado em 60. No `Grupos.jsx` é um bloco
**recolhido por padrão** logo acima de "Encontros recentes", sem nenhuma ação.

- ⚠️ **A transferência vinda do app NÃO aparece aqui como ação a aprovar** — ela
  entra como **PEDIDO na Caixa de entrada**, que é onde a triagem já decide. Duas
  portas pra aprovar a mesma coisa era o que fazia parecer que existiam dois
  lugares (a mesma razão pela qual "Inscrições do grupo" saiu do `/meu-grupo`).
- ⚠️ **Os relatórios de frequência do app JÁ aparecem no web** — o Marcos ofereceu
  construir a tela e não é preciso: `Grupos.jsx` tem "Encontros recentes" lendo
  `api.encontros(id, {limit:10})`, que mostra data, nº de presentes, tema e **o
  comentário do líder** (`observacoes`), porque o app grava pela RPC canônica
  `registrar_encontro_grupo`. A aba Relatórios agrega o resto.

**No app**: `grupo-membros.tsx` virou **Gerenciar grupo** com 4 abas (Membros ·
Frequência · Pedidos · Estudos) + **Editar** no cabeçalho (abre
`/grupo-editar`, que já existia). O botão **"Inscrições do grupo" SAIU do
`/meu-grupo`** — duas portas pra aprovar pedido era o que fazia parecer que
existiam dois lugares. A rota `/grupo-inscricoes` **continua viva** (link antigo
e push apontam pra ela).

## Grupos · contagens (vínculo × pessoa) + nova régua visitante/frequentador (2026-07-23)

Auditoria (4 agentes) das divergências que o Marcos pegou entre as abas. **Régua de
leitura (não regredir):** **Relatórios conta PARTICIPAÇÕES (vínculos · mem_grupo_membros ·
uma pessoa em N grupos conta N×)** · **Pessoas conta PESSOAS DISTINTAS (membro_id único,
papel de maior nível)**. Hoje 86 grupos ativos = 100% T2 → 999 participações = 749 pessoas
distintas (162 em >1 grupo). Duplicatas: aba Pessoas mostra N **pessoas**, aba Duplicatas
mostra M **pares** (N ≈ 2M). Nada disso era bug — só rótulo. Correções (PR
`claude/grupos-contagem-frequentador`): (1) BUG do "1067" — o gráfico "Composição" somava
Visitante/Frequentador (vínculos) + Líder=`num_lideres` (pessoas, nível grupo) → removida a
barra Líder (líder vive na rosca de Liderança ao lado), gráfico virou "Participações por
papel"; (2) rótulo "Membros"→"Participações" + nota explicando vínculo×pessoa; (3) aba
Pessoas ganhou filtro `deleted_at` que faltava (inflava +1) + legenda de status; (4)
duplicatas mostram pessoas E pares nas duas abas.

**⚠️ NOVA RÉGUA visitante/frequentador (Marcos 2026-07-23 · migration
`20260723210000`):** a régua antiga "3 presenças → frequentador" foi **abandonada** (com
frequência MENSAL e sem histórico das temporadas antigas). Agora: (a) one-time — TODO
visitante ativo virou **frequentador** (clima limpo); (b) novo entrante nasce **visitante**
(default da coluna) e vira **frequentador na 1ª presença** (`fn_grupo_auto_membro` ·
`presencas >= 1`, era `>3`). **Status de frequência** (aba Pessoas · `statusDe` no frontend,
não no banco): 🟢 em dia (≤30d) · 🟡 atenção (31–90d) · 🔴 ausente (>90d) · ⚪ sem chamada
ainda (nunca teve presença · NEUTRO — cobre o estado atual, já que a frequência nunca rodou).

## ⚠️ Grupos · Envios (barreiras anti-disparo-indevido) + console (2026-07-23)

Susto do Marcos (envios proativos a líderes). Auditoria do código vivo + barreiras
(PR da branch `claude/grupos-audit-msgs`). **Estado dos envios de grupos:**
- **2 mecanismos**: (a) **fila `whatsapp_envios` → só TEMPLATE aprovado** (seguro ·
  novo pedido→líder, inscrição→pessoa, aprovado→pessoa [eventos], frequência
  mensal [cron], renovação [manual], sugestão [manual]); (b) **`enviarComFallback`
  (whatsappGrupos) = texto-livre-primeiro** (o que a Meta bloqueava fora da janela
  24h) — usado só por webhook-reply (dentro da janela, ok) e pelo lembrete manual.
- **Incidente das ~40 msgs (20/07)** = cobrança automática de relato →
  **REMOVIDA** (#1865). **Estudo semanal automático** (cron, texto-livre, template
  inexistente) → **REMOVIDO 2026-07-23** (só manual pela aba de estudos agora; o
  `POST /whatsapp-grupos/enviar-estudo` e a chamada no cron/diario saíram).
- **Kill-switch central** `whatsapp_config.grupos_auto_envios` (migration
  `20260723180000` · **default false = SEGURO**): gateia o único cron proativo que
  sobra (frequência mensal em `publicGrupos`). Desligado = nenhum disparo
  automático sai. Envio MANUAL não depende dele.
- **Aba Envios** (`GruposEnvios.jsx` · PAGE_TAB `envios` · soEditor/nível 5):
  liga/desliga os automáticos + **disparo manual da chamada do mês** por
  líder/bairro/rede/todos (prévia com contagem + exemplo + quem não recebe +
  confirmação pelo número) + renovação + histórico (`whatsapp_envios`) + painel do
  que dispara sozinho. Backend `services/gruposEnvios.js` (`enviosAutomaticosAtivos`,
  resolver de audiência **respeitando `whatsapp_lideres.recebe_lembretes`** —
  corrige a lacuna do `renovacao/disparar` que lia `lider_id` direto) + rotas
  `/grupos/envios/*` em grupos.js. Só template (fila) — nada de texto livre proativo.
- ⚠️ Aplicar `20260723180000` antes do merge (aditiva/idempotente · código tolera
  ausência tratando como false).

## ⚠️ WhatsApp · link local NUNCA sai em mensagem (guarda · 2026-07-29)

Incidente: um redisparo manual do aviso de pedido, rodado numa máquina de dev,
montou o link de aprovação com `FRONTEND_URL=http://localhost:5173` do `.env`
local — a líder recebeu um link de localhost no WhatsApp. Proteção em 2 camadas
(não regredir):
- **`waSender.postMessages`** (funil ÚNICO de envio da Cloud API): payload que
  contenha URL local/privada (`localhost`, `127.0.0.1`, `0.0.0.0`, `[::1]`,
  `://10.*`, `://192.168.*`, `://172.16-31.*`) é BLOQUEADO com
  `reason:'link_local'` — nunca chega na Meta. Cobre qualquer template/texto
  de qualquer serviço, inclusive scripts manuais.
- **`gruposWhatsapp.baseUrl()`**: `FRONTEND_URL`/`VERCEL_URL` local é ignorada
  ao montar link de WhatsApp (warn + fallback `https://cbrio.org`) — a URL já
  nasce certa mesmo em dev.
- `whatsappFila.falhaPermanente` trata `link_local` como erro PERMANENTE (sem
  retry · notifica o módulo — reenviar nunca resolveria).
Regra pra scripts manuais de reenvio: SEMPRE sobrescrever `FRONTEND_URL` pra
produção antes de disparar (o `.env` de dev aponta pra localhost).

## Grupos · templates v2 do fluxo de aprovação (2026-07-29)

Pedido do Pr. Nélio: o fluxo correto do líder é LIGAR pra pessoa antes de
aceitar/recusar. Templates novos aprovados na Meta (UTILITY · pt_BR · mesmas
5 variáveis dos v1) e defaults trocados em `services/gruposWhatsapp.js`:
- `grupos_pedido_novo_lider_v2` — instrui ligar antes; explica que recusa não
  manda aviso automático (a recusa do líder devolve pra triagem, que decide a
  realocação — comportamento já existente, só ficou dito).
- `grupos_pedido_aprovado_v2` — sem o "o líder vai falar com você" (o contato
  já aconteceu antes da aprovação).
Estratégia (lição): NUNCA editar template aprovado em produção — edição volta
pra revisão da Meta e o envio para; criar `_v2`, aprovar em paralelo e trocar
o default/env. Os v1 (`grupos_pedido_novo_lider`/`grupos_pedido_aprovado`)
podem ser excluídos na Meta após confirmar envio real com os v2. Envs
`WHATSAPP_TEMPLATE_GRUPOS_PEDIDO_LIDER`/`_APROVADO` seguem como override.

## ⚠️ Fila WhatsApp · a fila NÃO PODE desistir antes da janela da Meta virar (2026-07-31)

Marcos, sobre o TIER_250 na véspera da abertura: *"quero que você analise isso
bem, para não dar problemas de travar inscrições, ou de mandar várias mensagens
em sequência no dia seguinte."* As duas coisas foram medidas:

**1 · Inscrição NÃO trava** ✅ — o bloco de WhatsApp do `POST /inscrever` está
dentro de `try/catch` que só loga, e `enfileirar` devolve objeto (nunca lança),
inclusive no teto. Teto estourado ⇒ a pessoa é inscrita e vê sucesso; só a
mensagem espera.

**2 · Mas a mensagem MORRIA antes de a cota liberar** 🔴 (corrigido aqui). O
backoff `[30m, 2h, 6h, 12h, 24h]` com `max_tentativas=5` coloca a 5ª e última
tentativa em **t+20,5h da 1ª falha** — e o teto do TIER_250 é uma janela **móvel
de 24h**. Cenário do domingo: teto estoura 11h (1ºs envios às 9h ⇒ cota só começa
a liberar 9h de segunda) → tentativas às 11:00, 11:30, 13:30, 19:30 e **07:30 de
segunda**, todas dentro do bloqueio → linha vira `erro` **1h30 antes de a cota
liberar**. Resultado: pessoa inscrita e **líder nunca recebe o link**. O plano
"estourou o dia, sai no dia seguinte" não se cumpria.
→ `decidirRetry` (função PURA, exportada e testada): **acabar as tentativas não é
motivo pra desistir** enquanto a linha for mais nova que `IDADE_MIN_DESISTIR_H`
(36h > 24h da Meta, com folga) — segue `pendente` tentando a cada hora. Erro
PERMANENTE continua desistindo na 1ª falha (não virou "tenta pra sempre").

**3 · Rajada por destinatário** — quando a cota libera, o cron drena tudo numa
rodada. Cada PESSOA recebe 1 mensagem, mas um LÍDER com N pedidos represados
receberia N templates idênticos em segundos, que é o padrão que a Meta lê como
spam e **derruba a nota de qualidade — a nota é o que decide a subida de tier que
a igreja quer**. `limitarPorTelefone` deixa **máx 2 por telefone por rodada** (8
pedidos drenam em 4h); quem sobra não perde a vez (segue pendente e vencido, e a
ordem é `criado_em` ASC). `processarFila` devolve `adiadosPorTelefone`.

⚠️ **Correção de conta sobre o TIER_250**: o limite da Meta é de **destinatários
ÚNICOS** por janela de 24h — mensagem repetida pro MESMO número dentro da janela
**não consome cota nova**. Então a capacidade não é "250 ÷ 2 = 125 inscrições"
(que assume 1 líder novo por inscrição): é ≈ `250 − (líderes distintos
contatados)` inscrições, e só conta pessoa com **opt-in** (quem recusou não gasta
cota). Com pedidos espalhados por ~60 grupos, dá ~190 inscrições/dia, não 125.
Não é motivo pra relaxar: é a ordem de grandeza certa pra decidir no domingo.

⚠️ Cron da fila = `0 * * * *` (horário) · cap 200/rodada · `maxDuration: 300`
(200 envios sequenciais ≈ 80s, cabe). Testes: `src/test/whatsappFilaRetry.test.ts`
(13 casos · a guarda das 36h é mutation-testada).

## Fila WhatsApp · política de reenvio + falha avisa gente (2026-07-27)

O teste de lançamento de grupos (26/07 · 34 inscrições ao vivo) expôs: erro
PERMANENTE (telefone corrompido de 21 dígitos de uma líder → `invalid_phone`)
era re-tentado 5× em silêncio e ninguém soube que ela ficou sem os links de
aprovação. Decisão do Marcos (27/07): "enviado 1 vez; reenvia só se deu
problema no envio — e problema definitivo avisa gente". Em
`services/whatsappFila.js` (sem migration):
- **`falhaPermanente()`**: `invalid_phone` (normalização local do
  whatsappService) e códigos Meta permanentes (100, 131026, 131030, 132000,
  132001, 132005, 132007, 132012) marcam `status='erro'` na PRIMEIRA falha,
  sem retry. Falha passageira (teto diário TIER_250, timeout, exception)
  mantém o retry com backoff — é o motivo de a fila existir. Envio com
  sucesso nunca foi re-enviado (`enviado` é terminal · sem mudança).
- **Falha TERMINAL (permanente ou esgotou) dispara `notificar()`** pro módulo
  do prefixo do `contexto` (`grupos.pedido_novo_lider` → grupos · sem regra
  configurada cai no fallback admin/diretor) com dedup
  `wpp_envio_falha_<id>` e link `/grupos` quando for de grupos.
- **Validação de telefone na porta** (`routes/membresia.js` ·
  `normalizarTelefonePayload`, espelho do `normalizarCpfPayload`): POST/PUT
  de membros e o PUT do totem normalizam pra digits-only e exigem 10-11
  dígitos (DDD+número · 55 na frente é removido), com grandfathering do
  legado (valor idêntico ao armazenado passa — senão telefone antigo inválido
  travaria qualquer edição). Contrato de porta aplicado ao canal que deixou o
  número corrompido entrar.

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

## Devocionais · KPIs/OKR do app + histórico na Membresia (2026-06-12)

O devocional está NO AR via app (check-in grava `mem_devocionais` · 1 linha
por membro/dia). Esta leva liga a medição e dá visibilidade por pessoa:

- **KPIs DEV-01/02/03** (migration `20260612150000`): check-ins/mês, pessoas
  fazendo devocional/mês, famílias com devocional familiar/mês. Área `sede`
  (= igreja toda · devocional NÃO tem dimensão de área de culto — KRs filhos
  por área seguem sem fonte), `valores=['investir']`, objetivo `576c04ec`
  ("Aumentar Pessoas fazendo Devocionais"), `tipo_calculo='manual'` +
  coletores JS `devocionais.checkins`/`devocionais.pessoas` (novos ·
  `devocionais.familias` já existia — KID-04 segue dormente/inativo). Cron
  diário `0 7` já coleta (fonte_auto setado · sem mudança no vercel.json).
  **meta_valor=NULL** nos volumes (app novo, sem baseline 2025 · view trata
  como `sem_meta`, sem vermelho falso) — Marcos define meta no /gestao.
- **OKR ligado (padrão B1)**: KR geral "Crescimento >=50% no nº de
  devocionais/mes" ganhou `fonte_kpi_id='DEV-01'` → /gestao mostra realizado.
  KR de famílias (">=25% das famílias do CBKids") segue SEM fonte: o check-in
  do app é `tipo='pessoal'` (sem captura de devocional familiar ainda).
- **Aba "KPIs e OKR" no DevocionalAdmin** (dentro de Cuidados → Devocionais):
  `GET /devocionais/kpis` (paginado p/ cap 1000) → cards do mês em tempo
  real, série diária 30d, evolução mensal 6m, KPIs DEV-* com status da
  `vw_kpi_trajetoria_atual` e KRs do objetivo com realizado.
- **Membresia · aba "Devocional" no detalhe do membro**: histórico de
  check-ins do app por pessoa (sequência de dias, nº no mês, total, lista com
  título/passagem do plano). `GET /devocionais/membro/:id` ganhou join de
  `devocional_itens` + `resumo {total, streak, no_mes}`.
- **UX do detalhe do membro**: as abas de categoria não rolam mais na
  horizontal — `TabsList` virou `flex flex-wrap` (todas visíveis, quebram em
  2 linhas no mobile). Reclamação do Marcos: "arrastar pro lado é muito ruim".
- ⚠️ Pós-migration: rodar `POST /api/kpis/v2/coletar` body
  `{"fontes":["devocionais."]}` (ou esperar o cron diário) pra popular os
  primeiros registros.

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

## Logística · aba Solicitações removida + fix de corte nos modais (2026-06-25)

Amaury reportou o **modal de Solicitações cortando** a visualização e Marcos
pediu pra **tirar a aba "Solicitações" de dentro de `/admin/logistica`** (o
fluxo vive só em `/solicitacoes`). PR `claude/logistica-remove-solic-modal-fix`:
- **Logística** (`Logistica.jsx`): removida a aba "Solicitações" (era índice 8)
  — import, entrada do `TABS`, render `{tab === 8 && <LogisticaSolicitacoes/>}`
  e o componente órfão `LogisticaSolicitacoes.jsx` (deletado · só era usado
  aqui). ⚠️ Histórico que confunde: a aba foi removida em 19/05, **reintroduzida**
  depois junto com Compras/Estoque, e agora saiu em definitivo. As demais abas
  (Dashboard/Fornecedores/Pedidos/Notas/Compras/Compras ML/Rastreio/Estoque ·
  índices 0-7) não mudaram. Backend e `api.js` de compras intactos.
- **Modais de `/solicitacoes`** (`Solicitacoes.jsx` · `DetailDialog` + "Nova
  Solicitação"): o `DialogContent` usava `max-h-[90vh] overflow-y-auto` sobre o
  `grid` do shadcn — conteúdo alto **cortava** em vez de rolar. Padrão correto e
  reusável: `DialogContent` vira `flex flex-col` (sem `overflow`) e o corpo
  ganha `flex-1 overflow-y-auto min-h-0` (header pinado, corpo rola). ⚠️ Ao criar
  modal com conteúdo potencialmente alto, usar SEMPRE esse padrão — NUNCA
  `overflow-y-auto` no container grid; `min-h-0` no corpo flex é obrigatório
  (sem ele o filho não encolhe abaixo do conteúdo e o corte volta).

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

## Cuidados · Caixa de entrada (intake de pedidos) (2026-07-22)

A aba **"Aconselhamento" virou "Caixa de entrada"**: fila única de triagem de
todo pedido de cuidado (aconselhamento, capelania, oração, SOS, visita), no
estilo da caixa de entrada do Grupos. Ponte com a trilha: ao **Atender**, o líder
escolhe o TIPO de atendimento/visita → cria o atendimento na trilha da pessoa
(aba Visitas e Atendimentos).
- **Migration `20260722190000`**: tabela **canônica `cui_pedidos`** (canal
  app|whatsapp|plataforma|manual · tipo aconselhamento|capelania|oracao|sos|visita|
  outro · status pendente|em_andamento|concluido · membro/nome/telefone/email ·
  mensagem · atribuido_a · `origem_ref` · `atendimento_ref`) + RLS módulo cuidados.
  Soft-delete via UPDATE `deleted_at` (padrão do módulo · sem whitelist).
- **Contrato** = `backend/services/cuidadosPedidos.js` `registrarPedidoCuidado({canal,
  tipo,membro_id,nome,telefone,email,mensagem,origem_ref})` — **alvo único pro
  WhatsApp do Matheus e pra plataforma/app** plugarem (normaliza telefone/e-mail +
  notifica). O canal `app` já entra por `app_inscricoes` (a Caixa lê de lá também
  via `/pedidos-app`) — não precisa chamar o contrato. ⚠️ Ligar o canal WhatsApp em
  si é do lado do Matheus (ele chama `registrarPedidoCuidado`) — alinhar a forma
  com ele; o resto funciona sem depender disso.
- **Multi-fonte por decisão** (não trigger-espelho): a Caixa lê `cui_pedidos`
  (whatsapp/plataforma/manual) + `app_inscricoes` (canal app · endpoints
  `/pedidos-app` já existentes) e mescla numa fila só. `cui_pedidos` é a canônica
  pros canais novos; o app segue na sua tabela (fluxo/push intactos). Consolidar o
  app em `cui_pedidos` por trigger fica pra uma futura, se quisermos tabela física
  única.
- **Backend** (`routes/cuidados.js`): `GET /cuidados/pedidos` (fila cui_pedidos +
  nome de quem atribuiu) · `POST /cuidados/pedidos` (manual) · `PATCH
  /cuidados/pedidos/:id` (status/atribuir) · `DELETE` (soft) · **`POST
  /cuidados/pedidos/atender`** (`{fonte:'cui'|'app', id, atendimento:{tipo,...}}` →
  roteia por tipo: aconselhamento/capelania → `cui_acompanhamentos` (mantém os KPIs
  de capelania/aconselhamento) · demais → `cui_visitas` · marca o pedido
  em_andamento + guarda `atendimento_ref`). `/pedidos-app` (canal app) intocado.
- **Frontend** (`Cuidados.tsx`): `CaixaEntrada` (filtros canal/tipo/status + busca ·
  cards de pedido com telefone + botão **"Conversas"** (link `hrefConversa` → o pastor
  vê/responde no módulo Conversas, NÃO gerencia aqui) · status inline · "Atender" ·
  "Registrar pedido" manual) + `AtenderPedidoModal` + `RegistrarPedidoModal`. Badge de
  pendentes na aba. `api.js`: `cuidados.pedidos.{list,create,update,remove,atender}`.
  ⚠️ **Insights de oração + config de WhatsApp SAÍRAM da Caixa de entrada (2026-07-22)** —
  aquele bloco `<details>` (OracaoPanel + WhatsappAutoConfig) foi removido: gerenciamento
  de WhatsApp é do módulo de WhatsApp/Conversas (do Matheus). Cada pedido tem só o link
  pro Conversas. Componentes `OracaoPanel`/`WhatsappAutoConfig` seguem no repo (usados
  em outro lugar), só não são mais montados no Cuidados.
- **`AcompanhamentoModal` ficou dormente** (sem render) — criar aconselhamento/
  capelania novo agora é pelo fluxo "Atender" (ou registrar pedido manual + atender).
  A tabela `cui_acompanhamentos` segue viva (KPIs + trilha).
- ⚠️ Aplicar a migration `20260722190000` antes do merge.

## Cuidados · trilha por pessoa na aba "Visitas e Atendimentos" (2026-07-22)

Parte do redesenho do Cuidados (aprovado pelo Marcos). A aba deixou de ser uma
lista solta de atendimentos independentes e virou uma **trilha por PESSOA**: o
histórico de cada pessoa vira um fio contínuo, com **comentários por atendimento**.
- **Migration `20260722180000`**: `cui_atendimento_comentarios` (comentário
  polimórfico · `ref_tipo` visita|acompanhamento + `ref_id`) + RLS módulo cuidados +
  service_role. Soft-delete via UPDATE `deleted_at` no backend (mesmo padrão do
  `cui_visitas` · não usa `app_soft_delete`/whitelist).
- **A trilha JUNTA na leitura `cui_visitas` (visitas/atendimentos) +
  `cui_acompanhamentos` (aconselhamento/capelania)** — decisão consciente de **NÃO
  migrar/mexer no `cui_acompanhamentos`**: ele alimenta 6 leitores (KPIs de
  capelania/aconselhamento em `kpiAutoCollector`, `painel.js`, `notificacaoGenerator`,
  `agentContext`, `cerebroSync`, `lgpd`). Unificar por leitura preserva os KPIs e evita
  a armadilha "não é swap de 1 linha".
- **Âncora da pessoa** (chave): `membro_id` > telefone (só dígitos, ≥10) > nome
  normalizado (sem acento/caixa). Contrato de porta.
- **Backend** (`routes/cuidados.js`): `GET /cuidados/trilha` (pessoas agrupadas ·
  cada uma com `atendimentos[]` já ordenados + `comentarios_count`; helper
  `carregarAtendimentosTrilha` + `_fetchTudoCui` paginado p/ o cap de 1000) ·
  `GET/POST /cuidados/atendimentos/:refTipo/:refId/comentarios` ·
  `DELETE /cuidados/atendimento-comentarios/:id`.
- **Filtros da aba (2026-07-22 · client-side, sem backend/migration):** `TrilhaPessoas`
  tem filtros por **tipo**, **status**, **quem atendeu** (`responsavel`) e **período**
  (De/Até por `data` do atendimento). As opções de tipo/status/responsável são
  derivadas dos atendimentos JÁ carregados por `trilha()` (distinct no `useMemo`), então
  não precisou de endpoint novo. Regra de match: a pessoa aparece se tiver **≥1
  atendimento** que casa TODOS os filtros ativos (busca por nome/telefone continua no
  nível da pessoa). Botão "Limpar filtros" some quando nada está ativo. O
  `TrilhaPessoaDialog` segue mostrando o histórico completo da pessoa (filtro serve pra
  ACHAR, não pra recortar a timeline).
- **Frontend** (`Cuidados.tsx`): `TrilhaPessoas` (cards de pessoa · busca · filtros · paginação)
  → `TrilhaPessoaDialog` (timeline) → `ComentariosAtendimento` (lazy). "Registrar
  atendimento" reusa o `VisitaModal` (cui_visitas); editar/prefill por pessoa idem.
  Capelania só é EXIBIDA na trilha (vem de `cui_acompanhamentos`) — criar capelania/
  aconselhamento novo segue na aba Aconselhamento (até a Caixa de entrada ligar a
  ponte "atender → cria atendimento na trilha", próxima PR). `api.js`:
  `cuidados.trilha()` + `cuidados.atendimentoComentarios.{list,create,remove}`.
- ⚠️ Aplicar a migration `20260722180000` antes do merge.

## Cuidados · responsáveis do atendimento gerenciáveis (2026-07-21)

Pedido do Marcos: a lista de responsáveis da aba **Próximos passos** do
`/ministerial/cuidados` (quem atende os convertidos) deixou de ser constante no
front (`RESPONSAVEIS_ATENDIMENTO`/`RESPONSAVEIS_ANTIGOS` em `Cuidados.tsx`) e
virou a tabela **`cui_responsaveis`** (nome + ativo · migration
`20260721160000` · seed = 4 ativos + 13 antigos inativos · RLS padrão do
módulo). A própria equipe gerencia pelo botão **"Gerenciar responsáveis"**
(ao lado de "Novo convertido" · só `podeEditarCuidados`): modal com switch
disponível/indisponível + adicionar nome (nome repetido inativo é REATIVADO,
não duplica). **Excluir só quem NUNCA foi usado** (follow-up 2026-07-21 ·
lixeira no modal): o DELETE conta `cui_convertidos.responsavel_atendimento`
pelo nome (incluindo soft-deletados) e responde 409 orientando a desativar se
houver uso — hard delete ok (catálogo de config, não-PII, fora da whitelist).
**Renomear PROPAGA** (follow-up 2026-07-21 · lápis no modal): o PATCH aceita
`{nome}` e atualiza `cui_convertidos.responsavel_atendimento` em cascata
(incluindo soft-deletados · devolve `renomeados`; conflito com nome existente
→ 409 orientando consolidar; falha na propagação reverte o nome no catálogo).
O vínculo é por NOME (texto · essas pessoas não logam no sistema), então
inativar preserva o histórico: inativo aparece desabilitado no dropdown da
tabela (só exibível no registro que já o tem).
Backend: `GET/POST/PATCH/DELETE /cuidados/responsaveis` (leitura nível 1 ·
escrita/exclusão 3). Front: constantes viraram FALLBACK (se a API falhar, vale
a lista antiga). `api.js`: `cuidados.responsaveis.{list,create,update,remove}`.
**Dedup dos nomes da planilha antiga** (migration `20260721190000` · pedido do
Marcos 2026-07-21): `cui_convertidos.responsavel_atendimento` consolidado —
Kevin/Arthur + Arthur/Kevin → Arthur Cecconi · Naná → Natasha · Mari → Mariane ·
Carmet/Arthur → Carmet — e os 5 nomes duplicados removidos de
`cui_responsaveis` (com guarda: só sai quem ficou sem registro). Fallback do
front espelha o pós-dedup (8 antigos).

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

# Estado atual dos módulos (condensado · histórico completo em docs/CLAUDE-LEGADO.md)

## Bot WhatsApp · estado consolidado (2026-05-27 → 2026-06-09)

Número do bot: **21 99907-9031**. Webhook público `routes/publicWhatsapp.js`
(montado em `/api/whatsapp/webhook`, fora do publicLimiter): responde 200
imediato e processa async · HMAC fail-closed em prod (`WHATSAPP_APP_SECRET`) ·
dedup por `whatsapp_message_id` · cap 20 msgs/evento · toggle global
`whatsapp_config.ia_ativa`. Admin em `/admin/whatsapp` (abas Coletas, Líderes,
Configuração) · auth `authorizeModule('whatsapp-admin', 3)` = integracao OU
grupos ≥3. **Nada é aplicado automaticamente** — toda coleta vira `parseado` e
espera o coordenador aplicar (review-before-apply).

- **Tabelas**: `whatsapp_lideres` (telefone E.164 → profile + `escopo[]`
  grupos/integracao + `papel` display), `whatsapp_coletas` (raw + `parsed`
  jsonb + status recebido→parseado→aplicado/rejeitado/ignorado/aguardando_info),
  `whatsapp_config` (singleton · `ia_ativa` + `institucional` jsonb).
- **2 personas** (`services/whatsappParser.js` · Claude Haiku): número
  desconhecido → assistente INSTITUCIONAL (só conteúdo de `whatsapp_config` ·
  não coleta); líder → coleta multi-turno (sessão `aguardando_info` por 7 dias ·
  `JANELA_CONVERSA_MIN`). FAQ institucional por palavra-chave responde sem LLM;
  Haiku só entra em texto livre com números ou pergunta fora do padrão.
- **Coleta por formulário (WhatsApp Flows)** — caminho principal do líder de
  integração: 1 Flow **culto** (3 telas · frequência → decisões → qual culto,
  cultos pré-carregados, navegação local). O Flow **pessoa** foi REMOVIDO no
  redesenho de 2026-06-09 (cadastro nominal é no desktop · aba Decisões→Pessoas);
  `parsed.a_cadastrar` guarda o nº de decisões a cadastrar.
  `flowsConfigurados()` exige só `WHATSAPP_FLOW_CULTO_ID`. Estado vive em
  `whatsapp_coletas.parsed` (`fonte:'flow'`) · sem migration. `flow_token`
  correlaciona a resposta (`nfm_reply`). Roteamento `pedeFormulario` é
  heurístico sem LLM: líder sem números soltos → oferece o formulário na hora;
  só-grupos → orientação por texto (grupos não tem formulário · encontro exige
  lista nominal).
- **Aplicar coleta**: integração cria `cultos_dados_submissoes` pendente (fila
  `/integracao?tab=pendentes`); flow usa `aplicarColetaFlow` (cria submissões
  templo/kids; decisões online vão na observação); grupos só marca aplicado.
- **Envs (Vercel)**: `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_ACCESS_TOKEN`,
  `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_APP_SECRET`, `WHATSAPP_FLOW_CULTO_ID`,
  `WHATSAPP_FLOW_MODE=draft` (remover quando o app Meta for Live),
  `WHATSAPP_BUSINESS_ACCOUNT_ID` (só script de publish). Flow id (draft):
  culto `1163668689265932`. `services/whatsappService.js` é OUTRO componente
  (templates transacionais) · não é o webhook.
- Estado do bloqueio Meta + passos de ativação: ver a seção "Bot WhatsApp ·
  Flows — REDESENHO" acima. Diários das PRs anteriores: legado.

## Marketing · estado final (specs maio + redesenho 2026-05-30/31 · NO AR)

O módulo nasceu em 24 specs (maio/2026) como "balcão" e foi **redesenhado** pra
"mesa de comando do Pedro" (sistema assiste, não decide). Diário completo das
specs e fases no legado. Estado vigente:

- **Fluxo**: solicitante pede por **DOR** em `/solicitacoes` (categoria
  marketing · sem tipo/estimativa no intake) → diretor de origem aprova → vira
  **campanha em `triagem`** (`marketing_campanhas` · trigger
  `fn_marketing_cards_solicitacao_sync`) → Pedro define solução e cria os
  **entregáveis** (cards · dono + início/fim + paralela/foco) → produção →
  revisão → **aprovação da DEMANDA COMPLETA** pelo solicitante
  (`POST /campanhas/:id/aprovar` · revisão 1x via `/revisar`) → NPS.
  "Tudo é campanha" (1 peça = campanha de 1 entregável).
- **Nav final: Kanban · Planner · Analytics · Admin** (+ toggle Quadro/Épicos).
  Kanban com 6 colunas (triagem/backlog/pesquisa/producao/revisao/concluido ·
  CHECK ainda aceita os legados fila/em_producao/aguardando_solicitante — o
  Select normaliza); coluna Triagem lista campanhas (`MarketingTriagemSheet`).
  Épicos = campanhas/eventos expansíveis com subdemandas (cards reais) + %.
  Telas órfãs (Triagem/Fila/Calendario/CicloCriativo standalone) deletadas.
- **Capacidade em SLOTS/DIA** (não horas): `marketing_membros.slots_dia`
  (default 3) · só dias úteis seg–sex · paralela conta 1/dia, foco enche o dia ·
  Pedro (`habilidade='coordenador'`) fica FORA das raias e do DEM-CAP.
  Planner Gantt mensal arrastável (`/marketing/planner` · HTML5 drag).
- **2 prazos**: entrega ao solicitante (campanha · `prazo_entrega`) × produção
  interna (card · `prazo_producao`/`data_fim`). Mudança de prazo notifica o
  solicitante.
- **Etiquetas**: 16 entregas concretas com `esforco_max_h` (SLA acordado, não
  média) + coluna `grupo` (rede_social/video_foto/artes); eixo destino =
  etiqueta interna do Pedro. Badge de SLA individual no card em produção.
- **Cards de evento**: `cycle_phase_tasks` com `area='marketing'` materializa
  card espelho (trigger `fn_marketing_cards_cycle_phase_sync` · estado sincroniza
  do Eventos; atribuição/etiqueta são locais do Marketing) + padrões por
  (categoria × fase) em `marketing_ciclo_padroes`.
- **Entregáveis** via SharePoint/Graph (`services/sharepointMarketing.js` ·
  biblioteca Criativo · `tipo='referencia'` pra inputs) + checklist por card.
- **KPIs**: MKT-PRAZO / MKT-LEAD / MKT-THROUGHPUT / MKT-DEM-CAP (semanais ·
  DEM-CAP em slots). `fn_marketing_estimar_prazo` e `/estimar` @deprecated;
  `fn_marketing_calcular_capacidade_semana` antiga DROPADA (20260531120000).
- **Permissões**: boost por área Marketing → equipe nível 5; diretores nível 1
  read. Solicitante acompanha por `MarketingCampanhaBlock` em `/solicitacoes`
  (busca campanha por `solicitacao_id` + entregáveis por `campanha_id` —
  lição: cards triados não têm `solicitacao_id`).
- **Resta (menor)**: reordenar-arrastando vertical no Kanban; Analytics vazio
  até juntar histórico.

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

## NPS · pesquisas de satisfação (estado consolidado · 2026-07-04)

Módulo `/nps` (`src/pages/Nps.jsx` + `src/components/nps/NpsForm.jsx` +
`backend/routes/nps.js` · resposta pública em `publicNps.js` ·
`/nps/publica/:token`). Pesquisa = `nps_pesquisas` (coluna `perguntas` jsonb:
`{descricao_curta, pergunta_nps, perguntas_extras[]}` · tipos que o NpsForm
renderiza: `secao` (cabeçalho, sem resposta), `texto_curto`, `texto_longo`,
`escala_5` (number 1-5), `sim_nao` ('Sim'/'Não'), `opcao_unica` e `multipla`
(usam `opcoes: string[]` · múltipla responde array). Resposta = `nps_respostas`:
`score` 0-10 (a métrica, sempre existe) + `respostas` jsonb keyed pelo id da
pergunta + `comentario`. Stats de score na view `vw_nps_pesquisa_stats`.

- **Detalhe da pesquisa · 4 abas**: **Resumo** (default · PR #1530 · relatório
  estatístico determinístico estilo Google Forms — histograma 0-10 com faixa
  detratores/neutros/promotores, média + distribuição por pergunta, barras por
  opção **semeadas com `opcoes[]` ∪ valores observados** fora do catálogo,
  textos/comentários em lista rolável, respostas por dia · agregação
  client-side em `computarResumo` sobre as respostas que o modal já carrega) ·
  Respostas (individuais) · Perguntas · **Análise IA** (qualitativo sob
  demanda: temas/sentimento/ações · rate limit 30/h). Divisão de trabalho
  (decisão do Marcos): **números por aritmética, IA só pro texto livre**.
- ⚠️ **Editor de pergunta preserva o objeto INTEIRO** (lição do bug
  #1488→#1495: um editor que reduzia cada pergunta a `{id,tipo,texto}` apagou
  `opcoes[]` de perguntas já respondidas — irrecuperável). Nunca reduzir a
  subset de campos; manter o id (respostas ligam por id); só descartar linha
  realmente vazia.
- **Leitura de respostas é PAGINADA** (`listarRespostasCompletas` em `nps.js` ·
  PR #1530): o PostgREST capa em 1000 linhas e um culto de domingo já rende
  ~700 respostas — sem o loop, a lista, o Resumo e a análise IA truncavam em
  silêncio. Não regredir pra select único.
- **Permissão** (#1483): cargos `coordenador-ami/kids/bridge/online` têm nps=3
  → list/create/edit/analisar/respostas escopados pela área (`podeNaArea`);
  admin/diretor veem tudo. `GET /:id` fica **aberto de propósito** (fluxo de
  responder de qualquer colaborador); o dado sensível vive em `/:id/respostas`.
- **Pico/público**: o caminho público aguenta multidão no WiFi da igreja
  (1 IP só · subsolo sem 4G): `trust proxy` + limiter dedicado 10000/15min +
  bypass no Vercel Firewall (rule "NPS público") + retry com backoff no api.js
  + fila offline em localStorage com sendBeacon (PRs #1503/#1506/#1509/#1510).
  ⚠️ Testar com curl em rajada re-flaga o IP no challenge do Vercel — validação
  fiel só com celulares reais.
- **KPI**: resposta sincroniza `dados_brutos` via `services/npsKpiSync.js`
  (#1522 · upsert com contexto estável `{pesquisa_id}` · pesquisa arquivada
  remove a linha) → alimenta os tipos `nps_*` e os KPIs ligados.

## Monitoramento OKR · aba /monitoramento-okr (2026-06-02/03)

Reproduz a planilha "CBRio_cabeca_Juninho" (1 NSM → 9 OKRs em 3 blocos:
Ministerial · Criativo · Operações). **Decisão do Marcos: NÃO integrar à lógica
dos 25 OKRs/150 KPIs do `/painel`** — é ótica paralela, só exibir. Estrutura
fixa vive no frontend (`MonitoramentoOkr.jsx` · consts `NSM`/`BLOCOS`); o
backend devolve só valores vivos via `supabase.rpc('fn_monitoramento_okr_raw')`
(1 query JSONB · cache 5 min). Distinção de exibição pedida pelo Marcos:
**número (incl. 0)** = o sistema já mede · **"—" + bloco "preciso de"** =
automação a criar (NPS culto, YouTube, Q12, treinamentos, expansão…).
`online_engajamento` (tabela mensal) deixou a estrutura pronta pros 3 táticos
de YouTube — a API NÃO foi ligada (coletor futuro faz UPSERT por mês).
⚠️ Base dos % = membros ativos (provisório · confirmar "total da igreja" quando
grupos/voluntários/dízimos popularem). Histórico de versões v1→v3 no legado.

## Produção de Culto · /producao (2026-06-02 · cronograma 2026-06-16 · preview por culto + gráfico no Detalhado 2026-06-25)

Módulo `producao` (matriz copiada de kids · boost de área pro Pedro Fernandes).
KPIs técnicos POR CULTO em satélite 1:1 de `cultos` (`culto_producao` + log
unificado `culto_producao_ocorrencias` + checklist itemizado). Os 4 KPIs
`PROD-CULTO-*` são **específicos, não cascateiam** (`is_okr=false`,
`valores='{}'`, fora da matriz NSM) · ⚠️ `tipo_kpi` só aceita
`qualitativo|quantitativo|operacional`. SLA/NPS gerais já existiam
(`ADM-C-G/Q-PRODUCAO`). Categoria `producao` no form de Solicitações roteia
`area_responsavel='producao'`. **4 sub-abas** em `Producao.jsx`: Preenchimento ·
Detalhado · Modelos · Desempenho. (A aba "Solicitações" foi removida em #1364 — era só
um espelho filtrado do `/solicitacoes`; o Pedro usa o módulo Solicitações direto. Pra ele
ver a fila de Produção lá, a área **Produção** foi adicionada ao `/admin/solicitacoes-responsaveis`
(`AREAS` em `SolicitacoesResponsaveis.jsx`) e o Pedro Fernandes cadastrado em
`area_solicitacoes_responsaveis` (`area='producao'`) — a fila "Atender" filtra POR ESSA
tabela, não pelo cargo/boost; isso também faz a notificação de ocorrência crítica chegar nele.)

**Ocorrência → "Fazer solicitação" (2026-07-03 · ideia do Pedro Fernandes):** na
linha da ocorrência do `ModalProducao`, o link sublinhado **"Fazer solicitação"**
abre um modal (z 1100 · convenção modal-sobre-modal · ⚠️ os SelectContent do form usam z-[1200], senão o portal Radix z-50 abre ATRÁS do overlay e o dropdown "trava") com o `NovaSolicitacaoForm`
prefillado (contexto do culto + tipo/severidade/momento · categorias
`infraestrutura`/`ti`/`compras` **sem default — a pessoa escolhe ativamente**
quem resolve · urgente pré-marcado SÓ na severidade crítica, sempre desmarcável). Ao criar, `PATCH
/producao/ocorrencias/:id/solicitacao` grava
`culto_producao_ocorrencias.solicitacao_id` (migration `20260703150000` ·
**máx. 1 por ocorrência** · FK SET NULL · só vincula solicitação do próprio
usuário) e o link vira **chip com o status vivo** da solicitação (o GET
`/culto/:id` enriquece com `{status, titulo}`). O pedido segue o fluxo oficial
inteiro (aprovação de origem → área) — nenhum bypass.

**Cronograma por etapas (2026-06-16):** a equipe lança o tempo POR MOMENTO em
mm:ss; a soma dos executados da seção 'culto' é a duração total
(`culto_producao.duracao_minutos` segue derivada disso → KPI/trigger de
pontualidade intactos). `producao_roteiro_etapas` = roteiro/preview padrão por
tipo (aba Modelos · `service_type_id` NULL = geral · seed Música 1/2/3 +
Intercessão + Pregação + … = 60:00). `culto_producao_etapas` = etapas por culto
(pré-carregam do roteiro · `previsto_seg`/`executado_seg`/`secao` culto|pos_culto
+ atividades especiais ceia/batismo). A análise previsto×executado / estouro por
etapa é computada no `/acumulado` (NÃO mexe em `kpi_calcular_valor_auto`). ⚠️ **Culto com
executado 0 = NÃO preenchido** (teste/pendente) → fica de fora de TODAS as médias do Detalhado
(duração média, pontualidade, aderência, desvio, por-etapa, gráfico) via `cultoTemExec` +
`duracao_minutos/segundos > 0`. Senão um culto vazio (prev 60:00 / exec 0 = desvio −60:00) afunda
a média (bug pego 2026-06-26: a "Quarta teste" puxava o "Culto inteiro" pra −3:43 com 78% estourando).

**Aba Preenchimento · seletor Semana/Pendentes (2026-06-26 · só código, sem migration):**
`AbaSemana` tem um seletor **Semana | Pendentes** (estilo `vistaBtn` da aba Cultos da Integração ·
`CalendarioCultos.jsx`), com badge de contagem no Pendentes. **Semana** = o calendário de cultos.
**Pendentes** = 2 cards (`CardPendencia`): **Cultos pendentes** (vermelho) + **Cultos incompletos**
(âmbar), cada um listando os cultos no estilo `LinhaPendenciaProd` (bloco data + nome/hora + badge),
clicáveis → abrem o `ModalProducao` (mantido — é o modal de cronograma; NÃO trocar pelo `ModalCulto`
da Integração, que é de frequência/decisões). `GET /producao/pendencias` (varre 07/06→hoje, paginado)
classifica: **não preenchido** = `culto_producao.duracao_segundos` null/0 (nada lançado ou teste
zerado); **incompleto** = executado real mas ≥1 etapa com `executado_seg IS NULL`; **completo** =
todas lançadas. Recarrega ao salvar. `prodApi.pendencias()`. Cultos < 07/06 ficam fora (sem etapas).
Quando zero, mostra "✓ Tudo preenchido desde 07/06".

**Preview editável por culto + Louvor no Detalhado (2026-06-25 · só código, sem migration):**
- O `Previsto` de cada momento virou input mm:ss no modal de preenchimento
  (`EtapasEditor` · era um `<span>` travado no roteiro). O roteiro em Modelos
  segue como BASE/default; ajustar por culto só grava `culto_producao_etapas.previsto_seg`
  (já persistido pelo `PUT /culto/:id/etapas`) e flui automático pra "Prev.
  média"/"Aderência" do Detalhado. Atividade especial continua sem previsto (—).
- No `por_etapa` do `/acumulado`, as músicas NUMERADAS do louvor (nome casa
  `/^m[uú]sica\s*\d/i` → Música 1/2/3) colapsam num único momento **"Louvor"**:
  rollup por (culto × grupo) somando previsto+executado, depois média entre cultos
  (desvio = média de exec−prev por culto; % que estourou idem). Uma música maior
  compensa outra menor → sem falso "estourou" quando o tempo só se deslocou entre
  elas. **Só as numeradas** — "Música Dízimo"/"Música Ceia" são momentos próprios
  (atrelados a dízimo/ceia) e ficam separados. NÃO altera o tempo total nem os
  outros momentos. Agrupamento por nome (não por coluna) · decisão do Marcos (2026-06-25).

**Carga do cronograma real de 2026-06-07 (migration `20260625150000_producao_cronograma_07jun.sql`):**
Carrega as etapas dos 4 cultos de domingo 07/06 (08:30/10:00/11:30/19:00) da planilha
"Cronograma Culto 07.06.2026" (espelha a carga de 14/06). Casa o culto por
(`data` × `vol_service_types.recurrence_time`), REPLACE idempotente das etapas +
recomputa os totais do satélite `culto_producao`. Momentos reais incluem "Música
Dízimo"/"Música Ceia" (separados do Louvor pela regra acima) e "Intercessão"/"Avisos"
com executado 0 (feitos dentro da música / junto da generosidade). Carga só de dados ·
o código não depende dela. Aplicar no SQL Editor (RAISE NOTICE confirma os 4 cultos).

**Consolidação dos momentos do 07/06 (migration `20260626120000` · pedido do Marcos 2026-06-26):**
Os 4 cultos de 07/06 tinham os momentos "crus" da planilha; consolidados pra forma
canônica do roteiro (o 14/06 já estava assim via 20260616190000): Generosidade + Música
Dízimo → **"Dízimos e Ofertas"**, Vídeo Testemunho + Vídeo Pré-Pregação → **"Vídeo
Pré-Pregação"**, Avisos + Benção → **"Avisos / Benção"** (os três somando previsto +
executado), e Música Ceia → **"Ceia"** (`tipo='especial'`, `categoria_especial='ceia'`,
segue na seção 'culto' → entra no tempo total, como a "Apresentação de Criança" do 14/06).
**Totais do culto inalterados** (só junta linhas). REPLACE idempotente + recomputa o
satélite `culto_producao` (totais derivados das etapas).
- **Follow-up (`20260626130000`):** removida a **Intercessão** dos 4 cultos (ficava com
  executado 0:00 — a intercessão rolava DENTRO da Música 2). O previsto dela (3:00) foi
  **somado na Música 2** → previsto total do culto **inalterado** (~60min), corrige o falso
  "estouro" da música e o falso "-3:00" da intercessão. 10 → **9 momentos/culto**.

**Gráfico de tempo de culto + total do estouro no Detalhado (2026-06-25 · só código, sem migration):**
- O `/acumulado` ganhou 2 campos: `serie` (1 ponto por culto preenchido ·
  `{data, tipo, duracao_min, previsto_min}` ordenado por data) e `por_etapa_total`
  (resumo do culto INTEIRO: previsto/executado médios, desvio e % que estourou ·
  sobre os cultos com ambos lançados). NÃO mexe em `kpi_calcular_valor_auto`.
- A aba **Detalhado** (`Producao.jsx`) abre com um **gráfico de linhas** (recharts):
  **1 linha por tipo de culto** (Domingo 08:30/10:00/11:30/19:00, Quarta, AMI, Bridge),
  duração executada (min) ao longo do tempo — pivot por data (`linhasChart`/`tiposChart`,
  cada tipo vira uma coluna). Alvo 60 min via `ReferenceLine`; **eixo Y começa em 40**
  (`domain={[40,'auto']}`) pra destacar as variações; **cultos não preenchidos (0 min)
  ficam fora** (filtro `duracao_min > 0`). **Legenda clicável · multi-seleção** (`cultosSel`
  Set + `Legend onClick` toggle → `Line hide`): clicar 1 culto isola só ele, clicar outros
  soma à seleção, clicar de novo tira; Set vazio = todos (1ª seleção a partir do vazio = isolar). A tabela
  "Estouro por etapa" ganhou uma faixa-resumo do culto inteiro (`por_etapa_total`) no rodapé (abaixo da tabela). Recharts
  herda o tema vidro do `index.css`; linhas NÃO usam gradiente (regra da casa); cores em `CORES_CULTO`.
  (Ajustes 2026-06-25/26, pedidos do Marcos: era executado×previsto numa linha só → 1 linha
  por culto → eixo 40 + esconde não-preenchidos + legenda isola culto.)
- **Métricas do Detalhado (definições · NÃO confundir) + tooltips:** **Pontualidade** = % de
  cultos ≤ ALVO (`meta_duracao_min`, default 60) = "estourou o tempo?". **Aderência** = fidelidade
  ao PREVISTO (`100 − média(|exec−prev|/prev)`, desvio ABSOLUTO, relativo ao previsto de cada culto,
  NÃO a 60) = "executou perto do planejado?". Os cabeçalhos das tabelas do Detalhado têm `title`
  (tooltip nativo no hover · sublinhado pontilhado + cursor help) explicando cada coluna.

## Grupos · aba Relatórios de KPIs (2026-06-02)

Aba Relatórios em `/grupos` (estilo Integração): nº grupos/líderes, líderes em
treinamento (nominal), satisfação (`nps_lideres` em dados_brutos), frequência
(encontros+presenças). Agregação via RPC `fn_grupos_kpis_relatorio(temporada,
meses)` — RPC e não query porque encontros×presenças estouram o cap de 1000 do
PostgREST. **Modelo de líder**: líder = `mem_grupos.lider_id`; única outra
função relevante é `lider_treinamento` (toggle na coluna Treino · `PUT
/membros/:rowId/funcao` aceita grupos≥3). ⚠️ Rota `/kpis/...` declarada ANTES
de `/:id` no Express (senão `/kpis` casa como id). Abas de junho (Visitas,
Pessoas, Caixa de entrada) na seção própria no topo deste arquivo.

## Integração · ajustes pontuais (2026-06-02)

- **% ocupação de assentos** (aba Frequência): card com toggle Templo/Kids +
  seletor por culto. Capacidades constantes no código: Templo **1200** · Kids
  **250**. Templo = `presencial_adulto` de Domingo+Quarta+**AMI** (decisão do
  Marcos · exclui Bridge/Online por regex no nome). 100% client-side (reusa
  `cultos.list` da aba).
- **Tempo conversão→batismo** (aba Batismos): `mem_trilha_valores` etapa
  'conversao' × `batismo_inscricoes.data_batismo` · média geral (só realizados,
  ignora negativos) + bloco por membro no modal. Campos aditivos no
  `GET /batismos`.

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

## Next · renomear turma pelo lápis (2026-08-03 · SEM migration)

Pedido do Marcos: lápis pra mudar o nome de uma turma do Next. Edição inline no
título do modal da turma (`TurmaDetalheModal` em `NextTurmas.tsx`): lápis →
`Input` + Salvar/Cancelar (Enter salva · Esc cancela). Grava por
`nextApi.turmas.update(id, { nome })` — **o `PATCH /next/turmas/:id` já aceitava
`nome`** na whitelist `['nome','status','responsavel_id','observacoes']`; só não
havia caminho na UI (a tela nascia com o nome sugerido `nomeMesAtual()` e ele
ficava imutável). Sem backend, sem migration, sem endpoint novo.

- Atualização otimista do nome no `det` + `onChanged()` → o card da grade reflete
  na hora, sem refetch do detalhe inteiro.
- ⚠️ **O lápis fica SÓ no modal, não no card da grade**: o card é um `<button>`
  (abre o detalhe) e botão dentro de botão é HTML inválido — o clique no lápis
  seria capturado pelo card em parte dos navegadores.
- ⚠️ **Não mexe em `next_turmas.origem_mes`**, que é a chave real usada pela
  série derivada da view unificada (`serie_chave`/`edicao_rotulo`) e pelo
  `origem_mes_key` do espelho de matrícula. Renomear é rótulo de exibição; a
  identidade da turma segue sendo `origem_mes`. Não "melhorar" isso derivando
  `origem_mes` do nome novo — o UNIQUE dela quebraria as turmas "/02" do mesmo mês.
- Sem gate de permissão próprio, igual a Encerrar/Reabrir que já existiam ali (a
  rota é `authenticate` + `ModuleGuard` do módulo `next` na tela).

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

### Next · as 4 decisões do Marcos sobre o legado (2026-07-29/30)

Mandato dado por ele: *"o importante não é ter os dados certos de 2 anos atrás,
é a garantia de que daqui pra frente teremos dados sérios, corretos e
auditáveis; se um cadastro antigo atrapalhar, prefiro remover e me justificar
com a liderança — mas não quero um frankenstein, porque daqui a 5 anos isso dá
um problema que não é simples."* As decisões, caso a caso:

1. **Os 865 `formado` do backfill FICAM como formado** (277 deles sem nenhuma
   presença registrada). Decisão do Marcos: *"antes eles usavam folhas de papel
   e o controle era limitado"* — o status reflete o julgamento de quem conduzia
   o Next no papel; reescrever hoje trocaria um dado impreciso por outro. **NÃO
   reabrir sem ele.** Ressalva registrada: **maio/2026 não tem NENHUMA matrícula
   real fora do backfill**, então os KPIs NEXT-01/02/03 daquele mês (janela por
   `created_at`) são 100% roster de 2025. É um mês fechado e não se repete —
   decidimos NÃO reescrever `created_at` (destruiria o fato auditável "entrou no
   import de 13/05") nem criar coluna `matriculado_em` só por isso.
2. **A porta `next_legado` MORREU** (migration `20260730120000`): as 131
   aparições sem matrícula viraram matrícula (datadas no mês do ENCONTRO, não no
   dia do import; `formado` só onde há presença) e o ramo saiu da view. A view
   tem **9 fontes**, não 10. `next_inscricoes` não é porta de inscrição — é
   **presença por encontro**. Um modelo de inscrição (turma/matrícula), um de
   presença. Era essa competição entre as duas tabelas que era o frankenstein.
3. **Os 93 cadastros "vazios" do import NÃO foram apagados.** Marcos perguntou
   se valia deixá-los como "não sei" pra reconciliar caso a pessoa preencha um
   formulário no futuro. Vale — e não precisa de estado novo, porque **o matcher
   canônico filtra `deleted_at` e NUNCA `active`**: o cadastro fantasma com
   nome+telefone é reencontrado e ENRIQUECIDO no próximo formulário, em vez de
   nascer duplicado. ⚠️ **Soft-delete quebraria exatamente isso** (o matcher
   pula deletado → nasce cadastro novo e o rastro fica órfão). Além disso: dos
   93, a `duplicidadePolicy` aceita **27 pares** — vários são o fantasma
   duplicando um membro REAL, ou seja, a fila das Entradas está apontando
   trabalho útil de consolidação, não ruído. A origem já é auditável
   (`mem_identidade_observacoes`).
4. **A FK que faltava** (a causa-raiz, virou lei nº 10 das regras de segurança):
   os 58 órfãos existiam porque `next_inscricoes`/`next_matriculas` tinham
   `membro_id` **sem FOREIGN KEY**, e `merge_membros` descobre os filhos pelo
   catálogo. Os 58 foram reconstruídos pelo `mem_merge_log` (seguindo cadeia de
   fusão; redundante vira soft-delete) e as duas FKs entraram com
   `ON DELETE SET NULL`. Daqui pra frente toda fusão reponta sozinha.

⚠️ **Ponto cego consciente que sobrou**: o ramo `next` do
`fn_app_inscricoes_fanout` (rede de segurança pra builds ANTIGOS do app) insere
só em `next_inscricoes`, e com a porta retirada essa linha não aparece na view.
Volume real: 1 linha em 2 meses. Fecha quando o fanout puder ser reescrito sem
reverter o patch dinâmico de `20260729060000`.

⚠️ **Observação de escala pra investigar depois**: `mem_membros` viva está com
**7.487 linhas, todas `active=true`** — a auditoria de junho documentava 3.665.
O crescimento vem de imports (Next 682, "Contribuinte NNN" do financeiro, Kids)
e merece uma varredura própria: hoje "membro" e "nome que passou por uma porta"
contam igual no mesmo número.

## Catálogo de portas · escritor tem que ser tabela real (2026-07-30)

Follow-up da auditoria do módulo de inscrições. Três correções em
`inscricaoPortas.js` — o registro **descreve** as portas, e descrição errada
manda quem audita procurar no lugar errado:

- **`escritor` (string) virou `escritores` (array)**: a porta de apresentação
  tem DOIS escritores (`apresentacao_criancas` no formulário público ·
  `apresentacao_bebes` no totem) e declarava um só — e declarava
  **`kids_apresentacao_inscricoes`, tabela que nunca existiu**. Ninguém consome
  o campo em runtime, então a mentira vivia sem quebrar teste nenhum. A de
  eventos passou a listar `['inscricoes', 'ext_inscricoes']` (o fallback de
  rollback do Celebra fica explícito na tabela, não numa string sintética).
- **Teste novo bloqueia a reincidência**: todo nome em `escritores` precisa ter
  um `CREATE TABLE` em `supabase/migrations`. Checagem **estática** (o CI não
  tem banco) e mutation-testada — reintroduzir o fantasma falha com
  `escritor "kids_apresentacao_inscricoes" não é tabela criada por migration
  nenhuma`.
- **`escritoresDerivados` no Next**: o direcionamento do fim do encontro
  (`/next/direcionar/:token`) é o **único** caminho em que uma porta escreve na
  tabela de OUTRAS (`vol_inscricoes`, `batismo_inscricoes`,
  `jornada_encaminhamentos`). Quem perguntasse "quem escreve em
  `vol_inscricoes`?" achava só o formulário de voluntariado e concluía errado.
- Junto: `publicBatismo` e `publicApresentacao` passaram a importar
  `emailValido` do contrato (as 2 últimas cópias locais). Regex **idêntica** ao
  canônico → zero-diff conferido em 20 casos; o `.trim()` do batismo ficou
  (sem ele, e-mail com espaço nas pontas passaria a ser recusado, mudando
  comportamento).

⚠️ **O que NÃO foi feito, e por quê** (era premissa minha errada): eu havia
listado "colocar `/next/direcionar/:token` sob o Contrato de porta". Lendo o
código, **ele já está**: não coleta dado de pessoa nenhum (lê a matrícula, que
passou pelo contrato) e resolve identidade pelo matcher canônico
(`acharOuCriarGuardado`, `origem: 'next_direcionamento'`), que registra a
observação sozinho. Mesma coisa no walk-in do totem
(`/checkin/:token/walkin`, `origem: 'next_checkin'`) — normaliza, valida DV
quando há CPF, e a obrigatoriedade relaxada é decisão registrada do Marcos
("nunca travar o atendimento na hora"). **Fica UMA pergunta aberta pra ele:** a
tela de direcionamento cria inscrição REAL no voluntariado sem exibir/registrar
o consentimento daquela porta em `inscricao_consentimentos`. A pessoa está ali
tocando o tablet (é self-service, não o líder decidindo), então dá pra registrar
com honestidade — mas exige mostrar o texto no fim do encontro, com fila. Não
inventei o registro: gravar consentimento sem ter exibido o texto seria fabricar
prova legal.

## ⚠️ Pessoa · o import financeiro não cria mais cadastro (2026-07-30)

Decisão do Marcos, na varredura do crescimento de `mem_membros` (7.487 linhas
vivas contra 3.665 na auditoria de junho): *"essas pessoas não podem virar
membro, vai confundir a base inteira, deixa só como um nome no lançamento sem
vínculo com membresia"*. Migration `20260730150000`.

**O que acontecia**: `fin_resolver_ou_criar_contribuinte` resolvia a pessoa por
**nome exato** e, não achando, CRIAVA um `mem_membros` `contribuinte_avulso`. Em
29/07 às 16:16 isso gerou **3.441 cadastros** — 46% da base viva — dos quais 1
tem CPF, 1 telefone, 1 e-mail, e **nenhum** tem contribuição ou transação
apontando pra ele. Um deles é `RECEBIMENTOS CRECHE E PRE-ESCOLA … LTDA`:
descrição de extrato bancário virou pessoa. A fila de duplicidades das Entradas
foi de ~525 para ~9.458 pares, 9.294 deles **sem chave nenhuma** — humanamente
indecidíveis.

- **A função só resolve por CPF de 11 dígitos; sem CPF devolve `NULL`.** O match
  por nome exato SAIU — era ele que cruzava identidades, e viola a lei do
  Contrato de porta ("nome sozinho nunca identifica").
- **Devolver NULL é seguro** porque `financeiroV2.js:808` (o ÚNICO chamador)
  grava em `fin_transacoes`, cujo `membro_id` é **nullable** e que já guarda
  `nome_contraparte`. `mem_contribuicoes` (`membro_id NOT NULL`) **não é escrita
  por esse caminho** — conferir isso antes de mexer.
- **Limpeza descobre o rastro pelo CATÁLOGO** (toda tabela com FK pra
  `mem_membros`), não por lista fixa, **com as tabelas de log/identidade
  explicitamente FORA** (`mem_identidade_observacoes`, `mem_identidade_pares`,
  `mem_duplicados_ignorados`, `entradas_*`, `identidade_pendencias`,
  `mem_merge_log`, `app_audit_log`). Sem essa exclusão a limpeza não apagaria
  nada: as 3.443 observações de identidade contam como "rastro".
- ⚠️ **Isto NÃO revoga a decisão nº 3 do Next** (os 93 cadastros vazios do
  backfill ficam pra reconciliação). São casos diferentes: lá o fantasma tem
  nome+telefone REAIS de alguém que passou por uma porta e o matcher o
  reencontra; aqui é descrição de extrato sem contato nenhum, que só polui a
  fila humana. Régua: **existe chave (CPF/telefone/e-mail) pra reconciliar?**
  Se não, não é pessoa.

## ⚠️ Fila de identidade · a decisão é por PESSOA (2026-07-31 · migration 20260731120000)

Revisão adversarial das 5 PRs de 30–31/07, com os números reconferidos no banco.
Os três achados que viraram código:

**1 · A confirmação HUMANA da conciliação ainda fabricava cadastro.**
`financeiroClassificador.resolverMembroPorDocumento` tinha
`{ criarSemNome = true }` como padrão, e o único caller que não passava a opção
era justamente o clique de gente:
`conciliacaoBalancoOfx.confirmarVinculo` (`financeiroV2.js` POST
`/conciliacao-ofx/confirmar`). Memo sem nome parseável → `Contribuinte
070230...`, o MESMO fantasma que a limpeza de 30/07 apagou 93 vezes. O default
virou **false**: sem nome real o retorno é NULL e a confirmação responde
"cadastre a pessoa na Membresia com este CPF e volte" — ninguém precisa lembrar
de passar flag. ⚠️ Junto, a busca do dono do CPF ganhou **`deleted_at IS NULL`**:
84 dos contribuintes apagados TÊM CPF, e sem o filtro o extrato voltaria a ligar
lançamento novo num cadastro que a igreja tirou da base (foi assim que 4 linhas
de `fin_lancamentos_brutos`, R$ 1.107, ficaram penduradas em cadastro
soft-deletado).

**2 · A fila `inscricao_sem_vinculo` dedupava por CANDIDATO, e isso perdia
gente + rebaixava prova.** Ela reusou o UNIQUE histórico
`(tipo, membro_id, membro_conflito_id)`, correto pros 3 tipos antigos (a
pendência fala de um PAR DE CADASTROS) e errado pra este (fala de uma PESSOA
ÓRFÃ, que não tem cadastro, e duas pessoas órfãs podem apontar o mesmo
candidato). Medido: 195 pessoas com candidato → **190 candidatos distintos, 189
gravados**; as colapsadas **desapareciam da fila sem registro** e, nas 3
colisões abertas, quem sobrevivia era a evidência **mais fraca** (nome exato),
porque o critério era ordem de inserção. E o clique ligava **uma linha só**
(`origem_id` = `ref_id`) e resolvia a pendência: **18 pendências eram de gente
com 2+ inscrições → 20 linhas ficavam órfãs e SEM pendência nenhuma.**
- `origem_id` deste tipo passa a guardar a **CHAVE DA PESSOA**
  (`cpf:` > `tel:` > `nome:` > `ref:`), com UNIQUE parcial próprio
  `(tipo, origem_id)`; o UNIQUE histórico ganhou `AND tipo <> 'inscricao_sem_vinculo'`.
- A régua virou **fonte única** em `services/inscricaoOrfas.js` (`chavePessoa` +
  `PORTA_VINCULO` + `lerLinhasOrfas`), importada pelo script E pela rota — a
  cópia dentro do script era o que permitia a fila apontar pra linha diferente
  da que o clique liga. Teste `npm run test:inscricao-orfas` (no gate de deploy)
  exige que **toda fonte da view tenha ponteiro** e vice-versa: porta nova sem
  ponteiro = pendência que o humano decide e nada acontece. Mutation-testado.
- `ligar-inscricao` relê a view AGORA e liga **todas** as linhas da pessoa
  (`.is(col, null)` por linha, como antes), devolvendo
  `{ ligadas, portas, ja_ligadas, nao_mapeadas, cpf_tardio }`. Pendência do
  formato antigo (origem_id = uuid) segue funcionando — deploy em 2 etapas.
- ⚠️ **A observação de identidade gravava os dados do CANDIDATO**, o que não
  acrescenta chave nenhuma (era exatamente por não achar a pessoa que a
  inscrição estava órfã). Agora grava os dados **DA INSCRIÇÃO**, ACUMULA
  telefone/e-mail em `mem_contatos` (`membroMatch.registrarContatoDaPorta`, a
  MESMA função do match — exportada, não duplicada) e, quando a inscrição traz
  CPF e o cadastro não tem, consolida por `reconciliarCpfTardio` com
  `confianca: 'forte'` (decisão humana auditada em `resolvida_por`; conflito
  segue virando pendência, nunca fusão). É isso que faz a próxima porta
  encontrar a pessoa — sem isso, os 26 pares de nome fraco voltariam órfãos.
- **Pós-migration**: rodar `node backend/scripts/_entradas_inscricao_sem_vinculo.cjs`
  (dry-run) e depois `--exec`. Esperado ~195 pendências (as 5 pessoas colapsadas
  voltam). A PARTE 3 da migration **aborta** se alguma pendência deste tipo já
  tiver sido triada.

**3 · Números que não se sustentaram na reconferência** (registrados pra não
serem citados errado): a base viva de `mem_membros` é **3.930**, não ~4.018 — o
dia 30/07 fechou com **3.553** contribuintes soft-deletados, não 3.469, porque
houve **duas** limpezas (a migration às 13:50 + 93 registros `Contribuinte
NNNNNN...` COM CPF, do import de 24/07, às 13:37). E o split do Next é
**963 nível 2 / 641 nível 3**, não 1.109/495: o total de backfill (1.604) bate
exato, mas **34% da porta Next está em dia sintético**, não 26%. A régua do
nível 2 exige aparição **no mês da turma**; medir "aparição em qualquer mês" dá
990 e ainda não chega a 1.109.

**Alarmes reconferidos** (nenhum era falso): Celebra 29/08 tem 97 inscrições
confirmadas e **9 QRs emitidos** — e `checkin_ativo=false`, que a tela de
check-in já resolve com o botão "Ativar check-in" (1 clique no dia; o QR é HMAC
derivado, existe pra todos, e o check-in por busca de nome funciona sem ele).
`insc_checkins` está **vazia** e o evento Patrocinadores tem 0 QR: o ensaio de
#2175 não deixou artefato em prod. RLS: módulo `inscricoes` tem **37 dos 41
cargos no nível 3** (= 89 usuários com INSERT/UPDATE direto em `inscricoes`,
`insc_eventos`, `insc_pagamentos`, `insc_checkins`, `insc_sorteios`), incluindo
um cargo chamado **"Acesso negado"** — o seed subiu todo mundo pra 3. A view
unificada está revogada de `authenticated`; as tabelas-base não.

## ⚠️⚠️ AUDITORIA DO APP · ONDA 0 (2026-08-06 · migration `20260806140000`)

Auditoria de 4 dimensões pedida pelo Marcos ("procure erros de versão,
integração, código e escalabilidade — o app aguenta 4.000 downloads?"). 21
agentes, 85 achados brutos, **12 confirmados sob contestação adversarial**.
Relatório navegável em `~/Downloads/auditoria-app-cbrio.html`. O plano ficou em
**6 ondas agrupadas por VEÍCULO de entrega** (servidor chega na hora, inclusive
em bundle velho · OTA depende de 2 aberturas · loja depende da Apple) — esta
seção é a **Onda 0**, que é inteira servidor + 1 migration.

**A resposta à pergunta dele: não aguentava — e o gargalo não era o Supabase.**
Cold start do app = ~13 chamadas; 4.000 pessoas em 30 min = ~30 RPS sustentados
(picos 90-150), que o banco absorve. Quem quebrava primeiro era coisa nossa.

### 1 · ⚠️⚠️ LEI · o limite do `/api/app` é por USUÁRIO, não por IP

`/api/app` era a única superfície de multidão AINDA no teto global por IP
(500/15min): a lista de `skip()` do `server.js` já isentava NPS, grupos, evento,
membresia, generosidade, webhook de pagamento e totem — e o app tinha ficado
fora. Somava `limiterNormal` 100/15min compartilhado por ~45 rotas e
`limiterStrict` 10/15min nas portas de inscrição, **os dois por IP**. No WiFi da
igreja todo celular sai por 1 IP e UMA abertura gasta 10-30 requisições ⇒ 5 a 10
aparelhos esgotavam a cota de TODOS.

⚠️ **E o 429 não parecia limite de rede:** o app traduz a falha em resposta de
NEGÓCIO — `lib/temporadaGrupos.ts` → `aberta:false` ("inscrições fechadas") e
`lib/useAdminGrupo.ts` → `isAdmin:false` (líder sem botão de gerenciar). O teto
estourado se disfarçava de regra da igreja.

- **`backend/utils/appRateLimit.js`** = régua PURA da chave (em `utils/` pra
  entrar no gate): `u:<id>` do `req.user` → senão `t:<hash do Bearer>` → senão
  `ip:<...>`. O nível do token existe porque em `/membro/vincular` e
  `/inscricoes` o limiter vem ANTES do `authApp` na cadeia; sem ele, essas duas
  continuariam por IP (o furo, só que em 2 rotas). Hash pra não usar JWT como
  chave em memória, e **mínimo de 40 chars** — senão `Bearer x` de lixo viraria
  bucket próprio e qualquer cliente escaparia do teto anônimo.
- Tetos: **600/15min por usuário** (normal) · **30** (strict) · anônimo tem teto
  PRÓPRIO e mais alto (**10.000** normal · 120 strict), porque ali continua sendo
  1 IP pra congregação — é a calibragem já validada em multidão real do NPS e da
  membresia. Envs: `APP_RATE_LIMIT_MAX`, `APP_RATE_LIMIT_IP_MAX`,
  `APP_STRICT_RATE_LIMIT_MAX`, `APP_STRICT_RATE_LIMIT_IP_MAX`.
- ⚠️⚠️ **A normalização de IPv6 é NOSSA (`normalizarIpParaChave`, agrupa por /64)
  e não pode usar o `ipKeyGenerator` do pacote** — ver o incidente abaixo.
  Sem agrupar, trocar de endereço IPv6 dentro da própria casa daria bucket novo e
  o teto anônimo não valeria nada.

#### 🔴 INCIDENTE (mesmo dia, 15:38→16:0x) · `ipKeyGenerator is not a function`

A 1ª versão importava `const { ipKeyGenerator } = require('express-rate-limit')`.
Passou no gate inteiro, no `tsc`, no mutation test e num **smoke com express de
verdade** — e **quebrou em produção**: 500 em `/api/app/anuncios` e
`/api/app/grupos`, as duas rotas ANÔNIMAS (as únicas que chegam no ramo de IP).
As autenticadas seguiram respondendo 401/200, então o estrago quase passou
invisível.

⚠️⚠️ **A CAUSA (medida, e não a que eu supus primeiro): `backend/` tem árvore de
dependências PRÓPRIA em produção.** O `vercel.json` faz
`installCommand: "npm install && cd backend && npm install"`, e
`backend/package.json` pina **express-rate-limit `^7.4.0`** (lock **7.5.1**)
enquanto a RAIZ tem **8.3.2** — e `ipKeyGenerator` só existe na 8.x. Como o
`backend/node_modules` das worktrees costuma estar **vazio**, o Node sobe pra
raiz e o teste local exercita **uma versão que produção nunca carrega**.

⚠️ **RÉGUA QUE FICA (vale pra qualquer pacote): conferir a versão em
`backend/package.json`, nunca na raiz, antes de usar API nova de dependência em
`backend/`.** E, pra mudança de dependência que roda no servidor, o smoke tem que
rodar **de dentro de `backend/` com `npm install` feito lá** — foi assim que a
causa apareceu em 20 segundos depois de horas de hipótese errada.

⚠️ O mesmo smoke na 7.5.1 pegou um **segundo** defeito que eu ia enviar:
`validate: { keyGeneratorIpFallback: false }` só existe na 8.x e a 7.5.1 responde
`ERR_ERL_UNKNOWN_VALIDATION` a cada construção do limiter — log poluído, efeito
nenhum. Removido.

⚠️ Guarda no gate (`appRateLimit.test.ts`): nenhum dos 2 arquivos pode
desestruturar `require('express-rate-limit')` nem chamar `ipKeyGenerator(...)`
(mutation-testado), e um teste afirma que **o backend declara o pacote por conta
própria** — se alguém remover essa dependência e passar a depender da raiz, o
teste falha e a pessoa lê o porquê aqui.
⚠️ A guarda ignora COMENTÁRIOS antes de casar: a própria explicação do incidente
cita o import errado como exemplo, e sem isso a documentação derrubava o gate
(aconteceu).

#### ⚠️⚠️ RÉGUA · checagem por TEXTO em corpo de função/arquivo IGNORA comentário

Aconteceu **2× no mesmo dia (06/08)**, e nas duas o falso positivo foi a própria
documentação do conserto:

1. a guarda do `appRateLimit.test.ts` casou com o comentário que cita o import
   errado como exemplo do que NÃO fazer;
2. a conferência que eu deixei na migration `20260806140000` fazia
   `pg_get_functiondef(...) ilike '%is_membro_only%'` — e o `pg_get_functiondef`
   devolve o corpo **com os comentários**. Deu `mexe_no_profile = 1` numa função
   que **não escreve em `profiles`** (o único `update` do corpo é em
   `mem_membros`). O Marcos aplicou a migration e veio perguntar por que a
   conferência acusava falha: **era a conferência**, não a migration.

**Como fazer:** tirar comentário antes de casar
(`regexp_replace(d, '--[^\n]*', '', 'g')` no SQL · helper `semComentarios` no
teste) **e** procurar o COMANDO, não o identificador solto (`update
public.profiles`, não `is_membro_only`) — identificador aparece em explicação,
comando não. ⚠️ E conferência que dá falso positivo custa CONFIANÇA: manda a
pessoa investigar um conserto que estava certo.

- ⚠️ **Quem protege as sondas de identidade não é o teto por IP** — é o serviço
  (`appIdentidade`: 5 envios por telefone/dia, 6 tentativas de código, TTL 10min,
  resposta MASCARADA). Isso não mudou.
- ⚠️ **LIMITAÇÃO CONHECIDA**: MemoryStore por instância no Vercel ⇒ teto efetivo
  = `max × instâncias`, zerando a cada cold start. Store compartilhado (ou WAF) é
  onda de escala; o desenho por usuário já tira o dano do NAT, que era o real.
- Testes: `src/test/appRateLimit.test.ts` (10 casos) **mutation-testado** —
  voltar a contar por IP deixa 2 vermelhos. Smoke funcional rodado: 2 usuários no
  MESMO IP com cotas separadas, anônimo pagando o teto de IP, Bearer isolado.

### 2 · Fale Conosco do app era invisível no ERP (estrago ATIVO)

O app grava `criarInscricao('contato', …)` em `app_inscricoes` e promete "nossa
equipe vai te responder em breve". A **única** fila do ERP que lê essa tabela é
`GET /cuidados/pedidos-app`, cujo `TIPOS_PEDIDO_APP` era
`['aconselhamento','oracao','sos']` — `contato` ficava fora. Medido: **2
mensagens reais (02 e 03/08) pendentes até hoje**, sem tela pra ler, responder ou
marcar como tratada.

- `contato` entrou em `TIPOS_PEDIDO_APP` (a mesma constante gateia o GET e o
  PATCH, então listar e tratar vieram juntos).
- A notificação ia pro módulo **`membresia`** com link `/ministerial/membresia`,
  tela que NÃO lista `app_inscricoes` — a pessoa clicava e não achava a mensagem.
  Agora vai pro módulo **`cuidados`** com link `?tab=acomp` (a fila exige
  `cuidados >= 1`, então o destinatário do aviso tem que ser de lá). Se a
  secretaria precisar receber, o caminho é **regra de notificação** do módulo
  cuidados em /admin — não um 2º destino no código.
- ⚠️ `contato` **NÃO é tipo de `cui_pedidos`** (CHECK de lá:
  aconselhamento|capelania|oracao|sos|visita|outro). Por isso o front ganhou
  `TIPOS_PEDIDO_MANUAL` pro select de "Registrar pedido" e `PEDIDO_TIPO_META`
  (exibição + filtro) ficou MAIOR que ele: oferecer "Fale Conosco" no cadastro
  manual faria o insert violar o CHECK.
- `TIPO_ATEND_SUGERIDO.contato = 'outro'`, não `aconselhamento`: Fale Conosco
  pode ser dúvida ou elogio, e a maioria se resolve respondendo pelo Conversas e
  marcando tratada — sem criar atendimento pastoral que não aconteceu.

### 3 · O broadcast de push parava de entregar em 1.000 instalações

`app_push_tokens` era lido com `select` cru (`inscricoes.js` broadcast de evento
publicado) e com `.in()` da lista inteira (`services/appPush.js`). Duas
armadilhas silenciosas: o PostgREST **capa em 1000 linhas sem erro** (a partir de
~1.000 instalações, 3/4 da igreja deixaria de receber e nenhum log acusaria) e
`.in()` gigante estoura a URL, derrubando a query INTEIRA. Hoje são 29 tokens ⇒
**gatilho armado, não estrago consumado**. Corrigido com o `fetchAllRows` que já
existia (`utils/pagination.js`) + lotes de 200 no `.in()` (`membrosParaUsuarios`
e `pushExpoParaUsers`). Régua: **leitura de tabela que cresce com o uso vai
paginada, e `.in()` sempre em lotes ≤ 200.**

### 4 · ⚠️⚠️ A tela de perfil do app parou de VINCULAR pessoa (migration `20260806140000`)

Achado **crítico**, e o único em que alguém via dado de terceiro.
`app_salvar_membro` (SECURITY DEFINER, EXECUTE pra `authenticated`, chamada por
`app/(app)/perfil.tsx:184`) procurava `mem_membros` por **CPF ou telefone ou
`lower(btrim(nome))` EXATO** e vinculava a conta ao primeiro que achasse, **sem
prova de posse**. Como `profiles.membro_id` alimenta `current_user_membro_id()`,
quem digitasse o nome de um homônimo passava a ver grupo, comprovante de
contribuições e **filhos no Kids** daquela pessoa. É o MESMO furo que a
`20260806120000` fechou na porta da frente — esta lateral ficou aberta.

- **Estreitada, NÃO dropada**, e a ordem importa: `perfil.tsx` ainda a chama, e
  dropar/revogar antes do OTA do app deixaria a tela de perfil sem salvar. Ela
  perdeu os ramos de BUSCA e de CRIAÇÃO; segue salvando a ficha de quem já está
  vinculado. Sem `membro_id`, devolve `null` (o app trata: `if (vId) …`) e os
  campos de `profiles` seguem salvando, porque isso o cliente faz antes da RPC.
- **CPF só PREENCHE campo vazio e só com DV válido** (`fn_cpf_dv_valido`) — a
  versão antiga fazia `cpf = coalesce(v_cpf, cpf)` **sem DV**, e CPF torto em
  `mem_membros` envenena o matcher de TODAS as portas.
- ⚠️ **Deixou de tocar `profiles`**: a versão antiga fazia
  `set is_membro_only = true` pra QUALQUER chamador — inclusive **staff**, que
  saía marcado como app-only por ter salvo o perfil no celular.
- ⚠️ A migration tem **guarda de DRIFT**: aborta se houver mais de uma
  `app_salvar_membro` ou se a assinatura viva for diferente da esperada —
  `CREATE OR REPLACE` com assinatura diferente **cria overload** e deixaria a
  versão perigosa alcançável (lição do `feedback_pg_function_overload_default`).
- ⚠️ O arquivo `supabase/app_salvar_membro.sql` do **repo do app** foi
  sincronizado e marcado como cópia de leitura: arquivo desatualizado ali é o
  mecanismo exato que deixou o gatilho de `auth.users` 2 meses fora do git.
- **Quando o app estiver usando `PUT /app/membro/perfil` (onda seguinte, por
  OTA), a função pode ser DROPADA.**

⚠️ **Fora do ERP, na mesma onda** (repo `Aplicativo-CBRio`): a Edge Function
`notify-lembretes` lia `next_eventos`/`next_inscricoes` (camada aposentada no
cutover de 17/06, data máxima 21/06) ⇒ **nenhum lembrete de véspera do NEXT saiu
desde 13/06**, com o cron vivo e 46 matriculados em 2 turmas abertas. O conserto
de #2288 cobriu as ROTAS e não a função, que vive no outro repo. Reescrita pra
turma → encontro → matrícula (espelho de `nextTurmasAbertas()`), dedup por
encontro. **Precisa de `supabase functions deploy notify-lembretes` — não sai
por OTA nem por merge daqui.**

## ⚠️⚠️ AUDITORIA DO APP · ONDA 1a · PARAR DE PERDER DADO (2026-08-06)

Migrations `20260806160000` (fanout) e `20260806170000` (RLS + o achado novo).
Itens 1, 2 e 3 do plano de 6 ondas. Ondas agrupam por **veículo de entrega**:
aqui é tudo servidor + 2 migrations, nada de OTA nem loja.

### 1 · O fanout parava de dizer "processado" quando falhou

`fn_app_inscricoes_fanout` engolia a exceção nos 4 ramos (`RAISE WARNING`) e a
última linha carimbava `'processado'` **incondicionalmente**. Prova medida: a
linha `tipo='grupos'` de 11/06 está `processado` e `mem_grupo_pedidos` tem **0**
linhas `origem='app'` (a causa de origem era o CHECK de `origem`, só ampliado em
28/07 — mas o que fez a perda ser SILENCIOSA foi o carimbo).

- **PATCH DINÂMICO obrigatório** (`pg_get_functiondef` + `regexp_replace`, a
  técnica de 20260729060000): a definição VIVA não é a do repo — a 29/07
  reescreveu o corpo em produção (`vi.deleted_at IS NULL` no dedup de
  voluntariado). **`CREATE OR REPLACE` do arquivo reverteria aquilo em
  silêncio**, e é por isso que o fanout ficou sem conserto até hoje. A migration
  verifica cada uma das 3 substituições e ABORTA se alguma não casar.
- ⚠️ **`'erro'` teve que entrar no CHECK de `status` ANTES** (era
  `pendente|em_analise|aprovado|recusado|processado|duplicado`). UPDATE pra valor
  fora do CHECK dentro de AFTER INSERT levanta 23514 e **ABORTA o INSERT** — a
  pessoa deixaria de conseguir se inscrever. É o estrago literal que a
  20260609120000 documenta. A lista nova é **derivada da viva** (extraída do
  `pg_get_constraintdef`), nunca escrita à mão: lista decorada estreitaria o
  CHECK em silêncio se prod tiver valor que o repo não conhece.
- ⚠️ **Cinto e suspensório**: o carimbo novo roda dentro do PRÓPRIO
  `BEGIN/EXCEPTION` e, se falhar, cai no comportamento antigo. O pior caso deste
  conserto não pode ser "a pessoa não consegue se inscrever".
- **O motivo vai em COLUNA PRÓPRIA** (`app_inscricoes.fanout_erro` jsonb):
  `{sqlstate, constraint, em}` via `GET STACKED DIAGNOSTICS`. ⚠️ **Nunca
  SQLERRM**: ele embute o valor que violou a chave ("Key (cpf)=(…)") e a linha é
  legível pelo próprio dono via RLS. E não vai em `dados` porque `cuidados.js`
  reescreve `dados` inteiro em algumas ações — o diagnóstico desapareceria.
- ⚠️ **O consumidor é o backend, não uma tela**: `POST /app/inscricoes` RELÊ a
  linha depois do insert (o `RETURNING` reflete o estado ANTES do AFTER trigger),
  e quando vê `'erro'` **notifica o módulo dono** e responde **502 com mensagem
  honesta** em vez de "Solicitação recebida!". Sem esse consumidor a onda só
  trocaria "perda silenciosa com rótulo errado" por "rótulo certo": **nenhuma
  tela do sistema lê `app_inscricoes.status`** (conferido nos 8 leitores).
  Dedup do aviso é por PESSOA+TIPO, não por linha — quem toma erro tenta de novo.
- ⚠️⚠️ **RESÍDUO CONHECIDO, não resolvido nesta onda**: existe um SEGUNDO trigger
  AFTER INSERT, `app_inscricoes_notify_recebida` (repo do app ·
  `supabase/webhooks_app.sql`), e a ordem de disparo do Postgres é **alfabética**
  ⇒ ele roda **antes** do fanout e manda push *"o líder recebeu seu pedido"*
  olhando só `record.tipo`. **Essa push continua saindo mesmo quando o fanout
  falha.** Fechar exige mover a notificação pro backend (depois da releitura) ou
  passar o trigger pra AFTER UPDATE de status — mexe no repo do app + deploy de
  Edge Function.

### 2 · O cliente parou de poder escrever o que não é dele

`app_inscricoes_own` era `FOR ALL USING (auth.uid() = auth_user_id)` — sem `TO`,
sem `WITH CHECK`. Dava pra o autor marcar o próprio SOS como concluído (sai da
fila pastoral), apagar a linha e inserir pedido com `membro_id` de terceiro.

- ⚠️⚠️ **As policies são descobertas no CATÁLOGO, não pelo nome do arquivo**:
  policy permissiva é **OR'eada**, e há indício de uma SEGUNDA policy `own` que
  **não está em migration nenhuma** (a 20260701030000 revela duas). Dropar só a
  que o git conhece deixaria a duplicata `FOR ALL` viva: migration passa, lint
  verde, **furo aberto**.
- Sobrou `FOR SELECT TO authenticated` do dono + `FOR ALL TO service_role`, e
  `REVOKE INSERT/UPDATE/DELETE`. Pode, porque **o cliente não escreve ali**: o
  app toca `app_inscricoes` em UM lugar e é leitura (`lib/meusPedidos.ts:18`);
  quem escreve é `POST /api/app/inscricoes` com service_role.
- ⚠️ `(select auth.uid())` na policy nova — `auth.uid()` cru reavalia por LINHA e
  desfaz o initplan da 20260701030000.
- ⚠️ Teste de fumaça **com token de usuário real**: o supabase-js manda a anon
  key em `apikey` e o JWT em `Authorization`, e o papel efetivo é
  `authenticated`. Testar com a anon key pura dá "permission denied" (correto) e
  se lê como "quebrei o app".

### ⚠️⚠️ 2b · ACHADO NOVO (fora dos 12 da auditoria) e MAIS GRAVE

`app_soft_delete(text,text,uuid)` e `app_restore(text,text)` são **SECURITY
DEFINER** com `GRANT EXECUTE ... TO authenticated` (20260521180000:174 e :207) e
a **única** validação dentro delas é "a tabela está na whitelist" — **sem
checagem de dono, de módulo ou de nível**. Qualquer pessoa logada (inclusive
qualquer membro pelo app, com a chave pública que vai no bundle) podia
`select app_soft_delete('mem_membros', '<uuid de qualquer pessoa>')` e apagar por
soft-delete **qualquer linha das ~30 tabelas da whitelist** — pessoas, grupos,
contribuições, dados de Kids — sabendo só o id. `app_restore` desfaz, o que
também ressuscita o que a equipe apagou de propósito.

**Revogado de `authenticated` e `anon`, e é mudança de ZERO comportamento**:
varredura dos dois repos → **17 arquivos de rota** do backend chamam
`app_soft_delete`, todos com service_role; **ZERO** chamadores no frontend do ERP
(`src/`), no app mobile e nas Edge Functions. Reverter, se um dia precisar, é um
`GRANT`. ⚠️ **Follow-up**: outras funções SECURITY DEFINER com grant pra
`authenticated` merecem a mesma varredura (`app_salvar_membro` já foi estreitada
em 20260806140000).

### 3 · O payload do app passou a ser SANEADO — e por que NÃO é o contrato

⚠️⚠️ **Ligar `validarCamposPadrao` aqui reprovaria ~tudo, e isso foi MEDIDO**
(22 linhas de `app_inscricoes` em 06/08): **0 de 22** mandam nascimento ou sexo ·
oração/SOS/aconselhamento **nunca** mandam e-mail · a régua de telefone **não tem
flag pra relaxar** e 46 dos 83 cadastros ligados a conta do app não têm telefone
⇒ o botão de **SOS** (risco de vida) e o Fale Conosco passariam a recusar ~55%
das contas, em telas sem campo pra corrigir · batismo manda `nome` = **primeiro
token** ⇒ "Informe o nome completo" em 100% dos envios.

Então o conserto é o dano REAL medido: **o '55' grudado no telefone.** 15 das 22
linhas têm 13 dígitos começando com 55 (`profiles.telefone` guarda "+55 (21) …"
do PhoneInput) e o fanout só remove NÃO-DÍGITO — não tira código de país. As 5
inscrições de voluntariado em `vol_inscricoes` estão com 13 dígitos, e **o
próprio dedup por telefone do fanout compara contra os 11 da base** ⇒ não casa.

- **`backend/utils/saneamentoInscricaoApp.js`** = régua PURA no gate (17 testes).
  Telefone → dígitos → tira o 55 (só quando o resto ainda é telefone completo:
  **DDD 55 é Santa Maria/RS**) → aceita 10-11, senão `null`. E-mail normalizado
  ou null · nascimento validado ou null · CPF só dígitos (o DV é julgado pelo
  handler, não aqui) · nome com trim/colapso.
- ⚠️ **NÃO BLOQUEIA NADA**: campo que não normaliza vira `null`, que é o que o
  fanout já gravava. Nenhum 400 novo em nenhum tipo.
- ⚠️ **Só mexe em chave que EXISTE** e preserva todas as outras: o fanout lê
  `grupo_id`, `areas`, `nome_mae`, `sobrenome`, `tamanho_camisa`,
  `possui_deficiencia`, `deficiencia_descricao`, `observacoes`, `observacao`,
  `evento_id`, `membro_id`. Remover ou renomear qualquer uma quebra um ramo.
- Log de ajuste sai com os **NOMES** dos campos, nunca os valores (é telefone e CPF).
- **Subir exigência é decisão com número na mão, outra onda**: hoje só **1**
  profile tem `app_ficha_confirmada_em`, e dos 25 cadastros com CPF completo
  **17 não têm `genero`**.

⚠️ **Réguas puras mudaram de casa**: `validarNascimento`, `emailValido` e
`tirarCodigoPaisTelefone` saíram de `services/inscricaoContrato.js` (que carrega
o Supabase e por isso não entrava no gate) pra **`backend/utils/camposContato.js`**
— e o `inscricaoContrato` **re-exporta as três**, então nenhuma das 7 portas
públicas muda de import. `validarNascimento` ganhou 2º parâmetro OPCIONAL
(`hoje`) pra teste sem o relógio da máquina. Conferido com smoke rodado **de
dentro de `backend/`** (a lição da Onda 0) + `test:inscricao-contrato` verde.

### ⏳ Onda 1 · o que FALTA (itens 4 e 5, levantamento pronto)

- **Item 4 · pedido de exclusão de conta (LGPD)** ainda sem leitor. ⚠️ Achado do
  levantamento: **`gerarTodasNotificacoes` não tem agendador nenhum** —
  `/api/notificacoes/cron` NÃO está no `vercel.json` (só `/cron/alerta-culto-dados`,
  semanal) e nada mais o chama. Ou seja, TODOS os avisos periódicos do
  `notificacaoGenerator` (documento vencendo, membro sem grupo, jornada,
  grupos sem visita, `cadastro_sem_nome_real`) **só rodam quando um admin clica
  em "gerar"**. Acrescentar gerador ali não faz o aviso sair. Agendar liga ~15
  geradores de uma vez e é decisão do Marcos (risco de enterrar o sino).
- **Item 5 · `PUT /app/grupos/:id`** pra o save do supervisor parar de mentir
  (79 de 100 grupos).

## ⚠️ AUDITORIA DO APP · ONDA 2 · o servidor recebe a tela de perfil (2026-08-07)

`PUT /app/membro/perfil` estava **órfão** desde sempre (quem salvava era a RPC
`app_salvar_membro`, o crítico da auditoria). Com a Onda 2 a tela passou a
chamá-lo, então ele ganhou o MESMO saneamento da porta de inscrição
(`utils/saneamentoInscricaoApp.js`) — telefone com "+55 (21) …" gravado cru em
`mem_membros` é o que quebra o dedup por telefone do sistema inteiro.

- ⚠️ **Saneia, NÃO recusa**: perfil não é porta de inscrição; bloquear aqui
  prenderia a pessoa numa tela de edição do próprio cadastro. A única recusa é
  `nome` vazio — a coluna é NOT NULL e o UPDATE estouraria com 23502, que a
  pessoa leria como "Erro ao atualizar perfil" sem motivo.
- Ganhou `limiterNormal` (estava sem limiter nenhum).
- ⚠️ **CPF não passa por aqui** (nunca esteve no allowlist) — e agora a tela
  reflete isso: o campo virou somente-leitura. Trocar CPF é ato de IDENTIDADE,
  em `/completar-cadastro`.

## ⚠️⚠️ LEI · o que não pode se perder vai AWAITED · WhatsApp duplicado (2026-08-07 · SEM migration)

Reportado pelo Marcos com screenshot: ao se inscrever num grupo de conexão pelo
app, ele recebeu **a MESMA mensagem de confirmação duas vezes** — 16:33 e 17:00
(BRT), texto idêntico. Investigando, apareceu um segundo defeito, mais grave e
totalmente silencioso: **a líder nunca soube do pedido dele**.

### 1 · A mensagem dupla · fire-and-forget em container que congela

O bloco de confirmação do `POST /app/inscricoes` era
`resolveMembroApp(req).then(...)` **sem await**, com o `res.status(201).json(...)`
imediatamente abaixo. Em serverless o container **CONGELA na resposta**:
`enfileirar` já havia feito o INSERT (commitado) e `tentarEnvio` já havia
chamado a Meta — a mensagem foi **entregue às 16:33** — mas o UPDATE que marca
a linha como `enviado` se perdeu no congelamento. A linha ficou `pendente` e o
**cron horário da fila reenviou às 17:00**.

⚠️⚠️ **A forense me enganou primeiro, e a lição vale além deste caso:** a linha
de `whatsapp_envios` mostrava `tentativas=1` e UM `message_id` — o do SEGUNDO
envio. Eu disse ao Marcos que **não havia duplicação**; o screenshot dele provou
o contrário. **Envio cuja escrituração se perdeu é INVISÍVEL** em
`tentativas`/`message_id`: a entrega das 16:33 tem wamid próprio que nunca foi
gravado. Não concluir "não duplicou" porque a fila mostra um envio só.

Aplicada a **lei de 31/07** (mesma classe do aviso ao líder que não saía): em
porta pública serverless, **o que não pode se perder vai AWAITED**. `membroId` e
`dados.nome` já estavam em escopo desde o topo do handler, então o await não
custa nem uma consulta a mais — some a 2ª chamada a `resolveMembroApp`.

### 2 · Inscrição de grupo pelo APP nunca avisava o líder

Só o formulário público (`publicGrupos`) mandava `grupos_pedido_novo_lider_v2`.
Pelo app, o pedido nascia pelo fanout e **ninguém era avisado** — ficava pendente
na Caixa de entrada, e quem deveria ligar pra pessoa antes de aprovar (lei dos
templates v2, 29/07) não sabia que existia. Medido em 06/08: **1 pedido
origem-app na história inteira** (o do Marcos, `d1907c7a`, no grupo da Natasha) e
**zero avisos** citando ele entre os 34 disparados desde então.

- Chama a **MESMA** `gruposWhatsapp.notificarLiderNovoPedido` do formulário
  público — o app é cliente novo da porta, **não** uma 2ª régua de aviso.
- **AWAITED**, e só **depois** da releitura do fanout: avisar o líder de um
  pedido que não existe é pior que não avisar.
- ⚠️ **Best-effort no erro** (log, não 502): o pedido já está gravado e a pessoa
  já tem vaga na fila — derrubar a resposta porque o aviso falhou trocaria um
  problema de comunicação por um de inscrição. A Caixa de entrada segue sendo o
  caminho garantido da coordenação.
- ⚠️ **A janela de 2 min na busca do pedido não é enfeite**: o ramo `grupos` do
  fanout **não tem dedup**, então cada tentativa da pessoa cria um pedido novo.
  Sem a janela, um pedido ANTIGO dela no mesmo grupo seria re-notificado a cada
  inscrição. O par usado é (grupo, membro) + `pendente` + `origem='app'`, e o
  `created_at` do pedido é idêntico ao da linha de `app_inscricoes` porque o
  fanout roda na MESMA transação.

### ⚠️ Resíduos conhecidos (mesma classe, NÃO corrigidos aqui)

- **`kids_precheckin`** (`app.js`, chamada a `wpp.notificarMembro`) ainda é
  fire-and-forget — mesmo risco de mensagem dupla, volume baixo.
- O trigger **`app_inscricoes_notify_recebida`** (repo do app) segue mandando
  push *"o líder recebeu seu pedido"* **antes** do fanout (ordem alfabética de
  trigger), inclusive quando o fanout falha. Já registrado na Onda 1a.

## ⚠️⚠️ AUDITORIA DO APP · ONDA 1b · O SAVE PARA DE MENTIR E O LGPD GANHA FILA (2026-08-06)

Itens 4 e 5 do plano. **Sem migration** — é rota + tela + régua pura.

### 5 · `PUT /app/grupos/:grupoId` · o save do supervisor gravava NADA

`grupo-editar.tsx` fazia UPDATE DIRETO em `mem_grupos`, e a RLS de UPDATE só
aceita `lider_id = current_user_membro_id()` OU nível grupos >= 3 — **supervisor
não passa**. Como o update não tinha `.select()` nem conferia linhas afetadas, **0
linhas voltavam SEM erro** e a tela dizia "Grupo atualizado."

Medido em 06/08: dos 13 supervisores, **1 tem conta no app**; ele supervisiona 8
grupos ativos e **não é líder em 7** → são 7 saves que hoje mentem. E
`current_user_module_level` resolve `usuarios` pelo **e-mail do LOGIN**: o e-mail
com que ele entra no app não é o da conta de sistema, então o nível dele na RLS é
**0**. (Contexto maior: **88 dos 101 grupos ativos não têm líder com conta no
app**.)

- ⚠️⚠️ **NÃO reusei o `PUT /api/grupos/:id` do web, e não é preguiça**: ele é
  **update de OBJETO INTEIRO**, escreve ~28 colunas e aplica DEFAULT no que não
  vem (`lider_id: d.lider_id || null` · `ativo: d.ativo ?? true` ·
  `temporada: || null` · `aceitando_inscricoes: d.aceitando_inscricoes !== false`).
  Chamá-lo com os 9 campos da tela do app **apagaria a liderança, a temporada e o
  estado de inscrição** do grupo. O endpoint do app é **PATCH com allowlist**.
- Autorização = o MESMO `gateGrupoApp` dos outros 7 endpoints de gerenciar grupo
  (líder OU supervisor OU admin). Era a divergência entre o que a TELA mostra e o
  que a RLS aceita que produzia o save silencioso.
- **`.select()` + conferir a linha** é o conserto: 0 linhas agora é **409**, não
  sucesso. E `updated_at` passou a ser carimbado — não há trigger de `updated_at`
  em `mem_grupos` e o PUT do web também não o seta, então editar pelo web deixa a
  coluna velha até hoje.
- ⚠️ **`categoria` é REGRA DE NEGÓCIO, não rótulo**: `publicGrupos` usa pra a
  trava de gênero e pra habilitar a **inscrição de CASAL** (só em 'Casais'), e o
  filtro público compara valor exato. No app o campo é `Input` de **texto livre** —
  um "casais" minúsculo ou "Casal" desligaria a inscrição de casal em silêncio.
  Agora a lista é **FECHADA** (espelho de `TIPOS_GRUPO`) e o valor é normalizado.
- ⚠️ **`horario` é coluna `time`** e a tela manda texto livre: "1930"/"19h30"/"9:5"
  passam a virar `HH:MM`, e o que não é hora vira 400 com mensagem — antes era
  erro de cast cru do Postgres, que a pessoa lê como "não salvou".
- ⚠️ **`dia_semana` aceita 0 = domingo** (que é falsy) — a armadilha já
  documentada, agora com teste.
- ⚠️ **NÃO geocodifica dentro do request**: ViaCEP + Nominatim com 1,1s de espera
  por política é como uma edição vira timeout, e **nenhum save do sistema
  re-geocodifica** (nem o do web — quem faz é a ferramenta manual
  `/admin/grupos/geocode`). Quando `endereco`/`bairro` mudam, o endpoint **avisa a
  coordenação** com link pra ferramenta: é o que evita o pino do mapa apontando
  pra casa antiga sem ninguém saber.
- Régua pura em `backend/utils/grupoEdicaoApp.js` (18 testes no gate).
- ⚠️ Autoria do audit log: a trigger `trg_audit_mem_grupos` grava autor por
  `auth.uid()`, que é NULL em escrita por service_role ⇒ a edição pelo app aparece
  como "sistema" no card "Log de alterações" — **mesma limitação que o web já
  tem**, não regressão.
- ⚠️ **A troca na TELA é Onda 2 (por OTA)**: o endpoint está pronto e o app ainda
  grava direto. Até publicar, o save do supervisor continua não gravando.
- ⚠️ ~~**A FOTO DE CAPA continua quebrada e fica pra Onda 2**~~ → **RESOLVIDO NO
  SERVIDOR em 07/08** (ver 3b logo abaixo). Fica valendo o diagnóstico: a policy
  do bucket `grupos` exige `is_admin_or_diretor()` (`profiles.role`, esquema
  APOSENTADO) ou ser o líder — supervisor não passa nem no Storage.

### 3b · A CAPA DO GRUPO tinha o MESMO save silencioso — na MESMA tela (07/08)

**Medido antes de mexer**: `mem_grupos.foto_url` preenchido em **0 de 278**
linhas (nem nas apagadas) e o bucket `grupos` com **0 objetos** desde que nasceu
(04/06/2026). A capa nunca funcionou pra ninguém, nenhuma vez. E a telemetria
mostra **0 aberturas de `/grupo-editar`** em 13.233 eventos — ninguém tinha ido
lá conferir.

⚠️ **Eram DOIS defeitos empilhados, e o segundo é o que engana:**
1. A policy do bucket barra quem não é admin/diretor/líder (16 de 113 profiles).
   Esse erro **aparece na tela** ("Falha ao enviar a capa: …") — não é o vilão.
2. `grupo-editar.tsx:112` gravava `foto_url` com **UPDATE DIRETO sem
   `.select()`** — exatamente o defeito que a Onda 1b consertou no `salvar()`
   **desta mesma tela** e que ficou pra trás no `escolherCapa()`. 0 linhas
   voltavam SEM erro, a tela dizia **"Capa atualizada."** e ainda pintava a
   imagem. Ao recarregar, sumia.

**A porta agora**: `POST /api/app/grupos/:grupoId/foto` (multipart, campo `foto`)
+ `DELETE` pra tirar a capa. `authApp` + `limiterStrict` + multer (memória, 4MB,
allowlist jpg/png/webp) + `gateGrupoApp` **depois do multer** (ele precisa
consumir o corpo antes) → upload com service_role → `.select().maybeSingle()` com
**409 quando 0 linhas**, igual ao PUT.
- ⚠️ **4MB e não 5MB** (o número do totem em `publicGrupos.js`): o corpo de
  request serverless tem teto ~4,5MB e estourar vira 413 opaco, sem JSON. **Não
  dá pra redimensionar no cliente** — `expo-image-manipulator` é módulo NATIVO e
  não sai por OTA; quem segura o tamanho é o `quality` do picker.
- ⚠️ **Caminho ÚNICO por upload** (`<gid>/<ms>.<ext>`), nunca `<gid>.jpg` fixo: o
  bucket é público e o CDN guarda ~1h ⇒ com caminho fixo, trocar a capa não
  aparece pra ninguém por uma hora. Era por isso que a tela improvisava
  `?t=Date.now()`, que só engana o cache do próprio aparelho.
- ⚠️ **A extensão sai do MIME que o multer validou**, nunca do nome do arquivo:
  no Android a URI é `content://…` e vem sem extensão nenhuma.
- Régua pura em `backend/utils/grupoCapaApp.js` (**37 asserções**, teste em
  `src/test/grupoCapaApp.test.ts`). Ela é testada porque **autoriza um DELETE no
  Storage** a partir de uma string que nem sempre é nossa: `Grupos.jsx:2500` é um
  campo de **URL de texto livre** gravando `foto_url`. `caminhoDaCapa()` recusa
  outro bucket, URL de fora, a marca escondida na query (`?u=…`) e travessia com
  `..` — inclusive escapada. **Na dúvida devolve `null`**: objeto órfão custa
  bytes; apagar o objeto errado custa a capa de outro grupo, ou um avatar.
- ⚠️ **ORDEM DE ENTREGA**: o endpoint chega no merge, a tela só depois de 2
  aberturas (OTA). **Não revogar as policies do bucket nem dropar
  `is_admin_or_diretor()` antes do OTA chegar** — tiraria o pouco que hoje passa
  sem pôr nada no lugar (mesma lição da migration `20260806120000`).
- ⚠️ **Só 14 dos 102 grupos ativos têm líder com conta no app.** Liberar "o
  supervisor" na policy do SQL resolveria 7 grupos e deixaria 88 de fora — além
  de duplicar a régua de autorização num 2º lugar, que é a doença que o
  `gateGrupoApp` existe pra curar.

### 3c · ⚠️⚠️ O PUSH NUNCA CHEGOU: 1.801 de 1.820 recusados (07/08)

**Medido em `system_mobile_push_tickets` antes de mexer:**

| sonda | resultado |
|---|---|
| tickets totais | 1.820 |
| `ticket_status='accepted'` | **19** (todos iOS, entre 02/08 e 07/08) |
| `ticket_status='error'` | **1.801 — 98,9%** |
| `PUSH_TOO_MANY_EXPERIENCE_IDS` | **1.773** |
| erro mais recente | 07/08 20:02 |

⚠️⚠️ **CAUSA**: `app_push_tokens` recebe token de **DOIS apps Expo** (o de
membros e o CBRio Staff — mesma org `cbrio`, mesmo Supabase). A Expo responde,
literalmente: *"All push notification messages in the same request must be for
the same project."* E ela **recusa o REQUEST INTEIRO**, não as linhas estranhas
— um token do Staff derrubava a entrega dos 30 tokens iOS perfeitamente
válidos. Os 19 que passaram são justamente os envios pequenos, pra uma pessoa
só, em que o lote por acaso não misturou.

⚠️⚠️ **POR QUE NINGUÉM VIU**: havia **TRÊS** remetentes, cegos de jeitos
diferentes. A Edge Function `_shared/notify.ts` dava `await fetch(...)` **sem
ler o corpo**; `notify-devocional-semana` tinha uma **cópia própria** do envio,
igualmente cega (e era o maior broadcast: 275 das 615 notificações in-app); e
`services/appPush.js` lia e gravava ticket — mas ninguém olhava a tabela.

**O conserto**: coluna `app_push_tokens.projeto_id` (migration
`20260807220000`) + a régua `backend/utils/pushLotes.js`, que agrupa por app
Expo antes de montar o request.
- ⚠️ **Token de projeto DESCONHECIDO vai SOZINHO** (1 por request). Um request
  com uma mensagem só não tem como ter "experience ids demais" — é o que faz a
  entrega ficar correta **desde o 1º envio**, sem adivinhar a origem do token
  antigo e **sem apagar linha de ninguém**. Se cura sozinho: o app reescreve o
  próprio token a cada volta do background.
- ⚠️ **NUNCA juntar os desconhecidos num lote**: são justamente os de origem
  ambígua, ou seja, a mistura mais provável de todas. Tem mutante.
- ⚠️ `tokenMorreu()` só aceita **`DeviceNotRegistered`**. Apagar por erro de
  LOTE teria **zerado a tabela** — 1.773 tickets traziam
  `PUSH_TOO_MANY_EXPERIENCE_IDS`, culpa do request e não do token. Tem mutante.
- ⚠️ **RÉGUA GÊMEA**: `backend/utils/pushLotes.js` e
  `Aplicativo-CBRio/lib/pushLotes.ts` têm que decidir IGUAL — escrevem na mesma
  tabela e falam com o mesmo serviço. Divergir faz o erro voltar **só metade das
  vezes**, que é pior de achar. Os testes usam o **mesmo vetor de casos** nos
  dois repos (`src/test/pushLotes.test.ts` aqui, bloco `lotesDePush` lá).
- De quebra: `appPush.js` mandava `sound: 'cbrio-chime.wav'` com **hífen**; o
  asset (`app.json:55`) e o canal Android são `cbrio_chime.wav` com
  **underscore**. Todo push do ERP saía com som inexistente.

⚠️ **AINDA ABERTO, e é decisão de gente, não de código**: os 4 broadcasts
definem a AUDIÊNCIA por `select from app_push_tokens`
(`notify-lembretes:64` e `:216`, `notify-comunicado:22`,
`notify-devocional-semana`). Quem não tem token — hoje **todo Android**, porque
o binário não tem Firebase — fica de fora até do **sino in-app**, não só do
push. Trocar por "todo mundo com conta no app" muda o raio de alcance de ~23
pra ~113 pessoas: é chamada do Marcos.

### 3e · ⚠️⚠️ `POST /api/app/inscricoes` NÃO VALIDAVA NADA (10/08/2026)

Achado pelo **Marcos testando no aparelho**: *"eu sou homem e consigo ver os
grupos apenas para mulheres e posso tentar me inscrever, e isso não é possível
no nosso webapp."* Ele estava certo — e o buraco é **maior que a queixa**.

O handler (`backend/routes/app.js`) **não lia NENHUMA das 5 travas do site**:

| trava | site (`publicGrupos.js`) | app (antes) |
|---|---|---|
| categoria/gênero | 422 `grupo_incompativel` | — |
| `ativo = false` | 403 | — |
| `aceitando_inscricoes = false` | 403 | — |
| `modo_inscricao = 'fechado'` | 403 "por convite do líder" | — |
| temporada fechada | 403 | — |

⚠️ **O app não "escapava" da trava do site — ele nunca chegava lá.** O site trava
no formulário público; o app tem porta própria, que nasceu sem elas.

**A régua agora vive num lugar só**: `backend/utils/entradaGrupoApp.js`,
**37 asserções** em `src/test/entradaGrupoApp.test.ts`.

⚠️⚠️ **DESENHO CORRIGIDO PELO MARCOS NO MESMO DIA — e ele estava certo.**
Eu tinha feito um caminho especial (`codigo='sexo_necessario'`) que **DEIXAVA
PASSAR** quem não tinha `genero`, porque só 16 das 54 contas do app tinham o
dado. Palavras dele: *"parece que estamos criando algo que é pra resolver 40
pessoas, mas que vai quebrar quando abrir pra igreja; prefiro que tenham pedidos
errados e recusados dessas pessoas do que do restante todo da igreja."*

⇒ Agora é **UMA REGRA SÓ**: o sexo tem que BATER; desconhecido não bate. A
mensagem distingue "não sabemos" de "não bate" (honestidade com a pessoa), mas o
caminho de decisão é único.

⚠️ **E o que fecha o argumento, que eu não tinha percebido**: o portão de
identidade **JÁ EXIGE o sexo**. `GET /app/identidade/status` põe `'sexo'` em
`falta`, e `bloqueiam` só o dispensa nas contas de revisão da Apple
(`contaDeRevisaoLoja`). Ou seja: quem consegue chegar na tela de grupo já passou
pelo portão e **tem** o dado. As 38 contas sem `genero` são de ANTES do portão
ligar e serão cobradas na próxima abertura. **Não havia buraco a acomodar — só
máquina a mais.**

⚠️ Tem mutante: categoria NÃO restritiva **nunca** pergunta o sexo (se isso
regredir, 70% das contas param de entrar em QUALQUER grupo).

**BACKFILL (migration `20260810160000`)**: a base inteira tem `genero` em **499
de 4.056 vivos (12%)** — não é problema do app, é da base. Recuperei o que a
PRÓPRIA PESSOA já declarou em `mem_cadastros_pendentes` e que o matcher
descartava ao vincular: **51 pessoas**. Idempotente, só escreve onde é NULO.
⚠️⚠️ **NUNCA inferir sexo por NOME.** É pouco confiável e errar isso num cadastro
de igreja constrange uma pessoa real, que depois vê o erro num grupo ou num
crachá. Sem declaração, o campo fica NULO e o app pede.

⚠️ **A ORDEM das travas importa e tem teste**: grupo fechado responde "fechado",
não "sexo". Senão a pessoa completa o perfil e continua sem conseguir entrar.

⚠️ **`sempre_aberto` entra MESMO com a temporada fechada** — é o que permite
grupo de porta aberta fora do ciclo. Tem mutante.

⚠️ **`resolveMembroApp` NÃO traz `genero`** (só id/nome/cpf/email/telefone). A
leitura do sexo é ISOLADA e, se falhar, cai em `sexo_necessario` — nunca em
"deixa passar".

⚠️⚠️ **AINDA HÁ DUAS CÓPIAS DA RÉGUA, de propósito**: `publicGrupos.js` continua
com a dele porque é a porta pública principal (**462 dos 463 pedidos**) e trocar
no mesmo PR somaria risco. **AS DUAS TÊM QUE CONCORDAR** — há ponteiro no
arquivo. Trocar pela chamada da função quando houver janela pra testar o
formulário com calma.

⚠️ **PENDENTE DE GENTE, e é dado**: o grupo **"NEW HEART - RECOMEÇO 40+ -
Solteiros/Divorciados"** está `categoria='Homens'` com **4 mulheres no roster e
6 pedidos de mulheres já aprovados** (10 dos 13 casos incompatíveis da base são
dele, e os 13 vieram de `formulario_publico` — é CADASTRO errado, não bypass).
Quem já está no grupo **não é afetado** (a trava é só no pedido NOVO), mas
mulher nova é recusada. Acertar a categoria com a coordenação.

### 3f · Suporte da Apple apontava pro número vazio (10/08)

`src/pages/public/Suporte.tsx:11` publicava `5521999079031`, rotulado "número
institucional" — mas esse número **não tem caixa nenhuma no sistema** (zero em
`wa_numeros`, zero conversas). Quem escrevia pro suporte falava com o vazio.
Trocado pelo **21 99756-7770**, o inbox que a igreja de fato lê (98 conversas em
21 dias) e o mesmo que o novo site publica.
⚠️ Esta é a **Support URL exigida pela Apple** (Guideline 1.5) — número errado
aqui é motivo de rejeição, além de deixar gente sem resposta.

### 4 · Pedido de exclusão de conta (LGPD) ganhou fila — e SÓ leitor

O app insere em `app_solicitacoes_exclusao` e promete "em breve sua conta será
desativada". O ERP **não lia essa tabela em lugar nenhum** (grep: zero rotas, zero
telas, zero serviços) e `profiles.status='excluido_solicitado'` **não afeta nada**
(0 profiles com status preenchido; nenhum filtro do sistema usa a coluna). Hoje a
tabela está **vazia** — gatilho armado, melhor momento pra construir.

- `GET /api/membresia/exclusoes` (nível 3, o mesmo do export LGPD) + bloco
  **recolhível** "Pedidos de exclusão de conta (LGPD)" na aba **Cadastros
  pendentes** da Membresia (formato do "Entradas e saídas" do /grupos, ao lado do
  `PainelCenso` — precedente de bloco embutido em vez de tela nova).
- ⚠️ **SÓ LEITURA de propósito**: **não existe nenhum caminho de desativação de
  conta no sistema** — o único `auth.admin.deleteUser` do repo é script de teste,
  `ban_duration` tem 0 ocorrências e `profiles.active` é só LIDO (nada nunca
  escreve false). O que existe é export LGPD (`routes/lgpd.js`) e soft-delete de
  `mem_membros`. Um botão "processar" que não processa repetiria exatamente o erro
  que criou este problema; a tela **declara** que a desativação é manual e cita o
  prazo de 15 dias (art. 18).
- ⚠️ Decidir o que a igreja **RETÉM** por obrigação legal/fiscal (contribuição,
  batismo) antes de desativar é decisão do Marcos — e a FK
  `user_id → auth.users ON DELETE CASCADE` significa que apagar o auth user
  **apaga a prova de que o pedido existiu**. Resolver isso vem antes de qualquer
  processamento.
- ⚠️ Erro de carregamento **não se disfarça de fila vazia** na tela: "nenhum
  pedido" e "não conseguimos ler" são coisas diferentes.

### ⚠️⚠️ ACHADO GRANDE DO LEVANTAMENTO: `gerarTodasNotificacoes` NÃO TEM CRON

`/api/notificacoes/cron` (que chama o gerador) **não está no `vercel.json`** — o
único cron de notificações agendado é `/cron/alerta-culto-dados` (semanal), e o
outro caminho é o POST manual `/api/notificacoes/gerar`. Não é dedução do arquivo:
**medido** — em **13.581** notificações desde 12/05, **nenhum tipo exclusivo do
`notificacaoGenerator` jamais apareceu**, enquanto há **283 `identidade_pendencias`
pendentes** que dispararia aviso e 5 cadastros pendentes (3 com ≥1 dia). Módulos
inteiros nunca tiveram uma única notificação: solicitações, online, governança,
tarefas, kpis, patrimônio, ritual, jornada.

⇒ **~20 avisos periódicos do sistema (documento vencendo, membro sem grupo,
jornada do convertido, grupo sem encontro, `cadastro_sem_nome_real`) só existem
quando alguém clica em "gerar".** O que roda de verdade todo dia é
`/api/monitor-automacoes/cron/checar` (prova: 17 `automacao_sem_atualizar`, a mais
recente em 06/08 11:01 UTC) — e o comentário em `routes/monitorAutomacoes.js:13-14`
dizendo que ele "também roda no cron diário de notificações" está DESATUALIZADO.

`gerarNotificacoesLgpdExclusao()` foi escrito no padrão da casa (contagem, sem
PII, dedup por dia, `urgente` quando passa dos 15 dias) e fica **dormente como os
outros 20**. ⚠️ **Agendar `/api/notificacoes/cron` é o conserto certo do sistema,
mas liga ~20 geradores de uma vez** — precisa de plano de contenção e é decisão do
Marcos. Caminho barato de medir antes: rodar o POST manual `/notificacoes/gerar`
uma vez e olhar o volume.

## ⚠️ DECISÃO · o APP é o canal oficial do devocional (2026-08-06)

Palavras do Marcos: *"acho que podemos usar agora o canal oficial da devocional
sendo o aplicativo mobile, mantenha assim por enquanto"*.

Contexto: eu havia levantado que, com o login não ligando mais ninguém a cadastro
(migration `20260806120000`), quem entrasse na **webapp** `/devocionais/*` sem ter
preenchido a ficha veria *"você não é membro"*. Ele decidiu **não consertar** —
a webapp fica como está.

⚠️⚠️ **NÃO "consertar" isso depois.** Especificamente, NÃO criar `mem_membros`
automaticamente pra a tela parar de reclamar: era exatamente esse cadastro-fantasma
que o gatilho fazia e que a migration removeu. Se um dia o comportamento
incomodar, o caminho é a webapp **mandar completar o cadastro**, nunca o banco
inventar pessoa.

**Estado medido em 06/08 (encanamento OK, adoção é o gargalo):**
- Lembrete por **push funciona**: 253 notificações `tipo='devocional'`, a última
  **hoje 07:30 BRT** (o horário do cron). `app_lembretes_enviados` tem 32 chaves
  `devocional:`.
- **Conteúdo existe**: plano "Devocional da semana 03/08" ativo, 96 itens, com item
  pra hoje.
- 🔴 **Uso real: 12 check-ins em `mem_devocionais`, de 6 pessoas, o último em
  15/07** (3 semanas atrás). 253 lembretes → ~0 registro. Como `mem_devocionais` é
  a fonte dos KPIs de **Investir tempo com Deus**, o valor é ~zero por falta de
  USO, não por falta de canal — não confundir os dois ao ler o painel.
- Achado menor: temas repetidos em dias seguidos ("A Força que Vem da Fraqueza" em
  05 e 06/08 · "A Força na Fraqueza" em 04/08) — a geração por IA repetindo
  assunto. Não bloqueia nada.
- ⚠️ Correção de registro: a aba "Automáticas" (05/08) marcou o devocional como
  "quebrado · 187 erros, 0 entregas". Aquilo é do canal **WhatsApp**
  (`whatsapp_envios` não tem NENHUMA linha de devocional hoje); o **push**, que é o
  canal que importa agora, está entregando.

## Devocionais · módulo do Matheus (no ar)

Módulo existe e roda: `backend/routes/devocionalPlanos.js` (CRUD + geração de
conteúdo por IA · exige `passagem_texto` no JSON) e `devocionalMembro.js`
(webapp do membro · `resolveMembro` por `profile.membro_id`/email — funcionários
RH foram sincronizados pra `mem_membros`). Migrations `devocional_planos`/
`devocional_envios`. Texto bíblico via **API.Bible** (`BIBLE_API_KEY` no Vercel
· chave antiga rotacionada · fail-closed 503 — PR #913); traduções ARA/NAA/NTLH.
Decisão de pesquisa (2026-05-19): YouVersion descartado como backend (API não
expõe progresso · scraping viola ToS) — pesquisa completa + spec original no
legado (o schema implementado difere da spec). **Dono do módulo é o Matheus —
não mexer sem alinhar.**

## Agente Executor Financeiro · Worker Railway (2026-05-26)

Primeiro agente "ativo" (propõe ações via tool use · humano aprova). Roda no
**Railway** (`agent-worker/` · processo persistente · Agent SDK + MCP
in-process) porque o serverless do Vercel não comporta agente long-running.
Vercel chama `POST /run/financeiro_executor` com HMAC; cron 3x/dia (9/14/19h
SP). Tools: 9 read-only + 4 propose (`propor_categorizar_transacao`,
`propor_pagar_conta`, `propor_decidir_reembolso`, `propor_atender_alerta`) —
**zero filesystem/bash**, allowlist explícita. Toda mutation vira linha
`pending` em `agent_queue` (com `action_label` + `reasoning`); humano aprova em
`/assistente-ia` > Fila de Aprovação → `POST /api/agents/queue/:id/apply` →
handler em `backend/agents/apply/financeiroApply.js` (→ applied/failed).

- **Regras absolutas do agente** (SKILL.md): nunca aplica direto · respeita
  closing mensal · sempre com reasoning ≥20 chars · só com evidência ·
  idempotência via `verificar_proposta_existente` · max 20 propostas/execução.
- **Envs**: Vercel `AGENT_WORKER_URL` + `AGENT_WORKER_HMAC_SECRET`; Railway
  `ANTHROPIC_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, mesmo HMAC,
  `TZ=America/Sao_Paulo`, `SCHEDULER_ENABLED=1`. Custo ~$10/mês (Sonnet).
- **Plugar novo módulo**: skill + tools read/propose + agent + case no server +
  scheduler + apply handler no backend + `ACTION_META` em `FilaAprovacao.jsx`.
  `action_type` sempre `<modulo>.<verbo_obj>`. Deploy: `agent-worker/README.md`.
  ⚠️ As rotas de leitura de `agents.js` migraram pro cliente REST (pool pg não
  conecta no Vercel · PR #920).

## /novosite · prévia da home do novo site público (2026-05-30)

Rota PÚBLICA standalone `/novosite` (+ `/novosite/quem-somos`) fora do
AppShell, não-listada, noindex + `Disallow` no robots.txt — teste de layout do
redesign de cbrio.com.br. Chrome/estilos compartilhados em
`src/pages/public/novosite/shared.tsx` + `styles.ts`; fotos WebP + vídeo de
hero (só ≥768px sem prefers-reduced-motion). Links reais ligados (cbrio.org,
cbrio.tv, CBZap, Maps, Next inscrição). ⚠️ **Armadilhas CSS · não regredir**: o
reset `.ns a{color:inherit}` vence classes simples — menu branco exige
`.ns-header .ns-nav-link`/`.ns-logo` e botões usam dupla classe
`.ns-btn.ns-btn-*`; centralizar CTA via `.ns-cta .ns-hero-actions`.

## Decisões pontuais de pessoas/permissões (maio-junho/2026)

- **Juninho (presidente) vê só 3 telas** (Dashboard · Monitoramento OKR ·
  Dashboard Semanal): conta ativa `juninho.lit@cbrio.org`, role rebaixado pra
  `assistente` (frontend trata admin/diretor como vê-tudo), matriz do cargo
  `pastor-presidente` zerada, cargo de exibição preservado. Monitoramento OKR
  virou item sem-módulo; Integração/Grupos ganharam `module:` no menu; aba
  Financeiro do Dashboard Semanal gateada por `canFinanceiro`. Pós-mudança de
  matriz: bust de cache + logout/login.
- **Acesso base (role) editável na UI** de Usuários: `PUT
  /api/permissoes/usuario/:id/role` (admin/diretor · valida CHECK
  `assistente|admin|diretor` · anti-autoescalação `bloqueiaAutoEdicao` · `:id` é
  UUID do profile, atualiza `profiles` direto). Mudança exige logout/login.
- **Cargo `supervisor-jornada` (Marcelo Soares)**: rede de segurança da jornada
  — nível 3 SEM `escopo_proprio` em integracao/cuidados/online/kids/ami/bridge/
  next/voluntariado/membresia/grupos/dados-brutos/minha-area (vê TODAS as
  áreas, diferente do assistente-ministerial que só vê a sua).
- **`/perfil` mostra o cargo do sistema granular** (`granular.cargoNome` via
  my-permissions), não o `profile.role` legado — o role continua usado em
  outros pontos, não mexer.
- **Modal de culto exibe vazio em vez de 0** (helper `exibir(v)` em
  `CalendarioCultos.jsx`) — schema tem DEFAULT 0 e o 0 atrapalhava digitação;
  trade-off aceito pelo Marcos.
- **Nomes**: "Juninho" como display na conta oficial; "Lorena" (não Alda
  Lorena) em profiles/usuarios/text-mirrors — ⚠️ renomear pessoa exige
  atualizar `projects.leader/responsible` etc. (filtro `escopo_proprio` compara
  por nome enquanto a migração pra UUID não termina); Pr. Pedrão não tem conta.

## Permissões · mecanismos vivos (consolidado de maio/2026)

A fonte de verdade de permissão é **cargo + matriz + overrides** (seção
"Permissoes · matriz cargo x modulo" abaixo). Mecanismos que complementam:

- **Boost por área** ⭐ (`AREA_MODULO_BOOST` em `backend/middleware/auth.js` +
  espelho SQL em `current_user_module_level()`): 1 cargo genérico + N áreas =
  acesso modular. Área da pessoa (em `usuario_areas`, normalizada sem acento)
  escala o módulo correspondente pra nível 5. Mapa atual: cuidados, grupos,
  integracao, voluntariado, next, online, kids, ami, bridge, marketing,
  producao. Pra novo módulo no padrão: adicionar no map JS **e** na função SQL.
- **`ROUTE_MODULE_MAP`** (auth.js) mapeia routeKey → slugs; toda rota nova
  precisa de entrada. Backend: `authorizeModule('slug', nivel)` (não
  `authorize('admin','diretor')` — lição dos guards de Grupos). Frontend:
  `ModuleGuard moduleSlug="x" nivelMinimo={n}` em App.tsx; itens de menu usam
  `module: 'slug'` (aparece com leitura ≥1) em vez de hooks `canX` legados.
- **Cache da matriz = 5 min** no middleware. Depois de mexer em matriz/área via
  SQL direto: `POST /api/permissoes/cache/bust` (ou botão em
  `/admin/permissoes`) + logout/login do afetado (JWT).
- **`usuarios.id` é INTEGER legado; profiles usa UUID** — endpoints de
  permissões resolvem via `resolverUsuarioId()` (lazy-create por email).
  Profiles antigos foram backfillados em `usuarios` (sync por email · coluna
  `nome` NOT NULL).
- **`escopo_proprio`**: em projetos filtra a lista pela área do usuário
  (`p.area in userAreas`); em eventos trata como "líder" no kanban (entra
  filtrado pela área mesmo com nível <3).
- **UI**: `/admin/permissoes` (matriz por célula + aba Usuários com cargo,
  áreas e overrides com expiração). O diário completo da implantação
  (atribuições em massa, fixes pessoa a pessoa, limpeza de código morto) está
  no legado.

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

### Regras e decisões vigentes (condensado · detalhes no legado)

- **Contagem de visitantes descontinuada** (2026-05-14 · decisão do Marcos):
  UI removida (abas Visitantes/Pendentes, campos do modal); schema preservado
  (`cultos.visitantes`, `int_visitantes`). Coletor `cultos.conv_visit` soma só
  decisões. Tabs vigentes de `/integracao`: Cultos · Frequência · Decisões ·
  Batismos · Histórico.
- **KPIs só-visualização ficam fora do painel NSM** via `valores = '{}'::text[]`
  (array vazio passa no isArray mas não casa nenhum valor da Jornada). Padrão
  usado nos KPIs do Online (`ON-AUD-01`/`ON-DS-01`/`ON-DDUS-01` · aparecem só
  em `/minha-area`) e nos `PROD-CULTO-*`.
- **Recálculo de KPI em tempo real por trigger SQL**: `kpi_calcular_valor_auto`
  + `kpi_recalcular_para_data` + triggers em `cultos` e `batismo_inscricoes`
  (20260514210000). Latência zero; editar culto antigo recalcula o período
  daquele culto. Backend só limpa o cache do `/painel`.
- **Decisões · aba única com toggle** Por culto | Pessoas (CPFs) — a aba
  "Pessoas decididas" separada foi removida (2026-05-14). Lista de pendências
  lê `vw_nsm_sem_dados`.
- **Cadastro flexível na decisão**: obrigatórios só nome + telefone (11
  dígitos); CPF/nascimento/email opcionais → badge `incompleto` + endpoint
  `GET /api/kpis/decisoes-pessoas/incompletos` pro censo posterior. Trigger
  resolve/cria membro com o que houver.
- **Decisão Kids (LGPD)**: `tipo_decisao='kids'` guarda nome da criança + dados
  do RESPONSÁVEL; triggers pulam criação de membro/trilha/nsm_eventos —
  criança fica fora do NSM (motivo real: a jornada não avança pra ela, não só
  LGPD). Campo agregado `cultos.decisoes_kids`.
- **Cutoff temporal "de hoje pra cá" (18/05) foi REVERTIDO em 2026-06-09**
  (migration `20260609160000`): com a NSM em janela móvel de 90d, o cutoff
  escondia gap que JÁ contava no denominador do card. A `vw_nsm_sem_dados`
  cobre tudo; o recorte de período é do consumidor.
- **Membros duplicados**: detecção pela `vw_membros_duplicados` (CPF/nome+nasc/
  telefone/email/trigram) + `mem_duplicados_ignorados` + função
  `merge_membros(keep, merge_ids[], ...)` (migra FKs de 9+ tabelas, enriquece o
  keep, loga snapshot em `mem_merge_log`). Aba Duplicados em
  `/ministerial/membresia`. Decisão: não impedir cadastro duplicado · juntar
  depois.
- **Cascata Seguir → KPIs por área**: coletores `cultos.{ami,bridge,sede,
  online,kids}_{freq,conv}` alimentam AMI/BRG/SED/ONL/KIDS-* filtrando por
  `service_type_name` (Bridge ≠ AMI · separado em 2026-05-21). Convertidos
  atendidos pertencem ao valor **'seguir'** (não 'investir').
- **KPIs semanais comparam YoY** (mesma semana do ano anterior · decisão
  2026-05-21, liturgias mensais distorcem semana-a-semana): 22 KPIs com
  `comparacao='ano_anterior'`; os 6 de batismo seguem `evento_anterior`;
  mensais/semestrais intocados. `_kpi_periodo_anterior` suporta YoY em todas as
  periodicidades.
- **NPS do culto**: `POST /api/painel-area/:area/nps` (nível ≥3) faz UPSERT em
  `dados_brutos` tipo `nps_culto` → KPIs CULTO-NPS-* recalculam por trigger.
  Canal provisório até o módulo NPS rodar pesquisa pós-culto.
- **Histórico longo**: aba Histórico usa `vw_culto_historico_anual` (1 linha
  por ano×tipo · escala sem limit); visualizações usam react-query staleTime
  5min. Calendário semanal Dom–Sáb na aba Cultos.
- **Rotas dos módulos de culto na raiz** (`/online` `/kids` `/ami` `/bridge` ·
  2026-05-21): `<Navigate>` cobre os paths antigos `/ministerial/*`.
  `PainelArea.jsx` é o componente reusável (score de saúde + abas Cultos/Dados/
  Indicadores · aba Cultos lê `vw_culto_stats` filtrada por área — decisão:
  dado de culto vive em `cultos.*`, não em dados_brutos). Líderes:
  Kids=Mariane · AMI=Arthur Cecconi · Bridge=Lillian Xavier · Online=Renata.

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

## Sistema OKR/NSM 2026 (arquitetura consolidada · fases 1-6 mergeadas em maio)

Sistema unificado OKR/KPI/NSM. **Conceito**: 1 NSM ("novos convertidos
engajados em ≥1 valor em até 60d da decisão") · 5 valores (Seguir, Conectar,
Investir, Servir, Generosidade) × 6 áreas (Kids, Bridge, AMI, Sede, Online,
CBA) → matriz com ~150 KPIs · cascata automática. "Instituição" da planilha
virou **"Sede"** no banco. Narrativa fase a fase no legado; o que vale saber:

- **Estruturas**: `igrejas` · `kpi_trajetoria` (checkpoints + view
  `vw_kpi_trajetoria_atual`) · `nsm_eventos` (append-only · 1 linha por
  engajamento · `dentro_janela_60d`) · `nsm_estado` (1 linha por segmento:
  central/cbrio/online/cba · recalculada por `recalcular_nsm()` — **v3 desde
  2026-06-10**: numerador = engajamento REAL via `fn_nsm_valores_engajados`,
  ver seção "Jornada NSM · engajamento de verdade") · `areas_kpi` ·
  `profiles.is_diretoria_geral` (5 nominais: Eduardo Gnisci, Arthur Serpa,
  Pedro Menezes, Pr. Pedrão, Pr. Juninho — complementa, não substitui,
  role='diretor'). Recalculo: `SELECT public.recalcular_nsm();` (cron horário).
- **Telas**: `/painel` (NSM + carrossel de 6 mandalas + carrossel de tendências
  + matriz 6×5 + top 3 alertas → drilldown modal célula → `/painel/kpi/:id` →
  `/painel/nsm/pessoas`) · `/minha-area` (KPIs da área por valor) · `/gestao` ·
  `/ritual` · `/dados-brutos`. Telas legadas (`/painel-kpis`, `/kpis`,
  `/admin/cultura`, `/meus-kpis`) removidas com redirect.
- **Endpoints**: `/api/nsm/{painel,eventos,recalcular}` ·
  `/api/painel/{mandalas,matriz,celula/:a/:v,alertas,kpi/:id,nsm/pessoas,
  serie-temporal[...]}`. Componentes em `src/components/painel/`.
- **Carrossel de tendências**: catálogo `SERIE_DADOS` em
  `backend/routes/painel.js` (dados por valor · Seguir filtra por culto ·
  snapshots calculam "ativos no fim do período" por overlap). Pra dado novo:
  entrada em `SERIE_DADOS[valor]` + branch em `calcularSerie()`.
- **Pipeline de cálculo (Fase 6)** — lider preenche **dado bruto**, sistema
  calcula o KPI: `tipos_dado_bruto` (~35 tipos) → `dados_brutos`
  (UNIQUE tipo+area+data+contexto) → trigger statement-level →
  `calcular_kpi()` por `tipo_calculo` (delta_pct/delta_abs/razao/
  contagem_janela/soma_periodo · config em `formula_config`) →
  `kpi_valores_calculados` (cache) → `vw_kpi_trajetoria_atual` (calculado
  primeiro, `kpi_registros` como fallback manual).
- **Permissões**: leitura geral pra autenticado; `/minha-area` e
  `/dados-brutos` filtram por `profile.kpi_areas`/`kpi_valores` (admin/diretor
  e sem-config veem tudo · fallback MVP); escrita em `/integracao` exige
  admin/diretor OU `kpi_areas` com 'integracao'.
- **Definições**: voluntário inativo = sem servir há 90+ dias. Módulos
  futuros (NPS, solicitações de membro) já têm tipos de dado preparados.

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

## Escala 50k pessoas (preparação 2026-05-11)

Banco/backend preparados pra 50k+ pessoas (visão 5 campus): view materializada
`vw_pessoas_papeis_mat` (10 booleans + 8 índices parciais · refresh CONCURRENTLY
via cron `/api/jornada/cron/refresh-papeis` + manual `POST
/api/jornada/refresh-papeis`; a `vw_pessoas_papeis` original segue pra
backward-compat) · RPC `cruzar_pessoas(criterios, limit, offset)` (count +
página em 1 query · usada por `POST /api/jornada/cruzar` · paginação de 100 no
/admin/cruzamentos) · triggers de `dados_brutos` em statement-level (batch de
500 = 1 recálculo por combo) · cache 5 min no `/api/painel` (bust:
`POST /api/painel/cache/bust`) · índices parciais nas tabelas quentes
(20260511100000). Quando crescer (10k+): read replica, particionar
`mem_contribuicoes` por ano, paginação server-side no /membresia.

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
| financeiro | Alberto Luiz Stassen da Silva |
| adm | Marcos Paulo |
| integracao | Alda Lorena |

Para alterar: `PUT /api/cycles/area-responsaveis/:area` com
`{ "responsavel_nome": "Novo Nome" }`. Os eventos futuros usarão
o novo responsável; tarefas já criadas não são afetadas
retroativamente.

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
- `cerebro_doc_texto` — texto integral do documento + `tsvector` português
  (migration `20260730220000` · **aplicada em prod 2026-08-03**). ⚠️ Nasce
  **VAZIA**: só recebe linha quando o cron do Cérebro processa arquivo NOVO. Os
  documentos já processados antes disso seguem sem corpo indexado — reprocessar o
  acervo custa Haiku de novo, então é decisão do Marcos, não automática.

## ⚠️ Cérebro · o que pode virar nota no VAULT é uma ALLOWLIST (2026-08-03 · PR #2227)

O sync reverso (`cerebroSync.js`) transforma entidade do ERP em markdown numa
biblioteca do SharePoint espelhada pelo OneDrive. Isso significa duas coisas que
mudam a régua: **markdown sincronizado não tem permissão por linha** (quem tem
acesso à biblioteca lê tudo) e **a cópia local é irrevogável** — tirar o acesso
depois não apaga o arquivo que o OneDrive já baixou no laptop.

**`ENTIDADES_PERMITIDAS_NO_VAULT` = `membro · evento · projeto · voluntario ·
funcionario · contribuicao-mes`.** Lista FECHADA, em 3 camadas (`enqueueSync`
ignora com aviso · `upsertNoteForEntity` lança — `routes/cerebro.js` a importa
direto pro backfill · `getSupportedEntityTypes` filtra, senão
`POST /cerebro/backfill/:tipo` enfileirava a fila pastoral inteira de uma vez).
`action: 'delete'` **nunca** é bloqueado (senão nota já publicada ficaria órfã).

- ⚠️ **`acompanhamento` (fila pastoral) está FORA por decisão do Marcos** —
  LGPD art. 11 + sigilo pastoral. A proteção anterior era **acidental**: as
  rotas que chamavam `enqueueSync('acompanhamento', …)` ficaram dormentes no
  refactor do Cuidados de 22/07, mas `AREA_VAULT_BY_ENTITY` continuava dizendo
  que ela ia — quem "consertasse a inconsistência" publicaria a fila. Travado em
  `src/test/cerebroVault.test.ts` (mutation-testado).
- **`funcionario` é permitido porque o renderer EXCLUI salário**; mexer no
  renderer sem reler isto vaza remuneração pro OneDrive de quem tem a biblioteca.
- Acesso hoje: **só o Marcos e o Marcos Paulo** têm a biblioteca "Cerebro CBRio".

**Falha de CONSULTA não é entidade ausente** (o mesmo padrão do `parcelas_max`,
agora na fila): os loaders faziam `const { data } = await supabase…`,
descartavam `error`, e o chamador concluía "entidade não encontrada" → a fila
marcava **`erro` na 1ª tentativa** (com `tentativas` incrementado e nunca lido).
Foi assim que **os 50 eventos da igreja ficaram fora do vault de 22/04 a 03/08** —
os 50 ids existem em `events`, as 13 colunas existem, o loader funciona hoje; o
que falhou em 22/04 é **impossível saber**, porque a mensagem real do PostgREST
foi sobrescrita pela genérica. Agora `umaLinha()` marca `retentavel` e
`decidirRetrySync` devolve `pendente` até `MAX_TENTATIVAS_SYNC = 4`; ausência
real segue terminal na hora (re-tentar não faz a linha existir).
✅ Os 50 foram devolvidos pra `pendente` em 03/08 (`tentativas=0`, erro limpo) —
o cron `/api/cerebro/sync-erp` (`30 3 * * *` = 00:30 BRT) leva **8 por rodada**,
FIFO por `enfileirado_em`, então drenam em ~7 dias. Pra acelerar: chamar o
endpoint com `?limite=20` 3×.

## ⚠️ Cérebro · a IA passa a ler o CONTEÚDO, e o filtro falha FECHADO (2026-07-30)

Pedido do Marcos ("criar um RAG pro sistema saber todo o contexto da CBRio").
Passou pelo conselho deliberativo; o desenho mudou por causa do que a
investigação achou. **Não há embeddings** — e a decisão de não ter é registrada
abaixo.

**⚠️ LEI · o filtro de origem do Cérebro é FAIL-CLOSED.** `cerebroSearch.js`
`canReadRouteKey` fazia `if (!routeKey) return true`: biblioteca fora do mapa
ficava visível pra qualquer autenticado. Medição de 30/07 antes de mexer: as 5
bibliotecas monitoradas (`Gestão, Criativo, Ministerial, Planejamento, CRM e
Pessoas`) e as 5 pastas de `cerebro_entidades_indice` estavam **todas mapeadas**
— não era vazamento ativo, era **gatilho armado**, porque
`cerebro_config.bibliotecas_monitoradas` é uma STRING editável em runtime (sem
deploy, sem PR): bastava alguém digitar "Financas" ali. Agora origem não mapeada
não aparece pra ninguém além de admin/diretor, e `avisarOrigemNaoMapeada`
**notifica o módulo cerebro** — fechar a porta em silêncio seria trocar um
vazamento por um sumiço inexplicável. Travado em `src/test/cerebroPermissao.test.ts`
(mutation-testado: reverter pra fail-open deixa 2 testes vermelhos).
⚠️ Lição repetida: dois conselheiros afirmaram "isto já vaza"; o banco desmentiu.
Consenso não é evidência — a régua do CLAUDE.md valeu de novo.

**O texto do documento parou de ser jogado fora.** `cerebroProcessor.js` extraía
até 15k chars, mandava pro Haiku e **descartava** — só `resumo` (2-5 frases)
sobrevivia, e por isso `cerebroSearch` (que se autodenomina RAG no cabeçalho) só
conseguia procurar em TÍTULO e RESUMO. Agora `indexarTexto` grava em
`cerebro_doc_texto` com `tsvector` português + **`f_unaccent`** (obrigatório: o
`extractTerms` já manda a pergunta sem acento, e o dicionário `portuguese`
sozinho não faz unaccent). **Dois tetos separados**: `MAX_CHARS_PROMPT` (15k, o
que vai pro Haiku — custo) e `MAX_CHARS_INDICE` (100k, o que fica pesquisável) —
com teto único, todo relatório longo perdia o fim para sempre.
É **best-effort e depois** do update de sucesso: se propagasse, o arquivo viraria
`erro` e pagaria o Haiku de novo.

**Documento INTEIRO, não chunks — decisão do conselho.** A fronteira de permissão
(e de LGPD) é o documento; chunk espalharia pedaços de ata pastoral por várias
linhas com o rótulo de permissão copiado em cada uma. Duas tools novas em
`assistantTools.js`: `buscar_documento` (full-text no corpo, devolve trecho) e
`ler_documento` (texto completo sob demanda). ⚠️ As duas têm `minLevel: 0` porque
a permissão **não cabe num routeKey único** — é por documento, resolvida no
handler. E a permissão entra **no SQL** (`bibliotecasPermitidas` → `.in()`), nunca
num filtro em JS depois do `.limit()`: filtrar depois é o bug que faz quem tem
poucos módulos receber "nada encontrado" existindo documento permitido abaixo do
corte.

**`serializeContext` não corta mais com `slice()` cego.** Ele truncava por ordem
de inserção e `cerebro_vault` é o ÚLTIMO campo — a busca rodava, gastava consulta
e era a primeira coisa descartada; pior, cortar JSON no meio entrega ao modelo um
objeto **inválido** junto da instrução "responda SOMENTE com base no contexto".
Agora preserva os campos pequenos (sistema, conhecimento curado, resultado da
busca) e remove **módulos inteiros**, de trás pra frente. ⚠️ Guarda de regressão:
sem `cerebro_vault`/`conhecimento_sistema` no objeto, volta ao caminho antigo
byte a byte — é o caso dos auditores (`systemAuditor`/`moduleAuditor` chamam
`buildContext` sem `options.query`). Coberto em `src/test/agentContextSerialize.test.ts`.

**Por que NÃO tem embedding** (decisão, não esquecimento): a Anthropic não tem
API de embeddings, então gerar vetor significa mandar o conteúdo pra um terceiro
— e o acervo tem ata de diretoria, Kids e fila pastoral, exatamente o que a lei
do Stax proíbe. O conselheiro jurídico apontou que a **LGPD não tem equivalente
ao art. 9(2)(d) do GDPR** (organização religiosa), então a base para dado
sensível é consentimento específico (art. 11, I), e transferência internacional
exige cláusulas-padrão da ANPD (Res. 19/2024) — não basta DPA com cláusulas
europeias. **A lei do Stax fica como está.** `pgvector` já está instalado (usado
só por reconhecimento facial), então se um dia a decisão jurídica mudar, o
caminho é acrescentar coluna `vector` na MESMA tabela e somar os rankings —
nada do que foi feito aqui se perde. Antes disso: **medir** com ~30 perguntas
reais; se as falhas forem de vocabulário (pergunta "desligamento", documento diz
"rescisão"), vetor se justifica; se forem outras, não resolveria nada.

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

## KPIs de Eventos · plano aprovado mas NUNCA implementado

Plano de score 0-100 por documento com rollup documento→área→evento→
institucional (abril/2026 · `event_document_templates`, `event_area_weights`,
campos de scoring em `card_completions`). **Verificado em 2026-06-10: nenhuma
tabela/endpoint existe** — não tratar como recurso vivo. Spec completa (schema,
pesos, dashboard, perguntas pendentes) em `docs/CLAUDE-LEGADO.md`; só
implementar com aval do Marcos.

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

> ⚠️ 2026-06-10: "marcos de expansao" = os marcos do **Planejamento Estratégico**
> (ex-"Expansão" · slug `expansao`). Módulo **pouco usado** — a aba Acompanhamento
> (planos + parecer) cobre a leitura/retrospectiva. Ver a seção "Planejamento
> Estratégico × Gestão Anual" no topo deste arquivo.

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


## Membresia · faixa etária + ministério (AMI/Bridge) auto-declarado (2026-06-16)

Pedido do Matheus: o cadastro do app pergunta (escolha única) se a pessoa
frequenta **AMI / Bridge / nenhum**; e a pessoa entra na Membresia já **tageada
por faixa etária** pela data de nascimento. Líderes de AMI/Bridge passam a ver
suas pessoas numa aba, com detalhe **sem contribuições**.

- **Migration `20260616120000`**: `mem_membros.frequenta_area` (CHECK ami/bridge,
  nullable · índice parcial) + `fn_faixa_etaria(date)` (criança <13, adolescente
  13–17, jovem 18–30, adulto 31+). Aplicada em prod.
- **App**: cadastro grava `frequenta_area` via metadata → trigger
  `handle_new_user` (em `supabase/handle_new_user_membro.sql`, aplicado em prod;
  valida ami/bridge, e se o membro já existir preenche se estiver vazio).
- **Membresia** (`Membresia.jsx`): badge de faixa etária + badge AMI/BRIDGE no
  cabeçalho do detalhe (detalhe usa `select *` → já traz `frequenta_area`). A
  faixa é derivada no front (helper inline); não é coluna.
- **AMI/Bridge** (`PainelArea.jsx` + novo `PainelAreaPessoas.jsx`): aba
  **"Pessoas"** (só `area in (ami,bridge)`) lista `mem_membros` com
  `frequenta_area = área`, filtros por faixa + busca; clicar abre detalhe.
  Backend `routes/painelArea.js`: `GET /:area/pessoas` e `GET /:area/pessoas/:id`
  (este NÃO retorna contribuições — regra "líder de área não vê doação" também no
  servidor, não só na UI; valida que a pessoa é da área). Guard
  `authorizeModule('painel-area', 1)` (boost de área cobre os líderes).
- ⚠️ Editar `frequenta_area` na Membresia (UI) ficou de fora (só leitura por ora);
  o vínculo vem do cadastro do app. Pessoas já existentes não têm `frequenta_area`
  até se cadastrarem/escolherem (forward-looking).

## WhatsApp · disparos pra eventos do app (2026-06-16)

Camada `notificarMembro(membroId, chave, params)` em `services/whatsappService.js`
dispara templates da Cloud API pros membros, a partir de eventos do app —
**plug-and-play**: enquanto o env do nome do template estiver vazio, é **no-op
gracioso** (não quebra o fluxo). Respeita **opt-in** (`mem_membros.whatsapp_optin`,
migration `20260616160000`): obrigatório pra Marketing; pra Utility só se
`WHATSAPP_OPTIN_OBRIGATORIO=1`. Token = `WHATSAPP_ACCESS_TOKEN` (o mesmo do bot) +
`WHATSAPP_PHONE_NUMBER_ID`.

- **Chaves → env do template:** inscricao_confirmada=`WHATSAPP_TEMPLATE_INSCRICAO` ·
  doacao_recebida=`WHATSAPP_TEMPLATE_DOACAO` · kids_vinculo=`WHATSAPP_TEMPLATE_KIDS_VINCULO` ·
  kids_precheckin=`WHATSAPP_TEMPLATE_KIDS_PRECHECKIN` · batismo_lembrete=`WHATSAPP_TEMPLATE_BATISMO` ·
  escala_voluntario=`WHATSAPP_TEMPLATE_ESCALA` · aniversario=`WHATSAPP_TEMPLATE_ANIVERSARIO` (Marketing).
- **Já ligados:** confirmação de inscrição (`app.js` POST /app/inscricoes ·
  grupos/batismo/next/voluntariado/retiro/cursos/eventos · {{1}} nome {{2}} tipo) e
  vínculo Kids aprovado/recusado (`totemKids.js` · {{1}} criança {{2}} aprovado/recusado).
- **Convite NEXT em massa (2026-07-20):** `nextConvite.js` POST `/next-convite/enviar`
  dispara o template `WHATSAPP_TEMPLATE_NEXT_CONVITE` (= `next_convite`, aprovado ·
  **1 variável {{1}}=1º nome**, link fixo/botão · pt_BR). Usado na aba Convertidos do
  Cuidados ("Convidar para o NEXT"). ⚠️ Esse disparo usa `wpp.sendTemplate` direto —
  NÃO checa opt-in (diferente do `notificarMembro`).
- **A ligar quando útil:** doação (vem do webhook Stripe / Edge Function — fora do
  Express), batismo lembrete (cron), escala, aniversário. O helper já está pronto.
- **Pra ativar um template:** aprovar na Meta → setar o env com o nome exato → começa
  a enviar (respeitando opt-in). Opt-in marcado no app (Configurações → Notificações).

## App · Telemetria (analytics de uso + erros · 2026-06-16)

Fase 1 do programa de features do app. O app de membros loga **telas, ações e
erros (crash JS)** em `app_eventos` (migration `20260616180000` · append-only ·
RLS service_role · sem PII), via `POST /api/app/telemetria` (`tryAuth` · batch ≤50 ·
nunca 500 pro app). Dashboard no sistema: `GET /api/app-analytics/resumo?dias=` →
RPC `fn_app_telemetria_resumo` (1 query JSONB · evita o cap de 1000) →
tela **`/admin/app-analytics`** (`AppAnalytics.jsx` · guard `dashboard`≥1):
eventos/usuários por dia, telas mais vistas, ações, erros recentes, plataformas/versões.
App: `lib/telemetria.ts` (`trackTela`/`trackEvento`/`trackErro` + handler global de
erro + flush por tamanho/timer/background) ligado no `app/_layout.tsx` (init + cada
tela via `usePathname`). Próximas features chamam `trackEvento` pra medir adoção.

### ⚠️ A telemetria ficou 5 dias MORTA em silêncio · `event_id` (2026-08-05)

Fui usar a telemetria pra diagnosticar um problema do app do Marcos e ela estava
**zerada desde 31/07** — o dia em que a `20260731143000` (etapa 4 do módulo
Sistema) criou `app_eventos.event_id uuid NOT NULL DEFAULT gen_random_uuid()` e o
índice único, pro `upsert(..., { onConflict: 'event_id' })` do endpoint.

**O DEFAULT existe e funciona** (conferido: `POST /rest/v1/app_eventos` cru, SEM a
chave → 201). Quem quebrava era o **cliente**: o app não manda `event_id`, o
normalizador devolvia `event_id: undefined`, e — a pegadinha — **`Object.keys()`
INCLUI chave com valor `undefined`**, então o supabase-js montava
`?columns=…,event_id`; o PostgREST vê a coluna listada e ausente no JSON e insere
**NULL** → `23502`, lote inteiro descartado. E o handler responde **HTTP 200
`{ok:false}`** de propósito ("telemetria não pode quebrar o app") e o app ignorava
o corpo ⇒ **falha perfeitamente silenciosa**.

- **Régua que fica:** em `upsert` com `onConflict`, **toda linha precisa ter a
  chave de conflito PREENCHIDA** — nem `undefined` (vira NULL via `?columns=`) nem
  presente só em algumas linhas (o `?columns=` é a UNIÃO das chaves do lote).
  `normalizeMobileEvent` agora sempre gera `event_id` (o do app quando vier — aí o
  reenvio é idempotente de verdade; senão `crypto.randomUUID()`).
- **Falha de ingestão AVISA GENTE** (`notificar` módulo `dashboard`, dedup por dia,
  link `/admin/app-analytics`). Sem isso, o próximo silêncio dura outros 5 dias.
- ⚠️ **A whitelist de `props` estava comendo quase tudo**: das 10 chaves que o app
  mandava, só `message` passava (`{grupo: id}`, `{tipo}`, `{criado}`,
  `{encontrado}`, `{id}`, `{url}` iam pro lixo sem erro). O app foi ajustado pras
  chaves permitidas e a lista ganhou **`entity_id`** (id de COISA — grupo, vídeo,
  comunicado · **nunca de pessoa**) e **`label`** (rótulo curto de enum NOSSO —
  tipo de decisão, parentesco · **nunca texto digitado**). Chave nova exige a
  mesma pergunta: *isso pode identificar alguém?*
- O app passou a mandar `event_id`, `occurred_at` (quando ACONTECEU · o
  `created_at` é quando chegou), `session_id` (uma abertura), `installation_id`
  (aparelho, persistido), `os_version`, `device_model`, `manufacturer` e
  `build_number` — tudo de `Platform.constants` + `expo-constants`, **sem
  dependência nativa nova** (o que manteria a mudança fora do alcance de OTA).
  ⚠️ **`Constants.deviceName` é PROIBIDO** aqui: no iOS vem "iPhone de \<nome da
  pessoa\>" (PII). No iOS vai o formato (`handset`/`pad`).
- ⚠️ `GET /sistema/v1/mobile/command-center` (mesma etapa 4) **não tem tela** no
  frontend ainda — a telemetria do app se vê em `/admin/app-analytics`.

## Comunicados / Mural (2026-06-16 · Fase 2 do app)

Conteúdo criado no **Marketing** → **mural do app** + **push segmentado**.
Tabela `comunicados` (migration `20260616210000` · bucket público `comunicados`
pra foto · RLS marketing≥1 lê / ≥3 escreve · service role). Backend
`routes/comunicados.js` (`/api/comunicados` · CRUD + `/upload-foto` multer +
`/:id/publicar` → fan-out push) e `GET /api/app/comunicados` (mural do membro:
status publicado, segmento 'todos' OU `frequenta_area` do membro). Push: Edge
Function **`notify-comunicado`** (app repo · `--no-verify-jwt`) — alvos =
`app_push_tokens` (filtra por `frequenta_area` se segmento ≠ todos) → `notificar`
(app_notificacoes + Expo). Front sistema: aba **Comunicados** no Marketing
(`MarketingComunicados.jsx` · `/marketing/comunicados`). App: `mural.tsx`
(`/mural`, item "Avisos" no Menu) + tap da push tipo `comunicado` → /mural.
Segmentos: todos/ami/bridge/online/sede/kids.

## App · Meu Grupo de Conexão (2026-06-16 · Fase 3)

`GET /api/app/meu-grupo` (app.js): grupos ativos do membro (`mem_grupo_membros`
saiu_em null) com info (dia/horário/local/foto), **líder** (nome+telefone p/
"falar com o líder" via wa.me), **próximo encontro** (calculado de dia_semana+
horário) e **materiais** (`mem_grupo_documentos` por grupo_ids → URL pública do
bucket eventos-anexos). App: tela `meu-grupo.tsx` (`/meu-grupo`, item "Meu grupo"
no Menu). Sem RSVP/presença por ora (follow-up · não há infra de confirmação).

## App · Modo Culto · decisão de fé pelo app (2026-06-17)

"Segunda tela" do culto no app + **decisão de fé** que entra por **fila de
revisão** (decisão da liderança: NADA do app entra direto na NSM). Migration
`20260617180000` (aplicada em prod): tabela `app_decisoes` (PII · membro_id +
culto_id + ambiente presencial/online + tipo aceitar/reconciliacao/rededicacao/
batismo/outro + status pendente/confirmada/descartada + decisao_id · deleted_at +
whitelist + RLS contextual) e libera `fonte='app'` em `cultos_decisoes_pessoas`.
- **App**: `GET /app/culto/agora` (culto de agora + `ao_vivo` + link ao vivo +
  jaRegistrou), `POST /app/culto/decisao` (insere pendente · dedup 1/dia ·
  notifica Integração).

### ⚠️ Qual culto é "agora" · dia em BRT e o mais recente que COMEÇOU (2026-08-04)

Os dois endpoints acima resolviam o culto com
`data = new Date().toISOString().slice(0,10)` + `order('hora', desc).limit(1)`.
**Os dois pedaços estavam errados**, e o efeito era atribuição de culto errada
na fila da Integração (que alimenta a NSM):

1. **`toISOString()` é UTC.** Das 21h BRT em diante o "hoje" já é o dia
   SEGUINTE — ou seja, **no culto de domingo 19h** (que passa das 21h) o
   `culto` vinha nulo, a decisão era gravada sem `culto_id` e o dedup de
   1-por-dia olhava a janela do dia errado. Mesma classe de bug do dia da
   curva do censo e do check-in do Kids: **dia de operação da igreja é BRT**.
2. **"maior hora do dia" ≠ "culto de agora".** Às 08:30 o endpoint dizia que o
   culto era o das 19:00 → decisão do culto da manhã carimbada no da noite.

Agora existe `cultoDeAgora()` (helper único, usado pelos DOIS endpoints —
duplicar a régua era o que deixava o GET e o POST discordarem):
`hojeBRT()` + entre os cultos que **já começaram** e estão dentro de 3h vale o
**mais recente**; só quando nada começou é que a antecedência de 30 min conta.
⚠️ A ordem importa porque os cultos de domingo saem de 90 em 90 min e uma
janela de 3h sobrepõe dois ou três: `find` simples (o primeiro que casa) diria
"08:30" às 10:30, e "10:00" às 09:40 com o das 08:30 ainda rolando.
`ao_vivo` é o que o app usa pra mostrar o "No culto" **só durante o culto** —
fora da janela aquela tela não tem propósito (pedido do Marcos, 04/08).
Conferido em BRT nos horários reais de domingo (06:00 → fora · 08:05/08:15 →
08:30 · 09:40 → 08:30 · 10:30 → 10:00 · 12:15 e 13:00 → 11:30 · 15:00 → fora ·
18:45–21:30 → 19:00 · 22:10 e 23:40 → fora, com o dia BRT correto).
- **Integração**: `GET /integracao/decisoes-app` + `/:id/confirmar` (cria a
  decisão oficial em `cultos_decisoes_pessoas` com `fonte='app'` → entra na NSM
  via trigger) + `/:id/descartar`. UI: `DecisoesApp.tsx` no topo da aba Decisões
  (`vis_decisoes`) do `/integracao`. Notificação `decisao_app` → módulo integracao.
- App (tela `modo-culto.tsx` · `/modo-culto`, "No culto" no Menu + atalho Home):
  ao vivo + cartão de decisão + anotações da pregação (locais no aparelho).

## App · Pregações / Transmissão (2026-06-17 · Fase 5)

Expõe ao app os vídeos do canal YouTube (módulo Online). `GET /api/app/videos`
(app.js · authApp): 30 vídeos mais recentes (`online_videos` · titulo, video_id,
thumbnail_url, publicado_em, duration_seconds, serie), 20 séries
(`online_series`) e `canal_live` (`youtube.com/channel/<YOUTUBE_CHANNEL_ID ou
default CBRio>/live`). **Somente leitura** (a coleta do YouTube continua no cron
do `/online`); sem migration, sem env nova. App: tela `videos.tsx` (`/videos` ·
atalho na Home + "Pregações" no Menu) abre os vídeos no YouTube via Linking.

## App Staff · Kids gerencia batismo de criança (2026-07-21)

`PATCH /totem-kids/batismos/:id` (kids ≥ 3): a equipe Kids atualiza
status/data_batismo/observações de inscrição de batismo **de criança**
(eh_crianca ou <13 anos) sem depender do módulo Integração — inscrição de
adulto responde 403 e segue exclusiva do `PUT /kpis/batismos/:id`
(authorizeBatismo). Status aceitos: pendente/confirmado/realizado/cancelado.
Consumidor: app CBRio-Staff (telas Kids · batismos/apresentações). As
apresentações já tinham PATCH/DELETE próprios (kids ≥ 3/4) — sem mudança.

## Entradas · identidade progressiva e fusão segura (2026-07-18)

Prioridade zero definida pelo Marcos: **todo cadastro novo precisa aumentar a
confiabilidade futura da identidade**, mesmo quando hoje não há dados suficientes
para afirmar que dois registros são a mesma pessoa. Migration
`20260718190000_identidade_progressiva_merge_seguro.sql` (aplicada em produção 2026-07-18):
- `mem_identidade_observacoes`: histórico acumulativo por porta de nome, CPF,
  telefone, e-mail e nascimento. A base viva é semeada como `base_legada`; um
  trigger captura também inserts/updates SQL que contornem o backend.
- `mem_identidade_pares`: fila materializada e incremental com score, prioridade
  (`quase_confirmado/alta/media/descoberta`), evidências, contradições, fontes e
  data da última corroboração.
- `identidadeProgressiva.js`: ao receber uma observação, procura os membros
  conectados e recalcula o par imediatamente. Exemplo-alvo: um cadastro A com
  CPF, B com telefone+nome e um terceiro formulário com CPF+telefone+nome cria
  uma ponte e promove A×B para **quase confirmada**. Nunca auto-funde.
- CPF agora só é chave se o dígito verificador for válido. Se chega CPF novo e
  o único vínculo é telefone/e-mail compartilhável, o matcher exige também
  nascimento compatível; sem isso cria separado e abre sugestão forte.
- Todos os criadores diretos encontrados (app visitante, face, Cuidados,
  membresia manual, importador de grupos e CPF financeiro) passaram pelo matcher
  canônico. Formulários de Next, batismo, grupos, voluntariado, Kids e membresia
  registram origem. **Decisões de culto permanecem como primeiro contato fraco**.
- Batismo público passou a exigir CPF válido; o cadastro interno continua sendo
  a exceção operacional da equipe.
- `merge_membros` agora atualiza filhos linha a linha: colisão UNIQUE/CHECK apaga
  apenas a linha realmente redundante, não a tabela inteira daquele membro.
  `mem_merge_log.related_snapshot` preserva todos os filhos pré-fusão.
- Entradas combina a fila progressiva com a descoberta legada, prioriza “quase
  confirmadas”, mostra fontes, tem busca/filtros e pagina 100 cards por vez. A
  ficha da pessoa mostra quando e por qual porta os dados foram corroborados.

Validações: `node backend/services/identidadeProgressiva.test.js`, políticas de
duplicidade/família, `npm test -- --run` e `npm run build` aprovados. Migration + backend **aplicados e no ar** em produção (Marcos aplicou a migration
manualmente · deploy Vercel automático da main · confirmado no banco 2026-07-18:
`mem_identidade_observacoes`/`mem_identidade_pares` presentes, seed `base_legada` =
3667, `merge_membros` seguro é a única versão viva).

**Follow-up (2026-07-18 · auditoria + correções · PR `claude/entradas-followups-email-doc-limpeza`):**
auditoria multi-agente confirmou a entrega contra o banco vivo (o resumo do ChatGPT
procedia; o CLAUDE.md é que tinha ficado com "NÃO aplicada" desatualizado). Corrigidos:
(1) `membroMatch` (acharOuCriarGuardado/acharMembroGuardado) NÃO liga mais por e-mail
sozinho quando o chamador não passa nome — alinha ao contrato "e-mail sozinho nunca
identifica"; (2) `publicVoluntariado /inscrever-form` roteia pelo matcher canônico
(`acharMembroGuardado`) em vez de lookup por e-mail solto e registra observação de
identidade (Contrato de porta); (3) removido código morto do Entradas
(`PessoaTab`/`SemVinculoTab`/`LigarDialog`/`buildBuscaParams`). ⚠️ Follow-ups deliberados
(NÃO nesta PR): `merge_membros` não faz snapshot de netos de linha filha apagada por
colisão UNIQUE (edge case raro · exige nova migration CREATE OR REPLACE); 2ª impl. de
`normalizarCpf` em `utils/cpf` não valida DV (armadilha p/ código futuro); colisão de
número das migrations `20260717170000`/`20260718120000`/`20260718190000` (cada uma tem
gêmea de grupos/crons no mesmo número — ao aplicar manualmente, rodar as DUAS de cada par).

## Pagamentos · núcleo provider-agnostic + retiro pago pelo sistema (2026-07-28)

Pedido do Marcos: vender a inscrição do **retiro** pelo próprio sistema (PIX,
cartão parcelado, boleto, e Apple Pay se der), com lista de inscritos por
idade, vínculo automático ao cadastro da pessoa, forma de pagamento por
inscrito, rastreabilidade e impressão da lista por faixa de idade/sexo.

⚠️ **O retiro NÃO é módulo novo** — é um evento da espinha de inscrições (F3.2),
com `pagamento_ativo=true`. Esta seção cobre só a camada de PAGAMENTO. Ver a
consolidação com `insc_pagamentos` mais abaixo.

### ⚠️ Decisão do gateway · REVISTA em 2026-08-06: o PSP passou a ser o MERCADO PAGO

Decisão do Marcos (retomada de sessão anterior): *"já decidimos que vamos seguir
com Mercado Pago"*. O bloco abaixo (Asaas) fica como **registro histórico do
racional de 28/07** — o que o invalidou não foi o raciocínio, foi o
**operacional**: a conta Asaas de produção ficou "em análise" e o sandbox nasceu
sem forma nenhuma habilitada, enquanto a igreja já tem conta no Mercado Pago.

**O adapter do Asaas NÃO foi removido e não deve ser.** `pag_cobrancas.provider`
é por LINHA: cobrança criada por ele precisa seguir sendo consultada, conciliada
e estornada por ele. Quem decide o PSP das cobranças NOVAS é
`PAG_PROVIDER_PADRAO`. Trocar de PSP custa 1 env — é exatamente o que o núcleo
provider-agnostic existe pra permitir, e agora foi exercitado de verdade.

Ver a seção **"Adapter do Mercado Pago"** abaixo para os fatos da API, as três
decisões de arquitetura que ele forçou e o que ficou pendente de gente.

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

### Núcleo entregue (migration `20260728120000` · APLICADA em prod · PR #2082)

`backend/services/pagamentos/` — serve QUALQUER módulo que precise cobrar
(retiro, cursos, eventos, e o módulo de inscrições genérico do Marcos quando
existir). Contrato = `pag_cobrancas.origem_tipo` + um handler registrado no JS.

**⚠️ LEIS deste núcleo (não regredir):**

1. **Dinheiro SEMPRE em centavos inteiros.** Nenhum float, em nenhuma coluna.
2. **`status` é canônico do CBRio, nunca a string do PSP.** Todo mapeamento vive
   em `providers/<nome>.js`. `if (status === 'RECEIVED')` fora de um adapter
   está no lugar errado. Nenhum módulo de domínio importa `providers/*` — só a
   fachada (é o que faz trocar de PSP custar 1 arquivo + 1 env).
3. **Idempotência do webhook É a UNIQUE** `pag_webhook_eventos(provider,
   evento_id)` + `ON CONFLICT DO NOTHING`: processa só quem conseguiu inserir.
   Dedup por SELECT-depois-INSERT **não é dedup** — duas entregas concorrentes
   do PSP veem ambas "não existe" e ambas inserem. Foi o bug do
   `generosidade-webhook` do app (que, aliás, **não grava linha nenhuma**:
   `origem:'app'` viola o CHECK e `membro_id:null` viola o NOT NULL de
   `mem_contribuicoes` — **não usar como referência**).
4. **`pago` NUNCA regride** (trigger `fn_pag_cobrancas_transicao` + espelho em
   `maquinaEstados.js`). Webhook fora de ordem não pode despagar inscrição
   confirmada. Transição inválida → `RAISE WARNING` e mantém o status antigo,
   **não aborta**: exception em handler de webhook vira retry infinito no PSP.
5. **NUNCA armazenar PAN/CVV/validade/nome impresso.** Só `cartao_brand` e
   `cartao_last4` como o PSP devolveu. Dado de cartão não entra no nosso banco,
   nos nossos logs, nem no nosso Express — a tokenização é no PSP/cliente.
6. **`pag_pagamentos` é razão auxiliar e NUNCA é somada em view financeira.** O
   caixa recebe **1 receita por REPASSE** do PSP em `fin_transacoes` (+ 1
   despesa de tarifa), conciliada contra o crédito do extrato. Somar as duas
   camadas é exatamente como nasce a dupla contagem (a de ~R$ 1,5 mi veio desse
   mecanismo). `liquido`/`taxa` vêm do **payload do PSP**, nunca calculados —
   a taxa varia por método, parcela e antecipação. `vw_pag_invariantes` é a rede
   que grita quando divergir; ler no fechamento.
7. **Nenhuma confirmação sem `status='pago'` lido do servidor** — WhatsApp,
   push, e-mail, tela de sucesso, confete. Nada.

Estado no banco: 3 tabelas · `pag_cobrancas` na whitelist de soft-delete ·
2 triggers (transição + audit) · 10 policies de RLS (`pag_webhook_eventos` só
legível por super-admin — payload cru do PSP) · `vw_pag_invariantes`.
Testes: `src/test/pagamentosMaquinaEstados.test.ts` (16 casos).

### Buraco negro do `retiro` fechado (PR #2081)

`retiro`/`cursos`/`eventos` eram aceitos em `TIPOS_INSCRICAO` **e** estavam em
`LABEL_INSCRICAO_WPP`, mas `fn_app_inscricoes_fanout` não tem branch pra
nenhum: a linha ficava invisível em `app_inscricoes` (`status='processado'`) e a
pessoa recebia **"Inscrição confirmada"** de inscrição que não existia. Os três
viraram **lead** (`LABEL_INSCRICAO_LEAD` → `notificar()` dizendo explicitamente
que não há inscrição confirmada). **Retiro NÃO passa por `app_inscricoes`/
fan-out** — aquele fan-out envolve cada branch em `EXCEPTION WHEN OTHERS` e
marca `processado` de qualquer jeito; falha silenciosa marcada como sucesso é
veneno pra fluxo com dinheiro.

Junto: `santanderCron.js` chamava `contasService.extrato()` — **função
inexistente** (o export é `consultarExtrato`) → TypeError a cada execução, e a
"ESTRATÉGIA 2: extrato regular" do `/pix-sync` **nunca rodou**. Virou o helper
`extratoNormalizado()`, único ponto que conhece o formato cru `_content` do
banco. É pré-requisito de conciliar o repasse do PSP contra o extrato.

### ⚠️ CONSOLIDAÇÃO com a espinha de inscrições (28/07 · decisão do Marcos)

O núcleo `pag_*` e a espinha de inscrições (`20260729000100` · F3.2 PR 1) foram
construídos **no mesmo dia, em frentes paralelas**, e as duas criaram tabela de
pagamento. As duas estavam INERTES (nenhum código lia nenhuma) quando o conflito
foi detectado. Decisão: **`pag_*` é o MOTOR · `insc_pagamentos` é a linha de
DOMÍNIO que aponta pra ele** (migration `20260729020000` · aditiva).

- `pag_cobrancas` → cobrança + estado canônico · `pag_pagamentos` → razão
  auxiliar (liquidação/estorno/tarifa, líquido+taxa) · `insc_pagamentos` →
  "esta inscrição tem esta cobrança" (`cobranca_id` FK), com os campos que a UI
  de inscrições já lê. Ler pela **`vw_insc_pagamento_estado`** (o estado vem do
  motor quando há cobrança; cai no espelho em pagamento manual).
- Motivo de o motor ser o núcleo: `insc_pagamentos.webhook_log JSONB` guarda
  histórico mas **não dá idempotência** (anexar em array JSON não impede
  processar o mesmo evento 2×, e não há UNIQUE por evento do PSP — o furo que
  quebrou o `generosidade-webhook`), e não tinha trava de transição contra
  webhook fora de ordem despagar inscrição confirmada. `webhook_log` **continua
  existindo** como histórico legível; só não é mais o mecanismo de idempotência.
- ⚠️ **NÃO criar tabelas `ret_*`.** O retiro é uma linha em `insc_eventos` com
  `pagamento_ativo=true`. A `inscricoes` já exige `cpf`+`data_nascimento`+`sexo`
  no `chk_inscricoes_contrato` (= idade, faixa via `fn_faixa_etaria` e a
  impressão por sexo saem de graça), e já tem vagas, `numero_sorte`, check-in e
  página pública `/evento/:slug`. `publicEventoExterno.js:127` já reservava a
  vaga do Pix: `const pago = !!esp.pagamento_ativo; // Pix chega na F3.3`.

### ✅ Camada JS + webhook + crons (2026-07-28 · SEM migration)

`backend/services/pagamentos/` completo, menos o adapter do PSP:

| Arquivo | Papel |
|---|---|
| `index.js` | **FACHADA — é a única coisa que módulo de domínio importa.** `criarCobranca`, `sincronizar`, `marcarPagoManual`, `cancelar`, `estornar`, `expirarVencidas`, `reconciliar`, `capacidades`, `metodosDisponiveis`, `registrarHandler` |
| `cobrancas.js` | persistência + transições. `valor_pago_centavos` é **derivado da soma de `pag_pagamentos`**, nunca copiado do payload (`tarifa` fora da soma: é custo nosso) |
| `webhooks.js` | assinatura → `registrarEvento` (idempotência) → despacho + `reprocessarPendentes` (replay do payload guardado) |
| `providers/{index,manual}.js` | registro + adapter de dinheiro fora do PSP |
| `handlers/{index,inscricao}.js` | ganchos de domínio por `origem_tipo` |

**Leis desta camada (além das 7 do núcleo):**

- **Provider desconhecido LANÇA**, nunca cai no padrão em silêncio — silêncio
  seria cobrança criada num provider que não sabe cobrar. `providers/index.js`
  tenta `require('./asaas')` e só engole `MODULE_NOT_FOUND` (erro DENTRO do
  adapter propaga). `pspConfigurado()` é false quando o env aponta pra adapter
  ausente → não liga fluxo pago automático.
- **`criarCobranca` grava a linha ANTES de falar com o PSP.** Se a chamada
  externa morre no meio, a cobrança existe em `criada` com `ultimo_erro` e o
  cron retoma. O inverso (PSP cria, a gente perde a linha) deixaria cobrança
  órfã cobrável no PSP sem rastro aqui. Corrida na UNIQUE de `referencia` →
  devolve a cobrança da outra requisição (o objetivo é UMA cobrança).
- **`aplicarStatus` reconfere se o BANCO aceitou.** O trigger recusa transição
  com WARNING e mantém o status antigo, sem abortar — se o JS não relesse, ele
  chamaria `aoPagar` numa cobrança que continuou não-paga. Só dispara o handler
  quando `data.status === novoStatus`.
- **Sinal do valor vem do TIPO**, não do chamador: estorno gravado positivo
  somaria como pagamento.
- **`handlers.disparar` engole erro de propósito** (loga). O estado da cobrança
  já foi persistido e não se desfaz porque o domínio falhou; a reconciliação
  chama de novo — é pra isso que handler é idempotente.
- **Handler `inscricao`**: cada UPDATE é condicionado ao status de ORIGEM
  (`.eq('status','recebida')`), então reentrega é no-op. `pago` → `confirmada`.
  `expirada`/`cancelada` → `cancelada` (libera vaga). **Inscrição já cancelada
  NÃO é ressuscitada por pagamento atrasado** — notifica e espera decisão
  humana (a vaga pode já ter ido pra outra pessoa). **Estorno/chargeback NÃO
  cancelam a inscrição** — quem já está na logística (ônibus, quarto, comida)
  não sai da lista por automação.
- **`marcarPagoManual` exige `confirmado_por`.** Dinheiro entrando por decisão
  humana sem autoria registrada torna a trilha de auditoria inútil. Taxa fica
  `null` (não 0): dinheiro fora do PSP não tem tarifa, e null diz "não se
  aplica".
- **`cancelar` recusa cobrança com dinheiro dentro** — o caminho é estorno.

**Rota `/api/pagamentos-webhook/:provider`** (`routes/pagamentosWebhook.js`),
montada fora de `/api/public` **e** no `skip()` do limiter global. **Responde
200 pra tudo menos assinatura inválida (401)** — 4xx/5xx viram reentrega
eterna, e vários PSPs DESATIVAM o webhook depois de N falhas, o que transforma
um problema de 15 min em falha silenciosa e permanente.

**Cron: UM só no `vercel.json`** — `cron/tick` `*/10`, que faz expirar +
reconciliar (limite 50) + replay numa passada. ⚠️ **É de propósito:** o projeto
já tem **45 crons** no `vercel.json` e o teto do plano Pro é 40 — cron a mais
pode simplesmente não registrar, e "cron de expiração que nunca roda" = vaga
paga que nunca é liberada, falha silenciosa da pior classe. ⚠️ **Conferir na aba
Cron Jobs da Vercel quais dos 45 estão realmente registrados** — se truncar, os
últimos da lista (posições 43–45) são três agentes de IA da jornada do
convertido, que param sem avisar. As três etapas são idempotentes, uma
não aborta as outras, e as rotas avulsas (`cron/expirar|reconciliar|replay`)
seguem existindo pra disparo manual/depuração. `CRON_SECRET` **fail-closed**.

⚠️ `listarParaReconciliar` ordena por **`updated_at` ASC, não `created_at`**, e
`reconciliar` **toca a linha ao fim de cada tentativa** (inclusive sem novidade
e inclusive em falha). Sem isso, limite menor que a fila re-checaria pra sempre
as 50 mais antigas e as novas nunca seriam consultadas — e uma cobrança que
sempre erra prenderia a vez. Round-robin é requisito, não detalhe.

**Envs:** `PAG_ENABLED` (kill switch — recusa cobrança NOVA; consultar/expirar/
reconciliar seguem, senão dinheiro já cobrado ficaria preso) ·
`PAG_PROVIDER_PADRAO` (default `manual`) · `PAG_WEBHOOK_SECRET` ou
`<PROVIDER>_WEBHOOK_SECRET` · `PAG_WEBHOOK_RATE_LIMIT_MAX`.
Testes: `src/test/pagamentosNucleo.test.ts` (11) + `pagamentosMaquinaEstados`
(16). **Nada cobra ainda** — falta o adapter e ligar a porta pública.

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

### ✅ Porta pública ligada (2026-07-28 · migration `20260729040000`)

O 403 de `pagamento_ativo` saiu. Fluxo pago: validar (contrato inteiro, nada
muda) → `fn_insc_inscrever` com **`p_status='recebida'`** (vaga reservada sob o
advisory lock) → `criarCobranca` → o front redireciona pro `checkout_url`. É o
que finalmente dá **escritor** pro `'recebida'` do CHECK.

**Regras da porta paga (não regredir):**

- **Evento pago mal configurado NÃO abre** e sobretudo não vira inscrição
  gratuita por acidente: `bloqueioPagamento()` recusa (503, com texto pra
  pessoa) quando está marcado como pago **sem valor**, quando o **PSP não está
  configurado**, ou quando o **kill switch** `PAG_ENABLED=0` está ligado. O
  `GET` do evento devolve o mesmo texto em `aviso`.
- **Re-inscrição de cancelada reativa como `recebida`, não `confirmada`**, em
  evento pago — confirmar ali daria a vaga a quem não pagou.
- **Reenvio do formulário devolve a MESMA cobrança** (`referencia` =
  `inscricao:<id>`), inclusive no caminho de corrida `duplicada` da RPC. É assim
  que ninguém paga duas vezes.
- **A vaga é reservada ANTES de cobrar.** Se a cobrança falhar, responde 502
  dizendo que a vaga está reservada e que reenviar o formulário não a perde (o
  cron de expiração devolve depois). O inverso — cobrar sem vaga garantida —
  seria estornar gente.
- **`insc_pagamentos` é espelho, não fonte**: gravado no insert com
  `cobranca_id`; a UNIQUE de `cobranca_id` faz o reenvio não criar segunda linha.

**`GET /api/public/evento/pagamento/:token`** — status pela página pública.
⚠️ Montado sob `/public/evento` **de propósito**: herda o limiter generoso dali
E o `skip()` do limiter global; a tela faz polling e sob `/api/public` puro
tomaria 429 no lançamento. Acessado pelo **`public_token`**, nunca pelo uuid.
Quando a cobrança está parada há >2 min, consulta o PSP na hora (rede de
segurança nº 1) — ninguém fica olhando "aguardando" porque uma entrega se
perdeu. A resposta expõe só o necessário: **nada de PII do pagador, metadata ou
payload**.

**Página `/pagamento/:token`** (`src/pages/public/PagamentoInscricao.tsx`):
status em vocabulário de usuário (não o status canônico cru), QR do Pix +
copiar, botão de pagar, polling de 6s que **para sozinho** ao resolver, e
consulta imediata no `visibilitychange` (voltar do checkout). ⚠️ **Confete e
"pagamento confirmado" só com `pago === true` lido do servidor** — voltar do
checkout não é pagar.

**Migration `20260729040000`** (⚠️ **aplicar ANTES do merge** — o `select` do
evento pede as colunas novas e o PostgREST erra a consulta inteira se faltarem,
derrubando `/evento/:slug`): `insc_eventos.parcelas_max` (1–21, NULL = teto da
conta do PSP) e `juros_repassados` (default true). É **por evento** porque quem
define o teto de parcelas é **quando a igreja paga o local** — retiro em
novembro e em março admitem números diferentes.

**Fix no núcleo, junto:** cobrança **meio-criada** (linha existe, chamada ao PSP
falhou) era um beco sem saída — `porReferencia` devolvia ela pra sempre, sem
checkout, e o cron de reconciliação também não a pegava (filtra por
`provider_cobranca_id`). Agora `criarCobranca` **retoma** sobre a mesma linha
(helper `pedirAoProvider`). E o erro de chamada **não marca mais `falhou`**:
`falhou` é TERMINAL na máquina e significa "não pode mais ser pago" — timeout na
nossa chamada não é isso, e marcar ali tornava a cobrança irrecuperável (o
trigger recusaria a retomada).

### ✅ Vaga atômica (migration `20260729030000` · pré-requisito de venda paga)

A vaga era conferida com `count(*)` (`inscritosEspinha`) e o INSERT vinha ~160
linhas depois, sem nada serializando — 300 pessoas no minuto do lançamento
passavam TODAS pela conferência. Em evento gratuito é tolerável; **em evento
PAGO com vaga finita significa receber dinheiro de quem não vai ter lugar.**

**`fn_insc_inscrever(...)` é o ÚNICO caminho de criação de inscrição** —
conferir janela/vaga/duplicidade, gerar `numero_sorte` e inserir acontecem no
MESMO comando, serializados por `pg_advisory_xact_lock(1937, hashtext(evento_id))`.
Não inserir em `inscricoes` direto (nem no painel, nem em import) sem
reproduzir a trava.

- **Advisory e não `FOR UPDATE` na linha do evento**: travar `insc_eventos`
  faria qualquer edição do painel (publicar, mudar horário) disputar lock com a
  fila de inscrição. Advisory é mutex nomeado, não toca em dado. Lock de
  **transação** → liberado no fim do statement mesmo com exceção. Serializa por
  evento (lançamento de um retiro não segura fila de outro).
- **Regra de negócio NUNCA vira exceção**: devolve `{ok, motivo}` (`sem_vaga`,
  `encerrado`, `duplicada`, `sorteio_esgotado`, `evento_inexistente`) e quem
  chama decide o HTTP. ⚠️ `sem_vaga` responde **409**, nunca "inscrito com
  sucesso" — o `catch (23505) → ja_inscrito: true` anterior mascarava corrida de
  vaga como sucesso.
- **`recebida` OCUPA vaga** (só `cancelada` devolve). É o ponto do fluxo pago: a
  vaga fica reservada até pagar ou o cron expirar. `fn_insc_vagas(evento_id)`
  devolve `{vagas, ocupadas, restantes}` pela MESMA régua — o `GET
  /public/evento/:slug` expõe `vagas_restantes` e a página mostra "Restam N
  vagas" / "Última vaga!" (aviso, pode ficar 1-2 defasado; quem decide é o lock).
- Junto: `eventoEspinhaPorSlug` passou a selecionar `valor_centavos`,
  `pagamento_metodos` e `pagamento_expira_horas` (a F3.3 precisa deles na porta
  pública) e `pagamento_metodos` entrou no CRUD de evento com sanitização
  própria — fica FORA do loop de `CAMPOS_EVENTO` porque é `TEXT[]` e string crua
  quebraria o insert (métodos aceitos: pix/cartao/boleto/apple_pay; dinheiro e
  transferência são lançamento manual, não opção da pessoa).

⚠️ **O MCP do Supabase VOLTOU a funcionar (2026-08-03)** — `apply_migration` e
`execute_sql` aplicam direto no projeto `hhntwfawfnxvuobhdfkb` (confirmado
aplicando a `20260730220000`). Antes retornavam `requires approval`, e é por isso
que várias seções acima dizem "colar o SQL e o Marcos roda no SQL Editor". A
disponibilidade **oscila por sessão**: tentar o MCP primeiro; se recusar, cair no
SQL colado. O que NÃO muda: **colar o SQL da migration na conversa continua
obrigatório** (regra "Migrations do Supabase") — é o registro do que foi aplicado,
independente de quem executou. E **conferir o resultado no CATÁLOGO**
(`information_schema`/`pg_policies`/`pg_indexes`), nunca só o `{"success":true}`
— lição da lei nº 10 (o `ADD COLUMN IF NOT EXISTS … REFERENCES` que "declarava"
uma FK que o banco nunca teve).

**Caminho crítico que NÃO é código** (bloqueia a venda, não o build): abrir a
conta no PSP no CNPJ da igreja avisando por escrito o volume do lançamento
(CNPJ religioso + 150 transações em 72h é o padrão que dispara retenção de
saldo por 30-90 dias); política de reembolso escrita (venda pela internet tem 7
dias de arrependimento por CDC art. 49 independente da política, e ela precisa
dizer quem come a taxa do gateway); classificação contábil da receita por
escrito; e quando a igreja paga o local — isso decide o teto de parcelas.

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

### ✅ Bolsa, desconto e gratuidade POR INSCRITO (2026-07-30 · migration `20260730170000`)

Pergunta do Marcos: *"tem pessoas que, para ajudarmos, cobramos menos, ou até vão
de graça — como amarrar isso da melhor forma?"*

**Decisão: preço é atributo da INSCRIÇÃO, não do evento.**
`insc_eventos.valor_centavos` segue sendo o valor de tabela (o que o formulário
público cobra de todo mundo); quem paga diferente carrega
`inscricoes.valor_cobrado_centavos` (NULL = tabela · 0 = isenta) + `bolsa_tipo`
(integral|parcial), `bolsa_motivo` e autoria. As alternativas descartadas e por
quê: **evento paralelo mais barato** duplica vaga/lista/sorteio e tira a pessoa do
retiro de verdade; **"lançar como pago" na mão** faz o arrecadado mentir — e o
arrecadado é justamente o número que ele pediu; **desconto no evento** não é do
evento, é de quem recebeu a ajuda.

`POST|DELETE /inscricoes/eventos/:id/inscricoes/:insId/bolsa` (nível 3 · ato de
gestão). O que ele **NÃO** faz, por decisão: **não devolve dinheiro** (bolsa em
quem já pagou é registrada e avisada; estorno é decisão humana explícita), **não
cancela a inscrição**, **não confirma quem ainda deve**. Gratuidade → inscrição
`confirmada` na hora (a vaga já é dela). Desconto → cancela a cobrança antiga
(com `preservar_dominio`) e emite uma NOVA com referência versionada
(`inscricao:<id>:bolsa:<ts>` — `inscricao:<id>` é UNIQUE e é o que impede pagar
duas vezes), devolvendo o link pra equipe enviar; o espelho antigo vai pra
`expirado` por causa da UNIQUE de inscrição ativa em `insc_pagamentos`.
Motivo é obrigatório no CHECK do banco — conceder benefício sem dizer por quê é
registro que ninguém defende seis meses depois. Na lista, isenta ganha selo
**"isenta"** em vez de "aguardando pagamento" (não está aguardando nada).

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

### ✅ Comprovante de Pix/transferência · conferência HUMANA (2026-07-30 · migration `20260730200000`)

Pedido do Marcos: *"preciso que nessa tela apareça o comprovante anexado, para
quando o pagamento for por pix ou transferencia."*

⚠️ **LEI desta feature: imagem NUNCA marca pagamento.** O anexo entra como
`em_analise`; quem baixa o pagamento é uma pessoa, via `marcarPagoManual` (que
exige `confirmado_por`). Aceitar print como prova automática é como se aprova
comprovante falso — e o dinheiro não aparece na conciliação do extrato depois.

- **Tabela, não coluna** (`insc_comprovantes`): recusar + reenviar é o caso
  NORMAL, não a exceção; uma coluna sobrescreveria a evidência da tentativa
  anterior, que é justamente o que responde "por que aceitamos este pagamento?".
  Arquivo em bucket **privado** `inscricao-comprovantes` (só o path no banco;
  equipe vê por signed URL de 15 min, assinada em lote). `revisado_por` é
  **SNAPSHOT sem FK** — a prova de quem liberou o dinheiro não pode sumir com o
  profile. Motivo de recusa obrigatório no CHECK (a pessoa lê pra corrigir).
- **Porta pública** `POST /pagamento/:token/comprovante` (imagem ou **PDF** ≤10MB
  — o app do banco exporta PDF, e recusá-lo empurraria a pessoa a printar o PDF,
  pior de ler; teto de 8 por inscrição). Já pago → 409 (não há o que conferir).
  Falha no insert **remove o arquivo órfão**. Notificação diz explicitamente que
  **NÃO foi baixado**. `respostaPagamento` ganhou `aceita_comprovante` (só
  não-pago e em forma que pode ter sido paga fora do PSP — cartão/boleto o
  provedor confirma sozinho) e `comprovantes` **sem `storage_path`**.
- **Tela do inscrito**: bloco "Comprovante anexado" + "Confirmar pagamento" /
  "Recusar". O botão diz confirmar **PAGAMENTO** porque é isso que o clique
  afirma. Badge de clipe na lista + tile "Comprovantes pra conferir" no placar —
  sem número visível, anexo de sábado só apareceria por acaso.
- **Página pública**: enquadrada como *"já paguei e a página não atualizou"*,
  **nunca** como forma de pagar (convidar todos a "pagar e mandar print" criaria
  fila humana pra pagamento que o PSP confirma em segundos). Depois de enviar diz
  "em análise" + "não precisa pagar de novo".
- `carregar()` da tela do evento passou a **devolver a lista** pra ficha aberta
  refletir o pagamento na hora (senão a badge seguiria "aguardando" logo após
  confirmar, e isso se lê como bug).

### ✅ Gratuidade/desconto PRÉ-AUTORIZADO por CPF (2026-07-30 · migration `20260730210000`)

Pedido do Marcos: *"eu colocaria o CPF da pessoa que iria receber esse benefício,
e aí na inscrição dela, quando ela colocasse o CPF, o sistema já iria identificar
que aquele CPF tem direito ao desconto (que será definido pelo líder) ou
gratuidade."*

`insc_beneficios` é o **lado de entrada da bolsa** (20260730170000), não uma
segunda régua de preço: ao ser usado, grava as MESMAS colunas em `inscricoes`
(`valor_cobrado_centavos` + `bolsa_tipo` + `bolsa_motivo`). Preço continua sendo
atributo da INSCRIÇÃO — duas fontes de preço concorrendo é como o arrecadado
passa a mentir.

- `valor_centavos` é **quanto a pessoa PAGA**, não o desconto (mesma semântica de
  `valor_cobrado_centavos`) — inverter numa ponta e não na outra é como se cobra
  R$ 700 de quem devia pagar R$ 200. O POST recusa valor ≥ o de tabela (é o valor
  total digitado no campo errado) e exige **CPF com DV** pelo canônico do
  contrato: CPF inválido aqui seria autorização que nunca casa, já que a porta
  pública exige DV.
- **UNIQUE parcial (evento, cpf)** + `usado_em`: a autorização vale UMA vez,
  senão o mesmo CPF renderia gratuidade em cada re-inscrição. `usado_em` só é
  marcado DEPOIS de a inscrição carregar o benefício — o inverso queimaria a
  autorização sem entregar o desconto.
- **Na porta pública**: consultado ANTES da RPC porque decide o `p_status` —
  gratuidade nasce **`confirmada`** (não há pagamento a esperar, e deixá-la
  `recebida` faria o cron de expiração tirar a vaga de quem a igreja isentou) e
  dispara a confirmação de WhatsApp na hora; desconto nasce `recebida` com a
  cobrança **reduzida** (`cobrarInscricao` ganhou override de valor). A tela de
  sucesso diz "liberada pela liderança — você não precisa pagar nada", senão a
  pessoa ficaria esperando um link que não vem.
- ⚠️ **Re-inscrição NÃO aplica benefício**: a cobrança dela já existe com o valor
  cheio (`referencia` idempotente) e baixar o valor da inscrição sem reemitir a
  cobrança deixaria as duas discordando. Quem reemite certo é o botão "Dar bolsa"
  na ficha — então o sistema **notifica** a equipe em vez de aplicar pela metade
  ou perder a autorização em silêncio.
- Card "Gratuidade e desconto por CPF" na tela do evento (ver = nível **2**, a
  linha carrega CPF; conceder/remover = 3). Remover autorização **já usada** não
  desfaz o preço da inscrição — o aviso diz isso e aponta a ficha.
- Junto: **card do evento clicável** na aba Eventos (só o texto abria, sem
  afordância; agora a linha inteira abre `/inscricoes/evento/:id` com "Abrir →",
  e os botões de ação param a propagação). Vale pro card avulso e pra linha de
  edição dentro do modal da série.

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

### ✅ Sonda da credencial do PSP · a chave do Asaas expira por desuso (2026-08-03 · migration `20260803140000`)

Achado na própria tela de gerar chave do Asaas: *"chaves de API sem uso são
desabilitadas após **3 meses** e permanentemente expiradas após **6 meses**"*.
Isso é uma bomba de relógio para o caso da igreja: nosso sistema **só fala com o
Asaas quando existe cobrança** — o cron de 10 min não chama a API se não há nada
pra reconciliar. Vender inscrição em fevereiro e ter o próximo evento pago em
agosto = 6 meses sem uso = chave expirada **em silêncio**, com o sintoma
aparecendo no lançamento seguinte, quando ninguém consegue pagar. Pedido do
Matheus: resolver por código, não por lembrete no calendário.

- **A sonda é `GET /customers?limit=1`** (`asaas.verificarChave`) — endpoint que
  o adapter **já exercita** em `acharOuCriarCliente`. ⚠️ Eu ia usar `/myAccount`
  e voltei atrás: seria chutar rota nunca testada, e sonda de saúde que falha
  por si mesma é pior que sonda nenhuma. Read-only, não move dinheiro.
- **Roda dentro do `/cron/tick` que já existe**, no máximo **1x/dia** (as outras
  ~143 execuções diárias saem em `pulado: verificado_recentemente` sem tocar o
  PSP). NÃO criamos cron novo — o projeto tem 45 declarados e cada slot é risco
  de teto de plano. Avulso forçado: `/cron/saude` (CRON_SECRET).
- **`pag_provider_saude`** (1 linha por provider): `verificado_em`, `ok`,
  `status_http`, `erro`, `latencia_ms`, `falhas_consecutivas`, `avisado_em`.
  Sem PII → fora da whitelist de soft-delete; apagar a linha só faz a próxima
  sonda rodar. RLS: SELECT só super-admin (a linha carrega mensagem de erro do
  provedor), escrita só service_role.
- ⚠️ **LEIS do desenho (não regredir):** (1) **silenciosa quando está tudo
  bem** — banner/notificação permanente de "tudo ok" treina a equipe a não ler
  aviso; (2) **não reclama de credencial AUSENTE** (`pulado: sem_credencial`) —
  é estado intencional, produção viveu semanas em `manual`, e alarmar sobre
  configuração deliberada é o jeito mais rápido de virar ruído; (3) erro
  **transitório** (rede/5xx) só avisa na **3ª falha seguida**, enquanto **401/403
  e chave do ambiente errado** avisam na **primeira**; (4) aviso com dedup por
  **dia** (`chaveDedup`), e recuperação só é anunciada se alguém foi incomodado
  pela falha.
- **Tela:** `AvisoCredencialPagamento` na aba Eventos do `/inscricoes` —
  renderiza SÓ com falha ou sonda >7 dias; botão "Verificar agora" gated em
  nível 3 (bate no PSP). Endpoint `GET /inscricoes/pagamento-saude` (nível 1;
  `?verificar=1` exige 3) devolve **aviso, não 500**, se a tabela faltar —
  deploy em duas etapas.
- Testes: `src/test/pagamentosSaude.test.ts` (11 · classificadores de erro,
  mutation-testado: tratar 500 como credencial recusada deixa vermelho).

### ⚠️ CORREÇÃO · o "teto de 40 crons no plano Pro" NÃO se confirmou (2026-08-03)

Verificado com `vercel crons ls`: **45 cron jobs registrados**, incluindo
`/api/pagamentos-webhook/cron/tick` (`*/10`). Nada foi truncado. O alarme
registrado neste arquivo (e repetido várias vezes) de que "vaga reservada nunca
expira" e "o e-mail de expirada nunca sai" **era infundado**.

⚠️ **Mas fica uma lição que vale mais que o alarme: cron só roda em PRODUÇÃO,
nunca em preview.** Foi por isso que, em todo o teste de sandbox, o pagamento só
era reconhecido quando a página de pagamento estava aberta (a rede de segurança
de 2 min do `GET /pagamento/:token`) — o cron nunca participou. Em produção
existe uma rede de 10 minutos que o sandbox não tem.

Comandos: `vercel crons ls` lista o que está registrado; `vercel crons run
<path>` **dispara o cron de produção na hora** (usar só pra depurar).
⚠️ Rodar qualquer `vercel` a partir de uma **worktree** falha com "codebase isn't
linked" — o `.vercel/project.json` existe só no checkout principal; sempre
`cd` pra lá primeiro.

### ✅ Placar do evento + API do app do staff (2026-07-30 · SEM migration)

- **`GET /inscricoes/eventos/:id/resumo`** → contadores por **COUNT no banco**
  (`head: true`, nenhuma linha transferida) + **arrecadado** das inscrições
  pagas. Aparece no topo do `/inscricoes/evento/:id`. ⚠️ É acompanhamento do
  evento, **não caixa** (lei nº 6): o caixa recebe 1 receita por REPASSE do PSP.
- **`lerInscritosDoEvento`/`contadoresEvento`** são os leitores ÚNICOS — a tela
  do sistema e o app do staff chamam os mesmos. Se o join de pagamento mudar,
  muda nos dois de uma vez.
- **App do staff**: `GET /inscricoes/app/eventos` (compacto, só publicado/
  encerrado por padrão) e `GET /inscricoes/app/eventos/:id/inscricoes` (paginado
  de verdade, busca por nome/telefone server-side, placar só na 1ª página).
  Nível 1 — acompanhar é ver, não operar. ⚠️ A TELA do app vive no repo
  **`igreja-cbrio/CBRio-Staff`**, que não está anexado nesta sessão.

### ⚠️ `parcelas_max` é TETO, não plano · e polling que não avança (2026-07-30 · SEM migration)

Dois bugs achados por conselho deliberativo **depois** de o PR #2168 já estar em
produção (a decisão Asaas × Mercado Pago mandou revisar o que estava no ar). Os
dois eram silenciosos — nenhum teste, nenhum log, nenhum erro na tela.

**1 · Bug de DINHEIRO: `criarCobranca` mandava `installmentCount: parcelas_max`.**
`insc_eventos.parcelas_max` é o **teto** que a igreja admite (documentado como tal
desde a `20260729040000`), e ele ia como o **número de parcelas do plano**. Efeito
em cascata numa inscrição de R$ 900 com teto 12: o Asaas criava **12 cobranças de
R$ 75**, o QR de Pix era da **primeira parcela** (a tela mostrando R$ 900), e o
`quita_cobranca` — que existe pro cartão, onde a pessoa autoriza tudo de uma vez —
marcava `statusFinal` **PAGO na parcela 1** → **inscrição confirmada tendo pago
1/12**. No placar, R$ 11.250 de R$ 135.000.

- `criarCobranca` **NUNCA** manda `installmentCount`. A cobrança nasce simples,
  no valor cheio.
- **Parcelar é escolha da PESSOA**, no momento em que ela escolhe cartão:
  `definirMetodo(cobranca, metodo, { parcelas })` manda `installmentCount` +
  **`totalValue`** (valor CHEIO — `value` seria o valor da parcela, e mandar os
  dois é como se cobra 12× o total). Pix/boleto passam `installmentCount: null`,
  que **desfaz** plano anterior em vez de criar um.
- `quita_cobranca` passou a exigir **`billingType === 'CREDIT_CARD'`** nos dois
  sites (webhook e consulta). Só no cartão a autorização é única; parcela 1 de Pix
  não quita nada.
- O teto é validado **no servidor** (`parcelas_max` do evento, ou o do provider
  quando NULL) — seletor de parcelas na tela é conveniência, não autoridade.
- `parcelas_total` é persistido a partir do que o **PSP confirmou**, não do que
  foi pedido (mesma régua da lei nº 2 e do `definirMetodo`).
- 4 testes novos, **2 mutation-testados**: reintroduzir o `installmentCount` no
  `criarCobranca` OU tirar o `CREDIT_CARD` do `quita_cobranca` deixa o gate
  vermelho.

**2 · `sincronizar` não tocava `updated_at` quando não havia mudança.** A tela de
pagamento faz polling e o endpoint público consulta o PSP quando a cobrança está
parada há >2 min (rede de segurança nº 1). Sem carimbar a linha, **a janela ficava
permanentemente aberta**: cada poll de 6s batia no Asaas. Com 100 abas no
lançamento, ~1.000 req/min no PSP — e o limiter por IP satura antes disso.
`sincronizar` agora chama `tocarReconciliacao` também no caminho `semMudanca`
(é o mesmo mecanismo de round-robin do cron, documentado acima). Junto, a tela
ganhou **backoff**: 6s nos 10 primeiros ciclos, depois 15s → 30s → teto de 60s,
com o effect dependendo de **`statusAberto`** e não de `pag` — dependência em
`pag` (que muda a cada poll) reiniciaria o backoff pra sempre.

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

### ⚠️⚠️ Cobrança TERMINAL sem dinheiro é REEMITIDA, não devolvida (2026-08-07 · SEM migration)

`criarCobranca` devolvia a cobrança da `referencia` **fosse qual fosse o estado
dela** — só reemitia quando estava meio-criada (sem `provider_cobranca_id`).
Como `expirada`/`cancelada`/`falhou` são **absorventes** (`TRANSICOES` os deixa
sem saída), quem reenviava o formulário recebia de volta uma cobrança que **não
pode mais ser paga por caminho nenhum**.

**Efeito medido no log de auditoria da inscrição CBR-2026-000141:** a
re-inscrição reativa a inscrição pra `recebida` — que **OCUPA VAGA** — e entrega
a cobrança expirada. Vaga travada, zero caminho de pagamento, e a tela ainda
dizendo "A vaga voltou para a fila", que naquele instante é falso. No lançamento
do retiro isso pega **todo mundo que deixa as 24h expirarem e tenta de novo**.

- **Reemissão com referência versionada** (`<referencia>:r<ts>`), a MESMA técnica
  do botão "Dar bolsa": `inscricao:<id>` é UNIQUE e é ela que impede pagar duas
  vezes, então a cobrança nova não pode reusá-la. A antiga fica **intacta** (é o
  registro de que a 1ª tentativa morreu) e a nova carrega
  `metadata.reemitida_de`.
- ⚠️ **Só `expirada`/`cancelada`/`falhou` COM `valor_pago_centavos = 0`**
  (`STATUS_REEMITIVEIS` + `podeReemitir`). `estornado`/`chargeback` ficam de fora
  **mesmo zerando a soma** (liquidação − estorno = 0): ali o dinheiro entrou e
  voltou por decisão de alguém, e reemitir sozinho viraria cobrar de novo.
- ⚠️⚠️ **`porReferencia` sozinho não bastava.** Depois da 1ª reemissão ele só
  enxerga a base morta — o 2º reenvio do formulário emitiria uma TERCEIRA
  cobrança com a segunda ainda viva, ou seja **duas cobranças pagáveis pela mesma
  inscrição**, exatamente o que a UNIQUE existe pra impedir. Daí
  `familiaReferencia()`: a referência exata + as versionadas (`:r<ts>`,
  `:bolsa:<ts>`). Ordem de decisão: **dinheiro dentro vence · aberta vence ·
  senão reemite**. A consulta extra só roda no caminho terminal — o caminho comum
  segue com uma query só.
- ⚠️ **A anterior é cancelada NO PROVEDOR antes** (best-effort): terminal aqui
  não é terminal lá — o nosso cron marca `expirada` pelo `expira_em`, mas o QR do
  Pix e o boleto podem seguir pagáveis no PSP. Mesmo racional do `cancelar` da
  fachada: cobrança que o PSP mantém aberta e a gente fechou é conciliável; o
  inverso não é.
- ⚠️ **O espelho tem que rodar junto** (`cobrarInscricao`): `uq_insc_pag_inscricao_ativa`
  admite UMA linha `pendente|aguardando|pago` por inscrição, e o insert do espelho
  engole 23505 como "já existe". Sem aposentar a linha anterior (`status='expirado'`),
  o painel e a `vw_insc_pagamento_estado` seguiriam apontando pra cobrança MORTA
  enquanto a nova é a que a pessoa vai pagar. O update roda **sem filtrar pela
  cobrança nova** — ela acabou de nascer e não tem espelho, e `neq` deixaria de
  fora linha legada com `cobranca_id` nulo (NULL não compara).

Testes: `src/test/pagamentosReemissao.test.ts` (13 casos · banco falsificado — o
que está sob teste é a DECISÃO, não o PostgREST). **Mutation-testados**: voltar a
devolver a terminal deixa 7 vermelhos; tirar a checagem de família deixa 1.
⚠️ O `vi.mock` do Vitest **não** alcança `cobrancas.js` (CommonJS que
DESESTRUTURA `supabase` no topo) — o teste usa `createRequire` e troca o
`module.exports` antes do require. Vale pra qualquer teste novo sobre o núcleo.

## ⚠️⚠️ LEI · o embed `tabela(count)` do PostgREST NÃO filtra soft-delete (2026-08-10)

Reportado pelo Matheus: *"mesmo eu apagando as inscrições de teste que fiz, tá
ficando como 14 pessoas inscritas no evento do retiro; sendo que se eu clicar não
tem ninguém, pois apaguei os testes."* Os dois números estavam na mesma tela do
sistema: o **card da série** dizia "14 no total" e o **detalhe do mesmo evento**
dizia 0.

**O detalhe estava CERTO** (`contadoresEvento` faz COUNT com
`.is('deleted_at', null)`). Quem contava linha apagada era o card, que lia
`inscritos:inscricoes(count)` — e o `count` de um recurso EMBUTIDO conta a tabela
inteira, inclusive o que o `app_soft_delete` marcou. Medido antes de tocar:
**RETIRO = 14 linhas, TODAS soft-deletadas** (11 cancelada + 2 confirmada + 1
recebida) ⇒ resposta certa é 0; **Celebra 2026 = 201 exibido contra 200 vivas**
(inflado em 1, e ninguém tinha percebido); Patrocinadores 15 = 15 (correto por
acaso, não tem linha apagada).

- **`backend/services/inscricaoContagem.js`** é o leitor ÚNICO
  (`contarInscritosVivos(db, eventoIds)`), usado pelos **3** endpoints que
  contavam por embed: `GET /inscricoes/eventos` (o card da série),
  `GET /eventos/:id` e `GET /inscricoes/app/eventos` (**o app do staff tinha o
  MESMO bug**). O cliente `db` é injetado — é isso que torna a régua testável
  sem banco.
- ⚠️ **A RÉGUA É A MESMA do `contadoresEvento.inscritos`**: linha VIVA, com
  **cancelada INCLUSA**. É o que faz card e detalhe passarem a bater. Excluir
  cancelada só aqui recriaria, do outro lado, exatamente a divergência que este
  arquivo fecha. Se a igreja decidir que cancelada não conta, muda **nos DOIS**.
- ⚠️ **Filtro no recurso embutido foi descartado de propósito**: não deu pra
  verificar neste ambiente se o `count` do embed respeita filtro do embed, e
  contagem que a liderança lê pra decidir não pode depender de suposição sobre o
  PostgREST. A contagem é explícita, seleciona **só `evento_id`** (nenhuma PII),
  pagina de 1.000 (cap server-side trunca em silêncio) e faz `.in()` em lotes de
  200 (lista longa estoura a URL).
- ⚠️ **Erro do banco PROPAGA** em vez de virar 0: contagem errada é pior que erro
  visível — o zero silencioso é justamente o que ninguém investiga.
- **Varredura do resto do sistema**: os outros dois `(count)` de embed são
  `devocional_itens(count)` e `vol_escala_template_itens(count)`, e **nenhuma
  das duas tabelas tem `deleted_at`** (conferido no `information_schema`) — ali o
  embed está correto. Nenhum falso alarme aberto.
- Testes: `src/test/inscricaoContagem.test.ts` (9 casos, banco falsificado com os
  números reais de produção). **Mutation-testado**: tirar o
  `.is('deleted_at', null)` deixa **4 vermelhos**.

⚠️ **Régua que fica pra qualquer contagem nova**: em tabela da whitelist de
soft-delete, **`(count)` de embed é sempre errado**. Contar exige query própria
com o filtro, ou `head: true` com `.is('deleted_at', null)`.

## ⚠️⚠️ LEI · RPC chamada pelo CLIENTE precisa de grant pra `authenticated` (2026-08-10 · migration `20260810120000`)

Reportado pelo Matheus com screenshot: o cartão de membro do app mostrava
**"QR indisponível"**. O token DELE **existe** em `mem_qrcodes` — o que falhava
era a chamada: `app_meu_qrcode()` estava com EXECUTE só pra `service_role`, e o
app chama com o JWT da pessoa (papel `authenticated`).

**Provado funcionalmente antes de escrever a migration**, não deduzido do
catálogo: `set local role authenticated; select public.app_meu_qrcode();` →
`permission denied for function app_meu_qrcode`. Depois do grant, o MESMO bloco
passa. ⚠️ E o app **descarta o erro** (`const { data: tk } = await
supabase.rpc(...)`, sem ler `error`), então o token virava null e a tela dizia
"indisponível" — **falha perfeitamente silenciosa**.

**⚠️ CAUSA:** o sweep de segurança que revogou `anon`/`authenticated` de ~114
funções SECURITY DEFINER partiu de *"o backend usa service_role, logo é imune"*.
A premissa vale pro backend e **não vale pro app mobile**, que fala direto com o
PostgREST usando a chave pública. **4 RPCs do app foram pegas.**

**⚠️⚠️ O RAIO ERA MAIOR QUE O SINTOMA:** além do QR, **o check-in de batismo pelo
app estava quebrado** (`app_batismo_checkin`) e ninguém havia reportado, junto de
marcar/desmarcar batismo em outra igreja. Das RPCs que o FRONT do ERP chama com a
anon key, a única (`app_marcar_senha_trocada`) manteve o grant e segue de pé.

**Por que re-conceder é SEGURO nas 4** (auditado uma a uma, não em bloco): todas
resolvem o alvo pelo **`auth.uid()`** — o parâmetro nunca escolhe a PESSOA, então
id de terceiro no argumento não alcança dado de terceiro.

| RPC | como resolve o alvo |
|---|---|
| `app_meu_qrcode()` | sem parâmetro · `profiles.id = auth.uid()` |
| `app_batismo_checkin(uuid)` | filtra `membro_id = v_membro` → id alheio devolve "Inscrição não encontrada" |
| `app_marcar_batizado_outra(text)` | `update … where id = v_membro` |
| `app_desmarcar_batizado_outra()` | idem |

⚠️ **`anon` não recebeu nada** — as quatro exigem pessoa autenticada.

- ⚠️⚠️ **A MARCA FICA NO CATÁLOGO** (`COMMENT ON FUNCTION` começando com
  `[GRANT authenticated OBRIGATÓRIO]`), não só no arquivo da migration: a
  varredura de segurança é feita **à mão no SQL Editor**, e quem varrer de novo
  precisa ver o motivo no próprio objeto. Conferido no catálogo: 4 linhas com
  `authenticated = true`, `anon = false`, marca presente.
- ⚠️ A migration **só faz GRANT + COMMENT** — nenhum corpo de função é tocado, de
  propósito: `CREATE OR REPLACE` a partir do arquivo do repo do app reverteria
  ajuste feito em produção depois (a lição do patch dinâmico do fanout).
- ⚠️ Os arquivos `supabase/*.sql` do **repo do APP** declaram esses grants, mas
  são **cópia de leitura** (o cabeçalho deles diz isso desde 08/08): quem cria e
  altera é a migration do ERP.
- **Inventário + guarda no gate**: `backend/utils/rpcsCliente.js` lista as RPCs
  chamadas com a chave pública, e `src/test/rpcsCliente.test.ts` (8 casos) exige
  que **cada uma tenha `grant execute … to authenticated` declarado em migration**
  — é a rede contra o erro mais provável (RPC nova no app sem o grant, que produz
  exatamente a mesma falha silenciosa). **Mutation-testado**: apagar um grant da
  migration deixa vermelho, e "consertar" com `service_role` **não** satisfaz.
  O teste também varre `src/` e exige que toda `supabase.rpc()` do front esteja
  no inventário.
- ⚠️ **A checagem ignora COMENTÁRIO antes de casar** — nos dois lados (SQL e JS).
  A 1ª versão do teste ficou vermelha por causa do comentário do PRÓPRIO teste,
  que cita a chamada como exemplo: a mesma armadilha de 06/08, agora no JS. E o
  `semComentariosJs` **não pode comer o `//` de uma URL** (`https://…`) — tem caso
  cobrindo.
- ⚠️ **NÃO listar no inventário RPC que só o BACKEND chama**: essas devem
  continuar restritas a `service_role`, e ampliar o grant delas é regressão de
  segurança. O critério é UM: *alguém chama isso com a chave pública?*

## ⚠️ Adapter do MERCADO PAGO (2026-08-06 · SEM migration)

`providers/mercadopago.js` — o único arquivo que conhece a linguagem do MP.
`'accredited'` em qualquer outro lugar é bug de arquitetura (lei nº 2). Fatos
levantados na doc oficial em 06/08 (não de memória), com o que NÃO foi
confirmado declarado como tal.

### As três coisas que o MP forçou a mudar no desenho

**1 · ⚠️⚠️ A Orders API (a recomendada) NÃO devolve taxa, líquido nem data de
liberação.** O schema de `transactions.payments[]` tem amount/paid_amount/
status/payment_method/discounts e mais nada. Quem tem `fee_details`,
`net_received_amount` e `money_release_date` é a **Payments API, marcada
"legacy"** ("will not receive new features, only security and stability fixes",
sem data de sunset).
Decisão: **escrever pela Orders API, ler pelas duas.** Pagamento que chega pela
Orders entra com `taxa_centavos: null` / `liquido_centavos: null` — que é a
resposta HONESTA ("o PSP não disse") e **não fere a lei nº 6**, que proíbe
CALCULAR taxa, não proíbe não tê-la. Pagamento pelo tópico `payment` (checkout
hospedado) traz os três e eles são usados.
⚠️ **Consequência aberta: a conciliação automática da TARIFA não fica de pé só
com este adapter.** Pix cai sem tarifa conhecida. Fechar isso exige o relatório
"Released money" do MP (produto separado) ou aceitar a API legada — **decisão de
arquitetura, não de implementação**, e ainda não tomada.

**2 · ⚠️⚠️ Nenhum prefixo distingue token de teste do de produção.** Citação
literal: *"The test Access Token starts with the prefix `APP_USR`, just like your
production Access Token."* Isso **mata a guarda do Asaas** (`$aact_hmlg_` ×
`$aact_prod_` conferido na chamada). A guarda foi reprojetada em duas partes:
(a) **`MERCADOPAGO_AMBIENTE`** declara a intenção; (b) **`live_mode`** — que vem
em toda resposta e em todo webhook — é conferido contra ela e **LANÇA** se
divergir. Os dois lados são fatais por motivos opostos: produção com token de
teste = a pessoa "paga" e nada entra; teste com token de produção = o ensaio
cobra de verdade. ⚠️ `live_mode` ausente **não** vira erro: nem toda resposta o
traz, e inventar erro onde não há sinal quebraria o fluxo por nada.

**3 · ⚠️ O webhook chega em DOIS tópicos.** `orders` (nosso Pix, via Orders API)
e `payment` (quem pagou pelo checkout hospedado). **Marcar só um no painel deixa
metade das entregas muda.** O adapter trata os dois; tópico desconhecido devolve
`null` e o núcleo registra sem despachar.

### Como o adapter mapeia no núcleo (e por que assim)

| momento | o que o adapter faz | por quê |
|---|---|---|
| `criarCobranca` | `POST /checkout/preferences` | a Orders API exige o `payment_method` na criação, e aí a pessoa **ainda não escolheu**. Sem um `provider_cobranca_id` aqui o núcleo trataria a linha como "meio-criada" e a retentaria pra sempre. A preference dá id + `init_point` (checkout que já funciona). |
| `definirMetodo('pix')` | `POST /v1/orders` | é onde o objeto cobrável de verdade nasce. Devolve o QR (`payment_method.qr_code`). |
| `definirMetodo('cartao')` | devolve o `init_point` guardado | PAN não entra aqui (lei nº 5). ⚠️ **NÃO devolve `parcelas`** — quem escolhe é o pagador na página do MP; afirmar o que foi PEDIDO violaria "a forma/parcela confirmada é a que o PSP devolveu". O número real chega no webhook. |
| `consultarStatus` | `GET /v1/orders/{id}` | só a ORDER é consultável; preference não tem estado de pagamento. Antes da escolha devolve `null` — honesto, e o núcleo lê null como "sem novidade". |

⚠️ **O vínculo estável entre preference e as N orders é o `external_reference`**
(= nossa `referencia`), não o id do provider. É por ele que o webhook reencontra
a cobrança quando o id é de outro objeto — e é o que torna seguro trocar de
forma de pagamento (cada troca cria outra order, todas com a mesma referência).

**Mudança no núcleo que isso exigiu:** `cobrancas.definirMetodo` passou a
persistir `provider_cobranca_id` quando o adapter devolve um. Sem repontar, o
cron de reconciliação ficaria consultando a preference, que nunca muda de
estado. O Asaas não devolve o campo e segue idêntico.

**E no contrato do webhook:** `verificarAssinatura` ganhou um 4º argumento
`{ query, payload }`. O manifesto do MP é montado com o `data.id` do **QUERY
STRING** (não do corpo) + o header `x-request-id`:
`id:<data.id minúsculo>;request-id:<x-request-id>;ts:<ts>;` → HMAC-SHA256 hex
comparado com o `v1` do header `x-signature`. ⚠️ O `;` final faz parte, e
**minusculizar é o caso NORMAL**: os ids da Orders API são ULIDs MAIÚSCULOS
(`ORD01J…`) e a doc manda converter. Sem passar a query, toda entrega legítima
tomaria 401.

### ⚠️ Boleto está FORA das capacidades, de propósito

O boleto do MP exige **endereço completo** do pagador (street_name,
street_number, zip_code, neighborhood, city, state) e **`pag_cobrancas` não
guarda endereço**. A fachada consulta `capacidades.metodos` pra decidir o que
oferecer na tela — declarar boleto abriria uma aba que **sempre** falha. Mesmo
racional do provider `manual`: declarar só o que se sabe fazer. Ligar boleto
exige coletar endereço na porta pública primeiro. Mutation-testado.

### ⏳ Pendente de GENTE (não é código)

1. **⚠️ Confirmar com o Mercado Pago se dá pra repassar juros do parcelado ao
   pagador.** A doc de API **não** documenta isso; o material comercial descreve
   o modelo "sem juros" em que **o custo é do vendedor** e a taxa cresce com o
   número de parcelas que o COMPRADOR escolher (à vista ~3%, 2–6x 4–6%, 7–12x
   7–13%). O sistema pressupõe `juros_repassados = true` desde 28/07. **Se o MP
   não repassar, esses 4–13% saem da margem da igreja** e mudam a conta do
   evento. Isso não se resolve no código.
2. **Gerar as credenciais** e setar `MERCADOPAGO_ACCESS_TOKEN`,
   `MERCADOPAGO_AMBIENTE`, `MERCADOPAGO_WEBHOOK_SECRET` +
   `PAG_PROVIDER_PADRAO=mercadopago`. Sandbox vai no escopo **Preview**;
   produção fica em `manual` até o teste passar.
3. **No painel do MP, marcar os tópicos `orders` E `payment`** e apontar o
   webhook pra `/api/pagamentos-webhook/mercadopago`.
4. **Decidir a fonte da tarifa** (item 1 do bloco de cima).

### ⚠️⚠️ O PRIMEIRO PAGAMENTO REAL (2026-08-08) — sete causas, e o que ficou de guarda

O sintoma inicial era um só: *"o botão de pagar carrega e não acontece nada"*.
Saíram **sete causas distintas**, cada uma só visível depois que a anterior saiu
do caminho. Registro aqui porque **nenhuma delas se descobre lendo código** — e
três já quase voltaram durante a própria sessão.

**1 · O valor ia como STRING pra Payments API.** `paraReais` devolve
`"900.00"` (formato da Orders API) e `POST /v1/payments` exige **número**:
`400 transaction_amount attribute must be numeric`. Daí `paraReaisNumero`.
⚠️ **E o teste que existia travava o comportamento ERRADO** (`toBe('900.00')`,
com o comentário "convenção deste adapter"): ele conferia o que o nosso código
fazia, não o que a API exige. Por isso 45 testes verdes conviviam com um cartão
que **nunca havia cobrado**. Quando o teste espelha a implementação em vez do
contrato externo, ele deixa de ser rede e vira confirmação.

**2 · ⚠️ As credenciais de TESTE foram aposentadas na Orders API.** Resposta
literal: *"Test credentials are not supported, use test users with production
credentials to sandbox environment"*. Isso obriga o sandbox a usar **credencial
de PRODUÇÃO de uma conta de teste**.

**3 · ⚠️⚠️ E isso NEUTRALIZOU a guarda de ambiente.** Com o ensaio obrigado a se
declarar `MERCADOPAGO_AMBIENTE=producao`, o `live_mode` deixou de distinguir
ensaio de produção — a proteção **parou de proteger sem ninguém mexer nela**.
Foi mudança de terceiro que esvaziou a premissa. No mesmo dia uma chave de
PRODUÇÃO da conta real da igreja foi parar no Preview; com um cartão real,
teria cobrado de verdade.
⇒ **`MERCADOPAGO_CONTA_ID`** ocupa esse lugar: o último segmento do Access Token
é o **id da conta**, conferido por escopo (Production = igreja · Preview =
vendedor de teste). ⚠️ Token `TEST-` é ignorado pela guarda — ela existe pra
impedir cobrança REAL, e credencial de teste não move dinheiro de conta nenhuma.
Fail-open sem a env (mesma régua do `live_mode` ausente).

**4 · Public Key e Access Token têm que ser do MESMO PAR** — mesma conta **e**
mesma aplicação **e** mesma versão (teste × produção). O navegador tokeniza com
uma e o servidor cobra com a outra; par trocado dá
`401 Unauthorized use of live credentials`, que não diz nada disso. Duas guardas:
o erro é traduzido, e `chavePublica()` devolve **null** quando as versões
divergem — aí o cartão na página some e a pessoa segue pelo checkout hospedado
(que só precisa do Access Token). ⚠️ Aba que sempre falha é pior que aba que não
existe — mesma régua do boleto sem endereço.

**5 · `external_reference` não aceita `:`.** Doc literal: *"máximo 64
caracteres, apenas letras, números, `-` e `_`"*, e não pode conter PII. A nossa
`inscricao:<uuid>` era recusada com `400 does not match pattern`. Conversão
**reversível** `:` ↔ `_` (nenhuma referência nossa usa `_`), porque é por ela que
o webhook reencontra a cobrança. ⚠️ `inscricao:<uuid>` já usa **46 dos 64** —
os sufixos de reemissão e bolsa passaram a base36 (`:r<8>` / `:b<8>`), senão
estouravam o teto na primeira reemissão.

**6 · Em conta de teste, o e-mail do pagador tem que ser `@testuser.com`.**
Regra que **só existe no sandbox** — o erro é traduzido dizendo explicitamente
pra NÃO mexer no código: forçar o domínio no pagador quebraria produção inteira.

**7 · ⚠️⚠️ Pix e cartão exigem credenciais INCOMPATÍVEIS no sandbox.** Doc:
cartão via Bricks pede *"as credenciais de TESTE da sua conta REAL"*; a Orders
API (Pix) pede **produção de conta de teste**. Não dá pra testar os dois na mesma
configuração — o próprio MP manda **trocar** as credenciais entre um teste e
outro. Era isso que fazia a investigação oscilar: cada ajuste consertava uma
forma e quebrava a outra, com a mesma mensagem nos dois casos.

| forma | credencial | `AMBIENTE` | e-mail do pagador |
|---|---|---|---|
| **Pix** (Orders API) | produção da conta de **teste** | `producao` | **precisa** ser `@testuser.com` |
| **Cartão** (Bricks) | **teste** da conta real | `teste` | **não** pode ser `@testuser.com` |

⚠️ Isso vale **só pro ensaio**. Em produção as duas usam a mesma credencial real
e convivem sem problema.

### ⚠️⚠️ E o bug que só apareceu porque o pagamento FUNCIONOU

Cobrança de R$ 5,00 gravou `valor_pago = R$ 5,05`, e o e-mail de confirmação saiu
com R$ 5,05. Causa: o adapter preferia **`total_paid_amount`** (o que o PAGADOR
desembolsou, incluindo o custo de financiamento que fica com o MP) a
**`transaction_amount`** (o valor da NOSSA cobrança que foi liquidado).

Três estragos ao mesmo tempo, e o do e-mail era o menor: `valor_pago >
valor_centavos` acusa na `vw_pag_invariantes`, e **o arrecadado somaria juros que
a igreja não recebe** — exatamente a classe de erro que a lei nº 6 existe pra
impedir. Num retiro parcelado, é a diferença entre o painel e o extrato.

⚠️ **Ele não trava nada e não gera erro.** Teria ido pra produção sem ninguém
notar até o dia do fechamento não bater. Régua que fica: **fluxo com dinheiro
precisa ser conferido no BANCO depois do primeiro sucesso**, não só na tela.

O payload cru passou a ser guardado na razão auxiliar (sem ele, conferir isso
virou arqueologia) — mas **SEM o bloco `card`**: o payment do MP traz
`expiration_month/year`, `first_six_digits` e `cardholder.name`, e a lei nº 5
proíbe ARMAZENAR validade e nome impresso. ⚠️ O teste *"NUNCA devolve PAN, CVV,
validade ou nome impresso"* pegou essa regressão na primeira versão escrita — a
guarda funcionou exatamente como foi desenhada.

### Confete: o gatilho é a RESPOSTA, nunca o clique

O confete vivia dentro do `carregar()`, e o pagamento na própria página atualiza
o estado direto da resposta do POST, sem passar pelo GET — então a inscrição era
confirmada **sem festejar**. Virou `aplicarPagamento()`, por onde passam os três
caminhos (carga, polling e cartão). ⚠️ A LEI segue intacta: só com
`pago === true` LIDO DO SERVIDOR.

### ⏳ Aberto (não é código)

- **Devolver as envs do Preview** pra configuração de Pix depois de testar cartão
  (as duas se excluem — ver tabela acima).
- **Produção segue no Asaas.** `PAG_PROVIDER_PADRAO` só muda por decisão do
  Matheus, e produção não tem credencial do MP.
- **`GET /pagamento/:token` responde 304** (cache condicional) numa rota que faz
  polling. Não causou estrago no teste, mas é a MESMA classe do que travou o app
  em 05/08 (resposta cacheada devolvendo estado velho). Olhar em PR própria.

### O que a doc NÃO confirmou (não preencher por conta própria)

`payment_method_id` do boleto na API legada (`"bolbradesco"` circula mas não
está em página oficial) · subcampos de `fee_details` · existência de
`money_release_status` · busca de order por `external_reference` · 3DS na Orders
API · valor mínimo/máximo por transação · nº máximo de reentregas de webhook.

Testes: `src/test/pagamentosMercadoPago.test.ts` (34 casos · **sem rede**, o
`fetch` é stubado — a lição é o flake dos testes do Asaas que batiam no sandbox
de verdade e derrubavam o deploy). Mutation-testados: a guarda de `live_mode`,
`authorized` não ser "pago", e a ausência de boleto nas capacidades.
