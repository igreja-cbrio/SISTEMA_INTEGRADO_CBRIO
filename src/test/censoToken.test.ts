import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { gerarTokenCenso, verificarTokenCenso } from '../../backend/utils/censoToken.js';

// ⚠️ Este token é a ÚNICA prova de identidade que libera o endpoint público
// `censo/meus-dados`, que devolve nome, CPF, telefone, e-mail e endereço de uma
// pessoa. Se ele for forjável, o endpoint vira um extrator da base inteira.
// Por isso os testes negativos aqui são o ponto principal, não um extra.

const MEMBRO = '5211a14f-3f5d-4225-96ef-81fb49af961c';
const OUTRO = '44c2ee91-e7e2-486e-8406-045102c8b0af';

const envAntigo = { ...process.env };
beforeEach(() => {
  delete process.env.CENSO_TOKEN_SECRET;
  process.env.CRON_SECRET = 'segredo-de-teste';
});
afterEach(() => { process.env = { ...envAntigo }; });

describe('ida e volta', () => {
  it('token gerado devolve o mesmo membro', () => {
    const t = gerarTokenCenso(MEMBRO);
    expect(t).toBeTruthy();
    expect(verificarTokenCenso(t)).toBe(MEMBRO);
  });

  it('é determinístico (o mesmo link continua valendo)', () => {
    expect(gerarTokenCenso(MEMBRO)).toBe(gerarTokenCenso(MEMBRO));
  });

  it('membros diferentes geram tokens diferentes', () => {
    expect(gerarTokenCenso(MEMBRO)).not.toBe(gerarTokenCenso(OUTRO));
  });

  it('aceita UUID em caixa alta e sem hífen', () => {
    expect(verificarTokenCenso(gerarTokenCenso(MEMBRO.toUpperCase()))).toBe(MEMBRO);
    expect(verificarTokenCenso(gerarTokenCenso(MEMBRO.replace(/-/g, '')))).toBe(MEMBRO);
  });
});

describe('recusa (é o que protege PII)', () => {
  it('assinatura adulterada não passa', () => {
    const t = gerarTokenCenso(MEMBRO)!;
    const [id, sig] = t.split('.');
    const trocado = sig[0] === 'a' ? `b${sig.slice(1)}` : `a${sig.slice(1)}`;
    expect(verificarTokenCenso(`${id}.${trocado}`)).toBeNull();
  });

  // ⚠️ O ataque óbvio: pegar o próprio link e trocar o id por outro membro.
  it('trocar o id mantendo a assinatura não passa', () => {
    const meu = gerarTokenCenso(MEMBRO)!;
    const sig = meu.split('.')[1];
    const idOutro = OUTRO.replace(/-/g, '');
    expect(verificarTokenCenso(`${idOutro}.${sig}`)).toBeNull();
  });

  it('formato inválido não passa', () => {
    for (const ruim of ['', null, undefined, 'abc', MEMBRO, `${MEMBRO}.x`,
      'zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz.aaaaaaaaaaaaaaaaaaaa']) {
      expect(verificarTokenCenso(ruim as string)).toBeNull();
    }
  });

  // ⚠️ Mutation test do fail-closed: sem segredo NÃO gera e NÃO aceita. Um
  // literal de fallback aqui (a lição do MEM_QR_SALT) tornaria todo token
  // forjável por qualquer pessoa que lesse o repositório.
  it('sem segredo configurado não gera nem aceita', () => {
    const t = gerarTokenCenso(MEMBRO)!;
    delete process.env.CRON_SECRET;
    delete process.env.CENSO_TOKEN_SECRET;
    expect(gerarTokenCenso(MEMBRO)).toBeNull();
    expect(verificarTokenCenso(t)).toBeNull();
  });

  it('trocar o segredo invalida os links já emitidos', () => {
    const t = gerarTokenCenso(MEMBRO)!;
    process.env.CRON_SECRET = 'outro-segredo';
    expect(verificarTokenCenso(t)).toBeNull();
  });

  it('CENSO_TOKEN_SECRET tem precedência sobre CRON_SECRET', () => {
    process.env.CENSO_TOKEN_SECRET = 'override';
    const comOverride = gerarTokenCenso(MEMBRO);
    delete process.env.CENSO_TOKEN_SECRET;
    expect(comOverride).not.toBe(gerarTokenCenso(MEMBRO));
  });

  it('id que não é UUID não gera token', () => {
    expect(gerarTokenCenso('')).toBeNull();
    expect(gerarTokenCenso(null as unknown as string)).toBeNull();
    expect(gerarTokenCenso('não-é-uuid')).toBeNull();
  });

  // ⚠️ Namespace: um token de OUTRO fluxo assinado com o mesmo segredo (o
  // comprovante de inscrição usa CRON_SECRET também) não pode ser aceito aqui,
  // senão quem tem comprovante de inscrição leria cadastro de membro.
  it('token de outro fluxo com o mesmo segredo não passa', async () => {
    const { gerarTokenComprovante } = await import(
      '../../backend/services/inscricaoComprovante.js'
    ) as { gerarTokenComprovante: (id: string) => string | null };
    const doOutroFluxo = gerarTokenComprovante(MEMBRO);
    expect(doOutroFluxo).toBeTruthy();
    expect(verificarTokenCenso(doOutroFluxo!)).toBeNull();
  });
});
