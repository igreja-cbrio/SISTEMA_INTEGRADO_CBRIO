const router = require('express').Router();
const { authenticate, authorizeModule, getEffectiveLevel, bustPermissionCaches } = require('../middleware/auth');
const { supabase } = require('../utils/supabase');
const { acharOuCriarGuardado, acharMembroGuardado, normalizarTelefone } = require('../services/membroMatch');
const { reconciliarCpfTardio } = require('../services/cpfReconciliar');
const { cpfValido } = require('../utils/cpf');
const { getPCCredentials, fetchWithRetry, PC_SERVICES_BASE, assignVolunteersToTeams, syncTeamMembersFromSchedules, fetchAllServiceTypes } = require('../services/planningCenter');
const { enqueueSync } = require('../services/cerebroSync');
const { resolverVoluntarioPorQr } = require('../services/volCheckinResolver');
const { notificar } = require('../services/notificar');
const { mountWhatsappAuto } = require('./whatsappAutoRoutes');
const { requireCron } = require('../utils/cronAuth');
const { diaBRT, avaliarIndisponibilidade, textoIndisponibilidade, indexarPorPessoa, ehPessoaEscalavel } = require('../utils/volDisponibilidade');
const { semanasSemServir, rotuloTempoSemServir, distribuirVagas } = require('../utils/volRodizio');
const { montarCobertura, contarStatus } = require('../utils/volCobertura');
const antecedentes = require('../services/antecedentesCriminais');
const { executarSyncCompleto } = require('../services/voluntariadoSync');
const { anexarMarcadores, podeVerMarcadorSensivel } = require('../services/jornadaMarcadores');
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

// Cron (sem login · CRON_SECRET) · drena os disparos de e-mail pros voluntários:
// promove agendados vencidos e retoma campanhas 'enviando' com pendentes
// (limite ~30 msgs/min do Exchange · blasts grandes atravessam várias execuções).
router.get('/cron/emails', requireCron, async (req, res) => {
  try {
    const { drenarDisparos } = require('../services/volEmailSender');
    const r = await drenarDisparos({ budgetMs: 270000 });
    res.json({ ok: true, ...r });
  } catch (e) {
    console.error('[vol/cron/emails]', e.message);
    res.status(500).json({ error: 'Erro no cron de e-mails do voluntariado' });
  }
});

router.use(authenticate, authorizeModule('membresia', 1));

// Disparo de e-mails pros voluntários (composer + segmentos + histórico).
// Sub-router exige voluntariado>=3 em todas as rotas.
router.use('/emails', require('./volEmails'));

// ══════════════════════════════════════════════════════════════
// CONFIG · régua do Termômetro (limiares de check-ins por categoria)
// GET aberto (herda membresia>=1) · PUT exige voluntariado>=3.
// ══════════════════════════════════════════════════════════════
const VOL_CONFIG_DEFAULT = { muito_ativo_min: 8, regular_min: 4, pouco_ativo_min: 1, sobrecarga_limite: 8 };

router.get('/config', async (req, res) => {
  try {
    const { data } = await supabase.from('vol_config').select('*').eq('id', 1).maybeSingle();
    res.json({ ...VOL_CONFIG_DEFAULT, ...(data || {}) });
  } catch (e) {
    console.error('[vol/config get]', e.message);
    res.json(VOL_CONFIG_DEFAULT); // degrada pros defaults · o termômetro nunca quebra
  }
});

router.put('/config', authorizeModule('voluntariado', 3), async (req, res) => {
  try {
    const toInt = (v, def) => {
      const n = Math.round(Number(v));
      return Number.isFinite(n) && n >= 0 ? n : def;
    };
    const cfg = {
      muito_ativo_min: toInt(req.body?.muito_ativo_min, VOL_CONFIG_DEFAULT.muito_ativo_min),
      regular_min: toInt(req.body?.regular_min, VOL_CONFIG_DEFAULT.regular_min),
      pouco_ativo_min: toInt(req.body?.pouco_ativo_min, VOL_CONFIG_DEFAULT.pouco_ativo_min),
      sobrecarga_limite: toInt(req.body?.sobrecarga_limite, VOL_CONFIG_DEFAULT.sobrecarga_limite),
    };
    // Ordem coerente: muito_ativo_min >= regular_min >= pouco_ativo_min >= 1.
    if (!(cfg.muito_ativo_min >= cfg.regular_min && cfg.regular_min >= cfg.pouco_ativo_min && cfg.pouco_ativo_min >= 1)) {
      return res.status(400).json({ error: 'Os limites devem ser decrescentes: Muito Ativo ≥ Regular ≥ Pouco Ativo ≥ 1.' });
    }
    const { data, error } = await supabase
      .from('vol_config')
      .upsert({ id: 1, ...cfg, updated_at: new Date().toISOString(), updated_by: req.user?.id || null }, { onConflict: 'id' })
      .select('*')
      .single();
    if (error) throw error;
    res.json(data);
  } catch (e) {
    console.error('[vol/config put]', e.message);
    res.status(500).json({ error: 'Erro ao salvar a régua do termômetro' });
  }
});

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
      // Filtro por SITUAÇÃO (ativo/inativo/novo). Inativo = já serviu e parou 3+
      // meses (exclui novos/sem-serviço, quem saiu da igreja e afastados por saúde).
      if (req.query.status === 'ativos') q = q.eq('situacao', 'ativo');
      else if (req.query.status === 'inativos') q = q.eq('situacao', 'inativo');
      else if (req.query.status === 'novos') q = q.eq('situacao', 'novo');
      // Vínculo = ligado a um MEMBRO (CPF). A lista já é de voluntários reais.
      if (req.query.vinculo === 'nao') q = q.is('membro_id', null);
      else if (req.query.vinculo === 'sim') q = q.not('membro_id', 'is', null);
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
    const contarSituacao = (situ) => supabase.from('vw_vol_frequencia')
      .select('chave', { count: 'exact', head: true }).eq('situacao', situ);
    const { count: total } = await supabase.from('vw_vol_frequencia').select('chave', { count: 'exact', head: true });
    const { count: ativos } = await contarSituacao('ativo');
    const { count: inativos } = await contarSituacao('inativo');
    const { count: novos } = await contarSituacao('novo');

    // Enriquece com o motivo de inatividade (por chave · tabela vol_inatividade)
    const chaves = [...new Set(data.map(r => r.chave).filter(Boolean))];
    const motivoByChave = {};
    for (let i = 0; i < chaves.length; i += 500) {
      const lote = chaves.slice(i, i + 500);
      const { data: ms } = await supabase.from('vol_inatividade')
        .select('chave, motivo, detalhe, registrado_em').in('chave', lote);
      (ms || []).forEach(m => { motivoByChave[m.chave] = m; });
    }
    const itens = data.map(r => ({
      ...r,
      inatividade_motivo: motivoByChave[r.chave]?.motivo || null,
      inatividade_detalhe: motivoByChave[r.chave]?.detalhe || null,
      inatividade_em: motivoByChave[r.chave]?.registrado_em || null,
    }));
    res.json({ resumo: { total: total || 0, ativos: ativos || 0, inativos: inativos || 0, novos: novos || 0 }, itens });
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

// PUT /api/voluntariado/frequencia/inatividade  body { chave, motivo, detalhe }
// Registra/edita o MOTIVO pelo qual o voluntário está inativo. motivo vazio = limpa.
// Guardado por `chave` da vw_vol_frequencia (cpf:/membresia:/id:).
router.put('/frequencia/inatividade', authorizeModule('membresia', 2), async (req, res) => {
  try {
    const chave = String(req.body?.chave || '').trim();
    if (!chave) return res.status(400).json({ error: 'chave obrigatória' });
    const motivo = String(req.body?.motivo || '').trim().slice(0, 60);
    const detalhe = req.body?.detalhe != null ? String(req.body.detalhe).trim().slice(0, 1000) : null;
    if (!motivo) {
      await supabase.from('vol_inatividade').delete().eq('chave', chave);
      return res.json({ ok: true, cleared: true });
    }
    const { data, error } = await supabase.from('vol_inatividade')
      .upsert({ chave, motivo, detalhe: detalhe || null, registrado_por: req.user?.id ?? null, updated_at: new Date().toISOString() },
        { onConflict: 'chave' })
      .select('chave, motivo, detalhe, registrado_em').single();
    if (error) return res.status(500).json({ error: error.message });
    res.json({ ok: true, motivo: data });
  } catch (e) {
    console.error('[vol] inatividade', e.message);
    res.status(500).json({ error: 'Erro ao salvar o motivo' });
  }
});

