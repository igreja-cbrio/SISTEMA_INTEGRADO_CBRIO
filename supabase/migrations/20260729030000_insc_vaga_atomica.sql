-- ═══════════════════════════════════════════════════════════════════════════
-- Inscrições · vaga ATÔMICA + número da sorte sem corrida (2026-07-28)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- PROBLEMA (defeito real, pré-existente, em `publicEventoExterno.js`):
-- a vaga era conferida com um `count(*)` (`inscritosEspinha`, linha 60) e o
-- INSERT acontecia ~160 linhas depois. Entre as duas chamadas não há nada
-- serializando — 300 pessoas apertando "inscrever" no minuto do lançamento
-- passam TODAS pela conferência e o evento estoura a vaga. O mesmo vale pro
-- `numero_sorte`: o loop de 25 tentativas conferia com SELECT e inseria
-- depois (o UNIQUE parcial salvava do duplicado, mas às custas de devolver
-- "já inscrito" pra quem nunca se inscreveu).
--
-- Isso é bloqueador de abrir venda PAGA: vaga estourada com dinheiro dentro
-- significa estornar gente que já pagou, não só pedir desculpa.
--
-- SOLUÇÃO: uma função que faz conferência + geração do número + INSERT dentro
-- do MESMO comando, serializada por evento com `pg_advisory_xact_lock`. Lock
-- de transação (não de sessão) → o Postgres libera no fim do statement, mesmo
-- se a função levantar exceção. Serializa POR EVENTO, então lançamento de um
-- retiro não segura fila de outro evento.
--
-- Por que advisory e não `SELECT ... FOR UPDATE` na linha do evento: travar a
-- linha de `insc_eventos` faria qualquer edição do painel (publicar, mudar
-- horário) disputar lock com a fila de inscrição. Advisory lock é um mutex
-- nomeado, não toca em dado.
--
-- CONTRATO: devolve JSONB com `ok` + `motivo`. NUNCA levanta exceção por
-- regra de negócio (sem vaga, encerrado, duplicada) — quem chama decide o
-- HTTP. Exceção só pra erro de verdade (constraint, tipo).
--
-- Idempotente. Nenhuma tabela é alterada.
-- ═══════════════════════════════════════════════════════════════════════════

-- Namespace do advisory lock. 1937 é arbitrário e só precisa ser estável e
-- não colidir com outro uso de advisory lock no projeto (hoje só o Kids usa,
-- com chave própria). Documentado aqui pra que ninguém reaproveite o número.
CREATE OR REPLACE FUNCTION public.fn_insc_inscrever(
  p_evento_id       uuid,
  p_nome_completo   text,
  p_telefone        text    DEFAULT NULL,
  p_cpf             text    DEFAULT NULL,
  p_email           text    DEFAULT NULL,
  p_data_nascimento date    DEFAULT NULL,
  p_sexo            text    DEFAULT NULL,
  p_endereco        text    DEFAULT NULL,
  p_dados           jsonb   DEFAULT '{}'::jsonb,
  p_status          text    DEFAULT 'confirmada',
  p_origem          text    DEFAULT 'formulario_publico',
  p_com_sorteio     boolean DEFAULT false,
  p_whatsapp_optin  boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_ev        RECORD;
  v_ocupadas  int;
  v_existente uuid;
  v_numero    int;
  v_id        uuid;
BEGIN
  -- Fila de UMA pessoa por evento a partir daqui. Tudo abaixo (conferir vaga,
  -- gerar número, inserir) acontece sem que outra inscrição do mesmo evento
  -- possa entrar no meio.
  PERFORM pg_advisory_xact_lock(1937, hashtext(p_evento_id::text));

  SELECT id, nome, vagas, status, inscricoes_abrem_em, inscricoes_encerram_em
    INTO v_ev
    FROM public.insc_eventos
   WHERE id = p_evento_id AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'evento_inexistente');
  END IF;

  -- Reconferido DENTRO do lock: o evento pode ter sido encerrado enquanto a
  -- pessoa preenchia o formulário.
  IF v_ev.status <> 'publicado'
     OR (v_ev.inscricoes_abrem_em    IS NOT NULL AND now() < v_ev.inscricoes_abrem_em)
     OR (v_ev.inscricoes_encerram_em IS NOT NULL AND now() > v_ev.inscricoes_encerram_em) THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'encerrado');
  END IF;

  -- Dedup por CPF. A aplicação já confere antes (pra fazer o merge
  -- preservador das respostas); aqui é a rede que pega a corrida real —
  -- duplo clique e reenvio de formulário chegam juntos.
  IF p_cpf IS NOT NULL AND p_cpf <> '' THEN
    SELECT id INTO v_existente
      FROM public.inscricoes
     WHERE evento_id = p_evento_id AND cpf = p_cpf AND deleted_at IS NULL
     ORDER BY (status <> 'cancelada') DESC, created_at
     LIMIT 1;
    IF v_existente IS NOT NULL THEN
      RETURN jsonb_build_object('ok', false, 'motivo', 'duplicada', 'id', v_existente);
    END IF;
  END IF;

  -- Vaga. `recebida` (pagamento pendente) OCUPA vaga — é justamente o ponto
  -- do fluxo pago: a vaga fica reservada até pagar ou expirar. Só `cancelada`
  -- devolve vaga.
  IF v_ev.vagas IS NOT NULL THEN
    SELECT count(*) INTO v_ocupadas
      FROM public.inscricoes
     WHERE evento_id = p_evento_id AND status <> 'cancelada' AND deleted_at IS NULL;
    IF v_ocupadas >= v_ev.vagas THEN
      RETURN jsonb_build_object('ok', false, 'motivo', 'sem_vaga',
                                'vagas', v_ev.vagas, 'ocupadas', v_ocupadas);
    END IF;
  END IF;

  -- Número da sorte (1000-9999) único no evento. Dentro do lock, o SELECT de
  -- conferência é confiável — não existe mais janela entre conferir e inserir.
  IF p_com_sorteio THEN
    FOR i IN 1..40 LOOP
      v_numero := 1000 + floor(random() * 9000)::int;
      PERFORM 1 FROM public.inscricoes
        WHERE evento_id = p_evento_id AND numero_sorte = v_numero AND deleted_at IS NULL;
      EXIT WHEN NOT FOUND;
      v_numero := NULL;
    END LOOP;
    IF v_numero IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'motivo', 'sorteio_esgotado');
    END IF;
  END IF;

  INSERT INTO public.inscricoes (
    evento_id, nome_completo, telefone, cpf, email, data_nascimento, sexo,
    endereco, dados, status, origem, numero_sorte,
    whatsapp_optin, whatsapp_optin_em
  ) VALUES (
    p_evento_id, p_nome_completo, p_telefone, p_cpf, p_email, p_data_nascimento,
    p_sexo, p_endereco, coalesce(p_dados, '{}'::jsonb), p_status, p_origem, v_numero,
    coalesce(p_whatsapp_optin, false),
    CASE WHEN p_whatsapp_optin THEN now() ELSE NULL END
  )
  RETURNING id INTO v_id;

  RETURN jsonb_build_object(
    'ok', true,
    'id', v_id,
    'numero_sorte', v_numero,
    'vagas', v_ev.vagas,
    'ocupadas', coalesce(v_ocupadas, 0) + 1
  );
