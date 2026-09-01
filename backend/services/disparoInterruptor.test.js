const assert = require('node:assert/strict');
const { IDS_CATALOGO, CATALOGO } = require('./comunicacaoAutomaticas');
const { DISPARO_ID: ESCALA_ID } = require('./escalaAviso');

// ⚠️ O QUE ESTE TESTE PROTEGE (24/08/2026).
// O interruptor de um disparo só funciona se TRÊS coisas concordarem no mesmo
// id: o remetente (que chama `disparoDesligado(ID)`), o catálogo (que a tela
// lista) e a validação do PATCH (que usa `IDS_CATALOGO`). Se o remetente
// checar um id que não está no catálogo, o switch NUNCA aparece e o disparo é
// inhibível apenas por env — e se o catálogo tiver um id que remetente nenhum
// checa, a tela mostra um switch que NÃO DESLIGA NADA.
//
// O segundo caso não é hipotético: `wa_templates.ativo` existe, é editável na
// tela de Comunicação e NENHUMA query do sistema lê essa coluna. É um
// interruptor de mentira, e foi o caminho que o Matheus quase usou pra desligar
// o lembrete de escala. Este teste existe pra não criarmos o terceiro.

// ── O id que o remetente da escala checa TEM que existir no catálogo ────────
assert.ok(IDS_CATALOGO.includes(ESCALA_ID),
  `escalaAviso.DISPARO_ID ("${ESCALA_ID}") não está no catálogo (${IDS_CATALOGO.join(', ')}) — o switch não apareceria na tela`);

// ── Ids únicos: dois itens com o mesmo id fazem o PATCH desligar o errado ───
assert.equal(new Set(IDS_CATALOGO).size, IDS_CATALOGO.length,
  'id duplicado no catálogo de disparos automáticos');

// ── Todo item do catálogo precisa do mínimo pra tela não mentir ─────────────
for (const item of CATALOGO) {
  assert.ok(item.id && typeof item.id === 'string', 'item sem id');
  assert.ok(item.nome, `item ${item.id} sem nome`);
  assert.ok(item.fonte, `item ${item.id} sem \`fonte\` — a tela precisa apontar quem dispara de verdade`);
  assert.equal(typeof item.publico, 'function', `item ${item.id} sem resolver de público`);
}

// ── A entrada da escala aponta pro contexto REAL da fila ───────────────────
// Sem isso o histórico ("enviados 30d") do item viria vazio e a tela sugeriria
// um disparo morto — foi assim que o devocional passou 187 dias falhando.
const { CONTEXTO } = require('./escalaAviso');
const itemEscala = CATALOGO.find(i => i.id === ESCALA_ID);
assert.equal(itemEscala.contexto, CONTEXTO,
  `o contexto do catálogo ("${itemEscala.contexto}") tem que ser o mesmo que o remetente grava na fila ("${CONTEXTO}")`);

// ── O remetente do TOTEM (novo convertido · 01/09) · checagem por TEXTO ─────
// routes/membresia.js carrega o Express/Supabase inteiros, então a conferência
// é ESTÁTICA — com o comentário removido dos DOIS lados (armadilha de 06/08:
// a própria documentação do conserto cita o padrão e derrubaria o portão), e
// `[^\n]*` em vez de `.*$` (em checkout Windows a linha termina em \r, que o
// `.` do JS não casa — falso-vermelho do test:matcher-insert, 17/08).
const fs = require('node:fs');
const path = require('node:path');
const semComentarios = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n')
  .map((l) => l.replace(/(^|[^:"'`])\/\/[^\n]*$/, '$1'))
  .join('\n');

const TOTEM_ID = 'convertido_boas_vindas';
const membresiaSrc = semComentarios(
  fs.readFileSync(path.join(__dirname, '..', 'routes', 'membresia.js'), 'utf8'),
);

assert.ok(membresiaSrc.includes(`disparoDesligado('${TOTEM_ID}')`),
  `o remetente do totem (routes/membresia.js) não consulta disparoDesligado('${TOTEM_ID}') — o switch da tela não desligaria nada (o wa_templates.ativo de novo)`);

assert.ok(IDS_CATALOGO.includes(TOTEM_ID),
  `"${TOTEM_ID}" não está no catálogo (${IDS_CATALOGO.join(', ')}) — o switch não apareceria na tela`);

const itemTotem = CATALOGO.find((i) => i.id === TOTEM_ID);
assert.ok(membresiaSrc.includes(`contexto: '${itemTotem.contexto}'`),
  `o contexto do catálogo ("${itemTotem.contexto}") tem que ser o que o remetente grava na fila — sem isso o histórico do item vem vazio`);

console.log('disparoInterruptor: OK');
