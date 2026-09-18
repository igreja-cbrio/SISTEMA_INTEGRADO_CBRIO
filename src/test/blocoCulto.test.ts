// Régua PURA do BLOCO de celebrações (backend/utils/blocoCulto.js · 03/09/2026).
// O bloco é o conjunto de celebrações do dia que rodam a MESMA liturgia — o
// domingo de manhã é um bloco com DUAS (09:30 e 11:30). É o que permite
// template/ordem de culto únicos por bloco e escala por celebração nos times
// `split_por_horario`.
//
// Mutantes travados:
// 1. IGNORAR VIGÊNCIA traz o 08:30 e o 10:00 (encerrados em 23/08) de volta ao
//    bloco da manhã — o alvo seria materializado pra celebração que não
//    acontece mais e a cobertura pediria gente pra culto inexistente.
// 2. USAR `consolidacao_key` NO LUGAR DE `bloco_servico` — as duas são SÉRIE
//    TEMPORAL, não simultaneidade. `consolidacao_key` do 09:30 agrupa os
//    horários EXTINTOS: a manhã "teria" três celebrações, duas mortas.
// 3. TIPO SEM BLOCO devolvendo vazio em vez de [ele mesmo] — quarta/AMI/Bridge
//    perderiam o próprio culto e nunca materializariam alvo.
// 4. TIPO NÃO-VIGENTE devolvendo o bloco — aplicar template a culto de tipo
//    encerrado voltaria a escalar gente.
import { describe, it, expect } from 'vitest';
import { tiposDoBloco, cultosDoBloco, blocoTemHorarios } from '../../backend/utils/blocoCulto';

// A grade real medida em produção em 03/09/2026.
const T0830 = { id: 't0830', name: 'Domingo 08:30', bloco_servico: 'dom_manha', consolidacao_key: 'domingo-0930', is_active: false, vigente_ate: '2026-08-23' };
const T1000 = { id: 't1000', name: 'Domingo 10:00', bloco_servico: 'dom_manha', consolidacao_key: 'domingo-0930', is_active: false, vigente_ate: '2026-08-23' };
const T0930 = { id: 't0930', name: 'Domingo 09:30', bloco_servico: 'dom_manha', consolidacao_key: 'domingo-0930', is_active: true, vigente_de: '2026-08-24' };
const T1130 = { id: 't1130', name: 'Domingo 11:30', bloco_servico: 'dom_manha', is_active: true };
const T1900 = { id: 't1900', name: 'Domingo 19:00', bloco_servico: null, is_active: true };
const TQUARTA = { id: 'tqua', name: 'Quarta Com Deus', bloco_servico: null, is_active: true };
const TIPOS = [T0830, T1000, T0930, T1130, T1900, TQUARTA];

const DIA = '2026-09-06'; // domingo, depois do corte de 24/08
const CULTOS = [
  { id: 'c0930', data: DIA, hora: '09:30', service_type_id: 't0930' },
  { id: 'c1130', data: DIA, hora: '11:30', service_type_id: 't1130' },
  { id: 'c1900', data: DIA, hora: '19:00', service_type_id: 't1900' },
  { id: 'c0930ant', data: '2026-08-16', hora: '08:30', service_type_id: 't0830' },
];

