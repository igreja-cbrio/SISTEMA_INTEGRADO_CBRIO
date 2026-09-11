// Gate: `npm run test:visitante` · roda com `node`, sem backend/node_modules.
// Réguas puras da porta pública /visitante (09/09/2026).
const assert = require('node:assert/strict');
const R = require('./visitanteRegras');
const fs = require('node:fs');
const path = require('node:path');

// ⚠️ Fuso FORÇADO: o gate roda em UTC e a régua do "culto acabou" mistura dia
// BRT + hora BRT — teste que não força TZ não guarda nada.
process.env.TZ = 'UTC';

const bodyOk = { nome: 'Ana Souza', telefone: '(21) 99876-5432', cpf: '529.982.247-25', aceite_lgpd: true, whatsapp_optin: true, local: 'lounge' };

// ── validarVisitante ────────────────────────────────────────────────────────
{
  const v = R.validarVisitante(bodyOk);
  assert.equal(v.ok, true);
  assert.deepEqual(v.valores, { nome: 'Ana Souza', telefone: '21998765432', cpf: '52998224725', whatsapp_optin: true, local: 'lounge' });
}
assert.equal(R.validarVisitante({ ...bodyOk, nome: 'A' }).campo, 'nome');
assert.equal(R.validarVisitante({ ...bodyOk, telefone: '2199876' }).campo, 'telefone', '7 dígitos não é telefone');
assert.equal(R.validarVisitante({ ...bodyOk, telefone: '5521998765432' }).valores.telefone, '21998765432', 'DDI 55 sai quando sobra número inteiro');
assert.equal(R.validarVisitante({ ...bodyOk, telefone: '55219987654' }).valores.telefone, '55219987654', 'DDD 55 (Santa Maria) NÃO é DDI');
assert.equal(R.validarVisitante({ ...bodyOk, cpf: '123' }).campo, 'cpf');
assert.equal(R.validarVisitante({ ...bodyOk, cpf: '11111111111' }).campo, 'cpf', 'sequência repetida');
assert.equal(R.validarVisitante({ ...bodyOk, cpf: '52998224726' }).campo, 'cpf', 'DV errado');
assert.equal(R.validarVisitante({ ...bodyOk, aceite_lgpd: 'true' }).campo, 'aceite_lgpd', 'string "true" não é aceite');
assert.equal(R.validarVisitante({ ...bodyOk, aceite_lgpd: 1 }).campo, 'aceite_lgpd');
assert.equal(R.validarVisitante({ ...bodyOk, whatsapp_optin: 'sim' }).valores.whatsapp_optin, false, 'opt-in só com true literal');
assert.equal(R.validarVisitante({ ...bodyOk, whatsapp_optin: undefined }).valores.whatsapp_optin, false);
assert.equal(R.validarVisitante({ ...bodyOk, local: 'Palco' }).valores.local, 'outro', 'local desconhecido cai em outro, não recusa');
assert.equal(R.validarVisitante({ ...bodyOk, local: 'TEMPLO' }).valores.local, 'templo');
assert.equal(R.validarVisitante(null).ok, false);
assert.equal(R.validarVisitante({ ...bodyOk, nome: '  Ana   Souza  ' }).valores.nome, 'Ana Souza', 'espaços colapsam');

// ── LOCAIS · lista fechada com id único e chamada pro cartaz ────────────────
assert.equal(new Set(R.IDS_LOCAIS).size, R.IDS_LOCAIS.length);
assert.ok(R.IDS_LOCAIS.includes('outro'), 'precisa existir o balde "outro"');
for (const l of R.LOCAIS) assert.ok(l.nome && l.chamada, `local ${l.id} sem nome/chamada`);

// ── voucher · alfabeto sem O/0/I/1 · 6 chars · normalização do balcão ───────
{
  const seq = [0, 1, 2, 3, 4, 5];
  let i = 0;
  const cod = R.gerarCodigoVoucher(() => seq[i++ % seq.length]);
  assert.equal(cod, 'ABCDEF');
  const real = R.gerarCodigoVoucher();
  assert.match(real, /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/);
  assert.equal(R.normalizarCodigoVoucher(' ab-c def '), 'ABCDEF');
}

