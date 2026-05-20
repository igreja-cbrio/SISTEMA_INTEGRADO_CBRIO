// =====================================================================
// apresentacaoGenerator · gera slides HTML via Claude Opus
// =====================================================================
// O coracao do modulo: monta o system prompt com a "DSL" do deck-stage
// (web component em /public/apresentacoes/deck-stage.js) + exemplos
// compactos de slides bem desenhados, e chama Claude Opus.
//
// A IA tem liberdade pra escolher paleta/fontes/layout · mas precisa
// respeitar a estrutura <section class="slide">...</section> que o
// deck-stage espera, e usar classes de animacao .anim/.anim-fade/etc.
//
// Output esperado da IA: JSON { titulo, slides_count, css, html } onde
// `html` e' o conteudo interno do <deck-stage> (varios <section> seguidos)
// e `css` e' o CSS proprio da apresentacao (alem dos baseline definidos
// no viewer.html).
// =====================================================================

const Anthropic = require('@anthropic-ai/sdk');

// Default: Sonnet 4.6 · rapido e cabe no timeout 60s da Vercel Hobby.
// Opus 4.7 fica como opcao premium · usuario habilita por apresentacao.
const MODEL_DEFAULT = process.env.APRESENTACOES_MODEL || 'claude-sonnet-4-6';
const MODEL_PREMIUM = 'claude-opus-4-7';

// Pricing publico Anthropic (USD por milhao de tokens · valores reais em
// console.anthropic.com → Usage)
const PRICING = {
  'claude-sonnet-4-6': { input: 3,  output: 15 },
  'claude-opus-4-7':   { input: 15, output: 75 },
};

// max_tokens por modelo · Sonnet pode entregar mais slides no mesmo tempo
const MAX_TOKENS_BY_MODEL = {
  'claude-sonnet-4-6': 12000,
  'claude-opus-4-7':   10000,  // menor pra caber em 60s
};

// ─────────────────────────────────────────────────────────────────────
// System prompt · DSL do deck-stage + diretrizes visuais
// ─────────────────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `Voce gera decks HTML premium estilo Claude Design / Apple Keynote · slides 1920x1080.

# Estrutura

Saida vai dentro de <deck-stage>. Voce retorna **css** + **html** (varios <section class="slide">). NUNCA inclua <html>, <head>, <body>, <script>.

Cada slide:
- class="slide" · 1920x1080 · overflow:hidden · padding 60-100px
- UMA ideia central · max 7 itens visiveis
- data-screen-label="NN Titulo"

# Animacoes (ja implementadas no deck-stage)

Adicione a class em qualquer elemento:
- \`.anim\` fade-up com blur (default)
- \`.anim-fade\` so opacidade
- \`.anim-clip\` clip-path reveal lateral (cards grandes)
- \`.anim-line\` scaleX (dividers, progress)
- \`.anim-bar\` scaleY (colunas chart)
- \`.anim-ring\` scale bounce (avatares)

Stagger: \`.d-0\` a \`.d-14\` (cada N = 80ms delay). Ex: \`<h1 class="anim d-0">\`, \`<p class="anim d-2">\`.

# Tipografia (importar via @import no css)

\`@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;700&family=Inter:wght@300;400;500;600&family=JetBrains+Mono:wght@400;500&display=swap');\`

Use 1 fonte display (Space Grotesk, Fraunces, Manrope) + 1 body (Inter, Manrope) + mono pra labels/numeros (JetBrains Mono). Display sempre com letter-spacing negativo (-0.02em a -0.05em).

# Tamanhos

H1 cover 100-160px · H2 slide 64-96px · H3 36-56px · body grande 22-28px · body 16-20px · mono labels 11-14px UPPERCASE letter-spacing 0.1-0.2em.

# Paleta · escolha UMA identidade

Dark (premium · fundos #0A0E14-#141A24) · Light (clean · #FAFAF7-#FFF) · Vibrante (1 cor + neutros). Use OKLCH pra destaques: \`oklch(0.82 0.13 215)\` ciano, \`oklch(0.78 0.13 65)\` ambar, \`oklch(0.78 0.13 155)\` verde, \`oklch(0.78 0.13 0)\` rosa.

# Componentes

Chrome (tag mono topo/baixo com num slide) · bento grid 12 cols · big numbers 120-280px · tables limpas mono nos numeros · progress bars 6-12px com glow · stack badges com glyph.

# Nunca

Emojis decorativos (use ★ → ↳ ● ▲ ◆) · drop shadows pesadas · border-radius >16px em cards grandes · mais de 2 fontes display · conteudo amontoado.

# Estrutura sugerida (8-12 slides)

Cover · Resumo/agenda · 5-8 conteudo (1 ideia/slide) · Fechamento/CTA.

# OUTPUT · APENAS json, sem markdown:

{
  "titulo": "...",
  "slides_count": N,
  "css": "...",
  "html": "..."
}

Capricho > completude. Vai pra diretoria.`;

