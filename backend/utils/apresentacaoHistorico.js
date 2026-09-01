// ============================================================================
// Apresentação de crianças · o que já ACONTECEU × o que ainda VEM (20/08/2026)
//
// Pedido do Matheus: *"se a pessoa clicar em apresentação de crianças, deve
// abrir a tela de inscrição e com histórico também, caso esse membro já tenha
// apresentado alguma criança anteriormente"*.
//
// ⚠️⚠️ O ENDPOINT DESCARTAVA O HISTÓRICO. O `GET /app/apresentacao-crianca`
// filtrava `data_apresentacao >= hoje` — então quem já apresentou um filho não
// via nada, e a tela não tinha como saber que existia.
//
// ⚠️⚠️ E BUSCAR SÓ POR `responsavel_membro_id` DARIA HISTÓRICO VAZIO PRA TODO
// MUNDO. Medido em produção (20/08): das 12 apresentações vivas, **as 5 passadas
// têm `responsavel_membro_id` NULO** (vieram do formulário público, que não
// resolve membro). As duas passadas que dá pra atribuir chegam **só** pela ficha
// do Kids. É a lição do telefone do voluntariado (13/08): *"não procurei no
// lugar certo" não é "a pessoa não tem"* — e campo vazio PARECE dado, então
// ninguém investiga.
// ============================================================================

/** Dia de HOJE no fuso da igreja (BRT, -03:00), como 'YYYY-MM-DD'. */
function hojeBRT(agoraMs = Date.now()) {
  // ⚠️ `toISOString()` sobre o agora dá o dia UTC, e das 21h no Rio ele já
  // virou: a apresentação DE HOJE sairia de "próximas" no fim da tarde de
  // sábado. Mesma armadilha do censo, do totem Kids e do "culto de agora".
  return new Date(agoraMs - 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/**
 * Separa as linhas em `proximas` (data >= hoje) e `historico` (data < hoje).
 *
 * ⚠️ `proximas` sai em ordem CRESCENTE (a mais próxima primeiro — é a que a
 * família está esperando) e `historico` em DECRESCENTE (a mais recente primeiro,
 * como todo histórico se lê). Uma ordem só faria uma das duas listas começar
 * pelo item menos interessante.
 *
 * ⚠️ Linha SEM data não é descartada: vai pra `proximas` no fim. Some da tela
 * seria pior — o pedido existe e a família não saberia que ele foi registrado.
 */
function separar(linhas, hoje = hojeBRT()) {
  const proximas = [];
  const historico = [];
  const semData = [];
  for (const l of linhas || []) {
    const d = l?.data_apresentacao ? String(l.data_apresentacao).slice(0, 10) : null;
    if (!d) { semData.push(l); continue; }
    (d >= hoje ? proximas : historico).push(l);
  }
  proximas.sort((a, b) => String(a.data_apresentacao).localeCompare(String(b.data_apresentacao)));
  historico.sort((a, b) => String(b.data_apresentacao).localeCompare(String(a.data_apresentacao)));
  return { proximas: [...proximas, ...semData], historico };
}

// Como esta apresentação foi atribuída à pessoa. Vai NA RESPOSTA porque a força
// da evidência é diferente, e a tela precisa poder dizer de onde veio.
const ORIGENS = Object.freeze(['vinculo', 'cpf', 'ficha_kids']);

/**
 * Junta as linhas dos vários caminhos de resolução, sem repetir.
 *
 * ⚠️ A ORDEM DE PRECEDÊNCIA É A FORÇA DA EVIDÊNCIA — vínculo direto > CPF >
 * ficha do Kids. A mesma linha pode chegar por dois caminhos, e a que fica é a
 * do sinal mais forte: `via` é exibido, e mostrar "achamos pela ficha do Kids"
 * quando existe vínculo direto seria descrever o dado de forma mais fraca do
 * que ele é.
 */
function juntar(porCaminho) {
  const vistos = new Map();
  for (const via of ORIGENS) {
    for (const l of porCaminho?.[via] || []) {
      if (!l?.id || vistos.has(l.id)) continue;
      vistos.set(l.id, { ...l, via });
    }
  }
  return [...vistos.values()];
}

module.exports = { hojeBRT, separar, juntar, ORIGENS };
