// ============================================================================
// NEXT · a régua das turmas do mês (2026-08-26)
//
// Mudança pedida pelo Matheus: o Next passou a ser **UM encontro por turma**, e
// há **uma turma por domingo**, sempre no culto de **09:30**. Antes eram 2
// encontros por turma (aula 1 + aula 2) e ~2 turmas por mês.
//
// ⚠️ Isto é régua PURA de propósito — mora em `backend/utils/` para entrar no
// gate de deploy (`npm test`). Quem lê o banco é
// `backend/services/nextTurmasAuto.js`; quem decide QUAIS turmas devem existir
// é este arquivo, e só ele.
//
// ⚠️ Decisão do Matheus (26/08) sobre mês com 5 domingos: **uma turma por
// domingo**, então abre 5. A coordenação cancela a que não vai acontecer. O
// contrário — fixar 4 — deixaria um domingo com culto de 09:30 acontecendo e
// ninguém conseguindo se inscrever nele.
// ============================================================================

/** Horário do culto em que o Next acontece. Espelha `vol_service_types` "Domingo 09:30". */
const HORARIO_NEXT = '09:30';

/** Encontros por turma. Era 2 até 25/08/2026. */
const ENCONTROS_POR_TURMA = 1;

const RE_MES = /^\d{4}-(0[1-9]|1[0-2])$/;
const RE_DIA = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

function mesValido(mes) { return RE_MES.test(String(mes || '')); }
function diaValido(dia) { return RE_DIA.test(String(dia || '')); }

/**
 * Dia da semana de uma data 'YYYY-MM-DD' (0 = domingo).
 *
 * ⚠️ `new Date('2026-09-06').getDay()` é o dia no fuso LOCAL de uma data
 * interpretada como meia-noite UTC — no Rio isso é 21h do dia anterior, então
 * um domingo vira sábado. `Date.UTC` + `getUTCDay` não depende de fuso nenhum,
 * que é o que se quer para uma data de calendário.
 */
function diaDaSemana(dia) {
  if (!diaValido(dia)) return null;
  const [a, m, d] = String(dia).split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, d)).getUTCDay();
}

/** Todos os domingos do mês 'YYYY-MM', em ordem. Mês inválido devolve []. */
function domingosDoMes(mes) {
  if (!mesValido(mes)) return [];
  const [a, m] = String(mes).split('-').map(Number);
  const ultimoDia = new Date(Date.UTC(a, m, 0)).getUTCDate();
  const out = [];
  for (let d = 1; d <= ultimoDia; d++) {
    if (new Date(Date.UTC(a, m - 1, d)).getUTCDay() === 0) {
      out.push(`${mes}-${String(d).padStart(2, '0')}`);
    }
  }
  return out;
}

/** 'YYYY-MM' de uma data. */
function mesDe(dia) { return diaValido(dia) ? String(dia).slice(0, 7) : null; }

/** Mês seguinte a 'YYYY-MM'. */
function proximoMes(mes) {
  if (!mesValido(mes)) return null;
  const [a, m] = String(mes).split('-').map(Number);
  return m === 12 ? `${a + 1}-01` : `${a}-${String(m + 1).padStart(2, '0')}`;
}

/** Hoje no fuso da igreja (BRT), como 'YYYY-MM-DD'. `agora` só existe para teste. */
function hojeBRT(agora = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(agora);
}

/**
 * Nome da turma daquele domingo. Leva o ano de propósito: o nome aparece na
 * lista do módulo, na mensagem de WhatsApp e no seletor do formulário público,
 * e "Domingo 06/09" sem ano fica ambíguo entre anos.
 */
function nomeTurma(dia) {
  if (!diaValido(dia)) return null;
  const [a, m, d] = String(dia).split('-');
  return `Next · ${d}/${m}/${a}`;
}

/**
 * As turmas que DEVEM existir num mês: uma por domingo AINDA POR VIR, um
 * encontro cada. `numero` é o número do encontro DENTRO da turma — sempre 1,
 * agora que a turma tem um só. (O CHECK de `next_encontros.numero` é 1..4; ele
 * nunca é o número do domingo, senão o 5º domingo violaria a constraint.)
 *
 * ⚠️⚠️ DOMINGO QUE JÁ PASSOU NÃO ENTRA. Sem esse corte, a primeira execução da
 * rotina abriria uma turma para cada domingo já vencido do mês corrente — em
 * 26/08/2026 seriam 4 turmas de agosto (02, 09, 16 e 23) para encontros que já
 * aconteceram, colidindo com as turmas reais daquelas datas. `agora` só existe
 * para teste.
 */
function turmasPlanejadas(mes, agora = new Date()) {
  return domingosInscritiveis(domingosDoMes(mes), agora).map(dia => ({
    data: dia,
    nome: nomeTurma(dia),
    horario: HORARIO_NEXT,
    encontros: [{ numero: 1, data: dia }],
  }));
}

/**
 * Os meses que a rotina automática deve garantir: o corrente e o seguinte.
 *
 * ⚠️ O mês seguinte entra SEMPRE, não só no fim do mês: o formulário público
 * mostra os domingos ainda por vir, e quem se inscreve no dia 28 precisa poder
 * escolher um domingo de setembro. Garantir os dois é idempotente e barato.
 */
function mesesAGarantir(agora = new Date()) {
  const mes = mesDe(hojeBRT(agora));
  return [mes, proximoMes(mes)];
}

/**
 * Domingos que ainda podem receber inscrição: hoje ou no futuro.
 *
 * ⚠️ Usada por `turmasPlanejadas`, que é declarada ANTES desta — funciona pelo
 * hoisting de `function`. NÃO converter para `const` sem mover (é o TDZ que
 * derrubou o formulário no sweep de 28/07).
 * Domingo que já passou não é opção — a pessoa escolheria um encontro que não
 * vai acontecer, e a matrícula nasceria numa turma vencida.
 */
function domingosInscritiveis(dias, agora = new Date()) {
  const hoje = hojeBRT(agora);
  return (Array.isArray(dias) ? dias : [])
    .filter(d => diaValido(d) && d >= hoje)
    .sort();
}

module.exports = {
  HORARIO_NEXT, ENCONTROS_POR_TURMA,
  mesValido, diaValido, diaDaSemana, domingosDoMes, mesDe, proximoMes,
  hojeBRT, nomeTurma, turmasPlanejadas, mesesAGarantir, domingosInscritiveis,
};
