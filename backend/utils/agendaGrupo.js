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

// Gera as DATAS ORIGINAIS da recorrência (sem exceções), do passado imediato
// até o fim da janela. Extraído porque o "encontro anterior" precisa da MESMA
// geração — duas cópias divergiriam no dia em que a cadência mudasse.
function gerarOriginais({ diaSemana, recorrencia, ancoraISO, hojeISO, diaSemanaHoje, janelaDias }) {
  const passo = cadenciaDias(recorrencia);
  const originais = [];
  let ancoraIncerta = false;

  // ⚠️⚠️ `Number(null) === 0` e 0 é DOMINGO — grupo sem dia marcado (4 ativos)
  // viraria grupo de domingo com agenda inventada. A guarda mora AQUI, no
  // gerador, e não em cada chamador: quando ela ficou fora, o `ocorrenciaAnterior`
  // nasceu sem ela e o teste pegou na hora.
  const semDia = diaSemana === null || diaSemana === undefined || diaSemana === '';
  if (semDia && passo !== 1) return { originais, ancoraIncerta }; // diário não usa dia da semana

  if (passo === 1) {
    for (let i = -1; i <= janelaDias; i++) originais.push(somarDias(hojeISO, i));
    return { originais, ancoraIncerta };
  }

  const alvo = Number(diaSemana);
  if (!Number.isInteger(alvo) || alvo < 0 || alvo > 6) return { originais: [], ancoraIncerta };

  if (passo === 7) {
    const delta = (alvo - diaSemanaHoje + 7) % 7;
    for (let i = -1; delta + i * 7 <= janelaDias; i++) originais.push(somarDias(hojeISO, delta + i * 7));
  } else if (ancoraISO) {
    // ⚠️ A âncora é um encontro REAL; a partir dela a cadência é determinística.
    let d = String(ancoraISO).slice(0, 10);
    while (somarDias(d, passo) <= hojeISO) d = somarDias(d, passo);
    originais.push(d); // a anterior (piso)
    for (let k = 1; ; k++) {
      const prox = somarDias(d, k * passo);
      originais.push(prox);
      if (prox > somarDias(hojeISO, janelaDias)) break;
    }
  } else {
    // ⚠️ Sem âncora: só a PRÓXIMA ocorrência do dia da semana, declarada incerta.
    ancoraIncerta = true;
    originais.push(somarDias(hojeISO, (alvo - diaSemanaHoje + 7) % 7));
  }
  return { originais, ancoraIncerta };
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
  const n = agoraBRT(agora);
  const hojeISO = iso(n.ano, n.mes, n.dia);

  const porData = new Map();
  for (const e of excecoes || []) if (e && e.data_original) porData.set(String(e.data_original).slice(0, 10), e);

  // ── 1. As datas originais (a anterior entra: é o PISO da remarcação).
  const { originais, ancoraIncerta } = gerarOriginais({
    diaSemana, recorrencia, ancoraISO, hojeISO,
    diaSemanaHoje: n.diaSemana, janelaDias,
  });

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

// O ENCONTRO ANTERIOR (o mais recente até hoje), já com a exceção aplicada.
//
// ⚠️⚠️ É disto que o herói da tela de gerenciar precisa pra dizer "faltou
// registrar". Ele calculava sozinho por `dia_semana` e NÃO sabia das exceções:
// o líder remarcava o encontro de 18 para 20 e o topo continuava cobrando o do
// dia 18 (relato do Marcos · 18/08). Duas contas para "quando é o encontro"
// sempre divergem — esta é a mesma que monta a agenda.
//
// Devolve `null` quando não há anterior OU quando ela foi CANCELADA: encontro
// cancelado não gera pendência de chamada.
function ocorrenciaAnterior({ diaSemana, horario, recorrencia = 'semanal', ancoraISO = null, excecoes = [], agora = new Date() }) {
  const n = agoraBRT(agora);
  const hojeISO = iso(n.ano, n.mes, n.dia);
  const { originais } = gerarOriginais({
    diaSemana, recorrencia, ancoraISO, hojeISO,
    diaSemanaHoje: n.diaSemana, janelaDias: 0,
  });
  const porData = new Map();
  for (const e of excecoes || []) if (e && e.data_original) porData.set(String(e.data_original).slice(0, 10), e);

  let achada = null;
  for (const dataOrig of originais) {
    const ex = porData.get(dataOrig);
    const dataFinal = ex?.status === 'remarcado' ? String(ex.nova_data).slice(0, 10) : dataOrig;
    if (dataFinal > hojeISO) continue;
    if (!achada || dataFinal > achada.data) {
      achada = {
        data_original: dataOrig,
        data: dataFinal,
        status: ex?.status === 'cancelado' ? 'cancelado' : (ex?.status === 'remarcado' ? 'remarcado' : 'normal'),
      };
    }
  }
  if (!achada || achada.status === 'cancelado') return null;
  return achada;
}

// O que o box "Próximo encontro" mostra: a 1ª ocorrência NÃO cancelada.
// ⚠️ Devolve null quando as próximas estão todas canceladas — e o app diz isso,
// em vez de mostrar uma data que não vai acontecer.
function proximoEncontro(args) {
  const lista = proximasOcorrencias(args);
  return lista.find(o => o.status !== 'cancelado') || null;
}

// ============================================================================
// AS OCORRENCIAS QUE JA PASSARAM (Marcos - 25/08/2026)
//
// Pedido dele, sobre a aba Encontros do app: "quando eu nao preencho uma semana
// e preencho a outra ele da meio que um bug - ele provavelmente ficou em duvida
// se eu estava registrando a presenca do dia 18, ai ele marcou que o encontro
// foi dia 24. Acho que vale a pena sempre manter os encontros a vista: se a
// pessoa passar 1 semana e nao registrar, ele entra automaticamente como
// presenca nao registrada e pode ser registrada posteriormente se o lider
// quiser."
//
// ATENCAO A CAUSA do "bug" nao era duvida do sistema - era o app NAO MANDAR
// data nenhuma. O `POST /app/grupos/:id/encontros` ja aceitava `data` e caia em
// `hojeBRT()` quando ela nao vinha; a tela nunca mandou. Registrar no dia 24 a
// chamada do encontro do dia 18 gravava, corretamente do ponto de vista do
// servidor, um encontro no dia 24. A regua abaixo e o que da ao app a LISTA de
// datas possiveis, pra ele mandar a certa.
//
// Simetrica de `proximasOcorrencias`, com uma diferenca que importa: aqui SEM
// ANCORA NAO se inventa nada. Pra frente, uma ocorrencia incerta e um convite a
// registrar presenca (e a tela declara a incerteza); pra tras, ela seria uma
// cobranca de chamada de um encontro que talvez nunca tenha existido. Nunca
// listar passado que nao se sabe se aconteceu.
// ============================================================================

// Gera as DATAS ORIGINAIS que ja passaram, do mais recente para o mais antigo.
// Espelho de `gerarOriginais`, andando para tras - e com as MESMAS guardas
// (dia_semana ausente, cadencia lida de `recorrencia`, ancora obrigatoria fora
// do semanal).
function gerarOriginaisPassadas({ diaSemana, recorrencia, ancoraISO, hojeISO, diaSemanaHoje, quantas, desdeISO = null }) {
  const passo = cadenciaDias(recorrencia);
  const originais = [];

  // Number(null) === 0 e 0 e DOMINGO - grupo sem dia marcado viraria grupo de
  // domingo com historico inventado. Mesma guarda do gerador para frente.
  const semDia = diaSemana === null || diaSemana === undefined || diaSemana === '';
  if (semDia && passo !== 1) return originais;

  const dentro = (d) => !desdeISO || d >= String(desdeISO).slice(0, 10);

  if (passo === 1) {
    for (let i = 0; i < quantas; i++) {
      const d = somarDias(hojeISO, -i);
      if (!dentro(d)) break;
      originais.push(d);
    }
    return originais;
  }

  const alvo = Number(diaSemana);
  if (!Number.isInteger(alvo) || alvo < 0 || alvo > 6) return originais;

  if (passo === 7) {
    // A ultima ocorrencia do dia da semana em (ou antes de) hoje.
    const delta = (diaSemanaHoje - alvo + 7) % 7;
    for (let i = 0; i < quantas; i++) {
      const d = somarDias(hojeISO, -(delta + i * 7));
      if (!dentro(d)) break;
      originais.push(d);
    }
    return originais;
  }

  // Quinzenal/mensal SEM ANCORA devolve VAZIO, de proposito. "De 14 em 14 dias
  // as tercas" nao diz EM QUAL terca, e no passado a consequencia de chutar e
  // pior que no futuro: a tela cobraria a chamada de um encontro que talvez nao
  // tenha acontecido, e o lider registraria presenca na data errada.
  if (!ancoraISO) return originais;

  // Caminha da ancora para a frente ate passar de hoje, depois volta.
  let d = String(ancoraISO).slice(0, 10);
  while (somarDias(d, passo) <= hojeISO) d = somarDias(d, passo);
  for (let i = 0; i < quantas; i++) {
    const atual = somarDias(d, -i * passo);
    if (atual > hojeISO) continue;
    if (!dentro(atual)) break;
    originais.push(atual);
  }
  return originais;
}

/**
 * As ocorrencias que JA PASSARAM, mais recente primeiro, com as excecoes
 * aplicadas. E o que a aba Encontros usa para manter o historico a vista e
 * marcar o que ficou sem chamada.
 *
 * `registradas`: Set/array de datas ISO que JA tem encontro em
 * `mem_grupo_encontros`. Quem decide isso e o banco - a regua so carimba.
 *
 * Devolve { data_original, data, horario, status, motivo, dia_semana,
 * registrado }, onde `status` e:
 *   'registrado'     - houve encontro e a chamada foi feita
 *   'nao_registrado' - a ocorrencia passou e ninguem registrou (o que o Marcos
 *                      chamou de "presenca nao registrada" - registravel depois)
 *   'cancelado'      - o lider cancelou aquela reuniao => NAO e pendencia
 */
function ocorrenciasPassadas({
  diaSemana, horario, recorrencia = 'semanal', ancoraISO = null,
  excecoes = [], registradas = [], agora = new Date(), quantas = 12, desdeISO = null,
}) {
  const n = agoraBRT(agora);
  const hojeISO = iso(n.ano, n.mes, n.dia);
  const minutosAgora = n.hora * 60 + n.min;

  const porData = new Map();
  for (const e of excecoes || []) if (e && e.data_original) porData.set(String(e.data_original).slice(0, 10), e);
  const jaRegistradas = registradas instanceof Set
    ? registradas
    : new Set((registradas || []).map(d => String(d).slice(0, 10)));

  // Pede folga no gerador: ocorrencia remarcada PARA O FUTURO sai da lista, e
  // sem folga o historico voltaria curto sem motivo aparente.
  const originais = gerarOriginaisPassadas({
    diaSemana, recorrencia, ancoraISO, hojeISO,
    diaSemanaHoje: n.diaSemana, quantas: quantas + 4, desdeISO,
  });

  const out = [];
  for (const dataOrig of originais) {
    if (out.length >= quantas) break;
    const ex = porData.get(dataOrig);
    const cancelado = ex?.status === 'cancelado';
    const remarcado = ex?.status === 'remarcado';
    const dataFinal = remarcado ? String(ex.nova_data).slice(0, 10) : dataOrig;
    const horaFinal = hhmm(remarcado && ex.novo_horario ? ex.novo_horario : horario);

    // Remarcado PARA A FRENTE nao e passado: ele vive na agenda futura, e
    // lista-lo aqui como "nao registrado" cobraria chamada de encontro que
    // ainda vai acontecer.
    const jaPassou = dataFinal < hojeISO
      || (dataFinal === hojeISO
        && minutosAgora > (parseInt(horaFinal.slice(0, 2), 10) * 60 + parseInt(horaFinal.slice(3, 5), 10)));
    if (!jaPassou) continue;

    const registrado = jaRegistradas.has(dataFinal);
    out.push({
      data_original: dataOrig,
      data: dataFinal,
      horario: horaFinal,
      // Cancelado que TEM encontro registrado conta como registrado: o fato (a
      // chamada existe) vence a intencao (o lider havia cancelado).
      status: registrado ? 'registrado' : (cancelado ? 'cancelado' : 'nao_registrado'),
      motivo: ex?.motivo || null,
      dia_semana: diaSemanaDe(dataFinal),
      registrado,
    });
  }
  return out;
}

module.exports = {
  agoraBRT, proximasOcorrencias, proximoEncontro, ocorrenciaAnterior, ocorrenciasPassadas,
  instanteISO, somarDias,
  cadenciaDias, janelaRemarcacao, FUSO_BRT_MIN, LIMITE_REMARCA_DIAS, CADENCIA_DIAS,
};
