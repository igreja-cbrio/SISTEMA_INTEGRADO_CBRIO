# Multi-campus · documento de design (ADR)

> Status: **proposto** · Data: 2026-07-01 · Autor: gestão + Claude Code
> (via conselho `llm-council`) · Prazo-alvo do go-live do 2º campus:
> **fim de 2026**.

Referência viva do projeto que torna o ERP da CBRio **multi-campus** (multi-sede
física), preservando o campus atual (Sede) sem regressão. Escrito antes da
primeira migration — a Fase 0 concreta sai deste doc.

---

## 1. Objetivo e contexto

A CBRio entra em período de expansão e terá um **2º campus físico** até o fim de
2026. O sistema inteiro (banco, backend, frontend web, app mobile) precisa ganhar
a **ótica de campus**: cada unidade opera seus próprios cultos, membros, grupos,
voluntários, financeiro e RH de forma **isolada**, enquanto a **diretoria enxerga
o consolidado** de toda a rede.

**A natureza do projeto:** isto **não** é "adicionar uma coluna". É, no essencial,
um projeto de **isolamento de dados via RLS** — garantir que a liderança de um
campus **nunca** leia PII, financeiro ou dados de menores de outro campus. O
trabalho pesado e o risco estão na reescrita das policies RLS, não no schema.

---

## 2. Decisões travadas (gestão · 2026-07-01)

| # | Decisão | Escolha |
|---|---|---|
| 1 | **Modelo de membro** | Um **campus-base** por pessoa (`mem_membros.igreja_id`). Sem M:N de membro. |
| 2 | **Visibilidade entre campi** | **Configurável por módulo**: cada módulo é `isolado` ou `compartilhado`. |
| 3 | **Financeiro/RH** | **Separado por campus + consolidado** para a diretoria. |
| 4 | **Tipo do 2º campus** | **Nova sede física** (`tipo='sede'`). |

⚠️ Distinção essencial derivada da decisão #1: **pertencer** a um campus (membro)
≠ **ter acesso** a um campus (staff/liderança). Membro é campus-base único; o
**escopo de acesso** de um usuário pode abranger vários campi (líder regional,
diretoria). Por isso `usuario_igrejas` (acesso) é **M:N**, separado do
`mem_membros.igreja_id` (pertencimento).

---

## 3. Estado atual (verificado contra o repo · 2026-07-01)

Fundação **~30% pronta e majoritariamente decorativa**:

**✅ Existe:**
- Tabela `public.igrejas` (`20260507100000_fase1_igrejas.sql`): `id` UUID, `nome`,
  `slug`, `tipo` CHECK `('sede','online','cba_acompanhada')`, `pastor_responsavel_id`,
  `cidade`, `estado`, `ativa`. Seed: `...0001` = **CBRio Sede**, `...0002` =
  **CBRio Online**. Sem CBA real.
- `igreja_id` em **~5 tabelas apenas**: `mem_membros`, `int_visitantes`,
  `nsm_eventos`, `kids_salas`, `kids_pagers` (default Sede `...0001`).
- **NSM segmentada** (`nsm_estado.segmento_tipo` aceita `central|igreja_tipo|igreja_id|area|custom`).
  Seeds atuais por `igreja_tipo`: central, cbrio (`tipo=sede`), online, cba.

**❌ Falta:**
- `igreja_id` em **~205+ tabelas** (cultos, grupos, voluntários, decisões,
  `dados_brutos`, `kpi_*`, financeiro e RH inteiros, eventos, projetos, solicitações).
