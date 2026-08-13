-- Bolsa, desconto e gratuidade POR INSCRITO (pedido do Marcos · 2026-07-30)
--
-- "Tem pessoas que, para ajudarmos, cobramos menos ou até vão de graça."
--
-- ⚠️ A decisão de modelagem, e o motivo dela: **preço é atributo da INSCRIÇÃO,
-- não do evento**. `insc_eventos.valor_centavos` continua sendo o preço de
-- tabela (o que o formulário público mostra e cobra de todo mundo); quem paga
-- diferente carrega isso na PRÓPRIA linha. As alternativas que descartei:
--
--   • "criar um evento paralelo mais barato" → duplica vaga, duplica lista,
--     duplica sorteio, e a pessoa isenta some do retiro de verdade;
--   • "lançar como pago manualmente e pronto" → o dinheiro nunca entrou, então
--     o arrecadado ficaria mentindo (e é justamente o número que ele pediu);
--   • "campo de desconto no evento" → desconto não é do evento, é de quem
--     recebeu a ajuda, com nome e motivo.
--
-- Com o valor na inscrição, a cobrança nasce do valor DELA, o arrecadado
-- continua sendo dinheiro que entrou de fato, e fica registrado quem concedeu e
-- por quê — que é o que uma concessão de benefício exige poder responder depois.
--
-- Aditiva e idempotente. Nada muda pra inscrição existente: `NULL` em
-- `valor_cobrado_centavos` significa "paga o valor de tabela".

-- ── Colunas ───────────────────────────────────────────────────────────────

ALTER TABLE public.inscricoes
  -- Quanto ESTA pessoa paga. NULL = valor do evento. 0 = isenta.
  ADD COLUMN IF NOT EXISTS valor_cobrado_centavos integer,
  ADD COLUMN IF NOT EXISTS bolsa_tipo text,
  ADD COLUMN IF NOT EXISTS bolsa_motivo text,
  -- Autoria da concessão. Snapshot do nome junto porque quem concedeu pode sair
  -- do quadro, e "quem liberou a gratuidade" precisa continuar legível.
  ADD COLUMN IF NOT EXISTS bolsa_por uuid,
  ADD COLUMN IF NOT EXISTS bolsa_por_nome text,
  ADD COLUMN IF NOT EXISTS bolsa_em timestamptz;

-- ⚠️ FK em bloco PRÓPRIO, nunca dentro do `ADD COLUMN IF NOT EXISTS`: quando a
-- coluna já existe, o `IF NOT EXISTS` pula o comando INTEIRO — `REFERENCES`
-- incluído — e o banco fica sem a FK que o arquivo diz ter (lição da
-- `vol_profiles.membresia_id`, 2026-07-30). Auditar no catálogo, não no arquivo.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'inscricoes_bolsa_por_fkey'
  ) THEN
    -- Rede de segurança antes da constraint: a criação da FK não pode depender
    -- de o dado já estar perfeito.
    UPDATE public.inscricoes i SET bolsa_por = NULL
     WHERE bolsa_por IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = i.bolsa_por);
    ALTER TABLE public.inscricoes
      ADD CONSTRAINT inscricoes_bolsa_por_fkey
      FOREIGN KEY (bolsa_por) REFERENCES public.profiles(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ── Coerência ─────────────────────────────────────────────────────────────
-- Bolsa integral = valor zero. Parcial = valor maior que zero (senão é
-- integral) e motivo obrigatório — conceder benefício sem dizer por quê é o
-- tipo de registro que ninguém consegue defender seis meses depois.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_inscricoes_bolsa') THEN
    ALTER TABLE public.inscricoes ADD CONSTRAINT chk_inscricoes_bolsa CHECK (
      (bolsa_tipo IS NULL AND bolsa_motivo IS NULL)
      OR (bolsa_tipo = 'integral' AND valor_cobrado_centavos = 0
          AND bolsa_motivo IS NOT NULL AND length(btrim(bolsa_motivo)) >= 3)
      OR (bolsa_tipo = 'parcial' AND valor_cobrado_centavos > 0
          AND bolsa_motivo IS NOT NULL AND length(btrim(bolsa_motivo)) >= 3)
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_inscricoes_valor_cobrado') THEN
    ALTER TABLE public.inscricoes ADD CONSTRAINT chk_inscricoes_valor_cobrado
      CHECK (valor_cobrado_centavos IS NULL OR valor_cobrado_centavos >= 0);
  END IF;
END $$;

COMMENT ON COLUMN public.inscricoes.valor_cobrado_centavos IS
  'Quanto ESTA inscrição paga. NULL = valor de tabela do evento; 0 = isenta. A cobrança nasce daqui.';
COMMENT ON COLUMN public.inscricoes.bolsa_tipo IS
  'integral = gratuidade · parcial = desconto. NULL = paga o valor de tabela.';

-- Concessão de benefício financeiro entra no audit log junto do resto.
DROP TRIGGER IF EXISTS trg_audit_inscricoes ON public.inscricoes;
CREATE TRIGGER trg_audit_inscricoes
AFTER INSERT OR UPDATE OR DELETE ON public.inscricoes
FOR EACH ROW EXECUTE FUNCTION public.audit_log_changes(
  'nome_completo,telefone,cpf,email,status,deleted_at,valor_cobrado_centavos,bolsa_tipo,bolsa_motivo'
);

-- ── Leitura ───────────────────────────────────────────────────────────────
-- Valor efetivo por inscrição, num lugar só: telas, impressão e arrecadado
-- devem responder a mesma coisa. `coalesce` na ordem certa — a inscrição vence
-- o evento, que é o ponto de toda esta migration.
CREATE OR REPLACE VIEW public.vw_insc_valor_efetivo AS
SELECT
  i.id                        AS inscricao_id,
  i.evento_id,
  e.valor_centavos            AS valor_tabela_centavos,
  COALESCE(i.valor_cobrado_centavos, e.valor_centavos, 0) AS valor_efetivo_centavos,
  i.bolsa_tipo,
  i.bolsa_motivo,
  i.bolsa_por,
  i.bolsa_por_nome,
  i.bolsa_em,
  -- Isenta = não há o que cobrar. Serve pra tela não mostrar "aguardando
  -- pagamento" pra quem foi de graça (não está aguardando nada).
  (COALESCE(i.valor_cobrado_centavos, e.valor_centavos, 0) = 0) AS isenta
FROM public.inscricoes i
JOIN public.insc_eventos e ON e.id = i.evento_id
WHERE i.deleted_at IS NULL;

-- Mesma régua da view unificada: acesso só pelo backend.
REVOKE ALL ON public.vw_insc_valor_efetivo FROM anon, authenticated;
