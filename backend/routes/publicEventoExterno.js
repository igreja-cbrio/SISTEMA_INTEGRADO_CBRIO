// ============================================================================
// Rotas públicas · /evento/:slug — FONTE DUPLA (F3.2 · PR 3 · SPEC-04):
// resolve PRIMEIRO na ESPINHA (insc_eventos/inscricoes — eventos novos do
// módulo /inscricoes) e cai no LEGADO (ext_eventos/ext_inscricoes) quando o
// slug não existe lá. QRs antigos do Celebra continuam funcionando sem
// mudança de link; eventos novos usam o mesmo endereço público.
//
// GET  /api/public/evento/textos          - textos canônicos de consentimento
// GET  /api/public/evento/:slug           - dados do evento (espinha → ext)
// POST /api/public/evento/:slug/inscrever - inscreve (contrato pleno)
// POST /api/public/evento/:slug/upload-imagem
//
// Ambas as fontes cumprem o Contrato de Inscrição (docs/modulo-inscricoes/).
// Montado ANTES do publicLimiter global (evento presencial em massa = 1 IP).
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
const { nomesMesmaPessoa } = require('../services/membroMatch');

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

// ── Fonte 1 · ESPINHA ──────────────────────────────────────────────────────
// Rascunho/arquivado NÃO existem pro público (404); publicado/encerrado
// aparecem (encerrado mostra "inscrições encerradas" em vez de sumir o link).
async function eventoEspinhaPorSlug(slug) {
  const { data } = await supabase.from('insc_eventos')
    .select('id, nome, slug, area, data, hora, local, descricao, campos, capa_url, vagas, inscricoes_abrem_em, inscricoes_encerram_em, msg_sucesso_titulo, msg_sucesso_texto, tem_sorteio, pagamento_ativo, valor_centavos, pagamento_metodos, pagamento_expira_horas, status')
    .eq('slug', slug).is('deleted_at', null).maybeSingle();
  if (!data || data.status === 'rascunho' || data.status === 'arquivado') return null;
  return data;
}

// Ocupação pela MESMA régua da fn_insc_inscrever (só `cancelada` devolve vaga).
// Usada pra EXIBIR e pra decidir o 403 antecipado; a decisão que vale é a de
// dentro do lock, na RPC. NUNCA derruba a página: falha aqui degrada pra
// "sem contagem" (null) — o formulário do evento AO VIVO não pode dar 500
// porque a RPC de vagas soluçou.
async function ocupacaoEspinha(eventoId) {
  try {
    const { data, error } = await supabase.rpc('fn_insc_vagas', { p_evento_id: eventoId });
    if (error) throw error;
    return data || { vagas: null, ocupadas: 0, restantes: null };
  } catch (e) {
    console.error('[publicEvento espinha] fn_insc_vagas indisponível:', e.message);
    return null;
  }
}

async function espinhaEncerrada(ev) {
  if (ev.status !== 'publicado') return true;
  const agora = Date.now();
  if (ev.inscricoes_abrem_em && agora < new Date(ev.inscricoes_abrem_em).getTime()) return true;
  if (ev.inscricoes_encerram_em && agora > new Date(ev.inscricoes_encerram_em).getTime()) return true;
  if (ev.vagas != null) {
    const ocup = await ocupacaoEspinha(ev.id);
    // fail-open na LEITURA: sem contagem, não fecha o form — quem decide de
    // verdade é o lock da fn_insc_inscrever no POST.
    if (ocup && ocup.restantes != null && ocup.restantes <= 0) return true;
  }
  return false;
}

// ── Fonte 2 · LEGADO (ext_*) ───────────────────────────────────────────────
async function eventoPorSlug(slug) {
  const { data } = await supabase.from('ext_eventos')
    .select('id, nome, slug, data, hora, local, descricao, form_ativo, tem_sorteio, campos, capa_url, inscricoes_encerram_em, msg_sucesso_titulo, msg_sucesso_texto')
    .eq('slug', slug).is('deleted_at', null).maybeSingle();
  return data || null;
}

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

function validarExtras(evCampos, dadosBody) {
  const campos = Array.isArray(evCampos) ? evCampos : [];
  const respostas = {};
  for (const c of campos) {
    const v = dadosBody && c.key ? dadosBody[c.key] : undefined;
    const preenchido = v !== undefined && v !== null && String(v).trim() !== '';
    if (c.obrigatorio && !preenchido) return { erro: `Preencha: ${c.label}` };
    if (preenchido) respostas[c.key] = String(v).slice(0, 500);
  }
  return { respostas, temCampoImagem: campos.some((c) => c.tipo === 'imagem') };
}

