const router = require('express').Router();
const { authenticate, authorize } = require('../middleware/auth');
const { supabase } = require('../utils/supabase');
const { notificar } = require('../services/notificar');

// Acesso a salários é confidencial — só admin e diretor
router.use(authenticate, authorize('admin', 'diretor'));

// ──────────────────────────────────────────────────────────────────────
// GRAUS / FAIXAS
// ──────────────────────────────────────────────────────────────────────
router.get('/graus', async (req, res) => {
  const { data, error } = await supabase
    .from('pcs_graus')
    .select('*')
    .order('ordem');
  if (error) return res.status(400).json({ error: error.message });
  res.json(data || []);
});

router.put('/graus/:id', async (req, res) => {
  const { id } = req.params;
  const allowed = ['nivel', 'categoria', 'faixa_min', 'faixa_ref', 'faixa_max', 'variacao_pct', 'amplitude_pct', 'area_atuacao', 'pontos_min', 'pontos_max', 'observacao'];
  const payload = {};
  for (const k of allowed) if (req.body[k] !== undefined) payload[k] = req.body[k];
  const { data, error } = await supabase
    .from('pcs_graus')
    .update(payload)
    .eq('id', id)
    .select()
    .single();
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

// Aplica reajuste % em todas as faixas — opcionalmente nos salários também
router.post('/graus/reajuste-coletivo', async (req, res) => {
  try {
    const { percentual, indice_referencia = 'manual', aplicar_faixas = true, aplicar_salarios = false, ano, observacao } = req.body;
    if (!percentual || isNaN(percentual)) return res.status(400).json({ error: 'percentual obrigatório' });
    const pct = Number(percentual);
    const fator = 1 + (pct / 100);
    const anoFinal = ano || new Date().getFullYear();

    let funcsAfetados = 0;
    let custoTotal = 0;

    // 1. Reajustar faixas
    if (aplicar_faixas) {
      const { data: graus } = await supabase.from('pcs_graus').select('id, faixa_min, faixa_ref, faixa_max');
      if (graus) {
        for (const g of graus) {
          await supabase.from('pcs_graus').update({
            faixa_min: Number((g.faixa_min * fator).toFixed(2)),
            faixa_ref: Number((g.faixa_ref * fator).toFixed(2)),
            faixa_max: Number((g.faixa_max * fator).toFixed(2)),
          }).eq('id', g.id);
        }
      }
    }

    // 2. Reajustar salários dos funcionários ativos
    if (aplicar_salarios) {
      const { data: funcs } = await supabase
        .from('rh_funcionarios')
        .select('id, salario, remuneracao_bruta, grau_id, tipo_contrato')
        .eq('status', 'ativo');

      const { data: reajuste, error: errR } = await supabase
        .from('pcs_reajustes_coletivos')
        .upsert({
          ano: anoFinal,
          percentual: pct,
          indice_referencia,
          aplicar_faixas,
          aplicar_salarios,
          observacao: observacao || null,
          aplicado_por: req.user?.id || null,
        }, { onConflict: 'ano' })
        .select()
        .single();
      if (errR) return res.status(400).json({ error: errR.message });

      for (const f of funcs || []) {
        const isPjMais = f.tipo_contrato === 'PJ+';
        const salarioAtual = isPjMais ? Number(f.remuneracao_bruta || 0) : Number(f.salario || 0);
        if (!salarioAtual) continue;
        const novo = Number((salarioAtual * fator).toFixed(2));
        const delta = novo - salarioAtual;
        custoTotal += delta;
        funcsAfetados++;

        const updPayload = isPjMais
          ? { remuneracao_bruta: novo }
          : { salario: novo };
        await supabase.from('rh_funcionarios').update(updPayload).eq('id', f.id);

        await supabase.from('pcs_progressoes').insert({
          funcionario_id: f.id,
          tipo: 'coletivo',
          salario_anterior: isPjMais ? null : salarioAtual,
          salario_novo: isPjMais ? null : novo,
          remun_bruta_anterior: isPjMais ? salarioAtual : null,
          remun_bruta_nova: isPjMais ? novo : null,
          grau_anterior_id: f.grau_id,
          grau_novo_id: f.grau_id,
          variacao_pct: pct,
          motivo: `Reajuste coletivo ${anoFinal} (${indice_referencia})`,
          aprovado_por: req.user?.id || null,
          aprovado_por_nome: req.user?.name || null,
          reajuste_coletivo_id: reajuste.id,
        });
      }

      await supabase.from('pcs_reajustes_coletivos')
        .update({ total_funcs: funcsAfetados, custo_total: custoTotal })
        .eq('id', reajuste.id);
    }

    res.json({ ok: true, percentual: pct, funcsAfetados, custoTotal: Number(custoTotal.toFixed(2)) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/reajustes-coletivos', async (req, res) => {
  const { data, error } = await supabase
    .from('pcs_reajustes_coletivos')
    .select('*')
    .order('ano', { ascending: false });
  if (error) return res.status(400).json({ error: error.message });
  res.json(data || []);
});

// ──────────────────────────────────────────────────────────────────────
// CRITÉRIOS DE AVALIAÇÃO
// ──────────────────────────────────────────────────────────────────────
router.get('/criterios', async (req, res) => {
  const { data: criterios, error } = await supabase
    .from('pcs_criterios')
    .select('*, niveis:pcs_niveis_criterio(nivel, descricao)')
    .order('ordem');
  if (error) return res.status(400).json({ error: error.message });
  // Ordenar níveis aninhados
  for (const c of criterios || []) c.niveis = (c.niveis || []).sort((a, b) => a.nivel - b.nivel);
  res.json(criterios || []);
});

router.put('/criterios/:id', async (req, res) => {
  const allowed = ['nome', 'descricao', 'peso', 'pontos_min', 'pontos_max', 'ordem'];
  const payload = {};
  for (const k of allowed) if (req.body[k] !== undefined) payload[k] = req.body[k];
  const { data, error } = await supabase.from('pcs_criterios').update(payload).eq('id', req.params.id).select().single();
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

router.put('/niveis-criterio/:id', async (req, res) => {
  const { descricao } = req.body;
  const { data, error } = await supabase.from('pcs_niveis_criterio').update({ descricao }).eq('id', req.params.id).select().single();
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

// ──────────────────────────────────────────────────────────────────────
// BENEFÍCIOS
// ──────────────────────────────────────────────────────────────────────
router.get('/beneficios', async (req, res) => {
  const { data: beneficios, error } = await supabase
    .from('pcs_beneficios')
    .select('*, elegibilidade:pcs_beneficio_grau(grau_id, status)')
    .order('ordem');
  if (error) return res.status(400).json({ error: error.message });
  res.json(beneficios || []);
});

router.put('/beneficios/:id', async (req, res) => {
  const allowed = ['nome', 'valor_referencia', 'vinculos_elegiveis', 'criterio', 'ordem', 'ativo'];
  const payload = {};
  for (const k of allowed) if (req.body[k] !== undefined) payload[k] = req.body[k];
  const { data, error } = await supabase.from('pcs_beneficios').update(payload).eq('id', req.params.id).select().single();
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

router.put('/beneficios/:beneficio_id/grau/:grau_id', async (req, res) => {
  const { status } = req.body;
  if (!['sim', 'condicional', 'nao'].includes(status)) return res.status(400).json({ error: 'status inválido' });
  const { data, error } = await supabase
    .from('pcs_beneficio_grau')
    .upsert({ beneficio_id: req.params.beneficio_id, grau_id: req.params.grau_id, status })
    .select()
    .single();
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

// Benefícios elegíveis para um funcionário específico (deriva de grau + vínculo)
router.get('/funcionarios/:id/beneficios', async (req, res) => {
  const { data: func, error: e1 } = await supabase
    .from('rh_funcionarios')
    .select('id, nome, tipo_contrato, grau_id')
    .eq('id', req.params.id)
    .single();
  if (e1) return res.status(400).json({ error: e1.message });
  if (!func.grau_id) return res.json({ funcionario: func, beneficios: [], aviso: 'Funcionário sem grau enquadrado' });

  const { data: bens } = await supabase
    .from('pcs_beneficios')
    .select('*, elegibilidade:pcs_beneficio_grau!inner(status)')
    .eq('ativo', true)
    .eq('elegibilidade.grau_id', func.grau_id)
    .order('ordem');

  const elegiveis = (bens || []).filter(b => {
    const eg = b.elegibilidade?.[0]?.status;
    const vinculoOk = (b.vinculos_elegiveis || []).includes(func.tipo_contrato);
    return vinculoOk && (eg === 'sim' || eg === 'condicional');
  }).map(b => ({
    id: b.id, codigo: b.codigo, nome: b.nome,
    valor_referencia: b.valor_referencia,
    criterio: b.criterio,
    elegibilidade: b.elegibilidade?.[0]?.status,
  }));

  res.json({ funcionario: func, beneficios: elegiveis });
});

// ──────────────────────────────────────────────────────────────────────
// ADERÊNCIA / COMPA-RATIO
// ──────────────────────────────────────────────────────────────────────
router.get('/aderencia', async (req, res) => {
  const { data, error } = await supabase
    .from('vw_pcs_aderencia')
    .select('*')
    .order('compa_ratio', { ascending: true, nullsFirst: false });
  if (error) return res.status(400).json({ error: error.message });
  res.json(data || []);
});

router.get('/aderencia/resumo', async (req, res) => {
  const { data, error } = await supabase.from('vw_pcs_aderencia').select('*');
  if (error) return res.status(400).json({ error: error.message });

  const lista = data || [];
  const buckets = { adequado: 0, abaixo: 0, acima: 0, sem_enquadramento: 0, sem_salario: 0 };
  let custoEnquadramento = 0;
  const porArea = {};

  for (const f of lista) {
    buckets[f.aderencia] = (buckets[f.aderencia] || 0) + 1;
    custoEnquadramento += Number(f.delta_correcao || 0);
    const ar = f.area || 'Sem área';
    porArea[ar] = porArea[ar] || { total: 0, adequado: 0, abaixo: 0, acima: 0, sem_enquadramento: 0, sem_salario: 0, delta: 0 };
    porArea[ar].total++;
    porArea[ar][f.aderencia] = (porArea[ar][f.aderencia] || 0) + 1;
    porArea[ar].delta += Number(f.delta_correcao || 0);
  }

  res.json({
    totalFuncs: lista.length,
    buckets,
    custoEnquadramentoMensal: Number(custoEnquadramento.toFixed(2)),
    custoEnquadramentoAnual: Number((custoEnquadramento * 13).toFixed(2)), // 12 + 13º
    porArea,
  });
});

router.get('/aderencia/plano-acao', async (req, res) => {
  const { data, error } = await supabase
    .from('vw_pcs_aderencia')
    .select('*')
    .eq('aderencia', 'abaixo')
    .order('compa_ratio', { ascending: true });
  if (error) return res.status(400).json({ error: error.message });

  const total = (data || []).reduce((acc, f) => acc + Number(f.delta_correcao || 0), 0);
  res.json({
    itens: data || [],
    totalMensal: Number(total.toFixed(2)),
    totalAnual: Number((total * 13).toFixed(2)),
  });
});

// Aplicar enquadramento em todos os abaixo do mínimo (de uma vez)
router.post('/aderencia/aplicar-enquadramento', async (req, res) => {
  const { motivo = 'Enquadramento ao mínimo da faixa (PCS 2026)' } = req.body || {};
  const { data: lista, error } = await supabase
    .from('vw_pcs_aderencia')
    .select('*')
    .eq('aderencia', 'abaixo');
  if (error) return res.status(400).json({ error: error.message });

  let aplicados = 0;
  let custoTotal = 0;

  for (const f of lista || []) {
    if (!f.salario_sugerido) continue;
    const isPjMais = f.tipo_contrato === 'PJ+';
    const remuneracaoAtual = Number(f.remuneracao_efetiva || 0);
    const novo = Number(f.salario_sugerido);
    if (novo <= remuneracaoAtual) continue;

    const updPayload = isPjMais
      ? { remuneracao_bruta: novo }
      : { salario: novo };
    const { error: errU } = await supabase.from('rh_funcionarios').update(updPayload).eq('id', f.funcionario_id);
    if (errU) continue;

    await supabase.from('pcs_progressoes').insert({
      funcionario_id: f.funcionario_id,
      tipo: 'enquadramento',
      salario_anterior: isPjMais ? null : remuneracaoAtual,
      salario_novo: isPjMais ? null : novo,
      remun_bruta_anterior: isPjMais ? remuneracaoAtual : null,
      remun_bruta_nova: isPjMais ? novo : null,
      grau_anterior_id: f.grau_id,
      grau_novo_id: f.grau_id,
      variacao_pct: remuneracaoAtual > 0 ? Number(((novo - remuneracaoAtual) / remuneracaoAtual * 100).toFixed(3)) : null,
      motivo,
      aprovado_por: req.user?.id || null,
      aprovado_por_nome: req.user?.name || null,
    });

    aplicados++;
    custoTotal += (novo - remuneracaoAtual);

    try {
      await notificar({
        tipo: 'rh_enquadramento',
        modulo: 'rh',
        titulo: 'Enquadramento PCS aplicado',
        mensagem: `${f.nome} foi enquadrado em ${f.grau_codigo} (${f.grau_nivel}). Remuneração: ${remuneracaoAtual.toFixed(2)} → ${novo.toFixed(2)}.`,
        modulo_origem: 'rh',
      });
    } catch {}
  }

  res.json({ ok: true, aplicados, custoMensal: Number(custoTotal.toFixed(2)) });
});

// ──────────────────────────────────────────────────────────────────────
// PROGRESSÕES (histórico + criar individual)
// ──────────────────────────────────────────────────────────────────────
router.get('/progressoes', async (req, res) => {
  const { funcionario_id, tipo, limit = 200 } = req.query;
  let q = supabase
    .from('pcs_progressoes')
    .select('*, funcionario:rh_funcionarios(id, nome, cargo, area), grau_anterior:grau_anterior_id(codigo, nivel), grau_novo:grau_novo_id(codigo, nivel)')
    .order('data_efetivacao', { ascending: false })
    .limit(Number(limit));
  if (funcionario_id) q = q.eq('funcionario_id', funcionario_id);
  if (tipo) q = q.eq('tipo', tipo);
  const { data, error } = await q;
  if (error) return res.status(400).json({ error: error.message });
  res.json(data || []);
});

router.post('/progressoes', async (req, res) => {
  const { funcionario_id, tipo, novo_salario, novo_grau_id, motivo, observacao, data_efetivacao } = req.body;
  if (!funcionario_id || !tipo) return res.status(400).json({ error: 'funcionario_id e tipo obrigatórios' });
  if (!['merito', 'promocao', 'enquadramento', 'admissao', 'outro'].includes(tipo))
    return res.status(400).json({ error: 'tipo inválido' });

  // Estado atual
  const { data: func, error: eF } = await supabase
    .from('rh_funcionarios')
    .select('id, nome, salario, remuneracao_bruta, grau_id, tipo_contrato')
    .eq('id', funcionario_id)
    .single();
  if (eF) return res.status(400).json({ error: eF.message });

  const isPjMais = func.tipo_contrato === 'PJ+';
  const remuneracaoAtual = isPjMais ? Number(func.remuneracao_bruta || 0) : Number(func.salario || 0);
  const novoValor = novo_salario !== undefined && novo_salario !== null ? Number(novo_salario) : remuneracaoAtual;

  // Aplica mudanças
  const updPayload = {};
  if (novo_salario !== undefined && novo_salario !== null) {
    if (isPjMais) updPayload.remuneracao_bruta = novoValor;
    else updPayload.salario = novoValor;
  }
  if (novo_grau_id) {
    updPayload.grau_id = novo_grau_id;
    updPayload.data_enquadramento = new Date().toISOString().slice(0, 10);
  }
  if (Object.keys(updPayload).length) {
    const { error: errU } = await supabase.from('rh_funcionarios').update(updPayload).eq('id', funcionario_id);
    if (errU) return res.status(400).json({ error: errU.message });
  }

  // Log
  const { data: prog, error: eP } = await supabase.from('pcs_progressoes').insert({
    funcionario_id,
    tipo,
    salario_anterior: isPjMais ? null : remuneracaoAtual,
    salario_novo: isPjMais ? null : (novo_salario !== undefined && novo_salario !== null ? novoValor : null),
    remun_bruta_anterior: isPjMais ? remuneracaoAtual : null,
    remun_bruta_nova: isPjMais ? (novo_salario !== undefined && novo_salario !== null ? novoValor : null) : null,
    grau_anterior_id: func.grau_id,
    grau_novo_id: novo_grau_id || func.grau_id,
    variacao_pct: (remuneracaoAtual > 0 && novo_salario)
      ? Number(((novoValor - remuneracaoAtual) / remuneracaoAtual * 100).toFixed(3))
      : null,
    motivo: motivo || null,
    observacao: observacao || null,
    aprovado_por: req.user?.id || null,
    aprovado_por_nome: req.user?.name || null,
    data_efetivacao: data_efetivacao || new Date().toISOString().slice(0, 10),
  }).select().single();
  if (eP) return res.status(400).json({ error: eP.message });

  res.json(prog);
});

// ──────────────────────────────────────────────────────────────────────
// ELEGIBILIDADE A MÉRITO / PROMOÇÃO
//   Mérito: ≥12 meses na organização + última avaliação ≥ 3,5/5
//   Promoção: ≥18 meses no grau atual + última avaliação ≥ 4,0/5
// ──────────────────────────────────────────────────────────────────────
router.get('/elegibilidade', async (req, res) => {
  try {
    const { data: funcs } = await supabase
      .from('rh_funcionarios')
      .select('id, nome, cargo, area, salario, remuneracao_bruta, tipo_contrato, grau_id, data_admissao, data_enquadramento, status')
      .eq('status', 'ativo');

    const { data: graus } = await supabase.from('pcs_graus').select('*').order('ordem');

    const { data: avals } = await supabase
      .from('rh_avaliacoes')
      .select('funcionario_id, pontuacao_final, status, ciclo_ano')
      .in('status', ['concluida', 'calibrada'])
      .order('ciclo_ano', { ascending: false });

    const ultimaPorFunc = {};
    for (const a of avals || []) {
      if (!ultimaPorFunc[a.funcionario_id]) ultimaPorFunc[a.funcionario_id] = a;
    }

    const hoje = new Date();
    const mesesEntre = (d1, d2) => {
      if (!d1) return 0;
      const a = new Date(d1);
      return (d2.getFullYear() - a.getFullYear()) * 12 + (d2.getMonth() - a.getMonth());
    };

    const mes = m => Number(m || 0).toFixed(2);

    const result = (funcs || []).map(f => {
      const grau = graus.find(g => g.id === f.grau_id);
      const grauProximo = grau ? graus.find(g => g.ordem === grau.ordem + 1) : null;
      const isPjMais = f.tipo_contrato === 'PJ+';
      const salAtual = isPjMais ? Number(f.remuneracao_bruta || 0) : Number(f.salario || 0);

      const mesesEmpresa = mesesEntre(f.data_admissao, hoje);
      const mesesGrau = mesesEntre(f.data_enquadramento || f.data_admissao, hoje);
      const ultAval = ultimaPorFunc[f.id];
      const nota = ultAval ? Number(ultAval.pontuacao_final || 0) : null;

      const elegMerito = mesesEmpresa >= 12 && nota !== null && nota >= 3.5;
      const elegPromocao = mesesGrau >= 18 && nota !== null && nota >= 4.0 && grauProximo;

      return {
        funcionario_id: f.id,
        nome: f.nome,
        cargo: f.cargo,
        area: f.area,
        grau: grau ? { id: grau.id, codigo: grau.codigo, nivel: grau.nivel } : null,
        grau_proximo: grauProximo ? { id: grauProximo.id, codigo: grauProximo.codigo, nivel: grauProximo.nivel, faixa_min: grauProximo.faixa_min } : null,
        salario_atual: salAtual,
        meses_empresa: mesesEmpresa,
        meses_grau: mesesGrau,
        ultima_nota: nota,
        elegivel_merito: elegMerito,
        sugestao_merito_min: elegMerito ? Number((salAtual * 1.02).toFixed(2)) : null,
        sugestao_merito_max: elegMerito ? Number((salAtual * 1.05).toFixed(2)) : null,
        elegivel_promocao: elegPromocao,
        sugestao_promocao: elegPromocao && grauProximo ? Math.max(Number(grauProximo.faixa_min), salAtual) : null,
      };
    });

    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});


// ──────────────────────────────────────────────────────────────────────
// PONTUAÇÃO → GRAU (utilitário pra preview)
// ──────────────────────────────────────────────────────────────────────
router.get('/sugerir-grau/:pontos', async (req, res) => {
  const pontos = Number(req.params.pontos);
  if (isNaN(pontos)) return res.status(400).json({ error: 'pontos inválido' });
  const { data, error } = await supabase
    .from('pcs_graus')
    .select('*')
    .lte('pontos_min', pontos)
    .gte('pontos_max', pontos)
    .order('ordem')
    .limit(1)
    .maybeSingle();
  if (error) return res.status(400).json({ error: error.message });
  res.json(data || null);
});


module.exports = router;
