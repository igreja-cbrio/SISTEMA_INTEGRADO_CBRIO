/**
 * Cérebro CBRio — Processador de arquivos
 * Baixa arquivo do SharePoint, envia pro Haiku classificar/resumir,
 * gera nota .md e salva no vault "Cerebro CBRio"
 */
const { supabase } = require('../utils/supabase');
const { getGraphToken, downloadFile } = require('./storageService');
const { extractText, IMAGE_TYPES } = require('./textExtractor');
const Anthropic = require('@anthropic-ai/sdk');

const HUB_SITE_ID = 'infracbrio.sharepoint.com,04b50f10-ea32-40ba-84bd-44a3b38ee2a7,94fe6af6-f064-455d-afc5-67a377f5e82c';

const MAPA_VAULT = {
  'Gestão':       'gestao',
  'Criativo':     'criativo',
  'Ministerial':  'ministerial',
  'Planejamento': 'planejamento',
  'CRM e Pessoas':'crm-pessoas',
};

// Subclassificacao dentro de planejamento baseada na pasta de origem
function resolverSubpastaplanejamento(pastaOrigem, areaVaultSugerida) {
  const pasta = (pastaOrigem || '').toLowerCase();
  if (pasta.includes('expans')) return 'expansao';
  if (pasta.includes('evento') || pasta.includes('serie') || pasta.includes('fase_')) return 'eventos';
  if (pasta.includes('projeto') || pasta.includes('project')) return 'projetos';
  // Fallback pelo area_vault sugerido pelo Haiku
  const area = (areaVaultSugerida || '').toLowerCase();
  if (area.includes('expans') || area.includes('estrateg')) return 'expansao';
  if (area.includes('evento') || area.includes('02-evento')) return 'eventos';
  if (area.includes('projeto') || area.includes('03-projeto')) return 'projetos';
  return 'projetos'; // default
}

// Cache das regras do agente (recarrega a cada execucao do cron)
let _cachedRegras = null;

async function carregarRegrasDoSharePoint() {
  try {
    const token = await getGraphToken();
    const drivesRes = await fetch(`https://graph.microsoft.com/v1.0/sites/${HUB_SITE_ID}/drives`, { headers: { Authorization: `Bearer ${token}` } });
    const drives = await drivesRes.json();
    const vaultDrive = drives.value?.find(d => d.name === 'Cerebro CBRio');
    if (!vaultDrive) { console.warn('[CEREBRO] Vault drive nao encontrado, usando regras padrao'); return null; }

    const fileRes = await fetch(`https://graph.microsoft.com/v1.0/drives/${vaultDrive.id}/root:/AGENTE-REGRAS.md:/content`, { headers: { Authorization: `Bearer ${token}` } });
    if (!fileRes.ok) { console.warn('[CEREBRO] AGENTE-REGRAS.md nao encontrado no vault'); return null; }
    const regras = await fileRes.text();
    console.log(`[CEREBRO] Regras carregadas do SharePoint (${Math.round(regras.length / 1024)}KB)`);
    return regras;
  } catch (e) {
    console.warn('[CEREBRO] Erro ao carregar regras:', e.message);
    return null;
  }
}

