-- ═══════════════════════════════════════════════════════════════════════════
--  MÓDULO CAMPANHAS · arrecadação com dígito verificador, cronograma e disparo
--  2026-08-27 · primeira campanha: Reforma do Espaço Kids (lançamento 06/09)
--
--  ⚠️⚠️ O ACHADO QUE MOTIVOU ESTA MIGRATION (medido em produção, 26/08/2026):
--  o "dígito verificador" JÁ EXISTIA e ESTAVA MORTO.
--
--  `fin_identificadores_centavo` tinha 4 dígitos ativos desde 21/05/2026 (17
--  Templo · 22 Bazar · 25 Campanha 2025 · 31 Ação Social), com tela de
--  configuração funcionando. Mas a régua do centavo vivia SÓ no JS
--  (`backend/services/financeiroClassificador.js`), e o caminho que classifica
--  de verdade é o trigger `tg_fila_auto_classificar` →
--  `aplicar_classificacao_lancamento`, cuja definição VIVA não mencionava
--  centavo nenhum. Conferido com `pg_get_functiondef`, não com o arquivo do
--  repo. Resultado:
--
--    dígito 25 · 105 créditos · R$ 21.745,25 · 0 classificados pelo dígito
--    dígito 22 ·  90 créditos · R$  7.063,80 · 0 classificados
--    dígito 31 ·  10 créditos · R$ 13.379,10 · 0 classificados
--    `fin_transacoes.identificador_centavo` = preenchido em ZERO linhas
--    `fin_fila_classificacao` com `sugestao_origem='centavo'` = ZERO linhas
--
--  A segunda metade morta: o endpoint `POST /classificar/:filaId/aprovar` só
--  copiava `identificador_centavo` do `req.body` — dependia do operador DIGITAR
--  o que o próprio valor já diz. Consertado no backend na mesma leva.
--
--  ⇒ Sem esta migration, a campanha do Kids nasceria com a barrinha em R$ 0
--  para sempre. E os outros 3 dígitos voltam a funcionar de carona.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ───────────────────────────────────────────────────────────────────────────
-- 1 · OPT-OUT DE E-MAIL
--
-- A campanha vai mandar e-mail semanal para ~2.392 pessoas (base viva medida em
-- 26/08: 3.970 vivas e ativas, das quais 2.392 com e-mail válido). Não existia
-- NENHUMA coluna de opt-out de e-mail em `mem_membros` — só a de WhatsApp.
-- Mandar campanha em massa sem caminho de descadastro é como se queima a
-- reputação do domínio no Graph (bounce/spam em massa derruba o envio de TODOS
-- os módulos: escala, inscrição, comprovante) e é o que a LGPD chama de falta
-- de revogação do consentimento.
-- ───────────────────────────────────────────────────────────────────────────
ALTER TABLE public.mem_membros
  ADD COLUMN IF NOT EXISTS email_optout    BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS email_optout_em TIMESTAMPTZ;

COMMENT ON COLUMN public.mem_membros.email_optout IS
  'Pessoa pediu para não receber e-mail de campanha/marketing. NÃO bloqueia '
  'e-mail transacional (comprovante de inscrição, recuperação de senha) — '
  'quem se inscreve num evento precisa receber o comprovante.';

