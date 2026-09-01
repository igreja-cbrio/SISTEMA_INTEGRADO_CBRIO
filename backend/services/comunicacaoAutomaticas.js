// ════════════════════════════════════════════════════════════════════════════
//  Comunicação · "quem recebe as mensagens automáticas?"
//
//  Pergunta do Matheus (05/08/2026). Até aqui a resposta só existia lendo
//  código: cada disparo automático tem a régua de público ESPALHADA no seu cron,
//  e nada no sistema dizia quem se encaixa nela hoje.
//
//  ⚠️ ESTE MÓDULO É 100% SOMENTE LEITURA. Ele DESCREVE o que outros disparam —
//  não envia, não agenda, não desliga. Um segundo caminho de escrita pra envio
//  automático é a classe de bug que o inventário de portas do /inscricoes evita
//  de propósito ("operar daqui" exigiria mover a lógica-satélite de cada cron).
//
//  ⚠️ A régua de público é ESPELHO do cron, não a fonte. Se o cron mudar, aqui
//  passa a MENTIR — e mentir com número na tela é pior que não ter tela. Por
//  isso cada item aponta o arquivo/rota que manda de verdade (`fonte`), e o
//  espelho fica declarado no comentário de cada resolver.
// ════════════════════════════════════════════════════════════════════════════

const { supabase } = require('../utils/supabase');

const TETO_PESSOAS = 200; // a tela lista; a contagem é sempre do total

