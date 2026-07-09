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

// ── Rate limit dedicado do totem de inscrição de grupos ──
// O formulário roda num navegador quiosque no lounge (1 IP) e, num domingo
// cheio, dezenas de pessoas se inscrevem pela MESMA rede → o teto público
// global (30/15min por IP) travaria o totem no meio do culto. Aqui é generoso
// e configurável (mesma ideia do NPS público). O mount em server.js coloca
// /api/public/grupos ANTES do publicLimiter estrito e o isenta do teto global,
// então este é o único limiter que governa as rotas de grupos públicos.
const totemLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: parseInt(process.env.GRUPOS_PUBLIC_RATE_LIMIT_MAX) || (process.env.NODE_ENV === 'production' ? 300 : 5000),
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
    const { data } = await supabase.from('mem_temporadas').select('id, label, ano, numero, ativa').order('ano', { ascending: false }).order('numero', { ascending: false });
    res.json(data || []);
  } catch { res.status(500).json({ error: 'Erro' }); }
});

// GET /api/public/grupos/buscar
router.get('/buscar', async (req, res) => {
  try {
    const { lider_nome, categoria, bairro, cep, raio_km, temporada, q } = req.query;

    let query = supabase.from('mem_grupos')
      .select('id, codigo, nome, categoria, faixa_etaria, dia_semana, horario, recorrencia, local, descricao, bairro, lat, lng, lider_id, status_temporada, temporada, foto_url')
      .eq('ativo', true)
      .eq('aceitando_inscricoes', true); // líder pode ter parado de receber pedidos
    // Por padrão mostra so grupos com status que aceitam novos (ativo + novo + a_confirmar)
    query = query.in('status_temporada', ['ativo', 'novo', 'a_confirmar']);
    if (categoria) query = query.eq('categoria', categoria);
    if (bairro) query = query.eq('bairro', bairro);
    if (temporada) query = query.eq('temporada', temporada);
    query = query.order('nome');

    const { data: grupos, error } = await query;
    if (error) throw error;

    // Enriquecer com líder
    const liderIds = [...new Set((grupos || []).map(g => g.lider_id).filter(Boolean))];
    let lideresMap = {};
    if (liderIds.length > 0) {
      const { data: lideres } = await supabase.from('mem_membros').select('id, nome, foto_url').in('id', liderIds);
      (lideres || []).forEach(l => { lideresMap[l.id] = l; });
    }

    let resultado = (grupos || []).map(g => ({
      ...g,
      lider_nome: lideresMap[g.lider_id]?.nome || null,
      lider_foto: lideresMap[g.lider_id]?.foto_url || null,
    }));

    if (lider_nome) {
      const term = String(lider_nome).toLowerCase();
      resultado = resultado.filter(g => g.lider_nome?.toLowerCase().includes(term));
    }
    if (q) {
      const term = String(q).toLowerCase();
      resultado = resultado.filter(g =>
        g.nome?.toLowerCase().includes(term)
        || g.lider_nome?.toLowerCase().includes(term)
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

    let query = supabase.from('mem_grupos').select('lider_id').eq('ativo', true).not('lider_id', 'is', null);
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
      .select('id, codigo, nome, categoria, dia_semana, horario, recorrencia, local, descricao, bairro, lat, lng, lider_id, status_temporada, temporada, foto_url, complemento, ativo')
      .eq('id', req.params.id)
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

// GET /api/public/grupos/lideres/:liderId/grupos
router.get('/lideres/:liderId/grupos', async (req, res) => {
  try {
    const { temporada } = req.query;
    let query = supabase.from('mem_grupos')
      .select('id, codigo, nome, categoria, dia_semana, horario, recorrencia, local, descricao, bairro, lat, lng, lider_id, status_temporada, temporada')
      .eq('lider_id', req.params.liderId).eq('ativo', true)
      .in('status_temporada', ['ativo', 'novo', 'a_confirmar']);
    if (temporada) query = query.eq('temporada', temporada);
    const { data, error } = await query.order('nome');
    if (error) throw error;
    res.json(data || []);
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
    [['eq', 'grupo_id', grupoId], ['is', 'saiu_em', null]]);
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
    [['eq', 'grupo_id', grupoId], ['eq', 'status', 'pendente']]);
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
      observacao,
      foto_url,
      aceita_termos,
      consentimento_texto,
      website,        // honeypot
      sou_eu,         // confirmação "é você?" → liga ao existente (não duplica)
      confirmar_novo, // confirmação "não sou eu" → cria mesmo assim
    } = req.body || {};

    if (website && String(website).trim() !== '') return res.status(201).json({ ok: true });

    if (!grupo_id) return res.status(400).json({ error: 'Grupo obrigatório.' });
    if (!nome || nome.trim().length < 3) return res.status(400).json({ error: 'Nome obrigatório (min 3 caracteres).' });
    if (!telefone || soDigitos(telefone).length < 10) return res.status(400).json({ error: 'Celular obrigatório.' });
    // CPF agora é OPCIONAL (ajuda no dedup) · valida o formato só se preenchido.
    if (cpf && !cpfValido(cpf)) return res.status(400).json({ error: 'CPF inválido.' });
    if (email && !ehEmailValido(email)) return res.status(400).json({ error: 'E-mail inválido.' });
    if (!aceita_termos) return res.status(400).json({ error: 'É necessário aceitar os termos.' });

    const cpfLimpo = cpf ? soDigitos(cpf) : null;
    const emailLimpo = email ? email.trim().toLowerCase() : null;
    const fotoUrl = fotoUrlValida(foto_url) ? String(foto_url).slice(0, 1000) : null;

    // Verifica se grupo existe e esta ativo
    const { data: grupo } = await supabase.from('mem_grupos')
      .select('id, nome, ativo, aceitando_inscricoes, status_temporada, temporada, lider_id').eq('id', grupo_id).single();
    if (!grupo || !grupo.ativo) {
      return res.status(404).json({ error: 'Grupo não encontrado ou inativo.' });
    }
    if (grupo.aceitando_inscricoes === false) {
      return res.status(403).json({
        error: 'Este grupo não está recebendo novas inscrições no momento.',
        codigo: 'inscricoes_fechadas',
      });
    }

    // Verifica se a temporada do grupo esta com inscrições abertas
    if (grupo.temporada) {
      const { data: temporada } = await supabase.from('mem_temporadas')
        .select('inscricoes_abertas, label').eq('id', grupo.temporada).maybeSingle();
      if (!temporada?.inscricoes_abertas) {
        return res.status(403).json({
          error: 'As inscrições para esta temporada estão fechadas no momento. Aguarde a próxima abertura.',
          codigo: 'inscricoes_fechadas',
        });
      }
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
    const jaExiste = (tipo) => tipo === 'membro_ativo'
      ? res.json({ ok: true, ja_membro: true, mensagem: 'Você já participa deste grupo. Nos vemos no encontro!' })
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
        .select('id').eq('grupo_id', grupo_id).eq('membro_id', membroId).is('saiu_em', null).limit(1);
      if (ativo && ativo.length) dup = { tipo: 'membro_ativo' };
      else {
        const { data: ped } = await supabase.from('mem_grupo_pedidos')
          .select('id').eq('grupo_id', grupo_id).eq('membro_id', membroId).eq('status', 'pendente').limit(1);
        if (ped && ped.length) dup = { tipo: 'pedido_pendente' };
      }
    }
    if (!dup && !confirmar_novo) {
      dup = await checarDuplicataInscricao(grupo_id, incoming);
    }

    if (dup) {
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

    // Já é membro e a foto veio (e ele ainda não tem) → aproveita o reforço visual.
    if (membroId && fotoUrl) {
      const { data: mem } = await supabase.from('mem_membros').select('foto_url').eq('id', membroId).maybeSingle();
      if (mem && !mem.foto_url) {
        await supabase.from('mem_membros').update({ foto_url: fotoUrl }).eq('id', membroId);
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
        foto_url: fotoUrl,
        origem: 'qr_code',
        aceita_termos: !!aceita_termos,
        aceita_contato: true,
        consentimento_texto: consentimento_texto ? String(consentimento_texto).slice(0, 2000) : null,
        status: 'pendente',
        ip_origem: ip,
        user_agent: userAgent,
      }).select('id').single();
      if (eCad) {
        console.error('[public grupos inscrever] cadastro pendente:', eCad.message);
        return res.status(500).json({ error: 'Erro ao registrar cadastro.' });
      }
      cadastroPendenteId = cad.id;
    }

    // Cria pedido pendente
    const pedidoBase = {
      grupo_id,
      nome: nome.trim(),
      email: emailLimpo,
      telefone: telefone || null,
      origem: 'formulario_publico',
      observacao: observacao ? String(observacao).trim().slice(0, 500) : null,
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
      } catch (err) { console.error('[public grupos inscrever notify]', err.message); }
    })();

    res.status(201).json({ ok: true, pedido_id: pedido.id });
  } catch (e) {
    console.error('[public grupos inscrever]', e.message);
    res.status(500).json({ error: 'Erro ao processar inscrição.' });
  }
});

module.exports = router;
