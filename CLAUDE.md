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

## Contexto do projeto

Sistema ERP interno da CBRio (Igreja). Stack: React 18 + Vite +
TypeScript/JSX (misto), Express.js backend, Supabase
(PostgreSQL + Auth + RLS), deploy no Vercel (frontend estático +
serverless functions via `api/index.js`).

> **Processos**: removido na reuniao de permissoes (2026-05-18).
> A rota `/processos` foi descontinuada e redireciona pra `/eventos`. Schema
> da tabela `processos` permanece no banco mas o modulo nao aparece mais no
> menu nem no sistema de permissoes (linha marcada como obsoleta na matriz).

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
  decisões kids nos cultos** (aguardando hardware pro go-live).

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
  → fila de aprovação humana em `/assistente-ia` · Yago/financeiro aprova.
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
  lembretes diários + estudo no dia `WHATSAPP_ESTUDO_DIA` default 1=segunda),
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
- **Modo padrão do relato = espontâneo + cobrança 4 semanas**: o líder manda
  1x/semana por conta própria; `enviarCobrancasSemRelato()` só cobra grupos
  há 28+ dias SEM encontro registrado E SEM relato no WhatsApp (dedup mensal
  `cobranca:<grupoId>:<AAAA-MM>` · cap `WHATSAPP_COBRANCA_CAP` default 40/dia
  · abre a sessão de relato pra resposta cair certa). O lembrete SEMANAL
  pós-encontro continua implementado mas DESLIGADO atrás de
  `WHATSAPP_LEMBRETE_SEMANAL=1` (aguardando validação de custo com o gestor).
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
  módulo financeiro) → Yago vê em **Operacional → Notas de compras**
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
  financeira do Yago**: compras/reembolso/pagamento SEMPRE (sem bypass por
  valor · decisão de 22/05).
- **⚠️ Lição (service_role × trigger)**: o backend insere com `auth.uid()=NULL`,
  então a regra de roteamento NÃO pode viver só em trigger que lê `auth.uid()`
  — o POST chama `fn_solicitacoes_rotear_origem(uuid)` via RPC e grava o
  resultado; o trigger fica de rede de segurança. (Bug que marcava tudo
  `dispensada` e esvaziava a aba Aprovar.)
- **Categorias vigentes no form**: TI · Compras · Reembolso · Reserva de Espaço
  · Serviços (=manutenção interna → `infraestrutura`, sem Yago) · Pagamento ·
  Marketing (por dor) · Férias/Licença. `servico` (contratação externa) e
  `outro` saíram do form (slugs seguem na CHECK pra linhas históricas).
  Roteamento: Compras→Amaury+Yago · Serviços→Amaury · Pagamento/Reembolso→Yago ·
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

## Produção de Culto · /producao (2026-06-02)

Módulo `producao` (matriz copiada de kids · boost de área pro Pedro Fernandes).
KPIs técnicos POR CULTO em satélite 1:1 de `cultos` (`culto_producao` + log
unificado `culto_producao_ocorrencias` + checklist itemizado com template
editável). Duração-alvo 60 min em `vol_service_types.meta_duracao_min`;
observação sempre opcional. Os 4 KPIs `PROD-CULTO-*` são **específicos, não
cascateiam** (`is_okr=false`, `valores='{}'`, fora da matriz NSM) ·
⚠️ `tipo_kpi` só aceita `qualitativo|quantitativo|operacional` (não 'tatico').
SLA/NPS gerais já existiam (`ADM-C-G/Q-PRODUCAO`). Categoria `producao` no form
de Solicitações roteia `area_responsavel='producao'`. Ocorrência crítica
notifica urgente. 6 sub-abas em `Producao.jsx`. Detalhes no legado.

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
- **Pendências operacionais**: aplicar migration
  `20260522300000_totem_kids_chamadas_display.sql`; Brother no Windows do totem
  (docs/totem-kids-setup-brother.md); comprar/parear 6 Fire TV Sticks;
  `PAGER_BRIDGE_TOKEN` no Vercel + .env do agente; confirmar porta TCP/NetPage
  com a LRS; teste num culto pequeno. Estado/dados: 660 famílias + 894 crianças
  importadas (56% com responsável · resto via auto-cadastro no 1º check-in).
  Diário completo no legado.

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
| financeiro | Yago Torres |
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
- **App**: `GET /app/culto/agora` (culto de hoje + link ao vivo + jaRegistrou),
  `POST /app/culto/decisao` (insere pendente · dedup 1/dia · notifica Integração).
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
