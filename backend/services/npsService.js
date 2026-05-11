const Anthropic = require('@anthropic-ai/sdk');

const MODELO_PADRAO = 'claude-haiku-4-5-20251001';

const VALORES_INFO = {
  seguir:       { nome: 'Seguir Jesus',  foco: 'crescimento espiritual, devocional, conversão, batismo' },
  conectar:     { nome: 'Conectar',      foco: 'pertencimento, grupos de conexão, comunidade' },
  investir:     { nome: 'Investir Tempo', foco: 'discipulado, encontros, formação, Jornada 180' },
  servir:       { nome: 'Servir',        foco: 'voluntariado, escalas, contribuição prática' },
  generosidade: { nome: 'Generosidade',  foco: 'dízimo, ofertas, doações, generosidade financeira' },
};

function clienteAnthropic() {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY não configurada');
  }
  return new Anthropic();
}

function parseJson(text, fallback) {
  try {
    const limpo = (text || '').replace(/```json|```/g, '').trim();
    return JSON.parse(limpo);
  } catch {
    return fallback;
  }
}

// ── Geração de perguntas ────────────────────────────────────────────
// Recebe {valor, objetivo, contextoKpi} e devolve a estrutura de perguntas
// que será persistida na pesquisa.
async function gerarPerguntas({ valor, objetivo, contextoKpi }) {
  const info = VALORES_INFO[valor];
  if (!info) throw new Error(`Valor inválido: ${valor}`);
  if (!objetivo || objetivo.trim().length < 5) {
    throw new Error('Objetivo precisa descrever o que se quer medir');
  }

  const system = `Você é um especialista em pesquisas NPS (Net Promoter Score) para uma igreja chamada CBRio.
Sua tarefa é gerar UMA pergunta NPS principal (escala 0-10) + 2 a 3 perguntas qualitativas adicionais.

REGRAS:
- A pergunta NPS principal SEMPRE pergunta "De 0 a 10, ..." — adapte ao contexto do valor.
- As perguntas qualitativas devem aprofundar o que se quer medir, sem repetir a NPS.
- Use linguagem direta, calorosa, em português brasileiro.
- Cada pergunta qualitativa tem um "tipo": "texto_longo" (resposta aberta), "texto_curto" (uma frase) ou "escala_5" (1 a 5).
- Inclua sempre 1 pergunta aberta pedindo o motivo da nota.

Responda APENAS com JSON válido, sem markdown:
{
  "titulo_sugerido": "string curta",
  "descricao_curta": "1 frase explicando para o respondente o objetivo da pesquisa",
  "pergunta_nps": {
    "id": "nps",
    "tipo": "nps",
    "texto": "De 0 a 10, ..."
  },
  "perguntas_extras": [
    { "id": "motivo",        "tipo": "texto_longo", "texto": "O que mais influenciou sua nota?" },
    { "id": "outra_id",      "tipo": "escala_5 | texto_curto | texto_longo", "texto": "..." }
  ]
}`;

  const userMsg = `Valor da CBRio: ${info.nome}
Foco do valor: ${info.foco}
Contexto da NPS (tipo dado_bruto): ${contextoKpi}

O que queremos medir: ${objetivo.trim()}

Gere a pergunta NPS principal + 2 a 3 perguntas qualitativas.`;

  const client = clienteAnthropic();
  const response = await client.messages.create({
    model: MODELO_PADRAO,
    max_tokens: 800,
    system,
    messages: [{ role: 'user', content: userMsg }],
  });

  const raw = response.content?.filter(b => b.type === 'text').map(b => b.text).join('') || '';
  const data = parseJson(raw, null);
  if (!data || !data.pergunta_nps || !Array.isArray(data.perguntas_extras)) {
    throw new Error('IA não retornou perguntas em formato válido');
  }

  // Garante IDs únicos
  data.perguntas_extras.forEach((p, i) => {
    if (!p.id) p.id = `q${i + 1}`;
  });

  return {
    titulo_sugerido: data.titulo_sugerido || `NPS — ${info.nome}`,
    descricao_curta: data.descricao_curta || '',
    pergunta_nps: data.pergunta_nps,
    perguntas_extras: data.perguntas_extras.slice(0, 3),
    _ia_prompt: userMsg,
    _tokens_in: response.usage?.input_tokens || 0,
    _tokens_out: response.usage?.output_tokens || 0,
  };
}

