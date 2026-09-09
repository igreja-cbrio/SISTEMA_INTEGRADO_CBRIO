// Contrato do Dashboard da Comunicação (F2 · 09/09/2026). Roda no `npm test`
// (gate). Relógio INJETADO em tudo; nenhum caso lê Date.now().
import { describe, it, expect } from 'vitest';
import {
  ENTRADA, diaDe, segundaDe, chaveDoDia, proximaChave, granularidade, limitesUtc, tel8,
  montarSerie, agruparPorArea, resumoConversas, temposDeResposta, agregarTempos, engajamentoDisparos,
  semResposta as semRespostaServidor, horasSemResposta as horasServidor, vencida as vencidaServidor, mediana,
} from '../../backend/utils/comunicacaoDashboard';
import { semResposta as semRespostaCliente, horasSemResposta as horasCliente, vencida as vencidaCliente } from '../lib/waConversaEstado';

const AGORA = Date.parse('2026-09-09T15:00:00Z');
const h = (n: number) => new Date(AGORA - n * 3_600_000).toISOString();

describe('comunicacaoDashboard · dia BRT e baldes', () => {
  it('a mensagem das 23h do Rio (02h UTC do dia seguinte) fica no dia BRT certo', () => {
    expect(diaDe('2026-09-07T02:10:00Z')).toBe('2026-09-06'); // domingo à noite no Rio
    expect(diaDe('2026-09-06T15:00:00Z')).toBe('2026-09-06');
    expect(diaDe(null)).toBeNull();
  });
  it('semana começa na segunda; mês é YYYY-MM; próximo balde anda certo', () => {
    expect(segundaDe('2026-09-06')).toBe('2026-08-31'); // domingo → segunda anterior
    expect(segundaDe('2026-08-31')).toBe('2026-08-31');
    expect(chaveDoDia('2026-09-06', 'mes')).toBe('2026-09');
    expect(chaveDoDia('2026-09-06', 'semana')).toBe('2026-08-31');
    expect(chaveDoDia('2026-09-06', 'dia')).toBe('2026-09-06');
    expect(proximaChave('2026-08-31', 'semana')).toBe('2026-09-07');
    expect(proximaChave('2026-12', 'mes')).toBe('2027-01');
    expect(proximaChave('2026-02-28', 'dia')).toBe('2026-03-01');
  });
  it('granularidade: até 31 dias em DIA (pedido literal), depois semana, ano em mês', () => {
    expect(granularidade({ dias: 7 })).toBe('dia');
    expect(granularidade({ dias: 30 })).toBe('dia');
    expect(granularidade({ dias: 90 })).toBe('semana');
    expect(granularidade({ dias: 365 })).toBe('mes');
    expect(granularidade({ ano: 2025 })).toBe('mes');
    expect(granularidade({ inicio: '2026-09-01', fim: '2026-09-10' })).toBe('dia');
  });
  it('limites UTC de dias BRT: 03:00Z do início até 03:00Z do dia seguinte ao fim', () => {
    expect(limitesUtc('2026-09-01', '2026-09-08')).toEqual({ de: '2026-09-01T03:00:00.000Z', ate: '2026-09-09T03:00:00.000Z' });
  });
  it('tel8 é o sufixo de 8 dígitos, a mesma chave da fila', () => {
    expect(tel8('5521999998888')).toBe('99998888');
    expect(tel8('(21) 99999-8888')).toBe('99998888');
    expect(tel8('1234567')).toBeNull();
  });
});

describe('comunicacaoDashboard · série', () => {
  const msgs = [
    { conversa_id: 'a', direcao: 'in', tipo: 'text', criado_em: '2026-09-01T12:00:00Z' },
    { conversa_id: 'a', direcao: 'out', tipo: 'text', autor_id: 'u1', criado_em: '2026-09-01T13:00:00Z' },
    { conversa_id: 'b', direcao: 'in', tipo: 'text', criado_em: '2026-09-03T02:30:00Z' }, // 23:30 de 02/09 no Rio
    { conversa_id: 'b', direcao: 'out', tipo: 'sistema', autor_id: 'u1', criado_em: '2026-09-03T10:00:00Z' }, // nota, fora
  ];
  it('dia sem mensagem entra ZERADO e a mensagem da noite cai no dia BRT', () => {
    const s = montarSerie(msgs, { inicio: '2026-09-01', fim: '2026-09-04', gran: 'dia' });
    expect(s.map(b => b.chave)).toEqual(['2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04']);
    expect(s[0]).toEqual({ chave: '2026-09-01', recebidas: 1, enviadas: 1 });
    expect(s[1]).toEqual({ chave: '2026-09-02', recebidas: 1, enviadas: 0 });
    expect(s[2]).toEqual({ chave: '2026-09-03', recebidas: 0, enviadas: 0 });
  });
  it('em semana os baldes são segundas e o total se preserva', () => {
    const s = montarSerie(msgs, { inicio: '2026-08-31', fim: '2026-09-13', gran: 'semana' });
    expect(s.map(b => b.chave)).toEqual(['2026-08-31', '2026-09-07']);
    expect(s[0]).toEqual({ chave: '2026-08-31', recebidas: 2, enviadas: 1 });
  });
  it('sem janela devolve vazio; mensagem fora da janela é ignorada', () => {
    expect(montarSerie(msgs, {})).toEqual([]);
    const s = montarSerie(msgs, { inicio: '2026-09-02', fim: '2026-09-02', gran: 'dia' });
    expect(s).toEqual([{ chave: '2026-09-02', recebidas: 1, enviadas: 0 }]);
  });
});

