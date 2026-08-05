// ============================================================================
// Rotas públicas da GENEROSIDADE (doação) · /api/public/generosidade
//
// GET  /config              - o que a página deve oferecer (formas, valores)
// POST /doacao              - cria a cobrança e devolve o token da tela
// GET  /:token              - estado do pagamento (a tela faz polling)
// POST /:token/metodo       - a pessoa escolheu como pagar
//
// ⚠️ POR QUE ISTO É WEB, E NÃO UMA TELA DO APP: a guideline **3.2.2(iv)** da App
// Store proíbe coletar fundos para caridade DENTRO do app de quem não é nonprofit
// aprovado pela Apple, e a nossa aprovação depende da validação da Benevity (em
// andamento). A mesma guideline diz explicitamente que o app pode arrecadar
// **fora** dele, "such as via Safari". Então o app abre esta página no NAVEGADOR
// EXTERNO. ⚠️ NÃO embutir em WebView: WebView dentro do app é "coletar dentro do
// app" e é exatamente o que derrubaria o app da loja. Ver `lib/features.ts` e
// `constants/pix.ts` no repo do app (a tela que mostrava a chave PIX foi retirada
// no mesmo dia por esse motivo).
//
// ⚠️ NÃO CRIA CADASTRO DE PESSOA. O match é READ-ONLY (`acharMembroGuardado`):
// achou, a doação entra no razão nominal; não achou, o dinheiro fica registrado
// em `pag_*` e a linha nominal não existe. Doação anônima é legítima, e a decisão
// de 2026-07-30 ("essas pessoas não podem virar membro") nasceu justamente de um
// caminho de dinheiro que criava `mem_membros`.
//
// Montado ANTES do publicLimiter global: a página faz polling do status, e sob o
// teto de 30/15min a pessoa tomaria 429 no meio do próprio pagamento.
// ============================================================================
const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const { notificar } = require('../services/notificar');
const {
  emailValido, cpfValido, normalizarCpf, normalizarEmail, normalizarTelefone,
  tirarCodigoPaisTelefone, temAbreviacaoNome, honeypotPreenchido,
} = require('../services/inscricaoContrato');
const { acharMembroGuardado } = require('../services/membroMatch');
// Fachada do núcleo de pagamentos. ⚠️ NUNCA importar `providers/*` aqui.
const pagamentos = require('../services/pagamentos');
const {
  estadoBasePagamento, escolherFormaPagamento, sincronizarSeParada,
} = require('../services/pagamentos/telaPublica');

// Limiter próprio generoso (padrão do publicGrupos/publicNps/publicEvento): num
// domingo a igreja inteira sai por 1 IP de Wi-Fi, e cada doação gasta várias
// requisições (config + criar + escolher forma + N polls).
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: parseInt(process.env.GENEROSIDADE_PUBLIC_RATE_LIMIT_MAX)
    || (process.env.NODE_ENV === 'production' ? 3000 : 10000),
  message: { error: 'Muitas requisições. Aguarde alguns minutos.' },
  skip: () => process.env.NODE_ENV !== 'production',
  standardHeaders: true,
  legacyHeaders: false,
});
router.use(limiter);

// ── Régua da doação ────────────────────────────────────────────────────────

// Espelha o CHECK de `mem_contribuicoes.tipo` — é lá que a doação vira linha
// nominal, então categoria que não caiba ali não pode ser oferecida aqui.
const CATEGORIAS = ['dizimo', 'oferta', 'campanha'];

// ⚠️ Boleto fica FORA por decisão: doação é impulso, e boleto com 3 dias de
// compensação é o oposto disso (a pessoa desiste no caminho). Cartão vai pro
// checkout hospedado do Asaas; Pix é nativo (QR não é dado sensível).
const METODOS_DEFAULT = ['pix', 'cartao'];

