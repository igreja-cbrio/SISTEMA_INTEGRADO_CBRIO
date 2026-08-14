// ============================================================================
// utils/jornadaMarcadores · "em que etapas da jornada esta pessoa está?"
// ============================================================================
// Régua PURA (sem banco, sem rede, sem relógio) — mora em `utils/` pra entrar no
// gate de deploy. Quem lê o banco é `services/jornadaMarcadores.js`.
//
// Pedido do Arthur Serpa (ideia do Pr. Nélio · 13/08/2026): "ao acessar o
// cadastro de uma pessoa, poder ver se já fez o Next, já se batizou, já serve
// como voluntário — o líder de grupo vê rapidamente em que etapa cada pessoa da
// turma está e dá um direcionamento mais intencional".
//
// ⚠️⚠️ A LEI DESTE ARQUIVO · marcador diz O QUE O SISTEMA TEM REGISTRO, não o
// que a pessoa fez. Ausência de marcador NÃO é prova de que a pessoa não fez —
// é ausência de registro. A distinção não é filosófica: um líder que lê
// "não batizado" numa pessoa batizada há 20 anos em outra igreja vai cobrar
// batismo dela. Por isso:
//   · `batizado_outra_igreja` conta como batizado (com o detalhe à vista) —
//     o dado existe (a pessoa declara no app) e ignorá-lo produz exatamente
//     esse erro;
//   · a UI diz "o sistema tem registro de", nunca "a pessoa não fez";
//   · NÃO existe marcador de "decisão de fé": a etapa `conversao` só nasce
//     preenchida pra quem entrou pela porta de Decisões da Integração, então
//     ela é FALSA pra quase toda a base importada — um marcador que está
//     errado na maioria das linhas ensina a equipe a não confiar no conjunto
//     inteiro.
//
// ⚠️ GENEROSIDADE é o único marcador SENSÍVEL, por decisão do Matheus
// (13/08/2026): o líder de grupo NÃO recebe nem o booleano. Contribuir ou não
// é dado financeiro da pessoa, e "quem não dizima" numa lista de roster é
// exatamente o tipo de leitura que a igreja não quer entregar. Quem já vê
// contribuições hoje (`membros-financeiro` nível 2) continua vendo.
//
// ⚠️ Fonte de cada sinal: ver `services/jornadaMarcadores.js`. Aqui só vive a
// DOBRA (sinal cru → marcador exibido) e o gate de sensibilidade.
// ============================================================================

/**
 * Catálogo dos marcadores, NA ORDEM DA JORNADA (é a ordem em que aparecem na
 * tela — ler a linha de flags da esquerda pra direita conta a história).
 *
 * `sensivel: true` ⇒ só sai pra quem passa em `podeVerMarcadorSensivel`.
 */
const MARCADORES = [
  {
    chave: 'batismo',
    label: 'Batizado',
    curto: 'BAT',
    descricao: 'Tem batismo realizado registrado (aqui ou em outra igreja).',
    sensivel: false,
  },
  {
    chave: 'next',
    label: 'Fez o Next',
    curto: 'NEXT',
    descricao: 'Concluiu o Next (aula 1 e aula 2, em qualquer turma).',
    sensivel: false,
  },
  {
    chave: 'grupo',
    label: 'Em grupo de conexão',
    curto: 'GRUPO',
    descricao: 'Tem vínculo ativo em algum grupo de conexão.',
    sensivel: false,
  },
  {
    chave: 'servir',
    label: 'Serve como voluntário',
    curto: 'SERVE',
    descricao: 'Tem vínculo de voluntariado em aberto.',
    sensivel: false,
  },
  {
    chave: 'devocional',
    label: 'Devocional em dia',
    curto: 'DEVO',
    descricao: 'Registrou devocional concluído nos últimos 90 dias.',
    sensivel: false,
  },
  {
    chave: 'generosidade',
    label: 'Contribui',
    curto: 'CONTRIB',
    descricao: 'Registrou dízimo ou oferta nos últimos 90 dias.',
    sensivel: true,
  },
];

const CHAVES = MARCADORES.map((m) => m.chave);
const CHAVES_ABERTAS = MARCADORES.filter((m) => !m.sensivel).map((m) => m.chave);
const CHAVES_SENSIVEIS = MARCADORES.filter((m) => m.sensivel).map((m) => m.chave);

