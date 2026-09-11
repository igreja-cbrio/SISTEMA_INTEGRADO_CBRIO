// ============================================================================
// VISITANTES · módulo interno (/api/visitantes) · 2026-09-09
// ============================================================================
// Quem lê a porta pública /visitante: lista das visitas, resumo (quantos, por
// local, vouchers, nota média), RESGATE do voucher no balcão da cafeteria, e a
// ponte com Próximos passos (Cuidados) — os visitantes aparecem naquela lista
// como linhas etiquetadas, lidas DAQUI, sem tocar em cui_convertidos.
//
// Guards: `visitantes` é módulo próprio (unidade de permissão: quem resgata
// voucher no balcão não precisa ver a ficha pastoral). As duas rotas /cuidados/*
// usam o guard do módulo `cuidados`, porque quem as chama é a tela de Cuidados.
// ============================================================================
const express = require('express');
const router = express.Router();
const { supabase } = require('../utils/supabase');
const { authenticate, authorizeModule } = require('../middleware/auth');
const { resolverJanelaPeriodo, rotuloJanela } = require('../utils/janelaPeriodo');
const { LOCAIS, normalizarCodigoVoucher, NOTA_MAX } = require('../utils/visitanteRegras');
const { fluxoDaPorta, estadoDoFluxo, adesaoDoFluxo, ENCAMINHAMENTOS, DESFECHOS } = require('../utils/portaFluxos');
const { acoesPorRef, registrarDesfecho, apagarDesfecho } = require('../services/fluxoPortaAcoes');

router.use(authenticate);

const BASE_PUBLICA = process.env.PUBLIC_BASE_URL || 'https://www.cbrio.org';
const DIAS_VALIDOS = [7, 30, 90, 180, 365];

// Colunas que a tela lista. ⚠️ CPF fica FORA da lista (PII que não precisa
// trafegar); só a ficha individual o traz, mascarado.
const COLS_LISTA = 'id, membro_id, culto_id, culto_nome, culto_data, nome, telefone, local, '
  + 'voucher_codigo, voucher_status, voucher_resgatado_em, voucher_resgatado_por_nome, '
  + 'whatsapp_optin, pesquisa_status, pesquisa_enviada_em, pesquisa_nota, pesquisa_comentario, '
  + 'pesquisa_respondida_em, primeiro_contato_status, primeiro_contato_em, responsavel_atendimento, '
  + 'observacoes, created_at';

/** Início/fim da janela em instantes UTC, com o dia em BRT (03:00Z = meia-noite no Rio). */
function limitesUtc(j) {
  const ini = new Date(`${j.inicio}T03:00:00Z`);
  const fim = j.fim ? new Date(new Date(`${j.fim}T03:00:00Z`).getTime() + 86400000) : null;
  return { ini: ini.toISOString(), fim: fim ? fim.toISOString() : null };
}

/** Lê tudo paginando (cap de 1000 do PostgREST). */
async function lerVisitas(j, extra = (q) => q) {
  const { ini, fim } = limitesUtc(j);
  const out = [];
  for (let off = 0; ; off += 1000) {
    let q = supabase.from('vis_visitas').select(COLS_LISTA)
      .is('deleted_at', null).gte('created_at', ini)
      .order('created_at', { ascending: false }).range(off, off + 999);
    if (fim) q = q.lt('created_at', fim);
    q = extra(q);
    const { data, error } = await q;
    if (error) throw error;
    if (!data?.length) break;
    out.push(...data);
    if (data.length < 1000) break;
  }
  return out;
}

function mascararCpf(cpf) {
  const d = String(cpf || '').replace(/\D/g, '');
  return d.length === 11 ? `***.${d.slice(3, 6)}.${d.slice(6, 9)}-**` : null;
}

// ── GET /locais · o catálogo dos cartazes (links pro QR) ────────────────────
router.get('/locais', authorizeModule('visitantes', 1), (_req, res) => {
  res.json(LOCAIS.map((l) => ({
    ...l,
    url: l.id === 'outro' ? `${BASE_PUBLICA}/visitante` : `${BASE_PUBLICA}/visitante?local=${l.id}`,
  })));
});

