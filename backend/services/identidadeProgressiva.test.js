const assert = require('assert');
const { cpfValido, pontuarPar, sexoCanonico } = require('./identidadeProgressiva');

const perfil = (id, dados = {}) => ({
  id,
  cpfs: new Set(dados.cpfs || []),
  telefones: new Set(dados.telefones || []),
  emails: new Set(dados.emails || []),
  nascimentos: new Set(dados.nascimentos || []),
  nomes: new Set(dados.nomes || []),
  generos: new Set((dados.generos || []).map(sexoCanonico).filter(Boolean)),
  fontes: new Set(dados.fontes || []),
});

assert.equal(cpfValido('529.982.247-25'), true, 'aceita CPF com DV válido');
assert.equal(cpfValido('529.982.247-24'), false, 'rejeita CPF com DV inválido');
assert.equal(cpfValido('111.111.111-11'), false, 'rejeita CPF repetido');

const a = perfil('a', { cpfs: ['52998224725'], telefones: ['21999999999'], nomes: ['ana carolina vieira'] });
const b = perfil('b', { telefones: ['21999999999'], nomes: ['ana carolina vieira'] });
const ponte = {
  cpf: '52998224725', telefone: '21999999999', email: null,
  data_nascimento: null, nome_normalizado: 'ana carolina vieira',
};
const promovido = pontuarPar(a, b, ponte);
assert(promovido.score >= 90, 'terceiro cadastro com CPF + telefone + nome promove o par');
assert.equal(promovido.prioridade, 'quase_confirmado');

const familiar = perfil('c', { telefones: ['21999999999'], nomes: ['bianca silva bernardo'] });
const contatoCompartilhado = pontuarPar(a, familiar, ponte);
assert(contatoCompartilhado.score < 70, 'telefone compartilhado com nome incompatível não vira alta confiança');

const cpfConflitante = perfil('d', { cpfs: ['11144477735'], telefones: ['21999999999'], nomes: ['ana carolina vieira'] });
const conflito = pontuarPar(a, cpfConflitante, ponte);
assert(conflito.score <= 25, 'CPFs válidos diferentes impedem promoção automática');
assert(conflito.contradicoes.includes('CPFs válidos diferentes'));

// ── Nascimento é CORROBORAÇÃO, nunca ponto de partida (2026-08-14) ───────────
// ⚠️ MUTATION-TEST: voltar `if (nascimentoComum && outroSinal)` pra
// `if (nascimentoComum)` deixa os 2 primeiros casos VERMELHOS; devolver
// `|| sinais.includes('nascimento')` ao `forteA`/`forteB` da ponte deixa o 2º.
// Foram esses dois pedaços somados (35 + 35 = 70 = "alta") que puseram
// "GUILHERME AMORIM × JULIANA NANTES LIMA" no topo da fila.
assert.equal(sexoCanonico('masculino'), 'm', 'aceita a forma canônica de mem_membros');
assert.equal(sexoCanonico('F'), 'f', 'aceita a forma curta do legado');
assert.equal(sexoCanonico('outro'), null, 'valor fora de m/f é AUSÊNCIA de sinal, não um 3º gênero');
assert.equal(sexoCanonico(null), null);

const soNascA = perfil('e1', { nascimentos: ['1989-04-07'], nomes: ['janaina de oliveira'] });
const soNascB = perfil('e2', { nascimentos: ['1989-04-07'], nomes: ['allan theodozio barboza'] });
const soNasc = pontuarPar(soNascA, soNascB);
assert.equal(soNasc.score, 0, 'nascimento igual SOZINHO não pontua nada');
assert(!soNasc.evidencias.some((e) => e.includes('Nascimento')), 'e não vira evidência exibida');

const ponteNasc = {
  cpf: '52998224725', telefone: null, email: null,
  data_nascimento: '1989-04-07', nome_normalizado: 'janaina de oliveira',
};
const comPonte = pontuarPar(perfil('e3', { cpfs: ['52998224725'], nascimentos: ['1989-04-07'], nomes: ['janaina de oliveira'] }), soNascB, ponteNasc);
// O cadastro novo confirma o lado A por CPF, mas o único encontro com o lado B é
// o NASCIMENTO — então não há ponte. ⚠️ Asserção no ZERO e na ausência da
// evidência, não num limiar: com `score < 45` o mutante que devolve nascimento a
// "forte" SOBREVIVIA (o par ia de 0 pra 35 e continuava abaixo de 45).
assert.equal(comPonte.score, 0, 'cadastro novo que só encontra o outro lado pelo nascimento não faz ponte');
assert(!comPonte.evidencias.some((e) => e.startsWith('Novo cadastro conecta')), 'e não registra evidência de ponte');
assert.notEqual(comPonte.prioridade, 'alta');

const nascMaisNomeA = perfil('f1', { nascimentos: ['1978-03-10'], nomes: ['fernanda silva de oliveira barcelos'] });
const nascMaisNomeB = perfil('f2', { nascimentos: ['1978-03-10'], nomes: ['fernanda silva de oliveira barcelos'] });
const nascMaisNome = pontuarPar(nascMaisNomeA, nascMaisNomeB);
assert(nascMaisNome.score >= 45, 'nascimento COM nome compatível continua valendo (é o motivo nome_e_nascimento)');
assert(nascMaisNome.evidencias.some((e) => e.includes('Nascimento')));

