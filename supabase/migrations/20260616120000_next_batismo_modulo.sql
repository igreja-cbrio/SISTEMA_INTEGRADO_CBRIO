-- ============================================================================
-- Módulo "Next - Batismo" · "check de pessoas" do Kevyn (Fase 1)
--
-- Marcos (2026-06-15): reorganizar o funil decisão→membro. O módulo é só
-- RESOLUÇÃO DE IDENTIDADE (não faz CRUD/presença · Integração confirma presença
-- e consome as identidades limpas). Princípio: GUARDAR NA ORIGEM (membroMatch já
-- evita duplicar no cadastro) e o que ficou DUVIDOSO vira a fila do Kevyn — que
-- liga a inscrição ao membro certo e funde os stubs. NUNCA auto-funde em match
-- fraco (família compartilha telefone/e-mail · juntar 2 pessoas distintas é pior
-- que duplicata · quase irreversível).
--
-- Permission-gated (~5% veem): Integração + Marcelo (supervisor-jornada, que só
-- SUPERVISIONA pela NSM/painel) caem dentro pela matriz; o Kevyn (operador) ganha
-- override de menor privilégio.
--
-- ADITIVA · idempotente · SEM TABELA NOVA. A fila é COMPUTADA das tabelas do
-- funil (cui_convertidos · next_inscricoes · batismo_inscricoes · mem_membros);
-- "resolvido" = a condição some (membro_id carimbado / par fundido via
-- merge_membros / par em mem_duplicados_ignorados). Reusa merge_membros (v2,
-- dinâmico) + mem_duplicados_ignorados + mem_merge_log.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Módulo `next-batismo` no catálogo + matriz default (copiada de `next`)
--    `next` é a melhor base: já cobre Integração + supervisor-jornada (Marcelo)
--    + admin/dev. A gating fina (quem realmente vê) o Marcos ajusta depois em
--    /admin/permissoes. O Kevyn entra por override (bloco 4).
-- ----------------------------------------------------------------------------
INSERT INTO public.modulos (slug, nome, rota, categoria, ordem, descricao, ativo)
SELECT 'next-batismo', 'Next - Batismo', '/next-batismo', 'ministerial', 305,
       'Check de pessoas do funil de novos convertidos · liga inscrição (Next/Batismo) ao membro certo e funde cadastros duplicados',
       true
WHERE NOT EXISTS (SELECT 1 FROM public.modulos WHERE slug = 'next-batismo');

DO $$
DECLARE base_modulo_id int;
BEGIN
  SELECT id INTO base_modulo_id FROM public.modulos WHERE slug = 'next';
  IF base_modulo_id IS NULL THEN
    RAISE NOTICE 'Módulo base next não encontrado · matriz de next-batismo não seedada';
  ELSE
    INSERT INTO public.cargo_modulo_permissao
      (cargo_id, modulo_id, nivel, pode_exportar, pode_aprovar, escopo_proprio)
    SELECT cmp.cargo_id, novo.id, cmp.nivel, cmp.pode_exportar, cmp.pode_aprovar, cmp.escopo_proprio
      FROM public.cargo_modulo_permissao cmp
      CROSS JOIN public.modulos novo
     WHERE cmp.modulo_id = base_modulo_id
       AND novo.slug = 'next-batismo'
    ON CONFLICT (cargo_id, modulo_id) DO NOTHING;
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 2. Índice trigram em lower(nome) · acelera similaridade de nome
--    (detecção de duplicata sem CPF/nascimento + sugestão de candidatos).
-- ----------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_mem_membros_nome_trgm
  ON public.mem_membros USING gin ((lower(nome)) gin_trgm_ops);

