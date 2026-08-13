// ============================================================================
// Totem · identidade de ESTAÇÃO (2026-08-05)
//
// Responde "qual totem fez isso?" — pergunta que passa a ter consequência
// financeira quando o totem recebe dinheiro (Pix, e depois cartão no pinpad).
//
// ⚠️ DOIS CAMINHOS, e não confundir:
//
//   1. `estacaoDaConta(req.user.id)` — o caminho REAL do dia a dia. As
//      inscrições de evento vivem dentro do Totem Membro (`/totem`), que já
//      está autenticado por conta de quiosque (20260703160000), então a estação
//      sai da conta logada e NÃO há nada a parear no navegador.
//
//   2. `parear` + `resolverToken` — sobrou pro AGENTE DO PINPAD (Fase 3): um
//      serviço Windows, sem sessão de usuário, que precisa de segredo próprio.
//      Fora disso, não usar.
//
// (Existiu por algumas horas em 05/08 um quiosque `/totem/inscricoes` com
// pareamento pelo navegador. Foi removido no mesmo dia: as inscrições vão pro
// Totem Membro, e credencial que não existe não pode ser copiada de um PC de
// hall.)
//
// ═══ REGRAS QUE SÃO LEI NESTE SERVIÇO (não regredir) ═══
//
//  1. `estacao_id` é ATRIBUÍDO PELO SERVIDOR, nunca declarado pelo cliente.
//     Aceitar `estacao_id` do corpo do request faz qualquer um dizer "sou o
//     totem 3", e a conciliação do presencial atribui a cobrança ao
//     equipamento errado — silenciosamente.
//
//  2. O SEGREDO NUNCA É GRAVADO. Só `sha256`. Ele é devolvido UMA vez, na
//     emissão. Se alguém "precisar ver de novo", a resposta é emitir outro.
//
//  3. FAIL-CLOSED na resolução do token (linha ausente, expirada, revogada,
//     estação inativa, IP fora do cerco) → recusa. E a recusa é NEUTRA: não
//     distingue token inexistente de estação revogada, pra não virar oráculo
//     de enumeração.
//
//  4. O TOKEN NÃO AUTORIZA MÓDULO. Não passa por `authenticate` nem por
//     `authorizeModule` e não popula `req.user`.
//
//  5. CÓDIGO DE PAREAMENTO É DE USO ÚNICO E CURTO. 8 caracteres num alfabeto
//     sem ambiguidade visual, 15 minutos, queimado no primeiro uso.
// ============================================================================

const crypto = require('crypto');
const { supabase } = require('../utils/supabase');
// Régua PURA (alfabeto + cerco de rede) mora em utils/ pra entrar no gate de
// deploy. NÃO duplicar aqui: cópia divergente do cerco = proteção que some sem
// ninguém ver. Ver backend/utils/totemCerco.js.
const { ALFABETO, CODIGO_LEN, ipDentroDoCerco } = require('../utils/totemCerco');

const PAREAMENTO_TTL_MIN = 15;
const DISPOSITIVO_TTL_DIAS = 90;

// Cache do par (hash → estação) espelhando o `authUserCache` do middleware de
// auth: mesmo trade-off de 60s já aceito na casa. É o que faz revogação valer
// em ≤60s em vez de "no próximo deploy".
const CACHE_TTL_MS = 60 * 1000;
const cache = new Map();

const SELECT_ESTACAO = `
  id, codigo, nome, finalidades, local, igreja_id, evento_fixo_id,
  tef_provider, tef_terminal_serie, tef_terminal_logico, tef_ativo,
  printer_target, printer_modelo, printer_largura_mm, printer_altura_mm,
  ativo, ip_permitidos, revogada_em, ultima_batida_em, versao_app
`;

function hashToken(t) {
  return crypto.createHash('sha256').update(String(t)).digest('hex');
}

function gerarCodigo() {
  // rejection sampling: `% ALFABETO.length` com 256 % 32 === 0 não enviesa,
  // mas deixo explícito pra não virar bug se o alfabeto mudar de tamanho.
  const limite = 256 - (256 % ALFABETO.length);
  let out = '';
  while (out.length < CODIGO_LEN) {
    for (const b of crypto.randomBytes(CODIGO_LEN)) {
      if (b >= limite) continue;
      out += ALFABETO[b % ALFABETO.length];
      if (out.length === CODIGO_LEN) break;
    }
  }
  return out;
}

