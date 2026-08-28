// ════════════════════════════════════════════════════════════════════════════
//  CENSO · Leitura da IA
//
//  O que esta camada faz que um gráfico não faz: ler as respostas ABERTAS.
//  O censo tem ~10 campos de texto livre ("o que você menos gosta", "o que
//  melhoraria na comunicação", o comentário final) e é exatamente ali que mora
//  a informação que ninguém pensou em perguntar. 2.500 respostas de texto livre
//  é material que nenhuma equipe lê inteiro.
//
//  Três decisões que vêm do assunto, não da técnica:
//
//   1. Opus 5, não Haiku. O resto do ERP classifica pedido de oração com Haiku
//      — classificar em 11 categorias fixas é tarefa fácil. Aqui é síntese: ler
//      centenas de textos e dizer o que a comunidade está dizendo, com nuance e
//      sem inventar. É o trabalho mais difícil que a IA faz neste sistema, e o
//      resultado vai para a mesa de decisão da liderança. Modelo bom é barato
//      comparado a uma leitura errada guiando a estratégia do ano.
//
//   2. O bloco SENSÍVEL não entra no prompt. Nunca. Saúde emocional e
//      casamento são dado sensível (LGPD art. 11) coletado com a promessa de
//      virar estatística — não de virar contexto de um modelo. O filtro é aqui,
//      na origem, e não na tela.
//
//   3. Só texto, e sem nome. O que vai para o modelo é o texto da resposta
//      solto, sem nome, sem telefone, sem id. Uma síntese não precisa saber
//      QUEM disse; e o que o modelo não recebe não pode escapar.
//
//  Falha em silêncio (devolve null) quando não há ANTHROPIC_API_KEY: é análise,
//  não é coleta — o censo funciona sem ela.
// ════════════════════════════════════════════════════════════════════════════
const Anthropic = require('@anthropic-ai/sdk');

// Síntese de texto aberto é a tarefa mais difícil do sistema. Não economize aqui.
const MODEL = 'claude-opus-5';

// Teto de material por leitura. Não é limite de contexto (Opus 5 tem 1M) — é
// limite de custo e de honestidade: acima disso a síntese vira média de médias.
const MAX_TEXTOS_POR_PERGUNTA = 400;
const MAX_CHARS_POR_TEXTO = 600;

const SYSTEM = `Você lê as respostas abertas de um censo de uma igreja evangélica no Rio de Janeiro e escreve uma síntese para a liderança decidir o que fazer.

REGRAS DE HONESTIDADE (as mais importantes):
- Só afirme o que está nos textos. Não complete lacuna com o que "costuma ser verdade em igrejas".
- Quantifique quando puder ("cerca de um terço menciona…") e diga quando NÃO puder ("poucos textos tocam nisso, não dá para concluir").
- Se um tema aparece 2 ou 3 vezes em centenas de respostas, diga que é raro. Um comentário isolado não é tendência — mas pode ser importante, e aí diga que é isolado E importante.
- Preserve a discordância. Se metade elogia e metade critica a mesma coisa, isso é o achado; não faça média.
- Nunca cite nome de pessoa, ainda que apareça no texto.

TOM: direto, sem elogio à igreja e sem suavizar crítica. Quem lê precisa do que está ruim, não de conforto. Escreva em português do Brasil.

O QUE ENTREGAR: para cada pergunta, os temas que realmente aparecem, com peso relativo e uma citação curta e representativa por tema (verbatim, entre aspas, sem nome). Depois, uma leitura geral: o que a comunidade está pedindo, o que já está funcionando, e o que merece atenção agora.`;

const ESQUEMA = {
  type: 'object',
  properties: {
    por_pergunta: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          pergunta_id: { type: 'string' },
          pergunta_texto: { type: 'string' },
          respostas_lidas: { type: 'integer' },
          temas: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                tema: { type: 'string' },
                peso: {
                  type: 'string',
                  enum: ['maioria', 'muitos', 'alguns', 'poucos', 'isolado'],
                  description: 'Peso relativo do tema no conjunto lido. "isolado" = 1 ou 2 menções.',
                },
                mencoes: { type: 'integer' },
                sintese: { type: 'string' },
                citacao: { type: 'string', description: 'Trecho verbatim curto, sem nome.' },
              },
              required: ['tema', 'peso', 'mencoes', 'sintese', 'citacao'],
              additionalProperties: false,
            },
          },
        },
        required: ['pergunta_id', 'pergunta_texto', 'respostas_lidas', 'temas'],
        additionalProperties: false,
      },
    },
    leitura_geral: {
      type: 'object',
      properties: {
        pedindo: {
          type: 'array', items: { type: 'string' },
          description: 'O que a comunidade está pedindo, em frases acionáveis.',
        },
        funcionando: { type: 'array', items: { type: 'string' } },
        atencao: {
          type: 'array', items: { type: 'string' },
          description: 'O que merece atenção agora, inclusive o desconfortável.',
        },
        ressalvas: {
          type: 'array', items: { type: 'string' },
          description: 'Onde os dados NÃO sustentam conclusão. Obrigatório dizer isso quando for o caso.',
        },
      },
      required: ['pedindo', 'funcionando', 'atencao', 'ressalvas'],
      additionalProperties: false,
    },
  },
  required: ['por_pergunta', 'leitura_geral'],
  additionalProperties: false,
};

