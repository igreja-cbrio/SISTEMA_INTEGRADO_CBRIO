// ⚠️⚠️ "DE ONDE SAI ESSE NÚMERO?" — a ficha de procedência de um KPI.
//
// Pedido do Matheus (23/09/2026), depois de a Renata encher de dúvidas sobre o
// ONL-17: *"ela perguntou desde quando esse kpi ta medindo, qual a periodicidade
// dele, de onde sai os dados que alimenta ele e etc."*
//
// ⚠️ A ficha NÃO pode inventar fonte. O catálogo foi EXTRAÍDO de
// `_kpi_agregar_dado` (as tabelas de cada ramo saíram do próprio SQL), não de
// memória. Dizer "vem da tabela X" sobre um número que vem de outro lugar é pior
// que não dizer nada: a pessoa para de perguntar e passa a confiar no errado.
import { describe, it, expect } from 'vitest';
import { montarProcedencia, CATALOGO } from '../../backend/utils/kpiProcedencia.js';

const ONL17 = {
  id: 'ONL-17', indicador: '% voluntarios escalados que fizeram check-in corretamente',
  area: 'online', periodicidade: 'mensal', tipo_calculo: 'soma_periodo',
  formula_config: { dado_tipo: 'voluntarios_checkin' }, meta_valor: '90',
};

describe('a ficha responde o que a Renata perguntou', () => {
  const f = montarProcedencia(ONL17, { primeiro_periodo: '2026-05', ultimo_periodo: '2026-09', total_periodos: 5 });

  it('"desde quando mede" = primeiro PERÍODO com valor', () => {
    expect(f.desde).toBe('2026-05');
    expect(f.periodos_medidos).toBe(5);
  });

  it('"qual a periodicidade"', () => {
    expect(f.periodicidade).toBe('mensal');
    expect(f.quando).toBe('todo mês');
  });

  it('"de onde saem os dados" — as tabelas REAIS do ramo', () => {
    expect(f.fonte).toContain('vol_schedules');
    expect(f.fonte).toContain('vol_check_ins');
  });

  it('⚠️ e a ressalva que explica o número baixo: mede REGISTRO, não presença', () => {
    expect(
      f.ressalva,
      'sem isto a área conclui que serve pouco, quando o que falta é o check-in',
    ).toMatch(/REGISTRO, não a presença/);
    expect(f.ressalva, 'o crédito vai para o mês do culto').toMatch(/mês do CULTO/);
  });
});

describe('⚠️⚠️ a ficha DIAGNOSTICA: automático sem implementação', () => {
  // Medido em 23/09: 22 KPIs ativos apontam para um `dado_tipo` que NÃO TEM
  // ramo no SQL. O ONL-18 mostra "0 · Crítico" não porque ninguém treina, mas
  // porque o cálculo não existe.
  const semImpl = montarProcedencia(
    { id: 'ONL-18', tipo_calculo: 'soma_periodo', periodicidade: 'mensal',
      formula_config: { dado_tipo: 'voluntarios_treinamento' } }, {},
  );

  it('marca quem é automático e aponta para um dado_tipo sem ramo', () => {
    expect(
      semImpl.sem_implementacao,
      'sem esta marca, "0 · Crítico" é lido como problema da área e não do sistema',
    ).toBe(true);
    expect(semImpl.fonte).toBeNull();
  });

  it('⚠️ mas MANUAL com dado_tipo sem ramo NÃO é defeito — espera preenchimento', () => {
    const manual = montarProcedencia(
      { id: 'ONL-22', tipo_calculo: 'manual', periodicidade: 'mensal',
        formula_config: { dado_tipo: 'doadores_count_declarado' } }, {},
    );
    expect(manual.sem_implementacao).toBe(false);
    expect(manual.automatico).toBe(false);
  });

  it('⚠️ e quem nunca mediu é DECLARADO, em vez de fingir um começo', () => {
    expect(semImpl.nunca_mediu).toBe(true);
    expect(semImpl.desde).toBeNull();
  });
});

describe('⚠️ a ficha não inventa o que não sabe', () => {
  it('dado_tipo desconhecido não ganha fonte', () => {
    const f = montarProcedencia(
      { id: 'X', tipo_calculo: 'manual', formula_config: { dado_tipo: 'inexistente_qualquer' } }, {},
    );
    expect(f.fonte).toBeNull();
    expect(f.conta).toBeNull();
  });

  it('KPI sem formula_config não quebra', () => {
    const f = montarProcedencia({ id: 'Y', tipo_calculo: 'manual', periodicidade: 'anual' }, {});
    expect(f.dado_tipo).toBeNull();
    expect(f.quando).toBe('uma vez por ano');
    expect(f.sem_implementacao).toBe(false);
  });

  it('entrada inválida devolve null em vez de estourar', () => {
    expect(montarProcedencia(null as never)).toBeNull();
    expect(montarProcedencia(undefined as never)).toBeNull();
  });
});

describe('⚠️ o catálogo descreve fonte E significado', () => {
  it('toda entrada tem `fonte` e `conta`', () => {
    for (const [k, v] of Object.entries(CATALOGO as Record<string, { fonte: string; conta: string }>)) {
      expect(v.fonte, `${k} sem fonte`).toBeTruthy();
      expect(v.conta, `${k} sem explicação do que conta`).toBeTruthy();
    }
  });
});
