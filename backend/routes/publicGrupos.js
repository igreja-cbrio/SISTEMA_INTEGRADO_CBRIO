// Endpoints públicos (sem auth) para o formulário de cadastro / inscrição
// poder buscar grupos. Read-only — sem mutation aqui.
const router = require('express').Router();
const rateLimit = require('express-rate-limit');
const multer = require('multer');
const { supabase } = require('../utils/supabase');
const { uploadModuleFile, SHAREPOINT_CONFIGURED } = require('../services/storageService');
const {
  normalizarCpf, normalizarTelefone, normalizarEmail, nomesMesmaPessoa,
  acharMembroGuardado,
} = require('../services/membroMatch');
const {
  verificarToken, notificarLiderNovoPedido, formatarQuando, formatarOnde,
  notificarLiderFrequencia, rotuloMes, enviarInscricaoConfirmada,
} = require('../services/gruposWhatsapp');
const { processarFila } = require('../services/whatsappFila');
const { registrarEventoPedido } = require('../services/grupoPedidoEventos');
const { requireCron } = require('../utils/cronAuth');

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
  max: parseInt(process.env.GRUPOS_PUBLIC_RATE_LIMIT_MAX) || (process.env.NODE_ENV === 'production' ? 1000 : 5000),
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

// GET /api/public/grupos/temporadas
router.get('/temporadas', async (req, res) => {
  try {
    const { data } = await supabase.from('mem_temporadas').select('id, label, ano, numero, ativa, inscricoes_abertas').order('ano', { ascending: false }).order('numero', { ascending: false });
    res.json(data || []);
  } catch { res.status(500).json({ error: 'Erro' }); }
});

