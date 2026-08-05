import { describe, it, expect, vi, beforeEach } from 'vitest';

// Cobre a régua ÚNICA da tela pública de pagamento (usada pela inscrição paga E
// pela doação) e as partes puras do handler de Generosidade. Nada aqui toca banco
// nem rede — é o que permite estar no gate de deploy.
//
// ⚠️ Vários destes casos são MUTATION-TESTS: o comentário diz o que quebra se a
// regra for "simplificada". Se um deles ficar vermelho depois de um refactor,
// leia o comentário antes de ajustar a asserção.

// @ts-expect-error módulo JS sem tipos
import * as telaPublica from '../../backend/services/pagamentos/telaPublica.js';
// @ts-expect-error módulo JS sem tipos
import * as generosidade from '../../backend/services/pagamentos/handlers/generosidade.js';
// ⚠️ Os efeitos (definirMetodo/sincronizar) entram por INJEÇÃO nos testes, não
// por `vi.spyOn` na fachada: o núcleo é CommonJS e, sob o Vitest, espionar o
// `module.exports` patcha o wrapper de interop — a função espionada nunca é a que
// roda de verdade, e o teste passa a provar nada.
// @ts-expect-error módulo JS sem tipos
import * as pagamentos from '../../backend/services/pagamentos/index.js';

const T = telaPublica as any;
const G = generosidade as any;
const P = pagamentos as any;

/** Cobrança de doação plausível, com PII e payload do PSP dentro. */
function cobrancaFake(over: Record<string, unknown> = {}) {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    public_token: 'a'.repeat(32),
    origem_tipo: 'generosidade',
    origem_id: null,
    status: 'aguardando_pagamento',
    provider: 'manual',
    valor_centavos: 10000,
    valor_pago_centavos: 0,
    metodo: 'pix',
    metodos_ofertados: ['pix', 'cartao'],
    parcelas_total: null,
    parcelas_max: 6,
    checkout_url: 'https://psp.exemplo/fatura/1',
    pix_payload: '00020126...',
    pix_qrcode_base64: null,
    boleto_linha_digitavel: null,
    boleto_url: null,
    expira_em: '2026-08-06T12:00:00.000Z',
    pago_em: null,
    updated_at: new Date().toISOString(),
    // ── o que NUNCA pode sair numa resposta pública ──
    pagador_nome: 'Fulano de Tal',
    pagador_cpf: '12345678909',
    pagador_email: 'fulano@exemplo.com',
    pagador_telefone: '21999998888',
    membro_id: '22222222-2222-4222-8222-222222222222',
    cartao_brand: 'visa',
    cartao_last4: '4242',
    metadata: { categoria: 'dizimo', canal: 'app', segredo: 'nao vaza' },
    ...over,
  };
}

describe('telaPublica · estadoBasePagamento', () => {
  it('devolve o que a tela precisa', () => {
    const e = T.estadoBasePagamento(cobrancaFake());
    expect(e.status).toBe('aguardando_pagamento');
    expect(e.pago).toBe(false);
    expect(e.valor_centavos).toBe(10000);
    expect(e.metodo).toBe('pix');
    expect(e.metodos).toEqual(['pix', 'cartao']);
    expect(e.parcelas_max).toBe(6);
    expect(e.pix_payload).toBe('00020126...');
  });

  it('`pago` é derivado do STATUS, nunca do valor recebido', () => {
    // Voltar do checkout não é pagar, e valor parcial não é pago. Quem decide é
    // `pag_cobrancas.status`.
    expect(T.estadoBasePagamento(cobrancaFake({ status: 'pago' })).pago).toBe(true);
    expect(T.estadoBasePagamento(cobrancaFake({
      status: 'pago_parcial', valor_pago_centavos: 10000,
    })).pago).toBe(false);
  });

  it('⚠️ NÃO vaza PII do pagador, metadata nem dado de cartão', () => {
    // A resposta é pública (o public_token é o único segredo). Acrescentar campo
    // aqui sem pensar é como CPF/telefone de quem doou vira dado exposto em URL
    // compartilhada. Mutation-test: espalhar a cobrança (`...cobranca`) na
    // resposta deixa este caso vermelho.
    const e = T.estadoBasePagamento(cobrancaFake());
    const chaves = Object.keys(e);
    for (const proibida of [
      'pagador_nome', 'pagador_cpf', 'pagador_email', 'pagador_telefone',
      'membro_id', 'metadata', 'cartao_brand', 'cartao_last4', 'id',
    ]) {
      expect(chaves).not.toContain(proibida);
    }
    expect(JSON.stringify(e)).not.toContain('12345678909');
    expect(JSON.stringify(e)).not.toContain('nao vaza');
  });

  it('metodos_ofertados ausente vira lista vazia, não undefined', () => {
    // Cobrança antiga (criada antes do seletor de formas) não pode fazer a tela
    // quebrar no `.map`.
    expect(T.estadoBasePagamento(cobrancaFake({ metodos_ofertados: null })).metodos).toEqual([]);
  });
});