/**
 * Monta o material para o modelo a partir dos itens de resposta abertos.
 *
 * @param {Array} itens - linhas { pergunta_id, pergunta_texto, valor_texto, sensivel }
 * @returns {{ blocos: Array, total_textos: number, truncadas: Array }}
 */
function prepararMaterial(itens) {
  const porPergunta = new Map();
  for (const i of itens || []) {
    // O bloco sensível não entra. Nunca. (Guarda redundante: o SQL já filtra —
    // duas guardas porque uma refatoração futura pode mexer só numa.)
    if (i?.sensivel === true) continue;
    const t = String(i?.valor_texto || '').trim();
    if (t.length < 3) continue;                 // "ok", "-", vazio: não é opinião
    const k = i.pergunta_id;
    if (!porPergunta.has(k)) {
      porPergunta.set(k, { pergunta_id: k, pergunta_texto: i.pergunta_texto || k, textos: [], total: 0 });
    }
    const b = porPergunta.get(k);
    b.total += 1;
    if (b.textos.length < MAX_TEXTOS_POR_PERGUNTA) b.textos.push(t.slice(0, MAX_CHARS_POR_TEXTO));
  }
  const blocos = [...porPergunta.values()].filter((b) => b.textos.length > 0);
  const truncadas = blocos
    .filter((b) => b.total > b.textos.length)
    .map((b) => ({ pergunta_id: b.pergunta_id, lidas: b.textos.length, total: b.total }));
  return { blocos, total_textos: blocos.reduce((s, b) => s + b.textos.length, 0), truncadas };
}

/**
 * Lê as respostas abertas e devolve a síntese, ou null.
 *
 * @returns {Promise<null|{ modelo, geradas_em, respostas_lidas, truncadas, por_pergunta, leitura_geral, uso }>}
 */
async function lerRespostasAbertas(itens, { agora } = {}) {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  const { blocos, total_textos, truncadas } = prepararMaterial(itens);
  if (!blocos.length) return null;

  const material = blocos.map((b) => [
    `### ${b.pergunta_texto}`,
    `(id: ${b.pergunta_id} · ${b.textos.length} respostas${b.total > b.textos.length ? ` de ${b.total}, amostradas` : ''})`,
    ...b.textos.map((t) => `- ${t}`),
  ].join('\n')).join('\n\n');

  const client = new Anthropic();
  // Streaming porque max_tokens é alto: uma síntese de 10 perguntas com citações
  // passa fácil de 16k, e requisição não-streaming estoura o timeout do SDK.
  const stream = client.messages.stream({
    model: MODEL,
    max_tokens: 32000,
    thinking: { type: 'adaptive' },
    output_config: { effort: 'high', format: { type: 'json_schema', schema: ESQUEMA } },
    system: SYSTEM,
    messages: [{ role: 'user', content: `Respostas abertas do censo:\n\n${material}` }],
  });
  const msg = await stream.finalMessage();

  if (msg?.stop_reason === 'refusal') return null;
  const texto = (msg?.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
  let dados;
  try { dados = JSON.parse(texto); } catch { return null; }

  return {
    modelo: MODEL,
    geradas_em: agora || new Date().toISOString(),
    respostas_lidas: total_textos,
    truncadas,
    por_pergunta: dados.por_pergunta || [],
    leitura_geral: dados.leitura_geral || null,
    uso: {
      entrada: msg?.usage?.input_tokens ?? null,
      saida: msg?.usage?.output_tokens ?? null,
    },
  };
}

module.exports = { lerRespostasAbertas, prepararMaterial, MODEL, ESQUEMA, MAX_TEXTOS_POR_PERGUNTA };
