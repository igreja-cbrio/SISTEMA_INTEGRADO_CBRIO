// ============================================================================
// Guarda: todo routeKey de `authorizeModule` existe no ROUTE_MODULE_MAP
//
// O incidente que este teste existe pra impedir (medido em 17/08/2026): o
// módulo "Links e QR" nasceu em 08/08 com `authorizeModule('links', 4)` nas
// rotas e SEM entrada no mapa. O guard faz `ROUTE_MODULE_MAP[routeKey] || []`,
// e com a lista vazia cai neste ramo (auth.js):
//
//     if (moduleNames.length === 0) {
//       const nivel = isWrite ? granular.cargoNivelEscrita : granular.cargoNivelLeitura;
//       hasAccess = nivel >= nivelMinimo;
//     }
//
// Ou seja: a matriz cargo × módulo — o que a tela de Permissões mostra e o que
// o Marcos edita — deixa de valer, e quem manda é o nível padrão do CARGO.
// Medido em produção antes do conserto: a matriz dizia 2 cargos podendo
// escrever e a API deixava 10; a matriz marcava 1 cargo como "sem acesso" e a
// API deixava os 45 lerem. O deny explícito por usuário (`modulosBloqueados`)
// também era pulado, porque aquele `if` é guardado por `moduleNames.length`.
//
// A falha é silenciosa nos dois sentidos: ninguém toma 403 indevido (então
// ninguém reclama) e a tela de Permissões continua desenhando uma régua que o
// servidor não aplica.
//
// ⚠️ Checagem ESTÁTICA e por TEXTO — o mapa é lido do fonte de `auth.js`, não
// por `require`, porque importá-lo puxa `utils/supabase` e o gate roda sem as
// dependências de `backend/`. Comentário é removido dos DOIS lados antes de
// casar: este arquivo cita `authorizeModule('links', 4)` na explicação acima, e
// sem a limpeza o próprio teste viraria a evidência (a armadilha de 06/08).
// ============================================================================
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { semComentariosJs } from './_semComentarios';

const RAIZ = join(__dirname, '..', '..');
const AUTH = join(RAIZ, 'backend', 'middleware', 'auth.js');



/**
 * Chaves declaradas no ROUTE_MODULE_MAP.
 *
 * ⚠️ Recorta o BLOCO do mapa antes de casar. Procurar `'x':` no arquivo inteiro
 * pegaria chave de qualquer outro objeto de `auth.js` e o teste passaria a
 * aprovar routeKey que não está no mapa — exatamente o que ele deveria barrar.
 */
export function chavesDoMapa(fonteAuth: string): Set<string> {
  const inicio = fonteAuth.indexOf('const ROUTE_MODULE_MAP = {');
  if (inicio < 0) throw new Error('ROUTE_MODULE_MAP não encontrado em auth.js');
  const fim = fonteAuth.indexOf('\n};', inicio);
  if (fim < 0) throw new Error('fim do ROUTE_MODULE_MAP não encontrado');
  const bloco = semComentariosJs(fonteAuth.slice(inicio, fim));
  return new Set([...bloco.matchAll(/'([a-z0-9-]+)'\s*:/g)].map((m) => m[1]));
}

function arquivosJs(dir: string): string[] {
  const saida: string[] = [];
  for (const nome of readdirSync(dir)) {
    if (nome === 'node_modules') continue;
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) saida.push(...arquivosJs(caminho));
    else if (nome.endsWith('.js')) saida.push(caminho);
  }
  return saida;
}

/** routeKey → arquivos que o usam. Só literal: chamada com variável não entra. */
export function routeKeysUsados(pastas: string[]): Map<string, string[]> {
  const usados = new Map<string, string[]>();
  for (const pasta of pastas) {
    for (const caminho of arquivosJs(pasta)) {
      const src = semComentariosJs(readFileSync(caminho, 'utf8'));
      const relativo = caminho.slice(RAIZ.length + 1).replace(/\\/g, '/');
      for (const m of src.matchAll(/authorizeModule\(\s*'([^']+)'/g)) {
        const lista = usados.get(m[1]) || [];
        if (!lista.includes(relativo)) lista.push(relativo);
        usados.set(m[1], lista);
      }
    }
  }
  return usados;
}

describe('ROUTE_MODULE_MAP · todo routeKey usado está declarado', () => {
  const fonteAuth = readFileSync(AUTH, 'utf8');
  const chaves = chavesDoMapa(fonteAuth);
  const usados = routeKeysUsados([
    join(RAIZ, 'backend', 'routes'),
    join(RAIZ, 'backend', 'services'),
    join(RAIZ, 'backend', 'utils'),
  ]);

  it('o mapa foi lido de verdade (guarda contra recorte vazio)', () => {
    // Se o recorte do bloco quebrar, `chaves` vem vazio e TUDO viraria órfão —
    // ou, pior num refactor futuro, o teste passaria a comparar contra nada.
    expect(chaves.size).toBeGreaterThan(40);
    expect(chaves.has('membresia')).toBe(true);
    expect(usados.size).toBeGreaterThan(20);
  });

  it('nenhum routeKey cai no nível padrão do cargo', () => {
    const orfaos = [...usados.keys()]
      .filter((k) => !chaves.has(k))
      .sort()
      .map((k) => `${k} (usado em ${usados.get(k)!.join(', ')})`);

    expect(
      orfaos,
      'routeKey fora do ROUTE_MODULE_MAP: o guard ignora a matriz cargo × módulo '
        + 'e passa a decidir pelo nível padrão do cargo. Declare a entrada em '
        + 'backend/middleware/auth.js.',
    ).toEqual([]);
  });

  it('links aponta pro módulo links (a entrada que faltava)', () => {
    expect(chaves.has('links')).toBe(true);
    const bloco = semComentariosJs(fonteAuth);
    expect(bloco).toMatch(/'links'\s*:\s*\[\s*'links'\s*\]/);
  });

  it('toda chave do mapa é slug em minúsculas (nada de nome de módulo)', () => {
    // O mapa aponta pra SLUG (`modulos.slug`), não pro nome de exibição —
    // `modulePerms` indexa pelos dois, mas o nome varia com renomeação na tela.
    for (const chave of chaves) expect(chave).toMatch(/^[a-z0-9-]+$/);
  });
});