// ── GET / · lista da janela (?dias= | ?ano= | ?inicio=&fim=) + filtros ──────
router.get('/', authorizeModule('visitantes', 1), async (req, res) => {
  try {
    const j = resolverJanelaPeriodo({ ...req.query, diasValidos: DIAS_VALIDOS, diasPadrao: 30 });
    const { local, voucher, pesquisa } = req.query;
    const linhas = await lerVisitas(j, (q) => {
      if (local && LOCAIS.some((l) => l.id === local)) q = q.eq('local', local);
      if (voucher && ['emitido', 'resgatado', 'repetido'].includes(voucher)) q = q.eq('voucher_status', voucher);
      if (pesquisa && ['pendente', 'enviada', 'respondida', 'expirada', 'sem_optin'].includes(pesquisa)) q = q.eq('pesquisa_status', pesquisa);
      return q;
    });
    res.json({ janela: { ...j, rotulo: rotuloJanela(j) }, total: linhas.length, visitas: linhas });
  } catch (e) {
    console.error('[visitantes GET /]', e.message);
    res.status(500).json({ error: 'Não foi possível carregar as visitas.', detalhe: e.message });
  }
});

// ── GET /resumo · os números da janela ──────────────────────────────────────
router.get('/resumo', authorizeModule('visitantes', 1), async (req, res) => {
  try {
    const j = resolverJanelaPeriodo({ ...req.query, diasValidos: DIAS_VALIDOS, diasPadrao: 30 });
    const linhas = await lerVisitas(j);
    const porLocal = {};
    for (const l of LOCAIS) porLocal[l.id] = 0;
    const porDia = new Map();
    const pessoas = new Set();
    let emitidos = 0, resgatados = 0, repetidos = 0, optin = 0;
    // ⚠️ A escala é 1 · 2 · 3 desde 11/09/2026. `fora_da_escala` conta o que
    // não couber nela (linha antiga de 1..5, se houver): fica FORA da média,
    // porque misturar duas réguas faria a média não dizer nada — mas aparece
    // no JSON, pra ninguém perder dado em silêncio.
    let enviadas = 0, respondidas = 0, somaNotas = 0, foraDaEscala = 0;
    const notas = { 1: 0, 2: 0, 3: 0 };
    for (const v of linhas) {
      porLocal[v.local] = (porLocal[v.local] || 0) + 1;
      pessoas.add(v.membro_id || `cpf-${v.id}`);
      // dia em BRT
      const dia = new Date(new Date(v.created_at).getTime() - 3 * 3600 * 1000).toISOString().slice(0, 10);
      porDia.set(dia, (porDia.get(dia) || 0) + 1);
      if (v.voucher_status === 'emitido') emitidos += 1;
      if (v.voucher_status === 'resgatado') resgatados += 1;
      if (v.voucher_status === 'repetido') repetidos += 1;
      if (v.whatsapp_optin) optin += 1;
      if (v.pesquisa_enviada_em && v.pesquisa_status !== 'expirada') enviadas += 1;
      if (v.pesquisa_nota) {
        respondidas += 1;
        if (notas[v.pesquisa_nota] != null) { somaNotas += v.pesquisa_nota; notas[v.pesquisa_nota] += 1; }
        else foraDaEscala += 1;
      }
    }
    res.json({
      janela: { ...j, rotulo: rotuloJanela(j) },
      visitas: linhas.length,
      pessoas_distintas: pessoas.size,
      por_local: porLocal,
      por_dia: [...porDia.entries()].sort((a, b) => a[0] < b[0] ? -1 : 1).map(([dia, qtd]) => ({ dia, qtd })),
      voucher: { emitidos, resgatados, repetidos, total_emitidos: emitidos + resgatados },
      whatsapp_optin: optin,
      pesquisa: {
        enviadas, respondidas,
        escala_max: NOTA_MAX,
        fora_da_escala: foraDaEscala,
        // null, nunca 0: "ninguém respondeu" ≠ "nota média zero"
        nota_media: (respondidas - foraDaEscala)
          ? Math.round((somaNotas / (respondidas - foraDaEscala)) * 10) / 10 : null,
        distribuicao: notas,
        taxa_resposta_pct: enviadas ? Math.round((respondidas / enviadas) * 100) : null,
      },
    });
  } catch (e) {
    console.error('[visitantes GET /resumo]', e.message);
    res.status(500).json({ error: 'Não foi possível montar o resumo.', detalhe: e.message });
  }
});

