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

module.exports = {
  normalizarCpf,
  normalizarTelefone,
  normalizarEmail,
  buscarCandidatos,
  acharOuCriar,
};
