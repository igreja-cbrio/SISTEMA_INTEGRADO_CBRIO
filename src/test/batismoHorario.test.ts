import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

// CommonJS puro do backend (sem tipos) — mesmo padrão de `divisorMandala.test.ts`.
const require_ = createRequire(import.meta.url);
const { avaliarHorarioBatismo, horariosDisponiveis, normalizarHorario } =
  require_('../../backend/utils/batismoHorario.js');

const CONFIG = [
  { horario: '08:30', label: 'Domingo · 08:30 (1º culto da manhã)', aberto: true, limite: 11 },
  { horario: '10:00', label: 'Domingo · 10:00 (2º culto da manhã)', aberto: true, limite: 11 },
  { horario: '11:30', label: 'Domingo · 11:30 (3º culto da manhã)', aberto: false, limite: 11 },
  { horario: '19:00', label: 'Domingo · 19:00 (culto da noite)', aberto: false, limite: 11 },
];

describe('avaliarHorarioBatismo', () => {
  it('aceita horário aberto com vaga', () => {
    const r = avaliarHorarioBatismo('08:30', { configurados: CONFIG, ocupacao: { '08:30': 3 } });
    expect(r.ok).toBe(true);
    expect(r.horario).toBe('08:30');
  });

  // ⚠️ Ausência não é erro. Se este teste ficar vermelho porque alguém tornou o
  // horário obrigatório no servidor, o efeito real é trancar fora do batismo
  // todo bundle do app que ainda não aplicou o OTA (e o binário da loja).
  it('SEM horário passa — ausência não é erro', () => {
    for (const vazio of [null, undefined, '', '   ']) {
      const r = avaliarHorarioBatismo(vazio, { configurados: CONFIG, ocupacao: {} });
      expect(r.ok).toBe(true);
      expect(r.horario).toBeNull();
    }
  });

  it('recusa horário fechado', () => {
    const r = avaliarHorarioBatismo('11:30', { configurados: CONFIG, ocupacao: {} });
    expect(r.ok).toBe(false);
    expect(r.motivo).toBe('fechado');
  });

  it('recusa horário que não existe no catálogo', () => {
    const r = avaliarHorarioBatismo('23:59', { configurados: CONFIG, ocupacao: {} });
    expect(r.ok).toBe(false);
    expect(r.motivo).toBe('fechado');
  });

  it('recusa horário lotado (ocupação == limite)', () => {
    const r = avaliarHorarioBatismo('10:00', { configurados: CONFIG, ocupacao: { '10:00': 11 } });
    expect(r.ok).toBe(false);
    expect(r.motivo).toBe('lotado');
  });

  it('limite null = sem teto', () => {
    const semLimite = [{ horario: '08:30', aberto: true, limite: null }];
    const r = avaliarHorarioBatismo('08:30', { configurados: semLimite, ocupacao: { '08:30': 999 } });
    expect(r.ok).toBe(true);
  });

  // ⚠️⚠️ MUTANTE: trocar este `false` por `true` (ou voltar ao `if (!hErr)` do
  // público, que PULAVA a validação quando a consulta falhava) faz texto
  // arbitrário do cliente ser gravado em `horario_culto` — campo que alimenta o
  // {{2}} do template de lembrete enviado pelo número oficial da igreja.
  it('FALHA FECHADA: sem conseguir ler o catálogo, recusa', () => {
    const r = avaliarHorarioBatismo('08:30', { configurados: null, ocupacao: {} });
    expect(r.ok).toBe(false);
    expect(r.motivo).toBe('indisponivel');
  });

  it('trunca em 80 chars e não confia no tipo que veio', () => {
    expect(normalizarHorario('  10:00  ')).toBe('10:00');
    expect(normalizarHorario('x'.repeat(200))).toHaveLength(80);
    expect(normalizarHorario(null)).toBeNull();
  });

  it('toda recusa carrega mensagem pra pessoa ler', () => {
    for (const alvo of ['11:30', '23:59']) {
      const r = avaliarHorarioBatismo(alvo, { configurados: CONFIG, ocupacao: {} });
      expect(r.mensagem).toBeTruthy();
    }
    const lot = avaliarHorarioBatismo('10:00', { configurados: CONFIG, ocupacao: { '10:00': 11 } });
    expect(lot.mensagem).toBeTruthy();
  });
});

describe('horariosDisponiveis', () => {
  it('lista só os abertos, na ordem cadastrada', () => {
    const l = horariosDisponiveis(CONFIG, {});
    expect(l.map((h: { horario: string }) => h.horario)).toEqual(['08:30', '10:00']);
  });

  it('esconde o lotado', () => {
    const l = horariosDisponiveis(CONFIG, { '08:30': 11 });
    expect(l.map((h: { horario: string }) => h.horario)).toEqual(['10:00']);
  });

  it('cai no próprio horário quando não há label', () => {
    const l = horariosDisponiveis([{ horario: '08:30', aberto: true, limite: null }], {});
    expect(l[0].label).toBe('08:30');
  });

  it('entrada inválida devolve lista vazia, nunca explode', () => {
    expect(horariosDisponiveis(null as never, {})).toEqual([]);
    expect(horariosDisponiveis(undefined as never, {})).toEqual([]);
  });
});
