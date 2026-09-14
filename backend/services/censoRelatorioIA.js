// ════════════════════════════════════════════════════════════════════════════
//  CENSO · Relatório analítico gerado por IA
//
//  Pedido do Matheus (13/09/2026): "a IA vai analisar as respostas e me trazer
//  um relatório completo, como uma empresa profissional que aplica censo faria",
//  com sugestões de série de pregação e de eventos, e download em PDF.
//
//  ⚠️⚠️ ESTE SERVIÇO NÃO LÊ RESPOSTA ABERTA — e não é escolha de desenho, é o
//  dado. Medido em 13/09: o Censo CBRio 2026 tem 34 perguntas e ZERO do tipo
//  `texto_longo`; entre as 794 concluídas há zero resposta aberta. O irmão
//  `censoLeituraIA` continua existindo para quando houver texto; este aqui lê o
//  que existe de fato — as fechadas agregadas e os cruzamentos.
//
//  ⚠️⚠️ O MODELO NÃO FAZ ARITMÉTICA. Quem conta é `utils/censoRelatorioDados`
//  (puro, no gate). O modelo recebe tabela pronta e INTERPRETA. Modelo que soma
//  porcentagem erra em silêncio, e o erro sai com cara de achado.
//
//  ⚠️⚠️ E O QUE ELE ESCREVE É CONFERIDO CONTRA OS NÚMEROS. Toda recomendação
//  tem de citar um valor que existe no material (`filtrarRecomendacoes`); as
//  que não citam são DESCARTADAS e contadas. Sem isso o modelo produz "façam
//  uma série sobre família" — plausível, com cara de censo, e vindo de lugar
//  nenhum.
//
//  Falha em silêncio (devolve null) sem ANTHROPIC_API_KEY: é análise, não é
//  coleta — o censo funciona sem ela.
// ════════════════════════════════════════════════════════════════════════════
const Anthropic = require('@anthropic-ai/sdk');
// ⚠️ A régua (contagem, cruzamentos e a guarda de âncora) mora em `utils/`
// porque é ela que entra no gate — `backend/` tem árvore de dependências
// própria e o CI só instala a da raiz. Aqui só o SDK.
const {
  filtrarRecomendacoes, MINIMO_POR_CELULA, materialDoPerfil, materialDosCruzamentos,
} = require('../utils/censoRelatorioDados');

// Relatório que a liderança vai levar para reunião. Não economize aqui.
const MODEL = 'claude-opus-5';

const SYSTEM = `Você é analista de pesquisa e está escrevendo o relatório de um censo de uma igreja evangélica no Rio de Janeiro, para a liderança decidir o que fazer nos próximos meses.

O QUE VOCÊ RECEBE: tabelas JÁ CALCULADAS — perfil dos respondentes e cruzamentos escolhidos antes de olhar o resultado, cada um com o motivo pelo qual a igreja quis saber aquilo.

REGRAS DE HONESTIDADE (as mais importantes):
- NÃO refaça conta. Os números do material são a verdade; cite-os como estão. Se quiser uma conta que não está lá, diga que não está.
- Correlação não é causa, e diga isso onde importa. Se duas coisas andam juntas, ofereça a explicação alternativa mais forte (auto-seleção, tempo de casa) e diga qual evidência decidiria entre elas — ainda que ela não exista.
- Quando um corte tiver poucas respostas, não use. O material já descartou célula com menos de ${MINIMO_POR_CELULA}; não reconstrua a partir de outras.
- Diga o que o censo NÃO responde. Um relatório que só afirma é um relatório que não foi conferido.
- Nunca cite pessoa. Você não recebe nome, e não deve inventar exemplo individual.

TOM: direto, sem elogiar a igreja e sem suavizar o que está ruim. Quem lê precisa decidir, não ser consolado. Português do Brasil, frases curtas.

SOBRE AS RECOMENDAÇÕES: cada uma precisa nascer de um número do material, e você tem de informar esse número em \`base_numerica\`. Recomendação sem âncora é descartada automaticamente antes de chegar em quem lê — então não gaste item com conselho genérico de igreja. Prefira poucas recomendações fortes a muitas plausíveis.`;

const ESQUEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['resumo_executivo', 'achados', 'recomendacoes', 'o_que_o_censo_nao_responde'],
  properties: {
    // Abre o relatório. É o que vai ser lido em voz alta na reunião.
    resumo_executivo: {
      type: 'object',
      additionalProperties: false,
      required: ['paragrafo', 'pontos'],
      properties: {
        paragrafo: { type: 'string', description: 'Um parágrafo. O retrato da igreja segundo este censo.' },
        pontos: {
          type: 'array', minItems: 3, maxItems: 6,
          items: { type: 'string', description: 'Uma frase com número.' },
        },
      },
    },
    achados: {
      type: 'array', minItems: 3, maxItems: 8,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['titulo', 'o_que_os_dados_mostram', 'forca', 'ressalva'],
        properties: {
          titulo: { type: 'string' },
          o_que_os_dados_mostram: { type: 'string', description: 'Com os números do material.' },
          forca: {
            type: 'string', enum: ['forte', 'moderado', 'sugestivo'],
            description: 'forte = diferença grande e consistente entre cortes; sugestivo = aparece mas pode ser outra coisa.',
          },
          // ⚠️ Campo OBRIGATÓRIO de propósito: força o modelo a escrever a
          // objeção junto do achado, em vez de deixá-la para um rodapé que
          // ninguém lê.
          ressalva: { type: 'string', description: 'A explicação alternativa mais forte, ou o que faltaria para confirmar.' },
        },
      },
    },
    recomendacoes: {
      type: 'array', minItems: 2, maxItems: 8,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['titulo', 'tipo', 'porque', 'base_numerica', 'como_medir'],
        properties: {
          titulo: { type: 'string' },
          tipo: {
            type: 'string',
            enum: ['serie_pregacao', 'evento', 'processo', 'comunicacao', 'cuidado'],
          },
          porque: { type: 'string', description: 'O número do censo que sustenta isto.' },
          base_numerica: {
            type: 'number',
            description: 'O valor exato do material que ancora esta recomendação (contagem ou porcentagem).',
          },
          // Sem isto a recomendação é opinião: ninguém saberá se funcionou.
          como_medir: { type: 'string', description: 'Como saber, daqui a alguns meses, se deu certo.' },
        },
      },
    },
    o_que_o_censo_nao_responde: {
      type: 'array', minItems: 1, maxItems: 6,
      items: { type: 'string' },
    },
  },
};

/**
 * Gera o relatório. Devolve null quando não há chave ou não há material.
 *
 * @param {{perfil: Array, cruzamentos: Array, respostas: number}} dados
 * @returns {Promise<null|object>}
 */
async function gerarRelatorio(dados, { agora } = {}) {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  const perfil = dados?.perfil || [];
  const cruzamentos = dados?.cruzamentos || [];
  // Sem perfil não há relatório — e é diferente de "falhou": a pesquisa ainda
  // não tem resposta agregável.
  if (!perfil.length) return null;

  const material = [
    `Censo com ${dados?.respostas ?? 0} respostas.`,
    '',
    '## PERFIL DOS RESPONDENTES',
    materialDoPerfil(perfil),
    '',
    '## CRUZAMENTOS',
    cruzamentos.length
      ? materialDosCruzamentos(cruzamentos)
      : '(nenhum cruzamento teve célula grande o suficiente para ser calculado)',
  ].join('\n');

  const client = new Anthropic();
  // Streaming: o relatório completo passa de 16k e requisição não-streaming
  // estoura o timeout do SDK.
  const stream = client.messages.stream({
    model: MODEL,
    max_tokens: 32000,
    thinking: { type: 'adaptive' },
    output_config: { effort: 'high', format: { type: 'json_schema', schema: ESQUEMA } },
    system: SYSTEM,
    messages: [{ role: 'user', content: material }],
  });
  const msg = await stream.finalMessage();

  if (msg?.stop_reason === 'refusal') return null;
  const texto = (msg?.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
  let out;
  try { out = JSON.parse(texto); } catch { return null; }

  // ⚠️⚠️ A CONFERÊNCIA. O que o modelo escreveu só vale se citar número real.
  const { mantidas, descartadas } = filtrarRecomendacoes(out.recomendacoes, perfil, cruzamentos);

  return {
    modelo: MODEL,
    gerado_em: agora || new Date().toISOString(),
    respostas_lidas: dados?.respostas ?? 0,
    resumo_executivo: out.resumo_executivo || null,
    achados: out.achados || [],
    recomendacoes: mantidas,
    // Vai para a tela: recomendação que caiu é informação sobre a geração, não
    // lixo a esconder. Se o modelo produz muito descarte, a régua está pegando.
    recomendacoes_descartadas: descartadas,
    o_que_o_censo_nao_responde: out.o_que_o_censo_nao_responde || [],
    uso: {
      entrada: msg?.usage?.input_tokens ?? null,
      saida: msg?.usage?.output_tokens ?? null,
    },
  };
}

// ⚠️ `materialDoPerfil`/`materialDosCruzamentos` são RE-EXPORTADOS de `utils/`:
// eles são puros e precisam ser testáveis pelo gate, que roda sem a árvore de
// dependências de `backend/` (onde vive o SDK). Mesma divisão do
// `censoLeituraIA` ↔ `censoIaFiltro`.
module.exports = { gerarRelatorio, MODEL, ESQUEMA, materialDoPerfil, materialDosCruzamentos };
