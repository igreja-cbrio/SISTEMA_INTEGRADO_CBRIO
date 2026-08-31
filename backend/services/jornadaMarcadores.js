// ============================================================================
// services/jornadaMarcadores · leitor dos marcadores de jornada
// ============================================================================
// Lê o banco e devolve, POR PESSOA, quais marcadores da jornada ela tem. A
// DOBRA (sinal cru → marcador) e o gate de sensibilidade vivem na régua pura
// `utils/jornadaMarcadores.js` (que entra no gate de deploy); aqui só mora o
// acesso ao banco.
//
// ⚠️ FONTE DE CADA SINAL — cada um aponta pra fonte CANÔNICA do seu módulo, não
// pra uma régua nova:
//
//   batismo    `batismo_inscricoes` status='realizado'  (+ `mem_membros.batizado_outra_igreja`)
//   next       `vw_next_formado_pessoa`                 ← fonte ÚNICA de "fez Next"
//   grupo      `mem_grupo_membros` saiu_em IS NULL
//   servir     `mem_voluntarios` ate IS NULL
//   devocional `mem_devocionais` concluida=true, 90d
//   generosidade `mem_contribuicoes` dizimo/oferta, 90d  ← SENSÍVEL
//
// ⚠️ `next` lê `vw_next_formado_pessoa` (a view que NSM, /painel, kpiAutoCollector
// e Cuidados usam) e NÃO `next_matriculas.status='formado'`. As duas discordam de
// propósito: as 2 aulas do Next não são sequenciais e a pessoa pode fazer a aula 1
// numa turma e a 2 em OUTRA — o status por turma diz "não formou" pra quem formou.
// ⚠️ Sabendo disso: `services/jornadaEngajamento.js` (motor da tela Jornada) ainda
// lê `next_matriculas` + `next_inscricoes.check_in_at`, ou seja ele já diverge da
// NSM hoje. NÃO alinhei aqui porque mexer naquele motor MOVE os números do
// /painel — é decisão do Marcos, não efeito colateral desta feature.
//
// ⚠️ Erro de sinal NÃO vira "a pessoa não fez". Cada sinal é best-effort e o que
// falhou volta em `indisponiveis` pra a tela DECLARAR que está incompleta —
// ausência silenciosa aqui seria lida como fato sobre a pessoa.
// ============================================================================

const { supabase } = require('../utils/supabase');
const {
  montarMarcadores, marcadoresVazios, podeVerMarcadorSensivel,
} = require('../utils/jornadaMarcadores');

const JANELA_ATIVIDADE_DIAS = 90; // devocional e generosidade são ATIVIDADE, não estado
const LOTE = 200;    // `.in()` maior que isto estoura a URL do PostgREST
const PAGINA = 1000; // cap server-side do PostgREST

// Acima disto, varrer a tabela inteira sai mais barato que N lotes de `.in()`
// (a lista da Membresia manda a base toda: ~4 mil ids = 20 lotes × 6 sinais).
const LIMITE_MODO_LOTE = 600;

function diasAtras(n) {
  return new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
}

/**
 * Set de `membro_id` presentes numa tabela, respeitando o cap de 1000 do
 * PostgREST (pagina até esgotar) e o teto de tamanho da URL (lotes de 200).
 *
 * @param {string} tabela
 * @param {(q:any)=>any} filtro  aplica os `.eq/.is/.gte` do sinal
 * @param {string[]|null} ids    null = varre a tabela inteira (modo base grande)
 */
async function idsPresentes(tabela, filtro, ids) {
  const alvo = new Set();

  const varrer = async (lote) => {
    for (let from = 0; ; from += PAGINA) {
      // Builder do supabase-js é de uso único — recria a cada página.
      let q = supabase.from(tabela).select('membro_id');
      if (lote) q = q.in('membro_id', lote);
      const { data, error } = await filtro(q).range(from, from + PAGINA - 1);
      if (error) throw error;
      for (const r of data || []) if (r.membro_id) alvo.add(r.membro_id);
      if (!data || data.length < PAGINA) break;
    }
  };

  if (!ids) {
    await varrer(null);
    return alvo;
  }
  const lotes = [];
  for (let i = 0; i < ids.length; i += LOTE) lotes.push(ids.slice(i, i + LOTE));
  await Promise.all(lotes.map(varrer));
  return alvo;
}

