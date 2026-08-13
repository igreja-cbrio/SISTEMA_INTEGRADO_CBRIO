-- Log de alterações do módulo Grupos (pedido do Marcos · 2026-07-20).
-- Contexto: a Naná está saneando a listagem de grupos e hoje não há como saber
-- O QUE mudou, QUANDO e (quando houver JWT de usuário) POR QUEM em mem_grupos/
-- mem_grupo_membros — created_at só data o INSERT; updated_at é sobrescrito em
-- massa; edição/remoção não deixa rastro.
-- Solução: estender o audit log genérico já existente (app_audit_log +
-- audit_log_changes() · migration 20260521230000, imutável, RLS só
-- super-admin lê direto — a leitura do módulo é via backend/service role com
-- guard grupos>=3). Sem TG_ARGV[0] → audita TODAS as colunas alteradas
-- (exceto created_at/updated_at); INSERT/DELETE gravam a linha completa.
-- NOTA: escrita via backend (service role) fica com autor nulo (auth.uid()
-- vazio) — o log garante o quê/quando; autoria por request é evolução futura.
-- Idempotente e backwards-compatible: o código funciona sem ela (log vazio).

DROP TRIGGER IF EXISTS trg_audit_mem_grupos ON public.mem_grupos;
CREATE TRIGGER trg_audit_mem_grupos
AFTER INSERT OR UPDATE OR DELETE ON public.mem_grupos
FOR EACH ROW EXECUTE FUNCTION public.audit_log_changes();

DROP TRIGGER IF EXISTS trg_audit_mem_grupo_membros ON public.mem_grupo_membros;
CREATE TRIGGER trg_audit_mem_grupo_membros
AFTER INSERT OR UPDATE OR DELETE ON public.mem_grupo_membros
FOR EACH ROW EXECUTE FUNCTION public.audit_log_changes();

COMMENT ON TRIGGER trg_audit_mem_grupos ON public.mem_grupos IS
  'Audit log de grupos (app_audit_log) · todas as colunas · 2026-07-20';
COMMENT ON TRIGGER trg_audit_mem_grupo_membros ON public.mem_grupo_membros IS
  'Audit log das participações de grupos (app_audit_log) · todas as colunas · 2026-07-20';
