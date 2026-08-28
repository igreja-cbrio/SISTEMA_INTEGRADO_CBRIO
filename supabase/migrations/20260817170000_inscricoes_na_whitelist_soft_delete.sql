-- Acrescenta `inscricoes` e `insc_eventos` à whitelist de soft-delete.
--
-- ⚠️ Por que (17/08/2026): `app_soft_delete` levanta exceção para tabela fora da
-- whitelist, e a espinha de inscrições NUNCA foi acrescentada — só a porta
-- legada (`ext_inscricoes`/`ext_eventos`). Efeito medido: `DELETE
-- /inscricoes/eventos/:id/inscricoes/:id` e `DELETE /inscricoes/eventos/:id`
-- respondiam 500 desde a migração pra espinha, e a tela só dizia "Erro ao
-- excluir" — o motivo real (`Tabela inscricoes nao esta na whitelist de
-- soft-delete`) nunca chegava a ninguém.
--
-- ⚠️⚠️ PATCH DINÂMICO sobre a definição VIVA, nunca colando a lista do arquivo:
-- a whitelist em produção tinha 65 tabelas e pode ter itens acrescentados fora
-- do git — um `CREATE OR REPLACE` com lista estática os apagaria em silêncio, e
-- o sintoma seria soft-delete quebrado em OUTRO módulo, sem ninguém ligar uma
-- coisa à outra. (Mesma técnica do patch de `fn_app_inscricoes_fanout`.)
--
-- ⚠️ `inscricao_consentimentos` fica de FORA de propósito: é prova legal
-- (append-only). `insc_comprovantes`, `insc_beneficios` e `insc_series` também —
-- nenhum caminho do código as apaga por esta RPC hoje, e whitelist é
-- autorização, não inventário.
--
-- Idempotente: se as duas já estiverem lá, não toca em nada.
DO $$
DECLARE
  v_lista text;
  v_sql   text;
BEGIN
  IF 'inscricoes' = ANY(public.app_soft_deletable_tables())
     AND 'insc_eventos' = ANY(public.app_soft_deletable_tables()) THEN
    RAISE NOTICE 'inscricoes e insc_eventos ja estao na whitelist - nada a fazer';
    RETURN;
  END IF;

  SELECT string_agg(quote_literal(t), ', ' ORDER BY t) INTO v_lista
  FROM (
    SELECT unnest(public.app_soft_deletable_tables()) AS t
    UNION SELECT 'inscricoes'
    UNION SELECT 'insc_eventos'
  ) s;

  v_sql := 'CREATE OR REPLACE FUNCTION public.app_soft_deletable_tables() '
        || 'RETURNS TEXT[] LANGUAGE sql IMMUTABLE AS $body$ SELECT ARRAY['
        || v_lista || ']::TEXT[] $body$';
  EXECUTE v_sql;

  RAISE NOTICE 'whitelist atualizada';
END $$;

COMMENT ON FUNCTION public.app_soft_deletable_tables() IS
  'Whitelist de tabelas que app_soft_delete/app_restore podem tocar. Tabela com deleted_at que o codigo apaga por RPC PRECISA estar aqui - fora dela a RPC levanta excecao e o endpoint devolve 500 sem motivo visivel (caso inscricoes, 17/08/2026). Alterar sempre por patch dinamico sobre a definicao viva.';
