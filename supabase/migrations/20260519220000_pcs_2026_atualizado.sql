-- ─────────────────────────────────────────────────────────────────────────
-- PCS 2026 · Atualização baseada no documento PCS_2026.xlsx
-- Maio/2026
--
-- Esta migration atualiza o PCS implementado em 20260518100000 com os
-- dados consolidados do documento PCS_2026.xlsx (42 colaboradores ativos):
--
--   1. Escala de pontuação dobra (era 100-500 total, agora 200-1000)
--      - pcs_criterios.pontos_max dobra (formação 75→150, experiência 100→200, etc.)
--      - pcs_graus.pontos_min/max muda pra faixas 200-238 ... 996-1000
--   2. Política de Benefícios atualizada:
--      - Educação/Gratificação/Adicional Nível/Bônus Anual: elegíveis em todos os graus
--      - Alimentação: G1-G10 (era G1-G13)
--      - Plano de Saúde: G1-G16 condicional, G17+ sim
--      - Bônus Anual virou "Bônus Anual e de Descanso"
--      - NOVO: Auxílio Saúde (PJ) R$ 300/mês para todos os PJ
--      - Saldo Livre desativado (não consta no novo PCS)
--   3. Colaboradores: 42 ativos com grau atual + remuneração atualizada
--      - Marcelo Silva Rosa Heredia da Cunha (43º do seed antigo) não está
--        no novo PCS · mantido como está, sem alteração
--   4. NOVO: tabela pcs_pontuacao_colaborador armazena a avaliação dos 6
--      critérios por colaborador + grau proposto baseado na pontuação
--   5. NOVO: view vw_pcs_proposta cruza grau atual × grau proposto +
--      remuneração × faixa do grau proposto
-- ─────────────────────────────────────────────────────────────────────────

BEGIN;

-- ═════════════════════════════════════════════════════════════════════════
-- 1. PCS_CRITERIOS · escala de pontos dobrou (max total = 1000)
-- ═════════════════════════════════════════════════════════════════════════
UPDATE public.pcs_criterios SET pontos_min = 30,  pontos_max = 150 WHERE codigo = 'formacao';
UPDATE public.pcs_criterios SET pontos_min = 40,  pontos_max = 200 WHERE codigo = 'experiencia';
UPDATE public.pcs_criterios SET pontos_min = 40,  pontos_max = 200 WHERE codigo = 'complexidade';
UPDATE public.pcs_criterios SET pontos_min = 40,  pontos_max = 200 WHERE codigo = 'responsabilidade';
UPDATE public.pcs_criterios SET pontos_min = 30,  pontos_max = 150 WHERE codigo = 'lideranca';
UPDATE public.pcs_criterios SET pontos_min = 20,  pontos_max = 100 WHERE codigo = 'competencias';


-- ═════════════════════════════════════════════════════════════════════════
-- 2. PCS_GRAUS · faixas de pontuação na nova escala 200-1000
-- ═════════════════════════════════════════════════════════════════════════
UPDATE public.pcs_graus SET pontos_min = 200, pontos_max = 238  WHERE codigo = 'G1';
UPDATE public.pcs_graus SET pontos_min = 240, pontos_max = 278  WHERE codigo = 'G2';
UPDATE public.pcs_graus SET pontos_min = 280, pontos_max = 318  WHERE codigo = 'G3';
UPDATE public.pcs_graus SET pontos_min = 320, pontos_max = 358  WHERE codigo = 'G4';
UPDATE public.pcs_graus SET pontos_min = 360, pontos_max = 398  WHERE codigo = 'G5';
UPDATE public.pcs_graus SET pontos_min = 400, pontos_max = 438  WHERE codigo = 'G6';
UPDATE public.pcs_graus SET pontos_min = 440, pontos_max = 498  WHERE codigo = 'G7';
UPDATE public.pcs_graus SET pontos_min = 500, pontos_max = 558  WHERE codigo = 'G8';
UPDATE public.pcs_graus SET pontos_min = 560, pontos_max = 618  WHERE codigo = 'G9';
UPDATE public.pcs_graus SET pontos_min = 620, pontos_max = 678  WHERE codigo = 'G10';
UPDATE public.pcs_graus SET pontos_min = 680, pontos_max = 738  WHERE codigo = 'G11';
UPDATE public.pcs_graus SET pontos_min = 740, pontos_max = 798  WHERE codigo = 'G12';
UPDATE public.pcs_graus SET pontos_min = 800, pontos_max = 858  WHERE codigo = 'G13';
UPDATE public.pcs_graus SET pontos_min = 860, pontos_max = 898  WHERE codigo = 'G14';
UPDATE public.pcs_graus SET pontos_min = 900, pontos_max = 918  WHERE codigo = 'G15';
UPDATE public.pcs_graus SET pontos_min = 920, pontos_max = 938  WHERE codigo = 'G16';
UPDATE public.pcs_graus SET pontos_min = 940, pontos_max = 958  WHERE codigo = 'G17';
UPDATE public.pcs_graus SET pontos_min = 960, pontos_max = 968  WHERE codigo = 'G18';
UPDATE public.pcs_graus SET pontos_min = 970, pontos_max = 978  WHERE codigo = 'G19';
UPDATE public.pcs_graus SET pontos_min = 980, pontos_max = 986  WHERE codigo = 'G20';
UPDATE public.pcs_graus SET pontos_min = 988, pontos_max = 994  WHERE codigo = 'G21';
UPDATE public.pcs_graus SET pontos_min = 996, pontos_max = 1000 WHERE codigo = 'G22';

