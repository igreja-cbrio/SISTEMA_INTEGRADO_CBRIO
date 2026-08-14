// ════════════════════════════════════════════════════════════════════════════
//  MEMBRESIA · o cadastro pendente está pronto para aprovação AUTOMÁTICA?
//
//  Pedido do Matheus (04/08): aprovação em massa na fila de cadastros, "mas o
//  sistema deve ter uma inteligência para ver se a pessoa está com os dados
//  obrigatórios preenchidos; se alguém não estiver, não vai aprovar essas
//  pessoas e fica para aprovação manual mesmo".
//
//  ⚠️ A régua é a MESMA do Contrato de Inscrição (nome completo sem abreviação ·
//     telefone 10-11 dígitos · CPF com DV · e-mail · nascimento válido · sexo ·
//     termos LGPD). Não inventar exigência nova aqui: se o formulário público
//     aceitou, a fila não pode exigir mais — senão o cadastro entra e nunca sai
//     da fila, e ninguém entende por quê.
//
//  ⚠️ E o inverso também vale: aprovar em LOTE não pode ser mais permissivo que
//     aprovar na mão. Este arquivo só decide o que pode ser aprovado SEM
//     ninguém olhar; tudo que ele recusa continua aprovável manualmente, com a
//     pessoa vendo os dados na tela. Nada fica bloqueado — fica pendente de
//     gente, que é o pedido.
// ════════════════════════════════════════════════════════════════════════════

const { cpfValido } = require('./cpf');
const { telefoneAlcancavel } = require('../services/contatoPessoa');

// Rótulos exibidos na tela. Chave curta pro payload, texto pra gente ler.
const FALTA = {
  nome: 'nome completo',
  cpf: 'CPF válido',
  telefone: 'telefone válido',
  email: 'e-mail',
  nascimento: 'data de nascimento',
  genero: 'sexo',
  termos: 'aceite dos termos (LGPD)',
};

// Motivos que NÃO são campo em falta — são decisão que exige uma pessoa.
const BLOQUEIO = {
  status: 'não está pendente',
  duplicado: 'possível duplicado — precisa de conferência',
};

/** Nome completo sem abreviação: 2+ tokens e nenhum token de 1 letra. */
function nomeCompleto(nome) {
  const limpo = String(nome || '').trim().replace(/\s+/g, ' ');
  if (!limpo) return false;
  const tokens = limpo.split(' ');
  if (tokens.length < 2) return false;
  // "Maria M. Silva" → o "M." é abreviação; o Contrato de Inscrição a proíbe.
  return !tokens.some(t => t.replace(/\./g, '').length < 2);
}

function emailOk(email) {
  const e = String(email || '').trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
}

/**
 * Nascimento plausível.
 * ⚠️ `hoje` é INJETADO: teste que lê o relógio da máquina foi o que mordeu no
 *    faixaEtaria.test.ts (depois das 21h BRT o cálculo caía um ano).
 * ⚠️ Parse com T12:00 LOCAL: `new Date('2000-01-01')` é meia-noite UTC, que no
 *    Rio é o dia anterior — no limiar isso muda a idade.
 */
