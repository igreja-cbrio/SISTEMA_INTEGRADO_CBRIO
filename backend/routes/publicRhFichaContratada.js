// Ficha Cadastral e de Qualificação da CONTRATADA (Anexo II) — porta PÚBLICA.
//
// O prestador PJ recebe um link pessoal e preenche os dados da EMPRESA dele:
// razão social, CNPJ, regime, endereço da sede, representante legal, contato
// contratual e dados de pagamento (a chave PIX é o ponto do exercício).
//
// ⚠️⚠️ POR QUE PORTA NOVA, e não estender `publicRhOnboarding`:
//  · o PÚBLICO é disjunto — 13 CLT e 1 PREBENDA ativos não têm empresa, e o
//    motor de disparo do onboarding filtra por STATUS, não por tipo de contrato;
//  · aquele GET devolve CPF, telefone, nascimento e endereço EM CLARO para quem
//    tiver o link, e o token dele NÃO EXPIRA (medido em 21/09: 33 tokens de
//    agosto seguem válidos). Somar banco/conta/PIX àquele payload transformaria
//    um link encaminhado na ficha bancária completa do prestador;
//  · aquela rota está montada DEPOIS do `publicLimiter` (30 req/15min por IP no
//    namespace inteiro) — ver o comentário do mount no server.js.
//
// ⚠️⚠️ REGRA DESTA PORTA: os campos de pagamento são **WRITE-ONLY**. O GET nunca
// devolve banco, agência, conta, PIX, CPF do representante nem titular (a régua
// é `semSegredos`). Pré-preencher dado bancário "para facilitar" é o defeito da
// porta irmã, não o modelo a copiar.
const router = require('express').Router();
const rateLimit = require('express-rate-limit');
const { supabase } = require('../utils/supabase');
const { notificar } = require('../services/notificar');
const {
  validarFicha, normalizarFicha, semSegredos, ehContratada, estadoFicha,
} = require('../utils/fichaContratada');

// ⚠️ Limiter PRÓPRIO e generoso. A ficha tem ~15 campos e a pessoa salva mais de
// uma vez (rascunho); no wi-fi do escritório vários prestadores saem pelo MESMO
// IP. O teto estrito de 30/15min do namespace derrubaria o formulário por volta
// da 4ª pessoa — é o bug que a casa já consertou seis vezes movendo a porta para
// antes do `publicLimiter`.
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: parseInt(process.env.FICHA_CONTRATADA_RATE_LIMIT_MAX, 10) || 600,
  message: { error: 'Muitas tentativas. Aguarde alguns minutos.' },
  skip: () => process.env.NODE_ENV !== 'production',
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Resolve o colaborador pelo token.
 *
 * ⚠️ FAIL-CLOSED em camadas: token curto demais, colaborador apagado, tipo de
 * contrato que não é PJ e link VENCIDO devolvem `null` — e a resposta é a MESMA
 * para todos os casos. Distinguir "não existe" de "expirou" na resposta faz o
 * endpoint virar oráculo de quem é prestador da igreja.
 */
async function acharPorToken(token) {
  const t = String(token || '');
  if (t.length < 16) return null;

  const { data, error } = await supabase
    .from('rh_funcionarios')
    .select('id, nome, cargo, tipo_contrato, status, ficha_contratada, ficha_contratada_preenchido_em, ficha_contratada_expira_em')
    .eq('ficha_contratada_token', t)
    .is('deleted_at', null)
    .maybeSingle();

  // ⚠️ Falha de CONSULTA não pode virar "link inválido": isso mandaria a pessoa
  // embora achando que o link dela morreu. Propaga para virar 503.
  if (error) { const e = new Error(error.message); e.consulta = true; throw e; }
  if (!data) return null;
  if (!ehContratada(data.tipo_contrato)) return null;
  if (data.ficha_contratada_expira_em && new Date(data.ficha_contratada_expira_em) < new Date()) return null;
  return data;
}

// GET /api/public/rh-ficha-contratada/:token — o que a tela precisa para abrir.
router.get('/:token', limiter, async (req, res) => {
  try {
    const f = await acharPorToken(req.params.token);
    if (!f) return res.status(404).json({ error: 'Link inválido ou expirado.' });

    const estado = estadoFicha(f);
    res.json({
      nome: f.nome,
      cargo: f.cargo || null,
      ja_preenchido: !!f.ficha_contratada_preenchido_em,
      // ⚠️ `semSegredos` tira banco, conta, PIX, CPF do representante e titular.
      // O que volta serve só para a pessoa conferir o que ela já mandou.
      ficha: f.ficha_contratada ? semSegredos(f.ficha_contratada) : null,
      faltando: estado.faltando,
    });
  } catch (e) {
    if (e.consulta) {
      console.error('[public ficha-contratada] GET consulta:', e.message);
      return res.status(503).json({ error: 'Não consegui carregar agora. Tente de novo em instantes.' });
    }
    console.error('[public ficha-contratada] GET:', e.message);
    res.status(500).json({ error: 'Erro ao abrir a ficha.' });
  }
});

