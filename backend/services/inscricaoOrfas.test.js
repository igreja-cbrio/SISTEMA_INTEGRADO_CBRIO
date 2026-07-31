// Contrato da fila de inscrição órfã (services/inscricaoOrfas.js).
// Determinístico: sem banco, sem rede, sem depender da hora (lição do
// faixaEtaria.test.ts, que falhava depois das 21h BRT).
const assert = require('assert');
const {
  chavePessoa, PORTA_VINCULO, agruparPorPessoa, ordemAncora,
} = require('./inscricaoOrfas');
const { fontesUnificadas } = require('./inscricaoPortas');

// ── 1. A GUARDA que importa: toda porta da view tem onde guardar o ponteiro ──
// Fonte nova na view sem entrada aqui = pendência que o clique não consegue
// ligar (o humano decide e nada acontece). Falhar aqui é o objetivo.
const fontes = [...fontesUnificadas()].sort();
assert.deepEqual(Object.keys(PORTA_VINCULO).sort(), fontes,
  'toda fonte da vw_inscricoes_unificadas precisa de ponteiro em PORTA_VINCULO (e vice-versa)');
for (const [porta, map] of Object.entries(PORTA_VINCULO)) {
  assert.ok(map.tabela && map.col, `${porta}: tabela e coluna obrigatórias`);
}
// A apresentação é o caso que quebra a suposição "sempre membro_id": a criança
// não é a pessoa do vínculo.
assert.equal(PORTA_VINCULO.apresentacao_criancas.col, 'responsavel_membro_id');
assert.equal(PORTA_VINCULO.apresentacao_bebes.col, 'responsavel_membro_id');

// ── 2. Ordem de força da evidência ──────────────────────────────────────────
const comTudo = { ref_id: 'r1', cpf_norm: '12345678901', telefone_norm: '21999998888', nome_display: 'Ana Silva' };
assert.equal(chavePessoa(comTudo), 'cpf:12345678901', 'CPF manda quando existe');
assert.equal(chavePessoa({ ...comTudo, cpf_norm: '123' }), 'tel:21999998888',
  'CPF incompleto NÃO identifica — cai pro telefone');
assert.equal(chavePessoa({ ref_id: 'r2', telefone_norm: '2199', nome_display: 'Ana Silva' }), 'nome:ana silva',
  'telefone curto não serve de chave');
assert.equal(chavePessoa({ ref_id: 'r3' }), 'ref:r3',
  'sem chave nenhuma cada linha fica sozinha (não agrupa por vazio)');

// CPF/telefone com máscara dão a MESMA chave que sem máscara — senão a mesma
// pessoa viraria duas pendências.
assert.equal(chavePessoa({ ref_id: 'r4', cpf_norm: '123.456.789-01' }), 'cpf:12345678901');
assert.equal(chavePessoa({ ref_id: 'r5', telefone_norm: '(21) 99999-8888' }), 'tel:21999998888');

// Nome: acento, caixa e espaço duplo não separam a pessoa.
assert.equal(chavePessoa({ ref_id: 'a', nome_display: 'ANTÔNIO  MARCO' }),
  chavePessoa({ ref_id: 'b', nome_display: 'antonio marco' }),
  'nome normaliza acento/caixa/espaço (mesma régua da busca de grupos)');

// ── 3. Agrupamento por pessoa + âncora ──────────────────────────────────────
const linhas = [
  { porta: 'next', ref_id: 'n1', telefone_norm: '21988887777', nome_display: 'Bia Souza', criado_em: '2026-03-01T12:00:00Z' },
  { porta: 'inscricoes', ref_id: 'i1', telefone_norm: '21988887777', nome_display: 'Bia Souza', cpf_norm: '98765432100', criado_em: '2026-01-01T12:00:00Z' },
  { porta: 'batismo', ref_id: 'b1', telefone_norm: '21977776666', nome_display: 'Caio Lima', criado_em: '2026-02-01T12:00:00Z' },
];
const grupos = agruparPorPessoa(linhas);
// A linha com CPF tem chave `cpf:` e a sem CPF tem `tel:` — são chaves
// diferentes de propósito: agrupar por telefone quem tem CPF conhecido
// misturaria família. A fila apresenta as duas e o humano decide.
assert.equal(grupos.size, 3, 'chaves distintas não se fundem sozinhas');
assert.deepEqual([...grupos.keys()].sort(),
  ['cpf:98765432100', 'tel:21977776666', 'tel:21988887777'].sort());

const mesmaPessoa = [
  { porta: 'next', ref_id: 'n2', telefone_norm: '21955554444', nome_display: 'Duda', criado_em: '2026-01-01T12:00:00Z' },
  { porta: 'voluntariado', ref_id: 'v2', telefone_norm: '21955554444', nome_display: 'Duda Alves', criado_em: '2026-05-01T12:00:00Z' },
];
const g2 = agruparPorPessoa(mesmaPessoa);
assert.equal(g2.size, 1, 'mesmo telefone sem CPF = uma decisão');
assert.equal(g2.get('tel:21955554444').length, 2, 'as DUAS linhas ficam na mesma pendência');
assert.equal(g2.get('tel:21955554444')[0].ref_id, 'v2', 'âncora = a mais recente quando ninguém tem CPF');

// Âncora prefere quem tem CPF, mesmo sendo mais antiga (é a linha que melhor
// descreve a pessoa pro humano que vai decidir).
const ordenadas = [
  { ref_id: 'novo', cpf_norm: null, criado_em: '2026-06-01T12:00:00Z' },
  { ref_id: 'velho_com_cpf', cpf_norm: '11122233344', criado_em: '2024-01-01T12:00:00Z' },
].sort(ordemAncora);
assert.equal(ordenadas[0].ref_id, 'velho_com_cpf');

console.log('inscricaoOrfas: OK');
