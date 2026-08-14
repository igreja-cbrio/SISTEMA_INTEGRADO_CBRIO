-- ============================================================================
-- Foto de perfil do APP passa a aparecer no ERP · backfill do que já existe
-- ============================================================================
-- Pedido do Matheus (13/08/2026): "gostaria que na lista de pessoas tivesse a
-- foto da pessoa (avatar); essas fotos vão vir do app de membros, com o tempo
-- que as pessoas forem usando e colocando suas fotos de perfil."
--
-- ⚠️⚠️ A premissa estava quebrada: as fotos NÃO iam aparecer nunca. O app grava
-- em `profiles.avatar_url` (bucket `avatars` · POST /api/app/membro/foto) e o
-- ERP inteiro lê `mem_membros.foto_url` — lista da Membresia, aba Pessoas do
-- /grupos, roster do grupo, ficha da pessoa. As duas colunas nunca se
-- encontravam. O avatar JÁ estava desenhado nas telas; o que faltava era o dado
-- chegar. O código do endpoint passou a propagar (app.js · 13/08); esta
-- migration cuida de quem JÁ subiu foto antes disso.
--
-- ⚠️ SÓ-ONDE-VAZIO aqui, ao contrário do endpoint (que sobrescreve): no passado
-- não dá pra saber se a foto que está em `mem_membros` é mais nova ou mais
-- velha que a do app, e sobrescrever apagaria foto que a equipe subiu na
-- Membresia. No caminho novo a pessoa está escolhendo a foto AGORA, então lá
-- sobrescrever é o certo.
--
-- ⚠️ Liga pelo vínculo EXPLÍCITO `profiles.membro_id` — nunca por e-mail:
-- família compartilha caixa (lei do Contrato de porta), e a foto do filho
-- pousaria no cadastro da mãe.
--
-- ⚠️ CONSEQUÊNCIA DECLARADA: `mem_membros.foto_url` de quem é LÍDER de grupo já
-- aparece no cartão público de inscrição (publicGrupos · lider_foto). Quem
-- lidera grupo e tem foto no app passa a ter esse rosto na página pública.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1) Backup (rollback = UPDATE do rodapé). Só entram linhas que ESTAVAM vazias,
--    então desfazer é devolver NULL.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public._bk_20260814_membros_foto_app (
  membro_id   uuid PRIMARY KEY,
  profile_id  uuid,
  foto_nova   text,
  snapshot_em timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public._bk_20260814_membros_foto_app (membro_id, profile_id, foto_nova)
SELECT m.id, p.id, p.avatar_url
  FROM public.profiles p
  JOIN public.mem_membros m ON m.id = p.membro_id
 WHERE p.avatar_url IS NOT NULL
   AND btrim(p.avatar_url) <> ''
   AND (m.foto_url IS NULL OR btrim(m.foto_url) = '')
   AND m.deleted_at IS NULL
ON CONFLICT (membro_id) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 2) Aplica exatamente o que foi para o backup
-- ----------------------------------------------------------------------------
UPDATE public.mem_membros m
   SET foto_url = b.foto_nova
  FROM public._bk_20260814_membros_foto_app b
 WHERE m.id = b.membro_id
   AND (m.foto_url IS NULL OR btrim(m.foto_url) = '');

COMMIT;

-- ============================================================================
-- CONFERÊNCIA — rode e me mande o resultado.
-- (Volta como tabela: o SQL Editor do Supabase não mostra RAISE NOTICE.)
--
-- `so_no_app`  = pessoas com foto no app mas SEM vínculo `profiles.membro_id`.
--                Não foram tocadas — sem vínculo explícito não se grava foto em
--                cadastro de ninguém. Elas se resolvem sozinhas quando a pessoa
--                completar o cadastro (o portão de identidade liga o membro) e
--                trocar a foto, porque aí o endpoint propaga.
-- ============================================================================
SELECT
  (SELECT count(*) FROM public._bk_20260814_membros_foto_app)                    AS fotos_publicadas,
  (SELECT count(*) FROM public.profiles
    WHERE avatar_url IS NOT NULL AND btrim(avatar_url) <> ''
      AND membro_id IS NULL)                                                     AS so_no_app,
  (SELECT count(*) FROM public.mem_membros
    WHERE foto_url IS NOT NULL AND btrim(foto_url) <> ''
      AND deleted_at IS NULL)                                                    AS membros_com_foto_agora,
  (SELECT count(*) FROM public.mem_membros WHERE deleted_at IS NULL)             AS membros_vivos;

-- ============================================================================
-- ROLLBACK:
--
--   UPDATE public.mem_membros m SET foto_url = NULL
--     FROM public._bk_20260814_membros_foto_app b
--    WHERE m.id = b.membro_id AND m.foto_url = b.foto_nova;
-- ============================================================================
