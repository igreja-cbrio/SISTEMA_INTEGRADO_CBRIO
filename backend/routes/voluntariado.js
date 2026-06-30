const router = require('express').Router();
const { authenticate, authorizeModule, getEffectiveLevel, bustPermissionCaches } = require('../middleware/auth');
const { supabase } = require('../utils/supabase');
const { acharOuCriarGuardado } = require('../services/membroMatch');
const { getPCCredentials, fetchWithRetry, PC_SERVICES_BASE, assignVolunteersToTeams, syncTeamMembersFromSchedules, fetchAllServiceTypes } = require('../services/planningCenter');
const { enqueueSync } = require('../services/cerebroSync');
const { resolverVoluntarioPorQr } = require('../services/volCheckinResolver');
const { notificar } = require('../services/notificar');
const { mountWhatsappAuto } = require('./whatsappAutoRoutes');
const { requireCron } = require('../utils/cronAuth');
const antecedentes = require('../services/antecedentesCriminais');
const { executarSyncCompleto } = require('../services/voluntariadoSync');
const multer = require('multer');
const uploadCsv = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 } });

// ── Cron (sem login · CRON_SECRET) ──────────────────────────────────────────
// Processa as triagens de antecedentes pendentes (Kids/Bridge) via Infosimples.
// Inerte se INFOSIMPLES_API_TOKEN não estiver configurado.
router.get('/cron/antecedentes', requireCron, async (req, res) => {
  try {
    const r = await antecedentes.processarPendentes({ limite: 25 });
    res.json({ ok: true, ...r });
  } catch (e) {
    console.error('[vol/cron/antecedentes]', e.message);
    res.status(500).json({ error: 'Erro no cron de antecedentes' });
  }
});

// Cron (sem login · CRON_SECRET) · sincroniza o Planning Center DE HORA EM HORA
// (vercel.json · 0 * * * *) por segurança, pra que as escalas/pessoas estejam
// sempre atualizadas na hora do check-in. Mesma lógica do botão manual /sync.
router.get('/cron/sync', requireCron, async (req, res) => {
  try {
    const r = await executarSyncCompleto();
    await supabase.from('vol_sync_logs').insert({
      sync_type: 'automatic', services_synced: r.services, schedules_synced: r.schedules,
      qrcodes_generated: r.qrCodesGenerated, status: 'success',
    });
    res.json({ ok: true, ...r });
  } catch (e) {
    console.error('[vol/cron/sync]', e.message);
    res.status(500).json({ error: 'Erro no cron de sync do voluntariado' });
  }
});

router.use(authenticate, authorizeModule('membresia', 1));

// ══════════════════════════════════════════════════════════════
// CONTROLE DE FREQUÊNCIA · histórico de serviços (planilha) + vínculo
// "Quantas vezes serviu e em qual culto" · ativos/inativos (90 dias).
// ══════════════════════════════════════════════════════════════
function normNome(s) {
  return (s || '').toString().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/\s+/g, ' ').trim();
}
function cultoCanonico(s) {
  const n = normNome(s);
  if (n.startsWith('sab')) return 'Sábado';
  if (n.startsWith('dom')) return 'Domingo';
  if (n.startsWith('qua')) return 'Quarta';
  return (s || '—').toString().trim() || '—';
}
// CSV → grade (array de arrays), respeitando aspas
function parseCsvGrade(texto) {
  const splitLinha = (l) => {
    const out = []; let cur = ''; let q = false;
    for (let i = 0; i < l.length; i++) {
      const c = l[i];
      if (c === '"') { if (q && l[i + 1] === '"') { cur += '"'; i++; } else q = !q; }
      else if (c === ',' && !q) { out.push(cur); cur = ''; }
      else cur += c;
    }
    out.push(cur); return out;
  };
  return texto.replace(/\r/g, '').split('\n').map(splitLinha);
}
// Célula de data (Date, serial Excel, dd/mm/aaaa, aaaa-mm-dd) → ISO 'aaaa-mm-dd'
function parseDataCel(v) {
  if (v == null || v === '') return null;
  if (v instanceof Date) return isNaN(v) ? null : v.toISOString().slice(0, 10);
  if (typeof v === 'number') return v > 40000 ? serialParaISO(v) : null;
  const s = String(v).trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return null;
}
const MESES_PT = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
// Extrai registros {nome,data,culto,mes} de uma GRADE. Aceita 2 layouts:
// (a) simples: cabeçalho com colunas nome,data,culto[,mes];
// (b) controle: linha 0 = dia, linha 1 = data por coluna, linhas 2+ = nomes.
function extrairRegistrosDeGrade(aoa, mesLabel) {
  if (!aoa || aoa.length < 2) return [];
  const head0 = (aoa[0] || []).map(c => normNome(c));
  const idxNome = head0.indexOf('nome');
  const idxData = head0.indexOf('data');
  const out = [];
  if (idxNome >= 0 && idxData >= 0) {
    const idxCulto = head0.indexOf('culto');
    const idxMes = head0.indexOf('mes');
    for (let r = 1; r < aoa.length; r++) {
      const row = aoa[r] || [];
      const nome = (row[idxNome] == null ? '' : String(row[idxNome])).trim();
      const data = parseDataCel(row[idxData]);
      if (!nome || !data) continue;
      out.push({ nome, data, culto: cultoCanonico(idxCulto >= 0 ? row[idxCulto] : ''), mes: (idxMes >= 0 ? String(row[idxMes] || '') : mesLabel) || null });
    }
    return out;
  }
  const diaRow = aoa[0] || [];
  const dataRow = aoa[1] || [];
  const dateCols = [];
  for (let c = 0; c < dataRow.length; c++) {
    const iso = parseDataCel(dataRow[c]);
    if (iso) dateCols.push({ c, iso, culto: cultoCanonico(diaRow[c]) });
  }
  if (!dateCols.length) return [];
  for (let r = 2; r < aoa.length; r++) {
    const row = aoa[r] || [];
    for (const dc of dateCols) {
      const nome = (row[dc.c] == null ? '' : String(row[dc.c])).trim();
      if (!nome) continue;
      const mes = mesLabel || MESES_PT[Number(dc.iso.slice(5, 7)) - 1] || null;
      out.push({ nome, data: dc.iso, culto: dc.culto, mes });
    }
  }
  return out;
}

// Excel serial → ISO (epoch 1899-12-30)
function serialParaISO(n) {
  const d = new Date(Date.UTC(1899, 11, 30) + Math.round(Number(n)) * 86400000);
  return isNaN(d) ? null : d.toISOString().slice(0, 10);
}
// Extrai a planilha de CONTROLE direto do .xlsx (abas por mês): coluna A = lista
// mestre, B = QUANT, e as colunas a partir da C trazem, por data (linha 2) e dia
// (linha 1), os NOMES de quem serviu (linhas 3+). Vira [{nome,data,culto,mes}].
function extrairControleXlsx(buffer) {
  const XLSX = require('xlsx');
  const wb = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const registros = [];
  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    if (!ws) continue;
    const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '' });
    registros.push(...extrairRegistrosDeGrade(aoa, sheetName));
  }
  return registros;
}

// Extrai o CADASTRO de inscritos (coluna "Inscritos (fixo)" · col A, linhas 2+)
// de cada aba da planilha de controle. Inclui quem serviu 0 vezes. Ignora o
// layout CSV simples (cabeçalho nome,data,...).
function extrairInscritosXlsx(buffer) {
  const XLSX = require('xlsx');
  const wb = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const nomes = new Set();
  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName]; if (!ws) continue;
    const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '' });
    const head0 = (aoa[0] || []).map((c) => normNome(c));
    if (head0.indexOf('nome') >= 0 && head0.indexOf('data') >= 0) continue;
    for (let r = 2; r < aoa.length; r++) {
      const nome = (aoa[r] && aoa[r][0] != null ? String(aoa[r][0]) : '').trim();
      if (nome) nomes.add(nome);
    }
  }
  return [...nomes];
}

// Vincula inscritos a vol_profiles por nome normalizado ÚNICO (e puxa o membro
// pelo membresia_id do perfil). Ambíguo não casa.
async function linkInscritos() {
  const { data: profs } = await supabase.from('vol_profiles').select('id, full_name, membresia_id');
  const map = new Map(); const dup = new Set();
  for (const p of profs || []) { const k = normNome(p.full_name); if (!k) continue; if (map.has(k)) dup.add(k); else map.set(k, p); }
  for (const k of dup) map.delete(k);
  const { data: ins } = await supabase.from('vol_inscritos').select('id, nome_norm').is('vol_profile_id', null).is('deleted_at', null);
  let n = 0;
  for (const it of ins || []) {
    const p = map.get(it.nome_norm);
    if (!p) continue;
    const { error } = await supabase.from('vol_inscritos').update({ vol_profile_id: p.id, membro_id: p.membresia_id || null, updated_at: new Date().toISOString() }).eq('id', it.id);
    if (!error) n += 1;
  }
  return n;
}

// Casa nomes da planilha (não vinculados) com vol_profiles por nome normalizado.
// Match só quando o nome normalizado é único entre os perfis (ambíguo não casa).
async function rematchFrequencia() {
  const { data: profs } = await supabase.from('vol_profiles').select('id, full_name');
  const map = new Map(); const dup = new Set();
  for (const p of profs || []) {
    const k = normNome(p.full_name);
    if (!k) continue;
    if (map.has(k)) dup.add(k); else map.set(k, p.id);
  }
  for (const k of dup) map.delete(k);
  // nomes distintos ainda não vinculados (via view · ~<1000 linhas)
  const { data: pend } = await supabase.from('vw_vol_frequencia')
    .select('nome_norm').is('vol_profile_id', null);
  const nomes = [...new Set((pend || []).map(r => r.nome_norm))];
  let n = 0;
  for (const nm of nomes) {
    const pid = map.get(nm);
    if (!pid) continue;
    const { error } = await supabase.from('vol_servicos_historico')
      .update({ vol_profile_id: pid }).eq('nome_norm', nm).is('vol_profile_id', null);
    if (!error) n += 1;
  }
  return n;
}

// POST /api/voluntariado/frequencia/importar (multipart 'arquivo')
// Aceita a planilha de CONTROLE (.xlsx ou .csv · colunas por data) OU um CSV
// simples (nome,data,culto[,mes]). Detecta o formato automaticamente.
router.post('/frequencia/importar', authorizeModule('membresia', 2), uploadCsv.single('arquivo'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Envie o arquivo em "arquivo".' });
    const origem = (req.body?.origem || 'planilha_2026').toString().slice(0, 40);
    const fname = (req.file.originalname || '').toLowerCase();
    const ehXlsx = fname.endsWith('.xlsx') || fname.endsWith('.xls') || /spreadsheet|excel|officedocument/.test(req.file.mimetype || '');

    let brutos;
    try {
      brutos = ehXlsx
        ? extrairControleXlsx(req.file.buffer)
        : extrairRegistrosDeGrade(parseCsvGrade(req.file.buffer.toString('utf-8')), null);
    } catch (e) {
      console.error('[vol] parse import', e.message);
      return res.status(400).json({ error: 'Não consegui ler o arquivo. Envie a planilha de controle (.xlsx) ou o CSV exportado dela.' });
    }

    const vistos = new Set();
    const registros = [];
    for (const b of brutos) {
      const nome = (b.nome || '').trim();
      if (!nome || !/^\d{4}-\d{2}-\d{2}$/.test(b.data || '')) continue;
      const culto = cultoCanonico(b.culto);
      const nome_norm = normNome(nome);
      if (!nome_norm) continue;
      const k = `${nome_norm}|${b.data}|${culto}`;
      if (vistos.has(k)) continue;
      vistos.add(k);
      registros.push({ nome_planilha: nome, nome_norm, data: b.data, culto_label: culto, mes: b.mes || null, origem });
    }
    if (!registros.length) {
      return res.status(400).json({ error: 'Não encontrei serviços na planilha. Envie a planilha de controle (.xlsx ou .csv com colunas por data) ou um CSV com colunas nome,data,culto.' });
    }

    // Filtra "nomes" que são posição/equipe/equipamento (não pessoas).
    let ignoradosNaoPessoa = 0;
    try {
      const { nomesNaoPessoa } = require('../services/volNomeFiltro');
      const skip = await nomesNaoPessoa(registros.map(r => r.nome_planilha));
      if (skip.size) {
        const antes = registros.length;
        for (let i = registros.length - 1; i >= 0; i--) {
          if (skip.has(registros[i].nome_norm)) registros.splice(i, 1);
        }
        ignoradosNaoPessoa = antes - registros.length;
      }
    } catch (e) {
      console.warn('[vol] filtro nao-pessoa:', e.message);
    }
    if (!registros.length) {
      return res.status(400).json({ error: 'Todas as linhas foram identificadas como posição/equipe (não pessoas). Confira se os nomes das pessoas estão na planilha.' });
    }

    for (let i = 0; i < registros.length; i += 500) {
      const lote = registros.slice(i, i + 500);
      const { error } = await supabase.from('vol_servicos_historico')
        .upsert(lote, { onConflict: 'nome_norm,data,culto_label,origem', ignoreDuplicates: true });
      if (error) return res.status(400).json({ error: 'Falha ao gravar: ' + error.message });
    }
    const vinculadas = await rematchFrequencia();

    // Captura o CADASTRO de inscritos (coluna A) — é o que faz quem serviu 0
    // vezes aparecer na frequência como inativo.
    let inscritos = 0;
    if (ehXlsx) {
      try {
        const nomesIns = extrairInscritosXlsx(req.file.buffer);
        let skip = new Set();
        try { const { nomesNaoPessoa } = require('../services/volNomeFiltro'); skip = await nomesNaoPessoa(nomesIns); } catch (e) { /* segue */ }
        const linhas = []; const vistosI = new Set();
        for (const nome of nomesIns) {
          const nn = normNome(nome);
          if (!nn || skip.has(nn) || vistosI.has(nn)) continue;
          vistosI.add(nn);
          linhas.push({ nome_planilha: nome, nome_norm: nn, origem });
        }
        for (let i = 0; i < linhas.length; i += 500) {
          await supabase.from('vol_inscritos').upsert(linhas.slice(i, i + 500), { onConflict: 'nome_norm,origem', ignoreDuplicates: true });
        }
        inscritos = linhas.length;
        await linkInscritos();
      } catch (e) { console.warn('[vol] inscritos:', e.message); }
    }
    res.json({ processadas: registros.length, nomes_vinculados: vinculadas, ignorados_nao_pessoa: ignoradosNaoPessoa, inscritos });
  } catch (e) {
    console.error('[vol] importar frequencia', e.message);
    res.status(500).json({ error: 'Erro ao importar o controle' });
  }
});

// GET /api/voluntariado/frequencia?status=ativos|inativos&vinculo=nao&busca=
router.get('/frequencia', async (req, res) => {
  try {
    const build = () => {
      let q = supabase.from('vw_vol_frequencia').select('*');
      if (req.query.status === 'ativos') q = q.eq('ativo', true);
      else if (req.query.status === 'inativos') q = q.eq('ativo', false);
      if (req.query.vinculo === 'nao') q = q.is('vol_profile_id', null);
      else if (req.query.vinculo === 'sim') q = q.not('vol_profile_id', 'is', null);
      if (req.query.busca) q = q.ilike('nome', `%${req.query.busca}%`);
      return q.order('ativo', { ascending: false }).order('ultimo_servico', { ascending: false, nullsFirst: false });
    };
    // Pagina pra contornar o cap de 1000 linhas do PostgREST (lista completa).
    let data = []; let offset = 0;
    while (true) {
      const { data: page, error } = await build().range(offset, offset + 999);
      if (error) return res.status(400).json({ error: error.message });
      if (!page || !page.length) break;
      data = data.concat(page);
      if (page.length < 1000) break;
      offset += 1000;
    }
    // Resumo (cards) = SEMPRE o total geral · contagem real no banco, NÃO muda
    // com o filtro da lista (antes recalculava do subconjunto capado → números
    // divergentes entre "Todos" e "Ativos").
    const { count: total } = await supabase.from('vw_vol_frequencia').select('chave', { count: 'exact', head: true });
    const { count: ativos } = await supabase.from('vw_vol_frequencia').select('chave', { count: 'exact', head: true }).eq('ativo', true);
    res.json({ resumo: { total: total || 0, ativos: ativos || 0, inativos: (total || 0) - (ativos || 0) }, itens: data });
  } catch (e) {
    console.error('[vol] frequencia', e.message);
    res.status(500).json({ error: 'Erro ao carregar frequência' });
  }
});

// GET /api/voluntariado/frequencia/detalhe?nome_norm=&profile_id=  → datas/cultos
router.get('/frequencia/detalhe', async (req, res) => {
  try {
    let q = supabase.from('vol_servicos_historico')
      .select('data, culto_label, mes, origem, nome_planilha').is('deleted_at', null);
    if (req.query.profile_id) q = q.eq('vol_profile_id', req.query.profile_id);
    else if (req.query.nome_norm) q = q.eq('nome_norm', req.query.nome_norm);
    else return res.status(400).json({ error: 'Informe profile_id ou nome_norm' });
    const { data, error } = await q.order('data', { ascending: false }).limit(500);
    if (error) return res.status(400).json({ error: error.message });
    res.json(data || []);
  } catch (e) {
    res.status(500).json({ error: 'Erro ao carregar detalhe' });
  }
});

// GET /api/voluntariado/frequencia/perfis?q=  → busca voluntários pra vincular
router.get('/frequencia/perfis', async (req, res) => {
  try {
    let q = supabase.from('vol_profiles').select('id, full_name').order('full_name').limit(20);
    if (req.query.q) q = q.ilike('full_name', `%${req.query.q}%`);
    const { data, error } = await q;
    if (error) return res.status(400).json({ error: error.message });
    res.json(data || []);
  } catch (e) {
    res.status(500).json({ error: 'Erro ao buscar perfis' });
  }
});

// POST /api/voluntariado/frequencia/vincular { nome_norm, vol_profile_id }
router.post('/frequencia/vincular', authorizeModule('membresia', 2), async (req, res) => {
  try {
    const { nome_norm, vol_profile_id } = req.body || {};
    if (!nome_norm || !vol_profile_id) return res.status(400).json({ error: 'nome_norm e vol_profile_id obrigatórios' });
    const { error } = await supabase.from('vol_servicos_historico')
      .update({ vol_profile_id }).eq('nome_norm', nome_norm).is('deleted_at', null);
    if (error) return res.status(400).json({ error: error.message });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'Erro ao vincular' });
  }
});

// POST /api/voluntariado/frequencia/revincular  → roda o match automático de novo
router.post('/frequencia/revincular', authorizeModule('membresia', 2), async (req, res) => {
  try {
    const n = await rematchFrequencia();
    res.json({ nomes_vinculados: n });
  } catch (e) {
    res.status(500).json({ error: 'Erro ao revincular' });
  }
});

// POST /frequencia/sync-pco → traz as escalas recentes do Planning Center pra a
// frequência (quem serviu nos últimos ~120 dias · ex.: o último domingo).
router.post('/frequencia/sync-pco', authorizeModule('membresia', 2), async (req, res) => {
  try {
    const { bridgeFrequenciaPCO } = require('../services/voluntariadoFreqPCO');
    const desde = new Date(Date.now() - 120 * 864e5).toISOString();
    const r = await bridgeFrequenciaPCO(desde);
    res.json(r);
  } catch (e) {
    console.error('[vol] sync-pco frequencia', e.message);
    res.status(500).json({ error: 'Erro ao trazer escalas do Planning Center' });
  }
});

