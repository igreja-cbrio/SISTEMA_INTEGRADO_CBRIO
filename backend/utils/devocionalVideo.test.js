// Gate: o vídeo do devocional (25/09/2026). `npm run test:devocional-video`.
const assert = require('assert');
const V = require('./devocionalVideo');

assert.deepStrictEqual(V.validarVideo({ tipo: 'video/mp4', tamanho: 10 }), { ext: 'mp4' });
assert.deepStrictEqual(V.validarVideo({ tipo: 'VIDEO/QUICKTIME', tamanho: 10 }), { ext: 'mov' });
assert.ok(V.validarVideo({ tipo: 'image/png', tamanho: 10 }).erro, 'imagem não é vídeo');
assert.ok(V.validarVideo({ tipo: 'video/mp4', tamanho: 0 }).erro, 'tamanho zero');
assert.ok(V.validarVideo({ tipo: 'video/mp4', tamanho: V.LIMITE_BYTES + 1 }).erro, 'acima do limite');
assert.ok(!V.validarVideo({ tipo: 'video/mp4', tamanho: V.LIMITE_BYTES }).erro, 'no limite passa');

const id = '6def3d0f-4ed7-4f47-9e7c-ef1a5ab3c503';
const c = V.caminhoDoVideo(id, 'mp4', 1758800000000);
assert.strictEqual(c, `itens/${id}/1758800000000.mp4`);
assert.ok(V.caminhoEhDoItem(id, c));
// ⚠️ O caminho de OUTRO item não pode ser pendurado neste (senão um item
// passaria a apontar e, ao trocar, APAGAR o vídeo do outro).
assert.ok(!V.caminhoEhDoItem('outro-id', c));
assert.ok(!V.caminhoEhDoItem(id, `itens/${id}/../outro/1.mp4`));
assert.ok(!V.caminhoEhDoItem(id, `itens/${id}/1.exe`));
assert.ok(!V.caminhoEhDoItem(id, null));

// Link do YouTube: todos os formatos viram o canônico; o resto é recusado.
const CANON = 'https://www.youtube.com/watch?v=e2-TJDiAS0U';
for (const u of ['https://www.youtube.com/watch?v=e2-TJDiAS0U', 'https://youtu.be/e2-TJDiAS0U?si=x',
  'https://www.youtube.com/live/e2-TJDiAS0U', 'https://m.youtube.com/shorts/e2-TJDiAS0U',
  'https://youtube.com/watch?feature=share&v=e2-TJDiAS0U']) assert.strictEqual(V.linkDoYoutube(u), CANON, u);
assert.strictEqual(V.linkDoYoutube('https://vimeo.com/1'), null);
assert.strictEqual(V.linkDoYoutube('https://www.youtube.com/watch?v=curto'), null);
assert.strictEqual(V.linkDoYoutube(null), null);

console.log('✓ devocional-video: 21 asserções');
