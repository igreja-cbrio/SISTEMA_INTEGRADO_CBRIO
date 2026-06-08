// Inteligencia do bot WhatsApp · 2 personas, ambas com Claude Haiku:
//   1. parseConversa()        · lider/assistente reconhecido · coleta
//      CONVERSACIONAL (entende texto livre, pergunta o que faltou, tira
//      duvida de como reportar). Multi-turno: recebe os dados ja coletados
//      e a nova mensagem, devolve o estado atualizado.
//   2. responderInstitucional() · numero desconhecido · responde sobre a
//      igreja (missao/visao/valores/horarios) · NAO coleta dado.
//
// Nenhuma das funcoes lanca · sempre devolve algo seguro pro webhook.

const Anthropic = require('@anthropic-ai/sdk');
const MODEL = 'claude-haiku-4-5-20251001';

// Campos obrigatorios por modulo (o resto eh opcional)
const OBRIGATORIOS = {
  grupos:     ['presentes', 'decisoes'],
  integracao: ['presencial', 'decisoes'],
};

const SYSTEM_COLETA = `Voce eh o assistente da CBRio no WhatsApp, conversando com um LIDER/ASSISTENTE de ministerio que reporta numeros da semana. Tom: caloroso, breve, pt-BR, pode usar 1 emoji.

Modulos e campos:
- "grupos" (celula/grupo pequeno): presentes (total de pessoas · OBRIGATORIO), decisoes (decisoes por Jesus · OBRIGATORIO), visitantes (opcional).
- "integracao" (culto/templo): presencial (adultos no culto · OBRIGATORIO), decisoes (OBRIGATORIO), kids (opcional).

Voce recebe: o modulo provavel, os DADOS JA COLETADOS nessa conversa, e a NOVA MENSAGEM do lider. Sua tarefa:
1. Mesclar a nova mensagem com os dados ja coletados (NAO esqueca o que ja tinha).
2. Se faltar campo OBRIGATORIO, faca UMA pergunta curta e natural pedindo o que falta.
3. Se o lider tiver duvida de como reportar, explique rapido com um exemplo.
4. Quando todos os obrigatorios estiverem preenchidos, confirme o resumo e avise que um lider vai conferir e lancar no sistema.
5. Numeros nao informados = null (NUNCA invente).

Responda APENAS com JSON valido (sem markdown):
{
  "intent": "reportar_dado | duvida | saudacao | desconhecido",
  "modulo": "grupos | integracao | desconhecido",
  "dados": { "presentes": n|null, "presencial": n|null, "visitantes": n|null, "decisoes": n|null, "kids": n|null },
  "pronto": boolean,            // true se todos obrigatorios do modulo preenchidos
  "resposta": "mensagem pra enviar ao lider agora (pergunta, duvida ou confirmacao)",
  "resumo": "frase curta dos dados (ex: 12 presentes, 2 visitantes, 1 decisao)"
}`;

const FALLBACK_COLETA = {
  intent: 'desconhecido', modulo: 'desconhecido',
  dados: { presentes: null, presencial: null, visitantes: null, decisoes: null, kids: null },
  pronto: false,
  resposta: 'Desculpa, tive um problema aqui. Pode mandar de novo, por favor? 🙏',
  resumo: '',
};

function numOrNull(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
}

// Calcula campos obrigatorios ainda faltando (defensivo · nao confia so no modelo)
function faltando(modulo, dados) {
  const req = OBRIGATORIOS[modulo] || [];
  return req.filter(c => numOrNull(dados?.[c]) === null);
}

// dadosColetados: objeto com o que ja foi coletado na conversa (ou {} no inicio)
// dicaModulo: modulo provavel (do escopo do lider) pra desambiguar
async function parseConversa({ texto, dicaModulo, dadosColetados }) {
  if (!texto || !texto.trim()) return { ...FALLBACK_COLETA };
  if (!process.env.ANTHROPIC_API_KEY) return { ...FALLBACK_COLETA };
  try {
    const client = new Anthropic();
    const ctx = [
      dicaModulo ? `Modulo provavel: ${dicaModulo}.` : 'Modulo ainda nao definido.',
      `Dados ja coletados nessa conversa: ${JSON.stringify(dadosColetados || {})}.`,
      `Nova mensagem do lider: "${texto.trim()}"`,
    ].join('\n');

    const msg = await client.messages.create({
      model: MODEL, max_tokens: 500, system: SYSTEM_COLETA,
      messages: [{ role: 'user', content: ctx }],
    });
    const raw = (msg?.content?.[0]?.text || '').trim()
      .replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
    const p = JSON.parse(raw);
    const modulo = p.modulo || dicaModulo || 'desconhecido';
    const dados = {
      presentes:  numOrNull(p.dados?.presentes),
      presencial: numOrNull(p.dados?.presencial),
      visitantes: numOrNull(p.dados?.visitantes),
      decisoes:   numOrNull(p.dados?.decisoes),
      kids:       numOrNull(p.dados?.kids),
    };
    const falta = faltando(modulo, dados);
    return {
      intent: p.intent || 'desconhecido',
      modulo,
      dados,
      // pronto = modelo disse pronto E nossa checagem confirma (defensivo)
      pronto: p.intent === 'reportar_dado' && modulo !== 'desconhecido' && falta.length === 0,
      faltando: falta,
      resposta: p.resposta || '',
      resumo: p.resumo || '',
    };
  } catch (e) {
    console.error('[whatsappParser] parseConversa:', e.message);
    return { ...FALLBACK_COLETA };
  }
}

// ── Assistente institucional (numeros desconhecidos) ────────────────
async function responderInstitucional({ texto, institucional }) {
  const c = institucional || {};
  const generico = 'Ola! Que bom falar com voce. 🙏 Sou o assistente da CBRio. '
    + 'Posso te ajudar com horarios de culto e informacoes sobre a igreja. '
    + (c.horarios ? `\n\nNossos cultos:\n${c.horarios}` : '');
  if (!process.env.ANTHROPIC_API_KEY) return generico;
  try {
    const client = new Anthropic();
    const info = [
      c.sobre ? `Sobre: ${c.sobre}` : '',
      c.missao ? `Missao: ${c.missao}` : '',
      c.visao ? `Visao: ${c.visao}` : '',
      Array.isArray(c.valores) && c.valores.length ? `Valores: ${c.valores.join(', ')}` : '',
      c.horarios ? `Horarios de culto:\n${c.horarios}` : '',
      c.endereco ? `Endereco: ${c.endereco}` : '',
      c.instrucoes_extra || '',
    ].filter(Boolean).join('\n');

    const system = `Voce eh o assistente virtual da CBRio (Comunidade Batista do Rio) no WhatsApp, falando com alguem que NAO eh cadastrado (provavelmente visitante ou membro com duvida). Tom: acolhedor, breve, pt-BR, pode usar 1-2 emojis.

Use SOMENTE as informacoes abaixo pra responder. Se nao souber, convide a pessoa a visitar a igreja ou falar com a secretaria · NUNCA invente horario, endereco ou doutrina.

INFORMACOES OFICIAIS:
${info || '(nenhuma informacao cadastrada ainda)'}

Responda APENAS com o texto da mensagem (sem JSON, sem markdown).`;

    const msg = await client.messages.create({
      model: MODEL, max_tokens: 350, system,
      messages: [{ role: 'user', content: texto?.trim() || 'Ola' }],
    });
    return (msg?.content?.[0]?.text || generico).trim();
  } catch (e) {
    console.error('[whatsappParser] responderInstitucional:', e.message);
    return generico;
  }
}

module.exports = { parseConversa, responderInstitucional, faltando };