// POST /api/voluntariado/frequencia/sugerir-vinculos → IA cruza os nomes NÃO
// vinculados com os perfis e devolve sugestões pra REVISÃO (não vincula nada).
router.post('/frequencia/sugerir-vinculos', authorizeModule('membresia', 2), async (req, res) => {
  try {
    // nomes não vinculados (via view · 1 linha por pessoa)
    const pend = [];
    let from = 0;
    while (true) {
      const { data, error } = await supabase.from('vw_vol_frequencia')
        .select('nome_norm, nome, total_servicos')
        .is('vol_profile_id', null)
        .range(from, from + 999);
      if (error) return res.status(400).json({ error: error.message });
      if (!data || !data.length) break;
      pend.push(...data);
      if (data.length < 1000) break;
      from += 1000;
    }
    const nomes = pend.map(r => ({ nome_norm: r.nome_norm, nome: r.nome, total: r.total_servicos }));
    if (!nomes.length) return res.json({ sugestoes: [] });

    // todos os perfis (paginado · cap 1000 do PostgREST)
    const perfis = [];
    from = 0;
    while (true) {
      const { data } = await supabase.from('vol_profiles')
        .select('id, full_name').range(from, from + 999);
      if (!data || !data.length) break;
      perfis.push(...data);
      if (data.length < 1000) break;
      from += 1000;
    }

    const { sugerirVinculos } = require('../services/volVinculoIA');
    const sugestoes = await sugerirVinculos(nomes, perfis);
    // anexa o total de serviços de cada nome (pra UI priorizar)
    const totalPorNome = new Map(nomes.map(n => [n.nome_norm, n.total]));
    for (const s of sugestoes) s.total_servicos = totalPorNome.get(s.nome_norm) ?? 0;
    res.json({ sugestoes });
  } catch (e) {
    console.error('[vol] sugerir-vinculos', e.message);
    res.status(500).json({ error: 'Erro ao gerar sugestões' });
  }
});

// POST /api/voluntariado/frequencia/vincular-lote → aplica os vínculos APROVADOS
// { vinculos: [{ nome_norm, vol_profile_id }] }
router.post('/frequencia/vincular-lote', authorizeModule('membresia', 2), async (req, res) => {
  try {
    const vinculos = Array.isArray(req.body?.vinculos) ? req.body.vinculos : [];
    let vinculados = 0;
    for (const v of vinculos) {
      if (!v?.nome_norm || !v?.vol_profile_id) continue;
      const { error } = await supabase.from('vol_servicos_historico')
        .update({ vol_profile_id: v.vol_profile_id })
        .eq('nome_norm', v.nome_norm)
        .is('vol_profile_id', null)
        .is('deleted_at', null);
      if (!error) vinculados += 1;
    }
    res.json({ vinculados });
  } catch (e) {
    res.status(500).json({ error: 'Erro ao vincular em lote' });
  }
});

// Mensagem automática de WhatsApp · boas-vindas ao voluntário que se inscreve
// (config/edição em /whatsapp-auto/* · gerencia a chave 'voluntariado_inscricao')
mountWhatsappAuto(router, { chave: 'voluntariado_inscricao', modulo: 'voluntariado', authorizeModule });

// ══════════════════════════════════════════════════════════════
// VOLUNTEER PORTAL — endpoints for logged-in volunteers
// ══════════════════════════════════════════════════════════════

// Get my volunteer profile (linked to auth user)
router.get('/me', async (req, res) => {
  try {
    const userId = req.user.userId;
    // Try vol_profiles first
    let { data: volProfile } = await supabase.from('vol_profiles')
      .select('*').eq('auth_user_id', userId).maybeSingle();

    // If no vol_profile exists, try to find by email
    if (!volProfile) {
      const { data: authProfile } = await supabase.from('profiles')
        .select('email, name').eq('id', userId).maybeSingle();
      if (authProfile?.email) {
        const { data: byEmail } = await supabase.from('vol_profiles')
          .select('*').eq('email', authProfile.email).maybeSingle();
        if (byEmail) {
          // Link auth_user_id
          await supabase.from('vol_profiles').update({ auth_user_id: userId }).eq('id', byEmail.id);
          volProfile = { ...byEmail, auth_user_id: userId };
        }
      }
    }

    // Get team memberships
    let teams = [];
    if (volProfile) {
      const { data: memberData } = await supabase.from('vol_team_members')
        .select('*, team:vol_teams(id, name, color), position:vol_positions(id, name)')
        .eq('volunteer_profile_id', volProfile.id).eq('is_active', true);
      teams = memberData || [];
    }

    res.json({ profile: volProfile, teams });
  } catch (e) { res.status(500).json({ error: 'Erro ao buscar perfil do voluntário' }); }
});

// Save face descriptor for MY OWN volunteer profile (self-service enrollment)
router.post('/me/face', async (req, res) => {
  try {
    const userId = req.user.userId;
    const { descriptor, photo_url } = req.body;
    if (!descriptor || !Array.isArray(descriptor)) {
      return res.status(400).json({ error: 'descriptor obrigatorio' });
    }

    const { data: profile } = await supabase.from('vol_profiles')
      .select('id').eq('auth_user_id', userId).maybeSingle();
    if (!profile) {
      return res.status(404).json({ error: 'Perfil de voluntário não encontrado' });
    }

    const { data, error } = await supabase.rpc('vol_save_profile_face_descriptor', {
      p_profile_id: profile.id,
      descriptor,
      photo_url: photo_url || null,
    });
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) {
    console.error('[Vol] save my face error:', e.message);
    res.status(500).json({ error: 'Erro ao salvar reconhecimento facial' });
  }
});

// Complete/update my volunteer profile
router.put('/me', async (req, res) => {
  try {
    const userId = req.user.userId;
    const { full_name, cpf, phone, email } = req.body;
    if (!full_name) return res.status(400).json({ error: 'Nome obrigatorio' });

    // Check if vol_profile exists (and fetch current cpf to detect changes)
    let { data: existing } = await supabase.from('vol_profiles')
      .select('id, cpf').eq('auth_user_id', userId).maybeSingle();

    const cleanCpf = cpf ? cpf.replace(/\D/g, '') : '';
    const currentCpf = existing?.cpf ? existing.cpf.replace(/\D/g, '') : '';
    const cpfChanged = cleanCpf && cleanCpf !== currentCpf;

    // Quando o CPF for alterado (ou definido pela primeira vez), vincular com
    // o cadastro de membros. Se o CPF não existir em mem_membros, devolver
    // MEMBER_NOT_FOUND para que o frontend peca o cadastro obrigatório.
    let membroMatch = null;
    if (cpfChanged) {
      if (cleanCpf.length !== 11) {
        return res.status(400).json({ error: 'CPF invalido' });
      }
      const { data: membro } = await supabase.from('mem_membros')
        .select('id, nome, telefone, email').eq('cpf', cleanCpf).maybeSingle();
      if (!membro) {
        return res.status(409).json({
          error: 'CPF não encontrado no cadastro de membros. Complete o cadastro para continuar.',
          code: 'MEMBER_NOT_FOUND',
          cpf: cleanCpf,
        });
      }
      membroMatch = membro;
    }

    let profileId;
    if (existing) {
      profileId = existing.id;
      const update = {
        full_name,
        cpf: cleanCpf || null,
        phone: phone || null,
        email: email || null,
        profile_complete: true,
      };
      if (membroMatch) update.membresia_id = membroMatch.id;
      await supabase.from('vol_profiles').update(update).eq('id', profileId);
    } else {
      const insert = {
        auth_user_id: userId,
        full_name,
        cpf: cleanCpf || null,
        phone: phone || null,
        email: email || null,
        profile_complete: true,
      };
      if (membroMatch) insert.membresia_id = membroMatch.id;
      const { data: created, error } = await supabase.from('vol_profiles').insert(insert).select().single();
      if (error) return res.status(400).json({ error: error.message });
      profileId = created.id;
    }

    const { data: updated } = await supabase.from('vol_profiles')
      .select('*').eq('id', profileId).single();

    res.json({
      profile: updated,
      membresiaMatch: membroMatch ? { id: membroMatch.id, nome: membroMatch.nome } : null,
    });
  } catch (e) {
    console.error('[Vol] update me error:', e.message);
    res.status(500).json({ error: 'Erro ao atualizar perfil' });
  }
});

// Cadastro obrigatório de membro disparado quando o CPF informado em PUT /me
// não existe em mem_membros. Cria o membro e vincula o vol_profile.
router.post('/me/register-member', async (req, res) => {
  try {
    const userId = req.user.userId;
    const { nome, sobrenome, cpf, celular } = req.body || {};

    if (!nome || !nome.trim()) return res.status(400).json({ error: 'Nome obrigatorio' });
    if (!sobrenome || !sobrenome.trim()) return res.status(400).json({ error: 'Sobrenome obrigatorio' });
    if (!cpf) return res.status(400).json({ error: 'CPF obrigatorio' });
    if (!celular || !celular.trim()) return res.status(400).json({ error: 'Celular obrigatorio' });

    const cleanCpf = String(cpf).replace(/\D/g, '');
    if (cleanCpf.length !== 11) return res.status(400).json({ error: 'CPF invalido' });
    const cleanPhone = String(celular).replace(/\D/g, '');
    if (cleanPhone.length < 10) return res.status(400).json({ error: 'Celular invalido' });

    const fullName = `${nome.trim()} ${sobrenome.trim()}`.replace(/\s+/g, ' ');

    // Guarda na origem: CPF→e-mail→(telefone+nome)→cria · não faz mais INSERT
    // cru (matcher compartilhado · colisão sem nome batendo vira fila do Kevyn).
    let membro;
    try {
      const r = await acharOuCriarGuardado({
        cpf: cleanCpf, telefone: cleanPhone, nome: fullName, status: 'visitante',
      });
      const { data } = await supabase.from('mem_membros')
        .select('id, nome, telefone, email').eq('id', r.membro_id).single();
      membro = data;
    } catch (e) {
      return res.status(400).json({ error: e.message });
    }

    // Buscar ou criar vol_profile e vincular
    let { data: profile } = await supabase.from('vol_profiles')
      .select('id').eq('auth_user_id', userId).maybeSingle();

    if (profile) {
      await supabase.from('vol_profiles').update({
        full_name: fullName,
        cpf: cleanCpf,
        phone: cleanPhone,
        membresia_id: membro.id,
        profile_complete: true,
      }).eq('id', profile.id);
    } else {
      const { data: created, error } = await supabase.from('vol_profiles').insert({
        auth_user_id: userId,
        full_name: fullName,
        cpf: cleanCpf,
        phone: cleanPhone,
        membresia_id: membro.id,
        profile_complete: true,
      }).select('id').single();
      if (error) return res.status(400).json({ error: error.message });
      profile = created;
    }

    const { data: updated } = await supabase.from('vol_profiles')
      .select('*').eq('id', profile.id).single();

    res.json({
      profile: updated,
      membresiaMatch: { id: membro.id, nome: membro.nome },
      created: true,
    });
  } catch (e) {
    console.error('[Vol] register member error:', e.message);
    res.status(500).json({ error: 'Erro ao cadastrar membro' });
  }
});