async function processarFila() {
  // Carregar regras atualizadas do SharePoint
  _cachedRegras = await carregarRegrasDoSharePoint();

  const { data: pendentes } = await supabase.from('cerebro_fila')
    .select('*').eq('status', 'pendente')
    .order('detectado_em').limit(5);

  if (!pendentes?.length) { console.log('[CEREBRO] Fila vazia'); return { processados: 0, erros: 0 }; }
  console.log(`[CEREBRO] Processando ${pendentes.length} arquivo(s)...`);

  const client = new Anthropic();
  let processados = 0, erros = 0;

  for (const item of pendentes) {
    try {
      await supabase.from('cerebro_fila').update({ status: 'processando' }).eq('id', item.id);

      // 1. Baixar arquivo do SharePoint
      const token = await getGraphToken();
      const dlRes = await fetch(`https://graph.microsoft.com/v1.0/drives/${item.drive_id}/items/${item.item_id}/content`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!dlRes.ok) throw new Error(`Download falhou: ${dlRes.status}`);
      const buffer = Buffer.from(await dlRes.arrayBuffer());

      // 2. Extrair texto ou preparar imagem
      const mimeType = getMimeType(item.extensao);
      const texto = await extractText(buffer, mimeType, item.nome_arquivo, 15000);

      // 3. Enviar pro Haiku classificar
      let messages;
      if (texto === '[IMAGEM]' || IMAGE_TYPES.includes(mimeType)) {
        messages = [{ role: 'user', content: [
          { type: 'image', source: { type: 'base64', media_type: mimeType, data: buffer.toString('base64') } },
          { type: 'text', text: buildPrompt(item) }
        ] }];
      } else if (texto.startsWith('[') || texto.trim().length < 50) {
        // Sem conteudo util
        await supabase.from('cerebro_fila').update({ status: 'ignorado', erro_mensagem: 'Sem conteudo extraivel', processado_em: new Date().toISOString() }).eq('id', item.id);
        continue;
      } else {
        messages = [{ role: 'user', content: buildPrompt(item) + '\n\nConteudo:\n---\n' + texto + '\n---' }];
      }

      const response = await client.messages.create({
        model: 'claude-haiku-4-5-20251001', max_tokens: 1500,
        system: getSystemPrompt(),
        messages
      });

      const respText = response.content?.filter(b => b.type === 'text').map(b => b.text).join('') || '';
      let analise;
      try { analise = JSON.parse(respText.replace(/```json|```/g, '').trim()); }
      catch { analise = { resumo: respText.slice(0, 500), tipo_documento: 'outro', tags: [], dados_chave: {}, notas_relacionadas: [] }; }

      analise.tokensUsados = (response.usage?.input_tokens || 0) + (response.usage?.output_tokens || 0);

      // 4. Gerar nota markdown
      const nota = gerarNota(item, analise);

      // 5. Salvar no vault SharePoint
      const notaPath = await salvarNoVault(item, nota, analise);

      // 6. Atualizar fila
      await supabase.from('cerebro_fila').update({
        status: 'concluido', nota_path: notaPath, resumo: analise.resumo,
        tags: analise.tags || [], tokens_usados: analise.tokensUsados,
        processado_em: new Date().toISOString()
      }).eq('id', item.id);

      console.log(`  [OK] ${item.nome_arquivo} → ${notaPath}`);
      processados++;
    } catch (e) {
      console.error(`  [ERRO] ${item.nome_arquivo}:`, e.message);
      await supabase.from('cerebro_fila').update({ status: 'erro', erro_mensagem: e.message, processado_em: new Date().toISOString() }).eq('id', item.id);
      erros++;
    }
    await new Promise(r => setTimeout(r, 1000));
  }

  console.log(`[CEREBRO] Resultado: ${processados} OK, ${erros} erros`);
  return { processados, erros };
}

const BASE_SYSTEM_PROMPT = `Voce e o processador do Cerebro CBRio — base de conhecimento da Igreja CBRio.
Analise o documento e responda APENAS com JSON valido (sem markdown, sem backticks):
{
  "resumo": "Resumo de 2-3 frases do conteudo",
  "tipo_documento": "relatorio | lista | planilha | ata | contrato | apresentacao | material | foto | outro",
  "tags": ["tipo/X", "area/X", "status/ativo", "ano/YYYY"],
  "dados_chave": { "campo1": "valor1" },
  "notas_relacionadas": ["[[arquivo-existente]]"],
  "area_vault": "subpasta destino (ex: relatorios, membros, atas)",
  "nome_arquivo_sugerido": "nome-kebab-case-max-25-chars"
}
Tags hierarquicas obrigatorias: tipo/X, area/X, status/X, ano/X.
Extraia valores monetarios, datas, nomes, quantidades.
Resumo deve ser profundo e informativo — minimo 3-5 frases.
Nome do arquivo sugerido: semantico, kebab-case, max 25 chars, sem acentos.
Wikilinks APENAS para arquivos reais do vault, nunca para conceitos ou frases.`;

