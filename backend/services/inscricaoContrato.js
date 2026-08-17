// Contrato de Inscrição (F3.1 · specs em docs/modulo-inscricoes/) — utilidades
// ÚNICAS que toda porta pública de inscrição DEVE atravessar. Decisões do
// Marcos (D1–D9 + ajuste 28/07), aplicadas SÓ a inscrições novas — dado
// legado nunca é alterado nem re-validado:
//   nome completo em campo único, sem abreviação (split 1º token → nome,
//   resto → sobrenome onde a tabela exige) · telefone 10–11 dígitos ·
//   CPF com DV · e-mail · nascimento · sexo (masculino|feminino, NUNCA
//   "outro") · endereço fixo-opcional · termos LGPD com snapshot em
//   inscricao_consentimentos · opt-in WhatsApp explícito (default false).

const { supabase } = require('../utils/supabase');
const {
  cpfValido, normalizarCpf, normalizarTelefone, normalizarEmail,
  registrarObservacaoSegura,
} = require('./identidadeProgressiva');
const { acharOuCriarGuardado, acharMembroGuardado } = require('./membroMatch');
// Réguas PURAS de campo de contato (moradia nova em 06/08/2026 · ver comentário
// mais abaixo). Espelho de tirarCodigoPais de src/lib/inscricao.js — mudou lá,
// mude no util.
const {
  tirarCodigoPaisTelefone, emailValido, validarNascimento,
  CONECTIVOS_NOME, temAbreviacaoNome,
} = require('../utils/camposContato');

const SEXOS = ['masculino', 'feminino']; // D8 — nunca "outro"

// ——— Textos canônicos (fonte única; snapshot gravado no consentimento) ———
const TEXTOS = {
  termos_lgpd:
    'Autorizo a Igreja CBRio a tratar os dados informados neste formulário ' +
    '(incluindo endereço IP e navegador, para segurança) com a finalidade de ' +
    'organizar a atividade em que estou me inscrevendo e me comunicar sobre ela, ' +
    'conforme a LGPD. Posso solicitar acesso, correção ou exclusão dos meus dados ' +
    'a qualquer momento pelos canais da igreja.',
  menor_responsavel:
    'Declaro que sou pai, mãe ou responsável legal da(s) criança(s) informada(s) ' +
    'e autorizo o tratamento dos dados pessoais dela(s) (nome, data de nascimento) ' +
    'pela Igreja CBRio, exclusivamente para organização da apresentação de crianças ' +
    'e comunicação relacionada, conforme a LGPD (art. 14). Sei que posso solicitar ' +
    'acesso, correção ou exclusão desses dados a qualquer momento.',
  // ⚠️ Texto PRÓPRIO da inscrição em evento (17/08 · retiro 2027), e não uma
  // edição do de cima: aquele fala explicitamente de "apresentação de crianças",
  // e é o snapshot já gravado nos consentimentos daquela porta. Reescrevê-lo pra
  // servir aos dois faria a prova legal de uma porta descrever a outra.
  // O `tipo` gravado continua sendo `menor_responsavel` (é o vocabulário do
  // CHECK); o que muda é o TEXTO que a pessoa lê e que fica registrado.
  menor_responsavel_inscricao:
    'Declaro que sou o responsável legal pela pessoa inscrita, que ela é menor de ' +
    '18 anos, e autorizo a inscrição dela nesta atividade e o tratamento dos dados ' +
    'informados (dela e meus, como contato de emergência) pela Igreja CBRio, ' +
    'exclusivamente para organizar a atividade e me comunicar sobre ela, conforme a ' +
    'LGPD (art. 14). Sei que posso solicitar acesso, correção ou exclusão desses ' +
    'dados a qualquer momento pelos canais da igreja.',
  imagem:
    'Autorizo o uso de fotos do evento em que eu (ou a criança sob minha ' +
    'responsabilidade) apareça nas mídias da Igreja CBRio.',
  // Snapshot do item `whatsapp` da satélite — sem esta chave o consentimento
  // era gravado com texto VAZIO nas 7 portas (achado do sweep 28/07).
  whatsapp:
    'Aceito receber confirmações, lembretes e avisos desta inscrição pelo ' +
    'WhatsApp, no número informado. Posso pedir pra parar a qualquer momento.',
  aviso_optin: // D4 — exibido junto do checkbox de WhatsApp
    'Se você não marcar, não conseguiremos te enviar confirmações, lembretes e avisos pelo WhatsApp.',
};

