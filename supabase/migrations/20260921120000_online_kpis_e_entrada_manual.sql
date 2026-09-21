-- Online · conserto dos KPIs que MENTEM + entrada manual de atendimentos
-- ============================================================================
-- Pedido do Matheus (21/09/2026): "veja se os kpis estao sendo alimentados de
-- forma correta... o online faz diversos atendimentos e esse kpi precisa ser
-- alimentado, porem eles fazem de forma externa ao sistema, entao preciso de
-- uma forma manual para alimentar esse kpi."
--
-- ⚠️⚠️ A AUDITORIA ACHOU ALGO PIOR QUE OS VAZIOS: ele perguntou pelos KPIs
-- vazios, mas o problema caro está nos que TÊM VALOR.
--
-- MEDIDO EM PRODUÇÃO (21/09/2026):
--
--  1) `voluntarios_checkin` NÃO TEM FILTRO DE ÁREA na função de agregação.
--     Os 5 KPIs (AMI-15, BRG-14, KIDS-14, ONL-17, SED-10) publicam
--     **o MESMO 30,43** em 2026-09, cada um sob rótulo de área diferente.
--     É o percentual de check-in da IGREJA INTEIRA vendido como se fosse da
--     área. O número real do Online no mês é 29,17% (24 escalados / 7 check-in)
--     e o do Kids é 37,27% — nenhum dos dois é 30,43.
--     ⚠️ KPI com valor errado é pior que KPI vazio: o vazio ninguém usa; este
--     vai para a reunião.
--
--  2) `solicitacoes_capelania` e `solicitacoes_aconselh` têm ramo nativo com
--     `RETURN` INCONDICIONAL depois de um `count(*)` (que nunca é NULL) ⇒
--     **o fallback para `dados_brutos` é INALCANÇÁVEL**. Ligar
--     `entrada_manual = true` neles faria a equipe lançar, a tela confirmar,
--     e o KPI não se mover — EM SILÊNCIO. É o erro que não se descobre.
--     ⇒ Por isso a entrada manual entra em `dado_tipo` NOVO, SEM ramo nativo.
--
--  3) ONL-20 "% de voluntarios que pararam de servir" é
--     `voluntarios_recuperados / voluntarios_inativos_3m` = taxa de
--     RECUPERAÇÃO, não de saída. Com `menor_melhor` + meta 5, o farol pedia
--     que recuperar voluntário fosse RARO. E os dois lados dependem de
--     `mem_voluntarios.ate`, NULL em **635 de 635** linhas — 0/0 ⇒ NULL.
--     A base não existe porque não existe fluxo de baixa.
--
--  4) ONL-17 e ONL-19 têm o TEXTO IDÊNTICO e fórmulas diferentes; ONL-02 e
--     ONL-06 são os dois "% de crescimento" (de coisas diferentes, e os dois
--     COM valor: -65,2 e 23,7).
--
-- ⚠️ Esta migration NÃO inventa dado. Onde a base não existe, o KPI SAI do
-- painel com o motivo escrito — em vez de ser alimentado por derivação.

BEGIN;

