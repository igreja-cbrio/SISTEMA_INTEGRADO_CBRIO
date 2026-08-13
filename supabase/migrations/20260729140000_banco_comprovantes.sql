-- Banco de comprovantes · agrega num só lugar os arquivos anexados às transações
-- (fin_transacoes.anexos_url · jsonb array) + as notas fiscais com arquivo
-- (log_notas_fiscais.storage_path). Serve a aba "Comprovantes" do Financeiro.
-- RPC (não query) por causa do jsonb_array_length>0 (PostgREST não expressa) e
-- do cap de 1000. p_base = SUPABASE_URL (pra montar a URL pública da NF).

CREATE OR REPLACE FUNCTION public.fn_banco_comprovantes(
  p_inicio date  DEFAULT NULL,
  p_fim    date  DEFAULT NULL,
  p_conta  uuid  DEFAULT NULL,
  p_q      text  DEFAULT NULL,
  p_base   text  DEFAULT ''
)
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH anexos AS (
    SELECT
      jsonb_build_object(
        'origem','transacao',
        'ref_id', t.id,
        'descricao', t.descricao,
        'valor', t.valor,
        'tipo_transacao', t.tipo,
        'data', t.data_competencia,
        'conta', c.nome,
        'arquivo', COALESCE(a->>'nome','comprovante'),
        'url', a->>'url',
        'mime', a->>'tipo',
        'em', a->>'em'
      ) AS item,
      t.data_competencia AS ord
    FROM public.fin_transacoes t
    LEFT JOIN public.fin_contas c ON c.id = t.conta_id
    CROSS JOIN LATERAL jsonb_array_elements(t.anexos_url) a
    WHERE jsonb_typeof(t.anexos_url) = 'array'
      AND jsonb_array_length(t.anexos_url) > 0
      AND (p_conta  IS NULL OR t.conta_id = p_conta)
      AND (p_inicio IS NULL OR t.data_competencia >= p_inicio)
      AND (p_fim    IS NULL OR t.data_competencia <= p_fim)
      AND (p_q      IS NULL OR t.descricao ILIKE '%'||p_q||'%')
  ),
  notas AS (
    SELECT
      jsonb_build_object(
        'origem','nota',
        'ref_id', n.id,
        'descricao', trim('NF '||COALESCE(n.numero,'')||' · '||COALESCE(n.emitente_nome,'')),
        'valor', n.valor,
        'data', COALESCE(n.data_emissao, n.created_at::date),
        'conta', NULL,
        'arquivo', 'nota-'||COALESCE(n.numero, left(n.id::text,8)),
        'url', p_base||'/storage/v1/object/public/log-arquivos/'||n.storage_path,
        'mime', 'application/pdf',
        'em', n.created_at,
        'transacao_id', n.transacao_id
      ) AS item,
      COALESCE(n.data_emissao, n.created_at::date) AS ord
    FROM public.log_notas_fiscais n
    WHERE n.storage_path IS NOT NULL
      AND (p_inicio IS NULL OR COALESCE(n.data_emissao, n.created_at::date) >= p_inicio)
      AND (p_fim    IS NULL OR COALESCE(n.data_emissao, n.created_at::date) <= p_fim)
      AND (p_q      IS NULL OR n.numero ILIKE '%'||p_q||'%' OR n.emitente_nome ILIKE '%'||p_q||'%')
  )
  SELECT COALESCE(jsonb_agg(item ORDER BY ord DESC NULLS LAST), '[]'::jsonb)
  FROM (SELECT item, ord FROM anexos UNION ALL SELECT item, ord FROM notas) u;
$function$;
