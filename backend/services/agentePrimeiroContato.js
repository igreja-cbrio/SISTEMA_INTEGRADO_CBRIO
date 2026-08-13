// ============================================================================
// Agente de Primeiro Contato (piloto · jornada do convertido)
// ============================================================================
// Detecta convertido novo SEM primeiro contato pastoral, resolve o LÍDER da
// área (nominal), rascunha uma mensagem de WhatsApp (Haiku) e enfileira em
// cui_primeiro_contato_fila pra o líder revisar e enviar em 1 toque (wa.me).
// MODO SEGURO: o agente NÃO envia nada sozinho. Tudo passa por revisão humana.
// ============================================================================

const Anthropic = require('@anthropic-ai/sdk');
const { supabase } = require('../utils/supabase');

// Mesma régua do cuidados.js: contato feito = status real OU primeiro_contato_em.
// ('numero_errado' conta como contato feito — a mensagem foi enviada, o número é
// que estava errado · Marcos 2026-07-01.) O helper contatoFoiFeito FALTAVA —
// o cron /cron/enfileirar quebrava com "contatoFoiFeito is not defined" todo
// dia desde 04/07: o agente nunca enfileirou nada em produção.
const CONTATO_FEITO_STATUS = new Set(['respondeu', 'atendido_respondido', 'nao_respondeu', 'nao_compareceu', 'nao_atendido', 'numero_errado']);
const contatoFoiFeito = (c) => !!c.primeiro_contato_em || CONTATO_FEITO_STATUS.has(c.primeiro_contato_status);
const AGENTE_VERSAO = 'primeiro-contato-v1';
const DIA = 86400000;

// Resolve o líder PRINCIPAL de uma área (usuario_areas.is_principal) → profile.
// Fallback: ninguém (fica sem responsável e a equipe de Cuidados assume).
async function resolverLiderArea(area) {
  if (!area) return null;
  // 'sede' não é área de culto com líder próprio → Cuidados assume (sem nominal).
  const { data } = await supabase
    .from('usuario_areas')
    .select('is_principal, usuario_id, areas!inner(nome), profiles:usuario_id(id, name)')
    .eq('is_principal', true)
    .ilike('areas.nome', area)
    .limit(1)
    .maybeSingle();
  if (data?.profiles) return { id: data.profiles.id, nome: data.profiles.name || null };
  return null;
}

// Rascunha as mensagens de 1º contato via Haiku (1 chamada, em lote). Copia
// fiel ao tom pastoral; NÃO inventa fatos. Retorna mapa { convertido_id: texto }.
async function rascunharMensagens(convertidos) {
  if (convertidos.length === 0) return {};
  if (!process.env.ANTHROPIC_API_KEY) {
    // Sem IA configurada: cai num rascunho-template (ainda útil pro 1 toque).
    const out = {};
    for (const c of convertidos) {
      const primeiro = (c.nome || '').trim().split(/\s+/)[0] || '';
      out[c.id] = `Oi, ${primeiro}! Tudo bem? Aqui é da CBRio 💙 Que alegria ter você com a gente! Queremos te dar as boas-vindas e entender como podemos te acompanhar nesse começo. Posso te ligar/conversar nesta semana?`;
    }
    return out;
  }
  const client = new Anthropic();
  const lista = convertidos.map((c, i) => `${i + 1}. id=${c.id} · nome="${c.nome}" · área=${c.area || 'sede'}`).join('\n');
  const systemPrompt = `Você é um pastor/líder acolhedor da Igreja CBRio escrevendo a PRIMEIRA mensagem de WhatsApp para alguém que tomou uma decisão de fé recentemente num culto. Tom: caloroso, pessoal, breve (2-4 frases), sem clichê religioso pesado, sem prometer nada específico. Objetivo: acolher, valorizar a decisão e abrir caminho para um contato/conversa nesta semana. Use o PRIMEIRO nome. NÃO invente fatos (data, evento, nome de pastor). Português do Brasil correto.`;
  const userPrompt = `Escreva uma mensagem de primeiro contato para cada pessoa abaixo. Retorne APENAS um JSON array (sem markdown), na ordem, no formato [{"id":"<id>","mensagem":"..."}]:\n\n${lista}`;
  try {
    const resp = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 4000,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    });
    const text = resp.content?.filter(b => b.type === 'text').map(b => b.text).join('') || '';
    const cleaned = text.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
    const arr = JSON.parse(cleaned);
    const out = {};
    for (const o of arr) if (o && o.id && o.mensagem) out[o.id] = String(o.mensagem).trim();
    return out;
  } catch (e) {
    console.error('[agente-primeiro-contato] rascunho IA falhou:', e.message);
    return {}; // sem rascunho; o item ainda entra na fila (líder escreve)
  }
}

// Enfileira novos convertidos sem contato. Idempotente (UNIQUE convertido_id +
// skip dos já enfileirados). Roda no cron diário de notificações.
async function enfileirarPrimeiroContato() {
  let count = 0;
  const desde = new Date(Date.now() - 30 * DIA).toISOString().slice(0, 10);

  const { data: convs } = await supabase
    .from('cui_convertidos')
    .select('id, nome, telefone, data_culto, area, primeiro_contato_em, primeiro_contato_status')
    .is('deleted_at', null)
    .gte('data_culto', desde);

  const candidatos = (convs || []).filter((c) => {
    if (contatoFoiFeito(c)) return false;
    const dias = Math.floor((Date.now() - new Date(c.data_culto + 'T12:00:00').getTime()) / DIA);
    return dias >= 1; // dá 1 dia antes de cobrar
  });
  if (candidatos.length === 0) return 0;

  // pula quem já está na fila (qualquer status != ignorado/expirado já resolvido)
  const { data: jaNaFila } = await supabase
    .from('cui_primeiro_contato_fila')
    .select('convertido_id')
    .is('deleted_at', null)
    .in('convertido_id', candidatos.map((c) => c.id));
  const existentes = new Set((jaNaFila || []).map((r) => r.convertido_id));
  const novos = candidatos.filter((c) => !existentes.has(c.id));
  if (novos.length === 0) return 0;

  // limita o lote por execução (custo IA + timeout)
  const lote = novos.slice(0, 15);
  const rascunhos = await rascunharMensagens(lote);

  // resolve líderes (cacheia por área)
  const lideresPorArea = {};
  for (const c of lote) {
    const area = c.area || null;
    if (area && !(area in lideresPorArea)) lideresPorArea[area] = await resolverLiderArea(area);
  }

  const prazo = new Date(Date.now() + 3 * DIA).toISOString().slice(0, 10);
  const rows = lote.map((c) => {
    const lider = c.area ? lideresPorArea[c.area] : null;
    return {
      convertido_id: c.id,
      area: c.area || null,
      responsavel_id: lider?.id || null,
      responsavel_nome: lider?.nome || null,
      mensagem_rascunho: rascunhos[c.id] || null,
      telefone: c.telefone || null,
      status: 'pendente',
      prazo,
      agente_versao: AGENTE_VERSAO,
    };
  });

  const { error } = await supabase.from('cui_primeiro_contato_fila').insert(rows);
  if (error) {
    // 23505 = corrida com outra execução; ignora
    if (error.code !== '23505') throw error;
  } else {
    count = rows.length;
  }
  return count;
}

module.exports = { enfileirarPrimeiroContato, resolverLiderArea, rascunharMensagens };
