// ============================================================================
// Aviso de escala na SEMANA do serviço
// ============================================================================
//
// Pedido do Matheus (14/08/2026): *"toda vez que a pessoa for escalada, deve
// ser avisada na semana do serviço"*.
//
// O que existia era o `POST /agente-voluntariado/lembrar` — MANUAL, alcançando
// só quem estava com confirmação pendente, e dependendo de alguém lembrar de
// apertar o botão. Este roda sozinho, todo dia, e cobre TODA a escala da
// janela.
//
// ⚠️⚠️ O REGISTRO DE "JÁ AVISEI" É A PRÓPRIA FILA (`whatsapp_envios.ref_id` +
// `contexto`). Não há tabela nem coluna nova: a linha da fila nasce ANTES de
// qualquer envio (é o que `enfileirarLote` garante), então morrer no meio deixa
// gravado o que já saiu e a rodada seguinte continua de onde parou — que é a
// lei de 04/08. Um registro à parte, gravado depois do envio, teria justamente
// o buraco que a lei descreve.
//
// ⚠️ A régua de QUEM e QUANDO é pura, em `utils/avisoEscala` (no gate). Aqui só
// se lê o banco e se enfileira.

const { supabase } = require('../utils/supabase');
const fila = require('./whatsappFila');
const { perfisPorId } = require('./agenteVoluntariado');
const { notificarApp } = require('./appPush');
const { agruparParaAviso, selecionarRodada, diaRelativoBRT } = require('../utils/avisoEscala');

const CONTEXTO = 'voluntariado.escala_aviso';
// Chave do aviso no app. Mesma raiz do contexto da fila, e por escala — a
// checagem procura QUALQUER escala do grupo, então a ordem do array não importa.
const chaveApp = (escalaId) => `escala_aviso:${escalaId}`;
// Espelha o teto do lembrete manual e a lei do censo: TIER_250 são 250
// destinatários ÚNICOS por 24h, e a fila desiste 36h depois de criada a
// mensagem. Como o cron roda todo dia, o que não coube hoje sai amanhã.
const TETO_RODADA = 200;
const LOTE_IN = 200;

async function _emLotes(valores, build) {
  const uniq = [...new Set((valores || []).filter(Boolean))];
  let out = [];
  for (let i = 0; i < uniq.length; i += LOTE_IN) {
    const { data, error } = await build(uniq.slice(i, i + LOTE_IN));
    if (error) throw new Error(error.message);
    out = out.concat(data || []);
  }
  return out;
}

/**
 * Avisa quem serve nos próximos `dias`.
 *
 * Não lança: devolve sempre um relatório. Este código roda no cron, e derrubar
 * o cron por causa do aviso levaria junto o alerta do coordenador, que divide
 * a mesma execução.
 */
/**
 * @param {object} opts
 *  · `diasAlvo` — dias BRT a avisar. O cron manda `[amanhã]` (véspera, pedido
 *    do Matheus em 14/08). Sem ele, vale a janela em `dias` (o botão manual).
 */