describe('comunicacaoDashboard · por área', () => {
  it('agrupa pela área da conversa, sem área vira Entrada, e conta conversas distintas', () => {
    const convs = [{ id: 'a', area: 'Grupos' }, { id: 'b', area: null }, { id: 'c', area: 'Grupos' }];
    const msgs = [
      { conversa_id: 'a', direcao: 'in', tipo: 'text', criado_em: h(1) },
      { conversa_id: 'c', direcao: 'in', tipo: 'text', criado_em: h(1) },
      { conversa_id: 'c', direcao: 'out', tipo: 'bot', criado_em: h(1) },
      { conversa_id: 'b', direcao: 'in', tipo: 'text', criado_em: h(1) },
      { conversa_id: 'b', direcao: 'out', tipo: 'sistema', criado_em: h(1) },
    ];
    expect(agruparPorArea(msgs, convs)).toEqual([
      { area: 'Grupos', recebidas: 2, enviadas: 1, conversas: 2 },
      { area: ENTRADA, recebidas: 1, enviadas: 0, conversas: 1 },
    ]);
  });
});

describe('comunicacaoDashboard · "sem resposta" é ESPELHO do inbox', () => {
  const casos = [
    { resolvida: false, last_inbound_at: h(3), last_message_at: h(3) },
    { resolvida: false, last_inbound_at: h(3), last_message_at: h(1) },
    { resolvida: false, last_inbound_at: null, last_message_at: h(1) },
    { resolvida: true, last_inbound_at: h(3), last_message_at: h(3) },
    { resolvida: false, last_inbound_at: h(50), last_message_at: null },
    { resolvida: false, last_inbound_at: h(-2), last_message_at: h(-2) },
  ];
  it('servidor e cliente respondem igual em toda a tabela de casos', () => {
    for (const c of casos) {
      expect(semRespostaServidor(c), JSON.stringify(c)).toBe(semRespostaCliente(c as any));
      expect(horasServidor(c, AGORA), JSON.stringify(c)).toBe(horasCliente(c as any, AGORA));
      expect(vencidaServidor(horasServidor(c, AGORA))).toBe(vencidaCliente(horasCliente(c as any, AGORA)));
    }
  });
  it('resumo: abertas, esperando, vencidas, novas na janela, fila do mais antigo pro mais novo', () => {
    const convs = [
      { id: 'a', nome: 'Ana', telefone: '5521999990001', area: 'Grupos', resolvida: false, last_inbound_at: h(1), last_message_at: h(1), created_at: h(1) },
      { id: 'b', nome: null, telefone: '5521999990002', area: null, resolvida: false, last_inbound_at: h(60), last_message_at: h(60), created_at: h(500) },
      { id: 'c', nome: 'Caio', telefone: '5521999990003', area: 'Kids', resolvida: false, last_inbound_at: h(5), last_message_at: h(4), created_at: h(5) },
      { id: 'd', nome: 'Duda', telefone: '5521999990004', area: 'Kids', resolvida: true, last_inbound_at: h(70), last_message_at: h(70), created_at: h(70) },
      { id: 'e', nome: 'Eva', telefone: '5521999990005', area: null, resolvida: false, last_inbound_at: h(2), last_message_at: h(2), created_at: h(2), deleted_at: h(1) },
    ];
    const r = resumoConversas(convs, { agoraMs: AGORA, inicio: '2026-09-08', fim: '2026-09-09' });
    expect(r.abertas).toBe(3);
    expect(r.sem_resposta).toBe(2);
    expect(r.vencidas).toBe(1);
    expect(r.novas).toBe(2); // a (1h) e c (5h) nasceram na janela; b (500h) e d (70h = 06/09 BRT) ficam fora; e está apagada
    expect(r.lista.map(x => x.id)).toEqual(['b', 'a']);
    expect(r.lista[0]).toMatchObject({ area: ENTRADA, vencida: true, horas: 60 });
    expect(r.lista[1]).toMatchObject({ nome: 'Ana', area: 'Grupos', vencida: false, horas: 1 });
  });
});