// ── pesquisaDevida · a hora certa depois do culto ───────────────────────────
// Domingo 13/09/2026 · culto 11:30 BRT (= 14:30 UTC) · registro às 11:40 BRT.
const registro = '2026-09-13T14:40:00Z';
const base = { registradoEm: registro, cultoData: '2026-09-13', cultoHora: '11:30:00', whatsappOptin: true, pesquisaEnviadaEm: null };
assert.equal(R.pesquisaDevida({ ...base, agora: Date.parse('2026-09-13T15:30:00Z') }), 'aguardar', 'no meio do culto não sai');
assert.equal(R.pesquisaDevida({ ...base, agora: Date.parse('2026-09-13T16:59:00Z') }), 'aguardar', '1 min antes de 2h30 do início');
assert.equal(R.pesquisaDevida({ ...base, agora: Date.parse('2026-09-13T17:00:00Z') }), 'enviar', '11:30 + 2h30 = 14:00 BRT = 17:00 UTC');
assert.equal(R.pesquisaDevida({ ...base, agora: Date.parse('2026-09-16T14:41:00Z') }), 'expirada', '72h depois do registro não sai mais');
assert.equal(R.pesquisaDevida({ ...base, whatsappOptin: false, agora: Date.parse('2026-09-13T18:00:00Z') }), 'nao_elegivel');
assert.equal(R.pesquisaDevida({ ...base, pesquisaEnviadaEm: '2026-09-13T17:05:00Z', agora: Date.parse('2026-09-13T18:00:00Z') }), 'ja_enviada');
// Registro DEPOIS do culto (preencheu na saída às 14:10 BRT): conta do registro + 30 min.
assert.equal(R.pesquisaDevida({ ...base, registradoEm: '2026-09-13T17:10:00Z', agora: Date.parse('2026-09-13T17:30:00Z') }), 'aguardar');
assert.equal(R.pesquisaDevida({ ...base, registradoEm: '2026-09-13T17:10:00Z', agora: Date.parse('2026-09-13T17:40:00Z') }), 'enviar');
// Sem culto atribuído: 2h depois do registro.
assert.equal(R.pesquisaDevida({ ...base, cultoData: null, cultoHora: null, agora: Date.parse('2026-09-13T16:39:00Z') }), 'aguardar');
assert.equal(R.pesquisaDevida({ ...base, cultoData: null, cultoHora: null, agora: Date.parse('2026-09-13T16:40:00Z') }), 'enviar');
// Culto da noite (19:00 BRT = 22:00 UTC) · registro 18:50 BRT · devida 21:30 BRT = 00:30 UTC do DIA SEGUINTE.
assert.equal(R.pesquisaDevida({ ...base, registradoEm: '2026-09-13T21:50:00Z', cultoHora: '19:00', agora: Date.parse('2026-09-14T00:29:00Z') }), 'aguardar');
assert.equal(R.pesquisaDevida({ ...base, registradoEm: '2026-09-13T21:50:00Z', cultoHora: '19:00', agora: Date.parse('2026-09-14T00:30:00Z') }), 'enviar', 'vira o dia UTC e continua certo');
// Hora inválida → cai na régua sem culto.
assert.equal(R.pesquisaDevida({ ...base, cultoHora: 'xx', agora: Date.parse('2026-09-13T16:40:00Z') }), 'enviar');

// ── nota · 1..5 inteiro ─────────────────────────────────────────────────────
assert.equal(R.normalizarNota('4'), 4);
assert.equal(R.normalizarNota(0), null);
assert.equal(R.normalizarNota(6), null);
assert.equal(R.normalizarNota(3.5), null);
assert.equal(R.primeiroNome('  maria clara '), 'maria');
assert.equal(R.primeiroNome(''), 'Olá');