describe('telaPublica · decidirForma (régua PURA)', () => {
  it('forma fora das ofertadas é RECUSADA com 400', () => {
    // Respeita a configuração de quem criou a cobrança: forma fora da lista não
    // é oferecida nem por chamada direta à API.
    const d = T.decidirForma(cobrancaFake(), { metodo: 'boleto' }, 12);
    expect(d.acao).toBe('recusar');
    expect(d.status).toBe(400);
  });

  it('lista de formas VAZIA aceita qualquer forma (cobrança antiga)', () => {
    const d = T.decidirForma(cobrancaFake({ metodos_ofertados: [] }), { metodo: 'boleto' }, 12);
    expect(d.acao).toBe('aplicar');
  });

  it('cobrança já paga responde ja_pago, sem tocar no provedor', () => {
    // Dois cliques em "Pix" depois de pago não podem virar erro na cara da
    // pessoa nem reescrever a forma de um pagamento já consumado.
    const d = T.decidirForma(cobrancaFake({ status: 'pago' }), { metodo: 'pix' }, 12);
    expect(d.acao).toBe('ja_pago');
    expect(d.status).toBe(200);
  });

  it('o teto de parcelas do EVENTO é aplicado', () => {
    // Mutation-test: confiar no número que vem da tela deixaria alguém parcelar
    // em 21x algo configurado pra 6x.
    const d = T.decidirForma(cobrancaFake({ parcelas_max: 6 }), { metodo: 'cartao', parcelas: 21 }, 12);
    expect(d).toMatchObject({ acao: 'aplicar', metodo: 'cartao', parcelas: 6 });
  });

  it('`parcelas_max` NULL cai no teto do PROVIDER, nunca em 1', () => {
    // Tratar NULL como 1x tiraria o parcelado de tudo que não configurou teto.
    const d = T.decidirForma(cobrancaFake({ parcelas_max: null }), { metodo: 'cartao', parcelas: 99 }, 12);
    expect(d.parcelas).toBe(12);
  });

  it('Pix e boleto SEMPRE vão com parcelas 1', () => {
    // `installmentCount` em Pix não é parcelamento — mandar plano numa forma que
    // não parcela é como o adapter cria N cobranças e a 1ª "quita" tudo.
    expect(T.decidirForma(cobrancaFake(), { metodo: 'pix', parcelas: 12 }, 12).parcelas).toBe(1);
    expect(T.decidirForma(cobrancaFake({ metodos_ofertados: ['boleto'] }),
      { metodo: 'boleto', parcelas: 12 }, 12).parcelas).toBe(1);
  });

  it('cartão sem parcelas pedidas é à vista', () => {
    expect(T.decidirForma(cobrancaFake(), { metodo: 'cartao' }, 12).parcelas).toBe(1);
  });
});

describe('telaPublica · escolherFormaPagamento (efeito)', () => {
  it('sucesso devolve 200 e a cobrança do provedor', async () => {
    const nova = cobrancaFake({ metodo: 'cartao', parcelas_total: 6 });
    const chamadas: unknown[][] = [];
    const r = await T.escolherFormaPagamento(cobrancaFake(), { metodo: 'cartao', parcelas: 6 }, {
      definirMetodo: (...args: unknown[]) => {
        chamadas.push(args);
        return Promise.resolve({ cobranca: nova, alterada: true });
      },
    });
    expect(r.status).toBe(200);
    expect(r.cobranca).toBe(nova);
    expect(chamadas[0][1]).toBe('cartao');
    expect(chamadas[0][2]).toEqual({ parcelas: 6 });
  });

  it('forma recusada NÃO chama o provedor', async () => {
    let chamou = false;
    const r = await T.escolherFormaPagamento(cobrancaFake(), { metodo: 'boleto' }, {
      definirMetodo: () => { chamou = true; return Promise.resolve({ alterada: true }); },
    });
    expect(r.status).toBe(400);
    expect(chamou).toBe(false);
  });

  it('`alterada: false` responde 409, não um 200 silencioso', async () => {
    // Era o bug: a aba mudava, o servidor não, e a tela mostrava duas verdades
    // sem dizer nada.
    const r = await T.escolherFormaPagamento(cobrancaFake(), { metodo: 'pix' }, {
      definirMetodo: () => Promise.resolve({ cobranca: cobrancaFake(), alterada: false }),
    });
    expect(r.status).toBe(409);
    expect(r.error).toMatch(/não aceita mais/);
  });

  it('erro do provedor vira 502 COM o estado atual — nunca lança', async () => {
    // A rota precisa devolver a cobrança pra tela não regredir pra vazio e poder
    // voltar a aba pra forma que existe.
    const c = cobrancaFake();
    const r = await T.escolherFormaPagamento(c, { metodo: 'pix' }, {
      definirMetodo: () => Promise.reject(new Error('conta sem chave Pix')),
    });
    expect(r.status).toBe(502);
    expect(r.cobranca).toBe(c);
  });
});

