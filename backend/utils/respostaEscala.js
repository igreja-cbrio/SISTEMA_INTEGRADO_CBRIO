/**
 * "Vou / não vou poder" — interpretação da resposta que chega pelo WhatsApp.
 *
 * Pedido do Matheus (14/08/2026): *"quero algo que a pessoa responda pelo wpp
 * mesmo"*. O aviso de véspera passou a sair com dois botões de quick-reply, e a
 * resposta chega no webhook — como `m.button.text` (botão de template) ou como
 * texto normal, quando a pessoa prefere escrever.
 *
 * ⚠️ Régua PURA (sem banco, sem rede) porque é assim que entra no gate:
 * `src/test/respostaEscala.test.ts`. Quem lê o banco é o webhook.
 *
 * ⚠️⚠️ A NEGAÇÃO É AVALIADA PRIMEIRO, e isso não é estilo: "não vou poder"
 * contém "vou". Procurar a afirmação antes transformaria toda recusa em
 * confirmação — e o efeito seria a pessoa avisar que não vai, o sistema
 * responder "presença confirmada" e ninguém repor a vaga no domingo.
 *
 * ⚠️⚠️ MODELO OPT-OUT (decisão do Matheus, 14/08: *"mas ela já tá como sim.
 * quero que tenha apenas um botão ou então um número para ela digitar para
 * dizer NÃO vai conseguir comparecer"*). Quem foi escalado VAI — a mensagem
 * traz UM botão só, o de recusar, e quem não responde nada continua contando
 * como presente. A afirmação segue sendo entendida (a pessoa pode responder
 * "vou sim" por conta própria, e isso vira informação melhor), mas ninguém
 * precisa confirmar.
 *
 * ⚠️ Por isso o DÍGITO existe: "responda 2 se não puder" é o caminho de quem
 * não enxerga botão (WhatsApp antigo, mensagem encaminhada). `1` e `2`
 * espelham a ordem "vou / não vou" do texto. Só valem com `context.id` — um
 * "2" solto numa conversa qualquer nunca chega aqui.
 */

// Acentos fora, minúsculas, espaços colapsados. Espelha o `normalizarBusca` do
// front (src/lib/busca.js) — aqui em versão mínima pra não puxar dependência.
function _norm(v) {
  return String(v || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/\s+/g, ' ').trim();
}

// "não vou", "nao posso", "n vou", "infelizmente não consigo"…
const NEGACAO = /\b(nao|n|nunca|infelizmente)\b[^a-z0-9]{0,12}(vou|posso|consigo|da|dara|darei|estarei|poderei|irei|vai)?|\bnao\b|\bnegativo\b|\bdesmarcar\b|\bcancelar\b|\bnao vou\b/;
// "vou sim", "confirmo", "estarei lá", "ok", "pode contar comigo"
const AFIRMACAO = /\b(vou|confirmo|confirmar|confirmado|sim|ok|okay|blz|beleza|certo|estarei|irei|posso|consigo|contar comigo|presente|to dentro|tou dentro|estou dentro)\b/;

/**
 * @returns {'confirmed'|'declined'|null} `null` = não deu pra entender.
 */
function interpretarRespostaEscala(bruto) {
  const t = _norm(bruto);
  if (!t) return null;
  // Dígito: o caminho de quem não enxerga botão. Casa a mensagem inteira, não
  // um "2" no meio de uma frase ("chego 2 minutos antes" não é recusa).
  if (/^2[.\)]?$/.test(t)) return 'declined';
  if (/^1[.\)]?$/.test(t)) return 'confirmed';
  // ⚠️ Negação PRIMEIRO — ver o comentário do topo.
  if (NEGACAO.test(t)) return 'declined';
  if (AFIRMACAO.test(t)) return 'confirmed';
  return null;
}

/** O texto que a pessoa mandou, seja botão de template, botão interativo ou texto. */
function textoDaResposta(m) {
  if (!m) return '';
  if (m.type === 'button') return m.button?.text || m.button?.payload || '';
  if (m.type === 'interactive') {
    return m.interactive?.button_reply?.title
      || m.interactive?.button_reply?.id
      || m.interactive?.list_reply?.title
      || '';
  }
  return m.text?.body || '';
}

/**
 * A qual mensagem NOSSA esta resposta se refere.
 *
 * ⚠️ É o `context.id` que amarra a resposta à escala: sem ele não dá pra saber
 * de qual convite a pessoa está falando, e alguém que serve em duas áreas na
 * mesma semana teria a recusa aplicada na escala errada.
 */
function wamidRespondido(m) {
  return m?.context?.id || null;
}

module.exports = { interpretarRespostaEscala, textoDaResposta, wamidRespondido };
