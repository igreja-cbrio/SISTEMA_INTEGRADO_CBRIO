// Fase 1 · OFX alimenta a identidade por CPF (2026-07-24).
//
// Dado o conjunto de transações parseadas de um OFX (cada uma com
// documento_contraparte = CPF/CNPJ extraído do MEMO), resolve UM membro por
// CPF/CNPJ ÚNICO e devolve um Map (docLimpo → membro_id) que a rota de import
// usa pra preencher fin_lancamentos_brutos.membro_id.
//
// Respeita a LEI do Contrato de porta:
//  - Só CPF com DV VÁLIDO é chave (normalizarCpf). Nome só pra observação/stub.
//  - Registra observação de identidade SEMPRE (alimenta o motor de dedup ·
//    mem_identidade_observacoes/_pares) — nunca lança (registrarObservacaoSegura).
//  - Vincula por CPF/CNPJ EXATO a membro existente.
//  - CPF desconhecido: cria pessoa (status 'contribuinte_avulso', fora da
//    contagem de membro_ativo) SOMENTE quando for PIX de CRÉDITO (doação) e a
//    opção criarAvulso estiver ligada. Senão deixa membro_id null (a observação
//    fica pra cruzar/mesclar depois no Entradas).
//  - CNPJ (14) NUNCA cria pessoa (empresa); só vincula se já existir.
//  - Nome sozinho NUNCA liga (o matcher canônico já garante isso).

const { supabase } = require('../utils/supabase');
const { normalizarCpf, registrarObservacaoSegura } = require('./identidadeProgressiva');
const { acharOuCriarGuardado } = require('./membroMatch');

// Concorrência limitada (não sequencial, não tudo de uma vez).
async function mapLimit(items, limit, fn) {
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) await fn(items[i++]);
  });
  await Promise.all(workers);
}

// Índice de membros vivos em memória: doc(dígitos) → membro_id (CPF e CNPJ).
async function carregarIndicePorDocumento() {
  const porDoc = new Map();
  let offset = 0;
  const page = 1000;
  for (;;) {
    const { data, error } = await supabase
      .from('mem_membros')
      .select('id, cpf, cnpj')
      .is('deleted_at', null)
      .range(offset, offset + page - 1);
    if (error) throw new Error('Erro carregando membros: ' + error.message);
    if (!data || !data.length) break;
    for (const m of data) {
      if (m.cpf) porDoc.set(String(m.cpf).replace(/\D/g, ''), m.id);
      if (m.cnpj) porDoc.set(String(m.cnpj).replace(/\D/g, ''), m.id);
    }
    if (data.length < page) break;
    offset += page;
  }
  return porDoc;
}

/**
 * Resolve identidade dos contrapartes de um lote de transações OFX.
 * @param {Array} transactions  parsed do ofxParser (usa documento_contraparte,
 *   nome_contraparte, tipo_trn, valor)
 * @param {object} opts { criarAvulso=true, uploadId }
 * @returns {Promise<{ mapaDoc: Map<string,string>, stats }>}
 */
async function vincularIdentidadeOfx(transactions, { criarAvulso = true } = {}) {
  const stats = { cpfs_unicos: 0, vinculados_existente: 0, avulsos_criados: 0, observacoes: 0, ignorados: 0 };
  const mapaDoc = new Map(); // docLimpo → membro_id

  // 1) Junta por documento ÚNICO (a mesma pessoa aparece em vários PIX).
  //    Guarda um nome representativo (Itaú traz nome; Santander não) e se em
  //    alguma ocorrência foi CRÉDITO (doação recebida).
  const porDoc = new Map(); // docLimpo → { nome, temCredito, len }
  for (const t of transactions) {
    const raw = t.documento_contraparte;
    if (!raw) continue;
    const doc = String(raw).replace(/\D/g, '');
    if (doc.length !== 11 && doc.length !== 14) continue;
    const cur = porDoc.get(doc) || { nome: null, temCredito: false, len: doc.length };
    if (!cur.nome && t.nome_contraparte) cur.nome = t.nome_contraparte;
    if (t.tipo_trn === 'CREDIT' && Number(t.valor) > 0) cur.temCredito = true;
    porDoc.set(doc, cur);
  }
  stats.cpfs_unicos = porDoc.size;

  const indice = await carregarIndicePorDocumento();

  // 2) Resolve cada documento único (paralelo, concorrência limitada).
  await mapLimit([...porDoc.entries()], 8, async ([doc, info]) => {
    const jaExiste = indice.get(doc);
    if (info.len === 14) {
      // CNPJ: só vincula se já existir; nunca cria, não gera observação de pessoa.
      if (jaExiste) { mapaDoc.set(doc, jaExiste); stats.vinculados_existente++; }
      else stats.ignorados++;
      return;
    }
    // CPF: exige DV válido pra ser chave de identidade.
    const cpf = normalizarCpf(doc);
    if (!cpf) { stats.ignorados++; return; }

    // Observação de identidade SEMPRE (alimenta dedup + histórico do CPF).
    await registrarObservacaoSegura({ origem: 'financeiro_ofx', origemId: cpf, cpf, nome: info.nome || null });
    stats.observacoes++;

    if (jaExiste) { mapaDoc.set(doc, jaExiste); stats.vinculados_existente++; return; }

    // CPF novo: cria pessoa só em PIX de crédito (doação) + se habilitado + COM NOME REAL.
    // Decisão do Matheus (2026-07-30): só cadastra contribuinte se o OFX trouxer CPF
    // *E* nome — banco que manda só o CPF (ex.: Santander) NÃO gera mais o fantasma
    // "Contribuinte NNN". A observação de identidade acima já guardou o CPF pra
    // vincular/cadastrar depois (fila do Entradas); a contribuição fica sem vínculo.
    const nomeReal = String(info.nome || '').trim();
    if (criarAvulso && info.temCredito && nomeReal) {
      try {
        const r = await acharOuCriarGuardado({
          cpf, nome: nomeReal,
          status: 'contribuinte_avulso', origem: 'financeiro_ofx',
        });
        if (r?.membro_id) {
          mapaDoc.set(doc, r.membro_id);
          if (r.created) stats.avulsos_criados++; else stats.vinculados_existente++;
        }
      } catch (e) {
        console.warn('[ofxIdentidade] criar avulso falhou · cpf=%s · %s', cpf.slice(0, 3) + '***', e.message);
      }
    } else {
      // Sem nome real (ou sem crédito): não cria pessoa. Só contabiliza.
      stats.ignorados++;
      if (criarAvulso && info.temCredito && !nomeReal) stats.sem_nome = (stats.sem_nome || 0) + 1;
    }
  });

  return { mapaDoc, stats };
}

module.exports = { vincularIdentidadeOfx };
