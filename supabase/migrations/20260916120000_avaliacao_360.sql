-- Avaliação 360 · fundação (ciclo, competências, convites, respostas)
--
-- ⚠️⚠️ POR QUE TABELA NOVA E NÃO ESTENDER `rh_avaliacoes`
--
-- `rh_avaliacoes` NÃO é "um 360 vazio". É a FICHA DE ENQUADRAMENTO DO PCS:
-- uma linha por pessoa/ciclo, com TRÊS fontes fixas como COLUNAS
-- (`autoavaliacao_pts` / `lider_pts` / `calibracao_pts`), critérios vindos de
-- `pcs_criterios` — que são de CARGO, não de desempenho (Formação Acadêmica,
-- Experiência Profissional, Complexidade das Tarefas...) — e, no fim de
-- `POST /rh/avaliacoes/:id/fatores`, o mapeamento
-- nota → `pontuacao_pcs` → `pcs_graus` → `grau_sugerido_id`.
--
-- ⚠️⚠️ Esticar aquilo para 360 faria a nota que um COLEGA dá alimentar a
-- sugestão de FAIXA SALARIAL, automaticamente, sem ninguém ter decidido isso.
-- Com N avaliadores, colunas fixas também deixam de servir. Daí a estrutura
-- nova ao lado. `rh_avaliacoes` fica intacta (0 linhas — custo zero) e ganha
-- COMMENT dizendo o que ela é de verdade.
--
-- ⚠️⚠️ IDENTIDADE E CONTEÚDO FICAM EM TABELAS SEPARADAS, e isso é o coração
-- do desenho: **RLS não filtra COLUNA, só LINHA**. Guardar `avaliador_id` na
-- mesma linha da nota significa que qualquer policy que libere a resposta
-- libera junto quem escreveu. Por isso: `rh_aval360_convite` tem a identidade,
-- `rh_aval360_resposta` tem o conteúdo, e a ponte entre as duas só é legível
-- por RH nível 3.
--
-- ⚠️ O que se promete é **CONFIDENCIAL, não anônimo**. O sistema grava quem
-- respondeu — é o que impede resposta dupla, permite cobrar quem falta,
-- atender pedido de acesso da LGPD e remover a resposta de quem saiu. O que
-- muda é QUEM VÊ. Com 46 pessoas, "anônimo" seria falso de qualquer jeito: um
-- parágrafo de texto livre é assinatura.
--
-- Medido na base em 16/09/2026, e é o que justifica cada trava aqui:
--   46 ativos · 11 gestores · 39 com login · 44 com gestor_id
--   liderados por gestor: 1 (×3) · 2 (×1) · 4 (×2) · 5 (×3) · 6 (×1) · 9 (×1)
--   áreas: Gestão 19 · Ministerial 14 · Criativo 10 · Financeiro 2 · sem área 1
--   ⇒ 3 gestores têm UM liderado. O Financeiro tem 2 pessoas.
--
-- ⚠️ O Feedz (produto de referência) **NÃO tem piso de anonimato nem número
-- mínimo de respondentes** — verificado no mapeamento de 16/09. Aqui tem, e é
-- deliberadamente mais protetivo que ele: é justamente nos 3 gestores de 1
-- liderado que a ausência machucaria.


-- ════════════════════════════════════════════════════════════════════
-- PARTE 1 · Consertar o que já existe (tabela vazia ⇒ custo zero)
-- ════════════════════════════════════════════════════════════════════

COMMENT ON TABLE public.rh_avaliacoes IS
  'Ficha de ENQUADRAMENTO do PCS (auto + líder + calibração sobre pcs_criterios, '
  'que são critérios de CARGO). NÃO é avaliação 360 — esta vive em rh_aval360_*. '
  'A nota daqui alimenta pontuacao_pcs/grau_sugerido_id, ou seja faixa salarial; '
  'nenhuma fonte par/liderado pode chegar aqui.';

