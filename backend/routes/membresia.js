const router = require('express').Router();
const multer = require('multer');
const {
  planoDaPagina, montarResposta, COLUNAS_LISTA,
} = require('../utils/membrosPagina');
const { authenticate, authorize, authorizeModule, getEffectiveLevel } = require('../middleware/auth');
const { supabase } = require('../utils/supabase');
const { uploadModuleFile, SHAREPOINT_CONFIGURED } = require('../services/storageService');
const { notificar } = require('../services/notificar');
const { enqueueSync } = require('../services/cerebroSync');
const { escapePostgrestValue } = require('../utils/sanitize');
const { acharOuCriarGuardado } = require('../services/membroMatch');
const { avaliarPossivelDuplicidade } = require('../services/duplicidadePolicy');
const { montarPatchFusao } = require('../services/fusaoCampos');
const { normalizarCpf: normCpf11, cpfValido } = require('../utils/cpf');
const censoDisparo = require('../services/censoDisparo');
const { avaliarProntidao } = require('../utils/prontidaoCadastro');
// ⚠️⚠️ `donosDoGrupo` era CHAMADO em `/totem/grupos/:id/entrar` e NUNCA foi
// importado neste arquivo — ReferenceError latente. O insert do pedido roda
// ANTES, então o primeiro uso real do totem gravaria o pedido e responderia
// 500 pra pessoa. Medido em 11/08: **0 pedidos com origem 'totem'** na base
// inteira (570 do formulário público, 2 do app), ou seja a rota nunca foi
// exercitada e o erro nunca disparou. Achado ao ligar o sino do app.
const { donosDoGrupo } = require('../services/gruposDestinatarios');
const { avisarPedidoNovoNoApp } = require('../services/gruposAvisoApp');
const {
  anexarMarcadores, marcadoresDeMembros, podeVerMarcadorSensivel,
} = require('../services/jornadaMarcadores');
// ⚠️ Fecha o furo do `ROUTE_MODULE_MAP['membros']` (12 módulos · qualquer um
// com nível 1 chegava aqui): dinheiro e cuidado pastoral DA PESSOA passam a ser
// filtrados no payload. Ver o cabeçalho de `utils/dadosSensiveisPessoa.js`.
const {
  podeVerFinanceiroDePessoa, podeVerPastoralDePessoa, filtrarTimeline,
} = require('../utils/dadosSensiveisPessoa');

const uploadMw = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
  fileFilter: (_req, file, cb) => {
    if (['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) cb(null, true);
    else cb(new Error('Formato de imagem não suportado. Use JPG, PNG ou WebP.'));
  },
});

router.use(authenticate);

// Quem pode aprovar/rejeitar cadastros pendentes:
//   admin/diretor · toda a área "Integração" (responsabilidade dela) · e
//   aprovadores extras cadastrados (ex.: Marcelo · Cuidados) em membresia_aprovadores.
async function usuarioPodeAprovarMembresia(req) {
  if (['admin', 'diretor'].includes(req.user?.role)) return true;
  if ((req.user?.granular?.areas || []).includes('Integração')) return true;
  const ids = [req.user?.userId, req.user?.id].filter(Boolean);
  if (ids.length) {
    const { data } = await supabase.from('membresia_aprovadores').select('profile_id').in('profile_id', ids).limit(1);
    if (data && data.length) return true;
  }
  return false;
}
async function podeAprovarMembresia(req, res, next) {
  try {
    if (!req.user) return res.status(401).json({ error: 'Não autenticado' });
    if (await usuarioPodeAprovarMembresia(req)) return next();
    return res.status(403).json({ error: 'Você não tem permissão para aprovar/rejeitar cadastros.' });
  } catch (e) { return res.status(500).json({ error: 'Erro ao checar permissão' }); }
}

// GET /api/membresia/cadastros/pode-aprovar — o front usa pra mostrar os botões
router.get('/cadastros/pode-aprovar', async (req, res) => {
  try { res.json({ pode: await usuarioPodeAprovarMembresia(req) }); }
  catch { res.json({ pode: false }); }
});

// POST /api/membresia/cadastros/:id/confirmar-whatsapp — dispara o template de
// confirmação de cadastro pela API oficial (funciona mesmo fora da janela de 24h).
// Precisa do template aprovado na Meta + env WHATSAPP_TEMPLATE_CADASTRO.
router.post('/cadastros/:id/confirmar-whatsapp', podeAprovarMembresia, async (req, res) => {
  try {
    const nomeTemplate = process.env.WHATSAPP_TEMPLATE_CADASTRO;
    if (!nomeTemplate) {
      return res.status(400).json({
        error: "Template de confirmação ainda não configurado. Crie o modelo 'cadastro_confirmado' na Meta (Utility, pt_BR) e configure a env WHATSAPP_TEMPLATE_CADASTRO.",
        code: 'sem_template',
      });
    }
    const { data: cad } = await supabase.from('mem_cadastros_pendentes')
      .select('id, nome, telefone').eq('id', req.params.id).maybeSingle();
    if (!cad) return res.status(404).json({ error: 'Cadastro não encontrado' });
    const tel = String(cad.telefone || '').replace(/\D+/g, '');
    if (!tel) return res.status(400).json({ error: 'Cadastro sem telefone.' });

    const primeiro = String(cad.nome || '').trim().split(/\s+/)[0] || 'tudo bem';
    // C2 (lote 5 · 14/08): pela FILA — registro + retry + recibos. Na fila
    // (teto da Meta) não é erro: sai quando a cota liberar.
    const { enfileirar } = require('../services/whatsappFila');
    const r = await enfileirar({
      telefone: tel, template: nomeTemplate, params: [primeiro],
      contexto: 'membresia.cadastro_confirmado', refId: cad.id,
    });
    if (!r?.sent && !r?.queued) return res.status(502).json({ error: 'O WhatsApp não aceitou o envio.', detail: r?.reason || null });
    try {
      await require('../services/waInbox').registrarOutbound({
        telefone: tel, texto: `Confirmação de cadastro (template: ${nomeTemplate})`, tipo: 'template',
        autorId: req.user.userId || req.user.id,
      });
    } catch { /* best-effort */ }
    res.json({ ok: true, messageId: r.messageId || null });
  } catch (e) {
    console.error('[cadastros] confirmar-whatsapp:', e.message);
    res.status(500).json({ error: 'Erro ao enviar confirmação' });
  }
});

// Autoriza edicao de um membro especifico pelas rotas "totem":
//   - staff de membresia (nivel >= 3) ou admin/diretor → qualquer membro
//   - o proprio usuario logado → so o seu proprio cadastro (req.user.membro_id)
// Antes, qualquer autenticado podia sobrescrever PII (email/telefone/endereco/
// foto) de QUALQUER membro só pelo id (IDOR · LGPD).
function podeEditarMembroTotem(req, membroId) {
  if (['admin', 'diretor'].includes(req.user.role)) return true;
  if (getEffectiveLevel(req, 'membresia') >= 3) return true;
  // Conta de quiosque do lounge (módulo totem-membro · override por conta):
  // edita os campos seguros de qualquer membro identificado no totem.
  if (getEffectiveLevel(req, 'totem-membro') >= 3) return true;
  if (req.user.membro_id && String(req.user.membro_id) === String(membroId)) return true;
  return false;
}

// ── Utils ──
// Nível de generosidade baseado na data da última contribuição.
// Regra do cliente:
//   ativo: contribuiu nos últimos 30 dias
//   irregular: contribuiu entre 31 e 150 dias (≤ 5 meses)
//   inativo: última contribuição > 150 dias
//   nunca_contribuiu: 0 contribuições
function calcularNivelGenerosidade(ultimaContribuicaoDate) {
  if (!ultimaContribuicaoDate) return 'nunca_contribuiu';
  const dias = Math.floor((Date.now() - new Date(ultimaContribuicaoDate).getTime()) / (1000 * 60 * 60 * 24));
  if (dias <= 30) return 'ativo';
  if (dias <= 150) return 'irregular';
  return 'inativo';
}

// Nível de serviço baseado em check-ins (fonte de verdade do "está servindo")
// Regra do cliente:
//   ativo: fez check-in nos últimos 60 dias
//   ausente: último check-in há mais de 60 dias
//   nunca_serviu: 0 check-ins
function calcularNivelServico(ultimoCheckinDate) {
  if (!ultimoCheckinDate) return 'nunca_serviu';
  const dias = Math.floor((Date.now() - new Date(ultimoCheckinDate).getTime()) / (1000 * 60 * 60 * 24));
  if (dias <= 60) return 'ativo';
  return 'ausente';
}

// ── QR Lookup (identidade do membro) ──

