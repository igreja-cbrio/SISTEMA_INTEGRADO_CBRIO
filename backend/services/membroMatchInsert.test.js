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
  //
  // ⚠️⚠️ NORMALIZA A TERMINAÇÃO DE LINHA PRIMEIRO. A 1ª versão cortava o comentário
  // com `/(^|[^:])\/\/.*$/` linha a linha — e em arquivo com CRLF a linha acaba em
  // CR, que o `.` não casa, enquanto o `$` (sem flag `m`) só ancora no fim da
  // string, DEPOIS do CR. Resultado: nenhum comentário era removido e a proteção
  // contra falso positivo por comentário ficava INERTE. Passou despercebido porque
  // os arquivos que eu tinha acabado de escrever estavam em LF; quebrou no primeiro
  // checkout novo, onde o git converte pra CRLF — e o sintoma foi o teste acusar
  // "não achei a chamada" num arquivo correto.
  // Régua: helper que processa fonte por LINHA normaliza a terminação antes.
  return String(js)
    .split('\r\n').join('\n')
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

// ── Telefone comparável (2026-08-17) ────────────────────────────────────────
// `mem_membros.telefone` guarda formatos MISTOS (23% mascarados em 17/08) e
// `21996137099` NÃO é substring de `(21)99613-7099` — o `ilike %digitos%` que a
// busca usava era cego a 84 grupos de cadastros no mesmo telefone canônico.
// Quem compara agora é a coluna GERADA `telefone_digits`.
assert(/telefone_digits\.eq\./.test(fonte),
  'a busca de candidatos tem que filtrar por telefone_digits — ilike sobre a coluna crua é cego a número mascarado');

// ⚠️ O fallback é CRÍTICO: pedir coluna inexistente faz o PostgREST recusar a
// query INTEIRA, e buscarCandidatos é o caminho de TODA porta de pessoa. Sem
// ele, o intervalo entre o deploy e a migration derrubaria batismo, censo,
// grupos, Next e voluntariado de uma vez.
assert(/telefone\.ilike\./.test(fonte),
  'o fallback pro ilike tem que continuar existindo para o intervalo entre deploy e migration');
assert(/telefone_digits/.test(fonte.slice(fonte.indexOf('resultado.error'))),
  'o fallback tem que ser disparado pelo erro que cita telefone_digits, não por qualquer erro (erro de rede não deve virar busca cega)');

const canon = /function telefoneComparavel\(v\) \{([\s\S]*?)^\}/m.exec(fonte);
assert(canon, 'não achei telefoneComparavel');
const comparavel = new Function('v', canon[1]);
assert.equal(comparavel('(21) 97965-1112'), comparavel('21979651112'),
  'as duas formas do MESMO telefone têm que virar o mesmo valor (é o caso Fabio Moura, que gerou cadastro duplicado)');
assert.equal(comparavel('5521970079969'), '21970079969', 'código de país 55 sai quando o resto é telefone completo');
// ⚠️⚠️ DDD 55 é Santa Maria/RS: `replace(^55)` cru destruiria todo número de lá.
// O caso que DISCRIMINA é o de Santa Maria SEM código de país: com 11 dígitos a
// régua certa não mexe, e a ingênua devolveria 9 dígitos sem DDD.
// (Mutation-test: a asserção com o número de 13 dígitos abaixo passa nas DUAS
// réguas — `5555991234567`.slice(2) dá o mesmo resultado. Ela sozinha não
// provava nada, e o mutante sobreviveu até esta linha existir.)
assert.equal(comparavel('55991234567'), '55991234567',
  'número de Santa Maria SEM código de país mantém os 11 dígitos — replace(^55) cru viraria 991234567 e perderia o DDD');
assert.equal(comparavel('5555991234567'), '55991234567', 'número de Santa Maria com código de país mantém o DDD 55');
assert.equal(comparavel('996013179'), null, 'telefone curto demais não vira chave de busca');

// ── Match perfeito · a exceção estreita ao soChaveForte ─────────────────────
// Decisão do Marcos (17/08): duplicata pode existir se cair na fila, mas match
// perfeito deve ligar na hora. ⚠️ O veto de CPF é o que impede a régua de errar
// em metade dos casos que ela alcança: dos 2 grupos com nome+nascimento
// idênticos na base viva, 1 tem CPFs diferentes (Fabio Moura).
const ramo = /if \(soChaveForte && permitirMatchPerfeito[\s\S]*?^  \}/m.exec(fonte);
assert(ramo, 'não achei o ramo do match perfeito');
assert(/normalizarNome\(c\.nome\) !== alvo/.test(ramo[0]),
  'o match perfeito exige nome normalizado IDÊNTICO — Dice/abreviação é o ramo normal, não este');
assert(/cpf11 && cCpf && cpf11 !== cCpf/.test(ramo[0]),
  'CPF conflitante tem que VETAR o match perfeito (caso Fabio Moura: mesmo nome e nascimento, CPFs diferentes)');
assert(/perfeitos\.length === 1/.test(ramo[0]),
  'só liga com EXATAMENTE um candidato: 2+ significa que a base já tem duplicata e escolher seria cara-ou-coroa');
assert(/permitirMatchPerfeito = false/.test(fonte),
  'a opção tem que ser OPT-IN: quem passa soChaveForte por um "não sou eu" do dedup não pode ser religado por nome+nascimento');

// ── O nome que autoriza LIGAR (2026-08-18) ──────────────────────────────────
// `nomesMesmaPessoa` (Dice ≥0,90) recusava nome abreviado, e era isso que
// transformava cadastro antigo em fantasma: o registro do Next legado tem nome +
// telefone, a pessoa volta com o nome civil completo e o MESMO telefone, o
// matcher não reconhece e nasce uma segunda pessoa.
const { nomeEhVersaoAbreviada } = require('./duplicidadePolicy');

