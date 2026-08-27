// ════════════════════════════════════════════════════════════════════════════
//  Disparo da campanha · monta o público, tira o snapshot e envia
//
//  ⚠️⚠️ POR QUE SNAPSHOT ANTES DE ENVIAR (LEI da casa: "em operação LONGA,
//  gravar o efeito DURANTE, não no fim"): 2.392 e-mails não cabem numa invocação
//  serverless. O disparo grava UMA LINHA POR DESTINATÁRIO em
//  `camp_disparo_envios` (status `pendente`) e só depois começa a enviar,
//  marcando cada linha assim que ela sai. Se a function morrer no meio, a
//  próxima rodada continua de onde parou — e ninguém recebe duas vezes, porque
//  o índice único é `(disparo_id, destino)`.
//
//  ⚠️ O interruptor é REAL. `wa_templates.ativo` existe, é editável na tela e
//  NENHUMA query do sistema lê aquela coluna — é um interruptor de mentira, e
//  este módulo não cria o terceiro. Quem desliga daqui desliga em
//  `whatsapp_config.disparos_off`, que é a lista que os crons consultam.
//
//  ⚠️ Fail-CLOSED no público: se a régua de elegibilidade não sabe responder, a
//  pessoa NÃO recebe. Pedido de dinheiro enviado por engano custa mais caro que
//  pedido não enviado.
// ════════════════════════════════════════════════════════════════════════════

const { supabase } = require('../utils/supabase');
const { montarPublico } = require('../utils/campanhaPublico');
const { calcularProgresso, brlRedondo } = require('../utils/campanhaProgresso');
const { disparoDesligado } = require('./comunicacaoDisparosOff');
const { enviarEmail, isConfigured: emailConfigurado } = require('./email');
const { enfileirarLote } = require('./whatsappFila');

/** Id no catálogo de disparos automáticos — é a chave do interruptor. */
const DISPARO_ID = 'campanha_semanal';
/** Contexto gravado na fila do WhatsApp, pro histórico da tela achar. */
const CONTEXTO_WA = 'campanha.disparo';

