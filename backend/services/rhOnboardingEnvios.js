// ════════════════════════════════════════════════════════════════════════════
//  RH · disparo em massa do formulário de onboarding (dados pessoais)
//
//  Espelha o padrão já estabelecido nos outros disparos em massa do sistema
//  (grupos "confira a lista", censo): preview (nunca enfileira) → confirmação
//  na tela → disparo (enfileira em lote pela fila `whatsappFila`). Template
//  Meta ainda NÃO existe — enquanto a env `WHATSAPP_TEMPLATE_RH_ONBOARDING`
//  estiver vazia, o disparo devolve 'sem_template' e NADA sai (nunca cai pra
//  texto livre proativo).
// ════════════════════════════════════════════════════════════════════════════
'use strict';

const crypto = require('crypto');
const { supabase } = require('../utils/supabase');
const { configurado } = require('./whatsappService');
const { enfileirarLote } = require('./whatsappFila');
const { avaliarProntidaoFuncionario } = require('../utils/rhOnboardingProntidao');

const WHATSAPP_LIGADO = () => configurado();

const TPL_ONBOARDING = process.env.WHATSAPP_TEMPLATE_RH_ONBOARDING || null;

const COLUNAS = 'id, nome, telefone, cpf, data_nascimento, endereco, status, onboarding_token, onboarding_enviado_em';

// URL local (dev) NUNCA vira link de WhatsApp — mesma guarda de gruposWhatsapp.js.
const RE_BASE_LOCAL = /localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\]|^https?:\/\/(?:10\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.)/i;
function baseUrl() {
  const candidata = (process.env.FRONTEND_URL
    || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'https://cbrio.org')
  ).replace(/\/+$/, '');
  if (RE_BASE_LOCAL.test(candidata)) {
    console.warn('[RH onboarding] FRONTEND_URL local (%s) ignorada em link de WhatsApp — usando https://cbrio.org', candidata);
    return 'https://cbrio.org';
  }
  return candidata;
}

// Gera (ou reusa) o token de onboarding de um funcionário — mesma lógica da
// rota individual `POST /funcionarios/:id/onboarding-link`, extraída aqui pra
// não duplicar (o disparo em massa e o botão individual usam a MESMA função).
async function gerarOnboardingLink(func, { regenerar = false } = {}) {
  let token = func.onboarding_token;
  if (!token || regenerar) {
    token = crypto.randomBytes(18).toString('base64url');
  }
  const { error } = await supabase.from('rh_funcionarios')
    .update({ onboarding_token: token, onboarding_enviado_em: new Date().toISOString() })
    .eq('id', func.id);
  if (error) return { erro: error.message };
  return { url: `${baseUrl()}/onboarding/${token}`, token };
}

// Ativos e admissão (quem já saiu não precisa completar cadastro).
const STATUS_ELEGIVEIS = ['ativo', 'em_admissao', 'ferias', 'licenca'];

async function listarPendentes() {
  const { data, error } = await supabase.from('rh_funcionarios')
    .select(COLUNAS)
    .is('deleted_at', null)
    .in('status', STATUS_ELEGIVEIS)
    .order('nome', { ascending: true });
  if (error) return { erro: error.message };

  const pendentes = (data || [])
    .map((f) => ({ ...f, prontidao: avaliarProntidaoFuncionario(f) }))
    .filter((f) => !f.prontidao.completo);
  return { pendentes, total_colaboradores: (data || []).length };
}

function montarEnvioOnboarding({ func, url }) {
  if (!WHATSAPP_LIGADO()) return { erro: 'disabled' };
  if (!func?.telefone) return { erro: 'sem_telefone' };
  if (!TPL_ONBOARDING) return { erro: 'sem_template' };
  const primeiroNome = (func.nome || '').trim().split(/\s+/)[0] || 'colaborador(a)';
  return {
    envio: {
      telefone: func.telefone,
      template: TPL_ONBOARDING,
      params: [primeiroNome, url],
      contexto: 'rh.onboarding_lote',
      refId: func.id,
    },
  };
}

// Nunca enfileira — só resolve quem entraria e por quê cada um ficaria de fora.
async function previewLote() {
  const r = await listarPendentes();
  if (r.erro) return { erro: r.erro };

  const semTelefone = r.pendentes.filter((f) => !f.telefone).length;
  const alvos = r.pendentes.filter((f) => f.telefone);

  return {
    total_pendentes: r.pendentes.length,
    total_colaboradores: r.total_colaboradores,
    enviaveis: alvos.length,
    sem_telefone: semTelefone,
    template_configurado: !!TPL_ONBOARDING,
    canal_configurado: WHATSAPP_LIGADO(),
    exemplo: alvos.slice(0, 5).map((f) => ({ id: f.id, nome: f.nome, faltando: f.prontidao.faltando })),
  };
}

async function dispararLote() {
  const r = await listarPendentes();
  if (r.erro) return { erro: r.erro };

  const envios = [];
  const erros = { sem_telefone: 0, sem_template: 0, link: 0 };

  for (const func of r.pendentes) {
    if (!func.telefone) { erros.sem_telefone += 1; continue; }

    const link = await gerarOnboardingLink(func);
    if (link.erro) { erros.link += 1; console.error('[RH onboarding lote] link:', func.id, link.erro); continue; }

    const montado = montarEnvioOnboarding({ func, url: link.url });
    if (montado.erro === 'sem_template') { erros.sem_template += 1; continue; }
    if (montado.erro) { erros.sem_telefone += 1; continue; }
    envios.push(montado.envio);
  }

  const lote = envios.length ? await enfileirarLote(envios) : { queued: 0 };

  return {
    total_pendentes: r.pendentes.length,
    enfileirados: lote.queued || 0,
    erros,
  };
}

module.exports = { listarPendentes, previewLote, dispararLote, gerarOnboardingLink, montarEnvioOnboarding };
