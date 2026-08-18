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

// ⚠️⚠️ A CADÊNCIA vem de `mem_grupos.recorrencia`, e NÃO era lida (18/08):
// a régua antiga somava 7 dias sempre. Medido em produção: dos 104 grupos
// ativos, **37 não são semanais** (29 quinzenal · 5 mensal · 3 diário) — ou
// seja, um terço dos grupos via data errada no box "Próximo encontro".
//
// ⚠️ `mensal` = 28 dias (4 semanas), NÃO "mesmo dia do mês": o grupo é
// identificado por `dia_semana`, então "toda terça" tem que continuar caindo
// numa terça. Somar 30 dias andaria pelo calendário e o grupo de terça cairia
// numa quinta.
const CADENCIA_DIAS = { diario: 1, semanal: 7, quinzenal: 14, mensal: 28 };
function cadenciaDias(recorrencia) {
  const k = String(recorrencia || '').trim().toLowerCase();
  return CADENCIA_DIAS[k] || 7; // desconhecido/nulo cai no semanal, que é a maioria
}

// ⚠️⚠️ QUINZENAL E MENSAL PRECISAM DE ÂNCORA — e quase nenhum grupo tem.
// Saber que é "de 14 em 14 dias, às terças" não diz EM QUAL terça. A única
// evidência no banco é o último encontro REGISTRADO (`mem_grupo_encontros`), e
// medido em 18/08: **36 dos 37 grupos não-semanais nunca registraram um**.
// Sem âncora a régua devolve UMA ocorrência só, marcada `ancora_incerta`, em
// vez de listar 6 datas que têm 50% de chance de estarem todas erradas.
// Chutar a agenda inteira seria afirmar como fato o que é palpite.

// Janela em que a ocorrência pode ser REMARCADA.
//
// ⚠️ A régua é `min(LIMITE, véspera do próximo encontro)`, e as duas metades
// existem por motivos diferentes:
//  - "não alcançar o próximo": mover a reunião de terça para daqui a 15 dias
//    não faz sentido — nesse meio-tempo já houve outra. Sai sozinho da cadência
//    do grupo (semanal ⇒ 6 dias · quinzenal ⇒ 13 · mensal ⇒ 27).
//  - o teto de 7 dias: sem ele, um grupo MENSAL poderia empurrar o encontro
//    para o dia anterior ao seguinte — duas reuniões em dias seguidos.
// Quem precisa mover mais que isso não está remarcando: está CANCELANDO aquele
// encontro, e esse caminho existe ao lado.
const LIMITE_REMARCA_DIAS = 7;

function janelaRemarcacao({ dataOriginal, anteriorISO = null, proximaISO = null, hojeISO, limiteDias = LIMITE_REMARCA_DIAS }) {
  if (!dataOriginal || !hojeISO) return null;
  const orig = String(dataOriginal).slice(0, 10);
  // ⚠️ Nunca no passado: remarcar para ontem não é remarcar.
  let de = somarDias(orig, -limiteDias);
  if (de < hojeISO) de = hojeISO;
  if (anteriorISO) {
    const piso = somarDias(String(anteriorISO).slice(0, 10), 1);
    if (piso > de) de = piso;
  }
  let ate = somarDias(orig, limiteDias);
  if (proximaISO) {
    const teto = somarDias(String(proximaISO).slice(0, 10), -1);
    if (teto < ate) ate = teto;
  }
  // Janela vazia (o próximo encontro é amanhã, por exemplo): só resta cancelar.
  return { de, ate, pode: de <= ate };
}

