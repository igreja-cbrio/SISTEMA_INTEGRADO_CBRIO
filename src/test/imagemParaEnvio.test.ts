// Redução da imagem antes de virar dataURL (16/09/2026).
//
// ⚠️⚠️ As rotas de foto do Kids mandam base64 em JSON e `/api/totem-kids` cai no
// express.json GLOBAL de 1mb: o teto real era ~750KB de imagem, e a tela
// prometia 5MB. Medido: das 98 fotos no bucket, a MAIOR tem 68KB — todas vieram
// da webcam do totem (640×480). O seletor de arquivo nunca produziu um sucesso.
import { describe, it, expect } from 'vitest';
import { dimensoesReduzidas, LADO_MAX_PADRAO, TETO_DATAURL } from '../lib/imagemParaEnvio';

describe('dimensoesReduzidas', () => {
  it('encolhe pelo lado MAIOR, preservando a proporção', () => {
    expect(dimensoesReduzidas(4032, 3024, 1024)).toEqual({ largura: 1024, altura: 768 });
    expect(dimensoesReduzidas(3024, 4032, 1024)).toEqual({ largura: 768, altura: 1024 });
    expect(dimensoesReduzidas(2000, 2000, 1024)).toEqual({ largura: 1024, altura: 1024 });
  });

  // ⚠️⚠️ Esticar foto pequena só inventaria peso e borrão.
  it('NUNCA aumenta', () => {
    expect(dimensoesReduzidas(640, 480, 1024)).toEqual({ largura: 640, altura: 480 });
    expect(dimensoesReduzidas(200, 100, 1024)).toEqual({ largura: 200, altura: 100 });
    expect(dimensoesReduzidas(1024, 700, 1024)).toEqual({ largura: 1024, altura: 700 });
  });

  // ⚠️⚠️ Arredondar pra baixo um lado muito estreito daria 0 — canvas de altura
  // 0 gera dataURL vazio e a foto some sem erro nenhum.
  it('lado estreito nunca chega a zero', () => {
    const r = dimensoesReduzidas(10000, 3, 1024);
    expect(r.largura).toBe(1024);
    expect(r.altura).toBeGreaterThanOrEqual(1);
  });

  // ⚠️⚠️ Imagem que não decodificou tem naturalWidth 0. Devolver 0×0 apagaria a
  // foto em silêncio; devolvemos o que veio pra quem chamou perceber.
  it('dimensão inválida volta como veio, sem virar 0×0', () => {
    expect(dimensoesReduzidas(0, 0, 1024)).toEqual({ largura: 0, altura: 0 });
    expect(dimensoesReduzidas(NaN, 100, 1024)).toEqual({ largura: NaN, altura: 100 });
    expect(dimensoesReduzidas(-5, 10, 1024)).toEqual({ largura: -5, altura: 10 });
  });

  it('ladoMax inválido não encolhe nada', () => {
    expect(dimensoesReduzidas(4000, 3000, 0)).toEqual({ largura: 4000, altura: 3000 });
    expect(dimensoesReduzidas(4000, 3000, NaN)).toEqual({ largura: 4000, altura: 3000 });
  });

  it('arredonda pra inteiro — canvas não aceita fração', () => {
    const r = dimensoesReduzidas(1001, 667, 1000);
    expect(Number.isInteger(r.largura)).toBe(true);
    expect(Number.isInteger(r.altura)).toBe(true);
  });
});

describe('os tetos', () => {
  // ⚠️ 1024px a 0.85 dá ~150–250KB de JPEG (~330KB em base64): folga real contra
  // o 1mb do parser. Subir o lado máximo sem refazer esta conta reabre o buraco.
  it('o teto do dataURL fica abaixo do 1mb do express.json', () => {
    expect(TETO_DATAURL).toBeLessThan(1024 * 1024);
  });
  it('o lado máximo é o de uma foto de identificação, não de impressão', () => {
    expect(LADO_MAX_PADRAO).toBeLessThanOrEqual(1280);
    expect(LADO_MAX_PADRAO).toBeGreaterThanOrEqual(640);
  });
});
