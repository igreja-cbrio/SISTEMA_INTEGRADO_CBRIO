// Engine de classificacao financeira
//
// Pra cada lancamento bruto, tenta classificar usando esta ordem de prioridade:
//   1. Identificador de centavo (config UI)
//   2. Memoria historica (mesma contraparte/valor ja classificado N vezes)
//   3. Regras explicitas (regex memo / palavra-chave / cnpj contraparte)
//   4. (Futuro) Claude Haiku pra casos ambiguos
//
// Tambem cruza lancamentos OFX com fin_pix_detalhe usando (data, valor, CPF/CNPJ)
// pra obter hora real e identificar culto.

const { supabase } = require('../utils/supabase');

/**
 * Extrai centavo (2 digitos apos virgula) do valor
 */
function extractCentavo(valor) {
  if (valor === null || valor === undefined) return null;
  const abs = Math.abs(Number(valor));
  const cent = Math.round((abs % 1) * 100);
  return String(cent).padStart(2, '0');
}

/**
 * Normaliza texto pra match (lowercase + sem acentos + trim)
 */
function normalize(s) {
  return String(s || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().trim();
}

/**
 * Tenta classificar 1 lancamento bruto
 * Retorna { plano_contas_id, centro_custo_id, origem, confianca, explicacao, identificador_centavo }
 */
async function classificarLancamento(lancamento) {
  const {
    valor, tipo_trn, memo, documento_contraparte, nome_contraparte, banco_origem,
  } = lancamento;

  const ehCredito = tipo_trn === 'CREDIT' || valor > 0;
  const aplicaA = ehCredito ? 'credito' : 'debito';

  // ───────────────────────────────────────────────
  // 1. IDENTIFICADOR DE CENTAVO (so para creditos)
  // ───────────────────────────────────────────────
  if (ehCredito) {
    const centavo = extractCentavo(valor);
    if (centavo && centavo !== '00') {
      const { data: ident } = await supabase
        .from('fin_identificadores_centavo')
        .select('id, centavo, plano_contas_id, centro_custo_id, descricao')
        .eq('centavo', centavo)
        .eq('ativo', true)
        .maybeSingle();

      if (ident) {
        // Se o identificador tem plano definido · sugestao completa (1.0)
        // Se nao tem · sugestao parcial (centro custo + identificador, sem conta)
        // O admin escolhe a conta na fila
        return {
          plano_contas_id: ident.plano_contas_id || null,
          centro_custo_id: ident.centro_custo_id,
          identificador_centavo: centavo,
          origem: 'centavo',
          confianca: ident.plano_contas_id ? 1.0 : 0.5,
          explicacao: ident.plano_contas_id
            ? `Centavo ${centavo} -> ${ident.descricao}`
            : `Centavo ${centavo} -> ${ident.descricao} (escolher conta)`,
        };
      }
    }
  }

  // ───────────────────────────────────────────────
  // 2. MEMORIA HISTORICA
  // ───────────────────────────────────────────────
  // Prioridade: documento > nome > memo
  let memChave = null;
  let memTipo = null;
  if (documento_contraparte) {
    memChave = documento_contraparte;
    memTipo = 'documento';
  } else if (nome_contraparte) {
    memChave = normalize(nome_contraparte);
    memTipo = 'nome';
  }

  if (memChave) {
    const { data: mem } = await supabase
      .from('fin_memoria_classificacao')
      .select('plano_contas_id, centro_custo_id, ocorrencias')
      .eq('chave_contraparte', memChave)
      .eq('tipo_chave', memTipo)
      .order('ocorrencias', { ascending: false })
      .limit(1);

    if (mem && mem.length > 0 && mem[0].ocorrencias >= 2) {
      return {
        plano_contas_id: mem[0].plano_contas_id,
        centro_custo_id: mem[0].centro_custo_id,
        origem: 'memoria',
        confianca: Math.min(0.95, 0.5 + mem[0].ocorrencias * 0.1),
        explicacao: `Aprendido de ${mem[0].ocorrencias} classificacoes anteriores`,
      };
    }
  }

  // ───────────────────────────────────────────────
  // 3. REGRAS EXPLICITAS
  // ───────────────────────────────────────────────
  const { data: regras } = await supabase
    .from('fin_regras_classificacao')
    .select('id, nome, tipo_regra, pattern, case_insensitive, plano_contas_id, centro_custo_id, prioridade')
    .eq('ativo', true)
    .in('aplica_a', [aplicaA, 'ambos'])
    .order('prioridade', { ascending: true });

  for (const regra of regras || []) {
    let matched = false;
    if (regra.tipo_regra === 'regex_memo') {
      try {
        const flags = regra.case_insensitive ? 'i' : '';
        const re = new RegExp(regra.pattern, flags);
        matched = re.test(memo || '');
      } catch (_) { matched = false; }
    } else if (regra.tipo_regra === 'palavra_chave') {
      const h = regra.case_insensitive ? normalize(memo || '') : memo || '';
      const p = regra.case_insensitive ? normalize(regra.pattern) : regra.pattern;
      matched = h.includes(p);
    } else if (regra.tipo_regra === 'cnpj_contraparte') {
      matched = (documento_contraparte || '') === regra.pattern.replace(/\D/g, '');
    } else if (regra.tipo_regra === 'titularidade_pix') {
      matched = (banco_origem || '').toLowerCase().includes(regra.pattern.toLowerCase());
    }

    if (matched) {
      return {
        plano_contas_id: regra.plano_contas_id,
        centro_custo_id: regra.centro_custo_id,
        origem: 'regra',
        confianca: 0.9,
        explicacao: `Regra: ${regra.nome}`,
      };
    }
  }

  // Sem classificacao automatica
  return null;
}

/**
 * Atualiza memoria historica apos classificacao manual
 */
async function aprenderClassificacao({ documento, nome, plano_contas_id, centro_custo_id }) {
  if (!plano_contas_id) return;

  const chaves = [];
  if (documento) chaves.push({ chave: documento, tipo: 'documento' });
  if (nome) chaves.push({ chave: normalize(nome), tipo: 'nome' });

  for (const { chave, tipo } of chaves) {
    // Tenta incrementar ocorrencias se ja existe combinacao
    const { data: existing } = await supabase
      .from('fin_memoria_classificacao')
      .select('id, ocorrencias')
      .eq('chave_contraparte', chave)
      .eq('tipo_chave', tipo)
      .eq('plano_contas_id', plano_contas_id)
      .maybeSingle();

    if (existing) {
      await supabase
        .from('fin_memoria_classificacao')
        .update({
          ocorrencias: existing.ocorrencias + 1,
          ultimo_uso: new Date().toISOString(),
          centro_custo_id,
        })
        .eq('id', existing.id);
    } else {
      await supabase
        .from('fin_memoria_classificacao')
        .insert({
          chave_contraparte: chave,
          tipo_chave: tipo,
          plano_contas_id,
          centro_custo_id,
          ocorrencias: 1,
        });
    }
  }
}

/**
 * Identifica/cria membro a partir de CPF/CNPJ encontrado no extrato
 * Retorna { membro_id, criado_novo }
 */
async function resolverMembroPorDocumento(documento, nome) {
  if (!documento) return null;
  const cleanDoc = documento.replace(/\D/g, '');
  if (cleanDoc.length !== 11 && cleanDoc.length !== 14) return null;

  // Busca em mem_membros
  const { data: existente } = await supabase
    .from('mem_membros')
    .select('id, nome, status')
    .or(`cpf.eq.${cleanDoc},cnpj.eq.${cleanDoc}`)
    .maybeSingle();

  if (existente) {
    return { membro_id: existente.id, criado_novo: false };
  }

  // Cria contribuinte avulso
  const insertPayload = {
    nome: nome || `Contribuinte ${cleanDoc.substring(0, 6)}...`,
    status: 'contribuinte_avulso',
  };
  if (cleanDoc.length === 11) insertPayload.cpf = cleanDoc;
  else insertPayload.cnpj = cleanDoc;

  const { data: novo, error } = await supabase
    .from('mem_membros')
    .insert(insertPayload)
    .select('id')
    .single();

  if (error || !novo) return null;
  return { membro_id: novo.id, criado_novo: true };
}

/**
 * Matching · cruza lancamentos OFX com fin_pix_detalhe
 * Score = data igual + valor igual + (CPF igual = bonus)
 *
 * Pra cada lancamento bruto pendente de match, procura PIX no mesmo dia
 * com mesmo valor. Se acha 1, score alto. Se acha varios, refina por CPF.
 */
async function matchOfxPix({ uploadId, conta_id } = {}) {
  // Pega lancamentos brutos sem hora ainda
  const queryLanc = supabase
    .from('fin_lancamentos_brutos')
    .select('id, data_lancamento, valor, tipo_trn, documento_contraparte, memo')
    .is('hora_lancamento', null);

  if (uploadId) queryLanc.eq('upload_id', uploadId);
  if (conta_id) queryLanc.eq('conta_id', conta_id);

  const { data: lancamentos } = await queryLanc;
  if (!lancamentos || lancamentos.length === 0) return { matched: 0, ambiguous: 0 };

  let matched = 0;
  let ambiguous = 0;

  for (const lanc of lancamentos) {
    // So matcha PIX recebido (credito) por ora
    if (lanc.tipo_trn !== 'CREDIT' || lanc.valor <= 0) continue;

    // Busca PIX detalhe com mesma data + valor
    const { data: candidatos } = await supabase
      .from('fin_pix_detalhe')
      .select('id, end_to_end_id, datetime_brt, hora, valor, pagador_documento, pagador_nome, culto_slot_id')
      .eq('data', lanc.data_lancamento)
      .eq('valor', Math.abs(lanc.valor))
      .is('lancamento_bruto_id', null);

    if (!candidatos || candidatos.length === 0) continue;

    let escolhido = null;
    if (candidatos.length === 1) {
      escolhido = candidatos[0];
    } else {
      // Multiplos · refina por CPF se houver
      if (lanc.documento_contraparte) {
        const porDoc = candidatos.find(c => c.pagador_documento === lanc.documento_contraparte);
        if (porDoc) escolhido = porDoc;
      }
      // Se ainda nao escolheu e tem nome, refina por nome
      if (!escolhido && lanc.memo) {
        const memoNorm = normalize(lanc.memo);
        const porNome = candidatos.find(c => c.pagador_nome && memoNorm.includes(normalize(c.pagador_nome)));
        if (porNome) escolhido = porNome;
      }
      if (!escolhido) {
        ambiguous++;
        continue;
      }
    }

    // Aplica match
    const score = candidatos.length === 1 ? 1.0 : 0.85;
    await Promise.all([
      supabase
        .from('fin_lancamentos_brutos')
        .update({
          hora_lancamento: escolhido.hora,
          hora_origem: 'pix_match',
          end_to_end_id: escolhido.end_to_end_id,
        })
        .eq('id', lanc.id),
      supabase
        .from('fin_pix_detalhe')
        .update({
          lancamento_bruto_id: lanc.id,
          match_score: score,
          match_status: 'matched',
        })
        .eq('id', escolhido.id),
    ]);
    matched++;
  }

  return { matched, ambiguous, total: lancamentos.length };
}

/**
 * Aplica classificacao em massa pros lancamentos brutos sem classificacao
 * Cria entradas em fin_fila_classificacao com sugestoes
 */
async function classificarBatch({ uploadId } = {}) {
  const q = supabase
    .from('fin_lancamentos_brutos')
    .select('*')
    .eq('ja_classificado', false)
    .limit(500);
  if (uploadId) q.eq('upload_id', uploadId);

  const { data: lancamentos } = await q;
  if (!lancamentos || lancamentos.length === 0) return { processados: 0, sugeridos: 0 };

  let sugeridos = 0;

  for (const lanc of lancamentos) {
    const sugestao = await classificarLancamento(lanc);
    if (!sugestao) continue;

    // Resolve membro se houver documento
    let membro_id = null;
    if (lanc.documento_contraparte) {
      const res = await resolverMembroPorDocumento(lanc.documento_contraparte, lanc.nome_contraparte);
      if (res) membro_id = res.membro_id;
    }

    // Cria entrada na fila (UPSERT pois pode ja ter classificacao pendente)
    await supabase
      .from('fin_fila_classificacao')
      .upsert({
        lancamento_bruto_id: lanc.id,
        sugestao_plano_contas_id: sugestao.plano_contas_id,
        sugestao_centro_custo_id: sugestao.centro_custo_id,
        sugestao_membro_id: membro_id,
        sugestao_origem: sugestao.origem,
        sugestao_confianca: sugestao.confianca,
        sugestao_explicacao: sugestao.explicacao,
        status: 'pendente',
      }, { onConflict: 'lancamento_bruto_id' });

    sugeridos++;
  }

  return { processados: lancamentos.length, sugeridos };
}

module.exports = {
  classificarLancamento,
  aprenderClassificacao,
  resolverMembroPorDocumento,
  matchOfxPix,
  classificarBatch,
  extractCentavo,
};
