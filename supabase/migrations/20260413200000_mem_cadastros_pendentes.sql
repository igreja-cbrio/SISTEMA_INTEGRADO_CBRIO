-- ═══════════════════════════════════════════════════════════
-- Cadastros Pendentes (formulário público)
-- ═══════════════════════════════════════════════════════════

-- Tabela de staging: recebe submissões do formulário público e aguarda
-- aprovação manual antes de virar um mem_membros. Permite revisão e
-- detecção de duplicatas sem poluir a base de membros oficiais.
CREATE TABLE public.mem_cadastros_pendentes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Dados pessoais
  nome text NOT NULL,
  email text,
  telefone text,
  data_nascimento date,
  estado_civil text,
  endereco text,
  bairro text,
  cidade text,
  cep text,
  profissao text,

  -- Como chegou
  como_conheceu text,
  origem text NOT NULL DEFAULT 'site'
    CHECK (origem IN ('site', 'qr_code', 'evento', 'importacao')),

  -- LGPD — consentimento registrado no momento do envio
  aceita_termos boolean NOT NULL DEFAULT false,
  aceita_contato boolean NOT NULL DEFAULT false,
  consentimento_texto text,  -- snapshot do texto aceito

  -- Trilha de revisão
  status text NOT NULL DEFAULT 'pendente'
    CHECK (status IN ('pendente', 'aprovado', 'rejeitado', 'duplicado')),
  duplicado_de_id uuid REFERENCES public.mem_membros(id) ON DELETE SET NULL,
  motivo_rejeicao text,
  aprovado_por uuid,
  aprovado_em timestamptz,
  membro_id uuid REFERENCES public.mem_membros(id) ON DELETE SET NULL,

  -- Auditoria anti-abuso
  ip_origem text,
  user_agent text,
  observacoes text,

  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.mem_cadastros_pendentes ENABLE ROW LEVEL SECURITY;

-- IMPORTANTE: INSERT aberto ao público anônimo (formulário sem login).
-- Leitura e alteração continuam restritas a autenticados.
CREATE POLICY "Public insert mem_cadastros_pendentes"
  ON public.mem_cadastros_pendentes
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated read mem_cadastros_pendentes"
  ON public.mem_cadastros_pendentes
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated update mem_cadastros_pendentes"
  ON public.mem_cadastros_pendentes
  FOR UPDATE
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated delete mem_cadastros_pendentes"
  ON public.mem_cadastros_pendentes
  FOR DELETE
  TO authenticated
  USING (true);

CREATE INDEX idx_mem_cadastros_pendentes_status
  ON public.mem_cadastros_pendentes(status, created_at DESC);
CREATE INDEX idx_mem_cadastros_pendentes_created
  ON public.mem_cadastros_pendentes(created_at DESC);
