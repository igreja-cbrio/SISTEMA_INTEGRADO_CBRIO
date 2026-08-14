// ============================================================================
// QUEM É O SOLICITANTE DESTE CARD · régua ÚNICA
// ============================================================================
// Pergunta do Marcos (14/08/2026): *"veja se tudo conversa — quando ele atribui
// a responsabilidade de uma subtarefa para alguém, essa pessoa já recebe... quando
// ele coloca a data de entrega, já aparece na solicitação... quando ele arrasta
// para concluído já vai a entrega para a pessoa... quando ele sobe um arquivo de
// entregável, a pessoa pode baixar lá no módulo de solicitações"*.
//
// ⚠️⚠️ A RESPOSTA ERA "NÃO", e a causa é UMA: o código perguntava
// `card.solicitacao_id`, mas no fluxo que o Pedro usa hoje o vínculo é
// `card.campanha_id → marketing_campanhas.solicitacao_id`.
//
// Medido em produção (14/08): dos 9 cards não-evento, **8 têm `campanha_id` e
// `solicitacao_id` NULO** — e as 9 campanhas TÊM `solicitacao_id`. Ou seja: a
// pergunta errada acertava em 1 de 9 casos. Sintomas (todos com a mesma causa):
//   · aviso de "entregue"        → nunca saía
//   · aviso de "prazo confirmado"→ nunca saía (prazo_confirmado = 0 em 114 cards)
//   · aviso de "preview pronto"  → nunca saía
//   · sugerir revisão            → 403 pro solicitante
//   · baixar o entregável        → 403 pro solicitante
//
// ⚠️ Por que não "consertar" gravando `solicitacao_id` no card também: seriam
// DUAS verdades sobre o mesmo vínculo, e elas divergiriam no dia em que a
// campanha fosse reapontada. O card pertence à CAMPANHA; a campanha pertence à
// SOLICITAÇÃO. A leitura atravessa os dois — a escrita não duplica nada.
// ============================================================================

// Resolve o vínculo card → solicitação, aceitando os DOIS desenhos.
//
// Entrada: o card e (quando houver) a campanha dele já lida do banco.
// Saída:   { solicitacao_id, solicitante_id, via } · ou `null` quando o card
//          não tem solicitante nenhum (é o caso do ciclo criativo).
//
// ⚠️ `solicitante_id` pode voltar `null` mesmo com `solicitacao_id` preenchido:
// quem manda sobre "de quem é o pedido" é a tabela `solicitacoes`, e o
// `solicitante_id` da campanha é só um atalho. Quem autoriza deve preferir a
// solicitação — ver `services/marketingSolicitante.js`.
function escolherVinculoSolicitante(entrada) {
  // ⚠️ Desestruturar com default (`= {}`) NÃO cobre `null` — só `undefined`. E
  // `null` é justamente o que um `.maybeSingle()` sem linha devolve, então a
  // versão com default estourava TypeError e derrubava a rota inteira. Mesma
  // família da armadilha do `Number(null)`. O teste pegou isto.
  if (!entrada || typeof entrada !== 'object') return null;
  const { card, campanha } = entrada;
  if (!card || typeof card !== 'object') return null;

  // 1 · Vínculo DIRETO (fluxo legado · trigger fn_marketing_cards_solicitacao_sync).
  //     Tem precedência: é o vínculo mais específico que existe.
  if (card.solicitacao_id) {
    return { solicitacao_id: card.solicitacao_id, solicitante_id: null, via: 'card' };
  }

  // 2 · Vínculo pela CAMPANHA (fluxo do redesenho · o que está em uso).
  if (!card.campanha_id || !campanha || typeof campanha !== 'object') return null;

  // ⚠️ A campanha tem que ser A DO CARD. Sem esta conferência, passar a campanha
  // errada (laço com o objeto de outra iteração, cache mal indexado) entregaria
  // o pedido de UMA pessoa como se fosse de outra — é o pior erro possível aqui,
  // porque o resultado autoriza DOWNLOAD de arquivo.
  if (campanha.id && campanha.id !== card.campanha_id) return null;

  // ⚠️ Campanha soft-deletada não vale: a equipe a tirou do ar, e o vínculo
  // morre com ela. `deleted_at` preenchido é decisão humana.
  if (campanha.deleted_at) return null;

  if (!campanha.solicitacao_id) return null;

  return {
    solicitacao_id: campanha.solicitacao_id,
    solicitante_id: campanha.solicitante_id || null,
    via: 'campanha',
  };
}

// `true` quando o card NÃO tem solicitante por construção (ciclo criativo ou
// tarefa interna sem campanha). A tela usa isso pra não prometer aviso que não
// existe — e é diferente de "ainda não sei", que é falha de leitura.
function semSolicitantePorDesenho(card) {
  if (!card || typeof card !== 'object') return false;
  return card.origem === 'evento' || (!card.solicitacao_id && !card.campanha_id);
}

module.exports = { escolherVinculoSolicitante, semSolicitantePorDesenho };