-- Área de atuação: G17-G22 mudou de "Pastoral" pra "Presidência" no novo PCS
UPDATE public.pcs_graus SET area_atuacao = 'Presidência' WHERE codigo IN ('G17','G18','G19','G20','G21','G22');


-- ═════════════════════════════════════════════════════════════════════════
-- 3. PCS_BENEFICIOS · ajustes de nome, valor e novo Auxílio Saúde (PJ)
-- ═════════════════════════════════════════════════════════════════════════
UPDATE public.pcs_beneficios SET nome = 'Bônus Anual e de Descanso',
                                  valor_referencia = 'Integral',
                                  criterio = 'Vinculado a metas institucionais'
 WHERE codigo = 'bonus_anual';

UPDATE public.pcs_beneficios SET valor_referencia = 'Variável',
                                  criterio = 'Sujeito à avaliação de desempenho; aprovação RH'
 WHERE codigo = 'educacao';

UPDATE public.pcs_beneficios SET valor_referencia = 'Variável'
 WHERE codigo = 'gratificacao';

UPDATE public.pcs_beneficios SET ativo = false
 WHERE codigo = 'saldo_livre';

-- Novo benefício: Auxílio Saúde para PJ (substitui Plano de Saúde quando vínculo é PJ)
INSERT INTO public.pcs_beneficios (codigo, nome, valor_referencia, vinculos_elegiveis, criterio, ordem)
VALUES ('auxilio_saude_pj', 'Auxílio Saúde (PJ)', 'R$ 300/mês',
        ARRAY['PJ','PJ+','PREBENDA'],
        'Substituição ao plano de saúde para vínculos PJ',
        11)
ON CONFLICT (codigo) DO UPDATE SET
  nome               = EXCLUDED.nome,
  valor_referencia   = EXCLUDED.valor_referencia,
  vinculos_elegiveis = EXCLUDED.vinculos_elegiveis,
  criterio           = EXCLUDED.criterio,
  ordem              = EXCLUDED.ordem,
  ativo              = true,
  updated_at         = now();


-- ═════════════════════════════════════════════════════════════════════════
-- 4. PCS_BENEFICIO_GRAU · nova matriz de elegibilidade
-- ═════════════════════════════════════════════════════════════════════════
-- Recalcula matriz inteira (UPSERT) com as novas regras do PCS 2026
INSERT INTO public.pcs_beneficio_grau (beneficio_id, grau_id, status)
SELECT b.id, g.id,
  CASE
    -- Alimentação: G1-G10 sim, G11+ nao
    WHEN b.codigo = 'alimentacao'    AND g.ordem BETWEEN 1 AND 10 THEN 'sim'
    WHEN b.codigo = 'alimentacao'    THEN 'nao'
    -- Transporte: G1-G9 sim, G10+ nao
    WHEN b.codigo = 'transporte'     AND g.ordem BETWEEN 1 AND 9  THEN 'sim'
    WHEN b.codigo = 'transporte'     THEN 'nao'
    -- Plano de Saúde: G1-G16 condicional, G17+ sim
    WHEN b.codigo = 'plano_saude'    AND g.ordem BETWEEN 1 AND 16 THEN 'condicional'
    WHEN b.codigo = 'plano_saude'    THEN 'sim'
    -- Auxílio Saúde (PJ): todos os graus (depende do vínculo PJ)
    WHEN b.codigo = 'auxilio_saude_pj' THEN 'sim'
    -- Seguro de Vida: todos
    WHEN b.codigo = 'seguro_vida'    THEN 'sim'
    -- Educação: todos
    WHEN b.codigo = 'educacao'       THEN 'sim'
    -- Saldo Livre: desativado (não atribui novos)
    WHEN b.codigo = 'saldo_livre'    THEN 'nao'
    -- Gratificação: todos
    WHEN b.codigo = 'gratificacao'   THEN 'sim'
    -- Adicional de Nível: todos
    WHEN b.codigo = 'adicional_nivel' THEN 'sim'
    -- Bônus Anual e de Descanso: todos
    WHEN b.codigo = 'bonus_anual'    THEN 'sim'
    -- Veículo / Combustível: G14+
    WHEN b.codigo = 'veiculo'        AND g.ordem >= 14            THEN 'sim'
    WHEN b.codigo = 'veiculo'        THEN 'nao'
    ELSE 'nao'
  END
FROM public.pcs_beneficios b CROSS JOIN public.pcs_graus g
ON CONFLICT (beneficio_id, grau_id) DO UPDATE SET status = EXCLUDED.status;


-- ═════════════════════════════════════════════════════════════════════════
-- 5. RH_FUNCIONARIOS · atualiza 42 colaboradores com grau + salário 2026
-- ═════════════════════════════════════════════════════════════════════════
-- INSERT/UPDATE por match de nome (case + trim insensitive).
-- Preserva data_admissao, observacoes e outros campos não tocados.