// GET /api/membresia/qr-lookup/:token
// Resolve o token do QR de identidade → perfil resumido do membro.
// Usado pelo scanner do staff ("crachá digital"): ao escanear o QR
// do membro, apresenta cartão com dados essenciais + handles para
// ações futuras (inscrição em evento, etc.).
//
// O token vem da tabela mem_qrcodes (mapeamento token→cpf gravado
// quando o membro gera o passe da wallet). Com o CPF resolvemos o
// registro em mem_membros ou, como fallback, em mem_cadastros_pendentes.
router.get('/qr-lookup/:token', async (req, res) => {
  try {
    const token = String(req.params.token || '').trim();
    if (!token || token.length < 8 || token.length > 64) {
      return res.status(400).json({ error: 'Token invalido' });
    }

    const { data: mapping } = await supabase
      .from('mem_qrcodes')
      .select('cpf')
      .eq('token', token)
      .maybeSingle();

    if (!mapping || !mapping.cpf) {
      return res.status(404).json({ error: 'QR não encontrado' });
    }

    // Marca uso (opcional, nao-critico)
    supabase
      .from('mem_qrcodes')
      .update({ last_seen_at: new Date().toISOString() })
      .eq('token', token)
      .then(() => {}, () => {});

    // 1) Tenta membro ativo em mem_membros
    const { data: membro } = await supabase
      .from('mem_membros')
      .select(`
        id, nome, foto_url, status, email, telefone, data_nascimento, cpf,
        endereco, bairro, cidade, estado_civil, cep, lat, lng,
        familia:mem_familias(id, nome)
      `)
      .eq('cpf', mapping.cpf)
      .eq('active', true)
      .maybeSingle();

    if (membro) {
      // Enriquecer com dados "cartão de identidade":
      // - grupo de conexão atual
      // - ministérios ativos
      // - última contribuição (para nível de generosidade)
      // - último check-in (para nível de serviço)
      const [grupoAtualRes, ministeriosRes, ultContribRes, ultCheckinRes, trilhaRes] = await Promise.all([
        supabase
          .from('mem_grupo_membros')
          // !inner + filtros no embed: sem eles, quem tem vinculo aberto em
          // grupo ja ENCERRADO mostrava grupo morto no cartao — e .maybeSingle()
          // sem limit ERRAVA ("multiple rows") pra quem tem 2+ vinculos abertos
          // (257 pessoas medidas em 11/08). Mostra o vinculo mais recente.
          .select('grupo:mem_grupos!inner(id, nome, categoria, local, dia_semana, horario)')
          .is('deleted_at', null)
          .eq('membro_id', membro.id)
          .is('saiu_em', null)
          .eq('grupo.ativo', true)
          .is('grupo.deleted_at', null)
          .order('entrou_em', { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from('mem_voluntarios')
          .select('ministerio:mem_ministerios(id, nome, cor)')
          .eq('membro_id', membro.id)
          .is('ate', null),
        supabase
          .from('mem_contribuicoes')
          .select('data')
          .eq('membro_id', membro.id)
          .order('data', { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from('mem_checkins')
          .select('data')
          .eq('membro_id', membro.id)
          .order('data', { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from('mem_trilha_valores')
          .select('etapa, data_conclusao, concluida')
          .eq('membro_id', membro.id),
      ]);

      const ultimaContribuicao = ultContribRes?.data?.data || null;
      const ultimoCheckin = ultCheckinRes?.data?.data || null;
      const ministerios = (ministeriosRes?.data || [])
        .map((v) => v.ministerio)
        .filter(Boolean);
      const trilha = trilhaRes?.data || [];

      return res.json({
        found: true,
        pending: false,
        membro: {
          id: membro.id,
          nome: membro.nome,
          foto_url: membro.foto_url,
          status: membro.status,
          email: membro.email,
          telefone: membro.telefone,
          data_nascimento: membro.data_nascimento,
          cpf: membro.cpf,
          endereco: membro.endereco,
          bairro: membro.bairro,
          cidade: membro.cidade,
          cep: membro.cep,
          estado_civil: membro.estado_civil,
          familia: membro.familia || null,
          grupo_atual: grupoAtualRes?.data?.grupo || null,
          ministerios,
          trilha,
          ultima_contribuicao: ultimaContribuicao,
          nivel_generosidade: calcularNivelGenerosidade(ultimaContribuicao),
          ultimo_checkin: ultimoCheckin,
          nivel_servico: calcularNivelServico(ultimoCheckin),
        },
      });
    }

    // 2) Fallback: cadastro pendente
    const { data: pendente } = await supabase
      .from('mem_cadastros_pendentes')
      .select('id, nome, foto_url, email, telefone, data_nascimento, cpf, endereco, bairro, cidade, estado_civil, status, created_at')
      .eq('cpf', mapping.cpf)
      .maybeSingle();

    if (pendente) {
      return res.json({
        found: true,
        pending: true,
        cadastro: pendente,
      });
    }

    return res.status(404).json({ error: 'Cadastro não encontrado' });
  } catch (e) {
    console.error('[MEMBRESIA] qr-lookup error:', e.message);
    res.status(500).json({ error: 'Erro ao consultar QR' });
  }
});

// ── CPF Lookup (identidade do membro por CPF + nascimento) ──
//
// GET /api/membresia/cpf-lookup/:cpf?nascimento=YYYY-MM-DD
// Resolve direto pelo CPF, com a DATA DE NASCIMENTO como 2º fator obrigatório
// (2026-07-22): CPF sozinho é dado semi-vazado no Brasil — abrir a sessão de um
// terceiro só com o CPF (nome/foto/telefone/Meus Dados) era risco de privacidade.
// Regras (espelham o wallet/verify · resposta SEMPRE neutra quando não bate):
//   • CPF precisa de DV válido;
//   • nascimento no banco IGUAL ao digitado → identifica;
//   • nascimento no banco NULL (legado sem a data) → identifica assim mesmo
//     (não travar o legado · o nascimento digitado não sobrescreve o principal);
//   • nascimento no banco DIVERGENTE → 404 neutro (nunca revela "existe com
//     outra data" → sem oráculo de enumeração). O totem manda pra "completar
//     cadastro" nesse caso.
// Único consumidor é o totem (membresia.cpfLookup) — daí exigir o 2º fator aqui.
router.get('/cpf-lookup/:cpf', authorizeModule('membros-totem', 1), async (req, res) => {
  try {
    const cpf = String(req.params.cpf || '').replace(/\D/g, '');
    if (!cpf || cpf.length !== 11 || !cpfValido(cpf)) {
      return res.status(400).json({ error: 'CPF invalido' });
    }
    const nascimento = String(req.query.nascimento || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(nascimento)) {
      return res.status(400).json({ error: 'Data de nascimento obrigatória' });
    }
    // Nascimento compatível: igual OU ausente no banco (legado não pode travar).
    const nascCompativel = (dbNasc) => !dbNasc || dbNasc === nascimento;
    const NAO_ACHOU = { status: 404, body: { error: 'Cadastro não encontrado' } };

    // 1) Tenta membro ativo em mem_membros
    const { data: membro } = await supabase
      .from('mem_membros')
      .select(`
        id, nome, foto_url, status, email, telefone, data_nascimento, cpf,
        endereco, bairro, cidade, estado_civil, cep, lat, lng,
        familia:mem_familias(id, nome)
      `)
      .eq('cpf', cpf)
      .eq('active', true)
      .maybeSingle();

    // CPF existe num membro mas o nascimento não confere → resposta neutra
    // (não cai pro pendente nem revela que o CPF existe).
    if (membro && !nascCompativel(membro.data_nascimento)) {
      return res.status(NAO_ACHOU.status).json(NAO_ACHOU.body);
    }

    if (membro) {
      const [grupoAtualRes, ministeriosRes, ultContribRes, ultCheckinRes, trilhaRes] = await Promise.all([
        supabase
          .from('mem_grupo_membros')
          // !inner + filtros no embed: sem eles, quem tem vinculo aberto em
          // grupo ja ENCERRADO mostrava grupo morto no cartao — e .maybeSingle()
          // sem limit ERRAVA ("multiple rows") pra quem tem 2+ vinculos abertos
          // (257 pessoas medidas em 11/08). Mostra o vinculo mais recente.
          .select('grupo:mem_grupos!inner(id, nome, categoria, local, dia_semana, horario)')
          .is('deleted_at', null)
          .eq('membro_id', membro.id)
          .is('saiu_em', null)
          .eq('grupo.ativo', true)
          .is('grupo.deleted_at', null)
          .order('entrou_em', { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from('mem_voluntarios')
          .select('ministerio:mem_ministerios(id, nome, cor)')
          .eq('membro_id', membro.id)
          .is('ate', null),
        supabase
          .from('mem_contribuicoes')
          .select('data')
          .eq('membro_id', membro.id)
          .order('data', { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from('mem_checkins')
          .select('data')
          .eq('membro_id', membro.id)
          .order('data', { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from('mem_trilha_valores')
          .select('etapa, data_conclusao, concluida')
          .eq('membro_id', membro.id),
      ]);

      const ultimaContribuicao = ultContribRes?.data?.data || null;
      const ultimoCheckin = ultCheckinRes?.data?.data || null;
      const ministerios = (ministeriosRes?.data || [])
        .map((v) => v.ministerio)
        .filter(Boolean);
      const trilha = trilhaRes?.data || [];

      return res.json({
        found: true,
        pending: false,
        membro: {
          id: membro.id,
          nome: membro.nome,
          foto_url: membro.foto_url,
          status: membro.status,
          email: membro.email,
          telefone: membro.telefone,
          data_nascimento: membro.data_nascimento,
          cpf: membro.cpf,
          endereco: membro.endereco,
          bairro: membro.bairro,
          cidade: membro.cidade,
          cep: membro.cep,
          estado_civil: membro.estado_civil,
          familia: membro.familia || null,
          grupo_atual: grupoAtualRes?.data?.grupo || null,
          ministerios,
          trilha,
          ultima_contribuicao: ultimaContribuicao,
          nivel_generosidade: calcularNivelGenerosidade(ultimaContribuicao),
          ultimo_checkin: ultimoCheckin,
          nivel_servico: calcularNivelServico(ultimoCheckin),
        },
      });
    }

    // 2) Fallback: cadastro pendente
    const { data: pendente } = await supabase
      .from('mem_cadastros_pendentes')
      .select('id, nome, foto_url, email, telefone, data_nascimento, cpf, endereco, bairro, cidade, estado_civil, status, created_at')
      .eq('cpf', cpf)
      .maybeSingle();

    if (pendente && nascCompativel(pendente.data_nascimento)) {
      return res.json({
        found: true,
        pending: true,
        cadastro: pendente,
      });
    }

    return res.status(NAO_ACHOU.status).json(NAO_ACHOU.body);
  } catch (e) {
    console.error('[MEMBRESIA] cpf-lookup error:', e.message);
    res.status(500).json({ error: 'Erro ao consultar CPF' });
  }
});

// ── Membros ──

// GET /api/membresia/membros
// Query params:
//   ?status=...        filtra por status (visitante|membro_ativo|...)
//   ?busca=...         busca por nome
//   ?papel=...         filtra por papel: voluntário|visitante|grupo_ativo|
//                      contribuinte|inscrito_next|sem_papel
router.get('/membros', authorizeModule('membros', 1), async (req, res) => {
  try {
    const { status, busca, papel, faixa } = req.query;
    // "Sem CPF": captação de dado — lista quem está sem CPF (todos são NULL).
    const semCpf = req.query.sem_cpf === '1' || req.query.sem_cpf === 'true';

    // Builders do supabase-js são de uso único — recria por página.
    const montar = () => {
      let query = supabase
        .from('mem_membros')
        .select('*, familia:mem_familias(id, nome)')
        .eq('active', true)
        .is('deleted_at', null)
        .order('nome');

      if (status) query = query.eq('status', status);
      if (semCpf) query = query.is('cpf', null);
      // Filtro por faixa etária (janela de data de nascimento ·
      // criança <13, adolescente 13-17, jovem 18-30, adulto 31+).
      if (faixa) {
        const h = new Date();
        const f = (anos) => `${h.getFullYear() - anos}-${String(h.getMonth() + 1).padStart(2, '0')}-${String(h.getDate()).padStart(2, '0')}`;
        if (faixa === 'crianca') query = query.gt('data_nascimento', f(13));
        else if (faixa === 'adolescente') query = query.gt('data_nascimento', f(18)).lte('data_nascimento', f(13));
        else if (faixa === 'jovem') query = query.gt('data_nascimento', f(31)).lte('data_nascimento', f(18));
        else if (faixa === 'adulto') query = query.lte('data_nascimento', f(31));
      }
      // Busca por tokens: "matheus toscano" casa "Matheus Ribeiro Toscano".
      // Cada palavra vira um ILIKE (AND), case-insensitive, em qualquer ordem.
      if (busca) {
        const tokens = String(busca).trim().split(/\s+/).filter(Boolean).slice(0, 6);
        for (const t of tokens) query = query.ilike('nome', `%${t}%`);
      }
      return query;
    };

    // Pagina além do cap server-side de 1000 do PostgREST: a base já passa
    // de 1000 membros ativos e o corte (silencioso, ordenado por nome)
    // escondia o fim do alfabeto — a busca de líder/supervisor do /grupos
    // não achava Natasha/Renata (Naná · 2026-07-14).
    const PAGE = 1000;
    const MAX = 20000; // teto de sanidade, bem acima da base atual
    let membros = [];
    for (let offset = 0; offset < MAX; offset += PAGE) {
      const { data, error } = await montar().range(offset, offset + PAGE - 1);
      if (error) throw error;
      membros = membros.concat(data || []);
      if (!data || data.length < PAGE) break;
    }
    if (membros.length === 0) return res.json([]);

    // Anotar papéis (vw_pessoas_papeis), batch — evita N+1. Em lotes de 200:
    // um .in() com ~400+ uuids estoura o tamanho da linha de request (o
    // fetch falha SILENCIOSO — medido em prod: 300 ok, 400 falha) e a
    // resposta também é capada em 1000. Lotes em paralelo pra não somar
    // latência; erro de lote é real (throw), não silêncio.
    const ids = membros.map(m => m.id);
    const papeisMap = {};
    const lotes = [];
    for (let i = 0; i < ids.length; i += 200) lotes.push(ids.slice(i, i + 200));
    const resultados = await Promise.all(lotes.map(lote => supabase
      .from('vw_pessoas_papeis')
      .select('membresia_id, is_voluntario, is_visitante, is_inscrito_next, in_grupo_ativo, is_contribuinte, total_inscricoes_next')
      .in('membresia_id', lote)));
    for (const { data: papeis, error: ePap } of resultados) {
      if (ePap) throw ePap;
      (papeis || []).forEach(p => { papeisMap[p.membresia_id] = p; });
    }

    const enriched = membros.map(m => ({
      ...m,
      papeis: papeisMap[m.id] || {
        is_voluntario: false, is_visitante: false, is_inscrito_next: false,
        in_grupo_ativo: false, is_contribuinte: false, total_inscricoes_next: 0,
      },
    }));

    // ⚠️ `is_contribuinte` é dado financeiro da pessoa e sai daqui pra quem não
    // pode vê-lo (mesma régua da ficha e do `GET /contribuicoes`). O guard desta
    // rota é `membros` nível 1, que passa com qualquer um dos 12 módulos do
    // ROUTE_MODULE_MAP — `grupos` nível 1 inclusive.
    const podeFinanceiro = podeVerFinanceiroDePessoa(req.user);

    // Filtro por papel (depois de enriched pra suportar 'sem_papel')
    let filtered = enriched;
    if (papel) {
      // ⚠️ Filtrar POR contribuinte é a mesma informação que ver a flag — a
      // lista devolvida É a resposta. Recusa explícita, não filtro ignorado em
      // silêncio (que devolveria a lista inteira e pareceria "ninguém contribui").
      if (papel === 'contribuinte' && !podeFinanceiro) {
        return res.status(403).json({ error: 'Sem permissão para filtrar por contribuinte.' });
      }
      filtered = enriched.filter(m => {
        const p = m.papeis;
        if (papel === 'voluntario') return p.is_voluntario;
        if (papel === 'visitante') return p.is_visitante;
        if (papel === 'grupo_ativo') return p.in_grupo_ativo;
        if (papel === 'contribuinte') return p.is_contribuinte;
        if (papel === 'com_familia') return !!m.familia_id;
        if (papel === 'inscrito_next') return p.is_inscrito_next;
        if (papel === 'sem_papel') {
          // ⚠️ Sem permissão financeira, "sem papel" ignora o termo de
          // contribuinte: senão quem aparece na lista SEM nenhuma flag visível
          // seria, por eliminação, exatamente quem contribui — a flag escondida
          // voltaria por inferência.
          const semContrib = podeFinanceiro ? !p.is_contribuinte : true;
          return !p.is_voluntario && !p.is_visitante && !p.is_inscrito_next
            && !p.in_grupo_ativo && semContrib;
        }
        return true;
      });
    }

    if (!podeFinanceiro) {
      for (const m of filtered) {
        if (m.papeis) m.papeis = { ...m.papeis, is_contribuinte: false, financeiro_oculto: true };
      }
    }

    // Marcadores de jornada (batismo · Next · grupo · servir · devocional +
    // generosidade só pra quem pode) — pedido do Arthur Serpa / Pr. Nélio,
    // 13/08/2026. Anexa DEPOIS do filtro: a lista já está recortada, então o
    // custo acompanha o que a tela vai mostrar, não a base inteira.
    // ⚠️ Best-effort dentro do serviço: marcador que falha vira `indisponiveis`
    // DECLARADO no payload, nunca lista sem gente.
    await anexarMarcadores(filtered, (m) => m.id, {
      incluirSensiveis: podeVerMarcadorSensivel(req.user),
    });

    res.json(filtered);
  } catch (e) {
    console.error('membresia/membros:', e.message);
    res.status(500).json({ error: 'Erro ao buscar membros' });
  }
});

// GET /api/membresia/membros/:id (detalhe com trilha e histórico)
// ══════════════════════════════════════════════════════════════════════════
//  GET /membros/pagina · lista PAGINADA e ORDENÁVEL (o app do staff usa esta)
// ══════════════════════════════════════════════════════════════════════════
//
// Por que não reusar `GET /membros`: ele devolve a base INTEIRA (pagina por
// dentro até 20 mil) e ordena só A→Z. Medido em 10/08: 4.056 pessoas ativas,
// 853 kB de dados crus — em JSON, com todas as colunas e o embed de família,
// passa de 2 MB. É aceitável no navegador do ERP e é ruim no celular, a cada
// abertura de tela, em rede de rua.
//
// Duas diferenças que importam:
//  · PAGINA de verdade (range no banco), com `total` para a tela saber onde está.
//  · ORDEM escolhível (A→Z ou Z→A), pedido do Matheus. O endpoint antigo tem a
//    ordem fixa no código.
//
// ⚠️ O filtro por PAPEL não entra aqui de propósito. Ele depende de cruzar
// `vw_pessoas_papeis` e é aplicado DEPOIS, em memória — com paginação no banco,
// filtrar depois devolveria páginas de tamanho irregular e um `total` mentiroso
// (a conta viria antes do filtro). Preferi não oferecer a não oferecer errado;
// os filtros daqui são todos resolvidos no banco.
router.get('/membros/pagina', authorizeModule('membros', 1), async (req, res) => {
  try {
    const p = planoDaPagina(req.query);

    let q = supabase.from('mem_membros')
      .select(COLUNAS_LISTA, { count: 'exact' })
      .eq('active', true).is('deleted_at', null);

    if (p.status) q = q.eq('status', p.status);
    if (p.semCpf) q = q.is('cpf', null);
    if (p.faixa?.gt) q = q.gt('data_nascimento', p.faixa.gt);
    if (p.faixa?.lte) q = q.lte('data_nascimento', p.faixa.lte);
    for (const t of p.tokens) q = q.ilike('nome', `%${t}%`);

    const { data, error, count } = await q
      .order('nome', { ascending: p.ascending })
      .range(p.range[0], p.range[1]);
    if (error) throw error;

    res.json(montarResposta(data, { total: count, offset: p.offset, limite: p.limite }));
  } catch (e) {
    console.error('membresia/membros/pagina:', e.message);
    res.status(500).json({ error: 'Erro ao buscar membros' });
  }
});

router.get('/membros/:id', authorizeModule('membros', 1), async (req, res) => {
  try {
    const id = req.params.id;
    const anoAtual = new Date().getFullYear();

    // Round 1: tudo que so depende do id (em paralelo)
    const [
      membroRes,
      trilhaRes,
      historicoRes,
      participacoesRes,
      contribuicoesRes,
      contribAnoRes,
      volProfileRes,
      inscricoesNextRes,
      jornada180Res,
      batismoRes,
      decisoesCultoRes,
    ] = await Promise.all([
      supabase.from('mem_membros').select('*, familia:mem_familias(id, nome)').eq('id', id).single(),
      supabase.from('mem_trilha_valores').select('*').eq('membro_id', id).order('created_at'),
      supabase.from('mem_historico').select('*, registrado:profiles(name)').eq('membro_id', id).order('data', { ascending: false }).limit(20),
      supabase.from('mem_grupo_membros')
        .select('*, grupo:mem_grupos(id, nome, categoria, local, dia_semana, horario, lider:mem_membros!lider_id(id, nome))')
        .eq('membro_id', id).order('entrou_em', { ascending: false }),
      supabase.from('mem_contribuicoes').select('*').eq('membro_id', id).is('deleted_at', null).order('data', { ascending: false }).limit(30),
      supabase.from('mem_contribuicoes').select('tipo, valor')
        .eq('membro_id', id).is('deleted_at', null).gte('data', `${anoAtual}-01-01`).lte('data', `${anoAtual}-12-31`),
      supabase.from('vol_profiles')
        .select('id, full_name, planning_center_id, allocation_status, profile_complete')
        .eq('membresia_id', id).maybeSingle(),
      supabase.from('next_inscricoes')
        .select('id, evento_id, indicou_batismo, indicou_servir, indicou_grupo, indicou_dizimo, check_in_at, created_at, evento:next_eventos(id, data, titulo, status)')
        .eq('membro_id', id).order('created_at', { ascending: false }).limit(20),
      supabase.from('cui_jornada180')
        .select('id, data_encontro, observacoes, pastor_lider_id, pastor_lider:profiles(name)')
        .eq('membro_id', id).order('data_encontro', { ascending: false }).limit(20),
      supabase.from('batismo_inscricoes')
        .select('id, data_batismo, status, observacoes')
        .eq('membro_id', id).order('data_batismo', { ascending: false }).limit(5),
      supabase.from('cultos_decisoes_pessoas')
        .select('id, culto_id, tipo_decisao, registrado_em, culto:cultos(id, data, service_type:vol_service_types(name))')
        .eq('membro_id', id).order('registrado_em', { ascending: false }).limit(5),
    ]);
    if (membroRes.error) throw membroRes.error;
    const membro = membroRes.data;
    const trilha = trilhaRes.data || [];
    const historico = historicoRes.data || [];
    const participacoes = participacoesRes.data || [];
    const contribuicoes = contribuicoesRes.data || [];
    const contribAno = contribAnoRes.data || [];
    const volProfile = volProfileRes.data || null;
    const inscricoesNext = inscricoesNextRes.data || [];
    const jornada180 = jornada180Res.data || [];
    const batismos = batismoRes.data || [];
    const decisoesCulto = decisoesCultoRes.data || [];

    // Round 2: familiares depende de membro.familia_id
    let familiares = [];
    if (membro.familia_id) {
      const { data: fam } = await supabase
        .from('mem_membros')
        .select('id, nome, status, foto_url, parentesco')
        .eq('familia_id', membro.familia_id)
        .neq('id', membro.id)
        .eq('active', true);
      familiares = fam || [];
    }

    const grupo_atual = participacoes.find(p => !p.saiu_em) || null;
    const grupo_historico = participacoes.filter(p => p.saiu_em);

    const ultimaContribuicao = contribuicoes[0]?.data || null;
    const nivelGenerosidade = calcularNivelGenerosidade(ultimaContribuicao);

    const totaisAno = { dizimo: 0, oferta: 0, campanha: 0, total: 0 };
    contribAno.forEach(c => {
      const v = Number(c.valor) || 0;
      totaisAno[c.tipo] = (totaisAno[c.tipo] || 0) + v;
      totaisAno.total += v;
    });

    let ministerios_ativos = [];
    let ministerios_historico = [];
    let checkins = [];
    let ultimoCheckin = null;
    let nivelServico = 'sem_servico';
    let escalasFuturas = [];
    let totalCheckins90d = 0;
    const vol_profile_id = volProfile?.id || null;
    const allocation_status = volProfile?.allocation_status || null;

    if (volProfile) {
      const d90 = new Date(Date.now() - 90 * 86400000).toISOString();
      // 4 queries de voluntariado em paralelo
      const [teamRes, ckRes, cnt90Res, schedRes] = await Promise.all([
        supabase.from('vol_team_members')
          .select('id, is_active, joined_at, team:vol_teams(id, name, color)')
          .eq('volunteer_profile_id', volProfile.id),
        supabase.from('vol_check_ins')
          .select('id, checked_in_at, method, is_unscheduled, service:vol_services(id, name, scheduled_at)')
          .eq('volunteer_id', volProfile.id)
          .order('checked_in_at', { ascending: false })
          .limit(20),
        supabase.from('vol_check_ins')
          .select('id', { count: 'exact', head: true })
          .eq('volunteer_id', volProfile.id)
          .gte('checked_in_at', d90),
        supabase.from('vol_schedules')
          .select('id, confirmation_status, team_name, position_name, service:vol_services!inner(id, name, scheduled_at)')
          .eq('volunteer_id', volProfile.id)
          .gte('service.scheduled_at', new Date().toISOString())
          .order('service(scheduled_at)', { ascending: true })
          .limit(10),
      ]);
      const teamData = teamRes.data || [];
      const ckData = ckRes.data || [];
      const cnt90 = cnt90Res.count || 0;
      const schedData = schedRes.data || [];

      ministerios_ativos = teamData
        .filter(t => t.is_active)
        .map(t => ({
          id: t.id, joined_at: t.joined_at,
          ministerio: t.team ? { id: t.team.id, nome: t.team.name, cor: t.team.color, ativo: true } : null,
          desde: t.joined_at,
        }));
      ministerios_historico = teamData
        .filter(t => !t.is_active)
        .map(t => ({
          id: t.id, joined_at: t.joined_at,
          ministerio: t.team ? { id: t.team.id, nome: t.team.name, cor: t.team.color, ativo: false } : null,
          desde: t.joined_at,
        }));

      checkins = ckData.map(c => ({
        id: c.id,
        data: c.checked_in_at?.slice(0, 10),
        checked_in_at: c.checked_in_at,
        method: c.method,
        is_unscheduled: c.is_unscheduled,
        ministerio: c.service ? { nome: c.service.name } : null,
      }));
      ultimoCheckin = checkins[0]?.checked_in_at || null;
      totalCheckins90d = cnt90;

      // Nível de serviço (Ativo <30d / Ausente 30-90 / Sumido >90)
      if (ultimoCheckin) {
        const dias = Math.floor((Date.now() - new Date(ultimoCheckin).getTime()) / 86400000);
        if (dias <= 30) nivelServico = 'ativo';
        else if (dias <= 90) nivelServico = 'ausente';
        else nivelServico = 'sumido';
      } else if (allocation_status === 'waiting_allocation') {
        nivelServico = 'aguardando_alocacao';
      }

      escalasFuturas = schedData.map(s => ({
        id: s.id,
        data: s.service?.scheduled_at?.slice(0, 10),
        scheduled_at: s.service?.scheduled_at,
        confirmation_status: s.confirmation_status,
        ministerio: { nome: s.team_name || (s.service?.name) },
        position: s.position_name,
      }));
    }

    // Marcadores de jornada da ficha (mesma régua da lista · serviço único).
    // Best-effort: a ficha existe pra mostrar a pessoa, não os marcadores.
    let marcadores = null;
    try {
      const { porMembro } = await marcadoresDeMembros([id], {
        incluirSensiveis: podeVerMarcadorSensivel(req.user),
      });
      marcadores = porMembro.get(id) || null;
    } catch (eMarc) {
      console.error('[membresia] marcadores da ficha:', eMarc.message);
    }

    // ⚠️ Dízimo/oferta da pessoa só pra quem pode (mesma régua do
    // `GET /membresia/contribuicoes`). O guard da rota é `membros` nível 1, que
    // passa com qualquer um dos 12 módulos do ROUTE_MODULE_MAP — era por aqui
    // que `grupos` nível 1 lia o extrato de qualquer pessoa.
    // ⚠️ Omissão DECLARADA (`financeiro_oculto`): campo que some sem aviso é
    // lido como "esta pessoa nunca contribuiu".
    const podeFinanceiro = podeVerFinanceiroDePessoa(req.user);

    res.json({
      ...membro,
      marcadores,
      familiares,
      trilha: trilha || [],
      historico: historico || [],
      grupo_atual,
      grupo_historico,
      financeiro_oculto: !podeFinanceiro,
      contribuicoes: podeFinanceiro ? (contribuicoes || []) : [],
      nivel_generosidade: podeFinanceiro ? nivelGenerosidade : null,
      ultima_contribuicao: podeFinanceiro ? ultimaContribuicao : null,
      totais_ano: podeFinanceiro ? totaisAno : null,
      // Voluntariado (lido de vol_profiles - fonte única)
      vol_profile_id,
      allocation_status,
      ministerios_ativos,
      ministerios_historico,
      checkins: checkins || [],
      ultimo_checkin: ultimoCheckin,
      total_checkins_90d: totalCheckins90d,
      nivel_servico: nivelServico,
      escalas_futuras: escalasFuturas || [],
      // NEXT
      inscricoes_next: inscricoesNext || [],
      // Discipulado / encontros pastorais
      jornada180: jornada180 || [],
      // Batismos · realizado conta como etapa 'seguir'
      batismos: batismos || [],
      // Decisões registradas em culto (data + tipo + culto)
      decisoes_culto: decisoesCulto || [],
    });
  } catch (e) {
    res.status(500).json({ error: 'Erro ao buscar membro' });
  }
});

// ────────────────────────────────────────────────────────────────────────
// ── GET /membros/:id/censo · as respostas do censo daquela pessoa ────────────
//
// Pedido do Matheus (07/08): "se eu responder o censo, a equipe de membresia
// deve conseguir ver isso nas minhas atividades e ver as minhas respostas".
// A atividade vai na linha do tempo; as RESPOSTAS vêm por aqui.
//
// ⚠️ O bloco sensível (saúde emocional, casamento, "nunca teve coragem") NÃO
// sai daqui para quem não está em `cen_acesso_sensivel`. Ter o módulo de
// membresia não é autorização para ler saúde emocional de ninguém: a régua é a
// mesma do módulo do censo, e é aplicada no SERVIDOR — filtrar no cliente seria
// maquiagem, o dado já teria saído pela rede.
router.get('/membros/:id/censo', authorizeModule('membros', 2), async (req, res) => {
  try {
    const { data: respostas, error } = await supabase
      .from('cen_resposta')
      .select('id, concluida_em, canal, identificado_por, duracao_seg, pesquisa:cen_pesquisa(id, titulo, slug, perguntas)')
      .eq('membro_id', req.params.id)
      .not('concluida_em', 'is', null)
      .is('deleted_at', null)
      .order('concluida_em', { ascending: false })
      .limit(10);
    if (error) return res.status(400).json({ error: error.message });
    if (!respostas?.length) return res.json({ respostas: [] });

    // Quem pode ver o bloco sensível é a lista nomeada, não o nível no módulo.
    let podeSensivel = false;
    try {
      const { data: acesso } = await supabase
        .from('cen_acesso_sensivel').select('profile_id')
        .eq('profile_id', req.user?.id || '').is('revogado_em', null).maybeSingle();
      podeSensivel = !!acesso;
    } catch { podeSensivel = false; }   // fail-closed

    const ids = respostas.map((r) => r.id);
    const { data: itens } = await supabase
      .from('cen_resposta_item')
      .select('resposta_id, pergunta_id, pergunta_texto, tipo, valor_texto, valor_num, valor_opcoes, sensivel, acao')
      .in('resposta_id', ids);

    const saida = respostas.map((r) => {
      const meus = (itens || []).filter((i) => i.resposta_id === r.id);
      const visiveis = podeSensivel ? meus : meus.filter((i) => i.sensivel !== true);
      // A ORDEM do questionário é a ordem que faz a leitura ter sentido; a do
      // banco é a de inserção.
      const ordem = new Map((r.pesquisa?.perguntas || [])
        .map((q, idx) => [q.id, idx]));
      visiveis.sort((a, b) => (ordem.get(a.pergunta_id) ?? 1e9) - (ordem.get(b.pergunta_id) ?? 1e9));
      return {
        id: r.id,
        pesquisa: r.pesquisa?.titulo || null,
        concluida_em: r.concluida_em,
        canal: r.canal,
        identificado_por: r.identificado_por,
        duracao_seg: r.duracao_seg,
        itens: visiveis,
        // Diz que EXISTE algo oculto, em vez de fingir que a resposta é só isso.
        // Quem precisa e não tem acesso sabe a quem pedir.
        itens_sensiveis_ocultos: meus.length - visiveis.length,
      };
    });

    res.json({ respostas: saida, pode_ver_sensivel: podeSensivel });
  } catch (e) {
    console.error('[membresia] censo:', e.message);
    res.status(500).json({ error: 'Erro ao carregar as respostas do censo' });
  }
});

// GET /api/membresia/membros/:id/timeline · "log do membro" — linha do tempo
// agregando as atividades da pessoa em vários módulos, em ordem cronológica.
// Read-only. Uma query .eq por fonte (poucas linhas por membro · seguro).
// Fontes espelham o export LGPD; NÃO inclui Kids (dado de menor) nem telemetria.
// ────────────────────────────────────────────────────────────────────────
router.get('/membros/:id/timeline', authorizeModule('membros', 1), async (req, res) => {
  try {
    const id = req.params.id;
    const eventos = [];
    const add = (tipo, data, titulo, detalhe, link) => {
      if (!data) return;
      const iso = new Date(data);
      if (isNaN(iso.getTime())) return;
      eventos.push({ tipo, data: iso.toISOString(), titulo, detalhe: detalhe || null, link: link || null });
    };
    const brl = (v) => 'R$ ' + Math.round(Number(v) || 0).toLocaleString('pt-BR');

    // Resolve o vol_profile (voluntariado liga por vol_profiles.membresia_id).
    const { data: volProfile } = await supabase.from('vol_profiles')
      .select('id').eq('membresia_id', id).maybeSingle();

    const [
      trilha, grupos, contribs, devos, next, batismos, jornada,
      convertidos, acompanh, encaminh, decisoes, historico, checkins, inscEspinha,
      censoRespostas,
    ] = await Promise.all([
      supabase.from('mem_trilha_valores').select('etapa, concluida, data_conclusao, created_at').eq('membro_id', id),
      supabase.from('mem_grupo_membros').select('entrou_em, saiu_em, motivo_saida, grupo:mem_grupos(nome)').eq('membro_id', id),
      supabase.from('mem_contribuicoes').select('tipo, valor, data, campanha').eq('membro_id', id).is('deleted_at', null).order('data', { ascending: false }).limit(200),
      supabase.from('mem_devocionais').select('tipo, data_devocional, topico').eq('membro_id', id).order('data_devocional', { ascending: false }).limit(200),
      supabase.from('next_inscricoes').select('created_at, check_in_at, evento:next_eventos(titulo)').eq('membro_id', id).limit(50),
      supabase.from('batismo_inscricoes').select('created_at, data_batismo, status').eq('membro_id', id).limit(20),
      supabase.from('cui_jornada180').select('data_encontro, etapa, presente').eq('membro_id', id).limit(50),
      supabase.from('cui_convertidos').select('data_culto, observacoes').eq('membro_id', id).limit(20),
      supabase.from('cui_acompanhamentos').select('data_inicio, data_encerramento, motivo, status').eq('membro_id', id).limit(50),
      supabase.from('jornada_encaminhamentos').select('encaminhado_em, destino, status').eq('membro_id', id).is('deleted_at', null).limit(50),
      supabase.from('cultos_decisoes_pessoas').select('registrado_em, tipo_decisao, culto:cultos(data)').eq('membro_id', id).limit(20),
      supabase.from('mem_historico').select('descricao, data').eq('membro_id', id).order('data', { ascending: false }).limit(50),
      volProfile?.id
        ? supabase.from('vol_check_ins').select('checked_in_at, method, service:vol_services(name, scheduled_at)').eq('volunteer_id', volProfile.id).order('checked_in_at', { ascending: false }).limit(100)
        : Promise.resolve({ data: [] }),
      // Espinha de inscrições (F3.2) — faltava aqui: a timeline agregava todas
      // as portas antigas mas não a nova, então evento/retiro do módulo
      // /inscricoes não aparecia na história da pessoa.
      supabase.from('inscricoes').select('created_at, status, evento:insc_eventos(nome, tipo)')
        .eq('membro_id', id).is('deleted_at', null).order('created_at', { ascending: false }).limit(100),
      // Censo: responder o censo é atividade da pessoa como qualquer outra, e a
      // equipe de membresia precisa ver isso na ficha (pedido do Matheus, 07/08).
      // Só respostas CONCLUÍDAS — rascunho não é atividade.
      supabase.from('cen_resposta')
        .select('id, concluida_em, canal, pesquisa:cen_pesquisa(titulo, slug)')
        .eq('membro_id', id).not('concluida_em', 'is', null).is('deleted_at', null)
        .order('concluida_em', { ascending: false }).limit(20),
    ]);

    (trilha.data || []).forEach((t) => t.concluida && add('trilha', t.data_conclusao || t.created_at, `Trilha: ${t.etapa}`, 'Etapa concluída', '/ministerial/membresia'));
    (grupos.data || []).forEach((g) => {
      add('grupo', g.entrou_em, `Entrou no grupo${g.grupo?.nome ? ` ${g.grupo.nome}` : ''}`, null, '/grupos');
      add('grupo_saida', g.saiu_em, `Saiu do grupo${g.grupo?.nome ? ` ${g.grupo.nome}` : ''}`, g.motivo_saida, '/grupos');
    });
    (contribs.data || []).forEach((c) => add('contribuicao', c.data, `Doação · ${c.tipo}`, `${brl(c.valor)}${c.campanha ? ` · ${c.campanha}` : ''}`, '/admin/financeiro'));
    (devos.data || []).forEach((d) => add('devocional', d.data_devocional, 'Devocional', [d.tipo, d.topico].filter(Boolean).join(' · ') || null, '/ministerial/membresia'));
    (next.data || []).forEach((n) => {
      add('next', n.created_at, `Inscrição no NEXT${n.evento?.titulo ? ` · ${n.evento.titulo}` : ''}`, null, '/next');
      add('next_checkin', n.check_in_at, `Check-in no NEXT${n.evento?.titulo ? ` · ${n.evento.titulo}` : ''}`, null, '/next');
    });
    (batismos.data || []).forEach((b) => {
      add('batismo', b.created_at, 'Inscrição no batismo', b.status, '/batismo');
      if (b.status === 'realizado' || b.status === 'confirmado') add('batismo_realizado', b.data_batismo, 'Batizado', null, '/batismo');
    });
    (jornada.data || []).forEach((j) => add('jornada', j.data_encontro, `Encontro pastoral (jornada 180)`, j.etapa ? `Etapa ${j.etapa}` : null, '/ministerial/cuidados'));
    (convertidos.data || []).forEach((c) => add('conversao', c.data_culto, 'Decisão / conversão', c.observacoes, '/ministerial/cuidados'));
    (acompanh.data || []).forEach((a) => add('aconselhamento', a.data_inicio, 'Aconselhamento', [a.motivo, a.status].filter(Boolean).join(' · ') || null, '/ministerial/cuidados'));
    (encaminh.data || []).forEach((e) => add('encaminhamento', e.encaminhado_em, `Encaminhado · ${e.destino}`, e.status, '/ministerial/cuidados'));
    (censoRespostas.data || []).forEach((c) => add(
      'censo', c.concluida_em,
      `Respondeu o censo${c.pesquisa?.titulo ? ` · ${c.pesquisa.titulo}` : ''}`,
      c.canal === 'app' ? 'pelo aplicativo' : c.canal === 'qr' ? 'pelo QR do culto' : `por ${c.canal}`,
      '/censo',
    ));
    (decisoes.data || []).forEach((d) => add('decisao', d.registrado_em || d.culto?.data, `Decisão no culto`, d.tipo_decisao, '/integracao'));
    (historico.data || []).forEach((h) => add('nota', h.data, h.descricao, 'Registro manual', '/ministerial/membresia'));
    (checkins.data || []).forEach((ci) => add('voluntariado', ci.checked_in_at, 'Check-in de voluntariado', ci.service?.name || null, '/voluntariado'));
    (inscEspinha.data || []).forEach((i) => add(
      'inscricao',
      i.created_at,
      `Inscrição · ${i.evento?.nome || (i.evento?.tipo === 'retiro' ? 'retiro' : 'evento')}`,
      i.status === 'confirmada' ? null : i.status,
      '/inscricoes',
    ));

    eventos.sort((a, b) => (a.data < b.data ? 1 : -1));

    // ⚠️ Contribuição (com VALOR) e cuidado pastoral (com MOTIVO) saem daqui
    // pra quem não pode vê-los. Até 13/08/2026 a rota inteira era
    // `authorizeModule('membros', 1)`, que passa com QUALQUER um dos 12 módulos
    // do ROUTE_MODULE_MAP — inclusive `grupos` nível 1.
    // ⚠️ O que foi omitido é DECLARADO: sumir em silêncio faria a tela afirmar
    // que a pessoa não tem histórico.
    const { eventos: visiveis, ocultos } = filtrarTimeline(eventos, {
      financeiro: podeVerFinanceiroDePessoa(req.user),
      pastoral: podeVerPastoralDePessoa(req.user),
    });
    res.json({ eventos: visiveis, total: visiveis.length, ocultos });
  } catch (e) {
    console.error('[membresia] timeline:', e.message);
    res.status(500).json({ error: 'Erro ao montar linha do tempo' });
  }
});

// ────────────────────────────────────────────────────────────────────────
// GET /api/membresia/membros/:id/inscricoes
//
// "Abrir um membro e ver as inscrições dele" — TODAS as portas num lugar só,
// não só a espinha nova. É o complemento da timeline (que é feed cronológico
// misto): aqui a pergunta é "em que esta pessoa se inscreveu, e como pagou".
//
// Fontes: espinha (`inscricoes`, com pagamento) · eventos externos legados
// (`ext_inscricoes`) · batismo · NEXT · voluntariado · pedido de grupo.
// NÃO inclui Kids — dado de menor, mesmo corte que a timeline e o export LGPD.
//
// Read-only, uma query .eq por fonte (poucas linhas por pessoa).
// ────────────────────────────────────────────────────────────────────────
router.get('/membros/:id/inscricoes', authorizeModule('membros', 1), async (req, res) => {
  try {
    const id = req.params.id;

    const [espinha, ext, batismo, next, vol, grupoPed] = await Promise.all([
      supabase.from('inscricoes')
        .select('id, status, created_at, numero_sorte, evento:insc_eventos(id, nome, data, hora, local, tipo, pagamento_ativo, valor_centavos)')
        .eq('membro_id', id).is('deleted_at', null).order('created_at', { ascending: false }).limit(200),
      supabase.from('ext_inscricoes')
        .select('id, created_at, numero_sorte, evento:ext_eventos(id, nome, data, local)')
        .eq('membro_id', id).is('deleted_at', null).order('created_at', { ascending: false }).limit(200),
      supabase.from('batismo_inscricoes')
        .select('id, status, created_at, data_batismo')
        .eq('membro_id', id).is('deleted_at', null).order('created_at', { ascending: false }).limit(50),
      supabase.from('next_inscricoes')
        .select('id, created_at, check_in_at, evento:next_eventos(id, titulo, data_inicio)')
        .eq('membro_id', id).order('created_at', { ascending: false }).limit(50),
      supabase.from('vol_inscricoes')
        .select('id, status, area, data_inscricao, created_at, ministerios_interesse')
        .eq('membro_id', id).is('deleted_at', null).order('created_at', { ascending: false }).limit(50),
      supabase.from('mem_grupo_pedidos')
        .select('id, status, created_at, decidido_em, grupo:mem_grupos(id, nome)')
        .eq('membro_id', id).order('created_at', { ascending: false }).limit(50),
    ]);

    // Pagamento das inscrições da espinha, em UMA consulta (não uma por linha).
    // Best-effort: a view é recente e a aba não pode deixar de abrir sem ela.
    const idsEspinha = (espinha.data || []).map((i) => i.id);
    let pagPorInscricao = new Map();
    if (idsEspinha.length) {
      try {
        // `.in()` em lotes de 200 (a URL do PostgREST estoura com lista grande).
        for (let i = 0; i < idsEspinha.length; i += 200) {
          const { data, error } = await supabase.from('vw_insc_pagamento_estado')
            .select('inscricao_id, metodo, status_pagamento, valor_centavos, valor_pago_centavos, pago_em, parcelas_total')
            .in('inscricao_id', idsEspinha.slice(i, i + 200));
          if (error) throw error;
          for (const p of data || []) pagPorInscricao.set(p.inscricao_id, p);
        }
      } catch (e) {
        console.error('[membresia] pagamento das inscrições indisponível:', e.message);
      }
    }

    const itens = [];
    const push = (o) => { if (o.data) itens.push(o); };

    (espinha.data || []).forEach((i) => push({
      fonte: 'inscricoes',
      porta: i.evento?.tipo === 'retiro' ? 'Retiro' : 'Evento',
      titulo: i.evento?.nome || 'Evento',
      data: i.created_at,
      data_evento: i.evento?.data || null,
      local: i.evento?.local || null,
      status: i.status,
      numero_sorte: i.numero_sorte ?? null,
      pagamento: pagPorInscricao.get(i.id) || null,
      link: i.evento?.id ? `/inscricoes/evento/${i.evento.id}` : '/inscricoes',
    }));

    (ext.data || []).forEach((i) => push({
      fonte: 'ext_inscricoes',
      porta: 'Evento',
      titulo: i.evento?.nome || 'Evento externo',
      data: i.created_at,
      data_evento: i.evento?.data || null,
      local: i.evento?.local || null,
      status: 'confirmada',
      numero_sorte: i.numero_sorte ?? null,
      pagamento: null,
      link: i.evento?.id ? `/eventos-externos/${i.evento.id}` : '/eventos-externos',
    }));

    (batismo.data || []).forEach((b) => push({
      fonte: 'batismo_inscricoes',
      porta: 'Batismo',
      titulo: 'Batismo',
      data: b.created_at,
      data_evento: b.data_batismo || null,
      status: b.status,
      link: '/batismo',
    }));

    (next.data || []).forEach((n) => push({
      fonte: 'next_inscricoes',
      porta: 'NEXT',
      titulo: n.evento?.titulo || 'NEXT',
      data: n.created_at,
      data_evento: n.evento?.data_inicio || null,
      // O check-in é o que diz se a pessoa FOI, não só se se inscreveu — é o
      // marco que a jornada de 90 dias cobra.
      status: n.check_in_at ? 'compareceu' : 'inscrita',
      link: '/next',
    }));

    (vol.data || []).forEach((v) => push({
      fonte: 'vol_inscricoes',
      porta: 'Voluntariado',
      titulo: `Voluntariado${v.area ? ` · ${v.area}` : ''}`,
      data: v.data_inscricao || v.created_at,
      detalhe: v.ministerios_interesse || null,
      status: v.status,
      link: '/voluntariado',
    }));

    (grupoPed.data || []).forEach((p) => push({
      fonte: 'mem_grupo_pedidos',
      porta: 'Grupo de conexão',
      titulo: p.grupo?.nome ? `Grupo ${p.grupo.nome}` : 'Grupo de conexão',
      data: p.created_at,
      data_evento: p.decidido_em || null,
      status: p.status,
      link: '/grupos',
    }));

    itens.sort((a, b) => (a.data < b.data ? 1 : -1));

    // Resumo pra cabeçalho da aba (contagem por porta, sem recontar no front).
    const porPorta = {};
    for (const i of itens) porPorta[i.porta] = (porPorta[i.porta] || 0) + 1;

    res.json({ itens, total: itens.length, por_porta: porPorta });
  } catch (e) {
    console.error('[membresia] inscrições do membro:', e.message);
    res.status(500).json({ error: 'Erro ao carregar as inscrições da pessoa' });
  }
});

// ────────────────────────────────────────────────────────────────────────
// GET /api/membresia/orfaos-stats · conta voluntários e batismos sem
// link com mem_membros. Ideal = 0 após a migration 20260515500000.
// ────────────────────────────────────────────────────────────────────────
router.get('/orfaos-stats', authorizeModule('membros', 1), async (_req, res) => {
  try {
    const { data, error } = await supabase
      .from('vw_membros_orfaos_stats')
      .select('*')
      .maybeSingle();
    if (error) throw error;
    res.json(data || { voluntarios_sem_membro: 0, batismos_sem_membro: 0 });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/membresia/promover-orfaos · forca backfill manual (admin/diretor).
// A migration já faz isso uma vez · este endpoint serve pra rodar de novo
// caso registros antigos tenham caido pelas brechas (importacoes, etc).
router.post('/promover-orfaos', authorize('admin', 'diretor'), async (_req, res) => {
  try {
    // Reusa a lógica da fn_link_or_create_membro via RPC.
    // O trigger já age em INSERT/UPDATE · pra reprocessar antigos, basta
    // touchear (UPDATE de nenhum campo não dispara · forco trigger via UPDATE updated_at).
    const stats = { voluntarios: 0, batismos: 0, erros: [] };

    const { data: volOrfaos } = await supabase
      .from('vol_profiles')
      .select('id')
      .is('membresia_id', null)
      .not('full_name', 'is', null);

    for (const v of volOrfaos || []) {
      // UPDATE no próprio updated_at pra disparar BEFORE UPDATE trigger
      const { error } = await supabase
        .from('vol_profiles')
        .update({ updated_at: new Date().toISOString() })
        .eq('id', v.id);
      if (error) stats.erros.push({ tabela: 'vol_profiles', id: v.id, msg: error.message });
      else stats.voluntarios++;
    }

    const { data: batOrfaos } = await supabase
      .from('batismo_inscricoes')
      .select('id')
      .is('membro_id', null);

    for (const b of batOrfaos || []) {
      const { error } = await supabase
        .from('batismo_inscricoes')
        .update({ updated_at: new Date().toISOString() })
        .eq('id', b.id);
      if (error) stats.erros.push({ tabela: 'batismo_inscricoes', id: b.id, msg: error.message });
      else stats.batismos++;
    }

    res.json({ ok: true, ...stats });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Normaliza o CPF do payload admin (auditoria CPF 2026-07-16): o modal admin
// enviava o CPF como digitado — '123.456.789-01' gravado cru fica invisível
// pra todo o matching digits-only (a pessoa re-entra por qualquer porta e vira
// stub duplicado). DV no servidor: CPF errado "ocupa a vaga" no índice UNIQUE.
// `cpfAtual` (UPDATE): CPF idêntico ao já armazenado passa SEM validar DV —
// grandfathering do legado (o modal sempre reenvia o cpf armazenado; sem isso,
// um CPF legado DV-inválido travaria QUALQUER edição do cadastro). O DV só
// vale pra CPF novo ou alterado.
// Retorna mensagem de erro ou null se ok (muta o body).
function normalizarCpfPayload(body, cpfAtual) {
  if (!body || body.cpf === undefined || body.cpf === null || body.cpf === '') {
    if (body && (body.cpf === '' || body.cpf === null)) body.cpf = null;
    return null;
  }
  const digitosPayload = String(body.cpf).replace(/\D/g, '');
  const digitosAtual = String(cpfAtual || '').replace(/\D/g, '');
  if (digitosPayload && digitosAtual && digitosPayload === digitosAtual) {
    body.cpf = digitosPayload;
    return null;
  }
  const d = normCpf11(body.cpf);
  if (!d || !cpfValido(d)) return 'CPF inválido — confira os dígitos';
  body.cpf = d;
  return null;
}

// Telefone: mesmo espírito do CPF acima — digits-only + tamanho de linha BR
// (10-11 dígitos com DDD · 55 na frente é removido). Sem a guarda, telefone
// corrompido entra no cadastro e some do WhatsApp/matching (caso real
// 26/07/2026: líder com 21 dígitos — o número colado 2× — ficou sem receber
// os avisos de pedido do grupo no lançamento). `telefoneAtual` (UPDATE):
// valor idêntico ao já armazenado passa sem validar — grandfathering do
// legado (senão um telefone antigo inválido travaria qualquer edição).
// Retorna mensagem de erro ou null se ok (muta o body).
function normalizarTelefonePayload(body, telefoneAtual) {
  if (!body || body.telefone === undefined || body.telefone === null || body.telefone === '') {
    if (body && (body.telefone === '' || body.telefone === null)) body.telefone = null;
    return null;
  }
  const digitosPayload = String(body.telefone).replace(/\D/g, '');
  const digitosAtual = String(telefoneAtual || '').replace(/\D/g, '');
  if (digitosPayload && digitosAtual && digitosPayload === digitosAtual) {
    body.telefone = digitosPayload;
    return null;
  }
  let d = digitosPayload;
  if (d.startsWith('55') && d.length > 11) d = d.slice(2);
  if (d.length < 10 || d.length > 11) {
    return 'Telefone inválido — informe DDD + número (10 ou 11 dígitos)';
  }
  body.telefone = d;
  return null;
}

// POST /api/membresia/membros
router.post('/membros', authorize('admin', 'diretor'), async (req, res) => {
  try {
    const errCpf = normalizarCpfPayload(req.body);
    if (errCpf) return res.status(400).json({ error: errCpf });
    const errTel = normalizarTelefonePayload(req.body);
    if (errTel) return res.status(400).json({ error: errTel });
    const resultado = await acharOuCriarGuardado({
      nome: req.body?.nome, cpf: req.body?.cpf, telefone: req.body?.telefone,
      email: req.body?.email, dataNascimento: req.body?.data_nascimento,
      status: req.body?.status || 'membro_ativo', extra: req.body || {},
      origem: 'membresia_manual',
    });
    if (!resultado.created) {
      return res.status(409).json({
        error: 'Já existe uma pessoa compatível. Abra o cadastro encontrado ou resolva a duplicidade antes de criar outro.',
        code: 'pessoa_compativel', membro_id: resultado.membro_id,
      });
    }
    const { data, error } = await supabase.from('mem_membros')
      .select().eq('id', resultado.membro_id).single();
    if (error) throw error;
    enqueueSync('membro', data.id, 'upsert').catch(() => {});
    res.status(201).json(data);
  } catch (e) {
    console.error('[MEMBROS] create error:', e.message);
    res.status(500).json({ error: `Erro ao criar membro: ${e.message}` });
  }
});

// PUT /api/membresia/membros/:id
router.put('/membros/:id', authorize('admin', 'diretor'), async (req, res) => {
  try {
    // CPF/telefone atuais do membro: idêntico ao payload passa sem validar (legado)
    let cpfAtual = null;
    let telefoneAtual = null;
    if (req.body?.cpf || req.body?.telefone) {
      const { data: atual } = await supabase.from('mem_membros')
        .select('cpf, telefone').eq('id', req.params.id).maybeSingle();
      cpfAtual = atual?.cpf || null;
      telefoneAtual = atual?.telefone || null;
    }
    const errCpf = normalizarCpfPayload(req.body, cpfAtual);
    if (errCpf) return res.status(400).json({ error: errCpf });
    const errTel = normalizarTelefonePayload(req.body, telefoneAtual);
    if (errTel) return res.status(400).json({ error: errTel });
    const { data, error } = await supabase
      .from('mem_membros')
      .update(req.body)
      .eq('id', req.params.id)
      .select()
      .single();
    if (error) {
      if (error.code === '23505' && req.body?.cpf) {
        return res.status(409).json({ error: 'Este CPF já pertence a outro membro ativo — funda os cadastros em vez de duplicar.', code: 'cpf_em_uso' });
      }
      throw error;
    }
    enqueueSync('membro', req.params.id, 'upsert').catch(() => {});
    res.json(data);
  } catch (e) {
    console.error('[MEMBROS] update error:', e.message);
    res.status(500).json({ error: `Erro ao atualizar membro: ${e.message}` });
  }
});

// DELETE /api/membresia/membros/:id (soft delete)
router.delete('/membros/:id', authorize('admin', 'diretor'), async (req, res) => {
  try {
    // active=false sozinho NÃO libera o CPF: o índice UNIQUE é parcial em
    // deleted_at IS NULL. app_soft_delete carimba deleted_at (reversível via
    // app_restore) e mantém active=false pros filtros legados.
    await supabase.from('mem_membros').update({ active: false }).eq('id', req.params.id);
    const { error } = await supabase.rpc('app_soft_delete', {
      p_table_name: 'mem_membros',
      p_row_id: req.params.id,
      p_deleted_by: req.user?.id ?? null,
    });
    if (error) throw error;
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'Erro ao remover membro' });
  }
});

// POST /api/membresia/membros/:id/foto — upload de foto do membro
router.post('/membros/:id/foto', authorize('admin', 'diretor'), uploadMw.single('foto'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Imagem não fornecida' });
    const { id } = req.params;
    const ext = req.file.mimetype === 'image/png' ? 'png' : req.file.mimetype === 'image/webp' ? 'webp' : 'jpg';
    const path = `membros/${id}.${ext}`;

    const { error: upErr } = await supabase.storage
      .from('fotos-membros')
      .upload(path, req.file.buffer, { contentType: req.file.mimetype, upsert: true });
    if (upErr) throw upErr;

    const { data: urlData } = supabase.storage.from('fotos-membros').getPublicUrl(path);
    const foto_url = `${urlData.publicUrl}?t=${Date.now()}`;

    const { error: dbErr } = await supabase.from('mem_membros').update({ foto_url }).eq('id', id);
    if (dbErr) throw dbErr;

    // Copiar para SharePoint "CRM e Pessoas" em background (não bloqueia resposta)
    if (SHAREPOINT_CONFIGURED) {
      (async () => {
        try {
          const { data: membro } = await supabase.from('mem_membros').select('nome').eq('id', id).single();
          const nomePasta = membro?.nome || id;
          await uploadModuleFile('membresia', `Fotos`, `${nomePasta}_${id}.${ext}`, req.file.buffer);
          console.log(`[MEMBROS] Foto sincronizada com SharePoint: ${nomePasta}`);
        } catch (spErr) {
          console.error('[MEMBROS] SharePoint sync erro (nao-critico):', spErr.message);
        }
      })();
    }

    res.json({ foto_url });
  } catch (e) {
    console.error('[MEMBROS] foto upload error:', e.message);
    res.status(500).json({ error: `Erro ao enviar foto: ${e.message}` });
  }
});

// ── Trilha dos Valores ──

// POST /api/membresia/trilha
router.post('/trilha', authorize('admin', 'diretor'), async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('mem_trilha_valores')
      .insert(req.body)
      .select()
      .single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (e) {
    res.status(500).json({ error: 'Erro ao registrar etapa da trilha' });
  }
});

// PATCH /api/membresia/trilha/:id
router.patch('/trilha/:id', authorize('admin', 'diretor'), async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('mem_trilha_valores')
      .update(req.body)
      .eq('id', req.params.id)
      .select()
      .single();
    if (error) throw error;
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: 'Erro ao atualizar trilha' });
  }
});

// ── Famílias ──

// GET /api/membresia/familias
router.get('/familias', authorizeModule('membros', 1), async (req, res) => {
  try {
    const { busca } = req.query;
    let query = supabase
      .from('mem_familias')
      .select('*, membros:mem_membros(id, nome, status, parentesco)')
      .order('nome');
    if (busca) query = query.ilike('nome', `%${busca}%`);
    const { data, error } = await query;
    if (error) throw error;
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: 'Erro ao buscar famílias' });
  }
});

// POST /api/membresia/familias
router.post('/familias', authorize('admin', 'diretor'), async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('mem_familias')
      .insert(req.body)
      .select()
      .single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (e) {
    res.status(500).json({ error: 'Erro ao criar família' });
  }
});

// PUT /api/membresia/familias/:id
router.put('/familias/:id', authorize('admin', 'diretor'), async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('mem_familias')
      .update(req.body)
      .eq('id', req.params.id)
      .select()
      .single();
    if (error) throw error;
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: 'Erro ao atualizar família' });
  }
});

// DELETE /api/membresia/familias/:id
router.delete('/familias/:id', authorize('admin', 'diretor'), async (req, res) => {
  try {
    // Desvincula todos os membros antes de remover
    await supabase
      .from('mem_membros')
      .update({ familia_id: null, parentesco: null })
      .eq('familia_id', req.params.id);
    const { error } = await supabase
      .from('mem_familias')
      .delete()
      .eq('id', req.params.id);
    if (error) throw error;
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'Erro ao remover família' });
  }
});

// PATCH /api/membresia/membros/:id/familia — vincular/desvincular
router.patch('/membros/:id/familia', authorize('admin', 'diretor'), async (req, res) => {
  try {
    const { familia_id, parentesco } = req.body || {};
    const payload = {
      familia_id: familia_id || null,
      parentesco: familia_id ? (parentesco || null) : null,
    };
    const { data, error } = await supabase
      .from('mem_membros')
      .update(payload)
      .eq('id', req.params.id)
      .select('*, familia:mem_familias(id, nome)')
      .single();
    if (error) throw error;
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: 'Erro ao vincular família' });
  }
});

