import { describe, it, expect, vi, beforeEach } from 'vitest';

// O núcleo de pagamentos é CommonJS no backend. Estes testes cobrem as partes
// que NÃO tocam banco: registro de providers, contrato do adapter e o mapa de
// espelho de status do handler da espinha. O que fala com o Supabase fica pro
// teste de integração (precisa de banco).

// @ts-expect-error módulo JS sem tipos
import * as providers from '../../backend/services/pagamentos/providers/index.js';
// @ts-expect-error módulo JS sem tipos
import * as manual from '../../backend/services/pagamentos/providers/manual.js';
// @ts-expect-error módulo JS sem tipos
import { STATUS, METODOS_VALIDOS } from '../../backend/services/pagamentos/tipos.js';

const P = providers as any;
const M = manual as any;

describe('pagamentos · registro de providers', () => {
  beforeEach(() => { vi.unstubAllEnvs(); });

  it('o provider manual sempre existe', () => {
    // É a rede de segurança do sistema: "marcar como pago" e lançamento em
    // espécie não podem depender de PSP configurado.
    expect(P.existe('manual')).toBe(true);
    expect(P.obter('manual').nome).toBe('manual');
  });

  it('provider desconhecido LANÇA, não cai no padrão em silêncio', () => {
    // Silêncio aqui significaria cobrança criada num provider que não sabe
    // cobrar — o pagador vê um checkout que não existe.
    expect(() => P.obter('gateway_que_nao_existe')).toThrow(/não está registrado/);
  });

  it('o padrão é manual quando a env não diz outra coisa', () => {
    expect(P.providerPadrao()).toBe('manual');
    // `manual` é dinheiro fora do PSP — não conta como PSP configurado.
    expect(P.pspConfigurado()).toBe(false);
  });

  it('pspConfigurado é false quando PAG_PROVIDER_PADRAO aponta pro que não existe', () => {
    // Env apontando pra adapter ausente (erro de digitação, adapter ainda não
    // escrito) NÃO pode ligar o fluxo pago automático.
    vi.stubEnv('PAG_PROVIDER_PADRAO', 'gateway_inexistente');
    expect(P.pspConfigurado()).toBe(false);
  });

  it('o adapter do Asaas está registrado e é reconhecido como PSP', () => {
    expect(P.existe('asaas')).toBe(true);
    vi.stubEnv('PAG_PROVIDER_PADRAO', 'asaas');
    expect(P.pspConfigurado()).toBe(true);
  });

  it('todo provider registrado cumpre o contrato do adapter', () => {
    const obrigatorios = [
      'criarCobranca', 'consultarStatus', 'cancelarCobranca', 'estornar',
      'verificarAssinatura', 'normalizarEvento',
    ];
    for (const { nome } of P.listar()) {
      const a = P.obter(nome);
      for (const fn of obrigatorios) {
        expect(typeof a[fn], `${nome}.${fn} deveria ser função`).toBe('function');
      }
      expect(Array.isArray(a.capacidades?.metodos), `${nome}.capacidades.metodos`).toBe(true);
      for (const m of a.capacidades.metodos) {
        expect(METODOS_VALIDOS, `${nome} oferece método fora do vocabulário`).toContain(m);
      }
    }
  });
});

describe('pagamentos · provider manual', () => {
  it('cobrança manual nasce aguardando, sem checkout', async () => {
    const r = await M.criarCobranca({ valor_centavos: 80000 });
    expect(r.status).toBe(STATUS.AGUARDANDO);
    expect(r.checkout_url).toBeNull();
    expect(r.provider_cobranca_id).toBeNull();
  });

  it('não aceita webhook e diz por quê', () => {
    const v = M.verificarAssinatura('{}', {}, 'segredo');
    expect(v.ok).toBe(false);
    expect(v.motivo).toBeTruthy();
    expect(M.normalizarEvento({}, {})).toBeNull();
  });

  it('estorno manual falha alto (é ato de tesouraria)', async () => {
    await expect(M.estornar({}, {})).rejects.toThrow(/tesouraria/i);
  });

  it('não consulta status — a verdade é o registro humano', async () => {
    expect(await M.consultarStatus({})).toBeNull();
    expect(M.capacidades.consulta_status).toBe(false);
    expect(M.capacidades.webhook).toBe(false);
  });
});

describe('pagamentos · espelho de status pra insc_pagamentos', () => {
  // O vocabulário de insc_pagamentos é mais curto (5) que o do núcleo (10). O
  // mapa tem que cobrir TODOS os status do núcleo — status novo sem entrada
  // cairia no default 'pendente' e a UI mostraria "aguardando" pra cobrança
  // estornada.
  it('cobre todos os status canônicos', async () => {
    // @ts-expect-error módulo JS sem tipos
    const h = await import('../../backend/services/pagamentos/handlers/inscricao.js');
    const mapa = (h as any).STATUS_ESPELHO;
    for (const s of Object.values(STATUS) as string[]) {
      expect(mapa[s], `status ${s} sem espelho em insc_pagamentos`).toBeDefined();
    }
  });

  it('só pago vira pago; parcial NÃO', async () => {
    // Parcial marcado como 'pago' confirmaria inscrição com dinheiro faltando.
    // @ts-expect-error módulo JS sem tipos
    const h = await import('../../backend/services/pagamentos/handlers/inscricao.js');
    const mapa = (h as any).STATUS_ESPELHO;
    expect(mapa[STATUS.PAGO]).toBe('pago');
    expect(mapa[STATUS.PAGO_PARCIAL]).toBe('aguardando');
    expect(mapa[STATUS.CHARGEBACK]).toBe('estornado');
    expect(mapa[STATUS.EXPIRADA]).toBe('expirado');
  });
});
