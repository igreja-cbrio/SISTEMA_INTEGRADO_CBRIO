// ════════════════════════════════════════════════════════════════════════════
//  CONSENTIMENTO coletado pelo CENSO — o que vira prova, e o que nunca vira
//
//  Pedido do Matheus (13/09/2026), depois do censo de 12-13/09: o questionário
//  não tinha caixa de opt-in de WhatsApp, e por isso 385 pessoas ficaram sem
//  consentimento nenhum — o que travou aniversário e campanha para elas. A
//  caixa entrou no questionário no mesmo dia; este arquivo é o que faz a
//  resposta dela virar consentimento de verdade.
//
//  ⚠️⚠️ A LEI: `inscricao_consentimentos` é o ledger de ACEITE DO TITULAR.
//  Em 13/09 os 385 foram ligados por DECISÃO DA LIDERANÇA e a trilha foi para
//  `mem_identidade_observacoes` justamente para NÃO gravar `aceito = true` num
//  ledger que qualquer auditoria lê como "a pessoa autorizou". Daqui para
//  frente é a própria pessoa que responde, então o ledger volta a ser o lugar
//  certo — e é essa diferença que este módulo existe para preservar.
//
//  ⚠️ A RECUSA TAMBÉM É GRAVADA (`aceito: false`), e não é detalhe: é ela que
//  protege a pessoa de uma leva futura de "liga todo mundo que não marcou". Foi
//  exatamente esse registro que, em 13/09, preservou 23 pessoas que já haviam
//  dito não. Sem gravar o "não", a recusa some e a pessoa é religada no próximo
//  mutirão.
//
//  Módulo PURO (sem Supabase, sem rede, sem relógio) para entrar no gate.
// ════════════════════════════════════════════════════════════════════════════

// Espelha o CHECK de `inscricao_consentimentos.tipo` (conferido no catálogo em
// 13/09). ⚠️ Tipo novo aqui sem entrar no CHECK do banco = 23514 no INSERT, e o
// consentimento some sem ninguém ver.
const TIPOS_CONSENTIMENTO = Object.freeze(['whatsapp', 'imagem', 'termos_lgpd']);

function chave(v) {
  return String(v == null ? '' : v)
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * A pergunta declara coletar consentimento?
 *
 * Espelha a forma de `acao: 'cuidado'` que o questionário já usa — marca
 * DECLARATIVA na pergunta, nunca o id dela. O id é editável pelo construtor, e
 * amarrar comportamento a `id === 'whatsapp_optin'` faria o consentimento parar
 * de ser coletado no dia em que alguém renomeasse a pergunta, em silêncio.
 */
function tipoDeConsentimento(pergunta) {
  if (!pergunta || String(pergunta.acao || '').trim() !== 'consentimento') return null;
  const t = String(pergunta.consentimento_tipo || '').trim();
  return TIPOS_CONSENTIMENTO.includes(t) ? t : null;
}

/**
 * "Sim" ou "não"? — e por que a NEGAÇÃO é avaliada primeiro.
 *
 * ⚠️⚠️ `"Não autorizo"` CONTÉM `"autorizo"`. Procurar a afirmação antes
 * transformaria toda recusa em aceite — a pessoa dizendo que NÃO quer receber
 * mensagem passaria a receber, e o ledger guardaria prova de um consentimento
 * que ela negou. É a mesma armadilha do `"não vou poder"` na resposta de escala
 * (14/08), e aqui o estrago é maior porque vira prova legal.
 *
 * @returns {true|false|null} null = não deu para entender (não grava nada)
 */
function interpretarResposta(valor) {
  // Múltipla escolha chega como lista; consentimento é uma escolha só.
  const bruto = Array.isArray(valor) ? valor[0] : valor;
  if (bruto === true) return true;
  if (bruto === false) return false;

  const s = chave(bruto);
  if (!s) return null;

  // NEGAÇÃO PRIMEIRO, sempre.
  if (/(^| )(nao|nunca|recuso|discordo)( |$)/.test(s)) return false;
  if (/(^| )(sim|autorizo|aceito|concordo|permito|quero)( |$)/.test(s)) return true;
  return null;
}

/**
 * O texto que fica gravado como prova: é o que a pessoa LEU na tela.
 *
 * ⚠️ Enunciado + descrição juntos. A descrição é onde mora o essencial ("avisos,
 * convites e conteúdos da igreja · cancele respondendo SAIR"), e guardar só o
 * enunciado deixaria a prova sem o escopo do que foi autorizado.
 */
function textoDaProva(pergunta) {
  const partes = [
    String(pergunta?.texto || '').trim(),
    String(pergunta?.descricao || '').trim(),
  ].filter(Boolean);
  return partes.join(' — ').slice(0, 2000);
}

/**
 * Decide o que gravar para UMA resposta do censo.
 *
 * @param {Array} perguntas  o questionário validado
 * @param {Object} respostas o payload da resposta (pergunta_id → valor)
 * @returns {{consentimentos: Array<{tipo,aceito,texto}>, indefinidos: Array<{tipo}>}}
 */
function consentimentosDaResposta(perguntas, respostas) {
  const consentimentos = [];
  const indefinidos = [];
  const vistos = new Set();

  for (const p of perguntas || []) {
    const tipo = tipoDeConsentimento(p);
    if (!tipo) continue;
    // ⚠️ Duas perguntas do MESMO tipo na mesma pesquisa: vale a primeira. Gravar
    // as duas deixaria o ledger com um "sim" e um "não" para o mesmo fato, e
    // nenhuma leitura saberia qual vale.
    if (vistos.has(tipo)) continue;
    vistos.add(tipo);

    const aceito = interpretarResposta(respostas?.[p.id]);
    if (aceito === null) { indefinidos.push({ tipo, pergunta_id: p.id }); continue; }
    consentimentos.push({ tipo, aceito, texto: textoDaProva(p) });
  }

  return { consentimentos, indefinidos };
}

/**
 * O que escrever em `mem_membros` a partir do consentimento.
 *
 * ⚠️⚠️ SÓ LIGA, NUNCA DESLIGA (lei de 05/08). Não marcar — ou marcar "não" —
 * numa porta é ausência de consentimento NAQUELA porta, não revogação do que a
 * pessoa autorizou em outra. Revogar é ato dela, pelo "SAIR" do WhatsApp.
 *
 * ⚠️ E quando liga, `whatsapp_optin_em` recebe a data DESTE aceite; quem já
 * tinha opt-in não é tocado, porque aquela data é a prova de desde quando vale.
 */
function patchDoCadastro(consentimentos, em = null) {
  const wpp = (consentimentos || []).find((c) => c.tipo === 'whatsapp');
  if (!wpp || wpp.aceito !== true) return null;
  const patch = { whatsapp_optin: true };
  // ⚠️ A data é a DESTE aceite — a da resposta, não "agora". No reparo do
  // pós-processamento os dois instantes são diferentes, e carimbar "agora"
  // moveria a prova para o dia em que o cron rodou.
  if (em) patch.whatsapp_optin_em = em;
  return patch;
}

module.exports = {
  TIPOS_CONSENTIMENTO,
  tipoDeConsentimento,
  interpretarResposta,
  textoDaProva,
  consentimentosDaResposta,
  patchDoCadastro,
};
