# Módulo de Inscrições · Fase 1 — Unificação dos formulários

**Data:** 2026-07-27 · **Base:** `origin/main` (commit 481e2ee2, 27/07 18:07) · **Método:** 4 varreduras campo-a-campo (7 portas + contrato transversal) + 2 verificações adversariais (migração sem perda · LGPD/completude), ambas **APROVADO COM CORREÇÕES** — correções já incorporadas.
**Status:** ✅ **DECISÕES D1–D9 FECHADAS PELO MARCOS EM 2026-07-27** (§10). Pronto para virar PRs (Fase 3.1). Specs do módulo na Fase 2: `inscricoes-fase2-specs.md`.

---

## 1. Sumário executivo

Hoje são **7 portas públicas de inscrição** gravando em **9 tabelas** (2 "legadas" — uma delas, `apresentacao_bebes`, na verdade **viva** via totem), com **7 modelos de status**, validações divergentes e **6+ cópias idênticas** dos mesmos helpers (CPF/telefone/máscaras). Duas portas (apresentação e eventos externos) estão **fora do grafo de identidade**: não usam matcher, não registram observação, não acumulam contato — o nome+telefone que entra ali não existe para o resto do sistema.

A Fase 1 **não move dado nenhum**: ela iguala as portas por cima (mesmos campos, mesmas validações, mesmo funil de identidade, mesmo registro de consentimento) e cria a **camada de leitura unificada** (`vw_inscricoes_unificadas`). Tudo aditivo, porta a porta, 1 PR por porta.

---

## 2. Radiografia — matriz portas × contrato (estado atual)

| Porta | Matcher | Observação identidade | CPF+DV | Nascimento | Consentimento LGPD | Origem | Dedup | Soft-delete |
|---|---|---|---|---|---|---|---|---|
| Grupos (`mem_grupo_pedidos`) | ✅ read-only | ✅ | ✅ obrig. | ✅ obrig. | ✅ **padrão-ouro** (termos+snapshot+IP/UA) | ✅ (CHECK desatualizado) | ✅ 3 camadas | ✅ |
| Líderes (`mem_lider_inscricoes`) | ✅ read-only | ✅ | ✅ obrig. | ✅ obrig. | ✅ (optin WhatsApp **hardcoded true**) | ❌ sem coluna | ⚠️ fraco (sem CPF, sem unique) | ✅ |
| Batismo (`batismo_inscricoes`) | ✅ **cria** | ✅ | ✅ obrig. | ✅ obrig. (rótulo diz "opcional" ⚠️) | ⚠️ só optin WhatsApp | ✅ | ✅ por membro/CPF (front esconde ⚠️) | ✅ |
| Next (`next_matriculas`) | ✅ **cria** | ✅ | ✅ obrig. | ⚠️ **opcional, sem validação** | ⚠️ só optin (não persiste na porta) | ✅ | ✅ app + 3 UNIQUEs | ✅ |
| Voluntariado (`vol_inscricoes`) | ✅ read-only | ✅ | ✅ obrig. | ✅ obrig. | ✅ antecedentes (Kids/Bridge) · sem termos gerais | ✅ (sem CHECK) | ❌ **nenhum** | ❌ **não tem** |
| Apresentação (`apresentacao_criancas`) | ❌ | ❌ | ✅ (write-only ⚠️) | ❌ (idade texto livre) | ❌ **zero — e é PII de menor** | ✅ (sem CHECK) | ❌ nenhum | ✅ |
| Eventos ext. (`ext_inscricoes`) | ❌ (`membro_id` morto) | ❌ | ❌ | ❌ | ❌ (e faz upload de imagem p/ bucket público) | ❌ sem coluna | ⚠️ por telefone com bug | ✅ |

Legadas na leitura: `next_inscricoes` (aposentada como escrita, ainda recebe `origem='app'` via fanout ⚠️) e `apresentacao_bebes` (**porta viva do Totem Membro**, com matcher e auditoria — mais completa que a pública).

