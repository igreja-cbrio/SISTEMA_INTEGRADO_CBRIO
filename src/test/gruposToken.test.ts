import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  APROV_TTL_MS,
  TOKEN_TTL_MS,
  RENOV_TTL_MS,
  CONFIRA_TTL_MS,
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
// ⚠️ EM 17/08 a régua mudou (Pr. Nélio + Natasha): o link fica ativo
// **enquanto a temporada estiver aberta**, e não até uma data fixa. Quem sabe
// da temporada é `publicGrupos.js` (tem banco); aqui a decisão CHEGA como
// `opts.aceitarExpirado`, e o default é **false** — quem não souber responder
// não prorroga.
//
// ⚠️ A PRORROGAÇÃO é exceção de segurança. Este arquivo existe pra que
// afrouxá-la seja decisão consciente, não efeito colateral: os testes abaixo
// ficam VERMELHOS se alguém estender a tolerância a outros tipos de token,
// inverter o default para "aceita" ou dispensar a assinatura.
// ─────────────────────────────────────────────────────────────────────────────

const SEGREDO = 'segredo-de-teste-só-do-vitest';
const ENVS = ['GRUPOS_TOKEN_SECRET', 'CRON_SECRET'] as const;
const original: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const k of ENVS) original[k] = process.env[k];
  process.env.GRUPOS_TOKEN_SECRET = SEGREDO;
  delete process.env.CRON_SECRET;
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
// A decisão "a temporada está aberta?" vem de fora (publicGrupos consulta
// `mem_temporadas.inscricoes_abertas`).
const TEMPORADA_ABERTA = { aceitarExpirado: true };
const TEMPORADA_FECHADA = { aceitarExpirado: false };

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

describe('validade = TEMPORADA · o link já entregue abre enquanto ela estiver aberta', () => {
  // Este é o caso dos 51: token assinado com o TTL antigo de 7 dias, vencido,
  // e a mensagem ainda no WhatsApp do líder.
  const tokenAntigo = () => assinarToken('aprov', 'pedido-antigo', { l: 'lider-1' }, 7 * DIA, T0 - 15 * DIA);

  it('aceita o token vencido com a temporada ABERTA', () => {
    const p = verificarToken(tokenAntigo(), 'aprov', T0, TEMPORADA_ABERTA);
    expect(p).toMatchObject({ p: 'pedido-antigo', l: 'lider-1', prorrogado: true });
  });

  it('RECUSA o mesmo token com a temporada FECHADA', () => {
    // É literalmente o "enquanto aquela temporada estiver aberta": fechou as
    // inscrições, o link vencido morre — sem depender de data de calendário.
    expect(verificarToken(tokenAntigo(), 'aprov', T0, TEMPORADA_FECHADA)).toBeNull();
  });

  it('vale MUITO depois do fim de agosto (a data fixa antiga não manda mais)', () => {
    const dezembro = Date.parse('2026-12-20T12:00:00-03:00');
    expect(verificarToken(tokenAntigo(), 'aprov', dezembro, TEMPORADA_ABERTA)).toMatchObject({ prorrogado: true });
  });

  it('⚠️ o DEFAULT é não prorrogar — quem não passa opts não prorroga', () => {
    // Mutação a evitar: `opts.aceitarExpirado !== false`. Quem esquecer de
    // consultar a temporada tem que fechar a porta, não abrir.
    expect(verificarToken(tokenAntigo(), 'aprov', T0)).toBeNull();
    expect(verificarToken(tokenAntigo(), 'aprov', T0, {})).toBeNull();
  });

  it('só o booleano `true` abre — valor "quase verdadeiro" não serve', () => {
    // Se a consulta devolver algo estranho (string, objeto de erro), isso NÃO
    // pode ser lido como "pode prorrogar".
    for (const v of ['true', 1, {}, [], 'sim']) {
      expect(verificarToken(tokenAntigo(), 'aprov', T0, { aceitarExpirado: v as never })).toBeNull();
    }
  });

  it('marca `prorrogado` só quando de fato prorrogou', () => {
    // Sem a marca, ninguém consegue distinguir depois o que entrou pela
    // exceção do que entrou pela validade normal.
    const novo = assinarToken('aprov', 'pedido-novo', { l: 'lider-1' }, APROV_TTL_MS, T0);
    expect(verificarToken(novo, 'aprov', T0 + DIA, TEMPORADA_ABERTA)).not.toHaveProperty('prorrogado');
  });

  it('dentro do TTL o link abre mesmo com a temporada fechada', () => {
    // O TTL é o PISO: é ele que segura o link de pé se a consulta da temporada
    // falhar (que devolve false, fail-closed).
    const novo = assinarToken('aprov', 'pedido-novo', { l: 'lider-1' }, APROV_TTL_MS, T0);
    expect(verificarToken(novo, 'aprov', T0 + DIA, TEMPORADA_FECHADA)).toMatchObject({ p: 'pedido-novo' });
  });
});

