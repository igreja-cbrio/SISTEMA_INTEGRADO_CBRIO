-- ─────────────────────────────────────────────────────────────────────────
-- PCS · fix de aplicação · renomeia rh_avaliacoes antiga (schema incompatível)
-- para backup antes de tentar criar a nova estrutura PCS.
--
-- Contexto: a migration 20260518100000_pcs_modulo.sql falhou em produção
-- porque já existia uma tabela `rh_avaliacoes` com schema antigo (nota_*
-- hardcoded · sem ciclo_ano), de um TabAvaliacoes vazio anterior. Como toda
-- a migration roda em transação, nada foi aplicado. Esta migration:
--
--   1. renomeia a tabela antiga pra `rh_avaliacoes_legacy_pre_pcs` se ela
--      existir e não tiver a coluna ciclo_ano (não destrutivo)
--   2. faz o mesmo com `rh_avaliacao_fatores` se houver versão incompatível
--   3. depois disso, a migration original pode ser re-rodada com sucesso
--      (ou aplicada junto, já que tudo é idempotente)
-- ─────────────────────────────────────────────────────────────────────────

BEGIN;

DO $$
BEGIN
  -- Backup rh_avaliacoes antiga se não tiver ciclo_ano
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'rh_avaliacoes'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'rh_avaliacoes' AND column_name = 'ciclo_ano'
  ) THEN
    EXECUTE 'ALTER TABLE public.rh_avaliacoes RENAME TO rh_avaliacoes_legacy_pre_pcs';
    RAISE NOTICE 'Tabela rh_avaliacoes antiga renomeada para rh_avaliacoes_legacy_pre_pcs (backup)';
  END IF;

  -- Backup rh_avaliacao_fatores antiga se não tiver a coluna fonte
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'rh_avaliacao_fatores'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'rh_avaliacao_fatores' AND column_name = 'fonte'
  ) THEN
    EXECUTE 'ALTER TABLE public.rh_avaliacao_fatores RENAME TO rh_avaliacao_fatores_legacy_pre_pcs';
    RAISE NOTICE 'Tabela rh_avaliacao_fatores antiga renomeada para rh_avaliacao_fatores_legacy_pre_pcs (backup)';
  END IF;
END $$;

COMMIT;


-- ═════════════════════════════════════════════════════════════════════════
-- A partir daqui, reaplica TODO o conteúdo da migration 20260518100000
-- (já é idempotente · CREATE TABLE IF NOT EXISTS + ON CONFLICT DO UPDATE).
-- Se a original não rodou, esta aplica tudo. Se rodou, é no-op seguro.
-- ═════════════════════════════════════════════════════════════════════════

BEGIN;