// ─────────────────────────────────────────────────────────────────────
// User prompt builder
// ─────────────────────────────────────────────────────────────────────
function buildUserPrompt({ titulo, prompt, tom, arquivos }) {
  const tomDescricoes = {
    executivo:  'tom corporativo serio, focado em decisao · paleta dark premium · numeros grandes · bento grids',
    comercial:  'tom comercial atrativo, focado em vendas · paleta vibrante · CTAs claros · destaques visuais',
    relatorio:  'tom analitico, denso em dados · paleta neutra · tabelas e graficos · tipografia precisa',
    criativo:   'tom criativo expressivo, focado em conceito · paleta arriscada · tipografia grande · espaco em branco',
  };

  let p = `# Apresentacao a gerar\n\n`;
  p += `**Titulo sugerido:** ${titulo}\n\n`;
  p += `**Tom:** ${tom || 'executivo'} · ${tomDescricoes[tom] || tomDescricoes.executivo}\n\n`;
  p += `**Briefing:**\n${prompt}\n\n`;

  if (arquivos && arquivos.length > 0) {
    p += `# Material de referencia (anexado pelo usuario)\n\n`;
    p += `Use o conteudo abaixo como fonte de verdade pra dados e narrativa. NAO invente numeros.\n\n`;
    arquivos.forEach((a, i) => {
      const trecho = (a.texto_extraido || '').slice(0, 3500);
      p += `## Arquivo ${i + 1}: ${a.nome}\n\n${trecho}\n\n---\n\n`;
    });
  }

  p += `\n# Tarefa\n\nGere uma apresentacao de 8 a 14 slides seguindo TODAS as diretrizes do system prompt. Capriche no design · esta apresentacao sera mostrada pra diretoria.`;

  return p;
}

// ─────────────────────────────────────────────────────────────────────
// Limpa wrapper de markdown que a IA as vezes coloca apesar do prompt
// ─────────────────────────────────────────────────────────────────────
function unwrapJson(text) {
  let t = text.trim();
  // Remove ```json ... ``` ou ``` ... ```
  t = t.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
  // Tenta achar { ... } maior · IA as vezes adiciona texto antes/depois
  const first = t.indexOf('{');
  const last  = t.lastIndexOf('}');
  if (first > 0 || last < t.length - 1) {
    if (first >= 0 && last > first) t = t.slice(first, last + 1);
  }
  return t;
}

// ─────────────────────────────────────────────────────────────────────
// Estima custo USD (heuristico · valor real so em console.anthropic.com)
// ─────────────────────────────────────────────────────────────────────
function estimarCusto(modelo, tokens_input, tokens_output) {
  const p = PRICING[modelo] || PRICING[MODEL_DEFAULT];
  const inp = (tokens_input  / 1_000_000) * p.input;
  const out = (tokens_output / 1_000_000) * p.output;
  return Math.round((inp + out) * 10000) / 10000;
}

// ─────────────────────────────────────────────────────────────────────
// Funcao principal · chama Claude e retorna o resultado parseado
// ─────────────────────────────────────────────────────────────────────
async function gerarApresentacao({ titulo, prompt, tom, arquivos, modelo }) {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY nao configurada no ambiente');
  }

  const client = new Anthropic();
  const t0 = Date.now();

  const modeloFinal = modelo && PRICING[modelo] ? modelo : MODEL_DEFAULT;
  const maxTokens = MAX_TOKENS_BY_MODEL[modeloFinal] || 10000;

  const resp = await client.messages.create({
    model: modeloFinal,
    max_tokens: maxTokens,
    system: SYSTEM_PROMPT,
    messages: [
      { role: 'user', content: buildUserPrompt({ titulo, prompt, tom, arquivos }) },
    ],
  });

  const duracao_ms = Date.now() - t0;

  const text = (resp.content || [])
    .filter(b => b.type === 'text')
    .map(b => b.text)
    .join('');

  const tokens_input  = resp.usage?.input_tokens  || 0;
  const tokens_output = resp.usage?.output_tokens || 0;
  const custo_usd     = estimarCusto(modeloFinal, tokens_input, tokens_output);

  // Parse JSON
  let parsed;
  try {
    parsed = JSON.parse(unwrapJson(text));
  } catch (err) {
    const preview = text.slice(0, 800);
    throw new Error('IA retornou JSON invalido. Inicio da resposta: ' + preview);
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('IA retornou estrutura invalida');
  }
  if (!parsed.html || typeof parsed.html !== 'string') {
    throw new Error('IA nao retornou html dos slides');
  }
  if (!parsed.css || typeof parsed.css !== 'string') {
    throw new Error('IA nao retornou css da apresentacao');
  }

  // Conta slides aproximadamente (procurando <section class="slide")
  const slidesCount = (parsed.html.match(/<section\s+class="slide"/g) || []).length;
  const slides_count = parsed.slides_count || slidesCount;

  return {
    titulo: String(parsed.titulo || titulo).slice(0, 200),
    slides_count,
    css: parsed.css,
    html: parsed.html,
    tokens_input,
    tokens_output,
    custo_usd,
    duracao_ms,
    modelo: modeloFinal,
  };
}

module.exports = { gerarApresentacao, SYSTEM_PROMPT, MODEL_DEFAULT, MODEL_PREMIUM, PRICING };