function gerarSegredo() {
  return `tk_${crypto.randomBytes(32).toString('hex')}`;
}

// ── Emissão ────────────────────────────────────────────────────────────────
async function emitirToken(estacaoId, tipo, { criadoPor, rotulo, linhagem, ttlDias } = {}) {
  const segredo = tipo === 'pareamento' ? gerarCodigo() : gerarSegredo();
  const expira = new Date(
    tipo === 'pareamento'
      ? Date.now() + PAREAMENTO_TTL_MIN * 60 * 1000
      : Date.now() + (ttlDias || DISPOSITIVO_TTL_DIAS) * 24 * 60 * 60 * 1000,
  ).toISOString();

  const linha = {
    estacao_id: estacaoId,
    tipo,
    token_hash: hashToken(segredo),
    prefixo: segredo.slice(0, 8),
    rotulo: rotulo || null,
    criado_por: criadoPor || null,
    expira_em: expira,
  };
  if (linhagem) linha.linhagem = linhagem;

  const { data, error } = await supabase
    .from('totem_estacao_tokens')
    .insert(linha)
    .select('id, tipo, prefixo, linhagem, expira_em, created_at')
    .single();
  if (error) throw error;

  // `segredo` só existe nesta resposta. Não logar, não devolver depois.
  return { segredo, token: data };
}

// Gera o código que o voluntário vai digitar no totem.
async function gerarPareamento(estacaoId, { criadoPor, rotulo } = {}) {
  // Códigos anteriores da mesma estação morrem: dois códigos vivos ao mesmo
  // tempo é confusão operacional (o admin gera de novo achando que errou e o
  // primeiro continua valendo por 15 min).
  await supabase
    .from('totem_estacao_tokens')
    .update({ revogado_em: new Date().toISOString(), revogado_motivo: 'código novo gerado' })
    .eq('estacao_id', estacaoId).eq('tipo', 'pareamento')
    .is('revogado_em', null).is('usado_em', null);

  const { segredo, token } = await emitirToken(estacaoId, 'pareamento', { criadoPor, rotulo });
  return { codigo: segredo, expira_em: token.expira_em };
}

