// Análise de pedidos de oração com IA (Claude Haiku).
// Classifica cada pedido em UM tema (pra gerar insights agregados) + um resumo
// curto e respeitoso. Best-effort: sem ANTHROPIC_API_KEY ou erro → null.
const Anthropic = require('@anthropic-ai/sdk');
const MODEL = 'claude-haiku-4-5-20251001';

// Catálogo fixo de temas (slug → rótulo) · base da agregação de insights.
const CATEGORIAS = {
  saude: 'Saúde',
  familia: 'Família',
  casamento: 'Casamento/Relacionamento',
  filhos: 'Filhos',
  financeiro: 'Trabalho/Financeiro',
  espiritual: 'Vida espiritual',
  emocional: 'Emocional/Ansiedade',
  luto: 'Luto',
  gratidao: 'Gratidão/Louvor',
  vicios: 'Vícios',
  outros: 'Outros',
};
const SLUGS = Object.keys(CATEGORIAS);

const SYSTEM = `Você classifica pedidos de oração de uma igreja para gerar estatísticas pastorais.
Dado o texto do pedido, responda APENAS um JSON (sem markdown) no formato:
{"categoria":"<slug>","resumo":"<frase curta e respeitosa, até 80 caracteres>"}
A "categoria" DEVE ser exatamente um destes slugs: ${SLUGS.join(', ')}.
Escolha o tema predominante. Se não encaixar, use "outros". O resumo é uma síntese
neutra do pedido (não invente detalhes, não julgue, não exponha além do que foi dito).`;

// Retorna { categoria, resumo } ou null.
async function analisarOracao(texto) {
  const t = String(texto || '').trim();
  if (!t) return null;
  if (!process.env.ANTHROPIC_API_KEY) return null;
  try {
    const client = new Anthropic();
    const msg = await client.messages.create({
      model: MODEL,
      max_tokens: 120,
      system: SYSTEM,
      messages: [{ role: 'user', content: `Pedido de oração: "${t.slice(0, 1500)}"` }],
    });
    const raw = (msg?.content?.[0]?.text || '').trim()
      .replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
    const p = JSON.parse(raw);
    const categoria = SLUGS.includes(p.categoria) ? p.categoria : 'outros';
    const resumo = String(p.resumo || '').trim().slice(0, 120) || null;
    return { categoria, resumo, analisado_em: new Date().toISOString() };
  } catch (e) {
    console.warn('[oracaoAnalise]', e.message);
    return null;
  }
}

module.exports = { analisarOracao, CATEGORIAS, SLUGS };