- Qualquer filtro de campus na RLS. A própria `igrejas` está com `USING(true)
  WITH CHECK(true)` (viola a regra #1 de segurança do `CLAUDE.md`).
- Helper `current_user_igreja_ids()`.
- `igreja_id` no `auth.js`/JWT (grep = **zero** menções a igreja/campus/sede).
- Seletor/contexto de campus no frontend e no app (zero).

⚠️ O "visão 5 campus" citado no `CLAUDE.md` é **preparo de performance** (escala
50k · views materializadas, cache, índices), **não** funcionalidade multi-campus.

---

## 4. Modelo de dados escolhido

**Shared schema + `igreja_id` + RLS por campus** (single database, single schema,
linha carimbada com o campus). Descartado schema-por-campus (multiplicaria as ~541
policies × N e quebraria os consolidados NSM/DRE) e banco-por-campus (idem, pior).

### 4.1 Pertencimento vs acesso
- `mem_membros.igreja_id` → **campus-base** do membro (já existe).
- `usuario_igrejas (usuario_id, igreja_id, papel)` → **escopo de acesso** M:N.
  Super-admin e diretoria geral = todos os campi (curto-circuito, como
  `is_super_admin()`).

### 4.2 Tabelas isoladas vs compartilhadas
A decisão #2 ("configurável por módulo") vira uma coluna
**`modulos.escopo_campus`** (`'isolado' | 'compartilhado'`). A RLS lê essa config
via helper: módulo isolado → filtra por `current_user_igreja_ids()`; compartilhado
→ sem filtro de campus.

Defaults propostos (ajustáveis na UI de permissões):

| Escopo | Módulos |
|---|---|
| **Isolado** (leva `igreja_id`) | integracao, cultos, cuidados, grupos, voluntariado, membresia, next, financeiro, rh, logistica, patrimonio, solicitacoes, dados-brutos, kids, producao |
| **Compartilhado** (sem `igreja_id`) | catálogos (`modulos`, `cargos`, `areas`, `vol_service_types`), plano de contas, matriz `cargo_modulo_permissao`, eventos, comunicados, marketing, cerebro, expansao/planejamento |

### 4.3 Membro é multi-campus por natureza
O membro tem campus-base, mas o **ato** carimba o campus onde ocorreu: uma
contribuição, decisão ou check-in leva o `igreja_id` do **evento/culto**, não
necessariamente o campus-base da pessoa (ex.: membro da Sede que doa visitando o
Campus 2). Regra: **transação/decisão/presença = campus do ato**; cadastro do
membro = campus-base.

### 4.4 Financeiro/RH (decisão #3)
`igreja_id` em `fin_transacoes`, `fin_faturas`, `rh_funcionarios` e correlatas.
DRE/folha por campus + **rollup consolidado** para a diretoria
(`igreja_id IS NULL` na agregação = consolidado; filtro = por campus). A regra
contábil do empréstimo-não-é-receita segue intacta, agora por campus.

---

## 5. Mudanças estruturais específicas (armadilhas confirmadas)

1. **`cultos` · UNIQUE**: `uniq_culto_service_data UNIQUE (service_type_id, data)`
   (`20260514110000`) **quebra** com duas sedes no mesmo slot/data. Vira
   `UNIQUE (igreja_id, service_type_id, data)`. `gerar_cultos_recorrentes` passa a
   materializar por campus.
2. **NSM · segmento por campus**: com **duas sedes físicas** (ambas `tipo='sede'`),
   o segmento atual `cbrio` (`{"tipo":"sede"}`) juntaria as duas. Migrar os campi
   presenciais para `segmento_tipo='igreja_id'` (o schema já aceita) — semear 1
   segmento por campus. `recalcular_nsm()` v3 e `_kpi_agregar_dado` ganham
   parâmetro `igreja_id` (mesmo padrão do `area`).
3. **`kpi_*`/`dados_brutos` agregados**: adicionar `igreja_id` exige varrer **todo
   read-site e função SQL** com filtro novo (senão o KPI de um campus soma o outro).
   É o maior gargalo de tempo da Fase 1.
4. **Cultos recorrentes**: os `vol_service_types` são catálogo compartilhado (o
   slot "Domingo 10:00" é o mesmo conceito); a **instância** (`cultos`) é que é por
   campus. Confirmar se cada campus terá seus próprios horários ou herda o catálogo.
5. **App mobile / comunicados / push / totem kids**: hoje assumem 1 unidade —
   ganham dimensão de campus na Fase 3.

---

## 6. RLS · padrão das policies

Helper novo (segue o padrão `STABLE SECURITY DEFINER SET search_path = public`):

```sql
CREATE OR REPLACE FUNCTION public.current_user_igreja_ids()
RETURNS uuid[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE
    WHEN public.is_super_admin() OR public.is_diretoria_geral() THEN
      ARRAY(SELECT id FROM public.igrejas WHERE ativa)
    ELSE
      ARRAY(SELECT igreja_id FROM public.usuario_igrejas WHERE usuario_id = auth.uid())
  END
$$;
```

Policy de tabela isolada (soma o campus aos helpers `current_user_*` existentes —
não os substitui):

```sql
CREATE POLICY <tab>_select ON public.<tab>
  FOR SELECT TO authenticated
  USING (
    public.is_super_admin()
    OR (
      igreja_id = ANY (public.current_user_igreja_ids())
      AND public.current_user_module_level('<slug>') >= 1
    )
  );
```

---

## 7. Plano de testes (portão de go-live)

Suíte de **não-vazamento** obrigatória no CI antes de o Campus 2 entrar em prod:

- **(a)** Usuário do Campus 2 (via anon key, RLS no caminho) **NÃO** lê
  membro/contribuição/decisão/RH/PII do Campus 1 — testar por módulo isolado.
- **(b)** NSM e DRE **separados** por campus; consolidado só para diretoria.
- **(c)** Dois cultos no mesmo slot/data (um por campus) **coexistem**.
- **(d)** Cron da NSM e coletores de KPI **particionam** por campus (não somam
  entre campi).
- **(e)** Backfill: **zero** `igreja_id` órfão/nulo em tabela isolada; histórico
  100% atribuído à Sede.
- **(f)** Teste de regressão do Campus 1: números da Sede **inalterados**
  pós-migração.
- **(g)** CI falha em qualquer policy `TO public`/`USING(true)` em tabela com PII
  (guarda estrutural — captura regressão de RLS, ver incidente `vol_*`).

---

## 8. Roadmap faseado (Jul → Dez 2026)

| Fase | Janela | Entregas | Pré-req |
|---|---|---|---|
| **0 · Fundação** | Jul (1ª quinz.) | `usuario_igrejas` + `current_user_igreja_ids()` + `escopo_campus` em `modulos` + `req.user.igrejas[]` no `auth.js` (default Sede → **sem mudança de comportamento**) + fix do `USING(true)` da `igrejas` | — |
| **1 · Propagar `igreja_id`** | Jul (2ª) → Ago | Carimbar campus nas tabelas isoladas (cultos + UNIQUE novo → decisões → grupos/voluntários/`cui_*` → `dados_brutos`/`kpi_taticos` → eventos/projetos/solicitações → financeiro/RH), backfill default Sede | Fase 0 |
| **2 · RLS por campus + CI** | Set → Out | Reescrever policies por campus (via `escopo_campus`) + suíte de não-vazamento no CI. **PORTÃO: Campus 2 não vai a prod antes daqui** | Fase 1 completa |
| **3 · Experiência multi-campus** | Nov → meados Dez | NSM/KPIs por campus + consolidado, mandala com seletor de campus, app/push/comunicados por campus, dashboards comparativos + 2 semanas de estabilização/treino | Fase 2 |

Regra de ouro: **reservar metade do calendário para a Fase 2** (RLS + testes) — é
o gargalo real, não o volume de código.

---

## 9. Riscos e armadilhas

- **Vazamento entre campi (crítico)**: RLS sem campus + boost de área daria acesso
  global à liderança do Campus 2. Nunca liberar antes da Fase 2 testada.
- **Backfill cego**: toda linha sem campus vira "Sede" — correto para histórico,
  **errado** se rodado antes de o Campus 2 ter dados.
- **Nunca mexer em RLS sob pressão de prazo** (por isso o Campus 2 chega no fim do
  ano, com Fase 2 pronta).
- **Drift git↔prod**: as migrations deste projeto precisam ser aplicadas em prod na
  ordem, com o SQL colado na conversa (regra do `CLAUDE.md`).

---

## 10. Questões em aberto (decidir antes/durante a Fase 1)

1. Cada campus terá **horários de culto próprios** ou herda o catálogo
   `vol_service_types` compartilhado?
2. Quando um campus é **inativado**, o que acontece com seus dados (retenção)?
3. **Solicitações/aprovações** (SLA, alçadas) são por campus ou a diretoria
   administrativa é única para a rede?
4. **Cérebro/SharePoint** e **notificações** ganham dimensão de campus ou seguem
   institucionais?
5. Lista definitiva de `escopo_campus` por módulo (a tabela da seção 4.2 é
   proposta — validar com a gestão).

---

## Nota de método

Este documento nasceu de uma deliberação da skill `llm-council` (4 conselheiros:
arquitetura de dados, risco/migração, pragmático/prazo, inventário factual). Os
fatos do estado atual (seção 3) e as armadilhas (seção 5) foram **verificados
contra o repo**, não apenas relatados. Os conselheiros são o mesmo modelo base —
a convergência reduz pontos cegos de enquadramento, não é prova independente;
decisões contábeis/segurança devem ser validadas pela gestão.