/**
 * Declaração de batismo guardada em `mem_membros` — SELECT ISOLADO, ver abaixo.
 *
 * ⚠️ São DUAS declarações e elas NÃO são a mesma coisa:
 *  · `batizado_outra_igreja` (bool) — batizou-se em outra igreja;
 *  · `batismo_cbrio_declarado_em` (timestamptz, 27/08) — batizou-se AQUI, antes
 *    de o sistema existir (o caso da Mariana: batismo real, sem registro).
 * As duas valem como "já é batizada" pro marcador, e **nenhuma das duas conta
 * como batismo REALIZADO nos KPIs** — quem conta é `batismo_inscricoes`.
 */
async function idsDeclaracaoBatismo(ids, coluna, filtro) {
  // ⚠️ A coluna nasceu no repo do APP (`supabase/batismo_anterior.sql`), não nas
  // migrations deste repo — pedir uma coluna inexistente faz o PostgREST recusar
  // a QUERY INTEIRA (42703). Isolado + best-effort: sem a coluna, o marcador
  // "batizado" continua valendo pelo registro da CBRio.
  const alvo = new Set();
  const varrer = async (lote) => {
    for (let from = 0; ; from += PAGINA) {
      let q = filtro(supabase.from('mem_membros').select('id').is('deleted_at', null));
      if (lote) q = q.in('id', lote);
      const { data, error } = await q.range(from, from + PAGINA - 1);
      if (error) throw error;
      for (const r of data || []) if (r.id) alvo.add(r.id);
      if (!data || data.length < PAGINA) break;
    }
  };
  if (!ids) { await varrer(null); return alvo; }
  const lotes = [];
  for (let i = 0; i < ids.length; i += LOTE) lotes.push(ids.slice(i, i + LOTE));
  await Promise.all(lotes.map(varrer));
  return alvo;
}

/**
 * Marcadores de um conjunto de pessoas.
 *
 * @param {string[]} membroIds
 * @param {object} [opts]
 * @param {boolean} [opts.incluirSensiveis=false]
 * @returns {Promise<{ porMembro: Map<string,object>, indisponiveis: string[] }>}
 */
