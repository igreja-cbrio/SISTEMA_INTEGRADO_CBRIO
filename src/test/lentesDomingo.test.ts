// Régua PURA das lentes dos cultos de domingo (backend/utils/lentesDomingo.js ·
// docs/cultos-domingo/ · corte 24/08/2026). 'hoje' é INJETADO — nada aqui lê o
// relógio da máquina.
//
// Mutantes travados:
// 1. CONSOLIDAÇÃO soma POR SEMANA antes de qualquer média (média por culto e
//    depois soma = número errado — a pegadinha que o Pr. Juninho apontou).
// 2. OCUPAÇÃO usa cultos VIGENTES no domingo (vigente_de/ate + is_active): o
//    denominador cai de 4×1050 pra 3×1050 no corte SOZINHO. Ignorar vigência
//    (contar todos os tipos) fica vermelho.
// 3. CONTINUIDADE: 10:00 e 09:30 são UMA série que atravessa o corte.
import { describe, it, expect } from 'vitest';
import {
  montarLentes, tipoVigenteEm, chaveDaSerie, eixoDomingos, CORTE_DOMINGO_0930,
} from '../../backend/utils/lentesDomingo';

// Grade com o cenário do corte já completo (o tipo novo criado pelo script do
// Lote 5) — a régua tem que funcionar também ANTES, quando o 09:30 não existe.
const T0830 = { id: 'a', name: 'Domingo 08:30', recurrence_time: '08:30:00', color: '#0ea5e9', is_active: true, vigente_ate: '2026-08-23', consolidacao_key: 'domingo-0930' };
const T1000 = { id: 'b', name: 'Domingo 10:00', recurrence_time: '10:00:00', color: null, is_active: true, vigente_ate: '2026-08-23', linhagem_key: 'domingo-0930', consolidacao_key: 'domingo-0930' };
const T1130 = { id: 'c', name: 'Domingo 11:30', recurrence_time: '11:30:00', color: null, is_active: true };
const T1900 = { id: 'd', name: 'Domingo 19:00', recurrence_time: '19:00:00', color: null, is_active: true };
const T0930 = { id: 'e', name: 'Domingo 09:30', recurrence_time: '09:30:00', color: null, is_active: true, vigente_de: '2026-08-24', linhagem_key: 'domingo-0930', consolidacao_key: 'domingo-0930' };
const TIPOS = [T0830, T1000, T1130, T1900, T0930];

// 2 domingos ANTES do corte (16/08 = S33 · 23/08 = S34) e 1 DEPOIS (30/08 = S35)
const LINHAS = [
  // S33 (domingo 16/08)
  { ano_iso: 2026, semana_iso: 33, service_type_id: 'a', valor: 300 },
  { ano_iso: 2026, semana_iso: 33, service_type_id: 'b', valor: 500 },
  { ano_iso: 2026, semana_iso: 33, service_type_id: 'c', valor: 450 },
  { ano_iso: 2026, semana_iso: 33, service_type_id: 'd', valor: 400 },
  // S34 (domingo 23/08 · último no formato antigo)
  { ano_iso: 2026, semana_iso: 34, service_type_id: 'a', valor: 320 },
  { ano_iso: 2026, semana_iso: 34, service_type_id: 'b', valor: 480 },
  { ano_iso: 2026, semana_iso: 34, service_type_id: 'c', valor: 460 },
  { ano_iso: 2026, semana_iso: 34, service_type_id: 'd', valor: 410 },
  // S35 (domingo 30/08 · 1º no formato novo — sem 08:30/10:00)
  { ano_iso: 2026, semana_iso: 35, service_type_id: 'e', valor: 700 },
  { ano_iso: 2026, semana_iso: 35, service_type_id: 'c', valor: 520 },
  { ano_iso: 2026, semana_iso: 35, service_type_id: 'd', valor: 430 },
];

const montar = (hoje = '2026-09-02') =>
  montarLentes({ tipos: TIPOS, linhas: LINHAS, capacidadeUnitaria: 1050, hoje, nSemanas: 8 });

const ponto = (r: any, lente: string, label: string) =>
  r.lentes[lente].pontos.find((p: any) => p.label === label);

describe('lente SEPARADA · dado cru', () => {
  it('cada tipo é uma série própria (5 séries na grade completa)', () => {
    const r = montar();
    expect(r.lentes.separada.series).toHaveLength(5);
  });
  it('o 10:00 tem dado antes do corte e NADA depois; o 09:30 só depois', () => {
    const r = montar();
    expect(ponto(r, 'separada', '23/08')?.valores['tipo:b']).toBe(480);
    expect(ponto(r, 'separada', '30/08')?.valores['tipo:b']).toBeUndefined();
    expect(ponto(r, 'separada', '30/08')?.valores['tipo:e']).toBe(700);
    expect(ponto(r, 'separada', '23/08')?.valores['tipo:e']).toBeUndefined();
  });
});

describe('lente CONTINUIDADE · 10:00 → 09:30 é UMA série', () => {
  it('a mesma chave atravessa o corte (480 na S34, 700 na S35)', () => {
    const r = montar();
    expect(ponto(r, 'continuidade', '23/08')?.valores['linh:domingo-0930']).toBe(480);
    expect(ponto(r, 'continuidade', '30/08')?.valores['linh:domingo-0930']).toBe(700);
  });
  it('o rótulo conta a história na ordem da vigência', () => {
    const r = montar();
    const s = r.lentes.continuidade.series.find((x: any) => x.key === 'linh:domingo-0930');
    expect(s?.label).toBe('Domingo 10:00 → Domingo 09:30');
  });
  it('o 08:30 NÃO entra na linhagem (ele encerra, não vira 09:30)', () => {
    const r = montar();
    // 23/08: a série da linhagem é só o 10:00 (480) — sem somar o 08:30 (320)
    expect(ponto(r, 'continuidade', '23/08')?.valores['linh:domingo-0930']).toBe(480);
  });
});

