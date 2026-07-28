# Módulo de Inscrições · Fase 2 — Especificações

**Data:** 2026-07-27 · **Pré-requisito:** Fase 1 (`inscricoes-fase1-unificacao.md`, decisões D1–D9 fechadas) · **Status:** specs prontas para implementação (Fase 3, faseada em F3.1–F3.5).

**Princípio-mãe (Marcos):** *"Toda nova inscrição cadastrada nesse módulo deve nascer com os campos padrão em todos os formulários (Nome, Telefone, CPF, …) e a opção de adicionar campo novo."* O módulo é o cérebro: define o padrão, guarda o tronco dos dados e replica pros membros (módulos finais = espelhos operacionais).
**Garantia inegociável:** nenhuma inscrição existente se perde — em especial as do Celebra (`ext_inscricoes`, só nome+telefone): elas permanecem intactas, visíveis e contadas, com os campos novos vazios.

---

## SPEC-00 · Arquitetura — a espinha

### Conceito
- **`insc_eventos`** = "o que abre inscrição" (um Celebra, um retiro, uma turma futura). Dono do formulário (campos padrão travados + extras), das vagas, da janela, do pagamento e do check-in.
- **`inscricoes`** = o tronco: 1 linha por pessoa × evento, com os campos padrão canônicos + `dados jsonb` (respostas dos campos extras).
- **`inscricao_consentimentos`** (criada na F1) = atos de consentimento (termos, imagem, menor, whatsapp) por porta+ref.
- **`insc_pagamentos`**, **`insc_checkins`**, **`insc_sorteios`** = extensões do tronco.
- **Portas novas nascem aqui.** As 6 portas legadas (batismo, next, voluntariado, grupos, líderes, apresentação) continuam nos satélites e aparecem juntas via `vw_inscricoes_unificadas`; migram uma a uma na F3.5.

### Schema (migrations F2 — todas idempotentes, padrão PII do CLAUDE.md: RLS + audit)

```sql
insc_eventos (
  id uuid PK, nome text NOT NULL, slug text NOT NULL UNIQUE,
  tipo text NOT NULL DEFAULT 'evento' CHECK (tipo IN ('evento','retiro')),  -- amplia na F3.5
  descricao text, data date, hora text, local text, capa_url text,
  campos jsonb NOT NULL DEFAULT '[]',            -- SÓ os extras (form-builder; key estável)
  -- (ajuste 28/07: sexo e endereço viraram campos padrão universais — sexo obrigatório,
  --  endereço opcional — então NÃO há toggles de campos-padrão por evento)
  vagas int NULL,                                -- NULL = ilimitado
  inscricoes_abrem_em timestamptz, inscricoes_encerram_em timestamptz,
  msg_sucesso_titulo text, msg_sucesso_texto text, msg_whatsapp text,
  tem_sorteio boolean NOT NULL DEFAULT false, premios jsonb NOT NULL DEFAULT '[]',
  pagamento_ativo boolean NOT NULL DEFAULT false, valor_centavos int NULL,
  pagamento_metodos text[] NOT NULL DEFAULT '{}',      -- {'pix'} fase A; +'cartao' fase B
  pagamento_expira_horas int NOT NULL DEFAULT 48,
  checkin_ativo boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'rascunho' CHECK (status IN ('rascunho','publicado','encerrado','arquivado')),
  igreja_id uuid REFERENCES igrejas(id), created_by uuid REFERENCES profiles(id),
  created_at/updated_at (trigger)/deleted_at
)

inscricoes (
  id uuid PK, evento_id uuid NOT NULL REFERENCES insc_eventos(id) ON DELETE CASCADE,
  membro_id uuid REFERENCES mem_membros(id) ON DELETE SET NULL,
  nome_completo text NOT NULL, telefone text NOT NULL,          -- digits-only
  cpf text NOT NULL,                                            -- DV validado (D5); NULL só em linha migrada legada
  email text NOT NULL,                                          -- (D2); idem
  data_nascimento date NOT NULL,                                -- (D3); idem
  sexo text CHECK (sexo IN ('masculino','feminino')),           -- (D8 + 28/07) OBRIGATÓRIO p/ novas (app-level; NULL só em migrada legada)
  endereco text, cep text,                                      -- campo fixo opcional (28/07)
  dados jsonb NOT NULL DEFAULT '{}', dados_anterior jsonb,      -- extras + snapshot pré-merge
  status text NOT NULL DEFAULT 'confirmada'
    CHECK (status IN ('recebida','confirmada','cancelada')),    -- 'recebida' = pagamento pendente
  origem text NOT NULL DEFAULT 'formulario_publico',
  numero_sorte int,                                             -- só se tem_sorteio
  legado_ref uuid, legado_fonte text,                           -- id/tabela de origem na migração (SPEC-04)
  whatsapp_optin boolean NOT NULL DEFAULT false, whatsapp_optin_em timestamptz,
  created_at/updated_at (trigger)/deleted_at
)
-- UNIQUEs parciais (WHERE deleted_at IS NULL): (evento_id, cpf) · (evento_id, numero_sorte)
-- NOT NULLs acima valem para o schema NOVO; linhas migradas de legado entram com placeholders NULL-safe
--   via colunas nullable + CHECK condicionado a legado_fonte IS NULL (detalhe na SPEC-04).

insc_pagamentos (
  id uuid PK, inscricao_id uuid NOT NULL REFERENCES inscricoes(id) ON DELETE CASCADE,
  metodo text NOT NULL CHECK (metodo IN ('pix','cartao')),
  provider text NOT NULL CHECK (provider IN ('santander','psp')),
  provider_ref text, valor_centavos int NOT NULL,
  status text NOT NULL DEFAULT 'pendente'
    CHECK (status IN ('pendente','aguardando','pago','expirado','estornado')),
  qr_payload text, expira_em timestamptz, pago_em timestamptz,
  estornado_por uuid, estorno_motivo text,
  webhook_log jsonb NOT NULL DEFAULT '[]',
  created_at/updated_at (trigger)
)  -- UNIQUE parcial (inscricao_id) WHERE status IN ('pendente','aguardando','pago')

insc_checkins ( id uuid PK, inscricao_id uuid NOT NULL UNIQUE REFERENCES inscricoes(id) ON DELETE CASCADE,
  em timestamptz NOT NULL DEFAULT now(), por uuid REFERENCES profiles(id), modo text CHECK (modo IN ('busca','qr')) )

insc_sorteios ( id, evento_id, premio, numero_sorteado, inscricao_id, ganhador_nome, sorteado_em, sorteado_por )  -- espelho do ext
```

