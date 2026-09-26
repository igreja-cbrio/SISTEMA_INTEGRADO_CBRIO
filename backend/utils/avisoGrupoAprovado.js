// ============================================================================
// O QUE VAI NO AVISO DE "seu pedido foi aprovado" · régua PURA
//
// Pedido do Matheus (25/09/2026), depois de medir o inbox: a pergunta nº 1 que
// chega no WhatsApp da igreja é **"qual a data de início?"** — e o aviso que a
// própria igreja manda não a responde.
//
// O que o template `grupos_pedido_aprovado_v2` manda hoje no `{{2}}` é
// `formatarQuando(grupo)` = **"Terça às 20:00"**. Isso é a CADÊNCIA, não uma
// data. A pessoa quer saber QUAL terça — e o sistema já sabe: `agendaGrupo`
// calcula a próxima ocorrência, inclusive quinzenal e mensal, com remarcação e
// cancelamento aplicados.
//
// ⚠️⚠️ Medido em 25/09: **36 dos 109 grupos ativos (33%) são quinzenais ou
// mensais**. Para esses, "Terça às 20:00" não é só incompleto — é ENGANOSO: a
// pessoa pode aparecer na terça errada.
//
// ⚠️⚠️ POR QUE ISTO NÃO PRECISA DE TEMPLATE NOVO NA META: o `{{2}}` é um
// PARÂMETRO, e a Meta valida a QUANTIDADE de parâmetros, não o conteúdo deles.
// A data entra dentro do texto que já vai ali. Template novo custaria 48h de
// revisão e o risco de a categoria mudar.
//
// ============================================================================
// AS TRÊS CONFIANÇAS — e confundi-las é o defeito que esta régua impede
//
//   • data REAL      → afirma ("o próximo é dia 30/09")
//   • data CALCULADA → dá a data, DIZ que é cálculo e manda confirmar
//   • sem data       → não inventa nada, volta ao texto de hoje
//
// A distinção vem de `ancoraDoGrupo`: semanal nunca é estimado (o dia da semana
// determina tudo); quinzenal/mensal SÓ é firme quando o grupo já registrou um
// encontro. Medido em 25/09: **4 dos 29 quinzenais e 0 dos 7 mensais** têm esse
// registro — ou seja, 32 grupos caem no caso "calculada", e prometer data
// nesses seria a mesma precisão inventada que a lei dos pinos do mapa proíbe.
// ============================================================================

const DIAS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

// Só aparece quando NÃO é semanal: "Terça às 20:00" já diz tudo num grupo
// semanal, e escrever "(semanal)" ali é ruído em 70 dos 109 grupos.
const CADENCIA = { quinzenal: 'quinzenal', mensal: 'mensal' };

/**
 * ⚠️⚠️ A Meta RECUSA a mensagem inteira (132000) quando um parâmetro tem quebra
 * de linha, tab ou 4+ espaços seguidos. É falha por-mensagem, permanente e sem
 * retry — some justamente o aviso mais bem escrito. Mesma lição do texto de
 * suporte do app (29/08).
 *
 * ⚠️ O teto existe porque o corpo do template tem limite: um parâmetro gigante
 * derruba o envio. Corta na última palavra inteira, nunca no meio.
 */
function paramSeguro(texto, max = 220) {
  const limpo = String(texto ?? '').replace(/[\r\n\t]+/g, ' ').replace(/ {2,}/g, ' ').trim();
  if (limpo.length <= max) return limpo;
  const corte = limpo.slice(0, max);
  const ultimo = corte.lastIndexOf(' ');
  return (ultimo > max * 0.6 ? corte.slice(0, ultimo) : corte).trim();
}

/** "30/09" — a data por extenso vive em `respostaGrupoAgenda.quandoPorExtenso`;
 *  aqui o formato é curto de propósito, porque divide o parâmetro com a cadência.
 *  ⚠️ Fatiado da STRING, nunca `new Date(iso)`: a string sem horário é meia-noite
 *  UTC, que no Rio é 21h do dia ANTERIOR — a data sairia um dia atrasada. */