// Próximas `quantas` ocorrências, já com as exceções aplicadas.
// `excecoes`: [{ data_original, status, nova_data, novo_horario, motivo }]
//
// ⚠️ A ocorrência CANCELADA continua na lista (marcada), em vez de sumir: o
// líder precisa ver que cancelou — e precisa poder DESFAZER. Sumir daria a
// impressão de que o cancelamento não pegou.
function proximasOcorrencias({
  diaSemana, horario, recorrencia = 'semanal', ancoraISO = null,
  excecoes = [], agora = new Date(), quantas = 8, janelaDias = 180,
}) {
  // ⚠️⚠️ `Number(null) === 0` e 0 é DOMINGO (falsy que passa em Number.isInteger).
  // Sem esta guarda, grupo sem dia marcado vira grupo de domingo — são 4 ativos
  // hoje, e a agenda deles seria inventada. Armadilha já registrada em "grupos ·
  // dados incompletos": dia_semana=0 é domingo, não "vazio".
  const semDia = diaSemana === null || diaSemana === undefined || diaSemana === '';

  const passo = cadenciaDias(recorrencia);
  if (semDia && passo !== 1) return []; // diário não usa dia da semana
  const n = agoraBRT(agora);
  const hojeISO = iso(n.ano, n.mes, n.dia);

  const porData = new Map();
  for (const e of excecoes || []) if (e && e.data_original) porData.set(String(e.data_original).slice(0, 10), e);

  // ── 1. As DATAS ORIGINAIS que a recorrência produz, do passado imediato até
  //       o fim da janela. A anterior entra porque é o PISO da remarcação.
  const originais = [];
  let ancoraIncerta = false;

  if (passo === 1) {
    // Diário: `dia_semana` não governa nada.
    for (let i = -1; i * 1 <= janelaDias; i++) originais.push(somarDias(hojeISO, i));
  } else {
    const alvo = Number(diaSemana);
    if (!Number.isInteger(alvo) || alvo < 0 || alvo > 6) return [];

    if (passo === 7) {
      const delta = (alvo - n.diaSemana + 7) % 7;
      for (let i = -1; delta + i * 7 <= janelaDias; i++) originais.push(somarDias(hojeISO, delta + i * 7));
    } else if (ancoraISO) {
      // ⚠️ A âncora é um encontro REAL (data de `mem_grupo_encontros`); a partir
      // dela a cadência é determinística. Anda até alcançar hoje e segue.
      let d = String(ancoraISO).slice(0, 10);
      while (somarDias(d, passo) <= hojeISO) d = somarDias(d, passo);
      originais.push(d); // a anterior (piso)
      for (let k = 1; ; k++) {
        const prox = somarDias(d, k * passo);
        originais.push(prox);
        if (prox > somarDias(hojeISO, janelaDias)) break;
      }
    } else {
      // ⚠️ Sem âncora: só a PRÓXIMA ocorrência do dia da semana, e declarada
      // como incerta. Listar a agenda inteira seria chute com cara de fato.
      ancoraIncerta = true;
      originais.push(somarDias(hojeISO, (alvo - n.diaSemana + 7) % 7));
    }
  }

  // ── 2. Aplica exceções, descarta o que já passou, anexa a janela de edição.
  const out = [];
  for (let i = 0; i < originais.length && out.length < quantas; i++) {
    const dataOrig = originais[i];
    const ex = porData.get(dataOrig);
    const cancelado = ex?.status === 'cancelado';
    const remarcado = ex?.status === 'remarcado';
    const dataFinal = remarcado ? String(ex.nova_data).slice(0, 10) : dataOrig;
    const horaFinal = hhmm(remarcado && ex.novo_horario ? ex.novo_horario : horario);

    const passou = dataFinal < hojeISO
      || (dataFinal === hojeISO && (n.hora * 60 + n.min) > (parseInt(horaFinal.slice(0, 2), 10) * 60 + parseInt(horaFinal.slice(3, 5), 10)));
    if (passou) continue;

    const janela = janelaRemarcacao({
      dataOriginal: dataOrig,
      anteriorISO: originais[i - 1] || null,
      proximaISO: originais[i + 1] || null,
      hojeISO,
    });

    out.push({
      data_original: dataOrig,
      data: dataFinal,
      horario: horaFinal,
      inicio: instanteISO(dataFinal, horaFinal),
      status: cancelado ? 'cancelado' : (remarcado ? 'remarcado' : 'normal'),
      motivo: ex?.motivo || null,
      dia_semana: diaSemanaDe(dataFinal),
      pode_remarcar: !!janela?.pode,
      remarcar_de: janela?.de || null,
      remarcar_ate: janela?.ate || null,
      ancora_incerta: ancoraIncerta,
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

module.exports = {
  agoraBRT, proximasOcorrencias, proximoEncontro, instanteISO, somarDias,
  cadenciaDias, janelaRemarcacao, FUSO_BRT_MIN, LIMITE_REMARCA_DIAS, CADENCIA_DIAS,
};