// POST /api/membresia/membros/:id/mesma-familia — "essa pessoa é da mesma
// família que <outra>". Junta os dois na MESMA família (usa a do âncora; cria
// uma se nenhum tiver) e marca o par como não-duplicata.
router.post('/membros/:id/mesma-familia', authorize('admin', 'diretor'), async (req, res) => {
  try {
    const { id } = req.params;
    const { outro_membro_id, parentesco } = req.body || {};
    if (!outro_membro_id) return res.status(400).json({ error: 'outro_membro_id obrigatório' });
    if (outro_membro_id === id) return res.status(400).json({ error: 'Selecione outra pessoa' });

    const ultimoSobrenome = (n) => { const t = String(n || '').trim().split(/\s+/).filter(Boolean); return t.length ? t[t.length - 1] : ''; };
    const [{ data: atual }, { data: outro }] = await Promise.all([
      supabase.from('mem_membros').select('id, nome, familia_id').eq('id', id).maybeSingle(),
      supabase.from('mem_membros').select('id, nome, familia_id').eq('id', outro_membro_id).maybeSingle(),
    ]);
    if (!atual) return res.status(404).json({ error: 'Cadastro não encontrado' });
    if (!outro) return res.status(404).json({ error: 'A outra pessoa não foi encontrada' });

    // Define a família-âncora: a do outro, senão a do atual, senão cria nova.
    let familiaId = outro.familia_id || atual.familia_id || null;
    if (!familiaId) {
      const sob = ultimoSobrenome(outro.nome) || ultimoSobrenome(atual.nome) || 'sem sobrenome';
      const { data: fam, error: fe } = await supabase.from('mem_familias').insert({ nome: `Família ${sob}` }).select('id').single();
      if (fe) throw fe;
      familiaId = fam.id;
    }
    // Garante os dois na mesma família (sem mexer no parentesco do outro).
    if (outro.familia_id !== familiaId) await supabase.from('mem_membros').update({ familia_id: familiaId }).eq('id', outro_membro_id);

    const upd = { familia_id: familiaId };
    if (parentesco) upd.parentesco = parentesco;
    const { data, error } = await supabase.from('mem_membros').update(upd).eq('id', id)
      .select('*, familia:mem_familias(id, nome)').single();
    if (error) throw error;

    const [a, b] = [id, outro_membro_id].sort();
    await supabase.from('mem_duplicados_ignorados').upsert(
      { membro_a_id: a, membro_b_id: b, ignorado_por: req.user?.id || null, motivo: 'Mesma família (vínculo manual)' },
      { onConflict: 'membro_a_id,membro_b_id' });

    res.json(data);
  } catch (e) {
    console.error('[membresia/mesma-familia]', e.message);
    res.status(500).json({ error: e.message || 'Erro ao vincular família' });
  }
});

// GET /api/membresia/membros/:id/wifi — histórico de conexões na rede wifi da
// igreja deste membro (via wifi_visitantes.membro_id → wifi_conexoes).
router.get('/membros/:id/wifi', authorizeModule('membros', 1), async (req, res) => {
  try {
    const { id } = req.params;
    const { data: vis } = await supabase.from('wifi_visitantes').select('id').eq('membro_id', id).is('deleted_at', null);
    const visIds = (vis || []).map(v => v.id);
    if (!visIds.length) return res.json({ tem_wifi: false, total_logins: 0, cultos_distintos: 0, conexoes: [] });

    const conexoes = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await supabase.from('wifi_conexoes')
        .select('id, timestamp_evento, evento, culto_id, mac_address')
        .in('wifi_visitante_id', visIds).is('deleted_at', null)
        .order('timestamp_evento', { ascending: false })
        .range(from, from + 999);
      if (error) break;
      conexoes.push(...(data || []));
      if (!data || data.length < 1000) break;
    }
    const cultos = new Set(conexoes.map(c => c.culto_id).filter(Boolean));
    const recentes = conexoes.slice(0, 50);
    const cultoIds = [...new Set(recentes.map(c => c.culto_id).filter(Boolean))];
    const cultoNome = {};
    if (cultoIds.length) {
      const { data: cs } = await supabase.from('cultos').select('id, data').in('id', cultoIds);
      (cs || []).forEach(c => { cultoNome[c.id] = c.data ? `Culto · ${String(c.data).slice(0, 10).split('-').reverse().join('/')}` : 'Culto'; });
    }
    res.json({
      tem_wifi: true,
      total_logins: conexoes.length,
      cultos_distintos: cultos.size,
      ultima_conexao: conexoes[0]?.timestamp_evento || null,
      conexoes: recentes.map(c => ({
        id: c.id, timestamp_evento: c.timestamp_evento, evento: c.evento,
        mac_address: c.mac_address, culto_nome: cultoNome[c.culto_id] || null,
      })),
    });
  } catch (e) {
    console.error('[membresia/membros/:id/wifi]', e.message);
    res.status(500).json({ error: 'Erro ao carregar histórico de wifi' });
  }
});

// GET /membros/:id/reconhecimento-facial — cada vez que o membro foi reconhecido
// pela câmera (data + hora), pra ver a frequência por reconhecimento facial.
router.get('/membros/:id/reconhecimento-facial', authorizeModule('membros', 1), async (req, res) => {
  try {
    const { data, error } = await supabase.from('face_presencas')
      .select('reconhecido_em, entrada, confianca, culto_id')
      .eq('membro_id', req.params.id)
      .order('reconhecido_em', { ascending: false })
      .limit(1000);
    if (error) throw error;
    const itens = data || [];
    res.json({
      total: itens.length,
      ultima: itens[0]?.reconhecido_em || null,
      itens,
    });
  } catch (e) {
    console.error('[membresia/membros/:id/reconhecimento-facial]', e.message);
    res.status(500).json({ error: 'Erro ao carregar reconhecimento facial' });
  }
});

// ── Histórico ──

// POST /api/membresia/historico
router.post('/historico', authorize('admin', 'diretor'), async (req, res) => {
  try {
    const body = { ...req.body, registrado_por: req.user.id };
    const { data, error } = await supabase
      .from('mem_historico')
      .insert(body)
      .select()
      .single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (e) {
    res.status(500).json({ error: 'Erro ao registrar histórico' });
  }
});

// ── Grupos de Conexão ──

// GET /api/membresia/grupos
router.get('/grupos', async (req, res) => {
  try {
    const { ativo } = req.query;
    let query = supabase
      .from('mem_grupos')
      .select('*, lider:mem_membros!lider_id(id, nome), membros:mem_grupo_membros(id, membro_id, entrou_em, saiu_em)')
      .order('nome');

    if (ativo === 'true') query = query.eq('ativo', true);
    if (ativo === 'false') query = query.eq('ativo', false);

    const { data, error } = await query;
    if (error) throw error;

    // Injeta total_ativos (só participações com saiu_em null)
    const withCount = (data || []).map(g => ({
      ...g,
      total_ativos: (g.membros || []).filter(m => !m.saiu_em).length,
    }));
    res.json(withCount);
  } catch (e) {
    res.status(500).json({ error: 'Erro ao buscar grupos' });
  }
});

// GET /api/membresia/grupos/:id (detalhe com membros ativos e históricos)
router.get('/grupos/:id', async (req, res) => {
  try {
    const { data: grupo, error } = await supabase
      .from('mem_grupos')
      .select('*, lider:mem_membros!lider_id(id, nome)')
      .eq('id', req.params.id)
      .single();
    if (error) throw error;

    const { data: participacoes } = await supabase
      .from('mem_grupo_membros')
      .select('*, membro:mem_membros(id, nome, status)')
      .eq('grupo_id', grupo.id)
      .order('entrou_em', { ascending: false });

    const ativos = (participacoes || []).filter(p => !p.saiu_em);
    const historico = (participacoes || []).filter(p => p.saiu_em);

    res.json({ ...grupo, ativos, historico });
  } catch (e) {
    res.status(500).json({ error: 'Erro ao buscar grupo' });
  }
});

// POST /api/membresia/grupos
router.post('/grupos', authorize('admin', 'diretor'), async (req, res) => {
  try {
    const payload = { ...req.body };
    if (payload.lider_id === '') delete payload.lider_id;
    if (payload.dia_semana === '' || payload.dia_semana == null) delete payload.dia_semana;
    if (payload.horario === '') delete payload.horario;

    const { data, error } = await supabase.from('mem_grupos').insert(payload).select().single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (e) {
    res.status(500).json({ error: 'Erro ao criar grupo' });
  }
});

// PUT /api/membresia/grupos/:id
router.put('/grupos/:id', authorize('admin', 'diretor'), async (req, res) => {
  try {
    const payload = { ...req.body };
    if (payload.lider_id === '') payload.lider_id = null;
    if (payload.dia_semana === '') payload.dia_semana = null;
    if (payload.horario === '') payload.horario = null;

    const { data, error } = await supabase.from('mem_grupos').update(payload).eq('id', req.params.id).select().single();
    if (error) throw error;
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: 'Erro ao atualizar grupo' });
  }
});

// DELETE /api/membresia/grupos/:id (soft delete: ativo = false)
router.delete('/grupos/:id', authorize('admin', 'diretor'), async (req, res) => {
  try {
    const { error } = await supabase.from('mem_grupos').update({ ativo: false }).eq('id', req.params.id);
    if (error) throw error;
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'Erro ao desativar grupo' });
  }
});

