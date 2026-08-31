// ============================================================================
//  Régua PURA · até onde o agente vai sozinho em cada achado de diagnóstico
//
//  Pedido do Matheus (31/08/2026): *"preciso de um botão para resolver todos os
//  problemas, e aí ele vai resolver tudo, abrir as PRs e fazer os merges.
//  preciso acompanhar o andamento de cada um pela aba, para saber os que foram
//  resolvidos, os que estão sendo resolvidos e os que precisarem da minha ação,
//  só deixar sinalizado."*
//
//  ⚠️⚠️ A MÁQUINA DE CONSERTAR JÁ EXISTIA — e nunca havia rodado. O
//  `developer_agent` (Railway · `agent-worker/src/agents/devAgent.ts`) escreve
//  código, roda o G1, abre PR, espera o CI e MERGEIA. Medido em 31/08:
//  **ZERO `agent_runs` de `developer_agent` na história do banco** e 1 única
//  tarefa no board (14/08, sem PR). O que faltava não era o executor — era
//  ligar a aba de Diagnósticos nele. Esta régua é o portão dessa ligação.
//
//  ⚠️ Mora em `utils/` porque decide o que vai a PRODUÇÃO sem passar por
//  humano, e isso tem de ser testável sem Supabase (entra no gate).
//  Quem lê o banco e cria a tarefa é `services/diagnosticoResolver.js`.
// ============================================================================

/**
 * As três faixas. ⚠️ Não são "níveis de risco" — são CAMINHOS diferentes, e o
 * `pr` existe justamente para o achado que vale consertar e NÃO vale mergear
 * sozinho. Colapsar `pr` em `humano` deixaria o conserto sem começar; colapsar
 * em `auto` mergiaria código especulativo em produção.
 */
const FAIXAS = Object.freeze({
  AUTO: 'auto',       // corrige · abre PR · mergeia quando o CI fica verde
  PR: 'pr',           // corrige · abre PR · PARA (a pessoa revisa e mergeia)
  HUMANO: 'humano',   // nem tenta · fica sinalizado com o motivo
});

/**
 * ⚠️⚠️ `classification` é o ÚNICO eixo do diagnóstico que DISCRIMINA — medido
 * nos 19 diagnósticos vivos em 31/08: `codigo` 14 · `dependencia_externa` 2 ·
 * `dados` 1 · `desconhecido` 1 · `experiencia_usuario` 1.
 *
 * ⚠️⚠️ E `decision_required` NÃO discrimina NADA: veio **true em 19 de 19**. Se
 * ele fosse portão de faixa, o botão nunca resolveria nada — para sempre, sem
 * ninguém entender por quê. Ele virou AVISO no card (com a pergunta à vista),
 * não trava. É a lição de 25/08: medir a capacidade discriminante do eixo antes
 * de construir em cima dele.
 */
const CLASSIFICACAO_DE_CODIGO = 'codigo';

const MOTIVO_CLASSIFICACAO = Object.freeze({
  dados: 'o agente classificou como problema de DADO, não de código — conserto por código não resolve',
  dependencia_externa: 'o agente classificou como dependência EXTERNA — não se conserta no nosso código',
  experiencia_usuario: 'o agente classificou como experiência de uso — é decisão de produto, não conserto',
  configuracao: 'o agente classificou como configuração — resolve-se em env/painel, não em código',
  infraestrutura: 'o agente classificou como infraestrutura — não é código do repositório',
  desconhecido: 'o agente NÃO identificou a causa — mandar consertar seria chute',
});

/**
 * ⚠️ Áreas em que o agente NÃO ESCREVE, por decisão do próprio executor
 * (`INCIDENT_PROTECTED` em `agent-worker/src/tools/devFiles.ts`): autenticação,
 * dinheiro, o módulo Sistema e as migrations. Barrar AQUI, e não lá, é o que
 * transforma "a tarefa falhou no G1 sem ninguém entender" em "está sinalizado
 * com o motivo" na tela.
 *
 * ⚠️⚠️ É HEURÍSTICA SOBRE TEXTO, e está declarada como tal: o achado não
 * carrega o caminho do arquivo, só título/resumo/plano. Erra pro lado seguro —
 * falso positivo manda um achado para o humano (custa uma leitura), falso
 * negativo o agente barra no G1 (custa uma tarefa falhada, não um merge ruim).
 *
 * ⚠️ `token` FICOU DE FORA de propósito: metade dos links assinados da casa tem
 * "token" na rota (`/evento-checkin/:token`, `/g/a/:token`, `/e/:token`), e
 * barrar por ele mandaria pro humano justamente o achado reproduzível de hoje.
 */
