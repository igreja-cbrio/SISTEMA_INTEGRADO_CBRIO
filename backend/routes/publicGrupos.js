// Endpoints públicos (sem auth) para o formulário de cadastro / inscrição
// poder buscar grupos. Read-only — sem mutation aqui.
const router = require('express').Router();
const rateLimit = require('express-rate-limit');
const multer = require('multer');
const { supabase } = require('../utils/supabase');
const { uploadModuleFile, SHAREPOINT_CONFIGURED } = require('../services/storageService');
const {
  normalizarCpf, normalizarTelefone, normalizarEmail, nomesMesmaPessoa,
  acharMembroGuardado, acharOuCriarGuardado, registrarContatoDaPorta,
} = require('../services/membroMatch');
const {
  verificarToken, notificarLiderNovoPedido, formatarQuando, formatarOnde,
  montarEnvioFrequencia, rotuloMes, enviarInscricaoConfirmada,
} = require('../services/gruposWhatsapp');
const { processarFila, enfileirarLote } = require('../services/whatsappFila');
const { enviosAutomaticosAtivos } = require('../services/gruposEnviosConfig');
const { registrarEventoPedido } = require('../services/grupoPedidoEventos');
const { registrarObservacaoSegura } = require('../services/identidadeProgressiva');
const {
  temAbreviacaoNome, registrarConsentimentos, cpfValido, emailValido,
  validarCamposPadrao, // régua única dos campos padrão (usada no bloco do cônjuge)
  tirarCodigoPaisTelefone, // "+55 21 9..." colado do contato não pode comer o DDD
} = require('../services/inscricaoContrato');
// "Dá pra falar com essa pessoa?" — telefone estrangeiro/errado manda o líder
// pro e-mail (varredura do lançamento 02/08 · services/contatoPessoa.js).
const { contatoParaLider } = require('../services/contatoPessoa');
const { requireCron } = require('../utils/cronAuth');
// Régua ÚNICA de busca (acento/caixa/espaço) · espelho de src/lib/busca.js.
const { normalizarBusca, contemNormalizado, algumContemNormalizado } = require('../services/busca');

// ── Rate limit dedicado do totem de inscrição de grupos ──
// O formulário roda num navegador quiosque no lounge (1 IP) e, num domingo
// cheio, dezenas de pessoas se inscrevem pela MESMA rede → o teto público
// global (30/15min por IP) travaria o totem no meio do culto. Aqui é generoso
// e configurável (mesma ideia do NPS público). O mount em server.js coloca
// /api/public/grupos ANTES do publicLimiter estrito e o isenta do teto global,
// então este é o único limiter que governa as rotas de grupos públicos.
const totemLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  // 1000 (não 300): totem e WiFi da igreja compartilham 1 IP — num domingo
  // cheio, ~6 requests por inscrição × dezenas de pessoas estoura 300/15min.
  // 10.000 = mesmo teto do NPS público (publicNps.js), e por isso: no culto a
  // igreja toda sai por UM IP (o subsolo não tem 4G). Cada pessoa gasta ~4
  // requisições no fluxo, então 1.000 dava ~250 pessoas por janela de 15 min —
  // e quem estourasse via "Nenhum grupo encontrado", não aviso de excesso.
  max: parseInt(process.env.GRUPOS_PUBLIC_RATE_LIMIT_MAX) || (process.env.NODE_ENV === 'production' ? 10000 : 20000),
  message: { error: 'Muitas tentativas em pouco tempo. Aguarde um instante e tente de novo.' },
  skip: () => process.env.NODE_ENV !== 'production',
  standardHeaders: true,
  legacyHeaders: false,
});
router.use(totemLimiter);

// Upload de foto (opcional) — memory storage, mesmo padrão do form de membresia.
const uploadMw = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) cb(null, true);
    else cb(new Error('Formato de imagem não suportado.'));
  },
});

const RATE_HEADERS = ['x-forwarded-for'];
function getIp(req) {
  return (req.headers[RATE_HEADERS[0]] || '').toString().split(',')[0].trim() || req.ip;
}

function distanciaKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// buscarApelidos · apelido do líder ("como a pessoa é conhecida na igreja" ·
// ex.: o Antonio Marco Pereira é o "Tuninho"). Entra na BUSCA sem poluir a
// exibição do nome real.
//
// ⚠️ SELECT ISOLADO e BEST-EFFORT de propósito: se a migration da coluna
// `apelido` ainda não foi aplicada, pedir a coluna faz o PostgREST recusar a
// query INTEIRA (lição do `parcelas_max`) — e a busca de grupos cairia pra
// TODO MUNDO. Aqui a falha só significa "sem apelido nesta resposta".
async function buscarApelidos(ids) {
  const mapa = {};
  const unicos = [...new Set((ids || []).filter(Boolean))];
  if (!unicos.length) return mapa;
  for (let i = 0; i < unicos.length; i += 200) { // .in() em lote (URL do PostgREST)
    const { data, error } = await supabase.from('mem_membros')
      .select('id, apelido').in('id', unicos.slice(i, i + 200));
    if (error) {
      console.warn('[public grupos] apelido indisponível (migration pendente?):', error.message);
      return {};
    }
    (data || []).forEach(m => {
      const ap = (m.apelido || '').trim();
      if (ap) mapa[m.id] = ap;
    });
  }
  return mapa;
}

// Nome como a pessoa reconhece: "Antonio Marco Pereira (Tuninho)".
function nomeComApelido(nome, apelido) {
  if (!nome) return null;
  return apelido ? `${nome} (${apelido})` : nome;
}

// Régua ÚNICA de montagem das listas de líderes de um grupo (principal do
// mem_grupos.lider_id + líderes ADICIONAIS do roster · Natasha 20/08: TODOS os
// líderes aparecem no cartão e acham o grupo na busca). Usada pelo /buscar e
// pelo GET /:id (deep-link ?grupo= do QR/mapa) — duplicar era o que fazia o
// deep-link mostrar só o principal.
// lideres_nomes / lider_nome = SÓ nomes reais (é o que a equipe cadastrou).
// lideres_exibicao = "Nome (Apelido)" · lideres_busca = nomes + apelidos.
function montarListaLideres({ principalNome, principalId, roster = [], apelidos = {} }) {
  const lideresNomes = [];
  const lideresExibicao = [];
  const lideresBusca = [];
  const addLider = (nome, membroId) => {
    if (!nome || lideresNomes.includes(nome)) return;
    const ap = membroId ? (apelidos[membroId] || null) : null;
    lideresNomes.push(nome);
    lideresExibicao.push(nomeComApelido(nome, ap));
    lideresBusca.push(nome);
    if (ap) lideresBusca.push(ap);
  };
  addLider(principalNome, principalId);
  roster.forEach(r => addLider(r.nome, r.membro_id));
  return {
    lideres_nomes: lideresNomes,
    lideres_exibicao: lideresExibicao,
    lideres_busca: [...new Set(lideresBusca)],
  };
}

// Líderes do roster de UM grupo (funcao lider/co_lider · vínculo vivo).
// Best-effort: falha aqui não pode derrubar o deep-link — devolve [] e o
// grupo fica só com o principal (comportamento anterior).
async function rosterLideresDoGrupo(grupoId) {
  try {
    const { data, error } = await supabase.from('mem_grupo_membros')
      .select('membro_id, mem_membros!inner(nome)')
      .eq('grupo_id', grupoId)
      .in('funcao', ['lider', 'co_lider'])
      .is('saiu_em', null).is('deleted_at', null);
    if (error) {
      console.warn('[public grupos] roster de líderes indisponível:', error.message);
      return [];
    }
    return (data || [])
      .filter(v => v.mem_membros?.nome)
      .map(v => ({ nome: v.mem_membros.nome, membro_id: v.membro_id || null }));
  } catch (e) {
    console.warn('[public grupos] roster de líderes falhou:', e.message);
    return [];
  }
}

// GET /api/public/grupos/temporadas
router.get('/temporadas', async (req, res) => {
  try {
    const { data } = await supabase.from('mem_temporadas').select('id, label, ano, numero, ativa, inscricoes_abertas').order('ano', { ascending: false }).order('numero', { ascending: false });
    res.json(data || []);
  } catch { res.status(500).json({ error: 'Erro' }); }
});

// Régua ÚNICA de "grupo aberto pra inscrição" — form público (/buscar) E app
// mobile (/app-inscricao · auditoria do app 03/08, item 1). Mudou a regra?
// Muda AQUI, nunca numa cópia: era uma régua duplicada (o app lia mem_grupos
// cru + a tabela paralela app_grupos_temporada) que fazia o app listar grupo
// fechado e dizer "temporada fechada" com a temporada aberta.
async function buscarGruposInscriveis({ categoria, bairro, temporada } = {}) {
  let query = supabase.from('mem_grupos')
    .select('id, codigo, nome, categoria, faixa_etaria, idade_min, idade_max, dia_semana, horario, recorrencia, local, descricao, bairro, lat, lng, lider_id, status_temporada, temporada, foto_url, modo_inscricao')
    .eq('ativo', true)
    .is('deleted_at', null) // soft-deletado some do form (a temporada aberta não o esconde)
    .eq('aceitando_inscricoes', true) // líder pode ter parado de receber pedidos
    .neq('modo_inscricao', 'fechado'); // por convite do líder — nunca aparece
  // Por padrão mostra so grupos com status que aceitam novos (ativo + novo + a_confirmar)
  query = query.in('status_temporada', ['ativo', 'novo', 'a_confirmar']);
  if (categoria) query = query.eq('categoria', categoria);
  if (bairro) query = query.eq('bairro', bairro);
  if (temporada) query = query.eq('temporada', temporada);
  query = query.order('nome');

  const { data: gruposCrus, error } = await query;
  if (error) throw error;

  // Visibilidade por modo (Marcos · 15/07): 'temporada' aparece só com as
  // inscrições da temporada abertas; 'sempre_aberto' aparece o ano todo.
  const { data: temporadasAll } = await supabase.from('mem_temporadas')
    .select('id, label, ano, numero, inscricoes_abertas');
  const abertas = new Set((temporadasAll || []).filter(t => t.inscricoes_abertas).map(t => t.id));
  const grupos = (gruposCrus || []).filter(g =>
    g.modo_inscricao === 'sempre_aberto'
    || (g.modo_inscricao !== 'fechado' && (!g.temporada || abertas.has(g.temporada))));
  return { grupos, temporadas: temporadasAll || [] };
}

// GET /api/public/grupos/app-inscricao — fonte ÚNICA da tela de inscrição do
// APP mobile. Substitui a leitura da tabela paralela `app_grupos_temporada`
// (2 camadas pro mesmo fato: nenhuma tela do web escrevia nela, e o app dizia
// "temporada fechada" com a T2 aberta). `aberta` deriva da LISTA — grupo
// sempre_aberto mantém a inscrição possível mesmo fora de temporada.
// ⚠️ Declarada ANTES de GET /:id (senão o Express casa como id).
router.get('/app-inscricao', async (_req, res) => {
  try {
    const { grupos, temporadas } = await buscarGruposInscriveis();
    const atual = temporadas
      .filter(t => t.inscricoes_abertas)
      .sort((a, b) => (b.ano - a.ano) || (b.numero - a.numero))[0] || null;
    res.json({
      aberta: grupos.length > 0,
      titulo: atual?.label || null,
      grupos: grupos.map(g => ({
        id: g.id,
        codigo: g.codigo,
        nome: g.nome,
        categoria: g.categoria,
        bairro: g.bairro,
        dia_semana: g.dia_semana,
        horario: g.horario,
        recorrencia: g.recorrencia,
        modo_inscricao: g.modo_inscricao,
      })),
    });
  } catch (e) {
    console.error('[public grupos app-inscricao]', e.message);
    res.status(500).json({ error: 'Erro ao carregar grupos' });
  }
});

// GET /api/public/grupos/buscar
router.get('/buscar', async (req, res) => {
  try {
    const { lider_nome, categoria, bairro, cep, raio_km, temporada, q } = req.query;
    const { grupos } = await buscarGruposInscriveis({ categoria, bairro, temporada });

    // Enriquecer com líder principal (mem_grupos.lider_id — é quem recebe a
    // aprovação por WhatsApp) + líderes ADICIONAIS do roster (funcao lider/
    // co_lider · Marcos 15/07: grupo com dois líderes aparece na busca por
    // QUALQUER um deles).
    const liderIds = [...new Set((grupos || []).map(g => g.lider_id).filter(Boolean))];
    let lideresMap = {};
    if (liderIds.length > 0) {
      const { data: lideres } = await supabase.from('mem_membros').select('id, nome, foto_url').in('id', liderIds);
      (lideres || []).forEach(l => { lideresMap[l.id] = l; });
    }
    const gIds = (grupos || []).map(g => g.id);
    const rosterLideres = {};
    for (let i = 0; i < gIds.length; i += 200) {
      const { data: rl } = await supabase.from('mem_grupo_membros')
        .select('grupo_id, membro_id, mem_membros!inner(nome)')
        .in('grupo_id', gIds.slice(i, i + 200))
        .in('funcao', ['lider', 'co_lider'])
        .is('saiu_em', null).is('deleted_at', null);
      (rl || []).forEach(v => {
        if (!v.mem_membros?.nome) return;
        (rosterLideres[v.grupo_id] = rosterLideres[v.grupo_id] || [])
          .push({ nome: v.mem_membros.nome, membro_id: v.membro_id || null });
      });
    }

    // Apelidos de TODOS os líderes visíveis (principal + roster) — 1 consulta,
    // isolada e tolerante à coluna ausente.
    const apelidos = await buscarApelidos([
      ...liderIds,
      ...Object.values(rosterLideres).flat().map(r => r.membro_id),
    ]);

    let resultado = (grupos || []).map(g => {
      const principal = lideresMap[g.lider_id]?.nome || null;
      return {
        ...g,
        lider_nome: principal,
        lider_apelido: g.lider_id ? (apelidos[g.lider_id] || null) : null,
        lider_foto: lideresMap[g.lider_id]?.foto_url || null,
        ...montarListaLideres({
          principalNome: principal,
          principalId: g.lider_id,
          roster: rosterLideres[g.id] || [],
          apelidos,
        }),
      };
    });

    // Busca de líder = nome OU apelido, insensível a acento/caixa/espaço.
    // Fallback pra lideres_nomes: bundle antigo/deploy em 2 etapas.
    const alvosLider = (g) => (g.lideres_busca && g.lideres_busca.length ? g.lideres_busca : (g.lideres_nomes || []));
    if (lider_nome) {
      resultado = resultado.filter(g => algumContemNormalizado(alvosLider(g), lider_nome));
    }
    if (q) {
      resultado = resultado.filter(g =>
        contemNormalizado(g.nome, q)
        || algumContemNormalizado(alvosLider(g), q)
        || contemNormalizado(g.bairro, q)
        || contemNormalizado(g.local, q)
        || contemNormalizado(g.codigo, q)
      );
    }

    if (cep && raio_km) {
      const cepLimpo = String(cep).replace(/\D/g, '');
      if (cepLimpo.length === 8) {
        try {
          const viaCepRes = await fetch(`https://viacep.com.br/ws/${cepLimpo}/json/`);
          const viaCep = await viaCepRes.json();
          if (!viaCep.erro) {
            const qStr = encodeURIComponent(`${viaCep.logradouro || ''} ${viaCep.localidade} ${viaCep.uf} Brasil`.trim());
            const nomRes = await fetch(`https://nominatim.openstreetmap.org/search?q=${qStr}&format=json&limit=1`, {
              headers: { 'User-Agent': 'CBRio-Sistema/1.0 (contato@cbrio.com.br)' },
            });
            const nom = await nomRes.json();
            const cepLat = nom?.[0] ? parseFloat(nom[0].lat) : null;
            const cepLng = nom?.[0] ? parseFloat(nom[0].lon) : null;
            const raio = parseFloat(raio_km) || 20;
            if (cepLat != null && cepLng != null) {
              resultado = resultado
                .filter(g => g.lat != null && g.lng != null)
                .map(g => ({ ...g, dist_km: distanciaKm(cepLat, cepLng, Number(g.lat), Number(g.lng)) }))
                .filter(g => g.dist_km <= raio)
                .sort((a, b) => a.dist_km - b.dist_km);
            }
          }
        } catch (e) { console.warn('[public grupos buscar geocode]', e.message); }
      }
    }

    res.json(resultado);
  } catch (e) { console.error('[public grupos buscar]', e.message); res.status(500).json({ error: 'Erro ao buscar grupos' }); }
});

