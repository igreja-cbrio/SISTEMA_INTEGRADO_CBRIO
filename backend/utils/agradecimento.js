// ════════════════════════════════════════════════════════════════════════════
//  "Isso é só um agradecimento?" — a régua PURA do bot de triagem
//
//  Pedido do Matheus (11/08/2026): a igreja dispara uma mensagem (confirmação de
//  inscrição, aviso), a pessoa responde "Obrigado" — e o bot abre o MENU DE
//  SETORES, como se ela quisesse atendimento. Resultado medido no inbox: 102
//  conversas não lidas, boa parte só de gente agradecendo.
//
//  Vive em utils/ e sem dependência nenhuma porque é aqui que se decide CALAR ou
//  ABRIR o menu, e essa decisão tem que ser testável sem webhook, sem banco e
//  sem WhatsApp.
//
//  ⚠️ O VOCABULÁRIO NÃO FOI IMAGINADO. Saiu das mensagens reais de entrada dos
//  últimos 30 dias: "obrigada" (5), "🙏🏻" (7), "ok" (9), "boa noite obrigada",
//  "olá,.. obrigada ☺️", "boa tarde!\nok.\nagradeço", "🥰🙏🏻". Os casos que
//  PRECISAM continuar abrindo o menu também vieram de lá: "oi" (4), "olá" (2),
//  "bom dia" (3), "quando começa?", "vcs mandam link?", "enviei errado".
// ════════════════════════════════════════════════════════════════════════════

/** Agradecer de verdade. Inclui bênção, que no vocabulário da igreja é o mesmo ato. */
const AGRADECER = new Set([
  'obrigado', 'obrigada', 'obrigadao', 'obrigadinha', 'obg', 'obgda', 'obgd',
  'vlw', 'valeu', 'agradeco', 'agradecida', 'agradecido', 'agradecemos',
  'gratidao', 'grata', 'grato', 'gratos',
  'amem', 'gloria', 'aleluia', 'abencoe', 'abencoado', 'abencoada', 'deus',
]);

/** Dar-se por ciente. "ok" sozinho não é pedido de atendimento nenhum. */
const CIENTE = new Set([
  'ok', 'okay', 'certo', 'certinho', 'entendi', 'ciente', 'beleza', 'blz',
  'tmj', 'perfeito', 'otimo', 'otima', 'maravilha', 'combinado', 'isso',
]);

/**
 * Saudação. ⚠️ SOZINHA ela NÃO é agradecimento — e isso é o coração da régua:
 * "oi" é exatamente o que o Matheus quer que ABRA a conversa com o bot. Ela
 * entra na lista só para não estragar "boa noite obrigada", que é agradecimento
 * com saudação na frente.
 */
const SAUDACAO = new Set([
  'oi', 'ola', 'ei', 'eai', 'bom', 'boa', 'dia', 'tarde', 'noite', 'pessoal',
  'irmaos', 'irmao', 'irma', 'gente', 'querida', 'querido',
]);

/** Palavras de ligação que não mudam a intenção. */
const LIGACAO = new Set([
  'muito', 'mto', 'muinto', 'por', 'pela', 'pelo', 'pelos', 'pelas', 'tudo',
  'de', 'da', 'do', 'a', 'o', 'e', 'ai', 'entao', 'ta', 'sim', 'ja', 'mesmo',
  'demais', 'viu', 'ne', 'que', 'voce', 'vc', 'vcs', 'tb', 'tbm', 'tambem',
  'nos', 'me', 'mim', 'sua', 'seu', 'atencao', 'carinho', 'retorno', 'resposta',
]);

/** Emoji que, sozinho, é agradecimento ou afeto — não é pedido. */
const EMOJI_GRATO = /[\u{1F64F}\u{2764}\u{1F970}\u{1F60A}\u{1F44D}\u{1F495}\u{1F49B}\u{1F49A}\u{1F499}\u{1F49C}\u{263A}\u{1F642}\u{1F607}\u{1F917}\u{1F44F}\u{2728}\u{1F525}]/u;

/** Sem acento, minúsculo. */
function normalizar(t) {
  return String(t || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

/**
 * A mensagem é SÓ um agradecimento (ou um "ok"), sem nada a atender?
 *
 * A régua: toda palavra tem que ser agradecimento, ciência, saudação ou ligação
 * — E pelo menos uma tem que ser agradecimento ou ciência. Sem essa segunda
 * metade, "bom dia" seria engolido, e aí a pessoa que quer falar com a igreja
 * levaria uma resposta automática em vez do menu.
 *
 * ⚠️ Pergunta NUNCA é agradecimento: "obrigado, quando começa?" tem que abrir o
 * menu. Interrogação derruba na hora.
 * ⚠️ Teto de tamanho: texto longo tem conteúdo, mesmo que comece com "obrigada".
 *    "olá! ficamos no aguardo. muito obrigada!" cai fora de propósito — abrir o
 *    menu para quem escreveu uma frase é o erro mais barato dos dois.
 */
function ehSoAgradecimento(texto) {
  const bruto = String(texto || '').trim();
  if (!bruto) return false;
  if (bruto.length > 60) return false;
  if (/[?¿]/.test(bruto)) return false;

  const norm = normalizar(bruto);
  // Fica só o que é letra/número; emoji e pontuação saem.
  const palavras = norm.replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean);

  // Só emoji: conta como agradecimento quando o emoji é de gratidão/afeto.
  // "🙏🏻" é a segunda resposta mais comum aos disparos.
  if (!palavras.length) return EMOJI_GRATO.test(bruto);

  // Número solto é escolha de setor, nunca agradecimento.
  if (palavras.some((p) => /^\d+$/.test(p))) return false;

  let temNucleo = false;
  for (const p of palavras) {
    const ehAgradecer = AGRADECER.has(p);
    const ehCiente = CIENTE.has(p);
    if (ehAgradecer || ehCiente) { temNucleo = true; continue; }
    if (SAUDACAO.has(p) || LIGACAO.has(p)) continue;
    return false;   // apareceu palavra de conteúdo → tem assunto, abre o menu
  }
  return temNucleo;
}

module.exports = { ehSoAgradecimento, AGRADECER, CIENTE, SAUDACAO };
