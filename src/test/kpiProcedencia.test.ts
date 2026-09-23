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

// ⚠️ Os rótulos da tabela mês a mês vivem no catálogo, colados na fonte — não
// na tela. Rótulo longe da definição envelhece sozinho: a fonte muda e a coluna
// continua dizendo "escalas" sobre outra coisa.
describe('rótulos da tabela mês a mês', () => {
  it('o ramo que sabe abrir o número em partes traz os rótulos', () => {
    expect(montarProcedencia(ONL17, {}).rotulo_partes)
      .toEqual({ denominador: 'escalas', numerador: 'com check-in' });
  });

  it('ramo sem partes não inventa rótulo', () => {
    const f = montarProcedencia(
      { ...ONL17, id: 'X-1', formula_config: { dado_tipo: 'batismos' } }, {});
    expect(f.rotulo_partes).toBeNull();
  });
});

// ⚠️⚠️ O SEGUNDO MOTOR — `fonte_auto`, e o erro que a ficha cometia.
//
// Há DOIS motores de cálculo e o `tipo_calculo` só conhece um. Um KPI pode ter
// `tipo_calculo = 'manual'` E `fonte_auto` preenchido — e aí ele É calculado,
// pelo collector JS. Medido em 23/09/2026: **49 KPIs ativos** nessa situação, e
// a ficha dizia "preenchido à mão — o sistema não calcula" sobre todos eles.
// Foi assim que o ONL-11 apareceu como manual sendo alimentado desde 2022.
describe('⚠️⚠️ KPI com fonte_auto é calculado, mesmo marcado como manual', () => {
  const ONL11 = {
    id: 'ONL-11', indicador: '% crescimento da frequência em relação a semana anterior',
    area: 'online', periodicidade: 'semanal', tipo_calculo: 'manual',
    fonte_auto: 'cultos.online_ds_cresc',
    formula_config: { dado_tipo: 'frequencia_online_ds' }, meta_valor: '30',
  };

  it('não chama de manual o que a rotina calcula', () => {
    expect(montarProcedencia(ONL11, {}).automatico).toBe(true);
  });

  it('descreve a fonte do COLLECTOR, não o ramo SQL do dado_tipo', () => {
    const f = montarProcedencia(ONL11, {});
    expect(f.fonte).toContain('online_ds');
    expect(f.conta).toContain('semana anterior');
  });

  // ⚠️ O collector VENCE o `dado_tipo`: quando os dois existem, quem escreve o
  // valor é o motor JS. Descrever o ramo SQL apontaria para uma conta que não
  // produziu o número.
  it('o collector vence o dado_tipo quando os dois existem', () => {
    const f = montarProcedencia({ ...ONL11, formula_config: { dado_tipo: 'voluntarios_checkin' } }, {});
    expect(f.fonte).toContain('online_ds');
    expect(f.fonte).not.toContain('vol_schedules');
  });

  // ⚠️ Sem catálogo do collector, diz o que sabe — que roda sozinho, e o nome
  // da rotina. Não inventa tabela de origem.
  it('collector sem catálogo é honesto, não inventa tabela', () => {
    const f = montarProcedencia({ ...ONL11, fonte_auto: 'next.alguma_rotina' }, {});
    expect(f.automatico).toBe(true);
    expect(f.conta_generica).toBe(true);
    expect(f.fonte).toContain('next.alguma_rotina');
  });

  // ⚠️ O alarme "não está sendo calculado" só vale para o motor SQL sem ramo.
  // Com collector existe cálculo por definição — alarme ali seria falso.
  it('não acusa "sem cálculo" quando há collector', () => {
    expect(montarProcedencia({ ...ONL11, fonte_auto: 'next.alguma_rotina' }, {}).sem_implementacao).toBe(false);
  });

  // ⚠️⚠️ O CASO QUE UM MUTANTE SOBREVIVENTE REVELOU: `tipo_calculo` automático
  // E `fonte_auto` preenchido ao mesmo tempo. Sem a guarda `!fonteAuto`, a
  // ficha acusaria "não está sendo calculado" num KPI que o collector alimenta.
  // Medido em 23/09/2026: **6 KPIs ativos** nessa combinação, todos com
  // `dado_tipo` preenchido — ou seja, o alarme falso aconteceria de verdade.
  it('collector + tipo_calculo automático não dispara alarme falso', () => {
    const f = montarProcedencia({
      id: 'X-2', tipo_calculo: 'soma_periodo', fonte_auto: 'next.alguma_rotina',
      periodicidade: 'mensal', formula_config: { dado_tipo: 'dado_que_nao_tem_ramo' },
    }, {});
    expect(f.sem_implementacao).toBe(false);
    expect(f.automatico).toBe(true);
  });

  it('o alarme do motor SQL continua valendo', () => {
    const f = montarProcedencia({
      id: 'ONL-18', tipo_calculo: 'soma_periodo', fonte_auto: null,
      periodicidade: 'mensal', formula_config: { dado_tipo: 'voluntarios_treinamento' },
    }, {});
    expect(f.sem_implementacao).toBe(true);
  });

  it('a ressalva do DS explica por que a semana em curso fica vazia', () => {
    expect(montarProcedencia(ONL11, {}).ressalva).toContain('SEM DADO');
  });
});

// ⚠️⚠️ A META DA FICHA TEM QUE SER A QUE O FAROL USA.
//
// `meta_valor` é a meta NOMINAL; quem pinta o card é `meta_efetiva` da
// `vw_kpi_trajetoria_atual`, dividida em `meta_periodo`. Medido em 23/09/2026
// no ONL-11: nominal **30**, efetiva **106.022** no ano → **2.038,88 por
// semana**, e o valor 1.032 é 50,6% dela. "Meta 30" ao lado de um card vermelho
// com 1.032 faz o indicador parecer quebrado quando quem erra é a ficha.
// Medido: **10 de 167** KPIs ativos nessa divergência.
describe('⚠️⚠️ meta nominal × meta efetiva', () => {
  const BASE = {
    id: 'ONL-11', tipo_calculo: 'manual', fonte_auto: 'cultos.online_ds_cresc',
    periodicidade: 'semanal', meta_valor: '30', formula_config: {},
  };

  it('avisa quando a meta do farol não é a cadastrada', () => {
    const f = montarProcedencia(BASE, {}, { meta_efetiva: '106022', meta_periodo: '2038.88' });
    expect(f.meta_divergente).toBe(true);
    expect(f.meta_efetiva).toBe(106022);
    expect(f.meta_periodo).toBe(2038.88);
    expect(f.meta).toBe('30');
  });

  it('não avisa quando as duas batem', () => {
    const f = montarProcedencia(BASE, {}, { meta_efetiva: '30', meta_periodo: '30' });
    expect(f.meta_divergente).toBe(false);
  });

  it('sem trajetória, a ficha ainda mostra a meta cadastrada', () => {
    const f = montarProcedencia(BASE, {});
    expect(f.meta).toBe('30');
    expect(f.meta_divergente).toBe(false);
    expect(f.meta_efetiva).toBeNull();
  });

  // ⚠️ '30' (texto) e 30 (número) são a MESMA meta. Comparar sem converter
  // marcaria divergência em todos os 167 KPIs e o aviso viraria ruído.
  it('texto e número não contam como divergência', () => {
    expect(montarProcedencia(BASE, {}, { meta_efetiva: 30, meta_periodo: 30 }).meta_divergente).toBe(false);
  });
});
