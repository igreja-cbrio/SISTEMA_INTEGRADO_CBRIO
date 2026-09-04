// ============================================================================
// Testes da régua de pontualidade. `node backend/services/kpiPontualidade.test.js`
// (ou `npm run test:kpi-pontualidade`).
//
// Cada assert aqui existe por causa de um caso MEDIDO em produção em
// 04/09/2026 — não por simetria de suíte. O comentário diz qual.
// ============================================================================

const assert = require('node:assert/strict');
const {
  periodosFechados, idadeEmPeriodos, ehFuturo, atingiuMeta, classificar,
} = require('./kpiPontualidade');

// Sexta-feira, 04/09/2026 · semana ISO 36 · Q3 · S2
const HOJE = new Date('2026-09-04T12:00:00Z');

// ── Os rótulos de período seguem a convenção da casa (_kpi_periodo_corrente) ──
// ⚠️ O ERRO QUE MOTIVOU ESTE TESTE: a primeira medição do diagnóstico contou
// trimestral e semestral como 'YYYY-MM'. Os 27 KPIs dessas periodicidades
// apareceram com 0% de cobertura só porque o rótulo não casava com o que está
// gravado ('2026-Q3', '2026-S2'). Régua errada acusa gente inocente.
assert.deepEqual(periodosFechados('mensal', 3, HOJE), ['2026-08', '2026-07', '2026-06']);
assert.deepEqual(periodosFechados('semanal', 3, HOJE), ['2026-W35', '2026-W34', '2026-W33']);
assert.deepEqual(periodosFechados('trimestral', 3, HOJE), ['2026-Q2', '2026-Q1', '2025-Q4']);
assert.deepEqual(periodosFechados('semestral', 3, HOJE), ['2026-S1', '2025-S2', '2025-S1']);
assert.deepEqual(periodosFechados('anual', 2, HOJE), ['2025', '2024']);

// Periodicidade ausente cai em mensal (é o default do banco e do SQL).
assert.deepEqual(periodosFechados(null, 1, HOJE), ['2026-08']);

// ── O período CORRENTE nunca entra na lista de cobrança ──
// Cobrar o mês que ainda não fechou é o que faz o líder parar de olhar a tela.
assert.ok(!periodosFechados('mensal', 6, HOJE).includes('2026-09'),
  'setembro ainda não fechou em 04/09 — não pode ser cobrado');
assert.ok(!periodosFechados('semanal', 6, HOJE).includes('2026-W36'),
  'a semana corrente não pode ser cobrada');

// ── A armadilha do dia 31 (mesma do teste de periodosAlvo) ──
// `setUTCMonth(mes - 1)` num dia 31 normaliza para março e o mês anterior
// escaparia nos dias 29, 30 e 31 — justamente na virada, quando mais chega
// lançamento atrasado.
assert.deepEqual(periodosFechados('mensal', 3, new Date('2026-03-31T12:00:00Z')),
  ['2026-02', '2026-01', '2025-12'], 'dia 31 não pode pular o mês anterior');
assert.deepEqual(periodosFechados('mensal', 2, new Date('2026-03-30T12:00:00Z')),
  ['2026-02', '2026-01']);

// ── Viradas de ano ──
assert.deepEqual(periodosFechados('mensal', 2, new Date('2026-01-15T12:00:00Z')),
  ['2025-12', '2025-11']);
assert.deepEqual(periodosFechados('trimestral', 2, new Date('2026-01-15T12:00:00Z')),
  ['2025-Q4', '2025-Q3']);

// ── Idade em períodos ──
assert.equal(idadeEmPeriodos('2026-09', 'mensal', HOJE), 0, 'período corrente = idade 0');
assert.equal(idadeEmPeriodos('2026-08', 'mensal', HOJE), 1, 'último fechado = idade 1');
assert.equal(idadeEmPeriodos('2026-05', 'mensal', HOJE), 4, 'AMI-05: último dado de maio');
assert.equal(idadeEmPeriodos('2026-Q3', 'trimestral', HOJE), 0);
assert.equal(idadeEmPeriodos('2026-W29', 'semanal', HOJE), 7, 'os 5 KPIs de resposta positiva pararam na W29');
assert.equal(idadeEmPeriodos('lixo', 'mensal', HOJE), null, 'rótulo irreconhecível não vira idade 0');
assert.equal(idadeEmPeriodos(null, 'mensal', HOJE), null);

// ── Rótulo FUTURO ──
// ⚠️ Há 144 registros em produção com semana futura (2026-W37 a W52), todos
// valor=0, gravados por um backfill em 24/08. Sem reconhecer futuro, um deles
// seria lido como "o dado mais recente" e o KPI apareceria preenchido.
assert.equal(idadeEmPeriodos('2026-W37', 'semanal', HOJE), -1);
assert.ok(ehFuturo('2026-W52', 'semanal', HOJE), '2026-W52 é futuro em 04/09/2026');
assert.ok(!ehFuturo('2026-W35', 'semanal', HOJE));
assert.ok(!ehFuturo('2026-08', 'mensal', HOJE));

