# Mapa de Permissões CBRio · pra preencher e devolver

**Como funciona este documento:**

1. Leia o **Modelo proposto** (seção 1) · confirma se faz sentido.
2. Revise a **Lista de cargos** (seção 2) · adiciona/remove/renomeia.
3. Revise a **Lista de módulos** (seção 3) · confirma que cobre tudo.
4. **Preencha a matriz cargo × módulo** (seção 4) com os números 0-5 da legenda.
5. Responda as **perguntas em aberto** (seção 7).
6. Me devolve o arquivo · eu implemento o que ficou definido.

Pode marcar com `[?]` o que tiver dúvida · eu volto e proponho um valor.

---

## 1. Modelo proposto (Marcos definiu)

**Permissão padrão = por cargo.** Pessoa que ocupa cargo herda o pacote inteiro. Pessoa sai do cargo, perde o pacote automaticamente. Próxima pessoa que assume herda igual.

**Override por pessoa = exceção.** Quando alguém precisa acessar algo fora do seu pacote (cobrir licença, projeto pontual, etc.), administrador concede individualmente · ideal com data de expiração.

**Hierarquia em camadas (a permissão efetiva é a soma):**

```
Permissões efetivas do usuário =
  (permissões do cargo)            ← padrão
  + (overrides "adicionar")        ← excepcionalmente ganhou acesso
  − (overrides "remover")          ← excepcionalmente perdeu acesso
```

**Confirma esse modelo?** [ ] sim · [ ] quero ajustar (explique)

---

## 2. Catálogo de cargos sugerido

Baseado no que vi no código + CLAUDE.md + memória. **Confirma cada um e adiciona o que faltar.** Pra cada cargo, opcionalmente já me diz o **titular atual** (UUID via `profiles.id`, ou nome) · facilita o seed depois.

| # | Cargo | Titular atual | Confirma? | Renomear? |
|---|-------|---------------|-----------|-----------|
| 1 | **Pastor Senior** | Pr. Pedrão | [ ] | |
| 2 | **Pastor Presidente** | Pr. Juninho | [ ] | |
| 3 | **Diretor Geral / CEO** | Eduardo Gnisci | [ ] | |
| 4 | **Diretor de Estratégia (PMO)** | Marcos Paulo | [ ] | |
| 5 | **Líder Ministerial** | Arthur Serpa | [ ] | |
| 6 | **Líder Criativo** | Pedro Menezes | [ ] | |
| 7 | **Líder de Área Ministerial** | Alda (Integração), líderes de AMI/Bridge/Sede/Online/Kids/Cuidados/Voluntariado/Next/Grupos/Generosidade/CBA | [ ] | Um cargo por área ou um cargo genérico amarrado a `kpi_areas`? |
| 8 | **Assistente de Área** | Mão direita do líder · preenche dados, sem decidir | [ ] | |
| 9 | **Líder Financeiro** | Yago Torres | [ ] | |
| 10 | **Líder de Marketing** | Pedro Paiva | [ ] | |
| 11 | **Líder de Produção** | Pedro Fernandes | [ ] | |
| 12 | **Líder de Operações (Hospitalidade)** | Jéssica Salviano · Amaury · etc. (cozinha/limpeza/manutenção/compras) | [ ] | Um cargo ou um por sub-área? |
| 13 | **Líder de RH** | _vago_ | [ ] | |
| 14 | **Coordenador de Voluntários** | _vago_ | [ ] | Existe? |
| 15 | **Voluntário** | Qualquer pessoa que serve · check-in, escala, perfil | [ ] | |
| 16 | **Membro** | Auto-cadastro · dashboard básico, próprio perfil | [ ] | |
| 17 | **Conselho Estatutário** | Não-funcionário · vê dashboards executivos, não operacional | [ ] | |
| 18 | **Suporte/Dev** | Matheus + Marcos como dev · acesso técnico irrestrito | [ ] | |
| 19 | _adicionar_ | | [ ] | |
| 20 | _adicionar_ | | [ ] | |

---

## 3. Catálogo de módulos do sistema

Lista do que existe hoje em produção. **Confirma que cobre tudo.** Se faltar algum, adiciona no fim.

### 3.1 · Estratégico / Visão

