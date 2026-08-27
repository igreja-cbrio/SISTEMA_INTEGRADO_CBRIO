// ============================================================================
// Formulário PÚBLICO de decisão online · "Eu aceito Jesus"
// ============================================================================
// Link fixado na descricao/chat da live. Quem assiste online e decide preenche
// nome + telefone · o sistema:
//   1. resolve o culto online que esta NO AR agora (janela do horario);
//   2. grava cultos_decisoes_pessoas (tipo='online', fonte='form_publico');
//   3. o trigger fn_cultos_dec_online_form_incrementa soma +1 em
//      cultos.decisoes_online (KPI ONL-13 recalcula em tempo real).
//
// Público · sem auth · usa service_role (bypassa RLS). Monta em /api/public/...
// (já coberto pelo publicLimiter global) + limiter dedicado anti-spam.
// ============================================================================
const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const crypto = require('crypto');
const { supabase } = require('../utils/supabase');
const { findCultoAtual } = require('../services/onlineCollectors');
const { registrarConsentimentos, TEXTOS } = require('../services/inscricaoContrato');
const { validarDecisao } = require('../utils/decisaoCampos');
const { verificarTokenDecisao } = require('../utils/decisaoToken');
const { hojeBRT } = require('../utils/cultoJanela');
const { bairroPorCep } = require('../services/geoBrasil');
const { canonizarBairro } = require('../services/bairroCanonico');

// Quantos dias pra trás aceitamos anexar a decisão de quem assiste o REPLAY.
// Medido em 14/08/2026: nos últimos 120 dias houve culto online em 111 deles,
// com intervalo máximo de 3 dias e NENHUM acima de 7. Ou seja, 7 dias cobre
// 100% dos casos reais e o "não há culto" vira inalcançável na prática.
const DIAS_REPLAY = 7;

// ⚠️ Limiter generoso e o router montado ANTES do publicLimiter estrito (com
// entrada no skip() do global). O teto anterior era 8/min AQUI somado a
// 30/15min por IP lá — e a igreja inteira sai pelo NAT do prédio.
const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Muitas tentativas · aguarde um instante.' },
});
router.use(limiter);

function soDigitos(s) {
  return String(s || '').replace(/\D/g, '');
}

// Último culto online dos últimos DIAS_REPLAY dias. É o que sustenta o replay:
// quem assiste a gravação na terça decidiu de verdade, e a decisão pertence
// àquela transmissão. Sem isto a única saída seria gravar `culto_id` nulo — e
// aí `tg_cultos_dec_pessoas_to_cuidados` faz `RETURN NEW` e a pessoa NUNCA
// entra na fila pastoral, trocando "decisão perdida" por "decisão registrada e
// abandonada", que é pior porque some do radar.
async function ultimoCultoOnlineRecente() {
  const desde = new Date(Date.now() - 3 * 60 * 60 * 1000 - DIAS_REPLAY * 86400000)
    .toISOString().slice(0, 10);
  // ⚠️⚠️ ORDENA POR DATA **E HORA**. Antes era `.order('data').limit(1)`, e
  // domingo tem TRÊS cultos online na mesma data (09:30, 11:30 e 19:00) — o
  // Postgres devolvia qualquer um deles, conforme o plano de execução. Ou
  // seja: quem decidia na segunda-feira vendo o replay caía num culto
  // SORTEADO entre os três. O domingo estava certo, o culto não, e o número
  // por culto ficava sujo sem ninguém perceber.
  //
  // ⚠️ A ordenação por hora é feita em JS de propósito: `recurrence_time` vive
  // na tabela do TIPO (join), e ordenar por coluna de relação no PostgREST é
  // frágil. São no máximo ~10 cultos online em 7 dias — cabe na memória.
  const { data } = await supabase
    .from('cultos')
    .select('id, data, vol_service_types!inner(name, has_online, recurrence_time)')
    .eq('vol_service_types.has_online', true)
    .gte('data', desde)
    .order('data', { ascending: false })
    .limit(60);
  if (!data?.length) return null;
  const ordenados = [...data].sort((a, b) => {
    if (a.data !== b.data) return a.data < b.data ? 1 : -1;
    const ha = a.vol_service_types?.recurrence_time || '';
    const hb = b.vol_service_types?.recurrence_time || '';
    return ha < hb ? 1 : ha > hb ? -1 : 0;
  });
  const c = ordenados[0];
  return { id: c.id, data: c.data, nome: c.vol_service_types?.name || 'Culto' };
}