// GET /api/public/grupos/buscar
router.get('/buscar', async (req, res) => {
  try {
    const { lider_nome, categoria, bairro, cep, raio_km, temporada, q } = req.query;

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
    const { data: temporadasAll } = await supabase.from('mem_temporadas').select('id, inscricoes_abertas');
    const abertas = new Set((temporadasAll || []).filter(t => t.inscricoes_abertas).map(t => t.id));
    const grupos = (gruposCrus || []).filter(g =>
      g.modo_inscricao === 'sempre_aberto'
      || (g.modo_inscricao !== 'fechado' && (!g.temporada || abertas.has(g.temporada))));

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
        .select('grupo_id, mem_membros!inner(nome)')
        .in('grupo_id', gIds.slice(i, i + 200))
        .in('funcao', ['lider', 'co_lider'])
        .is('saiu_em', null).is('deleted_at', null);
      (rl || []).forEach(v => {
        if (!v.mem_membros?.nome) return;
        (rosterLideres[v.grupo_id] = rosterLideres[v.grupo_id] || []).push(v.mem_membros.nome);
      });
    }

    let resultado = (grupos || []).map(g => {
      const principal = lideresMap[g.lider_id]?.nome || null;
      const lideresNomes = [...new Set([principal, ...(rosterLideres[g.id] || [])].filter(Boolean))];
      return {
        ...g,
        lider_nome: principal,
        lider_foto: lideresMap[g.lider_id]?.foto_url || null,
        lideres_nomes: lideresNomes,
      };
    });

    if (lider_nome) {
      const term = String(lider_nome).toLowerCase();
      resultado = resultado.filter(g => (g.lideres_nomes || []).some(n => n.toLowerCase().includes(term)));
    }
    if (q) {
      const term = String(q).toLowerCase();
      resultado = resultado.filter(g =>
        g.nome?.toLowerCase().includes(term)
        || (g.lideres_nomes || []).some(n => n.toLowerCase().includes(term))
        || g.bairro?.toLowerCase().includes(term)
        || g.local?.toLowerCase().includes(term)
        || g.codigo?.toLowerCase().includes(term)
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
    const term = String(q || '').trim().toLowerCase();
    if (term.length < 2) return res.json([]);

    let query = supabase.from('mem_grupos').select('lider_id').eq('ativo', true).is('deleted_at', null).not('lider_id', 'is', null);
    if (temporada) query = query.eq('temporada', temporada);
    const { data: grupos } = await query;
    const liderIds = [...new Set((grupos || []).map(g => g.lider_id))];
    if (!liderIds.length) return res.json([]);

    const { data: lideres } = await supabase
      .from('mem_membros')
      .select('id, nome, foto_url')
      .in('id', liderIds)
      .ilike('nome', `%${term}%`)
      .order('nome')
      .limit(20);

    res.json(lideres || []);
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
    res.json({ ...grupo, lider_nome, lider_foto });
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

function soDigitos(v) { return (v || '').toString().replace(/\D+/g, ''); }
function cpfValido(cpfMasked) {
  const cpf = soDigitos(cpfMasked);
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  let s = 0;
  for (let i = 0; i < 9; i++) s += parseInt(cpf[i]) * (10 - i);
  let r = (s * 10) % 11;
  if (r === 10) r = 0;
  if (r !== parseInt(cpf[9])) return false;
  s = 0;
  for (let i = 0; i < 10; i++) s += parseInt(cpf[i]) * (11 - i);
  r = (s * 10) % 11;
  if (r === 10) r = 0;
  return r === parseInt(cpf[10]);
}
function ehEmailValido(e) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e || ''); }

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
async function checarDuplicataInscricao(grupoId, inc) {
  // 1) roster ativo do grupo (com dados do membro pra comparar por chave)
  const links = await fetchAllRange('mem_grupo_membros', 'membro_id',
    [['eq', 'grupo_id', grupoId], ['is', 'saiu_em', null], ['is', 'deleted_at', null]]);
  const ids = [...new Set(links.map(l => l.membro_id).filter(Boolean))];
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
    } = req.body || {};

    if (website && String(website).trim() !== '') return res.status(201).json({ ok: true });

    // Cada erro devolve `campo` pro form pintar o campo certo de vermelho
    // (feedback do teste 2026-07-13: "todo erro deve dizer claramente onde está").
    if (!grupo_id) return res.status(400).json({ error: 'Grupo obrigatório.' });
    if (!nome || nome.trim().length < 3) return res.status(400).json({ error: 'Digite o nome completo.', campo: 'nome' });
    if (!telefone || soDigitos(telefone).length < 10) return res.status(400).json({ error: 'Digite um celular válido com DDD.', campo: 'telefone' });
    // CPF OBRIGATÓRIO (Marcos · 2026-07-13, feedback do teste) — além de
    // identificar a pessoa, é a chave forte do dedup/vínculo com o membro.
    if (!cpf || soDigitos(cpf).length !== 11) return res.status(400).json({ error: 'Informe o CPF completo.', campo: 'cpf' });
    if (!cpfValido(cpf)) return res.status(400).json({ error: 'Este CPF não é válido — confira os números.', campo: 'cpf' });
    if (email && !ehEmailValido(email)) return res.status(400).json({ error: 'E-mail inválido.', campo: 'email' });
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
    const emailLimpo = email ? email.trim().toLowerCase() : null;
    const fotoUrl = fotoUrlValida(foto_url) ? String(foto_url).slice(0, 1000) : null;

    // Verifica se grupo existe e esta ativo
    const { data: grupo } = await supabase.from('mem_grupos')
      .select('id, nome, ativo, aceitando_inscricoes, modo_inscricao, status_temporada, temporada, lider_id, categoria, idade_min, idade_max').eq('id', grupo_id).is('deleted_at', null).single();
    if (!grupo || !grupo.ativo) {
      return res.status(404).json({ error: 'Grupo não encontrado ou inativo.' });
    }
    // Grupo por convite do líder (Marcos · 15/07): nunca aceita inscrição
    // pública — não aparece no form, e um deep-link antigo cai aqui.
    if (grupo.modo_inscricao === 'fechado') {
      return res.status(403).json({
        error: 'Este grupo é por convite do líder — fale com ele para participar.',
        codigo: 'inscricoes_fechadas',
      });
    }
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

    const incoming = { nome: nome.trim(), cpf: cpfLimpo, telefone, email: emailLimpo };

    // Roteia pro membro já existente. Quando a pessoa afirmou "não sou eu"
    // (confirmar_novo), liga SÓ por CPF (sinal individual) — e-mail/telefone/
    // nome são deniáveis e a família os compartilha.
    const achado = await acharMembroGuardado(
      { cpf: cpfLimpo, email: emailLimpo, telefone, nome: nome.trim(), dataNascimento: data_nascimento || null },
      { soChaveForte: !!confirmar_novo },
    );
    let membroId = achado?.membro_id || null;

    // Resposta amigável de "já existe" — usada no sou_eu e quando o CPF já tem
    // participação/pedido, pra o modal "é você?" sempre ter uma saída (sem loop).
    // Reinscrição de quem JÁ está no grupo = RENOVAÇÃO (Marcos: na virada de
    // temporada todo mundo pode se reinscrever no próprio grupo — não é trava,
    // é confirmação de permanência).
    const jaExiste = (tipo) => tipo === 'membro_ativo'
      ? res.json({ ok: true, ja_membro: true, renovado: true, mensagem: 'Renovamos a sua inscrição no grupo para esta temporada. Nos vemos no encontro!' })
      : res.json({ ok: true, ja_pedido: true, mensagem: 'Seu pedido já está registrado — o líder vai te chamar em breve.' });

    // Anti-duplicata. Duas fontes complementares:
    //  (a) DIRETA por membro resolvido — casa exatamente com o índice único
    //      (grupo,membro) do pedido e com o roster, cobrindo os matches que o
    //      acharMembroGuardado faz por chave que o scan fuzzy não pontua (e-mail
    //      sozinho, nascimento+nome). É o que evita o 409 no INSERT (loop do modal).
    //  (b) FUZZY (nome/telefone/e-mail ≥2, ou CPF) contra roster+pedidos do grupo
    //      — pega reenvio de NÃO-membro / match fraco. Pulada no confirmar_novo.
    let dup = null;
    if (membroId) {
      const { data: ativo } = await supabase.from('mem_grupo_membros')
        .select('id').eq('grupo_id', grupo_id).eq('membro_id', membroId).is('saiu_em', null).is('deleted_at', null).limit(1);
      if (ativo && ativo.length) dup = { tipo: 'membro_ativo' };
      else {
        const { data: ped } = await supabase.from('mem_grupo_pedidos')
          .select('id').eq('grupo_id', grupo_id).eq('membro_id', membroId).eq('status', 'pendente').is('deleted_at', null).limit(1);
        if (ped && ped.length) dup = { tipo: 'pedido_pendente' };
      }
    }
    if (!dup && !confirmar_novo) {
      dup = await checarDuplicataInscricao(grupo_id, incoming);
    }

    if (dup) {
      // Match FORTE (membro resolvido pelo matcher) já ATIVO neste grupo =
      // reinscrição no próprio grupo → renovação direta, sem modal.
      if (dup.tipo === 'membro_ativo' && membroId) return jaExiste('membro_ativo');
      // "Sim, sou eu" OU um CPF que já tem participação/pedido → não duplica.
      // (Sob confirmar_novo só se chega aqui pelo check direto por CPF: mesmo
      // "não sou eu" não cria 2 pedidos do MESMO CPF no mesmo grupo.)
      if (sou_eu === true || confirmar_novo === true) return jaExiste(dup.tipo);
      return res.status(409).json({
        codigo: 'possivel_duplicado',
        onde: dup.tipo,
        error: dup.tipo === 'membro_ativo'
          ? 'Parece que você já participa deste grupo.'
          : 'Já recebemos um pedido parecido para este grupo.',
      });
    }

    // Já é membro: aproveita foto, sexo e data de nascimento declarados quando
    // o cadastro ainda não os tem (enriquecimento só-onde-vazio — nunca
    // sobrescreve o que existe). O nascimento agora é obrigatório no form
    // justamente pra povoar a base.
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

    // Opt-in de WhatsApp: se consentiu e já casou com um membro, grava direto
    // (só liga). Sem membro, o consentimento vai no cadastro pendente abaixo e
    // é propagado na aprovação.
    if (whatsapp_optin && membroId) {
      try {
        await supabase.from('mem_membros')
          .update({ whatsapp_optin: true, whatsapp_optin_em: new Date().toISOString() })
          .eq('id', membroId).is('deleted_at', null);
      } catch (e) {
        console.warn('[public grupos inscrever] optin membro:', e.message);
      }
    }

    let cadastroPendenteId = null;
    if (!membroId) {
      // Cria cadastro pendente
      const ip = (req.headers['x-forwarded-for'] || '').toString().split(',')[0].trim() || req.ip || null;
      const userAgent = (req.headers['user-agent'] || '').toString().slice(0, 500);
      const { data: cad, error: eCad } = await supabase.from('mem_cadastros_pendentes').insert({
        nome: nome.trim(),
        cpf: cpfLimpo,
        email: emailLimpo,
        telefone: telefone || null,
        data_nascimento: data_nascimento || null,
        genero: generoLimpo,
        foto_url: fotoUrl,
        origem: 'qr_code',
        aceita_termos: !!aceita_termos,
        aceita_contato: true,
        whatsapp_optin: !!whatsapp_optin,
        whatsapp_optin_em: whatsapp_optin ? new Date().toISOString() : null,
        consentimento_texto: consentimento_texto ? String(consentimento_texto).slice(0, 2000) : null,
        status: 'pendente',
        ip_origem: ip,
        user_agent: userAgent,
        // "não sou eu" persiste: a aprovação só pode religar este cadastro por
        // CPF (soChaveForte) — nunca por e-mail/telefone de família.
        nao_vincular_fraco: confirmar_novo === true,
      }).select('id').single();
      if (eCad) {
        console.error('[public grupos inscrever] cadastro pendente:', eCad.message);
        return res.status(500).json({ error: 'Erro ao registrar cadastro.' });
      }
      cadastroPendenteId = cad.id;
    }

    // Cria pedido pendente. Quando a pessoa afirmou "não sou eu" no dedup, o
    // pedido chega marcado pra triagem humana (a caixa de entrada mostra o
    // aviso — são os casos em que a duplicata é difícil de resolver sozinho).
    const obsPartes = [];
    if (confirmar_novo === true) obsPartes.push('[Verificar identidade] A pessoa confirmou que NÃO é o cadastro parecido já existente.');
    if (observacao) obsPartes.push(String(observacao).trim().slice(0, 400));
    const pedidoBase = {
      grupo_id,
      nome: nome.trim(),
      email: emailLimpo,
      telefone: telefone || null,
      origem: 'formulario_publico',
      observacao: obsPartes.length ? obsPartes.join(' · ').slice(0, 500) : null,
      status: 'pendente',
    };
    if (membroId) pedidoBase.membro_id = membroId;
    else pedidoBase.cadastro_pendente_id = cadastroPendenteId;

    const { data: pedido, error: ePed } = await supabase.from('mem_grupo_pedidos').insert(pedidoBase).select('id').single();
    if (ePed) {
      // 23505 = corrida: um pedido do mesmo membro neste grupo surgiu entre o
      // check direto e o INSERT. Já existe → responde amigável (não reabre o
      // "é você?", que ficaria em loop se devolvêssemos 409 aqui).
      if (ePed.code === '23505') return jaExiste('pedido_pendente');
      console.error('[public grupos inscrever] pedido:', ePed.message);
      return res.status(500).json({ error: 'Erro ao registrar pedido.' });
    }

    // Linha do tempo do pedido (histórico da caixa de entrada)
    registrarEventoPedido(pedido.id, 'criado', { grupo: grupo.nome, origem: 'formulario_publico' });

    // Notifica líder do grupo (se tiver login) + admins via fallback
    (async () => {
      try {
        let liderAuthUserId = null;
        if (grupo.lider_id) {
          const { data: liderProf } = await supabase.from('vol_profiles')
            .select('auth_user_id').eq('membresia_id', grupo.lider_id).maybeSingle();
          liderAuthUserId = liderProf?.auth_user_id || null;
        }
        await notificar({
          modulo: 'grupos',
          tipo: 'pedido_grupo',
          titulo: `Novo pedido para ${grupo.nome}`,
          mensagem: `${nome.trim()} pediu para entrar no grupo via QR code.`,
          link: '/grupos',
          severidade: 'aviso',
          chaveDedup: `pedido_grupo_${pedido.id}`,
          extraTargetIds: liderAuthUserId ? [liderAuthUserId] : [],
        });

        // F3 · WhatsApp pro líder com o link de aprovar sem login.
        // Gated por WHATSAPP_ENABLED no whatsappService (sem env → dry-run).
        await notificarLiderNovoPedido({
          grupo,
          pedidoId: pedido.id,
          pessoa: { nome: nome.trim(), telefone: telefone || null, email: emailLimpo },
        });

        // Mensagem 1 pra PESSOA: «recebemos sua inscrição» (utility
        // cbrio_inscricao_confirmada — a tela de sucesso do form já promete
        // a confirmação no WhatsApp). Via fila: registra e reenvia sozinho
        // se o envio bater no teto diário da Meta.
        await enviarInscricaoConfirmada({
          telefone,
          nome: nome.trim(),
          grupoNome: grupo.nome,
          pedidoId: pedido.id,
        });
      } catch (err) { console.error('[public grupos inscrever notify]', err.message); }
    })();

    res.status(201).json({ ok: true, pedido_id: pedido.id });
  } catch (e) {
    console.error('[public grupos inscrever]', e.message);
    res.status(500).json({ error: 'Erro ao processar inscrição.' });
  }
});

