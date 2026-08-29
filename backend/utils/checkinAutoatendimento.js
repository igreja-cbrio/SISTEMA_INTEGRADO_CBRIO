// ============================================================================
// EVENTO · régua do autoatendimento de check-in (2026-08-28)
//
// A pessoa digita CPF + data de nascimento, o sistema pergunta "você é
// fulano?" e ela confirma. Régua PURA — mora em `backend/utils/` para entrar no
// gate. Quem lê o banco é `routes/publicEventoCheckin.js`.
//
// ⚠️⚠️ A LEI QUE MANDA AQUI: **CPF IDENTIFICA, NÃO AUTENTICA** (04/08/2026).
// CPF está em nota fiscal, cadastro de loja e planilha — não é segredo. Por
// isso:
//   · exige-se um SEGUNDO sinal (nascimento), que não vem junto do CPF vazado;
//   · a resposta é MASCARADA — primeiro nome + iniciais, nunca o nome inteiro;
//   · a recusa é NEUTRA — não distingue "CPF não existe" de "nascimento não
//     confere", senão a porta vira um oráculo de CPF → nascimento;
//   · o poder concedido é o MENOR possível: marcar presença. Não lê contato,
//     não lê pagamento, não desfaz nada.
//
// ⚠️ O pior caso desta porta é alguém marcar presença de outra pessoa. É
// chato e REVERSÍVEL (o operador desfaz na tela dele, que registra histórico).
// Comparar com o pior caso de vazar nome+telefone dos 323 inscritos, que é
// irreversível, foi o que decidiu o desenho.
// ============================================================================

const RE_DIA = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

/** Só dígitos. */
function soDigitos(s) { return String(s || '').replace(/\D/g, ''); }

/**
 * Máscara do nome para a pergunta "você é fulano?".
 *
 * Mostra o PRIMEIRO nome inteiro e as iniciais do resto: "Matheus T. da S.".
 * O primeiro nome inteiro é o que faz a pessoa se reconhecer; o resto em
 * inicial é o que impede a porta de virar um diretório de nomes completos.
 *
 * ⚠️ Partículas (de, da, dos, e…) viram inicial junto — soletrar "d." é feio
 * mas não vaza nada, e tentar preservá-las abriria discussão sobre quais
 * preservar. Nome de uma palavra só sai inteiro.
 */
function mascararNome(nome) {
  const partes = String(nome || '').trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return '';
  if (partes.length === 1) return partes[0];
  const resto = partes.slice(1).map(p => `${p[0].toUpperCase()}.`).join(' ');
  return `${partes[0]} ${resto}`;
}

/**
 * Valida o que a pessoa digitou. Devolve `{ ok, cpf, nascimento }` ou
 * `{ ok:false, motivo }`.
 *
 * ⚠️ NÃO valida o dígito verificador do CPF de propósito: quem erra o DV
 * simplesmente não vai casar com inscrição nenhuma, e recusar antes daria à
 * porta uma resposta a mais para distinguir ("CPF inválido" × "não achei") —
 * exatamente o oráculo que a recusa neutra evita.
 */
function validarEntrada({ cpf, nascimento } = {}) {
  const c = soDigitos(cpf);
  if (c.length !== 11) return { ok: false, motivo: 'cpf_incompleto' };
  if (!RE_DIA.test(String(nascimento || ''))) return { ok: false, motivo: 'nascimento_invalido' };
  return { ok: true, cpf: c, nascimento: String(nascimento) };
}

/**
 * Escolhe a inscrição que corresponde ao que foi digitado.
 *
 * `candidatas` são as inscrições DAQUELE evento com aquele CPF (a consulta já
 * filtrou evento e CPF). Aqui só se confere o nascimento e se decide.
 *
 * ⚠️ Nascimento AUSENTE na inscrição NÃO casa. Aceitar "a inscrição não tem
 * nascimento, então qualquer nascimento serve" transformaria o segundo sinal
 * em enfeite justamente nos cadastros mais fracos.
 *
 * ⚠️ Duas inscrições vivas com o mesmo CPF e o mesmo nascimento no mesmo
 * evento → `ambiguo`. Não escolhe uma: mandar para o operador é melhor que
 * marcar presença na linha errada e a pessoa descobrir no sorteio.
 */
function escolherInscricao(candidatas, nascimento) {
  const lista = Array.isArray(candidatas) ? candidatas : [];
  const casam = lista.filter(i => i && i.data_nascimento && String(i.data_nascimento) === String(nascimento));
  if (casam.length === 0) return { situacao: 'nao_encontrada' };
  if (casam.length > 1) return { situacao: 'ambiguo' };
  return { situacao: 'ok', inscricao: casam[0] };
}

/**
 * O que a porta devolve sobre a inscrição encontrada — e SÓ isso.
 *
 * ⚠️ Nunca inclui telefone, e-mail, CPF, valor pago nem número de sorte. O
 * número de sorte é premiação e sai só depois do check-in confirmado, na tela
 * de sucesso, para a própria pessoa.
 */
function resumoPublico(inscricao) {
  if (!inscricao) return null;
  return {
    id: inscricao.id,
    nome_mascarado: mascararNome(inscricao.nome_completo),
    ja_fez_checkin: !!inscricao.checkin_em,
  };
}

