// ============================================================================
//  Vale acordar o dispatcher do worker AGORA? · régua PURA (sem banco, sem rede)
//
//  ⚠️⚠️ POR QUE ISTO EXISTE (02/09/2026). Todo o relógio do time de agentes é
//  `node-cron` DENTRO do processo do worker (semanal `0 6 * * 1` com 16 agentes,
//  diário `0 7 * * *`, `rotina_gestor` seg/qua/sex, dispatcher dev `*/10`). E o
//  container do Railway NÃO fica de pé: medido em 25 h de log, o dispatcher
//  aparece 2 vezes, sempre no primeiro tique depois de um `Starting Container`,
//  com janelas de 5–13 min encerradas por SIGTERM externo (assinatura de App
//  Sleeping — acorda por request HTTP). No banco, o agente diário rodava 07:00
//  cravado em julho e hoje roda 10:56 / 11:23 / 16:45 / 17:03 / 18:01.
//
//  ⇒ O padrão que SOBREVIVE ao sleeping é "a Vercel manda, o worker executa" —
//  é por isso que o botão "Resolver todos" dispara em segundos (o POST com HMAC
//  ACORDA o container). O que não sobrevive é o worker se agendar sozinho.
//  Esta régua decide quando a Vercel deve dar esse empurrão de graça.
//
//  ⚠️⚠️ ELA NÃO É UM KEEPALIVE, E É AQUI QUE ISSO SE DECIDE. Acordar de 5 em 5
//  minutos sem olhar o board deixaria o container ligado 24/7 e mudaria a conta
//  do Railway sem ninguém ter decidido isso. Então: só acorda quando há trabalho
//  que o dispatcher REALMENTE pegaria.
//
//  ⚠️⚠️ E o caso que fecha o laço: tarefa BLOQUEADA POR AMBIENTE (o preflight do
//  `devAgent` registra `executor_sem_ambiente` uma vez por tarefa quando falta o
//  `git`). Ela fica `agendada` para sempre — e sem esta guarda cada tique
//  acordaria o container por uma tarefa que não pode andar, virando exatamente o
//  keepalive permanente que o parágrafo acima recusa. Com a guarda, o custo é de
//  no máximo UM despertar por tarefa: no despertar seguinte ela já tem o evento.
//  ⚠️ E isso se auto-cura sem código: consertar o ambiente exige REDEPLOY, o
//  redeploy sobe o container, e o `*/10` interno pega a fila no primeiro tique.
// ============================================================================

/** Por que NÃO acordou (ou por que acordou) — vai pra tela/log, não é enum de banco. */
const MOTIVO = {
  HA_TRABALHO: 'ha_trabalho',
  SEM_TAREFA: 'sem_tarefa',
  AMBIENTE_BLOQUEADO: 'ambiente_bloqueado',
  ENTRADA_INVALIDA: 'entrada_invalida',
};

/** Só id de verdade conta — `null`/`''`/número não são tarefa. */
function idsValidos(lista) {
  if (!Array.isArray(lista)) return [];
  const vistos = new Set();
  for (const id of lista) {
    if (typeof id === 'string' && id.trim()) vistos.add(id.trim());
  }
  return [...vistos];
}

/**
 * @param {object} p
 * @param {string[]} p.tarefas    — ids que o dispatcher pegaria (MESMO filtro dele)
 * @param {string[]} [p.bloqueadas] — ids com `executor_sem_ambiente` registrado
 * @returns {{acordar:boolean, motivo:string, elegiveis:string[], adiadas:string[]}}
 */
function decidirAcordar({ tarefas, bloqueadas } = {}) {
  // ⚠️ FAIL-CLOSED na entrada malformada: o efeito de acordar é uma chamada de
  // rede que LIGA um container: na dúvida, não liga. Quem perde é a latência da
  // retentativa, que o tique interno cobre — não o trabalho, que fica gravado.
  if (!Array.isArray(tarefas)) {
    return { acordar: false, motivo: MOTIVO.ENTRADA_INVALIDA, elegiveis: [], adiadas: [] };
  }
  const vivas = idsValidos(tarefas);
  if (!vivas.length) {
    return { acordar: false, motivo: MOTIVO.SEM_TAREFA, elegiveis: [], adiadas: [] };
  }
  const bloq = new Set(idsValidos(bloqueadas));
  const elegiveis = vivas.filter((id) => !bloq.has(id));
  const adiadas = vivas.filter((id) => bloq.has(id));
  if (!elegiveis.length) {
    return { acordar: false, motivo: MOTIVO.AMBIENTE_BLOQUEADO, elegiveis: [], adiadas };
  }
  return { acordar: true, motivo: MOTIVO.HA_TRABALHO, elegiveis, adiadas };
}

module.exports = { MOTIVO, decidirAcordar, idsValidos };
