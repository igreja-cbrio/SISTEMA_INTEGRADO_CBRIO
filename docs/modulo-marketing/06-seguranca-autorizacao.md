# Módulo Marketing — Segurança e Autorização (Fase 7)

> **Status:** v1.0 · 2026-05-28
> **Pré-requisito:** Modelagem aprovada (`05-modelagem-dados.md`)
> **Próxima fase:** Fase 8 — Decomposição em Specs (`07-decomposicao-specs.md`)

> **Versão reduzida** — herda boa parte do framework de segurança do CBRio
> (CLAUDE.md > "Regras Obrigatórias de Segurança"). Foco no que é específico do
> módulo.

---

## 1. LGPD (lite)

### 1.1 Dados pessoais tratados
- **PII direto**: nenhum diretamente no schema do Marketing (só FKs pra `profiles`).
- **Indireto via fotos**: entregáveis no SharePoint podem conter fotos de pessoas
  (cultos, eventos). Biblioteca SharePoint privada (autenticação Microsoft Graph),
  signed URLs com TTL curto.

### 1.2 Base legal
- **Cumprimento de obrigação contratual** (funcionários produzindo conteúdo da igreja).
- **Consentimento implícito de membros** (participação em culto público é
  consentimento pra fotografia institucional · documentação geral da igreja).

### 1.3 Retenção
- Cards: indefinida (histórico operacional · soft-delete reversível).
- Entregáveis no SharePoint: política da igreja (não específica do módulo).
- Audit log: 5 anos (padrão CBRio).

### 1.4 Não aplica (porque é sistema interno)
- Política de privacidade pública.
- DPA com sub-processadores.
- Direito de portabilidade (funcionário não "porta" dado de demanda interna).
- Banner de cookies.

---

## 2. Autenticação

**Herdada do CBRio** — Supabase Auth + middleware `authenticate` em
`backend/middleware/auth.js`. Sem mudança.

- Login: e-mail + senha (existente).
- Sessão: refresh token Supabase (1 ano).
- Recuperação: link via e-mail (existente).

---

## 3. Autorização

### 3.1 Modelo
**RBAC via matriz `cargo_modulo_permissao`** (padrão CBRio) + `AREA_MODULO_BOOST`.

### 3.2 Cargo + área boost

Adicionar ao `AREA_MODULO_BOOST` em `backend/middleware/auth.js`:

```js
AREA_MODULO_BOOST = {
  // ... existentes
  marketing: 'marketing',  // ← novo
};
```

Pedro Paiva tem `coordenador-marketing` + área `Marketing` → ganha nível 5 automático.
Allan/Aline/Cauã/Lorena Pariz/Letícia ganham `assistente-marketing` + área `Marketing`
→ nível 3 com escopo_proprio.

### 3.3 Matriz para `marketing` (seed)

| Cargo | Nível | Modificadores |
|---|---|---|
| `dev` (Marcos) | 5 | + exportar + aprovar |
| `coordenador-marketing` (Pedro) | 3 (5 via boost) | + exportar + aprovar |
| `assistente-marketing` | 3 (5 via boost) | escopo_proprio |
| `diretor-criativo` (Pedro Menezes) | 5 (boost) | + exportar + aprovar |
| `diretor-ministerial` (Arthur Serpa) | 1 | — |
| `diretor-administrativo` (Eduardo) | 1 | — |
| Outros cargos | 0 | — |

`pastor-senior` e `pastor-presidente`: nível 0 (não precisam ver Marketing diretamente
· acompanham via aba de Solicitações como qualquer outro funcionário se solicitarem).

### 3.4 ROUTE_MODULE_MAP

Adicionar em `backend/middleware/auth.js`:
```js
ROUTE_MODULE_MAP['marketing'] = ['marketing'];
ROUTE_MODULE_MAP['marketing-admin'] = ['marketing'];
```

`marketing-admin` exige nível 5 (Pedro · super-admins).

### 3.5 RLS contextual por tabela