function gerarSorteio() { return Math.floor(Math.random() * 9000) + 1000; } // 1000-9999

// GET /textos — textos canônicos de consentimento (o front EXIBE estes; o
// snapshot gravado vem sempre do backend, então tela e registro nunca divergem)
router.get('/textos', (_req, res) => {
  res.json({
    termos_lgpd: TEXTOS.termos_lgpd,
    imagem: TEXTOS.imagem,
    aviso_optin: TEXTOS.aviso_optin,
  });
});

// GET /:slug — dados públicos do evento (espinha → ext)
router.get('/:slug', async (req, res) => {
  try {
  const esp = await eventoEspinhaPorSlug(req.params.slug);
  if (esp) {
    const pago = !!esp.pagamento_ativo; // Pix chega na F3.3 — até lá, pago não abre
    // Curto-circuitos de propósito: evento pago não abre ainda, e evento SEM
    // limite de vagas (o Celebra migrou com vagas=null) não gasta a RPC.
    const ocup = (pago || esp.vagas == null) ? null : await ocupacaoEspinha(esp.id);
    const encerradas = pago || await espinhaEncerrada(esp);
    return res.json({
      fonte: 'espinha',
      nome: esp.nome, slug: esp.slug, data: esp.data, hora: esp.hora, local: esp.local,
      descricao: esp.descricao, form_ativo: !encerradas, tem_sorteio: esp.tem_sorteio,
      campos: Array.isArray(esp.campos) ? esp.campos : [], capa_url: esp.capa_url || null,
      inscricoes_encerram_em: esp.inscricoes_encerram_em || null,
      inscricoes_encerradas: encerradas,
      vagas: esp.vagas ?? null,
      vagas_restantes: ocup ? ocup.restantes : null, // null = ilimitado
      aviso: pago ? 'Este evento tem inscrição paga — as inscrições abrem em breve, junto com o pagamento por Pix.' : null,
      msg_sucesso_titulo: esp.msg_sucesso_titulo || null,
      msg_sucesso_texto: esp.msg_sucesso_texto || null,
    });
  }

  const ev = await eventoPorSlug(req.params.slug);
  if (!ev) return res.status(404).json({ error: 'Evento não encontrado' });
  res.json({
    fonte: 'ext',
    nome: ev.nome, slug: ev.slug, data: ev.data, hora: ev.hora, local: ev.local,
    descricao: ev.descricao, form_ativo: ev.form_ativo, tem_sorteio: ev.tem_sorteio,
    campos: Array.isArray(ev.campos) ? ev.campos : [], capa_url: ev.capa_url || null,
    inscricoes_encerram_em: ev.inscricoes_encerram_em || null,
    inscricoes_encerradas: inscricoesEncerradas(ev),
    msg_sucesso_titulo: ev.msg_sucesso_titulo || null,
    msg_sucesso_texto: ev.msg_sucesso_texto || null,
  });
  } catch (e) {
    // Único handler que ficava sem try/catch — erro aqui era 500 cru na
    // página pública do evento ao vivo.
    console.error('[publicEvento] GET /:slug:', e.message);
    res.status(500).json({ error: 'Não foi possível carregar o evento agora. Tente de novo em instantes.' });
  }
});