-- ⚠️ Lei do projeto: tabela com PII precisa de deleted_at + índice parcial +
-- whitelist. Estas duas nasceram sem, e são as que vão alimentar salário.
ALTER TABLE public.rh_avaliacoes        ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE public.rh_avaliacao_fatores ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_rh_avaliacoes_ativas
  ON public.rh_avaliacoes (id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_rh_avaliacao_fatores_ativas
  ON public.rh_avaliacao_fatores (id) WHERE deleted_at IS NULL;

-- ⚠️⚠️ PATCH DINÂMICO sobre a definição VIVA. Lista estática num
-- CREATE OR REPLACE é remoção silenciosa disfarçada de acréscimo — foi assim
-- que `vol_inscricoes` sumiu da whitelist em 14/08 e o soft-delete de um outro
-- módulo quebrou sem ninguém ligar uma coisa à outra.
DO $$
DECLARE v_lista TEXT;
BEGIN
  SELECT string_agg(quote_literal(t), ', ' ORDER BY t) INTO v_lista
  FROM (
    SELECT unnest(public.app_soft_deletable_tables()) AS t
    UNION SELECT 'rh_avaliacoes'
    UNION SELECT 'rh_avaliacao_fatores'
    UNION SELECT 'rh_aval360_ciclo'
    UNION SELECT 'rh_aval360_competencia'
    UNION SELECT 'rh_aval360_ciclo_competencia'
    UNION SELECT 'rh_aval360_convite'
    UNION SELECT 'rh_aval360_resposta'
  ) s;

  EXECUTE format($f$
    CREATE OR REPLACE FUNCTION public.app_soft_deletable_tables()
    RETURNS TEXT[] LANGUAGE sql IMMUTABLE AS $body$
      SELECT ARRAY[%s]::TEXT[]
    $body$;
  $f$, v_lista);
END $$;

-- Audit: estas tabelas decidem faixa salarial e não tinham trilha nenhuma.
DROP TRIGGER IF EXISTS trg_audit_rh_avaliacoes ON public.rh_avaliacoes;
CREATE TRIGGER trg_audit_rh_avaliacoes
AFTER INSERT OR UPDATE OR DELETE ON public.rh_avaliacoes
FOR EACH ROW EXECUTE FUNCTION public.audit_log_changes(
  'autoavaliacao_pts,lider_pts,calibracao_pts,pontuacao_final,pontuacao_pcs,grau_sugerido_id,status,deleted_at'
);

-- ⚠️⚠️ As policies de rh_avaliacoes liberavam a LINHA INTEIRA ao avaliado:
--     funcionario_id = current_user_funcionario_id()
-- Como RLS não filtra coluna, isso entrega `lider_obs` e `calibracao_obs` —
-- o comentário que o gestor escreveu achando que era para o RH. E a policy de
-- UPDATE tinha a MESMA condição: o avaliado poderia alterar a própria
-- `lider_pts`/`calibracao_pts`/`pontuacao_final`.
--
-- ⚠️ Hoje isso é INERTE: `anon` e `authenticated` não têm GRANT nenhum nessas
-- tabelas (conferido em 16/09), então nenhum cliente as alcança — o acesso é
-- 100% pelo backend com service_role. Mas é exatamente o desenho que causou o
-- incidente de `profiles` em 16/08: no dia em que alguém conceder um GRANT, a
-- policy passa a valer. Com a tabela vazia, corrigir custa zero.
DROP POLICY IF EXISTS rh_avaliacoes_select ON public.rh_avaliacoes;
CREATE POLICY rh_avaliacoes_select ON public.rh_avaliacoes
  FOR SELECT TO authenticated
  USING (
    deleted_at IS NULL
    AND (public.user_is_lider_de(funcionario_id)
         OR public.current_user_module_level('rh') >= 3)
  );

DROP POLICY IF EXISTS rh_avaliacoes_update ON public.rh_avaliacoes;
CREATE POLICY rh_avaliacoes_update ON public.rh_avaliacoes
  FOR UPDATE TO authenticated
  USING (public.current_user_module_level('rh') >= 3)
  WITH CHECK (public.current_user_module_level('rh') >= 3);

-- ════════════════════════════════════════════════════════════════════
-- PARTE 2 · A estrutura da 360
-- ════════════════════════════════════════════════════════════════════

-- Ciclo é ENTIDADE, não duas colunas de texto (`ciclo_ano` + `ciclo_periodo`,
-- como em rh_avaliacoes). Sem isso não há janela, não há histórico de "que
-- régua valia em 2026" e não há dois ciclos convivendo.
CREATE TABLE IF NOT EXISTS public.rh_aval360_ciclo (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome             TEXT NOT NULL,
  descricao        TEXT,
  periodo_inicio   DATE NOT NULL,
  periodo_fim      DATE NOT NULL,
  -- janelas do fluxo de indicação de pares (o Feedz tem as duas, e são elas
  -- que tornam viável o "avaliado indica, gestor aprova")
  indicacao_ate    DATE,
  validacao_ate    DATE,
  coleta_ate       DATE,
  -- ⚠️ Piso de respondentes para revelar um agregado. O CHECK >= 3 é a trava:
  -- o campo é editável na tela, e sem ele alguém baixaria para 1 num ciclo
  -- específico "só para ver o resultado do fulano".
  piso_respondentes INT NOT NULL DEFAULT 3 CHECK (piso_respondentes >= 3),
  -- ⚠️ Teto de convites de par POR AVALIADO. Medido: com "par = área inteira"
  -- o ciclo gera 741 convites (16,1 formulários por pessoa) e não fecha. Com
  -- até 3, são 256 (5,6 por pessoa).
  max_pares        INT NOT NULL DEFAULT 3 CHECK (max_pares BETWEEN 1 AND 10),
  escala_max       INT NOT NULL DEFAULT 5 CHECK (escala_max BETWEEN 3 AND 10),
  status           TEXT NOT NULL DEFAULT 'rascunho'
                   CHECK (status IN ('rascunho','indicacao','coleta','apuracao','publicado','encerrado')),
  -- ⚠️⚠️ FALSE e sem caminho para virar TRUE nesta migration. A 360 NÃO
  -- alimenta progressão salarial: quando nota de par vira dinheiro, a nota
  -- infla, aparece conluio e o feedback de desenvolvimento morre — perde-se o
  -- sinal honesto E o input administrativo. Quem decide salário é o PCS.
  alimenta_pcs     BOOLEAN NOT NULL DEFAULT FALSE CHECK (alimenta_pcs = FALSE),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by       UUID,
  deleted_at       TIMESTAMPTZ,
  CHECK (periodo_fim >= periodo_inicio)
);
CREATE INDEX IF NOT EXISTS idx_aval360_ciclo_ativo
  ON public.rh_aval360_ciclo (status) WHERE deleted_at IS NULL;

COMMENT ON COLUMN public.rh_aval360_ciclo.alimenta_pcs IS
  'Trava deliberada em FALSE. A 360 é insumo de desenvolvimento; progressão '
  'salarial é do PCS. Ver o teste no gate que impede fonte par/liderado de '
  'alcançar pontuacao_pcs.';
COMMENT ON COLUMN public.rh_aval360_ciclo.piso_respondentes IS
  'Mínimo de respostas para REVELAR um agregado de par/liderado. auto e gestor '
  'ficam fora do piso (são identificados por natureza). Régua em '
  'backend/utils/avaliacaoAnonimato.js, com teste no gate.';

-- Competência de DESEMPENHO — comportamento observável.
-- ⚠️ NÃO reusar `pcs_criterios`: aqueles são de enquadramento de CARGO, e um
-- colega não tem como avaliar a "formação acadêmica" de outro.
CREATE TABLE IF NOT EXISTS public.rh_aval360_competencia (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo       TEXT NOT NULL UNIQUE,
  nome         TEXT NOT NULL,
  descricao    TEXT,
  -- eixo alimenta a 9box no futuro. 'resultado' fica registrado mas NÃO é
  -- usado hoje: a casa não mede resultado individual dos 46, e posicionar
  -- gente num quadrante contra régua inventada é fabricar autoridade.
  eixo         TEXT NOT NULL DEFAULT 'comportamento'
               CHECK (eixo IN ('comportamento','resultado')),
  -- aplica_a limita a competência a um recorte (ex.: só gestores)
  aplica_a     TEXT NOT NULL DEFAULT 'todos'
               CHECK (aplica_a IN ('todos','gestores','area')),
  area         TEXT,
  ordem        INT NOT NULL DEFAULT 0,
  ativo        BOOLEAN NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at   TIMESTAMPTZ
);

-- Peso vive no VÍNCULO com o ciclo, não na competência: o peso muda de um
-- ciclo para o outro e o histórico não pode ser reescrito por isso.
CREATE TABLE IF NOT EXISTS public.rh_aval360_ciclo_competencia (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ciclo_id        UUID NOT NULL REFERENCES public.rh_aval360_ciclo(id) ON DELETE RESTRICT,
  competencia_id  UUID NOT NULL REFERENCES public.rh_aval360_competencia(id) ON DELETE RESTRICT,
  peso            NUMERIC(4,3) NOT NULL DEFAULT 1.000 CHECK (peso > 0),
  ordem           INT NOT NULL DEFAULT 0,
  deleted_at      TIMESTAMPTZ,
  UNIQUE (ciclo_id, competencia_id)
);

-- ════════════════════════════════════════════════════════════════════
-- CONVITE · carrega a IDENTIDADE. Separado da resposta de propósito.
-- ════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.rh_aval360_convite (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ciclo_id       UUID NOT NULL REFERENCES public.rh_aval360_ciclo(id) ON DELETE RESTRICT,
  -- ⚠️ Lei nº 3 e nº 10 do projeto: pessoa é UUID com FK, nunca texto.
  -- A FK é o que faz `merge_membros`/limpeza de duplicata repontar em vez de
  -- deixar ponteiro morto.
  avaliado_id    UUID NOT NULL REFERENCES public.rh_funcionarios(id) ON DELETE RESTRICT,
  avaliador_id   UUID NOT NULL REFERENCES public.rh_funcionarios(id) ON DELETE RESTRICT,
  papel          TEXT NOT NULL CHECK (papel IN ('auto','gestor','par','liderado')),
  origem         TEXT NOT NULL DEFAULT 'automatico'
                 CHECK (origem IN ('automatico','indicado','rh')),
  -- fluxo de indicação: indicado pelo avaliado → aprovado pelo gestor
  aprovado_em    TIMESTAMPTZ,
  aprovado_por   UUID,
  -- ⚠️ Convite SUPRIMIDO por piso: não é erro nem esquecimento, é decisão
  -- registrada. Sem o motivo escrito, o ciclo fecha com "85% de adesão" e
  -- ninguém sabe que 15% nunca foi convidado — e quem some é justo a equipe
  -- pequena, a que mais precisa de cuidado.
  suprimido_em   TIMESTAMPTZ,
  suprimido_motivo TEXT,
  respondido_em  TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at     TIMESTAMPTZ,
  -- uma pessoa avalia outra uma vez por papel, por ciclo
  UNIQUE (ciclo_id, avaliado_id, avaliador_id, papel),
  -- autoavaliação é a pessoa sobre ela mesma; os demais papéis, nunca
  CHECK ((papel = 'auto') = (avaliado_id = avaliador_id))
);
CREATE INDEX IF NOT EXISTS idx_aval360_convite_avaliador
  ON public.rh_aval360_convite (avaliador_id, ciclo_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_aval360_convite_avaliado
  ON public.rh_aval360_convite (avaliado_id, ciclo_id) WHERE deleted_at IS NULL;

COMMENT ON TABLE public.rh_aval360_convite IS
  'IDENTIDADE (quem avalia quem). Legível só pelo próprio avaliador e por RH '
  'nível 3 — o AVALIADO nunca lê, porque ver a lista de quem te avalia é ver '
  'quem te avaliou.';

-- ════════════════════════════════════════════════════════════════════
-- RESPOSTA · carrega o CONTEÚDO. NÃO tem avaliador_id.
-- ════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.rh_aval360_resposta (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ciclo_id       UUID NOT NULL REFERENCES public.rh_aval360_ciclo(id) ON DELETE RESTRICT,
  avaliado_id    UUID NOT NULL REFERENCES public.rh_funcionarios(id) ON DELETE RESTRICT,
  papel          TEXT NOT NULL CHECK (papel IN ('auto','gestor','par','liderado')),
  -- ⚠️ A ponte para a identidade. UNIQUE porque um convite responde uma vez.
  -- É reidentificável num JOIN — e é por isso que `rh_aval360_convite` só é
  -- legível por RH nível 3. Sem essa ponte não há como impedir resposta dupla
  -- nem atender pedido de acesso da LGPD.
  convite_id     UUID NOT NULL UNIQUE REFERENCES public.rh_aval360_convite(id) ON DELETE RESTRICT,
  -- ⚠️ Granularidade de DIA, de propósito: timestamp com segundos, cruzado com
  -- a lista de convidados e o horário de login, reidentifica sem nenhum JOIN.
  respondido_dia DATE NOT NULL DEFAULT (now() AT TIME ZONE 'America/Sao_Paulo')::date,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at     TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_aval360_resposta_avaliado
  ON public.rh_aval360_resposta (avaliado_id, ciclo_id, papel) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.rh_aval360_nota (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  resposta_id    UUID NOT NULL REFERENCES public.rh_aval360_resposta(id) ON DELETE CASCADE,
  competencia_id UUID NOT NULL REFERENCES public.rh_aval360_competencia(id) ON DELETE RESTRICT,
  nota           INT CHECK (nota >= 1),
  -- comentário por competência; o texto livre é o dado mais sensível do módulo
  comentario     TEXT,
  UNIQUE (resposta_id, competencia_id)
);

-- ⚠️ `rh_aval360_nota` NÃO entra na whitelist de soft-delete: ela é filha com
-- ON DELETE CASCADE da resposta, e apagar nota isolada corromperia a contagem
-- N do agregado — o número que decide se o resultado pode ser revelado.

ALTER TABLE public.rh_aval360_ciclo              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rh_aval360_competencia        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rh_aval360_ciclo_competencia  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rh_aval360_convite            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rh_aval360_resposta           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rh_aval360_nota               ENABLE ROW LEVEL SECURITY;

-- service_role (o backend) é o único caminho real de acesso hoje. As policies
-- abaixo são a SEGUNDA camada — a primeira é o handler, que filtra por pessoa.
CREATE POLICY aval360_ciclo_service ON public.rh_aval360_ciclo
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY aval360_competencia_service ON public.rh_aval360_competencia
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY aval360_ciclo_comp_service ON public.rh_aval360_ciclo_competencia
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY aval360_convite_service ON public.rh_aval360_convite
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY aval360_resposta_service ON public.rh_aval360_resposta
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY aval360_nota_service ON public.rh_aval360_nota
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Leitura por authenticated: só o que a pessoa precisa para RESPONDER.
-- ⚠️ O avaliado NÃO tem policy de SELECT em convite nem em resposta: o
-- resultado dele sai por endpoint agregado, acima do piso.
CREATE POLICY aval360_convite_select ON public.rh_aval360_convite
  FOR SELECT TO authenticated
  USING (
    deleted_at IS NULL
    AND (avaliador_id = public.current_user_funcionario_id()
         OR public.current_user_module_level('rh') >= 3)
  );

CREATE POLICY aval360_ciclo_select ON public.rh_aval360_ciclo
  FOR SELECT TO authenticated USING (deleted_at IS NULL);
CREATE POLICY aval360_competencia_select ON public.rh_aval360_competencia
  FOR SELECT TO authenticated USING (deleted_at IS NULL AND ativo);
CREATE POLICY aval360_ciclo_comp_select ON public.rh_aval360_ciclo_competencia
  FOR SELECT TO authenticated USING (deleted_at IS NULL);

-- ⚠️ Nenhuma policy de SELECT para `authenticated` em resposta/nota. Nem o
-- avaliado, nem o gestor. Quem lê é o backend, e só agregado acima do piso.

-- ⚠️ Nenhum GRANT é concedido aqui. Lei nº 11: GRANT de tabela para
-- authenticated numa tabela onde uma COLUNA decide o que pode ser visto é a
-- armadilha do incidente de `profiles` (16/08). O acesso é pelo backend.

-- ════════════════════════════════════════════════════════════════════
-- PARTE 3 · Catálogo inicial de competências (RASCUNHO EDITÁVEL)
-- ════════════════════════════════════════════════════════════════════
--
-- ⚠️ Isto é ponto de partida, não decisão fechada: a equipe edita/desativa na
-- tela. Existe porque folha em branco trava o ciclo por semanas.
--
-- ⚠️⚠️ O teste de cada um: "consigo citar um episódio dos últimos 6 meses?".
-- Se não consigo, não é desempenho — é atributo de ficha, e foi esse o erro
-- de reusar `pcs_criterios` (Formação Acadêmica, Experiência Profissional).
--
-- ⚠️⚠️ NENHUM critério em linguagem espiritual ("tem espírito de servo", "é
-- fiel", "é submisso à liderança"). Numa organização religiosa isso transforma
-- avaliação de TRABALHO em julgamento de CARÁTER e de fé — inauditável,
-- indefensável, e o vetor clássico de abuso espiritual em ambiente de trabalho
-- religioso: o avaliado não tem como discordar sem parecer que prova o ponto.

INSERT INTO public.rh_aval360_competencia (codigo, nome, descricao, eixo, aplica_a, ordem)
VALUES
  ('combinado', 'Cumpre o combinado',
   'Entrega o que disse, na data que disse. Quando não vai dar, avisa ANTES do prazo estourar — não depois.',
   'comportamento', 'todos', 1),
  ('informacao', 'A informação chega',
   'O que ele sabe e os outros precisam saber chega a quem precisa, sem alguém ter que ir buscar.',
   'comportamento', 'todos', 2),
  ('atravessa_area', 'Atravessa área',
   'Quando a demanda passa pela área dele, resolve — em vez de devolver com "não é comigo".',
   'comportamento', 'todos', 3),
  ('sob_pressao', 'Trata bem sob pressão',
   'Domingo de manhã é ambiente de estresse alto. Como trata colega e voluntário quando dá errado ao vivo?',
   'comportamento', 'todos', 4),
  ('aceita_correcao', 'Aceita correção',
   'Recebe apontamento sem se defender — e, meses depois, dá para ver que mudou.',
   'comportamento', 'todos', 5),
  ('prioridade', 'Clareza de prioridade',
   'A equipe dele sabe o que é mais importante nesta semana, sem precisar perguntar.',
   'comportamento', 'gestores', 6),
  ('acessivel', 'Está acessível',
   'Quando o liderado precisa de uma decisão, consegue falar com ele e sai com a decisão.',
   'comportamento', 'gestores', 7),
  ('desenvolve', 'Desenvolve a equipe',
   'Dá feedback específico (não "tá indo bem") e delega com responsabilidade real, não só tarefa.',
   'comportamento', 'gestores', 8),
  ('autoridade', 'Separa autoridade espiritual de decisão de trabalho',
   'Resolve conflito de trabalho com argumento de trabalho — sem recorrer à posição espiritual que ocupa.',
   'comportamento', 'gestores', 9)
ON CONFLICT (codigo) DO NOTHING;

COMMENT ON TABLE public.rh_aval360_competencia IS
  'Competências de DESEMPENHO (comportamento observável). NÃO confundir com '
  'pcs_criterios, que são de enquadramento de CARGO e decidem faixa salarial. '
  'O catálogo inicial é rascunho editável pela equipe.';