// ── Gênero divergente VETA o par, mas CPF em comum vence o veto ──────────────
// ⚠️ MUTATION-TEST: tirar o `&& !cpfComum` deixa o 2º caso vermelho; tirar o
// bloco inteiro deixa o 1º. Espelha a `duplicidadePolicy`, onde `cpfIgual`
// retorna ANTES do bloco de exclusão.
const homem = perfil('g1', { telefones: ['21988887777'], nomes: ['guilherme amorim'], generos: ['masculino'] });
const mulher = perfil('g2', { telefones: ['21988887777'], nomes: ['guilherme amorim'], generos: ['feminino'] });
const vetoGenero = pontuarPar(homem, mulher);
assert(vetoGenero.score <= 25, 'gênero divergente veta o par (abaixo do piso de 30 da gravação)');
assert(vetoGenero.contradicoes.includes('Gêneros diferentes'));

const mesmoCpfSexoDif = pontuarPar(
  perfil('h1', { cpfs: ['52998224725'], nomes: ['ana carolina vieira'], generos: ['feminino'] }),
  perfil('h2', { cpfs: ['52998224725'], nomes: ['ana carolina vieira'], generos: ['masculino'] }),
);
assert(mesmoCpfSexoDif.score >= 90, 'CPF em comum vence o veto de gênero (erro de cadastro de UMA pessoa)');

// Perfil legado sem o set de gêneros não pode estourar dentro da porta.
const semSet = { id: 'i1', cpfs: new Set(), telefones: new Set(['21955554444']), emails: new Set(), nascimentos: new Set(), nomes: new Set(['pedro alves']), fontes: new Set() };
assert.doesNotThrow(() => pontuarPar(semSet, semSet), 'perfil sem `generos` é tolerado');

// ── Nome ABREVIADO/CONTIDO é sinal FORTE (2026-08-17 · caso Andrea Palladino) ──
// `similaridadeNome` é Dice de bigramas e AFUNDA no padrão nº 1 de duplicata:
// nome contido. Medido nos casos reais da base, todos abaixo do degrau de 0,82 e
// portanto valendo ZERO ponto de nome antes deste ramo existir:
//   "Andrea Melchiades Palladino" × "Andrea Palladino"      = 0,73
//   "Tatiane Youssef Fares Dib"   × "Tatiane Dib"           = 0,59
//   "Leandro Pereira e Silva"     × "Leandro Pereira"       = 0,78
//   "João Paulo Bezerra Honorio"  × "joao paulo honorio"    = 0,81 (fora por 0,01)
// Efeito: o par ficava com só o telefone (30) em `descoberta`, no fim da fila —
// era por isso que 3 cadastros da MESMA pessoa não apareciam como sugestão forte.
const abreviados = [
  ['andrea melchiades palladino', 'andrea palladino'],
  ['tatiane youssef fares dib', 'tatiane dib'],
  ['leandro pereira e silva', 'leandro pereira'],
  ['joao paulo bezerra honorio', 'joao paulo honorio'],
];
for (const [longo, curto] of abreviados) {
  const r = pontuarPar(
    perfil('ab1', { telefones: ['21996053193'], nomes: [longo] }),
    perfil('ab2', { telefones: ['21996053193'], nomes: [curto] }),
  );
  assert(r.score >= 55, `"${longo}" x "${curto}" tem que passar de 30 (telefone sozinho) — nome contido é sinal forte, não ausência de sinal`);
  assert(r.prioridade !== 'descoberta', `"${longo}" x "${curto}" não pode ficar em descoberta, que é o fim da fila`);
  assert(r.evidencias.some((e) => /vers[ãa]o abreviada/.test(e)), 'a evidência tem que DIZER que um nome é a versão abreviada do outro');
}

// ⚠️⚠️ O falso positivo que importa: FAMÍLIA compartilha telefone. A régua exige
// o mesmo PRIMEIRO nome + containment de tokens, e é isso que separa "versão
// abreviada da mesma pessoa" de "parente com o sobrenome igual". Se este par
// subir, a fila enche de irmão e cônjuge no topo — o defeito que a régua de
// nascimento causou em 14/08, por outro caminho.
for (const [x, y] of [['ana souza lima', 'joao souza lima'], ['carlos eduardo vieira', 'mariana lopes vieira']]) {
  const r = pontuarPar(
    perfil('fam1', { telefones: ['21966666666'], nomes: [x] }),
    perfil('fam2', { telefones: ['21966666666'], nomes: [y] }),
  );
  assert.equal(r.score, 30, `"${x}" x "${y}" é família no mesmo telefone: fica em 30, sem ponto de nome`);
  assert.equal(r.prioridade, 'descoberta', 'família com telefone em comum continua em descoberta');
}

// Nome abreviado NÃO pode valer mais que nome idêntico.
const identico = pontuarPar(
  perfil('id1', { telefones: ['21900000000'], nomes: ['wesley barros ramos'] }),
  perfil('id2', { telefones: ['21900000000'], nomes: ['wesley barros ramos'] }),
);
const contido = pontuarPar(
  perfil('ct1', { telefones: ['21900000000'], nomes: ['wesley barros ramos'] }),
  perfil('ct2', { telefones: ['21900000000'], nomes: ['wesley ramos'] }),
);
assert(identico.score > contido.score, 'nome idêntico tem que pontuar mais que nome abreviado');

console.log('identidadeProgressiva: cenários cumulativos aprovados');
