// Push pro APP de membros (Expo) direto do backend do sistema.
// Espelha a Edge Function _shared/notify.ts do app: grava em app_notificacoes
// (histórico in-app) e dispara via Expo Push API pros tokens de app_push_tokens.
// No-op gracioso se não houver token. Não usar pra push do ERP web (esse é o
// webpush.js/VAPID).
const { supabase } = require('../utils/supabase');
const { fetchAllRows } = require('../utils/pagination');
// ⚠️ Régua gêmea de `Aplicativo-CBRio/lib/pushLotes.ts` — ver o cabeçalho de lá.
const { lotesDePush, tokenMorreu } = require('../utils/pushLotes');
const { filtrarPorApp, contarSemCarimbo } = require('../utils/appPushDestino');

// ⚠️⚠️ LEITURA DE TOKEN É PAGINADA E EM LOTES (auditoria 06/08/2026).
// Duas armadilhas somadas, as duas SILENCIOSAS:
//   1. o PostgREST capa em 1000 linhas server-side (sem erro), então a partir de
//      ~1.000 instalações o broadcast alcançava só o primeiro pedaço da base —
//      a igreja "não recebia o aviso" e nenhum log acusava. Medido em 06/08: 29
//      tokens hoje, ou seja gatilho armado, não estrago consumado.
//   2. `.in()` com a lista inteira estoura a URL do PostgREST e a query falha
//      INTEIRA — mesma lição do `.in()` gigante da Onda 1 de performance.
// Régua da casa: leitura de tabela que cresce com o uso vai por `fetchAllRows`,
// e `.in()` sempre em lotes de <= 200.
const LOTE_IN = 200;

async function lerEmLotes(ids, build) {
  const out = [];
  for (let i = 0; i < ids.length; i += LOTE_IN) {
    const fatia = ids.slice(i, i + LOTE_IN);
    out.push(...(await fetchAllRows(() => build(fatia))));
  }
  return out;
}

function safeText(value, max = 500) {
  return value == null ? null : String(value).replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max) || null;
}

async function persistExpoTickets(items) {
  if (!items.length) return;
  const { error } = await supabase.from('system_mobile_push_tickets').insert(items);
  if (error) console.warn('[appPush] histórico de tickets:', error.message);
}

// Resolve membro_id -> user_id (profiles.id) quando vier por membro.
async function membrosParaUsuarios(membroIds) {
  if (!membroIds?.length) return [];
  const rows = await lerEmLotes(
    [...new Set(membroIds.filter(Boolean))],
    (fatia) => supabase.from('profiles').select('id').in('membro_id', fatia),
  );
  return rows.map((p) => p.id).filter(Boolean);
}