const MARCAS_PROTEGIDAS = Object.freeze([
  { re: /\b(pagament|payment|checkout|cobran[cç]|boleto|\bpix\b|stripe|pagarme|mercado ?pago|santander)/i, area: 'pagamentos' },
  { re: /\b(financeir|dizim|d[ií]zim|oferta|conciliac|contab|fin_)/i, area: 'financeiro' },
  { re: /\b(autentica|autoriza|login|senha|credencial|oauth|jwt|service.?role|permiss)/i, area: 'autenticação e permissão' },
  { re: /\b(migration|migra[cç][aã]o de banco|drop (table|column)|alter table)/i, area: 'banco de dados' },
]);

function texto(item) {
  return [
    item?.titulo,
    item?.resumo,
    ...(Array.isArray(item?.plano_de_acao) ? item.plano_de_acao : []),
  ].filter(Boolean).join(' \n ');
}

/** Devolve a área protegida encontrada, ou `null`. */
function areaProtegida(item) {
  const t = texto(item);
  const achada = MARCAS_PROTEGIDAS.find((m) => m.re.test(t));
  return achada ? achada.area : null;
}

/**
 * O incidente foi REPRODUZIDO?
 *
 * ⚠️⚠️ `nao_reproduzido` é o portão que separa `auto` de `pr`, e é o mais
 * importante desta régua: **6 dos 7 achados abertos em 31/08 estão nesse
 * estado**, todos de 12–14/08, com diagnóstico da família "falha silenciosa no
 * handler". Mergear seis consertos de um defeito que ninguém conseguiu reproduzir
 * não é resolver problema — é fabricar mudança em produção, e o CI verde não
 * prova que o conserto conserta algo (não há caso que falhe antes e passe
 * depois). Então o agente CONSERTA e PARA no PR.
 */
function foiReproduzido(item) {
  const st = String(item?.incidente?.status || '').toLowerCase();
  return st !== 'nao_reproduzido';
}

/**
 * Decide a faixa de UM achado.
 *
 * @returns {{faixa: string, motivo: string, avisos: string[]}}
 *  `motivo` é sempre uma frase em português que vai LITERAL para a tela — é ela
 *  que responde "por que este não foi resolvido sozinho?". Faixa sem motivo
 *  legível é a tela muda que este módulo existe pra não ser.
 */
function avaliarAutonomia(item) {
  const avisos = [];
  const classificacao = String(item?.classificacao || '').toLowerCase().trim();
  const confianca = String(item?.confianca || '').toLowerCase().trim();

  // ── HUMANO · nem tenta ────────────────────────────────────────────────────
  // ⚠️ O vínculo achado↔tarefa é o ID DO INCIDENTE (`agent_tarefas.id =
  // system_incidents.id` — a identidade que o executor já usa pra reconhecer
  // correção assistida). Sem incidente não há chave, então não há como criar a
  // tarefa nem acompanhar o andamento. É o caso dos achados de auditoria.
  if (!item?.incidente?.id) {
    return { faixa: FAIXAS.HUMANO, motivo: 'achado de auditoria, sem incidente aberto — não há onde registrar nem acompanhar o conserto', avisos };
  }
  if (item?.estado !== 'aberto') {
    return { faixa: FAIXAS.HUMANO, motivo: 'já decidido (resolvido ou risco aceito) — o plano aqui é histórico', avisos };
  }
  if (!Array.isArray(item?.plano_de_acao) || !item.plano_de_acao.length) {
    return { faixa: FAIXAS.HUMANO, motivo: 'sem plano de ação registrado — não há o que implementar', avisos };
  }
  if (classificacao && classificacao !== CLASSIFICACAO_DE_CODIGO) {
    return {
      faixa: FAIXAS.HUMANO,
      motivo: MOTIVO_CLASSIFICACAO[classificacao] || `o agente classificou como "${classificacao}" — fora do que se conserta por código`,
      avisos,
    };
  }
  const area = areaProtegida(item);
  if (area) {
    return { faixa: FAIXAS.HUMANO, motivo: `toca ${area} — o agente não escreve nesses arquivos por regra própria`, avisos };
  }

  // ── PR · conserta e para ──────────────────────────────────────────────────
  if (!foiReproduzido(item)) {
    avisos.push('o incidente não foi reproduzido');
    return { faixa: FAIXAS.PR, motivo: 'o incidente não foi reproduzido — o conserto vai para PR e o merge é seu', avisos };
  }
  if (confianca === 'baixa') {
    avisos.push('confiança baixa no diagnóstico');
    return { faixa: FAIXAS.PR, motivo: 'o agente declarou confiança BAIXA no diagnóstico — o conserto vai para PR e o merge é seu', avisos };
  }

  // ── AUTO ──────────────────────────────────────────────────────────────────
  // ⚠️ Os avisos SOBEM para o card mesmo na faixa `auto`: eles não travam o
  // merge, mas quem olha a aba precisa saber o que o agente ressalvou.
  if (item?.decisao_necessaria) avisos.push('o agente também deixou uma pergunta de decisão');
  if (confianca === 'media') avisos.push('confiança média no diagnóstico');
  return {
    faixa: FAIXAS.AUTO,
    motivo: 'incidente reproduzível, classificado como código e com plano de ação — o agente corrige, abre o PR e mergeia quando o CI ficar verde',
    avisos,
  };
}

