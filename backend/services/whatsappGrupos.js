// ============================================================================
// Bot WhatsApp · GRUPOS DE CONEXÃO (estudo semanal + relato do encontro)
//
// Visão do Marcos (2026-06-10):
//   1. Toda semana o bot manda o ESTUDO DA SEMANA pros líderes de grupos
//      (broadcast 1:1 — a API oficial da Meta não posta em grupo de WhatsApp).
//   2. No dia seguinte ao dia do grupo, o bot pergunta como foi o encontro;
//      o líder responde por TEXTO ou ÁUDIO dizendo quantos foram, QUEM foi e
//      um resumo breve — e pode mandar FOTO do encontro.
//   3. Isso vira uma coleta 'parseado' (fila de revisão em /admin/whatsapp);
//      ao aplicar, cria o ENCONTRO REAL (mem_grupo_encontros + presenças
//      nominais via RPC registrar_encontro_grupo) → histórico do grupo e a
//      aba Relatórios passam a ser alimentados sozinhos.
//
// Estado da conversa: whatsapp_coletas (sem migration) · parsed:
//   { fonte:'grupo_encontro', grupo_id, grupo_nome, data_encontro,
//     presentes, visitantes, resumo, nomes_presentes:[{membro_id,nome}],
//     nao_reconhecidos:[], fotos:[url] }
// Dedup de lembrete/estudo: whatsapp_message_id sintético (UNIQUE):
//   'lembrete:<grupoId>:<data>' · 'estudo:<AAAA-Wss>:<liderId>'
//
// Áudio: transcrição via OpenAI Whisper · env OPENAI_API_KEY (opcional ·
// sem a chave o bot pede o relato por texto). Decisão do Marcos: código
// pronto agora, a conta/chave ele cria depois.
//
// Envio proativo (fora da janela de 24h) exige TEMPLATE aprovado na Meta:
//   WHATSAPP_TEMPLATE_ESTUDO_GRUPO    · body {{1}}=nome do líder {{2}}=texto
//   WHATSAPP_TEMPLATE_LEMBRETE_GRUPO  · body {{1}}=nome do líder {{2}}=grupo
// Sem as envs, tenta texto livre (funciona dentro da janela de 24h) e loga
// a falha na própria coleta pra diagnóstico.
// ============================================================================

const Anthropic = require('@anthropic-ai/sdk');
const { supabase } = require('../utils/supabase');
const { enviarTexto, enviarTemplate } = require('./whatsappSend');

const MODEL = 'claude-haiku-4-5-20251001';
const GRAPH_VERSION = process.env.WHATSAPP_GRAPH_VERSION || 'v21.0';
const JANELA_SESSAO_MIN = 60 * 24 * 7; // mesma janela de 7d do webhook

const hojeISO = () => new Date().toISOString().slice(0, 10);

function isoSemana(d = new Date()) {
  // AAAA-Wss (suficiente pra dedup semanal · não precisa ISO-8601 estrito)
  const inicio = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const dias = Math.floor((d - inicio) / 86400000);
  return `${d.getUTCFullYear()}-W${String(Math.floor(dias / 7)).padStart(2, '0')}`;
}

function normalizarNome(s) {
  return (s || '').toString().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
}

// ── Envio com fallback de template ─────────────────────────────────────────
async function enviarComFallback(telefone, texto, templateEnv, params) {
  const r = await enviarTexto(telefone, texto);
  if (r.ok) return { ...r, via: 'texto' };
  const tpl = process.env[templateEnv];
  if (tpl) {
    const rt = await enviarTemplate(telefone, tpl, 'pt_BR', params);
    return { ...rt, via: 'template' };
  }
  return { ...r, via: 'texto' };
}