async function avisarEscalasDaSemana({ dias = 7, diasAlvo = null, teto = TETO_RODADA, agora = new Date().toISOString() } = {}) {
  const base = {
    janela_dias: dias, grupos: 0, enfileirados: 0, app_avisados: 0, adiados: 0,
    sem_telefone: 0, ja_avisados: 0, template_configurado: false, motivo: null,
  };

  const templateName = process.env.WHATSAPP_TEMPLATE_ESCALA;

  // 1 · Cultos da janela.
  const fim = new Date(new Date(agora).getTime() + dias * 86400000).toISOString();
  const { data: cultos, error: cErr } = await supabase
    .from('vol_services').select('id, name, scheduled_at')
    .gte('scheduled_at', agora).lte('scheduled_at', fim).order('scheduled_at');
  if (cErr) return { ...base, motivo: `Não foi possível ler os cultos: ${cErr.message}` };
  if (!cultos?.length) return { ...base, motivo: 'Nenhum culto na janela.' };

  const nomePorCulto = Object.fromEntries(cultos.map(c => [c.id, c]));

  // 2 · Escalas desses cultos.
  const escalasBrutas = await _emLotes(cultos.map(c => c.id), (chunk) => supabase
    .from('vol_schedules')
    .select('id, service_id, volunteer_id, planning_center_person_id, volunteer_name, team_name, confirmation_status')
    .in('service_id', chunk));
  if (!escalasBrutas.length) return { ...base, motivo: 'Ninguém escalado na janela.' };

  const escalas = escalasBrutas.map(e => ({
    ...e,
    scheduled_at: nomePorCulto[e.service_id]?.scheduled_at,
    service_name: nomePorCulto[e.service_id]?.name,
  }));

  const grupos = agruparParaAviso({ escalas, agora, dias, diasAlvo });
  if (!grupos.length) return { ...base, motivo: 'Ninguém a avisar nesta janela.' };

  // 3 · Quem já foi avisado — pelos DOIS canais.
  //
  // ⚠️ Só a fila do WhatsApp não basta: enquanto o template não estiver
  // aprovado, ela não grava NADA, e quem recebeu o aviso pelo app receberia de
  // novo todo dia. O registro é a união dos dois canais.
  const idsEscala = grupos.flatMap(g => g.escala_ids);
  const [enviados, noApp] = await Promise.all([
    _emLotes(idsEscala, (chunk) => supabase
      .from('whatsapp_envios').select('ref_id').eq('contexto', CONTEXTO).in('ref_id', chunk)),
    // Best-effort: sem a coluna `chave_dedup` (deploy em 2 etapas) o app não
    // deduplica, e é melhor avisar de novo do que não avisar.
    _emLotes(idsEscala.map(chaveApp), (chunk) => supabase
      .from('app_notificacoes').select('chave_dedup').in('chave_dedup', chunk)).catch((e) => {
      console.warn('[escalaAviso] dedup do app indisponível:', e.message);
      return [];
    }),
  ]);
  const jaAvisados = new Set([
    ...(enviados || []).map(e => e.ref_id),
    ...(noApp || []).map(n => String(n.chave_dedup || '').replace(/^escala_aviso:/, '')),
  ].filter(Boolean));

  // 4 · Telefone pela cadeia canônica (perfil → cadastro → CPF → formulário →
  //     contato secundário). ⚠️ Ler só `vol_profiles.phone` é o bug de 13/08:
  //     8 de 930 perfis têm telefone ali.
  const perfis = await perfisPorId(grupos.map(g => g.volunteer_id).filter(Boolean));
  const telefonePorPessoa = new Map();
  for (const g of grupos) {
    const p = g.volunteer_id ? perfis[g.volunteer_id] : null;
    if (p?.phone) telefonePorPessoa.set(g.pessoa, p.phone);
  }

  const sel = selecionarRodada({ grupos, jaAvisados, telefonePorPessoa, teto });

  // 5 · Aviso no APP, pra quem tem conta.
  //
  // ⚠️ Vale junto com o WhatsApp, não no lugar dele. O push alcança pouca gente
  // hoje (a base de tokens é pequena e 100% iOS — o binário Android não tem
  // Firebase), então tratá-lo como canal principal deixaria a maioria sem
  // aviso. E o inverso — só WhatsApp — desperdiça um canal grátis e imediato
  // num disparo que tem teto de 250 destinatários por 24h.
  //
  // ⚠️ O tipo `escala` JÁ é roteado pelos dois mapas do app (`notifTap.ts` e a
  // tela de notificações) para /voluntariado. Tipo novo cairia em "Outros" e o
  // toque não levaria a lugar nenhum — foi a lição do `grupo_pedido`.
  let app_avisados = 0;
  const pendentes = grupos.filter(g => !g.escala_ids.some(id => jaAvisados.has(id)));
  if (pendentes.length) {
    try {
      const membroIds = pendentes
        .map(g => (g.volunteer_id ? perfis[g.volunteer_id]?.membro_id : null))
        .filter(Boolean);
      const contas = await _emLotes(membroIds, (chunk) => supabase
        .from('profiles').select('id, membro_id').in('membro_id', chunk));
      const userPorMembro = Object.fromEntries((contas || []).map(c => [c.membro_id, c.id]));

      for (const g of pendentes.slice(0, teto)) {
        const membroId = g.volunteer_id ? perfis[g.volunteer_id]?.membro_id : null;
        const userId = membroId ? userPorMembro[membroId] : null;
        if (!userId) continue;
        const r = await notificarApp([userId], {
          tipo: 'escala',
          titulo: 'Você está escalado(a)',
          body: `${g.params[0]} · ${g.params[2]}`,
          data: { tipo: 'escala' },
          chaveDedup: chaveApp(g.escala_ids[0]),
        });
        if (r?.enviados !== 0) app_avisados++;
      }
    } catch (e) {
      // Aviso no app é o canal EXTRA — falhar aqui não pode impedir o WhatsApp.
      console.error('[escalaAviso] aviso no app falhou:', e.message);
    }
  }

  const relatorio = {
    ...base,
    grupos: grupos.length,
    adiados: sel.adiados,
    sem_telefone: sel.sem_telefone.length,
    ja_avisados: sel.ja_avisados,
    app_avisados,
    template_configurado: !!templateName,
  };

  if (!sel.rodada.length) {
    const porApp = app_avisados > 0 ? ` ${app_avisados} pessoa(s) foram avisadas pelo app.` : '';
    return {
      ...relatorio,
      motivo: sel.ja_avisados === grupos.length
        ? 'Todo mundo da janela já foi avisado.'
        : `Ninguém com telefone alcançável nesta rodada.${porApp}`,
    };
  }

  // ⚠️ Sem template aprovado NADA sai — e o relatório diz isso, em vez de
  // devolver "0 enviados" como se fosse sucesso (lição do disparo do censo:
  // caixa verde para envio que não aconteceu).
  if (!templateName) {
    return {
      ...relatorio,
      motivo: app_avisados > 0
        ? `${app_avisados} pessoa(s) foram avisadas pelo app. O WhatsApp não saiu: o template de escala não está configurado (WHATSAPP_TEMPLATE_ESCALA) — e a Vercel só aplica variável de ambiente nova em deployment novo.`
        : 'O template de escala não está configurado (WHATSAPP_TEMPLATE_ESCALA) — nenhuma mensagem foi enviada. A Vercel só aplica variável de ambiente nova em deployment novo.',
    };
  }

  // ⚠️⚠️ A RESPOSTA É PELO PRÓPRIO WHATSAPP (decisão do Matheus, 14/08: "quero
  // algo que a pessoa responda pelo wpp mesmo"). O template leva DOIS BOTÕES de
  // quick-reply — "Vou sim" e "Não vou poder" — e a resposta volta pelo webhook,
  // amarrada a esta escala pelo `message_id` que a fila grava.
  //
  // Por isso o corpo tem 3 variáveis e NENHUM link: botão é um toque, link é
  // sair do WhatsApp, abrir navegador e esperar carregar. O `/e/<token>`
  // continua existindo como caminho alternativo (o coordenador pode mandar na
  // mão), mas não é o que sai daqui.
  //
  // ⚠️ Os botões são ESTÁTICOS no template aprovado — o envio não muda por
  // causa deles. Se um dia virarem botões com payload dinâmico, aí sim será
  // preciso mandar `components` com `sub_type: 'quick_reply'`.
  const r = await fila.enfileirarLote(sel.rodada.map(g => ({
    telefone: g.telefone,
    template: templateName,
    idioma: 'pt_BR',
    params: g.params,
    // O prefixo do contexto é lido por `utils/whatsappModulo` pra decidir quem
    // é avisado quando a entrega falha — `voluntariado` tem regra própria e não
    // cai no fallback de todos os admin/diretor.
    contexto: CONTEXTO,
    // ⚠️ O ref_id é a PRIMEIRA escala do grupo, e é o que marca o dia inteiro
    // daquela pessoa como avisado. `selecionarRodada` procura por qualquer
    // escala do grupo justamente por isso.
    refId: g.escala_ids[0],
  })));

  return {
    ...relatorio,
    enfileirados: r.queued || 0,
    motivo: (r.queued || 0) === 0
      ? (r.motivo === 'disabled'
        ? 'O envio de WhatsApp está desligado (kill-switch) — nenhuma mensagem foi enviada.'
        : 'Nenhuma mensagem foi enfileirada.')
      : null,
  };
}

/**
 * O disparo do cron: a VÉSPERA. Avisa quem serve AMANHÃ (dia da igreja).
 *
 * ⚠️ `dias: 2` é só o limite externo da régua — quem recorta de verdade é o
 * `diasAlvo`. Com 1 o corte cairia em cima do culto de amanhã à noite (mais de
 * 24h à frente) e ele nunca seria avisado.
 */
async function avisarVespera(opts = {}) {
  const agora = opts.agora || new Date().toISOString();
  return avisarEscalasDaSemana({
    ...opts, agora, dias: 2, diasAlvo: new Set([diaRelativoBRT(agora, 1)]),
  });
}

module.exports = { avisarEscalasDaSemana, avisarVespera, CONTEXTO, TETO_RODADA };