// ── POST /:slug/inscrever · ESPINHA ────────────────────────────────────────
async function inscreverEspinha(req, res, ev) {
  const body = req.body || {};
  if (await espinhaEncerrada(ev)) {
    return res.status(403).json({ error: 'As inscrições deste evento estão encerradas.' });
  }
  if (ev.pagamento_ativo) {
    return res.status(403).json({ error: 'Este evento tem inscrição paga — abre em breve, junto com o pagamento por Pix.' });
  }

  // Campos padrão do contrato (D1–D9 + 28/07)
  const { erros, valores: val } = validarCamposPadrao(body);
  const campoErro = Object.keys(erros)[0];
  if (campoErro) return res.status(400).json({ error: erros[campoErro], campo: campoErro });
  if (!body.aceita_termos) return res.status(400).json({ error: 'É preciso aceitar os termos para se inscrever.', campo: 'aceita_termos' });

  const ex = validarExtras(ev.campos, body.dados);
  if (ex.erro) return res.status(400).json({ error: ex.erro });
  const optin = Boolean(body.whatsapp_optin);
  const ip = req.ip || null;
  const ua = req.headers['user-agent'] || null;

  const consentimentos = (refId, membroId) => registrarConsentimentos({
    porta: 'inscricoes', refId, membroId, ip, userAgent: ua,
    itens: [
      { tipo: 'termos_lgpd', aceito: true },
      { tipo: 'whatsapp', aceito: optin },
      ...(ex.temCampoImagem ? [{ tipo: 'imagem', aceito: Boolean(body.consent_imagem) }] : []),
    ],
  });

  // Dedup — re-inscrição faz merge preservador. Duas chaves, na ordem:
  //   1. (evento, CPF) — linhas novas do contrato;
  //   2. (evento, telefone) em linha SEM CPF **com nome batendo** — as ~100
  //      inscrições migradas do Celebra não têm CPF (a coluna nem existia no
  //      ext); sem este fallback, re-escanear o QR duplicava a pessoa e gerava
  //      um SEGUNDO número da sorte pro palco. A guarda de nome
  //      (nomesMesmaPessoa) evita colar na inscrição de um parente que usa o
  //      mesmo telefone — nome divergente segue criando inscrição própria.
  const { data: dups, error: eDup } = await supabase.from('inscricoes')
    .select('id, numero_sorte, dados, membro_id, whatsapp_optin, status, nome_completo, cpf, email, data_nascimento, sexo, endereco, telefone')
    .eq('evento_id', ev.id).eq('cpf', val.cpf).is('deleted_at', null).limit(2);
  if (eDup) throw eDup;
  let existente = (dups || []).find(d => d.status !== 'cancelada') || (dups || [])[0] || null;
  if (!existente && val.telefone) {
    const { data: legadas, error: eLeg } = await supabase.from('inscricoes')
      .select('id, numero_sorte, dados, membro_id, whatsapp_optin, status, nome_completo, cpf, email, data_nascimento, sexo, endereco, telefone')
      .eq('evento_id', ev.id).eq('telefone', val.telefone).is('cpf', null).is('deleted_at', null).limit(5);
    if (eLeg) throw eLeg;
    existente = (legadas || []).find(d => nomesMesmaPessoa(d.nome_completo, val.nomeCompleto) && d.status !== 'cancelada')
      || (legadas || []).find(d => nomesMesmaPessoa(d.nome_completo, val.nomeCompleto))
      || null;
  }
  if (existente) {
    // Merge preservador + ENRIQUECIMENTO da linha legada: o que a pessoa
    // acabou de digitar completa o contrato (nunca sobrescreve valor existente).
    const patch = {
      dados: mesclarDados(existente.dados, ex.respostas),
      dados_anterior: existente.dados || {},
    };
    if (!existente.cpf && val.cpf) patch.cpf = val.cpf;
    if (!existente.email && val.email) patch.email = val.email;
    if (!existente.data_nascimento && val.dataNascimento) patch.data_nascimento = val.dataNascimento;
    if (!existente.sexo && val.sexo) patch.sexo = val.sexo;
    if (!existente.endereco && val.endereco) patch.endereco = val.endereco;
    if (!existente.telefone && val.telefone) patch.telefone = val.telefone;
    if (existente.status === 'cancelada') patch.status = 'confirmada'; // voltou atrás → reativa
    if (optin && !existente.whatsapp_optin) { patch.whatsapp_optin = true; patch.whatsapp_optin_em = new Date().toISOString(); }
    const { error: eUp } = await supabase.from('inscricoes').update(patch).eq('id', existente.id);
    if (eUp) console.error('[publicEvento espinha] merge re-inscrição:', eUp.message);
    consentimentos(existente.id, existente.membro_id || null)
      .catch((err) => console.error('[publicEvento espinha] consentimentos:', err.message));
    return res.json({ ok: true, ja_inscrito: true, numero_sorte: existente.numero_sorte, tem_sorteio: ev.tem_sorteio });
  }

  // Criação ATÔMICA: conferir vaga/janela/duplicidade, gerar numero_sorte e
  // inserir acontecem dentro de um advisory lock por evento (RPC
  // fn_insc_inscrever). É o que impede o evento de estourar a vaga quando 300
  // pessoas apertam "inscrever" no mesmo minuto — a conferência em JS acima é
  // só pra dar erro bonito antes, não é a que decide.
  const { data: rpc, error } = await supabase.rpc('fn_insc_inscrever', {
    p_evento_id: ev.id,
    p_nome_completo: val.nomeCompleto,
    p_telefone: val.telefone,
    p_cpf: val.cpf,
    p_email: val.email,
    p_data_nascimento: val.dataNascimento,
    p_sexo: val.sexo,
    p_endereco: val.endereco,
    p_dados: ex.respostas,
    p_status: 'confirmada',
    p_origem: 'formulario_publico',
    p_com_sorteio: !!ev.tem_sorteio,
    p_whatsapp_optin: optin,
  });
  if (error) throw error;

  if (!rpc?.ok) {
    // Perdeu a corrida entre a conferência acima e o lock. Cada motivo tem
    // resposta própria — "sem vaga" NÃO pode virar "inscrito com sucesso".
    if (rpc?.motivo === 'duplicada') {
      // Busca a linha vencedora pra devolver o número da sorte — sem isso a
      // tela mostrava "Seu número da sorte" com nada embaixo.
      const { data: vencedora } = await supabase.from('inscricoes')
        .select('numero_sorte').eq('evento_id', ev.id).eq('cpf', val.cpf)
        .is('deleted_at', null).limit(1).maybeSingle();
      return res.status(200).json({ ok: true, ja_inscrito: true, numero_sorte: vencedora?.numero_sorte ?? null, tem_sorteio: ev.tem_sorteio });
    }
    if (rpc?.motivo === 'sem_vaga') {
      return res.status(409).json({ error: 'As vagas deste evento acabaram de esgotar.', motivo: 'sem_vaga' });
    }
    if (rpc?.motivo === 'encerrado') {
      return res.status(403).json({ error: 'As inscrições deste evento estão encerradas.' });
    }
    if (rpc?.motivo === 'sorteio_esgotado') {
      return res.status(503).json({ error: 'Não foi possível gerar o número agora. Tente de novo.' });
    }
    console.error('[publicEvento espinha] inscrever recusado:', rpc?.motivo);
    return res.status(409).json({ error: 'Não foi possível concluir a inscrição. Tente de novo.' });
  }
  const ins = { id: rpc.id, numero_sorte: rpc.numero_sorte };

  // Funil de identidade (matcher read-only + observação) + consentimentos.
  processarIdentidade({
    nomeCompleto: val.nomeCompleto, cpf: val.cpf, email: val.email, telefone: val.telefone,
    dataNascimento: val.dataNascimento, politica: 'ligar',
    origem: 'inscricoes_formulario', origemId: ins.id,
  }).then((ident) => {
    if (ident.membroId) {
      return supabase.from('inscricoes').update({ membro_id: ident.membroId }).eq('id', ins.id)
        .then(({ error: eM }) => { if (eM) console.error('[publicEvento espinha] vincular membro:', eM.message); })
        .then(() => consentimentos(ins.id, ident.membroId));
    }
    return consentimentos(ins.id, null);
  }).catch((err) => console.error('[publicEvento espinha] identidade/consentimentos:', err.message));

  notificar({
    modulo: 'inscricoes', tipo: 'nova_inscricao',
    titulo: `Nova inscrição · ${ev.nome}`,
    mensagem: `${val.nomeCompleto} se inscreveu em "${ev.nome}" (${ev.area}).`,
    link: '/inscricoes',
  }).catch((err) => console.error('[publicEvento espinha] notificar:', err.message));

  return res.status(201).json({ ok: true, numero_sorte: ins.numero_sorte, tem_sorteio: ev.tem_sorteio });
}

