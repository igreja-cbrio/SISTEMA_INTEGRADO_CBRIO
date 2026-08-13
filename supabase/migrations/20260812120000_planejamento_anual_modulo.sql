-- =====================================================================
-- Módulo Planejamento Anual (slug planejamento-anual) · 2026-08-12
-- =====================================================================
-- Ciclo anual: propostas (líder de área) → avaliação CEGA por 4 diretorias
-- (7 critérios 1-5 · quórum = nº de assentos do ciclo) → decisão do Pastor
-- (aprovar / ressalvas / reprovar + 1 rodada de retificação de 5 dias) →
-- calendário com conflitos → publicação (5 travas + snapshot imutável) →
-- orçamento do ciclo (5 linhas × 12 meses · caixa livre SEMPRE derivado).
--
-- Decisões de arquitetura (conselho deliberativo 2026-08-12):
--   · `estado` é a ÚNICA coluna gravável de status da proposta; estados
--     "em_avaliacao"/"ranqueada"/"no_calendario" são DERIVADOS (nunca
--     persistidos). Decisões do Pastor em tabela append-only por rodada.
--   · Snapshot tipado, escrito SÓ pela fn_plan_publicar_ciclo (SECURITY
--     DEFINER · re-verifica as 5 travas DENTRO da transação · anti-TOCTOU)
--     + trigger físico de imutabilidade (padrão closing mensal).
--   · Notas cegas até o quórum: RLS deny-by-default (avaliador só vê a
--     própria linha) · agregação/projeção por papel fica no backend.
--   · NÃO reusa planejamento_ciclos (dormente da PR-A · shape/inglês) nem
--     setor_diretor (semântica de Solicitações) nem pat_localizacoes direto
--     (hard-delete no patrimonio.js + auto-insert do totemKids) — locais em
--     tabela própria com ponte opcional (precedente kids_salas).
--
-- Migration ADITIVA · idempotente. Segue as regras de segurança do projeto
-- (RLS contextual, soft-delete na whitelist, sem USING(true) em dado sensível).
-- Pós-aplicação: POST /api/permissoes/cache/bust + relogin dos afetados.
-- =====================================================================

