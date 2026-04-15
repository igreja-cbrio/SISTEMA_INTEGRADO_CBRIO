-- ═══════════════════════════════════════════════════════════
-- mem_qrcodes — mapa reverso token → CPF para QR de identidade
-- ═══════════════════════════════════════════════════════════
-- O token do QR do membro é SHA256(salt + CPF)[:24] — determinístico
-- mas unidirecional. Para que o staff possa escanear o QR e recuperar
-- o perfil do membro, precisamos armazenar o mapeamento reverso.
--
-- A tabela é populada lazy (quando o membro pede o passe da wallet)
-- e consultada pelo endpoint autenticado GET /membresia/qr-lookup/:token.
--
-- Guarda CPF (não member_id) para suportar tanto membros aprovados
-- em mem_membros quanto cadastros ainda em mem_cadastros_pendentes.

CREATE TABLE IF NOT EXISTS public.mem_qrcodes (
  token text PRIMARY KEY,
  cpf text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_mem_qrcodes_cpf
  ON public.mem_qrcodes(cpf);

-- RLS: somente service_role acessa (backend usa bypass).
-- Anon e authenticated não precisam ler/escrever direto.
ALTER TABLE public.mem_qrcodes ENABLE ROW LEVEL SECURITY;
