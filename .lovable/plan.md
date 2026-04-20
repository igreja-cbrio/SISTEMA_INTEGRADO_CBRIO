

## Módulo Cuidados — implementação v1

Página nova em `/ministerial/cuidados` com dashboard, registros de atendimento, Jornada 180, convertidos pós-culto e sincronização automática com KPIs e Membresia.

### Princípios
- **Confidencialidade híbrida**: nomes apenas para Pessoas Acompanhadas, Jornada 180 e Convertidos. Aconselhamentos e Capelania = só contagens agregadas (campos numéricos).
- **Sincronização com Membresia por CPF**: ao registrar pessoa, se CPF já existe em `mem_membros`, vincula automaticamente (nada de duplicar). Caso contrário, oferece "Criar novo membro" no mesmo formulário.
- **Sincronização com KPIs**: cada registro alimenta as métricas mensais consumidas pela aba Cuidados em `/kpis` e pelo card no `/dashboard`.
- **Permissão**: nova chave `canCuidados` baseada em módulo "Cuidados" + admin/diretor.

### Schema (SQL para rodar no SQL Editor)

```sql
-- Módulo de permissão
INSERT INTO public.modulos (nome, ativo) VALUES ('Cuidados', true)
  ON CONFLICT DO NOTHING;

-- 1. Pessoas em acompanhamento ativo (com nome — vinculadas a mem_membros)
CREATE TABLE public.cui_acompanhamentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  membro_id uuid REFERENCES public.mem_membros(id) ON DELETE SET NULL,
  nome text NOT NULL,           -- snapshot p/ casos sem membro vinculado
  cpf text,                     -- usado p/ tentar match com mem_membros
  telefone text,
  responsavel_id uuid REFERENCES auth.users(id),
  motivo text,                  -- "luto", "casal", "espiritual", etc.
  status text NOT NULL DEFAULT 'ativo', -- ativo | concluido | pausado
  data_inicio date NOT NULL DEFAULT CURRENT_DATE,
  data_encerramento date,
  observacoes text,             -- restrito por RLS
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id)
);

-- 2. Atendimentos agregados (sem nomes) — capelania e aconselhamento
CREATE TABLE public.cui_atendimentos_agregado (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mes date NOT NULL,            -- sempre dia 1 do mês
  tipo text NOT NULL,           -- 'aconselhamento' | 'capelania'
  quantidade int NOT NULL DEFAULT 0,
  responsavel_id uuid REFERENCES auth.users(id),
  observacoes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (mes, tipo, responsavel_id)
);

-- 3. Jornada 180 — encontros (com nomes)
CREATE TABLE public.cui_jornada180 (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  membro_id uuid REFERENCES public.mem_membros(id) ON DELETE SET NULL,
  nome text NOT NULL,
  cpf text,
  etapa int NOT NULL DEFAULT 1,         -- 1..6 ou conforme trilha
  data_encontro date NOT NULL,
  presente boolean NOT NULL DEFAULT true,
  responsavel_id uuid REFERENCES auth.users(id),
  observacoes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 4. Convertidos pós-culto (semanal)
CREATE TABLE public.cui_convertidos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  culto_id uuid REFERENCES public.cultos(id) ON DELETE SET NULL,
  data_culto date NOT NULL,
  membro_id uuid REFERENCES public.mem_membros(id) ON DELETE SET NULL,
  nome text NOT NULL,
  cpf text,
  telefone text,
  atendido_apos_culto boolean NOT NULL DEFAULT false,
  cadastrado boolean NOT NULL DEFAULT false,
  responsavel_id uuid REFERENCES auth.users(id),
  observacoes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- View consolidada p/ KPIs (consumida pelo backend /api/kpis)
CREATE OR REPLACE VIEW public.vw_cuidados_mensal AS
SELECT
  date_trunc('month', CURRENT_DATE)::date AS mes,
  (SELECT count(*) FROM cui_acompanhamentos WHERE status='ativo') AS pessoas_acompanhadas,
  (SELECT coalesce(sum(quantidade),0) FROM cui_atendimentos_agregado
     WHERE tipo='aconselhamento' AND mes = date_trunc('month', CURRENT_DATE)) AS aconselhamentos,
  (SELECT coalesce(sum(quantidade),0) FROM cui_atendimentos_agregado
     WHERE tipo='capelania' AND mes = date_trunc('month', CURRENT_DATE)) AS capelania,
  (SELECT count(*) FROM cui_jornada180
     WHERE date_trunc('month', data_encontro) = date_trunc('month', CURRENT_DATE)) AS jornada180_encontros,
  (SELECT count(*) FROM cui_convertidos
     WHERE atendido_apos_culto = true
     AND date_trunc('month', data_culto) = date_trunc('month', CURRENT_DATE)) AS convertidos_atendidos,
  (SELECT count(*) FROM cui_convertidos
     WHERE cadastrado = true
     AND date_trunc('month', data_culto) = date_trunc('month', CURRENT_DATE)) AS convertidos_cadastrados;

-- RLS — só Cuidados + admin/diretor
ALTER TABLE cui_acompanhamentos       ENABLE ROW LEVEL SECURITY;
ALTER TABLE cui_atendimentos_agregado ENABLE ROW LEVEL SECURITY;
ALTER TABLE cui_jornada180            ENABLE ROW LEVEL SECURITY;
ALTER TABLE cui_convertidos           ENABLE ROW LEVEL SECURITY;
-- (políticas idênticas ao padrão dos outros módulos: authenticated read/write/update/delete = true; backend valida via canCuidados)
```

