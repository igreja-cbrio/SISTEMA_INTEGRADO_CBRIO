/**
 * Cerebro CBRio — Sync reverso: ERP → vault Obsidian (SharePoint).
 *
 * Fluxo:
 * 1. Rotas POST/PUT chamam `enqueueSync(entityType, entityId, action)` após o insert/update.
 * 2. O cron `/api/cerebro/sync-erp` consome a fila via `processSyncFila(limit)`.
 * 3. Para cada item: busca dados frescos do Supabase, renderiza a nota com template
 *    determinístico, grava no vault via Microsoft Graph e atualiza o índice.
 *
 * Templates determinísticos (sem IA) — custo zero. Apenas documentos de mídia livre
 * continuam passando pelo Haiku (processador existente `cerebroProcessor.js`).
 */

const crypto = require('crypto');
const { supabase } = require('../utils/supabase');
const { getGraphToken } = require('./storageService');

const HUB_SITE_ID = 'infracbrio.sharepoint.com,04b50f10-ea32-40ba-84bd-44a3b38ee2a7,94fe6af6-f064-455d-afc5-67a377f5e82c';
const VAULT_LIBRARY_NAME = 'Cerebro CBRio';

// Mapa entity_type → pasta no vault (segue AGENTE-REGRAS.md do SharePoint).
const AREA_VAULT_BY_ENTITY = {
  membro:          '01-crm-pessoas/membros',
  'contribuicao-mes': '04-financas/contribuicoes',
  evento:          '02-eventos',
  projeto:         '03-projetos',
  voluntario:      '06-ministerios/voluntariado',
  acompanhamento:  '06-ministerios/cuidados',
  funcionario:     '08-administrativo/rh',
};

let _vaultDriveCache = null;
let _vaultDriveCacheAt = 0;
const VAULT_DRIVE_TTL_MS = 10 * 60 * 1000;