// `CONECTIVOS_NOME` e `temAbreviacaoNome` MUDARAM DE CASA em 17/08/2026 (pra
// `utils/camposContato.js`, pelo mesmo motivo das três réguas citadas abaixo:
// entrar no gate de deploy). Seguem re-exportadas daqui — nenhuma das 7 portas
// muda de import, e o comportamento é idêntico.

// ⚠️ `validarNascimento`, `emailValido` e `tirarCodigoPaisTelefone` MUDARAM DE
// CASA em 06/08/2026 (auditoria do app, Onda 1): moraram aqui, mas este arquivo
// carrega o cliente do Supabase, então elas não podiam ser testadas no gate sem
// banco. Foram pra `utils/camposContato.js` (puras) e seguem sendo
// **re-exportadas daqui** — nenhuma das 7 portas muda de import.
// Comportamento idêntico; `validarNascimento` só ganhou um 2º parâmetro
// OPCIONAL (`hoje`) pra teste determinístico.

// D1 — regra determinística de split para tabelas com nome+sobrenome
function splitNomeCompleto(nomeCompleto) {
  const partes = String(nomeCompleto || '').trim().replace(/\s+/g, ' ').split(' ').filter(Boolean);
  return { nome: partes[0] || '', sobrenome: partes.slice(1).join(' ') };
}

function honeypotPreenchido(body) {
  return Boolean(String((body && body.website) || '').trim());
}


// Valida o bloco de campos padrão. Retorna { erros, valores } — erros vazio = ok.
// opts existe SÓ para exceções documentadas (ex.: walk-in do totem não exige
// nascimento); o default é o contrato pleno.

function validarCamposPadrao(body = {}, opts = {}) {
  const {
    exigirCpf = true, exigirEmail = true, exigirNascimento = true, exigirSexo = true,
  } = opts;
  const erros = {};

  const nomeCompleto = String(body.nome_completo ?? body.nome ?? '').trim().replace(/\s+/g, ' ');
  if (nomeCompleto.length < 5 || nomeCompleto.split(' ').length < 2) {
    erros.nome_completo = 'Informe o nome completo.';
  } else if (temAbreviacaoNome(nomeCompleto)) {
    erros.nome_completo = 'Escreva o nome completo, sem abreviações.';
  }

  // Normaliza o código do país ANTES de medir: cliente antigo (bundle em cache)
  // ou integração pode mandar com 55 na frente. Só remove quando o resto ainda
  // é telefone completo — DDD 55 (Santa Maria/RS) precisa passar intacto.
  const telefone = tirarCodigoPaisTelefone(String(body.telefone || '').replace(/\D/g, ''));
  if (telefone.length < 10 || telefone.length > 11) erros.telefone = 'Informe um telefone válido com DDD.';

  const cpf = normalizarCpf(body.cpf);
  if (exigirCpf && !cpf) erros.cpf = 'Informe um CPF válido.';

  const email = normalizarEmail(body.email);
  const emailOk = Boolean(email && emailValido(email));
  if (exigirEmail && !emailOk) erros.email = 'Informe um e-mail válido.';
  else if (!exigirEmail && body.email && !emailOk) erros.email = 'E-mail inválido.';

  const dataNascimento = validarNascimento(body.data_nascimento);
  if (exigirNascimento && !dataNascimento) erros.data_nascimento = 'Informe uma data de nascimento válida.';

  const sexo = String(body.sexo ?? body.genero ?? '').trim().toLowerCase();
  if (exigirSexo && !SEXOS.includes(sexo)) erros.sexo = 'Selecione masculino ou feminino.';

  const endereco = String(body.endereco || '').trim().slice(0, 300) || null; // fixo-opcional (28/07)
  const { nome, sobrenome } = splitNomeCompleto(nomeCompleto);

  return {
    erros,
    valores: {
      nomeCompleto,
      nome,
      sobrenome,
      telefone,
      cpf: cpf || null,
      email: emailOk ? email : null,
      dataNascimento: dataNascimento || null,
      sexo: SEXOS.includes(sexo) ? sexo : null,
      endereco,
    },
  };
}