/**
 * Aplica a régua na lista inteira e separa por faixa.
 *
 * ⚠️ Devolve os ITENS anotados (`autonomia`), não só as contagens: a tela mostra
 * o motivo POR CARD, e uma contagem agregada sem o porquê é o número que manda
 * a pessoa procurar no banco.
 */
function distribuir(itens = []) {
  const lista = (Array.isArray(itens) ? itens : []).map((item) => ({
    ...item,
    autonomia: avaliarAutonomia(item),
  }));
  const por = (f) => lista.filter((i) => i.autonomia.faixa === f);
  const auto = por(FAIXAS.AUTO);
  const pr = por(FAIXAS.PR);
  const humano = por(FAIXAS.HUMANO);
  return {
    itens: lista,
    auto,
    pr,
    humano,
    resumo: {
      total: lista.length,
      auto: auto.length,
      pr: pr.length,
      humano: humano.length,
      // Quantos o botão vai efetivamente despachar ao executor.
      despachaveis: auto.length + pr.length,
    },
  };
}


/**
 * ⚠️⚠️ ANDAMENTO · as três caixas que o Matheus pediu ("os que foram
 * resolvidos, os que estão sendo resolvidos e os que precisam da minha ação").
 *
 * ⚠️ É régua PURA e derivada do status da TAREFA — nunca um segundo campo
 * gravado no banco. Estado de trabalho guardado em coluna própria é o que
 * envelhece e passa a discordar do board (o `wa_templates.ativo` da casa).
 *
 * ⚠️ `aguardando_revisao` é PRECISA_DE_VOCE, não "sendo resolvido": ali o
 * agente já terminou e o PR está esperando gente. Chamar de "em andamento"
 * faria a pessoa esperar por um trabalho que só ela pode destravar.
 */
const ANDAMENTO = Object.freeze({
  NAO_INICIADO: 'nao_iniciado',
  NA_FILA: 'na_fila',
  TRABALHANDO: 'trabalhando',
  RESOLVIDO: 'resolvido',
  PRECISA_DE_VOCE: 'precisa_de_voce',
  // ⚠️⚠️ ENCERRADO ≠ PRECISA DE VOCÊ, e confundir os dois custou um clique.
  //
  // No primeiro uso real (31/08, 13:33) o botão "Copiar prompt" montou um lote
  // de 5 achados em que **4 diziam "já decidido — o plano aqui é histórico"**, e
  // o contador prometia "há 11 outros". Causa: a faixa `humano` cobre coisas
  // OPOSTAS — "o agente não mexe, resolva você" e "isto já foi decidido, não há
  // nada a fazer" — e eu mapeei as duas para a mesma caixa. Incidente resolvido
  // não é pendência de ninguém: é histórico, e entrar na fila de trabalho dele
  // gasta atenção e credibilidade da tela.
  ENCERRADO: 'encerrado',
});

