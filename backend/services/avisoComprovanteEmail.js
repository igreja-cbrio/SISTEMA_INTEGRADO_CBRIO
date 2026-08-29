// ============================================================================
// Envia o comprovante (QR + número da sorte) por e-mail, UM POR INSCRIÇÃO.
//
// ⚠️ LEI de 04/08 aplicada: a linha de `insc_aviso_envios` nasce ANTES do
// envio e é marcada logo DEPOIS de cada e-mail. Morte no meio (timeout da
// função, deploy) deixa gravado o que já saiu, e a rodada seguinte continua de
// onde parou em vez de reenviar pra todo mundo.
// ============================================================================
const { supabase } = require('../utils/supabase');
const { enviarEmail, isConfigured } = require('./email');
const { gerarTokenComprovante, verificarTokenComprovante } = require('./inscricaoComprovante');
const {
  destinatarioDaInscricao, tokenConfereComInscricao, montarAviso,
} = require('../utils/avisoComprovante');

// Orçamento de TEMPO, não só de quantidade: `enviarEmail` tem retry com backoff,
// e uma rodada com muitos endereços ruins passaria do `maxDuration` de 300s —
// função morta no meio não registra o que já saiu (lição do disparo do censo).
const ORCAMENTO_MS = 200_000;
const TETO_RODADA = 400;

function baseUrl() {
  const u = process.env.FRONTEND_URL || '';
  // ⚠️ Link local NUNCA sai em mensagem (incidente de 29/07) — sem env boa,
  // vale o domínio de produção.
  if (/localhost|127\.0\.0\.1|0\.0\.0\.0|:\/\/10\.|:\/\/192\.168\.|:\/\/172\.(1[6-9]|2\d|3[01])\./.test(u)) return 'https://www.cbrio.org';
  return (u || 'https://www.cbrio.org').replace(/\/+$/, '');
}

function formatarQuando(ev) {
  if (!ev?.data) return '';
  const [a, m, d] = String(ev.data).split('-');
  if (!a || !m || !d) return '';
  const hora = ev.hora ? ` às ${String(ev.hora).slice(0, 5)}` : '';
  return `${d}/${m}/${a}${hora}`;
}

