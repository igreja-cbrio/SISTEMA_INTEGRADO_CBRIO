const router = require('express').Router();
const { authenticate } = require('../middleware/auth');
const { supabase } = require('../utils/supabase');
const { notificar, resolverDestinatarios } = require('../services/notificar');
const { enviarEmail } = require('../services/email');
const painelCache = require('../services/painelCache');
const mlTracker = require('../services/solicitacoesMlTracker');
const solicFluxo = require('../services/solicFluxo');

const CRON_SECRET = process.env.CRON_SECRET;
const { isAuthorizedCron } = require('../utils/cronAuth');
const wpp = require('../services/whatsappService');
const multer = require('multer');
const crypto = require('crypto');
const { extrairNotaFiscal, sugerirCategoria } = require('../services/nfScanner');
const { lancarDespesaConciliando } = require('../services/finLancamento');
const { aprenderClassificacao } = require('../services/financeiroClassificador');
const { elegivelAlcada, LIMITE_ALCADA_PADRAO } = require('../utils/alcadaCompras');
const uploadNfSolic = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });

// Dispara o WhatsApp pro solicitante quando a solicitação muda de status
// (template pedido_atualizado · 5 params). No-op se sem env / sem membro / sem
// telefone. Fire-and-forget · nunca quebra o fluxo.
async function notificarPedidoWhatsapp(solicitacaoId, statusLabel, detalhe) {
  try {
    const { data: sol } = await supabase.from('solicitacoes').select('titulo, solicitante_id').eq('id', solicitacaoId).maybeSingle();
    if (!sol?.solicitante_id) return;
    const { data: prof } = await supabase.from('profiles').select('name, membro_id').eq('id', sol.solicitante_id).maybeSingle();
    if (!prof?.membro_id) return;
    const primeiroNome = (prof.name || '').trim().split(/\s+/)[0] || 'Olá';
    const link = `${process.env.FRONTEND_URL || 'https://cbrio.org'}/solicitacoes`;
    await wpp.notificarMembro(prof.membro_id, 'pedido_atualizado', [
      primeiroNome, sol.titulo || 'sua solicitação', String(statusLabel || '').replace(/_/g, ' '),
      detalhe ? String(detalhe).slice(0, 200) : 'Sem detalhes adicionais.', link,
    ]);
  } catch (e) { console.error('[SOLICITACOES] wpp pedido:', e.message); }
}

// ── CRON · ATUALIZAR STATUS DE PEDIDOS ML VINCULADOS ───────────────────
// Montado ANTES do authenticate · auth via CRON_SECRET (Vercel/GitHub Actions).
router.post('/cron/atualizar-ml', async (req, res) => {
  if (!isAuthorizedCron(req)) {
    return res.status(401).json({ erro: 'Nao autorizado' });
  }
  try {
    const result = await mlTracker.processarUpdates({ batchSize: 30, throttleMs: 200 });
    res.json(result);
  } catch (e) {
    console.error('[SOLICITACOES cron-ml] erro:', e.message);
    res.status(500).json({ ok: false, erro: e.message });
  }
});

router.use(authenticate);