// Google Wallet — gera URL "Save to Google Wallet" com o QR pessoal do voluntário
router.get('/me/wallet/google', async (req, res) => {
  try {
    const userId = req.user.userId;

    const issuerId = process.env.GOOGLE_WALLET_ISSUER_ID;
    const serviceAccountEmail = process.env.GOOGLE_WALLET_SERVICE_ACCOUNT_EMAIL;
    const rawKey = process.env.GOOGLE_WALLET_PRIVATE_KEY || '';
    const privateKey = rawKey.replace(/\\n/g, '\n');

    if (!issuerId || !serviceAccountEmail || !privateKey) {
      return res.status(503).json({ error: 'Google Wallet não configurado' });
    }

    const { data: profile } = await supabase.from('vol_profiles')
      .select('id, full_name, qr_code').eq('auth_user_id', userId).maybeSingle();

    if (!profile) return res.status(404).json({ error: 'Perfil não encontrado' });
    if (!profile.qr_code) return res.status(400).json({ error: 'QR Code ainda não gerado para este perfil' });

    const jwt = require('jsonwebtoken');
    const classId = `${issuerId}.cbrio_voluntario_v1`;
    const objectId = `${issuerId}.vol_${profile.id.replace(/-/g, '_')}`;

    // ID legivel derivado do UUID do vol_profile (estavel, sem migration)
    const voluntarioId = `CBR-${profile.id.replace(/-/g, '').slice(0, 8).toUpperCase()}`;

    // Logo publica servida pelo frontend (Google busca pela internet para renderizar)
    const frontendUrl = (process.env.FRONTEND_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '')).replace(/\/+$/, '');
    const logoUrl = frontendUrl ? `${frontendUrl}/logo-cbrio-text.png` : 'https://sistema-cbrio.vercel.app/logo-cbrio-text.png';

    const genericObject = {
      id: objectId,
      classId: classId,
      genericType: 'GENERIC_OTHER',
      hexBackgroundColor: '#408097',
      logo: {
        sourceUri: { uri: logoUrl },
        contentDescription: { defaultValue: { language: 'pt-BR', value: 'CBRio' } },
      },
      cardTitle: { defaultValue: { language: 'pt-BR', value: 'CBRio' } },
      subheader: { defaultValue: { language: 'pt-BR', value: 'NOME' } },
      header: { defaultValue: { language: 'pt-BR', value: profile.full_name || 'Voluntario' } },
      textModulesData: [
        { id: 'vol_id', header: 'VOLUNTARIO ID', body: voluntarioId },
      ],
      barcode: { type: 'QR_CODE', value: profile.qr_code, alternateText: voluntarioId },
      state: 'ACTIVE',
    };

    const claims = {
      iss: serviceAccountEmail,
      aud: 'google',
      typ: 'savetowallet',
      iat: Math.floor(Date.now() / 1000),
      payload: { genericObjects: [genericObject] },
    };

    const token = jwt.sign(claims, privateKey, { algorithm: 'RS256' });
    res.json({ url: `https://pay.google.com/gp/v/save/${token}`, voluntarioId });
  } catch (err) {
    console.error('[Wallet] Google error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/voluntariado/me/wallet/apple — gera .pkpass para Apple Wallet (iOS)
router.get('/me/wallet/apple', async (req, res) => {
  try {
    const { buildVoluntarioPass } = require('../services/appleWallet');
    const userId = req.user.userId;

    const { data: profile } = await supabase.from('vol_profiles')
      .select('id, full_name, qr_code').eq('auth_user_id', userId).maybeSingle();

    if (!profile) return res.status(404).json({ error: 'Perfil não encontrado' });
    if (!profile.qr_code) return res.status(400).json({ error: 'QR Code ainda não gerado para este perfil' });

    const voluntarioId = `CBR-${profile.id.replace(/-/g, '').slice(0, 8).toUpperCase()}`;

    const pkpassBuffer = await buildVoluntarioPass({
      nome: profile.full_name,
      qrCode: profile.qr_code,
      voluntarioId,
    });

    res.setHeader('Content-Type', 'application/vnd.apple.pkpass');
    res.setHeader('Content-Disposition', `attachment; filename="cbrio-voluntario.pkpass"`);
    res.send(pkpassBuffer);
  } catch (err) {
    console.error('[Wallet] Apple error:', err.message);
    res.status(503).json({ error: 'Apple Wallet indisponível no momento.' });
  }
});

// Get my upcoming schedules
router.get('/my-schedules', async (req, res) => {
  try {
    const userId = req.user.userId;

    // Get vol_profile
    const { data: volProfile } = await supabase.from('vol_profiles')
      .select('id, planning_center_id').eq('auth_user_id', userId).maybeSingle();

    if (!volProfile) return res.json([]);

    // Build query conditions
    const conditions = [`volunteer_id.eq.${volProfile.id}`];
    if (volProfile.planning_center_id) {
      conditions.push(`planning_center_person_id.eq.${volProfile.planning_center_id}`);
    }

    const { data: schedules } = await supabase.from('vol_schedules')
      .select('*, service:vol_services!inner(*)')
      .or(conditions.join(','))
      .gte('service.scheduled_at', new Date().toISOString())
      .order('service(scheduled_at)', { ascending: true });

    // Attach check-in status
    const scheduleIds = (schedules || []).map(s => s.id);
    let checkIns = [];
    if (scheduleIds.length > 0) {
      const { data: ci } = await supabase.from('vol_check_ins').select('schedule_id').in('schedule_id', scheduleIds);
      checkIns = ci || [];
    }
    const checkedIds = new Set(checkIns.map(c => c.schedule_id));

    const result = (schedules || []).map(s => ({
      ...s,
      has_checkin: checkedIds.has(s.id),
    }));

    res.json(result);
  } catch (e) { res.status(500).json({ error: 'Erro ao buscar minhas escalas' }); }
});

// Respond to schedule (accept/decline)
router.post('/my-schedules/:id/respond', async (req, res) => {
  try {
    const { status } = req.body;
    if (!['confirmed', 'declined'].includes(status)) {
      return res.status(400).json({ error: 'Status deve ser confirmed ou declined' });
    }

    const { data, error } = await supabase.from('vol_schedules')
      .update({ confirmation_status: status })
      .eq('id', req.params.id)
      .select().single();

    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao responder escala' }); }
});

// Get all services for a year with my unavailability flags
router.get('/my-services', async (req, res) => {
  try {
    const { year } = req.query;
    const targetYear = parseInt(year || new Date().getFullYear());
    const userId = req.user.userId;

    const { data: volProfile } = await supabase.from('vol_profiles')
      .select('id').eq('auth_user_id', userId).maybeSingle();

    const { data: services, error } = await supabase.from('vol_services')
      .select('id, name, service_type_name, service_type_id, scheduled_at')
      .not('service_type_id', 'is', null)
      .gte('scheduled_at', `${targetYear}-01-01T00:00:00`)
      .lte('scheduled_at', `${targetYear}-12-31T23:59:59`)
      .order('scheduled_at');
    if (error) return res.status(400).json({ error: error.message });

    if (!volProfile) {
      return res.json((services || []).map(s => ({ ...s, is_unavailable: false, availability_id: null })));
    }

    const { data: unavailabilities } = await supabase.from('vol_availability')
      .select('id, service_id')
      .eq('volunteer_profile_id', volProfile.id)
      .not('service_id', 'is', null);

    const availabilityMap = new Map((unavailabilities || []).map(u => [u.service_id, u.id]));

    res.json((services || []).map(s => ({
      ...s,
      is_unavailable: availabilityMap.has(s.id),
      availability_id: availabilityMap.get(s.id) || null,
    })));
  } catch (e) { res.status(500).json({ error: 'Erro ao buscar cultos do voluntário' }); }
});

// Get my availability
router.get('/my-availability', async (req, res) => {
  try {
    const userId = req.user.userId;
    const { data: volProfile } = await supabase.from('vol_profiles')
      .select('id').eq('auth_user_id', userId).maybeSingle();
    if (!volProfile) return res.json([]);

    const { data, error } = await supabase.from('vol_availability')
      .select('*').eq('volunteer_profile_id', volProfile.id).order('unavailable_from');
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao buscar disponibilidade' }); }
});

// Set my availability (create unavailability)
// Aceita service_id (culto especifico) ou unavailable_from/unavailable_to (faixa de datas)
router.post('/my-availability', async (req, res) => {
  try {
    const userId = req.user.userId;
    const { service_id, unavailable_from, unavailable_to, reason } = req.body;

    const { data: volProfile } = await supabase.from('vol_profiles')
      .select('id').eq('auth_user_id', userId).maybeSingle();
    if (!volProfile) return res.status(404).json({ error: 'Perfil de voluntário não encontrado' });

    let fromDate = unavailable_from;
    let toDate = unavailable_to;

    if (service_id) {
      // Disponibilidade por culto especifico: busca a data do culto
      const { data: service } = await supabase.from('vol_services')
        .select('scheduled_at').eq('id', service_id).single();
      if (!service) return res.status(404).json({ error: 'Culto não encontrado' });
      fromDate = service.scheduled_at.split('T')[0];
      toDate = fromDate;
    }

    if (!fromDate) return res.status(400).json({ error: 'service_id ou datas obrigatórios' });

    const { data, error } = await supabase.from('vol_availability')
      .insert({ volunteer_profile_id: volProfile.id, service_id: service_id || null, unavailable_from: fromDate, unavailable_to: toDate, reason: reason || null })
      .select().single();
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao registrar indisponibilidade' }); }
});

// Delete my availability
router.delete('/my-availability/:id', async (req, res) => {
  try {
    const userId = req.user.userId;
    const { data: volProfile } = await supabase.from('vol_profiles')
      .select('id').eq('auth_user_id', userId).maybeSingle();
    if (!volProfile) return res.status(404).json({ error: 'Perfil não encontrado' });

    // Only delete own availability
    const { error } = await supabase.from('vol_availability')
      .delete().eq('id', req.params.id).eq('volunteer_profile_id', volProfile.id);
    if (error) return res.status(400).json({ error: error.message });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: 'Erro ao remover indisponibilidade' }); }
});

// Generate self-checkin token for a service (fixed QR code on totem)
router.get('/self-checkin-qr/:serviceId', async (req, res) => {
  try {
    const serviceId = req.params.serviceId;
    const { data: service } = await supabase.from('vol_services')
      .select('id, name, scheduled_at').eq('id', serviceId).single();
    if (!service) return res.status(404).json({ error: 'Culto não encontrado' });

    // The QR code payload is a URL to the self-checkin page
    const frontendUrl = process.env.FRONTEND_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:5173');
    const qrUrl = `${frontendUrl}/voluntariado/self-checkin?serviceId=${serviceId}`;

    res.json({ url: qrUrl, service });
  } catch (e) { res.status(500).json({ error: 'Erro ao gerar QR code' }); }
});

// ══════════════════════════════════════════════════════════════
// PROFILES
// ══════════════════════════════════════════════════════════════
router.get('/profiles', async (req, res) => {
  try {
    const { data, error } = await supabase.from('vol_profiles').select('*').order('full_name');
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao listar perfis' }); }
});

router.get('/profiles/:id', async (req, res) => {
  try {
    const { data, error } = await supabase.from('vol_profiles').select('*').eq('id', req.params.id).single();
    if (error) return res.status(404).json({ error: 'Perfil não encontrado' });
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao buscar perfil' }); }
});

// GET /profiles/:id/detalhe → detalhamento completo: serviços (frequência),
// check-ins, escalas e totais. Tudo desse voluntário.
router.get('/profiles/:id/detalhe', async (req, res) => {
  try {
    const id = req.params.id;
    const { data: profile, error: ep } = await supabase.from('vol_profiles').select('*').eq('id', id).single();
    if (ep || !profile) return res.status(404).json({ error: 'Perfil não encontrado' });

    // serviços (histórico de frequência · planilha + PCO)
    const { data: servicos } = await supabase.from('vol_servicos_historico')
      .select('data, culto_label, mes, origem').eq('vol_profile_id', id).is('deleted_at', null)
      .order('data', { ascending: false }).limit(1000);

    // check-ins (totem · inclui não escalados)
    const { data: checkins } = await supabase.from('vol_check_ins')
      .select('id, checked_in_at, method, is_unscheduled, service:vol_services(scheduled_at, service_type_name, name)')
      .eq('volunteer_id', id).order('checked_in_at', { ascending: false }).limit(500);

    // escalas (por volunteer_id OU planning_center_person_id)
    let escq = supabase.from('vol_schedules')
      .select('id, team_name, position_name, confirmation_status, service:vol_services(scheduled_at, service_type_name, name)');
    const pcid = /^\d+$/.test(String(profile.planning_center_id || '')) ? profile.planning_center_id : null;
    if (pcid) escq = escq.or(`volunteer_id.eq.${id},planning_center_person_id.eq.${pcid}`);
    else escq = escq.eq('volunteer_id', id);
    const { data: escalas } = await escq.limit(500);

    const norm1 = (x) => (Array.isArray(x) ? x[0] : x) || null;
    const servArr = servicos || [];
    const porCulto = {};
    for (const s of servArr) porCulto[s.culto_label] = (porCulto[s.culto_label] || 0) + 1;
    const d4 = new Date(); d4.setMonth(d4.getMonth() - 4);
    const desde4m = d4.toISOString().slice(0, 10);

    res.json({
      profile,
      servicos: servArr,
      checkins: (checkins || []).map((c) => ({ ...c, service: norm1(c.service) })),
      escalas: (escalas || []).map((e) => ({ ...e, service: norm1(e.service) })),
      totais: {
        total_servicos: servArr.length,
        servicos_4m: servArr.filter((s) => s.data >= desde4m).length,
        total_checkins: (checkins || []).length,
        ultimo_servico: servArr[0]?.data || null,
        por_culto: porCulto,
      },
    });
  } catch (e) {
    console.error('[vol] profile detalhe', e.message);
    res.status(500).json({ error: 'Erro ao carregar detalhe do voluntário' });
  }
});

router.post('/profiles', async (req, res) => {
  try {
    const { full_name, email, phone, cpf } = req.body;
    if (!full_name || !full_name.trim()) return res.status(400).json({ error: 'Nome obrigatorio' });
    const cleanCpf = cpf ? cpf.replace(/\D/g, '') : null;

    // Membresia e fonte única: garantir mem_membros antes de criar vol_profile
    let membresiaId = null;
    try {
      const { findOrCreateMembro } = require('./pessoas');
      const r = await findOrCreateMembro({
        cpf: cleanCpf, email, telefone: phone, nome: full_name.trim(),
        status: 'visitante',
      });
      membresiaId = r.membro_id;
    } catch (e) {
      console.error('voluntariado/profiles findOrCreateMembro:', e.message);
    }

    const { data, error } = await supabase.from('vol_profiles')
      .insert({
        full_name: full_name.trim(), email: email || null, phone: phone || null,
        cpf: cleanCpf || null, origem: 'manual', allocation_status: 'active',
        profile_complete: true, membresia_id: membresiaId,
      })
      .select().single();
    if (error) return res.status(400).json({ error: error.message });
    enqueueSync('voluntario', data.id, 'upsert').catch(() => {});
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao criar perfil' }); }
});

router.put('/profiles/:id', async (req, res) => {
  try {
    const { full_name, email, planning_center_id, avatar_url } = req.body;
    const { data, error } = await supabase.from('vol_profiles')
      .update({ full_name, email, planning_center_id, avatar_url }).eq('id', req.params.id).select().single();
    if (error) return res.status(400).json({ error: error.message });
    enqueueSync('voluntario', req.params.id, 'upsert').catch(() => {});
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao atualizar perfil' }); }
});

// ══════════════════════════════════════════════════════════════
// OPÇÕES DO FORMULÁRIO PÚBLICO ("Onde você quer servir")
// Editaveis pela equipe de voluntariado · alimentam /inscricao-voluntariado
// ══════════════════════════════════════════════════════════════
router.get('/form-opcoes', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('vol_form_opcoes')
      .select('*')
      .order('ordem', { ascending: true });
    if (error) return res.status(400).json({ error: error.message });
    res.json(data || []);
  } catch (e) { res.status(500).json({ error: 'Erro ao listar opções do formulário' }); }
});

router.post('/form-opcoes', authorizeModule('voluntariado', 3), async (req, res) => {
  try {
    const { label, area_canonica, exige_dados_menor, aviso_titulo, aviso_texto, ordem } = req.body || {};
    if (!label || !String(label).trim()) return res.status(400).json({ error: 'Informe o nome da opção' });
    const areas = ['kids', 'sede', 'ami', 'bridge', 'online'];
    const area = areas.includes(String(area_canonica)) ? String(area_canonica) : 'sede';
    // ordem default = fim da lista
    let ord = Number.isFinite(Number(ordem)) ? Number(ordem) : null;
    if (ord == null) {
      const { data: max } = await supabase
        .from('vol_form_opcoes').select('ordem').order('ordem', { ascending: false }).limit(1).maybeSingle();
      ord = (max?.ordem || 0) + 10;
    }
    const { data, error } = await supabase
      .from('vol_form_opcoes')
      .insert({
        label: String(label).trim(),
        area_canonica: area,
        exige_dados_menor: !!exige_dados_menor,
        aviso_titulo: aviso_titulo ? String(aviso_titulo).trim() : null,
        aviso_texto: aviso_texto ? String(aviso_texto).trim() : null,
        ordem: ord,
      })
      .select('*').single();
    if (error) {
      if (error.code === '23505') return res.status(400).json({ error: 'Já existe uma opção com esse nome' });
      return res.status(400).json({ error: error.message });
    }
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao criar opção do formulário' }); }
});

router.put('/form-opcoes/:id', authorizeModule('voluntariado', 3), async (req, res) => {
  try {
    const { label, area_canonica, exige_dados_menor, aviso_titulo, aviso_texto, ordem, ativo } = req.body || {};
    const patch = { updated_at: new Date().toISOString() };
    if (label !== undefined) patch.label = String(label).trim();
    if (area_canonica !== undefined) {
      const areas = ['kids', 'sede', 'ami', 'bridge', 'online'];
      patch.area_canonica = areas.includes(String(area_canonica)) ? String(area_canonica) : 'sede';
    }
    if (exige_dados_menor !== undefined) patch.exige_dados_menor = !!exige_dados_menor;
    if (aviso_titulo !== undefined) patch.aviso_titulo = aviso_titulo ? String(aviso_titulo).trim() : null;
    if (aviso_texto !== undefined) patch.aviso_texto = aviso_texto ? String(aviso_texto).trim() : null;
    if (ordem !== undefined && Number.isFinite(Number(ordem))) patch.ordem = Number(ordem);
    if (ativo !== undefined) patch.ativo = !!ativo;
    const { data, error } = await supabase
      .from('vol_form_opcoes').update(patch).eq('id', req.params.id).select('*').single();
    if (error) {
      if (error.code === '23505') return res.status(400).json({ error: 'Já existe uma opção com esse nome' });
      return res.status(400).json({ error: error.message });
    }
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao atualizar opção do formulário' }); }
});

router.delete('/form-opcoes/:id', authorizeModule('voluntariado', 3), async (req, res) => {
  try {
    const { error } = await supabase.from('vol_form_opcoes').delete().eq('id', req.params.id);
    if (error) return res.status(400).json({ error: error.message });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: 'Erro ao remover opção do formulário' }); }
});

// ══════════════════════════════════════════════════════════════
// USER ROLES
// ══════════════════════════════════════════════════════════════
router.get('/roles', async (req, res) => {
  try {
    const { data, error } = await supabase.from('vol_user_roles').select('*');
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao listar roles' }); }
});

router.post('/roles', async (req, res) => {
  try {
    const { profile_id, role } = req.body;
    if (!profile_id || !role) return res.status(400).json({ error: 'profile_id e role obrigatórios' });
    const { data, error } = await supabase.from('vol_user_roles').insert({ profile_id, role }).select().single();
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao adicionar role' }); }
});

router.delete('/roles/:profileId/:role', async (req, res) => {
  try {
    const { error } = await supabase.from('vol_user_roles')
      .delete().eq('profile_id', req.params.profileId).eq('role', req.params.role);
    if (error) return res.status(400).json({ error: error.message });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: 'Erro ao remover role' }); }
});

// ══════════════════════════════════════════════════════════════
// CPF / MEMBRESIA UNIFICATION ENDPOINTS
// ══════════════════════════════════════════════════════════════

// GET /vol-by-membro/:membroId — vol_profile linked to a mem_membros record
router.get('/vol-by-membro/:membroId', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('vol_profiles')
      .select('id, full_name, allocation_status, origem, cpf, team_members:vol_team_members(id, team:vol_teams(id, name, color))')
      .eq('membresia_id', req.params.membroId)
      .maybeSingle();
    if (error) return res.status(400).json({ error: error.message });
    res.json(data || null);
  } catch (e) { res.status(500).json({ error: 'Erro ao buscar perfil do voluntário' }); }
});

// POST /quero-servir — member opts in; creates or links vol_profile
router.post('/quero-servir', async (req, res) => {
  try {
    const { membro_id } = req.body;
    if (!membro_id) return res.status(400).json({ error: 'membro_id obrigatorio' });

    // Load membro data
    const { data: membro, error: memErr } = await supabase
      .from('mem_membros')
      .select('id, nome, cpf, email')
      .eq('id', membro_id)
      .single();
    if (memErr || !membro) return res.status(404).json({ error: 'Membro não encontrado' });

    const cleanCpf = membro.cpf ? membro.cpf.replace(/\D/g, '') : null;
    let volProfile = null;

    // 1. Try to find existing vol_profile by membresia_id
    const { data: byMembro } = await supabase
      .from('vol_profiles')
      .select('id, allocation_status, cpf')
      .eq('membresia_id', membro_id)
      .maybeSingle();

    if (byMembro) {
      // Already linked — just ensure waiting_allocation if not yet active in a team
      const hasTeam = await supabase.from('vol_team_members')
        .select('id').eq('volunteer_profile_id', byMembro.id).limit(1);
      const newStatus = hasTeam.data?.length > 0 ? 'active' : 'waiting_allocation';
      await supabase.from('vol_profiles').update({
        membresia_id: membro_id,
        origem: 'membresia',
        allocation_status: newStatus,
      }).eq('id', byMembro.id);
      const { data: updated } = await supabase.from('vol_profiles').select('*').eq('id', byMembro.id).single();
      volProfile = updated;
    } else if (cleanCpf) {
      // 2. Try to find by CPF
      const { data: byCpf } = await supabase
        .from('vol_profiles')
        .select('id, allocation_status')
        .eq('cpf', cleanCpf)
        .maybeSingle();

      if (byCpf) {
        // Link existing vol_profile to this membro
        await supabase.from('vol_profiles').update({
          membresia_id: membro_id,
          origem: 'membresia',
          allocation_status: 'waiting_allocation',
        }).eq('id', byCpf.id);
        const { data: updated } = await supabase.from('vol_profiles').select('*').eq('id', byCpf.id).single();
        volProfile = updated;
      } else {
        // 3. Create new vol_profile
        const { data: created, error: createErr } = await supabase
          .from('vol_profiles')
          .insert({
            full_name: membro.nome,
            cpf: cleanCpf,
            email: membro.email,
            membresia_id: membro_id,
            origem: 'membresia',
            allocation_status: 'waiting_allocation',
            profile_complete: false,
          })
          .select('*')
          .single();
        if (createErr) return res.status(400).json({ error: createErr.message });
        volProfile = created;
      }
    } else {
      // No CPF — create anyway, admin will fill later
      const { data: created, error: createErr } = await supabase
        .from('vol_profiles')
        .insert({
          full_name: membro.nome,
          email: membro.email,
          membresia_id: membro_id,
          origem: 'membresia',
          allocation_status: 'waiting_allocation',
          profile_complete: false,
        })
        .select('*')
        .single();
      if (createErr) return res.status(400).json({ error: createErr.message });
      volProfile = created;
    }

    // Mark membro as wanting to serve
    await supabase.from('mem_membros').update({ quer_servir: true }).eq('id', membro_id);

    res.json({ success: true, vol_profile: volProfile });
  } catch (e) {
    console.error('[QUERO SERVIR]', e.message);
    res.status(500).json({ error: 'Erro ao registrar interesse em servir' });
  }
});

// GET /waiting-allocation — volunteers waiting for team assignment
router.get('/waiting-allocation', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('vol_profiles')
      .select(`
        id, full_name, email, cpf, avatar_url, origem, membresia_id, created_at,
        team_members:vol_team_members(id, team:vol_teams(id, name, color))
      `)
      .eq('allocation_status', 'waiting_allocation')
      .order('created_at', { ascending: true });
    if (error) return res.status(400).json({ error: error.message });
    res.json(data || []);
  } catch (e) { res.status(500).json({ error: 'Erro ao listar fila de alocacao' }); }
});

// POST /allocate/:id — admin assigns volunteer to a team
router.post('/allocate/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { team_id, position_id } = req.body;
    if (!team_id) return res.status(400).json({ error: 'team_id obrigatorio' });

    // Verify vol_profile exists and get name (required by vol_team_members.volunteer_name NOT NULL)
    const { data: vol } = await supabase
      .from('vol_profiles')
      .select('id, full_name, planning_center_id')
      .eq('id', id)
      .maybeSingle();
    if (!vol) return res.status(404).json({ error: 'Voluntário não encontrado' });

    // Add to team (upsert to avoid duplicate)
    const { error: tmErr } = await supabase.from('vol_team_members')
      .upsert({
        volunteer_profile_id: id,
        team_id,
        position_id: position_id || null,
        volunteer_name: vol.full_name || 'Sem nome',
        planning_center_person_id: vol.planning_center_id || null,
      }, { onConflict: 'volunteer_profile_id,team_id', ignoreDuplicates: false });
    if (tmErr) return res.status(400).json({ error: tmErr.message });

    // Mark as active
    await supabase.from('vol_profiles').update({ allocation_status: 'active' }).eq('id', id);

    res.json({ success: true });
  } catch (e) {
    console.error('[ALLOCATE]', e.message);
    res.status(500).json({ error: 'Erro ao alocar voluntário' });
  }
});

// ══════════════════════════════════════════════════════════════
// VOLUNTEERS POOL — all active vol_profiles with team memberships
// Used by the schedule builder popup. Cached on the client (5 min staleTime).
// ══════════════════════════════════════════════════════════════
router.get('/volunteers-pool', async (req, res) => {
  try {
    // Pagina pra contornar o cap de 1000 do PostgREST (número real · 1 a 1).
    let all = []; let offset = 0;
    while (true) {
      const { data, error } = await supabase
        .from('vol_profiles')
        .select(`
          id, full_name, email, avatar_url, planning_center_id, qr_code, phone, cpf,
          team_members:vol_team_members(
            id, team_id, position_id,
            team:vol_teams(id, name, color),
            position:vol_positions(id, name)
          )
        `)
        .order('full_name').range(offset, offset + 999);
      if (error) return res.status(400).json({ error: error.message });
      if (!data || !data.length) break;
      all = all.concat(data);
      if (data.length < 1000) break;
      offset += 1000;
    }
    res.json(all);
  } catch (e) { res.status(500).json({ error: 'Erro ao listar pool de voluntários' }); }
});

// ══════════════════════════════════════════════════════════════
// SERVICES
// ══════════════════════════════════════════════════════════════
// Anexa scheduled_count em cada culto consultando vol_schedules de uma vez.
async function attachScheduledCount(services) {
  if (!services || services.length === 0) return services || [];
  const ids = services.map(s => s.id);
  try {
    const { data: counts } = await supabase
      .from('vol_schedules')
      .select('service_id')
      .in('service_id', ids);
    const countMap = (counts || []).reduce((acc, r) => {
      acc[r.service_id] = (acc[r.service_id] || 0) + 1;
      return acc;
    }, {});
    return services.map(s => ({ ...s, scheduled_count: countMap[s.id] || 0 }));
  } catch {
    return services.map(s => ({ ...s, scheduled_count: 0 }));
  }
}

