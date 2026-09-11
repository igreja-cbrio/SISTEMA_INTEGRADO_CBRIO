// ════════════════════════════════════════════════════════════════════════════
//  VISITANTES · a resposta da pesquisa chega PELO PRÓPRIO WHATSAPP
//
//  Decisão do Marcos: "não gostaria que a pessoa clicasse em um link". O
//  template sai com botões de resposta rápida; a pessoa toca e a nota é
//  gravada. Se ela responder com texto em seguida, vira o COMENTÁRIO.
//
//  Esta régua é PURA (no gate · test:visitante): só interpreta o que a pessoa
//  mandou. Quem lê o banco e grava é services/visitantePesquisaResposta.js.
//
//  ⚠️⚠️ A ESCALA É 1 · 2 · 3 (decisão do Marcos, 11/09/2026: *"1 a pior, 2 a do
//  meio, 3 a maior, vai fazer mais sentido ter 3 opções e 3 números"*). São
//  TRÊS botões e TRÊS números — a média sai nessa régua, **nunca em 1..5**.
//  ⚠️ O texto dos botões NÃO começa por dígito; foi escrito em linguagem de
//  gente. Por isso a régua casa por TEXTO (BOTOES_TEXTO) ANTES de procurar
//  dígito. Sem isso a pessoa toca no botão e a nota NÃO é gravada — falha
//  silenciosa, porque o webhook responde 200 e ninguém percebe.
//  ⚠️⚠️ Mudou o rótulo no WhatsApp Manager? Muda AQUI também. Este mapa é a
//  ÚNICA coisa que liga aquele botão a uma nota — e é também o que a gente
//  devolve pra pessoa no agradecimento.
//
//  ⚠️⚠️ O NÚMERO NUNCA É DITO À PESSOA. Ela tocou numa FRASE e nunca viu nota
//  nenhuma; devolver "obrigado pela nota 3" faria ela achar que respondeu
//  outra coisa. O número é linguagem NOSSA, de relatório. O que a gente
//  devolve é a frase que ela escolheu.
// ════════════════════════════════════════════════════════════════════════════

/**
 * Os TRÊS botões do template vivo, do melhor pro pior.
 *
 * `rotulo` é o texto EXATO aprovado no WhatsApp Manager: serve pra casar o
 * toque (normalizado) E pra ecoar a escolha no agradecimento. Um lugar só,
 * pra não existir a chance de o eco dizer uma coisa e a nota gravar outra.
 */
const BOTOES_TEXTO = [
  { nota: 3, rotulo: 'Amei o culto, me senti em casa' },
  { nota: 2, rotulo: 'Eu gostei, o culto foi bom' },
  { nota: 1, rotulo: 'Não gostei, poderia ser melhor' },
];

/** Maior nota da escala. Existe pra ninguém chutar 5 em outro arquivo. */
const NOTA_MAX = 3;

function _norm(v) {
  return String(v || '').trim().toLowerCase();
}

function _semAcento(v) {
  return String(v || '').normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/** A frase que a pessoa escolheu, a partir da nota — ou null. */
function rotuloDaNota(nota) {
  const b = BOTOES_TEXTO.find((x) => x.nota === Number(nota));
  return b ? b.rotulo : null;
}

/**
 * Nota 1..3 a partir do que a pessoa mandou, ou null.
 *  · botão do template: o rótulo INTEIRO, sem acento e sem caixa;
 *  · texto: SÓ quando a mensagem inteira é a nota ("2", "nota 2") —
 *    "cheguei 2 minutos atrasado" não é nota.
 * ⚠️ 4 e 5 NÃO são mais notas (a escala encolheu pra 3): viram "não entendi",
 *    nunca um valor fora da escala no banco.
 */
function interpretarNotaVisitante(bruto) {
  const t = _norm(bruto);
  if (!t) return null;
  // 1º: os botões do template vivo, casados por TEXTO INTEIRO. Sem acento dos
  // dois lados — o que chega é o rótulo aprovado, mas acento e caixa não podem
  // ser o que decide se a nota entra.
  const alvo = _semAcento(t);
  for (const b of BOTOES_TEXTO) {
    if (_semAcento(_norm(b.rotulo)) === alvo) return b.nota;
  }
  // estrelas: conta os ⭐ (ou ★) quando a mensagem é só isso
  const estrelas = (t.match(/[⭐★]/gu) || []).length;
  if (estrelas && t.replace(/[⭐★\s]/gu, '') === '') return estrelas >= 1 && estrelas <= NOTA_MAX ? estrelas : null;
  // "2", "2.", "2)", "nota 2", "3 - bom"
  const m = /^(?:nota\s*)?([1-3])(?:\s*[.)·\-–:]\s*[a-záéíóúãõâêôç ]{0,20}|\s*estrelas?)?$/u.exec(t);
  return m ? Number(m[1]) : null;
}

/** Texto que serve como COMENTÁRIO: tem letras, não é só a nota, não é vazio. */
function ehComentario(bruto) {
  const t = String(bruto || '').trim();
  if (t.length < 2) return false;
  if (interpretarNotaVisitante(t) != null) return false;
  return /[a-záéíóúãõâêôç]/iu.test(t);
}