| Módulo | Rota | O que faz |
|--------|------|-----------|
| Dashboard | `/dashboard` | Home com cards resumo |
| Painel CBRio | `/painel` | NSM · mandalas · matrizes (Valor×Área, Gestão, Criativo) · alertas |
| Minha Área | `/minha-area` | KPIs do líder (filtrado por área/valor) |
| Gestão (PMO) | `/gestao` | Estrutura OKR · configurar metas · saúde sistema |
| Planejamento | `/planejamento` | Ritual mensal causa-decisão |
| Ritual | `/ritual` | Revisão da Diretoria Geral (5 nominais) |
| Governança | `/governanca` | Ciclo mensal OKR · DRE · KPI · Conselho |
| Revisão Estratégica | `/revisao-estrategica` | Edição direta de projetos/marcos · cascata impacto |

### 3.2 · Ministerial (Pilar Seguir a Jesus + 4 outros valores)

| Módulo | Rota | O que faz |
|--------|------|-----------|
| Integração | `/ministerial/integracao` | Cultos · Frequência · Decisões · Batismos · Histórico |
| Cuidados | `/ministerial/cuidados` | Acompanhamentos pastorais · Jornada 180 · Convertidos |
| Online (YouTube) | `/ministerial/online` | Desempenho do canal (read-only) |
| NEXT | `/ministerial/next` | Curso de novos membros |
| Voluntariado | `/ministerial/voluntariado/*` | Checkin · escalas · perfil · disponibilidade |
| Membresia | `/ministerial/membresia` | CRM de pessoas · jornada · cartão digital |
| Grupos | `/grupos` | Grupos de conexão · supervisão · pedidos |

### 3.3 · Operações

| Módulo | Rota | O que faz |
|--------|------|-----------|
| Eventos | `/eventos` | Ciclo criativo · fases · documentos · KPIs por evento |
| Projetos | `/projetos` | Projetos com fases |
| Expansão | `/expansao` | Marcos estratégicos até 2029 |
| Processos | `/processos` | Processos operacionais que alimentam KPIs |
| RH | `/admin/rh` | Funcionários · documentos · treinamentos |
| Financeiro | `/admin/financeiro` | Receitas · despesas · relatórios |
| Logística | `/admin/logistica` | Estoque · compras · almoxarifado |
| Patrimônio | `/admin/patrimonio` | Espaços · equipamentos · inventário |
| Solicitações | `/solicitacoes` | Backbone administrativo · SLA · aprovações |

### 3.4 · Dados / KPIs

| Módulo | Rota | O que faz |
|--------|------|-----------|
| Dados Brutos | `/dados-brutos` | Líder preenche números absolutos (frequência, batismos, etc.) |
| NPS | `/nps` | Pesquisas · respostas · link público |
| Notificações | _config_ | Regras de quem recebe alertas de cada módulo |

### 3.5 · Inteligência / Conhecimento

| Módulo | Rota | O que faz |
|--------|------|-----------|
| Assistente IA | `/assistente-ia` | Agente Claude conversacional |
| Cérebro CBRio | _backend cron_ | Sync SharePoint → Obsidian via Haiku |

### 3.6 · Pessoais

| Módulo | Rota | O que faz |
|--------|------|-----------|
| Perfil | `/perfil` | Dados pessoais do próprio usuário |
| Tarefas | _embed_ | Tarefas pessoais |

### 3.7 · Admin

| Módulo | Rota | O que faz |
|--------|------|-----------|
| Permissões | `/admin/permissoes` _(a criar)_ | UI deste sistema · gestão de cargos + overrides |
| Usuários | `/admin/usuarios` | Cadastrar/desativar pessoas |

**Faltou algum módulo?** Lista aqui:

- [ ] ...
- [ ] ...

---

## 4. Matriz Cargo × Módulo (a parte que você preenche)

### Legenda dos níveis

| Nível | Significado | Exemplo |
|-------|-------------|---------|
| **0** | Sem acesso · módulo não aparece no menu nem responde a URL | Voluntário não acessa `/financeiro` |
| **1** | Ver · só leitura, sem editar nem exportar | Conselho vê `/painel` |
| **2** | Ver + preencher dado bruto · pode lançar números na sua área | Assistente Integração lança decisões |
| **3** | Ver + editar · CRUD do conteúdo (criar, alterar) | Líder Integração edita cultos |
| **4** | Ver + editar + deletar | Líder Financeiro deleta lançamento errado |
| **5** | Admin do módulo · configura regras, metas, seeds, deleta tudo | Diretor Estratégia define metas dos KPIs |

