// ════════════════════════════════════════════════════════════════════════════
//  "Sobre o que ela está perguntando?" — régua PURA da sugestão de resposta
//
//  Pedido do Matheus (31/08/2026), com o print da Ana Paula (grupo ONLINE ·
//  Finanças na Ótica de Cristo): *"preciso que nesse tipo de pergunta, o agente
//  responda dizendo que o líder vai entrar em contato."*
//
//  Ela escreveu, depois de receber as boas-vindas do grupo:
//    "Boa tarde. Receberemos o link por aqui? Devo fazer contato com a líder
//     do grupo?"
//
//  ⚠️ Os casos vieram do BANCO, não da imaginação. Todas as mensagens de
//  entrada com "link" em 90 dias (medido 31/08):
//    30/08 · "Boa tarde. Receberemos o link por aqui? Devo fazer contato…"
//    23/08 · "Cadê o Link ?"
//    10/08 · "Vcs mandam link?"
//    10/08 · "Estou no aguardo do Link para entrar na Reunião amanhã 20:00 hs"
//    05/08 · "Opa, consegui o link de acesso ao grupo"   ← ⚠️ NÃO é pedido
//
//  ⚠️⚠️ O ÚLTIMO É A ARMADILHA e por isso está no teste: a pessoa está DIZENDO
//  QUE JÁ TEM. Sugerir "a liderança vai te mandar o link" para quem acabou de
//  avisar que conseguiu faz a igreja parecer que não leu a mensagem.
//
//  ⚠️ Isto é SUGESTÃO para uma pessoa revisar e enviar — a lei de 12/08
//  (reafirmada em 24/08) é do Matheus: "não quero bot; será apenas atendimento
//  humanizado". Errar aqui custa uma sugestão recusada, não uma mensagem errada
//  saindo em nome da igreja.
// ════════════════════════════════════════════════════════════════════════════

/** Sem acento, minúsculo — o mesmo tratamento do resto do inbox. */
function normalizar(t) {
  return String(t || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * ⚠️ JÁ TEM o link (ou o endereço) — não é pedido, é aviso.
 * Roda ANTES de tudo: "consegui o link" contém "link" e cairia no ramo errado.
 */
const JA_RESOLVEU = /\b(ja (consegui|recebi|entrei|achei|to no|estou no)|consegui (o |a )?(link|acesso|entrar)|recebi (o |a )?link|obrigad[oa] pelo link)\b/;

/** Está perguntando pelo LINK / como entra / se deve procurar a liderança. */
const PEDE_LINK = [
  /\blink\b/,
  /\bcade\b.*\b(link|reuniao|encontro)\b/,
  /\bcomo (eu )?(faco|entro|participo|acesso)\b/,
  /\b(devo|posso|preciso) (fazer contato|falar|chamar|procurar)\b.*\b(lider|liderança|lideranca)\b/,
  /\b(entrar|acesso) (na|no) (reuniao|encontro|grupo|sala)\b/,
];

/** Está perguntando QUANDO é (a régua que já existia, de 26/08). */
const PEDE_AGENDA = [
  /\bquando\b/,
  /\b(que|qual) (dia|horario|hora)\b/,
  // ⚠️ PREFIXO, não palavra exata: "vai comeCAR amanhã mesmo?" (caso real de
  // 25/08) não casa com `\bcomeca\b`. Cobre começa/começar/começou/inicia/
  // iniciar/início. Falso positivo aqui custa uma sugestão recusada — a régua
  // é generosa de propósito, porque quem envia é gente.
  /\b(comec|inici)/,
  /\be hoje\b/,
  /\bhoje tem\b/,
  /\btudo (certo|ok)\b.*\bhoje\b/,
  /\bsemana que vem\b/,
];

function casaAlguma(texto, lista) {
  return lista.some((re) => re.test(texto));
}

/**
 * O assunto da mensagem: `'link'` · `'agenda'` · `null`.
 *
 * ⚠️ **`null` é resposta legítima e o caso comum.** Sugestão que chuta é pior
 * que sugestão ausente — quem está com pressa envia sem ler.
 *
 * ⚠️ LINK vem antes de AGENDA quando os dois casam ("estou no aguardo do link
 * para entrar na reunião amanhã 20:00" fala de horário mas o que ela precisa é
 * do link). Responder a agenda ali seria repetir o que ela já sabe.
 */
function assuntoDaMensagem(texto) {
  const t = normalizar(texto);
  if (!t) return null;
  if (JA_RESOLVEU.test(t)) return null;
  if (casaAlguma(t, PEDE_LINK)) return 'link';
  if (casaAlguma(t, PEDE_AGENDA)) return 'agenda';
  return null;
}

module.exports = { assuntoDaMensagem, normalizar };
