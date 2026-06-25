// ============================================================================
// Agente Batismo/Next 90d (jornada do convertido)
// ============================================================================
// Detecta convertido chegando no prazo de 90 dias SEM batismo e/ou SEM Next,
// resolve o líder da área, rascunha um convite (Haiku) e enfileira em
// cui_batismo_next_fila pra revisão. MODO SEGURO: o agente NÃO envia — o líder
// revisa e envia em 1 toque. Reusa notificar(). Match por membro_id/cpf/nome.
// ============================================================================

const Anthropic = require('@anthropic-ai/sdk');
const { supabase } = require('../utils/supabase');

const DIA = 86400000;
const AGENTE_VERSAO = 'batismo-next-v1';
const JANELA_MIN = 55; // começa a convidar a partir de ~55 dias
const JANELA_MAX = 85; // até pouco antes dos 90 (depois vira "perdido o prazo")

const soDigitos = (s) => String(s || '').replace(/\D/g, '');
const chaveNome = (s) => String(s || '').trim().toLowerCase();

// Resolve o líder PRINCIPAL da área (usuario_areas.is_principal) → profile.
async function resolverLiderArea(area) {
  if (!area) return null;
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

// Marca quais convertidos JÁ têm batismo / Next (match por membro_id/cpf/nome).
async function jaTem(tabela, membroIds, cpfs, nomes) {
  const membro = new Set(), cpf = new Set(), nome = new Set();
  const qIn = async (col, vals, alvo, transform = (x) => x) => {
    const uniq = [...new Set(vals.filter(Boolean))];
    for (let i = 0; i < uniq.length; i += 200) {
      const chunk = uniq.slice(i, i + 200);
      if (chunk.length === 0) break;
      const { data } = await supabase.from(tabela).select(col).is('deleted_at', null).in(col, chunk);
      for (const r of data || []) if (r[col] != null) alvo.add(transform(r[col]));
    }
  };
  await qIn('membro_id', membroIds, membro);
  await qIn('cpf', cpfs, cpf, soDigitos);
  await qIn('nome', nomes, nome, chaveNome);
  return { membro, cpf, nome };
}

// Rascunha convites via Haiku (lote). Sem chave → template.
async function rascunhar(itens) {
  if (itens.length === 0) return {};
  if (!process.env.ANTHROPIC_API_KEY) {
    const out = {};
    for (const c of itens) {
      const primeiro = (c.nome || '').trim().split(/\s+/)[0] || '';
      const alvo = c.falta_batismo && c.falta_next ? 'o batismo e o NEXT' : c.falta_batismo ? 'o batismo' : 'o NEXT';
      out[c.id] = `Oi, ${primeiro}! Tudo bem? Aqui é da CBRio 💙 Que alegria te ver caminhando com a gente! Queria te convidar pra dar o próximo passo: ${alvo}. Posso te explicar como funciona?`;
    }
    return out;
  }
  const client = new Anthropic();
  const lista = itens.map((c, i) => `${i + 1}. id=${c.id} · nome="${c.nome}" · falta=${[c.falta_batismo && 'batismo', c.falta_next && 'next'].filter(Boolean).join('+')}`).join('\n');
  const systemPrompt = `Você é um líder acolhedor da Igreja CBRio escrevendo um convite por WhatsApp para alguém que se converteu há ~2 meses, convidando para o próximo passo (batismo e/ou o evento NEXT — o início da jornada na igreja). Tom: caloroso, pessoal, breve (2-4 frases), sem pressão. Use o PRIMEIRO nome. Convide só para o que falta (batismo, next, ou ambos). NÃO invente datas/horários. Português do Brasil correto.`;
  const userPrompt = `Escreva o convite de cada pessoa. Retorne APENAS um JSON array (sem markdown), na ordem, formato [{"id":"<id>","mensagem":"..."}]:\n\n${lista}`;
  try {
    const resp = await client.messages.create({
      model: 'claude-haiku-4-5-20251001', max_tokens: 4000,
      system: systemPrompt, messages: [{ role: 'user', content: userPrompt }],
    });
    const text = resp.content?.filter(b => b.type === 'text').map(b => b.text).join('') || '';
    const arr = JSON.parse(text.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim());
    const out = {};
    for (const o of arr) if (o && o.id && o.mensagem) out[o.id] = String(o.mensagem).trim();
    return out;
  } catch (e) {
    console.error('[agente-batismo-next] rascunho IA falhou:', e.message);
    return {};
  }
}

async function enfileirar() {
  const agora = Date.now();
  const ini = new Date(agora - JANELA_MAX * DIA).toISOString().slice(0, 10);
  const fim = new Date(agora - JANELA_MIN * DIA).toISOString().slice(0, 10);

  const { data: convs } = await supabase
    .from('cui_convertidos')
    .select('id, nome, cpf, telefone, membro_id, data_culto, area')
    .is('deleted_at', null)
    .gte('data_culto', ini)
    .lte('data_culto', fim);
  if (!convs || convs.length === 0) return 0;

  const membroIds = convs.map((c) => c.membro_id).filter(Boolean);
  const cpfs = convs.map((c) => c.cpf).filter(Boolean);
  const nomes = convs.map((c) => c.nome).filter(Boolean);

  const bat = await jaTem('batismo_inscricoes', membroIds, cpfs, nomes);
  const nxt = await jaTem('next_inscricoes', membroIds, cpfs, nomes);

  const matched = (c, sets) =>
    (c.membro_id && sets.membro.has(c.membro_id)) ||
    (c.cpf && sets.cpf.has(soDigitos(c.cpf))) ||
    (c.nome && sets.nome.has(chaveNome(c.nome)));

  const candidatos = convs
    .map((c) => ({ ...c, falta_batismo: !matched(c, bat), falta_next: !matched(c, nxt) }))
    .filter((c) => c.falta_batismo || c.falta_next);
  if (candidatos.length === 0) return 0;

  // pula quem já está na fila
  const { data: jaNaFila } = await supabase
    .from('cui_batismo_next_fila').select('convertido_id')
    .is('deleted_at', null).in('convertido_id', candidatos.map((c) => c.id));
  const existentes = new Set((jaNaFila || []).map((r) => r.convertido_id));
  const novos = candidatos.filter((c) => !existentes.has(c.id)).slice(0, 15);
  if (novos.length === 0) return 0;

  const rascunhos = await rascunhar(novos);
  const lideres = {};
  for (const c of novos) if (c.area && !(c.area in lideres)) lideres[c.area] = await resolverLiderArea(c.area);

  const prazoDate = new Date(agora + 7 * DIA).toISOString().slice(0, 10);
  const rows = novos.map((c) => {
    const lider = c.area ? lideres[c.area] : null;
    const dias = Math.floor((agora - new Date(c.data_culto + 'T12:00:00').getTime()) / DIA);
    return {
      convertido_id: c.id, area: c.area || null,
      responsavel_id: lider?.id || null, responsavel_nome: lider?.nome || null,
      falta_batismo: c.falta_batismo, falta_next: c.falta_next, dias,
      mensagem_rascunho: rascunhos[c.id] || null, telefone: c.telefone || null,
      status: 'pendente', prazo: prazoDate, agente_versao: AGENTE_VERSAO,
    };
  });

  const { error } = await supabase.from('cui_batismo_next_fila').insert(rows);
  if (error && error.code !== '23505') throw error;
  return error ? 0 : rows.length;
}

module.exports = { enfileirar, resolverLiderArea };
