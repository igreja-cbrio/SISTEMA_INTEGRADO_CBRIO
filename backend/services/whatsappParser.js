// Parser de mensagem livre do líder -> dado estruturado, via Claude Haiku.
// Líder não decora sintaxe · manda "tivemos 12 hoje na celula, 2 visitantes
// e 1 decisão" e o modelo extrai os números + identifica o módulo.
//
// Retorna SEMPRE um objeto (nunca lanca) pra não derrubar o webhook:
//   { intent, módulo, dados, confiança, resumo }
//   intent  · 'reportar_dado' | 'saudacao' | 'duvida' | 'desconhecido'
//   módulo  · 'grupos' | 'integração' | 'desconhecido'
//   dados   · números extraidos (ver schema no prompt)
//   confiança · 0..1 (quao seguro o modelo esta da extracao)
//   resumo  · frase curta pt-BR pra ecoar de volta pro líder

const Anthropic = require('@anthropic-ai/sdk');

const MODEL = 'claude-haiku-4-5-20251001';

const SYSTEM = `Voce extrai dados ministeriais de mensagens de WhatsApp de lideres de igreja (CBRio), em portugues do Brasil.

O lider reporta numeros do encontro/culto da semana em texto livre. Sua tarefa: identificar o MODULO e extrair os NUMEROS.

Modulos possiveis:
- "grupos": encontro de celula/grupo pequeno. Dados: presentes (total de pessoas), visitantes, decisoes (pessoas que decidiram seguir Jesus).
- "integracao": culto (templo). Dados: presencial (adultos no culto), decisoes (decisoes no culto), kids (criancas, se mencionado).

Regras:
- Responda APENAS com JSON valido, sem markdown, sem texto fora do JSON.
- Numeros ausentes = null (NAO invente · null significa "nao informado").
- Se a mensagem for saudacao/duvida/sem numeros, intent != "reportar_dado".
- "confianca" reflete o quao claro estava (0.9 = explicito, 0.5 = ambiguo).
- "resumo" = frase curta confirmando o que entendeu, ex: "12 presentes, 2 visitantes, 1 decisao no grupo".

Formato exato:
{
  "intent": "reportar_dado | saudacao | duvida | desconhecido",
  "modulo": "grupos | integracao | desconhecido",
  "dados": {
    "presentes": number|null,
    "presencial": number|null,
    "visitantes": number|null,
    "decisoes": number|null,
    "kids": number|null
  },
  "confianca": number,
  "resumo": "string"
}`;

const FALLBACK = {
  intent: 'desconhecido',
  modulo: 'desconhecido',
  dados: { presentes: null, presencial: null, visitantes: null, decisoes: null, kids: null },
  confianca: 0,
  resumo: '',
};

// dicaModulo (opcional): se o líder so tem escopo de 1 módulo, passamos
// como contexto pra desambiguar mensagens curtas.
async function parseMensagem(texto, dicaModulo) {
  if (!texto || !texto.trim()) return { ...FALLBACK };
  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn('[whatsappParser] ANTHROPIC_API_KEY ausente · retornando fallback');
    return { ...FALLBACK };
  }
  try {
    const client = new Anthropic();
    const contexto = dicaModulo
      ? `\n\nContexto: este líder normalmente reporta o módulo "${dicaModulo}". Prefira esse módulo se a mensagem for ambigua.`
      : '';
    const msg = await client.messages.create({
      model: MODEL,
      max_tokens: 400,
      system: SYSTEM,
      messages: [{ role: 'user', content: texto.trim() + contexto }],
    });
    const raw = (msg?.content?.[0]?.text || '').trim();
    // Defensivo · remove cercas de código se o modelo escorregar
    const limpo = raw.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
    const parsed = JSON.parse(limpo);
    return {
      intent: parsed.intent || 'desconhecido',
      modulo: parsed.modulo || 'desconhecido',
      dados: {
        presentes:  numOrNull(parsed.dados?.presentes),
        presencial: numOrNull(parsed.dados?.presencial),
        visitantes: numOrNull(parsed.dados?.visitantes),
        decisoes:   numOrNull(parsed.dados?.decisoes),
        kids:       numOrNull(parsed.dados?.kids),
      },
      confianca: typeof parsed.confianca === 'number' ? parsed.confianca : 0,
      resumo: parsed.resumo || '',
    };
  } catch (e) {
    console.error('[whatsappParser] falha ao parsear:', e.message);
    return { ...FALLBACK };
  }
}

function numOrNull(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
}

module.exports = { parseMensagem };
