import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'fs';
import { resolve, join } from 'path';

/**
 * ⚠️⚠️ GUARDA · componente definido DENTRO de outro componente.
 *
 * Definir um componente dentro de outro cria uma função NOVA a cada render. O
 * React compara por identidade de tipo, conclui que é outro componente,
 * DESMONTA a subárvore e monta outra. Quando há campo de texto ali dentro, o
 * efeito é o input PERDER O FOCO a cada tecla — a pessoa digita uma letra e
 * precisa clicar no campo de novo.
 *
 * Aconteceu em 22/09/2026 na Ficha da Contratada, com prestador REAL tentando
 * preencher: um `function Campo(...)` definido dentro de `FichaContratada`
 * envolvia todos os inputs por `{children}`.
 *
 * ⚠️ A guarda mira o caso PERIGOSO — componente aninhado que contém ou envolve
 * entrada de dados — e não todo componente aninhado. Motivo: `CensoPublica`
 * tem um `Aviso` aninhado que só renderiza texto, sem nada que perca foco.
 * Um gate que exige consertar o inofensivo junto é gate que alguém desliga na
 * primeira urgência (é a razão escrita no topo de `eslint.hooks.config.js`).
 *
 * ⚠️ Checagem por TEXTO, e ela ignora comentário: este arquivo CITA o padrão
 * proibido na explicação, e sem remover comentário a guarda acusaria a si
 * mesma (a armadilha de 06/08).
 */
const RAIZ = resolve(__dirname, '../..');
const PASTAS = ['src/pages/public'];

/** Remove comentário de linha e de bloco de UMA linha. */
function semComentarios(txt: string): string {
  return txt
    .split('\n')
    .map((l) => l.replace(/\/\*[^\n]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*$/, '$1'))
    .join('\n');
}

function arquivos(dir: string): string[] {
  const alvo = join(RAIZ, dir);
  const saida: string[] = [];
  for (const nome of readdirSync(alvo)) {
    const caminho = join(alvo, nome);
    if (statSync(caminho).isDirectory()) continue;
    if (/\.(tsx|jsx)$/.test(nome)) saida.push(caminho);
  }
  return saida;
}

/** Entrada de dados, ou o `{children}` que as ENVOLVE (foi o caso da Ficha). */
const PERIGO = /<input|<select|<textarea|\{children\}/;

function aninhadosPerigosos(fonte: string): string[] {
  const linhas = semComentarios(fonte).split('\n');
  const achados: string[] = [];
  let emComponente = false;

  for (let i = 0; i < linhas.length; i += 1) {
    const l = linhas[i];
    if (/^(export default )?function [A-Z]/.test(l) || /^const [A-Z][A-Za-z0-9]* = \(/.test(l)) {
      emComponente = true;
      continue;
    }
    const m = /^\s+function ([A-Z][A-Za-z0-9]*)\s*\(/.exec(l);
    if (emComponente && m) {
      // Olha o corpo logo abaixo: entrada de dados ou children = perigoso.
      const corpo = linhas.slice(i, i + 40).join('\n');
      if (PERIGO.test(corpo)) achados.push(m[1]);
    }
  }
  return achados;
}

describe('⚠️⚠️ componente com INPUT definido dentro de outro componente', () => {
  it('nenhuma tela pública tem — é o bug do foco que se perde a cada tecla', () => {
    const problemas: string[] = [];
    for (const pasta of PASTAS) {
      for (const arq of arquivos(pasta)) {
        for (const nome of aninhadosPerigosos(readFileSync(arq, 'utf8'))) {
          problemas.push(`${arq.replace(RAIZ + '/', '')} · ${nome}`);
        }
      }
    }
    expect(problemas, `Mova para o módulo (fora do componente) e passe o que precisar por PROP:\n${problemas.join('\n')}`).toEqual([]);
  });

  it('a régua RECONHECE o padrão que causou o bug (mutation-test da própria guarda)', () => {
    const ruim = [
      'export default function Tela() {',
      '  const [v, setV] = useState("");',
      '  function Campo({ children }: any) {',
      '    return <div>{children}</div>;',
      '  }',
      '  return <Campo><input value={v} /></Campo>;',
      '}',
    ].join('\n');
    expect(aninhadosPerigosos(ruim)).toEqual(['Campo']);
  });

  it('⚠️ componente aninhado SEM entrada de dados não é acusado', () => {
    // O `Aviso` do CensoPublica é assim: só texto, nada a perder foco.
    const inofensivo = [
      'export default function Tela() {',
      '  function Aviso({ texto }: any) {',
      '    return <p>{texto}</p>;',
      '  }',
      '  return <Aviso texto="oi" />;',
      '}',
    ].join('\n');
    expect(aninhadosPerigosos(inofensivo)).toEqual([]);
  });

  it('⚠️ componente no MÓDULO (fora) é o jeito certo e não é acusado', () => {
    const bom = [
      'function Campo({ children }: any) {',
      '  return <div>{children}</div>;',
      '}',
      'export default function Tela() {',
      '  return <Campo><input /></Campo>;',
      '}',
    ].join('\n');
    expect(aninhadosPerigosos(bom)).toEqual([]);
  });

  it('⚠️ comentário citando o padrão não vira violação', () => {
    const comentado = [
      'export default function Tela() {',
      '  // function Campo({ children }: any) { return <div>{children}</div>; }',
      '  return null;',
      '}',
    ].join('\n');
    expect(aninhadosPerigosos(comentado)).toEqual([]);
  });
});
