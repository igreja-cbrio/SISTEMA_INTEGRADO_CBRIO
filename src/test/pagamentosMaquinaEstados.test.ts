import { describe, it, expect } from 'vitest';
// Serviço do backend (CommonJS) — máquina de estados da cobrança.
import * as maq from '../../backend/services/pagamentos/maquinaEstados.js';
import { STATUS, TRANSICOES } from '../../backend/services/pagamentos/tipos.js';

const {
  aplicarTransicao, estaAberta, estaTerminal, temDinheiro, podeExpirar, statusPorValor,
} = maq as any;

describe('pagamentos · máquina de estados', () => {
  it('percorre o caminho feliz', () => {
    expect(aplicarTransicao(STATUS.CRIADA, STATUS.AGUARDANDO).ok).toBe(true);
    expect(aplicarTransicao(STATUS.AGUARDANDO, STATUS.PAGO).ok).toBe(true);
  });

  it('reentrega do mesmo evento é no-op, não erro', () => {
    // O PSP reentrega o mesmo webhook rotineiramente; tratar como erro
    // transformaria idempotência em falha.
    const r = aplicarTransicao(STATUS.PAGO, STATUS.PAGO);
    expect(r.ok).toBe(true);
    expect(r.noop).toBe(true);
  });

  it('NÃO despaga: pago nunca volta pra aberto/expirado/cancelado', () => {
    // Invariante central. Webhook fora de ordem (reentrega chegando depois do
    // cron de expiração) não pode desfazer inscrição confirmada.
    for (const destino of [
      STATUS.CRIADA, STATUS.AGUARDANDO, STATUS.PAGO_PARCIAL,
      STATUS.EXPIRADA, STATUS.CANCELADA, STATUS.FALHOU,
    ]) {
      const r = aplicarTransicao(STATUS.PAGO, destino);
      expect(r.ok, `pago -> ${destino} deveria ser bloqueado`).toBe(false);
      expect(r.motivo).toBeTruthy();
    }
  });

  it('de pago só sai pra estorno/chargeback', () => {
    expect(aplicarTransicao(STATUS.PAGO, STATUS.ESTORNADO).ok).toBe(true);
    expect(aplicarTransicao(STATUS.PAGO, STATUS.ESTORNADO_PARCIAL).ok).toBe(true);
    expect(aplicarTransicao(STATUS.PAGO, STATUS.CHARGEBACK).ok).toBe(true);
  });

  it('estados terminais são absorventes', () => {
    for (const terminal of [
      STATUS.EXPIRADA, STATUS.CANCELADA, STATUS.FALHOU,
      STATUS.ESTORNADO, STATUS.CHARGEBACK,
    ]) {
      for (const destino of Object.values(STATUS) as string[]) {
        if (destino === terminal) continue;
        expect(
          aplicarTransicao(terminal, destino).ok,
          `${terminal} -> ${destino} deveria ser bloqueado`,
        ).toBe(false);
      }
    }
  });

  it('expirada não vira paga pelo webhook atrasado', () => {
    // Cobrança expirou, o PSP entrega 'pago' depois. A vaga já foi liberada —
    // isso vai pra revisão humana, não pode virar confirmação automática.
    expect(aplicarTransicao(STATUS.EXPIRADA, STATUS.PAGO).ok).toBe(false);
  });

  it('parcial pode completar ou ser estornado', () => {
    expect(aplicarTransicao(STATUS.PAGO_PARCIAL, STATUS.PAGO).ok).toBe(true);
    expect(aplicarTransicao(STATUS.PAGO_PARCIAL, STATUS.CHARGEBACK).ok).toBe(true);
  });

  it('rejeita status desconhecido nos dois lados', () => {
    expect(aplicarTransicao('inventado', STATUS.PAGO).ok).toBe(false);
    expect(aplicarTransicao(STATUS.CRIADA, 'RECEIVED').ok).toBe(false); // string crua de PSP
    expect(aplicarTransicao(null, STATUS.PAGO).ok).toBe(false);
    expect(aplicarTransicao(STATUS.PAGO, undefined).ok).toBe(false);
  });

  it('todo status tem entrada em TRANSICOES', () => {
    // Guarda contra status novo entrar no CHECK do banco e ninguém mapear aqui
    // (a transição cairia em "status desconhecido" silenciosamente).
    for (const s of Object.values(STATUS) as string[]) {
      expect(TRANSICOES[s], `status ${s} sem entrada em TRANSICOES`).toBeDefined();
    }
  });

  it('classifica aberto / terminal / com dinheiro', () => {
    expect(estaAberta(STATUS.AGUARDANDO)).toBe(true);
    expect(estaAberta(STATUS.PAGO)).toBe(false);
    expect(estaTerminal(STATUS.CANCELADA)).toBe(true);
    expect(estaTerminal(STATUS.PAGO)).toBe(false); // ainda pode ser estornado
    expect(temDinheiro(STATUS.PAGO)).toBe(true);
    expect(temDinheiro(STATUS.PAGO_PARCIAL)).toBe(true);
    expect(temDinheiro(STATUS.AGUARDANDO)).toBe(false);
  });

  describe('podeExpirar', () => {
    const passado = new Date(Date.now() - 60_000).toISOString();
    const futuro = new Date(Date.now() + 60_000).toISOString();

    it('expira cobrança aberta e vencida', () => {
      expect(podeExpirar({
        status: STATUS.AGUARDANDO, expira_em: passado, valor_pago_centavos: 0,
      })).toBe(true);
    });

    it('NUNCA expira quem já pagou algo, mesmo vencida', () => {
      // O dinheiro entrou → a pessoa tem direito à vaga. Caso pra humano.
      expect(podeExpirar({
        status: STATUS.PAGO_PARCIAL, expira_em: passado, valor_pago_centavos: 1,
      })).toBe(false);
    });

    it('não expira antes do prazo, sem prazo, ou já terminal', () => {
      expect(podeExpirar({ status: STATUS.AGUARDANDO, expira_em: futuro, valor_pago_centavos: 0 })).toBe(false);
      expect(podeExpirar({ status: STATUS.AGUARDANDO, expira_em: null, valor_pago_centavos: 0 })).toBe(false);
      expect(podeExpirar({ status: STATUS.CANCELADA, expira_em: passado, valor_pago_centavos: 0 })).toBe(false);
      expect(podeExpirar(null)).toBe(false);
    });
  });

  describe('statusPorValor', () => {
    it('valor cheio = pago; parte = parcial; nada = null', () => {
      expect(statusPorValor({ valor_centavos: 80000, valor_pago_centavos: 80000 })).toBe(STATUS.PAGO);
      expect(statusPorValor({ valor_centavos: 80000, valor_pago_centavos: 40000 })).toBe(STATUS.PAGO_PARCIAL);
      expect(statusPorValor({ valor_centavos: 80000, valor_pago_centavos: 0 })).toBe(null);
    });

    it('tolera 1 centavo de arredondamento de parcela', () => {
      // 12x de R$ 800 não fecha exato; faltar 1 centavo não é pagamento parcial.
      expect(statusPorValor({ valor_centavos: 80000, valor_pago_centavos: 79999 })).toBe(STATUS.PAGO);
      expect(statusPorValor({ valor_centavos: 80000, valor_pago_centavos: 79998 })).toBe(STATUS.PAGO_PARCIAL);
    });

    it('pagamento a mais conta como pago', () => {
      expect(statusPorValor({ valor_centavos: 80000, valor_pago_centavos: 80500 })).toBe(STATUS.PAGO);
    });
  });
});
