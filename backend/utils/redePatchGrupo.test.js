// Gate: campo vazio NÃO apaga a rede do grupo (16/09/2026).
// O que se guarda aqui é o que sangrou em produção: 80 salvamentos apagaram
// `rede_id` sem que ninguém pedisse, sempre de carona em outra edição.
const assert = require('assert');
const { patchRedeGrupo } = require('./redePatchGrupo');

const REDE = '814d8059-cc34-46a0-9186-6675ef471299';

// ── o vazamento medido: corpo sem a rede não pode apagar ───────────────────
assert.deepStrictEqual(patchRedeGrupo({}), {}, 'corpo sem rede_id nao mexe na rede');
assert.deepStrictEqual(patchRedeGrupo({ rede_id: '' }), {}, 'string vazia nao apaga');
assert.deepStrictEqual(patchRedeGrupo({ rede_id: null }), {}, 'null sozinho nao apaga');
assert.deepStrictEqual(patchRedeGrupo({ rede_id: undefined }), {}, 'undefined nao apaga');
assert.deepStrictEqual(patchRedeGrupo({ rede_id: '   ' }), {}, 'so espaco nao apaga');
assert.deepStrictEqual(patchRedeGrupo({ rede_id: '__none__' }), {}, 'sentinela da tela nao apaga');
assert.deepStrictEqual(patchRedeGrupo({ rede_id: 'null' }), {}, 'a PALAVRA null nao apaga');
// o payload real que apagou 80 vezes: edicao de outro campo, sem a rede junto
assert.deepStrictEqual(
  patchRedeGrupo({ nome: 'GRUPO X', modo_inscricao: 'fechado', local: null, descricao: null }),
  {}, 'save de modo_inscricao nao pode levar a rede junto');

// ── desvincular continua possível, mas só quem PEDE ───────────────────────
assert.deepStrictEqual(patchRedeGrupo({ rede_id: '', rede_limpar: true }), { rede_id: null });
assert.deepStrictEqual(patchRedeGrupo({ rede_limpar: true }), { rede_id: null }, 'pedido explicito sem o campo tambem vale');
// ⚠️ só o TRUE booleano — 'false', 'true' de querystring ou 1 não desvinculam
assert.deepStrictEqual(patchRedeGrupo({ rede_limpar: 'true' }), {}, 'string "true" nao apaga');
assert.deepStrictEqual(patchRedeGrupo({ rede_limpar: 1 }), {}, '1 nao apaga');
assert.deepStrictEqual(patchRedeGrupo({ rede_limpar: false }), {}, 'false nao apaga');

// ── gravar uma rede de verdade segue normal ───────────────────────────────
assert.deepStrictEqual(patchRedeGrupo({ rede_id: REDE }), { rede_id: REDE });
assert.deepStrictEqual(patchRedeGrupo({ rede_id: `  ${REDE}  ` }), { rede_id: REDE }, 'espaco em volta nao atrapalha');
assert.deepStrictEqual(patchRedeGrupo({ rede_id: REDE.toUpperCase() }), { rede_id: REDE.toUpperCase() });
// ⚠️ ESCOLHER uma rede ganha do pedido de limpar: se os dois vierem, a escolha
// da pessoa é a palavra final — o contrário apagaria o que ela acabou de pedir.
assert.deepStrictEqual(patchRedeGrupo({ rede_id: REDE, rede_limpar: true }), { rede_id: REDE });

// ── nunca quebra a rota ───────────────────────────────────────────────────
assert.deepStrictEqual(patchRedeGrupo(null), {});
assert.deepStrictEqual(patchRedeGrupo(undefined), {});
assert.deepStrictEqual(patchRedeGrupo({ rede_id: 123 }), {}, 'numero nao e id');
assert.deepStrictEqual(patchRedeGrupo({ rede_id: { id: REDE } }), {}, 'objeto nao e id');

console.log('redePatchGrupo: OK');
