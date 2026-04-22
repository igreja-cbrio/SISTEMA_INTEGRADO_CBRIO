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
  membro:        '01-crm-pessoas/membros',
  contribuicao:  '04-financas/contribuicoes',
  evento:        '02-eventos',
  projeto:       '03-projetos',
  voluntario:    '06-ministerios/voluntariado',
  acompanhamento: '06-ministerios/cuidados',
  funcionario:   '08-administrativo/rh',
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
      .select('id, name, description, start_date, end_date, status, location, created_at')
      .eq('id', id)
      .maybeSingle();
    return data;
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

  evento: (e) => {
    const hoje = new Date().toISOString().slice(0, 10);
    const status = e.status || 'planejado';
    const tags = [
      '#tipo/evento',
      '#area/eventos',
      `#status/${status}`,
      e.start_date ? `#ano/${e.start_date.slice(0, 4)}` : null,
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
      e.start_date ? `data_inicio: ${e.start_date}` : null,
      e.end_date ? `data_fim: ${e.end_date}` : null,
      '---',
    ].filter(Boolean).join('\n');

    const dados = [
      ['Início', e.start_date],
      ['Término', e.end_date],
      ['Status', status],
      ['Local', e.location],
    ]
      .filter(([, v]) => v)
      .map(([k, v]) => `- **${k}**: ${v}`)
      .join('\n');

    const body = `
# ${e.name || `Evento ${e.id}`}

## Resumo

${e.description || `Evento da CBRio${e.start_date ? ` previsto para ${e.start_date}` : ''}. Status: ${status}.`}

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
  const trimmed = base.slice(0, 60).replace(/-+$/, '');
  if (trimmed) return trimmed;
  // Fallback determinístico quando o título é vazio — evita colisão entre entidades.
  return `sem-titulo-${String(fallbackId).slice(0, 8)}`;
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