async function getVaultDriveId() {
  if (_vaultDriveCache && Date.now() - _vaultDriveCacheAt < VAULT_DRIVE_TTL_MS) return _vaultDriveCache;
  const token = await getGraphToken();
  const res = await fetch(`https://graph.microsoft.com/v1.0/sites/${HUB_SITE_ID}/drives`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  const vault = (data.value || []).find((d) => d.name === VAULT_LIBRARY_NAME);
  if (!vault) throw new Error(`Biblioteca "${VAULT_LIBRARY_NAME}" não encontrada no hub SharePoint`);
  _vaultDriveCache = vault.id;
  _vaultDriveCacheAt = Date.now();
  return vault.id;
}

// ─── Enfileiramento ────────────────────────────────────────────────────

/**
 * Enfileira uma entidade para ser materializada como nota no vault.
 * Nunca lança — se a tabela não existir, ou supabase falhar, apenas loga e segue.
 * Chamada segura para usar inline após `.insert().select().single()`.
 *
 * @param {string} entityType — 'membro' | 'evento' | 'projeto' | ...
 * @param {string|number} entityId — UUID ou id da linha
 * @param {'upsert'|'delete'} action
 * @param {object} payload — opcional, dados auxiliares (ex: nome pra log)
 */
async function enqueueSync(entityType, entityId, action = 'upsert', payload = null) {
  if (!entityType || !entityId) return;
  try {
    // Dedup: se já existe item pendente/processando para a mesma entidade, não enfileira de novo.
    const { data: existing } = await supabase
      .from('cerebro_sync_fila')
      .select('id')
      .eq('entity_type', entityType)
      .eq('entity_id', String(entityId))
      .in('status', ['pendente', 'processando'])
      .limit(1)
      .maybeSingle();

    if (existing) return;

    await supabase.from('cerebro_sync_fila').insert({
      entity_type: entityType,
      entity_id: String(entityId),
      action,
      payload,
    });
  } catch (e) {
    console.warn(`[CEREBRO SYNC] enqueue falhou (${entityType}:${entityId}):`, e.message);
  }
}

// ─── Processador da fila ───────────────────────────────────────────────

/**
 * Consome até `limit` itens pendentes da fila e sincroniza com o vault.
 * @returns {Promise<{processados: number, erros: number}>}
 */
async function processSyncFila(limit = 8) {
  // Reset de itens travados em "processando" há mais de 5 min.
  try {
    await supabase
      .from('cerebro_sync_fila')
      .update({ status: 'pendente' })
      .eq('status', 'processando')
      .lt('enfileirado_em', new Date(Date.now() - 5 * 60 * 1000).toISOString());
  } catch (_) { /* ignora — tabela pode não existir ainda */ }

  let pendentes;
  try {
    const { data } = await supabase
      .from('cerebro_sync_fila')
      .select('*')
      .eq('status', 'pendente')
      .order('enfileirado_em', { ascending: true })
      .limit(limit);
    pendentes = data || [];
  } catch (e) {
    console.warn('[CEREBRO SYNC] fila indisponível:', e.message);
    return { processados: 0, erros: 0 };
  }

  if (!pendentes.length) return { processados: 0, erros: 0 };

  let processados = 0;
  let erros = 0;

  for (const item of pendentes) {
    try {
      await supabase.from('cerebro_sync_fila')
        .update({ status: 'processando', tentativas: (item.tentativas || 0) + 1 })
        .eq('id', item.id);

      if (item.action === 'delete') {
        await deleteNote(item.entity_type, item.entity_id);
      } else {
        await upsertNoteForEntity(item.entity_type, item.entity_id);
      }

      await supabase.from('cerebro_sync_fila').update({
        status: 'concluido',
        processado_em: new Date().toISOString(),
        erro_mensagem: null,
      }).eq('id', item.id);

      processados++;
    } catch (e) {
      console.error(`[CEREBRO SYNC] erro em ${item.entity_type}:${item.entity_id}:`, e.message);
      erros++;
      await supabase.from('cerebro_sync_fila').update({
        status: 'erro',
        erro_mensagem: e.message.slice(0, 500),
        processado_em: new Date().toISOString(),
      }).eq('id', item.id);
    }
  }

  return { processados, erros };
}

// ─── Upsert de uma entidade → nota no vault ────────────────────────────

async function upsertNoteForEntity(entityType, entityId) {
  const loader = ENTITY_LOADERS[entityType];
  if (!loader) throw new Error(`entity_type não suportado: ${entityType}`);

  const data = await loader(entityId);
  if (!data) throw new Error(`Entidade ${entityType}:${entityId} não encontrada`);

  const renderer = ENTITY_RENDERERS[entityType];
  const { title, content } = renderer(data);

  const areaPath = AREA_VAULT_BY_ENTITY[entityType] || '_dados-brutos';
  const slug = makeSlug(title, entityId);
  const notePath = `${areaPath}/${slug}.md`;

  const hash = sha256(content);

  // Se nota não mudou, ainda atualiza o registro de atualizada_em mas pula o PUT.
  const existing = await getIndexRow(entityType, entityId);
  if (existing && existing.note_hash === hash && existing.note_path === notePath) {
    await supabase.from('cerebro_entidades_indice').update({
      atualizada_em: new Date().toISOString(),
    }).eq('id', existing.id);
    return { skipped: true, notePath };
  }

  const uploadResult = await saveNoteToVault(notePath, content);

  const row = {
    entity_type: entityType,
    entity_id: String(entityId),
    note_path: notePath,
    note_hash: hash,
    vault_item_id: uploadResult.itemId,
    sharepoint_url: uploadResult.webUrl,
    titulo: title,
    area_vault: areaPath,
    atualizada_em: new Date().toISOString(),
  };

  if (existing) {
    await supabase.from('cerebro_entidades_indice').update(row).eq('id', existing.id);
  } else {
    await supabase.from('cerebro_entidades_indice').insert(row);
  }

  return { skipped: false, notePath };
}

async function deleteNote(entityType, entityId) {
  const existing = await getIndexRow(entityType, entityId);
  if (!existing) return;
  // A nota em si permanece no vault (soft-delete no Obsidian é mais seguro);
  // apenas removemos do índice pra não reaparecer em buscas do assistente.
  await supabase.from('cerebro_entidades_indice').delete().eq('id', existing.id);
}

async function getIndexRow(entityType, entityId) {
  const { data } = await supabase
    .from('cerebro_entidades_indice')
    .select('*')
    .eq('entity_type', entityType)
    .eq('entity_id', String(entityId))
    .maybeSingle();
  return data || null;
}

// ─── Persistência no vault via Microsoft Graph ─────────────────────────

async function saveNoteToVault(relativePath, content) {
  const driveId = await getVaultDriveId();
  const token = await getGraphToken();
  const url = `https://graph.microsoft.com/v1.0/drives/${driveId}/root:/${encodeURI(relativePath)}:/content`;
  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'text/markdown',
    },
    body: content,
  });
  if (!res.ok) {
    const err = await res.text().catch(() => '');
    throw new Error(`Falha ao salvar no vault (${res.status}): ${err.slice(0, 200)}`);
  }
  const data = await res.json();
  return { itemId: data.id, webUrl: data.webUrl };
}