router.get('/services', async (req, res) => {
  try {
    const { data, error } = await supabase.from('vol_services').select('*').order('scheduled_at', { ascending: true });
    if (error) return res.status(400).json({ error: error.message });
    res.json(await attachScheduledCount(data));
  } catch (e) { res.status(500).json({ error: 'Erro ao listar cultos' }); }
});

router.get('/services/upcoming', async (req, res) => {
  try {
    const { data, error } = await supabase.from('vol_services').select('*')
      .gte('scheduled_at', new Date().toISOString()).order('scheduled_at').limit(10);
    if (error) return res.status(400).json({ error: error.message });
    res.json(await attachScheduledCount(data));
  } catch (e) { res.status(500).json({ error: 'Erro ao listar próximos cultos' }); }
});

router.get('/services/today', async (req, res) => {
  try {
    // "Hoje" em BRT: derivado da data atual na TZ America/Sao_Paulo (UTC-3 estavel).
    const nowBRT = new Date(Date.now() - 3 * 60 * 60 * 1000);
    const y = nowBRT.getUTCFullYear();
    const m = String(nowBRT.getUTCMonth() + 1).padStart(2, '0');
    const d = String(nowBRT.getUTCDate()).padStart(2, '0');
    const start = `${y}-${m}-${d}T00:00:00-03:00`;
    const end = `${y}-${m}-${d}T23:59:59-03:00`;
    const { data, error } = await supabase.from('vol_services').select('*')
      .gte('scheduled_at', start).lte('scheduled_at', end).order('scheduled_at');
    if (error) return res.status(400).json({ error: error.message });
    res.json(await attachScheduledCount(data));
  } catch (e) { res.status(500).json({ error: 'Erro ao listar cultos de hoje' }); }
});

// Janela de check-in · cultos do período (passado recente + próximos) pra
// permitir check-in FORA do dia do culto — totem e self check-in usam isto pra
// listar cultos futuros (ex.: a Quarta de amanhã ou o Domingo que vem). Janela
// limitada (bounded) pra não estourar o cap do PostgREST no attachScheduledCount.
router.get('/services/checkin-window', async (req, res) => {
  try {
    const back = Math.min(Math.max(Number(req.query.back) || 21, 0), 120);
    const ahead = Math.min(Math.max(Number(req.query.ahead) || 35, 1), 120);
    const from = new Date(Date.now() - back * 864e5).toISOString();
    const to = new Date(Date.now() + ahead * 864e5).toISOString();
    const { data, error } = await supabase.from('vol_services').select('*')
      .gte('scheduled_at', from).lte('scheduled_at', to).order('scheduled_at');
    if (error) return res.status(400).json({ error: error.message });
    res.json(await attachScheduledCount(data));
  } catch (e) { res.status(500).json({ error: 'Erro ao listar cultos do período' }); }
});

// ══════════════════════════════════════════════════════════════
// SCHEDULES
// ══════════════════════════════════════════════════════════════
router.get('/schedules', async (req, res) => {
  try {
    const { service_id, volunteer_id } = req.query;
    let q = supabase.from('vol_schedules').select('*, service:vol_services(*)').order('team_name');
    if (service_id) q = q.eq('service_id', service_id);
    if (volunteer_id) q = q.eq('volunteer_id', volunteer_id);
    const { data, error } = await q;
    if (error) return res.status(400).json({ error: error.message });

    // Attach check_ins
    const scheduleIds = data.map(s => s.id);
    let checkIns = [];
    if (scheduleIds.length > 0) {
      const { data: ci } = await supabase.from('vol_check_ins').select('*').in('schedule_id', scheduleIds);
      checkIns = ci || [];
    }
    const result = data.map(s => ({ ...s, check_in: checkIns.find(c => c.schedule_id === s.id) || null }));
    res.json(result);
  } catch (e) { res.status(500).json({ error: 'Erro ao listar escalas' }); }
});

// ══════════════════════════════════════════════════════════════
// CHECK-INS
// ══════════════════════════════════════════════════════════════
router.get('/check-ins', async (req, res) => {
  try {
    const { service_id, volunteer_id, is_unscheduled } = req.query;
    let q = supabase.from('vol_check_ins').select('*, volunteer:vol_profiles(id, full_name, planning_center_id), schedule:vol_schedules(id, volunteer_name, volunteer_id, team_name, position_name), service:vol_services(id, name, scheduled_at)')
      .order('checked_in_at', { ascending: false });
    if (service_id) q = q.eq('service_id', service_id);
    if (volunteer_id) q = q.eq('volunteer_id', volunteer_id);
    if (is_unscheduled === 'true') q = q.eq('is_unscheduled', true);
    const { data, error } = await q;
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao listar check-ins' }); }
});

router.post('/check-ins', async (req, res) => {
  try {
    const { schedule_id, volunteer_id, service_id, method, is_unscheduled, checked_in_at, novo_cadastro } = req.body;
    if (!method) return res.status(400).json({ error: 'method obrigatorio' });

    // Hora real do check-in (preserva o horário de check-ins feitos OFFLINE no
    // totem, que só chegam aqui na sincronização posterior). Aceita só uma data
    // válida, não futura (tolera 5 min de skew) e dos últimos 7 dias; senão usa
    // o default now() do banco.
    let checkedInAt = null;
    if (checked_in_at) {
      const t = new Date(checked_in_at);
      const ms = t.getTime();
      if (!Number.isNaN(ms)) {
        const now = Date.now();
        if (ms <= now + 5 * 60 * 1000 && ms >= now - 7 * 24 * 60 * 60 * 1000) {
          checkedInAt = t.toISOString();
        }
      }
    }

    // Resolve a escala da pessoa neste culto e VINCULA o schedule_id — o servidor
    // é a autoridade. Escalas do Planning Center costumam ter volunteer_id NULO,
    // então casa também por planning_center_id e por nome (não só volunteer_id).
    // Se achar uma escala, grava o schedule_id e marca como escalado (corrige o
    // palpite do cliente, que erra quando o totem não encontra a escala). Só fica
    // "sem escala" quando NÃO existe escala casável. Mantém o service_id (não
    // cruza serviço duplicado aqui — isso é tratado como dedup à parte).
    const norm = (s) => (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
    const dateSP = (iso) => { try { return new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }); } catch { return (iso || '').slice(0, 10); } };
    const periodoSP = (iso) => { try { const h = Number(new Date(iso).toLocaleString('en-GB', { timeZone: 'America/Sao_Paulo', hour: '2-digit', hour12: false }).slice(0, 2)); return h < 14 ? 'manha' : 'noite'; } catch { return 'noite'; } };

    let resolvedScheduleId = schedule_id || null;
    let resolvedUnscheduled = is_unscheduled;
    let resolvedVolunteerId = volunteer_id || null;

    // BLOCO/DIA (2026-06-22): o volunt\u00e1rio da manh\u00e3 serve a manh\u00e3 inteira
    // (08:30/10:00/11:30 = 3 cultos) com UM check-in. Ent\u00e3o o match da escala
    // olha TODOS os cultos do mesmo DIA (prioriza o mesmo bloco manh\u00e3/noite) e o
    // dedup olha o BLOCO \u2014 sem isso, quem est\u00e1 escalado \u00e0s 08:30 e bate o QR \u00e0s
    // 10:00 ca\u00eda como "sem escala" e aparecia como "volunt\u00e1rio" no relat\u00f3rio.
    // Tamb\u00e9m resolve o volunteer_id pela escala quando o check-in n\u00e3o trouxe (PCO).
    // N\u00c3O mexe em cultos/Integra\u00e7\u00e3o \u2014 \u00e9 s\u00f3 controle do voluntariado.
    if (service_id) {
      const { data: ciSvc } = await supabase.from('vol_services').select('scheduled_at').eq('id', service_id).maybeSingle();
      const ciDate = ciSvc?.scheduled_at ? dateSP(ciSvc.scheduled_at) : null;
      const ciPer = ciSvc?.scheduled_at ? periodoSP(ciSvc.scheduled_at) : null;

      if (ciDate) {
        const { data: svcsDia } = await supabase.from('vol_services')
          .select('id, scheduled_at')
          .gte('scheduled_at', `${ciDate}T00:00:00-03:00`).lt('scheduled_at', `${ciDate}T23:59:59-03:00`);
        const idsDia = (svcsDia || []).map(s => s.id);
        const idsBloco = (svcsDia || []).filter(s => periodoSP(s.scheduled_at) === ciPer).map(s => s.id);

        // DEDUP por bloco: 1 check-in cobre a manh\u00e3 (ou a noite) inteira.
        if (volunteer_id && idsBloco.length) {
          const { data: jaTem } = await supabase.from('vol_check_ins')
            .select('id, checked_in_at, method, volunteer:vol_profiles(full_name), schedule:vol_schedules(volunteer_name)')
            .eq('volunteer_id', volunteer_id).in('service_id', idsBloco)
            .order('checked_in_at', { ascending: true }).limit(1);
          if (jaTem && jaTem[0]) {
            const ex = jaTem[0];
            return res.status(409).json({
              error: 'Check-in j\u00e1 foi realizado', alreadyCheckedIn: true,
              volunteerName: ex.volunteer?.full_name || ex.schedule?.volunteer_name || null,
              checkedInAt: ex.checked_in_at, method: ex.method,
            });
          }
        }

        // MATCH da escala no DIA inteiro (prioriza o mesmo bloco).
        if (!resolvedScheduleId && idsDia.length) {
          let vp = null;
          if (volunteer_id) ({ data: vp } = await supabase.from('vol_profiles').select('planning_center_id, full_name').eq('id', volunteer_id).maybeSingle());
          const vpName = norm(vp?.full_name);
          const { data: scheds } = await supabase.from('vol_schedules')
            .select('id, volunteer_id, planning_center_person_id, volunteer_name, service_id').in('service_id', idsDia);
          const casa = (s) => (
            (volunteer_id && s.volunteer_id && s.volunteer_id === volunteer_id) ||
            (vp?.planning_center_id && s.planning_center_person_id && s.planning_center_person_id === vp.planning_center_id) ||
            (vpName && norm(s.volunteer_name) === vpName)
          );
          const match = (scheds || []).filter(s => idsBloco.includes(s.service_id)).find(casa) || (scheds || []).find(casa);
          if (match) {
            resolvedScheduleId = match.id;
            resolvedUnscheduled = false;
            if (!resolvedVolunteerId && match.volunteer_id) resolvedVolunteerId = match.volunteer_id;
          } else if (resolvedUnscheduled === undefined) {
            resolvedUnscheduled = true;
          }
        }
      }
    }

    const { data, error } = await supabase.from('vol_check_ins')
      .insert({
        schedule_id: resolvedScheduleId,
        volunteer_id: resolvedVolunteerId,
        service_id: service_id || null,
        checked_in_by: req.user.userId,
        method,
        is_unscheduled: resolvedUnscheduled || false,
        ...(checkedInAt ? { checked_in_at: checkedInAt } : {}),
      }).select().single();

    if (error) {
      if (error.code === '23505') {
        // Fetch volunteer name from the existing check-in for a better UX message
        let volunteerName = null;
        let checkedInAt = null;
        let existingMethod = null;
        try {
          let existing = null;
          if (resolvedScheduleId) {
            const r = await supabase.from('vol_check_ins')
              .select('checked_in_at, method, volunteer:vol_profiles(full_name), schedule:vol_schedules(volunteer_name)')
              .eq('schedule_id', resolvedScheduleId).maybeSingle();
            existing = r.data;
            volunteerName = existing?.volunteer?.full_name || existing?.schedule?.volunteer_name || null;
          } else if (volunteer_id && service_id) {
            const r = await supabase.from('vol_check_ins')
              .select('checked_in_at, method, volunteer:vol_profiles(full_name)')
              .eq('volunteer_id', volunteer_id).eq('service_id', service_id)
              .eq('is_unscheduled', true).limit(1);
            existing = r.data?.[0] || null;
            volunteerName = existing?.volunteer?.full_name || null;
          }
          checkedInAt = existing?.checked_in_at || null;
          existingMethod = existing?.method || null;
          // Fallback: fetch name from vol_profiles if still null
          if (!volunteerName && volunteer_id) {
            const { data: v } = await supabase.from('vol_profiles').select('full_name').eq('id', volunteer_id).maybeSingle();
            volunteerName = v?.full_name || null;
          }
        } catch {}
        return res.status(409).json({
          error: 'Check-in já foi realizado',
          alreadyCheckedIn: true,
          volunteerName,
          checkedInAt,
          method: existingMethod,
        });
      }
      return res.status(400).json({ error: error.message });
    }

    // Confirm schedule if pending (usa a escala resolvida · pode ter sido
    // vinculada agora via planning_center_id/nome)
    if (resolvedScheduleId) {
      await supabase.from('vol_schedules')
        .update({ confirmation_status: 'confirmed' }).eq('id', resolvedScheduleId).eq('confirmation_status', 'pending');
    }

    // Sinaliza ao operador se o voluntário ainda não tem CPF cadastrado, pra
    // oferecer a captura logo após o check-in (frente 2 da unificacao).
    let needsCpf = false;
    let volProfileName = null;
    // resolvedVolunteerId já resolvido acima (inclui o volunteer_id da escala
    // casada por dia/bloco). Fallback final pela escala explícita do cliente.
    if (!resolvedVolunteerId && (resolvedScheduleId || schedule_id)) {
      const { data: sch } = await supabase.from('vol_schedules')
        .select('volunteer_id').eq('id', resolvedScheduleId || schedule_id).maybeSingle();
      resolvedVolunteerId = sch?.volunteer_id || null;
    }
    if (resolvedVolunteerId) {
      const { data: vp } = await supabase.from('vol_profiles')
        .select('cpf, full_name').eq('id', resolvedVolunteerId).maybeSingle();
      needsCpf = !!vp && !vp.cpf;
      volProfileName = vp?.full_name || null;
    }

    // Sinaliza pra coordenação quando o totem cadastra um voluntário NOVO na
    // hora e marca presença sem escala — precisa de revisão (pessoa real?
    // duplicado? completar cadastro). Fire-and-forget · não quebra o check-in.
    if (novo_cadastro && resolvedVolunteerId) {
      notificar({
        modulo: 'voluntariado', tipo: 'vol_checkin_novo_sem_escala',
        titulo: 'Novo voluntário cadastrado no totem',
        mensagem: `${volProfileName || 'Voluntário'} foi cadastrado no totem e marcado presente sem escala. Revise o cadastro (dados, possível duplicado).`,
        link: '/voluntariado', severidade: 'aviso',
        chaveDedup: `vol_novo_totem_${resolvedVolunteerId}_${service_id || ''}`,
      }).catch((e) => console.warn('[checkin novo notify]', e.message));
    }

    res.json({ ...data, isUnscheduled: !!resolvedUnscheduled, volunteer_id: resolvedVolunteerId, needs_cpf: needsCpf });
  } catch (e) { res.status(500).json({ error: 'Erro ao registrar check-in' }); }
});

// Backfill: religa check-ins históricos que ficaram "sem escala" por causa do
// match antigo (por culto exato em vez do dia/bloco). Reaplica o match por DIA
// (volunteer_id / planning_center / nome) e, se achar a escala, marca como
// escalado + vincula schedule_id + resolve volunteer_id. Idempotente; respeita
// o unique de schedule_id (não rouba escala já usada). Só voluntariado.
router.post('/check-ins/rematch', authorizeModule('voluntariado', 3), async (req, res) => {
  try {
    const norm = (s) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
    const dateSP = (iso) => { try { return new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }); } catch { return (iso || '').slice(0, 10); } };

    const { data: cis } = await supabase.from('vol_check_ins')
      .select('id, volunteer_id, service_id, schedule_id, is_unscheduled, volunteer:vol_profiles(planning_center_id, full_name), service:vol_services(scheduled_at)')
      .or('is_unscheduled.eq.true,schedule_id.is.null')
      .not('service_id', 'is', null)
      .limit(5000);

    // escalas já usadas (pra não violar o unique de schedule_id)
    const schedTaken = new Set();
    const { data: usados } = await supabase.from('vol_check_ins').select('schedule_id').eq('is_unscheduled', false).not('schedule_id', 'is', null).limit(20000);
    (usados || []).forEach(u => u.schedule_id && schedTaken.add(u.schedule_id));

    const porData = new Map();
    for (const ci of cis || []) {
      const d = ci.service?.scheduled_at ? dateSP(ci.service.scheduled_at) : null;
      if (!d) continue;
      if (!porData.has(d)) porData.set(d, []);
      porData.get(d).push(ci);
    }

    let religados = 0, semMatch = 0;
    for (const [d, lista] of porData) {
      const { data: svcsDia } = await supabase.from('vol_services').select('id, scheduled_at')
        .gte('scheduled_at', `${d}T00:00:00-03:00`).lt('scheduled_at', `${d}T23:59:59-03:00`);
      const idsDia = (svcsDia || []).map(s => s.id);
      if (!idsDia.length) { semMatch += lista.length; continue; }
      const { data: scheds } = await supabase.from('vol_schedules')
        .select('id, volunteer_id, planning_center_person_id, volunteer_name, service_id').in('service_id', idsDia);
      for (const ci of lista) {
        const vpName = norm(ci.volunteer?.full_name);
        const pcid = ci.volunteer?.planning_center_id;
        const match = (scheds || []).find(s => !schedTaken.has(s.id) && (
          (ci.volunteer_id && s.volunteer_id && s.volunteer_id === ci.volunteer_id) ||
          (pcid && s.planning_center_person_id && s.planning_center_person_id === pcid) ||
          (vpName && norm(s.volunteer_name) === vpName)
        ));
        if (!match) { semMatch++; continue; }
        const upd = { is_unscheduled: false, schedule_id: match.id };
        if (!ci.volunteer_id && match.volunteer_id) upd.volunteer_id = match.volunteer_id;
        const { error } = await supabase.from('vol_check_ins').update(upd).eq('id', ci.id);
        if (error) { semMatch++; continue; }
        schedTaken.add(match.id);
        religados++;
      }
    }
    res.json({ ok: true, analisados: (cis || []).length, religados, sem_match: semMatch });
  } catch (e) {
    console.error('[vol checkin rematch]', e.message);
    res.status(500).json({ error: e.message || 'Erro no rematch' });
  }
});

// Manutenção: apaga vol_services VAZIOS gerados a partir dos vol_service_types
// (service_type_id NOT NULL · 0 escala · 0 check-in). São os duplicados do botão
// "gerar serviços do ano" — as escalas reais vêm do Planning Center ("Domingo -
// Manhã", "Culto AMI"...). NÃO toca em serviços com escala/check-in nem nos do
// PCO (service_type_id NULL). ?dry=1 só conta. Idempotente.
router.post('/services/limpar-vazios', authorizeModule('voluntariado', 3), async (req, res) => {
  try {
    const { data: alvos } = await supabase.from('vol_services').select('id').not('service_type_id', 'is', null).limit(5000);
    const ids = [];
    for (const s of alvos || []) {
      const [{ count: ne }, { count: nc }] = await Promise.all([
        supabase.from('vol_schedules').select('id', { count: 'exact', head: true }).eq('service_id', s.id),
        supabase.from('vol_check_ins').select('id', { count: 'exact', head: true }).eq('service_id', s.id),
      ]);
      if (!ne && !nc) ids.push(s.id);
    }
    if (req.query.dry === '1') return res.json({ ok: true, dry: true, vazios: ids.length });
    let apagados = 0;
    for (let i = 0; i < ids.length; i += 200) {
      const lote = ids.slice(i, i + 200);
      // limpa indisponibilidades órfãs e apaga
      await supabase.from('vol_availability').delete().in('service_id', lote);
      const { error } = await supabase.from('vol_services').delete().in('id', lote);
      if (!error) apagados += lote.length;
    }
    res.json({ ok: true, apagados });
  } catch (e) {
    console.error('[vol limpar-vazios]', e.message);
    res.status(500).json({ error: e.message || 'Erro ao limpar serviços vazios' });
  }
});