// ── token · namespace próprio · fail-closed ─────────────────────────────────
{
  const T = require('./visitanteToken');
  const antes = process.env.VISITANTE_TOKEN_SECRET;
  const antesCron = process.env.CRON_SECRET;
  delete process.env.VISITANTE_TOKEN_SECRET; delete process.env.CRON_SECRET;
  assert.equal(T.gerarTokenPesquisa('0f2b7e4c-1111-4222-8333-444455556666'), null, 'sem segredo não gera');
  assert.equal(T.montarLinkPesquisa('0f2b7e4c-1111-4222-8333-444455556666'), null);
  process.env.VISITANTE_TOKEN_SECRET = 'segredo-de-teste';
  const id = '0f2b7e4c-1111-4222-8333-444455556666';
  const tok = T.gerarTokenPesquisa(id);
  assert.match(tok, /^[0-9a-f]{32}\.[0-9a-f]{20}$/);
  assert.equal(T.verificarTokenPesquisa(tok), id);
  assert.equal(T.verificarTokenPesquisa(tok.slice(0, -1) + (tok.endsWith('a') ? 'b' : 'a')), null, 'assinatura alterada');
  assert.equal(T.verificarTokenPesquisa('lixo'), null);
  // Token do namespace da DECISÃO com o mesmo segredo NÃO é aceito aqui.
  const D = require('./decisaoToken');
  process.env.CULTO_TOKEN_SECRET = 'segredo-de-teste';
  const tokDecisao = D.gerarTokenDecisao(id);
  assert.notEqual(tokDecisao, tok);
  assert.equal(T.verificarTokenPesquisa(tokDecisao), null, 'namespace diferente = recusado');
  assert.equal(T.montarLinkPesquisa(id, 'https://www.cbrio.org/'), `https://www.cbrio.org/visitante/avaliar/${tok}`);
  delete process.env.CULTO_TOKEN_SECRET;
  if (antes) process.env.VISITANTE_TOKEN_SECRET = antes; else delete process.env.VISITANTE_TOKEN_SECRET;
  if (antesCron) process.env.CRON_SECRET = antesCron;
}

