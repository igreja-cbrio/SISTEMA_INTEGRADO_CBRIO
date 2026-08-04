// ============================================================================
// Identidade da conta do APP · vincular a conta ao cadastro REAL da pessoa
// (Marcos · 04/08/2026 — "o app vai ser aberto pelos líderes, e quero
// aproveitar pra pegar o cadastro de quem não temos").
//
// Dois caminhos, o MESMO destino (um `mem_membros` real, via matcher canônico):
//
//  A) RÁPIDO por CPF — pra quem já está na base (o caso dos líderes).
//     ⚠️ **CPF NÃO É SENHA.** Ele está em nota fiscal, cadastro de loja,
//     planilha da igreja. Vincular a conta só porque alguém digitou um CPF
//     entregaria a essa pessoa o grupo, os FILHOS no Kids e o histórico de
//     contribuição do dono do CPF. Então o CPF só IDENTIFICA: o código vai
//     pro telefone QUE JÁ ESTÁ NO CADASTRO (nunca pra um número digitado
//     agora) e quem prova posse daquele número é vinculado.
//
//  B) COMPLETO — formulário com os campos do Contrato de porta, pra quem não
//     está na base (ou está sem telefone). Passa pelo matcher canônico, então
//     não nasce duplicata e o contato acumula em mem_contatos.
//
// Nos dois: se a conta estava pendurada num cadastro FANTASMA (o criado pelo
// gatilho de auth.users, sem CPF/telefone e com nome = prefixo do e-mail), o
// fantasma é FUNDIDO no cadastro real — senão a base fica com os dois.
// ============================================================================
const crypto = require('crypto');
const { supabase } = require('../utils/supabase');
const {
  acharMembroGuardado, acharOuCriarGuardado, ehNomeDerivadoDeEmail,
  ehNomePlaceholder, normalizarCpf, normalizarTelefone, registrarContatoDaPorta,
} = require('./membroMatch');
const { cpfValido, validarCamposPadrao } = require('./inscricaoContrato');
const { notificar } = require('./notificar');
const wpp = require('./whatsappService');

const CODIGO_TTL_MIN = 10;
const MAX_TENTATIVAS = 5;
// Teto por telefone/dia — um CPF vazado não vira metralhadora de mensagens no
// número de outra pessoa (o dono nem pediu nada).
const MAX_ENVIOS_DIA_POR_TELEFONE = 5;
// Template de AUTENTICAÇÃO na Meta (categoria authentication é a exigida pra
// código). Sem a env, o envio por WhatsApp fica no-op e o endpoint devolve
// `canal: null` — a tela cai no formulário completo em vez de prometer um
// código que nunca chega.
const TPL_CODIGO = process.env.WHATSAPP_TEMPLATE_APP_CODIGO || null;

// Deploy em 2 etapas: se a migration 20260804200000 ainda não foi aplicada, o
// PostgREST recusa a query da tabela nova. Nesse caso o caminho RÁPIDO se
// declara indisponível (`sem_canal`) e a tela cai no formulário completo — que
// não depende dela. Nunca 500 opaco. (Lição `parcelas_max`.)
const RE_SCHEMA_AUSENTE = /(does not exist|could not find|schema cache|42703|42P01|PGRST20[24])/i;
const schemaAusente = (e) =>
  RE_SCHEMA_AUSENTE.test(`${e?.code || ''} ${e?.message || ''} ${e?.details || ''}`);

const hashCodigo = (codigo, salId) =>
  crypto.createHash('sha256').update(`${codigo}:${salId}`).digest('hex');

// 6 dígitos por crypto (Math.random não serve pra código de acesso).
function gerarCodigo() {
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
}

// "(21) 99512-8249" → "(21) *****-8249": confirma pra pessoa QUAL número é,
// sem entregar o telefone de ninguém a quem digitou um CPF alheio.
function mascararTelefone(raw) {
  const d = String(raw || '').replace(/\D/g, '');
  if (d.length < 8) return null;
  const ddd = d.length >= 10 ? d.slice(-11, -9) || d.slice(0, 2) : null;
  const fim = d.slice(-4);
  return ddd ? `(${ddd}) *****-${fim}` : `*****-${fim}`;
}