WITH pcs2026 AS (
  SELECT * FROM (VALUES
    -- (nome, cargo, area, vinculo, remuneracao, grau_codigo)
    ('Alba Maia Armelau',                       'Auxiliar de Cozinha',              'Gestão',       'CLT',      2022.48,  'G1'),
    ('Maria Jane Pinto Rodrigues',              'Auxiliar de Cozinha',              'Gestão',       'CLT',      2022.48,  'G1'),
    ('Luzia Peron Ramos',                       'Assistente CBKids',                'Ministerial',  'PJ',       1621.00,  'G1'),
    ('Alexandra Correa Xavier',                 'Encarregado de Limpeza',           'Gestão',       'CLT',      2359.56,  'G2'),
    ('Arthur Cecconi',                          'Assistente Ministerial',           'Ministerial',  'PJ',       2120.00,  'G2'),
    ('Cauã Pedreti da Cruz',                    'Designer Junior',                  'Criativo',     'PJ',       2120.00,  'G2'),
    ('Diego Assis',                             'Assistente de TI',                 'Gestão',       'PJ',       2320.00,  'G2'),
    ('Letícia Carvalho Baldner',                'Designer Junior',                  'Criativo',     'PJ',       2120.00,  'G2'),
    ('Lorena Pariz Leonardo Queres',            'Social Media',                     'Criativo',     'PJ',       2600.00,  'G2'),
    ('Milena Espinelo de Castro Rochet',        'Assistente Ministerial',           'Ministerial',  'PJ',       2100.00,  'G2'),
    ('Natasha Mauerberg Litwinczuk de Faria',   'Assistente Ministerial',           'Ministerial',  'PJ',       2120.00,  'G2'),
    ('Pery Magalhães Santos Casé',              'Assistente de Logística',          'Gestão',       'PJ',       3020.00,  'G2'),
    ('Andre Teixeira Rocha',                    'Assistente de Produção',           'Criativo',     'PJ',       3000.00,  'G3'),
    ('Elionardo Alves Rodrigues',               'Assistente de Infraestrutura',     'Gestão',       'PJ',       3400.00,  'G3'),
    ('Erivelton Gomes Lima',                    'Assistente de Almoxarifado',       'Gestão',       'CLT',      3376.53,  'G3'),
    ('Leonardo Pinto Ferreira',                 'Assistente de Infraestrutura',     'Gestão',       'CLT',      3376.53,  'G3'),
    ('Nicolle Algaves Litwinczuk',              'Assistente Pastoral',              'Ministerial',  'PJ',       2650.00,  'G3'),
    ('Allan Santana da Silva',                  'Produtor Audiovisual',             'Criativo',     'PJ',       4000.00,  'G4'),
    ('Francisco Jose Henrique de Sousa',        'Assistente Administrativo',        'Gestão',       'CLT',      3843.46,  'G4'),
    ('Marcos Paulo Domingues de Almeida',       'Coordenador de Infraestrutura',    'Gestão',       'PJ',       4264.00,  'G5'),
    ('Matheus Ribeiro Toscano',                 'Coordenador de Inovações',         'Gestão',       'PJ',       4264.00,  'G5'),
    ('Pedro Fernandes Mendes',                  'Coordenador de Produção',          'Criativo',     'PJ',       4500.00,  'G5'),
    ('Pedro Paiva',                             'Coordenador de Marketing',         'Criativo',     'PJ',       4000.00,  'G5'),
    ('Yago Coelho Torres',                      'Coordenador Financeiro',           'Gestão',       'PJ',       5000.00,  'G5'),
    ('Amaury de Araújo Junior',                 'Coordenador de Operações',         'Gestão',       'PJ',       5200.00,  'G5'),
    ('Alda Lorena Cellos Andrade',              'Coordenadora de Integração',       'Ministerial',  'PJ',       5618.00,  'G8'),
    ('Mariane Gaia',                            'Coordenadora CBKids',              'Ministerial',  'PJ',       6618.00,  'G8'),
    ('Renata Cristina Martins Bispo',           'Coordenadora da Igreja Online',    'Criativo',     'PJ',       5618.00,  'G8'),
    ('Fatima do Rosário Garcia Pereira',        'Governanta',                       'Gestão',       'PJ',       5000.00,  'G8'),
    ('Filipe dos Santos Costa Carmet',          'Coordenador AMI',                  'Ministerial',  'PJ',       6618.00,  'G8'),
    ('Jessica Salviano',                        'Coordenadora de Voluntariado',     'Ministerial',  'PJ',       7018.00,  'G8'),
    ('Jose Ribamar dos Inocentes França',       'Encarregado de Infra',             'Gestão',       'PJ',       7787.50,  'G9'),
    ('Juliana Carneiro Leão Ramos',             'Coordenadora de RH',               'Gestão',       'CLT',      7852.83,  'G9'),
    ('David Silva da Conceição',                'Coordenador de Adoração',          'Criativo',     'CLT',     11020.99,  'G9'),
    ('Wesley Barros Ramos',                     'Coordenador de Cuidados',          'Ministerial',  'PREBENDA', 9588.16,  'G9'),
    ('Marcilio Nelio Paiva de Souza',           'Coordenador de Grupos/ CBA',       'Ministerial',  'PJ',      14720.00,  'G10'),
    ('Pedro Paulo Menezes',                     'Diretor Criativo',                 'Criativo',     'PJ+',      7500.00,  'G10'),
    ('Sonia Cristina Barreto Litwinczuk',       'Coordenadora de Compliance',       'Gestão',       'CLT',     14597.56,  'G10'),
    ('Arthur Serpa',                            'Diretor Ministerial',              'Ministerial',  'PJ+',     15000.00,  'G11'),
    ('Eduardo Francisco dos Santos Gnisci',     'Diretor Operacional',              'Gestão',       'PJ+',     22252.00,  'G15'),
    ('Pedro Luis Barreto Litwinczuk',           'Pastor Sênior',                    'Ministerial',  'PJ+',     49479.57,  'G22'),
    ('Pedro Luis Barreto Litwinczuk Júnior',    'Pastor Executivo',                 'Ministerial',  'PJ+',     28190.00,  'G17')
  ) AS t(nome, cargo, area, tipo_contrato, remuneracao, grau_codigo)
)
-- Insere os que ainda não existem
INSERT INTO public.rh_funcionarios (nome, cargo, area, tipo_contrato, salario, remuneracao_bruta, grau_id, data_enquadramento, data_admissao, status)
SELECT
  n.nome, n.cargo, n.area, n.tipo_contrato,
  CASE WHEN n.tipo_contrato = 'PJ+' THEN NULL ELSE n.remuneracao END,
  CASE WHEN n.tipo_contrato = 'PJ+' THEN n.remuneracao ELSE NULL END,
  g.id,
  current_date,
  current_date,
  'ativo'
