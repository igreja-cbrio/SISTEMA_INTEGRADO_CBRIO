// ============================================================================
// Grupos · console de ENVIOS (Marcos 2026-07-23)
//
// Kill-switch central dos envios AUTOMÁTICOS (cron) + resolução de audiência e
// disparo MANUAL (por líder / bairro / rede / todos) da coordenação.
//
// Barreiras (após o susto dos envios proativos):
//  - `enviosAutomaticosAtivos()` gateia os crons proativos. Default SEGURO
//    (false) quando a coluna não existe/erro — nada dispara sozinho.
//  - Envio manual sempre passa por prévia + confirmação na aba Envios; respeita
//    o opt-out `whatsapp_lideres.recebe_lembretes` (corrige a lacuna do
//    renovacao/disparar, que lia lider_id direto).
//  - Só TEMPLATE aprovado (via fila whatsapp_envios) — nada de texto livre
//    proativo (o que a Meta bloqueava).
// ============================================================================
const { supabase } = require('../utils/supabase');
const { montarEnvioFrequencia, montarEnvioMaterial, montarEnvioAbertura, rotuloMes } = require('./gruposWhatsapp');
const { enfileirarLote } = require('./whatsappFila');
// Config dos interruptores vive no módulo leaf (sem require circular).
const { bloqueioTotalAtivo } = require('./gruposEnviosConfig');

const soDigitos = (t) => String(t || '').replace(/\D/g, '');
const tel8 = (t) => soDigitos(t).slice(-8); // chave robusta a formatação/DDI/9

// ── Temporada ativa (base do universo de grupos) ────────────────────────────
async function temporadaAtiva() {
  const { data } = await supabase.from('mem_temporadas')
    .select('id, label').eq('ativa', true).maybeSingle();
  return data || null;
}

// ── Resolve os grupos da audiência (só ATIVOS da temporada ativa) ───────────
// audiencia = { tipo: 'lider'|'bairro'|'rede'|'todos', valor }
//   lider → valor = grupo_id · bairro → valor = nome do bairro · rede → rede_id
async function resolverGruposAudiencia(audiencia) {
  const temp = await temporadaAtiva();
  if (!temp) return { erro: 'Nenhuma temporada ativa.' };
  let q = supabase.from('mem_grupos')
    .select('id, nome, lider_id, dia_semana, horario, recorrencia, bairro, rede_id')
    .eq('temporada', temp.id).eq('ativo', true).is('deleted_at', null);
  const a = audiencia || {};
  if (a.tipo === 'lider') q = q.eq('id', a.valor);
  else if (a.tipo === 'bairro') q = q.eq('bairro', a.valor);
  else if (a.tipo === 'rede') q = q.eq('rede_id', a.valor);
  // 'todos' → sem filtro extra
  const { data: grupos, error } = await q.limit(2000);
  if (error) return { erro: error.message };
  return { temporada: temp, grupos: grupos || [] };
}