/** O convite de feedback livre, pedido pelo Marcos em 11/09. */
const CONVITE_FEEDBACK = 'Caso tenha mais algum feedback, pode digitar aqui na mensagem — a gente lê tudo, ainda hoje.';
/** O convite de quem teve uma experiência ruim: PERGUNTA, não "mais algum". */
const CONVITE_O_QUE_FALTOU = 'Conta pra gente o que faltou? É só digitar aqui na mensagem — a gente lê e leva pra equipe, ainda hoje.';

/**
 * O que dizer de volta depois do voto (a janela de 24h está aberta · texto
 * grátis · sendText, NÃO template — ver o rodapé deste arquivo).
 *
 * ⚠️ NUNCA o número — ver o cabeçalho.
 * ⚠️⚠️ **NO VOTO RUIM (1) A GENTE NÃO REPETE A FRASE DE VOLTA.** Marcos, 11/09:
 * *"se a pessoa apertar o não gostei fica ruim"* — e ele está certo: devolver
 * *"Você marcou 'Não gostei, poderia ser melhor'"* a quem acabou de reclamar
 * soa a carimbo, quase a deboche. Nos votos bons o eco CONFIRMA; no ruim quem
 * confirma é o acolhimento ("sentimos muito"), e o convite vira PERGUNTA
 * ("o que faltou?") em vez de "mais algum feedback" — quem reclamou já deu o
 * feedback, o que falta é o motivo.
 * ⚠️ "ainda hoje" não é enfeite: é a janela real do comentário
 *    (`visitanteRegras.comentarioNaJanela`). Mudou a janela, muda as frases.
 */
function textoObrigado(primeiroNome, nota) {
  const nome = String(primeiroNome || '').trim() || 'obrigado';
  if (nota === 1) {
    return `Obrigado pela sinceridade, ${nome} 🙏 Sentimos muito que a visita não tenha sido o que você esperava. ${CONVITE_O_QUE_FALTOU}`;
  }
  const voto = rotuloDaNota(nota);
  const eco = voto ? ` Você marcou “${voto}”.` : '';
  if (nota >= 3) return `Que alegria, ${nome}! 💚${eco} ${CONVITE_FEEDBACK}`;
  if (nota === 2) return `Que bom, ${nome}! 💚${eco} ${CONVITE_FEEDBACK}`;
  // nota desconhecida (não deveria acontecer): agradece sem afirmar nada.
  return `Obrigado por responder, ${nome}! 💚 ${CONVITE_FEEDBACK}`;
}

/**
 * O que dizer depois que ela ESCREVEU o comentário.
 *
 * ⚠️⚠️ Mesmo motivo do `textoObrigado`: quem acabou de contar o que deu errado
 * não pode receber *"Obrigado de coração 💚 Esperamos te ver de novo!"* — soa a
 * resposta automática que não leu. Ali a gente diz o que vai FAZER com aquilo,
 * e é verdade: a visita aparece em Cuidados → Próximos passos com a nota e o
 * comentário na ficha.
 */
function textoComentarioRecebido(primeiroNome, nota) {
  const nome = String(primeiroNome || '').trim() || 'obrigado';
  if (nota === 1) {
    return `Recebi, ${nome}. Obrigado por confiar e contar 🙏 Vou levar isso pra equipe que recebe quem chega — é assim que a gente melhora.`;
  }
  return `Anotado, ${nome}. Obrigado de coração 💚 Esperamos te ver de novo!`;
}

/**
 * A resposta do FORMULÁRIO (WhatsApp Flow · botão "Avaliar minha visita" do
 * template · backend/whatsapp-flows/visitante-avaliacao.json). O `response_json`
 * do `nfm_reply` chega como STRING com `{ nota: "1".."3", comentario?, flow_token }`.
 * Devolve `{ nota, comentario }` ou null quando não é a nossa resposta.
 *
 * ⚠️ Aceita objeto OU string (o webhook entrega string; o teste passa objeto).
 * ⚠️ `nota` fora de 1..3 (ou ausente) ⇒ null. O Flow segue BLOQUEADO pela Meta
 *    e não é o caminho vivo; fica aqui porque o webhook já o trata.
 */
function interpretarRespostaFlowVisitante(responseJson) {
  let obj = responseJson;
  if (typeof obj === 'string') {
    try { obj = JSON.parse(obj); } catch { return null; }
  }
  if (!obj || typeof obj !== 'object') return null;
  const n = Number(obj.nota);
  if (!Number.isInteger(n) || n < 1 || n > NOTA_MAX) return null;
  const c = String(obj.comentario ?? '').trim().slice(0, 1000);
  return { nota: n, comentario: c || null };
}

// ⚠️⚠️ NADA AQUI PRECISA DE APROVAÇÃO DA META. Estes textos saem como
// mensagem LIVRE (`sendText`) dentro da janela de 24h que o toque da pessoa
// abre — template só é exigido pra INICIAR conversa, que é o caso só do
// `visitante_pesquisa_satisfacao`. Mexer nas frases daqui é grátis e imediato.
module.exports = {
  BOTOES_TEXTO, NOTA_MAX, CONVITE_FEEDBACK, CONVITE_O_QUE_FALTOU, rotuloDaNota,
  interpretarNotaVisitante, ehComentario, textoObrigado, textoComentarioRecebido,
  interpretarRespostaFlowVisitante,
};