FROM pcs2026 n
JOIN public.pcs_graus g ON g.codigo = n.grau_codigo
WHERE NOT EXISTS (
  SELECT 1 FROM public.rh_funcionarios f
  WHERE lower(btrim(f.nome)) = lower(btrim(n.nome))
);

-- Atualiza os existentes · preserva data_admissao, cpf, email, telefone, observacoes
UPDATE public.rh_funcionarios f
SET cargo               = n.cargo,
    area                = n.area,
    tipo_contrato       = n.tipo_contrato,
    grau_id             = g.id,
    data_enquadramento  = current_date,
    salario             = CASE WHEN n.tipo_contrato = 'PJ+' THEN NULL ELSE n.remuneracao END,
    remuneracao_bruta   = CASE WHEN n.tipo_contrato = 'PJ+' THEN n.remuneracao ELSE NULL END,
    status              = 'ativo'
FROM (VALUES
  ('Alba Maia Armelau','Auxiliar de Cozinha','Gestão','CLT',2022.48::numeric,'G1'),
  ('Maria Jane Pinto Rodrigues','Auxiliar de Cozinha','Gestão','CLT',2022.48,'G1'),
  ('Luzia Peron Ramos','Assistente CBKids','Ministerial','PJ',1621.00,'G1'),
  ('Alexandra Correa Xavier','Encarregado de Limpeza','Gestão','CLT',2359.56,'G2'),
  ('Arthur Cecconi','Assistente Ministerial','Ministerial','PJ',2120.00,'G2'),
  ('Cauã Pedreti da Cruz','Designer Junior','Criativo','PJ',2120.00,'G2'),
  ('Diego Assis','Assistente de TI','Gestão','PJ',2320.00,'G2'),
  ('Letícia Carvalho Baldner','Designer Junior','Criativo','PJ',2120.00,'G2'),
  ('Lorena Pariz Leonardo Queres','Social Media','Criativo','PJ',2600.00,'G2'),
  ('Milena Espinelo de Castro Rochet','Assistente Ministerial','Ministerial','PJ',2100.00,'G2'),
  ('Natasha Mauerberg Litwinczuk de Faria','Assistente Ministerial','Ministerial','PJ',2120.00,'G2'),
  ('Pery Magalhães Santos Casé','Assistente de Logística','Gestão','PJ',3020.00,'G2'),
  ('Andre Teixeira Rocha','Assistente de Produção','Criativo','PJ',3000.00,'G3'),
  ('Elionardo Alves Rodrigues','Assistente de Infraestrutura','Gestão','PJ',3400.00,'G3'),
  ('Erivelton Gomes Lima','Assistente de Almoxarifado','Gestão','CLT',3376.53,'G3'),
  ('Leonardo Pinto Ferreira','Assistente de Infraestrutura','Gestão','CLT',3376.53,'G3'),
  ('Nicolle Algaves Litwinczuk','Assistente Pastoral','Ministerial','PJ',2650.00,'G3'),
  ('Allan Santana da Silva','Produtor Audiovisual','Criativo','PJ',4000.00,'G4'),
  ('Francisco Jose Henrique de Sousa','Assistente Administrativo','Gestão','CLT',3843.46,'G4'),
  ('Marcos Paulo Domingues de Almeida','Coordenador de Infraestrutura','Gestão','PJ',4264.00,'G5'),
  ('Matheus Ribeiro Toscano','Coordenador de Inovações','Gestão','PJ',4264.00,'G5'),
  ('Pedro Fernandes Mendes','Coordenador de Produção','Criativo','PJ',4500.00,'G5'),
  ('Pedro Paiva','Coordenador de Marketing','Criativo','PJ',4000.00,'G5'),
  ('Yago Coelho Torres','Coordenador Financeiro','Gestão','PJ',5000.00,'G5'),
  ('Amaury de Araújo Junior','Coordenador de Operações','Gestão','PJ',5200.00,'G5'),
  ('Alda Lorena Cellos Andrade','Coordenadora de Integração','Ministerial','PJ',5618.00,'G8'),
  ('Mariane Gaia','Coordenadora CBKids','Ministerial','PJ',6618.00,'G8'),
  ('Renata Cristina Martins Bispo','Coordenadora da Igreja Online','Criativo','PJ',5618.00,'G8'),
  ('Fatima do Rosário Garcia Pereira','Governanta','Gestão','PJ',5000.00,'G8'),
  ('Filipe dos Santos Costa Carmet','Coordenador AMI','Ministerial','PJ',6618.00,'G8'),
  ('Jessica Salviano','Coordenadora de Voluntariado','Ministerial','PJ',7018.00,'G8'),
  ('Jose Ribamar dos Inocentes França','Encarregado de Infra','Gestão','PJ',7787.50,'G9'),
  ('Juliana Carneiro Leão Ramos','Coordenadora de RH','Gestão','CLT',7852.83,'G9'),
  ('David Silva da Conceição','Coordenador de Adoração','Criativo','CLT',11020.99,'G9'),
  ('Wesley Barros Ramos','Coordenador de Cuidados','Ministerial','PREBENDA',9588.16,'G9'),
  ('Marcilio Nelio Paiva de Souza','Coordenador de Grupos/ CBA','Ministerial','PJ',14720.00,'G10'),
  ('Pedro Paulo Menezes','Diretor Criativo','Criativo','PJ+',7500.00,'G10'),
  ('Sonia Cristina Barreto Litwinczuk','Coordenadora de Compliance','Gestão','CLT',14597.56,'G10'),
  ('Arthur Serpa','Diretor Ministerial','Ministerial','PJ+',15000.00,'G11'),
  ('Eduardo Francisco dos Santos Gnisci','Diretor Operacional','Gestão','PJ+',22252.00,'G15'),
  ('Pedro Luis Barreto Litwinczuk','Pastor Sênior','Ministerial','PJ+',49479.57,'G22'),
  ('Pedro Luis Barreto Litwinczuk Júnior','Pastor Executivo','Ministerial','PJ+',28190.00,'G17')
) AS n(nome, cargo, area, tipo_contrato, remuneracao, grau_codigo)
JOIN public.pcs_graus g ON g.codigo = n.grau_codigo
WHERE lower(btrim(f.nome)) = lower(btrim(n.nome));


