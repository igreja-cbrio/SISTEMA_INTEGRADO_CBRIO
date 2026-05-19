# CLAUDE.md

Guia operacional para o Claude Code quando trabalhar neste repositório.

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
- [ ] Admin clicou "Conectar canal" em `/ministerial/online`?
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
| integracao | Alda Lorena |

Para alterar: `PUT /api/cycles/area-responsaveis/:area` com
`{ "responsavel_nome": "Novo Nome" }`. Os eventos futuros usarão
o novo responsável; tarefas já criadas não são afetadas
retroativamente.

## Online · visao do canal YouTube (somente leitura)

Modulo `/ministerial/online` mostra desempenho do canal YouTube CBRio com
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
  da UI em `/ministerial/online`.
- **ds-collect** · cron `0 10 * * *` · pra cultos de ontem com video_id,
  grava `online_ds` via `youtubeAnalytics.reports.query` (views no dia D).
- **ddus-collect** · cron `30 10 * * *` · pra cultos de 7 dias atras,
  grava `online_ddus` (views D+1 ate D+7, on-demand).

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
Solicitações, Assistente IA, Permissões, **Cérebro CBRio**.

> **Processos**: removido na reuniao de permissoes (2026-05-18).
> A rota `/processos` foi descontinuada e redireciona pra `/eventos`. Schema
> da tabela `processos` permanece no banco mas o modulo nao aparece mais no
> menu nem no sistema de permissoes (linha marcada como obsoleta na matriz).

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

### Cutoff temporal · "de hoje pra cá"

Marcos: "usa a data de hoje como base, não vamos conseguir pegar os
dados passados". A view `vw_nsm_sem_dados` filtra `c.data >= DATE '2026-05-18'`,
escondendo gaps históricos impossíveis de preencher. Cultos anteriores
ao cutoff não aparecem mais como pendentes na aba Pessoas.

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