// ── voucher · o balcão da cafeteria ─────────────────────────────────────────
// GET /voucher/:codigo · consulta (quem é, status) · nível 1
router.get('/voucher/:codigo', authorizeModule('visitantes', 1), async (req, res) => {
  try {
    const cod = normalizarCodigoVoucher(req.params.codigo);
    if (cod.length !== 6) return res.status(400).json({ error: 'Código tem 6 caracteres.' });
    const { data, error } = await supabase.from('vis_visitas')
      .select('id, nome, local, culto_nome, culto_data, voucher_codigo, voucher_status, voucher_resgatado_em, voucher_resgatado_por_nome, created_at')
      .eq('voucher_codigo', cod).is('deleted_at', null).maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Voucher não encontrado. Confira o código com a pessoa.' });
    res.json(data);
  } catch (e) {
    console.error('[visitantes GET /voucher]', e.message);
    res.status(500).json({ error: 'Não foi possível consultar o voucher.' });
  }
});

// POST /voucher/:codigo/resgatar · nível 2 · UPDATE condicionado (2 toques = 1 café)
router.post('/voucher/:codigo/resgatar', authorizeModule('visitantes', 2), async (req, res) => {
  try {
    const cod = normalizarCodigoVoucher(req.params.codigo);
    if (cod.length !== 6) return res.status(400).json({ error: 'Código tem 6 caracteres.' });
    const agora = new Date().toISOString();
    const { data, error } = await supabase.from('vis_visitas')
      .update({
        voucher_status: 'resgatado', voucher_resgatado_em: agora,
        voucher_resgatado_por: req.user?.userId || req.user?.id || null,
        voucher_resgatado_por_nome: req.user?.name || req.user?.email || null,
      })
      .eq('voucher_codigo', cod).is('deleted_at', null).eq('voucher_status', 'emitido')
      .select('id, nome, voucher_codigo, voucher_status, voucher_resgatado_em');
    if (error) throw error;
    if (data?.length) return res.json({ ok: true, resgatado_agora: true, visita: data[0] });

    // Não virou: ou não existe, ou já foi resgatado — a tela precisa distinguir.
    const { data: atual } = await supabase.from('vis_visitas')
      .select('id, nome, voucher_status, voucher_resgatado_em, voucher_resgatado_por_nome')
      .eq('voucher_codigo', cod).is('deleted_at', null).maybeSingle();
    if (!atual) return res.status(404).json({ error: 'Voucher não encontrado. Confira o código com a pessoa.' });
    return res.status(409).json({
      error: 'Este voucher já foi resgatado.', codigo: 'ja_resgatado', visita: atual,
    });
  } catch (e) {
    console.error('[visitantes POST /voucher/resgatar]', e.message);
    res.status(500).json({ error: 'Não foi possível resgatar agora.' });
  }
});

// ── ponte com PRÓXIMOS PASSOS (tela de Cuidados) ────────────────────────────
// Linhas no formato que a tabela de convertidos espera, com etiqueta visitante.
// Guard do módulo CUIDADOS: é quem abre aquela tela.
const CAMPOS_ACOMPANHAMENTO = [
  'primeiro_contato_status', 'primeiro_contato_em', 'responsavel_atendimento', 'observacoes',
];

function linhaParaCuidados(v) {
  return {
    id: `vis:${v.id}`,
    _visitante: true,
    visita_id: v.id,
    membro_id: v.membro_id,
    nome: v.nome,
    telefone: v.telefone,
    culto_id: v.culto_id,
    culto_nome: v.culto_nome,
    data_culto: v.culto_data || new Date(new Date(v.created_at).getTime() - 3 * 3600 * 1000).toISOString().slice(0, 10),
    area: null,
    tags: ['visitante'],
    local: v.local,
    voucher_status: v.voucher_status,
    pesquisa_nota: v.pesquisa_nota,
    pesquisa_comentario: v.pesquisa_comentario,
    primeiro_contato_status: v.primeiro_contato_status,
    primeiro_contato_em: v.primeiro_contato_em,
    responsavel_atendimento: v.responsavel_atendimento,
    observacoes: v.observacoes,
    atendido_apos_culto: v.primeiro_contato_status === 'atendido_respondido',
    direcionamento: null,
    created_at: v.created_at,
  };
}

