// Fase 3 · Conciliar balanço × OFX → identificar o doador por CPF.
//
// O balanço (fonte de verdade · fin_transacoes com codigo_legado) tem
// nome+valor+data mas NÃO tem CPF. O OFX (fin_lancamentos_brutos) tem
// CPF+valor+data+hora. Casamos os dois e ENRIQUECEMOS a linha do balanço com o
// CPF → vínculo ao membro (fin_transacoes.membro_id) + hora_real.
//
// Conservador (decisão do Matheus): auto-vincula só o inequívoco
//  - 1 único crédito OFX com mesmo valor+data, OU
//  - vários, mas exatamente 1 com o NOME (limpo) batendo com o do balanço.
// Ambíguo → fila de revisão (não chuta). CPF novo → contribuinte_avulso (Fase 1).
//
// ⚠️ NUNCA cria fin_transacoes nova (só edita a linha do balanço) → não duplica
// no dashboard. Conflito de CPF → identidade_pendencias (via matcher).

const { supabase } = require('../utils/supabase');
const { extractNomeContraparte } = require('./ofxParser');
const { nomeNormalizado, normalizarCpf, registrarObservacaoSegura } = require('./identidadeProgressiva');
const { resolverMembroPorDocumento } = require('./financeiroClassificador');

async function mapLimit(items, limit, fn) {
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) await fn(items[i++]);
  });
  await Promise.all(workers);
}