// ── Mídia da Meta (áudio/foto chegam como media id) ─────────────────────────
async function baixarMedia(mediaId) {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  if (!token) return null;
  const meta = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${mediaId}`, {
    headers: { Authorization: `Bearer ${token}` },
  }).then(r => r.json()).catch(() => null);
  if (!meta?.url) return null;
  const resp = await fetch(meta.url, { headers: { Authorization: `Bearer ${token}` } }).catch(() => null);
  if (!resp || !resp.ok) return null;
  const buffer = Buffer.from(await resp.arrayBuffer());
  // Cap defensivo · 16MB (limite da Meta) — não processa nada maior
  if (buffer.length > 16 * 1024 * 1024) return null;
  return { buffer, mime: meta.mime_type || resp.headers.get('content-type') || 'application/octet-stream' };
}

// ── Transcrição de áudio (OpenAI Whisper · env-gated) ───────────────────────
function audioConfigurado() { return !!process.env.OPENAI_API_KEY; }

async function transcreverAudio(mediaId) {
  if (!audioConfigurado()) return { ok: false, error: 'sem_chave' };
  const media = await baixarMedia(mediaId);
  if (!media) return { ok: false, error: 'download_falhou' };
  try {
    const fd = new FormData();
    const ext = media.mime.includes('mpeg') ? 'mp3' : media.mime.includes('mp4') ? 'm4a' : 'ogg';
    fd.append('file', new Blob([media.buffer], { type: media.mime }), `audio.${ext}`);
    fd.append('model', process.env.OPENAI_TRANSCRIBE_MODEL || 'whisper-1');
    fd.append('language', 'pt');
    const resp = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      body: fd,
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      console.error('[whatsappGrupos] whisper:', resp.status, JSON.stringify(data).slice(0, 300));
      return { ok: false, error: data?.error?.message || `HTTP ${resp.status}` };
    }
    const texto = (data.text || '').trim().slice(0, 2000);
    return texto ? { ok: true, texto } : { ok: false, error: 'transcricao_vazia' };
  } catch (e) {
    console.error('[whatsappGrupos] transcrever:', e.message);
    return { ok: false, error: e.message };
  }
}

// ── Resolução do grupo do líder ─────────────────────────────────────────────
// 1º o vínculo direto (whatsapp_lideres.grupo_id) · 2º o grupo onde o membro
// (via profile→email→mem_membros) é o líder responsável (mem_grupos.lider_id).
async function resolverGrupoDoLider(lider) {
  if (lider.grupo_id) {
    const { data: g } = await supabase
      .from('mem_grupos').select('id, nome, dia_semana, lider_id')
      .eq('id', lider.grupo_id).eq('ativo', true).is('deleted_at', null).maybeSingle();
    if (g) return g;
  }
  if (lider.profile_id) {
    const { data: prof } = await supabase.from('profiles').select('email').eq('id', lider.profile_id).maybeSingle();
    if (prof?.email) {
      const { data: membro } = await supabase.from('mem_membros').select('id').eq('email', prof.email).maybeSingle();
      if (membro?.id) {
        const { data: g } = await supabase
          .from('mem_grupos').select('id, nome, dia_semana, lider_id')
          .eq('lider_id', membro.id).eq('ativo', true).is('deleted_at', null)
          .limit(1).maybeSingle();
        if (g) return g;
      }
    }
  }
  return null;
}

// Última ocorrência do dia do grupo até hoje (data provável do encontro)
function ultimaOcorrencia(diaSemana) {
  const hoje = new Date();
  if (diaSemana === null || diaSemana === undefined) return hojeISO();
  const diff = (hoje.getDay() - Number(diaSemana) + 7) % 7;
  const d = new Date(hoje); d.setDate(hoje.getDate() - diff);
  return d.toISOString().slice(0, 10);
}

// ── Sessão de relato (whatsapp_coletas) ─────────────────────────────────────
async function sessaoEncontroAberta(liderId) {
  const limite = new Date(Date.now() - JANELA_SESSAO_MIN * 60 * 1000).toISOString();
  const { data } = await supabase
    .from('whatsapp_coletas')
    .select('id, parsed')
    .eq('lider_id', liderId).eq('status', 'aguardando_info')
    .gte('created_at', limite)
    .order('created_at', { ascending: false })
    .limit(5);
  return (data || []).find(c => c.parsed?.fonte === 'grupo_encontro') || null;
}

async function abrirSessaoEncontro({ lider, telefone, grupo, dataEncontro }) {
  const messageId = `lembrete:${grupo.id}:${dataEncontro}`;
  const { data, error } = await supabase.from('whatsapp_coletas').insert({
    whatsapp_message_id: messageId,
    telefone,
    lider_id: lider.id,
    raw_text: '[sessão de relato do encontro aberta pelo bot]',
    status: 'aguardando_info',
    modulo_destino: 'grupos',
    parsed: {
      fonte: 'grupo_encontro',
      grupo_id: grupo.id,
      grupo_nome: grupo.nome,
      data_encontro: dataEncontro,
      fotos: [],
    },
  }).select('id, parsed').single();
  if (error) {
    if (error.code === '23505') return null; // lembrete já existe pra esse grupo/data
    throw new Error(error.message);
  }
  return data;
}

// ── Extração do relato (Haiku · recebe a lista de membros pro match) ────────
const SYSTEM_RELATO = `Você é o assistente da CBRio que registra o relato do encontro de um grupo de conexão, contado pelo líder em pt-BR (texto livre ou transcrição de áudio). Tom: caloroso e breve, pode usar 1 emoji.

Você recebe a LISTA DE MEMBROS do grupo e o RELATO do líder. Tarefa:
1. Extrair o total de presentes, os NOMES citados como presentes, visitantes (pessoas de fora do grupo) e um resumo breve do encontro.
2. Casar cada nome citado com a LISTA DE MEMBROS (aceite apelido/primeiro nome/erro de digitação óbvio). Use EXATAMENTE o nome como está na lista no campo "nomes_presentes". Nome citado que não casar com ninguém da lista vai em "nao_reconhecidos" (como o líder falou).
3. NUNCA invente nome nem número. O que não foi dito = null/lista vazia.
4. Se o líder só cumprimentou ou tirou dúvida, devolva tudo null e uma resposta natural pedindo o relato.

Responda APENAS com JSON válido (sem markdown):
{
  "presentes": n|null,
  "visitantes": n|null,
  "nomes_presentes": ["nome exato da lista", ...],
  "nao_reconhecidos": ["nome citado fora da lista", ...],
  "resumo": "resumo breve do encontro dito pelo líder"|null,
  "resposta": "mensagem curta pra responder ao líder agora"
}`;

async function extrairRelato({ texto, membros, jaColetado }) {
  const anthropic = new Anthropic();
  const lista = membros.map(m => m.nome).join('\n');
  const contexto = jaColetado && (jaColetado.presentes || jaColetado.resumo)
    ? `\n\nJÁ COLETADO antes (mescle, não descarte): ${JSON.stringify({ presentes: jaColetado.presentes, visitantes: jaColetado.visitantes, resumo: jaColetado.resumo, nomes: (jaColetado.nomes_presentes || []).map(n => n.nome) })}`
    : '';
  try {
    const resp = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 700,
      system: SYSTEM_RELATO,
      messages: [{
        role: 'user',
        content: `LISTA DE MEMBROS do grupo:\n${lista || '(vazia)'}\n\nRELATO do líder:\n"""${texto}"""${contexto}`,
      }],
    });
    const raw = resp.content?.[0]?.text || '';
    const json = JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1));
    return json && typeof json === 'object' ? json : null;
  } catch (e) {
    console.error('[whatsappGrupos] extrairRelato:', e.message);
    return null;
  }
}

// ── Foto do encontro → materiais do grupo (etiqueta "Fotos de grupos") ──────
async function salvarFotoEncontro({ mediaId, grupo, lider }) {
  const media = await baixarMedia(mediaId);
  if (!media) return null;
  const ext = media.mime.includes('png') ? 'png' : media.mime.includes('webp') ? 'webp' : 'jpg';
  const nome = `encontro_${grupo?.id ? String(grupo.id).slice(0, 8) : 'grupo'}_${Date.now()}.${ext}`;
  const supaPath = `grupos/fotos/${grupo?.id || 'sem-grupo'}/${nome}`;
  const { error: upErr } = await supabase.storage
    .from('eventos-anexos')
    .upload(supaPath, media.buffer, { contentType: media.mime, upsert: true });
  if (upErr) {
    console.error('[whatsappGrupos] upload foto:', upErr.message);
    return null;
  }
  const { data: urlData } = supabase.storage.from('eventos-anexos').getPublicUrl(supaPath);
  const url = urlData?.publicUrl || null;
  await supabase.from('mem_grupo_documentos').insert({
    tipo: ext,
    nome,
    comentario: `Foto do encontro via WhatsApp${lider?.nome_exibicao ? ` · ${lider.nome_exibicao}` : ''}${grupo?.nome ? ` · ${grupo.nome}` : ''}`,
    etiquetas: ['Fotos de grupos'],
    grupo_ids: grupo?.id ? [grupo.id] : [],
    storage_path: url,
    uploaded_by_name: lider?.nome_exibicao || 'WhatsApp',
  });
  return url;
}

// ════════════════════════════════════════════════════════════════════════════
// WEBHOOK · trata mensagem de líder com escopo grupos (texto/áudio/foto).
// Retorna true se tratou (o webhook para aqui) · false deixa o fluxo seguir.
// ════════════════════════════════════════════════════════════════════════════
async function tratarMensagemGrupos({ m, lider, telefone, messageId }) {
  const escopo = lider?.escopo || [];
  if (!escopo.includes('grupos')) return false;

  const soGrupos = escopo.length === 1;
  const ehAudio = m.type === 'audio';
  const ehImagem = m.type === 'image';
  const ehTexto = m.type === 'text';
  let texto = ehTexto ? (m.text?.body || '').slice(0, 2000) : '';

  let sessao = await sessaoEncontroAberta(lider.id);

  // Sem sessão: só intercepta mídia (áudio/foto é sempre relato de grupo pra
  // quem tem o escopo) ou texto de líder SÓ-grupos. Líder multi-escopo
  // digitando texto segue o fluxo existente (culto/formulário).
  if (!sessao && !(ehAudio || ehImagem || (ehTexto && soGrupos))) return false;

  const grupo = sessao?.parsed?.grupo_id
    ? { id: sessao.parsed.grupo_id, nome: sessao.parsed.grupo_nome, dia_semana: null }
    : await resolverGrupoDoLider(lider);

  if (!grupo) {
    if (ehTexto && soGrupos) {
      await registrarColetaSimples({ messageId, telefone, lider, texto, erro: 'sem_grupo_vinculado' });
      await enviarTexto(telefone,
        'Não achei um grupo vinculado ao seu número. Pede pro coordenador vincular seu grupo em /admin/whatsapp que aí eu registro seus encontros por aqui. 🙏');
      return true;
    }
    return false; // mídia sem grupo resolvível · deixa o fluxo padrão decidir
  }

  // ── FOTO ──────────────────────────────────────────────────────────────────
  if (ehImagem) {
    await registrarColetaSimples({ messageId, telefone, lider, texto: '[foto]', erro: 'foto_encontro' });
    const url = await salvarFotoEncontro({ mediaId: m.image?.id, grupo, lider });
    if (url && sessao) {
      const fotos = [...(sessao.parsed.fotos || []), url];
      await supabase.from('whatsapp_coletas')
        .update({ parsed: { ...sessao.parsed, fotos } })
        .eq('id', sessao.id);
    }
    await enviarTexto(telefone, url
      ? `📸 Foto guardada no histórico do grupo ${grupo.nome}. Valeu!`
      : 'Recebi a foto mas não consegui guardar agora. Pode tentar de novo mais tarde? 🙏');
    return true;
  }

  // ── ÁUDIO → texto ─────────────────────────────────────────────────────────
  if (ehAudio) {
    if (!audioConfigurado()) {
      await registrarColetaSimples({ messageId, telefone, lider, texto: '[áudio]', erro: 'audio_sem_transcricao' });
      await enviarTexto(telefone,
        'Ainda não consigo ouvir áudios por aqui 😅 Me manda por texto: quantas pessoas vieram, quem veio e um resumo do encontro. 🙏');
      return true;
    }
    const tr = await transcreverAudio(m.audio?.id);
    if (!tr.ok) {
      await registrarColetaSimples({ messageId, telefone, lider, texto: '[áudio]', erro: `audio_falhou: ${tr.error}`.slice(0, 200) });
      await enviarTexto(telefone, 'Não consegui entender o áudio. Pode mandar de novo ou escrever por texto? 🙏');
      return true;
    }
    texto = tr.texto;
  }

  // ── TEXTO (ou transcrição) → extrai relato + match nominal ───────────────
  if (!sessao) {
    sessao = await abrirSessaoEncontro({ lider, telefone, grupo, dataEncontro: ultimaOcorrencia(grupo.dia_semana) });
    if (!sessao) sessao = await sessaoEncontroAberta(lider.id); // corrida com o lembrete do cron
    if (!sessao) return false;
  }

  // Membros ativos do grupo (pro match nominal)
  const { data: parts } = await supabase
    .from('mem_grupo_membros')
    .select('membro_id, mem_membros!inner(id, nome)')
    .eq('grupo_id', grupo.id)
    .is('saiu_em', null)
    .limit(200);
  const membros = (parts || []).map(p => ({ membro_id: p.membro_id, nome: p.mem_membros?.nome })).filter(x => x.nome);

  const r = await extrairRelato({ texto, membros, jaColetado: sessao.parsed });
  if (!r) {
    await enviarTexto(telefone, 'Tive um problema aqui. Pode mandar de novo, por favor? 🙏');
    return true;
  }

  // Só aceita nomes que batem MESMO na lista (não confia 100% no modelo)
  const porNome = new Map(membros.map(mm => [normalizarNome(mm.nome), mm]));
  const nomesPresentes = [];
  const naoReconhecidos = [...(r.nao_reconhecidos || [])];
  for (const n of (r.nomes_presentes || [])) {
    const hit = porNome.get(normalizarNome(n));
    if (hit && !nomesPresentes.some(x => x.membro_id === hit.membro_id)) {
      nomesPresentes.push({ membro_id: hit.membro_id, nome: hit.nome });
    } else if (n) naoReconhecidos.push(n);
  }
  // Mescla com o que a sessão já tinha
  const antigos = sessao.parsed.nomes_presentes || [];
  for (const a of antigos) if (!nomesPresentes.some(x => x.membro_id === a.membro_id)) nomesPresentes.push(a);

  const presentes = r.presentes ?? sessao.parsed.presentes ?? (nomesPresentes.length || null);
  const visitantes = r.visitantes ?? sessao.parsed.visitantes ?? null;
  const resumo = r.resumo || sessao.parsed.resumo || null;
  const pronto = !!(presentes || nomesPresentes.length);

  const parsed = {
    ...sessao.parsed,
    presentes, visitantes, resumo,
    nomes_presentes: nomesPresentes,
    nao_reconhecidos: [...new Set(naoReconhecidos)],
  };

  await supabase.from('whatsapp_coletas').update({
    whatsapp_message_id: messageId,
    raw_text: (ehAudio ? '[áudio] ' : '') + texto,
    parsed,
    status: pronto ? 'parseado' : 'aguardando_info',
  }).eq('id', sessao.id);

  let resposta;
  if (pronto) {
    const linhaNomes = nomesPresentes.length ? `\n👥 ${nomesPresentes.map(x => x.nome.split(' ')[0]).join(', ')}` : '';
    const linhaNao = parsed.nao_reconhecidos.length ? `\n❓ Não reconheci: ${parsed.nao_reconhecidos.join(', ')} (visitantes?)` : '';
    resposta = `Anotei o encontro do ${grupo.nome}:\n`
      + `✅ ${presentes ?? nomesPresentes.length} presente(s)${visitantes ? ` · ${visitantes} visitante(s)` : ''}`
      + linhaNomes + linhaNao
      + (resumo ? `\n📝 ${resumo}` : '')
      + '\n\nUm coordenador vai conferir e o encontro entra no histórico do grupo. Se quiser, manda também uma foto! 📸';
  } else {
    resposta = r.resposta || `Me conta como foi o encontro do ${grupo.nome}: quantas pessoas vieram, quem veio e um resumo breve. Pode ser áudio! 🙏`;
  }
  await enviarTexto(telefone, resposta);
  return true;
}

// Loga uma coleta simples (dedup por message_id · ignora duplicata)
async function registrarColetaSimples({ messageId, telefone, lider, texto, erro }) {
  const { error } = await supabase.from('whatsapp_coletas').insert({
    whatsapp_message_id: messageId, telefone, lider_id: lider?.id || null,
    raw_text: texto, status: 'ignorado', modulo_destino: 'grupos', erro,
  });
  if (error && error.code !== '23505') console.error('[whatsappGrupos] log coleta:', error.message);
}

// ════════════════════════════════════════════════════════════════════════════
// CRON DIÁRIO
// ════════════════════════════════════════════════════════════════════════════

// Lembrete pós-encontro: grupos cujo dia_semana foi ONTEM → pergunta ao líder.
// Dedup pelo message_id sintético da sessão (1 lembrete por grupo/data).
async function enviarLembretesEncontro() {
  const ontem = new Date(); ontem.setDate(ontem.getDate() - 1);
  const dataEncontro = ontem.toISOString().slice(0, 10);
  const dia = ontem.getDay();

  const { data: grupos } = await supabase
    .from('mem_grupos')
    .select('id, nome, dia_semana, lider_id')
    .eq('ativo', true).is('deleted_at', null).eq('dia_semana', dia);
  if (!grupos?.length) return { grupos: 0, enviados: 0, sem_lider: 0 };

  const { data: lideres } = await supabase
    .from('whatsapp_lideres')
    .select('id, telefone, nome_exibicao, escopo, grupo_id, profile_id')
    .eq('ativo', true).is('deleted_at', null)
    .contains('escopo', ['grupos']);

  // Índices: por grupo_id direto + por membro líder (profile→email→membro)
  const porGrupoId = new Map();
  (lideres || []).forEach(l => { if (l.grupo_id) porGrupoId.set(l.grupo_id, l); });
  const porMembroLider = new Map();
  for (const l of (lideres || [])) {
    if (l.grupo_id || !l.profile_id) continue;
    const { data: prof } = await supabase.from('profiles').select('email').eq('id', l.profile_id).maybeSingle();
    if (!prof?.email) continue;
    const { data: membro } = await supabase.from('mem_membros').select('id').eq('email', prof.email).maybeSingle();
    if (membro?.id) porMembroLider.set(membro.id, l);
  }

  let enviados = 0, semLider = 0;
  for (const g of grupos) {
    const lider = porGrupoId.get(g.id) || (g.lider_id ? porMembroLider.get(g.lider_id) : null);
    if (!lider) { semLider++; continue; }

    const sessao = await abrirSessaoEncontro({ lider, telefone: lider.telefone, grupo: g, dataEncontro });
    if (!sessao) continue; // lembrete desse grupo/data já foi (dedup)

    const primeiro = (lider.nome_exibicao || '').split(' ')[0];
    const msg = `Oi${primeiro ? ', ' + primeiro : ''}! Como foi o encontro do ${g.nome} ontem? `
      + 'Me conta quantas pessoas vieram, quem veio e um resumo breve — pode ser por áudio. '
      + 'E se tiver foto do encontro, manda também! 📸';
    const r = await enviarComFallback(lider.telefone, msg, 'WHATSAPP_TEMPLATE_LEMBRETE_GRUPO', [primeiro || 'líder', g.nome]);
    if (r.ok) enviados++;
    else {
      await supabase.from('whatsapp_coletas')
        .update({ erro: ('lembrete_falhou: ' + String(r.error || '?')).slice(0, 250) })
        .eq('id', sessao.id);
    }
  }
  return { grupos: grupos.length, enviados, sem_lider: semLider };
}

// Estudo da semana: material marcado (estudo_semana=true) → broadcast 1:1
// pros líderes ativos com escopo grupos. Dedup semanal por líder.
async function enviarEstudoSemanal() {
  const { data: material } = await supabase
    .from('mem_grupo_documentos')
    .select('id, nome, comentario, storage_path, sharepoint_url')
    .eq('estudo_semana', true)
    .order('created_at', { ascending: false })
    .limit(1).maybeSingle();
  if (!material) return { enviados: 0, erro: 'nenhum material marcado como estudo da semana' };

  const link = material.storage_path || material.sharepoint_url || null;
  const { data: lideres } = await supabase
    .from('whatsapp_lideres')
    .select('id, telefone, nome_exibicao')
    .eq('ativo', true).is('deleted_at', null)
    .contains('escopo', ['grupos']);
  if (!lideres?.length) return { enviados: 0, erro: 'nenhum líder com escopo grupos' };

  const semana = isoSemana();
  let enviados = 0, pulados = 0, falhas = 0;
  for (const l of lideres) {
    // Dedup semanal: 1 log por líder/semana (UNIQUE no message_id)
    const { error: dupErr } = await supabase.from('whatsapp_coletas').insert({
      whatsapp_message_id: `estudo:${semana}:${l.id}`,
      telefone: l.telefone, lider_id: l.id,
      raw_text: `[estudo da semana enviado: ${material.nome}]`,
      status: 'ignorado', modulo_destino: 'grupos', erro: 'estudo_enviado',
    });
    if (dupErr) { if (dupErr.code === '23505') { pulados++; continue; } falhas++; continue; }

    const primeiro = (l.nome_exibicao || '').split(' ')[0];
    const titulo = material.comentario || material.nome;
    const msg = `Oi${primeiro ? ', ' + primeiro : ''}! 📖 O estudo desta semana pros grupos de conexão já está disponível: `
      + `*${titulo}*${link ? `\n${link}` : '\nBaixa na aba Materiais do módulo Grupos.'}`
      + '\nBom encontro! 🙌';
    const r = await enviarComFallback(l.telefone, msg, 'WHATSAPP_TEMPLATE_ESTUDO_GRUPO', [primeiro || 'líder', titulo]);
    if (r.ok) enviados++;
    else {
      falhas++;
      await supabase.from('whatsapp_coletas')
        .update({ erro: ('estudo_falhou: ' + String(r.error || '?')).slice(0, 250) })
        .eq('whatsapp_message_id', `estudo:${semana}:${l.id}`);
    }
  }
  return { material: material.nome, lideres: lideres.length, enviados, pulados, falhas };
}

// ════════════════════════════════════════════════════════════════════════════
// APLICAR · coleta de relato vira ENCONTRO REAL (chamada nominal)
// Reusa a RPC registrar_encontro_grupo (mesma do botão "Registrar encontro").
// ════════════════════════════════════════════════════════════════════════════
async function aplicarColetaGrupoEncontro(coleta, userId) {
  const p = coleta.parsed || {};
  if (!p.grupo_id) return { ok: false, status: 422, error: 'Coleta sem grupo vinculado. Lance manualmente.' };

  const ids = (p.nomes_presentes || []).map(x => x.membro_id).filter(Boolean);
  const obsPartes = ['Via WhatsApp'];
  if (p.resumo) obsPartes.push(p.resumo);
  if (p.visitantes) obsPartes.push(`${p.visitantes} visitante(s)`);
  if (p.presentes && ids.length && Number(p.presentes) !== ids.length) {
    obsPartes.push(`líder informou ${p.presentes} presentes (${ids.length} identificados nominalmente)`);
  }
  if ((p.nao_reconhecidos || []).length) obsPartes.push(`não reconhecidos: ${p.nao_reconhecidos.join(', ')}`);
  if ((p.fotos || []).length) obsPartes.push(`fotos: ${p.fotos.join(' ')}`);

  const { data: encontroId, error } = await supabase.rpc('registrar_encontro_grupo', {
    p_grupo_id: p.grupo_id,
    p_data: p.data_encontro || hojeISO(),
    p_tema: 'Encontro do grupo',
    p_observacoes: obsPartes.join(' · '),
    p_registrado_por: userId || null,
    p_registrado_por_nome: 'Bot WhatsApp',
    p_membros_presentes: ids,
  });
  if (error) {
    if (error.code === '23505') {
      return { ok: false, status: 409, error: 'Já existe encontro registrado nessa data pra esse grupo. Edite o encontro existente.' };
    }
    return { ok: false, status: 400, error: error.message };
  }

  await supabase.from('whatsapp_coletas')
    .update({ status: 'aplicado', aplicado_em: new Date().toISOString(), aplicado_por: userId || null, destino_ref: encontroId || null })
    .eq('id', coleta.id);

  return { ok: true, destino: 'encontro', encontro_id: encontroId, presencas: ids.length };
}

module.exports = {
  tratarMensagemGrupos,
  enviarLembretesEncontro,
  enviarEstudoSemanal,
  aplicarColetaGrupoEncontro,
  audioConfigurado,
};