// Constrói a lista de destinatários + exclusões (respeitando opt-out e roster).
// exigirRoster: a chamada de frequência só faz sentido em grupo COM roster; o
// convite de abertura vai pra TODO líder (inclusive de grupo ainda vazio, pra
// as pessoas se inscreverem) → chama com { exigirRoster: false }.
async function montarDestinatariosFrequencia(audiencia, { exigirRoster = true } = {}) {
  const r = await resolverGruposAudiencia(audiencia);
  if (r.erro) return r;
  const { temporada, grupos } = r;
  if (!grupos.length) return { temporada, incluidos: [], excluidos: {}, total: 0 };

  // Líderes (nome/telefone) em lotes ≤200
  const liderIds = [...new Set(grupos.map(g => g.lider_id).filter(Boolean))];
  const lideres = new Map();
  for (let i = 0; i < liderIds.length; i += 200) {
    const { data } = await supabase.from('mem_membros')
      .select('id, nome, telefone').in('id', liderIds.slice(i, i + 200)).is('deleted_at', null);
    (data || []).forEach(m => lideres.set(m.id, m));
  }
  // Opt-out: telefones de whatsapp_lideres com recebe_lembretes=false
  const { data: optouts } = await supabase.from('whatsapp_lideres')
    .select('telefone, recebe_lembretes').is('deleted_at', null).eq('recebe_lembretes', false);
  const optOutSet = new Set((optouts || []).map(o => tel8(o.telefone)).filter(Boolean));
  // Roster ativo por grupo (paginado) · só quando a audiência exige roster
  const comRoster = new Set();
  if (exigirRoster) {
    for (let off = 0; ; off += 1000) {
      const { data: pag } = await supabase.from('mem_grupo_membros')
        .select('grupo_id').is('saiu_em', null).is('deleted_at', null).order('id').range(off, off + 999);
      (pag || []).forEach(v => comRoster.add(v.grupo_id));
      if (!pag || pag.length < 1000) break;
    }
  }

  const incluidos = [];
  const excluidos = { sem_lider: 0, sem_telefone: 0, opt_out: 0, sem_roster: 0 };
  for (const g of grupos) {
    if (!g.lider_id) { excluidos.sem_lider++; continue; }
    const lider = lideres.get(g.lider_id);
    if (!lider || soDigitos(lider.telefone).length < 10) { excluidos.sem_telefone++; continue; }
    if (optOutSet.has(tel8(lider.telefone))) { excluidos.opt_out++; continue; }
    if (exigirRoster && !comRoster.has(g.id)) { excluidos.sem_roster++; continue; }
    incluidos.push({ grupo: g, lider });
  }
  return { temporada, incluidos, excluidos, total: incluidos.length };
}

// Prévia (não envia): contagem + exemplo renderizado + quem não recebe.
async function previewFrequencia(audiencia) {
  const r = await montarDestinatariosFrequencia(audiencia);
  if (r.erro) return r;
  const mes = new Date().toISOString().slice(0, 7);
  const primeiro = r.incluidos[0];
  let exemplo = null;
  if (primeiro) {
    const nome = (primeiro.lider.nome || '').trim().split(/\s+/)[0] || 'líder';
    exemplo = {
      lider: primeiro.lider.nome,
      grupo: primeiro.grupo.nome,
      texto: `Oi, ${nome}! Chegou a hora da chamada de ${rotuloMes(mes)} do grupo ${primeiro.grupo.nome}. `
        + `É só abrir o link e marcar quem participou. (via template grupos_frequencia_mes)`,
    };
  }
  return {
    total: r.total,
    mes: rotuloMes(mes),
    exemplo,
    excluidos: r.excluidos,
    excluidos_total: Object.values(r.excluidos).reduce((a, b) => a + b, 0),
  };
}

// Disparo real (manual · via fila/template · respeita opt-out/roster).
async function dispararFrequencia(audiencia) {
  // Bloqueio geral vence até o manual (garantia 100% · Marcos 2026-07-23).
  if (await bloqueioTotalAtivo()) return { erro: 'Envios de grupos estão BLOQUEADOS (bloqueio geral ligado). Desligue na aba Envios pra poder disparar.' };
  const r = await montarDestinatariosFrequencia(audiencia);
  if (r.erro) return r;
  const mes = new Date().toISOString().slice(0, 7);
  const envios = [];
  let semTemplate = 0;
  for (const { grupo, lider } of r.incluidos) {
    const m = montarEnvioFrequencia({ grupo, lider, mes });
    if (m.erro) { semTemplate++; continue; } // ex.: WhatsApp desligado
    envios.push(m.envio);
  }
  const lote = envios.length ? await enfileirarLote(envios) : { queued: 0 };
  return { enfileirados: lote.queued, destinatarios: r.total, excluidos: r.excluidos, falhou_montar: semTemplate };
}