-- ============================================================================
-- PARTE 1 · `voluntarios_checkin` passa a filtrar por ÁREA
-- ============================================================================
-- ⚠️⚠️ PATCH DINÂMICO sobre a definição VIVA. `_kpi_agregar_dado` foi
-- reescrita várias vezes em produção (14/08, 18/08) e a definição do repo NÃO
-- é a viva — colar o corpo de um arquivo reverteria em silêncio o que só
-- existe em prod. Mesma técnica da 20260729060000.
DO $patch$
DECLARE
  v_def   text;
  v_velho text;
  v_novo  text;
  v_ocorr int;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_def
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = '_kpi_agregar_dado';

  IF v_def IS NULL THEN
    RAISE EXCEPTION 'ABORTADO: _kpi_agregar_dado não existe';
  END IF;

  -- Idempotência: já tem o filtro? sai sem tocar em nada.
  IF position('vol_teams t ON t.id = s.team_id' in v_def) > 0 THEN
    RAISE NOTICE 'voluntarios_checkin já filtra por área — nada a fazer';
    RETURN;
  END IF;

  v_velho :=
    '        FROM public.vol_schedules s' || E'\n' ||
    '        JOIN public.vol_services sv ON sv.id = s.service_id' || E'\n' ||
    '        LEFT JOIN public.vol_check_ins ci ON ci.schedule_id = s.id' || E'\n' ||
    '       WHERE sv.scheduled_at::date BETWEEN p_data_inicio AND p_data_fim;';

  -- ⚠️ A âncora tem que ser ÚNICA: se casar em dois lugares, o patch
  -- reescreveria um ramo que ninguém pediu.
  v_ocorr := (length(v_def) - length(replace(v_def, v_velho, ''))) / length(v_velho);
  IF v_ocorr <> 1 THEN
    RAISE EXCEPTION 'ABORTADO: âncora do ramo voluntarios_checkin não é única (% ocorrências)', v_ocorr;
  END IF;

  -- ⚠️ A área da ESCALA vive em `vol_teams.area` (via `vol_schedules.team_id`),
  -- não em `vol_services`. Medido: 5.363 de 5.451 escalas em 90 dias têm
  -- equipe com área.
  -- ⚠️ Escala sem equipe/área fica fora do numerador E do denominador quando o
  -- recorte é por área — somá-la ao denominador faria a área parecer pior do
  -- que é, por causa de cadastro incompleto de equipe.
  v_novo :=
    '        FROM public.vol_schedules s' || E'\n' ||
    '        JOIN public.vol_services sv ON sv.id = s.service_id' || E'\n' ||
    '        LEFT JOIN public.vol_teams t ON t.id = s.team_id' || E'\n' ||
    '        LEFT JOIN public.vol_check_ins ci ON ci.schedule_id = s.id' || E'\n' ||
    '       WHERE sv.scheduled_at::date BETWEEN p_data_inicio AND p_data_fim' || E'\n' ||
    '         AND (NOT v_filtra_area OR lower(t.area) = v_area_lower);';

  EXECUTE replace(v_def, v_velho, v_novo);
  RAISE NOTICE 'voluntarios_checkin passou a filtrar por área';
END;
$patch$;

-- Prova no CATÁLOGO, não no "success: true".
DO $conf$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = '_kpi_agregar_dado'
       AND position('vol_teams t ON t.id = s.team_id' in pg_get_functiondef(p.oid)) > 0
  ) THEN
    RAISE EXCEPTION 'ABORTADO: o patch de área não pegou';
  END IF;
END;
$conf$;

-- ============================================================================
-- PARTE 2 · KPIs de check-in em área que NÃO EXISTE como equipe
-- ============================================================================
-- ⚠️ `vol_teams.area` tem: Cuidados, Integração, KIDS, Louvor, Marketing,
-- Online, Produção, Voluntariado. NÃO tem 'ami', 'bridge' nem 'sede'. Com o
-- filtro da PARTE 1, esses três passam a devolver NULL — que é a resposta
-- HONESTA ("não medimos check-in por essa área"), mas um KPI que nunca terá
-- valor não fica no painel fingindo que um dia terá.
UPDATE public.kpi_indicadores_taticos
   SET ativo = false,
       observacoes = coalesce(observacoes || E'\n', '') ||
         '[2026-09-21] Desativado: `voluntarios_checkin` passou a filtrar por área ' ||
         '(antes publicava o número da IGREJA INTEIRA — os 5 KPIs mostravam 30,43 idêntico). ' ||
         'Não existe equipe com esta área em vol_teams (só KIDS e Online casam), ' ||
         'então este recorte devolveria NULL para sempre. Reativar quando as equipes ' ||
         'de voluntariado tiverem a área preenchida.'
 WHERE ativo
   AND deleted_at IS NULL
   AND formula_config->>'dado_tipo' = 'voluntarios_checkin'
   AND lower(area) IN ('ami', 'bridge', 'sede');