async function lerInscricoesConfirmadas(eventoId) {
  const out = [];
  for (let off = 0; off < 20000; off += 1000) {
    const { data, error } = await supabase.from('inscricoes')
      .select('id, nome_completo, email, numero_sorte, membro_id')
      .eq('evento_id', eventoId).is('deleted_at', null).eq('status', 'confirmada')
      .order('created_at', { ascending: true })
      .range(off, off + 999);
    if (error) throw error;
    out.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  return out;
}

async function emailsDosMembros(ids) {
  const mapa = new Map();
  for (let i = 0; i < ids.length; i += 200) {
    const { data } = await supabase.from('mem_membros')
      .select('id, email').in('id', ids.slice(i, i + 200));
    for (const m of (data || [])) mapa.set(m.id, m);
  }
  return mapa;
}

/** Quem receberia — sem enviar nada. É o número que a tela mostra ANTES. */
async function previaAvisoEmail(eventoId) {
  const inscricoes = await lerInscricoesConfirmadas(eventoId);
  const membros = await emailsDosMembros([...new Set(inscricoes.map(i => i.membro_id).filter(Boolean))]);
  let comEmail = 0;
  for (const i of inscricoes) if (destinatarioDaInscricao(i, membros.get(i.membro_id))) comEmail++;

  const { data: jaEnv } = await supabase.from('insc_aviso_envios')
    .select('inscricao_id').eq('evento_id', eventoId).eq('canal', 'email')
    .not('enviado_em', 'is', null);
  const ja = new Set((jaEnv || []).map(r => r.inscricao_id));

  return {
    confirmados: inscricoes.length,
    com_email: comEmail,
    sem_email: inscricoes.length - comEmail,
    ja_enviados: ja.size,
    // Quem ainda falta receber — é o que o botão vai processar.
    faltam: Math.max(0, comEmail - ja.size),
    canal_pronto: isConfigured(),
  };
}

/** Envia (ou continua) a rodada. Devolve o que saiu E o que sobrou. */
async function enviarAvisoEmail(eventoId, evento) {
  if (!isConfigured()) return { ok: false, motivo: 'sem_canal', enviados: 0 };

  const inscricoes = await lerInscricoesConfirmadas(eventoId);
  const membros = await emailsDosMembros([...new Set(inscricoes.map(i => i.membro_id).filter(Boolean))]);

  const { data: jaEnv } = await supabase.from('insc_aviso_envios')
    .select('inscricao_id').eq('evento_id', eventoId).eq('canal', 'email')
    .not('enviado_em', 'is', null);
  const ja = new Set((jaEnv || []).map(r => r.inscricao_id));

  const fila = [];
  let semEmail = 0;
  for (const i of inscricoes) {
    if (ja.has(i.id)) continue;
    const email = destinatarioDaInscricao(i, membros.get(i.membro_id));
    if (!email) { semEmail++; continue; }
    fila.push({ insc: i, email });
  }

  // Snapshot ANTES do envio (a linha existe mesmo se a função morrer agora).
  const lote = fila.slice(0, TETO_RODADA);
  if (lote.length) {
    await supabase.from('insc_aviso_envios')
      .upsert(lote.map(x => ({ evento_id: eventoId, inscricao_id: x.insc.id, canal: 'email' })),
              { onConflict: 'evento_id,inscricao_id,canal', ignoreDuplicates: true });
  }

  const quando = formatarQuando(evento);
  const inicio = Date.now();
  let enviados = 0, falhas = 0, recusados = 0, adiados = 0;

  for (const { insc, email } of lote) {
    if (Date.now() - inicio > ORCAMENTO_MS) { adiados = lote.length - (enviados + falhas + recusados); break; }

    const token = gerarTokenComprovante(insc.id);
    // ⚠️⚠️ A GUARDA: o link tem que voltar pra ESTA inscrição. Se não voltar,
    // nada é enviado — é o que impede uma pessoa receber o QR de outra.
    if (!tokenConfereComInscricao(token, insc.id, verificarTokenComprovante)) {
      recusados++;
      await supabase.from('insc_aviso_envios')
        .update({ erro: 'token nao confere com a inscricao' })
        .eq('evento_id', eventoId).eq('inscricao_id', insc.id).eq('canal', 'email');
      continue;
    }

    const link = `${baseUrl()}/i/c/${token}`;
    const { subject, html, text } = montarAviso({ inscricao: insc, evento, link, quando });

    let anexos;
    try {
      const QR = require('qrcode');
      const png = await QR.toBuffer(link, { width: 600, margin: 2 });
      // ⚠️ As chaves são `nome`/`tipo` (é o que `anexosDentroDoTeto` exige) —
      // com `filename`/`contentType` o anexo é descartado EM SILÊNCIO.
      anexos = [{ nome: 'comprovante.png', base64: png.toString('base64'), tipo: 'image/png' }];
    } catch {
      // Sem o anexo o e-mail ainda serve (o link abre o QR) — deixar de enviar
      // por causa da imagem seria trocar o comprovante por nada.
      anexos = undefined;
    }

    // ⚠️ `to` é UM endereço, nunca lista: 334 inscrições para 314 endereços
    // (família compartilha caixa), e um `to` com duas pessoas entregaria o
    // mesmo QR às duas.
    const r = await enviarEmail({ to: email, subject, html, text, attachments: anexos });
    if (r && r.ok === true) {
      enviados++;
      await supabase.from('insc_aviso_envios')
        .update({ enviado_em: new Date().toISOString(), erro: null })
        .eq('evento_id', eventoId).eq('inscricao_id', insc.id).eq('canal', 'email');
    } else {
      falhas++;
      await supabase.from('insc_aviso_envios')
        .update({ erro: String(r?.error || 'falha no envio').slice(0, 300) })
        .eq('evento_id', eventoId).eq('inscricao_id', insc.id).eq('canal', 'email');
    }
  }

  return {
    ok: true, enviados, falhas, recusados, adiados,
    sem_email: semEmail,
    restantes: Math.max(0, fila.length - enviados),
  };
}

module.exports = { previaAvisoEmail, enviarAvisoEmail };