---

## 3. O Contrato de Inscrição v1 (campos canônicos)

### 3.1 Bloco identidade (igual em toda porta)

| Campo | Regra canônica | Observações |
|---|---|---|
| `nome_completo` | ✅ D1: **1 campo único "Nome completo" em TODOS os formulários**, obrigatório, ≥ 2 palavras, **anti-abreviação** (`temAbreviacaoNome` vira util compartilhado) | Onde a tabela tem `nome`+`sobrenome`: split determinístico **1º token → `nome`, resto → `sobrenome`**. **Nenhum dado existente é alterado** — vale só pra inscrições novas |
| `telefone` | Obrigatório, máscara única, **10–11 dígitos** (piso E teto), gravado **digits-only** em todas | Grupos hoje grava mascarado → normaliza daqui pra frente + backfill com backup |
| `cpf` | ✅ D5: **obrigatório com DV em TODAS as portas, inclusive eventos externos/Celebra** ("tudo deve ter CPF") — sem configuração por evento | Inscrições antigas sem CPF continuam válidas e visíveis (regra só para novas); util único `cpfValido` |
| `data_nascimento` | ✅ D3: obrigatória e validada (ISO, data real, não-futura, ≥1900) em **todas** | Next muda opcional→obrigatório (**só na rota pública** — walk-in do totem não muda); apresentação ganha `crianca_data_nascimento date` mantendo `crianca_idade` legada |
| `email` | ✅ D2: **obrigatório e validado em TODAS as portas** (uniformizado pra cima, mesma régua do CPF) | Inscrições antigas sem e-mail continuam válidas (regra só para novas) |
| `sexo/genero` | ✅ D8 + ajuste 28/07: **OBRIGATÓRIO em todos os formulários** ("é só check rápido"), vocabulário **fixo `masculino\|feminino`** — **nunca "outro"**; conversão na escrita pro vocabulário local (`M/F` no batismo) — **valores armazenados não mudam** | Next liga o writer da coluna `sexo`; o `'outro'` do CHECK legado de `apresentacao_bebes` fica sem uso |
| `endereco` | ✅ ajuste 28/07: **campo fixo em todos os formulários, NÃO obrigatório** (aparece, mas ninguém é obrigado a preencher) | Batismo já tem (endereco+cep); líderes mantém a obrigatoriedade condicional de anfitrião; nas demais é opcional puro |

**Ajuste 28/07 — consequências por porta:** batismo: sexo passa de opcional→obrigatório (form) · apresentação: + sexo da criança (obrigatório) e + endereço do responsável (opcional) — colunas novas em M3 · next: writer do `sexo` obrigatório + coluna `endereco` (M7) · voluntariado: + colunas `sexo` e `endereco` (M6) · eventos externos: + colunas `sexo` e `endereco` (M2) · grupos: endereço opcional gravado em `mem_cadastros_pendentes.endereco` (coluna já existe) · líderes: já coleta os dois ✓. Obrigatoriedade sempre só para inscrições novas.

### 3.2 Bloco consentimento — **tabela-satélite única** (correção do verificador 2)

Em vez de ~30 colunas novas espalhadas por 6 tabelas, **uma tabela**:

```sql
CREATE TABLE inscricao_consentimentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  porta text NOT NULL CHECK (porta IN ('batismo','apresentacao','grupos','grupos_lider','next','voluntariado','evento_externo')),
  ref_id uuid NOT NULL,              -- id da linha na tabela da porta
  membro_id uuid REFERENCES mem_membros(id) ON DELETE SET NULL,
  tipo text NOT NULL CHECK (tipo IN ('termos_lgpd','imagem','menor_responsavel','whatsapp')),
  texto text NOT NULL,               -- snapshot do texto aceito (padrão mem_cadastros_pendentes)
  aceito boolean NOT NULL,
  em timestamptz NOT NULL DEFAULT now(),
  ip_origem text, user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON inscricao_consentimentos (porta, ref_id);
-- RLS: service_role FOR ALL; leitura super-admin. Sem acesso anon/authenticated.
```

