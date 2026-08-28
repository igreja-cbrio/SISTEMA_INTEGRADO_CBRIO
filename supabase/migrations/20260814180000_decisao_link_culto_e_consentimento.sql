-- ============================================================================
-- DECISÃO · porta nova do voluntário (link assinado do culto) + consentimento
-- ============================================================================
-- Contexto medido em 14/08/2026: o voluntário coleta nome+telefone no papel ao
-- fim do culto e alguém lança dias depois (média 3, máximo 9). O SLA de
-- primeiro contato do módulo é de 3 dias, então o convertido entra no sistema
-- no dia em que o prazo dele já venceu — só 41,5% são contatados a tempo. E em
-- 12/07 o culto das 19h ficou com 0 nomes enquanto o das 11h30 ficou com 19,
-- porque quem digitou 9 dias depois não lembrava de qual culto era o papel.
--
-- Esta migration só ABRE espaço para os valores novos. Nenhum dado é alterado,
-- nenhuma coluna é criada ou removida, e as duas mudanças são AMPLIAÇÕES de
-- CHECK (aceitam tudo o que já aceitavam, mais um valor) — então são
-- backwards-compatible: o código antigo continua funcionando sem alteração.
--
-- ⚠️ Sem esta migration o INSERT da porta nova estoura 23514 (violação de
-- CHECK) DENTRO de trigger, e exceção em trigger aborta o statement inteiro —
-- a decisão não seria gravada e a pessoa ficaria fora do sistema. É a mesma
-- classe do incidente de 04/08 com `nsm_eventos_pessoa_valor_uq`.
-- ============================================================================

-- 1) `fonte` ganha 'link_culto' — a porta do voluntário.
--    Sem valor próprio não há como medir adoção da porta nova nem separar, na
--    tela de conferência, o que veio do celular do voluntário do que foi
--    digitado depois.
ALTER TABLE public.cultos_decisoes_pessoas
  DROP CONSTRAINT IF EXISTS cultos_decisoes_pessoas_fonte_check;

ALTER TABLE public.cultos_decisoes_pessoas
  ADD CONSTRAINT cultos_decisoes_pessoas_fonte_check
  CHECK (fonte = ANY (ARRAY['manual', 'form_publico', 'chat', 'app', 'link_culto']));

-- 2) `porta` do ledger de consentimento ganha 'decisao'.
--    ⚠️ De propósito NÃO criamos colunas de consentimento em
--    `cultos_decisoes_pessoas`: duas verdades sobre "quem consentiu" é a
--    doença que este repositório já pagou caro. `inscricao_consentimentos` é
--    genérico (porta, ref_id, texto com SNAPSHOT, aceito, ip_origem,
--    user_agent) e serve exatamente para isto.
--
--    Convicção religiosa é dado SENSÍVEL (LGPD art. 11) e a base é
--    consentimento específico — legítimo interesse não alcança. As duas portas
--    gravam textos DIFERENTES, e isso é deliberado: no formulário público a
--    própria pessoa marca a caixa; no link do voluntário quem preenche é um
--    terceiro transcrevendo, e o texto gravado diz exatamente isso
--    ("DECLARADO PELO VOLUNTARIO"). Gravar a declaração de um terceiro como se
--    fosse consentimento do titular seria fabricar prova legal.
ALTER TABLE public.inscricao_consentimentos
  DROP CONSTRAINT IF EXISTS inscricao_consentimentos_porta_check;

ALTER TABLE public.inscricao_consentimentos
  ADD CONSTRAINT inscricao_consentimentos_porta_check
  CHECK (porta = ANY (ARRAY[
    'batismo', 'apresentacao', 'grupos', 'grupos_lider', 'next',
    'voluntariado', 'evento_externo', 'inscricoes', 'decisao'
  ]));
