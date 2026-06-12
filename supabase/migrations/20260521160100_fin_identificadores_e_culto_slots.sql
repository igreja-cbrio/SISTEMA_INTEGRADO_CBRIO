-- Estrutura fiscal · Identificadores de centavo + Slots de culto
-- Identificador de centavo: cadastrado pelo admin · so pra destinos especiais (campanhas/missoes/acao social)
-- Slots de culto: definem janela horaria por dia da semana · usado na classificacao automatica

-- ============================================================
-- 1. IDENTIFICADORES DE CENTAVO (config dinamica)
-- ============================================================
CREATE TABLE IF NOT EXISTS fin_identificadores_centavo (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  centavo char(2) NOT NULL UNIQUE,
  plano_contas_id uuid NOT NULL REFERENCES fin_plano_contas(id) ON DELETE RESTRICT,
  centro_custo_id uuid REFERENCES fin_centros_custo(id) ON DELETE SET NULL,
  descricao text NOT NULL,
  ativo boolean NOT NULL DEFAULT true,
  observacao text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES profiles(id)
);

CREATE INDEX IF NOT EXISTS fin_identificadores_ativo_idx ON fin_identificadores_centavo(ativo);

-- Seed dos 3 identificadores existentes (Templo, Bazar, Acao Social)
INSERT INTO fin_identificadores_centavo (centavo, plano_contas_id, centro_custo_id, descricao)
SELECT '17', pc.id, cc.id, 'Templo · campanha do templo'
FROM fin_plano_contas pc
LEFT JOIN fin_centros_custo cc ON cc.codigo = '0.01.06.03'
WHERE pc.codigo = '3.02.01.01'
ON CONFLICT (centavo) DO NOTHING;

INSERT INTO fin_identificadores_centavo (centavo, plano_contas_id, centro_custo_id, descricao)
SELECT '22', pc.id, cc.id, 'Bazar · missoes'
FROM fin_plano_contas pc
LEFT JOIN fin_centros_custo cc ON cc.codigo = '0.01.03.02.06.03'
WHERE pc.codigo = '3.02.03.02'
ON CONFLICT (centavo) DO NOTHING;

INSERT INTO fin_identificadores_centavo (centavo, plano_contas_id, centro_custo_id, descricao)
SELECT '31', pc.id, cc.id, 'Acao Social'
FROM fin_plano_contas pc
LEFT JOIN fin_centros_custo cc ON cc.codigo = '0.01.03.02.04.02'
WHERE pc.codigo = '3.02.03.01'
ON CONFLICT (centavo) DO NOTHING;

-- ============================================================
-- 2. SLOTS DE CULTO (janelas horarias pra classificacao por culto)
-- ============================================================
CREATE TABLE IF NOT EXISTS fin_culto_slots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  dia_semana int NOT NULL CHECK (dia_semana BETWEEN 0 AND 6),
  hora_inicio time NOT NULL,
  hora_fim time NOT NULL,
  hora_fim_proximo_dia boolean NOT NULL DEFAULT false,
  plano_contas_dizimo_id uuid REFERENCES fin_plano_contas(id),
  plano_contas_oferta_id uuid REFERENCES fin_plano_contas(id),
  service_type_slug text,
  ativo boolean NOT NULL DEFAULT true,
  ordem int DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS fin_culto_slots_dia_idx ON fin_culto_slots(dia_semana, hora_inicio) WHERE ativo;

