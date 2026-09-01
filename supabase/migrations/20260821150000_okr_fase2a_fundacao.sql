-- ============================================================================
-- OKR · FASE 2A · FUNDAÇÃO (2026-08-21)
--
-- Contexto: os 637 KRs foram desativados em 21/08 (migration 20260821130000).
-- O desenho novo ("O Motor e os Anéis", 19/08) tem 3 peças, e esta migration
-- entrega as três fundações — sem tela nova de cadastro estratégico:
--
--   1. LINHAGEM nos KPIs táticos  · etiqueta de LEITURA (nsm | jornada | sistema)
--   2. OKRs DE CICLO              · a camada que substitui os KRs (trimestral,
--                                    com dono, delta pactuado, morre no fim)
--   3. ÍNDICE DA BASE             · agregação DERIVADA (função · nunca cadastro)
--
-- ⚠️ NÃO recria KRs no formato antigo. `kpi_krs` segue 100% inativa e as telas
--    que a leem seguem funcionando com lista vazia (ver seção "KRs · camada
--    DESATIVADA em massa" no CLAUDE.md).
--
-- Aditiva e idempotente. Nenhuma tabela existente perde coluna ou constraint.
-- ============================================================================

-- ============================================================================
-- PARTE 1 · kpi_indicadores_taticos.linhagem
-- ============================================================================
-- ⚠️ A etiqueta responde: "este indicador descreve o FUNIL da NSM
-- (conversão → engajamento), a BASE engajada (Índice), ou é operação do
-- sistema?". É agrupamento de LEITURA — a fórmula literal de cada agregado
-- vive na view/função dele (`recalcular_nsm`, `fn_indice_engajamento_base`),
-- nunca na soma desta coluna. Confundir as duas coisas produziria contagem
-- dupla, que é o erro dos 637 KRs.
--
-- DEFAULT 'sistema' é fail-safe deliberado: KPI novo NÃO entra em agregado
-- nenhum até alguém decidir que ele pertence ali.

ALTER TABLE public.kpi_indicadores_taticos
  ADD COLUMN IF NOT EXISTS linhagem text NOT NULL DEFAULT 'sistema';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.kpi_indicadores_taticos'::regclass
       AND conname  = 'chk_kpi_taticos_linhagem'
  ) THEN
    ALTER TABLE public.kpi_indicadores_taticos
      ADD CONSTRAINT chk_kpi_taticos_linhagem
      CHECK (linhagem IN ('nsm', 'jornada', 'sistema'));
  END IF;
END $$;

COMMENT ON COLUMN public.kpi_indicadores_taticos.linhagem IS
  'Etiqueta de LEITURA (Motor e os Anéis · 19/08): nsm = descreve o funil '
  'conversão→engajamento · jornada = descreve a base engajada (Índice da Base) · '
  'sistema = operação (default). NÃO é fórmula: os agregados são calculados por '
  'recalcular_nsm() e fn_indice_engajamento_base(). Somar KPIs por esta coluna '
  'produz contagem dupla.';

CREATE INDEX IF NOT EXISTS idx_kpi_taticos_linhagem
  ON public.kpi_indicadores_taticos (linhagem)
  WHERE deleted_at IS NULL AND ativo = true;

-- ---------------------------------------------------------------------------
-- Backfill MECÂNICO (ids conferidos no banco vivo em 21/08 · não decorados)
-- ---------------------------------------------------------------------------
-- 'nsm' · os marcos do funil de 90 dias + a boca do funil (conversões)
UPDATE public.kpi_indicadores_taticos
   SET linhagem = 'nsm'
 WHERE linhagem = 'sistema'
   AND (
        id LIKE '%BAT90'                       -- 4 áreas · batismo ≤90d
     OR id LIKE '%NEXT90'                      -- 4 áreas · Next ≤90d
     OR id IN ('AMI-21','SED-17','BRG-19','ONL-04')  -- reunião aceita (coorte)
     OR fonte_auto LIKE '%conv%'               -- crescimento de conversões
   );

