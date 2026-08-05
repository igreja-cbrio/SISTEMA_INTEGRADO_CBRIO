-- ============================================================================
-- Totem · IDENTIDADE DE ESTAÇÃO (2026-08-05)
--
-- Contexto: o totem de inscrições vai receber DINHEIRO (Pix agora, cartão em
-- pinpad depois), e hoje não existe forma de saber QUAL totem cobrou. A
-- autenticação de totem é conta de e-mail/senha por computador
-- (20260703160000_totem_membro_kiosk.sql): senha compartilhada num PC de hall,
-- sem revogação por dispositivo.
--
-- ⚠️ POR QUE TABELA NOVA E NÃO GENERALIZAR `kids_estacoes`:
--   1. `kids_estacoes` está amarrada ao domínio Kids (`sala_id → kids_salas`,
--      `tipo CHECK ('manned','self','roster')`) e tem FKs VIVAS de
--      `kids_checkins.estacao_checkin_id` e `kids_etiquetas_log.estacao_id`.
--      Estender arrasta dado de MENOR (LGPD) pra dentro do caminho do dinheiro.
--   2. O modelo de token dela é exatamente o anti-padrão a evitar: UM token,
--      em TEXTO PURO, na PRÓPRIA linha da estação (`token_pareamento`), numa
--      tabela cuja RLS permite SELECT a qualquer `authenticated` — ou seja, um
--      SELECT de leitura entrega a credencial de todos os totens. Impede
--      rotação sem perder histórico e impede dois navegadores na mesma estação.
--   3. O pareamento do Kids NUNCA foi implementado (grep `parear` em backend/
--      e src/ = zero; o front manda `estacao_id: null` e o backend engole o
--      erro de FK regravando null). Não há dado a migrar — só um plano morto.
--
-- `kids_estacoes` NÃO é dropada nem alterada: ganha só COMMENT de depreciação.
--
-- ⚠️ SEM `deleted_at`/whitelist de soft-delete DE PROPÓSITO: não há PII aqui
-- (é cadastro de DISPOSITIVO). Estação sai de operação por `ativo=false` /
-- `revogada_em`, que é o que o middleware lê — e o histórico de
-- `pag_cobrancas.estacao_id` precisa continuar resolvendo pra sempre. Mesma
-- decisão de `pag_provider_saude` (20260803140000).
-- ============================================================================

-- ─── 1. Estação ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.totem_estacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Aparece no comprovante impresso e no "chame um voluntário" da tela de erro.
  -- Curto e legível de longe: é o que a pessoa lê em voz alta no telefone.
  codigo text NOT NULL UNIQUE CHECK (codigo ~ '^[a-z0-9][a-z0-9-]{1,30}$'),
  nome text NOT NULL,

  -- Array e não `tipo`: um PC do hall pode servir inscrições hoje e check-in
  -- amanhã sem virar duas linhas (duas linhas = dois pareamentos no mesmo PC).
  finalidades text[] NOT NULL DEFAULT ARRAY['inscricoes']::text[]
    CHECK (finalidades <@ ARRAY['inscricoes','kids','membro','voluntariado']::text[]
           AND array_length(finalidades, 1) >= 1),

  local text,
  igreja_id uuid REFERENCES public.igrejas(id) ON DELETE SET NULL,

  -- Totem parado ao lado do banner do retiro abre direto nele.
  evento_fixo_id uuid REFERENCES public.insc_eventos(id) ON DELETE SET NULL,

  -- ── Pinpad TEF (preenchido quando o cartão presencial entrar) ──
  -- Mora AQUI e não numa `tef_terminais` própria: a estação É o lugar físico
  -- com um PC, um pinpad e (talvez) uma impressora. Com duas tabelas haveria
  -- duas verdades sobre "qual maquininha é essa", e a cadeia que a conciliação
  -- precisa (cobrança → estação → série do pinpad → liquidação) deixaria de
  -- ser um join.
  tef_provider text CHECK (tef_provider IS NULL OR tef_provider IN ('paygo','sitef')),
  tef_terminal_serie text,
  tef_terminal_logico text,
  tef_ativo boolean NOT NULL DEFAULT false,

  -- ── Impressora (mesmo shape de kids_estacoes pra reusar a técnica de
  --    src/pages/ministerial/totemKids/lib/imprimir.ts) ──
  printer_target text,
  printer_modelo text DEFAULT 'QL-820NWB',
  printer_largura_mm numeric DEFAULT 80,
  printer_altura_mm numeric,

  -- ── Controle ──
  ativo boolean NOT NULL DEFAULT true,

  -- ⚠️ A mitigação mais barata e mais eficaz contra token exfiltrado: a igreja
  -- tem IP fixo, então token copiado não funciona da casa de ninguém. VAZIO
  -- significa "não exige" (evento fora de sede) — decisão a registrar caso a
  -- caso, não default silencioso.
  ip_permitidos inet[],

  revogada_em timestamptz,
  revogada_por uuid,          -- snapshot sem FK: quem revogou pode sair da igreja
  revogada_motivo text,

  -- ── Observabilidade (heartbeat do dispositivo e do agente) ──
  ultima_batida_em timestamptz,
  ultimo_ip text,
  ultimo_user_agent text,
  versao_app text,

  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT chk_totem_estacoes_revogacao
    CHECK (revogada_em IS NULL OR (revogada_motivo IS NOT NULL AND length(btrim(revogada_motivo)) >= 3))
);

