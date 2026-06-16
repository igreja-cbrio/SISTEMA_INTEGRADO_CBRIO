// Vinculação assistida por IA da frequência de voluntários (nomes importados da
// planilha) com os perfis do sistema (vol_profiles).
//
// Estratégia:
//   1. Match EXATO por nome normalizado e único → confiança 'exata'.
//   2. Para o resto, gera candidatos por similaridade de tokens (primeiro/último
//      nome, sobreposição) e pede pra Haiku ESCOLHER entre eles (apelido, ordem
//      de nome, acento, abreviação) com um nível de confiança.
//   3. Sem candidato bom → 'nenhuma'.
//
// NUNCA vincula nada — só devolve sugestões pra revisão/aprovação humana.
const Anthropic = require('@anthropic-ai/sdk');
const MODEL = 'claude-haiku-4-5-20251001';

function norm(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/\s+/g, ' ').trim();
}
function tokens(s) {
  return norm(s).split(' ').filter(t => t.length > 1); // ignora iniciais soltas
}

// Similaridade 0-1 entre dois conjuntos de tokens, com peso pra 1º e último nome.
function similaridade(a, b) {
  if (!a.length || !b.length) return 0;
  const A = new Set(a), B = new Set(b);
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  const uni = new Set([...a, ...b]).size;
  let s = uni ? inter / uni : 0;
  if (a[0] === b[0]) s += 0.15;                                   // mesmo primeiro nome
  if (a[a.length - 1] === b[b.length - 1]) s += 0.15;             // mesmo último nome
  return s;
}

// nomes: [{ nome_norm, nome }]; perfis: [{ id, full_name }]
// retorna [{ nome_norm, nome, sugestao: {profile_id, full_name}|null, confianca, motivo }]
async function sugerirVinculos(nomes, perfis) {
  const perfisIdx = perfis.map(p => ({ id: p.id, full_name: p.full_name, toks: tokens(p.full_name), n: norm(p.full_name) }));

  // Index por nome normalizado pra detectar exatos
  const porNorm = new Map();
  for (const p of perfisIdx) {
    if (!porNorm.has(p.n)) porNorm.set(p.n, []);
    porNorm.get(p.n).push(p);
  }

  const resultado = [];
  const paraIA = []; // { idx, nome, candidatos: [{j, full_name}] }

  for (const nm of nomes) {
    const exatos = porNorm.get(norm(nm.nome_norm || nm.nome)) || [];
    if (exatos.length === 1) {
      resultado.push({ nome_norm: nm.nome_norm, nome: nm.nome, sugestao: { profile_id: exatos[0].id, full_name: exatos[0].full_name }, confianca: 'exata', motivo: 'Nome idêntico' });
      continue;
    }
    // candidatos por similaridade (inclui os exatos ambíguos)
    const nt = tokens(nm.nome);
    const ranked = perfisIdx
      .map(p => ({ p, s: similaridade(nt, p.toks) }))
      .filter(x => x.s >= 0.34)
      .sort((a, b) => b.s - a.s)
      .slice(0, 5);
    if (!ranked.length) {
      resultado.push({ nome_norm: nm.nome_norm, nome: nm.nome, sugestao: null, confianca: 'nenhuma', motivo: 'Sem candidato parecido' });
      continue;
    }
    const idx = resultado.length;
    resultado.push({ nome_norm: nm.nome_norm, nome: nm.nome, sugestao: null, confianca: 'baixa', motivo: '', _candidatos: ranked.map(r => r.p) });
    paraIA.push({ idx, nome: nm.nome, candidatos: ranked.map((r, j) => ({ j, full_name: r.p.full_name })) });
  }

  // IA escolhe entre os candidatos (em lotes)
  if (paraIA.length && process.env.ANTHROPIC_API_KEY) {
    const client = new Anthropic();
    for (let i = 0; i < paraIA.length; i += 40) {
      const lote = paraIA.slice(i, i + 40);
      const payload = lote.map((item, k) => ({
        i: k,
        nome: item.nome,
        candidatos: item.candidatos.map(c => ({ j: c.j, nome: c.full_name })),
      }));
      try {
        const msg = await client.messages.create({
          model: MODEL,
          max_tokens: 2000,
          system: 'Você vincula nomes de uma planilha de escala aos cadastros de voluntários de uma igreja. Para cada item, decida qual CANDIDATO é a MESMA pessoa do "nome", considerando apelidos, ordem de nome (primeiro/último trocados), acentos, abreviações e nomes do meio omitidos. Responda APENAS um array JSON, um objeto por item: {"i": <indice do item>, "j": <indice do candidato escolhido ou null se nenhum for claramente a mesma pessoa>, "confianca": "alta"|"media"|"baixa"}. Use "alta" só quando tiver certeza (ex.: mesmo nome com acento/ordem diferente). Sem texto fora do JSON.',
          messages: [{ role: 'user', content: JSON.stringify(payload) }],
        });
        const txt = (msg?.content?.[0]?.text || '').trim();
        const m = txt.match(/\[[\s\S]*\]/);
        if (m) {
          const arr = JSON.parse(m[0]);
          for (const dec of arr) {
            const item = lote[dec.i];
            if (!item) continue;
            const r = resultado[item.idx];
            if (dec.j === null || dec.j === undefined || !item.candidatos[dec.j]) {
              r.sugestao = null; r.confianca = 'nenhuma'; r.motivo = 'IA não achou correspondência clara';
            } else {
              const escolhido = r._candidatos[dec.j];
              r.sugestao = { profile_id: escolhido.id, full_name: escolhido.full_name };
              r.confianca = ['alta', 'media', 'baixa'].includes(dec.confianca) ? dec.confianca : 'media';
              r.motivo = 'Sugestão da IA';
            }
          }
        }
      } catch (e) {
        console.warn('[volVinculoIA] lote:', e.message);
      }
    }
  }

  // limpa campos internos
  for (const r of resultado) delete r._candidatos;
  // ordena: exata → alta → media → baixa → nenhuma
  const ordem = { exata: 0, alta: 1, media: 2, baixa: 3, nenhuma: 4 };
  resultado.sort((a, b) => (ordem[a.confianca] - ordem[b.confianca]) || a.nome.localeCompare(b.nome));
  return resultado;
}

module.exports = { sugerirVinculos };
