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
| B | `POST /cuidados/convertidos` (`backend/routes/cuidados.js:916`) → `insert` direto · botão **"Novo convertido"** (`src/pages/ministerial/Cuidados.tsx:1333` → `cuidadosApi.convertidos.create`) | **Cuidados** | ❌ viola "nunca nasce no Cuidados" |
| C | Import da planilha (`backend/scripts/_import_acompanhamento_jornada.js`) | planilha | ⚠️ ENCERRADO (sem mais imports); linhas existem **sem `culto_id`** |

## Gaps vs o princípio

### Gap 1 — fechar a criação direta no Cuidados (caminho B) · **prioridade alta**
Hoje o botão "Novo convertido" cria um `cui_convertidos` sem passar por um culto.
Pelo princípio, o convertido só deve nascer de uma **decisão de culto**.

**Recomendado:** redirecionar o `POST /cuidados/convertidos` para criar uma
**decisão de culto** (`cultos_decisoes_pessoas`) — que aí cai no trigger A e
materializa o `cui_convertidos` com `culto_id`/`area` corretos. Aceitar **data/horário
vazios** nesse caminho cobre o caso "história posterior" do princípio (entra na jornada,
fica fora da NSM). Alternativa mais dura: remover o endpoint/botão e obrigar o registro
pela Integração (aba Decisões). A redireção é melhor: mantém a conveniência do Cuidados,
mas pela porta certa.

⚠️ **Colisão:** `cuidados.js` e `Cuidados.tsx` estão sendo mexidos pela sessão
`claude/cuidados-j180-kpi-realtime`. Coordenar / fazer depois que ela mergear.

### Gap 2 — `culto_id` dos importados (caminho C) · **prioridade baixa**
As linhas importadas estão em `cui_convertidos` sem `culto_id` (area = 'sede' default).
Imports encerrados (decisão do Marcos), então não cresce. Resolve quando o **Marcelo**
trouxer a coluna **"Culto"** na planilha → casar `(data + culto)` com `cultos` →
preencher `culto_id` → a área sai do culto. Já descrito em
`[[proxima-sessao-arquitetura-jornada]]`. Idealmente reinserir pelo fluxo de decisão de
culto pra virar 100% nativo (resolve também os ~11 órfãos sem `membro_id`).

### Gap 3 — data/horário opcionais · **sem trabalho estrutural**
`cui_convertidos` já representa convertido sem `culto_id` (os importados provam), e
`recalcular_nsm` usa janela de data → "sem data = fora da NSM, dentro da jornada" já
vale. Só garantir que o caminho redirecionado do Gap 1 aceite data/horário vazios.

## Já em andamento — NÃO duplicar

- **Fase 2** (Jornada da Igreja · página própria + síntese no /painel) e **Fase 3**
  (drill-down de pessoas em escala) → sessão `claude/jornada-fase2`.
- **Next** (direcionamento / cutover de turmas) → sessões `claude/next-*`.
- **Cuidados** (J180 / KPI realtime) → sessão `claude/cuidados-j180-kpi-realtime`.

## Ordem sugerida de execução

1. **Depois** das sessões acima assentarem: Gap 1 (redirecionar `POST /cuidados/convertidos`
   pra criar decisão de culto). Backend pequeno + remover/ajustar o botão "Novo convertido".
2. Gap 2 (vínculo de `culto_id` dos importados) quando a coluna "Culto" do Marcelo chegar.

## Verificação (origin/main, 2026-06-25)

- `recalcular_nsm`/`fn_nsm_sinais_engajados` leem `cui_convertidos` — `supabase/migrations/20260619140000_nsm_sinais_engajamento_v3.sql:144-186`.
- Trigger culto→cui_convertidos — `supabase/migrations/20260603160000_jornada_novos_convertidos.sql:41-103`.
- Criação direta no Cuidados — `backend/routes/cuidados.js:916` + `src/api.js:2368` + `src/pages/ministerial/Cuidados.tsx:406,1333`.