assert(/nomeAutorizaLigar\(c\.nome, nome\)/.test(fonte),
  'os gates de candidato (e-mail+nome e telefone+nome) têm que usar nomeAutorizaLigar — com Dice puro o cadastro antigo vira fantasma');

// ⚠️⚠️ MUTATION-TEST: as duas asserções abaixo existem porque 2 mutantes
// SOBREVIVERAM à primeira versão deste bloco. Ele checava QUEM é chamado nos
// gates e não O QUE a função faz atrás — então (1) esvaziar
// `nomeAutorizaLigar` pra só `nomesMesmaPessoa` e (2) importar
// `nomesPodemSerMesmaPessoa` com o APELIDO `nomeEhVersaoAbreviada` passavam
// os dois. O segundo é o pior: reintroduz o atalho de Dice e volta a aceitar
// irmãs, com o teste verde.
const corpoLigar = /function nomeAutorizaLigar\(a, b\) \{([\s\S]*?)^\}/m.exec(fonte);
assert(corpoLigar, 'não achei nomeAutorizaLigar');
assert(/nomeEhVersaoAbreviada\(a, b\)/.test(corpoLigar[1]),
  'nomeAutorizaLigar tem que somar o containment — sem ele o cadastro antigo volta a virar fantasma');
assert(/require\('\.\/duplicidadePolicy'\)/.test(fonte)
  && /const \{ nomeEhVersaoAbreviada \} = require\('\.\/duplicidadePolicy'\)/.test(fonte),
  'o import tem que ser exatamente nomeEhVersaoAbreviada: apelidar nomesPodemSerMesmaPessoa reintroduz o Dice e liga irmãs');
assert(!/nomesPodemSerMesmaPessoa/.test(fonte),
  'o matcher NÃO pode usar nomesPodemSerMesmaPessoa: aquela é a régua de SUGERIR (tem o atalho de Dice), não a de LIGAR');
assert((fonte.match(/nomeAutorizaLigar\(c\.nome, nome\)/g) || []).length === 2,
  'são DOIS gates (acharOuCriarGuardado e acharMembroGuardado) e os dois precisam da régua');

// ⚠️⚠️ O ramo nome+nascimento continua no Dice ESTREITO, de propósito: GÊMEOS
// compartilham a data de nascimento, e ali um nome contido ("Ana Souza Lima" ×
// "Ana Lima") somado ao mesmo nascimento ligaria irmãs. Afrouxar exigiria veto de
// CPF, que aquele ramo não tem.
assert(/find\(\(c\) => nomesMesmaPessoa\(c\.nome, nome\)\)/.test(fonte),
  'o ramo nome+nascimento tem que continuar com nomesMesmaPessoa: nascimento igual + nome contido ligaria gêmeos');

// ⚠️ A régua de LIGAR é o containment, NUNCA o atalho de Dice da política.
// Medido sobre telefone em comum: containment = 100 pares, todos a mesma pessoa;
// Dice ≥0,90 = 4 pares, 2 deles IRMÃS.
assert.equal(nomeEhVersaoAbreviada('Kelly Veiga da Silva Oliveira', 'Kelly Veiga'), true,
  'nome contido é a mesma pessoa (caso real do Next legado)');
assert.equal(nomeEhVersaoAbreviada('Andrea Melchiades Palladino', 'Andrea Palladino'), true,
  'o caso Andrea Palladino tem que ligar');
assert.equal(nomeEhVersaoAbreviada('Layane A. M. Bello Joseph', 'Dayane A. M. Bello Joseph'), false,
  'IRMÃS: uma letra de diferença no PRIMEIRO nome não autoriza ligar');
assert.equal(nomeEhVersaoAbreviada('Mayla Duarte Victor Minari', 'Nayla Duarte Victor Minari'), false,
  'IRMÃS: idem — este é o par que o atalho de Dice aceitaria');
assert.equal(nomeEhVersaoAbreviada('Ana Souza Lima', 'Joao Souza Lima'), false,
  'irmãos que só compartilham sobrenome nunca ligam');
assert.equal(nomeEhVersaoAbreviada('Ana Souza', 'Ana Lima'), false,
  'mesmo primeiro nome com sobrenome diferente não é versão abreviada');

// ── O onboarding do APP também repassa o sexo (2026-08-18) ──────────────────
// A tela EXIGE sexo (gate de 05/08) e `validarCamposPadrao` devolve `sexo` em
// `valores` — mas a chamada do matcher não o repassava, então cadastro NOVO pelo
// app dependia só do `preencherOQuePortaoExige`, que roda depois. Aquele é o
// RESGATE, não o caminho: com o matcher gravando na criação (17/08), o repasse
// fecha a redundância.
const app = semComentarios(fs.readFileSync(path.join(__dirname, 'appIdentidade.js'), 'utf8'));
const chamadaApp = /acharOuCriarGuardado\(\{([\s\S]*?)\}\)/.exec(app);
assert(chamadaApp, 'não achei a chamada de acharOuCriarGuardado em appIdentidade');
assert(/genero:/.test(chamadaApp[1]),
  'o onboarding do app tem que passar o sexo ao matcher — a tela o exige e ele não pode morrer no funil');
// ⚠️ E o resgate CONTINUA existindo: ele cobre quem já tinha cadastro (match por
// CPF), caminho em que o INSERT do matcher nem roda.
assert(/patch\.genero = d\.sexo/.test(app),
  'preencherOQuePortaoExige tem que seguir gravando o sexo: no match por CPF o INSERT não roda e ele é o único caminho');

console.log('membroMatch: INSERT grava nascimento/sexo · telefone comparável com fallback · match perfeito com veto de CPF');
