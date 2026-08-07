// Régua PURA do questionário do censo — sem rede, sem relógio, sem Supabase.
// Fica em utils/ (não services/) exatamente para poder ser testada sozinha,
// no mesmo espírito de utils/censoConvite.js.
//
// Schema de `cen_pesquisa.perguntas` (array plano, ordem = ordem de exibição):
//
//   { id, tipo, texto, descricao?, obrigatoria?,
//     opcoes?, opcoes_neutras?,          // fechadas
//     rotulos?: {min,max}, max?,         // escalas
//     formato?,                          // texto_curto: telefone|email|instagram
//     min_num?, max_num?,                // numero
//     mostrar_se?: {pergunta, valores[]},// condicional
//     sensivel?,                         // trava leitura NOMINAL
//     acao?: 'cuidado', cuidado_tipo?,   // vira fila de follow-up, não gráfico
//     preenche_de? }                     // pré-preenchimento (ex.: 'telefone')
//
// ⚠️ Este arquivo NÃO reusa src/components/nps/NpsForm.jsx: aquele renderer
//    espera { pergunta_nps, perguntas_extras } e exige uma pergunta NPS. O
//    censo é um array plano de 78 perguntas. O NPS está em produção e fica
//    intocado; o censo tem renderer próprio (src/components/censo/).

// ── Vocabulário ────────────────────────────────────────────────────────────

const TIPOS = Object.freeze([
  'secao',        // cabeçalho de bloco, não tem resposta
  'texto_curto',
  'texto_longo',
  'data',
  'numero',
  'escala_5',     // Likert 1–5 (usa `rotulos`)
  'estrelas_5',   // CSAT 1–5 (mesmo dado, outro visual)
  'nps',          // 0–max (default 10)
  'sim_nao',
  'opcao_unica',
  'multipla',
]);

const TIPOS_COM_OPCOES = Object.freeze(['opcao_unica', 'multipla']);
const TIPOS_SEM_RESPOSTA = Object.freeze(['secao']);
// Tipos cuja resposta é NÚMERO (vai em valor_num e é o que o SQL agrega).
const TIPOS_NUMERICOS = Object.freeze(['numero', 'escala_5', 'estrelas_5', 'nps']);

const FORMATOS = Object.freeze(['texto', 'telefone', 'email', 'instagram']);

// Tipos de pedido de ajuda. Não viram estatística: viram linha em cen_cuidado.
// A especificação é explícita — "só têm valor se houver retorno para quem pediu".
const CUIDADO_TIPOS = Object.freeze(['familiar', 'aconselhamento', 'oracao', 'conversa']);

// Faixa fixa das escalas de 1 a 5. Sem isso um cliente adulterado mandando 99
// estrelas puxaria a média do bloco 10 para cima e ninguém notaria.
const ESCALA_MIN = 1;
const ESCALA_MAX = 5;

// Saída para escala que não se aplica à pessoa. Existe porque as perguntas de
// voluntariado ficam VISÍVEIS para todos (decisão do Matheus, 06/08: quem serve
// informalmente ou parou responderia "não sirvo" e a liderança perderia o
// sinal). Sem esta saída, quem nunca serviu seria obrigado a dar nota em "me
// sinto valorizado como voluntário" — e essa nota entraria na média como se
// fosse opinião de voluntário. Contada como NEUTRA: fica fora da base.
const NAO_SE_APLICA = 'Não se aplica';

function ehTexto(v) {
  return typeof v === 'string' && v.trim().length > 0;
}