// ⚠️ `metodosDisponiveis`/`capacidades` LANÇAM quando `PAG_PROVIDER_PADRAO` aponta
// pra um adapter que não existe (silêncio ali significaria cobrança criada num
// provider que não sabe cobrar — é lei do núcleo). Aqui isso não pode virar 500
// numa página pública: vira "sem formas disponíveis", que o `bloqueio()` traduz
// em texto pra pessoa.
function metodosOfertados() {
  const daEnv = String(process.env.GENEROSIDADE_METODOS || '').split(',')
    .map((m) => m.trim()).filter(Boolean);
  const desejados = daEnv.length ? daEnv : METODOS_DEFAULT;
  try {
    return pagamentos.metodosDisponiveis(desejados);
  } catch (e) {
    console.error('[publicGenerosidade] provider de pagamento:', e.message);
    return [];
  }
}

function tetoParcelasProvider() {
  try {
    return pagamentos.capacidades()?.parcelas_max || 1;
  } catch { return 1; }
}

function valoresSugeridos() {
  const daEnv = String(process.env.GENEROSIDADE_VALORES || '').split(',')
    .map((v) => Math.floor(Number(v.trim()) * 100)).filter((c) => c > 0);
  return daEnv.length ? daEnv : [2000, 5000, 10000, 20000, 50000];
}

// Piso e teto. O piso existe porque taxa de PSP em doação de R$ 1 come a doação
// inteira; o teto porque valor digitado errado (R$ 500,00 virando R$ 50.000,00) é
// o erro mais comum de campo de dinheiro, e devolver dinheiro custa taxa e
// constrangimento. Quem quiser doar acima disso fala com a igreja.
const MIN_CENTAVOS = 500;
const MAX_CENTAVOS = 5000000;

// Cobrança de doação expira em 24h: Pix não pago em um dia é intenção
// abandonada, e deixá-la aberta faz o cron de reconciliação carregar fila morta.
const EXPIRA_HORAS = 24;

/**
 * Doação está no ar?
 *
 * ⚠️ Fail-CLOSED e com motivo LEGÍVEL. A tela mostra o texto pra pessoa em vez de
 * um formulário que não vai conseguir cobrar — é a mesma régua do
 * `bloqueioPagamento()` dos eventos pagos. E é o que segura a doação em produção
 * enquanto o provider é `manual`.
 */
function bloqueio() {
  if (!pagamentos.habilitado()) {
    return 'A doação online está temporariamente indisponível. Tente novamente em alguns minutos.';
  }
  if (!pagamentos.pspConfigurado()) {
    return 'A doação online ainda está sendo preparada. Em breve você poderá contribuir por aqui.';
  }
  if (!metodosOfertados().length) {
    return 'Nenhuma forma de pagamento está disponível no momento.';
  }
  return null;
}

/**
 * `referencia` é a chave de NEGÓCIO idempotente da cobrança.
 *
 * ⚠️ Doação NÃO pode ser idempotente por pessoa (diferente de inscrição, onde
 * `inscricao:<uuid>` é o certo): a mesma pessoa doa de novo mês que vem, e
 * reaproveitar a cobrança antiga faria a segunda doação nunca ser cobrada. Então
 * a chave é uma **tentativa**: um id que a tela gera UMA vez e reenvia em
 * retentativa/duplo clique. Sem ele, o servidor gera — aí duplo clique cria duas
 * cobranças (a pessoa paga uma; a outra expira em 24h e é ruído, não prejuízo).
 */
const TENTATIVA_RE = /^[a-zA-Z0-9-]{8,64}$/;

function referenciaDaTentativa(bruta) {
  const t = String(bruta || '').trim();
  const id = TENTATIVA_RE.test(t) ? t : require('crypto').randomUUID();
  return `generosidade:${id}`;
}

// `public_token` = 32 hex (`encode(gen_random_bytes(16),'hex')`).
// ⚠️ A guarda existe pra `GET /:token` não engolir rota literal nova declarada
// depois dele — a armadilha do `/:id` que comeu `/avaliar` e `/mural` no módulo
// de Propostas. Com ela, rota literal futura é alcançada sozinha.
const TOKEN_RE = /^[0-9a-f]{32}$/i;

// ── GET /config ────────────────────────────────────────────────────────────