// ── MATERIAL (mesma audiência da frequência · anexo de arquivo) ─────────────
// Prévia: quem receberia (idêntica à da frequência · mesmo público de líderes).
async function previewMaterial(audiencia) {
  const r = await montarDestinatariosFrequencia(audiencia);
  if (r.erro) return r;
  const primeiro = r.incluidos[0];
  let exemplo = null;
  if (primeiro) {
    const nome = (primeiro.lider.nome || '').trim().split(/\s+/)[0] || 'líder';
    exemplo = {
      lider: primeiro.lider.nome,
      grupo: primeiro.grupo.nome,
      texto: `Oi, ${nome}! Segue o material do grupo ${primeiro.grupo.nome}: <link do arquivo>. `
        + `(via template aprovado — precisa do template de material na Meta pra enviar de verdade)`,
    };
  }
  return {
    total: r.total,
    exemplo,
    excluidos: r.excluidos,
    excluidos_total: Object.values(r.excluidos).reduce((a, b) => a + b, 0),
  };
}

// Disparo do material (manual · via fila/template · respeita opt-out/roster/bloqueio).
async function dispararMaterial(audiencia, { link, titulo }) {
  if (await bloqueioTotalAtivo()) return { erro: 'Envios de grupos estão BLOQUEADOS (bloqueio geral ligado). Desligue na aba Envios pra poder enviar.' };
  const r = await montarDestinatariosFrequencia(audiencia);
  if (r.erro) return r;
  const envios = [];
  let semTemplate = 0;
  for (const { lider } of r.incluidos) {
    const m = montarEnvioMaterial({ lider, link, titulo });
    if (m.erro) { if (m.erro === 'sem_template') semTemplate++; continue; }
    envios.push(m.envio);
  }
  const lote = envios.length ? await enfileirarLote(envios) : { queued: 0 };
  return {
    enfileirados: lote.queued, destinatarios: r.total, excluidos: r.excluidos,
    // Sem template aprovado na Meta, nada é enfileirado — sinaliza pro front.
    motivo: (!envios.length && semTemplate) ? 'template_material_nao_configurado' : null,
  };
}

// ── ABERTURA DE INSCRIÇÕES (convite pros líderes · Marcos 2026-07-24) ────────
// Vai pra TODO líder de grupo ativo (não exige roster — grupo vazio também quer
// gente). O líder encaminha o link no WhatsApp do próprio grupo.
async function previewAbertura(audiencia) {
  const r = await montarDestinatariosFrequencia(audiencia, { exigirRoster: false });
  if (r.erro) return r;
  const primeiro = r.incluidos[0];
  let exemplo = null;
  if (primeiro) {
    const nome = (primeiro.lider.nome || '').trim().split(/\s+/)[0] || 'líder';
    exemplo = {
      lider: primeiro.lider.nome,
      grupo: primeiro.grupo.nome,
      texto: `Oi, ${nome}! As inscrições da nova temporada dos grupos de conexão já estão abertas. `
        + `É só encaminhar no WhatsApp do seu grupo o convite com o link cbrio.org/inscricao-grupos. `
        + `(via template abertura_grupos_convite_lider)`,
    };
  }
  return {
    total: r.total,
    exemplo,
    excluidos: r.excluidos,
    excluidos_total: Object.values(r.excluidos).reduce((a, b) => a + b, 0),
  };
}

async function dispararAbertura(audiencia) {
  if (await bloqueioTotalAtivo()) return { erro: 'Envios de grupos estão BLOQUEADOS (bloqueio geral ligado). Desligue na aba Envios pra poder enviar.' };
  const r = await montarDestinatariosFrequencia(audiencia, { exigirRoster: false });
  if (r.erro) return r;
  const envios = [];
  let semTemplate = 0;
  for (const { lider } of r.incluidos) {
    const m = montarEnvioAbertura({ lider });
    if (m.erro) { semTemplate++; continue; }
    envios.push(m.envio);
  }
  const lote = envios.length ? await enfileirarLote(envios) : { queued: 0 };
  return { enfileirados: lote.queued, destinatarios: r.total, excluidos: r.excluidos, falhou_montar: semTemplate };
}

module.exports = {
  previewFrequencia,
  dispararFrequencia,
  previewMaterial,
  dispararMaterial,
  previewAbertura,
  dispararAbertura,
  montarDestinatariosFrequencia,
};