END
$fn$;

COMMENT ON FUNCTION public.fn_insc_inscrever(uuid, text, text, text, text, date, text, text, jsonb, text, text, boolean, boolean) IS
  'Cria inscrição na espinha de forma ATÔMICA (advisory lock por evento): confere janela/vaga/duplicidade e gera numero_sorte no MESMO comando do INSERT. Devolve {ok, motivo, id, numero_sorte, vagas, ocupadas}; regra de negócio nunca vira exceção. Único caminho de criação de inscrição — não inserir em `inscricoes` direto.';

-- Só o backend (service_role) chama. Formulário público entra por
-- /api/public/evento/:slug/inscrever, nunca direto no PostgREST.
REVOKE ALL ON FUNCTION public.fn_insc_inscrever(uuid, text, text, text, text, date, text, text, jsonb, text, text, boolean, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_insc_inscrever(uuid, text, text, text, text, date, text, text, jsonb, text, text, boolean, boolean) TO service_role;

-- ─── Leitura de ocupação (pra mostrar "restam N vagas" sem duplicar query) ──

CREATE OR REPLACE FUNCTION public.fn_insc_vagas(p_evento_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
  SELECT jsonb_build_object(
    'vagas', e.vagas,
    'ocupadas', (SELECT count(*) FROM public.inscricoes i
                  WHERE i.evento_id = e.id AND i.status <> 'cancelada' AND i.deleted_at IS NULL),
    'restantes', CASE WHEN e.vagas IS NULL THEN NULL ELSE greatest(
      0, e.vagas - (SELECT count(*) FROM public.inscricoes i
                     WHERE i.evento_id = e.id AND i.status <> 'cancelada' AND i.deleted_at IS NULL)
    ) END
  )
  FROM public.insc_eventos e
  WHERE e.id = p_evento_id AND e.deleted_at IS NULL;
$fn$;

COMMENT ON FUNCTION public.fn_insc_vagas(uuid) IS
  'Ocupação do evento: {vagas, ocupadas, restantes}. `restantes` NULL = vagas ilimitadas. Mesma régua da fn_insc_inscrever (só `cancelada` devolve vaga).';

REVOKE ALL ON FUNCTION public.fn_insc_vagas(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_insc_vagas(uuid) TO service_role;
