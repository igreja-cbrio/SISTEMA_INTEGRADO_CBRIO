// wa_templates — sync com o catálogo da Meta + seed dos envs legados (C3).
//
// Antes: ~24 envs WHATSAPP_TEMPLATE_* e o catálogo da Meta NUNCA era consultado
// (status de aprovação invisível). Agora `sincronizarComMeta()` puxa
// /{WABA}/message_templates (paginado) e faz upsert em wa_templates com
// status/categoria/componentes; `seedDosEnvs()` registra o dono lógico
// (módulo) e o env de origem de cada template já usado pelo sistema.
const { supabase } = require('../utils/supabase');

const GRAPH_VERSION = process.env.WHATSAPP_GRAPH_VERSION || 'v21.0';
const WABA = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID;
const TOKEN = process.env.WHATSAPP_ACCESS_TOKEN || process.env.WHATSAPP_TOKEN;

// Dono lógico por env legado (rastreia a migração env → tabela).
const ENV_MODULO = {
  WHATSAPP_TEMPLATE_INSCRICAO: 'app',
  WHATSAPP_TEMPLATE_DOACAO: 'app',
  WHATSAPP_TEMPLATE_KIDS_VINCULO: 'kids',
  WHATSAPP_TEMPLATE_KIDS_PRECHECKIN: 'kids',
  WHATSAPP_TEMPLATE_KIDS_RETIRADA: 'kids',
  WHATSAPP_TEMPLATE_BATISMO: 'integracao',
  WHATSAPP_TEMPLATE_BATISMO_CONF: 'integracao',
  WHATSAPP_TEMPLATE_ESCALA: 'voluntariado',
  WHATSAPP_TEMPLATE_ANIVERSARIO: 'voluntariado',
  WHATSAPP_TEMPLATE_ANIVERSARIO2: 'voluntariado',
  WHATSAPP_TEMPLATE_PEDIDO: 'solicitacoes',
  WHATSAPP_TEMPLATE_APROVACAO_BOTOES: 'solicitacoes',
  WHATSAPP_TEMPLATE_DEVOCIONAL: 'cuidados',
  WHATSAPP_TEMPLATE_BOAS_VINDAS: 'cuidados',
  WHATSAPP_TEMPLATE_NEXT_CONVITE: 'next',
  WHATSAPP_TEMPLATE_NEXT_CONF: 'next',
  WHATSAPP_TEMPLATE_NEXT_INFO: 'next',
  WHATSAPP_TEMPLATE_BEBE_CONF: 'kids',
  WHATSAPP_TEMPLATE_CADASTRO: 'membresia',
  WHATSAPP_TEMPLATE_GRUPOS_RENOVACAO: 'grupos',
  WHATSAPP_TEMPLATE_ESTUDO_GRUPO: 'grupos',
  WHATSAPP_TEMPLATE_LEMBRETE_GRUPO: 'grupos',
};

// Conta os {{n}} do body de um template da Meta.
function contarParamsBody(components) {
  const body = (components || []).find(c => String(c.type).toUpperCase() === 'BODY');
  const texto = body?.text || '';
  const matches = texto.match(/\{\{\d+\}\}/g) || [];
  return new Set(matches).size;
}

function exemploDoBody(components) {
  const body = (components || []).find(c => String(c.type).toUpperCase() === 'BODY');
  return body?.text ? String(body.text).slice(0, 1000) : null;
}

// Puxa o catálogo da Meta (paginado) e faz upsert em wa_templates.
// Retorna { sincronizados, erro? }.
async function sincronizarComMeta() {
  if (!WABA || !TOKEN) return { sincronizados: 0, erro: 'WHATSAPP_BUSINESS_ACCOUNT_ID/token ausentes' };
  let url = `https://graph.facebook.com/${GRAPH_VERSION}/${WABA}/message_templates?fields=name,status,category,language,components&limit=100`;
  let sincronizados = 0;
  let guarda = 0;
  try {
    while (url && guarda < 10) { // guarda: 10 páginas = 1000 templates (muito acima do real)
      guarda += 1;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${TOKEN}` },
        signal: AbortSignal.timeout(20000),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        console.error('[waTemplates] sync erro %d: %s', res.status, JSON.stringify(json).slice(0, 300));
        return { sincronizados, erro: json?.error?.message || `HTTP ${res.status}` };
      }
      for (const t of json.data || []) {
        const linha = {
          nome: t.name,
          idioma: t.language || 'pt_BR',
          categoria: t.category ? String(t.category).toLowerCase() : null,
          status_meta: t.status || null,
          componentes: t.components || null,
          params_body: contarParamsBody(t.components),
          exemplo: exemploDoBody(t.components),
          sincronizado_em: new Date().toISOString(),
        };
        const { error } = await supabase.from('wa_templates')
          .upsert(linha, { onConflict: 'nome,idioma' });
        if (!error) sincronizados += 1;
        else console.warn('[waTemplates] upsert %s: %s', t.name, error.message);
      }
      url = json.paging?.next || null;
    }
    return { sincronizados };
  } catch (e) {
    console.error('[waTemplates] sync exception:', e.message);
    return { sincronizados, erro: e.message };
  }
}

// Marca o dono lógico (módulo) + env de origem nos templates que os envs
// legados apontam. Idempotente; não cria linha (o sync com a Meta cria) —
// se o template do env ainda não existe na tabela, cria um stub sem status.
async function seedDosEnvs() {
  let marcados = 0;
  for (const [envVar, modulo] of Object.entries(ENV_MODULO)) {
    const nome = process.env[envVar];
    if (!nome) continue;
    const { data: existente } = await supabase.from('wa_templates')
      .select('id, modulo').eq('nome', nome).limit(1).maybeSingle();
    if (existente) {
      await supabase.from('wa_templates')
        .update({ modulo: existente.modulo || modulo, env_var: envVar })
        .eq('id', existente.id);
    } else {
      await supabase.from('wa_templates')
        .insert({ nome, idioma: 'pt_BR', modulo, env_var: envVar })
        .select('id').maybeSingle();
    }
    marcados += 1;
  }
  return { marcados };
}

module.exports = { sincronizarComMeta, seedDosEnvs };
