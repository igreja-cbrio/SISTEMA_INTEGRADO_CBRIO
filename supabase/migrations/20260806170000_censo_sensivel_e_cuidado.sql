-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ Censo · F1a — bloco sensível, fila de cuidado e salvar-e-retomar         ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
--
-- POR QUÊ: o questionário final (especificação de 2026-08-06) trouxe três
-- coisas que a F0 não previa:
--
-- 1. **Bloco sensível.** Saúde emocional, terapia, área de restauração,
--    situação do casamento e "algo que nunca teve coragem de compartilhar".
--    Decisão do Matheus: o AGREGADO desses campos é visível para quem tem o
--    módulo (nível 1), mas a resposta NOMINAL só para uma lista curta e
--    nomeada de pessoas — independente de quem tem nível 2 no censo (hoje são
--    34 cargos na matriz). É o que sustenta a promessa implícita da pergunta:
--    "Em crise" ao lado do nome circula muito mais do que a pessoa imagina.
--
-- 2. **Gatilhos de cuidado.** Quatro perguntas (acompanhamento familiar,
--    aconselhamento, contato para oração, "quer conversar com alguém") não são
--    estatística: são PEDIDO DE AJUDA. A própria especificação avisa que "só
--    têm valor se houver retorno para quem pediu". Então viram fila com
--    responsável e status, e ficam FORA de vw_cen_item_agregado — um pedido de
--    ajuda não é uma fatia de gráfico.
--
-- 3. **Salvar-e-retomar.** 93 campos obrigatórios no celular, em pé, no culto.
--    Sem retomar, quem for interrompido perde tudo e não volta.
--
-- Idempotente. Depende de 20260806120000_censo_modulo_config.sql.

SET lock_timeout = '10s';

-- ── 1. Marcas no item: sensível e ação ────────────────────────────────────
-- Desnormalizado na ESCRITA, de propósito. Derivar "é sensível?" do jsonb da
-- pesquisa a cada leitura é o tipo de filtro que uma refatoração futura
-- esquece de aplicar — e o que vaza quando esquece é justamente o bloco 6.
-- A coluna não esquece.
ALTER TABLE public.cen_resposta_item
  ADD COLUMN IF NOT EXISTS sensivel BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.cen_resposta_item
  ADD COLUMN IF NOT EXISTS acao TEXT;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cen_resposta_item_acao_chk') THEN
    ALTER TABLE public.cen_resposta_item
      ADD CONSTRAINT cen_resposta_item_acao_chk CHECK (acao IS NULL OR acao = 'cuidado');
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_cen_item_sensivel
  ON public.cen_resposta_item (pesquisa_id) WHERE sensivel;

-- ── 2. Salvar-e-retomar ───────────────────────────────────────────────────
-- Guardamos o HASH do segredo que fica no aparelho, nunca o segredo. Assim um
-- vazamento desta tabela não deixa ninguém reabrir a resposta de outra pessoa.
ALTER TABLE public.cen_resposta
  ADD COLUMN IF NOT EXISTS retomar_hash TEXT;
ALTER TABLE public.cen_resposta
  ADD COLUMN IF NOT EXISTS ultima_atividade_em TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_cen_resposta_retomar
  ON public.cen_resposta (retomar_hash) WHERE retomar_hash IS NOT NULL AND deleted_at IS NULL;