-- ── 1 · Catálogo das 4 diretorias avaliadoras ───────────────────────────
CREATE TABLE IF NOT EXISTS public.plan_diretorias (
  chave       text PRIMARY KEY CHECK (chave IN ('ministerial','operacoes','financeiro','criativo')),
  nome        text NOT NULL,
  ordem       smallint NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.plan_diretorias (chave, nome, ordem) VALUES
  ('ministerial', 'Ministerial', 1),
  ('operacoes',   'Operações',   2),
  ('financeiro',  'Financeiro',  3),
  ('criativo',    'Criativo',    4)
ON CONFLICT (chave) DO NOTHING;

-- ── 2 · De-para área operacional → diretoria ────────────────────────────
-- Mesmo formato da planejamento_areas_setor da PR-A (validado com as 16
-- áreas), mas mapeando pras 4 diretorias PRÓPRIAS do módulo.
CREATE TABLE IF NOT EXISTS public.plan_areas_diretoria (
  area        text PRIMARY KEY,
  diretoria   text NOT NULL REFERENCES public.plan_diretorias(chave),
  ativo       boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.plan_areas_diretoria (area, diretoria) VALUES
  ('marketing',    'criativo'),
  ('producao',     'criativo'),
  ('adoracao',     'criativo'),
  ('cozinha',      'operacoes'),
  ('limpeza',      'operacoes'),
  ('manutencao',   'operacoes'),
  ('compras',      'operacoes'),
  ('logistica',    'operacoes'),
  ('adm',          'operacoes'),
  ('rh',           'operacoes'),
  ('financeiro',   'financeiro'),
  ('ministerial',  'ministerial'),
  ('integracao',   'ministerial'),
  ('cuidados',     'ministerial'),
  ('voluntariado', 'ministerial'),
  ('kids',         'ministerial')
ON CONFLICT (area) DO NOTHING;

-- ── 3 · Locais (lista controlada · ponte opcional pro Patrimônio) ───────
CREATE TABLE IF NOT EXISTS public.plan_locais (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome                text NOT NULL UNIQUE,
  gera_conflito       boolean NOT NULL DEFAULT true,  -- false = fora do espaço físico da igreja
  pat_localizacao_id  uuid REFERENCES public.pat_localizacoes(id) ON DELETE SET NULL,
  ativo               boolean NOT NULL DEFAULT true,
  ordem               smallint NOT NULL DEFAULT 0,
  created_at          timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.plan_locais (nome, gera_conflito, ordem) VALUES
  ('Templo',          true,  1),
  ('Salão social',    true,  2),
  ('Sala 1',          true,  3),
  ('Sala 2',          true,  4),
  ('Área externa',    true,  5),
  ('Fora da igreja',  false, 6)
ON CONFLICT (nome) DO NOTHING;

-- ── 4 · Ciclo de planejamento ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.plan_ciclos (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ano                int NOT NULL UNIQUE CHECK (ano BETWEEN 2026 AND 2100),
  submissao_aberta   boolean NOT NULL DEFAULT false,
  avaliacao_aberta   boolean NOT NULL DEFAULT false,
  publicado_em       timestamptz,
  publicado_por      uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  publicacao_versao  int NOT NULL DEFAULT 0,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.plan_ciclos (ano)
SELECT 2027
WHERE NOT EXISTS (SELECT 1 FROM public.plan_ciclos WHERE ano = 2027);

-- ── 5 · Assentos de avaliação POR CICLO (não cargo · não setor_diretor) ─
-- Quórum = COUNT dos assentos do ciclo (nunca literal 4). Troca de titular
-- no meio do ciclo = UPDATE do assento, sem reescrever ciclos passados.
CREATE TABLE IF NOT EXISTS public.plan_ciclo_avaliadores (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ciclo_id    uuid NOT NULL REFERENCES public.plan_ciclos(id) ON DELETE CASCADE,
  diretoria   text NOT NULL REFERENCES public.plan_diretorias(chave),
  profile_id  uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (ciclo_id, diretoria)
);

-- Seed dos assentos do ciclo 2027 (de-para aprovado pelo Yago 2026-08-12):
--   Ministerial → Arthur Serpa (setor_diretor 'Ministerial')
--   Criativo    → Pedro Menezes (setor_diretor 'Criativo')
--   Operações   → Eduardo Gnisci (setor_diretor 'Gestao' · "Operações fica
--                 dentro de Gestão" — decisão do Marcos, PR-A 2026-05-18)
--   Financeiro  → Pedro Junior / Pr. Juninho (acumula TEMPORARIAMENTE a
--                 diretoria financeira · info do Yago 2026-08-12 · quando
--                 houver titular próprio, é UPDATE do assento, sem migration)
DO $$
DECLARE
  v_ciclo uuid;
  v_min uuid; v_cri uuid; v_ope uuid; v_fin uuid;
BEGIN
  SELECT id INTO v_ciclo FROM public.plan_ciclos WHERE ano = 2027;
  IF v_ciclo IS NULL THEN RETURN; END IF;

  SELECT diretor_id INTO v_min FROM public.setor_diretor WHERE setor = 'Ministerial';
  SELECT diretor_id INTO v_cri FROM public.setor_diretor WHERE setor = 'Criativo';
  SELECT diretor_id INTO v_ope FROM public.setor_diretor WHERE setor = 'Gestao';
  SELECT id INTO v_fin FROM public.profiles WHERE lower(email) = 'juninho.lit@cbrio.org' LIMIT 1;

  IF v_min IS NOT NULL THEN
    INSERT INTO public.plan_ciclo_avaliadores (ciclo_id, diretoria, profile_id)
    VALUES (v_ciclo, 'ministerial', v_min) ON CONFLICT (ciclo_id, diretoria) DO NOTHING;
  END IF;
  IF v_cri IS NOT NULL THEN
    INSERT INTO public.plan_ciclo_avaliadores (ciclo_id, diretoria, profile_id)
    VALUES (v_ciclo, 'criativo', v_cri) ON CONFLICT (ciclo_id, diretoria) DO NOTHING;
  END IF;
  IF v_ope IS NOT NULL THEN
    INSERT INTO public.plan_ciclo_avaliadores (ciclo_id, diretoria, profile_id)
    VALUES (v_ciclo, 'operacoes', v_ope) ON CONFLICT (ciclo_id, diretoria) DO NOTHING;
  END IF;
  IF v_fin IS NOT NULL THEN
    INSERT INTO public.plan_ciclo_avaliadores (ciclo_id, diretoria, profile_id)
    VALUES (v_ciclo, 'financeiro', v_fin) ON CONFLICT (ciclo_id, diretoria) DO NOTHING;
  END IF;
END $$;

-- ── 6 · Propostas ────────────────────────────────────────────────────────
-- `estado` = fonte ÚNICA gravável (CHECK só com estados-FATO); derivados
-- (em_avaliacao/ranqueada/no_calendario) ficam no service, nunca aqui.
-- Datas REAIS (date) resolvidas contra o ano do ciclo + precisão declarada
-- ('mes' = só o mês foi informado · dia=1 por convenção) — elimina por
-- construção a classe de bug de virada de ano do protótipo.
CREATE TABLE IF NOT EXISTS public.plan_propostas (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ciclo_id              uuid NOT NULL REFERENCES public.plan_ciclos(id) ON DELETE RESTRICT,
  nome                  text NOT NULL,
  natureza              text NOT NULL CHECK (natureza IN ('evento','projeto','rotina')),
  area                  text NOT NULL REFERENCES public.plan_areas_diretoria(area),
  lider_id              uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  preenchido_por_id     uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  -- Seção 1 · apresentação
  data_inicio           date NOT NULL,
  precisao_inicio       text NOT NULL DEFAULT 'mes' CHECK (precisao_inicio IN ('mes','dia')),
  multi_dia             boolean NOT NULL DEFAULT false,
  data_fim              date,
  precisao_fim          text CHECK (precisao_fim IN ('mes','dia')),
  recorrencia           text NOT NULL DEFAULT 'unica'
                        CHECK (recorrencia IN ('unica','diaria','semanal','mensal','trimestral','semestral','personalizada')),
  dia_semana            smallint CHECK (dia_semana BETWEEN 0 AND 6),  -- 0=domingo · NULL = sem dia fixo
  hora_inicio           time,
  hora_fim              time,
  local_id              uuid NOT NULL REFERENCES public.plan_locais(id) ON DELETE RESTRICT,
  publico_alvo          text,
  descricao             text,          -- detalhamento · NÃO recebe nota
  -- Seção 2 · informações para avaliação
  alcance_pct           smallint CHECK (alcance_pct BETWEEN 0 AND 100),
  publico_considerado   text NOT NULL DEFAULT 'igreja_inteira'
                        CHECK (publico_considerado IN ('igreja_inteira','recorte_geracional')),
  pertencimento         text,
  valores               jsonb NOT NULL DEFAULT '[]'::jsonb,  -- [{nome, justificativa}] · justificativa obrigatória por valor marcado (validação no backend)
  visao_explique        text,
  impacto               text,
  custo                 numeric(14,2) NOT NULL DEFAULT 0 CHECK (custo >= 0),
  tem_arrecadacao       boolean NOT NULL DEFAULT false,
  arrecadacao_prevista  numeric(14,2) NOT NULL DEFAULT 0 CHECK (arrecadacao_prevista >= 0),
  -- Máquina de estados (fatos apenas · derivados vivem no service)
  estado                text NOT NULL DEFAULT 'rascunho'
                        CHECK (estado IN ('rascunho','enviada','aprovada','aprovada_ressalvas','reprovada','retificada','arquivada')),
  enviada_em            timestamptz,
  -- Retificação (1 rodada · constraint física)
  versao                smallint NOT NULL DEFAULT 1 CHECK (versao BETWEEN 1 AND 2),
  versao_anterior       jsonb,         -- snapshot dos 8 campos comparáveis (diff da tela do Pastor)
  retificada_em         timestamptz,
  retificacao_prazo     date,          -- calculado em SQL: (now() AT TIME ZONE 'America/Sao_Paulo')::date + 5
  created_by            uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  deleted_at            timestamptz,
  CHECK (data_fim IS NULL OR data_fim >= data_inicio),
  CHECK (multi_dia = true OR data_fim IS NULL)
);

CREATE INDEX IF NOT EXISTS idx_plan_propostas_ciclo  ON public.plan_propostas (ciclo_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_plan_propostas_estado ON public.plan_propostas (estado)   WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_plan_propostas_lider  ON public.plan_propostas (lider_id) WHERE deleted_at IS NULL;

-- ── 7 · Avaliações (notas cegas até o quórum) ───────────────────────────
-- 7 colunas nomeadas (critérios são lei fixa do spec · CHECK por critério ·
-- desempate em cascata agregável). 1 linha por (proposta, diretoria).
CREATE TABLE IF NOT EXISTS public.plan_avaliacoes (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposta_id           uuid NOT NULL REFERENCES public.plan_propostas(id) ON DELETE CASCADE,
  diretoria             text NOT NULL REFERENCES public.plan_diretorias(chave),
  avaliador_id          uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  nota_relevancia       smallint NOT NULL CHECK (nota_relevancia       BETWEEN 1 AND 5),
  nota_pertencimento    smallint NOT NULL CHECK (nota_pertencimento    BETWEEN 1 AND 5),
  nota_transformacao    smallint NOT NULL CHECK (nota_transformacao    BETWEEN 1 AND 5),
  nota_visao            smallint NOT NULL CHECK (nota_visao            BETWEEN 1 AND 5),
  nota_impacto          smallint NOT NULL CHECK (nota_impacto          BETWEEN 1 AND 5),
  nota_custo            smallint NOT NULL CHECK (nota_custo            BETWEEN 1 AND 5),
  nota_sustentabilidade smallint NOT NULL CHECK (nota_sustentabilidade BETWEEN 1 AND 5),
  coment_criterios      jsonb NOT NULL DEFAULT '{}'::jsonb,  -- {criterio: texto} · fundamentação opcional · NUNCA vai ao proponente
  comentario_geral      text,
  enviado_em            timestamptz NOT NULL DEFAULT now(),
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  deleted_at            timestamptz  -- "reabrir para os diretores" soft-deleta as avaliações (rastro preservado)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_plan_avaliacoes_proposta_diretoria
  ON public.plan_avaliacoes (proposta_id, diretoria) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_plan_avaliacoes_proposta ON public.plan_avaliacoes (proposta_id) WHERE deleted_at IS NULL;

-- ── 8 · Decisões do Pastor (append-only por rodada) ─────────────────────
-- rodada 1 = decisão original · rodada 2 = pós-retificação (CHECK físico da
-- regra "1 rodada"). Vigente = maior rodada não-revogada. "Retirar do
-- calendário" revoga a decisão (carimbo · nada é apagado). Trigger de
-- imutabilidade permite UPDATE só nos campos de verificação/revogação.
CREATE TABLE IF NOT EXISTS public.plan_decisoes (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposta_id             uuid NOT NULL REFERENCES public.plan_propostas(id) ON DELETE CASCADE,
  rodada                  smallint NOT NULL CHECK (rodada IN (1,2)),
  decisao                 text NOT NULL CHECK (decisao IN ('aprovada','aprovada_ressalvas','reprovada','arquivada','reaberta_diretores')),
  -- Aprovada com ressalvas
  ressalva_texto          text,
  ressalva_responsavel_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ressalva_prazo          date,
  ressalva_cumprida_em    timestamptz,
  ressalva_verificada_por uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  -- Reprovada (devolve ao proponente · 1 rodada de 5 dias)
  exigencia_texto         text,
  exigencia_prazo         date,
  -- Revogação (retirar do calendário · reversível e auditada)
  revogada_em             timestamptz,
  revogada_por            uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  decidido_por            uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  decidido_em             timestamptz NOT NULL DEFAULT now(),
  created_at              timestamptz NOT NULL DEFAULT now(),
  CHECK (decisao <> 'aprovada_ressalvas' OR ressalva_texto IS NOT NULL),
  CHECK (decisao <> 'reprovada' OR exigencia_texto IS NOT NULL)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_plan_decisoes_proposta_rodada
  ON public.plan_decisoes (proposta_id, rodada) WHERE revogada_em IS NULL;
CREATE INDEX IF NOT EXISTS idx_plan_decisoes_proposta ON public.plan_decisoes (proposta_id);

CREATE OR REPLACE FUNCTION public.tg_plan_decisoes_imutavel()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'plan_decisoes é append-only · decisão não pode ser apagada (use revogada_em)';
  END IF;
  IF NEW.proposta_id  IS DISTINCT FROM OLD.proposta_id
    OR NEW.rodada     IS DISTINCT FROM OLD.rodada
    OR NEW.decisao    IS DISTINCT FROM OLD.decisao
    OR NEW.ressalva_texto          IS DISTINCT FROM OLD.ressalva_texto
    OR NEW.ressalva_responsavel_id IS DISTINCT FROM OLD.ressalva_responsavel_id
    OR NEW.ressalva_prazo          IS DISTINCT FROM OLD.ressalva_prazo
    OR NEW.exigencia_texto         IS DISTINCT FROM OLD.exigencia_texto
    OR NEW.exigencia_prazo         IS DISTINCT FROM OLD.exigencia_prazo
    OR NEW.decidido_por            IS DISTINCT FROM OLD.decidido_por
    OR NEW.decidido_em             IS DISTINCT FROM OLD.decidido_em
  THEN
    RAISE EXCEPTION 'plan_decisoes é imutável · só verificação de ressalva e revogação podem mudar';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_plan_decisoes_imutavel ON public.plan_decisoes;
CREATE TRIGGER trg_plan_decisoes_imutavel
BEFORE UPDATE OR DELETE ON public.plan_decisoes
FOR EACH ROW EXECUTE FUNCTION public.tg_plan_decisoes_imutavel();

-- ── 9 · Apontamentos do Pastor (campo a campo · só ao proponente) ───────
CREATE TABLE IF NOT EXISTS public.plan_apontamentos (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposta_id  uuid NOT NULL REFERENCES public.plan_propostas(id) ON DELETE CASCADE,
  campo        text NOT NULL CHECK (campo IN (
                 'nome','natureza','area','lider','quando','local','publico','descricao',
                 'alcance','pertencimento','transformacao','visao','impacto','custo','arrecadacao')),
  texto        text NOT NULL,
  criado_por   uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  created_at   timestamptz NOT NULL DEFAULT now(),
  deleted_at   timestamptz  -- remoção pelo Pastor = soft-delete (rastro)
);

CREATE INDEX IF NOT EXISTS idx_plan_apontamentos_proposta
  ON public.plan_apontamentos (proposta_id) WHERE deleted_at IS NULL;

-- ── 10 · Conflitos ACEITOS (conflitos em si NUNCA são persistidos) ──────
-- Detecção é função pura recomputada sob demanda (cache persistido apodrece
-- e a trava 5 mentiria). CHECK (a < b) mata o bug de dedup do protótipo.
CREATE TABLE IF NOT EXISTS public.plan_conflitos_aceitos (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ciclo_id      uuid NOT NULL REFERENCES public.plan_ciclos(id) ON DELETE CASCADE,
  proposta_a    uuid NOT NULL REFERENCES public.plan_propostas(id) ON DELETE CASCADE,
  proposta_b    uuid NOT NULL REFERENCES public.plan_propostas(id) ON DELETE CASCADE,
  tipo          text NOT NULL CHECK (tipo IN ('agenda','espaco')),
  justificativa text NOT NULL CHECK (length(trim(justificativa)) >= 5),
  aceito_por    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  aceito_em     timestamptz NOT NULL DEFAULT now(),
  CHECK (proposta_a < proposta_b),
  UNIQUE (ciclo_id, proposta_a, proposta_b, tipo)
);

-- ── 11 · Orçamento do ciclo (normalizado · caixa livre NUNCA persistido) ─
CREATE TABLE IF NOT EXISTS public.plan_orcamentos (
  ciclo_id    uuid PRIMARY KEY REFERENCES public.plan_ciclos(id) ON DELETE CASCADE,
  obs         text,
  premissas   jsonb NOT NULL DEFAULT '[]'::jsonb,  -- [{titulo, texto}] · informações-chave
  enviado_em  timestamptz,
  enviado_por uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.plan_orcamento_valores (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ciclo_id   uuid NOT NULL REFERENCES public.plan_ciclos(id) ON DELETE CASCADE,
  linha      text NOT NULL CHECK (linha IN ('dizimos_ofertas','outras_receitas','folha','despesas_operacionais','provisoes')),
  mes        smallint NOT NULL CHECK (mes BETWEEN 1 AND 12),
  valor      numeric(14,2) NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (ciclo_id, linha, mes)
);

CREATE INDEX IF NOT EXISTS idx_plan_orc_valores_ciclo ON public.plan_orcamento_valores (ciclo_id);

-- ── 12 · Calendário definitivo (snapshot tipado · imutável por trigger) ─
-- SEM dados de mérito (notas/fundamentação/devolutivas ficam fora).
-- Escrita SÓ pela fn_plan_publicar_ciclo. Republicar = nova publicacao_versao
-- (as versões anteriores ficam · a vigente é a do plan_ciclos.publicacao_versao).
CREATE TABLE IF NOT EXISTS public.plan_calendario_itens (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ciclo_id             uuid NOT NULL REFERENCES public.plan_ciclos(id) ON DELETE RESTRICT,
  publicacao_versao    int NOT NULL,
  proposta_id          uuid NOT NULL REFERENCES public.plan_propostas(id) ON DELETE RESTRICT,
  nome                 text NOT NULL,
  natureza             text NOT NULL,
  area                 text NOT NULL,
  diretoria            text,
  data_inicio          date NOT NULL,
  precisao_inicio      text NOT NULL,
  multi_dia            boolean NOT NULL,
  data_fim             date,
  precisao_fim         text,
  recorrencia          text NOT NULL,
  dia_semana           smallint,
  hora_inicio          time,
  hora_fim             time,
  local_nome           text NOT NULL,   -- snapshot do NOME (rename/delete do local não corrompe o histórico)
  custo                numeric(14,2) NOT NULL,
  tem_arrecadacao      boolean NOT NULL,
  arrecadacao_prevista numeric(14,2) NOT NULL,
  decisao              text NOT NULL,
  publicado_em         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (ciclo_id, publicacao_versao, proposta_id)
);

CREATE INDEX IF NOT EXISTS idx_plan_cal_itens_ciclo_versao
  ON public.plan_calendario_itens (ciclo_id, publicacao_versao);

CREATE OR REPLACE FUNCTION public.tg_plan_calendario_imutavel()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'Calendário publicado é imutável · republique o ciclo pra gerar uma nova versão';
END;
$$;

DROP TRIGGER IF EXISTS trg_plan_calendario_imutavel ON public.plan_calendario_itens;
CREATE TRIGGER trg_plan_calendario_imutavel
BEFORE UPDATE OR DELETE ON public.plan_calendario_itens
FOR EACH ROW EXECUTE FUNCTION public.tg_plan_calendario_imutavel();

-- ── 13 · updated_at ──────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_plan_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_plan_ciclos_updated ON public.plan_ciclos;
CREATE TRIGGER trg_plan_ciclos_updated BEFORE UPDATE ON public.plan_ciclos
FOR EACH ROW EXECUTE FUNCTION public.fn_plan_set_updated_at();

DROP TRIGGER IF EXISTS trg_plan_ciclo_avaliadores_updated ON public.plan_ciclo_avaliadores;
CREATE TRIGGER trg_plan_ciclo_avaliadores_updated BEFORE UPDATE ON public.plan_ciclo_avaliadores
FOR EACH ROW EXECUTE FUNCTION public.fn_plan_set_updated_at();

DROP TRIGGER IF EXISTS trg_plan_propostas_updated ON public.plan_propostas;
CREATE TRIGGER trg_plan_propostas_updated BEFORE UPDATE ON public.plan_propostas
FOR EACH ROW EXECUTE FUNCTION public.fn_plan_set_updated_at();

DROP TRIGGER IF EXISTS trg_plan_avaliacoes_updated ON public.plan_avaliacoes;
CREATE TRIGGER trg_plan_avaliacoes_updated BEFORE UPDATE ON public.plan_avaliacoes
FOR EACH ROW EXECUTE FUNCTION public.fn_plan_set_updated_at();

DROP TRIGGER IF EXISTS trg_plan_orcamentos_updated ON public.plan_orcamentos;
CREATE TRIGGER trg_plan_orcamentos_updated BEFORE UPDATE ON public.plan_orcamentos
FOR EACH ROW EXECUTE FUNCTION public.fn_plan_set_updated_at();

DROP TRIGGER IF EXISTS trg_plan_orc_valores_updated ON public.plan_orcamento_valores;
CREATE TRIGGER trg_plan_orc_valores_updated BEFORE UPDATE ON public.plan_orcamento_valores
FOR EACH ROW EXECUTE FUNCTION public.fn_plan_set_updated_at();

-- ── 14 · Publicação (RPC transacional · re-verifica as 5 travas) ────────
-- Anti-TOCTOU: as travas são re-verificadas AQUI, dentro da transação, com
-- lock no ciclo — checar em JS e publicar depois deixaria uma retificação
-- chegando no meio publicar ciclo inválido. O service JS espelha esta lógica
-- pra UI de preview (mesma regra · o teste de aceitação compara os dois).
CREATE OR REPLACE FUNCTION public.fn_plan_publicar_ciclo(p_ciclo_id uuid, p_publicado_por uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_quorum int;
  v_sem_quorum int; v_sem_decisao int; v_retif int; v_ressalva int; v_conflitos int;
  v_versao int;
  v_itens int;
BEGIN
  -- lock do ciclo (serializa publicações concorrentes)
  PERFORM 1 FROM plan_ciclos WHERE id = p_ciclo_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Ciclo não encontrado'; END IF;

  SELECT COUNT(*) INTO v_quorum FROM plan_ciclo_avaliadores WHERE ciclo_id = p_ciclo_id;
  IF v_quorum = 0 THEN RAISE EXCEPTION 'Ciclo sem avaliadores configurados'; END IF;

  -- Trava 1 · proposta sem quórum de avaliação
  SELECT COUNT(*) INTO v_sem_quorum
  FROM plan_propostas p
  WHERE p.ciclo_id = p_ciclo_id AND p.deleted_at IS NULL AND p.estado = 'enviada'
    AND (SELECT COUNT(*) FROM plan_avaliacoes a
          WHERE a.proposta_id = p.id AND a.deleted_at IS NULL) < v_quorum;

  -- Trava 2 · proposta sem decisão (quórum completo · aguardando o Pastor)
  SELECT COUNT(*) INTO v_sem_decisao
  FROM plan_propostas p
  WHERE p.ciclo_id = p_ciclo_id AND p.deleted_at IS NULL AND p.estado = 'enviada'
    AND (SELECT COUNT(*) FROM plan_avaliacoes a
          WHERE a.proposta_id = p.id AND a.deleted_at IS NULL) >= v_quorum;

  -- Trava 3 · retificação em andamento
  SELECT COUNT(*) INTO v_retif
  FROM plan_propostas p
  WHERE p.ciclo_id = p_ciclo_id AND p.deleted_at IS NULL
    AND p.estado IN ('reprovada','retificada');

  -- Trava 4 · ressalva não verificada
  SELECT COUNT(*) INTO v_ressalva
  FROM plan_propostas p
  WHERE p.ciclo_id = p_ciclo_id AND p.deleted_at IS NULL
    AND p.estado = 'aprovada_ressalvas'
    AND NOT EXISTS (
      SELECT 1 FROM plan_decisoes d
      WHERE d.proposta_id = p.id AND d.revogada_em IS NULL
        AND d.decisao = 'aprovada_ressalvas' AND d.ressalva_cumprida_em IS NOT NULL
        AND d.rodada = (SELECT MAX(d2.rodada) FROM plan_decisoes d2
                        WHERE d2.proposta_id = p.id AND d2.revogada_em IS NULL));

  -- Trava 5 · conflito CONFIRMADO (firme) e não aceito, entre itens do calendário.
  -- Rede de segurança transacional · a referência de negócio é o service JS
  -- (planejamentoAnualRegras.js) e o teste de aceitação compara os dois.
  WITH no_cal AS (
    SELECT p.*, l.gera_conflito, l.nome AS local_nome_calc
    FROM plan_propostas p
    JOIN plan_locais l ON l.id = p.local_id
    WHERE p.ciclo_id = p_ciclo_id AND p.deleted_at IS NULL
      AND (p.estado = 'aprovada'
        OR (p.estado = 'aprovada_ressalvas' AND EXISTS (
              SELECT 1 FROM plan_decisoes d
              WHERE d.proposta_id = p.id AND d.revogada_em IS NULL
                AND d.decisao = 'aprovada_ressalvas' AND d.ressalva_cumprida_em IS NOT NULL
                AND d.rodada = (SELECT MAX(d2.rodada) FROM plan_decisoes d2
                                WHERE d2.proposta_id = p.id AND d2.revogada_em IS NULL))))
  ), pares AS (
    SELECT a.id AS ia, b.id AS ib, conf.tipo
    FROM no_cal a
    JOIN no_cal b ON a.id < b.id
    CROSS JOIN LATERAL (
      SELECT 'espaco'::text AS tipo
      WHERE a.local_id = b.local_id AND a.gera_conflito
        AND a.hora_inicio IS NOT NULL AND a.hora_fim IS NOT NULL
        AND b.hora_inicio IS NOT NULL AND b.hora_fim IS NOT NULL
        AND a.hora_inicio < b.hora_fim AND b.hora_inicio < a.hora_fim
        AND CASE
          WHEN a.natureza = 'rotina' AND b.natureza = 'rotina' THEN
            a.dia_semana IS NOT NULL AND a.dia_semana = b.dia_semana
            AND EXTRACT(MONTH FROM a.data_inicio) <= EXTRACT(MONTH FROM COALESCE(CASE WHEN b.multi_dia THEN b.data_fim END, b.data_inicio))
            AND EXTRACT(MONTH FROM b.data_inicio) <= EXTRACT(MONTH FROM COALESCE(CASE WHEN a.multi_dia THEN a.data_fim END, a.data_inicio))
          ELSE
            a.precisao_inicio = 'dia' AND b.precisao_inicio = 'dia' AND a.data_inicio = b.data_inicio
        END
      UNION ALL
      SELECT 'agenda'::text
      WHERE a.natureza = b.natureza
        AND CASE
          WHEN a.natureza = 'rotina' THEN
            a.dia_semana IS NOT NULL AND a.dia_semana = b.dia_semana
            AND EXTRACT(MONTH FROM a.data_inicio) <= EXTRACT(MONTH FROM COALESCE(CASE WHEN b.multi_dia THEN b.data_fim END, b.data_inicio))
            AND EXTRACT(MONTH FROM b.data_inicio) <= EXTRACT(MONTH FROM COALESCE(CASE WHEN a.multi_dia THEN a.data_fim END, a.data_inicio))
          ELSE
            a.precisao_inicio = 'dia' AND b.precisao_inicio = 'dia' AND a.data_inicio = b.data_inicio
        END
    ) conf
  )
  SELECT COUNT(*) INTO v_conflitos
  FROM pares pr
  WHERE NOT EXISTS (
    SELECT 1 FROM plan_conflitos_aceitos ca
    WHERE ca.ciclo_id = p_ciclo_id AND ca.tipo = pr.tipo
      AND ca.proposta_a = LEAST(pr.ia, pr.ib) AND ca.proposta_b = GREATEST(pr.ia, pr.ib));

  IF v_sem_quorum > 0 OR v_sem_decisao > 0 OR v_retif > 0 OR v_ressalva > 0 OR v_conflitos > 0 THEN
    RAISE EXCEPTION 'Publicação bloqueada · sem_quorum=% sem_decisao=% retificacao=% ressalva=% conflitos=%',
      v_sem_quorum, v_sem_decisao, v_retif, v_ressalva, v_conflitos;
  END IF;

  -- Snapshot (nova versão · itens = noCal)
  UPDATE plan_ciclos
     SET publicacao_versao = publicacao_versao + 1,
         publicado_em = now(),
         publicado_por = p_publicado_por
   WHERE id = p_ciclo_id
   RETURNING publicacao_versao INTO v_versao;

  INSERT INTO plan_calendario_itens (
    ciclo_id, publicacao_versao, proposta_id, nome, natureza, area, diretoria,
    data_inicio, precisao_inicio, multi_dia, data_fim, precisao_fim,
    recorrencia, dia_semana, hora_inicio, hora_fim, local_nome,
    custo, tem_arrecadacao, arrecadacao_prevista, decisao)
  SELECT p.ciclo_id, v_versao, p.id, p.nome, p.natureza, p.area, ad.diretoria,
         p.data_inicio, p.precisao_inicio, p.multi_dia, p.data_fim, p.precisao_fim,
         p.recorrencia, p.dia_semana, p.hora_inicio, p.hora_fim, l.nome,
         p.custo, p.tem_arrecadacao, p.arrecadacao_prevista, p.estado
  FROM plan_propostas p
  JOIN plan_locais l ON l.id = p.local_id
  LEFT JOIN plan_areas_diretoria ad ON ad.area = p.area
  WHERE p.ciclo_id = p_ciclo_id AND p.deleted_at IS NULL
    AND (p.estado = 'aprovada'
      OR (p.estado = 'aprovada_ressalvas' AND EXISTS (
            SELECT 1 FROM plan_decisoes d
            WHERE d.proposta_id = p.id AND d.revogada_em IS NULL
              AND d.decisao = 'aprovada_ressalvas' AND d.ressalva_cumprida_em IS NOT NULL
              AND d.rodada = (SELECT MAX(d2.rodada) FROM plan_decisoes d2
                              WHERE d2.proposta_id = p.id AND d2.revogada_em IS NULL))));

  GET DIAGNOSTICS v_itens = ROW_COUNT;
  RETURN jsonb_build_object('versao', v_versao, 'itens', v_itens);
END;
$$;

REVOKE ALL ON FUNCTION public.fn_plan_publicar_ciclo(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_plan_publicar_ciclo(uuid, uuid) TO service_role;

-- ── 15 · Whitelist de soft-delete (dinâmica · preserva a lista VIVA) ─────
-- Lê a função em produção e anexa as tabelas novas — imune ao drift
-- git↔prod (lição cui_atendimentos).
DO $$
DECLARE
  v_lista text[];
  v_novas text[] := ARRAY['plan_propostas','plan_avaliacoes','plan_apontamentos'];
  v_t text;
BEGIN
  SELECT public.app_soft_deletable_tables() INTO v_lista;
  FOREACH v_t IN ARRAY v_novas LOOP
    IF NOT (v_t = ANY(v_lista)) THEN
      v_lista := v_lista || v_t;
    END IF;
  END LOOP;
  EXECUTE format(
    'CREATE OR REPLACE FUNCTION public.app_soft_deletable_tables() RETURNS text[] LANGUAGE sql IMMUTABLE AS $f$ SELECT %L::text[] $f$',
    v_lista
  );
END $$;

-- ── 16 · RLS ─────────────────────────────────────────────────────────────
ALTER TABLE public.plan_diretorias         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plan_areas_diretoria    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plan_locais             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plan_ciclos             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plan_ciclo_avaliadores  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plan_propostas          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plan_avaliacoes         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plan_decisoes           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plan_apontamentos       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plan_conflitos_aceitos  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plan_orcamentos         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plan_orcamento_valores  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plan_calendario_itens   ENABLE ROW LEVEL SECURITY;

-- Catálogos (sem PII) · leitura por nível do módulo · escrita só backend
DROP POLICY IF EXISTS plan_diretorias_select ON public.plan_diretorias;
CREATE POLICY plan_diretorias_select ON public.plan_diretorias
  FOR SELECT TO authenticated
  USING (public.current_user_module_level('planejamento-anual') >= 1 OR public.is_super_admin());
DROP POLICY IF EXISTS plan_diretorias_service ON public.plan_diretorias;
CREATE POLICY plan_diretorias_service ON public.plan_diretorias
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS plan_areas_diretoria_select ON public.plan_areas_diretoria;
CREATE POLICY plan_areas_diretoria_select ON public.plan_areas_diretoria
  FOR SELECT TO authenticated
  USING (public.current_user_module_level('planejamento-anual') >= 1 OR public.is_super_admin());
DROP POLICY IF EXISTS plan_areas_diretoria_service ON public.plan_areas_diretoria;
CREATE POLICY plan_areas_diretoria_service ON public.plan_areas_diretoria
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS plan_locais_select ON public.plan_locais;
CREATE POLICY plan_locais_select ON public.plan_locais
  FOR SELECT TO authenticated
  USING (public.current_user_module_level('planejamento-anual') >= 1 OR public.is_super_admin());
DROP POLICY IF EXISTS plan_locais_service ON public.plan_locais;
CREATE POLICY plan_locais_service ON public.plan_locais
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS plan_ciclos_select ON public.plan_ciclos;
CREATE POLICY plan_ciclos_select ON public.plan_ciclos
  FOR SELECT TO authenticated
  USING (public.current_user_module_level('planejamento-anual') >= 1 OR public.is_super_admin());
DROP POLICY IF EXISTS plan_ciclos_service ON public.plan_ciclos;
CREATE POLICY plan_ciclos_service ON public.plan_ciclos
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS plan_ciclo_avaliadores_select ON public.plan_ciclo_avaliadores;
CREATE POLICY plan_ciclo_avaliadores_select ON public.plan_ciclo_avaliadores
  FOR SELECT TO authenticated
  USING (public.current_user_module_level('planejamento-anual') >= 1 OR public.is_super_admin());
DROP POLICY IF EXISTS plan_ciclo_avaliadores_service ON public.plan_ciclo_avaliadores;
CREATE POLICY plan_ciclo_avaliadores_service ON public.plan_ciclo_avaliadores
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Propostas · conteúdo visível ao staff do módulo (devolutivas NÃO moram aqui)
DROP POLICY IF EXISTS plan_propostas_select ON public.plan_propostas;
CREATE POLICY plan_propostas_select ON public.plan_propostas
  FOR SELECT TO authenticated
  USING (public.current_user_module_level('planejamento-anual') >= 1 OR public.is_super_admin());
DROP POLICY IF EXISTS plan_propostas_delete ON public.plan_propostas;
CREATE POLICY plan_propostas_delete ON public.plan_propostas
  FOR DELETE TO authenticated USING (public.is_super_admin());
DROP POLICY IF EXISTS plan_propostas_service ON public.plan_propostas;
CREATE POLICY plan_propostas_service ON public.plan_propostas
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Avaliações · NOTAS CEGAS: deny-by-default. SEM policy de nível de módulo
-- no SELECT (um diretor leria as notas alheias antes do quórum via PostgREST
-- direto com a anon key + JWT). Avaliador só vê a PRÓPRIA linha; agregação e
-- revelação pós-quórum são exclusivas do backend (service_role).
DROP POLICY IF EXISTS plan_avaliacoes_select ON public.plan_avaliacoes;
CREATE POLICY plan_avaliacoes_select ON public.plan_avaliacoes
  FOR SELECT TO authenticated
  USING (avaliador_id = auth.uid() OR public.is_super_admin());
DROP POLICY IF EXISTS plan_avaliacoes_service ON public.plan_avaliacoes;
CREATE POLICY plan_avaliacoes_service ON public.plan_avaliacoes
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Decisões e apontamentos · exigência/ressalva/apontamento chegam APENAS ao
-- proponente (e ao Pastor como autor) · fundamentação nunca ao proponente.
-- Regra de campo/papel é fina demais pra RLS → deny-by-default; o backend
-- projeta por papel (projetarProposta).
DROP POLICY IF EXISTS plan_decisoes_select ON public.plan_decisoes;
CREATE POLICY plan_decisoes_select ON public.plan_decisoes
  FOR SELECT TO authenticated USING (public.is_super_admin());
DROP POLICY IF EXISTS plan_decisoes_service ON public.plan_decisoes;
CREATE POLICY plan_decisoes_service ON public.plan_decisoes
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS plan_apontamentos_select ON public.plan_apontamentos;
CREATE POLICY plan_apontamentos_select ON public.plan_apontamentos
  FOR SELECT TO authenticated USING (public.is_super_admin());
DROP POLICY IF EXISTS plan_apontamentos_service ON public.plan_apontamentos;
CREATE POLICY plan_apontamentos_service ON public.plan_apontamentos
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Conflitos aceitos · justificativa é pública no calendário definitivo
DROP POLICY IF EXISTS plan_conflitos_aceitos_select ON public.plan_conflitos_aceitos;
CREATE POLICY plan_conflitos_aceitos_select ON public.plan_conflitos_aceitos
  FOR SELECT TO authenticated
  USING (public.current_user_module_level('planejamento-anual') >= 1 OR public.is_super_admin());
DROP POLICY IF EXISTS plan_conflitos_aceitos_service ON public.plan_conflitos_aceitos;
CREATE POLICY plan_conflitos_aceitos_service ON public.plan_conflitos_aceitos
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Orçamento · só Financeiro (diretoria) e Pastor · deny-by-default, o
-- backend decide por papel ("Os demais papéis não têm acesso").
DROP POLICY IF EXISTS plan_orcamentos_select ON public.plan_orcamentos;
CREATE POLICY plan_orcamentos_select ON public.plan_orcamentos
  FOR SELECT TO authenticated USING (public.is_super_admin());
DROP POLICY IF EXISTS plan_orcamentos_service ON public.plan_orcamentos;
CREATE POLICY plan_orcamentos_service ON public.plan_orcamentos
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS plan_orcamento_valores_select ON public.plan_orcamento_valores;
CREATE POLICY plan_orcamento_valores_select ON public.plan_orcamento_valores
  FOR SELECT TO authenticated USING (public.is_super_admin());
DROP POLICY IF EXISTS plan_orcamento_valores_service ON public.plan_orcamento_valores;
CREATE POLICY plan_orcamento_valores_service ON public.plan_orcamento_valores
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Calendário publicado · leitura por nível do módulo (sem mérito) · escrita
-- SÓ pela fn de publicação (trigger bloqueia UPDATE/DELETE até de service_role)
DROP POLICY IF EXISTS plan_calendario_itens_select ON public.plan_calendario_itens;
CREATE POLICY plan_calendario_itens_select ON public.plan_calendario_itens
  FOR SELECT TO authenticated
  USING (public.current_user_module_level('planejamento-anual') >= 1 OR public.is_super_admin());
DROP POLICY IF EXISTS plan_calendario_itens_service ON public.plan_calendario_itens;
CREATE POLICY plan_calendario_itens_service ON public.plan_calendario_itens
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── 17 · Audit log ───────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_audit_plan_propostas ON public.plan_propostas;
CREATE TRIGGER trg_audit_plan_propostas
AFTER INSERT OR UPDATE OR DELETE ON public.plan_propostas
FOR EACH ROW EXECUTE FUNCTION public.audit_log_changes(
  'estado,versao,custo,arrecadacao_prevista,data_inicio,data_fim,local_id,lider_id,retificacao_prazo,deleted_at');

DROP TRIGGER IF EXISTS trg_audit_plan_decisoes ON public.plan_decisoes;
CREATE TRIGGER trg_audit_plan_decisoes
AFTER INSERT OR UPDATE OR DELETE ON public.plan_decisoes
FOR EACH ROW EXECUTE FUNCTION public.audit_log_changes(
  'decisao,rodada,ressalva_cumprida_em,ressalva_verificada_por,revogada_em,revogada_por');

DROP TRIGGER IF EXISTS trg_audit_plan_avaliacoes ON public.plan_avaliacoes;
CREATE TRIGGER trg_audit_plan_avaliacoes
AFTER INSERT OR UPDATE OR DELETE ON public.plan_avaliacoes
FOR EACH ROW EXECUTE FUNCTION public.audit_log_changes('deleted_at');

DROP TRIGGER IF EXISTS trg_audit_plan_ciclos ON public.plan_ciclos;
CREATE TRIGGER trg_audit_plan_ciclos
AFTER INSERT OR UPDATE OR DELETE ON public.plan_ciclos
FOR EACH ROW EXECUTE FUNCTION public.audit_log_changes(
  'submissao_aberta,avaliacao_aberta,publicado_em,publicacao_versao');

DROP TRIGGER IF EXISTS trg_audit_plan_ciclo_avaliadores ON public.plan_ciclo_avaliadores;
CREATE TRIGGER trg_audit_plan_ciclo_avaliadores
AFTER INSERT OR UPDATE OR DELETE ON public.plan_ciclo_avaliadores
FOR EACH ROW EXECUTE FUNCTION public.audit_log_changes();

DROP TRIGGER IF EXISTS trg_audit_plan_conflitos_aceitos ON public.plan_conflitos_aceitos;
CREATE TRIGGER trg_audit_plan_conflitos_aceitos
AFTER INSERT OR UPDATE OR DELETE ON public.plan_conflitos_aceitos
FOR EACH ROW EXECUTE FUNCTION public.audit_log_changes();

-- ── 18 · Módulo no catálogo + matriz de permissão ────────────────────────
INSERT INTO public.modulos (slug, nome, rota, categoria, ordem, descricao, ativo)
SELECT 'planejamento-anual', 'Planejamento Anual', '/planejamento-anual', 'estrategica', 52,
       'Ciclo anual de propostas · avaliação pelas diretorias · decisão do Pastor · calendário e orçamento do ciclo',
       true
WHERE NOT EXISTS (SELECT 1 FROM public.modulos WHERE slug = 'planejamento-anual');

-- Matriz default: copia de 'planejamento' (Gestão Anual · perfil de acesso
-- mais próximo: coordenador-estrategia/diretores altos, assistentes leitura)
DO $$
DECLARE base_modulo_id int; novo_id int;
BEGIN
  SELECT id INTO base_modulo_id FROM public.modulos WHERE slug = 'planejamento';
  SELECT id INTO novo_id        FROM public.modulos WHERE slug = 'planejamento-anual';
  IF base_modulo_id IS NOT NULL AND novo_id IS NOT NULL THEN
    INSERT INTO public.cargo_modulo_permissao
      (cargo_id, modulo_id, nivel, pode_exportar, pode_aprovar, escopo_proprio)
    SELECT cmp.cargo_id, novo_id, cmp.nivel, cmp.pode_exportar, cmp.pode_aprovar, cmp.escopo_proprio
      FROM public.cargo_modulo_permissao cmp
     WHERE cmp.modulo_id = base_modulo_id
    ON CONFLICT (cargo_id, modulo_id) DO NOTHING;
  END IF;
END $$;

-- Pastor Presidente · INSERT EXPLÍCITO (a matriz dele foi ZERADA em
-- 20260603240000 · copiar de módulo base NÃO o alcança). Decisão do Yago
-- 2026-08-12: "o Pedro Junior (Pr. presidente) pode ter o acesso pleno".
DO $$
DECLARE v_cargo int; v_modulo int;
BEGIN
  SELECT id INTO v_cargo  FROM public.cargos  WHERE slug = 'pastor-presidente';
  SELECT id INTO v_modulo FROM public.modulos WHERE slug = 'planejamento-anual';
  IF v_cargo IS NOT NULL AND v_modulo IS NOT NULL THEN
    INSERT INTO public.cargo_modulo_permissao (cargo_id, modulo_id, nivel, pode_exportar, pode_aprovar, escopo_proprio)
    VALUES (v_cargo, v_modulo, 5, false, true, false)
    ON CONFLICT (cargo_id, modulo_id)
    DO UPDATE SET nivel = GREATEST(public.cargo_modulo_permissao.nivel, 5), pode_aprovar = true;
  END IF;
END $$;

-- ── 19 · Dormente da PR-A · marca como superada (NÃO dropa · destrutivo) ─
DO $$
BEGIN
  IF to_regclass('public.planejamento_ciclos') IS NOT NULL THEN
    COMMENT ON TABLE public.planejamento_ciclos IS
      'DORMENTE · era o portão de ano da PR-A dropada (2026-06-10) · superseded por plan_ciclos (2026-08-12) · drop futuro exige aprovação explícita';
  END IF;
END $$;

-- ── 20 · Comentários ─────────────────────────────────────────────────────
COMMENT ON TABLE public.plan_ciclos            IS 'Ciclo de Planejamento Anual · ano de referência + janelas de submissão/avaliação + publicação (versão do snapshot vigente).';
COMMENT ON TABLE public.plan_propostas         IS 'Propostas do ciclo · estado é a única coluna de status gravável (em_avaliacao/ranqueada/no_calendario são DERIVADOS no service).';
COMMENT ON TABLE public.plan_avaliacoes        IS 'Avaliação de 1 diretoria (7 critérios 1-5 + fundamentação) · CEGA até o quórum · RLS deny-by-default (own-rows) de propósito.';
COMMENT ON TABLE public.plan_decisoes          IS 'Decisões do Pastor · append-only por rodada (1=original, 2=pós-retificação) · retirar do calendário = revogada_em · imutável por trigger.';
COMMENT ON TABLE public.plan_apontamentos      IS 'Apontamentos do Pastor campo a campo · visíveis APENAS ao proponente (projeção no backend).';
COMMENT ON TABLE public.plan_conflitos_aceitos IS 'Aceites de conflito com justificativa (o conflito em si é recomputado sob demanda · nunca persistido).';
COMMENT ON TABLE public.plan_calendario_itens  IS 'Snapshot do calendário publicado · sem dados de mérito · imutável por trigger · republicar gera nova publicacao_versao.';
COMMENT ON TABLE public.plan_orcamento_valores IS 'Orçamento do ciclo · 5 linhas × 12 meses · caixa livre é DERIVADO (nunca coluna).';
COMMENT ON FUNCTION public.fn_plan_publicar_ciclo(uuid, uuid) IS 'Publica o ciclo: re-verifica as 5 travas DENTRO da transação (anti-TOCTOU) e grava o snapshot tipado. Referência de negócio espelhada em backend/services/planejamentoAnualRegras.js.';
