// ============================================================================
// O LINK DA SALA no payload do formulário de grupo · régua PURA
//
// ⚠️⚠️ Esta guarda existe por causa de um bug REAL e caro: em setembro, 41
// grupos perderam a rede porque o `PUT /grupos/:id` é update de OBJETO INTEIRO
// e o formulário mandava o campo vazio quando não sabia o valor. O servidor
// gravava o vazio e ninguém percebia — "o import veio incompleto", dois meses
// depois.
//
// Aqui o campo é a CREDENCIAL DE ENTRADA da sala, então o custo de errar é
// maior: o líder salva o horário do grupo e a sala fica sem link.
//
// ⚠️ A régua mora AQUI, e não dentro do componente, porque ela DECIDE algo —
// e decisão dentro de JSX é decisão que nenhum mutante alcança (lei de 01/09).
// ============================================================================

export type FormLinkSala = {
  link_online?: string | null;
  /** o servidor não conseguiu LER o link deste grupo nesta abertura */
  link_indisponivel?: boolean;
};

/**
 * O que o formulário pode dizer sobre o link.
 *
 * ⚠️⚠️ Três estados, e colapsá-los é o bug:
 *   • leitura OK + texto   → grava
 *   • leitura OK + vazio   → APAGA (é o pedido de quem deixou de ser online)
 *   • leitura FALHOU       → **campo ausente**: o formulário não sabe, então
 *                            não decide. O `PUT` só toca no link quando a chave
 *                            vem no corpo (a mesma lei do `patchRedeGrupo`).
 */
export function payloadLinkSala(form: FormLinkSala): { link_online?: string } {
  if (form?.link_indisponivel) return {};
  return { link_online: String(form?.link_online ?? '').trim() };
}
