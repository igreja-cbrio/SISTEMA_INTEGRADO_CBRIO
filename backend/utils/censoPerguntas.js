// Régua PURA do questionário do censo — sem rede, sem relógio, sem Supabase.
// Fica em utils/ (não services/) exatamente para poder ser testada sozinha,
// no mesmo espírito de utils/censoConvite.js.
//
// O schema de `cen_pesquisa.perguntas` é o MESMO de `nps_pesquisas.perguntas`,
// de propósito: assim o renderer que já existe (src/components/nps/NpsForm.jsx)
// desenha o formulário do censo sem precisar de um segundo renderer.
//
//   [{ id, tipo, texto, descricao?, opcoes?, obrigatoria?, max? }]

// Tipos que o NpsForm já sabe desenhar. Não inventar tipo aqui sem ensinar o
// renderer primeiro — pergunta que o front não desenha é pergunta que ninguém
// responde, e o dashboard fica com uma coluna eternamente vazia.
const TIPOS = Object.freeze([
  'secao',        // cabeçalho, não tem resposta
  'texto_curto',
  'texto_longo',
  'escala_5',
  'nps',          // 0-10 (ou 0-max)
  'sim_nao',
  'opcao_unica',
  'multipla',
]);

// Tipos que exigem lista de opções.
const TIPOS_COM_OPCOES = Object.freeze(['opcao_unica', 'multipla']);

// Tipos que não produzem resposta.
const TIPOS_SEM_RESPOSTA = Object.freeze(['secao']);

function ehTexto(v) {
  return typeof v === 'string' && v.trim().length > 0;
}

/**
 * Slug de URL a partir do título. Sem acento, sem espaço, minúsculo.
 * É o que vai no QR impresso, então precisa ser curto e legível.
 */
function slugificar(texto) {
  return String(texto || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

/**
 * Valida o array de perguntas. Devolve { ok, erros[], perguntas } com as
 * perguntas normalizadas (ids preenchidos, opções limpas).
 *
 * Regra que importa: **id de pergunta é imutável**. Se o id mudar numa edição,
 * as respostas já coletadas viram órfãs e o gráfico daquela pergunta zera —
 * foi o bug que o editor do NPS já pagou uma vez. Por isso `id` recebido é
 * sempre preservado; só quem chega sem id ganha um novo.
 */
function validarPerguntas(lista) {
  const erros = [];
  if (!Array.isArray(lista)) return { ok: false, erros: ['perguntas deve ser uma lista'], perguntas: [] };

  const vistos = new Set();
  const perguntas = lista.map((p, i) => {
    const pos = i + 1;
    const tipo = String(p?.tipo || '').trim();
    if (!TIPOS.includes(tipo)) erros.push(`Pergunta ${pos}: tipo "${tipo}" não existe`);
    if (!ehTexto(p?.texto)) erros.push(`Pergunta ${pos}: texto vazio`);

    // Preserva o id de quem já tem; gera para quem não tem.
    let id = ehTexto(p?.id) ? String(p.id).trim() : `p${pos}_${slugificar(p?.texto).slice(0, 24) || 'pergunta'}`;
    if (vistos.has(id)) {
      erros.push(`Pergunta ${pos}: id duplicado "${id}"`);
      id = `${id}_${pos}`;
    }
    vistos.add(id);

    const opcoes = Array.isArray(p?.opcoes)
      ? p.opcoes.map((o) => String(o ?? '').trim()).filter(Boolean)
      : [];
    if (TIPOS_COM_OPCOES.includes(tipo) && opcoes.length < 2) {
      erros.push(`Pergunta ${pos}: "${tipo}" precisa de pelo menos 2 opções`);
    }

    const out = { id, tipo, texto: String(p.texto || '').trim() };
    if (ehTexto(p?.descricao)) out.descricao = String(p.descricao).trim();
    if (opcoes.length) out.opcoes = opcoes;
    if (tipo === 'nps') {
      const max = Number(p?.max);
      out.max = Number.isFinite(max) && max > 0 ? Math.min(Math.trunc(max), 10) : 10;
    }
    if (!TIPOS_SEM_RESPOSTA.includes(tipo)) out.obrigatoria = p?.obrigatoria === true;
    return out;
  });

  const respondiveis = perguntas.filter((p) => !TIPOS_SEM_RESPOSTA.includes(p.tipo));
  if (respondiveis.length === 0) erros.push('A pesquisa precisa de pelo menos uma pergunta respondível');

  return { ok: erros.length === 0, erros, perguntas };
}

/**
 * Transforma a submissão bruta ({ perguntaId: valor }) nas linhas de
 * `cen_resposta_item`. Uma linha por pergunta respondida.
 *
 * Por que linha e não só jsonb: o dashboard agrega em SQL puro, e pergunta
 * nova no questionário já vira gráfico sem código novo (vw_cen_item_agregado).
 * O jsonb bruto continua guardado em cen_resposta.payload para reprocessar.
 *
 * Devolve { itens[], faltando[] } — `faltando` = obrigatórias sem resposta.
 */
function montarItens({ perguntas, respostas }) {
  const itens = [];
  const faltando = [];
  const mapa = respostas && typeof respostas === 'object' ? respostas : {};

  for (const p of Array.isArray(perguntas) ? perguntas : []) {
    if (TIPOS_SEM_RESPOSTA.includes(p.tipo)) continue;
    const bruto = mapa[p.id];

    const vazio = bruto === undefined || bruto === null || bruto === ''
      || (Array.isArray(bruto) && bruto.length === 0);
    if (vazio) {
      if (p.obrigatoria) faltando.push({ id: p.id, texto: p.texto });
      continue;
    }

    const item = {
      pergunta_id: p.id,
      pergunta_texto: p.texto,
      tipo: p.tipo,
      valor_texto: null,
      valor_num: null,
      valor_opcoes: null,
    };

    if (p.tipo === 'multipla') {
      const opts = (Array.isArray(bruto) ? bruto : [bruto])
        .map((o) => String(o ?? '').trim()).filter(Boolean);
      if (!opts.length) { if (p.obrigatoria) faltando.push({ id: p.id, texto: p.texto }); continue; }
      item.valor_opcoes = opts;
      // Espelho legível para exportação em planilha (uma coluna por pergunta).
      item.valor_texto = opts.join(' | ');
    } else if (p.tipo === 'nps' || p.tipo === 'escala_5') {
      const n = Number(bruto);
      if (!Number.isFinite(n)) { if (p.obrigatoria) faltando.push({ id: p.id, texto: p.texto }); continue; }
      item.valor_num = n;
      item.valor_texto = String(n);
    } else {
      item.valor_texto = String(bruto).trim();
      if (!item.valor_texto) { if (p.obrigatoria) faltando.push({ id: p.id, texto: p.texto }); continue; }
    }

    itens.push(item);
  }

  return { itens, faltando };
}

module.exports = {
  TIPOS,
  TIPOS_COM_OPCOES,
  TIPOS_SEM_RESPOSTA,
  slugificar,
  validarPerguntas,
  montarItens,
};
