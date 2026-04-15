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

## Contexto do projeto

Sistema ERP interno da CBRio (Igreja). Stack: React 18 + Vite +
TypeScript/JSX (misto), Express.js backend, Supabase
(PostgreSQL + Auth + RLS), deploy no Vercel (frontend estático +
serverless functions via `api/index.js`).

Módulos principais: Dashboard, Eventos, Projetos, Planejamento,
Expansão, RH, Financeiro, Logística, Patrimônio, **Membresia**,
Solicitações, Assistente IA, Permissões, **Cérebro CBRio**.