-- ⚠️ KIDS-19 ("% solicitações de novos convertidos atendidas") fica FORA de
-- propósito: decisão Kids está fora da NSM por desenho (a jornada não avança
-- para a criança · trigger pula membro/trilha/nsm_eventos). Marcá-lo como
-- 'nsm' faria a tela agrupar um funil que não existe.

-- 'jornada' · descrevem a BASE engajada (um por valor, onde há KPI)
UPDATE public.kpi_indicadores_taticos
   SET linhagem = 'jornada'
 WHERE linhagem = 'sistema'
   AND id IN (
     'DEV-01','DEV-02','DEV-03',                          -- investir
     'AMI-14','BRG-13','KIDS-13','ONL-16','SED-09',       -- servir
     'SED-01','ONL-23','BRG-06','KIDS-06','AMI-07'        -- generosidade
   );

-- ⚠️ CONECTAR e SEGUIR não recebem etiqueta porque NÃO EXISTE KPI tático de
-- "% da base em grupo" nem de "% da base batizada" (conferido em 21/08). É
-- justamente por isso que o Índice da Base é função DERIVADA e não soma de
-- KPIs — ele lê a matview de pessoas direto. Criar esses dois KPIs é decisão
-- da fase 2B, não efeito colateral desta migration.


-- ============================================================================
-- PARTE 2 · OKRs DE CICLO (a camada que substitui os KRs)
-- ============================================================================
-- Diferença que justifica tabela nova em vez de reusar `kpi_krs`:
--   · tem CICLO (nasce e MORRE) — o KR antigo era permanente
--   · tem DONO que pactuou — o KR antigo era cascateado por ×1,30
--   · o KR é um DELTA sobre um KPI vivo (de X para Y), não uma frase de meta
--   · fecha com nota + aprendizado (o rito da reunião de OKR)

CREATE TABLE IF NOT EXISTS public.okr_ciclos (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome        text NOT NULL,                    -- "3º trimestre 2026"
  inicio      date NOT NULL,
  fim         date NOT NULL,
  status      text NOT NULL DEFAULT 'aberto',
  observacoes text,
  criado_por  uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_okr_ciclos_status CHECK (status IN ('aberto','fechado')),
  CONSTRAINT chk_okr_ciclos_periodo CHECK (fim >= inicio)
);

COMMENT ON TABLE public.okr_ciclos IS
  'Ciclo de OKR (trimestral). Substitui a camada kpi_krs, desativada em '
  '21/08/2026. Ciclo fechado é histórico — não se apaga.';

-- Só UM ciclo aberto por vez: dois abertos fariam "o ciclo atual" virar
-- pergunta sem resposta em toda tela e em todo relatório.
-- ⚠️ Índice PARCIAL ⇒ `ON CONFLICT` NÃO infere (lei de 04/08). Abrir ciclo novo
-- FECHA o anterior num UPDATE explícito antes do INSERT — nunca por upsert.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_okr_ciclo_aberto
  ON public.okr_ciclos (status) WHERE status = 'aberto';

CREATE TABLE IF NOT EXISTS public.okr_ciclo_krs (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ciclo_id       uuid NOT NULL REFERENCES public.okr_ciclos(id) ON DELETE CASCADE,
  objetivo_texto text NOT NULL,                 -- o Objetivo, em uma frase
  kpi_id         text REFERENCES public.kpi_indicadores_taticos(id) ON DELETE SET NULL,
  dono_id        uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  baseline       numeric,                       -- de onde parte
  alvo           numeric,                       -- para onde vai
  unidade        text,
  direcao        text NOT NULL DEFAULT 'maior_melhor',
  status         text NOT NULL DEFAULT 'ativo',
  nota_final     numeric,                       -- 0..1 (padrão OKR)
  aprendizado    text,
  ordem          int NOT NULL DEFAULT 0,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_okr_ciclo_krs_direcao CHECK (direcao IN ('maior_melhor','menor_melhor')),
  CONSTRAINT chk_okr_ciclo_krs_status  CHECK (status IN ('ativo','concluido','abandonado')),
  CONSTRAINT chk_okr_ciclo_krs_nota    CHECK (nota_final IS NULL OR (nota_final >= 0 AND nota_final <= 1))
);