async function fetchAll(table, cols, applyFilter) {
  const out = [];
  for (let offset = 0; ; offset += 1000) {
    let q = supabase.from(table).select(cols).range(offset, offset + 999);
    q = applyFilter(q);
    const { data, error } = await q;
    if (error) throw new Error(`${table}: ${error.message}`);
    out.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  return out;
}

const chaveVD = (valor, data) => `${Number(valor).toFixed(2)}|${String(data).slice(0, 10)}`;

// Resolve CPF/CNPJ → membro na nossa base (nome real). Essencial p/ o OFX do
// Santander, que traz só o CPF (sem nome). Placeholder de avulso
// ("Contribuinte 0141...") NÃO conta como nome real. Lote de 150 p/ cap da URL.
async function resolverNomesPorDoc(docs) {
  const map = new Map();
  const unicos = [...new Set(docs.filter((d) => d && (d.length === 11 || d.length === 14)))];
  for (let i = 0; i < unicos.length; i += 150) {
    const lote = unicos.slice(i, i + 150);
    const { data, error } = await supabase.from('mem_membros')
      .select('id, nome, cpf, cnpj')
      .or(`cpf.in.(${lote.join(',')}),cnpj.in.(${lote.join(',')})`)
      .is('deleted_at', null);
    if (error) { console.warn('[conciliacaoOfx] resolverNomes · %s', error.message); continue; }
    for (const m of (data || [])) {
      const doc = String(m.cpf || m.cnpj || '');
      if (!doc) continue;
      const placeholder = /^contribuinte\s/i.test(m.nome || '');
      map.set(doc, { membro_id: m.id, nome: m.nome, placeholder });
    }
  }
  return map;
}

// Colapsa créditos OFX idênticos (mesmo CPF+valor+data) — reimport do mesmo
// extrato gera a linha 2× (uma com hora, outra sem). Mantém a com hora.
function dedupCandidatos(cands) {
  const porDoc = new Map();
  for (const c of cands) {
    const ex = porDoc.get(c.documento);
    if (!ex || (!ex.hora && c.hora)) porDoc.set(c.documento, c);
  }
  return [...porDoc.values()];
}

// Carrega os créditos OFX do período, com NOME LIMPO re-extraído do memo (os
// brutos antigos têm nome_contraparte sujo · o parser novo só vale p/ imports
// futuros, então relemos aqui). Indexa por valor|data.
async function indexarOfx(inicio, fim) {
  const brutos = await fetchAll(
    'fin_lancamentos_brutos',
    'id, valor, data_lancamento, hora_lancamento, documento_contraparte, memo, tipo_trn',
    (q) => q.eq('tipo_trn', 'CREDIT').not('documento_contraparte', 'is', null)
      .gte('data_lancamento', inicio).lte('data_lancamento', fim),
  );
  const porVD = new Map();
  for (const b of brutos) {
    const cpf = normalizarCpf(b.documento_contraparte); // só CPF com DV válido é chave
    const doc = String(b.documento_contraparte).replace(/\D/g, '');
    const ehCnpj = doc.length === 14;
    if (!cpf && !ehCnpj) continue;
    const nome = extractNomeContraparte(b.memo);
    const item = {
      bruto_id: b.id, valor: Number(b.valor), data: String(b.data_lancamento).slice(0, 10),
      hora: b.hora_lancamento || null, documento: doc, cpf, ehCnpj,
      nome_limpo: nome, nome_norm: nome ? nomeNormalizado(nome) : null,
    };
    const k = chaveVD(b.valor, b.data_lancamento);
    if (!porVD.has(k)) porVD.set(k, []);
    porVD.get(k).push(item);
  }
  return porVD;
}

// Escolhe o candidato OFX pra uma linha do balanço (recebe candidatos JÁ
// deduplicados). Retorna { cand, via } ou null.
function escolherCandidato(balNomeNorm, cands) {
  if (!cands || !cands.length) return null;
  if (cands.length === 1) return { cand: cands[0], via: 'valor_data' };
  if (balNomeNorm) {
    // 1) o CPF do candidato é um membro cujo nome bate com o do balanço (alta
    //    confiança · funciona no Santander, que não tem nome no OFX).
    const porMembro = cands.filter((c) => c.membro_nome_norm && c.membro_nome_norm === balNomeNorm);
    if (porMembro.length === 1) return { cand: porMembro[0], via: 'valor_data_membro' };
    // 2) nome limpo extraído do próprio OFX bate (Itaú traz nome no memo).
    const porNome = cands.filter((c) => c.nome_norm && c.nome_norm === balNomeNorm);
    if (porNome.length === 1) return { cand: porNome[0], via: 'valor_data_nome' };
  }
  return null; // ambíguo → revisão
}

/**
 * Roda a conciliação num período. dryRun=true não grava nada (só relatório).
 * @returns { stats, revisao? }
 */
async function conciliar({ inicio, fim, dryRun = false, userId = null } = {}) {
  if (!inicio || !fim) throw new Error('inicio e fim são obrigatórios');

  const porVD = await indexarOfx(inicio, fim);

  // Enriquece cada crédito OFX com o NOME do membro dono do CPF (o Santander
  // não traz nome no memo → é a única forma de identificar e desempatar).
  const todosDocs = [];
  for (const arr of porVD.values()) for (const it of arr) todosDocs.push(it.documento);
  const nomesPorDoc = await resolverNomesPorDoc(todosDocs);
  for (const arr of porVD.values()) for (const it of arr) {
    const m = nomesPorDoc.get(it.documento);
    if (m && !m.placeholder) {
      it.membro_nome = m.nome;
      it.membro_nome_norm = nomeNormalizado(m.nome);
    }
  }

  // Balanço receita Pix ainda sem membro e sem decisão de conciliação.
  const balanco = await fetchAll(
    'fin_transacoes',
    'id, valor, data_competencia, descricao, referencia',
    (q) => q.not('codigo_legado', 'is', null).eq('tipo', 'receita')
      .is('membro_id', null).is('conciliacao_ofx', null)
      .gte('data_competencia', inicio).lte('data_competencia', fim)
      .or('forma_pagamento.ilike.%pix%,forma_pagamento.is.null'),
  );

  const stats = { balanco_analisado: balanco.length, ofx_creditos: [...porVD.values()].reduce((s, a) => s + a.length, 0), auto: 0, revisao: 0, sem_match: 0, avulsos_criados: 0 };
  const paraVincular = []; // { transacao_id, cand }
  const revisao = [];

  for (const b of balanco) {
    const nomeNorm = nomeNormalizado(b.descricao || b.referencia || '');
    const cands = dedupCandidatos(porVD.get(chaveVD(b.valor, b.data_competencia)) || []);
    const escolha = escolherCandidato(nomeNorm, cands);
    if (escolha) {
      paraVincular.push({ transacao_id: b.id, cand: escolha.cand, via: escolha.via });
    } else if (cands.length > 1) {
      stats.revisao++;
      if (revisao.length < 500) revisao.push({
        transacao_id: b.id, nome: b.descricao || b.referencia, valor: Number(b.valor), data: String(b.data_competencia).slice(0, 10),
        candidatos: cands.map((c) => ({
          bruto_id: c.bruto_id, cpf: c.cpf,
          nome: c.membro_nome || c.nome_limpo || null, // nome do membro (base) > nome do OFX
          ja_membro: !!c.membro_nome, hora: c.hora,
        })),
      });
    } else {
      stats.sem_match++;
    }
  }
  stats.auto = paraVincular.length;

  if (dryRun) return { stats, revisao };

  // Resolve membro por CPF ÚNICO (dedup) — cria contribuinte_avulso p/ novo.
  const cpfsUnicos = [...new Set(paraVincular.map((p) => p.cand.documento))];
  const membroPorDoc = new Map();
  await mapLimit(cpfsUnicos, 8, async (doc) => {
    const cand = paraVincular.find((p) => p.cand.documento === doc)?.cand;
    try {
      const r = await resolverMembroPorDocumento(doc, cand?.nome_limpo || null, { criarSemNome: false });
      if (r?.membro_id) {
        membroPorDoc.set(doc, r.membro_id);
        if (r.criado_novo) stats.avulsos_criados++;
      }
      if (cand?.cpf) await registrarObservacaoSegura({ origem: 'financeiro_ofx', origemId: cand.cpf, cpf: cand.cpf, nome: cand.nome_limpo || null });
    } catch (e) {
      console.warn('[conciliacaoOfx] resolver doc falhou · %s', e.message);
    }
  });

  // Grava o vínculo na LINHA DO BALANÇO (membro_id + hora + proveniência).
  let vinculados = 0;
  await mapLimit(paraVincular, 8, async (p) => {
    const membro_id = membroPorDoc.get(p.cand.documento);
    if (!membro_id) return;
    const { error } = await supabase.from('fin_transacoes').update({
      membro_id,
      hora_real: p.cand.hora || undefined,
      conciliacao_ofx: { status: 'auto', bruto_id: p.cand.bruto_id, cpf: p.cand.cpf, via: p.via, em: new Date().toISOString() },
    }).eq('id', p.transacao_id).is('membro_id', null);
    if (!error) vinculados++;
  });
  stats.vinculados = vinculados;

  return { stats, revisao };
}

// Lista os casos ambíguos (Tier B) do período pra revisão humana.
async function listarRevisao({ inicio, fim } = {}) {
  const { revisao } = await conciliar({ inicio, fim, dryRun: true });
  return revisao;
}

// Confirma manualmente um par (revisão) → seta o membro na linha do balanço.
async function confirmarVinculo({ transacaoId, brutoId, userId = null }) {
  const { data: bruto } = await supabase.from('fin_lancamentos_brutos')
    .select('documento_contraparte, hora_lancamento, memo').eq('id', brutoId).maybeSingle();
  if (!bruto) throw new Error('Lançamento OFX não encontrado');
  const cpf = normalizarCpf(bruto.documento_contraparte);
  const doc = String(bruto.documento_contraparte || '').replace(/\D/g, '');
  const nome = extractNomeContraparte(bruto.memo);
  // Sem nome no memo, `resolverMembroPorDocumento` devolve NULL de propósito
  // (default `criarSemNome: false` desde 31/07) — a confirmação humana não
  // fabrica mais `Contribuinte NNNNNN...`. O caminho é cadastrar a pessoa na
  // Membresia com o CPF e voltar; aí o vínculo acha o cadastro real.
  const r = await resolverMembroPorDocumento(doc, nome);
  if (!r?.membro_id) {
    throw new Error(
      nome
        ? 'Não consegui resolver o membro do CPF'
        : 'O extrato não traz o nome do pagador. Cadastre a pessoa na Membresia com este CPF e confirme o vínculo depois — não vou criar cadastro sem nome.',
    );
  }
  if (cpf) await registrarObservacaoSegura({ origem: 'financeiro_ofx', origemId: cpf, cpf, nome });
  const { error } = await supabase.from('fin_transacoes').update({
    membro_id: r.membro_id,
    hora_real: bruto.hora_lancamento || undefined,
    conciliacao_ofx: { status: 'confirmado', bruto_id: brutoId, cpf, via: 'manual', por: userId, em: new Date().toISOString() },
  }).eq('id', transacaoId);
  if (error) throw new Error(error.message);
  return { ok: true, membro_id: r.membro_id, avulso: !!r.criado_novo };
}

// Ignora um caso (não reaparece na fila).
async function ignorarVinculo({ transacaoId, userId = null }) {
  const { error } = await supabase.from('fin_transacoes').update({
    conciliacao_ofx: { status: 'ignorado', por: userId, em: new Date().toISOString() },
  }).eq('id', transacaoId).is('membro_id', null);
  if (error) throw new Error(error.message);
  return { ok: true };
}

module.exports = { conciliar, listarRevisao, confirmarVinculo, ignorarVinculo };
