/**
 * ════════════════════════════════════════════════════════════════════════════
 *  POR QUE O BLOCO DE CÓDIGOS OFFLINE ESTÁ VAZIO
 *
 *  A barra do totem dizia só "Poucos códigos de reserva (0)". Quando o Marcos
 *  perguntou o que era (11/09/2026), a resposta não existia em lugar nenhum da
 *  tela: o `catch` do `recarregarBloco` era MUDO, então "essa conta não tem
 *  permissão", "o banco recusou a reserva" e "a internet caiu" ficavam
 *  indistinguíveis — e a única saída era ler o log da função na Vercel.
 *
 *  ⚠️⚠️ Cada causa leva a uma AÇÃO DIFERENTE, e é por isso que não pode ser
 *  uma frase só:
 *    403 → cadastro de permissão · resolve no sistema, não no totem
 *    503 → o banco recusou a reserva · quem resolve é quem cuida do sistema
 *    401 (sem status, só mensagem) → sessão expirada · resolve logando de novo
 *    TypeError de programa → bug do totem · ESPERAR NÃO RESOLVE (lição de 11/09)
 *    sem status → rede/servidor fora · resolve sozinho quando voltar
 *  "Não deu pra buscar" manda o voluntário chamar a pessoa errada.
 *
 *  ⚠️ Nada aqui TRAVA o totem: o check-in online segue funcionando. O que falta
 *  é a rede de segurança do offline — e a barra tem que dizer isso, senão a
 *  equipe lê a barra como "o check-in quebrou" no meio do culto.
 * ════════════════════════════════════════════════════════════════════════════
 */

export interface FalhaBloco {
  status?: number;
  name?: string;
  message?: string;
  /** Motivo REAL vindo do Postgres, que o backend repassa no 503. */
  detalhe?: string;
}

/**
 * Frase que diz A QUEM RECORRER.
 *
 * ⚠️ O `detalhe` do 503 viaja junto de propósito: é ele que distingue "a função
 * não existe" de "a tabela não existe" de "estourou o tempo" — sem ele, quem
 * cuida do sistema recebe "deu erro" e começa a investigação do zero.
 */
export function motivoFalhaBloco(e: unknown): string {
  const err = (e ?? null) as FalhaBloco | null;
  const status = typeof err?.status === 'number' ? err.status : undefined;

  if (status === 401 || status === 403) {
    return 'Esta conta do totem não tem permissão para reservar os códigos (precisa de nível 2 em Kids). Fale com quem cuida do sistema.';
  }
  if (status === 503) {
    const detalhe = String(err?.detalhe || '').trim();
    return `O servidor não conseguiu reservar os códigos${detalhe ? ` — ${detalhe}` : ''}. Fale com quem cuida do sistema.`;
  }
  if (status !== undefined && status >= 500) {
    return 'O servidor falhou ao reservar os códigos. Fale com quem cuida do sistema.';
  }
  if (status !== undefined) {
    return `O servidor recusou o pedido (erro ${status}). Fale com quem cuida do sistema.`;
  }
  // ⚠️⚠️ ERRO DO PRÓPRIO TOTEM, e não da rede — a lição de 11/09. A tela chamava
  // `totemKids.reservarCodigos` em vez de `totemKids.checkin.reservarCodigos`:
  // um `TypeError` lançado ANTES do fetch, que ficou **9 dias** disfarçado de
  // "espere a internet voltar" enquanto a reserva nunca era feita. Erro de
  // programa não se resolve esperando, então não pode falar como rede.
  const msgBruta = String(err?.message || '');
  if (/is not a function|n[ãa]o [ée] uma fun[çc][ãa]o|is not defined|cannot read propert|of undefined|of null/i.test(msgBruta)) {
    return `Falha no próprio totem, não na internet (${msgBruta}). Esperar não resolve — avise quem cuida do sistema.`;
  }

  // ⚠️⚠️ O 401 do `src/api.js` chega AQUI SEM STATUS: aquele ramo é tratado
  // antes do `if (!res.ok)` e lança um Error só com a mensagem. Sem esta
  // peneira, sessão expirada no tablet apareceria como "espere a internet
  // voltar" — e ninguém faria a única coisa que resolve, que é logar de novo.
  if (/sess[ãa]o|n[ãa]o autorizado|expir/i.test(msgBruta)) {
    return 'A sessão deste totem expirou. Faça login de novo neste aparelho para voltar a reservar os códigos.';
  }
  // ⚠️ O resto sem status é o `fetch` que nem chegou ao servidor — e este é o
  // ÚNICO que se resolve sozinho, então é o único que não manda chamar ninguém.
  return 'Não deu para falar com o servidor agora — assim que a internet voltar, o totem tenta sozinho.';
}
