import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  APROV_TTL_MS,
  TOKEN_TTL_MS,
  RENOV_TTL_MS,
  CONFIRA_TTL_MS,
  APROV_PRORROGADO_ATE_PADRAO,
  aprovProrrogadoAte,
  assinarToken,
  verificarToken,
} from '../../backend/utils/gruposToken.js';

// ─────────────────────────────────────────────────────────────────────────────
// Contexto (Natasha · 12/08/2026): "o link de aprovação de pessoas em grupos
// fique válido por mais de 7 dias, os líderes estão aprendendo e alguns
// deixaram muito tempo sem aprovar; revalide o link e renove até o fim do mês".
//
// Medido em produção no mesmo dia: 90 pedidos pendentes, 51 (57%) com mais de
// 7 dias — ou seja, mais da metade dos links já não abria. 35 líderes, 36
// grupos, 0 com opt-out, 0 sem telefone.
//
// ⚠️ A PRORROGAÇÃO é exceção de segurança com prazo. Este arquivo existe pra
// que afrouxá-la seja uma decisão consciente, não um efeito colateral: os
// testes abaixo ficam VERMELHOS se alguém estender a tolerância a outros tipos
// de token, tirar a data-limite ou dispensar a assinatura.
// ─────────────────────────────────────────────────────────────────────────────

const SEGREDO = 'segredo-de-teste-só-do-vitest';
const ENVS = ['GRUPOS_TOKEN_SECRET', 'CRON_SECRET', 'GRUPOS_APROV_PRORROGADO_ATE'] as const;
const original: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const k of ENVS) original[k] = process.env[k];
  process.env.GRUPOS_TOKEN_SECRET = SEGREDO;
  delete process.env.CRON_SECRET;
  delete process.env.GRUPOS_APROV_PRORROGADO_ATE;
});

afterEach(() => {
  for (const k of ENVS) {
    if (original[k] === undefined) delete process.env[k];
    else process.env[k] = original[k] as string;
  }
});

const DIA = 24 * 60 * 60 * 1000;
// "Agora" é sempre INJETADO — teste que lê o relógio da máquina foi o que
// mordeu no faixaEtaria.test.ts (e este aqui depende de data de calendário).
const T0 = Date.parse('2026-08-12T12:00:00-03:00');
const FIM_DO_MES = Date.parse(APROV_PRORROGADO_ATE_PADRAO);

describe('TTL · o link de aprovação passou de 7 para 30 dias', () => {
  it('aprovação dura 30 dias', () => {
    expect(APROV_TTL_MS).toBe(30 * DIA);
  });

  it('o default histórico de 7 dias continua valendo para os outros links', () => {
    // Sugestão (/g/s/) e chamada do mês (/g/f/) não pediram mudança: subir o
    // default junto teria estendido TRÊS fluxos de uma vez, sem ninguém pedir.
    expect(TOKEN_TTL_MS).toBe(7 * DIA);
    expect(RENOV_TTL_MS).toBe(30 * DIA);
    expect(CONFIRA_TTL_MS).toBe(30 * DIA);
  });

  it('token de aprovação recém-assinado ainda vale no 29º dia', () => {
    const t = assinarToken('aprov', 'pedido-1', { l: 'lider-1' }, APROV_TTL_MS, T0);
    expect(verificarToken(t, 'aprov', T0 + 29 * DIA)).toMatchObject({ p: 'pedido-1', l: 'lider-1' });
  });
});