describe('tiposDoBloco', () => {
  it('a manhã de hoje são DUAS celebrações: 09:30 e 11:30', () => {
    const r = tiposDoBloco(T0930, TIPOS, DIA).map((t) => t.id).sort();
    expect(r).toEqual(['t0930', 't1130']);
  });

  it('⚠️ vigência exclui o 08:30 e o 10:00, que encerraram em 23/08', () => {
    const r = tiposDoBloco(T0930, TIPOS, DIA).map((t) => t.id);
    expect(r).not.toContain('t0830');
    expect(r).not.toContain('t1000');
  });

  // ⚠️⚠️ LIMITAÇÃO MEDIDA, não contornada: `tipoVigenteEm` (reusada de
  // `lentesDomingo`) reprova `is_active === false` INDEPENDENTE da data — ela
  // mistura a bandeira de hoje com a janela histórica. Logo, bloco de data
  // PASSADA com tipo já extinto não é reconstruível.
  // Para o produtor isso é indiferente: template só se aplica a culto FUTURO. E
  // mudar a régua quebraria a lente do domingo, que tem consumidor vivo.
  it('⚠️ bloco de data passada com tipo EXTINTO não é reconstruível', () => {
    expect(tiposDoBloco(T0830, TIPOS, '2026-08-16')).toEqual([]);
  });

  it('mas um tipo que SEGUE ativo resolve o bloco na data antiga (sem os extintos)', () => {
    const r = tiposDoBloco(T1130, TIPOS, '2026-08-16').map((t) => t.id);
    expect(r).toEqual(['t1130']);
  });

  it('tipo SEM bloco é o próprio bloco (quarta, AMI, Bridge, domingo à noite)', () => {
    expect(tiposDoBloco(TQUARTA, TIPOS, '2026-09-09').map((t) => t.id)).toEqual(['tqua']);
    expect(tiposDoBloco(T1900, TIPOS, DIA).map((t) => t.id)).toEqual(['t1900']);
  });

  it('tipo NÃO-VIGENTE no dia devolve vazio', () => {
    expect(tiposDoBloco(T0830, TIPOS, DIA)).toEqual([]);
  });

  it('entrada ausente devolve vazio, nunca explode', () => {
    expect(tiposDoBloco(null, TIPOS, DIA)).toEqual([]);
    expect(tiposDoBloco(T0930, TIPOS, '')).toEqual([]);
    // `tipos` ausente: o tipo tem bloco, então sem a grade não há como saber
    // quem mais está nele ⇒ vazio, e quem chama cai no alvo de bloco.
    expect(tiposDoBloco(T0930, null as any, DIA)).toEqual([]);
  });
});

describe('cultosDoBloco', () => {
  it('devolve as duas celebrações da manhã, ORDENADAS por hora', () => {
    const r = cultosDoBloco({ tipo: T0930, tipos: TIPOS, cultos: CULTOS, diaISO: DIA });
    expect(r.map((c) => c.id)).toEqual(['c0930', 'c1130']);
  });

  it('não mistura o culto da NOITE na manhã', () => {
    const r = cultosDoBloco({ tipo: T0930, tipos: TIPOS, cultos: CULTOS, diaISO: DIA });
    expect(r.map((c) => c.id)).not.toContain('c1900');
  });

  it('não pega culto de OUTRO dia', () => {
    const r = cultosDoBloco({ tipo: T0930, tipos: TIPOS, cultos: CULTOS, diaISO: DIA });
    expect(r.map((c) => c.id)).not.toContain('c0930ant');
  });

  it('sem culto no dia devolve vazio (⇒ quem chama materializa no bloco)', () => {
    const r = cultosDoBloco({ tipo: T0930, tipos: TIPOS, cultos: [], diaISO: DIA });
    expect(r).toEqual([]);
  });

  it('não muta o array recebido', () => {
    const orig = CULTOS.map((c) => c.id);
    cultosDoBloco({ tipo: T0930, tipos: TIPOS, cultos: CULTOS, diaISO: DIA });
    expect(CULTOS.map((c) => c.id)).toEqual(orig);
  });
});

describe('blocoTemHorarios', () => {
  it('a manhã tem horários; a noite e a quarta não', () => {
    expect(blocoTemHorarios({ tipo: T0930, tipos: TIPOS, cultos: CULTOS, diaISO: DIA })).toBe(true);
    expect(blocoTemHorarios({ tipo: T1900, tipos: TIPOS, cultos: CULTOS, diaISO: DIA })).toBe(false);
    expect(blocoTemHorarios({ tipo: TQUARTA, tipos: TIPOS, cultos: CULTOS, diaISO: DIA })).toBe(false);
  });

  it('⚠️ UMA celebração não é bloco de horários — o NULL diz a mesma coisa', () => {
    const soUm = [{ id: 'c0930', data: DIA, hora: '09:30', service_type_id: 't0930' }];
    expect(blocoTemHorarios({ tipo: T0930, tipos: TIPOS, cultos: soUm, diaISO: DIA })).toBe(false);
  });
});