// POST /api/membresia/grupos/:id/membros — adicionar membro ao grupo
// Se o membro já estava em outro grupo ativo, fecha o registro anterior (saiu_em = hoje).
router.post('/grupos/:id/membros', authorize('admin', 'diretor'), async (req, res) => {
  try {
    const grupoId = req.params.id;
    const { membro_id, entrou_em } = req.body;
    if (!membro_id) return res.status(400).json({ error: 'membro_id obrigatório' });

    const hoje = new Date().toISOString().slice(0, 10);

    // Fecha participação ativa anterior (se houver)
    await supabase
      .from('mem_grupo_membros')
      .update({ saiu_em: hoje, motivo_saida: 'Transferido para outro grupo' })
      .eq('membro_id', membro_id)
      .is('saiu_em', null);

    // Cria nova
    const { data, error } = await supabase
      .from('mem_grupo_membros')
      // ⚠️ `funcao` EXPLÍCITA (13/08/2026): a equipe adicionou esta pessoa ao
      // grupo DE PROPÓSITO — participação, não visita. Antes caía no default da
      // coluna, que era 'visitante' desde 20/06. Mesma régua da aprovação de
      // pedido; setar aqui vale mesmo antes da migration 20260814120000.
      .insert({ grupo_id: grupoId, membro_id, funcao: 'frequentador', entrou_em: entrou_em || hoje })
      .select()
      .single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (e) {
    res.status(500).json({ error: 'Erro ao adicionar membro ao grupo' });
  }
});

// GET /api/membresia/geocode-cep?cep=XXXXXXXX — geocodifica um CEP brasileiro (ViaCEP + Nominatim)
router.get('/geocode-cep', async (req, res) => {
  try {
    const cep = (req.query.cep || '').replace(/\D/g, '');
    if (cep.length !== 8) return res.status(400).json({ error: 'CEP invalido' });
    const viaCepRes = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
    const viaCep = await viaCepRes.json();
    if (viaCep.erro) return res.status(404).json({ error: 'CEP não encontrado' });
    const q = encodeURIComponent(`${viaCep.logradouro || ''} ${viaCep.localidade} ${viaCep.uf} Brasil`.trim());
    const nomRes = await fetch(`https://nominatim.openstreetmap.org/search?q=${q}&format=json&limit=1`, {
      headers: { 'User-Agent': 'CBRio-Sistema/1.0 (contato@cbrio.com.br)' },
    });
    const nom = await nomRes.json();
    res.json({
      cep, logradouro: viaCep.logradouro, bairro: viaCep.bairro,
      cidade: viaCep.localidade, uf: viaCep.uf,
      lat: nom?.[0] ? parseFloat(nom[0].lat) : null,
      lng: nom?.[0] ? parseFloat(nom[0].lon) : null,
    });
  } catch (e) { res.status(500).json({ error: 'Erro ao geocodificar' }); }
});

// POST /api/membresia/totem/grupos/:id/entrar — pedido de entrada via totem.
// NÃO insere direto em mem_grupo_membros: cria mem_grupo_pedidos e o líder
// aprova na caixa de entrada (lei do módulo Grupos — pedido = a própria pessoa
// pediu → líder aprova). Aceita membro real OU cadastro ainda pendente.
router.post('/totem/grupos/:id/entrar', async (req, res) => {
  try {
    const grupoId = req.params.id;
    const { membro_id, cadastro_pendente_id, nome, telefone, email } = req.body || {};
    if (!membro_id && !cadastro_pendente_id) {
      return res.status(400).json({ error: 'membro_id ou cadastro_pendente_id obrigatório' });
    }

    // ── Gates de entrada · MESMAS regras da porta pública (publicGrupos.js) ──
    // O totem não pode aceitar o que o formulário público barra: grupo por
    // convite ('fechado'), inscrições fechadas, temporada fechada, gênero
    // incompatível. Antes o totem pulava tudo isso.
    const { data: grupo } = await supabase.from('mem_grupos')
      .select('id, nome, ativo, aceitando_inscricoes, modo_inscricao, temporada, categoria, lider_id')
      .eq('id', grupoId).is('deleted_at', null).maybeSingle();
    if (!grupo || !grupo.ativo) {
      return res.status(404).json({ error: 'Grupo não encontrado ou inativo.' });
    }
    if (grupo.modo_inscricao === 'fechado') {
      return res.status(403).json({ error: 'Este grupo é por convite do líder — fale com ele para participar.', codigo: 'inscricoes_fechadas' });
    }
    if (grupo.aceitando_inscricoes === false) {
      return res.status(403).json({ error: 'Este grupo não está recebendo novas inscrições no momento.', codigo: 'inscricoes_fechadas' });
    }
    if (grupo.temporada && grupo.modo_inscricao !== 'sempre_aberto') {
      const { data: temporada } = await supabase.from('mem_temporadas')
        .select('inscricoes_abertas').eq('id', grupo.temporada).maybeSingle();
      if (!temporada?.inscricoes_abertas) {
        return res.status(403).json({ error: 'As inscrições para esta temporada estão fechadas no momento.', codigo: 'inscricoes_fechadas' });
      }
    }

    // Snapshot + identidade da pessoa (pro gate de gênero, dedup e rastro).
    let pessoa = {
      nome: nome ? String(nome).trim() : null,
      telefone: telefone || null,
      email: email ? String(email).trim().toLowerCase() : null,
      cpf: null, data_nascimento: null, genero: null,
    };
    if (membro_id) {
      const { data: m } = await supabase.from('mem_membros')
        .select('nome, telefone, email, cpf, data_nascimento, genero').eq('id', membro_id).maybeSingle();
      if (m) pessoa = { nome: pessoa.nome || m.nome, telefone: pessoa.telefone || m.telefone, email: pessoa.email || m.email, cpf: m.cpf, data_nascimento: m.data_nascimento, genero: m.genero };
    } else if (cadastro_pendente_id) {
      const { data: c } = await supabase.from('mem_cadastros_pendentes')
        .select('nome, telefone, email, cpf, data_nascimento').eq('id', cadastro_pendente_id).maybeSingle();
      if (c) pessoa = { ...pessoa, nome: pessoa.nome || c.nome, telefone: pessoa.telefone || c.telefone, email: pessoa.email || c.email, cpf: c.cpf, data_nascimento: c.data_nascimento };
    }
    if (!pessoa.nome) return res.status(400).json({ error: 'Não foi possível identificar o solicitante' });

    // Gênero (única trava de compatibilidade · lei 2026-07-14) — só quando o
    // gênero é conhecido; sem o dado, não trava (o líder decide na aprovação).
    const cat = String(grupo.categoria || '').toLowerCase();
    const gen = String(pessoa.genero || '').toLowerCase();
    if ((cat === 'mulheres' && gen === 'masculino') || (cat === 'homens' && gen === 'feminino')) {
      return res.status(422).json({
        codigo: 'grupo_incompativel',
        error: cat === 'mulheres' ? 'Este é um grupo só de mulheres.' : 'Este é um grupo só de homens.',
      });
    }

    // Dedup: já é membro ativo (renovação · não abre pedido) OU já tem pedido pendente.
    if (membro_id) {
      const { data: ativo } = await supabase.from('mem_grupo_membros')
        .select('id').eq('grupo_id', grupoId).eq('membro_id', membro_id).is('saiu_em', null).is('deleted_at', null).limit(1);
      if (ativo && ativo.length) return res.json({ ok: true, ja_membro: true, grupo_nome: grupo.nome, mensagem: 'Você já participa deste grupo.' });
    }
    let dedupQ = supabase.from('mem_grupo_pedidos')
      .select('id').eq('grupo_id', grupoId).eq('status', 'pendente').limit(1);
    dedupQ = membro_id
      ? dedupQ.eq('membro_id', membro_id)
      : dedupQ.eq('cadastro_pendente_id', cadastro_pendente_id);
    const { data: existente } = await dedupQ.maybeSingle();
    if (existente) return res.json({ ok: true, pedido_id: existente.id, ja_existia: true });

    // Rastro de identidade (Contrato de porta · igual ao público · best-effort).
    try {
      const { registrarObservacaoSegura } = require('../services/identidadeProgressiva');
      await registrarObservacaoSegura({
        membroId: membro_id || null, origem: 'grupos_totem', origemId: cadastro_pendente_id || null,
        nome: pessoa.nome, cpf: pessoa.cpf, email: pessoa.email,
        telefone: pessoa.telefone, dataNascimento: pessoa.data_nascimento,
      });
    } catch (e) { console.error('[TOTEM] grupo registrarObservacao:', e.message); }

    const { data: pedido, error } = await supabase.from('mem_grupo_pedidos')
      .insert({
        grupo_id: grupoId,
        membro_id: membro_id || null,
        cadastro_pendente_id: membro_id ? null : (cadastro_pendente_id || null),
        nome: pessoa.nome,
        telefone: pessoa.telefone,
        email: pessoa.email,
        // CHECK de origem só aceita cadastro_interno/formulario_publico/manual —
        // a proveniência real fica na observação (sem migration).
        origem: 'manual',
        observacao: 'Pedido feito pelo totem do lounge',
        status: 'pendente',
      })
      .select('id').single();
    if (error) {
      if (error.code === '23505') return res.json({ ok: true, ja_existia: true });
      throw error;
    }

    // Linha do tempo do pedido (histórico da caixa de entrada · igual ao público).
    try {
      require('../services/grupoPedidoEventos').registrarEventoPedido(pedido.id, 'criado', { grupo: grupo.nome, origem: 'totem' });
    } catch { /* best-effort */ }

    // Só quem responde por ESTE grupo (líder + supervisor). Sem dono com conta
    // de sistema, o aviso não sai — o líder recebe o WhatsApp e a coordenação vê
    // no resumo diário. Ver services/gruposDestinatarios.js.
    // Sino do app do líder (ver services/gruposAvisoApp.js) — AWAITED, como nas
    // outras origens: é o canal do líder que só tem o app do membro.
    await avisarPedidoNovoNoApp({
      grupoId, pedidoId: pedido.id, grupoNome: grupo.nome, pessoaNome: pessoa.nome,
    });

    donosDoGrupo(grupoId).then((donos) => {
      if (!donos.length) return;
      return notificar({
        modulo: 'grupos',
        tipo: 'pedido_grupo',
        titulo: `Novo pedido para ${grupo.nome || 'grupo'}`,
        mensagem: `${pessoa.nome} pediu para entrar no grupo pelo totem.`,
        link: '/grupos?tab=entrada',
        severidade: 'aviso',
        chaveDedup: `pedido_grupo_${pedido.id}`,
        targetIds: donos,
      });
    }).catch(() => {});

    res.status(201).json({ ok: true, pedido_id: pedido.id, grupo_nome: grupo.nome || null });
  } catch (e) {
    console.error('[TOTEM] pedido grupo error:', e.message);
    res.status(500).json({ error: 'Erro ao registrar pedido' });
  }
});

// PUT /api/membresia/totem/membros/:id — self-update pelo totem (campos seguros)
router.put('/totem/membros/:id', async (req, res) => {
  try {
    const { id } = req.params;
    if (!podeEditarMembroTotem(req, id)) {
      return res.status(403).json({ error: 'Sem permissão para editar este cadastro' });
    }
    const allowed = ['email', 'telefone', 'data_nascimento', 'endereco', 'bairro', 'cidade', 'cep', 'estado_civil'];
    const updates = {};
    for (const f of allowed) {
      if (req.body[f] !== undefined && req.body[f] !== null) updates[f] = req.body[f];
    }
    if (Object.keys(updates).length === 0) return res.status(400).json({ error: 'Nenhum campo para atualizar' });
    if (updates.telefone !== undefined) {
      const { data: atual } = await supabase.from('mem_membros')
        .select('telefone').eq('id', id).maybeSingle();
      const errTel = normalizarTelefonePayload(updates, atual?.telefone);
      if (errTel) return res.status(400).json({ error: errTel });
    }
    const { data, error } = await supabase.from('mem_membros').update(updates).eq('id', id).select().single();
    if (error) throw error;
    res.json(data);
  } catch (e) {
    console.error('[TOTEM] update membro error:', e.message);
    res.status(500).json({ error: 'Erro ao atualizar dados: ' + e.message });
  }
});

// ── Totem · NEXT (inscrição + status) ──
//
// Next é o modelo de TURMAS mensais (next_turmas/next_matriculas). O totem
// grava direto na matrícula (fim da perda silenciosa do legado next_inscricoes).
// Helper · a turma aberta do momento (mesma regra do formulário público: a mais
// recente aberta). Devolve um objeto "evento-like" { id, data, titulo } pra UI do
// totem seguir funcionando (data = 1º encontro da turma, se já marcado).
async function _turmaAbertaTotem() {
  const [t] = await _turmasAbertasTotem();
  return t || null;
}

// Todas as turmas abertas (calendário do totem), da mais próxima pra frente.
// Cada uma vira "evento-like" { id, titulo, data (1º encontro), horario }.
// `horario` da turma (coluna 20260722240000) — tolera ausência (só some).
async function _turmasAbertasTotem() {
  const { data: turmas } = await supabase
    .from('next_turmas')
    .select('id, nome, horario')
    .eq('status', 'aberta')
    .is('deleted_at', null)
    .order('created_at', { ascending: false });
  if (!turmas || !turmas.length) return [];
  const ids = turmas.map((t) => t.id);
  const { data: encs } = await supabase
    .from('next_encontros')
    .select('turma_id, data')
    .in('turma_id', ids)
    .eq('numero', 1);
  const dataPorTurma = {};
  (encs || []).forEach((e) => { dataPorTurma[e.turma_id] = e.data; });
  return turmas
    .map((t) => ({ id: t.id, titulo: t.nome, data: dataPorTurma[t.id] || null, horario: t.horario || null }))
    // Datas definidas primeiro (ordenadas), depois turmas sem data marcada.
    .sort((a, b) => {
      if (a.data && b.data) return String(a.data).localeCompare(String(b.data));
      if (a.data) return -1;
      if (b.data) return 1;
      return 0;
    });
}

// GET /api/membresia/totem/next/status?membro_id=X&email=Y&cpf=Z
// Retorna { inscrito: bool, inscricao?, proximo_evento? } (proximo_evento e
// inscricao.evento são "evento-like" a partir da turma · ver _turmaAbertaTotem).
// "inscrito = true" = a pessoa tem matrícula viva numa turma aberta (ou espera)
// e ainda não desistiu.
router.get('/totem/next/status', async (req, res) => {
  try {
    const { membro_id, email, cpf } = req.query;
    const turmas = await _turmasAbertasTotem();     // calendário (todas as abertas)
    const proxima = turmas[0] || null;              // a mais próxima
    // Material do Next (PDF) é opt-in do Marcos · botão só aparece quando ligado.
    const materialAtivo = !!process.env.WHATSAPP_TEMPLATE_NEXT_INFO;

    // Matrícula mais recente da pessoa (identidade membro_id/email/cpf)
    let q = supabase
      .from('next_matriculas')
      .select('id, nome, sobrenome, email, cpf, status, turma_id, turma:next_turmas(id, nome, status, horario)')
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(1);

    const filtros = [];
    if (membro_id) filtros.push(`membro_id.eq.${escapePostgrestValue(String(membro_id))}`);
    if (email) filtros.push(`email.eq.${escapePostgrestValue(String(email).toLowerCase().trim())}`);
    if (cpf) filtros.push(`cpf.eq.${String(cpf).replace(/\D/g, '')}`);
    if (filtros.length === 0) {
      return res.json({ inscrito: false, proximo_evento: proxima, proximas_turmas: turmas, material_ativo: materialAtivo });
    }
    q = q.or(filtros.join(','));

    const { data: mats } = await q;
    const mat = (mats || [])[0] || null;

    // Inscrito ativo · matrícula em turma aberta (ou fila de espera) e não desistiu
    const emTurmaViva = mat && (mat.turma_id == null || (mat.turma && mat.turma.status === 'aberta'));
    const ativo = !!(mat && emTurmaViva && mat.status !== 'desistiu');

    let inscricao = null;
    if (ativo) {
      let data = null;
      if (mat.turma_id) {
        const { data: enc } = await supabase.from('next_encontros')
          .select('data').eq('turma_id', mat.turma_id).eq('numero', 1).maybeSingle();
        data = enc?.data || null;
      }
      inscricao = { evento: { id: mat.turma_id, data, titulo: mat.turma?.nome || 'Lista de espera', horario: mat.turma?.horario || null } };
    }

    return res.json({ inscrito: ativo, inscricao, proximo_evento: proxima, proximas_turmas: turmas, material_ativo: materialAtivo });
  } catch (e) {
    console.error('[TOTEM] next/status error:', e.message);
    res.status(500).json({ error: 'Erro ao consultar status do NEXT' });
  }
});

// POST /api/membresia/totem/next/inscrever
// Body: { membro_id?, nome, sobrenome?, cpf?, telefone, email, data_nascimento?, observações? }
// Matricula na turma aberta do momento (next_matriculas). Porta guardada: sem
// membro_id, resolve/cria via matcher forte (não deixa órfão). Idempotente por
// (turma, cpf/email) via UNIQUE INDEX de next_matriculas.
router.post('/totem/next/inscrever', async (req, res) => {
  try {
    const {
      membro_id, nome, sobrenome, cpf, telefone, email,
      data_nascimento, observacoes, turma_id, sexo,
    } = req.body || {};

    if (!nome || String(nome).trim().length < 2) {
      return res.status(400).json({ error: 'Nome obrigatorio' });
    }
    // E-mail é OPCIONAL no Next do totem (só valida se veio) — muitos membros
    // não têm e-mail no cadastro e a inscrição do membro identificado é só uma
    // confirmação. O matcher liga a pessoa por membro_id/telefone.
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email))) {
      return res.status(400).json({ error: 'Email invalido' });
    }
    const cleanTel = String(telefone || '').replace(/\D/g, '');
    if (!cleanTel || cleanTel.length < 10) {
      return res.status(400).json({ error: 'Telefone invalido' });
    }
    const cleanCpf = cpf ? String(cpf).replace(/\D/g, '') : null;
    const cleanEmail = email ? String(email).toLowerCase().trim() : null;

    // Turma: a escolhida no calendário (validada contra as abertas) ou a mais próxima.
    const turmas = await _turmasAbertasTotem();
    if (!turmas.length) {
      return res.status(400).json({ error: 'Nenhuma turma do NEXT aberta no momento' });
    }
    const proxima = (turma_id && turmas.find((t) => t.id === turma_id)) || turmas[0];

    // Porta guardada · garante membro_id (matcher forte) quando o totem não manda
    let membroId = membro_id || null;
    if (!membroId) {
      try {
        const r = await acharOuCriarGuardado({
          cpf: cleanCpf, email: cleanEmail, telefone: cleanTel,
          nome: [nome, sobrenome].filter(Boolean).join(' '),
          dataNascimento: data_nascimento || null, status: 'visitante',
          origem: 'membresia_totem_next',
        });
        membroId = r.membro_id;
      } catch (e) { console.error('[TOTEM] next matcher:', e.message); }
    }

    // Snapshot pre-NEXT
    let jaBatizado = false, jaVoluntario = false;
    if (membroId) {
      const { data: m } = await supabase
        .from('mem_membros').select('batizado').eq('id', membroId).maybeSingle();
      jaBatizado = !!m?.batizado;
    }
    if (cleanCpf) {
      const { count } = await supabase
        .from('vol_profiles')
        .select('id', { count: 'exact', head: true })
        .eq('cpf', cleanCpf)
        .eq('allocation_status', 'active');
      if (count && count > 0) jaVoluntario = true;
    }

    const { error: insErr } = await supabase
      .from('next_matriculas')
      .insert({
        turma_id: proxima.id,
        nome: String(nome).trim(),
        sobrenome: sobrenome ? String(sobrenome).trim() : null,
        cpf: cleanCpf,
        telefone: cleanTel,
        email: cleanEmail,
        data_nascimento: data_nascimento || null,
        observacoes: observacoes ? String(observacoes).trim().slice(0, 1000) : null,
        membro_id: membroId,
        ja_batizado: jaBatizado,
        ja_voluntario: jaVoluntario,
        ...(sexo ? { sexo: String(sexo).trim().slice(0, 20) } : {}),
        origem: 'manual',
        registered_by: req.user?.id || null,
      })
      .select('id')
      .single();

    if (insErr) {
      if (insErr.code === '23505') {
        // Já matriculado nesta turma · idempotente
        return res.json({ ok: true, ja_inscrito: true, evento: proxima });
      }
      throw insErr;
    }

    try {
      await notificar({
        modulo: 'next',
        titulo: 'Nova inscrição no NEXT (via totem)',
        mensagem: `${nome} ${sobrenome || ''} (${cleanEmail || 'sem e-mail'}) se inscreveu pelo totem.`,
        link: '/ministerial/next',
      });
    } catch (e) {
      console.error('[TOTEM] next notificar error:', e.message);
    }

    // Confirmação por WhatsApp (fila). Nome do template FIXO no código (padrão
    // de grupos · gruposWhatsapp.js) com a env só como override — a equipe cria
    // o template na Meta com este nome e NÃO precisa mexer no Vercel.
    if (cleanTel) {
      try {
        const { enfileirar } = require('../services/whatsappFila');
        const dataFmt = proxima.data ? String(proxima.data).split('-').reverse().join('/') : 'a confirmar';
        enfileirar({
          telefone: cleanTel,
          template: process.env.WHATSAPP_TEMPLATE_NEXT_CONF || 'next_confirmacao',
          // {{1}} nome · {{2}} data · {{3}} horário
          params: [String(nome).split(' ')[0] || 'Olá', dataFmt, proxima.horario || 'a confirmar'],
          contexto: 'next_totem',
          refId: proxima.id,
        }).catch(() => {});
      } catch { /* fila indisponível · não bloqueia */ }
    }

    res.status(201).json({ ok: true, evento: proxima });
  } catch (e) {
    console.error('[TOTEM] next/inscrever error:', e.message);
    res.status(500).json({ error: 'Erro ao inscrever no NEXT: ' + e.message });
  }
});

// POST /api/membresia/totem/next/informacoes
// Body: { telefone, nome? } — quem não quer se inscrever agora pode pedir o
// material do NEXT no WhatsApp (template WHATSAPP_TEMPLATE_NEXT_INFO · header de
// documento com o PDF explicativo, aprovado na Meta). Via fila; no-op gracioso
// até o template existir. NÃO cria matrícula — é só o envio do material.
router.post('/totem/next/informacoes', async (req, res) => {
  try {
    const cleanTel = String(req.body?.telefone || '').replace(/\D/g, '');
    if (!cleanTel || cleanTel.length < 10) {
      return res.status(400).json({ error: 'Telefone invalido' });
    }
    const primeiroNome = String(req.body?.nome || '').trim().split(' ')[0] || 'Olá';
    // ⚠️ EXCEÇÃO ao padrão de nome fixo: o material do Next (PDF) é ideia do
    // Marcos ainda NÃO validada com os líderes da área. Fica atrás da env
    // WHATSAPP_TEMPLATE_NEXT_INFO — enquanto vazia, o botão nem aparece no totem
    // (ver next_material_ativo no /status) e aqui é no-op. Pra ligar: aprovar o
    // template na Meta e setar a env com o nome dele.
    const template = process.env.WHATSAPP_TEMPLATE_NEXT_INFO;
    if (!template) {
      return res.json({ ok: true, enviado: false, motivo: 'material_desativado' });
    }
    let enviado = false;
    try {
      const { enfileirar } = require('../services/whatsappFila');
      const r = await enfileirar({
        telefone: cleanTel,
        template,
        params: [primeiroNome],   // {{1}} nome · o PDF vai no header do template
        contexto: 'next_info_totem',
      });
      enviado = r.sent === true || r.queued === true;
    } catch (e) {
      console.error('[TOTEM] next/informacoes fila:', e.message);
    }
    res.json({ ok: true, enviado });
  } catch (e) {
    console.error('[TOTEM] next/informacoes error:', e.message);
    res.status(500).json({ error: 'Erro ao enviar informações do NEXT' });
  }
});