-- ═════════════════════════════════════════════════════════════════════════
-- 6. PCS_PONTUACAO_COLABORADOR · avaliação dos 6 critérios + grau proposto
-- ═════════════════════════════════════════════════════════════════════════
-- Armazena a avaliação estrutural do PCS (não o ciclo anual de desempenho
-- que vive em rh_avaliacoes). Cada linha representa o enquadramento por
-- pontuação de um colaborador num ciclo PCS (ex: 'PCS 2026').

CREATE TABLE IF NOT EXISTS public.pcs_pontuacao_colaborador (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  funcionario_id          UUID NOT NULL REFERENCES public.rh_funcionarios(id) ON DELETE CASCADE,
  ciclo_referencia        TEXT NOT NULL DEFAULT 'PCS 2026',
  -- Nível selecionado (1-5) por critério · NULL = não avaliado
  nivel_formacao          INT CHECK (nivel_formacao         BETWEEN 1 AND 5),
  nivel_experiencia       INT CHECK (nivel_experiencia      BETWEEN 1 AND 5),
  nivel_complexidade      INT CHECK (nivel_complexidade     BETWEEN 1 AND 5),
  nivel_responsabilidade  INT CHECK (nivel_responsabilidade BETWEEN 1 AND 5),
  nivel_lideranca         INT CHECK (nivel_lideranca        BETWEEN 1 AND 5),
  nivel_competencias      INT CHECK (nivel_competencias     BETWEEN 1 AND 5),
  -- Pontos calculados (nivel × peso × 200) por critério
  pts_formacao            NUMERIC(6,2),  -- max 150
  pts_experiencia         NUMERIC(6,2),  -- max 200
  pts_complexidade        NUMERIC(6,2),  -- max 200
  pts_responsabilidade    NUMERIC(6,2),  -- max 200
  pts_lideranca           NUMERIC(6,2),  -- max 150
  pts_competencias        NUMERIC(6,2),  -- max 100
  pts_total               NUMERIC(7,2),  -- max 1000
  -- Grau proposto baseado na análise (Mapa Proposto)
  grau_proposto_id        UUID REFERENCES public.pcs_graus(id),
  -- Status da análise
  status_proposta         TEXT CHECK (status_proposta IN ('adequado','abaixo_minimo','acima_teto','abaixo_referencia','sem_dados')),
  gap_salarial            NUMERIC(12,2),
  delta_graus             INT,
  decisao_obs             TEXT,
  avaliado_em             DATE NOT NULL DEFAULT current_date,
  avaliado_por            UUID,
  avaliado_por_nome       TEXT,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (funcionario_id, ciclo_referencia)
);

ALTER TABLE public.pcs_pontuacao_colaborador ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "pcs_pontuacao_select" ON public.pcs_pontuacao_colaborador;
DROP POLICY IF EXISTS "pcs_pontuacao_write"  ON public.pcs_pontuacao_colaborador;
CREATE POLICY "pcs_pontuacao_select" ON public.pcs_pontuacao_colaborador FOR SELECT TO authenticated USING (true);
CREATE POLICY "pcs_pontuacao_write"  ON public.pcs_pontuacao_colaborador FOR ALL    TO authenticated USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_pcs_pontuacao_func   ON public.pcs_pontuacao_colaborador(funcionario_id);
CREATE INDEX IF NOT EXISTS idx_pcs_pontuacao_ciclo  ON public.pcs_pontuacao_colaborador(ciclo_referencia);
CREATE INDEX IF NOT EXISTS idx_pcs_pontuacao_grau_p ON public.pcs_pontuacao_colaborador(grau_proposto_id);

