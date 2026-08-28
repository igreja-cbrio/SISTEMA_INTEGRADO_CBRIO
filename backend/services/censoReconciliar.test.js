// Contrato da política do censo (services/censoReconciliar.js).
// Determinístico: sem banco, sem rede, sem depender da hora (lição do
// faixaEtaria.test.ts, que falhava depois das 21h BRT).
const assert = require('assert');
const {
  decidirCampos, podeAplicar, confiancaDoMatch, CAMPOS_CENSO, CAMPOS_ACUMULAVEIS,
} = require('./censoReconciliar');

// ── 1. A regra que existe pra reduzir a fila: campo VAZIO é preenchido ───────
{
  const r = decidirCampos(
    { email: null, telefone: '21999998888', endereco: '', profissao: null },
    { email: 'ana@x.com', endereco: 'Rua A, 10', profissao: 'Professora' },
  );
  assert.deepEqual(r.aplicar, {
    email: 'ana@x.com', endereco: 'Rua A, 10', profissao: 'Professora',
  }, 'destino vazio (null ou string vazia) deve ser preenchido');
  assert.equal(r.conflitos.length, 0, 'preencher vazio nunca é conflito');
}

// ── 2. Igual não vira conflito (caixa, espaço, máscara, timestamp) ───────────
{
  const r = decidirCampos(
    {
      email: 'Ana@X.com', telefone: '(21) 99999-8888', cep: '22640-100',
      cidade: 'Rio de Janeiro', data_nascimento: '1990-05-10',
    },
    {
      email: '  ana@x.com ', telefone: '21999998888', cep: '22640100',
      cidade: 'rio  de janeiro', data_nascimento: '1990-05-10T00:00:00.000Z',
    },
  );
  assert.deepEqual(r.aplicar, {}, 'nada a aplicar quando tudo confere');
  assert.equal(r.conflitos.length, 0, 'variação de formato NÃO é divergência');
  assert.deepEqual(Object.keys(r.acumular), [], 'contato igual não acumula');
  assert.equal(r.iguais.length, 5, 'os 5 campos foram confirmados');
}

// ── 3. Divergência real vira CONFLITO e NÃO é gravada ───────────────────────
{
  const r = decidirCampos(
    { endereco: 'Rua Antiga, 1', estado_civil: 'solteiro' },
    { endereco: 'Rua Nova, 99', estado_civil: 'casado' },
  );
  assert.deepEqual(r.aplicar, {}, 'campo que já tinha valor NUNCA é sobrescrito');
  assert.equal(r.conflitos.length, 2);
  const end = r.conflitos.find((c) => c.campo === 'endereco');
  assert.deepEqual(end, { campo: 'endereco', atual: 'Rua Antiga, 1', informado: 'Rua Nova, 99' },
    'o conflito carrega os DOIS lados — é o que a tela mostra pra decisão humana');
}

// ── 4. ⚠️ Telefone/e-mail divergentes ACUMULAM (decisão 2026-07-17) ─────────
// Mutation-test: tratar contato como conflito jogaria na fila humana o caso
// mais comum do censo (a pessoa trocou de número) e o principal continuaria
// desatualizado — o contrário da decisão de acumular em mem_contatos.
{
  const r = decidirCampos(
    { telefone: '21999998888', email: 'antigo@x.com', endereco: 'Rua A, 1' },
    { telefone: '21988887777', email: 'novo@x.com', endereco: 'Rua A, 1' },
  );
  assert.equal(r.conflitos.length, 0, 'contato divergente NÃO é conflito');
  assert.deepEqual(r.acumular, { telefone: '21988887777', email: 'novo@x.com' },
    'contato novo acumula (vai pra mem_contatos), nunca sobrescreve o principal');
  assert.deepEqual(r.aplicar, {}, 'acumular não é aplicar');
  assert.ok(CAMPOS_ACUMULAVEIS.has('telefone') && CAMPOS_ACUMULAVEIS.has('email'));
  assert.ok(!CAMPOS_ACUMULAVEIS.has('endereco'), 'endereço não acumula — é um valor só');
}

