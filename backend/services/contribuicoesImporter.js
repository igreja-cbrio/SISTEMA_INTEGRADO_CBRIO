// Importador de contribuições NOMINAIS (por pessoa) → mem_contribuicoes.
//
// O Matheus sobe periodicamente uma planilha (Excel/CSV) de contribuições
// nominais. Os KPIs de Generosidade que contam DOADORES/recorrência precisam
// do dado por membro (não só o total do balanço). Este serviço parseia a
// planilha (auto-detecção de colunas, tolerante a variações PT), casa cada
// linha a um membro EXISTENTE via membroMatch.acharMembroGuardado (NUNCA cria
// membro novo — a planilha de doação não pode poluir a Membresia) e grava de
// forma IDEMPOTENTE.
//
// Idempotência: referencia_externa = sha256(membro_id|dataISO|valorCentavos|tipo).
// Reimportar o MESMO arquivo = 0 novos (a linha já existe com essa referência).
// Não há UNIQUE em referencia_externa no banco, então a dedup é feita aqui:
// pré-consulta as referências já gravadas (deleted_at null) + dedup dentro do
// próprio arquivo.
//
// Espelha o estilo de balancoImporter.js (detectarLayout por header
// normalizado, batches) e contasPagarImporter.js (parse BR de valor/data).

const XLSX = require('xlsx');
const crypto = require('crypto');
const { supabase } = require('../utils/supabase');
const { acharMembroGuardado } = require('./membroMatch');

const BATCH_SIZE = 500;

// norm · lower + sem acento + trim (mesma ideia do balancoImporter)
const norm = (s) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();

// ── Sinônimos de cabeçalho (todos normalizados na comparação) ────────────────
const SINONIMOS = {
  nome: ['nome', 'nome completo', 'contribuinte', 'membro', 'doador'],
  cpf: ['cpf', 'documento', 'cpf/cnpj', 'cpf cnpj'],
  valor: ['valor', 'valor(r$)', 'valor (r$)', 'valor r$', 'valor da contribuicao'],
  data: ['data', 'data contribuicao', 'data da contribuicao', 'competencia', 'data do lancamento', 'data lancamento'],
  tipo: ['tipo', 'especie'],
  forma_pagamento: ['forma', 'forma de pagamento', 'forma pagamento', 'forma pagto'],
  area: ['area', 'ministerio', 'campus'],
  campanha: ['campanha'],
};

const AREAS_VALIDAS = ['kids', 'sede', 'ami', 'bridge', 'online'];

// Detecta os índices das colunas casando o header (normalizado) com os
// sinônimos. Retorna { campo: índice | -1 }.
function detectarLayout(header) {
  const norms = header.map(norm);
  const idxDe = (chave) => {
    for (const syn of SINONIMOS[chave]) {
      const i = norms.indexOf(syn);
      if (i >= 0) return i;
    }
    return -1;
  };
  const layout = {};
  for (const chave of Object.keys(SINONIMOS)) layout[chave] = idxDe(chave);
  return layout;
}

// ── Parsers de célula ────────────────────────────────────────────────────────