// ── Análise das respostas ──────────────────────────────────────────
// Resume sentimentos, extrai temas e sugere ações práticas para o líder.
async function analisarRespostas({ pesquisa, respostas, stats }) {
  if (!Array.isArray(respostas) || respostas.length === 0) {
    return {
      resumo: 'Ainda não há respostas suficientes para gerar análise.',
      temas: [],
      acoes_sugeridas: [],
      sentimento: 'neutro',
      gerado_em: new Date().toISOString(),
      total_analisado: 0,
    };
  }

  const info = VALORES_INFO[pesquisa.valor];

  const amostra = respostas.slice(0, 80).map(r => ({
    score: r.score,
    comentario: r.comentario || null,
    respostas: r.respostas || {},
  }));

  const system = `Você analisa respostas de pesquisa NPS para uma igreja chamada CBRio.
Receba dados agregados + amostra de respostas e devolva análise útil para o líder da área.

REGRAS:
- "resumo": parágrafo de 4 a 6 linhas com a leitura geral.
- "temas": até 5 temas recorrentes (com {tema, frequencia: 'alta|media|baixa', exemplos: [trechos]}).
- "acoes_sugeridas": até 5 ações concretas que o líder pode tomar na próxima semana/mês.
- "sentimento": 'positivo' | 'neutro' | 'misto' | 'negativo' — leitura geral.
- Seja honesto. Se há detractors, diga claramente o que eles reclamaram.
- Não invente dados. Se a amostra é pequena, mencione no resumo.

Responda APENAS com JSON válido, sem markdown:
{
  "resumo": "...",
  "temas": [{ "tema": "...", "frequencia": "alta|media|baixa", "exemplos": ["..."] }],
  "acoes_sugeridas": ["..."],
  "sentimento": "positivo|neutro|misto|negativo"
}`;

  const userMsg = `Pesquisa: ${pesquisa.titulo}
Valor CBRio: ${info?.nome || pesquisa.valor}
Objetivo: ${pesquisa.objetivo}

Estatísticas:
- Total de respostas: ${stats.total_respostas}
- Score médio: ${stats.score_medio}
- NPS Score: ${stats.nps_score}
- Promoters (9-10): ${stats.promoters}
- Passives (7-8): ${stats.passives}
- Detractors (0-6): ${stats.detractors}

Perguntas adicionais:
${(pesquisa.perguntas?.perguntas_extras || []).map(p => `- [${p.id}] ${p.texto}`).join('\n')}

Amostra de respostas (até 80):
${JSON.stringify(amostra, null, 2)}`;

  const client = clienteAnthropic();
  const response = await client.messages.create({
    model: MODELO_PADRAO,
    max_tokens: 1500,
    system,
    messages: [{ role: 'user', content: userMsg }],
  });

  const raw = response.content?.filter(b => b.type === 'text').map(b => b.text).join('') || '';
  const data = parseJson(raw, {
    resumo: raw.slice(0, 800),
    temas: [],
    acoes_sugeridas: [],
    sentimento: 'neutro',
  });

  return {
    ...data,
    gerado_em: new Date().toISOString(),
    total_analisado: amostra.length,
    tokens_usados: (response.usage?.input_tokens || 0) + (response.usage?.output_tokens || 0),
  };
}

module.exports = {
  gerarPerguntas,
  analisarRespostas,
  VALORES_INFO,
  MODELO_PADRAO,
};
