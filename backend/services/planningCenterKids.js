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

function normNome(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

// Lê TODAS as crianças locais (paginado · contorna o cap de 1000 do PostgREST).
// Retorna:
//   porPco  · Map(planning_center_id -> {id, nome, data_nascimento, sexo})  (já vinculadas)
//   semPcoPorNome · Map(nome normalizado -> [ids])  (sem vínculo · pra casar por nome)
// Guarda nome/nascimento/sexo pra o sync PULAR quem não mudou (evita milhares de
// UPDATEs redundantes → sync fica quase instantâneo nas rodadas seguintes).
async function carregarLocais() {
  const porPco = new Map();
  const semPcoPorNome = new Map();
  const pageSize = 1000;
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from('kids_criancas')
      .select('id, nome, planning_center_id, data_nascimento, sexo')
      .is('deleted_at', null)
      .range(from, from + pageSize - 1);
    if (error) throw new Error(`Supabase: ${error.message}`);
    if (!data || data.length === 0) break;
    for (const r of data) {
      if (r.planning_center_id) {
        porPco.set(String(r.planning_center_id), { id: r.id, nome: r.nome, data_nascimento: r.data_nascimento, sexo: r.sexo });
        continue;
      }
      const nm = normNome(r.nome);
      if (!nm) continue;
      if (!semPcoPorNome.has(nm)) semPcoPorNome.set(nm, []);
      semPcoPorNome.get(nm).push(r.id);
    }
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return { porPco, semPcoPorNome };
}

// Roda promessas em lotes concorrentes (o cliente supabase-js usa HTTP/PostgREST,
// então dá pra paralelizar sem estourar o pool pg). Retorna quantas deram certo.
async function runBatched(items, fn, size = 25) {
  let ok = 0;
  for (const grp of chunk(items, size)) {
    const res = await Promise.all(grp.map(fn));
    ok += res.filter(Boolean).length;
  }
  return ok;
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
  const [{ totalPessoas, criancas }, { porPco, semPcoPorNome }] = await Promise.all([
    buscarCriancasPCO({ maxIdade }),
    carregarLocais(),
  ]);

  // Quantas crianças do PCO compartilham cada nome (evita vincular quando o nome
  // é ambíguo dos dois lados).
  const pcoNomeCount = {};
  for (const c of criancas) { const nm = normNome(c.nome); pcoNomeCount[nm] = (pcoNomeCount[nm] || 0) + 1; }

  const jaExistem = [];  // PCO id já vinculado → atualiza
  const aVincular = [];  // casou por nome com 1 local sem vínculo → liga
  const novas = [];      // não casou → cria

  for (const c of criancas) {
    if (porPco.has(c.planning_center_id)) { jaExistem.push(c); continue; }
    const nm = normNome(c.nome);
    const candidatos = semPcoPorNome.get(nm);
    if (candidatos && candidatos.length === 1 && pcoNomeCount[nm] === 1) {
      aVincular.push({ localId: candidatos.shift(), pco: c }); // consome o candidato
    } else {
      novas.push(c);
    }
  }

  // (1) Vincula os existentes (planilha) à pessoa do PCO por nome → grava o
  // planning_center_id pra ligar o histórico de frequência. Em lotes concorrentes.
  const vinculadas = await runBatched(aVincular, async (v) => {
    const { error } = await supabase.from('kids_criancas')
      .update({ planning_center_id: v.pco.planning_center_id, data_nascimento: v.pco.data_nascimento, sexo: v.pco.sexo, updated_at: new Date().toISOString() })
      .eq('id', v.localId);
    return !error;
  });

  // (2) Cria as que não casaram (insert em lote de 500).
  let criadas = 0, erros = 0;
  for (const lote of chunk(novas, 500)) {
    const rows = lote.map(c => ({ ...c, visitante: true, ativo: true }));
    const { error, count } = await supabase.from('kids_criancas').insert(rows, { count: 'exact' });
    if (error) { erros += rows.length; continue; }
    criadas += count ?? rows.length;
  }

  // (3) Atualiza nome/nascimento/sexo das já vinculadas — SÓ das que realmente
  // mudaram (pula milhares de UPDATEs redundantes) e em lotes concorrentes.
  const d10 = (v) => String(v || '').slice(0, 10);
  const mudaram = jaExistem.filter((c) => {
    const loc = porPco.get(c.planning_center_id);
    if (!loc) return false;
    return (loc.nome || '') !== (c.nome || '')
      || d10(loc.data_nascimento) !== d10(c.data_nascimento)
      || (loc.sexo || null) !== (c.sexo || null);
  });
  const atualizadas = await runBatched(mudaram, async (c) => {
    const loc = porPco.get(c.planning_center_id);
    const { error } = await supabase.from('kids_criancas')
      .update({ nome: c.nome, data_nascimento: c.data_nascimento, sexo: c.sexo, updated_at: new Date().toISOString() })
      .eq('id', loc.id);
    return !error;
  });

  return {
    total_pessoas_pco: totalPessoas,
    criancas_no_pco: criancas.length,
    vinculadas,
    criadas,
    atualizadas,
    inalteradas: jaExistem.length - mudaram.length,
    erros,
  };
}

module.exports = { syncCriancasPCO };