// Dispara push Expo (SEM gravar histórico in-app) pros tokens registrados em
// app_push_tokens dos usuários informados. Best-effort: nunca lança — loga e
// retorna { enviados: 0 } em caso de erro. Lotes de até 100 (limite da Expo
// Push API por request).
async function pushExpoParaUsers(userIds, { title, body, data, app } = {}) {
  try {
    const ids = [...new Set((userIds || []).filter(Boolean))];
    if (!ids.length || !title) return { enviados: 0 };

    // ⚠️ `projeto_id` num SELECT que pode não existir ainda: se a migration
    // `20260807220000` não tiver rodado, o PostgREST derruba a query INTEIRA por
    // coluna desconhecida (não devolve "0 linhas" — falha tudo). Sem este
    // resgate, o push pararia em vez de só perder o agrupamento.
    let toks;
    try {
      toks = await lerEmLotes(
        ids,
        (fatia) => supabase.from('app_push_tokens').select('token,platform,projeto_id').in('user_id', fatia),
      );
    } catch (e) {
      if (!/projeto_id/i.test(String(e?.message || ''))) throw e;
      console.warn('[appPush] coluna projeto_id ausente — rode a migration 20260807220000');
      toks = await lerEmLotes(
        ids,
        (fatia) => supabase.from('app_push_tokens').select('token,platform').in('user_id', fatia),
      );
    }

    // ⚠️⚠️ SEPARA OS DOIS APPS (20/08/2026). `app_push_tokens` é UMA tabela pros
    // DOIS apps Expo, e sem `app` o push ia pra TODOS os tokens da pessoa —
    // então o aviso operacional do ERP (`notificar`) aparecia no app de
    // MEMBROS de quem usa os dois com a mesma conta. A régua está em
    // `utils/appPushDestino` e EXCLUI o que é comprovadamente do outro app;
    // token sem carimbo continua recebendo (lista branca derrubaria o push de
    // todo aparelho de staff que ainda não reabriu o app).
    // ⚠️ Sem `app`, o comportamento é o de sempre — chamador que não declara
    // alvo não pode ser silenciado por engano.
    if (app) {
      const antes = (toks || []).length;
      toks = filtrarPorApp(toks, app);
      const semCarimbo = contarSemCarimbo(toks);
      if (antes !== toks.length || semCarimbo) {
        console.log(`[appPush] app=${app} tokens=${antes}->${toks.length} sem_carimbo=${semCarimbo}`);
      }
    }

    // ⚠️⚠️ AGRUPA POR APP EXPO (07/08/2026). Aqui o chunk era só de 100, POR
    // ORDEM DE LEITURA — e `app_push_tokens` recebe token de DOIS apps Expo
    // (membros e CBRio Staff). A Expo recusa o REQUEST INTEIRO quando eles vão
    // juntos: 1.801 de 1.820 tickets em erro, 1.773 com
    // `PUSH_TOO_MANY_EXPERIENCE_IDS`. Um token do Staff derrubava a entrega dos
    // 30 tokens iOS válidos. A dedupe por token agora vive na régua.
    const lotes = lotesDePush(toks || []);
    if (!lotes.length) return { enviados: 0 };
    const totalMensagens = lotes.reduce((n, l) => n + l.length, 0);

    let aceitos = 0;
    let erros = 0;
    const mortos = [];

    // ⚠️⚠️ ENVIO EM PARALELO, COM TETO (07/08/2026 · Onda 4).
    //
    // Isto conserta um risco que o conserto de ONTEM criou. Ao agrupar por app
    // Expo, todo token com `projeto_id` NULL passou a ir **um por request** —
    // correto, e é o que destravou a entrega. Só que o laço era SERIAL, e a
    // função da Vercel tem `maxDuration: 300` (vercel.json:8). A ~1,16 s por
    // request medido, isso dá:
    //     30 tokens (hoje) ....  ~35 s   → folga confortável
    //    250 tokens ..........  ~290 s   → **encosta no teto**
    //  1.000+ tokens (alvo) ...  morre no meio do broadcast
    // E morre em SILÊNCIO: a Vercel mata a função, metade da igreja recebe, e
    // nada acusa. Trocaríamos "recusa tudo" (o bug de ontem) por "entrega
    // metade sem avisar", que é pior de achar.
    //
    // ⚠️ O teto de 6 não é enfeite: a Expo limita taxa por projeto e responde
    // `MessageRateExceeded`. 6 em paralelo × ~1 req/s fica bem abaixo do limite
    // publicado e ainda assim leva 1.000 tokens de ~19 min pra ~3 min.
    // ⚠️ Depois da migration `20260807220000`, a maioria dos tokens volta pro
    // lote de 100 e isto deixa de importar tanto — mas o caminho de 1-por-
    // request continua vivo pros tokens do app Staff, que nunca carimba.
    const CONCORRENCIA = 6;

    async function enviarLote(chunkTokens) {
      const chunk = chunkTokens.map((item) => ({
        to: item.token,
        // ⚠️ `cbrio_chime.wav` com UNDERSCORE — é o nome do asset em
        // `app.json:55` e do canal Android em `lib/push.ts:40`. Aqui estava
        // `cbrio-chime.wav` com hífen: som que não existe, então o iOS caía no
        // silêncio/padrão em todo push disparado pelo ERP.
        sound: 'cbrio_chime.wav',
        channelId: 'default',
        title,
        body,
        data: data || {},
      }));
      try {
        // ⚠️⚠️ TIMEOUT OBRIGATÓRIO. Desde 11/08 esta cadeia é AWAITED no
        // formulário público de grupos, ou seja está no caminho da resposta de
        // quem está se inscrevendo. `fetch` sem `signal` não tem teto: exp.host
        // lento seguraria a pessoa até o `maxDuration` da função, e ela veria
        // ERRO num pedido que FOI gravado — exatamente o dano que a lei do
        // awaited existe pra evitar. 8s é folgado (a média medida é ~1,16s).
        // ⚠️ O push é o que pode se perder aqui; o SINO já foi gravado antes.
        const response = await fetch('https://exp.host/--/api/v2/push/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify(chunk),
          signal: AbortSignal.timeout(8000),
        });
        const payload = await response.json().catch(() => ({}));
        const tickets = Array.isArray(payload?.data) ? payload.data : [];
        const rows = chunkTokens.map((token, index) => {
          const ticket = tickets[index] || {};
          const accepted = response.ok && ticket.status === 'ok' && ticket.id;
          if (accepted) aceitos += 1;
          else erros += 1;
          const code = ticket.details?.error || payload?.errors?.[0]?.code || `HTTP_${response.status}`;
          // ⚠️ SÓ `DeviceNotRegistered` some. Apagar por erro de LOTE teria
          // zerado a tabela — 1.773 tickets traziam
          // `PUSH_TOO_MANY_EXPERIENCE_IDS`, culpa do request e não do token.
          if (!accepted && tokenMorreu(code)) mortos.push(token.token);
          return {
            provider_ticket_id: accepted ? safeText(ticket.id, 160) : null,
            platform: ['android', 'ios'].includes(String(token.platform).toLowerCase()) ? String(token.platform).toLowerCase() : 'unknown',
            ticket_status: accepted ? 'accepted' : 'error',
            ticket_error_code: accepted ? null : safeText(ticket.details?.error || payload?.errors?.[0]?.code || `HTTP_${response.status}`, 120),
            ticket_error_message: accepted ? null : safeText(ticket.message || payload?.errors?.[0]?.message, 500),
          };
        });
        await persistExpoTickets(rows);
      } catch (error) {
        erros += chunk.length;
        console.error('[appPush] Expo:', error.message);
        await persistExpoTickets(chunkTokens.map((token) => ({
          platform: ['android', 'ios'].includes(String(token.platform).toLowerCase()) ? String(token.platform).toLowerCase() : 'unknown',
          ticket_status: 'error',
          ticket_error_code: 'NETWORK_ERROR',
          ticket_error_message: safeText(error.message, 500),
        })));
      }
    }

    // Pool simples: N trabalhadores puxam da mesma fila até acabar. Sem
    // dependência nova, e `enviarLote` já não lança (tem try/catch próprio),
    // então nenhum trabalhador morre e deixa lote pra trás.
    const fila = [...lotes];
    await Promise.all(
      Array.from({ length: Math.min(CONCORRENCIA, fila.length) }, async () => {
        for (let lote = fila.shift(); lote; lote = fila.shift()) {
          await enviarLote(lote);
        }
      }),
    );

    // Limpeza best-effort dos tokens que a Expo declarou permanentemente mortos.
    if (mortos.length) {
      const { error } = await supabase.from('app_push_tokens').delete().in('token', mortos);
      if (error) console.warn('[appPush] limpar tokens mortos:', error.message);
    }

    return { enviados: totalMensagens, aceitos, erros };
  } catch (e) {
    console.error('[appPush] pushExpoParaUsers erro:', e.message);
    return { enviados: 0 };
  }
}