/** Dia/mês em BRT (`toISOString` é UTC e das 21h em diante já virou o dia seguinte). */
function hojeBrt(agora = new Date()) {
  return new Date(agora.getTime() - 3 * 3600 * 1000);
}
function mmddBrt(d) {
  return `${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

/** Lê tudo paginando (cap de 1000 do PostgREST · lição permanente da casa). */
async function paginado(montarQuery) {
  const out = [];
  for (let off = 0; ; off += 1000) {
    const { data, error } = await montarQuery(off, off + 999);
    if (error) throw error;
    if (!data?.length) break;
    out.push(...data);
    if (data.length < 1000) break;
  }
  return out;
}

// ── públicos ───────────────────────────────────────────────────────────────

/**
 * ESPELHO de `routes/whatsappCron.js /aniversarios`: voluntário com vínculo
 * ABERTO + `whatsapp_optin` + nascimento + telefone. O opt-in é exigido porque o
 * template é MARKETING (`TEMPLATES_MARKETING` no whatsappService).
 * Devolve também QUANDO cai o aniversário — "quem recebe" aqui é uma agenda, não
 * uma lista que dispara toda de uma vez.
 */
async function publicoAniversario() {
  const vols = new Set();
  (await paginado((a, b) => supabase.from('mem_voluntarios')
    .select('membro_id').is('deleted_at', null).is('ate', null)
    .not('membro_id', 'is', null).range(a, b))).forEach(v => vols.add(v.membro_id));

  const membros = await paginado((a, b) => supabase.from('mem_membros')
    .select('id, nome, telefone, data_nascimento, whatsapp_optin')
    .is('deleted_at', null).not('data_nascimento', 'is', null)
    .not('telefone', 'is', null).range(a, b));

  const doMinisterio = membros.filter(m => vols.has(m.id));
  const elegiveis = doMinisterio.filter(m => m.whatsapp_optin);

  const hoje = hojeBrt();
  const mmddHoje = mmddBrt(hoje);
  const pessoas = elegiveis
    .map(m => ({
      nome: m.nome, telefone: m.telefone,
      quando: String(m.data_nascimento).slice(5, 10),
      hoje: String(m.data_nascimento).slice(5, 10) === mmddHoje,
    }))
    .sort((x, y) => x.quando.localeCompare(y.quando));

  return {
    total: elegiveis.length,
    pessoas: pessoas.slice(0, TETO_PESSOAS),
    // ⚠️ Quem NÃO recebe e por quê é a informação que faz a tela ser útil: o
    // número sozinho não diz o que fazer pra aumentar o alcance.
    fora: [
      { motivo: 'sem consentimento (opt-in)', qtd: doMinisterio.length - elegiveis.length },
    ],
    universo: { rotulo: 'voluntários ativos com nascimento e telefone', qtd: doMinisterio.length },
  };
}

/**
 * ESPELHO de `/whatsapp-cron/batismos-lembrete`: quem se batiza AMANHÃ e não
 * está `realizado`/`cancelado`. ⚠️ Não exige opt-in no código de hoje (o
 * template está como Marketing na conta da Meta — divergência registrada no
 * CLAUDE.md e pendente de decisão).
 */
async function publicoBatismo() {
  const d = hojeBrt();
  d.setUTCDate(d.getUTCDate() + 1);
  const amanha = d.toISOString().slice(0, 10);

  const { data, error } = await supabase.from('batismo_inscricoes')
    .select('id, membro_id, data_batismo, horario_culto, status')
    .is('deleted_at', null).eq('data_batismo', amanha)
    .not('membro_id', 'is', null)
    .neq('status', 'realizado').neq('status', 'cancelado');
  if (error) throw error;

  const ids = [...new Set((data || []).map(b => b.membro_id))];
  const nomes = new Map();
  for (let i = 0; i < ids.length; i += 200) {
    const { data: ms } = await supabase.from('mem_membros')
      .select('id, nome, telefone').in('id', ids.slice(i, i + 200));
    (ms || []).forEach(m => nomes.set(m.id, m));
  }

  return {
    total: (data || []).length,
    pessoas: (data || []).slice(0, TETO_PESSOAS).map(b => ({
      nome: nomes.get(b.membro_id)?.nome || '(sem cadastro)',
      telefone: nomes.get(b.membro_id)?.telefone || null,
      quando: `batismo em ${amanha.split('-').reverse().join('/')}`,
      hoje: true,
    })),
    fora: [],
    universo: { rotulo: `inscritos pro batismo de ${amanha.split('-').reverse().join('/')}`, qtd: (data || []).length },
  };
}

/**
 * ESPELHO de `devocionalSender.listarDestinatarios`: membro ativo com login no
 * app (`profiles.is_membro_only`) e telefone. ⚠️ NÃO checa opt-in.
 */
async function publicoDevocional() {
  const rows = await paginado((a, b) => supabase.from('profiles')
    .select('membro_id, mem_membros!inner(id, nome, telefone, active, whatsapp_optin)')
    .eq('is_membro_only', true).not('membro_id', 'is', null)
    .eq('mem_membros.active', true).not('mem_membros.telefone', 'is', null)
    .range(a, b));

  const pessoas = rows.filter(p => p.mem_membros?.telefone).map(p => ({
    nome: p.mem_membros.nome, telefone: p.mem_membros.telefone,
    quando: 'todo dia', hoje: true, optin: !!p.mem_membros.whatsapp_optin,
  }));
  const semOptin = pessoas.filter(p => !p.optin).length;

  return {
    total: pessoas.length,
    pessoas: pessoas.slice(0, TETO_PESSOAS),
    // Aqui `fora` não é quem é excluído — é o aviso de que o envio NÃO filtra.
    fora: semOptin ? [{ motivo: `⚠️ ${semOptin} SEM opt-in — este envio não filtra consentimento`, qtd: semOptin }] : [],
    universo: { rotulo: 'membros com login no app e telefone', qtd: pessoas.length },
  };
}

/**
 * ESPELHO de `publicGrupos /cron/frequencia-mensal` + `gruposEnvios`: líder
 * (`mem_grupos.lider_id`) de grupo ativo, com temporada EM CURSO, que não pediu
 * opt-out (`whatsapp_lideres.recebe_lembretes = false`).
 */
async function publicoGruposFrequencia() {
  const grupos = await paginado((a, b) => supabase.from('mem_grupos')
    .select('id, nome, lider_id, ativo, deleted_at')
    .is('deleted_at', null).eq('ativo', true)
    .not('lider_id', 'is', null).range(a, b));

  const ids = [...new Set(grupos.map(g => g.lider_id))];
  const lideres = new Map();
  for (let i = 0; i < ids.length; i += 200) {
    const { data: ms } = await supabase.from('mem_membros')
      .select('id, nome, telefone').in('id', ids.slice(i, i + 200))
      .is('deleted_at', null);
    (ms || []).forEach(m => lideres.set(m.id, m));
  }

  // Opt-out do bot (a régua de audiência dos envios de grupos respeita isso).
  const optOut = new Set();
  try {
    const { data: wl } = await supabase.from('whatsapp_lideres')
      .select('telefone, recebe_lembretes').eq('recebe_lembretes', false);
    (wl || []).forEach(l => optOut.add(String(l.telefone || '').replace(/\D/g, '').slice(-8)));
  } catch { /* tabela do bot indisponível — não deixa a tela cair */ }

  const comTelefone = grupos.filter(g => lideres.get(g.lider_id)?.telefone);
  const pessoas = comTelefone
    .filter(g => !optOut.has(String(lideres.get(g.lider_id).telefone).replace(/\D/g, '').slice(-8)))
    .map(g => ({
      nome: lideres.get(g.lider_id).nome,
      telefone: lideres.get(g.lider_id).telefone,
      quando: g.nome, hoje: false,
    }));

  return {
    total: pessoas.length,
    pessoas: pessoas.slice(0, TETO_PESSOAS),
    fora: [
      { motivo: 'líder sem telefone no cadastro', qtd: grupos.length - comTelefone.length },
      { motivo: 'pediu pra não receber lembretes', qtd: comTelefone.length - pessoas.length },
    ],
    universo: { rotulo: 'grupos ativos com líder definido', qtd: grupos.length },
  };
}

// ── travas · o que impede o disparo de sair AGORA ───────────────────────────
// ⚠️ Sem isto a tela MENTE com número: a chamada do mês mostraria "95 líderes
// recebem" enquanto o kill-switch está desligado e o envio é ZERO. Contagem de
// público sem a trava ao lado é a leitura errada mais fácil de fazer.

/** Kill-switch central dos envios automáticos de grupos (`whatsapp_config.grupos_auto_envios`, default FALSE). */
async function gruposAutoLigado() {
  try {
    const { data } = await supabase.from('whatsapp_config')
      .select('grupos_auto_envios').limit(1).maybeSingle();
    return !!data?.grupos_auto_envios;
  } catch { return null; } // desconhecido ≠ desligado
}

/** Temporada ativa EM CURSO (data_inicio <= hoje <= data_fim) — gate do cron mensal. */
async function temporadaEmCurso() {
  try {
    const hoje = hojeBrt().toISOString().slice(0, 10);
    const { data } = await supabase.from('mem_temporadas')
      .select('id, label').eq('ativa', true)
      .lte('data_inicio', hoje).gte('data_fim', hoje).limit(1).maybeSingle();
    return data || null;
  } catch { return null; }
}

async function bloqueiosGruposFrequencia() {
  const bloqueios = [];
  const [ligado, temporada] = await Promise.all([gruposAutoLigado(), temporadaEmCurso()]);
  if (ligado === false) {
    bloqueios.push('Os envios automáticos de grupos estão DESLIGADOS (chave central na aba Envios do módulo Grupos). Nada sai enquanto isso.');
  }
  if (!temporada) {
    bloqueios.push('Não há temporada ativa em curso — esta mensagem só sai com temporada rodando.');
  }
  return bloqueios;
}

// ── catálogo ───────────────────────────────────────────────────────────────
// ⚠️ Disparo automático NOVO tem que entrar aqui. É o mesmo contrato do catálogo
// de portas do /inscricoes: o que não está no inventário fica invisível, e
// mensagem automática invisível é a que ninguém descobre que está errada (foi
// assim que o devocional falhou 187 vezes sem ninguém saber).
/**
 * ESPELHO de `services/escalaAviso.js` (cron `/api/agente-voluntariado/cron/checar`,
 * 8h10 BRT) — o aviso "Você está escalado(a)" com os dois botões de quick-reply
 * ("Vou sim" / "Não vou poder").
 *
 * ⚠️ A RÉGUA NÃO É REESCRITA AQUI. Quem decide quem e quando é
 * `utils/avisoEscala.agruparParaAviso`, a MESMA função pura que o remetente usa
 * (e que está no gate de deploy), chamada com os MESMOS parâmetros de
 * `avisarVespera` (`dias: 4, porAntecedencia: true` · Kids em 3 dias, o resto na
 * véspera). Só as duas leituras (cultos + escalas) são espelho — se elas mudarem
 * no remetente, mudar aqui também.
 *
 * ⚠️ O telefone sai da MESMA cadeia canônica do remetente (`perfisPorId`), não
 * de `vol_profiles.phone` — ler só ali é o bug de 13/08 (8 de 930 perfis têm
 * telefone nessa coluna). Quem fica sem telefone alcançável entra em `fora`,
 * porque conta pro universo mas não recebe.
 *
 * ⚠️ NÃO aplica a dedup de "já avisei" nem o teto de rodada — igual aos outros
 * itens do catálogo, o número é "quem se encaixa na regra HOJE", não "quantas
 * mensagens vão sair agora". Quem já foi avisado ontem conta aqui e não recebe
 * de novo (a dedup vive em `selecionarRodada`, no remetente).
 */
async function publicoEscalaVespera() {
  const { agruparParaAviso } = require('../utils/avisoEscala');
  const { perfisPorId } = require('./agenteVoluntariado');

  const agora = new Date().toISOString();
  const DIAS = 4; // espelha avisarVespera · limite externo, não a antecedência
  const fim = new Date(Date.now() + DIAS * 86400000).toISOString();

  const { data: cultos, error: cErr } = await supabase.from('vol_services')
    .select('id, name, scheduled_at')
    .gte('scheduled_at', agora).lte('scheduled_at', fim).order('scheduled_at');
  if (cErr) throw cErr;
  if (!cultos?.length) {
    return { total: 0, pessoas: [], fora: [], universo: { rotulo: 'nenhum culto nos próximos 4 dias', qtd: 0 } };
  }
  const porCulto = Object.fromEntries(cultos.map(c => [c.id, c]));

  const escalasBrutas = [];
  const ids = cultos.map(c => c.id);
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await supabase.from('vol_schedules')
      // ⚠️ `planning_center_person_id` NÃO é decoração: `chavePessoa` é
      // `volunteer_id || planning_center_person_id`. Sem ela, quem não tem
      // volunteer_id agrupa sob a chave `null` e VÁRIAS pessoas viram um grupo
      // só — o espelho passaria a subcontar. Mesmo select do remetente.
      .select('id, service_id, team_id, volunteer_id, planning_center_person_id, volunteer_name, team_name, confirmation_status')
      .in('service_id', ids.slice(i, i + 200));
    if (error) throw error;
    escalasBrutas.push(...(data || []));
  }
  if (!escalasBrutas.length) {
    return { total: 0, pessoas: [], fora: [], universo: { rotulo: 'ninguém escalado nos próximos 4 dias', qtd: 0 } };
  }

  // Área da equipe decide a antecedência (Kids = 3 dias). Best-effort igual ao
  // remetente: sem ela todo mundo cai na véspera, que é o default.
  let areaPorEquipe = {};
  try {
    const teamIds = [...new Set(escalasBrutas.map(e => e.team_id).filter(Boolean))];
    for (let i = 0; i < teamIds.length; i += 200) {
      const { data } = await supabase.from('vol_teams').select('id, area').in('id', teamIds.slice(i, i + 200));
      (data || []).forEach(t => { areaPorEquipe[t.id] = t.area; });
    }
  } catch { /* todos na véspera */ }

  const grupos = agruparParaAviso({
    escalas: escalasBrutas.map(e => ({
      ...e,
      team_area: areaPorEquipe[e.team_id] || null,
      scheduled_at: porCulto[e.service_id]?.scheduled_at,
      service_name: porCulto[e.service_id]?.name,
    })),
    agora, dias: DIAS, diasAlvo: null, porAntecedencia: true,
  });

  const perfis = await perfisPorId(grupos.map(g => g.volunteer_id).filter(Boolean));
  const comTelefone = [];
  let semTelefone = 0;
  for (const g of grupos) {
    const tel = g.volunteer_id ? perfis[g.volunteer_id]?.phone : null;
    if (tel) comTelefone.push({ g, tel });
    else semTelefone++;
  }

  return {
    total: comTelefone.length,
    // ⚠️ O nome é `g.nome` (= `vol_schedules.volunteer_name`). NÃO usar
    // `params[0]`: os params do template são [ÁREAS, evento, quando], então
    // params[0] renderizaria "Coordenação" na coluna de nome de pessoa.
    pessoas: comTelefone.slice(0, TETO_PESSOAS).map(({ g, tel }) => ({
      nome: g.nome || '(sem nome na escala)',
      telefone: tel,
      quando: [g.params?.[1], g.params?.[2]].filter(Boolean).join(' · ') || null,
      hoje: false,
    })),
    fora: [{ rotulo: 'escalados sem telefone alcançável (recebem só pelo app)', qtd: semTelefone }],
    universo: { rotulo: 'escalados na antecedência de aviso (Kids em 3 dias, o resto na véspera)', qtd: grupos.length },
  };
}

/**
 * Público do e-mail semanal da campanha.
 *
 * ⚠️ Espelha `services/campanhaDisparo.js` (`pessoasDoSegmento` +
 * `montarPublico`), que é quem manda de verdade. O espelho é declarado: se o
 * remetente mudar a régua, ISTO PASSA A MENTIR — e mentir com número na tela é
 * pior que não ter tela.
 *
 * ⚠️ Sem campanha ATIVA o total é 0, e isso não é defeito: o disparo semanal
 * não sai fora de campanha ativa (`processarUm` cancela).
 */
async function publicoCampanhaSemanal() {
  const { data: campanhas } = await supabase.from('camp_campanhas')
    .select('id, nome').eq('status', 'ativa').is('deleted_at', null);
  if (!campanhas?.length) {
    return {
      total: 0, pessoas: [], fora: [],
      universo: { rotulo: 'nenhuma campanha ativa — o disparo semanal não sai', qtd: 0 },
    };
  }
  const { previa } = require('./campanhaDisparo');
  // Segmento do disparo semanal configurado; na falta dele, a base viva inteira.
  const { data: modelo } = await supabase.from('camp_disparos')
    .select('segmento').eq('campanha_id', campanhas[0].id)
    .eq('recorrencia', 'semanal_segunda').is('deleted_at', null)
    .order('created_at', { ascending: false }).limit(1).maybeSingle();

  const pub = await previa({
    campanha_id: campanhas[0].id,
    canal: 'email',
    segmento: modelo?.segmento || 'todos',
  });

  return {
    total: pub.total_alvo,
    pessoas: pub.alvo.slice(0, TETO_PESSOAS).map(a => ({
      nome: a.nome || '(sem nome)', email: a.destino, hoje: false,
    })),
    fora: Object.entries(pub.motivos || {}).map(([rotulo, qtd]) => ({ rotulo, qtd })),
    universo: { rotulo: `base do segmento "${modelo?.segmento || 'todos'}"`, qtd: pub.total_base },
  };
}

/**
 * Público do agradecimento ao doador.
 *
 * ⚠️ Não é uma lista de pessoas com data marcada: é reativo (quem doar recebe).
 * O número aqui é quantas doações AINDA não foram agradecidas — que é a
 * pergunta útil, e a que revela fila parada.
 */
// Boas-vindas do NOVO CONVERTIDO (totem · 01/09): disparo REATIVO — sai na hora
// do registro. O "público" aqui é a leitura de quantas decisões o fluxo do
// totem registrou nos últimos 30 dias (o elo é a observação que o endpoint
// grava — a decisão não tem coluna de proveniência própria de propósito:
// `fonte` ficou no DEFAULT do cadastro manual, decisão do Marcos).
async function publicoConvertidoBoasVindas() {
  const desde = new Date(Date.now() - 30 * 86400000).toISOString();
  const { count } = await supabase.from('cultos_decisoes_pessoas')
    .select('id', { count: 'exact', head: true })
    .eq('observacoes', 'Registrado no totem · fluxo novo convertido')
    .is('deleted_at', null)
    .gte('created_at', desde);
  return {
    total: count || 0,
    pessoas: [],
    universo: { rotulo: 'decisões registradas pelo totem nos últimos 30 dias', qtd: count || 0 },
  };
}

async function publicoCampanhaAgradecimento() {
  const { data: campanhas } = await supabase.from('camp_campanhas')
    .select('id, nome, digito, data_inicio, data_fim')
    .eq('status', 'ativa').is('deleted_at', null);
  if (!campanhas?.length) {
    return {
      total: 0, pessoas: [], fora: [],
      universo: { rotulo: 'nenhuma campanha ativa', qtd: 0 },
    };
  }

  let pendentes = 0;
  let jaFeitos = 0;
  for (const c of campanhas) {
    if (!c.digito) continue;
    let q = supabase.from('fin_transacoes')
      .select('id', { count: 'exact', head: true })
      .eq('tipo', 'receita').eq('identificador_centavo', c.digito)
      .not('membro_id', 'is', null);
    if (c.data_inicio) q = q.gte('data_competencia', c.data_inicio);
    if (c.data_fim) q = q.lte('data_competencia', c.data_fim);
    const { count: doacoes } = await q;

    const { count: feitos } = await supabase.from('camp_agradecimentos')
      .select('id', { count: 'exact', head: true })
      .eq('campanha_id', c.id).in('status', ['enviado', 'pulado']);

    pendentes += Math.max(0, (doacoes || 0) - (feitos || 0));
    jaFeitos += feitos || 0;
  }

  return {
    total: pendentes,
    pessoas: [],
    fora: [{ rotulo: 'doações já agradecidas ou puladas (anônimas, sem contato)', qtd: jaFeitos }],
    universo: { rotulo: 'doações com cadastro vinculado nas campanhas ativas', qtd: pendentes + jaFeitos },
  };
}

const CATALOGO = [
  {
    id: 'aniversario_voluntario',
    nome: 'Parabéns de aniversário',
    quando: 'Todo dia às 9h · envia a quem faz aniversário naquele dia',
    regra: 'Voluntário com vínculo aberto, que tenha data de nascimento, telefone e CONSENTIMENTO (opt-in). O template é Marketing, então a Meta exige o opt-in.',
    fonte: 'GET /api/whatsapp-cron/aniversarios',
    contexto: 'app.aniversario',
    envTemplate: 'WHATSAPP_TEMPLATE_ANIVERSARIO2',
    publico: publicoAniversario,
  },
  {
    id: 'batismo_lembrete',
    nome: 'Lembrete de batismo',
    quando: 'Todo dia às 18h · envia a quem se batiza no dia seguinte',
    regra: 'Inscrito no batismo de amanhã, com cadastro vinculado, que não esteja realizado nem cancelado.',
    fonte: 'GET /api/whatsapp-cron/batismos-lembrete',
    contexto: 'app.batismo_lembrete',
    envTemplate: 'WHATSAPP_TEMPLATE_BATISMO',
    publico: publicoBatismo,
  },
  {
    id: 'grupos_frequencia',
    nome: 'Chamada do mês (grupos)',
    quando: 'Dia 28 de cada mês · só com temporada em curso',
    regra: 'Líder do grupo (um por grupo — co-líder não recebe), com telefone, que não tenha pedido pra parar de receber lembretes.',
    fonte: 'GET /api/public/grupos/cron/frequencia-mensal',
    contexto: 'grupos.frequencia_mes',
    envTemplate: null,
    bloqueios: bloqueiosGruposFrequencia,
    publico: publicoGruposFrequencia,
  },
  // ⚠️ "Estudo da semana" NÃO ENTRA AQUI, e é achado desta entrega (05/08): a
  // função `whatsappGrupos.enviarEstudoSemanal` **não tem nenhum chamador** — o
  // cron `/whatsapp-grupos/cron/diario` só faz `sincronizarLideresGrupos()`. O
  // envio do estudo é MANUAL (aba de estudos). Listar aqui inventaria um
  // automático que não existe, que é o oposto do propósito desta tela.
  {
    id: 'devocional_diario',
    nome: 'Devocional do dia',
    quando: 'Todo dia às 9h',
    regra: 'Todo membro ativo com login no app e telefone. ⚠️ Este envio NÃO checa consentimento.',
    fonte: 'GET /api/devocional-planos/cron/enviar-diario',
    contexto: null, // não passa pela fila — por isso não aparece no histórico
    envTemplate: 'WHATSAPP_TEMPLATE_DEVOCIONAL',
    // ⚠️ Este é o ÚNICO com DEFAULT LITERAL no código
    // (`WHATSAPP_TEMPLATE_DEVOCIONAL || 'devocional_diario'`), então sem a env
    // ele NÃO fica em no-op: tenta todo dia contra um nome chutado e a Meta
    // recusa. A trava genérica ("não sai") mentiria — aqui ele SAI, e falha.
    envComDefaultLiteral: 'devocional_diario',
    tabelaPropria: 'devocional_envios',
    bloqueios: async () => {
      const temEnv = !!String(process.env.WHATSAPP_TEMPLATE_DEVOCIONAL || '').trim();
      if (temEnv) return [];
      return ['O nome do template não está configurado (env WHATSAPP_TEMPLATE_DEVOCIONAL) e o código cai num nome fixo, "devocional_diario", que não existe na conta da Meta. Resultado: ele TENTA todo dia e a Meta recusa todas.'];
    },
    publico: publicoDevocional,
  },
  {
    id: 'escala_vespera',
    nome: 'Você está escalado(a) (véspera)',
    quando: 'Todo dia às 8h10 BRT · Kids com 3 dias de antecedência, o resto na véspera',
    regra: 'Quem está escalado na antecedência da sua área, ainda não avisado por nenhum dos dois canais, e com telefone alcançável pela cadeia canônica (perfil → cadastro → CPF → formulário → contato secundário). Teto de 200 por rodada; quem não couber sai amanhã.',
    fonte: 'GET /api/agente-voluntariado/cron/checar → services/escalaAviso.js',
    contexto: 'voluntariado.escala_aviso',
    envTemplate: 'WHATSAPP_TEMPLATE_ESCALA',
    // ⚠️ DESLIGAR AQUI SILENCIA SÓ O WHATSAPP. O aviso no app continua saindo —
    // é decisão do Matheus (24/08), e a guarda no remetente fica DEPOIS do push
    // justamente por isso. Quem espera silêncio total nesta tela se engana.
    publico: publicoEscalaVespera,
  },
  {
    id: 'convertido_boas_vindas',
    nome: 'Boas-vindas ao novo convertido (totem)',
    quando: 'Reativo · na hora em que a pessoa registra a decisão no fluxo "Novo convertido" do totem',
    regra: 'Quem registra a própria decisão no totem — 1 mensagem por pessoa (só no primeiro '
      + 'registro do dia; a retentativa do quiosque não duplica). A mensagem cita quem vai '
      + 'contatar (o responsável escolhido na tela da equipe).',
    fonte: 'POST /api/membresia/totem/novo-convertido → routes/membresia.js',
    contexto: 'cuidados.convertido_boas_vindas',
    // ⚠️ `envTemplate` NULL de propósito: o nome do template é FIXO no código
    // (`novo_convertido_boas_vindas` · env WHATSAPP_TEMPLATE_CONVERTIDO_BOAS_VINDAS
    // só como override), então "env vazia" NÃO é bloqueio — declarar aqui
    // pintaria de vermelho um disparo configurado (a classe de mentira que esta
    // tela evita · mesmo caso do campanha_agradecimento).
    envTemplate: null,
    // ⚠️ Nasce DESLIGADO (id em whatsapp_config.disparos_off · decisão do
    // Marcos 01/09): liga quando o número oficial da igreja entrar na
    // plataforma. Ligar é o switch desta tela — sem PR.
    publico: publicoConvertidoBoasVindas,
  },
  {
    id: 'campanha_semanal',
    nome: 'Pocket semanal da campanha (e-mail)',
    quando: 'Toda segunda-feira · o resumo do domingo, com o link do vídeo e o CTA de contribuição',
    regra: 'Base VIVA do segmento configurado no disparo, com e-mail válido e sem opt-out. '
      + 'Uma pessoa por DESTINO: a casa com 4 cadastros no mesmo e-mail recebe 1 cópia. '
      + 'Só sai com campanha ATIVA.',
    fonte: 'GET /api/comunicacao/cron/agendamentos → services/campanhaDisparo.js',
    contexto: null, // e-mail não passa pela fila do WhatsApp
    envTemplate: null,
    tabelaPropria: 'camp_disparo_envios',
    publico: publicoCampanhaSemanal,
  },
  {
    id: 'campanha_agradecimento',
    nome: 'Obrigado ao doador da campanha',
    quando: 'De hora em hora · reativo, quando uma doação é confirmada',
    regra: 'Quem doou para uma campanha ativa, TEM cadastro vinculado e tem e-mail (ou opt-in de '
      + 'WhatsApp, na falta de e-mail). ⚠️ A mensagem é GENÉRICA: não cita nome nem valor, porque '
      + 'telefone e e-mail nesta base estão cadastrados em nome de familiares e filhos. '
      + 'Doação anônima não é agradecida (não há para onde mandar). '
      + 'Janela de silêncio de 72h por pessoa: quem doa 3× na semana recebe 1 obrigado.',
    fonte: 'GET /api/comunicacao/cron/agendamentos → services/campanhaAgradece.js',
    contexto: 'campanha.agradecimento',
    // ⚠️ `envTemplate` fica NULL DE PROPÓSITO, mesmo existindo a env
    // WHATSAPP_TEMPLATE_CAMPANHA_OBRIGADO. O `listar()` transforma
    // `envTemplate` sem valor em BLOQUEIO ("sem isso a mensagem não sai") — e
    // aqui isso seria FALSO: sem a env o agradecimento continua saindo por
    // e-mail, que é o canal primário. A env só destrava o plano B (WhatsApp pra
    // quem não tem e-mail). Declarar a env aqui pintaria de vermelho um disparo
    // que está funcionando, que é a classe de mentira que esta tela evita.
    envTemplate: null,
    bloqueios: async () => {
      const { data } = await supabase.from('camp_campanhas')
        .select('id').eq('status', 'ativa').is('deleted_at', null).limit(1);
      if (!data?.length) return ['Nenhuma campanha está ATIVA — nada é agradecido enquanto isso.'];
      return [];
    },
    tabelaPropria: 'camp_agradecimentos',
    publico: publicoCampanhaAgradecimento,
  },
];

/**
 * O que ESTE disparo já enviou de fato (30 dias) — a contraprova do público.
 * ⚠️ Público e enviados medem coisas diferentes: público é quem se ENCAIXA na
 * regra hoje, enviados é o que SAIU. Quando os dois divergem muito, é o envio
 * que está quebrado (foi exatamente o caso do devocional: 21 no público, 0
 * entregues, 187 erros — e nada na tela denunciava).
 */
async function enviosDoItem(item, dias = 30) {
  const desde = new Date(Date.now() - dias * 86400000).toISOString();
  try {
    if (item.tabelaPropria === 'devocional_envios') {
      const { data } = await supabase.from('devocional_envios')
        .select('enviado, motivo, created_at').gte('created_at', desde);
      const rows = data || [];
      return {
        enviados: rows.filter(r => r.enviado).length,
        nao_entregues: rows.filter(r => !r.enviado).length,
        fora_do_historico: true, // não passa pela fila `whatsapp_envios`
        motivo_falha: rows.find(r => !r.enviado)?.motivo || null,
      };
    }
    if (!item.contexto) return { enviados: 0, nao_entregues: 0 };
    const { data } = await supabase.from('whatsapp_envios')
      .select('status, failed_at').eq('contexto', item.contexto).gte('criado_em', desde);
    const rows = data || [];
    return {
      enviados: rows.filter(r => r.status === 'enviado').length,
      nao_entregues: rows.filter(r => r.failed_at).length,
    };
  } catch (e) {
    return { enviados: null, nao_entregues: null, erro: e.message };
  }
}

/**
 * @param {boolean} comPessoas  false = só contagem (nível 1) · true = nomes e
 *   telefones (nível ≥2). ⚠️ A lista É PII — a separação de nível não é
 *   formalidade: "quantos recebem" é gestão, "quem recebe com telefone" é
 *   cadastro de gente.
 */
async function listar({ comPessoas = false, dias = 30 } = {}) {
  const itens = [];
  for (const item of CATALOGO) {
    const base = {
      id: item.id, nome: item.nome, quando: item.quando, regra: item.regra,
      fonte: item.fonte, contexto: item.contexto,
      template_configurado: item.envTemplate ? !!String(process.env[item.envTemplate] || '').trim() : null,
      env_template: item.envTemplate,
    };
    try {
      const [pub, env, bloqueios] = await Promise.all([
        item.publico(),
        enviosDoItem(item, dias),
        item.bloqueios ? item.bloqueios() : Promise.resolve([]),
      ]);
      // Template sem env configurada também é trava — e é a mais comum.
      // ⚠️ Só vale pra quem faz no-op sem a env; quem tem default literal no
      // código TENTA de qualquer forma, e aí dizer "não sai" seria falso.
      if (item.envTemplate && !item.envComDefaultLiteral
          && !String(process.env[item.envTemplate] || '').trim()) {
        bloqueios.push(`O template não está configurado (env ${item.envTemplate}) — sem isso a mensagem não sai.`);
      }
      itens.push({
        ...base,
        bloqueios,
        total: pub.total,
        universo: pub.universo,
        fora: (pub.fora || []).filter(f => f.qtd > 0),
        pessoas: comPessoas ? pub.pessoas : undefined,
        pessoas_truncadas: comPessoas ? pub.total > (pub.pessoas?.length || 0) : undefined,
        ...env,
      });
    } catch (e) {
      // ⚠️ Um público que falha NÃO derruba o inventário: a tela existe pra
      // mostrar o conjunto, e esconder os outros 4 por causa de 1 seria trocar
      // informação por silêncio.
      itens.push({ ...base, erro: e.message, total: null });
    }
  }
  return { dias, itens };
}

const IDS_CATALOGO = CATALOGO.map((i) => i.id);

module.exports = { IDS_CATALOGO, listar, CATALOGO };
