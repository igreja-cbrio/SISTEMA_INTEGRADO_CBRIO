// Sinais de jornada dos convertidos → os `marcos` de cada um (COM DATA).
//
// ⚠️⚠️ RÉGUA ÚNICA. Extraído de `GET /cuidados/jornada-convertidos` em
// 24/08/2026, sem mudar uma linha da lógica, porque o GRÁFICO do dashboard
// (`GET /cuidados/dashboard-series`) passou a responder a MESMA pergunta —
// "esse convertido seguiu pra outro valor?". Duas implementações divergiriam,
// e o sintoma seria a aba Dashboard dizendo um número e a Próximos passos
// dizendo outro sobre as mesmas pessoas.
//
// ⚠️ Quem decide o que CONTA como engajamento é `jornadaTempo`
// (`engajouEmOutroValor`) — aqui só se CARREGA o fato e se monta o marco.
//
// ⚠️ `podeGenerosidade` é OPÇÃO do chamador, nunca lida de `req` aqui: é dado
// financeiro e a régua de quem vê mora em `podeVerFinanceiroDePessoa`.
const { supabase } = require('../utils/supabase');
const jt = require('../utils/jornadaTempo');

/**
 * @param {Array} convertidos linhas de `cui_convertidos` (precisa de
 *   `membro_id`, `cpf`, `nome`, `data_culto`)
 * @param {object} [opts]
 * @param {boolean} [opts.podeGenerosidade] inclui o marco financeiro
 * @returns {Promise<{batOf, nextOf, marcosDe, datasImport}>}
 */