// ── Totem · Apresentação de Bebes ──
//
// Sempre 2 domingo do mês. Helper calcula a próxima data e retorna
// junto com o culto correspondente (se houver) e a apresentação
// existente do membro pra essa data (pra UI mostrar "já inscrito").
function _segundoDomingo(year, month0) {
  const first = new Date(year, month0, 1);
  const dow = first.getDay(); // 0=Dom
  const firstSundayDay = dow === 0 ? 1 : 8 - dow;
  return new Date(year, month0, firstSundayDay + 7);
}
function _proximoSegundoDomingo(refDate = new Date()) {
  const y = refDate.getFullYear();
  const m = refDate.getMonth();
  const ref = new Date(y, m, refDate.getDate()); // strip time
  const candidato = _segundoDomingo(y, m);
  if (candidato >= ref) return candidato;
  // Próximo mês
  const ny = m === 11 ? y + 1 : y;
  const nm = m === 11 ? 0 : m + 1;
  return _segundoDomingo(ny, nm);
}
function _fmtDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Regra do culto da apresentação (D3 · 09:30 primário, overflow 11:30 por
// limite · docs/cultos-domingo §12.1) — régua PURA, no gate de deploy.
const { escolherCultoApresentacao, rotuloHora } = require('../utils/criancaApresentacao');

// GET /api/membresia/totem/apresentacao-bebe/status?membro_id=X
// Retorna { proxima_data, horario_previsto?, horario_rotulo?, apresentacao_existente? }
router.get('/totem/apresentacao-bebe/status', async (req, res) => {
  try {
    const { membro_id } = req.query;
    const proxima = _proximoSegundoDomingo();
    const proximaStr = _fmtDate(proxima);

    // Cultos do dia (domingo manha) · informativo
    const { data: cultos } = await supabase
      .from('cultos')
      .select('id, data, service_type:vol_service_types(name, recurrence_time)')
      .eq('data', proximaStr)
      .is('deleted_at', null)
      .limit(5);

    // Horário previsto pela MESMA régua do POST — era o "às 10h" hardcoded na
    // tela, que ficaria errado depois do corte de 24/08 (o 10:00 encerra).
    const previsto = escolherCultoApresentacao(cultos || []);

    let apresentacao_existente = null;
    if (membro_id) {
      const { data } = await supabase
        .from('apresentacao_bebes')
        .select('id, bebe_nome, data_apresentacao, status')
        .eq('responsavel_membro_id', membro_id)
        .eq('data_apresentacao', proximaStr)
        .is('deleted_at', null)
        .maybeSingle();
      apresentacao_existente = data || null;
    }

    res.json({
      proxima_data: proximaStr,
      cultos: cultos || [],
      horario_previsto: previsto.hora,
      horario_rotulo: rotuloHora(previsto.hora),
      apresentacao_existente,
    });
  } catch (e) {
    console.error('[TOTEM] apresentacao-bebe/status error:', e.message);
    res.status(500).json({ error: 'Erro ao consultar apresentação de bebes' });
  }
});

// POST /api/membresia/totem/apresentacao-bebe
// Body: { responsavel_membro_id?, responsavel_nome, responsavel_telefone,
//         responsavel_email?, bebe_nome, bebe_data_nascimento, bebe_sexo?,
//         nome_pai?, nome_mae?, observações? }
router.post('/totem/apresentacao-bebe', async (req, res) => {
  try {
    const {
      responsavel_membro_id, responsavel_nome, responsavel_telefone, responsavel_email,
      responsavel_cpf, responsavel_relacao,
      bebe_nome, bebe_data_nascimento, bebe_sexo, nome_pai, nome_mae, observacoes,
      aceita_termos_menor,
    } = req.body || {};

    // Contrato de Inscrição no totem (sweep 28/07 — a porta gravava PII de
    // menor sem validação real nem consentimento registrado).
    const {
      validarNascimento: validarNascimentoContrato,
      temAbreviacaoNome: temAbrevContrato,
      registrarConsentimentos: registrarConsentimentosContrato,
    } = require('../services/inscricaoContrato');

    if (!responsavel_nome || String(responsavel_nome).trim().length < 2) {
      return res.status(400).json({ error: 'Nome do responsável obrigatório' });
    }
    const cleanTel = String(responsavel_telefone || '').replace(/\D/g, '');
    if (cleanTel.length < 10) {
      return res.status(400).json({ error: 'Telefone do responsável invalido' });
    }
    // CPF do responsável obrigatório (identidade da família · base pro vínculo
    // futuro com o Kids · lei do CPF como identidade global).
    const cleanCpfResp = String(responsavel_cpf || '').replace(/\D/g, '');
    if (!cpfValido(cleanCpfResp)) {
      return res.status(400).json({ error: 'CPF do responsável é obrigatório e precisa ser válido.' });
    }
    const bebeNomeLimpo = String(bebe_nome || '').trim().replace(/\s+/g, ' ');
    if (bebeNomeLimpo.split(' ').length < 2 || temAbrevContrato(bebeNomeLimpo)) {
      return res.status(400).json({ error: 'Escreva o nome completo do bebê (nome e sobrenome, sem abreviações)' });
    }
    if (!validarNascimentoContrato(bebe_data_nascimento)) {
      return res.status(400).json({ error: 'Data de nascimento do bebê inválida' });
    }
    // Sexo obrigatório (D8): aceita M/F do totem e o canônico → grava M/F
    // (vocabulário da coluna; 'outro' saiu da tela e não é aceito).
    const sexoMap = { M: 'M', F: 'F', masculino: 'M', feminino: 'F' };
    const cleanSexoBebe = sexoMap[String(bebe_sexo || '').trim()] || null;
    if (!cleanSexoBebe) {
      return res.status(400).json({ error: 'Selecione o sexo do bebê' });
    }
    if (!aceita_termos_menor) {
      return res.status(400).json({ error: 'É preciso aceitar a autorização de responsável (LGPD art. 14) para agendar' });
    }

    const proxima = _proximoSegundoDomingo();
    const proximaStr = _fmtDate(proxima);

    // Dedup no POST (antes só o GET /status avisava a UI): mesmo bebê, mesma
    // cerimônia, mesmo responsável → não cria segunda linha.
    const { data: jaAgendada } = await supabase
      .from('apresentacao_bebes')
      .select('id, bebe_nome')
      .eq('data_apresentacao', proximaStr)
      .eq('bebe_nome', bebeNomeLimpo)
      .eq('responsavel_telefone', cleanTel)
      .is('deleted_at', null)
      .limit(1);
    if (jaAgendada && jaAgendada.length) {
      return res.status(409).json({ error: `${bebeNomeLimpo} já está com a apresentação agendada para ${proximaStr.split('-').reverse().join('/')}.` });
    }

    // Culto da cerimônia: 09:30 primário com overflow pro 11:30 por LIMITE
    // (D3 · Marcos+Matheus 11/08 · docs/cultos-domingo §12.1). Bebês estão SEM
    // limite por enquanto (Marcos 12/08) ⇒ env vazia = nunca transborda; ligar
    // o overflow no futuro é setar APRESENTACAO_LIMITE_POR_CULTO, sem deploy
    // de regra. Antes do corte de 24/08 o 09:30 não existe e a régua cai no
    // 10:00 — comportamento IDÊNTICO ao atual até lá.
    // ⚠️ Sem candidato: agenda SEM culto (culto_id null) — o fallback antigo
    // "primeiro por horário" penduraria a cerimônia no fantasma de 08:30 (B9).
    let culto_id = null;
    let cultoHora = null;
    const { data: cultosDia } = await supabase
      .from('cultos')
      .select('id, service_type:vol_service_types(recurrence_time)')
      .eq('data', proximaStr)
      .is('deleted_at', null);
    const limiteApres = parseInt(process.env.APRESENTACAO_LIMITE_POR_CULTO || '', 10) || null;
    let contagemApres = null;
    if (limiteApres && cultosDia?.length) {
      // Contagem só quando há limite — cancelada não ocupa vaga.
      const { data: agendadas } = await supabase
        .from('apresentacao_bebes')
        .select('culto_id')
        .eq('data_apresentacao', proximaStr)
        .is('deleted_at', null)
        .neq('status', 'cancelada');
      contagemApres = {};
      for (const a of agendadas || []) {
        if (a.culto_id) contagemApres[a.culto_id] = (contagemApres[a.culto_id] || 0) + 1;
      }
    }
    const escolhido = escolherCultoApresentacao(cultosDia || [], {
      limite: limiteApres,
      contagem: contagemApres,
    });
    culto_id = escolhido.culto?.id || null;
    cultoHora = escolhido.hora;

    // Identidade da família: resolve/cria o membro do responsável pelo CPF
    // (matcher canônico) — sem isso a família não fica ligada pro Kids depois.
    let respMembroId = responsavel_membro_id || null;
    if (!respMembroId) {
      try {
        const r = await acharOuCriarGuardado({
          cpf: cleanCpfResp, telefone: cleanTel,
          email: responsavel_email ? String(responsavel_email).toLowerCase().trim() : null,
          nome: String(responsavel_nome).trim(),
          status: 'visitante', origem: 'apresentacao_bebe_totem',
        });
        respMembroId = r.membro_id;
      } catch (e) { console.error('[TOTEM] bebe matcher responsável:', e.message); }
    }

    const { data, error } = await supabase
      .from('apresentacao_bebes')
      .insert({
        responsavel_membro_id: respMembroId,
        responsavel_nome: String(responsavel_nome).trim(),
        responsavel_telefone: cleanTel,
        responsavel_email: responsavel_email
          ? String(responsavel_email).toLowerCase().trim() : null,
        bebe_nome: bebeNomeLimpo,
        bebe_data_nascimento,
        bebe_sexo: cleanSexoBebe,
        nome_pai: nome_pai ? String(nome_pai).trim() : null,
        nome_mae: nome_mae ? String(nome_mae).trim() : null,
        observacoes: observacoes ? String(observacoes).trim().slice(0, 1000) : null,
        data_apresentacao: proximaStr,
        culto_id,
        registrado_por: req.user?.id || null,
        // Colunas novas (migration 20260723233000) · condicional tolera ausência.
        ...(cleanCpfResp ? { responsavel_cpf: cleanCpfResp } : {}),
        ...(responsavel_relacao ? { responsavel_relacao: String(responsavel_relacao).trim().slice(0, 40) } : {}),
      })
      .select()
      .single();

    if (error) throw error;

    // Consentimento de MENOR (art. 14 §1º) na satélite — independente de
    // qualquer outro passo (padrão da porta pública pós-sweep 28/07).
    registrarConsentimentosContrato({
      porta: 'apresentacao', refId: data.id, membroId: respMembroId || null,
      ip: req.ip || null, userAgent: req.headers['user-agent'] || null,
      itens: [{ tipo: 'menor_responsavel', aceito: true }],
    }).catch((e) => console.error('[TOTEM] bebe consentimento:', e.message));

    try {
      await notificar({
        modulo: 'integracao',
        titulo: 'Apresentação de bebe agendada',
        mensagem: `${responsavel_nome} agendou apresentação de ${bebe_nome} para ${proximaStr}.`,
        link: '/integracao',
      });
    } catch (e) {
      console.error('[TOTEM] apresentacao-bebe notificar error:', e.message);
    }

    // Confirmação por WhatsApp (fila). Nome do template FIXO no código (padrão
    // de grupos) · env só override — sem precisar criar variável no Vercel.
    if (cleanTel) {
      try {
        const { enfileirar } = require('../services/whatsappFila');
        enfileirar({
          telefone: cleanTel,
          template: process.env.WHATSAPP_TEMPLATE_BEBE_CONF || 'apresentacao_bebes_confirmacao',
          // {{1}} responsável · {{2}} bebê · {{3}} data · {{4}} horário — o do
          // culto escolhido pela régua D3 (era '10:00' fixo; pós-corte 09:30).
          // ⚠️ Conferir na Meta se o CORPO do template cita "10h" fora do {{4}}
          // — se citar, é template _v2 (edição volta pra revisão e o envio para).
          params: [
            String(responsavel_nome).split(' ')[0] || 'Olá',
            String(bebe_nome).trim(),
            proximaStr.split('-').reverse().join('/'),
            cultoHora || 'a confirmar',
          ],
          contexto: 'apresentacao_bebe_totem',
          refId: data.id,
        }).catch(() => {});
      } catch { /* fila indisponível · não bloqueia */ }
    }

    // ── Cadastro único: registra a criança no Kids e liga ao responsável ──
    // Visão do Marcos: a apresentação já tem nome/nascimento da criança +
    // responsável identificado pelo CPF → a criança já entra no Kids e a mãe a
    // acha no totem Kids sem recadastrar. Presencial no lounge = mesmo modelo
    // do check-in (nasce visitante · pastoral confirma depois). Exige membro
    // real (o vínculo kids_responsaveis referencia mem_membros). NÃO herda
    // família (familia_id null · lei "criança nova não herda família"). Dedup
    // por responsável+nome+nascimento. Fail-open: nunca quebra a apresentação.
    if (respMembroId) {
      try {
        const bebeNome = String(bebe_nome).trim();
        const { data: jaResp } = await supabase
          .from('kids_responsaveis')
          .select('crianca:kids_criancas(id, nome, data_nascimento)')
          .eq('membro_id', respMembroId);
        const existente = (jaResp || [])
          .map((r) => r.crianca)
          .filter(Boolean)
          .find((c) => String(c.nome || '').trim().toLowerCase() === bebeNome.toLowerCase()
            && (!bebe_data_nascimento || !c.data_nascimento || c.data_nascimento === bebe_data_nascimento));
        if (!existente) {
          const PARENTESCO_KIDS = { mae: 'mae', pai: 'pai', avo: 'avo_a', tio: 'tio_a', responsavel: 'tutor', outro: 'outro' };
          const { data: novaCrianca, error: eKid } = await supabase
            .from('kids_criancas')
            .insert({
              nome: bebeNome,
              data_nascimento: bebe_data_nascimento || null,
              sexo: ['M', 'F', 'outro'].includes(bebe_sexo) ? bebe_sexo : null,
              visitante: true,
              created_by: req.user?.id || null,
            })
            .select('id')
            .single();
          if (!eKid && novaCrianca) {
            await supabase.from('kids_responsaveis').insert({
              crianca_id: novaCrianca.id,
              membro_id: respMembroId,
              parentesco: PARENTESCO_KIDS[responsavel_relacao] || 'outro',
              autorizado_buscar: true,
            });
          } else if (eKid) {
            console.error('[TOTEM] bebe→kids criança:', eKid.message);
          }
        }
      } catch (e) {
        console.error('[TOTEM] bebe→kids error:', e.message);
      }
    }

    res.status(201).json({ ok: true, apresentacao: data, data_apresentacao: proximaStr, horario_rotulo: rotuloHora(cultoHora) });
  } catch (e) {
    console.error('[TOTEM] apresentacao-bebe POST error:', e.message);
    res.status(500).json({ error: 'Erro ao agendar apresentação: ' + e.message });
  }
});

// POST /api/membresia/totem/membros/:id/foto — upload de foto via totem
router.post('/totem/membros/:id/foto', uploadMw.single('foto'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Imagem não fornecida' });
    const { id } = req.params;
    if (!podeEditarMembroTotem(req, id)) {
      return res.status(403).json({ error: 'Sem permissão para editar este cadastro' });
    }
    const ext = req.file.mimetype === 'image/png' ? 'png' : req.file.mimetype === 'image/webp' ? 'webp' : 'jpg';
    const path = `membros/${id}.${ext}`;
    const { error: upErr } = await supabase.storage
      .from('fotos-membros')
      .upload(path, req.file.buffer, { contentType: req.file.mimetype, upsert: true });
    if (upErr) throw upErr;
    const { data: urlData } = supabase.storage.from('fotos-membros').getPublicUrl(path);
    const foto_url = `${urlData.publicUrl}?t=${Date.now()}`;
    const { error: dbErr } = await supabase.from('mem_membros').update({ foto_url }).eq('id', id);
    if (dbErr) throw dbErr;
    res.json({ foto_url });
  } catch (e) {
    console.error('[TOTEM] foto upload error:', e.message);
    res.status(500).json({ error: `Erro ao enviar foto: ${e.message}` });
  }
});

// PATCH /api/membresia/grupo-membros/:id/sair — remover membro do grupo (marca saiu_em)
router.patch('/grupo-membros/:id/sair', authorize('admin', 'diretor'), async (req, res) => {
  try {
    const { motivo } = req.body || {};
    const { data, error } = await supabase
      .from('mem_grupo_membros')
      .update({ saiu_em: new Date().toISOString().slice(0, 10), motivo_saida: motivo || null })
      .eq('id', req.params.id)
      .select()
      .single();
    if (error) throw error;
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: 'Erro ao remover membro do grupo' });
  }
});

// ── Contribuições (Generosidade) ──

// GET /api/membresia/contribuicoes (lista com filtros)
router.get('/contribuicoes', authorizeModule('membros-financeiro', 2), async (req, res) => {
  try {
    const { membro_id, tipo, data_inicio, data_fim, limit } = req.query;
    let query = supabase
      .from('mem_contribuicoes')
      .select('*, membro:mem_membros(id, nome)')
      .order('data', { ascending: false });

    if (membro_id) query = query.eq('membro_id', membro_id);
    if (tipo) query = query.eq('tipo', tipo);
    if (data_inicio) query = query.gte('data', data_inicio);
    if (data_fim) query = query.lte('data', data_fim);
    if (limit) query = query.limit(Number(limit));

    const { data, error } = await query;
    if (error) throw error;
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: 'Erro ao buscar contribuições' });
  }
});

// POST /api/membresia/contribuicoes
router.post('/contribuicoes', authorize('admin', 'diretor'), async (req, res) => {
  try {
    const payload = {
      ...req.body,
      registrado_por: req.user.id,
      origem: req.body.origem || 'manual',
    };
    if (payload.campanha === '') delete payload.campanha;
    if (payload.forma_pagamento === '') delete payload.forma_pagamento;
    if (payload.referencia_externa === '') delete payload.referencia_externa;

    const { data, error } = await supabase
      .from('mem_contribuicoes')
      .insert(payload)
      .select('*, membro:mem_membros(id, nome)')
      .single();
    if (error) throw error;

    // Enfileira o agregado mensal (entity_id = 'YYYY-MM' da data da contribuição)
    if (data.data) {
      const yyyymm = String(data.data).slice(0, 7);
      enqueueSync('contribuicao-mes', yyyymm, 'upsert').catch(() => {});
    }

    res.status(201).json(data);
  } catch (e) {
    res.status(500).json({ error: 'Erro ao registrar contribuição' });
  }
});

// PUT /api/membresia/contribuicoes/:id
router.put('/contribuicoes/:id', authorize('admin', 'diretor'), async (req, res) => {
  try {
    const payload = { ...req.body };
    delete payload.registrado_por;
    const { data, error } = await supabase
      .from('mem_contribuicoes')
      .update(payload)
      .eq('id', req.params.id)
      .select()
      .single();
    if (error) throw error;
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: 'Erro ao atualizar contribuição' });
  }
});

// DELETE /api/membresia/contribuicoes/:id · soft-delete (preserva histórico financeiro)
router.delete('/contribuicoes/:id', authorize('admin', 'diretor'), async (req, res) => {
  try {
    const { error } = await supabase.rpc('app_soft_delete', {
      p_table_name: 'mem_contribuicoes',
      p_row_id: req.params.id,
      p_deleted_by: req.user?.id ?? null,
    });
    if (error) throw error;
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'Erro ao remover contribuição' });
  }
});

// GET /api/membresia/contribuicoes/kpis — agregados gerais
router.get('/contribuicoes/kpis', async (req, res) => {
  try {
    const hoje = new Date();
    const anoAtual = hoje.getFullYear();

    // Leituras paginadas: mem_contribuicoes (20k+ linhas · 3k+ só no ano) e
    // mem_membros (3,6k ativos) passam do cap server-side de 1000 do PostgREST
    // — o select cru truncava os totais em silêncio. E o .in() com a lista
    // inteira de membros estoura a URL do request e falha silencioso (a
    // classificação por nível saía do nada). Tudo agora pagina e cruza em JS.
    const PAGE = 1000;
    const fetchTudo = async (montar) => {
      const out = [];
      for (let offset = 0; ; offset += PAGE) {
        const { data, error } = await montar().order('id').range(offset, offset + PAGE - 1);
        if (error) throw error;
        out.push(...(data || []));
        if (!data || data.length < PAGE) break;
      }
      return out;
    };

    // Totais do ano por tipo
    const contribsAno = await fetchTudo(() => supabase
      .from('mem_contribuicoes')
      .select('tipo, valor, data, membro_id')
      .gte('data', `${anoAtual}-01-01`));

    const totais = { dizimo: 0, oferta: 0, campanha: 0, total: 0 };
    const contribuintesAno = new Set();
    contribsAno.forEach(c => {
      const v = Number(c.valor) || 0;
      totais[c.tipo] = (totais[c.tipo] || 0) + v;
      totais.total += v;
      if (c.membro_id) contribuintesAno.add(c.membro_id);
    });

    // Classificação por nível (ativo/irregular/inativo) considerando TODOS os
    // membros ativos. A última contribuição por membro sai de uma varredura
    // paginada da tabela inteira (histórico completo, não só do ano).
    const [todosMembros, todasContribs] = await Promise.all([
      fetchTudo(() => supabase
        .from('mem_membros')
        .select('id')
        .eq('active', true)
        .is('deleted_at', null)),
      fetchTudo(() => supabase
        .from('mem_contribuicoes')
        .select('membro_id, data')),
    ]);

    const ultimaPorMembro = new Map();
    todasContribs.forEach(c => {
      if (!c.membro_id || !c.data) return;
      const atual = ultimaPorMembro.get(c.membro_id);
      if (!atual || c.data > atual) ultimaPorMembro.set(c.membro_id, c.data);
    });

    const niveis = { ativo: 0, irregular: 0, inativo: 0, nunca_contribuiu: 0 };
    todosMembros.forEach(m => {
      const n = calcularNivelGenerosidade(ultimaPorMembro.get(m.id));
      niveis[n] = (niveis[n] || 0) + 1;
    });

    res.json({
      ano: anoAtual,
      totais,
      niveis,
      contribuintes_unicos_ano: contribuintesAno.size,
    });
  } catch (e) {
    res.status(500).json({ error: 'Erro ao buscar KPIs de contribuições' });
  }
});

// ══════════════════════════════════════════════════════════════
// Ministérios / Voluntariado / Escalas / Check-ins
// ══════════════════════════════════════════════════════════════

// ── Ministérios ──

router.get('/ministerios', async (req, res) => {
  try {
    const { ativo } = req.query;
    let query = supabase
      .from('mem_ministerios')
      .select('*, lider:mem_membros!lider_id(id, nome), voluntarios:mem_voluntarios(id, ate)')
      .order('nome');
    if (ativo === 'true') query = query.eq('ativo', true);
    if (ativo === 'false') query = query.eq('ativo', false);

    const { data, error } = await query;
    if (error) throw error;

    const withCount = (data || []).map(m => ({
      ...m,
      total_voluntarios: (m.voluntarios || []).filter(v => !v.ate).length,
    }));
    res.json(withCount);
  } catch (e) {
    res.status(500).json({ error: 'Erro ao buscar ministérios' });
  }
});

router.get('/ministerios/:id', async (req, res) => {
  try {
    const { data: ministerio, error } = await supabase
      .from('mem_ministerios')
      .select('*, lider:mem_membros!lider_id(id, nome)')
      .eq('id', req.params.id)
      .single();
    if (error) throw error;

    const { data: voluntarios } = await supabase
      .from('mem_voluntarios')
      .select('*, membro:mem_membros(id, nome, status, telefone)')
      .eq('ministerio_id', ministerio.id)
      .order('desde', { ascending: false });

    const ativos = (voluntarios || []).filter(v => !v.ate);
    const historico = (voluntarios || []).filter(v => v.ate);

    res.json({ ...ministerio, ativos, historico });
  } catch (e) {
    res.status(500).json({ error: 'Erro ao buscar ministério' });
  }
});

router.post('/ministerios', authorize('admin', 'diretor'), async (req, res) => {
  try {
    const payload = { ...req.body };
    if (payload.lider_id === '') delete payload.lider_id;
    const { data, error } = await supabase.from('mem_ministerios').insert(payload).select().single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (e) {
    res.status(500).json({ error: 'Erro ao criar ministério' });
  }
});

router.put('/ministerios/:id', authorize('admin', 'diretor'), async (req, res) => {
  try {
    const payload = { ...req.body };
    if (payload.lider_id === '') payload.lider_id = null;
    const { data, error } = await supabase.from('mem_ministerios').update(payload).eq('id', req.params.id).select().single();
    if (error) throw error;
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: 'Erro ao atualizar ministério' });
  }
});

router.delete('/ministerios/:id', authorize('admin', 'diretor'), async (req, res) => {
  try {
    const { error } = await supabase.from('mem_ministerios').update({ ativo: false }).eq('id', req.params.id);
    if (error) throw error;
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'Erro ao desativar ministério' });
  }
});

// ── Voluntários (membro × ministério) ──

router.post('/voluntarios', authorize('admin', 'diretor'), async (req, res) => {
  try {
    const payload = { ...req.body };
    if (payload.papel === '') delete payload.papel;
    const { data, error } = await supabase
      .from('mem_voluntarios')
      .insert(payload)
      .select('*, ministerio:mem_ministerios(id, nome, cor), membro:mem_membros(id, nome)')
      .single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (e) {
    res.status(500).json({ error: 'Erro ao cadastrar voluntário' });
  }
});

router.patch('/voluntarios/:id/sair', authorize('admin', 'diretor'), async (req, res) => {
  try {
    const { motivo } = req.body || {};
    const { data, error } = await supabase
      .from('mem_voluntarios')
      .update({ ate: new Date().toISOString().slice(0, 10), motivo_saida: motivo || null })
      .eq('id', req.params.id)
      .select()
      .single();
    if (error) throw error;
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: 'Erro ao registrar saída do voluntário' });
  }
});

router.put('/voluntarios/:id', authorize('admin', 'diretor'), async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('mem_voluntarios')
      .update(req.body)
      .eq('id', req.params.id)
      .select()
      .single();
    if (error) throw error;
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: 'Erro ao atualizar voluntário' });
  }
});

// ── Escalas ──

router.get('/escalas', async (req, res) => {
  try {
    const { membro_id, ministerio_id, data_inicio, data_fim, limit } = req.query;
    let query = supabase
      .from('mem_escalas')
      .select('*, ministerio:mem_ministerios(id, nome, cor), membro:mem_membros(id, nome)')
      .order('data', { ascending: false });
    if (membro_id) query = query.eq('membro_id', membro_id);
    if (ministerio_id) query = query.eq('ministerio_id', ministerio_id);
    if (data_inicio) query = query.gte('data', data_inicio);
    if (data_fim) query = query.lte('data', data_fim);
    if (limit) query = query.limit(Number(limit));

    const { data, error } = await query;
    if (error) throw error;
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: 'Erro ao buscar escalas' });
  }
});

router.post('/escalas', authorize('admin', 'diretor'), async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('mem_escalas')
      .insert(req.body)
      .select('*, ministerio:mem_ministerios(id, nome, cor), membro:mem_membros(id, nome)')
      .single();
    if (error) {
      if (error.code === '23505') {
        return res.status(409).json({ error: 'Este membro já está escalado neste culto' });
      }
      throw error;
    }
    res.status(201).json(data);
  } catch (e) {
    res.status(500).json({ error: 'Erro ao criar escala' });
  }
});

router.put('/escalas/:id', authorize('admin', 'diretor'), async (req, res) => {
  try {
    const { data, error } = await supabase.from('mem_escalas').update(req.body).eq('id', req.params.id).select().single();
    if (error) throw error;
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: 'Erro ao atualizar escala' });
  }
});

router.delete('/escalas/:id', authorize('admin', 'diretor'), async (req, res) => {
  try {
    const { error } = await supabase.from('mem_escalas').delete().eq('id', req.params.id);
    if (error) throw error;
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'Erro ao remover escala' });
  }
});

// ── Check-ins ──
// Estrutura pronta para integração com sistema de check-in futuro.
// Por enquanto, permite registro manual para testes.

router.get('/checkins', async (req, res) => {
  try {
    const { membro_id, ministerio_id, data_inicio, data_fim, limit } = req.query;
    let query = supabase
      .from('mem_checkins')
      .select('*, ministerio:mem_ministerios(id, nome, cor), membro:mem_membros(id, nome)')
      .order('data', { ascending: false });
    if (membro_id) query = query.eq('membro_id', membro_id);
    if (ministerio_id) query = query.eq('ministerio_id', ministerio_id);
    if (data_inicio) query = query.gte('data', data_inicio);
    if (data_fim) query = query.lte('data', data_fim);
    if (limit) query = query.limit(Number(limit));

    const { data, error } = await query;
    if (error) throw error;
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: 'Erro ao buscar check-ins' });
  }
});

router.post('/checkins', authorize('admin', 'diretor'), async (req, res) => {
  try {
    const payload = {
      ...req.body,
      registrado_por: req.user.id,
      origem: req.body.origem || 'manual',
    };
    const { data, error } = await supabase
      .from('mem_checkins')
      .insert(payload)
      .select('*, ministerio:mem_ministerios(id, nome, cor), membro:mem_membros(id, nome)')
      .single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (e) {
    res.status(500).json({ error: 'Erro ao registrar check-in' });
  }
});

router.delete('/checkins/:id', authorize('admin', 'diretor'), async (req, res) => {
  try {
    const { error } = await supabase.from('mem_checkins').delete().eq('id', req.params.id);
    if (error) throw error;
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'Erro ao remover check-in' });
  }
});

// ══════════════════════════════════════════════════════════════════════════
//  CENSO · cobertura (quem já respondeu / quem falta)
//
// É a pergunta que DEFINE um censo e que nenhuma tela respondia: o módulo de
// Inscrições conta inscrições e o formulário de membresia conta submissões —
// nenhum dos dois sabe dizer quantas pessoas da base ainda faltam.
//
// ⚠️ TODO número sai com a JANELA colada nele (payload e rótulo da tela). Já
//    reportei "176 pessoas" sem dizer o período uma vez e o número correto
//    pareceu errado — a janela é parte do número, não um detalhe.
// ══════════════════════════════════════════════════════════════════════════

// Nome-placeholder do import financeiro ("Contribuinte 059412...") — espelha
// `ehNomePlaceholder` do membroMatch. Não é pessoa, então não entra no
// denominador do censo (senão a cobertura nasce artificialmente baixa).
const CENSO_PLACEHOLDER = 'contribuinte%';

// Base viva do censo: pessoa ativa, não deletada e com nome de gente.
// `soMembros` recorta em `status='membro_ativo'`.
// ⚠️ Os DOIS recortes vão no payload de propósito. "Cobertura de quem?" não é
// pergunta técnica: a base viva inclui ~2.9 mil `visitante` (gente que responde
// o censo no culto, e deve responder) e a membresia formal é bem menor. Escolher
// um só faria o painel afirmar uma definição que é da liderança, não minha — e
// "quem falta" com 3 mil visitantes é lista de cobrança inútil, enquanto só-
// membros esconde metade de quem respondeu.
function queryBaseCenso(select, opts, soMembros = false) {
  let q = supabase
    .from('mem_membros')
    .select(select, opts)
    .eq('active', true)
    .is('deleted_at', null)
    .not('nome', 'ilike', CENSO_PLACEHOLDER);
  if (soMembros) q = q.eq('status', 'membro_ativo');
  return q;
}

function censoSchemaAusente(error) {
  if (!error) return false;
  return error.code === '42703'
    || /column .* does not exist/i.test(error.message || '')
    || /could not find the .* column/i.test(error.message || '');
}

