-- ============================================================================
-- OKR · liga o KR ao KPI QUE O MEDE (curadoria par a par, não por proximidade)
--
-- Pedido do Matheus: "ligue tudo que dá pra ligar". Dos 316 KRs ativos, só 13
-- mostravam resultado — os outros 303 são texto de meta sem número atrás.
--
-- ⚠️⚠️ E aqui está a correção da minha própria análise de ontem. Eu havia
-- classificado 128 KRs como "ligação direta: existe indicador com número no
-- mesmo objetivo e na mesma área — é só apontar". **Isso estava errado.** Ao
-- listar os pares antes de gravar, a amostra mostrou o que "mesmo objetivo +
-- mesma área" produz:
--
--   KR "100% das solicitações com 1ª resposta em <=48h"
--     → KPI "% voluntários escalados que fizeram check-in corretamente" (100%)
--   KR "Total de inscritos no ano >= 200"  (unidade: pessoas)
--     → KPI "% crescimento de inscritos no ciclo" (0)
--   KR "Total de voluntários ativos no ano >= 750"  (unidade: pessoas)
--     → KPI "% frequentes que são voluntários"
--
-- Ser o ÚNICO indicador do objetivo naquela área não significa que ele meça
-- aquele KR. Ligar os 128 encheria o painel da diretoria de farol verde falso e
-- de número com unidade trocada — pior que a lacuna que ele resolve.
--
-- ⇒ Esta migration liga **35 KRs**, em 8 pares curados um a um. O critério, e
-- ele é o que fica para a próxima leva:
--   (a) MESMA GRANDEZA — nível com nível, crescimento com crescimento;
--   (b) MESMA UNIDADE — % com %; KR em "pessoas", "grupos" ou "datas" não
--       recebe indicador percentual;
--   (c) MESMA JANELA — "vs 2025" não é medido por "vs a semana anterior".
--
-- O que ficou de fora, e por quê, está no fim do arquivo. Nada aqui é
-- irreversível: `fonte_kpi_id = NULL` desfaz.
-- ============================================================================

DO $$
DECLARE
  -- (título exato do KR, indicador exato do KPI). O casamento exige, além
  -- disso, MESMO objetivo, MESMA área e o KPI ter valor apurado.
  v_pares text[][] := ARRAY[
    -- nível × nível · o indicador é a própria definição do KR
    ['>=60% dos ativos com 3+ meses consecutivos',            '% Doadores ativos com recorrência ≥3 meses'],
    ['>=95% dos escalados com check-in registrado',           '% voluntarios escalados que fizeram check-in corretamente'],
    ['>=30% dos frequentes ativos servindo (6m) -> 40% (12m)', '% frequentes que são voluntários'],
    -- crescimento × crescimento · mesma janela de comparação
    ['Cada ciclo cresce >=15% em inscritos vs ciclo anterior', '% crescimento de inscritos no ciclo versos o anterior'],
    ['Valor total 2026 cresce >=15% vs 2025',                 '% Crescimento do valor total de entradas em relação ao ano anterior'],
    ['Total de doadores unicos no ano cresce >=20% vs 2025',  '% crescimento no número de doadores ativos em relação ao último ano'],
    ['Crescimento >=50% no nº de devocionais/mes vs 2025',    '% de crescimento'],
    ['Total de grupos ativos no ano >= baseline + 20%',       '% crescimento do número de grupos em relação ao ciclo anterior']
  ];
  v_par text[];
  v_n int;
  v_total int := 0;
BEGIN
  FOREACH v_par SLICE 1 IN ARRAY v_pares LOOP
    UPDATE public.kpi_krs kr
       SET fonte_kpi_id = k.id,
           updated_at = now()
      FROM public.kpi_indicadores_taticos k
     WHERE kr.ativo
       AND kr.fonte_kpi_id IS NULL          -- idempotente e não sobrescreve curadoria anterior
       AND kr.titulo = v_par[1]
       AND k.indicador = v_par[2]
       AND k.ativo
       AND k.deleted_at IS NULL
       AND k.objetivo_geral_id = kr.objetivo_geral_id
       AND lower(coalesce(k.area, '')) = lower(coalesce(kr.area, ''))
       -- só liga em indicador que JÁ tem número: KR ligado a indicador vazio
       -- continua sem dizer nada e ainda dá a impressão de estar resolvido.
       AND EXISTS (
         SELECT 1 FROM public.vw_kpi_trajetoria_atual v
          WHERE v.kpi_id = k.id AND v.ultimo_valor IS NOT NULL
       );
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_total := v_total + v_n;
    RAISE NOTICE '% KR(s) ligados a "%"', v_n, v_par[2];
  END LOOP;
  RAISE NOTICE 'total ligado nesta leva: %', v_total;
END $$;

-- ── O que NÃO foi ligado, e por quê (para a próxima decisão) ────────────────
--
-- 18 KRs · MESMA grandeza, JANELA diferente — ligável com ressalva, decisão de
--   quem definiu o indicador:
--     "Frequencia media acumulada do ano +15%"    × "% crescimento da frequencia
--        em relação a SEMANA anterior"
--     "Total de conversoes do ano cresce >=20%"   × idem, semana
--     "Total de batismos do ano cresce >=25%"     × "% crescimento de batismos em
--        relação ao ÚLTIMO EVENTO"
--     ">=90% dos voluntarios com checkin correto em >=80% das escalas" ×
--        "% de escalas com check-in" (a régua do KR é por PESSOA, a do KPI é por
--        ESCALA — números diferentes para a mesma frase)
--
-- ~69 KRs · o único indicador do objetivo/área mede OUTRA coisa (os exemplos do
--   cabeçalho). Ligar seria fabricar farol.
--
-- 6 KRs · mais de um candidato e nenhum decide sozinho (batismos e devocionais).
--
-- 71 KRs · nenhum indicador do objetivo tem número — capelania, aconselhamento,
--   líderes em treinamento, líderes acompanhados, satisfação de líderes,
--   recuperar voluntários inativos e "Engajamento Online · Marketing". Ali falta
--   o FATO no sistema, não a ligação.