-- Seed dos 7 slots de culto
-- Janelas pensadas pra nao se sobrepor + capturar pix de chegada e saida
WITH d AS (
  SELECT
    (SELECT id FROM fin_plano_contas WHERE codigo='3.01.01.08') AS diz_8h30,
    (SELECT id FROM fin_plano_contas WHERE codigo='3.01.02.08') AS ofe_8h30,
    (SELECT id FROM fin_plano_contas WHERE codigo='3.01.01.09') AS diz_10h,
    (SELECT id FROM fin_plano_contas WHERE codigo='3.01.02.09') AS ofe_10h,
    (SELECT id FROM fin_plano_contas WHERE codigo='3.01.01.02') AS diz_11h30,
    (SELECT id FROM fin_plano_contas WHERE codigo='3.01.02.02') AS ofe_11h30,
    (SELECT id FROM fin_plano_contas WHERE codigo='3.01.01.03') AS diz_noite,
    (SELECT id FROM fin_plano_contas WHERE codigo='3.01.02.03') AS ofe_noite,
    (SELECT id FROM fin_plano_contas WHERE codigo='3.01.01.06') AS diz_quarta,
    (SELECT id FROM fin_plano_contas WHERE codigo='3.01.02.06') AS ofe_quarta,
    (SELECT id FROM fin_plano_contas WHERE codigo='3.01.01.05') AS diz_jovens,
    (SELECT id FROM fin_plano_contas WHERE codigo='3.01.02.05') AS ofe_jovens,
    (SELECT id FROM fin_plano_contas WHERE codigo='3.01.01.01') AS diz_kids,
    (SELECT id FROM fin_plano_contas WHERE codigo='3.01.02.01') AS ofe_kids
)
INSERT INTO fin_culto_slots (nome, dia_semana, hora_inicio, hora_fim, hora_fim_proximo_dia, plano_contas_dizimo_id, plano_contas_oferta_id, service_type_slug, ordem)
SELECT * FROM (VALUES
  ('Domingo 8:30',      0, time '06:00', time '09:30', false, (SELECT diz_8h30 FROM d),   (SELECT ofe_8h30 FROM d),   'domingo-8h30',  10),
  ('Domingo 10:00',     0, time '09:30', time '11:00', false, (SELECT diz_10h FROM d),    (SELECT ofe_10h FROM d),    'domingo-10h',   20),
  ('Domingo 11:30',     0, time '11:00', time '14:00', false, (SELECT diz_11h30 FROM d),  (SELECT ofe_11h30 FROM d),  'domingo-11h30', 30),
  ('Domingo Noite',     0, time '14:00', time '23:59', false, (SELECT diz_noite FROM d),  (SELECT ofe_noite FROM d),  'domingo-19h',   40),
  ('Quarta com Deus',   3, time '18:00', time '23:59', false, (SELECT diz_quarta FROM d), (SELECT ofe_quarta FROM d), 'quarta-com-deus', 50),
  ('AMI (Sabado)',      6, time '17:00', time '02:00', true,  (SELECT diz_jovens FROM d), (SELECT ofe_jovens FROM d), 'ami',           60),
  ('Bridge (Sabado)',   6, time '14:00', time '17:00', false, (SELECT diz_jovens FROM d), (SELECT ofe_jovens FROM d), 'bridge',        70)
) AS v(nome, dia_semana, hora_inicio, hora_fim, hora_fim_proximo_dia, plano_contas_dizimo_id, plano_contas_oferta_id, service_type_slug, ordem)
WHERE NOT EXISTS (
  SELECT 1 FROM fin_culto_slots WHERE service_type_slug = v.service_type_slug
);

-- ============================================================
-- 3. FUNCAO · identifica o slot de culto a partir de datetime
-- ============================================================
-- Recebe um timestamp ja em BRT (sem timezone · interpretado como local)
-- e retorna o id do slot. NULL se nao bate em nenhum.
CREATE OR REPLACE FUNCTION fin_identifica_culto(p_datetime timestamp without time zone)
RETURNS uuid
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_dia int;
  v_hora time;
  v_slot_id uuid;
