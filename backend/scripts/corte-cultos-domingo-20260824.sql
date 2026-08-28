-- ============================================================================
-- O CORTE DOS CULTOS DE DOMINGO · 24/08/2026 (docs/cultos-domingo/ · Lote 5)
-- ============================================================================
-- ⚠️⚠️ ESTE ARQUIVO NÃO É MIGRATION — vive em backend/scripts/ de propósito e
-- SÓ deve ser executado no SQL Editor NO DIA 24/08/2026, na janela combinada.
--
-- COMO USAR:
--   ENSAIO (qualquer dia, quantas vezes quiser): rodar como está. O bloco faz
--   TUDO (backups, tipo novo, cultos, slots, batismo, view, véu, invariantes)
--   e termina com EXCEPTION "ENSAIO OK — …resumo…" → ROLLBACK TOTAL, nada
--   gravado. O resumo aparece na mensagem de erro do editor.
--
--   CORTE REAL (24/08): trocar UMA linha — v_executar := true — e rodar.
--   Tudo numa transação só: qualquer invariante violada aborta e desfaz tudo.
--
-- PRÉ-REQUISITOS (o script confere e aborta se faltarem):
--   · Lote 2 aplicado (régua do voluntariado aceita 'Domingo 09:30')
--   · Lote 3 aplicado (colunas vigente_de/linhagem_key + cultos_config)
--   · Cerimônia de batismo de 23/08 JÁ realizada (o script mexe nos horários)
--
-- CHECKLIST DO DIA 24 (o que NÃO é este script):
--   [ ] PCO (⚠️ RE-MEDIDO em 18/08 · a igreja esta MIGRANDO do Planning Center,
--       e a verdade passa a ser o nosso sistema — mas o sync AINDA e o dono das
--       linhas futuras do voluntariado): corrigir a hora de 3 planos para 09:30 —
--       'Domingo - Manhã' (90926558 · 30/08) e 'CBKIDS - Manhã Domingo'
--       (90756297 30/08 · 90756298 06/09). As escalas NAO se movem (vinculo por
--       service_id). ⚠️⚠️ NAO tentar consertar no BANCO: os 4 vol_services de
--       manha >= 30/08 sao PCO-only (service_type_id IS NULL), e nesse ramo o
--       executarSyncCompleto (planningCenter.js:375) faz upsert de scheduled_at
--       pelo planning_center_id — ou seja o cron horario REVERTE o update em
--       ate 60 min. Quando o service e INTERNO (service_type_id preenchido) o
--       sync so liga o plan_id e nao encosta na hora; nao e o caso destes.
--       ⚠️ O que NAO depende disto: a regua do turno classifica por NOME
--       ('Domingo - Manhã'), nao por hora, entao Dashboard Semanal, bloco e
--       contagem de check-in ficam CERTOS sem nenhuma acao. O que fica errado
--       sem corrigir e a HORA que o voluntario ve — 106 escalas de manha
--       (16+16+26 em 30/08 · 48 em 06/09) diriam 08:30, e o lembrete de escala
--       no WhatsApp sai com ela.
--       ⚠️ PRAZO REAL: **antes de 29/08**, não do dia 24 — o lembrete de escala
--       sai na véspera (`avisoEscala.js:153` monta a hora de
--       `vol_services.scheduled_at`), então para o domingo 30/08 ele dispara em
--       29/08. ⚠️⚠️ E não há como consertar daqui: `planningCenter.js` é 100% GET
--       (nenhum método de escrita) e a credencial vive só na env da Vercel. As
--       alternativas dentro do sistema foram medidas e DESCARTADAS: marcar os 4
--       serviços como internos (`service_type_id` preenchido) faria o sync parar
--       de sobrescrever a hora, mas `service_type_id` é usado semanticamente
--       (`voluntariado.js:2346` e `:2376` filtram serviços POR TIPO), e serviços
--       de TURNO passariam a contar como serviços de um culto específico.
--   [ ] /admin/whatsapp → Configuração → "Horários de culto": grade nova +
--       texto ponte explicando a mudança (única superfície pública que explica).
--   [x] Financeiro (D2): FEITO — contas novas criadas e os 2 uuids ja estao
--       preenchidos no DECLARE. O slot 'Domingo 9:30' nasce apontando pra elas.
--   [ ] ⚠️ `aceita_lancamento = false` nas contas VELHAS (3.01.01.08/.09 e
--       3.01.02.08/.09) — parte da D2, mas **DE PROPOSITO NAO no dia 24**: a
--       oferta do culto de 23/08 costuma ser conciliada DIAS depois, e travar a
--       conta antes disso recusaria a classificacao do ultimo domingo do formato
--       antigo. Quem ja impede lancamento NOVO no horario extinto e o slot
--       (ativo=false, passo 5). Fazer isto quando a conciliacao de 23/08 estiver
--       fechada — decisao de data do Matheus, nao do script.
--   [x] CBRio-Staff: RESOLVIDO em 18/08 (PR #17 do app) — a grade do card "Culto
--       de hoje" virou régua DATADA (`lib/gradeCulto.ts`), correta antes e depois
--       do corte, então **não há mais item de OTA no dia 24**. Falta apenas
--       publicar uma vez (`npm run ota -- "..."`) para o bundle levar a régua.
--       ⚠️ O caminho antes anotado aqui estava ERRADO: é
--       `app/(app)/(tabs)/index.tsx:277`, não `app/(app)/index.tsx:276` — e o
--       formato é `8h30` (com `h`), o que fez um grep por `08:30` não achar a
--       linha em 18/08.
--   [ ] Conferir a Home do app de MEMBROS (card do culto mostra 09:30) — repo
--       separado, não auditado nesta frente.
--   [ ] 30/08 (campo): totem Kids às 08:50/09:35/10:45/11:15 (chip do culto);
--       voluntariado × view; online_pico do 09:30; PIX da manhã → slot 9:30.
--   [ ] Pós: dashboard_metas SÓ anota o corte no rótulo (recalibrar em OUTUBRO);
--       conferir lembrete de batismo antes de 26/09; bebês 13/09 já cai na
--       régua D3 sozinho (Lote 1).
--
-- ROLLBACK (se algo der errado DEPOIS do commit): as tabelas _bk_20260824_*
-- criadas aqui guardam o estado anterior de tudo que o script muda.
--
-- ⚠️⚠️ O `SET statement_timeout` ABAIXO NÃO É ENFEITE — sem ele o corte estoura.
-- Medido no ensaio de 18/08 (em bloco revertido, contra a base de produção):
-- `cultos` tem DOIS gatilhos ROW-level — `cultos_recalc_kpis`
-- (trg_kpi_recalcular_culto) e `cultos_recalcular_nsm`
-- (tg_nsm_recalcular_pos_culto) — e cada linha custa **1,26 s no INSERT e
-- 2,44 s no DELETE**. O corte faz 18 inserts + 36 deletes ⇒ **~110 s só nesse
-- trecho**, antes dos backups, do patch da view e das 10 invariantes. O
-- `statement_timeout` da sessão é **2 min**: o corte inteiro ficaria no fio e,
-- muito provavelmente, POR CIMA — abortando (com rollback, seguro) no dia, sob
-- pressão de tempo. O bloco `DO` é UMA instrução, então `SET LOCAL` dentro dele
-- não valeria para ele mesmo: o SET tem de vir ANTES, como statement separado.
-- ⚠️ Por isso também: **NÃO rodar este script por cliente com timeout curto**
-- (o MCP do Supabase aborta antes) — é SQL Editor, com as duas instruções
-- colando juntas na mesma sessão.
-- ⚠️ NÃO "otimizar" desligando os gatilhos (`ALTER TABLE cultos DISABLE
-- TRIGGER`): as linhas futuras são todas zero e nenhum KPI/NSM mudaria de
-- valor, mas suprimir gatilho na tabela mais quente do sistema é decisão de
-- gente, não efeito colateral de acelerar um script.
-- ============================================================================

SET statement_timeout = '10min';

DO $corte$
DECLARE
  -- ⚠️⚠️ ÚNICA LINHA A MUDAR NO DIA 24/08 ⚠️⚠️
  v_executar constant boolean := false;   -- false = ENSAIO (rollback total)

  -- ✅ D2 RESPONDIDA (ok do financeiro em 18/08): conta NOVA, nao reuso.
  -- Criadas em 18/08 seguindo a convencao das irmas (nivel 4 · natureza
  -- 'ordinaria' · aceita_lancamento=true · ordem = a do irmao, porque a sequencia
  -- global 301..321 e densa e nao havia inteiro livre entre o dizimo 10:00 (311)
  -- e o cabecalho OFERTAS (312) — nao ha unique em `ordem`, so em `codigo`, e
  -- empatar deixa cada conta ao lado do seu grupo sem reescrever linha nenhuma):
  --   3.01.01.10  Dizimos Domingo 9:30
  --   3.01.02.10  Ofertas Domingo 9:30
  v_conta_dizimo_0930 uuid := '08019a7a-b59d-4cd5-97d9-c0d8d7c8a37d';
  v_conta_oferta_0930 uuid := 'fffb0e2a-65cd-42cc-baf5-30288ae03b30';

  v_id0830   uuid; v_id1000 uuid; v_novo_id uuid;
  v_t1000    public.vol_service_types%ROWTYPE;
  v_n        int; v_tmp int;
  v_bloq     int;
  v_datas    int;  -- domingos futuros que ganham o 09:30
  v_del      int;  -- linhas futuras removidas (08:30 + 10:00)
  v_orfaos0  int;
  v_def      text;
  v_resumo   text := '';
  v_slot_diz uuid; v_slot_ofe uuid;
  v_slot9    uuid;
  v_fin_nome text;
BEGIN
  ---------------------------------------------------------------------------
  -- 0 · PRÉ-CONDIÇÕES (aborta cedo, antes de tocar em qualquer coisa)
  ---------------------------------------------------------------------------
  IF v_executar AND current_date < DATE '2026-08-24' THEN
    RAISE EXCEPTION '[corte] execução REAL antes de 24/08 — o corte não roda antes do dia (ensaie com v_executar=false)';
  END IF;

  IF NOT public.fn_dash_vol_service_no_bloco('Domingo 09:30') THEN
    RAISE EXCEPTION '[corte] a régua do voluntariado NÃO aceita ''Domingo 09:30'' — aplicar o Lote 2 (20260813120000) antes';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema='public' AND table_name='vol_service_types' AND column_name='linhagem_key') THEN
    RAISE EXCEPTION '[corte] colunas do Lote 3 ausentes — aplicar a 20260813150000 antes';
  END IF;

  SELECT id INTO v_id0830 FROM public.vol_service_types WHERE name = 'Domingo 08:30';
  SELECT id INTO v_id1000 FROM public.vol_service_types WHERE name = 'Domingo 10:00';
  IF v_id0830 IS NULL OR v_id1000 IS NULL THEN
    RAISE EXCEPTION '[corte] não achei os tipos ''Domingo 08:30''/''Domingo 10:00'' pelo nome exato — investigar';
  END IF;
  SELECT * INTO v_t1000 FROM public.vol_service_types WHERE id = v_id1000;

  SELECT count(*) INTO v_orfaos0 FROM public.cultos WHERE service_type_id IS NULL;

  -- cultos futuros dos tipos que saem: guardas conferidas AGORA (não em 11/08).
  -- Qualquer contador > 0 ou satélite vivo = decisão humana, o script NÃO decide.
  SELECT count(*) INTO v_bloq
    FROM public.cultos c
   WHERE c.service_type_id IN (v_id0830, v_id1000)
     AND c.data >= DATE '2026-08-30'
     AND c.deleted_at IS NULL
     AND (
       COALESCE(c.presencial_adulto,0) + COALESCE(c.presencial_kids,0)
       + COALESCE(c.decisoes_presenciais,0) + COALESCE(c.decisoes_online,0)
       + COALESCE(c.decisoes_kids,0) + COALESCE(c.online_pico,0)
       + COALESCE(c.online_ds,0) + COALESCE(c.online_ddus,0)
       + COALESCE(c.voluntarios_escalados,0) + COALESCE(c.voluntarios_checkin,0) > 0
       OR EXISTS (SELECT 1 FROM public.kids_sessoes k WHERE k.culto_id = c.id)
       OR EXISTS (SELECT 1 FROM public.culto_producao p WHERE p.culto_id = c.id)
       OR EXISTS (SELECT 1 FROM public.cultos_dados_submissoes s WHERE s.culto_id = c.id)
       OR EXISTS (SELECT 1 FROM public.cultos_decisoes_pessoas d WHERE d.culto_id = c.id AND d.deleted_at IS NULL)
       OR EXISTS (SELECT 1 FROM public.app_decisoes a WHERE a.culto_id = c.id AND a.deleted_at IS NULL)
     );
  IF v_bloq > 0 THEN
    RAISE EXCEPTION '[corte] % culto(s) FUTUROS dos tipos que saem têm dado/satélite — listar com a query do rodapé e decidir na mão antes de rodar', v_bloq;
  END IF;

  ---------------------------------------------------------------------------
  -- 1 · BACKUPS (tabelas _bk_ · persistem SÓ no corte real; no ensaio somem
  --     no rollback). O ensaio em node (_corte_cultos_domingo_ensaio.cjs)
  --     grava o MESMO estado em JSON no Downloads — backup fora do banco.
  ---------------------------------------------------------------------------
  CREATE TABLE IF NOT EXISTS public._bk_20260824_vol_service_types AS
    SELECT * FROM public.vol_service_types WHERE recurrence_day = 0;
  CREATE TABLE IF NOT EXISTS public._bk_20260824_cultos_futuros AS
    SELECT * FROM public.cultos
     WHERE service_type_id IN (v_id0830, v_id1000) AND data >= DATE '2026-08-30';
  CREATE TABLE IF NOT EXISTS public._bk_20260824_fin_culto_slots AS
    SELECT * FROM public.fin_culto_slots WHERE dia_semana = 0;
  CREATE TABLE IF NOT EXISTS public._bk_20260824_batismo_horarios AS
    SELECT * FROM public.batismo_horarios;
  BEGIN
    -- kpi_registros aponta pro KPI por indicador_id (que É o código texto:
    -- kpi_indicadores_taticos.id = 'SED-18' — conferido no ensaio de 13/08,
    -- quando o nome errado "kpi_id" caiu neste EXCEPTION e virou aviso)
    CREATE TABLE IF NOT EXISTS public._bk_20260824_kpi_registros_sede AS
      SELECT * FROM public.kpi_registros WHERE indicador_id IN ('SED-18','SED-21');
  EXCEPTION WHEN others THEN
    v_resumo := v_resumo || ' · AVISO: backup de kpi_registros falhou (' || SQLERRM || ')';
  END;

  ---------------------------------------------------------------------------
  -- 2 · TIPO NOVO "Domingo 09:30" (opção B · herda flags do 10:00 — mina nº 2:
  --     o POST /service-types descarta has_kids/has_online/presencial_label,
  --     por isso o tipo nasce AQUI, por SQL, com TODAS as flags)
  ---------------------------------------------------------------------------
  SELECT id INTO v_novo_id FROM public.vol_service_types WHERE name = 'Domingo 09:30';
  IF v_novo_id IS NULL THEN
    INSERT INTO public.vol_service_types
      (name, description, recurrence_day, recurrence_time, is_active, color,
       presencial_label, has_kids, has_online, has_online_stream, meta_duracao_min,
       vigente_de, linhagem_key, consolidacao_key)
    VALUES
      ('Domingo 09:30',
       'Culto de domingo 09:30 · nasce no corte de 24/08/2026 (sucede o 10:00 · docs/cultos-domingo/)',
       0, time '09:30', true, v_t1000.color,
       v_t1000.presencial_label, true, true, COALESCE(v_t1000.has_online_stream, true),
       COALESCE(v_t1000.meta_duracao_min, 60),
       DATE '2026-08-24', 'domingo-0930', 'domingo-0930')
    RETURNING id INTO v_novo_id;
    v_resumo := v_resumo || ' · tipo "Domingo 09:30" criado';
  ELSE
    -- ⚠️⚠️ NORMALIZA em vez de só relatar. O tipo pode ter sido PRÉ-CRIADO antes
    -- do dia (foi o que aconteceu em 19/08: criado com `is_active=false` para o
    -- Dashboard já mostrar o 09:30 sem que o cron de auto-create materializasse
    -- um culto fantasma no domingo 23/08, que ainda é do formato antigo — o
    -- auto-create filtra `is_active=true` e NÃO conhece vigência). Sem esta
    -- normalização o ELSE deixava o tipo inativo e a invariante "grade ativa da
    -- manhã = {09:30, 11:30}" ABORTAVA o corte inteiro, no dia.
    UPDATE public.vol_service_types
       SET is_active        = true,
           recurrence_day   = 0,
           recurrence_time  = time '09:30',
           vigente_de       = COALESCE(vigente_de, DATE '2026-08-24'),
           linhagem_key     = COALESCE(linhagem_key, 'domingo-0930'),
           consolidacao_key = COALESCE(consolidacao_key, 'domingo-0930'),
           presencial_label = COALESCE(presencial_label, v_t1000.presencial_label),
           has_kids         = true,
           has_online       = true,
           has_online_stream = COALESCE(has_online_stream, v_t1000.has_online_stream, true),
           meta_duracao_min = COALESCE(meta_duracao_min, v_t1000.meta_duracao_min, 60)
     WHERE id = v_novo_id;
    v_resumo := v_resumo || ' · tipo "Domingo 09:30" já existia — ATIVADO e normalizado';
  END IF;

  -- invariante: as flags do tipo novo têm que espelhar o 10:00 (has_kids é o
  -- que faz criança fazer check-in; has_online_stream é o que faz o auto-create
  -- materializar a grade)
  PERFORM 1 FROM public.vol_service_types
    WHERE id = v_novo_id AND has_kids = true AND has_online = true
      AND COALESCE(has_online_stream, false) = true AND presencial_label = v_t1000.presencial_label;
  IF NOT FOUND THEN
    RAISE EXCEPTION '[corte] flags do tipo novo divergem do esperado (has_kids/has_online/has_online_stream/presencial_label) — conferir';
  END IF;

  -- encerrar 08:30 e 10:00 (NUNCA delete · mina nº 5). is_active=false ANTES de
  -- limpar as linhas futuras, senão o auto-create recria (ordem da varredura §5).
  UPDATE public.vol_service_types
     SET is_active = false,
         vigente_ate = COALESCE(vigente_ate, DATE '2026-08-23')
   WHERE id IN (v_id0830, v_id1000) AND is_active = true;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_resumo := v_resumo || ' · tipos encerrados: ' || v_n;

  ---------------------------------------------------------------------------
  -- 3 · ESCALA: o template do 10:00 passa a valer pro 09:30 (pré-requisito nº 4
  --     da opção B — sem o vínculo a escala de 30/08 sai vazia)
  ---------------------------------------------------------------------------
  INSERT INTO public.vol_escala_template_tipos (template_id, service_type_id)
  SELECT t.template_id, v_novo_id
    FROM public.vol_escala_template_tipos t
   WHERE t.service_type_id = v_id1000
  ON CONFLICT (template_id, service_type_id) DO NOTHING;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n = 0 AND NOT EXISTS (SELECT 1 FROM public.vol_escala_template_tipos WHERE service_type_id = v_novo_id) THEN
    v_resumo := v_resumo || ' · AVISO: nenhum template de escala vinculado (o 10:00 também não tinha — conferir a escala de 30/08 na mão)';
  ELSE
    v_resumo := v_resumo || ' · vínculos de template de escala: ' || v_n;
  END IF;

  ---------------------------------------------------------------------------
  -- 4 · CULTOS FUTUROS: materializa o 09:30 nos domingos do 10:00 e remove as
  --     linhas dos tipos que saem (vazias por guarda do passo 0 · backup no 1)
  ---------------------------------------------------------------------------
  INSERT INTO public.cultos
    (service_type_id, nome, data, hora,
     presencial_adulto, presencial_kids, decisoes_presenciais, decisoes_online)
  SELECT v_novo_id,
         'Domingo 09:30 — ' || to_char(c.data, 'DD/MM/YYYY'),
         c.data, time '09:30',
         0, 0, 0, 0
    FROM (SELECT DISTINCT data FROM public.cultos
           WHERE service_type_id = v_id1000 AND data >= DATE '2026-08-30' AND deleted_at IS NULL) c
  ON CONFLICT (service_type_id, data) DO NOTHING;
  GET DIAGNOSTICS v_datas = ROW_COUNT;
  v_resumo := v_resumo || ' · cultos 09:30 criados: ' || v_datas;

  -- apresentações de bebê agendadas num 10:00/08:30 futuro migram pro 09:30 da
  -- MESMA data (D3 · régua nova). Hoje a tabela está vazia — é rede de segurança.
  UPDATE public.apresentacao_bebes ab
     SET culto_id = n.id
    FROM public.cultos velho
    JOIN public.cultos n ON n.service_type_id = v_novo_id AND n.data = velho.data
   WHERE ab.culto_id = velho.id
     AND velho.service_type_id IN (v_id0830, v_id1000)
     AND velho.data >= DATE '2026-08-30';
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n > 0 THEN v_resumo := v_resumo || ' · apresentações repontadas: ' || v_n; END IF;

  DELETE FROM public.cultos c
   WHERE c.service_type_id IN (v_id0830, v_id1000)
     AND c.data >= DATE '2026-08-30';
  GET DIAGNOSTICS v_del = ROW_COUNT;
  v_resumo := v_resumo || ' · cultos futuros removidos (08:30+10:00): ' || v_del;

  ---------------------------------------------------------------------------
  -- 5 · FINANCEIRO: recorte dos slots de domingo (B1 · a fronteira 09:30).
  --     Alvo: 9:30 → 06:00–11:00 · 11:30 → 11:00–14:00 (já é) · Noite →
  --     14:00–23:59 (já é). Slot NUNCA é deletado (FK de fin_pix_detalhe/
  --     fin_transacoes) — os que saem viram ativo=false.
  ---------------------------------------------------------------------------
  -- contas do slot novo: a conta NOVA (D2c) se veio; senão interim = as do 10:00
  SELECT plano_contas_dizimo_id, plano_contas_oferta_id
    INTO v_slot_diz, v_slot_ofe
    FROM public.fin_culto_slots WHERE service_type_slug = 'domingo-10h';
  IF v_slot_diz IS NULL THEN
    RAISE EXCEPTION '[corte] slot ''domingo-10h'' não encontrado em fin_culto_slots — investigar';
  END IF;
  v_slot_diz := COALESCE(v_conta_dizimo_0930, v_slot_diz);
  v_slot_ofe := COALESCE(v_conta_oferta_0930, v_slot_ofe);

  UPDATE public.fin_culto_slots
     SET ativo = false
   WHERE service_type_slug IN ('domingo-8h30', 'domingo-10h') AND ativo = true;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_resumo := v_resumo || ' · slots financeiros desativados: ' || v_n;

  SELECT id INTO v_slot9 FROM public.fin_culto_slots WHERE service_type_slug = 'domingo-9h30';
  IF v_slot9 IS NULL THEN
    INSERT INTO public.fin_culto_slots
      (nome, dia_semana, hora_inicio, hora_fim, hora_fim_proximo_dia,
       plano_contas_dizimo_id, plano_contas_oferta_id, service_type_slug, ativo, ordem)
    VALUES ('Domingo 9:30', 0, time '06:00', time '11:00', false,
            v_slot_diz, v_slot_ofe, 'domingo-9h30', true, 10)
    RETURNING id INTO v_slot9;
    v_resumo := v_resumo || ' · slot financeiro 9:30 criado'
      || CASE WHEN v_conta_dizimo_0930 IS NULL THEN ' (contas INTERIM do 10:00 · D2 fallback)' ELSE ' (conta NOVA)' END;
  ELSE
    UPDATE public.fin_culto_slots SET ativo = true WHERE id = v_slot9 AND ativo = false;
    v_resumo := v_resumo || ' · slot financeiro 9:30 já existia (idempotente)';
  END IF;

  -- 11:30 e Noite: garantir as janelas-alvo sem buraco nem sobreposição
  UPDATE public.fin_culto_slots
     SET hora_inicio = time '11:00', hora_fim = time '14:00'
   WHERE service_type_slug = 'domingo-11h30'
     AND (hora_inicio <> time '11:00' OR hora_fim <> time '14:00');
  UPDATE public.fin_culto_slots
     SET hora_inicio = time '14:00'
   WHERE service_type_slug = 'domingo-19h' AND hora_inicio <> time '14:00';

  ---------------------------------------------------------------------------
  -- 6 · BATISMO (D5 · sem ordinais · abrir 09:30 + 11:30 · após a cerimônia
  --     de 23/08). Fechar NUNCA é soft-delete: o label do histórico é
  --     resolvido do catálogo vivo (A1).
  ---------------------------------------------------------------------------
  UPDATE public.batismo_horarios
     SET aberto = false, updated_at = now()
   WHERE horario IN ('08:30', '10:00') AND deleted_at IS NULL AND aberto = true;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_resumo := v_resumo || ' · horários de batismo fechados: ' || v_n;

  -- find-or-insert (o UNIQUE de horario é índice PARCIAL — ON CONFLICT não infere)
  IF EXISTS (SELECT 1 FROM public.batismo_horarios WHERE horario = '09:30' AND deleted_at IS NULL) THEN
    UPDATE public.batismo_horarios
       SET aberto = true, limite = COALESCE(limite, 11), label = 'Domingo · 09:30', updated_at = now()
     WHERE horario = '09:30' AND deleted_at IS NULL;
    v_resumo := v_resumo || ' · batismo 09:30 reaberto';
  ELSE
    INSERT INTO public.batismo_horarios (horario, label, aberto, limite, ordem)
    VALUES ('09:30', 'Domingo · 09:30', true, 11, 2);
    v_resumo := v_resumo || ' · batismo 09:30 criado (limite 11)';
  END IF;

  UPDATE public.batismo_horarios
     SET aberto = true, limite = COALESCE(limite, 11), label = 'Domingo · 11:30', updated_at = now()
   WHERE horario = '11:30' AND deleted_at IS NULL;

  ---------------------------------------------------------------------------
  -- 7 · VOLUNTARIADO: anchor do bloco 'Domingo Manhã' na view (08:30 → 09:30).
  --     Patch DINÂMICO sobre a definição VIVA (nunca colar arquivo · drift).
  ---------------------------------------------------------------------------
  v_def := pg_get_viewdef('public.vw_dashboard_voluntariado'::regclass, true);
  IF position('09:30:00' in v_def) > 0 THEN
    v_resumo := v_resumo || ' · anchor do bloco já era 09:30 (idempotente)';
  ELSE
    SELECT count(*) INTO v_n FROM regexp_matches(v_def, '08:30:00', 'g');
    IF v_n <> 1 THEN
      RAISE EXCEPTION '[corte] esperava exatamente 1 ocorrência de 08:30:00 na vw_dashboard_voluntariado (o anchor do bloco) e achei % — investigar antes de aplicar', v_n;
    END IF;
    v_def := replace(v_def, '08:30:00', '09:30:00');
    EXECUTE 'CREATE OR REPLACE VIEW public.vw_dashboard_voluntariado AS ' || v_def;
    v_def := pg_get_viewdef('public.vw_dashboard_voluntariado'::regclass, true);
    IF position('09:30:00' in v_def) = 0 THEN
      RAISE EXCEPTION '[corte] patch do anchor executado mas a releitura não achou 09:30:00 — investigar';
    END IF;
    v_resumo := v_resumo || ' · anchor do bloco Domingo Manhã → 09:30';
  END IF;

  ---------------------------------------------------------------------------
  -- 8 · O VÉU CAI: a prévia (lentes + ocupação) fica visível pra todos
  ---------------------------------------------------------------------------
  UPDATE public.cultos_config
     SET lentes_domingo_publicas = true, atualizado_em = now()
   WHERE id = true AND lentes_domingo_publicas = false;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_resumo := v_resumo || CASE WHEN v_n > 0 THEN ' · véu ABERTO' ELSE ' · véu já estava aberto' END;

  ---------------------------------------------------------------------------
  -- 9 · INVARIANTES (§4.2 da varredura · qualquer violação = rollback total)
  ---------------------------------------------------------------------------
  -- fantasmas: nenhum culto futuro dos tipos encerrados
  SELECT count(*) INTO v_n FROM public.cultos
   WHERE service_type_id IN (v_id0830, v_id1000) AND data >= DATE '2026-08-30';
  IF v_n <> 0 THEN RAISE EXCEPTION '[corte] invariante: % culto(s) fantasma dos tipos encerrados sobraram', v_n; END IF;

  -- órfãos não cresceram
  SELECT count(*) INTO v_n FROM public.cultos WHERE service_type_id IS NULL;
  IF v_n <> v_orfaos0 THEN RAISE EXCEPTION '[corte] invariante: cultos órfãos mudaram de % pra %', v_orfaos0, v_n; END IF;

  -- grade ativa da manhã = exatamente 09:30 e 11:30
  SELECT count(*) INTO v_n FROM public.vol_service_types
   WHERE recurrence_day = 0 AND is_active = true AND recurrence_time < time '14:00';
  SELECT count(*) INTO v_tmp FROM public.vol_service_types
   WHERE recurrence_day = 0 AND is_active = true AND recurrence_time IN (time '09:30', time '11:30');
  IF v_n <> 2 OR v_tmp <> 2 THEN
    RAISE EXCEPTION '[corte] invariante: grade ativa da manhã não é exatamente {09:30, 11:30} (manhã ativa=% · esperados=%)', v_n, v_tmp;
  END IF;

  -- financeiro: a fronteira 09:30 morreu — 30/08 de manhã cai TODA no slot 9:30
  SELECT s.nome INTO v_fin_nome FROM public.fin_culto_slots s
   WHERE s.id = public.fin_identifica_culto(timestamp '2026-08-30 09:29');
  IF v_fin_nome IS DISTINCT FROM 'Domingo 9:30' THEN
    RAISE EXCEPTION '[corte] invariante: PIX de 09:29 cairia em "%" (esperado Domingo 9:30)', COALESCE(v_fin_nome, 'nenhum slot');
  END IF;
  SELECT s.nome INTO v_fin_nome FROM public.fin_culto_slots s
   WHERE s.id = public.fin_identifica_culto(timestamp '2026-08-30 10:59');
  IF v_fin_nome IS DISTINCT FROM 'Domingo 9:30' THEN
    RAISE EXCEPTION '[corte] invariante: PIX de 10:59 cairia em "%" (esperado Domingo 9:30)', COALESCE(v_fin_nome, 'nenhum slot');
  END IF;
  SELECT s.nome INTO v_fin_nome FROM public.fin_culto_slots s
   WHERE s.id = public.fin_identifica_culto(timestamp '2026-08-30 11:00');
  IF v_fin_nome IS DISTINCT FROM 'Domingo 11:30' THEN
    RAISE EXCEPTION '[corte] invariante: PIX de 11:00 cairia em "%" (esperado Domingo 11:30)', COALESCE(v_fin_nome, 'nenhum slot');
  END IF;

  -- batismo: grade pública = 09:30 e 11:30 abertos, 08:30/10:00 fechados
  SELECT count(*) INTO v_n FROM public.batismo_horarios
   WHERE deleted_at IS NULL AND aberto = true AND horario IN ('09:30','11:30');
  SELECT count(*) INTO v_tmp FROM public.batismo_horarios
   WHERE deleted_at IS NULL AND aberto = true AND horario IN ('08:30','10:00');
  IF v_n <> 2 OR v_tmp <> 0 THEN
    RAISE EXCEPTION '[corte] invariante: batismo aberto errado (novos abertos=% · velhos abertos=%)', v_n, v_tmp;
  END IF;

  ---------------------------------------------------------------------------
  -- ENSAIO × CORTE
  ---------------------------------------------------------------------------
  IF NOT v_executar THEN
    RAISE EXCEPTION 'ENSAIO OK — NADA FOI GRAVADO (rollback total). O corte faria:%', v_resumo;
  END IF;
  -- corte real: commit no fim do bloco. Conferir com as queries do rodapé
  -- (o SQL Editor não mostra NOTICE — lei da casa: conferir no catálogo/dados).