**RLS:** leitura `current_user_module_level('inscricoes') >= 1`; escrita ≥3; service_role FOR ALL; público via backend (service_role) apenas. **Audit:** `audit_log_changes` em `inscricoes` (nome, telefone, cpf, email, status, deleted_at) e `insc_pagamentos` (status, valor).

**Critérios de aceite:** migrations aplicadas idempotentes; RLS testada (usuário nível 0 não lê); audit gravando; soft-delete na whitelist.

---

## SPEC-01 · Módulo `/inscricoes` (UI staff)

**Menu:** grupo Planejamento (substitui "Eventos Externos"; a rota `/eventos-externos` redireciona). Catálogo: slug `inscricoes` (padrão "adicionar novo módulo" do CLAUDE.md — INSERT em `modulos` + seed da matriz copiando de `eventos-externos`).

**Telas:**
1. **Lista de eventos** — cards (capa, nome, data, status, inscritos/vagas, pagos se pago, check-ins). Filtro rascunho/publicado/encerrado/arquivado. Botão "Novo evento".
2. **Criar/editar evento** — abas:
   - **Básico:** nome, slug (auto), tipo, data/hora/local, descrição, capa, vagas, janela de inscrições, mensagens de sucesso/WhatsApp.
   - **Formulário:** bloco fixo no topo, visível e **não removível**: *"Campos padrão em todos os formulários: Nome completo · Telefone · CPF · E-mail · Data de nascimento · Sexo · Endereço (opcional) · Aceite de termos · Opt-in WhatsApp"*; abaixo, **"➕ Adicionar campo"** — tipos: texto, textarea, e-mail-extra, select, escolha, múltipla, rede social, imagem, número, data. **`key` gerada 1× na criação e NUNCA regerada** ao editar o rótulo (fix do bug da F1); reordenação drag; obrigatório on/off por campo; campo tipo imagem liga automaticamente o consentimento de imagem no form público.
   - **Pagamento** (se `pagamento_ativo`): valor, métodos, prazo de expiração, texto do comprovante.
   - **Sorteio:** liga/desliga + prêmios (espelho do ext).
3. **Detalhe do evento / inscritos** — tabela com busca (nome/CPF/telefone), status, pagamento, check-in; ações: editar respostas (merge preservador), cancelar (soft), reativar, **exportar CSV** (`pode_exportar` da matriz); botão sorteio (roleta, como hoje); QR + link de divulgação; contadores ao vivo.

**Critérios de aceite:** criar evento → publicar → link público funciona; campo custom criado, renomeado (label) e as respostas antigas continuam ligadas (key estável); export respeita `pode_exportar`; evento `rascunho` inacessível ao público.

---

## SPEC-02 · Página pública unificada (`/evento/:slug` — engine novo)