Regras:
- **`termos_lgpd`** obrigatório em toda porta (texto por porta, com finalidade incluindo coleta de IP/UA).
- **`menor_responsavel`** na apresentação: consentimento **específico e destacado de um dos pais** (LGPD art. 14 §1º) — não basta termo genérico (D6: texto com jurídico/JU).
- **`imagem`** (opcional, não bloqueia): batismo (fotos da cerimônia — destrava o item 7 da revisão estrutural) + apresentação + eventos externos **quando o evento tem campo tipo imagem** (upload vai pra bucket público — hoje sem consentimento nenhum).
- **`whatsapp`**: o estado operacional continua colunar (`whatsapp_optin`/`_em` — padrão existente), o **ato** é espelhado na satélite pra auditoria.
- Batismo: `consentimento_em` existente é da **selfie biométrica do quiosque** — não reaproveitar, não tocar.
- A satélite já nasce no formato da espinha da Fase 2 (porta+ref_id = ponte pronta).

### 3.3 Bloco técnico (toda porta)

- **Matcher**: batismo/next mantêm `acharOuCriarGuardado` (criam visitante); grupos/líderes/vol mantêm `acharMembroGuardado` (read-only + fila humana); **apresentação e eventos externos GANHAM** read-only + `registrarObservacaoSegura` (`apresentacao_formulario` / `evento_externo_formulario`). Apresentação: matcher no **responsável** → nova `responsavel_membro_id`; **nome do responsável passa a ser obrigatório no server** (hoje aceita pai E mãe vazios — sem nome o matcher não liga nada).
- **Origem**: coluna em todas, vocabulário canônico `formulario_publico|manual|totem|app|next|importacao` para escritas novas; valores antigos intocados (a view normaliza).
- **Honeypot ponta-a-ponta**: batismo hoje é client-only (**o front não envia `website`**) e apresentação idem — corrigir **front (enviar) + back (tratar)** juntos, senão continua caminho morto.
- **Anti-duplo-clique** (`submittingRef`) em todas (falta em líderes).
- **Dedup por porta — chaves nomeadas**:
  - vol: `(cpf OU membro_id) × status IN (inscrito, enviado_ministerio)` → `ja_inscrito` (hoje: **nada**);
  - apresentação: `(cpf_responsavel, crianca_nome normalizado, data_apresentacao)` → `ja_inscrito`;
  - ext: fix do `.maybeSingle()` que ignora `error` (usar `limit(2)` + tratar); com CPF universal (D5), a chave de dedup das inscrições NOVAS passa a ser **`(evento_id, cpf)`** (telefone segue como chave secundária p/ compatibilidade com as antigas) → saneamento → UNIQUEs parciais;
  - líderes: adicionar CPF explícito à checagem (hoje só membro_id/telefone);
  - lotação do batismo: corrida rara conhecida (sem constraint) — fica pra Fase 2 (trigger/lock).
- **Soft-delete + trigger `updated_at`** em todas (faltam: vol sem `deleted_at`; líderes/apresentação/next/vol sem trigger).
- **Utils únicos**: `src/lib/inscricao/` (front: máscaras, `cpfValido`, `validarNascimento`, `temAbreviacaoNome`, honeypot, hook de submit) + `backend/services/inscricaoPorta.js` (normalizações + `processarIdentidade({sinais, politica, origem, origemId})` + `registrarConsentimentos()`). Mata as 6+ cópias.

---

## 4. Mudanças por formulário (o que muda em cada porta)

