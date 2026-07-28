// ============================================================================
// Rotas públicas · Eventos Externos (confirmação de presença + número da sorte)
// GET  /api/public/evento/textos          - textos canônicos de consentimento
// GET  /api/public/evento/:slug           - dados do evento (se form ativo)
// POST /api/public/evento/:slug/inscrever - confirma presença → número da sorte
// POST /api/public/evento/:slug/upload-imagem
//
// PORTA 1 do Contrato de Inscrição (F3.1 · docs/modulo-inscricoes/):
// campos padrão obrigatórios p/ inscrições NOVAS (nome completo, telefone,
// CPF, e-mail, nascimento, sexo; endereço opcional), termos LGPD com snapshot,
// matcher read-only + observação de identidade, dedup por CPF com fallback
// telefone (linhas legadas sem CPF são ENRIQUECIDAS na re-inscrição, nunca
// duplicadas nem apagadas). Montado ANTES do publicLimiter global (evento
// presencial em massa = 1 IP público) — o limiter generoso é o daqui.
// ============================================================================
const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const multer = require('multer');
const { supabase } = require('../utils/supabase');
const { notificar } = require('../services/notificar');
const {
  validarCamposPadrao, processarIdentidade, registrarConsentimentos,
  honeypotPreenchido, TEXTOS,
} = require('../services/inscricaoContrato');

// Limiter próprio generoso (mesma lógica do publicGrupos/publicNps): o evento
// inteiro sai por 1 IP de Wi-Fi — sem teto prático de inscrições (D9).
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: parseInt(process.env.EVENTO_PUBLIC_RATE_LIMIT_MAX) || (process.env.NODE_ENV === 'production' ? 1000 : 5000),
  message: { error: 'Muitas requisições. Aguarde alguns minutos.' },
  skip: () => process.env.NODE_ENV !== 'production',
  standardHeaders: true,
  legacyHeaders: false,
});
router.use(limiter);

// Upload de imagem enviada NO formulário público (ex.: logo da empresa parceira).
// Só imagens, 5MB, memória → bucket público `evento-capas` (o mesmo da capa).
const MIME_IMG = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif'];
const uploadImg = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => cb(null, MIME_IMG.includes(file.mimetype)),
});

async function eventoPorSlug(slug) {
  const { data } = await supabase.from('ext_eventos')
    .select('id, nome, slug, data, hora, local, descricao, form_ativo, tem_sorteio, campos, capa_url, inscricoes_encerram_em, msg_sucesso_titulo, msg_sucesso_texto')
    .eq('slug', slug).is('deleted_at', null).maybeSingle();
  return data || null;
}

// Inscrições encerradas se o toggle estiver desligado OU se passou do prazo.
function inscricoesEncerradas(ev) {
  if (!ev.form_ativo) return true;
  if (ev.inscricoes_encerram_em && Date.now() > new Date(ev.inscricoes_encerram_em).getTime()) return true;
  return false;
}

// Merge preservador (re-inscrição): resposta existente NUNCA é sobrescrita
// com vazio; valor novo não-vazio atualiza.
function mesclarDados(atuais, novas) {
  const out = { ...(atuais || {}) };
  for (const [k, v] of Object.entries(novas || {})) {
    if (String(v ?? '').trim() !== '') out[k] = v;
  }
  return out;
}

// GET /textos — textos canônicos de consentimento (o front EXIBE estes; o
// snapshot gravado vem sempre do backend, então tela e registro nunca divergem)
router.get('/textos', (_req, res) => {
  res.json({
    termos_lgpd: TEXTOS.termos_lgpd,
    imagem: TEXTOS.imagem,
    aviso_optin: TEXTOS.aviso_optin,
  });
});

// GET /:slug — dados públicos do evento
router.get('/:slug', async (req, res) => {
  const ev = await eventoPorSlug(req.params.slug);
  if (!ev) return res.status(404).json({ error: 'Evento não encontrado' });
  res.json({
    nome: ev.nome, slug: ev.slug, data: ev.data, hora: ev.hora, local: ev.local,
    descricao: ev.descricao, form_ativo: ev.form_ativo, tem_sorteio: ev.tem_sorteio,
    campos: Array.isArray(ev.campos) ? ev.campos : [], capa_url: ev.capa_url || null,
    inscricoes_encerram_em: ev.inscricoes_encerram_em || null,
    inscricoes_encerradas: inscricoesEncerradas(ev),
    msg_sucesso_titulo: ev.msg_sucesso_titulo || null,
    msg_sucesso_texto: ev.msg_sucesso_texto || null,
  });
});