// ── 5. Não informado NUNCA apaga o que existe ───────────────────────────────
{
  const r = decidirCampos(
    { email: 'ana@x.com', endereco: 'Rua A, 1', profissao: 'Professora' },
    { email: '', endereco: null, profissao: '   ' },
  );
  assert.deepEqual(r.aplicar, {}, 'campo em branco no formulário não zera o cadastro');
  assert.equal(r.conflitos.length, 0, 'em branco também não é divergência');
}

// ── 6. Telefone inválido no cadastro é CORRIGIDO pelo censo ─────────────────
// Caso real (auditoria 31/07): 9 dígitos sem DDD, número que não existe. Como
// não normaliza, conta como destino vazio → o censo conserta em vez de abrir
// conflito com um valor inutilizável.
{
  const r = decidirCampos(
    { telefone: '996013179' },
    { telefone: '21996013179' },
  );
  assert.deepEqual(r.aplicar, { telefone: '21996013179' },
    'telefone que não normaliza conta como ausente e é preenchido');
  assert.equal(r.conflitos.length, 0);
}

// ── 7. Valor informado que não normaliza é IGNORADO (não grava lixo) ────────
{
  const r = decidirCampos({ telefone: null, email: null }, { telefone: '1234', email: 'x' });
  assert.deepEqual(r.aplicar, {}, 'telefone/e-mail inválidos não entram no cadastro');
}

// ── 8. Só os campos do censo são tocados ───────────────────────────────────
{
  const r = decidirCampos(
    { nome: 'Ana Silva', cpf: '11122233344', status: 'membro_ativo' },
    { nome: 'Ana S.', cpf: '55566677788', status: 'visitante', ministerio: 'Louvor' },
  );
  assert.deepEqual(r.aplicar, {}, 'nome/cpf/status/ministerio ficam fora do censo');
  assert.equal(r.conflitos.length, 0, 'campo fora da lista não gera nem conflito');
  for (const proibido of ['nome', 'cpf', 'status', 'ministerio']) {
    assert.ok(!CAMPOS_CENSO.includes(proibido), `${proibido} não pode estar em CAMPOS_CENSO`);
  }
}

// ── 9. Gate de confiança · só CPF aplica sozinho ────────────────────────────
{
  assert.equal(confiancaDoMatch('cpf'), 'forte');
  for (const fraco of ['email', 'telefone+nome', 'nome+nascimento', 'confirmado_usuario', null]) {
    assert.equal(confiancaDoMatch(fraco), 'fraca', `${fraco} não é chave forte`);
  }

  // CPF passa mesmo sem nascimento dos dois lados.
  assert.equal(podeAplicar({ matchedBy: 'cpf' }).ok, true);

  // Sinal fraco só passa com nascimento conferível E igual.
  assert.equal(podeAplicar({
    matchedBy: 'telefone+nome',
    nascimentoMembro: '1990-05-10', nascimentoInformado: '1990-05-10T00:00:00Z',
  }).ok, true, 'nascimento igual dos dois lados libera o sinal fraco');

  const semNasc = podeAplicar({ matchedBy: 'telefone+nome', nascimentoMembro: '1990-05-10' });
  assert.equal(semNasc.ok, false);
  assert.equal(semNasc.motivo, 'sinal_fraco_sem_nascimento');

  // ⚠️ Mutation-test: é ESTA guarda que impede o censo escrever o endereço de
  // uma pessoa no cadastro de outra. Mãe e filha com o mesmo telefone casam por
  // telefone+nome; o nascimento diferente é o único sinal de que erramos.
  const divergente = podeAplicar({
    matchedBy: 'telefone+nome',
    nascimentoMembro: '1965-03-02', nascimentoInformado: '1990-05-10',
  });
  assert.equal(divergente.ok, false, 'nascimento divergente NUNCA aplica em sinal fraco');
  assert.equal(divergente.motivo, 'sinal_fraco_nascimento_divergente');

  // "Sou eu" confirmado pela pessoa é validado só contra o TELEFONE, que a
  // família compartilha — segue como fraco.
  assert.equal(podeAplicar({
    matchedBy: 'confirmado_usuario',
    nascimentoMembro: '1965-03-02', nascimentoInformado: '1990-05-10',
  }).ok, false, 'confirmação do usuário não vira chave forte');
}

