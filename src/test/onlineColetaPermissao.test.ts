// Quem pode APERTAR os botões de coleta do YouTube — e o que continua trancado.
//
// Pedido do Matheus (23/09/2026): *"a renata ta dizendo que nao tem permissao
// para clicar nos botoes de coletar pico agr, preciso que ela tenha essa
// permissao."*
//
// ⚠️⚠️ As rotas de coleta exigiam `authorize('admin', 'diretor')` — CARGO, não
// módulo. A Renata é `coordenador-online` (nível 3 de escrita), responsável da
// área: via a tela inteira e não podia apertar o botão que busca o próprio dado
// dela. O padrão do módulo já existia dentro do MESMO arquivo
// (`/comunidade-mensal` usa `authorizeModule('online', 3)`) — as de coleta
// tinham ficado para trás.
//
// ⚠️ `authorizeModule('online', 3)` alcança a coordenação do Online por causa do
// `AREA_MODULO_BOOST` (`Math.max(nivel, 5)` para quem tem a área em
// `usuario_areas`), não pela matriz. Mesma régua já verificada em
// `comunidadeOnlinePermissao.test.ts`.
//
// ⚠️⚠️ O QUE ESTE ARQUIVO PROTEGE, em ordem de dano:
//   1. `/oauth/disconnect` e `/sync` sendo "liberados junto" numa próxima
//      passada. Coletar é ler do YouTube e gravar métrica — reversível, pior
//      caso gasta cota. DESCONECTAR derruba a credencial OAuth do canal para
//      todo mundo, e religar depende de quem tem acesso à conta Google;
//   2. alguém devolver as rotas de coleta para `authorize(...)` de cargo,
//      retrancando exatamente quem opera o Online.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const RAIZ = join(__dirname, '..', '..');
const semComentarios = (src: string) => src
  .split('\n')
  .map((l) => l.replace(/(^|[^:])\/\/[^\n]*/, '$1'))
  .join('\n')
  .replace(/\/\*[\s\S]*?\*\//g, '');

const fonte = () => semComentarios(readFileSync(join(RAIZ, 'backend/routes/online.js'), 'utf8'));

/** Todas as linhas `router.post('/coletar/...', <gate>` do arquivo. */
const rotasDeColeta = () =>
  [...fonte().matchAll(/router\.post\('(\/coletar\/[^']+)',\s*([A-Za-z]+)\(/g)]
    .map((m) => ({ rota: m[1], gate: m[2] }));

describe('⚠️ coleta é operação do módulo, não privilégio de cargo', () => {
  it('existem rotas de coleta (a busca não pode passar por vazio)', () => {
    expect(rotasDeColeta().length).toBeGreaterThanOrEqual(8);
  });

  it('TODA rota de coleta usa authorizeModule, nenhuma usa authorize de cargo', () => {
    const porCargo = rotasDeColeta().filter((r) => r.gate !== 'authorizeModule');
    expect(porCargo.map((r) => r.rota), 'coleta trancada por cargo').toEqual([]);
  });

  it('o nível exigido é 3 — o mesmo de /comunidade-mensal', () => {
    const src = fonte();
    for (const { rota } of rotasDeColeta()) {
      const i = src.indexOf(`router.post('${rota}'`);
      const linha = src.slice(i, i + 200);
      expect(linha, `${rota} com nível diferente`).toContain("authorizeModule('online', 3)");
    }
  });
});

describe('⚠️⚠️ o que NÃO foi liberado junto', () => {
  // Desconectar derruba a credencial OAuth do canal para todo mundo; religar
  // depende de quem tem acesso à conta Google. Não é "coletar de novo".
  it('/oauth/disconnect continua exigindo admin ou diretor', () => {
    const src = fonte();
    const i = src.indexOf("router.post('/oauth/disconnect'");
    expect(i, 'rota /oauth/disconnect sumiu').toBeGreaterThan(-1);
    expect(src.slice(i, i + 200)).toContain("authorize('admin', 'diretor')");
  });

  it('/sync continua exigindo admin ou diretor', () => {
    const src = fonte();
    const i = src.indexOf("router.post('/sync'");
    expect(i, 'rota /sync sumiu').toBeGreaterThan(-1);
    expect(src.slice(i, i + 200)).toContain("authorize('admin', 'diretor')");
  });
});

// ⚠️ O card "Cliques em séries" saiu em 23/09/2026 — pedido do Matheus: *"pode
// remover o card de cliques em series pois nao fazemos mais series."* A igreja
// parou de organizar pregação em séries, então o CTR de cartão de série media
// algo que não existe e ficava preso em 0%, parecendo fracasso.
//
// ⚠️⚠️ Mas a COLETA continua. Parar de MOSTRAR é reversível; parar de COLETAR
// abriria um buraco no histórico que não dá para preencher depois — o YouTube
// Analytics não devolve retroativo indefinidamente.
describe('⚠️ o card de séries saiu da tela, o dado não', () => {
  it('a tela não mostra mais "Cliques em séries"', () => {
    const tela = readFileSync(join(RAIZ, 'src/pages/ministerial/Online.tsx'), 'utf8');
    const semCom = semComentarios(tela);
    expect(semCom).not.toContain('Cliques em séries');
    expect(semCom).not.toContain('cliques_series');
  });

  // ⚠️ Lê o collector SEM COMENTÁRIOS de propósito: `cliques_series_pct` também
  // aparece num comentário explicativo, e um `toContain` no arquivo inteiro
  // passava mesmo com a gravação removida — um mutante sobreviveu exatamente
  // assim. O teste tem que ancorar no CÓDIGO, não na prosa ao redor dele.
  it('⚠️⚠️ o collector continua GRAVANDO cliques_series_pct', () => {
    const col = semComentarios(readFileSync(join(RAIZ, 'backend/services/onlineCollectors.js'), 'utf8'));
    expect(col, 'a coleta do CTR foi removida junto com o card').toContain('cliques_series_pct:');
  });

  it('o painel não expõe mais a métrica', () => {
    const painel = semComentarios(readFileSync(join(RAIZ, 'backend/routes/painel.js'), 'utf8'));
    expect(painel).not.toContain('eng_cliques_series');
  });
});
