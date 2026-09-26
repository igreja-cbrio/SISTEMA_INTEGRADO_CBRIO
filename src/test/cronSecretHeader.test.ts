// ⚠️⚠️ O CRON_SECRET SÓ VIAJA EM HEADER. NUNCA EM QUERY STRING.
//
// Em 21/09/2026 o Matheus tentou rodar o backfill de views abrindo
// `cbrio.org/api/online/cron/views-dia-collect?dias=130` no navegador e
// recebeu `{"error":"unauthorized"}`. Está CERTO: abrir no navegador não manda
// header nenhum.
//
// A "facilidade" óbvia — fazer `isAuthorizedCron` aceitar `?secret=<...>` —
// seria uma regressão de segurança séria, e o print daquele dia mostra por quê:
// a URL fica no histórico do navegador, no log de acesso do servidor, no
// Referer de qualquer link clicado depois, e **na captura de tela que alguém
// manda no chat**. Segredo em URL é segredo publicado.
//
// ⇒ Este arquivo trava as duas pontas: a régua não lê `req.query`, e existe um
// caminho HUMANO (autenticado por sessão) para o disparo manual — senão a
// pressão para afrouxar o cron volta na próxima vez que alguém precisar rodar
// um backfill.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const raiz = resolve(__dirname, '../..');
const ler = (p: string) => readFileSync(resolve(raiz, p), 'utf8');

/** ⚠️ Comentário fora antes de casar: estes arquivos CITAM `req.query` e
 *  `?secret=` na explicação do cuidado, e sem limpar o comentário a evidência
 *  seria o próprio texto que descreve o cuidado (armadilha de 06/08). */
function semComentarios(src: string): string {
  return src
    .split('\n')
    .map((l) => l.replace(/(^|[^:])\/\/[^\n]*$/, '$1'))
    .filter((l) => !l.trim().startsWith('*') && !l.trim().startsWith('/*'))
    .join('\n');
}

const cronAuth = semComentarios(ler('backend/utils/cronAuth.js'));
const online = semComentarios(ler('backend/routes/online.js'));

describe('⚠️⚠️ isAuthorizedCron NUNCA lê a query string', () => {
  it('a régua não toca em req.query', () => {
    // Segredo em URL vaza no histórico, no log, no Referer e em print.
    expect(cronAuth).not.toMatch(/req\.query/);
  });

  it('lê os dois headers e nada mais', () => {
    expect(cronAuth).toContain("req.headers['x-cron-secret']");
    expect(cronAuth).toContain("req.headers['authorization']");
  });

  it('⚠️ compara em tempo constante e falha FECHADO sem segredo', () => {
    expect(cronAuth).toContain('timingSafeEqual');
    // `if (!secret) return false` — sem CRON_SECRET configurado ninguém passa.
    expect(cronAuth).toMatch(/if \(!secret\) return false/);
  });
});

describe('⚠️ existe caminho HUMANO para o disparo manual', () => {
  // Sem ele, a única forma de rodar um backfill é mexer com header — e a
  // pressão para afrouxar o cron volta.
  const paresCronHumano = [
    ['/cron/views-dia-collect', '/coletar/views-dia'],
    ['/cron/ds-collect', '/coletar/ds'],
    ['/cron/ddus-collect', '/coletar/ddus'],
  ];

  it('todo cron de coleta do Online tem gêmeo autenticado por sessão', () => {
    for (const [cron, humano] of paresCronHumano) {
      expect(online, `sem rota de cron ${cron}`).toContain(`'${cron}'`);
      expect(online, `sem caminho humano ${humano}`).toContain(`'${humano}'`);
    }
  });

  it('⚠️ o caminho humano é gated por permissão, não por segredo', () => {
    const i = online.indexOf("router.post('/coletar/views-dia'");
    expect(i, 'sem rota manual de views-dia').toBeGreaterThan(-1);
    const linha = online.slice(i, online.indexOf('\n', i));
    // ⚠️ Em 23/09/2026 o gate deixou de ser por CARGO e passou a ser por MÓDULO
    // (`authorizeModule('online', 3)`) — pedido do Matheus: a Renata,
    // `coordenador-online`, não conseguia apertar os botões de coleta da
    // própria área. O que este teste protege NÃO é o cargo: é que o caminho
    // humano seja gated por PERMISSÃO e não por segredo. Ambos servem; o que
    // não serve é ficar sem gate. (Detalhes em `onlineColetaPermissao.test.ts`.)
    expect(linha).toMatch(/authorize\(|authorizeModule\(/);
    // ⚠️ E NÃO pode usar o guard de cron: isso reintroduziria o segredo no
    // caminho de quem clica num botão.
    expect(linha).not.toContain('autorizaCron');
  });

  it('⚠️ o caminho do CRON continua exigindo o segredo', () => {
    // O gêmeo humano não pode ter "aliviado" o cron.
    const i = online.indexOf("router.get('/cron/views-dia-collect'");
    expect(i).toBeGreaterThan(-1);
    expect(online.slice(i, online.indexOf('\n', i))).toContain('autorizaCron');
  });
});
