const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {
  PORTAS_INSCRICAO,
  portasSatelites,
  fontesUnificadas,
  catalogoPublico,
} = require('./inscricaoPortas');

const FONTES_ESPERADAS = [
  'inscricoes', 'eventos_externos', 'batismo',
  'apresentacao_criancas', 'apresentacao_bebes',
  'grupos', 'grupos_lider', 'next', 'next_legado', 'voluntariado',
];

assert.equal(PORTAS_INSCRICAO.length, 7, 'as 7 portas do contrato precisam estar registradas');
assert.deepEqual([...fontesUnificadas()].sort(), [...FONTES_ESPERADAS].sort(),
  'toda fonte da view unificada precisa ter uma porta dona');
assert.equal(new Set(PORTAS_INSCRICAO.map((p) => p.chave)).size, PORTAS_INSCRICAO.length,
  'chaves de porta não podem se repetir');
assert.equal(portasSatelites().length, 6, 'eventos nativos ficam nos cards de eventos; seis satélites ficam no inventário');

for (const porta of PORTAS_INSCRICAO) {
  assert.ok(porta.rotasPublicas.length, `${porta.chave}: rota pública obrigatória`);
  assert.ok(porta.fontes.length, `${porta.chave}: fonte da view obrigatória`);
  assert.equal(porta.contrato, 'inscricaoContrato', `${porta.chave}: contrato canônico obrigatório`);
}

// Teste de caracterização: protege as URLs/aliases públicos usados por links e
// QRs. A refatoração arquitetural não pode remover ou renomear nenhum deles.
const app = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'App.tsx'), 'utf8');
for (const rota of PORTAS_INSCRICAO.flatMap((p) => p.rotasPublicas)) {
  assert.ok(app.includes(`path="${rota}"`), `rota pública ausente do App.tsx: ${rota}`);
}

const catalogo = catalogoPublico();
assert.equal(catalogo.find((p) => p.chave === 'eventos').escritor, 'espinha_com_fallback_ext',
  'fallback do Eventos Externos é garantia de rollback e não pode sumir');

console.log('inscricaoPortas: 7 portas, 10 fontes e rotas/aliases protegidos');
