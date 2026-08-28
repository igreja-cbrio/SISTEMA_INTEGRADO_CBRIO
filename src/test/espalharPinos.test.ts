import { describe, it, expect } from 'vitest';
import { espalharPinosSobrepostos, type PinoEspalhavel } from '@/lib/pinosMapa';

// Distância aproximada em metros — precisão suficiente pro que os testes afirmam.
function metros(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const dLat = (a.lat - b.lat) * 111320;
  const dLng = (a.lng - b.lng) * 111320 * Math.cos((a.lat * Math.PI) / 180);
  return Math.sqrt(dLat * dLat + dLng * dLng);
}

const g = (id: string, lat: number, lng: number): PinoEspalhavel & { nome: string } => ({ id, nome: id, lat, lng });

// O caso REAL medido em 31/07/2026: 7 grupos no mesmo centróide da Barra.
const BARRA = { lat: -23.00149, lng: -43.38804 };
const sete = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((id) => g(id, BARRA.lat, BARRA.lng));

describe('espalharPinosSobrepostos', () => {
  it('não toca em pino que já é único', () => {
    const entrada = [g('x', -23.001, -43.388), g('y', -22.9, -43.2)];
    const saida = espalharPinosSobrepostos(entrada);
    expect(saida).toHaveLength(2);
    saida.forEach((s) => {
      const orig = entrada.find((e) => e.id === s.id)!;
      expect(s.lat).toBe(orig.lat);
      expect(s.lng).toBe(orig.lng);
      expect(s.pinoAproximado).toBeUndefined();
    });
  });

  it('separa os 7 empilhados e marca todos como aproximados', () => {
    const saida = espalharPinosSobrepostos(sete);
    expect(saida).toHaveLength(7);
    expect(saida.every((s) => s.pinoAproximado === true)).toBe(true);

    const pts = saida.map((s) => ({ lat: s.lat as number, lng: s.lng as number }));
    for (let i = 0; i < pts.length; i++) {
      for (let j = i + 1; j < pts.length; j++) {
        // Cada pino precisa dar pra clicar separadamente.
        expect(metros(pts[i], pts[j])).toBeGreaterThan(15);
      }
    }
  });

  it('mantém todo pino perto do ponto real (nunca joga pra outro bairro)', () => {
    espalharPinosSobrepostos(sete).forEach((s) => {
      const d = metros({ lat: s.lat as number, lng: s.lng as number }, BARRA);
      expect(d).toBeGreaterThan(0);
      expect(d).toBeLessThan(200);
    });
  });

  it('é DETERMINÍSTICO: ordem de entrada diferente = mesma posição por grupo', () => {
    const a = espalharPinosSobrepostos(sete);
    const b = espalharPinosSobrepostos([...sete].reverse());
    const posA = new Map(a.map((s) => [s.id, `${s.lat},${s.lng}`]));
    const posB = new Map(b.map((s) => [s.id, `${s.lat},${s.lng}`]));
    expect(posA.size).toBe(7);
    for (const [id, p] of posA) expect(posB.get(id)).toBe(p);
  });

  it('não perde nem duplica grupo (os contadores da tela leem o length)', () => {
    const entrada = [
      ...sete,
      g('sozinho', -22.96601, -43.39004),
      g('par1', -23.01852, -43.4634),
      g('par2', -23.01852, -43.4634),
    ];
    const saida = espalharPinosSobrepostos(entrada);
    expect(saida).toHaveLength(entrada.length);
    expect(new Set(saida.map((s) => s.id)).size).toBe(entrada.length);
  });

  it('coordenada a mais de ~1 m NÃO é o mesmo ponto (não desloca quem já é distinto)', () => {
    const saida = espalharPinosSobrepostos([g('p', -23.0, -43.4), g('q', -23.0002, -43.4)]);
    expect(saida.every((s) => s.pinoAproximado === undefined)).toBe(true);
  });

  it('mais de um anel quando passa de 6 no mesmo ponto (não amontoa tudo num círculo)', () => {
    const nove = Array.from({ length: 9 }, (_, i) => g(`g${i}`, BARRA.lat, BARRA.lng));
    const raios = espalharPinosSobrepostos(nove).map((s) =>
      Math.round(metros({ lat: s.lat as number, lng: s.lng as number }, BARRA))
    );
    expect(new Set(raios).size).toBeGreaterThan(1);
  });
});
