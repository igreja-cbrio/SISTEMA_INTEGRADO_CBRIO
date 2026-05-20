const router = require('express').Router();
const multer = require('multer');
const XLSX = require('xlsx');
const { authenticate, authorizeModule } = require('../middleware/auth');
const { supabase } = require('../utils/supabase');

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
    const { conta_id, tipo, status, mes } = req.query;
    let query = supabase.from('fin_transacoes').select('*, fin_contas(nome), fin_categorias(nome, tipo)').order('data_competencia', { ascending: false });
    if (conta_id) query = query.eq('conta_id', conta_id);
    if (tipo) query = query.eq('tipo', tipo);
    if (status) query = query.eq('status', status);
    if (mes) {
      const [y, m] = mes.split('-');
      const lastDay = new Date(Number(y), Number(m), 0).getDate();
      query = query.gte('data_competencia', `${mes}-01`).lte('data_competencia', `${mes}-${String(lastDay).padStart(2, '0')}`);
    }
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

// Tenta extrair (ano, mes) de um valor de célula. Aceita:
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
  '4.04': 'REPASSE AS MISSOES',
  '4.05': 'ACAO SOCIAL',
  '4.06': 'MATERIAIS DE CONSUMO',
  '4.07': 'VIAGENS E DESLOCAMENTOS',
  '4.08': 'DESPESAS COM VEICULOS',
  '4.09': 'DESPESAS PATRIMONIAIS',
  '4.10': 'ORGANIZACAO DE EVENTOS',
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

    const valores = new Map();          // chave "cod|ano|mes" → soma
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
      { cod: 'RESULTADO',  desc: 'RESULTADO DO PERIODO', level: 0, tipo: 'total' },
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

module.exports = router;
