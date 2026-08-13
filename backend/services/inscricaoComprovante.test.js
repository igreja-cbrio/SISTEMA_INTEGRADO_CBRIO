const assert = require('assert');

process.env.INSC_QR_SECRET = 'segredo-de-teste-inventario-qr';
const {
  gerarTokenComprovante,
  verificarTokenComprovante,
  extrairToken,
  hashToken,
} = require('./inscricaoComprovante');

const id = '123e4567-e89b-12d3-a456-426614174000';
const token = gerarTokenComprovante(id);
assert.ok(/^[0-9a-f]{32}\.[0-9a-f]{20}$/.test(token), 'formato estável do token');
assert.equal(verificarTokenComprovante(token), id, 'roundtrip do comprovante');
assert.equal(extrairToken(`https://www.cbrio.org/i/c/${token}`), token, 'aceita URL completa do QR');
assert.ok(/^[0-9a-f]{64}$/.test(hashToken(token)), 'inventário guarda somente SHA-256');

const ultimo = token.slice(-1);
const adulterado = `${token.slice(0, -1)}${ultimo === '0' ? '1' : '0'}`;
assert.equal(verificarTokenComprovante(adulterado), null, 'assinatura adulterada é rejeitada');
assert.equal(verificarTokenComprovante('lixo'), null, 'lixo é rejeitado');

console.log('inscricaoComprovante: HMAC, extração e hash de inventário aprovados');