// POST /api/public/rh-ficha-contratada/:token — a contratada salva a ficha.
router.post('/:token', limiter, async (req, res) => {
  try {
    const f = await acharPorToken(req.params.token);
    if (!f) return res.status(404).json({ error: 'Link inválido ou expirado.' });

    const ficha = normalizarFicha(req.body || {});
    const { ok, erros } = validarFicha(ficha);
    if (!ok) return res.status(400).json({ error: 'Confira os campos destacados.', erros });

    // ⚠️⚠️ O ACEITE é gravado só quando a pessoa MARCOU e o texto exibido veio
    // junto. Gravar aceite sem o snapshot do que foi lido é fabricar prova legal
    // — a lei da casa. E o carimbo é do SERVIDOR, nunca do cliente: relógio de
    // navegador é editável, e a data é metade do valor probatório.
    const aceitou = req.body?.aceite === true && String(req.body?.aceite_texto || '').trim().length > 40;
    if (aceitou) {
      ficha.aceite_em = new Date().toISOString();
      ficha.aceite_texto = String(req.body.aceite_texto).slice(0, 4000);
      ficha.aceite_ip = String(req.ip || '').slice(0, 60) || null;
      ficha.aceite_user_agent = String(req.get('user-agent') || '').slice(0, 300) || null;
      ficha.aceite_nome_digitado = String(req.body?.aceite_nome || '').trim().slice(0, 200) || null;
    } else if (f.ficha_contratada?.aceite_em) {
      // ⚠️ Reenvio sem marcar o aceite NÃO apaga o aceite anterior — mas também
      // não o estende ao conteúdo novo: o aceite guarda o texto que foi lido, e
      // dizer que ele cobre dados alterados depois seria prova enganosa.
      ficha.aceite_em = f.ficha_contratada.aceite_em;
      ficha.aceite_texto = f.ficha_contratada.aceite_texto || null;
      ficha.aceite_ip = f.ficha_contratada.aceite_ip || null;
      ficha.aceite_user_agent = f.ficha_contratada.aceite_user_agent || null;
      ficha.aceite_nome_digitado = f.ficha_contratada.aceite_nome_digitado || null;
      ficha.aceite_desatualizado = true;
    }

    const { error } = await supabase
      .from('rh_funcionarios')
      .update({
        ficha_contratada: ficha,
        ficha_contratada_preenchido_em: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', f.id);

    if (error) return res.status(400).json({ error: error.message });

    // ⚠️⚠️ AVISA QUEM CUIDA DO RH. Sem isto a ficha era preenchida e NINGUÉM
    // ficava sabendo — foi exatamente o que aconteceu no primeiro
    // preenchimento real (22/09): o dado entrou no banco e ficou invisível.
    // É a mesma classe do "Fale Conosco" que chegava numa tela que não o
    // listava.
    //
    // ⚠️ Quem recebe vem de `notificacao_regras` do módulo `rh`, NUNCA de uma
    // lista de nomes aqui (lei do projeto: o dono do fluxo muda sem PR). Sem
    // regra configurada, o `notificar` cai no fallback de admin/diretor.
    //
    // ⚠️ AWAITED: o aviso é o único caminho pelo qual alguém descobre que a
    // ficha chegou. Em serverless o container CONGELA no `res.json()` e
    // descarta trabalho pendente — fire-and-forget aqui é o aviso que some.
    const estadoAgora = estadoFicha({ tipo_contrato: f.tipo_contrato, ficha_contratada: ficha });
    try {
      await notificar({
        modulo: 'rh',
        tipo: 'ficha_contratada_preenchida',
        titulo: `Ficha da contratada · ${f.nome}`,
        mensagem: estadoAgora.completa
          ? `${f.nome} enviou a ficha cadastral completa${aceitou ? ' e assinou a declaração' : ''}.`
          // ⚠️ Incompleta é DECLARADO com o que falta: "preencheu" e "preencheu
          // tudo" levam a ações diferentes de quem libera o pagamento.
          : `${f.nome} enviou a ficha, mas falta: ${estadoAgora.faltando.join(', ')}.`,
        link: '/rh',
        severidade: estadoAgora.completa ? 'info' : 'alerta',
        // ⚠️ Dedup por (pessoa, DIA): a pessoa pode salvar 3 vezes corrigindo
        // um campo, e três avisos do mesmo fato enterram o sino.
        chaveDedup: `ficha_contratada:${f.id}:${new Date().toISOString().slice(0, 10)}`,
      });
    } catch (e) {
      // ⚠️ Falha do aviso NÃO desfaz o que a pessoa acabou de enviar: a ficha
      // está gravada, e derrubar a resposta faria ela preencher tudo de novo.
      console.error('[public ficha-contratada] aviso ao RH falhou:', e.message);
    }

    res.json({ ok: true, aceite_registrado: !!aceitou });
  } catch (e) {
    if (e.consulta) {
      console.error('[public ficha-contratada] POST consulta:', e.message);
      return res.status(503).json({ error: 'Não consegui salvar agora. Tente de novo em instantes.' });
    }
    console.error('[public ficha-contratada] POST:', e.message);
    res.status(500).json({ error: 'Erro ao salvar a ficha.' });
  }
});

module.exports = router;
