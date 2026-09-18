// =====================================================================
// Planejamento Anual · Insights de IA (2026-09-02)
// =====================================================================
// Alimenta a aba "Insights de IA" — SOMENTE VISUALIZAÇÃO para a
// diretoria/Pastor presidente. Este arquivo nunca grava nada em
// plan_propostas nem em tabela nenhuma; é 100% leitura + análise.
//
// Dois pedaços, com confiabilidade bem diferente:
// - Conflitos de data/espaço: a MESMA régua pura e determinística de
//   planejamentoAnualRegras.js (detectarConflitos/aplicarAceites) — não
//   depende de IA, nunca falha por causa dela.
// - Propostas parecidas + observações: pede ao modelo (Claude Haiku,
//   mesmo padrão de sexoCompletar.js/npsService.js). Best-effort: se a
//   IA falhar ou a chave não estiver configurada, os conflitos acima
//   continuam de pé e a resposta declara `ia.disponivel = false` — erro
//   nunca se disfarça de "nada encontrado".
// =====================================================================

const Anthropic = require('@anthropic-ai/sdk');
const { supabase } = require('../utils/supabase');
const PA = require('./planejamentoAnualRegras');

function clienteAnthropic() {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('IA não configurada neste ambiente');
  return new Anthropic();
}

const TETO_PROPOSTAS_IA = 200; // segurança de prompt/tempo — um ciclo real tem dezenas
const TRUNCAR_DESCRICAO = 320;

const PROMPT = `Você analisa as propostas de um ciclo de planejamento anual da CBRio (igreja) para ajudar a diretoria a revisar o conjunto antes da decisão do Pastor presidente.

Você recebe uma lista JSON de propostas, cada uma com id, nome, área, natureza (evento/projeto/rotina), líder, quando acontece, local e uma descrição.

Responda SOMENTE este JSON, sem texto em volta e sem quebras de linha fora das strings:
{"grupos_similares":[{"proposta_ids":["..."],"motivo":"..."}],"observacoes":["..."]}

REGRAS:
- "grupos_similares": propostas que parecem cobrir o mesmo evento, projeto, público-alvo ou objetivo, candidatas a serem mescladas ou a terem os líderes conversando entre si antes da decisão. Use somente ids que vieram na lista, nunca invente. Cada grupo tem 2 ou mais ids. "motivo" é uma frase curta e direta (times parecidos, mesmo público, mesmo objetivo, mesma época). Sem nenhuma parecida, devolva um array vazio.
- "observacoes": no máximo 5 frases curtas com outros pontos que valham a atenção da diretoria (por exemplo: várias propostas da mesma área concentradas no mesmo período, proposta com objetivo pouco claro, público-alvo sobreposto entre áreas diferentes). Se o MESMO problema aparecer em várias propostas, junte tudo numa única observação citando as propostas envolvidas, em vez de repetir uma frase quase igual para cada uma. Não repita aqui conflitos de agenda ou espaço, que já são calculados à parte, sem IA. Sem nada relevante, devolva um array vazio.
- Escreva em português direto, como alguém anotando um ponto numa reunião: frases curtas, verbo direto ("defina a data" em vez de "recomenda-se definir a data"). Sem travessão. Sem tom de relatório corporativo.
- Nunca opine sobre mérito, aprovação, nota ou orçamento: isso é decisão exclusiva da diretoria e do Pastor presidente, não sua.`;

function propostaParaPrompt(p, liderNome, localNome) {
  return {
    id: p.id,
    nome: p.nome,
    area: p.area,
    natureza: p.natureza,
    lider: liderNome || null,
    quando: p.data_inicio ? `${p.data_inicio}${p.precisao_inicio === 'mes' ? ' (só o mês é certo)' : ''}` : null,
    local: localNome || null,
    publico_alvo: p.publico_alvo || null,
    descricao: (p.descricao || '').slice(0, TRUNCAR_DESCRICAO) || null,
  };
}

