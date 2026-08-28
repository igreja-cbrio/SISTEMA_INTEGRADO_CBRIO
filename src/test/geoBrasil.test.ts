// `normalizarBairro` é ESPELHO de `nullif(f_unaccent(lower(trim(bairro))), '')`
// — a expressão que `vw_dem_pessoa.bairro_norm_raw` usa para montar a chave de
// `dem_bairro_geo`.
//
// ⚠️⚠️ POR QUE ISTO É TESTADO: se as duas normalizações divergirem, o backend
// grava o centróide numa chave que a view nunca procura. O efeito não é erro
// nenhum — é o mapa ficar vazio depois de o lote dizer "resolvido", e ninguém
// consegue ligar uma coisa à outra.
//
// ⚠️ As 12 saídas esperadas NÃO foram deduzidas: foram medidas em produção
// (23/08/2026) rodando `select public.f_unaccent(lower(trim(t)))` sobre as
// mesmas 12 entradas. Só o caso do espaço em branco difere de propósito — o
// SQL devolve string vazia e o `nullif` da view a transforma em NULL, que é o
// `null` que o JS devolve direto.
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require_ = createRequire(import.meta.url);
const { normalizarBairro, dentroDoRio, CAIXA_RJ } =
  require_('../../backend/services/geoBrasil.js');

describe('normalizarBairro · espelho de f_unaccent(lower(trim()))', () => {
  // [entrada, saída medida no Postgres de produção]
  const casos: [string, string | null][] = [
    ['Barra da Tijuca', 'barra da tijuca'],
    ['  Copacabana  ', 'copacabana'],
    ['São Conrado', 'sao conrado'],
    ['Jacarepaguá', 'jacarepagua'],
    ['Freguesia (Jacarepaguá)', 'freguesia (jacarepagua)'],
    ['MARECHAL HERMES', 'marechal hermes'],
    ['Água Santa', 'agua santa'],
    ['Praça Seca', 'praca seca'],
    ['Vila Isabel / Grajaú', 'vila isabel / grajau'],
    ['Niterói - Icaraí', 'niteroi - icarai'],
    ['Penha Circular 2', 'penha circular 2'],
    // No SQL vira '' e o nullif da view o transforma em NULL.
    ['   ', null],
  ];
  for (const [entrada, esperado] of casos) {
    it(`${JSON.stringify(entrada)} → ${JSON.stringify(esperado)}`, () => {
      expect(normalizarBairro(entrada)).toBe(esperado);
    });
  }

  it('ausência de bairro é null, nunca string vazia', () => {
    // A view devolve NULL nos três casos, e `dem_bairro_geo.bairro_norm` é PK:
    // gravar '' criaria uma linha "bairro sem nome" que o mapa desenharia.
    expect(normalizarBairro('')).toBeNull();
    expect(normalizarBairro(null)).toBeNull();
    expect(normalizarBairro(undefined)).toBeNull();
  });

  it('acento é REMOVIDO, não só minusculizado', () => {
    // Mutante: tirar o .normalize('NFD').replace(...) deixa 'são conrado', que
    // nunca casa com a chave da view — e o mapa fica vazio em silêncio.
    expect(normalizarBairro('São Conrado')).not.toContain('ã');
    expect(normalizarBairro('Jacarepaguá')).not.toContain('á');
  });

  it('NFC e NFD do mesmo nome dão a MESMA chave', () => {
    // O que vem do ViaCEP e o que vem do teclado de quem digita podem estar em
    // formas Unicode diferentes; a chave tem que ser uma só.
    expect(normalizarBairro('São Conrado'.normalize('NFC')))
      .toBe(normalizarBairro('São Conrado'.normalize('NFD')));
  });
});

describe('dentroDoRio · a caixa que protege o centróide de bairro', () => {
  it('aceita coordenada do Rio metropolitano', () => {
    expect(dentroDoRio(-22.9068, -43.1729)).toBe(true);  // Centro do Rio
    expect(dentroDoRio(-22.8833, -43.1036)).toBe(true);  // Niterói
    expect(dentroDoRio(-22.7561, -43.4603)).toBe(true);  // Duque de Caxias
  });

  it('recusa homônimo em outro estado', () => {
    // É este caso que a caixa existe para pegar: "Centro" casa em qualquer
    // cidade do Brasil, e um pino em Santa Catarina faz o fitBounds do mapa
    // fugir do Rio para caber nele.
    expect(dentroDoRio(-27.5954, -48.5480)).toBe(false); // Florianópolis
    expect(dentroDoRio(-23.5505, -46.6333)).toBe(false); // São Paulo
    expect(dentroDoRio(-19.9167, -43.9345)).toBe(false); // Belo Horizonte
  });

  it('coordenada ilegível NUNCA passa', () => {
    // Fail-closed: NaN/null virando `true` gravaria lixo como centróide.
    expect(dentroDoRio(NaN, NaN)).toBe(false);
    expect(dentroDoRio(null as unknown as number, -43.2)).toBe(false);
    expect(dentroDoRio(undefined as unknown as number, undefined as unknown as number)).toBe(false);
  });

  it('coordenada em STRING não passa — é o que a guarda Number.isFinite protege', () => {
    // ⚠️ Achado por mutante: para NaN/null/undefined a guarda é redundante (toda
    // comparação com NaN já é false). O caso que ela pega de verdade é a STRING:
    // JS coage `'-22.9' <= -21.8` para número e devolve TRUE. Driver que
    // entregue `numeric` do Postgres como texto entraria no mapa sem a guarda.
    expect(dentroDoRio('-22.9068' as unknown as number, '-43.1729' as unknown as number)).toBe(false);
  });

  it('a caixa é do Rio, e o teste trava os limites', () => {
    // Se alguém alargar a caixa "só um pouco", isto fica vermelho e a mudança
    // passa a ser consciente.
    expect(CAIXA_RJ).toEqual({ latMax: -21.8, latMin: -23.6, lngMax: -42.4, lngMin: -44.3 });
  });
});
