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

// Modelo Opus 4.7 (id exato exige verificar SDK · em prod a env permite override)
const MODEL_DEFAULT = process.env.APRESENTACOES_MODEL || 'claude-opus-4-7';

// Custo Opus aproximado (USD por milhao de tokens · valores publicos Anthropic)
// Input: $15 / Output: $75 · valores reais saem em console.anthropic.com → Usage
const CUSTO_INPUT_PER_MTOK  = 15;
const CUSTO_OUTPUT_PER_MTOK = 75;

const MAX_TOKENS_OUTPUT = 16000;

// ─────────────────────────────────────────────────────────────────────
// System prompt · DSL do deck-stage + diretrizes visuais
// ─────────────────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `Voce e um designer senior de apresentacoes premium. Voce gera decks HTML interativos no estilo Claude Design / Apple Keynote · slides em escala 1920x1080, tipografia precisa, layout impecavel, animacoes sutis.

# Estrutura obrigatoria

Sua saida sera renderizada dentro de um web component <deck-stage> que ja existe. Voce gera:

1. **CSS** · estilos proprios da apresentacao (paleta, tipografia, componentes especificos)
2. **HTML** · varios <section class="slide">...</section> em sequencia (cada section = 1 slide)

NAO inclua <html>, <head>, <body>, <link>, <script>. Apenas CSS e HTML do conteudo dos slides.

# Anatomia de um slide

\`\`\`html
<section class="slide" data-screen-label="01 Cover">
  <!-- conteudo do slide -->
</section>
\`\`\`

Cada slide deve ter:
- \`width: 1920px; height: 1080px\` (definido na sua CSS base)
- \`overflow: hidden\` (slide nao pode ter scroll)
- \`padding\` generoso (60-120px nas bordas)
- conteudo bem distribuido · nunca apertado, nunca solto demais

# Classes de animacao disponiveis (ja implementadas pelo deck-stage)

Adicione na class de qualquer elemento pra animar quando o slide aparecer:

- \`.anim\` · fade-up com blur (default · use pra titulos, textos, blocos)
- \`.anim-fade\` · so opacidade
- \`.anim-clip\` · clip-path reveal lateral (use pra cards grandes)
- \`.anim-line\` · scaleX (use pra dividers, barras de progresso)
- \`.anim-bar\` · scaleY (use pra colunas de grafico)
- \`.anim-ring\` · scale com bounce (use pra avatares, badges circulares)
- \`.gantt-bar\` · scaleX longo (gantt charts)
- \`.bar\` · scaleY pra barras de chart

Stagger por classe \`.d-N\` (N de 0 a 14) controla o delay (cada N = 80ms).
Exemplo: \`<h1 class="anim d-0">\`, \`<p class="anim d-2">\` (h1 anima primeiro, p 160ms depois).

# Tipografia recomendada

Carregue Google Fonts via @import dentro do seu CSS:

\`\`\`css
@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=Inter:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap');
\`\`\`

Use **uma fonte display** pra titulos (sugestoes: Space Grotesk, Fraunces, Instrument Serif, Manrope) e **uma fonte body** pra texto corrente (Inter, Manrope, IBM Plex Sans). Pra numeros/codigos/labels tecnicos, JetBrains Mono ou IBM Plex Mono. Letras display sempre com letter-spacing negativo (-0.02em a -0.05em em tamanhos grandes).

# Hierarquia de tamanhos (slide 1920x1080)

- H1 display (cover): 100-160px
- H2 (titulo de slide): 64-96px
- H3 (subtitulo): 36-56px
- Body grande: 22-28px
- Body normal: 16-20px
- Mono small (labels): 11-14px com letter-spacing 0.1-0.2em + UPPERCASE

# Paleta · escolha UMA identidade visual

Decida no inicio se a apresentacao sera:
- **Dark** (recomendado pra estilo premium · fundos #0A0E14 a #141A24, texto #F2F0EB)
- **Light** (clean corporate · fundos #FAFAF7 a #FFFFFF, texto #0A0E14)
- **Vibrante** (uma cor protagonista + neutros)

Use OKLCH pra cores de destaque (mais previsivel que HSL):
\`oklch(0.82 0.13 215)\` = ciano vibrante claro
\`oklch(0.78 0.13 65)\` = ambar
\`oklch(0.78 0.13 155)\` = verde
\`oklch(0.78 0.13 0)\` = rosa
Varie chroma (0.10-0.15) e lightness (0.65-0.85) pra criar paleta coesa.

# Componentes recomendados

- **Chrome topo/baixo** · tags monoespacadas pequenas com nome da apresentacao + numero do slide
- **Bento grids** · grid-template-columns: repeat(12, 1fr) com cards de spans variados
- **Big numbers** · displays gigantes (120-280px) acompanhados de label monoespacado
- **Tables** · ULTRA limpas, sem bordas pesadas, com tipografia monoespacada nos numeros
- **Progress bars** · 6-12px de altura, gradient horizontal, com glow sutil
- **Gantt rows** · grid 340px + 1fr, barras coloridas com box-shadow glow
- **Stack badges** · cards pequenos com glyph + titulo + descricao em mono

# Anti-padroes (NUNCA faca)

- Emojis decorativos · use simbolos tipograficos (★, →, ↳, ●, ▲, ◆) ou nao use nada
- Drop shadows pesadas tipo Bootstrap 2010
- Bordas com border-radius >16px em cards grandes
- Mais de 2 fontes display na mesma apresentacao
- Textos sem hierarquia clara (tudo no mesmo tamanho)
- Mais que 7 itens visiveis simultaneamente (regra de Miller)
- Conteudo amontoado · cada slide tem UMA ideia central

# Estrutura recomendada de apresentacao

1. **Cover** · titulo gigante + 1-2 frases + meta (data, autor, contexto)
2. **Resumo executivo / agenda** · bento grid com os pontos chave
3-N. **Slides de conteudo** · cada um foca em UMA ideia
N+1. **Encerramento / proximos passos** · call to action claro

Para 10 slides total: 1 cover + 1 agenda + 7 conteudo + 1 fechamento.

# Output

Retorne APENAS um JSON object (sem markdown, sem texto fora do JSON, sem \`\`\`):

\`\`\`json
{
  "titulo": "...",
  "slides_count": N,
  "css": "todo o CSS aqui · pode ter ~200-500 linhas",
  "html": "todo o HTML dos slides aqui · varios <section class='slide'>...</section> em sequencia"
}
\`\`\`

LEMBRE: o usuario vai ver isso na tela e impressionar quem assistir. Capricho > completude.`;

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
function estimarCusto(tokens_input, tokens_output) {
  const inp = (tokens_input  / 1_000_000) * CUSTO_INPUT_PER_MTOK;
  const out = (tokens_output / 1_000_000) * CUSTO_OUTPUT_PER_MTOK;
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

  const resp = await client.messages.create({
    model: modelo || MODEL_DEFAULT,
    max_tokens: MAX_TOKENS_OUTPUT,
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
  const custo_usd     = estimarCusto(tokens_input, tokens_output);

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
    modelo: modelo || MODEL_DEFAULT,
  };
}

module.exports = { gerarApresentacao, SYSTEM_PROMPT, MODEL_DEFAULT };
