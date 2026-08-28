// ============================================================================
// utils/dadosSensiveisPessoa · quem pode ver DINHEIRO e CUIDADO PASTORAL de
// uma pessoa na ficha dela
// ============================================================================
// Régua PURA (sem banco, sem rede) — mora em `utils/` pra entrar no gate.
//
// ⚠️⚠️ O FURO QUE ISTO FECHA (achado em 13/08/2026, autorizado pelo Matheus):
// `ROUTE_MODULE_MAP['membros']` mapeia DOZE módulos —
//   membresia, grupos, cuidados, integracao, next, next-batismo, voluntariado,
//   kids, ami, bridge, online, face
// — e `authorizeModule` passa quando o usuário tem o nível em QUALQUER um deles.
// Ou seja `authorizeModule('membros', 1)` bastava pra quem tem `grupos` nível 1
// chamar `GET /membresia/membros/:id/timeline` e receber **contribuições com
// valores** e **aconselhamentos com motivo**, e `GET /membresia/membros/:id`
// com o array `contribuicoes`. A TELA é gated por `canMembresia`, então isso
// nunca apareceu na navegação — o furo era de API, alcançável por qualquer
// pessoa logada com um cliente HTTP.
//
// ⚠️ A correção NÃO estreita o guard da rota, e isso é decisão: a timeline
// mistura eventos legítimos (entrou no grupo, batismo, Next, censo) com os
// sensíveis. Devolver 403 na rota inteira tiraria de gente que deve ver o que
// ela deve ver. Quem é filtrado é o PAYLOAD, no servidor, e o que sai é
// DECLARADO (`ocultos`) — some sem avisar seria a tela mentindo que a pessoa
// não tem história.
//
// ⚠️ Os dois públicos são DIFERENTES e por isso são duas funções:
//   · financeiro → dízimo/oferta. Espelha `membros-financeiro` nível 2, que já
//     guarda `GET /membresia/contribuicoes`. Mesma régua do marcador de
//     generosidade (`utils/jornadaMarcadores`), importada daqui — uma só.
//   · pastoral → aconselhamento, jornada 180, encaminhamento. É o módulo
//     `cuidados`; a equipe de `membresia` nível 2 continua vendo o que vê hoje
//     (o pedido do Matheus foi "não abrir pra TODOS", não tirar de quem já
//     trabalha na ficha).
//
// ⚠️ NÃO usar `getEffectiveLevel(req, ...)` pra nada disto: ele tem
// `cargoNivelLeitura` como PISO, então um cargo com nível base alto passaria
// sem ter NENHUM dos módulos exigidos. Piso de cargo serve pra decidir quanto
// detalhe mostrar numa tela que a pessoa já abriu; é errado pra decidir se
// dado de dinheiro ou de acompanhamento pastoral sai pela rede.
// ============================================================================

/** Módulos que liberam dado financeiro DA PESSOA (dízimo/oferta). */
const MODULOS_FINANCEIRO = ['membresia', 'financeiro'];
const NIVEL_FINANCEIRO = 2;

/** Módulos que liberam cuidado pastoral (aconselhamento, jornada 180). */
const MODULOS_PASTORAL = ['cuidados', 'membresia'];
const NIVEL_PASTORAL = { cuidados: 1, membresia: 2 };

/**
 * "Este usuário tem nível >= N em algum destes módulos?" — ESTRITO.
 * Fail-closed: sem user, sem `granular` ou com o módulo bloqueado → false.
 *
 * @param {object|null} user  o `req.user` já resolvido (nada de I/O aqui)
 * @param {string[]} modulos
 * @param {number|Record<string,number>} nivel  número, ou nível POR módulo
 */
function temNivelEm(user, modulos, nivel) {
  if (!user) return false;

  const bloqueados = user.granular?.modulosBloqueados || [];
  // Bloqueio explícito de TODOS os módulos do conjunto vence até admin
  // (mesma ordem do `authorizeModule`: deny por usuário vem antes do role).
  if (modulos.every((m) => bloqueados.includes(m))) return false;

  if (user.is_super_admin === true) return true;
  if (user.role === 'admin' || user.role === 'diretor') return true;

  const perms = user.granular?.modulePerms;
  if (!perms) return false;

  return modulos.some((m) => {
    if (bloqueados.includes(m)) return false;
    const minimo = typeof nivel === 'number' ? nivel : nivel[m];
    if (typeof minimo !== 'number') return false;
    const atual = perms[m]?.leitura;
    return typeof atual === 'number' && atual >= minimo;
  });
}

/** Dízimo/oferta da pessoa: valores, totais, nível de generosidade. */
function podeVerFinanceiroDePessoa(user) {
  return temNivelEm(user, MODULOS_FINANCEIRO, NIVEL_FINANCEIRO);
}

/** Aconselhamento, encontro pastoral (jornada 180) e encaminhamento. */
function podeVerPastoralDePessoa(user) {
  return temNivelEm(user, MODULOS_PASTORAL, NIVEL_PASTORAL);
}

/**
 * Tipos de evento da timeline (`GET /membresia/membros/:id/timeline`) que são
 * sensíveis, e de qual permissão dependem.
 *
 * ⚠️ Tipo que NÃO estiver aqui é aberto — então evento NOVO na timeline com
 * dado sensível precisa entrar nesta tabela. É o mesmo cuidado do CHECK de
 * `entradas_resolucoes`: o que não é declarado passa direto.
 */
const EVENTO_SENSIVEL = {
  contribuicao: 'financeiro',
  aconselhamento: 'pastoral',
  jornada: 'pastoral',        // encontro pastoral (jornada 180)
  encaminhamento: 'pastoral', // encaminhamento do cuidado pastoral
};

/**
 * Filtra a timeline pelo que o usuário pode ver e DECLARA o que saiu.
 *
 * @returns {{ eventos: object[], ocultos: { financeiro: number, pastoral: number } }}
 */
function filtrarTimeline(eventos, { financeiro, pastoral }) {
  const pode = { financeiro: !!financeiro, pastoral: !!pastoral };
  const ocultos = { financeiro: 0, pastoral: 0 };
  const visiveis = [];
  for (const ev of eventos || []) {
    const exige = EVENTO_SENSIVEL[ev?.tipo];
    if (exige && !pode[exige]) { ocultos[exige] += 1; continue; }
    visiveis.push(ev);
  }
  return { eventos: visiveis, ocultos };
}

module.exports = {
  MODULOS_FINANCEIRO,
  NIVEL_FINANCEIRO,
  MODULOS_PASTORAL,
  NIVEL_PASTORAL,
  EVENTO_SENSIVEL,
  temNivelEm,
  podeVerFinanceiroDePessoa,
  podeVerPastoralDePessoa,
  filtrarTimeline,
};
