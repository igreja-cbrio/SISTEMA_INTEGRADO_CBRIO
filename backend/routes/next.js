// ============================================================================
// Módulo NEXT - rotas autenticadas
//
// Eventos:
//   GET    /eventos                       - lista eventos (com contagem)
//   POST   /eventos                       - criar evento
//   PUT    /eventos/:id                   - atualizar
//   POST   /eventos/auto-create-mes       - cria 3 eventos do mês (1o-3o domingo)
//
// Inscrições:
//   GET    /inscricoes                    - lista (filtros: evento_id, search, status)
//   GET    /inscricoes/:id                - detalhe
//   POST   /inscricoes                    - inscrever manualmente
//   PUT    /inscricoes/:id                - atualizar
//   POST   /inscricoes/:id/checkin        - marcar check-in
//   DELETE /inscricoes/:id/checkin        - desfazer check-in
//   POST   /inscricoes/:id/indicacoes     - { tipos: ['batismo', 'servir'...] }
//   GET    /indicacoes                    - lista de indicacoes pendentes
//   PUT    /indicacoes/:id                - atualizar status
//
// Dashboard:
//   GET    /dashboard                     - resumo do mês corrente
// ============================================================================

const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const { authenticate, authorizeModule } = require('../middleware/auth');
const { nivelGuardNext, ROUTE_KEY: NEXT_ROUTE_KEY } = require('../utils/nextGuardNivel');
const { supabase } = require('../utils/supabase');
const { notificar } = require('../services/notificar');
const { coletarTodos } = require('../services/kpiAutoCollector');
const { escapePostgrestValue } = require('../utils/sanitize');
const { direcionarMatricula, signDirecionarToken } = require('../services/nextDirecionar');
// Horários do batismo · o MESMO catálogo que a Integração gerencia na aba
// Batismos (`batismo_horarios`) e a MESMA régua do formulário público.
const { horariosDisponiveis } = require('../utils/batismoHorario');
const {
  horariosConfigurados: batismoHorariosConfigurados,
  ocupacaoPorHorario: batismoOcupacaoPorHorario,
  dataProximoBatismo,
} = require('../services/batismoHorarios');

// Re-calcula KPIs do NEXT em background (não bloqueia a resposta).
// Chamado após qualquer mudança em inscrições ou indicacoes.
function recalcularKpisNext(contexto) {
  // O coletor legado ainda agrega a rede inteira. Não recalcular como se fosse local.
  if (contexto && contexto.estado !== 'preparacao') return;
  setImmediate(async () => {
    try {
      await coletarTodos({ fontes: ['next.'] });
    } catch (e) {
      console.error('[next] erro ao recalcular KPIs:', e.message);
    }
  });
}

router.use(authenticate);

const { criarMiddlewareCampus } = require('../middleware/campus');
const { filtrarCampus, carimbarCampus } = require('../utils/campusQuery');
const { ErroCampus, responderErroCampus } = require('../services/campusContexto');
const { lerTodasPaginas } = require('../utils/campusPaginacao');
const contextoLeituraNext = criarMiddlewareCampus({ modulo: 'next', cobertura: { leitura: true, escrita: false } });

const contextoEscritaNext = criarMiddlewareCampus({ modulo: 'next', cobertura: { leitura: false, escrita: true } });
const UUID_CAMPUS_NEXT = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NEXT_SOFT_DELETE = new Set(['next_turmas', 'next_matriculas', 'mem_membros', 'cui_convertidos']);
function validarEscritaNext({ tabela, pai, campoPai, membro = false } = {}) {
  return async (req, res, next) => {
    try {
      carimbarCampus(req.body || {}, req.campus); // recusa tentar mover o ato por payload
      const buscar = async (nome, id) => {
        if (!UUID_CAMPUS_NEXT.test(id || '')) throw new ErroCampus(404, 'next_registro_ausente', 'Registro não encontrado neste campus.');
        let q = filtrarCampus(supabase.from(nome).select('*'), req.campus).eq('id', id);
        if (NEXT_SOFT_DELETE.has(nome)) q = q.is('deleted_at', null);
        const { data, error } = await q.maybeSingle();
        if (error) throw error;
        if (!data) throw new ErroCampus(404, 'next_registro_ausente', 'Registro não encontrado neste campus.');
        return data;
      };
      if (tabela) req.nextAtual = await buscar(tabela, req.params.id);
      if (pai && req.body?.[campoPai]) await buscar(pai, req.body[campoPai]);
      if (membro && req.body?.membro_id && req.body.membro_id !== req.nextAtual?.membro_id) {
        await buscar('mem_membros', req.body.membro_id);
      }
      return next();
    } catch (erro) { return responderErroCampus(res, erro); }
  };
}

function erroRpcNext(res, error) {
  const status = { P0400: 400, P0403: 403, P0404: 404, '23514': 409, '23505': 409, '22P02': 400 }[error.code] || 503;
  return res.status(status).json({ error: status === 503 ? 'Não foi possível concluir a operação do Next.' : error.message });
}

// ⚠️⚠️ Guard de MÓDULO (03/09/2026) — este arquivo rodou até hoje só com
// `authenticate`: qualquer autenticado do ERP escrevia no Next. Aplicado no
// router (e não rota a rota) de propósito: são ~40 endpoints e um novo nasce
// coberto por definição. A régua de nível mora em `utils/nextGuardNivel.js`.
// `POST /matriculas/backfill-membros` mantém o `podeBackfillNext` por cima —
// é mutação em lote e continua exigindo nível 3.
const guardNextLeitura = authorizeModule(NEXT_ROUTE_KEY, 1);
const guardNextEscrita = authorizeModule(NEXT_ROUTE_KEY, 2);
router.use((req, res, next) => (
  nivelGuardNext(req.method) === 2
    ? guardNextEscrita(req, res, next)
    : guardNextLeitura(req, res, next)
));

// ----------------------------------------------------------------------------
// Eventos
// ----------------------------------------------------------------------------
router.get('/eventos', contextoLeituraNext, async (req, res) => {
  const { ano, mes, status } = req.query;
  if ((ano && (!Number.isInteger(Number(ano)) || Number(ano) < 2000 || Number(ano) > 2200)) || (mes && (!ano || !Number.isInteger(Number(mes)) || Number(mes) < 1 || Number(mes) > 12))) {
    return res.status(400).json({ error: 'Ano ou mês inválido.' });
  }
  let q = filtrarCampus(supabase.from('next_eventos').select('*'), req.campus).order('data', { ascending: false });
  if (status) q = q.eq('status', status);
  if (ano) {
    const start = `${ano}-01-01`;
    const end = `${Number(ano) + 1}-01-01`;
    q = q.gte('data', start).lt('data', end);
  }
  if (mes && ano) {
    const m = String(mes).padStart(2, '0');
    const start = `${ano}-${m}-01`;
    const next = new Date(Date.UTC(Number(ano), Number(mes), 1)).toISOString().slice(0, 10);
    q = q.gte('data', start).lt('data', next);
  }
  const { data, error } = await q.limit(500);
  if (error) return res.status(500).json({ error: error.message });

  const ids = (data || []).map(e => e.id);
  const counts = {};
  try {
    for (let inicio = 0; inicio < ids.length; inicio += 100) {
      const rows = await lerTodasPaginas(() => filtrarCampus(supabase.from('next_inscricoes')
        .select('id,evento_id,check_in_at'), req.campus).in('evento_id', ids.slice(inicio, inicio + 100)).order('id'));
      for (const row of rows) {
        const count = counts[row.evento_id] || (counts[row.evento_id] = { inscritos: 0, checkins: 0 });
        count.inscritos += 1; if (row.check_in_at) count.checkins += 1;
      }
    }
  } catch { return res.status(503).json({ error: 'Não foi possível contar as inscrições do campus.' }); }
  res.json((data || []).map(e => ({
    ...e,
    inscritos: counts[e.id]?.inscritos || 0,
    checkins: counts[e.id]?.checkins || 0,
  })));
});

router.post('/eventos', contextoEscritaNext, validarEscritaNext(), async (req, res) => {
  const { data, titulo, observacoes, total_lista, presentes_impressa, presentes_manuscritos, arquivo_origem } = req.body || {};
  if (!data) return res.status(400).json({ error: 'Data obrigatória.' });
  const { data: row, error } = await supabase
    .from('next_eventos')
    .insert({
      igreja_id: req.campus.campus_id,
      data, titulo: titulo || null, observacoes: observacoes || null,
      total_lista: total_lista ?? null,
      presentes_impressa: presentes_impressa ?? null,
      presentes_manuscritos: presentes_manuscritos ?? null,
      arquivo_origem: arquivo_origem || null,
    })
    .select()
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(row);
});

router.put('/eventos/:id', contextoEscritaNext, validarEscritaNext({ tabela: 'next_eventos' }), async (req, res) => {
  const allowed = [
    'data', 'titulo', 'observacoes', 'status',
    'total_lista', 'presentes_impressa', 'presentes_manuscritos', 'arquivo_origem',
  ];
  const update = { updated_at: new Date().toISOString() };
  for (const [k, v] of Object.entries(req.body || {})) {
    if (allowed.includes(k)) update[k] = v;
  }
  const { data, error } = await supabase
    .from('next_eventos').update(update).eq('id', req.params.id).eq('igreja_id', req.campus.campus_id).select().maybeSingle();
  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.status(404).json({ error: 'Evento não encontrado.' });
  res.json(data);
});