### Backend — `backend/routes/cuidados.js` (novo)

Rotas (todas `authenticate` + checagem de `canCuidados`/admin/diretor):

```
GET  /api/cuidados/dashboard            → KPIs do mês (consome vw_cuidados_mensal + comparativo mês anterior)
GET  /api/cuidados/acompanhamentos      → list (filtros status, responsavel, search)
POST /api/cuidados/acompanhamentos      → cria (com lookup CPF em mem_membros)
PATCH /api/cuidados/acompanhamentos/:id → edita / encerra
GET  /api/cuidados/jornada180           → list por etapa/mês
POST /api/cuidados/jornada180           → registra encontro
GET  /api/cuidados/convertidos          → list por culto/semana
POST /api/cuidados/convertidos          → registra (com lookup CPF)
GET  /api/cuidados/agregado?mes=YYYY-MM → totais aconselhamento/capelania do mês
POST /api/cuidados/agregado             → upsert do total mensal por tipo
GET  /api/cuidados/buscar-membro?cpf=   → helper p/ frontend (retorna mem_membros se existir)
POST /api/cuidados/criar-membro         → cria em mem_membros + retorna id (usado quando CPF não existe)
```

Lógica de **sincronização Membresia**: ao gravar acompanhamento/jornada/convertido com `cpf`, primeiro `SELECT id FROM mem_membros WHERE cpf = $1`. Se existir → grava `membro_id`. Se não existir e usuário marcou "criar membro" → INSERT em `mem_membros` (status = 'visitante') e usa o id retornado.

Lógica de **KPIs**: ampliar `backend/routes/kpis.js` (endpoint que retorna dados da aba Cuidados) para ler de `vw_cuidados_mensal`. Hoje os cards estão zerados (`value={null}`); passa a vir do backend.

### Frontend

**Nova página** `src/pages/ministerial/Cuidados.jsx` com 4 tabs:
1. **Dashboard** — 4 KPIs do mês + comparativo + gráfico de evolução (últimos 6 meses).
2. **Acompanhamentos** — tabela CRUD (nome, motivo, responsável, data início, status), modal de cadastro com busca de CPF em tempo real.
3. **Jornada 180** — lista de pessoas + frequência por etapa, botão "Registrar encontro".
4. **Convertidos** — agrupado por data de culto, registro por linha (atendido / cadastrado), select de culto vem de `cultos`.
5. **Aconselhamento/Capelania (agregado)** — formulário simples mensal: "quantos atendimentos em abril?" por tipo.

**Componente de busca de CPF** reutilizável: input com máscara CPF → `GET /cuidados/buscar-membro?cpf=` → mostra "✓ Vinculado a João Silva" ou botão "+ Criar novo membro".

**Integrações**:
- `src/api.js` — novo namespace `cuidados`.
- `src/App.tsx` — rota `/ministerial/cuidados` com `ModuleGuard permKey="canCuidados"`.
- `src/contexts/AuthContext.jsx` — adicionar `canCuidados = canAccessModule(['Cuidados'])`.
- `src/pages/Dashboard.jsx` — habilitar card "Cuidados" (já existe a estrutura) usando `canCuidados`.
- `src/pages/kpis/KPIs.tsx` — `TabCuidados` consome dados reais (substitui `value={null}`); cards Cuidados na home dos KPIs também viram clicáveis com valor real.
- `src/components/layout/AppShell.jsx` e `modern-side-bar.tsx` — adicionar `perm: 'canCuidados'` no item Cuidados.

### Notificações
Registrar módulo `cuidados` em `src/pages/admin/NotificacaoRegras.jsx` (array `MODULOS`). Disparos:
- Imediato: novo acompanhamento criado → notifica coord.
- Periódico (em `notificacaoGenerator.js`): pessoa em acompanhamento >60 dias sem atualização → alerta.

### Arquivos tocados
- **Migration manual**: `supabase/migrations_manual/20260420_cuidados_modulo.sql` (você roda)
- **Backend**: `backend/routes/cuidados.js` (novo), `backend/server.js` (mount), `backend/routes/kpis.js` (leitura da view), `backend/services/notificacaoGenerator.js` (alerta 60d)
- **Frontend**: `src/pages/ministerial/Cuidados.jsx` (novo), `src/api.js`, `src/App.tsx`, `src/contexts/AuthContext.jsx`, `src/pages/Dashboard.jsx`, `src/pages/kpis/KPIs.tsx`, `src/components/layout/AppShell.jsx`, `src/components/ui/modern-side-bar.tsx`, `src/components/ui/command-search.tsx`, `src/pages/admin/NotificacaoRegras.jsx`

### Entrega
PR `claude/modulo-cuidados-v1`. Após merge:
1. Rodar SQL no Supabase.
2. Em Permissões, dar acesso ao módulo "Cuidados" para Wesley + admins.
3. Acessar `/ministerial/cuidados` → registrar primeiros dados → ver refletido em `/kpis` aba Cuidados e no `/dashboard`.