// ─────────────────────────────────────────────────────────────
// F3 · aprovação pelo líder via link do WhatsApp (sem login).
// Token HMAC assinado (services/gruposWhatsapp) dá acesso a UM pedido e
// expira em 7 dias. Fail-closed: sem CRON_SECRET nenhum token valida.
// Rota com 2 segmentos de propósito — o GET /:id (acima) captura qualquer
// caminho de 1 segmento.
// ─────────────────────────────────────────────────────────────

// GET /api/public/grupos/pedido/por-token?token=...
// Dados que o líder vê na página de aprovação (o token É a credencial).
router.get('/pedido/por-token', async (req, res) => {
  try {
    const payload = verificarToken(req.query.token, 'aprov');
    if (!payload) return res.status(401).json({ error: 'Link inválido ou expirado. Você ainda pode aprovar pelo sistema em /grupos.' });

    const { data: pedido, error: ePed } = await supabase.from('mem_grupo_pedidos')
      .select('id, nome, telefone, email, observacao, status, created_at, motivo_rejeicao, grupo_id, mem_grupos(id, nome, codigo, bairro, dia_semana, horario, local, endereco, complemento, capacidade, lider_id)')
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

    res.json({
      pedido: {
        id: pedido.id, nome: pedido.nome, telefone: pedido.telefone, email: pedido.email,
        observacao: pedido.observacao, status: pedido.status, created_at: pedido.created_at,
        motivo_rejeicao: pedido.motivo_rejeicao,
      },
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
    const payload = verificarToken(token, 'aprov');
    if (!payload) return res.status(401).json({ error: 'Link inválido ou expirado. Você ainda pode decidir pelo sistema em /grupos.' });
    if (!['aprovar', 'rejeitar'].includes(acao)) return res.status(400).json({ error: 'Ação inválida.' });

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

    if (acao === 'aprovar') {
      // Mesmo núcleo da aprovação autenticada (promoção de cadastro pendente,
      // matcher anti-duplicata, vínculo idempotente, notificações e WhatsApp).
      const { aprovarPedidoCore } = require('./grupos');
      const r = await aprovarPedidoCore(pedido.id, { userId: null, name: decididoPorNome });
      if (!r.ok) return res.status(r.code).json({ error: r.error });
      return res.json({ ok: true, acao: 'aprovado' });
    }

    // Recusa do LÍDER não é terminal (Marcos · 14/07): o pedido volta pra
    // TRIAGEM (Naná/Nélio · status 'devolvido') — a equipe, que está acima do
    // líder, sugere outro grupo pra pessoa ou rejeita de vez. A pessoa NÃO é
    // comunicada aqui e o motivo do líder fica interno.
    // Guarda de corrida: só devolve se AINDA está pendente.
    const motivoInterno = motivo ? String(motivo).trim().slice(0, 500) : null;
    const { data: claimed } = await supabase.from('mem_grupo_pedidos').update({
      status: 'devolvido',
      motivo_rejeicao: motivoInterno,
      decidido_por: null,
      decidido_por_nome: decididoPorNome,
      decidido_em: new Date().toISOString(),
    }).eq('id', pedido.id).eq('status', 'pendente').select('id');
    if (!claimed || !claimed.length) {
      return res.status(409).json({ error: 'Este pedido já foi decidido.', status: 'decidido' });
    }

    registrarEventoPedido(pedido.id, 'recusado_lider', { motivo_interno: motivoInterno }, decididoPorNome);

    // Avisa a TRIAGEM (módulo grupos) — mesma notificação da recusa autenticada.
    (async () => {
      try {
        await notificar({
          modulo: 'grupos',
          tipo: 'pedido_devolvido',
          titulo: `Pedido devolvido pra triagem: ${pedido.nome}`,
          mensagem: `O líder de ${grupo?.nome || 'um grupo'} recusou o pedido${motivoInterno ? ` (motivo interno: ${motivoInterno.slice(0, 200)})` : ''}. Sugira outro grupo pra pessoa ou rejeite de vez.`,
          link: '/grupos?tab=entrada',
          severidade: 'aviso',
          chaveDedup: `pedido_devolvido_${pedido.id}`,
        });
      } catch (err) { console.error('[public grupos recusar notify]', err.message); }
    })();

    res.json({ ok: true, acao: 'rejeitado' });
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
      .select('id, nome, codigo, bairro, dia_semana, horario, local, endereco, complemento, capacidade, ativo, aceitando_inscricoes')
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

// GET /api/public/grupos/cron/frequencia-mensal — Vercel Cron (dia 28) manda
// o template a cada líder de grupo ativo com roster. Gated por CRON_SECRET
// (fail-closed) e pelo WHATSAPP_ENABLED (sem ele, nada é enviado).
// ⚠️ Sem idempotência por mês DE PROPÓSITO: re-executar manualmente reenvia
// o template a todos os líderes (~1 conversa paga por líder) — use com
// intenção (ex.: reenvio deliberado no fim do mês pra quem não respondeu).
router.get('/cron/frequencia-mensal', requireCron, async (req, res) => {
  try {
    const mes = new Date().toISOString().slice(0, 7); // mês corrente
    const { data: grupos } = await supabase.from('mem_grupos')
      .select('id, nome, lider_id')
      .eq('ativo', true).not('lider_id', 'is', null).is('deleted_at', null)
      .limit(1000);

    let enviados = 0;
    const pulados = [];
    for (const g of (grupos || [])) {
      // Sem gente no roster não há chamada a fazer
      const { count } = await supabase.from('mem_grupo_membros')
        .select('id', { count: 'exact', head: true })
        .eq('grupo_id', g.id).is('saiu_em', null).is('deleted_at', null);
      if (!count) { pulados.push({ grupo: g.nome, motivo: 'sem_roster' }); continue; }

      const { data: lider } = await supabase.from('mem_membros')
        .select('nome, telefone').eq('id', g.lider_id).maybeSingle();
      const r = await notificarLiderFrequencia({ grupo: g, lider, mes });
      if (r?.sent) enviados += 1;
      else pulados.push({ grupo: g.nome, motivo: r?.reason || 'erro' });
    }
    console.log(`[grupos frequencia cron] mês ${mes}: ${enviados} enviados · ${pulados.length} pulados`);
    res.json({ ok: true, mes, enviados, pulados: pulados.length });
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