// Cria os 3 primeiros domingos do mês informado (idempotente)
router.post('/eventos/auto-create-mes', contextoEscritaNext, validarEscritaNext(), async (req, res) => {
  const ano = req.body?.ano == null ? new Date().getFullYear() : Number(req.body.ano);
  const mes = req.body?.mes == null ? new Date().getMonth() + 1 : Number(req.body.mes);
  if (!Number.isInteger(ano) || ano < 2000 || ano > 2200 || !Number.isInteger(mes) || mes < 1 || mes > 12) {
    return res.status(400).json({ error: 'Ano ou mês inválido.' });
  }

  const datas = [];
  let cursor = new Date(Date.UTC(ano, mes - 1, 1));
  // primeiro domingo
  while (cursor.getUTCDay() !== 0) cursor.setUTCDate(cursor.getUTCDate() + 1);
  for (let i = 0; i < 3; i++) {
    datas.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 7);
  }

  const created = [];
  for (const d of datas) {
    const { data: row, error } = await supabase
      .from('next_eventos')
      .upsert({ igreja_id: req.campus.campus_id, data: d, titulo: `NEXT ${d}` }, { onConflict: 'igreja_id,data', ignoreDuplicates: true })
      .select();
    if (error) return res.status(503).json({ error: 'Não foi possível completar a criação dos eventos. Tente novamente.', created: created.length });
    if (row && row[0]) created.push(row[0]);
  }
  res.json({ ano, mes, datas, created: created.length });
});

// ----------------------------------------------------------------------------
// Inscrições
// ----------------------------------------------------------------------------
router.get('/inscricoes', contextoLeituraNext, async (req, res) => {
  const { evento_id, search, com_checkin, com_indicacao, origem_lista, limit } = req.query;
  const maxLimit = Math.max(1, Math.min(Math.floor(Number(limit) || 500), 5000));
  const consultar = () => {
  let q = filtrarCampus(supabase.from('next_inscricoes').select('*, evento:next_eventos(id, data, titulo)'), req.campus)
    .order('created_at', { ascending: false }).order('id');
  if (evento_id) q = q.eq('evento_id', evento_id);
  if (com_checkin === 'true') q = q.not('check_in_at', 'is', null);
  if (com_checkin === 'false') q = q.is('check_in_at', null);
  if (origem_lista && ['impressa', 'manuscrito'].includes(origem_lista)) q = q.eq('origem_lista', origem_lista);
  if (com_indicacao === 'true') {
    q = q.or('indicou_batismo.eq.true,indicou_servir.eq.true,indicou_grupo.eq.true,indicou_dizimo.eq.true');
  }
  if (search) {
    const s = `%${escapePostgrestValue(search)}%`;
    q = q.or(`nome.ilike.${s},sobrenome.ilike.${s},email.ilike.${s},cpf.ilike.${s}`);
  }
  return q;
  };
  try {
    const resultado = [];
    for (let inicio = 0; inicio < maxLimit; inicio += 1000) {
      const fim = Math.min(inicio + 999, maxLimit - 1);
      const { data, error } = await consultar().range(inicio, fim);
      if (error || !Array.isArray(data)) throw error || new Error('Resposta inválida.');
      resultado.push(...data);
      if (data.length < fim - inicio + 1) break;
    }
    res.json(resultado);
  } catch { res.status(503).json({ error: 'Não foi possível carregar as inscrições do campus.' }); }
});

router.get('/inscricoes/:id', contextoLeituraNext, async (req, res) => {
  const { data, error } = await supabase
    .from('next_inscricoes')
    .select('*, evento:next_eventos(*), indicacoes:next_indicacoes(*)')
    .eq('igreja_id', req.campus.campus_id).eq('id', req.params.id)
    .maybeSingle();
  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.status(404).json({ error: 'Inscrição não encontrada' });
  res.json(data);
});

const { acharOuCriarGuardado } = require('../services/membroMatch');
const { reconciliarCpfTardio } = require('../services/cpfReconciliar');
const { normalizarCpf, cpfValido } = require('../utils/cpf');
const { resolverPessoaRegistro } = require('../services/campusPessoaRegistro');