// ── Direção da meta (espelha public._kpi_atingiu) ──
assert.equal(atingiuMeta(75.7, 7, 'menor_melhor'), false, 'MKT-LEAD: 75,7 dias contra teto de 7 não atinge');
assert.equal(atingiuMeta(0, 10, 'menor_melhor'), true, 'RH-03: rotatividade zero contra teto de 10 atinge');
assert.equal(atingiuMeta(12, 10, 'maior_melhor'), true);
assert.equal(atingiuMeta(9, 10, 'maior_melhor'), false);
assert.equal(atingiuMeta(null, 10, 'maior_melhor'), null, 'sem valor não há juízo a fazer');
assert.equal(atingiuMeta(5, null, 'maior_melhor'), null, 'sem meta não há juízo a fazer');
assert.equal(atingiuMeta(5, 0, 'maior_melhor'), null, 'meta zero não divide nem julga');
assert.equal(atingiuMeta(12, 10, null), true, 'sentido ausente = maior_melhor (default do banco)');

const KPI_MENSAL = { id: 'X-01', periodicidade: 'mensal', sentido_meta: 'maior_melhor' };

// ── O CASO AMI-05: dado velho NÃO pode ser verde ──
// Era o furo central do farol: valor de maio acima da meta aparecia "no alvo"
// em setembro, e o líder que parou de preencher saía da fila de cobrança.
{
  const c = classificar({
    kpi: KPI_MENSAL, metaPeriodo: 10, hoje: HOJE,
    valoresPorPeriodo: { '2026-05': 999 },
  });
  assert.equal(c.pontualidade, 'atrasado');
  assert.equal(c.periodos_atraso, 3, 'nenhum dos 3 períodos da janela tem valor');
  assert.equal(c.desempenho, 'nao_julgavel', 'valor de maio não julga setembro, nem pra bem nem pra mal');
  assert.notEqual(c.desempenho, 'no_alvo');
  assert.equal(c.preenchidos, 0);
  assert.equal(c.cobertura_pct, 0);
}

// ── Em dia e acima da meta ──
{
  const c = classificar({
    kpi: KPI_MENSAL, metaPeriodo: 10, hoje: HOJE,
    valoresPorPeriodo: { '2026-08': 12, '2026-07': 11, '2026-06': 15 },
  });
  assert.equal(c.pontualidade, 'em_dia');
  assert.equal(c.periodos_atraso, 0);
  assert.equal(c.desempenho, 'no_alvo');
  assert.equal(c.cobertura_pct, 100);
  assert.equal(c.periodo_recente, '2026-08');
}

// ── Um período de atraso ainda é julgável (a banda de tolerância) ──
// Sem isso, todo KPI mensal ficaria "não julgável" nos primeiros dias do mês.
{
  const c = classificar({
    kpi: KPI_MENSAL, metaPeriodo: 10, hoje: HOJE,
    valoresPorPeriodo: { '2026-07': 12 },
  });
  assert.equal(c.periodos_atraso, 1);
  assert.equal(c.desempenho, 'no_alvo', 'atraso de 1 período ainda julga');
}

// ── ZERO é dado, não ausência (lei de 18/08: zero conta em período fechado) ──
{
  const c = classificar({
    kpi: KPI_MENSAL, metaPeriodo: 10, hoje: HOJE,
    valoresPorPeriodo: { '2026-08': 0 },
  });
  assert.equal(c.pontualidade, 'em_dia', 'zero preenchido é preenchimento');
  assert.equal(c.desempenho, 'abaixo', 'e zero contra meta 10 é desempenho ruim, não falta de dado');
  assert.notEqual(c.desempenho, 'sem_dado');
}

// ── Valor de período FUTURO não conta como preenchimento ──
// O caso dos 144 zeros de W37+: o KPI não está em dia por causa deles.
{
  const c = classificar({
    kpi: { id: 'BRG-02', periodicidade: 'semanal', sentido_meta: 'maior_melhor' },
    metaPeriodo: 10, hoje: HOJE,
    valoresPorPeriodo: { '2026-W37': 0, '2026-W52': 0 },
  });
  assert.notEqual(c.pontualidade, 'em_dia');
  assert.equal(c.preenchidos, 0);
  assert.equal(c.desempenho, 'sem_dado');
}

