-- =====================================================================
-- Modulo Apresentacoes · gerador de slides HTML via Claude Opus
-- =====================================================================
-- Usuarios com nivel >=3 no modulo `apresentacoes` descrevem o que querem
-- (e opcionalmente fazem upload de arquivos) e a IA gera uma apresentacao
-- HTML interativa (deck-stage). Export PDF via @media print do navegador.
--
-- Estrutura:
--   apresentacoes              · 1 linha por apresentacao
--   apresentacoes_arquivos     · anexos com texto extraido (textExtractor)
--   apresentacoes_uso          · agregacao diaria pra dashboard de custo
-- =====================================================================

-- ── Modulo na matriz cargo×modulo ─────────────────────────────────────
INSERT INTO public.modulos (slug, nome, rota, categoria, ordem, descricao, ativo)
SELECT 'apresentacoes',
       'Apresentações',
       '/admin/apresentacoes',
       'dados-ia-admin',
       145,
       'Gerador de slides HTML interativos via Claude Opus · suporta upload de arquivos',
       true
 WHERE NOT EXISTS (SELECT 1 FROM public.modulos WHERE slug = 'apresentacoes');

-- Copia matriz default do modulo `cerebro` (mesma escala de acesso · IA-admin).
-- Cargos com nivel >=3 em cerebro ganham nivel 3 em apresentacoes; admin/dev
-- ficam com nivel 5. Quem nao tem cerebro fica em 0 (sem acesso).
DO $$
DECLARE
  base_id int;
  novo_id int;
BEGIN
  SELECT id INTO base_id FROM public.modulos WHERE slug = 'cerebro';
  SELECT id INTO novo_id FROM public.modulos WHERE slug = 'apresentacoes';

  IF base_id IS NULL OR novo_id IS NULL THEN
    RAISE NOTICE 'cerebro ou apresentacoes nao encontrado · pulando seed da matriz';
    RETURN;
  END IF;

  INSERT INTO public.cargo_modulo_permissao
    (cargo_id, modulo_id, nivel, pode_exportar, pode_aprovar, escopo_proprio)
  SELECT cmp.cargo_id, novo_id, cmp.nivel, cmp.pode_exportar, cmp.pode_aprovar, cmp.escopo_proprio
    FROM public.cargo_modulo_permissao cmp
   WHERE cmp.modulo_id = base_id
  ON CONFLICT (cargo_id, modulo_id) DO UPDATE
     SET nivel         = EXCLUDED.nivel,
         pode_exportar = EXCLUDED.pode_exportar,
         pode_aprovar  = EXCLUDED.pode_aprovar,
         escopo_proprio = EXCLUDED.escopo_proprio;
END $$;

-- ── Tabela principal ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.apresentacoes (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,

  titulo        text NOT NULL,
  prompt        text NOT NULL,
  tom           text DEFAULT 'executivo',  -- executivo | comercial | relatorio | criativo
  modelo_ia     text DEFAULT 'claude-opus-4-7',

  status        text NOT NULL DEFAULT 'pendente'
                CHECK (status IN ('pendente','gerando','pronto','erro')),
  erro_mensagem text,

  -- Conteudo gerado: HTML interno do <deck-stage> + CSS proprio da apresentacao
  slides_html   text,
  slides_css    text,
  slides_count  int DEFAULT 0,

  -- Telemetria
  tokens_input  int DEFAULT 0,
  tokens_output int DEFAULT 0,
  custo_usd     numeric(10,4) DEFAULT 0,
  duracao_ms    int DEFAULT 0,

  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now(),
  generated_at  timestamptz
);

CREATE INDEX IF NOT EXISTS apresentacoes_profile_idx
  ON public.apresentacoes (profile_id, created_at DESC);
CREATE INDEX IF NOT EXISTS apresentacoes_status_idx
  ON public.apresentacoes (status) WHERE status IN ('pendente','gerando');

-- ── Arquivos anexos ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.apresentacoes_arquivos (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  apresentacao_id uuid NOT NULL REFERENCES public.apresentacoes(id) ON DELETE CASCADE,
  nome            text NOT NULL,
  mime_type       text,
  tamanho_bytes   int,
  texto_extraido  text,  -- output do textExtractor (limitado a 15k chars)
  created_at      timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS apresentacoes_arquivos_apres_idx
  ON public.apresentacoes_arquivos (apresentacao_id);

-- ── Uso diario agregado · dashboard de custo ──────────────────────────
CREATE TABLE IF NOT EXISTS public.apresentacoes_uso (
  data          date NOT NULL,
  profile_id    uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  modelo_ia     text NOT NULL,
  total_geradas int NOT NULL DEFAULT 0,
  tokens_input  int NOT NULL DEFAULT 0,
  tokens_output int NOT NULL DEFAULT 0,
  custo_usd     numeric(10,4) NOT NULL DEFAULT 0,
  PRIMARY KEY (data, profile_id, modelo_ia)
);

CREATE INDEX IF NOT EXISTS apresentacoes_uso_data_idx
  ON public.apresentacoes_uso (data DESC);

-- ── View · resumo mes corrente pro admin ──────────────────────────────
CREATE OR REPLACE VIEW public.vw_apresentacoes_uso_mes AS
SELECT
  date_trunc('month', data)::date AS mes,
  count(*)                         AS dias_com_uso,
  sum(total_geradas)::int          AS total_geradas,
  sum(tokens_input)::bigint        AS tokens_input,
  sum(tokens_output)::bigint       AS tokens_output,
  sum(custo_usd)::numeric(10,2)    AS custo_total_usd
  FROM public.apresentacoes_uso
 WHERE data >= date_trunc('month', current_date)
 GROUP BY 1
 ORDER BY 1 DESC;

-- ── Trigger · atualiza updated_at no update ───────────────────────────
CREATE OR REPLACE FUNCTION public._apres_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS apresentacoes_set_updated_at ON public.apresentacoes;
CREATE TRIGGER apresentacoes_set_updated_at
  BEFORE UPDATE ON public.apresentacoes
  FOR EACH ROW EXECUTE FUNCTION public._apres_set_updated_at();

-- ── Cleanup retroativo de cache de permissoes (admin pode rodar bust) ──
-- O middleware ja invalida ao chamar bustPermissionCaches(), mas ate la
-- pode demorar 5min. Inserir o modulo nao basta · vai precisar logout/login.
COMMENT ON TABLE public.apresentacoes IS
  'Apresentacoes HTML geradas via Claude Opus · v1 2026-05-20';
