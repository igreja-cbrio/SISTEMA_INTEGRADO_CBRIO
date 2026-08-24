/**
 * Aviso de escala na SEMANA do serviço — régua PURA (sem banco, sem relógio).
 *
 * Pedido do Matheus (14/08/2026): *"toda vez que a pessoa for escalada, deve
 * ser avisada na semana do serviço"*. O lembrete que existia era MANUAL, só
 * alcançava quem estava com confirmação pendente, e dependia de alguém lembrar
 * de apertar o botão.
 *
 * ⚠️ Fica em `utils/` (sem `require` de banco) porque é assim que entra no gate
 * — `src/test/avisoEscala.test.ts`. Quem lê o banco e enfileira é o serviço.
 *
 * ⚠️⚠️ A DECISÃO CENTRAL É O AGRUPAMENTO POR (PESSOA, DIA). Quem serve nos
 * quatro cultos de domingo receberia QUATRO mensagens quase idênticas — que é
 * exatamente o padrão que a Meta lê como spam, e a nota de qualidade do número
 * é o que decide a subida de tier da conta. Uma mensagem por dia de serviço,
 * citando os horários, diz a mesma coisa sem queimar o número.
 */

const { diaBRT } = require('./volDisponibilidade');

const DIAS_SEMANA = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];

// ⚠️⚠️ ANTECEDÊNCIA POR ÁREA (21/08/2026). Pedido do Matheus: *"os voluntários
// que são do kids, recebessem 3 dias antes do culto, para que a Mari Gaia e a
// Milena possam se organizar para escalar outra pessoa no lugar."*
//
// A véspera serve pra lembrar quem já vai; NÃO serve pra REPOR. Descobrir no
// sábado que falta gente no Kids no domingo não dá tempo de achar substituto —
// e no Kids a vaga aberta não é só uma função a menos, é razão de criança por
// adulto na sala.
const ANTECEDENCIA_PADRAO_DIAS = 1;
const ANTECEDENCIA_KIDS_DIAS = 3;

/** Sem acento, minúsculo, sem espaço nas pontas. */
function _chaveArea(v) {
  return String(v == null ? '' : v)
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .trim().toLowerCase();
}

/**
 * A escala é do Kids?
 *
 * ⚠️ Decide pela ÁREA da equipe (`vol_teams.area`), não pelo NOME. Medido em
 * 21/08: das 130 equipes, as 116 sem área estão TODAS inativas e as 13 ativas
 * têm área — exatamente uma é `KIDS`. Casar por nome pegaria "CBKIDS", "Kids
 * Louvor" e qualquer equipe que alguém renomeie, e é o tipo de régua que muda
 * sozinha quando a coordenação mexe num rótulo.
 */
function ehEscalaKids(escala) {
  return _chaveArea(escala?.team_area).includes('kid');
}

/** Quantos dias antes esta escala deve ser avisada. */
function antecedenciaDaEscala(escala) {
  return ehEscalaKids(escala) ? ANTECEDENCIA_KIDS_DIAS : ANTECEDENCIA_PADRAO_DIAS;
}

/**
 * A antecedência de um GRUPO (pessoa × dia) é a MAIOR entre as escalas dele.
 *
 * ⚠️⚠️ Isto não é detalhe: quem serve no Kids E em outra área no mesmo domingo
 * receberia DUAS mensagens quase idênticas — uma no D-3 e outra na véspera —,
 * que é exatamente o padrão de spam que o agrupamento por (pessoa, dia) existe
 * pra evitar. Com o máximo, sai UMA mensagem no D-3 cobrindo tudo, e a véspera
 * pula a pessoa porque as escalas dela já constam como avisadas.
 */
function antecedenciaDoGrupo(escalas) {
  return (escalas || []).reduce((m, e) => Math.max(m, antecedenciaDaEscala(e)), ANTECEDENCIA_PADRAO_DIAS);
}