// "Marcos Paulo Domingues de Almeida" → "Marcos P. D. de A." (mesma razão do
// telefone). Partículas ficam inteiras — abreviá-las ("d.") só deixa ilegível.
const PARTICULAS = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'del', 'di', 'van', 'von']);
function mascararNome(nome) {
  const partes = String(nome || '').trim().split(/\s+/).filter(Boolean);
  if (!partes.length) return null;
  return [
    partes[0],
    ...partes.slice(1).map(p => (PARTICULAS.has(p.toLowerCase()) ? p : `${p[0].toUpperCase()}.`)),
  ].join(' ');
}

// O cadastro é FANTASMA se veio do gatilho do auth e não tem chave nenhuma —
// nesse caso pode ser fundido no real sem perder informação.
async function ehCadastroFantasma(membroId, email) {
  if (!membroId) return false;
  const { data: m } = await supabase.from('mem_membros')
    .select('id, nome, cpf, telefone, data_nascimento, origem_cadastro')
    .eq('id', membroId).maybeSingle();
  if (!m) return false;
  if (m.cpf || m.telefone || m.data_nascimento) return false;
  const nomeFraco = ehNomePlaceholder(m.nome)
    || (email ? ehNomeDerivadoDeEmail(m.nome, email) : false);
  return m.origem_cadastro === 'auth' || nomeFraco;
}

// Funde o fantasma no cadastro real (repointa FKs + loga em mem_merge_log).
// Best-effort: se falhar, o vínculo do profile já foi corrigido — a duplicata
// sobra pra fila das Entradas, que é onde humano decide.
async function fundirFantasma(fantasmaId, realId, quem) {
  if (!fantasmaId || !realId || fantasmaId === realId) return { fundido: false };
  try {
    // ⚠️ params com prefixo p_ (assinatura de 20260518170000) — sem isso o
    // PostgREST não acha a função e o fantasma fica na base pra sempre.
    const { error } = await supabase.rpc('merge_membros', {
      p_keep_id: realId, p_merge_ids: [fantasmaId],
      p_feito_por: quem || null,
      p_observacao: 'App · conta vinculada ao cadastro real (fantasma do gatilho de auth)',
    });
    if (error) throw error;
    return { fundido: true };
  } catch (e) {
    console.error('[appIdentidade] merge do fantasma falhou:', e.message);
    return { fundido: false, erro: e.message };
  }
}

// Aponta profiles.membro_id pro cadastro real + funde fantasma anterior.
async function vincularProfile({ authUserId, email, membroId }) {
  const { data: prof } = await supabase.from('profiles')
    .select('id, membro_id').eq('id', authUserId).maybeSingle();
  const anterior = prof?.membro_id || null;
  const { error } = await supabase.from('profiles')
    .update({ membro_id: membroId }).eq('id', authUserId);
  if (error) throw error;
  let fusao = { fundido: false };
  if (anterior && anterior !== membroId && await ehCadastroFantasma(anterior, email)) {
    fusao = await fundirFantasma(anterior, membroId, authUserId);
  }
  return { anterior, fusao };
}

