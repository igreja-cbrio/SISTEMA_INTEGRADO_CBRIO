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
const { enviarEmail, isConfigured: emailConfigurado } = require('./email');

const CODIGO_TTL_MIN = 10;
const MAX_TENTATIVAS = 5;
// Teto por DESTINO/dia — um CPF vazado não vira metralhadora de mensagens na
// caixa de outra pessoa (o dono nem pediu nada).
const MAX_ENVIOS_DIA_POR_DESTINO = 5;

// ⚠️ CANAL = E-MAIL (04/08/2026). A Meta RECUSOU a categoria "Autenticação"
// pra nossa conta do WhatsApp Business, e código de uso único não pode ir em
// template utility (violação de política + derruba a nota de qualidade do
// número que fala com os 87 líderes). A LEI do fluxo não mudou: o código vai
// pro contato QUE JÁ ESTÁ NO CADASTRO, nunca pra um endereço digitado agora.

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

// "marcospaulo.da@gmail.com" → "mar***.da@gmail.com": a pessoa reconhece a
// própria caixa sem que o endereço de terceiro seja entregue a quem digitou um
// CPF alheio (o domínio fica visível porque é o que ajuda a reconhecer).
function mascararEmail(raw) {
  const email = String(raw || '').trim().toLowerCase();
  const at = email.lastIndexOf('@');
  if (at < 1) return null;
  const local = email.slice(0, at);
  const dominio = email.slice(at);
  if (local.length <= 4) return `${local[0]}***${dominio}`;
  return `${local.slice(0, 3)}***${local.slice(-2)}${dominio}`;
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
  const semCanal = (motivo) => ({
    ok: true, encontrado: true, pode_confirmar: false, motivo,
    nome_mascarado: mascararNome(membro.nome),
  });

  const emailCadastro = String(membro.email || '').trim().toLowerCase();
  if (!emailCadastro) return semCanal('sem_email');
  if (!emailConfigurado()) return semCanal('sem_canal');

  // ⚠️ E-MAIL COMPARTILHADO EM FAMÍLIA não serve como prova de posse: mãe e
  // filho na mesma caixa significaria o filho digitando o CPF da mãe, lendo o
  // código e vendo as CONTRIBUIÇÕES dela. Nesse caso o caminho rápido se
  // recusa e a pessoa vai pro formulário — que passa pelo matcher (nome+e-mail)
  // e cai no cadastro DELA, não no da mãe.
  const { data: mesmoEmail } = await supabase.from('mem_membros')
    .select('id').ilike('email', emailCadastro).is('deleted_at', null).neq('id', membro.id).limit(1);
  if (mesmoEmail && mesmoEmail.length) return semCanal('email_compartilhado');

  // Teto por destino/dia (o dono da caixa não pediu nada).
  const desde = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { count, error: eCount } = await supabase.from('app_verificacoes')
    .select('*', { count: 'exact', head: true })
    .eq('email', emailCadastro).gte('created_at', desde);
  if (eCount) {
    if (schemaAusente(eCount)) {
      console.error('[appIdentidade] migration pendente — caminho rápido off');
      return semCanal('sem_canal');
    }
    throw eCount;
  }
  if ((count || 0) >= MAX_ENVIOS_DIA_POR_DESTINO) {
    return { ok: false, status: 429, codigo: 'muitos_envios',
      error: 'Já enviamos vários códigos pra este e-mail hoje. Tente amanhã ou preencha seus dados.' };
  }

  // Uma verificação aberta por conta: fecha a anterior (UNIQUE parcial).
  await supabase.from('app_verificacoes')
    .update({ consumido_em: new Date().toISOString() })
    .eq('auth_user_id', authUserId).is('consumido_em', null);

  const codigo = gerarCodigo();
  const { data: linha, error: eIns } = await supabase.from('app_verificacoes').insert({
    auth_user_id: authUserId, membro_id: membro.id,
    email: emailCadastro,
    telefone: normalizarTelefone(membro.telefone) || null, // snapshot, não é destino
    codigo_hash: 'pendente',
    expira_em: new Date(Date.now() + CODIGO_TTL_MIN * 60 * 1000).toISOString(),
    canal: 'email', ip: ip || null,
  }).select('id').single();
  if (eIns) throw eIns;
  // O hash usa o id da linha como sal → grava depois do insert.
  await supabase.from('app_verificacoes')
    .update({ codigo_hash: hashCodigo(codigo, linha.id) }).eq('id', linha.id);

  // Envio DIRETO (e-mail não tem fila neste projeto) e sem log do código.
  const envio = await enviarEmail({
    to: emailCadastro,
    subject: `${codigo} é seu código de acesso · CBRio`,
    text: `Seu código de verificação é ${codigo}.\n\n`
      + `Use no app da CBRio pra confirmar que é você. Por segurança, não compartilhe este código.\n`
      + `Expira em ${CODIGO_TTL_MIN} minutos.\n\n`
      + `Se você não pediu, ignore este e-mail — nada muda na sua conta.`,
    html: `<div style="font-family:system-ui,Segoe UI,Roboto,sans-serif;max-width:480px">
      <p style="font-size:15px;color:#334">Seu código de verificação é:</p>
      <p style="font-size:34px;font-weight:800;letter-spacing:6px;color:#00839D;margin:12px 0">${codigo}</p>
      <p style="font-size:14px;color:#556">Use no app da CBRio pra confirmar que é você.
      Por segurança, não compartilhe este código. Expira em ${CODIGO_TTL_MIN} minutos.</p>
      <p style="font-size:12px;color:#889">Se você não pediu, ignore este e-mail — nada muda na sua conta.</p>
    </div>`,
    fromName: 'CBRio',
  }).catch(e => ({ ok: false, error: e.message }));
  if (!envio?.ok) {
    console.error('[appIdentidade] envio do código falhou:', envio?.error);
    return { ok: false, status: 502, codigo: 'envio_falhou',
      error: 'Não conseguimos enviar o código agora. Tente de novo ou preencha seus dados.' };
  }

  return {
    ok: true, encontrado: true, pode_confirmar: true,
    verificacao_id: linha.id,
    nome_mascarado: mascararNome(membro.nome),
    email_mascarado: mascararEmail(emailCadastro),
    expira_em_min: CODIGO_TTL_MIN,
    canal: 'email',
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

  // ⚠️⚠️ CARIMBA A CONFIRMAÇÃO TAMBÉM AQUI (conserto de 06/08 · o Marcos ficou
  // TRANCADO FORA do app por causa disto). Quando liguei o gate em 05/08, só o
  // FORMULÁRIO marcava `app_ficha_confirmada_em` — então quem provava identidade
  // pelo caminho rápido (CPF → código no e-mail) continuava com a marca nula,
  // `completo` seguia false e o portão devolvia a pessoa pra tela de cadastro:
  // **beco sem saída por construção**.
  // E é legítimo marcar aqui: ler o código enviado ao e-mail DO CADASTRO é prova
  // de POSSE — mais forte que digitar um formulário, que qualquer um digita.
  // ⚠️ Isto NÃO libera acesso sozinho: `completo` continua exigindo a ficha
  // fechada (telefone, nascimento, CPF, sexo). Quem prova identidade mas tem
  // cadastro incompleto vai pro formulário — agora já com os campos preenchidos,
  // porque a identidade deixou de ser palpite.
  const { error: eMarca } = await supabase.from('profiles')
    .update({ app_ficha_confirmada_em: new Date().toISOString() })
    .eq('id', authUserId);
  if (eMarca) console.warn('[appIdentidade] marcar app_ficha_confirmada_em (cpf):', eMarca.message);
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

// ⚠️⚠️ CONTAS DE REVISÃO DA LOJA · a ÚNICA isenção do gate de CPF (05/08/2026)
//
// Decisão do Marcos: "todas as pessoas que entrarem no sistema devem completar o
// cadastro antes; após completar elas acessam normalmente". Gate LIGADO.
//
// O problema que esta lista resolve: o revisor da Apple/Google **não tem CPF
// brasileiro**. Com o gate ligado sem isenção, ele trava na tela de cadastro e o
// build é recusado com "não conseguimos completar o registro" — a rejeição mais
// comum de app com login. Isso não é bug de usuário: bloqueia o release inteiro.
//
// ⚠️ E POR QUE NÃO É SÓ PÔR UM CPF NESSAS CONTAS: CPF com dígito verificador
// válido PERTENCE A ALGUÉM REAL, e é a chave MAIS FORTE do matcher — a primeira
// vez que essa pessoa preenchesse um formulário, ela seria ligada à conta de
// revisão. Uma delas já teve um CPF DV-válido e foi anulado por isso.
//
// ⚠️ São contas declaradas à loja, não pessoas (ver `mem_membros.observacoes`).
// Não acrescentar e-mail de gente aqui — seria criar um caminho pra entrar no app
// sem cadastro, que é exatamente o que o gate existe pra impedir.
const CONTAS_REVISAO_LOJA = new Set([
  'apple.review@cbrio.com.br',
  'appstore.review@cbrio.app',
  'appstore.staff@cbrio.app',
]);

/** É conta de revisão de loja? (isenta do gate de CPF/sexo, e SÓ dele) */
function contaDeRevisaoLoja(email) {
  return CONTAS_REVISAO_LOJA.has(String(email || '').trim().toLowerCase());
}

// ── B · formulário completo (Contrato de porta) ─────────────────────────────
async function completarCadastro({ payload, authUserId, email, ip, userAgent }) {
  // ⚠️ CPF e SEXO **SÃO exigidos** (gate ligado por decisão do Marcos em 05/08 ·
  // a tela já manda os dois campos). A única isenção é conta de revisão de loja —
  // o revisor não tem CPF brasileiro e travaria no portão, o que recusa o build.
  // (Este comentário dizia o contrário até 05/08, descrevendo o estado antigo:
  // comentário desatualizado engana a próxima sessão mais do que ajuda.)
  const { erros, valores } = validarCamposPadrao({
    nome_completo: payload?.nome_completo,
    telefone: payload?.telefone,
    email: payload?.email || email,
    cpf: payload?.cpf,
    data_nascimento: payload?.data_nascimento,
    sexo: payload?.sexo,
  }, { exigirCpf: !contaDeRevisaoLoja(email), exigirSexo: !contaDeRevisaoLoja(email), exigirEmail: true, exigirNascimento: true });
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

  // ⚠️ `frequenta_area` (AMI/Bridge) vinha do metadata do signup e o GATILHO
  // gravava. Desde 06/08 o gatilho não escreve mais em `mem_membros` (o vínculo
  // passou a ser feito aqui, com a ficha na mão · migration 20260806120000), então
  // é aqui que esse dado é aplicado — senão a escolha da pessoa no cadastro do app
  // seria descartada em silêncio, que é o bug do CPF do censo se repetindo.
  // Best-effort e SÓ ONDE ESTÁ VAZIO: falha na leitura do metadata não pode
  // derrubar um cadastro que já foi salvo.
  try {
    const { data: au } = await supabase.auth.admin.getUserById(authUserId);
    const freq = au?.user?.user_metadata?.frequenta_area;
    if (freq === 'ami' || freq === 'bridge') {
      await supabase.from('mem_membros')
        .update({ frequenta_area: freq })
        .eq('id', membroId).is('frequenta_area', null).is('deleted_at', null);
    }
  } catch (e) {
    console.warn('[appIdentidade] frequenta_area do metadata:', e.message);
  }

  // ⚠️ O matcher (`acharOuCriarGuardado`) não escreve `genero` — ele resolve
  // IDENTIDADE, não preenche cadastro. Sem este UPDATE o sexo seria validado e
  // DESCARTADO: a pessoa preencheria, o endpoint responderia ok, e o
  // `/identidade/status` continuaria dizendo que falta sexo — ela cairia na tela
  // de completar cadastro pra sempre. É exatamente o bug que o CPF do censo teve
  // em 04/08 (validado, aceito, nunca gravado).
  // Preenche SÓ ONDE ESTÁ VAZIO: o app não sobrescreve o que a equipe corrigiu.
  if (d.sexo) {
    const { error: eSexo } = await supabase.from('mem_membros')
      .update({ genero: d.sexo })
      .eq('id', membroId)
      .is('genero', null)
      .is('deleted_at', null);
    if (eSexo) console.warn('[appIdentidade] gravar genero:', eSexo.message);
  }

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
  // ⚠️⚠️ A MARCA DA CONFIRMAÇÃO (Marcos · 05/08): daqui pra frente o gate do app
  // só libera quem PASSOU POR AQUI. Sem esta linha, o `/identidade/status`
  // continuaria pedindo a ficha pra sempre — a pessoa preencheria em loop.
  // ⚠️ Fica em `profiles` (a CONTA), não em `mem_membros`: duas contas ligadas ao
  // mesmo cadastro não herdam a confirmação uma da outra.
  // ⚠️ Se a coluna não existir (migration não aplicada), o status também falha
  // OPEN — os dois lados degradam juntos pro comportamento antigo, sem loop.
  const { error: eMarca } = await supabase.from('profiles')
    .update({ app_ficha_confirmada_em: new Date().toISOString() })
    .eq('id', authUserId);
  if (eMarca) console.warn('[appIdentidade] marcar app_ficha_confirmada_em:', eMarca.message);

  const { data: m } = await supabase.from('mem_membros')
    .select('id, nome, telefone, email, cpf, data_nascimento').eq('id', membroId).maybeSingle();
  return { ok: true, membro: m || null, criado: !!r.created, fantasma_fundido: !!fusao.fundido };
}

module.exports = {
  contaDeRevisaoLoja,
  identificarPorCpf,
  confirmarCodigo,
  completarCadastro,
  // exportados pra teste
  mascararTelefone,
  mascararEmail,
  mascararNome,
  CODIGO_TTL_MIN,
};