**Fluxo:** carregar evento publicado → form = campos padrão (D1–D8) + extras → validações client (utils F1) → POST → server:
1. Honeypot `website` (fake-success) + rate-limit próprio da rota + **isenção do limiter global por IP** (D9 — padrão grupos/NPS; sem teto prático de inscrições).
2. Validação server (espelho do client, sempre): nome ≥2 palavras anti-abreviação, telefone 10–11, **CPF+DV**, **e-mail**, **nascimento**, **sexo** (masculino/feminino), endereço opcional, extras obrigatórios do evento.
3. Janela/vagas: fora da janela → 403; `vagas` atingidas → 409 "evento lotado" (contagem `status != 'cancelada'`).
4. **Matcher read-only** (`acharMembroGuardado`) → `membro_id`; `registrarObservacaoSegura(origem:'inscricoes_formulario', origemId)`.
5. **Dedup por `(evento_id, cpf)`** → `ja_inscrito` com atualização merge-preservadora de `dados` (nunca sobrescreve com vazio; anterior vai pra `dados_anterior`).
6. Consentimentos → `inscricao_consentimentos` (termos sempre; imagem se aplicável; whatsapp espelhado).
7. Status: sem pagamento → `confirmada`; com pagamento → `recebida` + cria `insc_pagamentos` (SPEC-05).
8. Sucesso: mensagem custom + número da sorte (se sorteio) + **comprovante com QR** (código da inscrição, pro check-in) + botão de grupo/WhatsApp se configurado. Opt-in não marcado → mostra o aviso D4.

**Critérios de aceite:** inscrição feita em <1 min; reenvio do mesmo CPF não duplica e preserva respostas; 31+ inscrições do mesmo Wi-Fi passam; sem CPF válido não grava; observação de identidade criada; membro existente linka.

---

## SPEC-03 · Visão unificada ("Todas as inscrições")

Aba do módulo sobre **`vw_inscricoes_unificadas`** (F1) ∪ espinha: busca única por nome/CPF/telefone em TODAS as portas (batismo, next, voluntariado, grupos, líderes, apresentação, eventos, legadas), filtros porta/status-canônico/período/origem, e **link profundo pro módulo dono** (a operação continua lá — espelho, não substituto). Endpoint backend `GET /api/inscricoes/unificadas` (`authorizeModule('inscricoes',1)`); a view permanece sem acesso direto anon/authenticated.

**Critérios de aceite:** uma busca por CPF retorna a pessoa em todas as portas em <2s; clique leva à tela certa do módulo dono; contagens por porta batem com os módulos (amostra).

---

## SPEC-04 · Migração Eventos Externos → espinha (1ª porta · SEM PERDER O CELEBRA)

1. **Congelamento suave:** eventos NOVOS nascem em `insc_eventos`; eventos `ext_*` existentes continuam funcionando no motor antigo até terminarem (side-by-side; nada quebra no meio de um evento aberto).
2. **Backfill (após validação):** copiar `ext_eventos`→`insc_eventos` e `ext_inscricoes`→`inscricoes` com `legado_ref`=id original, `legado_fonte='ext_inscricoes'`, campos ausentes NULL (CPF/e-mail/nascimento das antigas **ficam vazios e é ok** — o CHECK de obrigatoriedade só vale para `legado_fonte IS NULL`), `status='confirmada'`, `dados` copiado como está, `numero_sorte` preservado.
3. **Verificação obrigatória:** `count(ext_inscricoes deleted_at null)` = `count(inscricoes where legado_fonte='ext_inscricoes')`, por evento; amostra de 20 linhas comparadas campo a campo; sorteios históricos conferidos.
4. **Tabelas `ext_*` NÃO são dropadas** — ficam read-only (revoga escrita no código), fora do menu, na view como fonte redundante desligável só após 1 ciclo de eventos sem divergência.
5. Redirects `/eventos-externos*` → `/inscricoes`; a página pública antiga `/evento/:slug` passa a resolver primeiro na espinha, senão no ext (transição transparente pros QRs já impressos).

**Critérios de aceite:** zero diferença de contagem; QR antigo do Celebra continua abrindo; evento aberto durante a virada não perde inscrição nenhuma.

---

## SPEC-05 · Pagamentos (retiro)

**Fase A — Pix (Santander, sem taxa de PSP):** ao inscrever em evento pago → `insc_pagamentos` `pendente` → gera cobrança via `pixCobrancaService` existente → tela de sucesso mostra QR + copia-e-cola + prazo (`pagamento_expira_horas`) → `aguardando`. **Webhook/conciliação** (mesmo canal já usado pelo financeiro) → `pago` → inscrição `recebida→confirmada` + WhatsApp de confirmação via fila. Expirou → `expirado` + inscrição `cancelada` (libera vaga) + aviso. Reabertura: pessoa se reinscreve (dedup detecta e gera nova cobrança).
**Fase B — Cartão (PSP checkout hospedado):** redirect/checkout link; **nenhum dado de cartão no nosso servidor**; webhook **assinado fail-closed** (padrão Meta) + idempotência por `provider_ref`.
**Painel no evento:** pagos/aguardando/expirados/estornados + total arrecadado; **estorno** manual só com `pode_aprovar` da matriz, com motivo, audit log.
**Contábil:** receita de evento categorizada no plano de contas próprio (nunca contribuição; regra do CLAUDE.md sobre receita ordinária).