function nascimentoOk(iso, hoje = new Date()) {
  const s = String(iso || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T12:00:00`);
  if (Number.isNaN(d.getTime())) return false;
  // Data inexistente (31/02) que o Date normaliza pra outro mês.
  const [a, m, dia] = s.split('-').map(Number);
  if (d.getFullYear() !== a || d.getMonth() + 1 !== m || d.getDate() !== dia) return false;
  if (d.getTime() > hoje.getTime()) return false;               // futuro
  const anos = (hoje.getTime() - d.getTime()) / (365.25 * 24 * 3600 * 1000);
  return anos <= 120;
}

function generoOk(g) {
  const v = String(g || '').trim().toLowerCase();
  // Aceita o canônico do contrato e o M/F que o legado gravou.
  return ['masculino', 'feminino', 'm', 'f'].includes(v);
}

/**
 * @param {object} cad linha de mem_cadastros_pendentes
 * @param {Date} [hoje] injetado pro teste
 * @returns {{pronto:boolean, faltando:string[], bloqueios:string[], rotulos:string[]}}
 */
function avaliarProntidao(cad, hoje = new Date()) {
  const c = cad || {};
  const faltando = [];
  const bloqueios = [];

  if (c.status !== 'pendente') bloqueios.push('status');
  // ⚠️ Cadastro ligado a alguém existente é ATUALIZAÇÃO, não criação: aprovar
  // reaplica o formulário inteiro sobre o cadastro — inclusive por cima de
  // valor que a equipe corrigiu depois (a mesma razão pela qual o censo não
  // deixa reaprovar linha 'aplicado'). Isso é decisão humana, sempre.
  if (c.duplicado_de_id) bloqueios.push('duplicado');

  if (!nomeCompleto(c.nome)) faltando.push('nome');
  if (!cpfValido(c.cpf)) faltando.push('cpf');   // `cpfValido` já normaliza e confere o DV
  if (!telefoneAlcancavel(c.telefone)) faltando.push('telefone');
  if (!emailOk(c.email)) faltando.push('email');
  if (!nascimentoOk(c.data_nascimento, hoje)) faltando.push('nascimento');
  if (!generoOk(c.genero)) faltando.push('genero');
  // A prova legal do consentimento. Sem ela não se cria membro em lote.
  if (c.aceita_termos !== true) faltando.push('termos');

  return {
    pronto: faltando.length === 0 && bloqueios.length === 0,
    faltando,
    bloqueios,
    rotulos: [
      ...bloqueios.map(b => BLOQUEIO[b] || b),
      ...faltando.map(f => FALTA[f] || f),
    ],
  };
}

// ════════════════════════════════════════════════════════════════════════════
//  A MESMA régua aplicada à PESSOA (`mem_membros`), não a uma submissão
//
//  Régua do Matheus (13/08/2026), sobre visitante de grupo: "só não vai ser
//  visitante aquele de quem tivermos os dados completos (os mesmos que pedimos
//  no momento da inscrição)".
//
//  ⚠️ É o espelho JS de `fn_membro_cadastro_completo` (migration
//     20260814150000). Mudou aqui, muda lá — senão o selo da tela discorda do
//     trigger que promove, e ninguém entende por que a pessoa continua
//     visitante com a tela dizendo que está tudo preenchido.
//
//  ⚠️ DUAS diferenças conscientes em relação a `avaliarProntidao`, as duas
//     porque lá se avalia uma SUBMISSÃO e aqui uma PESSOA:
//
//     · `aceita_termos` fica de fora — termo é prova de consentimento de uma
//       PORTA, não atributo do cadastro, e o visitante que o líder anotou à mão
//       nunca terá um. Exigi-lo tornaria impossível o caminho que ele descreveu
//       (o líder pega os dados e a pessoa vira participante).
//     · telefone confere 10-11 DÍGITOS (a régua do Contrato de Inscrição), não
//       `telefoneAlcancavel`, que também exige DDD real + o 9 do celular.
//       Aquela é régua de ENVIO (a mensagem chega?); a pergunta aqui é de
//       CADASTRO (temos o dado?).
// ════════════════════════════════════════════════════════════════════════════

/** Telefone pela régua do Contrato: 10-11 dígitos (DDD + número). */
function telefoneDigitosOk(tel) {
  const d = String(tel || '').replace(/\D/g, '');
  return d.length >= 10 && d.length <= 11;
}

/**
 * @param {object} membro linha de mem_membros
 * @param {Date} [hoje] injetado pro teste
 * @returns {{completo:boolean, faltando:string[], rotulos:string[]}}
 */
function avaliarCadastroPessoa(membro, hoje = new Date()) {
  const m = membro || {};
  const faltando = [];

  if (!nomeCompleto(m.nome)) faltando.push('nome');
  if (!cpfValido(m.cpf)) faltando.push('cpf');
  if (!telefoneDigitosOk(m.telefone)) faltando.push('telefone');
  if (!emailOk(m.email)) faltando.push('email');
  if (!nascimentoOk(m.data_nascimento, hoje)) faltando.push('nascimento');
  if (!generoOk(m.genero)) faltando.push('genero');

  return {
    completo: faltando.length === 0,
    faltando,
    rotulos: faltando.map(f => FALTA[f] || f),
  };
}

module.exports = {
  avaliarProntidao,
  avaliarCadastroPessoa,
  telefoneDigitosOk,
  nomeCompleto,
  nascimentoOk,
  generoOk,
  emailOk,
  FALTA,
  BLOQUEIO,
};