async function nomesDeLideres(ids) {
  const unicos = [...new Set((ids || []).filter(Boolean))];
  if (!unicos.length) return {};
  const { data } = await supabase.from('profiles').select('id, name').in('id', unicos);
  const porId = {};
  (data || []).forEach((p) => { porId[p.id] = p.name; });
  return porId;
}

async function gerarSimilaridade(propostas, { liderNomeById, locaisById }) {
  if (!propostas.length) return { disponivel: true, grupos_similares: [], observacoes: [] };

  let client;
  try {
    client = clienteAnthropic();
  } catch (e) {
    return { disponivel: false, motivo: e.message, grupos_similares: [], observacoes: [] };
  }

  const consideradas = propostas.slice(0, TETO_PROPOSTAS_IA);
  const lista = consideradas.map((p) => propostaParaPrompt(p, liderNomeById[p.lider_id], locaisById[p.local_id]?.nome));

  let texto = '';
  try {
    const r = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2000,
      system: PROMPT,
      messages: [{ role: 'user', content: JSON.stringify(lista) }],
    });
    texto = (r.content || []).map((c) => c.text || '').join('');
  } catch (e) {
    console.error('[planejamentoAnualInsights] chamada à IA falhou:', e.message);
    return { disponivel: false, motivo: 'a IA não respondeu, tente atualizar em instantes', grupos_similares: [], observacoes: [] };
  }

  let json;
  try {
    json = JSON.parse(texto.replace(/```json|```/g, '').trim());
  } catch (e) {
    console.error('[planejamentoAnualInsights] resposta da IA não parseou:', e.message, texto.slice(0, 300));
    return { disponivel: false, motivo: 'a IA devolveu uma resposta em formato inesperado', grupos_similares: [], observacoes: [] };
  }

  const porId = {};
  consideradas.forEach((p) => { porId[p.id] = p; });
  const idsValidos = new Set(consideradas.map((p) => p.id));

  const grupos = (Array.isArray(json.grupos_similares) ? json.grupos_similares : [])
    .map((g) => {
      const ids = [...new Set(Array.isArray(g?.proposta_ids) ? g.proposta_ids.filter((id) => idsValidos.has(id)) : [])];
      return {
        propostas: ids.map((id) => ({ id, nome: porId[id].nome, area: porId[id].area })),
        motivo: String(g?.motivo || '').slice(0, 400),
      };
    })
    .filter((g) => g.propostas.length >= 2);

  const observacoes = (Array.isArray(json.observacoes) ? json.observacoes : [])
    .map((o) => String(o || '').trim().slice(0, 400))
    .filter(Boolean)
    .slice(0, 5);

  return { disponivel: true, grupos_similares: grupos, observacoes };
}

/**
 * Monta os insights do ciclo a partir do contexto já carregado pela rota
 * (o mesmo `contextoCalendario` usado por /conflitos, /calendario e /travas
 * — reaproveita locaisById/propostas/aceites, sem duplicar consulta).
 */
async function montarInsights(ctx) {
  // Rascunho é privado/incompleto — fora da leitura da diretoria (mesma
  // régua de visibilidade de conteúdo do resto do módulo).
  const elegiveis = (ctx.propostas || []).filter((p) => p.estado !== 'rascunho');

  const conflitosBrutos = PA.aplicarAceites(PA.detectarConflitos(elegiveis, ctx.locaisById), ctx.aceites);
  const conflitos = conflitosBrutos.map((c) => ({
    proposta_a: { id: c.a.id, nome: c.a.nome, area: c.a.area },
    proposta_b: { id: c.b.id, nome: c.b.nome, area: c.b.area },
    tipo: c.tipo,
    firme: c.firme,
    aceito: Boolean(c.aceite),
  }));

  const liderNomeById = await nomesDeLideres(elegiveis.map((p) => p.lider_id));
  const ia = await gerarSimilaridade(elegiveis, { liderNomeById, locaisById: ctx.locaisById });

  return {
    propostas_consideradas: elegiveis.length,
    conflitos,
    ia,
  };
}

module.exports = { montarInsights };