COMMENT ON TABLE public.okr_ciclo_krs IS
  'KR de ciclo = DELTA pactuado sobre um KPI vivo (baseline → alvo), com dono '
  'e prazo. Medição vem por join com vw_kpi_trajetoria_atual — esta tabela '
  'NUNCA guarda valor apurado (era um dos erros da camada kpi_krs).';

COMMENT ON COLUMN public.okr_ciclo_krs.dono_id IS
  'FK para profiles (lei nº 3 · responsável por UUID, nunca TEXT livre). O NOME '
  'vem do join na leitura — guardar snapshot de nome poria PII numa tabela de '
  'estrutura e envelheceria a cada renomeação.';

COMMENT ON COLUMN public.okr_ciclo_krs.direcao IS
  'Vocabulário IDÊNTICO ao de kpi_indicadores_taticos.sentido_meta '
  '(maior_melhor | menor_melhor) — o farol do KR compara contra o alvo DELE, e '
  'divergir de vocabulário faria KR de prazo/churn ficar verde ao estourar.';

CREATE INDEX IF NOT EXISTS idx_okr_ciclo_krs_ciclo ON public.okr_ciclo_krs (ciclo_id, ordem);
CREATE INDEX IF NOT EXISTS idx_okr_ciclo_krs_kpi   ON public.okr_ciclo_krs (kpi_id) WHERE kpi_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_okr_ciclo_krs_dono  ON public.okr_ciclo_krs (dono_id) WHERE dono_id IS NOT NULL;

-- updated_at
CREATE OR REPLACE FUNCTION public.fn_okr_ciclo_touch()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_okr_ciclos_touch ON public.okr_ciclos;
CREATE TRIGGER trg_okr_ciclos_touch BEFORE UPDATE ON public.okr_ciclos
  FOR EACH ROW EXECUTE FUNCTION public.fn_okr_ciclo_touch();

DROP TRIGGER IF EXISTS trg_okr_ciclo_krs_touch ON public.okr_ciclo_krs;
CREATE TRIGGER trg_okr_ciclo_krs_touch BEFORE UPDATE ON public.okr_ciclo_krs
  FOR EACH ROW EXECUTE FUNCTION public.fn_okr_ciclo_touch();

-- ---------------------------------------------------------------------------
-- RLS · leitura para quem abre /gestao · escrita só admin do módulo
-- ---------------------------------------------------------------------------
ALTER TABLE public.okr_ciclos     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.okr_ciclo_krs  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS okr_ciclos_select     ON public.okr_ciclos;
DROP POLICY IF EXISTS okr_ciclos_write      ON public.okr_ciclos;
DROP POLICY IF EXISTS okr_ciclos_service    ON public.okr_ciclos;
DROP POLICY IF EXISTS okr_ciclo_krs_select  ON public.okr_ciclo_krs;
DROP POLICY IF EXISTS okr_ciclo_krs_write   ON public.okr_ciclo_krs;
DROP POLICY IF EXISTS okr_ciclo_krs_service ON public.okr_ciclo_krs;

CREATE POLICY okr_ciclos_select ON public.okr_ciclos
  FOR SELECT TO authenticated
  USING (public.current_user_module_level('gestao') >= 1 OR public.is_super_admin());

-- ⚠️ Escrita é SÓ super-admin na RLS, e não "nível 5 em gestao": quem escreve
-- de verdade é o BACKEND com service_role, atrás de authorize('admin','diretor').
-- Ampliar o que a anon key do bundle alcança sem nenhum cliente precisar é
-- exatamente a armadilha da lei nº 11.
CREATE POLICY okr_ciclos_write ON public.okr_ciclos
  FOR ALL TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

