// ════════════════════════════════════════════════════════════════════════════
//  Debounce de MENSAGENS PICOTADAS · quando alguém escreve em rajada.
//
//  Pedido do Matheus (26/09/2026), depois de ver o vídeo do Salu Barbato:
//  *"o agente pode agrupar mensagens picotadas e responder de uma vez"*.
//
//  ⚠️⚠️ MEDIÇÃO ANTES DO CÓDIGO: no WhatsApp brasileiro a rajada é o padrão,
//  não a exceção. A pessoa manda "boa tarde" + "você atende?" + "quanto custa"
//  em 3 mensagens seguidas em 3-6 segundos. HOJE o bot IA por área responde
//  cada uma independentemente — 3 execuções, 3 chamadas de LLM, 3 respostas
//  atropeladas na tela dela.
//
//  ⚠️⚠️ POR QUE COALESCING (esperar N segundos e checar se sou o último) EM
//  VEZ DE DEBOUNCE CLÁSSICO (esperar N segundos e responder no fim):
//    - serverless não tem timer confiável entre invocações;
//    - cada mensagem que chega é UM evento do webhook, cada um é uma execução;
//    - se a 1ª esperar 8s e a 2ª chegar em 3s, as duas executam. Se as duas
//      "esperarem 8s e responderem", teremos 2 respostas.
//
//  ⇒ Estratégia: cada execução espera N segundos e depois pergunta *"eu ainda
//  sou a última mensagem inbound desta conversa?"*. Se sim, agrupa o texto e
//  chama o LLM. Se não, aborta em silêncio — a última mensagem que chegou vai
//  fazer o trabalho.
//
//  ⚠️ ESTA RÉGUA VIVE EM `utils/`, PURA, de propósito: guarda que decide algo
//  dentro do serviço que lê o banco é guarda que nenhum mutante alcança (lição
//  registrada em várias frentes desde 01/09).
// ════════════════════════════════════════════════════════════════════════════

// A janela padrão: 5 segundos. Vídeo do Salu sugere 5-10s; a Meta reentrega
// o webhook em 20s, então precisamos ficar bem abaixo. Configurável por env.
const JANELA_DEBOUNCE_MS_PADRAO = 5000;

// Janela de AGRUPAMENTO: quantos segundos pra trás olhamos ao concatenar as
// mensagens da rajada. Precisa ser maior que a janela de debounce (senão a 1ª
// mensagem da rajada fica de fora do agrupamento da última). 15s cobre uma
// rajada de digitação humana confortável sem incluir conversa antiga.
const JANELA_AGRUPAR_MS_PADRAO = 15000;

/**
 * Uma mensagem inbound tem `criado_em` (timestamp ISO). Um `id` também, pra
 * comparar "sou eu?". Aceita também `whatsapp_message_id` (Meta wamid), que é
 * a chave que o serviço tem em mãos antes de a linha existir no banco.
 */

/** Interpretar timestamp em ms, sem depender de fuso. NaN vira `null`. */
function tsMs(iso) {
  if (!iso) return null;
  const n = Date.parse(iso);
  return Number.isFinite(n) ? n : null;
}

/** Sanitiza a janela em ms. Zero desliga; negativo/NaN → padrão. */
function janelaValida(msPropostos, padrao) {
  const n = Number(msPropostos);
  if (!Number.isFinite(n) || n < 0) return padrao;
  return n;
}

/**
 * Devolve `true` se ESTA mensagem foi SUPERADA por outra mais recente do MESMO
 * remetente na MESMA conversa. Nesse caso, o handler que está processando
 * *esta* mensagem deve abortar em silêncio — a mensagem mais nova vai chamar o
 * LLM com o texto agrupado.
 *
 * ⚠️ Comparação por `whatsapp_message_id` (wamid) OU `id` do banco — o que
 *    estiver disponível. Nunca por `texto`, que pode se repetir.
 *
 * ⚠️ Empate em `criado_em` (dois eventos no mesmo milissegundo) NÃO conta como
 *    superado: precisa ser ESTRITAMENTE maior. Senão duas execuções paralelas
 *    achariam que a outra é a "mais nova" e as duas abortariam — a pessoa
 *    ficaria sem resposta.
 */
