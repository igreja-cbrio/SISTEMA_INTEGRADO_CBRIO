// ⚠️⚠️ Toda rota do censo que aciona um modelo tem que ter timeout no CLIENTE.
//
// O padrão do `src/api.js` é 30s (AbortController). Uma geração com Opus 5 passa
// disso com folga. Quando estoura, a tela diz "Tempo esgotado ao falar com o
// servidor" — mas o servidor NÃO parou: ele termina e GRAVA. Recarregar a página
// mostra o relatório pronto. Ou seja: o trabalho não se perde, só a mensagem
// mente, e quem está do outro lado acha que o recurso está quebrado.
//
// Aconteceu em 14/09/2026 no `POST /censo/relatorio` — com a régua idêntica
// escrita SETE LINHAS ADIANTE, no `censo.ia.gerar`, comentário e tudo. Ler o
// vizinho não bastou; por isso virou teste.
//
// Este teste é GENÉRICO de propósito: ele descobre as rotas de IA a partir do
// backend (quem importa um serviço `*IA.js`) e cobra o timeout no cliente. Rota
// de IA nova nasce coberta, sem ninguém lembrar de voltar aqui.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const RAIZ = join(__dirname, '..', '..');
const rotas = readFileSync(join(RAIZ, 'backend/routes/censo.js'), 'utf8');
const api = readFileSync(join(RAIZ, 'src/api.js'), 'utf8');

// Quem são as funções de IA: os nomes importados de um serviço `*IA.js`.
// ⚠️ O que aparece no corpo da rota é o nome da VARIÁVEL importada, não o do
// arquivo — por isso a descoberta parte do `require`, não do caminho.
const fnsIa = [...rotas.matchAll(/const \{([^}]+)\} = require\('[^']*IA'\)/g)]
  .flatMap((m) => m[1].split(',').map((x) => x.trim().split(':')[0].trim()))
  .filter(Boolean);

// Qual POST usa alguma delas. Fatia por `router.post(` até o próximo router.
const blocos = [...rotas.matchAll(/router\.post\('([^']+)'[\s\S]*?(?=\nrouter\.[a-z]+\(|\nmodule\.exports)/g)];
const postsDeIa = blocos.filter((m) => fnsIa.some((f) => new RegExp(`\\b${f}\\b`).test(m[0]))).map((m) => m[1]);

describe('⚠️⚠️ rota de IA do censo exige timeout explícito no cliente', () => {
  it('o backend declara pelo menos duas rotas de IA (premissa)', () => {
    expect(fnsIa.length, 'nenhuma função importada de um serviço *IA.js em routes/censo.js').toBeGreaterThan(0);
    expect(postsDeIa.length, `nenhum POST de IA encontrado (funções: ${fnsIa.join(', ')})`)
      .toBeGreaterThanOrEqual(2);
  });

  it.each(['/ia', '/relatorio'])('POST /censo%s tem timeout no api.js', (rota) => {
    expect(postsDeIa, `POST '${rota}' deixou de ser rota de IA — reveja este teste`).toContain(rota);
    // A linha do cliente que chama esta rota, com o timeout no mesmo `post(...)`.
    const re = new RegExp(`post\\('/censo${rota}'[^\\n]*timeout:\\s*\\d`);
    expect(api, `\`post('/censo${rota}', …)\` sem \`timeout\` — vai morrer aos 30s e mentir que falhou`)
      .toMatch(re);
  });

  it('e o timeout cobre o maxDuration da função (senão o cliente desiste primeiro)', () => {
    const maxDur = Number(JSON.parse(readFileSync(join(RAIZ, 'vercel.json'), 'utf8'))
      .functions?.['api/index.js']?.maxDuration || 0);
    expect(maxDur, 'maxDuration sumiu do vercel.json').toBeGreaterThan(0);
    for (const rota of ['/ia', '/relatorio']) {
      const m = api.match(new RegExp(`post\\('/censo${rota}'[^\\n]*timeout:\\s*(\\d[\\d_]*)`));
      expect(m, `sem timeout em /censo${rota}`).not.toBeNull();
      const ms = Number(String(m![1]).replace(/_/g, ''));
      expect(ms / 1000, `/censo${rota}: cliente desiste antes do servidor (max ${maxDur}s)`)
        .toBeGreaterThanOrEqual(maxDur);
    }
  });
});
