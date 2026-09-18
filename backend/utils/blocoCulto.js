// ============================================================================
// O BLOCO de um culto · quais celebrações rodam a MESMA liturgia no mesmo dia
// (2026-09-03 · régua PURA, testada no gate em src/test/blocoCulto.test.ts)
//
// Desenho do Marcos: *"mantendo a definição de culto como domingo manhã, já que
// fazemos a mesma liturgia — na prática não precisa criar dois cultos porque
// aqui nós repetimos o culto de domingo manhã seguidos … 1 culto, times split
// aparecem com horário acima nos times que isso for habilitado"*.
//
// ⇒ O BLOCO é o conjunto de celebrações do dia que compartilham liturgia
// (ordem de culto e template). O domingo de manhã é UM bloco com DUAS
// celebrações (09:30 e 11:30). É isto que permite:
//   · template e ordem de culto ÚNICOS por bloco (não duplicar a liturgia);
//   · escala por CELEBRAÇÃO quando o time é `split_por_horario`.
//
// ⚠️⚠️ A CHAVE É `vol_service_types.bloco_servico`, E SÓ ELA.
// `linhagem_key` e `consolidacao_key` NÃO servem, e confundi-las corromperia
// relatório: as duas são SÉRIE TEMPORAL, não simultaneidade —
//   · `linhagem_key`     = "o 10:00 VIROU 09:30" (continuidade, lente do Matheus);
//   · `consolidacao_key` = "08:30 + 10:00 no passado × o 09:30 novo, somados por
//                           SEMANA" (lente do Pr. Juninho).
// As duas têm consumidor vivo em `utils/lentesDomingo.js` +
// `routes/dashboardSemanal.js`. Medido em 03/09: `consolidacao_key` do
// `Domingo 09:30` é `domingo-0930` e agrupa os horários EXTINTOS — usá-la aqui
// diria que a manhã de hoje tem três celebrações, duas delas encerradas.
//
// ⚠️ VIGÊNCIA É OBRIGATÓRIA, e reusa `tipoVigenteEm` de `lentesDomingo` em vez
// de reimplementar. Sem ela o bloco `dom_manha` traria o 08:30 e o 10:00, que
// encerraram em 23/08 — o alvo seria materializado para celebrações que não
// acontecem mais, e a cobertura pediria gente pra culto inexistente.
//
// ⚠️⚠️ LIMITAÇÃO MEDIDA (e aceita): `tipoVigenteEm` reprova `is_active === false`
// INDEPENDENTE da data — ela mistura a bandeira de hoje com a janela histórica.
// Logo **bloco de data PASSADA com tipo já extinto não é reconstruível** (pedir
// o bloco do 08:30 em 16/08 devolve vazio). Para o produtor isso é indiferente:
// template só se aplica a culto FUTURO. E consertar a régua lá quebraria a lente
// do domingo, que tem consumidor vivo. Tem caso de teste nomeando isto.
//
// ⚠️ FAIL-SAFE: sem tipo resolvível, sem bloco, ou sem culto no dia, devolve
// **lista vazia**. Quem chama trata vazio como "não dá pra dividir por
// horário" e materializa uma linha de BLOCO (`culto_id = NULL`), que é
// exatamente o comportamento de hoje. Nunca inventa celebração.
// ============================================================================
'use strict';

const { tipoVigenteEm } = require('./lentesDomingo');

/**
 * Os tipos de culto que compõem o bloco de `tipo`, vigentes em `diaISO`.
 *
 * Sem `bloco_servico`, o bloco é o próprio tipo (culto solitário: quarta, AMI,
 * Bridge, domingo à noite). É o caso da maioria e não precisa de configuração.
 *
 * @param {{id:string, bloco_servico?:string|null}|null} tipo
 * @param {Array<object>} tipos  todos os tipos de culto
 * @param {string} diaISO  'AAAA-MM-DD' (dia BRT do culto)
 * @returns {Array<object>} tipos do bloco (vazio se `tipo` não for vigente)
 */
function tiposDoBloco(tipo, tipos, diaISO) {
  if (!tipo || !diaISO) return [];
  if (!tipoVigenteEm(tipo, diaISO)) return [];
  const bloco = tipo.bloco_servico || null;
  if (!bloco) return [tipo];
  return (tipos || []).filter((t) => t && t.bloco_servico === bloco && tipoVigenteEm(t, diaISO));
}

/**
 * As celebrações (linhas de `cultos`) do bloco, no dia do culto.
 *
 * ⚠️ Ordenado por HORA: o app mostra o horário acima do time, e ordem instável
 * faria as colunas do carrossel dançarem entre aberturas.
 *
 * @param {{tipo:object|null, tipos:Array<object>, cultos:Array<object>, diaISO:string}} e
 * @returns {Array<object>} cultos do bloco (vazio ⇒ trate como bloco único)
 */
function cultosDoBloco({ tipo, tipos, cultos, diaISO }) {
  const doBloco = tiposDoBloco(tipo, tipos, diaISO);
  if (!doBloco.length) return [];
  const ids = new Set(doBloco.map((t) => t.id).filter(Boolean));
  return (cultos || [])
    .filter((c) => c && ids.has(c.service_type_id) && String(c.data || '').slice(0, 10) === diaISO)
    .slice()
    .sort((a, b) => String(a.hora || '').localeCompare(String(b.hora || '')));
}

/**
 * O bloco tem mais de uma celebração? É a pergunta que decide se vale dividir.
 *
 * ⚠️ Com UMA celebração, dividir não agrega nada e só cria linha de alvo com
 * `culto_id` onde o NULL diria a mesma coisa — então quem chama deve tratar
 * `false` como "materializa no bloco".
 */
function blocoTemHorarios(e) {
  return cultosDoBloco(e).length > 1;
}

module.exports = { tiposDoBloco, cultosDoBloco, blocoTemHorarios };
