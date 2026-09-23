// ⚠️⚠️ O PAINEL MOSTRAVA DADO VENCIDO COMO SE FOSSE DE HOJE.
//
// `vw_kpi_trajetoria_atual` montava o "valor atual" com
// `DISTINCT ON (kpi_id) ... ORDER BY periodo_referencia DESC` e **sem corte de
// idade**. KPI cuja coleta parasse continuava exibindo o último valor conhecido,
// e o farol julgava em cima dele.
//
// Medido em 23/09/2026, antes de mexer: de 110 KPIs com valor, **17 vencidos**:
//   · 11 "críticos" por falso alarme — SED-26, AMI-25, BRG-24, KIDS-23 e ONL-25
//     (o MESMO indicador em 5 áreas) congelados na W29 desde julho;
//   · 5 "no alvo" por FALSO CONFORTO, que é pior — **AMI-05 dizia "no alvo" com
//     dado de MAIO**.
// O caso que originou tudo: ONL-22 mostrando **-100% de julho** em setembro, e
// o -100 nem era queda (o "atual" caiu para 0 porque a coleta parou).
//
// ⚠️ Este teste lê a MIGRATION, não o banco: o portão não fala com o Postgres.
// Ele garante que a régua versionada continua contendo o corte — quem rodar as
// migrations do zero tem que receber a view consertada, não a original.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const DIR = join(__dirname, '..', '..', 'supabase/migrations');
const ARQ = readdirSync(DIR).find((f) => f.includes('kpi_nao_mostra_dado_vencido'));
const SQL = ARQ ? readFileSync(join(DIR, ARQ), 'utf8') : '';

describe('⚠️⚠️ a migration do corte de idade existe e está completa', () => {
  it('o arquivo existe', () => {
    expect(ARQ, 'a migration do corte sumiu de supabase/migrations').toBeTruthy();
  });

  it('⚠️ traz a VIEW inteira, não só a função', () => {
    expect(
      SQL,
      'sem a view, rodar as migrations do zero recria o bug — a função sozinha não corta nada',
    ).toMatch(/CREATE OR REPLACE VIEW vw_kpi_trajetoria_atual/);
    expect(SQL).toMatch(/CREATE OR REPLACE FUNCTION public\._kpi_periodo_minimo/);
  });
});

describe('⚠️⚠️ o corte de idade continua na régua', () => {
  it('marca como vencido o período mais antigo que o mínimo', () => {
    expect(SQL).toMatch(/periodo_bruto < _kpi_periodo_minimo\(b\.periodicidade\)\)\s*AS vencido/);
  });

  it('⚠️ e vencido ANULA o valor exibido — senão a tela continua mostrando o número velho', () => {
    expect(SQL).toMatch(/CASE WHEN vencido THEN NULL ELSE valor_bruto\s*END AS ultimo_valor/);
    expect(SQL).toMatch(/CASE WHEN vencido THEN NULL ELSE periodo_bruto END AS ultimo_periodo/);
  });

  it('⚠️ vencido cai em `sem_dado`, não em crítico nem em no_alvo', () => {
    expect(SQL).toMatch(/WHEN vencido OR valor_bruto IS NULL THEN 'sem_dado'/);
    expect(SQL).toMatch(/WHEN vencido OR valor_bruto IS NULL THEN 'pendente'/);
  });

  it('⚠️ o percentual da meta também é anulado — número sobre dado vencido engana igual', () => {
    expect(SQL).toMatch(/CASE WHEN vencido THEN NULL\s*\n?\s*ELSE _kpi_pct_meta/);
  });
});

describe('⚠️ a tolerância é de 1 período — nem zero, nem infinita', () => {
  it('mensal aceita o mês anterior', () => {
    expect(SQL).toMatch(/WHEN 'mensal'\s*THEN to_char\(current_date - interval '1 month'/);
  });

  it('trimestral aceita o trimestre anterior, semestral o semestre', () => {
    expect(SQL).toMatch(/interval '3 months'/);
    expect(SQL).toMatch(/interval '6 months'/);
  });

  it('⚠️ semanal aceita a semana passada — o corrente quase nunca fechou', () => {
    expect(
      SQL,
      'exigir o período CORRENTE apagaria todo mundo: ninguém preenche setembro no dia 1º',
    ).toMatch(/WHEN 'semanal'\s*THEN to_char\(current_date - interval '7 days'/);
  });
});

describe('⚠️⚠️ o valor vencido NÃO é jogado fora', () => {
  it('vira diagnóstico em `*_conhecido` + a bandeira `dado_vencido`', () => {
    expect(SQL).toMatch(/periodo_bruto AS ultimo_periodo_conhecido/);
    expect(SQL).toMatch(/valor_bruto\s+AS ultimo_valor_conhecido/);
    expect(
      SQL,
      'é o que deixa a tela dizer "a coleta parou em julho" em vez de só "sem dado"',
    ).toMatch(/vencido\s+AS dado_vencido/);
  });

  it('⚠️ as colunas novas ficam NO FIM (CREATE OR REPLACE VIEW recusa no meio · 42P16)', () => {
    // ⚠️⚠️ Ancorar no ARQUIVO INTEIRO dava falso-vermelho DUAS vezes: o cabeçalho
    // cita `ultimo_periodo_conhecido` em comentário (posição 1817) e o CTE `base`
    // tem `k.sentido_meta`. A comparação de posição só faz sentido dentro do
    // SELECT final — é a mesma armadilha de âncora que já mordeu neste repo.
    const corpo = SQL.slice(SQL.indexOf('CREATE OR REPLACE VIEW'));
    const iSentido = corpo.lastIndexOf('sentido_meta,');
    const iNovas = corpo.indexOf('periodo_bruto AS ultimo_periodo_conhecido');
    expect(iSentido, 'sentido_meta sumiu do SELECT final').toBeGreaterThan(0);
    expect(iNovas, 'a coluna de diagnóstico sumiu do SELECT final').toBeGreaterThan(0);
    expect(iNovas).toBeGreaterThan(iSentido);
  });
});
