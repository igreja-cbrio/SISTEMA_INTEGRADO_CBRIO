// ============================================================================
// Contrato: a política 'ligar' também CUMPRE o contrato de porta (2026-08-24)
//
// POR QUE ESTE TESTE EXISTE
// `processarIdentidade` tem dois ramos. O 'criar' chama `acharOuCriarGuardado`,
// que consolida CPF tardio e acumula contato divergente. O 'ligar' chamava
// `acharMembroGuardado` — que é SÓ-LEITURA de propósito — e **não fazia nenhum
// dos dois**. Resultado medido em produção no Celebra 2026 (301 inscrições):
// 18 CPFs e 14 telefones ficaram presos na linha de `inscricoes`, com o
// cadastro da pessoa ao lado sem CPF. Os 607 `membro_ativo` sem CPF tinham
// resposta na mesa e ninguém pegava.
//
// ⚠️ A escrita NÃO pode migrar pra dentro de `acharMembroGuardado`: ele tem
// 15+ chamadores e um deles declara no cabeçalho que o match é read-only
// (`publicGenerosidade.js`). Ela mora na camada da PORTA, que é onde a LEI do
// "Contrato de porta" (CLAUDE.md) manda acumular contato e consolidar CPF.
//
// É guarda ESTÁTICA de propósito: exercitar o ramo de verdade exigiria banco, e
// o gate de deploy roda sem banco. Mesma técnica de `membroMatchInsert.test.js`.
//
// ⚠️⚠️ RODA SOBRE O CÓDIGO SEM COMENTÁRIO. O comentário do próprio conserto cita
// `registrarContatoDaPorta` e `reconciliarCpfTardio` em prosa — casar no texto
// cru passaria mesmo com as chamadas apagadas.
// ============================================================================
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function semComentarios(js) {
  const s = String(js).replace(/\r\n?/g, '\n');
  return s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

const arquivo = path.join(__dirname, 'inscricaoContrato.js');
const fonte = semComentarios(fs.readFileSync(arquivo, 'utf8'));

// O ramo 'ligar': de `acharMembroGuardado(` até o `return` que fecha a função.
const ramo = /acharMembroGuardado\(([\s\S]*?)return \{ membroId/.exec(fonte);
assert(ramo, 'não achei o ramo da política "ligar" em processarIdentidade — se ele mudou de forma, este teste precisa acompanhar');
const corpo = ramo[1];

// ── 1. Contato divergente tem que acumular ────────────────────────────────
assert(/registrarContatoDaPorta\s*\(/.test(corpo),
  'o ramo "ligar" tem que chamar registrarContatoDaPorta: sem isso o telefone/e-mail que a pessoa digitou não entra em mem_contatos e a PRÓXIMA porta não acha a pessoa por ele (nasce órfã de novo)');
assert(/registrarContatoDaPorta/.test(
  /const \{[^}]*\} = require\('\.\/membroMatch'\)/.exec(fonte)?.[0] || ''),
  'registrarContatoDaPorta tem que vir de ./membroMatch — é a MESMA função do match, não duplicar a régua');

// ── 2. CPF tardio tem que consolidar ──────────────────────────────────────
assert(/reconciliarCpfTardio/.test(corpo),
  'o ramo "ligar" tem que consolidar o CPF via reconciliarCpfTardio: é ele que sabe a régua (preenche só se o membro está SEM CPF, conflito vira pendência, nunca funde sozinho)');

// ⚠️ A CONFIANÇA É O GUARD-RAIL, não detalhe. E-mail e telefone+nome são sinais
// que a FAMÍLIA compartilha: com homônimo (pai/filho) o CPF de um viraria a
// identidade PERMANENTE do cadastro do outro e capturaria todas as portas.
// 'fraca' só consolida com o nascimento conferível dos DOIS lados.
assert(/confianca:\s*matchedBy === 'nome\+nascimento' \? 'forte' : 'fraca'/.test(corpo),
  "a confiança tem que ser 'forte' só para nome+nascimento (que já conferiu a data por construção) e 'fraca' para o resto — passar 'forte' direto deixaria o CPF de um homônimo virar identidade do outro");

// ── 3. Match por CPF não precisa consolidar (o membro já tem esse CPF) ─────
assert(/matchedBy !== 'cpf'/.test(corpo),
  'match por CPF deve ser excluído da consolidação: o membro já tem exatamente esse CPF, e chamar o reconciliador ali é trabalho inútil no caminho quente da porta');

// ── 4. Nada disso pode derrubar a inscrição ───────────────────────────────
// O vínculo já está resolvido quando estas escritas rodam; falha aqui é
// best-effort, igual ao resto da porta.
assert((corpo.match(/try \{/g) || []).length >= 2,
  'as duas escritas têm que ser best-effort (try/catch cada): falha ao acumular contato ou consolidar CPF não pode derrubar a inscrição da pessoa');

// ── 5. Guarda de vínculo: sem membro não há o que escrever ────────────────
assert(/if \(membroId\) \{/.test(corpo),
  'as escritas têm que estar sob `if (membroId)`: inscrição órfã não tem cadastro pra receber contato nem CPF');

// ── 6. A espinha `inscricoes` tem que estar no backfill do CPF ────────────
// O conserto acima só vale pra inscrição NOVA. O estoque (18 CPFs no Celebra)
// só entra pelo backfill — e a espinha estava fora da lista dele.
const backfill = fs.readFileSync(
  path.join(__dirname, '..', 'scripts', 'reconciliar-cpf-backfill.js'), 'utf8');
assert(/tabela: 'inscricoes'/.test(semComentarios(backfill)),
  "a tabela `inscricoes` (espinha das inscrições em evento) tem que estar nos SATELITES do reconciliar-cpf-backfill: é a porta que mais coleta CPF e estava fora");