// ── A · CPF identifica e o código vai pro telefone DO CADASTRO ──────────────
async function identificarPorCpf({ cpf, authUserId, email, ip }) {
  const limpo = normalizarCpf(cpf);
  if (!limpo || !cpfValido(limpo)) {
    return { ok: false, status: 400, codigo: 'cpf_invalido', error: 'Confira o CPF digitado.' };
  }
  // Busca SÓ por chave forte (CPF) — de propósito: aqui não queremos o
  // "achou por telefone/nome" do matcher, senão o CPF deixaria de ser a régua.
  const { data: achados } = await supabase.from('mem_membros')
    .select('id, nome, telefone, email').eq('cpf', limpo).is('deleted_at', null).limit(2);
  const membro = (achados || [])[0] || null;

  // ⚠️ Não distinguimos "não existe" de "existe sem telefone" pra fora além do
  // necessário: a resposta guia a UI, não confirma cadastro de terceiro.
  if (!membro) {
    return { ok: true, encontrado: false, motivo: 'nao_encontrado' };
  }
  const tel = normalizarTelefone(membro.telefone);
  if (!tel) {
    return { ok: true, encontrado: true, pode_confirmar: false, motivo: 'sem_telefone',
      nome_mascarado: mascararNome(membro.nome) };
  }
  if (!TPL_CODIGO || !wpp.configurado?.()) {
    return { ok: true, encontrado: true, pode_confirmar: false, motivo: 'sem_canal',
      nome_mascarado: mascararNome(membro.nome) };
  }

  // Teto por telefone/dia (o dono do número não pediu nada).
  const desde = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { count, error: eCount } = await supabase.from('app_verificacoes')
    .select('*', { count: 'exact', head: true })
    .eq('telefone', tel).gte('created_at', desde);
  if (eCount) {
    if (schemaAusente(eCount)) {
      console.error('[appIdentidade] migration pendente — caminho rápido off');
      return { ok: true, encontrado: true, pode_confirmar: false, motivo: 'sem_canal',
        nome_mascarado: mascararNome(membro.nome) };
    }
    throw eCount;
  }
  if ((count || 0) >= MAX_ENVIOS_DIA_POR_TELEFONE) {
    return { ok: false, status: 429, codigo: 'muitos_envios',
      error: 'Já enviamos vários códigos pra este número hoje. Tente amanhã ou preencha seus dados.' };
  }

  // Uma verificação aberta por conta: fecha a anterior (UNIQUE parcial).
  await supabase.from('app_verificacoes')
    .update({ consumido_em: new Date().toISOString() })
    .eq('auth_user_id', authUserId).is('consumido_em', null);

  const codigo = gerarCodigo();
  const { data: linha, error: eIns } = await supabase.from('app_verificacoes').insert({
    auth_user_id: authUserId, membro_id: membro.id, telefone: tel,
    codigo_hash: 'pendente',
    expira_em: new Date(Date.now() + CODIGO_TTL_MIN * 60 * 1000).toISOString(),
    canal: 'whatsapp', ip: ip || null,
  }).select('id').single();
  if (eIns) throw eIns;
  // O hash usa o id da linha como sal → grava depois do insert.
  await supabase.from('app_verificacoes')
    .update({ codigo_hash: hashCodigo(codigo, linha.id) }).eq('id', linha.id);

  // ⚠️ sendTemplate devolve { sent, reason } (não { ok }) — checar `sent`.
  // Código NUNCA vai pela fila `whatsapp_envios`: ela guarda os params em
  // texto (o código ficaria legível no banco) e faz retry/backoff, que pra
  // código de 10 min é entrega atrasada e inútil. Envio direto, na hora.
  const envio = await wpp.sendTemplate(tel, TPL_CODIGO, 'pt_BR', [codigo])
    .catch(e => ({ sent: false, reason: e.message }));
  if (!envio || envio.sent === false) {
    console.error('[appIdentidade] envio do código falhou:', envio?.reason);
    return { ok: false, status: 502, codigo: 'envio_falhou',
      error: 'Não conseguimos enviar o código agora. Tente de novo ou preencha seus dados.' };
  }

  return {
    ok: true, encontrado: true, pode_confirmar: true,
    verificacao_id: linha.id,
    nome_mascarado: mascararNome(membro.nome),
    telefone_mascarado: mascararTelefone(tel),
    expira_em_min: CODIGO_TTL_MIN,
    canal: 'whatsapp',
  };
}

async function confirmarCodigo({ verificacaoId, codigo, authUserId, email }) {
  const cod = String(codigo || '').replace(/\D/g, '');
  if (cod.length !== 6) {
    return { ok: false, status: 400, codigo: 'codigo_invalido', error: 'O código tem 6 números.' };
  }
  const { data: v } = await supabase.from('app_verificacoes')
    .select('*').eq('id', verificacaoId).maybeSingle();
  // Erro genérico de propósito (não dizer "essa verificação é de outra conta").
  if (!v || v.auth_user_id !== authUserId || v.consumido_em) {
    return { ok: false, status: 400, codigo: 'nao_encontrada', error: 'Pedido de código inválido. Comece de novo.' };
  }
  if (new Date(v.expira_em).getTime() < Date.now()) {
    return { ok: false, status: 400, codigo: 'expirado', error: 'O código expirou. Peça um novo.' };
  }
  if ((v.tentativas || 0) >= MAX_TENTATIVAS) {
    return { ok: false, status: 429, codigo: 'tentativas', error: 'Muitas tentativas. Peça um código novo.' };
  }
  if (hashCodigo(cod, v.id) !== v.codigo_hash) {
    await supabase.from('app_verificacoes')
      .update({ tentativas: (v.tentativas || 0) + 1 }).eq('id', v.id);
    const restam = MAX_TENTATIVAS - (v.tentativas || 0) - 1;
    return { ok: false, status: 400, codigo: 'codigo_errado',
      error: restam > 0 ? `Código não confere. Você ainda pode tentar ${restam}x.` : 'Código não confere. Peça um novo.' };
  }

  await supabase.from('app_verificacoes')
    .update({ consumido_em: new Date().toISOString() }).eq('id', v.id);
  const { fusao } = await vincularProfile({ authUserId, email, membroId: v.membro_id });
  // O e-mail da conta do app acumula como contato secundário (é por ele que a
  // próxima porta vai reencontrar a pessoa). Assinatura POSICIONAL
  // (membroId, {telefone,email}, fonte) e não-async — não dá pra await.
  if (email) {
    try { registrarContatoDaPorta(v.membro_id, { email }, 'app_login_cpf'); } catch { /* acessório */ }
  }
  const { data: m } = await supabase.from('mem_membros')
    .select('id, nome, telefone, email, cpf, data_nascimento').eq('id', v.membro_id).maybeSingle();
  return { ok: true, membro: m || null, fantasma_fundido: !!fusao.fundido };
}

