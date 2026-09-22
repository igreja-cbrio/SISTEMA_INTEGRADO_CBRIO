// ⚠️⚠️ A JANELA RETROATIVA DO CHECK-IN, e o silêncio que ela escondia.
//
// Relato da Renata (via Matheus, 22/09/2026): os voluntários do Online servem
// mas **não passam pelo check-in do lanche**, então o ONL-17 ("% voluntários
// escalados que fizeram check-in corretamente") marcava 30,43% com todo mundo
// presente. Decisão: *"a ariel deve conseguir fazer o checkin retroativo e tbm a
// renta deve conseguir fazer o check ins dos voluntarios dela pelo app"*.
//
// ⚠️⚠️ A janela era de **7 dias** e o descarte era **SILENCIOSO**: data mais
// antiga caía no `now()` do banco sem nenhum erro. A Ariel lançaria o mês
// anterior inteiro e **tudo cairia no dia de hoje** — inflando setembro,
// deixando agosto vazio, e parecendo que tinha funcionado. O oposto do conserto.
//
// O descarte continua sendo FALLBACK e não 400, porque o totem offline manda
// datas antigas de propósito e derrubá-lo trocaria um silêncio por uma quebra.
// O que mudou é que a resposta DIZ que a data foi ignorada (`data_ajustada`).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const FONTE = readFileSync(join(__dirname, '..', '..', 'backend/routes/voluntariado.js'), 'utf8');
// ⚠️ A rota tem ~240 linhas: recortar por tamanho fixo cortava antes do
// `res.json` e o teste dava falso-verde sobre o aviso. Corta no próximo router.
const i = FONTE.indexOf("router.post('/check-ins'");
const resto = FONTE.slice(i + 10);
const fim = resto.search(/\nrouter\.(get|post|patch|put|delete)\(/);
const trecho = fim === -1 ? resto : resto.slice(0, fim);

describe('⚠️⚠️ check-in retroativo alcança o mês anterior', () => {
  it('a janela é de 60 dias, não de 7', () => {
    expect(trecho).toMatch(/JANELA_RETROATIVA_MS\s*=\s*60\s*\*\s*24\s*\*\s*60\s*\*\s*60\s*\*\s*1000/);
    expect(
      trecho.replace(/\/\/[^\n]*/g, ''),
      'com 7 dias o mês anterior inteiro caía no dia de hoje',
    ).not.toMatch(/ms >= now - 7 \* 24/);
  });

  it('⚠️ e o descarte deixou de ser silencioso', () => {
    expect(trecho).toMatch(/dataAjustada = true/);
    expect(trecho, 'sem isto, quem lança na mão não descobre que a data virou hoje')
      .toMatch(/data_ajustada: dataAjustada/);
  });

  it('⚠️ data futura continua recusada (tolerando o skew de 5 min do totem)', () => {
    expect(trecho).toMatch(/ms <= now \+ 5 \* 60 \* 1000/);
  });

  it('⚠️ e continua FALLBACK, não 400 — o totem offline manda data antiga de propósito', () => {
    const janela = trecho.slice(trecho.indexOf('JANELA_RETROATIVA_MS'), trecho.indexOf('JANELA_RETROATIVA_MS') + 900);
    expect(janela, 'derrubar o totem seria trocar um silêncio por uma quebra').not.toMatch(/res\.status\(400\)/);
  });
});
