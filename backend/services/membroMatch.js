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
const {
  normalizarCpf, normalizarTelefone, normalizarEmail, nomeNormalizado: normalizarNome,
  registrarObservacaoIdentidade,
} = require('./identidadeProgressiva');

const COLS = 'id, nome, email, telefone, cpf, data_nascimento, status, foto_url, familia_id';

// Confiança por chave · mesma escala da vw_membros_duplicados (consistência)
const PESO = { cpf: 100, telefone: 90, email: 85 };

async function _observar(membroId, entrada, matchedBy, created) {
  try {
    await registrarObservacaoIdentidade({
      membroId,
      origem: entrada.origem || 'matcher',
      origemId: entrada.origemId || null,
      nome: entrada.nome,
      cpf: entrada.cpf,
      telefone: entrada.telefone,
      email: entrada.email,
      dataNascimento: entrada.dataNascimento || entrada.extra?.data_nascimento || null,
      dados: { matched_by: matchedBy || null, created: !!created },
    });
  } catch (error) {
    // A observação é crítica para o diagnóstico, mas não pode derrubar um
    // formulário durante a janela entre backend e migration.
    console.error('[membroMatch] evidência de identidade não registrada:', error.message);
  }
}

// _registrarContatoNoMatch · quando a pessoa ligou num membro EXISTENTE
// trazendo contato diferente do principal (telefone do trabalho × pessoal),
// ACUMULA em mem_contatos via fn_registrar_contato (nunca sobrescreve o
// principal · decisão do Marcos 2026-07-17). Best-effort: falha não derruba
// a porta. Tolera a migration 20260717120000 ausente.
function _registrarContatoNoMatch(membroId, { telefone, email } = {}, fonte) {
  if (!membroId || (!telefone && !email)) return;
  supabase.rpc('fn_registrar_contato', {
    p_membro_id: membroId,
    p_telefone: telefone || null,
    p_email: email || null,
    p_fonte: fonte || 'porta',
  }).then(({ error }) => {
    if (error && !/fn_registrar_contato/.test(error.message || '')) {
      console.warn('[membroMatch] contato não registrado:', error.message);
    }
  });
}

// _candidatosPorContatoSecundario · complementa a busca no mem_membros com os
// contatos ACUMULADOS (mem_contatos): a pessoa que usou o telefone do trabalho
// numa porta e o pessoal na outra é encontrada pelos dois. Tolera a tabela
// ausente. Retorna Map membro_id -> Set(motivos).
async function _candidatosPorContatoSecundario({ email, telefone } = {}) {
  const em = normalizarEmail(email);
  const tel = normalizarTelefone(telefone);
  const hits = new Map();
  if (!em && !tel) return hits;
  try {
    const ors = [];
    if (tel) ors.push(`and(tipo.eq.telefone,valor.eq.${tel})`);
    if (em) ors.push(`and(tipo.eq.email,valor.eq.${escapePostgrestValue(em)})`);
    const { data, error } = await supabase
      .from('mem_contatos')
      .select('membro_id, tipo')
      .or(ors.join(','))
      .is('deleted_at', null)
      .limit(30);
    if (error) return hits;
    for (const c of data || []) {
      if (!hits.has(c.membro_id)) hits.set(c.membro_id, new Set());
      hits.get(c.membro_id).add(c.tipo);
    }
  } catch { /* tabela ausente · segue só com o principal */ }
  return hits;
}