-- ----------------------------------------------------------------------------
-- 3. View vw_nb_duplicados_suspeitos · duplicatas DO FUNIL NOVO
--
-- Estende a vw_membros_duplicados (que exige nascimento OU CPF no critério de
-- nome similar · cego ao convertido que não tem nenhum dos dois) com:
--   - critério 'nome_parecido' (similarity >= 0.82, ≥2 palavras) SEM chave forte
--     · confiança baixa (60) → SÓ revisão humana, jamais auto-merge
-- Restringe ao "universo novo" (stub/visitante/convertido/recém-criado) pra
-- bound do self-join trigram e foco no funil. Pares em mem_duplicados_ignorados
-- ficam de fora (reusa a tabela do módulo Membresia).
--
-- Mesmas colunas da vw_membros_duplicados → o backend reusa a mesma reshape.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.vw_nb_duplicados_suspeitos AS
WITH novo AS (
  -- onde mora o convertido recém-chegado
  SELECT m.id
  FROM public.mem_membros m
  WHERE m.deleted_at IS NULL
    AND (
      m.status IN ('visitante', 'frequentador')
      OR m.created_at >= now() - interval '12 months'
      OR EXISTS (
        SELECT 1 FROM public.cui_convertidos c
        WHERE c.membro_id = m.id AND c.deleted_at IS NULL
      )
    )
),
pares AS (
  -- Mesmo CPF (chave forte · ambos têm)
  SELECT LEAST(a.id, b.id)::uuid AS membro_a_id,
         GREATEST(a.id, b.id)::uuid AS membro_b_id,
         'cpf_igual' AS motivo, 100 AS confianca
  FROM public.mem_membros a
  JOIN public.mem_membros b
    ON a.id < b.id
   AND regexp_replace(a.cpf, '\D', '', 'g') = regexp_replace(b.cpf, '\D', '', 'g')
   AND length(regexp_replace(a.cpf, '\D', '', 'g')) = 11
  WHERE a.deleted_at IS NULL AND b.deleted_at IS NULL
    AND (a.id IN (SELECT id FROM novo) OR b.id IN (SELECT id FROM novo))

  UNION

  -- Mesmo telefone
  SELECT LEAST(a.id, b.id)::uuid, GREATEST(a.id, b.id)::uuid,
         'telefone_igual', 90
  FROM public.mem_membros a
  JOIN public.mem_membros b
    ON a.id < b.id
   AND regexp_replace(a.telefone, '\D', '', 'g') = regexp_replace(b.telefone, '\D', '', 'g')
   AND length(regexp_replace(a.telefone, '\D', '', 'g')) >= 10
  WHERE a.deleted_at IS NULL AND b.deleted_at IS NULL
    AND (a.id IN (SELECT id FROM novo) OR b.id IN (SELECT id FROM novo))

  UNION

  -- Mesmo email
  SELECT LEAST(a.id, b.id)::uuid, GREATEST(a.id, b.id)::uuid,
         'email_igual', 85
  FROM public.mem_membros a
  JOIN public.mem_membros b
    ON a.id < b.id
   AND lower(trim(a.email)) = lower(trim(b.email))
   AND a.email IS NOT NULL
   AND length(trim(a.email)) > 3
  WHERE a.deleted_at IS NULL AND b.deleted_at IS NULL
    AND (a.id IN (SELECT id FROM novo) OR b.id IN (SELECT id FROM novo))

  UNION

  -- Mesmo nome + data nascimento (quando o convertido informou nascimento)
  SELECT LEAST(a.id, b.id)::uuid, GREATEST(a.id, b.id)::uuid,
         'nome_e_nascimento', 95
  FROM public.mem_membros a
  JOIN public.mem_membros b
    ON a.id < b.id
   AND lower(trim(a.nome)) = lower(trim(b.nome))
   AND a.data_nascimento = b.data_nascimento
   AND a.data_nascimento IS NOT NULL
  WHERE a.deleted_at IS NULL AND b.deleted_at IS NULL
    AND (a.id IN (SELECT id FROM novo) OR b.id IN (SELECT id FROM novo))

  UNION

  -- *** NOVO *** Nome muito parecido SEM chave forte · só revisão humana
  -- (o caso do convertido: nome quase igual, telefone digitado errado, sem CPF)
  SELECT LEAST(a.id, b.id)::uuid, GREATEST(a.id, b.id)::uuid,
         'nome_parecido', 60
  FROM public.mem_membros a
  JOIN public.mem_membros b
    ON a.id < b.id
   AND similarity(lower(a.nome), lower(b.nome)) >= 0.82
   AND array_length(regexp_split_to_array(trim(a.nome), '\s+'), 1) >= 2
   AND array_length(regexp_split_to_array(trim(b.nome), '\s+'), 1) >= 2
  WHERE a.deleted_at IS NULL AND b.deleted_at IS NULL
    AND (a.id IN (SELECT id FROM novo) OR b.id IN (SELECT id FROM novo))
),
pares_agrupados AS (
  SELECT membro_a_id, membro_b_id,
         array_agg(motivo ORDER BY confianca DESC) AS motivos,
         max(confianca) AS confianca
  FROM pares
  GROUP BY membro_a_id, membro_b_id
)
SELECT
  pa.membro_a_id, pa.membro_b_id, pa.motivos, pa.confianca,
  a.nome AS a_nome, a.email AS a_email, a.telefone AS a_telefone, a.cpf AS a_cpf,
  a.data_nascimento AS a_nascimento, a.status AS a_status, a.foto_url AS a_foto_url, a.created_at AS a_criado_em,
  b.nome AS b_nome, b.email AS b_email, b.telefone AS b_telefone, b.cpf AS b_cpf,
  b.data_nascimento AS b_nascimento, b.status AS b_status, b.foto_url AS b_foto_url, b.created_at AS b_criado_em