-- ============================================================================
-- PARTE 3 · a família "% de voluntarios que pararam de servir"
-- ============================================================================
-- ⚠️⚠️ Desativado, NÃO renomeado nem "consertado no sentido_meta".
-- Dois motivos independentes, e cada um sozinho já bastaria:
--   (a) a fórmula mede RECUPERAÇÃO e o rótulo diz SAÍDA;
--   (b) os dois lados leem `mem_voluntarios.ate`, NULL em 635/635 — não existe
--       fluxo de baixa no sistema, então nunca houve base.
-- Consertar só a direção da meta faria um número que mede outra coisa acender
-- farol — pior que o vazio de hoje, porque passaria a ser LIDO.
-- ⚠️ Derivar "inativo = sem escala há 90 dias" foi considerado e RECUSADO
-- aqui: "a igreja desligou esta pessoa" e "não apareceu há 90 dias" são fatos
-- diferentes, e colapsá-los em `ate` apaga a distinção para sempre. Se a casa
-- quiser medir ausência, é KPI NOVO com nome próprio ("% sem servir há 90
-- dias") e base declarada — decisão de gente, não efeito colateral daqui.
UPDATE public.kpi_indicadores_taticos
   SET ativo = false,
       observacoes = coalesce(observacoes || E'\n', '') ||
         '[2026-09-21] Desativado: a fórmula é `voluntarios_recuperados / voluntarios_inativos_3m` ' ||
         '= taxa de RECUPERAÇÃO, não de saída — e com menor_melhor + meta 5 o farol pedia que ' ||
         'recuperar voluntário fosse raro. Além disso os dois lados leem mem_voluntarios.ate, ' ||
         'NULL em 635 de 635 linhas (não existe fluxo de baixa), então o resultado é 0/0 = NULL. ' ||
         'Medir saída exige primeiro decidir de quem é a rotina de dar baixa.'
 WHERE ativo
   AND deleted_at IS NULL
   AND formula_config->>'numerador' = 'voluntarios_recuperados'
   AND formula_config->>'denominador' = 'voluntarios_inativos_3m';

-- ============================================================================
-- PARTE 4 · rótulos que mentem (renomear é seguro: a fórmula NÃO muda)
-- ============================================================================
-- ⚠️ A régua: renomear só é seguro quando a FÓRMULA sempre foi aquela — aí o
-- nome estava errado e a série continua válida. Quando a fórmula muda, o certo
-- é desativar e criar id novo (foi o caso da PARTE 3).

-- ONL-19 e irmãos: texto diz "check-in", fórmula é alocação de solicitação de
-- servir. ⚠️ Duas linhas com texto IDÊNTICO e números diferentes no mesmo
-- painel destroem a confiança no painel inteiro mais rápido que qualquer vazio.
UPDATE public.kpi_indicadores_taticos
   SET indicador = '% de solicitações de servir que foram alocadas',
       observacoes = coalesce(observacoes || E'\n', '') ||
         '[2026-09-21] Renomeado: o texto dizia "check-in corretamente" (idêntico ao KPI de ' ||
         'voluntarios_checkin), mas a fórmula sempre foi solicitacoes_servir_alocadas / ' ||
         'solicitacoes_servir_recebidas. Só o rótulo estava errado — a série continua válida.'
 WHERE ativo AND deleted_at IS NULL
   AND formula_config->>'numerador' = 'solicitacoes_servir_alocadas'
   AND indicador ILIKE '%check-in%';

-- "% de crescimento" — de quê? Dois KPIs na mesma área com o mesmo texto.
UPDATE public.kpi_indicadores_taticos
   SET indicador = '% de crescimento de devocionais',
       observacoes = coalesce(observacoes || E'\n', '') ||
         '[2026-09-21] Renomeado: o texto era só "% de crescimento", idêntico ao KPI de ' ||
         'frequencia_grupos na mesma área. Fórmula intocada.'
 WHERE ativo AND deleted_at IS NULL
   AND formula_config->>'dado_tipo' = 'devocionais'
   AND btrim(indicador) = '% de crescimento';

UPDATE public.kpi_indicadores_taticos
   SET indicador = '% de crescimento da frequência em grupos',
       observacoes = coalesce(observacoes || E'\n', '') ||
         '[2026-09-21] Renomeado: o texto era só "% de crescimento", idêntico ao KPI de ' ||
         'devocionais na mesma área. Fórmula intocada.'
 WHERE ativo AND deleted_at IS NULL
   AND formula_config->>'dado_tipo' = 'frequencia_grupos'
   AND btrim(indicador) = '% de crescimento';

-- ============================================================================
-- PARTE 5 · ENTRADA MANUAL · o pedido do Matheus
-- ============================================================================
-- ⚠️⚠️ `dado_tipo` NOVO, sem ramo nativo — É O CORAÇÃO DO CONSERTO.
-- Os tipos existentes (`solicitacoes_capelania`, `solicitacoes_aconselh`) têm
-- `RETURN` incondicional na função, então o fallback para `dados_brutos` nunca
-- é alcançado: lançar neles seria lançar no vazio, com a tela dizendo "salvo".
-- Como estes ids NÃO aparecem em nenhum `ELSIF`, eles caem no fallback final,
-- que agrega de `dados_brutos` **filtrando por área E por período**.
--
-- ⚠️ `granularidade = 'mensal'` casa com a periodicidade dos KPIs que os
-- consomem. `agregacao = 'sum'` porque o lançamento é uma CONTAGEM de
-- atendimentos, não uma média.
INSERT INTO public.tipos_dado_bruto
  (id, nome, descricao, unidade, agregacao, granularidade, origem_tabela, entrada_manual, ordem)
VALUES
  ('atend_capelania_recebidas',
   'Capelania · solicitações recebidas',
   'Quantas pessoas PEDIRAM capelania no período. Lançado à mão pela liderança da área quando o atendimento acontece fora do sistema. Use a data do ATENDIMENTO, nunca a do lançamento.',
   'solicitações', 'sum', 'mensal', NULL, true, 90),
  ('atend_capelania_atendidas',
   'Capelania · atendimentos realizados',
   'Quantos desses pedidos foram DE FATO atendidos no período. Não deve passar do número de recebidas.',
   'atendimentos', 'sum', 'mensal', NULL, true, 91),
  ('atend_aconselh_recebidas',
   'Aconselhamento · solicitações recebidas',
   'Quantas pessoas PEDIRAM aconselhamento no período. Lançado à mão pela liderança da área. Use a data do ATENDIMENTO.',
   'solicitações', 'sum', 'mensal', NULL, true, 92),
  ('atend_aconselh_atendidas',
   'Aconselhamento · atendimentos realizados',
   'Quantos desses pedidos foram DE FATO atendidos no período.',
   'atendimentos', 'sum', 'mensal', NULL, true, 93)
ON CONFLICT (id) DO UPDATE
  SET nome = EXCLUDED.nome,
      descricao = EXCLUDED.descricao,
      entrada_manual = true,
      ativo = true;

-- ⚠️ Guarda: nenhum dos tipos novos pode ganhar ramo nativo depois, ou a
-- entrada manual volta a ser silenciosamente ignorada.
DO $guarda$
DECLARE v_def text; v_id text;
BEGIN
  SELECT regexp_replace(pg_get_functiondef(p.oid), '--[^\n]*', '', 'g') INTO v_def
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = '_kpi_agregar_dado';

  FOREACH v_id IN ARRAY ARRAY['atend_capelania_recebidas', 'atend_capelania_atendidas',
                              'atend_aconselh_recebidas', 'atend_aconselh_atendidas'] LOOP
    IF position(v_id in v_def) > 0 THEN
      RAISE EXCEPTION 'ABORTADO: % ganhou ramo nativo em _kpi_agregar_dado — a entrada manual seria ignorada em silêncio', v_id;
    END IF;
  END LOOP;
END;
$guarda$;

-- ============================================================================
-- PARTE 6 · os 10 KPIs de capelania/aconselhamento passam a ler o manual
-- ============================================================================
-- ⚠️ Seguro porque NÃO HÁ SÉRIE A PRESERVAR: medido em 21/09, os 5 de
-- capelania têm **0 valores calculados** e os 5 de aconselhamento têm 1 cada
-- (herdado de `cui_acompanhamentos`, que está vazia). Repontar não falsifica
-- histórico nenhum.
UPDATE public.kpi_indicadores_taticos
   SET formula_config = jsonb_set(
         jsonb_set(formula_config, '{numerador}', '"atend_capelania_atendidas"'),
         '{denominador}', '"atend_capelania_recebidas"'),
       indicador = '% de solicitações de capelania atendidas',
       observacoes = coalesce(observacoes || E'\n', '') ||
         '[2026-09-21] Repontado para entrada MANUAL (atend_capelania_*). Motivo: o tipo antigo ' ||
         '`solicitacoes_capelania` lia cui_acompanhamentos (vazia) e tinha RETURN incondicional ' ||
         'na função — o fallback para dados_brutos era INALCANÇÁVEL, então lançar à mão não ' ||
         'movia o número e ninguém recebia erro. Sem série a preservar (0 valores calculados). ' ||
         'Lançar em /dados-brutos.'
 WHERE ativo AND deleted_at IS NULL
   AND formula_config->>'numerador' = 'solicitacoes_capelania'
   AND formula_config->>'denominador' = 'solicitacoes_capelania_recebidas';

UPDATE public.kpi_indicadores_taticos
   SET formula_config = jsonb_set(
         jsonb_set(formula_config, '{numerador}', '"atend_aconselh_atendidas"'),
         '{denominador}', '"atend_aconselh_recebidas"'),
       indicador = '% de solicitações de aconselhamento atendidas',
       observacoes = coalesce(observacoes || E'\n', '') ||
         '[2026-09-21] Repontado para entrada MANUAL (atend_aconselh_*). Mesmo motivo da ' ||
         'capelania: RETURN incondicional tornava o fallback de dados_brutos inalcançável. ' ||
         'Lançar em /dados-brutos.'
 WHERE ativo AND deleted_at IS NULL
   AND formula_config->>'numerador' = 'solicitacoes_aconselh'
   AND formula_config->>'denominador' = 'solicitacoes_aconselhamento_recebidas';

-- ============================================================================
-- PARTE 7 · views por DIA do canal (fonte do card da semana)
-- ============================================================================
-- ⚠️⚠️ POR QUE UMA TABELA NOVA, e não subtrair dois `online_canal_snapshot`:
-- `view_count` é o acumulado do canal, e o YouTube REVISA esse contador para
-- baixo quando depura views. Medido em 126 dias: **9 dias com queda**, maior
-- de -7.197, total depurado -28.568. A semana 14–20/09 (a primeira que o card
-- mostraria) tem uma queda de -5.377 no dia 16 — a subtração daria 6.642
-- quando as views reais foram ~12.019: **erro de ~45% PARA MENOS**.
-- Um card que erra na primeira semana em que é aberto não volta a ser lido.
--
-- ⇒ A fonte certa é a YouTube Analytics API (`metrics=views&dimensions=day`),
-- que é o número que o Studio mostra — já deduplicado e depurado.
CREATE TABLE IF NOT EXISTS public.online_canal_views_dia (
  data           DATE PRIMARY KEY,
  views          INTEGER NOT NULL CHECK (views >= 0),
  watch_minutos  INTEGER CHECK (watch_minutos >= 0),
  coletado_em    TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.online_canal_views_dia IS
  'Views do canal POR DIA, da YouTube Analytics API. ⚠️ NÃO derivar de '
  'online_canal_snapshot: aquele é acumulado e o YouTube o revisa para baixo '
  '(9 quedas em 126 dias medidas em 21/09/2026), então a subtração subestima '
  'a semana em até 45%. ⚠️ O coletor faz UPSERT dos últimos dias de propósito: '
  'o YouTube ainda ajusta D-1 e D-2, e é o upsert que deixa o número se '
  'corrigir sozinho.';

ALTER TABLE public.online_canal_views_dia ENABLE ROW LEVEL SECURITY;

-- Mesmo molde de online_canal_snapshot: leitura para autenticado (não é PII —
-- é contagem agregada de um canal público), escrita só service_role.
DROP POLICY IF EXISTS online_canal_views_dia_select ON public.online_canal_views_dia;
CREATE POLICY online_canal_views_dia_select ON public.online_canal_views_dia
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS online_canal_views_dia_service ON public.online_canal_views_dia;
CREATE POLICY online_canal_views_dia_service ON public.online_canal_views_dia
  FOR ALL TO service_role USING (true) WITH CHECK (true);


-- ============================================================================
-- PARTE 8 · a tela PARA DE OFERECER lançamento que o sistema ignora
-- ============================================================================
-- ⚠️⚠️ ISTO NÃO É HIPÓTESE — É DADO. Medido em 21/09/2026:
--
--   solicitacoes_servir_recebidas  → **47 lançamentos** em dados_brutos
--   solicitacoes_servir_alocadas   → **37 lançamentos**
--
-- Os dois têm `entrada_manual = true` (a tela os oferece) E ramo nativo com
-- `RETURN` incondicional (o fallback de dados_brutos é inalcançável). Ou seja:
-- **84 números que alguém da equipe digitou à mão, a tela confirmou "salvo",
-- e o KPI nunca leu** — ele lê `vol_inscricoes`.
--
-- Esse é o custo real do desalinhamento: não é só o KPI ficar errado, é a
-- equipe gastar tempo alimentando um campo que não alimenta nada, e concluir
-- que "o sistema não funciona".
--
-- ⇒ `entrada_manual = false` nos quatro: a tela deixa de oferecer o que não
-- vale. Os lançamentos antigos NÃO são apagados — são o registro do que a
-- equipe reportou, e apagá-los destruiria a única prova de que aqueles
-- atendimentos existiram.
--
-- ⚠️ Para `solicitacoes_servir_*` o automático é a fonte BOA (`vol_inscricoes`
-- tem dado real, a porta de voluntariado funciona). Para os dois de
-- capelania/aconselhamento o automático lê `cui_acompanhamentos`, que está
-- vazia — mas eles deixaram de ser lidos na PARTE 6, então oferecê-los seria
-- oferecer lançamento para um KPI que não os consome mais.
UPDATE public.tipos_dado_bruto
   SET entrada_manual = false,
       descricao = coalesce(descricao, nome) ||
         ' ⚠️ [2026-09-21] Deixou de aceitar lançamento manual: este tipo tem ramo nativo em '
         '_kpi_agregar_dado com RETURN incondicional, então o fallback para dados_brutos é '
         'inalcançável e o que se lança aqui NUNCA é lido (47 e 37 lançamentos de servir foram '
         'desperdiçados assim). Os lançamentos antigos foram preservados como registro.'
 WHERE ativo
   AND entrada_manual = true
   AND id IN ('solicitacoes_servir_recebidas', 'solicitacoes_servir_alocadas',
              'solicitacoes_capelania_recebidas', 'solicitacoes_aconselhamento_recebidas');

-- ⚠️ Invariante: depois desta migration, NENHUM tipo ativo pode ser manual E
-- ter ramo nativo ao mesmo tempo. É a condição que torna a entrada manual
-- confiável — se ela quebrar, alguém voltou a oferecer lançamento que o
-- sistema ignora.
DO $inv$
DECLARE v_def text; v_ruins text;
BEGIN
  SELECT regexp_replace(pg_get_functiondef(p.oid), '--[^\n]*', '', 'g') INTO v_def
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = '_kpi_agregar_dado';

  SELECT string_agg(id, ', ') INTO v_ruins
    FROM public.tipos_dado_bruto
   WHERE ativo AND entrada_manual = true
     AND position('p_dado_tipo = ''' || id || '''' in v_def) > 0;

  IF v_ruins IS NOT NULL THEN
    RAISE EXCEPTION 'ABORTADO: tipos manuais com ramo nativo (o lançamento seria ignorado em silêncio): %', v_ruins;
  END IF;
END;
$inv$;
COMMIT;
