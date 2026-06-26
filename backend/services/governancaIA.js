// ============================================================================
// Governança · IA — memória acumulada do tema + pauta da próxima reunião
// ============================================================================
// Síntese de board: transcrição do Plaud + atas/deliberações/pendências +
// dados vivos do sistema (relatórios automáticos) -> memória do tema (markdown
// vivo por type×ano) + pauta da próxima reunião. IA rascunha, humano revisa.
//
// Modelo: claude-opus-4-8 (síntese de board · baixa frequência) · thinking
// adaptativo · streaming + finalMessage (cabe nos 300s da função Vercel).
// ============================================================================

const Anthropic = require('@anthropic-ai/sdk');
const { supabase } = require('../utils/supabase');
const storage = require('./storageService');
const govDocs = require('./sharepointGovernanca');
const { extractText } = require('./textExtractor');

const MODEL = process.env.GOVERNANCA_IA_MODEL || 'claude-opus-4-8';
const GOV_MODULE = 'governanca'; // -> biblioteca "Gestão" (MODULE_LIBRARY_MAP)

function fmtData(s) {
  if (!s) return 's/ data';
  const [y, m, d] = String(s).split('-');
  return `${d}/${m}/${y}`;
}

// Chama o Claude (streaming + finalMessage) e devolve o markdown gerado.
async function gerarTexto({ system, user, maxTokens = 16000 }) {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY não configurada no ambiente');
  const client = new Anthropic();
  const stream = client.messages.stream({
    model: MODEL,
    max_tokens: maxTokens,
    thinking: { type: 'adaptive' },
    system,
    messages: [{ role: 'user', content: user }],
  });
  const msg = await stream.finalMessage();
  const texto = (msg.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
  return { texto, modelo: msg.model || MODEL };
}

// Baixa um documento (Plaud) do SharePoint e extrai o texto pra alimentar a IA.
async function extrairTextoDoc(doc) {
  try {
    const { url } = await govDocs.getDownloadUrl(doc.id);
    if (!url) return '';
    const r = await fetch(url);
    const buf = Buffer.from(await r.arrayBuffer());
    return await extractText(buf, doc.mime_type || '', doc.nome_arquivo || '', 30000);
  } catch (e) {
    console.warn('[govIA] falha ao extrair', doc?.nome_arquivo, e.message);
    return '';
  }
}

// Monta o histórico textual das reuniões do tema no ano (ata, deliberações,
// pendências, transcrições do Plaud).
async function montarHistorico(typeId, ano) {
  const from = `${ano}-01-01`, to = `${ano}-12-31`;
  const { data: meetings } = await supabase.from('governance_meetings')
    .select('id, date, status, pauta, ata, deliberacoes')
    .eq('type_id', typeId).is('deleted_at', null)
    .gte('date', from).lte('date', to).order('date');

  const ids = (meetings || []).map(m => m.id);
  const tasksByMtg = {}, docsByMtg = {};
  if (ids.length) {
    const { data: tasks } = await supabase.from('governance_tasks')
      .select('meeting_id, titulo, responsavel, prazo, status').in('meeting_id', ids);
    for (const t of (tasks || [])) (tasksByMtg[t.meeting_id] ||= []).push(t);
    const { data: docs } = await supabase.from('governance_meeting_docs')
      .select('*').in('meeting_id', ids).eq('tipo', 'transcricao').is('deleted_at', null);
    for (const d of (docs || [])) (docsByMtg[d.meeting_id] ||= []).push(d);
  }

  const blocos = [];
  for (const m of (meetings || [])) {
    const linhas = [`### Reunião de ${fmtData(m.date)} (${m.status})`];
    if (m.pauta) linhas.push(`Pauta: ${m.pauta}`);
    if (m.ata) linhas.push(`Ata: ${m.ata}`);
    if (m.deliberacoes) linhas.push(`Deliberações: ${m.deliberacoes}`);
    const tks = tasksByMtg[m.id] || [];
    if (tks.length) linhas.push('Pendências: ' + tks.map(t => `${t.titulo}${t.responsavel ? ' (' + t.responsavel + ')' : ''} [${t.status}]`).join('; '));
    for (const d of (docsByMtg[m.id] || [])) {
      const txt = await extrairTextoDoc(d);
      if (txt) linhas.push(`Transcrição (Plaud) — ${d.nome_arquivo}:\n${txt}`);
    }
    blocos.push(linhas.join('\n'));
  }
  return { texto: blocos.join('\n\n') || '(sem reuniões registradas neste ano)', total: (meetings || []).length };
}

async function subirMarkdown(subFolder, fileName, texto) {
  if (!storage.SHAREPOINT_CONFIGURED) return {};
  try {
    const up = await storage.uploadModuleFile(GOV_MODULE, subFolder, fileName, Buffer.from(texto, 'utf-8'));
    return { sharepoint_path: up.path, sharepoint_item_id: up.itemId, sharepoint_url: up.url || null };
  } catch (e) {
    console.warn('[govIA] upload SharePoint falhou:', e.message);
    return {};
  }
}

// ── Memória acumulada do tema (markdown vivo · type×ano) ────────────────
async function gerarMemoria({ typeId, ano, userId, dadosVivos }) {
  const { data: tipo } = await supabase.from('governance_meeting_types')
    .select('id, nome, sigla').eq('id', typeId).maybeSingle();
  if (!tipo) throw new Error('Tipo de reunião não encontrado');

  const hist = await montarHistorico(typeId, ano);
  const { data: anterior } = await supabase.from('governance_memoria')
    .select('id, conteudo_md').eq('type_id', typeId).eq('ano', ano).is('deleted_at', null).maybeSingle();

  const system = [
    'Você é o secretário executivo da diretoria de uma igreja (CBRio).',
    'Mantenha a MEMÓRIA INSTITUCIONAL de um tema de reunião ao longo do ano: um documento vivo,',
    'em português do Brasil, que consolida o que foi tratado, decidido e o que ficou pendente.',
    'Integre a transcrição das reuniões (Plaud), as atas, as deliberações e os dados do sistema.',
    'Escreva em markdown claro, organizado por: Resumo executivo · Decisões tomadas (com data) ·',
    'Deliberações · Pendências em aberto (com responsável) · Evolução dos indicadores.',
    'Não invente fatos; use só o material fornecido. Preserve o histórico já consolidado e acrescente o novo.',
  ].join(' ');

  const partes = [
    `# Tema: ${tipo.nome} (${tipo.sigla}) — Memória ${ano}`,
    anterior?.conteudo_md
      ? `## Memória consolidada até agora (atualize e incorpore o novo):\n${anterior.conteudo_md}`
      : '## Ainda não há memória consolidada — crie a primeira versão.',
    `## Histórico das reuniões de ${ano} (atas, deliberações, pendências, transcrições):\n${hist.texto}`,
  ];
  if (dadosVivos) partes.push(`## Dados vivos do sistema (relatório automático ${tipo.sigla}):\n${JSON.stringify(dadosVivos.resumo || dadosVivos, null, 2).slice(0, 8000)}`);
  partes.push('Produza a MEMÓRIA atualizada do tema em markdown. Sem preâmbulo — comece direto pelo documento.');

  const { texto, modelo } = await gerarTexto({ system, user: partes.join('\n\n'), maxTokens: 20000 });
  const sp = await subirMarkdown(`Governanca/Memoria/${ano}`, `memoria-${tipo.sigla}-${ano}.md`, texto);

  const payload = {
    type_id: typeId, ano, conteudo_md: texto, modelo,
    gerado_por: userId || null, atualizado_em: new Date().toISOString(), ...sp,
  };
  if (anterior?.id) {
    const { data, error } = await supabase.from('governance_memoria').update(payload).eq('id', anterior.id).select('*').single();
    if (error) throw error;
    return data;
  }
  const { data, error } = await supabase.from('governance_memoria').insert(payload).select('*').single();
  if (error) throw error;
  return data;
}

// ── Pauta da próxima reunião (resumo + pendências + indicadores) ────────
async function gerarPauta({ meetingId, userId, dadosVivos }) {
  const { data: meeting } = await supabase.from('governance_meetings')
    .select('id, date, type_id, governance_meeting_types(sigla, nome)')
    .eq('id', meetingId).is('deleted_at', null).maybeSingle();
  if (!meeting) throw new Error('Reunião não encontrada');
  const tipo = meeting.governance_meeting_types || {};
  const ano = meeting.date ? Number(String(meeting.date).slice(0, 4)) : new Date().getUTCFullYear();

  const { data: memoria } = await supabase.from('governance_memoria')
    .select('conteudo_md').eq('type_id', meeting.type_id).eq('ano', ano).is('deleted_at', null).maybeSingle();

  const { data: mtgsTipo } = await supabase.from('governance_meetings')
    .select('id').eq('type_id', meeting.type_id).is('deleted_at', null);
  const ids = (mtgsTipo || []).map(m => m.id);
  let pendencias = [];
  if (ids.length) {
    const { data } = await supabase.from('governance_tasks')
      .select('titulo, responsavel, prazo, status').in('meeting_id', ids).in('status', ['pendente', 'em_andamento']);
    pendencias = data || [];
  }

  const system = [
    'Você é o secretário executivo da diretoria de uma igreja (CBRio).',
    'Prepare o DOCUMENTO DA PRÓXIMA REUNIÃO em português do Brasil, em markdown, com 3 blocos:',
    '1) Resumo do que foi decidido nas reuniões anteriores deste tema;',
    '2) Decisões e pendências ainda em aberto (com responsável e prazo);',
    '3) Os indicadores/OKRs a avaliar nesta reunião (a partir dos dados vivos do sistema).',
    'Seja objetivo e acionável. Não invente; use só o material fornecido. Sem preâmbulo.',
  ].join(' ');

  const partes = [
    `# Pauta — ${tipo.nome} (${tipo.sigla}) · reunião de ${fmtData(meeting.date)}`,
    memoria?.conteudo_md ? `## Memória do tema:\n${memoria.conteudo_md}` : '## (Ainda não há memória consolidada deste tema.)',
    pendencias.length
      ? `## Pendências em aberto:\n${pendencias.map(p => `- ${p.titulo}${p.responsavel ? ' — ' + p.responsavel : ''}${p.prazo ? ' (prazo ' + fmtData(p.prazo) + ')' : ''} [${p.status}]`).join('\n')}`
      : '## Sem pendências em aberto.',
  ];
  if (dadosVivos) partes.push(`## Dados vivos a avaliar (relatório ${tipo.sigla}):\n${JSON.stringify(dadosVivos.resumo || dadosVivos, null, 2).slice(0, 8000)}`);
  partes.push('Produza o documento da próxima reunião em markdown.');

  const { texto, modelo } = await gerarTexto({ system, user: partes.join('\n\n'), maxTokens: 16000 });
  const nome = `pauta-${tipo.sigla}-${String(meeting.date || ano)}.md`;
  const sp = await subirMarkdown(`Governanca/Pautas/${ano}`, nome, texto);

  // Substitui a pauta_ia anterior desta reunião (soft-delete) e insere a nova.
  await supabase.from('governance_meeting_docs')
    .update({ deleted_at: new Date().toISOString() })
    .eq('meeting_id', meetingId).eq('tipo', 'pauta_ia').is('deleted_at', null);

  const { data: row, error } = await supabase.from('governance_meeting_docs').insert({
    meeting_id: meetingId, tipo: 'pauta_ia', nome_arquivo: nome, mime_type: 'text/markdown',
    conteudo_md: texto, gerado_por_ia: true, modelo, enviado_por: userId || null,
    sharepoint_path: sp.sharepoint_path || null, sharepoint_item_id: sp.sharepoint_item_id || null, sharepoint_url: sp.sharepoint_url || null,
  }).select('*').single();
  if (error) throw error;
  return row;
}

module.exports = { gerarMemoria, gerarPauta };
