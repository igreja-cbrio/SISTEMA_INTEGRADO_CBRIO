// ⚠️⚠️ POR QUE ESTE ARQUIVO EXISTE: um indicador de `/monitoramento-okr` puxa o
// número vivo por uma STRING (`live: 'chave'`), e quem produz essa chave é um
// `addM('chave', ...)` lá no backend. Se as duas divergirem — typo, chave
// renomeada, bloco removido — o indicador passa a mostrar **"—" para sempre**,
// sem erro, sem log, e sem ninguém perceber que parou de medir. É a tela que a
// diretoria e o Pr. Juninho leem.
//
// Este teste amarra os dois lados.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { BLOCOS } from '../lib/monitoramentoOkrEstrutura.js';

// ⚠️ Comentário fora ANTES de casar: o próprio backend cita chaves em
// explicação, e sem isso um `addM` comentado contaria como existente (a
// armadilha de 06/08, que já mordeu duas vezes neste projeto).
function semComentarios(js: string) {
  return js
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((l) => l.replace(/(^|[^:])\/\/.*$/, '$1'))
    .join('\n');
}

const painel = semComentarios(readFileSync('backend/routes/painel.js', 'utf8'));
const chavesProduzidas = new Set(
  [...painel.matchAll(/addM\(\s*'([a-z0-9_]+)'/gi)].map((m) => m[1]),
);

type Tatico = { ind: string; live?: string; comparaLive?: string; fixo?: unknown; ressalva?: string };
const taticos: Tatico[] = BLOCOS.flatMap((b: { okrs: { taticos?: Tatico[] }[] }) =>
  b.okrs.flatMap((o) => o.taticos || []),
);

describe('monitoramento OKR · chaves vivas', () => {
  it('o backend produz pelo menos uma métrica (a varredura não é vazia)', () => {
    expect(chavesProduzidas.size).toBeGreaterThan(10);
  });

  it('⚠️ toda chave `live` tem um addM correspondente no backend', () => {
    const orfas = taticos.filter((t) => t.live && !chavesProduzidas.has(t.live))
      .map((t) => `${t.ind} → live:'${t.live}'`);
    expect(orfas).toEqual([]);
  });

  it('⚠️ toda chave `comparaLive` também', () => {
    const orfas = taticos.filter((t) => t.comparaLive && !chavesProduzidas.has(t.comparaLive))
      .map((t) => `${t.ind} → comparaLive:'${t.comparaLive}'`);
    expect(orfas).toEqual([]);
  });

  it('⚠️ nenhum indicador tem `live` E `fixo` ao mesmo tempo', () => {
    // os dois juntos deixam ambíguo qual número a tela mostra — e o `live`
    // vence em silêncio, então o `fixo` viraria documentação mentirosa
    const ambiguos = taticos.filter((t) => t.live && t.fixo).map((t) => t.ind);
    expect(ambiguos).toEqual([]);
  });

  it('as duas chaves trocadas em 25/08 estão ligadas', () => {
    expect(chavesProduzidas.has('next_pos_contato')).toBe(true);
    expect(chavesProduzidas.has('volunt_ativos_base')).toBe(true);
  });

  it('⚠️ os indicadores de fonte frágil carregam ressalva', () => {
    const comRessalva = taticos.filter((t) => t.ressalva).map((t) => t.ind);
    expect(comRessalva).toContain('% dizimistas regulares');
    expect(comRessalva).toContain('% Voluntários ativos');
  });
});