#### `marketing_membros`
```sql
ALTER TABLE public.marketing_membros ENABLE ROW LEVEL SECURITY;

-- Leitura: equipe do marketing + diretoria + super-admin
CREATE POLICY marketing_membros_select ON public.marketing_membros
  FOR SELECT TO authenticated
  USING (
    public.current_user_module_level('marketing') >= 1
    OR public.is_super_admin()
  );

-- Write: só nível 5 (admin do módulo)
CREATE POLICY marketing_membros_insert ON public.marketing_membros
  FOR INSERT TO authenticated
  WITH CHECK (public.current_user_module_level('marketing') >= 5);

CREATE POLICY marketing_membros_update ON public.marketing_membros
  FOR UPDATE TO authenticated
  USING (public.current_user_module_level('marketing') >= 5)
  WITH CHECK (public.current_user_module_level('marketing') >= 5);

CREATE POLICY marketing_membros_delete ON public.marketing_membros
  FOR DELETE TO authenticated
  USING (public.is_super_admin());

CREATE POLICY marketing_membros_service ON public.marketing_membros
  FOR ALL TO service_role USING (true) WITH CHECK (true);
```

#### `marketing_kanban_cards`
```sql
ALTER TABLE public.marketing_kanban_cards ENABLE ROW LEVEL SECURITY;

-- SELECT: 
--   coordenador (≥5) vê tudo
--   produtor (≥3) vê tudo (read fila geral) MAS UI filtra por atribuido_a quando escopo_proprio
--   solicitante vê via solicitacoes (não direto)
CREATE POLICY marketing_cards_select ON public.marketing_kanban_cards
  FOR SELECT TO authenticated
  USING (public.current_user_module_level('marketing') >= 3);

-- INSERT: coord pode criar interna · service_role pra solicitação/evento
CREATE POLICY marketing_cards_insert ON public.marketing_kanban_cards
  FOR INSERT TO authenticated
  WITH CHECK (public.current_user_module_level('marketing') >= 5 AND origem = 'interna');

-- UPDATE: 
--   coord pode tudo
--   produtor pode mover estado dos próprios cards
CREATE POLICY marketing_cards_update ON public.marketing_kanban_cards
  FOR UPDATE TO authenticated
  USING (
    public.current_user_module_level('marketing') >= 5
    OR (
      public.current_user_module_level('marketing') >= 3
      AND atribuido_a IN (
        SELECT id FROM marketing_membros WHERE profile_id = auth.uid() AND ativo = true
      )
    )
  )
  WITH CHECK (
    public.current_user_module_level('marketing') >= 3
  );

CREATE POLICY marketing_cards_delete ON public.marketing_kanban_cards
  FOR DELETE TO authenticated
  USING (public.is_super_admin());

CREATE POLICY marketing_cards_service ON public.marketing_kanban_cards
  FOR ALL TO service_role USING (true) WITH CHECK (true);
```

#### `marketing_entregaveis`
```sql
ALTER TABLE public.marketing_entregaveis ENABLE ROW LEVEL SECURITY;

-- SELECT:
--   coord/equipe marketing vê tudo
--   solicitante vê só os do próprio card (via solicitacoes)
CREATE POLICY marketing_entregaveis_select ON public.marketing_entregaveis
  FOR SELECT TO authenticated
  USING (
    public.current_user_module_level('marketing') >= 3
    OR card_id IN (
      SELECT c.id FROM marketing_kanban_cards c
      JOIN solicitacoes s ON s.id = c.solicitacao_id
      WHERE s.solicitante_id = auth.uid()
    )
  );

-- INSERT: produtor do card OU coord
CREATE POLICY marketing_entregaveis_insert ON public.marketing_entregaveis
  FOR INSERT TO authenticated
  WITH CHECK (
    public.current_user_module_level('marketing') >= 3
    AND enviado_por = auth.uid()
  );

CREATE POLICY marketing_entregaveis_delete ON public.marketing_entregaveis
  FOR DELETE TO authenticated
  USING (public.is_super_admin());

CREATE POLICY marketing_entregaveis_service ON public.marketing_entregaveis
  FOR ALL TO service_role USING (true) WITH CHECK (true);
```

#### `marketing_compromissos_recorrentes` · `marketing_capacidade_override`
Padrão similar: SELECT nível ≥1 · WRITE nível ≥5 · DELETE super-admin · service_role
FOR ALL.

#### `marketing_etiquetas_tipo` · `marketing_etiquetas_destino`
SELECT pra todos `authenticated` (catálogo). WRITE só super-admin.

#### `setor_diretor`
SELECT pra todos `authenticated`. WRITE só super-admin.

### 3.6 Mudança no `solicitacoes` (spec 001)

