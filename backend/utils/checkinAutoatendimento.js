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

module.exports = { soDigitos, mascararNome, validarEntrada, escolherInscricao, resumoPublico };
