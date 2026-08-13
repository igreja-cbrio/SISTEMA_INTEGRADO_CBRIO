import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

// ⚠️ Cache condicional é pra CONTEÚDO, não pra ESTADO. Quando o corpo responde
// "esta cobrança já foi paga?", servir a versão anterior é errado exatamente no
// instante que importa — o instante em que o estado mudou.
//
// Incidente de origem (05/08 · app): 124 de 251 respostas de `/api/app/*` eram
// 304, e a pessoa completava o cadastro e voltava pra tela de cadastro.
// Reincidência (08/08): o `GET /pagamento/:token`, que a tela consulta de 6 em 6
// segundos, respondendo 304.

const req = createRequire(import.meta.url);
const { semCache } = req('../../backend/middleware/semCache.js');

/** Resposta de mentira com o suficiente do contrato do Express. */
function resFalso() {
  const headers: Record<string, string> = {};
  return {
    headers,
    corpoEnviado: null as string | null,
    tipoDefinido: null as string | null,
    set(k: string, v: string) { headers[k.toLowerCase()] = v; return this; },
    get(k: string) { return headers[k.toLowerCase()]; },
    type(t: string) { this.tipoDefinido = t; headers['content-type'] = t; return this; },
    end(b: string) { this.corpoEnviado = b; return this; },
    json(_b: any) { throw new Error('json original NÃO deveria ser chamado'); },
  };
}

describe('semCache · rota de estado nunca é cacheada', () => {
  it('manda Cache-Control: no-store', () => {
    const res = resFalso();
    semCache({} as any, res as any, () => {});
    expect(res.get('Cache-Control')).toBe('no-store');
  });

  it('⚠️ res.json passa a responder por res.end — é o que NÃO gera ETag', () => {
    // `no-store` sozinho não resolve: o `req.fresh` do Express compara o
    // If-None-Match do REQUEST com o ETag da RESPOSTA e devolve 304 do mesmo
    // jeito. Sem validador emitido, não há revalidação nem 304.
    const res = resFalso();
    semCache({} as any, res as any, () => {});
    res.json({ pago: true, valor_centavos: 500 });
    expect(res.corpoEnviado).toBe('{"pago":true,"valor_centavos":500}');
  });

  it('não sobrescreve Content-Type já definido', () => {
    const res = resFalso();
    res.set('Content-Type', 'application/problem+json');
    semCache({} as any, res as any, () => {});
    res.json({ error: 'x' });
    expect(res.get('Content-Type')).toBe('application/problem+json');
  });

  it('chama next() — é middleware, não terminal', () => {
    let seguiu = false;
    semCache({} as any, resFalso() as any, () => { seguiu = true; });
    expect(seguiu).toBe(true);
  });
});

// ⚠️ Guarda de MONTAGEM. O middleware existir não protege nada — protege estar
// montado. Este teste falha se alguém remover a linha de um dos routers de
// estado, que é o jeito silencioso de o 304 voltar.
describe('semCache · está montado onde precisa', () => {
  // ⚠️ Comentário NÃO conta: esta própria base já teve guarda por texto dando
  // falso positivo em cima da documentação do conserto (lição de 07/08).
  const semComentarios = (t: string) =>
    t.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');

  const ler = (caminho: string) =>
    semComentarios(readFileSync(new URL(caminho, import.meta.url), 'utf8'));

  it('o app monta no router inteiro', () => {
    expect(ler('../../backend/routes/app.js')).toMatch(/router\.use\(\s*semCache\s*\)/);
  });

  it('a tela de pagamento da inscrição monta em /pagamento e /comprovante', () => {
    const t = ler('../../backend/routes/publicEventoExterno.js');
    expect(t).toMatch(/router\.use\(\s*['"]\/pagamento['"]\s*,\s*semCache\s*\)/);
    expect(t).toMatch(/router\.use\(\s*['"]\/comprovante['"]\s*,\s*semCache\s*\)/);
  });

  it('a tela de doação monta no router inteiro', () => {
    expect(ler('../../backend/routes/publicGenerosidade.js')).toMatch(/router\.use\(\s*semCache\s*\)/);
  });

  it('⚠️ a página do evento (/:slug) NÃO é coberta — é decisão, não esquecimento', () => {
    // É o endereço que leva a multidão no lançamento, e ali um pouco de cache
    // ajuda. O `vagas_restantes` já é declaradamente aproximado — quem decide a
    // vaga é o advisory lock da RPC, não o número na tela.
    const t = ler('../../backend/routes/publicEventoExterno.js');
    expect(t).not.toMatch(/router\.use\(\s*semCache\s*\)/);
  });
});
