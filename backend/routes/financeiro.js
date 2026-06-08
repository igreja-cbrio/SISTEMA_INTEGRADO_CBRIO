const router = require('express').Router();
const multer = require('multer');
const XLSX = require('xlsx');
const { authenticate, authorizeModule, getEffectiveLevel } = require('../middleware/auth');
const { supabase } = require('../utils/supabase');

const { isAuthorizedCron } = require('../utils/cronAuth');

// ── Cron · alertas (definido ANTES de router.use(authenticate)) ──
router.get('/alertas/cron-gerar', async (req, res) => {
  if (!isAuthorizedCron(req)) {
    return res.status(401).json({ erro: 'Nao autorizado' });
  }
  try {
    const { data, error } = await supabase.rpc('gerar_alertas_financeiros');
    if (error) throw error;
    const total = (data || []).reduce((s, r) => s + Number(r.qtd_criados || 0), 0);
    res.json({ ok: true, total_criados: total, por_tipo: data || [] });
  } catch (e) { res.status(500).json({ ok: false, erro: e.message }); }
});

router.use(authenticate, authorizeModule('financeiro'));

const dreUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024, files: 20 },
});

// ── DASHBOARD ──────────────────────────────────────────────
router.get('/dashboard', async (req, res) => {
  try {
    const [contas, transacoes, pagar, reembolsos] = await Promise.all([
      supabase.from('fin_contas').select('id, nome, tipo, saldo, ativa'),
      supabase.from('fin_transacoes').select('tipo, valor, status, data_competencia').neq('status', 'cancelado'),
      supabase.from('fin_contas_pagar').select('id, valor, status, data_vencimento'),
      supabase.from('fin_reembolsos').select('id, valor, status'),
    ]);

    const saldoTotal = (contas.data || []).filter(c => c.ativa).reduce((s, c) => s + Number(c.saldo), 0);
    const hoje = new Date().toISOString().slice(0, 10);

    const trans = transacoes.data || [];
    const mesAtual = new Date().toISOString().slice(0, 7);
    const transMes = trans.filter(t => t.data_competencia?.startsWith(mesAtual));
    const receitasMes = transMes.filter(t => t.tipo === 'receita').reduce((s, t) => s + Number(t.valor), 0);
    const despesasMes = transMes.filter(t => t.tipo === 'despesa').reduce((s, t) => s + Number(t.valor), 0);

    const pg = pagar.data || [];
    const vencidas = pg.filter(p => p.status === 'pendente' && p.data_vencimento < hoje);
    const pendentes = pg.filter(p => p.status === 'pendente');

    const reemb = reembolsos.data || [];
    const reembPendentes = reemb.filter(r => r.status === 'pendente');

    res.json({
      saldoTotal,
      contasAtivas: (contas.data || []).filter(c => c.ativa).length,
      receitasMes, despesasMes,
      contasPagarPendentes: pendentes.length,
      contasPagarVencidas: vencidas.length,
      valorPagarPendente: pendentes.reduce((s, p) => s + Number(p.valor), 0),
      reembolsosPendentes: reembPendentes.length,
      valorReembolsosPendentes: reembPendentes.reduce((s, r) => s + Number(r.valor), 0),
    });
  } catch (e) {
    console.error('[FIN] Dashboard:', e.message);
    res.status(500).json({ error: 'Erro ao carregar dashboard financeiro' });
  }
});