// Acha-ou-cria o vol_services de um vol_service_type numa data (BRT). Usado pra
// materializar os cultos da manhã sob demanda (só quando alguém marca presença).
async function ensureServiceDoTipo(typeId, dateStr) {
  const ini = `${dateStr}T00:00:00-03:00`, fim = `${dateStr}T23:59:59-03:00`;
  const { data: ex } = await supabase.from('vol_services').select('id')
    .eq('service_type_id', typeId).gte('scheduled_at', ini).lte('scheduled_at', fim).limit(1);
  if (ex && ex[0]) return ex[0].id;
  const { data: t } = await supabase.from('vol_service_types').select('name, recurrence_time').eq('id', typeId).maybeSingle();
  if (!t) return null;
  const hhmm = String(t.recurrence_time || '08:00').slice(0, 5);
  const { data: svc } = await supabase.from('vol_services')
    .insert({ name: t.name, service_type_name: t.name, service_type_id: typeId, scheduled_at: `${dateStr}T${hhmm}:00-03:00` })
    .select('id').single();
  return svc?.id || null;
}

// GET /cultos-manha — os tipos de culto de DOMINGO de MANHÃ (08:30/10:00/11:30),
// pro check-in oferecer como checkbox. (recurrence_day=0 · antes das 14h)
router.get('/cultos-manha', async (req, res) => {
  try {
    const { data } = await supabase.from('vol_service_types')
      .select('id, name, recurrence_time')
      .eq('recurrence_day', 0).eq('is_active', true).lt('recurrence_time', '14:00:00')
      .order('recurrence_time');
    res.json((data || []).map(t => ({ id: t.id, name: t.name, recurrence_time: t.recurrence_time })));
  } catch (e) { res.status(500).json({ error: 'Erro ao listar cultos da manhã' }); }
});

// POST /check-ins/manha — marca presença do voluntário em VÁRIOS cultos da manhã
// de uma vez (o operador/voluntário escolhe os horários no checkbox). Cria o
// vol_services sob demanda e 1 check-in por culto marcado, casando a escala do
// dia ("Domingo - Manhã" do PCO). Idempotente por (volunteer, service).
router.post('/check-ins/manha', async (req, res) => {
  try {
    const { volunteer_id, service_date, service_type_ids, method, checked_in_at } = req.body || {};
    if (!method || !service_date || !Array.isArray(service_type_ids) || !service_type_ids.length) {
      return res.status(400).json({ error: 'volunteer_id, service_date, service_type_ids[] e method obrigatórios' });
    }
    let checkedInAt = null;
    if (checked_in_at) { const t = new Date(checked_in_at); if (!Number.isNaN(t.getTime())) { const now = Date.now(); if (t.getTime() <= now + 3e5 && t.getTime() >= now - 7 * 864e5) checkedInAt = t.toISOString(); } }

    // materializa os serviços dos cultos marcados
    const svcIds = [];
    for (const tid of service_type_ids) { const id = await ensureServiceDoTipo(tid, service_date); if (id) svcIds.push(id); }
    if (!svcIds.length) return res.status(400).json({ error: 'Nenhum culto válido' });

    // casa a escala do voluntário no DIA (a escala do PCO é "Domingo - Manhã")
    const norm = (s) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
    let resolvedScheduleId = null, resolvedVolunteerId = volunteer_id || null;
    if (volunteer_id) {
      const { data: svcsDia } = await supabase.from('vol_services').select('id')
        .gte('scheduled_at', `${service_date}T00:00:00-03:00`).lt('scheduled_at', `${service_date}T23:59:59-03:00`);
      const idsDia = (svcsDia || []).map(s => s.id);
      const { data: vp } = await supabase.from('vol_profiles').select('planning_center_id, full_name').eq('id', volunteer_id).maybeSingle();
      const vpName = norm(vp?.full_name);
      if (idsDia.length) {
        const { data: scheds } = await supabase.from('vol_schedules')
          .select('id, volunteer_id, planning_center_person_id, volunteer_name').in('service_id', idsDia);
        const match = (scheds || []).find(s =>
          (s.volunteer_id && s.volunteer_id === volunteer_id) ||
          (vp?.planning_center_id && s.planning_center_person_id === vp.planning_center_id) ||
          (vpName && norm(s.volunteer_name) === vpName));
        if (match) { resolvedScheduleId = match.id; if (!resolvedVolunteerId && match.volunteer_id) resolvedVolunteerId = match.volunteer_id; }
      }
    }

    let criados = 0, jaTinha = 0;
    for (const svcId of svcIds) {
      const { data: ex } = await supabase.from('vol_check_ins').select('id')
        .eq('service_id', svcId).eq('volunteer_id', resolvedVolunteerId).limit(1);
      if (ex && ex[0]) { jaTinha++; continue; }
      const { error } = await supabase.from('vol_check_ins').insert({
        schedule_id: resolvedScheduleId, volunteer_id: resolvedVolunteerId, service_id: svcId,
        checked_in_by: req.user.userId, method, is_unscheduled: !resolvedScheduleId,
        ...(checkedInAt ? { checked_in_at: checkedInAt } : {}),
      });
      if (!error) criados++;
    }
    res.json({ ok: true, criados, ja_tinha: jaTinha, cultos: svcIds.length });
  } catch (e) {
    console.error('[vol checkin manha]', e.message);
    res.status(500).json({ error: e.message || 'Erro no check-in da manhã' });
  }
});

// Atualiza dados de contato de UM vol_profile (operador do check-in preenche
// o CPF/telefone/email do voluntário que acabou de chegar). Update parcial:
// so grava o que vier, nunca apaga valor existente. O trigger BEFORE UPDATE
// OF cpf vincula ao mem_membros automaticamente.
router.put('/profiles/:id/contact', async (req, res) => {
  try {
    const { id } = req.params;
    const { cpf, phone, email } = req.body || {};

    const { data: prof, error: fetchErr } = await supabase.from('vol_profiles')
      .select('id, cpf, phone, email').eq('id', id).maybeSingle();
    if (fetchErr) return res.status(400).json({ error: fetchErr.message });
    if (!prof) return res.status(404).json({ error: 'Voluntário não encontrado' });

    const update = {};

    if (cpf != null && String(cpf).trim() !== '') {
      const cleanCpf = String(cpf).replace(/\D/g, '');
      if (cleanCpf.length !== 11) return res.status(400).json({ error: 'CPF invalido' });
      update.cpf = cleanCpf;
    }
    if (phone != null && String(phone).trim() !== '') {
      update.phone = String(phone).replace(/\D/g, '');
    }
    if (email != null && String(email).trim() !== '') {
      const e = String(email).toLowerCase().trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return res.status(400).json({ error: 'Email invalido' });
      update.email = e;
    }

    if (!Object.keys(update).length) {
      return res.status(400).json({ error: 'Nada para atualizar' });
    }

    const { data: updated, error } = await supabase.from('vol_profiles')
      .update(update).eq('id', id).select('id, full_name, cpf, phone, email, membresia_id').single();
    if (error) return res.status(400).json({ error: error.message });

    res.json({ success: true, profile: updated });
  } catch (e) {
    console.error('[Vol] update contact error:', e.message);
    res.status(500).json({ error: 'Erro ao atualizar contato' });
  }
});

// Histórico de check-ins do voluntário logado (self-service)
router.get('/my-check-ins', async (req, res) => {
  try {
    const userId = req.user.userId;
    const { data: profile } = await supabase.from('vol_profiles')
      .select('id').eq('auth_user_id', userId).maybeSingle();
    if (!profile) return res.json([]);

    const { data, error } = await supabase.from('vol_check_ins')
      .select('id, checked_in_at, method, is_unscheduled, schedule_id, service:vol_services(id, name, scheduled_at)')
      .eq('volunteer_id', profile.id)
      .order('checked_in_at', { ascending: false })
      .limit(100);
    if (error) return res.status(400).json({ error: error.message });
    res.json(data || []);
  } catch (e) {
    console.error('[Vol] my-check-ins error:', e.message);
    res.status(500).json({ error: 'Erro ao listar meus check-ins' });
  }
});

// ══════════════════════════════════════════════════════════════
// QR CODE LOOKUP (scan)
// ══════════════════════════════════════════════════════════════
router.post('/qr-lookup', async (req, res) => {
  try {
    const { qr_code } = req.body;
    if (!qr_code) return res.status(400).json({ error: 'qr_code obrigatorio' });

    // Resolve o QR · aceita vol_profiles.qr_code, vol_volunteer_qrcodes
    // ou o mem_qrcodes.token (QR unificado do cartão de membro).
    const resolucao = await resolverVoluntarioPorQr(qr_code, supabase);
    if (!resolucao.ok) return res.status(resolucao.statusCode).json({ error: resolucao.error });
    const volunteerData = resolucao.volunteerData;

    // QR sem identidade resolvível (ex.: voluntário só no mem_voluntarios, sem
    // perfil de voluntário vinculado) → trata como sem escala pra não casar
    // escala de outra pessoa.
    if (!volunteerData.id && !volunteerData.planning_center_id) {
      return res.json({
        profile: { id: null, planning_center_id: null, full_name: volunteerData.name, type: volunteerData.type },
        isUnscheduled: true, volunteerName: volunteerData.name,
      });
    }

    // Find today's schedules (BRT day boundary, not server-UTC)
    const nowBRT = new Date(Date.now() - 3 * 60 * 60 * 1000);
    const by = nowBRT.getUTCFullYear();
    const bm = String(nowBRT.getUTCMonth() + 1).padStart(2, '0');
    const bd = String(nowBRT.getUTCDate()).padStart(2, '0');
    const startOfDay = `${by}-${bm}-${bd}T00:00:00-03:00`;
    const endOfDay = `${by}-${bm}-${bd}T23:59:59-03:00`;

    let scheduleQuery = supabase.from('vol_schedules').select('*, service:vol_services!inner(*)')
      .gte('service.scheduled_at', startOfDay).lt('service.scheduled_at', endOfDay);

    if (volunteerData.type === 'profile' && volunteerData.id) {
      scheduleQuery = scheduleQuery.or(`volunteer_id.eq.${volunteerData.id},planning_center_person_id.eq.${volunteerData.planning_center_id}`);
    } else if (volunteerData.planning_center_id) {
      scheduleQuery = scheduleQuery.eq('planning_center_person_id', volunteerData.planning_center_id);
    }

    const { data: schedules } = await scheduleQuery;

    const profileResult = { id: volunteerData.id, planning_center_id: volunteerData.planning_center_id, full_name: volunteerData.name, type: volunteerData.type };

    if (!schedules || schedules.length === 0) {
      return res.json({ profile: profileResult, isUnscheduled: true, volunteerName: volunteerData.name });
    }

    // Check existing check-ins
    const { data: existingCIs } = await supabase.from('vol_check_ins').select('schedule_id').in('schedule_id', schedules.map(s => s.id));
    const unchecked = schedules.find(s => !(existingCIs || []).some(c => c.schedule_id === s.id));

    if (!unchecked) return res.status(409).json({ error: 'Voluntário já fez check-in em todas as escalas de hoje' });

    res.json({ schedule: unchecked, profile: profileResult, isUnscheduled: false, volunteerName: unchecked.volunteer_name });
  } catch (e) { console.error('[VOL] qr-lookup error:', e.message); res.status(500).json({ error: 'Erro ao buscar QR' }); }
});

// ══════════════════════════════════════════════════════════════
// VOLUNTEER QR CODES MANAGEMENT
// ══════════════════════════════════════════════════════════════
router.get('/volunteer-qrcodes', async (req, res) => {
  try {
    const { data, error } = await supabase.from('vol_volunteer_qrcodes').select('*').order('volunteer_name');
    if (error) return res.status(400).json({ error: error.message });
    // Also get profiles with qr_code
    const { data: profiles } = await supabase.from('vol_profiles').select('id, full_name, qr_code, avatar_url, planning_center_id, face_descriptor').not('qr_code', 'is', null);
    res.json({ qrcodes: data, profiles: profiles || [] });
  } catch (e) { res.status(500).json({ error: 'Erro ao listar QR codes' }); }
});