BEGIN
  v_dia := EXTRACT(DOW FROM p_datetime)::int;
  v_hora := p_datetime::time;

  -- Caso 1: janela termina no mesmo dia
  SELECT id INTO v_slot_id
  FROM fin_culto_slots
  WHERE ativo
    AND dia_semana = v_dia
    AND NOT hora_fim_proximo_dia
    AND v_hora >= hora_inicio
    AND v_hora < hora_fim
  ORDER BY ordem LIMIT 1;

  IF v_slot_id IS NOT NULL THEN
    RETURN v_slot_id;
  END IF;

  -- Caso 2: janela termina no proximo dia (ex: AMI 19h -> 02h)
  -- Mesmo dia, hora >= hora_inicio
  SELECT id INTO v_slot_id
  FROM fin_culto_slots
  WHERE ativo
    AND dia_semana = v_dia
    AND hora_fim_proximo_dia
    AND v_hora >= hora_inicio
  ORDER BY ordem LIMIT 1;

  IF v_slot_id IS NOT NULL THEN
    RETURN v_slot_id;
  END IF;

  -- Caso 3: dia seguinte de uma janela que cruza meia-noite
  SELECT id INTO v_slot_id
  FROM fin_culto_slots
  WHERE ativo
    AND dia_semana = ((v_dia - 1) + 7) % 7
    AND hora_fim_proximo_dia
    AND v_hora < hora_fim
  ORDER BY ordem LIMIT 1;

  RETURN v_slot_id;
END;
$$;

-- ============================================================
-- 4. FUNCAO · extrai datetime BRT do End-to-End ID PIX
-- ============================================================
-- Formato do ID: E[ISPB 8][YYYY 4][MM 2][DD 2][HH 2][MI 2][suffix 11]
-- HH:MI esta em UTC · subtrai 3h pra obter BRT
CREATE OR REPLACE FUNCTION fin_extrai_datetime_pix(p_e2e_id text)
RETURNS timestamp without time zone
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_yyyy text;
  v_mm text;
  v_dd text;
  v_hh text;
  v_mi text;
  v_utc timestamp without time zone;
BEGIN
  -- ID precisa ter 32 chars e comecar com E
  IF p_e2e_id IS NULL OR length(p_e2e_id) < 21 OR substring(p_e2e_id FROM 1 FOR 1) != 'E' THEN
    RETURN NULL;
  END IF;

  v_yyyy := substring(p_e2e_id FROM 10 FOR 4);
  v_mm   := substring(p_e2e_id FROM 14 FOR 2);
  v_dd   := substring(p_e2e_id FROM 16 FOR 2);
  v_hh   := substring(p_e2e_id FROM 18 FOR 2);
  v_mi   := substring(p_e2e_id FROM 20 FOR 2);

  -- Tenta montar timestamp. Se falhar (string invalida), retorna NULL.
  BEGIN
    v_utc := to_timestamp(v_yyyy || '-' || v_mm || '-' || v_dd || ' ' || v_hh || ':' || v_mi, 'YYYY-MM-DD HH24:MI')::timestamp;
  EXCEPTION WHEN OTHERS THEN
    RETURN NULL;
  END;

  -- Subtrai 3h pra obter BRT (Brasil UTC-3 fixo desde fim do DST em 2019)
  RETURN v_utc - interval '3 hours';
END;
$$;

-- ============================================================
-- 5. FUNCAO · semana qua-ter (ciclo financeiro CBRio)
-- ============================================================
-- Retorna inicio (quarta) e fim (terca seguinte) da semana qua-ter que contem a data
CREATE OR REPLACE FUNCTION fin_semana_qua_ter(p_data date)
RETURNS TABLE (inicio date, fim date, label text)
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_dow int;
  v_inicio date;
BEGIN
  -- DOW: 0=Dom 1=Seg 2=Ter 3=Qua 4=Qui 5=Sex 6=Sab
  v_dow := EXTRACT(DOW FROM p_data)::int;

  -- Calcula a quarta da semana
  -- Se hoje eh Qua (3), inicio = hoje
  -- Se hoje eh Qui (4), inicio = ontem (Qua)
  -- Se hoje eh Ter (2), inicio = Qua passada (-6 dias)
  IF v_dow >= 3 THEN
    v_inicio := p_data - ((v_dow - 3) || ' days')::interval;
  ELSE
    v_inicio := p_data - ((v_dow + 4) || ' days')::interval;
  END IF;

  inicio := v_inicio;
  fim := v_inicio + interval '6 days';
  label := to_char(v_inicio, 'DD/MM') || ' - ' || to_char(v_inicio + interval '6 days', 'DD/MM');
  RETURN NEXT;
END;
$$;

COMMIT;
