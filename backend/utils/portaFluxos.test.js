// Gate: a régua dos FLUXOS DE PORTA (11/09/2026). `npm run test:fluxo-porta`.
//
// ⚠️⚠️ O que este teste protege, em uma frase: que a igreja seja cobrada PELO
// QUE ELA DEVE e por mais nada, e que todo fluxo consiga FECHAR. As duas coisas
// vêm de medição, não de gosto: em 90 dias o convertido teve 147/153 primeiros
// contatos e ZERO desfechos, porque o passo sem tela não existe na prática.
const assert = require('assert');
const F = require('./portaFluxos');

const AGORA = new Date('2026-09-14T15:00:00-03:00'); // segunda, 15h BRT
const DOMINGO = '2026-09-13T11:40:00-03:00';         // visita do culto de domingo

function visita(extra) {
  return { created_at: DOMINGO, voucher_status: 'emitido', ...extra };
}
function estado(registro, acoes, agora) {
  return F.estadoDoFluxo({ porta: 'visitante', registro, acoes: acoes || {}, agora: agora || AGORA });
}
function sit(st, chave) {
  return st.etapas.find((e) => e.chave === chave).situacao;
}

// ── o catálogo ──────────────────────────────────────────────────────────────
assert.deepEqual(F.PORTAS, ['visitante'], 'só a porta do visitante por enquanto');
const fx = F.fluxoDaPorta('visitante');
assert.equal(fx.refTipo, 'vis_visitas');
assert.equal(F.fluxoDaPorta('nao_existe'), null);
assert.equal(F.fluxoDaPorta(), null);
// ⚠️ TODA porta tem que ter exatamente UMA etapa que encerra. Fluxo que não
// fecha foi o defeito medido no convertido (0 desfechos em 90 dias).
// ⚠️ E nenhuma etapa que depende da pessoa pode ficar 'atrasado' em situação
// alguma — varrido aqui pra toda porta que existir no futuro.
for (const p of F.PORTAS) {
  const enc = F.fluxoDaPorta(p).etapas.filter((e) => e.encerra);
  assert.equal(enc.length, 1, `a porta ${p} precisa de exatamente uma etapa que encerra`);
  assert.equal(enc[0].dependeDaPessoa, undefined, 'quem encerra é a igreja, nunca a pessoa');
}
for (const p of F.PORTAS) {
  const fl = F.fluxoDaPorta(p);
  for (const e of fl.etapas.filter((x) => x.dependeDaPessoa)) {
    for (const quando of ['2026-09-13T12:00:00-03:00', '2026-09-14T15:00:00-03:00', '2027-01-01T00:00:00-03:00']) {
      const s = F.situacaoEtapa({ porta: p, etapa: e, registro: { created_at: DOMINGO }, acoes: {}, agora: new Date(quando) });
      assert.notEqual(s, 'atrasado', `${p}/${e.chave} acusou a pessoa de atraso em ${quando}`);
      assert.notEqual(s, 'vence_hoje', `${p}/${e.chave} cobrou prazo da pessoa em ${quando}`);
    }
  }
}

// ⚠️ Chaves únicas: duas etapas com a mesma chave fariam a ação de uma marcar a outra.
for (const p of F.PORTAS) {
  const ch = F.fluxoDaPorta(p).etapas.map((e) => e.chave);
  assert.equal(new Set(ch).size, ch.length, `chaves repetidas na porta ${p}`);
}

// ⚠️⚠️ LEI 1 · só é cobrado o que é DEVER DA IGREJA.
// Se isto ficar vermelho, o painel passa a acusar a igreja porque a visitante
// não quis o café — e painel injusto para de ser olhado.
assert.deepEqual(F.etapasCobradas('visitante').map((e) => e.chave), ['contato', 'desfecho']);
for (const e of F.fluxoDaPorta('visitante').etapas) {
  if (['registro', 'voucher', 'pesquisa'].includes(e.chave)) {
    assert.equal(e.dependeDaPessoa, true, `${e.chave} depende da pessoa e não pode ser cobrado`);
  }
}