// data → ISO (aceita Date, serial do Excel, dd/mm/aaaa e ISO)
function dataToISO(v) {
  if (v === null || v === undefined || v === '') return null;
  if (v instanceof Date && !isNaN(v)) {
    return `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, '0')}-${String(v.getDate()).padStart(2, '0')}`;
  }
  if (typeof v === 'number') {
    const d = XLSX.SSF.parse_date_code(v);
    if (!d || !d.y) return null;
    return `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`;
  }
  const s = String(v).trim();
  const br = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (br) {
    const [, d, m, y] = br;
    const yy = y.length === 2 ? `20${y}` : y;
    return `${yy}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  return null;
}

// valor BR → número (milhar '.', decimal ','). Também aceita número puro.
function valorBR(v) {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  let s = String(v).trim().replace(/[R$\s]/g, '');
  // se tem vírgula, ela é o decimal (BR) → tira pontos de milhar, vírgula→ponto
  if (s.includes(',')) {
    s = s.replace(/\./g, '').replace(',', '.');
  }
  s = s.replace(/[^0-9.\-]/g, '');
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

// tipo → enum válido (dizimo/oferta/campanha · default dizimo)
function mapearTipo(v) {
  const s = norm(v);
  if (!s) return 'dizimo';
  if (s.includes('dizim')) return 'dizimo';
  if (s.includes('campanh')) return 'campanha';
  if (s.includes('ofert')) return 'oferta';
  return 'dizimo';
}

// area → enum válido (kids/sede/ami/bridge/online) ou null
function mapearArea(v) {
  const s = norm(v);
  if (!s) return null;
  if (AREAS_VALIDAS.includes(s)) return s;
  if (s.includes('kid') || s.includes('crianc') || s.includes('infant')) return 'kids';
  if (s.includes('bridge')) return 'bridge';
  if (s.includes('ami')) return 'ami';
  if (s.includes('online')) return 'online';
  if (s.includes('sede') || s.includes('templo') || s.includes('matriz')) return 'sede';
  return null;
}

const txt = (v) => (v === null || v === undefined || String(v).trim() === '') ? null : String(v).trim();

// ── parsePlanilha · buffer → { rows, colunas_detectadas, faltando } ──────────
// Não grava nada · só normaliza. `rows` já traz os campos parseados por linha
// (com o número da linha original pra reportar erros). `_data`/`_valor` cru
// preservam o valor lido pra distinguir "coluna existe mas célula vazia" de
// "coluna faltando".
function parsePlanilha(buffer) {
  const wb = XLSX.read(buffer, { type: 'buffer', cellDates: true, cellNF: false, cellStyles: false });
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) return { rows: [], colunas_detectadas: {}, faltando: ['nome/cpf', 'valor', 'data'] };

  const grid = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: true });
  if (grid.length < 2) return { rows: [], colunas_detectadas: {}, faltando: ['nome/cpf', 'valor', 'data'] };

  const header = grid[0];
  const layout = detectarLayout(header);

  // Colunas obrigatórias: valor + data + pelo menos uma chave de pessoa (nome ou cpf).
  const faltando = [];
  if (layout.valor < 0) faltando.push('valor');
  if (layout.data < 0) faltando.push('data');
  if (layout.nome < 0 && layout.cpf < 0) faltando.push('nome ou cpf');

  const colunas_detectadas = {};
  for (const [chave, i] of Object.entries(layout)) {
    if (i >= 0) colunas_detectadas[chave] = String(header[i]).trim();
  }

  const at = (r, i) => (i >= 0 ? r[i] : null);
  const rows = [];
  for (let li = 1; li < grid.length; li++) {
    const r = grid[li];
    if (!r || r.every((c) => c === null || c === '')) continue; // linha vazia

    rows.push({
      linha: li + 1, // 1-based, contando o header (como aparece no Excel)
      nome: txt(at(r, layout.nome)),
      cpf: txt(at(r, layout.cpf)),
      _valorRaw: at(r, layout.valor),
      _dataRaw: at(r, layout.data),
      valor: valorBR(at(r, layout.valor)),
      data: dataToISO(at(r, layout.data)),
      tipo: mapearTipo(at(r, layout.tipo)),
      forma_pagamento: txt(at(r, layout.forma_pagamento)),
      area: mapearArea(at(r, layout.area)),
      campanha: txt(at(r, layout.campanha)),
    });
  }

  return { rows, colunas_detectadas, faltando };
}

// ── Idempotência ─────────────────────────────────────────────────────────────
// referencia_externa determinística por (membro, data, valor, tipo).
function refExterna(membroId, dataISO, valor, tipo) {
  const centavos = Math.round((valor || 0) * 100);
  return crypto.createHash('sha256')
    .update(`${membroId}|${dataISO}|${centavos}|${tipo}`)
    .digest('hex');
}

// Consulta quais referências já existem (deleted_at null). PostgREST limita
// ~1000 no IN → particiona em 500 (igual balancoImporter.filtrarJaExistentes).
async function refsJaGravadas(refs) {
  const existentes = new Set();
  const lista = [...refs];
  for (let i = 0; i < lista.length; i += 500) {
    const chunk = lista.slice(i, i + 500);
    const { data, error } = await supabase
      .from('mem_contribuicoes')
      .select('referencia_externa')
      .in('referencia_externa', chunk)
      .is('deleted_at', null);
    if (error) throw new Error('Erro consultando contribuições existentes: ' + error.message);
    (data || []).forEach((r) => existentes.add(r.referencia_externa));
  }
  return existentes;
}

// ── processar · o coração ────────────────────────────────────────────────────
// Pra cada linha: valida → casa pessoa → calcula ref → checa duplicidade →
// (se commit) insere em lote. Modo prévia (commit=false) faz tudo menos gravar.
async function processar(rows, { userId = null, commit = false } = {}) {
  const resumo = {
    total: rows.length,
    inseridos: 0,
    duplicados: 0,
    sem_vinculo: 0,
    erros: [],
    colunas_detectadas: null, // preenchido pela rota (vem do parse)
    amostra_sem_vinculo: [],
  };

  // 1ª passada: valida + casa pessoa + monta payloads candidatos (com ref).
  const candidatos = []; // { ref, payload }
  const refsVistas = new Set(); // dedup dentro do próprio arquivo
  const semVinculoNomes = [];

  for (const row of rows) {
    // valida valor > 0
    if (row.valor === null || !(row.valor > 0)) {
      resumo.erros.push({ linha: row.linha, motivo: `valor inválido (${row._valorRaw ?? 'vazio'})` });
      continue;
    }
    // valida data
    if (!row.data) {
      resumo.erros.push({ linha: row.linha, motivo: `data inválida (${row._dataRaw ?? 'vazio'})` });
      continue;
    }
    if (!row.nome && !row.cpf) {
      resumo.erros.push({ linha: row.linha, motivo: 'linha sem nome e sem CPF' });
      continue;
    }

    // casa a pessoa (SÓ-LEITURA · nunca cria membro)
    let match = null;
    try {
      match = await acharMembroGuardado({ cpf: row.cpf, nome: row.nome });
    } catch (e) {
      resumo.erros.push({ linha: row.linha, motivo: 'erro ao casar pessoa: ' + e.message });
      continue;
    }
    if (!match?.membro_id) {
      resumo.sem_vinculo++;
      if (semVinculoNomes.length < 20) semVinculoNomes.push(row.nome || row.cpf || `linha ${row.linha}`);
      continue;
    }

    const ref = refExterna(match.membro_id, row.data, row.valor, row.tipo);

    // dedup dentro do próprio arquivo
    if (refsVistas.has(ref)) {
      resumo.duplicados++;
      continue;
    }
    refsVistas.add(ref);

    candidatos.push({
      ref,
      payload: {
        membro_id: match.membro_id,
        tipo: row.tipo,
        valor: row.valor,
        data: row.data,
        origem: 'importacao',
        referencia_externa: ref,
        registrado_por: userId,
        area: row.area || null,
        forma_pagamento: row.forma_pagamento || null,
        campanha: row.campanha || null,
      },
    });
  }

  resumo.amostra_sem_vinculo = semVinculoNomes;

  // Filtra os que já existem no banco (idempotência entre importações).
  const jaGravadas = candidatos.length
    ? await refsJaGravadas(candidatos.map((c) => c.ref))
    : new Set();

  const novos = [];
  for (const c of candidatos) {
    if (jaGravadas.has(c.ref)) resumo.duplicados++;
    else novos.push(c.payload);
  }

  // Modo prévia: reporta quantos ENTRARIAM, sem gravar.
  if (!commit) {
    resumo.inseridos = novos.length;
    return resumo;
  }

  // Grava em lote (batches ~500).
  let inseridos = 0;
  for (let i = 0; i < novos.length; i += BATCH_SIZE) {
    const chunk = novos.slice(i, i + BATCH_SIZE);
    const { data, error } = await supabase
      .from('mem_contribuicoes')
      .insert(chunk)
      .select('id');
    if (error) {
      resumo.erros.push({ linha: null, motivo: `lote ${i / BATCH_SIZE + 1}: ${error.message}` });
      continue;
    }
    inseridos += (data?.length || 0);
  }
  resumo.inseridos = inseridos;
  return resumo;
}

module.exports = { parsePlanilha, processar, refExterna };