router.get('/config', (_req, res) => {
  const aviso = bloqueio();
  res.json({
    ativo: !aviso,
    aviso,
    metodos: aviso ? [] : metodosOfertados(),
    categorias: CATEGORIAS,
    valores_sugeridos: valoresSugeridos(),
    min_centavos: MIN_CENTAVOS,
    max_centavos: MAX_CENTAVOS,
    parcelas_max: tetoParcelasProvider(),
  });
});

// ── POST /doacao ───────────────────────────────────────────────────────────

router.post('/doacao', async (req, res) => {
  try {
    // Honeypot ponta a ponta (mesmo campo `website` das portas de inscrição).
    // Responde 200 fingindo sucesso: dizer "detectamos bot" ensina o bot.
    if (honeypotPreenchido(req.body)) {
      return res.json({ ok: true, token: null });
    }

    const aviso = bloqueio();
    if (aviso) return res.status(503).json({ error: aviso });

    const b = req.body || {};

    const valor = Math.floor(Number(b.valor_centavos) || 0);
    if (!(valor >= MIN_CENTAVOS)) {
      return res.status(400).json({ error: `O valor mínimo para doar online é de R$ ${(MIN_CENTAVOS / 100).toFixed(2).replace('.', ',')}.` });
    }
    if (valor > MAX_CENTAVOS) {
      return res.status(400).json({
        error: `Para doações acima de R$ ${(MAX_CENTAVOS / 100).toLocaleString('pt-BR')}, fale com a secretaria da igreja — conseguimos uma forma melhor (e sem taxa de cartão).`,
      });
    }

    const categoria = CATEGORIAS.includes(String(b.categoria)) ? String(b.categoria) : 'oferta';
    const campanha = categoria === 'campanha' ? String(b.campanha || '').trim().slice(0, 120) : null;
    if (categoria === 'campanha' && !campanha) {
      return res.status(400).json({ error: 'Diga qual é a campanha.', campo: 'campanha' });
    }

    const nome = String(b.nome || '').trim().replace(/\s+/g, ' ');
    if (nome.length < 3) return res.status(400).json({ error: 'Informe seu nome.', campo: 'nome' });
    // Nome completo é pedido, mas abreviação NÃO bloqueia a doação: recusar
    // dinheiro por causa de "J. Silva" é o pior trade-off possível aqui. A
    // abreviação só piora a chance de casar com o cadastro, e quem carrega essa
    // consequência é o razão nominal, não o caixa.
    const nomeAbreviado = temAbreviacaoNome(nome);

    const email = normalizarEmail(b.email);
    if (!email || !emailValido(email)) {
      return res.status(400).json({ error: 'Informe um e-mail válido — é para onde vai o recibo.', campo: 'email' });
    }

    const telefone = normalizarTelefone(tirarCodigoPaisTelefone(b.telefone || ''));
    // CPF é OPCIONAL e o texto da tela diz por que vale a pena informar (é o que
    // liga a doação ao cadastro e faz ela entrar no comprovante anual). Se vier,
    // tem que ser válido: CPF com DV errado não casa com nada e só suja o dado.
    const cpf = normalizarCpf(b.cpf);
    if (b.cpf && String(b.cpf).trim() && !cpfValido(cpf)) {
      return res.status(400).json({ error: 'Esse CPF não parece válido. Confira ou deixe em branco.', campo: 'cpf' });
    }

    // ── Match READ-ONLY. Nunca cria, nunca escreve. ──
    // Falha aqui não impede a doação: sem membro a doação segue como anônima no
    // razão nominal, e é o handler que avisa a equipe.
    let membroId = null;
    try {
      const m = await acharMembroGuardado({ cpf, email, telefone, nome });
      membroId = m?.membro_id || null;
    } catch (e) {
      console.error('[publicGenerosidade] match do doador:', e.message);
    }

    const canal = ['app', 'web'].includes(String(b.canal)) ? String(b.canal) : 'web';

    const { cobranca } = await pagamentos.criarCobranca({
      origem_tipo: pagamentos.ORIGENS.GENEROSIDADE,
      // Doação não tem linha de domínio própria: o "objeto" É a cobrança. Uma
      // tabela `gen_doacoes` só duplicaria valor/pagador/status e viraria a
      // segunda verdade que o núcleo existe pra evitar.
      origem_id: null,
      referencia: referenciaDaTentativa(b.tentativa),
      valor_centavos: valor,
      descricao: categoria === 'campanha' ? `Campanha: ${campanha}` : (categoria === 'dizimo' ? 'Dízimo' : 'Oferta'),
      metodos_ofertados: metodosOfertados(),
      expira_em: new Date(Date.now() + EXPIRA_HORAS * 3600000).toISOString(),
      pagador_nome: nome,
      pagador_cpf: cpf || null,
      pagador_email: email,
      pagador_telefone: telefone || null,
      membro_id: membroId,
      metadata: { categoria, campanha, canal, nome_abreviado: nomeAbreviado || undefined },
    });

    res.json({ ok: true, token: cobranca.public_token, pagamento: estadoBasePagamento(cobranca) });
  } catch (e) {
    console.error('[publicGenerosidade] criar doação:', e.message);
    // Avisa gente: doação que não consegue nascer é dinheiro que não entrou, e o
    // sintoma não aparece em nenhuma tela por conta própria.
    notificar({
      modulo: 'financeiro',
      tipo: 'doacao_falha_criar',
      titulo: 'Falha ao criar cobrança de doação',
      mensagem: `Alguém tentou doar pelo site/app e a cobrança não foi criada: ${e.message}. `
        + `Confiram a credencial do provedor de pagamento.`,
      severidade: 'alerta',
      link: '/inscricoes',
      chaveDedup: `doacao_falha_criar_${new Date().toISOString().slice(0, 10)}`,
    }).catch(() => {});
    res.status(502).json({ error: 'Não conseguimos iniciar a doação agora. Tente novamente em alguns minutos.' });
  }
});