// GET /api/membresia/censo/cobertura?desde=YYYY-MM-DD
router.get('/censo/cobertura', authorizeModule('membresia', 1), async (req, res) => {
  try {
    // ── Submissões do censo (colunas pequenas · paginado pelo cap de 1000) ──
    // Uma leitura paginada em vez de 6 COUNTs: com os mesmos bytes sai também o
    // recorte por vínculo e a curva por dia.
    const PAGE = 1000;
    const linhas = [];
    let offset = 0;
    let schemaOk = true;
    for (;;) {
      let q = supabase
        .from('mem_cadastros_pendentes')
        .select('created_at, status, duplicado_de_id, vinculo_declarado, censo_conflitos')
        .eq('censo', true)
        .order('created_at', { ascending: true })
        .range(offset, offset + PAGE - 1);
      if (req.query.desde) q = q.gte('created_at', req.query.desde);

      const { data, error } = await q;
      if (error) {
        if (censoSchemaAusente(error)) { schemaOk = false; break; }
        throw error;
      }
      linhas.push(...(data || []));
      if (!data || data.length < PAGE) break;
      offset += PAGE;
    }

    if (!schemaOk) {
      return res.json({
        disponivel: false,
        aviso: 'A parte 1 da migration do censo (20260803160000 · mem_cadastros_pendentes) ainda não foi aplicada — o painel de cobertura fica indisponível até lá. O formulário público continua funcionando.',
      });
    }

    // ── Base e respondentes (COUNT no banco · nenhuma linha transferida) ──
    const [rBase, rResp, rMemb, rMembResp] = await Promise.all([
      queryBaseCenso('id', { count: 'exact', head: true }),
      queryBaseCenso('id', { count: 'exact', head: true }).not('censo_respondido_em', 'is', null),
      queryBaseCenso('id', { count: 'exact', head: true }, true),
      queryBaseCenso('id', { count: 'exact', head: true }, true).not('censo_respondido_em', 'is', null),
    ]);
    // As colunas de mem_membros vêm da MESMA migration das de pendentes, mas
    // uma aplicação parcial não pode virar "0% de cobertura" (número errado é
    // pior que número ausente).
    if (censoSchemaAusente(rBase.error) || censoSchemaAusente(rResp.error)) {
      return res.json({
        disponivel: false,
        aviso: 'Falta a parte 2 da migration do censo (20260803160100 · mem_membros) — as colunas de cobertura ainda não existem. Aplique-a numa colagem separada da parte 1.',
      });
    }
    if (rBase.error) throw rBase.error;
    if (rResp.error) throw rResp.error;

    const total = rBase.count || 0;
    const jaResponderam = rResp.count || 0;
    const totalMembros = rMemb.count || 0;
    const respMembros = rMembResp.count || 0;
    const recorte = (t, r) => ({
      total: t, respondidos: r, faltando: Math.max(0, t - r),
      pct: t ? Math.round((r / t) * 1000) / 10 : 0,
    });

    let novos = 0, comConflito = 0, aplicados = 0, aRevisar = 0;
    const porVinculo = { membro: 0, congregado: 0, visitante: 0, nao_informado: 0 };
    const porDia = new Map();
    const pessoasCasadas = new Set();

    for (const l of linhas) {
      if (l.duplicado_de_id) pessoasCasadas.add(l.duplicado_de_id);
      else novos += 1;

      if (Array.isArray(l.censo_conflitos) && l.censo_conflitos.length) comConflito += 1;
      if (l.status === 'aplicado') aplicados += 1;
      // Fila humana de verdade: o que ainda espera decisão.
      if (l.status === 'pendente' || l.status === 'duplicado') aRevisar += 1;

      const v = l.vinculo_declarado || 'nao_informado';
      if (porVinculo[v] === undefined) porVinculo[v] = 0;
      porVinculo[v] += 1;

      // Dia em BRT: `created_at` é UTC e às 21h do Rio o dia UTC já virou —
      // sem o deslocamento a curva joga o culto da noite pro dia seguinte.
      const dia = new Date(new Date(l.created_at).getTime() - 3 * 3600 * 1000)
        .toISOString().slice(0, 10);
      porDia.set(dia, (porDia.get(dia) || 0) + 1);
    }

    const desde = req.query.desde
      || (linhas.length ? String(linhas[0].created_at).slice(0, 10) : null);

    res.json({
      disponivel: true,
      // A janela vai NO PAYLOAD pra tela poder rotular o número.
      janela: { desde, ate: new Date().toISOString().slice(0, 10) },
      // `base` = todo mundo ativo (inclui visitante) · `membros` = só membro_ativo
      base: recorte(total, jaResponderam),
      membros: recorte(totalMembros, respMembros),
      submissoes: {
        // pedidos × PESSOAS: quem preenche 2× conta 1 pessoa (a mesma régua de
        // vínculo × pessoa dos Grupos). Sem isso o total infla e não bate com a
        // cobertura.
        total: linhas.length,
        pessoas_ja_cadastradas: pessoasCasadas.size,
        novos,
        aplicados,
        com_conflito: comConflito,
        a_revisar: aRevisar,
      },
      por_vinculo: porVinculo,
      por_dia: [...porDia.entries()].map(([dia, total_dia]) => ({ dia, total: total_dia })),
    });
  } catch (e) {
    console.error('[CENSO cobertura]', e.message);
    res.status(500).json({ error: 'Erro ao calcular a cobertura do censo' });
  }
});

// GET /api/membresia/censo/faltantes?q=&limit=&offset=
// Lista nominal de quem ainda NÃO respondeu — é a fila de cobrança.
// Nível 2: carrega nome + telefone (a cobertura agregada é nível 1).
router.get('/censo/faltantes', authorizeModule('membresia', 2), async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 100, 500);
    const offset = Math.max(parseInt(req.query.offset) || 0, 0);
    const q = (req.query.q || '').toString().trim();

    // `recorte=membros` restringe a fila de cobrança à membresia formal — é o
    // uso real ("quem da membresia ainda não respondeu"), sem os visitantes.
    const soMembros = req.query.recorte === 'membros';
    let query = queryBaseCenso('id, nome, telefone, email, status', { count: 'exact' }, soMembros)
      .is('censo_respondido_em', null)
      .order('nome', { ascending: true })
      .range(offset, offset + limit - 1);
    if (q.length >= 2) query = query.ilike('nome', `%${escapePostgrestValue(q)}%`);

    const { data, error, count } = await query;
    if (error) {
      if (censoSchemaAusente(error)) {
        return res.json({
          disponivel: false, items: [], total: 0,
          aviso: 'Falta a parte 2 da migration do censo (20260803160100 · mem_membros).',
        });
      }
      throw error;
    }
    res.json({ disponivel: true, items: data || [], total: count || 0, limit, offset });
  } catch (e) {
    console.error('[CENSO faltantes]', e.message);
    res.status(500).json({ error: 'Erro ao listar quem falta responder' });
  }
});

// ── CENSO · disparo do convite (WhatsApp + e-mail) ─────────────────────────
//
// Pedido do Matheus (04/08): convidar quem NÃO tem CPF cadastrado, mas tem
// celular ou e-mail, a atualizar os dados pelo link do cadastro de membresia.
// A régua inteira (público, teto da Meta, quem já foi convidado) vive em
// services/censoDisparo.js — aqui só ficam autorização e forma da resposta.

// GET /api/membresia/censo/disparo/preview?status=&canais=&reenviar=
// Nível 2: a prévia é agregada, mas diz quantas pessoas seriam alcançadas.
router.get('/censo/disparo/preview', authorizeModule('membresia', 2), async (req, res) => {
  try {
    const prev = await censoDisparo.previewCenso({
      status: parseStatusCenso(req.query.status),
      canais: parseCanaisCenso(req.query.canais),
      reenviar: req.query.reenviar === '1' || req.query.reenviar === 'true',
      // Reforço deliberado: manda pelo 2º canal pra quem já foi convidado no 1º.
      permitirCanalCruzado: req.query.cruzado === '1' || req.query.cruzado === 'true',
    });
    res.json(prev);
  } catch (e) {
    console.error('[CENSO disparo preview]', e.message);
    res.status(500).json({ error: 'Erro ao montar a prévia do disparo' });
  }
});

// GET /api/membresia/censo/disparo/resultado
// Resultado da CAMPANHA por rodada + quem respondeu (nominal).
//
// ⚠️ Mede a campanha, NÃO a igreja. O painel de cobertura tem a base inteira no
//    denominador (uma rodada de 200 com 7 respostas aparece como 0,1%) e conta
//    RESPOSTA, não CPF — foi por isso que o CPF ficou sendo descartado por um
//    bug sem ninguém perceber: o número que a tela mostrava subia igual.
//
// Nível 2: a lista carrega nome e e-mail. ⚠️ CPF NÃO viaja — só o booleano de
// "tem CPF agora", que é o que a tela precisa saber.
router.get('/censo/disparo/resultado', authorizeModule('membresia', 2), async (req, res) => {
  try {
    const { data: rodadas, error } = await supabase
      .from('vw_censo_campanha')
      .select('*')
      .order('rodada', { ascending: false });
    if (error) {
      if (censoSchemaAusente(error) || error.code === '42P01') {
        return res.json({ disponivel: false, rodadas: [], responderam: [], aviso: 'A view vw_censo_campanha ainda não foi criada.' });
      }
      throw error;
    }

    // Quem respondeu, para a tela poder mostrar nome. Paginado pelo cap de 1000.
    const PAGE = 1000;
    const convites = [];
    for (let off = 0; ; off += PAGE) {
      const { data, error: eC } = await supabase
        .from('mem_censo_convites')
        .select('membro_id, canal, rodada, enviado_em, ok')
        .eq('ok', true)
        .range(off, off + PAGE - 1);
      if (eC) throw eC;
      if (!data?.length) break;
      convites.push(...data);
      if (data.length < PAGE) break;
    }

    // Quem está com CPF em CONFLITO: informou, e o CPF pertence a outro
    // cadastro. ⚠️ Sem isso a tela dizia só "sem CPF" e lia-se "a pessoa não
    // preencheu" — quando o CPF é obrigatório no formulário e ela preencheu.
    // Confundir "não informou" com "informamos e seguramos de propósito" faz a
    // equipe procurar problema no lugar errado (e duvidar do formulário).
    const emConflito = new Set();
    {
      const { data: pend } = await supabase
        .from('identidade_pendencias')
        .select('membro_id')
        .eq('status', 'pendente')
        .in('origem', ['censo_link_pessoal', 'censo_formulario']);
      for (const p of pend || []) if (p.membro_id) emConflito.add(p.membro_id);
    }

    const responderam = [];
    for (let i = 0; i < convites.length; i += 200) {
      const lote = convites.slice(i, i + 200);
      const { data: membros } = await supabase
        .from('mem_membros')
        .select('id, nome, email, cpf, censo_respondido_em')
        .in('id', lote.map(c => c.membro_id))
        .is('deleted_at', null)
        .not('censo_respondido_em', 'is', null);
      for (const m of membros || []) {
        const c = lote.find(x => x.membro_id === m.id);
        if (!c || !(m.censo_respondido_em >= c.enviado_em)) continue;
        const temCpf = String(m.cpf || '').replace(/\D/g, '').length === 11;
        responderam.push({
          nome: m.nome,
          email: m.email,
          rodada: c.rodada,
          canal: c.canal,
          respondeu_em: m.censo_respondido_em,
          tem_cpf: temCpf,
          // 'com_cpf' | 'conflito' (informou, CPF é de outro cadastro) |
          // 'sem_cpf' (não veio CPF — não deveria acontecer, é obrigatório)
          cpf_situacao: temCpf ? 'com_cpf' : (emConflito.has(m.id) ? 'conflito' : 'sem_cpf'),
        });
      }
    }
    responderam.sort((a, b) => String(b.respondeu_em).localeCompare(String(a.respondeu_em)));

    res.json({ disponivel: true, rodadas: rodadas || [], responderam });
  } catch (e) {
    console.error('[CENSO resultado]', e.message);
    res.status(500).json({ error: 'Erro ao carregar o resultado da campanha' });
  }
});

// GET /api/membresia/censo/disparo/preview-email
// Renderiza o e-mail EXATAMENTE como ele sai (mesma função `corpoEmail` do
// disparo — não uma imitação, senão a prévia mente).
//
// ⚠️ O link do exemplo leva um token FALSO de propósito. Devolver um token
//    válido de alguém real transformaria a prévia num vazamento: quem abrisse a
//    tela veria um link que abre o cadastro daquela pessoa.
router.get('/censo/disparo/preview-email', authorizeModule('membresia', 2), async (req, res) => {
  try {
    const nome = String(req.query.nome || 'Maria').trim() || 'Maria';
    const base = String(process.env.FRONTEND_URL || 'https://cbrio.org').replace(/\/+$/, '');
    const { subject, html, text } = censoDisparo.corpoEmail({
      nome,
      link: `${base}/cadastro-membresia?censo=1&t=exemplo0000000000000000000000000.00000000000000000000`,
      destinatario: 'pessoa@exemplo.com',
    });
    res.json({ assunto: subject, html, texto: text });
  } catch (e) {
    console.error('[CENSO preview-email]', e.message);
    res.status(500).json({ error: 'Erro ao montar a prévia do e-mail' });
  }
});

// POST /api/membresia/censo/disparo
// ⚠️ Nível 4 (não 3): é envio em MASSA para fora, no número institucional da
//    igreja, e cada destinatário consome cota do TIER_250 da Meta. Editar
//    cadastro é 3; falar com 200 pessoas de uma vez é outra ordem de risco.
router.post('/censo/disparo', authorizeModule('membresia', 4), async (req, res) => {
  try {
    const r = await censoDisparo.dispararCenso({
      status: parseStatusCenso(req.body?.status),
      canais: parseCanaisCenso(req.body?.canais),
      reenviar: req.body?.reenviar === true,
      permitirCanalCruzado: req.body?.permitirCanalCruzado === true,
      por: req.user?.id || null,
    });
    if (r.ok === false) return res.status(409).json(r);
    res.json(r);
  } catch (e) {
    console.error('[CENSO disparo]', e.message);
    res.status(500).json({ error: 'Erro ao disparar o convite do censo' });
  }
});

// `status` vem da tela como CSV. Default membro_ativo: é o público que a igreja
// tem relação com, e o que caberia numa rodada. Visitante entra só se pedido
// explicitamente (são ~1.800 pessoas, semanas de disparo no tier atual).
function parseStatusCenso(raw) {
  const PERMITIDOS = new Set(['membro_ativo', 'visitante', 'congregado', 'contribuinte_avulso']);
  const lista = String(raw || '')
    .split(',').map(s => s.trim()).filter(s => PERMITIDOS.has(s));
  return lista.length ? lista : ['membro_ativo'];
}

function parseCanaisCenso(raw) {
  const PERMITIDOS = new Set(['whatsapp', 'email']);
  const lista = String(raw ?? 'whatsapp,email')
    .split(',').map(s => s.trim()).filter(s => PERMITIDOS.has(s));
  return lista.length ? lista : ['whatsapp', 'email'];
}

// ── Cadastros pendentes (fila de aprovação do formulário público) ──

// GET /api/membresia/cadastros — lista cadastros pendentes (filtro por status)
router.get('/cadastros', async (req, res) => {
  try {
    const { status } = req.query;
    // duplicado_de e membro referenciam mem_membros — nomeamos os embeds pela FK.
    let query = supabase
      .from('mem_cadastros_pendentes')
      .select('*, duplicado_de:duplicado_de_id(id, nome), membro:membro_id(id, nome)')
      .order('created_at', { ascending: false });
    if (status) query = query.eq('status', status);
    const { data, error } = await query;
    if (error) throw error;
    // `prontidao` viaja na lista pra tela poder pintar quem entra na aprovação
    // em massa e por que alguém ficou de fora. ⚠️ É informativo: quem decide de
    // verdade é o servidor, que reavalia a linha no `aprovar-lote`.
    res.json((data || []).map((c) => ({ ...c, prontidao: avaliarProntidao(c) })));
  } catch (e) {
    console.error('[CADASTROS] list error:', e.message);
    res.status(500).json({ error: 'Erro ao buscar cadastros pendentes' });
  }
});

// GET /api/membresia/cadastros/kpis — contadores por status
// ⚠️ COUNT no banco (head: true), um por status. Era `.select('status')` sem
// paginação: o PostgREST capa em 1000 linhas server-side, então a partir da
// 1001ª submissão os contadores CONGELAVAM em silêncio — e o censo passa de
// 1000 no primeiro domingo. Nenhuma linha é transferida aqui.
const STATUS_CADASTRO = ['pendente', 'aprovado', 'rejeitado', 'duplicado', 'aplicado'];
router.get('/cadastros/kpis', async (req, res) => {
  try {
    const counts = {};
    const resultados = await Promise.all(STATUS_CADASTRO.map(async (status) => {
      const { count, error } = await supabase
        .from('mem_cadastros_pendentes')
        .select('id', { count: 'exact', head: true })
        .eq('status', status);
      // 'aplicado' só existe no CHECK depois da migration do censo — status
      // inexistente devolve 0, não derruba o painel.
      if (error) {
        console.warn('[CADASTROS kpis]', status, error.message);
        return [status, 0];
      }
      return [status, count || 0];
    }));
    for (const [status, n] of resultados) counts[status] = n;
    res.json(counts);
  } catch (e) {
    res.status(500).json({ error: 'Erro ao buscar KPIs de cadastros' });
  }
});

// ⚠️ NÚCLEO da aprovação — usado pela rota individual E pela aprovação em massa.
// Extraído (não duplicado) pelo mesmo motivo do `aprovarPedidoCore` dos Grupos:
// duas cópias desta lógica divergiriam, e o que ela faz é CRIAR PESSOA no
// sistema (matcher canônico, opt-in, histórico). Nunca escreve em `res`.
//
// @returns {{ok:true, membro, atualizacao:boolean}} | {{ok:false, status, error}}
async function aprovarCadastroCore({
  cad, familia_id: reqFamiliaId, parentesco, observacoes, userId,
  notificarIndividual = true,
}) {
  try {
    const id = cad.id;
    if (cad.status === 'aprovado') {
      return { ok: false, status: 400, error: 'Cadastro já foi aprovado.' };
    }
    // Censo já reconciliado: o reconciliador preencheu os campos vazios e não
    // sobrou divergência. Aprovar de novo faria o caminho de ATUALIZAÇÃO
    // reaplicar o formulário inteiro sobre o cadastro — inclusive por cima de
    // valor que a equipe pode ter corrigido depois. A linha fica só como prova.
    if (cad.status === 'aplicado') {
      return {
        ok: false, status: 400,
        error: 'Este cadastro do censo já foi aplicado automaticamente ao cadastro existente. Não há nada a aprovar.',
      };
    }

    // Família: prioriza a escolhida no modal, senão usa sugestão do formulário público
    const familia_id = reqFamiliaId || cad.familia_sugerida_id || null;

    // Observação "Como conheceu" vai para observações (mem_membros não tem esse campo).
    const obsAuto = [
      cad.como_conheceu ? `Como conheceu: ${cad.como_conheceu}` : null,
      observacoes || cad.observacoes,
    ].filter(Boolean).join('\n');

    let membro = null;
    let foiAtualizacao = false;

    // Helper: monta objeto apenas com campos não-nulos do cadastro
    function pickNonNull(src, keys) {
      const out = {};
      for (const k of keys) {
        if (src[k] !== null && src[k] !== undefined && src[k] !== '') out[k] = src[k];
      }
      return out;
    }

    // Campos que PODEM existir em mem_membros (depende de quais migrations rodaram).
    // Se PostgREST reclamar de coluna ausente, retiramos e tentamos de novo.
    // ⚠️ `genero` entrou em 18/08. Ele FALTAVA aqui, e a aprovação perdia o sexo
    // que o cadastro pendente já tinha: casos reais Janice Pinto e Aline Adão da
    // Fonseca, aprovadas em lote em 12/08 02:36 com `genero: feminino` no pendente
    // (censo por QR de 11/08) e o membro criado sem sexo. Vale nos DOIS caminhos:
    // na criação é ganho puro; na ATUALIZAÇÃO ele sobrescreve, que é a semântica
    // já documentada daquele ramo (reaplica o formulário inteiro, decisão humana
    // com o dado na tela) — não estou inventando política nova pra este campo.
    const cadFields = [
      'nome', 'cpf', 'email', 'telefone', 'data_nascimento', 'genero', 'estado_civil',
      'endereco', 'bairro', 'cidade', 'cep', 'profissao',
    ];

    // Extrai nome da coluna ausente da mensagem do PostgREST
    function missingCol(err) {
      if (!err?.message) return null;
      const m = err.message.match(/Could not find the '(\w+)' column/);
      return m ? m[1] : null;
    }

    if (cad.duplicado_de_id) {
      // ── Atualização cadastral ──
      let patch = pickNonNull(cad, cadFields);
      if (familia_id) patch.familia_id = familia_id;
      if (parentesco) patch.parentesco = parentesco;
      if (obsAuto) patch.observacoes = obsAuto;

      // Tenta até 3x, removendo colunas ausentes a cada tentativa
      for (let attempt = 0; attempt < 3; attempt++) {
        const { data: atualizado, error: eUpd } = await supabase
          .from('mem_membros')
          .update(patch)
          .eq('id', cad.duplicado_de_id)
          .select()
          .single();
        if (!eUpd && atualizado) {
          membro = atualizado;
          break;
        }
        const bad = missingCol(eUpd);
        if (bad) {
          console.warn(`[CADASTROS] coluna '${bad}' não existe em mem_membros, removendo do payload`);
          delete patch[bad];
          continue;
        }
        const msg = eUpd?.message || 'registro não encontrado';
        console.error('[CADASTROS] erro ao atualizar membro:', msg);
        return { ok: false, status: 500, error: `Erro ao atualizar membro: ${msg}` };
      }
      if (!membro) {
        return { ok: false, status: 500, error: 'Não foi possível atualizar: muitas colunas ausentes.' };
      }
      foiAtualizacao = true;
    } else {
      // ── Novo membro ──
      let membroPayload = {
        ...pickNonNull(cad, cadFields),
        nome: cad.nome, // obrigatório
        status: 'membro_ativo',
        active: true,
      };
      if (familia_id) membroPayload.familia_id = familia_id;
      if (parentesco) membroPayload.parentesco = parentesco;
      if (obsAuto) membroPayload.observacoes = obsAuto;

      const resultado = await acharOuCriarGuardado({
        nome: cad.nome, cpf: cad.cpf, email: cad.email, telefone: cad.telefone,
        dataNascimento: cad.data_nascimento, status: 'membro_ativo',
        extra: membroPayload, origem: 'membresia_aprovacao', origemId: cad.id,
      });
      const { data: encontrado, error: e2 } = await supabase.from('mem_membros')
        .select().eq('id', resultado.membro_id).single();
      if (e2) return { ok: false, status: 500, error: `Erro ao criar ou localizar membro: ${e2.message}` };
      membro = encontrado;
      foiAtualizacao = !resultado.created;
    }

    // Propaga o opt-in de WhatsApp do cadastro pendente pro membro (só liga,
    // nunca desliga um consentimento existente). Cobre os cadastros vindos do
    // form público de membresia E de inscrição em grupos.
    if (cad.whatsapp_optin && membro?.id) {
      try {
        await supabase.from('mem_membros')
          .update({ whatsapp_optin: true, whatsapp_optin_em: cad.whatsapp_optin_em || new Date().toISOString() })
          .eq('id', membro.id).is('deleted_at', null);
      } catch (e) {
        console.warn('[CADASTROS] propagar opt-in:', e.message);
      }
    }

    // Marca cadastro como aprovado e liga ao membro criado/atualizado
    const { error: e3 } = await supabase
      .from('mem_cadastros_pendentes')
      .update({
        status: 'aprovado',
        aprovado_por: userId,
        aprovado_em: new Date().toISOString(),
        membro_id: membro.id,
        observacoes: observacoes || cad.observacoes,
      })
      .eq('id', id);
    if (e3) console.error('[CADASTROS] erro ao atualizar cadastro:', e3.message);

    // Registra no histórico do membro. `tipo` é NOT NULL no schema vivo
    // (CHECK aceita 'outro') — sem ele o insert falhava em silêncio.
    try {
      const { error: eHist } = await supabase.from('mem_historico').insert({
        membro_id: membro.id,
        tipo: 'outro',
        descricao: foiAtualizacao
          ? `Atualização cadastral a partir do formulário público (origem: ${cad.origem}).`
          : `Aprovado a partir do formulário público (origem: ${cad.origem}).`,
        registrado_por: userId,
      });
      if (eHist) console.warn('[CADASTROS] histórico não gravado:', eHist.message);
    } catch (_) { /* histórico é opcional */ }

    // ── Status pela ATIVIDADE (regra do Matheus · 04/08) ────────────────────
    // "Membro ativo se tiver qualquer ação na igreja em 1 ano; sem ação, fica
    // frequentador." Participar de grupo conta; ter filho com check-in no Kids
    // conta. A régua é a função `fn_membro_tem_atividade` — a MESMA da varredura
    // da base, pra o status não depender de por onde a pessoa entrou.
    //
    // ⚠️ Aqui só PROMOVE (ou define no ato da criação). NUNCA rebaixa quem já é
    //    membro_ativo: aprovar um cadastro não pode ter como efeito colateral
    //    tirar a membresia de alguém — e o sistema não tem presença nominal de
    //    culto, então "sem ação" pode ser falta de DADO, não falta de igreja.
    //    Rebaixar é varredura deliberada, com a lista na mão.
    try {
      const { data: temAtividade, error: eAtiv } = await supabase
        .rpc('fn_membro_tem_atividade', { p_membro_id: membro.id, p_dias: 365 });
      if (eAtiv) {
        // Função ausente (deploy em 2 etapas) não pode derrubar a aprovação: o
        // membro já existe e o cadastro já está sendo aprovado.
        console.warn('[CADASTROS] fn_membro_tem_atividade indisponível:', eAtiv.message);
      } else {
        // `foiAtualizacao` é false só quando o cadastro CRIOU a pessoa agora
        // (nos dois ramos: duplicado_de_id sempre atualiza; o outro usa
        // `!resultado.created`). Pessoa recém-criada sem sinal nasce
        // frequentador; pessoa que já existia sem sinal não é tocada.
        const novoStatus = temAtividade
          ? 'membro_ativo'
          : (foiAtualizacao ? null : 'frequentador');
        if (novoStatus && membro.status !== novoStatus && membro.status !== 'membro_ativo') {
          const { data: ajustado } = await supabase.from('mem_membros')
            .update({ status: novoStatus })
            .eq('id', membro.id).is('deleted_at', null)
            .select().single();
          if (ajustado) membro = ajustado;
        }
      }
    } catch (e) {
      console.warn('[CADASTROS] status por atividade:', e.message);
    }

    // ⚠️ No LOTE isto vem desligado e o chamador manda UM aviso com o resumo.
    // Sem regra configurada, `notificar` cai no fallback de todos os
    // admin/diretor (16 pessoas): aprovar 50 cadastros geraria ~800 linhas de
    // notificação e enterraria o sino. Mesma lição do censo — aviso é pra
    // trabalho PENDENTE, e lote aprovado é trabalho FEITO.
    if (notificarIndividual) {
      notificar({
        modulo: 'membresia',
        tipo: 'cadastro_aprovado',
        titulo: `Cadastro aprovado: ${cad.nome}`,
        // Diz o status REAL: com a regra de atividade, aprovar não significa
        // mais "está ativo" em todo caso (sem sinal, a pessoa nasce
        // frequentador) — e aviso que afirma o que não aconteceu é pior que
        // aviso genérico.
        mensagem: `O cadastro de ${cad.nome} foi ${foiAtualizacao ? 'atualizado' : 'aprovado'} (status: ${membro.status}).`,
        link: `/ministerial/membresia`,
        severidade: 'info',
        chaveDedup: `cadastro_aprovado_${id}`,
      }).catch(() => {});
    }

    return { ok: true, membro, atualizacao: foiAtualizacao };
  } catch (e) {
    console.error('[CADASTROS] aprovar exception:', e.message, e.stack);
    return { ok: false, status: 500, error: `Erro ao aprovar cadastro: ${e.message}` };
  }
}

// POST /api/membresia/cadastros/:id/aprovar — cria mem_membros e marca aprovado
router.post('/cadastros/:id/aprovar', podeAprovarMembresia, async (req, res) => {
  const { familia_id, parentesco, observacoes } = req.body || {};
  const { data: cad, error } = await supabase
    .from('mem_cadastros_pendentes').select('*').eq('id', req.params.id).single();
  if (error || !cad) return res.status(404).json({ error: 'Cadastro não encontrado' });

  const r = await aprovarCadastroCore({
    cad, familia_id, parentesco, observacoes, userId: req.user.userId,
  });
  if (!r.ok) return res.status(r.status || 500).json({ error: r.error });
  res.status(r.atualizacao ? 200 : 201).json({ ok: true, membro: r.membro, atualizacao: r.atualizacao });
});