// ─── Loaders: buscam dados frescos de cada entidade ────────────────────

const ENTITY_LOADERS = {
  membro: async (id) => {
    const { data } = await supabase
      .from('mem_membros')
      .select('id, nome, status, email, telefone, data_nascimento, estado_civil, cidade, profissao, familia_id, created_at, active')
      .eq('id', id)
      .maybeSingle();
    if (!data) return null;
    // Enriquece com nome da família
    if (data.familia_id) {
      const { data: fam } = await supabase.from('mem_familias').select('nome').eq('id', data.familia_id).maybeSingle();
      data.familia = fam?.nome || null;
    }
    return data;
  },
  evento: async (id) => {
    const { data } = await supabase
      .from('events')
      .select('id, name, description, date, status, location, responsible, recurrence, budget_planned, budget_spent, expected_attendance, actual_attendance, created_at')
      .eq('id', id)
      .maybeSingle();
    return data;
  },
  projeto: async (id) => {
    const { data } = await supabase
      .from('projects')
      .select('id, name, description, year, status, responsible, area, date_start, date_end, budget_planned, budget_spent, priority, notes, created_at')
      .eq('id', id)
      .maybeSingle();
    return data;
  },
  voluntario: async (id) => {
    const { data } = await supabase
      .from('vol_profiles')
      .select('id, full_name, email, planning_center_id, created_at')
      .eq('id', id)
      .maybeSingle();
    if (!data) return null;
    // Contagens auxiliares para enriquecer a nota
    const d90 = new Date(Date.now() - 90 * 86400000).toISOString();
    const { count: checkins90d } = await supabase
      .from('vol_check_ins')
      .select('id', { count: 'exact', head: true })
      .eq('volunteer_id', id)
      .gte('checked_in_at', d90);
    const { data: roles } = await supabase
      .from('vol_user_roles')
      .select('role')
      .eq('profile_id', id);
    data.checkins_90d = checkins90d || 0;
    data.roles = (roles || []).map((r) => r.role);
    return data;
  },
  acompanhamento: async (id) => {
    const { data } = await supabase
      .from('cui_acompanhamentos')
      .select('id, nome, telefone, motivo, status, data_inicio, data_encerramento, observacoes, membro_id, created_at')
      .eq('id', id)
      .maybeSingle();
    return data;
  },
  funcionario: async (id) => {
    const { data } = await supabase
      .from('rh_funcionarios')
      .select('id, nome, email, telefone, cargo, area, tipo_contrato, data_admissao, data_demissao, status, observacoes, created_at')
      .eq('id', id)
      .maybeSingle();
    return data;
  },
  // Agregado mensal de contribuições. entity_id = 'YYYY-MM'.
  'contribuicao-mes': async (yyyymm) => {
    const match = /^(\d{4})-(\d{2})$/.exec(String(yyyymm || ''));
    if (!match) throw new Error(`entity_id inválido para contribuicao-mes: ${yyyymm}`);
    const [, ano, mes] = match;
    const ini = `${ano}-${mes}-01`;
    const proxMes = new Date(Number(ano), Number(mes), 1).toISOString().slice(0, 10);

    const { data: contribs } = await supabase
      .from('mem_contribuicoes')
      .select('tipo, valor, data, forma_pagamento, campanha, origem, membro_id')
      .gte('data', ini)
      .lt('data', proxMes);

    const lista = contribs || [];
    const total = lista.reduce((s, c) => s + Number(c.valor || 0), 0);
    const porTipo = {};
    const porForma = {};
    const porCampanha = {};
    const membrosUnicos = new Set();
    for (const c of lista) {
      porTipo[c.tipo] = (porTipo[c.tipo] || 0) + Number(c.valor || 0);
      if (c.forma_pagamento) porForma[c.forma_pagamento] = (porForma[c.forma_pagamento] || 0) + Number(c.valor || 0);
      if (c.campanha) porCampanha[c.campanha] = (porCampanha[c.campanha] || 0) + Number(c.valor || 0);
      if (c.membro_id) membrosUnicos.add(c.membro_id);
    }

    return {
      periodo: yyyymm,
      ano, mes,
      data_inicio: ini,
      data_fim: proxMes,
      total_registros: lista.length,
      total_valor: total,
      membros_unicos: membrosUnicos.size,
      por_tipo: porTipo,
      por_forma_pagamento: porForma,
      por_campanha: porCampanha,
    };
  },
};

