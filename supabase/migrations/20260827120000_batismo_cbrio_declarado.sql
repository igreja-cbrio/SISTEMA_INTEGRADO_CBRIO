-- ============================================================================
-- "Já me batizei aqui na CBRio" · declaração do próprio membro (2026-08-27)
--
-- Pedido do Marcos: *"ela se batizou na igreja, mas não tem opção de marcar
-- isso; como não temos o histórico de batismo antigo, pode colocar essa opção
-- de já me batizei na CBRio."*
--
-- Hoje o app só oferece **"Já sou batizado(a) em OUTRA igreja"**
-- (`batizado_outra_igreja` + `igreja_batismo_anterior`). Quem se batizou AQUI
-- antes de o sistema existir não tem `batismo_inscricoes` e não tem como dizer
-- isso — e digitar "CBRio" no campo de outra igreja seria gravar a própria
-- igreja como se fosse outra: dado errado, e que ainda polui aquela coluna com
-- variações de grafia.
--
-- ⚠️⚠️ POR QUE NÃO CRIAR LINHA EM `batismo_inscricoes`: aquela tabela é o
-- REGISTRO da igreja (588 batismos `realizado`) e alimenta os KPIs de batismo,
-- a NSM e o comparativo YoY do Dashboard Semanal. Um autodeclarado retroativo
-- entraria no número que a liderança publica, sem ninguém ter conferido — é a
-- mesma lei do censo, que NÃO promove ninguém a membro. Declaração é
-- declaração; registro é registro.
--
-- ⚠️ POR QUE NÃO REUSAR `mem_membros.batizado`: é coluna MORTA (medido em
-- 27/08: `batizado = true` em **0** linhas de toda a base) e não distingue
-- "a igreja registrou" de "a pessoa disse". Reusá-la ressuscitaria um campo
-- ambíguo, e o CLAUDE.md já registra que a v1 do Perfil embarcou esse dado
-- morto e teve que ser trocada.
-- ============================================================================

-- `_em` é o CARIMBO da declaração (quando a pessoa disse) e é o que liga/desliga
-- o marcador. `_data` é opcional: o dia do batismo, se ela lembrar.
ALTER TABLE public.mem_membros
  ADD COLUMN IF NOT EXISTS batismo_cbrio_declarado_em timestamptz,
  ADD COLUMN IF NOT EXISTS batismo_cbrio_data date;

COMMENT ON COLUMN public.mem_membros.batismo_cbrio_declarado_em IS
  'Quando a PESSOA declarou, pelo app, que já se batizou na CBRio (batismo anterior ao sistema). '
  'NULL = não declarou. ⚠️ É DECLARAÇÃO, não registro: NÃO entra nos KPIs de batismo nem na NSM — '
  'quem conta batismo é batismo_inscricoes (status=realizado). Marcada por app_marcar_batizado_cbrio().';

COMMENT ON COLUMN public.mem_membros.batismo_cbrio_data IS
  'Data do batismo na CBRio, se a pessoa souber informar (opcional). Autodeclarada, nunca conferida.';

-- ⚠️⚠️ A guarda de "data no futuro" fica na RPC, NÃO num CHECK.
-- `CURRENT_DATE` NÃO é IMMUTABLE, e o Postgres recusa função mutável em CHECK
-- ("functions in check constraint must be marked IMMUTABLE"). É erro SEMÂNTICO:
-- o parser passa e a migration só quebra na hora de aplicar — a mesma armadilha
-- do 0A000 (subquery em CHECK) registrada na leva do retiro. Como a RPC é o
-- único caminho de escrita destas colunas a partir do app, validar lá cobre o
-- caso real sem prometer no schema o que o schema não sabe cumprir.

-- ── RPCs do APP ─────────────────────────────────────────────────────────────
-- ⚠️⚠️ O ALVO SAI DE `auth.uid()`, NUNCA de parâmetro. É a mesma lei das outras
-- 4 RPCs do app (10/08): id de terceiro no argumento não pode alcançar cadastro
-- de terceiro. Aqui não há nem parâmetro de pessoa — só a data.
CREATE OR REPLACE FUNCTION public.app_marcar_batizado_cbrio(p_data date DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_membro uuid;
BEGIN
  SELECT membro_id INTO v_membro FROM public.profiles WHERE id = auth.uid();
  IF v_membro IS NULL THEN
    RAISE EXCEPTION 'Cadastro não encontrado para esta conta.';
  END IF;

  -- Nada de batismo no futuro. `+1 dia` de folga porque o fuso do aparelho pode
  -- estar à frente do servidor e recusar a data de HOJE seria recusa incorreta.
  IF p_data IS NOT NULL AND p_data > CURRENT_DATE + 1 THEN
    RAISE EXCEPTION 'A data do batismo não pode ser no futuro.';
  END IF;

  UPDATE public.mem_membros
     SET batismo_cbrio_declarado_em = COALESCE(batismo_cbrio_declarado_em, now()),
         batismo_cbrio_data = p_data,
         -- ⚠️ Declarar batismo AQUI apaga a declaração de "outra igreja": são
         -- afirmações que se excluem, e deixar as duas ligadas faria a ficha
         -- dizer as duas coisas ao mesmo tempo.
         batizado_outra_igreja = false,
         igreja_batismo_anterior = NULL
   WHERE id = v_membro
     AND deleted_at IS NULL;
END $$;

CREATE OR REPLACE FUNCTION public.app_desmarcar_batizado_cbrio()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_membro uuid;
BEGIN
  SELECT membro_id INTO v_membro FROM public.profiles WHERE id = auth.uid();
  IF v_membro IS NULL THEN
    RAISE EXCEPTION 'Cadastro não encontrado para esta conta.';
  END IF;

  UPDATE public.mem_membros
     SET batismo_cbrio_declarado_em = NULL,
         batismo_cbrio_data = NULL
   WHERE id = v_membro
     AND deleted_at IS NULL;
END $$;

-- ⚠️⚠️ GRANT authenticated OBRIGATÓRIO — quem chama é o APP, com o JWT da
-- pessoa (papel `authenticated`), não o backend. Sem isto a chamada devolve
-- "permission denied" e a tela falha em SILÊNCIO (lei de 10/08, quando o sweep
-- de segurança quebrou o QR do cartão e o check-in de batismo do app).
REVOKE ALL ON FUNCTION public.app_marcar_batizado_cbrio(date) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.app_desmarcar_batizado_cbrio() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.app_marcar_batizado_cbrio(date) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.app_desmarcar_batizado_cbrio() TO authenticated, service_role;

COMMENT ON FUNCTION public.app_marcar_batizado_cbrio(date) IS
  '[GRANT authenticated OBRIGATÓRIO — chamada pelo app com o JWT da pessoa] '
  'A pessoa declara que já se batizou na CBRio. Alvo resolvido por auth.uid(); nunca por parâmetro.';
COMMENT ON FUNCTION public.app_desmarcar_batizado_cbrio() IS
  '[GRANT authenticated OBRIGATÓRIO — chamada pelo app com o JWT da pessoa] '
  'Desfaz a declaração de batismo na CBRio. Alvo resolvido por auth.uid().';