// ── APROVAÇÃO EM MASSA ─────────────────────────────────────────────────────
//
// Pedido do Matheus (04/08): selecionar alguns ou todos e aprovar de uma vez,
// com o sistema conferindo os dados obrigatórios e deixando quem está
// incompleto para aprovação manual.
//
// ⚠️ A régua de "está pronto?" vive em utils/prontidaoCadastro.js (pura,
//    testada) e é conferida NO SERVIDOR sobre a linha do banco — nunca a partir
//    do que o cliente mandou. A tela sabe quem está pronto para pintar a
//    seleção; a decisão de criar pessoa é sempre daqui.
//
// ⚠️ Não é um "aprovar tudo" mais permissivo que o manual: o que este endpoint
//    recusa continua aprovável na mão, com a pessoa vendo os dados. Nada fica
//    inalcançável — fica pendente de gente.
const LOTE_APROVACAO_MAX = 200;
const UUID_RE_CADASTRO = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ⚠️ Rota LITERAL: não é engolida por `/cadastros/:id/aprovar` (3 segmentos vs
//    2), mas fica declarada junto pra ninguém precisar conferir isso de novo —
//    é a armadilha que derrubou as abas Avaliar/Mural do Propostas.
router.post('/cadastros/aprovar-lote', podeAprovarMembresia, async (req, res) => {
  try {
    const ids = Array.isArray(req.body?.ids)
      ? req.body.ids.map(String).filter(id => UUID_RE_CADASTRO.test(id))
      : [];
    if (!ids.length) return res.status(400).json({ error: 'Nenhum cadastro selecionado.' });
    if (ids.length > LOTE_APROVACAO_MAX) {
      return res.status(400).json({
        error: `Selecione no máximo ${LOTE_APROVACAO_MAX} cadastros por vez.`,
      });
    }

    // Relê do banco: o payload diz QUAIS, nunca SE pode.
    const { data: linhas, error } = await supabase
      .from('mem_cadastros_pendentes').select('*').in('id', ids);
    if (error) throw error;

    const aprovados = [];
    const ignorados = [];
    const falhas = [];

    for (const id of ids) {
      const cad = (linhas || []).find(l => l.id === id);
      if (!cad) {
        ignorados.push({ id, nome: null, motivos: ['cadastro não encontrado'] });
        continue;
      }
      const prontidao = avaliarProntidao(cad);
      if (!prontidao.pronto) {
        ignorados.push({ id, nome: cad.nome, motivos: prontidao.rotulos });
        continue;
      }
      // Sequencial de propósito: cada aprovação passa pelo matcher canônico e
      // pode CRIAR pessoa. Em paralelo, dois cadastros da mesma família (mesmo
      // telefone/e-mail) correriam no matcher ao mesmo tempo e poderiam gerar
      // duplicata — exatamente o que a fila de Entradas existe pra limpar.
      const r = await aprovarCadastroCore({
        cad, userId: req.user.userId, notificarIndividual: false,
      });
      if (r.ok) aprovados.push({ id, nome: cad.nome, membro_id: r.membro?.id, atualizacao: r.atualizacao });
      else falhas.push({ id, nome: cad.nome, erro: r.error });
    }

    if (aprovados.length) {
      notificar({
        modulo: 'membresia',
        tipo: 'cadastros_aprovados_lote',
        titulo: `${aprovados.length} cadastro(s) aprovados em lote`,
        mensagem: `${aprovados.length} aprovados${ignorados.length ? ` · ${ignorados.length} ficaram para aprovação manual (dados incompletos)` : ''}${falhas.length ? ` · ${falhas.length} falharam` : ''}.`,
        // O trabalho que sobra é o que ficou PENDENTE — o link leva direto lá.
        link: '/ministerial/membresia?tab=cadastros&status=pendente',
        severidade: 'info',
        chaveDedup: `cadastros_lote_${new Date().toISOString().slice(0, 16)}`,
      }).catch(() => {});
    }

    res.json({
      ok: true,
      aprovados: aprovados.length,
      ignorados,
      falhas,
      detalhe_aprovados: aprovados,
    });
  } catch (e) {
    console.error('[CADASTROS] aprovar-lote exception:', e.message);
    res.status(500).json({ error: `Erro ao aprovar em lote: ${e.message}` });
  }
});

// POST /api/membresia/cadastros/:id/rejeitar — marca rejeitado com motivo
router.post('/cadastros/:id/rejeitar', podeAprovarMembresia, async (req, res) => {
  try {
    const { id } = req.params;
    const { motivo } = req.body || {};
    const { data: cad, error } = await supabase
      .from('mem_cadastros_pendentes')
      .update({
        status: 'rejeitado',
        motivo_rejeicao: motivo || null,
        aprovado_por: req.user.userId,
        aprovado_em: new Date().toISOString(),
      })
      .eq('id', id)
      .select('nome')
      .single();
    if (error) throw error;

    notificar({
      modulo: 'membresia',
      tipo: 'cadastro_rejeitado',
      titulo: `Cadastro rejeitado: ${cad?.nome || id}`,
      mensagem: `O cadastro de ${cad?.nome || 'membro'} foi rejeitado.${motivo ? ` Motivo: ${motivo}` : ''}`,
      link: `/ministerial/membresia`,
      severidade: 'aviso',
      chaveDedup: `cadastro_rejeitado_${id}`,
    }).catch(() => {});

    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'Erro ao rejeitar cadastro' });
  }
});

// PATCH /api/membresia/cadastros/:id — atualiza observações/duplicado_de
router.patch('/cadastros/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { observacoes, duplicado_de_id } = req.body || {};
    const patch = {};
    if (observacoes !== undefined) patch.observacoes = observacoes;
    if (duplicado_de_id !== undefined) patch.duplicado_de_id = duplicado_de_id;
    const { data, error } = await supabase
      .from('mem_cadastros_pendentes')
      .update(patch)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: 'Erro ao atualizar cadastro' });
  }
});

// DELETE /api/membresia/cadastros/:id — admin apaga submissão (spam, etc.)
router.delete('/cadastros/:id', authorize('admin', 'diretor'), async (req, res) => {
  try {
    const { error } = await supabase
      .from('mem_cadastros_pendentes')
      .delete()
      .eq('id', req.params.id);
    if (error) throw error;
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'Erro ao remover cadastro' });
  }
});

// ── KPIs ──
router.get('/kpis', async (req, res) => {
  try {
    // PostgREST capa em 1000 linhas server-side → paginar pra contar de verdade
    // (lição cargo_modulo_permissao · CLAUDE.md). O .length de um select sem
    // paginação travava o card "Total de pessoas" em exatamente 1000.
    const membros = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await supabase
        .from('mem_membros')
        .select('id, status, cpf')
        .is('deleted_at', null)
        .eq('active', true)
        .range(from, from + 999);
      if (error) break;
      membros.push(...(data || []));
      if (!data || data.length < 1000) break;
    }

    const total = membros.length;
    // Membros (status=membro_ativo) sem CPF cadastrado — meta de captação.
    const membrosSemCpf = membros.filter(m => m.status === 'membro_ativo' && !m.cpf).length;
    const byStatus = {};
    membros.forEach(m => {
      byStatus[m.status] = (byStatus[m.status] || 0) + 1;
    });

    const { count: familias } = await supabase
      .from('mem_familias')
      .select('id', { count: 'exact', head: true });

    // Contribuintes ativos (≤30 dias) — membros ativos com contribuição recente.
    // Paginado (mem_contribuicoes passou de 1000 linhas) e sem .in() gigante.
    const limite30dStr = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
    const ativosSet = new Set(membros.map(m => m.id));
    const contribRecentes = new Set();
    for (let from = 0; ; from += 1000) {
      const { data, error } = await supabase
        .from('mem_contribuicoes')
        .select('membro_id')
        .is('deleted_at', null)
        .gte('data', limite30dStr)
        .not('membro_id', 'is', null)
        .range(from, from + 999);
      if (error) break;
      (data || []).forEach(c => { if (ativosSet.has(c.membro_id)) contribRecentes.add(c.membro_id); });
      if (!data || data.length < 1000) break;
    }
    const contribuintesAtivos = contribRecentes.size;

    res.json({
      total: total || 0,
      byStatus,
      familias: familias || 0,
      contribuintes_ativos: contribuintesAtivos,
      membros_sem_cpf: membrosSemCpf,
    });
  } catch (e) {
    console.error('[membresia/kpis]', e.message);
    res.status(500).json({ error: 'Erro ao buscar KPIs' });
  }
});

// ============================================================================
// Duplicados · detecção + merge
//
// Marcos: "ter uma aba de juntar esses cadastros futuramente · não impede
//          cadastro, mas detecta e oferece merge".
// ============================================================================

router.get('/duplicados', authorizeModule('membresia', 2), async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 100, 500);
    const { data, error } = await supabase
      .from('vw_membros_duplicados')
      .select('*')
      .order('confianca', { ascending: false })
      .limit(limit);
    if (error) throw error;

    const items = (data || []).map(d => ({
      par_id: `${d.membro_a_id}_${d.membro_b_id}`,
      membro_a_id: d.membro_a_id,
      membro_b_id: d.membro_b_id,
      motivos: d.motivos || [],
      confianca: d.confianca,
      membro_a: {
        id: d.membro_a_id,
        nome: d.a_nome,
        email: d.a_email,
        telefone: d.a_telefone,
        cpf: d.a_cpf,
        data_nascimento: d.a_nascimento,
        status: d.a_status,
        foto_url: d.a_foto_url,
        criado_em: d.a_criado_em,
      },
      membro_b: {
        id: d.membro_b_id,
        nome: d.b_nome,
        email: d.b_email,
        telefone: d.b_telefone,
        cpf: d.b_cpf,
        data_nascimento: d.b_nascimento,
        status: d.b_status,
        foto_url: d.b_foto_url,
        criado_em: d.b_criado_em,
      },
    }));
    // Alinhamento com a política canônica do Entradas: a view legada
    // vw_membros_duplicados casa par por telefone OU e-mail SOZINHOS (contra a
    // LEI "Contrato de porta" — família compartilha telefone/e-mail). Filtra os
    // pares pela mesma régua do Entradas (duplicidadePolicy): telefone/e-mail só
    // valem com nome compatível; nascimento/CPF conflitante exclui. Evita fundir
    // pessoas distintas pela aba Duplicados.
    const filtrados = items.filter((it) => avaliarPossivelDuplicidade(it.membro_a, it.membro_b).incluir);
    res.json({ total: filtrados.length, items: filtrados });
  } catch (e) {
    console.error('[membresia/duplicados]', e.message);
    res.status(500).json({ error: e.message || 'Erro ao buscar duplicados' });
  }
});

router.post('/duplicados/ignorar', authorizeModule('membresia', 2), async (req, res) => {
  const { membro_a_id, membro_b_id, motivo } = req.body || {};
  if (!membro_a_id || !membro_b_id) {
    return res.status(400).json({ error: 'membro_a_id e membro_b_id obrigatórios' });
  }
  // Ordena pra bater com o CHECK da tabela (a < b)
  const [a, b] = [membro_a_id, membro_b_id].sort();
  const { data, error } = await supabase
    .from('mem_duplicados_ignorados')
    .upsert({
      membro_a_id: a,
      membro_b_id: b,
      ignorado_por: req.user?.id || null,
      motivo: motivo || null,
    }, { onConflict: 'membro_a_id,membro_b_id' })
    .select()
    .single();
  if (error) {
    console.error('[membresia/duplicados/ignorar]', error.message);
    return res.status(500).json({ error: error.message });
  }
  res.json({ ok: true, registro: data });
});

// GET /api/membresia/membros/:id/possiveis-duplicados — duplicados PROVÁVEIS da
// pessoa aberta (mesmo nome/telefone/email/cpf), pra fundir direto no detalhe.
router.get('/membros/:id/possiveis-duplicados', authorizeModule('membresia', 2), async (req, res) => {
  try {
    const { id } = req.params;
    const { data: m } = await supabase.from('mem_membros')
      .select('id, nome, telefone, email, cpf').eq('id', id).maybeSingle();
    if (!m) return res.status(404).json({ error: 'Cadastro não encontrado' });
    const digits = (v) => String(v || '').replace(/\D/g, '');
    const tel = digits(m.telefone), cpf = digits(m.cpf);
    const sel = 'id, nome, telefone, email, cpf, status, foto_url, parentesco, familia:mem_familias(id, nome)';
    const queries = [];
    if (m.nome && m.nome.trim().length >= 3) queries.push(supabase.from('mem_membros').select(sel).ilike('nome', m.nome.trim()).neq('id', id).is('deleted_at', null).limit(25));
    if (tel.length >= 8) queries.push(supabase.from('mem_membros').select(sel).ilike('telefone', `%${tel}%`).neq('id', id).is('deleted_at', null).limit(25));
    if (m.email) queries.push(supabase.from('mem_membros').select(sel).ilike('email', m.email.trim()).neq('id', id).is('deleted_at', null).limit(25));
    if (cpf.length === 11) queries.push(supabase.from('mem_membros').select(sel).ilike('cpf', `%${cpf}%`).neq('id', id).is('deleted_at', null).limit(25));
    const results = await Promise.all(queries);
    // dedup + motivo
    const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
    const mapa = new Map();
    results.forEach((r) => (r.data || []).forEach((c) => {
      const motivos = [];
      if (m.nome && norm(c.nome) === norm(m.nome)) motivos.push('mesmo nome');
      if (tel.length >= 8 && digits(c.telefone) && digits(c.telefone) === tel) motivos.push('mesmo telefone');
      if (m.email && c.email && norm(c.email) === norm(m.email)) motivos.push('mesmo e-mail');
      if (cpf.length === 11 && digits(c.cpf) === cpf) motivos.push('mesmo CPF');
      if (!motivos.length) return;
      const prev = mapa.get(c.id);
      if (prev) prev.motivos = Array.from(new Set([...prev.motivos, ...motivos]));
      else mapa.set(c.id, { ...c, motivos });
    }));
    // remove pares já ignorados
    let lista = Array.from(mapa.values());
    if (lista.length) {
      const { data: ign } = await supabase.from('mem_duplicados_ignorados')
        .select('membro_a_id, membro_b_id').or(`membro_a_id.eq.${id},membro_b_id.eq.${id}`);
      const ignSet = new Set();
      (ign || []).forEach((p) => { ignSet.add(p.membro_a_id === id ? p.membro_b_id : p.membro_a_id); });
      lista = lista.filter((c) => !ignSet.has(c.id));
    }
    res.json(lista);
  } catch (e) {
    console.error('[membresia/possiveis-duplicados]', e.message);
    res.status(500).json({ error: 'Erro ao buscar duplicados' });
  }
});

// ── Vínculos familiares (grafo de parentesco · X é filho/irmão de Y) ──────────
const VINC_INVERSO = {
  filho: 'pai_mae', pai_mae: 'filho', irmao: 'irmao', conjuge: 'conjuge',
  avo: 'neto', neto: 'avo', tio: 'sobrinho', sobrinho: 'tio', primo: 'primo',
  responsavel: 'dependente', dependente: 'responsavel', outro: 'outro',
};

// GET /membros/:id/vinculos — relações da pessoa (com a pessoa relacionada)
router.get('/membros/:id/vinculos', async (req, res) => {
  try {
    const { data } = await supabase.from('mem_vinculos_familiares')
      .select('id, tipo, relacionado:mem_membros!mem_vinculos_familiares_relacionado_id_fkey(id, nome, status, foto_url)')
      .eq('pessoa_id', req.params.id).is('deleted_at', null);
    res.json(data || []);
  } catch (e) {
    console.error('[membresia/vinculos GET]', e.message);
    res.status(500).json({ error: 'Erro ao carregar vínculos' });
  }
});

// POST /membros/:id/vinculos — { relacionado_id, tipo } · grava nos 2 sentidos
router.post('/membros/:id/vinculos', authorize('admin', 'diretor'), async (req, res) => {
  try {
    const pessoa_id = req.params.id;
    const { relacionado_id, tipo } = req.body || {};
    if (!relacionado_id || !tipo) return res.status(400).json({ error: 'relacionado_id e tipo obrigatórios' });
    if (relacionado_id === pessoa_id) return res.status(400).json({ error: 'Selecione outra pessoa' });
    if (!VINC_INVERSO[tipo]) return res.status(400).json({ error: 'Tipo de vínculo inválido' });
    // já existe?
    const { data: existe } = await supabase.from('mem_vinculos_familiares')
      .select('id').eq('pessoa_id', pessoa_id).eq('relacionado_id', relacionado_id).is('deleted_at', null).maybeSingle();
    if (existe) return res.status(409).json({ error: 'Esse vínculo já existe' });
    // cria A→B
    const { data: a, error: ea } = await supabase.from('mem_vinculos_familiares')
      .insert({ pessoa_id, relacionado_id, tipo, created_by: req.user?.id || null }).select('id').single();
    if (ea) throw ea;
    // cria B→A (inverso) e liga par_id dos dois
    const { data: b } = await supabase.from('mem_vinculos_familiares')
      .insert({ pessoa_id: relacionado_id, relacionado_id: pessoa_id, tipo: VINC_INVERSO[tipo], par_id: a.id, created_by: req.user?.id || null })
      .select('id').single();
    if (b) await supabase.from('mem_vinculos_familiares').update({ par_id: b.id }).eq('id', a.id);

    // PONTE vínculo → família: parentesco PRÓXIMO (mesmo domicílio) já coloca os
    // dois na mesma família. Conservador: se cada um já tem uma família DIFERENTE,
    // não funde households (só cria o grafo); o usuário funde manualmente se quiser.
    let familia_unificada = false;
    const CLOSE = new Set(['pai_mae', 'filho', 'conjuge', 'irmao']);
    if (CLOSE.has(tipo)) {
      try {
        const ultimoSobrenome = (n) => { const t = String(n || '').trim().split(/\s+/).filter(Boolean); return t.length ? t[t.length - 1] : ''; };
        const [{ data: pA }, { data: pB }] = await Promise.all([
          supabase.from('mem_membros').select('id, nome, familia_id').eq('id', pessoa_id).maybeSingle(),
          supabase.from('mem_membros').select('id, nome, familia_id').eq('id', relacionado_id).maybeSingle(),
        ]);
        const fa = pA?.familia_id || null, fb = pB?.familia_id || null;
        if (!(fa && fb && fa !== fb)) { // não funde 2 famílias distintas já existentes
          let familiaId = fa || fb || null;
          if (!familiaId) {
            const sob = ultimoSobrenome(pA?.nome) || ultimoSobrenome(pB?.nome) || 'sem sobrenome';
            const { data: fam } = await supabase.from('mem_familias').insert({ nome: `Família ${sob}` }).select('id').single();
            familiaId = fam?.id || null;
          }
          if (familiaId) {
            const semFamilia = [pessoa_id, relacionado_id].filter((pid) => (pid === pessoa_id ? fa : fb) !== familiaId);
            if (semFamilia.length) await supabase.from('mem_membros').update({ familia_id: familiaId }).in('id', semFamilia);
            familia_unificada = true;
            // par não-duplicata (evita reaparecer na fila de duplicidades)
            const [x, y] = [pessoa_id, relacionado_id].sort();
            await supabase.from('mem_duplicados_ignorados').upsert(
              { membro_a_id: x, membro_b_id: y, ignorado_por: req.user?.id || null, motivo: 'Vínculo familiar (mesma família)' },
              { onConflict: 'membro_a_id,membro_b_id' }).then(() => {}, () => {});
          }
        }
      } catch (e2) { console.warn('[membresia/vinculos] unificar família:', e2.message); }
    }

    res.status(201).json({ ok: true, id: a.id, familia_unificada });
  } catch (e) {
    console.error('[membresia/vinculos POST]', e.message);
    res.status(500).json({ error: 'Erro ao criar vínculo' });
  }
});

// DELETE /vinculos/:id — soft-delete o vínculo + o recíproco
router.delete('/vinculos/:id', authorize('admin', 'diretor'), async (req, res) => {
  try {
    const now = new Date().toISOString();
    const { data: v } = await supabase.from('mem_vinculos_familiares').select('id, par_id').eq('id', req.params.id).maybeSingle();
    const ids = [req.params.id];
    if (v?.par_id) ids.push(v.par_id);
    await supabase.from('mem_vinculos_familiares').update({ deleted_at: now }).in('id', ids);
    res.json({ ok: true });
  } catch (e) {
    console.error('[membresia/vinculos DELETE]', e.message);
    res.status(500).json({ error: 'Erro ao remover vínculo' });
  }
});

router.post('/membros/merge', authorizeModule('membresia', 3), async (req, res) => {
  const { keep_id, merge_ids, observacao, campos } = req.body || {};
  if (!keep_id) return res.status(400).json({ error: 'keep_id obrigatorio' });
  if (!Array.isArray(merge_ids) || merge_ids.length === 0) {
    return res.status(400).json({ error: 'merge_ids obrigatório (array de uuids)' });
  }
  try {
    const { data, error } = await supabase.rpc('merge_membros', {
      p_keep_id: keep_id,
      p_merge_ids: merge_ids,
      p_feito_por: req.user?.id || null,
      p_observacao: observacao || null,
    });
    if (error) throw error;
    // "Melhor de cada": fixa no mantido os campos escolhidos no comparador (o
    // merge já apagou os absorvidos → sem colisão de UNIQUE de CPF com o par).
    const patch = montarPatchFusao(campos);
    let camposAplicados = [];
    if (Object.keys(patch).length) {
      const { error: upErr } = await supabase.from('mem_membros')
        .update(patch).eq('id', keep_id).is('deleted_at', null);
      if (upErr) console.error('[membresia/membros/merge campos]', upErr.message);
      else camposAplicados = Object.keys(patch);
    }
    const resposta = (data && typeof data === 'object' && !Array.isArray(data)) ? { ...data } : { resultado: data };
    resposta.campos_aplicados = camposAplicados;
    res.json(resposta);
  } catch (e) {
    console.error('[membresia/membros/merge]', e.message);
    res.status(500).json({ error: e.message || 'Erro ao fundir membros' });
  }
});

router.get('/merge-log', authorize('admin', 'diretor'), async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const { data, error } = await supabase
    .from('mem_merge_log')
    .select('*')
    .order('feito_em', { ascending: false })
    .limit(limit);
  if (error) return res.status(500).json({ error: error.message });
  res.json(data || []);
});

// ══════════════════════════════════════════════════════════════
// FILA DE IDENTIDADE · identidade_pendencias (20260716150000)
// Conflitos de CPF que a reconciliação automática NÃO resolve sozinha
// (política: nunca auto-fundir/auto-gravar por sinal fraco). Alimentada
// por cpfReconciliar.js, pelo backfill e pelo cron do wifi. UI: aba
// "Identidade" da Membresia.
// ══════════════════════════════════════════════════════════════

// Mesmos módulos da RLS de leitura da tabela (membresia/integracao/next/
// cuidados). Ações exigem nível 3 (mesmo patamar do write da RLS).
function nivelFilaIdentidade(req) {
  if (['admin', 'diretor'].includes(req.user?.role)) return 5;
  return Math.max(
    getEffectiveLevel(req, 'membresia') || 0,
    getEffectiveLevel(req, 'integracao') || 0,
    getEffectiveLevel(req, 'next') || 0,
    getEffectiveLevel(req, 'cuidados') || 0,
  );
}

async function registrarResolucaoEntrada(payload) {
  const { error } = await supabase.from('entradas_resolucoes').insert(payload);
  if (error && !/entradas_resolucoes|schema cache|does not exist/i.test(error.message || '')) {
    console.warn('[membresia/identidade] resolução não registrada:', error.message);
  }
}

// Recupera o CPF em disputa de uma pendência cpf_para_confirmar:
// 1) wifi (5b) grava o CPF direto em origem_id; 2) os writers do backend
// gravam "CPF <11 dígitos>" no detalhe; 3) fallback: lê a linha-satélite
// apontada por origem/origem_id.
const PEND_ORIGEM_SATELITE = {
  backfill_batismo: { tabela: 'batismo_inscricoes', col: 'cpf' },
  batismo_checkin: { tabela: 'batismo_inscricoes', col: 'cpf' },
  backfill_vol: { tabela: 'vol_inscricoes', col: 'cpf' },
  vol_ficha: { tabela: 'vol_inscricoes', col: 'cpf' },
  backfill_next: { tabela: 'next_matriculas', col: 'cpf' },
  next_matricula: { tabela: 'next_matriculas', col: 'cpf' },
  decisao_edicao: { tabela: 'cultos_decisoes_pessoas', col: 'cpf' },
};

function cpfDoTexto(p) {
  const doOrigemId = String(p.origem_id || '').replace(/\D/g, '');
  if (doOrigemId.length === 11) return doOrigemId;
  const m = String(p.detalhe || '').match(/\b(\d{11})\b/);
  return m ? m[1] : null;
}

async function cpfDaPendencia(p) {
  const direto = cpfDoTexto(p);
  if (direto) return direto;
  const map = PEND_ORIGEM_SATELITE[p.origem];
  if (!map || !p.origem_id) return null;
  const { data } = await supabase.from(map.tabela)
    .select(map.col).eq('id', p.origem_id).maybeSingle();
  const d = String(data?.[map.col] || '').replace(/\D/g, '');
  return d.length === 11 ? d : null;
}

// Régua da pessoa órfã + mapa porta→ponteiro + força da evidência: fonte ÚNICA,
// compartilhada com o script de enfileiramento (services/inscricaoOrfas.js).
// ⚠️ Declarado ANTES do primeiro uso de propósito (o GET, o clique individual e
// o lote leem daqui) — a versão anterior tinha este require 100 linhas abaixo,
// e mover uma delas pra cima quebraria por TDZ.
const {
  chavePessoa, PORTA_VINCULO, lerLinhasOrfas, ordemAncora,
  FORCA, avaliarForcaOrfa, forcaPodeLote,
} = require('../services/inscricaoOrfas');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Evidência das pendências `inscricao_sem_vinculo`: o que a PESSOA digitou na
// inscrição (nome/telefone/CPF/nascimento) + quantas linhas ela tem + a FORÇA
// do vínculo proposto.
//
// ⚠️ Por que ler a view aqui: o card mostrava só o CADASTRO candidato, então o
// CPF que a pessoa informou não aparecia em lugar nenhum — era isso que fazia o
// chip "Só com CPF" listar gente com o CPF em branco na tela (a chave `cpf:` do
// `origem_id` é da INSCRIÇÃO, não do cadastro).
//
// Best-effort: se a view falhar, `evidencia` vem null e a tela cai no
// comportamento antigo — a fila não pode deixar de abrir por causa disso.
async function evidenciaDasOrfas(pendencias) {
  const alvo = (pendencias || []).filter((p) => p.tipo === 'inscricao_sem_vinculo' && p.origem_id);
  if (!alvo.length) return new Map();
  const orfas = await lerLinhasOrfas(supabase);
  const porChave = new Map();
  for (const l of orfas) {
    const k = chavePessoa(l);
    if (!porChave.has(k)) porChave.set(k, []);
    porChave.get(k).push(l);
  }
  for (const ls of porChave.values()) ls.sort(ordemAncora);
  return porChave;
}

