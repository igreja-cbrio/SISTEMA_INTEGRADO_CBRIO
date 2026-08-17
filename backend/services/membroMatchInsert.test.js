// ============================================================================
// Contrato: o INSERT do matcher canônico GRAVA nascimento e sexo (2026-08-17)
//
// POR QUE ESTE TESTE EXISTE
// Até 17/08 `acharOuCriarGuardado` calculava `nasc`, usava para DECIDIR
// identidade (ramo nome+nascimento, gate do `candidatoCompativel`) e o
// DESCARTAVA na criação — o cadastro nascia sem a data que a pessoa acabou de
// digitar. Medido em produção: 62 cadastros VIVOS com o nascimento gravado em
// `mem_identidade_observacoes` e a coluna do cadastro em branco, de 8 portas
// (54 nos 17 dias anteriores). Casos que o Marcos pegou na fila de Entradas:
// Wesley Barros Ramos (censo · 1955-09-29) e Pedro Moreira Gonçalez (batismo ·
// 2006-10-08 + sexo M, os dois salvos na tabela da porta).
//
// É guarda ESTÁTICA de propósito: `acharOuCriarGuardado` escreve em
// `mem_membros`, então exercitá-lo de verdade exigiria banco — e o gate de
// deploy roda sem banco. Mesma técnica de `inscricaoPortas.test.js` (que casa
// migrations no texto) e de `rpcsCliente.test.ts`.
//
// ⚠️⚠️ A checagem RODA SOBRE O CÓDIGO SEM COMENTÁRIO. O comentário do próprio
// conserto cita `data_nascimento` e `genero` em prosa; casar o identificador no
// texto cru faria o teste passar mesmo com a linha apagada — é a armadilha de
// 06/08 (falso positivo por comentário), agora do lado do JS.
// ============================================================================
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function semComentarios(js) {
  // Remove /* … */ e // … (sem comer o '//' de uma URL: só corta quando o '//'
  // não vem precedido de ':').
  return String(js)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((l) => l.replace(/(^|[^:])\/\/.*$/, '$1'))
    .join('\n');
}

const arquivo = path.join(__dirname, 'membroMatch.js');
const fonte = semComentarios(fs.readFileSync(arquivo, 'utf8'));

// O bloco do INSERT em mem_membros: do `.insert({` até o `}).select(`.
const insert = /\.from\('mem_membros'\)\s*\.insert\(\{([\s\S]*?)\}\)\.select\(/.exec(fonte);
assert(insert, 'não achei o INSERT em mem_membros no matcher — se ele mudou de forma, este teste precisa acompanhar');
const payload = insert[1];

assert(/data_nascimento/.test(payload),
  'o INSERT do matcher tem que gravar data_nascimento: sem isso a data que a pessoa digitou é usada para decidir identidade e jogada fora na criação');
assert(/genero/.test(payload),
  'o INSERT do matcher tem que gravar genero: o sexo é obrigatório em toda porta do Contrato de Inscrição e não pode morrer no funil');

// O valor gravado tem que ser o que o matcher já calculou, não uma leitura nova
// (duas fontes para a mesma decisão divergem).
assert(/data_nascimento:\s*nasc\b/.test(payload),
  'data_nascimento deve gravar o `nasc` que o matcher usou para casar — outra fonte faria o gravado divergir do que decidiu a identidade');
assert(/genero:\s*generoCanon\b/.test(payload),
  'genero deve gravar o valor traduzido (`generoCanon`), nunca o cru: mem_membros usa masculino|feminino e as portas guardam M|F');

// A tradução é a canônica do projeto, não uma cópia local.
assert(/require\('\.\.\/utils\/dadosDoCadastro'\)/.test(fonte),
  'a tradução de sexo tem que vir de utils/dadosDoCadastro (sexoPara) — cópia local divergiria do resto do sistema');

// ⚠️ O repasse pelo wrapper do contrato também é contrato: sem ele, as portas
// que passam por `processarIdentidade` (apresentação, eventos externos) criariam
// pessoa sem sexo mesmo com o matcher pronto para gravá-lo.
const contrato = semComentarios(fs.readFileSync(path.join(__dirname, 'inscricaoContrato.js'), 'utf8'));
const chamada = /acharOuCriarGuardado\(\s*\{([\s\S]*?)\}/.exec(contrato);
assert(chamada, 'não achei a chamada de acharOuCriarGuardado em inscricaoContrato');
assert(/\bgenero\b/.test(chamada[1]),
  'processarIdentidade tem que repassar genero ao matcher');

// E a porta do batismo, que é onde o caso real apareceu.
const batismo = semComentarios(fs.readFileSync(path.join(__dirname, '..', 'routes', 'publicBatismo.js'), 'utf8'));
const chamadaBat = /acharOuCriarGuardado\(\{([\s\S]*?)\}\)/.exec(batismo);
assert(chamadaBat, 'não achei a chamada de acharOuCriarGuardado em publicBatismo');
assert(/genero:/.test(chamadaBat[1]),
  'a porta do batismo tem que passar o sexo ao matcher (era o caso do Pedro Moreira Gonçalez)');

console.log('membroMatch: o INSERT grava nascimento e sexo · repasse do contrato e do batismo no lugar');