-- 1. PCS_GRAUS
CREATE TABLE IF NOT EXISTS public.pcs_graus (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo          TEXT NOT NULL UNIQUE,
  ordem           INT  NOT NULL UNIQUE,
  nivel           TEXT NOT NULL,
  categoria       TEXT NOT NULL CHECK (categoria IN ('Operacional','Tático','Estratégico')),
  faixa_min       NUMERIC(12,2) NOT NULL,
  faixa_ref       NUMERIC(12,2) NOT NULL,
  faixa_max       NUMERIC(12,2) NOT NULL,
  variacao_pct    TEXT,
  amplitude_pct   NUMERIC(5,2) DEFAULT 50,
  area_atuacao    TEXT,
  pontos_min      INT,
  pontos_max      INT,
  observacao      TEXT,
  vigente_desde   DATE NOT NULL DEFAULT current_date,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.pcs_graus ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "pcs_graus_select" ON public.pcs_graus;
DROP POLICY IF EXISTS "pcs_graus_write"  ON public.pcs_graus;
CREATE POLICY "pcs_graus_select" ON public.pcs_graus FOR SELECT TO authenticated USING (true);
CREATE POLICY "pcs_graus_write"  ON public.pcs_graus FOR ALL    TO authenticated USING (true) WITH CHECK (true);

INSERT INTO public.pcs_graus (codigo, ordem, nivel, categoria, faixa_min, faixa_ref, faixa_max, variacao_pct, amplitude_pct, area_atuacao, pontos_min, pontos_max, observacao) VALUES
('G1',  1, 'Auxiliar',              'Operacional', 1621.00,   2026.25,  2431.50,  'âncora', 50, 'Gestão / Ministerial / Criativo', 100, 119, 'Auxiliar; execução simples, sem experiência requerida'),
('G2',  2, 'Assistente I',          'Operacional', 2107.30,   2634.12,  3160.95,  '+30%',   50, 'Gestão / Ministerial / Criativo', 120, 139, 'Assistente I; formação básica, pouca experiência'),
('G3',  3, 'Assistente II',         'Operacional', 2318.03,   2897.54,  3477.05,  '+10%',   50, 'Gestão / Ministerial / Criativo', 140, 159, 'Assistente II; técnica inicial, alguma experiência'),
('G4',  4, 'Assistente III',        'Operacional', 2549.83,   3187.29,  3824.75,  '+10%',   50, 'Gestão / Ministerial / Criativo', 160, 179, 'Assistente III; autonomia técnica incipiente'),
('G5',  5, 'Supervisor I',          'Operacional', 3314.78,   4143.48,  4972.17,  '+30%',   50, 'Gestão / Ministerial / Criativo', 180, 199, 'Supervisor I; liderança informal, técnica sólida'),
('G6',  6, 'Supervisor II',         'Operacional', 3646.26,   4557.83,  5469.39,  '+10%',   50, 'Gestão / Ministerial / Criativo', 200, 219, 'Supervisor II; gestão de pequena equipe'),
('G7',  7, 'Supervisor III',        'Operacional', 4010.89,   5013.61,  6016.33,  '+10%',   50, 'Gestão / Ministerial / Criativo', 220, 249, 'Supervisor III; gestão de equipe, responsabilidade de área'),
('G8',  8, 'Coordenador I',         'Tático',      5214.15,   6517.69,  7821.23,  '+30%',   50, 'Gestão / Ministerial / Criativo', 250, 279, 'Coordenador I; gestão formal, processos complexos'),
('G9',  9, 'Coordenador II',        'Tático',      5735.57,   7169.46,  8603.35,  '+10%',   50, 'Gestão / Ministerial / Criativo', 280, 309, 'Coordenador II; múltiplos processos, impacto de área'),
('G10', 10,'Coordenador III',       'Tático',      6309.13,   7886.41,  9463.69,  '+10%',   50, 'Gestão / Ministerial / Criativo', 310, 339, 'Coordenador III; alta complexidade, impacto multi-área'),
('G11', 11,'Gestor I',              'Tático',      8201.86,  10252.33, 12302.80,  '+30%',   50, 'Gestão / Ministerial / Criativo', 340, 369, 'Gestor I; liderança estratégica de equipe'),
('G12', 12,'Gestor II',             'Tático',      9022.05,  11277.56, 13533.07,  '+10%',   50, 'Gestão / Ministerial / Criativo', 370, 399, 'Gestor II; gestão avançada, múltiplas equipes'),
('G13', 13,'Gestor III',            'Tático',      9924.25,  12405.32, 14886.38,  '+10%',   50, 'Gestão / Ministerial / Criativo', 400, 429, 'Gestor III; gestão sênior, impacto organizacional amplo'),
('G14', 14,'Diretor I',             'Estratégico',12901.53,  16126.92, 19352.30,  '+30%',   50, 'Gestão / Ministerial / Criativo', 430, 449, 'Diretor I; liderança institucional, visão estratégica'),
('G15', 15,'Diretor II',            'Estratégico',14191.68,  17739.61, 21287.53,  '+10%',   50, 'Gestão / Ministerial / Criativo', 450, 459, 'Diretor II; gestão executiva multidisciplinar'),
('G16', 16,'Diretor III',           'Estratégico',15610.85,  19513.57, 23416.28,  '+10%',   50, 'Gestão / Ministerial / Criativo', 460, 469, 'Diretor III; alta liderança, múltiplas diretorias'),
('G17', 17,'Pastor Presidente I',   'Estratégico',20294.11,  25367.63, 30441.16,  '+30%',   50, 'Pastoral',                        470, 479, 'Pastor Presidente I; liderança pastoral e institucional'),
('G18', 18,'Pastor Presidente II',  'Estratégico',22323.52,  27904.40, 33485.28,  '+10%',   50, 'Pastoral',                        480, 484, 'Pastor Presidente II; pastoreio sênior regional'),
('G19', 19,'Pastor Presidente III', 'Estratégico',24555.87,  30694.84, 36833.81,  '+10%',   50, 'Pastoral',                        485, 489, 'Pastor Presidente III; pastoreio sênior avançado'),
('G20', 20,'Pastor Sênior I',       'Estratégico',31922.63,  39903.29, 47883.95,  '+30%',   50, 'Pastoral',                        490, 493, 'Pastor Sênior I; liderança pastoral máxima'),
('G21', 21,'Pastor Sênior II',      'Estratégico',35114.90,  43893.62, 52672.34,  '+10%',   50, 'Pastoral',                        494, 497, 'Pastor Sênior II; pastoreio institucional pleno'),
('G22', 22,'Pastor Sênior III',     'Estratégico',38626.39,  48282.98, 57939.58,  '+10%',   50, 'Pastoral',                        498, 500, 'Pastor Sênior III; máxima liderança pastoral')
ON CONFLICT (codigo) DO UPDATE SET
  nivel       = EXCLUDED.nivel,
  categoria   = EXCLUDED.categoria,
  faixa_min   = EXCLUDED.faixa_min,
  faixa_ref   = EXCLUDED.faixa_ref,
  faixa_max   = EXCLUDED.faixa_max,
  pontos_min  = EXCLUDED.pontos_min,
  pontos_max  = EXCLUDED.pontos_max,
  updated_at  = now();


-- 2. PCS_CRITERIOS
CREATE TABLE IF NOT EXISTS public.pcs_criterios (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo      TEXT NOT NULL UNIQUE,
  nome        TEXT NOT NULL,
  descricao   TEXT,
  peso        NUMERIC(4,3) NOT NULL,
  pontos_min  INT NOT NULL,
  pontos_max  INT NOT NULL,
  ordem       INT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.pcs_criterios ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "pcs_criterios_select" ON public.pcs_criterios;
DROP POLICY IF EXISTS "pcs_criterios_write"  ON public.pcs_criterios;
CREATE POLICY "pcs_criterios_select" ON public.pcs_criterios FOR SELECT TO authenticated USING (true);
CREATE POLICY "pcs_criterios_write"  ON public.pcs_criterios FOR ALL    TO authenticated USING (true) WITH CHECK (true);

INSERT INTO public.pcs_criterios (codigo, nome, descricao, peso, pontos_min, pontos_max, ordem) VALUES
('formacao',      'Formação Acadêmica',      'Escolaridade mínima exigida',                     0.15, 15, 75, 1),
('experiencia',   'Experiência Profissional','Tempo e qualidade da experiência',                0.20, 20,100, 2),
('complexidade',  'Complexidade das Tarefas','Nível de complexidade e autonomia',               0.20, 20,100, 3),
('responsabilidade','Responsabilidade',      'Impacto das decisões e resultados',               0.20, 20,100, 4),
('lideranca',     'Liderança e Gestão',      'Gestão de pessoas, equipes e projetos',           0.15, 15, 75, 5),
('competencias',  'Competências Técnicas',   'Domínio de ferramentas e habilidades',            0.10, 10, 50, 6)
ON CONFLICT (codigo) DO UPDATE SET
  nome = EXCLUDED.nome, descricao = EXCLUDED.descricao, peso = EXCLUDED.peso,
  pontos_min = EXCLUDED.pontos_min, pontos_max = EXCLUDED.pontos_max, updated_at = now();


-- 3. PCS_NIVEIS_CRITERIO
CREATE TABLE IF NOT EXISTS public.pcs_niveis_criterio (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  criterio_id   UUID NOT NULL REFERENCES public.pcs_criterios(id) ON DELETE CASCADE,
  nivel         INT  NOT NULL CHECK (nivel BETWEEN 1 AND 5),
  descricao     TEXT NOT NULL,
  UNIQUE (criterio_id, nivel)
);
ALTER TABLE public.pcs_niveis_criterio ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "pcs_niveis_select" ON public.pcs_niveis_criterio;
DROP POLICY IF EXISTS "pcs_niveis_write"  ON public.pcs_niveis_criterio;
CREATE POLICY "pcs_niveis_select" ON public.pcs_niveis_criterio FOR SELECT TO authenticated USING (true);
CREATE POLICY "pcs_niveis_write"  ON public.pcs_niveis_criterio FOR ALL    TO authenticated USING (true) WITH CHECK (true);

INSERT INTO public.pcs_niveis_criterio (criterio_id, nivel, descricao)
SELECT c.id, n.nivel, n.descricao FROM public.pcs_criterios c, (VALUES
  ('formacao', 1, 'Fund. Completo'), ('formacao', 2, 'Ensino Médio'), ('formacao', 3, 'Técnico / Sup. Cursando'),
  ('formacao', 4, 'Graduação'), ('formacao', 5, 'Pós / MBA / Mestrado'),
  ('experiencia', 1, 'Sem experiência'), ('experiencia', 2, 'Até 1 ano'), ('experiencia', 3, '1 a 3 anos'),
  ('experiencia', 4, '3 a 7 anos'), ('experiencia', 5, 'Mais de 7 anos'),
  ('complexidade', 1, 'Rotineiras e simples'), ('complexidade', 2, 'Variadas, procedimentos definidos'),
  ('complexidade', 3, 'Análise e decisão parcial'), ('complexidade', 4, 'Processos complexos'),
  ('complexidade', 5, 'Alta complexidade estratégica'),
  ('responsabilidade', 1, 'Individual / mínima'), ('responsabilidade', 2, 'Processos simples'),
  ('responsabilidade', 3, 'Coordena terceiros'), ('responsabilidade', 4, 'Responsável por área'),
  ('responsabilidade', 5, 'Resultados institucionais'),
  ('lideranca', 1, 'Sem liderança'), ('lideranca', 2, 'Orientação eventual'),
  ('lideranca', 3, 'Liderança informal'), ('lideranca', 4, 'Gestão formal de equipe'),
  ('lideranca', 5, 'Gestão de múltiplas equipes'),
  ('competencias', 1, 'Conhecimentos básicos'), ('competencias', 2, 'Ferramentas básicas'),
  ('competencias', 3, 'Técnica intermediária'), ('competencias', 4, 'Especialista na área'),
  ('competencias', 5, 'Referência técnica')
) AS n(codigo, nivel, descricao)
WHERE c.codigo = n.codigo
ON CONFLICT (criterio_id, nivel) DO UPDATE SET descricao = EXCLUDED.descricao;


-- 4. PCS_BENEFICIOS
CREATE TABLE IF NOT EXISTS public.pcs_beneficios (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo             TEXT NOT NULL UNIQUE,
  nome               TEXT NOT NULL,
  valor_referencia   TEXT,
  vinculos_elegiveis TEXT[] NOT NULL DEFAULT '{}',
  criterio           TEXT,
  ordem              INT NOT NULL DEFAULT 0,
  ativo              BOOLEAN NOT NULL DEFAULT true,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.pcs_beneficios ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "pcs_beneficios_select" ON public.pcs_beneficios;
DROP POLICY IF EXISTS "pcs_beneficios_write"  ON public.pcs_beneficios;
CREATE POLICY "pcs_beneficios_select" ON public.pcs_beneficios FOR SELECT TO authenticated USING (true);
CREATE POLICY "pcs_beneficios_write"  ON public.pcs_beneficios FOR ALL    TO authenticated USING (true) WITH CHECK (true);

INSERT INTO public.pcs_beneficios (codigo, nome, valor_referencia, vinculos_elegiveis, criterio, ordem) VALUES
('alimentacao',    'Alimentação (VR/VA)',    'R$ 700 - R$ 1.050',       ARRAY['CLT'],                       'Obrigatório; valor por nível e área',                 1),
('transporte',     'Transporte (VT)',        'Valor real da passagem',  ARRAY['CLT'],                       'Obrigatório conforme trajeto',                        2),
('plano_saude',    'Plano de Saúde',         'Coparticipação empresa',  ARRAY['CLT','PJ','PJ+','PREBENDA'], 'Opcional até G5; obrigatório G8+',                    3),
('seguro_vida',    'Seguro de Vida',         'Apólice coletiva',        ARRAY['CLT'],                       'Obrigatório para CLT',                                4),
('educacao',       'Educação',               'Até R$ 650/mês',          ARRAY['CLT','PJ','PJ+','PREBENDA'], 'Aprovação RH; vinculado a desempenho',                5),
('saldo_livre',    'Saldo Livre',            'Variável',                ARRAY['CLT','PJ','PJ+','PREBENDA'], 'Conforme política interna',                           6),
('gratificacao',   'Gratificação',           'Até R$ 1.600/mês',        ARRAY['CLT','PJ','PJ+','PREBENDA'], 'Avaliação de desempenho semestral',                   7),
('adicional_nivel','Adicional de Nível',     'Variável',                ARRAY['CLT','PJ','PJ+','PREBENDA'], 'Progressão horizontal dentro do grau',                8),
('bonus_anual',    'Bônus Anual',            '50% ou integral s/ salário', ARRAY['CLT','PJ','PJ+','PREBENDA'], 'Vinculado a metas organizacionais',                9),
('veiculo',        'Veículo / Combustível',  'Custo empresa',           ARRAY['PJ+'],                       'Exclusivo cargos estratégicos',                      10)
ON CONFLICT (codigo) DO UPDATE SET
  nome = EXCLUDED.nome, valor_referencia = EXCLUDED.valor_referencia,
  vinculos_elegiveis = EXCLUDED.vinculos_elegiveis, criterio = EXCLUDED.criterio, updated_at = now();


-- 5. PCS_BENEFICIO_GRAU
CREATE TABLE IF NOT EXISTS public.pcs_beneficio_grau (
  beneficio_id  UUID NOT NULL REFERENCES public.pcs_beneficios(id) ON DELETE CASCADE,
  grau_id       UUID NOT NULL REFERENCES public.pcs_graus(id)       ON DELETE CASCADE,
  status        TEXT NOT NULL CHECK (status IN ('sim','condicional','nao')),
  PRIMARY KEY (beneficio_id, grau_id)
);
ALTER TABLE public.pcs_beneficio_grau ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "pcs_benef_grau_select" ON public.pcs_beneficio_grau;
DROP POLICY IF EXISTS "pcs_benef_grau_write"  ON public.pcs_beneficio_grau;
CREATE POLICY "pcs_benef_grau_select" ON public.pcs_beneficio_grau FOR SELECT TO authenticated USING (true);
CREATE POLICY "pcs_benef_grau_write"  ON public.pcs_beneficio_grau FOR ALL    TO authenticated USING (true) WITH CHECK (true);

INSERT INTO public.pcs_beneficio_grau (beneficio_id, grau_id, status)
SELECT b.id, g.id,
  CASE
    WHEN b.codigo = 'alimentacao'    AND g.ordem BETWEEN 1 AND 13 THEN 'sim'
    WHEN b.codigo = 'alimentacao'    THEN 'nao'
    WHEN b.codigo = 'transporte'     AND g.ordem BETWEEN 1 AND 9  THEN 'sim'
    WHEN b.codigo = 'transporte'     THEN 'nao'
    WHEN b.codigo = 'plano_saude'    AND g.ordem BETWEEN 1 AND 2  THEN 'nao'
    WHEN b.codigo = 'plano_saude'    AND g.ordem BETWEEN 3 AND 7  THEN 'condicional'
    WHEN b.codigo = 'plano_saude'    THEN 'sim'
    WHEN b.codigo = 'seguro_vida'    THEN 'sim'
    WHEN b.codigo = 'educacao'       AND g.ordem >= 5             THEN 'sim'
    WHEN b.codigo = 'educacao'       THEN 'nao'
    WHEN b.codigo = 'saldo_livre'    AND g.ordem >= 8             THEN 'sim'
    WHEN b.codigo = 'saldo_livre'    THEN 'nao'
    WHEN b.codigo = 'gratificacao'   AND g.ordem >= 9             THEN 'sim'
    WHEN b.codigo = 'gratificacao'   THEN 'nao'
    WHEN b.codigo = 'adicional_nivel' AND g.ordem >= 8            THEN 'sim'
    WHEN b.codigo = 'adicional_nivel' THEN 'nao'
    WHEN b.codigo = 'bonus_anual'    AND g.ordem >= 9             THEN 'sim'
    WHEN b.codigo = 'bonus_anual'    THEN 'nao'
    WHEN b.codigo = 'veiculo'        AND g.ordem >= 14            THEN 'sim'
    WHEN b.codigo = 'veiculo'        THEN 'nao'
    ELSE 'nao'
  END
FROM public.pcs_beneficios b CROSS JOIN public.pcs_graus g
ON CONFLICT (beneficio_id, grau_id) DO UPDATE SET status = EXCLUDED.status;


-- 6. RH_FUNCIONARIOS · novas colunas
ALTER TABLE public.rh_funcionarios
  ADD COLUMN IF NOT EXISTS grau_id            UUID REFERENCES public.pcs_graus(id),
  ADD COLUMN IF NOT EXISTS data_enquadramento DATE,
  ADD COLUMN IF NOT EXISTS remuneracao_bruta  NUMERIC(12,2);
CREATE INDEX IF NOT EXISTS idx_rh_funcionarios_grau ON public.rh_funcionarios(grau_id);


-- 7. RH_AVALIACOES (versão PCS · estrutura nova)
CREATE TABLE IF NOT EXISTS public.rh_avaliacoes (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  funcionario_id      UUID NOT NULL REFERENCES public.rh_funcionarios(id) ON DELETE CASCADE,
  ciclo_ano           INT  NOT NULL,
  ciclo_periodo       TEXT NOT NULL DEFAULT 'anual',
  metas               TEXT,
  metas_definidas_em  TIMESTAMPTZ,
  autoavaliacao_pts   NUMERIC(5,2),
  autoavaliacao_em    TIMESTAMPTZ,
  autoavaliacao_obs   TEXT,
  lider_id            UUID,
  lider_pts           NUMERIC(5,2),
  lider_avaliado_em   TIMESTAMPTZ,
  lider_obs           TEXT,
  calibracao_pts      NUMERIC(5,2),
  calibracao_em       TIMESTAMPTZ,
  calibracao_obs      TEXT,
  pontuacao_final     NUMERIC(5,2),
  pontuacao_pcs       INT,
  grau_sugerido_id    UUID REFERENCES public.pcs_graus(id),
  status              TEXT NOT NULL DEFAULT 'metas_pendentes',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (funcionario_id, ciclo_ano, ciclo_periodo)
);
ALTER TABLE public.rh_avaliacoes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "rh_avaliacoes_select" ON public.rh_avaliacoes;
DROP POLICY IF EXISTS "rh_avaliacoes_write"  ON public.rh_avaliacoes;
CREATE POLICY "rh_avaliacoes_select" ON public.rh_avaliacoes FOR SELECT TO authenticated USING (true);
CREATE POLICY "rh_avaliacoes_write"  ON public.rh_avaliacoes FOR ALL    TO authenticated USING (true) WITH CHECK (true);
CREATE INDEX IF NOT EXISTS idx_avaliacoes_func ON public.rh_avaliacoes(funcionario_id);
CREATE INDEX IF NOT EXISTS idx_avaliacoes_ciclo ON public.rh_avaliacoes(ciclo_ano, status);


-- 8. RH_AVALIACAO_FATORES
CREATE TABLE IF NOT EXISTS public.rh_avaliacao_fatores (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  avaliacao_id    UUID NOT NULL REFERENCES public.rh_avaliacoes(id) ON DELETE CASCADE,
  criterio_id     UUID NOT NULL REFERENCES public.pcs_criterios(id) ON DELETE CASCADE,
  fonte           TEXT NOT NULL CHECK (fonte IN ('autoavaliacao','lider','calibracao')),
  nivel           INT  NOT NULL CHECK (nivel BETWEEN 1 AND 5),
  pontos          NUMERIC(6,2),
  observacao      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (avaliacao_id, criterio_id, fonte)
);
ALTER TABLE public.rh_avaliacao_fatores ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "rh_aval_fatores_select" ON public.rh_avaliacao_fatores;
DROP POLICY IF EXISTS "rh_aval_fatores_write"  ON public.rh_avaliacao_fatores;
CREATE POLICY "rh_aval_fatores_select" ON public.rh_avaliacao_fatores FOR SELECT TO authenticated USING (true);
CREATE POLICY "rh_aval_fatores_write"  ON public.rh_avaliacao_fatores FOR ALL    TO authenticated USING (true) WITH CHECK (true);


-- 9. PCS_PROGRESSOES
CREATE TABLE IF NOT EXISTS public.pcs_progressoes (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  funcionario_id       UUID NOT NULL REFERENCES public.rh_funcionarios(id) ON DELETE CASCADE,
  tipo                 TEXT NOT NULL CHECK (tipo IN ('merito','promocao','enquadramento','coletivo','admissao','outro')),
  salario_anterior     NUMERIC(12,2),
  salario_novo         NUMERIC(12,2),
  remun_bruta_anterior NUMERIC(12,2),
  remun_bruta_nova     NUMERIC(12,2),
  grau_anterior_id     UUID REFERENCES public.pcs_graus(id),
  grau_novo_id         UUID REFERENCES public.pcs_graus(id),
  variacao_pct         NUMERIC(7,3),
  motivo               TEXT,
  observacao           TEXT,
  aprovado_por         UUID,
  aprovado_por_nome    TEXT,
  data_efetivacao      DATE NOT NULL DEFAULT current_date,
  reajuste_coletivo_id UUID,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by           UUID
);
ALTER TABLE public.pcs_progressoes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "pcs_progressoes_select" ON public.pcs_progressoes;
DROP POLICY IF EXISTS "pcs_progressoes_write"  ON public.pcs_progressoes;
CREATE POLICY "pcs_progressoes_select" ON public.pcs_progressoes FOR SELECT TO authenticated USING (true);
CREATE POLICY "pcs_progressoes_write"  ON public.pcs_progressoes FOR ALL    TO authenticated USING (true) WITH CHECK (true);
CREATE INDEX IF NOT EXISTS idx_progressoes_func ON public.pcs_progressoes(funcionario_id, data_efetivacao DESC);
CREATE INDEX IF NOT EXISTS idx_progressoes_tipo ON public.pcs_progressoes(tipo, data_efetivacao DESC);


-- 10. PCS_REAJUSTES_COLETIVOS
CREATE TABLE IF NOT EXISTS public.pcs_reajustes_coletivos (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ano               INT NOT NULL,
  percentual        NUMERIC(7,3) NOT NULL,
  indice_referencia TEXT,
  aplicar_faixas    BOOLEAN NOT NULL DEFAULT true,
  aplicar_salarios  BOOLEAN NOT NULL DEFAULT true,
  aplicado_em       TIMESTAMPTZ NOT NULL DEFAULT now(),
  aplicado_por      UUID,
  observacao        TEXT,
  total_funcs       INT,
  custo_total       NUMERIC(14,2),
  UNIQUE (ano)
);
ALTER TABLE public.pcs_reajustes_coletivos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "pcs_reajustes_select" ON public.pcs_reajustes_coletivos;
DROP POLICY IF EXISTS "pcs_reajustes_write"  ON public.pcs_reajustes_coletivos;
CREATE POLICY "pcs_reajustes_select" ON public.pcs_reajustes_coletivos FOR SELECT TO authenticated USING (true);
CREATE POLICY "pcs_reajustes_write"  ON public.pcs_reajustes_coletivos FOR ALL    TO authenticated USING (true) WITH CHECK (true);


-- 11. VIEW vw_pcs_aderencia
CREATE OR REPLACE VIEW public.vw_pcs_aderencia AS
SELECT
  f.id                                AS funcionario_id,
  f.nome,
  f.cargo,
  f.area,
  f.tipo_contrato,
  f.status,
  f.grau_id,
  g.codigo                            AS grau_codigo,
  g.nivel                             AS grau_nivel,
  g.categoria                         AS grau_categoria,
  g.faixa_min,
  g.faixa_ref,
  g.faixa_max,
  COALESCE(
    CASE WHEN f.tipo_contrato = 'PJ+' THEN f.remuneracao_bruta ELSE NULL END,
    f.salario,
    f.remuneracao_bruta
  )                                   AS remuneracao_efetiva,
  CASE WHEN g.faixa_ref IS NOT NULL AND g.faixa_ref > 0
       THEN ROUND( COALESCE(
              CASE WHEN f.tipo_contrato = 'PJ+' THEN f.remuneracao_bruta ELSE NULL END,
              f.salario,
              f.remuneracao_bruta
            )::numeric / g.faixa_ref::numeric, 4)
       ELSE NULL
  END                                 AS compa_ratio,
  CASE
    WHEN g.id IS NULL                                                           THEN 'sem_enquadramento'
    WHEN COALESCE(CASE WHEN f.tipo_contrato='PJ+' THEN f.remuneracao_bruta END, f.salario) IS NULL THEN 'sem_salario'
    WHEN COALESCE(CASE WHEN f.tipo_contrato='PJ+' THEN f.remuneracao_bruta END, f.salario) < g.faixa_min THEN 'abaixo'
    WHEN COALESCE(CASE WHEN f.tipo_contrato='PJ+' THEN f.remuneracao_bruta END, f.salario) > g.faixa_max THEN 'acima'
    WHEN g.faixa_ref > 0 AND COALESCE(CASE WHEN f.tipo_contrato='PJ+' THEN f.remuneracao_bruta END, f.salario)::numeric / g.faixa_ref::numeric < 0.85 THEN 'abaixo'
    WHEN g.faixa_ref > 0 AND COALESCE(CASE WHEN f.tipo_contrato='PJ+' THEN f.remuneracao_bruta END, f.salario)::numeric / g.faixa_ref::numeric > 1.15 THEN 'acima'
    ELSE 'adequado'
  END                                 AS aderencia,
  CASE
    WHEN g.id IS NULL THEN NULL
    WHEN COALESCE(CASE WHEN f.tipo_contrato='PJ+' THEN f.remuneracao_bruta END, f.salario) < g.faixa_min THEN g.faixa_min
    ELSE NULL
  END                                 AS salario_sugerido,
  CASE
    WHEN g.id IS NULL THEN NULL
    WHEN COALESCE(CASE WHEN f.tipo_contrato='PJ+' THEN f.remuneracao_bruta END, f.salario) < g.faixa_min
      THEN g.faixa_min - COALESCE(CASE WHEN f.tipo_contrato='PJ+' THEN f.remuneracao_bruta END, f.salario)
    ELSE 0
  END                                 AS delta_correcao
FROM public.rh_funcionarios f
LEFT JOIN public.pcs_graus g ON g.id = f.grau_id
WHERE f.status = 'ativo';


-- 12. TRIGGER updated_at
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS trg_pcs_graus_touch ON public.pcs_graus;
CREATE TRIGGER trg_pcs_graus_touch BEFORE UPDATE ON public.pcs_graus FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
DROP TRIGGER IF EXISTS trg_pcs_criterios_touch ON public.pcs_criterios;
CREATE TRIGGER trg_pcs_criterios_touch BEFORE UPDATE ON public.pcs_criterios FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
DROP TRIGGER IF EXISTS trg_pcs_beneficios_touch ON public.pcs_beneficios;
CREATE TRIGGER trg_pcs_beneficios_touch BEFORE UPDATE ON public.pcs_beneficios FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
DROP TRIGGER IF EXISTS trg_rh_avaliacoes_touch ON public.rh_avaliacoes;
CREATE TRIGGER trg_rh_avaliacoes_touch BEFORE UPDATE ON public.rh_avaliacoes FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


-- 13. SEED · 43 colaboradores
WITH novos AS (
  SELECT * FROM (VALUES
    ('Alba Maia Armelau',                       'Auxiliar de Cozinha',              'Gestão',       'CLT',     1908.00,    'G1'),
    ('Maria Jane Pinto Rodrigues',              'Auxiliar de Cozinha',              'Gestão',       'CLT',     1908.00,    'G1'),
    ('Marcelo Silva Rosa Heredia da Cunha',     'Auxiliar de Infraestrutura',       'Gestão',       'CLT',     2500.00,    'G2'),
    ('Pery Magalhães Santos Casé',              'Assistente de Logística',          'Gestão',       'PJ',      2120.00,    'G2'),
    ('Natasha Mauerberg Litwinczuk de Faria',   'Assistente Ministerial',           'Ministerial',  'PJ',      2120.00,    'G3'),
    ('Elionardo Alves Rodrigues',               'Assistente de Infraestrutura',     'Gestão',       'PJ',      2500.00,    'G3'),
    ('Arthur Cecconi',                          'Assistente Ministerial',           'Ministerial',  'PJ',      2120.00,    'G3'),
    ('Andre Teixeira Rocha',                    'Assistente de Produção',           'Criativo',     'PJ',      3000.00,    'G4'),
    ('Francisco Jose Henrique de Sousa',        'Assistente Administrativo',        'Gestão',       'CLT',     3625.91,    'G4'),
    ('Milena Espinelo de Castro Rochet',        'Assistente Ministerial',           'Ministerial',  'PJ',      2120.00,    'G4'),
    ('Diego Assis',                             'Assistente de TI',                 'Gestão',       'PJ',      2120.00,    'G4'),
    ('Luzia Peron Ramos',                       'Assistente CBKids',                'Ministerial',  'PJ',      1595.16,    'G4'),
    ('Erivelton Gomes Lima',                    'Assistente de Almoxarifado',       'Gestão',       'CLT',     3185.41,    'G4'),
    ('Leonardo Pinto Ferreira',                 'Assistente de Infraestrutura',     'Gestão',       'CLT',     3185.41,    'G4'),
    ('Nicolle Algaves Litwinczuk',              'Assistente Pastoral',              'Ministerial',  'PJ',      2650.00,    'G4'),
    ('Cauã Pedreti da Cruz',                    'Designer Junior',                  'Criativo',     'PJ',      2120.00,    'G6'),
    ('Letícia Carvalho Baldner',                'Designer Junior',                  'Criativo',     'PJ',      2120.00,    'G6'),
    ('Alexandra Correa Xavier',                 'Encarregado de Limpeza',           'Gestão',       'CLT',     2359.56,    'G7'),
    ('Filipe dos Santos Costa Carmet',          'Coordenador AMI',                  'Ministerial',  'PJ',      5618.00,    'G8'),
    ('Marcos Paulo Domingues de Almeida',       'Coordenador de Infraestrutura',    'Gestão',       'PJ',      3364.00,    'G8'),
    ('Matheus Ribeiro Toscano',                 'Coordenador de Inovações',         'Gestão',       'PJ',      3364.00,    'G8'),
    ('Sonia Cristina Barreto Litwinczuk',       'Coordenadora de Compliance',       'Gestão',       'CLT',    13887.32,    'G8'),
    ('Lorena Pariz Leonardo Queres',            'Social Media',                     'Criativo',     'PJ',      2600.00,    'G9'),
    ('Allan Santana da Silva',                  'Produtor Audiovisual',             'Criativo',     'PJ',      4000.00,    'G9'),
    ('Fatima do Rosário Garcia Pereira',        'Governanta',                       'Gestão',       'PJ',      5000.00,    'G10'),
    ('Pedro Fernandes Mendes',                  'Coordenador de Produção',          'Criativo',     'PJ',      4500.00,    'G10'),
    ('Pedro Paiva',                             'Coordenador de Marketing',         'Criativo',     'PJ',      4000.00,    'G10'),
    ('Yago Coelho Torres',                      'Coordenador Financeiro',           'Gestão',       'PJ',      4000.00,    'G10'),
    ('Alda Lorena Cellos Andrade',              'Coordenadora de Integração',       'Ministerial',  'PJ',      5618.00,    'G10'),
    ('Jessica Salviano',                        'Coordenadora de Voluntariado',     'Ministerial',  'PJ',      5618.00,    'G10'),
    ('Jose Ribamar dos Inocentes França',       'Encarregado de Infra',             'Gestão',       'PJ',      7087.50,    'G10'),
    ('Renata Cristina Martins Bispo',           'Coordenadora da Igreja Online',    'Criativo',     'PJ',      5618.00,    'G10'),
    ('Amaury de Araújo Junior',                 'Coordenador de Operações',         'Gestão',       'PJ',      4300.00,    'G11'),
    ('David Silva da Conceição',                'Coordenador de Adoração',          'Criativo',     'CLT',    10397.16,    'G11'),
    ('Juliana Carneiro Leão Ramos',             'Coordenadora de RH',               'Gestão',       'CLT',     7498.90,    'G12'),
    ('Mariane Gaia',                            'Coordenadora CBKids',              'Ministerial',  'PJ',      5618.00,    'G12'),
    ('Wesley Barros Ramos',                     'Coordenador de Cuidados',          'Ministerial',  'PREBENDA',9588.16,    'G12'),
    ('Marcilio Nelio Paiva de Souza',           'Coordenador de Grupos/ CBA',       'Ministerial',  'PJ',     14720.00,    'G12'),
    ('Pedro Paulo Menezes',                     'Diretor Criativo',                 'Criativo',     'PJ+',     7500.00,    'G14'),
    ('Arthur Serpa',                            'Diretor Ministerial',              'Ministerial',  'PJ+',    15000.00,    'G15'),
    ('Eduardo Francisco dos Santos Gnisci',     'Diretor Operacional',              'Gestão',       'PJ+',    22252.00,    'G16'),
    ('Pedro Luis Barreto Litwinczuk Júnior',    'Pastor Executivo',                 'Ministerial',  'PJ+',    24540.80,    'G17'),
    ('Pedro Luis Barreto Litwinczuk',           'Pastor Sênior',                    'Ministerial',  'PJ+',    49479.57,    'G20')
  ) AS t(nome, cargo, area, tipo_contrato, salario_pcs, grau_codigo)
)
INSERT INTO public.rh_funcionarios (nome, cargo, area, tipo_contrato, salario, remuneracao_bruta, grau_id, data_enquadramento, data_admissao, status)
SELECT
  n.nome, n.cargo, n.area, n.tipo_contrato,
  CASE WHEN n.tipo_contrato = 'PJ+' THEN NULL ELSE n.salario_pcs END,
  CASE WHEN n.tipo_contrato = 'PJ+' THEN n.salario_pcs ELSE NULL END,
  g.id, current_date, current_date, 'ativo'
FROM novos n
JOIN public.pcs_graus g ON g.codigo = n.grau_codigo
WHERE NOT EXISTS (
  SELECT 1 FROM public.rh_funcionarios f
  WHERE lower(f.nome) = lower(n.nome)
);

-- Para os que já existem mas estão sem grau
UPDATE public.rh_funcionarios f
SET grau_id = g.id,
    data_enquadramento = COALESCE(f.data_enquadramento, current_date),
    remuneracao_bruta = CASE
      WHEN n.tipo_contrato = 'PJ+' AND f.remuneracao_bruta IS NULL THEN n.salario_pcs
      ELSE f.remuneracao_bruta
    END
FROM (VALUES
  ('Alba Maia Armelau','G1','CLT',1908.00),('Maria Jane Pinto Rodrigues','G1','CLT',1908.00),
  ('Marcelo Silva Rosa Heredia da Cunha','G2','CLT',2500.00),('Pery Magalhães Santos Casé','G2','PJ',2120.00),
  ('Natasha Mauerberg Litwinczuk de Faria','G3','PJ',2120.00),('Elionardo Alves Rodrigues','G3','PJ',2500.00),
  ('Arthur Cecconi','G3','PJ',2120.00),('Andre Teixeira Rocha','G4','PJ',3000.00),
  ('Francisco Jose Henrique de Sousa','G4','CLT',3625.91),('Milena Espinelo de Castro Rochet','G4','PJ',2120.00),
  ('Diego Assis','G4','PJ',2120.00),('Luzia Peron Ramos','G4','PJ',1595.16),
  ('Erivelton Gomes Lima','G4','CLT',3185.41),('Leonardo Pinto Ferreira','G4','CLT',3185.41),
  ('Nicolle Algaves Litwinczuk','G4','PJ',2650.00),('Cauã Pedreti da Cruz','G6','PJ',2120.00),
  ('Letícia Carvalho Baldner','G6','PJ',2120.00),('Alexandra Correa Xavier','G7','CLT',2359.56),
  ('Filipe dos Santos Costa Carmet','G8','PJ',5618.00),('Marcos Paulo Domingues de Almeida','G8','PJ',3364.00),
  ('Matheus Ribeiro Toscano','G8','PJ',3364.00),('Sonia Cristina Barreto Litwinczuk','G8','CLT',13887.32),
  ('Lorena Pariz Leonardo Queres','G9','PJ',2600.00),('Allan Santana da Silva','G9','PJ',4000.00),
  ('Fatima do Rosário Garcia Pereira','G10','PJ',5000.00),('Pedro Fernandes Mendes','G10','PJ',4500.00),
  ('Pedro Paiva','G10','PJ',4000.00),('Yago Coelho Torres','G10','PJ',4000.00),
  ('Alda Lorena Cellos Andrade','G10','PJ',5618.00),('Jessica Salviano','G10','PJ',5618.00),
  ('Jose Ribamar dos Inocentes França','G10','PJ',7087.50),('Renata Cristina Martins Bispo','G10','PJ',5618.00),
  ('Amaury de Araújo Junior','G11','PJ',4300.00),('David Silva da Conceição','G11','CLT',10397.16),
  ('Juliana Carneiro Leão Ramos','G12','CLT',7498.90),('Mariane Gaia','G12','PJ',5618.00),
  ('Wesley Barros Ramos','G12','PREBENDA',9588.16),('Marcilio Nelio Paiva de Souza','G12','PJ',14720.00),
  ('Pedro Paulo Menezes','G14','PJ+',7500.00),('Arthur Serpa','G15','PJ+',15000.00),
  ('Eduardo Francisco dos Santos Gnisci','G16','PJ+',22252.00),
  ('Pedro Luis Barreto Litwinczuk Júnior','G17','PJ+',24540.80),
  ('Pedro Luis Barreto Litwinczuk','G20','PJ+',49479.57)
) AS n(nome, grau_codigo, tipo_contrato, salario_pcs)
JOIN public.pcs_graus g ON g.codigo = n.grau_codigo
WHERE lower(f.nome) = lower(n.nome) AND f.grau_id IS NULL;


COMMIT;
