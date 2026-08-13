const assert = require('assert');
const {
  validarCamposPadrao, temAbreviacaoNome, validarNascimento, splitNomeCompleto,
  honeypotPreenchido, SEXOS, TEXTOS,
} = require('./inscricaoContrato');

// ——— split do nome (D1) ———
assert.deepEqual(splitNomeCompleto('Ana Maria da Silva'), { nome: 'Ana', sobrenome: 'Maria da Silva' });
assert.deepEqual(splitNomeCompleto('  João   Pedro '), { nome: 'João', sobrenome: 'Pedro' });

// ——— anti-abreviação ———
assert.equal(temAbreviacaoNome('Ana M. Silva'), true, 'ponto é abreviação');
assert.equal(temAbreviacaoNome('Ana M Silva'), true, 'uma letra é abreviação');
assert.equal(temAbreviacaoNome('Ana Maria de Souza e Silva'), false, 'conectivos são permitidos');

// ——— nascimento ———
assert.equal(validarNascimento('1990-05-10'), '1990-05-10');
assert.equal(validarNascimento('2099-01-01'), null, 'futuro é inválido');
assert.equal(validarNascimento('1899-12-31'), null, 'antes de 1900 é inválido');
assert.equal(validarNascimento('1990-02-30'), null, 'data inexistente é inválida');
assert.equal(validarNascimento('10/05/1990'), null, 'formato BR não passa (front converte pra ISO)');

// ——— honeypot ———
assert.equal(honeypotPreenchido({ website: 'x' }), true);
assert.equal(honeypotPreenchido({ website: '  ' }), false);
assert.equal(honeypotPreenchido({}), false);

// ——— campos padrão: caso feliz ———
const ok = validarCamposPadrao({
  nome_completo: 'Maria Clara dos Santos',
  telefone: '(21) 99512-8249',
  cpf: '529.982.247-25',
  email: 'Maria@Exemplo.com ',
  data_nascimento: '1995-03-08',
  sexo: 'Feminino',
  endereco: '  Rua A, 10 ',
});
assert.deepEqual(ok.erros, {}, `caso feliz não pode ter erros: ${JSON.stringify(ok.erros)}`);
assert.equal(ok.valores.nome, 'Maria');
assert.equal(ok.valores.sobrenome, 'Clara dos Santos');
assert.equal(ok.valores.telefone, '21995128249');
assert.equal(ok.valores.cpf, '52998224725');
assert.equal(ok.valores.email, 'maria@exemplo.com');
assert.equal(ok.valores.sexo, 'feminino');
assert.equal(ok.valores.endereco, 'Rua A, 10');

// ——— campos padrão: rejeições do contrato ———
const ruim = validarCamposPadrao({
  nome_completo: 'Ana',
  telefone: '999999999',           // 9 dígitos
  cpf: '529.982.247-24',           // DV errado
  email: 'sem-arroba',
  data_nascimento: '2099-01-01',   // futuro
  sexo: 'outro',                   // D8: nunca
});
assert.ok(ruim.erros.nome_completo, 'nome incompleto rejeita');
assert.ok(ruim.erros.telefone, 'telefone curto rejeita');
assert.ok(ruim.erros.cpf, 'CPF com DV inválido rejeita');
assert.ok(ruim.erros.email, 'e-mail inválido rejeita');
assert.ok(ruim.erros.data_nascimento, 'nascimento futuro rejeita');
assert.ok(ruim.erros.sexo, 'sexo "outro" NUNCA passa (D8)');

assert.ok(validarCamposPadrao({ nome_completo: 'Ana Lima', telefone: '219951282490' }).erros.telefone, '12 dígitos rejeita (teto 11)');

// ——— endereço é fixo-opcional (28/07) ———
const semEndereco = validarCamposPadrao({
  nome_completo: 'Pedro Alves', telefone: '21995128249', cpf: '52998224725',
  email: 'p@x.com', data_nascimento: '1990-01-01', sexo: 'masculino',
});
assert.deepEqual(semEndereco.erros, {}, 'endereço vazio não gera erro');
assert.equal(semEndereco.valores.endereco, null);

// ——— exceção documentada (walk-in): opts relaxam sem afetar o default ———
const walkin = validarCamposPadrao(
  { nome_completo: 'José Nunes', telefone: '21995128249', sexo: 'masculino' },
  { exigirCpf: false, exigirEmail: false, exigirNascimento: false },
);
assert.deepEqual(walkin.erros, {}, 'walk-in com opts relaxadas passa');

// ——— textos canônicos presentes ———
['termos_lgpd', 'menor_responsavel', 'imagem', 'aviso_optin'].forEach((k) => {
  assert.ok(TEXTOS[k] && TEXTOS[k].length > 30, `texto canônico ${k} existe`);
});
assert.deepEqual(SEXOS, ['masculino', 'feminino']);

console.log('inscricaoContrato: contrato de campos padrão aprovado');
