// Contrato dos chips Abertas · Sem resposta · Finalizadas do inbox.
// `agora` é INJETADO — teste que lê o relógio da máquina é o que já mordeu no
// faixaEtaria. Roda no `npm test` (gate de deploy).
import { describe, it, expect } from 'vitest';
import {
  semResposta, horasSemResposta, vencida, rotuloIdade, aplicarVista, contarVistas, LIMITE_SEM_RESPOSTA_H,
} from '../lib/waConversaEstado';

const AGORA = Date.parse('2026-09-08T12:00:00Z');
const h = (n: number) => new Date(AGORA - n * 3_600_000).toISOString();

function conv(p: Partial<{ resolvida: boolean; last_message_at: string | null; last_inbound_at: string | null; id: string }>) {
  return { id: p.id || 'x', resolvida: p.resolvida ?? false, last_message_at: p.last_message_at ?? null, last_inbound_at: p.last_inbound_at ?? null };
}

describe('waConversaEstado · semResposta', () => {
  it('a pessoa falou por último (inbound == última mensagem, como o RPC grava) ⇒ sem resposta', () => {
    expect(semResposta(conv({ last_inbound_at: h(3), last_message_at: h(3) }))).toBe(true);
  });
  it('a igreja respondeu depois ⇒ respondida', () => {
    expect(semResposta(conv({ last_inbound_at: h(3), last_message_at: h(1) }))).toBe(false);
  });
  it('sem nenhuma mensagem recebida ⇒ não está esperando', () => {
    expect(semResposta(conv({ last_inbound_at: null, last_message_at: h(1) }))).toBe(false);
  });
  it('conversa finalizada nunca é "sem resposta", mesmo com a pessoa por último', () => {
    expect(semResposta(conv({ resolvida: true, last_inbound_at: h(3), last_message_at: h(3) }))).toBe(false);
  });
  it('inbound registrado sem last_message_at (linha antiga) conta como esperando', () => {
    expect(semResposta(conv({ last_inbound_at: h(2), last_message_at: null }))).toBe(true);
  });
});

describe('waConversaEstado · idade e corte', () => {
  it('mede as horas desde a última mensagem DA PESSOA', () => {
    expect(horasSemResposta(conv({ last_inbound_at: h(3), last_message_at: h(3) }), AGORA)).toBe(3);
    expect(horasSemResposta(conv({ last_inbound_at: null }), AGORA)).toBeNull();
  });
  it('relógio adiantado no cliente não produz idade negativa', () => {
    expect(horasSemResposta(conv({ last_inbound_at: h(-2) }), AGORA)).toBe(0);
  });
  it('o corte é 48h, inclusivo — o mesmo "+2 dias" da medição de 08/09', () => {
    expect(LIMITE_SEM_RESPOSTA_H).toBe(48);
    expect(vencida(47.99)).toBe(false);
    expect(vencida(48)).toBe(true);
    expect(vencida(null)).toBe(false);
  });
  it('rótulo curto: minutos, horas, dias', () => {
    expect(rotuloIdade(0.5)).toBe('há 30min');
    expect(rotuloIdade(0.001)).toBe('há 1min');
    expect(rotuloIdade(3.7)).toBe('há 3h');
    expect(rotuloIdade(49)).toBe('há 2d');
    expect(rotuloIdade(null)).toBe('');
  });
});

describe('waConversaEstado · vistas', () => {
  const lista = [
    conv({ id: 'a', last_inbound_at: h(1), last_message_at: h(1) }),          // esperando há 1h
    conv({ id: 'b', last_inbound_at: h(50), last_message_at: h(50) }),        // esperando há 50h (vencida)
    conv({ id: 'c', last_inbound_at: h(5), last_message_at: h(4) }),          // respondida
    conv({ id: 'd', resolvida: true, last_inbound_at: h(70), last_message_at: h(70) }), // finalizada
  ];
  it('"abertas" tira as finalizadas e PRESERVA a ordem do servidor', () => {
    expect(aplicarVista(lista, 'abertas').map(c => c.id)).toEqual(['a', 'b', 'c']);
  });
  it('"sem resposta" fica só com quem espera, da espera mais LONGA para a mais curta', () => {
    expect(aplicarVista(lista, 'sem_resposta').map(c => c.id)).toEqual(['b', 'a']);
  });
  it('"finalizadas" fica só com as resolvidas', () => {
    expect(aplicarVista(lista, 'finalizadas').map(c => c.id)).toEqual(['d']);
  });
  it('contagens dos chips, com as vencidas separadas', () => {
    expect(contarVistas(lista, AGORA)).toEqual({ abertas: 3, sem_resposta: 2, vencidas: 1 });
  });
  it('lista ausente não quebra', () => {
    expect(aplicarVista(undefined as any, 'abertas')).toEqual([]);
    expect(contarVistas(null as any, AGORA)).toEqual({ abertas: 0, sem_resposta: 0, vencidas: 0 });
  });
});
