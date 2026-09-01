// ════════════════════════════════════════════════════════════════════════════
//  "Esta notificação tem botão? Qual?" — régua PURA do card do app
//
//  Pedido do Matheus (29/08/2026): *"nas notificações queria as notificações
//  dentro do app chegassem com botão para confirmar ou pedir troca (quando a
//  pessoa não puder ir). Pedidos para entrar em grupo também. Claro que se
//  clicar fora dos botões, deve direcionar para a rota respectiva."*
//
//  Vive em `utils/` (sem Supabase) pra entrar no gate de deploy, e tem espelho
//  em `lib/acoesNotificacao.ts` no repo do app — os dois decidem IGUAL. Se
//  divergirem, o app oferece um botão que o servidor recusa (ou esconde um que
//  funcionaria), que é a classe de bug que este arquivo existe pra evitar.
// ════════════════════════════════════════════════════════════════════════════

/** Teto de escalas numa mesma notificação. O aviso agrupa por (pessoa, DIA), e
 *  o dia mais cheio da igreja tem 4 cultos — 8 é folga, não expectativa.
 *  ⚠️ Sem teto, um `data` adulterado viraria um laço de N escritas. */
const MAX_ESCALAS = 8;

function _ids(valor) {
  if (!Array.isArray(valor)) return [];
  const vistos = new Set();
  for (const v of valor) {
    if (typeof v === 'string' && v.trim()) vistos.add(v.trim());
    if (vistos.size >= MAX_ESCALAS) break;
  }
  return [...vistos];
}

/**
 * Quais botões esta notificação mostra?
 *
 * ⚠️ **Sem ALVO, sem botão.** As 79 notificações de escala que já foram
 * enviadas têm `data = {tipo:'escala'}` — não há id nenhum pra responder, e
 * inventar um seria responder pela escala errada. Elas continuam abrindo a
 * tela no toque, como sempre fizeram.
 *
 * ⚠️ Notificação JÁ RESPONDIDA não mostra botão: o desfecho vira texto. Sem
 * isso a pessoa toca de novo, o servidor responde "já estava assim" e ela
 * conclui que o app não gravou.
 */
function acoesDaNotificacao(tipo, data) {
  const d = data && typeof data === 'object' ? data : {};
  if (d.acao) return { acoes: [], feita: String(d.acao) };

  if (tipo === 'escala') {
    const ids = _ids(d.escala_ids);
    if (!ids.length) return { acoes: [], feita: null };
    return { acoes: ['confirmar', 'nao_posso'], feita: null, escalaIds: ids };
  }

  if (tipo === 'grupo_pedido') {
    const pedidoId = typeof d.pedido_id === 'string' && d.pedido_id.trim() ? d.pedido_id.trim() : null;
    if (!pedidoId) return { acoes: [], feita: null };
    return { acoes: ['aprovar', 'recusar'], feita: null, pedidoId };
  }

  return { acoes: [], feita: null };
}

/** A ação pedida vale pra esta notificação? Fail-closed: o que não está na
 *  lista NÃO passa — o corpo do POST é do cliente. */
function acaoPermitida(tipo, data, acao) {
  if (typeof acao !== 'string') return false;
  return acoesDaNotificacao(tipo, data).acoes.includes(acao);
}

/** Ação -> o status que `responderEscala` entende.
 *  ⚠️ "Pedir troca" é o RÓTULO; o fato gravado é `declined` ("não vou poder"),
 *  que é o que dispara o aviso à coordenação e ao supervisor pra REPOR a vaga.
 *  O sistema não procura substituto sozinho — e o texto do app diz isso. */
function statusDaAcao(acao) {
  if (acao === 'confirmar') return 'confirmed';
  if (acao === 'nao_posso') return 'declined';
  return null;
}

module.exports = { acoesDaNotificacao, acaoPermitida, statusDaAcao, MAX_ESCALAS };