// Resolve o culto online relacionado agora. Reusa findCultoAtual (janela
// [-30min, +4h] do horario, has_online=true). Com comFallback=true ainda anexa
// ao último culto online do dia no grace pos-live (quem preenche atrasado) e,
// por último, ao último culto online recente (replay).
async function resolverCultoOnline({ comFallback = false } = {}) {
  const culto = await findCultoAtual({ fallbackUltimoDoDia: comFallback });
  if (culto) {
    const st = culto.vol_service_types;
    if (st?.has_online) return { id: culto.id, data: culto.data, nome: st.name || 'Culto' };
  }
  return comFallback ? await ultimoCultoOnlineRecente() : null;
}

/**
 * Leva o CEP declarado ao CADASTRO da pessoa — é o que transforma o campo do
 * formulário na análise que o Matheus pediu ("de onde a maior parte das pessoas
 * assiste"). O mapa da aba Perfil agrega por `vw_dem_pessoa.cep_regiao`, que sai
 * de `mem_membros.cep`; parado em `cultos_decisoes_pessoas` o CEP não vira mapa.
 *
 * ⚠️⚠️ SÓ-ONDE-VAZIO, nos dois campos. É a política do censo e do
 * `completarBairroPorCep` da Membresia: valor já preenchido é decisão humana (a
 * equipe corrigiu, ou a própria pessoa atualizou o cadastro) e um formulário
 * NÃO sobrescreve isso. O que a pessoa declarou aqui fica guardado em
 * `cultos_decisoes_pessoas.cep` de qualquer forma.
 *
 * ⚠️ O bairro vem do ViaCEP (`bairroPorCep` · ~200 ms, sem rate-limit) e passa
 * pela grafia canônica, senão a porta volta a fabricar as duas escritas que a
 * consolidação de 24/08 acabou de juntar ("Barra" × "Barra da Tijuca").
 * NUNCA chamar o Nominatim aqui: são 1,1 s de fila por consulta, e isso é o
 * caminho de alguém esperando a tela responder.
 *
 * ⚠️ NÃO grava `mem_membros.lat/lng`: coordenada de pessoa é reservada a
 * endereço de RUA conferido (lição do `pinosMapa.ts`). O mapa por CEP resolve a
 * coordenada em `dem_cep_geo`, que é cache de código postal.
 */
async function levarCepAoCadastro(membroId, cep) {
  if (!membroId || !cep) return;

  const { data: membro } = await supabase
    .from('mem_membros')
    .select('id, cep, bairro')
    .eq('id', membroId)
    .is('deleted_at', null)
    .maybeSingle();
  if (!membro) return;

  const patch = {};
  if (!String(membro.cep || '').trim()) patch.cep = cep;

  if (!String(membro.bairro || '').trim()) {
    const via = await bairroPorCep(cep);
    if (via?.bairro) patch.bairro = await canonizarBairro(via.bairro);
  }

  if (!Object.keys(patch).length) return;

  // ⚠️ Guarda de corrida: `.is(campo, null)` não serve porque a coluna pode
  // estar com string VAZIA (a base tem as duas formas de "sem valor" — lição do
  // `genero = ''`). Reconferimos o valor lido, então uma escrita humana entre a
  // leitura e o UPDATE não é sobrescrita.
  let q = supabase.from('mem_membros').update(patch).eq('id', membroId);
  if (patch.cep !== undefined) q = q.or('cep.is.null,cep.eq.');
  if (patch.bairro !== undefined) q = q.or('bairro.is.null,bairro.eq.');
  await q;
}

/**
 * Culto vindo do TOKEN do QR gravado no vídeo.
 *
 * Devolve `{ culto, replay }`:
 *   · `replay: false` — aquele culto é o que está no ar (ou acabou de sair):
 *     comportamento de sempre, a jornada pastoral conta da data do culto;
 *   · `replay: true`  — vídeo antigo: a pessoa decidiu HOJE, e é de hoje que
 *     o relógio do primeiro contato precisa contar.
 *
 * ⚠️ Token inválido devolve `null` e o chamador cai na resolução por relógio —
 * NUNCA recusa a decisão. Um QR arranhado, mal impresso ou de uma versão antiga
 * do overlay não pode custar a decisão de alguém.
 */
async function cultoDoToken(token) {
  const cultoId = verificarTokenDecisao(token);
  if (!cultoId) return null;

  const { data } = await supabase
    .from('cultos')
    .select('id, data, vol_service_types!inner(name, has_online)')
    .eq('id', cultoId)
    .eq('vol_service_types.has_online', true)
    .is('deleted_at', null)
    .maybeSingle();
  if (!data) return null;

  const culto = { id: data.id, data: data.data, nome: data.vol_service_types?.name || 'Culto' };

  // "É o culto de agora?" é decidido pela MESMA régua de sempre — não por uma
  // segunda conta de janela aqui, que divergiria no primeiro ajuste.
  const agora = await resolverCultoOnline({ comFallback: true });
  return { culto, replay: !agora || agora.id !== culto.id };
}