function lista(v) {
  return Array.isArray(v) ? v : [];
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

// ── Validação do questionário ──────────────────────────────────────────────

/**
 * Valida o array de perguntas. Devolve { ok, erros[], perguntas } com as
 * perguntas normalizadas.
 *
 * Regra que importa: **id de pergunta é imutável**. Se o id mudar numa edição,
 * as respostas já coletadas viram órfãs e o gráfico daquela pergunta zera —
 * bug que o editor do NPS já pagou uma vez. `id` recebido é sempre preservado;
 * só quem chega sem id ganha um novo.
 */
function validarPerguntas(entrada) {
  const erros = [];
  if (!Array.isArray(entrada)) {
    return { ok: false, erros: ['perguntas deve ser uma lista'], perguntas: [] };
  }

  const vistos = new Set();
  const perguntas = entrada.map((p, i) => {
    const pos = i + 1;
    const tipo = String(p?.tipo || '').trim();
    if (!TIPOS.includes(tipo)) erros.push(`Pergunta ${pos}: tipo "${tipo}" não existe`);
    if (!ehTexto(p?.texto)) erros.push(`Pergunta ${pos}: texto vazio`);

    let id = ehTexto(p?.id) ? String(p.id).trim() : `p${pos}_${slugificar(p?.texto).slice(0, 24) || 'pergunta'}`;
    if (vistos.has(id)) {
      erros.push(`Pergunta ${pos}: id duplicado "${id}"`);
      id = `${id}_${pos}`;
    }
    vistos.add(id);

    const out = { id, tipo, texto: String(p?.texto || '').trim() };
    if (ehTexto(p?.descricao)) out.descricao = String(p.descricao).trim();

    // ── opções ──
    const opcoes = lista(p?.opcoes).map((o) => String(o ?? '').trim()).filter(Boolean);
    if (TIPOS_COM_OPCOES.includes(tipo)) {
      if (opcoes.length < 2) erros.push(`Pergunta ${pos}: "${tipo}" precisa de pelo menos 2 opções`);
      if (new Set(opcoes).size !== opcoes.length) erros.push(`Pergunta ${pos}: opções repetidas`);
    }
    if (opcoes.length) out.opcoes = opcoes;

    // Opção neutra ("Prefiro não dizer"): um campo, dois efeitos — é exclusiva
    // numa múltipla (marcar "Traumas + Prefiro não dizer" é contraditório) e
    // fica FORA da base de médias/percentuais, senão contamina a leitura do
    // bloco sensível inteiro.
    const neutras = lista(p?.opcoes_neutras).map((o) => String(o ?? '').trim()).filter(Boolean);
    if (neutras.length) {
      const fora = neutras.filter((n) => !opcoes.includes(n));
      if (fora.length) erros.push(`Pergunta ${pos}: opcoes_neutras fora da lista de opções: ${fora.join(', ')}`);
      out.opcoes_neutras = neutras.filter((n) => opcoes.includes(n));
    }

    // ── escalas ──
    if (tipo === 'nps') {
      const max = Number(p?.max);
      out.max = Number.isFinite(max) && max > 0 ? Math.min(Math.trunc(max), 10) : 10;
    }
    if (tipo === 'escala_5' || tipo === 'estrelas_5') {
      const min = ehTexto(p?.rotulos?.min) ? String(p.rotulos.min).trim() : '';
      const rmax = ehTexto(p?.rotulos?.max) ? String(p.rotulos.max).trim() : '';
      if (min || rmax) out.rotulos = { min, max: rmax };
      if (p?.permite_nao_se_aplica === true) out.permite_nao_se_aplica = true;
    } else if (p?.permite_nao_se_aplica === true) {
      // Em pergunta de opção, "Não se aplica" é só mais uma opção (+ neutra).
      erros.push(`Pergunta ${pos}: permite_nao_se_aplica só vale em escala — em pergunta de opção, inclua "${NAO_SE_APLICA}" nas opções e em opcoes_neutras`);
    }

    // ── texto com formato ──
    if (p?.formato !== undefined) {
      const f = String(p.formato).trim();
      if (!FORMATOS.includes(f)) erros.push(`Pergunta ${pos}: formato "${f}" não existe`);
      else if (f !== 'texto') {
        if (tipo !== 'texto_curto') erros.push(`Pergunta ${pos}: formato "${f}" só vale em texto_curto`);
        else out.formato = f;
      }
    }

    // ── número ──
    if (tipo === 'numero') {
      const mn = Number(p?.min_num); const mx = Number(p?.max_num);
      out.min_num = Number.isFinite(mn) ? mn : 0;
      out.max_num = Number.isFinite(mx) ? mx : 99;
      if (out.min_num > out.max_num) erros.push(`Pergunta ${pos}: min_num maior que max_num`);
    }

    // ── condicional ──
    // Só pode depender de pergunta ANTERIOR. Depender de uma posterior é um
    // campo que nunca aparece (ou aparece com base em resposta inexistente).
    if (p?.mostrar_se !== undefined && p.mostrar_se !== null) {
      const dep = ehTexto(p.mostrar_se?.pergunta) ? String(p.mostrar_se.pergunta).trim() : '';
      const valores = lista(p.mostrar_se?.valores).map((v) => String(v ?? '').trim()).filter(Boolean);
      if (!dep) erros.push(`Pergunta ${pos}: mostrar_se sem pergunta de referência`);
      else if (!vistos.has(dep) || dep === id) {
        erros.push(`Pergunta ${pos}: mostrar_se aponta para "${dep}", que não é uma pergunta anterior`);
      } else if (!valores.length) {
        erros.push(`Pergunta ${pos}: mostrar_se sem valores que a ativem`);
      } else {
        out.mostrar_se = { pergunta: dep, valores };
      }
    }

    // ── gatilho de cuidado ──
    if (p?.acao !== undefined && p.acao !== null && String(p.acao).trim() !== '') {
      const acao = String(p.acao).trim();
      if (acao !== 'cuidado') erros.push(`Pergunta ${pos}: acao "${acao}" não existe`);
      else {
        const ct = String(p?.cuidado_tipo || '').trim();
        if (!CUIDADO_TIPOS.includes(ct)) {
          erros.push(`Pergunta ${pos}: cuidado_tipo precisa ser um de ${CUIDADO_TIPOS.join('/')}`);
        } else if (tipo !== 'sim_nao') {
          erros.push(`Pergunta ${pos}: gatilho de cuidado precisa ser Sim/Não`);
        } else {
          out.acao = 'cuidado';
          out.cuidado_tipo = ct;
        }
      }
    }

    if (p?.sensivel === true) out.sensivel = true;
    if (ehTexto(p?.preenche_de)) out.preenche_de = String(p.preenche_de).trim();
    if (!TIPOS_SEM_RESPOSTA.includes(tipo)) out.obrigatoria = p?.obrigatoria === true;

    return out;
  });

  const respondiveis = perguntas.filter((p) => !TIPOS_SEM_RESPOSTA.includes(p.tipo));
  if (respondiveis.length === 0) erros.push('A pesquisa precisa de pelo menos uma pergunta respondível');

  return { ok: erros.length === 0, erros, perguntas };
}

// ── Visibilidade condicional ───────────────────────────────────────────────

/**
 * A pergunta aparece, dadas as respostas até agora?
 * Sem `mostrar_se` → sempre. Com, compara como TEXTO (é como o valor chega do
 * formulário) e aceita múltipla: basta uma opção marcada estar entre os valores
 * que ativam.
 */
function visivel(pergunta, respostas = {}) {
  const cond = pergunta?.mostrar_se;
  if (!cond?.pergunta) return true;
  const bruto = respostas?.[cond.pergunta];
  if (bruto === undefined || bruto === null) return false;
  const dadas = (Array.isArray(bruto) ? bruto : [bruto]).map((v) => String(v).trim());
  return cond.valores.some((v) => dadas.includes(String(v).trim()));
}

/** É uma opção neutra ("Prefiro não dizer") desta pergunta? */
function ehNeutra(pergunta, valor) {
  const v = String(valor ?? '').trim();
  if (pergunta?.permite_nao_se_aplica === true && v === NAO_SE_APLICA) return true;
  return lista(pergunta?.opcoes_neutras).includes(v);
}

/**
 * Aplica a exclusividade da neutra numa múltipla: se a pessoa marcou
 * "Prefiro não dizer", é só isso que vale. Roda no SERVIDOR também — o cliente
 * pode estar adulterado, e aqui é dado sensível.
 */
function resolverMultipla(pergunta, valores) {
  const opts = lista(valores).map((v) => String(v ?? '').trim()).filter(Boolean);
  const validas = pergunta?.opcoes ? opts.filter((o) => pergunta.opcoes.includes(o)) : opts;
  const neutra = validas.find((o) => ehNeutra(pergunta, o));
  return neutra ? [neutra] : validas;
}

// ── Submissão → linhas de cen_resposta_item ────────────────────────────────

/**
 * Transforma a submissão bruta ({ perguntaId: valor }) nas linhas de
 * `cen_resposta_item`, mais os pedidos de cuidado.
 *
 * Por que linha e não só jsonb: o dashboard agrega em SQL puro, e pergunta nova
 * no questionário já vira gráfico sem código novo (vw_cen_item_agregado). O
 * jsonb bruto continua em cen_resposta.payload para reprocessar.
 *
 * Devolve { itens, faltando, cuidados, ignoradas }:
 *   · faltando  = obrigatórias VISÍVEIS sem resposta (o que barra o envio)
 *   · cuidados  = [{ tipo }] dos gatilhos respondidos "Sim"
 *   · ignoradas = respostas de perguntas invisíveis ou fora do vocabulário,
 *                 descartadas. Uma resposta invisível chega quando a pessoa
 *                 responde e depois volta e muda a condicional — guardá-la
 *                 contaria no gráfico alguém que, no fim, não respondeu aquilo.
 */
function montarItens({ perguntas, respostas }) {
  const itens = [];
  const faltando = [];
  const cuidados = [];
  const ignoradas = [];
  const mapa = respostas && typeof respostas === 'object' ? respostas : {};
  const listaPerguntas = Array.isArray(perguntas) ? perguntas : [];

  for (const p of listaPerguntas) {
    if (TIPOS_SEM_RESPOSTA.includes(p.tipo)) continue;

    // Invisível não é obrigatória e não guarda resposta. Sem isto, o formulário
    // travaria pedindo uma pergunta que a pessoa nunca viu.
    if (!visivel(p, mapa)) {
      if (mapa[p.id] !== undefined) ignoradas.push(p.id);
      continue;
    }

    const bruto = mapa[p.id];
    const vazio = bruto === undefined || bruto === null
      || (typeof bruto === 'string' && bruto.trim() === '')
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
      sensivel: p.sensivel === true,
    };
    const faltou = () => { if (p.obrigatoria) faltando.push({ id: p.id, texto: p.texto }); };

    if (p.tipo === 'multipla') {
      const opts = resolverMultipla(p, Array.isArray(bruto) ? bruto : [bruto]);
      if (!opts.length) { faltou(); continue; }
      item.valor_opcoes = opts;
      // Espelho legível: a exportação em planilha quer uma coluna por pergunta.
      item.valor_texto = opts.join(' | ');
    } else if (p.tipo === 'opcao_unica' || p.tipo === 'sim_nao') {
      const v = String(bruto).trim();
      const permitidas = p.opcoes || (p.tipo === 'sim_nao' ? ['Sim', 'Não'] : null);
      if (permitidas && !permitidas.includes(v)) { ignoradas.push(p.id); faltou(); continue; }
      item.valor_texto = v;
      if (p.acao === 'cuidado' && v === 'Sim') cuidados.push({ tipo: p.cuidado_tipo });
    } else if (TIPOS_NUMERICOS.includes(p.tipo)) {
      // Escala com saída: guarda o texto e deixa valor_num NULO. É isso que
      // mantém a nota de quem não é voluntário fora da média dos voluntários.
      if (p.permite_nao_se_aplica === true && String(bruto).trim() === NAO_SE_APLICA) {
        item.valor_texto = NAO_SE_APLICA;
        itens.push(item);
        continue;
      }
      const n = Number(bruto);
      if (!Number.isFinite(n)) { faltou(); continue; }
      const [min, max] = p.tipo === 'nps' ? [0, p.max ?? 10]
        : p.tipo === 'numero' ? [p.min_num ?? 0, p.max_num ?? 99]
        : [ESCALA_MIN, ESCALA_MAX];
      if (n < min || n > max) { ignoradas.push(p.id); faltou(); continue; }
      item.valor_num = n;
      item.valor_texto = String(n);
    } else if (p.tipo === 'data') {
      const v = String(bruto).trim();
      // ISO puro: é o que o DatePicker da casa produz e o que o Postgres aceita.
      if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || Number.isNaN(Date.parse(v))) {
        ignoradas.push(p.id); faltou(); continue;
      }
      item.valor_texto = v;
    } else {
      item.valor_texto = String(bruto).trim();
      if (!item.valor_texto) { faltou(); continue; }
    }

    itens.push(item);
  }

  return { itens, faltando, cuidados, ignoradas };
}

