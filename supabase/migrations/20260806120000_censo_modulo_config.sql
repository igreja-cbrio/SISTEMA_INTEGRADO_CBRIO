-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ Módulo Censo · F0 — fundação da plataforma de pesquisas                  ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
--
-- POR QUÊ: a CBRio orçou com a INDECX (R$ 59k) uma pesquisa de perfil
-- demográfico e engajamento. Fazemos dentro do ERP por três razões:
--   1. cruzar o DECLARADO com o REAL (frequência, generosidade, grupo,
--      voluntariado, jornada) — a INDECX só vê o que a pessoa diz;
--   2. convicção religiosa é dado SENSÍVEL (LGPD art. 5º II). O art. 11 §1º
--      dá base legal à entidade religiosa para tratar dados dos seus fiéis,
--      VEDADA a transferência a terceiros. Tratando aqui, o dado não sai;
--   3. o estudo deles termina num PowerPoint; o módulo fica para 2027,
--      pesquisa de evento, pulso de grupo.
--
-- O QUE É: plataforma de pesquisas genérica (`cen_pesquisa.perguntas` jsonb no
-- mesmo schema que o módulo NPS já usa e que `src/components/nps/NpsForm.jsx`
-- já renderiza). O censo 2026 é a PRIMEIRA pesquisa, não o módulo inteiro.
-- Nada em `nps_*` é tocado — o NPS está em produção.
--
-- DECISÃO estrutural: as respostas viram LINHA (`cen_resposta_item`), não
-- ficam só no jsonb. Assim o dashboard agrega em SQL puro e uma pergunta nova
-- no questionário já vira gráfico sem código novo. O jsonb bruto continua em
-- `cen_resposta.payload` como fonte de verdade para reprocessar.
--
-- Idempotente. Rodar em colagem única.

SET lock_timeout = '10s';

-- ── 1. Catálogo do módulo + seed da matriz de permissões ───────────────────
-- Categoria `admin_dados` = mesma do NPS (grupo Inteligência no menu).
INSERT INTO public.modulos (slug, nome, rota, categoria, ordem, descricao, ativo)
SELECT 'censo', 'Censo', '/censo', 'admin_dados', 330,
       'Plataforma de pesquisas: censo demográfico, perfil e engajamento da comunidade', true
WHERE NOT EXISTS (SELECT 1 FROM public.modulos WHERE slug = 'censo');

-- Copia a matriz de um módulo de dados existente (nps) como ponto de partida.
DO $$
DECLARE base_id int;
BEGIN
  SELECT id INTO base_id FROM public.modulos WHERE slug = 'nps';
  IF base_id IS NOT NULL THEN
    INSERT INTO public.cargo_modulo_permissao (cargo_id, modulo_id, nivel, pode_exportar, pode_aprovar, escopo_proprio)
    SELECT cmp.cargo_id, novo.id, cmp.nivel, cmp.pode_exportar, cmp.pode_aprovar, cmp.escopo_proprio
      FROM public.cargo_modulo_permissao cmp
      CROSS JOIN public.modulos novo
     WHERE cmp.modulo_id = base_id AND novo.slug = 'censo'
    ON CONFLICT (cargo_id, modulo_id) DO NOTHING;
  END IF;
END $$;