DROP TRIGGER IF EXISTS trg_pcs_pontuacao_touch ON public.pcs_pontuacao_colaborador;
CREATE TRIGGER trg_pcs_pontuacao_touch BEFORE UPDATE ON public.pcs_pontuacao_colaborador
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


-- ═════════════════════════════════════════════════════════════════════════
-- 7. SEED · pcs_pontuacao_colaborador com dados do PCS_2026.xlsx
-- ═════════════════════════════════════════════════════════════════════════
-- Para cada colaborador: nível por critério (1-5 ou NULL), grau proposto e
-- status. Pontos são derivados pelo backend (não duplicados aqui).
-- "Superior Cursando" e "Técnico / Sup. Cursando" → nivel 3 (mesma faixa)

WITH dados AS (
  SELECT * FROM (VALUES
    -- (nome, n_form, n_exp, n_cmpx, n_resp, n_lid, n_tec, grau_proposto, status, gap, delta_graus, obs)
    -- Níveis vêm da aba "Critérios PCS"; grau_proposto/gap/status vêm da aba "Mapa Proposto" (decisão de negócio).
    ('Alba Maia Armelau',                       3,    3,    2,    2,    2,    2,    'G7',  'abaixo_minimo',   -1988.41,  6, NULL),
    ('Maria Jane Pinto Rodrigues',              2,    4,    2,    2,    2,    2,    'G7',  'abaixo_minimo',   -1988.41,  6, NULL),
    ('Luzia Peron Ramos',                       3,    NULL, NULL, NULL, NULL, NULL, 'G9',  'abaixo_minimo',   -4114.57,  8, 'Critérios pendentes além da formação'),
    ('Alexandra Correa Xavier',                 2,    5,    2,    2,    2,    3,    'G8',  'abaixo_minimo',   -2854.59,  6, NULL),
    ('Arthur Cecconi',                          4,    3,    2,    2,    2,    3,    'G8',  'abaixo_minimo',   -3094.15,  6, NULL),
    ('Cauã Pedreti da Cruz',                    3,    3,    2,    2,    2,    3,    'G2',  'abaixo_referencia',   12.70,  0, 'Critérios sugerem G7 (490 pts); Mapa Proposto mantém G2 com salário abaixo da referência'),
    ('Diego Assis',                             3,    4,    2,    2,    3,    3,    'G9',  'abaixo_minimo',   -3415.57,  7, NULL),
    ('Letícia Carvalho Baldner',                3,    3,    2,    2,    2,    3,    'G7',  'abaixo_minimo',   -1890.89,  5, NULL),
    ('Lorena Pariz Leonardo Queres',            NULL, NULL, NULL, NULL, NULL, NULL, 'G10', 'abaixo_minimo',   -3709.13,  8, 'Critérios PCS pendentes'),
    ('Milena Espinelo de Castro Rochet',        4,    4,    2,    2,    3,    3,    'G9',  'abaixo_minimo',   -3635.57,  7, NULL),
    ('Natasha Mauerberg Litwinczuk de Faria',   NULL, NULL, NULL, NULL, NULL, NULL, 'G8',  'abaixo_minimo',   -3094.15,  6, 'Critérios PCS pendentes'),
    ('Pery Magalhães Santos Casé',              2,    3,    2,    2,    2,    2,    'G7',  'abaixo_minimo',    -990.89,  5, NULL),
    ('Andre Teixeira Rocha',                    NULL, 4,    3,    2,    2,    3,    'G9',  'abaixo_minimo',   -2735.57,  6, 'Formação não declarada · Mapa Proposto define G9'),
    ('Elionardo Alves Rodrigues',               1,    5,    2,    2,    2,    3,    'G8',  'abaixo_minimo',   -1814.15,  5, NULL),
    ('Erivelton Gomes Lima',                    NULL, NULL, NULL, NULL, NULL, NULL, 'G10', 'abaixo_minimo',   -2932.60,  7, 'Critérios PCS pendentes'),
    ('Leonardo Pinto Ferreira',                 NULL, NULL, NULL, NULL, NULL, NULL, 'G9',  'abaixo_minimo',   -2359.04,  6, 'Critérios PCS pendentes'),
    ('Nicolle Algaves Litwinczuk',              5,    5,    4,    2,    3,    3,    'G12', 'abaixo_minimo',   -6372.05,  9, NULL),
    ('Allan Santana da Silva',                  NULL, NULL, NULL, NULL, NULL, NULL, 'G10', 'abaixo_minimo',   -2309.13,  6, 'Critérios PCS pendentes'),
    ('Francisco Jose Henrique de Sousa',        2,    5,    2,    2,    2,    3,    'G8',  'abaixo_minimo',   -1370.69,  4, NULL),
    ('Marcos Paulo Domingues de Almeida',       NULL, NULL, NULL, NULL, NULL, NULL, 'G10', 'abaixo_minimo',   -2045.13,  5, 'Critérios PCS pendentes'),
    ('Matheus Ribeiro Toscano',                 3,    3,    3,    3,    4,    3,    'G10', 'abaixo_minimo',   -2045.13,  5, NULL),
    ('Pedro Fernandes Mendes',                  NULL, NULL, NULL, NULL, NULL, NULL, 'G11', 'abaixo_minimo',   -3701.86,  6, 'Critérios PCS pendentes'),
    ('Pedro Paiva',                             3,    4,    4,    3,    4,    3,    'G11', 'abaixo_minimo',   -4201.86,  6, NULL),
    ('Yago Coelho Torres',                      4,    3,    4,    3,    4,    3,    'G11', 'abaixo_minimo',   -3201.86,  6, NULL),
    ('Amaury de Araújo Junior',                 NULL, NULL, NULL, NULL, NULL, NULL, 'G12', 'abaixo_minimo',   -3822.05,  7, 'Critérios PCS pendentes'),
    ('Alda Lorena Cellos Andrade',              3,    4,    4,    3,    4,    3,    'G11', 'abaixo_minimo',   -2583.86,  3, NULL),
    ('Mariane Gaia',                            5,    5,    4,    3,    4,    4,    'G13', 'abaixo_minimo',   -3306.25,  5, NULL),
    ('Renata Cristina Martins Bispo',           NULL, NULL, NULL, NULL, NULL, NULL, 'G11', 'abaixo_minimo',   -2583.86,  3, 'Critérios PCS pendentes'),
    ('Fatima do Rosário Garcia Pereira',        4,    5,    2,    3,    3,    3,    'G8',  'abaixo_minimo',    -214.15,  0, 'Critérios sugerem G10 (670 pts); Mapa Proposto mantém G8 com salário abaixo do mínimo'),
    ('Filipe dos Santos Costa Carmet',          NULL, NULL, NULL, NULL, NULL, NULL, 'G8',  'adequado',         1403.85,  0, 'Critérios PCS pendentes · adequado em G8'),
    ('Jessica Salviano',                        4,    3,    4,    3,    4,    3,    'G11', 'abaixo_minimo',   -1183.86,  3, NULL),
    ('Jose Ribamar dos Inocentes França',       NULL, NULL, NULL, NULL, NULL, NULL, 'G11', 'abaixo_minimo',    -414.36,  2, 'Critérios PCS pendentes'),
    ('Juliana Carneiro Leão Ramos',             NULL, NULL, NULL, NULL, NULL, NULL, 'G13', 'abaixo_minimo',   -2071.42,  4, 'Critérios PCS pendentes'),
    ('David Silva da Conceição',                NULL, 5,    4,    3,    4,    5,    'G13', 'adequado',         1096.74,  4, 'Formação não declarada · adequado'),
    ('Wesley Barros Ramos',                     5,    5,    4,    3,    4,    4,    'G13', 'abaixo_minimo',    -336.09,  4, NULL),
    ('Marcilio Nelio Paiva de Souza',           NULL, NULL, NULL, NULL, NULL, NULL, 'G13', 'adequado',         4795.75,  3, 'Critérios PCS pendentes · adequado em G13'),
    ('Pedro Paulo Menezes',                     4,    5,    4,    4,    5,    5,    'G14', 'abaixo_minimo',   -5401.53,  4, NULL),
    ('Sonia Cristina Barreto Litwinczuk',       NULL, NULL, NULL, NULL, NULL, NULL, 'G10', 'acima_teto',       8288.43,  0, 'Critérios PCS pendentes · acima do teto'),
    ('Arthur Serpa',                            5,    5,    5,    4,    5,    4,    'G17', 'abaixo_minimo',   -5294.11,  6, NULL),
    ('Eduardo Francisco dos Santos Gnisci',     5,    5,    5,    4,    5,    5,    'G18', 'abaixo_minimo',     -71.52,  3, NULL),
    ('Pedro Luis Barreto Litwinczuk',           5,    5,    5,    5,    4,    5,    'G22', 'adequado',        10853.18,  0, 'Critérios sugerem G19 (970 pts); Mapa Proposto mantém G22 por status pastoral'),
    ('Pedro Luis Barreto Litwinczuk Júnior',    4,    4,    5,    5,    5,    3,    'G17', 'adequado',         7895.89,  0, 'Critérios sugerem G14 (890 pts); Mapa Proposto mantém G17 por status pastoral')
  ) AS d(nome, n_form, n_exp, n_cmpx, n_resp, n_lid, n_tec, grau_prop, status, gap, delta_graus, obs)
)
INSERT INTO public.pcs_pontuacao_colaborador (
  funcionario_id, ciclo_referencia,
  nivel_formacao, nivel_experiencia, nivel_complexidade,
  nivel_responsabilidade, nivel_lideranca, nivel_competencias,
  pts_formacao, pts_experiencia, pts_complexidade,
  pts_responsabilidade, pts_lideranca, pts_competencias, pts_total,
  grau_proposto_id, status_proposta, gap_salarial, delta_graus, decisao_obs,
  avaliado_em
)
SELECT
  f.id, 'PCS 2026',
  d.n_form, d.n_exp, d.n_cmpx, d.n_resp, d.n_lid, d.n_tec,
  -- pts = nivel × peso × 200 (escala 0-1000); NULL se critério não avaliado
  CASE WHEN d.n_form IS NULL THEN NULL ELSE (d.n_form * 0.15 * 200)::numeric(6,2) END,
  CASE WHEN d.n_exp  IS NULL THEN NULL ELSE (d.n_exp  * 0.20 * 200)::numeric(6,2) END,
  CASE WHEN d.n_cmpx IS NULL THEN NULL ELSE (d.n_cmpx * 0.20 * 200)::numeric(6,2) END,
  CASE WHEN d.n_resp IS NULL THEN NULL ELSE (d.n_resp * 0.20 * 200)::numeric(6,2) END,
  CASE WHEN d.n_lid  IS NULL THEN NULL ELSE (d.n_lid  * 0.15 * 200)::numeric(6,2) END,
  CASE WHEN d.n_tec  IS NULL THEN NULL ELSE (d.n_tec  * 0.10 * 200)::numeric(6,2) END,
  -- pts_total = soma dos pts avaliados; NULL se nenhum critério avaliado
  CASE
    WHEN d.n_form IS NULL AND d.n_exp IS NULL AND d.n_cmpx IS NULL
     AND d.n_resp IS NULL AND d.n_lid IS NULL AND d.n_tec IS NULL
    THEN NULL
    ELSE ((COALESCE(d.n_form, 0) * 0.15 + COALESCE(d.n_exp, 0) * 0.20
        + COALESCE(d.n_cmpx, 0) * 0.20 + COALESCE(d.n_resp, 0) * 0.20
        + COALESCE(d.n_lid, 0) * 0.15 + COALESCE(d.n_tec, 0) * 0.10) * 200)::numeric(7,2)
  END,
  g.id,
  d.status,
  d.gap,
  d.delta_graus,
  d.obs,
  current_date