describe('⚠️ o que a prorrogação NÃO pode virar', () => {
  it('NÃO vale para os outros tipos de link, NEM com a temporada aberta', () => {
    // Mutação a evitar: trocar o `tipoEsperado === "aprov"` por um `true`.
    // Renovação e conferência REMOVEM gente do roster e a chamada do mês
    // escreve presença — nada disso foi pedido e nada disso é reversível por
    // quem abre o link.
    for (const tipo of ['suges', 'freq', 'renov', 'conf']) {
      const t = assinarToken(tipo, 'x', { l: 'lider-1' }, 7 * DIA, T0 - 15 * DIA);
      expect(verificarToken(t, tipo, T0, TEMPORADA_ABERTA)).toBeNull();
    }
  });

  it('NÃO dispensa a assinatura — token forjado continua recusado', () => {
    const t = assinarToken('aprov', 'pedido-antigo', { l: 'lider-1' }, 7 * DIA, T0 - 15 * DIA);
    const [json] = t.split('.');
    expect(verificarToken(`${json}.assinaturaInventada12345`, 'aprov', T0, TEMPORADA_ABERTA)).toBeNull();

    // Payload adulterado (trocar o pedido alvo) invalida a assinatura.
    const outro = Buffer.from(
      JSON.stringify({ t: 'aprov', p: 'pedido-de-outra-pessoa', l: 'lider-1', exp: T0 + DIA }),
    ).toString('base64url');
    const [, sig] = t.split('.');
    expect(verificarToken(`${outro}.${sig}`, 'aprov', T0, TEMPORADA_ABERTA)).toBeNull();
  });

  it('NÃO aceita token de outro tipo remarcado como aprovação', () => {
    // Assinado como 'conf' (que remove gente do grupo) e apresentado como
    // 'aprov' pra pegar carona na tolerância.
    const t = assinarToken('conf', 'grupo-1', { l: 'lider-1' }, 7 * DIA, T0 - 15 * DIA);
    expect(verificarToken(t, 'aprov', T0, TEMPORADA_ABERTA)).toBeNull();
  });

  it('continua fail-closed sem segredo configurado', () => {
    const t = assinarToken('aprov', 'pedido-antigo', { l: 'lider-1' }, 7 * DIA, T0 - 15 * DIA);
    delete process.env.GRUPOS_TOKEN_SECRET;
    delete process.env.CRON_SECRET;
    expect(verificarToken(t, 'aprov', T0, TEMPORADA_ABERTA)).toBeNull();
    expect(() => assinarToken('aprov', 'p', {}, APROV_TTL_MS, T0)).toThrow();
  });

  it('token sem `exp` é recusado, temporada aberta ou não', () => {
    // Sem essa guarda, "sem validade" viraria "validade infinita".
    const semExp = Buffer.from(JSON.stringify({ t: 'aprov', p: 'x', l: 'lider-1' })).toString('base64url');
    const crypto = require('crypto');
    const sig = crypto.createHmac('sha256', SEGREDO).update(semExp).digest('base64url').slice(0, 24);
    expect(verificarToken(`${semExp}.${sig}`, 'aprov', T0, TEMPORADA_ABERTA)).toBeNull();
  });
});