router.post('/volunteer-qrcodes', async (req, res) => {
  try {
    const { planning_center_person_id, volunteer_name, avatar_url } = req.body;
    if (!planning_center_person_id || !volunteer_name) return res.status(400).json({ error: 'Campos obrigatorios' });
    const { data, error } = await supabase.from('vol_volunteer_qrcodes')
      .upsert({ planning_center_person_id, volunteer_name, avatar_url: avatar_url || null },
        { onConflict: 'planning_center_person_id', ignoreDuplicates: false }).select().single();
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao criar QR code' }); }
});

// ══════════════════════════════════════════════════════════════
// FACE DESCRIPTORS
// ══════════════════════════════════════════════════════════════
router.post('/face/save-profile', async (req, res) => {
  try {
    const { profile_id, descriptor, photo_url } = req.body;
    if (!profile_id || !descriptor) return res.status(400).json({ error: 'profile_id e descriptor obrigatórios' });
    const { data, error } = await supabase.rpc('vol_save_profile_face_descriptor', {
      p_profile_id: profile_id, descriptor, photo_url: photo_url || null,
    });
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao salvar face descriptor' }); }
});

router.post('/face/save-qrcode', async (req, res) => {
  try {
    const { qrcode_id, descriptor, photo_url } = req.body;
    if (!qrcode_id || !descriptor) return res.status(400).json({ error: 'qrcode_id e descriptor obrigatórios' });
    const { data, error } = await supabase.rpc('vol_save_qrcode_face_descriptor', {
      qrcode_id, descriptor, photo_url: photo_url || null,
    });
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao salvar face descriptor' }); }
});

router.post('/face/match', async (req, res) => {
  try {
    const { descriptor, threshold } = req.body;
    if (!descriptor) return res.status(400).json({ error: 'descriptor obrigatorio' });
    const { data, error } = await supabase.rpc('vol_find_face_match', {
      query_descriptor: `[${descriptor.join(',')}]`, match_threshold: threshold || 0.6,
    });
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao buscar face match' }); }
});

// ══════════════════════════════════════════════════════════════
// SELF CHECK-IN (public-ish — still requires auth)
// ══════════════════════════════════════════════════════════════
router.post('/self-checkin', async (req, res) => {
  try {
    const { serviceId, action, scheduleId, volunteerName, planningCenterId } = req.body;
    if (!serviceId) return res.status(400).json({ error: 'serviceId obrigatorio' });

    const { data: service } = await supabase.from('vol_services').select('id, name, scheduled_at').eq('id', serviceId).single();
    if (!service) return res.status(404).json({ error: 'Culto não encontrado' });

    const serviceDate = new Date(service.scheduled_at);
    const today = new Date();
    if (serviceDate.toDateString() !== today.toDateString()) {
      return res.status(400).json({ error: 'Este culto não e de hoje' });
    }

    // LIST action
    if (action === 'list') {
      const { data: schedules } = await supabase.from('vol_schedules')
        .select('id, volunteer_name, team_name, position_name, planning_center_person_id')
        .eq('service_id', serviceId).order('volunteer_name');
      const { data: checkIns } = await supabase.from('vol_check_ins').select('schedule_id').eq('service_id', serviceId);
      const checkedIds = new Set((checkIns || []).map(c => c.schedule_id));
      const result = (schedules || []).map(s => ({ ...s, has_checkin: checkedIds.has(s.id) }));
      return res.json({ serviceName: service.name, schedules: result });
    }

    // Scheduled check-in
    if (scheduleId) {
      const { data: existing } = await supabase.from('vol_check_ins').select('id').eq('schedule_id', scheduleId).maybeSingle();
      if (existing) return res.status(409).json({ error: 'Check-in já realizado', alreadyCheckedIn: true });

      const { data: schedule } = await supabase.from('vol_schedules')
        .select('id, volunteer_id, volunteer_name, team_name, position_name').eq('id', scheduleId).single();
      if (!schedule) return res.status(404).json({ error: 'Escala não encontrada' });

      const { error } = await supabase.from('vol_check_ins').insert({
        schedule_id: scheduleId, volunteer_id: schedule.volunteer_id, service_id: serviceId, method: 'self_service', is_unscheduled: false,
      });
      if (error) { if (error.code === '23505') return res.status(409).json({ error: 'Check-in já realizado', alreadyCheckedIn: true }); throw error; }

      await supabase.from('vol_schedules').update({ confirmation_status: 'confirmed' }).eq('id', scheduleId).eq('confirmation_status', 'pending');
      return res.json({ success: true, volunteerName: schedule.volunteer_name, teamName: schedule.team_name, positionName: schedule.position_name });
    }

    // Unscheduled
    if (!volunteerName) return res.status(400).json({ error: 'volunteerName obrigatório para check-in sem escala' });
    let volunteerId = null;
    if (planningCenterId) {
      const { data: prof } = await supabase.from('vol_profiles').select('id').eq('planning_center_id', planningCenterId).maybeSingle();
      if (prof) volunteerId = prof.id;
    }
    const { error } = await supabase.from('vol_check_ins').insert({
      volunteer_id: volunteerId, service_id: serviceId, method: 'self_service', is_unscheduled: true,
    });
    if (error) throw error;
    res.json({ success: true, volunteerName, isUnscheduled: true });
  } catch (e) { console.error('[VOL] self-checkin error:', e.message); res.status(500).json({ error: 'Erro no self-checkin' }); }
});

// ══════════════════════════════════════════════════════════════
// SYNC LOGS
// ══════════════════════════════════════════════════════════════
router.get('/sync-logs', async (req, res) => {
  try {
    const { data, error } = await supabase.from('vol_sync_logs').select('*').order('created_at', { ascending: false }).limit(20);
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao listar sync logs' }); }
});

// ══════════════════════════════════════════════════════════════
// TRAINING CHECKINS
// ══════════════════════════════════════════════════════════════
router.get('/training-checkins', async (req, res) => {
  try {
    const { service_id } = req.query;
    let q = supabase.from('vol_training_checkins').select('*').order('created_at', { ascending: false });
    if (service_id) q = q.eq('service_id', service_id);
    const { data, error } = await q;
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao listar training checkins' }); }
});

router.post('/training-checkins', async (req, res) => {
  try {
    const { service_id, volunteer_name, team_name, phone } = req.body;
    if (!volunteer_name || !team_name) return res.status(400).json({ error: 'volunteer_name e team_name obrigatórios' });
    const { data, error } = await supabase.from('vol_training_checkins')
      .insert({ service_id: service_id || null, volunteer_name, team_name, phone: phone || null, registered_by: req.user.userId }).select().single();
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao registrar training checkin' }); }
});

// ══════════════════════════════════════════════════════════════
// REUNIÕES 1x1 MENSAIS (lider/coordenador <-> voluntário)
// ══════════════════════════════════════════════════════════════

// GET /api/voluntariado/team/:teamId/members - lista voluntários de uma equipe
// com info de 1x1 no mês corrente (ou ?year_month=YYYY-MM)
router.get('/team/:teamId/members', async (req, res) => {
  try {
    const { teamId } = req.params;
    const yearMonth = req.query.year_month || new Date().toISOString().slice(0, 7);
    const inicio = `${yearMonth}-01`;
    const [y, m] = yearMonth.split('-').map(Number);
    const fim = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);

    // Voluntários da equipe
    const { data: members, error: e1 } = await supabase
      .from('vol_team_members')
      .select('id, volunteer_profile_id, volunteer_name, position_id, position:vol_positions(id, name)')
      .eq('team_id', teamId);
    if (e1) return res.status(400).json({ error: e1.message });

    const profileIds = [...new Set((members || []).map(m => m.volunteer_profile_id).filter(Boolean))];

    // Profiles (allocation_status, training info)
    const profilesMap = {};
    if (profileIds.length) {
      const { data: profiles } = await supabase
        .from('vol_profiles')
        .select('id, full_name, email, phone, allocation_status, profile_complete')
        .in('id', profileIds);
      for (const p of (profiles || [])) profilesMap[p.id] = p;
    }

    // 1x1 do mês
    let oneOnOneMap = {};
    if (profileIds.length) {
      const { data: meetings } = await supabase
        .from('vol_1x1_meetings')
        .select('id, volunteer_profile_id, meeting_date, observacoes, registered_by, created_at')
        .eq('team_id', teamId)
        .gte('meeting_date', inicio)
        .lt('meeting_date', fim);
      for (const meeting of (meetings || [])) {
        oneOnOneMap[meeting.volunteer_profile_id] = meeting;
      }
    }

    const result = (members || []).map(m => ({
      ...m,
      profile: profilesMap[m.volunteer_profile_id] || null,
      meeting_1x1: oneOnOneMap[m.volunteer_profile_id] || null,
    }));

    res.json({ year_month: yearMonth, total: result.length, members: result });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/voluntariado/1x1 - registrar reunião 1x1
router.post('/1x1', async (req, res) => {
  try {
    const { volunteer_profile_id, team_id, meeting_date, observacoes } = req.body;
    if (!volunteer_profile_id || !team_id) {
      return res.status(400).json({ error: 'volunteer_profile_id e team_id obrigatórios' });
    }
    const date = meeting_date || new Date().toISOString().slice(0, 10);

    // Upsert por (voluntário, mês) - evita duplicar no mesmo mês
    // Estrategia: deletar qualquer 1x1 do mês e inserir novo
    const ym = date.slice(0, 7);
    const inicio = `${ym}-01`;
    const [y, m] = ym.split('-').map(Number);
    const fim = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);

    await supabase
      .from('vol_1x1_meetings')
      .delete()
      .eq('volunteer_profile_id', volunteer_profile_id)
      .eq('team_id', team_id)
      .gte('meeting_date', inicio)
      .lt('meeting_date', fim);

    const { data, error } = await supabase
      .from('vol_1x1_meetings')
      .insert({
        volunteer_profile_id,
        team_id,
        meeting_date: date,
        observacoes: observacoes || null,
        registered_by: req.user?.userId || req.user?.id || null,
      })
      .select()
      .single();
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// DELETE /api/voluntariado/1x1/:id - desfazer marcacao
router.delete('/1x1/:id', async (req, res) => {
  try {
    const { error } = await supabase.from('vol_1x1_meetings').delete().eq('id', req.params.id);
    if (error) return res.status(400).json({ error: error.message });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ══════════════════════════════════════════════════════════════
// TEAMS (unique names from schedules)
// ══════════════════════════════════════════════════════════════
router.get('/teams', async (req, res) => {
  try {
    const { data, error } = await supabase.from('vol_schedules').select('team_name').not('team_name', 'is', null);
    if (error) return res.status(400).json({ error: error.message });
    const teams = new Set();
    (data || []).forEach(s => {
      if (s.team_name) s.team_name.split(',').forEach(t => { const trimmed = t.trim(); if (trimmed) teams.add(trimmed); });
    });
    res.json([...teams].sort());
  } catch (e) { res.status(500).json({ error: 'Erro ao listar equipes' }); }
});

// ══════════════════════════════════════════════════════════════
// PLANNING CENTER SEARCH/GET (proxy)
// ══════════════════════════════════════════════════════════════
router.post('/pc/search-people', async (req, res) => {
  try {
    const { query } = req.body;
    if (!query || query.trim().length < 2) return res.status(400).json({ error: 'Query minimo 2 caracteres' });
    const appId = process.env.PLANNING_CENTER_APP_ID;
    const secret = process.env.PLANNING_CENTER_SECRET;
    if (!appId || !secret) return res.status(500).json({ error: 'Planning Center não configurado' });
    const auth = Buffer.from(`${appId}:${secret}`).toString('base64');
    const url = `https://api.planningcenteronline.com/people/v2/people?where[search_name_or_email]=${encodeURIComponent(query.trim())}&per_page=10`;
    const response = await fetch(url, { headers: { Authorization: `Basic ${auth}` } });
    if (!response.ok) return res.status(response.status).json({ error: 'Falha ao buscar no Planning Center' });
    const data = await response.json();
    const people = (data.data || []).map(p => ({
      id: p.id, full_name: `${p.attributes.first_name || ''} ${p.attributes.last_name || ''}`.trim(),
      first_name: p.attributes.first_name || '', last_name: p.attributes.last_name || '', avatar_url: p.attributes.avatar || null,
    }));
    res.json({ people });
  } catch (e) { res.status(500).json({ error: 'Erro ao buscar no PC' }); }
});

router.post('/pc/get-person', async (req, res) => {
  try {
    const { person_id } = req.body;
    if (!person_id) return res.status(400).json({ error: 'person_id obrigatorio' });
    const appId = process.env.PLANNING_CENTER_APP_ID;
    const secret = process.env.PLANNING_CENTER_SECRET;
    if (!appId || !secret) return res.status(500).json({ error: 'Planning Center não configurado' });
    const auth = Buffer.from(`${appId}:${secret}`).toString('base64');
    const response = await fetch(`https://api.planningcenteronline.com/people/v2/people/${person_id}`, {
      headers: { Authorization: `Basic ${auth}` },
    });
    if (!response.ok) return res.status(response.status).json({ error: 'Falha ao buscar pessoa' });
    const data = await response.json();
    const p = data.data;
    res.json({ person: { id: p.id, full_name: `${p.attributes.first_name || ''} ${p.attributes.last_name || ''}`.trim(), avatar_url: p.attributes.avatar || null } });
  } catch (e) { res.status(500).json({ error: 'Erro ao buscar pessoa no PC' }); }
});

// ══════════════════════════════════════════════════════════════
// SERVICE TYPES (recurring service templates)
// ══════════════════════════════════════════════════════════════
router.get('/service-types', async (req, res) => {
  try {
    const { data, error } = await supabase.from('vol_service_types').select('*').order('name');
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao listar tipos de culto' }); }
});

router.post('/service-types', async (req, res) => {
  try {
    const { name, description, recurrence_day, recurrence_time, color } = req.body;
    if (!name) return res.status(400).json({ error: 'name obrigatorio' });
    const { data, error } = await supabase.from('vol_service_types')
      .insert({ name, description, recurrence_day, recurrence_time, color }).select().single();
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao criar tipo de culto' }); }
});

router.put('/service-types/:id', async (req, res) => {
  try {
    const { name, description, recurrence_day, recurrence_time, color, is_active } = req.body;
    const { data, error } = await supabase.from('vol_service_types')
      .update({ name, description, recurrence_day, recurrence_time, color, is_active })
      .eq('id', req.params.id).select().single();
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao atualizar tipo de culto' }); }
});

router.delete('/service-types/:id', async (req, res) => {
  try {
    const { error } = await supabase.from('vol_service_types').delete().eq('id', req.params.id);
    if (error) return res.status(400).json({ error: error.message });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: 'Erro ao remover tipo de culto' }); }
});

// Generate services from service type recurrence pattern
router.post('/service-types/:id/generate', async (req, res) => {
  try {
    const { weeks, year } = req.body;

    const { data: sType, error: stErr } = await supabase.from('vol_service_types')
      .select('*').eq('id', req.params.id).single();
    if (stErr || !sType) return res.status(404).json({ error: 'Tipo de culto não encontrado' });
    if (sType.recurrence_day == null || !sType.recurrence_time) {
      return res.status(400).json({ error: 'Tipo de culto sem recorrencia configurada' });
    }

    const [hours, minutes] = sType.recurrence_time.split(':').map(Number);
    const pad = (n) => String(n).padStart(2, '0');
    // Recurrence_time é hora local da igreja (BRT = UTC-3, sem horário de verão desde 2019).
    // Montamos scheduled_at com offset -03:00 explícito para não depender do TZ do servidor.
    const toBRTISO = (y, m0, d) =>
      `${y}-${pad(m0 + 1)}-${pad(d)}T${pad(hours)}:${pad(minutes)}:00-03:00`;
    const dayStartBRT = (y, m0, d) => `${y}-${pad(m0 + 1)}-${pad(d)}T00:00:00-03:00`;
    const dayEndBRT = (y, m0, d) => new Date(Date.UTC(y, m0, d + 1)).toISOString().slice(0, 10) + 'T00:00:00-03:00';

    const generated = [];

    const makeIfAbsent = async (y, m0, d) => {
      const scheduledAt = toBRTISO(y, m0, d);
      const { data: existing } = await supabase.from('vol_services')
        .select('id, service_type_id')
        .gte('scheduled_at', dayStartBRT(y, m0, d))
        .lt('scheduled_at', dayEndBRT(y, m0, d));
      // Não duplica: pula se já existe esse tipo no dia OU se já há serviço do
      // Planning Center (service_type_id NULL) no dia — o PCO é a fonte das
      // escalas; gerar a partir do vol_service_type criaria duplicado vazio.
      if (existing && existing.some(s => s.service_type_id === sType.id || s.service_type_id === null)) return;
      const { data: svc, error: svcErr } = await supabase.from('vol_services')
        .insert({ name: sType.name, service_type_name: sType.name, service_type_id: sType.id, scheduled_at: scheduledAt })
        .select().single();
      if (!svcErr && svc) generated.push(svc);
    };

    if (year) {
      // Gera todas as ocorrências do tipo no ano inteiro.
      // Caminhamos pelos dias usando UTC para não sofrer interferência do TZ do servidor.
      let cursor = new Date(Date.UTC(year, 0, 1));
      while (cursor.getUTCDay() !== sType.recurrence_day) {
        cursor.setUTCDate(cursor.getUTCDate() + 1);
      }
      const endMs = Date.UTC(year, 11, 31);
      while (cursor.getTime() <= endMs) {
        await makeIfAbsent(cursor.getUTCFullYear(), cursor.getUTCMonth(), cursor.getUTCDate());
        cursor.setUTCDate(cursor.getUTCDate() + 7);
      }
    } else {
      // Gera N semanas a partir de hoje.
      const weeksAhead = weeks || 4;
      // "Hoje" em BRT: pega o instante atual, subtrai 3h e extrai Y/M/D em UTC.
      const brtNow = new Date(Date.now() - 3 * 60 * 60 * 1000);
      let cursor = new Date(Date.UTC(brtNow.getUTCFullYear(), brtNow.getUTCMonth(), brtNow.getUTCDate()));
      const delta = (sType.recurrence_day - cursor.getUTCDay() + 7) % 7;
      cursor.setUTCDate(cursor.getUTCDate() + delta);
      for (let w = 0; w < weeksAhead; w++) {
        await makeIfAbsent(cursor.getUTCFullYear(), cursor.getUTCMonth(), cursor.getUTCDate());
        cursor.setUTCDate(cursor.getUTCDate() + 7);
      }
    }

    res.json({ generated: generated.length, services: generated });
  } catch (e) { res.status(500).json({ error: 'Erro ao gerar cultos' }); }
});

// ══════════════════════════════════════════════════════════════
// SERVICES — Manual creation/update/delete
// ══════════════════════════════════════════════════════════════
router.post('/services', async (req, res) => {
  try {
    const { name, service_type_name, service_type_id, scheduled_at } = req.body;
    if (!name || !scheduled_at) return res.status(400).json({ error: 'name e scheduled_at obrigatórios' });
    const { data, error } = await supabase.from('vol_services')
      .insert({ name, service_type_name, service_type_id, scheduled_at }).select().single();
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao criar culto' }); }
});

router.put('/services/:id', async (req, res) => {
  try {
    const { name, service_type_name, scheduled_at } = req.body;
    const { data, error } = await supabase.from('vol_services')
      .update({ name, service_type_name, scheduled_at }).eq('id', req.params.id).select().single();
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao atualizar culto' }); }
});

router.delete('/services/:id', async (req, res) => {
  try {
    const { error } = await supabase.from('vol_services').delete().eq('id', req.params.id);
    if (error) return res.status(400).json({ error: error.message });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: 'Erro ao remover culto' }); }
});

// ══════════════════════════════════════════════════════════════
// TEAMS (formal team management)
// ══════════════════════════════════════════════════════════════
router.get('/teams-manage', async (req, res) => {
  try {
    const { data, error } = await supabase.from('vol_teams')
      .select('*, leader:vol_profiles!vol_teams_leader_profile_id_fkey(id, full_name, avatar_url), positions:vol_positions(*), members:vol_team_members!team_id(id)')
      .order('sort_order').order('name');
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao listar equipes' }); }
});

router.post('/teams-manage', async (req, res) => {
  try {
    const { name, description, color, leader_profile_id, sort_order, area } = req.body;
    if (!name) return res.status(400).json({ error: 'name obrigatorio' });
    const { data, error } = await supabase.from('vol_teams')
      .insert({ name, description, color, leader_profile_id, sort_order: sort_order || 0, area: area || null }).select().single();
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao criar equipe' }); }
});

router.put('/teams-manage/:id', async (req, res) => {
  try {
    const { name, description, color, leader_profile_id, is_active, sort_order, area } = req.body;
    const { data, error } = await supabase.from('vol_teams')
      .update({ name, description, color, leader_profile_id, is_active, sort_order, area })
      .eq('id', req.params.id).select().single();
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao atualizar equipe' }); }
});

router.delete('/teams-manage/:id', async (req, res) => {
  try {
    const { error } = await supabase.from('vol_teams').delete().eq('id', req.params.id);
    if (error) return res.status(400).json({ error: error.message });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: 'Erro ao remover equipe' }); }
});

// ══════════════════════════════════════════════════════════════
// POSITIONS (within teams)
// ══════════════════════════════════════════════════════════════
router.get('/positions', async (req, res) => {
  try {
    const { team_id } = req.query;
    let q = supabase.from('vol_positions').select('*, team:vol_teams(id, name)').order('sort_order').order('name');
    if (team_id) q = q.eq('team_id', team_id);
    const { data, error } = await q;
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao listar posições' }); }
});

router.post('/positions', async (req, res) => {
  try {
    const { team_id, name, description, min_volunteers, max_volunteers, sort_order } = req.body;
    if (!team_id || !name) return res.status(400).json({ error: 'team_id e name obrigatórios' });
    const { data, error } = await supabase.from('vol_positions')
      .insert({ team_id, name, description, min_volunteers, max_volunteers, sort_order: sort_order || 0 }).select().single();
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao criar posição' }); }
});

router.put('/positions/:id', async (req, res) => {
  try {
    const { name, description, min_volunteers, max_volunteers, is_active, sort_order } = req.body;
    const { data, error } = await supabase.from('vol_positions')
      .update({ name, description, min_volunteers, max_volunteers, is_active, sort_order })
      .eq('id', req.params.id).select().single();
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao atualizar posição' }); }
});

router.delete('/positions/:id', async (req, res) => {
  try {
    const { error } = await supabase.from('vol_positions').delete().eq('id', req.params.id);
    if (error) return res.status(400).json({ error: error.message });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: 'Erro ao remover posição' }); }
});

// ══════════════════════════════════════════════════════════════
// TEAM MEMBERS (volunteer ↔ team assignments)
// ══════════════════════════════════════════════════════════════
router.get('/team-members', async (req, res) => {
  try {
    const { team_id } = req.query;
    let q = supabase.from('vol_team_members')
      .select('*, team:vol_teams(id, name, color), position:vol_positions(id, name), profile:vol_profiles(id, full_name, avatar_url, planning_center_id)')
      .eq('is_active', true).order('volunteer_name');
    if (team_id) q = q.eq('team_id', team_id);
    const { data, error } = await q;
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao listar membros da equipe' }); }
});

router.post('/team-members', async (req, res) => {
  try {
    const { team_id, position_id, volunteer_profile_id, planning_center_person_id, volunteer_name } = req.body;
    if (!team_id || !volunteer_name) return res.status(400).json({ error: 'team_id e volunteer_name obrigatórios' });
    if (!volunteer_profile_id && !planning_center_person_id) {
      return res.status(400).json({ error: 'volunteer_profile_id ou planning_center_person_id obrigatório' });
    }
    const { data, error } = await supabase.from('vol_team_members')
      .insert({ team_id, position_id, volunteer_profile_id, planning_center_person_id, volunteer_name })
      .select().single();
    if (error) {
      if (error.code === '23505') return res.status(409).json({ error: 'Voluntário já esta nesta equipe' });
      return res.status(400).json({ error: error.message });
    }
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao adicionar membro a equipe' }); }
});

router.put('/team-members/:id', async (req, res) => {
  try {
    const { position_id, is_active } = req.body;
    const { data, error } = await supabase.from('vol_team_members')
      .update({ position_id, is_active }).eq('id', req.params.id).select().single();
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao atualizar membro' }); }
});

router.delete('/team-members/:id', async (req, res) => {
  try {
    const { error } = await supabase.from('vol_team_members').delete().eq('id', req.params.id);
    if (error) return res.status(400).json({ error: error.message });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: 'Erro ao remover membro da equipe' }); }
});

// ══════════════════════════════════════════════════════════════
// AVAILABILITY (volunteer unavailability dates)
// ══════════════════════════════════════════════════════════════

// Cultos de um período com contagem/lista de quem esta indisponível em cada um
router.get('/services-availability', async (req, res) => {
  try {
    const { from, to } = req.query;
    if (!from || !to) return res.status(400).json({ error: 'from e to obrigatórios' });

    const { data: services, error: svcErr } = await supabase
      .from('vol_services')
      .select('id, name, service_type_name, scheduled_at')
      .not('service_type_id', 'is', null)
      .gte('scheduled_at', `${from}T00:00:00`)
      .lte('scheduled_at', `${to}T23:59:59`)
      .order('scheduled_at');
    if (svcErr) return res.status(400).json({ error: svcErr.message });

    if (!services || services.length === 0) return res.json([]);

    const serviceIds = services.map(s => s.id);

    // Busca todas as indisponibilidades ligadas a esses cultos
    const { data: unavail } = await supabase
      .from('vol_availability')
      .select('service_id, volunteer_profile_id, vol_profiles(full_name, avatar_url)')
      .in('service_id', serviceIds)
      .not('service_id', 'is', null);

    // Agrupa por service_id
    const unavailByService = new Map();
    for (const u of (unavail || [])) {
      if (!unavailByService.has(u.service_id)) unavailByService.set(u.service_id, []);
      unavailByService.get(u.service_id).push({
        profile_id: u.volunteer_profile_id,
        name: u.vol_profiles?.full_name || 'Voluntario',
        avatar_url: u.vol_profiles?.avatar_url || null,
      });
    }

    res.json(services.map(s => ({
      ...s,
      unavailable: unavailByService.get(s.id) || [],
    })));
  } catch (e) { res.status(500).json({ error: 'Erro ao buscar disponibilidade dos cultos' }); }
});

router.get('/availability', async (req, res) => {
  try {
    const { volunteer_profile_id, from, to } = req.query;
    let q = supabase.from('vol_availability').select('*').order('unavailable_from');
    if (volunteer_profile_id) q = q.eq('volunteer_profile_id', volunteer_profile_id);
    if (from) q = q.gte('unavailable_to', from);
    if (to) q = q.lte('unavailable_from', to);
    const { data, error } = await q;
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao listar disponibilidade' }); }
});

router.post('/availability', async (req, res) => {
  try {
    const { volunteer_profile_id, planning_center_person_id, unavailable_from, unavailable_to, reason } = req.body;
    if (!unavailable_from || !unavailable_to) return res.status(400).json({ error: 'Datas obrigatorias' });
    if (!volunteer_profile_id && !planning_center_person_id) {
      return res.status(400).json({ error: 'volunteer_profile_id ou planning_center_person_id obrigatório' });
    }
    const { data, error } = await supabase.from('vol_availability')
      .insert({ volunteer_profile_id, planning_center_person_id, unavailable_from, unavailable_to, reason })
      .select().single();
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao registrar indisponibilidade' }); }
});

router.delete('/availability/:id', async (req, res) => {
  try {
    const { error } = await supabase.from('vol_availability').delete().eq('id', req.params.id);
    if (error) return res.status(400).json({ error: error.message });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: 'Erro ao remover indisponibilidade' }); }
});

// ══════════════════════════════════════════════════════════════
// SCHEDULE MANAGEMENT (CRUD for schedules)
// ══════════════════════════════════════════════════════════════

// Create a schedule entry (assign volunteer to service)
router.post('/schedules', async (req, res) => {
  try {
    const { service_id, volunteer_id, volunteer_name, team_id, team_name, position_id, position_name, planning_center_person_id, notes } = req.body;
    if (!service_id || !volunteer_name) return res.status(400).json({ error: 'service_id e volunteer_name obrigatórios' });

    const { data, error } = await supabase.from('vol_schedules')
      .insert({
        service_id,
        volunteer_id: volunteer_id || null,
        volunteer_name,
        team_id: team_id || null,
        team_name: team_name || null,
        position_id: position_id || null,
        position_name: position_name || null,
        planning_center_person_id: planning_center_person_id || null,
        confirmation_status: 'pending',
        source: 'manual',
        notes: notes || null,
      }).select().single();

    if (error) {
      if (error.code === '23505') return res.status(409).json({ error: 'Voluntário já escalado neste culto' });
      return res.status(400).json({ error: error.message });
    }
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao criar escala' }); }
});

// Update schedule entry
router.put('/schedules/:id', async (req, res) => {
  try {
    const { team_id, team_name, position_id, position_name, confirmation_status, notes } = req.body;
    const updates = {};
    if (team_id !== undefined) updates.team_id = team_id;
    if (team_name !== undefined) updates.team_name = team_name;
    if (position_id !== undefined) updates.position_id = position_id;
    if (position_name !== undefined) updates.position_name = position_name;
    if (confirmation_status !== undefined) updates.confirmation_status = confirmation_status;
    if (notes !== undefined) updates.notes = notes;

    const { data, error } = await supabase.from('vol_schedules')
      .update(updates).eq('id', req.params.id).select().single();
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao atualizar escala' }); }
});

// Delete schedule entry
router.delete('/schedules/:id', async (req, res) => {
  try {
    const { error } = await supabase.from('vol_schedules').delete().eq('id', req.params.id);
    if (error) return res.status(400).json({ error: error.message });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: 'Erro ao remover escala' }); }
});

// Bulk schedule — assign multiple volunteers to a service at once
router.post('/schedules/bulk', async (req, res) => {
  try {
    const { service_id, assignments } = req.body;
    if (!service_id || !Array.isArray(assignments) || !assignments.length) {
      return res.status(400).json({ error: 'service_id e assignments[] obrigatórios' });
    }

    const rows = assignments.map(a => ({
      service_id,
      volunteer_id: a.volunteer_id || null,
      volunteer_name: a.volunteer_name,
      team_id: a.team_id || null,
      team_name: a.team_name || null,
      position_id: a.position_id || null,
      position_name: a.position_name || null,
      planning_center_person_id: a.planning_center_person_id || null,
      confirmation_status: 'pending',
      source: a.source || 'manual',
      notes: a.notes || null,
    }));

    const { data, error } = await supabase.from('vol_schedules')
      .upsert(rows, { onConflict: 'service_id,planning_center_person_id', ignoreDuplicates: true })
      .select();
    if (error) return res.status(400).json({ error: error.message });
    res.json({ created: data.length, schedules: data });
  } catch (e) { res.status(500).json({ error: 'Erro ao criar escalas em lote' }); }
});

// Copy schedules from one service to another
router.post('/schedules/copy', async (req, res) => {
  try {
    const { from_service_id, to_service_id } = req.body;
    if (!from_service_id || !to_service_id) {
      return res.status(400).json({ error: 'from_service_id e to_service_id obrigatórios' });
    }

    const { data: source } = await supabase.from('vol_schedules')
      .select('*').eq('service_id', from_service_id);
    if (!source || !source.length) return res.status(404).json({ error: 'Nenhuma escala encontrada no culto de origem' });

    const rows = source.map(s => ({
      service_id: to_service_id,
      volunteer_id: s.volunteer_id,
      volunteer_name: s.volunteer_name,
      team_id: s.team_id,
      team_name: s.team_name,
      position_id: s.position_id,
      position_name: s.position_name,
      planning_center_person_id: s.planning_center_person_id,
      confirmation_status: 'pending',
      source: 'manual',
    }));

    const { data, error } = await supabase.from('vol_schedules')
      .insert(rows).select();
    if (error) return res.status(400).json({ error: error.message });
    res.json({ copied: data.length, schedules: data });
  } catch (e) { res.status(500).json({ error: 'Erro ao copiar escalas' }); }
});

// Auto-fill schedule from team roster with rotation
router.post('/schedules/auto-fill', async (req, res) => {
  try {
    const { service_id, team_id } = req.body;
    if (!service_id || !team_id) return res.status(400).json({ error: 'service_id e team_id obrigatórios' });

    // Get service date
    const { data: service } = await supabase.from('vol_services')
      .select('scheduled_at').eq('id', service_id).single();
    if (!service) return res.status(404).json({ error: 'Culto não encontrado' });

    const serviceDate = new Date(service.scheduled_at).toISOString().split('T')[0];

    // Get team members
    const { data: members } = await supabase.from('vol_team_members')
      .select('*, position:vol_positions(id, name)')
      .eq('team_id', team_id).eq('is_active', true);
    if (!members || !members.length) return res.status(404).json({ error: 'Nenhum membro ativo na equipe' });

    // Get team info
    const { data: team } = await supabase.from('vol_teams')
      .select('name').eq('id', team_id).single();

    // Check availability — exclude unavailable volunteers
    const { data: unavailable } = await supabase.from('vol_availability')
      .select('volunteer_profile_id, planning_center_person_id')
      .lte('unavailable_from', serviceDate)
      .gte('unavailable_to', serviceDate);

    const unavailableIds = new Set(
      (unavailable || []).map(u => u.volunteer_profile_id || u.planning_center_person_id)
    );

    // Check who's already scheduled for this service
    const { data: existing } = await supabase.from('vol_schedules')
      .select('volunteer_id, planning_center_person_id').eq('service_id', service_id);
    const alreadyScheduled = new Set(
      (existing || []).map(e => e.volunteer_id || e.planning_center_person_id)
    );

    // Get recent schedule counts for rotation (last 4 weeks)
    const fourWeeksAgo = new Date();
    fourWeeksAgo.setDate(fourWeeksAgo.getDate() - 28);
    const { data: recentSchedules } = await supabase.from('vol_schedules')
      .select('volunteer_id, planning_center_person_id, service:vol_services!inner(scheduled_at)')
      .eq('team_name', team?.name)
      .gte('service.scheduled_at', fourWeeksAgo.toISOString());

    const scheduleCount = new Map();
    (recentSchedules || []).forEach(s => {
      const key = s.volunteer_id || s.planning_center_person_id;
      scheduleCount.set(key, (scheduleCount.get(key) || 0) + 1);
    });

    // Filter available members and sort by least recently scheduled (rotation)
    const available = members.filter(m => {
      const id = m.volunteer_profile_id || m.planning_center_person_id;
      return !unavailableIds.has(id) && !alreadyScheduled.has(id);
    }).sort((a, b) => {
      const countA = scheduleCount.get(a.volunteer_profile_id || a.planning_center_person_id) || 0;
      const countB = scheduleCount.get(b.volunteer_profile_id || b.planning_center_person_id) || 0;
      return countA - countB;
    });

    if (!available.length) return res.json({ created: 0, schedules: [], message: 'Todos os membros estão indisponiveis ou já escalados' });

    const rows = available.map(m => ({
      service_id,
      volunteer_id: m.volunteer_profile_id || null,
      volunteer_name: m.volunteer_name,
      team_id,
      team_name: team?.name || null,
      position_id: m.position_id || null,
      position_name: m.position?.name || null,
      planning_center_person_id: m.planning_center_person_id || null,
      confirmation_status: 'pending',
      source: 'auto_rotation',
    }));

    const { data: created, error } = await supabase.from('vol_schedules')
      .insert(rows).select();
    if (error) return res.status(400).json({ error: error.message });
    res.json({ created: created.length, schedules: created });
  } catch (e) { res.status(500).json({ error: 'Erro ao auto-preencher escala' }); }
});

// Import teams from existing schedule data (migration helper)
router.post('/teams-manage/import-from-schedules', async (req, res) => {
  try {
    const teamNames = new Set();

    // 1. Busca equipes direto do PCO (fonte primaria)
    try {
      const { basic: credentials } = getPCCredentials();
      const serviceTypes = await fetchAllServiceTypes(credentials);

      for (const st of serviceTypes) {
        const teamsRes = await fetchWithRetry(
          `${PC_SERVICES_BASE}/service_types/${st.id}/teams?per_page=100`,
          { Authorization: `Basic ${credentials}` }
        );
        for (const team of (teamsRes?.data || [])) {
          const name = team.attributes?.name;
          if (name) teamNames.add(name.trim());
        }
      }
    } catch (pcoErr) {
      console.warn('[import-teams] PCO indisponivel, usando vol_schedules:', pcoErr.message);
    }

    // 2. Complementa com nomes já existentes em vol_schedules (fallback)
    const { data: schedData } = await supabase.from('vol_schedules')
      .select('team_name').not('team_name', 'is', null);
    (schedData || []).forEach(s => {
      if (s.team_name) s.team_name.split(',').forEach(t => { const trimmed = t.trim(); if (trimmed) teamNames.add(trimmed); });
    });

    // 3. Upsert em vol_teams
    const created = [];
    for (const name of teamNames) {
      const { data, error } = await supabase.from('vol_teams')
        .upsert({ name }, { onConflict: 'name', ignoreDuplicates: true }).select().single();
      if (data && !error) created.push(data);
    }
    res.json({ imported: created.length, teams: created });
  } catch (e) { res.status(500).json({ error: 'Erro ao importar equipes' }); }
});

// Opção B: backfill — varre vol_schedules existentes e atribui voluntários às equipes
router.post('/teams-manage/sync-members-from-schedules', async (req, res) => {
  try {
    const result = await syncTeamMembersFromSchedules(supabase);
    res.json(result);
  } catch (e) {
    console.error('[sync-members]', e.message);
    res.status(500).json({ error: 'Erro ao sincronizar membros de equipe' });
  }
});

// ════════════════════════════════════════════════════════════════════════════
// Inscrições (form Google) · funil recebidas vs alocadas
// Le da tabela vol_inscricoes (linha por pessoa) para suportar cruzamentos.
// ════════════════════════════════════════════════════════════════════════════
router.get('/inscricoes-summary', async (req, res) => {
  try {
    const ano = req.query.ano ? String(req.query.ano) : null;
    const area = req.query.area ? String(req.query.area).toLowerCase() : null;

    let query = supabase
      .from('vol_inscricoes')
      .select('data_inscricao, status, area');
    if (ano) {
      query = query
        .gte('data_inscricao', `${ano}-01-01`)
        .lt('data_inscricao', `${Number(ano) + 1}-01-01`);
    }
    if (area) query = query.eq('area', area);
    const { data, error } = await query;
    if (error) throw error;

    // Considera "alocada" status integrado ou enviado_ministerio (em processo final)
    const isAlocada = (s) => s === 'integrado';

    const porMes = {};
    let totalRecebidas = 0;
    let totalAlocadas = 0;
    const porArea = {
      kids: { recebidas: 0, alocadas: 0 },
      sede: { recebidas: 0, alocadas: 0 },
    };

    for (const row of data || []) {
      const ym = String(row.data_inscricao).slice(0, 7);
      if (!porMes[ym]) {
        porMes[ym] = { recebidas: 0, alocadas: 0, kids_rec: 0, kids_aloc: 0, sede_rec: 0, sede_aloc: 0 };
      }
      const aloc = isAlocada(row.status);
      porMes[ym].recebidas += 1;
      totalRecebidas += 1;
      if (porArea[row.area]) porArea[row.area].recebidas += 1;
      if (row.area === 'kids') porMes[ym].kids_rec += 1;
      if (row.area === 'sede') porMes[ym].sede_rec += 1;
      if (aloc) {
        porMes[ym].alocadas += 1;
        totalAlocadas += 1;
        if (porArea[row.area]) porArea[row.area].alocadas += 1;
        if (row.area === 'kids') porMes[ym].kids_aloc += 1;
        if (row.area === 'sede') porMes[ym].sede_aloc += 1;
      }
    }

    const meses = Object.keys(porMes).sort().map(ym => {
      const m = porMes[ym];
      const taxa = m.recebidas > 0 ? Math.round((m.alocadas / m.recebidas) * 100) : null;
      return { mes: ym, ...m, taxa };
    });

    const taxa = totalRecebidas > 0 ? Math.round((totalAlocadas / totalRecebidas) * 100) : null;

    res.json({
      filtros: { ano, area },
      total: { recebidas: totalRecebidas, alocadas: totalAlocadas, taxa },
      por_area: porArea,
      meses,
    });
  } catch (e) {
    console.error('[inscricoes-summary]', e.message);
    res.status(500).json({ error: 'Erro ao agregar inscrições' });
  }
});

// Lista detalhada de inscrições (drill-down com nomes individuais)
router.get('/inscricoes', async (req, res) => {
  try {
    const ano = req.query.ano ? String(req.query.ano) : null;
    const area = req.query.area ? String(req.query.area).toLowerCase() : null;
    const status = req.query.status ? String(req.query.status) : null;
    const mes = req.query.mes ? String(req.query.mes) : null; // YYYY-MM
    const search = req.query.search ? String(req.query.search).trim() : null;
    const limit = Math.min(Number(req.query.limit) || 100, 500);
    const offset = Number(req.query.offset) || 0;

    let q = supabase
      .from('vol_inscricoes')
      .select(`
        id, nome, sobrenome, nome_completo, cpf, email, telefone,
        data_nascimento, nome_mae, data_inscricao, area, status,
        dom_predominante, ministerios_interesse, area_direcionada, participou_next,
        feedback, integrado_em, membro_id, origem
      `, { count: 'exact' })
      .order('data_inscricao', { ascending: false })
      .range(offset, offset + limit - 1);

    if (ano) {
      q = q.gte('data_inscricao', `${ano}-01-01`).lt('data_inscricao', `${Number(ano) + 1}-01-01`);
    }
    if (mes) {
      const [y, m] = mes.split('-');
      const nextMonth = new Date(Number(y), Number(m), 1);
      q = q.gte('data_inscricao', `${mes}-01`).lt('data_inscricao', nextMonth.toISOString().slice(0, 10));
    }
    if (area) q = q.eq('area', area);
    if (status) q = q.eq('status', status);
    if (search) q = q.ilike('nome_completo', `%${search}%`);

    const { data, error, count } = await q;
    if (error) throw error;

    res.json({ total: count || 0, limit, offset, rows: data || [] });
  } catch (e) {
    console.error('[inscricoes-list]', e.message);
    res.status(500).json({ error: 'Erro ao listar inscrições' });
  }
});

// PATCH /api/voluntariado/inscricoes/:id — triagem: muda o status
// inscrito → enviado_ministerio → integrado (ou volta). Ação da coordenação.
const VOL_INSCRICAO_STATUS = ['inscrito', 'enviado_ministerio', 'integrado'];
router.patch('/inscricoes/:id', async (req, res) => {
  try {
    const { status, feedback } = req.body || {};
    if (!VOL_INSCRICAO_STATUS.includes(status)) {
      return res.status(400).json({ error: 'status inválido' });
    }
    const isAdmin = ['admin', 'diretor'].includes(req.user.role);
    const lvl = Math.max(getEffectiveLevel(req, 'voluntariado') || 0, getEffectiveLevel(req, 'membresia') || 0);
    if (!isAdmin && lvl < 3) {
      return res.status(403).json({ error: 'Sem permissão para alterar a inscrição' });
    }

    // Trava de segurança · Kids/Bridge não integra sem triagem de antecedentes
    // liberada (nada consta / aprovação manual / dispensa registrada).
    if (status === 'integrado') {
      const { data: insc } = await supabase.from('vol_inscricoes')
        .select('area').eq('id', req.params.id).maybeSingle();
      const areaInsc = String(insc?.area || '').toLowerCase();
      if (areaInsc === 'kids' || areaInsc === 'bridge') {
        const { data: chk } = await supabase.from('vol_background_checks')
          .select('status').eq('inscricao_id', req.params.id)
          .is('deleted_at', null).order('created_at', { ascending: false })
          .limit(1).maybeSingle();
        if (!chk || !antecedentes.STATUS_LIBERADOS.has(chk.status)) {
          return res.status(409).json({
            error: 'Triagem de antecedentes pendente — só é possível integrar após a verificação ser liberada (nada consta, aprovação manual ou dispensa).',
            code: 'antecedentes_pendentes',
          });
        }
      }
    }

    const patch = { status, updated_at: new Date().toISOString() };
    if (status === 'enviado_ministerio') patch.enviado_lider_em = new Date().toISOString();
    if (status === 'integrado') patch.integrado_em = new Date().toISOString().slice(0, 10);
    if (feedback !== undefined) patch.feedback = feedback || null;

    const { data, error } = await supabase.from('vol_inscricoes')
      .update(patch).eq('id', req.params.id).select().single();
    if (error) throw error;

    // Notifica a pessoa (se tiver login vinculado)
    (async () => {
      try {
        if (!data.membro_id) return;
        const { data: prof } = await supabase.from('vol_profiles')
          .select('auth_user_id').eq('membresia_id', data.membro_id).maybeSingle();
        const targetId = prof?.auth_user_id;
        if (!targetId) return;
        if (status === 'integrado') {
          await notificar({
            modulo: 'voluntariado', tipo: 'vol_integrado',
            titulo: 'Você agora faz parte do time! 🎉',
            mensagem: `Sua inscrição para servir (${data.area}) foi integrada. Bem-vindo(a)!`,
            link: '/voluntariado', severidade: 'info',
            chaveDedup: `vol_integrado_${data.id}`, targetIds: [targetId],
          });
        } else if (status === 'enviado_ministerio') {
          await notificar({
            modulo: 'voluntariado', tipo: 'vol_enviado',
            titulo: 'Sua inscrição avançou',
            mensagem: `Encaminhamos sua inscrição (${data.area}) ao ministério. Em breve o líder fala com você.`,
            link: '/voluntariado', severidade: 'info',
            chaveDedup: `vol_enviado_${data.id}`, targetIds: [targetId],
          });
        }
      } catch (e) { console.warn('[inscricao status notify]', e.message); }
    })();

    res.json(data);
  } catch (e) {
    console.error('[inscricao status]', e.message);
    res.status(500).json({ error: 'Erro ao atualizar inscrição' });
  }
});

// PATCH /api/voluntariado/inscricoes/:id/dados — edita os dados da ficha
// (CPF, data de nascimento, nome da mãe, áreas de interesse e a área onde a
// pessoa foi de fato direcionada). Destrava completar o que falta pra triagem
// de antecedentes (Kids/Bridge) e registra "pediu X, foi pra Y".
router.patch('/inscricoes/:id/dados', async (req, res) => {
  try {
    const isAdmin = ['admin', 'diretor'].includes(req.user.role);
    const lvl = Math.max(getEffectiveLevel(req, 'voluntariado') || 0, getEffectiveLevel(req, 'membresia') || 0);
    if (!isAdmin && lvl < 3) {
      return res.status(403).json({ error: 'Sem permissão para editar a inscrição' });
    }

    const { cpf, data_nascimento, nome_mae, ministerios_interesse, area_direcionada } = req.body || {};
    const patch = { updated_at: new Date().toISOString() };

    if (cpf !== undefined) {
      const d = String(cpf || '').replace(/\D+/g, '');
      if (d && d.length !== 11) return res.status(400).json({ error: 'CPF deve ter 11 dígitos' });
      patch.cpf = d || null;
    }
    if (data_nascimento !== undefined) {
      const d = data_nascimento ? String(data_nascimento).slice(0, 10) : null;
      if (d && !/^\d{4}-\d{2}-\d{2}$/.test(d)) return res.status(400).json({ error: 'Data de nascimento inválida' });
      patch.data_nascimento = d;
    }
    if (nome_mae !== undefined) {
      patch.nome_mae = nome_mae ? String(nome_mae).trim() : null;
    }
    if (ministerios_interesse !== undefined) {
      patch.ministerios_interesse = ministerios_interesse ? String(ministerios_interesse).trim() : null;
    }
    if (area_direcionada !== undefined) {
      const arr = Array.isArray(area_direcionada)
        ? [...new Set(area_direcionada.map((s) => String(s).trim()).filter(Boolean))]
        : [];
      patch.area_direcionada = arr.length ? arr : null;
    }

    if (Object.keys(patch).length === 1) {
      return res.status(400).json({ error: 'Nada para atualizar' });
    }

    const { data, error } = await supabase.from('vol_inscricoes')
      .update(patch).eq('id', req.params.id).select().single();
    if (error) throw error;
    res.json(data);
  } catch (e) {
    console.error('[inscricao dados]', e.message);
    res.status(500).json({ error: 'Erro ao salvar dados da inscrição' });
  }
});

// ══════════════════════════════════════════════════════════════
// TRIAGEM DE ANTECEDENTES (Kids/Bridge) · PII sensível
// Leitura/ação restrita a quem triagem (voluntariado/kids/bridge >=3).
// ══════════════════════════════════════════════════════════════
const BGCHECK_FIELDS =
  'id, inscricao_id, area, status, resultado, certidao_url, consulta_erro, ' +
  'consentimento, consentimento_em, consulta_em, revisado_por_nome, revisado_em, ' +
  'observacoes, created_at, updated_at';

function nivelTriagem(req) {
  if (['admin', 'diretor'].includes(req.user.role)) return 5;
  return Math.max(
    getEffectiveLevel(req, 'voluntariado') || 0,
    getEffectiveLevel(req, 'kids') || 0,
    getEffectiveLevel(req, 'bridge') || 0,
  );
}

// GET /inscricoes/:id/antecedentes — triagem mais recente da inscrição.
router.get('/inscricoes/:id/antecedentes', async (req, res) => {
  try {
    if (nivelTriagem(req) < 3) return res.status(403).json({ error: 'Sem permissão para ver antecedentes' });
    const { data, error } = await supabase.from('vol_background_checks')
      .select(BGCHECK_FIELDS)
      .eq('inscricao_id', req.params.id)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(1).maybeSingle();
    if (error) throw error;
    res.json({ check: data || null, autoConfigurado: antecedentes.isConfigured() });
  } catch (e) {
    console.error('[antecedentes get]', e.message);
    res.status(500).json({ error: 'Erro ao buscar triagem' });
  }
});

// POST /inscricoes/:id/antecedentes/consultar — roda a consulta automática.
router.post('/inscricoes/:id/antecedentes/consultar', async (req, res) => {
  try {
    if (nivelTriagem(req) < 3) return res.status(403).json({ error: 'Sem permissão' });
    const { data: insc } = await supabase.from('vol_inscricoes')
      .select('id, area, membro_id, nome_completo, nome, sobrenome, cpf, nome_mae, data_nascimento')
      .eq('id', req.params.id).maybeSingle();
    if (!insc) return res.status(404).json({ error: 'Inscrição não encontrada' });
    const area = String(insc.area || '').toLowerCase();
    if (area !== 'kids' && area !== 'bridge') {
      return res.status(400).json({ error: 'Triagem de antecedentes só se aplica a Kids/Bridge' });
    }
    if (!antecedentes.isConfigured()) {
      return res.status(400).json({ error: 'Consulta automática indisponível (token não configurado). Faça a triagem manual.', code: 'sem_token' });
    }

    // Pré-validação: a fonte (PF/Infosimples) exige nome + CPF + data de
    // nascimento + nome da mãe. Se faltar algo, avisa O QUE completar em vez de
    // disparar a consulta e devolver o erro cru do provedor ("Parâmetro(s)
    // inválido(s)."). A coordenação completa o dado na ficha (PATCH /dados).
    const nomeCompleto = insc.nome_completo || [insc.nome, insc.sobrenome].filter(Boolean).join(' ').trim();
    const cpfDigitos = String(insc.cpf || '').replace(/\D+/g, '');
    const faltando = [];
    if (!nomeCompleto || nomeCompleto.trim().length < 3) faltando.push('nome completo');
    if (cpfDigitos.length !== 11) faltando.push('CPF');
    if (!insc.data_nascimento) faltando.push('data de nascimento');
    if (!insc.nome_mae || String(insc.nome_mae).trim().length < 2) faltando.push('nome da mãe');
    if (faltando.length) {
      return res.status(400).json({
        error: `Complete os dados da pessoa antes de consultar os antecedentes: ${faltando.join(', ')}.`,
        code: 'dados_incompletos',
        faltando,
      });
    }

    // Garante a triagem (consentimento atestado pela coordenação ao acionar).
    const chk = await antecedentes.criarCheckParaInscricao(insc, { consentimento: true, origem: 'coordenacao' });
    if (!chk) return res.status(500).json({ error: 'Não foi possível abrir a triagem' });

    // Re-sincroniza o snapshot da triagem com os dados ATUAIS da inscrição.
    // (criarCheckParaInscricao é idempotente e não reescreve uma triagem já
    // existente — sem isso, corrigir o cadastro e "refazer consulta" reusaria o
    // dado velho.)
    await supabase.from('vol_background_checks')
      .update({
        nome_completo: nomeCompleto,
        cpf: cpfDigitos,
        nome_mae: String(insc.nome_mae).trim(),
        data_nascimento: insc.data_nascimento,
        updated_at: new Date().toISOString(),
      })
      .eq('id', chk.id);

    const r = await antecedentes.processarCheck(chk.id);
    const { data } = await supabase.from('vol_background_checks')
      .select(BGCHECK_FIELDS).eq('id', chk.id).maybeSingle();
    res.json({ ...r, check: data || null });
  } catch (e) {
    console.error('[antecedentes consultar]', e.message);
    res.status(500).json({ error: 'Erro ao consultar antecedentes' });
  }
});

// PATCH /antecedentes/:id — revisão humana (aprovar / reprovar / dispensar).
router.patch('/antecedentes/:id', async (req, res) => {
  try {
    if (nivelTriagem(req) < 3) return res.status(403).json({ error: 'Sem permissão' });
    const { acao, observacoes } = req.body || {};
    const MAP = { aprovar: 'aprovado_manual', reprovar: 'reprovado', dispensar: 'dispensado' };
    if (!MAP[acao]) return res.status(400).json({ error: 'Ação inválida' });
    const patch = {
      status: MAP[acao],
      observacoes: observacoes !== undefined ? (observacoes || null) : undefined,
      revisado_por: req.user.userId || null,
      revisado_por_nome: req.user.name || req.user.email || null,
      revisado_em: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    Object.keys(patch).forEach((k) => patch[k] === undefined && delete patch[k]);
    const { data, error } = await supabase.from('vol_background_checks')
      .update(patch).eq('id', req.params.id).is('deleted_at', null)
      .select(BGCHECK_FIELDS).single();
    if (error) throw error;
    res.json(data);
  } catch (e) {
    console.error('[antecedentes revisar]', e.message);
    res.status(500).json({ error: 'Erro ao revisar triagem' });
  }
});

// GET /antecedentes/pendentes — triagens que exigem ação (card de alerta).
router.get('/antecedentes/pendentes', async (req, res) => {
  try {
    if (nivelTriagem(req) < 3) return res.status(403).json({ error: 'Sem permissão' });
    const { data, error } = await supabase.from('vol_background_checks')
      .select(BGCHECK_FIELDS + ', vol_inscricoes(nome_completo)')
      .is('deleted_at', null)
      .in('status', ['pendente', 'possivel_registro', 'erro'])
      .order('created_at', { ascending: true })
      .limit(200);
    if (error) throw error;
    res.json({ rows: data || [], autoConfigurado: antecedentes.isConfigured() });
  } catch (e) {
    console.error('[antecedentes pendentes]', e.message);
    res.status(500).json({ error: 'Erro ao listar pendências' });
  }
});

// ════════════════════════════════════════════════════════════════════════════
// CONTROLE DE ACESSO DE VOLUNTÁRIOS (aba "Acessos")
// Saber quais voluntários têm login + acesso (cargo/responsabilidades) e cruzar
// com o cadastro de Membresia. Criar/garantir login com senha temporária.
// Sensível (mexe em auth/permissões) → admin/diretor apenas.
// ════════════════════════════════════════════════════════════════════════════
function soAdmin(req, res) {
  if (!['admin', 'diretor'].includes(req.user?.role)) {
    res.status(403).json({ error: 'Apenas administradores podem gerir acessos de voluntários.' });
    return false;
  }
  return true;
}
const soDigitos = (v) => String(v || '').replace(/\D/g, '');
function chunk(arr, n) {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}
// Busca um auth user por e-mail (paginado · contorna ausência de filtro direto)
async function acharAuthUserPorEmail(email) {
  const alvo = String(email || '').toLowerCase().trim();
  if (!alvo) return null;
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(`listUsers: ${error.message}`);
    const u = (data.users || []).find((x) => (x.email || '').toLowerCase().trim() === alvo);
    if (u) return u;
    if (!data.users || data.users.length < 1000) break;
  }
  return null;
}

// GET /api/voluntariado/acessos — registro de acesso dos voluntários
// Âncora = vol_profiles. Anota: tem login? acesso base (role) + cargo
// (responsabilidades) + cruzamento com mem_membros (info completa).
router.get('/acessos', async (req, res) => {
  if (!soAdmin(req, res)) return;
  try {
    const q = String(req.query.q || '').trim();
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize) || 25));
    const from = (page - 1) * pageSize;

    let qv = supabase.from('vol_profiles')
      .select('id, full_name, email, cpf, phone, membresia_id, auth_user_id, profile_complete, created_at', { count: 'exact' })
      .order('full_name', { ascending: true })
      .range(from, from + pageSize - 1);
    if (q) qv = qv.or(`full_name.ilike.%${q}%,email.ilike.%${q}%`);
    const { data: vols, count, error } = await qv;
    if (error) return res.status(500).json({ error: error.message });

    const emails = [...new Set((vols || []).map(v => (v.email || '').toLowerCase().trim()).filter(Boolean))];
    const memIds = [...new Set((vols || []).map(v => v.membresia_id).filter(Boolean))];
    const cpfs = [...new Set((vols || []).map(v => soDigitos(v.cpf)).filter(c => c.length >= 11))];

    // profiles por e-mail (quem tem login)
    const profByEmail = new Map();
    for (const ch of chunk(emails, 100)) {
      if (!ch.length) continue;
      const { data } = await supabase.from('profiles')
        .select('id, email, name, role, active').in('email', ch);
      (data || []).forEach(p => profByEmail.set((p.email || '').toLowerCase().trim(), p));
    }
    // usuarios (matriz) por e-mail → cargo
    const usuByEmail = new Map();
    for (const ch of chunk(emails, 100)) {
      if (!ch.length) continue;
      const { data } = await supabase.from('usuarios')
        .select('id, email, cargo_id').in('email', ch);
      (data || []).forEach(u => usuByEmail.set((u.email || '').toLowerCase().trim(), u));
    }
    // cargos (catálogo pequeno)
    const cargoById = new Map();
    {
      const { data } = await supabase.from('cargos').select('id, nome, slug');
      (data || []).forEach(c => cargoById.set(c.id, c));
    }
    // mem_membros por membresia_id e (fallback) por cpf
    const memById = new Map();
    const memByCpf = new Map();
    for (const ch of chunk(memIds, 100)) {
      if (!ch.length) continue;
      const { data } = await supabase.from('mem_membros')
        .select('id, nome, cpf, telefone, email, status, data_nascimento, frequenta_area')
        .in('id', ch).is('deleted_at', null);
      (data || []).forEach(m => memById.set(m.id, m));
    }
    for (const ch of chunk(cpfs, 100)) {
      if (!ch.length) continue;
      const { data } = await supabase.from('mem_membros')
        .select('id, nome, cpf, telefone, email, status, data_nascimento, frequenta_area')
        .in('cpf', ch).is('deleted_at', null);
      (data || []).forEach(m => memByCpf.set(soDigitos(m.cpf), m));
    }

    const rows = (vols || []).map(v => {
      const email = (v.email || '').toLowerCase().trim();
      const prof = profByEmail.get(email) || null;
      const temLogin = !!(v.auth_user_id || prof);
      const usu = usuByEmail.get(email) || null;
      const cargo = usu?.cargo_id ? cargoById.get(usu.cargo_id) : null;
      const membro = (v.membresia_id && memById.get(v.membresia_id))
        || memByCpf.get(soDigitos(v.cpf)) || null;
      return {
        vol_profile_id: v.id,
        nome: v.full_name,
        email: v.email,
        cpf: v.cpf,
        telefone: v.phone,
        perfil_completo: !!v.profile_complete,
        tem_login: temLogin,
        acesso: prof ? { id: prof.id, role: prof.role, ativo: prof.active } : null,
        cargo: cargo ? { id: cargo.id, nome: cargo.nome, slug: cargo.slug } : null,
        membresia: membro
          ? { id: membro.id, nome: membro.nome, cpf: membro.cpf, telefone: membro.telefone,
              email: membro.email, status: membro.status, data_nascimento: membro.data_nascimento,
              frequenta_area: membro.frequenta_area, via: v.membresia_id ? 'vinculo' : 'cpf' }
          : null,
      };
    });

    res.json({ rows, total: count || 0, page, pageSize });
  } catch (e) {
    console.error('[voluntariado/acessos]', e.message);
    res.status(500).json({ error: 'Erro ao carregar acessos.' });
  }
});

// GET /api/voluntariado/acessos/cargos — cargos disponíveis pro select de acesso
router.get('/acessos/cargos', async (req, res) => {
  if (!soAdmin(req, res)) return;
  try {
    const { data } = await supabase.from('cargos')
      .select('id, slug, nome, categoria').eq('ativo', true).order('nome');
    res.json(data || []);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/voluntariado/acessos/criar-login — cria/garante login do voluntário
// com SENHA TEMPORÁRIA (o usuário troca no 1º acesso · password_changed_at fica
// nulo → dispara o modal de troca). Amarra o cargo (responsabilidades).
router.post('/acessos/criar-login', async (req, res) => {
  if (!soAdmin(req, res)) return;
  try {
    const { vol_profile_id, nome, email, cpf, data_nascimento, cargo_slug, senha } = req.body || {};
    const mail = String(email || '').toLowerCase().trim();
    if (!nome || !mail) return res.status(400).json({ error: 'Nome e e-mail são obrigatórios.' });
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(mail)) return res.status(400).json({ error: 'E-mail inválido.' });
    if (!senha || String(senha).length < 8) return res.status(400).json({ error: 'A senha temporária precisa ter ao menos 8 caracteres.' });

    // 1. auth user (cria ou redefine senha)
    let authUser = await acharAuthUserPorEmail(mail);
    let uid = authUser?.id;
    let jaExistia = !!uid;
    if (!uid) {
      const { data, error } = await supabase.auth.admin.createUser({
        email: mail, password: String(senha), email_confirm: true,
        user_metadata: { name: nome },
      });
      if (error) return res.status(400).json({ error: `Falha ao criar login: ${error.message}` });
      uid = data.user.id;
    } else {
      await supabase.auth.admin.updateUserById(uid, { password: String(senha) });
    }

    // 2. profile (acesso base) · password_changed_at nulo = força troca no 1º acesso.
    //    is_membro_only=false: o trigger handle_new_user marca signups como
    //    "membro" (cai no /devocional). Aqui é colaborador com acesso ao ERP.
    const { error: pErr } = await supabase.from('profiles').upsert({
      id: uid, name: nome, email: mail, role: 'assistente', active: true,
      is_membro_only: false,
    }, { onConflict: 'id' });
    if (pErr) return res.status(400).json({ error: `Falha no profile: ${pErr.message}` });

    // 3. usuarios (matriz) + cargo
    let cargoId = null;
    if (cargo_slug) {
      const { data: cg } = await supabase.from('cargos').select('id').eq('slug', cargo_slug).maybeSingle();
      cargoId = cg?.id || null;
    }
    const { data: usuExist } = await supabase.from('usuarios').select('id').eq('email', mail).maybeSingle();
    if (usuExist?.id) {
      const patch = { nome };
      if (cargoId) patch.cargo_id = cargoId;
      await supabase.from('usuarios').update(patch).eq('id', usuExist.id);
    } else {
      await supabase.from('usuarios').insert({ nome, email: mail, cargo_id: cargoId });
    }

    // 4. liga o vol_profile ao login (se veio do registro de voluntário)
    if (vol_profile_id) {
      await supabase.from('vol_profiles').update({ auth_user_id: uid }).eq('id', vol_profile_id);
    }

    bustPermissionCaches();
    res.json({
      ok: true, user_id: uid, ja_existia: jaExistia,
      aviso: 'Login pronto. Repasse a senha temporária; ele troca no 1º acesso. Pode levar alguns minutos pra liberar (cache de permissões).',
    });
  } catch (e) {
    console.error('[voluntariado/acessos/criar-login]', e.message);
    res.status(500).json({ error: 'Erro ao criar login.' });
  }
});

module.exports = router;