FROM dados d
JOIN public.rh_funcionarios f ON lower(btrim(f.nome)) = lower(btrim(d.nome))
LEFT JOIN public.pcs_graus g ON g.codigo = d.grau_prop
ON CONFLICT (funcionario_id, ciclo_referencia) DO UPDATE SET
  nivel_formacao         = EXCLUDED.nivel_formacao,
  nivel_experiencia      = EXCLUDED.nivel_experiencia,
  nivel_complexidade     = EXCLUDED.nivel_complexidade,
  nivel_responsabilidade = EXCLUDED.nivel_responsabilidade,
  nivel_lideranca        = EXCLUDED.nivel_lideranca,
  nivel_competencias     = EXCLUDED.nivel_competencias,
  pts_formacao           = EXCLUDED.pts_formacao,
  pts_experiencia        = EXCLUDED.pts_experiencia,
  pts_complexidade       = EXCLUDED.pts_complexidade,
  pts_responsabilidade   = EXCLUDED.pts_responsabilidade,
  pts_lideranca          = EXCLUDED.pts_lideranca,
  pts_competencias       = EXCLUDED.pts_competencias,
  pts_total              = EXCLUDED.pts_total,
  grau_proposto_id       = EXCLUDED.grau_proposto_id,
  status_proposta        = EXCLUDED.status_proposta,
  gap_salarial           = EXCLUDED.gap_salarial,
  delta_graus            = EXCLUDED.delta_graus,
  decisao_obs            = EXCLUDED.decisao_obs,
  updated_at             = now();


