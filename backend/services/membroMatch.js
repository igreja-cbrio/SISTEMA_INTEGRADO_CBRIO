// ============================================================================
// services/membroMatch · matching de identidade de pessoa (fonte: mem_membros)
//
// Centraliza a lógica que estava espalhada em routes/pessoas.js
// (findOrCreateMembro + GET /lookup): dado cpf/email/telefone, encontra os
// membros candidatos por chave forte e decide achar-ou-criar.
//
// É a base do "guardar na origem" (Marcos · 2026-06-15): todo ponto de entrada
// (Next, batismo, voluntariado, cadastro) passa por aqui pra não duplicar
// pessoa. A fila de reconciliação do módulo "Next - Batismo" (fase 1) consome
// buscarCandidatos pros casos ambíguos (telefone/nome batendo sem CPF) e os
// leva pra revisão humana — NUNCA auto-funde aqui (família compartilha
// telefone/e-mail · auto-merge errado junta pessoas distintas, pior que
// duplicata).
//
// Fase 0: só chave forte (cpf · email · telefone), preservando exatamente o
// comportamento do antigo findOrCreateMembro (cpf -> email -> cria). O scoring
// fuzzy de nome (pg_trgm) entra na fase 1, onde a fila o consome.
// ============================================================================

const { supabase } = require('../utils/supabase');
const { escapePostgrestValue } = require('../utils/sanitize');

const COLS = 'id, nome, email, telefone, cpf, status, foto_url, familia_id';

// Confiança por chave · mesma escala da vw_membros_duplicados (consistência)
const PESO = { cpf: 100, telefone: 90, email: 85 };

function normalizarCpf(cpf) {
  const d = String(cpf || '').replace(/\D/g, '');
  return d.length === 11 ? d : null;
}

function normalizarTelefone(tel) {
  const d = String(tel || '').replace(/\D/g, '');
  return d.length >= 10 ? d : null;
}

function normalizarEmail(email) {
  const e = String(email || '').trim().toLowerCase();
  return e.length > 3 && e.includes('@') ? e : null;
}