// ─── Renderers: produzem { title, content } em markdown ────────────────

const ENTITY_RENDERERS = {
  membro: (m) => {
    const hoje = new Date().toISOString().slice(0, 10);
    const status = m.status || 'desconhecido';
    const tags = [
      '#tipo/membro',
      '#area/crm-pessoas',
      `#status/${status}`,
      m.active === false ? '#status/inativo' : '#status/ativo',
    ];
    const frontmatter = [
      '---',
      `titulo: "${(m.nome || '').replace(/"/g, "'")}"`,
      'tipo: membro',
      `data_criacao: ${m.created_at ? m.created_at.slice(0, 10) : hoje}`,
      `ultima_atualizacao: ${hoje}`,
      'area_vault: 01-crm-pessoas/membros',
      `status: ${m.active === false ? 'inativo' : 'ativo'}`,
      `tags: [${tags.join(', ')}]`,
      'processado_por: cerebro-cbrio-sync',
      `entity_type: membro`,
      `entity_id: ${m.id}`,
      '---',
    ].join('\n');

    const dados = [
      ['Status', status],
      ['Email', m.email],
      ['Telefone', m.telefone],
      ['Data de nascimento', m.data_nascimento],
      ['Estado civil', m.estado_civil],
      ['Cidade', m.cidade],
      ['Profissão', m.profissao],
      ['Família', m.familia],
    ]
      .filter(([, v]) => v)
      .map(([k, v]) => `- **${k}**: ${v}`)
      .join('\n');

    const body = `
# ${m.nome || 'Membro sem nome'}

## Resumo

Membro da CBRio cadastrado em ${m.created_at ? m.created_at.slice(0, 10) : 'data desconhecida'}. Status atual: ${status}.${m.familia ? ` Pertence à família [[${makeSlug(m.familia, 'familia')}]].` : ''}

## Dados-chave

${dados || '_Sem dados detalhados._'}

## Origem

- **Sistema**: CBRio ERP — módulo Membresia
- **ID**: \`${m.id}\`
- **Última sincronização**: ${hoje}

---
> Nota sincronizada automaticamente pelo Cérebro CBRio a partir do ERP.
`;

    return { title: m.nome || `membro-${m.id}`, content: `${frontmatter}\n${body.trim()}\n` };
  },

  projeto: (p) => {
    const hoje = new Date().toISOString().slice(0, 10);
    const status = p.status || 'planejamento';
    const tags = [
      '#tipo/projeto',
      '#area/projetos',
      `#status/${status}`,
      p.year ? `#ano/${p.year}` : null,
      p.priority ? `#prioridade/${p.priority}` : null,
    ].filter(Boolean);
    const frontmatter = [
      '---',
      `titulo: "${(p.name || '').replace(/"/g, "'")}"`,
      'tipo: projeto',
      `data_criacao: ${p.created_at ? p.created_at.slice(0, 10) : hoje}`,
      `ultima_atualizacao: ${hoje}`,
      'area_vault: 03-projetos',
      `status: ${status}`,
      `tags: [${tags.join(', ')}]`,
      'processado_por: cerebro-cbrio-sync',
      'entity_type: projeto',
      `entity_id: ${p.id}`,
      '---',
    ].join('\n');

    const dados = [
      ['Status', status],
      ['Responsável', p.responsible],
      ['Área', p.area],
      ['Início', p.date_start],
      ['Término', p.date_end],
      ['Orçamento previsto', p.budget_planned ? `R$ ${Number(p.budget_planned).toFixed(2)}` : null],
      ['Orçamento realizado', p.budget_spent ? `R$ ${Number(p.budget_spent).toFixed(2)}` : null],
      ['Prioridade', p.priority],
      ['Ano', p.year],
    ]
      .filter(([, v]) => v !== null && v !== undefined && v !== '')
      .map(([k, v]) => `- **${k}**: ${v}`)
      .join('\n');

    const body = `
# ${p.name || `Projeto ${p.id}`}

## Resumo

${p.description || `Projeto institucional da CBRio${p.year ? ` do ciclo ${p.year}` : ''}. Status: ${status}.`}

## Dados-chave

${dados || '_Sem dados detalhados._'}

${p.notes ? `## Notas\n\n${p.notes}\n\n` : ''}## Origem

- **Sistema**: CBRio ERP — módulo Projetos
- **ID**: \`${p.id}\`
- **Última sincronização**: ${hoje}

---
> Nota sincronizada automaticamente pelo Cérebro CBRio a partir do ERP.
`;
    return { title: p.name || `projeto-${p.id}`, content: `${frontmatter}\n${body.trim()}\n` };
  },

  voluntario: (v) => {
    const hoje = new Date().toISOString().slice(0, 10);
    const isLider = (v.roles || []).some((r) => r === 'leader' || r === 'admin');
    const ativo = (v.checkins_90d || 0) > 0;
    const tags = [
      '#tipo/voluntario',
      '#area/ministerios',
      ativo ? '#status/ativo' : '#status/inativo',
      isLider ? '#status/lider' : null,
    ].filter(Boolean);
    const frontmatter = [
      '---',
      `titulo: "${(v.full_name || '').replace(/"/g, "'")}"`,
      'tipo: voluntario',
      `data_criacao: ${v.created_at ? v.created_at.slice(0, 10) : hoje}`,
      `ultima_atualizacao: ${hoje}`,
      'area_vault: 06-ministerios/voluntariado',
      `status: ${ativo ? 'ativo' : 'inativo'}`,
      `tags: [${tags.join(', ')}]`,
      'processado_por: cerebro-cbrio-sync',
      'entity_type: voluntario',
      `entity_id: ${v.id}`,
      '---',
    ].join('\n');

    const dados = [
      ['Email', v.email],
      ['Planning Center ID', v.planning_center_id],
      ['Check-ins últimos 90 dias', v.checkins_90d],
      ['Papéis', (v.roles || []).join(', ') || null],
    ]
      .filter(([, val]) => val !== null && val !== undefined && val !== '')
      .map(([k, val]) => `- **${k}**: ${val}`)
      .join('\n');

    const body = `
# ${v.full_name || `Voluntário ${v.id}`}

## Resumo

Voluntário${isLider ? ' (líder)' : ''} da CBRio cadastrado em ${v.created_at ? v.created_at.slice(0, 10) : 'data desconhecida'}. ${ativo ? `Ativo — com ${v.checkins_90d} check-in(s) nos últimos 90 dias.` : 'Sem check-ins nos últimos 90 dias.'}

## Dados-chave

${dados || '_Sem dados detalhados._'}

## Origem

- **Sistema**: CBRio ERP — módulo Voluntariado
- **ID**: \`${v.id}\`
- **Última sincronização**: ${hoje}

---
> Nota sincronizada automaticamente pelo Cérebro CBRio a partir do ERP.
`;
    return { title: v.full_name || `voluntario-${v.id}`, content: `${frontmatter}\n${body.trim()}\n` };
  },

  acompanhamento: (a) => {
    const hoje = new Date().toISOString().slice(0, 10);
    const status = a.status || 'ativo';
    const tags = [
      '#tipo/acompanhamento',
      '#area/cuidados',
      `#status/${status}`,
      a.data_inicio ? `#ano/${a.data_inicio.slice(0, 4)}` : null,
    ].filter(Boolean);
    const frontmatter = [
      '---',
      `titulo: "Acompanhamento: ${(a.nome || '').replace(/"/g, "'")}"`,
      'tipo: acompanhamento',
      `data_criacao: ${a.created_at ? a.created_at.slice(0, 10) : hoje}`,
      `ultima_atualizacao: ${hoje}`,
      'area_vault: 06-ministerios/cuidados',
      `status: ${status}`,
      `tags: [${tags.join(', ')}]`,
      'processado_por: cerebro-cbrio-sync',
      'entity_type: acompanhamento',
      `entity_id: ${a.id}`,
      '---',
    ].join('\n');

    const dados = [
      ['Pessoa', a.nome],
      ['Telefone', a.telefone],
      ['Status', status],
      ['Data de início', a.data_inicio],
      ['Data de encerramento', a.data_encerramento],
      ['Motivo', a.motivo],
    ]
      .filter(([, v]) => v !== null && v !== undefined && v !== '')
      .map(([k, v]) => `- **${k}**: ${v}`)
      .join('\n');

    const body = `
# Acompanhamento de ${a.nome || 'pessoa sem nome'}

## Resumo

Acompanhamento pastoral iniciado em ${a.data_inicio || 'data desconhecida'}. Status atual: ${status}.${a.motivo ? ` Motivo: ${a.motivo}.` : ''}

## Dados-chave

${dados || '_Sem dados detalhados._'}

${a.observacoes ? `## Observações\n\n${a.observacoes}\n\n` : ''}## Origem

- **Sistema**: CBRio ERP — módulo Cuidados
- **ID**: \`${a.id}\`
- **Última sincronização**: ${hoje}

---
> Nota sincronizada automaticamente pelo Cérebro CBRio a partir do ERP.
`;
    return { title: `acompanhamento-${a.nome || a.id}`, content: `${frontmatter}\n${body.trim()}\n` };
  },

  funcionario: (f) => {
    const hoje = new Date().toISOString().slice(0, 10);
    const status = f.status || 'ativo';
    const tags = [
      '#tipo/funcionario',
      '#area/rh',
      `#status/${status}`,
      f.tipo_contrato ? `#contrato/${f.tipo_contrato.toLowerCase()}` : null,
    ].filter(Boolean);
    const frontmatter = [
      '---',
      `titulo: "${(f.nome || '').replace(/"/g, "'")}"`,
      'tipo: funcionario',
      `data_criacao: ${f.created_at ? f.created_at.slice(0, 10) : hoje}`,
      `ultima_atualizacao: ${hoje}`,
      'area_vault: 08-administrativo/rh',
      `status: ${status}`,
      `tags: [${tags.join(', ')}]`,
      'processado_por: cerebro-cbrio-sync',
      'entity_type: funcionario',
      `entity_id: ${f.id}`,
      '---',
    ].join('\n');

    // Nunca incluir salário na nota — propagaria dado sensível para o vault.
    const dados = [
      ['Cargo', f.cargo],
      ['Área', f.area],
      ['Tipo de contrato', f.tipo_contrato],
      ['Email', f.email],
      ['Telefone', f.telefone],
      ['Admissão', f.data_admissao],
      ['Demissão', f.data_demissao],
      ['Status', status],
    ]
      .filter(([, v]) => v !== null && v !== undefined && v !== '')
      .map(([k, v]) => `- **${k}**: ${v}`)
      .join('\n');

    const body = `
# ${f.nome || `Funcionário ${f.id}`}

## Resumo

Funcionário da CBRio${f.cargo ? ` no cargo de ${f.cargo}` : ''}${f.area ? ` (área ${f.area})` : ''}. Status: ${status}.${f.data_admissao ? ` Admitido em ${f.data_admissao}.` : ''}

## Dados-chave

${dados || '_Sem dados detalhados._'}

${f.observacoes ? `## Observações\n\n${f.observacoes}\n\n` : ''}## Origem

- **Sistema**: CBRio ERP — módulo RH
- **ID**: \`${f.id}\`
- **Última sincronização**: ${hoje}

> Dados sensíveis (salário) não são exportados para o vault.

---
> Nota sincronizada automaticamente pelo Cérebro CBRio a partir do ERP.
`;
    return { title: f.nome || `funcionario-${f.id}`, content: `${frontmatter}\n${body.trim()}\n` };
  },

  'contribuicao-mes': (c) => {
    const hoje = new Date().toISOString().slice(0, 10);
    const nomeMes = new Date(`${c.ano}-${c.mes}-01T00:00:00Z`).toLocaleString('pt-BR', { month: 'long' });
    const tags = [
      '#tipo/contribuicoes',
      '#area/financeiro',
      `#ano/${c.ano}`,
      `#mes/${c.ano}-${c.mes}`,
    ];
    const frontmatter = [
      '---',
      `titulo: "Contribuições ${nomeMes}/${c.ano}"`,
      'tipo: contribuicoes-mensal',
      `data_criacao: ${hoje}`,
      `ultima_atualizacao: ${hoje}`,
      'area_vault: 04-financas/contribuicoes',
      'status: ativo',
      `tags: [${tags.join(', ')}]`,
      'processado_por: cerebro-cbrio-sync',
      'entity_type: contribuicao-mes',
      `entity_id: ${c.periodo}`,
      `periodo: ${c.periodo}`,
      '---',
    ].join('\n');

    const fmt = (v) => `R$ ${Number(v || 0).toFixed(2)}`;

    const tipoLinhas = Object.entries(c.por_tipo || {})
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => `- **${k}**: ${fmt(v)}`).join('\n');

    const formaLinhas = Object.entries(c.por_forma_pagamento || {})
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => `- **${k}**: ${fmt(v)}`).join('\n');

    const campanhaLinhas = Object.entries(c.por_campanha || {})
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => `- **${k}**: ${fmt(v)}`).join('\n');

    const body = `
# Contribuições — ${nomeMes}/${c.ano}

## Resumo

No mês de ${nomeMes}/${c.ano} foram registradas **${c.total_registros}** contribuições, somando **${fmt(c.total_valor)}** em ${c.membros_unicos} membros únicos.

## Por tipo

${tipoLinhas || '_Sem contribuições no período._'}

${formaLinhas ? `## Por forma de pagamento\n\n${formaLinhas}\n\n` : ''}${campanhaLinhas ? `## Por campanha\n\n${campanhaLinhas}\n\n` : ''}## Origem

