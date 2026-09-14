// ════════════════════════════════════════════════════════════════════════════
//  CENSO · Relatório analítico — o que vai para o modelo, e o que ele NÃO pode
//  inventar.
//
//  Pedido do Matheus (13/09/2026): "a IA vai analisar as respostas e me trazer
//  um relatório completo, como uma empresa profissional que aplica censo faria",
//  com sugestões de série de pregação e de eventos.
//
//  ⚠️⚠️ O RELATÓRIO NÃO SAI DAS RESPOSTAS ABERTAS. Medido em 13/09/2026: o Censo
//  CBRio 2026 tem 34 perguntas e ZERO do tipo `texto_longo`. A leitura de texto
//  livre (`censoLeituraIA`) não tem material. O que existe — e é farto — são as
//  fechadas: 794 respostas concluídas sobre idade, estado civil, filhos,
//  escolaridade, tempo de casa, canal, e engajamento (grupo, servir, Next,
//  batismo, contribuição).
//
//  ⚠️⚠️ O MODELO RECEBE SÓ CONTAGEM E PORCENTAGEM. Nunca linha de pessoa. Em
//  `texto_curto` moram CPF, Nome, Telefone, E-mail e CEP — 794 de cada, todos
//  com `sensivel = false`. Agregado não é só mais seguro: é a unidade certa da
//  análise.
//
//  ⚠️⚠️ OS CRUZAMENTOS SÃO CALCULADOS AQUI, NÃO PEDIDOS AO MODELO. Código conta;
//  o modelo interpreta. Modelo que faz aritmética sobre tabela erra em silêncio
//  e o erro sai com cara de achado.
//
//  ⚠️⚠️ E A LISTA DE CRUZAMENTOS É FECHADA, DECIDIDA ANTES DE OLHAR O RESULTADO.
//  Com 34 perguntas há centenas de cruzamentos; varrer todos e reportar os
//  "interessantes" garante encontrar coincidência bem formatada. Cada par aqui
//  tem um PORQUÊ declarado — é o que separa achado de garimpo.
// ════════════════════════════════════════════════════════════════════════════

/** Respostas abaixo disso não viram corte: é anedota com cara de estatística. */
const MINIMO_POR_CELULA = 25;

/**
 * Os cruzamentos que o relatório calcula. Fechada de propósito (ver cabeçalho).
 * `motivo` vai junto para o modelo, para ele saber o que a igreja queria saber.
 */
const CRUZAMENTOS = Object.freeze([
  {
    id: 'engajamento_por_tempo',
    eixo: 'Há quanto tempo frequenta?',
    metricas: ['Você participa de um Grupo?', 'Você serve na CBRio?', 'Você já fez o Next?', 'Você já foi batizado?'],
    motivo: 'Saber em que ponto da jornada a pessoa se conecta — e onde ela fica de fora.',
  },
  {
    id: 'engajamento_por_next',
    eixo: 'Você já fez o Next?',
    metricas: ['Você participa de um Grupo?', 'Você serve na CBRio?', 'Você contribui regularmente?'],
    controle: 'Há quanto tempo frequenta?',
    motivo: 'O Next é a porta de entrada declarada. Medir se quem passa por ele se conecta mais — controlando por tempo de casa, senão o efeito é só antiguidade.',
  },
  {
    id: 'engajamento_por_filhos',
    eixo: 'Tem filhos?',
    metricas: ['Você participa de um Grupo?', 'Você serve na CBRio?'],
    controle: 'Há quanto tempo frequenta?',
    motivo: 'Testar a explicação comum de que pais não têm tempo para grupo.',
  },
  {
    id: 'engajamento_por_canal',
    eixo: 'Como você frequenta a CBRio',
    metricas: ['Você participa de um Grupo?', 'Você serve na CBRio?', 'Você contribui regularmente?'],
    motivo: 'Quem acompanha pelo online está conectado de outras formas, ou só assiste?',
  },
]);

/** Ordem das faixas de tempo. Fora dela, ordem alfabética mente sobre jornada. */
const ORDEM_TEMPO = Object.freeze([
  'Menos de 6 meses', 'De 6 meses a 1 ano', 'De 1 a 3 anos', 'De 3 a 5 anos', 'Mais de 5 anos',
]);

function ordenarEixo(rotulo, valores) {
  if (rotulo === 'Há quanto tempo frequenta?') {
    return [...valores].sort((a, b) => ORDEM_TEMPO.indexOf(a) - ORDEM_TEMPO.indexOf(b));
  }
  return [...valores].sort();
}

const pct = (parte, total) => (total > 0 ? Math.round((parte / total) * 1000) / 10 : null);

/**
 * Perfil: uma linha por opção, com contagem e %.
 * @param {Array<{pergunta_texto, tipo, valor, total}>} agregado
 */
function montarPerfil(agregado) {
  if (!Array.isArray(agregado)) return [];
  const porPergunta = new Map();
  for (const l of agregado) {
    if (!l?.pergunta_texto || l.valor == null) continue;
    if (!porPergunta.has(l.pergunta_texto)) porPergunta.set(l.pergunta_texto, []);
    porPergunta.get(l.pergunta_texto).push({ valor: String(l.valor), n: Number(l.total) || 0 });
  }
  const out = [];
  for (const [pergunta, linhas] of porPergunta) {
    const total = linhas.reduce((s, x) => s + x.n, 0);
    if (total <= 0) continue;
    out.push({
      pergunta,
      base: total,
      opcoes: linhas
        .sort((a, b) => b.n - a.n)
        .map((x) => ({ valor: x.valor, n: x.n, pct: pct(x.n, total) })),
    });
  }
  return out;
}