// POST /:slug/inscrever — confirma presença e devolve o número da sorte
router.post('/:slug/inscrever', async (req, res) => {
  try {
    const body = req.body || {};
    if (honeypotPreenchido(body)) return res.status(200).json({ ok: true }); // honeypot

    const ev = await eventoPorSlug(req.params.slug);
    if (!ev) return res.status(404).json({ error: 'Evento não encontrado' });
    if (inscricoesEncerradas(ev)) return res.status(403).json({ error: 'As inscrições deste evento estão encerradas.' });

    // Campos padrão do contrato (D1–D9 + 28/07) — só para inscrições novas
    const { erros, valores: val } = validarCamposPadrao(body);
    const campoErro = Object.keys(erros)[0];
    if (campoErro) return res.status(400).json({ error: erros[campoErro], campo: campoErro });
    if (!body.aceita_termos) return res.status(400).json({ error: 'É preciso aceitar os termos para se inscrever.', campo: 'aceita_termos' });

    // Campos configuráveis do evento → valida obrigatórios e monta o `dados`.
    const campos = Array.isArray(ev.campos) ? ev.campos : [];
    const respostas = {};
    for (const c of campos) {
      const v = body.dados && c.key ? body.dados[c.key] : undefined;
      const preenchido = v !== undefined && v !== null && String(v).trim() !== '';
      if (c.obrigatorio && !preenchido) return res.status(400).json({ error: `Preencha: ${c.label}` });
      if (preenchido) respostas[c.key] = String(v).slice(0, 500);
    }
    const temCampoImagem = campos.some((c) => c.tipo === 'imagem');
    const optin = Boolean(body.whatsapp_optin);
    const ip = req.ip || null;
    const ua = req.headers['user-agent'] || null;

    const consentimentos = (refId, membroId) => registrarConsentimentos({
      porta: 'evento_externo', refId, membroId, ip, userAgent: ua,
      itens: [
        { tipo: 'termos_lgpd', aceito: true },
        { tipo: 'whatsapp', aceito: optin },
        ...(temCampoImagem ? [{ tipo: 'imagem', aceito: Boolean(body.consent_imagem) }] : []),
      ],
    });

    // ── Dedup 1 · por CPF (chave das inscrições novas) ──
    const { data: porCpf, error: eCpf } = await supabase.from('ext_inscricoes')
      .select('id, numero_sorte, dados, cpf, email, data_nascimento, sexo, endereco, membro_id, whatsapp_optin')
      .eq('evento_id', ev.id).eq('cpf', val.cpf).is('deleted_at', null).limit(2);
    if (eCpf) throw eCpf;

    // ── Dedup 2 · fallback legado: linha antiga SEM CPF com o mesmo telefone ──
    let existente = (porCpf || [])[0] || null;
    if (!existente) {
      const { data: porTel, error: eTel } = await supabase.from('ext_inscricoes')
        .select('id, numero_sorte, dados, cpf, email, data_nascimento, sexo, endereco, membro_id, whatsapp_optin')
        .eq('evento_id', ev.id).eq('telefone', val.telefone).is('cpf', null).is('deleted_at', null).limit(2);
      if (eTel) throw eTel;
      existente = (porTel || [])[0] || null;
    }

    if (existente) {
      // Re-inscrição: merge preservador + enriquecimento só-onde-vazio.
      const patch = {
        dados: mesclarDados(existente.dados, respostas),
        dados_anterior: existente.dados || {},
      };
      if (!existente.cpf && val.cpf) patch.cpf = val.cpf;
      if (!existente.email && val.email) patch.email = val.email;
      if (!existente.data_nascimento && val.dataNascimento) patch.data_nascimento = val.dataNascimento;
      if (!existente.sexo && val.sexo) patch.sexo = val.sexo;
      if (!existente.endereco && val.endereco) patch.endereco = val.endereco;
      if (optin && !existente.whatsapp_optin) { patch.whatsapp_optin = true; patch.whatsapp_optin_em = new Date().toISOString(); }

      const ident = await processarIdentidade({
        nomeCompleto: val.nomeCompleto, cpf: val.cpf, email: val.email, telefone: val.telefone,
        dataNascimento: val.dataNascimento, politica: 'ligar',
        origem: 'evento_externo_formulario', origemId: existente.id,
      });
      if (!existente.membro_id && ident.membroId) patch.membro_id = ident.membroId;

      const { error: eUp } = await supabase.from('ext_inscricoes').update(patch).eq('id', existente.id);
      if (eUp) console.error('[publicEventoExterno] merge da re-inscrição falhou:', eUp.message);
      consentimentos(existente.id, existente.membro_id || ident.membroId || null)
        .catch((err) => console.error('[publicEventoExterno] consentimentos:', err.message));

      return res.json({ ok: true, ja_inscrito: true, numero_sorte: existente.numero_sorte, tem_sorteio: ev.tem_sorteio });
    }

    // Número da sorte aleatório e único por evento (retenta em colisão).
    let numero = null;
    for (let tentativa = 0; tentativa < 25; tentativa++) {
      const cand = Math.floor(Math.random() * 9000) + 1000; // 1000-9999
      const { data: existe, error: eNum } = await supabase.from('ext_inscricoes')
        .select('id').eq('evento_id', ev.id).eq('numero_sorte', cand).limit(1);
      if (eNum) throw eNum;
      if (!existe || !existe.length) { numero = cand; break; }
    }
    if (numero == null) return res.status(503).json({ error: 'Não foi possível gerar o número agora. Tente de novo.' });

    const { data: ins, error } = await supabase.from('ext_inscricoes').insert({
      evento_id: ev.id,
      nome: val.nomeCompleto,
      telefone: val.telefone,
      cpf: val.cpf,
      email: val.email,
      data_nascimento: val.dataNascimento,
      sexo: val.sexo,
      endereco: val.endereco,
      whatsapp_optin: optin,
      whatsapp_optin_em: optin ? new Date().toISOString() : null,
      status: 'confirmada',
      origem: 'formulario_publico',
      numero_sorte: numero,
      dados: respostas,
    }).select('id, numero_sorte').single();
    if (error) {
      if (error.code === '23505') { // colisão de corrida no número → 1 retry simples
        return res.status(409).json({ error: 'Tente enviar de novo.' });
      }
      throw error;
    }

    // Funil de identidade (Contrato de porta): matcher read-only + observação.
    // Best-effort — inscrição nunca é perdida por falha aqui.
    processarIdentidade({
      nomeCompleto: val.nomeCompleto, cpf: val.cpf, email: val.email, telefone: val.telefone,
      dataNascimento: val.dataNascimento, politica: 'ligar',
      origem: 'evento_externo_formulario', origemId: ins.id,
    }).then((ident) => {
      if (ident.membroId) {
        return supabase.from('ext_inscricoes').update({ membro_id: ident.membroId }).eq('id', ins.id)
          .then(({ error: eM }) => { if (eM) console.error('[publicEventoExterno] vincular membro:', eM.message); })
          .then(() => consentimentos(ins.id, ident.membroId));
      }
      return consentimentos(ins.id, null);
    }).catch((err) => console.error('[publicEventoExterno] identidade/consentimentos:', err.message));

    // Sininho: avisa a equipe de eventos externos (Ariel/Jessica via regras).
    notificar({
      modulo: 'eventos-externos', tipo: 'nova_inscricao',
      titulo: `Nova inscrição · ${ev.nome}`,
      mensagem: `${val.nomeCompleto} confirmou presença em "${ev.nome}".`,
      link: `/eventos-externos/${ev.id}`,
    }).catch((err) => console.error('[publicEventoExterno] notificar:', err.message));

    res.status(201).json({ ok: true, numero_sorte: ins.numero_sorte, tem_sorteio: ev.tem_sorteio });
  } catch (e) {
    console.error('[publicEventoExterno] inscrever:', e.message);
    res.status(500).json({ error: 'Erro ao confirmar presença.' });
  }
});

