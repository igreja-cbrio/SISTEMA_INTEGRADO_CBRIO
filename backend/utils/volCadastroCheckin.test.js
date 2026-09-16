const assert = require('assert');
const {
  CAMPOS_BASE, SEXOS, faltandoNoCadastro, validarParcialCadastro,
} = require('./volCadastroCheckin');

// ——— o conjunto é o do Contrato de Inscrição, não uma lista nova ———
assert.deepEqual(CAMPOS_BASE, ['nome', 'telefone', 'cpf', 'data_nascimento', 'email', 'sexo']);
assert.deepEqual(SEXOS, ['masculino', 'feminino']);

// ══════════════════════════════════════════════════════════════
// faltandoNoCadastro · a UNIÃO das duas tabelas
// ══════════════════════════════════════════════════════════════

const perfilCheio = { full_name: 'Ana Maria Silva', phone: '21995128249', cpf: '52998224725', email: 'ana@x.com' };
const membroCheio = {
  nome: 'Ana Maria Silva', telefone: '21995128249', cpf: '52998224725',
  email: 'ana@x.com', data_nascimento: '1990-05-10', genero: 'feminino',
};

assert.deepEqual(faltandoNoCadastro(perfilCheio, membroCheio), [], 'cadastro completo não falta nada');

// ⚠️⚠️ O CASO QUE MOTIVOU O MÓDULO: `vol_profiles` é casca (4 de 516 tinham
// telefone), o dado está no membro. Perguntar de novo seria fazer a pessoa
// digitar o que a igreja já sabe.
assert.deepEqual(
  faltandoNoCadastro({ full_name: 'Ana Maria Silva', email: 'ana@x.com' }, membroCheio),
  [],
  'telefone/CPF só no membro NÃO conta como faltando',
);

// E o espelho: o que só o perfil tem também vale.
assert.deepEqual(
  faltandoNoCadastro(perfilCheio, { data_nascimento: '1990-05-10', genero: 'feminino' }),
  [],
  'telefone/CPF/e-mail só no perfil NÃO conta como faltando',
);

// Perfil sem vínculo de membresia (eram 101 dos 516): nascimento e sexo faltam
// por CONSTRUÇÃO — não existe coluna onde eles pudessem estar.
assert.deepEqual(
  faltandoNoCadastro(perfilCheio, null),
  ['data_nascimento', 'sexo'],
  'sem membro vinculado, nascimento e sexo faltam sempre',
);

assert.deepEqual(
  faltandoNoCadastro({ full_name: 'João Pedro Souza' }, null),
  ['telefone', 'cpf', 'data_nascimento', 'email', 'sexo'],
  'perfil só com nome e sem vínculo falta os outros 5',
);

// String vazia e espaço em branco são "não temos" — a base tem `genero = ''`.
assert.deepEqual(
  faltandoNoCadastro(perfilCheio, { ...membroCheio, genero: '' }),
  ['sexo'],
  'string vazia conta como faltando',
);
assert.deepEqual(
  faltandoNoCadastro(perfilCheio, { ...membroCheio, genero: '   ' }),
  ['sexo'],
  'só espaço conta como faltando',
);

// Ordem estável = a que o formulário mostra.
assert.deepEqual(
  faltandoNoCadastro({}, {}),
  CAMPOS_BASE,
  'tudo vazio devolve os 6 na ordem do contrato',
);

assert.deepEqual(faltandoNoCadastro(null, membroCheio), [], 'sem perfil não há o que perguntar');

// ══════════════════════════════════════════════════════════════
// validarParcialCadastro · TUDO opcional (o "Agora não" é lei)
// ══════════════════════════════════════════════════════════════

const nada = validarParcialCadastro({});
assert.deepEqual(nada.erros, {}, 'corpo vazio não é erro — é o "Agora não"');
assert.deepEqual(nada.valores, {}, 'corpo vazio não grava nada');

// ⚠️ O ponto do módulo: quem preenche 2 de 4 grava os 2. Campo AUSENTE é
// ignorado; ele volta a ser perguntado no próximo check-in.
const parcial = validarParcialCadastro({ cpf: '529.982.247-25', gender: 'F' });
assert.deepEqual(parcial.erros, {}, 'preenchimento parcial não é erro');
assert.deepEqual(parcial.valores, { cpf: '52998224725', genero: 'feminino' });

