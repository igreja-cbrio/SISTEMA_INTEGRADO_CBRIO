// ============================================================================
// O QUE É OBRIGATÓRIO PARA SALVAR UM MEMBRO — 2026-08-21
//
// Pedido do Matheus: *"preciso conseguir alterar algum dado do membro sem ter
// que preencher todos os dados obrigatórios."*
//
// O formulário exigia nome + sobrenome + CPF + nascimento para SALVAR, tanto no
// cadastro novo quanto na EDIÇÃO. Efeito medido em 21/08: **545 membros estão
// sem CPF** e o cadastro legado costuma estar sem nascimento — para trocar um
// telefone, a equipe tinha que inventar o resto ou desistir da correção.
//
// ⚠️⚠️ EXIGIR DADO NA EDIÇÃO EMPURRA PARA O CHUTE. O campo obrigatório não faz
// o dado existir; faz alguém preencher qualquer coisa para o botão liberar — e
// CPF chutado é pior que CPF ausente, porque vira chave forte no matcher e liga
// a pessoa ao cadastro de outra.
//
// ⚠️ Isto NÃO afrouxa o Contrato de porta, que governa ENTRADA de pessoa nova:
// no CADASTRO os quatro campos continuam exigidos. A própria lei já diz que
// "dado legado nunca é alterado nem re-validado" — corrigir cadastro velho é
// exatamente o caso que ela protege.
//
// ⚠️ Campo vazio é OMITIDO do payload pelo formulário (`if (payload[k] === '')
// delete payload[k]`), então deixar em branco NÃO apaga o que já está gravado.
// É isso que torna seguro relaxar aqui — sem essa limpeza, salvar uma edição
// parcial zeraria o resto do cadastro.
// ============================================================================

/** Campos exigidos ao CRIAR uma pessoa (Contrato de porta). */
export const CAMPOS_CRIACAO = ['nome', 'sobrenome', 'cpf', 'data_nascimento'];

/** Campos exigidos ao EDITAR. `nome` é NOT NULL no banco — o resto é correção. */
export const CAMPOS_EDICAO = ['nome'];

export const ROTULO_CAMPO = {
  nome: 'Nome',
  sobrenome: 'Sobrenome',
  cpf: 'CPF',
  data_nascimento: 'Data de nascimento',
};

/** Vazio de verdade: null, undefined, ou string só de espaço. */
function vazio(v) {
  return v == null || String(v).trim() === '';
}

/**
 * Quais campos ainda faltam para o salvar liberar.
 *
 * @param {object} form estado do formulário
 * @param {{edicao?: boolean}} opts `edicao: true` = editando alguém que já existe
 * @returns {string[]} chaves faltando, na ordem do catálogo (lista vazia = pode salvar)
 */
export function faltandoParaSalvar(form, opts = {}) {
  const exigidos = opts.edicao ? CAMPOS_EDICAO : CAMPOS_CRIACAO;
  const f = form || {};
  return exigidos.filter((k) => vazio(f[k]));
}

/** Pode salvar? Açúcar para o botão. */
export function podeSalvar(form, opts = {}) {
  return faltandoParaSalvar(form, opts).length === 0;
}

/** Frase pronta para o toast: "CPF e Data de nascimento são obrigatórios." */
export function frasePendencias(faltando) {
  const nomes = (faltando || []).map((k) => ROTULO_CAMPO[k] || k);
  if (!nomes.length) return '';
  if (nomes.length === 1) return `${nomes[0]} é obrigatório.`;
  return `${nomes.slice(0, -1).join(', ')} e ${nomes[nomes.length - 1]} são obrigatórios.`;
}

/**
 * O que ainda falta no cadastro, para MOSTRAR sem bloquear na edição.
 * ⚠️ Informar não é exigir: a equipe vê o buraco e completa quando tiver o dado.
 */
export function pendenciasInformativas(form) {
  return faltandoParaSalvar(form, { edicao: false }).filter((k) => !CAMPOS_EDICAO.includes(k));
}