// POST /:slug/upload-imagem — imagem enviada num campo do formulário (ex.: logo
// da empresa). Só funciona se o evento existe e está com inscrições abertas
// (não é um bucket aberto pra qualquer um). Devolve a URL pública pra ser
// gravada em `dados[campo]` no submit.
router.post('/:slug/upload-imagem', uploadImg.single('arquivo'), async (req, res) => {
  try {
    const ev = await eventoPorSlug(req.params.slug);
    if (!ev) return res.status(404).json({ error: 'Evento não encontrado' });
    if (inscricoesEncerradas(ev)) return res.status(403).json({ error: 'As inscrições deste evento estão encerradas.' });
    if (!req.file) return res.status(400).json({ error: 'Envie uma imagem (PNG, JPG, WEBP ou GIF, até 5MB).' });

    const ext = (req.file.originalname.split('.').pop() || 'png').toLowerCase().replace(/[^a-z0-9]/g, '') || 'png';
    const path = `inscricoes/${ev.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const { error } = await supabase.storage.from('evento-capas').upload(path, req.file.buffer, {
      contentType: req.file.mimetype || 'image/png', upsert: false,
    });
    if (error) throw error;
    const { data } = supabase.storage.from('evento-capas').getPublicUrl(path);
    res.json({ url: data.publicUrl });
  } catch (e) {
    console.error('[publicEventoExterno] upload-imagem:', e.message);
    res.status(500).json({ error: 'Erro ao enviar a imagem.' });
  }
});

module.exports = router;