// ── prazo: conta em DIA BRT e vence no FIM do dia ───────────────────────────
// Visita domingo 13/09 11h40. "No dia seguinte" (prazoDias 1) vence na
// meia-noite de 14 pra 15 — e não 24h depois do preenchimento.
assert.equal(F.prazoDaEtapa(DOMINGO, 1), Date.parse('2026-09-15T00:00:00-03:00'));
assert.equal(F.prazoDaEtapa(DOMINGO, 0), Date.parse('2026-09-14T00:00:00-03:00'));
assert.equal(F.prazoDaEtapa(DOMINGO, 3), Date.parse('2026-09-17T00:00:00-03:00'));
// ⚠️ culto da NOITE: 19h BRT é 22h UTC do mesmo dia; o prazo não pode escorregar um dia.
assert.equal(F.prazoDaEtapa('2026-09-13T19:30:00-03:00', 1), Date.parse('2026-09-15T00:00:00-03:00'));
// ⚠️ e a virada: 23h50 de domingo ainda é domingo em BRT (é 02h50 de segunda em UTC)
assert.equal(F.prazoDaEtapa('2026-09-13T23:50:00-03:00', 1), Date.parse('2026-09-15T00:00:00-03:00'));
assert.equal(F.prazoDaEtapa('data-invalida', 1), null);

// ── o retrato de uma pessoa ─────────────────────────────────────────────────
{
  // segunda 15h: o contato vence HOJE, o desfecho ainda tem prazo
  const st = estado(visita());
  assert.equal(sit(st, 'registro'), 'feito', 'quem está na lista registrou');
  // ⚠️⚠️ o café ainda não retirado é 'aguardando', NUNCA 'atrasado': a pessoa
  // não deve nada à igreja. O prazo dele já passou (vencia à meia-noite) e
  // mesmo assim não pode virar acusação.
  assert.equal(sit(st, 'voucher'), 'aguardando');
  assert.equal(sit(st, 'pesquisa'), 'aguardando');
  assert.equal(sit(st, 'contato'), 'vence_hoje');
  assert.equal(sit(st, 'desfecho'), 'no_prazo');
  assert.equal(st.atual, 'contato', 'o que a equipe tem que fazer agora');
  assert.equal(st.encerrado, false);
  assert.deepEqual(st.atrasadas, []);
  assert.equal(st.cobradas_pendentes, 2);
}
{
  // terça: o contato passou do prazo
  const st = estado(visita(), {}, new Date('2026-09-15T09:00:00-03:00'));
  assert.equal(sit(st, 'contato'), 'atrasado');
  assert.deepEqual(st.atrasadas, ['contato']);
}
{
  // contato feito -> some da cobrança, e o atual vira o desfecho
  const st = estado(visita({ primeiro_contato_em: '2026-09-14T10:00:00-03:00' }));
  assert.equal(sit(st, 'contato'), 'feito');
  assert.equal(st.atual, 'desfecho');
  assert.equal(st.cobradas_pendentes, 1);
}
{
  // voucher retirado é etapa da PESSOA: vira 'feito' no retrato e nada muda na cobrança
  const st = estado(visita({ voucher_status: 'resgatado', voucher_resgatado_em: '2026-09-13T12:10:00-03:00' }));
  assert.equal(sit(st, 'voucher'), 'feito');
  assert.equal(st.etapas.find((e) => e.chave === 'voucher').feito_em, Date.parse('2026-09-13T12:10:00-03:00'));
  assert.equal(st.atual, 'contato', 'o café não adianta nem atrasa o dever da igreja');
}
{
  // voucher 'repetido' (já tinha ganhado antes) NÃO é retirada
  assert.equal(sit(estado(visita({ voucher_status: 'repetido' })), 'voucher'), 'aguardando');
}