async function marcadoresDeMembros(membroIds, opts = {}) {
  const incluirSensiveis = opts.incluirSensiveis === true;
  const ids = [...new Set((membroIds || []).filter(Boolean))];
  const porMembro = new Map();
  if (!ids.length) return { porMembro, indisponiveis: [] };

  // `null` = varre a tabela inteira; a filtragem por pessoa acontece no map final.
  const alvo = ids.length > LIMITE_MODO_LOTE ? null : ids;
  const desde = diasAtras(JANELA_ATIVIDADE_DIAS);

  const sinais = [
    ['batismo_cbrio', () => idsPresentes('batismo_inscricoes',
      (q) => q.is('deleted_at', null).eq('status', 'realizado'), alvo)],
    ['batismo_outra', () => idsDeclaracaoBatismo(alvo, 'batizado_outra_igreja',
      (q) => q.eq('batizado_outra_igreja', true))],
    // ⚠️ Sem isto, quem declarou que se batizou na CBRio continuaria aparecendo
    // como NÃO batizada na lista do líder — e seria cobrada a se inscrever num
    // batismo que já aconteceu.
    ['batismo_cbrio_declarado', () => idsDeclaracaoBatismo(alvo, 'batismo_cbrio_declarado_em',
      (q) => q.not('batismo_cbrio_declarado_em', 'is', null))],
    // A view já é "1 linha por pessoa formada" — sem filtro adicional.
    ['next', () => idsPresentes('vw_next_formado_pessoa', (q) => q, alvo)],
    ['grupo', () => idsPresentes('mem_grupo_membros',
      (q) => q.is('deleted_at', null).is('saiu_em', null), alvo)],
    ['servir', () => idsPresentes('mem_voluntarios',
      (q) => q.is('deleted_at', null).is('ate', null), alvo)],
    ['devocional', () => idsPresentes('mem_devocionais',
      (q) => q.is('deleted_at', null).eq('concluida', true).gte('data_devocional', desde), alvo)],
  ];
  // Não busca o que não pode mostrar: sem permissão, o dado financeiro nem sai
  // do banco (e economiza a consulta mais cara do conjunto).
  if (incluirSensiveis) {
    sinais.push(['generosidade', () => idsPresentes('mem_contribuicoes',
      (q) => q.is('deleted_at', null).in('tipo', ['dizimo', 'oferta']).gte('data', desde), alvo)]);
  }

  const indisponiveis = [];
  const sets = {};
  await Promise.all(sinais.map(async ([chave, ler]) => {
    try {
      sets[chave] = await ler();
    } catch (e) {
      // Best-effort: um sinal fora do ar não pode derrubar a lista de pessoas —
      // mas TEM que ser declarado, senão a ausência vira afirmação sobre alguém.
      console.error(`[jornadaMarcadores] sinal "${chave}" indisponível:`, e.message);
      sets[chave] = new Set();
      indisponiveis.push(chave);
    }
  }));

  for (const id of ids) {
    porMembro.set(id, montarMarcadores({
      batismo_cbrio: sets.batismo_cbrio?.has(id),
      batismo_outra: sets.batismo_outra?.has(id),
      batismo_cbrio_declarado: sets.batismo_cbrio_declarado?.has(id),
      next: sets.next?.has(id),
      grupo: sets.grupo?.has(id),
      servir: sets.servir?.has(id),
      devocional: sets.devocional?.has(id),
      generosidade: sets.generosidade?.has(id),
    }, { incluirSensiveis }));
  }

  // Sinal do BATISMO tem TRÊS fontes (registro · outra igreja · declarado
  // aqui): só é "indisponível" se TODAS caíram. Declarar incompleto porque uma
  // consulta best-effort falhou faria a tela dizer "não sei" com o dado na mão.
  const fontesBatismo = ['batismo_cbrio', 'batismo_outra', 'batismo_cbrio_declarado'];
  if (!fontesBatismo.every((f) => indisponiveis.includes(f))) {
    for (const f of fontesBatismo) {
      const i = indisponiveis.indexOf(f);
      if (i >= 0) indisponiveis.splice(i, 1);
    }
  }

  return { porMembro, indisponiveis: [...new Set(indisponiveis)] };
}

/**
 * Anexa `marcadores` a uma lista de objetos. Best-effort: falha total devolve a
 * lista intacta (sem a chave) + `indisponiveis` com tudo — a tela existe pra
 * mostrar pessoas, não marcadores.
 *
 * @param {object[]} linhas
 * @param {(linha:object)=>string|null} pegarId
 */
async function anexarMarcadores(linhas, pegarId, opts = {}) {
  const lista = linhas || [];
  if (!lista.length) return { linhas: lista, indisponiveis: [] };
  // ⚠️ `indisponiveis` vai DENTRO do payload de cada pessoa, não só no topo:
  // vários endpoints daqui respondem um ARRAY cru (ex.: `GET /membresia/membros`)
  // e não têm onde carregar um campo de nível superior. Sem isso, sinal que
  // falhou viraria ausência silenciosa de flag — que se lê como fato sobre a
  // pessoa.
  const carimbar = (alvo, indisponiveis) => {
    if (indisponiveis.length) alvo.indisponiveis = indisponiveis;
    return alvo;
  };
  try {
    const { porMembro, indisponiveis } = await marcadoresDeMembros(lista.map(pegarId), opts);
    for (const l of lista) {
      const id = pegarId(l);
      const m = (id && porMembro.get(id)) || marcadoresVazios(opts);
      l.marcadores = carimbar({ ...m }, indisponiveis);
    }
    return { linhas: lista, indisponiveis };
  } catch (e) {
    console.error('[jornadaMarcadores] anexar:', e.message);
    for (const l of lista) l.marcadores = carimbar(marcadoresVazios(opts), ['todos']);
    return { linhas: lista, indisponiveis: ['todos'] };
  }
}

module.exports = {
  marcadoresDeMembros,
  anexarMarcadores,
  podeVerMarcadorSensivel,
  JANELA_ATIVIDADE_DIAS,
};
