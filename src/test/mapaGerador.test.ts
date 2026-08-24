import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

/**
 * ⚠️⚠️ ESTE TESTE É O QUE IMPEDE O MAPA DE VIRAR O ATLAS.
 *
 * `src/pages/atlas/atlas.html` descreve 45 módulos e está parado em 25/06 —
 * o CLAUDE.md registra que ele apresenta como vivo um pareamento do Kids que
 * nunca foi implementado. Um índice que aponta para arquivo inexistente é pior
 * que índice nenhum: manda quem confia nele procurar no lugar errado.
 *
 * Aqui a asserção central é simples e implacável: **todo caminho de arquivo que
 * o mapa cita tem de existir no disco.** Se o gerador passar a inventar caminho
 * (ou se alguém renomear um arquivo), isto fica vermelho.
 */
const require_ = createRequire(import.meta.url);
const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const { montarModelo, gerar } = require_('../../backend/scripts/gerar-mapa.cjs');

const modelo = montarModelo();
const { arquivos } = gerar();

describe('mapa · o gerador enxerga o sistema', () => {
  it('acha as rotas do ERP', () => {
    // Ordem de grandeza, não número exato: rota nova não pode deixar o gate
    // vermelho. O que importa é que a leitura do App.tsx não colapsou.
    expect(modelo.rotas.length).toBeGreaterThan(100);
  });

  it('acha os módulos e os arquivos de rota do backend', () => {
    expect(Object.keys(modelo.modulos).length).toBeGreaterThan(20);
    expect(Object.keys(modelo.rotasBackend).length).toBeGreaterThan(80);
  });

  it('acha as réguas puras de backend/utils', () => {
    expect(Object.keys(modelo.utils).length).toBeGreaterThan(50);
  });

  it('⚠️ atribui ARQUIVO à maioria das rotas — o regex do <Route> não pode colapsar', () => {
    // Este caso nasceu de um bug REAL: a primeira versão casava até o primeiro
    // `/>`, que é o do `<Loading />`, e o componente da rota nunca era visto.
    // `/admin/cruzamentos` sumia do mapa em silêncio. Se a proporção despencar,
    // o parser quebrou de novo.
    const comArquivo = modelo.rotas.filter((r: any) => r.arquivo).length;
    expect(comArquivo).toBeGreaterThan(modelo.rotas.length * 0.5);
  });
});

describe('⚠️⚠️ mapa · todo caminho citado EXISTE', () => {
  it('telas do ERP', () => {
    const faltando = modelo.rotas
      .filter((r: any) => r.arquivo)
      .map((r: any) => `src/${String(r.arquivo).replace(/^\.\//, '')}`)
      .filter((p: string) => !['.tsx', '.jsx', '.ts', '.js'].some((e) => existsSync(path.join(RAIZ, p + e))));
    expect(faltando).toEqual([]);
  });

  it('arquivos de rota do backend', () => {
    const faltando = Object.keys(modelo.rotasBackend).filter((p) => !existsSync(path.join(RAIZ, p)));
    expect(faltando).toEqual([]);
  });

  it('réguas puras e os testes que elas citam', () => {
    const faltando: string[] = [];
    for (const u of Object.values(modelo.utils) as any[]) {
      if (!existsSync(path.join(RAIZ, u.arquivo))) faltando.push(u.arquivo);
      for (const t of u.cobertoPor) if (!existsSync(path.join(RAIZ, t))) faltando.push(t);
    }
    expect(faltando).toEqual([]);
  });
});

describe('mapa · as páginas saem completas', () => {
  it('tem INDICE, ARQUIVOS, APPS e ORFAOS', () => {
    for (const n of ['INDICE.md', 'ARQUIVOS.md', 'APPS.md', 'ORFAOS.md']) {
      expect(Object.keys(arquivos)).toContain(n);
    }
  });

  it('todo módulo tem página própria', () => {
    for (const slug of Object.keys(modelo.modulos)) {
      expect(Object.keys(arquivos)).toContain(`${slug}.md`);
    }
  });

  it('⚠️ toda página carrega o aviso de que o mapa diz ONDE, não SE está certo', () => {
    // Sem isto, alguém (eu) trata o mapa como prova e para de medir o banco.
    for (const [nome, conteudo] of Object.entries(arquivos) as [string, string][]) {
      expect(conteudo, nome).toContain('responde ONDE algo mora, nunca SE está certo');
    }
  });

  it('⚠️ toda página se declara GERADA — para ninguém editar à mão', () => {
    for (const [nome, conteudo] of Object.entries(arquivos) as [string, string][]) {
      expect(conteudo, nome).toContain('NÃO editar à mão');
    }
  });

  // ⚠️ Timeout EXPLÍCITO (24/08/2026): este é o único caso que roda o gerador
  // DUAS vezes — ele varre `backend/routes`, `backend/utils`, `src/api.js` e os
  // 2 repos de app. Sozinho leva ~0,9s; na suíte inteira, com os workers
  // disputando disco, passava dos 5s do default e ficava VERMELHO por tempo, não
  // por indeterminismo (a asserção é sobre a saída ser igual, não sobre ela ser
  // rápida). Um arquivo novo em `backend/utils/` bastou pra estourar a borda.
  it('a saída é DETERMINÍSTICA — senão o auto-commit vira ruído no histórico', () => {
    const a = gerar().arquivos;
    const b = gerar().arquivos;
    expect(Object.keys(a).sort()).toEqual(Object.keys(b).sort());
    for (const k of Object.keys(a)) expect(a[k], k).toBe(b[k]);
  }, 30000);
});

describe('mapa · responde aos pedidos que me fizeram investigar', () => {
  // ⚠️ Estes são pedidos REAIS (agosto/2026). Se o mapa deixar de respondê-los,
  // ele voltou a ser inútil — que é a única forma de falha que importa aqui.
  const plano = arquivos['ARQUIVOS.md'] as string;

  // ⚠️⚠️ Os apps são repos IRMÃOS e **não existem no CI** (o workflow só faz
  // checkout do ERP). Sem esta guarda, o caso do "compartilhar" ficaria VERMELHO
  // no gate por um motivo que não é defeito nenhum — e o jeito errado de
  // consertar seria afrouxar a asserção até ela não provar mais nada.
  const temApps = modelo.apps.length > 0;

  it('importar DANFE (só ERP)', () => {
    expect(plano).toContain('nfeArquivo');
    expect(plano).toContain('logistica');
  });

  it('cruzar batismo × voluntário (só ERP)', () => {
    // O caso que a primeira versão do gerador NÃO achava, por causa do <Loading />.
    expect(plano).toContain('CruzamentosPessoas');
    expect(plano).toContain('/admin/cruzamentos');
  });

  it('a régua do link de inscrição do app está no mapa (só ERP)', () => {
    // Esta vive em backend/utils, então existe no CI.
    expect(plano).toContain('linkInscricaoApp');
  });

  it.skipIf(!temApps)('compartilhar link de inscrição — arquivos DO APP', () => {
    expect(plano).toContain('compartilharInscricao');
    expect(plano).toContain('BotaoCompartilhar');
  });

  it.skipIf(!temApps)('as telas dos apps entram com a rota do expo-router', () => {
    expect(arquivos['APPS.md']).toContain('/inscricoes');
    expect(arquivos['APPS.md']).not.toContain('não estavam presentes');
  });

  it.skipIf(temApps)('sem os apps clonados, APPS.md DECLARA a ausência', () => {
    // Página vazia sem explicação se lê como "o app não toca em nada".
    expect(arquivos['APPS.md']).toContain('não estavam presentes');
  });
});