- **Sistema**: CBRio ERP — módulo Membresia/Financeiro (tabela \`mem_contribuicoes\`)
- **Período**: ${c.data_inicio} a ${c.data_fim} (exclusive)
- **Última sincronização**: ${hoje}

> Esta nota agrega todas as contribuições do mês — é atualizada a cada nova contribuição registrada. Valores individuais não são exportados para o vault.

---
> Nota sincronizada automaticamente pelo Cérebro CBRio a partir do ERP.
`;
    return { title: `contribuicoes-${c.periodo}`, content: `${frontmatter}\n${body.trim()}\n` };
  },

  evento: (e) => {
    const hoje = new Date().toISOString().slice(0, 10);
    const status = e.status || 'no-prazo';
    const tags = [
      '#tipo/evento',
      '#area/eventos',
      `#status/${status}`,
      e.date ? `#ano/${e.date.slice(0, 4)}` : null,
      e.recurrence && e.recurrence !== 'unico' ? `#recorrencia/${e.recurrence}` : null,
    ].filter(Boolean);
    const frontmatter = [
      '---',
      `titulo: "${(e.name || '').replace(/"/g, "'")}"`,
      'tipo: evento',
      `data_criacao: ${e.created_at ? e.created_at.slice(0, 10) : hoje}`,
      `ultima_atualizacao: ${hoje}`,
      'area_vault: 02-eventos',
      `status: ${status}`,
      `tags: [${tags.join(', ')}]`,
      'processado_por: cerebro-cbrio-sync',
      `entity_type: evento`,
      `entity_id: ${e.id}`,
      e.date ? `data_evento: ${e.date}` : null,
      '---',
    ].filter(Boolean).join('\n');

    const dados = [
      ['Data', e.date],
      ['Status', status],
      ['Local', e.location],
      ['Responsável', e.responsible],
      ['Recorrência', e.recurrence],
      ['Público esperado', e.expected_attendance],
      ['Público real', e.actual_attendance],
      ['Orçamento previsto', e.budget_planned ? `R$ ${Number(e.budget_planned).toFixed(2)}` : null],
      ['Orçamento gasto', e.budget_spent ? `R$ ${Number(e.budget_spent).toFixed(2)}` : null],
    ]
      .filter(([, v]) => v !== null && v !== undefined && v !== '')
      .map(([k, v]) => `- **${k}**: ${v}`)
      .join('\n');

    const body = `
# ${e.name || `Evento ${e.id}`}

## Resumo

${e.description || `Evento da CBRio${e.date ? ` em ${e.date}` : ''}. Status: ${status}.`}

## Dados-chave

${dados || '_Sem dados detalhados._'}

## Origem

- **Sistema**: CBRio ERP — módulo Eventos
- **ID**: \`${e.id}\`
- **Última sincronização**: ${hoje}

---
> Nota sincronizada automaticamente pelo Cérebro CBRio a partir do ERP.
`;
    return { title: e.name || `evento-${e.id}`, content: `${frontmatter}\n${body.trim()}\n` };
  },
};

