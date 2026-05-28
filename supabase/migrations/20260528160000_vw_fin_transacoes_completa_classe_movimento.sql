-- Fix · vw_fin_transacoes_completa não expunha classe_movimento
-- O backend (dashboard/semana-completa) faz .select('...classe_movimento') desde a PR #762
-- e quando a coluna não existe na view, PostgREST retorna 400 + .data fica null,
-- zerando os buckets "Por Culto" do dashboard semanal financeiro.

CREATE OR REPLACE VIEW public.vw_fin_transacoes_completa AS
SELECT
  t.id,
  t.conta_id,
  t.tipo,
  t.descricao,
  t.valor,
  t.data_competencia,
  t.data_pagamento,
  t.status,
  t.referencia,
  t.observacoes,
  t.created_at,
  t.created_by,
  -- Plano de contas
  pc.codigo AS plano_contas_codigo,
  pc.nome AS plano_contas_nome,
  pc.tipo AS plano_contas_tipo,
  pc.natureza AS plano_contas_natureza,
  -- Centro de custo
  cc.codigo AS centro_custo_codigo,
  cc.nome AS centro_custo_nome,
  cc.campus AS centro_custo_campus,
  cc.area_slug AS centro_custo_area,
  -- Culto slot (se for receita classificada por culto)
  cs.nome AS culto_nome,
  cs.dia_semana AS culto_dia_semana,
  cs.service_type_slug AS culto_service_type_slug,
  -- Membro
  m.nome AS membro_nome,
  m.cpf AS membro_cpf,
  -- Metadata
  t.classificacao_origem,
  t.classificacao_confianca,
  t.identificador_centavo,
  t.hora_real,
  t.lancamento_bruto_id,
  t.pix_detalhe_id,
  -- ⭐ NOVO · classe de movimento (PR #762) · pra bucketing exclui emprestimo/transf
  t.classe_movimento
FROM fin_transacoes t
LEFT JOIN fin_plano_contas pc ON pc.id = t.plano_contas_id
LEFT JOIN fin_centros_custo cc ON cc.id = t.centro_custo_id
LEFT JOIN fin_culto_slots cs ON cs.id = t.culto_slot_id
LEFT JOIN mem_membros m ON m.id = t.membro_id;

COMMIT;
