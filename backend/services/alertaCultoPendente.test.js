const assert = require('node:assert/strict');
const { cultoPendente } = require('./alertaCulto');

// ⚠️ O BUG QUE MOTIVOU ESTE TESTE (24/08/2026).
// O alerta de segunda ("N culto(s) sem dados lançados", que vai pro Marcelo)
// NUNCA rodou uma vez: `apurarCultosPendentes` selecionava `cultos.decisoes`,
// coluna que NÃO EXISTE (as reais são decisoes_presenciais/_online/_kids).
// PostgREST devolvia 42703, o serviço lançava, a rota respondia 500 — 4 falhas
// registradas em system_job_runs, ZERO sucessos, ZERO notificações
// `culto_sem_dados` na história do banco.
//
// O conserto trocou os NÚMEROS pelas FLAGS, que é a regra do Marcos já seguida
// pelo painel de Integração: lançar 0 conta como lançado, porque 0 é o DEFAULT
// da coluna e não distingue "ninguém tocou" de "veio zero de verdade".

const vazio = new Set();
const base = { id: 'c1', frequencia_lancada: false, decisoes_lancadas: false };

// ── Ninguém lançou nada = pendente ─────────────────────────────────────────
assert.equal(cultoPendente(base, vazio), true,
  'sem submissão e sem flag nenhuma, o culto é pendente');

// ── Qualquer flag marcada já tira da lista ─────────────────────────────────
assert.equal(cultoPendente({ ...base, frequencia_lancada: true }, vazio), false,
  'frequência lançada tira o culto da cobrança');
assert.equal(cultoPendente({ ...base, decisoes_lancadas: true }, vazio), false,
  'decisões lançadas tiram o culto da cobrança');

// ── Submissão de dados também conta como lançado ───────────────────────────
assert.equal(cultoPendente(base, new Set(['c1'])), false,
  'submissão em cultos_dados_submissoes tira o culto da cobrança');
assert.equal(cultoPendente(base, new Set(['outro'])), true,
  'submissão de OUTRO culto não tira este da cobrança');

// ⚠️⚠️ A REGRA DO MARCOS: lançar ZERO é lançar.
// Se o predicado voltar a olhar os números (`presencial_adulto > 0`), o culto
// que legitimamente teve 0 vira pendente PARA SEMPRE e o Marcelo é cobrado
// toda segunda por um dado que ele já lançou.
assert.equal(cultoPendente(
  { ...base, frequencia_lancada: true, presencial_adulto: 0, decisoes_presenciais: 0 }, vazio), false,
  'zero lançado com a flag marcada NÃO é pendente — não voltar a olhar os números');
