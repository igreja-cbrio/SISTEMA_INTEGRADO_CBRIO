// Grupos · agenda derivada da recorrência + exceções (Naná · 18/08/2026).
//
// O encontro recorrente NÃO é uma linha no banco: nasce de
// `mem_grupos.dia_semana` + `horario`. As exceções (cancelar/remarcar UMA
// ocorrência) vivem em `mem_grupo_agenda_excecoes`. Régua PURA aqui — sem
// banco, sem relógio implícito — pra entrar no gate de deploy.
//
// ⚠️⚠️ TUDO EM BRT. O `proximoEncontroISO` antigo fazia `new Date().getDay()`,
// que no Vercel é UTC: das 21h de domingo em diante o servidor já acha que é
// segunda e devolve a ocorrência da semana seguinte. É a mesma classe de bug
// já documentada no censo, no Kids e no `cultoDeAgora` — dia de operação da
// igreja é BRT, sempre.

const FUSO_BRT_MIN = -180; // -03:00, sem horário de verão no Brasil desde 2019

// "Agora" em BRT como componentes de calendário (ano/mês/dia/hora/min).
function agoraBRT(agora = new Date()) {
  const d = new Date(agora.getTime() + FUSO_BRT_MIN * 60000);
  return {
    ano: d.getUTCFullYear(), mes: d.getUTCMonth() + 1, dia: d.getUTCDate(),
    hora: d.getUTCHours(), min: d.getUTCMinutes(), diaSemana: d.getUTCDay(),
  };
}

const pad = n => String(n).padStart(2, '0');
const iso = (a, m, d) => `${a}-${pad(m)}-${pad(d)}`;

// Soma dias a uma data de calendário, sem passar por fuso.
function somarDias(dataISO, dias) {
  const [a, m, d] = dataISO.split('-').map(Number);
  const base = new Date(Date.UTC(a, m - 1, d));
  base.setUTCDate(base.getUTCDate() + dias);
  return iso(base.getUTCFullYear(), base.getUTCMonth() + 1, base.getUTCDate());
}

function diaSemanaDe(dataISO) {
  const [a, m, d] = dataISO.split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, d)).getUTCDay();
}

// Instante UTC de uma data+hora que são de BRT (é o que vai no ISO da API).
function instanteISO(dataISO, horario) {
  const [a, m, d] = dataISO.split('-').map(Number);
  const [hh, mm] = String(horario || '19:00').split(':').map(x => parseInt(x, 10) || 0);
  return new Date(Date.UTC(a, m - 1, d, hh, mm) - FUSO_BRT_MIN * 60000).toISOString();
}

const hhmm = h => String(h || '19:00').slice(0, 5);

// Próximas `quantas` ocorrências, já com as exceções aplicadas.
// `excecoes`: [{ data_original, status, nova_data, novo_horario, motivo }]
//
// ⚠️ A ocorrência CANCELADA continua na lista (marcada), em vez de sumir: o
// líder precisa ver que cancelou — e precisa poder DESFAZER. Sumir daria a
// impressão de que o cancelamento não pegou.
function proximasOcorrencias({ diaSemana, horario, excecoes = [], agora = new Date(), quantas = 8, janelaDias = 120 }) {
  if (diaSemana === null || diaSemana === undefined || diaSemana === '') return [];
  const alvo = Number(diaSemana);
  if (!Number.isInteger(alvo) || alvo < 0 || alvo > 6) return [];

  const n = agoraBRT(agora);
  const hojeISO = iso(n.ano, n.mes, n.dia);
  const porData = new Map();
  for (const e of excecoes || []) if (e && e.data_original) porData.set(String(e.data_original).slice(0, 10), e);

  // ⚠️ Começa em `delta === 0` (hoje) e só descarta se a HORA já passou —
  // encontro de hoje à noite tem que continuar sendo "o próximo" durante o dia.
  let delta = (alvo - n.diaSemana + 7) % 7;
  const out = [];
  for (let i = 0; out.length < quantas && delta + i * 7 <= janelaDias; i++) {
    const dataOrig = somarDias(hojeISO, delta + i * 7);
    const ex = porData.get(dataOrig);
    const cancelado = ex?.status === 'cancelado';
    const remarcado = ex?.status === 'remarcado';
    const dataFinal = remarcado ? String(ex.nova_data).slice(0, 10) : dataOrig;
    const horaFinal = hhmm(remarcado && ex.novo_horario ? ex.novo_horario : horario);

    // Já passou? Compara data+hora em BRT.
    const passou = dataFinal < hojeISO
      || (dataFinal === hojeISO && (n.hora * 60 + n.min) > (parseInt(horaFinal.slice(0, 2), 10) * 60 + parseInt(horaFinal.slice(3, 5), 10)));
    if (passou) continue;

    out.push({
      data_original: dataOrig,
      data: dataFinal,
      horario: horaFinal,
      inicio: instanteISO(dataFinal, horaFinal),
      status: cancelado ? 'cancelado' : (remarcado ? 'remarcado' : 'normal'),
      motivo: ex?.motivo || null,
      dia_semana: diaSemanaDe(dataFinal),
    });
  }
  return out;
}

// O que o box "Próximo encontro" mostra: a 1ª ocorrência NÃO cancelada.
// ⚠️ Devolve null quando as próximas estão todas canceladas — e o app diz isso,
// em vez de mostrar uma data que não vai acontecer.
function proximoEncontro(args) {
  const lista = proximasOcorrencias(args);
  return lista.find(o => o.status !== 'cancelado') || null;
}

module.exports = { agoraBRT, proximasOcorrencias, proximoEncontro, instanteISO, somarDias, FUSO_BRT_MIN };