CREATE POLICY okr_ciclos_service ON public.okr_ciclos
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY okr_ciclo_krs_select ON public.okr_ciclo_krs
  FOR SELECT TO authenticated
  USING (public.current_user_module_level('gestao') >= 1 OR public.is_super_admin());

CREATE POLICY okr_ciclo_krs_write ON public.okr_ciclo_krs
  FOR ALL TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

CREATE POLICY okr_ciclo_krs_service ON public.okr_ciclo_krs
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Audit: mudança de dono, alvo e nota é decisão de gestão que se revisita
DROP TRIGGER IF EXISTS trg_audit_okr_ciclo_krs ON public.okr_ciclo_krs;
CREATE TRIGGER trg_audit_okr_ciclo_krs
AFTER INSERT OR UPDATE OR DELETE ON public.okr_ciclo_krs
FOR EACH ROW EXECUTE FUNCTION public.audit_log_changes(
  'dono_id,baseline,alvo,status,nota_final,kpi_id'
);


-- ============================================================================
-- PARTE 3 · ÍNDICE DA BASE (topo 2 do Pr. Juninho · agregação DERIVADA)
-- ============================================================================
-- "% da base engajada nos valores" — a NSM da MEMBRESIA (estoque), irmã da
-- NSM dos convertidos (fluxo). É FUNÇÃO, nunca tabela: agregado cadastrável
-- na mesma prateleira dos componentes é exatamente a contagem dupla que
-- derrubou a camada dos 637 KRs.
--
-- ⚠️⚠️ ESTA É A LENTE VIVA — base medida no sistema (1.703 membros ativos em
-- 21/08). A fatia da presidência (`src/lib/monitoramentoOkrEstrutura.js`) usa
-- base FIXA de 3.000 definida pelo Pr. Juninho, com numeradores próprios.
-- NUNCA misturar as duas num mesmo documento: é assim que uma reunião inteira
-- vira discussão sobre qual número está certo (lei de 18/08).
--
-- ⚠️ media_3 × media_5 é DECISÃO PENDENTE do Pr. Juninho (a planilha dele conta
-- 3 valores; o sistema mede 5 desde que o devocional entrou no ar). A função
-- devolve AS DUAS, com os valores de cada uma declarados — escolher uma aqui
-- seria decidir no lugar dele, e trocar depois mudaria número já apresentado.

CREATE OR REPLACE FUNCTION public.fn_indice_engajamento_base()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_base            int;
  v_base_viva       int;
  v_seguir          int;
  v_conectar        int;
  v_investir        int;
  v_servir          int;
  v_generosidade    int;
  v_pct_seguir      numeric;
  v_pct_conectar    numeric;
  v_pct_investir    numeric;
  v_pct_servir      numeric;
  v_pct_generosid   numeric;