describe('prorrogação · o link JÁ ENTREGUE volta a abrir, sem reenviar nada', () => {
  // Este é o caso dos 51: token assinado com o TTL antigo de 7 dias, vencido,
  // e a mensagem ainda no WhatsApp do líder.
  const tokenAntigo = () => assinarToken('aprov', 'pedido-antigo', { l: 'lider-1' }, 7 * DIA, T0 - 15 * DIA);

  it('aceita o token vencido enquanto a prorrogação estiver de pé', () => {
    const p = verificarToken(tokenAntigo(), 'aprov', T0);
    expect(p).toMatchObject({ p: 'pedido-antigo', l: 'lider-1', prorrogado: true });
  });

  it('marca `prorrogado` só quando de fato prorrogou', () => {
    // Sem a marca, ninguém consegue distinguir depois o que entrou pela
    // exceção do que entrou pela validade normal.
    const novo = assinarToken('aprov', 'pedido-novo', { l: 'lider-1' }, APROV_TTL_MS, T0);
    expect(verificarToken(novo, 'aprov', T0 + DIA)).not.toHaveProperty('prorrogado');
  });

  it('MORRE SOZINHA depois do fim do mês', () => {
    // ⚠️ É o que separa "remendo datado" de "porta permanente".
    expect(verificarToken(tokenAntigo(), 'aprov', FIM_DO_MES - 1000)).toMatchObject({ prorrogado: true });
    expect(verificarToken(tokenAntigo(), 'aprov', FIM_DO_MES + 1000)).toBeNull();
  });

  it('a data-limite é o fim de agosto de 2026, no fuso do Rio', () => {
    // Data ingênua (`2026-08-31`) seria meia-noite UTC = 20h51 do dia 30 no
    // Rio — a prorrogação morreria um dia antes do que se combinou.
    expect(aprovProrrogadoAte()).toBe(FIM_DO_MES);
    expect(new Date(FIM_DO_MES).toISOString()).toBe('2026-09-01T02:59:59.000Z');
  });

  it('a env estica a data sem deploy', () => {
    process.env.GRUPOS_APROV_PRORROGADO_ATE = '2026-09-30T23:59:59-03:00';
    expect(verificarToken(tokenAntigo(), 'aprov', FIM_DO_MES + DIA)).toMatchObject({ prorrogado: true });
  });

  it('data inválida ou vazia DESLIGA a prorrogação (fail-closed)', () => {
    process.env.GRUPOS_APROV_PRORROGADO_ATE = 'fim do mês';
    expect(aprovProrrogadoAte()).toBe(0);
    expect(verificarToken(tokenAntigo(), 'aprov', T0)).toBeNull();

    process.env.GRUPOS_APROV_PRORROGADO_ATE = '';
    expect(aprovProrrogadoAte()).toBe(0);
    expect(verificarToken(tokenAntigo(), 'aprov', T0)).toBeNull();
  });
});

describe('⚠️ o que a prorrogação NÃO pode virar', () => {
  it('NÃO vale para os outros tipos de link', () => {
    // Mutação a evitar: trocar o `tipoEsperado === "aprov"` por um `true`.
    // Renovação e conferência REMOVEM gente do roster e a chamada do mês
    // escreve presença — nada disso foi pedido e nada disso é reversível por
    // quem abre o link.
    for (const tipo of ['suges', 'freq', 'renov', 'conf']) {
      const t = assinarToken(tipo, 'x', { l: 'lider-1' }, 7 * DIA, T0 - 15 * DIA);
      expect(verificarToken(t, tipo, T0)).toBeNull();
    }
  });

  it('NÃO dispensa a assinatura — token forjado continua recusado', () => {
    const t = assinarToken('aprov', 'pedido-antigo', { l: 'lider-1' }, 7 * DIA, T0 - 15 * DIA);
    const [json] = t.split('.');
    expect(verificarToken(`${json}.assinaturaInventada12345`, 'aprov', T0)).toBeNull();

    // Payload adulterado (trocar o pedido alvo) invalida a assinatura.
    const outro = Buffer.from(
      JSON.stringify({ t: 'aprov', p: 'pedido-de-outra-pessoa', l: 'lider-1', exp: T0 + DIA }),
    ).toString('base64url');
    const [, sig] = t.split('.');
    expect(verificarToken(`${outro}.${sig}`, 'aprov', T0)).toBeNull();
  });

  it('NÃO aceita token de outro tipo remarcado como aprovação', () => {
    // Assinado como 'conf' (que remove gente do grupo) e apresentado como
    // 'aprov' pra pegar carona na tolerância.
    const t = assinarToken('conf', 'grupo-1', { l: 'lider-1' }, 7 * DIA, T0 - 15 * DIA);
    expect(verificarToken(t, 'aprov', T0)).toBeNull();
  });

  it('continua fail-closed sem segredo configurado', () => {
    const t = assinarToken('aprov', 'pedido-antigo', { l: 'lider-1' }, 7 * DIA, T0 - 15 * DIA);
    delete process.env.GRUPOS_TOKEN_SECRET;
    delete process.env.CRON_SECRET;
    expect(verificarToken(t, 'aprov', T0)).toBeNull();
    expect(() => assinarToken('aprov', 'p', {}, APROV_TTL_MS, T0)).toThrow();
  });

  it('token sem `exp` é recusado, prorrogação ou não', () => {
    // Sem essa guarda, "sem validade" viraria "validade infinita".
    const semExp = Buffer.from(JSON.stringify({ t: 'aprov', p: 'x', l: 'lider-1' })).toString('base64url');
    const crypto = require('crypto');
    const sig = crypto.createHmac('sha256', SEGREDO).update(semExp).digest('base64url').slice(0, 24);
    expect(verificarToken(`${semExp}.${sig}`, 'aprov', T0)).toBeNull();
  });
});