// ── Pareamento ─────────────────────────────────────────────────────────────
// Troca o código de uso único pelo segredo do dispositivo (ou do agente TEF).
async function parear({ codigo, tipo = 'dispositivo', ip, userAgent, rotulo }) {
  const limpo = String(codigo || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (limpo.length !== CODIGO_LEN) return { ok: false, motivo: 'codigo_invalido' };

  const { data: linha, error } = await supabase
    .from('totem_estacao_tokens')
    .select('id, estacao_id, tipo, expira_em, usado_em, revogado_em')
    .eq('token_hash', hashToken(limpo)).eq('tipo', 'pareamento')
    .maybeSingle();
  if (error) throw error;

  // Recusa NEUTRA: um código errado e um código expirado respondem igual.
  if (!linha || linha.revogado_em || linha.usado_em) return { ok: false, motivo: 'codigo_invalido' };
  if (linha.expira_em && new Date(linha.expira_em) <= new Date()) return { ok: false, motivo: 'codigo_invalido' };

  const { data: est, error: e2 } = await supabase
    .from('totem_estacoes').select(SELECT_ESTACAO).eq('id', linha.estacao_id).maybeSingle();
  if (e2) throw e2;
  if (!est || !est.ativo || est.revogada_em) return { ok: false, motivo: 'estacao_indisponivel' };

  // ⚠️ QUEIMA O CÓDIGO ANTES DE EMITIR, condicionado ao estado (`.is('usado_em', null)`):
  // é o UPDATE que serializa duas tentativas simultâneas com o mesmo código.
  // Emitir primeiro e queimar depois deixaria dois dispositivos pareados com um
  // código de uso único.
  const { data: queimado, error: e3 } = await supabase
    .from('totem_estacao_tokens')
    .update({
      usado_em: new Date().toISOString(),
      pareado_em: new Date().toISOString(),
      pareado_ip: ip || null,
      pareado_user_agent: (userAgent || '').slice(0, 300) || null,
    })
    .eq('id', linha.id).is('usado_em', null).is('revogado_em', null)
    .select('id');
  if (e3) throw e3;
  if (!queimado || queimado.length === 0) return { ok: false, motivo: 'codigo_invalido' };

  const alvo = tipo === 'agente' ? 'agente' : 'dispositivo';
  const { segredo, token } = await emitirToken(est.id, alvo, {
    criadoPor: null,
    rotulo: rotulo || (userAgent || '').slice(0, 120) || null,
  });

  cache.clear(); cacheConta.clear(); // pareou = trocou credencial; não servir estado velho
  return { ok: true, segredo, token, estacao: publico(est) };
}

// ── Resolução (o caminho quente: roda em toda request do totem) ────────────
async function resolverToken(segredo, { ip, tipo } = {}) {
  const bruto = String(segredo || '');
  if (!bruto.startsWith('tk_') || bruto.length < 20) return { ok: false, motivo: 'token_invalido' };

  const hash = hashToken(bruto);
  const agora = Date.now();

  let entrada = cache.get(hash);
  if (!entrada || entrada.exp <= agora) {
    const { data: linha, error } = await supabase
      .from('totem_estacao_tokens')
      .select('id, estacao_id, tipo, expira_em, revogado_em, linhagem')
      .eq('token_hash', hash).maybeSingle();
    if (error) throw error;
    if (!linha) return { ok: false, motivo: 'token_invalido' };

    const { data: est, error: e2 } = await supabase
      .from('totem_estacoes').select(SELECT_ESTACAO).eq('id', linha.estacao_id).maybeSingle();
    if (e2) throw e2;
    if (!est) return { ok: false, motivo: 'token_invalido' };

    entrada = { linha, estacao: est, exp: agora + CACHE_TTL_MS };
    cache.set(hash, entrada);
  }

  const { linha, estacao } = entrada;

  if (linha.revogado_em) return { ok: false, motivo: 'estacao_revogada' };
  if (linha.expira_em && new Date(linha.expira_em) <= new Date(agora)) return { ok: false, motivo: 'token_expirado' };
  if (!estacao.ativo || estacao.revogada_em) return { ok: false, motivo: 'estacao_revogada' };
  if (tipo && linha.tipo !== tipo) return { ok: false, motivo: 'token_invalido' };
  // ⚠️ O cerco de IP é conferido A CADA request, nunca no cache: o cache guarda
  // a linha, não a permissão daquele chamador.
  if (!ipDentroDoCerco(ip, estacao.ip_permitidos)) return { ok: false, motivo: 'ip_nao_permitido' };

  return { ok: true, estacao, token: linha };
}

// ── Resolução pela CONTA DE QUIOSQUE (o caminho do Totem Membro) ───────────
// As inscrições de evento vivem dentro do `/totem` (Totem Membro), que JÁ está
// autenticado por conta de quiosque (`profiles.is_membro_only` + cargo
// `totem-kiosk` · migration 20260703160000). Então não há nada a parear no
// navegador: a estação é resolvida no SERVIDOR a partir de `req.user.id`.
//
// ⚠️ A propriedade que importa continua valendo: `estacao_id` é ATRIBUÍDO pelo
// servidor, nunca declarado pelo cliente. Aceitar `estacao_id` do corpo do
// request faria qualquer pessoa dizer "sou o totem 3" e a conciliação do
// presencial atribuiria a cobrança ao equipamento errado.
//
// Devolve `null` quando a conta não é de nenhuma estação (o caso normal de
// qualquer usuário comum usando o sistema) — quem chama trata isso como
// "não veio de totem", não como erro.
const cacheConta = new Map();

async function estacaoDaConta(contaId) {
  if (!contaId) return null;

  const agora = Date.now();
  const cached = cacheConta.get(contaId);
  if (cached && cached.exp > agora) return cached.estacao;

  const { data, error } = await supabase
    .from('totem_estacoes').select(SELECT_ESTACAO)
    .eq('conta_id', contaId).maybeSingle();
  if (error) {
    // Best-effort: falha de consulta não pode derrubar uma inscrição. Quem
    // chama segue sem estação (a cobrança nasce sem `estacao_id`, que é
    // exatamente o estado de quem se inscreve pela web).
    console.warn('[totem-estacao] estacaoDaConta:', error.message);
    return null;
  }

  const viva = data && data.ativo && !data.revogada_em ? data : null;
  cacheConta.set(contaId, { estacao: viva, exp: agora + CACHE_TTL_MS });
  return viva;
}

// ── Heartbeat ──────────────────────────────────────────────────────────────
// Throttle: sem ele seria um UPDATE por request na tabela.
async function heartbeat(estacao, { ip, userAgent, versao } = {}) {
  const ultima = estacao.ultima_batida_em ? new Date(estacao.ultima_batida_em).getTime() : 0;
  if (Date.now() - ultima < CACHE_TTL_MS) return { ok: true, pulado: true };

  const { error } = await supabase.from('totem_estacoes').update({
    ultima_batida_em: new Date().toISOString(),
    ultimo_ip: ip || null,
    ultimo_user_agent: (userAgent || '').slice(0, 300) || null,
    versao_app: versao || estacao.versao_app || null,
  }).eq('id', estacao.id);
  if (error) return { ok: false, motivo: error.message };

  cache.clear(); cacheConta.clear();
  return { ok: true };
}

// ── Revogação ──────────────────────────────────────────────────────────────
async function revogarToken(tokenId, { por, motivo }) {
  const m = String(motivo || '').trim();
  if (m.length < 3) return { ok: false, motivo: 'motivo_obrigatorio' };
  const { data, error } = await supabase.from('totem_estacao_tokens')
    .update({ revogado_em: new Date().toISOString(), revogado_por: por || null, revogado_motivo: m })
    .eq('id', tokenId).is('revogado_em', null).select('id, estacao_id');
  if (error) throw error;
  cache.clear(); cacheConta.clear();
  return { ok: true, revogados: data?.length || 0 };
}

// Revoga a estação inteira: desliga a linha E mata todas as credenciais vivas.
// Desligar só a estação bastaria (o middleware confere `ativo`), mas deixar
// credencial viva pendurada numa estação morta é o tipo de resíduo que reaparece
// quando alguém reativa a estação meses depois.
async function revogarEstacao(estacaoId, { por, motivo }) {
  const m = String(motivo || '').trim();
  if (m.length < 3) return { ok: false, motivo: 'motivo_obrigatorio' };
  const agora = new Date().toISOString();

  const { error } = await supabase.from('totem_estacoes').update({
    ativo: false, revogada_em: agora, revogada_por: por || null, revogada_motivo: m,
  }).eq('id', estacaoId);
  if (error) throw error;

  await supabase.from('totem_estacao_tokens')
    .update({ revogado_em: agora, revogado_por: por || null, revogado_motivo: `estação revogada: ${m}` })
    .eq('estacao_id', estacaoId).is('revogado_em', null);

  cache.clear(); cacheConta.clear();
  return { ok: true };
}

// Projeção segura da estação pro cliente do totem: sem `ip_permitidos` (é
// configuração de segurança e não é da conta do dispositivo).
function publico(est) {
  if (!est) return null;
  return {
    id: est.id, codigo: est.codigo, nome: est.nome, local: est.local,
    finalidades: est.finalidades || [], evento_fixo_id: est.evento_fixo_id,
    tef_ativo: !!est.tef_ativo,
    tem_impressora: !!est.printer_target,
  };
}

function limparCache() { cache.clear(); cacheConta.clear(); }

module.exports = {
  hashToken, gerarPareamento, emitirToken, parear, resolverToken,
  // `estacaoDaConta` é o caminho do Totem Membro (conta de quiosque logada);
  // `resolverToken` sobrou pro AGENTE DO PINPAD (Fase 3), que não tem sessão.
  estacaoDaConta,
  heartbeat, revogarToken, revogarEstacao, publico, limparCache,
  gerarCodigo, // exportado pro teste (distribuição/alfabeto do código)
};