// GET /ativo · o frontend pergunta se deve mostrar o form. aoVivo = janela real
// (label "Ao vivo agora"); ativo = janela OU fallback pos-live (form utilizavel).
router.get('/ativo', async (req, res) => {
  try {
    // Com token, o culto vem do QR — não há o que deduzir.
    if (req.query.t) {
      const doToken = await cultoDoToken(req.query.t);
      if (doToken) {
        return res.json({
          ativo: true,
          // ⚠️ "ao vivo" só quando o culto do QR é mesmo o do momento. Num
          // vídeo antigo isso é false, e a tela não anuncia transmissão que
          // não existe — foi o defeito do chip "Quarta Com Deus" na quinta.
          aoVivo: !doToken.replay,
          replay: doToken.replay,
          culto: doToken.culto,
        });
      }
    }
    const aoVivoCulto = await resolverCultoOnline();
    const culto = aoVivoCulto || await resolverCultoOnline({ comFallback: true });
    res.json({ ativo: !!culto, aoVivo: !!aoVivoCulto, replay: false, culto });
  } catch (e) {
    console.error('[public/decisao-online/ativo]', e.message);
    res.json({ ativo: false, culto: null });
  }
});

// POST / · registra a decisão online
router.post('/', async (req, res) => {
  try {
    // ⚠️ UMA régua só, e ela é PURA (`utils/decisaoCampos`, no gate). O
    // formulário valida antes para dar erro na hora, mas quem MANDA é aqui —
    // payload é do cliente.
    const v = validarDecisao(req.body);
    if (!v.ok) return res.status(400).json({ error: v.erro, campo: v.campo });
    const { nome, dataNascimento, telefone, cep, email } = v.valores;

    // ⚠️ O TOKEN MANDA quando existe: ele é o culto gravado no vídeo, e é o
    // único jeito de acertar o culto de quem assiste um replay de dois anos.
    // Sem token (ou com token inválido), cai na resolução por relógio de
    // sempre: comFallback aceita quem preenche logo após o culto e quem vê o
    // replay nos dias seguintes. Nunca descarta a decisão.
    const doToken = req.body?.t ? await cultoDoToken(req.body.t) : null;
    const culto = doToken?.culto || await resolverCultoOnline({ comFallback: true });
    // ⚠️⚠️ A DATA QUE INICIA A JORNADA. Só é preenchida no replay: aí a pessoa
    // decidiu HOJE, e é de hoje que o SLA de 3 dias do primeiro contato precisa
    // contar. Sem isto ela entraria na fila com a data do culto — atrasada em
    // centenas de dias, aparecendo como caso perdido, e ninguém ligaria pra
    // ela. `culto_id` continua guardando de qual vídeo ela veio.
    const decidiuEm = doToken?.replay ? hojeBRT() : null;
    if (!culto) {
      return res.status(409).json({
        error: 'sem_culto_recente',
        message: 'Não conseguimos registrar agora. Fale com a gente pelo WhatsApp da igreja — sua decisão importa.',
      });
    }

    // ⚠️ Id gerado aqui pra gravar o consentimento ANTES da decisão: falha na
    // gravação da decisão deixa uma linha órfã no ledger (inofensiva), a ordem
    // inversa deixaria dado de pessoa sem prova legal.
    const decisaoId = crypto.randomUUID();

    await registrarConsentimentos({
      porta: 'decisao',
      refId: decisaoId,
      ip: req.ip,
      userAgent: req.get('user-agent'),
      itens: [{ tipo: 'termos_lgpd', aceito: true, texto: TEXTOS.termos_lgpd }],
    });

    const { data: criada, error } = await supabase
      .from('cultos_decisoes_pessoas')
      .insert({
        id: decisaoId,
        culto_id: culto.id,
        nome,
        telefone,
        email,
        data_nascimento: dataNascimento,
        cep,
        decidiu_em: decidiuEm,
        tipo_decisao: 'online',
        fonte: 'form_publico',
      })
      // `membro_id` é preenchido pelo trigger BEFORE INSERT — só dá pra saber
      // qual pessoa ficou depois de gravar.
      .select('membro_id')
      .maybeSingle();
    if (error) throw error;

    // ⚠️ BEST-EFFORT e DEPOIS da resposta estar garantida: a decisão é o que
    // não pode se perder. Falha do ViaCEP ou do UPDATE não pode derrubar o
    // registro de alguém que acabou de decidir seguir a Jesus.
    await levarCepAoCadastro(criada?.membro_id, cep).catch((e) => {
      console.warn('[decisao-online] cep nao propagado:', e.message);
    });

    res.json({ ok: true, culto: { nome: culto.nome, data: culto.data } });
  } catch (e) {
    console.error('[public/decisao-online POST]', e.message);
    res.status(500).json({ error: 'Não foi possível registrar agora. Tente novamente.' });
  }
});

module.exports = router;