-- ── 3. cen_cuidado · a fila de follow-up ──────────────────────────────────
CREATE TABLE IF NOT EXISTS public.cen_cuidado (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pesquisa_id UUID NOT NULL,
  resposta_id UUID NOT NULL,
  membro_id UUID,
  tipo TEXT NOT NULL
    CHECK (tipo IN ('familiar','aconselhamento','oracao','conversa')),
  status TEXT NOT NULL DEFAULT 'aberto'
    CHECK (status IN ('aberto','em_contato','concluido','sem_retorno')),
  responsavel_id UUID,
  observacao TEXT,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  concluido_em TIMESTAMPTZ
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cen_cuidado_pesquisa_fkey') THEN
    ALTER TABLE public.cen_cuidado ADD CONSTRAINT cen_cuidado_pesquisa_fkey
      FOREIGN KEY (pesquisa_id) REFERENCES public.cen_pesquisa(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cen_cuidado_resposta_fkey') THEN
    ALTER TABLE public.cen_cuidado ADD CONSTRAINT cen_cuidado_resposta_fkey
      FOREIGN KEY (resposta_id) REFERENCES public.cen_resposta(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cen_cuidado_membro_fkey') THEN
    ALTER TABLE public.cen_cuidado ADD CONSTRAINT cen_cuidado_membro_fkey
      FOREIGN KEY (membro_id) REFERENCES public.mem_membros(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cen_cuidado_responsavel_fkey') THEN
    ALTER TABLE public.cen_cuidado ADD CONSTRAINT cen_cuidado_responsavel_fkey
      FOREIGN KEY (responsavel_id) REFERENCES public.profiles(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Um pedido por tipo por resposta. Trava o clique duplo no envio e o reenvio
-- da fila offline (a mesma resposta pode chegar duas vezes do aparelho).
CREATE UNIQUE INDEX IF NOT EXISTS uq_cen_cuidado_resposta_tipo
  ON public.cen_cuidado (resposta_id, tipo);
CREATE INDEX IF NOT EXISTS idx_cen_cuidado_fila
  ON public.cen_cuidado (pesquisa_id, status, criado_em);

-- A função da F0 mexe em `updated_at`; aqui a coluna é `atualizado_em`.
CREATE OR REPLACE FUNCTION public.set_cen_atualizado_em()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  NEW.atualizado_em = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cen_cuidado_atualizado_em ON public.cen_cuidado;
CREATE TRIGGER trg_cen_cuidado_atualizado_em
BEFORE UPDATE ON public.cen_cuidado
FOR EACH ROW EXECUTE FUNCTION public.set_cen_atualizado_em();

-- ── 4. cen_acesso_sensivel · quem pode ver o bloco 6 com nome ─────────────
CREATE TABLE IF NOT EXISTS public.cen_acesso_sensivel (
  profile_id UUID PRIMARY KEY,
  motivo TEXT,
  concedido_por UUID,
  concedido_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  revogado_em TIMESTAMPTZ
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cen_acesso_sensivel_profile_fkey') THEN
    ALTER TABLE public.cen_acesso_sensivel ADD CONSTRAINT cen_acesso_sensivel_profile_fkey
      FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Predicado único da regra. O backend usa service_role e checa em JS, mas a
-- função existe para a RLS e para consulta manual — uma regra escrita em dois
-- lugares é uma regra que vai divergir.
CREATE OR REPLACE FUNCTION public.cen_pode_ver_sensivel(p_profile UUID DEFAULT auth.uid())
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.cen_acesso_sensivel
     WHERE profile_id = p_profile AND revogado_em IS NULL
  );
$$;
REVOKE ALL ON FUNCTION public.cen_pode_ver_sensivel(UUID) FROM anon;

-- ── 5. Views ──────────────────────────────────────────────────────────────

-- Pedido de ajuda NÃO é estatística: sai do agregado. Sem isto, "12 pessoas
-- pediram aconselhamento" apareceria como um gráfico de barras e ninguém
-- ligaria para as 12.
-- DROP em vez de OR REPLACE: a coluna `sensivel` entra no meio da lista e o
-- Postgres recusa REPLACE que reordene coluna de view (42P16). Nada depende
-- desta view (vw_cen_funil_pergunta olha vw_cen_pesquisa_stats), e os GRANTs
-- são reaplicados no fim desta migration.
DROP VIEW IF EXISTS public.vw_cen_item_agregado;
CREATE VIEW public.vw_cen_item_agregado AS
SELECT
  i.pesquisa_id,
  i.pergunta_id,
  i.pergunta_texto,
  i.tipo,
  i.sensivel,
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
  -- resto: o número (nps/escala) ou o texto. trim_scale porque valor_num é
  -- NUMERIC(12,2) e sem ele o 9 vira o rótulo "9.00" no eixo.
  SELECT COALESCE(trim_scale(i.valor_num)::text, i.valor_texto)
   WHERE i.valor_opcoes IS NULL
) v
WHERE v.valor IS NOT NULL
  AND i.acao IS DISTINCT FROM 'cuidado'
GROUP BY i.pesquisa_id, i.pergunta_id, i.pergunta_texto, i.tipo, i.sensivel, v.valor;

-- Fila de cuidado com o nome à vista: é o ponto do módulo em que a PII é o
-- produto, não um efeito colateral. Só service_role.
CREATE OR REPLACE VIEW public.vw_cen_cuidado_fila AS
SELECT
  c.id,
  c.pesquisa_id,
  c.tipo,
  c.status,
  c.criado_em,
  c.concluido_em,
  c.observacao,
  c.responsavel_id,
  resp.name        AS responsavel_nome,
  c.membro_id,
  COALESCE(m.nome, r.nome_declarado)         AS pessoa_nome,
  COALESCE(m.telefone, r.contato_declarado)  AS pessoa_contato,
  m.email                                    AS pessoa_email,
  (c.membro_id IS NULL)                      AS fora_da_base,
  EXTRACT(day FROM (now() - c.criado_em))::int AS dias_aberto
FROM public.cen_cuidado c
JOIN public.cen_resposta r ON r.id = c.resposta_id AND r.deleted_at IS NULL
LEFT JOIN public.mem_membros m ON m.id = c.membro_id
LEFT JOIN public.profiles resp ON resp.id = c.responsavel_id;

-- Contadores da fila, sem PII: alimenta o card do módulo para qualquer nível.
CREATE OR REPLACE VIEW public.vw_cen_cuidado_resumo AS
SELECT
  c.pesquisa_id,
  c.tipo,
  COUNT(*)                                                  AS total,
  COUNT(*) FILTER (WHERE c.status = 'aberto')                AS abertos,
  COUNT(*) FILTER (WHERE c.status = 'em_contato')            AS em_contato,
  COUNT(*) FILTER (WHERE c.status = 'concluido')             AS concluidos,
  COUNT(*) FILTER (WHERE c.status = 'sem_retorno')           AS sem_retorno,
  MAX(EXTRACT(day FROM (now() - c.criado_em))::int)
    FILTER (WHERE c.status IN ('aberto','em_contato'))       AS dias_do_mais_antigo
FROM public.cen_cuidado c
GROUP BY c.pesquisa_id, c.tipo;

-- ── 6. RLS ────────────────────────────────────────────────────────────────
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['cen_cuidado','cen_acesso_sensivel'] LOOP
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

-- ── 7. GRANTs ─────────────────────────────────────────────────────────────
-- A fila nominal tem PII e é o alvo mais sensível do módulo.
REVOKE ALL ON public.vw_cen_cuidado_fila FROM anon, authenticated;
GRANT SELECT ON public.vw_cen_cuidado_fila TO service_role;

GRANT SELECT ON public.vw_cen_item_agregado, public.vw_cen_cuidado_resumo
  TO authenticated, service_role;
REVOKE ALL ON public.vw_cen_item_agregado, public.vw_cen_cuidado_resumo FROM anon;

-- ── 8. COMMENTs ───────────────────────────────────────────────────────────
COMMENT ON COLUMN public.cen_resposta_item.sensivel IS
  'Bloco sensível (saúde emocional, casamento, "nunca teve coragem"). Agregado é livre; NOMINAL só para quem está em cen_acesso_sensivel. Desnormalizado na escrita porque filtro derivado do jsonb é filtro que se esquece de aplicar.';
COMMENT ON COLUMN public.cen_resposta_item.acao IS
  '"cuidado" = pedido de ajuda. Fica FORA de vw_cen_item_agregado: pedido não é fatia de gráfico, é linha em cen_cuidado.';
COMMENT ON COLUMN public.cen_resposta.retomar_hash IS
  'HASH do segredo que fica no aparelho (nunca o segredo). Vazamento desta tabela não reabre a resposta de ninguém.';
COMMENT ON TABLE public.cen_cuidado IS
  'Fila de follow-up dos 4 gatilhos de cuidado. A especificação do censo avisa: o gatilho só vale se houver retorno para quem pediu.';
COMMENT ON TABLE public.cen_acesso_sensivel IS
  'Lista nomeada e auditável de quem pode ver o bloco sensível com NOME. Independe do nível no módulo censo.';
COMMENT ON VIEW public.vw_cen_cuidado_fila IS
  'CONTÉM PII de propósito (é o produto da fila). GRANT só service_role; o backend filtra por responsável/permissão.';
