import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { semComentariosJs } from './_semComentarios';

/**
 * Guarda do REM-01 da auditoria do banco (achado do revisor adversarial do
 * lote 4 · 09/09/2026 · confirmado ainda vivo em 16/09/2026).
 *
 * ⚠️⚠️ O DEFEITO NÃO ERA A REGRA, ERA O LUGAR DELA. A validação de CEP da
 * porta pública de membresia nasceu ANINHADA dentro do `if` do sexo, DEPOIS do
 * `return` daquele bloco — a chave de fechamento do gênero foi parar no fim da
 * linha do CEP (`}    }`). `node --check` passa, o lint passa, a regra existe
 * no arquivo e nunca cobrou nada: em 3 semanas, 142 dos 166 cadastros entraram
 * sem CEP. Código morto que PARECE guarda é pior que guarda ausente, porque
 * ninguém vai procurar de novo.
 *
 * ⚠️⚠️ POR ISSO A ASSERÇÃO É DE ALCANCE, NÃO DE PRESENÇA. Casar o texto
 * `if (!cepCompleto(cep))` passaria verde com o código quebrado — era
 * exatamente essa a forma que estava em produção. O que este teste prova é que
 * o `if` do CEP está FORA do bloco do sexo: acha onde o bloco do gênero fecha,
 * contando chaves, e exige que o CEP venha depois. O mutante fiel (re-aninhar)
 * derruba.
 *
 * ⚠️ E exige a condição de ORIGEM. Ligar a cobrança para todas as origens
 * fecharia a porta do censo: 141 dos 166 cadastros vieram por `qr_code`, cujo
 * formulário não pergunta CEP (medido 16/09/2026). A porta do site já coleta
 * (24 de 25 com CEP), e é só nela que o servidor cobra.
 */

const ARQ = resolve(__dirname, '../../backend/routes/publicMembresia.js');

function corpo(): string {
  return semComentariosJs(readFileSync(ARQ, 'utf8'));
}

/** Índice do `}` que fecha o bloco aberto pelo primeiro `{` a partir de `de`. */
function fechaBloco(src: string, de: number): number {
  const abre = src.indexOf('{', de);
  expect(abre, 'bloco do sexo sem `{`').toBeGreaterThan(-1);
  let profundidade = 0;
  for (let i = abre; i < src.length; i++) {
    if (src[i] === '{') profundidade++;
    else if (src[i] === '}') {
      profundidade--;
      if (profundidade === 0) return i;
    }
  }
  return -1;
}

describe('porta pública de membresia · o CEP é cobrado de verdade', () => {
  it('a validação de CEP está FORA do bloco do sexo (é alcançável)', () => {
    const src = corpo();

    const sexo = src.indexOf("if (!['masculino', 'feminino'].includes(generoNorm))");
    expect(sexo, 'sumiu a validação de sexo — reescreva esta guarda junto').toBeGreaterThan(-1);

    const fimDoSexo = fechaBloco(src, sexo);
    expect(fimDoSexo, 'bloco do sexo não fecha').toBeGreaterThan(-1);

    const cep = src.indexOf('cepCompleto(cep)');
    expect(cep, 'sumiu a cobrança de CEP na porta pública').toBeGreaterThan(-1);

    // O ponto do achado: dentro do bloco do sexo, depois do `return`, a linha
    // é inalcançável. Fora dele, e só fora, a regra vale.
    expect(
      cep,
      'a cobrança de CEP voltou para dentro do bloco do sexo — é código morto de novo (REM-01)',
    ).toBeGreaterThan(fimDoSexo);
  });

  it('cobra CEP só na porta do site, e exige os 8 dígitos', () => {
    const src = corpo();

    expect(
      /if \(origemFinal === 'site' && !cepCompleto\(cep\)\)/.test(src),
      'a cobrança de CEP deixou de ser restrita à origem `site` — o formulário do QR não pergunta CEP e 141 de 166 cadastros seriam recusados',
    ).toBe(true);

    // `cepCompleto` (8 dígitos), nunca "tem alguma coisa": CEP pela metade
    // entra parecendo endereço e o mapa do Perfil não posiciona a pessoa.
    expect(src).not.toMatch(/if \(origemFinal === 'site' && !String\(cep/);
  });

  it('a origem já está normalizada quando o CEP é cobrado', () => {
    const src = corpo();
    const origem = src.indexOf("const origemFinal = origemValida.includes(origem)");
    const cep = src.indexOf('cepCompleto(cep)');
    expect(origem, 'sumiu a normalização de origem').toBeGreaterThan(-1);
    expect(
      cep,
      '`origemFinal` é usada antes de existir — a cobrança de CEP quebraria a porta inteira com ReferenceError',
    ).toBeGreaterThan(origem);
  });
});