**Modificadores opcionais** (escrevem depois do nível):
- `+E` · pode **exportar** dados (LGPD · CPF, telefone, financeiro)
- `+A` · pode **aprovar** workflows daquele módulo (ex: aprovar despesa)
- `*` · acesso só da **própria área** (ex: líder AMI só edita cultos AMI, não Sede)
- `?` · indeciso · me pede sugestão

> **Exemplo de preenchimento:** Líder Integração na Integração: `3*` (CRUD + só da área). Diretor Geral em Financeiro: `5+E+A`. Voluntário em Voluntariado: `2`.

### Matriz Estratégica

| Módulo | Pastor Sr | Pastor Pres | Dir Geral | Dir Estrat | Líder Mini | Líder Criat | Líder Área | Líder Adm | Voluntário | Membro | Conselho | Dev |
|--------|-----------|-------------|-----------|------------|------------|-------------|------------|-----------|------------|--------|----------|-----|
| Dashboard | | | | | | | | | | | | |
| Painel CBRio | | | | | | | | | | | | |
| Minha Área | | | | | | | | | | | | |
| Gestão (PMO) | | | | | | | | | | | | |
| Planejamento | | | | | | | | | | | | |
| Ritual | | | | | | | | | | | | |
| Governança | | | | | | | | | | | | |
| Revisão Estratégica | | | | | | | | | | | | |

### Matriz Ministerial

| Módulo | Pastor Sr | Pastor Pres | Dir Geral | Dir Estrat | Líder Mini | Líder Criat | Líder Área | Líder Adm | Voluntário | Membro | Conselho | Dev |
|--------|-----------|-------------|-----------|------------|------------|-------------|------------|-----------|------------|--------|----------|-----|
| Integração | | | | | | | | | | | | |
| Cuidados | | | | | | | | | | | | |
| Online (YouTube) | | | | | | | | | | | | |
| NEXT | | | | | | | | | | | | |
| Voluntariado | | | | | | | | | | | | |
| Membresia | | | | | | | | | | | | |
| Grupos | | | | | | | | | | | | |

### Matriz Operações

| Módulo | Pastor Sr | Pastor Pres | Dir Geral | Dir Estrat | Líder Mini | Líder Criat | Líder Área | Líder Adm | Voluntário | Membro | Conselho | Dev |
|--------|-----------|-------------|-----------|------------|------------|-------------|------------|-----------|------------|--------|----------|-----|
| Eventos | | | | | | | | | | | | |
| Projetos | | | | | | | | | | | | |
| Expansão | | | | | | | | | | | | |
| Processos | | | | | | | | | | | | |
| RH | | | | | | | | | | | | |
| Financeiro | | | | | | | | | | | | |
| Logística | | | | | | | | | | | | |
| Patrimônio | | | | | | | | | | | | |
| Solicitações | | | | | | | | | | | | |

### Matriz Dados / Inteligência / Admin

| Módulo | Pastor Sr | Pastor Pres | Dir Geral | Dir Estrat | Líder Mini | Líder Criat | Líder Área | Líder Adm | Voluntário | Membro | Conselho | Dev |
|--------|-----------|-------------|-----------|------------|------------|-------------|------------|-----------|------------|--------|----------|-----|
| Dados Brutos | | | | | | | | | | | | |
| NPS | | | | | | | | | | | | |
| Notificações | | | | | | | | | | | | |
| Assistente IA | | | | | | | | | | | | |
| Cérebro CBRio | | | | | | | | | | | | |
| Perfil próprio | | | | | | | | | | | | |
| Permissões (admin) | | | | | | | | | | | | |
| Usuários (admin) | | | | | | | | | | | | |

---

## 5. Overrides por pessoa · estrutura sugerida

Pra cada exceção, você cadastra:

```
Pessoa:          [profile.id]
Módulo:          [nome do módulo]
Tipo de override: [adicionar | remover]
Nível:           [0-5]
Modificadores:   [+E | +A | * | nenhum]
Motivo:          [texto livre · por que essa exceção?]
Concedido por:   [profile.id de quem aprovou]
Válido até:      [data | indefinido]
```