-- ── 2. cen_pesquisa · o questionário ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.cen_pesquisa (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL,
  titulo TEXT NOT NULL,
  subtitulo TEXT,
  tipo TEXT NOT NULL DEFAULT 'censo'
    CHECK (tipo IN ('censo','pulso','evento','nps','outro')),
  status TEXT NOT NULL DEFAULT 'rascunho'
    CHECK (status IN ('rascunho','aberta','encerrada','arquivada')),
  abre_em TIMESTAMPTZ,
  fecha_em TIMESTAMPTZ,
  -- Mesmo formato de `nps_pesquisas.perguntas`, para reusar o renderer:
  --   [{ id, tipo, texto, descricao?, opcoes?, obrigatoria?, max? }]
  --   tipos: secao | texto_curto | texto_longo | escala_5 | nps | sim_nao
  --          | opcao_unica | multipla
  perguntas JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- { exige_identificacao, permite_anonimo, mostrar_progresso, tema, ... }
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  consentimento_texto TEXT,
  criado_por UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

-- FK em ALTER separado (nunca dentro de ADD COLUMN — padrão da casa).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cen_pesquisa_criado_por_fkey') THEN
    ALTER TABLE public.cen_pesquisa
      ADD CONSTRAINT cen_pesquisa_criado_por_fkey
      FOREIGN KEY (criado_por) REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Slug é a URL pública: único entre as pesquisas vivas.
CREATE UNIQUE INDEX IF NOT EXISTS uq_cen_pesquisa_slug
  ON public.cen_pesquisa (slug) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_cen_pesquisa_status
  ON public.cen_pesquisa (status) WHERE deleted_at IS NULL;

-- ── 3. cen_resposta · uma submissão ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.cen_resposta (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pesquisa_id UUID NOT NULL,
  membro_id UUID,
  canal TEXT NOT NULL DEFAULT 'qr'
    CHECK (canal IN ('qr','app','link','email','whatsapp','totem','importado')),
  -- COMO sabemos de quem é. 'anonimo' = respondeu sem se identificar.
  identificado_por TEXT NOT NULL DEFAULT 'anonimo'
    CHECK (identificado_por IN ('app_auth','token','cpf_nascimento','nome_nascimento','manual','anonimo')),
  -- Identidade declarada por quem NÃO casou com a base (vira lead de cadastro).
  nome_declarado TEXT,
  contato_declarado TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  iniciada_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  concluida_em TIMESTAMPTZ,
  duracao_seg INTEGER,
  dispositivo TEXT,
  ip_hash TEXT,
  -- Snapshot do texto aceito (o texto muda com o tempo; a prova não pode).
  consentimento_texto TEXT,
  consentimento_em TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cen_resposta_pesquisa_fkey') THEN
    ALTER TABLE public.cen_resposta
      ADD CONSTRAINT cen_resposta_pesquisa_fkey
      FOREIGN KEY (pesquisa_id) REFERENCES public.cen_pesquisa(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cen_resposta_membro_fkey') THEN
    ALTER TABLE public.cen_resposta
      ADD CONSTRAINT cen_resposta_membro_fkey
      FOREIGN KEY (membro_id) REFERENCES public.mem_membros(id) ON DELETE SET NULL;
  END IF;
END $$;

-- A TRAVA contra duplicata do QR: uma resposta por pessoa por pesquisa.
-- Anônimo (membro_id NULL) fica de fora — não há como deduplicar, e forçar
-- deduplicação por IP derrubaria o culto inteiro (todos saem pelo mesmo NAT).
CREATE UNIQUE INDEX IF NOT EXISTS uq_cen_resposta_pessoa
  ON public.cen_resposta (pesquisa_id, membro_id)
  WHERE membro_id IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_cen_resposta_pesquisa
  ON public.cen_resposta (pesquisa_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_cen_resposta_concluida
  ON public.cen_resposta (pesquisa_id, concluida_em DESC) WHERE deleted_at IS NULL;

-- ── 4. cen_resposta_item · uma linha por pergunta respondida ───────────────
-- `pesquisa_id` desnormalizado DE PROPÓSITO: o dashboard agrega direto aqui
-- sem join com cen_resposta.
CREATE TABLE IF NOT EXISTS public.cen_resposta_item (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  resposta_id UUID NOT NULL,
  pesquisa_id UUID NOT NULL,
  pergunta_id TEXT NOT NULL,
  pergunta_texto TEXT,
  tipo TEXT NOT NULL,
  valor_texto TEXT,
  valor_num NUMERIC(12,2),
  valor_opcoes TEXT[],
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cen_resposta_item_resposta_fkey') THEN
    ALTER TABLE public.cen_resposta_item
      ADD CONSTRAINT cen_resposta_item_resposta_fkey
      FOREIGN KEY (resposta_id) REFERENCES public.cen_resposta(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cen_resposta_item_pesquisa_fkey') THEN
    ALTER TABLE public.cen_resposta_item
      ADD CONSTRAINT cen_resposta_item_pesquisa_fkey
      FOREIGN KEY (pesquisa_id) REFERENCES public.cen_pesquisa(id) ON DELETE CASCADE;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_cen_resposta_item
  ON public.cen_resposta_item (resposta_id, pergunta_id);
CREATE INDEX IF NOT EXISTS idx_cen_item_agg
  ON public.cen_resposta_item (pesquisa_id, pergunta_id);
CREATE INDEX IF NOT EXISTS idx_cen_item_texto
  ON public.cen_resposta_item (pesquisa_id) WHERE valor_texto IS NOT NULL;

-- ── 5. cen_convite · rodadas de convite (molde de mem_censo_convites) ─────
CREATE TABLE IF NOT EXISTS public.cen_convite (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pesquisa_id UUID NOT NULL,
  membro_id UUID,
  canal TEXT NOT NULL CHECK (canal IN ('whatsapp','email','app')),
  rodada INTEGER NOT NULL DEFAULT 1,
  enviado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  enviado_por TEXT,            -- snapshot, sem FK (quem envia pode sair)
  ok BOOLEAN NOT NULL DEFAULT false,
  erro TEXT
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cen_convite_pesquisa_fkey') THEN
    ALTER TABLE public.cen_convite
      ADD CONSTRAINT cen_convite_pesquisa_fkey
      FOREIGN KEY (pesquisa_id) REFERENCES public.cen_pesquisa(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cen_convite_membro_fkey') THEN
    ALTER TABLE public.cen_convite
      ADD CONSTRAINT cen_convite_membro_fkey
      FOREIGN KEY (membro_id) REFERENCES public.mem_membros(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Trava contra clique duplo no disparo.
CREATE UNIQUE INDEX IF NOT EXISTS uq_cen_convite_rodada
  ON public.cen_convite (pesquisa_id, membro_id, canal, rodada)
  WHERE membro_id IS NOT NULL;

-- ── 6. cen_analise_item · leitura da IA por resposta aberta ───────────────
CREATE TABLE IF NOT EXISTS public.cen_analise_item (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  resposta_item_id UUID NOT NULL,
  pesquisa_id UUID NOT NULL,
  categoria TEXT,
  sentimento TEXT CHECK (sentimento IN ('positivo','neutro','negativo')),
  sentimento_score SMALLINT CHECK (sentimento_score BETWEEN -100 AND 100),
  classificacao TEXT CHECK (classificacao IN ('elogio','critica','sugestao','neutro')),
  topicos TEXT[],
  modelo TEXT,
  analisado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cen_analise_item_item_fkey') THEN
    ALTER TABLE public.cen_analise_item
      ADD CONSTRAINT cen_analise_item_item_fkey
      FOREIGN KEY (resposta_item_id) REFERENCES public.cen_resposta_item(id) ON DELETE CASCADE;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_cen_analise_item
  ON public.cen_analise_item (resposta_item_id);
CREATE INDEX IF NOT EXISTS idx_cen_analise_pesquisa
  ON public.cen_analise_item (pesquisa_id);

-- ── 7. cen_analise_pesquisa · cache das sínteses pesadas (SWOT, temas) ────
CREATE TABLE IF NOT EXISTS public.cen_analise_pesquisa (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pesquisa_id UUID NOT NULL,
  escopo TEXT NOT NULL DEFAULT 'geral',
  escopo_filtros JSONB NOT NULL DEFAULT '{}'::jsonb,
  resumo TEXT,
  temas JSONB,
  swot JSONB,
  acoes JSONB,
  modelo TEXT,
  tokens_entrada INTEGER,
  tokens_saida INTEGER,
  gerado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  gerado_por TEXT
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cen_analise_pesquisa_fkey') THEN
    ALTER TABLE public.cen_analise_pesquisa
      ADD CONSTRAINT cen_analise_pesquisa_fkey
      FOREIGN KEY (pesquisa_id) REFERENCES public.cen_pesquisa(id) ON DELETE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_cen_analise_pesq_escopo
  ON public.cen_analise_pesquisa (pesquisa_id, escopo, gerado_em DESC);

-- ── 8. updated_at ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_cen_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cen_pesquisa_updated_at ON public.cen_pesquisa;
CREATE TRIGGER trg_cen_pesquisa_updated_at
BEFORE UPDATE ON public.cen_pesquisa
FOR EACH ROW EXECUTE FUNCTION public.set_cen_updated_at();

-- ── 9. Views ──────────────────────────────────────────────────────────────

-- 9.1 Foto de cada pesquisa. `taxa_conclusao` = concluídas / iniciadas.
CREATE OR REPLACE VIEW public.vw_cen_pesquisa_stats AS
SELECT
  p.id                                                        AS pesquisa_id,
  p.slug,
  p.titulo,
  p.tipo,
  p.status,
  p.abre_em,
  p.fecha_em,
  jsonb_array_length(COALESCE(p.perguntas, '[]'::jsonb))       AS total_perguntas,
  COUNT(r.id)                                                 AS iniciadas,
  COUNT(r.id) FILTER (WHERE r.concluida_em IS NOT NULL)        AS concluidas,
  COUNT(r.id) FILTER (WHERE r.membro_id IS NOT NULL)           AS identificadas,
  COUNT(r.id) FILTER (WHERE r.membro_id IS NULL)               AS anonimas,
  CASE WHEN COUNT(r.id) = 0 THEN 0
       ELSE ROUND(COUNT(r.id) FILTER (WHERE r.concluida_em IS NOT NULL)::numeric
                  / COUNT(r.id)::numeric * 100, 1) END         AS taxa_conclusao,
  ROUND(AVG(r.duracao_seg) FILTER (WHERE r.concluida_em IS NOT NULL))::int AS duracao_media_seg,
  MAX(r.concluida_em)                                          AS ultima_resposta_em
FROM public.cen_pesquisa p
LEFT JOIN public.cen_resposta r
       ON r.pesquisa_id = p.id AND r.deleted_at IS NULL
WHERE p.deleted_at IS NULL
GROUP BY p.id;

-- 9.2 Cobertura por canal e por dia. Dia em BRT (-3h): sem isso o culto da
-- noite de domingo cai no dia seguinte e a curva mente.
CREATE OR REPLACE VIEW public.vw_cen_cobertura AS
SELECT
  r.pesquisa_id,
  r.canal,
  ((r.created_at AT TIME ZONE 'America/Sao_Paulo'))::date      AS dia,
  COUNT(*)                                                     AS iniciadas,
  COUNT(*) FILTER (WHERE r.concluida_em IS NOT NULL)           AS concluidas,
  COUNT(*) FILTER (WHERE r.membro_id IS NOT NULL)              AS identificadas
FROM public.cen_resposta r
WHERE r.deleted_at IS NULL
GROUP BY r.pesquisa_id, r.canal, 3;

-- 9.3 O motor do dashboard automático: (pesquisa, pergunta, valor) → contagem.
-- Pergunta nova no questionário já aparece agregada aqui, sem código novo.
-- Multipla escolha é expandida (unnest) — cada opção conta uma vez.
CREATE OR REPLACE VIEW public.vw_cen_item_agregado AS
SELECT
  i.pesquisa_id,
  i.pergunta_id,
  i.pergunta_texto,
  i.tipo,
  v.valor,
  COUNT(*) AS total
FROM public.cen_resposta_item i
JOIN public.cen_resposta r ON r.id = i.resposta_id AND r.deleted_at IS NULL
CROSS JOIN LATERAL (
  -- multipla escolha: uma linha por opção marcada
  SELECT opt AS valor
    FROM unnest(i.valor_opcoes) AS opt
   WHERE i.valor_opcoes IS NOT NULL
  UNION ALL
  -- resto: o número (nps/escala) ou o texto (opcao_unica/sim_nao/aberta).
  -- trim_scale porque valor_num é NUMERIC(12,2): sem ele o 9 vira o texto
  -- '9.00' e aparece como rótulo "9.00" no eixo de toda pergunta de escala.
  SELECT COALESCE(trim_scale(i.valor_num)::text, i.valor_texto)
   WHERE i.valor_opcoes IS NULL
) v
WHERE v.valor IS NOT NULL
GROUP BY i.pesquisa_id, i.pergunta_id, i.pergunta_texto, i.tipo, v.valor;

-- 9.4 Drop-off: quantas respostas chegaram em cada pergunta. A pergunta onde
-- a contagem cai é onde as pessoas desistem.
CREATE OR REPLACE VIEW public.vw_cen_funil_pergunta AS
SELECT
  i.pesquisa_id,
  i.pergunta_id,
  i.pergunta_texto,
  COUNT(DISTINCT i.resposta_id) AS respostas,
  ROUND(COUNT(DISTINCT i.resposta_id)::numeric
        / NULLIF(MAX(t.iniciadas), 0)::numeric * 100, 1) AS pct_do_total
FROM public.cen_resposta_item i
JOIN public.cen_resposta r ON r.id = i.resposta_id AND r.deleted_at IS NULL
JOIN public.vw_cen_pesquisa_stats t ON t.pesquisa_id = i.pesquisa_id
GROUP BY i.pesquisa_id, i.pergunta_id, i.pergunta_texto;

-- 9.5 Resposta + perfil da pessoa. Base de TODO cruzamento demográfico.
-- ⚠️ CONTÉM PII (nome). GRANT restrito abaixo: só service_role lê.
CREATE OR REPLACE VIEW public.vw_cen_resposta_pessoa AS
SELECT
  r.id                                  AS resposta_id,
  r.pesquisa_id,
  r.canal,
  r.identificado_por,
  r.concluida_em,
  r.duracao_seg,
  m.id                                  AS membro_id,
  m.nome,
  m.genero,
  m.estado_civil,
  m.bairro,
  m.cidade,
  m.profissao,
  m.status                              AS status_membro,
  m.censo_vinculo_declarado             AS vinculo_declarado,
  CASE WHEN m.data_nascimento IS NULL THEN NULL
       ELSE date_part('year', age(m.data_nascimento))::int END AS idade,
  CASE
    WHEN m.data_nascimento IS NULL THEN 'sem_data'
    WHEN date_part('year', age(m.data_nascimento)) < 13 THEN '0-12'
    WHEN date_part('year', age(m.data_nascimento)) < 18 THEN '13-17'
    WHEN date_part('year', age(m.data_nascimento)) < 25 THEN '18-24'
    WHEN date_part('year', age(m.data_nascimento)) < 35 THEN '25-34'
    WHEN date_part('year', age(m.data_nascimento)) < 45 THEN '35-44'
    WHEN date_part('year', age(m.data_nascimento)) < 60 THEN '45-59'
    ELSE '60+'
  END                                   AS faixa_etaria,
  -- Anos desde o cadastro: proxy de "tempo de casa" até o censo perguntar.
  ROUND(EXTRACT(epoch FROM (now() - m.created_at)) / 31557600.0, 1) AS anos_de_cadastro
FROM public.cen_resposta r
LEFT JOIN public.mem_membros m ON m.id = r.membro_id
WHERE r.deleted_at IS NULL;

-- ── 10. RLS ───────────────────────────────────────────────────────────────
-- Leitura para quem tem o módulo (>=1); escrita só nível 5 / super-admin.
-- O backend usa service_role e bypassa: a autorização real é o
-- authorizeModule('censo', n) em backend/routes/censo.js.
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['cen_pesquisa','cen_resposta','cen_resposta_item',
                           'cen_convite','cen_analise_item','cen_analise_pesquisa'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format($p$
      DROP POLICY IF EXISTS %1$s_sel ON public.%1$s;
      CREATE POLICY %1$s_sel ON public.%1$s FOR SELECT TO authenticated
        USING (public.current_user_module_level('censo') >= 1);
      DROP POLICY IF EXISTS %1$s_wr ON public.%1$s;
      CREATE POLICY %1$s_wr ON public.%1$s FOR ALL TO authenticated
        USING (public.current_user_module_level('censo') >= 5 OR public.is_super_admin())
        WITH CHECK (public.current_user_module_level('censo') >= 5 OR public.is_super_admin());
      DROP POLICY IF EXISTS %1$s_svc ON public.%1$s;
      CREATE POLICY %1$s_svc ON public.%1$s FOR ALL TO service_role USING (true) WITH CHECK (true);
    $p$, t);
  END LOOP;
END $$;

-- ── 11. GRANTs das views ──────────────────────────────────────────────────
-- Views não herdam RLS da tabela base (rodam como o dono). Então a view com
-- PII é fechada para anon/authenticated — o backend lê com service_role.
-- Precedente: a limpeza de segurança que revogou anon/auth de 114 funções.
REVOKE ALL ON public.vw_cen_resposta_pessoa FROM anon, authenticated;
GRANT SELECT ON public.vw_cen_resposta_pessoa TO service_role;

-- As agregadas não têm PII: liberadas para o front autenticado.
GRANT SELECT ON public.vw_cen_pesquisa_stats, public.vw_cen_cobertura,
                public.vw_cen_item_agregado, public.vw_cen_funil_pergunta
  TO authenticated, service_role;
REVOKE ALL ON public.vw_cen_pesquisa_stats, public.vw_cen_cobertura,
              public.vw_cen_item_agregado, public.vw_cen_funil_pergunta
  FROM anon;

-- ── 12. COMMENTs ──────────────────────────────────────────────────────────
COMMENT ON TABLE public.cen_pesquisa IS
  'Questionário. `perguntas` jsonb no mesmo schema de nps_pesquisas para reusar src/components/nps/NpsForm.jsx.';
COMMENT ON TABLE public.cen_resposta IS
  'Uma submissão. UNIQUE parcial (pesquisa_id, membro_id) é a trava contra duplicata do QR; anônimo fica de fora porque o culto todo sai pelo mesmo NAT.';
COMMENT ON TABLE public.cen_resposta_item IS
  'Uma linha por pergunta respondida. pesquisa_id é desnormalizado de propósito: agrega sem join.';
COMMENT ON COLUMN public.cen_resposta.identificado_por IS
  'COMO a pessoa foi identificada. app_auth = logado no app (de graça); token = link pessoal; cpf_nascimento/nome_nascimento = tela pública de identificação.';
COMMENT ON COLUMN public.cen_resposta.payload IS
  'Submissão bruta. Fonte de verdade para reprocessar cen_resposta_item se a normalização mudar.';
COMMENT ON VIEW public.vw_cen_item_agregado IS
  'Motor do dashboard automático: (pesquisa, pergunta, valor) -> contagem. Pergunta nova já vira gráfico sem código novo. trim_scale evita rótulo "9.00" no eixo.';
COMMENT ON VIEW public.vw_cen_resposta_pessoa IS
  'CONTÉM PII (nome). GRANT só para service_role; o front recebe agregado pelo backend.';
COMMENT ON VIEW public.vw_cen_funil_pergunta IS
  'Drop-off: a pergunta onde a contagem cai é onde as pessoas desistem de responder.';

-- ── Conferência (rodar depois de aplicar) ─────────────────────────────────
-- SELECT slug, nome, rota, ativo FROM public.modulos WHERE slug = 'censo';
-- SELECT tablename, policyname FROM pg_policies
--   WHERE schemaname='public' AND tablename LIKE 'cen_%' ORDER BY 1,2;   -- 18 linhas
-- SELECT table_name FROM information_schema.views
--   WHERE table_schema='public' AND table_name LIKE 'vw_cen_%';          -- 5 linhas