// ── 10. Aplicar e conflitar no MESMO passe (é o que reduz a fila) ───────────
{
  const r = decidirCampos(
    { email: null, bairro: 'Barra', profissao: null },
    { email: 'ana@x.com', bairro: 'Recreio', profissao: 'Professora' },
  );
  assert.deepEqual(Object.keys(r.aplicar).sort(), ['email', 'profissao'],
    'os vazios são preenchidos mesmo havendo conflito em outro campo');
  assert.equal(r.conflitos.length, 1);
  assert.equal(r.conflitos[0].campo, 'bairro');
}

// ── 11. ⚠️ O rótulo do formulário é TRADUZIDO pro vocabulário da coluna ─────
// Bug medido em 17/08: a pergunta "Estado civil" manda "Solteiro(a)" e o CHECK
// de mem_membros.estado_civil só aceita 'solteiro'. Como o UPDATE é um só, o
// 23514 levava embora bairro, cidade e telefone do mesmo passe — as 12 respostas
// do Censo 2026 ficaram dias sem aplicar NADA.
// Mutation-test: tirar a tradução do decidirCampos faz `aplicar.estado_civil`
// virar 'Solteiro(a)', que é exatamente o valor que o banco recusa.
{
  const r = decidirCampos(
    { estado_civil: null, bairro: null },
    { estado_civil: 'Solteiro(a)', bairro: 'Barra Olímpica' },
  );
  assert.equal(r.aplicar.estado_civil, 'solteiro',
    'o valor gravado é o do CHECK, não o rótulo que a pessoa viu na tela');
  assert.equal(r.aplicar.bairro, 'Barra Olímpica', 'campo livre segue como digitado');
  assert.equal(r.conflitos.length, 0);
}

// O mesmo rótulo contra o valor que JÁ está no cadastro é no-op, não conflito.
// Sem a tradução, "casado" × "Casado(a)" viraria conflito falso — e foi o que
// aconteceria com 2 das 12 respostas (Ariel e Victor, que já tinham o campo).
{
  const r = decidirCampos({ estado_civil: 'casado' }, { estado_civil: 'Casado(a)' });
  assert.deepEqual(r.aplicar, {}, 'não reescreve o que já está certo');
  assert.equal(r.conflitos.length, 0, 'variação de rótulo NÃO é divergência');
  assert.ok(r.iguais.includes('estado_civil'));
}

// ── 12. Valor que não traduz é DECLARADO, nunca gravado cru ─────────────────
{
  const r = decidirCampos(
    { estado_civil: null, cep: null, escolaridade: null },
    { estado_civil: 'Noivo(a)', cep: '2264', escolaridade: 'Mestrado' },
  );
  assert.equal(r.aplicar.estado_civil, undefined,
    'rótulo fora do vocabulário não entra na coluna com CHECK');
  assert.equal(r.aplicar.cep, undefined, 'CEP incompleto não é gravado');
  assert.equal(r.aplicar.escolaridade, 'mestrado',
    'escolaridade não tem CHECK: opção nova vira slug em vez de se perder');
  const motivos = r.descartados.map((d) => `${d.campo}:${d.motivo}`).sort();
  assert.deepEqual(motivos, ['cep:cep_invalido', 'estado_civil:nao_reconhecido'],
    'o que não foi guardado tem que aparecer no resultado — descarte silencioso '
    + 'é como o CPF do censo sumiu por 4 dias em 04/08');
}

// Não informar nada NÃO é descarte (senão a tela reportaria trabalho que não existe).
{
  const r = decidirCampos({ bairro: null }, { bairro: '   ' });
  assert.deepEqual(r.aplicar, {});
  assert.deepEqual(r.descartados, [], 'campo em branco é "não respondeu", não perda');
}

// ── 13. `escolaridade` está no contrato (era descartada em silêncio) ────────
{
  assert.ok(CAMPOS_CENSO.includes('escolaridade'),
    'a pergunta Escolaridade existia no censo desde o começo e o dado não tinha destino');
  assert.ok(CAMPOS_CENSO.includes('cep'));
}

console.log('censoReconciliar: OK');