describe('telaPublica · sincronizarSeParada', () => {
  it('não consulta o PSP quando a cobrança é recente', async () => {
    let chamou = false;
    const c = cobrancaFake({ updated_at: new Date().toISOString() });
    expect(await T.sincronizarSeParada(c, { sincronizar: () => { chamou = true; } })).toBe(c);
    expect(chamou).toBe(false);
  });

  it('não consulta o PSP em status TERMINAL', async () => {
    // Reconsultar pagamento resolvido é gastar chamada e reabrir discussão sobre
    // um fato já decidido.
    let chamou = false;
    const c = cobrancaFake({ status: 'pago', updated_at: '2020-01-01T00:00:00.000Z' });
    expect(await T.sincronizarSeParada(c, { sincronizar: () => { chamou = true; } })).toBe(c);
    expect(chamou).toBe(false);
  });

  it('consulta o PSP quando está aberta e parada há mais de 2 min', async () => {
    const nova = cobrancaFake({ status: 'pago' });
    const antiga = cobrancaFake({ updated_at: new Date(Date.now() - 5 * 60000).toISOString() });
    const r = await T.sincronizarSeParada(antiga, { sincronizar: () => Promise.resolve({ cobranca: nova }) });
    expect(r).toBe(nova);
  });

  it('falha na consulta NÃO derruba a tela: devolve a cobrança original', async () => {
    const antiga = cobrancaFake({ updated_at: new Date(Date.now() - 5 * 60000).toISOString() });
    const r = await T.sincronizarSeParada(antiga, { sincronizar: () => Promise.reject(new Error('psp fora')) });
    expect(r).toBe(antiga);
  });
});

describe('generosidade · data da doação no fuso da igreja', () => {
  it('doação das 20h30 do Rio fica no dia do CULTO, não no dia UTC seguinte', () => {
    // `toISOString().slice(0,10)` daria 2026-08-06 e a doação do culto da noite
    // apareceria no dia seguinte na série de generosidade. Mesma lição do dia da
    // curva do censo e do check-in do Kids.
    expect(G.dataBrt('2026-08-05T23:30:00Z')).toBe('2026-08-05');
    expect(G.dataBrt('2026-08-06T02:00:00Z')).toBe('2026-08-05');
  });

  it('depois da meia-noite BRT já é o dia novo', () => {
    expect(G.dataBrt('2026-08-06T04:00:00Z')).toBe('2026-08-06');
  });
});

describe('generosidade · categorias', () => {
  it('espelha EXATAMENTE o CHECK de mem_contribuicoes.tipo', () => {
    // Categoria que não cabe na coluna não pode ser oferecida na porta pública:
    // o insert falharia depois de o dinheiro já ter entrado.
    expect([...G.TIPOS_CONTRIBUICAO].sort()).toEqual(['campanha', 'dizimo', 'oferta']);
  });
});

describe('generosidade · handler registrado no núcleo', () => {
  beforeEach(() => { vi.unstubAllEnvs(); });

  it('o núcleo acha o handler por origem_tipo', async () => {
    // @ts-expect-error módulo JS sem tipos
    const handlers = await import('../../backend/services/pagamentos/handlers/index.js');
    const H = handlers as any;
    expect(H.obter('generosidade')?.origem_tipo).toBe('generosidade');
    // Sem isto, doação paga nunca viraria linha no razão nominal e ninguém seria
    // avisado — o dinheiro entraria em silêncio.
    expect(typeof H.obter('generosidade').aoPagar).toBe('function');
  });

  it('ORIGENS.GENEROSIDADE é o valor que a porta pública usa', () => {
    expect(P.ORIGENS.GENEROSIDADE).toBe('generosidade');
  });
});
