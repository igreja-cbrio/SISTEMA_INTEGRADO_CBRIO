// Filtro da importação de frequência de voluntários: descarta os "nomes" que
// na verdade são FUNÇÃO / POSIÇÃO / EQUIPE / EQUIPAMENTO de escala (ex.: Vocal,
// Iluminação, Bateria, "Câmera 7 - Palco", Bridge, Broadcast, Integração) ou
// cabeçalhos/totais (Total, Quant) — não pessoas. As planilhas de controle às
// vezes trazem esses rótulos na mesma coluna dos nomes e o leitor não tem como
// distinguir sozinho.
//
// Combina duas camadas:
//   1. Determinística — lista de posições/equipes REAIS vindas do Planning
//      Center (vol_schedules.team_name / position_name + vol_teams/positions) +
//      termos genéricos + padrões de equipamento. Grátis e confiável.
//   2. Haiku — classifica os nomes ambíguos restantes (pessoa × não-pessoa).
//      Best-effort: sem ANTHROPIC_API_KEY ou em erro, fica só na camada 1.
const Anthropic = require('@anthropic-ai/sdk');
const { supabase } = require('../utils/supabase');
const MODEL = 'claude-haiku-4-5-20251001';

function norm(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/\s+/g, ' ').trim();
}

// Posições/equipes genéricas + as reais já sincronizadas do Planning Center.
async function conjuntoPosicoesConhecidas() {
  const set = new Set([
    'vocal', 'banda', 'bateria', 'baixo', 'guitarra', 'violao', 'teclado',
    'iluminacao', 'broadcast', 'producao', 'integracao', 'recepcao', 'diaconia',
    'livraria', 'bridge', 'apoio', 'apoio gc', 'ministracao', 'coordenacao',
    'facilitador', 'lideranca', 'quant', 'total', 'geral', 'som', 'midia',
    'transmissao', 'voluntariado', 'cuidados', 'marketing', 'cbrio online',
    'assistente ministerial',
  ]);
  try {
    const { data } = await supabase.from('vol_schedules')
      .select('team_name, position_name').limit(5000);
    for (const r of data || []) {
      const a = norm(r.team_name); if (a) set.add(a);
      const b = norm(r.position_name); if (b) set.add(b);
    }
  } catch (e) {
    console.warn('[volNomeFiltro] posicoes PCO:', e.message);
  }
  return set;
}

// Recebe nomes (com repetição ok) e devolve um Set com os nomes NORMALIZADOS
// que NÃO são de pessoa (devem ser ignorados na importação).
async function nomesNaoPessoa(nomes) {
  const distintos = [...new Set((nomes || []).map(n => String(n || '').trim()).filter(Boolean))];
  const skip = new Set();
  if (!distintos.length) return skip;

  const conhecidas = await conjuntoPosicoesConhecidas();
  const restantes = [];
  for (const nome of distintos) {
    const n = norm(nome);
    // posição conhecida ou padrão óbvio de equipamento/lugar
    if (conhecidas.has(n) ||
        /\b(camera|camara|zoom|palco|congregacao|centro|direita|esquerda|fundo|switcher|projecao)\b/.test(n)) {
      skip.add(n);
      continue;
    }
    restantes.push(nome);
  }

  if (restantes.length && process.env.ANTHROPIC_API_KEY) {
    try {
      const client = new Anthropic();
      const lista = restantes.map((nm, i) => `${i}: ${nm}`).join('\n');
      const msg = await client.messages.create({
        model: MODEL,
        max_tokens: 1500,
        system: 'Você recebe uma lista NUMERADA de textos que deveriam ser NOMES DE PESSOAS (escala de voluntários de uma igreja). Alguns, porém, são na verdade nomes de FUNÇÃO/POSIÇÃO/EQUIPE/EQUIPAMENTO (ex.: Vocal, Iluminação, Bateria, Câmera 7 - Palco, Bridge, Broadcast, Integração, Produção, Recepção, Som) ou cabeçalhos/totais (Total, Quant, Geral). Responda APENAS com um array JSON dos ÍNDICES (inteiros) dos itens que NÃO são nome de pessoa. Sem texto extra. Exemplo: [0,3,7]. Se todos forem pessoas, responda [].',
        messages: [{ role: 'user', content: lista }],
      });
      const txt = (msg?.content?.[0]?.text || '').trim();
      const m = txt.match(/\[[\d,\s]*\]/);
      if (m) {
        const idxs = JSON.parse(m[0]);
        for (const i of idxs) {
          const nm = restantes[i];
          if (nm) skip.add(norm(nm));
        }
      }
    } catch (e) {
      console.warn('[volNomeFiltro] IA:', e.message);
    }
  }

  return skip;
}

module.exports = { nomesNaoPessoa };
