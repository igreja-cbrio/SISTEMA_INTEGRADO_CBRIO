// Mensagens automáticas de WhatsApp por contexto (chave) · texto editável.
// Ver migration 20260609170000_whatsapp_auto_mensagens.sql.
//
// Dois modos (config.modo):
//   'template' → whatsappService.sendTemplate (template aprovado na Meta)
//   'texto'    → whatsappSend.enviarTexto (texto livre · janela de 24h)
//
// Tudo é best-effort: nunca lança · só loga em whatsapp_auto_envios.
const { supabase } = require('../utils/supabase');

function primeiroNome(nome) {
  return String(nome || '').trim().split(/\s+/)[0] || '';
}

// Substitui {nome} pelo primeiro nome (fallback genérico se vazio).
function render(msg, nome) {
  const pn = primeiroNome(nome) || 'tudo bem';
  return String(msg || '').replace(/\{nome\}/gi, pn).trim();
}

async function getConfig(chave) {
  const { data } = await supabase
    .from('whatsapp_auto_config').select('*').eq('chave', chave).maybeSingle();
  return data || null;
}

function soDigitos(t) { return String(t || '').replace(/\D/g, ''); }

// Faz o envio de fato conforme o modo configurado. Retorna shape normalizado.
async function enviarPorConfig(cfg, telefone, nome) {
  const texto = render(cfg.mensagem, nome);
  if (cfg.modo === 'texto') {
    const { enviarTexto } = require('./whatsappSend');
    const r = await enviarTexto(telefone, texto);
    return { sent: !!r.ok, message_id: r.message_id || null, erro: r.ok ? null : (r.error || 'erro') };
  }
  // modo template · usa as MESMAS credenciais do bot (WHATSAPP_ACCESS_TOKEN)
  if (!cfg.template_nome) return { sent: false, message_id: null, erro: 'template_nao_configurado' };
  const { enviarTemplate } = require('./whatsappSend');
  const params = cfg.usa_nome
    ? [primeiroNome(nome) || 'tudo bem', texto]
    : [texto];
  const r = await enviarTemplate(telefone, cfg.template_nome, cfg.idioma || 'pt_BR', params);
  return { sent: !!r.ok, message_id: r.message_id || null, erro: r.ok ? null : (r.error || 'erro') };
}

async function registrar(chave, { refId, telefone, nome, origem, status, message_id, erro }) {
  try {
    await supabase.from('whatsapp_auto_envios').insert({
      chave, ref_id: refId || null, telefone: telefone || null, nome: nome || null,
      origem: origem || null, status, message_id: message_id || null, erro: erro || null,
    });
  } catch (e) {
    // unique(chave, ref_id) → envio já registrado · ignora
    if (!String(e.message || '').includes('duplicate')) console.warn('[whatsappAuto] log:', e.message);
  }
}

// Dispara a mensagem automática de um contexto. Best-effort.
// opts: { refId?, telefone, nome, origem }
async function dispararAuto(chave, opts = {}) {
  try {
    const cfg = await getConfig(chave);
    if (!cfg || !cfg.ativo) return { sent: false, reason: 'desabilitado' };

    const tel = soDigitos(opts.telefone);
    if (!tel) {
      await registrar(chave, { ...opts, telefone: null, status: 'sem_telefone' });
      return { sent: false, reason: 'sem_telefone' };
    }

    // idempotência: já enviou pra essa inscrição/pedido?
    if (opts.refId) {
      const { data: ja } = await supabase
        .from('whatsapp_auto_envios').select('id')
        .eq('chave', chave).eq('ref_id', opts.refId).eq('status', 'enviado').maybeSingle();
      if (ja) return { sent: false, reason: 'ja_enviado' };
    }

    const r = await enviarPorConfig(cfg, tel, opts.nome);
    await registrar(chave, {
      refId: opts.refId, telefone: tel, nome: opts.nome, origem: opts.origem,
      status: r.sent ? 'enviado' : 'erro', message_id: r.message_id, erro: r.erro,
    });
    return r;
  } catch (e) {
    console.warn(`[whatsappAuto:${chave}]`, e.message);
    return { sent: false, reason: 'exception', erro: e.message };
  }
}

// Envio de teste (não checa ativo · usa a config atual). origem='teste'.
async function enviarTeste(chave, telefone, nome) {
  const cfg = await getConfig(chave);
  if (!cfg) return { sent: false, erro: 'sem_config' };
  const tel = soDigitos(telefone);
  if (!tel) return { sent: false, erro: 'sem_telefone' };
  const r = await enviarPorConfig(cfg, tel, nome || 'Fulano de Tal');
  await registrar(chave, {
    refId: null, telefone: tel, nome: nome || '(teste)', origem: 'teste',
    status: r.sent ? 'enviado' : 'erro', message_id: r.message_id, erro: r.erro,
  });
  return r;
}

module.exports = { dispararAuto, enviarTeste, getConfig, render };
