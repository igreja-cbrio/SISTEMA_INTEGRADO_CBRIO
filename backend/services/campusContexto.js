// Contexto de campus pertence à requisição, nunca ao objeto de usuário cacheado.
// Este serviço resolve acesso; não substitui guards de módulo nem filtra queries.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ESTADOS = new Set(['preparacao', 'ensaio', 'ativo']);

class ErroCampus extends Error {
  constructor(status, codigo, mensagem) {
    super(mensagem);
    this.name = 'ErroCampus';
    this.status = status;
    this.codigo = codigo;
  }
}

function indisponivel() {
  return new ErroCampus(503, 'campus_indisponivel', 'Não foi possível verificar o acesso aos campi. Tente novamente.');
}

async function consultar(consulta) {
  try {
    const resposta = await consulta;
    if (!resposta || resposta.error) throw indisponivel();
    return resposta.data;
  } catch (erro) {
    if (erro instanceof ErroCampus) throw erro;
    throw indisponivel();
  }
}

function campusSolicitado(req) {
  const valor = req.headers?.['x-campus-id'];
  if (valor === undefined) return null;
  // Headers duplicados/concatenados e vazios não são ausência de contexto.
  if (typeof valor !== 'string' || !valor.trim()) {
    throw new ErroCampus(400, 'campus_invalido', 'Informe um campus válido.');
  }
  const id = valor.trim().toLowerCase();
  if (id !== 'consolidado' && !UUID.test(id)) {
    throw new ErroCampus(400, 'campus_invalido', 'Informe um campus válido.');
  }
  return id;
}

async function resolverContextoCampus(req, opcoes = {}) {
  const usuario = req.user;
  const usuarioId = usuario?.id || usuario?.userId;
  if (!usuarioId) throw new ErroCampus(401, 'campus_sem_sessao', 'Autenticação necessária.');
  const solicitado = campusSolicitado(req);
  const db = opcoes.supabase || require('../utils/supabase').supabase;
  if (!db) throw indisponivel();
  const config = await consultar(db.from('app_campus_config')
    .select('estado, campus_legado_id').eq('id', true).maybeSingle());
  if (!config || !ESTADOS.has(config.estado) || !UUID.test(config.campus_legado_id || '')) {
    throw new ErroCampus(503, 'campus_configuracao_pendente', 'A configuração de campus ainda não está disponível.');
  }
  const legada = config.campus_legado_id.toLowerCase();
  const igrejas = await consultar(db.from('igrejas').select('id, nome, slug, tipo')
    .eq('ativa', true).order('nome'));
  if (!Array.isArray(igrejas) || !igrejas.some(i => i.id === legada)) throw indisponivel();

  let geral = usuario.is_super_admin === true || usuario.is_diretoria_geral === true;
  if (!geral) {
    if (opcoes.isSuperAdminEmail) {
      try { geral = (await opcoes.isSuperAdminEmail(usuario.email)) === true; } catch { throw indisponivel(); }
    } else if (usuario.email) {
      // Consulta exata: ILIKE transformaria %/_ de um e-mail em curingas.
      const admin = await consultar(db.from('app_super_admins').select('email')
        .eq('email', String(usuario.email).trim().toLowerCase()).eq('ativo', true).maybeSingle());
      geral = !!admin;
    }
  }
  let permitidos;
  if (geral) {
    permitidos = igrejas;
  } else {
    const vinculos = await consultar(db.from('usuario_igrejas').select('igreja_id').eq('usuario_id', usuarioId));
    if (!Array.isArray(vinculos)) throw indisponivel();
    const ids = new Set(vinculos.map(v => v.igreja_id));
    // Transição explícita: preserva somente a operação legada enquanto preparada.
    if (config.estado === 'preparacao') ids.add(legada);
    permitidos = igrejas.filter(i => ids.has(i.id));
  }
  if (config.estado === 'preparacao') permitidos = igrejas.filter(i => i.id === legada);
  const consolidadoPermitido = geral && config.estado !== 'preparacao';
  if (!permitidos.length) throw new ErroCampus(403, 'campus_sem_vinculo', 'Seu usuário não possui acesso a um campus ativo.');

  let selecionado = solicitado;
  if (selecionado === 'consolidado') {
    if (!consolidadoPermitido || req.method !== 'GET' || opcoes.permitirConsolidado !== true) {
      throw new ErroCampus(403, 'campus_consolidado_negado', 'A visão consolidada não está disponível nesta operação.');
    }
  } else {
    if (!selecionado) {
      if (config.estado === 'preparacao') selecionado = legada;
      else if (permitidos.length === 1) selecionado = permitidos[0].id;
      else if (opcoes.exigirSelecao !== false) throw new ErroCampus(409, 'campus_selecao_necessaria', 'Selecione o campus para continuar.');
    }
    if (selecionado && !permitidos.some(i => i.id === selecionado)) {
      throw new ErroCampus(403, 'campus_acesso_negado', 'Você não possui acesso ao campus solicitado.');
    }
  }
  return Object.freeze({
    estado: config.estado,
    campus_legado_id: legada,
    campi: Object.freeze(permitidos.map(i => Object.freeze({ id: i.id, nome: i.nome, slug: i.slug, tipo: i.tipo }))),
    campus_id: selecionado,
    consolidado_permitido: consolidadoPermitido,
  });
}

function responderErroCampus(res, erro) {
  const conhecido = erro instanceof ErroCampus ? erro : indisponivel();
  return res.status(conhecido.status).json({ error: conhecido.message, code: conhecido.codigo });
}

module.exports = { resolverContextoCampus, responderErroCampus, ErroCampus };