COMMENT ON TABLE public.totem_estacoes IS
  'Dispositivo de autoatendimento (PC + touch + talvez pinpad/impressora). Cadastro de EQUIPAMENTO, sem PII. Genérica de propósito: serve inscrições agora e os outros totens por adição.';
COMMENT ON COLUMN public.totem_estacoes.ip_permitidos IS
  'Se preenchido, o middleware EXIGE match. Vazio = não exige (registrar a decisão).';
COMMENT ON COLUMN public.totem_estacoes.tef_terminal_serie IS
  'Série do pinpad. É o elo entre a nossa transação e a linha do adquirente na conciliação.';

CREATE INDEX IF NOT EXISTS totem_estacoes_ativas_idx
  ON public.totem_estacoes (codigo) WHERE ativo AND revogada_em IS NULL;

-- ─── 2. Tokens ────────────────────────────────────────────────────────────
-- Tabela SEPARADA da estação (não coluna) porque: rotação sem perder
-- histórico, dispositivo + agente TEF na mesma estação com segredos
-- diferentes, e revogação individual auditável.
CREATE TABLE IF NOT EXISTS public.totem_estacao_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  estacao_id uuid NOT NULL REFERENCES public.totem_estacoes(id) ON DELETE CASCADE,

  --   pareamento  = código curto de uso único que o voluntário digita (15 min)
  --   dispositivo = segredo do NAVEGADOR do totem
  --   agente      = segredo do serviço Windows que fala com o pinpad
  tipo text NOT NULL CHECK (tipo IN ('pareamento','dispositivo','agente')),

  -- ⚠️ SÓ O HASH. O segredo é devolvido UMA vez, na emissão, e nunca é
  -- gravado. Se um dia alguém "precisar ver o token de novo", a resposta é
  -- emitir outro — não é limitação, é o desenho.
  token_hash text NOT NULL UNIQUE,
  prefixo text NOT NULL,      -- 8 primeiros chars · só pra UI reconhecer a linha

  rotulo text,                -- 'PC do hall · Chrome 141'

  -- Sobrevive à rotação. Duas origens rotacionando a MESMA linhagem = clone.
  linhagem uuid NOT NULL DEFAULT gen_random_uuid(),

  criado_por uuid,            -- snapshot sem FK (mesma razão de revogada_por)
  expira_em timestamptz,      -- pareamento: +15min · dispositivo/agente: +90d

  pareado_em timestamptz,
  pareado_ip text,
  pareado_user_agent text,
  usado_em timestamptz,       -- pareamento: marca o uso único

  ultimo_uso_em timestamptz,
  revogado_em timestamptz,
  revogado_por uuid,
  revogado_motivo text,

  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.totem_estacao_tokens IS
  'Credenciais de dispositivo/agente por estação. Guarda SÓ sha256 do segredo. Nunca legível por authenticated — a UI lê pelo backend (prefixo, estado, datas).';

CREATE INDEX IF NOT EXISTS totem_estacao_tokens_vivos_idx
  ON public.totem_estacao_tokens (estacao_id, tipo) WHERE revogado_em IS NULL;
CREATE INDEX IF NOT EXISTS totem_estacao_tokens_linhagem_idx
  ON public.totem_estacao_tokens (linhagem);