// Caso feliz completo, com os apelidos do frontend (full_name/phone/birth_date/gender).
const cheio = validarParcialCadastro({
  full_name: '  Maria   Clara dos Santos ',
  phone: '(21) 99512-8249',
  cpf: '529.982.247-25',
  birth_date: '1995-03-08',
  email: '  Maria@Exemplo.COM ',
  gender: 'Feminino',
});
assert.deepEqual(cheio.erros, {}, `caso feliz sem erros: ${JSON.stringify(cheio.erros)}`);
assert.deepEqual(cheio.valores, {
  nome: 'Maria Clara dos Santos',
  telefone: '21995128249',
  cpf: '52998224725',
  dataNascimento: '1995-03-08',
  email: 'maria@exemplo.com',
  genero: 'feminino',
});

// E os nomes canônicos do backend também entram (nome/telefone/data_nascimento/sexo).
const canonico = validarParcialCadastro({
  nome: 'Maria Clara dos Santos', telefone: '21995128249',
  data_nascimento: '1995-03-08', sexo: 'feminino',
});
assert.deepEqual(canonico.erros, {});
assert.equal(canonico.valores.genero, 'feminino');

// ——— telefone: o código do país sai ANTES de truncar (lei de 31/07) ———
assert.equal(
  validarParcialCadastro({ phone: '+55 21 99999-8888' }).valores.telefone,
  '21999998888',
  '⚠️⚠️ truncar antes comeria os 2 últimos dígitos, irrecuperáveis',
);
// DDD 55 (Santa Maria/RS) passa intacto — não é código de país.
assert.equal(validarParcialCadastro({ phone: '(55) 99999-8888' }).valores.telefone, '55999998888');
assert.equal(validarParcialCadastro({ phone: '2133334444' }).valores.telefone, '2133334444', 'fixo 10 dígitos');
assert.ok(validarParcialCadastro({ phone: '219999' }).erros.telefone, 'telefone curto é erro');
assert.ok(!('telefone' in validarParcialCadastro({ phone: '219999' }).valores), 'inválido não vira valor');

// ——— CPF: dígito verificador de verdade ———
assert.ok(validarParcialCadastro({ cpf: '11111111111' }).erros.cpf, 'sequência repetida é erro');
assert.ok(validarParcialCadastro({ cpf: '52998224726' }).erros.cpf, 'DV errado é erro');
assert.ok(validarParcialCadastro({ cpf: '5299822472' }).erros.cpf, '10 dígitos é erro');

// ——— nome: o anti-abreviação do Contrato ———
assert.ok(validarParcialCadastro({ full_name: 'Ana' }).erros.nome, 'nome só de primeiro nome é erro');
assert.ok(validarParcialCadastro({ full_name: 'Ana M. Silva' }).erros.nome, 'abreviação é erro');
assert.equal(
  validarParcialCadastro({ full_name: 'Ana Maria de Souza e Silva' }).valores.nome,
  'Ana Maria de Souza e Silva',
  'conectivos são permitidos',
);

// ——— nascimento ———
assert.ok(validarParcialCadastro({ birth_date: '2099-01-01' }).erros.data_nascimento, 'futuro é erro');
assert.ok(validarParcialCadastro({ birth_date: '10/05/1990' }).erros.data_nascimento, 'formato BR não passa');
assert.ok(validarParcialCadastro({ birth_date: '1990-02-30' }).erros.data_nascimento, 'data inexistente é erro');

// ——— sexo: vocabulário de mem_membros, nunca um chute ———
assert.equal(validarParcialCadastro({ gender: 'M' }).valores.genero, 'masculino', 'M vira o canônico');
assert.equal(validarParcialCadastro({ gender: 'masculino' }).valores.genero, 'masculino');
assert.ok(validarParcialCadastro({ gender: 'outro' }).erros.sexo, 'D8 — "outro" não existe');
assert.ok(!('genero' in validarParcialCadastro({ gender: 'outro' }).valores), 'irreconhecível não vira valor');

// ——— um campo errado não derruba os certos ———
const misto = validarParcialCadastro({ cpf: '11111111111', gender: 'masculino' });
assert.ok(misto.erros.cpf);
assert.equal(misto.valores.genero, 'masculino', 'o que estava certo continua disponível');

console.log('volCadastroCheckin: régua do completar-cadastro-no-check-in aprovada');