router.post('/inscricoes', contextoEscritaNext, validarEscritaNext({ pai: 'next_eventos', campoPai: 'evento_id' }), async (req, res) => {
  const { evento_id, nome, sobrenome, cpf, telefone, email, data_nascimento, observacoes, origem_lista } = req.body || {};
  if (!nome || !evento_id) return res.status(400).json({ error: 'nome e evento_id obrigatórios' });
  const cleanCpf = cpf ? String(cpf).replace(/\D/g, '') : null;
  if (String(cpf || '').trim() && (!cleanCpf || !cpfValido(cleanCpf))) return res.status(400).json({ error: 'CPF inválido — confira os dígitos.' });
  const validOrigemLista = ['impressa', 'manuscrito'].includes(origem_lista) ? origem_lista : null;

  // ANTES de criar a inscrição: garantir que existe mem_membros (cria se necessário).
  // Membresia e fonte única — toda pessoa que se inscreve no NEXT vira membro
  // (status='visitante' no mínimo) e fica acessivel em /ministerial/membresia.
  let membro_id = null;
  try {
    const r = await acharOuCriarGuardado({
      cpf: cleanCpf, email, telefone,
      nome: [nome, sobrenome].filter(Boolean).join(' '),
      dataNascimento: data_nascimento || null,
      status: 'visitante',
      origem: 'next_inscricao_interna', extra: { igreja_id: req.campus.campus_id },
    });
    if (!r?.membro_id) throw new Error('Identidade indisponível.');
    membro_id = r.membro_id;
  } catch (e) {
    console.error('next/inscricoes acharOuCriarGuardado failed:', e.message);
    return res.status(503).json({ error: 'Não foi possível vincular a identidade. Tente novamente.' });
  }

  const { data, error } = await supabase
    .from('next_inscricoes')
    .insert({
      igreja_id: req.campus.campus_id, evento_id, nome, sobrenome: sobrenome || null, cpf: cleanCpf,
      telefone: telefone ? String(telefone).replace(/\D/g, '') : null, email: email ? String(email).trim().toLowerCase() : null,
      data_nascimento: data_nascimento || null, observacoes: observacoes || null,
      origem: 'manual', origem_lista: validOrigemLista,
      registered_by: req.user?.id || null,
      membro_id,
    })
    .select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

router.put('/inscricoes/:id', contextoEscritaNext, validarEscritaNext({ tabela: 'next_inscricoes', pai: 'next_eventos', campoPai: 'evento_id' }), async (req, res) => {
  const b = req.body || {}, atual = req.nextAtual, update = { updated_at: new Date().toISOString() };
  const allowed = ['nome', 'sobrenome', 'cpf', 'telefone', 'email', 'data_nascimento', 'observacoes', 'evento_id',
    'ja_batizado', 'ja_voluntario', 'ja_doador', 'origem_lista'];
  for (const [k, v] of Object.entries(b)) if (allowed.includes(k)) update[k] = v;
  if ('cpf' in b) {
    const digits = String(b.cpf || '').replace(/\D/g, '');
    if (String(b.cpf || '').trim() && (!digits || (digits !== String(atual.cpf || '').replace(/\D/g, '') && !cpfValido(digits)))) return res.status(400).json({ error: 'CPF inválido.' });
    update.cpf = digits || null;
  }
  if ('telefone' in b) update.telefone = String(b.telefone || '').replace(/\D/g, '') || null;
  if ('email' in b) update.email = String(b.email || '').trim().toLowerCase() || null;
  try {
    if (['nome','sobrenome','cpf','telefone','email','data_nascimento'].some(k => k in b)) {
      const pessoa = { ...atual, ...update };
      pessoa.nome = [pessoa.nome, pessoa.sobrenome].filter(Boolean).join(' ');
      if (atual.membro_id) {
        // Contato/nascimento novo só entra quando informado nesta edição.
        pessoa.telefone = update.telefone; pessoa.email = update.email; pessoa.data_nascimento = update.data_nascimento;
        pessoa.cpf = update.cpf !== String(atual.cpf || '').replace(/\D/g, '') ? update.cpf : undefined;
      }
      update.membro_id = await resolverPessoaRegistro(pessoa, req.campus, 'next_inscricao_edicao', {
        supabase, membroVinculado: atual.membro_id, matcher: acharOuCriarGuardado, reconciliar: reconciliarCpfTardio,
      });
    }
    let query = supabase.from('next_inscricoes').update(update).eq('id', req.params.id).eq('igreja_id', req.campus.campus_id);
    query = atual.membro_id ? query.eq('membro_id', atual.membro_id) : query.is('membro_id', null);
    const { data, error } = await query.select().maybeSingle();
    if (error) return erroRpcNext(res, error);
    if (!data) return res.status(409).json({ error: 'Inscrição alterada; atualize os dados e tente novamente.' });
    res.json(data);
  } catch (erro) { return responderErroCampus(res, erro); }
});

// ----------------------------------------------------------------------------
// Check-in
// ----------------------------------------------------------------------------
router.post('/inscricoes/:id/checkin', contextoEscritaNext, validarEscritaNext({ tabela: 'next_inscricoes' }), async (req, res) => {
  const { data, error } = await supabase
    .from('next_inscricoes')
    .update({
      check_in_at: new Date().toISOString(),
      check_in_by: req.user?.id || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', req.params.id).eq('igreja_id', req.campus.campus_id)
    .select()
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

router.delete('/inscricoes/:id/checkin', contextoEscritaNext, validarEscritaNext({ tabela: 'next_inscricoes' }), async (req, res) => {
  const { error } = await supabase
    .from('next_inscricoes')
    .update({ check_in_at: null, check_in_by: null, updated_at: new Date().toISOString() })
    .eq('id', req.params.id).eq('igreja_id', req.campus.campus_id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

// ----------------------------------------------------------------------------
// Indicacoes (batismo, servir, grupo, dizimo)
// ----------------------------------------------------------------------------
const TIPOS_AREA = {
  batismo: { area: 'integracao', flag: 'indicou_batismo', titulo: 'Nova indicacao de batismo no NEXT' },
  servir: { area: 'voluntariado', flag: 'indicou_servir', titulo: 'Nova indicacao para servir no NEXT' },
  grupo: { area: 'grupos', flag: 'indicou_grupo', titulo: 'Nova indicacao de grupo no NEXT' },
  dizimo: { area: 'generosidade', flag: 'indicou_dizimo', titulo: 'Nova indicacao de dizimo no NEXT' },
};

router.post('/inscricoes/:id/indicacoes', async (req, res) => {
  try {
    const { tipos = [], observacoes } = req.body || {};
    if (!Array.isArray(tipos) || tipos.length === 0) {
      return res.status(400).json({ error: 'Informe ao menos um tipo' });
    }
    const validos = tipos.filter(t => TIPOS_AREA[t]);
    if (validos.length === 0) return res.status(400).json({ error: 'Nenhum tipo valido' });

    // Atualiza flags na inscrição
    const update = {
      indicacao_observacoes: observacoes || null,
      indicacao_marcada_em: new Date().toISOString(),
      indicacao_marcada_por: req.user?.id || null,
      updated_at: new Date().toISOString(),
    };
    for (const t of validos) update[TIPOS_AREA[t].flag] = true;

    const { data: insc, error: e1 } = await supabase
      .from('next_inscricoes')
      .update(update)
      .eq('id', req.params.id)
      .select()
      .single();
    if (e1) return res.status(500).json({ error: e1.message });

    // Cria/atualiza indicacoes (1 por tipo)
    const linhas = validos.map(t => ({
      inscricao_id: req.params.id,
      tipo: t,
      area_destino: TIPOS_AREA[t].area,
      observacoes: observacoes || null,
      status: 'pendente',
    }));

    for (const linha of linhas) {
      await supabase
        .from('next_indicacoes')
        .upsert(linha, { onConflict: 'inscricao_id,tipo' });
    }

    // Fase 2 · ponte pra caixa unificada de encaminhamentos: grupo/servir viram
    // encaminhamento na MESMA caixa que Grupos/Voluntariado já trabalham (com
    // devolutiva + "engajou" materializando o vínculo na NSM). batismo→Integração
    // e dízimo→generosidade seguem só em next_indicacoes (sem caixa consumidora).
    const CONVERGE = {
      grupo:  { destino: 'grupos',      valor_alvo: 'conectar', link: '/grupos' },
      servir: { destino: 'voluntarios', valor_alvo: 'servir',   link: '/ministerial/voluntariado/encaminhados' },
    };
    const nomeCompleto = `${insc.nome || ''} ${insc.sobrenome || ''}`.trim() || insc.nome || 'Sem nome';
    for (const t of validos) {
      const cv = CONVERGE[t];
      if (!cv) continue;
      try {
        // idempotente: 1 encaminhamento por (inscrição × destino)
        const { data: jaTem } = await supabase
          .from('jornada_encaminhamentos')
          .select('id')
          .eq('next_inscricao_id', req.params.id)
          .eq('destino', cv.destino)
          .is('deleted_at', null)
          .limit(1).maybeSingle();
        if (jaTem) continue;
        await supabase.from('jornada_encaminhamentos').insert({
          origem: 'next',
          next_inscricao_id: req.params.id,
          membro_id: insc.membro_id || null,
          nome: nomeCompleto,
          telefone: insc.telefone || null,
          destino: cv.destino,
          valor_alvo: cv.valor_alvo,
          observacao: observacoes || null,
          encaminhado_por: req.user?.id || null,
        });
      } catch (e) { console.error('[next] encaminhamento:', e.message); }
    }

    // Notificar áreas · grupo/servir levam pra caixa da área (devolutiva lá)
    for (const t of validos) {
      try {
        await notificar({
          modulo: TIPOS_AREA[t].area,
          titulo: TIPOS_AREA[t].titulo,
          mensagem: `${insc.nome} ${insc.sobrenome || ''} indicou ${t} no NEXT.`,
          link: CONVERGE[t]?.link || '/ministerial/next?tab=indicacoes',
        });
      } catch (e) { console.error('[next] notificar:', e.message); }
    }

    // Recalcula KPIs do NEXT em background (não bloqueia)
    recalcularKpisNext();

    res.json({ ok: true, indicacoes: linhas.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ----------------------------------------------------------------------------
// Direcionar pros valores DENTRO do Next (Fase 1B · Marcos · 2026-06-25)
// POST /matriculas/:id/direcionar  body: { destinos: ['grupos','voluntarios','batismo','devocional'] }
// A inversão: o direcionamento do convertido pros valores saiu do Cuidados e vem pra cá.
//   grupos/voluntarios → encaminhamento (origem='next') na caixa da área (devolutiva lá ·
//                        "engajou" materializa o vínculo na NSM). Ligado à matrícula.
//   batismo            → inscrição pendente em batismo_inscricoes REUSANDO membro_id (sem duplicar).
//   devocional         → só registra a escolha (flag · estatística). 1º acesso/leitura = Fase 2.
// NÃO marca engajamento (NSM conta o sinal real). Dedup por matrícula × destino.
// ----------------------------------------------------------------------------
router.post('/matriculas/:id/direcionar', contextoEscritaNext, async (req, res) => {
  try {
    const b = req.body || {};
    const r = await direcionarMatricula({
      matriculaId: req.params.id,
      campus: req.campus,
      destinos: b.destinos || [],
      areas: b.areas || [], // "Servir" abre a escolha de áreas (Totem / self-service)
      // "Batismo" abre a escolha do HORÁRIO (obrigatório · 13/08) — mesma
      // mecânica das áreas do "Servir".
      horarioBatismo: b.horario_batismo || null,
      userId: req.user?.id || null,
    });
    recalcularKpisNext(req.campus);
    res.json(r);
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message, codigo: e.codigo, campo: e.campo });
  }
});

// GET /batismo-horarios — horários ABERTOS e COM VAGA pro próximo batismo.
// Alimenta o seletor que aparece ao marcar "Quero me batizar" no direcionamento
// (aba Pessoas e Totem do Next). ⚠️ Lê o MESMO catálogo que a Integração
// gerencia (`batismo_horarios`) pela MESMA régua do formulário público — uma 2ª
// lista aqui ofereceria horário que o servidor recusa no envio.
router.get('/batismo-horarios', contextoLeituraNext, async (req, res) => {
  try {
    const dataBatismo = await dataProximoBatismo({ campusId: req.campus.campus_id });
    const configurados = await batismoHorariosConfigurados({ campusId: req.campus.campus_id });
    // ⚠️ Falha FECHADA e DECLARADA: sem catálogo/data devolve lista vazia com
    // `indisponivel`, nunca "não há horário" — a tela precisa distinguir "a
    // equipe fechou tudo" de "não conseguimos ler agora".
    if (!dataBatismo || configurados === null) {
      return res.json({ data_batismo: dataBatismo || null, horarios: [], indisponivel: true });
    }
    const ocup = await batismoOcupacaoPorHorario(dataBatismo, { campusId: req.campus.campus_id });
    res.json({ data_batismo: dataBatismo, horarios: horariosDisponiveis(configurados, ocup) });
  } catch (e) {
    console.error('[next] batismo-horarios:', e.message);
    res.json({ data_batismo: null, horarios: [], indisponivel: true });
  }
});

// GET /direcionar-qr — token FIXO pro QR de direcionamento (resolve a turma aberta · Fase 2a)
router.get('/direcionar-qr', contextoLeituraNext, async (req, res) => {
  try {
    const token = signDirecionarToken(req.campus);
    if (!token) return res.status(503).json({ error: 'QR indisponível (CRON_SECRET ausente no servidor)' });
    res.json({ token });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/indicacoes', contextoLeituraNext, async (req, res) => {
  const { tipo, status, area } = req.query;
  let q = supabase
    .from('next_indicacoes')
    .select('*, inscricao:next_inscricoes!inner(id, nome, sobrenome, email, telefone, evento_id, evento:next_eventos(data))')
    .eq('inscricao.igreja_id', req.campus.campus_id)
    .order('created_at', { ascending: false })
    .limit(500);
  if (tipo) q = q.eq('tipo', tipo);
  if (status) q = q.eq('status', status);
  if (area) q = q.eq('area_destino', area);
  const { data, error } = await q;
  if (error) return res.status(500).json({ error: error.message });
  res.json(data || []);
});

router.put('/indicacoes/:id', async (req, res) => {
  const allowed = ['status', 'observacoes', 'atendido_por', 'atendido_em'];
  const update = { updated_at: new Date().toISOString() };
  for (const [k, v] of Object.entries(req.body || {})) {
    if (allowed.includes(k)) update[k] = v;
  }
  if (req.body?.status === 'concluido' && !update.atendido_em) {
    update.atendido_em = new Date().toISOString();
    update.atendido_por = req.user?.id || null;
  }
  const { data, error } = await supabase
    .from('next_indicacoes').update(update).eq('id', req.params.id).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// ----------------------------------------------------------------------------
// Dashboard
// ----------------------------------------------------------------------------
router.get('/dashboard', contextoLeituraNext, async (req, res) => {
  const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit' }).format(new Date());
  const [ano, mes] = hoje.split('-').map(Number);
  const inicioMes = `${hoje}-01`;
  const inicioProxMes = new Date(Date.UTC(ano, mes, 1)).toISOString().slice(0, 10);
  try {
    const [eventos, inscricoesMes, checkinsMes, indicPendentes] = await Promise.all([
      lerTodasPaginas(() => filtrarCampus(supabase.from('next_eventos').select('id,data,status'), req.campus).gte('data', inicioMes).lt('data', inicioProxMes).order('id')),
      filtrarCampus(supabase.from('next_inscricoes').select('id', { count: 'exact', head: true }), req.campus)
        .gte('created_at', `${inicioMes}T00:00:00-03:00`).lt('created_at', `${inicioProxMes}T00:00:00-03:00`),
      filtrarCampus(supabase.from('next_inscricoes').select('id', { count: 'exact', head: true }), req.campus)
        .gte('check_in_at', `${inicioMes}T00:00:00-03:00`).lt('check_in_at', `${inicioProxMes}T00:00:00-03:00`),
      supabase.from('next_indicacoes').select('id,inscricao:next_inscricoes!inner(igreja_id)', { count: 'exact', head: true })
        .eq('inscricao.igreja_id', req.campus.campus_id).eq('status', 'pendente'),
    ]);
    if ([inscricoesMes, checkinsMes, indicPendentes].some(r => r.error || !Number.isInteger(r.count))) throw new Error('Contagem indisponível.');
    res.json({ eventos_mes: eventos, inscricoes_mes: inscricoesMes.count, checkins_mes: checkinsMes.count, indicacoes_pendentes: indicPendentes.count });
  } catch { res.status(503).json({ error: 'Não foi possível carregar o resumo do campus.' }); }
});

// ----------------------------------------------------------------------------
// TURMAS · Next como coorte de UM encontro com presença (desde 26/08/2026 ·
// era 2 encontros). Uma turma por domingo, sempre no culto de 09:30.
//   "formado" = presente em TODOS os encontros da turma (hoje: no único).
//   turma_id NULL numa matrícula = fila de espera (encaixe manual depois).
// ----------------------------------------------------------------------------

// Recalcula status (formado/matriculado) das matrículas de uma turma a partir
// das presenças. NÃO seta 'incompleto' (isso só ao encerrar) nem mexe em 'desistiu'.
// Exceção: quem já está 'incompleto' (turma encerrada) e AGORA aparece presente
// em todos os encontros — porque a presença foi lançada depois do encerramento —
// é PROMOVIDO a 'formado'. Nunca rebaixa 'incompleto' de volta pra 'matriculado'
// (a turma está encerrada; quem não completou permanece incompleto).
async function recomputarStatusTurma(turmaId) {
  if (!turmaId) return;
  const { data: encontros } = await supabase.from('next_encontros').select('id').eq('turma_id', turmaId);
  const encIds = (encontros || []).map(e => e.id);
  const totalEnc = encIds.length;
  const { data: mats } = await supabase
    .from('next_matriculas').select('id, status').eq('turma_id', turmaId).is('deleted_at', null);
  if (!mats || !mats.length) return;
  const presByMat = {};
  if (encIds.length) {
    const { data: pres } = await supabase.from('next_presencas').select('matricula_id, presente').in('encontro_id', encIds);
    (pres || []).forEach(p => { if (p.presente) presByMat[p.matricula_id] = (presByMat[p.matricula_id] || 0) + 1; });
  }
  for (const m of mats) {
    if (m.status === 'desistiu') continue;
    const n = presByMat[m.id] || 0;
    const completo = totalEnc > 0 && n >= totalEnc;
    if (m.status === 'incompleto') {
      // turma encerrada: só promove quando de fato completou; senão fica incompleto
      if (completo) {
        await supabase.from('next_matriculas').update({ status: 'formado', updated_at: new Date().toISOString() }).eq('id', m.id);
      }
      continue;
    }
    const novo = completo ? 'formado' : 'matriculado';
    if (novo !== m.status) {
      await supabase.from('next_matriculas').update({ status: novo, updated_at: new Date().toISOString() }).eq('id', m.id);
    }
  }
}

// GET /turmas — lista turmas ativas + contagens (matriculados/formados/encontros)
router.get('/turmas', contextoLeituraNext, async (req, res) => {
  const { status } = req.query;
  let q = filtrarCampus(supabase.from('next_turmas').select('*'), req.campus).is('deleted_at', null).order('created_at', { ascending: false });
  if (status) q = q.eq('status', status);
  const { data: turmas, error } = await q.limit(500);
  if (error) return res.status(500).json({ error: error.message });
  const ids = (turmas || []).map(t => t.id);
  const cont = {};
  if (ids.length) {
    // pagina (evita o cap de 1000 do PostgREST quando há muito histórico)
    const mats = [];
    for (let from = 0; ; from += 1000) {
      const { data: chunk, error: e2 } = await filtrarCampus(supabase.from('next_matriculas').select('turma_id, status'), req.campus).is('deleted_at', null)
        .in('turma_id', ids).order('id').range(from, from + 999);
      if (e2) return res.status(503).json({ error: 'Não foi possível carregar as matrículas do campus.' });
      if (!chunk || !chunk.length) break;
      mats.push(...chunk);
      if (chunk.length < 1000) break;
    }
    mats.forEach(m => {
      const c = cont[m.turma_id] || (cont[m.turma_id] = { total: 0, formado: 0, matriculado: 0, incompleto: 0, desistiu: 0, encontros: 0 });
      c.total += 1; if (c[m.status] !== undefined) c[m.status] += 1;
    });
    let encs;
    try { encs = await lerTodasPaginas(() => filtrarCampus(supabase.from('next_encontros').select('turma_id, data'), req.campus).in('turma_id', ids).order('id')); }
    catch { return res.status(503).json({ error: 'Não foi possível carregar os encontros do campus.' }); }
    (encs || []).forEach(e => {
      const c = cont[e.turma_id] || (cont[e.turma_id] = { total: 0, encontros: 0 });
      c.encontros = (c.encontros || 0) + 1;
      // guarda a data do 1º encontro (competência de fallback p/ ordenação)
      if (e.data && (!c.primeiro_encontro || e.data < c.primeiro_encontro)) c.primeiro_encontro = e.data;
    });
  }
  const lista = (turmas || []).map(t => ({ ...t, contagem: cont[t.id] || { total: 0, encontros: 0 } }));
  // Ordem por DATA DE COMPETÊNCIA (mês mais recente primeiro). Chave: origem_mes →
  // se nulo, o mês do 1º encontro (cobre a 2ª turma do mês, que não pode repetir
  // origem_mes pela constraint única) → por fim a data de criação. Desempate por
  // nome (mantém "Julho/01" antes de "Julho/02" no mesmo mês).
  const chave = t => t.origem_mes
    || (t.contagem?.primeiro_encontro ? String(t.contagem.primeiro_encontro).slice(0, 7) : '')
    || String(t.created_at || '').slice(0, 7);
  lista.sort((a, b) => {
    const ka = chave(a), kb = chave(b);
    if (ka !== kb) return kb < ka ? -1 : 1;
    return String(a.nome || '').localeCompare(String(b.nome || ''), 'pt');
  });
  res.json(lista);
});

// GET /satisfacao — pesquisa NPS canônica do Next (Satisfação do Next).
// UMA pesquisa única (contexto_kpi='nps_next', area='next') servida por QR por
// turma (mesmo link + ?turma=<id>). Provisiona a pesquisa na 1ª chamada.
// Declarada ANTES de /turmas/:id — mas '/satisfacao' não colide com rotas
// prefixadas, então é seguro aqui.
router.get('/satisfacao', async (req, res) => {
  try {
    // Sempre pega a MAIS ANTIGA (se uma corrida criar duplicata, o GET converge
    // sempre pra mesma pesquisa canônica).
    const buscar = () => supabase
      .from('nps_pesquisas')
      .select('id, titulo, link_publico_token, status, permite_publico')
      .eq('contexto_kpi', 'nps_next')
      .eq('area', 'next')
      .is('deleted_at', null)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();

    let { data: pesquisa, error } = await buscar();
    if (error) throw error;

    if (!pesquisa) {
      // Cria a pesquisa canônica (mesma forma do POST /nps em routes/nps.js).
      const token = crypto.randomBytes(18).toString('base64url');
      const insert = {
        titulo: 'Satisfação do Next',
        valor: null,
        objetivo: 'Medir a satisfação de quem passou pelo Next, por turma.',
        contexto_kpi: 'nps_next',
        area: 'next',
        perguntas: {
          descricao_curta: 'Conta pra gente como foi sua experiência no Next.',
          pergunta_nps: {
            id: 'nps',
            tipo: 'nps',
            texto: 'De 0 a 10, o quanto você recomendaria o Next para um amigo?',
          },
          perguntas_extras: [
            { id: crypto.randomUUID(), tipo: 'escala_5', texto: 'Como você avalia os encontros?' },
            { id: crypto.randomUUID(), tipo: 'texto_longo', texto: 'O que podemos melhorar?' },
          ],
        },
        link_publico_token: token,
        permite_publico: true,
        data_inicio: new Date().toISOString().slice(0, 10),
        data_fim: null,
        status: 'ativa',
        criado_por: req.user?.id || null,
      };
      const { data: criada, error: insErr } = await supabase
        .from('nps_pesquisas')
        .insert(insert)
        .select('id, titulo, link_publico_token, status, permite_publico')
        .single();
      if (insErr) {
        // Corrida: outra requisição criou ao mesmo tempo → re-busca a canônica.
        const { data: reBusca } = await buscar();
        if (reBusca) pesquisa = reBusca;
        else throw insErr;
      } else {
        pesquisa = criada;
      }
    }

    res.json({
      id: pesquisa.id,
      titulo: pesquisa.titulo,
      link_publico_token: pesquisa.link_publico_token,
      status: pesquisa.status,
      permite_publico: pesquisa.permite_publico,
    });
  } catch (e) {
    console.error('[next] satisfacao:', e.message);
    res.status(500).json({ error: 'Erro ao obter a pesquisa de satisfação' });
  }
});

// GET /lista-espera — contagem de inscritos SEM turma (aguardando a próxima
// turma abrir). São puxados automaticamente quando uma turma nova é aberta.
router.get('/lista-espera', contextoLeituraNext, async (req, res) => {
  // Fila de espera = matrículas sem turma (turma_id NULL). Retorna a LISTA de
  // pessoas (pros responsáveis alocarem numa turma) + a contagem.
  const { data, error } = await filtrarCampus(supabase.from('next_matriculas')
    .select('id, nome, sobrenome, telefone, email, cpf, membro_id, observacoes, created_at'), req.campus)
    .is('turma_id', null).is('deleted_at', null)
    .order('created_at', { ascending: true })
    .limit(1000);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ count: (data || []).length, pessoas: data || [] });
});

// POST /turmas — cria turma (+ o encontro · default 1 desde 26/08/2026)
router.post('/turmas', contextoEscritaNext, validarEscritaNext(), async (req, res) => {
  const b = req.body || {};
  const { data, error } = await supabase.rpc('fn_campus_next_criar_turma', {
    p_igreja_id: req.campus.campus_id, p_nome: b.nome || null,
    p_responsavel_id: b.responsavel_id || null, p_observacoes: b.observacoes || null,
    p_encontros: Array.isArray(b.encontros) && b.encontros.length ? b.encontros : [{ numero: 1 }],
    p_auto_domingo: null, p_puxar_fila: true,
  });
  if (error) return erroRpcNext(res, error);
  res.status(201).json(data);
});

// GET /turmas/:id — detalhe (encontros + matrículas + presenças)
router.get('/turmas/:id', contextoLeituraNext, async (req, res) => {
  const { id } = req.params;
  try {
    const { data: turma, error } = await filtrarCampus(supabase.from('next_turmas').select('*'), req.campus).eq('id', id).is('deleted_at', null).maybeSingle();
    if (error) throw error;
    if (!turma) return res.status(404).json({ error: 'Turma não encontrada' });
    const encontros = await lerTodasPaginas(() => filtrarCampus(supabase.from('next_encontros').select('*'), req.campus).eq('turma_id', id).order('numero').order('id'));
    const matriculas = await lerTodasPaginas(() => filtrarCampus(supabase.from('next_matriculas').select('*'), req.campus).eq('turma_id', id).is('deleted_at', null).order('nome').order('id'));
    const presencas = [];
    // Lotes limitam o tamanho da URL PostgREST, além da paginação das presenças.
    for (let inicio = 0; inicio < encontros.length; inicio += 100) {
      const ids = encontros.slice(inicio, inicio + 100).map(e => e.id);
      presencas.push(...await lerTodasPaginas(() => filtrarCampus(supabase.from('next_presencas').select('*'), req.campus).in('encontro_id', ids).order('id')));
    }
    res.json({ ...turma, encontros, matriculas, presencas });
  } catch { res.status(503).json({ error: 'Não foi possível carregar os dados da turma.' }); }
});

// PATCH /turmas/:id — atualizar. Ao encerrar, não-formados viram 'incompleto'.
router.patch('/turmas/:id', contextoEscritaNext, validarEscritaNext({ tabela: 'next_turmas' }), async (req, res) => {
  const { data, error } = await supabase.rpc('fn_campus_next_atualizar_turma', {
    p_id: req.params.id, p_igreja_id: req.campus.campus_id, p_patch: req.body || {},
  });
  if (error) return erroRpcNext(res, error);
  res.json(data);
});

// DELETE /turmas/:id — soft delete
router.delete('/turmas/:id', contextoEscritaNext, validarEscritaNext({ tabela: 'next_turmas' }), async (req, res) => {
  const { data, error } = await supabase.rpc('fn_campus_soft_delete_next', {
    p_tabela: 'next_turmas', p_id: req.params.id, p_igreja_id: req.campus.campus_id, p_usuario_id: req.user.id,
  });
  if (error) return erroRpcNext(res, error);
  if (!data) return res.status(404).json({ error: 'Registro não encontrado neste campus.' });
  res.json({ ok: true });
});

// PATCH /encontros/:id — editar data/tema do encontro
router.patch('/encontros/:id', contextoEscritaNext, validarEscritaNext({ tabela: 'next_encontros' }), async (req, res) => {
  const b = req.body || {};
  const patch = {};
  ['numero', 'data', 'tema', 'observacoes'].forEach(k => { if (k in b) patch[k] = b[k]; });
  const { data, error } = await supabase.from('next_encontros').update(patch).eq('id', req.params.id).eq('igreja_id', req.campus.campus_id).select().maybeSingle();
  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.status(404).json({ error: 'Encontro não encontrado.' });
  res.json(data);
});

// PUT /encontros/:id/presencas — define os presentes { matricula_ids: [] } e
// recalcula o status das matrículas da turma. Idempotente (regrava o conjunto).
router.put('/encontros/:id/presencas', contextoEscritaNext, validarEscritaNext({ tabela: 'next_encontros' }), async (req, res) => {
  const ids = req.body?.matricula_ids;
  if (!Array.isArray(ids) || ids.length > 5000 || ids.some(id => !UUID_CAMPUS_NEXT.test(id))) {
    return res.status(400).json({ error: 'Lista de matrículas inválida.' });
  }
  const { data, error } = await supabase.rpc('fn_campus_next_presencas', {
    p_encontro_id: req.params.id, p_igreja_id: req.campus.campus_id,
    p_matricula_ids: ids, p_modo: 'substituir',
  });
  if (error) return erroRpcNext(res, error);
  recalcularKpisNext(req.campus);
  res.json(data);
});

router.post('/encontros/:id/presenca', contextoEscritaNext, validarEscritaNext({ tabela: 'next_encontros' }), async (req, res) => {
  if (!UUID_CAMPUS_NEXT.test(req.body?.matricula_id || '')) return res.status(400).json({ error: 'Matrícula inválida.' });
  const { data, error } = await supabase.rpc('fn_campus_next_presencas', {
    p_encontro_id: req.params.id, p_igreja_id: req.campus.campus_id,
    p_matricula_ids: [req.body.matricula_id], p_modo: req.body.presente === false ? 'desmarcar' : 'marcar',
  });
  if (error) return erroRpcNext(res, error);
  recalcularKpisNext(req.campus);
  res.json(data);
});

// GET /matriculas?turma_id=&fila=true&search= — lista
router.get('/matriculas', contextoLeituraNext, async (req, res) => {
  const { turma_id, fila, search } = req.query;
  let q = filtrarCampus(supabase.from('next_matriculas').select('*'), req.campus).is('deleted_at', null);
  if (fila === 'true') q = q.is('turma_id', null);
  else if (turma_id) q = q.eq('turma_id', turma_id);
  if (search) {
    const s = escapePostgrestValue(String(search));
    q = q.or(`nome.ilike.%${s}%,sobrenome.ilike.%${s}%,email.ilike.%${s}%,telefone.ilike.%${s}%`);
  }
  const { data, error } = await q.order('created_at', { ascending: false }).limit(1000);
  if (error) return res.status(500).json({ error: error.message });
  res.json(data || []);
});

// POST /matriculas — matricular (turma_id opcional = fila)
router.post('/matriculas', contextoEscritaNext, validarEscritaNext({ pai: 'next_turmas', campoPai: 'turma_id', membro: true }), async (req, res) => {
  const b = req.body || {};
  if (!b.nome || !String(b.nome).trim()) return res.status(400).json({ error: 'nome obrigatório' });
  if (!b.membro_id && String(b.cpf || '').trim() && !cpfValido(b.cpf)) {
    return res.status(400).json({ error: 'CPF inválido — confira os dígitos' });
  }
  // Porta guardada: sem membro_id explícito, resolve/cria via matcher forte
  // (cpf>email>tel+nome>nome+nasc · cria stub se não achar). Não deixa órfão —
  // toda matrícula fica ligada a um mem_membros e acessível em /membresia.
  let membro_id = b.membro_id || null;
  if (membro_id) {
    try {
      membro_id = await resolverPessoaRegistro({ ...b, nome: [b.nome, b.sobrenome].filter(Boolean).join(' ') }, req.campus, 'next_matricula', { supabase, matcher: acharOuCriarGuardado, reconciliar: reconciliarCpfTardio });
    } catch (erro) { return responderErroCampus(res, erro); }
  } else {
    try {
      const r = await acharOuCriarGuardado({
        cpf: b.cpf, email: b.email, telefone: b.telefone,
        nome: [b.nome, b.sobrenome].filter(Boolean).join(' '),
        dataNascimento: b.data_nascimento || null, status: 'visitante',
        origem: 'next_matricula', origemId: b.id, extra: { igreja_id: req.campus.campus_id },
      });
      if (!r?.membro_id) throw new Error('Identidade indisponível.');
      membro_id = r.membro_id;
    } catch (e) { console.error('[next/matriculas] matcher:', e.message); return res.status(503).json({ error: 'Não foi possível vincular a identidade. Tente novamente.' }); }
  }
  const row = {
    igreja_id: req.campus.campus_id,
    turma_id: b.turma_id || null,
    nome: String(b.nome).trim(), sobrenome: b.sobrenome || null,
    // digits-only: CPF com máscara fura o UNIQUE(turma_id,cpf) e todo matching
    cpf: normalizarCpf(b.cpf), telefone: b.telefone ? String(b.telefone).replace(/\D/g, '') : null, email: b.email ? String(b.email).trim().toLowerCase() : null,
    data_nascimento: b.data_nascimento || null, observacoes: b.observacoes || null,
    membro_id,
    ja_batizado: !!b.ja_batizado, ja_voluntario: !!b.ja_voluntario, ja_doador: !!b.ja_doador,
    indicou_batismo: !!b.indicou_batismo, indicou_servir: !!b.indicou_servir,
    indicou_grupo: !!b.indicou_grupo, indicou_dizimo: !!b.indicou_dizimo,
    origem: 'manual', registered_by: req.user?.id ?? null,
  };
  const { data, error } = await supabase.from('next_matriculas').insert(row).select().single();
  if (error) return res.status(500).json({ error: error.message });
  recalcularKpisNext(req.campus);
  res.status(201).json(data);
});

// Quem pode rodar o backfill de vínculos (mutação em lote que cria membros).
function podeBackfillNext(req) {
  const r = req.user?.role;
  if (r === 'admin' || r === 'diretor') return true;
  const mp = req.user?.granular?.modulePerms || {};
  return (mp.next?.escrita || 0) >= 3 || (mp.integracao?.escrita || 0) >= 3;
}

// POST /matriculas/backfill-membros — liga as matrículas órfãs (membro_id NULL) a
// um membro via o matcher forte (cpf>email>tel+nome>nome+nasc · cria stub se não achar).
// Fecha o buraco dos "órfãos sem membro_id" no funil. Idempotente (re-rodar é seguro).
router.post('/matriculas/backfill-membros', async (req, res) => {
  if (!podeBackfillNext(req)) return res.status(403).json({ error: 'Sem permissão para vincular em lote' });
  try {
    const orfas = await fetchAllNext('next_matriculas',
      'id, nome, sobrenome, cpf, telefone, email, data_nascimento',
      (q) => q.is('deleted_at', null).is('membro_id', null));
    let vinculados = 0, criados = 0, falhas = 0;
    for (const m of orfas) {
      try {
        const r = await acharOuCriarGuardado({
          cpf: m.cpf, email: m.email, telefone: m.telefone,
          nome: [m.nome, m.sobrenome].filter(Boolean).join(' '),
          dataNascimento: m.data_nascimento || null, status: 'visitante',
          origem: 'next_reconciliacao', origemId: m.id,
        });
        if (!r?.membro_id) { falhas += 1; continue; }
        const { error } = await supabase.from('next_matriculas')
          .update({ membro_id: r.membro_id, updated_at: new Date().toISOString() })
          .eq('id', m.id).is('membro_id', null);
        if (error) { falhas += 1; continue; }
        if (r.created) criados += 1; else vinculados += 1;
      } catch { falhas += 1; }
    }
    recalcularKpisNext();
    res.json({ total: orfas.length, vinculados, criados, falhas });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// PATCH /matriculas/:id — editar / mover de turma (re-encaixe) / status / indicações
router.patch('/matriculas/:id', contextoEscritaNext, validarEscritaNext({ tabela: 'next_matriculas', pai: 'next_turmas', campoPai: 'turma_id', membro: true }), async (req, res) => {
  const b = req.body || {}, atual = req.nextAtual;
  const patch = {};
  ['turma_id', 'nome', 'sobrenome', 'cpf', 'telefone', 'email', 'data_nascimento', 'observacoes', 'membro_id',
    'ja_batizado', 'ja_voluntario', 'ja_doador', 'indicou_batismo', 'indicou_servir', 'indicou_grupo', 'indicou_dizimo', 'status']
    .forEach(k => { if (k in b) patch[k] = b[k]; });
  if ('cpf' in patch) {
    const digits = String(patch.cpf || '').replace(/\D/g, '');
    const anterior = String(atual.cpf || '').replace(/\D/g, '');
    if (String(patch.cpf || '').trim() && (!digits || (digits !== anterior && !cpfValido(digits)))) {
      return res.status(400).json({ error: 'CPF inválido — confira os dígitos.' });
    }
    patch.cpf = digits || null;
  }
  if ('telefone' in patch) patch.telefone = String(patch.telefone || '').replace(/\D/g, '') || null;
  if ('email' in patch) patch.email = String(patch.email || '').trim().toLowerCase() || null;
  if ('nome' in patch && !String(patch.nome || '').trim()) return res.status(400).json({ error: 'Nome obrigatório.' });
  if ('turma_id' in patch && patch.turma_id !== atual.turma_id) {
    // O trigger SQL bloqueia a alteração quando há qualquer presença histórica.
    patch.status = 'matriculado'; patch.check_in_at = null;
  }
  try {
    const pessoa = { ...atual, ...patch };
    let membroId = pessoa.membro_id;
    const alterouIdentidade = ['nome','sobrenome','cpf','telefone','email','data_nascimento','membro_id'].some(k => k in patch);
    if (alterouIdentidade && !membroId) {
      const r = await acharOuCriarGuardado({
        cpf: pessoa.cpf, email: pessoa.email, telefone: pessoa.telefone,
        nome: [pessoa.nome, pessoa.sobrenome].filter(Boolean).join(' '), dataNascimento: pessoa.data_nascimento,
        origem: 'next_matricula_edicao', origemId: atual.id, extra: { igreja_id: req.campus.campus_id },
      });
      if (!r?.membro_id) throw new Error('Identidade indisponível.');
      membroId = r.membro_id; patch.membro_id = membroId;
    } else if (alterouIdentidade && membroId) {
      // O vínculo histórico local autoriza este ID global; nunca hidratamos sua ficha na resposta.
      if (patch.data_nascimento) {
        const { data: identidade, error: identidadeError } = await supabase.from('mem_membros')
          .select('id,data_nascimento').eq('id', membroId).is('deleted_at', null).maybeSingle();
        if (identidadeError || !identidade) throw identidadeError || new Error('Identidade indisponível.');
        if (identidade.data_nascimento && String(identidade.data_nascimento).slice(0, 10) !== String(patch.data_nascimento).slice(0, 10)) {
          const { error: pendenciaError } = await supabase.from('identidade_pendencias').insert({
            tipo: 'vinculo_divergente', membro_id: membroId, origem: 'next_matricula_edicao', origem_id: String(atual.id),
            detalhe: 'Nascimento informado na edição do Next diverge do cadastro vinculado. Revisão humana necessária.',
          });
          if (pendenciaError && pendenciaError.code !== '23505') throw pendenciaError;
        }
      }
      if (patch.cpf) await reconciliarCpfTardio({
        membroId, cpf: patch.cpf, origem: 'next_matricula_edicao', origemId: atual.id,
        dataNascimento: pessoa.data_nascimento || null, igrejaId: req.campus.campus_id,
        confianca: b.membro_id ? 'forte' : 'fraca',
      });
      if (patch.telefone || patch.email) {
        const { error } = await supabase.rpc('fn_registrar_contato', {
          p_membro_id: membroId, p_telefone: patch.telefone || null, p_email: patch.email || null, p_fonte: 'next_matricula_edicao',
        });
        if (error) throw error;
      }
    }
    patch.updated_at = new Date().toISOString();
    let query = supabase.from('next_matriculas').update(patch).eq('id', req.params.id)
      .eq('igreja_id', req.campus.campus_id).is('deleted_at', null);
    query = atual.membro_id ? query.eq('membro_id', atual.membro_id) : query.is('membro_id', null);
    query = atual.turma_id ? query.eq('turma_id', atual.turma_id) : query.is('turma_id', null);
    const { data, error } = await query.select().maybeSingle();
    if (error) return erroRpcNext(res, error);
    if (!data) return res.status(409).json({ error: 'Matrícula alterada; atualize os dados e tente novamente.' });
    recalcularKpisNext(req.campus);
    res.json(data);
  } catch (erro) { return responderErroCampus(res, erro); }
});

// A transferência só corrige matrícula sem presença. História exige nova matrícula.
router.post('/matriculas/:id/transferir', contextoEscritaNext, validarEscritaNext({ tabela: 'next_matriculas', pai: 'next_turmas', campoPai: 'turma_id' }), async (req, res) => {
  if (!UUID_CAMPUS_NEXT.test(req.body?.turma_id || '')) return res.status(400).json({ error: 'Turma de destino obrigatória.' });
  const { data, error } = await supabase.rpc('fn_campus_next_transferir', {
    p_id: req.params.id, p_igreja_id: req.campus.campus_id, p_destino_id: req.body.turma_id,
  });
  if (error) return erroRpcNext(res, error);
  recalcularKpisNext(req.campus);
  res.json(data);
});

// PATCH /matriculas/:id/contato — marca/desmarca "contato feito" com a pessoa.
// body { feito: boolean } (default true). Carimba quem/quando pra ficar rastreável.
router.patch('/matriculas/:id/contato', contextoEscritaNext, validarEscritaNext({ tabela: 'next_matriculas' }), async (req, res) => {
  const feito = req.body?.feito !== false;
  const patch = feito
    ? { contato_em: new Date().toISOString(), contato_por: req.user?.id ?? null }
    : { contato_em: null, contato_por: null };
  const { data, error } = await supabase.from('next_matriculas')
    .update(patch).eq('id', req.params.id).eq('igreja_id', req.campus.campus_id).is('deleted_at', null)
    .select('id, contato_em, contato_por').maybeSingle();
  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.status(404).json({ error: 'Matrícula não encontrada' });
  res.json(data);
});

// DELETE /matriculas/:id — soft delete
router.delete('/matriculas/:id', contextoEscritaNext, validarEscritaNext({ tabela: 'next_matriculas' }), async (req, res) => {
  const { data, error } = await supabase.rpc('fn_campus_soft_delete_next', {
    p_tabela: 'next_matriculas', p_id: req.params.id, p_igreja_id: req.campus.campus_id, p_usuario_id: req.user.id,
  });
  if (error) return erroRpcNext(res, error);
  if (!data) return res.status(404).json({ error: 'Registro não encontrado neste campus.' });
  res.json({ ok: true });
});

// ----------------------------------------------------------------------------
// PESSOAS · visão unificada (convertidos + matrículas, 1 linha por pessoa)
//   Substitui as listas separadas "Por pessoa" + "NSM" (que duplicavam quem é
//   convertido E matriculado). Cada pessoa traz: origem (convertido/externo),
//   status no Next, turma, e — pra convertido — Data NSM + bucket de prazo +
//   resolução (acaba com o "vermelho pra sempre").
// ----------------------------------------------------------------------------
const MESES_PT = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
function nomeMesAtual() { const d = new Date(); return `${MESES_PT[d.getMonth()]} ${d.getFullYear()}`; }

async function fetchAllNext(table, columns, applyFilter, contexto, ordem = 'id') {
  const out = []; let from = 0; const page = 1000;
  while (true) {
    let q = supabase.from(table).select(columns).range(from, from + page - 1);
    if (contexto) q = filtrarCampus(q, contexto).order(ordem);
    if (applyFilter) q = applyFilter(q);
    const { data, error } = await q;
    if (error || !Array.isArray(data)) throw error || new Error('Resposta de paginação inválida.');
    out.push(...data);
    if (!data || data.length < page) break;
    from += page;
  }
  return out;
}

router.get('/pessoas', contextoLeituraNext, async (req, res) => {
  try {
    const { area } = req.query;
    const DIA = 86400000; const agora = Date.now();
    const digits = (v) => String(v || '').replace(/\D/g, '');
    const nomeKey = (s) => String(s || '').trim().toLowerCase() || null;

    const convertidos = await fetchAllNext('cui_convertidos',
      'id, nome, telefone, cpf, membro_id, data_culto, area, next_resolucao, next_resolucao_em',
      (q) => { q = q.is('deleted_at', null); return area ? q.eq('area', area) : q; }, req.campus);
    const matriculas = await fetchAllNext('next_matriculas',
      'id, turma_id, nome, sobrenome, cpf, telefone, email, membro_id, status, indicou_grupo, indicou_servir, indicou_batismo, indicou_devocional',
      (q) => q.is('deleted_at', null), req.campus);
    const turmas = await fetchAllNext('next_turmas', 'id, nome', (q) => q.is('deleted_at', null), req.campus);
    const turmaNome = new Map(turmas.map(t => [t.id, t.nome]));
    const { sinaisNextDosAtos } = require('../services/campusNextSinais');
    const fezNext = await sinaisNextDosAtos(supabase, req.campus, convertidos, matriculas);
    // Direcionamento (pra onde a pessoa vai ao fim do Next) · vem da matrícula
    const dirFlags = (mm) => ({
      indicou_grupo: !!(mm && mm.indicou_grupo), indicou_servir: !!(mm && mm.indicou_servir),
      indicou_batismo: !!(mm && mm.indicou_batismo), indicou_devocional: !!(mm && mm.indicou_devocional),
    });

    // índice de matrículas por identidade (membro_id > cpf > nome completo >
    // telefone + PRIMEIRO NOME)
    //
    // ⚠️ O ramo do telefone entrou em 14/08/2026: sem ele, 22 convertidos que
    // TÊM matrícula apareciam como "Sem Next" na tela — 11 deles com presença
    // registrada em pelo menos um encontro. A causa é o convertido chegar sem
    // CPF (o cadastro da decisão do culto exige só nome + telefone) e o nome
    // estar escrito diferente das duas portas.
    //
    // ⚠️⚠️ Telefone SOZINHO nunca identifica (lei do Contrato de porta: família
    // compartilha o número). Por isso o ramo exige o PRIMEIRO NOME igual. Medido
    // no dia: 22 casam por telefone, 14 têm o primeiro nome igual e 8 NÃO —
    // esses 8 seguem sem casar, que é o comportamento correto.
    const primeiroNome = (s) => nomeKey(String(s || '').trim().split(/\s+/)[0]);
    const tel8 = (v) => { const d = digits(v); return d.length >= 10 ? d.slice(-8) : null; };
    const mByMembro = new Map(), mByCpf = new Map(), mByNome = new Map(), mByTel = new Map();
    for (const m of matriculas) {
      if (m.membro_id && !mByMembro.has(m.membro_id)) mByMembro.set(m.membro_id, m);
      const c = digits(m.cpf); if (c.length === 11 && !mByCpf.has(c)) mByCpf.set(c, m);
      const nk = nomeKey(`${m.nome || ''} ${m.sobrenome || ''}`); if (nk && !mByNome.has(nk)) mByNome.set(nk, m);
      const t = tel8(m.telefone);
      if (t) { if (!mByTel.has(t)) mByTel.set(t, []); mByTel.get(t).push(m); }
    }
    const matchMatricula = (cv) => {
      if (cv.membro_id && mByMembro.has(cv.membro_id)) return mByMembro.get(cv.membro_id);
      const c = digits(cv.cpf); if (c.length === 11 && mByCpf.has(c)) return mByCpf.get(c);
      const nk = nomeKey(cv.nome); if (nk && mByNome.has(nk)) return mByNome.get(nk);
      const t = tel8(cv.telefone), pn = primeiroNome(cv.nome);
      if (t && pn && mByTel.has(t)) {
        const m = mByTel.get(t).find((x) => primeiroNome(x.nome) === pn);
        if (m) return m;
      }
      return null;
    };

    const usados = new Set();
    const itens = [];
    // 1. convertidos (com ou sem matrícula)
    for (const cv of convertidos) {
      const m = matchMatricula(cv);
      if (m) usados.add(m.id);
      const dias = cv.data_culto ? Math.floor((agora - new Date(cv.data_culto + 'T12:00:00').getTime()) / DIA) : null;
      let next_status; let bucket = null;
      if (cv.next_resolucao) next_status = 'resolvido';
      else if (fezNext(cv, 'convertido') || fezNext(m, 'matricula') || (m && m.status === 'formado')) next_status = 'formado';
      else if (m) next_status = 'matriculado';
      else { next_status = 'nao_inscrito'; bucket = dias == null ? 'no_prazo' : dias > 90 ? 'fora_prazo' : dias > 75 ? 'vencendo' : 'no_prazo'; }
      itens.push({
        tipo: 'convertido', convertido_id: cv.id, matricula_id: m ? m.id : null,
        nome: cv.nome, telefone: cv.telefone, email: null, membro_id: cv.membro_id,
        area: cv.area, data_nsm: cv.data_culto, dias_desde_conversao: dias,
        turma_id: m ? m.turma_id : null, turma_nome: m && m.turma_id ? (turmaNome.get(m.turma_id) || null) : null,
        next_status, bucket, next_resolucao: cv.next_resolucao || null, next_resolucao_em: cv.next_resolucao_em || null,
        ...dirFlags(m),
      });
    }
    // 2. matrículas externas (sem convertido correspondente)
    for (const m of matriculas) {
      if (usados.has(m.id)) continue;
      itens.push({
        tipo: 'externo', convertido_id: null, matricula_id: m.id,
        nome: `${m.nome || ''}${m.sobrenome ? ' ' + m.sobrenome : ''}`.trim(), telefone: m.telefone, email: m.email, membro_id: m.membro_id,
        area: null, data_nsm: null, dias_desde_conversao: null,
        turma_id: m.turma_id, turma_nome: m.turma_id ? (turmaNome.get(m.turma_id) || null) : null,
        next_status: (fezNext(m, 'matricula') || m.status === 'formado') ? 'formado' : 'matriculado', bucket: null, next_resolucao: null, next_resolucao_em: null,
        ...dirFlags(m),
      });
    }

    // prioridade na NSM: convertidos por data de conversão (recente primeiro), externos por último
    itens.sort((a, b) => {
      if (a.tipo !== b.tipo) return a.tipo === 'convertido' ? -1 : 1;
      const da = a.data_nsm || ''; const db = b.data_nsm || '';
      return db < da ? -1 : db > da ? 1 : 0;
    });

    const resumo = {
      total: itens.length,
      convertidos: itens.filter(i => i.tipo === 'convertido').length,
      externos: itens.filter(i => i.tipo === 'externo').length,
      formados: itens.filter(i => i.next_status === 'formado').length,
      nao_inscritos: itens.filter(i => i.next_status === 'nao_inscrito').length,
      no_prazo: itens.filter(i => i.bucket === 'no_prazo' || i.bucket === 'vencendo').length,
      fora_prazo: itens.filter(i => i.bucket === 'fora_prazo').length,
      resolvidos: itens.filter(i => i.next_status === 'resolvido').length,
    };
    res.json({ itens, resumo });
  } catch (e) {
    console.error('[next/pessoas]', e.message);
    res.status(503).json({ error: 'Não foi possível carregar a jornada Next do campus.' });
  }
});

// POST /convertidos/:id/resolver — fecha o pendente de Next do convertido
// (acaba o "vermelho pra sempre"). Body: { resolucao }.
router.post('/convertidos/:id/resolver', contextoEscritaNext, validarEscritaNext({ tabela: 'cui_convertidos' }), async (req, res) => {
  const { resolucao } = req.body || {};
  const VALID = ['contatado', 'sem_interesse', 'encerrado'];
  if (!VALID.includes(resolucao)) return res.status(400).json({ error: 'resolucao inválida' });
  const { data, error } = await supabase.from('cui_convertidos')
    .update({ next_resolucao: resolucao, next_resolucao_em: new Date().toISOString(), next_resolucao_por: req.user?.id ?? null })
    .eq('id', req.params.id).eq('igreja_id', req.campus.campus_id).is('deleted_at', null).select('id').maybeSingle();
  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.status(404).json({ error: 'Convertido não encontrado.' });
  res.json({ ok: true });
});

// DELETE /convertidos/:id/resolver — desfaz a resolução (volta ao funil)
router.delete('/convertidos/:id/resolver', contextoEscritaNext, validarEscritaNext({ tabela: 'cui_convertidos' }), async (req, res) => {
  const { data, error } = await supabase.from('cui_convertidos')
    .update({ next_resolucao: null, next_resolucao_em: null, next_resolucao_por: null })
    .eq('id', req.params.id).eq('igreja_id', req.campus.campus_id).is('deleted_at', null).select('id').maybeSingle();
  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.status(404).json({ error: 'Convertido não encontrado.' });
  res.json({ ok: true });
});

// ----------------------------------------------------------------------------
// CURSO · visão POR PESSOA de quem passou pelo Next (colapsa re-inscrições)
//   1 linha/pessoa (membro_id > cpf > nome). Traz aula 1 / aula 2 (presença OU
//   override manual), se concluiu ("fez Next" = as 2 aulas · qualquer turma OU
//   status=formado legado), "não concluiu" (>90d sem as 2) e flag sem-CPF.
//   Espelha a definição de vw_next_formado_pessoa pra bater com a NSM.
// ----------------------------------------------------------------------------
router.get('/curso', contextoLeituraNext, async (req, res) => {
  try {
    const DIA = 86400000, agora = Date.now();
    const digits = (v) => String(v || '').replace(/\D/g, '');
    const nomeKey = (s) => String(s || '').trim().toLowerCase() || null;

    const matriculas = await fetchAllNext('next_matriculas',
      'id, membro_id, cpf, nome, sobrenome, telefone, status, created_at',
      (q) => q.is('deleted_at', null), req.campus);
    const encontros = await fetchAllNext('next_encontros', 'id, numero', null, req.campus);
    const numByEnc = new Map(encontros.map(e => [e.id, e.numero]));
    const presencas = await fetchAllNext('next_presencas', 'matricula_id, encontro_id, presente', null, req.campus);
    const a1ByMat = new Set(), a2ByMat = new Set();
    for (const p of presencas) {
      if (!p.presente) continue;
      const num = numByEnc.get(p.encontro_id);
      if (num === 1) a1ByMat.add(p.matricula_id);
      else if (num === 2) a2ByMat.add(p.matricula_id);
    }
    const manual = await fetchAllNext('next_pessoa_aula_manual', 'membro_id, fez_aula1, fez_aula2, observacao', null, req.campus, 'membro_id');
    const manByMembro = new Map(manual.map(m => [m.membro_id, m]));
    const { sinaisNextDosAtos } = require('../services/campusNextSinais');
    const fezNext = await sinaisNextDosAtos(supabase, req.campus, [], matriculas);

    // pré-pass: mapeia cpf/nome -> membro_id (das matrículas JÁ vinculadas), pra
    // colapsar um órfão no seu "gêmeo" vinculado (dedup robusto mesmo antes do backfill).
    const cpfToMembro = new Map(), nomeToMembro = new Map();
    for (const m of matriculas) {
      if (!m.membro_id) continue;
      const c = digits(m.cpf); if (c.length === 11 && !cpfToMembro.has(c)) cpfToMembro.set(c, m.membro_id);
      const nk = nomeKey(`${m.nome || ''} ${m.sobrenome || ''}`); if (nk && !nomeToMembro.has(nk)) nomeToMembro.set(nk, m.membro_id);
    }

    // agrupa matrículas por pessoa (identidade: membro_id > cpf-vinculado > nome-vinculado > cpf > nome)
    const byKey = new Map();
    for (const m of matriculas) {
      const c = digits(m.cpf);
      const nk = nomeKey(`${m.nome || ''} ${m.sobrenome || ''}`);
      const key = m.membro_id
        || (c.length === 11 && cpfToMembro.get(c))
        || (nk && nomeToMembro.get(nk))
        || (c.length === 11 ? 'cpf:' + c : 'nome:' + (nk || m.id));
      let g = byKey.get(key);
      if (!g) { g = { membro_id: null, cpf: null, nome: null, telefone: null, n: 0, primeira: null, a1p: false, a2p: false, formado_legacy: false, conclusao_pessoal: false }; byKey.set(key, g); }
      g.n += 1;
      if (fezNext(m, 'matricula')) g.conclusao_pessoal = true;
      if (!g.membro_id && m.membro_id) g.membro_id = m.membro_id;
      const temCpf = c.length === 11;
      if (!g.cpf && temCpf) g.cpf = c;
      if (!g.nome || temCpf) g.nome = `${m.nome || ''}${m.sobrenome ? ' ' + m.sobrenome : ''}`.trim() || g.nome;
      if (!g.telefone && m.telefone) g.telefone = m.telefone;
      const dt = m.created_at ? String(m.created_at).slice(0, 10) : null;
      if (dt && (!g.primeira || dt < g.primeira)) g.primeira = dt;
      if (a1ByMat.has(m.id)) g.a1p = true;
      if (a2ByMat.has(m.id)) g.a2p = true;
      if (m.status === 'formado') g.formado_legacy = true;
    }

    const itens = [];
    for (const g of byKey.values()) {
      const man = g.membro_id ? manByMembro.get(g.membro_id) : null;
      const a1m = !!(man && man.fez_aula1), a2m = !!(man && man.fez_aula2);
      const fez_aula1 = g.a1p || a1m, fez_aula2 = g.a2p || a2m;
      const concluiu = g.conclusao_pessoal || g.formado_legacy;
      const dias = g.primeira ? Math.floor((agora - new Date(g.primeira + 'T12:00:00').getTime()) / DIA) : null;
      const nao_concluiu_90d = !concluiu && dias != null && dias >= 90;
      itens.push({
        membro_id: g.membro_id, nome: g.nome || 'Sem nome', cpf: g.cpf, telefone: g.telefone,
        sem_cpf: !g.cpf, sem_vinculo: !g.membro_id, n_matriculas: g.n,
        primeira_em: g.primeira, dias,
        fez_aula1, fez_aula2, a1_presenca: g.a1p, a2_presenca: g.a2p, a1_manual: a1m, a2_manual: a2m,
        override: !!man, concluiu, nao_concluiu_90d,
        status_curso: concluiu ? 'formado' : nao_concluiu_90d ? 'nao_concluiu' : 'em_andamento',
      });
    }
    itens.sort((a, b) => String(b.primeira_em || '').localeCompare(String(a.primeira_em || '')));
    const resumo = {
      total: itens.length,
      formados: itens.filter(i => i.concluiu).length,
      em_andamento: itens.filter(i => i.status_curso === 'em_andamento').length,
      nao_concluiu: itens.filter(i => i.nao_concluiu_90d).length,
      sem_cpf: itens.filter(i => i.sem_cpf).length,
      sem_vinculo: itens.filter(i => i.sem_vinculo).length,
    };
    res.json({ itens, resumo });
  } catch (e) {
    console.error('[next/curso]', e.message);
    res.status(503).json({ error: 'Não foi possível carregar o curso Next do campus.' });
  }
});

// Override local: o mesmo membro pode ter correções em campi diferentes.
router.put('/pessoa/:membroId/aulas', contextoEscritaNext, validarEscritaNext(), async (req, res) => {
  if (!UUID_CAMPUS_NEXT.test(req.params.membroId || '')) return res.status(400).json({ error: 'Membro inválido.' });
  const { data, error } = await supabase.rpc('fn_campus_next_manual', {
    p_igreja_id: req.campus.campus_id, p_membro_id: req.params.membroId,
    p_usuario_id: req.user.id, p_patch: req.body || {},
  });
  if (error) return erroRpcNext(res, error);
  recalcularKpisNext(req.campus);
  res.json(data);
});

module.exports = router;