### 4.1 Batismo — `InscricaoBatismo.tsx` / `publicBatismo.js` / `batismo_inscricoes`
**Form:** nascimento perde o rótulo "(opcional)" (server já exige) + validação de data real; nome vira campo único com anti-abreviação; **enviar `website` no payload**; **tratar `duplicado:true`** (hoje mostra "Inscrição confirmada!" e esconde a mensagem real); validar `horario_culto` no submit; + checkbox termos LGPD; + checkbox consentimento de imagem (opcional); sexo com vocabulário canônico (grava `M/F` como hoje).
**Back:** tratar honeypot; consentimentos → satélite; fix de fuso em `proximoQuartoDomingoISO` (`toISOString()` → `fmtLocalISO`, o mesmo padrão da apresentação). **`rejeitado` NÃO entra no CHECK** (verificador 1): as referências defensivas a `rejeitado` são código morto — limpar num PR de código, não legalizar o status.
**Banco:** nenhuma coluna nova (consentimento vai pra satélite). Downstream intocado (6 triggers, KPIs, jornada).

### 4.2 Apresentação de crianças — a porta mais fraca
**Form:** + `crianca_data_nascimento` (picker por criança; `crianca_idade` continua exibida/derivada); nome do responsável obrigatório (campo único "Nome completo", D1); + **e-mail obrigatório** (D2); + **CPF já obrigatório** ✓; + **termos LGPD de menor** (específico/destacado) obrigatório; + consentimento de imagem opcional; enviar `website`.
**Back:** validar responsável no server; matcher read-only no responsável → `responsavel_membro_id` + observação de identidade; dedup (§3.3); **efeito colateral no Kids corrigido**: `kids_criancas` ganha nascimento, dedup por (nome, nascimento) e **vínculo `kids_responsaveis`** quando o matcher achar o responsável (hoje cria criança órfã e permanente sem consentimento).
**Banco (M3):** + `responsavel_membro_id uuid` FK; + `crianca_data_nascimento date`; + `email text`; CHECK de status em 2 passos (**sanear valores atuais antes do VALIDATE** — o PATCH sempre passou status cru); trigger `updated_at`.
**Fase 2 (não agora):** fundir com `apresentacao_bebes` — até lá, as duas entram na view como fontes distintas.

### 4.3 Grupos — o gabarito; muda o mínimo
**Back:** telefone digits-only na gravação do pedido (novas) + backfill dos existentes **com backup prévio** (`CREATE TABLE _bk_... AS SELECT id, telefone ...`) + **validar `contato_divergente` em amostra pós-backfill** (verificador 1); espelhar termos na satélite (continua também em `mem_cadastros_pendentes`).
**Banco (M5):** ampliar CHECK de `origem` += `app|totem|mapa` — ⚠️ isso **destrava o fanout do app que hoje falha em silêncio**: antes de aplicar, testar que `fn_app_inscricoes_fanout` satisfaz o XOR `chk_pedido_um_solicitante` e que o pedido criado dispara caixa/notificação/WhatsApp corretamente.

### 4.4 Líderes
**Form:** + `submittingRef`; teto de telefone 11; opt-in WhatsApp → **D4** (explícito default false × manter implícito documentado como legítimo interesse).
**Back:** dedup ganha CPF explícito; termos → satélite.
**Banco (M4):** + `origem text NOT NULL DEFAULT 'formulario_publico'` CHECK (`formulario_publico|manual`); trigger `updated_at`.

### 4.5 Next
**Form:** nascimento obrigatório (D3); **remover o select decorativo de evento** (`evento_id` é descartado pelo back desde a migração pra turmas); nome único + anti-abreviação; teto telefone; + termos LGPD; + sexo opcional (liga o writer da coluna).
**Back:** validação de nascimento **escopada em `POST /inscrever`** (o walk-in `POST /checkin/:token/walkin` não muda — verificador 1); gravar `whatsapp_optin` na própria matrícula além de `mem_membros`; `ja_voluntario` passa a checar por `membro_id` além de CPF.
**Banco (M7):** + `whatsapp_optin boolean NOT NULL DEFAULT false`, + `whatsapp_optin_em timestamptz`.

