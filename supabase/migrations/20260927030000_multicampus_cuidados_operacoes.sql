-- Cuidados: exclusão lógica atômica com campus validado no registro bloqueado.
-- A whitelist preserva todas as entradas instaladas e acrescenta tabelas que já
-- possuíam deleted_at mas ainda usavam UPDATE manual em rotas legadas.
BEGIN;
DO $$ DECLARE tabelas text[];
BEGIN
  -- União com o catálogo instalado: não remove entradas de outra PR aplicada
  -- entre a auditoria e esta migration.
  SELECT array_agg(DISTINCT t ORDER BY t) INTO tabelas FROM unnest(
    public.app_soft_deletable_tables() || ARRAY['cui_visitas','cui_pedidos','cui_j180_turmas','cui_j180_encontros']::text[]
  ) AS t;
  EXECUTE format('CREATE OR REPLACE FUNCTION public.app_soft_deletable_tables() RETURNS text[] LANGUAGE sql IMMUTABLE AS %L',
    'SELECT ' || quote_literal(tabelas::text) || '::text[]');
END $$;

CREATE OR REPLACE FUNCTION public.fn_campus_soft_delete_cuidados(p_tabela text,p_id uuid,p_igreja_id uuid,p_usuario_id uuid)
RETURNS boolean LANGUAGE plpgsql SET search_path=public AS $$
DECLARE v_id uuid;
BEGIN
  IF p_id IS NULL OR p_igreja_id IS NULL OR p_usuario_id IS NULL OR p_tabela IS NULL OR p_tabela NOT IN ('cui_visitas','cui_pedidos','cui_acompanhamentos','cui_convertidos','cui_jornada180','cui_j180_turmas') THEN
    RAISE EXCEPTION 'Tabela não permitida para esta operação.' USING ERRCODE='P0400';
  END IF;
  EXECUTE format('SELECT id FROM public.%I WHERE id=$1 AND igreja_id=$2 AND deleted_at IS NULL FOR UPDATE',p_tabela)
    INTO v_id USING p_id,p_igreja_id;
  IF v_id IS NULL THEN RETURN false; END IF;
  RETURN public.app_soft_delete(p_tabela,p_id::text,p_usuario_id);
END $$;
REVOKE ALL ON FUNCTION public.fn_campus_soft_delete_cuidados(text,uuid,uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.fn_campus_soft_delete_cuidados(text,uuid,uuid,uuid) TO service_role;
COMMIT;