// buscarCandidatos · membros que batem por chave forte, ranqueados por
// confiança. Cada candidato sai com { ...membro, motivos: [...], score }.
// Usado pelo GET /lookup e (fase 1) pela fila de reconciliação.
async function buscarCandidatos({ cpf, email, telefone } = {}, { limit = 5 } = {}) {
  const c = normalizarCpf(cpf);
  const em = normalizarEmail(email);
  const tel = normalizarTelefone(telefone);

  const ors = [];
  if (c) ors.push(`cpf.eq.${c}`);
  if (em) ors.push(`email.ilike.${escapePostgrestValue(em)}`);
  if (tel) ors.push(`telefone.ilike.%${tel}%`);
  if (ors.length === 0) return [];

  const { data, error } = await supabase
    .from('mem_membros')
    .select(COLS)
    .or(ors.join(','))
    .limit(Math.max(limit, 5) * 2);
  if (error) throw error;

  return (data || [])
    .map((m) => {
      const motivos = [];
      if (c && normalizarCpf(m.cpf) === c) motivos.push('cpf');
      if (tel && normalizarTelefone(m.telefone) === tel) motivos.push('telefone');
      if (em && normalizarEmail(m.email) === em) motivos.push('email');
      const score = motivos.reduce((s, k) => Math.max(s, PESO[k] || 0), 0);
      return { ...m, motivos, score };
    })
    .filter((m) => m.motivos.length > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

// acharOuCriar · acha por chave confiável (cpf -> email) ou cria mem_membros
// novo. Comportamento idêntico ao antigo findOrCreateMembro. NÃO auto-liga por
// telefone (risco de fundir pessoas distintas que compartilham número).
async function acharOuCriar({ cpf, email, telefone, nome, status = 'visitante' } = {}) {
  const cpf11 = normalizarCpf(cpf);
  const emailLc = email ? String(email).trim().toLowerCase() : null;
  const telDigits = telefone ? String(telefone).replace(/\D/g, '') : null;

  // 1) CPF exato (mais confiável)
  if (cpf11) {
    const { data } = await supabase
      .from('mem_membros')
      .select('id')
      .eq('cpf', cpf11)
      .maybeSingle();
    if (data?.id) return { membro_id: data.id, created: false, matched_by: 'cpf' };
  }

  // 2) E-mail exato
  if (emailLc) {
    const { data } = await supabase
      .from('mem_membros')
      .select('id')
      .ilike('email', emailLc)
      .limit(1);
    if (data && data[0]?.id) return { membro_id: data[0].id, created: false, matched_by: 'email' };
  }

  // 3) Cria novo (status='visitante' por padrão)
  const { data, error } = await supabase
    .from('mem_membros')
    .insert({
      nome: nome || 'Sem nome',
      email: emailLc || null,
      telefone: telDigits || null,
      cpf: cpf11,
      status,
      active: true,
    })
    .select('id')
    .single();
  if (error) throw error;
  return { membro_id: data.id, created: true };
}

// ── Nome: comparação conservadora pra AUTO-link ──────────────────────────────
function normalizarNome(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
}
function _bigrams(s) {
  const m = new Map();
  for (let i = 0; i < s.length - 1; i++) { const g = s.slice(i, i + 2); m.set(g, (m.get(g) || 0) + 1); }
  return m;
}
function _dice(a, b) {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const ba = _bigrams(a), bb = _bigrams(b);
  let inter = 0, ta = 0, tb = 0;
  for (const v of ba.values()) ta += v;
  for (const [g, v] of bb) { tb += v; if (ba.has(g)) inter += Math.min(v, ba.get(g)); }
  return ta + tb === 0 ? 0 : (2 * inter) / (ta + tb);
}
// CONSERVADOR de propósito (≥0.90) · só pra decidir AUTO-link por telefone.
// Nomes "parecidos" abaixo disso NÃO ligam sozinhos — viram fila do Kevyn.
function nomesMesmaPessoa(a, b) {
  const x = normalizarNome(a), y = normalizarNome(b);
  if (!x || !y) return false;
  if (x === y) return true;
  return _dice(x, y) >= 0.90;
}

// acharOuCriarGuardado · "guardar na origem" (Marcos · 2026-06-16). Política:
//   CPF exato → liga · e-mail exato → liga · telefone + NOME batendo → liga ·
//   senão CRIA stub. NUNCA liga por telefone/e-mail sozinho (família compartilha
//   o número/e-mail · auto-link errado junta pessoas distintas = pior que
//   duplicata). Colisão de telefone sem nome batendo cria stub e a
//   vw_membros_duplicados / vw_nb_duplicados_suspeitos + a fila do Kevyn pegam.
// `extra` = campos extras pro insert (ex.: data_nascimento, familia_id).
async function acharOuCriarGuardado({ cpf, email, telefone, nome, dataNascimento, status = 'visitante', extra = {} } = {}) {
  const cpf11 = normalizarCpf(cpf);
  const emailLc = normalizarEmail(email);
  const tel = normalizarTelefone(telefone);
  const nasc = dataNascimento || extra.data_nascimento || null;

  if (cpf11) {
    const { data } = await supabase.from('mem_membros').select('id').eq('cpf', cpf11).maybeSingle();
    if (data?.id) return { membro_id: data.id, created: false, matched_by: 'cpf' };
  }
  if (emailLc) {
    const { data } = await supabase.from('mem_membros').select('id').ilike('email', emailLc).limit(1);
    if (data && data[0]?.id) return { membro_id: data[0].id, created: false, matched_by: 'email' };
  }
  if (tel && nome) {
    const cands = await buscarCandidatos({ telefone }, { limit: 8 });
    const hit = cands.find((c) => nomesMesmaPessoa(c.nome, nome));
    if (hit) return { membro_id: hit.id, created: false, matched_by: 'telefone+nome' };
  }
  // nome + data de nascimento · forte pra quem não tem CPF/e-mail/telefone batendo
  // (ex.: pessoas importadas de grupos têm nome+nascimento). Conservador: mesma
  // data de nascimento E nome batendo (≥0.90) — não liga por nascimento sozinho.
  if (nasc && nome) {
    const { data } = await supabase.from('mem_membros')
      .select('id, nome').eq('data_nascimento', nasc).is('deleted_at', null).limit(30);
    const hit = (data || []).find((c) => nomesMesmaPessoa(c.nome, nome));
    if (hit) return { membro_id: hit.id, created: false, matched_by: 'nome+nascimento' };
  }

  const { data, error } = await supabase.from('mem_membros').insert({
    nome: nome || 'Sem nome',
    email: emailLc || null,
    telefone: tel || null,
    cpf: cpf11,
    status,
    active: true,
    ...extra,
  }).select('id').single();
  if (error) throw error;
  return { membro_id: data.id, created: true, matched_by: null };
}

module.exports = {
  normalizarCpf,
  normalizarTelefone,
  normalizarEmail,
  normalizarNome,
  nomesMesmaPessoa,
  buscarCandidatos,
  acharOuCriar,
  acharOuCriarGuardado,
};
