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
const { montarEnvioFrequencia, montarEnvioMaterial, montarEnvioAbertura, montarEnvioConfira, rotuloMes } = require('./gruposWhatsapp');
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
  // Roster ativo por grupo (paginado) · só quando a audiência exige roster.
  // ⚠️ Map de Set de membro_id (não contador de LINHAS): a régua da casa é
  // participações × PESSOAS (CLAUDE.md 2026-07-23) e a tela do líder dedupa por
  // membro_id. Como a UNIQUE de vínculo ativo foi dropada (multi-grupo real),
  // contar linhas diria "são 12 pessoas" no WhatsApp e mostraria 10 na tela.
  // `.has()` segue funcionando igual pros chamadores antigos.
  const comRoster = new Map();
  if (exigirRoster) {
    for (let off = 0; ; off += 1000) {
      const { data: pag } = await supabase.from('mem_grupo_membros')
        .select('grupo_id, membro_id').is('saiu_em', null).is('deleted_at', null).order('id').range(off, off + 999);
      (pag || []).forEach(v => {
        if (!comRoster.has(v.grupo_id)) comRoster.set(v.grupo_id, new Set());
        if (v.membro_id) comRoster.get(v.grupo_id).add(v.membro_id);
      });
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
    // PESSOAS distintas, não linhas de vínculo (é o número que o líder vê na tela).
    incluidos.push({ grupo: g, lider, roster_count: comRoster.get(g.id)?.size || 0 });
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

// ── CONFIRA A LISTA DO SEU GRUPO (Marcos 2026-07-31) ────────────────────────
// 3º fluxo do líder: ele abre o link, vê a lista ATUAL toda marcada e DESMARCA
// quem não faz mais parte. Disparo SEMPRE manual (lei de 20/07). Exige roster —
// grupo sem participante não tem lista pra conferir.
//
// ⚠️ A tabela mem_grupo_conferencias é do fluxo NOVO (migration 20260731120000).
// Sem ela o PostgREST recusa a query (lição `parcelas_max`) → devolvemos
// { erro, sem_migration } e a rota responde 503 com aviso claro. Os fluxos
// existentes (frequência/material/abertura/renovação) não tocam essa tabela,
// então NÃO piscam sem a migration.
const RE_SCHEMA_AUSENTE_CONF = /(does not exist|could not find|schema cache|42703|42P01|PGRST20[24])/i;
function schemaAusenteConf(e) {
  return RE_SCHEMA_AUSENTE_CONF.test(`${e?.code || ''} ${e?.message || ''} ${e?.details || ''}`);
}
const AVISO_CONF_SEM_MIGRATION = 'A conferência da lista precisa da migration 20260731120000 aplicada no banco. Nada foi enviado.';

// Última conferência (maior rodada) por grupo, entre os ids informados.
async function ultimasConferencias(grupoIds) {
  const porGrupo = new Map();
  // ⚠️ PAGINADO de verdade (padrão do repo · não trocar por .limit()): são N
  // RODADAS por grupo e o `order('rodada')` é CROSS-GROUP — num truncamento em
  // 1000 linhas quem cai fora é justamente o grupo que só tem rodada 1, ele
  // seria classificado como 'nova', o INSERT com rodada 1 bateria 23505 contra
  // o UNIQUE parcial e o líder NUNCA receberia (erro engolido em erros.linha).
  for (let i = 0; i < grupoIds.length; i += 150) {
    const lote = grupoIds.slice(i, i + 150);
    for (let off = 0; ; off += 1000) {
      const { data, error } = await supabase.from('mem_grupo_conferencias')
        .select('id, grupo_id, rodada, status, token_geracao, enviado_em, ultima_resposta_em, mantidos_count, removidos_count, roster_total, observacao, triado_em')
        .in('grupo_id', lote).is('deleted_at', null)
        .order('grupo_id').order('rodada', { ascending: false })
        .range(off, off + 999);
      if (error) throw error;
      for (const c of (data || [])) {
        const atual = porGrupo.get(c.grupo_id);
        if (!atual || (c.rodada || 1) > (atual.rodada || 1)) porGrupo.set(c.grupo_id, c);
      }
      if (!data || data.length < 1000) break;
    }
  }
  return porGrupo;
}

// Classifica cada destinatário: 'nova' (nunca conferiu) · 'reenvio' (mandada e
// sem resposta) · 'ja_respondeu' (pulado, salvo nova_rodada).
function classificarConfira(incluidos, porGrupo, { novaRodada = false } = {}) {
  const agora = Date.now();
  const alvos = [];
  const pulados = { ja_respondeu: 0, enviada_ha_pouco: 0 };
  for (const item of incluidos) {
    const c = porGrupo.get(item.grupo.id) || null;
    if (!c) { alvos.push({ ...item, conf: null, motivo: 'nova' }); continue; }
    if (c.status !== 'enviada') {
      if (!novaRodada) { pulados.ja_respondeu++; continue; }
      alvos.push({ ...item, conf: c, motivo: 'nova_rodada' });
      continue;
    }
    // Anti-duplo-clique: mandada há menos de 10 min não reenvia.
    if (c.enviado_em && (agora - new Date(c.enviado_em).getTime()) < 10 * 60 * 1000) {
      pulados.enviada_ha_pouco++; continue;
    }
    alvos.push({ ...item, conf: c, motivo: 'reenvio' });
  }
  return { alvos, pulados };
}

async function previewConfira(audiencia, { nova_rodada = false } = {}) {
  const r = await montarDestinatariosFrequencia(audiencia);
  if (r.erro) return r;
  if (!r.incluidos.length) {
    return { total: 0, exemplo: null, excluidos: r.excluidos, excluidos_total: Object.values(r.excluidos || {}).reduce((a, b) => a + b, 0), pulados: { ja_respondeu: 0, enviada_ha_pouco: 0 } };
  }
  let porGrupo;
  try {
    porGrupo = await ultimasConferencias(r.incluidos.map(i => i.grupo.id));
  } catch (e) {
    if (schemaAusenteConf(e)) return { erro: AVISO_CONF_SEM_MIGRATION, sem_migration: true };
    throw e;
  }
  const { alvos, pulados } = classificarConfira(r.incluidos, porGrupo, { novaRodada: nova_rodada });
  const primeiro = alvos[0];
  let exemplo = null;
  if (primeiro) {
    const nome = (primeiro.lider.nome || '').trim().split(/\s+/)[0] || 'líder';
    exemplo = {
      lider: primeiro.lider.nome,
      grupo: primeiro.grupo.nome,
      texto: `Oi, ${nome}! Dá uma olhada na lista do grupo ${primeiro.grupo.nome}: são ${primeiro.roster_count} pessoa(s) hoje. `
        + `Abra o link e desmarque quem não faz mais parte. (via template grupos_confira_lista)`,
    };
  }
  return {
    total: alvos.length,
    reenvios: alvos.filter(a => a.motivo === 'reenvio').length,
    novas: alvos.filter(a => a.motivo === 'nova').length,
    novas_rodadas: alvos.filter(a => a.motivo === 'nova_rodada').length,
    exemplo,
    excluidos: r.excluidos,
    excluidos_total: Object.values(r.excluidos || {}).reduce((a, b) => a + b, 0),
    pulados,
  };
}

// Disparo real (manual · template/fila · respeita opt-out/roster/bloqueio).
// Cria a linha da conferência (ou incrementa token_geracao no reenvio, matando
// o link antigo) e ENFILEIRA — a fila horária entrega com retry/backoff.
async function dispararConfira(audiencia, { nova_rodada = false } = {}) {
  if (await bloqueioTotalAtivo()) return { erro: 'Envios de grupos estão BLOQUEADOS (bloqueio geral ligado). Desligue na aba Envios pra poder enviar.' };
  const r = await montarDestinatariosFrequencia(audiencia);
  if (r.erro) return r;
  if (!r.incluidos.length) return { enfileirados: 0, destinatarios: 0, excluidos: r.excluidos, pulados: { ja_respondeu: 0, enviada_ha_pouco: 0 } };

  let porGrupo;
  try {
    porGrupo = await ultimasConferencias(r.incluidos.map(i => i.grupo.id));
  } catch (e) {
    if (schemaAusenteConf(e)) return { erro: AVISO_CONF_SEM_MIGRATION, sem_migration: true };
    throw e;
  }
  const { alvos, pulados } = classificarConfira(r.incluidos, porGrupo, { novaRodada: nova_rodada });

  const agoraIso = new Date().toISOString();
  const envios = [];
  const erros = { linha: 0, montar: 0 };
  for (const { grupo, lider, roster_count, conf, motivo } of alvos) {
    let confId = null;
    let geracao = 1;
    try {
      if (motivo === 'reenvio') {
        geracao = (conf.token_geracao || 1) + 1;
        const { error } = await supabase.from('mem_grupo_conferencias')
          .update({
            token_geracao: geracao,
            lider_membro_id: grupo.lider_id, lider_nome: lider.nome || null, lider_telefone: lider.telefone || null,
            enviado_em: agoraIso, updated_at: agoraIso,
          }).eq('id', conf.id);
        if (error) throw error;
        confId = conf.id;
      } else {
        // ⚠️ RODADA NOVA MATA O LINK DA ANTERIOR (token_geracao+1 na linha
        // antiga · o mecanismo de revogação que já existe). Sem isso o líder
        // podia clicar na mensagem VELHA e remover gente gravando o
        // conferencia_id da rodada 1 — o painel (que soma só a última rodada)
        // não contaria essas saídas e mostraria a rodada 2 como "não
        // respondeu": a coordenação decidiria sobre um painel que subestima o
        // que aconteceu. Feito ANTES do insert: se falhar, não abrimos rodada
        // nova com dois links vivos.
        if (motivo === 'nova_rodada') {
          const { error: eVelha } = await supabase.from('mem_grupo_conferencias')
            .update({ token_geracao: (conf.token_geracao || 1) + 1, updated_at: agoraIso })
            .eq('id', conf.id);
          if (eVelha) throw eVelha;
        }
        const { data: nova, error } = await supabase.from('mem_grupo_conferencias')
          .insert({
            grupo_id: grupo.id,
            temporada_id: r.temporada?.id || null,
            rodada: motivo === 'nova_rodada' ? (conf.rodada || 1) + 1 : 1,
            lider_membro_id: grupo.lider_id, lider_nome: lider.nome || null, lider_telefone: lider.telefone || null,
            status: 'enviada', token_geracao: 1, enviado_em: agoraIso,
          }).select('id').single();
        if (error) throw error;
        confId = nova?.id || null;
      }
    } catch (e) {
      if (schemaAusenteConf(e)) return { erro: AVISO_CONF_SEM_MIGRATION, sem_migration: true };
      console.error('[grupos confira] linha não criada:', e.message);
      erros.linha++; continue;
    }
    if (!confId) { erros.linha++; continue; }

    const m = montarEnvioConfira({ grupo, lider, conferenciaId: confId, geracao, qtd: roster_count });
    if (m.erro) { erros.montar++; continue; }
    envios.push(m.envio);
  }

  const lote = envios.length ? await enfileirarLote(envios) : { queued: 0 };
  return {
    enfileirados: lote.queued, destinatarios: alvos.length,
    excluidos: r.excluidos, pulados, erros,
  };
}

module.exports = {
  previewFrequencia,
  dispararFrequencia,
  previewMaterial,
  dispararMaterial,
  previewAbertura,
  dispararAbertura,
  previewConfira,
  dispararConfira,
  montarDestinatariosFrequencia,
  // Exportados pro painel de triagem (grupos.js) reusar a mesma leitura.
  ultimasConferencias,
  schemaAusenteConf,
  AVISO_CONF_SEM_MIGRATION,
};