**Critérios de aceite:** máquina de estados sem transição inválida; pagamento confirmado libera confirmação em <1 min da conciliação; vaga de expirado volta ao pool; estorno sem `pode_aprovar` → 403.

---

## SPEC-06 · Check-in

Modo check-in por evento (`checkin_ativo`): tela fullscreen (padrão totem) com busca nome/CPF + **leitura do QR do comprovante** → marca `insc_checkins` (única por inscrição) → contador ao vivo (inscritos × presentes). Sem check-in de não-inscrito: botão "inscrever na hora" abre o form público em modo balcão (mesma validação).

**Critérios de aceite:** check-in em <5s por pessoa; duplo check-in avisado; contadores corretos ao vivo.

---

## SPEC-07 · Notificações & espelhos

- Nova inscrição → `notificar({modulo:'inscricoes', link:'/inscricoes/:id'})` com `chaveDedup`; regras em `/admin/notificacao-regras` (módulo novo na lista).
- Confirmação ao inscrito via **fila WhatsApp** (template dedicado, gated por kill-switch, opt-in respeitado — sem opt-in não envia, conforme D4).
- **Espelhos:** módulos finais que consumirem eventos da espinha ganham aba read-only via `GET /unificadas?porta=...` (nenhuma cópia de dado).

---

## SPEC-08 · Permissões & segurança

- Slug `inscricoes` no catálogo + matriz seed (níveis: 1 ver · 2 operar check-in · 3 criar/editar eventos e inscritos · 4 +excluir · 5 admin/estorno com `pode_aprovar`).
- RLS + audit conforme SPEC-00; página pública sempre via backend; nenhuma tabela nova exposta a `anon/authenticated` no PostgREST.
- LGPD: consentimentos na satélite; texto padrão de menor (D6) versionado no código; retenção = D7 (nada se apaga até política).

---

## SPEC-09 · Relatórios

Por evento: funil (inscritos → pagos → presentes), série diária de inscrições, origem, exportação. Geral: eventos por período, ticket médio (pagos), comparativo entre edições (mesmo slug-base). Padrão visual do Dashboard Semanal.

---

## Plano de implementação (Fase 3 — fatiada)

| Etapa | Conteúdo | Dependências |
|---|---|---|
| **F3.1** | Fase 1 inteira (PRs 0–7 do rollout: utils+satélite → ext → apresentação → líderes → vol → next → batismo → grupos) | decisões D1–D9 ✅ |
| **F3.2** | SPEC-00 + 01 + 02 + 08 (espinha + módulo + página pública + permissões) e SPEC-04 (migração ext, side-by-side) | F3.1 (utils/satélite) |
| **F3.3** | SPEC-05 fase A (Pix) → **retiro no ar** | F3.2 |
| **F3.4** | SPEC-03 (visão unificada) + SPEC-06 (check-in) + SPEC-07 + SPEC-09 | F3.2 |
| **F3.5** | Cartão (PSP) + migração das demais portas pra espinha, uma a uma (batismo/next/vol/apresentação/grupos — cada uma com o mesmo protocolo da SPEC-04) | F3.3/F3.4 |

Cada etapa: migration aplicada antes do merge, PR+merge imediato (workflow do repo), CLAUDE.md atualizado, verificação de contagem, demo pro Marcos.

---

## Texto padrão de consentimento de menor (D6 — versão inicial)

> "Declaro que sou pai, mãe ou responsável legal de(s) criança(s) informada(s) e **autorizo o tratamento dos dados pessoais dela(s)** (nome, data de nascimento) pela Igreja CBRio, exclusivamente para organização da apresentação de crianças e comunicação relacionada, conforme a LGPD (art. 14). Sei que posso solicitar acesso, correção ou exclusão desses dados a qualquer momento pelos canais da igreja."

(Consentimento de **imagem** é checkbox separado e opcional: "Autorizo o uso de fotos do evento em que eu/minha criança apareça nas mídias da CBRio.")

---

*Fase 2 gerada em 2026-07-27, incorporando as decisões D1–D9 e o requisito dos campos padrão + "Adicionar campo". Fonte de verdade da Fase 1: `inscricoes-fase1-unificacao.md`.*