router.get('/cuidados', authorizeModule('cuidados', 1), async (req, res) => {
  try {
    const j = resolverJanelaPeriodo({ ...req.query, diasValidos: [30, 60, 90, 180, 365, 730], diasPadrao: 365 });
    const linhas = await lerVisitas(j);
    res.json(linhas.map(linhaParaCuidados));
  } catch (e) {
    console.error('[visitantes GET /cuidados]', e.message);
    res.status(500).json({ error: 'Não foi possível carregar os visitantes.', detalhe: e.message });
  }
});

// ── FLUXO DA PORTA (11/09/2026) ─────────────────────────────────────────────
// "o que a igreja deve fazer com quem entrou, até quando, e se foi feito".
// ⚠️ O estado NÃO vem do banco: é calculado por utils/portaFluxos a partir das
// colunas que a visita já tem + as ações humanas em flx_acoes. Uma verdade só.
const PORTA = 'visitante';

router.get('/cuidados/fluxo', authorizeModule('cuidados', 1), async (req, res) => {
  try {
    const j = resolverJanelaPeriodo({ ...req.query, diasValidos: [7, 30, 90, 180, 365], diasPadrao: 30 });
    const linhas = await lerVisitas(j);
    const acoes = await acoesPorRef(PORTA, linhas.map((v) => v.id));
    const agora = new Date();
    const itens = linhas.map((v) => {
      const estado = estadoDoFluxo({ porta: PORTA, registro: v, acoes: acoes[v.id] || {}, agora });
      return {
        id: v.id,
        membro_id: v.membro_id,
        nome: v.nome,
        telefone: v.telefone,
        culto: v.culto_nome ? { nome: v.culto_nome, data: v.culto_data } : null,
        created_at: v.created_at,
        pesquisa_nota: v.pesquisa_nota,
        pesquisa_comentario: v.pesquisa_comentario,
        primeiro_contato_status: v.primeiro_contato_status,
        responsavel_atendimento: v.responsavel_atendimento,
        fluxo: estado,
      };
    });
    // ⚠️ A lista sai por URGÊNCIA, não por data: quem está atrasado primeiro, e
    // dentro do atraso o mais antigo. Lista por data faz o atraso afundar.
    const peso = (i) => (i.fluxo?.encerrado ? 3 : i.fluxo?.atrasadas?.length ? 0 : i.fluxo?.atual ? 1 : 2);
    itens.sort((a, b) => peso(a) - peso(b) || String(a.created_at).localeCompare(String(b.created_at)));
    res.json({
      janela: { ...j, rotulo: rotuloJanela(j) },
      catalogo: {
        porta: PORTA,
        label: fluxoDaPorta(PORTA).label,
        etapas: fluxoDaPorta(PORTA).etapas.map((e) => ({
          chave: e.chave, label: e.label, quem: e.quem,
          depende_da_pessoa: !!e.dependeDaPessoa, encerra: !!e.encerra, prazo_dias: e.prazoDias,
        })),
        desfechos: DESFECHOS,
        encaminhamentos: ENCAMINHAMENTOS,
      },
      adesao: adesaoDoFluxo({
        porta: PORTA,
        itens: linhas.map((v) => ({ registro: v, acoes: acoes[v.id] || {} })),
        agora,
      }),
      itens,
    });
  } catch (e) {
    console.error('[visitantes GET /cuidados/fluxo]', e.message);
    res.status(500).json({ error: 'Não foi possível carregar o fluxo.', detalhe: e.message });
  }
});

// Encerrar o fluxo de uma visita. Nível 3: é decisão pastoral, não leitura.
router.post('/cuidados/:id/desfecho', authorizeModule('cuidados', 3), async (req, res) => {
  try {
    // ⚠️ Lê a linha ANTES de escrever: flx_acoes não tem FK pra vis_visitas (a
    // tabela é genérica), então é aqui que se garante que a visita existe e
    // está viva. Sem isso dá pra encerrar fluxo de uma visita apagada.
    const { data: visita, error } = await supabase.from('vis_visitas')
      .select('id, membro_id').eq('id', req.params.id).is('deleted_at', null).maybeSingle();
    if (error) throw error;
    if (!visita) return res.status(404).json({ error: 'Visita não encontrada.' });

    const r = await registrarDesfecho({
      porta: PORTA, refId: visita.id, membroId: visita.membro_id,
      resultado: req.body?.resultado, encaminhamento: req.body?.encaminhamento,
      observacao: req.body?.observacao, usuario: req.user,
    });
    if (r.erro) return res.status(400).json({ error: r.erro, campo: r.campo });
    res.json({ ok: true, corrigida: r.corrigida, acao: r.acao });
  } catch (e) {
    console.error('[visitantes POST /cuidados/desfecho]', e.message);
    res.status(500).json({ error: 'Não foi possível encerrar o fluxo.' });
  }
});