// Funil de identidade da porta (Contrato de porta):
//   politica 'criar' → acharOuCriarGuardado (batismo/next: o evento VAI acontecer)
//   politica 'ligar' → acharMembroGuardado (portas com triagem humana) + observação
async function processarIdentidade({
  nomeCompleto, cpf, email, telefone, dataNascimento, genero,
  politica = 'ligar', status = 'visitante', origem, origemId = null,
  soChaveForte = false, extra = {},
}) {
  if (politica === 'criar') {
    const r = await acharOuCriarGuardado(
      // `genero` repassado: quem cria pessoa aqui é o matcher, e ele traduz o
      // vocabulário (M/F × masculino/feminino). Sem o repasse, o sexo que a
      // porta exige da pessoa nunca chegaria ao cadastro na criação.
      { cpf, email, telefone, nome: nomeCompleto, dataNascimento, genero, status, extra, origem, origemId },
      { soChaveForte },
    );
    return { membroId: (r && r.membro_id) || null, matchedBy: (r && r.matched_by) || null, created: Boolean(r && r.created) };
  }
  const r = await acharMembroGuardado(
    { cpf, email, telefone, nome: nomeCompleto, dataNascimento },
    { soChaveForte },
  );
  const membroId = (r && r.membro_id) || null;
  try {
    await registrarObservacaoSegura({
      membroId, origem, origemId, nome: nomeCompleto, cpf, telefone, email, dataNascimento,
    });
  } catch (e) {
    console.error('[inscricaoContrato] observação de identidade falhou:', e.message);
  }
  return { membroId, matchedBy: (r && r.matched_by) || null, created: false };
}

// Grava os atos de consentimento (best-effort: falha loga e não derruba a inscrição).
// itens: [{ tipo: 'termos_lgpd'|'imagem'|'menor_responsavel'|'whatsapp', aceito: bool, texto? }]
async function registrarConsentimentos({ porta, refId, membroId = null, ip = null, userAgent = null, itens = [] }) {
  const linhas = (itens || [])
    .filter((i) => i && i.tipo)
    .map((i) => ({
      porta,
      ref_id: refId,
      membro_id: membroId,
      tipo: i.tipo,
      texto: String(i.texto ?? TEXTOS[i.tipo] ?? ''),
      aceito: Boolean(i.aceito),
      ip_origem: ip ? String(ip).slice(0, 100) : null,
      user_agent: userAgent ? String(userAgent).slice(0, 300) : null,
    }));
  if (!linhas.length) return { ok: true, gravados: 0 };
  const { error } = await supabase.from('inscricao_consentimentos').insert(linhas);
  if (error) {
    console.error('[inscricaoContrato] gravação de consentimentos falhou:', error.message);
    return { ok: false, gravados: 0 };
  }
  return { ok: true, gravados: linhas.length };
}

module.exports = {
  tirarCodigoPaisTelefone,
  SEXOS,
  TEXTOS,
  temAbreviacaoNome,
  validarNascimento,
  splitNomeCompleto,
  honeypotPreenchido,
  emailValido,
  validarCamposPadrao,
  processarIdentidade,
  registrarConsentimentos,
  // conveniência (re-export da fonte canônica)
  cpfValido,
  normalizarCpf,
  normalizarTelefone,
  normalizarEmail,
};
