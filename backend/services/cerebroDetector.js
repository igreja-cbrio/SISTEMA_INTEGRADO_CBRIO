/**
 * Cérebro CBRio — Detector de arquivos novos/modificados
 * Usa Delta Query do Microsoft Graph para detectar mudanças nas bibliotecas
 */
const { supabase } = require('../utils/supabase');
const { getGraphToken } = require('./storageService');

const HUB_SITE_ID = 'infracbrio.sharepoint.com,04b50f10-ea32-40ba-84bd-44a3b38ee2a7,94fe6af6-f064-455d-afc5-67a377f5e82c';

const EXTENSOES = new Set(['pdf', 'xlsx', 'csv', 'docx', 'pptx', 'txt', 'md', 'json', 'png', 'jpg', 'jpeg']);
const TAM_MINIMO = 100; // bytes

async function graphFetch(path, token) {
  const res = await fetch(`https://graph.microsoft.com/v1.0${path}`, { headers: { Authorization: `Bearer ${token}` } });
  return res.json();
}

async function detectarArquivosNovos() {
  const token = await getGraphToken();

  // Buscar drives do hub
  const drivesData = await graphFetch(`/sites/${HUB_SITE_ID}/drives`, token);

  // Bibliotecas monitoradas
  const { data: cfg } = await supabase.from('cerebro_config').select('valor').eq('chave', 'bibliotecas_monitoradas').single();
  const monitoradas = (cfg?.valor || '').split(',').map(s => s.trim());

  let totalDetectados = 0;

  for (const drive of (drivesData.value || [])) {
    if (!monitoradas.includes(drive.name)) continue;
    console.log(`[CEREBRO] Verificando: ${drive.name}`);

    // Delta link salvo
    const deltaKey = `delta_${drive.id}`;
    const { data: deltaRow } = await supabase.from('cerebro_config').select('valor').eq('chave', deltaKey).maybeSingle();
    let savedDelta = deltaRow?.valor ? String(deltaRow.valor).replace(/^"|"$/g, '') : null;
    let deltaUrl;

    if (savedDelta && savedDelta !== 'null' && savedDelta.startsWith('http')) {
      deltaUrl = savedDelta;
      console.log(`  [DELTA] Usando link salvo`);
    } else {
      deltaUrl = `https://graph.microsoft.com/v1.0/drives/${drive.id}/root/delta`;
      console.log(`  [DELTA] Scan completo (sem link salvo)`);
    }

    let hasMore = true;
    while (hasMore) {
      const res = await fetch(deltaUrl, { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();

      for (const item of (data.value || [])) {
        if (item.folder || item.deleted) continue;
        const resultado = await filtrarEEnfileirar(item, drive);
        if (resultado === 'enfileirado') totalDetectados++;
      }

      if (data['@odata.nextLink']) {
        deltaUrl = data['@odata.nextLink'];
      } else {
        // Salvar delta link pra proxima execucao
        if (data['@odata.deltaLink']) {
          await supabase.from('cerebro_config').upsert({
            chave: deltaKey,
            valor: JSON.stringify(data['@odata.deltaLink']),
            atualizado_em: new Date().toISOString()
          }, { onConflict: 'chave' });
        }
        hasMore = false;
      }
    }
  }

  console.log(`[CEREBRO] Total detectados: ${totalDetectados}`);
  return totalDetectados;
}

async function filtrarEEnfileirar(item, drive) {
  const nome = item.name || '';
  const ext = nome.split('.').pop()?.toLowerCase() || '';
  const tam = item.size || 0;

  if (!EXTENSOES.has(ext)) return 'ignorado';
  if (tam < TAM_MINIMO) return 'ignorado';
  if (nome.startsWith('~') || nome.startsWith('.')) return 'ignorado';

  // Verificar se ja foi processado com mesma versao
  const lastMod = item.lastModifiedDateTime || '';
  const { data: existente } = await supabase.from('cerebro_fila')
    .select('id, last_modified, status')
    .eq('item_id', item.id).eq('drive_id', drive.id)
    .limit(1).maybeSingle();

  if (existente) {
    // Arquivo modificado? Reprocessar
    if (existente.last_modified === lastMod && existente.status !== 'erro') return 'duplicado';
    // Atualizar pra reprocessar
    await supabase.from('cerebro_fila').update({ status: 'pendente', last_modified: lastMod, detectado_em: new Date().toISOString() }).eq('id', existente.id);
    console.log(`  [REPROCESSAR] ${nome}`);
    return 'enfileirado';
  }

  const pasta = item.parentReference?.path?.replace(/.*root:\//, '')?.replace(/^\//, '') || '/';

  const { error } = await supabase.from('cerebro_fila').insert({
    drive_id: drive.id,
    item_id: item.id,
    nome_arquivo: nome,
    extensao: ext,
    tamanho_bytes: tam,
    pasta_origem: pasta,
    biblioteca: drive.name,
    sharepoint_url: item.webUrl || null,
    last_modified: lastMod,
    hash_arquivo: item.file?.hashes?.sha256Hash || null,
  });

  if (error) { console.error(`  [ERRO] ${nome}:`, error.message); return 'erro'; }
  console.log(`  [NOVO] ${nome} (${drive.name}/${pasta})`);
  return 'enfileirado';
}

module.exports = { detectarArquivosNovos };
