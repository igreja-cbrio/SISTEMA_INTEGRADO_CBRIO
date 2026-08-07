/**
 * Saneamento do payload que o APP manda pra `POST /api/app/inscricoes`.
 * Régua PURA (sem banco, sem rede, sem relógio obrigatório) → entra no gate.
 *
 * ⚠️⚠️ POR QUE ISTO EXISTE, E POR QUE NÃO É `validarCamposPadrao`.
 *
 * A auditoria apontou que este endpoint não passa pelo Contrato de Inscrição.
 * Antes de ligar o contrato, medi em produção o que o app REALMENTE manda
 * (06/08/2026 · 22 linhas em `app_inscricoes`) — e ligar `validarCamposPadrao`
 * como está **reprovaria praticamente tudo**:
 *
 *   · `exigirNascimento` e `exigirSexo`: **0 de 22** payloads mandam esses
 *     campos (o único tipo que manda nascimento é batismo, que tem 0 linhas).
 *   · `exigirEmail`: oração, aconselhamento e SOS **nunca** mandam e-mail.
 *   · a régua de telefone **não tem flag pra relaxar** e 46 dos 83 cadastros
 *     ligados a conta do app não têm telefone ⇒ o botão de **SOS** (risco de
 *     vida) e o Fale Conosco passariam a recusar ~55% das contas, em telas que
 *     nem têm campo de telefone pra a pessoa corrigir.
 *   · batismo manda `nome` = **primeiro token** ⇒ "Informe o nome completo" em
 *     100% dos envios.
 *
 * Então o conserto desta onda é o que a medição mostrou como dano REAL:
 *
 * **O '55' grudado no telefone.** 15 das 22 linhas têm 13 dígitos começando com
 * 55 (vem de `profiles.telefone`, gravado pelo PhoneInput como "+55 (21) …") e
 * o fanout só remove não-dígito — ele NÃO tira código de país. Resultado: as 5
 * inscrições de voluntariado que chegaram em `vol_inscricoes` estão com 13
 * dígitos, e o **próprio dedup por telefone do fanout compara contra os 11
 * dígitos da base** — ou seja, o dedup não casa e a pessoa pode duplicar.
 *
 * ⚠️ NÃO BLOQUEIA NADA. Campo que não normaliza vira `null` (que é o que o
 * fanout já grava quando não sobra dígito), nunca 400. Recusar pedido pastoral
 * por causa de telefone é o oposto do que este endpoint precisa fazer.
 *
 * ⚠️ SÓ MEXE EM CHAVE QUE EXISTE no payload — nunca inventa campo. E preserva
 * TODAS as outras chaves intactas: o fanout lê `grupo_id`, `areas`, `nome_mae`,
 * `sobrenome`, `tamanho_camisa`, `possui_deficiencia`, `deficiencia_descricao`,
 * `observacoes`, `observacao`, `evento_id`, `membro_id`. Remover ou renomear
 * qualquer uma quebra um ramo do trigger.
 */
const {
  soDigitos, tirarCodigoPaisTelefone, emailValido, validarNascimento,
} = require('./camposContato');

const TELEFONE_MIN = 10; // DDD + 8
const TELEFONE_MAX = 11; // DDD + 9 (celular)

/** trim + colapsa espaço; string vazia vira null (não "" ). */
function limparTexto(v, max = 200) {
  const s = String(v == null ? '' : v).trim().replace(/\s+/g, ' ');
  return s ? s.slice(0, max) : null;
}

/**
 * @param {object} dados payload livre que o app mandou (já sem o `tipo`)
 * @param {{ hoje?: string }} [opts] `hoje` em YYYY-MM-DD (só pra teste determinístico)
 * @returns {{ dados: object, ajustes: string[] }} `ajustes` = nomes dos campos
 *   que mudaram de valor — serve pra log SEM PII (nomes, nunca valores).
 */
function sanearDadosApp(dados, opts = {}) {
  const d = { ...(dados || {}) };
  const ajustes = [];
  const mudou = (campo, antes, depois) => {
    if (antes !== depois) ajustes.push(campo);
    return depois;
  };

  if ('telefone' in d) {
    // digits → tira o 55 (só quando o resto ainda é telefone completo: DDD 55 é
    // Santa Maria/RS e tem que passar) → só aceita 10-11 dígitos.
    const tel = tirarCodigoPaisTelefone(soDigitos(d.telefone));
    const ok = tel.length >= TELEFONE_MIN && tel.length <= TELEFONE_MAX;
    d.telefone = mudou('telefone', d.telefone, ok ? tel : null);
  }

  if ('cpf' in d) {
    // Só dígitos. O DV NÃO é julgado aqui: quem exige CPF válido é o handler
    // (e o matcher), e transformar CPF torto em null aqui esconderia do gate
    // que já existe no endpoint.
    const cpf = soDigitos(d.cpf);
    d.cpf = mudou('cpf', d.cpf, cpf || null);
  }

  if ('email' in d) {
    const email = String(d.email == null ? '' : d.email).trim().toLowerCase();
    d.email = mudou('email', d.email, emailValido(email) ? email : null);
  }

  if ('data_nascimento' in d) {
    d.data_nascimento = mudou(
      'data_nascimento', d.data_nascimento, validarNascimento(d.data_nascimento, opts.hoje),
    );
  }

  for (const campo of ['nome', 'sobrenome', 'nome_completo', 'nome_mae']) {
    if (campo in d) d[campo] = mudou(campo, d[campo], limparTexto(d[campo]));
  }

  return { dados: d, ajustes };
}

module.exports = { sanearDadosApp, limparTexto, TELEFONE_MIN, TELEFONE_MAX };