// ── POST /:slug/inscrever · LEGADO ext (comportamento da porta 1 intacto) ──
async function inscreverExt(req, res, ev) {
  const body = req.body || {};
  if (inscricoesEncerradas(ev)) return res.status(403).json({ error: 'As inscrições deste evento estão encerradas.' });

  const { erros, valores: val } = validarCamposPadrao(body);
  const campoErro = Object.keys(erros)[0];
  if (campoErro) return res.status(400).json({ error: erros[campoErro], campo: campoErro });
  if (!body.aceita_termos) return res.status(400).json({ error: 'É preciso aceitar os termos para se inscrever.', campo: 'aceita_termos' });

  const ex = validarExtras(ev.campos, body.dados);
  if (ex.erro) return res.status(400).json({ error: ex.erro });
  const optin = Boolean(body.whatsapp_optin);
  const ip = req.ip || null;
  const ua = req.headers['user-agent'] || null;

  const consentimentos = (refId, membroId) => registrarConsentimentos({
    porta: 'evento_externo', refId, membroId, ip, userAgent: ua,
    itens: [
      { tipo: 'termos_lgpd', aceito: true },
      { tipo: 'whatsapp', aceito: optin },
      ...(ex.temCampoImagem ? [{ tipo: 'imagem', aceito: Boolean(body.consent_imagem) }] : []),
    ],
  });

  // Dedup 1 · por CPF (chave das inscrições novas)
  const { data: porCpf, error: eCpf } = await supabase.from('ext_inscricoes')
    .select('id, numero_sorte, dados, cpf, email, data_nascimento, sexo, endereco, membro_id, whatsapp_optin')
    .eq('evento_id', ev.id).eq('cpf', val.cpf).is('deleted_at', null).limit(2);
  if (eCpf) throw eCpf;

  // Dedup 2 · fallback legado: linha antiga SEM CPF com o mesmo telefone
  let existente = (porCpf || [])[0] || null;
  if (!existente) {
    const { data: porTel, error: eTel } = await supabase.from('ext_inscricoes')
      .select('id, numero_sorte, dados, cpf, email, data_nascimento, sexo, endereco, membro_id, whatsapp_optin')
      .eq('evento_id', ev.id).eq('telefone', val.telefone).is('cpf', null).is('deleted_at', null).limit(2);
    if (eTel) throw eTel;
    existente = (porTel || [])[0] || null;
  }

  if (existente) {
    const patch = {
      dados: mesclarDados(existente.dados, ex.respostas),
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
    const cand = gerarSorteio();
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
    dados: ex.respostas,
  }).select('id, numero_sorte').single();
  if (error) {
    if (error.code === '23505') return res.status(409).json({ error: 'Tente enviar de novo.' });
    throw error;
  }

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

  notificar({
    modulo: 'eventos-externos', tipo: 'nova_inscricao',
    titulo: `Nova inscrição · ${ev.nome}`,
    mensagem: `${val.nomeCompleto} confirmou presença em "${ev.nome}".`,
    link: `/eventos-externos/${ev.id}`,
  }).catch((err) => console.error('[publicEventoExterno] notificar:', err.message));

  return res.status(201).json({ ok: true, numero_sorte: ins.numero_sorte, tem_sorteio: ev.tem_sorteio });
}