```sql
-- Diretor de origem pode SELECT solicitações onde é o aprovador
-- (estende policy existente)
CREATE POLICY solicitacoes_diretor_origem ON public.solicitacoes
  FOR SELECT TO authenticated
  USING (
    aprovacao_origem_diretor_id = auth.uid()
    -- ... regras existentes preservadas via OR
  );

-- UPDATE da aprovação só pelo diretor designado
CREATE POLICY solicitacoes_diretor_origem_update ON public.solicitacoes
  FOR UPDATE TO authenticated
  USING (
    aprovacao_origem_diretor_id = auth.uid()
    AND aprovacao_origem_status = 'pendente'
  )
  WITH CHECK (
    aprovacao_origem_diretor_id = auth.uid()
    AND aprovacao_origem_status IN ('aprovada','rejeitada')
  );

-- INSERT: bloquear membro não-funcionário
-- (já tratado pelo trigger fn_solicitacoes_roteamento_aprovacao em 05 §3.1)
```

### 3.7 Testes de autorização (obrigatórios na spec 001)

- [ ] Membro sem `rh_funcionarios` ativo → POST `/api/solicitacoes` falha com 403.
- [ ] Funcionário do setor Ministerial → solicitação roteia pra Arthur Serpa.
- [ ] Eduardo (diretor) solicita → aprovação dispensada.
- [ ] Pr.Pedrão solicita → aprovação dispensada (`is_diretoria_geral`).
- [ ] Arthur tenta aprovar solicitação de outro setor → falha.
- [ ] Cauã (produtor) vê só cards atribuídos a ele no calendário.
- [ ] Pedro vê todos os cards no Kanban.
- [ ] Solicitante vê só entregáveis dos próprios cards.
- [ ] Solicitação rejeitada não pode ser reaberta (status imutável após `rejeitada`).

---

## 4. Secrets

### 4.1 Novos secrets
- **Microsoft Graph** (já existe pro Cérebro — reusar):
  - `AZURE_CLIENT_ID`
  - `AZURE_CLIENT_SECRET`
  - `AZURE_TENANT_ID`
- **Biblioteca SharePoint Marketing** (novo · path da biblioteca):
  - `SHAREPOINT_MARKETING_LIBRARY_ID` (configurar no Vercel + Railway).

### 4.2 Sem novos providers pagos. Tudo herda do CBRio.

---

## 5. Proteção da aplicação

### 5.1 Rate limiting
- POST `/api/solicitacoes` herda rate limit global (Vercel built-in).
- POST `/api/marketing/upload` (Graph passthrough) — rate limit dedicado mais
  restritivo (~5/min por usuário) pra evitar abuso de upload.

### 5.2 Validação de input
- Schema com `zod` em todas as rotas (padrão CBRio).
- Upload com verificação de mime type + tamanho máximo (50MB pra MVP).

### 5.3 SQL injection
- Supabase JS / parametrizado em todas as queries. Sem `raw SQL` com input direto.

### 5.4 CSRF / XSS
- Coberto pelo framework existente (cookies SameSite · React escape padrão).

---

## 6. Audit log

Triggers `audit_log_changes` (já existente em CLAUDE.md) em:

| Tabela | Colunas auditadas |
|---|---|
| `solicitacoes` (estende) | `aprovacao_origem_status`, `aprovacao_origem_diretor_id`, `urgencia_decisao`, `deleted_at` |
| `marketing_kanban_cards` | `estado`, `atribuido_a`, `prazo_confirmado`, `tem_revisao`, `raia_rapida`, `deleted_at` |

Retenção: 5 anos (padrão LGPD).

---

## 7. Plano de incidente (simples)

| Cenário | Ação |
|---|---|
| Vazamento de entregável SharePoint | Revogar share link · investigar acesso · ANPD se PII envolvido |
| Aprovação errada (rejeição indevida) | Solicitante cria nova (imutável · D-04) · diretor pode comunicar offline |
| Card "perdido" no Kanban | Audit log mostra histórico · super-admin restaura via `app_restore` |
| Upload Graph falhando | Retry exponencial · banner de degradação · suporte manual via SharePoint web |

---

## 8. Validação

- [x] LGPD-lite endereçada (lite porque interno)
- [x] Auth herdada (Supabase Auth)
- [x] Authorization model claro (cargo + boost + RLS)
- [x] RLS policies pensadas (6 tabelas + solicitações estendido)
- [x] Secrets management mapeado (reuso de Microsoft Graph)
- [x] Audit log desenhado
- [x] Plano de incidente simples
- [ ] Aprovado pra Fase 8

Marcos aprova esta versão em: ___ (data)
