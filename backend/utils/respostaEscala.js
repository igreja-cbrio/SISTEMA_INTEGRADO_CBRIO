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

// ⚠️⚠️ A NEGAÇÃO PRECISA SER A MENSAGEM INTEIRA (24/08/2026).
//
// A régua antiga tinha um `|\bnao\b` solto: QUALQUER frase com "não" virava
// recusa. Medido nas respostas REAIS ao disparo de escala:
//
//     "Não sirvo as 8.30"  →  declined   ← ERRADO
//
// Essa pessoa não está faltando: ela serve às 10h e a escala está no culto
// errado. O sistema a tiraria da escala E travaria a disponibilidade dela
// naquele culto — pior que a conversa aberta que o Matheus quis resolver.
// Junto dela vieram "Meu horário é às 10" e "No services estou 10h": correção
// de horário é o segundo caso mais comum, e nenhum deles é "não vou".
//
// ⚠️ A ASSIMETRIA É PROPOSITAL: a afirmação segue frouxa e a negação, estrita.
// Confirmar errado é no-op (o padrão já é "a pessoa vai"); recusar errado tira
// gente da escala. Os dois erros não custam o mesmo, então não têm o mesmo
// rigor.
const NEGACAO_INICIO = /^(?:infelizmente|desculpa|desculpe|oi|ola|bom dia|boa tarde|boa noite)?[\s,.!]*\b(?:nao|n|nunca)\b[\s,.!]*(?:vou|posso|consigo|conseguirei|poderei|irei|estarei|dara|darei|vai dar|da pra|da)?\b/;
// O que pode sobrar DEPOIS da negação e ainda ser só "não vou": complemento
// vazio de conteúdo novo. "sirvo", "horario", um número — não estão aqui.
const ENCHIMENTO = new Set([
  '', 'poder', 'ir', 'comparecer', 'servir', 'estar', 'dar', 'conseguir', 'vir',
  'hoje', 'amanha', 'domingo', 'sabado', 'quarta', 'nesse', 'neste', 'nessa',
  'nesta', 'dessa', 'desta', 'vez', 'culto', 'semana', 'dia', 'no', 'na', 'de',
  'do', 'da', 'pra', 'para', 'a', 'o', 'que', 'mas', 'infelizmente', 'desculpa',
  'desculpe', 'obrigado', 'obrigada', 'sinto', 'muito', 'agora', 'esse', 'este',
  'e', 'eu', 'me', 'mim', 'ainda', 'oi', 'ola', 'bom', 'boa', 'tarde', 'noite',
  'graca', 'deus', 'abraco', 'bjs', 'bj', 'valeu', 'ok',
]);
// ⚠️ "cancelar" e "desmarcar" valem em QUALQUER posição ("preciso cancelar"),
// diferente de "não": eles não aparecem em correção de horário. É a diferença
// entre uma palavra que só significa desistir e uma que significa qualquer
// negação — foi o "não" solto que lia "Não sirvo as 8.30" como recusa.
const CANCELAMENTO = /\b(cancelar|desmarcar|negativo)\b/;
// "vou sim", "confirmo", "estarei lá", "ok", "pode contar comigo"
const AFIRMACAO = /\b(vou|confirmo|confirmar|confirmado|sim|ok|okay|blz|beleza|certo|estarei|irei|posso|consigo|contar comigo|presente|to dentro|tou dentro|estou dentro)\b/;

/**
 * A mensagem É uma negação, ou apenas CONTÉM um "não"?
 *
 * Tira a negação da frente e olha o que sobrou: se for só enchimento, a pessoa
 * está dizendo que não vai. Se sobrou conteúdo ("sirvo as 8.30", "horario e as
 * 10"), ela está dizendo OUTRA coisa — e isso vai pra gente decidir.
 */
function ehNegacaoInteira(t) {
  if (CANCELAMENTO.test(t)) return true;
  const m = NEGACAO_INICIO.exec(t);
  if (!m) return false;
  const resto = t.slice(m[0].length).replace(/[.,!?;:]/g, ' ');
  return resto.split(/\s+/).every((w) => ENCHIMENTO.has(w));
}

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
  if (ehNegacaoInteira(t)) return 'declined';
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

module.exports = {
  ehNegacaoInteira, interpretarRespostaEscala, textoDaResposta, wamidRespondido };