// ── CONTAS ─────────────────────────────────────────────────
router.get('/contas', async (req, res) => {
  try {
    const { data, error } = await supabase.from('fin_contas').select('*').order('nome');
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao listar contas' }); }
});

router.post('/contas', async (req, res) => {
  try {
    const { nome, banco, agencia, conta, tipo } = req.body;
    if (!nome) return res.status(400).json({ error: 'Nome é obrigatório' });
    const { data, error } = await supabase.from('fin_contas')
      .insert({ nome, banco: banco || null, agencia: agencia || null, conta: conta || null, tipo: tipo || 'corrente' })
      .select().single();
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao criar conta' }); }
});

router.put('/contas/:id', async (req, res) => {
  try {
    const { nome, banco, agencia, conta, tipo, saldo, ativa } = req.body;
    const { data, error } = await supabase.from('fin_contas')
      .update({ nome, banco, agencia, conta, tipo, saldo, ativa })
      .eq('id', req.params.id).select().single();
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao atualizar conta' }); }
});

router.delete('/contas/:id', async (req, res) => {
  try {
    const { error } = await supabase.from('fin_contas').delete().eq('id', req.params.id);
    if (error) return res.status(400).json({ error: error.message });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: 'Erro ao remover conta' }); }
});

// ── CATEGORIAS ─────────────────────────────────────────────
router.get('/categorias', async (req, res) => {
  try {
    const { data, error } = await supabase.from('fin_categorias').select('*').order('tipo').order('nome');
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao listar categorias' }); }
});

router.post('/categorias', async (req, res) => {
  try {
    const { nome, tipo, icone, pai_id } = req.body;
    if (!nome || !tipo) return res.status(400).json({ error: 'Nome e tipo são obrigatórios' });
    const { data, error } = await supabase.from('fin_categorias')
      .insert({ nome, tipo, icone: icone || null, pai_id: pai_id || null })
      .select().single();
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao criar categoria' }); }
});

router.delete('/categorias/:id', async (req, res) => {
  try {
    const { error } = await supabase.from('fin_categorias').delete().eq('id', req.params.id);
    if (error) return res.status(400).json({ error: error.message });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: 'Erro ao remover categoria' }); }
});

// ── TRANSAÇÕES ─────────────────────────────────────────────
router.get('/transacoes', async (req, res) => {
  try {
    const { conta_id, tipo, status, mes, inicio, fim, busca, limit = 1000 } = req.query;
    let query = supabase.from('fin_transacoes')
      .select('*, fin_contas(nome), fin_categorias(nome, tipo)')
      .order('data_competencia', { ascending: false })
      .limit(Math.min(Number(limit), 50000));
    if (conta_id) query = query.eq('conta_id', conta_id);
    if (tipo) query = query.eq('tipo', tipo);
    if (status) query = query.eq('status', status);
    if (mes) {
      const [y, m] = mes.split('-');
      const lastDay = new Date(Number(y), Number(m), 0).getDate();
      query = query.gte('data_competencia', `${mes}-01`).lte('data_competencia', `${mes}-${String(lastDay).padStart(2, '0')}`);
    }
    if (inicio) query = query.gte('data_competencia', inicio);
    if (fim) query = query.lte('data_competencia', fim);
    if (busca) query = query.ilike('descricao', `%${busca}%`);
    const { data, error } = await query;
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao listar transações' }); }
});

router.post('/transacoes', async (req, res) => {
  try {
    const { conta_id, categoria_id, tipo, descricao, valor, data_competencia, data_pagamento, referencia, observacoes } = req.body;
    if (!conta_id || !tipo || !descricao || !valor || !data_competencia) {
      return res.status(400).json({ error: 'Campos obrigatórios: conta, tipo, descrição, valor, data' });
    }
    const { data, error } = await supabase.from('fin_transacoes')
      .insert({ conta_id, categoria_id: categoria_id || null, tipo, descricao, valor, data_competencia, data_pagamento: data_pagamento || null, referencia: referencia || null, observacoes: observacoes || null, created_by: req.user.userId })
      .select().single();
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao criar transação' }); }
});

router.put('/transacoes/:id', async (req, res) => {
  try {
    const { conta_id, categoria_id, tipo, descricao, valor, data_competencia, data_pagamento, status, referencia, observacoes } = req.body;
    const { data, error } = await supabase.from('fin_transacoes')
      .update({ conta_id, categoria_id, tipo, descricao, valor, data_competencia, data_pagamento, status, referencia, observacoes })
      .eq('id', req.params.id).select().single();
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao atualizar transação' }); }
});

router.delete('/transacoes/:id', async (req, res) => {
  try {
    const { error } = await supabase.from('fin_transacoes').delete().eq('id', req.params.id);
    if (error) return res.status(400).json({ error: error.message });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: 'Erro ao remover transação' }); }
});

// ── CONTAS A PAGAR ─────────────────────────────────────────
router.get('/contas-pagar', async (req, res) => {
  try {
    const { status } = req.query;
    let query = supabase.from('fin_contas_pagar').select('*, fin_contas(nome), fin_categorias(nome)').order('data_vencimento');
    if (status) query = query.eq('status', status);
    const { data, error } = await query;
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao listar contas a pagar' }); }
});

router.post('/contas-pagar', async (req, res) => {
  try {
    const { descricao, fornecedor, categoria_id, valor, data_vencimento, conta_id } = req.body;
    if (!descricao || !valor || !data_vencimento) return res.status(400).json({ error: 'Descrição, valor e vencimento são obrigatórios' });
    const { data, error } = await supabase.from('fin_contas_pagar')
      .insert({ descricao, fornecedor: fornecedor || null, categoria_id: categoria_id || null, valor, data_vencimento, conta_id: conta_id || null, created_by: req.user.userId })
      .select().single();
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao criar conta a pagar' }); }
});

router.put('/contas-pagar/:id', async (req, res) => {
  try {
    const { descricao, fornecedor, categoria_id, valor, data_vencimento, data_pagamento, conta_id, status } = req.body;
    const { data, error } = await supabase.from('fin_contas_pagar')
      .update({ descricao, fornecedor, categoria_id, valor, data_vencimento, data_pagamento, conta_id, status })
      .eq('id', req.params.id).select().single();
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao atualizar conta a pagar' }); }
});

router.delete('/contas-pagar/:id', async (req, res) => {
  try {
    const { error } = await supabase.from('fin_contas_pagar').delete().eq('id', req.params.id);
    if (error) return res.status(400).json({ error: error.message });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: 'Erro ao remover conta a pagar' }); }
});

// ── REEMBOLSOS ─────────────────────────────────────────────
router.get('/reembolsos', async (req, res) => {
  try {
    const { status } = req.query;
    let query = supabase.from('fin_reembolsos').select('*, profiles!solicitante_id(name)').order('created_at', { ascending: false });
    if (status) query = query.eq('status', status);
    const { data, error } = await query;
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao listar reembolsos' }); }
});

router.post('/reembolsos', async (req, res) => {
  try {
    const { descricao, valor, data_despesa, categoria_id, observacoes } = req.body;
    if (!descricao || !valor || !data_despesa) return res.status(400).json({ error: 'Descrição, valor e data são obrigatórios' });
    const { data, error } = await supabase.from('fin_reembolsos')
      .insert({ solicitante_id: req.user.userId, descricao, valor, data_despesa, categoria_id: categoria_id || null, observacoes: observacoes || null })
      .select().single();
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao criar reembolso' }); }
});

router.patch('/reembolsos/:id', async (req, res) => {
  try {
    const { status } = req.body;
    if (!['aprovado', 'rejeitado', 'pago'].includes(status)) return res.status(400).json({ error: 'Status inválido' });
    // Aprovar/pagar reembolso e decisao de gasto · exige nivel alto (>=4) ou
    // admin/diretor. Nivel 2 (lancamento de numeros) NAO libera dinheiro.
    if (!['admin', 'diretor'].includes(req.user.role) && getEffectiveLevel(req, 'financeiro') < 4) {
      return res.status(403).json({ error: 'Sem permissão para aprovar/pagar reembolsos' });
    }
    const { data, error } = await supabase.from('fin_reembolsos')
      .update({ status, aprovado_por: req.user.userId })
      .eq('id', req.params.id).select().single();
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao atualizar reembolso' }); }
});

// ── DRE (Demonstrativo de Resultados) ─────────────────────
// Consolida arquivos Balanço Ano YYYY.xlsx em uma DRE hierárquica.
// Lógica espelha o PROMPT_DRE_Claude.md:
//   1. dedup por Código (mesmo lançamento pode aparecer 2x)
//   2. ignora linhas sem Data
//   3. extrai Cod_Pleno de "Cód/Nome do Plano de Contas" (antes do " - ")
//   4. mantém apenas Cod_Pleno começando com "3" (receita) ou "4" (despesa)
//   5. exclui movimentações gerenciais (contas bancárias + IRRF)
//   6. agrega por (cod_pleno, ano, mês)
//   7. emite estrutura hierárquica + lista de valores + totais
const DRE_EXCLUSOES_PLANO = new Set([
  'CAIXA - Ag 4749 C/C 009-2',
  'Caixa GERAL',
  'CAIXINHA',
  'ITAU - Ag 3200 C/C 01111-6',
  'POUPANÇA CAIXA - Ag 4749 C/C 2146-1',
  'SANTANDER - Ag 3957 C/C 13000422-2',
  'STONE',
  'XP Corrente',
  'Ir Retido Na Fonte',
  'Ir Retido Na Fonte Sobre Prebenda',
]);

// Tenta extrair (ano, mês) de um valor de célula. Aceita:
// - Date nativo (xlsx com cellDates:true)
// - número serial (xlsx com cellDates:false) → converte
// - string "DD/MM/YYYY" ou "YYYY-MM-DD"
function dreParseData(v) {
  if (v == null || v === '') return null;
  if (v instanceof Date && !isNaN(v)) return { ano: v.getUTCFullYear(), mes: v.getUTCMonth() + 1 };
  if (typeof v === 'number') {
    const d = XLSX.SSF.parse_date_code(v);
    if (d && d.y) return { ano: d.y, mes: d.m };
    return null;
  }
  if (typeof v === 'string') {
    const s = v.trim();
    let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return { ano: +m[1], mes: +m[2] };
    m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (m) return { ano: +m[3], mes: +m[2] };
  }
  return null;
}

function dreNum(v) {
  if (v == null || v === '') return 0;
  if (typeof v === 'number') return v;
  if (typeof v === 'string') {
    const cleaned = v.replace(/\./g, '').replace(',', '.').replace(/[^\d\-.]/g, '');
    const n = Number(cleaned);
    return isNaN(n) ? 0 : n;
  }
  return 0;
}

// Catálogo de descrições dos níveis pais (1 e 2) que normalmente não aparecem
// nas linhas — só os filhos (3.01.01.04 etc). Mantém a hierarquia legível
// no front mesmo quando o arquivo só lista folhas.
const DRE_PAIS_DESC = {
  '3': 'RECEITAS',
  '3.01': 'RECEITAS ORDINARIAS',
  '3.01.01': 'DIZIMOS',
  '3.01.02': 'OFERTAS',
  '3.02': 'RECEITAS EXTRAORDINARIAS',
  '3.02.01': 'CAMPANHAS',
  '3.02.02': 'EVENTOS',
  '3.02.03': 'OUTRAS OFERTAS',
  '3.02.04': 'RECEITAS PATRIMONIAIS',
  '3.02.05': 'OUTRAS RECEITAS',
  '3.02.06': 'RECEITAS FINANCEIRAS',
  '4': 'DESPESAS',
  '4.01': 'RECURSOS HUMANOS',
  '4.01.01': 'ADMINISTRACAO GESTAO',
  '4.01.02': 'EQUIPE PASTORAL',
  '4.01.03': 'EQUIPE TECNICA',
  '4.01.04': 'BENEFICIOS',
  '4.02': 'DESPESAS PREDIAIS',
  '4.03': 'SERVICOS TERCEIRIZADOS',
  '4.04': 'REPASSE AS MISSÕES',
  '4.05': 'ACAO SOCIAL',
  '4.06': 'MATERIAIS DE CONSUMO',
  '4.07': 'VIAGENS E DESLOCAMENTOS',
  '4.08': 'DESPESAS COM VEÍCULOS',
  '4.09': 'DESPESAS PATRIMONIAIS',
  '4.10': 'ORGANIZAÇÃO DE EVENTOS',
  '4.11': 'MARKETING E PUBLICIDADE',
  '4.12': 'OUTRAS DESPESAS',
  '4.13': 'IMPOSTOS, TAXAS E TRIBUTOS',
  '4.14': 'DESPESAS FINANCEIRAS',
  '4.15': 'EMPRESTIMOS',
};

router.post('/dre/processar', dreUpload.array('arquivos', 20), async (req, res) => {
  try {
    const files = req.files || [];
    if (!files.length) return res.status(400).json({ error: 'Nenhum arquivo enviado' });

    const valores = new Map();          // chave "cod|ano|mês" → soma
    const contas = new Map();           // cod → descrição (da folha)
    const seenCodigos = new Set();      // dedup por Código
    let totalLinhas = 0;
    let totalDedup = 0;
    let totalValidas = 0;
    let totalExcluidas = 0;

    for (const file of files) {
      const wb = XLSX.read(file.buffer, { type: 'buffer', cellDates: true });
      const sheetName = wb.SheetNames[0];
      const ws = wb.Sheets[sheetName];
      if (!ws) continue;
      const rows = XLSX.utils.sheet_to_json(ws, { defval: null, raw: true });
      for (const r of rows) {
        totalLinhas++;
        const codigo = r['Código'] ?? r['Codigo'] ?? r['codigo'];
        if (codigo == null || codigo === '') continue;
        if (seenCodigos.has(codigo)) { totalDedup++; continue; }
        seenCodigos.add(codigo);

        const data = dreParseData(r['Data'] ?? r['data']);
        if (!data) continue;

        const valor = dreNum(r['Valor(R$)'] ?? r['Valor (R$)'] ?? r['Valor'] ?? r['valor']);
        const plano = (r['Plano de Contas'] ?? r['plano de contas'] ?? '').toString();
        const codNome = (r['Cód/Nome do Plano de Contas'] ?? r['Cod/Nome do Plano de Contas'] ?? r['Código/Nome do Plano de Contas'] ?? '').toString();

        if (!codNome.includes(' - ')) continue;
        const [codPlenoRaw, descRaw] = codNome.split(' - ', 2);
        const codPleno = codPlenoRaw.trim();
        const desc = (descRaw || '').trim();

        if (!(codPleno.startsWith('3') || codPleno.startsWith('4'))) { totalExcluidas++; continue; }
        if (DRE_EXCLUSOES_PLANO.has(plano.trim())) { totalExcluidas++; continue; }

        totalValidas++;
        const key = `${codPleno}|${data.ano}|${data.mes}`;
        valores.set(key, (valores.get(key) || 0) + valor);
        if (!contas.has(codPleno)) contas.set(codPleno, desc);
      }
    }

    // Estrutura hierárquica: gera as folhas que apareceram + os pais
    // intermediários (mesmo que não tenham aparecido no arquivo) para o
    // front conseguir renderizar a árvore corretamente.
    const todasContas = new Map(contas);
    for (const cod of contas.keys()) {
      const partes = cod.split('.');
      for (let i = 1; i < partes.length; i++) {
        const pai = partes.slice(0, i).join('.');
        if (!todasContas.has(pai)) {
          todasContas.set(pai, DRE_PAIS_DESC[pai] || pai);
        }
      }
    }

    const estrutura = [...todasContas.entries()]
      .sort(([a], [b]) => a.localeCompare(b, 'en', { numeric: true }))
      .map(([cod, desc]) => ({
        cod,
        desc,
        level: cod.split('.').length,
        tipo: cod.startsWith('3') ? 'receita' : 'despesa',
      }));

    estrutura.push(
      { cod: 'TOTAL_REC',  desc: 'TOTAL RECEITAS',     level: 0, tipo: 'total' },
      { cod: 'TOTAL_DESP', desc: 'TOTAL DESPESAS',     level: 0, tipo: 'total' },
      { cod: 'RESULTADO',  desc: 'RESULTADO DO PERÍODO', level: 0, tipo: 'total' },
    );

    const valoresLista = [];
    for (const [key, v] of valores) {
      const [cod, ano, mes] = key.split('|');
      valoresLista.push([cod, Number(ano), Number(mes), Math.round(v * 100) / 100]);
    }

    res.json({
      estrutura,
      valores: valoresLista,
      stats: {
        arquivos: files.length,
        linhas: totalLinhas,
        duplicadas: totalDedup,
        validas: totalValidas,
        excluidas: totalExcluidas,
        contas_unicas: contas.size,
      },
    });
  } catch (e) {
    console.error('[FIN] DRE processar:', e);
    res.status(500).json({ error: e.message || 'Erro ao processar arquivos DRE' });
  }
});

// ══════════════════════════════════════════════════════════════════════════
// DESPESAS RECORRENTES + PROJECAO DE CAIXA
// ══════════════════════════════════════════════════════════════════════════

router.get('/recorrentes', async (req, res) => {
  try {
    const { ativa, confirmada } = req.query;
    let q = supabase.from('fin_despesas_recorrentes').select('*').order('descricao');
    if (ativa !== undefined) q = q.eq('ativa', ativa === 'true');
    if (confirmada !== undefined) q = q.eq('confirmada', confirmada === 'true');
    const { data, error } = await q;
    if (error) throw error;
    res.json(data || []);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/recorrentes', async (req, res) => {
  try {
    const {
      descricao, fornecedor, valor_medio, cadencia_dias, dia_vencimento,
      plano_contas_id, conta_id, classe, pix_chave, observacao,
      gera_n_dias_antes, proxima_estimada,
    } = req.body || {};
    if (!descricao || !valor_medio) {
      return res.status(400).json({ error: 'descrição e valor_medio são obrigatórios' });
    }
    const valor = Number(valor_medio);
    const { data, error } = await supabase.from('fin_despesas_recorrentes').insert({
      descricao,
      fornecedor: fornecedor || null,
      chave_match: (fornecedor || descricao).toLowerCase().trim(),
      tipo_chave: 'manual',
      valor_medio: valor,
      valor_minimo: valor,
      valor_maximo: valor,
      cadencia_dias: cadencia_dias ? Number(cadencia_dias) : 30,
      dia_vencimento: dia_vencimento ? Number(dia_vencimento) : null,
      plano_contas_id: plano_contas_id || null,
      conta_id: conta_id || null,
      classe: classe || 'fixa',
      pix_chave: pix_chave || null,
      observacao: observacao || null,
      gera_n_dias_antes: gera_n_dias_antes ? Number(gera_n_dias_antes) : 7,
      proxima_estimada: proxima_estimada || null,
      ativa: true, confirmada: true, confianca: 1.0,
    }).select('*').single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.patch('/recorrentes/:id', async (req, res) => {
  try {
    const patch = { ...req.body };
    delete patch.id; delete patch.created_at;
    patch.updated_at = new Date().toISOString();
    const { data, error } = await supabase
      .from('fin_despesas_recorrentes').update(patch).eq('id', req.params.id).select('*').single();
    if (error) throw error;
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/recorrentes/:id', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('fin_despesas_recorrentes').update({ ativa: false }).eq('id', req.params.id).select('*').single();
    if (error) throw error;
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/recorrentes/gerar-contas-pagar', async (req, res) => {
  try {
    const { data, error } = await supabase.rpc('gerar_contas_pagar_recorrentes', {
      p_user_id: req.user.userId,
    });
    if (error) throw error;
    res.json({
      total: (data || []).length,
      criadas: (data || []).filter(r => r.acao === 'criado').length,
      ja_existiam: (data || []).filter(r => r.acao === 'ja_existe').length,
      detalhes: data || [],
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/projecao-caixa', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('vw_projecao_caixa_mensal').select('*').order('mes_inicio');
    if (error) throw error;
    res.json(data || []);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ══════════════════════════════════════════════════════════════════════════
// DASHBOARD DE GENEROSIDADE
// ══════════════════════════════════════════════════════════════════════════

router.get('/generosidade/overview', async (req, res) => {
  try {
    const { data: mensal, error } = await supabase
      .from('vw_doacoes_mensal').select('*').order('mes');
    if (error) throw error;

    const arr = mensal || [];
    const mesAtual = arr[arr.length - 1] || {};
    const mesAnterior = arr[arr.length - 2] || {};
    const totalAtual = Number(mesAtual.total || 0);
    const totalAnterior = Number(mesAnterior.total || 0);
    const variacaoPct = totalAnterior > 0 ? ((totalAtual - totalAnterior) / totalAnterior) * 100 : null;
    const dizimoMedio = mesAtual.qtd_doadores_unicos > 0
      ? Number(mesAtual.dizimo || 0) / Number(mesAtual.qtd_doadores_unicos)
      : 0;

    // % membros doando · doadores únicos com membro_id / total membros ativos
    const { count: membrosAtivos } = await supabase
      .from('mem_membros')
      .select('id', { count: 'exact', head: true })
      .is('deleted_at', null)
      .eq('status', 'membro_ativo');

    const desdeMes = new Date();
    desdeMes.setDate(1);
    const { data: doadoresMes } = await supabase
      .from('vw_doacoes_unificada')
      .select('membro_id', { count: 'exact' })
      .not('membro_id', 'is', null)
      .gte('data', desdeMes.toISOString().slice(0, 10));
    const doadoresUnicos = new Set((doadoresMes || []).map(r => r.membro_id)).size;
    const pctMembrosDoando = membrosAtivos > 0 ? (doadoresUnicos / membrosAtivos) * 100 : 0;

    res.json({
      mensal: arr,
      mes_atual: {
        total: totalAtual,
        dizimo: Number(mesAtual.dizimo || 0),
        oferta: Number(mesAtual.oferta || 0),
        outras: Number(mesAtual.outras || 0),
        qtd_doacoes: Number(mesAtual.qtd_doacoes || 0),
        qtd_doadores_unicos: Number(mesAtual.qtd_doadores_unicos || 0),
      },
      variacao_pct: variacaoPct,
      dizimo_medio: dizimoMedio,
      membros_ativos: membrosAtivos || 0,
      doadores_unicos_mes: doadoresUnicos,
      pct_membros_doando: pctMembrosDoando,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/generosidade/anonimos', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('vw_doadores_anonimos_top').select('*');
    if (error) throw error;
    res.json(data || []);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/generosidade/pararam', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('vw_doadores_pararam').select('*');
    if (error) throw error;
    res.json(data || []);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ══════════════════════════════════════════════════════════════════════════
// CONCILIACAO INTELIGENTE · fila + stats + bulk approve + reclassificar
// ══════════════════════════════════════════════════════════════════════════

router.get('/fila-classificacao/stats', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('vw_classificacao_stats').select('*').single();
    if (error) throw error;
    const total = Number(data?.total_ult30 || 0);
    const auto = Number(data?.classificadas_auto_ult30 || 0);
    res.json({
      ...data,
      pct_automatico: total > 0 ? (auto / total) * 100 : 0,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/fila-classificacao/items', async (req, res) => {
  try {
    const { confianca_min, origem, limit = 100 } = req.query;
    let q = supabase
      .from('fin_fila_classificacao')
      .select(`
        id, status, sugestao_confianca, sugestao_origem, sugestao_explicacao,
        sugestao_plano_contas_id, sugestao_centro_custo_id, sugestao_membro_id,
        created_at,
        bruto:fin_lancamentos_brutos!fin_fila_classificacao_lancamento_bruto_id_fkey(
          id, data_lancamento, valor, tipo_trn, memo, nome_contraparte, documento_contraparte
        )
      `)
      .eq('status', 'pendente')
      .order('sugestao_confianca', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
      .limit(Math.min(500, Number(limit)));
    if (confianca_min) q = q.gte('sugestao_confianca', Number(confianca_min));
    if (origem) q = q.eq('sugestao_origem', origem);
    const { data, error } = await q;
    if (error) throw error;
    res.json(data || []);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Aprova em massa todas as fila pendentes com confiança >= X
router.post('/fila-classificacao/aprovar-massa', async (req, res) => {
  try {
    const { confianca_min = 0.8 } = req.body || {};
    const { data: pendentes, error: e1 } = await supabase
      .from('fin_fila_classificacao')
      .select('id, sugestao_plano_contas_id')
      .eq('status', 'pendente')
      .gte('sugestao_confianca', Number(confianca_min))
      .not('sugestao_plano_contas_id', 'is', null);
    if (e1) throw e1;
    if (!pendentes || pendentes.length === 0) {
      return res.json({ aprovadas: 0, mensagem: 'Nenhuma item elegivel' });
    }
    const ids = pendentes.map(p => p.id);
    const { error: e2 } = await supabase
      .from('fin_fila_classificacao')
      .update({ status: 'aprovado', decidido_em: new Date().toISOString(), decidido_por: req.user.userId })
      .in('id', ids);
    if (e2) throw e2;
    res.json({ aprovadas: ids.length });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Decide manualmente (1 item)
router.post('/fila-classificacao/:id/decidir', async (req, res) => {
  try {
    const { plano_contas_id, centro_custo_id, membro_id } = req.body || {};
    if (!plano_contas_id) return res.status(400).json({ error: 'plano_contas_id obrigatorio' });
    const { data, error } = await supabase
      .from('fin_fila_classificacao')
      .update({
        sugestao_plano_contas_id: plano_contas_id,
        sugestao_centro_custo_id: centro_custo_id || null,
        sugestao_membro_id: membro_id || null,
        status: 'aprovado',
        decidido_em: new Date().toISOString(),
        decidido_por: req.user.userId,
      })
      .eq('id', req.params.id).select('*').single();
    if (error) throw error;
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Re-roda classificação em toda fila pendente (após cadastrar regra nova)
router.post('/fila-classificacao/reclassificar', async (req, res) => {
  try {
    const { data, error } = await supabase.rpc('reclassificar_fila_pendente');
    if (error) throw error;
    res.json({ reclassificadas: data });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ══════════════════════════════════════════════════════════════════════════
// ALERTAS FINANCEIROS INTELIGENTES
// ══════════════════════════════════════════════════════════════════════════

// Lista alertas abertos
router.get('/alertas', async (req, res) => {
  try {
    const { atendido } = req.query;
    if (atendido === 'true') {
      const { data, error } = await supabase
        .from('fin_alertas').select('*')
        .not('atendido_em', 'is', null)
        .order('atendido_em', { ascending: false }).limit(100);
      if (error) throw error;
      return res.json(data || []);
    }
    const { data, error } = await supabase
      .from('vw_fin_alertas_abertos').select('*');
    if (error) throw error;
    res.json(data || []);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Marca atendido
router.post('/alertas/:id/atender', async (req, res) => {
  try {
    const { comentario } = req.body || {};
    const { data, error } = await supabase
      .from('fin_alertas').update({
        atendido_em: new Date().toISOString(),
        atendido_por: req.user.userId,
        comentario_atendimento: comentario || null,
      }).eq('id', req.params.id).select('*').single();
    if (error) throw error;
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Roda gerador (admin ou cron)
router.post('/alertas/gerar', async (req, res) => {
  try {
    const { data, error } = await supabase.rpc('gerar_alertas_financeiros');
    if (error) throw error;
    const total = (data || []).reduce((s, r) => s + Number(r.qtd_criados || 0), 0);
    res.json({ total_criados: total, por_tipo: data || [] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ══════════════════════════════════════════════════════════════════════════
// CALENDÁRIO FINANCEIRO
// ══════════════════════════════════════════════════════════════════════════

router.get('/calendario', async (req, res) => {
  try {
    const { inicio, fim, tipo } = req.query;
    let q = supabase.from('vw_calendario_financeiro').select('*').order('data');
    if (inicio) q = q.gte('data', inicio);
    if (fim) q = q.lte('data', fim);
    if (tipo) q = q.eq('tipo', tipo);
    const { data, error } = await q;
    if (error) throw error;
    res.json(data || []);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ══════════════════════════════════════════════════════════════════════════
// DRE POR CENTRO DE CUSTO
// ══════════════════════════════════════════════════════════════════════════

// Lista centros de custo cadastrados (pro selector da UI)
router.get('/centros-custo', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('fin_centros_custo')
      .select('id, codigo, nome, campus, area_slug, nivel, aceita_lancamento, ativo')
      .eq('ativo', true)
      .order('codigo');
    if (error) throw error;
    res.json(data || []);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Ranking do mês corrente · receita+despesa por centro
router.get('/dre-centro-custo/atual', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('vw_dre_centro_custo_atual').select('*');
    if (error) throw error;
    // Agrupa por centro · soma receita e despesa em uma linha
    const byId = {};
    (data || []).forEach(r => {
      const k = r.centro_custo_id;
      if (!byId[k]) {
        byId[k] = {
          centro_custo_id: k, codigo: r.codigo, centro_nome: r.centro_nome,
          campus: r.campus, area_slug: r.area_slug,
          receita: 0, despesa: 0, receita_anterior: 0, despesa_anterior: 0,
        };
      }
      const tgt = r.tipo === 'receita' ? 'receita' : 'despesa';
      byId[k][tgt] += Math.abs(Number(r.atual || 0));
      byId[k][`${tgt}_anterior`] += Math.abs(Number(r.anterior || 0));
    });
    const lista = Object.values(byId).map(c => ({
      ...c,
      resultado: c.receita - c.despesa,
      resultado_anterior: c.receita_anterior - c.despesa_anterior,
      total_movimentado: c.receita + c.despesa,
    })).sort((a, b) => b.total_movimentado - a.total_movimentado);
    res.json(lista);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ══════════════════════════════════════════════════════════════════════════
// AUDIT LOG · histórico de mudanças em registros financeiros
// ══════════════════════════════════════════════════════════════════════════

const TABELAS_FIN_AUDITAVEIS = [
  'fin_transacoes', 'fin_contas', 'fin_contas_pagar',
  'fin_closing_mensal', 'fin_despesas_recorrentes',
];

// Histórico de 1 registro especifico
router.get('/audit/:tabela/:row_id', async (req, res) => {
  try {
    const { tabela, row_id } = req.params;
    if (!TABELAS_FIN_AUDITAVEIS.includes(tabela)) {
      return res.status(400).json({ error: 'Tabela não auditavel' });
    }
    const { data, error } = await supabase
      .from('app_audit_log')
      .select('id, action, user_id, user_email, changes, created_at')
      .eq('table_name', tabela)
      .eq('row_id', row_id)
      .order('created_at', { ascending: false });
    if (error) throw error;
    res.json(data || []);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Audit log financeiro geral · filtros opcionais
router.get('/audit', authorizeModule('financeiro', 3), async (req, res) => {
  try {
    const { tabela, user_email, desde, ate, limit = 100 } = req.query;
    let q = supabase
      .from('app_audit_log')
      .select('id, table_name, row_id, action, user_id, user_email, changes, created_at')
      .in('table_name', TABELAS_FIN_AUDITAVEIS)
      .order('created_at', { ascending: false })
      .limit(Math.min(500, Number(limit)));
    if (tabela && TABELAS_FIN_AUDITAVEIS.includes(tabela)) q = q.eq('table_name', tabela);
    if (user_email) q = q.eq('user_email', user_email.toLowerCase());
    if (desde) q = q.gte('created_at', desde);
    if (ate) q = q.lte('created_at', ate);
    const { data, error } = await q;
    if (error) throw error;
    res.json(data || []);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ══════════════════════════════════════════════════════════════════════════
// DRE COMPARATIVO TEMPORAL · atual vs anterior vs ano passado
// ══════════════════════════════════════════════════════════════════════════

router.get('/dre-comparativo', async (req, res) => {
  try {
    const [linhas, totais] = await Promise.all([
      supabase.from('vw_dre_comparativo').select('*'),
      supabase.from('vw_dre_comparativo_totais').select('*'),
    ]);
    if (linhas.error) throw linhas.error;
    if (totais.error) throw totais.error;
    res.json({ linhas: linhas.data || [], totais: totais.data || [] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ══════════════════════════════════════════════════════════════════════════
// CLOSING MENSAL FINANCEIRO
// ══════════════════════════════════════════════════════════════════════════

router.get('/closing', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('fin_closing_mensal').select('*')
      .order('ano', { ascending: false })
      .order('mes', { ascending: false })
      .limit(36);
    if (error) throw error;
    res.json(data || []);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/closing/fechar', authorizeModule('financeiro', 4), async (req, res) => {
  try {
    const { ano, mes, observacao } = req.body || {};
    if (!ano || !mes) return res.status(400).json({ error: 'ano e mês obrigatórios' });
    // Não fecha mês corrente nem futuro
    const hoje = new Date();
    if (Number(ano) > hoje.getFullYear() ||
        (Number(ano) === hoje.getFullYear() && Number(mes) >= hoje.getMonth() + 1)) {
      return res.status(400).json({ error: 'Não eh possível fechar mês corrente ou futuro' });
    }
    const { data, error } = await supabase.rpc('fechar_mes_financeiro', {
      p_ano: Number(ano), p_mes: Number(mes),
      p_fechado_por: req.user.userId,
      p_observacao: observacao || null,
    });
    if (error) throw error;
    res.json({ id: data, ano, mes });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/closing/reabrir', authorizeModule('financeiro', 5), async (req, res) => {
  try {
    const { ano, mes, motivo } = req.body || {};
    if (!ano || !mes) return res.status(400).json({ error: 'ano e mês obrigatórios' });
    if (!motivo || motivo.length < 5) return res.status(400).json({ error: 'motivo obrigatorio (>=5 chars)' });
    const { data, error } = await supabase.rpc('reabrir_mes_financeiro', {
      p_ano: Number(ano), p_mes: Number(mes),
      p_reaberto_por: req.user.userId, p_motivo: motivo,
    });
    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Mês não estava fechado' });
    res.json({ reaberto: true, ano, mes });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Histórico 12 meses de 1 centro
router.get('/dre-centro-custo/:id/historico', async (req, res) => {
  try {
    const desde = new Date();
    desde.setMonth(desde.getMonth() - 11); desde.setDate(1);
    const { data, error } = await supabase
      .from('vw_dre_centro_custo_mensal')
      .select('mes, tipo, total, qtd_lancamentos')
      .eq('centro_custo_id', req.params.id)
      .gte('mes', desde.toISOString().slice(0, 10))
      .order('mes');
    if (error) throw error;
    // Pivot · 1 linha por mês com receita+despesa
    const byMes = {};
    (data || []).forEach(r => {
      const k = r.mes;
      if (!byMes[k]) byMes[k] = { mes: k, receita: 0, despesa: 0, qtd: 0 };
      const v = Math.abs(Number(r.total || 0));
      byMes[k][r.tipo === 'receita' ? 'receita' : 'despesa'] += v;
      byMes[k].qtd += Number(r.qtd_lancamentos || 0);
    });
    res.json(Object.values(byMes).map(m => ({
      ...m,
      resultado: m.receita - m.despesa,
    })));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