-- ═════════════════════════════════════════════════════════════════════════
-- 8. VIEW vw_pcs_proposta · análise consolidada (grau atual × proposto)
-- ═════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE VIEW public.vw_pcs_proposta AS
SELECT
  f.id                                AS funcionario_id,
  f.nome,
  f.cargo,
  f.area,
  f.tipo_contrato,
  f.status,
  -- Grau atual
  f.grau_id                           AS grau_atual_id,
  ga.codigo                           AS grau_atual_codigo,
  ga.nivel                            AS grau_atual_nivel,
  ga.categoria                        AS grau_atual_categoria,
  ga.faixa_min                        AS grau_atual_faixa_min,
  ga.faixa_ref                        AS grau_atual_faixa_ref,
  ga.faixa_max                        AS grau_atual_faixa_max,
  -- Remuneração efetiva
  COALESCE(
    CASE WHEN f.tipo_contrato = 'PJ+' THEN f.remuneracao_bruta ELSE NULL END,
    f.salario,
    f.remuneracao_bruta
  )                                   AS remuneracao_efetiva,
  -- Pontuação
  p.nivel_formacao,
  p.nivel_experiencia,
  p.nivel_complexidade,
  p.nivel_responsabilidade,
  p.nivel_lideranca,
  p.nivel_competencias,
  p.pts_formacao,
  p.pts_experiencia,
  p.pts_complexidade,
  p.pts_responsabilidade,
  p.pts_lideranca,
  p.pts_competencias,
  p.pts_total,
  -- Grau proposto
  p.grau_proposto_id,
  gp.codigo                           AS grau_proposto_codigo,
  gp.nivel                            AS grau_proposto_nivel,
  gp.categoria                        AS grau_proposto_categoria,
  gp.faixa_min                        AS grau_proposto_faixa_min,
  gp.faixa_ref                        AS grau_proposto_faixa_ref,
  gp.faixa_max                        AS grau_proposto_faixa_max,
  p.status_proposta,
  p.gap_salarial,
  p.delta_graus,
  p.decisao_obs,
  p.ciclo_referencia,
  p.avaliado_em
FROM public.rh_funcionarios f
LEFT JOIN public.pcs_graus ga ON ga.id = f.grau_id
LEFT JOIN public.pcs_pontuacao_colaborador p
  ON p.funcionario_id = f.id AND p.ciclo_referencia = 'PCS 2026'
LEFT JOIN public.pcs_graus gp ON gp.id = p.grau_proposto_id
WHERE f.status = 'ativo';


COMMIT;
