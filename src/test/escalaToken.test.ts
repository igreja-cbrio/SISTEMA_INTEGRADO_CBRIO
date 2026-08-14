// Contrato do token do link "vou / não vou poder" da escala.
//
// ⚠️ MUTATION-TEST das três garantias que sustentam um link público que MUDA
// dado sem login:
//   · sem segredo é FAIL-CLOSED (não gera e não aceita);
//   · assinatura errada não passa;
//   · token de OUTRO fluxo (censo, comprovante) não é aceito aqui — os três
//     usam o mesmo segredo, e sem namespace quem tem um comprovante de
//     inscrição derrubaria a escala de outra pessoa.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createHmac } from 'node:crypto';
import { gerarTokenEscala, verificarTokenEscala, montarLinkEscala } from '../../backend/utils/escalaToken.js';

const ID = '3f9a1c2e-4b5d-4e6f-8a90-1234567890ab';
const SEC = 'segredo-de-teste';
const original = { ...process.env };

beforeEach(() => { process.env.ESCALA_TOKEN_SECRET = SEC; delete process.env.CRON_SECRET; });
afterEach(() => { process.env = { ...original }; });

describe('ida e volta', () => {
  it('gera e verifica o mesmo id', () => {
    const t = gerarTokenEscala(ID);
    expect(t).toMatch(/^[0-9a-f]{32}\.[0-9a-f]{20}$/);
    expect(verificarTokenEscala(t)).toBe(ID);
  });

  it('aceita id em maiúsculas e com espaços em volta do token', () => {
    const t = gerarTokenEscala(ID.toUpperCase());
    expect(verificarTokenEscala(`  ${t!.toUpperCase()}  `)).toBe(ID);
  });

  it('id inválido não gera token', () => {
    expect(gerarTokenEscala('nao-e-uuid')).toBeNull();
    expect(gerarTokenEscala(null as any)).toBeNull();
  });
});

describe('⚠️ fail-closed sem segredo', () => {
  it('sem segredo nenhum, não gera e não aceita', () => {
    const t = gerarTokenEscala(ID);
    delete process.env.ESCALA_TOKEN_SECRET;
    delete process.env.CRON_SECRET;
    expect(gerarTokenEscala(ID)).toBeNull();
    expect(verificarTokenEscala(t)).toBeNull();
    // E o link degrada pra null — a mensagem sai sem link, nunca com um link
    // quebrado que a pessoa clica e não funciona.
    expect(montarLinkEscala(ID, 'https://cbrio.org')).toBeNull();
  });

  it('cai no CRON_SECRET quando não há o específico', () => {
    delete process.env.ESCALA_TOKEN_SECRET;
    process.env.CRON_SECRET = 'outro-segredo';
    const t = gerarTokenEscala(ID);
    expect(verificarTokenEscala(t)).toBe(ID);
  });
});

describe('⚠️ assinatura', () => {
  it('assinatura adulterada não passa', () => {
    const t = gerarTokenEscala(ID)!;
    const [id, sig] = t.split('.');
    const trocado = sig[0] === 'a' ? 'b' : 'a';
    expect(verificarTokenEscala(`${id}.${trocado}${sig.slice(1)}`)).toBeNull();
  });

  it('trocar o id sem reassinar não passa', () => {
    const t = gerarTokenEscala(ID)!;
    const outro = 'ffffffffffffffffffffffffffffffff';
    expect(verificarTokenEscala(`${outro}.${t.split('.')[1]}`)).toBeNull();
  });

  it('segredo trocado invalida os links antigos', () => {
    const t = gerarTokenEscala(ID)!;
    process.env.ESCALA_TOKEN_SECRET = 'outro';
    expect(verificarTokenEscala(t)).toBeNull();
  });

  it('lixo não derruba a verificação', () => {
    for (const v of ['', '   ', 'abc', 'a.b', `${'0'.repeat(32)}.${'0'.repeat(19)}`, null, undefined]) {
      expect(verificarTokenEscala(v as any)).toBeNull();
    }
  });
});

describe('⚠️⚠️ namespace — token de outro fluxo NÃO vale aqui', () => {
  it('token do censo (mesmo segredo, outro namespace) é recusado', () => {
    // MUTANTE: tirar o prefixo `escala-resposta:` da assinatura faz este teste
    // ficar vermelho — e é o cenário em que quem recebeu um link do censo
    // consegue derrubar a escala de outra pessoa.
    const idNorm = ID.replace(/-/g, '');
    const doCenso = createHmac('sha256', SEC).update(`censo-atualizacao:${idNorm}`).digest('hex').slice(0, 20);
    expect(verificarTokenEscala(`${idNorm}.${doCenso}`)).toBeNull();
  });

  it('token sem namespace nenhum é recusado', () => {
    const idNorm = ID.replace(/-/g, '');
    const cru = createHmac('sha256', SEC).update(idNorm).digest('hex').slice(0, 20);
    expect(verificarTokenEscala(`${idNorm}.${cru}`)).toBeNull();
  });
});

describe('montarLinkEscala', () => {
  it('monta com a base dada e sem barra dupla', () => {
    expect(montarLinkEscala(ID, 'https://cbrio.org/')).toMatch(/^https:\/\/cbrio\.org\/e\/[0-9a-f]{32}\.[0-9a-f]{20}$/);
  });
});