// ── resposta pelo WhatsApp · botão/dígito vira nota · texto vira comentário ──
{
  const P = require('./respostaPesquisaVisitante');
  // ⚠️⚠️ OS TRÊS BOTÕES DO TEMPLATE VIVO (aprovado na Meta em 11/09/2026).
  // O texto deles NÃO começa por dígito, então quem os lê é o mapa
  // BOTOES_TEXTO. Se este bloco ficar vermelho, a pessoa toca no botão e a
  // nota NÃO é gravada — e o webhook responde 200, então ninguém percebe.
  // Mudou o rótulo na Meta? Muda o mapa E estes casos, juntos.
  assert.equal(P.BOTOES_TEXTO.length, 3, 'o template vivo tem 3 botões');
  assert.equal(P.interpretarNotaVisitante('Amei o culto, me senti em casa'), 5);
  assert.equal(P.interpretarNotaVisitante('Eu gostei, o culto foi bom'), 4);
  assert.equal(P.interpretarNotaVisitante('Não gostei, poderia ser melhor'), 2);
  // caixa e acento não podem decidir se a nota entra
  assert.equal(P.interpretarNotaVisitante('AMEI O CULTO, ME SENTI EM CASA'), 5);
  assert.equal(P.interpretarNotaVisitante('nao gostei, poderia ser melhor'), 2);
  assert.equal(P.interpretarNotaVisitante('  Eu gostei, o culto foi bom  '), 4);
  // ⚠️ frase PARECIDA não é botão: só o rótulo INTEIRO casa. Senão qualquer
  // comentário elogioso viraria nota e o comentário se perderia.
  assert.equal(P.interpretarNotaVisitante('o culto foi bom demais'), null);
  assert.equal(P.interpretarNotaVisitante('amei'), null);
  assert.equal(P.interpretarNotaVisitante('não gostei'), null);
  // e o rótulo do botão NÃO pode ser lido como comentário
  for (const b of P.BOTOES_TEXTO) assert.equal(P.ehComentario(b.texto), false, `"${b.texto}" é botão, não comentário`);

  assert.equal(P.BOTOES_NOTA.length, 5);
  for (const b of P.BOTOES_NOTA) assert.ok(b.length <= 25, `botão "${b}" passa de 25 chars (limite da Meta)`);
  P.BOTOES_NOTA.forEach((b, i) => assert.equal(P.interpretarNotaVisitante(b), i + 1, `botão "${b}" → ${i + 1}`));
  assert.equal(P.interpretarNotaVisitante('5'), 5);
  assert.equal(P.interpretarNotaVisitante(' 3. '), 3);
  assert.equal(P.interpretarNotaVisitante('nota 4'), 4);
  assert.equal(P.interpretarNotaVisitante('⭐⭐⭐⭐'), 4);
  assert.equal(P.interpretarNotaVisitante('2 estrelas'), 2);
  assert.equal(P.interpretarNotaVisitante('6'), null, 'fora de 1..5');
  assert.equal(P.interpretarNotaVisitante('0'), null);
  assert.equal(P.interpretarNotaVisitante('cheguei 5 minutos atrasado'), null, 'dígito no meio da frase não é nota');
  assert.equal(P.interpretarNotaVisitante('5 minutos'), null);
  assert.equal(P.interpretarNotaVisitante('adorei, nota 10'), null);
  assert.equal(P.ehComentario('Adorei o louvor, muito acolhedor'), true);
  assert.equal(P.ehComentario('5 · Excelente'), false, 'botão não é comentário');
  assert.equal(P.ehComentario('4'), false);
  assert.equal(P.ehComentario('👍'), false, 'só emoji não é comentário');
  assert.match(P.textoObrigado('Ana', 5), /Ana/);
  // ⚠️ quem toca em "Amei o culto, me senti em casa" NUNCA viu número: o
  // agradecimento não pode devolver "nota 5" e fazer ela achar que errou.
  for (const n of [1, 2, 3, 4, 5]) {
    assert.ok(!/\bnota\b/i.test(P.textoObrigado('Ana', n)), `nota ${n} vazou no agradecimento`);
    assert.ok(!new RegExp(`\\b${n}\\b`).test(P.textoObrigado('Ana', n)), `o número ${n} vazou no agradecimento`);
  }
  assert.match(P.textoObrigado('Ana', 2), /melhorar/i);
  assert.ok(P.textoObrigado('', 4).length > 10);
  // o FORMULÁRIO (Flow): response_json chega como STRING
  assert.deepEqual(P.interpretarRespostaFlowVisitante('{"nota":"4","comentario":" Adorei o louvor ","flow_token":"unused"}'), { nota: 4, comentario: 'Adorei o louvor' });
  assert.deepEqual(P.interpretarRespostaFlowVisitante({ nota: 5 }), { nota: 5, comentario: null });
  assert.deepEqual(P.interpretarRespostaFlowVisitante({ nota: '2', comentario: '' }), { nota: 2, comentario: null });
  assert.equal(P.interpretarRespostaFlowVisitante({ nota: '7' }), null, 'fora de 1..5 não é nosso');
  assert.equal(P.interpretarRespostaFlowVisitante({ comentario: 'x' }), null, 'sem nota não é nosso');
  assert.equal(P.interpretarRespostaFlowVisitante('{lixo'), null);
  assert.equal(P.interpretarRespostaFlowVisitante(null), null);
  assert.equal(P.interpretarRespostaFlowVisitante({ nota: '3', comentario: 'a'.repeat(2000) }).comentario.length, 1000, 'comentário capado em 1000');
  // o JSON do Flow no repo é válido e os ids das opções são as notas 1..5
  const flow = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'whatsapp-flows', 'visitante-avaliacao.json'), 'utf8'));
  const radio = flow.screens[0].layout.children.find((c) => c.type === 'Form').children.find((c) => c.name === 'nota');
  assert.deepEqual(radio['data-source'].map((o) => o.id).sort(), ['1', '2', '3', '4', '5']);
  assert.equal(flow.screens[0].terminal, true);
}

// ── Guarda estática: utils/ não pode puxar Supabase (o gate roda sem node_modules) ──
for (const f of ['visitanteRegras.js', 'visitanteToken.js', 'respostaPesquisaVisitante.js']) {
  const src = fs.readFileSync(path.join(__dirname, f), 'utf8');
  assert.ok(!/require\(['"]\.\.\/utils\/supabase|require\(['"]\.\/supabase|@supabase/.test(src), `${f} não pode carregar Supabase`);
}

console.log('visitanteRegras: OK');
