import { describe, it, expect } from 'vitest';
import * as trecho from '../../backend/utils/trechoCep.js';

const { regiaoDeCep, trechoValido, rotuloTrecho, trechoTemMassa, MINIMO_POR_TRECHO } =
  trecho as {
    regiaoDeCep: (v: unknown) => string | null;
    trechoValido: (v: unknown) => boolean;
    rotuloTrecho: (r: unknown, b?: unknown) => string | null;
    trechoTemMassa: (n: unknown) => boolean;
    MINIMO_POR_TRECHO: number;
  };

describe('regiaoDeCep · espelho de vw_dem_pessoa.cep_regiao', () => {
  it('extrai os 5 primeiros dígitos do CEP completo', () => {
    expect(regiaoDeCep('22640-100')).toBe('22640');
    expect(regiaoDeCep('22640100')).toBe('22640');
    expect(regiaoDeCep(' 22.640-100 ')).toBe('22640');
  });

  // ⚠️⚠️ A GUARDA QUE MAIS IMPORTA. O censo já coletou 7 dígitos por engano
  // (registrado no CLAUDE.md: 7 dos 12 primeiros). Truncar os 7 daria um trecho
  // ERRADO — e trecho errado põe a pessoa no lugar errado do mapa, com cara de
  // dado bom. A view exige 8 pelo mesmo motivo.
  it('CEP incompleto é null, NUNCA os 5 primeiros do que veio', () => {
    expect(regiaoDeCep('2264010')).toBeNull();
    expect(regiaoDeCep('22640')).toBeNull();
    expect(regiaoDeCep('226')).toBeNull();
  });

  it('CEP longo demais também é null (não é CEP)', () => {
    expect(regiaoDeCep('226401000')).toBeNull();
  });

  it('vazio, nulo e lixo devolvem null sem estourar', () => {
    expect(regiaoDeCep('')).toBeNull();
    expect(regiaoDeCep(null)).toBeNull();
    expect(regiaoDeCep(undefined)).toBeNull();
    expect(regiaoDeCep('sem cep')).toBeNull();
  });

  it('CEP de fora do Rio funciona igual (membro mora onde mora)', () => {
    expect(regiaoDeCep('01310-100')).toBe('01310');
  });

  // Zero à esquerda é comum em SP e some se alguém tratar CEP como número.
  it('preserva zero à esquerda', () => {
    expect(regiaoDeCep('01001000')).toBe('01001');
  });
});

describe('trechoValido · o que a query string pode filtrar', () => {
  it('aceita exatamente 5 dígitos', () => {
    expect(trechoValido('22640')).toBe(true);
    expect(trechoValido('01001')).toBe(true);
  });

  it('recusa qualquer outro tamanho', () => {
    expect(trechoValido('2264')).toBe(false);
    expect(trechoValido('226400')).toBe(false);
    expect(trechoValido('22640100')).toBe(false);
    expect(trechoValido('')).toBe(false);
    expect(trechoValido(null)).toBe(false);
  });

  it('tolera máscara — o que conta são os dígitos', () => {
    expect(trechoValido('22.640')).toBe(true);
  });
});

describe('trechoTemMassa · o piso que protege a pessoa', () => {
  // ⚠️ ESPELHA o `>= 3` de fn_dem_perfil. Se este número mudar num lado só,
  // a tela desenha ponto que o servidor recusa filtrar (ou o contrário).
  it('o piso é 3', () => {
    expect(MINIMO_POR_TRECHO).toBe(3);
  });

  it('3 ou mais pessoas entram no mapa', () => {
    expect(trechoTemMassa(3)).toBe(true);
    expect(trechoTemMassa(57)).toBe(true);
  });

  // Um ponto de 1 ou 2 pessoas identifica quem mora ali quando o clique filtra
  // a tela inteira por gênero, idade, estado civil, escolaridade e profissão.
  it('1 e 2 pessoas NÃO entram', () => {
    expect(trechoTemMassa(1)).toBe(false);
    expect(trechoTemMassa(2)).toBe(false);
  });

  // ⚠️ Quem recusa estes casos é a COMPARAÇÃO (`NaN >= 3` é false, `Number(null)`
  // é 0), não a guarda de finitude — o mutante que remove `Number.isFinite`
  // sobrevive, e isso está declarado no próprio util. O que estes casos travam é
  // o contrário: alguém "simplificar" para `!!total` ou `total >= 3` sem Number,
  // onde `'5' >= 3` é true mas `'muitos' >= 3` também viraria comparação de texto.
  it('valor ausente ou não-numérico não tem massa', () => {
    expect(trechoTemMassa(null)).toBe(false);
    expect(trechoTemMassa(undefined)).toBe(false);
    expect(trechoTemMassa('muitos')).toBe(false);
    expect(trechoTemMassa(NaN)).toBe(false);
  });
});

describe('rotuloTrecho · faixa, nunca endereço', () => {
  // O rótulo é lido por humano e vai pro popup do mapa: "22640-000" pareceria
  // um CEP fechado, ou seja o endereço de alguém.
  it('mostra a faixa com xxx e o bairro quando existe', () => {
    expect(rotuloTrecho('22640', 'Barra da Tijuca')).toBe('22640-xxx · Barra da Tijuca');
  });

  it('sem bairro conhecido mostra só a faixa', () => {
    expect(rotuloTrecho('22640')).toBe('22640-xxx');
    expect(rotuloTrecho('22640', null)).toBe('22640-xxx');
  });

  it('trecho inválido não vira rótulo', () => {
    expect(rotuloTrecho('2264', 'Barra')).toBeNull();
    expect(rotuloTrecho('')).toBeNull();
  });
});
