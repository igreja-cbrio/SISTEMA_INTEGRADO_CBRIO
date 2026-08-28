// ⚠️ GUARDA DE REGRESSÃO · a base da API vem SEMPRE de `resolveApiBaseUrl`.
//
// O padrão inline `import.meta.env.VITE_API_URL || '/api'` parece equivalente e
// NÃO é: em produção a env é `https://crmcbrio.vercel.app`, **sem** `/api`.
// A URL montada assim não casa o rewrite `/api/(.*)` da Vercel, cai no
// catch-all do SPA e devolve o `index.html` com **HTTP 200** — então `res.ok`
// é verdadeiro e o erro só aparece (quando aparece) no `.json()`.
//
// Já mordeu três vezes:
//   1. 07/07 · TVs do Kids (display-sala / display-foyer)
//   2. 28/08 · QR de autoatendimento do Celebra — tela presa em "Abrindo…"
//              para sempre, em qualquer aparelho, sem erro nenhum
//   3. 28/08 · exportação LGPD do membro (nunca funcionou em produção)
//
// Este teste é a rede pra não haver a quarta.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { resolveApiBaseUrl } from '../lib/api-base';

function arquivosDeCodigo(dir: string, acc: string[] = []): string[] {
  for (const nome of readdirSync(dir)) {
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) {
      if (nome === 'node_modules' || nome === 'test') continue;
      arquivosDeCodigo(caminho, acc);
    } else if (/\.(t|j)sx?$/.test(nome)) {
      acc.push(caminho);
    }
  }
  return acc;
}

// Tira comentário antes de casar: a própria explicação acima cita o padrão
// proibido como exemplo, e sem isso a documentação derrubaria o portão
// (mesma armadilha de 06/08 — checagem por texto ignora comentário).
function semComentarios(src: string) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((l) => l.replace(/(^|[^:"'`])\/\/.*$/, '$1'))
    .join('\n');
}

describe('base da API', () => {
  it('resolveApiBaseUrl acrescenta /api quando a env não termina nele', () => {
    expect(resolveApiBaseUrl('https://crmcbrio.vercel.app')).toBe('https://crmcbrio.vercel.app/api');
    expect(resolveApiBaseUrl('https://crmcbrio.vercel.app/')).toBe('https://crmcbrio.vercel.app/api');
    expect(resolveApiBaseUrl('https://crmcbrio.vercel.app/api')).toBe('https://crmcbrio.vercel.app/api');
    expect(resolveApiBaseUrl('')).toBe('/api');
    expect(resolveApiBaseUrl(undefined as any)).toBe('/api');
  });

  it('nenhum arquivo de src/ monta a base da API à mão', () => {
    const proibido = /VITE_API_URL\s*(\)|\s)*\|\|/;
    const infratores = arquivosDeCodigo('src')
      .filter((f) => proibido.test(semComentarios(readFileSync(f, 'utf8'))));
    expect(
      infratores,
      `use resolveApiBaseUrl(...) de src/lib/api-base — a env de produção não termina em /api:\n${infratores.join('\n')}`,
    ).toEqual([]);
  });
});