END $corte$;

-- ============================================================================
-- CONFERÊNCIA PÓS-CORTE (rodar DEPOIS do corte real · nada disso escreve):
--
--   -- grade de domingo
--   select name, is_active, recurrence_time, vigente_de, vigente_ate,
--          linhagem_key, consolidacao_key, has_kids, has_online, has_online_stream
--     from vol_service_types where recurrence_day = 0 order by recurrence_time;
--
--   -- snapshot × catálogo (2 horas distintas SÓ nos tipos alterados; 09:30 uniforme)
--   select vst.name, c.hora, count(*), min(c.data), max(c.data)
--     from cultos c join vol_service_types vst on vst.id = c.service_type_id
--    where vst.recurrence_day = 0 group by 1,2 order by 1,2;
--
--   -- fantasmas (tem que ser 0)
--   select count(*) from cultos c join vol_service_types vst on vst.id = c.service_type_id
--    where vst.is_active = false and vst.recurrence_day = 0 and c.data >= '2026-08-30';
--
--   -- financeiro: a fronteira morreu
--   select h, (select nome from fin_culto_slots s
--               where s.id = fin_identifica_culto(('2026-08-30 '||h)::timestamp)) as slot
--     from (values ('08:00'),('09:29'),('09:30'),('10:59'),('11:00'),('19:15')) v(h);
--
--   -- batismo público
--   select horario, label, aberto, limite from batismo_horarios
--    where deleted_at is null order by ordem;
--
--   -- bloco do voluntariado (anchor)
--   select position('09:30:00' in pg_get_viewdef('public.vw_dashboard_voluntariado'::regclass, true)) > 0;
--
--   -- véu
--   select lentes_domingo_publicas from cultos_config;
--
--   -- se o passo 0 acusar culto futuro com dado/satélite, listar com:
--   select c.id, c.data, c.nome, c.presencial_adulto, c.presencial_kids,
--          exists(select 1 from kids_sessoes k where k.culto_id = c.id) as tem_kids_sessao,
--          exists(select 1 from culto_producao p where p.culto_id = c.id) as tem_producao,
--          exists(select 1 from cultos_dados_submissoes s where s.culto_id = c.id) as tem_submissao,
--          exists(select 1 from cultos_decisoes_pessoas d where d.culto_id = c.id and d.deleted_at is null) as tem_decisao
--     from cultos c join vol_service_types vst on vst.id = c.service_type_id
--    where vst.name in ('Domingo 08:30','Domingo 10:00') and c.data >= '2026-08-30'
--    order by c.data;
-- ============================================================================