### 4.6 Voluntariado
**Form:** nome+sobrenome viram **campo único "Nome completo"** (D1); resto mantém (já é o gabarito de validação).
**Back:** **dedup no POST** (hoje zero — reenvio duplica); termos gerais → satélite (antecedentes continua em `vol_background_checks`).
**Banco (M6, em 2 etapas — verificador 1):**
- **M6a:** + `deleted_at` + trigger `updated_at` + **filtro `deleted_at IS NULL` em TODOS os leitores na mesma PR**: `voluntariado.js:3356-3870`, `VolInscricoes.tsx`, `VoluntariadoInscricoesKids.tsx`, dedup do fanout (`20260706120000:61-70`), `nextDirecionar.js:119-121`, e a query do KPI `solicitacoes_servir_*`.
- **M6b (depois, verificado):** entrada na whitelist `app_soft_deletable_tables()`.
- Índice único parcial: **só depois** do saneamento das duplicatas existentes.

### 4.7 Eventos externos — a porta que mais muda
**Form:** campos fixos passam ao padrão completo — **nome completo (anti-abrev) + telefone + CPF + e-mail + nascimento** (D5/D2/D3: obrigatórios, sem configuração por evento); + termos LGPD obrigatório; + consentimento de imagem quando o evento tiver campo tipo `imagem`; `website` já é enviado ✓. Inscrições antigas (só nome+telefone) permanecem intactas e visíveis.
**Back:** matcher read-only → `membro_id` (a FK morta ganha writer) + observação de identidade; dedup corrigido (§3.3); **re-inscrição faz merge preservador**: nunca sobrescreve valor existente com vazio, e a versão anterior de `dados` vai pra `dados_anterior` (verificador 1); **form-builder: `key` vira estável** (gerada 1×; editar o label não regera — hoje orfana as respostas antigas); isenção do `publicLimiter` global de 30/15min (padrão grupos/NPS — evento presencial num NAT trava na 31ª pessoa), mantendo o limiter próprio por rota (D9).
**Banco (M1/M2):**
- **M1 `ext_eventos`:** + `capa_url` (`IF NOT EXISTS` — **regulariza o schema drift**: a coluna existe em prod sem migration). ~~`exigir_cpf`/`exigir_email`~~ **mortos por D5/D2** — CPF e e-mail são obrigatórios sempre, sem toggle.
- **M2 `ext_inscricoes`:** + `status text NOT NULL DEFAULT 'confirmada'` CHECK (`confirmada|cancelada`), + `origem text NOT NULL DEFAULT 'formulario_publico'`, + `cpf text`, + `data_nascimento date`, + `whatsapp_optin boolean NOT NULL DEFAULT false`, + `whatsapp_optin_em`, + `updated_at` + trigger, + `dados_anterior jsonb`.

---

## 5. Ontologia de status canônico (só na leitura — nenhuma tabela muda seus valores)

`recebida → em_tratamento → confirmada → concluida | nao_concluida | recusada | cancelada`

| Tabela | Mapeamento (CASE na view) |
|---|---|
| `batismo_inscricoes` | pendente→recebida · confirmado→confirmada · realizado→concluida · cancelado→cancelada |
| `apresentacao_criancas` | pendente→recebida · confirmado→confirmada · realizado→concluida · cancelado→cancelada |
| `apresentacao_bebes` (**viva**, CASE próprio) | agendada→confirmada · confirmada→confirmada · realizada→concluida · cancelada→cancelada |
| `mem_grupo_pedidos` | pendente→recebida · devolvido/encaminhado→em_tratamento · aprovado→concluida · rejeitado→recusada · cancelado→cancelada |
| `mem_lider_inscricoes` | pendente→recebida · aceito→em_tratamento · vinculado→concluida · recusado→recusada |
| `next_matriculas` | matriculado sem turma→recebida (espera) · matriculado com turma→confirmada · formado→concluida · incompleto→nao_concluida · desistiu→cancelada |
| `vol_inscricoes` | inscrito→recebida · enviado_ministerio/kids→em_tratamento · integrado→concluida · nao_responde→nao_concluida · nao_pode_ou_duplicata→recusada |
| `ext_inscricoes` | confirmada→confirmada · cancelada→cancelada |
| `next_inscricoes` (legada) | sem status → confirmada + flag `legado` |

