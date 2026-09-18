-- ============================================================================
-- KIDS · CÓDIGOS RESERVADOS — o que torna o check-in offline SEGURO
-- 02/09/2026 · depois da queda de 1h34 do banco
--
-- ⚠️⚠️ O PROBLEMA, medido: o código de retirada tem 20 bits (alfabeto de 32 ×
-- 4 posições) e a unicidade NÃO vem do gerador — vem do trigger
-- `fn_kids_validar_codigo_seguranca_ativo`, que roda NO INSERT. Offline não há
-- INSERT, logo não há garantia nenhuma, só sorte:
--
--     50 check-ins offline num namespace de 2 chars  → 70% de colisão
--    100 check-ins offline                           → 99%
--
-- E colisão aqui não é bug estético: os dois leitores do código
-- (`GET /checkin/codigo/:codigo` e `POST /portao/scan`) resolvem empate com
-- `.order(checkin_at desc).limit(1)` — ou seja, resolvem em SILÊNCIO pelo mais
-- recente. O pai da outra criança ouviria "já foi retirada".
--
-- ⚠️⚠️ A SAÍDA NÃO É GERAR MELHOR NO CLIENTE — é NÃO GERAR NO CLIENTE.
-- O totem SACA de um bloco que o servidor reservou ENQUANTO HAVIA REDE. Quem
-- sorteia e arbitra continua sendo o servidor; o cliente só consome. Colisão
-- passa a ser impossível por construção, não improvável por estatística.
--
-- ⚠️ Escala medida (para dimensionar o bloco): domingo ~220 check-ins, pico de
-- 125 simultâneos. Bloco de 60 por estação cobre com folga de 2×.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.kids_codigos_reservados (
  codigo        text        PRIMARY KEY,
  estacao_id    uuid        REFERENCES public.kids_estacoes(id) ON DELETE SET NULL,
  -- ⚠️ Quando a estação não está pareada (o pareamento de `kids_estacoes`
  -- nunca foi implementado — ver a lei do totem), o bloco é identificado por
  -- um id local do navegador. Sem isso a reserva não teria dono e dois totens
  -- sacariam do mesmo bloco.
  estacao_ref   text        NOT NULL,
  sessao_id     uuid        REFERENCES public.kids_sessoes(id) ON DELETE CASCADE,
  status        text        NOT NULL DEFAULT 'reservado'
                            CHECK (status IN ('reservado','usado','descartado')),
  reservado_em  timestamptz NOT NULL DEFAULT now(),
  usado_em      timestamptz,
  checkin_id    uuid        REFERENCES public.kids_checkins(id) ON DELETE SET NULL
);

COMMENT ON TABLE public.kids_codigos_reservados IS
  'Blocos de codigo de seguranca pre-alocados pelo SERVIDOR para o totem usar OFFLINE. '
  'O cliente NUNCA gera codigo: ele saca daqui. E o que torna colisao impossivel por '
  'construcao (offline nao ha INSERT, logo o trigger de unicidade nao roda). '
  'Ver migration 20260902200000.';

COMMENT ON COLUMN public.kids_codigos_reservados.estacao_ref IS
  'Dono do bloco. Um bloco NUNCA e compartilhado entre estacoes — e o que impede '
  'dois totens offline sacarem o mesmo codigo.';

CREATE INDEX IF NOT EXISTS idx_kids_cod_reserv_saque
  ON public.kids_codigos_reservados (estacao_ref, sessao_id)
  WHERE status = 'reservado';

CREATE INDEX IF NOT EXISTS idx_kids_cod_reserv_sessao
  ON public.kids_codigos_reservados (sessao_id);

