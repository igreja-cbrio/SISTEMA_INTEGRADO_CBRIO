// Admin do bot WhatsApp · vinculo de líderes + revisao/aplicacao de coletas.
// Autenticado · exige nível >= 3 em integração OU grupos (coordenador).
// O webhook público (recebimento) fica em routes/publicWhatsapp.js.
const router = require('express').Router();
const { authenticate, authorizeModule } = require('../middleware/auth');
const { supabase } = require('../utils/supabase');
const { normalizarTelefone } = require('../services/whatsappSend');
const { aplicarColetaGrupoEncontro } = require('../services/whatsappGrupos');

router.use(authenticate);

// Coordenador de integração OU grupos (nível 3+) gerencia o bot.
// 'whatsapp-admin' -> ['integração','grupos'] no ROUTE_MODULE_MAP.
const podeGerir = authorizeModule('whatsapp-admin', 3);
const wpp = require('../services/whatsappService');

// POST /api/whatsapp/test-disparo { chave? } — dispara um template pra VOCÊ
// (seu membro) e devolve o resultado/motivo. Pra validar env + template sem
// esperar o evento real.
router.post('/test-disparo', podeGerir, async (req, res) => {
  try {
    const chave = req.body?.chave || 'pedido_atualizado';
    const { data: prof } = await supabase.from('profiles').select('name, membro_id').eq('id', req.user.userId).maybeSingle();
    if (!prof?.membro_id) return res.json({ ok: false, motivo: 'Seu perfil não está ligado a um membro (sem telefone para enviar).' });
    const nome = (prof.name || '').trim().split(/\s+/)[0] || 'Olá';
    const PARAMS = {
      pedido_atualizado: [nome, 'Solicitação de teste', 'em andamento', 'Disparo de teste do sistema.', 'https://cbrio.org/solicitacoes'],
      inscricao_confirmada: [nome, 'Evento de teste'],
      kids_precheckin: ['TESTE12'],
      batismo_lembrete: ['amanhã', '19h'],
      aniversario: [nome],
      kids_vinculo: ['Criança Teste', 'aprovado'],
    };
    const r = await wpp.notificarMembro(prof.membro_id, chave, PARAMS[chave] || [nome]);
    res.json({ ok: !!r?.sent, chave, resultado: r });
  } catch (e) {
    console.error('[WPP] test-disparo:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════════════════════════════════
// LÍDERES · vinculo telefone -> profile
// ═══════════════════════════════════════════════════════════════════

// GET /api/whatsapp/lideres
router.get('/lideres', podeGerir, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('whatsapp_lideres')
      .select(`
        id, telefone, nome_exibicao, escopo, grupo_id, papel, ativo, created_at, recebe_lembretes, origem,
        profile:profiles!whatsapp_lideres_profile_id_fkey(id, name, email, avatar_url),
        grupo:mem_grupos(id, nome)
      `)
      .is('deleted_at', null)
      .order('created_at', { ascending: false });
    if (error) return res.status(400).json({ error: error.message });
    res.json(data || []);
  } catch (e) {
    console.error('[whatsapp] lideres list', e.message);
    res.status(500).json({ error: 'Erro ao listar líderes' });
  }
});

// POST /api/whatsapp/lideres · { profile_id, telefone, escopo[], grupo_id?, papel? }
router.post('/lideres', podeGerir, async (req, res) => {
  try {
    const { profile_id, telefone, escopo, grupo_id, papel } = req.body || {};
    const tel = normalizarTelefone(telefone);
    if (!tel || tel.length < 12 || tel.length > 13) {
      return res.status(400).json({ error: 'Telefone invalido. Use DDI+DDD+número (ex: 5521999998888).' });
    }
    if (!Array.isArray(escopo) || escopo.length === 0) {
      return res.status(400).json({ error: 'Informe ao menos um escopo (grupos/integracao).' });
    }
    const escopoValido = escopo.filter(s => ['grupos', 'integracao'].includes(s));
    if (escopoValido.length === 0) {
      return res.status(400).json({ error: 'Escopo deve conter grupos e/ou integração.' });
    }

    // Cache do nome pra exibir rapido
    let nome_exibicao = null;
    if (profile_id) {
      const { data: prof } = await supabase.from('profiles').select('name').eq('id', profile_id).maybeSingle();
      nome_exibicao = prof?.name || null;
    }

    const { data, error } = await supabase
      .from('whatsapp_lideres')
      .insert({
        profile_id: profile_id || null,
        telefone: tel,
        nome_exibicao,
        escopo: escopoValido,
        grupo_id: grupo_id || null,
        papel: papel || null,
        ativo: true,
        created_by: req.user?.userId || null,
      })
      .select('id')
      .single();
    if (error) {
      if (error.code === '23505') return res.status(409).json({ error: 'Esse telefone já esta vinculado.' });
      return res.status(400).json({ error: error.message });
    }
    res.status(201).json(data);
  } catch (e) {
    console.error('[whatsapp] lideres create', e.message);
    res.status(500).json({ error: 'Erro ao vincular líder' });
  }
});

// PUT /api/whatsapp/lideres/:id · { escopo?, grupo_id?, ativo? }
router.put('/lideres/:id', podeGerir, async (req, res) => {
  try {
    const patch = {};
    if (Array.isArray(req.body?.escopo)) {
      patch.escopo = req.body.escopo.filter(s => ['grupos', 'integracao'].includes(s));
    }
    if ('grupo_id' in (req.body || {})) patch.grupo_id = req.body.grupo_id || null;
    if ('papel' in (req.body || {})) patch.papel = req.body.papel || null;
    if (typeof req.body?.ativo === 'boolean') patch.ativo = req.body.ativo;
    if (typeof req.body?.recebe_lembretes === 'boolean') patch.recebe_lembretes = req.body.recebe_lembretes;
    if (Object.keys(patch).length === 0) return res.status(400).json({ error: 'Nada para atualizar' });

    const { error } = await supabase.from('whatsapp_lideres').update(patch).eq('id', req.params.id);
    if (error) return res.status(400).json({ error: error.message });
    res.json({ ok: true });
  } catch (e) {
    console.error('[whatsapp] lideres update', e.message);
    res.status(500).json({ error: 'Erro ao atualizar líder' });
  }
});

// DELETE /api/whatsapp/lideres/:id · soft delete
router.delete('/lideres/:id', podeGerir, async (req, res) => {
  try {
    const { error } = await supabase.rpc('app_soft_delete', {
      p_table_name: 'whatsapp_lideres',
      p_row_id: req.params.id,
      p_deleted_by: req.user?.userId || null,
    });
    if (error) return res.status(400).json({ error: error.message });
    res.json({ ok: true });
  } catch (e) {
    console.error('[whatsapp] lideres delete', e.message);
    res.status(500).json({ error: 'Erro ao remover líder' });
  }
});

// ═══════════════════════════════════════════════════════════════════
// COLETAS · revisão e aplicação
// ═══════════════════════════════════════════════════════════════════

// GET /api/whatsapp/coletas?status=parseado
router.get('/coletas', podeGerir, async (req, res) => {
  try {
    let q = supabase
      .from('whatsapp_coletas')
      .select(`
        id, telefone, raw_text, parsed, modulo_destino, status,
        aplicado_em, erro, created_at,
        lider:whatsapp_lideres(id, nome_exibicao, escopo, grupo_id)
      `)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(100);
    if (req.query.status) q = q.eq('status', req.query.status);
    const { data, error } = await q;
    if (error) return res.status(400).json({ error: error.message });
    res.json(data || []);
  } catch (e) {
    console.error('[whatsapp] coletas list', e.message);
    res.status(500).json({ error: 'Erro ao listar coletas' });
  }
});

// Aplica uma coleta vinda do FORMULÁRIO (Flow): usa o culto escolhido pelo
// líder e cria submissão(ões) de frequência (templo/kids · fila de pendentes).
// As PESSOAS que decidiram NÃO são criadas aqui — o cadastro nominal é no
// computador (aba Decisões → Pessoas do /integracao). O WhatsApp coleta só as
// contagens; `a_cadastrar` indica quantas decisões aguardam cadastro lá.
async function aplicarColetaFlow(coleta, req, res) {
  const p = coleta.parsed || {};
  if (!p.culto_id) {
    return res.status(422).json({ error: 'Formulário sem culto vinculado. Lance manualmente.' });
  }
  const freq = p.freq || {};
  const dec = p.dec || {};
  // Decisões online não viram submissão (ambiente só aceita templo/kids · a
  // frequência online vem da API). Fica na observação pro coordenador lançar
  // na aba Online do /integracao.
  const notaOnline = dec.online ? ` · ⚠ ${dec.online} decisão(ões) online (lançar na aba Online)` : '';
  const obs = 'Via WhatsApp (formulário) · ' + (p.resumo || '') + notaOnline;
  const submissoes = [];
  async function criarSub(ambiente, presencial, decisoes) {
    if ((presencial === null || presencial === undefined) && !decisoes) return;
    const { data: sub, error } = await supabase.from('cultos_dados_submissoes')
      .insert({
        culto_id: p.culto_id, ambiente,
        presencial: Math.round(presencial || 0), decisoes: Math.round(decisoes || 0),
        observacao: obs, status: 'pendente', submitted_by: req.user?.userId || null,
      })
      .select('id').single();
    if (error && error.code !== '23505') throw new Error(error.message); // 23505 = já existe pendente, ignora
    if (sub) submissoes.push(sub.id);
  }
  await criarSub('templo', freq.presencial, dec.presencial);
  if ((freq.kids !== null && freq.kids !== undefined) || dec.kids) await criarSub('kids', freq.kids, dec.kids);

  await supabase.from('whatsapp_coletas')
    .update({ status: 'aplicado', aplicado_em: new Date().toISOString(), aplicado_por: req.user?.userId || null, destino_ref: submissoes[0] || null })
    .eq('id', coleta.id);
  return res.json({ ok: true, destino: 'submissao_pendente', submissoes, a_cadastrar: p.a_cadastrar || 0 });
}

// POST /api/whatsapp/coletas/:id/aplicar
// integração · cria submissao pendente no culto mais recente (cai na fila
//              existente /integracao?tab=pendentes pro coord aprovar)
// grupos · marca aplicado (lancamento manual no módulo Grupos · o encontro
//          exige lista nominal de presenças que o WhatsApp não fornece)
router.post('/coletas/:id/aplicar', podeGerir, async (req, res) => {
  try {
    const { data: coleta, error: errFetch } = await supabase
      .from('whatsapp_coletas')
      .select('id, parsed, modulo_destino, status')
      .eq('id', req.params.id)
      .single();
    if (errFetch || !coleta) return res.status(404).json({ error: 'Coleta não encontrada' });
    if (coleta.status !== 'parseado') {
      return res.status(409).json({ error: `Coleta já esta "${coleta.status}".` });
    }

    const dados = coleta.parsed?.dados || {};

    if (coleta.modulo_destino === 'integracao') {
      // Coleta via formulário (Flow): culto escolhido + pessoas que decidiram
      if (coleta.parsed?.fonte === 'flow') {
        return await aplicarColetaFlow(coleta, req, res);
      }
      // Acha o culto mais recente dos últimos 7 dias
      const hoje = new Date().toISOString().slice(0, 10);
      const limite = new Date(); limite.setDate(limite.getDate() - 7);
      const desde = limite.toISOString().slice(0, 10);
      const { data: culto } = await supabase
        .from('cultos')
        .select('id, data')
        .gte('data', desde).lte('data', hoje)
        .order('data', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!culto) {
        return res.status(422).json({ error: 'Nenhum culto nos últimos 7 dias pra associar. Lance manualmente.' });
      }
      const ambiente = (dados.kids != null && dados.presencial == null) ? 'kids' : 'templo';
      const presencial = ambiente === 'kids' ? (dados.kids ?? 0) : (dados.presencial ?? 0);
      const { data: sub, error: errSub } = await supabase
        .from('cultos_dados_submissoes')
        .insert({
          culto_id: culto.id,
          ambiente,
          presencial: Math.round(presencial),
          decisoes: Math.round(dados.decisoes ?? 0),
          observacao: 'Via WhatsApp · ' + (coleta.parsed?.resumo || ''),
          status: 'pendente',
          submitted_by: req.user?.userId || null,
        })
        .select('id')
        .single();
      if (errSub) {
        if (errSub.code === '23505') {
          return res.status(409).json({ error: 'Já existe submissao ativa desse ambiente no culto. Veja em Pendentes.' });
        }
        return res.status(400).json({ error: errSub.message });
      }
      await supabase.from('whatsapp_coletas')
        .update({ status: 'aplicado', aplicado_em: new Date().toISOString(), aplicado_por: req.user?.userId || null, destino_ref: sub.id })
        .eq('id', coleta.id);
      return res.json({ ok: true, destino: 'submissao_pendente', submissao_id: sub.id });
    }

    // grupos · relato de encontro (texto/áudio do líder) → cria o ENCONTRO
    // real com presenças nominais (RPC registrar_encontro_grupo) e alimenta
    // o histórico do grupo + aba Relatórios.
    if (coleta.modulo_destino === 'grupos' && coleta.parsed?.fonte === 'grupo_encontro') {
      const r = await aplicarColetaGrupoEncontro(coleta, req.user?.userId || null);
      if (!r.ok) return res.status(r.status || 400).json({ error: r.error });
      return res.json({ ok: true, destino: r.destino, encontro_id: r.encontro_id, presencas: r.presencas });
    }

    // grupos legado (números soltos sem nominal) ou qualquer outro · so marca
    // aplicado (lancamento manual)
    await supabase.from('whatsapp_coletas')
      .update({ status: 'aplicado', aplicado_em: new Date().toISOString(), aplicado_por: req.user?.userId || null })
      .eq('id', coleta.id);
    return res.json({ ok: true, destino: 'manual' });
  } catch (e) {
    console.error('[whatsapp] coletas aplicar', e.message);
    res.status(500).json({ error: 'Erro ao aplicar coleta' });
  }
});

// POST /api/whatsapp/coletas/:id/rejeitar · { motivo? }
router.post('/coletas/:id/rejeitar', podeGerir, async (req, res) => {
  try {
    const { error } = await supabase.from('whatsapp_coletas')
      .update({ status: 'rejeitado', erro: req.body?.motivo || null })
      .eq('id', req.params.id);
    if (error) return res.status(400).json({ error: error.message });
    res.json({ ok: true });
  } catch (e) {
    console.error('[whatsapp] coletas rejeitar', e.message);
    res.status(500).json({ error: 'Erro ao rejeitar coleta' });
  }
});

// ═══════════════════════════════════════════════════════════════════
// CONFIG · conteudo institucional + toggle da IA (linha unica id=1)
// ═══════════════════════════════════════════════════════════════════

// ── Broadcast pra equipe (aviso pontual) ────────────────────────────
// Destinatários = profiles ativos que JÁ LOGARAM no sistema e têm celular
// cadastrado (Meu Perfil), deduplicados por número (contas duplicadas da
// mesma pessoa contam 1x). Texto livre via Cloud API: fora da janela de 24h
// da Meta o envio pode falhar — o resultado por pessoa volta no relatório.
async function resolverDestinatariosBroadcast() {
  // last_sign_in_at vive em auth.users · via admin API (service role)
  const logados = new Set();
  let page = 1;
  for (;;) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(error.message);
    for (const u of data?.users || []) {
      if (u.last_sign_in_at) logados.add(u.id);
    }
    if (!data?.users?.length || data.users.length < 200) break;
    page += 1;
  }

  const { data: profs, error: pErr } = await supabase
    .from('profiles')
    .select('id, name, email, telefone')
    .eq('active', true)
    .not('telefone', 'is', null);
  if (pErr) throw new Error(pErr.message);

  const porTelefone = new Map();
  for (const p of profs || []) {
    if (!logados.has(p.id)) continue;
    const email = (p.email || '').toLowerCase();
    if (email.startsWith('agente.') || email.startsWith('qa.')) continue;
    const tel = normalizarTelefone(p.telefone);
    if (!tel || tel.length < 12) continue; // 55 + DDD + número
    if (!porTelefone.has(tel)) porTelefone.set(tel, { nome: p.name, email: p.email, telefone: tel });
  }
  return [...porTelefone.values()].sort((a, b) => (a.nome || '').localeCompare(b.nome || ''));
}

// GET /api/whatsapp/broadcast/destinatarios — prévia da lista
router.get('/broadcast/destinatarios', podeGerir, async (req, res) => {
  try {
    const destinatarios = await resolverDestinatariosBroadcast();
    res.json({ total: destinatarios.length, destinatarios });
  } catch (e) {
    console.error('[whatsapp] broadcast destinatarios', e.message);
    res.status(500).json({ error: 'Erro ao montar a lista de destinatários' });
  }
});

// POST /api/whatsapp/broadcast · { mensagem } — usa {nome} como placeholder
router.post('/broadcast', podeGerir, async (req, res) => {
  try {
    const mensagem = (req.body?.mensagem || '').toString().trim();
    if (mensagem.length < 20) {
      return res.status(400).json({ error: 'Escreva a mensagem (mínimo 20 caracteres).' });
    }
    const { enviarTexto, isConfigured } = require('../services/whatsappSend');
    if (!isConfigured()) {
      return res.status(503).json({ error: 'WhatsApp não configurado (credenciais ausentes).' });
    }
    const destinatarios = await resolverDestinatariosBroadcast();
    if (!destinatarios.length) return res.status(400).json({ error: 'Nenhum destinatário com celular cadastrado.' });

    const resultados = [];
    for (const d of destinatarios) {
      const primeiroNome = (d.nome || '').trim().split(/\s+/)[0] || 'você';
      const texto = mensagem.replaceAll('{nome}', primeiroNome);
      const r = await enviarTexto(d.telefone, texto);
      resultados.push({ nome: d.nome, telefone: d.telefone, ok: !!r?.ok, erro: r?.ok ? null : (r?.error || 'falha') });
      await new Promise(rr => setTimeout(rr, 300)); // throttle leve
    }
    const enviados = resultados.filter(r => r.ok).length;
    console.log('[whatsapp] broadcast por %s: %d/%d enviados', req.user?.email, enviados, resultados.length);
    res.json({ total: resultados.length, enviados, resultados });
  } catch (e) {
    console.error('[whatsapp] broadcast', e.message);
    res.status(500).json({ error: 'Erro ao enviar o broadcast' });
  }
});

// GET /api/whatsapp/config
router.get('/config', podeGerir, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('whatsapp_config').select('ia_ativa, institucional, updated_at').eq('id', 1).maybeSingle();
    if (error) return res.status(400).json({ error: error.message });
    res.json(data || { ia_ativa: true, institucional: {} });
  } catch (e) {
    console.error('[whatsapp] config get', e.message);
    res.status(500).json({ error: 'Erro ao carregar config' });
  }
});

// PUT /api/whatsapp/config · { ia_ativa?, institucional? }
router.put('/config', podeGerir, async (req, res) => {
  try {
    const patch = { updated_at: new Date().toISOString(), updated_by: req.user?.userId || null };
    if (typeof req.body?.ia_ativa === 'boolean') patch.ia_ativa = req.body.ia_ativa;
    if (req.body?.institucional && typeof req.body.institucional === 'object') {
      patch.institucional = req.body.institucional;
    }
    const { error } = await supabase
      .from('whatsapp_config').update(patch).eq('id', 1);
    if (error) return res.status(400).json({ error: error.message });
    res.json({ ok: true });
  } catch (e) {
    console.error('[whatsapp] config put', e.message);
    res.status(500).json({ error: 'Erro ao salvar config' });
  }
});

module.exports = router;
