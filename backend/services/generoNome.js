// Inferência de gênero pelo nome (via Claude Haiku) + flexão de adjetivos.
// Usado pra deixar mensagens automáticas naturais: "sozinho(a)" vira
// "sozinha"/"sozinho" conforme o nome; mantém "(a)" quando o nome é ambíguo.
//
// Best-effort: sem ANTHROPIC_API_KEY ou em qualquer erro → retorna 'U' (neutro).
const Anthropic = require('@anthropic-ai/sdk');
const MODEL = 'claude-haiku-4-5-20251001';

// cache em memória por primeiro nome (evita repetir chamada pro mesmo nome)
const cache = new Map();

function primeiroNome(nome) {
  return String(nome || '').trim().split(/\s+/)[0] || '';
}

// Retorna 'M' | 'F' | 'U' (incerto/unissex).
async function inferirGenero(nome) {
  const pn = primeiroNome(nome).toLowerCase();
  if (!pn) return 'U';
  if (cache.has(pn)) return cache.get(pn);
  if (!process.env.ANTHROPIC_API_KEY) return 'U';
  try {
    const client = new Anthropic();
    const msg = await client.messages.create({
      model: MODEL,
      max_tokens: 5,
      system: 'Você infere o gênero gramatical provável de um nome próprio brasileiro, para concordância de adjetivos. Responda APENAS com uma letra, sem pontuação nem explicação: M (masculino), F (feminino) ou U (incerto/unissex).',
      messages: [{ role: 'user', content: `Nome: ${primeiroNome(nome)}` }],
    });
    const r = (msg?.content?.[0]?.text || '').trim().toUpperCase().charAt(0);
    const g = (r === 'M' || r === 'F') ? r : 'U';
    cache.set(pn, g);
    return g;
  } catch (e) {
    console.warn('[generoNome] inferir:', e.message);
    return 'U';
  }
}

// Flexiona marcadores "palavra(a)" conforme o gênero.
//   F → forma feminina (palavra terminada em 'o' vira 'a'); M → forma base; U → mantém "(a)".
function flexionar(texto, genero) {
  if (!texto || genero === 'U') return texto;
  return texto.replace(/([A-Za-zÀ-ÿ]+)\(a\)/g, (_m, palavra) => {
    if (genero === 'F') {
      if (/o$/i.test(palavra)) {
        return palavra.replace(/o$/i, (c) => (c === 'O' ? 'A' : 'a')); // sozinho→sozinha, bem-vindo→bem-vinda
      }
      return palavra; // não termina em 'o' → usa a base sem o "(a)"
    }
    return palavra; // masculino → forma base (sozinho)
  });
}

// Atalho: aplica gênero a um texto que pode conter "(a)". Só chama a IA se houver marcador.
async function flexionarPorNome(texto, nome) {
  if (!texto || !/\(a\)/i.test(texto)) return texto;
  const g = await inferirGenero(nome);
  return flexionar(texto, g);
}

module.exports = { inferirGenero, flexionar, flexionarPorNome, primeiroNome };