// ── POST /:token/metodo ────────────────────────────────────────────────────
// Declarado ANTES do `GET /:token` só por clareza (métodos HTTP distintos).

router.post('/:token/metodo', async (req, res) => {
  try {
    if (!TOKEN_RE.test(req.params.token)) return res.status(404).json({ error: 'Doação não encontrada' });
    const cobranca = await pagamentos.consultarPorToken(req.params.token);
    if (!cobranca || cobranca.origem_tipo !== pagamentos.ORIGENS.GENEROSIDADE) {
      return res.status(404).json({ error: 'Doação não encontrada' });
    }

    const r = await escolherFormaPagamento(cobranca, {
      metodo: req.body?.metodo, parcelas: req.body?.parcelas,
    });
    const pagamento = estadoBasePagamento(r.cobranca);
    if (r.error) return res.status(r.status).json({ error: r.error, pagamento });
    res.json(pagamento);
  } catch (e) {
    console.error('[publicGenerosidade] metodo:', e.message);
    res.status(500).json({ error: 'Erro ao escolher a forma de pagamento.' });
  }
});

// ── GET /:token ────────────────────────────────────────────────────────────

router.get('/:token', async (req, res) => {
  try {
    if (!TOKEN_RE.test(req.params.token)) return res.status(404).json({ error: 'Doação não encontrada' });
    let cobranca = await pagamentos.consultarPorToken(req.params.token);
    if (!cobranca || cobranca.origem_tipo !== pagamentos.ORIGENS.GENEROSIDADE) {
      return res.status(404).json({ error: 'Doação não encontrada' });
    }
    cobranca = await sincronizarSeParada(cobranca);
    res.json({
      ...estadoBasePagamento(cobranca),
      // Do domínio da doação (não é PII: quem tem o token já sabe o que doou).
      categoria: cobranca.metadata?.categoria || null,
      campanha: cobranca.metadata?.campanha || null,
    });
  } catch (e) {
    console.error('[publicGenerosidade] status:', e.message);
    res.status(500).json({ error: 'Erro ao consultar a doação.' });
  }
});

module.exports = router;
