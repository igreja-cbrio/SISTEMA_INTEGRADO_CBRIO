// ============================================================================
// KIDS · régua PURA da fila de conferência das decisões de fé importadas
// ============================================================================
// Mora em `utils/` de propósito: `services/` carrega o Supabase e o gate de
// deploy roda sem as dependências de `backend/` (lição de 06/08). A régua que
// DECIDE não pode viver no serviço que lê banco — nenhum mutante a alcança lá
// (lição de "guarda em código impuro", que custou 623 escalas religadas errado).
//
// Contexto: a planilha CONVERSOES_CBKIDS 2026 trouxe 66 decisões de fé de
// crianças. 58 casaram com >= 1 corroborador independente (check-in na data,
// idade exata ou telefone do responsável) e viraram vínculo; 8 ficaram para a
// coordenação do Kids decidir na tela.
//
// ⚠️ Dado sensível de MENOR (LGPD art. 5º II + art. 14 §1º): toda decisão aqui
// grava convicção religiosa na ficha de uma criança. Errar significa a equipe
// conversar com a família ERRADA sobre a decisão espiritual do filho dela.
// ============================================================================

const STATUS = ['aplicada', 'pendente', 'resolvida', 'descartada'];
const FAIXAS = ['A', 'B'];
const ACOES = ['vincular', 'descartar', 'reabrir'];

// ⚠️ `aplicada` é TERMINAL nesta fila. Desfazer um vínculo de decisão de menor
// é ato próprio (com trilha), nunca efeito colateral de mexer na fila — se a
// pessoa pudesse "reabrir" uma aplicada por aqui, a ficha da criança ficaria
// com data_conversao sem nenhuma linha pendente explicando por quê.
const TRANSICOES = Object.freeze({
  pendente: ['resolvida', 'descartada'],
  resolvida: ['descartada'],
  descartada: ['pendente'],
  aplicada: [],
});

function statusConhecido(s) {
  return typeof s === 'string' && STATUS.includes(s);
}

// ⚠️ FAIL-CLOSED: status desconhecido (coluna que ganhou valor novo, linha de
// outro lote) NÃO permite transição nenhuma. Liberar "porque não sei" é como
// uma fila de dado sensível vira porta aberta.
function transicaoValida(de, para) {
  if (!statusConhecido(de) || !statusConhecido(para)) return false;
  return TRANSICOES[de].includes(para);
}

function textoUtil(v, min = 1) {
  return typeof v === 'string' && v.trim().length >= min;
}

// ----------------------------------------------------------------------------
// avaliarResolucao · o que a coordenação pode fazer com uma linha da fila
// ----------------------------------------------------------------------------
// Devolve { ok: true, statusNovo, vincula } ou { ok: false, codigo, mensagem }.
// ⚠️ NUNCA lança: régua de negócio devolve motivo, quem decide o HTTP é a rota
// (lei da casa: `sem_vaga` é 409, não exceção).
function avaliarResolucao({ linha, acao, criancaId, nota } = {}) {
  if (!linha || typeof linha !== 'object') {
    return { ok: false, codigo: 'linha_ausente', mensagem: 'Linha da fila não encontrada.' };
  }
  if (!ACOES.includes(acao)) {
    return { ok: false, codigo: 'acao_invalida', mensagem: 'Ação não reconhecida.' };
  }

  if (acao === 'vincular') {
    // ⚠️ A criança vem EXPLÍCITA de quem está decidindo. O servidor não
    // "escolhe o candidato mais parecido" na hora de gravar — foi justamente
    // por não haver candidato único que a linha caiu na fila.
    if (!textoUtil(criancaId, 10)) {
      return { ok: false, codigo: 'crianca_obrigatoria', mensagem: 'Escolha a criança antes de vincular.' };
    }
    if (!transicaoValida(linha.status, 'resolvida')) {
      return {
        ok: false,
        codigo: 'transicao_invalida',
        mensagem: linha.status === 'aplicada'
          ? 'Esta linha já virou vínculo. Desfazer é feito na ficha da criança.'
          : `Não dá para vincular uma linha em "${linha.status}".`,
      };
    }
    return { ok: true, statusNovo: 'resolvida', vincula: true };
  }

  if (acao === 'descartar') {
    // ⚠️ Motivo OBRIGATÓRIO: descartar é dizer "esta decisão não vira registro
    // de ninguém". Sem o porquê escrito, em um mês ninguém sabe se foi engano
    // de digitação na planilha ou criança que não existe na base.
    if (!textoUtil(nota, 3)) {
      return { ok: false, codigo: 'nota_obrigatoria', mensagem: 'Escreva o motivo do descarte.' };
    }
    if (!transicaoValida(linha.status, 'descartada')) {
      return {
        ok: false,
        codigo: 'transicao_invalida',
        mensagem: linha.status === 'aplicada'
          ? 'Esta linha já virou vínculo e não pode ser descartada por aqui.'
          : `Não dá para descartar uma linha em "${linha.status}".`,
      };
    }
    return { ok: true, statusNovo: 'descartada', vincula: false };
  }

  // reabrir: só o que foi descartado volta para a fila
  if (!transicaoValida(linha.status, 'pendente')) {
    return { ok: false, codigo: 'transicao_invalida', mensagem: 'Só linha descartada volta para a fila.' };
  }
  return { ok: true, statusNovo: 'pendente', vincula: false };
}

// ----------------------------------------------------------------------------
// resumoFila · as linhas SEMPRE fecham (lei da ausência declarada)
// ----------------------------------------------------------------------------
// ⚠️ `total` é contado da lista, e `soma_status` das faixas. Se os dois
// divergirem, `fecha` vem false e a tela tem que DIZER isso em vez de mostrar
// um número redondo — "erro nunca vira fila vazia".
function resumoFila(linhas) {
  const lista = Array.isArray(linhas) ? linhas.filter(Boolean) : [];
  const porStatus = { aplicada: 0, pendente: 0, resolvida: 0, descartada: 0 };
  let desconhecido = 0;
  let semCulto = 0;
  let semCrianca = 0;

  for (const l of lista) {
    if (statusConhecido(l.status)) porStatus[l.status] += 1;
    else desconhecido += 1;
    if (!l.culto_id) semCulto += 1;
    if (!l.crianca_id) semCrianca += 1;
  }

  const somaStatus = STATUS.reduce((s, k) => s + porStatus[k], 0) + desconhecido;
  return {
    total: lista.length,
    ...porStatus,
    desconhecido,
    sem_culto: semCulto,
    sem_crianca: semCrianca,
    // a fila de trabalho de verdade
    a_conferir: porStatus.pendente,
    fecha: somaStatus === lista.length,
  };
}

module.exports = { STATUS, FAIXAS, ACOES, TRANSICOES, transicaoValida, avaliarResolucao, resumoFila };