-- ─── 3. updated_at ────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_totem_estacoes_touch()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_totem_estacoes_touch ON public.totem_estacoes;
CREATE TRIGGER trg_totem_estacoes_touch
  BEFORE UPDATE ON public.totem_estacoes
  FOR EACH ROW EXECUTE FUNCTION public.fn_totem_estacoes_touch();

-- ─── 4. Audit log ─────────────────────────────────────────────────────────
-- Superfície de segurança: ligar/desligar estação, ligar TEF, mexer no cerco
-- de IP e revogar credencial são atos que precisam de autoria.
DROP TRIGGER IF EXISTS trg_audit_totem_estacoes ON public.totem_estacoes;
CREATE TRIGGER trg_audit_totem_estacoes
  AFTER INSERT OR UPDATE OR DELETE ON public.totem_estacoes
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_changes(
    'ativo,revogada_em,tef_ativo,tef_terminal_serie,ip_permitidos,evento_fixo_id'
  );

DROP TRIGGER IF EXISTS trg_audit_totem_estacao_tokens ON public.totem_estacao_tokens;
CREATE TRIGGER trg_audit_totem_estacao_tokens
  AFTER INSERT OR UPDATE OR DELETE ON public.totem_estacao_tokens
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_changes(
    'revogado_em,usado_em,tipo,estacao_id'
  );

-- ─── 5. RLS ───────────────────────────────────────────────────────────────
ALTER TABLE public.totem_estacoes        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.totem_estacao_tokens  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS totem_estacoes_select ON public.totem_estacoes;
CREATE POLICY totem_estacoes_select ON public.totem_estacoes
  FOR SELECT TO authenticated
  USING (
    public.is_super_admin()
    OR public.current_user_module_level('inscricoes') >= 1
  );

-- Criar/parear/revogar estação é nível 4: quem faz isso decide qual
-- equipamento pode receber dinheiro em nome da igreja.
DROP POLICY IF EXISTS totem_estacoes_write ON public.totem_estacoes;
CREATE POLICY totem_estacoes_write ON public.totem_estacoes
  FOR ALL TO authenticated
  USING (public.is_super_admin() OR public.current_user_module_level('inscricoes') >= 4)
  WITH CHECK (public.is_super_admin() OR public.current_user_module_level('inscricoes') >= 4);

DROP POLICY IF EXISTS totem_estacoes_service ON public.totem_estacoes;
CREATE POLICY totem_estacoes_service ON public.totem_estacoes
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ⚠️ NENHUMA policy pra `authenticated` em totem_estacao_tokens — nem SELECT.
-- Um SELECT aqui pela anon key entregaria o material de todas as credenciais
-- (é o furo que `kids_estacoes` tem hoje). Só service_role.
DROP POLICY IF EXISTS totem_estacao_tokens_service ON public.totem_estacao_tokens;
CREATE POLICY totem_estacao_tokens_service ON public.totem_estacao_tokens
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ─── 6. Depreciar o pareamento morto do Kids ──────────────────────────────
DO $$
BEGIN
  IF to_regclass('public.kids_estacoes') IS NOT NULL THEN
    EXECUTE $c$
      COMMENT ON COLUMN public.kids_estacoes.token_pareamento IS
        'DEPRECIADO (2026-08-05) · o pareamento planejado em 20260521220000 nunca foi implementado (nenhuma rota, nenhum leitor) e o modelo era inseguro (token em texto puro, legível por qualquer authenticated). Identidade de dispositivo agora vive em public.totem_estacoes + totem_estacao_tokens. NÃO usar esta coluna.'
    $c$;
    RAISE NOTICE '[totem] kids_estacoes.token_pareamento marcada como depreciada';
  END IF;
END $$;

-- ─── Conferência (rodar no SQL Editor · o Editor não mostra RAISE NOTICE) ──
-- select table_name, column_name, data_type from information_schema.columns
--  where table_name in ('totem_estacoes','totem_estacao_tokens') order by 1,2;
-- select tablename, policyname, roles, cmd from pg_policies
--  where tablename in ('totem_estacoes','totem_estacao_tokens') order by 1,2;
-- select indexname from pg_indexes where tablename like 'totem_estaca%';
-- select conname, contype from pg_constraint
--  where conrelid in ('public.totem_estacoes'::regclass,'public.totem_estacao_tokens'::regclass);