/**
 * Grava o aviso no sino do app e dispara o push.
 *
 * ⚠️ A ORDEM É LEI: o insert em `app_notificacoes` vem ANTES de olhar token. É o
 * que faz o aviso funcionar no **Android sem Firebase** — hoje 100% dos 42 tokens
 * da base são iOS, então pra a maioria da frota o sino É o canal. Inverter a
 * ordem transformaria "sem push" em "sem aviso nenhum".
 *
 * @param {string[]} userIds profiles.id (= auth.users.id)
 * @param {{tipo,titulo,body,data?,chaveDedup?}} payload
 *   `chaveDedup` amarra o aviso ao FATO (ex.: `grupo_pedido:<id do pedido>`), não
 *   ao instante — ver o comentário do upsert abaixo.
 */
async function notificarApp(userIds, payload) {
  try {
    const ids = [...new Set((userIds || []).filter(Boolean))];
    if (!ids.length) return { enviados: 0 };

    // 1) histórico in-app (1 por user)
    const dedup = payload.chaveDedup || null;
    const rows = ids.map((u) => ({
      user_id: u, tipo: payload.tipo, titulo: payload.titulo,
      body: payload.body, data: payload.data || {},
      ...(dedup ? { chave_dedup: dedup } : {}),
    }));

    // ⚠️⚠️ O ERRO DO INSERT ERA DESCARTADO — e `user_id` é FK pra `auth.users`.
    // Como o insert é em LOTE, um id ruim (profile órfão) fazia o PostgREST
    // recusar a operação INTEIRA e **ninguém** recebia, em silêncio. Agora, em
    // erro de lote, reinsere linha a linha: quem dá pra avisar é avisado, e quem
    // não dá aparece no log com o motivo.
    let persistidos = 0;
    const semDedup = (ls) => ls.map(({ chave_dedup: _fora, ...r }) => r);
    const gravar = async (lote) => {
      // `upsert` + `onConflict` só quando há chave: sem ela não há alvo pra
      // inferir e o upsert não teria o que deduplicar.
      const q = dedup
        ? supabase.from('app_notificacoes')
          .upsert(lote, { onConflict: 'user_id,chave_dedup', ignoreDuplicates: true })
        : supabase.from('app_notificacoes').insert(lote);
      return q;
    };

    // ⚠️⚠️ A GUARDA É POR CÓDIGO, NÃO POR TEXTO. Casar a MENSAGEM do PostgREST
    // é depender do idioma de um terceiro: `42P10` ("no unique or exclusion
    // constraint matching the ON CONFLICT") **não cita `chave_dedup`** e passaria
    // batido — cenário real se a migration for meia-aplicada (coluna criada, o
    // `create unique index` falhando em tabela viva). O idioma de código já é o
    // canônico do repo (`inscricoes.js` colunaAusente, `censoDisparo.js`).
    const semColuna = (e) => ['42703', 'PGRST204', '42P10'].includes(e?.code);

    let { error } = await gravar(rows);
    let degradado = false;
    if (error && semColuna(error)) {
      // ⚠️ Deploy em 2 etapas: sem a migration `20260811150000` a coluna não
      // existe e o PostgREST recusa a query inteira por coluna desconhecida.
      // Degrada pro comportamento antigo (avisar sem dedup) em vez de não avisar
      // — é a lição do `parcelas_max`, e aqui o aviso é o que importa.
      console.warn('[appPush] sem chave_dedup (migration pendente) — gravando sem dedup');
      degradado = true;
      ({ error } = await supabase.from('app_notificacoes').insert(semDedup(rows)));
      if (!error) persistidos = rows.length;
    } else if (!error) {
      persistidos = rows.length;
    }

    if (error) {
      console.error('[appPush] insert em lote falhou:', error.code, error.message);
      // ⚠️⚠️ O RESGATE HERDA A FORMA DA ÚLTIMA TENTATIVA. Reusar a query que
      // acabou de falhar por coluna ausente refaria o MESMO erro em cada linha,
      // e o log culparia `chave_dedup` no lugar do motivo real (o caso concreto:
      // um `user_id` órfão viola a FK de `auth.users` e derruba o LOTE, aí o
      // resgate linha-a-linha existe justamente pra salvar os válidos).
      const linhas = degradado ? semDedup(rows) : rows;
      // ⚠️ TETO: esta função também serve o broadcast de evento publicado, que
      // manda em lotes de 500 — sem teto, uma falha de lote viraria 500
      // round-trips sequenciais dentro de um request.
      const TETO_RESGATE = 25;
      for (const r of linhas.slice(0, TETO_RESGATE)) {
        const { error: e1 } = degradado
          ? await supabase.from('app_notificacoes').insert([r])
          : await gravar([r]);
        if (e1) console.warn(`[appPush] aviso perdido user=${r.user_id}: ${e1.code} ${e1.message}`);
        else persistidos += 1;
      }
      if (linhas.length > TETO_RESGATE) {
        console.warn(`[appPush] resgate parou no teto: ${linhas.length - TETO_RESGATE} avisos não gravados`);
      }
    }

    // 2) push Expo pros tokens
    // ⚠️ `app: 'membros'` porque o histórico acima (`app_notificacoes`) é lido
    // SÓ pelo app do membro — mandar a banner pro Staff daria push de um aviso
    // que não existe no sino de lá.
    const { enviados } = await pushExpoParaUsers(ids, {
      title: payload.titulo,
      body: payload.body,
      data: { tipo: payload.tipo, ...(payload.data || {}) },
      app: 'membros',
    });
    return { enviados, persistidos };
  } catch (e) {
    console.error('[appPush] erro:', e.message);
    return { enviados: 0 };
  }
}

module.exports = { notificarApp, membrosParaUsuarios, pushExpoParaUsers };