// ── B · formulário completo (Contrato de porta) ─────────────────────────────
async function completarCadastro({ payload, authUserId, email, ip, userAgent }) {
  // CPF e sexo NÃO são exigidos aqui (decisão: o app não pode travar a entrada
  // de quem não tem o CPF em mãos); nome completo, telefone, e-mail e
  // nascimento sim — é o mínimo que faz o matcher reconhecer a pessoa depois.
  const { erros, valores } = validarCamposPadrao({
    nome_completo: payload?.nome_completo,
    telefone: payload?.telefone,
    email: payload?.email || email,
    cpf: payload?.cpf,
    data_nascimento: payload?.data_nascimento,
    sexo: payload?.sexo,
  }, { exigirCpf: false, exigirSexo: false, exigirEmail: true, exigirNascimento: true });
  const campos = Object.keys(erros || {});
  if (campos.length) {
    return { ok: false, status: 400, codigo: 'campos', campo: campos[0], error: erros[campos[0]], erros };
  }
  const d = valores;

  // Matcher canônico: acha a pessoa por CPF → e-mail+nome → telefone+nome →
  // nascimento+nome; só cria se realmente não existir. É o que impede a
  // duplicata que o gatilho de auth criava.
  const r = await acharOuCriarGuardado({
    cpf: d.cpf || null, email: d.email, telefone: d.telefone, nome: d.nomeCompleto,
    dataNascimento: d.dataNascimento || null,
    status: 'visitante',
    origem: 'app_onboarding',
    origemId: authUserId,
  });
  const membroId = r?.membro_id || null;
  if (!membroId) {
    return { ok: false, status: 500, codigo: 'sem_membro', error: 'Não foi possível salvar seus dados agora.' };
  }
  const { fusao } = await vincularProfile({ authUserId, email, membroId });

  // Cadastro NOVO pelo app é o que o Marcos quer aproveitar ("pegar o cadastro
  // de quem não temos") — avisa a equipe pra conferir/enriquecer. Conflito de
  // identidade em si o matcher já enfileira em identidade_pendencias (fila
  // humana em Entradas), nunca decide sozinho.
  if (r.created) {
    notificar({
      modulo: 'membresia', tipo: 'cadastro_app',
      titulo: `Cadastro novo pelo app: ${d.nomeCompleto}`,
      mensagem: 'A pessoa se cadastrou pelo app (nome, telefone, e-mail e nascimento). Confira em Membresia.',
      link: '/ministerial/membresia', severidade: 'info',
      chaveDedup: `cadastro_app_${membroId}`,
    }).catch(() => {});
  }
  const { data: m } = await supabase.from('mem_membros')
    .select('id, nome, telefone, email, cpf, data_nascimento').eq('id', membroId).maybeSingle();
  return { ok: true, membro: m || null, criado: !!r.created, fantasma_fundido: !!fusao.fundido };
}

module.exports = {
  identificarPorCpf,
  confirmarCodigo,
  completarCadastro,
  // exportados pra teste
  mascararTelefone,
  mascararNome,
  CODIGO_TTL_MIN,
};