/** Chave da pessoa: o perfil de voluntário, ou o id do Planning Center. */
function chavePessoa(escala) {
  return escala?.volunteer_id || escala?.planning_center_person_id || null;
}

/**
 * A escala entra na janela de aviso?
 *
 * ⚠️ Culto que JÁ PASSOU nunca entra — avisar depois do serviço é pior que não
 * avisar. E quem RECUSOU não é lembrado: a pessoa já disse que não vai, e
 * insistir num compromisso recusado é constrangimento, não lembrete.
 */
function elegivelParaAviso(escala, agoraISO, dias, diasAlvo) {
  if (!escala || !chavePessoa(escala)) return false;
  if (escala.confirmation_status === 'declined') return false;
  const quando = new Date(escala.scheduled_at).getTime();
  const agora = new Date(agoraISO).getTime();
  if (!Number.isFinite(quando) || !Number.isFinite(agora)) return false;
  if (quando < agora) return false;

  // ⚠️ VÉSPERA (14/08/2026): o Matheus pediu que o disparo seja "1 dia antes",
  // não uma janela de sete. `diasAlvo` é o conjunto de DIAS BRT que devem ser
  // avisados agora — o cron manda só amanhã. A janela em `dias` continua como
  // limite externo, pra que um dia alvo mal calculado não alcance o mês todo.
  if (diasAlvo && diasAlvo.size) {
    if (!diasAlvo.has(diaBRT(escala.scheduled_at))) return false;
  }
  return quando <= agora + dias * 86400000;
}

/**
 * "domingo, 17/08, às 08:30 e 10:00" — ou "17/08, às 08:30 e 10:00" quando o
 * nome do culto JÁ diz o dia da semana.
 *
 * ⚠️ O `omitirDia` existe porque a mensagem monta `{{2}} — {{3}}`, e com
 * "Culto de Domingo" no {{2}} o resultado era *"Culto de Domingo — domingo,
 * 17/08…"* (visto pelo Matheus no template, 14/08). O dia da semana continua
 * quando o nome NÃO o diz: "Culto AMI" e "Bridge" não dizem que são sábado, e
 * aí a data sozinha faz a pessoa ir conferir no calendário.
 */
function textoQuando(iso, horarios, omitirDia = false) {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return '';
  // Dia/mês/hora no fuso da igreja — em UTC o culto de domingo 19h vira segunda.
  const brt = new Date(d.getTime() - 3 * 3600000);
  const dia = DIAS_SEMANA[brt.getUTCDay()];
  const data = `${String(brt.getUTCDate()).padStart(2, '0')}/${String(brt.getUTCMonth() + 1).padStart(2, '0')}`;
  const inicio = omitirDia ? data : `${dia}, ${data}`;
  const hs = [...new Set(horarios || [])].sort();
  if (!hs.length) return inicio;
  const lista = hs.length === 1 ? hs[0] : `${hs.slice(0, -1).join(', ')} e ${hs[hs.length - 1]}`;
  return `${inicio}, às ${lista}`;
}

/**
 * O nome do culto já contém o dia da semana da data?
 *
 * Compara com o dia REAL do culto, não com "tem alguma palavra de dia solta":
 * um "Culto de Domingo" reagendado para o sábado precisa dizer *sábado* — e
 * omitir ali seria esconder justamente a informação que evita a pessoa aparecer
 * no dia errado.
 */
function nomeJaDizODia(nome, iso) {
  const d = new Date(iso);
  if (!nome || !Number.isFinite(d.getTime())) return false;
  const brt = new Date(d.getTime() - 3 * 3600000);
  const dia = DIAS_SEMANA[brt.getUTCDay()];
  const n = _norm(nome);
  // "quarta-feira" no nome cobre "quarta"; por isso o teste é pela raiz.
  const raiz = _norm(dia).split('-')[0];
  return n.includes(raiz);
}