// ── LEI 3 · o fluxo FECHA, e fechar dispensa o resto ────────────────────────
{
  const acoes = { desfecho: { resultado: 'sem_necessidade', feito_em: '2026-09-14T18:00:00-03:00' } };
  const st = estado(visita(), acoes, new Date('2026-09-20T09:00:00-03:00'));
  assert.equal(st.encerrado, true);
  assert.equal(st.desfecho, 'sem_necessidade');
  assert.equal(sit(st, 'desfecho'), 'feito');
  // ⚠️ o contato nunca foi feito, mas o fluxo fechou: cobrar agora é cobrar
  // trabalho que ninguém deve fazer.
  assert.equal(sit(st, 'contato'), 'dispensada');
  assert.deepEqual(st.atrasadas, [], 'fluxo encerrado não tem atraso');
  assert.equal(st.atual, null, 'nada pendente depois de encerrado');
  assert.equal(st.cobradas_pendentes, 0);
}
{
  const acoes = { desfecho: { resultado: 'encaminhada', encaminhamento: 'grupo', feito_em: '2026-09-14T18:00:00-03:00' } };
  const st = estado(visita({ primeiro_contato_em: '2026-09-14T10:00:00-03:00' }), acoes);
  assert.equal(st.desfecho, 'encaminhada');
  assert.equal(st.encaminhamento, 'grupo');
}
// ⚠️⚠️ CONTRATO DA API: o objeto que atravessa a rota usa snake_case. Se a
// chave voltar a ser camelCase, a tela lê `undefined`, trata TODA etapa como
// dever da igreja e passa a acusar a visitante de não ter tomado café — em
// silêncio, porque undefined é falsy e nada quebra.
{
  const st = estado(visita());
  const voucher = st.etapas.find((e) => e.chave === 'voucher');
  assert.equal(voucher.depende_da_pessoa, true, 'a etapa sai com depende_da_pessoa');
  assert.equal('dependeDaPessoa' in voucher, false, 'camelCase não pode vazar pra API');
  assert.equal(st.etapas.find((e) => e.chave === 'contato').depende_da_pessoa, false);
  // e as chaves que a tela consome existem todas
  for (const k of ['chave', 'label', 'quem', 'depende_da_pessoa', 'encerra', 'prazo_em', 'feito_em', 'situacao']) {
    assert.ok(k in voucher, `falta ${k} no objeto da etapa`);
  }
}

assert.equal(estado(null), null, 'sem registro não há retrato');
assert.equal(F.estadoDoFluxo({ porta: 'xpto', registro: visita() }), null);

// ── a adesão · o número que responde "está sendo seguido?" ──────────────────
{
  const itens = [
    // 1) tudo feito
    { registro: visita({ primeiro_contato_em: '2026-09-14T10:00:00-03:00' }),
      acoes: { desfecho: { resultado: 'sem_necessidade', feito_em: '2026-09-14T11:00:00-03:00' } } },
    // 2) contato feito, desfecho atrasado
    { registro: visita({ primeiro_contato_em: '2026-09-14T10:00:00-03:00' }), acoes: {} },
    // 3) nada feito
    { registro: visita(), acoes: {} },
  ];
  const ad = F.adesaoDoFluxo({ porta: 'visitante', itens, agora: new Date('2026-09-20T09:00:00-03:00') });
  assert.equal(ad.pessoas, 3);
  assert.equal(ad.encerrados, 1);
  assert.equal(ad.por_etapa.contato.feito, 2);
  assert.equal(ad.por_etapa.contato.atrasado, 1);
  assert.equal(ad.por_etapa.desfecho.feito, 1);
  assert.equal(ad.por_etapa.desfecho.atrasado, 2);
  // feitas 3 de 6 vencidas
  assert.equal(ad.vencidas, 6);
  assert.equal(ad.adesao_pct, 50);
  // ⚠️ a etapa que depende da pessoa NÃO aparece na cobrança
  assert.equal(ad.por_etapa.voucher, undefined, 'café não entra na adesão');
  assert.equal(ad.por_etapa.pesquisa, undefined, 'pesquisa não entra na adesão');
}
{
  // ⚠️⚠️ NADA VENCEU AINDA ⇒ adesão é null, nunca 0% nem 100%. Percentual sobre
  // zero é mentira com cara de número: no domingo de manhã a tela diria
  // "0% de adesão" com a equipe em dia.
  const ad = F.adesaoDoFluxo({ porta: 'visitante', itens: [{ registro: visita(), acoes: {} }], agora: new Date('2026-09-13T12:00:00-03:00') });
  assert.equal(ad.adesao_pct, null);
  assert.equal(ad.vencidas, 0);
  assert.equal(ad.pessoas, 1);
}
assert.deepEqual(F.adesaoDoFluxo({ porta: 'visitante', itens: [] }).por_etapa.contato,
  { label: 'Falar com ela', feito: 0, atrasado: 0, no_prazo: 0, dispensada: 0 });