// ── MOTOR DE FLUXO · visualização read-only (Fase 1) ──────────────────────
// Declarado ANTES de qualquer `/:id` pra não ser capturado pela rota genérica.
// Guard: admin/super-admin (config do sistema · o editor Fase 2 será só super-admin).
router.get('/fluxos', async (req, res) => {
  try {
    if (!(await isAdminFallback(req)) && !['admin', 'diretor'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Sem permissão para ver os fluxos.' });
    }
    res.json(await solicFluxo.listCategoriasComFluxo());
  } catch (e) {
    console.error('[SOLICITACOES] listar fluxos:', e.message);
    res.status(500).json({ error: e.message });
  }
});

router.get('/fluxos/:categoria', async (req, res) => {
  try {
    if (!(await isAdminFallback(req)) && !['admin', 'diretor'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Sem permissão para ver este fluxo.' });
    }
    const fluxo = await solicFluxo.getFluxoAtivo(req.params.categoria);
    if (!fluxo) return res.status(404).json({ error: 'Nenhum fluxo configurado para esta categoria.' });
    res.json(fluxo);
  } catch (e) {
    console.error('[SOLICITACOES] obter fluxo:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// Contagem de solicitações EM ANDAMENTO por status (pra "encaixar" no fluxo · a UI
// casa cada status com a etapa via status_map). Não cacheado (muda com o uso).
router.get('/fluxos/:categoria/andamento', async (req, res) => {
  try {
    if (!(await isAdminFallback(req)) && !['admin', 'diretor'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Sem permissão.' });
    }
    const fluxo = await solicFluxo.getFluxoAtivo(req.params.categoria);
    if (!fluxo) return res.json({ porStatus: {} });
    const statuses = [...new Set((fluxo.etapas || []).map(e => e.status_map).filter(Boolean))];
    const porStatus = {};
    await Promise.all(statuses.map(async st => {
      const { count } = await supabase
        .from('solicitacoes')
        .select('id', { count: 'exact', head: true })
        .eq('categoria', req.params.categoria).eq('status', st).is('deleted_at', null);
      porStatus[st] = count || 0;
    }));
    res.json({ porStatus });
  } catch (e) {
    console.error('[SOLICITACOES] andamento fluxo:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// Atribuir/remover RESPONSÁVEIS de uma etapa (Fase 2 · super-admin). Grava na
// tabela que os guards leem e ESPELHA (aditivo) na área pra manter fila/notificação.
router.put('/fluxos/etapas/:etapaId/responsaveis', async (req, res) => {
  try {
    if (!(await isAdminFallback(req))) {
      return res.status(403).json({ error: 'Apenas administradores podem editar o fluxo.' });
    }
    const { profile_ids } = req.body || {};
    if (!Array.isArray(profile_ids)) return res.status(400).json({ error: 'profile_ids deve ser array' });

    const { data: etapa, error: eErr } = await supabase
      .from('solic_fluxo_etapas')
      .select('id, area, solic_fluxos(categoria)')
      .eq('id', req.params.etapaId).is('deleted_at', null).maybeSingle();
    if (eErr) throw eErr;
    if (!etapa) return res.status(404).json({ error: 'Etapa não encontrada.' });

    const ids = [...new Set(profile_ids.filter(Boolean))];
    // Valida contra profiles (mesma lição do FK · não deixa quebrar por quem não logou).
    if (ids.length) {
      const { data: ex } = await supabase.from('profiles').select('id').in('id', ids);
      const validos = new Set((ex || []).map(p => p.id));
      const inval = ids.filter(i => !validos.has(i));
      if (inval.length) {
        return res.status(400).json({
          error: 'Uma das pessoas ainda não tem conta no sistema (precisa fazer o primeiro login). Nada foi alterado.',
          invalidos: inval,
        });
      }
    }

    // Substitui os responsáveis DA ETAPA.
    const { error: delErr } = await supabase
      .from('solic_fluxo_etapa_responsaveis').delete().eq('etapa_id', etapa.id);
    if (delErr) throw delErr;
    if (ids.length) {
      const { error: insErr } = await supabase.from('solic_fluxo_etapa_responsaveis')
        .insert(ids.map(pid => ({ etapa_id: etapa.id, profile_id: pid, criado_por: req.user.userId })));
      if (insErr) throw insErr;
    }

    // Espelha na área (ADITIVO · só adiciona quem falta · nunca remove) pra o
    // responsável já ver a fila e receber notificação. Best-effort (área pode não
    // ser um valor válido do enum area_adm_resp).
    if (etapa.area && ids.length) {
      try {
        const { data: jaResp } = await supabase
          .from('area_solicitacoes_responsaveis').select('profile_id').eq('area', etapa.area);
        const existentes = new Set((jaResp || []).map(r => r.profile_id));
        const novos = ids.filter(i => !existentes.has(i));
        if (novos.length) {
          await supabase.from('area_solicitacoes_responsaveis')
            .insert(novos.map(pid => ({ area: etapa.area, profile_id: pid, criado_por: req.user.userId })));
        }
      } catch (mirrErr) {
        console.warn('[SOLICITACOES] espelho área falhou (best-effort):', mirrErr.message);
      }
    }

    solicFluxo.bustCache(etapa.solic_fluxos?.categoria);
    res.json({ ok: true, etapa_id: etapa.id, count: ids.length });
  } catch (e) {
    console.error('[SOLICITACOES] etapa responsaveis PUT:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── EDIÇÃO DE TOPOLOGIA DO FLUXO (Fase 2 · super-admin) ───────────────────────
const FLUXO_TIPOS = ['inicio', 'etapa', 'aprovacao', 'execucao', 'entrega', 'fim'];
const FLUXO_STATUS_VALIDOS = [
  'aguardando_aprovacao_origem', 'em_cotacao', 'pendente', 'em_analise', 'aprovado',
  'rejeitado', 'concluido', 'aguardando_aprovacao_financeira', 'em_atendimento',
  'aguardando_entrega', 'avaliado', 'aguardando_ajuste', 'cancelado', 'aguardando_merito', 'sobrestada',
];
async function guardFluxoAdmin(req, res) {
  if (!(await isAdminFallback(req))) { res.status(403).json({ error: 'Apenas administradores podem editar o fluxo.' }); return false; }
  return true;
}

// Criar etapa no fluxo ATIVO da categoria
router.post('/fluxos/:categoria/etapas', async (req, res) => {
  try {
    if (!(await guardFluxoAdmin(req, res))) return;
    const b = req.body || {};
    if (!b.label || !String(b.label).trim()) return res.status(400).json({ error: 'Informe o nome da etapa.' });
    const tipo = FLUXO_TIPOS.includes(b.tipo) ? b.tipo : 'etapa';
    if (b.status_map && !FLUXO_STATUS_VALIDOS.includes(b.status_map)) return res.status(400).json({ error: 'Status inválido.' });
    const { data: fluxo } = await supabase.from('solic_fluxos')
      .select('id').eq('categoria', req.params.categoria).eq('is_ativa', true).is('deleted_at', null).maybeSingle();
    if (!fluxo) return res.status(404).json({ error: 'Sem fluxo ativo para esta categoria.' });
    const chave = (String(b.chave || b.label).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'etapa') + '_' + Date.now().toString(36).slice(-4);
    const { data: maxOrdem } = await supabase.from('solic_fluxo_etapas')
      .select('ordem').eq('fluxo_id', fluxo.id).is('deleted_at', null).order('ordem', { ascending: false }).limit(1).maybeSingle();
    const { data, error } = await supabase.from('solic_fluxo_etapas').insert({
      fluxo_id: fluxo.id, chave, label: String(b.label).trim(), tipo,
      ordem: (maxOrdem?.ordem ?? -1) + 1,
      area: b.area || null, modulo: b.modulo || null,
      status_map: b.status_map || null, sla_horas: b.sla_horas ?? null,
      descricao: b.descricao || null,
      pos_x: b.pos_x ?? 0, pos_y: b.pos_y ?? 0,
    }).select('*').single();
    if (error) throw error;
    solicFluxo.bustCache(req.params.categoria);
    res.status(201).json(data);
  } catch (e) { console.error('[SOLICITACOES] criar etapa:', e.message); res.status(500).json({ error: e.message }); }
});

// Editar etapa (campos + posição)
router.patch('/fluxos/etapas/:id', async (req, res) => {
  try {
    if (!(await guardFluxoAdmin(req, res))) return;
    const b = req.body || {};
    if (b.tipo != null && !FLUXO_TIPOS.includes(b.tipo)) return res.status(400).json({ error: 'Tipo inválido.' });
    if (b.status_map && !FLUXO_STATUS_VALIDOS.includes(b.status_map)) return res.status(400).json({ error: 'Status inválido.' });
    const patch = { atualizado_em: new Date().toISOString() };
    for (const k of ['label', 'tipo', 'area', 'modulo', 'status_map', 'sla_horas', 'descricao', 'pos_x', 'pos_y']) {
      if (b[k] !== undefined) patch[k] = b[k] === '' ? null : b[k];
    }
    const { data, error } = await supabase.from('solic_fluxo_etapas')
      .update(patch).eq('id', req.params.id).is('deleted_at', null)
      .select('*, solic_fluxos(categoria)').single();
    if (error) throw error;
    solicFluxo.bustCache(data?.solic_fluxos?.categoria);
    res.json(data);
  } catch (e) { console.error('[SOLICITACOES] editar etapa:', e.message); res.status(500).json({ error: e.message }); }
});

// Remover etapa (soft) + suas transições
router.delete('/fluxos/etapas/:id', async (req, res) => {
  try {
    if (!(await guardFluxoAdmin(req, res))) return;
    const now = new Date().toISOString();
    const { data: etapa } = await supabase.from('solic_fluxo_etapas')
      .select('id, solic_fluxos(categoria)').eq('id', req.params.id).maybeSingle();
    await supabase.from('solic_fluxo_etapas').update({ deleted_at: now }).eq('id', req.params.id);
    await supabase.from('solic_fluxo_transicoes').update({ deleted_at: now })
      .or(`de_etapa_id.eq.${req.params.id},para_etapa_id.eq.${req.params.id}`);
    solicFluxo.bustCache(etapa?.solic_fluxos?.categoria);
    res.json({ ok: true });
  } catch (e) { console.error('[SOLICITACOES] remover etapa:', e.message); res.status(500).json({ error: e.message }); }
});

// Criar transição (arrastar-pra-conectar)
router.post('/fluxos/transicoes', async (req, res) => {
  try {
    if (!(await guardFluxoAdmin(req, res))) return;
    const { de_etapa_id, para_etapa_id, verbo, label, condicao_tipo, condicao_valor } = req.body || {};
    if (!de_etapa_id || !para_etapa_id) return res.status(400).json({ error: 'Origem e destino são obrigatórios.' });
    if (de_etapa_id === para_etapa_id) return res.status(400).json({ error: 'Uma etapa não liga nela mesma.' });
    const { data: de } = await supabase.from('solic_fluxo_etapas')
      .select('fluxo_id, solic_fluxos(categoria)').eq('id', de_etapa_id).is('deleted_at', null).maybeSingle();
    const { data: para } = await supabase.from('solic_fluxo_etapas').select('fluxo_id').eq('id', para_etapa_id).is('deleted_at', null).maybeSingle();
    if (!de || !para) return res.status(404).json({ error: 'Etapa não encontrada.' });
    if (de.fluxo_id !== para.fluxo_id) return res.status(400).json({ error: 'As etapas são de fluxos diferentes.' });
    const { data, error } = await supabase.from('solic_fluxo_transicoes').insert({
      fluxo_id: de.fluxo_id, de_etapa_id, para_etapa_id,
      verbo: verbo || null, label: label || null,
      condicao_tipo: condicao_tipo || null, condicao_valor: condicao_valor || null,
    }).select('*').single();
    if (error) throw error;
    solicFluxo.bustCache(de.solic_fluxos?.categoria);
    res.status(201).json(data);
  } catch (e) { console.error('[SOLICITACOES] criar transicao:', e.message); res.status(500).json({ error: e.message }); }
});

// Remover transição (soft)
router.delete('/fluxos/transicoes/:id', async (req, res) => {
  try {
    if (!(await guardFluxoAdmin(req, res))) return;
    const { data: t } = await supabase.from('solic_fluxo_transicoes')
      .select('fluxo_id, solic_fluxos(categoria)').eq('id', req.params.id).maybeSingle();
    await supabase.from('solic_fluxo_transicoes').update({ deleted_at: new Date().toISOString() }).eq('id', req.params.id);
    solicFluxo.bustCache(t?.solic_fluxos?.categoria);
    res.json({ ok: true });
  } catch (e) { console.error('[SOLICITACOES] remover transicao:', e.message); res.status(500).json({ error: e.message }); }
});

// ── LOOP FINANCEIRO · classificação + NF (Fase 1 · não escreve no razão) ──────
// Listas de plano de contas (despesa · folha) + centros de custo pra o Amaury
// classificar na cotação (opcional ?area= pré-filtra centros por area_slug).
router.get('/aux/classificacao', async (req, res) => {
  try {
    let centrosQ = supabase.from('fin_centros_custo').select('id, codigo, nome, area_slug')
      .eq('ativo', true).eq('aceita_lancamento', true).order('codigo');
    if (req.query.area) centrosQ = centrosQ.eq('area_slug', String(req.query.area));
    const [planos, centros, contas] = await Promise.all([
      supabase.from('fin_plano_contas').select('id, codigo, nome')
        .eq('tipo', 'despesa').eq('ativo', true).eq('aceita_lancamento', true).order('codigo'),
      centrosQ,
      supabase.from('fin_contas').select('id, nome, banco').eq('ativa', true).order('nome'),
    ]);
    if (planos.error) throw planos.error;
    res.json({ planos: planos.data || [], centros: centros.data || [], contas: contas.data || [] });
  } catch (e) { console.error('[SOLICITACOES] aux classificacao:', e.message); res.status(500).json({ error: e.message }); }
});

// LOOP FINANCEIRO Fase 2 · lançar a despesa da compra e conciliar com o extrato.
// Só compra/serviço já aprovada no financeiro, ainda sem transação. Trava anti-
// duplicação (fin_transacao_id). Reusa o helper compartilhado com o fluxo de NF.
router.post('/:id/lancar-financeiro', async (req, res) => {
  try {
    const { conta_id, plano_contas_id, centro_custo_id, data_pagamento, observacoes } = req.body || {};
    const { data: sol } = await supabase.from('solicitacoes')
      .select('*').eq('id', req.params.id).is('deleted_at', null).maybeSingle();
    if (!sol) return res.status(404).json({ error: 'Solicitação não encontrada.' });
    if (!(await podeGerirSolicitacao(req, sol))) return res.status(403).json({ error: 'Você não pode lançar esta compra.' });
    if (!['compras', 'servico'].includes(sol.categoria)) return res.status(400).json({ error: 'Só compra/serviço gera lançamento.' });
    if (!sol.aprovado_financeiro_em) return res.status(400).json({ error: 'A compra ainda não foi aprovada no financeiro.' });
    if (sol.fin_transacao_id) return res.status(409).json({ error: 'Esta compra já foi lançada no financeiro.' });

    const finalPlano = plano_contas_id || sol.plano_contas_id;
    if (!finalPlano) return res.status(400).json({ error: 'Informe o plano de contas antes de lançar.' });
    const { data: plano } = await supabase.from('fin_plano_contas')
      .select('tipo, aceita_lancamento, ativo').eq('id', finalPlano).maybeSingle();
    if (!plano || plano.tipo !== 'despesa' || !plano.aceita_lancamento || plano.ativo === false) {
      return res.status(400).json({ error: 'Plano de contas inválido (conta de despesa que aceita lançamento).' });
    }
    const finalCentro = centro_custo_id !== undefined ? (centro_custo_id || null) : sol.centro_custo_id;
    const valor = Number(sol.valor_cotado ?? sol.valor_estimado) || 0;
    if (!valor) return res.status(400).json({ error: 'Compra sem valor cotado.' });

    const ex = sol.nota_fiscal_extracao || {};
    const dataBase = ex.data_emissao || new Date().toISOString().slice(0, 10);

    const r = await lancarDespesaConciliando({
      descricao: sol.titulo || `Compra ${String(sol.id).slice(0, 8)}`,
      valor, dataBase, dataPagamento: data_pagamento,
      referencia: ex.numero ? `NF ${ex.numero}` : `Solicitação ${String(sol.id).slice(0, 8)}`,
      observacoes,
      plano_contas_id: finalPlano, centro_custo_id: finalCentro, conta_id,
      classificacao_origem: 'manual', classificacao_confianca: 1.0,
      createdBy: req.user.userId,
      extras: { solicitacao_id: sol.id },
    });
    if (r.erro) return res.status(400).json({ error: r.erro, precisaConta: !!r.precisaConta });

    // Trava de idempotência: grava o elo só se ainda estava null (anti-corrida).
    const { data: upd } = await supabase.from('solicitacoes')
      .update({
        fin_transacao_id: r.transacao.id,
        fin_vinculo_status: r.conciliada ? 'conciliado' : 'lancado',
        plano_contas_id: finalPlano, centro_custo_id: finalCentro,
      })
      .eq('id', sol.id).is('fin_transacao_id', null).select('id').maybeSingle();
    if (!upd) {
      await supabase.from('fin_transacoes').update({ status: 'cancelado' }).eq('id', r.transacao.id);
      return res.status(409).json({ error: 'Esta compra já foi lançada por outra pessoa.' });
    }

    if (ex.emitente_cnpj) {
      aprenderClassificacao({ documento: ex.emitente_cnpj, nome: ex.emitente_nome, plano_contas_id: finalPlano, centro_custo_id: finalCentro })
        .catch(e => console.error('[SOLICITACOES] aprender lançar:', e.message));
    }
    notificar({
      modulo: 'financeiro', tipo: 'solicitacao_status',
      titulo: `Compra lançada no financeiro: ${sol.titulo}`,
      mensagem: `${r.conciliada ? 'Conciliada com o extrato' : 'Lançada como pendente'} · ${valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}.`,
      link: '/solicitacoes', severidade: 'info', chaveDedup: `solic_lancada_${sol.id}`,
      extraTargetIds: [sol.solicitante_id].filter(Boolean),
    }).catch(() => {});

    res.json({ transacao: r.transacao, conciliada: r.conciliada });
  } catch (e) {
    console.error('[SOLICITACOES] lancar-financeiro:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// Escanear a nota fiscal do pedido: sobe o arquivo + IA extrai + sugere plano/
// centro/fornecedor/valor. NÃO cria transação (só anexa a NF e devolve sugestão
// pra o Amaury confirmar). Guard = quem pode cotar.
router.post('/:id/nota-fiscal/escanear', uploadNfSolic.single('arquivo'), async (req, res) => {
  try {
    const { data: sol } = await supabase.from('solicitacoes')
      .select('*').eq('id', req.params.id).is('deleted_at', null).maybeSingle();
    if (!sol) return res.status(404).json({ error: 'Solicitação não encontrada.' });
    if (!(await podeCotar(req, sol))) return res.status(403).json({ error: 'Apenas a logística (ou admin) pode anexar a nota.' });
    if (!req.file) return res.status(400).json({ error: 'Nenhum arquivo enviado.' });

    const ext = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'application/pdf': 'pdf' }[req.file.mimetype] || 'bin';
    const path = `notas-fiscais/${Date.now()}-${crypto.randomBytes(4).toString('hex')}.${ext}`;
    const { error: upErr } = await supabase.storage.from('solicitacoes')
      .upload(path, req.file.buffer, { contentType: req.file.mimetype, upsert: false });
    if (upErr) return res.status(500).json({ error: `Erro ao salvar o arquivo: ${upErr.message}` });
    const url = supabase.storage.from('solicitacoes').getPublicUrl(path).data.publicUrl;

    let extraido = null, raw = null;
    try { ({ extraido, raw } = await extrairNotaFiscal(req.file.buffer, req.file.mimetype)); }
    catch (e) { console.error('[SOLICITACOES] NF extração:', e.message); }

    let sugestao = null;
    if (extraido?.valor_total) {
      sugestao = await sugerirCategoria({
        cnpj: extraido.emitente_cnpj, nome: extraido.emitente_nome,
        valor: extraido.valor_total, descricao: extraido.descricao_resumo,
      }).catch(() => null);
    }

    // Anexa a NF ao pedido já (arquivo + extração saneada). Plano/centro só são
    // gravados quando o Amaury confirmar (no enviar-cotacoes-financeiro).
    await supabase.from('solicitacoes')
      .update({ nota_fiscal_url: url, nota_fiscal_extracao: extraido || null })
      .eq('id', sol.id);

    res.json({ url, extracao_ok: !!extraido, extracao: extraido, sugestao });
  } catch (e) {
    console.error('[SOLICITACOES] escanear NF:', e.message);
    res.status(500).json({ error: 'Erro ao escanear a nota fiscal.' });
  }
});

// Bust do cache do painel após mutacao (afeta matriz adm/criativo)
router.use((req, res, next) => {
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
    res.on('finish', () => {
      if (res.statusCode >= 200 && res.statusCode < 300) painelCache.bust('');
    });
  }
  next();
});

const ALLOWED_CATEGORIES = ['ti', 'compras', 'reembolso', 'reserva_espaco', 'espaco', 'infraestrutura', 'hospitalidade', 'ferias', 'licenca', 'marketing', 'pagamento', 'servico', 'producao', 'outro'];

// Status que o PATCH genérico (kanban/drag/edição) pode definir. Os portões do
// fluxo BPMN (aguardando_aprovacao_origem, aguardando_merito, sobrestada,
// aguardando_ajuste, avaliado...) só transicionam pelos endpoints próprios —
// senão um drag no kanban pularia aprovação/mérito/sobrestamento.
const STATUS_PATCH_PERMITIDOS = ['pendente', 'em_analise', 'aprovado', 'rejeitado', 'concluido', 'em_atendimento', 'aguardando_entrega', 'em_cotacao', 'cancelado'];

// Map categoria → notification module
const CATEGORIA_MODULO = {
  ti: 'ti',
  compras: 'logistica',
  servico: 'logistica',     // contratação de fornecedor · logística negocia (Amaury)
  reembolso: 'financeiro',
  pagamento: 'financeiro',  // pagar boleto/NF de fornecedor · contas a pagar
  reserva_espaco: 'administrativo',
  espaco: 'administrativo', // legado
  infraestrutura: 'administrativo',
  hospitalidade: 'administrativo', // recepção, café, hospedagem de convidados · Amaury
  ferias: 'rh',
  licenca: 'rh',
  marketing: 'marketing',
  producao: 'producao',     // movimentação de material / configuração de equipamentos
  outro: 'administrativo',
};

// Map categoria → area_responsavel + subcategoria (Fase A backbone)
const CATEGORIA_TO_AREA_RESP = {
  ti:              { area: 'ti',                subcategoria: 'default' },
  compras:         { area: 'logistica_compras', subcategoria: 'default' },
  servico:         { area: 'logistica_compras', subcategoria: 'servico' },
  reembolso:       { area: 'financeiro',        subcategoria: 'reembolso' },
  pagamento:       { area: 'financeiro',        subcategoria: 'pagamento' },
  reserva_espaco:  { area: 'reserva_espaco',    subcategoria: 'default' },
  espaco:          { area: 'reserva_espaco',    subcategoria: 'default' },
  infraestrutura:  { area: 'manutencao',        subcategoria: 'default' },
  hospitalidade:   { area: 'hospitalidade',     subcategoria: 'default' },
  ferias:          { area: 'rh',                subcategoria: 'ferias' },
  licenca:         { area: 'rh',                subcategoria: 'licenca' },
  marketing:       { area: 'marketing',         subcategoria: 'default' },
  producao:        { area: 'producao',          subcategoria: 'default' },
  outro:           { area: null,                subcategoria: 'default' },
};

// A fila financeira fica no módulo Financeiro, não na lista operacional geral.
// O parâmetro da solicitação permite abrir diretamente o item que acabou de sair
// da cotação, sem expor a fila de logística ao aprovador financeiro.
function linkFilaFinanceira(solicitacaoId) {
  return `/admin/financeiro?aba=solicitacoes&solicitacao=${encodeURIComponent(solicitacaoId)}`;
}

// Categorias do setor CRIATIVO (pedido do Matheus · 2026-07-20): a aprovação de
// ORIGEM é do diretor do Criativo (Pedro Paulo), por CATEGORIA — não pelo setor
// de quem pede (pula Arthur Serpa/diretor do setor). Também pula o 2º carimbo de
// Gestão (Eduardo/Juliana) e o julgamento de mérito. COM custo (valor>0) o pedido
// vira uma compra cotada pela logística (Amaury) → financeiro; sem custo
// segue direto pra execução do criativo.
const CRIATIVO_CATEGORIAS = ['marketing', 'producao'];

// Aprovação de ORIGEM por categoria · override do roteamento por setor.
// Hospitalidade (recepção, café, hospedagem de convidados) é aprovada E
// atendida pelo Amaury (operações) — decisão do Matheus (2026-07-21). Sem esse
// override, pedidos de hospitalidade de quem não tem setor resolvido caíam em
// `triagem` e apareciam pra diretoria/super-admin aprovar. Também pula o 2º
// carimbo de Gestão (ver bloco de gestaoStatus): Amaury aprova e atende.
const CATEGORIA_ORIGEM_APROVADOR = {
  hospitalidade: '8e4ece03-b306-4019-9ece-55b7ec1088cb', // Amaury Araújo · amaury.araujo@cbrio.org
};

// Map módulo → categorias (for granular permission filtering)
const MODULO_CATEGORIAS = {
  ti: ['ti'],
  logistica: ['compras', 'servico'],
  financeiro: ['reembolso', 'pagamento'],
  administrativo: ['espaco', 'reserva_espaco', 'infraestrutura', 'hospitalidade', 'outro'],
  rh: ['ferias', 'licenca'],
  marketing: ['marketing'],
  producao: ['producao'],
};

// Map modulePerms key → backend módulo
const PERM_TO_MODULO = {
  'DP': 'rh',
  'Pessoas': 'rh',
  'Financeiro': 'financeiro',
  'Logística': 'logistica',
  'Patrimônio': 'administrativo',
  'Membresia': 'administrativo',
  'TI': 'ti',
  'Marketing': 'marketing',
};

// ── Resolução de SETOR (Gestão/Criativo/Ministerial) para o roteamento ao
// diretor de origem. A cascata RICA roda aqui (req.user já carrega área/
// kpi_areas/cargo) e vira uma "dica" passada para fn_solicitacoes_rotear_origem
// — assim resolvemos o setor pelo cadastro OU pelo cargo antes de cair na
// triagem. Espelha fn_normalizar_setor (migration 20260612120000).
function _setorPorArea(raw) {
  const v = String(raw || '').normalize('NFD')
    .split('').filter(c => { const x = c.charCodeAt(0); return x < 0x0300 || x > 0x036f; }).join('')
    .toLowerCase().trim();
  if (!v) return null;
  if (['gestao', 'administrativo', 'adm', 'financeiro', 'rh', 'recursos humanos', 'logistica', 'logistica_compras', 'logistica_estoque', 'compras', 'manutencao', 'patrimonio', 'ti', 'tecnologia', 'operacoes', 'operacional', 'estrategia', 'governanca', 'juridico', 'secretaria', 'reserva_espaco'].includes(v)) return 'Gestao';
  if (['criativo', 'criativa', 'marketing', 'producao', 'comunicacao', 'design', 'audiovisual', 'midia', 'adoracao', 'louvor'].includes(v)) return 'Criativo';
  if (['ministerial', 'ministerio', 'pastoral', 'voluntariado', 'voluntariada', 'cuidados', 'grupos', 'integracao', 'next', 'membresia', 'discipulado', 'kids', 'ami', 'bridge', 'online', 'sede', 'cba', 'geracional', 'jornada'].includes(v)) return 'Ministerial';
  return null;
}
// Cargo → setor (rede de resgate quando o cadastro de área falha). Cargos
// genéricos/sem setor claro caem fora → resolve pela área ou vai pra triagem.
const CARGO_SETOR = {
  'diretor-criativo': 'Criativo', 'coordenador-marketing': 'Criativo', 'assistente-marketing': 'Criativo',
  'lider-producao': 'Criativo', 'assistente-producao': 'Criativo',
  'diretor-administrativo': 'Gestao', 'coordenador-estrategia': 'Gestao', 'coordenador-financeiro': 'Gestao',
  'assistente-financeiro': 'Gestao', 'lider-operacoes': 'Gestao', 'lider-logistica': 'Gestao',
  'assistente-logistica': 'Gestao', 'assistente-operacoes': 'Gestao', 'diretor-rh': 'Gestao',
  'diretor-ministerial': 'Ministerial', 'lider-ministerial': 'Ministerial', 'assistente-ministerial': 'Ministerial',
  'coordenador-kids': 'Ministerial', 'assistente-kids': 'Ministerial', 'coordenador-ami': 'Ministerial',
  'coordenador-bridge': 'Ministerial', 'coordenador-online': 'Ministerial', 'supervisor-jornada': 'Ministerial',
  'coordenador-voluntarios': 'Ministerial',
};
// Cascata: profile.area → cargo → usuario_areas (granular.areas) → kpi_areas.
// ⚠️ A ordem importa (bug 2026-07-09: compra de gente da Gestão roteada pro
// diretor do Criativo): kpi_areas/usuario_areas são listas LARGAS de permissão/
// medição (uma pessoa da Gestão pode ter 'marketing' ali só pra ver KPI) — o
// setor da pessoa vem do CADASTRO dela (profile.area) e do CARGO; as listas
// entram por último, como resgate.
function resolverSetorHint(user) {
  const setorArea = _setorPorArea(user.area);
  if (setorArea) return setorArea;
  const cs = user.granular?.cargoSlug;
  if (cs && CARGO_SETOR[cs]) return CARGO_SETOR[cs];
  const cands = [
    ...(Array.isArray(user.granular?.areas) ? user.granular.areas : []),
    ...(Array.isArray(user.kpi_areas) ? user.kpi_areas : []),
  ];
  for (const c of cands) { const s = _setorPorArea(c); if (s) return s; }
  return null;
}

// ── Co-aprovadores de origem (setor_coaprovadores · migration 20260622) ───────
// A vice-diretora (Juliana Leao) co-aprova o setor Gestao junto com o diretor
// (Eduardo). Generalizado por setor. Tudo best-effort: se a tabela ainda nao
// existir (deploy antes da migration), degrada pro comportamento antigo (so o
// diretor aprova) sem quebrar.
async function setoresQueCoaprova(userId) {
  if (!userId) return [];
  try {
    const { data, error } = await supabase
      .from('setor_coaprovadores')
      .select('setor')
      .eq('profile_id', userId);
    if (error) return [];
    return [...new Set((data || []).map(r => r.setor).filter(Boolean))];
  } catch { return []; }
}

// IDs de diretor cujas solicitacoes este usuario pode aprovar = ele mesmo (se
// for diretor) + os diretores dos setores onde ele e co-aprovador.
async function diretorIdsQuePodeAprovar(userId) {
  const ids = new Set([userId]);
  const setores = await setoresQueCoaprova(userId);
  if (setores.length) {
    try {
      const { data } = await supabase
        .from('setor_diretor')
        .select('diretor_id')
        .in('setor', setores);
      (data || []).forEach(d => d.diretor_id && ids.add(d.diretor_id));
    } catch { /* best-effort */ }
  }
  return [...ids];
}

// Este usuario pode aprovar/rejeitar a ORIGEM desta solicitacao? (e o diretor
// alvo OU co-aprovador do setor do diretor alvo)
async function podeAprovarOrigem(userId, sol) {
  if (!sol?.aprovacao_origem_diretor_id) return false;
  if (sol.aprovacao_origem_diretor_id === userId) return true;
  const setores = await setoresQueCoaprova(userId);
  if (!setores.length) return false;
  try {
    const { data } = await supabase
      .from('setor_diretor')
      .select('setor')
      .eq('diretor_id', sol.aprovacao_origem_diretor_id)
      .in('setor', setores)
      .maybeSingle();
    return !!data;
  } catch { return false; }
}

// IDs dos co-aprovadores do setor de um diretor (pra notificar junto).
async function coaprovadorIdsParaDiretor(diretorId) {
  if (!diretorId) return [];
  try {
    const { data: sd } = await supabase
      .from('setor_diretor')
      .select('setor')
      .eq('diretor_id', diretorId)
      .maybeSingle();
    if (!sd?.setor) return [];
    const { data: co } = await supabase
      .from('setor_coaprovadores')
      .select('profile_id')
      .eq('setor', sd.setor);
    return (co || []).map(c => c.profile_id).filter(Boolean);
  } catch { return []; }
}

// ══ Fluxo BPMN (Levas 2/3 · 2026-07-02) · 2º carimbo (Gestão) + mérito ═══════
// Não-planejado = dupla aprovação: diretor da ÁREA do demandante (mecanismo
// aprovacao_origem_* existente) E diretoria de GESTÃO (aprovacao_gestao_*).
// Não-planejado COM CUSTO passa ainda pelo julgamento de MÉRITO (Pastor
// Presidente). Planejado (checkbox do solicitante) pula tudo.
const SETOR_GESTAO = 'Gestao';

// Compra de até R$ 1.000 vai DIRETO pra cotação (decisão do Matheus · 2026-07-15):
// dispensa aprovação de origem, carimbo de Gestão e mérito, planejada ou não.
// O controle acontece DEPOIS, sobre o valor REAL: a logística (Amaury) cota e o
// o financeiro aprova sobre o valor cotado (registrar-cotacao/enviar-cotacoes).
// Valor nulo/zero NÃO é elegível (fail-closed · segue o fluxo normal).
const COMPRA_COTACAO_DIRETA_LIMITE = 1000;
const COMPRA_COTACAO_DIRETA_MOTIVO = 'Compra de até R$ 1.000 · direto para cotação';

// Override do 2º portão POR CATEGORIA (migration 20260708180000). Ex.: TI →
// Diego + Matheus (substitui a Diretoria de Gestão). Best-effort: tabela
// ausente/categoria sem linha → null (cai no padrão de Gestão).
async function overrideGestaoPorCategoria(categoria) {
  if (!categoria) return null;
  try {
    const { data, error } = await supabase
      .from('solicitacoes_categoria_aprovadores')
      .select('profile_id, nome')
      .eq('categoria', categoria);
    if (error || !data || !data.length) return null;
    return {
      ids: [...new Set(data.map(r => r.profile_id).filter(Boolean))],
      nomes: [...new Set(data.map(r => r.nome).filter(Boolean))],
    };
  } catch { return null; }
}

// Mapa completo {categoria: {ids, nomes}} · usado pela fila/contagens (1 leitura).
async function mapaGestaoOverride() {
  const map = {};
  try {
    const { data } = await supabase
      .from('solicitacoes_categoria_aprovadores')
      .select('categoria, profile_id, nome');
    for (const r of data || []) {
      if (!r.categoria || !r.profile_id) continue;
      const m = (map[r.categoria] = map[r.categoria] || { ids: [], nomes: [] });
      if (!m.ids.includes(r.profile_id)) m.ids.push(r.profile_id);
      if (r.nome && !m.nomes.includes(r.nome)) m.nomes.push(r.nome);
    }
  } catch { /* best-effort */ }
  return map;
}

// IDs dos aprovadores do carimbo de GESTÃO. Com `categoria` que tem override
// (ex.: TI), retorna os aprovadores específicos; senão = diretor do setor Gestao
// (setor_diretor) + co-aprovadores (setor_coaprovadores · Eduardo + Juliana).
// Best-effort: tabela ausente → lista vazia (degrada sem 500).
async function aprovadoresGestaoIds(categoria) {
  const ov = await overrideGestaoPorCategoria(categoria);
  if (ov && ov.ids.length) return ov.ids;
  const ids = new Set();
  try {
    const { data } = await supabase
      .from('setor_diretor').select('diretor_id').eq('setor', SETOR_GESTAO);
    (data || []).forEach(r => r.diretor_id && ids.add(r.diretor_id));
  } catch { /* best-effort */ }
  try {
    const { data } = await supabase
      .from('setor_coaprovadores').select('profile_id').eq('setor', SETOR_GESTAO);
    (data || []).forEach(r => r.profile_id && ids.add(r.profile_id));
  } catch { /* best-effort */ }
  return [...ids];
}

// Nomes dos aprovadores de Gestão (pro front mostrar "Eduardo ou Juliana", ou
// "Diego ou Matheus" quando a categoria tem override).
async function aprovadoresGestaoNomes(categoria) {
  const ov = await overrideGestaoPorCategoria(categoria);
  if (ov && ov.nomes.length) return ov.nomes;
  const nomes = [];
  try {
    const { data } = await supabase
      .from('setor_diretor').select('diretor_nome').eq('setor', SETOR_GESTAO);
    (data || []).forEach(r => r.diretor_nome && nomes.push(r.diretor_nome));
  } catch { /* best-effort */ }
  try {
    const { data } = await supabase
      .from('setor_coaprovadores').select('nome').eq('setor', SETOR_GESTAO);
    (data || []).forEach(r => r.nome && nomes.push(r.nome));
  } catch { /* best-effort */ }
  return [...new Set(nomes)];
}

// IDs dos aprovadores de MÉRITO (Pastor Presidente · seed na migration
// 20260702150000). Best-effort: tabela ausente → lista vazia.
async function aprovadoresMeritoIds() {
  try {
    const { data, error } = await supabase
      .from('solicitacoes_merito_aprovadores')
      .select('profile_id');
    if (error) return [];
    return (data || []).map(r => r.profile_id).filter(Boolean);
  } catch { return []; }
}

// Próximo status quando os portões liberam (carimbos completos e/ou mérito
// aprovado) · mesma régua histórica do aprovar-origem:
//   compras/servico → em_cotacao (logística cota antes do financeiro)
//   precisa financeira → aguardando_aprovacao_financeira
//   senão → pendente (fila da área alvo)
function proximoStatusPosAprovacao(sol) {
  if (['compras', 'servico'].includes(sol.categoria)) return 'em_cotacao';
  // Criativo COM custo → cotação da logística (Amaury) antes do financeiro,
  // igual às compras (área já roteada pra logistica_compras na criação).
  if (CRIATIVO_CATEGORIAS.includes(sol.categoria) && sol.precisa_aprovacao_financeira && !sol.aprovado_financeiro_em) return 'em_cotacao';
  if (sol.precisa_aprovacao_financeira && !sol.aprovado_financeiro_em) return 'aguardando_aprovacao_financeira';
  return 'pendente';
}

// Não-planejado com custo → julgamento de mérito. Só no fluxo novo
// (eh_planejado=false) · linha legada (NULL) segue o fluxo antigo.
function precisaMerito(sol) {
  // Julgamento de mérito (Pastor Presidente) · só em COMPRAS, por valor + planejado
  // (fluxo definido pelo Matheus · 2026-07-22):
  //   planejado      → mérito quando o pedido passa de R$ 5.000
  //   não planejado  → mérito quando o pedido passa de R$ 1.000
  // Faixa pelo valor ESTIMADO (a aprovação é antes da cotação). Outras categorias
  // seguem sem mérito por ora.
  if (sol.categoria !== 'compras') return false;
  if (sol.merito_status != null) return false; // já decidido
  const valor = Number(sol.valor_estimado) || 0;
  return sol.eh_planejado === true ? valor > 5000 : valor > 1000;
}

// Evento explícito na timeline com o ATOR correto (o trigger genérico registra
// a transição, mas com ator_id = responsavel_id · o evento explícito conserta
// o tracking). Best-effort · nunca quebra o fluxo principal.
async function registrarEvento(solicitacaoId, { statusAnterior, statusNovo, atorId, observacao }) {
  try {
    const { error } = await supabase.from('solicitacoes_eventos').insert({
      solicitacao_id: solicitacaoId,
      status_anterior: statusAnterior ?? null,
      status_novo: statusNovo,
      ator_id: atorId || null,
      observacao: observacao || null,
    });
    if (error) console.error('[SOLICITACOES] evento timeline:', error.message);
  } catch (e) { console.error('[SOLICITACOES] evento timeline:', e.message); }
}

// Notifica os aprovadores de mérito que há julgamento pendente (com e-mail ·
// mesmo padrão do alerta de aprovação de origem).
async function notificarMeritoPendente(sol) {
  try {
    const alvos = await aprovadoresMeritoIds();
    if (!alvos.length) return;
    await notificar({
      modulo: 'administrativo',
      tipo: 'solicitacao_merito',
      titulo: `Julgamento de mérito: ${sol.titulo}`,
      mensagem: 'A solicitação passou pelas aprovações e tem custo · aguarda seu julgamento de mérito.',
      link: '/solicitacoes?aba=aprovar',
      severidade: 'info',
      chaveDedup: `solicitacao_merito_${sol.id}`,
      targetIds: alvos,
      email: true,
    });
  } catch (e) { console.error('[SOLICITACOES] notify merito:', e.message); }
}

// Gestão da fila (sobrestar/retomar fora do portão financeiro): admin/diretor,
// responsável direto ou responsável cadastrado da área (mesma checagem do PATCH).
async function podeGerirSolicitacao(req, sol) {
  if (['admin', 'diretor'].includes(req.user.role)) return true;
  if (sol.responsavel_id === req.user.userId) return true;
  if (sol.area_responsavel) {
    const { data: rr } = await supabase
      .from('area_solicitacoes_responsaveis')
      .select('profile_id')
      .eq('area', sol.area_responsavel)
      .eq('profile_id', req.user.userId)
      .maybeSingle();
    return !!rr;
  }
  return false;
}

// ── LIST (filtered by role) ─────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const userId = req.user.userId;
    const role = req.user.role;
    const granular = req.user.granular;

    const { categoria, status, mine, aba, periodo } = req.query;

    let data;
    let papeisPorId = null; // aba=aprovar · papel(is) de aprovação pendente(s) do ator por item

    if (aba === 'aprovar') {
      // Fila de decisão do ator · 3 papéis possíveis (fluxo BPMN 2026-07-02):
      //   origem (diretor da área do demandante / co-aprovador do setor) ·
      //   gestao (diretoria de Gestão · 2º carimbo do não-planejado) ·
      //   merito (Pastor Presidente · aguardando_merito).
      // Super-admin vê as 3 filas inteiras (fallback · inclusive a triagem).
      // Consultas separadas + merge com dedup por id (or() cruzado no PostgREST
      // é frágil) · a fila de decisão é pequena e recente por natureza.
      const isSuper = await isAdminFallback(req);
      const aprovarIds = await diretorIdsQuePodeAprovar(userId);
      // Gestão por categoria: TI vai pro Diego/Matheus · demais pro padrão.
      const overrideMap = await mapaGestaoOverride();
      const defaultGestaoIds = await aprovadoresGestaoIds();
      const aprovaGestaoDe = (cat) => (overrideMap[cat]?.ids?.length ? overrideMap[cat].ids : defaultGestaoIds).includes(userId);
      const ehAlgumGestao = defaultGestaoIds.includes(userId) || Object.values(overrideMap).some(o => (o.ids || []).includes(userId));
      const meritoIds = await aprovadoresMeritoIds();
      const ehMerito = meritoIds.includes(userId);

      const mkBase = () => {
        let b = supabase
          .from('solicitacoes')
          .select('*, solicitacao_itens(*)')
          .is('deleted_at', null)
          .order('created_at', { ascending: false });
        if (categoria) b = b.eq('categoria', categoria);
        if (status) b = b.eq('status', status);
        return b;
      };
      const queries = [];
      if (isSuper) {
        queries.push(mkBase().in('aprovacao_origem_status', ['pendente', 'triagem']));
      } else if (aprovarIds.length) {
        queries.push(mkBase().in('aprovacao_origem_diretor_id', aprovarIds).eq('aprovacao_origem_status', 'pendente'));
      }
      // 2º carimbo (Gestão) só entra na fila DEPOIS que o diretor do demandante
      // aprovou a origem (regra sequencial · 2026-07-06). Aprovar antes disso
      // invertia a decisão (ops decidindo antes da área dona da demanda).
      if (isSuper || ehAlgumGestao) queries.push(mkBase().eq('aprovacao_gestao_status', 'pendente').in('aprovacao_origem_status', ['aprovada', 'dispensada']));
      if (isSuper || ehMerito) queries.push(mkBase().eq('status', 'aguardando_merito'));

      const results = await Promise.all(queries);
      const comErro = results.find(r => r.error);
      if (comErro) throw comErro.error;

      const vistos = new Set();
      data = [];
      for (const r of results) {
        for (const row of (r.data || [])) {
          if (vistos.has(row.id)) continue;
          vistos.add(row.id);
          data.push(row);
        }
      }
      data.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

      // Marca em cada item QUAL(is) carimbo(s) o ator tem pendente(s) — o
      // front usa pra saber o que mostrar (botão de origem, gestão ou mérito).
      // "Aprovar" = SÓ o que está pendente PRA VOCÊ. Portão já aprovado (ou que é
      // de outra pessoa) não aparece — inclusive pro super-admin (2026-07-13):
      // antes o super via TODAS as filas, poluindo com pedidos já aprovados na
      // origem que só aguardavam a Gestão de outra pessoa.
      papeisPorId = {};
      for (const d of data) {
        const papeis = [];
        if (d.aprovacao_origem_status === 'pendente' && aprovarIds.includes(d.aprovacao_origem_diretor_id)) papeis.push('origem');
        // Triagem (setor não resolvido) é dever do super-admin · sem isto o badge
        // contava a triagem mas a lista a escondia (badge-fantasma · 2026-07-20).
        if (isSuper && d.aprovacao_origem_status === 'triagem') papeis.push('origem');
        if (d.aprovacao_gestao_status === 'pendente' && ['aprovada', 'dispensada'].includes(d.aprovacao_origem_status) && aprovaGestaoDe(d.categoria)) papeis.push('gestao');
        if (d.status === 'aguardando_merito' && ehMerito) papeis.push('merito');
        papeisPorId[d.id] = papeis;
      }
      // Só mostra o que o ator realmente pode decidir agora (vale pra todos).
      data = data.filter(d => (papeisPorId[d.id] || []).length);
    } else {
      let q = supabase
        .from('solicitacoes')
        .select('*, solicitacao_itens(*)')
        .is('deleted_at', null)
        .order('created_at', { ascending: false });

      if (categoria) q = q.eq('categoria', categoria);
      if (status) q = q.eq('status', status);

      // Período padrão (Fase 2) · bound por updated_at pra não estourar o cap de
      // 1000 linhas do PostgREST conforme o volume cresce. Filtra por updated_at
      // (não created_at) pra manter visível o que teve atividade recente, mesmo
      // criado há tempos. 'tudo' remove o limite. aba=aprovar não filtra (a fila
      // de decisão é pequena e recente por natureza).
      const dias = periodo === 'tudo' ? 0 : (parseInt(periodo, 10) || 365);
      if (dias > 0) q = q.gte('updated_at', new Date(Date.now() - dias * 86400000).toISOString());

      if (mine === 'true') {
        // "Minhas" = as que EU criei + as COMPARTILHADAS com a minha área
        // (compartilhar_area=true e area_cliente ∈ minhas áreas). area_cliente é
        // slug minúsculo; usuario_areas.nome vem em CAIXA → normaliza p/ minúsculo.
        let areasView = [...new Set([
          ...((granular?.areas) || []).map(a => String(a).toLowerCase()),
          ...((req.user.kpi_areas) || []).map(a => String(a).toLowerCase()),
        ])].filter(a => /^[a-z0-9_]+$/.test(a));
        // A área 'financeiro' NÃO entra no compartilhamento da aba "Minhas".
        // O pessoal do financeiro (Alberto aprova, Cristina paga) recebia aqui
        // pedidos de OUTRAS pessoas só porque batem a área do cadastro (ex.: um
        // backdrop com area_cliente=financeiro) — puro ruído. Em "Minhas", cada um
        // vê só o que ELE criou; o trabalho do financeiro é na fila do financeiro.
        areasView = areasView.filter(a => a !== 'financeiro');
        if (areasView.length) {
          q = q.or(`solicitante_id.eq.${userId},and(compartilhar_area.eq.true,area_cliente.in.(${areasView.join(',')}))`);
        } else {
          q = q.eq('solicitante_id', userId);
        }
      } else if (['admin', 'diretor'].includes(role)) {
        // Admin/diretor sees all — no filter
      } else {
        // Fila "Para Atender": SO quem eh responsável cadastrado em
        // area_solicitacoes_responsaveis ve as solicitações da sua área.
        // Colaborador comum (sem área responsável) ve apenas as próprias —
        // acesso genérico a um módulo NÃO da direito de ver a fila dos outros.
        const { data: respRows } = await supabase
          .from('area_solicitacoes_responsaveis')
          .select('area')
          .eq('profile_id', userId);
        const responsavelAreas = new Set((respRows || []).map(r => r.area));

        // Quem tem escopo financeiro individual decide pela fila financeira. Não
        // mistura reembolsos/pagamentos da área geral com as Compras autorizadas.
        const escopoFinanceiro = await obterCategoriasFinanceirasAutorizadas(userId);
        if (escopoFinanceiro.disponivel && escopoFinanceiro.categorias.size > 0) {
          responsavelAreas.delete('financeiro');
        }

        // Vejo o que criei, o que está ATRIBUÍDO a mim (responsavel_id · ex.:
        // pagamento não-cartão que a aprovação roteou pra Cristina executar) e o
        // que é da minha área responsável.
        const orParts = [
          `solicitante_id.eq.${encodeURIComponent(userId)}`,
          `responsavel_id.eq.${encodeURIComponent(userId)}`,
        ];
        if (responsavelAreas.size > 0) {
          orParts.push(`area_responsavel.in.(${[...responsavelAreas].join(',')})`);
        }

        // Líder de área (diretor / boost ≥4) enxerga TODAS as demandas da área
        // dele por area_cliente (quem PEDIU), não só o que ele atende. Ex.: Pedro
        // Paulo (diretor do Criativo · boost marketing) vê tudo de
        // area_cliente=marketing — inclusive o que virou compra (area_cliente
        // segue marketing). Escopado: colaborador comum da área NÃO ganha isso.
        const perms = granular?.modulePerms || {};
        const ehDiretorCargo = /^diretor/.test(String(granular?.cargoSlug || ''));
        const minhasAreas = [...new Set([
          ...((granular?.areas) || []).map(a => String(a).toLowerCase()),
          ...((req.user.kpi_areas) || []).map(a => String(a).toLowerCase()),
        ])].filter(a => /^[a-z0-9_]+$/.test(a));
        const areasLideradas = minhasAreas.filter(a =>
          ehDiretorCargo || (perms[a] && (perms[a].leitura >= 4 || perms[a].escrita >= 4)));
        if (areasLideradas.length) {
          orParts.push(`area_cliente.in.(${areasLideradas.join(',')})`);
        }
        q = q.or(orParts.join(','));
      }

      const { data: rows, error } = await q;
      if (error) throw error;
      data = rows;
    }

    // Resolve profile names for solicitante/responsavel/diretor_origem
    const profileIds = [...new Set((data || []).flatMap(d => [
      d.solicitante_id, d.responsavel_id, d.aprovacao_origem_diretor_id,
    ].filter(Boolean)))];
    let profileMap = {};
    if (profileIds.length) {
      const { data: profiles } = await supabase.from('profiles').select('id,name,email').in('id', profileIds);
      if (profiles) profileMap = Object.fromEntries(profiles.map(p => [p.id, p]));
    }

    // Enrich Marketing etiquetas (Spec 010 · usado no Drawer de aprovação Spec 011)
    const tipoIds    = [...new Set((data || []).map(d => d.marketing_tipo_id).filter(Boolean))];
    const destinoIds = [...new Set((data || []).map(d => d.marketing_destino_id).filter(Boolean))];
    let tipoMap = {}, destinoMap = {};
    if (tipoIds.length) {
      const { data: t } = await supabase.from('marketing_etiquetas_tipo').select('id, slug, nome, cor, habilidade_padrao, esforco_max_h').in('id', tipoIds);
      tipoMap = Object.fromEntries((t || []).map(x => [x.id, x]));
    }
    if (destinoIds.length) {
      const { data: d } = await supabase.from('marketing_etiquetas_destino').select('id, slug, nome, cor').in('id', destinoIds);
      destinoMap = Object.fromEntries((d || []).map(x => [x.id, x]));
    }

    // Spec 012 · card Marketing LEGADO (cards antigos com solicitacao_id direto)
    const solicMktIds = (data || [])
      .filter(d => d.area_responsavel === 'marketing')
      .map(d => d.id);
    let cardMap = {};
    let campanhaMap = {};
    if (solicMktIds.length) {
      const { data: cards } = await supabase
        .from('marketing_kanban_cards')
        .select('id, solicitacao_id, estado, tem_revisao, prazo_confirmado, prazo_preliminar, atribuido_a, entregue_em')
        .in('solicitacao_id', solicMktIds)
        .is('deleted_at', null);
      cardMap = Object.fromEntries((cards || []).map(c => [c.solicitacao_id, c]));

      // Redesenho 2026 · o solicitante acompanha a CAMPANHA (1 dor = 1 campanha com
      // N entregaveis · os cards triados tem campanha_id, NÃO solicitacao_id).
      const { data: camps } = await supabase
        .from('marketing_campanhas')
        .select('id, solicitacao_id, status, titulo, prazo_entrega')
        .in('solicitacao_id', solicMktIds)
        .is('deleted_at', null);
      const campIds = (camps || []).map(c => c.id);
      const entregMap = {};
      if (campIds.length) {
        const { data: ents } = await supabase
          .from('marketing_kanban_cards')
          .select('id, campanha_id, titulo, estado, atribuido_a, data_fim, tem_revisao')
          .in('campanha_id', campIds)
          .is('deleted_at', null);
        const membroIds = [...new Set((ents || []).map(e => e.atribuido_a).filter(Boolean))];
        let donoMap = {};
        if (membroIds.length) {
          const { data: ms } = await supabase.from('marketing_membros').select('id, profile_id, nome_display').in('id', membroIds);
          const pids = [...new Set((ms || []).map(m => m.profile_id).filter(Boolean))];
          let pmap = {};
          if (pids.length) {
            const { data: ps } = await supabase.from('profiles').select('id, name').in('id', pids);
            pmap = Object.fromEntries((ps || []).map(p => [p.id, p.name]));
          }
          donoMap = Object.fromEntries((ms || []).map(m => [m.id, pmap[m.profile_id] || m.nome_display || null]));
        }
        for (const e of (ents || [])) {
          if (!entregMap[e.campanha_id]) entregMap[e.campanha_id] = [];
          entregMap[e.campanha_id].push({ id: e.id, titulo: e.titulo, estado: e.estado, dono_nome: donoMap[e.atribuido_a] || null, data_fim: e.data_fim, tem_revisao: e.tem_revisao });
        }
      }
      campanhaMap = Object.fromEntries((camps || []).map(c => [c.solicitacao_id, { ...c, entregaveis: entregMap[c.id] || [] }]));
    }

    // Co-aprovadores por setor · pra mostrar "Aguardando aprovação de X ou Y".
    // Best-effort (tabela pode não existir antes da migration).
    const diretorIdsPg = [...new Set((data || []).map(d => d.aprovacao_origem_diretor_id).filter(Boolean))];
    let setorPorDiretor = {};
    let coapsPorSetor = {};
    if (diretorIdsPg.length) {
      try {
        const { data: sd } = await supabase.from('setor_diretor').select('setor, diretor_id').in('diretor_id', diretorIdsPg);
        setorPorDiretor = Object.fromEntries((sd || []).map(r => [r.diretor_id, r.setor]));
        const setores = [...new Set(Object.values(setorPorDiretor))];
        if (setores.length) {
          const { data: co } = await supabase.from('setor_coaprovadores').select('setor, nome, profile_id').in('setor', setores);
          for (const c of (co || [])) {
            (coapsPorSetor[c.setor] = coapsPorSetor[c.setor] || []).push(c);
          }
        }
      } catch { /* tabela ausente antes da migration · degrada pro diretor só */ }
    }
    const nomesAprovadores = (d) => {
      const principal = profileMap[d.aprovacao_origem_diretor_id]?.name;
      if (!principal) return [];
      const setor = setorPorDiretor[d.aprovacao_origem_diretor_id];
      const coaps = (coapsPorSetor[setor] || [])
        .map(c => c.nome || profileMap[c.profile_id]?.name)
        .filter(n => n && n !== principal);
      return [principal, ...[...new Set(coaps)]];
    };

    // Nomes do 2º carimbo POR CATEGORIA (TI → Diego/Matheus · resto → Gestão).
    // Best-effort. Uma leitura por categoria presente na página.
    const gestaoNomesPorCat = {};
    for (const cat of [...new Set((data || []).filter(d => d.aprovacao_gestao_status).map(d => d.categoria))]) {
      gestaoNomesPorCat[cat] = await aprovadoresGestaoNomes(cat);
    }
    // "Aguardando aprovação de X" = quem está pendente AGORA (origem → gestão).
    // Antes o front mostrava sempre o diretor de origem, mesmo depois dele
    // aprovar (parecia que ainda esperava por ele · bug do Arthur).
    const pendenteDe = (d) => {
      if (['pendente', 'triagem'].includes(d.aprovacao_origem_status)) return nomesAprovadores(d);
      if (d.aprovacao_gestao_status === 'pendente') return gestaoNomesPorCat[d.categoria] || [];
      return [];
    };

    // ── Alçada · "esta linha eu mesmo posso aprovar?" ────────────────────────
    // ⚠️ DUAS consultas pra página inteira (as áreas de quem pede + a tabela de
    // limites, que tem 6 linhas), nunca uma por linha. Best-effort: falha =
    // flag false, e a tela só deixa de oferecer o atalho.
    // ⚠️ É DICA de UI, não autorização — quem decide é o servidor no POST.
    let alcadaFlag = () => false;
    try {
      const [{ data: minhasAreas }, { data: limites }] = await Promise.all([
        supabase.from('area_solicitacoes_responsaveis').select('area').eq('profile_id', req.user.userId),
        supabase.from('area_alcadas').select('area_cliente, limite_aprovacao'),
      ]);
      const areas = new Set((minhasAreas || []).map(r => r.area));
      const limitePorArea = Object.fromEntries(
        (limites || []).map(l => [l.area_cliente, Number(l.limite_aprovacao)]).filter(([, v]) => Number.isFinite(v))
      );
      if (areas.size) {
        alcadaFlag = (d) => areas.has(d.area_responsavel)
          && elegivelAlcada(d, limitePorArea[d.area_cliente] ?? LIMITE_ALCADA_PADRAO).ok;
      }
    } catch (e) {
      console.warn('[SOLICITACOES] flag de alçada indisponível:', e.message);
    }

    const enriched = (data || []).map(d => ({
      ...d,
      pode_aprovar_alcada: alcadaFlag(d),
      solicitante: profileMap[d.solicitante_id] || null,
      responsavel: profileMap[d.responsavel_id] || null,
      aprovacao_origem_diretor: profileMap[d.aprovacao_origem_diretor_id] || null,
      aprovacao_origem_aprovadores: nomesAprovadores(d),
      aprovacao_gestao_aprovadores: d.aprovacao_gestao_status ? (gestaoNomesPorCat[d.categoria] || []) : [],
      aprovacao_pendente_de: pendenteDe(d),
      ...(papeisPorId ? { aprovacao_papel_pendente: papeisPorId[d.id] || [] } : {}),
      marketing_tipo: tipoMap[d.marketing_tipo_id] || null,
      marketing_destino: destinoMap[d.marketing_destino_id] || null,
      marketing_card: cardMap[d.id] || null,
      marketing_campanha: campanhaMap[d.id] || null,
    }));

    res.json(enriched);
  } catch (e) {
    console.error('[SOLICITACOES] list error:', e.message);
    res.status(500).json({ error: 'Erro ao listar solicitações' });
  }
});

// ── HISTÓRICO DE APROVAÇÕES ─────────────────────────────────
// Log das DECISÕES do ator (aprovou/rejeitou · origem/gestão/mérito), pra quem
// aprova ver o que já decidiu — a aba "Aprovar" só mostra pendências. Fonte =
// solicitacoes_eventos (ator_id gravado por registrarEvento nos handlers de
// aprovação/rejeição/mérito). Super-admin com ?todos=1 vê de todo mundo.
router.get('/minhas-aprovacoes', async (req, res) => {
  try {
    const userId = req.user.id;
    const isSuper = await isAdminFallback(req);
    const dias = Math.min(parseInt(req.query.dias, 10) || 180, 730);
    const desde = new Date(Date.now() - dias * 86400000).toISOString();
    const todos = isSuper && ['1', 'true'].includes(String(req.query.todos));

    let q = supabase
      .from('solicitacoes_eventos')
      .select('id, solicitacao_id, status_anterior, status_novo, ator_id, observacao, created_at')
      .gte('created_at', desde)
      .order('created_at', { ascending: false })
      .limit(1000);
    if (!todos) q = q.eq('ator_id', userId);
    const { data: eventos, error } = await q;
    if (error) throw error;

    // Só eventos de decisão (aprovação/rejeição/mérito). Sobrestamento/retomada
    // e mudanças de status genéricas ficam de fora.
    const ehDecisao = (obs) => /^(aprova|rejei|reprov|m[eé]rito)/i.test((obs || '').trim());
    const decisoes = (eventos || []).filter(e => ehDecisao(e.observacao));
    if (!decisoes.length) return res.json([]);

    const solIds = [...new Set(decisoes.map(e => e.solicitacao_id).filter(Boolean))];
    const { data: sols } = await supabase
      .from('solicitacoes')
      .select('id, titulo, categoria, status, solicitante_id, valor_estimado')
      .in('id', solIds);
    const solMap = Object.fromEntries((sols || []).map(s => [s.id, s]));

    const profIds = [...new Set([
      ...decisoes.map(e => e.ator_id),
      ...(sols || []).map(s => s.solicitante_id),
    ].filter(Boolean))];
    let profMap = {};
    if (profIds.length) {
      const { data: profs } = await supabase.from('profiles').select('id, name').in('id', profIds);
      profMap = Object.fromEntries((profs || []).map(p => [p.id, p.name]));
    }

    const out = decisoes.map(e => {
      const s = solMap[e.solicitacao_id] || {};
      const obs = e.observacao || '';
      const decisao = /rejei|reprov/i.test(obs) ? 'rejeitada' : 'aprovada';
      const etapa = /gest/i.test(obs) ? 'gestao' : /m[eé]rito/i.test(obs) ? 'merito' : 'origem';
      return {
        evento_id: e.id,
        solicitacao_id: e.solicitacao_id,
        titulo: s.titulo || null,
        categoria: s.categoria || null,
        status_atual: s.status || null,
        valor_estimado: s.valor_estimado ?? null,
        solicitante: s.solicitante_id ? (profMap[s.solicitante_id] || null) : null,
        ator: e.ator_id ? (profMap[e.ator_id] || null) : null,
        decisao,
        etapa,
        observacao: obs,
        em: e.created_at,
      };
    });
    res.json(out);
  } catch (e) {
    console.error('[SOLICITACOES] minhas-aprovacoes:', e.message);
    res.status(500).json({ error: 'Erro ao carregar histórico de aprovações' });
  }
});

// ── MEU PAPEL ───────────────────────────────────────────────
// Define se o usuário ve a fila "Para Atender": admin/diretor OU
// responsável cadastrado de alguma área (area_solicitacoes_responsaveis).
// Colaborador comum recebe atende=false → so "Minhas Solicitações".
router.get('/meu-papel', async (req, res) => {
  try {
    const userId = req.user.userId;
    const role = req.user.role;

    // Aprovador de origem? Diretor de setor (setor_diretor) OU co-aprovador
    // (setor_coaprovadores · ex.: vice-diretora Juliana no setor Gestao).
    const { data: setorRow } = await supabase
      .from('setor_diretor')
      .select('setor, diretor_nome')
      .eq('diretor_id', userId)
      .maybeSingle();
    const coSetores = await setoresQueCoaprova(userId);
    const ehAprovadorOrigem = !!setorRow || coSetores.length > 0;

    // Super-admin? Define antes do contador · ele ve/aprova a fila inteira.
    const isSuper = await isAdminFallback(req);

    // Contador de pendentes na fila de aprovacao · DEVE bater com a lista da aba
    // (bug 2026-07-20: super-admin contava a fila INTEIRA no badge, mas a lista
    // só mostra o que é DELE → "5 pra aprovar" com a lista vazia). Agora conta só
    // o que o usuário realmente aprova: origem onde ele é o diretor/co-aprovador.
    const aprovarIds = await diretorIdsQuePodeAprovar(userId);
    let pendentesOrigem = 0;
    if (aprovarIds.length) {
      const { count } = await supabase
        .from('solicitacoes')
        .select('id', { count: 'exact', head: true })
        .in('aprovacao_origem_diretor_id', aprovarIds)
        .eq('aprovacao_origem_status', 'pendente')
        .is('deleted_at', null);
      pendentesOrigem = count || 0;
    }

    // Triagem · super-admins veem solicitacoes sem setor resolvido (Fase 0)
    let pendentesTriagem = 0;
    if (isSuper) {
      const { count } = await supabase
        .from('solicitacoes')
        .select('id', { count: 'exact', head: true })
        .eq('aprovacao_origem_status', 'triagem')
        .is('deleted_at', null);
      pendentesTriagem = count || 0;
    }

    // Fluxo BPMN (2026-07-02) · 2º carimbo (Gestão) + julgamento de mérito.
    // Flags = pertencimento real ao papel; contagens também pra super-admin
    // (fallback · ele vê/decide as filas inteiras).
    // Gestão por categoria (TI → Diego/Matheus). É aprovador de Gestão quem está
    // no padrão OU em qualquer override; a contagem filtra por categoria.
    const overrideMapMP = await mapaGestaoOverride();
    const defaultGestaoIdsMP = await aprovadoresGestaoIds();
    const aprovaGestaoDeMP = (cat) => (overrideMapMP[cat]?.ids?.length ? overrideMapMP[cat].ids : defaultGestaoIdsMP).includes(userId);
    const ehAprovadorGestao = defaultGestaoIdsMP.includes(userId)
      || Object.values(overrideMapMP).some(o => (o.ids || []).includes(userId));
    const meritoIds = await aprovadoresMeritoIds();
    const ehAprovadorMerito = meritoIds.includes(userId);

    // Gestão/mérito: conta só o que o usuário aprova de fato (não a fila inteira
    // por ser super-admin) — mesma régua da lista (aprovaGestaoDe / ehMerito).
    let pendentesGestao = 0;
    if (ehAprovadorGestao) {
      const { data: gp } = await supabase
        .from('solicitacoes')
        .select('categoria')
        .eq('aprovacao_gestao_status', 'pendente')
        .in('aprovacao_origem_status', ['aprovada', 'dispensada'])
        .is('deleted_at', null)
        .limit(1000);
      pendentesGestao = (gp || []).filter(r => aprovaGestaoDeMP(r.categoria)).length;
    }
    let pendentesMerito = 0;
    if (ehAprovadorMerito) {
      const { count } = await supabase
        .from('solicitacoes')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'aguardando_merito')
        .is('deleted_at', null);
      pendentesMerito = count || 0;
    }

    if (['admin', 'diretor'].includes(role)) {
      return res.json({
        atende: true,
        admin: true,
        areas: [],
        eh_diretor_origem: !!setorRow,
        setor_origem: setorRow?.setor || null,
        pendentes_origem: pendentesOrigem,
        eh_triagem_admin: isSuper,
        pendentes_triagem: pendentesTriagem,
        eh_aprovador_gestao: ehAprovadorGestao,
        pendentes_gestao: pendentesGestao,
        eh_aprovador_merito: ehAprovadorMerito,
        pendentes_merito: pendentesMerito,
      });
    }
    const { data, error } = await supabase
      .from('area_solicitacoes_responsaveis')
      .select('area')
      .eq('profile_id', userId);
    if (error) throw error;
    const areas = (data || []).map(r => r.area);

    // Executor individual (ex.: Cristina · pagamentos não-cartão que a aprovação
    // do financeiro roteia pra ela por responsavel_id) NÃO é responsável de área —
    // senão veria a fila inteira do financeiro (em cotação etc.). Mas precisa da
    // aba "Para Atender" pra receber o que é dela. Dois gatilhos:
    // (1) É a executora financeira designada (mesma constante que a aprovação usa
    //     pra rotear) → aba sempre visível, mesmo com a fila vazia (é o posto dela).
    // (2) Regra genérica auto-mantida: tem QUALQUER item atribuído via
    //     responsavel_id → atende=true (cobre outros executores individuais).
    // A lista da view 'atender' já filtra por responsavel_id, então ela só vê os
    // pagamentos que de fato passaram pela aprovação.
    let temAtribuidas = EXECUTOR_FINANCEIRO_ID && userId === EXECUTOR_FINANCEIRO_ID;
    if (!temAtribuidas && areas.length === 0) {
      const { count: atribCount } = await supabase
        .from('solicitacoes')
        .select('id', { count: 'exact', head: true })
        .eq('responsavel_id', userId)
        .is('deleted_at', null);
      temAtribuidas = (atribCount || 0) > 0;
    }

    res.json({
      atende: areas.length > 0 || temAtribuidas,
      admin: false,
      areas,
      eh_diretor_origem: ehAprovadorOrigem,
      setor_origem: setorRow?.setor || coSetores[0] || null,
      pendentes_origem: pendentesOrigem,
      eh_triagem_admin: isSuper,
      pendentes_triagem: pendentesTriagem,
      eh_aprovador_gestao: ehAprovadorGestao,
      pendentes_gestao: pendentesGestao,
      eh_aprovador_merito: ehAprovadorMerito,
      pendentes_merito: pendentesMerito,
    });
  } catch (e) {
    console.error('[SOLICITACOES] meu-papel error:', e.message);
    res.status(500).json({ error: 'Erro ao resolver papel' });
  }
});

// ── CREATE ──────────────────────────────────────────────────
router.post('/', async (req, res) => {
  try {
    const userId = req.user.userId;
    const userName = req.user.name;

    const { titulo, descricao, justificativa, categoria, urgencia, valor_estimado, area_solicitante,
            // Fase A backbone
            area_responsavel, subcategoria, eh_urgente, justificativa_urgencia,
            data_necessaria, espaco_solicitado, data_uso, horario_inicio, horario_fim, qtde_pessoas,
            // Reembolso
            motivo_reembolso, data_compra,
            forma_pagamento, chave_pix, banco, agencia, conta, documento_url,
            // Compras / Pagamentos / Serviços (campos estruturados compartilhados)
            itens, link_referencia, favorecido_nome, favorecido_documento,
            recorrente, recorrencia,
            // Pedido em massa (compras/serviço) · lista de itens estruturados
            itens_lista,
            // Fotos gerais da solicitação (Serviços/Serviço externo · 2026-07-07)
            imagens_url,
            // Marketing · Spec 010 (etiquetas) + intake por DOR (Redesenho 2026-05-30)
            marketing_tipo_id, marketing_destino_id,
            mkt_publico_alvo, mkt_ideia_inicial,
            // Fluxo BPMN (2026-07-02) · checkbox "estava no planejamento"
            eh_planejado,
            // Visibilidade (2026-07-13) · a ÁREA vê por padrão; opt-out "manter_privada".
            manter_privada } = req.body;
    if (!titulo || !categoria) return res.status(400).json({ error: 'Título e categoria são obrigatórios' });
    // Regra: colegas da própria área veem a solicitação POR PADRÃO. Exceções:
    // categorias pessoais/RH (nunca compartilham) e o opt-out "manter privada".
    const CATEGORIAS_PRIVADAS = ['ferias', 'licenca', 'reembolso'];
    const compartilharArea = !CATEGORIAS_PRIVADAS.includes(categoria) && !manter_privada;
    if (!ALLOWED_CATEGORIES.includes(categoria)) {
      return res.status(400).json({ error: `Categoria inválida: "${categoria}". Permitidas: ${ALLOWED_CATEGORIES.join(', ')}` });
    }

    // Pedido em massa · normaliza a lista de itens e deriva o resumo de texto
    // (backward-compat com `solicitacoes.itens`) + soma do valor estimado.
    const itensListaNorm = (Array.isArray(itens_lista) ? itens_lista : [])
      .filter(it => it && String(it.descricao || '').trim())
      .map((it, i) => {
        const qNum = Number(it.quantidade);
        const quantidade = isFinite(qNum) && qNum > 0 ? qNum : 1;
        const vNum = Number(it.valor_estimado);
        const temValor = it.valor_estimado != null && it.valor_estimado !== '' && isFinite(vNum);
        // Semântica escolhida no form (2026-07-07): 'unitario' → normaliza pro
        // TOTAL DA LINHA (× quantidade) antes de gravar. Sem valor_tipo (bundle
        // antigo) = 'total' · valor já é o total da linha, não multiplica.
        const valorLinha = temValor
          ? (it.valor_tipo === 'unitario' ? vNum * quantidade : vNum)
          : null;
        return {
          descricao: String(it.descricao).trim().slice(0, 500),
          quantidade,
          unidade: it.unidade ? String(it.unidade).trim().slice(0, 20) : 'un',
          link_referencia: it.link_referencia ? String(it.link_referencia).trim().slice(0, 1000) : null,
          valor_estimado: valorLinha,
          imagem_url: it.imagem_url ? String(it.imagem_url).slice(0, 2000) : null,
          ordem: i,
        };
      });
    let itensTexto = itens;
    let valorEstimadoFinal = valor_estimado;
    if (itensListaNorm.length) {
      itensTexto = itensListaNorm
        .map(it => `${it.quantidade}x ${it.descricao}`)
        .join('\n');
      // ⚠️ valor_estimado do item já está normalizado pro TOTAL DA LINHA acima
      // (semântica 'unitario' multiplica × quantidade lá) — aqui só soma, NUNCA
      // multiplicar de novo (caso aventais/coletes · 2026-07-07).
      const soma = itensListaNorm.reduce(
        (acc, it) => acc + (it.valor_estimado != null ? it.valor_estimado : 0), 0);
      const semTotal = valorEstimadoFinal == null || valorEstimadoFinal === '' || Number(valorEstimadoFinal) === 0;
      if (semTotal && soma > 0) valorEstimadoFinal = soma;
    }

    // Fotos gerais · sanitiza (só strings de URL · cap de 5 · 2000 chars cada).
    // Só entra no insert quando tem foto → flows antigos não tocam a coluna
    // (tolera a migration 20260707120000 ainda não aplicada).
    const imagensNorm = (Array.isArray(imagens_url) ? imagens_url : [])
      .filter(u => typeof u === 'string' && u.trim())
      .slice(0, 5)
      .map(u => u.trim().slice(0, 2000));

    // Criativo (marketing/producao): origem aprova o diretor do Criativo (Pedro
    // Paulo) por CATEGORIA. COM custo (valor>0) vira compra cotada pela logística
    // (Amaury) → financeiro; SEM custo segue pra execução do criativo.
    const ehCriativo = CRIATIVO_CATEGORIAS.includes(categoria);
    const criativoComCusto = ehCriativo && Number(valorEstimadoFinal) > 0;

    // Auto-mapeia area_responsavel + subcategoria
    const mapa = CATEGORIA_TO_AREA_RESP[categoria] || { area: null, subcategoria: 'default' };
    // Criativo COM custo entra na fila da logística (Amaury cota) — a "Atender"
    // filtra por area_responsavel, então precisa ser logistica_compras.
    const finalAreaResp = area_responsavel || (criativoComCusto ? 'logistica_compras' : mapa.area);
    const finalSub = subcategoria || (criativoComCusto ? 'default' : mapa.subcategoria);

    // Área do SOLICITANTE (dimensão de KPI) · NÃO vem mais de seletor no form
    // (2026-06-01). Deriva de quem preenche · ignora qualquer area_cliente do body.
    // Prioriza kpi_areas (slug que o resto dos KPIs usa) > 1a área granular de
    // usuario_areas (nome normalizado pra slug) > setor do profile.
    const _stripAcentos = (s) => String(s || '').normalize('NFD')
      .split('').filter(c => { const code = c.charCodeAt(0); return code < 0x0300 || code > 0x036f; }).join('');
    const _slugArea = (s) => _stripAcentos(s).toLowerCase().trim();
    const areaClienteResolvida =
      (Array.isArray(req.user.kpi_areas) && req.user.kpi_areas[0])
      || (req.user.granular?.areas?.[0] ? _slugArea(req.user.granular.areas[0]) : null)
      || (req.user.area ? _slugArea(req.user.area) : null)
      || null;

    // ── Fluxo BPMN · planejado × não-planejado (atualizado 2026-07-06) ────────
    // A aprovação do diretor da ÁREA do demandante (aprovacao_origem_*) é
    // REQUISITO pra demanda chegar em operações — INCLUSIVE quando planejada.
    // "Planejado" (checkbox do solicitante) alivia só o 2º carimbo (diretoria de
    // GESTÃO) e o julgamento de MÉRITO; a origem continua obrigatória.
    // Não-planejado: origem + carimbo de Gestão (aprovacao_gestao_*). Demandante
    // do setor Gestão (ou ele próprio aprovador) → o carimbo de Gestão colapsa.
    const planejado = eh_planejado === true || eh_planejado === 'true';
    const setorHint = resolverSetorHint(req.user);

    let rota = null;
    let gestaoStatus = null;   // null = planejado (2º carimbo não se aplica)
    let gestaoMotivo = null;
    let gestaoIdsNotificar = [];

    // Aprovação hierárquica de origem (Spec 001) · SEMPRE resolvida AQUI (planejado
    // ou não) porque o insert roda via service_role (auth.uid()=NULL) e, nesse
    // caso, o trigger só dispensa. O trigger continua de rede de segurança (só
    // age quando ninguém setou aprovacao_origem_status · ex.: RPC falhou).
    try {
      // ⚠️ `p_categoria` é o que dispensa serviço/manutenção do diretor de
      // origem (decisão do Matheus · 05/08: conserto vai direto pro Amaury). A
      // lista fica em `fn_solicitacoes_categoria_dispensa_origem`, fonte única
      // compartilhada com o trigger — não repetir a régua aqui em JS, senão o
      // POST e a rede de segurança podem discordar e a solicitação sai da fila
      // de alguém sem ninguém notar.
      const { data: r, error: rErr } = await supabase
        .rpc('fn_solicitacoes_rotear_origem', {
          p_solicitante_id: userId, p_setor_hint: setorHint, p_categoria: categoria,
        });
      if (rErr) throw rErr;
      rota = r;
    } catch (rerr) {
      console.error('[SOLICITAÇÕES] roteamento de origem falhou (fallback trigger):', rerr.message);
    }

    // ── COMPRAS · fluxo por valor + planejado (2026-07-22, Matheus) ───────────
    //   Planejado ≤ R$ 1.000            → direto pra cotação (sem diretor/presidente)
    //   Planejado R$ 1.000–5.000        → diretor da área aprova
    //   Planejado > R$ 5.000            → diretor da área + Pastor Presidente
    //   Não planejado ≤ R$ 1.000        → diretor da área aprova
    //   Não planejado > R$ 1.000        → diretor da área + Pastor Presidente
    // A origem é o DIRETOR DA ÁREA (rota do RPC · já vem 'dispensada' quando o
    // solicitante é diretor/diretoria/super). O mérito (presidente) é decidido
    // DEPOIS, por valor (precisaMerito). Gestão (2º carimbo) segue dispensada.
    // Depois de tudo: cotação (Amaury) → financeiro (Alberto).
    if (categoria === 'compras') {
      const valorCompra = Number(valorEstimadoFinal) || 0;
      if (planejado && valorCompra <= 1000) {
        rota = { diretor_id: null, aprovacao_status: 'dispensada', status: 'pendente',
          motivo: 'Compra planejada até R$ 1.000 · direto para cotação' };
      }
      // demais casos: mantém a rota do RPC (diretor da área aprova).
    }

    // Reserva de espaço vai DIRETO pro Amaury (coordenador de operações) — sem
    // aprovação de origem nem de gestão (2026-07-13, pedido do Matheus).
    if (categoria === 'reserva_espaco') {
      rota = { diretor_id: null, aprovacao_status: 'dispensada', status: 'pendente',
        motivo: 'Reserva de espaço vai direto para operações (Amaury)' };
    }

    // Origem por categoria (ex.: hospitalidade → Amaury aprova E atende): a
    // aprovação de origem vai pro responsável da categoria, não pro diretor do
    // setor de quem pede — assim nunca cai em `triagem` (fila da diretoria).
    if (CATEGORIA_ORIGEM_APROVADOR[categoria]) {
      rota = { diretor_id: CATEGORIA_ORIGEM_APROVADOR[categoria], aprovacao_status: 'pendente',
        status: 'aguardando_aprovacao_origem',
        motivo: 'Origem aprovada pelo responsável da categoria' };
    }

    // (Compras já roteadas no bloco unificado acima · o status 'pendente'
    // dispensado vira 'em_cotacao' no trigger de SLA · migration 20260616160000.)

    // Criativo: a aprovação de ORIGEM é do diretor do Criativo (Pedro Paulo), por
    // CATEGORIA — venha de quem vier (pula o diretor do setor de quem pede, ex.:
    // Arthur Serpa). Se a origem já veio dispensada (solicitante é diretor/
    // diretoria/super-admin), mantém. ⚠️ Pedro Paulo NÃO vira aprovador geral:
    // esta regra vale SÓ pra criativo (marketing/producao).
    if (ehCriativo && rota?.aprovacao_status === 'pendente') {
      try {
        const { data: cri } = await supabase.from('setor_diretor')
          .select('diretor_id').eq('setor', 'Criativo').maybeSingle();
        if (cri?.diretor_id) {
          rota = { diretor_id: cri.diretor_id, aprovacao_status: 'pendente',
            status: 'aguardando_aprovacao_origem',
            motivo: 'Criativo · aprovação de origem com o diretor do Criativo (por categoria)' };
        }
      } catch (e) { console.warn('[SOLICITAÇÕES] exceção origem Criativo:', e.message); }
    }

    if (categoria === 'compras' && !planejado) {
      // Compras NÃO passam pelo 2º carimbo de Gestão (2026-07-22): vão direto pra
      // cotação; a origem, quando aplicável, é Pedro (Criativo) ou Arthur (>R$1k).
      gestaoStatus = 'dispensada';
      gestaoMotivo = 'Compras não passam pela Gestão · origem (quando aplicável) + cotação + financeiro';
    } else if (ehCriativo && !planejado) {
      // Criativo NÃO passa pelo 2º carimbo de Gestão (Eduardo/Juliana): o
      // controle é a aprovação de origem do Criativo + (com custo) financeiro.
      gestaoStatus = 'dispensada';
      gestaoMotivo = 'Criativo não passa pela Gestão · origem do Criativo + financeiro';
    } else if (CATEGORIA_ORIGEM_APROVADOR[categoria] && !planejado) {
      // Hospitalidade: o responsável da categoria (Amaury) aprova a origem E
      // atende — sem 2º carimbo de Gestão (decisão do Matheus · 2026-07-21).
      gestaoStatus = 'dispensada';
      gestaoMotivo = 'Origem aprovada pelo responsável da categoria (Amaury) · sem carimbo de Gestão';
    } else if (!planejado && categoria !== 'reserva_espaco') {
      // 2º carimbo · Gestão (ou aprovadores específicos da categoria · ex.: TI →
      // Diego/Matheus). Best-effort · lista vazia degrada.
      const temOverride = !!(await overrideGestaoPorCategoria(categoria));
      const gestaoIds = await aprovadoresGestaoIds(categoria);
      const demandanteEhAprovador = gestaoIds.includes(userId);
      // Categoria com override só dispensa se o próprio demandante é aprovador
      // dela; categoria padrão também dispensa p/ demandante do setor Gestão.
      if (demandanteEhAprovador || (!temOverride && setorHint === SETOR_GESTAO)) {
        gestaoStatus = 'dispensada';
        gestaoMotivo = demandanteEhAprovador
          ? 'Demandante é aprovador do 2º carimbo · papéis colapsam no carimbo de origem'
          : 'Demandante do setor Gestão · papéis colapsam no carimbo de origem';
      } else {
        gestaoStatus = 'pendente';
        gestaoIdsNotificar = gestaoIds;
      }
    }
    const agoraIso = new Date().toISOString();

    let { data, error } = await supabase
      .from('solicitacoes')
      .insert({
        titulo,
        descricao,
        justificativa,
        categoria,
        urgencia: urgencia || 'normal',
        valor_estimado: valorEstimadoFinal,
        solicitante_id: userId,
        compartilhar_area: compartilharArea,
        area_solicitante,
        cargo_solicitante: req.user.granular?.cargoNome || null,
        // Campos novos · trigger calcula SLA e precisa_aprovacao_financeira.
        // area_cliente vem da ÁREA do solicitante (KPIs), não mais de seletor.
        area_cliente: areaClienteResolvida,
        area_responsavel: finalAreaResp,
        // Fluxo BPMN · origem SEMPRE (inclusive planejado); Gestão só no não-planejado.
        eh_planejado: planejado,
        ...(planejado && { planejado_por: userId }),
        // Criativo COM custo precisa do financeiro depois da cotação do
        // Amaury. O trigger não marca marketing/producao, então setamos aqui (ele
        // nunca desmarca). O status vem de 'aguardando_aprovacao_origem' no insert,
        // então o trigger de SLA não mexe no status.
        ...(criativoComCusto && { precisa_aprovacao_financeira: true }),
        // Roteamento hierárquico de origem resolvido acima (planejado ou não).
        // O trigger continua de rede de segurança quando a RPC falha (rota=null).
        ...(rota && {
          aprovacao_origem_diretor_id: rota.diretor_id || null,
          aprovacao_origem_status: rota.aprovacao_status,
          aprovacao_origem_motivo: rota.motivo || null,
          aprovacao_origem_em: rota.aprovacao_status === 'dispensada' ? agoraIso : null,
        }),
        // Gestão: pendente/dispensada no não-planejado · null no planejado.
        aprovacao_gestao_status: gestaoStatus,
        ...(gestaoStatus === 'dispensada' && {
          aprovacao_gestao_em: agoraIso,
          aprovacao_gestao_motivo: gestaoMotivo,
        }),
        // Enquanto origem OU Gestão pende → aguardando_aprovacao_origem.
        // Tudo resolvido → status da rota ('pendente' · trigger refina SLA/
        // financeiro; o mérito é decidido logo após o insert quando aplicável).
        ...(((rota && ['pendente', 'triagem'].includes(rota.aprovacao_status)) || gestaoStatus === 'pendente')
          ? { status: 'aguardando_aprovacao_origem' }
          : (rota ? { status: rota.status } : {})),
        subcategoria: finalSub,
        eh_urgente: !!eh_urgente,
        justificativa_urgencia: justificativa_urgencia || null,
        data_necessaria: data_necessaria || null,
        // Fotos gerais (Serviços/Serviço externo) · só quando anexadas
        ...(imagensNorm.length && { imagens_url: imagensNorm }),
        // Reserva de espaco
        ...(finalAreaResp === 'reserva_espaco' && {
          espaco_solicitado: espaco_solicitado || null,
          data_uso: data_uso || null,
          horario_inicio: horario_inicio || null,
          horario_fim: horario_fim || null,
          qtde_pessoas: qtde_pessoas || null,
        }),
        // Reembolso · motivo + comprovante + data + forma de pagamento
        ...(categoria === 'reembolso' && {
          motivo_reembolso: motivo_reembolso || null,
          data_compra: data_compra || null,
          forma_pagamento: forma_pagamento || null,
          chave_pix: chave_pix || null,
          banco: banco || null,
          agencia: agencia || null,
          conta: conta || null,
          documento_url: documento_url || null,
        }),
        // Compras · resumo dos itens (texto) + link de referência + fornecedor.
        // Os itens estruturados (com foto) vão em solicitacao_itens logo abaixo.
        ...(categoria === 'compras' && {
          itens: itensTexto || null,
          link_referencia: link_referencia || null,
          favorecido_nome: favorecido_nome || null,
        }),
        // Pagamento · favorecido + documento (boleto/NF) + forma + recorrencia.
        // data_necessaria carrega o vencimento (reusa a coluna · ver frontend).
        ...(categoria === 'pagamento' && {
          favorecido_nome: favorecido_nome || null,
          favorecido_documento: favorecido_documento || null,
          forma_pagamento: forma_pagamento || null,
          chave_pix: chave_pix || null,
          banco: banco || null,
          agencia: agencia || null,
          conta: conta || null,
          documento_url: documento_url || null,
          recorrente: !!recorrente,
          recorrencia: recorrencia || null,
        }),
        // Serviço · o que (itens) + fornecedor sugerido + proposta + recorrencia
        ...(categoria === 'servico' && {
          itens: itensTexto || null,
          favorecido_nome: favorecido_nome || null,
          favorecido_documento: favorecido_documento || null,
          link_referencia: link_referencia || null,
          documento_url: documento_url || null,
          recorrente: !!recorrente,
          recorrencia: recorrencia || null,
        }),
        // Marketing · intake por DOR (Redesenho 2026-05-30) · público + ideia opcional.
        // marketing_tipo_id/destino_id ficam null no intake (Pedro classifica na triagem).
        ...(categoria === 'marketing' && {
          marketing_tipo_id: marketing_tipo_id || null,
          marketing_destino_id: marketing_destino_id || null,
          mkt_publico_alvo: mkt_publico_alvo || null,
          mkt_ideia_inicial: mkt_ideia_inicial || null,
        }),
      })
      .select('*')
      .single();
    if (error) throw error;

    // ⚠️ Fluxo BPMN · se a ORIGEM nasceu dispensada (ex.: o próprio diretor pede)
    // mas o pedido ainda precisa do Pastor Presidente pela faixa de valor, já nasce
    // no julgamento de mérito. Vale planejado e não-planejado (a régua de valor
    // está em precisaMerito). Gestão nula = planejado (2º carimbo não se aplica).
    if (data.aprovacao_origem_status === 'dispensada'
        && (data.aprovacao_gestao_status === 'dispensada' || data.aprovacao_gestao_status == null)
        && precisaMerito(data)) {
      const statusAntes = data.status;
      const { data: up, error: upErr } = await supabase
        .from('solicitacoes')
        .update({ status: 'aguardando_merito', merito_status: 'pendente' })
        .eq('id', data.id)
        .select('*')
        .single();
      if (!upErr && up) {
        data = up;
        registrarEvento(data.id, {
          statusAnterior: statusAntes,
          statusNovo: 'aguardando_merito',
          atorId: userId,
          observacao: 'Carimbos dispensados · pedido com custo enviado ao julgamento de mérito',
        });
        notificarMeritoPendente(data);
        require('../services/solicitacaoWpp').enviarMeritoWpp(data).catch(() => {});
      } else if (upErr) {
        console.error('[SOLICITACOES] mover pra mérito no create:', upErr.message);
      }
    }

    // Pedido em massa · grava os itens estruturados (com foto) vinculados.
    // Best-effort: a solicitação + o resumo de texto já estão salvos; se a
    // gravação dos itens falhar, não derruba o pedido (loga só).
    if (itensListaNorm.length && (categoria === 'compras' || categoria === 'servico')) {
      const rows = itensListaNorm.map(it => ({ ...it, solicitacao_id: data.id }));
      const { error: itErr } = await supabase.from('solicitacao_itens').insert(rows);
      if (itErr) console.error('[SOLICITAÇÕES] falha ao gravar itens do pedido:', itErr.message);
    }

    // Auto-vincula responsavel_id se houver uma única pessoa cadastrada para
    // a área · se houver mais, deixa nulo (qualquer um da fila pode pegar)
    let responsaveisDaArea = [];
    if (finalAreaResp) {
      const { data: resps } = await supabase
        .from('area_solicitacoes_responsaveis')
        .select('profile_id')
        .eq('area', finalAreaResp);
      responsaveisDaArea = (resps || []).map(r => r.profile_id);

      if (responsaveisDaArea.length === 1) {
        await supabase
          .from('solicitacoes')
          .update({ responsavel_id: responsaveisDaArea[0] })
          .eq('id', data.id);
        data.responsavel_id = responsaveisDaArea[0];
      }
    }

    // Notify responsible people · além das regras do módulo, sempre notifica
    // os responsáveis cadastrados pra área (Pedro Paiva pra marketing, etc)
    const modulo = CATEGORIA_MODULO[categoria] || 'administrativo';
    notificar({
      modulo,
      tipo: 'solicitacao',
      titulo: `Nova solicitação: ${titulo}`,
      mensagem: `${userName || 'Usuário'} criou uma solicitação de ${categoria}`,
      link: '/solicitacoes',
      severidade: urgencia === 'critica' ? 'alta' : 'info',
      chaveDedup: `solicitacao_nova_${data.id}`,
      extraTargetIds: responsaveisDaArea,
    }).catch(err => console.error('[SOLICITACOES] notify error:', err.message));

    // Compra que nasceu direto em cotação (sem filtro de origem) → evento
    // explícito na timeline + call-to-action "Cotar" pros responsáveis de compras
    // (no fluxo com origem esse aviso sai no aprovar-origem).
    if (categoria === 'compras' && data.status === 'em_cotacao'
        && data.aprovacao_origem_status === 'dispensada') {
      registrarEvento(data.id, {
        statusAnterior: null,
        statusNovo: 'em_cotacao',
        atorId: userId,
        observacao: 'Compra entrou direto na cotação (Amaury)',
      });
      if (responsaveisDaArea.length) {
        notificar({
          modulo,
          tipo: 'solicitacao_status',
          titulo: `Cotar: ${titulo}`,
          mensagem: `Compra entrou direto na cotação — registre a cotação (valor + fornecedor) pra seguir pra aprovação financeira.`,
          link: '/solicitacoes',
          severidade: 'info',
          chaveDedup: `solicitacao_cotar_${data.id}`,
          targetIds: responsaveisDaArea,
        }).catch(err => console.error('[SOLICITACOES] notify cotar direto:', err.message));
      }
    }

    // Aprovação hierarquica · se trigger marcou aguardando_aprovacao_origem,
    // notifica o diretor de origem em vez do responsável da área alvo.
    if (data.status === 'aguardando_aprovacao_origem' && data.aprovacao_origem_diretor_id) {
      // Notifica o diretor de origem + os co-aprovadores do setor (ex.: Juliana
      // em Gestao). E-mail também (no-op gracioso se Resend não configurado).
      const coIds = await coaprovadorIdsParaDiretor(data.aprovacao_origem_diretor_id);
      const alvosAprovacao = [...new Set([data.aprovacao_origem_diretor_id, ...coIds])];
      notificar({
        modulo: 'administrativo',
        tipo: 'solicitacao_aprovacao_origem',
        titulo: `Aprovar solicitacao: ${titulo}`,
        mensagem: `${userName || 'Funcionario'} pediu uma solicitação que precisa da sua aprovação antes de seguir para ${finalAreaResp || 'area alvo'}.`,
        link: '/solicitacoes?aba=aprovar',
        severidade: 'info',
        chaveDedup: `solicitacao_aprovacao_origem_${data.id}`,
        targetIds: alvosAprovacao,
        email: true,
      }).catch(err => console.error('[SOLICITACOES] notify diretor:', err.message));
      // WhatsApp · manda a solicitação pro diretor aprovar por lá (1/2). No-op
      // se não houver template/telefone. Não bloqueia a criação.
      require('../services/solicitacaoWpp').enviarAprovacaoWpp(data).catch(() => {});
    }

    // Fluxo BPMN · 2º carimbo pendente → notifica os aprovadores de Gestão
    // (Eduardo + Juliana) com e-mail (mesmo padrão do alerta de origem).
    // SÓ quando a origem já está resolvida (ex.: demandante é o próprio diretor
    // da área → origem dispensada). Se a origem ainda pende, o aviso de Gestão
    // é adiado pro momento em que o diretor do demandante aprovar (regra
    // sequencial · 2026-07-06) — evita a Gestão decidir antes da área dona.
    if (data.aprovacao_gestao_status === 'pendente'
        && ['aprovada', 'dispensada'].includes(data.aprovacao_origem_status)
        && gestaoIdsNotificar.length) {
      notificar({
        modulo: 'administrativo',
        tipo: 'solicitacao_aprovacao_gestao',
        titulo: `Aprovar solicitação (Gestão): ${titulo}`,
        mensagem: `${userName || 'Funcionário'} pediu uma solicitação não-planejada que precisa também do carimbo da diretoria de Gestão.`,
        link: '/solicitacoes?aba=aprovar',
        severidade: 'info',
        chaveDedup: `solicitacao_aprovacao_gestao_${data.id}`,
        targetIds: gestaoIdsNotificar,
        email: true,
      }).catch(err => console.error('[SOLICITACOES] notify gestao:', err.message));
    }

    // Triagem · setor nao resolvido · alerta de governanca pros super-admins/diretoria.
    // O foco do alerta e' o CADASTRO sem area (corrigir o usuario), nao o pedido.
    if (data.status === 'aguardando_aprovacao_origem' && data.aprovacao_origem_status === 'triagem') {
      notificar({
        modulo: 'administrativo',
        tipo: 'solicitacao_triagem',
        titulo: 'Triagem · usuário sem área no sistema',
        mensagem: `A solicitação "${titulo}" caiu na triagem porque ${userName || 'o solicitante'} está no sistema sem área/setor definido. Defina a área no cadastro (Permissões › Usuários) e aprove/encaminhe.`,
        link: '/solicitacoes?aba=aprovar',
        severidade: 'alta',
        chaveDedup: `solicitacao_triagem_${data.id}`,
      }).catch(err => console.error('[SOLICITACOES] notify triagem:', err.message));
    }

    res.status(201).json(data);
  } catch (e) {
    console.error('[SOLICITACOES] create error:', e.message);
    // Erro do trigger fn_solicitacoes_roteamento_aprovacao · membro nao-funcionario
    if (e.code === '42501' || /apenas funcionarios podem criar solicitacoes/i.test(e.message || '')) {
      return res.status(403).json({
        error: 'Apenas funcionários com vinculo ativo em RH podem criar solicitações.',
      });
    }
    res.status(500).json({ error: e.message || 'Erro ao criar solicitação' });
  }
});

// ── APROVAÇÃO HIERARQUICA DE ORIGEM ─────────────────────────
// Diretor de origem aprova a solicitação. Após aprovação, ela vai pra
// fila normal da área alvo (status='pendente').
async function isAdminFallback(req) {
  // Marcos + Matheus + outros super-admins · permitem aprovar/rejeitar quando
  // diretor de origem não esta cadastrado ou esta de férias (fallback).
  if (['admin'].includes(req.user.role)) return true;
  const { data } = await supabase
    .from('app_super_admins')
    .select('email')
    .ilike('email', req.user.email)
    .eq('ativo', true)
    .maybeSingle();
  return !!data;
}

// Fluxo BPMN (2026-07-02) · este endpoint virou "CARIMBAR": o ator dá o carimbo
// do papel dele — diretor de ORIGEM (ou co-aprovador do setor) e/ou diretoria
// de GESTÃO. Um request = UM carimbo (elegível pros dois? a UI chama de novo).
// Só quando os DOIS estiverem aprovados/dispensados a solicitação transiciona:
// com custo → julgamento de mérito; sem custo → fluxo normal (cotação/
// financeiro/fila da área). Linha legada (aprovacao_gestao_status NULL) segue
// o comportamento antigo (um carimbo só).
async function aprovarOrigemHandler(req, res) {
  try {
    const userId = req.user.userId;
    const userName = req.user.name;
    const isSuperAdmin = await isAdminFallback(req);

    const { data: atual, error: getErr } = await supabase
      .from('solicitacoes')
      .select('*')
      .eq('id', req.params.id)
      .is('deleted_at', null)
      .maybeSingle();
    if (getErr) throw getErr;
    if (!atual) return res.status(404).json({ error: 'Solicitação não encontrada.' });

    const origemPendente = ['pendente', 'triagem'].includes(atual.aprovacao_origem_status);
    const gestaoPendente = atual.aprovacao_gestao_status === 'pendente';
    if (!origemPendente && !gestaoPendente) {
      return res.status(400).json({ error: 'Solicitação não está pendente de aprovação.' });
    }

    // Elegibilidade por papel:
    // · ORIGEM: diretor cadastrado, co-aprovador do setor (ex.: Juliana em
    //   Gestao) ou super-admin (fallback · inclusive triagem).
    // · GESTÃO: diretor/co-aprovador do setor Gestao ou super-admin.
    const isDiretorAlvo = origemPendente && atual.aprovacao_origem_diretor_id === userId;
    const isCoaprovador = origemPendente && !isDiretorAlvo && await podeAprovarOrigem(userId, atual);
    const podeOrigem = origemPendente && (isDiretorAlvo || isCoaprovador || isSuperAdmin);
    let ehAprovadorGestao = false;
    if (gestaoPendente) {
      const gestaoIds = await aprovadoresGestaoIds(atual.categoria);
      ehAprovadorGestao = gestaoIds.includes(userId);
    }
    // Regra sequencial (2026-07-06): o carimbo de Gestão só libera DEPOIS que a
    // origem foi aprovada/dispensada (diretor do demandante decide primeiro).
    const origemResolvida = ['aprovada', 'dispensada'].includes(atual.aprovacao_origem_status);
    const podeGestao = gestaoPendente && origemResolvida && (ehAprovadorGestao || isSuperAdmin);
    if (!podeOrigem && !podeGestao) {
      // Aprovador de Gestão tentando carimbar antes do diretor do demandante.
      if (gestaoPendente && !origemResolvida && (ehAprovadorGestao || isSuperAdmin)) {
        return res.status(409).json({ error: 'Esta solicitação ainda aguarda a aprovação do diretor da área do demandante. O carimbo de Gestão fica disponível depois disso.' });
      }
      return res.status(403).json({ error: 'Apenas o diretor de origem, um co-aprovador do setor ou a diretoria de Gestão pode aprovar esta solicitação.' });
    }

    // Um request = um carimbo · origem primeiro quando elegível pros dois.
    const carimbo = podeOrigem ? 'origem' : 'gestao';
    const agoraIso = new Date().toISOString();

    const update = {};
    if (carimbo === 'origem') {
      update.aprovacao_origem_status = 'aprovada';
      update.aprovacao_origem_em = agoraIso;
      // Registra quem aprovou quando NÃO foi o diretor principal (rastreio).
      if (!isDiretorAlvo && isCoaprovador) {
        update.aprovacao_origem_motivo = `Aprovada por ${userName || 'co-aprovador'} (co-aprovador do setor)`;
      } else if (!isDiretorAlvo && isSuperAdmin) {
        update.aprovacao_origem_diretor_id = userId;
        update.aprovacao_origem_motivo = '[Fallback super-admin]';
      }
    } else {
      update.aprovacao_gestao_status = 'aprovada';
      update.aprovacao_gestao_por = userId;
      update.aprovacao_gestao_em = agoraIso;
      if (!ehAprovadorGestao && isSuperAdmin) {
        update.aprovacao_gestao_motivo = '[Fallback super-admin]';
      }
    }

    // Os dois carimbos completos? (gestão NULL = legado/planejado · não exige)
    const origemOk = carimbo === 'origem'
      || ['aprovada', 'dispensada'].includes(atual.aprovacao_origem_status);
    const gestaoOk = carimbo === 'gestao'
      || atual.aprovacao_gestao_status == null
      || ['aprovada', 'dispensada'].includes(atual.aprovacao_gestao_status);
    const completo = origemOk && gestaoOk;

    // Próximo passo quando completo:
    //   TEM CUSTO (não-planejado do fluxo novo) → julgamento de mérito.
    //   Sem custo → fluxo normal: compras/servico → EM_COTACAO (a logística
    //   levanta valor+fornecedor ANTES do financeiro) · precisa financeira →
    //   aguardando_aprovacao_financeira · resto → fila da área (pendente).
    const vaiPraMerito = completo && precisaMerito(atual);
    const ehCotacao = ['compras', 'servico'].includes(atual.categoria);
    if (!completo) {
      update.status = 'aguardando_aprovacao_origem';
    } else if (vaiPraMerito) {
      update.status = 'aguardando_merito';
      update.merito_status = 'pendente';
    } else {
      update.status = proximoStatusPosAprovacao(atual);
    }

    const { data, error } = await supabase
      .from('solicitacoes')
      .update(update)
      .eq('id', req.params.id)
      .select('*')
      .single();
    if (error) throw error;

    // Timeline com o ator correto (o trigger genérico erra o ator).
    await registrarEvento(data.id, {
      statusAnterior: atual.status,
      statusNovo: data.status,
      atorId: userId,
      observacao: carimbo === 'gestao'
        ? `Aprovação da diretoria de Gestão (${userName || 'aprovador'})`
        : `Aprovação do diretor de origem (${userName || 'aprovador'})`,
    });

    const modulo = CATEGORIA_MODULO[data.categoria] || 'administrativo';

    // Carimbo parcial · falta o outro papel: avisa o solicitante do progresso.
    if (!completo) {
      const faltaLabel = carimbo === 'origem' ? 'da diretoria de Gestão' : 'do diretor da sua área';
      notificar({
        modulo,
        tipo: 'solicitacao_status',
        titulo: `Aprovação parcial: ${data.titulo}`,
        mensagem: `${userName || 'Aprovador'} deu o carimbo ${carimbo === 'origem' ? 'de origem' : 'de Gestão'} · falta a aprovação ${faltaLabel}.`,
        link: '/solicitacoes',
        severidade: 'info',
        chaveDedup: `solicitacao_carimbo_${carimbo}_${data.id}`,
        targetIds: [data.solicitante_id].filter(Boolean),
      }).catch(err => console.error('[SOLICITACOES] notify carimbo parcial:', err.message));

      // Origem acabou de sair e ainda falta a Gestão → AGORA é a vez dos
      // aprovadores de Gestão (aviso adiado da criação · regra sequencial).
      if (carimbo === 'origem' && data.aprovacao_gestao_status === 'pendente') {
        const gestaoIds = await aprovadoresGestaoIds(data.categoria);
        if (gestaoIds.length) {
          notificar({
            modulo,
            tipo: 'solicitacao_aprovacao_gestao',
            titulo: `Aprovar solicitação (Gestão): ${data.titulo}`,
            mensagem: `O diretor da área do demandante aprovou · agora precisa do carimbo do 2º aprovador.`,
            link: '/solicitacoes?aba=aprovar',
            severidade: 'info',
            chaveDedup: `solicitacao_aprovacao_gestao_${data.id}`,
            targetIds: gestaoIds,
            email: true,
          }).catch(err => console.error('[SOLICITACOES] notify gestao (pos-origem):', err.message));
        }
      }
      return res.json(data);
    }

    // Completos + tem custo → julgamento de mérito (Pastor Presidente).
    if (vaiPraMerito) {
      notificar({
        modulo,
        tipo: 'solicitacao_status',
        titulo: `Aprovada · em julgamento de mérito: ${data.titulo}`,
        mensagem: `${userName || 'Aprovador'} concluiu as aprovações · como o pedido tem custo, segue para o julgamento de mérito.`,
        link: '/solicitacoes',
        severidade: 'info',
        chaveDedup: `solicitacao_merito_solic_${data.id}`,
        targetIds: [data.solicitante_id].filter(Boolean),
      }).catch(err => console.error('[SOLICITACOES] notify merito solicitante:', err.message));
      notificarMeritoPendente(data);
      require('../services/solicitacaoWpp').enviarMeritoWpp(data).catch(() => {});
      notificarPedidoWhatsapp(data.id, 'aguardando julgamento de mérito', null);
      return res.json(data);
    }

    // Completos sem custo → fluxo normal (comportamento original).
    // WhatsApp pro solicitante: aprovação de origem concluída.
    notificarPedidoWhatsapp(data.id, 'aprovada na origem', null);

    // Notifica solicitante + responsável da área alvo
    notificar({
      modulo,
      tipo: 'solicitacao_status',
      titulo: `Aprovada: ${data.titulo}`,
      mensagem: ehCotacao
        ? `${userName || 'Diretor'} aprovou sua solicitação. Foi pra cotação na logística (valor e fornecedor) antes do financeiro.`
        : `${userName || 'Diretor'} aprovou sua solicitação. Foi para a fila ${data.area_responsavel || 'da area alvo'}.`,
      link: '/solicitacoes',
      severidade: 'info',
      chaveDedup: `solicitacao_aprovada_origem_${data.id}`,
      targetIds: [data.solicitante_id].filter(Boolean),
    }).catch(err => console.error('[SOLICITACOES] notify aprovar:', err.message));

    if (data.area_responsavel) {
      resolverDestinatarios(modulo).then(managers => {
        const filtered = managers.filter(id => id !== data.solicitante_id);
        if (filtered.length) {
          notificar({
            modulo,
            tipo: 'solicitacao',
            titulo: ehCotacao ? `Cotar: ${data.titulo}` : `Nova na fila: ${data.titulo}`,
            mensagem: ehCotacao
              ? `Solicitação aprovada pelo diretor · registre a cotação (valor + fornecedor) pra seguir pro financeiro.`
              : `Solicitação aprovada pelo diretor · pronta para atendimento.`,
            link: '/solicitacoes',
            severidade: 'info',
            chaveDedup: `solicitacao_pos_aprovacao_${data.id}`,
            targetIds: filtered,
            // Reembolso/pagamento caem direto na fila do financeiro (sem cotação):
            // o aprovador financeiro (Alberto) recebe por e-mail também. Só o
            // financeiro — não spammar Amaury/logística nas compras.
            email: modulo === 'financeiro',
          }).catch(err => console.error('[SOLICITACOES] notify responsaveis:', err.message));
        }
      }).catch(err => console.error('[SOLICITACOES] resolve managers:', err.message));
    }

    res.json(data);
  } catch (e) {
    console.error('[SOLICITACOES] aprovar-origem:', e.message);
    res.status(500).json({ error: e.message || 'Erro ao aprovar solicitação' });
  }
}
router.patch('/:id/aprovar-origem', aprovarOrigemHandler);

// ── COTACAO (compras/servico) · a logistica levanta valor+fornecedor ANTES do ──
// financeiro. Marcos (2026-06-16): "primeiro vem a cotacao, depois a aprovacao do
// financeiro" · o financeiro decide sobre o valor real, nao sobre uma estimativa cega.
async function podeCotar(req, sol) {
  if (['admin', 'diretor'].includes(req.user.role)) return true;
  const mp = req.user.granular?.modulePerms || {};
  const log = mp.logistica || mp.Logistica;
  if (log && (log.leitura >= 3 || log.escrita >= 3)) return true;
  if (!sol?.area_responsavel) return false;
  const { data } = await supabase
    .from('area_solicitacoes_responsaveis')
    .select('profile_id')
    .eq('area', sol.area_responsavel)
    .eq('profile_id', req.user.userId)
    .maybeSingle();
  return !!data;
}

router.post('/:id/registrar-cotacao', async (req, res) => {
  try {
    const { valor_cotado, fornecedor, observacao } = req.body || {};
    const valor = Number(valor_cotado);
    if (valor_cotado == null || valor_cotado === '' || Number.isNaN(valor) || valor < 0) {
      return res.status(400).json({ error: 'Informe o valor cotado (número ≥ 0).' });
    }
    const { data: atual, error: getErr } = await supabase
      .from('solicitacoes').select('*').eq('id', req.params.id).is('deleted_at', null).maybeSingle();
    if (getErr) throw getErr;
    if (!atual) return res.status(404).json({ error: 'Solicitação não encontrada.' });
    if (atual.status !== 'em_cotacao') {
      return res.status(400).json({ error: 'Esta solicitação não está em cotação.' });
    }
    if (!(await podeCotar(req, atual))) {
      return res.status(403).json({ error: 'Apenas a logística (ou admin) pode registrar a cotação.' });
    }

    // Grava a cotacao e manda pro financeiro, que aprova sobre o valor cotado.
    // valor_estimado passa a refletir o cotado (alcada/relatorios usam o valor real).
    const updates = {
      valor_cotado: valor,
      cotacao_fornecedor: fornecedor || null,
      cotacao_observacao: observacao || null,
      cotacao_em: new Date().toISOString(),
      cotacao_por: req.user.userId,
      valor_estimado: valor,
      precisa_aprovacao_financeira: true,
      status: 'aguardando_aprovacao_financeira',
    };
    const { data, error } = await supabase
      .from('solicitacoes')
      .update(updates)
      .eq('id', req.params.id)
      .eq('status', 'em_cotacao')
      .is('deleted_at', null)
      .select('*')
      .maybeSingle();
    if (error) throw error;
    if (!data) return res.status(409).json({ error: 'Esta solicitação saiu da etapa de cotação. Atualize a fila antes de registrar a cotação.' });

    // A dispensa ≤ R$ 1.000 foi decidida sobre a ESTIMATIVA — se a cotação real
    // estourou o limite, o financeiro precisa saber que o pedido pulou os
    // carimbos (a aprovação segue com o financeiro, sobre o valor cotado).
    const dispensadaPorBaixoValor = atual.aprovacao_origem_motivo === COMPRA_COTACAO_DIRETA_MOTIVO;
    const cotacaoAcimaDaDispensa = dispensadaPorBaixoValor && valor > COMPRA_COTACAO_DIRETA_LIMITE;
    if (cotacaoAcimaDaDispensa) {
      registrarEvento(data.id, {
        statusAnterior: 'em_cotacao',
        statusNovo: 'aguardando_aprovacao_financeira',
        atorId: req.user.userId,
        observacao: `Cotação de R$ ${valor.toFixed(2)} acima do limite de R$ ${COMPRA_COTACAO_DIRETA_LIMITE} que dispensou as aprovações no pedido`,
      });
    }

    // Notifica o financeiro que há uma cotação para aprovar.
    resolverDestinatarios('financeiro').then(async managers => {
      const finProfileIds = new Set((managers || []).filter(Boolean));
      const { data: responsaveisFinanceiro } = await supabase
        .from('area_solicitacoes_responsaveis')
        .select('profile_id')
        .eq('area', 'financeiro');
      (responsaveisFinanceiro || []).forEach(item => item.profile_id && finProfileIds.add(item.profile_id));
      const alvo = await filtrarAprovadoresFinanceirosPorCategoria(finProfileIds, data.categoria);
      if (alvo.length) {
        notificar({
          modulo: 'financeiro',
          tipo: 'solicitacao_status',
          titulo: `Cotação pronta: ${data.titulo}`,
          mensagem: `A logística cotou R$ ${valor.toFixed(2)}${fornecedor ? ` (${fornecedor})` : ''} · aguarda sua aprovação financeira.${cotacaoAcimaDaDispensa ? ` Atenção: o pedido entrou sem aprovações por ter sido estimado em até R$ ${COMPRA_COTACAO_DIRETA_LIMITE}, mas a cotação veio acima disso.` : ''}`,
          link: linkFilaFinanceira(data.id),
          severidade: cotacaoAcimaDaDispensa ? 'alta' : 'info',
          chaveDedup: `solicitacao_cotacao_${data.id}`,
          targetIds: alvo,
          // Aprovador financeiro (Alberto) recebe a cotação pronta por e-mail também.
          email: true,
        }).catch(err => console.error('[SOLICITACOES] notify cotacao:', err.message));
      }
    }).catch(err => console.error('[SOLICITACOES] resolve financeiro:', err.message));

    res.json(data);
  } catch (e) {
    console.error('[SOLICITACOES] registrar-cotacao:', e.message);
    res.status(500).json({ error: e.message || 'Erro ao registrar cotação' });
  }
});

// ══════════════════════════════════════════════════════════════════════════
// COTAÇÕES MÚLTIPLAS (compras/serviço) · o Amaury registra VÁRIAS cotações de
// fornecedores e, com um botão reenviável, dispara um e-mail rico ao financeiro
// com todas as cotações separadas + a sugerida + total, pra aprovar o
// pagamento. Tabela `solicitacao_cotacoes`. A cotação inline antiga segue
// preenchida com a de referência (retrocompat com telas/KPIs que a leem).
// ══════════════════════════════════════════════════════════════════════════

// Carrega a solicitação-mãe (ativa) a partir de uma cotação · reusa o gate podeCotar.
async function carregarSolDaCotacao(cotacaoId) {
  const { data: cot } = await supabase
    .from('solicitacao_cotacoes').select('*').eq('id', cotacaoId).maybeSingle();
  if (!cot) return { cot: null, sol: null };
  const { data: sol } = await supabase
    .from('solicitacoes').select('*').eq('id', cot.solicitacao_id).is('deleted_at', null).maybeSingle();
  return { cot, sol };
}

function cotacoesPodemSerGerenciadas(solicitacao) {
  return ['compras', 'servico'].includes(solicitacao?.categoria)
    && !solicitacao?.aprovado_financeiro_em
    && ['em_cotacao', 'aguardando_aprovacao_financeira'].includes(solicitacao?.status);
}

function fmtBRLServer(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return 'R$ 0,00';
  return 'R$ ' + v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function escapeHtmlCot(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Lista as cotações de uma solicitação. Logística e solicitante acompanham o
// levantamento; o financeiro só acessa depois que a cotação entra na sua fila.
router.get('/:id/cotacoes', async (req, res) => {
  try {
    const { data: sol, error: solError } = await supabase
      .from('solicitacoes')
      .select('*')
      .eq('id', req.params.id)
      .is('deleted_at', null)
      .maybeSingle();
    if (solError) throw solError;
    if (!sol) return res.status(404).json({ error: 'Solicitação não encontrada.' });

    let podeVer = sol.solicitante_id === req.user.userId;
    if (!podeVer) podeVer = await podeCotar(req, sol);
    if (!podeVer) podeVer = await podeGerirSolicitacao(req, sol);
    if (!podeVer && aguardandoAprovacaoFinanceira(sol)) {
      podeVer = await podeAprovarFinanceiro(req, sol.categoria);
    }
    // Quem vai decidir pela alçada precisa VER as cotações antes de aprovar.
    if (!podeVer) podeVer = await podeAprovarNaAlcada(req, sol);
    if (!podeVer) {
      return res.status(403).json({ error: 'Sem permissão para ver as cotações desta solicitação.' });
    }

    const { data, error } = await supabase
      .from('solicitacao_cotacoes')
      .select('*')
      .eq('solicitacao_id', req.params.id)
      .order('ordem', { ascending: true })
      .order('created_at', { ascending: true });
    if (error) throw error;
    res.json(data || []);
  } catch (e) {
    console.error('[SOLICITACOES] listar-cotacoes:', e.message);
    res.status(500).json({ error: e.message || 'Erro ao listar cotações' });
  }
});

// Cria uma cotação (gate podeCotar · exige que a solicitação esteja em cotação).
router.post('/:id/cotacoes', async (req, res) => {
  try {
    const { fornecedor, valor, prazo, link, observacao, anexo_url } = req.body || {};
    const nomeForn = (fornecedor || '').trim();
    if (!nomeForn) return res.status(400).json({ error: 'Informe o fornecedor.' });
    const v = Number(valor);
    if (valor == null || valor === '' || Number.isNaN(v) || v < 0) {
      return res.status(400).json({ error: 'Informe o valor da cotação (número ≥ 0).' });
    }
    const { data: sol, error: getErr } = await supabase
      .from('solicitacoes').select('*').eq('id', req.params.id).is('deleted_at', null).maybeSingle();
    if (getErr) throw getErr;
    if (!sol) return res.status(404).json({ error: 'Solicitação não encontrada.' });
    if (!['compras', 'servico'].includes(sol.categoria)) {
      return res.status(400).json({ error: 'Cotações só se aplicam a compras/serviço.' });
    }
    if (!(await podeCotar(req, sol))) {
      return res.status(403).json({ error: 'Apenas a logística (ou admin) pode registrar cotações.' });
    }
    if (!cotacoesPodemSerGerenciadas(sol)) {
      return res.status(400).json({ error: 'As cotações só podem ser alteradas antes da aprovação financeira.' });
    }

    // ordem = próxima posição
    const { count } = await supabase
      .from('solicitacao_cotacoes')
      .select('id', { count: 'exact', head: true })
      .eq('solicitacao_id', sol.id);

    const { data, error } = await supabase
      .from('solicitacao_cotacoes')
      .insert({
        solicitacao_id: sol.id,
        fornecedor: nomeForn,
        valor: v,
        prazo: (prazo || '').trim() || null,
        link: (link || '').trim() || null,
        observacao: (observacao || '').trim() || null,
        anexo_url: (anexo_url || '').trim() || null,
        ordem: count || 0,
        created_by: req.user.userId,
      })
      .select('*').single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (e) {
    console.error('[SOLICITACOES] criar-cotacao:', e.message);
    res.status(500).json({ error: e.message || 'Erro ao criar cotação' });
  }
});

// Edita campos de uma cotação (gate via solicitação-mãe).
router.patch('/cotacoes/:cotacaoId', async (req, res) => {
  try {
    const { sol } = await carregarSolDaCotacao(req.params.cotacaoId);
    if (!sol) return res.status(404).json({ error: 'Cotação não encontrada.' });
    if (!(await podeCotar(req, sol))) {
      return res.status(403).json({ error: 'Apenas a logística (ou admin) pode editar cotações.' });
    }
    if (!cotacoesPodemSerGerenciadas(sol)) {
      return res.status(400).json({ error: 'As cotações só podem ser alteradas antes da aprovação financeira.' });
    }
    const { fornecedor, valor, prazo, link, observacao, anexo_url } = req.body || {};
    const updates = {};
    if (fornecedor !== undefined) {
      const nome = (fornecedor || '').trim();
      if (!nome) return res.status(400).json({ error: 'Fornecedor não pode ficar vazio.' });
      updates.fornecedor = nome;
    }
    if (valor !== undefined) {
      const v = Number(valor);
      if (Number.isNaN(v) || v < 0) return res.status(400).json({ error: 'Valor inválido.' });
      updates.valor = v;
    }
    if (prazo !== undefined) updates.prazo = (prazo || '').trim() || null;
    if (link !== undefined) updates.link = (link || '').trim() || null;
    if (observacao !== undefined) updates.observacao = (observacao || '').trim() || null;
    if (anexo_url !== undefined) updates.anexo_url = (anexo_url || '').trim() || null;
    if (!Object.keys(updates).length) return res.status(400).json({ error: 'Nada para atualizar.' });

    const { data, error } = await supabase
      .from('solicitacao_cotacoes').update(updates).eq('id', req.params.cotacaoId).select('*').single();
    if (error) throw error;
    res.json(data);
  } catch (e) {
    console.error('[SOLICITACOES] editar-cotacao:', e.message);
    res.status(500).json({ error: e.message || 'Erro ao editar cotação' });
  }
});

// Remove uma cotação (hard delete · sem PII).
router.delete('/cotacoes/:cotacaoId', async (req, res) => {
  try {
    const { sol } = await carregarSolDaCotacao(req.params.cotacaoId);
    if (!sol) return res.status(404).json({ error: 'Cotação não encontrada.' });
    if (!(await podeCotar(req, sol))) {
      return res.status(403).json({ error: 'Apenas a logística (ou admin) pode remover cotações.' });
    }
    if (!cotacoesPodemSerGerenciadas(sol)) {
      return res.status(400).json({ error: 'As cotações só podem ser alteradas antes da aprovação financeira.' });
    }
    const { error } = await supabase
      .from('solicitacao_cotacoes').delete().eq('id', req.params.cotacaoId);
    if (error) throw error;
    res.json({ ok: true });
  } catch (e) {
    console.error('[SOLICITACOES] remover-cotacao:', e.message);
    res.status(500).json({ error: e.message || 'Erro ao remover cotação' });
  }
});

// Marca uma cotação como sugerida e desmarca as demais da mesma solicitação.
router.post('/:id/cotacoes/:cotacaoId/sugerir', async (req, res) => {
  try {
    const { data: sol } = await supabase
      .from('solicitacoes').select('*').eq('id', req.params.id).is('deleted_at', null).maybeSingle();
    if (!sol) return res.status(404).json({ error: 'Solicitação não encontrada.' });
    if (!(await podeCotar(req, sol))) {
      return res.status(403).json({ error: 'Apenas a logística (ou admin) pode marcar a cotação sugerida.' });
    }
    if (!cotacoesPodemSerGerenciadas(sol)) {
      return res.status(400).json({ error: 'As cotações só podem ser alteradas antes da aprovação financeira.' });
    }
    // Desmarca todas antes (respeita o índice único parcial) e marca a escolhida.
    const { error: e1 } = await supabase
      .from('solicitacao_cotacoes').update({ sugerida: false })
      .eq('solicitacao_id', req.params.id).eq('sugerida', true);
    if (e1) throw e1;
    const { data, error } = await supabase
      .from('solicitacao_cotacoes').update({ sugerida: true })
      .eq('id', req.params.cotacaoId).eq('solicitacao_id', req.params.id).select('*').single();
    if (error) throw error;
    res.json(data);
  } catch (e) {
    console.error('[SOLICITACOES] sugerir-cotacao:', e.message);
    res.status(500).json({ error: e.message || 'Erro ao marcar cotação sugerida' });
  }
});

// Monta o HTML do e-mail de cotações pro financeiro (builder próprio · sem rodapé
// de voluntariado). Valores em pt-BR, acentuação correta.
function montarHtmlCotacoes({ sol, cotacoes, itens, refCot, solicitanteNome, catLabel, link }) {
  const total = cotacoes.reduce((s, c) => s + (Number(c.valor) || 0), 0);
  const dataNec = sol.data_necessaria
    ? new Date(sol.data_necessaria).toLocaleDateString('pt-BR')
    : null;

  const linhasCot = cotacoes.map(c => {
    const eSug = !!c.sugerida;
    const fw = eSug ? 'font-weight:700;' : '';
    const bg = eSug ? 'background:#e8faf6;' : '';
    const estrela = eSug ? '★ ' : '';
    const linkHtml = c.link
      ? `<a href="${escapeHtmlCot(c.link)}" style="color:#00857a">abrir</a>`
      : '<span style="color:#bbb">—</span>';
    const obs = c.observacao
      ? `<div style="color:#666;font-size:12px;margin-top:2px">${escapeHtmlCot(c.observacao)}</div>` : '';
    return `<tr style="${bg}">
      <td style="padding:8px 10px;border-bottom:1px solid #eee;${fw}">${estrela}${escapeHtmlCot(c.fornecedor)}${obs}</td>
      <td style="padding:8px 10px;border-bottom:1px solid #eee;text-align:right;${fw}">${fmtBRLServer(c.valor)}</td>
      <td style="padding:8px 10px;border-bottom:1px solid #eee;">${escapeHtmlCot(c.prazo || '—')}</td>
      <td style="padding:8px 10px;border-bottom:1px solid #eee;">${linkHtml}</td>
    </tr>`;
  }).join('');

  const itensHtml = (itens && itens.length)
    ? `<p style="margin:20px 0 6px;font-weight:700;color:#1a1a1a">Itens do pedido</p>
       <table style="border-collapse:collapse;width:100%;font-size:13px">
         <thead><tr style="background:#f5f5f5;text-align:left">
           <th style="padding:6px 10px">Item</th>
           <th style="padding:6px 10px;text-align:right">Qtd</th>
         </tr></thead>
         <tbody>${itens.map(it => `<tr>
           <td style="padding:6px 10px;border-bottom:1px solid #eee">${escapeHtmlCot(it.descricao)}</td>
           <td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:right">${escapeHtmlCot(it.quantidade)} ${escapeHtmlCot(it.unidade || '')}</td>
         </tr>`).join('')}</tbody>
       </table>` : '';

  return `
  <div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#1a1a1a;line-height:1.5;max-width:640px">
    <h2 style="margin:0 0 4px;font-size:18px;color:#00857a">Cotações para aprovação</h2>
    <p style="margin:0 0 16px;color:#666">${escapeHtmlCot(sol.titulo || 'Solicitação')}</p>

    <table style="border-collapse:collapse;width:100%;font-size:13px;margin-bottom:8px">
      <tbody>
        <tr><td style="padding:3px 0;color:#888;width:130px">Solicitante</td><td style="padding:3px 0">${escapeHtmlCot(solicitanteNome || '—')}</td></tr>
        <tr><td style="padding:3px 0;color:#888">Categoria</td><td style="padding:3px 0">${escapeHtmlCot(catLabel || sol.categoria || '—')}</td></tr>
        ${dataNec ? `<tr><td style="padding:3px 0;color:#888">Data necessária</td><td style="padding:3px 0">${dataNec}</td></tr>` : ''}
      </tbody>
    </table>

    <p style="margin:16px 0 6px;font-weight:700">Cotações (${cotacoes.length})</p>
    <table style="border-collapse:collapse;width:100%;font-size:13px">
      <thead><tr style="background:#f5f5f5;text-align:left">
        <th style="padding:8px 10px">Fornecedor</th>
        <th style="padding:8px 10px;text-align:right">Valor</th>
        <th style="padding:8px 10px">Prazo</th>
        <th style="padding:8px 10px">Link</th>
      </tr></thead>
      <tbody>${linhasCot}</tbody>
    </table>

    <p style="margin:12px 0 0;font-size:13px;color:#444">
      ${refCot ? `<strong>Sugerida:</strong> ${escapeHtmlCot(refCot.fornecedor)} — ${fmtBRLServer(refCot.valor)}<br/>` : ''}
      <span style="color:#888">Soma de todas as cotações listadas:</span> ${fmtBRLServer(total)}
    </p>

    ${itensHtml}

    ${link ? `<p style="margin:22px 0 8px"><a href="${escapeHtmlCot(link)}" style="background:#00B39D;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;display:inline-block">Abrir no sistema</a></p>` : ''}
    <p style="margin:16px 0 0;color:#999;font-size:12px">Mensagem automática do sistema CBRio · módulo de Solicitações.</p>
  </div>`;
}

// O BOTÃO · dispara o e-mail rico ao financeiro com todas as cotações (reenviável).
router.post('/:id/enviar-cotacoes-financeiro', async (req, res) => {
  try {
    const { data: sol, error: getErr } = await supabase
      .from('solicitacoes').select('*').eq('id', req.params.id).is('deleted_at', null).maybeSingle();
    if (getErr) throw getErr;
    if (!sol) return res.status(404).json({ error: 'Solicitação não encontrada.' });
    if (!(await podeCotar(req, sol))) {
      return res.status(403).json({ error: 'Apenas a logística (ou admin) pode enviar as cotações.' });
    }
    if (!cotacoesPodemSerGerenciadas(sol)) {
      return res.status(400).json({ error: 'As cotações só podem ser enviadas antes da aprovação financeira.' });
    }

    let { data: cotacoes, error: cotErr } = await supabase
      .from('solicitacao_cotacoes').select('*')
      .eq('solicitacao_id', sol.id)
      .order('ordem', { ascending: true }).order('created_at', { ascending: true });
    if (cotErr) throw cotErr;

    // Fluxo "um botão": o Amaury informa o valor no próprio envio e o sistema
    // cria a cotação na hora (sem etapa separada de "Adicionar"). Fornecedor é
    // opcional — a coluna é NOT NULL, então cai em 'Não informado'.
    if (!cotacoes || !cotacoes.length) {
      const vInline = Number(req.body?.valor);
      if (req.body?.valor != null && req.body?.valor !== '' && Number.isFinite(vInline) && vInline >= 0) {
        const { data: nova, error: novaErr } = await supabase
          .from('solicitacao_cotacoes')
          .insert({
            solicitacao_id: sol.id,
            fornecedor: (req.body.fornecedor || '').trim() || 'Não informado',
            valor: vInline,
            prazo: (req.body.prazo || '').trim() || null,
            link: (req.body.link || '').trim() || null,
            observacao: (req.body.observacao || '').trim() || null,
            ordem: 0,
            created_by: req.user.userId,
          })
          .select('*').single();
        if (novaErr) throw novaErr;
        cotacoes = [nova];
      }
    }
    if (!cotacoes || !cotacoes.length) {
      return res.status(400).json({ error: 'Informe o valor da cotação para enviar ao financeiro.' });
    }

    // Referência: a sugerida; se nenhuma, a de MENOR valor.
    const refCot = cotacoes.find(c => c.sugerida)
      || [...cotacoes].sort((a, b) => (Number(a.valor) || 0) - (Number(b.valor) || 0))[0];

    // Classificação contábil (loop financeiro · o Amaury preenche na cotação).
    const planoId = req.body?.plano_contas_id || null;
    const centroId = req.body?.centro_custo_id || null;
    if (planoId) {
      const { data: plano } = await supabase.from('fin_plano_contas')
        .select('tipo, aceita_lancamento, ativo').eq('id', planoId).maybeSingle();
      if (!plano || plano.tipo !== 'despesa' || !plano.aceita_lancamento || plano.ativo === false) {
        return res.status(400).json({ error: 'Plano de contas inválido (precisa ser uma conta de despesa que aceita lançamento).' });
      }
    }

    // Atualiza a solicitação (retrocompat inline + carimbo do e-mail).
    const updates = {
      valor_cotado: Number(refCot.valor),
      valor_estimado: Number(refCot.valor),
      precisa_aprovacao_financeira: true,
      cotacao_fornecedor: refCot.fornecedor || null,
      cotacao_observacao: refCot.observacao || null,
      cotacao_em: new Date().toISOString(),
      cotacao_por: req.user.userId,
      cotacoes_email_em: new Date().toISOString(),
      cotacoes_email_por: req.user.userId,
    };
    if (planoId) updates.plano_contas_id = planoId;
    if (centroId) updates.centro_custo_id = centroId;
    // Só muda o status na 1ª ida (em_cotacao); reenvio mantém o status atual.
    if (sol.status === 'em_cotacao') updates.status = 'aguardando_aprovacao_financeira';

    const { data: solAtualizada, error: upErr } = await supabase
      .from('solicitacoes')
      .update(updates)
      .eq('id', sol.id)
      .in('status', ['em_cotacao', 'aguardando_aprovacao_financeira'])
      .is('aprovado_financeiro_em', null)
      .is('deleted_at', null)
      .select('*')
      .maybeSingle();
    if (upErr) throw upErr;
    if (!solAtualizada) {
      return res.status(409).json({ error: 'Esta solicitação foi alterada por outra pessoa. Atualize antes de reenviar as cotações.' });
    }

    // Itens do pedido (opcional no e-mail).
    const { data: itens } = await supabase
      .from('solicitacao_itens').select('descricao, quantidade, unidade, ordem')
      .eq('solicitacao_id', sol.id).order('ordem', { ascending: true });

    // Nome do solicitante.
    let solicitanteNome = null;
    if (sol.solicitante_id) {
      const { data: prof } = await supabase
        .from('profiles').select('name').eq('id', sol.solicitante_id).maybeSingle();
      solicitanteNome = prof?.name || null;
    }

    // Destinatários do financeiro: união de (a) responsáveis nominais da área
    // 'financeiro' e (b) resolverDestinatarios('financeiro'). + CC o próprio Amaury.
    const finProfileIds = new Set();
    const { data: respFin } = await supabase
      .from('area_solicitacoes_responsaveis').select('profile_id').eq('area', 'financeiro');
    (respFin || []).forEach(r => r.profile_id && finProfileIds.add(r.profile_id));
    const resolvidos = await resolverDestinatarios('financeiro').catch(() => []);
    (resolvidos || []).forEach(id => id && finProfileIds.add(id));

    const idsArr = await filtrarAprovadoresFinanceirosPorCategoria(finProfileIds, sol.categoria);
    let emails = [];
    if (idsArr.length) {
      const { data: profs } = await supabase.from('profiles').select('email').in('id', idsArr);
      emails = (profs || []).map(p => p.email);
    }
    // CC o próprio solicitante do envio (Amaury).
    let remetenteEmail = null;
    if (req.user.userId) {
      const { data: me } = await supabase.from('profiles').select('email').eq('id', req.user.userId).maybeSingle();
      remetenteEmail = me?.email || null;
    }
    const to = [...new Set([...emails, remetenteEmail].filter(e => e && /@/.test(e)))];

    const catLabel = ({ compras: 'Compras', servico: 'Serviço' })[sol.categoria] || sol.categoria;
    const base = process.env.FRONTEND_URL || '';
    const link = base ? `${base}${linkFilaFinanceira(sol.id)}` : '';
    const html = montarHtmlCotacoes({ sol, cotacoes, itens, refCot, solicitanteNome, catLabel, link });

    // E-mail é OPCIONAL (botão discreto). O caminho principal é PELO SISTEMA:
    // status aguardando_aprovacao_financeira + notificação (o Alberto aprova na
    // fila do financeiro). Só manda e-mail quando explicitamente pedido.
    const querEmail = req.body?.enviar_email === true;
    let emailResultado = { ok: false, error: 'nao_solicitado' };
    if (querEmail && to.length) {
      emailResultado = await enviarEmail({
        to,
        subject: `Cotações para aprovação — ${sol.titulo || 'Solicitação'}`,
        html,
      }).catch(e => ({ ok: false, error: e.message }));
    }

    // Notificação no sistema (email:false · o e-mail rico já foi enviado acima).
    notificar({
      modulo: 'financeiro',
      tipo: 'cotacao_financeiro',
      titulo: 'Cotações prontas para aprovação',
      mensagem: `${cotacoes.length} ${cotacoes.length === 1 ? 'cotação' : 'cotações'} de "${sol.titulo}" · sugerida ${fmtBRLServer(refCot.valor)} (${refCot.fornecedor}).`,
      link: linkFilaFinanceira(sol.id),
      severidade: 'info',
      chaveDedup: `solicitacao_cotacoes_${sol.id}`,
      targetIds: idsArr,
      email: false,
    }).catch(err => console.error('[SOLICITACOES] notify cotacoes:', err.message));

    // Caminho principal (sistema): sem e-mail solicitado → já está com o financeiro.
    if (!querEmail) {
      return res.json({ ok: true, email_solicitado: false, solicitacao: solAtualizada });
    }
    if (!to.length) {
      return res.json({
        ok: true, email_solicitado: true, email_ok: false, enviados: 0,
        motivo: 'Nenhum e-mail de financeiro encontrado.',
        solicitacao: solAtualizada,
      });
    }
    if (!emailResultado?.ok) {
      return res.json({
        ok: true, email_solicitado: true, email_ok: false, enviados: to.length,
        motivo: emailResultado?.error || 'Falha no envio do e-mail.',
        solicitacao: solAtualizada,
      });
    }
    res.json({ ok: true, email_solicitado: true, email_ok: true, enviados: to.length, solicitacao: solAtualizada });
  } catch (e) {
    console.error('[SOLICITACOES] enviar-cotacoes-financeiro:', e.message);
    res.status(500).json({ error: e.message || 'Erro ao enviar cotações ao financeiro' });
  }
});

// Rejeição por QUALQUER carimbo (origem OU Gestão) · motivo obrigatório ·
// status fica imutavel (Marcos 2026-05-28 · "solicitação rejeitada não
// reabre · cria nova").
async function rejeitarOrigemHandler(req, res) {
  try {
    const userId = req.user.userId;
    const userName = req.user.name;
    const isSuperAdmin = await isAdminFallback(req);
    const { motivo } = req.body || {};
    if (!motivo || !motivo.trim()) {
      return res.status(400).json({ error: 'Motivo da rejeição é obrigatório.' });
    }

    const { data: atual } = await supabase
      .from('solicitacoes')
      .select('*')
      .eq('id', req.params.id)
      .is('deleted_at', null)
      .maybeSingle();
    if (!atual) return res.status(404).json({ error: 'Solicitação não encontrada.' });

    const origemPendente = ['pendente', 'triagem'].includes(atual.aprovacao_origem_status);
    const gestaoPendente = atual.aprovacao_gestao_status === 'pendente';
    if (!origemPendente && !gestaoPendente) {
      return res.status(400).json({ error: 'Solicitação não está pendente de aprovação.' });
    }

    const isDiretorAlvo = origemPendente && atual.aprovacao_origem_diretor_id === userId;
    const isCoaprovador = origemPendente && !isDiretorAlvo && await podeAprovarOrigem(userId, atual);
    const podeOrigem = origemPendente && (isDiretorAlvo || isCoaprovador || isSuperAdmin);
    let ehAprovadorGestao = false;
    if (gestaoPendente) {
      const gestaoIds = await aprovadoresGestaoIds(atual.categoria);
      ehAprovadorGestao = gestaoIds.includes(userId);
    }
    const podeGestao = gestaoPendente && (ehAprovadorGestao || isSuperAdmin);
    if (!podeOrigem && !podeGestao) {
      return res.status(403).json({ error: 'Apenas o diretor de origem, um co-aprovador do setor ou o 2º aprovador pode rejeitar esta solicitação.' });
    }

    const carimbo = podeOrigem ? 'origem' : 'gestao';
    const agoraIso = new Date().toISOString();
    const update = { status: 'rejeitado' };
    if (carimbo === 'origem') {
      update.aprovacao_origem_status = 'rejeitada';
      update.aprovacao_origem_em = agoraIso;
      update.aprovacao_origem_motivo = motivo.trim();
      if (!isDiretorAlvo && isSuperAdmin && !isCoaprovador) {
        update.aprovacao_origem_diretor_id = userId;
      }
    } else {
      update.aprovacao_gestao_status = 'rejeitada';
      update.aprovacao_gestao_por = userId;
      update.aprovacao_gestao_em = agoraIso;
      update.aprovacao_gestao_motivo = motivo.trim();
    }

    const { data, error } = await supabase
      .from('solicitacoes')
      .update(update)
      .eq('id', req.params.id)
      .select('*')
      .single();
    if (error) throw error;

    await registrarEvento(data.id, {
      statusAnterior: atual.status,
      statusNovo: 'rejeitado',
      atorId: userId,
      observacao: carimbo === 'gestao'
        ? `Rejeitada pela diretoria de Gestão: ${motivo.trim()}`
        : `Rejeitada na origem: ${motivo.trim()}`,
    });

    const modulo = CATEGORIA_MODULO[data.categoria] || 'administrativo';
    notificar({
      modulo,
      tipo: 'solicitacao_status',
      titulo: `Rejeitada: ${data.titulo}`,
      mensagem: `${userName || 'Diretor'} rejeitou: ${motivo.trim()}`,
      link: '/solicitacoes',
      severidade: 'alta',
      chaveDedup: `solicitacao_rejeitada_origem_${data.id}`,
      targetIds: [data.solicitante_id].filter(Boolean),
    }).catch(err => console.error('[SOLICITACOES] notify rejeitar:', err.message));

    res.json(data);
  } catch (e) {
    console.error('[SOLICITACOES] rejeitar-origem:', e.message);
    res.status(500).json({ error: e.message || 'Erro ao rejeitar solicitação' });
  }
}
router.patch('/:id/rejeitar-origem', rejeitarOrigemHandler);

// Normaliza itens de compra (mesma semântica do POST create · valor_tipo →
// TOTAL DA LINHA) → { itensNorm, itensTexto, valorTotal }. Reuso no converter.
function normalizarItensCompra(itens_lista) {
  const itensNorm = (Array.isArray(itens_lista) ? itens_lista : [])
    .filter(it => it && String(it.descricao || '').trim())
    .map((it, i) => {
      const qNum = Number(it.quantidade);
      const quantidade = isFinite(qNum) && qNum > 0 ? qNum : 1;
      const vNum = Number(it.valor_estimado);
      const temValor = it.valor_estimado != null && it.valor_estimado !== '' && isFinite(vNum);
      const valorLinha = temValor ? (it.valor_tipo === 'unitario' ? vNum * quantidade : vNum) : null;
      return {
        descricao: String(it.descricao).trim().slice(0, 500),
        quantidade,
        unidade: it.unidade ? String(it.unidade).trim().slice(0, 20) : 'un',
        link_referencia: it.link_referencia ? String(it.link_referencia).trim().slice(0, 1000) : null,
        valor_estimado: valorLinha,
        imagem_url: it.imagem_url ? String(it.imagem_url).slice(0, 2000) : null,
        ordem: i,
      };
    });
  const itensTexto = itensNorm.map(it => `${it.quantidade}x ${it.descricao}`).join('\n');
  const valorTotal = itensNorm.reduce((acc, it) => acc + (it.valor_estimado != null ? it.valor_estimado : 0), 0);
  return { itensNorm, itensTexto, valorTotal };
}

// Converter um pedido de MARKETING (criativo) em COMPRA — sem criar outra
// solicitação. A origem já foi aprovada no fluxo de marketing (diretor do
// Criativo), então só entra o portão de MÉRITO (Pastor Presidente) por valor.
// Fecha a campanha do marketing como concluída (o criativo terminou).
router.post('/:id/converter-em-compra', async (req, res) => {
  try {
    const { data: sol } = await supabase.from('solicitacoes')
      .select('*').eq('id', req.params.id).is('deleted_at', null).maybeSingle();
    if (!sol) return res.status(404).json({ error: 'Solicitação não encontrada.' });
    if (!(await podeGerirSolicitacao(req, sol))) {
      return res.status(403).json({ error: 'Você não pode converter esta solicitação.' });
    }
    if (!CRIATIVO_CATEGORIAS.includes(sol.categoria)) {
      return res.status(400).json({ error: 'Só um pedido de marketing/produção pode virar compra.' });
    }
    if (['concluido', 'cancelado', 'rejeitado', 'avaliado'].includes(sol.status)) {
      return res.status(400).json({ error: 'Este pedido já está encerrado.' });
    }

    const { itens_lista, favorecido_nome, eh_planejado, data_necessaria, justificativa } = req.body || {};
    const { itensNorm, itensTexto, valorTotal } = normalizarItensCompra(itens_lista);
    if (!itensNorm.length) return res.status(400).json({ error: 'Adicione ao menos um item da compra.' });

    const planejado = eh_planejado === true || eh_planejado === 'true';
    // Régua de valor (mérito · Pastor Presidente): planejado > 5k · não-planejado > 1k.
    const precisaMeritoConv = planejado ? valorTotal > 5000 : valorTotal > 1000;
    const now = new Date().toISOString();

    const updates = {
      categoria: 'compras',
      area_responsavel: 'logistica_compras',
      subcategoria: 'default',
      eh_planejado: planejado,
      ...(planejado ? { planejado_por: req.user.userId } : {}),
      itens: itensTexto,
      valor_estimado: valorTotal,
      // O trigger de SLA que liga isto é só no INSERT — aqui setamos explícito.
      precisa_aprovacao_financeira: true,
      aprovacao_gestao_status: 'dispensada',
      aprovacao_gestao_em: now,
      aprovacao_gestao_motivo: 'Compra convertida de um pedido de marketing (origem já aprovada no Criativo).',
      status: precisaMeritoConv ? 'aguardando_merito' : 'em_cotacao',
      ...(precisaMeritoConv ? { merito_status: 'pendente', merito_em: now } : {}),
    };
    if (favorecido_nome) updates.favorecido_nome = String(favorecido_nome).trim().slice(0, 200);
    if (data_necessaria) updates.data_necessaria = data_necessaria;
    if (justificativa) {
      updates.justificativa = sol.justificativa
        ? `${sol.justificativa}\n[Virou compra] ${justificativa}`
        : String(justificativa).slice(0, 2000);
    }

    const { data, error } = await supabase.from('solicitacoes')
      .update(updates).eq('id', sol.id).is('deleted_at', null).select('*').maybeSingle();
    if (error) throw error;
    if (!data) return res.status(409).json({ error: 'Solicitação alterada por outra pessoa. Recarregue.' });

    // Itens estruturados (best-effort · o write primário já decidiu o sucesso).
    try {
      await supabase.from('solicitacao_itens')
        .insert(itensNorm.map(it => ({ ...it, solicitacao_id: sol.id })));
    } catch (e) { console.error('[SOLICITACOES] converter itens:', e.message); }

    // Fecha a campanha do marketing como concluída (o criativo terminou). NÃO usa
    // o caminho de conclusão de card (que marcaria o próprio pedido como concluído).
    try {
      await supabase.from('marketing_campanhas')
        .update({ status: 'concluida' })
        .eq('solicitacao_id', sol.id).neq('status', 'concluida');
    } catch (e) { console.error('[SOLICITACOES] fechar campanha:', e.message); }

    // Notifica a logística (Amaury) + o solicitante.
    notificar({
      modulo: 'logistica',
      tipo: 'solicitacao_status',
      titulo: `Compra vinda do marketing: ${sol.titulo}`,
      mensagem: `Um pedido de marketing virou compra${precisaMeritoConv ? ' (aguardando o Pastor Presidente)' : ' e já está pronto pra cotação'}.`,
      link: '/solicitacoes',
      severidade: 'info',
      chaveDedup: `solicitacao_virou_compra_${sol.id}`,
      extraTargetIds: [sol.solicitante_id].filter(Boolean),
    }).catch(err => console.error('[SOLICITACOES] notify converter:', err.message));

    res.json(data);
  } catch (e) {
    console.error('[SOLICITACOES] converter-em-compra:', e.message);
    res.status(500).json({ error: e.message || 'Erro ao converter em compra' });
  }
});

// ── Chamada interna (fake req/res) · reusa 100% da lógica dos handlers acima
// pra o webhook do WhatsApp aplicar a decisão do Arthur (1=aprovar, 2=rejeitar).
function _fakeRes() {
  const r = { statusCode: 200, body: null };
  r.status = (c) => { r.statusCode = c; return r; };
  r.json = (b) => { r.body = b; return r; };
  return r;
}
async function aprovarOrigemInterno({ solicitacaoId, aprovadorId, aprovadorNome, aprovadorEmail }) {
  const req = { params: { id: solicitacaoId }, body: {}, user: { userId: aprovadorId, name: aprovadorNome || null, email: aprovadorEmail || '', role: 'assistente' } };
  const res = _fakeRes();
  await aprovarOrigemHandler(req, res);
  return { ok: res.statusCode < 400, status: res.statusCode, data: res.body };
}
async function rejeitarOrigemInterno({ solicitacaoId, aprovadorId, aprovadorNome, aprovadorEmail, motivo }) {
  const req = { params: { id: solicitacaoId }, body: { motivo: motivo || 'Rejeitada pelo WhatsApp' }, user: { userId: aprovadorId, name: aprovadorNome || null, email: aprovadorEmail || '', role: 'assistente' } };
  const res = _fakeRes();
  await rejeitarOrigemHandler(req, res);
  return { ok: res.statusCode < 400, status: res.statusCode, data: res.body };
}

// ══════════════════════════════════════════════════════════════════════════
// JULGAMENTO DE MÉRITO (fluxo BPMN 2026-07-02) · Pastor Presidente decide os
// pedidos não-planejados COM CUSTO depois dos 2 carimbos. Aprovadores vivem em
// solicitacoes_merito_aprovadores (seed: Pr. Juninho) · super-admin é fallback.
// ══════════════════════════════════════════════════════════════════════════

async function podeJulgarMerito(req) {
  const ids = await aprovadoresMeritoIds();
  if (ids.includes(req.user.userId)) return true;
  return isAdminFallback(req); // fallback super-admin/admin
}

async function aprovarMeritoHandler(req, res) {
  try {
    const userId = req.user.userId;
    const userName = req.user.name;
    if (!(await podeJulgarMerito(req))) {
      return res.status(403).json({ error: 'Apenas o aprovador de mérito pode julgar esta solicitação.' });
    }

    const { data: atual } = await supabase
      .from('solicitacoes')
      .select('*')
      .eq('id', req.params.id)
      .is('deleted_at', null)
      .maybeSingle();
    if (!atual) return res.status(404).json({ error: 'Solicitação não encontrada.' });
    if (atual.status !== 'aguardando_merito') {
      return res.status(400).json({ error: 'Solicitação não está aguardando julgamento de mérito.' });
    }

    // Aprovou o mérito → segue o fluxo normal (mesma régua do aprovar-origem):
    // compras/servico → em_cotacao · precisa financeira → aguardando_aprovacao_
    // financeira · senão → pendente (fila da área).
    const { data, error } = await supabase
      .from('solicitacoes')
      .update({
        merito_status: 'aprovado',
        merito_por: userId,
        merito_em: new Date().toISOString(),
        status: proximoStatusPosAprovacao(atual),
      })
      .eq('id', req.params.id)
      .select('*')
      .single();
    if (error) throw error;

    await registrarEvento(data.id, {
      statusAnterior: atual.status,
      statusNovo: data.status,
      atorId: userId,
      observacao: `Mérito aprovado por ${userName || 'aprovador de mérito'}`,
    });

    const modulo = CATEGORIA_MODULO[data.categoria] || 'administrativo';
    const destinoLabel = {
      em_cotacao: 'cotação na logística (valor e fornecedor) antes do financeiro',
      aguardando_aprovacao_financeira: 'aprovação financeira',
      pendente: `a fila ${data.area_responsavel || 'da área responsável'}`,
    }[data.status] || 'a próxima etapa do fluxo';
    notificar({
      modulo,
      tipo: 'solicitacao_status',
      titulo: `Mérito aprovado: ${data.titulo}`,
      mensagem: `${userName || 'O aprovador de mérito'} aprovou o mérito · seu pedido seguiu para ${destinoLabel}.`,
      link: '/solicitacoes',
      severidade: 'info',
      chaveDedup: `solicitacao_merito_aprovado_${data.id}`,
      targetIds: [data.solicitante_id].filter(Boolean),
    }).catch(err => console.error('[SOLICITACOES] notify merito aprovado:', err.message));

    // Fila da área alvo (mesmo padrão do pós-aprovação de origem).
    if (data.area_responsavel) {
      resolverDestinatarios(modulo).then(managers => {
        const filtered = managers.filter(id => id !== data.solicitante_id);
        if (filtered.length) {
          notificar({
            modulo,
            tipo: 'solicitacao',
            titulo: data.status === 'em_cotacao' ? `Cotar: ${data.titulo}` : `Nova na fila: ${data.titulo}`,
            mensagem: data.status === 'em_cotacao'
              ? 'Mérito aprovado · registre a cotação (valor + fornecedor) pra seguir pro financeiro.'
              : 'Mérito aprovado · pronta para a próxima etapa.',
            link: '/solicitacoes',
            severidade: 'info',
            chaveDedup: `solicitacao_pos_merito_${data.id}`,
            targetIds: filtered,
          }).catch(err => console.error('[SOLICITACOES] notify pos-merito:', err.message));
        }
      }).catch(err => console.error('[SOLICITACOES] resolve managers merito:', err.message));
    }

    notificarPedidoWhatsapp(data.id, 'mérito aprovado', null);
    res.json(data);
  } catch (e) {
    console.error('[SOLICITACOES] aprovar-merito:', e.message);
    res.status(500).json({ error: e.message || 'Erro ao aprovar o mérito' });
  }
}
router.post('/:id/aprovar-merito', aprovarMeritoHandler);

// Reprovação de mérito é IMUTÁVEL (como a rejeição de origem · não reabre ·
// cria-se nova solicitação). Motivo obrigatório (mínimo 5 caracteres).
async function reprovarMeritoHandler(req, res) {
  try {
    const userId = req.user.userId;
    const userName = req.user.name;
    if (!(await podeJulgarMerito(req))) {
      return res.status(403).json({ error: 'Apenas o aprovador de mérito pode julgar esta solicitação.' });
    }
    const { motivo } = req.body || {};
    if (!motivo || motivo.trim().length < 5) {
      return res.status(400).json({ error: 'Informe o motivo da reprovação (mínimo 5 caracteres).' });
    }

    const { data: atual } = await supabase
      .from('solicitacoes')
      .select('*')
      .eq('id', req.params.id)
      .is('deleted_at', null)
      .maybeSingle();
    if (!atual) return res.status(404).json({ error: 'Solicitação não encontrada.' });
    if (atual.status !== 'aguardando_merito') {
      return res.status(400).json({ error: 'Solicitação não está aguardando julgamento de mérito.' });
    }

    const { data, error } = await supabase
      .from('solicitacoes')
      .update({
        merito_status: 'rejeitado',
        merito_por: userId,
        merito_em: new Date().toISOString(),
        merito_motivo: motivo.trim(),
        status: 'rejeitado',
      })
      .eq('id', req.params.id)
      .select('*')
      .single();
    if (error) throw error;

    await registrarEvento(data.id, {
      statusAnterior: atual.status,
      statusNovo: 'rejeitado',
      atorId: userId,
      observacao: `Mérito reprovado: ${motivo.trim()}`,
    });

    const modulo = CATEGORIA_MODULO[data.categoria] || 'administrativo';
    notificar({
      modulo,
      tipo: 'solicitacao_status',
      titulo: `Mérito reprovado: ${data.titulo}`,
      mensagem: `${userName || 'O aprovador de mérito'} reprovou o mérito: ${motivo.trim()}`,
      link: '/solicitacoes',
      severidade: 'alta',
      chaveDedup: `solicitacao_merito_reprovado_${data.id}`,
      targetIds: [data.solicitante_id].filter(Boolean),
    }).catch(err => console.error('[SOLICITACOES] notify merito reprovado:', err.message));

    notificarPedidoWhatsapp(data.id, 'mérito reprovado', motivo.trim());
    res.json(data);
  } catch (e) {
    console.error('[SOLICITACOES] reprovar-merito:', e.message);
    res.status(500).json({ error: e.message || 'Erro ao reprovar o mérito' });
  }
}
router.post('/:id/reprovar-merito', reprovarMeritoHandler);

// Wrappers internos (aprovação/reprovação de mérito pelo WhatsApp · mesmo padrão
// do origem). aprovadorId = profile do aprovador de mérito (passa no podeJulgarMerito).
async function aprovarMeritoInterno({ solicitacaoId, aprovadorId, aprovadorNome, aprovadorEmail }) {
  const req = { params: { id: solicitacaoId }, body: {}, user: { userId: aprovadorId, name: aprovadorNome || null, email: aprovadorEmail || '', role: 'assistente' } };
  const res = _fakeRes();
  await aprovarMeritoHandler(req, res);
  return { ok: res.statusCode < 400, status: res.statusCode, data: res.body };
}
async function rejeitarMeritoInterno({ solicitacaoId, aprovadorId, aprovadorNome, aprovadorEmail, motivo }) {
  const req = { params: { id: solicitacaoId }, body: { motivo: motivo || 'Reprovada pelo WhatsApp' }, user: { userId: aprovadorId, name: aprovadorNome || null, email: aprovadorEmail || '', role: 'assistente' } };
  const res = _fakeRes();
  await reprovarMeritoHandler(req, res);
  return { ok: res.statusCode < 400, status: res.statusCode, data: res.body };
}

// ══════════════════════════════════════════════════════════════════════════
// SOBRESTAR / RETOMAR (fluxo BPMN 2026-07-02) · "em espera" com motivo + data
// de revisão opcional · SLA PAUSA no sobrestar e é empurrado na retomada
// (mesma régua do relatar-problema/reenviar). NUNCA seta aprovado_financeiro_em.
// Quem pode: financeiro (quando aguardando_aprovacao_financeira) · responsável
// da área/admin (pendente/em_analise/em_atendimento).
// ══════════════════════════════════════════════════════════════════════════

const STATUS_SOBRESTAVEL_RESP = ['pendente', 'em_analise', 'em_atendimento'];

router.post('/:id/sobrestar', async (req, res) => {
  try {
    const userId = req.user.userId;
    const userName = req.user.name;
    const { motivo, revisao } = req.body || {};
    if (!motivo || motivo.trim().length < 3) {
      return res.status(400).json({ error: 'Informe o motivo do sobrestamento (mínimo 3 caracteres).' });
    }
    if (revisao && !/^\d{4}-\d{2}-\d{2}$/.test(String(revisao))) {
      return res.status(400).json({ error: 'Data de revisão inválida (use AAAA-MM-DD).' });
    }

    const { data: atual } = await supabase
      .from('solicitacoes')
      .select('*')
      .eq('id', req.params.id)
      .is('deleted_at', null)
      .maybeSingle();
    if (!atual) return res.status(404).json({ error: 'Solicitação não encontrada.' });

    if (atual.status === 'aguardando_aprovacao_financeira') {
      if (!(await podeAprovarFinanceiro(req, atual.categoria))) {
        return res.status(403).json({ error: 'Apenas o financeiro pode sobrestar nesta etapa.' });
      }
    } else if (STATUS_SOBRESTAVEL_RESP.includes(atual.status)) {
      if (!(await podeGerirSolicitacao(req, atual))) {
        return res.status(403).json({ error: 'Apenas o responsável da área (ou admin) pode sobrestar esta solicitação.' });
      }
    } else {
      return res.status(400).json({ error: 'Esta solicitação não pode ser sobrestada neste status.' });
    }

    const agoraIso = new Date().toISOString();
    const update = {
      status: 'sobrestada',
      sobrestada_em: agoraIso,
      sobrestada_por: userId,
      sobrestada_motivo: motivo.trim(),
      sobrestada_revisao: revisao || null,
      sobrestada_status_anterior: atual.status,
    };
    // Pausa o SLA (só se ainda não pausado) · NUNCA seta aprovado_financeiro_em.
    if (!atual.sla_pausado_em) update.sla_pausado_em = agoraIso;

    const { data, error } = await supabase
      .from('solicitacoes')
      .update(update)
      .eq('id', req.params.id)
      .select('*')
      .single();
    if (error) throw error;

    const revisaoBr = revisao ? String(revisao).split('-').reverse().join('/') : null;
    await registrarEvento(data.id, {
      statusAnterior: atual.status,
      statusNovo: 'sobrestada',
      atorId: userId,
      observacao: `Sobrestada: ${motivo.trim()}${revisaoBr ? ` · revisão em ${revisaoBr}` : ''}`,
    });

    const modulo = CATEGORIA_MODULO[data.categoria] || 'administrativo';
    notificar({
      modulo,
      tipo: 'solicitacao_status',
      titulo: `Em espera (sobrestada): ${data.titulo}`,
      mensagem: `${userName || 'A área'} colocou sua solicitação em espera: ${motivo.trim()}${revisaoBr ? ` · revisão prevista para ${revisaoBr}` : ''}. O SLA fica pausado até a retomada.`,
      link: '/solicitacoes',
      severidade: 'info',
      chaveDedup: `solicitacao_sobrestada_${data.id}_${Date.now()}`,
      targetIds: [data.solicitante_id].filter(Boolean),
    }).catch(err => console.error('[SOLICITACOES] notify sobrestar:', err.message));

    notificarPedidoWhatsapp(data.id, 'em espera (sobrestada)', motivo.trim());
    res.json(data);
  } catch (e) {
    console.error('[SOLICITACOES] sobrestar:', e.message);
    res.status(500).json({ error: e.message || 'Erro ao sobrestar a solicitação' });
  }
});

router.post('/:id/retomar', async (req, res) => {
  try {
    const userId = req.user.userId;
    const userName = req.user.name;

    const { data: atual } = await supabase
      .from('solicitacoes')
      .select('*')
      .eq('id', req.params.id)
      .is('deleted_at', null)
      .maybeSingle();
    if (!atual) return res.status(404).json({ error: 'Solicitação não encontrada.' });
    if (atual.status !== 'sobrestada') {
      return res.status(400).json({ error: 'Solicitação não está sobrestada.' });
    }

    // Quem pode retomar = quem pode sobrestar naquele contexto.
    if (atual.sobrestada_status_anterior === 'aguardando_aprovacao_financeira') {
      if (!(await podeAprovarFinanceiro(req, atual.categoria))) {
        return res.status(403).json({ error: 'Apenas o financeiro pode retomar nesta etapa.' });
      }
    } else if (!(await podeGerirSolicitacao(req, atual))) {
      return res.status(403).json({ error: 'Apenas o responsável da área (ou admin) pode retomar esta solicitação.' });
    }

    const statusRestaurado = atual.sobrestada_status_anterior || 'pendente';
    const update = {
      status: statusRestaurado,
      // Zera o sobrestamento (o histórico fica na timeline/audit).
      sobrestada_status_anterior: null,
      sobrestada_em: null,
      sobrestada_por: null,
      sobrestada_motivo: null,
      sobrestada_revisao: null,
      sla_pausado_em: null,
    };
    // Retoma o SLA · empurra os prazos pelo tempo pausado (mesma régua do reenviar).
    if (atual.sla_pausado_em) {
      const pausaMs = Date.now() - new Date(atual.sla_pausado_em).getTime();
      if (pausaMs > 0) {
        if (atual.sla_resposta_deadline) update.sla_resposta_deadline = new Date(new Date(atual.sla_resposta_deadline).getTime() + pausaMs).toISOString();
        if (atual.sla_resolucao_deadline) update.sla_resolucao_deadline = new Date(new Date(atual.sla_resolucao_deadline).getTime() + pausaMs).toISOString();
      }
    }

    const { data, error } = await supabase
      .from('solicitacoes')
      .update(update)
      .eq('id', req.params.id)
      .select('*')
      .single();
    if (error) throw error;

    await registrarEvento(data.id, {
      statusAnterior: 'sobrestada',
      statusNovo: data.status,
      atorId: userId,
      observacao: `Retomada do sobrestamento por ${userName || 'responsável'} · SLA retomado`,
    });

    const modulo = CATEGORIA_MODULO[data.categoria] || 'administrativo';
    notificar({
      modulo,
      tipo: 'solicitacao_status',
      titulo: `Retomada: ${data.titulo}`,
      mensagem: `${userName || 'A área'} retomou sua solicitação (estava em espera) · voltou para "${String(data.status).replace(/_/g, ' ')}" e o SLA foi retomado.`,
      link: '/solicitacoes',
      severidade: 'info',
      chaveDedup: `solicitacao_retomada_${data.id}_${Date.now()}`,
      targetIds: [data.solicitante_id].filter(Boolean),
    }).catch(err => console.error('[SOLICITACOES] notify retomar:', err.message));

    notificarPedidoWhatsapp(data.id, 'retomada', null);
    res.json(data);
  } catch (e) {
    console.error('[SOLICITACOES] retomar:', e.message);
    res.status(500).json({ error: e.message || 'Erro ao retomar a solicitação' });
  }
});

// ── UPDATE (status, responsável, observações) ───────────────
router.patch('/:id', async (req, res) => {
  try {
    const userId = req.user.userId;
    const userName = req.user.name;

    const { status, responsavel_id, observacoes,
            // Fase A · novos campos editaveis
            proposta_orcamento, proposta_cronograma,
            nps_nota, nps_comentario } = req.body;
    // SEGURANCA: `aprovado_financeiro_em`/`aprovado_financeiro_por` NUNCA sao
    // aceitos aqui. O portao de gasto so e liberado pelo endpoint dedicado
    // POST /:id/aprovar-financeiro (gated por podeAprovarFinanceiro). Antes, este
    // PATCH (sem authz) aceitava o campo do body → qualquer autenticado liberava
    // pagamento de qualquer solicitacao.

    // Portões do fluxo BPMN · status fora da whitelist só muda pelo endpoint
    // próprio (aprovar-origem/mérito/sobrestar/retomar/relatar-problema).
    if (status && !STATUS_PATCH_PERMITIDOS.includes(status)) {
      return res.status(400).json({ error: `Status "${status}" não pode ser definido por aqui · use o endpoint próprio do fluxo (aprovação, mérito ou sobrestamento).` });
    }

    // ── Autorizacao · carrega a solicitacao e decide quem pode editar ──
    const { data: sol } = await supabase
      .from('solicitacoes')
      .select('id, solicitante_id, responsavel_id, area_responsavel, status')
      .eq('id', req.params.id)
      .maybeSingle();
    if (!sol) return res.status(404).json({ error: 'Solicitação não encontrada' });

    // Solicitação parada num portão não sai dele por PATCH · só pelo endpoint
    // específico. Inclui cotação e aprovação financeira para ninguém pular o
    // encaminhamento Amaury → financeiro alterando o status manualmente.
    if (status && status !== sol.status
        && ['aguardando_aprovacao_origem', 'aguardando_merito', 'sobrestada', 'em_cotacao', 'aguardando_aprovacao_financeira'].includes(sol.status)) {
      return res.status(400).json({ error: 'Esta solicitação está num portão do fluxo (aprovação, cotação, mérito, financeiro ou sobrestamento) · use o endpoint próprio para movê-la.' });
    }

    const isAdmin = ['admin', 'diretor'].includes(req.user.role);
    const isResponsavel = sol.responsavel_id === userId;
    const isSolicitante = sol.solicitante_id === userId;
    let isAreaResp = false;
    if (!isAdmin && !isResponsavel && sol.area_responsavel) {
      const { data: respRow } = await supabase
        .from('area_solicitacoes_responsaveis')
        .select('profile_id')
        .eq('area', sol.area_responsavel)
        .eq('profile_id', userId)
        .maybeSingle();
      isAreaResp = !!respRow;
    }
    const podeGerir = isAdmin || isResponsavel || isAreaResp;
    if (!podeGerir && !isSolicitante) {
      return res.status(403).json({ error: 'Sem permissão para alterar esta solicitação' });
    }

    const update = {};
    // Gestao (status/responsavel/observacoes/propostas) · so quem administra a fila.
    if (podeGerir) {
      if (status) update.status = status;
      if (responsavel_id !== undefined) update.responsavel_id = responsavel_id;
      if (observacoes !== undefined) update.observacoes = observacoes;
      if (proposta_orcamento !== undefined) update.proposta_orcamento = proposta_orcamento;
      if (proposta_cronograma !== undefined) update.proposta_cronograma = proposta_cronograma;
    }
    // Avaliacao NPS · o solicitante (dono) tambem pode registrar a propria nota.
    if (nps_nota !== undefined) update.nps_nota = nps_nota;
    if (nps_comentario !== undefined) update.nps_comentario = nps_comentario;

    if (!Object.keys(update).length) return res.status(400).json({ error: 'Nada para atualizar' });

    const { data, error } = await supabase
      .from('solicitacoes')
      .update(update)
      .eq('id', req.params.id)
      .select('*')
      .single();
    if (error) throw error;

    // Notify solicitante + área managers about status change
    if (status && data) {
      const modulo = CATEGORIA_MODULO[data.categoria] || 'administrativo';
      const statusLabel = status.replace('_', ' ');
      const obsNote = observacoes ? ` — "${observacoes}"` : '';

      // Conclusão · pede avaliação NPS pro solicitante (alimenta KPIs ADM-*-Q)
      const ehConclusao = status === 'concluido';
      const tituloSolicitante = ehConclusao
        ? `Avalie: ${data.titulo}`
        : `Solicitação atualizada: ${data.titulo}`;
      const mensagemSolicitante = ehConclusao
        ? `Sua solicitação foi concluída${obsNote}. Avalie o atendimento em 30 segundos · ajuda muito a melhorar.`
        : `Status alterado para "${statusLabel}"${obsNote}`;

      // 1. Notify the requester
      notificar({
        modulo,
        tipo: ehConclusao ? 'solicitacao_avaliar' : 'solicitacao_status',
        titulo: tituloSolicitante,
        mensagem: mensagemSolicitante,
        link: '/solicitacoes',
        severidade: status === 'rejeitado' ? 'alta' : 'info',
        chaveDedup: `solicitacao_status_${data.id}_${status}`,
        targetIds: [data.solicitante_id],
      }).catch(err => console.error('[SOLICITACOES] notify solicitante error:', err.message));

      // 1b. WhatsApp pro solicitante (template pedido_atualizado).
      notificarPedidoWhatsapp(data.id, statusLabel, observacoes);

      // 2. Notify área managers (excluding the requester to avoid duplicate)
      resolverDestinatarios(modulo).then(managers => {
        const filtered = managers.filter(id => id !== data.solicitante_id);
        if (filtered.length) {
          notificar({
            modulo,
            tipo: 'solicitacao_status',
            titulo: `Solicitação atualizada: ${data.titulo}`,
            mensagem: `Status alterado para "${statusLabel}" por ${userName || 'usuário'}${obsNote}`,
            link: '/solicitacoes',
            severidade: 'info',
            chaveDedup: `solicitacao_status_mgr_${data.id}_${status}`,
            targetIds: filtered,
          }).catch(err => console.error('[SOLICITACOES] notify managers error:', err.message));
        }
      }).catch(err => console.error('[SOLICITACOES] resolve managers error:', err.message));
    }

    res.json(data);
  } catch (e) {
    console.error('[SOLICITACOES] update error:', e.message);
    res.status(500).json({ error: 'Erro ao atualizar solicitação' });
  }
});

// ══════════════════════════════════════════════════════════════════════════
// FASE 1 · Linha do tempo + "Relatar Problema" (alteração/devolução) + reenvio
// ══════════════════════════════════════════════════════════════════════════

// GET /:id/timeline · fases (solicitacoes_eventos) + ajustes (solicitacao_ajustes)
// mesclados em ordem · visível pro solicitante E pro responsável.
router.get('/:id/timeline', async (req, res) => {
  try {
    const [{ data: eventos }, { data: ajustes }] = await Promise.all([
      supabase.from('solicitacoes_eventos').select('*').eq('solicitacao_id', req.params.id).order('created_at', { ascending: true }),
      supabase.from('solicitacao_ajustes').select('*').eq('solicitacao_id', req.params.id).order('created_at', { ascending: true }),
    ]);
    const ids = [...new Set([
      ...(eventos || []).map(e => e.ator_id),
      ...(ajustes || []).map(a => a.autor_id),
    ].filter(Boolean))];
    let nomes = {};
    if (ids.length) {
      const { data: profs } = await supabase.from('profiles').select('id, name').in('id', ids);
      nomes = Object.fromEntries((profs || []).map(p => [p.id, p.name]));
    }
    const linha = [
      ...(eventos || []).map(e => ({ tipo: 'evento', em: e.created_at, status_anterior: e.status_anterior, status_novo: e.status_novo, ator: nomes[e.ator_id] || null, observacao: e.observacao })),
      ...(ajustes || []).map(a => ({ tipo: 'ajuste', em: a.created_at, lado: a.lado, motivo: a.motivo, comentario: a.comentario, ator: nomes[a.autor_id] || null })),
    ].sort((x, y) => new Date(x.em).getTime() - new Date(y.em).getTime());
    res.json(linha);
  } catch (e) {
    console.error('[SOLICITACOES] timeline:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// POST /:id/relatar-problema · body { motivo, comentario }
// motivo ∈ descricao|escopo|data → 'aguardando_ajuste' (volta editável pro
// solicitante · pausa o SLA · vezes_refeita++). motivo='cancelamento' → 'cancelado'.
// O `lado` (solicitante/responsável) sai de quem aciona (KPI diagnóstico).
router.post('/:id/relatar-problema', async (req, res) => {
  try {
    const userId = req.user.userId;
    const userName = req.user.name;
    const { motivo, comentario } = req.body || {};
    if (!['descricao', 'escopo', 'data', 'cancelamento'].includes(motivo)) {
      return res.status(400).json({ error: 'Motivo inválido.' });
    }
    // Comentário é OBRIGATÓRIO ao relatar problema (descrever o que precisa ajustar).
    // Cancelamento (encerra a solicitação) segue com comentário opcional.
    if (motivo !== 'cancelamento' && (!comentario || comentario.trim().length < 3)) {
      return res.status(400).json({ error: 'Descreva o problema (mínimo 3 caracteres).' });
    }

    const { data: sol } = await supabase
      .from('solicitacoes')
      .select('id, solicitante_id, responsavel_id, area_responsavel, categoria, titulo, status, vezes_refeita, aprovacao_origem_status')
      .eq('id', req.params.id).is('deleted_at', null).maybeSingle();
    if (!sol) return res.status(404).json({ error: 'Solicitação não encontrada.' });

    const isAdmin = ['admin', 'diretor'].includes(req.user.role);
    const isSolic = sol.solicitante_id === userId;
    const isResp = sol.responsavel_id === userId;
    let isAreaResp = false;
    if (!isAdmin && !isResp && sol.area_responsavel) {
      const { data: rr } = await supabase.from('area_solicitacoes_responsaveis')
        .select('profile_id').eq('area', sol.area_responsavel).eq('profile_id', userId).maybeSingle();
      isAreaResp = !!rr;
    }
    const podeGerir = isAdmin || isResp || isAreaResp;
    if (!isSolic && !podeGerir) return res.status(403).json({ error: 'Sem permissão.' });
    if (['concluido', 'cancelado', 'rejeitado', 'avaliado'].includes(sol.status)) {
      return res.status(400).json({ error: 'Solicitação já encerrada · não é possível relatar problema.' });
    }
    // Portões do fluxo BPMN · sobrestada precisa ser RETOMADA antes; mérito é
    // decisão do Pastor Presidente (mesma lógica do bloqueio de origem abaixo).
    if (sol.status === 'sobrestada') {
      return res.status(400).json({ error: 'Esta solicitação está sobrestada (em espera) · retome-a antes de relatar problema.' });
    }
    if (sol.status === 'aguardando_merito') {
      return res.status(400).json({ error: 'Esta solicitação aguarda o julgamento de mérito · o ajuste/devolução só vale depois da decisão.' });
    }
    // Ainda no portão de origem (o diretor não aprovou) · o ciclo de ajuste/devolução
    // só vale DEPOIS da aprovação de origem. Sem isso, devolver aqui geraria estado
    // duplo: a aba "Aprovar" do diretor filtra por aprovacao_origem_status, então a
    // solicitação ficaria na fila do solicitante (aguardando_ajuste) E na do diretor.
    if (sol.status === 'aguardando_aprovacao_origem' || ['pendente', 'triagem'].includes(sol.aprovacao_origem_status)) {
      return res.status(400).json({ error: 'Esta solicitação ainda aguarda a aprovação do diretor de origem · o ajuste/devolução só vale depois que ela for aprovada.' });
    }
    // Já em ajuste: não re-pausa (preservaria status_antes_ajuste/sla_pausado_em
    // originais) · o solicitante deve editar e reenviar. Cancelar ainda é possível.
    if (sol.status === 'aguardando_ajuste' && motivo !== 'cancelamento') {
      return res.status(400).json({ error: 'Já está aguardando ajuste · edite e reenvie (ou cancele).' });
    }

    const lado = isSolic ? 'solicitante' : 'responsavel';
    await supabase.from('solicitacao_ajustes').insert({
      solicitacao_id: sol.id, autor_id: userId, lado, motivo, comentario: comentario || null,
    });

    const modulo = CATEGORIA_MODULO[sol.categoria] || 'administrativo';

    if (motivo === 'cancelamento') {
      const { data, error } = await supabase.from('solicitacoes')
        .update({ status: 'cancelado' }).eq('id', sol.id).select('*').single();
      if (error) throw error;
      notificar({
        modulo, tipo: 'solicitacao_status',
        titulo: `Cancelada: ${sol.titulo}`,
        mensagem: `${userName || 'Usuário'} cancelou a solicitação${comentario ? ` · ${comentario}` : ''}.`,
        link: '/solicitacoes', severidade: 'info',
        chaveDedup: `solicitacao_cancelada_${sol.id}`,
        ...(lado === 'responsavel' ? { targetIds: [sol.solicitante_id].filter(Boolean) } : {}),
      }).catch(err => console.error('[SOLICITACOES] notify cancelar:', err.message));
      return res.json(data);
    }

    const update = {
      status: 'aguardando_ajuste',
      status_antes_ajuste: sol.status,
      sla_pausado_em: new Date().toISOString(),
      vezes_refeita: (sol.vezes_refeita || 0) + 1,
    };
    const { data, error } = await supabase.from('solicitacoes')
      .update(update).eq('id', sol.id).select('*').single();
    if (error) throw error;

    const MOTIVO_LABEL = { descricao: 'descrição', escopo: 'escopo', data: 'data' };
    if (lado === 'responsavel') {
      notificar({
        modulo, tipo: 'solicitacao_status',
        titulo: `Sua solicitação voltou para ajuste: ${sol.titulo}`,
        mensagem: `${userName || 'A área'} pediu ajuste em ${MOTIVO_LABEL[motivo]}${comentario ? `: ${comentario}` : ''}. Edite e reenvie.`,
        link: '/solicitacoes', severidade: 'alta',
        chaveDedup: `solicitacao_devolvida_${sol.id}_${new Date(update.sla_pausado_em).getTime()}`,
        targetIds: [sol.solicitante_id].filter(Boolean),
      }).catch(err => console.error('[SOLICITACOES] notify devolucao:', err.message));
    } else {
      notificar({
        modulo, tipo: 'solicitacao_status',
        titulo: `Solicitante vai ajustar: ${sol.titulo}`,
        mensagem: `${userName || 'O solicitante'} sinalizou ajuste em ${MOTIVO_LABEL[motivo]}${comentario ? `: ${comentario}` : ''}. O SLA fica pausado até o reenvio.`,
        link: '/solicitacoes', severidade: 'info',
        chaveDedup: `solicitacao_ajuste_solic_${sol.id}_${new Date(update.sla_pausado_em).getTime()}`,
      }).catch(err => console.error('[SOLICITACOES] notify ajuste:', err.message));
    }
    res.json(data);
  } catch (e) {
    console.error('[SOLICITACOES] relatar-problema:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// POST /:id/reenviar · solicitante edita (opcional) e reenvia uma solicitação
// que estava em aguardando_ajuste. Restaura o status anterior e RETOMA o SLA
// (empurra os deadlines pelo tempo parado · a área não é penalizada).
router.post('/:id/reenviar', async (req, res) => {
  try {
    const userId = req.user.userId;
    const userName = req.user.name;
    const { titulo, descricao, justificativa, data_necessaria, resposta, itens_lista, valor_estimado } = req.body || {};
    const { data: sol } = await supabase
      .from('solicitacoes')
      .select('id, solicitante_id, status, status_antes_ajuste, sla_pausado_em, sla_resposta_deadline, sla_resolucao_deadline, categoria, titulo, area_responsavel')
      .eq('id', req.params.id).is('deleted_at', null).maybeSingle();
    if (!sol) return res.status(404).json({ error: 'Solicitação não encontrada.' });
    const isAdmin = ['admin', 'diretor'].includes(req.user.role);
    if (sol.solicitante_id !== userId && !isAdmin) {
      return res.status(403).json({ error: 'Só o solicitante pode reenviar.' });
    }
    if (sol.status !== 'aguardando_ajuste') {
      return res.status(400).json({ error: 'Solicitação não está aguardando ajuste.' });
    }
    // A tréplica (resposta ao ajuste pedido) é OBRIGATÓRIA · fica na linha do tempo.
    if (!resposta || resposta.trim().length < 3) {
      return res.status(400).json({ error: 'Descreva sua resposta ao ajuste (mínimo 3 caracteres).' });
    }

    const update = {
      status: sol.status_antes_ajuste || 'pendente',
      status_antes_ajuste: null,
      sla_pausado_em: null,
    };
    if (titulo !== undefined) update.titulo = titulo;
    if (descricao !== undefined) update.descricao = descricao;
    if (justificativa !== undefined) update.justificativa = justificativa;
    if (data_necessaria !== undefined) update.data_necessaria = data_necessaria || null;

    // Itens do pedido (compras/serviço) · o solicitante pode ajustar a lista na
    // devolução. Mesma normalização do POST: 'unitario' vira TOTAL DA LINHA; a
    // soma vira o valor_estimado; itens[] (texto) fica em backward-compat.
    const editaItens = Array.isArray(itens_lista)
      && ['compras', 'servico'].includes(sol.categoria);
    let itensNorm = [];
    if (editaItens) {
      itensNorm = itens_lista
        .filter(it => it && String(it.descricao || '').trim())
        .map((it, i) => {
          const qNum = Number(it.quantidade);
          const quantidade = isFinite(qNum) && qNum > 0 ? qNum : 1;
          const vNum = Number(it.valor_estimado);
          const temValor = it.valor_estimado != null && it.valor_estimado !== '' && isFinite(vNum);
          const valorLinha = temValor
            ? (it.valor_tipo === 'unitario' ? vNum * quantidade : vNum)
            : null;
          return {
            descricao: String(it.descricao).trim().slice(0, 500),
            quantidade,
            unidade: it.unidade ? String(it.unidade).trim().slice(0, 20) : 'un',
            link_referencia: it.link_referencia ? String(it.link_referencia).trim().slice(0, 1000) : null,
            valor_estimado: valorLinha,
            imagem_url: it.imagem_url ? String(it.imagem_url).slice(0, 2000) : null,
            ordem: i,
          };
        });
      update.itens = itensNorm.length
        ? itensNorm.map(it => `${it.quantidade}x ${it.descricao}`).join('\n')
        : null;
      const soma = itensNorm.reduce((acc, it) => acc + (it.valor_estimado != null ? it.valor_estimado : 0), 0);
      if (soma > 0) update.valor_estimado = soma;
      else if (valor_estimado != null && valor_estimado !== '') update.valor_estimado = Number(valor_estimado) || null;
    }

    // Retoma o SLA · empurra os prazos pelo tempo pausado
    if (sol.sla_pausado_em) {
      const pausaMs = Date.now() - new Date(sol.sla_pausado_em).getTime();
      if (pausaMs > 0) {
        if (sol.sla_resposta_deadline) update.sla_resposta_deadline = new Date(new Date(sol.sla_resposta_deadline).getTime() + pausaMs).toISOString();
        if (sol.sla_resolucao_deadline) update.sla_resolucao_deadline = new Date(new Date(sol.sla_resolucao_deadline).getTime() + pausaMs).toISOString();
      }
    }

    const { data, error } = await supabase.from('solicitacoes')
      .update(update).eq('id', sol.id).select('*').single();
    if (error) throw error;

    // Substitui os itens estruturados quando a lista foi enviada (compras/serviço).
    // Best-effort: o pedido já foi salvo; falha aqui só loga.
    if (editaItens) {
      const { error: delErr } = await supabase.from('solicitacao_itens').delete().eq('solicitacao_id', sol.id);
      if (delErr) console.error('[SOLICITACOES] reenviar · limpar itens:', delErr.message);
      if (itensNorm.length) {
        const rows = itensNorm.map(it => ({ ...it, solicitacao_id: sol.id }));
        const { error: insErr } = await supabase.from('solicitacao_itens').insert(rows);
        if (insErr) console.error('[SOLICITACOES] reenviar · gravar itens:', insErr.message);
      }
    }

    // Registra a tréplica do solicitante na linha do tempo (resposta ao ajuste pedido).
    const respostaTxt = resposta.trim();
    await supabase.from('solicitacao_ajustes').insert({
      solicitacao_id: sol.id, autor_id: userId, lado: 'solicitante', motivo: 'resposta', comentario: respostaTxt,
    });

    const modulo = CATEGORIA_MODULO[sol.categoria] || 'administrativo';
    resolverDestinatarios(modulo).then(managers => {
      if (managers.length) {
        notificar({
          modulo, tipo: 'solicitacao_status',
          titulo: `Reenviada: ${data.titulo}`,
          mensagem: `${userName || 'O solicitante'} ajustou e respondeu: "${respostaTxt}" · voltou pra fila ${data.area_responsavel || ''}.`,
          link: '/solicitacoes', severidade: 'info',
          chaveDedup: `solicitacao_reenviada_${sol.id}_${Date.now()}`,
          targetIds: managers,
        }).catch(err => console.error('[SOLICITACOES] notify reenviar:', err.message));
      }
    }).catch(err => console.error('[SOLICITACOES] resolve managers reenviar:', err.message));

    res.json(data);
  } catch (e) {
    console.error('[SOLICITACOES] reenviar:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// PATCH /:id/editar · o SOLICITANTE corrige a própria solicitação enquanto ela
// ainda está no portão de aprovação de origem (ninguém aprovou nada) — caso
// clássico: enviou e esqueceu o anexo (2026-07-14 · pedido do Pedro Paiva).
// Depois que o diretor aprova, vale o ciclo relatar-problema → aguardando_ajuste
// → reenviar (este endpoint recusa). A edição fica na linha do tempo e o diretor
// pendente é avisado de que o pedido mudou.
router.patch('/:id/editar', async (req, res) => {
  try {
    const userId = req.user.userId;
    const userName = req.user.name;
    const { data: sol } = await supabase
      .from('solicitacoes')
      .select('id, solicitante_id, status, categoria, titulo, aprovacao_origem_status, aprovacao_origem_diretor_id')
      .eq('id', req.params.id).is('deleted_at', null).maybeSingle();
    if (!sol) return res.status(404).json({ error: 'Solicitação não encontrada.' });

    const isAdmin = ['admin', 'diretor'].includes(req.user.role);
    if (sol.solicitante_id !== userId && !isAdmin) {
      return res.status(403).json({ error: 'Só o solicitante pode editar a própria solicitação.' });
    }
    if (sol.status !== 'aguardando_aprovacao_origem') {
      return res.status(400).json({ error: 'A edição direta só vale enquanto a solicitação aguarda a aprovação do diretor. Depois da aprovação, use "Relatar problema" para pedir ajuste.' });
    }

    const b = req.body || {};
    const update = {};
    if (b.titulo !== undefined) {
      const t = String(b.titulo).trim();
      if (!t) return res.status(400).json({ error: 'O título não pode ficar vazio.' });
      update.titulo = t.slice(0, 300);
    }
    if (b.descricao !== undefined) update.descricao = b.descricao || null;
    if (b.justificativa !== undefined) update.justificativa = b.justificativa || null;
    if (b.data_necessaria !== undefined) update.data_necessaria = b.data_necessaria || null;
    if (b.valor_estimado !== undefined) {
      const v = Number(b.valor_estimado);
      update.valor_estimado = (b.valor_estimado === '' || b.valor_estimado == null || !isFinite(v)) ? null : v;
    }
    // Anexo (o motivo nº 1 desta edição) · URL do bucket 'solicitacoes'
    if (b.documento_url !== undefined) {
      update.documento_url = b.documento_url ? String(b.documento_url).slice(0, 2000) : null;
    }
    if (b.link_referencia !== undefined) {
      update.link_referencia = b.link_referencia ? String(b.link_referencia).trim().slice(0, 1000) : null;
    }
    // Campos por fluxo (pagamento/reembolso/reserva) · whitelist textual
    for (const campo of ['favorecido_nome', 'favorecido_documento', 'forma_pagamento', 'chave_pix',
                         'banco', 'agencia', 'conta', 'motivo_reembolso', 'espaco_solicitado',
                         'horario_inicio', 'horario_fim']) {
      if (b[campo] !== undefined) update[campo] = b[campo] ? String(b[campo]).slice(0, 500) : null;
    }
    if (b.data_compra !== undefined) update.data_compra = b.data_compra || null;
    if (b.data_uso !== undefined) update.data_uso = b.data_uso || null;
    if (b.qtde_pessoas !== undefined) {
      const q = parseInt(b.qtde_pessoas, 10);
      update.qtde_pessoas = isFinite(q) && q > 0 ? q : null;
    }

    // Itens do pedido (compras/serviço) · mesma normalização do POST/reenviar:
    // 'unitario' vira TOTAL DA LINHA; a soma vira o valor_estimado.
    const editaItens = Array.isArray(b.itens_lista) && ['compras', 'servico'].includes(sol.categoria);
    let itensNorm = [];
    if (editaItens) {
      itensNorm = b.itens_lista
        .filter(it => it && String(it.descricao || '').trim())
        .map((it, i) => {
          const qNum = Number(it.quantidade);
          const quantidade = isFinite(qNum) && qNum > 0 ? qNum : 1;
          const vNum = Number(it.valor_estimado);
          const temValor = it.valor_estimado != null && it.valor_estimado !== '' && isFinite(vNum);
          const valorLinha = temValor
            ? (it.valor_tipo === 'unitario' ? vNum * quantidade : vNum)
            : null;
          return {
            descricao: String(it.descricao).trim().slice(0, 500),
            quantidade,
            unidade: it.unidade ? String(it.unidade).trim().slice(0, 20) : 'un',
            link_referencia: it.link_referencia ? String(it.link_referencia).trim().slice(0, 1000) : null,
            valor_estimado: valorLinha,
            imagem_url: it.imagem_url ? String(it.imagem_url).slice(0, 2000) : null,
            ordem: i,
          };
        });
      update.itens = itensNorm.length
        ? itensNorm.map(it => `${it.quantidade}x ${it.descricao}`).join('\n')
        : null;
      const soma = itensNorm.reduce((acc, it) => acc + (it.valor_estimado != null ? it.valor_estimado : 0), 0);
      if (soma > 0) update.valor_estimado = soma;
    }

    if (!Object.keys(update).length) return res.status(400).json({ error: 'Nada para atualizar.' });

    const { data, error } = await supabase
      .from('solicitacoes')
      .update(update)
      .eq('id', sol.id)
      .select('*')
      .single();
    if (error) throw error;

    // Substitui os itens estruturados quando a lista foi enviada. Best-effort:
    // o pedido já foi salvo; falha aqui só loga (mesmo padrão do reenviar).
    if (editaItens) {
      const { error: delErr } = await supabase.from('solicitacao_itens').delete().eq('solicitacao_id', sol.id);
      if (delErr) console.error('[SOLICITACOES] editar · limpar itens:', delErr.message);
      if (itensNorm.length) {
        const rows = itensNorm.map(it => ({ ...it, solicitacao_id: sol.id }));
        const { error: insErr } = await supabase.from('solicitacao_itens').insert(rows);
        if (insErr) console.error('[SOLICITACOES] editar · gravar itens:', insErr.message);
      }
    }

    // Linha do tempo · registra a edição. Motivo 'edicao' (migration
    // 20260714150000); enquanto o CHECK antigo estiver em prod, cai no
    // fallback 'descricao' pra não perder o rastro.
    const camposEditados = Object.keys(update).join(', ');
    const ajusteBase = {
      solicitacao_id: sol.id, autor_id: userId, lado: 'solicitante',
      comentario: `Editou a solicitação antes da aprovação (${camposEditados}).`,
    };
    const { error: ajErr } = await supabase.from('solicitacao_ajustes')
      .insert({ ...ajusteBase, motivo: 'edicao' });
    if (ajErr) {
      const { error: fbErr } = await supabase.from('solicitacao_ajustes')
        .insert({ ...ajusteBase, motivo: 'descricao' });
      if (fbErr) console.error('[SOLICITACOES] editar · log ajuste:', fbErr.message);
    }

    // Avisa o diretor que vai aprovar · o pedido mudou embaixo dele
    if (sol.aprovacao_origem_diretor_id && sol.aprovacao_origem_diretor_id !== userId) {
      const modulo = CATEGORIA_MODULO[sol.categoria] || 'administrativo';
      notificar({
        modulo, tipo: 'solicitacao_status',
        titulo: `Solicitação editada antes da aprovação: ${data.titulo}`,
        mensagem: `${userName || 'O solicitante'} atualizou o pedido que aguarda sua aprovação (${camposEditados}).`,
        link: '/solicitacoes', severidade: 'info',
        chaveDedup: `solicitacao_editada_${sol.id}_${Date.now()}`,
        targetIds: [sol.aprovacao_origem_diretor_id],
      }).catch(err => console.error('[SOLICITACOES] notify editar:', err.message));
    }

    res.json(data);
  } catch (e) {
    console.error('[SOLICITACOES] editar:', e.message);
    res.status(500).json({ error: 'Erro ao editar solicitação' });
  }
});

// ── SLA definitions (catalogo de prazos) ───────────────────────
router.get('/sla-defs', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('sla_definicoes')
      .select('*')
      .eq('ativo', true)
      .order('area_responsavel')
      .order('subcategoria')
      .order('eh_urgente');
    if (error) throw error;
    res.json(data || []);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Reserva de espacos · calendário ────────────────────────────
router.get('/reservas-espaco', async (req, res) => {
  try {
    const { desde, ate } = req.query;
    let q = supabase.from('vw_reserva_espacos').select('*');
    if (desde) q = q.gte('data_uso', desde);
    if (ate) q = q.lte('data_uso', ate);
    const { data, error } = await q;
    if (error) throw error;
    res.json(data || []);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Área alcadas (limites de aprovação financeira) ─────────────
router.get('/alcadas', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('area_alcadas')
      .select('*')
      .order('area_cliente');
    if (error) throw error;
    res.json(data || []);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Responsáveis por área de solicitação (admin/diretor) ────────────────────
// GET lista todos · agrupa por área com nomes dos responsáveis
router.get('/area-responsaveis', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('area_solicitacoes_responsaveis')
      .select('id, area, profile_id, criado_em')
      .order('area');
    if (error) throw error;

    const profileIds = [...new Set((data || []).map(r => r.profile_id))];
    let profileMap = {};
    if (profileIds.length) {
      const { data: profs } = await supabase
        .from('profiles')
        .select('id, nome_completo, email')
        .in('id', profileIds);
      profileMap = Object.fromEntries((profs || []).map(p => [p.id, p]));
    }

    const enriched = (data || []).map(r => ({
      ...r,
      profile: profileMap[r.profile_id] || null,
    }));
    res.json(enriched);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PUT substitui responsáveis de uma área · body: { área, profile_ids: [] }
// Apaga vinculos atuais da área e insere os novos
router.put('/area-responsaveis', async (req, res) => {
  if (!['admin', 'diretor'].includes(req.user.role)) {
    return res.status(403).json({ error: 'Apenas admin/diretor podem configurar responsaveis' });
  }
  try {
    const { area, profile_ids } = req.body || {};
    if (!area) return res.status(400).json({ error: 'area obrigatoria' });
    if (!Array.isArray(profile_ids)) return res.status(400).json({ error: 'profile_ids deve ser array' });

    // VALIDA os profile_ids ANTES de apagar — id que não existe em `profiles`
    // (ex.: colaborador de RH que ainda não fez o 1º login) viola a FK e, no
    // fluxo antigo, o delete já tinha rodado → a área ficava SEM responsável.
    // Agora: se algum id for inválido, aborta sem tocar nos vínculos atuais.
    const idsUnicos = [...new Set((profile_ids || []).filter(Boolean))];
    if (idsUnicos.length > 0) {
      const { data: existentes, error: chkErr } = await supabase
        .from('profiles').select('id').in('id', idsUnicos);
      if (chkErr) throw chkErr;
      const validos = new Set((existentes || []).map(p => p.id));
      const invalidos = idsUnicos.filter(id => !validos.has(id));
      if (invalidos.length) {
        return res.status(400).json({
          error: 'Uma das pessoas selecionadas ainda não tem conta no sistema (precisa fazer o primeiro login). Nenhuma alteração foi feita.',
          invalidos,
        });
      }
    }

    // Só depois de validar: substitui os vínculos da área.
    const { error: delError } = await supabase
      .from('area_solicitacoes_responsaveis')
      .delete()
      .eq('area', area);
    if (delError) throw delError;

    if (idsUnicos.length > 0) {
      const rows = idsUnicos.map(pid => ({ area, profile_id: pid, criado_por: req.user.userId }));
      const { error: insError } = await supabase
        .from('area_solicitacoes_responsaveis')
        .insert(rows);
      if (insError) throw insError;
    }

    res.json({ ok: true, area, count: idsUnicos.length });
  } catch (e) {
    console.error('[SOLICITACOES] area-responsaveis PUT:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────
// VINCULO COM PEDIDO DO MERCADO LIVRE
// ─────────────────────────────────────────────────────────────────────────

// POST /api/solicitacoes/:id/vincular-ml
// Body: { ml_input } · URL ou ID do pedido do Mercado Livre
// Apenas o solicitante, responsável ou admin/diretor podem vincular.
router.post('/:id/vincular-ml', async (req, res) => {
  try {
    const userId = req.user.userId;
    const role = req.user.role;
    const { ml_input } = req.body || {};
    if (!ml_input) {
      return res.status(400).json({ error: 'Cole a URL ou o número do pedido do Mercado Livre.' });
    }

    // Permissão: solicitante, responsável, admin/diretor, ou responsável da area_responsavel
    const { data: sol } = await supabase
      .from('solicitacoes')
      .select('id, solicitante_id, responsavel_id, area_responsavel, categoria')
      .eq('id', req.params.id)
      .maybeSingle();
    if (!sol) return res.status(404).json({ error: 'Solicitação não encontrada' });

    const isAdmin = ['admin', 'diretor'].includes(role);
    const isMine = sol.solicitante_id === userId || sol.responsavel_id === userId;
    let isAreaResp = false;
    if (!isAdmin && !isMine && sol.area_responsavel) {
      const { data: respRow } = await supabase
        .from('area_solicitacoes_responsaveis')
        .select('profile_id')
        .eq('area', sol.area_responsavel)
        .eq('profile_id', userId)
        .maybeSingle();
      isAreaResp = !!respRow;
    }
    if (!isAdmin && !isMine && !isAreaResp) {
      return res.status(403).json({ error: 'Sem permissão para vincular o pedido.' });
    }

    const result = await mlTracker.linkOrder({
      solicitacaoId: req.params.id,
      mlOrderInput: ml_input,
      profileId: userId,
    });
    if (!result.ok) return res.status(400).json({ error: result.error });
    res.json(result);
  } catch (e) {
    console.error('[SOLICITACOES] vincular-ml error:', e.message);
    res.status(500).json({ error: e.message || 'Erro ao vincular pedido.' });
  }
});

// DELETE /api/solicitacoes/:id/vincular-ml · remove o vinculo (so admin/responsavel)
router.delete('/:id/vincular-ml', async (req, res) => {
  try {
    const userId = req.user.userId;
    const role = req.user.role;
    const { data: sol } = await supabase
      .from('solicitacoes')
      .select('id, solicitante_id, responsavel_id, ml_linked_by')
      .eq('id', req.params.id)
      .maybeSingle();
    if (!sol) return res.status(404).json({ error: 'Solicitação não encontrada' });

    const isAdmin = ['admin', 'diretor'].includes(role);
    const podeRemover = isAdmin
      || sol.ml_linked_by === userId
      || sol.responsavel_id === userId;
    if (!podeRemover) {
      return res.status(403).json({ error: 'Sem permissão para desvincular.' });
    }

    await supabase
      .from('solicitacoes')
      .update({
        ml_order_id: null,
        ml_shipment_id: null,
        ml_tracking_number: null,
        ml_tracking_url: null,
        ml_item_title: null,
        ml_total_amount: null,
        ml_last_status: null,
        ml_last_status_changed_at: null,
        ml_last_checked_at: null,
        ml_linked_at: null,
        ml_linked_by: null,
        ml_estimated_delivery: null,
      })
      .eq('id', req.params.id);

    res.json({ ok: true });
  } catch (e) {
    console.error('[SOLICITACOES] unvincular-ml error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// GET /api/solicitacoes/:id/ml-timeline · histórico de eventos do tracking
router.get('/:id/ml-timeline', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('solicitacao_ml_eventos')
      .select('*')
      .eq('solicitacao_id', req.params.id)
      .order('ocorrido_em', { ascending: true });
    if (error) throw error;
    res.json({
      eventos: data || [],
      statusLabels: mlTracker.STATUS_LABELS,
    });
  } catch (e) {
    console.error('[SOLICITACOES] ml-timeline error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// POST /api/solicitacoes/:id/atualizar-ml · forca refresh manual (admin/diretor)
router.post('/:id/atualizar-ml', async (req, res) => {
  try {
    const role = req.user.role;
    const userId = req.user.userId;
    const { data: sol } = await supabase
      .from('solicitacoes')
      .select('id, solicitante_id, responsavel_id, ml_shipment_id')
      .eq('id', req.params.id)
      .maybeSingle();
    if (!sol) return res.status(404).json({ error: 'Solicitação não encontrada' });
    if (!sol.ml_shipment_id) return res.status(400).json({ error: 'Solicitação sem pedido ML vinculado.' });

    const isAdmin = ['admin', 'diretor'].includes(role);
    const isMine = sol.solicitante_id === userId || sol.responsavel_id === userId;
    if (!isAdmin && !isMine) return res.status(403).json({ error: 'Sem permissão.' });

    // Reusa linkOrder com o order_id já salvo (re-fetcha tudo)
    const { data: full } = await supabase
      .from('solicitacoes')
      .select('ml_order_id')
      .eq('id', req.params.id)
      .single();

    const result = await mlTracker.linkOrder({
      solicitacaoId: req.params.id,
      mlOrderInput: full.ml_order_id,
      profileId: userId,
    });
    res.json(result);
  } catch (e) {
    console.error('[SOLICITACOES] atualizar-ml error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ══════════════════════════════════════════════════════════════════════════
// APROVAÇÃO FINANCEIRA · o financeiro aprova compras/reembolsos antes de virar pra
// logística comprar / financeiro pagar
// ══════════════════════════════════════════════════════════════════════════

async function obterCategoriasFinanceirasAutorizadas(profileId) {
  try {
    const { data, error } = await supabase
      .from('solicitacoes_financeiro_aprovadores')
      .select('categoria')
      .eq('profile_id', profileId);
    if (error) {
      console.warn('[SOLICITACOES] escopo financeiro indisponível:', error.message);
      return { disponivel: false, categorias: new Set() };
    }
    return {
      disponivel: true,
      categorias: new Set((data || []).map(item => item.categoria).filter(Boolean)),
    };
  } catch (error) {
    console.warn('[SOLICITACOES] falha ao consultar escopo financeiro:', error.message);
    return { disponivel: false, categorias: new Set() };
  }
}

async function filtrarAprovadoresFinanceirosPorCategoria(profileIds, categoria) {
  const ids = [...new Set([...(profileIds || [])].filter(Boolean))];
  if (!ids.length) return [];

  try {
    const { data, error } = await supabase
      .from('solicitacoes_financeiro_aprovadores')
      .select('profile_id, categoria')
      .in('profile_id', ids);
    if (error) throw error;

    const categoriasPorPerfil = new Map();
    (data || []).forEach(item => {
      if (!categoriasPorPerfil.has(item.profile_id)) categoriasPorPerfil.set(item.profile_id, new Set());
      categoriasPorPerfil.get(item.profile_id).add(item.categoria);
    });

    // Sem configuração individual, mantém o comportamento já existente. Quando
    // há configuração, a pessoa recebe somente as categorias explicitamente liberadas.
    return ids.filter(id => !categoriasPorPerfil.has(id) || categoriasPorPerfil.get(id).has(categoria));
  } catch (error) {
    console.warn('[SOLICITACOES] falha ao filtrar destinatários financeiros:', error.message);
    return [];
  }
}

async function podeAprovarFinanceiro(req, categoria = null) {
  const userId = req.user.userId;
  const role = req.user.role;
  let temPermissaoBase = ['admin', 'diretor'].includes(role);
  if (!temPermissaoBase) {
    const modulePerms = req.user.granular?.modulePerms || {};
    const fin = modulePerms.financeiro || modulePerms.Financeiro;
    temPermissaoBase = !!(fin && (fin.leitura >= 3 || fin.escrita >= 3));
  }
  if (!temPermissaoBase) {
    const { data } = await supabase
      .from('area_solicitacoes_responsaveis')
      .select('profile_id')
      .eq('area', 'financeiro')
      .eq('profile_id', userId)
      .maybeSingle();
    temPermissaoBase = !!data;
  }
  if (!temPermissaoBase || !categoria) return temPermissaoBase;

  const escopoFinanceiro = await obterCategoriasFinanceirasAutorizadas(userId);
  return escopoFinanceiro.disponivel
    && (escopoFinanceiro.categorias.size === 0 || escopoFinanceiro.categorias.has(categoria));
}

function aguardandoAprovacaoFinanceira(solicitacao) {
  return solicitacao?.status === 'aguardando_aprovacao_financeira'
    && solicitacao?.precisa_aprovacao_financeira === true
    && !solicitacao?.aprovado_financeiro_em;
}

function cotacaoObrigatoriaRegistrada(solicitacao) {
  if (!['compras', 'servico'].includes(solicitacao?.categoria)) return true;
  const valor = Number(solicitacao?.valor_cotado);
  return !!solicitacao?.cotacao_em && Number.isFinite(valor) && valor >= 0;
}

// ── Alçada de compras · quem atende a área aprova até o teto ────────────────
// A régua de ELEGIBILIDADE (categoria, estado, valor cotado × teto) é PURA e
// vive em `utils/alcadaCompras.js`. Aqui só se resolve o que precisa do banco:
// o teto da área e se quem está pedindo é responsável por atendê-la.

// Teto configurável por área em `area_alcadas.limite_aprovacao`.
// ⚠️ Best-effort: sem linha (ou com a consulta falhando) cai no padrão de
// R$ 1.000. Falhar fechado aqui só empurraria a compra pro financeiro, que é
// o comportamento antigo — nunca aprova a mais.
async function limiteAlcadaDaArea(areaCliente) {
  if (!areaCliente) return LIMITE_ALCADA_PADRAO;
  try {
    const { data, error } = await supabase
      .from('area_alcadas')
      .select('limite_aprovacao')
      .eq('area_cliente', areaCliente)
      .maybeSingle();
    if (error) throw error;
    const limite = Number(data?.limite_aprovacao);
    return Number.isFinite(limite) && limite >= 0 ? limite : LIMITE_ALCADA_PADRAO;
  } catch (e) {
    console.warn('[SOLICITACOES] falha ao ler alçada da área:', e.message);
    return LIMITE_ALCADA_PADRAO;
  }
}

// ⚠️ Quem pode usar a alçada é quem ATENDE a área da solicitação — lido de
// `area_solicitacoes_responsaveis` (LEI de 2026-08-05: pessoa nunca fica
// hardcoded; o papel vive no banco e muda sem PR).
// ⚠️ De propósito NÃO reusa `podeCotar`, que também aceita quem tem logística
// nível ≥3: registrar cotação é operar, aprovar dinheiro é decidir.
async function ehResponsavelDaArea(req, area) {
  if (!area || !req?.user?.userId) return false;
  const { data, error } = await supabase
    .from('area_solicitacoes_responsaveis')
    .select('profile_id')
    .eq('area', area)
    .eq('profile_id', req.user.userId)
    .maybeSingle();
  if (error) {
    console.warn('[SOLICITACOES] falha ao checar responsável da área:', error.message);
    return false;
  }
  return !!data;
}

// Devolve o veredito completo (serve pro gate E pro flag da lista).
async function avaliarAlcada(req, sol) {
  const limite = await limiteAlcadaDaArea(sol?.area_cliente);
  const eleg = elegivelAlcada(sol, limite);
  if (!eleg.ok) return { ...eleg, responsavel: false };
  const responsavel = await ehResponsavelDaArea(req, sol.area_responsavel);
  return { ...eleg, responsavel, ok: responsavel, motivo: responsavel ? null : 'nao_responsavel' };
}

async function podeAprovarNaAlcada(req, sol) {
  const r = await avaliarAlcada(req, sol);
  return r.ok;
}

router.get('/pendentes-financeiro', async (req, res) => {
  try {
    if (!(await podeAprovarFinanceiro(req))) {
      return res.status(403).json({ error: 'Sem permissão pra ver pendências financeiras' });
    }
    const escopoFinanceiro = await obterCategoriasFinanceirasAutorizadas(req.user.userId);
    if (!escopoFinanceiro.disponivel) {
      return res.status(503).json({ error: 'A configuração do escopo financeiro não está disponível.' });
    }
    let consulta = supabase
      .from('solicitacoes')
      .select('*')
      .eq('precisa_aprovacao_financeira', true)
      .is('aprovado_financeiro_em', null)
      .eq('status', 'aguardando_aprovacao_financeira')
      .is('deleted_at', null)
      .order('eh_urgente', { ascending: false })
      .order('created_at', { ascending: true });
    if (escopoFinanceiro.categorias.size) {
      consulta = consulta.in('categoria', [...escopoFinanceiro.categorias]);
    }
    const { data, error } = await consulta;
    if (error) throw error;

    // Enriquece com nome/email/foto do solicitante (consulta separada em profiles
    // pra evitar JOIN PostgREST que tem comportamento erratico).
    const ids = [...new Set((data || []).map(s => s.solicitante_id).filter(Boolean))];
    let byId = {};
    if (ids.length > 0) {
      const { data: profs } = await supabase
        .from('profiles').select('id, name, email, avatar_url').in('id', ids);
      byId = Object.fromEntries((profs || []).map(p => [p.id, p]));
    }
    const enriched = (data || []).map(s => ({
      ...s,
      solicitante_nome: byId[s.solicitante_id]?.name || null,
      solicitante_email: byId[s.solicitante_id]?.email || null,
      solicitante_avatar: byId[s.solicitante_id]?.avatar_url || null,
    }));

    res.json(enriched);
  } catch (e) {
    console.error('[SOLICITACOES] pendentes-financeiro:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// Formas de pagamento escolhidas na aprovação · decidem quem EXECUTA:
// cartão → volta pra quem atende compras (compra no cartão); demais formas →
// vão pro financeiro efetuar o pagamento.
const FORMAS_PAGAMENTO_VALIDAS = ['boleto', 'pix', 'transferencia_bancaria', 'dinheiro', 'cartao_credito'];
// Quem executa os pagamentos não-cartão no financeiro (snapshot de id · trocar
// a pessoa é mudar esta linha, e o papel real vive em area_solicitacoes_responsaveis).
const EXECUTOR_FINANCEIRO_ID = '7ab43fe2-cf03-45e1-b193-3c5f4d96f9a5';

router.post('/:id/aprovar-financeiro', async (req, res) => {
  try {
    const { observacao } = req.body || {};
    const formaPagamento = (req.body?.forma_pagamento || '').trim() || null;
    const { data: atual } = await supabase
      .from('solicitacoes').select('*').eq('id', req.params.id).is('deleted_at', null).maybeSingle();
    if (!atual) return res.status(404).json({ error: 'Solicitação não encontrada' });

    // Dois caminhos pra aprovar, na MESMA porta (um 2º endpoint criaria uma
    // segunda régua de dinheiro): o portão financeiro de sempre, ou a ALÇADA
    // de quem atende a área quando a compra cotada cabe no teto.
    let viaAlcada = false;
    let limiteAlcada = LIMITE_ALCADA_PADRAO;
    if (!(await podeAprovarFinanceiro(req, atual.categoria))) {
      const alc = await avaliarAlcada(req, atual);
      limiteAlcada = alc.limite;
      if (!alc.ok) {
        return res.status(403).json({
          error: alc.motivo === 'acima_do_limite'
            ? `Compras acima de R$ ${alc.limite.toLocaleString('pt-BR')} precisam da aprovação do financeiro.`
            : 'Você não pode aprovar esta categoria de solicitação.',
        });
      }
      viaAlcada = true;
    }

    if (!aguardandoAprovacaoFinanceira(atual)) {
      return res.status(400).json({ error: 'Esta solicitação não está aguardando aprovação financeira.' });
    }
    if (!cotacaoObrigatoriaRegistrada(atual)) {
      return res.status(400).json({ error: 'A compra precisa ter uma cotação registrada antes da aprovação financeira.' });
    }

    // Compra/serviço EXIGEM a forma de pagamento — é ela que decide quem executa.
    const ehCompraServico = ['compras', 'servico'].includes(atual.categoria);
    if (formaPagamento && !FORMAS_PAGAMENTO_VALIDAS.includes(formaPagamento)) {
      return res.status(400).json({ error: 'Forma de pagamento inválida.' });
    }
    if (ehCompraServico && !formaPagamento) {
      return res.status(400).json({ error: 'Escolha a forma de pagamento (define se a compra volta pra área comprar no cartão ou vai pro financeiro pagar).' });
    }

    // Pra onde vai depois do OK:
    //   compra/serviço + CARTÃO  -> logistica_compras (a área COMPRA no cartão) · pendente
    //   compra/serviço + demais  -> financeiro (financeiro PAGA) · em_atendimento
    //   reembolso/pagamento      -> financeiro (financeiro paga) · em_atendimento
    // ⚠️ A alçada dispensa o financeiro de APROVAR, não de PAGAR: com forma
    // não-cartão alguém com acesso à conta ainda precisa executar o pagamento.
    const noCartao = formaPagamento === 'cartao_credito';
    const vaiProFinanceiro = !ehCompraServico || !noCartao;
    const novaAreaResp = vaiProFinanceiro ? 'financeiro' : 'logistica_compras';
    const novoStatus = vaiProFinanceiro ? 'em_atendimento' : 'pendente';

    const updates = {
      aprovado_financeiro_em: new Date().toISOString(),
      aprovado_financeiro_por: req.user.userId,
      area_responsavel: novaAreaResp,
      status: novoStatus,
    };
    if (formaPagamento) updates.forma_pagamento = formaPagamento;
    // Pagamento não-cartão vai pro executor do financeiro — ele vê e marca como pago.
    if (vaiProFinanceiro && EXECUTOR_FINANCEIRO_ID) updates.responsavel_id = EXECUTOR_FINANCEIRO_ID;

    // ⚠️ Aprovação por alçada fica REGISTRADA na observação. `aprovado_financeiro_por`
    // sozinho não distingue "o financeiro aprovou" de "a área aprovou dentro do
    // teto", e essa distinção é o que se audita seis meses depois.
    const carimbo = viaAlcada
      ? `[Aprovação por alçada · até R$ ${limiteAlcada.toLocaleString('pt-BR')} · sem passar pelo financeiro]`
      : '[Aprovação financeira]';
    const linhaObs = observacao ? `${carimbo} ${observacao}` : (viaAlcada ? carimbo : null);
    if (linhaObs) {
      updates.observacoes = atual.observacoes
        ? `${atual.observacoes}\n${linhaObs}`
        : linhaObs;
    }

    const { data, error } = await supabase
      .from('solicitacoes')
      .update(updates)
      .eq('id', req.params.id)
      .eq('status', 'aguardando_aprovacao_financeira')
      .eq('precisa_aprovacao_financeira', true)
      .is('aprovado_financeiro_em', null)
      .is('deleted_at', null)
      .select('*')
      .maybeSingle();
    if (error) throw error;
    if (!data) return res.status(409).json({ error: 'Esta solicitação foi alterada por outra pessoa. Atualize a fila antes de decidir.' });

    const acaoMsg = (noCartao && ehCompraServico)
      ? 'liberado pra compra no cartão'
      : {
          compras:   'enviado pro financeiro pagar a compra',
          servico:   'enviado pro financeiro pagar o serviço',
          reembolso: 'pode efetuar o reembolso',
          pagamento: 'pode efetuar o pagamento',
        }[atual.categoria] || 'liberado pra atendimento';
    notificar({
      modulo: vaiProFinanceiro ? 'financeiro' : (CATEGORIA_MODULO[atual.categoria] || 'logistica'),
      tipo: 'solicitacao_status',
      titulo: `Solicitação aprovada: ${atual.titulo}`,
      mensagem: viaAlcada
        ? `${req.user.name || 'A área responsável'} aprovou dentro da alçada (até R$ ${limiteAlcada.toLocaleString('pt-BR')}) · ${acaoMsg}`
        : `${req.user.name || 'O financeiro'} aprovou financeiramente · ${acaoMsg}`,
      link: '/solicitacoes',
      severidade: 'info',
      chaveDedup: `solicitacao_aprovada_fin_${data.id}`,
      extraTargetIds: [atual.solicitante_id].filter(Boolean),
    }).catch(err => console.error('[SOLICITACOES] notify:', err.message));

    // WhatsApp pro solicitante: aprovação financeira concluída.
    notificarPedidoWhatsapp(data.id, 'aprovada no financeiro', acaoMsg);

    res.json(data);
  } catch (e) {
    console.error('[SOLICITACOES] aprovar-financeiro:', e.message);
    res.status(500).json({ error: e.message });
  }
});

router.post('/:id/reprovar-financeiro', async (req, res) => {
  try {
    const { motivo } = req.body || {};
    if (!motivo) return res.status(400).json({ error: 'Motivo da reprovação é obrigatório' });

    const { data: atual } = await supabase
      .from('solicitacoes').select('*').eq('id', req.params.id).is('deleted_at', null).maybeSingle();
    if (!atual) return res.status(404).json({ error: 'Solicitação não encontrada' });
    if (!(await podeAprovarFinanceiro(req, atual.categoria))) {
      return res.status(403).json({ error: 'Você não pode reprovar esta categoria de solicitação.' });
    }
    if (!aguardandoAprovacaoFinanceira(atual)) {
      return res.status(400).json({ error: 'Esta solicitação não está aguardando aprovação financeira.' });
    }
    if (!cotacaoObrigatoriaRegistrada(atual)) {
      return res.status(400).json({ error: 'A compra precisa ter uma cotação registrada antes da reprovação financeira.' });
    }

    const updates = {
      status: 'rejeitado',
      aprovado_financeiro_em: new Date().toISOString(),
      aprovado_financeiro_por: req.user.userId,
      observacoes: atual.observacoes
        ? `${atual.observacoes}\n[REPROVADO pelo financeiro] ${motivo}`
        : `[REPROVADO pelo financeiro] ${motivo}`,
    };

    const { data, error } = await supabase
      .from('solicitacoes')
      .update(updates)
      .eq('id', req.params.id)
      .eq('status', 'aguardando_aprovacao_financeira')
      .eq('precisa_aprovacao_financeira', true)
      .is('aprovado_financeiro_em', null)
      .is('deleted_at', null)
      .select('*')
      .maybeSingle();
    if (error) throw error;
    if (!data) return res.status(409).json({ error: 'Esta solicitação foi alterada por outra pessoa. Atualize a fila antes de decidir.' });

    notificar({
      modulo: 'financeiro',
      tipo: 'solicitacao_status',
      titulo: `Solicitação reprovada: ${atual.titulo}`,
      mensagem: `Financeiro reprovou · ${motivo}`,
      link: '/solicitacoes',
      severidade: 'alta',
      chaveDedup: `solicitacao_reprovada_fin_${data.id}`,
      extraTargetIds: [atual.solicitante_id].filter(Boolean),
    }).catch(err => console.error('[SOLICITACOES] notify:', err.message));

    res.json(data);
  } catch (e) {
    console.error('[SOLICITACOES] reprovar-financeiro:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// Dashboard urgência frequente · top solicitantes urgentes últimos 90d
router.get('/dashboard/urgencia-frequente', async (req, res) => {
  try {
    const role = req.user.role;
    if (!['admin', 'diretor'].includes(role)) {
      const modulePerms = req.user.granular?.modulePerms || {};
      const fin = modulePerms.financeiro || modulePerms.Financeiro;
      if (!(fin && fin.leitura >= 3)) {
        return res.status(403).json({ error: 'Sem permissão' });
      }
    }
    const desde = new Date(Date.now() - 90 * 86400000).toISOString();
    const { data, error } = await supabase
      .from('solicitacoes')
      .select('solicitante_id, eh_urgente')
      .gte('created_at', desde)
      .is('deleted_at', null);
    if (error) throw error;

    const agg = new Map();
    (data || []).forEach(s => {
      const id = s.solicitante_id;
      if (!id) return;
      if (!agg.has(id)) agg.set(id, { solicitante_id: id, total: 0, urgentes: 0 });
      const a = agg.get(id);
      a.total++;
      if (s.eh_urgente) a.urgentes++;
    });

    const lista = [...agg.values()]
      .filter(a => a.urgentes >= 2)
      .map(a => ({ ...a, taxa: a.total > 0 ? (a.urgentes / a.total) : 0 }))
      .sort((a, b) => b.urgentes - a.urgentes)
      .slice(0, 20);

    if (lista.length > 0) {
      const ids = lista.map(x => x.solicitante_id);
      const { data: profs } = await supabase
        .from('profiles').select('id, name, email').in('id', ids);
      const byId = Object.fromEntries((profs || []).map(p => [p.id, p]));
      lista.forEach(x => {
        const p = byId[x.solicitante_id];
        x.nome = p?.name || '—';
        x.email = p?.email || null;
      });
    }

    res.json(lista);
  } catch (e) {
    console.error('[SOLICITACOES] urgencia-frequente:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// GET /dashboard/refeitas?dias=90 · termômetro "pedimos bem?" (NÃO punitivo · Fase 1)
// % das solicitações do período que precisaram de ajuste (refação pelo solicitante)
// + nº de devoluções (a área pediu clareza). Gestão (admin/diretor) ou responsável.
router.get('/dashboard/refeitas', async (req, res) => {
  try {
    const role = req.user.role;
    if (!['admin', 'diretor'].includes(role)) {
      const { data: rr } = await supabase
        .from('area_solicitacoes_responsaveis')
        .select('area').eq('profile_id', req.user.userId).limit(1);
      if (!rr || !rr.length) return res.status(403).json({ error: 'Sem permissão' });
    }
    const dias = Math.min(Math.max(parseInt(req.query.dias, 10) || 90, 7), 365);
    const desde = new Date(Date.now() - dias * 86400000).toISOString();

    const [{ count: totalPeriodo }, { data: ajustes }] = await Promise.all([
      supabase.from('solicitacoes').select('id', { count: 'exact', head: true })
        .gte('created_at', desde).is('deleted_at', null),
      supabase.from('solicitacao_ajustes').select('solicitacao_id, lado, motivo')
        .gte('created_at', desde),
    ]);

    const refeitasSet = new Set();
    const devolucoesSet = new Set();
    const porMotivo = { descricao: 0, escopo: 0, data: 0, cancelamento: 0 };
    (ajustes || []).forEach(a => {
      porMotivo[a.motivo] = (porMotivo[a.motivo] || 0) + 1;
      if (a.motivo === 'cancelamento') return;
      if (a.lado === 'solicitante') refeitasSet.add(a.solicitacao_id);
      else if (a.lado === 'responsavel') devolucoesSet.add(a.solicitacao_id);
    });

    const total = totalPeriodo || 0;
    const refeitas = refeitasSet.size;
    res.json({
      dias,
      total_periodo: total,
      refeitas,
      devolucoes: devolucoesSet.size,
      pct_refeitas: total > 0 ? Math.round((refeitas / total) * 1000) / 10 : 0,
      por_motivo: porMotivo,
    });
  } catch (e) {
    console.error('[SOLICITACOES] dashboard-refeitas:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── PONTE ESTOQUE (Fase 3a-2) · atender uma solicitação dando baixa no estoque ──
// O Amaury (responsável da logística) vê o pedido na fila e, se já temos o item
// aqui, "atende pela estoque": baixa o(s) produto(s) + resolve a solicitação.
// (A outra saída — comprar — segue pelo fluxo de compras que já existe.)

// GET /estoque/produtos · picker do catálogo (com saldo) pra montar a baixa
router.get('/estoque/produtos', async (req, res) => {
  try {
    const busca = (req.query.busca || '').toString().replace(/[,()*:%]/g, ' ').trim();
    let q = supabase.from('vw_log_estoque_saldo').select('id,nome,categoria,unidade,saldo')
      .eq('ativo', true).order('nome').limit(1000);
    if (busca) q = q.ilike('nome', `%${busca}%`);
    const { data, error } = await q;
    if (error) return res.status(400).json({ error: error.message });
    res.json(data || []);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /:id/atender-estoque · body { itens:[{produto_id, quantidade}], observacao? }
router.post('/:id/atender-estoque', async (req, res) => {
  try {
    const userId = req.user.userId;
    const userName = req.user.name;
    const { itens, observacao } = req.body || {};
    if (!Array.isArray(itens) || !itens.length) return res.status(400).json({ error: 'Informe ao menos um item.' });

    const { data: sol } = await supabase.from('solicitacoes')
      .select('id, solicitante_id, responsavel_id, area_responsavel, area_cliente, categoria, titulo, status, observacoes')
      .eq('id', req.params.id).is('deleted_at', null).maybeSingle();
    if (!sol) return res.status(404).json({ error: 'Solicitação não encontrada.' });

    // permissão · admin/diretor, responsável direto, ou responsável da área
    const isAdm = ['admin', 'diretor'].includes(req.user.role);
    const isResp = sol.responsavel_id === userId;
    let isAreaResp = false;
    if (!isAdm && !isResp && sol.area_responsavel) {
      const { data: rr } = await supabase.from('area_solicitacoes_responsaveis')
        .select('profile_id').eq('area', sol.area_responsavel).eq('profile_id', userId).maybeSingle();
      isAreaResp = !!rr;
    }
    if (!isAdm && !isResp && !isAreaResp) return res.status(403).json({ error: 'Sem permissão.' });
    if (['concluido', 'cancelado', 'rejeitado', 'avaliado'].includes(sol.status)) {
      return res.status(400).json({ error: 'Solicitação já encerrada.' });
    }

    // Bloqueio de saldo negativo (pedido do usuário 2026-07-27 · antes era só
    // aviso visual no front, sem trava no servidor). Checa o saldo ATUAL de
    // cada produto antes de gravar qualquer saída — se algum item pedir mais
    // do que existe, a atendimento inteira é rejeitada (nada é gravado).
    const produtoIds = [...new Set(itens.map(it => it.produto_id).filter(Boolean))];
    const { data: saldos, error: saldoErr } = await supabase.from('vw_log_estoque_saldo')
      .select('id, nome, saldo').in('id', produtoIds);
    if (saldoErr) return res.status(400).json({ error: 'Erro ao checar saldo do estoque: ' + saldoErr.message });
    const saldoPorId = new Map((saldos || []).map(s => [s.id, s]));

    const rows = [];
    for (const it of itens) {
      const qtd = Number(it.quantidade);
      if (!it.produto_id || !qtd || qtd <= 0) return res.status(400).json({ error: 'Item inválido (produto + quantidade > 0).' });
      const prod = saldoPorId.get(it.produto_id);
      const saldoAtual = Number(prod?.saldo || 0);
      if (qtd > saldoAtual) {
        return res.status(400).json({
          error: `Saldo insuficiente em "${prod?.nome || it.produto_id}": disponível ${saldoAtual}, pedido ${qtd}.`,
        });
      }
      rows.push({
        produto_id: it.produto_id, tipo: 'saida', quantidade: qtd,
        data_movimentacao: new Date().toISOString().slice(0, 10),
        area_destino: sol.area_cliente || null,
        motivo: `Atende solicitação: ${sol.titulo}`,
        origem_solicitacao_id: sol.id, feito_por: userId,
      });
    }
    const { error: movErr } = await supabase.from('log_estoque_movimentacoes').insert(rows);
    if (movErr) return res.status(400).json({ error: 'Erro ao baixar do estoque: ' + movErr.message });

    const obs = `${sol.observacoes ? sol.observacoes + '\n' : ''}Atendido pela estoque por ${userName || 'logística'}${observacao ? ` · ${observacao}` : ''}.`;
    const { data, error } = await supabase.from('solicitacoes')
      .update({ status: 'concluido', observacoes: obs }).eq('id', sol.id).select('*').single();
    if (error) return res.status(400).json({ error: error.message });

    notificar({
      modulo: CATEGORIA_MODULO[sol.categoria] || 'logistica',
      tipo: 'solicitacao_status',
      titulo: `Atendida pela estoque: ${sol.titulo}`,
      mensagem: `${userName || 'A logística'} atendeu sua solicitação com itens que já tínhamos no estoque.`,
      link: '/solicitacoes', severidade: 'info',
      chaveDedup: `solicitacao_atendida_estoque_${sol.id}`,
      targetIds: [sol.solicitante_id].filter(Boolean),
    }).catch(err => console.error('[SOLICITACOES] notify atender-estoque:', err.message));

    res.json(data);
  } catch (e) { console.error('[SOLICITACOES] atender-estoque:', e.message); res.status(500).json({ error: e.message }); }
});

module.exports = router;
module.exports.aprovarOrigemInterno = aprovarOrigemInterno;
module.exports.rejeitarOrigemInterno = rejeitarOrigemInterno;
module.exports.aprovarMeritoInterno = aprovarMeritoInterno;
module.exports.rejeitarMeritoInterno = rejeitarMeritoInterno;
module.exports.aprovadoresMeritoIds = aprovadoresMeritoIds;
