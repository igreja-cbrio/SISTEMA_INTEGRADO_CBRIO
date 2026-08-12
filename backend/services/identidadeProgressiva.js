// Identidade progressiva: cada porta registra o que observou e reavalia os
// pares conectados. Nunca funde automaticamente e nunca sobrescreve sinais.

const { supabase } = require('../utils/supabase');
const { escapePostgrestValue } = require('../utils/sanitize');

function digitos(v) { return String(v || '').replace(/\D/g, ''); }
function nomeNormalizado(v) {
  return String(v || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
}
function cpfValido(cpf) {
  const d = digitos(cpf);
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  const dv = (base, peso) => {
    let soma = 0;
    for (let i = 0; i < base.length; i += 1) soma += Number(base[i]) * (peso - i);
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };
  return dv(d.slice(0, 9), 10) === Number(d[9]) && dv(d.slice(0, 10), 11) === Number(d[10]);
}
function normalizarCpf(v) { const d = digitos(v); return cpfValido(d) ? d : null; }
function normalizarTelefone(v) { const d = digitos(v); return d.length >= 10 && d.length <= 13 ? d : null; }
function normalizarEmail(v) {
  const e = String(v || '').trim().toLowerCase();
  return e.length > 3 && e.includes('@') ? e : null;
}
function bigramas(v) {
  const out = new Map();
  for (let i = 0; i < v.length - 1; i += 1) out.set(v.slice(i, i + 2), (out.get(v.slice(i, i + 2)) || 0) + 1);
  return out;
}
function similaridadeNome(a, b) {
  const x = nomeNormalizado(a); const y = nomeNormalizado(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  const ax = bigramas(x); const by = bigramas(y);
  let inter = 0; let tx = 0; let ty = 0;
  for (const n of ax.values()) tx += n;
  for (const [g, n] of by) { ty += n; if (ax.has(g)) inter += Math.min(n, ax.get(g)); }
  return tx + ty ? (2 * inter) / (tx + ty) : 0;
}

function conjunto(valores) { return new Set(valores.filter(Boolean)); }
function intersecao(a, b) { return [...a].filter((v) => b.has(v)); }
function perfil(membro, observacoes = []) {
  return {
    id: membro.id,
    cpfs: conjunto([normalizarCpf(membro.cpf), ...observacoes.map((o) => normalizarCpf(o.cpf))]),
    telefones: conjunto([normalizarTelefone(membro.telefone), ...observacoes.map((o) => normalizarTelefone(o.telefone))]),
    emails: conjunto([normalizarEmail(membro.email), ...observacoes.map((o) => normalizarEmail(o.email))]),
    nascimentos: conjunto([membro.data_nascimento, ...observacoes.map((o) => o.data_nascimento)]),
    nomes: conjunto([nomeNormalizado(membro.nome), ...observacoes.map((o) => o.nome_normalizado || nomeNormalizado(o.nome))]),
    fontes: conjunto(observacoes.map((o) => o.origem)),
  };
}

function observacaoCombina(obs, p) {
  const sinais = [];
  if (obs.cpf && p.cpfs.has(obs.cpf)) sinais.push('CPF');
  if (obs.telefone && p.telefones.has(obs.telefone)) sinais.push('telefone');
  if (obs.email && p.emails.has(obs.email)) sinais.push('e-mail');
  if (obs.data_nascimento && p.nascimentos.has(obs.data_nascimento)) sinais.push('nascimento');
  if (obs.nome_normalizado && [...p.nomes].some((n) => similaridadeNome(n, obs.nome_normalizado) >= 0.90)) sinais.push('nome');
  return sinais;
}

function pontuarPar(a, b, observacaoPonte = null) {
  const evidencias = [];
  const contradicoes = [];
  let score = 0;
  const cpfComum = intersecao(a.cpfs, b.cpfs).length > 0;
  const telefoneComum = intersecao(a.telefones, b.telefones).length > 0;
  const emailComum = intersecao(a.emails, b.emails).length > 0;
  const nascimentoComum = intersecao(a.nascimentos, b.nascimentos).length > 0;
  const cpfConflitante = a.cpfs.size > 0 && b.cpfs.size > 0 && !cpfComum;
  const nascimentoConflitante = a.nascimentos.size > 0 && b.nascimentos.size > 0 && !nascimentoComum;
  let melhorNome = 0;
  for (const na of a.nomes) for (const nb of b.nomes) melhorNome = Math.max(melhorNome, similaridadeNome(na, nb));

  if (cpfComum) { score += 100; evidencias.push('CPF confirmado em comum'); }
  if (telefoneComum) { score += 30; evidencias.push('Telefone observado em comum'); }
  if (emailComum) { score += 20; evidencias.push('E-mail observado em comum'); }
  if (nascimentoComum) { score += 35; evidencias.push('Nascimento observado em comum'); }
  if (melhorNome >= 0.98) { score += 30; evidencias.push('Nome confirmado em comum'); }
  else if (melhorNome >= 0.90) { score += 25; evidencias.push('Nomes muito compatíveis'); }
  else if (melhorNome >= 0.82) { score += 12; evidencias.push('Nomes parcialmente compatíveis'); }

  if (observacaoPonte) {
    const sinaisA = observacaoCombina(observacaoPonte, a);
    const sinaisB = observacaoCombina(observacaoPonte, b);
    const forteA = sinaisA.includes('CPF') || sinaisA.includes('nascimento');
    const forteB = sinaisB.includes('CPF') || sinaisB.includes('nascimento');
    const ladoAConfirmado = forteA || (sinaisA.includes('nome') && sinaisA.length >= 2);
    const ladoBConfirmado = forteB || (sinaisB.includes('nome') && sinaisB.length >= 2);
    if ((forteA && ladoBConfirmado) || (forteB && ladoAConfirmado)) {
      score += 35;
      evidencias.push(`Novo cadastro conecta os registros por ${[...new Set([...sinaisA, ...sinaisB])].join(', ')}`);
    }
  }

  if (cpfConflitante) { contradicoes.push('CPFs válidos diferentes'); score = Math.min(score, 25); }
  if (nascimentoConflitante) { contradicoes.push('Nascimentos diferentes'); score = Math.min(score, 45); }
  score = Math.max(0, Math.min(100, score));
  const prioridade = score >= 90 ? 'quase_confirmado' : score >= 70 ? 'alta' : score >= 45 ? 'media' : 'descoberta';
  return { score, prioridade, evidencias: [...new Set(evidencias)], contradicoes };
}

function tabelaAusente(error) {
  return /mem_identidade_(observacoes|pares)|schema cache|does not exist/i.test(error?.message || '');
}

// nomeMaisCompleto · decide se o nome DECLARADO numa porta deve substituir o
// nome do cadastro (decisão do Marcos 2026-08-11, caso Thiago Nogueira ×
// "Thiago dos Santos Nogueira": "os nomes devem ser juntados e o mais completo
// deve ser mantido"). Regra conservadora: só promove quando o nome atual é uma
// VERSÃO ABREVIADA do declarado — todos os tokens do atual aparecem no
// declarado, NA MESMA ORDEM (subsequência), e o declarado acrescenta algo.
// Nunca troca token por token ("Maria Silva" × "Maria Souza" → null), nunca
// encurta, nunca reordena. Token de 1 letra no atual casa com token que começa
// por ela ("Ana P" → "Ana Paula"). Devolve o nome a gravar ou null.
const CONECTIVOS_NOME = new Set(['de', 'da', 'do', 'das', 'dos', 'e']);

// Nome digitado todo em minúsculas ganha capitalização simples (conectivos
// ficam minúsculos). Misto e CAIXA ALTA ficam como a pessoa digitou — a base
// tem os dois estilos e "corrigir" caixa alta seria reescrever metade dela.
function _capitalizarSeMinusculo(nome) {
  if (nome !== nome.toLowerCase()) return nome;
  return nome.split(' ')
    .map((t, i) => ((i > 0 && CONECTIVOS_NOME.has(t)) ? t : t.charAt(0).toUpperCase() + t.slice(1)))
    .join(' ');
}

function nomeMaisCompleto(nomeAtual, nomeDeclarado) {
  const declarado = String(nomeDeclarado || '').replace(/\s+/g, ' ').trim();
  if (!declarado || declarado.length > 250) return null;
  if (/^contribuinte\b/i.test(declarado)) return null;   // placeholder do financeiro não é nome
  if (declarado.includes('@')) return null;               // e-mail no campo de nome não é nome
  const declNorm = nomeNormalizado(declarado);
  const tDecl = declNorm.split(' ').filter(Boolean);
  if (tDecl.length < 2) return null;                       // 1 token não é nome completo
  // Token repetido (fora conectivo) = concatenação suja de formulário
  // ("Carlos Goncalves Silva Junior Carlos Junior", caso real de 11/08) —
  // nome de gente não repete sobrenome; isso nunca substitui um nome limpo.
  const naoConectivos = tDecl.filter((t) => !CONECTIVOS_NOME.has(t));
  if (new Set(naoConectivos).size !== naoConectivos.length) return null;

  const atualNorm = nomeNormalizado(nomeAtual);
  if (!atualNorm || atualNorm === 'sem nome') return declarado; // cadastro sem nome real adota
  if (atualNorm === declNorm) return null;                 // mesmo nome (caixa/acento) — não mexe

  const tAtual = atualNorm.split(' ').filter(Boolean);
  if (tDecl.length < tAtual.length) return null;           // declarado mais curto nunca vence

  // subsequência: cada token do atual precisa aparecer no declarado, em ordem
  let i = 0;
  let expandiuInicial = false;
  for (const tok of tDecl) {
    if (i >= tAtual.length) break;
    if (tok === tAtual[i]) { i += 1; continue; }
    if (tAtual[i].length === 1 && tok.startsWith(tAtual[i])) {
      expandiuInicial = true;
      i += 1;
    }
  }
  if (i !== tAtual.length) return null;                    // algum token do atual não está no declarado
  if (tDecl.length === tAtual.length && !expandiuInicial) return null; // nada foi acrescentado
  return _capitalizarSeMinusculo(declarado);
}

// _promoverNomeSeMaisCompleto · roda a cada observação de identidade LIGADA a
// um membro (todas as portas passam por aqui — matcher guardado e read-only).
// Best-effort: falha nunca derruba a porta. O UPDATE leva .eq('nome', atual)
// contra corrida (padrão do #2257) e o profiles.name ligado ao membro é
// sincronizado pela MESMA régua (precedente: gatilho do auth corrige os dois —
// nome novo só na membresia deixaria o app/ERP mostrando o antigo).
async function _promoverNomeSeMaisCompleto(membroId, nomeDeclarado, origem) {
  if (!membroId || !nomeDeclarado) return;
  try {
    const { data: mem } = await supabase.from('mem_membros')
      .select('id, nome').eq('id', membroId).is('deleted_at', null).maybeSingle();
    if (!mem) return;
    const novo = nomeMaisCompleto(mem.nome, nomeDeclarado);
    if (!novo) return;
    const { error } = await supabase.from('mem_membros')
      .update({ nome: novo }).eq('id', mem.id).eq('nome', mem.nome);
    if (error) return;
    console.log(`[identidade] nome promovido via ${origem}: "${mem.nome}" -> "${novo}" (${mem.id})`);
    const { data: profs } = await supabase.from('profiles')
      .select('id, name').eq('membro_id', mem.id).limit(5);
    for (const p of profs || []) {
      if (nomeMaisCompleto(p.name, novo)) {
        await supabase.from('profiles').update({ name: novo }).eq('id', p.id).eq('name', p.name);
      }
    }
  } catch (e) {
    console.warn('[identidade] promoção de nome falhou:', e.message);
  }
}

async function registrarObservacaoIdentidade({
  membroId = null, origem = 'cadastro', origemId = null,
  nome, cpf, telefone, email, dataNascimento, dados = {},
} = {}) {
  const obs = {
    membro_id: membroId || null,
    origem: String(origem || 'cadastro').slice(0, 100),
    origem_id: origemId ? String(origemId).slice(0, 200) : null,
    nome: nome ? String(nome).trim().slice(0, 250) : null,
    nome_normalizado: nomeNormalizado(nome) || null,
    cpf: normalizarCpf(cpf),
    telefone: normalizarTelefone(telefone),
    email: normalizarEmail(email),
    data_nascimento: dataNascimento || null,
    dados: dados && typeof dados === 'object' ? dados : {},
  };
  if (!obs.nome && !obs.cpf && !obs.telefone && !obs.email && !obs.data_nascimento) return null;

  // Nome mais completo vence (2026-08-11) — antes da gravação da observação de
  // propósito: a promoção não pode depender da tabela de observações existir.
  await _promoverNomeSeMaisCompleto(obs.membro_id, obs.nome, obs.origem);

  let inserida;
  const gravacao = obs.origem_id
    ? supabase.from('mem_identidade_observacoes').upsert(obs, { onConflict: 'origem,origem_id' }).select('*').single()
    : supabase.from('mem_identidade_observacoes').insert(obs).select('*').single();
  const { data, error } = await gravacao;
  if (error) {
    if (tabelaAusente(error)) return null;
    throw error;
  }
  inserida = data;

  const filtros = [];
  if (obs.cpf) filtros.push(`cpf.eq.${obs.cpf}`);
  if (obs.telefone) filtros.push(`telefone.eq.${obs.telefone}`);
  if (obs.email) filtros.push(`email.eq.${escapePostgrestValue(obs.email)}`);
  if (obs.data_nascimento) filtros.push(`data_nascimento.eq.${obs.data_nascimento}`);
  if (!filtros.length) return inserida;

  const { data: conectadas, error: eCon } = await supabase.from('mem_identidade_observacoes')
    .select('membro_id').or(filtros.join(',')).not('membro_id', 'is', null).limit(100);
  if (eCon) throw eCon;
  const ids = [...new Set([membroId, ...(conectadas || []).map((o) => o.membro_id)].filter(Boolean))];
  if (ids.length < 2) return inserida;

  const [{ data: membros, error: eMembros }, { data: historico, error: eHistorico }] = await Promise.all([
    supabase.from('mem_membros').select('id,nome,cpf,telefone,email,data_nascimento').in('id', ids).is('deleted_at', null),
    supabase.from('mem_identidade_observacoes')
      .select('membro_id,origem,nome,nome_normalizado,cpf,telefone,email,data_nascimento,observado_em')
      .in('membro_id', ids).order('observado_em', { ascending: false }).limit(1000),
  ]);
  if (eMembros) throw eMembros;
  if (eHistorico) throw eHistorico;
  const obsPorMembro = new Map();
  for (const h of historico || []) {
    if (!obsPorMembro.has(h.membro_id)) obsPorMembro.set(h.membro_id, []);
    obsPorMembro.get(h.membro_id).push(h);
  }
  const perfis = new Map((membros || []).map((m) => [m.id, perfil(m, obsPorMembro.get(m.id) || [])]));
  const pares = [];
  for (let i = 0; i < ids.length; i += 1) for (let j = i + 1; j < ids.length; j += 1) {
    const pa = perfis.get(ids[i]); const pb = perfis.get(ids[j]);
    if (!pa || !pb) continue;
    const resultado = pontuarPar(pa, pb, inserida);
    if (resultado.score < 30) continue;
    const [a, b] = [pa.id, pb.id].sort();
    const fontes = [...new Set([...pa.fontes, ...pb.fontes, obs.origem])];
    pares.push({
      membro_a_id: a, membro_b_id: b, score: resultado.score, prioridade: resultado.prioridade,
      evidencias: resultado.evidencias, contradicoes: resultado.contradicoes, fontes,
      ultima_evidencia_em: new Date().toISOString(), atualizado_em: new Date().toISOString(),
    });
  }
  if (pares.length) {
    const { error: ePares } = await supabase.from('mem_identidade_pares')
      .upsert(pares, { onConflict: 'membro_a_id,membro_b_id' });
    if (ePares && !tabelaAusente(ePares)) throw ePares;
  }
  return inserida;
}

async function registrarObservacaoSegura(entrada) {
  try {
    return await registrarObservacaoIdentidade(entrada);
  } catch (error) {
    console.error('[identidadeProgressiva] observação não registrada:', error.message);
    return null;
  }
}

module.exports = {
  cpfValido, normalizarCpf, normalizarTelefone, normalizarEmail, nomeNormalizado,
  similaridadeNome, pontuarPar, registrarObservacaoIdentidade, registrarObservacaoSegura,
  nomeMaisCompleto,
};
