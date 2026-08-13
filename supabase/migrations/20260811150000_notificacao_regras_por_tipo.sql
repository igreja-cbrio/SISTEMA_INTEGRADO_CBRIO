-- ============================================================================
-- Regra de notificação por TIPO, não só por módulo — 2026-08-11
--
-- Pedido do Matheus, ao receber no app do Staff o alerta técnico
-- "Webhook de pagamento recusado": *"esse tipo de notificação deve chegar
-- apenas para mim e pro Marcos Paulo"*.
--
-- ⚠️ Não dava: `notificacao_regras` só tinha (modulo, profile_id), e o módulo
-- `inscricoes` emite três coisas de naturezas MUITO diferentes — medido em 30
-- dias, todas indo pros mesmos 16 admin/diretor por fallback:
--     nova_inscricao ............. 2.146 avisos  (operacional, da coordenação)
--     inscricao_paga .............    47 avisos  (operacional)
--     webhook_pagamento_recusado .    23 avisos  (TÉCNICO, de quem mantém)
-- Restringir por módulo tiraria a coordenação do feed de inscrição nova — que
-- ninguém pediu. Faltava a dimensão do TIPO.
--
-- `tipo` NULL = "todos os tipos do módulo", que é exatamente o comportamento de
-- hoje. Nenhuma das 29 regras existentes muda de efeito.
--
-- ⚠️ A UNIQUE tinha de mudar junto: com a coluna nova, a mesma pessoa pode ter
-- regra do módulo E regra de um tipo específico. Mas `NULLS DISTINCT` (o padrão)
-- deixaria DUAS linhas com tipo NULL pro mesmo (modulo, profile_id) — perdendo a
-- garantia que existe hoje. Daí **NULLS NOT DISTINCT** (PG 15+; este banco é
-- 17.6): NULL passa a comparar igual a NULL e a duplicata segue barrada.
--
-- ⚠️ O nome da UNIQUE importa: `routes/notificacoes.js` faz upsert com
-- `onConflict: 'modulo,profile_id'`. O código foi ajustado para
-- `modulo,tipo,profile_id` NA MESMA PR — ON CONFLICT que não casa com índice
-- existente é erro em tempo de execução, não de deploy.
-- ============================================================================

ALTER TABLE public.notificacao_regras
  ADD COLUMN IF NOT EXISTS tipo text;

COMMENT ON COLUMN public.notificacao_regras.tipo IS
  'Tipo específico da notificação (ex.: webhook_pagamento_recusado). NULL = vale para TODOS os tipos do módulo — é o comportamento histórico. Regra de tipo específico VENCE a regra do módulo (ver resolverDestinatarios em services/notificar.js).';

-- Troca a UNIQUE (modulo, profile_id) por (modulo, tipo, profile_id).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.notificacao_regras'::regclass
       AND conname  = 'notificacao_regras_modulo_profile_id_key'
  ) THEN
    ALTER TABLE public.notificacao_regras
      DROP CONSTRAINT notificacao_regras_modulo_profile_id_key;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.notificacao_regras'::regclass
       AND conname  = 'notificacao_regras_modulo_tipo_profile_key'
  ) THEN
    ALTER TABLE public.notificacao_regras
      ADD CONSTRAINT notificacao_regras_modulo_tipo_profile_key
      UNIQUE NULLS NOT DISTINCT (modulo, tipo, profile_id);
  END IF;
END $$;

-- Índice de leitura: o resolver filtra por (modulo, ativo) a cada notificação.
CREATE INDEX IF NOT EXISTS idx_notificacao_regras_modulo_ativo
  ON public.notificacao_regras (modulo, ativo);

-- ── Seed do caso que originou tudo ─────────────────────────────────────────
-- ⚠️ Por e-mail, não por id decorado: id de profile muda entre ambientes e
-- some numa fusão de conta. E `WHERE NOT EXISTS` em vez de ON CONFLICT porque
-- este bloco pode rodar antes de alguém conferir a UNIQUE nova no catálogo.
INSERT INTO public.notificacao_regras (modulo, tipo, profile_id, ativo)
SELECT 'inscricoes', 'webhook_pagamento_recusado', p.id, true
  FROM public.profiles p
-- ⚠️ Existem TRÊS perfis ativos chamados "Marcos Paulo", dois deles admin. O
-- escolhido é o que a evidência aponta como a conta viva: 655 notificações
-- LIDAS em 30 dias, contra ZERO das outras duas. Identidade não se adivinha.
 WHERE lower(p.email) IN ('matheus.toscano@cbrio.org', 'marcospaulo.almeida@cbrio.org')
   AND NOT EXISTS (
     SELECT 1 FROM public.notificacao_regras r
      WHERE r.modulo = 'inscricoes'
        AND r.tipo   = 'webhook_pagamento_recusado'
        AND r.profile_id = p.id
   );

-- ── Conferência (rodar À PARTE, no catálogo — nunca confiar no "success") ───
-- ⚠️ Sem esta conferência não dá pra saber se o seed pegou: se o e-mail do
-- Marcos Paulo for outro, o INSERT insere 1 linha em vez de 2 e não reclama.
--
-- select conname, pg_get_constraintdef(oid)
--   from pg_constraint where conrelid='public.notificacao_regras'::regclass;
--
-- select r.modulo, r.tipo, p.name, p.email, r.ativo
--   from notificacao_regras r join profiles p on p.id = r.profile_id
--  where r.tipo = 'webhook_pagamento_recusado';