**M9 `vw_inscricoes_unificadas`:** UNION ALL das 9 fontes com `porta, id, rota_detalhe, membro_id, nome_display, telefone_norm, cpf_norm, email_norm, criado_em, status_original, status_canonico, origem_norm`; filtra `deleted_at IS NULL`; normalizações via `regexp_replace` na leitura (valores armazenados intocados). **`REVOKE ALL FROM anon, authenticated`** — acesso só via backend (a UI do módulo vem na Fase 2).

---

## 6. Plano de migração sem perda — princípios

1. **Só ADD** — nenhuma coluna/tabela é dropada, renomeada ou tem tipo alterado.
2. **Valores existentes intocados** — normalização acontece na leitura (view); exceção única: backfill de telefone em `mem_grupo_pedidos` (formatação, sem perda semântica), com **backup-select prévio** e validação de `contato_divergente` em amostra.
3. **Obrigatoriedade nova vale só para inscrições novas** — enforcement na aplicação; **nunca** `NOT NULL` retroativo (linhas antigas ficam NULL e a view convive com isso).
4. **CHECK novo em coluna existente** = query de valores distintos → sanear → `ADD CONSTRAINT ... NOT VALID` → `VALIDATE`.
5. **Índice UNIQUE só depois de sanear duplicatas** existentes; até lá, dedup aplicativo.
6. **Tabelas legadas**: `next_inscricoes` zero-touch (entra na view); `apresentacao_bebes` é **porta viva** — zero-touch no schema, mas tratada como fonte ativa.
7. **Toda migration idempotente** (`IF NOT EXISTS`/`WHERE NOT EXISTS`), aplicada manualmente **antes** do merge (regra do repo), com rollback documentado (o rollback de ADD é DROP da coluna nova — sem tocar dado antigo).
8. **Verificação pós-deploy por porta**: contagem antes/depois, inscrição de teste ponta-a-ponta, linha visível na view, notificação disparada.

### Ordem de rollout (1 PR por porta, menor risco → maior downstream)

| # | PR | Conteúdo | Migrations |
|---|---|---|---|
| 0 | utils + satélite | `src/lib/inscricao/` + `inscricaoPorta.js` + tabela `inscricao_consentimentos` | M0 |
| 1 | eventos externos | §4.7 | M1, M2 |
| 2 | apresentação | §4.2 | M3 |
| 3 | líderes | §4.4 | M4 |
| 4 | voluntariado | §4.6 | M6a (M6b depois) |
| 5 | next | §4.5 | M7 |
| 6 | batismo | §4.1 (sem migration de schema) | — |
| 7 | grupos | §4.3 (recém-lançado → por último, mínimo) | M5 + backfill |

---

## 7. Bugs reais corrigidos de carona