async function carregarSinaisConvertidos(convertidos, opts = {}) {
  const podeGenerosidade = opts.podeGenerosidade === true;
    const onlyDigits = (v) => String(v || '').replace(/\D/g, '');

    const fetchAll = async (table, columns, applyFilter) => {
      const out = []; let from = 0; const page = 1000;
      while (true) {
        let q = supabase.from(table).select(columns).range(from, from + page - 1);
        if (applyFilter) q = applyFilter(q);
        const { data, error } = await q;
        if (error) throw error;
        out.push(...(data || []));
        if (!data || data.length < page) break;
        from += page;
      }
      return out;
    };

    const batismos = await fetchAll('batismo_inscricoes', 'status, membro_id, cpf, nome, data_batismo', (q) => q.is('deleted_at', null));
    const nextMats = await fetchAll('next_matriculas', 'id, membro_id, cpf, nome', (q) => q.is('deleted_at', null)); // matrícula = "inscrito"
    const nextFormados = await fetchAll('vw_next_formado_pessoa', 'membro_id, cpf, nome', (q) => q); // "fez Next" POR PESSOA (cross-turma)

    // índices de batismo (realizado > inscrito) e de Next (fez check-in > só inscrito)
    const bM = new Map(), bC = new Map(), bN = new Map();
    const putB = (m, k, real) => { if (!k) return; const c = m.get(k); const r = real ? 2 : 1; if (!c || r > c.r) m.set(k, { r, real }); };
    for (const b of batismos) {
      const real = b.status === 'realizado';
      putB(bM, b.membro_id, real);
      putB(bC, onlyDigits(b.cpf).length === 11 ? onlyDigits(b.cpf) : null, real);
      putB(bN, String(b.nome || '').trim().toLowerCase() || null, real);
    }
    const batOf = (c) => {
      // Com membro_id/CPF, casa SÓ por chave forte — cruzar por nome aqui gera
      // falso positivo (homônimo) e super-conta. Nome só quando não há identificação.
      const temCpf = onlyDigits(c.cpf).length === 11;
      if (c.membro_id || temCpf) {
        const cs = [c.membro_id ? bM.get(c.membro_id) : null, temCpf ? bC.get(onlyDigits(c.cpf)) : null].filter(Boolean);
        return cs.length ? { real: cs.some(x => x.real) } : null;
      }
      const hit = bN.get(String(c.nome || '').trim().toLowerCase());
      return hit ? { real: hit.real } : null;
    };
    // "fez Next" = formado POR PESSOA (fonte única vw_next_formado_pessoa · cross-turma);
    // "inscrito" = tem matrícula (qualquer). Casa por chave forte (membro/CPF); nome só sem id.
    const insM = new Set(), insC = new Set(), insN = new Set();
    for (const m of nextMats) {
      if (m.membro_id) insM.add(m.membro_id);
      const cc = onlyDigits(m.cpf); if (cc.length === 11) insC.add(cc);
      const nn = String(m.nome || '').trim().toLowerCase(); if (nn) insN.add(nn);
    }
    const fezM = new Set(), fezC = new Set(), fezN = new Set();
    for (const v of nextFormados) {
      if (v.membro_id) fezM.add(v.membro_id);
      const cc = onlyDigits(v.cpf); if (cc.length === 11) fezC.add(cc);
      const nn = String(v.nome || '').trim().toLowerCase(); if (nn) fezN.add(nn);
    }
    const matchPessoa = (c, M, C, N) => {
      const temCpf = onlyDigits(c.cpf).length === 11;
      if (c.membro_id || temCpf) return (c.membro_id && M.has(c.membro_id)) || (temCpf && C.has(onlyDigits(c.cpf)));
      const nn = String(c.nome || '').trim().toLowerCase();
      return !!nn && N.has(nn);
    };
    const nextOf = (c) => {
      if (matchPessoa(c, fezM, fezC, fezN)) return { fez: true };
      if (matchPessoa(c, insM, insC, insN)) return { fez: false };
      return null;
    };

    // ──────────────────────────────────────────────────────────────────────
    // TEMPO ATÉ CADA MARCO (2026-08-14 · pedido do Matheus)
    // Aditivo: os campos antigos (contato/batismo/next booleanos) seguem
    // intactos — 5 telas os consomem. Aqui nasce o `marcos`, com DATA.
    // ⚠️ A régua de "fez o Next" AQUI é PRESENÇA em ≥1 encontro (decisão do
    // Matheus, 14/08), diferente do `next` booleano acima, que é "formado"
    // (aula 1 E 2 · fonte vw_next_formado_pessoa). São perguntas diferentes e
    // as duas continuam na resposta — a tela declara qual está exibindo.
    // Medido em 14/08: nesta coorte as duas dão 20 pessoas; o que muda é a
    // DATA (encontro real × data da matrícula).
    // ──────────────────────────────────────────────────────────────────────
    const membroIds = [...new Set(convertidos.map((c) => c.membro_id).filter(Boolean))];

    // ⚠️ `.in()` em lotes de 200: lista grande estoura a URL do PostgREST.
    const emLotes = async (table, columns, ids, applyFilter) => {
      const out = [];
      for (let i = 0; i < ids.length; i += 200) {
        const lote = ids.slice(i, i + 200);
        out.push(...await fetchAll(table, columns, (q) => {
          const base = q.in('membro_id', lote);
          return applyFilter ? applyFilter(base) : base;
        }));
      }
      return out;
    };

    // menor data por chave (a PRIMEIRA vez que aconteceu · datas ISO comparam
    // lexicograficamente, então `<` basta e evita construir Date por linha)
    const menor = (mapa, chave, dia) => {
      if (!chave || !dia) return;
      const atual = mapa.get(chave);
      if (!atual || dia < atual) mapa.set(chave, dia);
    };
    const chaveNome = (n) => String(n || '').trim().toLowerCase() || null;
    const chaveCpf = (v) => (onlyDigits(v).length === 11 ? onlyDigits(v) : null);
    const novoIdx = () => ({ M: new Map(), C: new Map(), N: new Map() });
    // Espelha `matchPessoa`: chave forte primeiro; nome SÓ sem identificação
    // (cruzar por nome com membro_id disponível gera homônimo e superconta).
    const dataDoMarco = (c, idx) => {
      const cpf = chaveCpf(c.cpf);
      if (c.membro_id || cpf) {
        const cands = [c.membro_id ? idx.M.get(c.membro_id) : null, cpf ? idx.C.get(cpf) : null].filter(Boolean);
        return cands.length ? cands.sort()[0] : null;
      }
      const nn = chaveNome(c.nome);
      return nn ? (idx.N.get(nn) || null) : null;
    };

    // Batismo · data do batismo realizado
    const idxBatismo = novoIdx();
    for (const b of batismos) {
      if (b.status !== 'realizado') continue;
      const dia = jt.diaBRT(b.data_batismo);
      if (!dia) continue;
      menor(idxBatismo.M, b.membro_id, dia);
      menor(idxBatismo.C, chaveCpf(b.cpf), dia);
      menor(idxBatismo.N, chaveNome(b.nome), dia);
    }

    // Next · PRESENÇA em ≥1 encontro (data = do encontro, o evento real)
    const idxNext = novoIdx();
    const nextSemData = { M: new Set(), C: new Set(), N: new Set() };
    const matPorId = new Map(nextMats.map((m) => [m.id, m]));
    const encontros = await fetchAll('next_encontros', 'id, data', (q) => q);
    const encPorId = new Map(encontros.map((e) => [e.id, e.data]));
    // ⚠️ next_presencas NÃO tem deleted_at — o filtro de apagado vale na matrícula
    const presencas = await fetchAll('next_presencas', 'matricula_id, encontro_id', (q) => q.eq('presente', true));
    for (const p of presencas) {
      const m = matPorId.get(p.matricula_id);
      if (!m) continue; // matrícula soft-deletada
      const dia = jt.diaBRT(encPorId.get(p.encontro_id));
      if (dia) {
        menor(idxNext.M, m.membro_id, dia);
        menor(idxNext.C, chaveCpf(m.cpf), dia);
        menor(idxNext.N, chaveNome(m.nome), dia);
      } else {
        // ⚠️ `next_encontros.data` é NULLABLE. A pessoa esteve no encontro; o
        // que falta é a data. Descartar diria "não fez o Next".
        if (m.membro_id) nextSemData.M.add(m.membro_id);
        if (chaveCpf(m.cpf)) nextSemData.C.add(chaveCpf(m.cpf));
        if (chaveNome(m.nome)) nextSemData.N.add(chaveNome(m.nome));
      }
    }
    // camada legada: check-in por encontro (apesar do nome, é presença)
    const nextLegado = await fetchAll('next_inscricoes', 'membro_id, cpf, nome, check_in_at', (q) => q.not('check_in_at', 'is', null));
    for (const l of nextLegado) {
      const dia = jt.diaBRT(l.check_in_at);
      if (!dia) continue;
      menor(idxNext.M, l.membro_id, dia);
      menor(idxNext.C, chaveCpf(l.cpf), dia);
      menor(idxNext.N, chaveNome(l.nome), dia);
    }
    const temNextSemData = (c) => {
      const cpf = chaveCpf(c.cpf);
      if (c.membro_id || cpf) return (c.membro_id && nextSemData.M.has(c.membro_id)) || (cpf && nextSemData.C.has(cpf));
      const nn = chaveNome(c.nome);
      return !!nn && nextSemData.N.has(nn);
    };

    // Grupo · ⚠️ lê TODOS os vínculos ativos (não só os da coorte) porque a
    // detecção de data de importação precisa da distribuição inteira.
    const vinculos = await fetchAll('mem_grupo_membros', 'membro_id, entrou_em',
      (q) => q.is('deleted_at', null).is('saiu_em', null));
    const datasImport = jt.datasDeImport(vinculos.map((v) => v.entrou_em));
    const idxGrupo = novoIdx();
    for (const v of vinculos) menor(idxGrupo.M, v.membro_id, jt.diaBRT(v.entrou_em));

    // Voluntariado · início do vínculo em aberto
    const voluntarios = membroIds.length
      ? await emLotes('mem_voluntarios', 'membro_id, desde', membroIds, (q) => q.is('deleted_at', null).is('ate', null))
      : [];
    const idxServir = novoIdx();
    for (const v of voluntarios) menor(idxServir.M, v.membro_id, jt.diaBRT(v.desde));

    // Generosidade · SENSÍVEL (mesma régua de quem vê contribuição na ficha)
    const idxGenerosidade = novoIdx();
    if (podeGenerosidade && membroIds.length) {
      const contribs = await emLotes('mem_contribuicoes', 'membro_id, data', membroIds,
        (q) => q.is('deleted_at', null).in('tipo', ['dizimo', 'oferta']));
      for (const ct of contribs) menor(idxGenerosidade.M, ct.membro_id, jt.diaBRT(ct.data));
    }
  /**
   * Os marcos COM DATA de um convertido. Chave ausente = sem registro.
   * `contatoFeito` vem de fora: quem decide se o 1º contato aconteceu é o
   * status do dropdown, que é régua do módulo de cuidados, não daqui.
   */
  function marcosDe(c, { contatoFeito = false } = {}) {
    const dataGrupo = dataDoMarco(c, idxGrupo);
    const dataNext = dataDoMarco(c, idxNext);
    const marcos = {};
    const por = (chave, marco) => { if (marco) marcos[chave] = marco; };
    por('contato', jt.montarMarco(c.primeiro_contato_em, c.data_culto, { alcancado: contatoFeito }));
    por('next', jt.montarMarco(dataNext, c.data_culto, { alcancado: !!dataNext || temNextSemData(c) }));
    por('batismo', jt.montarMarco(dataDoMarco(c, idxBatismo), c.data_culto));
    por('grupo', jt.montarMarco(dataGrupo, c.data_culto, { suspeita: !!dataGrupo && datasImport.has(dataGrupo) }));
    por('servir', jt.montarMarco(dataDoMarco(c, idxServir), c.data_culto));
    if (podeGenerosidade) por('generosidade', jt.montarMarco(dataDoMarco(c, idxGenerosidade), c.data_culto));
    return marcos;
  }

  return { batOf, nextOf, marcosDe, datasImport };
}

module.exports = { carregarSinaisConvertidos };
