const { ErroCampus, responderErroCampus } = require('./campusContexto');
const { filtrarCampus, validarContexto } = require('../utils/campusQuery');
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function exigirCriancaCampus(db, contexto, id) {
  validarContexto(contexto, true);
  if (!UUID.test(id || '')) throw new ErroCampus(404, 'kids_crianca_ausente', 'Criança não encontrada neste campus.');
  if (contexto.estado === 'preparacao') {
    const { data: config, error: configError } = await db.from('app_campus_config')
      .select('estado,ja_ativado,campus_legado_id').eq('id', true).maybeSingle();
    if (configError) throw configError;
    if (config?.estado === 'preparacao' && config.ja_ativado === false && config.campus_legado_id === contexto.campus_id) return;
    throw new ErroCampus(503, 'campus_configuracao_alterada', 'A configuração de campus mudou. Atualize a página.');
  }
  const { data, error } = await db.from('kids_crianca_campi').select('crianca_id')
    .eq('igreja_id', contexto.campus_id).eq('crianca_id', id).eq('ativo', true).maybeSingle();
  if (error) throw error;
  if (!data) throw new ErroCampus(404, 'kids_crianca_ausente', 'Criança não encontrada neste campus.');
}

async function exigirSessaoCampus(db, contexto, id) {
  if (!UUID.test(id || '')) throw new ErroCampus(404, 'kids_sessao_ausente', 'Sessão não encontrada neste campus.');
  const { data, error } = await filtrarCampus(db.from('kids_sessoes').select('id,culto_id,status'), contexto)
    .eq('id', id).is('deleted_at', null).maybeSingle();
  if (error) throw error;
  if (!data) throw new ErroCampus(404, 'kids_sessao_ausente', 'Sessão não encontrada neste campus.');
  return data;
}
function criarCheckoutKids({ supabase }) {
  return async (req, res, next) => {
    // Preserva a rotina legada até o ensaio; o isolamento usa a transação nova.
    if (req.campus.estado === 'preparacao') return next();
    try {
      validarContexto(req.campus, true);
      const b = req.body || {};
      if (!UUID.test(b.checkin_id || '')) throw new ErroCampus(400, 'kids_checkin_invalido', 'Check-in inválido.');
      if (b.igreja_id !== undefined && b.igreja_id !== req.campus.campus_id) throw new ErroCampus(403, 'campus_payload_divergente', 'Campus divergente.');
      const permissoes = req.user?.granular?.modulePerms?.kids;
      const supervisor = ['admin','diretor'].includes(req.user?.role) || permissoes?.pode_aprovar === true || Number(permissoes?.leitura) >= 5;
      // Liderança diária depende de Voluntariado ainda não certificado; não usar busca global.
      const { data, error } = await supabase.rpc('fn_campus_kids_checkout', {
        p_igreja_id: req.campus.campus_id, p_checkin_id: b.checkin_id, p_usuario_id: req.user.id || req.user.userId,
        p_metodo: b.metodo, p_codigo: b.codigo_seguranca || null, p_responsavel_id: b.responsavel_id || null,
        p_responsavel_nome: b.responsavel_nome || null, p_override_motivo: b.override_motivo || null,
        p_override_autorizado: supervisor,
      });
      if (error) throw new ErroCampus(({ P0400: 400, P0403: 403, P0404: 404, '23514': 409 })[error.code] || 503, 'kids_checkout_recusado', error.message);
      if (!data) throw new Error('Retirada sem resultado.');
      res.json(data);
    } catch (erro) { return responderErroCampus(res, erro); }
  };
}
function criarCheckinKids({ supabase, reconciliarCpf }) {
  return async (req, res, next) => {
    if (req.campus.estado === 'preparacao') return next();
    try {
      validarContexto(req.campus, true);
      const b = req.body || {};
      if (b.igreja_id !== undefined && b.igreja_id !== req.campus.campus_id) throw new ErroCampus(403, 'campus_payload_divergente', 'Campus divergente.');
      if (b.permitir_sem_cpf || !b.responsavel_id || b.enviar_wpp) {
        throw new ErroCampus(503, 'kids_fluxo_pendente', 'Este fluxo de check-in ainda não está habilitado para múltiplos campi.');
      }
      for (const id of [b.sessao_id,b.crianca_id,b.sala_id,b.responsavel_id,...(b.estacao_id ? [b.estacao_id] : [])]) {
        if (!UUID.test(id || '')) throw new ErroCampus(400, 'kids_dados_invalidos', 'Informe sessão, criança, sala e responsável válidos.');
      }
      const extras = b.cultos_extras || [];
      if (!Array.isArray(extras) || extras.length > 12 || extras.some(id => !UUID.test(id || ''))) throw new ErroCampus(400, 'kids_cultos_invalidos', 'Lista de cultos inválida.');
      await exigirCriancaCampus(supabase, req.campus, b.crianca_id);
      const ler = async consulta => { const { data, error } = await consulta; if (error) throw error; return data; };
      const sessao = await ler(filtrarCampus(supabase.from('kids_sessoes').select('id,culto_id,status,culto:cultos(id,nome,data)'), req.campus)
        .eq('id',b.sessao_id).is('deleted_at',null).maybeSingle());
      const sala = await ler(filtrarCampus(supabase.from('kids_salas').select('id,nome,cor,logo_url'), req.campus).eq('id',b.sala_id).eq('ativo',true).maybeSingle());
      if (!sessao || !sala) throw new ErroCampus(404, 'kids_origem_ausente', 'Sessão ou sala não encontrada neste campus.');
      const cultos = await ler(filtrarCampus(supabase.from('cultos').select('id,nome,data'), req.campus)
        .in('id',[...new Set([sessao.culto_id,...extras])]).is('deleted_at',null));
      if (!Array.isArray(cultos) || cultos.length !== new Set([sessao.culto_id,...extras]).size) throw new ErroCampus(404,'kids_culto_ausente','Culto não encontrado neste campus.');
      const crianca = await ler(supabase.from('kids_criancas').select('id,nome,data_nascimento,observacoes_medicas,necessidades_especiais')
        .eq('id',b.crianca_id).is('deleted_at',null).maybeSingle());
      if (!crianca) throw new ErroCampus(404,'kids_crianca_ausente','Criança não encontrada.');
      if (!crianca.data_nascimento) return res.status(422).json({ error: 'Informe a data de nascimento da criança antes do check-in.', precisa_data_nascimento: true, crianca_id: b.crianca_id });
      const vinculo = await ler(supabase.from('kids_responsaveis').select('parentesco,membro:mem_membros(id,nome,telefone,cpf,deleted_at)')
        .eq('crianca_id',b.crianca_id).eq('membro_id',b.responsavel_id).eq('autorizado_buscar',true).maybeSingle());
      const membro = vinculo?.membro;
      if (!membro || membro.deleted_at) throw new ErroCampus(403,'kids_responsavel_nao_autorizado','Responsável não autorizado para esta criança.');
      const cpfAtual = String(membro.cpf || '').replace(/\D/g,'');
      const informado = String(b.responsavel_cpf || '').replace(/\D/g,'');
      const { cpfValido } = require('../utils/cpf');
      if (String(b.responsavel_cpf || '').trim() && informado !== cpfAtual && !cpfValido(informado)) throw new ErroCampus(400,'cpf_invalido','CPF inválido.');
      if (cpfAtual.length === 11 && informado && informado !== cpfAtual) throw new ErroCampus(409,'kids_identidade_divergente','O CPF informado diverge do responsável vinculado. Revise o cadastro antes do check-in.');
      if (cpfAtual.length !== 11) {
        if (!informado) return res.status(422).json({ error: 'Precisamos do CPF do responsável.', precisa_cpf: true });
        const reconciliar = reconciliarCpf || require('./cpfReconciliar').reconciliarCpfTardio;
        const resultado = await reconciliar({ membroId: membro.id, cpf: informado, origem: 'kids_checkin', igrejaId: req.campus.campus_id, confianca: 'forte' });
        if (!['cpf_preenchido','ja_tinha'].includes(resultado?.acao)) throw new ErroCampus(409,'kids_identidade_pendente','Revise a identidade do responsável antes do check-in.');
      }
      const parametros = {
        p_igreja_id: req.campus.campus_id, p_sessao_id: b.sessao_id, p_crianca_id: b.crianca_id, p_sala_id: b.sala_id,
        p_estacao_id: b.estacao_id || null, p_responsavel_id: membro.id, p_usuario_id: req.user.id || req.user.userId,
        p_codigo_reservado: b.codigo_reservado ? String(b.codigo_reservado).trim().toUpperCase() : null,
        p_cultos_extras: extras,
      };
      let resposta;
      for (let tentativa = 0; tentativa < (parametros.p_codigo_reservado ? 1 : 5); tentativa += 1) {
        resposta = await supabase.rpc('fn_campus_kids_checkin', parametros);
        if (resposta.error?.code !== '23505' || !/colis[aã]o.*c[oó]digo/i.test(resposta.error.message || '')) break;
      }
      const { data, error } = resposta;
      if (error) throw new ErroCampus(({ '23514': 409, '23505': 409, P0400: 400, P0403: 403, P0404: 404 })[error.code] || 503,'kids_checkin_recusado',error.message);
      if (!data?.checkin) throw new Error('Check-in sem resultado.');
      res.status(201).json({ checkin: data.checkin, crianca, sala, sessao: { id: sessao.id, culto: sessao.culto },
        cultos: cultos.map(c => ({ id: c.id, nome: c.nome })),
        responsavel: { id: membro.id, nome: membro.nome, telefone: membro.telefone, parentesco: vinculo.parentesco },
        codigo_seguranca: data.codigo_seguranca, codigo_barras: data.codigo_seguranca });
    } catch (erro) { return responderErroCampus(res, erro); }
  };
}
module.exports = { exigirCriancaCampus, exigirSessaoCampus, criarCheckoutKids, criarCheckinKids };
