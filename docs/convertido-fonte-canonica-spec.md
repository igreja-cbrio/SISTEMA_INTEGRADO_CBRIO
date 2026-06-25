# Spec · Fonte canônica de convertido (auditoria + gaps)

> Read-only, sem código. Produzido em 2026-06-25 a pedido do Marcos ("spec agora,
> implementar depois"), pra ser executado por uma sessão dedicada quando as frentes
> de jornada/next/cuidados que estão em voo assentarem. Verificado contra `origin/main`.

## TL;DR

**A unificação da fonte canônica de convertido JÁ ESTÁ FEITA.** O NSM (numerador e
denominador) lê `cui_convertidos` desde a migration `20260619140000` (live · NSM ≈ 7%,
não ≈ 0 como achados antigos do Atlas sugeriam). Restam **2 gaps pequenos** vs o
princípio do Marcos — um deles é uma porta que ainda deixa criar convertido fora do culto.

## Princípio (Marcos · 25/06/2026)

O convertido vem **SEMPRE do culto preenchido** (`cultos_decisoes_pessoas` — o registro
da decisão no culto), com **data e horário OPCIONAIS** quando for uma "história posterior"
(alguém que conta depois que converteu). Com data → conta na NSM (janela 90d / sinais ±60d);
sem data → entra na jornada, fica **fora da NSM**. **Nunca nasce no Cuidados** — Cuidados
acompanha e direciona, não origina.

## Estado atual (origin/main · verificado)

Canônico = **`cui_convertidos`** (1 linha por convertido, por `membro_id`).
`recalcular_nsm` + `fn_nsm_sinais_engajados` (migration `20260619140000`) usam essa tabela
como numerador (≥1 sinal de engajamento, ±60d) e denominador (coorte 90d). ✅

`cui_convertidos` tem **3 caminhos de escrita**:

| # | Caminho | Origem | Veredito |
|---|---------|--------|----------|
| A | Trigger `tg_cultos_dec_pessoas_to_cuidados` (migration `20260603160000`): `cultos_decisoes_pessoas` → `cui_convertidos`, com `area` derivada do culto | **culto** | ✅ caminho nativo correto |
| B | ~~`POST /cuidados/convertidos` + botão "Novo convertido"~~ | ~~**Cuidados**~~ | ✅ FECHADO 25/06: botão redireciona pra Integração; **endpoint + `api.create` REMOVIDOS**. Cuidados só edita/acompanha. |
| C | Import da planilha (`backend/scripts/_import_acompanhamento_jornada.js`) | planilha | ⚠️ ENCERRADO (sem mais imports); linhas existem **sem `culto_id`** |

## Gaps vs o princípio

### Gap 1 — fechar a criação direta no Cuidados (caminho B) · ✅ **RESOLVIDO (25/06)**
Decisão do Marcos: o botão **"Novo convertido"** do Cuidados **redireciona pra
Integração** (`/ministerial/integracao`), onde a pessoa registra a decisão no culto —
em vez de criar um `cui_convertidos` direto. Assim o convertido só nasce de uma decisão
de culto (cai no trigger A, com `culto_id`/`area` corretos); o Cuidados volta a só
acompanhar/direcionar.

**Feito:** `Cuidados.tsx` — botão `onClick` → `navigate('/ministerial/integracao')`; o
modal segue só pra **editar** convertido existente (`save()` virou edit-only). **O
endpoint `POST /cuidados/convertidos` + `api.cuidados.convertidos.create` FORAM REMOVIDOS**
(2026-06-25) — entrada única de convertido = Integração (decisão de culto). O caso raro de
"história posterior" (sem culto) é vinculado **direto no banco**, sem botão no sistema
(decisão do Marcos · não facilitar a informalidade).

### Gap 2 — `culto_id` dos importados (caminho C) · ❌ **DESCARTADO (25/06)**
Marcos: "essas colunas não vão aparecer." A coluna "Culto" na planilha do Marelo e o
backfill de `culto_id`/área dos importados **não serão feitos**. As linhas importadas
ficam como estão (sem culto vinculado · `area='sede'` default) — é histórico que não
cresce (imports encerrados) e não vira pendência (ver a aba Decisões, bloco neutro
"Convertidos importados · histórico"). Não planejar trabalho nisso.

### Gap 3 — data/horário opcionais · **sem trabalho estrutural**
`cui_convertidos` já representa convertido sem `culto_id` (os importados provam), e
`recalcular_nsm` usa janela de data → "sem data = fora da NSM, dentro da jornada" já
vale. Se o registro pela Integração (Gap 1) precisar do caso "história posterior" sem
data/horário, garantir que o fluxo de decisão de culto aceite esses campos vazios.

## Já em andamento — NÃO duplicar

- **Fase 2** (Jornada da Igreja · página própria + síntese no /painel) e **Fase 3**
  (drill-down de pessoas em escala) → sessão `claude/jornada-fase2`.
- **Next** (direcionamento / cutover de turmas) → sessões `claude/next-*`.
- **Cuidados** (J180 / KPI realtime) → sessão `claude/cuidados-j180-kpi-realtime`.

## Ordem sugerida de execução

1. ✅ Gap 1 (botão "Novo convertido" → Integração) — **feito 25/06**.
2. ✅ Limpeza: `POST /cuidados/convertidos` + `api.cuidados.convertidos.create` **removidos** (25/06).
3. ~~Gap 2~~ — descartado (Marcos: "essas colunas não vão aparecer").

**Estado final: entrada única de convertido = Integração (decisão de culto).** Nenhum
botão cria convertido sem culto · "história posterior" sem culto é vínculo manual no banco.

## Verificação (origin/main, 2026-06-25)

- `recalcular_nsm`/`fn_nsm_sinais_engajados` leem `cui_convertidos` — `supabase/migrations/20260619140000_nsm_sinais_engajamento_v3.sql:144-186`.
- Trigger culto→cui_convertidos — `supabase/migrations/20260603160000_jornada_novos_convertidos.sql:41-103`.
- Criação direta no Cuidados — `backend/routes/cuidados.js:916` + `src/api.js:2368` + `src/pages/ministerial/Cuidados.tsx:406,1333`.