-- ⚠️ RLS: quem escreve é o BACKEND com service_role. Nenhuma policy para
-- `authenticated` — a tabela é a lista de credenciais de retirada do dia, e
-- ampliá-la ao que a anon key alcança seria a lei nº 11 pelo avesso.
ALTER TABLE public.kids_codigos_reservados ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS kids_cod_reserv_service ON public.kids_codigos_reservados;
CREATE POLICY kids_cod_reserv_service ON public.kids_codigos_reservados
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ----------------------------------------------------------------------------
-- ⚠️⚠️ O GERADOR PASSA A ENXERGAR AS RESERVAS
-- Sem isto, o servidor ONLINE sortearia um código que já está IMPRESSO num
-- bloco offline — e as duas etiquetas sairiam iguais. É a metade do conserto
-- que, esquecida, faz a outra metade produzir exatamente o bug que ela evita.
--
-- ⚠️ Reescrito a partir da definição VIVA (pg_get_functiondef de 02/09), não
-- do arquivo do repo. A única mudança é o `AND NOT EXISTS` das reservas.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_kids_gerar_codigo_seguranca()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  DECLARE
    chars constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    -- ⚠️⚠️ `v_codigo`, NUNCA `codigo`: a 1ª versão desta migration usava
    -- `codigo` e o `WHERE r.codigo = codigo` levantava **42702 ambiguous**
    -- (a coluna da tabela nova tem o mesmo nome da variável). Isso quebraria
    -- TODA geração de código do Kids — o gerador roda em cada check-in.
    -- ⚠️ Pego pelo ENSAIO FUNCIONAL, não pela leitura: corpo de plpgsql só é
    -- resolvido na EXECUÇÃO, então o `success: true` do CREATE não prova nada.
    v_codigo text;
    tentativa integer := 0;
  BEGIN
    LOOP
      tentativa := tentativa + 1;
      v_codigo := '';

      FOR i IN 1..4 LOOP
        v_codigo := v_codigo || substr(
          chars,
          1 + floor(random() * length(chars))::integer,
          1
        );
      END LOOP;

      EXIT WHEN NOT EXISTS (
        SELECT 1
        FROM public.kids_checkins k
        WHERE k.codigo_seguranca = v_codigo
          AND k.checkout_at IS NULL
          AND k.deleted_at IS NULL
      )
      -- ⚠️⚠️ A LINHA NOVA: código reservado (mesmo ainda não usado) está ou
      -- estará IMPRESSO em papel. Sortear por cima produziria duas etiquetas
      -- com o mesmo código — exatamente o que a reserva existe pra impedir.
      AND NOT EXISTS (
        SELECT 1
        FROM public.kids_codigos_reservados r
        WHERE r.codigo = v_codigo
          AND r.status = 'reservado'
      );

      IF tentativa >= 100 THEN
        RAISE EXCEPTION
          'Não foi possível gerar código de segurança livre';
      END IF;
    END LOOP;

    RETURN v_codigo;
  END;
  $function$;

-- ----------------------------------------------------------------------------
-- Reservar um bloco (chamado pelo backend enquanto HÁ REDE)
-- ⚠️ Idempotente por estação/sessão: se já há bloco vivo, devolve o que existe
-- em vez de emitir mais. Sem isso, cada F5 do totem queimaria 60 códigos.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_kids_reservar_codigos(
  p_estacao_ref text,
  p_sessao_id   uuid,
  p_quantidade  integer DEFAULT 60,
  p_estacao_id  uuid DEFAULT NULL
)
RETURNS TABLE (codigo text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  DECLARE
    v_falta integer;
    v_novo  text;
    v_i     integer := 0;
  BEGIN
    IF p_estacao_ref IS NULL OR btrim(p_estacao_ref) = '' THEN
      RAISE EXCEPTION 'estacao_ref obrigatorio';
    END IF;
    -- ⚠️ Teto: bloco gigante esgotaria o espaço de 1 M de códigos e faria o
    -- gerador online começar a falhar por exaustão.
    IF p_quantidade IS NULL OR p_quantidade < 1 OR p_quantidade > 200 THEN
      RAISE EXCEPTION 'quantidade fora da faixa (1..200)';
    END IF;

    -- ⚠️ Serializa por ESTAÇÃO: duas abas do mesmo totem pedindo bloco ao
    -- mesmo tempo não podem sacar dois blocos.
    PERFORM pg_advisory_xact_lock(hashtextextended('kids-reserva:' || p_estacao_ref, 0));

    SELECT p_quantidade - count(*) INTO v_falta
      FROM public.kids_codigos_reservados r
     WHERE r.estacao_ref = p_estacao_ref
       AND r.sessao_id IS NOT DISTINCT FROM p_sessao_id
       AND r.status = 'reservado';

    WHILE v_falta > 0 AND v_i < p_quantidade * 5 LOOP
      v_i := v_i + 1;
      v_novo := public.fn_kids_gerar_codigo_seguranca();
      BEGIN
        INSERT INTO public.kids_codigos_reservados
          (codigo, estacao_id, estacao_ref, sessao_id)
        VALUES (v_novo, p_estacao_id, p_estacao_ref, p_sessao_id);
        v_falta := v_falta - 1;
      EXCEPTION WHEN unique_violation THEN
        -- outro processo pegou este código entre o sorteio e o insert: tenta outro
        NULL;
      END;
    END LOOP;

    RETURN QUERY
      SELECT r.codigo
        FROM public.kids_codigos_reservados r
       WHERE r.estacao_ref = p_estacao_ref
         AND r.sessao_id IS NOT DISTINCT FROM p_sessao_id
         AND r.status = 'reservado'
       ORDER BY r.reservado_em;
  END;
  $function$;

REVOKE ALL ON FUNCTION public.fn_kids_reservar_codigos(text, uuid, integer, uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_kids_reservar_codigos(text, uuid, integer, uuid) TO service_role;

COMMENT ON FUNCTION public.fn_kids_reservar_codigos(text, uuid, integer, uuid) IS
  'Reserva um bloco de codigos para o totem usar OFFLINE. Idempotente por '
  '(estacao_ref, sessao): completa o bloco ate a quantidade pedida em vez de '
  'emitir de novo. So service_role — a lista de codigos do dia nao pode ser '
  'alcancavel pela chave publica.';