**Exemplos do dia-a-dia:**

| Pessoa | Módulo | Override | Por quê |
|--------|--------|----------|---------|
| Marcos Paulo | Financeiro | `5+E+A` (adicionar) | Cobertura enquanto Líder Financeiro está em licença · expira em 30 dias |
| Voluntário X | Cuidados | `2` (adicionar) | É líder informal de grupo, ajuda no follow-up · permanente |
| Líder Y | Logística | `0` (remover) | Saiu por conflito · perde acesso mas mantém cargo |
| Estagiário Z | Membresia | `1` (adicionar) | Pode ver lista mas não editar · durante onboarding |

**Decisão sua:**
- [ ] Override expira automaticamente ou fica indefinido por padrão? **(sugiro 90 dias por padrão · pode ser estendido)**
- [ ] Quem pode conceder override? **(sugiro: admin/diretor podem qualquer um · líder pode dar override só dentro da sua área)**
- [ ] Histórico/auditoria · queremos guardar log de cada concessão? **(sugiro sim, tabela `permissao_log`)**

---

## 6. Schema técnico sugerido (proposta de implementação)

```sql
-- Catálogo de módulos do sistema
CREATE TABLE modulos (
  id       text PRIMARY KEY,           -- 'integracao', 'financeiro', etc.
  nome     text NOT NULL,
  setor    text,                       -- 'ministerial' | 'operacional' | etc.
  ativo    boolean DEFAULT true
);

-- Catálogo de cargos
CREATE TABLE cargos (
  id       text PRIMARY KEY,           -- 'lider_integracao', 'diretor_geral'
  nome     text NOT NULL,
  setor    text,
  hierarquia int,                      -- pra ordenar (1 = mais alto)
  ativo    boolean DEFAULT true
);

-- Permissões padrão de cada cargo (1 linha por cargo × módulo)
CREATE TABLE cargo_permissoes (
  cargo_id    text REFERENCES cargos(id),
  modulo_id   text REFERENCES modulos(id),
  nivel       smallint NOT NULL,       -- 0-5
  pode_exportar boolean DEFAULT false, -- +E
  pode_aprovar  boolean DEFAULT false, -- +A
  so_propria_area boolean DEFAULT false, -- *
  PRIMARY KEY (cargo_id, modulo_id)
);

-- Vínculo pessoa-cargo (uma pessoa pode ter 1+ cargos · ex: Marcos é Dir Estrat + Líder Adm)
ALTER TABLE profiles
  ADD COLUMN cargo_principal_id text REFERENCES cargos(id);

CREATE TABLE profile_cargos_adicionais (
  profile_id  uuid REFERENCES profiles(id),
  cargo_id    text REFERENCES cargos(id),
  desde       date DEFAULT CURRENT_DATE,
  ate         date,                    -- NULL = ativo
  PRIMARY KEY (profile_id, cargo_id)
);

-- Overrides por pessoa
CREATE TABLE profile_permissao_override (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id    uuid REFERENCES profiles(id),
  modulo_id     text REFERENCES modulos(id),
  tipo          text CHECK (tipo IN ('adicionar','remover')),
  nivel         smallint,              -- só relevante se tipo='adicionar'
  pode_exportar boolean DEFAULT false,
  pode_aprovar  boolean DEFAULT false,
  so_propria_area boolean DEFAULT false,
  motivo        text NOT NULL,
  concedido_por uuid REFERENCES profiles(id),
  concedido_em  timestamptz DEFAULT now(),
  valido_ate    date,                  -- NULL = indefinido
  ativo         boolean DEFAULT true
);

-- Audit trail
CREATE TABLE permissao_log (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  acao         text,                   -- 'cargo_change', 'override_grant', 'override_revoke'
  profile_id   uuid REFERENCES profiles(id),
  detalhes     jsonb,
  feito_por    uuid REFERENCES profiles(id),
  feito_em     timestamptz DEFAULT now()
);
```

**Função `usuario_tem_permissao(profile_id, modulo_id, nivel_minimo)`** centraliza a lógica:
1. Pega cargo principal + adicionais
2. Soma permissões dos cargos (pior caso = maior nível)
3. Aplica overrides "adicionar" (eleva nível se necessário)
4. Aplica overrides "remover" (rebaixa nível se necessário)
5. Verifica expiração de overrides
6. Retorna `boolean` se atinge nível mínimo