-- ───────────────────────────────────────────────────────────────────────────
-- 2 · A CAMPANHA
-- ───────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.camp_campanhas (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug              TEXT NOT NULL,
  nome              TEXT NOT NULL,
  descricao_curta   TEXT,
  descricao         TEXT,

  -- ⚠️ Dinheiro em CENTAVOS no sistema inteiro (`pag_cobrancas.valor_centavos`).
  -- A reunião fechou a estimativa entre R$ 400k e R$ 500k; a meta pública é o
  -- teto (500k), e o piso fica registrado pro relatório interno.
  meta_centavos     BIGINT NOT NULL CHECK (meta_centavos > 0),
  meta_minima_centavos BIGINT CHECK (meta_minima_centavos IS NULL OR meta_minima_centavos > 0),

  -- ⚠️ O DÍGITO VERIFICADOR. `char(2)`, '01'..'99', NUNCA '00' — 87,5% dos
  -- créditos da igreja têm centavo ',00' (4.261 de 4.868 em 12 meses), então
  -- aceitar '00' jogaria o caixa inteiro dentro de uma campanha.
  digito            CHAR(2) CHECK (digito IS NULL OR (digito ~ '^[0-9]{2}$' AND digito <> '00')),

  -- Contabilidade separada, como a reunião decidiu ("conta bancária separada ou
  -- contagem contábil separada"). Aponta pro plano/centro que recebe.
  plano_contas_id   UUID REFERENCES public.fin_plano_contas(id) ON DELETE SET NULL,
  centro_custo_id   UUID REFERENCES public.fin_centros_custo(id) ON DELETE SET NULL,

  -- ⚠️ `data_inicio` (quando o dinheiro já conta) e `data_lancamento` (o domingo
  -- em que a igreja fica sabendo) são coisas DIFERENTES: uma doação antecipada
  -- de quem soube na reunião de liderança é da campanha, mas a barrinha não pode
  -- aparecer na tela antes do culto de lançamento.
  data_inicio       DATE,
  data_lancamento   DATE,
  data_fim          DATE,

  status            TEXT NOT NULL DEFAULT 'rascunho'
                      CHECK (status IN ('rascunho','ativa','pausada','encerrada','cancelada')),

  -- A barrinha aparece nas telas do culto e na página pública?
  publica           BOOLEAN NOT NULL DEFAULT false,
  -- ⚠️ Mostrar o VALOR ou só o percentual. Existe porque campanha atrasada com
  -- número exato na tela desanima em vez de mobilizar, e essa é decisão de quem
  -- comunica, não do código.
  mostrar_valor     BOOLEAN NOT NULL DEFAULT true,

  -- Doação pelo link/QR (`/api/public/generosidade`). Medido em 26/08: esse
  -- caminho está CONSTRUÍDO e nunca recebeu uma doação (zero cobranças com
  -- `origem_tipo='generosidade'`), enquanto o núcleo de pagamentos funciona
  -- (8 cobranças pagas de verdade no MercadoPago em agosto).
  aceita_online     BOOLEAN NOT NULL DEFAULT true,

  video_url         TEXT,
  imagem_url        TEXT,
  cor_destaque      TEXT,

  observacao        TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by        UUID,
  deleted_at        TIMESTAMPTZ
);

-- ⚠️⚠️ DOIS DESTINOS COM O MESMO DÍGITO É IRRECUPERÁVEL: o extrato bancário não
-- guarda nada que permita desempatar depois qual crédito era de qual campanha.
-- Por isso o índice é UNIQUE e PARCIAL (campanha encerrada libera o dígito pra
-- reuso no ano seguinte, campanha viva não).
CREATE UNIQUE INDEX IF NOT EXISTS camp_campanhas_digito_unq
  ON public.camp_campanhas (digito)
  WHERE deleted_at IS NULL AND digito IS NOT NULL
    AND status IN ('rascunho','ativa','pausada');

CREATE UNIQUE INDEX IF NOT EXISTS camp_campanhas_slug_unq
  ON public.camp_campanhas (slug) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS camp_campanhas_ativa_idx
  ON public.camp_campanhas (status, data_inicio) WHERE deleted_at IS NULL;

-- ───────────────────────────────────────────────────────────────────────────
-- 3 · CRONOGRAMA (marcos e tarefas)
--
-- A reunião produziu 13 action items com responsável e prazo ("finalizar as
-- imagens até o final da semana", "coordenar com o empreiteiro o faseamento").
-- ⚠️ O cronograma da PEÇA de comunicação continua no kanban do Marketing
-- (`marketing_kanban_cards`) — este é o cronograma da CAMPANHA (obra, marcos
-- financeiros, decisões), e a coluna `marketing_card_id` liga os dois em vez de
-- duplicar o quadro.
-- ───────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.camp_marcos (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campanha_id   UUID NOT NULL REFERENCES public.camp_campanhas(id) ON DELETE CASCADE,
  titulo        TEXT NOT NULL,
  descricao     TEXT,
  tipo          TEXT NOT NULL DEFAULT 'tarefa'
                  CHECK (tipo IN ('marco','tarefa','obra','comunicacao','financeiro')),
  responsavel_id UUID,
  responsavel_nome TEXT,
  data_prevista DATE,
  data_conclusao DATE,
  status        TEXT NOT NULL DEFAULT 'pendente'
                  CHECK (status IN ('pendente','em_andamento','concluido','cancelado','bloqueado')),
  ordem         INTEGER NOT NULL DEFAULT 0,
  marketing_card_id UUID,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by    UUID,
  deleted_at    TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS camp_marcos_campanha_idx
  ON public.camp_marcos (campanha_id, ordem, data_prevista) WHERE deleted_at IS NULL;

-- ───────────────────────────────────────────────────────────────────────────
-- 4 · DISPAROS
--
-- ⚠️ E-mail é o canal PRIMÁRIO por decisão da reunião ("o e-mail deve ser
-- priorizado, especialmente em razão das restrições mais rígidas da Meta"), e o
-- número confirma: 2.392 com e-mail contra 727 com opt-in de WhatsApp.
-- ⚠️ Pedir dinheiro é MARKETING na régua da Meta (a categoria Utility já foi
-- rejeitada nesta conta pra parabéns) e Marketing exige opt-in. A igreja tem UM
-- número — disparo sem opt-in queima o número pra escala, grupos, Kids e inbox.
-- ───────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.camp_disparos (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campanha_id   UUID NOT NULL REFERENCES public.camp_campanhas(id) ON DELETE CASCADE,
  nome          TEXT NOT NULL,
  canal         TEXT NOT NULL CHECK (canal IN ('email','whatsapp','app_push')),
  segmento      TEXT NOT NULL DEFAULT 'todos'
                  CHECK (segmento IN ('todos','membros','voluntarios','pais_kids','doadores_campanha')),

  assunto       TEXT,
  corpo_texto   TEXT,
  corpo_html    TEXT,
  -- WhatsApp só sai por template aprovado na Meta. ⚠️ Guardar o NOME do template
  -- aqui não prova que ele existe nem que está aprovado — a lição do canário
  -- ("a env existir não prova que o template funciona"). Quem envia confere.
  wa_template   TEXT,

  agendado_para TIMESTAMPTZ,
  -- 'semanal_segunda' = o pocket pós-culto que a reunião definiu ("e-mail toda
  -- segunda-feira após o culto, com o resumo, o link do vídeo e o CTA").
  recorrencia   TEXT NOT NULL DEFAULT 'unico'
                  CHECK (recorrencia IN ('unico','semanal_segunda')),

  status        TEXT NOT NULL DEFAULT 'rascunho'
                  CHECK (status IN ('rascunho','agendado','enviando','enviado','cancelado','falhou')),
  total_alvo    INTEGER NOT NULL DEFAULT 0,
  total_enviado INTEGER NOT NULL DEFAULT 0,
  total_falha   INTEGER NOT NULL DEFAULT 0,
  total_pulado  INTEGER NOT NULL DEFAULT 0,
  motivos_fora  JSONB,
  erro          TEXT,

  iniciado_em   TIMESTAMPTZ,
  concluido_em  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by    UUID,
  deleted_at    TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS camp_disparos_fila_idx
  ON public.camp_disparos (status, agendado_para) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS camp_disparos_campanha_idx
  ON public.camp_disparos (campanha_id, created_at DESC) WHERE deleted_at IS NULL;

-- Uma linha por destinatário. ⚠️ É ela que impede o disparo de mandar 2× pra
-- mesma pessoa quando o cron reentrega (o cron de agendamentos roda a cada hora
-- e um lote de 2.392 e-mails não termina numa invocação). A LEI da casa:
-- "guarda de idempotência tem que ser na MESMA chave do índice único".
CREATE TABLE IF NOT EXISTS public.camp_disparo_envios (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  disparo_id  UUID NOT NULL REFERENCES public.camp_disparos(id) ON DELETE CASCADE,
  membro_id   UUID REFERENCES public.mem_membros(id) ON DELETE SET NULL,
  canal       TEXT NOT NULL,
  destino     TEXT,
  status      TEXT NOT NULL DEFAULT 'pendente'
                CHECK (status IN ('pendente','enviado','falhou','pulado')),
  motivo      TEXT,
  enviado_em  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- ⚠️ Chave pelo DESTINO, não pelo membro: família compartilha e-mail nesta base
-- (é a razão de `mem_contatos` existir), e a casa com 4 cadastros no mesmo
-- e-mail receberia 4 cópias do mesmo pedido de doação.
CREATE UNIQUE INDEX IF NOT EXISTS camp_disparo_envios_destino_unq
  ON public.camp_disparo_envios (disparo_id, destino) WHERE destino IS NOT NULL;
CREATE INDEX IF NOT EXISTS camp_disparo_envios_pendente_idx
  ON public.camp_disparo_envios (disparo_id, status);

-- ───────────────────────────────────────────────────────────────────────────
-- 5 · AGRADECIMENTO AO DOADOR
--
-- ⚠️ A mensagem NÃO cita o nome da pessoa. Decisão da reunião, com motivo
-- técnico: "por causa de inconsistências na base de contatos — como números de
-- telefone cadastrados em nome de familiares ou filhos — a mensagem deverá ser
-- genérica, sem citar o nome da pessoa, para evitar erros de identificação".
-- ───────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.camp_agradecimentos (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campanha_id   UUID NOT NULL REFERENCES public.camp_campanhas(id) ON DELETE CASCADE,
  -- A doação agradecida. UMA das duas está preenchida: crédito bancário
  -- (`fin_transacoes`) ou doação online (`pag_cobrancas`).
  transacao_id  UUID REFERENCES public.fin_transacoes(id) ON DELETE SET NULL,
  cobranca_id   UUID REFERENCES public.pag_cobrancas(id) ON DELETE SET NULL,
  membro_id     UUID REFERENCES public.mem_membros(id) ON DELETE SET NULL,
  canal         TEXT NOT NULL CHECK (canal IN ('email','whatsapp')),
  destino       TEXT,
  status        TEXT NOT NULL DEFAULT 'pendente'
                  CHECK (status IN ('pendente','enviado','falhou','pulado')),
  motivo        TEXT,
  enviado_em    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- ⚠️ Uma doação é agradecida UMA vez. Dois índices únicos parciais porque a
-- doação pode vir de dois lugares e um único índice com COALESCE não é
-- indexável de forma confiável aqui.
CREATE UNIQUE INDEX IF NOT EXISTS camp_agradecimentos_transacao_unq
  ON public.camp_agradecimentos (transacao_id) WHERE transacao_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS camp_agradecimentos_cobranca_unq
  ON public.camp_agradecimentos (cobranca_id) WHERE cobranca_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS camp_agradecimentos_membro_idx
  ON public.camp_agradecimentos (membro_id, enviado_em DESC);

-- ───────────────────────────────────────────────────────────────────────────
-- 6 · VETO / INCLUSÃO MANUAL — o dígito é DECLARAÇÃO, não prova
--
-- ⚠️ Medido em 26/08: o dígito 07 aparece 11× em 12 meses (R$ 4.456,77) contra
-- uma média orgânica de 4,5 ocorrências por centavo não-designado. Ou seja: uma
-- parte das doações cai na campanha por COINCIDÊNCIA — um dízimo de R$ 1.000,07.
-- Sem caminho de veto, a barrinha superestima e ninguém consegue corrigir.
--
-- E o contrário também: quem depositou em espécie ou transferiu sem o dígito
-- ainda é doador da campanha, e alguém do financeiro precisa poder incluir.
-- ───────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.camp_vinculos (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campanha_id         UUID NOT NULL REFERENCES public.camp_campanhas(id) ON DELETE CASCADE,
  lancamento_bruto_id UUID REFERENCES public.fin_lancamentos_brutos(id) ON DELETE CASCADE,
  transacao_id        UUID REFERENCES public.fin_transacoes(id) ON DELETE CASCADE,
  -- true  = conta nesta campanha (inclusão manual, ou confirmação do dígito)
  -- false = NÃO conta, mesmo tendo o dígito (o veto)
  incluir             BOOLEAN NOT NULL,
  motivo              TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by          UUID,
  CHECK (lancamento_bruto_id IS NOT NULL OR transacao_id IS NOT NULL)
);
CREATE UNIQUE INDEX IF NOT EXISTS camp_vinculos_bruto_unq
  ON public.camp_vinculos (campanha_id, lancamento_bruto_id) WHERE lancamento_bruto_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS camp_vinculos_transacao_unq
  ON public.camp_vinculos (campanha_id, transacao_id) WHERE transacao_id IS NOT NULL;

-- ───────────────────────────────────────────────────────────────────────────
-- 7 · OS DÍGITOS ATIVOS · fonte ÚNICA pro trigger e pra tela
--
-- Junta as DUAS origens que existem hoje: as campanhas deste módulo e os
-- `fin_identificadores_centavo` que o financeiro já usava (Templo, Bazar,
-- Campanha 2025, Ação Social). Sem juntar, o módulo novo poderia adotar '25' e
-- roubar as doações da campanha do templo.
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.camp_digitos_ativos()
RETURNS TABLE (digito CHAR(2), descricao TEXT, plano_contas_id UUID,
               centro_custo_id UUID, campanha_id UUID)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT c.digito, c.nome, c.plano_contas_id, c.centro_custo_id, c.id
    FROM camp_campanhas c
   WHERE c.deleted_at IS NULL
     AND c.digito IS NOT NULL
     AND c.status IN ('ativa','pausada')
  UNION ALL
  -- ⚠️ `NOT EXISTS` e não FULL JOIN: se um dia uma campanha do módulo adotar o
  -- mesmo dígito de um identificador legado, a CAMPANHA ganha (é a configuração
  -- mais nova e a que tem gente olhando), e o dígito não aparece duplicado —
  -- duplicata aqui faria o `SELECT ... LIMIT 1` do trigger virar sorteio.
  SELECT i.centavo::CHAR(2), i.descricao, i.plano_contas_id, i.centro_custo_id, NULL::UUID
    FROM fin_identificadores_centavo i
   WHERE i.ativo = true
     AND i.centavo <> '00'
     AND NOT EXISTS (
       SELECT 1 FROM camp_campanhas c
        WHERE c.deleted_at IS NULL AND c.digito = i.centavo
          AND c.status IN ('ativa','pausada')
     );
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- 8 · ⚠️⚠️ O CONSERTO · a régua do dígito ENTRA na função que classifica
--
-- Esta é a função VIVA (conferida com `pg_get_functiondef` em 26/08, não com o
-- arquivo do repo). O corpo abaixo é o original INTEIRO — memória por documento,
-- memória por nome, regras manuais, sem_sugestao — com UM bloco novo na FRENTE.
--
-- ⚠️ POR QUE O DÍGITO VEM ANTES DA MEMÓRIA: memória é o que o sistema APRENDEU
-- de decisões passadas; dígito é o que o doador ACABOU DE DECLARAR nesta
-- transferência. Quem dizimava todo mês e neste domingo mandou R$ 500,07 está
-- dizendo "esta aqui é da campanha" — e a memória, que aprendeu "esse CPF é
-- dízimo", jogaria a doação da campanha no dízimo. Declaração explícita vence
-- inferência histórica, sempre.
--
-- ⚠️ ESPELHO DECLARADO: a mesma régua existe em `backend/utils/digitoCampanha.js`
-- e o gate de deploy (`npm run test:campanha-digito`) trava se os dois
-- divergirem. Dois caminhos foram necessários porque o trigger decide no INSERT
-- sem poder chamar JS — e foi um caminho só, no JS, que deixou o dígito morto.
--
-- ⚠️ ARREDONDAR, NÃO TRUNCAR: em Postgres, `(1907.25 - floor(1907.25)) * 100` em
-- float dá 25.000000000004547 e `0.07` dá 7.000000000000028. `trunc()` devolve 24
-- e 6 — a doação iria pra campanha errada, ou pra nenhuma.
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.aplicar_classificacao_lancamento(p_bruto_id uuid)
RETURNS TABLE (plano_contas_id uuid, centro_custo_id uuid, membro_id uuid,
               confianca numeric, origem text, explicacao text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public'
AS $function$
DECLARE
  b RECORD;
  r RECORD;
  m RECORD;
  d RECORD;
  v_digito CHAR(2);
BEGIN
  SELECT * INTO b FROM fin_lancamentos_brutos WHERE id = p_bruto_id;
  IF NOT FOUND THEN RETURN; END IF;

  -- ── PRIORIDADE 0 · DÍGITO VERIFICADOR (declaração do doador) ─────────────
  -- Só CRÉDITO: uma SAÍDA de R$ 500,07 é pagamento a fornecedor cujo centavo é
  -- coincidência, e contá-la somaria DESPESA na arrecadação da campanha.
  IF (b.tipo_trn = 'CREDIT' OR (b.tipo_trn IS DISTINCT FROM 'DEBIT' AND b.valor > 0)) THEN
    v_digito := lpad((round(abs(b.valor) * 100) % 100)::TEXT, 2, '0');

    IF v_digito IS NOT NULL AND v_digito <> '00' THEN
      SELECT * INTO d FROM camp_digitos_ativos() a WHERE a.digito = v_digito LIMIT 1;
      IF FOUND THEN
        plano_contas_id := d.plano_contas_id;
        centro_custo_id := d.centro_custo_id;
        membro_id := NULL;
        origem := 'centavo';
        -- Dígito COM plano definido = sugestão completa; sem plano = parcial, e
        -- quem aprova escolhe a conta. Espelha o `financeiroClassificador.js`.
        IF d.plano_contas_id IS NOT NULL THEN
          confianca := 1.0;
          explicacao := format('Dígito %s · %s', v_digito, d.descricao);
        ELSE
          confianca := 0.5;
          explicacao := format('Dígito %s · %s (escolher a conta)', v_digito, d.descricao);
        END IF;
        RETURN NEXT;
        RETURN;
      END IF;
    END IF;
  END IF;

  -- ── PRIORIDADE 1 · MEMORIA (decisao anterior do mesmo pagador/recebedor) ──
  -- Procura por documento_contraparte (mais confiavel · CPF/CNPJ)
  IF b.documento_contraparte IS NOT NULL AND length(trim(b.documento_contraparte)) > 0 THEN
    SELECT * INTO m FROM fin_memoria_classificacao
     WHERE tipo_chave = 'documento'
       AND chave_contraparte = b.documento_contraparte
     ORDER BY ocorrencias DESC, ultimo_uso DESC NULLS LAST
     LIMIT 1;
    IF FOUND THEN
      plano_contas_id := m.plano_contas_id;
      centro_custo_id := m.centro_custo_id;
      membro_id := NULL;
      -- Confianca alta · doc + 3+ ocorrencias historicas = 95%
      confianca := LEAST(0.95, 0.7 + (LEAST(m.ocorrencias, 10) * 0.025));
      origem := 'memoria_documento';
      explicacao := format('Memoria · documento %s ja foi classificado %s vez(es) na mesma categoria',
                           b.documento_contraparte, m.ocorrencias);
      RETURN NEXT;
      RETURN;
    END IF;
  END IF;

  -- Memoria por nome contraparte
  IF b.nome_contraparte IS NOT NULL AND length(trim(b.nome_contraparte)) > 2 THEN
    SELECT * INTO m FROM fin_memoria_classificacao
     WHERE tipo_chave = 'nome'
       AND chave_contraparte = LOWER(TRIM(b.nome_contraparte))
     ORDER BY ocorrencias DESC, ultimo_uso DESC NULLS LAST
     LIMIT 1;
    IF FOUND THEN
      plano_contas_id := m.plano_contas_id;
      centro_custo_id := m.centro_custo_id;
      membro_id := NULL;
      confianca := LEAST(0.90, 0.6 + (LEAST(m.ocorrencias, 10) * 0.03));
      origem := 'memoria_nome';
      explicacao := format('Memoria · "%s" ja foi classificado %s vez(es)',
                           b.nome_contraparte, m.ocorrencias);
      RETURN NEXT;
      RETURN;
    END IF;
  END IF;

  -- ── PRIORIDADE 2 · REGRAS MANUAIS ──
  FOR r IN
    SELECT * FROM fin_regras_classificacao
    WHERE ativo = true
      AND (aplica_a IS NULL
           OR aplica_a = 'ambos'
           OR (aplica_a = 'credito' AND b.tipo_trn = 'CREDIT')
           OR (aplica_a = 'debito'  AND b.tipo_trn = 'DEBIT'))
    ORDER BY prioridade DESC, created_at ASC
  LOOP
    IF r.tipo_regra = 'regex_memo' AND b.memo IS NOT NULL THEN
      IF (r.case_insensitive AND b.memo ~* r.pattern)
         OR (NOT r.case_insensitive AND b.memo ~ r.pattern) THEN
        plano_contas_id := r.plano_contas_id;
        centro_custo_id := r.centro_custo_id;
        membro_id := r.membro_id;
        confianca := 0.85;
        origem := 'regra';
        explicacao := format('Regra: %s · pattern em memo', r.nome);
        RETURN NEXT;
        RETURN;
      END IF;
    ELSIF r.tipo_regra = 'regex_nome' AND b.nome_contraparte IS NOT NULL THEN
      IF (r.case_insensitive AND b.nome_contraparte ~* r.pattern)
         OR (NOT r.case_insensitive AND b.nome_contraparte ~ r.pattern) THEN
        plano_contas_id := r.plano_contas_id;
        centro_custo_id := r.centro_custo_id;
        membro_id := r.membro_id;
        confianca := 0.85;
        origem := 'regra';
        explicacao := format('Regra: %s · pattern em nome', r.nome);
        RETURN NEXT;
        RETURN;
      END IF;
    END IF;
  END LOOP;

  -- ── PRIORIDADE 3 · HEURISTICAS GENERICAS ──
  -- Sem sugestao confiavel · retorna NULL com baixa confianca
  plano_contas_id := NULL;
  centro_custo_id := NULL;
  membro_id := NULL;
  confianca := 0.0;
  origem := 'sem_sugestao';
  explicacao := 'Nenhuma regra ou memoria bateu';
  RETURN NEXT;
END;
$function$;

-- ───────────────────────────────────────────────────────────────────────────
-- 9 · ARRECADAÇÃO · a view da barrinha
--
-- ⚠️⚠️ LEI Nº 6 DO NÚCLEO: `mem_contribuicoes` **NÃO É CAIXA**. Ela responde
-- "quem doou" (doadores únicos, recorrência, comprovante anual); o dinheiro sai
-- do BANCO. Somar as duas camadas é como nasceu a dupla contagem de ~R$ 1,5 mi
-- que este projeto já pagou. Esta view NÃO toca `mem_contribuicoes`.
--
-- Três baldes DISJUNTOS POR CONSTRUÇÃO:
--   confirmado  = `fin_transacoes` com o dígito (ou incluída à mão)
--   conciliando = `fin_lancamentos_brutos` com o dígito e SEM transação ainda
--   online      = `pag_cobrancas` paga da campanha
--
-- ⚠️ `conciliando` exclui todo bruto que já tem transação. Quando a fila aprova,
-- a linha MIGRA de balde e o total NÃO se move — é o que faz a barrinha não
-- pular quando o financeiro trabalha.
--
-- ⚠️ `confirmado` é chaveado ESTRITAMENTE no dígito, NUNCA no centro de custo.
-- O repasse do PSP entra no banco como UM valor agrupado, com centavo
-- arbitrário; no dia em que o financeiro classificar esse repasse dentro do
-- centro de custo da campanha, chavear por centro de custo contaria a mesma
-- doação duas vezes. A armadilha é fechada por ESCOLHA DE CHAVE.
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW public.vw_camp_arrecadacao AS
WITH conf AS (
  SELECT c.id AS campanha_id,
         COALESCE(SUM(ROUND(ABS(t.valor) * 100))::BIGINT, 0) AS centavos,
         COUNT(*)::INT AS lancamentos,
         COUNT(DISTINCT t.membro_id)::INT AS doadores
    FROM camp_campanhas c
    JOIN fin_transacoes t
      ON t.tipo = 'receita'
     AND (
           -- pelo dígito, sem veto humano
           (t.identificador_centavo = c.digito
            AND NOT EXISTS (SELECT 1 FROM camp_vinculos v
                             WHERE v.campanha_id = c.id AND v.transacao_id = t.id
                               AND v.incluir = false))
           -- ou incluída à mão pelo financeiro
           OR EXISTS (SELECT 1 FROM camp_vinculos v
                       WHERE v.campanha_id = c.id AND v.transacao_id = t.id
                         AND v.incluir = true)
         )
     AND (c.data_inicio IS NULL OR t.data_competencia >= c.data_inicio)
     AND (c.data_fim   IS NULL OR t.data_competencia <= c.data_fim)
   WHERE c.deleted_at IS NULL
   GROUP BY c.id
),
concil AS (
  SELECT c.id AS campanha_id,
         COALESCE(SUM(ROUND(ABS(b.valor) * 100))::BIGINT, 0) AS centavos,
         COUNT(*)::INT AS lancamentos
    FROM camp_campanhas c
    JOIN fin_lancamentos_brutos b
      ON (b.tipo_trn = 'CREDIT' OR (b.tipo_trn IS DISTINCT FROM 'DEBIT' AND b.valor > 0))
     AND lpad((ROUND(ABS(b.valor) * 100) % 100)::TEXT, 2, '0') = c.digito
     -- ⚠️ o que já virou transação está no balde `conf` — sem este NOT EXISTS o
     -- total dobraria e a barrinha pularia toda vez que a fila fosse aprovada.
     AND NOT EXISTS (SELECT 1 FROM fin_transacoes t WHERE t.lancamento_bruto_id = b.id)
     AND NOT EXISTS (SELECT 1 FROM camp_vinculos v
                      WHERE v.campanha_id = c.id AND v.lancamento_bruto_id = b.id
                        AND v.incluir = false)
     AND (c.data_inicio IS NULL OR b.data_lancamento >= c.data_inicio)
     AND (c.data_fim   IS NULL OR b.data_lancamento <= c.data_fim)
   WHERE c.deleted_at IS NULL AND c.digito IS NOT NULL
   GROUP BY c.id
),
onl AS (
  SELECT c.id AS campanha_id,
         COALESCE(SUM(COALESCE(p.valor_pago_centavos, p.valor_centavos))::BIGINT, 0) AS centavos,
         COUNT(*)::INT AS lancamentos,
         COUNT(DISTINCT p.membro_id)::INT AS doadores
    FROM camp_campanhas c
    JOIN pag_cobrancas p
      ON p.origem_tipo = 'generosidade'
     AND p.status = 'pago'
     AND p.deleted_at IS NULL
     AND p.metadata ->> 'campanha_id' = c.id::TEXT
   WHERE c.deleted_at IS NULL
   GROUP BY c.id
)
SELECT c.id AS campanha_id,
       c.slug, c.nome, c.digito, c.status, c.publica, c.mostrar_valor,
       c.meta_centavos, c.data_inicio, c.data_lancamento, c.data_fim,
       COALESCE(conf.centavos, 0)   AS caixa_confirmado_centavos,
       COALESCE(concil.centavos, 0) AS caixa_conciliando_centavos,
       COALESCE(onl.centavos, 0)    AS online_pago_centavos,
       COALESCE(conf.centavos, 0) + COALESCE(concil.centavos, 0)
         + COALESCE(onl.centavos, 0) AS total_centavos,
       COALESCE(conf.lancamentos, 0) + COALESCE(concil.lancamentos, 0)
         + COALESCE(onl.lancamentos, 0) AS total_lancamentos,
       COALESCE(concil.lancamentos, 0) AS lancamentos_em_conciliacao,
       -- ⚠️ doadores ÚNICOS não é somável entre baldes (a mesma pessoa pode ter
       -- doado pelos dois caminhos). Este número é o MAIOR dos dois, não a soma:
       -- somar inventaria doador que não existe.
       GREATEST(COALESCE(conf.doadores, 0), COALESCE(onl.doadores, 0)) AS doadores_aprox
  FROM camp_campanhas c
  LEFT JOIN conf   ON conf.campanha_id = c.id
  LEFT JOIN concil ON concil.campanha_id = c.id
  LEFT JOIN onl    ON onl.campanha_id = c.id
 WHERE c.deleted_at IS NULL;

-- ───────────────────────────────────────────────────────────────────────────
-- 10 · SOFT-DELETE · ⚠️⚠️ PATCH DINÂMICO sobre a definição VIVA
--
-- LEI da casa (aprendida em 17/08, quando uma migration com lista ESTÁTICA
-- apagou em silêncio 3 tabelas da whitelist e o soft-delete de `vol_inscricoes`
-- passou meses quebrado sem ninguém ligar uma coisa à outra): a whitelist é
-- AUTORIZAÇÃO, não inventário, e mexer nela é sempre UNION sobre o que está
-- vivo. Medido antes desta migration: 73 tabelas.
--
-- ⚠️ `camp_disparo_envios` e `camp_agradecimentos` ficam FORA de propósito:
-- são PROVA de que a mensagem saiu (append-only), e nenhum caminho do código as
-- apaga por essa RPC.
-- ───────────────────────────────────────────────────────────────────────────
DO $$
DECLARE v_lista TEXT[];
BEGIN
  SELECT array_agg(DISTINCT t ORDER BY t) INTO v_lista
    FROM (
      SELECT unnest(public.app_soft_deletable_tables()) AS t
      UNION SELECT 'camp_campanhas'
      UNION SELECT 'camp_marcos'
      UNION SELECT 'camp_disparos'
    ) x;

  EXECUTE format(
    'CREATE OR REPLACE FUNCTION public.app_soft_deletable_tables() '
    'RETURNS TEXT[] LANGUAGE sql IMMUTABLE AS $f$ SELECT %L::TEXT[] $f$',
    v_lista
  );
END $$;

-- ───────────────────────────────────────────────────────────────────────────
-- 11 · RLS
--
-- ⚠️ O backend usa service role (bypass de RLS) e os guards vêm do middleware.
-- As policies existem pra fechar o acesso DIRETO pelo cliente Supabase, que é
-- por onde a escalação de privilégio deste sistema já passou.
-- ───────────────────────────────────────────────────────────────────────────
ALTER TABLE public.camp_campanhas       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.camp_marcos          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.camp_disparos        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.camp_disparo_envios  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.camp_agradecimentos  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.camp_vinculos        ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['camp_campanhas','camp_marcos','camp_disparos',
                           'camp_disparo_envios','camp_agradecimentos','camp_vinculos']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I_select ON public.%I', t, t);
    EXECUTE format($p$CREATE POLICY %I_select ON public.%I FOR SELECT TO authenticated
                      USING (public.current_user_module_level('campanhas') >= 1)$p$, t, t);

    EXECUTE format('DROP POLICY IF EXISTS %I_insert ON public.%I', t, t);
    EXECUTE format($p$CREATE POLICY %I_insert ON public.%I FOR INSERT TO authenticated
                      WITH CHECK (public.current_user_module_level('campanhas') >= 3)$p$, t, t);

    EXECUTE format('DROP POLICY IF EXISTS %I_update ON public.%I', t, t);
    EXECUTE format($p$CREATE POLICY %I_update ON public.%I FOR UPDATE TO authenticated
                      USING (public.current_user_module_level('campanhas') >= 3)
                      WITH CHECK (public.current_user_module_level('campanhas') >= 3)$p$, t, t);

    EXECUTE format('DROP POLICY IF EXISTS %I_delete ON public.%I', t, t);
    EXECUTE format($p$CREATE POLICY %I_delete ON public.%I FOR DELETE TO authenticated
                      USING (public.is_super_admin())$p$, t, t);

    EXECUTE format('DROP POLICY IF EXISTS %I_service ON public.%I', t, t);
    EXECUTE format($p$CREATE POLICY %I_service ON public.%I FOR ALL TO service_role
                      USING (true) WITH CHECK (true)$p$, t, t);
  END LOOP;
END $$;

-- ───────────────────────────────────────────────────────────────────────────
-- 12 · CATÁLOGO DO MÓDULO + MATRIZ DE PERMISSÃO
--
-- ⚠️ Sem a entrada em `modulos` o menu não mostra a tela; sem o seed em
-- `cargo_modulo_permissao` o `authorizeModule` cai no nível PADRÃO do cargo — e
-- foi exatamente isso que fez o módulo `links` liberar escrita pra 10 cargos
-- quando a matriz dizia 2. Copia da matriz do FINANCEIRO porque campanha é
-- dinheiro: quem vê arrecadação é quem já vê o caixa.
-- ───────────────────────────────────────────────────────────────────────────
INSERT INTO public.modulos (slug, nome, rota, categoria, ordem, descricao, ativo)
SELECT 'campanhas', 'Campanhas', '/campanhas', 'operacional', 265,
       'Campanhas de arrecadação · meta, dígito verificador, cronograma e disparos', true
WHERE NOT EXISTS (SELECT 1 FROM public.modulos WHERE slug = 'campanhas');

DO $$
DECLARE base_id INT;
BEGIN
  SELECT id INTO base_id FROM public.modulos WHERE slug = 'financeiro';
  IF base_id IS NULL THEN RETURN; END IF;

  INSERT INTO public.cargo_modulo_permissao
    (cargo_id, modulo_id, nivel, pode_exportar, pode_aprovar, escopo_proprio)
  SELECT cmp.cargo_id, novo.id, cmp.nivel, cmp.pode_exportar, cmp.pode_aprovar, cmp.escopo_proprio
    FROM public.cargo_modulo_permissao cmp
    CROSS JOIN public.modulos novo
   WHERE cmp.modulo_id = base_id AND novo.slug = 'campanhas'
  ON CONFLICT (cargo_id, modulo_id) DO NOTHING;
END $$;

-- ───────────────────────────────────────────────────────────────────────────
-- 13 · A CAMPANHA DO KIDS
--
-- Dados do planejamento da reunião:
--   escopo GLOBAL (obra civil + mobiliário + decoração + ambientação) R$ 400k–500k
--   lançamento 06/09/2026 · prioridade total em setembro
--   dígito de identificação: 07
--   obra de 2 a 2,5 meses, faseada (o Kids não pode parar por completo)
--
-- ⚠️ O dígito 07 foi CONFERIDO livre em 26/08: não está em
-- `fin_identificadores_centavo` (que tem 17, 22, 25, 31) e aparece 11× em 12
-- meses por ruído orgânico (média de um centavo não-designado: 4,5).
--
-- ⚠️ Entra como `rascunho` e `publica = false` de propósito: quem liga a
-- campanha é gente, no dia do lançamento. Migration que já sobe campanha ATIVA
-- publicaria a barrinha na tela do culto antes de existir vídeo, cartaz e a
-- decisão de comunicar.
-- ───────────────────────────────────────────────────────────────────────────
INSERT INTO public.camp_campanhas (
  slug, nome, descricao_curta, descricao,
  meta_centavos, meta_minima_centavos, digito,
  data_inicio, data_lancamento, data_fim,
  status, publica, mostrar_valor, aceita_online, observacao
)
SELECT
  'reforma-kids',
  'Reforma do Espaço Kids',
  'transformar o espaço onde as nossas crianças são cuidadas e ensinadas',
  'Reforma completa do Espaço Kids: obra civil, mobiliário, decoração, papel de '
    || 'parede e ambientação. O escopo foi tratado como valor GLOBAL — não só a '
    || 'construção — para entregar o espaço funcional e acolhedor. Execução faseada '
    || 'para o Kids não parar por completo, com o telhado antes do piso.',
  50000000, 40000000, '07',
  '2026-09-01', '2026-09-06', '2026-10-31',
  'rascunho', false, true, true,
  'Dígito 07 conferido livre em 26/08/2026. Compromisso de ~R$ 170 mil da campanha '
    || 'de obras de 2025 segue pendente e concorre por recurso — considerar na '
    || 'priorização. Censo deslocado para o final do culto (QR) para não competir.'
WHERE NOT EXISTS (SELECT 1 FROM public.camp_campanhas WHERE slug = 'reforma-kids');

-- Cronograma inicial · os action items da reunião que têm data ou ordem clara.
-- ⚠️ Sem responsável PREENCHIDO: este arquivo não nomeia pessoa como dona de
-- fluxo (LEI de 05/08). Quem atribui é a tela.
INSERT INTO public.camp_marcos (campanha_id, titulo, descricao, tipo, data_prevista, ordem)
SELECT c.id, m.titulo, m.descricao, m.tipo, m.data_prevista, m.ordem
  FROM public.camp_campanhas c
  CROSS JOIN (VALUES
    ('Finalizar as imagens do projeto', 'Renders do "hoje e depois" para o lançamento.', 'comunicacao', DATE '2026-08-30', 10),
    ('Entregar o vídeo principal', 'Peça de 1min30 a 3min, emocional e objetiva, com a necessidade, a visão e o chamado.', 'comunicacao', DATE '2026-09-04', 20),
    ('Consolidar os orçamentos', 'Obra + mobiliário + decoração + elementos decorativos, fechando o valor global.', 'financeiro', DATE '2026-09-05', 30),
    ('Validar o faseamento com o empreiteiro', 'Cronograma de interdição das salas para o Kids seguir parcialmente operacional.', 'obra', DATE '2026-09-05', 40),
    ('Lançamento oficial no culto', 'Vídeo no culto, crianças na recepção, barrinha de progresso nas telas.', 'marco', DATE '2026-09-06', 50),
    ('Reforma do telhado', 'Prioridade técnica: o telhado vem ANTES de qualquer obra de piso/chão, para evitar retrabalho.', 'obra', DATE '2026-09-30', 60),
    ('Prestação de contas semanal', 'E-mail de segunda com resumo, link do vídeo e CTA; barrinha atualizada.', 'comunicacao', NULL, 70),
    ('Alinhar Censo e voluntariado', 'Integrar os cronogramas para não competir por atenção, recursos e energia da comunidade.', 'marco', DATE '2026-09-01', 80)
  ) AS m(titulo, descricao, tipo, data_prevista, ordem)
 WHERE c.slug = 'reforma-kids'
   AND NOT EXISTS (SELECT 1 FROM public.camp_marcos x WHERE x.campanha_id = c.id);

COMMIT;