/**
 * Ordena os valores agregados de uma pergunta na ordem do QUESTIONÁRIO.
 * A view devolve contagem; quem conhece o schema é quem ordena. Sem isto,
 * "Nunca / Raramente / Algumas vezes / Diariamente" sai em ordem alfabética e
 * o gráfico de frequência fica ilegível.
 * Valor fora da lista de opções vai para o fim, preservando a ordem recebida.
 */
function ordenarPorOpcoes(pergunta, linhas) {
  const opcoes = lista(pergunta?.opcoes);
  const idx = new Map(opcoes.map((o, i) => [o, i]));
  return lista(linhas)
    .map((l, i) => ({ l, i }))
    .sort((a, b) => {
      const ia = idx.has(String(a.l?.valor)) ? idx.get(String(a.l.valor)) : Number.MAX_SAFE_INTEGER;
      const ib = idx.has(String(b.l?.valor)) ? idx.get(String(b.l.valor)) : Number.MAX_SAFE_INTEGER;
      return ia === ib ? a.i - b.i : ia - ib;
    })
    .map(({ l }) => l);
}

/**
 * Base de cálculo de percentual/média de uma pergunta fechada: total SEM as
 * neutras. "Prefiro não dizer" não é opinião; se entrar no denominador, todo
 * percentual do bloco sensível fica menor do que é, e a média de Likert com
 * neutra viraria número inventado.
 * Devolve { base, neutras, total } — a neutra continua visível como fatia
 * própria ("não respondeu"), só não conta na base.
 */
function baseSemNeutras(pergunta, linhas) {
  let base = 0; let neutras = 0;
  for (const l of lista(linhas)) {
    const n = Number(l?.total) || 0;
    if (ehNeutra(pergunta, l?.valor)) neutras += n; else base += n;
  }
  return { base, neutras, total: base + neutras };
}

module.exports = {
  TIPOS,
  TIPOS_COM_OPCOES,
  TIPOS_SEM_RESPOSTA,
  TIPOS_NUMERICOS,
  FORMATOS,
  CUIDADO_TIPOS,
  ESCALA_MIN,
  ESCALA_MAX,
  NAO_SE_APLICA,
  slugificar,
  validarPerguntas,
  visivel,
  ehNeutra,
  resolverMultipla,
  montarItens,
  ordenarPorOpcoes,
  baseSemNeutras,
};
