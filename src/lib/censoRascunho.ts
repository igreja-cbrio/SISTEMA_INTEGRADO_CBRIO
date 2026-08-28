/**
 * Quem é o DONO do rascunho do censo — e quando ele pode voltar pra tela.
 *
 * ⚠️⚠️ ISTO É PRIVACIDADE, não conveniência (25/08/2026).
 *
 * O formulário do censo guarda rascunho no `localStorage` pra sobreviver a
 * recarregar a página e funcionar sem rede. Até aqui ele era aplicado na
 * ABERTURA, pra QUALQUER pessoa, com o aviso *"recuperamos o que **você** já
 * havia preenchido"*. Num aparelho compartilhado — tablet na entrada do templo,
 * celular passado de mão em mão — a pessoa seguinte via **CPF, nome, e-mail,
 * telefone e nascimento** de quem preencheu antes, e, se seguisse clicando,
 * enviava a resposta sob o CPF alheio.
 *
 * MEDIDO EM PRODUÇÃO em 25/08: 5 rascunhos criados via QR em 12 minutos, cada um
 * durando **16 a 54 segundos** e chegando ao servidor com **18 a 26 campos**
 * preenchidos. Ninguém digita 25 campos em 26 segundos — era o rascunho anterior
 * sendo reenviado por quem abriu depois.
 */

/** Só os dígitos. O campo tem máscara, e o rascunho guarda o que foi digitado. */
export function soDigitos(v: unknown): string {
  return String(v ?? '').replace(/\D/g, '');
}

/**
 * O rascunho guardado pode ser aplicado a quem digitou este CPF?
 *
 * ⚠️ Exige CPF COMPLETO (11 dígitos) e igualdade exata. Comparar prefixo — ou
 * aceitar o que já foi digitado até agora — faria o rascunho vazar pra quem
 * digitasse os primeiros números do CPF de outra pessoa, que é o mesmo buraco
 * por outro caminho.
 *
 * ⚠️ Rascunho SEM dono (abandonado antes da pergunta 1, que é o CPF) NUNCA é
 * aplicado: é pouco dado e não há jeito seguro de saber de quem é.
 */
export function podeAplicarRascunho(donoCpf: unknown, cpfDigitado: unknown): boolean {
  const dono = soDigitos(donoCpf);
  const digitado = soDigitos(cpfDigitado);
  if (dono.length !== 11) return false;
  if (digitado.length !== 11) return false;
  return dono === digitado;
}