assert.equal(F.adesaoDoFluxo({ porta: 'xpto', itens: [] }), null);

// ── o desfecho que a tela manda ─────────────────────────────────────────────
assert.equal(F.validarDesfecho({ resultado: 'sem_necessidade' }).ok, true);
assert.equal(F.validarDesfecho({ resultado: 'nao_alcancada' }).ok, true);
assert.equal(F.validarDesfecho({ resultado: 'encaminhada', encaminhamento: 'next' }).ok, true);
// ⚠️ "encaminhei" SEM destino é o buraco que fez o convertido ter 2
// direcionamentos em 90 dias: se não for obrigatório, ninguém preenche.
assert.equal(F.validarDesfecho({ resultado: 'encaminhada' }).ok, false);
assert.equal(F.validarDesfecho({ resultado: 'encaminhada', encaminhamento: '  ' }).ok, false);
// ⚠️ VAZIO e ERRADO são erros DIFERENTES, e a diferença é o que a pessoa lê.
// Dizer "destino desconhecido" pra quem deixou em branco é mandar procurar um
// defeito que não existe. (Foi um mutante equivalente que mostrou isto: tirar
// a guarda do vazio ainda recusava, só que com a mensagem errada.)
{
  const vazio = F.validarDesfecho({ resultado: 'encaminhada' });
  const errado = F.validarDesfecho({ resultado: 'encaminhada', encaminhamento: 'padaria' });
  assert.match(vazio.erro, /para onde/i, 'o erro do campo vazio pede o destino');
  assert.notEqual(vazio.erro, errado.erro, 'em branco e inválido não podem dar a mesma mensagem');
  assert.equal(vazio.campo, 'encaminhamento');
  assert.equal(errado.campo, 'encaminhamento');
}
assert.equal(F.validarDesfecho({ resultado: 'encaminhada', encaminhamento: 'padaria' }).ok, false);
assert.equal(F.validarDesfecho({ resultado: '' }).ok, false);
assert.equal(F.validarDesfecho({}).ok, false);
assert.equal(F.validarDesfecho({ resultado: 'encerrado' }).ok, false, 'valor fora da lista é recusado');
// destino esquisito junto de desfecho que não exige: também recusa (o dado é decisão)
assert.equal(F.validarDesfecho({ resultado: 'sem_necessidade', encaminhamento: 'padaria' }).ok, false);
assert.equal(F.validarDesfecho({ resultado: 'sem_necessidade', encaminhamento: 'grupo' }).encaminhamento, 'grupo');
assert.equal(F.validarDesfecho({ resultado: 'sem_necessidade' }).encaminhamento, null);

// ── Guarda estática: a régua não pode puxar Supabase (o gate roda sem node_modules) ──
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, 'portaFluxos.js'), 'utf8');
assert.ok(!/require\(['"]\.\.\/utils\/supabase|require\(['"]\.\/supabase|@supabase/.test(src),
  'portaFluxos.js não pode carregar Supabase');

console.log('portaFluxos: OK');
