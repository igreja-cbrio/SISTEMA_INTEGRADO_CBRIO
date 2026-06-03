-- Juninho (presidente) · restringe o acesso a 3 telas
-- ============================================================================
-- Marcos: o Pr. Juninho (presidente) deve ver SÓ 3 telas — Dashboard do sistema,
-- Monitoramento OKR e Dashboard Semanal — pra não se confundir enquanto o time
-- desenvolve o resto do sistema. Manter o CARGO pastor-presidente (só ele tem),
-- mas rebaixar o acesso.
--
-- Conta ATIVA = juninho.lit@cbrio.org (a juninho@cbrio.com.br está abandonada
-- desde abr/2026 · é a duplicata conhecida).
--
-- MECÂNICA (o frontend trata role diretor/admin como "vê tudo" via
-- isAdmin = ['admin','diretor'] · então só zerar a matriz não bastaria):
-- 1. profiles.role 'diretor' → 'membro' (não-admin · destrava o filtro de menu).
--    NÃO mexe no cargo (usuarios.cargo_id segue pastor-presidente · /perfil
--    continua mostrando "Pastor Presidente"). is_membro_only=false → cai no
--    /dashboard ao logar (não vira webapp de devocional).
-- 2. Zera a matriz do cargo pastor-presidente (só o Juninho o possui) → some
--    todo item de menu gateado por módulo.
--
-- As 3 telas-alvo têm rota aberta (sem ModuleGuard) e dado via endpoint
-- authenticate-only: /dashboard (landing pós-login), /dashboard-semanal e
-- /monitoramento-okr (itens de menu SEM `module` no AppShell · aparecem mesmo
-- com a matriz zerada, como o Dashboard Semanal já era).
--
-- ⚠️ DEPOIS de aplicar: bust de cache do middleware
-- (POST /api/permissoes/cache/bust ou botão em /admin/permissoes) +
-- Juninho faz logout/login pra renovar o JWT.
-- ============================================================================

-- 1. Rebaixa o role legado da conta ativa (mantém cargo + nome de exibição)
UPDATE public.profiles
   SET role = 'membro',
       is_membro_only = false
 WHERE lower(email) = 'juninho.lit@cbrio.org';

-- 2. Zera a matriz do cargo pastor-presidente (apenas o Juninho o possui).
--    Módulos sem linha pra esse cargo já resolvem 0 por padrão no middleware.
UPDATE public.cargo_modulo_permissao
   SET nivel = 0,
       pode_exportar = false,
       pode_aprovar = false,
       escopo_proprio = false
 WHERE cargo_id = (SELECT id FROM public.cargos WHERE slug = 'pastor-presidente');