1. Fanout do app → `mem_grupo_pedidos` com `origem='app'` **falha em silêncio** desde sempre (CHECK não aceita) — M5 corrige (com teste do XOR antes).
2. Batismo: resposta `duplicado:true` exibida como **"Inscrição confirmada!"** — a pessoa nunca vê a mensagem real.
3. Honeypots mortos: batismo (front não envia `website`; back não trata) e apresentação (front não envia; back trata em vão).
4. Ext: dedup com `.maybeSingle()` **ignorando `error`** — em corrida, cria 3ª linha do mesmo telefone.
5. Ext form-builder: editar o **label** de uma pergunta regera a `key` e **orfana todas as respostas antigas**.
6. Batismo: `proximoQuartoDomingoISO` usa `toISOString()` (UTC) — risco de data errada perto da meia-noite; apresentação já usa `fmtLocalISO` (correto).
7. Next: `evento_id` coletado no form e **descartado** pelo backend; coluna `sexo` sem writer.
8. Next: `ja_voluntario` consulta `vol_profiles` **só por CPF** (ignora membro_id).
9. Apresentação: cria criança em `kids_criancas` **órfã** (sem responsável, sem nascimento, sem consentimento) a cada envio, sem dedup.
10. Ext sob `publicLimiter` 30 req/15min por IP — em evento presencial (NAT), a 31ª pessoa é bloqueada (grupos e NPS já foram isentados por esse motivo).

---

## 8. LGPD — pontos que o contrato resolve e os que ficam abertos

**Resolve:** termos com snapshot+IP/UA em todas as portas; consentimento específico de menor na apresentação; consentimento de imagem no batismo/apresentação/ext (upload público!); optin WhatsApp explícito e auditável; PII de menor deixa de entrar sem consentimento no Kids.
**Fica aberto (Fase 2 / DPO):** política de **retenção/expurgo** por porta (ext é o candidato óbvio: expurgar PII N meses pós-evento); destino dos optins históricos de líderes (hardcoded true); revisão do bucket público de imagens do ext (mover pra bucket privado com URL assinada).

---

## 9. O que a Fase 1 habilita (preview da Fase 2)

Contrato + satélite de consentimentos + view = a fundação. A Fase 2 especifica: a **espinha `inscricoes`** (tronco + extensão por tipo — portas novas nascem nela; o **retiro pago** é a primeira), o **módulo /inscricoes** (UI: busca única, filas por porta, relatórios, form-builder unificado), **pagamentos** (Pix Santander → PSP cartão) e **check-in** genérico. As portas legadas migram pra espinha uma a uma na Fase 3.

---

## 10. Decisões — ✅ FECHADAS PELO MARCOS (2026-07-27)

| # | Decisão | Resolução |
|---|---|---|
| D1 | Campos de nome | **Campo único "Nome completo" em TODOS os formulários** (padrão universal); split determinístico na gravação (1º token→`nome`, resto→`sobrenome`) onde a tabela exige; **nenhum dos ~4.000 cadastros existentes é alterado** |
| D2 | E-mail | **Obrigatório em todas as portas** (só para inscrições novas) |
| D3 | Nascimento | **Obrigatório em todas** (Next uniformizado; walk-in do totem intocado) |
| D4 | Opt-in WhatsApp | **Checkbox explícito, default false, em todas** (inclusive líderes) + texto de consequência: *"Se você não marcar, não conseguiremos te enviar confirmações, lembretes e avisos pelo WhatsApp."* Históricos: re-classificar com jurídico depois |
| D5 | CPF | **"TUDO DEVE TER CPF"** — obrigatório em todas as portas, inclusive eventos externos/Celebra; sem configuração por evento (toggle morto) |
| D6 | Consentimento de menor | Padrão simples redigido por nós agora (responsável + finalidade + direitos); refinamento jurídico depois — risco aceito pelo Marcos |
| D7 | Retenção/expurgo | **Nada é apagado** até política definida com DPO (postergado, não bloqueia) |
| D8 | Sexo | **Sempre e somente masculino/feminino** — nunca "outro" em nenhum formulário |
| D9 | Rate-limit dos eventos externos | **Sem teto prático de inscrições** — isentar do limiter global por IP (padrão grupos/NPS), mantendo só a proteção anti-robô por rota |

---

*Gerado em 2026-07-27 por análise assistida (4 varreduras + 2 verificações adversariais). Fontes: inventários campo-a-campo com paths/linhas de `origin/main@481e2ee2`.*
