// ============================================================================
// CHECKOUT EXTERNO DE CARTÃO (2026-08-11 · pedido do Matheus para o retiro)
//
// Pedido dele: *"vamos usar o e-inscrição, mas apenas para pagamentos no
// cartão. Antes da pessoa se inscrever, deve perguntar se o pagamento é no
// cartão de crédito ou Pix. Se for Pix, ela preenche as informações e gera o QR
// normalmente. Se marcar cartão, é direcionada para a tela de inscrição do
// evento no e-inscrição. Esse link deve ser inserido nas configurações do
// evento por dentro do sistema."*
//
// ⚠️⚠️ A INVARIANTE QUE SUSTENTA TUDO: **com checkout externo configurado,
// NENHUM caminho nosso oferece cartão.** Não é só a tela pública escondendo o
// botão — é `metodos_ofertados` da COBRANÇA saindo sem 'cartao', porque é ele
// que o servidor confere em `decidirForma` (*"forma fora da lista não é
// oferecida nem por chamada direta"*). Sem isso, o app, um link antigo de
// `/pagamento/<token>` ou uma chamada direta continuariam cobrando cartão por
// dentro — e teríamos a inscrição paga em DOIS lugares, com a conciliação
// tendo que adivinhar qual valeu.
//
// ⚠️ Régua PURA, em `utils/`, pra entrar no gate de deploy: ela decide para
// onde vai o dinheiro de terceiros e para qual endereço a pessoa é mandada.
// ============================================================================

/** Rótulo exibido quando o evento não nomeia a plataforma. */
const NOME_PADRAO = 'e-Inscrição';

/**
 * O link de checkout externo é utilizável?
 *
 * Devolve a URL normalizada (string) ou `null`. Nunca lança — campo de
 * configuração digitado por gente erra, e erro de digitação não pode derrubar
 * o salvamento do evento inteiro (quem recusa com mensagem é a rota).
 *
 * ⚠️ **Só `https:`**. Não é preciosismo: esta URL recebe a pessoa com nome,
 * CPF e cartão do outro lado, e o navegador moderno já marca `http` como não
 * seguro. E `javascript:`/`data:` num campo que vira `href`/`window.location`
 * é XSS armado — o campo é editável por qualquer nível 3 do módulo.
 *
 * ⚠️ Recusa credencial embutida (`https://user:senha@site`): é a forma clássica
 * de disfarçar o host real de quem lê o link antes de clicar.
 */
function linkExternoValido(bruto) {
  const s = String(bruto ?? '').trim();
  if (!s) return null;
  let u;
  try { u = new URL(s); } catch { return null; }
  if (u.protocol !== 'https:') return null;
  if (u.username || u.password) return null;
  if (!u.hostname || !u.hostname.includes('.')) return null;
  return u.toString();
}

/** Nome da plataforma pra tela ("Você será levado para o …"). */
function nomeExterno(bruto) {
  const s = String(bruto ?? '').trim();
  return s ? s.slice(0, 40) : NOME_PADRAO;
}

/**
 * O evento manda o cartão pra fora?
 *
 * ⚠️ Exige pagamento ATIVO: link guardado num evento gratuito é resíduo de
 * configuração (o campo some da tela quando o pagamento é desligado), e mandar
 * gente pra um checkout de pagamento num evento que não cobra seria pior que
 * ignorar o resíduo.
 */
function temCheckoutExterno(ev) {
  return !!(ev && ev.pagamento_ativo && linkExternoValido(ev.checkout_externo_url));
}

/**
 * Os métodos que a NOSSA cobrança oferece.
 *
 * ⚠️⚠️ Com checkout externo, 'cartao' sai da lista — é aqui que a invariante do
 * cabeçalho vira fato. Se sobrar só cartão (evento que aceitava apenas cartão e
 * terceirizou o cartão), devolve lista VAZIA: não há o que a nossa página cobre,
 * e é a rota que decide o que fazer com isso — inventar Pix num evento que não
 * o oferece seria a configuração da igreja sendo reescrita por um helper.
 */
function metodosProprios(metodos, ev) {
  const lista = Array.isArray(metodos) ? metodos : [];
  if (!temCheckoutExterno(ev)) return lista;
  return lista.filter((m) => m !== 'cartao');
}

/**
 * O que a página pública oferece ANTES do formulário.
 *
 * `{ escolher: false }` = fluxo de sempre (o formulário abre direto).
 * `{ escolher: true, ... }` = a pessoa escolhe Pix (segue aqui) ou cartão (vai
 * pro link). Só faz sentido perguntar quando existem os DOIS caminhos: com o
 * link configurado e nenhum método nosso sobrando, não há escolha a fazer —
 * todo mundo vai pra fora, e uma pergunta de uma alternativa só é atrito puro.
 */
function opcoesPagamento(ev) {
  if (!temCheckoutExterno(ev)) return { escolher: false, proprios: metodosProprios(ev?.pagamento_metodos, ev) };
  const proprios = metodosProprios(ev.pagamento_metodos, ev);
  return {
    escolher: proprios.length > 0,
    proprios,
    externo_url: linkExternoValido(ev.checkout_externo_url),
    externo_nome: nomeExterno(ev.checkout_externo_nome),
  };
}

module.exports = {
  NOME_PADRAO,
  linkExternoValido,
  nomeExterno,
  temCheckoutExterno,
  metodosProprios,
  opcoesPagamento,
};