// ════════════════════════════════════════════════════════════════════════════
// 2º CAMINHO · NOME COMPLETO + TELEFONE (2026-08-28, véspera do Celebra)
//
// Pedido do Matheus: as inscrições de 27/07 e antes entraram pelo contrato
// ANTIGO, que pedia só nome e telefone — então 67 das 332 do Celebra não têm
// CPF nem nascimento e ficavam fora do autoatendimento. Medido: 67/67 têm
// nome completo (2+ palavras) e telefone de 10-11 dígitos.
//
// ⚠️⚠️ NOME SOZINHO FOI RECUSADO, e o motivo é concreto: os 67 têm número da
// sorte, e num evento de igreja o nome é público. Nome sozinho deixaria
// qualquer pessoa marcar presença de qualquer outra (num sorteio em que estar
// presente vale prêmio), ver o número da sorte alheio, e — por ser adivinhável,
// diferente de CPF+nascimento — transformaria a porta num oráculo de "fulano
// vai ao Celebra?". Presença em evento de igreja é dado sensível (LGPD art. 11).
//
// O par nome+telefone mantém a MESMA estrutura do caminho do CPF: um sinal que
// identifica + um sinal que não é público. E não é régua nova: é exatamente o
// ramo forte que `services/inscricaoOrfas.avaliarForcaOrfa` já usa para ligar
// inscrição órfã a cadastro — "telefone igual + NOME COMPLETO idêntico".
//
// ⚠️ Risco declarado: família compartilha telefone. O pior caso é um cônjuge
// marcar presença do outro — reversível pelo operador, com motivo no ledger.
// Medido no Celebra: nome+telefone identifica UNICAMENTE as 332 inscrições
// (zero pares ambíguos), então o desempate por nome faz o trabalho.
// ════════════════════════════════════════════════════════════════════════════

/**
 * Chave de comparação do nome: sem acento, minúsculo, espaços colapsados.
 *
 * ⚠️ Comparação EXATA do nome inteiro, nunca parcial nem por semelhança.
 * Afrouxar aqui (primeiro nome, "contém", distância de edição) é o que
 * transformaria o desempate em chute — e o nome é a metade identificadora
 * deste par.
 */
function normalizarNomeChave(nome) {
  return String(nome || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * Chave de comparação do telefone: os 8 últimos dígitos.
 *
 * ⚠️ 8 dígitos porque é o que sobrevive às variações que a pessoa digita na
 * fila — com ou sem o 9, com ou sem DDD, com ou sem +55. Comparar cru
 * dependeria de sorte (é a mesma lição de `services/contatoPessoa.js`).
 * A exigência de conhecer o número inteiro fica na VALIDAÇÃO da entrada
 * (10-11 dígitos); o casamento é pelos 8 finais.
 */
function telefoneChave(telefone) {
  let d = soDigitos(telefone);
  // ⚠️ Só tira o 55 quando o resto AINDA é telefone completo: DDD 55 é Santa
  // Maria/RS e um replace(/^55/) cego destruiria todo número legítimo de lá.
  if (d.length >= 12 && d.length <= 13 && d.startsWith('55')) d = d.slice(2);
  return d.length >= 8 ? d.slice(-8) : '';
}

/**
 * Valida nome + telefone. Devolve `{ ok, nome, telefone }` ou
 * `{ ok:false, motivo }`.
 *
 * ⚠️ Exige nome com 2+ palavras: "Maria" sozinho não é identificação, é
 * categoria. E telefone com 10-11 dígitos (DDD + número), a mesma régua do
 * Contrato de Inscrição — quem não sabe o número inteiro não passa.
 */
function validarEntradaNome({ nome, telefone } = {}) {
  const n = normalizarNomeChave(nome);
  if (n.split(' ').filter(Boolean).length < 2) return { ok: false, motivo: 'nome_incompleto' };
  const d = soDigitos(telefone);
  const semDdi = (d.length >= 12 && d.length <= 13 && d.startsWith('55')) ? d.slice(2) : d;
  if (semDdi.length < 10 || semDdi.length > 11) return { ok: false, motivo: 'telefone_invalido' };
  return { ok: true, nome: n, telefone: semDdi };
}

/**
 * Escolhe a inscrição por nome completo + telefone.
 *
 * `candidatas` são as inscrições vivas DAQUELE evento (a consulta já filtrou
 * evento e situação). O casamento exige as DUAS chaves.
 *
 * ⚠️ Duas com o mesmo nome e o mesmo telefone → `ambiguo`, vai pro operador.
 * Marcar presença na linha errada é o erro que aparece só no sorteio.
 */
function escolherPorNomeTelefone(candidatas, { nome, telefone }) {
  const chaveNome = normalizarNomeChave(nome);
  const chaveTel = telefoneChave(telefone);
  if (!chaveNome || !chaveTel) return { situacao: 'nao_encontrada' };
  const casam = (Array.isArray(candidatas) ? candidatas : []).filter(i =>
    i && normalizarNomeChave(i.nome_completo) === chaveNome
      && telefoneChave(i.telefone) === chaveTel);
  if (casam.length === 0) return { situacao: 'nao_encontrada' };
  if (casam.length > 1) return { situacao: 'ambiguo' };
  return { situacao: 'ok', inscricao: casam[0] };
}

module.exports = {
  soDigitos, mascararNome, validarEntrada, escolherInscricao, resumoPublico,
  normalizarNomeChave, telefoneChave, validarEntradaNome, escolherPorNomeTelefone,
};