// POST /api/voluntariado/frequencia/saiu-igreja  body { chave, membro_id, detalhe }
// Marca que o voluntário SAIU da igreja: registra motivo 'saiu_igreja' no
// voluntariado E, se houver membro vinculado, muda o status dele pra 'inativo'
// na Membresia (reflete no cadastro). Sai da contagem de inativos do voluntariado.
router.post('/frequencia/saiu-igreja', authorizeModule('membresia', 2), async (req, res) => {
  try {
    const chave = String(req.body?.chave || '').trim();
    if (!chave) return res.status(400).json({ error: 'chave obrigatória' });
    const membroId = req.body?.membro_id ? String(req.body.membro_id).trim() : null;
    const detalhe = req.body?.detalhe != null ? String(req.body.detalhe).trim().slice(0, 1000) : null;

    // 1) marca no voluntariado (motivo saiu_igreja · por chave)
    const { error: viErr } = await supabase.from('vol_inatividade')
      .upsert({ chave, motivo: 'saiu_igreja', detalhe: detalhe || null, registrado_por: req.user?.id ?? null, updated_at: new Date().toISOString() },
        { onConflict: 'chave' });
    if (viErr) return res.status(500).json({ error: viErr.message });

    // 2) reflete na Membresia (se houver cadastro de membro vinculado)
    let membroAtualizado = false;
    if (membroId && /^[0-9a-f-]{36}$/i.test(membroId)) {
      const { error: mmErr } = await supabase.from('mem_membros')
        .update({ status: 'inativo' }).eq('id', membroId).is('deleted_at', null);
      if (mmErr) console.error('[vol] saiu-igreja mem_membros:', mmErr.message);
      else membroAtualizado = true;
    }
    res.json({ ok: true, membro_atualizado: membroAtualizado });
  } catch (e) {
    console.error('[vol] saiu-igreja', e.message);
    res.status(500).json({ error: 'Erro ao registrar a saída' });
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
      if (cleanCpf.length !== 11 || !cpfValido(cleanCpf)) {
        return res.status(400).json({ error: 'CPF inválido — confira os dígitos' });
      }
      const { data: membro } = await supabase.from('mem_membros')
        .select('id, nome, telefone, email').eq('cpf', cleanCpf).is('deleted_at', null).maybeSingle();
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
    if (cleanCpf.length !== 11 || !cpfValido(cleanCpf)) return res.status(400).json({ error: 'CPF inválido — confira os dígitos' });
    const cleanPhone = String(celular).replace(/\D/g, '');
    if (cleanPhone.length < 10) return res.status(400).json({ error: 'Celular invalido' });

    const fullName = `${nome.trim()} ${sobrenome.trim()}`.replace(/\s+/g, ' ');

    // Guarda na origem: CPF→e-mail→(telefone+nome)→cria · não faz mais INSERT
    // cru (matcher compartilhado · colisão sem nome batendo vira fila do Kevyn).
    let membro;
    try {
      const r = await acharOuCriarGuardado({
        cpf: cleanCpf, telefone: cleanPhone, nome: fullName, status: 'visitante',
        origem: 'voluntariado_ficha',
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
    const ciArr = (checkins || []).map((c) => ({ ...c, service: norm1(c.service) }));
    const escArr = (escalas || []).map((e) => ({ ...e, service: norm1(e.service) }));
    const porCulto = {};
    for (const s of servArr) porCulto[s.culto_label] = (porCulto[s.culto_label] || 0) + 1;
    const d4 = new Date(); d4.setMonth(d4.getMonth() - 4);
    const desde4m = d4.toISOString().slice(0, 10);
    const serv4m = servArr.filter((s) => s.data >= desde4m).length;

    // Equipes/áreas onde serve (das escalas)
    const equipes = [...new Set(escArr.map((e) => e.team_name).filter(Boolean))];

    // Termômetro de atividade · pela recência da última atividade (serviço ou
    // check-in) + volume nos últimos 4 meses. Régua alinhada à do sistema
    // (voluntário inativo = 90+ dias sem servir).
    const ultimoServico = servArr[0]?.data || null;
    const ultimoCheckin = ciArr[0]?.checked_in_at || null;
    const ultimaAtividade = [ultimoServico, ultimoCheckin].filter(Boolean).sort().pop() || null;
    let diasDesde = Infinity;
    if (ultimaAtividade) diasDesde = Math.floor((Date.now() - new Date(ultimaAtividade).getTime()) / 86400000);
    let nivel, label;
    if (diasDesde <= 30 && serv4m >= 4) { nivel = 'muito_ativo'; label = 'Muito ativo'; }
    else if (diasDesde <= 45) { nivel = 'ativo'; label = 'Ativo'; }
    else if (diasDesde <= 90) { nivel = 'pouco_ativo'; label = 'Pouco ativo'; }
    else { nivel = 'inativo'; label = 'Inativo'; }
    const termometro = {
      nivel, label,
      dias_desde_ultima_atividade: Number.isFinite(diasDesde) ? diasDesde : null,
      ultima_atividade: ultimaAtividade,
      servicos_4m: serv4m,
    };

    res.json({
      profile,
      servicos: servArr,
      checkins: ciArr,
      escalas: escArr,
      termometro,
      equipes,
      totais: {
        total_servicos: servArr.length,
        servicos_4m: serv4m,
        total_checkins: ciArr.length,
        ultimo_servico: ultimoServico,
        por_culto: porCulto,
      },
    });
  } catch (e) {
    console.error('[vol] profile detalhe', e.message);
    res.status(500).json({ error: 'Erro ao carregar detalhe do voluntário' });
  }
});

// GET /voluntariado/aniversariantes-semana → voluntários que fazem aniversário
// nos próximos 7 dias (hoje..+6), pra a coordenação parabenizar. Data de
// nascimento vem do membro (via membresia_id) ou da inscrição. RPC
// fn_vol_aniversariantes_semana (SECURITY DEFINER).
router.get('/aniversariantes-semana', async (req, res) => {
  try {
    const { data, error } = await supabase.rpc('fn_vol_aniversariantes_semana');
    if (error) throw error;
    const rows = (data || []).map((r) => ({
      vol_profile_id: r.vol_profile_id,
      nome: r.nome,
      telefone: r.telefone || null,
      data_nascimento: r.data_nascimento,
      aniversario: r.aniversario, // a data do aniversário nesta semana
      dow: r.dow,
      hoje: r.aniversario === new Date().toISOString().slice(0, 10),
      parabenizado: false,
    }));
    // marca quem já foi parabenizado neste ano (controle do líder)
    const anoAtual = new Date().getFullYear();
    const ids = rows.map((r) => r.vol_profile_id).filter(Boolean);
    if (ids.length) {
      const { data: pb } = await supabase.from('vol_parabens')
        .select('vol_profile_id').eq('ano', anoAtual).in('vol_profile_id', ids);
      const enviados = new Set((pb || []).map((p) => p.vol_profile_id));
      rows.forEach((r) => { r.parabenizado = enviados.has(r.vol_profile_id); });
    }
    res.json({ rows });
  } catch (e) {
    console.error('[vol] aniversariantes-semana', e.message);
    res.status(500).json({ error: 'Erro ao carregar aniversariantes' });
  }
});

// POST /voluntariado/aniversariantes/:volProfileId/parabenizar — envia o template
// de aniversário pela API (respeita opt-in · Marketing) e marca como enviado.
const MSG_RESULTADO = {
  sem_optin: 'A pessoa não deu consentimento (opt-in) para receber mensagens no WhatsApp. Use o botão de abrir no WhatsApp para falar manualmente.',
  sem_cadastro: 'Voluntário sem cadastro de membro (sem opt-in registrado). Use o WhatsApp manual.',
  sem_membro: 'Voluntário sem cadastro de membro vinculado.',
  sem_telefone: 'Voluntário sem telefone.',
  telefone_invalido: 'Telefone inválido.',
  template_nao_configurado: 'Template de aniversário não configurado na Meta/env.',
  wpp_nao_configurado: 'WhatsApp não configurado.',
};
router.post('/aniversariantes/:volProfileId/parabenizar', async (req, res) => {
  try {
    const volId = req.params.volProfileId;
    const { data: vp } = await supabase.from('vol_profiles')
      .select('id, full_name, membresia_id').eq('id', volId).maybeSingle();
    if (!vp) return res.status(404).json({ error: 'Voluntário não encontrado' });

    const primeiro = String(vp.full_name || '').trim().split(/\s+/)[0] || '';

    // ⚠️ O cron das 9h já pode ter parabenizado hoje — a tela mostra a SEMANA,
    // então o clique da coordenação e o automático se cruzam. O `parabenizado`
    // que a tela exibe vem de `vol_parabens`, e o cron antigo não gravava lá:
    // quem o automático alcançou aparecia como "não parabenizado". A guarda é no
    // SERVIDOR porque a decisão de não mandar 2× não pode depender da tela.
    const { jaParabenizado, registrarParabens } = require('../services/aniversarioVoluntario');
    if (await jaParabenizado({ membroId: vp.membresia_id, volProfileId: volId })) {
      return res.status(409).json({
        ok: false, resultado: 'ja_parabenizado',
        error: 'Esta pessoa já foi parabenizada este ano (pela equipe ou pelo envio automático do dia). Se quiser falar de novo, use o botão de abrir no WhatsApp.',
      });
    }

    let resultado = 'sem_cadastro';
    let sent = false;
    if (vp.membresia_id) {
      const wpp = require('../services/whatsappService');
      const r = await wpp.notificarMembro(vp.membresia_id, 'aniversario', [primeiro]);
      if (r?.sent) { sent = true; resultado = 'enviado'; }
      else resultado = r?.skipped || r?.reason || 'falhou';
    }

    if (sent) {
      // Registro pelo helper compartilhado: o ano é calculado em BRT nos dois
      // caminhos (`getFullYear()` no relógio UTC do servidor já virou o ano
      // seguinte na noite de 31/12, e aí o dedup do ano novo não encontraria o
      // parabéns dado horas antes).
      await registrarParabens({
        volProfileId: volId,
        porUserId: req.user.userId || req.user.id,
        resultado,
      });
      return res.json({ ok: true, resultado });
    }
    return res.status(400).json({ ok: false, resultado, error: MSG_RESULTADO[resultado] || 'Não foi possível enviar pela API. Use o WhatsApp manual.' });
  } catch (e) {
    console.error('[vol] parabenizar', e.message);
    res.status(500).json({ error: 'Erro ao parabenizar' });
  }
});

router.post('/profiles', async (req, res) => {
  try {
    const { full_name, email, phone, cpf } = req.body;
    if (!full_name || !full_name.trim()) return res.status(400).json({ error: 'Nome obrigatorio' });
    const cleanCpf = cpf ? cpf.replace(/\D/g, '') : null;
    if (cleanCpf && (cleanCpf.length !== 11 || !cpfValido(cleanCpf))) {
      return res.status(400).json({ error: 'CPF inválido — confira os dígitos' });
    }

    // Membresia e fonte única: garantir mem_membros antes de criar vol_profile
    let membresiaId = null;
    try {
      const { findOrCreateMembro } = require('./pessoas');
      const r = await findOrCreateMembro({
        cpf: cleanCpf, email, telefone: phone, nome: full_name.trim(),
        status: 'visitante', origem: 'voluntariado_perfil',
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

// Editar o CADASTRO do voluntário (nome/e-mail/telefone/CPF) refletindo na
// MEMBRESIA — voluntário é membro, então a fonte única é mem_membros. Vale
// também pros perfis vindos do Planning Center: marca protegido_sync=true pra
// o sync horário não reverter o nome/e-mail editado. Guard voluntariado>=3
// (Ariel entra por boost de área). Backend usa service_role → escreve em
// mem_membros mesmo sem a pessoa ser admin/diretor.
router.put('/profiles/:id/cadastro', authorizeModule('voluntariado', 3), async (req, res) => {
  try {
    const { full_name, email, phone, cpf } = req.body || {};
    if (!full_name || !String(full_name).trim()) {
      return res.status(400).json({ error: 'Nome obrigatório' });
    }
    const nome = String(full_name).trim();

    const { data: perfil, error: pErr } = await supabase.from('vol_profiles')
      .select('id, full_name, email, phone, cpf, membresia_id, planning_center_id')
      .eq('id', req.params.id).maybeSingle();
    if (pErr) throw pErr;
    if (!perfil) return res.status(404).json({ error: 'Voluntário não encontrado' });

    // Normalização (mesmo espírito da Membresia): CPF com DV (grandfathering do
    // valor atual), telefone digits-only 10-11, e-mail básico.
    let cleanCpf = perfil.cpf || null;
    if (cpf !== undefined) {
      const dig = String(cpf || '').replace(/\D/g, '');
      if (!dig) cleanCpf = null;
      else if (dig === String(perfil.cpf || '')) cleanCpf = dig; // idêntico ao atual passa
      else if (dig.length !== 11 || !cpfValido(dig)) return res.status(400).json({ error: 'CPF inválido — confira os dígitos' });
      else cleanCpf = dig;
    }
    let cleanPhone = perfil.phone || null;
    if (phone !== undefined) {
      let d = String(phone || '').replace(/\D/g, '');
      if (!d) cleanPhone = null;
      else {
        if (d.startsWith('55') && d.length > 11) d = d.slice(2);
        if (d.length < 10 || d.length > 11) return res.status(400).json({ error: 'Telefone inválido — DDD + número (10 ou 11 dígitos)' });
        cleanPhone = d;
      }
    }
    let cleanEmail = perfil.email || null;
    if (email !== undefined) {
      const e = String(email || '').trim().toLowerCase();
      if (!e) cleanEmail = null;
      else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return res.status(400).json({ error: 'E-mail inválido' });
      else cleanEmail = e;
    }

    // 1) Resolve/garante o vínculo com a membresia (fonte única). Se já tem, usa;
    //    senão, matcher canônico (CPF→e-mail+nome→telefone+nome→nasc+nome).
    let membresiaId = perfil.membresia_id || null;
    if (!membresiaId) {
      try {
        const r = await acharOuCriarGuardado({
          cpf: cleanCpf, email: cleanEmail, telefone: cleanPhone, nome,
          status: 'visitante', origem: 'voluntariado_edicao',
        });
        membresiaId = r?.membro_id || null;
      } catch (e) {
        console.error('[vol] cadastro matcher:', e.message);
      }
    }

    // 2) Propaga o cadastro pra mem_membros (fonte única que o sync do PC não toca).
    if (membresiaId) {
      const patchMembro = { nome };
      if (cleanEmail !== null) patchMembro.email = cleanEmail;
      if (cleanPhone !== null) patchMembro.telefone = cleanPhone;
      if (cleanCpf !== null) patchMembro.cpf = cleanCpf;
      const { error: mErr } = await supabase.from('mem_membros')
        .update(patchMembro).eq('id', membresiaId);
      if (mErr) {
        // colisão de CPF/e-mail único no cadastro de membro → mensagem clara
        const dup = /duplicate|unique|23505/i.test(mErr.message || '');
        return res.status(dup ? 409 : 400).json({
          error: dup ? 'CPF ou e-mail já pertence a outra pessoa na membresia.' : mErr.message,
        });
      }
      enqueueSync('membro', membresiaId, 'upsert').catch(() => {});
    }

    // 3) Atualiza o vol_profile + protege do sync do PC (nome/e-mail não voltam).
    const { data, error } = await supabase.from('vol_profiles')
      .update({
        full_name: nome, email: cleanEmail, phone: cleanPhone, cpf: cleanCpf,
        membresia_id: membresiaId, protegido_sync: true, profile_complete: true,
      })
      .eq('id', req.params.id).select().single();
    if (error) return res.status(400).json({ error: error.message });
    enqueueSync('voluntario', req.params.id, 'upsert').catch(() => {});

    res.json({ ...data, membresia_vinculada: !!membresiaId });
  } catch (e) {
    console.error('[vol] editar cadastro:', e.message);
    res.status(500).json({ error: 'Erro ao salvar o cadastro do voluntário' });
  }
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
// SUPERVISORES DE ÁREA (concedido no sistema · usado pelo app pra montar escala)
// ══════════════════════════════════════════════════════════════
router.get('/supervisores', authorizeModule('voluntariado', 3), async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('vol_area_supervisores')
      .select('id, area, created_at, membro:mem_membros(id, nome, telefone, foto_url)')
      .order('area', { ascending: true });
    if (error) throw error;
    res.json(data || []);
  } catch (e) {
    console.error('[voluntariado] supervisores get:', e.message);
    res.status(500).json({ error: 'Erro ao listar supervisores' });
  }
});

router.post('/supervisores', authorizeModule('voluntariado', 3), async (req, res) => {
  try {
    const { membro_id, area } = req.body || {};
    if (!membro_id || !area) return res.status(400).json({ error: 'membro_id e area obrigatórios' });
    const { data, error } = await supabase
      .from('vol_area_supervisores')
      .insert({ membro_id, area: String(area).trim().toLowerCase(), concedido_por: req.user?.userId || null })
      .select('id, area, created_at, membro:mem_membros(id, nome, telefone, foto_url)')
      .single();
    if (error) {
      if (error.code === '23505') return res.status(409).json({ error: 'Essa pessoa já é supervisora dessa área' });
      throw error;
    }
    res.status(201).json(data);
  } catch (e) {
    console.error('[voluntariado] supervisores post:', e.message);
    res.status(500).json({ error: 'Erro ao conceder supervisão' });
  }
});

router.delete('/supervisores/:id', authorizeModule('voluntariado', 3), async (req, res) => {
  try {
    const { error } = await supabase.from('vol_area_supervisores').delete().eq('id', req.params.id);
    if (error) throw error;
    res.json({ ok: true });
  } catch (e) {
    console.error('[voluntariado] supervisores delete:', e.message);
    res.status(500).json({ error: 'Erro ao remover supervisão' });
  }
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
    // Arquivados (saíram do PCO na reconciliação) ficam FORA por padrão;
    // ?incluir_arquivados=1 traz todos (a VolLista usa isso pra o card/filtro).
    const incluirArquivados = ['1', 'true'].includes(String(req.query.incluir_arquivados || ''));
    // Pagina pra contornar o cap de 1000 do PostgREST (número real · 1 a 1).
    let all = []; let offset = 0;
    while (true) {
      let q = supabase
        .from('vol_profiles')
        .select(`
          id, full_name, email, avatar_url, planning_center_id, qr_code, phone, cpf, arquivado, membresia_id,
          team_members:vol_team_members(
            id, team_id, position_id,
            team:vol_teams(id, name, color),
            position:vol_positions(id, name)
          )
        `)
        .order('full_name').range(offset, offset + 999);
      if (!incluirArquivados) q = q.eq('arquivado', false);
      const { data, error } = await q;
      if (error) return res.status(400).json({ error: error.message });
      if (!data || !data.length) break;
      all = all.concat(data);
      if (data.length < 1000) break;
      offset += 1000;
    }

    // Marcadores de jornada (pedido do Arthur Serpa / Pr. Nélio · 13/08/2026 —
    // o e-mail cita Voluntariado por nome). Liga por `membresia_id`: perfil sem
    // vínculo com o cadastro da pessoa fica SEM marcador, e é honesto — não dá
    // pra afirmar nada sobre a jornada de quem o sistema não conseguiu ligar
    // a um `mem_membros` (o import do Planning Center deixou muitos assim).
    // ⚠️ Generosidade continua gated no servidor (decisão do Matheus).
    await anexarMarcadores(all, (p) => p.membresia_id || null, {
      incluirSensiveis: podeVerMarcadorSensivel(req.user),
    });

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
// Dados do relatório de presença por PERÍODO — busca no servidor com paginação
// interna (o front buscava TUDO e o PostgREST capa em 1000 · vol_schedules tem
// 3k+ linhas → escalas de cultos recentes sumiam do relatório · bug 06/07).
router.get('/relatorio-dados', async (req, res) => {
  try {
    const { desde, ate } = req.query;
    if (!desde || !ate) return res.status(400).json({ error: 'desde e ate são obrigatórios (YYYY-MM-DD)' });

    const { data: services, error: eSvc } = await supabase
      .from('vol_services').select('*')
      .gte('scheduled_at', `${desde}T00:00:00-03:00`)
      .lte('scheduled_at', `${ate}T23:59:59-03:00`)
      .order('scheduled_at', { ascending: false })
      .limit(500);
    if (eSvc) throw eSvc;

    const ids = (services || []).map(s => s.id);
    const schedules = [];
    const checkIns = [];
    for (let i = 0; i < ids.length; i += 50) {
      const lote = ids.slice(i, i + 50);
      for (let from = 0; ; from += 1000) {
        const { data, error } = await supabase.from('vol_schedules')
          .select('*').in('service_id', lote).order('id').range(from, from + 999);
        if (error) throw error;
        schedules.push(...(data || []));
        if (!data || data.length < 1000) break;
      }
      for (let from = 0; ; from += 1000) {
        const { data, error } = await supabase.from('vol_check_ins')
          .select('*, volunteer:vol_profiles(id, full_name, planning_center_id), schedule:vol_schedules(id, volunteer_name, volunteer_id, team_name, position_name), service:vol_services(id, name, scheduled_at)')
          .in('service_id', lote).order('id').range(from, from + 999);
        if (error) throw error;
        checkIns.push(...(data || []));
        if (!data || data.length < 1000) break;
      }
    }

    res.json({ services: services || [], schedules, checkIns });
  } catch (e) {
    console.error('[vol/relatorio-dados]', e.message);
    res.status(500).json({ error: 'Erro ao carregar os dados do relatório' });
  }
});

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
    const { schedule_id, volunteer_id, service_id, method, is_unscheduled, checked_in_at, novo_cadastro, volunteer_name } = req.body;
    if (!method) return res.status(400).json({ error: 'method obrigatorio' });
    const nomeDigitado = (volunteer_name || '').trim().slice(0, 120) || null;

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
            (vpName && norm(s.volunteer_name) === vpName) ||
            // fluxo "sem escala" com nome digitado: tenta casar a escala pelo nome
            (nomeDigitado && norm(s.volunteer_name) === norm(nomeDigitado))
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

    // Nome digitado sem vínculo resolvido: tenta casar com um perfil ÚNICO pelo
    // nome (não-arquivado) pra não perder a identidade do check-in sem escala.
    if (!resolvedVolunteerId && nomeDigitado) {
      const { data: cands } = await supabase.from('vol_profiles')
        .select('id, full_name')
        .eq('arquivado', false)
        .ilike('full_name', nomeDigitado);
      const exatos = (cands || []).filter(p => norm(p.full_name) === norm(nomeDigitado));
      if (exatos.length === 1) resolvedVolunteerId = exatos[0].id;
    }

    // Guard anti-cliente desatualizado (06/07): frontends com o chunk ANTIGO
    // mandavam check-in "sem escala" sem NENHUMA identidade (nem volunteer_id,
    // nem escala, nem nome) e o registro nascia anônimo pra sempre (171 no
    // domingo 05/07 + 60 retroativos na segunda). Check-in anônimo não serve
    // pra análise nenhuma — recusa com instrução de recarregar a página.
    if (!resolvedVolunteerId && !resolvedScheduleId && !nomeDigitado) {
      return res.status(400).json({
        error: 'O sistema foi atualizado: recarregue a página (F5 ou Ctrl+R) e refaça o check-in — agora o nome do voluntário fica registrado.',
      });
    }

    const { data, error } = await supabase.from('vol_check_ins')
      .insert({
        schedule_id: resolvedScheduleId,
        volunteer_id: resolvedVolunteerId,
        service_id: service_id || null,
        checked_in_by: req.user.userId,
        method,
        is_unscheduled: resolvedUnscheduled || false,
        // snapshot do nome (fluxo sem escala) — mesmo com vínculo, não faz mal guardar
        ...(nomeDigitado ? { volunteer_name: nomeDigitado } : {}),
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
      if (cleanCpf.length !== 11 || !cpfValido(cleanCpf)) return res.status(400).json({ error: 'CPF inválido — confira os dígitos' });
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

// ⚠️ Escrita em tipo de culto é ADMIN do voluntariado (nível 5) — o herdado do
// router (`membresia`, 1 = LEITURA) deixava 27 cargos alcançarem POST/PUT/DELETE
// (achado 🔴 da varredura de cultos de domingo · docs/cultos-domingo/).
// ⚠️ O POST NÃO cobre has_kids/has_online/presencial_label — tipo de culto NOVO
// nasce por SQL (senão nasce sem Kids e nenhuma criança faz check-in).
router.post('/service-types', authorizeModule('voluntariado', 5), async (req, res) => {
  try {
    const { name, description, recurrence_day, recurrence_time, color } = req.body;
    if (!name) return res.status(400).json({ error: 'name obrigatorio' });
    const { data, error } = await supabase.from('vol_service_types')
      .insert({ name, description, recurrence_day, recurrence_time, color }).select().single();
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao criar tipo de culto' }); }
});

router.put('/service-types/:id', authorizeModule('voluntariado', 5), async (req, res) => {
  try {
    const { name, description, recurrence_day, recurrence_time, color, is_active } = req.body;
    const { data, error } = await supabase.from('vol_service_types')
      .update({ name, description, recurrence_day, recurrence_time, color, is_active })
      .eq('id', req.params.id).select().single();
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao atualizar tipo de culto' }); }
});

router.delete('/service-types/:id', authorizeModule('voluntariado', 5), async (req, res) => {
  try {
    // ⚠️ (docs/cultos-domingo/ · mina nº 5) DELETE de tipo anula service_type_id
    // nos cultos (somem dos KPIs) e apaga em CASCADE roteiro de produção,
    // checklist e vínculo de template de escala. Tipo com culto vinculado NUNCA
    // é deletável — o caminho é ENCERRAR (is_active=false). Contagem head-only;
    // falha na contagem BLOQUEIA (fail-closed: este é o caminho destrutivo).
    const { count, error: cErr } = await supabase.from('cultos')
      .select('id', { count: 'exact', head: true })
      .eq('service_type_id', req.params.id);
    if (cErr) return res.status(500).json({ error: 'Não deu pra conferir os cultos vinculados — exclusão bloqueada por segurança.' });
    if ((count || 0) > 0) {
      return res.status(409).json({ error: `Este tipo tem ${count} culto(s) vinculado(s). Encerre o tipo (desativar) em vez de excluir — excluir apagaria roteiro de produção e escalas em cascata.` });
    }
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
    const { name, service_type_name, service_type_id, scheduled_at, forcar } = req.body;
    if (!name || !scheduled_at) return res.status(400).json({ error: 'name e scheduled_at obrigatórios' });

    // Guard anti-duplicação (incidente 05/07): criar culto manual num dia que JÁ
    // tem culto do Planning Center gera duplicado SEM ESCALA — a equipe faz
    // check-in nele e as presenças se separam da escala real. Bloqueia com
    // explicação; quem souber o que está fazendo passa forcar=true.
    if (!forcar) {
      const d = new Date(scheduled_at);
      if (!Number.isNaN(d.getTime())) {
        const dia = d.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
        const { data: doDia } = await supabase.from('vol_services')
          .select('name')
          .not('planning_center_id', 'is', null)
          .gte('scheduled_at', `${dia}T00:00:00-03:00`)
          .lt('scheduled_at', `${dia}T23:59:59-03:00`)
          .limit(5);
        if (doDia?.length) {
          return res.status(409).json({
            error: `Este dia já tem culto(s) do Planning Center com a escala: ${doDia.map(s => s.name).join(', ')}. ` +
              'Use esse culto pro check-in — criar outro separa as presenças da escala. ' +
              'Se realmente precisar de um culto extra neste dia, envie forcar=true.',
          });
        }
      }
    }

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

    // ⚠️⚠️ SÃO DOIS MODELOS DE INDISPONIBILIDADE NA MESMA TABELA, e este painel
    // enxergava só um (achado em 07/08/2026):
    //   · por CULTO   → `service_id` preenchido — é o que a coordenação marca aqui
    //   · por PERÍODO → `unavailable_from/to` com `service_id` NULL — é o que o
    //     APP grava quando o voluntário diz "viajo de 20 a 31/08"
    //
    // Ler só o primeiro fazia este painel mostrar "ninguém indisponível" pra quem
    // tinha avisado pelo app — enquanto `POST /schedules/auto-fill` (que filtra
    // por FAIXA DE DATA, linha ~3355) já o excluía. Ou seja: o gerador automático
    // e a tela que a coordenação usa pra escalar NA MÃO discordavam sobre a mesma
    // pessoa no mesmo culto, e quem escalasse pela tela não tinha como saber.
    //
    // ⚠️ Não é regressão: a tabela só passou a receber bloqueio por período em
    // 07/08 (a tela do app nunca gravou nada antes — a RLS barrava e a validação
    // recusava data futura). É porta recém-aberta cujo destino não olhava pra ela.
    const { data: porPeriodo } = await supabase
      .from('vol_availability')
      .select('unavailable_from, unavailable_to, reason, volunteer_profile_id, vol_profiles(full_name, avatar_url)')
      .is('service_id', null)
      // Sobreposição com a janela pedida: começa antes do fim E termina depois do
      // início. Comparar string ISO é seguro (YYYY-MM-DD ordena como data).
      .lte('unavailable_from', to)
      .gte('unavailable_to', from);

    // Agrupa por service_id
    const unavailByService = new Map();
    const jaListado = new Map(); // service_id -> Set(profile_id)
    const push = (serviceId, item) => {
      if (!unavailByService.has(serviceId)) {
        unavailByService.set(serviceId, []);
        jaListado.set(serviceId, new Set());
      }
      // Quem tem bloqueio por período E por culto no mesmo dia apareceria 2×.
      if (item.profile_id) {
        if (jaListado.get(serviceId).has(item.profile_id)) return;
        jaListado.get(serviceId).add(item.profile_id);
      }
      unavailByService.get(serviceId).push(item);
    };

    for (const u of (unavail || [])) {
      push(u.service_id, {
        profile_id: u.volunteer_profile_id,
        name: u.vol_profiles?.full_name || 'Voluntario',
        avatar_url: u.vol_profiles?.avatar_url || null,
        origem: 'culto',
      });
    }

    // O bloqueio por período vale pra TODO culto cuja data cai dentro dele.
    for (const s of services) {
      const dia = String(s.scheduled_at).slice(0, 10);
      for (const u of (porPeriodo || [])) {
        if (u.unavailable_from <= dia && dia <= u.unavailable_to) {
          push(s.id, {
            profile_id: u.volunteer_profile_id,
            name: u.vol_profiles?.full_name || 'Voluntario',
            avatar_url: u.vol_profiles?.avatar_url || null,
            origem: 'periodo',
            // O motivo ("viagem", "prova") é o que deixa a coordenação decidir se
            // cabe insistir — sem ele o painel diz "não pode" e mais nada.
            motivo: u.reason || null,
            periodo: { de: u.unavailable_from, ate: u.unavailable_to },
          });
        }
      }
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
// ⚠️⚠️ A disponibilidade passou a ser REGRA, não enfeite de tela (13/08/2026).
//
// Pedido do Matheus: "quem não estiver disponível não vai aparecer para o
// supervisor ou líder escalar". Até aqui isso era só um checkbox no front — com
// default ligado, mas DESMARCÁVEL — e o servidor **nunca conferia nada**: dava
// pra escalar quem marcou "não posso" por drag-and-drop, pelo botão +, pelo
// auto-fill e pelo aplicar-template, sem nenhum aviso.
//
// Filtro que só existe no cliente não é regra: é sugestão. Agora o servidor
// recusa (409 `indisponivel`), e a coordenação só passa por cima com
// `forcar: true` — que é uma decisão consciente ("falei com ela, ela vai"),
// não um clique acidental.
async function _bloqueioPorIndisponibilidade({ service_id, volunteer_id, planning_center_person_id }) {
  if (!service_id || (!volunteer_id && !planning_center_person_id)) return null;

  const { data: svc, error: sErr } = await supabase
    .from('vol_services').select('id, scheduled_at').eq('id', service_id).maybeSingle();
  // ⚠️ Falha de CONSULTA não pode virar "está disponível" — seria a checagem
  // falhando ABERTA justamente no caminho que ela existe pra fechar. Sem
  // conseguir conferir, não afirmamos nada e deixamos passar com log: travar
  // toda a montagem de escala por instabilidade de banco é pior. Mas o log
  // existe pra isso aparecer.
  if (sErr) { console.error('[voluntariado] disponibilidade não conferida:', sErr.message); return null; }
  if (!svc) return null;

  let q = supabase.from('vol_availability')
    .select('service_id, unavailable_from, unavailable_to, reason, volunteer_profile_id, planning_center_person_id');
  q = volunteer_id
    ? q.eq('volunteer_profile_id', volunteer_id)
    : q.eq('planning_center_person_id', planning_center_person_id);
  const { data: linhas, error: aErr } = await q;
  if (aErr) { console.error('[voluntariado] disponibilidade não conferida:', aErr.message); return null; }

  const v = avaliarIndisponibilidade(
    { serviceId: service_id, dia: diaBRT(svc.scheduled_at) },
    linhas || [],
  );
  return v.indisponivel ? v : null;
}

/**
 * Versão em LOTE da checagem acima — uma consulta só de `vol_availability`.
 *
 * Existe porque `/schedules/bulk` e `/schedules/auto-fill` inserem várias
 * linhas de uma vez sem passar pelo `POST /schedules`, então a trava de lá não
 * os alcançava. É o mesmo furo que o `/copy` teve.
 *
 * ⚠️ Devolve os pulados NOMEADOS: quem sumiu da escala em silêncio só é notado
 * no domingo.
 */
async function _separarPorDisponibilidade(service_id, pessoas) {
  const lista = pessoas || [];
  if (!lista.length) return { ok: [], pulados: [] };

  const { data: svc, error: sErr } = await supabase
    .from('vol_services').select('id, scheduled_at').eq('id', service_id).maybeSingle();
  // Falha de consulta não vira "todo mundo indisponível" nem trava o lote —
  // mesma política do bloqueio individual: passa com log.
  if (sErr || !svc) {
    if (sErr) console.error('[voluntariado] disponibilidade do lote não conferida:', sErr.message);
    return { ok: lista, pulados: [] };
  }

  const { data: linhas, error: aErr } = await supabase.from('vol_availability')
    .select('service_id, unavailable_from, unavailable_to, reason, volunteer_profile_id, planning_center_person_id');
  if (aErr) {
    console.error('[voluntariado] disponibilidade do lote não conferida:', aErr.message);
    return { ok: lista, pulados: [] };
  }

  const idx = indexarPorPessoa(linhas || []);
  const ctx = { serviceId: service_id, dia: diaBRT(svc.scheduled_at) };
  const ok = [];
  const pulados = [];
  for (const p of lista) {
    const eventos = [
      ...(idx.get(p.volunteer_id) || []),
      ...(idx.get(p.planning_center_person_id) || []),
    ];
    const v = avaliarIndisponibilidade(ctx, eventos);
    if (v.indisponivel) pulados.push({ nome: p.volunteer_name || 'Voluntário', motivo: textoIndisponibilidade(v) });
    else ok.push(p);
  }
  return { ok, pulados };
}

router.post('/schedules', async (req, res) => {
  try {
    const { service_id, volunteer_id, volunteer_name, team_id, team_name, position_id, position_name, planning_center_person_id, notes, forcar } = req.body;
    if (!service_id || !volunteer_name) return res.status(400).json({ error: 'service_id e volunteer_name obrigatórios' });

    if (!forcar) {
      const bloqueio = await _bloqueioPorIndisponibilidade({ service_id, volunteer_id, planning_center_person_id });
      if (bloqueio) {
        return res.status(409).json({
          error: `${volunteer_name} ${textoIndisponibilidade(bloqueio)}.`,
          codigo: 'indisponivel',
          origem: bloqueio.origem,
          motivo: bloqueio.motivo,
        });
      }
    }

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
//
// ⚠️ É o caminho do "escalar os N marcados" do painel lateral (13/08/2026) e,
// como faz INSERT em lote, NÃO passava pelo `POST /schedules` — ou seja, a
// trava de disponibilidade não o alcançava. Mesmo furo que o `/copy` teve.
router.post('/schedules/bulk', async (req, res) => {
  try {
    const { service_id, assignments, forcar } = req.body;
    if (!service_id || !Array.isArray(assignments) || !assignments.length) {
      return res.status(400).json({ error: 'service_id e assignments[] obrigatórios' });
    }

    let entrando = assignments;
    let pulados = [];
    if (!forcar) {
      const sep = await _separarPorDisponibilidade(service_id, assignments);
      entrando = sep.ok;
      pulados = sep.pulados;
    }
    if (!entrando.length) {
      return res.status(409).json({
        error: 'Ninguém do lote está disponível neste culto.',
        codigo: 'indisponivel', pulados,
      });
    }

    const rows = entrando.map(a => ({
      service_id,
      volunteer_id: a.volunteer_id || null,
      volunteer_name: a.volunteer_name,
      team_id: a.team_id || null,
      team_name: a.team_name || null,
      position_id: a.position_id || null,
      position_name: a.position_name || null,
      // ⚠️ Amarra a escala à VAGA que a originou. Sem isso o casamento
      // vaga↔pessoa cai no par (equipe, função), que é ambíguo quando a
      // composição tem duas linhas para o mesmo par — as duas passariam a
      // exibir as mesmas pessoas e a tela subestimaria o que ainda falta.
      escala_culto_item_id: a.escala_culto_item_id || null,
      planning_center_person_id: a.planning_center_person_id || null,
      confirmation_status: 'pending',
      source: a.source || 'manual',
      notes: a.notes || null,
    }));

    const { data, error } = await supabase.from('vol_schedules')
      .upsert(rows, { onConflict: 'service_id,planning_center_person_id', ignoreDuplicates: true })
      .select();
    if (error) return res.status(400).json({ error: error.message });
    res.json({ created: data.length, schedules: data, pulados });
  } catch (e) { res.status(500).json({ error: 'Erro ao criar escalas em lote' }); }
});

/**
 * Desfazer um lote de escalas recém-criado (auto-preencher / escalar N).
 *
 * O Services deixa desfazer o auto-schedule enquanto a pessoa não sai da
 * página, e é o que torna o botão seguro de apertar: quem não confia no
 * automático não experimenta, e quem não experimenta continua montando na mão.
 *
 * ⚠️ Só apaga id que pertence ao culto informado — o `service_id` no filtro
 * não é enfeite: sem ele, um id de outro culto no payload apagaria escala que
 * ninguém estava vendo.
 */
router.post('/schedules/desfazer-lote', async (req, res) => {
  try {
    const { service_id, ids } = req.body;
    if (!service_id || !Array.isArray(ids) || !ids.length) {
      return res.status(400).json({ error: 'service_id e ids[] obrigatórios' });
    }
    if (ids.length > 200) return res.status(400).json({ error: 'Máximo de 200 por vez' });

    const { data, error } = await supabase.from('vol_schedules')
      .delete().eq('service_id', service_id).in('id', ids).select('id');
    if (error) return res.status(400).json({ error: error.message });
    res.json({ removidas: (data || []).length });
  } catch (e) { res.status(500).json({ error: 'Erro ao desfazer' }); }
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

    // ⚠️ Copiar não pode furar a regra de disponibilidade. Este endpoint faz
    // INSERT EM LOTE direto (não passa pelo POST /schedules), então a trava de
    // lá não o alcança — e "copiar a escala do domingo passado" é justamente o
    // caminho que traria de volta quem avisou que não pode NESTE domingo.
    // Quem está indisponível no culto de DESTINO é pulado e DECLARADO.
    const { data: svcDestino } = await supabase.from('vol_services')
      .select('id, scheduled_at').eq('id', to_service_id).maybeSingle();
    const diaDestino = diaBRT(svcDestino?.scheduled_at);
    const idsOrigem = [...new Set(source.flatMap(s => [s.volunteer_id, s.planning_center_person_id]).filter(Boolean))];
    let idxIndispon = new Map();
    if (idsOrigem.length) {
      const linhas = [];
      for (let i = 0; i < idsOrigem.length; i += 200) {
        const bloco = idsOrigem.slice(i, i + 200);
        const [{ data: a }, { data: b }] = await Promise.all([
          supabase.from('vol_availability')
            .select('service_id, unavailable_from, unavailable_to, reason, volunteer_profile_id, planning_center_person_id')
            .in('volunteer_profile_id', bloco),
          supabase.from('vol_availability')
            .select('service_id, unavailable_from, unavailable_to, reason, volunteer_profile_id, planning_center_person_id')
            .in('planning_center_person_id', bloco),
        ]);
        linhas.push(...(a || []), ...(b || []));
      }
      idxIndispon = indexarPorPessoa(linhas);
    }
    const indispon = (s) => [s.volunteer_id, s.planning_center_person_id].filter(Boolean).some((id) =>
      avaliarIndisponibilidade({ serviceId: to_service_id, dia: diaDestino }, idxIndispon.get(id) || []).indisponivel);

    const pulados = source.filter(indispon).map(s => s.volunteer_name).filter(Boolean);
    const copiaveis = source.filter(s => !indispon(s));
    if (!copiaveis.length) {
      return res.status(409).json({
        error: 'Ninguém do culto de origem está disponível neste culto.',
        codigo: 'todos_indisponiveis', pulados,
      });
    }

    const rows = copiaveis.map(s => ({
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
    res.json({ copied: data.length, schedules: data, pulados });
  } catch (e) { res.status(500).json({ error: 'Erro ao copiar escalas' }); }
});

// Auto-fill schedule from team roster with rotation
/**
 * Auto-preencher a escala do culto — rodízio, respeitando as VAGAS.
 *
 * ⚠️⚠️ REESCRITO EM 13/08/2026. A versão anterior fazia `available.map(...)` e
 * inseria **todos os membros ativos da equipe**: numa equipe de 40 pessoas,
 * escalava as 40. Ela ordenava por rodízio e depois ignorava a ordem, porque
 * não havia teto nenhum — o número de vagas que a composição do culto pede
 * (`vol_escala_culto_itens`) nunca era consultado.
 *
 * A regra agora é a mesma que o Planning Center Services escreve na tela do
 * auto-schedule dele: preenche as posições necessárias filtrando quem tem
 * conflito e escolhendo quem foi escalado há mais tempo. Com duas diferenças
 * nossas, deliberadas:
 *   · indisponível NUNCA entra (lei de 13/08 — lá o conflito é só um aviso);
 *   · quem já serve em OUTRO culto do mesmo dia também não entra por
 *     automação: a pessoa pode topar dobrar, mas quem pede isso é gente.
 *
 * A decisão de quem vai pra qual vaga é da régua PURA `utils/volRodizio`
 * (testada no gate). Aqui só se lê o banco e se grava o resultado.
 */
router.post('/schedules/auto-fill', async (req, res) => {
  try {
    const { service_id, team_id, team_ids } = req.body;
    if (!service_id) return res.status(400).json({ error: 'service_id obrigatório' });
    const filtroTeams = Array.isArray(team_ids) && team_ids.length
      ? team_ids
      : (team_id ? [team_id] : null);

    const { data: service } = await supabase.from('vol_services')
      .select('id, scheduled_at').eq('id', service_id).single();
    if (!service) return res.status(404).json({ error: 'Culto não encontrado' });
    const dia = diaBRT(service.scheduled_at);

    // 1 · As vagas. Mesma conta que a tela mostra (helper compartilhado).
    const { itens } = await _coberturaDoCulto(service_id);
    const vagas = itens
      .filter(i => !filtroTeams || filtroTeams.includes(i.team_id))
      .filter(i => i.faltam > 0);

    if (!itens.length) {
      // ⚠️ Sem composição definida não existe "número de vagas", e preencher
      // "a equipe toda" é exatamente o defeito que esta reescrita corrige.
      // Recusar dizendo o caminho é melhor que escalar 40 pessoas.
      return res.status(409).json({
        codigo: 'sem_composicao',
        error: 'Este culto ainda não tem composição definida. Aplique um template de escala primeiro — é ele que diz quantas vagas cada área tem.',
      });
    }
    if (!vagas.length) {
      return res.json({ created: 0, schedule_ids: [], detalhe: [], sem_candidato: [], mensagem: 'Todas as vagas já estão preenchidas.' });
    }

    // 2 · Candidatos: membros ativos das equipes que têm vaga.
    const teamIds = [...new Set(vagas.map(v => v.team_id).filter(Boolean))];
    let membros = [];
    for (let i = 0; i < teamIds.length; i += 50) {
      const lote = teamIds.slice(i, i + 50);
      let offset = 0;
      for (;;) {
        const { data, error } = await supabase.from('vol_team_members')
          .select('id, team_id, position_id, volunteer_profile_id, planning_center_person_id, volunteer_name')
          .in('team_id', lote).eq('is_active', true)
          .order('id').range(offset, offset + 999);
        if (error) return res.status(400).json({ error: error.message });
        membros = membros.concat(data || []);
        if (!data || data.length < 1000) break;
        offset += 1000;
      }
    }
    if (!membros.length) {
      return res.status(409).json({ codigo: 'sem_membros', error: 'Nenhuma das áreas com vaga tem membros cadastrados.' });
    }

    // 3 · Sinais por pessoa: indisponibilidade, já escalado aqui, conflito no dia.
    const [{ data: unavail }, { data: escalasEste }, { data: outrosDia }] = await Promise.all([
      supabase.from('vol_availability')
        .select('service_id, unavailable_from, unavailable_to, reason, volunteer_profile_id, planning_center_person_id'),
      supabase.from('vol_schedules').select('volunteer_id, planning_center_person_id').eq('service_id', service_id),
      supabase.from('vol_services').select('id')
        .gte('scheduled_at', `${dia}T00:00:00-03:00`).lte('scheduled_at', `${dia}T23:59:59-03:00`)
        .neq('id', service_id),
    ]);

    const indisponIdx = indexarPorPessoa(unavail || []);
    const ctxIndispon = { serviceId: service_id, dia };
    const jaAqui = new Set();
    for (const s of escalasEste || []) { if (s.volunteer_id) jaAqui.add(s.volunteer_id); if (s.planning_center_person_id) jaAqui.add(s.planning_center_person_id); }

    const conflito = new Set();
    const idsOutros = (outrosDia || []).map(o => o.id);
    if (idsOutros.length) {
      const { data: escOutros } = await supabase.from('vol_schedules')
        .select('volunteer_id, planning_center_person_id').in('service_id', idsOutros);
      for (const s of escOutros || []) { if (s.volunteer_id) conflito.add(s.volunteer_id); if (s.planning_center_person_id) conflito.add(s.planning_center_person_id); }
    }

    // 4 · Rodízio.
    const chavesAlvo = new Set();
    for (const m of membros) { if (m.volunteer_profile_id) chavesAlvo.add(m.volunteer_profile_id); if (m.planning_center_person_id) chavesAlvo.add(m.planning_center_person_id); }
    const rodizio = await _ultimaEscalaPorPessoa({ antesISO: service.scheduled_at, chavesAlvo });

    // 5 · Uma linha por PESSOA, com todos os vínculos dela (serve em N áreas).
    const porPessoa = new Map();
    for (const m of membros) {
      const chave = m.volunteer_profile_id || m.planning_center_person_id;
      if (!chave) continue;
      // ⚠️ Conta de sistema fora — a mesma régua do pool de escalar. O print
      // do Matheus mostrava ". f" e "ADM CBRio" entre os candidatos.
      if (!ehPessoaEscalavel(m.volunteer_name)) continue;
      if (!porPessoa.has(chave)) {
        const eventos = [
          ...(indisponIdx.get(m.volunteer_profile_id) || []),
          ...(indisponIdx.get(m.planning_center_person_id) || []),
        ];
        const ultimas = [rodizio.mapa.get(m.volunteer_profile_id), rodizio.mapa.get(m.planning_center_person_id)].filter(Boolean);
        const ultima = ultimas.length ? ultimas.sort().pop() : null;
        porPessoa.set(chave, {
          id: chave,
          nome: m.volunteer_name,
          volunteer_id: m.volunteer_profile_id || null,
          planning_center_person_id: m.planning_center_person_id || null,
          indisponivel: avaliarIndisponibilidade(ctxIndispon, eventos).indisponivel,
          jaEscalado: jaAqui.has(m.volunteer_profile_id) || jaAqui.has(m.planning_center_person_id),
          conflito: conflito.has(m.volunteer_profile_id) || conflito.has(m.planning_center_person_id),
          semanas: semanasSemServir(ultima, service.scheduled_at),
          equipes: [],
        });
      }
      porPessoa.get(chave).equipes.push({ team_id: m.team_id, position_id: m.position_id || null });
    }

    const { atribuicoes, vagasSemCandidato } = distribuirVagas({
      vagas, candidatos: [...porPessoa.values()],
    });

    if (!atribuicoes.length) {
      return res.json({
        created: 0, schedule_ids: [], detalhe: [],
        sem_candidato: vagasSemCandidato.map(v => ({ equipe: v.team, funcao: v.position, restantes: v.restantes })),
        mensagem: 'Ninguém disponível para as vagas em aberto.',
      });
    }

    const rows = atribuicoes.map(({ vaga, candidato }) => ({
      service_id,
      volunteer_id: candidato.volunteer_id,
      volunteer_name: candidato.nome,
      team_id: vaga.team_id,
      team_name: vaga.team || null,
      position_id: vaga.position_id || null,
      position_name: vaga.position || null,
      escala_culto_item_id: vaga.id,
      planning_center_person_id: candidato.planning_center_person_id,
      confirmation_status: 'pending',
      source: 'auto_rotation',
    }));

    const { data: created, error } = await supabase.from('vol_schedules').insert(rows).select();
    if (error) return res.status(400).json({ error: error.message });

    res.json({
      created: created.length,
      // Os ids voltam pro botão "Desfazer" da tela — sem eles, quem apertou
      // por engano teria que remover pessoa por pessoa.
      schedule_ids: created.map(c => c.id),
      detalhe: atribuicoes.map(({ vaga, candidato }) => ({
        equipe: vaga.team, funcao: vaga.position, nome: candidato.nome,
        rotulo: rotuloTempoSemServir(candidato.semanas),
      })),
      sem_candidato: vagasSemCandidato.map(v => ({ equipe: v.team, funcao: v.position, restantes: v.restantes })),
    });
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
      .select('data_inscricao, status, area')
      .is('deleted_at', null);
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
      .is('deleted_at', null)
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

// GET /inscricoes/por-direcionada — distribuição de voluntários por área
// direcionada (onde a coordenação de fato encaminhou cada pessoa). Alimenta a
// estatística "onde estão os voluntários" da equipe. Filtros opcionais: ano,
// status. A pessoa direcionada a N ministérios conta em cada um deles.
router.get('/inscricoes/por-direcionada', async (req, res) => {
  try {
    const ano = req.query.ano ? String(req.query.ano) : null;
    const status = req.query.status ? String(req.query.status) : null;
    let all = [];
    let offset = 0;
    const page = 1000;
    // Pagina pra não bater no cap de 1000 linhas do PostgREST.
    while (true) {
      let q = supabase.from('vol_inscricoes')
        .select('area_direcionada, status')
        .is('deleted_at', null)
        .not('area_direcionada', 'is', null)
        .order('data_inscricao', { ascending: false })
        .range(offset, offset + page - 1);
      if (ano) q = q.gte('data_inscricao', `${ano}-01-01`).lt('data_inscricao', `${Number(ano) + 1}-01-01`);
      if (status) q = q.eq('status', status);
      const { data, error } = await q;
      if (error) throw error;
      all = all.concat(data || []);
      if (!data || data.length < page) break;
      offset += page;
    }
    const counts = {};
    let pessoas = 0;
    for (const r of all) {
      const arr = Array.isArray(r.area_direcionada) ? r.area_direcionada : [];
      if (arr.length) pessoas += 1;
      for (const m of arr) {
        const k = String(m).trim();
        if (k) counts[k] = (counts[k] || 0) + 1;
      }
    }
    const rows = Object.entries(counts)
      .map(([ministerio, total]) => ({ ministerio, total }))
      .sort((a, b) => b.total - a.total);
    res.json({ rows, pessoas });
  } catch (e) {
    console.error('[inscricoes por-direcionada]', e.message);
    res.status(500).json({ error: 'Erro ao calcular distribuição' });
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
        .select('area, area_direcionada').eq('id', req.params.id).is('deleted_at', null).maybeSingle();

      // Exige a área direcionada — não integra sem registrar onde a pessoa vai
      // de fato servir (é o que alimenta a estatística "onde estão os voluntários").
      if (!Array.isArray(insc?.area_direcionada) || insc.area_direcionada.length === 0) {
        return res.status(400).json({
          error: 'Defina a área direcionada (onde a pessoa vai servir) antes de integrar.',
          code: 'direcionada_obrigatoria',
        });
      }

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

    const { cpf, data_nascimento, nome_mae, ministerios_interesse, area_direcionada, feedback } = req.body || {};
    const patch = { updated_at: new Date().toISOString() };

    if (cpf !== undefined) {
      const d = String(cpf || '').replace(/\D+/g, '');
      if (d && (d.length !== 11 || !cpfValido(d))) {
        // Grandfathering do legado: CPF idêntico ao já armazenado passa sem
        // DV (o modal da ficha sempre reenvia o cpf — sem isso, um CPF legado
        // DV-inválido travaria a edição de QUALQUER campo). DV só pra novo/alterado.
        const { data: atual } = await supabase.from('vol_inscricoes')
          .select('cpf').eq('id', req.params.id).is('deleted_at', null).maybeSingle();
        const atualNorm = String(atual?.cpf || '').replace(/\D+/g, '');
        if (!atualNorm || d !== atualNorm) {
          return res.status(400).json({ error: 'CPF inválido — confira os dígitos' });
        }
      }
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
    if (feedback !== undefined) {
      patch.feedback = feedback ? String(feedback).trim() : null;
    }

    if (Object.keys(patch).length === 1) {
      return res.status(400).json({ error: 'Nada para atualizar' });
    }

    const { data, error } = await supabase.from('vol_inscricoes')
      .update(patch).eq('id', req.params.id).select().single();
    if (error) throw error;

    // Reconciliação de CPF tardio (auditoria CPF 2026-07-16): completar o CPF
    // na ficha não refazia o match de membro — a inscrição ficava com CPF e o
    // vínculo (ou a falta dele) congelado. Agora: se a inscrição já tem membro,
    // consolida o CPF nele (conflito vira pendência de identidade); se não tem,
    // tenta ligar pelo matcher canônico (CPF → email+nome → tel+nome → nasc+nome,
    // read-only · não cria stub aqui). Fire-and-forget.
    if (patch.cpf && data) {
      (async () => {
        try {
          if (data.membro_id) {
            // Confiança FRACA: o vínculo pode ter nascido de match fraco
            // (telefone/e-mail+nome) numa requisição anterior — sem nascimento
            // conferível dos 2 lados, o CPF fica somente na ficha e não cria
            // identidade nem pendência humana.
            await reconciliarCpfTardio({
              membroId: data.membro_id, cpf: patch.cpf,
              origem: 'vol_ficha', origemId: data.id,
              dataNascimento: data.data_nascimento || null,
              confianca: 'fraca',
            });
          } else {
            const hit = await acharMembroGuardado({
              cpf: patch.cpf, email: data.email, telefone: data.telefone,
              nome: data.nome_completo || [data.nome, data.sobrenome].filter(Boolean).join(' '),
              dataNascimento: data.data_nascimento || null,
            });
            if (hit?.membro_id) {
              await supabase.from('vol_inscricoes')
                .update({ membro_id: hit.membro_id, updated_at: new Date().toISOString() })
                .eq('id', data.id).is('membro_id', null);
              // Vínculo nasceu de match fraco (não-CPF) → consolida o CPF no
              // membro achado (senão o CPF fica preso na inscrição e o membro
              // segue sem CPF. Confiança 'fraca': sem nascimento conferível
              // dos 2 lados, mantém o CPF só na inscrição.
              if (hit.matched_by !== 'cpf') {
                await reconciliarCpfTardio({
                  membroId: hit.membro_id, cpf: patch.cpf,
                  origem: 'vol_ficha', origemId: data.id,
                  dataNascimento: data.data_nascimento || null,
                  confianca: 'fraca',
                });
              }
            }
          }
        } catch (e2) {
          console.error('[inscricao dados] reconciliar cpf:', e2.message);
        }
      })();
    }
    res.json(data);
  } catch (e) {
    console.error('[inscricao dados]', e.message);
    res.status(500).json({ error: 'Erro ao salvar dados da inscrição' });
  }
});

// POST /api/voluntariado/inscricoes/:id/desistiu — a pessoa desistiu de servir
// ANTES de virar voluntário (ex.: conversou com o líder e não quis seguir).
// Status terminal 'desistente' + motivo opcional. NÃO cria vol_profile → não
// entra no cadastro de voluntário nem na conta de inativos (esses vêm de
// vw_vol_frequencia, que só olha quem realmente é voluntário). Endpoint
// dedicado (não mexe na lógica de status existente). Reverter = mandar de
// volta pra 'inscrito' pela ação normal de triagem.
router.post('/inscricoes/:id/desistiu', async (req, res) => {
  try {
    const isAdmin = ['admin', 'diretor'].includes(req.user.role);
    const lvl = Math.max(getEffectiveLevel(req, 'voluntariado') || 0, getEffectiveLevel(req, 'membresia') || 0);
    if (!isAdmin && lvl < 3) {
      return res.status(403).json({ error: 'Sem permissão para alterar a inscrição' });
    }

    const motivo = req.body?.motivo ? String(req.body.motivo).trim().slice(0, 500) : '';
    const { data: atual } = await supabase.from('vol_inscricoes')
      .select('feedback').eq('id', req.params.id).maybeSingle();
    // Preserva o feedback existente e anexa a nota da desistência.
    const nota = motivo ? `Desistiu de servir: ${motivo}` : 'Desistiu de servir.';
    const feedback = atual?.feedback ? `${atual.feedback}\n${nota}` : nota;

    const { data, error } = await supabase.from('vol_inscricoes')
      .update({ status: 'desistente', feedback, updated_at: new Date().toISOString() })
      .eq('id', req.params.id).select().single();
    if (error) throw error;
    res.json(data);
  } catch (e) {
    console.error('[inscricao desistiu]', e.message);
    res.status(500).json({ error: 'Erro ao registrar a desistência' });
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
      .eq('id', req.params.id).is('deleted_at', null).maybeSingle();
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
      // A revisão humana resolve o resultado — zera o erro da consulta
      // automática anterior (não deixa "Parâmetro(s) inválido(s)." pendurado
      // numa triagem já aprovada/dispensada).
      consulta_erro: null,
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
    const { vol_profile_id, nome, email, cpf, telefone, data_nascimento, cargo_slug, senha } = req.body || {};
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

    // 5. Pessoa canônica (mem_membros) via matcher — grava CPF/telefone/nascimento.
    //    Contrato de porta: normaliza, roteia pelo matcher canônico, enriquece só
    //    campos VAZIOS (nunca sobrescreve o principal) e vincula o login
    //    (profiles.membro_id + espelha telefone/nascimento). Best-effort.
    try {
      const cpfDigits = String(cpf || '').replace(/\D/g, '');
      const telDigits = normalizarTelefone(telefone) || '';
      const dob = data_nascimento || null;
      if (nome && (cpfDigits || telDigits || dob)) {
        const membro = await acharOuCriarGuardado({
          nome, email: mail, cpf: cpfDigits || null, telefone: telefone || null,
          dataNascimento: dob, extra: dob ? { data_nascimento: dob } : {},
          origem: 'voluntariado_acesso',
        });
        if (membro?.id) {
          const { data: m } = await supabase.from('mem_membros')
            .select('cpf, telefone, data_nascimento').eq('id', membro.id).maybeSingle();
          const patch = {};
          if (cpfDigits && !m?.cpf) patch.cpf = cpfDigits;
          if (telDigits && !m?.telefone) patch.telefone = telDigits;
          if (dob && !m?.data_nascimento) patch.data_nascimento = dob;
          if (Object.keys(patch).length) await supabase.from('mem_membros').update(patch).eq('id', membro.id);
          const pPatch = { membro_id: membro.id };
          if (telDigits) pPatch.telefone = telDigits;
          if (dob) pPatch.data_nascimento = dob;
          await supabase.from('profiles').update(pPatch).eq('id', uid);
        }
      }
    } catch (e) { console.warn('[criar-login] pessoa canônica:', e.message); }

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

// ══════════════════════════════════════════════════════════════
// TEMPLATES DE ESCALA (PR1)
// Reusa vol_teams (=equipe/grupo) e vol_positions (=função). Um template é uma
// composição esperada (equipe × função × quantidade + fixo) + pessoas-padrão.
// Aplicar a um culto materializa vol_escala_culto_itens (o alvo/denominador) e
// pré-preenche vol_schedules com as pessoas-padrão. Cobertura = alvo − preenchidas.
// ══════════════════════════════════════════════════════════════
const authEscalaEscrita = authorizeModule('voluntariado', 3);

// Carrega um template completo (itens + pessoas + tipos de culto).
async function carregarTemplate(id) {
  const { data: tpl } = await supabase.from('vol_escala_templates')
    .select('*').eq('id', id).is('deleted_at', null).maybeSingle();
  if (!tpl) return null;
  const [{ data: itens }, { data: tipos }] = await Promise.all([
    supabase.from('vol_escala_template_itens')
      .select('*, team:vol_teams(id,name), position:vol_positions(id,name)')
      .eq('template_id', id).order('sort_order'),
    supabase.from('vol_escala_template_tipos').select('service_type_id').eq('template_id', id),
  ]);
  const itemIds = (itens || []).map(i => i.id);
  let pessoasPorItem = {};
  if (itemIds.length) {
    const { data: pessoas } = await supabase.from('vol_escala_template_item_pessoas')
      .select('item_id, volunteer_id, volunteer:vol_profiles(id,full_name)')
      .in('item_id', itemIds);
    for (const p of pessoas || []) (pessoasPorItem[p.item_id] ||= []).push(p);
  }
  return {
    ...tpl,
    service_type_ids: (tipos || []).map(t => t.service_type_id),
    itens: (itens || []).map(i => ({ ...i, pessoas: pessoasPorItem[i.id] || [] })),
  };
}

// Substitui itens (+pessoas) e tipos de um template (usado no create/update).
async function gravarItensETipos(templateId, itens, serviceTypeIds) {
  if (Array.isArray(serviceTypeIds)) {
    await supabase.from('vol_escala_template_tipos').delete().eq('template_id', templateId);
    const rows = serviceTypeIds.filter(Boolean).map(st => ({ template_id: templateId, service_type_id: st }));
    if (rows.length) await supabase.from('vol_escala_template_tipos').insert(rows);
  }
  if (Array.isArray(itens)) {
    await supabase.from('vol_escala_template_itens').delete().eq('template_id', templateId);
    for (let idx = 0; idx < itens.length; idx++) {
      const it = itens[idx];
      if (!it?.team_id) continue;
      const { data: novo, error } = await supabase.from('vol_escala_template_itens')
        .insert({
          template_id: templateId,
          team_id: it.team_id,
          position_id: it.position_id || null,
          quantidade: Math.max(1, parseInt(it.quantidade, 10) || 1),
          fixo: !!it.fixo,
          sort_order: it.sort_order ?? idx,
        }).select('id').single();
      if (error) throw new Error(error.message);
      const pessoas = Array.isArray(it.pessoas) ? it.pessoas : [];
      const pRows = pessoas
        .map(p => (typeof p === 'string' ? p : p.volunteer_id))
        .filter(Boolean)
        .map(vid => ({ item_id: novo.id, volunteer_id: vid }));
      if (pRows.length) await supabase.from('vol_escala_template_item_pessoas').insert(pRows);
    }
  }
}

// Lista templates (com contagem de itens e tipos ligados).
router.get('/schedule-templates', async (req, res) => {
  try {
    const { data, error } = await supabase.from('vol_escala_templates')
      .select('*, itens:vol_escala_template_itens(count), tipos:vol_escala_template_tipos(service_type_id)')
      .is('deleted_at', null).order('sort_order').order('nome');
    if (error) return res.status(400).json({ error: error.message });
    res.json((data || []).map(t => ({
      ...t,
      itens_count: t.itens?.[0]?.count ?? 0,
      service_type_ids: (t.tipos || []).map(x => x.service_type_id),
      itens: undefined, tipos: undefined,
    })));
  } catch (e) { res.status(500).json({ error: 'Erro ao listar templates de escala' }); }
});

// Detalhe completo de um template.
router.get('/schedule-templates/:id', async (req, res) => {
  try {
    const tpl = await carregarTemplate(req.params.id);
    if (!tpl) return res.status(404).json({ error: 'Template não encontrado' });
    res.json(tpl);
  } catch (e) { res.status(500).json({ error: 'Erro ao carregar template' }); }
});

// Cria template (cabeçalho + itens + pessoas + tipos de culto).
router.post('/schedule-templates', authEscalaEscrita, async (req, res) => {
  try {
    const { nome, descricao, ativo, sort_order, service_type_ids, itens } = req.body || {};
    if (!nome || !nome.trim()) return res.status(400).json({ error: 'nome obrigatório' });
    const { data: tpl, error } = await supabase.from('vol_escala_templates')
      .insert({ nome: nome.trim(), descricao: descricao || null, ativo: ativo !== false, sort_order: sort_order || 0 })
      .select('id').single();
    if (error) return res.status(400).json({ error: error.message });
    await gravarItensETipos(tpl.id, itens, service_type_ids);
    res.json(await carregarTemplate(tpl.id));
  } catch (e) { res.status(500).json({ error: e.message || 'Erro ao criar template' }); }
});

// Atualiza template (cabeçalho e, se enviados, substitui itens/tipos).
router.put('/schedule-templates/:id', authEscalaEscrita, async (req, res) => {
  try {
    const { nome, descricao, ativo, sort_order, service_type_ids, itens } = req.body || {};
    const patch = {};
    if (nome !== undefined) patch.nome = String(nome).trim();
    if (descricao !== undefined) patch.descricao = descricao || null;
    if (ativo !== undefined) patch.ativo = !!ativo;
    if (sort_order !== undefined) patch.sort_order = sort_order || 0;
    if (Object.keys(patch).length) {
      const { error } = await supabase.from('vol_escala_templates')
        .update(patch).eq('id', req.params.id).is('deleted_at', null);
      if (error) return res.status(400).json({ error: error.message });
    }
    await gravarItensETipos(req.params.id, itens, service_type_ids);
    res.json(await carregarTemplate(req.params.id));
  } catch (e) { res.status(500).json({ error: e.message || 'Erro ao atualizar template' }); }
});

// Remove template (soft-delete · reversível).
router.delete('/schedule-templates/:id', authEscalaEscrita, async (req, res) => {
  try {
    const { error } = await supabase.from('vol_escala_templates')
      .update({ deleted_at: new Date().toISOString() }).eq('id', req.params.id);
    if (error) return res.status(400).json({ error: error.message });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: 'Erro ao remover template' }); }
});

// Templates sugeridos para um tipo de culto (auto-sugestão ao montar a escala).
router.get('/schedule-templates/por-tipo/:serviceTypeId', async (req, res) => {
  try {
    const { data, error } = await supabase.from('vol_escala_template_tipos')
      .select('template:vol_escala_templates(*)')
      .eq('service_type_id', req.params.serviceTypeId);
    if (error) return res.status(400).json({ error: error.message });
    res.json((data || []).map(x => x.template).filter(t => t && !t.deleted_at && t.ativo));
  } catch (e) { res.status(500).json({ error: 'Erro ao sugerir templates' }); }
});

// Aplica um template a um culto: materializa a composição esperada
// (vol_escala_culto_itens) e pré-preenche vol_schedules com as pessoas-padrão.
// Idempotente: reaplica sem duplicar itens nem re-escalar quem já está.
router.post('/schedule-templates/:id/apply', authEscalaEscrita, async (req, res) => {
  try {
    const { service_id } = req.body || {};
    if (!service_id) return res.status(400).json({ error: 'service_id obrigatório' });
    const tpl = await carregarTemplate(req.params.id);
    if (!tpl) return res.status(404).json({ error: 'Template não encontrado' });
    const { data: svc } = await supabase.from('vol_services').select('id, scheduled_at').eq('id', service_id).maybeSingle();
    if (!svc) return res.status(404).json({ error: 'Culto não encontrado' });

    // Ausências das pessoas-padrão deste template, lidas UMA vez (uma consulta
    // por pessoa dentro do laço faria dezenas de round-trips por clique).
    const diaServico = diaBRT(svc.scheduled_at);
    const idsPadrao = [...new Set(tpl.itens.flatMap((i) => (i.pessoas || []).map((p) => p.volunteer_id)).filter(Boolean))];
    let indisponPorPessoa = new Map();
    if (idsPadrao.length) {
      const linhas = [];
      for (let i = 0; i < idsPadrao.length; i += 200) {
        const { data } = await supabase.from('vol_availability')
          .select('service_id, unavailable_from, unavailable_to, reason, volunteer_profile_id, planning_center_person_id')
          .in('volunteer_profile_id', idsPadrao.slice(i, i + 200));
        linhas.push(...(data || []));
      }
      indisponPorPessoa = indexarPorPessoa(linhas);
    }
    const pulados = [];

    // Escalas já existentes no culto: pra não re-escalar a mesma pessoa e pra
    // achar o próximo slot_seq livre por função (o índice pc_unique inclui slot_seq).
    const { data: jaEscalados } = await supabase.from('vol_schedules')
      .select('volunteer_id, team_id, team_name, position_name, slot_seq, planning_center_person_id')
      .eq('service_id', service_id);
    const escaladoChave = new Set((jaEscalados || [])
      .filter(s => s.volunteer_id).map(s => `${s.volunteer_id}:${s.team_id || ''}`));
    // Só linhas sem pc_person_id compartilham o espaço de slot_seq (as do PCO usam 0
    // mas têm pc_person_id != NULL, então nunca colidem com as do template).
    const slotUsados = {};
    const slotKey = (tn, pn) => `${tn || ''}::${pn || ''}`;
    for (const s of jaEscalados || []) {
      if (s.planning_center_person_id) continue;
      (slotUsados[slotKey(s.team_name, s.position_name)] ||= new Set()).add(s.slot_seq || 0);
    }
    const proximoSlot = (tn, pn) => {
      const set = (slotUsados[slotKey(tn, pn)] ||= new Set());
      let n = 0; while (set.has(n)) n += 1; set.add(n); return n;
    };

    let itensCriados = 0, preenchidas = 0, vagasTotais = 0;
    for (const it of tpl.itens) {
      // 1) Composição esperada (alvo). Upsert por (service, team, position).
      const { data: cItem, error: cErr } = await supabase.from('vol_escala_culto_itens')
        .upsert({
          service_id,
          template_id: tpl.id,
          template_item_id: it.id,
          team_id: it.team_id,
          position_id: it.position_id || null,
          quantidade: it.quantidade,
          fixo: it.fixo,
          sort_order: it.sort_order,
          deleted_at: null,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'service_id,team_id,position_id' })
        .select('id').single();
      if (cErr) throw new Error(cErr.message);
      itensCriados += 1;
      vagasTotais += it.quantidade;

      // 2) Pré-preencher pessoas-padrão (respeitando a quantidade de vagas).
      const teamName = it.team?.name || null;
      const positionName = it.position?.name || null;
      let usadas = 0;
      for (const p of it.pessoas) {
        if (usadas >= it.quantidade) break;
        const chave = `${p.volunteer_id}:${it.team_id}`;
        if (escaladoChave.has(chave)) { usadas += 1; continue; }
        const nome = p.volunteer?.full_name || null;
        // ⚠️ Pessoa-padrão do template NÃO passa por cima de ausência declarada.
        // O template diz "normalmente é a Ana nesta função"; a Ana dizendo "não
        // posso nesse domingo" é mais recente e mais específico. Antes, aplicar
        // o template escalava a Ana em silêncio, e a coordenação só descobria no
        // domingo. A vaga fica ABERTA (não consome `usadas`) e o pulo é
        // DECLARADO na resposta — some da tela seria trocar um erro por outro.
        const bloqueio = avaliarIndisponibilidade(
          { serviceId: service_id, dia: diaServico },
          indisponPorPessoa.get(p.volunteer_id) || [],
        );
        if (bloqueio.indisponivel) {
          pulados.push({ volunteer_id: p.volunteer_id, nome, equipe: it.team?.name || null, motivo: textoIndisponibilidade(bloqueio) });
          continue;
        }
        const { error: sErr } = await supabase.from('vol_schedules').insert({
          service_id,
          volunteer_id: p.volunteer_id,
          volunteer_name: nome,
          team_id: it.team_id,
          team_name: teamName,
          position_id: it.position_id || null,
          position_name: positionName,
          source: 'template',
          confirmation_status: 'pending',
          escala_culto_item_id: cItem.id,
          slot_seq: proximoSlot(teamName, positionName),
        });
        if (!sErr) { escaladoChave.add(chave); usadas += 1; preenchidas += 1; }
      }
    }
    res.json({ ok: true, itens: itensCriados, vagas: vagasTotais, preenchidas, pulados });
  } catch (e) { res.status(500).json({ error: e.message || 'Erro ao aplicar template' }); }
});

// Contexto de montagem de escala: tudo que a tela "Montar Escala" precisa numa
// única chamada — pool de voluntários (mesmo shape do /volunteers-pool) anotado
// com (a) indisponibilidade pro DIA do culto (por culto `vol_availability.
// service_id` E por período que cobre a data — os DOIS modelos coexistem na
// tabela, ver comentário em /services-availability), (b) se a pessoa já está
// escalada NESTE culto e (c) os outros cultos do MESMO DIA em que ela já serve
// (sobreposição — quem monta escala precisa ver se o voluntário não vai ficar
// dobrado no domingo de manhã). Evita 3 chamadas no front e centraliza a lógica
// de "quem pode ser escalado".
// ── Rodízio · quando cada pessoa serviu pela última vez ─────────────────────
//
// O Services mostra isso ao lado de cada candidato (-7w, -5w, -4w…) e ORDENA a
// lista por esse número. É o que faz uma lista de centenas de nomes ser útil
// sem digitar nada — e é o que faltava aqui: a nossa era alfabética, então o
// topo era sempre a mesma gente e o rodízio ficava no olho do supervisor.
//
// ⚠️ A varredura é do culto mais RECENTE pro mais antigo, em blocos, com teto.
// Não é a base inteira: `vol_schedules` de um ano passa de 10 mil linhas e o
// cap de 1000 do PostgREST obrigaria a dezenas de round-trips numa tela que a
// pessoa abre o tempo todo. Quem não aparece na janela varrida fica com `null`
// — que a régua trata como "há mais tempo que todos" e a tela mostra como "sem
// escala recente", NUNCA como "nunca serviu".
//
// ⚠️ A janela EFETIVA volta na resposta (`rodizio.desde`), calculada do culto
// mais antigo que realmente foi varrido. Prometer "12 meses" e varrer 3 seria
// a tela afirmando o que não foi medido.
const RODIZIO_CULTOS_POR_BLOCO = 10;
const RODIZIO_MAX_BLOCOS = 12;

async function _ultimaEscalaPorPessoa({ antesISO, chavesAlvo }) {
  const vazio = { mapa: new Map(), desde: null, completo: false };
  const { data: cultos, error } = await supabase.from('vol_services')
    .select('id, scheduled_at')
    .lt('scheduled_at', antesISO)
    .order('scheduled_at', { ascending: false })
    .limit(RODIZIO_CULTOS_POR_BLOCO * RODIZIO_MAX_BLOCOS);
  if (error) { console.error('[voluntariado] rodízio não apurado:', error.message); return vazio; }

  const lista = cultos || [];
  const mapa = new Map();
  const alvo = chavesAlvo instanceof Set && chavesAlvo.size ? chavesAlvo : null;
  let ultimoVarrido = null;
  let completo = false;

  for (let i = 0; i < lista.length; i += RODIZIO_CULTOS_POR_BLOCO) {
    const bloco = lista.slice(i, i + RODIZIO_CULTOS_POR_BLOCO);
    const quando = Object.fromEntries(bloco.map(c => [c.id, c.scheduled_at]));
    // Paginado: um domingo grande sozinho já passa de 100 escalas, e 10 cultos
    // podem passar do cap de 1000 — truncar aqui faria a pessoa aparecer como
    // "sem escala recente" logo depois de servir.
    let offset = 0;
    for (;;) {
      const { data, error: sErr } = await supabase.from('vol_schedules')
        .select('volunteer_id, planning_center_person_id, service_id')
        .in('service_id', bloco.map(c => c.id))
        .order('id').range(offset, offset + 999);
      if (sErr) { console.error('[voluntariado] rodízio não apurado:', sErr.message); return { mapa, desde: ultimoVarrido, completo: false }; }
      for (const s of data || []) {
        const dt = quando[s.service_id];
        if (!dt) continue;
        for (const k of [s.volunteer_id, s.planning_center_person_id]) {
          if (!k) continue;
          const atual = mapa.get(k);
          if (!atual || dt > atual) mapa.set(k, dt);
        }
      }
      if (!data || data.length < 1000) break;
      offset += 1000;
    }
    ultimoVarrido = bloco[bloco.length - 1].scheduled_at;
    // Achou todo mundo que interessa? Não precisa cavar mais fundo.
    if (alvo && [...alvo].every(k => mapa.has(k))) { completo = true; break; }
  }

  return { mapa, desde: ultimoVarrido, completo };
}

router.get('/services/:serviceId/contexto-montagem', async (req, res) => {
  try {
    const sid = req.params.serviceId;
    const { data: service } = await supabase
      .from('vol_services').select('id, name, service_type_name, scheduled_at').eq('id', sid).single();
    if (!service) return res.status(404).json({ error: 'Culto não encontrado' });

    // Dia local BRT do culto (scheduled_at vem com offset -03:00 → UTC == BRT).
    const d = new Date(service.scheduled_at);
    const y = d.getUTCFullYear();
    const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(d.getUTCDate()).padStart(2, '0');
    const dia = `${y}-${mm}-${dd}`;

    // Pool de voluntários paginado (cap 1000 do PostgREST · 1 a 1 com o pool).
    let all = []; let offset = 0;
    while (true) {
      let q = supabase
        .from('vol_profiles')
        .select(`
          id, full_name, email, avatar_url, planning_center_id, qr_code, phone, cpf, arquivado, membresia_id,
          team_members:vol_team_members(
            id, team_id, position_id,
            team:vol_teams(id, name, color),
            position:vol_positions(id, name)
          )
        `)
        // ⚠️ `arquivado = false` — o `/volunteers-pool` já filtrava e esta query
        // (nascida no PR do pool anotado) não, então a tela de montar escala
        // oferecia voluntário ARQUIVADO pra escalar. Arquivar tem que significar
        // "sumiu de todos os lugares onde se escolhe gente".
        .eq('arquivado', false)
        .order('full_name').range(offset, offset + 999);
      const { data, error } = await q;
      if (error) return res.status(400).json({ error: error.message });
      if (!data || !data.length) break;
      all = all.concat(data);
      if (data.length < 1000) break;
      offset += 1000;
    }
    // ⚠️ Conta de SISTEMA e nome-não-pessoa fora da lista de escalar. O print do
    // Matheus (13/08) mostrava ". f" e "ADM CBRio" entre os 860 candidatos.
    // Espelha `ehNomePlaceholder` do matcher: nenhum fluxo de PESSOAS deve
    // exibir isso — muito menos um em que se escolhe quem serve no culto.
    all = all.filter((v) => ehPessoaEscalavel(v.full_name));

    // Indisponibilidade: por culto específico + por período que cobre a data.
    const chave = (pid, pcid) => `${pid || ''}::${pcid || ''}`;
    const [{ data: unavCulto }, { data: unavPeriodo }] = await Promise.all([
      supabase.from('vol_availability')
        .select('volunteer_profile_id, planning_center_person_id, reason')
        .eq('service_id', sid),
      supabase.from('vol_availability')
        .select('volunteer_profile_id, planning_center_person_id, reason, unavailable_from, unavailable_to')
        .is('service_id', null)
        .lte('unavailable_from', dia)
        .gte('unavailable_to', dia),
    ]);
    const unavCultoMap = new Map();
    (unavCulto || []).forEach(u => unavCultoMap.set(chave(u.volunteer_profile_id, u.planning_center_person_id), u.reason));
    const unavPeriodoMap = new Map();
    (unavPeriodo || []).forEach(u => {
      const k = chave(u.volunteer_profile_id, u.planning_center_person_id);
      if (!unavPeriodoMap.has(k)) unavPeriodoMap.set(k, u);
    });

    // Outros cultos do MESMO DIA (exclui o atual) e suas escalas.
    const [{ data: outrosCultosDia }, { data: escalasEste }] = await Promise.all([
      supabase.from('vol_services').select('id, name, scheduled_at')
        .gte('scheduled_at', `${dia}T00:00:00-03:00`)
        .lte('scheduled_at', `${dia}T23:59:59-03:00`)
        .neq('id', sid).order('scheduled_at'),
      supabase.from('vol_schedules')
        .select('volunteer_id, planning_center_person_id').eq('service_id', sid),
    ]);
    const escaladoEste = new Set((escalasEste || []).map(s => chave(s.volunteer_id, s.planning_center_person_id)));
    const servicoPorId = Object.fromEntries((outrosCultosDia || []).map(o => [o.id, o]));
    const escaladoOutrosMap = new Map();
    if (outrosCultosDia && outrosCultosDia.length) {
      const { data: escalasOutros } = await supabase.from('vol_schedules')
        .select('volunteer_id, planning_center_person_id, service_id')
        .in('service_id', outrosCultosDia.map(o => o.id));
      (escalasOutros || []).forEach(s => {
        const k = chave(s.volunteer_id, s.planning_center_person_id);
        const o = servicoPorId[s.service_id];
        if (!escaladoOutrosMap.has(k)) escaladoOutrosMap.set(k, []);
        escaladoOutrosMap.get(k).push({ service_id: s.service_id, name: o?.name || 'Outro culto', scheduled_at: o?.scheduled_at || null });
      });
    }

    // Rodízio: última escala de cada pessoa ANTES deste culto.
    const chavesAlvo = new Set();
    for (const v of all || []) { if (v.id) chavesAlvo.add(v.id); if (v.planning_center_id) chavesAlvo.add(v.planning_center_id); }
    const rodizio = await _ultimaEscalaPorPessoa({ antesISO: service.scheduled_at, chavesAlvo });

    const pool = (all || []).map(v => {
      const k = chave(v.id, v.planning_center_id);
      const uPeriodo = unavPeriodoMap.get(k);
      const uCulto = unavCultoMap.get(k);
      const motivo = uPeriodo?.reason || uCulto || null;
      // A última escala pode estar gravada pelo id do perfil OU pelo id do
      // Planning Center — a mesma pessoa aparece pelos dois lados na base.
      const ultimas = [rodizio.mapa.get(v.id), rodizio.mapa.get(v.planning_center_id)].filter(Boolean);
      const ultima = ultimas.length ? ultimas.sort().pop() : null;
      const semanas = semanasSemServir(ultima, service.scheduled_at);
      return {
        ...v,
        indisponivel: !!(uPeriodo || uCulto),
        indisponivelMotivo: motivo,
        indisponivelOrigem: uPeriodo ? 'periodo' : (uCulto ? 'culto' : null),
        jaEscalado: escaladoEste.has(k),
        escaladoEm: escaladoOutrosMap.get(k) || [],
        ultimaEscala: ultima,
        semanasSemServir: semanas,
        rotuloRodizio: rotuloTempoSemServir(semanas),
      };
    });

    res.json({
      service, pool, outrosCultosDia: outrosCultosDia || [],
      // Janela EFETIVAMENTE varrida — a tela usa isto pra explicar o "sem
      // escala recente" em vez de deixar o supervisor adivinhar o alcance.
      rodizio: { desde: rodizio.desde, completo: rodizio.completo },
    });
  } catch (e) { res.status(500).json({ error: 'Erro ao montar contexto da escala' }); }
});

/**
 * Cobertura da escala de um culto: alvo (`vol_escala_culto_itens`) ×
 * preenchidas (`vol_schedules` com voluntário), por item.
 *
 * ⚠️ Extraída em 13/08/2026 porque o auto-preencher passou a decidir sobre as
 * MESMAS vagas que a tela mostra. Duas cópias desta conta divergiriam, e a
 * divergência apareceria como "a tela diz que falta 1 e o automático não
 * preenche nada".
 */
async function _coberturaDoCulto(sid) {
  const [{ data: alvo, error: aErr }, { data: sched, error: sErr }] = await Promise.all([
    supabase.from('vol_escala_culto_itens')
      .select('*, team:vol_teams(id,name), position:vol_positions(id,name)')
      .eq('service_id', sid).is('deleted_at', null).order('sort_order'),
    supabase.from('vol_schedules')
      .select('id, volunteer_id, volunteer_name, team_id, position_id, confirmation_status, escala_culto_item_id')
      .eq('service_id', sid),
  ]);
  if (aErr || sErr) throw new Error((aErr || sErr).message);

  // ⚠️ A conta em si é da régua PURA `utils/volCobertura` (no gate), a MESMA
  // que a visão matriz usa para N cultos. Reimplementar aqui faria a grade e a
  // tela do culto discordarem sobre o que ainda falta.
  const { itens, sobrando, resumo } = montarCobertura(alvo || [], sched || []);
  return { itens, sobrando, escalas: sched || [], resumo };
}

/**
 * MATRIZ da escala — várias semanas de uma vez.
 *
 * É a visão "Matrix" do Planning Center Services (vista ao vivo em 13/08/2026,
 * a pedido do Matheus): linhas = área × função, colunas = datas. O supervisor
 * abre o mês da área dele e enxerga os buracos em fila, em vez de abrir culto
 * por culto pra descobrir onde falta gente.
 *
 * ⚠️ A conta de cobertura é a MESMA da tela de um culto (`montarCobertura`, em
 * `utils/volCobertura`, no gate). Se a grade tivesse régua própria, ela e a
 * tela do culto discordariam sobre o que ainda falta — e quem monta escala
 * confiaria na que estivesse mais à mão.
 *
 * Parâmetros: `service_type_id` (opcional), `desde` (YYYY-MM-DD, default hoje
 * em BRT) e `semanas` (1–8, default 4).
 */
const MATRIZ_MAX_CULTOS = 24;

router.get('/escala-matriz', async (req, res) => {
  try {
    const semanas = Math.min(8, Math.max(1, parseInt(req.query.semanas, 10) || 4));
    // ⚠️ O "hoje" é o dia da IGREJA (BRT). Em UTC, das 21h em diante o dia já
    // virou e a grade começaria no dia seguinte, escondendo o culto de hoje.
    const desde = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.desde || ''))
      ? req.query.desde
      : diaBRT(new Date());
    const fim = new Date(new Date(`${desde}T12:00:00-03:00`).getTime() + semanas * 7 * 86400000);

    let q = supabase.from('vol_services')
      .select('id, name, scheduled_at, service_type_id, service_type_name')
      .gte('scheduled_at', `${desde}T00:00:00-03:00`)
      .lte('scheduled_at', fim.toISOString())
      .order('scheduled_at')
      .limit(MATRIZ_MAX_CULTOS + 1);
    if (req.query.service_type_id) q = q.eq('service_type_id', req.query.service_type_id);
    const { data: cultosBrutos, error: cErr } = await q;
    if (cErr) return res.status(400).json({ error: cErr.message });

    // ⚠️ Teto DECLARADO: uma grade de 40 colunas não se lê, e cortar em
    // silêncio faria o supervisor concluir que não há culto marcado depois.
    const cultos = (cultosBrutos || []).slice(0, MATRIZ_MAX_CULTOS);
    const truncado = (cultosBrutos || []).length > MATRIZ_MAX_CULTOS;
    if (!cultos.length) {
      return res.json({ cultos: [], linhas: [], resumo: { alvo: 0, preenchidas: 0, faltam: 0 }, truncado: false });
    }

    const ids = cultos.map(c => c.id);
    const emLotes = async (tabela, select) => {
      let todos = [];
      for (let i = 0; i < ids.length; i += 20) {
        const lote = ids.slice(i, i + 20);
        let offset = 0;
        for (;;) {
          let qq = supabase.from(tabela).select(select).in('service_id', lote).order('id').range(offset, offset + 999);
          if (tabela === 'vol_escala_culto_itens') qq = qq.is('deleted_at', null);
          const { data, error } = await qq;
          if (error) throw new Error(error.message);
          todos = todos.concat(data || []);
          if (!data || data.length < 1000) break;
          offset += 1000;
        }
      }
      return todos;
    };

    const [itens, escalas] = await Promise.all([
      emLotes('vol_escala_culto_itens', 'id, service_id, team_id, position_id, quantidade, fixo, sort_order, team:vol_teams(id,name,color), position:vol_positions(id,name)'),
      emLotes('vol_schedules', 'id, service_id, volunteer_id, volunteer_name, team_id, position_id, confirmation_status, escala_culto_item_id, planning_center_person_id'),
    ]);

    const porCulto = new Map(ids.map(id => [id, { itens: [], escalas: [] }]));
    for (const i of itens) porCulto.get(i.service_id)?.itens.push(i);
    for (const s of escalas) porCulto.get(s.service_id)?.escalas.push(s);

    // Uma LINHA por (área, função) — a identidade atravessa os cultos, mas o
    // item da composição é de cada culto (cada um tem os seus).
    const linhas = new Map();
    const chaveLinha = (t, p) => `${t || ''}::${p || ''}`;
    const garanteLinha = (team_id, team, cor, position_id, position, ordem) => {
      const k = chaveLinha(team_id, position_id);
      if (!linhas.has(k)) {
        linhas.set(k, {
          chave: k, team_id, team: team || 'Sem equipe', cor: cor || null,
          position_id: position_id || null, position: position || null,
          ordem: ordem ?? 999, celulas: {},
        });
      }
      const l = linhas.get(k);
      if (ordem != null && ordem < l.ordem) l.ordem = ordem;
      if (!l.position && position) l.position = position;
      if (!l.cor && cor) l.cor = cor;
      return l;
    };

    let alvoTotal = 0, preenchTotal = 0, faltamTotal = 0;
    const pessoaDaEscala = s => ({
      id: s.id, nome: s.volunteer_name, status: s.confirmation_status || 'pending',
      volunteer_id: s.volunteer_id, planning_center_person_id: s.planning_center_person_id,
    });

    for (const culto of cultos) {
      const { itens: it, escalas: es } = porCulto.get(culto.id);
      const cob = montarCobertura(it, es);
      alvoTotal += cob.resumo.alvo;
      preenchTotal += cob.resumo.preenchidas;
      faltamTotal += cob.resumo.faltam;

      for (const item of cob.itens) {
        const bruto = it.find(x => x.id === item.id);
        const l = garanteLinha(item.team_id, item.team, bruto?.team?.color, item.position_id, item.position, bruto?.sort_order);
        l.celulas[culto.id] = {
          item_id: item.id, alvo: item.alvo, faltam: item.faltam,
          pessoas: item.pessoas.map(pessoaDaEscala),
        };
      }

      // ⚠️ Quem está escalado fora da composição entra na grade com alvo 0 —
      // uma pessoa que não aparece na matriz é uma pessoa que a coordenação
      // escala em duplicidade.
      for (const s of cob.sobrando) {
        const l = garanteLinha(s.team_id, null, null, s.position_id, null, 998);
        const c = (l.celulas[culto.id] ||= { item_id: null, alvo: 0, faltam: 0, pessoas: [] });
        c.pessoas.push(pessoaDaEscala(s));
      }
    }

    // Nomes de equipe/função que só apareceram pelo lado das escalas soltas.
    const semNome = [...linhas.values()].filter(l => !l.team || l.team === 'Sem equipe');
    if (semNome.length) {
      const teamIds = [...new Set(semNome.map(l => l.team_id).filter(Boolean))];
      if (teamIds.length) {
        const { data: ts } = await supabase.from('vol_teams').select('id, name, color').in('id', teamIds);
        const mapa = Object.fromEntries((ts || []).map(t => [t.id, t]));
        for (const l of semNome) {
          const t = mapa[l.team_id];
          if (t) { l.team = t.name; l.cor = l.cor || t.color; }
        }
      }
    }

    const ordenadas = [...linhas.values()].sort((a, b) =>
      a.team.localeCompare(b.team, 'pt-BR') ||
      a.ordem - b.ordem ||
      String(a.position || '').localeCompare(String(b.position || ''), 'pt-BR'));

    res.json({
      cultos: cultos.map(c => ({
        ...c,
        status: contarStatus(porCulto.get(c.id).escalas),
      })),
      linhas: ordenadas,
      resumo: { alvo: alvoTotal, preenchidas: preenchTotal, faltam: faltamTotal },
      truncado,
      janela: { desde, semanas },
    });
  } catch (e) {
    console.error('[voluntariado] matriz:', e.message);
    res.status(500).json({ error: 'Erro ao montar a matriz da escala' });
  }
});

router.get('/services/:serviceId/escala-cobertura', async (req, res) => {
  try {
    const sid = req.params.serviceId;
    const { itens, resumo } = await _coberturaDoCulto(sid);
    res.json({ service_id: sid, itens, resumo });
  } catch (e) { res.status(500).json({ error: 'Erro ao calcular cobertura da escala' }); }
});

module.exports = router;