// Acentos fora, minúsculas — mesma normalização do resto da casa.
function _norm(v) {
  return String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

/** Hora HH:MM no fuso da igreja. */
function horaBRT(iso) {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return '';
  const brt = new Date(d.getTime() - 3 * 3600000);
  return `${String(brt.getUTCHours()).padStart(2, '0')}:${String(brt.getUTCMinutes()).padStart(2, '0')}`;
}

/** "Banda e Cuidados" · sem repetir e sem inventar quando não há área. */
function textoAreas(areas) {
  const u = [...new Set((areas || []).filter(Boolean))];
  if (!u.length) return 'Voluntariado';
  if (u.length === 1) return u[0];
  return `${u.slice(0, -1).join(', ')} e ${u[u.length - 1]}`;
}

/** Nome do culto, ou a contagem quando são vários no mesmo dia. */
function textoEvento(nomes) {
  const u = [...new Set((nomes || []).filter(Boolean))];
  if (!u.length) return 'culto';
  if (u.length === 1) return u[0];
  return `${u.length} cultos`;
}

/**
 * Agrupa as escalas elegíveis por (pessoa, dia do serviço).
 *
 * Devolve um grupo por pessoa/dia, já com os textos prontos para os três
 * parâmetros do template (`{{1}}` área · `{{2}}` evento · `{{3}}` quando).
 */
function agruparParaAviso({ escalas, agora, dias = 7, diasAlvo = null, porAntecedencia = false }) {
  const alvo = diasAlvo ? (diasAlvo instanceof Set ? diasAlvo : new Set(diasAlvo)) : null;
  const grupos = new Map();
  for (const e of escalas || []) {
    // ⚠️ No modo por antecedência o recorte de DIA não pode ser por escala: a
    // decisão é do GRUPO (a maior antecedência entre as escalas da pessoa
    // naquele dia), e ela só existe depois de agrupar. Aqui passa quem está na
    // janela; o corte vem no filtro do final.
    if (!elegivelParaAviso(e, agora, dias, porAntecedencia ? null : alvo)) continue;
    const pessoa = chavePessoa(e);
    const dia = diaBRT(e.scheduled_at);
    const k = `${pessoa}::${dia}`;
    if (!grupos.has(k)) {
      grupos.set(k, {
        chave: k, pessoa, dia,
        nome: e.volunteer_name || null,
        volunteer_id: e.volunteer_id || null,
        planning_center_person_id: e.planning_center_person_id || null,
        escala_ids: [], areas: [], cultos: [], horarios: [],
        _escalas: [],
        primeiro: e.scheduled_at,
      });
    }
    const g = grupos.get(k);
    g._escalas.push(e);
    g.escala_ids.push(e.id);
    if (e.team_name) g.areas.push(e.team_name);
    if (e.service_name) g.cultos.push(e.service_name);
    g.horarios.push(horaBRT(e.scheduled_at));
    if (e.scheduled_at < g.primeiro) g.primeiro = e.scheduled_at;
  }

  return [...grupos.values()]
    .map(g => ({ ...g, antecedencia: antecedenciaDoGrupo(g._escalas), kids: g._escalas.some(ehEscalaKids) }))
    // ⚠️⚠️ `<=`, NÃO `===` (corrigido em 22/08/2026). Eu tinha escrito `===`
    // achando que `<=` avisaria o Kids no D-3, no D-2 e na véspera — e isso
    // estava ERRADO: quem impede a repetição é a DEDUP de `selecionarRodada`,
    // que pula o grupo cuja escala já tem envio registrado. O `===` só tornava
    // a régua frágil, e cobrou caro: ao ligar os 3 dias do Kids em 21/08, o
    // culto de 23/08 já tinha passado do D-3 (que foi 20/08, antes do merge) e
    // **38 pessoas do Kids ficaram sem aviso nenhum** pro domingo.
    //
    // Com `<=` a régua se recupera sozinha de qualquer dia perdido — merge no
    // meio da janela, cron que não rodou, deploy demorado. Avisar tarde é pior
    // que avisar no D-3; não avisar é muito pior que os dois.
    //
    // ⚠️ Não vira enxurrada: `dias` continua limitando a janela externa, e a
    // dedup garante UMA mensagem por pessoa por dia de serviço.
    .filter(g => !porAntecedencia || diaBRT(g.primeiro) <= diaRelativoBRT(agora, g.antecedencia))
    .map(g => ({
      ...g,
      params: (() => {
        const evento = textoEvento(g.cultos);
        // Só omite quando o {{2}} realmente carrega o dia — com vários cultos
        // o {{2}} vira "3 cultos" e o dia precisa aparecer no {{3}}.
        const omitir = g.cultos.length > 0 && nomeJaDizODia(evento, g.primeiro);
        return [textoAreas(g.areas), evento, textoQuando(g.primeiro, g.horarios, omitir)];
      })(),
    }))
    // Quem serve primeiro é avisado primeiro — com teto de rodada, é o que
    // garante que o aviso do domingo não fique para depois do domingo.
    .sort((a, b) => String(a.primeiro).localeCompare(String(b.primeiro)));
}

/**
 * Escolhe quem entra NESTA rodada.
 *
 * ⚠️ O grupo é considerado avisado quando QUALQUER uma das escalas dele já tem
 * envio registrado. O registro é a linha da fila (`whatsapp_envios.ref_id`), e
 * uma mensagem cobre o dia inteiro da pessoa — checar escala por escala faria
 * quem foi escalada num culto a mais depois do aviso receber o dia todo de novo.
 *
 * ⚠️ Teto de rodada espelhando a lei do censo (04/08): a conta está em
 * TIER_250 (250 destinatários ÚNICOS por 24h) e a fila desiste 36h depois de
 * criada a mensagem. O que não coube é DECLARADO (`adiados`), nunca engolido —
 * e como o cron roda todo dia, o adiado de hoje entra amanhã.
 */
function selecionarRodada({ grupos, jaAvisados, telefonePorPessoa, teto = 200 }) {
  const avisados = jaAvisados instanceof Set ? jaAvisados : new Set(jaAvisados || []);
  const fones = telefonePorPessoa instanceof Map ? telefonePorPessoa : new Map(Object.entries(telefonePorPessoa || {}));

  const pendentes = [];
  let ja_avisados = 0;
  const sem_telefone = [];

  for (const g of grupos || []) {
    if (g.escala_ids.some(id => avisados.has(id))) { ja_avisados++; continue; }
    const telefone = fones.get(g.pessoa) || null;
    if (!telefone) { sem_telefone.push(g); continue; }
    pendentes.push({ ...g, telefone });
  }

  return {
    rodada: pendentes.slice(0, teto),
    adiados: Math.max(0, pendentes.length - teto),
    sem_telefone,
    ja_avisados,
  };
}

/**
 * Dia BRT deslocado em N dias a partir de `agora`. `0` = hoje, `1` = amanhã.
 *
 * ⚠️ Existe pra o serviço não recalcular fuso na mão: "amanhã" às 22h do Rio
 * já é depois de amanhã em UTC, e é assim que um aviso de véspera vira aviso
 * de duas noites antes (ou nenhum).
 */
function diaRelativoBRT(agoraISO, deslocamento) {
  const base = new Date(agoraISO);
  if (!Number.isFinite(base.getTime())) return null;
  return diaBRT(new Date(base.getTime() + (deslocamento || 0) * 86400000));
}

module.exports = {
  chavePessoa, elegivelParaAviso, agruparParaAviso, selecionarRodada,
  textoQuando, textoAreas, textoEvento, horaBRT, diaRelativoBRT, nomeJaDizODia,
  ANTECEDENCIA_PADRAO_DIAS, ANTECEDENCIA_KIDS_DIAS,
  ehEscalaKids, antecedenciaDaEscala, antecedenciaDoGrupo,
};