Middleware Express usa essa função em vez de checks ad-hoc.

UI `/admin/permissoes` lista:
- Cargos + matriz editável
- Pessoas + cargo atual + overrides ativos
- Histórico (audit log)

---

## 7. Perguntas em aberto (responde rápido)

1. **Pessoas com múltiplos cargos:** Marcos é Diretor de Estratégia E "Líder Adm" (área `adm` na CLAUDE.md). Mantém os 2 cargos somando perms ou cria cargo único "Diretor de Estratégia / PMO" que já inclui Adm?
   - [ ] múltiplos cargos
   - [ ] cargo único combinado

2. **Cargo "Líder de Área" genérico ou específico:** prefere 1 cargo genérico vinculado a uma `kpi_area` (mais simples · "Líder de Área (Integração)" só pelo vínculo) ou um cargo por área (mais explícito · "Líder Integração", "Líder AMI", etc.)?
   - [ ] genérico vinculado à área
   - [ ] específico por área

3. **Pastor Sênior · 100% leitura ou pode tudo?**
   - [ ] leitura total + ritual (cargo "honorário"/observador)
   - [ ] admin tudo

4. **Conselho Estatutário · só dashboard executivo?** Sugiro `1` em Painel/Dashboard/Gestão e `0` em todo o resto.
   - [ ] sim
   - [ ] outro arranjo: ____

5. **Exportar dados sensíveis (`+E`):** quem pode tirar relatório com CPF/telefone? Sugiro: Dir Geral, Dir Estrat, Líderes da área de origem do dado.

6. **Voluntário ganha acesso só após onboarding?** Tipo `0` em tudo até admin promover pra `Voluntário ativo`?
   - [ ] sim, fluxo de onboarding
   - [ ] já entra como Voluntário direto

7. **Dev (Matheus/Marcos):** cargo `Suporte/Dev` tem `5+E+A` em tudo? Ou separar "Dev backend" (full) de "Dev frontend" (parcial)?
   - [ ] full em tudo
   - [ ] separar perfis

8. **Override por pessoa · quem concede?**
   - [ ] só admin/diretor
   - [ ] admin/diretor + líder dentro da própria área
   - [ ] livre (qualquer cargo concede dentro do seu escopo)

9. **Expiração padrão do override:**
   - [ ] 30 dias
   - [ ] 90 dias
   - [ ] indefinido (precisa revogação manual)

10. **Migração do que existe hoje:** plano sugerido pra mim aplicar quando você devolver:
    - Backfill: mapear `profiles.role` atual pra cargo equivalente (ex: `role='diretor'` → `cargo_principal_id='diretor_geral'`)
    - Manter colunas antigas (`kpi_areas`, `kpi_valores`) por 1 release · deprecated mas funcionais
    - Remover hard-coded `authorizeIntegracao` etc · substituir por `authorize('integracao', 'write')`
    - [ ] OK
    - [ ] quero outro caminho: ____

---

## 8. Cronograma estimado (pra teu cálculo de prioridade)

| Fase | O que entrega | Tempo estimado |
|------|---------------|----------------|
| Fase 1 | Schema + seed cargos + matriz baseada nesse doc | 1 dia |
| Fase 2 | Função `usuario_tem_permissao` + middleware unificado | 1 dia |
| Fase 3 | Refactor de ~80 endpoints pra usar middleware novo | 2-3 dias |
| Fase 4 | UI `/admin/permissoes` (matriz editável + overrides + audit) | 2 dias |
| Fase 5 | Migração de dados existentes + deprecação das colunas antigas | 1 dia |
| Fase 6 | Testes + ajustes finos | 1 dia |

Total: **8-10 dias úteis**. Bem investido antes da onda de 50+ pessoas que vai entrar.

Pode dividir em PRs pequenos se preferir entregar incremental.

---

## 9. Próximo passo

Quando devolver, eu:
1. Leio o que você preencheu
2. Se tiver gaps grandes, pergunto antes de codar
3. Crio migration de schema + seed inicial dos cargos/módulos/matriz
4. Implemento fase a fase (PR por fase pra você revisar)

Sem pressa · responde no seu tempo. Quanto mais detalhado, menos perguntas eu faço depois.
