// Gate: `npm run test:endereco-grupo` · roda com `node`, sem node_modules.
// Régua do endereço do grupo no formulário PÚBLICO (Natasha · 16/09/2026):
// rua e número aparecem, apartamento/bloco/casa NUNCA.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { enderecoPublicoGrupo, temNumeroDeRua } = require('./enderecoGrupoPublico');

// ── O que a Natasha pediu: o NÚMERO chega na tela ───────────────────────────
// Sem ele, "Barra da Tijuca" cobre 20 km de Av. das Américas.
assert.equal(enderecoPublicoGrupo({ endereco: 'Avenida das Américas 9707' }), 'Avenida das Américas 9707');
assert.equal(enderecoPublicoGrupo({ endereco: 'Rua Nicette Bruno 75' }), 'Rua Nicette Bruno 75');
assert.equal(enderecoPublicoGrupo('Av George Savalla 500'), 'Av George Savalla 500', 'aceita a string crua também');
assert.equal(enderecoPublicoGrupo({ endereco: ' Avenida das Américas 6700' }), 'Avenida das Américas 6700', 'espaço da importação');

// ── A LEI DE SEGURANÇA: complemento não vai pra rua pública ────────────────
// O grupo é na casa de alguém. Rua + altura da via bastam pra escolher; da
// porta pra dentro é o líder quem entrega, depois de aprovar.
assert.equal(enderecoPublicoGrupo({ endereco: 'Rua Otto Stupakoff, 427', complemento: 'CASA 9' }), 'Rua Otto Stupakoff, 427',
  'o campo complemento nem é lido — mas que fique explícito');
assert.equal(enderecoPublicoGrupo({ endereco: 'Rua X, 427, Casa 9' }), 'Rua X, 427');
assert.equal(enderecoPublicoGrupo({ endereco: 'Rua X, 427, Apto 302' }), 'Rua X, 427');
assert.equal(enderecoPublicoGrupo({ endereco: 'Rua X 427 apto 302' }), 'Rua X 427', 'complemento colado, sem vírgula');
assert.equal(enderecoPublicoGrupo({ endereco: 'Rua X 427 - bloco B' }), 'Rua X 427');
assert.equal(enderecoPublicoGrupo({ endereco: 'Rua X, 100, Bloco 2, Apto 501' }), 'Rua X, 100');
assert.equal(enderecoPublicoGrupo({ endereco: 'Rua X, 100, Torre Sul' }), 'Rua X, 100');
assert.equal(enderecoPublicoGrupo({ endereco: 'Rua X, 100, Cobertura' }), 'Rua X, 100');
assert.equal(enderecoPublicoGrupo({ endereco: 'Rua X, 100, Condomínio Mirante do Sol' }), 'Rua X, 100',
  'nome do condomínio identifica a casa tanto quanto o bloco');
for (const sufixo of ['ap 3', 'apt 3', 'apartamento 3', 'bl 3', 'cs 3', 'sala 3', 'andar 3', 'unidade 3', 'lote 3', 'quadra 3', 'fundos']) {
  assert.equal(enderecoPublicoGrupo({ endereco: `Rua X, 100, ${sufixo}` }), 'Rua X, 100', `sufixo "${sufixo}" tinha que sair`);
}

// ── O que NÃO pode ser confundido com complemento ──────────────────────────
assert.equal(enderecoPublicoGrupo({ endereco: 'Rua Casa Forte 100' }), 'Rua Casa Forte 100',
  'rua com "casa" no nome continua inteira — o corte só vale depois de um número');
assert.equal(enderecoPublicoGrupo({ endereco: 'Estrada dos Bandeirantes 100' }), 'Estrada dos Bandeirantes 100');
assert.equal(enderecoPublicoGrupo({ endereco: 'Condomínio Vila Verde, 40' }), 'Condomínio Vila Verde, 40',
  'a PRIMEIRA parte é a via — nunca é descartada');

// ── Lixo de cadastro não vira texto na tela ────────────────────────────────
for (const nada of ['(endereço não informado)', 'Online', 'ONLINE', 'a definir', 'não informado', '-', '  ', '', null, undefined]) {
  assert.equal(enderecoPublicoGrupo({ endereco: nada }), null, `"${nada}" não pode aparecer no cartão`);
}
assert.equal(enderecoPublicoGrupo({}), null);
assert.equal(enderecoPublicoGrupo(null), null);
assert.equal(enderecoPublicoGrupo({ endereco: 'Rua Otto Stupakoff, 427, 427' }), 'Rua Otto Stupakoff, 427', 'número repetido da importação');
assert.equal(enderecoPublicoGrupo({ endereco: 'Rua X, 100,' }), 'Rua X, 100');
assert.equal(enderecoPublicoGrupo({ endereco: '100' }), null, 'número solto não localiza ninguém');

// ── Caixa alta da importação vira texto legível ────────────────────────────
assert.equal(enderecoPublicoGrupo({ endereco: 'AVENIDA FLAMBOYANTS DA PENÍNSULA, 1259' }), 'Avenida Flamboyants da Península, 1259');
assert.equal(enderecoPublicoGrupo({ endereco: 'AVENIDA EVANDO LINS E SILVA, 440' }), 'Avenida Evando Lins e Silva, 440');
assert.equal(enderecoPublicoGrupo({ endereco: 'ESTRADA CAPENHA, 907' }), 'Estrada Capenha, 907');
assert.equal(enderecoPublicoGrupo({ endereco: 'Rua Gernica 100' }), 'Rua Gernica 100', 'o que já tem caixa mista não é mexido');
assert.equal(enderecoPublicoGrupo({ endereco: 'AVENIDA DAS AMÉRICAS, 2300 A' }), 'Avenida das Américas, 2300 A', 'letra sozinha é sufixo do número');
assert.equal(enderecoPublicoGrupo({ endereco: 'AVENIDA VICE-PRESIDENTE JOSÉ ALENCAR, 1500' }), 'Avenida Vice-Presidente José Alencar, 1500');

// ── temNumeroDeRua: o que a coordenação precisa cobrar do líder ────────────
assert.equal(temNumeroDeRua({ endereco: 'Avenida das Américas 9707' }), true);
assert.equal(temNumeroDeRua({ endereco: 'RUA CRUZ DE MALTA' }), false, 'via inteira sem número não resolve nada');
assert.equal(temNumeroDeRua({ endereco: 'Online' }), false);
assert.equal(temNumeroDeRua({}), false);

// ── Guarda: o módulo é puro (o gate roda sem node_modules) ─────────────────
const src = fs.readFileSync(path.join(__dirname, 'enderecoGrupoPublico.js'), 'utf8');
assert.ok(!/require\(/.test(src), 'enderecoGrupoPublico.js não pode requerer nada');

// ── Guarda de rota: o público NUNCA recebe `complemento` ───────────────────
// É a lei 2 no lugar onde ela realmente pode vazar — a rota do deep-link
// devolvia `...grupo` inteiro, com o "apto 302" do cadastro dentro.
const rota = fs.readFileSync(path.join(__dirname, '..', 'routes', 'publicGrupos.js'), 'utf8');
const trechoPublico = rota.slice(0, rota.indexOf('Inscrição publica em grupo'));
assert.ok(/semDadosDePorta/.test(trechoPublico), 'as leituras públicas precisam passar pelo filtro semDadosDePorta');
for (const m of trechoPublico.matchAll(/res\.json\(\s*\{\s*\n\s*\.\.\.grupo\b/g)) {
  assert.fail('rota pública devolvendo o grupo cru (leva complemento/endereco exato)');
}

console.log('enderecoGrupoPublico: OK');