function foiSuperada({ minhaId, minhaWamid, minhaCriadoEm, todasInbound }) {
  const meuMs = tsMs(minhaCriadoEm);
  if (meuMs === null) return false;
  const lista = Array.isArray(todasInbound) ? todasInbound : [];
  for (const m of lista) {
    if (!m) continue;
    // Sou eu mesma? Pula.
    const mesmoId = minhaId != null && m.id != null && m.id === minhaId;
    const mesmoWa = minhaWamid && m.whatsapp_message_id && m.whatsapp_message_id === minhaWamid;
    if (mesmoId || mesmoWa) continue;
    const outroMs = tsMs(m.criado_em);
    if (outroMs === null) continue;
    if (outroMs > meuMs) return true;
  }
  return false;
}

/**
 * Junta o texto das mensagens inbound de uma rajada em um bloco só, na ordem
 * cronológica. Cobre a janela de agrupamento pra trás a partir de `agoraMs`.
 *
 * ⚠️ Só entra mensagem INBOUND (direção da pessoa) — resposta do bot no meio
 *    da janela não entra no texto que vai pro LLM (senão o próprio bot alimenta
 *    a próxima chamada com o que ele mesmo escreveu).
 *
 * ⚠️ Texto vazio/nulo é ignorado (mídia sem transcrição vira linha em branco;
 *    ninguém quer isso no prompt do LLM).
 *
 * ⚠️ O texto MAIS ANTIGO fica no topo — a ordem é a ordem em que a pessoa
 *    escreveu. Ordem invertida faz o LLM interpretar o pedido ao contrário.
 *
 * ⚠️ Se nada casa a janela, devolve `textoAtual` cru: o pior caso é responder
 *    só a mensagem que veio, e essa é a régua de HOJE — nunca ficar mudo.
 *
 * Retorna: { texto, contagem, primeiraMs, ultimaMs }.
 */
function agruparMensagensDaRajada({ textoAtual, todasInbound, agoraMs, janelaMs }) {
  const janela = janelaValida(janelaMs, JANELA_AGRUPAR_MS_PADRAO);
  const inicio = Number(agoraMs) - janela;
  const dentro = (Array.isArray(todasInbound) ? todasInbound : [])
    .map(m => ({
      texto: String(m?.texto || '').trim(),
      ms: tsMs(m?.criado_em),
    }))
    .filter(x => x.texto && x.ms !== null && x.ms >= inicio && x.ms <= Number(agoraMs))
    .sort((a, b) => a.ms - b.ms);

  if (dentro.length === 0) {
    return {
      texto: String(textoAtual || '').trim(),
      contagem: 1,
      primeiraMs: agoraMs,
      ultimaMs: agoraMs,
    };
  }

  return {
    texto: dentro.map(x => x.texto).join('\n'),
    contagem: dentro.length,
    primeiraMs: dentro[0].ms,
    ultimaMs: dentro[dentro.length - 1].ms,
  };
}

/**
 * A decisão completa, para o serviço não precisar chamar duas funções em
 * ordem. Devolve:
 *   { acao: 'coalesced', motivo: 'nao_sou_o_ultimo' }   → aborta silêncio
 *   { acao: 'responder', texto: '...' , contagem: N }   → chama LLM com N msgs
 */
function decidirDebounce({ minhaId, minhaWamid, minhaCriadoEm, textoAtual, todasInbound, agora, janelaAgruparMs }) {
  if (foiSuperada({ minhaId, minhaWamid, minhaCriadoEm, todasInbound })) {
    return { acao: 'coalesced', motivo: 'nao_sou_o_ultimo' };
  }
  const agoraMs = tsMs(agora) || Date.now();
  const g = agruparMensagensDaRajada({
    textoAtual,
    todasInbound,
    agoraMs,
    janelaMs: janelaAgruparMs,
  });
  return { acao: 'responder', texto: g.texto, contagem: g.contagem };
}

module.exports = {
  JANELA_DEBOUNCE_MS_PADRAO,
  JANELA_AGRUPAR_MS_PADRAO,
  janelaValida,
  foiSuperada,
  agruparMensagensDaRajada,
  decidirDebounce,
};