/** O PostgREST capa em 1000 linhas server-side. Paginação é obrigatória. */
async function paginado(montarQuery) {
  const out = [];
  for (let off = 0; ; off += 1000) {
    const { data, error } = await montarQuery(off, off + 999);
    if (error) throw error;
    out.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  return out;
}

const COLS = 'id, nome, email, telefone, whatsapp_optin, email_optout, status, active, deleted_at';

/**
 * Resolve o segmento em pessoas.
 *
 * ⚠️ TODO segmento filtra `deleted_at IS NULL` e `active`. Medido em 26/08: a
 * tabela tem 8.090 linhas e só 3.970 estão vivas — contar sem o filtro infla o
 * público em 2× e faz a prévia mentir pra quem vai autorizar o disparo.
 */
async function pessoasDoSegmento(segmento, campanhaId) {
  if (segmento === 'membros') {
    return paginado((de, ate) => supabase.from('mem_membros').select(COLS)
      .is('deleted_at', null).eq('active', true).eq('status', 'membro_ativo').range(de, ate));
  }

  if (segmento === 'voluntarios') {
    // ⚠️ `vol_profiles.membresia_id` é NULL em 36% dos perfis (lição da sessão de
    // 25/08), então voluntário aqui é quem TEM vínculo com a membresia — os
    // outros não têm cadastro pra onde mandar, e inventar um é proibido.
    const perfis = await paginado((de, ate) => supabase.from('vol_profiles')
      .select('membresia_id').not('membresia_id', 'is', null).range(de, ate));
    const ids = [...new Set(perfis.map((p) => p.membresia_id))];
    return porIds(ids);
  }

  if (segmento === 'pais_kids') {
    const vinc = await paginado((de, ate) => supabase.from('kids_responsaveis')
      .select('membro_id').not('membro_id', 'is', null).range(de, ate));
    const ids = [...new Set(vinc.map((v) => v.membro_id))];
    return porIds(ids);
  }

  if (segmento === 'doadores_campanha') {
    // Quem já doou nesta campanha — camada NOMINAL (`fin_transacoes.membro_id` e
    // `pag_cobrancas.membro_id`). ⚠️ NÃO soma dinheiro aqui, só coleta gente.
    const { data: camp } = await supabase.from('camp_campanhas')
      .select('digito, data_inicio, data_fim').eq('id', campanhaId).maybeSingle();
    const ids = new Set();
    if (camp?.digito) {
      let q = supabase.from('fin_transacoes').select('membro_id')
        .eq('tipo', 'receita').eq('identificador_centavo', camp.digito)
        .not('membro_id', 'is', null).limit(1000);
      if (camp.data_inicio) q = q.gte('data_competencia', camp.data_inicio);
      if (camp.data_fim) q = q.lte('data_competencia', camp.data_fim);
      const { data } = await q;
      for (const t of data || []) ids.add(t.membro_id);
    }
    const { data: cob } = await supabase.from('pag_cobrancas')
      .select('membro_id, metadata').eq('origem_tipo', 'generosidade').eq('status', 'pago')
      .is('deleted_at', null).not('membro_id', 'is', null).limit(1000);
    for (const c of cob || []) {
      if (String(c.metadata?.campanha_id || '') === String(campanhaId)) ids.add(c.membro_id);
    }
    return porIds([...ids]);
  }

  // 'todos' = a base VIVA inteira. A campanha do Kids fala com a igreja, não só
  // com quem é membro formal: visitante que frequenta há dois anos doa igual.
  return paginado((de, ate) => supabase.from('mem_membros').select(COLS)
    .is('deleted_at', null).eq('active', true).range(de, ate));
}

async function porIds(ids) {
  const out = [];
  for (let i = 0; i < ids.length; i += 500) {
    const fatia = ids.slice(i, i + 500);
    if (!fatia.length) break;
    const { data, error } = await supabase.from('mem_membros').select(COLS)
      .in('id', fatia).is('deleted_at', null).eq('active', true);
    if (error) throw error;
    out.push(...(data || []));
  }
  return out;
}

/**
 * Prévia: quem receberia, quem não, e por quê. NÃO envia e NÃO grava nada.
 *
 * ⚠️ É a tela que autoriza um pedido de dinheiro pra milhares de pessoas. O
 * número tem que vir com a repartição dos motivos ao lado, senão "1.847 de
 * 3.970" parece defeito do sistema em vez de retrato da base.
 */
async function previa({ campanha_id, canal, segmento }) {
  const pessoas = await pessoasDoSegmento(segmento, campanha_id);
  return montarPublico(pessoas, canal);
}

/**
 * Grava o snapshot do público. Idempotente: rodar duas vezes não duplica, por
 * causa do índice único `(disparo_id, destino)`.
 */
async function snapshot(disparo) {
  const pub = await previa({
    campanha_id: disparo.campanha_id, canal: disparo.canal, segmento: disparo.segmento,
  });

  const linhas = pub.alvo.map((a) => ({
    disparo_id: disparo.id,
    membro_id: a.id,
    canal: disparo.canal,
    destino: a.destino,
    status: 'pendente',
  }));

  for (let i = 0; i < linhas.length; i += 500) {
    const { error } = await supabase.from('camp_disparo_envios')
      .upsert(linhas.slice(i, i + 500), { onConflict: 'disparo_id,destino', ignoreDuplicates: true });
    // 23505 aqui é o caminho NORMAL (reentrega), não erro.
    if (error && error.code !== '23505') throw error;
  }

  await supabase.from('camp_disparos').update({
    total_alvo: pub.total_alvo,
    total_pulado: pub.total_fora,
    motivos_fora: pub.motivos,
    updated_at: new Date().toISOString(),
  }).eq('id', disparo.id);

  return pub;
}

/** Substitui as variáveis do corpo pelos números REAIS da campanha. */
async function materializar(texto, campanha) {
  if (!texto) return texto;
  const { data: arr } = await supabase.from('vw_camp_arrecadacao')
    .select('*').eq('campanha_id', campanha.id).maybeSingle();
  const p = calcularProgresso(arr || { meta_centavos: campanha.meta_centavos });

  // ⚠️ Número REDONDO na comunicação. "R$ 128 mil" mobiliza; "R$ 128.437,19"
  // parece contabilidade e faz quem lê confiar menos, não mais.
  return String(texto)
    .replace(/\{\{campanha\}\}/g, campanha.nome || '')
    .replace(/\{\{meta\}\}/g, brlRedondo(p.meta_centavos))
    .replace(/\{\{arrecadado\}\}/g, brlRedondo(p.total_centavos))
    .replace(/\{\{falta\}\}/g, brlRedondo(p.falta_centavos))
    .replace(/\{\{pct\}\}/g, `${Math.round(p.pct)}%`)
    .replace(/\{\{link\}\}/g, linkPublico(campanha.slug));
}

function linkPublico(slug) {
  const base = String(process.env.PUBLIC_SITE_URL || 'https://cbrio.org').replace(/\/+$/, '');
  // ⚠️ `/campanha/`, NUNCA `/c/`: `/c/:token` é o link assinado do voluntário
  // para lançar decisões no culto, e dois padrões idênticos no React Router fazem
  // o primeiro vencer — a barrinha abriria a tela de decisões.
  return `${base}/campanha/${slug}`;
}

/**
 * Corpo HTML do e-mail, com o rodapé de descadastro.
 *
 * ⚠️ O link de descadastro NÃO é enfeite: sem ele, quem não quer receber marca
 * como spam — e spam em massa derruba a reputação do domínio no Graph, o que
 * quebra o e-mail de TODOS os módulos (comprovante de inscrição, recuperação de
 * senha, escala). É a proteção do canal, não gentileza.
 */
function htmlDoEmail(corpo, { campanha, membroId }) {
  const base = String(process.env.PUBLIC_SITE_URL || 'https://cbrio.org').replace(/\/+$/, '');
  const saida = `${base}/api/public/campanhas/descadastrar?m=${encodeURIComponent(membroId || '')}`;
  const texto = String(corpo || '')
    .split('\n\n').map((par) => `<p style="margin:0 0 16px;line-height:1.6">${
      par.replace(/\n/g, '<br>')}</p>`).join('');

  return `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;
      max-width:560px;margin:0 auto;padding:24px;color:#1a1a1a;font-size:16px">
    ${texto}
    <hr style="border:none;border-top:1px solid #e5e5e5;margin:32px 0 16px">
    <p style="font-size:12px;color:#888;line-height:1.5;margin:0">
      Você recebeu este e-mail porque faz parte da Comunidade Batista do Rio.
      <a href="${saida}" style="color:#888">Não quero mais receber e-mails de campanha</a>.
    </p>
  </div>`;
}

/**
 * Envia o que está pendente. Chamado pelo cron, com orçamento de tempo.
 *
 * ⚠️ `budgetMs` existe porque a function serverless tem teto de execução: o
 * disparo processa o que couber e devolve `restantes`. A próxima rodada do cron
 * pega o resto. Sem isso, um lote grande morre no meio e a metade que já saiu
 * não fica registrada — que é justamente o que o snapshot resolve.
 */
async function enviarPendentes({ disparoId, budgetMs = 240000 } = {}) {
  const t0 = Date.now();

  if (await disparoDesligado(DISPARO_ID)) {
    return { enviados: 0, motivo: 'disparo desligado em Comunicação → Automáticas' };
  }

  let q = supabase.from('camp_disparos')
    .select('*, campanha:campanha_id(id, nome, slug, meta_centavos, status)')
    .in('status', ['agendado', 'enviando'])
    .lte('agendado_para', new Date().toISOString())
    .is('deleted_at', null)
    .order('agendado_para', { ascending: true })
    .limit(5);
  if (disparoId) q = supabase.from('camp_disparos')
    .select('*, campanha:campanha_id(id, nome, slug, meta_centavos, status)')
    .eq('id', disparoId).is('deleted_at', null).limit(1);

  const { data: disparos, error } = await q;
  if (error) throw error;

  const resultado = [];
  for (const d of disparos || []) {
    if (Date.now() - t0 > budgetMs) break;
    resultado.push(await processarUm(d, budgetMs - (Date.now() - t0)));
  }
  return { disparos: resultado };
}

async function processarUm(disparo, budgetMs) {
  const t0 = Date.now();

  // ⚠️ Campanha que não está ativa NÃO dispara. Pedido de doação de campanha
  // encerrada ou cancelada é o pior e-mail que a igreja pode mandar.
  if (disparo.campanha?.status !== 'ativa') {
    await supabase.from('camp_disparos').update({
      status: 'cancelado',
      erro: `Campanha está "${disparo.campanha?.status}" — disparo não sai fora de campanha ativa.`,
    }).eq('id', disparo.id);
    return { id: disparo.id, cancelado: true, motivo: 'campanha não ativa' };
  }

  if (disparo.status === 'agendado') {
    await snapshot(disparo);
    await supabase.from('camp_disparos').update({
      status: 'enviando', iniciado_em: new Date().toISOString(),
    }).eq('id', disparo.id);
  }

  const corpo = await materializar(disparo.corpo_texto, disparo.campanha);
  const assunto = await materializar(disparo.assunto, disparo.campanha);

  const { data: pendentes } = await supabase.from('camp_disparo_envios')
    .select('id, membro_id, destino')
    .eq('disparo_id', disparo.id).eq('status', 'pendente')
    .limit(disparo.canal === 'whatsapp' ? 1000 : 300);

  let enviados = 0;
  let falhas = 0;

  if (disparo.canal === 'whatsapp') {
    // ⚠️ NÃO envia direto: enfileira. `enfileirarLote` já tem a trava de
    // template rejeitado na Meta e o backoff, e o cron horário da fila drena
    // com o cap por telefone. Um loop de Meta API aqui estoura a function.
    const itens = (pendentes || []).map((p) => ({
      telefone: p.destino,
      template: disparo.wa_template || null,
      texto: disparo.wa_template ? null : corpo,
      params: disparo.wa_template ? [corpo] : [],
      contexto: CONTEXTO_WA,
      refId: disparo.id,
    }));
    const r = await enfileirarLote(itens);
    // ⚠️ "enfileirado" NÃO é "entregue". A linha vira `enviado` aqui porque a
    // responsabilidade passou pra fila do WhatsApp, que tem o próprio histórico
    // e o próprio aviso de falha terminal — duplicar o controle aqui faria dois
    // lugares discordarem sobre o mesmo envio.
    if (r.queued > 0) {
      const ids = (pendentes || []).slice(0, r.queued).map((p) => p.id);
      for (let i = 0; i < ids.length; i += 500) {
        await supabase.from('camp_disparo_envios').update({
          status: 'enviado', enviado_em: new Date().toISOString(),
          motivo: 'enfileirado na fila do WhatsApp',
        }).in('id', ids.slice(i, i + 500));
      }
      enviados = r.queued;
    }
    if (r.motivo) falhas = (pendentes || []).length - enviados;
  } else if (disparo.canal === 'email') {
    if (!emailConfigurado()) {
      await supabase.from('camp_disparos').update({
        status: 'falhou', erro: 'Nenhum canal de e-mail configurado (Graph nem Resend).',
      }).eq('id', disparo.id);
      return { id: disparo.id, erro: 'e-mail não configurado' };
    }
    for (const p of pendentes || []) {
      if (Date.now() - t0 > budgetMs) break;
      const r = await enviarEmail({
        to: p.destino,
        subject: assunto || disparo.nome,
        text: corpo,
        html: disparo.corpo_html
          ? htmlDoEmail(await materializar(disparo.corpo_html, disparo.campanha), { campanha: disparo.campanha, membroId: p.membro_id })
          : htmlDoEmail(corpo, { campanha: disparo.campanha, membroId: p.membro_id }),
      }).catch((e) => ({ ok: false, erro: e.message }));

      await supabase.from('camp_disparo_envios').update({
        status: r?.ok === false ? 'falhou' : 'enviado',
        motivo: r?.ok === false ? String(r.erro || 'falha no envio').slice(0, 500) : null,
        enviado_em: new Date().toISOString(),
      }).eq('id', p.id);

      if (r?.ok === false) falhas += 1; else enviados += 1;
    }
  }

  await recontar(disparo.id);
  // ⚠️ `head: true` NÃO devolve `data` — devolve `count`. Ler `data.length` aqui
  // daria 0 sempre, e o disparo se marcaria como "enviado" com fila cheia.
  const { count: restantes } = await supabase.from('camp_disparo_envios')
    .select('id', { count: 'exact', head: true })
    .eq('disparo_id', disparo.id).eq('status', 'pendente');

  if (!restantes) {
    await supabase.from('camp_disparos').update({
      status: 'enviado', concluido_em: new Date().toISOString(),
    }).eq('id', disparo.id);
  }

  return { id: disparo.id, enviados, falhas, restantes: restantes ?? 0 };
}

/** Recontagem a partir da VERDADE (as linhas), nunca de um contador somado. */
async function recontar(disparoId) {
  const { data } = await supabase.from('camp_disparo_envios')
    .select('status').eq('disparo_id', disparoId).limit(10000);
  const c = { enviado: 0, falhou: 0, pulado: 0 };
  for (const l of data || []) if (c[l.status] !== undefined) c[l.status] += 1;
  await supabase.from('camp_disparos').update({
    total_enviado: c.enviado, total_falha: c.falhou,
    updated_at: new Date().toISOString(),
  }).eq('id', disparoId);
  return c;
}

/**
 * Cria o disparo semanal de segunda, se ainda não existir para esta semana.
 *
 * A reunião definiu: "e-mail toda segunda-feira após o culto, reunindo o resumo
 * da campanha, o link do vídeo e o CTA para contribuição".
 *
 * ⚠️ Idempotente pela semana ISO: rodar o cron 24× no mesmo dia cria UM disparo.
 */
async function garantirSemanal(campanhaId) {
  const { data: camp } = await supabase.from('camp_campanhas')
    .select('*').eq('id', campanhaId).is('deleted_at', null).maybeSingle();
  if (!camp || camp.status !== 'ativa') return { criado: false, motivo: 'campanha não ativa' };

  const { data: modelo } = await supabase.from('camp_disparos')
    .select('*').eq('campanha_id', campanhaId)
    .eq('recorrencia', 'semanal_segunda').eq('canal', 'email')
    .is('deleted_at', null).order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (!modelo) return { criado: false, motivo: 'nenhum disparo semanal configurado' };

  const agora = new Date();
  const semana = semanaIso(agora);
  const nome = `${modelo.nome} · ${semana}`;

  const { data: existente } = await supabase.from('camp_disparos')
    .select('id').eq('campanha_id', campanhaId).eq('nome', nome)
    .is('deleted_at', null).maybeSingle();
  if (existente) return { criado: false, motivo: 'já existe o desta semana', id: existente.id };

  const { data: novo, error } = await supabase.from('camp_disparos').insert({
    campanha_id: campanhaId,
    nome,
    canal: 'email',
    segmento: modelo.segmento,
    assunto: modelo.assunto,
    corpo_texto: modelo.corpo_texto,
    corpo_html: modelo.corpo_html,
    recorrencia: 'unico',
    status: 'agendado',
    agendado_para: agora.toISOString(),
    created_by: modelo.created_by,
  }).select('id').single();
  if (error) throw error;
  return { criado: true, id: novo.id, semana };
}

/** Semana ISO 'YYYY-Www' em BRT. Chave estável pra idempotência semanal. */
function semanaIso(d) {
  const brt = new Date(d.getTime() - 3 * 3600 * 1000);
  const alvo = new Date(Date.UTC(brt.getUTCFullYear(), brt.getUTCMonth(), brt.getUTCDate()));
  const dia = alvo.getUTCDay() || 7;
  alvo.setUTCDate(alvo.getUTCDate() + 4 - dia);
  const ano = alvo.getUTCFullYear();
  const jan1 = new Date(Date.UTC(ano, 0, 1));
  const sem = Math.ceil(((alvo - jan1) / 86400000 + 1) / 7);
  return `${ano}-W${String(sem).padStart(2, '0')}`;
}

module.exports = {
  DISPARO_ID,
  CONTEXTO_WA,
  previa,
  snapshot,
  enviarPendentes,
  garantirSemanal,
  materializar,
  linkPublico,
  htmlDoEmail,
  recontar,
  semanaIso,
  pessoasDoSegmento,
};