function getSystemPrompt() {
  if (_cachedRegras) {
    return BASE_SYSTEM_PROMPT + '\n\n--- REGRAS COMPLETAS DO AGENTE ---\n\n' + _cachedRegras;
  }
  return BASE_SYSTEM_PROMPT;
}

function buildPrompt(item) {
  return `Analise este documento.\nNome: ${item.nome_arquivo}\nBiblioteca: ${item.biblioteca}\nPasta: ${item.pasta_origem}\nTamanho: ${Math.round(item.tamanho_bytes / 1024)}KB`;
}

function getMimeType(ext) {
  const map = { pdf: 'application/pdf', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', txt: 'text/plain', md: 'text/plain', csv: 'text/csv', json: 'application/json' };
  return map[ext] || 'application/octet-stream';
}

function gerarNota(item, analise) {
  const hoje = new Date().toISOString().split('T')[0];
  const tags = (analise.tags || []).map(t => t.startsWith('#') ? t : `#${t}`);
  let nota = `---
titulo: "${item.nome_arquivo}"
tipo: ${analise.tipo_documento || 'outro'}
data_criacao: ${hoje}
ultima_atualizacao: ${hoje}
biblioteca_origem: "${item.biblioteca}"
pasta_origem: "${item.pasta_origem}"
arquivo_original: "${item.nome_arquivo}"
tamanho: "${Math.round(item.tamanho_bytes / 1024)}KB"
status: ativo
tags: [${tags.join(', ')}]
processado_por: cerebro-cbrio
---

# ${item.nome_arquivo}

## Resumo

${analise.resumo || 'Sem resumo disponivel.'}

## Dados-chave

`;
  if (analise.dados_chave && Object.keys(analise.dados_chave).length > 0) {
    for (const [k, v] of Object.entries(analise.dados_chave)) nota += `- **${k}**: ${v}\n`;
  } else { nota += '_Nenhum dado-chave extraido._\n'; }

  nota += `\n## Arquivo original\n\n- **Localizacao**: SharePoint > ${item.biblioteca} > ${item.pasta_origem}\n- **URL**: ${item.sharepoint_url || 'N/A'}\n- **Processado em**: ${hoje}\n\n## Notas relacionadas\n\n`;
  if (analise.notas_relacionadas?.length > 0) {
    for (const l of analise.notas_relacionadas) nota += `- ${l.startsWith('[[') ? l : `[[${l}]]`}\n`;
  } else { nota += '_Nenhuma nota relacionada identificada._\n'; }

  nota += `\n---\n> Nota gerada automaticamente pelo Cerebro CBRio em ${hoje}\n`;
  return nota;
}

async function salvarNoVault(item, notaConteudo, analise) {
  const token = await getGraphToken();
  const drivesRes = await fetch(`https://graph.microsoft.com/v1.0/sites/${HUB_SITE_ID}/drives`, { headers: { Authorization: `Bearer ${token}` } });
  const drives = await drivesRes.json();
  const vaultDrive = drives.value?.find(d => d.name === 'Cerebro CBRio');
  if (!vaultDrive) throw new Error('Biblioteca "Cerebro CBRio" nao encontrada');

  let pastaVault = MAPA_VAULT[item.biblioteca] || '_dados-brutos';
  let subpasta = analise.area_vault || '';

  // Planejamento: organizar em projetos/expansao/eventos
  if (item.biblioteca === 'Planejamento') {
    subpasta = resolverSubpastaplanejamento(item.pasta_origem, analise.area_vault);
  }

  const nomeNota = (analise.nome_arquivo_sugerido || item.nome_arquivo).replace(/\.[^.]+$/, '').toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9\-]/g, '').slice(0, 80);
  const caminho = subpasta ? `${pastaVault}/${subpasta}/${nomeNota}.md` : `${pastaVault}/${nomeNota}.md`;

  const upRes = await fetch(`https://graph.microsoft.com/v1.0/drives/${vaultDrive.id}/root:/${caminho}:/content`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'text/plain' },
    body: notaConteudo
  });
  if (!upRes.ok) { const e = await upRes.json(); throw new Error(`Salvar nota falhou: ${e.error?.message}`); }
  return caminho;
}

module.exports = { processarFila };
