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

/** "domingo, 17/08, às 08:30 e 10:00" */
function textoQuando(iso, horarios) {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return '';
  // Dia/mês/hora no fuso da igreja — em UTC o culto de domingo 19h vira segunda.
  const brt = new Date(d.getTime() - 3 * 3600000);
  const dia = DIAS_SEMANA[brt.getUTCDay()];
  const data = `${String(brt.getUTCDate()).padStart(2, '0')}/${String(brt.getUTCMonth() + 1).padStart(2, '0')}`;
  const hs = [...new Set(horarios || [])].sort();
  if (!hs.length) return `${dia}, ${data}`;
  const lista = hs.length === 1 ? hs[0] : `${hs.slice(0, -1).join(', ')} e ${hs[hs.length - 1]}`;
  return `${dia}, ${data}, às ${lista}`;
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
function agruparParaAviso({ escalas, agora, dias = 7, diasAlvo = null }) {
  const alvo = diasAlvo ? (diasAlvo instanceof Set ? diasAlvo : new Set(diasAlvo)) : null;
  const grupos = new Map();
  for (const e of escalas || []) {
    if (!elegivelParaAviso(e, agora, dias, alvo)) continue;
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
        primeiro: e.scheduled_at,
      });
    }
    const g = grupos.get(k);
    g.escala_ids.push(e.id);
    if (e.team_name) g.areas.push(e.team_name);
    if (e.service_name) g.cultos.push(e.service_name);
    g.horarios.push(horaBRT(e.scheduled_at));
    if (e.scheduled_at < g.primeiro) g.primeiro = e.scheduled_at;
  }

  return [...grupos.values()]
    .map(g => ({
      ...g,
      params: [textoAreas(g.areas), textoEvento(g.cultos), textoQuando(g.primeiro, g.horarios)],
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
  textoQuando, textoAreas, textoEvento, horaBRT, diaRelativoBRT,
};