// Desfazer o encerramento (soft-delete · a chave única é parcial e libera).
router.delete('/cuidados/:id/desfecho', authorizeModule('cuidados', 3), async (req, res) => {
  try {
    const r = await apagarDesfecho({ porta: PORTA, refId: req.params.id });
    if (r.erro) return res.status(400).json({ error: r.erro });
    res.json({ ok: true, apagadas: r.apagadas });
  } catch (e) {
    console.error('[visitantes DELETE /cuidados/desfecho]', e.message);
    res.status(500).json({ error: 'Não foi possível reabrir o fluxo.' });
  }
});

async function patchAcompanhamento(id, body, user) {
  const patch = {};
  for (const c of CAMPOS_ACOMPANHAMENTO) {
    if (Object.prototype.hasOwnProperty.call(body || {}, c)) patch[c] = body[c];
  }
  if (!Object.keys(patch).length) return { erro: 'Nenhum campo editável no corpo.' };
  if (patch.primeiro_contato_em && !patch.primeiro_contato_por) {
    patch.primeiro_contato_por = user?.userId || user?.id || null;
  }
  const { data, error } = await supabase.from('vis_visitas').update(patch)
    .eq('id', id).is('deleted_at', null).select(COLS_LISTA).maybeSingle();
  if (error) throw error;
  if (!data) return { naoEncontrada: true };
  return { data };
}

router.patch('/cuidados/:id', authorizeModule('cuidados', 3), async (req, res) => {
  try {
    const r = await patchAcompanhamento(req.params.id, req.body, req.user);
    if (r.erro) return res.status(400).json({ error: r.erro });
    if (r.naoEncontrada) return res.status(404).json({ error: 'Visita não encontrada.' });
    res.json(linhaParaCuidados(r.data));
  } catch (e) {
    console.error('[visitantes PATCH /cuidados]', e.message);
    res.status(500).json({ error: 'Não foi possível salvar.' });
  }
});

// ── ficha e edição pelo próprio módulo ──────────────────────────────────────
router.get('/:id', authorizeModule('visitantes', 1), async (req, res) => {
  try {
    const { data, error } = await supabase.from('vis_visitas').select('*')
      .eq('id', req.params.id).is('deleted_at', null).maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Visita não encontrada.' });
    const { cpf, ip_origem, user_agent, ...resto } = data;
    res.json({ ...resto, cpf_mascarado: mascararCpf(cpf) });
  } catch (e) {
    res.status(500).json({ error: 'Não foi possível carregar a visita.' });
  }
});

router.patch('/:id', authorizeModule('visitantes', 3), async (req, res) => {
  try {
    const r = await patchAcompanhamento(req.params.id, req.body, req.user);
    if (r.erro) return res.status(400).json({ error: r.erro });
    if (r.naoEncontrada) return res.status(404).json({ error: 'Visita não encontrada.' });
    res.json(r.data);
  } catch (e) {
    res.status(500).json({ error: 'Não foi possível salvar.' });
  }
});

// soft-delete pela RPC da whitelist (lei nº 2) · nível 4
router.delete('/:id', authorizeModule('visitantes', 4), async (req, res) => {
  try {
    const { error } = await supabase.rpc('app_soft_delete', {
      p_table_name: 'vis_visitas', p_row_id: req.params.id,
      p_deleted_by: req.user?.userId || req.user?.id || null,
    });
    if (error) throw error;
    res.json({ ok: true });
  } catch (e) {
    console.error('[visitantes DELETE]', e.message);
    res.status(500).json({ error: 'Não foi possível excluir.', detalhe: e.message });
  }
});

module.exports = router;
module.exports.linhaParaCuidados = linhaParaCuidados;