describe('comunicacaoDashboard · tempo de resposta humana', () => {
  const convs = [{ id: 'a', area: 'Grupos' }, { id: 'b', area: null }];
  const T = (min: number) => new Date(Date.parse('2026-09-08T12:00:00Z') + min * 60_000).toISOString();
  it('conta da PRIMEIRA mensagem da pessoa até a resposta de GENTE; bot encerra a espera sem virar amostra', () => {
    const msgs = [
      { conversa_id: 'a', direcao: 'in', tipo: 'text', criado_em: T(0) },
      { conversa_id: 'a', direcao: 'in', tipo: 'text', criado_em: T(5) },      // 2ª mensagem: a espera segue de T(0)
      { conversa_id: 'a', direcao: 'out', tipo: 'text', autor_id: 'u1', criado_em: T(30) }, // humano → 30 min
      { conversa_id: 'a', direcao: 'in', tipo: 'text', criado_em: T(40) },
      { conversa_id: 'a', direcao: 'out', tipo: 'bot', autor_id: null, criado_em: T(41) },  // bot encerra, não conta
      { conversa_id: 'a', direcao: 'in', tipo: 'text', criado_em: T(100) },
      { conversa_id: 'a', direcao: 'out', tipo: 'sistema', autor_id: 'u1', criado_em: T(101) }, // nota: ignorada
      { conversa_id: 'a', direcao: 'out', tipo: 'text', autor_id: 'u2', criado_em: T(110) }, // humano → 10 min
      { conversa_id: 'b', direcao: 'out', tipo: 'text', autor_id: 'u1', criado_em: T(0) },   // saída sem espera: nada
      { conversa_id: 'b', direcao: 'in', tipo: 'text', criado_em: T(10) },                  // ainda esperando: nada
    ];
    const am = temposDeResposta(msgs, convs);
    expect(am.map(a => [a.autor_id, a.minutos, a.area])).toEqual([['u1', 30, 'Grupos'], ['u2', 10, 'Grupos']]);
    // empate no n ⇒ o mais RÁPIDO primeiro (mediana crescente)
    expect(agregarTempos(am, 'autor_id')).toEqual([
      { autor_id: 'u2', n: 1, mediana_min: 10, media_min: 10 },
      { autor_id: 'u1', n: 1, mediana_min: 30, media_min: 30 },
    ]);
    expect(agregarTempos(am, 'area')).toEqual([{ area: 'Grupos', n: 2, mediana_min: 20, media_min: 20 }]);
  });
  it('mediana resiste ao outlier (é ela que vai no card, não a média)', () => {
    expect(mediana([1, 2, 1000])).toBe(2);
    expect(mediana([1, 2, 3, 4])).toBe(2.5);
    expect(mediana([])).toBeNull();
  });
});

describe('comunicacaoDashboard · engajamento dos disparos', () => {
  const envios = [
    { tel8: '99990001', criado_em: '2026-09-01T12:00:00Z', contexto: 'grupos.pedido_novo_lider' },
    { tel8: '99990002', criado_em: '2026-09-01T12:00:00Z', contexto: 'grupos.frequencia' },
    { tel8: '99990003', criado_em: '2026-09-01T12:00:00Z', contexto: null },
    { telefone: '5521999990004', criado_em: '2026-09-01T12:00:00Z', contexto: 'membresia.censo' },
  ];
  const inbounds = [
    { tel8: '99990001', t: Date.parse('2026-09-02T12:00:00Z') },   // 1 dia depois → respondeu
    { tel8: '99990002', t: Date.parse('2026-09-01T11:00:00Z') },   // ANTES do envio → não conta
    { tel8: '99990003', t: Date.parse('2026-09-09T12:00:01Z') },   // 8 dias depois → fora da janela de 7
    { telefone: '21999990004', t: Date.parse('2026-09-03T12:00:00Z') }, // casa pelo sufixo → respondeu
  ];
  it('responde = mensagem da pessoa DEPOIS do envio e dentro da janela, casando pelo tel8', () => {
    const r = engajamentoDisparos(envios, inbounds, { janelaDias: 7 });
    expect(r).toMatchObject({ enviados: 4, respondidos: 2, taxa_pct: 50, janela_dias: 7 });
    expect(r.por_modulo).toEqual([
      { modulo: 'grupos', enviados: 2, respondidos: 1, taxa_pct: 50 },
      { modulo: 'sem_contexto', enviados: 1, respondidos: 0, taxa_pct: 0 },
      { modulo: 'membresia', enviados: 1, respondidos: 1, taxa_pct: 100 },
    ]);
  });
  it('sem envio, a taxa é null — nunca 0% com cara de "ninguém respondeu"', () => {
    expect(engajamentoDisparos([], inbounds).taxa_pct).toBeNull();
  });
});