// ─── Helpers ───────────────────────────────────────────────────────────

function sha256(str) {
  return crypto.createHash('sha256').update(str).digest('hex');
}

function stripAccents(s) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function makeSlug(title, fallbackId) {
  const base = stripAccents(String(title || ''))
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  const trimmed = base.slice(0, 50).replace(/-+$/, '');

  // Se o entity_id parece UUID, anexa sufixo curto ao slug para evitar que dois
  // registros com nomes idênticos (homônimos) colidam no mesmo note_path.
  // Para entity_ids que já são únicos por natureza (ex: 'YYYY-MM' no agregado
  // mensal de contribuições), mantém o slug puro.
  const idStr = String(fallbackId || '');
  const looksLikeUUID = /^[0-9a-f]{8}-[0-9a-f]{4}/i.test(idStr);
  const idSuffix = looksLikeUUID ? idStr.replace(/-/g, '').slice(0, 8) : '';

  if (!trimmed) return `sem-titulo-${idSuffix || 'x'}`;
  return idSuffix ? `${trimmed}-${idSuffix}` : trimmed;
}

/**
 * Lista entity_types suportados (útil para o endpoint de backfill).
 */
function getSupportedEntityTypes() {
  return Object.keys(ENTITY_LOADERS);
}

module.exports = {
  enqueueSync,
  processSyncFila,
  upsertNoteForEntity,
  getSupportedEntityTypes,
  // Exportados pra testes/backfill
  AREA_VAULT_BY_ENTITY,
};