BEGIN
  SELECT
    count(*) FILTER (WHERE status = 'membro_ativo'),
    count(*),
    count(*) FILTER (WHERE status = 'membro_ativo' AND valor_seguir),
    count(*) FILTER (WHERE status = 'membro_ativo' AND valor_conectar),
    count(*) FILTER (WHERE status = 'membro_ativo' AND valor_investir),
    count(*) FILTER (WHERE status = 'membro_ativo' AND valor_servir),
    count(*) FILTER (WHERE status = 'membro_ativo' AND valor_generosidade)
    INTO v_base, v_base_viva, v_seguir, v_conectar, v_investir, v_servir, v_generosidade
    FROM public.vw_pessoas_papeis_mat
   WHERE active = true;

  -- ⚠️ Base zero devolve NULL em todo percentual, NUNCA 0%: "não há base para
  -- medir" e "a base não está engajada" levam a decisões opostas.
  IF v_base IS NULL OR v_base = 0 THEN
    RETURN jsonb_build_object(
      'base', 0,
      'base_viva', COALESCE(v_base_viva, 0),
      'base_criterio', 'mem_membros active + status=membro_ativo (via vw_pessoas_papeis_mat)',
      'por_valor', NULL,
      'media_3', NULL,
      'media_5', NULL,
      'aviso', 'Sem base para calcular o índice.',
      'calculado_em', now()
    );
  END IF;

  v_pct_seguir    := round((v_seguir       * 100.0) / v_base, 1);
  v_pct_conectar  := round((v_conectar     * 100.0) / v_base, 1);
  v_pct_investir  := round((v_investir     * 100.0) / v_base, 1);
  v_pct_servir    := round((v_servir       * 100.0) / v_base, 1);
  v_pct_generosid := round((v_generosidade * 100.0) / v_base, 1);

  RETURN jsonb_build_object(
    'base', v_base,
    'base_viva', v_base_viva,
    'base_criterio', 'mem_membros active + status=membro_ativo (via vw_pessoas_papeis_mat)',
    'por_valor', jsonb_build_object(
      'seguir',       jsonb_build_object('n', v_seguir,       'pct', v_pct_seguir),
      'conectar',     jsonb_build_object('n', v_conectar,     'pct', v_pct_conectar),
      'investir',     jsonb_build_object('n', v_investir,     'pct', v_pct_investir),
      'servir',       jsonb_build_object('n', v_servir,       'pct', v_pct_servir),
      'generosidade', jsonb_build_object('n', v_generosidade, 'pct', v_pct_generosid)
    ),
    'media_3', jsonb_build_object(
      'valores', jsonb_build_array('conectar','servir','generosidade'),
      'pct', round((v_pct_conectar + v_pct_servir + v_pct_generosid) / 3.0, 1),
      'nota', 'Os 3 valores da planilha da presidência (grupos, voluntários, dizimistas).'
    ),
    'media_5', jsonb_build_object(
      'valores', jsonb_build_array('seguir','conectar','investir','servir','generosidade'),
      'pct', round((v_pct_seguir + v_pct_conectar + v_pct_investir + v_pct_servir + v_pct_generosid) / 5.0, 1),
      'nota', 'Os 5 valores da Jornada (inclui Investir, que só tem fonte desde o devocional no app).'
    ),
    'atualizado_em', (SELECT max(atualizado_em) FROM public.vw_pessoas_papeis_mat),
    'calculado_em', now()
  );
END $$;

COMMENT ON FUNCTION public.fn_indice_engajamento_base() IS
  'Índice da Base (topo 2 da fatia da presidência): % dos membros ativos com '
  'sinal real em cada valor da Jornada. LENTE VIVA (base ~1.7 mil) — NÃO é a '
  'base fixa de 3.000 da planilha do Pr. Juninho; nunca misturar as duas no '
  'mesmo documento. Devolve media_3 E media_5 porque a escolha é dele.';

-- ⚠️ SEM grant para anon/authenticated: quem chama é o BACKEND com service_role
-- (lei de 10/08 · grant a authenticated existe SÓ para RPC que o cliente chama
-- com a chave pública, e esta lê a matview de pessoas).
REVOKE ALL ON FUNCTION public.fn_indice_engajamento_base() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_indice_engajamento_base() FROM anon;
REVOKE ALL ON FUNCTION public.fn_indice_engajamento_base() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.fn_indice_engajamento_base() TO service_role;


-- ============================================================================
-- VERIFICAÇÃO (rodar depois de aplicar · confere no CATÁLOGO, não no success)
-- ============================================================================
-- select linhagem, count(*) from kpi_indicadores_taticos
--  where ativo = true and deleted_at is null group by 1 order by 2 desc;
--   -> esperado em 21/08: sistema ~139 · nsm ~18 · jornada 13
--
-- select public.fn_indice_engajamento_base();
--   -> esperado: base 1703 · conectar 46,6% · seguir 30,2% · servir 25,7%
--      · generosidade 14,0% · investir 0,0% (fato medido: o devocional tem 12
--      check-ins na história e o último é de 15/07)
--
-- select count(*) from pg_policies where tablename in ('okr_ciclos','okr_ciclo_krs');
--   -> esperado: 6
-- ============================================================================
