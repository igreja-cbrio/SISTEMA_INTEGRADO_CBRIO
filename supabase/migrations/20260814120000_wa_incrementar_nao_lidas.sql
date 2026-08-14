-- Contador de não-lidas ATÔMICO (médio da revisão de 05/08): o inbound fazia
-- read-modify-write (lia nao_lidas, baixava mídia por SEGUNDOS, gravava n+1) —
-- duas mensagens juntas gravavam "1" em vez de "2", e a corrida com o "zerar
-- ao abrir a thread" perdia badge. A função soma NO BANCO, numa operação só.
-- Só o backend chama (service_role); sem GRANT pra authenticated de propósito.
CREATE OR REPLACE FUNCTION public.wa_conversa_inbound(
  p_conversa_id uuid,
  p_previa text,
  p_agora timestamptz
) RETURNS void
LANGUAGE sql
SET search_path = public
AS $$
  UPDATE public.wa_conversas SET
    nao_lidas = COALESCE(nao_lidas, 0) + 1,
    last_message_at = p_agora,
    last_inbound_at = p_agora,
    resolvida = false,
    ultima_previa = p_previa
  WHERE id = p_conversa_id;
$$;

COMMENT ON FUNCTION public.wa_conversa_inbound(uuid, text, timestamptz) IS
  'Registra o efeito de 1 mensagem RECEBIDA na conversa (incremento atômico de nao_lidas + janela de 24h) · chamada só pelo backend';

-- Conferência:
-- SELECT proname FROM pg_proc WHERE proname = 'wa_conversa_inbound';