// GET /api/public/grupos/lideres/buscar?q=&temporada=
router.get('/lideres/buscar', async (req, res) => {
  try {
    const { q, temporada } = req.query;
    const term = normalizarBusca(q);
    if (term.length < 2) return res.json([]);

    let query = supabase.from('mem_grupos').select('lider_id').eq('ativo', true).is('deleted_at', null).not('lider_id', 'is', null);
    if (temporada) query = query.eq('temporada', temporada);
    const { data: grupos } = await query;
    const liderIds = [...new Set((grupos || []).map(g => g.lider_id))];
    if (!liderIds.length) return res.json([]);

    // O filtro saiu do `ilike` pro JS: `ilike` é acento-SENSÍVEL (quem digita
    // "Antônio" não achava "ANTONIO") e não alcança o apelido. São dezenas de
    // líderes por temporada — trazer e filtrar aqui é barato.
    const lideres = [];
    for (let i = 0; i < liderIds.length; i += 200) {
      const { data } = await supabase.from('mem_membros')
        .select('id, nome, foto_url').in('id', liderIds.slice(i, i + 200));
      lideres.push(...(data || []));
    }
    const apelidos = await buscarApelidos(liderIds);

    const casam = lideres
      .map(l => ({ ...l, apelido: apelidos[l.id] || null }))
      .filter(l => contemNormalizado(l.nome, q) || contemNormalizado(l.apelido, q))
      .sort((a, b) => String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR'))
      .slice(0, 20)
      // nome_exibicao é ADITIVO (o shape antigo id/nome/foto_url continua) —
      // a UI pode mostrar "Antonio Marco Pereira (Tuninho)" sem montar nada.
      .map(l => ({ ...l, nome_exibicao: nomeComApelido(l.nome, l.apelido) }));

    res.json(casam);
  } catch { res.status(500).json({ error: 'Erro' }); }
});

// GET /api/public/grupos/:id — usado pelo formulário público
// quando o link vem com ?grupo=<id> (ex.: clique no mapa).
router.get('/:id', async (req, res) => {
  try {
    const { data: grupo, error } = await supabase
      .from('mem_grupos')
      .select('id, codigo, nome, categoria, faixa_etaria, idade_min, idade_max, dia_semana, horario, recorrencia, local, descricao, bairro, lat, lng, lider_id, status_temporada, temporada, foto_url, complemento, ativo, aceitando_inscricoes, modo_inscricao')
      .eq('id', req.params.id)
      .is('deleted_at', null)
      .maybeSingle();
    if (error) throw error;
    if (!grupo || !grupo.ativo) return res.status(404).json({ error: 'Grupo não encontrado' });

    let lider_nome = null;
    let lider_foto = null;
    if (grupo.lider_id) {
      const { data: lider } = await supabase.from('mem_membros').select('nome, foto_url').eq('id', grupo.lider_id).maybeSingle();
      if (lider) { lider_nome = lider.nome; lider_foto = lider.foto_url; }
    }
    // Líderes ADICIONAIS do roster também no deep-link (?grupo=<id> do QR/mapa):
    // sem isso, quem chegava por QR via só o principal enquanto a busca mostrava
    // todos (Natasha 20/08 · grupo da Ana Paula tem 2 líderes). Roster e apelido
    // são best-effort — falha degrada pro principal, nunca quebra a página.
    const roster = await rosterLideresDoGrupo(grupo.id);
    // Apelido isolado/best-effort (deep-link ?grupo=<id> não pode quebrar se a
    // coluna ainda não existir).
    const apelidos = await buscarApelidos([grupo.lider_id, ...roster.map(r => r.membro_id)]);
    const lider_apelido = grupo.lider_id ? (apelidos[grupo.lider_id] || null) : null;
    res.json({
      ...grupo,
      lider_nome,
      lider_apelido,
      lider_foto,
      ...montarListaLideres({
        principalNome: lider_nome,
        principalId: grupo.lider_id,
        roster,
        apelidos,
      }),
    });
  } catch (e) {
    console.error('[public grupos getById]', e.message);
    res.status(500).json({ error: 'Erro ao buscar grupo' });
  }
});

// GET /api/public/grupos/lideres/:liderId/grupos — mesma regra de
// visibilidade do /buscar (fechado nunca · temporada só aberta · sempre_aberto).
router.get('/lideres/:liderId/grupos', async (req, res) => {
  try {
    const { temporada } = req.query;
    let query = supabase.from('mem_grupos')
      .select('id, codigo, nome, categoria, faixa_etaria, idade_min, idade_max, dia_semana, horario, recorrencia, local, descricao, bairro, lat, lng, lider_id, status_temporada, temporada, modo_inscricao')
      .eq('lider_id', req.params.liderId).eq('ativo', true)
      .is('deleted_at', null)
      .eq('aceitando_inscricoes', true)
      .neq('modo_inscricao', 'fechado')
      .in('status_temporada', ['ativo', 'novo', 'a_confirmar']);
    if (temporada) query = query.eq('temporada', temporada);
    const { data, error } = await query.order('nome');
    if (error) throw error;
    const { data: temporadasAll } = await supabase.from('mem_temporadas').select('id, inscricoes_abertas');
    const abertas = new Set((temporadasAll || []).filter(t => t.inscricoes_abertas).map(t => t.id));
    res.json((data || []).filter(g =>
      g.modo_inscricao === 'sempre_aberto' || !g.temporada || abertas.has(g.temporada)));
  } catch { res.status(500).json({ error: 'Erro' }); }
});

// ── Inscrição publica em grupo (POST sem auth) ──
const { notificar } = require('../services/notificar');
const { donosDoGrupo } = require('../services/gruposDestinatarios');
const { avisarPedidoNovoNoApp } = require('../services/gruposAvisoApp');

function soDigitos(v) { return (v || '').toString().replace(/\D+/g, ''); }

// Telefone só pra EXIBIÇÃO em mensagem (aviso do líder). O que grava no banco
// é sempre digits-only (contrato de porta) — isto é apenas leitura humana.
// Tamanho inesperado volta como veio: melhor mostrar cru que esconder.
function telefoneExibicao(v) {
  const d = soDigitos(v);
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return d || '';
}
// emailValido/cpfValido agora vêm de services/inscricaoContrato (fonte única —
// P3 do sweep 28/07: as cópias locais eram idênticas, mas cópia diverge um dia).

// Só aceita foto_url que o NOSSO /upload-foto devolveu (bucket público
// fotos-membros do próprio Supabase) — nunca uma URL externa arbitrária, que
// viraria um recurso de 3º renderizado depois no ERP autenticado do líder.
function fotoUrlValida(u) {
  if (!u || typeof u !== 'string') return false;
  const s = u.slice(0, 1000);
  const raiz = process.env.SUPABASE_URL
    ? `${process.env.SUPABASE_URL.replace(/\/+$/, '')}/storage/v1/object/public/fotos-membros/`
    : null;
  if (raiz) return s.startsWith(raiz);
  return /^https:\/\/[^/]+\/storage\/v1\/object\/public\/fotos-membros\//.test(s);
}

// Pagina qualquer SELECT contornando o cap de 1000 linhas do PostgREST.
async function fetchAllRange(tabela, sel, filtros = []) {
  let todos = [], from = 0; const size = 1000;
  for (;;) {
    let q = supabase.from(tabela).select(sel).range(from, from + size - 1);
    for (const [fn, ...args] of filtros) q = q[fn](...args);
    const { data, error } = await q;
    if (error) throw error;
    todos = todos.concat(data || []);
    if (!data || data.length < size) break;
    from += size;
  }
  return todos;
}

// matchInfo · aplica a regra de dedup do Marcos entre a pessoa que está se
// inscrevendo (inc) e um cadastro já existente (cand): DISPARA se o CPF é
// exatamente igual OU se pelo menos 2 de {nome, telefone, e-mail} batem.
// O nome usa a comparação conservadora (dice ≥0.90) do membroMatch, então
// homônimos frouxos não contam. Telefone/e-mail sozinhos (1 chave fraca) não
// disparam — é o caso da família que compartilha número.
function matchInfo(inc, cand) {
  const cpfI = normalizarCpf(inc.cpf), cpfC = normalizarCpf(cand.cpf);
  const telI = normalizarTelefone(inc.telefone), telC = normalizarTelefone(cand.telefone);
  const emI = normalizarEmail(inc.email), emC = normalizarEmail(cand.email);
  const cpfMatch = !!(cpfI && cpfC && cpfI === cpfC);
  const motivos = []; let fracos = 0;
  if (cpfMatch) motivos.push('cpf');
  if (telI && telC && telI === telC) { fracos++; motivos.push('telefone'); }
  if (emI && emC && emI === emC) { fracos++; motivos.push('email'); }
  if (inc.nome && cand.nome && nomesMesmaPessoa(inc.nome, cand.nome)) { fracos++; motivos.push('nome'); }
  return { dispara: cpfMatch || fracos >= 2, motivos };
}

// checarDuplicataInscricao · procura, DENTRO do grupo alvo, alguém que já bata
// com a pessoa (roster ativo OU pedido pendente). Retorna o tipo do achado
// ('membro_ativo' | 'pedido_pendente') pra alimentar o "é você?"; null se nada.
//
// opts.ignorarMembroIds / opts.ignorarPedidoIds excluem o CÔNJUGE já
// processado na MESMA submissão (inscrição de casal): marido e mulher
// compartilham telefone e e-mail, e 2 chaves fracas iguais fazem o matchInfo
// disparar — sem a exclusão, o 2º cônjuge seria confundido com o 1º e sua
// inscrição seria engolida como "já recebemos um pedido parecido". Só é seguro
// porque o handler barra CPF igual entre os dois (CPF igual = mesma pessoa, e
// aí o dedup DEVE disparar normalmente).
async function checarDuplicataInscricao(grupoId, inc, opts = {}) {
  const ignorarMembroIds = new Set((opts.ignorarMembroIds || []).filter(Boolean));
  const ignorarPedidoIds = new Set((opts.ignorarPedidoIds || []).filter(Boolean));
  // 1) roster ativo do grupo (com dados do membro pra comparar por chave)
  const links = await fetchAllRange('mem_grupo_membros', 'membro_id',
    [['eq', 'grupo_id', grupoId], ['is', 'saiu_em', null], ['is', 'deleted_at', null]]);
  const ids = [...new Set(links.map(l => l.membro_id).filter(Boolean))]
    .filter(id => !ignorarMembroIds.has(id));
  for (let i = 0; i < ids.length; i += 200) {
    const { data: membros } = await supabase.from('mem_membros')
      .select('id, nome, cpf, telefone, email').in('id', ids.slice(i, i + 200));
    for (const m of (membros || [])) {
      if (matchInfo(inc, m).dispara) return { tipo: 'membro_ativo' };
    }
  }
  // 2) pedidos pendentes do grupo (snapshot nome/tel/email; CPF vem do vínculo)
  const peds = await fetchAllRange('mem_grupo_pedidos',
    'id, nome, email, telefone, membro_id, cadastro_pendente_id',
    [['eq', 'grupo_id', grupoId], ['eq', 'status', 'pendente'], ['is', 'deleted_at', null]]);
  for (const p of peds) {
    if (ignorarPedidoIds.has(p.id)) continue;
    let cand = { nome: p.nome, email: p.email, telefone: p.telefone, cpf: null };
    if (p.membro_id) {
      const { data } = await supabase.from('mem_membros')
        .select('nome, cpf, telefone, email').eq('id', p.membro_id).maybeSingle();
      if (data) cand = { nome: data.nome || p.nome, cpf: data.cpf, telefone: data.telefone || p.telefone, email: data.email || p.email };
    } else if (p.cadastro_pendente_id) {
      const { data } = await supabase.from('mem_cadastros_pendentes')
        .select('nome, cpf, telefone, email').eq('id', p.cadastro_pendente_id).maybeSingle();
      if (data) cand = { nome: data.nome || p.nome, cpf: data.cpf, telefone: data.telefone || p.telefone, email: data.email || p.email };
    }
    if (matchInfo(inc, cand).dispara) return { tipo: 'pedido_pendente', pedido_id: p.id };
  }
  return null;
}

// Traduz erros do multer (formato não suportado / >5MB) em 400 JSON claro —
// senão eles pulam o handler e caem no error handler global (500 genérico).
function uploadFotoMw(req, res, next) {
  uploadMw.single('foto')(req, res, (err) => {
    if (!err) return next();
    const msg = err instanceof multer.MulterError
      ? (err.code === 'LIMIT_FILE_SIZE' ? 'Imagem muito grande (máximo 5MB).' : 'Falha no envio da imagem.')
      : (err.message || 'Formato de imagem não suportado.');
    return res.status(400).json({ error: msg });
  });
}

// POST /api/public/grupos/upload-foto — foto opcional (mesmo bucket do form de
// membresia). Governado pelo totemLimiter (generoso) pro totem não travar.
router.post('/upload-foto', uploadFotoMw, async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Imagem não fornecida' });
    const id = `grp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const ext = req.file.mimetype === 'image/png' ? 'png' : req.file.mimetype === 'image/webp' ? 'webp' : 'jpg';
    const path = `cadastros/${id}.${ext}`;

    const { error: upErr } = await supabase.storage
      .from('fotos-membros')
      .upload(path, req.file.buffer, { contentType: req.file.mimetype, upsert: true });
    if (upErr) throw upErr;

    const { data: urlData } = supabase.storage.from('fotos-membros').getPublicUrl(path);

    // Espelha no SharePoint "CRM e Pessoas" (foto de pessoa · mesmo módulo do
    // form de membresia) em background · não bloqueia a resposta.
    if (SHAREPOINT_CONFIGURED) {
      uploadModuleFile('membresia', 'Cadastros_Publicos', `${id}.${ext}`, req.file.buffer)
        .then(() => console.log(`[public grupos] foto sincronizada com SharePoint: ${id}`))
        .catch(spErr => console.error('[public grupos] SharePoint sync (nao-critico):', spErr.message));
    }

    res.json({ foto_url: urlData.publicUrl });
  } catch (e) {
    console.error('[public grupos upload-foto]', e.message);
    res.status(500).json({ error: 'Erro ao enviar foto' });
  }
});

// ─────────────────────────────────────────────────────────────
// processarPessoaPedido · a PORTA de identidade da inscrição em grupo.
//
// Extraída do handler POST /inscrever pra que o TITULAR e o CÔNJUGE (grupo de
// categoria 'Casais', inscrição em par) atravessem EXATAMENTE o mesmo funil —
// um caminho, dois chamadores. Duplicar isto seria duplicar a porta de
// identidade (Contrato de porta), o que é inaceitável.
//
// Ordem preservada do handler original: matcher canônico → enriquecimento
// só-onde-vazio → opt-in no membro → dedup direto (vínculo/pedido) + fuzzy →
// cadastro pendente → observação segura → INSERT do pedido → evento →
// consentimentos.
//
// NÃO contém as travas do GRUPO (fechado, aceitando_inscricoes, temporada,
// gênero × categoria): são do grupo, checadas UMA vez no handler.
//
// NUNCA escreve em `res` — devolve sempre um objeto:
//   { ok:true,  pedido_id, membro_id, cadastro_pendente_id }              criou
//   { ok:true,  ja_membro:true, renovado:true, mensagem, vinculo_id }     dedup amigável
//   { ok:true,  ja_pedido:true, mensagem, pedido_id }                     dedup amigável
//   { ok:false, status, codigo?, campo?, onde?, error }                   erro
//
// `principalId`/`principalMembroId` = pedido e membro do cônjuge JÁ processado
// nesta submissão (só no 2º da dupla): o pedido novo nasce já apontando pro
// par (casal_pedido_id) e o par é excluído do dedup fuzzy (telefone/e-mail
// compartilhados dariam falso positivo).
async function processarPessoaPedido({ grupo, pessoa = {}, contexto = {}, principalId = null, principalMembroId = null }) {
  const grupoId = grupo.id;
  const nomeLimpo = String(pessoa.nome || '').trim();
  const cpfLimpo = pessoa.cpf ? soDigitos(pessoa.cpf) : null;
  const emailLimpo = pessoa.email ? String(pessoa.email).trim().toLowerCase() : null;
  const telDigitos = tirarCodigoPaisTelefone(soDigitos(pessoa.telefone));
  const generoLimpo = ['masculino', 'feminino'].includes(String(pessoa.genero || '').toLowerCase())
    ? String(pessoa.genero).toLowerCase() : null;
  const dataNascimento = pessoa.data_nascimento || null;
  const fotoUrl = fotoUrlValida(pessoa.foto_url) ? String(pessoa.foto_url).slice(0, 1000) : null;
  // Endereço fixo-opcional (ajuste 28/07 do contrato) — vai pro cadastro da
  // pessoa (não pro pedido); membro existente não tem o perfil sobrescrito.
  const enderecoLimpo = pessoa.endereco ? String(pessoa.endereco).trim().slice(0, 300) : null;
  const confirmarNovo = pessoa.confirmar_novo === true;
  const souEu = pessoa.sou_eu === true;
  const optin = pessoa.whatsapp_optin === true;
  const consentimentoTexto = pessoa.consentimento_texto
    ? String(pessoa.consentimento_texto).slice(0, 2000) : null;
  const { ip: ipInsc = null, userAgent: uaInsc = null, origem = 'formulario_publico' } = contexto;

  // Roteia pro membro já existente. Quando a pessoa afirmou "não sou eu"
  // (confirmar_novo), liga SÓ por CPF (sinal individual) — e-mail/telefone/
  // nome são deniáveis e a família os compartilha.
  const achado = await acharMembroGuardado(
    { cpf: cpfLimpo, email: emailLimpo, telefone: pessoa.telefone, nome: nomeLimpo, dataNascimento },
    { soChaveForte: confirmarNovo },
  );
  const membroId = achado?.membro_id || null;

  // Já é membro: aproveita foto, sexo, data de nascimento, e-mail e telefone
  // declarados quando o cadastro ainda não os tem (enriquecimento só-onde-vazio
  // — nunca sobrescreve o que existe; política do censo, 03/08). Contato
  // DIVERGENTE do principal não é conflito nem sobrescreve: acumula em
  // mem_contatos (Contrato de porta, item 3). Roda ANTES do dedup de propósito:
  // a RENOVAÇÃO (caso dominante da virada de temporada) respondia cedo e jogava
  // fora o que a pessoa acabou de declarar (achado do sweep 28/07).
  if (membroId) {
    const { data: mem } = await supabase.from('mem_membros')
      .select('foto_url, genero, data_nascimento, email, telefone').eq('id', membroId).maybeSingle();
    if (mem) {
      const upd = {};
      if (fotoUrl && !mem.foto_url) upd.foto_url = fotoUrl;
      if (generoLimpo && !mem.genero) upd.genero = generoLimpo;
      if (dataNascimento && !mem.data_nascimento) upd.data_nascimento = dataNascimento;
      if (emailLimpo && !mem.email) upd.email = emailLimpo;
      const telAtual = soDigitos(mem.telefone);
      if (telDigitos && [10, 11].includes(telDigitos.length) && !telAtual) upd.telefone = telDigitos;
      if (Object.keys(upd).length) await supabase.from('mem_membros').update(upd).eq('id', membroId);
      // Divergente → contato secundário (mem_contatos), nunca o principal.
      const emailDiverge = emailLimpo && mem.email && String(mem.email).trim().toLowerCase() !== emailLimpo;
      const telDiverge = telDigitos && telAtual && telAtual !== telDigitos;
      if (emailDiverge || telDiverge) {
        registrarContatoDaPorta(membroId, {
          telefone: telDiverge ? telDigitos : null,
          email: emailDiverge ? emailLimpo : null,
        }, 'grupos_formulario');
      }
    }
    // CPF tardio (Contrato de porta, item 4 · mesma correção do censo em 04/08):
    // o CPF digitado no formulário consolida no cadastro que o matcher ligou.
    // Confiança espelha _consolidarCpfNoMatch (membroMatch): match por
    // nome+nascimento = 'forte'; e-mail/telefone+nome = 'fraca' (o
    // reconciliarCpfTardio só grava com nascimento conferível dos 2 lados —
    // que o enriquecimento acima acabou de preencher quando estava vazio).
    // Nascimento divergente ou CPF de outra pessoa vira identidade_pendencias
    // (fila humana), nunca fusão. Best-effort: falha aqui não derruba a porta.
    if (cpfLimpo && achado?.matched_by !== 'cpf') {
      try {
        const { reconciliarCpfTardio } = require('../services/cpfReconciliar');
        await reconciliarCpfTardio({
          membroId, cpf: cpfLimpo, origem: 'grupos_formulario',
          dataNascimento,
          confianca: achado?.matched_by === 'nome+nascimento' ? 'forte' : 'fraca',
        });
      } catch (e) {
        console.warn('[public grupos inscrever] cpf tardio:', e.message);
      }
    }
  }

  // Opt-in de WhatsApp: se consentiu e já casou com um membro, grava direto
  // (só liga). Também antes do dedup — renovação marcando o checkbox contava
  // zero antes. Sem membro, vai no cadastro pendente e é propagado na
  // aprovação (aprovarPedidoCore).
  if (optin && membroId) {
    try {
      await supabase.from('mem_membros')
        .update({ whatsapp_optin: true, whatsapp_optin_em: new Date().toISOString() })
        .eq('id', membroId).is('deleted_at', null);
    } catch (e) {
      console.warn('[public grupos inscrever] optin membro:', e.message);
    }
  }

  // Resposta amigável de "já existe" — usada no sou_eu e quando o CPF já tem
  // participação/pedido, pra o modal "é você?" sempre ter uma saída (sem loop).
  // Reinscrição de quem JÁ está no grupo = RENOVAÇÃO (Marcos: na virada de
  // temporada todo mundo pode se reinscrever no próprio grupo — não é trava,
  // é confirmação de permanência). A renovação também REGISTRA o aceite dos
  // termos na satélite (a pessoa acabou de aceitar de novo; refId = vínculo
  // ativo ou pedido pendente que motivou a resposta).
  const jaExiste = (tipo, refRenovacao = null) => {
    if (refRenovacao) {
      registrarConsentimentos({
        porta: 'grupos', refId: refRenovacao, membroId,
        ip: ipInsc, userAgent: uaInsc,
        itens: [
          { tipo: 'termos_lgpd', aceito: true, texto: consentimentoTexto || undefined },
          { tipo: 'whatsapp', aceito: optin },
        ],
      }).catch((err) => console.error('[public grupos inscrever] consentimentos renovação:', err.message));
    }
    return tipo === 'membro_ativo'
      ? { ok: true, ja_membro: true, renovado: true, membro_id: membroId, vinculo_id: refRenovacao, mensagem: 'Renovamos a sua inscrição no grupo para esta temporada. Nos vemos no encontro!' }
      // refRenovacao aqui É um pedido (o pendente que motivou a resposta) —
      // serve de âncora do vínculo de casal.
      : { ok: true, ja_pedido: true, membro_id: membroId, pedido_id: refRenovacao, mensagem: 'Seu pedido já está registrado — o líder vai te chamar em breve.' };
  };

  // Anti-duplicata. Duas fontes complementares:
  //  (a) DIRETA por membro resolvido — casa exatamente com o índice único
  //      (grupo,membro) do pedido e com o roster, cobrindo os matches que o
  //      acharMembroGuardado faz por chave que o scan fuzzy não pontua (e-mail
  //      sozinho, nascimento+nome). É o que evita o 409 no INSERT (loop do modal).
  //  (b) FUZZY (nome/telefone/e-mail ≥2, ou CPF) contra roster+pedidos do grupo
  //      — pega reenvio de NÃO-membro / match fraco. Pulada no confirmar_novo.
  let dup = null;
  let refRenovacao = null;
  if (membroId) {
    const { data: ativo } = await supabase.from('mem_grupo_membros')
      .select('id').eq('grupo_id', grupoId).eq('membro_id', membroId).is('saiu_em', null).is('deleted_at', null).limit(1);
    if (ativo && ativo.length) { dup = { tipo: 'membro_ativo' }; refRenovacao = ativo[0].id; }
    else {
      const { data: ped } = await supabase.from('mem_grupo_pedidos')
        .select('id').eq('grupo_id', grupoId).eq('membro_id', membroId).eq('status', 'pendente').is('deleted_at', null).limit(1);
      if (ped && ped.length) { dup = { tipo: 'pedido_pendente' }; refRenovacao = ped[0].id; }
    }
  }
  if (!dup && !confirmarNovo) {
    dup = await checarDuplicataInscricao(grupoId, { nome: nomeLimpo, cpf: cpfLimpo, telefone: pessoa.telefone, email: emailLimpo }, {
      ignorarPedidoIds: [principalId],
      ignorarMembroIds: [principalMembroId],
    });
  }

  if (dup) {
    // Match FORTE (membro resolvido pelo matcher) já ATIVO neste grupo =
    // reinscrição no próprio grupo → renovação direta, sem modal.
    if (dup.tipo === 'membro_ativo' && membroId) return jaExiste('membro_ativo', refRenovacao);
    // "Sim, sou eu" OU um CPF que já tem participação/pedido → não duplica.
    // (Sob confirmar_novo só se chega aqui pelo check direto por CPF: mesmo
    // "não sou eu" não cria 2 pedidos do MESMO CPF no mesmo grupo.)
    // ⚠️ refRenovacao SÓ (paridade exata com o comportamento anterior ao
    // refactor): `dup.pedido_id` aqui pode ser o pedido de OUTRA pessoa — o
    // dedup fuzzy casa 2 chaves fracas, e telefone/e-mail são compartilhados
    // em família. Usá-lo como `refId` penduraria o consentimento LGPD desta
    // pessoa no pedido de um terceiro. refRenovacao só é preenchido no ramo
    // de match FORTE (membro resolvido), que é o único vínculo confiável.
    if (souEu || confirmarNovo) return jaExiste(dup.tipo, refRenovacao);
    return {
      ok: false,
      status: 409,
      codigo: 'possivel_duplicado',
      onde: dup.tipo,
      error: dup.tipo === 'membro_ativo'
        ? 'Parece que você já participa deste grupo.'
        : 'Já recebemos um pedido parecido para este grupo.',
    };
  }

  let cadastroPendenteId = null;
  if (!membroId) {
    // Cria cadastro pendente
    const { data: cad, error: eCad } = await supabase.from('mem_cadastros_pendentes').insert({
      nome: nomeLimpo,
      cpf: cpfLimpo,
      email: emailLimpo,
      telefone: telDigitos || null, // digits-only (contrato · 28/07)
      data_nascimento: dataNascimento,
      genero: generoLimpo,
      foto_url: fotoUrl,
      endereco: enderecoLimpo,
      origem: 'qr_code',
      aceita_termos: pessoa.aceita_termos !== false,
      aceita_contato: true,
      whatsapp_optin: optin,
      whatsapp_optin_em: optin ? new Date().toISOString() : null,
      consentimento_texto: consentimentoTexto,
      status: 'pendente',
      ip_origem: ipInsc,
      user_agent: uaInsc,
      // "não sou eu" persiste: a aprovação só pode religar este cadastro por
      // CPF (soChaveForte) — nunca por e-mail/telefone de família.
      nao_vincular_fraco: confirmarNovo,
    }).select('id').single();
    if (eCad) {
      console.error('[public grupos inscrever] cadastro pendente:', eCad.message);
      return { ok: false, status: 500, error: 'Erro ao registrar cadastro.' };
    }
    cadastroPendenteId = cad.id;
  }

  await registrarObservacaoSegura({
    membroId, origem: 'grupos_formulario', origemId: cadastroPendenteId,
    nome: nomeLimpo, cpf: cpfLimpo, email: emailLimpo,
    telefone: pessoa.telefone, dataNascimento,
  });

  // Cria pedido pendente. Quando a pessoa afirmou "não sou eu" no dedup, o
  // pedido chega marcado pra triagem humana (a caixa de entrada mostra o
  // aviso — são os casos em que a duplicata é difícil de resolver sozinho).
  const obsPartes = [];
  if (confirmarNovo) obsPartes.push('[Verificar identidade] A pessoa confirmou que NÃO é o cadastro parecido já existente.');
  if (pessoa.observacao) obsPartes.push(String(pessoa.observacao).trim().slice(0, 400));
  const pedidoBase = {
    grupo_id: grupoId,
    nome: nomeLimpo,
    email: emailLimpo,
    telefone: telDigitos || null, // digits-only (contrato · 28/07; legado é backfillado na migration)
    origem,
    observacao: obsPartes.length ? obsPartes.join(' · ').slice(0, 500) : null,
    status: 'pendente',
  };
  if (membroId) pedidoBase.membro_id = membroId;
  else pedidoBase.cadastro_pendente_id = cadastroPendenteId;
  // Vínculo de casal já no INSERT (o lado do titular é fechado depois, pelo
  // handler): se o UPDATE de volta falhar, o par ainda é alcançável por aqui.
  if (principalId) pedidoBase.casal_pedido_id = principalId;

  const { data: pedido, error: ePed } = await supabase.from('mem_grupo_pedidos').insert(pedidoBase).select('id').single();
  if (ePed) {
    // 23505 = corrida: um pedido do mesmo membro neste grupo surgiu entre o
    // check direto e o INSERT. Já existe → responde amigável (não reabre o
    // "é você?", que ficaria em loop se devolvêssemos 409 aqui).
    if (ePed.code === '23505') return jaExiste('pedido_pendente');
    console.error('[public grupos inscrever] pedido:', ePed.message);
    return { ok: false, status: 500, error: 'Erro ao registrar pedido.' };
  }

  // Linha do tempo do pedido (histórico da caixa de entrada)
  registrarEventoPedido(pedido.id, 'criado', { grupo: grupo.nome, origem });

  // Atos de consentimento na satélite (Contrato de Inscrição · porta grupos).
  // O snapshot é o texto que a pessoa VIU (também fica no cadastro pendente).
  registrarConsentimentos({
    porta: 'grupos', refId: pedido.id, membroId,
    ip: ipInsc, userAgent: uaInsc,
    itens: [
      { tipo: 'termos_lgpd', aceito: true, texto: consentimentoTexto || undefined },
      { tipo: 'whatsapp', aceito: optin },
    ],
  }).catch((err) => console.error('[public grupos inscrever] consentimentos:', err.message));

  return {
    ok: true,
    criado: true, // pedido NOVO nesta submissão (as respostas de dedup não têm)
    pedido_id: pedido.id,
    membro_id: membroId,
    cadastro_pendente_id: cadastroPendenteId,
    nome: nomeLimpo,
    telefone: telDigitos || null,
    email: emailLimpo,
    whatsapp_optin: optin,
  };
}

// Valida o bloco do CÔNJUGE com a MESMA régua do titular (fonte única do
// Contrato de Inscrição). Devolve { erros } com as chaves já no formato que o
// front usa pra pintar o campo certo: 'conjuge.<campo>'.
const CAMPO_CONJUGE = {
  nome_completo: 'conjuge.nome',
  telefone: 'conjuge.telefone',
  cpf: 'conjuge.cpf',
  email: 'conjuge.email',
  data_nascimento: 'conjuge.data_nascimento',
  sexo: 'conjuge.genero',
};
function primeiroErroConjuge(conjuge, cpfTitular) {
  const { erros } = validarCamposPadrao(conjuge || {}, {
    exigirCpf: true, exigirEmail: true, exigirNascimento: true, exigirSexo: true,
  });
  for (const [chave, campo] of Object.entries(CAMPO_CONJUGE)) {
    if (erros[chave]) return { campo, error: erros[chave] };
  }
  // Mesmo CPF = a MESMA pessoa preenchida duas vezes (e não um casal). Barrar
  // aqui é o que permite excluir o par do dedup fuzzy com segurança.
  const cpfConjuge = soDigitos(conjuge?.cpf);
  if (cpfTitular && cpfConjuge && cpfTitular === cpfConjuge) {
    return { campo: 'conjuge.cpf', error: 'O CPF do cônjuge é o mesmo que você informou — confira os números.' };
  }
  // LGPD: o titular não consente sozinho pelo outro — precisa declarar que o
  // cônjuge está ciente e concorda.
  if (conjuge?.aceita_termos !== true) {
    return { campo: 'conjuge.aceita_termos', error: 'Confirme que seu cônjuge está ciente e concorda com a inscrição.' };
  }
  return null;
}

// POST /api/public/grupos/inscrever
// Formulário público dedicado (acessado pelo QR code de inscrição).
// Roteia a pessoa pro membro existente (matcher forte) ou cria
// mem_cadastros_pendentes; sempre cria mem_grupo_pedidos (origem='formulario_publico').
// Anti-duplicata "é você?": se detecta cadastro parecido NESTE grupo, devolve
// 409 { codigo:'possivel_duplicado' } em vez de criar — o front confirma e
// reenvia com sou_eu:true (liga ao existente) ou confirmar_novo:true (cria).
router.post('/inscrever', async (req, res) => {
  try {
    const {
      grupo_id,
      nome,
      cpf,
      email,
      telefone,
      data_nascimento,
      genero,
      observacao,
      foto_url,
      aceita_termos,
      consentimento_texto,
      whatsapp_optin, // consentimento p/ mensagens no WhatsApp (Marketing · LGPD)
      website,        // honeypot
      sou_eu,         // confirmação "é você?" → liga ao existente (não duplica)
      confirmar_novo, // confirmação "não sou eu" → cria mesmo assim
      // Inscrição de CASAL (só em grupo categoria='Casais' · Marcos 30/07):
      // { nome, cpf, telefone, email, data_nascimento, genero, aceita_termos,
      //   consentimento_texto, whatsapp_optin }. Em grupo não-casais é ignorado.
      conjuge,
    } = req.body || {};

    if (website && String(website).trim() !== '') return res.status(201).json({ ok: true });

    // Cada erro devolve `campo` pro form pintar o campo certo de vermelho
    // (feedback do teste 2026-07-13: "todo erro deve dizer claramente onde está").
    if (!grupo_id) return res.status(400).json({ error: 'Grupo obrigatório.' });
    if (!nome || nome.trim().length < 3) return res.status(400).json({ error: 'Digite o nome completo.', campo: 'nome' });
    if (nome.trim().split(/\s+/).length < 2 || temAbreviacaoNome(nome)) {
      return res.status(400).json({ error: 'Escreva o nome completo, sem abreviações.', campo: 'nome' });
    }
    const telInscDigitos = soDigitos(telefone);
    if (telInscDigitos.length < 10 || telInscDigitos.length > 11) return res.status(400).json({ error: 'Digite um celular válido com DDD.', campo: 'telefone' });
    // CPF OBRIGATÓRIO (Marcos · 2026-07-13, feedback do teste) — além de
    // identificar a pessoa, é a chave forte do dedup/vínculo com o membro.
    if (!cpf || soDigitos(cpf).length !== 11) return res.status(400).json({ error: 'Informe o CPF completo.', campo: 'cpf' });
    if (!cpfValido(cpf)) return res.status(400).json({ error: 'Este CPF não é válido — confira os números.', campo: 'cpf' });
    if (!email || !emailValido(email)) return res.status(400).json({ error: 'Informe um e-mail válido.', campo: 'email' }); // D2: obrigatório
    if (!aceita_termos) return res.status(400).json({ error: 'É necessário aceitar os termos.', campo: 'aceita_termos' });
    // Nascimento e sexo OBRIGATÓRIOS (Marcos · 2026-07-10).
    if (!data_nascimento || !/^\d{4}-\d{2}-\d{2}$/.test(String(data_nascimento))) {
      return res.status(400).json({ error: 'Informe a data de nascimento.', campo: 'data_nascimento' });
    }
    const nascDate = new Date(String(data_nascimento) + 'T12:00:00');
    if (Number.isNaN(nascDate.getTime())) {
      return res.status(400).json({ error: 'Data de nascimento inválida.', campo: 'data_nascimento' });
    }
    if (nascDate > new Date()) {
      return res.status(400).json({ error: 'A data de nascimento não pode estar no futuro.', campo: 'data_nascimento' });
    }
    if (nascDate.getFullYear() < 1900) {
      return res.status(400).json({ error: 'Confira o ano de nascimento.', campo: 'data_nascimento' });
    }
    const generoLimpo = ['masculino', 'feminino'].includes(String(genero || '').toLowerCase())
      ? String(genero).toLowerCase() : null;
    if (!generoLimpo) return res.status(400).json({ error: 'Marque o sexo (masculino ou feminino).', campo: 'genero' });

    const cpfLimpo = cpf ? soDigitos(cpf) : null;
    const emailLimpo = email.trim().toLowerCase();
    const fotoUrl = fotoUrlValida(foto_url) ? String(foto_url).slice(0, 1000) : null;
    // Endereço fixo-opcional (ajuste 28/07 do contrato) — vai pro cadastro da
    // pessoa (não pro pedido); membro existente não tem o perfil sobrescrito.
    const enderecoLimpo = req.body?.endereco ? String(req.body.endereco).trim().slice(0, 300) : null;
    const ipInsc = (req.headers['x-forwarded-for'] || '').toString().split(',')[0].trim() || req.ip || null;
    const uaInsc = (req.headers['user-agent'] || '').toString().slice(0, 500);

    // Verifica se grupo existe e esta ativo
    const { data: grupo } = await supabase.from('mem_grupos')
      .select('id, nome, ativo, aceitando_inscricoes, modo_inscricao, status_temporada, temporada, lider_id, categoria, idade_min, idade_max, dia_semana, horario, recorrencia, local, endereco, complemento, bairro').eq('id', grupo_id).is('deleted_at', null).single();
    if (!grupo || !grupo.ativo) {
      return res.status(404).json({ error: 'Grupo não encontrado ou inativo.' });
    }
    // ⚠️⚠️ 'fechado' NÃO BLOQUEIA MAIS A INSCRIÇÃO POR LINK (Marcos · 11/08/2026)
    //
    // A regra de 15/07 era "nunca aceita inscrição pública". Ela criava um beco:
    // a própria mensagem mandava "fale com ele para participar", e o líder **não
    // tinha como** trazer ninguém — o app agora gera o link do grupo (apontamento
    // 2), e nesses grupos ele caía aqui em 403.
    //
    // Palavras dele: *"libera o link direto para os grupos por convite também,
    // mesmo fechados. eles não devem ser achados na lista de grupos públicos,
    // mas se o líder quiser convidar alguém, deve poder."*
    //
    // ⚠️ O QUE MANTÉM ISSO SEGURO, e foi conferido antes de mudar:
    //  1. grupo 'fechado' **continua fora de toda lista pública** — `:132` (form
    //     do site) e `:386` (`/buscar`, que alimenta o app) filtram com `.neq`.
    //     Só chega quem recebeu o link do líder: o UUID não é adivinhável.
    //  2. a inscrição **não vincula ninguém** — cria `mem_grupo_pedidos` com
    //     status 'pendente' (`:808`), e o líder continua aprovando um a um.
    // ⇒ ter o link é o convite; a aprovação segue sendo do líder.
    //
    // ⚠️ Se um dia for preciso barrar link VAZADO, o caminho é expirar/assinar o
    // convite — não voltar o 403, que barra junto o convite legítimo.
    if (grupo.aceitando_inscricoes === false) {
      return res.status(403).json({
        error: 'Este grupo não está recebendo novas inscrições no momento.',
        codigo: 'inscricoes_fechadas',
      });
    }

    // Verifica se a temporada do grupo esta com inscrições abertas —
    // grupo 'sempre_aberto' recebe o ano todo, mesmo com a temporada fechada.
    if (grupo.temporada && grupo.modo_inscricao !== 'sempre_aberto') {
      const { data: temporada } = await supabase.from('mem_temporadas')
        .select('inscricoes_abertas, label').eq('id', grupo.temporada).maybeSingle();
      if (!temporada?.inscricoes_abertas) {
        return res.status(403).json({
          error: 'As inscrições para esta temporada estão fechadas no momento. Aguarde a próxima abertura.',
          codigo: 'inscricoes_fechadas',
        });
      }
    }

    // ⚠️⚠️ ESTAS TRAVAS FORAM EXTRAÍDAS PRA `utils/entradaGrupoApp.js` (10/08/2026)
    // O app tinha porta PRÓPRIA (`POST /api/app/inscricoes`) que não validava
    // NADA — nem gênero, nem `ativo`, nem `aceitando_inscricoes`, nem
    // `fechado`, nem temporada. A régua virou função pura testada (37
    // asserções) e o app já usa dela.
    // ⚠️ ESTE ARQUIVO AINDA TEM A CÓPIA, de propósito: ele é a porta pública
    // principal (462 dos 463 pedidos) e trocar aqui no mesmo PR somaria risco.
    // **AS DUAS TÊM QUE CONCORDAR.** Mudou uma, mude a outra — ou, melhor,
    // troque este bloco pela chamada de `avaliarEntradaNoGrupo` quando houver
    // uma janela pra testar o formulário público com calma.
    // ⚠️ Uma diferença é DE PROPÓSITO: aqui o sexo é campo OBRIGATÓRIO do
    // formulário (400 acima), então o caso "sexo desconhecido" não existe. No
    // app ele existe (só 16 de 54 contas têm `genero`) e devolve
    // `codigo='sexo_necessario'`, que pede pra completar o perfil.
    //
    // ── Trava de compatibilidade (Marcos · 2026-07-14: SÓ GÊNERO bloqueia) ──
    // Gênero: categoria Homens/Mulheres não aceita o sexo oposto — única trava.
    // Idade fora da faixa, vários grupos ao mesmo tempo e grupos no mesmo
    // horário NÃO impedem a inscrição (o líder decide na aprovação). O front
    // recebe codigo='grupo_incompativel' e oferece "procurar outro grupo"
    // preservando o que a pessoa já digitou.
    const catLower = String(grupo.categoria || '').toLowerCase();
    if ((catLower === 'mulheres' && generoLimpo === 'masculino') || (catLower === 'homens' && generoLimpo === 'feminino')) {
      return res.status(422).json({
        codigo: 'grupo_incompativel',
        error: catLower === 'mulheres'
          ? 'Este é um grupo só de mulheres, então sua inscrição não pode seguir nele.'
          : 'Este é um grupo só de homens, então sua inscrição não pode seguir nele.',
      });
    }

    // ── Cônjuge · inscrição em PAR (grupo de casais · Marcos 30/07) ────────
    // A opção só existe em categoria='Casais'. Em grupo NÃO-casais o campo é
    // ignorado em silêncio (não é erro — payload/QR antigo não pode quebrar).
    // A régua do cônjuge é a MESMA do titular (contrato de inscrição), e o erro
    // volta com campo='conjuge.<campo>' pro form pintar o campo certo.
    const querCasal = Boolean(conjuge && typeof conjuge === 'object' && catLower === 'casais');
    const conjugeNome = querCasal ? String(conjuge.nome || '').trim() : null;
    if (querCasal) {
      const erroConj = primeiroErroConjuge(conjuge, cpfLimpo);
      if (erroConj) return res.status(400).json({ error: erroConj.error, campo: erroConj.campo });
    }

    const contexto = { ip: ipInsc, userAgent: uaInsc, origem: 'formulario_publico' };

    // ── TITULAR ── mesmo funil do cônjuge (processarPessoaPedido = a porta).
    const rt = await processarPessoaPedido({
      grupo,
      pessoa: {
        nome, cpf: cpfLimpo, email: emailLimpo, telefone, endereco: enderecoLimpo,
        data_nascimento, genero: generoLimpo, observacao, foto_url: fotoUrl,
        whatsapp_optin, aceita_termos, consentimento_texto, sou_eu, confirmar_novo,
      },
      contexto,
    });
    if (!rt.ok) {
      // Titular falhou → nada do casal acontece (o 409 "é você?" volta igual a
      // antes; o form reenvia com sou_eu/confirmar_novo e o cônjuge vem junto).
      const corpoErro = { error: rt.error };
      if (rt.codigo) corpoErro.codigo = rt.codigo;
      if (rt.onde) corpoErro.onde = rt.onde;
      if (rt.campo) corpoErro.campo = rt.campo;
      return res.status(rt.status || 500).json(corpoErro);
    }

    // ── CÔNJUGE ── se falhar, o TITULAR VALE. Nunca desfazemos a inscrição de
    // quem já entrou, nem respondemos 500 com o titular gravado: o front mostra
    // o destaque honesto ("a sua foi registrada, a do seu cônjuge não, porque…").
    let rc = null;
    if (querCasal) {
      try {
        rc = await processarPessoaPedido({
          grupo,
          pessoa: {
            nome: conjuge.nome,
            cpf: conjuge.cpf,
            email: conjuge.email,
            telefone: conjuge.telefone,
            endereco: conjuge.endereco || null,
            data_nascimento: conjuge.data_nascimento,
            genero: conjuge.genero ?? conjuge.sexo,
            observacao: null,
            foto_url: null,
            // Opt-in é ato afirmativo de cada titular do dado (D4): o cônjuge
            // tem o SEU checkbox no formulário — o do titular não vale por ele.
            whatsapp_optin: conjuge.whatsapp_optin === true,
            aceita_termos: true, // validado acima (declaração de ciência do cônjuge)
            consentimento_texto: conjuge.consentimento_texto || consentimento_texto,
          },
          contexto,
          principalId: rt.pedido_id || null,
          principalMembroId: rt.membro_id || null,
        });
      } catch (e) {
        console.error('[public grupos inscrever conjuge]', e.message);
        rc = { ok: false, error: 'Não conseguimos registrar a inscrição do seu cônjuge agora. Fale com a equipe de Grupos.' };
      }
      // Fecha o vínculo CRUZADO (o pedido do cônjuge já nasceu apontando pro do
      // titular). Best-effort: se falhar, só loga — a aprovação continua achando
      // o par pelo outro lado do vínculo.
      if (rc && rc.ok && rc.pedido_id && rt.pedido_id) {
        const { error: eLink } = await supabase.from('mem_grupo_pedidos')
          .update({ casal_pedido_id: rc.pedido_id }).eq('id', rt.pedido_id);
        if (eLink) console.error('[public grupos inscrever] vínculo de casal:', eLink.message);
      }
    }

    // ── Notificações ──
    // Só quem ganhou pedido NOVO nesta submissão entra (renovação/pedido já
    // existente não redispara nada — comportamento de sempre).
    const criados = [];
    if (rt.criado) criados.push({ nome: rt.nome, telefone: rt.telefone, email: rt.email, optin: rt.whatsapp_optin, pedidoId: rt.pedido_id });
    if (rc && rc.ok && rc.criado) criados.push({ nome: rc.nome, telefone: rc.telefone, email: rc.email, optin: rc.whatsapp_optin, pedidoId: rc.pedido_id });

    if (criados.length) {
      const nomes = criados.map(p => p.nome).join(' e ');
      const ehCasal = criados.length > 1;

      // ⚠️ AWAITED de propósito (incidente 30/07): este bloco JÁ FOI
      // fire-and-forget (IIFE sem await) e, em serverless, o container pode ser
      // congelado assim que a resposta sai — o trabalho pendente é descartado.
      // Efeito medido: o pedido do Bruno (30/07 22:28) gravou o pedido mas NÃO
      // gerou envio nem notificação; a líder Jane nunca soube que ele pediu, e
      // ele ficou esperando. Enfileirar é 1 INSERT (a entrega é no cron da
      // fila), então o custo de latência aqui é baixo e o ganho é o lançamento
      // não perder gente em silêncio.
      // A ORDEM também mudou: o WhatsApp ao líder é o que destrava a aprovação,
      // então vem PRIMEIRO — antes ele era o 4º passo, atrás de um notificar()
      // que, sem regra configurada, escreve pra 16 admins (~32 round-trips).
      try {
        // F3 · WhatsApp pro líder com o link de aprovar sem login.
        // UM aviso só, mesmo no casal: os dois nomes em {{3}}, os dois
        // contatos em {{4}}, e o link do pedido do 1º — aprovar por ele
        // aprova o casal (vínculo casal_pedido_id). Gated por
        // WHATSAPP_ENABLED no whatsappService (sem env → dry-run).
        // O telefone vai FORMATADO no aviso: o fluxo novo do líder (Pr. Nélio ·
        // 29/07) manda LIGAR pra pessoa antes de aceitar, então o número é o
        // dado que ele usa na mão — "(21) 99999-8888" lê e disca melhor que
        // "21999998888". O que gravamos no banco segue digits-only.
        // Telefone que o nosso envio não alcança (estrangeiro, DDD inexistente)
        // vira "procure por e-mail" em vez de um número que não existe — senão
        // o líder tenta ligar, não consegue, e conclui que a pessoa desistiu.
        // Decisão do Marcos 03/08, depois do caso do número suíço no lançamento.
        const contatoDe = (p) => contatoParaLider({
          telefone: p.telefone,
          email: p.email,
          telefoneExibicao: telefoneExibicao(p.telefone),
        });
        await notificarLiderNovoPedido({
          grupo,
          pedidoId: criados[0].pedidoId,
          pessoa: {
            nome: nomes,
            telefone: criados[0].telefone || null,
            email: criados[0].email || null,
            contato: ehCasal
              ? criados.map(p => `${(p.nome || '').split(/\s+/)[0]}: ${contatoDe(p)}`).join(' · ')
              : contatoDe(criados[0]),
          },
        });

        // Mensagem 1 pra PESSOA: «recebemos sua inscrição» (utility
        // cbrio_inscricao_confirmada). Via fila: registra e reenvia sozinho
        // se o envio bater no teto diário da Meta. GATED pelo opt-in (D4):
        // quem não marcou o checkbox não recebe — é exatamente o que o aviso
        // do formulário promete ("se você não marcar, não conseguiremos te
        // enviar confirmações…"). No casal roda POR PESSOA (dois telefones,
        // cada um recebe a sua).
        for (const p of criados) {
          if (!p.optin) continue;
          await enviarInscricaoConfirmada({
            telefone: p.telefone,
            nome: p.nome,
            grupoNome: grupo.nome,
            pedidoId: p.pedidoId,
          });
        }
      } catch (err) { console.error('[public grupos inscrever wpp]', err.message); }

      // Notificação in-app de quem RESPONDE POR ESTE GRUPO (líder + supervisor),
      // fire-and-forget de propósito — não vale segurar a resposta da pessoa que
      // está preenchendo o formulário.
      // ⚠️ Era aqui que estava o comentário admitindo o problema: "sem regra
      // configurada em notificacao_regras, o fallback escreve pra ~16 admins".
      // Agora não escreve: sem dono com conta de sistema o aviso não sai, porque
      // o líder já recebe o link do WhatsApp e a coordenação vê no resumo diário.
      // ⚠️⚠️ AWAITED, e só esta perna: o sino do app é o canal do líder que só
      // tem o app do membro (74 dos 89 líderes não têm conta de sistema), e em
      // serverless o container CONGELA na resposta — fire-and-forget aqui é
      // aviso perdido (a lei de 31/07, que já custou o aviso da líder Jane).
      // `avisarPedidoNovoNoApp` nunca lança, então o await não arrisca a
      // resposta de quem está preenchendo o formulário.
      try {
        await avisarPedidoNovoNoApp({
          grupoId: grupo.id,
          pedidoId: criados[0].pedidoId,
          grupoNome: grupo.nome,
          pessoaNome: nomes,
        });
      } catch (err) { console.warn('[public grupos] aviso app:', err.message); }

      (async () => {
        try {
          const donos = await donosDoGrupo(grupo.id);
          if (!donos.length) return;
          await notificar({
            modulo: 'grupos',
            tipo: 'pedido_grupo',
            titulo: `Novo pedido para ${grupo.nome}`,
            mensagem: ehCasal
              ? `${nomes} (casal) pediram para entrar no grupo via QR code.`
              : `${nomes} pediu para entrar no grupo via QR code.`,
            link: '/grupos',
            severidade: 'aviso',
            chaveDedup: `pedido_grupo_${criados[0].pedidoId}`,
            targetIds: donos,
          });
        } catch (err) { console.error('[public grupos inscrever notify]', err.message); }
      })();
    }

    // ── Resposta ──
    const corpo = { ok: true };
    if (rt.criado) corpo.pedido_id = rt.pedido_id; // igual a antes: só quando criou
    if (rt.ja_membro) { corpo.ja_membro = true; corpo.renovado = rt.renovado === true; corpo.mensagem = rt.mensagem; }
    if (rt.ja_pedido) { corpo.ja_pedido = true; corpo.mensagem = rt.mensagem; }
    if (querCasal) {
      corpo.casal = true;
      corpo.conjuge = (rc && rc.ok)
        ? {
            ok: true,
            nome: conjugeNome,
            ja_membro: rc.ja_membro === true,
            ja_pedido: rc.ja_pedido === true,
            mensagem: rc.mensagem || null,
            pedido_id: rc.criado ? rc.pedido_id : null,
            criado: rc.criado === true,
          }
        // `possivel_duplicado` do cônjuge NÃO é erro pra quem preencheu: o modal
        // "é você?" existe só pro titular, então ficaria um beco sem saída. O
        // fato é que já existe pedido/participação parecida no grupo — dizemos
        // isso em texto amigável e o líder resolve na aprovação (ele já vai
        // ligar pro casal de todo jeito).
        : (rc && rc.codigo === 'possivel_duplicado')
          ? {
              ok: true,
              nome: conjugeNome,
              ja_membro: false,
              ja_pedido: true,
              criado: false,
              mensagem: 'Já havia um pedido parecido para este grupo no nome do seu cônjuge — o líder vai conferir na aprovação.',
              pedido_id: null,
            }
          : {
              ok: false,
              nome: conjugeNome,
              error: (rc && rc.error) || 'Não conseguimos registrar a inscrição do seu cônjuge.',
              codigo: (rc && rc.codigo) || null,
            };
    }
    res.status(rt.criado ? 201 : 200).json(corpo);
  } catch (e) {
    console.error('[public grupos inscrever]', e.message);
    res.status(500).json({ error: 'Erro ao processar inscrição.' });
  }
});

// POST /api/public/grupos/inscrever-lider
// Candidatura pública a NOVO LÍDER / ANFITRIÃO (form /inscricao-lideres ·
// Marcos 17/07). Mesma fundação de identidade do /inscrever (matcher forte →
// membro existente OU mem_cadastros_pendentes), mas SEM grupo (a equipe
// decide na caixa de entrada) e SEM WhatsApp em nenhuma etapa — o processo é
// assistido: a equipe sempre fala com a pessoa antes de qualquer decisão.
router.post('/inscrever-lider', async (req, res) => {
  try {
    const {
      nome, cpf, email, telefone, data_nascimento, genero,
      quer_lider, quer_anfitriao, motivacao, bairro, endereco,
      foto_url, aceita_termos, consentimento_texto, whatsapp_optin,
      website, // honeypot
    } = req.body || {};

    if (website && String(website).trim() !== '') return res.status(201).json({ ok: true });

    if (!nome || nome.trim().length < 3) return res.status(400).json({ error: 'Digite o nome completo.', campo: 'nome' });
    if (nome.trim().split(/\s+/).length < 2 || temAbreviacaoNome(nome)) {
      return res.status(400).json({ error: 'Escreva o nome completo, sem abreviações.', campo: 'nome' });
    }
    const telDigitos = tirarCodigoPaisTelefone(soDigitos(telefone));
    if (telDigitos.length < 10 || telDigitos.length > 11) return res.status(400).json({ error: 'Digite um celular válido com DDD.', campo: 'telefone' });
    if (!cpf || soDigitos(cpf).length !== 11) return res.status(400).json({ error: 'Informe o CPF completo.', campo: 'cpf' });
    if (!cpfValido(cpf)) return res.status(400).json({ error: 'Este CPF não é válido — confira os números.', campo: 'cpf' });
    if (!email || !emailValido(email)) return res.status(400).json({ error: 'Informe um e-mail válido.', campo: 'email' }); // D2: obrigatório
    if (!aceita_termos) return res.status(400).json({ error: 'É necessário aceitar os termos.', campo: 'aceita_termos' });
    if (!data_nascimento || !/^\d{4}-\d{2}-\d{2}$/.test(String(data_nascimento))) {
      return res.status(400).json({ error: 'Informe a data de nascimento.', campo: 'data_nascimento' });
    }
    const nascDate = new Date(String(data_nascimento) + 'T12:00:00');
    if (Number.isNaN(nascDate.getTime())) return res.status(400).json({ error: 'Data de nascimento inválida.', campo: 'data_nascimento' });
    if (nascDate > new Date()) return res.status(400).json({ error: 'A data de nascimento não pode estar no futuro.', campo: 'data_nascimento' });
    if (nascDate.getFullYear() < 1900) return res.status(400).json({ error: 'Confira o ano de nascimento.', campo: 'data_nascimento' });
    const generoLimpo = ['masculino', 'feminino'].includes(String(genero || '').toLowerCase())
      ? String(genero).toLowerCase() : null;
    if (!generoLimpo) return res.status(400).json({ error: 'Marque o sexo (masculino ou feminino).', campo: 'genero' });

    const querLider = quer_lider === true;
    const querAnfitriao = quer_anfitriao === true;
    if (!querLider && !querAnfitriao) {
      return res.status(400).json({ error: 'Marque pelo menos uma opção: líder e/ou anfitrião.', campo: 'papel' });
    }
    // Anfitrião = quem cede a casa · o endereço É o dado (Marcos 17/07).
    if (querAnfitriao) {
      if (!endereco || String(endereco).trim().length < 5) {
        return res.status(400).json({ error: 'Como anfitrião, informe o endereço onde o grupo aconteceria.', campo: 'endereco' });
      }
      if (!bairro || String(bairro).trim().length < 2) {
        return res.status(400).json({ error: 'Como anfitrião, informe o bairro.', campo: 'bairro' });
      }
    }

    const cpfLimpo = soDigitos(cpf);
    const emailLimpo = email.trim().toLowerCase();
    const fotoUrl = fotoUrlValida(foto_url) ? String(foto_url).slice(0, 1000) : null;
    const optin = whatsapp_optin === true; // D4 (28/07): explícito, nunca implícito
    const ip = (req.headers['x-forwarded-for'] || '').toString().split(',')[0].trim() || req.ip || null;
    const userAgent = (req.headers['user-agent'] || '').toString().slice(0, 500);

    // Identidade: matcher compartilhado (CPF/chaves fortes) liga ao membro
    // existente; sem match, cria o cadastro pendente (Contrato de porta).
    const achado = await acharMembroGuardado({
      cpf: cpfLimpo, email: emailLimpo, telefone, nome: nome.trim(),
      dataNascimento: data_nascimento || null,
    });
    const membroId = achado?.membro_id || null;

    // Anti-duplicata da CANDIDATURA: uma aberta (pendente/aceito) por pessoa —
    // por membro, por telefone e (novo) por CPF via cadastro pendente, pra
    // pegar quem se reinscreve com telefone diferente antes de virar membro.
    const telDig = telDigitos;
    let cadastrosMesmoCpf = [];
    if (!membroId) {
      const { data: cads } = await supabase.from('mem_cadastros_pendentes')
        .select('id').eq('cpf', cpfLimpo).is('deleted_at', null).limit(100);
      cadastrosMesmoCpf = (cads || []).map(c => c.id);
    }
    const { data: abertas } = await supabase.from('mem_lider_inscricoes')
      .select('id, membro_id, cadastro_pendente_id, telefone')
      .in('status', ['pendente', 'aceito']).is('deleted_at', null).limit(1000);
    const jaTem = (abertas || []).some(i =>
      (membroId && i.membro_id === membroId)
      || (telDig && soDigitos(i.telefone) === telDig)
      || (i.cadastro_pendente_id && cadastrosMesmoCpf.includes(i.cadastro_pendente_id)));
    if (jaTem) {
      return res.json({ ok: true, ja_inscrito: true, mensagem: 'Já recebemos a sua inscrição — a equipe de Grupos vai falar com você em breve.' });
    }

    // Enriquecimento só-onde-vazio do membro casado (mesma regra do /inscrever)
    if (membroId && (fotoUrl || generoLimpo || data_nascimento)) {
      const { data: mem } = await supabase.from('mem_membros').select('foto_url, genero, data_nascimento').eq('id', membroId).maybeSingle();
      if (mem) {
        const upd = {};
        if (fotoUrl && !mem.foto_url) upd.foto_url = fotoUrl;
        if (generoLimpo && !mem.genero) upd.genero = generoLimpo;
        if (data_nascimento && !mem.data_nascimento) upd.data_nascimento = data_nascimento;
        if (Object.keys(upd).length) await supabase.from('mem_membros').update(upd).eq('id', membroId);
      }
    }

    // Opt-in de WhatsApp EXPLÍCITO (D4 · 2026-07-28, substitui o implícito de
    // 24/07): só grava se a pessoa MARCOU o checkbox. "Só liga, nunca desliga".
    if (membroId && optin) {
      try {
        await supabase.from('mem_membros')
          .update({ whatsapp_optin: true, whatsapp_optin_em: new Date().toISOString() })
          .eq('id', membroId).is('deleted_at', null);
      } catch (e) { console.warn('[public grupos inscrever-lider] optin membro:', e.message); }
    }

    let cadastroPendenteId = null;
    if (!membroId) {
      const { data: cad, error: eCad } = await supabase.from('mem_cadastros_pendentes').insert({
        nome: nome.trim(),
        cpf: cpfLimpo,
        email: emailLimpo,
        telefone: telefone || null,
        data_nascimento: data_nascimento || null,
        genero: generoLimpo,
        foto_url: fotoUrl,
        endereco: endereco ? String(endereco).trim().slice(0, 300) : null,
        bairro: bairro ? String(bairro).trim().slice(0, 120) : null,
        // CHECK mem_cadastros_pendentes_origem_check só aceita
        // site|qr_code|evento|importacao — a distinção "veio da inscrição de
        // líder" vive em mem_lider_inscricoes, não aqui (mesmo 'qr_code' do
        // /inscrever de grupos).
        origem: 'qr_code',
        aceita_termos: !!aceita_termos,
        aceita_contato: true,
        // D4 (28/07): opt-in explícito do checkbox — propaga pro membro na
        // aprovação do cadastro pendente só quando a pessoa marcou.
        whatsapp_optin: optin,
        whatsapp_optin_em: optin ? new Date().toISOString() : null,
        consentimento_texto: consentimento_texto ? String(consentimento_texto).slice(0, 2000) : null,
        status: 'pendente',
        ip_origem: ip,
        user_agent: userAgent,
      }).select('id').single();
      if (eCad) {
        console.error('[public grupos inscrever-lider] cadastro pendente:', eCad.message);
        return res.status(500).json({ error: 'Erro ao registrar cadastro.' });
      }
      cadastroPendenteId = cad.id;
    }

    await registrarObservacaoSegura({
      membroId, origem: 'grupos_lider_formulario', origemId: cadastroPendenteId,
      nome: nome.trim(), cpf: cpfLimpo, email: emailLimpo,
      telefone, dataNascimento: data_nascimento || null,
    });

    const { data: insc, error: eInsc } = await supabase.from('mem_lider_inscricoes').insert({
      membro_id: membroId,
      cadastro_pendente_id: membroId ? null : cadastroPendenteId,
      nome: nome.trim(),
      telefone: telefone || null,
      email: emailLimpo,
      bairro: bairro ? String(bairro).trim().slice(0, 120) : null,
      endereco: endereco ? String(endereco).trim().slice(0, 300) : null,
      quer_lider: querLider,
      quer_anfitriao: querAnfitriao,
      motivacao: motivacao ? String(motivacao).trim().slice(0, 500) : null,
      status: 'pendente',
      origem: 'formulario_publico',
    }).select('id').single();
    if (eInsc) {
      console.error('[public grupos inscrever-lider] inscricao:', eInsc.message);
      return res.status(500).json({ error: 'Erro ao registrar inscrição.' });
    }

    // Atos de consentimento na satélite (Contrato de Inscrição) — o snapshot é
    // o texto que a pessoa VIU (enviado pelo form e também gravado no cadastro
    // pendente). Best-effort: a inscrição nunca é perdida por falha aqui.
    registrarConsentimentos({
      porta: 'grupos_lider', refId: insc.id, membroId,
      ip, userAgent,
      itens: [
        { tipo: 'termos_lgpd', aceito: true, texto: consentimento_texto ? String(consentimento_texto).slice(0, 2000) : undefined },
        { tipo: 'whatsapp', aceito: optin },
      ],
    }).catch((err) => console.error('[public grupos inscrever-lider] consentimentos:', err.message));

    // Só notificação in-app pra equipe — SEM WhatsApp (processo assistido).
    (async () => {
      try {
        const papel = [querLider && 'líder', querAnfitriao && 'anfitrião'].filter(Boolean).join(' e ');
        await notificar({
          modulo: 'grupos',
          tipo: 'lider_inscricao',
          titulo: 'Nova inscrição de líder/anfitrião',
          mensagem: `${nome.trim()} se inscreveu como ${papel}.`,
          link: '/grupos?tab=entrada',
          severidade: 'aviso',
          chaveDedup: `lider_inscricao_${insc.id}`,
        });
      } catch (err) { console.error('[public grupos inscrever-lider notify]', err.message); }
    })();

    res.status(201).json({ ok: true, inscricao_id: insc.id });
  } catch (e) {
    console.error('[public grupos inscrever-lider]', e.message);
    res.status(500).json({ error: 'Erro ao processar inscrição.' });
  }
});

// ─────────────────────────────────────────────────────────────
// F3 · aprovação pelo líder via link do WhatsApp (sem login).
// Token HMAC assinado (services/gruposWhatsapp) dá acesso a UM pedido, com TTL
// de 30 dias (era 7 · Natasha 12/08/2026) e, passado o TTL, validade enquanto
// a TEMPORADA estiver aberta (Pr. Nélio + Natasha · 17/08/2026 · ver
// `haTemporadaAberta` abaixo). Fail-closed: sem CRON_SECRET nenhum token
// valida. ⚠️ O TTL é a 2ª camada: quem manda são as travas daqui — pedido ainda
// 'pendente' e `payload.l` = líder ATUAL do grupo. É por isso que o link
// vencido pode ser aceito sem abrir buraco de segurança.
// Rota com 2 segmentos de propósito — o GET /:id (acima) captura qualquer
// caminho de 1 segmento.
// ─────────────────────────────────────────────────────────────

// Par do CASAL (mem_grupo_pedidos.casal_pedido_id · migration 20260730140000).
// O vínculo é cruzado, então qualquer um dos dois links do WhatsApp acha o par.
// Só devolve se o par está no MESMO grupo: o vínculo é escrito por nós, mas o
// link do líder nunca deve alcançar pedido de outro grupo (defesa em profundidade).
// ⚠️ A coluna é lida numa query PRÓPRIA (e não no select do pedido) de
// propósito: enquanto a migration 20260730140000 não estiver aplicada, pedir
// `casal_pedido_id` no select principal faz o PostgREST recusar a query INTEIRA
// e a aprovação pelo link do WhatsApp para pra TODOS os líderes (lição do
// parcelas_max). Isolada aqui, a ausência da coluna degrada pra "sem par" e o
// fluxo individual — que é 99% do tráfego — segue intacto em qualquer ordem de
// deploy. Custo: 1 query a mais por abertura de link (request humano, irrisório).
async function carregarParCasal(pedido) {
  if (!pedido || !pedido.id) return null;
  const { data: vinc, error } = await supabase.from('mem_grupo_pedidos')
    .select('casal_pedido_id').eq('id', pedido.id).maybeSingle();
  if (error || !vinc || !vinc.casal_pedido_id) return null;
  const { data: par } = await supabase.from('mem_grupo_pedidos')
    .select('id, nome, telefone, email, status, grupo_id, casal_pedido_id')
    .eq('id', vinc.casal_pedido_id).is('deleted_at', null).maybeSingle();
  if (!par || par.grupo_id !== pedido.grupo_id) return null;
  // Vínculo tem que ser MÚTUO (ou ainda não fechado): se A aponta pra B mas B
  // aponta pra C, o token de A não decide B. O vínculo cruzado é gravado em 2
  // UPDATEs best-effort, então "ainda NULL" é estado legítimo de meio-caminho —
  // apontar pra OUTRO pedido, não.
  if (par.casal_pedido_id && par.casal_pedido_id !== pedido.id) return null;
  return par;
}

// ⚠️ O link de aprovação fica ativo ENQUANTO A TEMPORADA ESTIVER ABERTA
// (Pr. Nélio + Natasha · 17/08/2026 — substituiu a data fixa de 31/08 que
// vigorou por 5 dias). O TTL de 30 dias do token é o piso; passado ele, quem
// diz se o link ainda vale é esta consulta.
//
// ⚠️ FAIL-CLOSED nos dois sentidos que importam: sem temporada aberta não
// prorroga (é o "enquanto estiver aberta"), e ERRO de consulta também não
// prorroga — link vencido tem que provar que ainda vale, não o contrário.
// Erro NÃO derruba o endpoint: o link dentro dos 30 dias segue abrindo normal,
// que é o caminho de 100% do tráfego recente.
//
// Cache curto porque isto roda a cada abertura de link e a resposta muda no
// máximo quando a coordenação fecha a temporada — 60s de defasagem ali é
// irrelevante e evita uma consulta por clique.
let _tempAbertaCache = { em: 0, valor: false };
async function haTemporadaAberta() {
  if (Date.now() - _tempAbertaCache.em < 60_000) return _tempAbertaCache.valor;
  try {
    const { data, error } = await supabase.from('mem_temporadas')
      .select('id').eq('inscricoes_abertas', true).limit(1);
    if (error) throw error;
    _tempAbertaCache = { em: Date.now(), valor: !!(data && data.length) };
  } catch (e) {
    console.error('[public grupos temporada-aberta]', e.message);
    return false; // fail-closed: na dúvida, não prorroga
  }
  return _tempAbertaCache.valor;
}

// GET /api/public/grupos/pedido/por-token?token=...
// Dados que o líder vê na página de aprovação (o token É a credencial).
router.get('/pedido/por-token', async (req, res) => {
  try {
    const payload = verificarToken(req.query.token, 'aprov', Date.now(),
      { aceitarExpirado: await haTemporadaAberta() });
    if (!payload) return res.status(401).json({ error: 'Link inválido ou expirado. Você ainda pode aprovar pelo sistema em /grupos.' });

    const { data: pedido, error: ePed } = await supabase.from('mem_grupo_pedidos')
      .select('id, nome, telefone, email, observacao, status, created_at, motivo_rejeicao, grupo_id, mem_grupos(id, nome, codigo, bairro, dia_semana, horario, recorrencia, local, endereco, complemento, capacidade, lider_id)')
      .eq('id', payload.p).is('deleted_at', null).maybeSingle();
    if (ePed) throw ePed; // falha de infra é 500, não "não encontrado" terminal
    if (!pedido) return res.status(404).json({ error: 'Pedido não encontrado.' });

    const grupo = pedido.mem_grupos || {};
    // O token é amarrado ao líder que o recebeu (payload.l). Se a liderança
    // do grupo mudou, o link antigo deixa de valer.
    if (!payload.l || grupo.lider_id !== payload.l) {
      return res.status(403).json({ error: 'A liderança deste grupo mudou — este link não vale mais. O novo líder decide pelo sistema em /grupos.' });
    }
    delete grupo.lider_id;
    let membrosAtivos = null;
    if (grupo.id) {
      const { count } = await supabase.from('mem_grupo_membros')
        .select('id', { count: 'exact', head: true })
        .eq('grupo_id', grupo.id).is('saiu_em', null).is('deleted_at', null);
      membrosAtivos = count || 0;
    }

    // Inscrição em par (grupo de casais): a página mostra os DOIS nomes e
    // deixa claro que a decisão vale pro casal.
    const par = await carregarParCasal(pedido);

    res.json({
      pedido: {
        id: pedido.id, nome: pedido.nome, telefone: pedido.telefone, email: pedido.email,
        observacao: pedido.observacao, status: pedido.status, created_at: pedido.created_at,
        motivo_rejeicao: pedido.motivo_rejeicao,
      },
      casal: par ? {
        nome: par.nome, telefone: par.telefone, email: par.email, status: par.status,
      } : null,
      grupo: {
        nome: grupo.nome, codigo: grupo.codigo, bairro: grupo.bairro,
        quando: formatarQuando(grupo), onde: formatarOnde(grupo),
        capacidade: grupo.capacidade ?? null, membros_ativos: membrosAtivos,
      },
    });
  } catch (e) {
    console.error('[public grupos pedido-por-token]', e.message);
    res.status(500).json({ error: 'Erro ao carregar pedido.' });
  }
});

// POST /api/public/grupos/aprovar — body { token, acao: 'aprovar'|'rejeitar', motivo? }
router.post('/aprovar', async (req, res) => {
  try {
    const { token, acao, motivo } = req.body || {};
    // Mesma régua do GET: vencido só passa com a temporada aberta (ver
    // `haTemporadaAberta`). Tem que ser a MESMA nos dois — se o GET abrisse a
    // página e o POST recusasse, o líder decidiria e levaria erro na cara.
    const payload = verificarToken(token, 'aprov', Date.now(),
      { aceitarExpirado: await haTemporadaAberta() });
    if (!payload) return res.status(401).json({ error: 'Link inválido ou expirado. Você ainda pode decidir pelo sistema em /grupos.' });
    // 'sem_contato' (Naná · 17/08): o líder LIGOU e não conseguiu falar. Não é
    // recusa — vai pra triagem como os devolvidos, mas com desfecho próprio,
    // que é o que a coordenação precisa distinguir.
    if (!['aprovar', 'rejeitar', 'sem_contato'].includes(acao)) return res.status(400).json({ error: 'Ação inválida.' });

    const { data: pedido, error: ePed } = await supabase.from('mem_grupo_pedidos')
      .select('id, status, grupo_id, membro_id, nome').eq('id', payload.p).is('deleted_at', null).maybeSingle();
    if (ePed) throw ePed; // falha de infra é 500, não "não encontrado" terminal
    if (!pedido) return res.status(404).json({ error: 'Pedido não encontrado.' });
    if (pedido.status !== 'pendente') {
      // Rótulo amigável — 'devolvido'/'encaminhado' são jargão interno.
      const STATUS_TXT = {
        aprovado: 'aprovado',
        rejeitado: 'recusado',
        devolvido: 'recusado — a equipe de grupos está cuidando do próximo passo',
        encaminhado: 'levado pela equipe de grupos, que sugeriu outro grupo à pessoa',
        cancelado: 'encerrado',
      };
      return res.status(409).json({ error: `Este pedido já foi ${STATUS_TXT[pedido.status] || pedido.status}.`, status: pedido.status });
    }

    // Quem decide por este link é o líder do grupo (foi ele quem o recebeu).
    // O token carrega o líder da época (payload.l): se a liderança mudou, o
    // link antigo deixa de valer.
    let liderNome = 'Líder do grupo';
    const { data: grupo } = await supabase.from('mem_grupos')
      .select('id, nome, lider_id').eq('id', pedido.grupo_id).is('deleted_at', null).maybeSingle();
    if (!payload.l || !grupo || grupo.lider_id !== payload.l) {
      return res.status(403).json({ error: 'A liderança deste grupo mudou — este link não vale mais. O novo líder decide pelo sistema em /grupos.' });
    }
    if (grupo.lider_id) {
      const { data: lider } = await supabase.from('mem_membros')
        .select('nome').eq('id', grupo.lider_id).maybeSingle();
      if (lider?.nome) liderNome = lider.nome;
    }
    const decididoPorNome = `${liderNome} (link WhatsApp)`;

    // Inscrição em par (grupo de casais · Marcos 30/07): a decisão do líder
    // vale pro CASAL — aprovar aprova os dois, recusar devolve os dois.
    const par = await carregarParCasal(pedido);

    if (acao === 'aprovar') {
      // Mesmo núcleo da aprovação autenticada (promoção de cadastro pendente,
      // matcher anti-duplicata, vínculo idempotente, notificações e WhatsApp).
      const { aprovarPedidoCore } = require('./grupos');
      const r = await aprovarPedidoCore(pedido.id, { userId: null, name: decididoPorNome });
      if (!r.ok) return res.status(r.code).json({ error: r.error });

      // O par entra pelo MESMO núcleo. Idempotente: par já aprovado não
      // quebra (só informa). Par já rejeitado/devolvido/encaminhado NÃO é
      // reaberto por aqui — a triagem assumiu aquele caso; aprova só este e
      // devolve o status real pra página ser honesta com o líder.
      let casal = null;
      if (par) {
        if (par.status === 'pendente') {
          try {
            const rp = await aprovarPedidoCore(par.id, { userId: null, name: decididoPorNome });
            casal = rp.ok
              ? { nome: par.nome, ok: true, status: 'aprovado' }
              : { nome: par.nome, ok: false, status: par.status, error: rp.error };
          } catch (e) {
            console.error('[public grupos aprovar casal]', e.message);
            casal = { nome: par.nome, ok: false, status: par.status, error: 'Não foi possível aprovar o cônjuge agora — faça pelo sistema em /grupos.' };
          }
        } else {
          casal = { nome: par.nome, ok: par.status === 'aprovado', status: par.status };
        }
      }
      return res.json({ ok: true, acao: 'aprovado', casal });
    }

    // Recusa do LÍDER não é terminal (Marcos · 14/07): o pedido volta pra
    // TRIAGEM (Naná/Nélio · status 'devolvido') — a equipe, que está acima do
    // líder, sugere outro grupo pra pessoa ou rejeita de vez. A pessoa NÃO é
    // comunicada aqui e o motivo do líder fica interno.
    //
    // 'sem_contato' anda pelo MESMO caminho (vai pra triagem, pessoa não é
    // avisada) e muda só o DESFECHO registrado — o líder tentou e não
    // conseguiu falar. ⚠️ Não é sinônimo de recusa: tratar como recusa faria a
    // coordenação ler "o líder não quis a pessoa" onde houve só telefone que
    // não atendeu, e é justamente essa distinção que a Naná pediu.
    const semContato = acao === 'sem_contato';
    const novoStatus = semContato ? 'sem_contato' : 'devolvido';
    const tipoEvento = semContato ? 'sem_contato_lider' : 'recusado_lider';
    // No 'sem_contato' o campo de motivo nem é oferecido na tela — o motivo é
    // o próprio desfecho. Gravar ali um texto de recusa confundiria as duas.
    const motivoInterno = (!semContato && motivo) ? String(motivo).trim().slice(0, 500) : null;
    const { data: claimed } = await supabase.from('mem_grupo_pedidos').update({
      status: novoStatus,
      motivo_rejeicao: motivoInterno,
      decidido_por: null,
      decidido_por_nome: decididoPorNome,
      decidido_em: new Date().toISOString(),
    }).eq('id', pedido.id).eq('status', 'pendente').select('id');
    if (!claimed || !claimed.length) {
      return res.status(409).json({ error: 'Este pedido já foi decidido.', status: 'decidido' });
    }

    registrarEventoPedido(pedido.id, tipoEvento, { motivo_interno: motivoInterno }, decididoPorNome);

    // Casal: a recusa devolve os DOIS pra triagem (a equipe cuida do casal
    // junto — separar o casal na triagem seria o oposto do pedido). Guarda de
    // corrida igual à do titular: só devolve o par se AINDA está pendente.
    let casal = null;
    if (par) {
      if (par.status === 'pendente') {
        const { data: parClaimed } = await supabase.from('mem_grupo_pedidos').update({
          status: novoStatus,
          motivo_rejeicao: motivoInterno,
          decidido_por: null,
          decidido_por_nome: decididoPorNome,
          decidido_em: new Date().toISOString(),
        }).eq('id', par.id).eq('status', 'pendente').select('id');
        if (parClaimed && parClaimed.length) {
          registrarEventoPedido(par.id, tipoEvento, { motivo_interno: motivoInterno, casal: true }, decididoPorNome);
          casal = { nome: par.nome, ok: true, status: novoStatus };
        } else {
          casal = { nome: par.nome, ok: false, status: 'decidido' };
        }
      } else {
        casal = { nome: par.nome, ok: false, status: par.status };
      }
    }

    // Avisa a TRIAGEM (módulo grupos) — mesma notificação da recusa autenticada.
    // ⚠️ O texto diz o que REALMENTE aconteceu: "não conseguiu contato" e
    // "recusou" pedem ações diferentes da coordenação (tentar por outro canal
    // × realocar), e um aviso genérico apagaria a distinção logo no lugar onde
    // ela decide.
    (async () => {
      try {
        const nomesTriagem = casal && casal.ok ? `${pedido.nome} e ${casal.nome} (casal)` : pedido.nome;
        const alvo = casal && casal.ok ? 'eles' : 'a pessoa';
        await notificar({
          modulo: 'grupos',
          tipo: semContato ? 'pedido_sem_contato' : 'pedido_devolvido',
          titulo: semContato
            ? `Sem contato — o líder não conseguiu falar: ${nomesTriagem}`
            : `Pedido devolvido pra triagem: ${nomesTriagem}`,
          mensagem: semContato
            ? `O líder de ${grupo?.nome || 'um grupo'} tentou falar com ${alvo} e não conseguiu. Não é recusa — tente por outro canal ou encerre o pedido.`
            : `O líder de ${grupo?.nome || 'um grupo'} recusou o pedido${casal && casal.ok ? ' do casal' : ''}${motivoInterno ? ` (motivo interno: ${motivoInterno.slice(0, 200)})` : ''}. Sugira outro grupo pra ${casal && casal.ok ? 'eles' : 'pessoa'} ou rejeite de vez.`,
          link: '/grupos?tab=entrada',
          severidade: 'aviso',
          chaveDedup: `pedido_${semContato ? 'sem_contato' : 'devolvido'}_${pedido.id}`,
        });
      } catch (err) { console.error('[public grupos recusar notify]', err.message); }
    })();

    res.json({ ok: true, acao: semContato ? 'sem_contato' : 'rejeitado', casal });
  } catch (e) {
    console.error('[public grupos aprovar]', e.message);
    res.status(500).json({ error: 'Erro ao processar decisão.' });
  }
});

// ─────────────────────────────────────────────────────────────
// Realocação · a PESSOA aceita a sugestão de outro grupo pelo link do
// WhatsApp (/g/s/<token>). Token tipo 'suges' carrega { p: pedidoId,
// g: grupoSugeridoId }. Aceitar move o pedido pro grupo sugerido e aprova
// com o mesmo núcleo da aprovação (quem sugeriu tem nível 3 — o aceite da
// pessoa fecha o combinado). Recusar não existe no backend: a pessoa
// simplesmente ignora e o pedido original continua pendente.
// ─────────────────────────────────────────────────────────────

// GET /api/public/grupos/pedido/sugestao?token=...
router.get('/pedido/sugestao', async (req, res) => {
  try {
    const payload = verificarToken(req.query.token, 'suges');
    if (!payload) return res.status(401).json({ error: 'Link inválido ou expirado.' });

    const { data: pedido } = await supabase.from('mem_grupo_pedidos')
      .select('*, mem_grupos(nome)')
      .eq('id', payload.p).is('deleted_at', null).maybeSingle();
    if (!pedido) return res.status(404).json({ error: 'Pedido não encontrado.' });

    const { data: sugerido } = await supabase.from('mem_grupos')
      .select('id, nome, codigo, bairro, dia_semana, horario, recorrencia, local, endereco, complemento, capacidade, ativo, aceitando_inscricoes')
      .eq('id', payload.g).is('deleted_at', null).maybeSingle();
    if (!sugerido || !sugerido.ativo) {
      return res.status(410).json({ error: 'O grupo sugerido não está mais disponível. Seu pedido original continua valendo.' });
    }

    // Dados pra pré-preencher o form público ("Quero escolher outro grupo"
    // sem redigitar — e sem duplicata: mesmos dados = mesmo match no dedup).
    // CPF fica de fora de propósito (a pessoa completa na hora).
    let pessoa = { nome: pedido.nome || null, telefone: pedido.telefone || null, email: pedido.email || null, data_nascimento: null, genero: null };
    try {
      if (pedido.membro_id) {
        const { data: m } = await supabase.from('mem_membros')
          .select('nome, telefone, email, data_nascimento, genero').eq('id', pedido.membro_id).maybeSingle();
        if (m) pessoa = { nome: m.nome || pessoa.nome, telefone: m.telefone || pessoa.telefone, email: m.email || pessoa.email, data_nascimento: m.data_nascimento || null, genero: m.genero || null };
      } else if (pedido.cadastro_pendente_id) {
        const { data: cadp } = await supabase.from('mem_cadastros_pendentes')
          .select('nome, telefone, email, data_nascimento, genero').eq('id', pedido.cadastro_pendente_id).maybeSingle();
        if (cadp) pessoa = { nome: cadp.nome || pessoa.nome, telefone: cadp.telefone || pessoa.telefone, email: cadp.email || pessoa.email, data_nascimento: cadp.data_nascimento || null, genero: cadp.genero || null };
      }
    } catch (e) { console.error('[public grupos sugestao pessoa]', e.message); }

    res.json({
      pedido: {
        nome: pedido.nome,
        status: pedido.status,
        grupo_original: pedido.mem_grupos?.nome || null,
        // Fechado porque a pessoa foi aprovada em OUTRO pedido dela
        resolvido_em_outro: Boolean(pedido.resolvido_grupo_id),
      },
      pessoa,
      grupo: {
        nome: sugerido.nome, codigo: sugerido.codigo, bairro: sugerido.bairro,
        quando: formatarQuando(sugerido), onde: formatarOnde(sugerido),
      },
    });
  } catch (e) {
    console.error('[public grupos sugestao]', e.message);
    res.status(500).json({ error: 'Erro ao carregar sugestão.' });
  }
});

// POST /api/public/grupos/sugestao/aceitar — body { token }
router.post('/sugestao/aceitar', async (req, res) => {
  try {
    const payload = verificarToken(req.body?.token, 'suges');
    if (!payload) return res.status(401).json({ error: 'Link inválido ou expirado.' });

    const { data: pedido } = await supabase.from('mem_grupo_pedidos')
      .select('id, status, grupo_id, nome').eq('id', payload.p).is('deleted_at', null).maybeSingle();
    if (!pedido) return res.status(404).json({ error: 'Pedido não encontrado.' });
    // 'devolvido' (recusado pelo líder) e 'encaminhado' (sugestão enviada)
    // também aceitam — o aceite reativa o pedido como pendente no grupo sugerido.
    if (!['pendente', 'devolvido', 'encaminhado'].includes(pedido.status)) {
      return res.status(409).json({ error: `Este pedido já foi ${pedido.status}.`, status: pedido.status });
    }

    const { data: sugerido } = await supabase.from('mem_grupos')
      .select('id, nome, ativo, aceitando_inscricoes, modo_inscricao').eq('id', payload.g).is('deleted_at', null).maybeSingle();
    if (!sugerido || !sugerido.ativo || sugerido.aceitando_inscricoes === false || sugerido.modo_inscricao === 'fechado') {
      // aceitando=false: o líder do grupo sugerido pausou as entradas DEPOIS
      // da sugestão — respeita a trava dele (capacidade é conselho; pausa não).
      // modo fechado: o grupo virou por-convite depois da sugestão — idem.
      return res.status(410).json({ error: 'O grupo sugerido não está mais disponível. Seu pedido original continua valendo.' });
    }

    // Move o pedido pro grupo sugerido e aprova com o núcleo compartilhado.
    // Se a pessoa já tiver pedido pendente no grupo sugerido, o índice único
    // barra o UPDATE (23505) → resposta amigável.
    const { error: eMove } = await supabase.from('mem_grupo_pedidos')
      .update({ grupo_id: payload.g, status: 'pendente' }) // devolvido/encaminhado reativa como pendente no grupo novo
      .eq('id', pedido.id).in('status', ['pendente', 'devolvido', 'encaminhado']);
    if (eMove) {
      if (eMove.code === '23505') {
        return res.status(409).json({ error: 'Você já tem um pedido para esse grupo — o líder vai te responder por lá.' });
      }
      throw eMove;
    }

    // O revert do move precisa cobrir TAMBÉM exceção do core (erro de infra /
    // falha no vínculo — o core repõe status pendente e relança): sem isso o
    // pedido ficaria pendente órfão no grupo errado. Restaura o status original
    // (um devolvido volta a ser devolvido no grupo original).
    const reverterMove = () => supabase.from('mem_grupo_pedidos')
      .update({ grupo_id: pedido.grupo_id, status: pedido.status }).eq('id', pedido.id).eq('status', 'pendente');

    const { aprovarPedidoCore } = require('./grupos');
    let r;
    try {
      r = await aprovarPedidoCore(pedido.id, { userId: null, name: 'Aceite da pessoa (sugestão de grupo)' });
    } catch (e) {
      await reverterMove().then(() => {}, () => {});
      throw e;
    }
    if (!r.ok) {
      // Só se AINDA está pendente: se outro decisor aprovou no meio (já com o
      // grupo_id movido), o vínculo foi pro grupo sugerido — reverter o
      // grupo_id deixaria o registro apontando pro grupo errado.
      await reverterMove();
      return res.status(r.code).json({ error: r.error });
    }

    // O core devolve o grupo em que a aprovação DE FATO caiu (dois aceites de
    // sugestões diferentes podem correr — responde com o grupo certo).
    let grupoFinal = sugerido.nome;
    if (r.grupo_id && r.grupo_id !== payload.g) {
      const { data: real } = await supabase.from('mem_grupos')
        .select('nome').eq('id', r.grupo_id).maybeSingle();
      if (real?.nome) grupoFinal = real.nome;
    }

    res.json({ ok: true, grupo: grupoFinal });
  } catch (e) {
    console.error('[public grupos sugestao aceitar]', e.message);
    res.status(500).json({ error: 'Erro ao processar aceite.' });
  }
});

// ─────────────────────────────────────────────────────────────
// Frequência MENSAL pelo líder (/g/f/<token> · sem login).
// 1×/mês o cron manda o template com o link; o líder marca quem participou
// dos encontros do mês → vira mem_grupo_encontros + presenças (data = último
// dia do mês), pelos MESMOS RPCs do fluxo autenticado (contadores ok).
// Token 'freq' = { p: grupoId, m: 'YYYY-MM', l: liderId } · amarrado ao líder
// (o assinarToken sempre grava o id do assunto em `p`).
// ─────────────────────────────────────────────────────────────

// Último dia do mês 'YYYY-MM' → 'YYYY-MM-DD'
function ultimoDiaDoMes(m) {
  const [ano, mes] = String(m || '').split('-').map(Number);
  if (!ano || !mes || mes < 1 || mes > 12) return null;
  const dia = new Date(ano, mes, 0).getDate();
  return `${ano}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
}

// Carrega e valida o contexto do token de frequência (grupo + líder atual).
async function contextoFrequencia(token) {
  const payload = verificarToken(token, 'freq');
  if (!payload) return { erro: { status: 401, msg: 'Link inválido ou expirado.' } };
  const dataEncontro = ultimoDiaDoMes(payload.m);
  if (!dataEncontro) return { erro: { status: 400, msg: 'Mês inválido no link.' } };
  const { data: grupo, error } = await supabase.from('mem_grupos')
    .select('id, nome, lider_id, ativo').eq('id', payload.p).is('deleted_at', null).maybeSingle();
  if (error) throw error;
  if (!grupo || !grupo.ativo) return { erro: { status: 404, msg: 'Grupo não encontrado.' } };
  if (!payload.l || grupo.lider_id !== payload.l) {
    return { erro: { status: 403, msg: 'A liderança deste grupo mudou — este link não vale mais.' } };
  }
  return { payload, grupo, dataEncontro };
}

// GET /api/public/grupos/grupo/frequencia?token=...
// Roster do grupo + o que já foi marcado neste mês (reedição).
router.get('/grupo/frequencia', async (req, res) => {
  try {
    const ctx = await contextoFrequencia(req.query.token);
    if (ctx.erro) return res.status(ctx.erro.status).json({ error: ctx.erro.msg });
    const { payload, grupo, dataEncontro } = ctx;

    const { data: vinculos } = await supabase.from('mem_grupo_membros')
      .select('membro_id, mem_membros!inner(id, nome, foto_url)')
      .eq('grupo_id', grupo.id).is('saiu_em', null).is('deleted_at', null)
      .limit(1000);

    // Já existe a chamada deste mês? (UNIQUE grupo+data)
    const { data: encontro } = await supabase.from('mem_grupo_encontros')
      .select('id').eq('grupo_id', grupo.id).eq('data', dataEncontro).maybeSingle();
    let presentes = [];
    if (encontro) {
      const { data: pres } = await supabase.from('mem_grupo_encontro_presencas')
        .select('membro_id').eq('encontro_id', encontro.id).eq('presente', true);
      presentes = (pres || []).map(p => p.membro_id);
    }

    res.json({
      grupo: { nome: grupo.nome },
      mes: payload.m,
      mes_rotulo: rotuloMes(payload.m),
      ja_salvo: !!encontro,
      membros: (vinculos || [])
        .map(v => ({
          id: v.mem_membros.id,
          nome: v.mem_membros.nome,
          foto_url: v.mem_membros.foto_url || null,
          presente: presentes.includes(v.mem_membros.id),
        }))
        .sort((a, b) => (a.nome || '').localeCompare(b.nome || '', 'pt-BR')),
    });
  } catch (e) {
    console.error('[public grupos frequencia get]', e.message);
    res.status(500).json({ error: 'Erro ao carregar o grupo.' });
  }
});

// POST /api/public/grupos/grupo/frequencia — body { token, presentes: [membro_ids] }
router.post('/grupo/frequencia', async (req, res) => {
  try {
    const { token, presentes } = req.body || {};
    if (!Array.isArray(presentes)) return res.status(400).json({ error: 'presentes deve ser uma lista.' });
    const ctx = await contextoFrequencia(token);
    if (ctx.erro) return res.status(ctx.erro.status).json({ error: ctx.erro.msg });
    const { payload, grupo, dataEncontro } = ctx;

    // Só membros do roster ativo podem ser marcados (token não dá poder além do grupo)
    const { data: vinculos } = await supabase.from('mem_grupo_membros')
      .select('membro_id').eq('grupo_id', grupo.id).is('saiu_em', null).is('deleted_at', null).limit(1000);
    const roster = new Set((vinculos || []).map(v => v.membro_id));
    const marcados = [...new Set(presentes.filter(id => roster.has(id)))];

    let liderNome = 'Líder do grupo';
    const { data: lider } = await supabase.from('mem_membros').select('nome').eq('id', grupo.lider_id).maybeSingle();
    if (lider?.nome) liderNome = lider.nome;

    const observacoes = `Frequência do mês (${rotuloMes(payload.m)}) registrada pelo líder via WhatsApp.`;
    const { data: encontro } = await supabase.from('mem_grupo_encontros')
      .select('id, tema, observacoes').eq('grupo_id', grupo.id).eq('data', dataEncontro).maybeSingle();

    if (encontro) {
      // Já existe encontro nesta data. Dois casos:
      //  - É o NOSSO (marcador "Frequência do mês" nas observações): reedição
      //    legítima → substitui as presenças pelo set novo.
      //  - É um encontro MANUAL do líder que caiu no último dia do mês: NÃO
      //    pode ser corrompido → preserva tema/observações (anexa o marcador)
      //    e faz UNIÃO das presenças (frequência nunca REMOVE presença manual).
      const nosso = (encontro.observacoes || '').includes('Frequência do mês');
      let presencasFinais = marcados;
      let temaFinal = encontro.tema || 'Frequência do mês';
      let obsFinal = observacoes;
      if (!nosso) {
        const { data: presAtuais } = await supabase.from('mem_grupo_encontro_presencas')
          .select('membro_id').eq('encontro_id', encontro.id).eq('presente', true);
        presencasFinais = [...new Set([...(presAtuais || []).map(p => p.membro_id), ...marcados])];
        temaFinal = encontro.tema || null;
        obsFinal = [encontro.observacoes, observacoes].filter(Boolean).join(' · ');
      }
      // Mesmo RPC do PATCH autenticado (diff de presenças + contadores)
      const { error } = await supabase.rpc('atualizar_encontro_grupo', {
        p_encontro_id: encontro.id,
        p_data: null, p_tema: temaFinal, p_observacoes: obsFinal,
        p_membros_presentes: presencasFinais,
      });
      if (error) throw error;
    } else {
      const { error } = await supabase.rpc('registrar_encontro_grupo', {
        p_grupo_id: grupo.id,
        p_data: dataEncontro,
        p_tema: 'Frequência do mês',
        p_observacoes: observacoes,
        p_registrado_por: null,
        p_registrado_por_nome: `${liderNome} (link WhatsApp)`,
        p_membros_presentes: marcados,
      });
      if (error) throw error;
    }

    res.json({ ok: true, marcados: marcados.length, total: roster.size });
  } catch (e) {
    console.error('[public grupos frequencia post]', e.message);
    res.status(500).json({ error: 'Erro ao salvar a frequência.' });
  }
});

// POST /api/public/grupos/grupo/frequencia/visitante — body { token, nome, telefone }
// Líder adiciona um visitante que apareceu no encontro (Marcos · 18/07): captura
// quem nunca preencheu formulário. Roteia pelo matcher (Contrato de porta · não
// duplica) e entra no roster como visitante (entrou_em=hoje) → aparece na chamada
// pra marcar presente, no funil (membresia) e destacado como "novo". Idempotente:
// se já está ativo no grupo, só devolve o membro.
router.post('/grupo/frequencia/visitante', async (req, res) => {
  try {
    const { token, nome, telefone } = req.body || {};
    const ctx = await contextoFrequencia(token);
    if (ctx.erro) return res.status(ctx.erro.status).json({ error: ctx.erro.msg });
    const { grupo } = ctx;

    if (!nome || nome.trim().length < 3) return res.status(400).json({ error: 'Digite o nome do visitante.', campo: 'nome' });
    if (!telefone || soDigitos(telefone).length < 10) return res.status(400).json({ error: 'Digite um celular válido com DDD.', campo: 'telefone' });

    // Matcher: liga a quem já existe (chave forte) ou cria stub visitante. Sem
    // CPF, telefone é chave fraca → pode criar novo (a Naná deduplica depois).
    const r = await acharOuCriarGuardado({ nome: nome.trim(), telefone, status: 'visitante' });
    const membroId = r?.membro_id;
    if (!membroId) return res.status(500).json({ error: 'Não foi possível registrar o visitante.' });

    // Já ativo no grupo? Só devolve (idempotente · não duplica vínculo).
    const { data: jaAtivo } = await supabase.from('mem_grupo_membros')
      .select('id').eq('grupo_id', grupo.id).eq('membro_id', membroId)
      .is('saiu_em', null).is('deleted_at', null).limit(1);
    if (!jaAtivo || !jaAtivo.length) {
      const { error: eVinc } = await supabase.from('mem_grupo_membros').insert({
        grupo_id: grupo.id, membro_id: membroId, funcao: 'visitante',
        entrou_em: new Date().toISOString().slice(0, 10),
      });
      if (eVinc) throw eVinc;
    }

    const { data: mem } = await supabase.from('mem_membros')
      .select('id, nome, foto_url').eq('id', membroId).maybeSingle();
    res.json({ ok: true, membro: { id: membroId, nome: mem?.nome || nome.trim(), foto_url: mem?.foto_url || null } });
  } catch (e) {
    console.error('[public grupos frequencia visitante]', e.message);
    res.status(500).json({ error: 'Erro ao adicionar o visitante.' });
  }
});

// ─────────────────────────────────────────────────────────────
// RENOVAÇÃO DE TEMPORADA pelo líder (/g/r/<token> · sem login).
// 1×/semestre (disparo MANUAL da coordenação) o líder diz se continua com o
// grupo na próxima temporada. SIM → checklist do roster; quem não for marcado
// sai do grupo (saiu_em · soft · renovacao_id aponta pra esta renovação —
// re-submissão reativa com precisão). NÃO → motivo obrigatório e o grupo vai
// pra triagem da coordenação (caixa de entrada) — o grupo NÃO fecha sozinho.
// Token 'renov' = { p: grupoId, r: renovacaoId, g: geração, l: liderId } ·
// a validade REAL é decidida aqui a cada uso (não só o exp de 30d):
// geração × linha (reenvio mata link antigo), liderança atual, linha não
// triada e inscrições da temporada ainda fechadas (resposta tardia não pode
// mexer num roster que a abertura já está montando).
// ─────────────────────────────────────────────────────────────

async function contextoRenovacao(token) {
  const payload = verificarToken(token, 'renov');
  if (!payload) return { erro: { status: 401, msg: 'Link inválido ou expirado.' } };
  const { data: ren, error } = await supabase.from('mem_grupo_renovacoes')
    .select('*').eq('id', payload.r).is('deleted_at', null).maybeSingle();
  if (error) throw error;
  if (!ren || ren.grupo_id !== payload.p) return { erro: { status: 404, msg: 'Renovação não encontrada.' } };
  if ((payload.g || 1) !== (ren.token_geracao || 1)) {
    return { erro: { status: 403, msg: 'Este link foi substituído por um mais novo — abra o último que você recebeu no WhatsApp.' } };
  }
  const { data: grupo } = await supabase.from('mem_grupos')
    .select('id, nome, lider_id, ativo').eq('id', ren.grupo_id).is('deleted_at', null).maybeSingle();
  if (!grupo || !grupo.ativo) return { erro: { status: 404, msg: 'Grupo não encontrado ou já encerrado.' } };
  if (!payload.l || grupo.lider_id !== payload.l) {
    return { erro: { status: 403, msg: 'A liderança deste grupo mudou — este link não vale mais.' } };
  }
  if (ren.status === 'triada') {
    return { erro: { status: 409, msg: 'A coordenação já tratou a renovação deste grupo. Se algo mudou, fale direto com ela.' } };
  }
  const { data: temporada } = await supabase.from('mem_temporadas')
    .select('id, label, inscricoes_abertas').eq('id', ren.temporada_id).maybeSingle();
  if (temporada?.inscricoes_abertas) {
    return { erro: { status: 409, msg: 'As inscrições da nova temporada já abriram — ajustes na lista agora são com a coordenação.' } };
  }
  return { payload, ren, grupo, temporada };
}

// Roster pra tela: vínculos ATIVOS + os que ESTA renovação removeu (pra
// reedição). 1 linha por pessoa; `marcado` reflete o estado atual.
async function rosterRenovacao(ren, jaRespondeu) {
  const linhas = new Map(); // membro_id → { id, nome, foto_url, marcado }
  const { data: ativos } = await supabase.from('mem_grupo_membros')
    .select('membro_id, mem_membros!inner(id, nome, foto_url)')
    .eq('grupo_id', ren.grupo_id).is('saiu_em', null).is('deleted_at', null)
    .limit(1000);
  for (const v of (ativos || [])) {
    if (!linhas.has(v.membro_id)) {
      linhas.set(v.membro_id, {
        id: v.mem_membros.id, nome: v.mem_membros.nome,
        foto_url: v.mem_membros.foto_url || null,
        // 1ª visita: tudo desmarcado (o líder marca ativamente quem continua);
        // reedição: quem está ativo aparece marcado (foi confirmado ou entrou depois)
        marcado: !!jaRespondeu,
      });
    }
  }
  const { data: removidos } = await supabase.from('mem_grupo_membros')
    .select('membro_id, mem_membros!inner(id, nome, foto_url)')
    .eq('grupo_id', ren.grupo_id).eq('renovacao_id', ren.id)
    .not('saiu_em', 'is', null).is('deleted_at', null)
    .limit(1000);
  for (const v of (removidos || [])) {
    if (!linhas.has(v.membro_id)) {
      linhas.set(v.membro_id, {
        id: v.mem_membros.id, nome: v.mem_membros.nome,
        foto_url: v.mem_membros.foto_url || null, marcado: false,
      });
    }
  }
  return [...linhas.values()].sort((a, b) => (a.nome || '').localeCompare(b.nome || '', 'pt-BR'));
}

// GET /api/public/grupos/grupo/renovacao?token=...
router.get('/grupo/renovacao', async (req, res) => {
  try {
    const ctx = await contextoRenovacao(req.query.token);
    if (ctx.erro) return res.status(ctx.erro.status).json({ error: ctx.erro.msg });
    const { ren, grupo, temporada } = ctx;
    const jaRespondeu = ren.status !== 'enviada';
    const membros = await rosterRenovacao(ren, ren.status === 'continua');
    res.json({
      grupo: { nome: grupo.nome },
      temporada: { id: ren.temporada_id, label: temporada?.label || ren.temporada_id },
      status: ren.status,           // enviada | continua | nao_continua
      motivo: ren.motivo || null,
      ja_respondeu: jaRespondeu,
      membros,
    });
  } catch (e) {
    console.error('[public grupos renovacao get]', e.message);
    res.status(500).json({ error: 'Erro ao carregar a renovação.' });
  }
});

// POST /api/public/grupos/grupo/renovacao
// body { token, resposta: 'continua'|'nao_continua', continuam: [membro_ids],
//        exibidos: [membro_ids], motivo }
// O servidor SÓ age sobre `exibidos ∩ roster ativo atual`: quem entrou no
// grupo DEPOIS da tela aberta (pedido aprovado, visitante da chamada) nunca é
// removido por um submit atrasado. Última resposta vence (reedição).
router.post('/grupo/renovacao', async (req, res) => {
  try {
    const { token, resposta, motivo } = req.body || {};
    const ctx = await contextoRenovacao(token);
    if (ctx.erro) return res.status(ctx.erro.status).json({ error: ctx.erro.msg });
    const { ren, grupo, temporada } = ctx;
    const agora = new Date().toISOString();
    const hoje = agora.slice(0, 10);
    const label = temporada?.label || ren.temporada_id;

    if (resposta === 'nao_continua') {
      const motivoLimpo = String(motivo || '').trim();
      if (motivoLimpo.length < 5) {
        return res.status(400).json({ error: 'Conte pra gente o motivo — ele ajuda a coordenação a cuidar do grupo.', campo: 'motivo' });
      }
      const { error } = await supabase.from('mem_grupo_renovacoes')
        .update({
          status: 'nao_continua', motivo: motivoLimpo.slice(0, 2000),
          primeira_resposta_em: ren.primeira_resposta_em || agora,
          ultima_resposta_em: agora, updated_at: agora,
        }).eq('id', ren.id);
      if (error) throw error;
      // Nada muda no roster — a coordenação tria (fechar/buscar líder/manter).
      try {
        await notificar({
          modulo: 'grupos',
          tipo: 'renovacao_nao_continua',
          titulo: `Líder não continua: ${grupo.nome}`,
          mensagem: `O líder do grupo ${grupo.nome} respondeu que não continua na temporada ${label}. Motivo: ${motivoLimpo.slice(0, 200)}. O grupo aguarda triagem na caixa de entrada.`,
          link: '/grupos?tab=entrada',
          severidade: 'aviso',
          chaveDedup: `renovacao_nao_continua_${ren.id}`,
        });
      } catch (eN) { console.error('[renovacao notificar]', eN.message); }
      return res.json({ ok: true, status: 'nao_continua' });
    }

    if (resposta !== 'continua') {
      return res.status(400).json({ error: 'Resposta inválida.' });
    }
    const continuam = Array.isArray(req.body?.continuam) ? req.body.continuam : null;
    const exibidos = Array.isArray(req.body?.exibidos) ? req.body.exibidos : null;
    if (!continuam || !exibidos) {
      return res.status(400).json({ error: 'Lista de participantes inválida.' });
    }

    // Roster ativo ATUAL (vínculos linha a linha — pode haver mais de um por pessoa)
    const { data: ativos } = await supabase.from('mem_grupo_membros')
      .select('id, membro_id')
      .eq('grupo_id', grupo.id).is('saiu_em', null).is('deleted_at', null)
      .limit(1000);
    const ativosPorMembro = new Map();
    for (const v of (ativos || [])) {
      if (!ativosPorMembro.has(v.membro_id)) ativosPorMembro.set(v.membro_id, []);
      ativosPorMembro.get(v.membro_id).push(v.id);
    }

    const setExibidos = new Set(exibidos);
    const setContinuam = new Set(continuam.filter(id => setExibidos.has(id)));

    // 1) Remover: exibido + ativo agora + não marcado → fecha TODOS os vínculos
    //    ativos da pessoa neste grupo (soft · renovacao_id = reversível aqui).
    const removerVincIds = [];
    const removidosMembroIds = [];
    for (const [membroId, vincIds] of ativosPorMembro) {
      if (!setExibidos.has(membroId)) continue; // entrou depois da tela — intocado
      if (setContinuam.has(membroId)) continue;
      removerVincIds.push(...vincIds);
      removidosMembroIds.push(membroId);
    }
    if (removerVincIds.length) {
      for (let i = 0; i < removerVincIds.length; i += 150) {
        const { error } = await supabase.from('mem_grupo_membros')
          .update({
            saiu_em: hoje,
            motivo_saida: `Não confirmado na renovação da temporada ${label}`,
            renovacao_id: ren.id,
          })
          .in('id', removerVincIds.slice(i, i + 150));
        if (error) throw error;
      }
    }

    // 2) Reativar: pessoa marcada cujo vínculo FOI fechado por ESTA renovação
    //    (re-submissão corrigindo). Só se não houver outro vínculo ativo dela
    //    no grupo (a Naná pode ter recriado manualmente — nunca duplicar).
    const { data: fechadosPorNos } = await supabase.from('mem_grupo_membros')
      .select('id, membro_id')
      .eq('grupo_id', grupo.id).eq('renovacao_id', ren.id)
      .not('saiu_em', 'is', null).is('deleted_at', null)
      .limit(1000);
    const reativarIds = [];
    const reativadosMembroIds = new Set();
    for (const v of (fechadosPorNos || [])) {
      if (!setContinuam.has(v.membro_id)) continue;
      if (ativosPorMembro.has(v.membro_id)) continue;      // já ativo por outra via
      if (reativadosMembroIds.has(v.membro_id)) continue;  // 1 vínculo por pessoa basta
      reativarIds.push(v.id);
      reativadosMembroIds.add(v.membro_id);
    }
    if (reativarIds.length) {
      for (let i = 0; i < reativarIds.length; i += 150) {
        const { error } = await supabase.from('mem_grupo_membros')
          .update({ saiu_em: null, motivo_saida: null, renovacao_id: null })
          .in('id', reativarIds.slice(i, i + 150));
        if (error) throw error;
      }
    }

    // 3) Resumo na linha (cache de exibição — a fonte auditável é o audit log
    //    de mem_grupo_membros + renovacao_id). Os contadores refletem o estado
    //    APÓS a operação (reedição inclui quem já estava fora e continuou fora),
    //    não só o delta deste submit.
    const confirmadosFinal = [...setContinuam];
    // "Fora" = pessoa que o líder NÃO marcou (independente do caminho: fechada
    // agora, ou fechada antes e não re-marcada). Quem está em setContinuam
    // nunca conta — mesmo que o vínculo antigo siga fechado porque a pessoa já
    // estava ativa de novo por outra via (ex.: recriada manualmente).
    const seguemFora = (fechadosPorNos || []).filter(v => !setContinuam.has(v.membro_id));
    const foraAgoraIds = [...removerVincIds, ...seguemFora.map(v => v.id)];
    const foraAgoraMembros = new Set([...removidosMembroIds, ...seguemFora.map(v => v.membro_id)]);
    const { error: eUp } = await supabase.from('mem_grupo_renovacoes')
      .update({
        status: 'continua', motivo: null,
        roster_total: setExibidos.size,
        confirmados_count: confirmadosFinal.length,
        removidos_count: foraAgoraMembros.size,
        confirmados_ids: confirmadosFinal,
        removidos_vinculo_ids: [...new Set(foraAgoraIds)],
        primeira_resposta_em: ren.primeira_resposta_em || agora,
        ultima_resposta_em: agora, updated_at: agora,
      }).eq('id', ren.id);
    if (eUp) throw eUp;

    res.json({
      ok: true, status: 'continua',
      confirmados: confirmadosFinal.length,
      removidos: foraAgoraMembros.size,
      reativados: reativarIds.length,
    });
  } catch (e) {
    console.error('[public grupos renovacao post]', e.message);
    res.status(500).json({ error: 'Erro ao salvar a resposta.' });
  }
});

// ─────────────────────────────────────────────────────────────
// CONFIRA A LISTA DO SEU GRUPO (/g/c/<token> · sem login).
// 3º fluxo do líder, irmão da renovação: SEM a pergunta "vai continuar?" e SEM
// a trava de temporada aberta. O líder abre, vê a lista ATUAL do grupo — toda
// marcada como "faz parte" — e DESMARCA quem não faz mais parte.
//
// Diferença de produto vs. renovação (decisão do Marcos · 2026-07-31): lá a
// lista vem DESMARCADA (o líder confirma ativamente quem fica); aqui vem toda
// MARCADA (o padrão esperado é "a lista está certa" e queremos atrito só em
// quem sai). Remoção soft e rastreável por conferencia_id; reedição permitida
// (última vence); observação ÚNICA e OPCIONAL pro lote; NUNCA remover por
// omissão; a pessoa removida NÃO é notificada.
//
// Token 'conf' = { p: grupoId, c: conferenciaId, g: geração, l: liderId } ·
// a validade REAL é decidida aqui a cada uso (não só o exp de 30d): geração ×
// linha (reenvio mata link antigo), liderança atual e linha não triada.
// ─────────────────────────────────────────────────────────────

// ⚠️ A tabela/coluna nova é do fluxo NOVO. Se a migration 20260731120000 não
// estiver aplicada, o PostgREST recusa a query inteira (lição `parcelas_max`) —
// aqui isso vira 503 com aviso claro, NUNCA 500 opaco. Nenhum fluxo existente
// toca essas colunas, então frequência/renovação não piscam sem a migration.
const RE_SCHEMA_AUSENTE = /(does not exist|could not find|schema cache|42703|42P01|PGRST20[24])/i;
function schemaAusente(e) {
  return RE_SCHEMA_AUSENTE.test(`${e?.code || ''} ${e?.message || ''} ${e?.details || ''}`);
}
const AVISO_SEM_MIGRATION = 'A conferência da lista ainda não está disponível no servidor (migration pendente). Avise a coordenação.';

async function contextoConferencia(token) {
  const payload = verificarToken(token, 'conf');
  if (!payload) return { erro: { status: 401, msg: 'Link inválido ou expirado.' } };
  const { data: conf, error } = await supabase.from('mem_grupo_conferencias')
    .select('*').eq('id', payload.c).is('deleted_at', null).maybeSingle();
  if (error) throw error;
  if (!conf || conf.grupo_id !== payload.p) return { erro: { status: 404, msg: 'Conferência não encontrada.' } };
  if ((payload.g || 1) !== (conf.token_geracao || 1)) {
    return { erro: { status: 403, msg: 'Este link foi substituído por um mais novo — abra o último que você recebeu no WhatsApp.' } };
  }
  const { data: grupo } = await supabase.from('mem_grupos')
    .select('id, nome, lider_id, ativo').eq('id', conf.grupo_id).is('deleted_at', null).maybeSingle();
  if (!grupo || !grupo.ativo) return { erro: { status: 404, msg: 'Grupo não encontrado ou já encerrado.' } };
  if (!payload.l || grupo.lider_id !== payload.l) {
    return { erro: { status: 403, msg: 'A liderança deste grupo mudou — este link não vale mais.' } };
  }
  if (conf.status === 'triada') {
    return { erro: { status: 409, msg: 'A coordenação já tratou a conferência deste grupo. Se algo mudou, fale direto com ela.' } };
  }
  // Cinto e suspensório da revogação: rodada NOVA torna a anterior inválida.
  // O disparo já incrementa o token_geracao da linha antiga (gruposEnvios ·
  // dispararConfira), mas a checagem de geração só olha a PRÓPRIA linha — se
  // aquele update falhar/for revertido, o link velho continuaria abrindo e as
  // remoções cairiam na rodada errada (o painel lê só a última).
  const { data: maisNova, error: eNova } = await supabase.from('mem_grupo_conferencias')
    .select('id').eq('grupo_id', conf.grupo_id).is('deleted_at', null)
    .gt('rodada', conf.rodada || 1).limit(1);
  if (eNova) throw eNova;
  if (maisNova && maisNova.length) {
    return { erro: { status: 403, msg: 'Este link foi substituído por um mais novo — abra o último que você recebeu no WhatsApp.' } };
  }
  // NOTA: de propósito NÃO há trava de temporada aqui (é o que diferencia este
  // fluxo da renovação · a lista precisa poder ser conferida no meio da T2).
  return { payload, conf, grupo };
}

// ⚠️ LIDERANÇA NÃO É REMOVÍVEL por este fluxo. Cenário real: co-líder Ana no
// roster; o líder desmarca achando que é participante → `saiu_em` gravado → o
// `GET /public/grupos/buscar` (que monta lideres_busca/lideres_exibicao com
// `funcao IN ('lider','co_lider')` + `saiu_em IS NULL`) para de devolver a Ana
// e **o grupo deixa de ser encontrável pelo nome dela** na página pública e no
// mapa, sem ninguém ser avisado. Trocar liderança é ato de gestão (aba Pessoas
// do /grupos · PUT /membros/:id/funcao), não efeito colateral de conferir lista.
const FUNCOES_PROTEGIDAS = new Set(['lider', 'co_lider']);

// ── 4 categorias da conferência (Marcos · 04/08, fechamento com a Naná) ──
// lideranca 🔒 · inscrito (entrou NESTA temporada, incluindo o piloto
// pré-abertura — ver membrosInscritosPreAbertura) 🔒 · renovado (confirmou na
// renovação) 🔒 · sem_confirmacao (roster herdado · ÚNICO removível pela tela).
// Inscrito e renovado são somente leitura de propósito: é o que protege a
// evidência de quem acabou de entrar/renovar. A decisão é SEMPRE re-derivada
// no SERVIDOR (payload é do cliente).

// Temporada "atual" = a com inscrições abertas (maior ano/numero). Sem
// temporada aberta, a categoria 'inscrito' simplesmente não existe (a
// conferência continua funcionando fora de temporada — desenho original).
async function temporadaAtualInfo() {
  const { data } = await supabase.from('mem_temporadas')
    .select('id, label, data_inicio').eq('inscricoes_abertas', true)
    .order('ano', { ascending: false }).order('numero', { ascending: false }).limit(1);
  return (data && data[0]) || null;
}

// Vínculos que vieram da RENOVAÇÃO: a resposta de renovação registra o aceite
// em inscricao_consentimentos com ref_id = id do VÍNCULO (porta 'grupos') —
// só aquele fluxo usa vínculo como ref (pedido novo usa ref = pedido.id), então
// "tem consentimento apontando pro vínculo" = renovou. É a derivação-remendo
// documentada no handoff (o campo definitivo "confirmado pra temporada X" no
// vínculo segue como pendência estrutural).
async function vinculosRenovados(vincIds) {
  const renovados = new Set();
  for (let i = 0; i < vincIds.length; i += 150) {
    const { data, error } = await supabase.from('inscricao_consentimentos')
      .select('ref_id').eq('porta', 'grupos').in('ref_id', vincIds.slice(i, i + 150));
    if (error) throw error;
    (data || []).forEach(r => { if (r.ref_id) renovados.add(r.ref_id); });
  }
  return renovados;
}

// created_at (timestamptz ISO) >= data_inicio (date): comparação de string
// funciona porque ISO ordena lexicograficamente e o date é prefixo.
const vincNaTemporada = (createdAt, temporada) =>
  !!(temporada?.data_inicio && createdAt && String(createdAt) >= temporada.data_inicio);

// Piloto pré-abertura (Marcos · 05/08): pedido APROVADO pouco antes da
// abertura (piloto de 26-28/07 pra T2 que abriu 01/08) é confirmação tão real
// quanto a inscrição pós-abertura — sem isto a Nathália (pedido aprovado em
// 28/07, vínculo de 28/07) caía em "Sem confirmação" removível na tela do
// líder. Regra: vínculo criado na janela de 30 dias ANTES da data_inicio E
// com pedido 'aprovado' do MESMO membro no MESMO grupo ⇒ categoria 'inscrito'
// (travada). Exigir o pedido aprovado é o que separa confirmação real de
// vínculo antigo de import/gestão manual, que segue 'sem_confirmacao' — e o
// aprovarPedidoCore SEMPRE grava membro_id no claim, então a chave existe.
const PRE_ABERTURA_DIAS = 30;
function inicioJanelaPreAbertura(temporada) {
  if (!temporada?.data_inicio) return null;
  // Meio-dia UTC evita o dia escorregar na aritmética (data_inicio é DATE).
  const d = new Date(`${temporada.data_inicio}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  d.setUTCDate(d.getUTCDate() - PRE_ABERTURA_DIAS);
  return d.toISOString().slice(0, 10);
}
// vincs = linhas do roster ativo ({ membro_id, created_at }). Devolve o Set de
// membro_id cujo vínculo nasceu na janela pré-abertura E tem pedido aprovado.
async function membrosInscritosPreAbertura(grupoId, vincs, temporada) {
  const inscritos = new Set();
  const desde = inicioJanelaPreAbertura(temporada);
  if (!desde) return inscritos;
  const candidatos = [...new Set((vincs || [])
    .filter(v => v.membro_id && v.created_at
      && !vincNaTemporada(v.created_at, temporada)
      && String(v.created_at) >= desde)
    .map(v => v.membro_id))];
  for (let i = 0; i < candidatos.length; i += 150) {
    const { data, error } = await supabase.from('mem_grupo_pedidos')
      .select('membro_id').eq('grupo_id', grupoId).eq('status', 'aprovado')
      .is('deleted_at', null).in('membro_id', candidatos.slice(i, i + 150));
    if (error) throw error;
    (data || []).forEach(p => { if (p.membro_id) inscritos.add(p.membro_id); });
  }
  return inscritos;
}
const RANK_FUNCAO = { coordenador: 7, supervisor: 6, lider: 5, co_lider: 4, lider_treinamento: 3, frequentador: 2, visitante: 1 };
const rotuloFuncao = (f) => ({
  coordenador: 'Coordenador', supervisor: 'Supervisor', lider: 'Líder',
  co_lider: 'Co-líder', lider_treinamento: 'Em treinamento',
}[f] || null);

// Roster pra tela: vínculos ATIVOS (marcados = "faz parte") + os que ESTA
// conferência removeu (desmarcados · pra reedição). 1 linha por pessoa, com o
// papel de MAIOR nível entre os vínculos dela no grupo (multi-vínculo é real).
// Cada linha sai com `categoria` (lideranca/renovado/inscrito/sem_confirmacao)
// e `travado` (categoria ≠ sem_confirmacao ⇒ a tela não deixa desmarcar; o
// POST re-deriva e blinda de qualquer jeito).
async function rosterConferencia(conf) {
  const temporada = await temporadaAtualInfo();
  const linhas = new Map(); // membro_id → { id, nome, foto_url, marcado, funcao, papel, protegido, categoria, travado }
  const { data: ativos, error: eA } = await supabase.from('mem_grupo_membros')
    .select('id, membro_id, funcao, created_at, mem_membros!inner(id, nome, foto_url)')
    .eq('grupo_id', conf.grupo_id).is('saiu_em', null).is('deleted_at', null)
    .limit(1000);
  if (eA) throw eA;
  const renovadosVinc = await vinculosRenovados((ativos || []).map(v => v.id));
  const preAbertura = await membrosInscritosPreAbertura(conf.grupo_id, ativos || [], temporada);
  const renovadoMembro = new Set();
  const novoMembro = new Set();
  for (const v of (ativos || [])) {
    if (renovadosVinc.has(v.id)) renovadoMembro.add(v.membro_id);
    if (vincNaTemporada(v.created_at, temporada) || preAbertura.has(v.membro_id)) novoMembro.add(v.membro_id);
    const atual = linhas.get(v.membro_id);
    if (!atual) {
      linhas.set(v.membro_id, {
        id: v.mem_membros.id, nome: v.mem_membros.nome,
        foto_url: v.mem_membros.foto_url || null,
        // Aqui SEMPRE marcado (o oposto da renovação): quem está no roster
        // "faz parte" até o líder desmarcar.
        marcado: true,
        funcao: v.funcao || null,
        papel: rotuloFuncao(v.funcao),
        protegido: FUNCOES_PROTEGIDAS.has(v.funcao),
      });
    } else if ((RANK_FUNCAO[v.funcao] || 0) > (RANK_FUNCAO[atual.funcao] || 0)) {
      atual.funcao = v.funcao || null;
      atual.papel = rotuloFuncao(v.funcao);
      atual.protegido = atual.protegido || FUNCOES_PROTEGIDAS.has(v.funcao);
    }
  }
  const { data: removidos, error: eR } = await supabase.from('mem_grupo_membros')
    .select('membro_id, funcao, mem_membros!inner(id, nome, foto_url)')
    .eq('grupo_id', conf.grupo_id).eq('conferencia_id', conf.id)
    .not('saiu_em', 'is', null).is('deleted_at', null)
    .limit(1000);
  if (eR) throw eR;
  for (const v of (removidos || [])) {
    if (!linhas.has(v.membro_id)) {
      linhas.set(v.membro_id, {
        id: v.mem_membros.id, nome: v.mem_membros.nome,
        foto_url: v.mem_membros.foto_url || null, marcado: false,
        funcao: v.funcao || null, papel: rotuloFuncao(v.funcao),
        // Já saiu por ESTA conferência (antes da regra existir, ou por outra
        // função) — pode ser re-marcado, não trava a reedição.
        protegido: false,
      });
    }
  }
  for (const linha of linhas.values()) {
    // Prioridade: liderança > renovado > inscrito > sem confirmação. Quem esta
    // conferência já removeu só pode ter sido sem_confirmacao (as outras são
    // blindadas), então a classificação por membro segue valendo na reedição.
    linha.categoria = linha.protegido ? 'lideranca'
      : renovadoMembro.has(linha.id) ? 'renovado'
        : novoMembro.has(linha.id) ? 'inscrito'
          : 'sem_confirmacao';
    linha.travado = linha.categoria !== 'sem_confirmacao';
  }
  const membros = [...linhas.values()].sort((a, b) => (a.nome || '').localeCompare(b.nome || '', 'pt-BR'));
  return { membros, temporada };
}

// GET /api/public/grupos/grupo/confira?token=...
router.get('/grupo/confira', async (req, res) => {
  try {
    const ctx = await contextoConferencia(req.query.token);
    if (ctx.erro) return res.status(ctx.erro.status).json({ error: ctx.erro.msg });
    const { conf, grupo } = ctx;
    const { membros, temporada } = await rosterConferencia(conf);

    // Pedidos AGUARDANDO APROVAÇÃO do grupo: o líder pode devolvê-los pra
    // triagem por aqui (X). Marcado = "segue aguardando" (o ✓ NÃO aprova —
    // aprovação continua pelo link individual que o líder já recebeu).
    const { data: pendentes, error: ePen } = await supabase.from('mem_grupo_pedidos')
      .select('id, nome, created_at').eq('grupo_id', grupo.id)
      .eq('status', 'pendente').is('deleted_at', null)
      .order('created_at', { ascending: true }).limit(500);
    if (ePen) throw ePen;

    // Pedidos que ESTA conferência devolveu (reedição mostra read-only — a
    // devolução é one-way: a triagem pode já ter realocado). Best-effort.
    let pedidosDevolvidos = [];
    try {
      const { data: evs } = await supabase.from('mem_grupo_pedido_eventos')
        .select('pedido_id').eq('tipo', 'recusado_lider')
        .eq('detalhe->>conferencia_id', conf.id).limit(300);
      const ids = [...new Set((evs || []).map(e => e.pedido_id).filter(Boolean))];
      if (ids.length) {
        const { data: peds } = await supabase.from('mem_grupo_pedidos')
          .select('id, nome').in('id', ids).eq('status', 'devolvido').is('deleted_at', null);
        pedidosDevolvidos = (peds || []).map(p => ({ id: p.id, nome: p.nome }));
      }
    } catch (eDev) { console.warn('[public grupos confira get] devolvidos:', eDev.message); }

    res.json({
      grupo: { nome: grupo.nome },
      status: conf.status,                 // enviada | respondida
      ja_respondeu: conf.status !== 'enviada',
      observacao: conf.observacao || null,
      temporada: temporada?.label || null,
      membros,
      pedidos_pendentes: (pendentes || []).map(p => ({ id: p.id, nome: p.nome, criado_em: p.created_at })),
      pedidos_devolvidos: pedidosDevolvidos,
    });
  } catch (e) {
    if (schemaAusente(e)) {
      console.error('[public grupos confira get] migration pendente:', e.message);
      return res.status(503).json({ error: AVISO_SEM_MIGRATION });
    }
    console.error('[public grupos confira get]', e.message);
    res.status(500).json({ error: 'Erro ao carregar a lista do grupo.' });
  }
});

// POST /api/public/grupos/grupo/confira
// body { token, mantem: [membro_ids], exibidos: [membro_ids], observacao }
// O servidor SÓ age sobre `exibidos ∩ roster ativo atual`: quem entrou no
// grupo DEPOIS da tela aberta (pedido aprovado, visitante da chamada) nunca é
// removido por um submit atrasado. Última resposta vence (reedição).
router.post('/grupo/confira', async (req, res) => {
  try {
    const { token, observacao } = req.body || {};
    const ctx = await contextoConferencia(token);
    if (ctx.erro) return res.status(ctx.erro.status).json({ error: ctx.erro.msg });
    const { conf, grupo } = ctx;
    const agora = new Date().toISOString();
    const hoje = agora.slice(0, 10);

    const mantem = Array.isArray(req.body?.mantem) ? req.body.mantem : null;
    const exibidos = Array.isArray(req.body?.exibidos) ? req.body.exibidos : null;
    if (!mantem || !exibidos) {
      return res.status(400).json({ error: 'Lista de participantes inválida.' });
    }

    // Roster ativo ATUAL (vínculos linha a linha — pode haver mais de um por pessoa)
    const { data: ativos, error: eAt } = await supabase.from('mem_grupo_membros')
      .select('id, membro_id, funcao, created_at')
      .eq('grupo_id', grupo.id).is('saiu_em', null).is('deleted_at', null)
      .limit(1000);
    if (eAt) throw eAt;
    // Travas re-derivadas AQUI (payload é do cliente): liderança + renovados +
    // inscritos desta temporada NUNCA saem por este fluxo — são as 3 categorias
    // somente-leitura da tela (Marcos · 04/08).
    const renovadosVinc = await vinculosRenovados((ativos || []).map(v => v.id));
    const temporadaAtual = await temporadaAtualInfo();
    const preAbertura = await membrosInscritosPreAbertura(grupo.id, ativos || [], temporadaAtual);
    const ativosPorMembro = new Map();
    const travados = new Set(); // liderança/renovado/inscrito — nunca saem por aqui
    for (const v of (ativos || [])) {
      if (!ativosPorMembro.has(v.membro_id)) ativosPorMembro.set(v.membro_id, []);
      ativosPorMembro.get(v.membro_id).push(v.id);
      if (FUNCOES_PROTEGIDAS.has(v.funcao)
        || renovadosVinc.has(v.id)
        || vincNaTemporada(v.created_at, temporadaAtual)
        || preAbertura.has(v.membro_id)) travados.add(v.membro_id);
    }

    const setExibidos = new Set(exibidos);
    const setMantem = new Set(mantem.filter(id => setExibidos.has(id)));
    // A tela já bloqueia desmarcar as categorias travadas, mas a decisão é do
    // SERVIDOR: travado exibido conta SEMPRE como mantido.
    for (const membroId of travados) {
      if (setExibidos.has(membroId)) setMantem.add(membroId);
    }
    const obsLimpa = String(observacao || '').trim().slice(0, 2000) || null;
    // Rótulo humano em motivo_saida (texto livre exibido na UI). A observação
    // do lote entra aqui quando existe — é o contexto que a Naná vai ler.
    const rotuloSaida = obsLimpa
      ? `Removido pelo líder na conferência da lista: ${obsLimpa.slice(0, 160)}`
      : 'Removido pelo líder na conferência da lista do grupo';

    // 1) Remover: exibido + ativo agora + NÃO marcado → fecha TODOS os vínculos
    //    ativos da pessoa neste grupo (soft · conferencia_id = reversível aqui).
    const removerVincIds = [];
    const removidosMembroIds = [];
    for (const [membroId, vincIds] of ativosPorMembro) {
      if (!setExibidos.has(membroId)) continue; // entrou depois da tela — intocado
      if (setMantem.has(membroId)) continue;    // (liderança já entrou aqui acima)
      removerVincIds.push(...vincIds);
      removidosMembroIds.push(membroId);
    }
    if (removerVincIds.length) {
      for (let i = 0; i < removerVincIds.length; i += 150) {
        // ⚠️ `.is('saiu_em', null)` fecha a corrida com a coordenação: se a Naná
        // fechou o vínculo entre a leitura e este UPDATE, sobrescrever o
        // motivo/data dela faria a saída MANUAL virar reversível pela reedição
        // do líder (o conferencia_id passaria a apontar pra cá).
        const { error } = await supabase.from('mem_grupo_membros')
          .update({ saiu_em: hoje, motivo_saida: rotuloSaida, conferencia_id: conf.id })
          .in('id', removerVincIds.slice(i, i + 150))
          .is('saiu_em', null);
        if (error) throw error;
      }
    }

    // 2) Reativar: pessoa re-marcada cujo vínculo FOI fechado por ESTA
    //    conferência (reedição corrigindo). Só se não houver outro vínculo ativo
    //    dela no grupo (a Naná pode ter recriado manualmente — nunca duplicar).
    const { data: fechadosPorNos, error: eF } = await supabase.from('mem_grupo_membros')
      .select('id, membro_id')
      .eq('grupo_id', grupo.id).eq('conferencia_id', conf.id)
      .not('saiu_em', 'is', null).is('deleted_at', null)
      .limit(1000);
    if (eF) throw eF;
    const reativarIds = [];
    const reativadosMembroIds = new Set();
    for (const v of (fechadosPorNos || [])) {
      if (!setMantem.has(v.membro_id)) continue;
      if (ativosPorMembro.has(v.membro_id)) continue;      // já ativo por outra via
      if (reativadosMembroIds.has(v.membro_id)) continue;  // 1 vínculo por pessoa basta
      reativarIds.push(v.id);
      reativadosMembroIds.add(v.membro_id);
    }
    if (reativarIds.length) {
      for (let i = 0; i < reativarIds.length; i += 150) {
        const { error } = await supabase.from('mem_grupo_membros')
          .update({ saiu_em: null, motivo_saida: null, conferencia_id: null })
          .in('id', reativarIds.slice(i, i + 150));
        if (error) throw error;
      }
    }

    // 2b) Pedidos AGUARDANDO APROVAÇÃO que o líder devolveu (X na tela): voltam
    //     pra TRIAGEM (status 'devolvido' · lei de 14/07 — recusa de líder nunca
    //     é final). Guardas: só pedido do PRÓPRIO grupo, ainda pendente e
    //     exibido na tela (payload é do cliente). A devolução é one-way por
    //     aqui — reedição NÃO re-pendentifica (a triagem pode já ter agido).
    const pedExibidos = Array.isArray(req.body?.pedidos_exibidos) ? req.body.pedidos_exibidos : [];
    const pedDevolver = Array.isArray(req.body?.pedidos_devolver) ? req.body.pedidos_devolver : [];
    let pedidosDevolvidos = [];
    if (pedDevolver.length) {
      const setPedExib = new Set(pedExibidos);
      const alvo = [...new Set(pedDevolver.filter(id => setPedExib.has(id)))].slice(0, 500);
      if (alvo.length) {
        const quemDevolveu = `${conf.lider_nome || 'Líder'} (confira a lista)`;
        const { data: claimed, error: eDev } = await supabase.from('mem_grupo_pedidos')
          .update({
            status: 'devolvido',
            motivo_rejeicao: 'Devolvido pelo líder na conferência da lista do grupo',
            decidido_por: null,
            decidido_por_nome: quemDevolveu,
            decidido_em: agora,
          })
          .in('id', alvo).eq('grupo_id', grupo.id)
          .eq('status', 'pendente').is('deleted_at', null)
          .select('id, nome');
        if (eDev) throw eDev;
        pedidosDevolvidos = claimed || [];
        // Linha do tempo por pedido (nunca lança) — awaited: serverless
        // descarta trabalho pendente depois do res.json.
        await Promise.all(pedidosDevolvidos.map(p => registrarEventoPedido(
          p.id, 'recusado_lider',
          { origem: 'confira_lista', conferencia_id: conf.id }, quemDevolveu)));
      }
    }

    // 3) Resumo na linha (cache de exibição — a fonte auditável é o audit log de
    //    mem_grupo_membros + conferencia_id). Contadores refletem o estado APÓS
    //    a operação (reedição inclui quem já estava fora e continuou fora).
    const mantidosFinal = [...setMantem];
    const seguemFora = (fechadosPorNos || []).filter(v => !setMantem.has(v.membro_id));
    const foraAgoraIds = [...removerVincIds, ...seguemFora.map(v => v.id)];
    const foraAgoraMembros = new Set([...removidosMembroIds, ...seguemFora.map(v => v.membro_id)]);
    const { error: eUp } = await supabase.from('mem_grupo_conferencias')
      .update({
        status: 'respondida',
        observacao: obsLimpa,
        roster_total: setExibidos.size,
        mantidos_count: mantidosFinal.length,
        removidos_count: foraAgoraMembros.size,
        mantidos_ids: mantidosFinal,
        removidos_vinculo_ids: [...new Set(foraAgoraIds)],
        primeira_resposta_em: conf.primeira_resposta_em || agora,
        ultima_resposta_em: agora, updated_at: agora,
      }).eq('id', conf.id);
    if (eUp) throw eUp;

    // A pessoa removida NÃO é notificada (decisão pastoral vigente na
    // renovação) e o pedido devolvido também não avisa a pessoa. A COORDENAÇÃO
    // é — o roster mudou / tem pedido pra realocar e ela precisa saber.
    if (foraAgoraMembros.size > 0 || pedidosDevolvidos.length > 0) {
      try {
        await notificar({
          modulo: 'grupos',
          tipo: 'confira_lista_respondida',
          titulo: `Lista conferida: ${grupo.nome}`,
          mensagem: `O líder do grupo ${grupo.nome} conferiu a lista: ${mantidosFinal.length} continua(m) e ${foraAgoraMembros.size} saiu(ram).`
            + (pedidosDevolvidos.length ? ` ${pedidosDevolvidos.length} pedido(s) aguardando aprovação devolvido(s) pra triagem — sugira outro grupo ou rejeite de vez.` : '')
            + (obsLimpa ? ` Observação: ${obsLimpa.slice(0, 200)}` : ''),
          link: pedidosDevolvidos.length ? '/grupos?tab=entrada' : '/grupos?tab=envios',
          severidade: 'info',
          chaveDedup: `confira_lista_${conf.id}_${hoje}`,
        });
      } catch (eN) { console.error('[confira lista notificar]', eN.message); }
    }

    res.json({
      ok: true, status: 'respondida',
      mantidos: mantidosFinal.length,
      removidos: foraAgoraMembros.size,
      reativados: reativarIds.length,
      pedidos_devolvidos: pedidosDevolvidos.length,
    });
  } catch (e) {
    if (schemaAusente(e)) {
      console.error('[public grupos confira post] migration pendente:', e.message);
      return res.status(503).json({ error: AVISO_SEM_MIGRATION });
    }
    console.error('[public grupos confira post]', e.message);
    res.status(500).json({ error: 'Erro ao salvar a resposta.' });
  }
});

// GET /api/public/grupos/cron/frequencia-mensal — Vercel Cron (dia 28)
// ENFILEIRA o template pra cada líder de grupo ativo com roster (a fila
// horária cron/whatsapp-fila entrega com retry/backoff). Gated por
// CRON_SECRET (fail-closed), pelo WHATSAPP_ENABLED (sem ele, nada é
// enfileirado) e pela TEMPORADA: só envia se existe temporada ativa EM CURSO
// (data_inicio <= hoje <= data_fim) — decisão do Marcos (2026-07-20): esta
// mensagem mensal é a ÚNICA automática pro líder, e só com temporada rodando.
// ⚠️ Sem idempotência por mês DE PROPÓSITO: re-executar manualmente reenfileira
// o template a todos os líderes (~1 conversa paga por líder) — use com
// intenção (ex.: reenvio deliberado no fim do mês pra quem não respondeu).
router.get('/cron/frequencia-mensal', requireCron, async (req, res) => {
  try {
    // ⚠️ BARREIRA (Marcos 2026-07-23): kill-switch central dos envios
    // automáticos. DESLIGADO por padrão — nenhum disparo automático sai até a
    // coordenação ligar na aba Envios. Envio manual não passa por aqui.
    if (!(await enviosAutomaticosAtivos())) {
      console.log('[grupos frequencia cron] envios automáticos DESLIGADOS — nada enviado');
      return res.json({ ok: true, enviados: 0, motivo: 'envios_automaticos_desligados' });
    }
    // 2º interruptor: o central da aba Comunicação→Disparos (Marcos 14/08)
    if (await require('../services/comunicacaoDisparosOff').disparoDesligado('grupos_frequencia')) {
      return res.json({ ok: true, enviados: 0, motivo: 'desligado_na_comunicacao' });
    }
    const hoje = new Date().toISOString().slice(0, 10);
    const { data: temporadaEmCurso } = await supabase
      .from('mem_temporadas')
      .select('id, data_inicio, data_fim')
      .eq('ativa', true)
      .lte('data_inicio', hoje)
      .gte('data_fim', hoje)
      .limit(1)
      .maybeSingle();
    if (!temporadaEmCurso) {
      console.log('[grupos frequencia cron] sem temporada ativa em curso — nada enviado');
      return res.json({ ok: true, enviados: 0, motivo: 'sem_temporada_em_curso' });
    }
    const mes = new Date().toISOString().slice(0, 7); // mês corrente
    const { data: grupos } = await supabase.from('mem_grupos')
      .select('id, nome, lider_id')
      .eq('ativo', true).not('lider_id', 'is', null).is('deleted_at', null)
      .limit(1000);

    // Leituras em LOTE (antes era 2 queries POR grupo) e envio via FILA em vez
    // de loop síncrono de Meta API — o cron fecha em segundos e a fila horária
    // (cron/whatsapp-fila) drena com o backoff/cap habituais.
    const comRoster = new Set();
    for (let offset = 0; ; offset += 1000) {
      const { data: pagina, error: eR } = await supabase.from('mem_grupo_membros')
        .select('grupo_id')
        .is('saiu_em', null).is('deleted_at', null)
        .order('id').range(offset, offset + 999);
      if (eR) throw eR;
      (pagina || []).forEach(p => comRoster.add(p.grupo_id));
      if (!pagina || pagina.length < 1000) break;
    }

    const liderIds = [...new Set((grupos || [])
      .filter(g => comRoster.has(g.id))
      .map(g => g.lider_id).filter(Boolean))];
    const lideres = new Map();
    for (let i = 0; i < liderIds.length; i += 200) { // .in() em lotes ≤200 (URL)
      const { data: pagina, error: eL } = await supabase.from('mem_membros')
        .select('id, nome, telefone')
        .in('id', liderIds.slice(i, i + 200)).is('deleted_at', null);
      if (eL) throw eL;
      (pagina || []).forEach(l => lideres.set(l.id, l));
    }

    const envios = [];
    const pulados = [];
    for (const g of (grupos || [])) {
      // Sem gente no roster não há chamada a fazer
      if (!comRoster.has(g.id)) { pulados.push({ grupo: g.nome, motivo: 'sem_roster' }); continue; }
      const m = montarEnvioFrequencia({ grupo: g, lider: lideres.get(g.lider_id), mes });
      if (m.erro) { pulados.push({ grupo: g.nome, motivo: m.erro }); continue; }
      envios.push(m.envio);
    }
    const lote = await enfileirarLote(envios);
    console.log(`[grupos frequencia cron] mês ${mes}: ${lote.queued} na fila · ${pulados.length} pulados`);
    res.json({ ok: true, mes, enfileirados: lote.queued, pulados: pulados.length });
  } catch (e) {
    console.error('[public grupos frequencia cron]', e.message);
    res.status(500).json({ error: 'Erro no envio mensal.' });
  }
});

// GET|POST /api/public/grupos/cron/whatsapp-fila — reprocessa a fila de envios
// de template (reenvio com backoff · absorve o teto diário da Meta). Vercel
// Cron horário; gated por CRON_SECRET (fail-closed).
async function cronWhatsappFila(req, res) {
  try {
    const r = await processarFila();
    console.log('[whatsapp-fila cron]', JSON.stringify(r));
    res.json({ ok: true, ...r });
  } catch (e) {
    console.error('[whatsapp-fila cron]', e.message);
    res.status(500).json({ error: e.message });
  }
}
router.get('/cron/whatsapp-fila', requireCron, cronWhatsappFila);
router.post('/cron/whatsapp-fila', requireCron, cronWhatsappFila);

module.exports = router;