function dataCurta(dataISO) {
  const [a, m, d] = String(dataISO || '').slice(0, 10).split('-').map(Number);
  if (!a || !m || !d) return null;
  return `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}`;
}

/** "Terça" · null quando o grupo não tem dia marcado. */
function diaDaSemana(n) {
  return (n === 0 || n > 0) && n <= 6 ? DIAS[n] : null;
}

/**
 * O `{{2}}` do template: quando o grupo se encontra E qual é o próximo.
 *
 * @param {object} p
 * @param {number|null} p.diaSemana   0=domingo … 6=sábado
 * @param {string|null} p.horario     'HH:MM[:SS]'
 * @param {string} p.recorrencia      semanal | quinzenal | mensal | diario
 * @param {string|null} p.proximaISO  data da próxima ocorrência (de `proximoEncontro`)
 * @param {boolean} p.estimada        a data é cálculo, não fato observado
 */
function quandoComData({ diaSemana, horario, recorrencia = 'semanal', proximaISO = null, estimada = false }) {
  const rec = String(recorrencia || 'semanal').toLowerCase().trim();
  const hh = String(horario || '').slice(0, 5);

  // Grupo diário não tem dia fixo — e nem precisa de data: é todo dia.
  if (rec === 'diario') return paramSeguro(hh ? `Todos os dias às ${hh}` : 'Todos os dias');

  const dia = diaDaSemana(diaSemana);
  const base = dia
    ? (hh ? `${dia} às ${hh}` : dia)
    : (hh ? `às ${hh}` : 'a combinar');

  // ⚠️ A cadência entra ANTES da data: num grupo quinzenal, dar só a data faria
  // a pessoa achar que é toda semana a partir dali.
  const comCadencia = CADENCIA[rec] ? `${base} (${CADENCIA[rec]})` : base;

  const curta = dataCurta(proximaISO);
  if (!curta) return paramSeguro(comCadencia);

  return paramSeguro(estimada
    // ⚠️ "deve ser" e "confirme", nunca "é": a âncora foi derivada do início da
    // temporada porque o grupo nunca registrou encontro. Afirmar aqui é mandar
    // gente para a terça errada — e num aviso de boas-vindas.
    ? `${comCadencia} · o próximo deve ser dia ${curta}, confirme com o líder`
    : `${comCadencia} · o próximo é dia ${curta}`);
}

/**
 * O `{{3}}` do template: onde é — endereço ou link da sala.
 *
 * ⚠️⚠️ O link só existe NESTE aviso, e é por construção: ele vai para quem já
 * foi APROVADO. Pôr `link_online` na busca pública deixaria qualquer pessoa
 * entrar na sala de qualquer grupo.
 *
 * ⚠️ O complemento (apto/bloco) PODE sair aqui — e só aqui. A lei de 16/09 o
 * tira da vitrine pública porque o grupo é na casa de alguém; quem foi aprovado
 * precisa dele para chegar na porta.
 */
function ondeComLink({ partes = [], online = false, linkOnline = null }) {
  const endereco = partes.filter(Boolean).map(s => String(s).trim()).filter(Boolean).join(' — ');

  if (online) {
    const link = String(linkOnline || '').trim();
    if (link) return paramSeguro(`Online · ${link}`, 300);
    // ⚠️ Sem link cadastrado, DIZ que o líder envia — "Online" sozinho é
    // exatamente o que faz a pessoa perguntar "e o link?". Medido: 36 grupos
    // online ativos e nenhuma coluna de link no cadastro até 25/09.
    return paramSeguro(endereco ? `${endereco} · o líder envia o link` : 'Online · o líder envia o link');
  }

  return paramSeguro(endereco || 'a combinar');
}

module.exports = { quandoComData, ondeComLink, paramSeguro, dataCurta, diaDaSemana, DIAS, CADENCIA };