// buscarCandidatos · membros que batem por chave forte, ranqueados por
// confiança. Cada candidato sai com { ...membro, motivos: [...], score }.
// Usado pelo GET /lookup e (fase 1) pela fila de reconciliação.
// Desde 2026-07-17 também acha pelos contatos SECUNDÁRIOS (mem_contatos).
async function buscarCandidatos({ cpf, email, telefone } = {}, { limit = 5 } = {}) {
  const c = normalizarCpf(cpf);
  const em = normalizarEmail(email);
  const tel = normalizarTelefone(telefone);

  const ors = [];
  if (c) ors.push(`cpf.eq.${c}`);
  if (em) ors.push(`email.ilike.${escapePostgrestValue(em)}`);
  if (tel) ors.push(`telefone.ilike.%${tel}%`);
  if (ors.length === 0) return [];

  const [{ data, error }, secundarios] = await Promise.all([
    supabase
      .from('mem_membros')
      .select(COLS)
      .or(ors.join(','))
      .is('deleted_at', null)
      .limit(Math.max(limit, 5) * 2),
    _candidatosPorContatoSecundario({ email, telefone }),
  ]);
  if (error) throw error;

  let rows = data || [];
  const jaTem = new Set(rows.map((m) => m.id));
  const idsExtras = [...secundarios.keys()].filter((id) => !jaTem.has(id));
  if (idsExtras.length) {
    const { data: extras } = await supabase
      .from('mem_membros')
      .select(COLS)
      .in('id', idsExtras.slice(0, 20))
      .is('deleted_at', null);
    rows = rows.concat(extras || []);
  }

  return rows
    .map((m) => {
      const motivos = [];
      const sec = secundarios.get(m.id);
      if (c && normalizarCpf(m.cpf) === c) motivos.push('cpf');
      if (tel && (normalizarTelefone(m.telefone) === tel || sec?.has('telefone'))) motivos.push('telefone');
      if (em && (normalizarEmail(m.email) === em || sec?.has('email'))) motivos.push('email');
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
async function acharOuCriar(entrada = {}) {
  // Compatibilidade para consumidores antigos, agora sob a mesma política
  // conservadora. E-mail sozinho nunca mais identifica uma pessoa.
  return acharOuCriarGuardado(entrada);
}

// ── Nome: comparação conservadora pra AUTO-link ──────────────────────────────
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

// Nome-placeholder do import financeiro ("Contribuinte 059412...") — o extrato
// chega com o nome mascarado e a fin_resolver_ou_criar_contribuinte cria o
// membro assim. NÃO é um nome de pessoa: nenhum fluxo de pessoas deve exibi-lo
// nem preferi-lo a um cadastro com nome real (incidente Kids 2026-07-26: 6
// check-ins imprimiram "Contribuinte NNN" como mãe na etiqueta).
function ehNomePlaceholder(nome) {
  return /^contribuinte\b/i.test(String(nome || '').trim());
}

// _consolidarCpfNoMatch · quando a pessoa entrou COM CPF mas ligou por sinal
// fraco (e-mail/telefone+nome/nascimento+nome), consolida o CPF no membro
// ligado — é o "CPF tardio" (pessoa converteu antes sem CPF, voltou com CPF).
// Delegado ao cpfReconciliar: preenche se o membro não tem CPF; conflito
// (CPF de outro membro / membro com CPF diferente) vira pendência humana,
// nunca auto-funde. Best-effort: falha aqui não derruba o vínculo.
// Confiança: e-mail/telefone+nome são sinais que a FAMÍLIA compartilha —
// homônimos exatos (pai/filho) fariam o CPF de um virar identidade do outro.
// Por isso vão como 'fraca' (só consolida com nascimento conferível dos 2
// lados; senão mantém o CPF somente na origem, sem abrir pendência).
// 'nome+nascimento' já
// conferiu o nascimento por construção → 'forte'.
async function _consolidarCpfNoMatch(membroId, cpf11, matchedBy, dataNascimento) {
  if (!cpf11) return;
  try {
    const { reconciliarCpfTardio } = require('./cpfReconciliar');
    await reconciliarCpfTardio({
      membroId, cpf: cpf11, origem: `matcher:${matchedBy}`, dataNascimento,
      confianca: matchedBy === 'nome+nascimento' ? 'forte' : 'fraca',
    });
  } catch (e) {
    console.error('[membroMatch] consolidar cpf pós-match:', e.message);
  }
}

// acharOuCriarGuardado · "guardar na origem" (Marcos · 2026-06-16). Política:
//   CPF exato → liga · e-mail exato + NOME batendo → liga · telefone + NOME
//   batendo → liga · senão CRIA stub. NUNCA liga por telefone/e-mail sozinho
//   (família compartilha o número E o e-mail · auto-link errado junta pessoas
//   distintas = pior que duplicata). Colisão sem nome batendo cria stub e a
//   vw_membros_duplicados / vw_nb_duplicados_suspeitos + a fila do Kevyn pegam.
// `extra` = campos extras pro insert (ex.: data_nascimento, familia_id).
// `soChaveForte`: liga SÓ por CPF (a pessoa afirmou "não sou eu" no dedup —
//   nenhum sinal deniável pode religá-la a outro cadastro).
async function acharOuCriarGuardado({ cpf, email, telefone, nome, dataNascimento, status = 'visitante', extra = {}, origem = 'matcher', origemId = null } = {}, { soChaveForte = false } = {}) {
  const entrada = { cpf, email, telefone, nome, dataNascimento, status, extra, origem, origemId };
  const cpf11 = normalizarCpf(cpf);
  const emailLc = normalizarEmail(email);
  const tel = normalizarTelefone(telefone);
  const nasc = dataNascimento || extra.data_nascimento || null;
  // Se chegou um CPF novo, contato compartilhável não pode absorvê-lo em um
  // cadastro antigo sem confirmar também o nascimento. Nesse caso criamos um
  // novo registro e a observação-ponte eleva o par para revisão humana.
  const candidatoCompativel = (c) => nomesMesmaPessoa(c.nome, nome)
    && (!cpf11 || (!!nasc && !!c.data_nascimento && nasc === c.data_nascimento));

  if (cpf11) {
    const { data } = await supabase.from('mem_membros').select('id, nome')
      .eq('cpf', cpf11).is('deleted_at', null).maybeSingle();
    if (data?.id) {
      // Match por CPF num registro com nome-placeholder do financeiro
      // ("Contribuinte NNN...") e a porta trouxe o nome REAL: adota o registro
      // (CPF = mesma pessoa) e corrige o nome — o fantasma vira o cadastro
      // real, em vez de propagar "Contribuinte" pra etiquetas/telas.
      if (ehNomePlaceholder(data.nome) && nome && String(nome).trim().length >= 3 && !ehNomePlaceholder(nome)) {
        const { error: eNome } = await supabase.from('mem_membros')
          .update({ nome: String(nome).trim() }).eq('id', data.id);
        if (!eNome) console.log(`[membroMatch] placeholder renomeado via ${origem}: ${data.nome} -> ${String(nome).trim()} (${data.id})`);
      }
      _registrarContatoNoMatch(data.id, { telefone: tel, email: emailLc }, 'porta');
      await _observar(data.id, entrada, 'cpf', false);
      return { membro_id: data.id, created: false, matched_by: 'cpf' };
    }
  }
  if (!soChaveForte && emailLc && nome) {
    // E-mail SEMPRE exige o NOME batendo (esposa que usa o e-mail do marido não
    // pode ser ligada ao marido). Sem nome, e-mail sozinho NÃO liga — cai no
    // CRIA/stub (a família compartilha a caixa · alinha ao contrato de
    // acharOuCriar: "e-mail sozinho nunca mais identifica uma pessoa").
    // buscarCandidatos cobre também o e-mail SECUNDÁRIO (mem_contatos).
    const cands = await buscarCandidatos({ email: emailLc }, { limit: 8 });
    const hit = cands.find(candidatoCompativel);
    if (hit?.id) {
      await _consolidarCpfNoMatch(hit.id, cpf11, 'email', nasc);
      _registrarContatoNoMatch(hit.id, { telefone: tel, email: emailLc }, 'porta');
      await _observar(hit.id, entrada, 'email+nome', false);
      return { membro_id: hit.id, created: false, matched_by: 'email' };
    }
  }
  if (soChaveForte) {
    // pula direto pro CRIA (nenhum sinal deniável liga)
  } else if (tel && nome) {
    const cands = await buscarCandidatos({ telefone }, { limit: 8 });
    const hit = cands.find(candidatoCompativel);
    if (hit) {
      await _consolidarCpfNoMatch(hit.id, cpf11, 'telefone+nome', nasc);
      _registrarContatoNoMatch(hit.id, { telefone: tel, email: emailLc }, 'porta');
      await _observar(hit.id, entrada, 'telefone+nome', false);
      return { membro_id: hit.id, created: false, matched_by: 'telefone+nome' };
    }
  }
  // nome + data de nascimento · forte pra quem não tem CPF/e-mail/telefone batendo
  // (ex.: pessoas importadas de grupos têm nome+nascimento). Conservador: mesma
  // data de nascimento E nome batendo (≥0.90) — não liga por nascimento sozinho.
  if (!soChaveForte && nasc && nome) {
    const { data } = await supabase.from('mem_membros')
      .select('id, nome').eq('data_nascimento', nasc).is('deleted_at', null).limit(30);
    const hit = (data || []).find((c) => nomesMesmaPessoa(c.nome, nome));
    if (hit) {
      await _consolidarCpfNoMatch(hit.id, cpf11, 'nome+nascimento', nasc);
      _registrarContatoNoMatch(hit.id, { telefone: tel, email: emailLc }, 'porta');
      await _observar(hit.id, entrada, 'nome+nascimento', false);
      return { membro_id: hit.id, created: false, matched_by: 'nome+nascimento' };
    }
  }

  const { data, error } = await supabase.from('mem_membros').insert({
    ...extra,
    nome: nome || 'Sem nome',
    email: emailLc || null,
    telefone: tel || null,
    cpf: cpf11,
    status,
    active: true,
  }).select('id').single();
  if (error) {
    // 23505 (uniq_mem_membros_cpf_ativo) = corrida: dois totens/fluxos com o
    // mesmo CPF novo ao mesmo tempo. Religa no vencedor em vez de 500.
    if (error.code === '23505' && cpf11) {
      const { data: d2 } = await supabase.from('mem_membros')
        .select('id').eq('cpf', cpf11).is('deleted_at', null).maybeSingle();
      if (d2?.id) {
        await _observar(d2.id, entrada, 'cpf', false);
        return { membro_id: d2.id, created: false, matched_by: 'cpf' };
      }
    }
    throw error;
  }
  await _observar(data.id, entrada, null, true);
  return { membro_id: data.id, created: true, matched_by: null };
}

// acharMembroGuardado · versão SÓ-LEITURA de acharOuCriarGuardado (NÃO cria).
// Para pontos de entrada que querem apenas ROTEAR pro membro já existente sem
// materializar um stub agora (ex.: inscrição pública de grupos, onde o membro
// só vira membro na aprovação do líder). Mesma política conservadora de
// acharOuCriarGuardado: cpf → email → telefone+nome → nascimento+nome → null.
// NUNCA liga por telefone/e-mail sozinho (família compartilha o número).
// `soChaveForte`: quando true, liga SÓ por CPF exato (pula e-mail, telefone+nome
//   e nascimento+nome). Usado quando a pessoa afirma "não sou eu" no dedup — aí
//   nenhum sinal deniável (e-mail/telefone/nome, que a família compartilha) pode
//   ligá-la a outro cadastro; só o CPF, que é individual, resolve.
async function acharMembroGuardado({ cpf, email, telefone, nome, dataNascimento } = {}, { soChaveForte = false } = {}) {
  const cpf11 = normalizarCpf(cpf);
  const emailLc = normalizarEmail(email);
  const tel = normalizarTelefone(telefone);
  const nasc = dataNascimento || null;
  const candidatoCompativel = (c) => nomesMesmaPessoa(c.nome, nome)
    && (!cpf11 || (!!nasc && !!c.data_nascimento && nasc === c.data_nascimento));

  if (cpf11) {
    const { data } = await supabase.from('mem_membros').select('id')
      .eq('cpf', cpf11).is('deleted_at', null).maybeSingle();
    if (data?.id) return { membro_id: data.id, matched_by: 'cpf' };
  }
  if (soChaveForte) return null;
  if (emailLc && nome) {
    // E-mail compartilhado pela família não liga sozinho: exige o NOME batendo.
    // Sem nome, não roteia por e-mail (cai pra telefone+nome / nascimento+nome /
    // null). buscarCandidatos cobre também o e-mail SECUNDÁRIO (mem_contatos).
    const cands = await buscarCandidatos({ email: emailLc }, { limit: 8 });
    const hit = cands.find(candidatoCompativel);
    if (hit?.id) return { membro_id: hit.id, matched_by: 'email' };
  }
  if (tel && nome) {
    const cands = await buscarCandidatos({ telefone }, { limit: 8 });
    const hit = cands.find(candidatoCompativel);
    if (hit) return { membro_id: hit.id, matched_by: 'telefone+nome' };
  }
  if (nasc && nome) {
    const { data } = await supabase.from('mem_membros')
      .select('id, nome').eq('data_nascimento', nasc).is('deleted_at', null).limit(30);
    const hit = (data || []).find((c) => nomesMesmaPessoa(c.nome, nome));
    if (hit) return { membro_id: hit.id, matched_by: 'nome+nascimento' };
  }
  return null;
}

module.exports = {
  normalizarCpf,
  normalizarTelefone,
  normalizarEmail,
  normalizarNome,
  nomesMesmaPessoa,
  ehNomePlaceholder,
  buscarCandidatos,
  acharOuCriar,
  acharOuCriarGuardado,
  acharMembroGuardado,
};
