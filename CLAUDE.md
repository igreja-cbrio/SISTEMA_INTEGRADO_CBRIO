# CLAUDE.md

Guia operacional para o Claude Code quando trabalhar neste repositório.

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
2. Fornecer o SQL consolidado para rodar no SQL Editor (ou indicar
   `supabase db push`).
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

Para alterar: `PUT /api/cycles/area-responsaveis/:area` com
`{ "responsavel_nome": "Novo Nome" }`. Os eventos futuros usarão
o novo responsável; tarefas já criadas não são afetadas
retroativamente.

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
Solicitações, Assistente IA, Permissões, **Cérebro CBRio**,
**Processos**.

## Processos — Modulo de gestao operacional

Modulo para gestao de processos operacionais que alimentam KPIs.
Seção do menu renomeada de "Projetos e Eventos" para "Acompanhamento".

### Arquitetura

- **Tabela**: `processos` (Supabase) com campos nome, descricao,
  area, categoria, responsavel_id/nome, indicador_ids (TEXT[]),
  is_okr, status
- **Backend**: `backend/routes/processos.js` — CRUD padrao com
  authenticate + authorize('admin','diretor')
- **Frontend**: `src/pages/Processos.jsx` — 4 tabs (Home, Lista,
  OKR, KPIs)
- **KPIs**: 60 indicadores vigentes em `src/data/indicadores.js`,
  espelhando a planilha "Metas e Indicadores 2026" (OneDrive). O banco
  (`kpi_indicadores_taticos`) foi alinhado com a planilha em
  `20260430090000_kpis_align_planilha.sql` — mesmos IDs, mesmas metas.
  **Planilha = fonte de verdade**: ao adicionar/remover/renomear KPI,
  atualizar a planilha primeiro, depois `indicadores.js`, depois banco
  via migration. Nunca divergir entre os 3.

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

### Componentes do painel (`src/components/painel/`)

- `MandalaSlide.jsx` — uma mandala SVG (5 ou 6 setores)
- `CarrosselMandalas.jsx` — carrossel com setas, dots, swipe, teclado
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

- Leitura: **todos veem todos os KPIs** (painel, mandalas, matriz, minha-area, dados-brutos)
- Edicao: **so a propria area** (validado via `kpi_areas` em profiles)
- Admin/diretor: passa em todos os checks

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