FROM pares_agrupados pa
JOIN public.mem_membros a ON a.id = pa.membro_a_id
JOIN public.mem_membros b ON b.id = pa.membro_b_id
WHERE NOT EXISTS (
  SELECT 1 FROM public.mem_duplicados_ignorados ign
   WHERE ign.membro_a_id = pa.membro_a_id
     AND ign.membro_b_id = pa.membro_b_id
);

-- View com PII · só o backend (service_role) lê · o front sempre passa pelo
-- /api/next-batismo (authorizeModule). NÃO conceder a `authenticated`.
GRANT SELECT ON public.vw_nb_duplicados_suspeitos TO service_role;

COMMENT ON VIEW public.vw_nb_duplicados_suspeitos IS
  'Fase 1 Next-Batismo · duplicatas do funil novo (convertido recém-chegado). Estende vw_membros_duplicados com nome_parecido sem chave forte (revisão humana, nunca auto-merge). Restrito ao universo novo + exclui mem_duplicados_ignorados.';

-- ----------------------------------------------------------------------------
-- 4. Acesso do Kevyn (operador da fila) · override de menor privilégio
--    nível 3 (ligar/fundir) SÓ no next-batismo · nada além.
--    ⚠️ Trocar o e-mail abaixo pelo login real do Kevyn antes de aplicar.
--    INSERT ... SELECT resolve usuário+módulo pelos TIPOS NATIVOS das colunas
--    (em prod usuarios.id e modulos.id são INTEGER, não uuid · drift conhecido)
--    → robusto ao tipo. No-op se o Kevyn ainda não logou (sem linha em usuarios);
--    nesse caso, conceder por /admin/permissoes após o 1º login dele.
-- ----------------------------------------------------------------------------
INSERT INTO public.permissoes_modulo (usuario_id, modulo_id, nivel_leitura, nivel_escrita)
SELECT u.id, m.id, 3, 3
  FROM public.usuarios u
  CROSS JOIN public.modulos m
 WHERE m.slug = 'next-batismo'
   AND LOWER(TRIM(u.email)) = LOWER(TRIM('KEVYN_EMAIL_AQUI'))
ON CONFLICT (usuario_id, modulo_id) DO UPDATE
  SET nivel_leitura = 3, nivel_escrita = 3;

-- ----------------------------------------------------------------------------
-- Conferência:
--   SELECT count(*) FROM vw_nb_duplicados_suspeitos;
--   SELECT membro_a_id, membro_b_id, motivos, confianca FROM vw_nb_duplicados_suspeitos ORDER BY confianca DESC LIMIT 20;
--   SELECT slug, nome, rota FROM modulos WHERE slug = 'next-batismo';
-- ============================================================================
