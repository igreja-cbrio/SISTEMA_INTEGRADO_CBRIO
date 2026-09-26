// ════════════════════════════════════════════════════════════════════════════
//  Qual DATA de batismo a pessoa pode escolher — e por que isso virou um dado.
//
//  Pedido do Matheus (25/09/2026): *"preciso que na inscrição de batismo tenha
//  como escolher o mês, aí a pessoa escolhe o mês e vão aparecer os horários
//  disponíveis daquele mês. Isso deve refletir tanto no formulário público
//  quanto no app dos membros."*
//
//  ⚠️⚠️ ATÉ AQUI A DATA NÃO ERA UM DADO, ERA UMA CONTA. `fn_proximo_quarto_domingo()`
//  calculava o 4º domingo em tempo de execução, e o batismo não existia em
//  tabela nenhuma. Medido em 25/09/2026 nas 32 cerimônias desde fev/2024: a
//  fórmula acerta 31. A que falhou foi **dez/2024, antecipado para 15/12** (3º
//  domingo) — quase certamente por causa do Natal.
//
//  ⇒ Com inscrição aberta para 3 meses, alguém reserva em setembro uma data de
//  dezembro que a igreja ainda pode mover. Uma conta não tem como ser movida;
//  um cadastro tem. Daí `batismo_eventos`.
//
//  ⚠️ A fórmula NÃO morreu: ela virou o SEMEADOR da tabela (12 meses à frente,
//  automático). Isso mata o único risco real de cadastro — tabela vazia
//  deixando o formulário mudo. O gestor só edita a exceção.
//
//  ⚠️ ESTA RÉGUA VIVE EM `utils/`, PURA, de propósito: guarda que decide algo
//  dentro do serviço que lê o banco é guarda que nenhum mutante alcança.
// ════════════════════════════════════════════════════════════════════════════

// Quantas datas o formulário oferece. 3 = o mês corrente e os dois seguintes,
// que é o horizonte que o pedido descreve ("um batismo do mês que vem").
const DATAS_ABERTAS_PADRAO = 3;

const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** `true` só para 'YYYY-MM-DD' que é uma data real (rejeita 2026-02-31). */
function dataIso(v) {
  const s = String(v || '').trim();
  if (!ISO.test(s)) return null;
  const [a, m, d] = s.split('-').map(Number);
  const dt = new Date(Date.UTC(a, m - 1, d));
  if (dt.getUTCFullYear() !== a || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return s;
}

/**
 * A data que a inscrição deve gravar.
 *
 * ⚠️⚠️ FALHA FECHADA: sem lista de datas abertas, NÃO devolve a escolhida nem
 * inventa uma. Devolver a escolhida sem poder conferi-la é como o `POST` de
 * batismo se comportava antes de 11/08 — aceitava horário que o catálogo não
 * tinha, e uma cerimônia terminou com 12 pessoas num limite de 11.
 *
 * ⚠️ Escolha AUSENTE cai na primeira data aberta, e isso não é tolerância: é o
 * que mantém o app antigo funcionando. O bundle em campo não sabe mandar data;
 * se ausência fosse erro, o OTA trancaria a inscrição de quem não atualizou —
 * o mesmo portão que trancou a frota em 06/08.
 *
 * @param escolhida     'YYYY-MM-DD' ou vazio
 * @param datasAbertas  ['YYYY-MM-DD', ...] em ordem crescente
 * @returns { data, motivo }  `data` null quando não dá para gravar
 */
function resolverDataBatismo(escolhida, datasAbertas) {
  const lista = (Array.isArray(datasAbertas) ? datasAbertas : [])
    .map(dataIso)
    .filter(Boolean);
  if (lista.length === 0) return { data: null, motivo: 'sem_datas_abertas' };

  const pedida = dataIso(escolhida);
  // Sem escolha (app antigo, formulário sem seletor) → a próxima.
  if (!pedida) {
    if (escolhida !== undefined && escolhida !== null && String(escolhida).trim() !== '') {
      // Mandou algo que não é data: isso é erro do cliente, não ausência.
      return { data: null, motivo: 'data_invalida' };
    }
    return { data: lista[0], motivo: null };
  }
  if (!lista.includes(pedida)) return { data: null, motivo: 'data_fora_da_janela' };
  return { data: pedida, motivo: null };
}

/** A frase que a pessoa lê quando a data não serve. */
function mensagemData(motivo) {
  switch (motivo) {
    case 'sem_datas_abertas':
      return 'As datas de batismo ainda não foram abertas. Fale com a equipe da igreja.';
    case 'data_invalida':
      return 'Data de batismo inválida.';
    case 'data_fora_da_janela':
      return 'Essa data de batismo não está mais disponível. Escolha uma das datas oferecidas.';
    default:
      return null;
  }
}

module.exports = { DATAS_ABERTAS_PADRAO, dataIso, resolverDataBatismo, mensagemData };