// ── Nunca preenchido × atrasado são estados DIFERENTES ──
// A view antiga chamava os dois de `sem_dado`, e por isso "quem parou de
// preencher" não era distinguível de "nunca começou".
{
  const nunca = classificar({ kpi: KPI_MENSAL, metaPeriodo: 10, hoje: HOJE, valoresPorPeriodo: {} });
  assert.equal(nunca.pontualidade, 'nunca');
  assert.equal(nunca.periodos_atraso, null);
  const parou = classificar({ kpi: KPI_MENSAL, metaPeriodo: 10, hoje: HOJE, valoresPorPeriodo: { '2026-01': 5 } });
  assert.equal(parou.pontualidade, 'atrasado');
  assert.notEqual(parou.pontualidade, nunca.pontualidade);
}

// ── Fonte: distingue "ninguém preenche" de "a fórmula roda e não acha dado" ──
// São 74 KPIs cujo último cálculo devolveu NULO. Cobrar o líder desses é
// cobrança errada: o problema é a fonte, não a disciplina dele.
{
  const nula = classificar({
    kpi: KPI_MENSAL, metaPeriodo: 10, hoje: HOJE,
    valoresPorPeriodo: {}, temLinhaCalculada: true, ultimoCalculoNulo: true,
  });
  assert.equal(nula.fonte, 'nula');
  const inexistente = classificar({
    kpi: KPI_MENSAL, metaPeriodo: 10, hoje: HOJE,
    valoresPorPeriodo: {}, temLinhaCalculada: false,
  });
  assert.equal(inexistente.fonte, 'inexistente');
  const viva = classificar({
    kpi: KPI_MENSAL, metaPeriodo: 10, hoje: HOJE,
    valoresPorPeriodo: { '2026-08': 3 }, temLinhaCalculada: true,
  });
  assert.equal(viva.fonte, 'viva');
}

// ── Crônico é histórico, não foto ──
// O card dizia "cronicamente críticos" mostrando quem está vermelho AGORA (o
// próprio comentário do código admitia). Crônico = os dois últimos períodos
// fechados abaixo da meta.
{
  const doisAbaixo = classificar({
    kpi: KPI_MENSAL, metaPeriodo: 10, hoje: HOJE,
    valoresPorPeriodo: { '2026-08': 2, '2026-07': 3 },
  });
  assert.equal(doisAbaixo.cronico, true);

  const umAbaixo = classificar({
    kpi: KPI_MENSAL, metaPeriodo: 10, hoje: HOJE,
    valoresPorPeriodo: { '2026-08': 2, '2026-07': 30 },
  });
  assert.equal(umAbaixo.cronico, false, 'um mês ruim depois de um bom não é crônico');

  const semHistorico = classificar({
    kpi: KPI_MENSAL, metaPeriodo: 10, hoje: HOJE,
    valoresPorPeriodo: { '2026-08': 2 },
  });
  assert.equal(semHistorico.cronico, false, 'sem o período anterior não se afirma crônico');

  // Teto (menor_melhor) também vira crônico pela direção certa.
  const tetoEstourado = classificar({
    kpi: { id: 'MKT-LEAD', periodicidade: 'semanal', sentido_meta: 'menor_melhor' },
    metaPeriodo: 7, hoje: HOJE,
    valoresPorPeriodo: { '2026-W35': 70, '2026-W34': 60 },
  });
  assert.equal(tetoEstourado.cronico, true, 'lead time acima do teto em 2 semanas seguidas é crônico');

  const tetoOk = classificar({
    kpi: { id: 'RH-03', periodicidade: 'mensal', sentido_meta: 'menor_melhor' },
    metaPeriodo: 10, hoje: HOJE,
    valoresPorPeriodo: { '2026-08': 0, '2026-07': 1 },
  });
  assert.equal(tetoOk.cronico, false, 'rotatividade zero contra teto 10 não é crônico');
  assert.equal(tetoOk.desempenho, 'no_alvo');
}

// ── Sem meta numérica não se inventa julgamento ──
// São 10 KPIs com meta só em texto (NEXT-05, DEV-01, ON-DS-01...). O painel de
// saúde dizia "0 sem meta" porque contava descrição como meta.
{
  const c = classificar({
    kpi: KPI_MENSAL, metaPeriodo: null, hoje: HOJE,
    valoresPorPeriodo: { '2026-08': 42 },
  });
  assert.equal(c.pontualidade, 'em_dia', 'sem meta ainda se cobra preenchimento');
  assert.equal(c.desempenho, 'sem_meta', 'mas não se afirma desempenho');
}

// ── Janela configurável (o /saude usa 3, um relatório trimestral pode usar 6) ──
{
  const c = classificar({
    kpi: KPI_MENSAL, metaPeriodo: 10, janela: 6, hoje: HOJE,
    valoresPorPeriodo: { '2026-08': 1, '2026-04': 1 },
  });
  assert.equal(c.slots, 6);
  assert.equal(c.preenchidos, 2);
  assert.equal(c.cobertura_pct, 33.3);
}

console.log('kpiPontualidade: todos os asserts passaram');