/**
 * ⚠️ O motivo de "precisa de você" NUNCA é genérico: sem ele o card diz que
 * há trabalho e não diz qual — que é a tela muda de novo.
 */
const MOTIVO_STATUS = Object.freeze({
  aguardando_revisao: 'o agente terminou e abriu o PR — falta você revisar e mergear',
  aguardando_aprovacao: 'o agente pede sua aprovação antes de mexer no código',
  falhou: 'o agente tentou e falhou — veja o comentário na tarefa antes de mandar de novo',
  bloqueada: 'bloqueada: o CI ficou vermelho 3× seguidas e o agente parou de tentar',
  rejeitada: 'a tarefa foi recusada — nada será feito por aqui',
  cancelada: 'a tarefa foi cancelada',
});

/**
 * @param item  achado já anotado com `autonomia` (por `distribuir`)
 * @param tarefa linha de `agent_tarefas` do incidente, ou null
 */
function andamentoDoAchado(item, tarefa) {
  const st = String(tarefa?.status || '').toLowerCase();

  if (st === 'concluida') {
    return {
      andamento: ANDAMENTO.RESOLVIDO,
      motivo: tarefa?.pull_request_url
        ? 'corrigido — PR mergeado na main (o deploy sai pelo Vercel)'
        : 'a tarefa foi concluída',
    };
  }
  if (st === 'agendada') {
    return { andamento: ANDAMENTO.NA_FILA, motivo: 'na fila do agente — o executor pega em até 10 minutos' };
  }
  if (st === 'em_andamento' || st === 'em_diagnostico') {
    return { andamento: ANDAMENTO.TRABALHANDO, motivo: 'o agente está trabalhando nisso agora' };
  }
  if (MOTIVO_STATUS[st]) {
    return { andamento: ANDAMENTO.PRECISA_DE_VOCE, motivo: MOTIVO_STATUS[st] };
  }

  // ⚠️⚠️ ANTES da faixa: achado de incidente JÁ DECIDIDO (resolvido, risco
  // aceito, duplicado) é HISTÓRICO. Vem depois dos status de tarefa de
  // propósito — se alguém mandou consertar e a tarefa está em curso, o que vale
  // é a tarefa.
  //
  // ⚠️ `sem_incidente` NÃO entra aqui: achado de auditoria é constatação que
  // ninguém decidiu ainda, e mandá-lo para "encerrado" esconderia trabalho real
  // (são 43 achados fora da janela atual). Ele segue em "precisa da sua ação"
  // pela faixa `humano`, que é a verdade: o agente não mexe, alguém tem de ler.
  if (item?.estado === 'encerrado') {
    return {
      andamento: ANDAMENTO.ENCERRADO,
      motivo: 'o incidente já foi decidido — este plano é histórico',
    };
  }

  // Sem tarefa: quem decide é a faixa. `humano` já nasce sinalizado; o resto
  // ainda não foi despachado.
  if (item?.autonomia?.faixa === FAIXAS.HUMANO) {
    return { andamento: ANDAMENTO.PRECISA_DE_VOCE, motivo: item.autonomia.motivo };
  }
  return { andamento: ANDAMENTO.NAO_INICIADO, motivo: 'ainda não foi despachado ao agente' };
}

/** Contagem das caixas, pro cabeçalho da aba. */
function resumirAndamento(itens = []) {
  const conta = (a) => (Array.isArray(itens) ? itens : []).filter((i) => i?.andamento === a).length;
  return {
    encerrados: conta(ANDAMENTO.ENCERRADO),
    resolvidos: conta(ANDAMENTO.RESOLVIDO),
    em_andamento: conta(ANDAMENTO.NA_FILA) + conta(ANDAMENTO.TRABALHANDO),
    precisam_de_voce: conta(ANDAMENTO.PRECISA_DE_VOCE),
    nao_iniciados: conta(ANDAMENTO.NAO_INICIADO),
  };
}

module.exports = {
  FAIXAS,
  CLASSIFICACAO_DE_CODIGO,
  MOTIVO_CLASSIFICACAO,
  MARCAS_PROTEGIDAS,
  areaProtegida,
  foiReproduzido,
  avaliarAutonomia,
  distribuir,
  ANDAMENTO,
  MOTIVO_STATUS,
  andamentoDoAchado,
  resumirAndamento,
};
