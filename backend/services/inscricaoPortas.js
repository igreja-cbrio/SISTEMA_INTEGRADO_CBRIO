// ============================================================================
// Registro canônico das portas públicas de INSCRIÇÃO.
//
// Este arquivo descreve as portas; ele NÃO muda onde cada formulário grava.
// Durante a F3.5 os handlers satélites continuam sendo os escritores oficiais,
// portanto nenhuma URL, alias ou tabela legada depende da migração para abrir.
//
// Ao adicionar uma porta:
// 1. declarar aqui a rota pública e todas as fontes da view unificada;
// 2. manter o contrato de campos em inscricaoContrato.js;
// 3. incluir a fonte em vw_inscricoes_unificadas;
// 4. deixar inscricaoPortas.test.js verde.
// ============================================================================

const PORTAS_INSCRICAO = Object.freeze([
  Object.freeze({
    chave: 'eventos',
    nome: 'Eventos e retiros',
    fontes: Object.freeze(['inscricoes', 'eventos_externos']),
    rotasPublicas: Object.freeze(['/evento/:slug']),
    gestao: '/inscricoes',
    modulo: 'Inscrições',
    escritor: 'espinha_com_fallback_ext',
    contrato: 'inscricaoContrato',
    inventario: 'eventos_nativos',
    status: 'por_evento',
  }),
  Object.freeze({
    chave: 'grupos',
    nome: 'Grupos de conexão',
    fontes: Object.freeze(['grupos']),
    rotasPublicas: Object.freeze(['/inscricao-grupos']),
    gestao: '/grupos',
    modulo: 'Grupos',
    escritor: 'mem_grupo_pedidos',
    contrato: 'inscricaoContrato',
    inventario: 'satelite',
    status: 'temporada',
  }),
  Object.freeze({
    chave: 'grupos_lider',
    nome: 'Líderes e anfitriões',
    fontes: Object.freeze(['grupos_lider']),
    rotasPublicas: Object.freeze(['/inscricao-lideres']),
    gestao: '/grupos',
    modulo: 'Grupos',
    escritor: 'mem_lider_inscricoes',
    contrato: 'inscricaoContrato',
    inventario: 'satelite',
    status: 'continua',
  }),
  Object.freeze({
    chave: 'next',
    nome: 'Next',
    fontes: Object.freeze(['next', 'next_legado']),
    rotasPublicas: Object.freeze(['/next', '/next/inscrever']),
    gestao: '/next',
    modulo: 'Next',
    escritor: 'next_matriculas',
    contrato: 'inscricaoContrato',
    inventario: 'satelite',
    status: 'turma',
  }),
  Object.freeze({
    chave: 'batismo',
    nome: 'Batismo',
    fontes: Object.freeze(['batismo']),
    rotasPublicas: Object.freeze(['/inscricao-batismo']),
    gestao: '/integracao',
    modulo: 'Integração',
    escritor: 'batismo_inscricoes',
    contrato: 'inscricaoContrato',
    inventario: 'satelite',
    status: 'continua',
  }),
  Object.freeze({
    chave: 'apresentacao',
    nome: 'Apresentação de crianças',
    fontes: Object.freeze(['apresentacao_criancas', 'apresentacao_bebes']),
    rotasPublicas: Object.freeze(['/apresentacao-criancas']),
    gestao: '/kids',
    modulo: 'Kids',
    escritor: 'kids_apresentacao_inscricoes',
    contrato: 'inscricaoContrato',
    inventario: 'satelite',
    status: 'continua',
  }),
  Object.freeze({
    chave: 'voluntariado',
    nome: 'Voluntariado',
    fontes: Object.freeze(['voluntariado']),
    rotasPublicas: Object.freeze(['/inscricao-voluntariado']),
    gestao: '/ministerial/voluntariado',
    modulo: 'Voluntariado',
    escritor: 'vol_inscricoes',
    contrato: 'inscricaoContrato',
    inventario: 'satelite',
    status: 'continua',
  }),
]);

function portasSatelites() {
  return PORTAS_INSCRICAO
    .filter((porta) => porta.inventario === 'satelite')
    .map((porta) => ({
      chave: porta.chave,
      nome: porta.nome,
      portas: [...porta.fontes],
      link: porta.rotasPublicas[0],
      aliases: porta.rotasPublicas.slice(1),
      gestao: porta.gestao,
      modulo: porta.modulo,
      continua: porta.status === 'continua',
      status: porta.status,
    }));
}

function fontesUnificadas() {
  return [...new Set(PORTAS_INSCRICAO.flatMap((porta) => porta.fontes))];
}

function catalogoPublico() {
  return PORTAS_INSCRICAO.map((porta) => ({
    chave: porta.chave,
    nome: porta.nome,
    fontes: [...porta.fontes],
    rotas_publicas: [...porta.rotasPublicas],
    gestao: porta.gestao,
    modulo: porta.modulo,
    escritor: porta.escritor,
    contrato: porta.contrato,
    inventario: porta.inventario,
    status: porta.status,
  }));
}

module.exports = {
  PORTAS_INSCRICAO,
  portasSatelites,
  fontesUnificadas,
  catalogoPublico,
};