describe('lente CONSOLIDAÇÃO · soma POR SEMANA antes de qualquer média', () => {
  it('08:30 + 10:00 somados por semana no passado · 09:30 sozinho depois', () => {
    const r = montar();
    expect(ponto(r, 'consolidacao', '16/08')?.valores['cons:domingo-0930']).toBe(800);  // 300+500
    expect(ponto(r, 'consolidacao', '23/08')?.valores['cons:domingo-0930']).toBe(800);  // 320+480
    expect(ponto(r, 'consolidacao', '30/08')?.valores['cons:domingo-0930']).toBe(700);
  });
  it('MUTANTE 1: a média da série é a média das SOMAS semanais', () => {
    const r = montar();
    // semanas com dado: 800, 800, 700 → média 767 (arredondada). Média por
    // culto e depois somada daria outro número — regressão fica vermelha aqui.
    expect(r.lentes.consolidacao.medias['cons:domingo-0930']).toBe(Math.round((800 + 800 + 700) / 3));
  });
  it('11:30 e 19:00 seguem como séries próprias em TODAS as lentes', () => {
    const r = montar();
    for (const lente of ['separada', 'continuidade', 'consolidacao']) {
      expect(ponto(r, lente, '30/08')?.valores['tipo:c']).toBe(520);
      expect(ponto(r, lente, '30/08')?.valores['tipo:d']).toBe(430);
    }
  });
});

describe('OCUPAÇÃO sobre lugares OFERECIDOS · a vigência manda no denominador', () => {
  it('antes do corte: 4 cultos vigentes × 1050 = 4200', () => {
    const r = montar();
    const s34 = r.ocupacao.find((o: any) => o.label === '23/08');
    expect(s34?.cultos_vigentes).toBe(4);           // 08:30, 10:00, 11:30, 19:00 (09:30 ainda não vige)
    expect(s34?.capacidade_total).toBe(4200);
    expect(s34?.freq_total).toBe(320 + 480 + 460 + 410);
    expect(s34?.taxa).toBe(Math.round(((320 + 480 + 460 + 410) / 4200) * 1000) / 10);
  });
  it('MUTANTE 2: depois do corte o denominador cai pra 3 × 1050 = 3150 SOZINHO', () => {
    const r = montar();
    const s35 = r.ocupacao.find((o: any) => o.label === '30/08');
    expect(s35?.cultos_vigentes).toBe(3);           // 09:30, 11:30, 19:00 (08:30/10:00 encerraram)
    expect(s35?.capacidade_total).toBe(3150);
    expect(s35?.taxa).toBe(Math.round(((700 + 520 + 430) / 3150) * 1000) / 10);
  });
  it('tipo com is_active=false NÃO conta como vigente', () => {
    expect(tipoVigenteEm({ ...T1130, is_active: false }, '2026-08-23')).toBe(false);
    expect(tipoVigenteEm(T1130, '2026-08-23')).toBe(true);
  });
  it('semana sem dado tem taxa null (não zero falso)', () => {
    const r = montar();
    const vazia = r.ocupacao.find((o: any) => o.freq_total == null);
    if (vazia) expect(vazia.taxa).toBeNull();
  });
});

describe('eixo e marcador do corte', () => {
  it('ANTES do corte o eixo se estende até o 1º domingo do formato novo (30/08)', () => {
    // hoje = 13/08 (pré-corte): a linha do corte precisa aparecer na prévia
    const eixo = eixoDomingos({ hoje: '2026-08-13', nSemanas: 8 });
    expect(eixo[eixo.length - 1].domingo).toBe('2026-08-30');
  });
  it('o marcador aponta o domingo 30/08', () => {
    const r = montar('2026-08-13');
    expect(r.corte.data).toBe(CORTE_DOMINGO_0930);
    expect(r.corte.domingo).toBe('2026-08-30');
    expect(r.corte.label).toBe('30/08');
  });
  it('grade SEM o tipo novo (estado de hoje, pré-Lote 5) não quebra nada', () => {
    const r = montarLentes({
      tipos: [T0830, T1000, T1130, T1900],
      linhas: LINHAS.filter((l) => l.service_type_id !== 'e'),
      capacidadeUnitaria: 1050, hoje: '2026-08-13', nSemanas: 8,
    });
    expect(r.lentes.separada.series).toHaveLength(4);
    expect(r.ocupacao.find((o: any) => o.label === '23/08')?.cultos_vigentes).toBe(4);
  });
  it('chaveDaSerie: sem chave própria o tipo é a própria série em toda lente', () => {
    expect(chaveDaSerie(T1130, 'continuidade')).toBe('tipo:c');
    expect(chaveDaSerie(T1000, 'continuidade')).toBe('linh:domingo-0930');
    expect(chaveDaSerie(T1000, 'consolidacao')).toBe('cons:domingo-0930');
    expect(chaveDaSerie(T1000, 'separada')).toBe('tipo:b');
  });
});
