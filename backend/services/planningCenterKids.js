// ============================================================================
// planningCenterKids.js · Sync de crianças do Planning Center Check-Ins
// ============================================================================
// Puxa a base de pessoas do PCO Check-Ins (produto Check-Ins · /check-ins/v2),
// filtra crianças (attribute `child` = true · fallback por idade pela data de
// nascimento) e faz UPSERT em kids_criancas por `planning_center_id` (idempotente:
// rodar de novo não duplica). Não deleta nada — só cria/atualiza.
//
// Reusa as credenciais e o fetch resiliente do planningCenter.js (mesmo PAT;
// o produto Check-Ins responde com a mesma Basic auth quando o token tem acesso).

const { getPCCredentials, fetchWithRetry } = require('./planningCenter');
const { supabase } = require('../utils/supabase');

const PC_CHECKINS_BASE = 'https://api.planningcenteronline.com/check-ins/v2';

// PCO Check-Ins · gênero costuma não vir; quando vier, normaliza pro CHECK do banco.
function mapSexo(gender) {
  if (!gender) return null;
  const g = String(gender).trim().toLowerCase();
  if (['m', 'male', 'masculino', 'homem', 'menino'].includes(g)) return 'M';
  if (['f', 'female', 'feminino', 'mulher', 'menina'].includes(g)) return 'F';
  return 'outro';
}

function idadeAnos(birthdate) {
  if (!birthdate) return null;
  const b = new Date(birthdate);
  if (isNaN(b.getTime())) return null;
  return (Date.now() - b.getTime()) / (365.25 * 24 * 3600 * 1000);
}

// Lê TODAS as crianças já vinculadas a um PCO id (paginado · contorna o cap de
// 1000 do PostgREST) → Map(planning_center_id -> id da criança).
async function carregarMapaExistentes() {
  const mapa = new Map();
  const pageSize = 1000;
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from('kids_criancas')
      .select('id, planning_center_id')
      .not('planning_center_id', 'is', null)
      .range(from, from + pageSize - 1);
    if (error) throw new Error(`Supabase: ${error.message}`);
    if (!data || data.length === 0) break;
    for (const r of data) mapa.set(String(r.planning_center_id), r.id);
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return mapa;
}

// Puxa todas as people do Check-Ins (paginado por offset) e devolve só as crianças
// mapeadas pro shape de kids_criancas.
async function buscarCriancasPCO({ maxIdade = 12 } = {}) {
  const { basic } = getPCCredentials();
  const headers = { Authorization: `Basic ${basic}` };
  const perPage = 100;
  let offset = 0;
  let totalPessoas = 0;
  const criancas = [];

  while (true) {
    const url = `${PC_CHECKINS_BASE}/people?per_page=${perPage}&offset=${offset}`;
    const resp = await fetchWithRetry(url, headers);
    if (!resp || !resp.ok) {
      throw new Error(`PCO Check-Ins ${resp?.status || '???'}: falha ao listar people (offset ${offset})`);
    }
    const json = await resp.json();
    const people = json.data || [];
    if (people.length === 0) break;
    totalPessoas += people.length;

    for (const p of people) {
      const a = p.attributes || {};
      const idade = idadeAnos(a.birthdate);
      // Criança = flag `child` do PCO; se vier nula, cai pra idade (≤ maxIdade).
      const ehCrianca = a.child === true || (a.child == null && idade != null && idade <= maxIdade);
      if (!ehCrianca) continue;
      const nome = (a.name || `${a.first_name || ''} ${a.last_name || ''}`).trim();
      if (!nome) continue;
      criancas.push({
        planning_center_id: String(p.id),
        nome,
        data_nascimento: a.birthdate || null,
        sexo: mapSexo(a.gender),
      });
    }

    if (people.length < perPage) break;
    offset += perPage;
    if (offset > 200000) break; // trava de segurança
  }

  return { totalPessoas, criancas };
}

function chunk(arr, n) {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

// Sync completo · idempotente. Retorna um resumo com as contagens.
async function syncCriancasPCO({ maxIdade = 12 } = {}) {
  const [{ totalPessoas, criancas }, existentes] = await Promise.all([
    buscarCriancasPCO({ maxIdade }),
    carregarMapaExistentes(),
  ]);

  const novas = criancas.filter(c => !existentes.has(c.planning_center_id));
  const jaExistem = criancas.filter(c => existentes.has(c.planning_center_id));

  let criadas = 0;
  let erros = 0;
  for (const lote of chunk(novas, 500)) {
    const rows = lote.map(c => ({ ...c, visitante: true, ativo: true }));
    const { error, count } = await supabase
      .from('kids_criancas')
      .insert(rows, { count: 'exact' });
    if (error) { erros += rows.length; continue; }
    criadas += count ?? rows.length;
  }

  // Atualiza nome/nascimento/sexo das já existentes (mantém o resto intacto).
  let atualizadas = 0;
  for (const c of jaExistem) {
    const id = existentes.get(c.planning_center_id);
    const { error } = await supabase
      .from('kids_criancas')
      .update({ nome: c.nome, data_nascimento: c.data_nascimento, sexo: c.sexo, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (!error) atualizadas++;
  }

  return {
    total_pessoas_pco: totalPessoas,
    criancas_no_pco: criancas.length,
    criadas,
    atualizadas,
    erros,
  };
}

module.exports = { syncCriancasPCO };
