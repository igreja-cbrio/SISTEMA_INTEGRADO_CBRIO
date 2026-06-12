-- ============================================================================
-- Limpeza · desativa cargos e modulos legados sem slug
-- ============================================================================
-- Identificados na auditoria de 2026-05-19:
--   cargos (slug=null): "Acesso negado", "Acesso assistente", "Acesso líder",
--     "Acesso diretor", "Acesso admin" · sobras do modelo "5 niveis por modulo"
--   modulos (slug=null): "Banco de Arquivos", "Cultura" · nao migrados pra
--     estrutura nova
--
-- Desativamos (ativo=false) em vez de DELETE pra preservar FKs historicas
-- em permissoes_modulo, cargo_modulo_permissao, etc.
-- ============================================================================

UPDATE public.cargos
   SET ativo = false
 WHERE slug IS NULL
   AND ativo = true;

UPDATE public.modulos
   SET ativo = false
 WHERE slug IS NULL
   AND ativo = true;

-- Conferencia:
-- SELECT count(*) AS cargos_legado_desativados FROM cargos WHERE slug IS NULL AND ativo = false;
-- SELECT count(*) AS modulos_legado_desativados FROM modulos WHERE slug IS NULL AND ativo = false;
-- Esperado: cargos=5, modulos=2