// POST /:slug/inscrever — roteia pela fonte
router.post('/:slug/inscrever', async (req, res) => {
  try {
    if (honeypotPreenchido(req.body || {})) return res.status(200).json({ ok: true }); // honeypot

    const esp = await eventoEspinhaPorSlug(req.params.slug);
    if (esp) return await inscreverEspinha(req, res, esp);

    const ev = await eventoPorSlug(req.params.slug);
    if (!ev) return res.status(404).json({ error: 'Evento não encontrado' });
    return await inscreverExt(req, res, ev);
  } catch (e) {
    console.error('[publicEvento] inscrever:', e.message);
    res.status(500).json({ error: 'Erro ao confirmar presença.' });
  }
});

// POST /:slug/upload-imagem — imagem enviada num campo do formulário.
// Funciona pras duas fontes, só com inscrições abertas.
router.post('/:slug/upload-imagem', uploadImg.single('arquivo'), async (req, res) => {
  try {
    let pasta = null;
    const esp = await eventoEspinhaPorSlug(req.params.slug);
    if (esp) {
      if (await espinhaEncerrada(esp)) return res.status(403).json({ error: 'As inscrições deste evento estão encerradas.' });
      pasta = `espinha/inscricoes/${esp.id}`;
    } else {
      const ev = await eventoPorSlug(req.params.slug);
      if (!ev) return res.status(404).json({ error: 'Evento não encontrado' });
      if (inscricoesEncerradas(ev)) return res.status(403).json({ error: 'As inscrições deste evento estão encerradas.' });
      pasta = `inscricoes/${ev.id}`;
    }
    if (!req.file) return res.status(400).json({ error: 'Envie uma imagem (PNG, JPG, WEBP ou GIF, até 5MB).' });

    const ext = (req.file.originalname.split('.').pop() || 'png').toLowerCase().replace(/[^a-z0-9]/g, '') || 'png';
    const path = `${pasta}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const { error } = await supabase.storage.from('evento-capas').upload(path, req.file.buffer, {
      contentType: req.file.mimetype || 'image/png', upsert: false,
    });
    if (error) throw error;
    const { data } = supabase.storage.from('evento-capas').getPublicUrl(path);
    res.json({ url: data.publicUrl });
  } catch (e) {
    console.error('[publicEvento] upload-imagem:', e.message);
    res.status(500).json({ error: 'Erro ao enviar a imagem.' });
  }
});

module.exports = router;