/**
 * Calcula os cruzamentos declarados em CRUZAMENTOS a partir das pessoas.
 *
 * ⚠️ `pessoas` é um array de objetos { [pergunta_texto]: valor }. Sem id, sem
 * nome — quem monta é o endpoint, e o que não é montado não pode vazar.
 */
function montarCruzamentos(pessoas) {
  if (!Array.isArray(pessoas) || pessoas.length === 0) return [];
  const saida = [];

  for (const c of CRUZAMENTOS) {
    const controles = c.controle
      ? ordenarEixo(c.controle, [...new Set(pessoas.map((p) => p?.[c.controle]).filter(Boolean))])
      : [null];

    const faixas = [];
    for (const ctrl of controles) {
      const base = ctrl == null ? pessoas : pessoas.filter((p) => p?.[c.controle] === ctrl);
      const valoresEixo = ordenarEixo(c.eixo, [...new Set(base.map((p) => p?.[c.eixo]).filter(Boolean))]);

      for (const v of valoresEixo) {
        const grupo = base.filter((p) => p?.[c.eixo] === v);
        const metricas = {};
        for (const m of c.metricas) {
          const comDado = grupo.filter((p) => p?.[m] != null);
          // ⚠️⚠️ ESTE É O PISO, E É O ÚNICO QUE PRECISA EXISTIR. Célula pequena é
          // descartada, não reportada com ressalva: no corpo de um relatório
          // "n=7" vira número citado, e número citado vira decisão.
          //
          // ⚠️ Havia aqui uma segunda checagem, em `grupo.length`, que um teste
          // de mutação mostrou ser código morto: `comDado` nunca é maior que
          // `grupo`, então o piso da métrica já derruba todo caso que o piso do
          // grupo derrubaria. Guarda redundante dá falsa sensação de proteção e
          // esconde qual linha está de fato segurando a régua.
          if (comDado.length < MINIMO_POR_CELULA) continue;
          metricas[m] = {
            n: comDado.length,
            sim: comDado.filter((p) => String(p[m]).toLowerCase() === 'sim').length,
            pct_sim: pct(comDado.filter((p) => String(p[m]).toLowerCase() === 'sim').length, comDado.length),
          };
        }
        if (Object.keys(metricas).length) {
          faixas.push({ controle: ctrl, valor: v, pessoas: grupo.length, metricas });
        }
      }
    }
    if (faixas.length) saida.push({ id: c.id, eixo: c.eixo, controle: c.controle || null, motivo: c.motivo, faixas });
  }
  return saida;
}

/**
 * ⚠️⚠️ A GUARDA CONTRA CONSELHO GENÉRICO DE IGREJA.
 *
 * Todo item de recomendação precisa citar um número que EXISTE no material. Sem
 * isso o modelo produz "façam uma série sobre família" — que soa plausível,
 * parece ter vindo do censo, e não veio de lugar nenhum. Com a âncora, dá para
 * discordar com base.
 *
 * A conferência é sobre o número, não sobre a prosa: o item precisa trazer
 * `base_numerica` e ela precisa bater com algum valor realmente calculado.
 */
function numerosDisponiveis(perfil, cruzamentos) {
  const nums = new Set();
  for (const p of perfil || []) {
    nums.add(p.base);
    for (const o of p.opcoes || []) { nums.add(o.n); if (o.pct != null) nums.add(o.pct); }
  }
  for (const c of cruzamentos || []) {
    for (const f of c.faixas || []) {
      nums.add(f.pessoas);
      for (const m of Object.values(f.metricas || {})) {
        nums.add(m.n); nums.add(m.sim); if (m.pct_sim != null) nums.add(m.pct_sim);
      }
    }
  }
  return nums;
}

/** Aceita ±1 por arredondamento do modelo ao citar (ex.: 67,5 → 68). */
function citaNumeroReal(valor, nums) {
  const n = Number(valor);
  if (!Number.isFinite(n)) return false;
  for (const d of nums) if (Math.abs(d - n) <= 1) return true;
  return false;
}

/**
 * Descarta recomendação sem âncora e devolve o que sobrou + o que caiu.
 * ⚠️ Devolve os descartados para a tela poder dizer que caíram, em vez de
 * simplesmente aparecerem menos itens sem explicação.
 */
function filtrarRecomendacoes(itens, perfil, cruzamentos) {
  const nums = numerosDisponiveis(perfil, cruzamentos);
  const mantidas = [];
  const descartadas = [];
  for (const it of itens || []) {
    if (citaNumeroReal(it?.base_numerica, nums)) mantidas.push(it);
    else descartadas.push({ titulo: it?.titulo || '(sem título)', base_numerica: it?.base_numerica ?? null });
  }
  return { mantidas, descartadas };
}

module.exports = {
  MINIMO_POR_CELULA, CRUZAMENTOS, ORDEM_TEMPO,
  montarPerfil, montarCruzamentos,
  numerosDisponiveis, citaNumeroReal, filtrarRecomendacoes,
};
