# Runbook de Segurança · CBRio

**Documento canônico de referência** para entender o estado atual da
segurança do sistema, executar tarefas comuns e diagnosticar problemas.
Atualizado: 2026-05-22 (pós Auditoria de Segurança 2026-05-21).

Para **REGRAS OBRIGATÓRIAS** (que toda sessão futura do Claude deve
seguir), ver o topo do `CLAUDE.md`. Este runbook é a referência longa.

---

## 📑 Sumário

1. [Contexto da auditoria](#contexto-da-auditoria)
2. [Inventário de PRs](#inventário-de-prs)
3. [Funções SQL helpers](#funções-sql-helpers)
4. [Tabelas com RLS contextual](#tabelas-com-rls-contextual)
5. [Tabelas com soft-delete](#tabelas-com-soft-delete)
6. [Tabelas com audit log](#tabelas-com-audit-log)
7. [Matriz de permissões](#matriz-de-permissões)
8. [Super-admin · gestão](#super-admin-gestão)
9. [Backend · padrões obrigatórios](#backend-padrões-obrigatórios)
10. [Como adicionar nova tabela com PII](#como-adicionar-nova-tabela-com-pii)
11. [Como adicionar novo módulo](#como-adicionar-novo-módulo)
12. [Troubleshooting comum](#troubleshooting-comum)
13. [Frentes deferidas](#frentes-deferidas)

---

## Contexto da auditoria

Em 2026-05-21, auditoria identificou riscos críticos no sistema:

| Risco original | Severidade |
|---|---|
| 209 policies com `USING(true)` em writes (privilege escalation) | 🔴 Crítico |
| 81 FKs com `ON DELETE CASCADE` (perda de histórico irreversível) | 🔴 Crítico |
| 0 tabelas com `deleted_at` (sem soft-delete) | 🔴 Crítico |
| Anon insert em `mem_grupo_pedidos` (spam vector) | 🔴 Crítico |
| `DATABASE_URL` na porta 5432 (connection exhaustion em culto) | 🟠 Alto |
| 48 FKs sem índice na coluna filha (lentidão em joins) | 🟠 Alto |
| Sem audit log de mudanças sensíveis (CPF, salário) | 🟠 Alto |
| Sem PITR (Point In Time Recovery) habilitado | 🟡 Médio |
| `responsavel/leader` armazenados como TEXT (quebra com renomeação) | 🟡 Médio |

**Decisão estratégica**: resolver via código (sem custo extra de PITR
US$100/mês), com defesa em profundidade.

---

## Inventário de PRs

14 PRs entregues entre 2026-05-21 e 2026-05-22:

| PR | Conteúdo | Tabelas/Componentes |
|---|---|---|
| #586 | Super-admin + lockdown P0 | `app_super_admins`, `is_super_admin()`, lockdown `cargo_modulo_permissao`/`igrejas`/`kpi_metas`, drop anon `mem_grupo_pedidos` |
| #590 | Soft-delete + FK fix | `deleted_at` em 30 tabelas + `app_soft_delete()`/`app_restore()` + 21 FKs CASCADE→SET NULL |
| #593 | RLS Kids LGPD + hotfix módulos | 7 tabelas kids_* + módulos kids/ami/bridge faltantes inseridos |
| #596 | RLS Financeiro/RH/PCS | 16 tabelas (`mem_contribuicoes`, `rh_*`, `pcs_*`) + 2 helpers (`current_user_funcionario_id`, `user_is_lider_de`) |
| #599 | RLS PII | 8 tabelas (`mem_membros`, `cultos_decisoes_pessoas`, `batismo_inscricoes`, `nsm_eventos`, `int_visitantes`, `cui_*`) |
| #602 | Doc canônica + backend soft-delete | CLAUDE.md atualizada + 5 endpoints usando `app_soft_delete()` |
| #603 | UUID FKs (colunas adicionadas) | 6 colunas UUID em 5 tabelas (`area_responsaveis.responsavel_id`, `projects.leader_id`/`responsible_id`, `event_tasks.responsible_id`, `cycle_phase_tasks.responsavel_id`, `project_tasks.responsible_id`) |
| #604 | Audit log mudanças sensíveis | `app_audit_log` + função `audit_log_changes()` + 8 triggers (10 com permissoes_modulo/usuario_areas) |
| #608 | Atribuir cargo formal a 19 funcionários | Bulk UPDATE em `usuarios.cargo_id` |
| #612 | 35 índices FK + RLS mem_* + devocional | 13 tabelas `mem_*` operacionais + 4 tabelas devocional/solicitacoes_eventos + 35 índices |
| #639 | Backend dual-write UUID | 5 arquivos backend gravando UUID + TEXT em paralelo + Projetos.jsx "Minhas Tarefas" prioriza UUID |
| #640 | Backend filtra `deleted_at IS NULL` | 24 SELECTs em 5 arquivos backend (jornada, grupos, cuidados, kpis, membresia) |
| #642 | Lockdown final policies legacy | 13 tabelas com policies legacy USING(true) re-criadas em migrations recentes (kids_*_write, mem_grupo_pedidos, grupo_supervisao_*, cui_atendimentos_agregado, vol_inscricoes, okr_revisoes) |

---

## Funções SQL helpers

10 funções criadas em `public`. Usar SEMPRE em policies novas.

### `is_super_admin() → BOOLEAN`

Curto-circuito em policies. Marcos + Matheus por padrão (em
`app_super_admins`).

```sql
CREATE POLICY tabela_delete ON public.tabela
  FOR DELETE TO authenticated USING (public.is_super_admin());
```

### `current_user_membro_id() → UUID`

Retorna `mem_membros.id` do user logado. Via `profiles.membro_id` ou
fallback email LOWER. SECURITY DEFINER.

```sql
CREATE POLICY mem_xxx_select ON public.mem_xxx
  FOR SELECT TO authenticated
  USING (membro_id = public.current_user_membro_id());
```

### `current_user_funcionario_id() → UUID`

Retorna `rh_funcionarios.id` do user logado (via email LOWER).

```sql
CREATE POLICY rh_xxx_select ON public.rh_xxx
  FOR SELECT TO authenticated
  USING (funcionario_id = public.current_user_funcionario_id());
```

### `current_user_module_level(slug TEXT) → INTEGER (0-5)`

Replica `resolveEffectivePerms()` do middleware no SQL:
- Super-admin → 5
- Override em `permissoes_modulo` (com expira_em)
- Default da matriz `cargo_modulo_permissao`
- `AREA_MODULO_BOOST` (escala pra 5 se user tem área correspondente em
  `usuario_areas`) · 9 módulos com boost: kids, ami, bridge, online,
  cuidados, grupos, integracao, voluntariado, next

```sql
CREATE POLICY tabela_write ON public.tabela
  FOR INSERT TO authenticated
  WITH CHECK (public.current_user_module_level('modulo') >= 2);
```

### `user_is_kids_responsavel(crianca_id UUID) → BOOLEAN`

TRUE se user é responsável da criança (via `kids_responsaveis`).

### `user_is_lider_de(funcionario_id UUID) → BOOLEAN`

TRUE se user é gestor direto do funcionário (via `rh_funcionarios.gestor_id`).

### `app_soft_delete(table TEXT, id TEXT, deleted_by UUID) → BOOLEAN`

Substitui DELETE direto. Whitelist em `app_soft_deletable_tables()`.
SECURITY DEFINER bypass RLS.

```js
// Backend
await supabase.rpc('app_soft_delete', {
  p_table_name: 'mem_membros',
  p_row_id: memberId,
  p_deleted_by: req.user?.id ?? null
});
```

### `app_restore(table TEXT, id TEXT) → BOOLEAN`

Desfaz soft-delete (`deleted_at = NULL`).

### `app_soft_deletable_tables() → TEXT[]`

Whitelist canônica das 30 tabelas soft-deletable. **Atualizar sempre
que adicionar `deleted_at` em nova tabela.**

### `audit_log_changes()` (TRIGGER)

Função genérica AFTER INSERT/UPDATE/DELETE. TG_ARGV[0] opcional com
CSV de colunas a auditar.

```sql
CREATE TRIGGER trg_audit_nova_tabela
AFTER INSERT OR UPDATE OR DELETE ON public.nova_tabela
FOR EACH ROW EXECUTE FUNCTION public.audit_log_changes(
  'col_sensivel1,col_sensivel2'
);
```

---

## Tabelas com RLS contextual

53 tabelas auditadas · **0 com policies write `USING(true)`** após PR #642.

### Padrão de permissões por nível de módulo

| Nível | Operação |
|---|---|
| 0 | Sem acesso (módulo não aparece no menu) |
| 1 | Ver (read-only) |
| 2 | Ver + criar/preencher dado |
| 3 | Ver + criar + editar (CRUD) |
| 4 | Ver + criar + editar + deletar |
| 5 | Admin do módulo (configura regras, seeds, deleta tudo) |

### Bloco P0 · super-admin only writes (4 tabelas)

| Tabela | Read | Write |
|---|---|---|
| `cargo_modulo_permissao` | authenticated | super-admin |
| `igrejas` | authenticated | super-admin |
| `kpi_metas` | authenticated | super-admin |
| `app_super_admins` | super-admin | super-admin |
| `permissoes_modulo` | authenticated | super-admin |
| `usuario_areas` | authenticated | super-admin |

### Kids (LGPD menores · 7 tabelas)

| Tabela | READ | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| `kids_criancas` | responsável OR kids≥1 | kids≥3 | kids≥3 | super-admin |
| `kids_responsaveis` | próprio OR kids≥1 | kids≥3 | kids≥3 | super-admin |
| `kids_checkins` | responsável OR kids≥1 | kids≥2 | kids≥3 | super-admin |
| `kids_sessoes` | kids≥1 | kids≥3 | kids≥3 | super-admin |
| `kids_salas` | kids≥1 | kids≥5 | kids≥5 | super-admin |
| `kids_estacoes` | kids≥1 | kids≥5 | kids≥5 | super-admin |
| `kids_etiquetas_log` | kids≥3 | kids≥1 | super-admin (audit imutável) | super-admin |

### Financeiro/RH/PCS (16 tabelas)

| Tabela | READ | INSERT/UPDATE | DELETE |
|---|---|---|---|
| `mem_contribuicoes` | próprias OR financeiro≥3 | financeiro≥3 | super-admin |
| `rh_funcionarios` | próprio OR rh≥3 OR financeiro≥3 | rh≥3 (próprio update OK) | super-admin |
| `rh_documentos` | próprio OR rh≥3 | rh≥3 | super-admin |
| `rh_avaliacoes` | próprio OR líder OR rh≥3 | mesmo | super-admin |
| `rh_avaliacao_fatores` | herda via avaliacao_id | herda | super-admin |
| `rh_treinamentos` (catálogo) | todos | rh≥3 | super-admin |
| `rh_treinamentos_funcionarios` | próprio OR rh≥3 | rh≥3 | super-admin |
| `rh_ferias_licencas` | próprio OR líder OR rh≥3 | próprio OR rh≥3 (líder aprova) | super-admin |
| `pcs_graus`/`pcs_criterios`/`pcs_niveis_criterio`/`pcs_beneficios`/`pcs_beneficio_grau`/`pcs_reajustes_coletivos` (config) | rh≥1 | super-admin | super-admin |
| `pcs_progressoes`/`pcs_pontuacao_colaborador` (histórico) | próprio OR rh≥3 | rh≥3 | super-admin |

### PII geral (8 tabelas)

| Tabela | READ | INSERT/UPDATE | DELETE |
|---|---|---|---|
| `mem_membros` | próprio OR membresia≥1 | membresia≥3 (próprio update OK) | super-admin |
| `cultos_decisoes_pessoas` | linkado OR integracao/cuidados≥1 OR membresia≥3 | integracao≥2 ou kids≥2 (INSERT) · integracao/cuidados≥3 (UPDATE) | super-admin |
| `batismo_inscricoes` | linkado OR integracao≥1 OR membresia≥3 | integracao≥2 (INSERT) ≥3 (UPDATE) | super-admin |
| `nsm_eventos` | linkado OR integracao/cuidados/painel-cbrio≥1 | integracao/cuidados≥2 | super-admin |
| `int_visitantes` | linkado OR integracao/cuidados≥1 | integracao/cuidados≥2 (INSERT) ≥3 (UPDATE) | super-admin |
| `cui_acompanhamentos`/`cui_jornada180`/`cui_convertidos` | próprio OR cuidados/integracao≥1 | cuidados/integracao≥2 (INSERT) ≥3 (UPDATE) | super-admin |

### Membresia operacional (13 tabelas)

| Tabela | READ | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| `mem_familias` | família OR membresia≥1 | membresia≥3 | membresia≥3 | super-admin |
| `mem_grupos` (catálogo) | todos | grupos≥3 | líder OR grupos≥3 | super-admin |
| `mem_grupo_membros` | próprio OR grupos≥1 | grupos≥2 | grupos≥3 | super-admin |
| `mem_grupo_encontros` | grupos≥1 | grupos≥2 | grupos≥3 | super-admin |
| `mem_grupo_encontro_presencas` | próprio OR grupos≥1 | grupos≥2 | grupos≥3 | super-admin |
| `mem_grupo_documentos` | todos | grupos≥2 | grupos≥3 | super-admin |
| `mem_grupo_pedidos` | todos | integracao/cuidados/grupos≥2 | ≥3 | super-admin |
| `mem_ministerios` (catálogo) | todos | voluntariado≥3 | voluntariado≥3 | super-admin |
| `mem_voluntarios` | próprio OR voluntariado≥1 | voluntariado≥2 | próprio OR voluntariado≥3 | super-admin |
| `mem_escalas` | todos | voluntariado≥2 | voluntariado≥3 | super-admin |
| `mem_checkins` | próprio OR voluntariado≥1 | próprio OR voluntariado≥1 (self-checkin) | voluntariado≥3 | super-admin |
| `mem_historico` | próprio OR cuidados/membresia≥1 | cuidados/membresia≥2 | cuidados/membresia≥3 | super-admin |
| `mem_temporadas` (catálogo) | todos | grupos≥3 | grupos≥3 | super-admin |
| `mem_devocionais` | próprio OR cuidados≥1 | próprio OR cuidados≥2 | próprio OR cuidados≥3 | super-admin |

### Devocional + Solicitações + Supervisão (extras)

- `devocional_planos`/`devocional_itens` (catálogo) · cuidados≥3 write
- `devocional_envios` · próprio OR cuidados
- `solicitacoes_eventos` · audit imutável (UPDATE/DELETE só super-admin)
- `grupo_supervisao_observacoes`/`visitas` · grupos≥2/3
- `cui_atendimentos_agregado` · cuidados≥2/3
- `vol_inscricoes` · voluntariado≥2/3
- `okr_revisoes` · revisao-estrategica≥2/3

---

## Tabelas com soft-delete

30 tabelas têm coluna `deleted_at TIMESTAMPTZ` + índice parcial `WHERE
deleted_at IS NULL`. Whitelist canônica em
`public.app_soft_deletable_tables()`:

```
mem_membros, mem_familias, mem_grupos, mem_grupo_membros, mem_voluntarios,
mem_contribuicoes, mem_trilha_valores, mem_devocionais, mem_historico,
mem_grupo_encontros, mem_grupo_pedidos, cultos, cultos_decisoes_pessoas,
batismo_inscricoes, nsm_eventos, kids_criancas, kids_checkins, kids_sessoes,
cui_jornada180, cui_acompanhamentos, cui_convertidos, int_visitantes,
kpi_indicadores_taticos, kpi_metas, rh_funcionarios, rh_documentos,
pcs_progressoes, projects, solicitacoes, usuarios
```

**Não incluídas** (PK composta · não suportam soft-delete via id):
- `kpi_valores_calculados` (cache derivado · FK CASCADE→SET NULL no kpi_id preserva)
- `cargo_modulo_permissao` (matriz de configuração · célula existe ou não)

### FKs CASCADE → SET NULL convertidas (21)

**mem_membros** preserva 11 filhas históricas:
contribuicoes, trilha_valores, historico, voluntarios, escalas, checkins,
devocionais, grupo_membros, devocional_envios, nsm_eventos,
grupo_encontro_presencas

**rh_funcionarios** preserva 6 filhas:
documentos, treinamentos, ferias, avaliacoes, avaliacoes_legacy,
progressoes, pontuacao_colaborador

**cultos** preserva 2: decisoes_pessoas, kids_sessoes

**kpi_indicadores_taticos** preserva 2: registros, trajetoria

**CASCADE intencionalmente mantidos** (parent-child verdadeiro):
- `mem_duplicados_ignorados`, `mem_grupo_pedidos` (transient)
- `rh_escalas_extras`, `rh_materiais_funcionarios` (operacional)
- `kpi_krs`, `okr_revisoes` (estrutura OKR)
- `kpi_valores_calculados` (cache · PK composta)

---

## Tabelas com audit log

11 tabelas têm trigger `trg_audit_*` que grava em `app_audit_log`:

| Tabela | Colunas auditadas |
|---|---|
| `profiles` ⚠️ | role, membro_id, is_diretoria_geral, funcao_diretoria, kpi_areas, kpi_valores, is_membro_only, is_servico, active, area, ministerio_id, ministerio_papel, email, status |
| `rh_funcionarios` | salario, remuneracao_bruta, grau_id, status, data_demissao, data_admissao, cpf, email, deleted_at |
| `mem_membros` | cpf, status, nome, email, telefone, deleted_at |
| `mem_contribuicoes` | valor, tipo, membro_id, deleted_at |
| `pcs_progressoes` | salarios anterior/novo, graus anterior/novo, aprovado_por, deleted_at |
| `batismo_inscricoes` | cpf, status, membro_id, deleted_at |
| `cultos_decisoes_pessoas` | cpf, responsavel_cpf, telefones, membro_id, deleted_at |
| `cargo_modulo_permissao` | nivel, modificadores |
| `app_super_admins` | email, ativo, nome |
| `permissoes_modulo` | nivel_leitura, nivel_escrita, modificadores, expira_em |
| `usuario_areas` | usuario_id, area_id, is_principal |

### Schema `app_audit_log`

```
id BIGSERIAL PK,
table_name TEXT, row_id TEXT, action TEXT,
user_id UUID, user_email TEXT, changes JSONB,
created_at TIMESTAMPTZ
```

Imutável (RLS bloqueia UPDATE/DELETE · só super-admin lê).

### Consultas comuns

```sql
-- Quem mudou o salário do funcionário X?
SELECT user_email, changes->'salario', created_at
FROM app_audit_log
WHERE table_name = 'rh_funcionarios'
  AND row_id = '<uuid>'
  AND changes ? 'salario'
ORDER BY created_at DESC;

-- Histórico de alterações na matriz de permissões
SELECT user_email, changes, created_at
FROM app_audit_log
WHERE table_name = 'cargo_modulo_permissao'
ORDER BY created_at DESC LIMIT 100;

-- Quem deletou (soft-delete) qualquer coisa nas últimas 24h?
SELECT table_name, row_id, user_email, created_at
FROM app_audit_log
WHERE changes ? 'deleted_at'
  AND created_at > now() - interval '24 hours'
ORDER BY created_at DESC;
```

---

## Matriz de permissões

A matriz vive em **2 tabelas**:

- `cargo_modulo_permissao` · default por cargo (matriz da planilha
  · source of truth) · `(cargo_id, modulo_id)` PK
- `permissoes_modulo` · override individual (com `expira_em` opcional)

View `vw_permissao_efetiva` faz fallback `override → default cargo → 0`.

### AREA_MODULO_BOOST (em `backend/middleware/auth.js:92`)

Se user tem área correspondente em `usuario_areas`, ganha **nível 5
automático** no módulo:

```js
{ cuidados, grupos, integracao, voluntariado, next, online,
  kids, ami, bridge }
```

Replicado em SQL via `current_user_module_level()` ETAPA boost.

### 25 cargos canônicos

`pastor-senior`, `pastor-presidente`, `diretor-administrativo`,
`coordenador-estrategia`, `diretor-ministerial`, `diretor-criativo`,
`diretor-rh`, `lider-ministerial`, `assistente-area`,
`assistente-ministerial`, `coordenador-financeiro`,
`assistente-financeiro`, `coordenador-marketing`, `assistente-marketing`,
`coordenador-kids`, `coordenador-ami`, `coordenador-bridge`,
`coordenador-online`, `coordenador-voluntarios`,
`lider-producao`, `assistente-producao`,
`lider-logistica`, `assistente-logistica`,
`lider-operacoes`, `assistente-operacoes`,
`voluntario`, `membro`, `conselho`, `dev`.

### Modificadores

- `pode_exportar` (+E) · CPF, telefone, financeiro (LGPD)
- `pode_aprovar` (+A) · workflows do módulo
- `escopo_proprio` (*) · acesso só da própria área

### Após mudar matriz direto no SQL

**OBRIGATÓRIO**:
1. `POST /api/permissoes/cache/bust` (ou botão em `/admin/permissoes`)
2. User afetado faz **logout completo + login** pra renovar JWT

---

## Super-admin · gestão

Bootstrap (Marcos + Matheus). Lista em `public.app_super_admins`.

### Adicionar novo super-admin

```sql
INSERT INTO public.app_super_admins (email, nome, added_by, notes)
VALUES ('novo@cbrio.com.br', 'Nome Completo', 'marcos', 'motivo')
ON CONFLICT (email) DO NOTHING;
```

Match por email **lowercase** contra `auth.users.email`.

### Desativar super-admin

```sql
UPDATE public.app_super_admins
   SET ativo = false
 WHERE email = 'antigo@cbrio.com.br';
```

Histórico preservado (não deleta).

### Verificar se alguém é super-admin

```sql
-- Como super-admin (Marcos/Matheus logado no app)
SELECT public.is_super_admin();

-- Listar todos os ativos
SELECT email, nome FROM public.app_super_admins WHERE ativo = true;
```

---

## Backend · padrões obrigatórios

### Soft-delete (em vez de hard-delete)

```js
// ❌ ERRADO · hard delete irreversível
await supabase.from('mem_membros').delete().eq('id', memberId);

// ✅ CERTO · soft delete reversível + auditável
await supabase.rpc('app_soft_delete', {
  p_table_name: 'mem_membros',
  p_row_id: memberId,
  p_deleted_by: req.user?.id ?? null
});
```

### SELECTs em tabelas com soft-delete

```js
// ✅ Filtrar deleted_at IS NULL em listagens
await supabase
  .from('mem_membros')
  .select('*')
  .is('deleted_at', null)  // ← obrigatório
  .order('nome');
```

### Dual-write UUID + TEXT (transição)

5 tabelas têm colunas UUID novas + TEXT antigas:
`area_responsaveis.responsavel_id/_nome`, `projects.leader_id/leader`,
`projects.responsible_id/responsible`, `event_tasks.responsible_id/responsible`,
`cycle_phase_tasks.responsavel_id/_nome`, `project_tasks.responsible_id/responsible`.

```js
// Backend INSERT/UPDATE · gravar ambos
await supabase.from('projects').insert({
  // ... outros campos ...
  leader: d.leader || '',            // snapshot TEXT (UI legacy)
  leader_id: d.leader_id || null,    // UUID FK (canônico)
  responsible: d.responsible || '',
  responsible_id: d.responsible_id || null,
});

// Frontend filter · prioriza UUID
const myTasks = tasks.filter(t => {
  const matchById = profile?.id && t.responsible_id === profile.id;
  const matchByName = !t.responsible_id && profile?.name && t.responsible === profile.name;
  return matchById || matchByName;
});
```

### Restaurar soft-deleted

```js
await supabase.rpc('app_restore', {
  p_table_name: 'mem_membros',
  p_row_id: memberId
});
```

---

## Como adicionar nova tabela com PII

Checklist em ordem:

1. **Schema com `deleted_at`**:
```sql
CREATE TABLE public.nova_tabela_pii (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  membro_id UUID REFERENCES public.mem_membros(id) ON DELETE SET NULL,
  -- outras colunas
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ  -- ← obrigatório
);
```

2. **Índice parcial**:
```sql
CREATE INDEX idx_nova_tabela_pii_active
  ON public.nova_tabela_pii (id) WHERE deleted_at IS NULL;
```

3. **Adicionar à whitelist `app_soft_deletable_tables()`**:
```sql
CREATE OR REPLACE FUNCTION public.app_soft_deletable_tables()
RETURNS TEXT[] LANGUAGE sql IMMUTABLE AS $$
  SELECT ARRAY[
    -- ... lista existente ...
    'nova_tabela_pii'  -- ← adicionar aqui
  ]::TEXT[]
$$;
```

4. **RLS obrigatório**:
```sql
ALTER TABLE public.nova_tabela_pii ENABLE ROW LEVEL SECURITY;

-- Mínimo 5 policies
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
  FOR DELETE TO authenticated USING (public.is_super_admin());

CREATE POLICY nova_tabela_pii_service ON public.nova_tabela_pii
  FOR ALL TO service_role USING (true) WITH CHECK (true);
```

5. **Audit log (se PII sensível)**:
```sql
CREATE TRIGGER trg_audit_nova_tabela_pii
AFTER INSERT OR UPDATE OR DELETE ON public.nova_tabela_pii
FOR EACH ROW EXECUTE FUNCTION public.audit_log_changes(
  'cpf,col_sensivel,deleted_at'
);
```

6. **Backend usa app_soft_delete()** (não DELETE direto)

7. **Backend filtra `deleted_at IS NULL`** em listagens

---

## Como adicionar novo módulo

```sql
-- 1. INSERT na tabela modulos
INSERT INTO public.modulos (slug, nome, rota, categoria, ordem, descricao, ativo)
SELECT 'novo-modulo', 'Nome Modulo', '/nova-rota', 'ministerial', 999,
       'descricao', true
WHERE NOT EXISTS (SELECT 1 FROM public.modulos WHERE slug = 'novo-modulo');

-- 2. Seed matriz default · copia de modulo similar
DO $$
DECLARE base_modulo_id int;
BEGIN
  SELECT id INTO base_modulo_id FROM public.modulos WHERE slug = 'modulo_similar';
  INSERT INTO public.cargo_modulo_permissao
    (cargo_id, modulo_id, nivel, pode_exportar, pode_aprovar, escopo_proprio)
  SELECT cmp.cargo_id, novo.id, cmp.nivel, cmp.pode_exportar,
         cmp.pode_aprovar, cmp.escopo_proprio
    FROM public.cargo_modulo_permissao cmp
    CROSS JOIN public.modulos novo
   WHERE cmp.modulo_id = base_modulo_id
     AND novo.slug = 'novo-modulo'
  ON CONFLICT (cargo_id, modulo_id) DO NOTHING;
END $$;

-- 3. Se módulo segue padrão "área = slug" e quer boost por área,
-- adicionar ao AREA_MODULO_BOOST em backend/middleware/auth.js E
-- ao array dentro da função current_user_module_level()
```

---

## Troubleshooting comum

### "Mariane não vê Kids no menu mesmo com cargo coordenador-kids"

Possibilidades (em ordem):
1. Módulo `kids` não existe em `public.modulos` (verificar)
2. Mariane não tem área "KIDS" em `usuario_areas` (boost não aplica)
3. JWT antigo · pedir logout completo + login
4. Cache do middleware (5 min) · `POST /api/permissoes/cache/bust`

### "Voluntário consegue ler CPF de funcionários (LGPD)"

Não deveria. Validar:
```sql
-- Como voluntário (após login)
SELECT public.current_user_module_level('rh');  -- espero 0 ou 1
-- Se >= 3, voluntário ganhou permissão indevida · revisar matriz
```

### "Soft-delete não funciona · registros aparecem mesmo após DELETE"

- Verificar se backend usa `app_soft_delete()` em vez de `.delete()`
- Verificar se queries SELECT têm `.is('deleted_at', null)`
- Verificar se tabela está na whitelist `app_soft_deletable_tables()`

### "Trigger de audit não grava evento"

- A coluna que mudou está na lista `TG_ARGV[0]` da trigger?
- `auth.uid()` retorna NULL no SQL Editor (rodando como `postgres`).
  Pra testar mudança real, usar UI da aplicação.

### "Renomeei profile · filtros 'meu projeto' quebraram"

Antes da PR #639, sim. Agora:
- Backend grava `leader_id` UUID + `leader` TEXT (dual-write)
- Frontend Projetos.jsx "Minhas Tarefas" prioriza UUID
- Outras telas: mantém TEXT como fallback até migrar

---

## Frentes deferidas

### 🟡 Refatorar frontend pra autocomplete profiles

Hoje muitos forms usam `<input type="text">` pra leader/responsible.
Trocar por autocomplete de `profiles` (retorna `{id, name}`) e usar:
```js
{ leader: profile.name, leader_id: profile.id }
```

### 🟡 Dropar colunas TEXT antigas

Quando backend + frontend estiverem 100% usando UUID:
```sql
ALTER TABLE area_responsaveis  DROP COLUMN responsavel_nome;
ALTER TABLE projects           DROP COLUMN leader, DROP COLUMN responsible;
ALTER TABLE event_tasks        DROP COLUMN responsible;
ALTER TABLE cycle_phase_tasks  DROP COLUMN responsavel_nome;
ALTER TABLE project_tasks      DROP COLUMN responsible;
```

### 🔴 Criptografia CPF via pgcrypto (alto risco · janela de manutenção)

- `CREATE EXTENSION pgcrypto`
- Converter colunas `cpf` TEXT → BYTEA
- Funções `encrypt_cpf(text)` / `decrypt_cpf(bytea)` SECURITY DEFINER
- Backfill encriptar dados existentes
- Refactor de TODAS as queries que tocam CPF (estimado 6-8h)

### 🟡 Resolver 11 funcionários sem email

`rh_funcionarios` ativos sem email institucional (Alba, Alexandra,
Amaury, Andre, Fatima, Keila, Lillian Oliveira, Luzia, Maria Jane,
Sonia). Decisão: criar emails ou aceitar sem login.

### 🟡 Conflitos pendentes (resolver offline)

- Jose Ribamar · acesso negado mas com áreas
- Duplicata Amaury × Amaury de Araújo Junior
- Duplicata Lillian Oliveira × Lillian Xavier
- Filipe Carmet (RH=coord-ami) vs Arthur Cecconi (sistema=coord-ami)

### 🔴 PITR (deferido por custo · US$100/mês)

Decisão estratégica: resolver via soft-delete + CASCADE→SET NULL em
vez de pagar add-on. Reavaliar quando base crescer pra 50k pessoas.

---

## Estado final · indicadores

| Indicador | Antes | Depois |
|---|---|---|
| Policies abertas em writes (USING true) | ~209 | **0** ✅ |
| FKs CASCADE destrutivas | 81 | 60 (21 convertidas) |
| Tabelas com soft-delete | 0 | **30** ✅ |
| Tabelas com audit log | 0 | **10** ✅ |
| FKs sem índice | 48 | 13 (35 criados) |
| Funcionários com cargo formal | 16/47 | 35/47 |
| Funções helpers SQL | 0 | **10** ✅ |
| Anon insert em PII | Sim | Não ✅ |
| Connection pool (porta) | 5432 | 6543 ✅ |
| Documentação canônica | Não | **CLAUDE.md + este runbook** ✅ |