function montarEvidencia(p, porChave, membro) {
  if (p.tipo !== 'inscricao_sem_vinculo') return null;
  const linhas = porChave.get(p.origem_id) || [];
  const anc = linhas[0] || null;
  // Chave morta = as inscrições dessa pessoa já foram ligadas a algum cadastro.
  // Declarar isso evita o clique que só devolve 409 (o Matheus resolveu 110
  // pendências na mão em 05/08 — clique que erra é caro).
  if (!anc) {
    return {
      chave_viva: false, linhas: 0, insc: null,
      forca: FORCA.MANUAL, motivo: 'as inscrições dessa pessoa já foram ligadas a algum cadastro', veto: null,
      pode_lote: false,
    };
  }
  const av = avaliarForcaOrfa(anc, membro || {});
  return {
    chave_viva: true,
    linhas: linhas.length,
    portas: [...new Set(linhas.map((l) => l.porta))],
    insc: {
      nome: anc.nome_display || null,
      telefone: anc.telefone_norm || null,
      cpf: anc.cpf_norm || null,
      email: anc.email_norm || null,
      data_nascimento: anc.nascimento || null,
    },
    forca: av.forca,
    motivo: av.motivo,
    veto: av.veto,
    // O servidor é quem decide; o campo existe pra tela poder pré-selecionar.
    pode_lote: forcaPodeLote(av.forca) && !!membro && !membro.deleted_at
      && linhas.every((l) => !!PORTA_VINCULO[l.porta]),
  };
}

// GET /api/membresia/identidade-pendencias?status=pendente&tipo=
router.get('/identidade-pendencias', async (req, res) => {
  try {
    if (nivelFilaIdentidade(req) < 1) return res.status(403).json({ error: 'Sem permissão' });
    const status = req.query.status || 'pendente';
    // ⚠️ Teto era 500 e em 04/08 havia 495 pendentes — a 5 de truncar em SILÊNCIO
    // (a fila some do fim sem erro nenhum). 1000 é o cap do PostgREST; passando
    // disso, paginar é obrigatório.
    let q = supabase.from('identidade_pendencias')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(1000);
    if (status !== 'todas') q = q.eq('status', status);
    if (req.query.tipo) q = q.eq('tipo', req.query.tipo);
    const { data: pend, error } = await q;
    if (error) throw error;

    // Junta os membros dos dois lados (lotes de <=200 · .in() com 400+ uuids
    // falha silencioso no PostgREST)
    const ids = [...new Set((pend || []).flatMap((p) => [p.membro_id, p.membro_conflito_id]).filter(Boolean))];
    const porId = new Map();
    for (let i = 0; i < ids.length; i += 200) {
      const { data: ms, error: e2 } = await supabase.from('mem_membros')
        .select('id, nome, cpf, telefone, email, status, data_nascimento, familia_id, deleted_at')
        .in('id', ids.slice(i, i + 200));
      if (e2) throw e2;
      for (const m of ms || []) porId.set(m.id, m);
    }

    // Resumo geral (a tabela é pequena · contagem por tipo/status)
    const { data: todas, error: e3 } = await supabase.from('identidade_pendencias').select('tipo, status');
    if (e3) throw e3;
    const resumo = {};
    for (const p of todas || []) {
      resumo[p.status] = resumo[p.status] || {};
      resumo[p.status][p.tipo] = (resumo[p.status][p.tipo] || 0) + 1;
    }

    // Evidência das órfãs (best-effort · falha não derruba a fila)
    let porChave = new Map();
    let avisoEvidencia = null;
    try {
      porChave = await evidenciaDasOrfas(pend);
    } catch (e) {
      console.warn('[identidade-pendencias] evidência não carregada:', e.message);
      avisoEvidencia = 'Não foi possível ler as inscrições órfãs agora — a seleção em lote fica desligada até recarregar.';
    }

    res.json({
      items: (pend || []).map((p) => {
        const membro = porId.get(p.membro_id) || null;
        return {
          ...p,
          membro,
          conflito: porId.get(p.membro_conflito_id) || null,
          cpf_proposto: p.tipo === 'cpf_para_confirmar' ? cpfDoTexto(p) : null,
          evidencia: avisoEvidencia ? null : montarEvidencia(p, porChave, membro),
        };
      }),
      resumo,
      aviso: avisoEvidencia,
      pode_agir: nivelFilaIdentidade(req) >= 3,
    });
  } catch (e) {
    console.error('[membresia/identidade-pendencias]', e.message);
    res.status(500).json({ error: 'Erro ao listar pendências de identidade' });
  }
});

// POST /api/membresia/identidade-pendencias/:id/confirmar-cpf
// Só cpf_para_confirmar: o humano confirmou que o CPF é daquela pessoa →
// consolida via reconciliarCpfTardio com confiança FORTE (se um conflito
// tiver surgido nesse meio tempo, a própria reconciliação abre a pendência
// certa e esta é encerrada).
router.post('/identidade-pendencias/:id/confirmar-cpf', async (req, res) => {
  try {
    if (nivelFilaIdentidade(req) < 3) return res.status(403).json({ error: 'Sem permissão para agir na fila' });
    const { data: p, error } = await supabase.from('identidade_pendencias')
      .select('*').eq('id', req.params.id).maybeSingle();
    if (error) throw error;
    if (!p) return res.status(404).json({ error: 'Pendência não encontrada' });
    if (p.status !== 'pendente') return res.status(409).json({ error: 'Pendência já triada' });
    if (p.tipo !== 'cpf_para_confirmar') {
      return res.status(422).json({ error: 'Só pendências de CPF a confirmar aceitam esta ação' });
    }
    if (!p.membro_id) return res.status(422).json({ error: 'Pendência sem membro vinculado' });

    const cpf = await cpfDaPendencia(p);
    if (!cpf) return res.status(422).json({ error: 'Não foi possível recuperar o CPF desta pendência — resolva pelo cadastro' });

    const { reconciliarCpfTardio } = require('../services/cpfReconciliar');
    const r = await reconciliarCpfTardio({
      membroId: p.membro_id, cpf,
      origem: 'fila_identidade', origemId: p.id,
      confianca: 'forte',
    });

    await supabase.from('identidade_pendencias').update({
      status: 'resolvida',
      resolvida_por: req.user?.id || null,
      resolvida_em: new Date().toISOString(),
    }).eq('id', p.id).eq('status', 'pendente');

    await registrarResolucaoEntrada({
      tipo: 'identidade', acao: 'cpf_confirmado',
      membro_principal_id: p.membro_id, membro_secundario_id: p.membro_conflito_id || null,
      origem: 'identidade_pendencias', origem_id: String(p.id),
      detalhe: { tipo_pendencia: p.tipo, cpf_resultado: r.acao },
      resolvido_por: req.user?.id || null,
    });

    res.json({ ok: true, acao: r.acao, conflito_id: r.conflito_id || null });
  } catch (e) {
    console.error('[membresia/identidade-pendencias/confirmar]', e.message);
    res.status(500).json({ error: 'Erro ao confirmar o CPF' });
  }
});

// POST /api/membresia/identidade-pendencias/:id/ligar-inscricao
// Liga ao cadastro CANDIDATO **todas as linhas de inscrição daquela pessoa**. É
// a ação humana da fila `inscricao_sem_vinculo` — o sistema nunca liga sozinho
// (a evidência mais forte em 160 dos 190 pares é telefone+nome, e telefone é
// compartilhado em família).
//
// ⚠️ Ligava UMA linha só (`p.origem_id` = ref_id) e resolvia a pendência —
// então pessoa com 2+ inscrições ficava com as outras órfãs e SEM pendência
// nenhuma (18 casos, 20 linhas, medido em 31/07). Agora `origem_id` é a chave
// da pessoa e o clique varre a view.
//
// ⚠️ EXTRAÍDO em `ligarInscricaoCore` (padrão do `aprovarCadastroCore`): a rota
// individual e o LOTE precisam da mesma lógica, e duas cópias divergindo aqui
// significaria criar vínculo de pessoa por dois caminhos com réguas diferentes.
// Devolve `{ status, body }` — quem chama decide o HTTP (no lote é por item).
async function ligarInscricaoCore(p, { userId = null, orfas = null, exigirForte = false } = {}) {
  if (!p) return { status: 404, body: { error: 'Pendência não encontrada' } };
  if (p.status !== 'pendente') return { status: 409, body: { error: 'Pendência já triada' } };
  if (p.tipo !== 'inscricao_sem_vinculo') {
    return { status: 422, body: { error: 'Só pendências de inscrição sem vínculo aceitam esta ação' } };
  }
  if (!p.membro_id) return { status: 422, body: { error: 'Pendência sem cadastro candidato' } };
  if (!p.origem_id) return { status: 422, body: { error: 'Pendência sem referência da inscrição' } };

  // O membro candidato precisa estar vivo (pode ter sido fundido/apagado
  // entre o enfileiramento e o clique).
  const { data: m } = await supabase.from('mem_membros')
    .select('id, nome, telefone, email, cpf, data_nascimento, deleted_at')
    .eq('id', p.membro_id).is('deleted_at', null).maybeSingle();
  if (!m) return { status: 409, body: { error: 'O cadastro candidato não existe mais (fundido ou removido) — reavalie' } };

  // Alvos = as linhas ÓRFÃS dessa pessoa, relidas AGORA (a view é a verdade;
  // lista guardada no enfileiramento envelhece).
  let alvos;
  if (UUID_RE.test(String(p.origem_id))) {
    // Pendência do formato antigo (origem_id = 1 linha). Mantido pra não
    // travar a fila entre o deploy e o re-enfileiramento.
    const map = PORTA_VINCULO[p.origem];
    if (!map) {
      return { status: 422, body: { error: `Porta "${p.origem}" não tem ponteiro de pessoa mapeado — resolva pelo módulo dono` } };
    }
    alvos = [{ porta: p.origem, ref_id: p.origem_id }];
  } else {
    const base = orfas || await lerLinhasOrfas(supabase);
    alvos = base.filter((l) => chavePessoa(l) === p.origem_id);
    if (!alvos.length) {
      return { status: 409, body: { error: 'As inscrições dessa pessoa já foram ligadas a algum cadastro — recarregue a fila' } };
    }
  }

  // ⚠️ No LOTE a força é REAVALIADA aqui, no servidor: o payload diz QUAIS
  // pendências, nunca SE PODE (mesma régua do `aprovar-lote` da Membresia). O
  // clique individual não exige força — a tela mostra os dois lados e quem
  // decide é a pessoa olhando.
  let avaliacao = null;
  if (exigirForte) {
    alvos.sort(ordemAncora);
    avaliacao = avaliarForcaOrfa(alvos[0], m);
    if (!forcaPodeLote(avaliacao.forca)) {
      return {
        status: 422,
        body: { error: `Evidência fraca pra lote: ${avaliacao.motivo}`, forca: avaliacao.forca, veto: avaliacao.veto },
      };
    }
    const semMapa = [...new Set(alvos.map((l) => l.porta).filter((porta) => !PORTA_VINCULO[porta]))];
    if (semMapa.length) {
      return { status: 422, body: { error: `Porta(s) ${semMapa.join(', ')} sem ponteiro mapeado — resolva pelo módulo dono` } };
    }
  }

  const ligadas = [], jaLigadas = [], naoMapeadas = [];
  for (const l of alvos) {
    const map = PORTA_VINCULO[l.porta];
    if (!map) { naoMapeadas.push(l.porta); continue; }
    // `.is(col, null)` é a trava: se alguém já ligou essa linha no meio do
    // caminho, não sobrescreve o vínculo alheio.
    const { data: ok, error: eUp } = await supabase.from(map.tabela)
      .update({ [map.col]: p.membro_id })
      .eq('id', l.ref_id).is(map.col, null)
      .select('id').maybeSingle();
    if (eUp) throw eUp;
    if (ok) ligadas.push({ porta: l.porta, tabela: map.tabela, inscricao_id: l.ref_id, linha: l });
    else jaLigadas.push({ porta: l.porta, inscricao_id: l.ref_id });
  }

  if (!ligadas.length) {
    return {
      status: 409,
      body: {
        error: naoMapeadas.length
          ? `Nenhuma linha ligada: porta(s) ${[...new Set(naoMapeadas)].join(', ')} sem ponteiro mapeado — resolva pelo módulo dono`
          : 'Essas inscrições já estão ligadas a algum cadastro — recarregue a fila',
        ja_ligadas: jaLigadas.length,
      },
    };
  }

  // Contrato de porta: o vínculo novo é uma observação de identidade — com os
  // dados DA INSCRIÇÃO, não os do candidato. Registrar o que o cadastro já
  // tinha não acrescenta chave nenhuma; o que faz a próxima porta encontrar
  // essa pessoa é o telefone/CPF que ela usou no formulário.
  try {
    const { registrarObservacaoSegura } = require('../services/identidadeProgressiva');
    for (const g of ligadas) {
      const l = g.linha || {};
      await registrarObservacaoSegura({
        membroId: p.membro_id,
        nome: l.nome_display || m.nome,
        telefone: l.telefone_norm || null,
        cpf: l.cpf_norm || null,
        email: l.email_norm || null,
        dataNascimento: l.nascimento || null,
        origem: 'fila_identidade:' + g.porta,
        origemId: String(g.inscricao_id),
      });
    }
  } catch (e) { console.warn('[ligar-inscricao] observação:', e.message); }

  // Contato divergente ACUMULA (mem_contatos · nunca sobrescreve o principal).
  // É o que o matcher consulta pra achar a pessoa na porta seguinte.
  try {
    const { registrarContatoDaPorta } = require('../services/membroMatch');
    for (const g of ligadas) {
      const l = g.linha || {};
      if (l.telefone_norm || l.email_norm) {
        registrarContatoDaPorta(p.membro_id, { telefone: l.telefone_norm, email: l.email_norm }, 'fila_identidade:' + g.porta);
      }
    }
  } catch (e) { console.warn('[ligar-inscricao] contato:', e.message); }

  // CPF que veio na inscrição e o cadastro não tem → consolida pelo caminho
  // canônico. `confianca: 'forte'` porque a decisão é HUMANA e auditada
  // (`resolvida_por`), não um match por sinal fraco; conflito de CPF continua
  // virando pendência, nunca fusão automática. O nascimento da inscrição vai
  // junto justamente pra guarda de divergência funcionar.
  let cpfTardio = null;
  const comCpf = ligadas.find((g) => String(g.linha?.cpf_norm || '').replace(/\D/g, '').length === 11);
  if (comCpf && !m.cpf) {
    try {
      const { reconciliarCpfTardio } = require('../services/cpfReconciliar');
      const r = await reconciliarCpfTardio({
        membroId: p.membro_id, cpf: comCpf.linha.cpf_norm,
        origem: 'fila_identidade:' + comCpf.porta, origemId: String(comCpf.inscricao_id),
        dataNascimento: comCpf.linha.nascimento || null, confianca: 'forte',
      });
      cpfTardio = r?.acao || null;
    } catch (e) { console.warn('[ligar-inscricao] cpf tardio:', e.message); }
  }

  await supabase.from('identidade_pendencias').update({
    status: 'resolvida',
    resolvida_por: userId,
    resolvida_em: new Date().toISOString(),
  }).eq('id', p.id).eq('status', 'pendente');

  await registrarResolucaoEntrada({
    tipo: 'identidade', acao: exigirForte ? 'inscricao_vinculada_lote' : 'inscricao_vinculada',
    membro_principal_id: p.membro_id, membro_secundario_id: null,
    origem: 'identidade_pendencias', origem_id: String(p.id),
    detalhe: {
      chave_pessoa: p.origem_id,
      ligadas: ligadas.map((g) => ({ porta: g.porta, tabela: g.tabela, inscricao_id: g.inscricao_id })),
      ja_ligadas: jaLigadas,
      nao_mapeadas: [...new Set(naoMapeadas)],
      cpf_tardio: cpfTardio,
      forca: avaliacao?.forca || null,
      motivo_forca: avaliacao?.motivo || null,
    },
    resolvido_por: userId,
  });

  return {
    status: 200,
    body: {
      ok: true,
      membro_id: p.membro_id,
      membro_nome: m.nome || null,
      ligadas: ligadas.length,
      portas: [...new Set(ligadas.map((g) => g.porta))],
      ja_ligadas: jaLigadas.length,
      nao_mapeadas: [...new Set(naoMapeadas)],
      cpf_tardio: cpfTardio,
      forca: avaliacao?.forca || null,
    },
  };
}

// Casca fina sobre o core (a régua vive num lugar só).
router.post('/identidade-pendencias/:id/ligar-inscricao', async (req, res) => {
  try {
    if (nivelFilaIdentidade(req) < 3) return res.status(403).json({ error: 'Sem permissão para agir na fila' });
    const { data: p, error } = await supabase.from('identidade_pendencias')
      .select('*').eq('id', req.params.id).maybeSingle();
    if (error) throw error;
    const r = await ligarInscricaoCore(p, { userId: req.user?.id || null });
    res.status(r.status).json(r.body);
  } catch (e) {
    console.error('[membresia/identidade-pendencias/ligar-inscricao]', e.message);
    res.status(500).json({ error: 'Erro ao ligar a inscrição ao cadastro' });
  }
});

// POST /api/membresia/identidade-pendencias/ligar-lote  { ids: [...] }
// Liga em massa as pendências cuja evidência é FORTE. Pedido do Matheus em
// 05/08 depois de resolver 110 pendências clicando uma por uma.
//
// ⚠️ O payload diz QUAIS, nunca SE PODE: cada pendência é relida do banco e a
// força é REAVALIADA aqui (`exigirForte`). Bundle antigo, id colado à mão ou
// pendência que mudou entre a tela e o clique não furam a régua.
//
// ⚠️ SEQUENCIAL de propósito (mesma razão do `aprovar-lote` da Membresia): cada
// ligação passa pelo matcher, por `mem_contatos` e pode consolidar CPF tardio —
// em paralelo, duas pessoas da mesma família correriam no matcher ao mesmo
// tempo e poderiam gerar a duplicata que esta fila existe pra limpar.
//
// ⚠️ `lerLinhasOrfas` roda UMA vez pro lote inteiro. Por item seriam ~380
// linhas × N requisições ao PostgREST.
router.post('/identidade-pendencias/ligar-lote', async (req, res) => {
  try {
    if (nivelFilaIdentidade(req) < 3) return res.status(403).json({ error: 'Sem permissão para agir na fila' });
    const ids = [...new Set((Array.isArray(req.body?.ids) ? req.body.ids : [])
      .map((v) => String(v || '').trim()).filter((v) => UUID_RE.test(v)))];
    if (!ids.length) return res.status(400).json({ error: 'Informe os ids das pendências a ligar' });
    if (ids.length > 100) return res.status(400).json({ error: 'Máximo de 100 pendências por lote' });

    const { data: pend, error } = await supabase.from('identidade_pendencias')
      .select('*').in('id', ids);
    if (error) throw error;
    const porId = new Map((pend || []).map((p) => [p.id, p]));

    // A view é lida uma vez e reusada por todos os itens do lote.
    const orfas = await lerLinhasOrfas(supabase);

    const ligadas = [], recusadas = [];
    let linhasLigadas = 0;
    for (const id of ids) {
      const p = porId.get(id);
      if (!p) { recusadas.push({ id, motivo: 'Pendência não encontrada' }); continue; }
      let r;
      try {
        r = await ligarInscricaoCore(p, {
          userId: req.user?.id || null, orfas, exigirForte: true,
        });
      } catch (e) {
        console.error('[ligar-lote] item', id, e.message);
        recusadas.push({ id, motivo: 'Erro ao ligar — tente individualmente' });
        continue;
      }
      if (r.status === 200) {
        linhasLigadas += r.body.ligadas || 0;
        ligadas.push({ id, nome: r.body.membro_nome || null, linhas: r.body.ligadas, portas: r.body.portas, forca: r.body.forca });
      } else {
        recusadas.push({ id, motivo: r.body?.error || 'Não foi possível ligar' });
      }
    }

    // ⚠️ UM aviso com o resumo, nunca um por pessoa: sem regra configurada o
    // `notificar` cai no fallback de todos os admin/diretor (16), e 50 ligações
    // gerariam ~800 linhas — o sino enterrado. Lição do censo/aprovar-lote:
    // aviso é pra trabalho PENDENTE, e lote ligado é trabalho FEITO.
    if (ligadas.length) {
      try {
        const { notificar } = require('../services/notificar');
        await notificar({
          modulo: 'membresia',
          tipo: 'identidade_lote_ligado',
          titulo: `${ligadas.length} inscrição(ões) ligada(s) ao cadastro em lote`,
          mensagem: `${linhasLigadas} linha(s) de inscrição de ${ligadas.length} pessoa(s) foram ligadas ao cadastro`
            + (recusadas.length ? ` · ${recusadas.length} ficaram para decisão manual` : '')
            + '. Evidência exigida: CPF igual ou telefone + nome completo idêntico.',
          link: '/entradas',
          chaveDedup: `identidade_lote_${new Date().toISOString().slice(0, 10)}`,
        });
      } catch (e) { console.warn('[ligar-lote] notificação:', e.message); }
    }

    res.json({
      ok: true,
      ligadas: ligadas.length,
      linhas_ligadas: linhasLigadas,
      recusadas: recusadas.length,
      detalhe_ligadas: ligadas,
      detalhe_recusadas: recusadas,
    });
  } catch (e) {
    console.error('[membresia/identidade-pendencias/ligar-lote]', e.message);
    res.status(500).json({ error: 'Erro ao ligar as inscrições em lote' });
  }
});

// POST /api/membresia/identidade-pendencias/:id/status · resolvida|descartada
// Descartada = "avaliado e rejeitado": o cron do wifi NÃO recria (guarda
// anti-zumbi). Resolvida = tratado por fora (fusão, edição do cadastro…).
router.post('/identidade-pendencias/:id/status', async (req, res) => {
  try {
    if (nivelFilaIdentidade(req) < 3) return res.status(403).json({ error: 'Sem permissão para agir na fila' });
    const status = req.body?.status;
    if (!['resolvida', 'descartada'].includes(status)) {
      return res.status(400).json({ error: 'status deve ser resolvida ou descartada' });
    }
    const { data, error } = await supabase.from('identidade_pendencias').update({
      status,
      resolvida_por: req.user?.id || null,
      resolvida_em: new Date().toISOString(),
    }).eq('id', req.params.id).eq('status', 'pendente')
      .select('id, tipo, membro_id, membro_conflito_id');
    if (error) throw error;
    if (!data || data.length === 0) return res.status(409).json({ error: 'Pendência já triada' });
    const p = data[0];
    await registrarResolucaoEntrada({
      tipo: 'identidade', acao: status === 'descartada' ? 'descartado' : 'resolvido',
      membro_principal_id: p.membro_id || null, membro_secundario_id: p.membro_conflito_id || null,
      origem: 'identidade_pendencias', origem_id: String(p.id),
      detalhe: { tipo_pendencia: p.tipo }, resolvido_por: req.user?.id || null,
    });
    res.json({ ok: true });
  } catch (e) {
    console.error('[membresia/identidade-pendencias/status]', e.message);
    res.status(500).json({ error: 'Erro ao atualizar a pendência' });
  }
});

// ============================================================================
// PEDIDOS DE EXCLUSAO DE CONTA (LGPD art. 18) · 06/08/2026 · Onda 1b
// ============================================================================
//
// O QUE ESTAVA ABERTO: o app grava em `app_solicitacoes_exclusao` e promete
// "em breve sua conta sera desativada" — e o ERP **nao lia essa tabela em lugar
// nenhum**. Grep no repo inteiro: zero rotas, zero telas, zero servicos. O
// primeiro pedido cairia num buraco com o prazo da LGPD correndo, e a Apple
// TESTA esse fluxo na revisao da loja. Hoje a tabela esta VAZIA (0 pedidos) —
// entao isto e gatilho armado, e e o melhor momento pra construir.
//
// ⚠️ ESTA ONDA E SO LEITOR. Nao processa, nao desativa, nao apaga. Motivo: **nao
// existe nenhum caminho de desativacao de conta no sistema** (o unico
// `auth.admin.deleteUser` do repo e script de teste; `ban_duration` tem 0
// ocorrencias; `profiles.active` e so LIDO — nada nunca escreve false). Decidir
// o que a igreja RETEM por obrigacao legal/fiscal (contribuicao, batismo) antes
// de desativar e decisao do Marcos, nao efeito colateral de um endpoint.
//
// ⚠️ O app grava DIRETO no Supabase com o JWT da pessoa (`configuracoes.tsx`),
// sem passar por aqui — entao nao existe hook no servidor pra avisar na hora. A
// fila e PULL (esta rota + o bloco na tela) e e o que tira o pedido do buraco
// hoje. O aviso periodico esta escrito em `notificacaoGenerator`, mas depende de
// um cron que NAO esta agendado (ver o comentario la).
//
// Nivel 3 = o mesmo do export LGPD (`routes/lgpd.js`): e dado de pessoa pedindo
// pra sair, nao leitura de painel.
router.get('/exclusoes', authorizeModule('membresia', 3), async (req, res) => {
  try {
    const { status } = req.query;
    let q = supabase
      .from('app_solicitacoes_exclusao')
      .select('id, user_id, motivo, detalhe, status, criada_em, processada_em')
      .order('criada_em', { ascending: false })
      .limit(200);
    // A coluna nao tem CHECK (o 'pendente|processado|cancelado' do .sql e so
    // comentario), entao o filtro e permissivo de proposito.
    if (status && typeof status === 'string') q = q.eq('status', status);
    const { data, error } = await q;
    if (error) throw error;

    const linhas = data || [];
    // Nome/e-mail vem de `profiles` em consulta SEPARADA e best-effort: se ela
    // falhar, a fila ainda aparece (com o id) em vez de sumir. E a regua do
    // select isolado — pedir coluna inexistente derruba a query inteira.
    let porUser = {};
    const ids = [...new Set(linhas.map((l) => l.user_id).filter(Boolean))];
    if (ids.length) {
      const { data: profs } = await supabase
        .from('profiles')
        .select('id, name, email')
        .in('id', ids);
      porUser = Object.fromEntries((profs || []).map((p) => [p.id, p]));
    }

    const itens = linhas.map((l) => {
      const p = porUser[l.user_id] || null;
      return {
        id: l.id,
        user_id: l.user_id,
        nome: (p && p.name) || null,
        email: (p && p.email) || null,
        motivo: l.motivo || null,
        detalhe: l.detalhe || null,
        status: l.status || 'pendente',
        criada_em: l.criada_em,
        processada_em: l.processada_em || null,
      };
    });

    res.json({
      itens,
      total: itens.length,
      total_pendentes: itens.filter((i) => i.status === 'pendente').length,
      // ⚠️ A tela DIZ que ninguem processa automaticamente. Prometer menos do que
      // o sistema faz e melhor que o contrario — e era justamente a promessa
      // vazia do app que criou este problema.
      aviso_processamento:
        'A desativacao de conta ainda e manual e nao existe no sistema: trate com '
        + 'a secretaria e registre o atendimento. O prazo da LGPD (art. 18) e de 15 dias.',
    });
  } catch (e) {
    console.error('[membresia/exclusoes]', e.message);
    res.status(500).json({ error: 'Erro ao carregar os pedidos de exclusao de conta' });
  }
});

module.exports = router;