/**
 * Módulos que liberam o marcador sensível. Espelha `ROUTE_MODULE_MAP` da rota
 * `membros-financeiro` (['membresia','financeiro']), que é a que guarda
 * `GET /membresia/contribuicoes` — quem já podia ver o extrato pode ver a flag.
 */
const MODULOS_SENSIVEL = ['membresia', 'financeiro'];
const NIVEL_SENSIVEL = 2;

/**
 * "Esta pessoa pode ver o marcador de generosidade?" — ESTRITO.
 *
 * ⚠️ NÃO reusa `getEffectiveLevel(req, 'membros-financeiro')` de propósito:
 * aquele helper usa `cargoNivelLeitura` como PISO, então um cargo com nível base
 * alto passaria sem ter `membresia` nem `financeiro` na matriz. Piso de cargo é
 * razoável pra decidir "quanto detalhe mostro numa tela que a pessoa já abriu";
 * é errado pra decidir se dado financeiro sai pela rede.
 *
 * ⚠️ Fail-closed: sem `user`, sem `granular` ou com o módulo bloqueado, devolve
 * false. Recebe o `req.user` já resolvido (nada de I/O aqui).
 */
function podeVerMarcadorSensivel(user) {
  if (!user) return false;

  // Bloqueio explícito por usuário vence tudo (mesma ordem do authorizeModule).
  const bloqueados = user.granular?.modulosBloqueados || [];
  if (MODULOS_SENSIVEL.every((m) => bloqueados.includes(m))) return false;

  if (user.is_super_admin === true) return true;
  if (user.role === 'admin' || user.role === 'diretor') return true;

  const perms = user.granular?.modulePerms;
  if (!perms) return false;

  return MODULOS_SENSIVEL.some((m) => {
    if (bloqueados.includes(m)) return false;
    const nivel = perms[m]?.leitura;
    return typeof nivel === 'number' && nivel >= NIVEL_SENSIVEL;
  });
}

/**
 * Dobra os sinais crus de UMA pessoa nos marcadores exibidos.
 *
 * @param {object} sinais  booleans crus lidos do banco:
 *   { batismo_cbrio, batismo_outra, next, grupo, servir, devocional, generosidade }
 * @param {object} [opts]
 * @param {boolean} [opts.incluirSensiveis=false]
 * @returns {{ chaves: string[], detalhes: object, sensiveis_ocultos: boolean }}
 *   `chaves` = só os marcadores PRESENTES, na ordem do catálogo (payload
 *   compacto: a lista de pessoas manda centenas destes).
 *   `sensiveis_ocultos` = true quando existe marcador sensível no catálogo e
 *   quem pediu não pode vê-lo — a tela DECLARA que está incompleta em vez de
 *   deixar a ausência parecer "não contribui".
 */
function montarMarcadores(sinais, opts = {}) {
  const s = sinais || {};
  const incluirSensiveis = opts.incluirSensiveis === true;

  const presente = {
    // Batismo em outra igreja CONTA (ver a lei no topo).
    batismo: !!(s.batismo_cbrio || s.batismo_outra),
    next: !!s.next,
    grupo: !!s.grupo,
    servir: !!s.servir,
    devocional: !!s.devocional,
    generosidade: !!s.generosidade,
  };

  const chaves = [];
  const detalhes = {};
  for (const m of MARCADORES) {
    if (m.sensivel && !incluirSensiveis) continue;
    if (!presente[m.chave]) continue;
    chaves.push(m.chave);
  }

  // Detalhe só onde ele muda a leitura da flag. "Batizado" sem dizer onde faria
  // a equipe procurar um registro de batismo da CBRio que não existe.
  if (presente.batismo && !s.batismo_cbrio && s.batismo_outra) {
    detalhes.batismo = 'em outra igreja';
  }

  return {
    chaves,
    detalhes,
    sensiveis_ocultos: !incluirSensiveis && CHAVES_SENSIVEIS.length > 0,
  };
}

/** Marcadores de quem não tem sinal nenhum (payload uniforme · nunca undefined). */
function marcadoresVazios(opts = {}) {
  return montarMarcadores({}, opts);
}

module.exports = {
  MARCADORES,
  CHAVES,
  CHAVES_ABERTAS,
  CHAVES_SENSIVEIS,
  MODULOS_SENSIVEL,
  NIVEL_SENSIVEL,
  podeVerMarcadorSensivel,
  montarMarcadores,
  marcadoresVazios,
};
