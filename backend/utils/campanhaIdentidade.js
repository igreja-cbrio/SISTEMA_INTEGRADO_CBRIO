// ════════════════════════════════════════════════════════════════════════════
//  Nome e descrição curta da campanha — o que pode ser gravado.
//
//  Pedido do Matheus (01/09/2026): *"preciso que dê para editar o nome da
//  campanha na tela de configurações, e isso deve refletir em todos os locais."*
//
//  ⚠️⚠️ O "REFLETE EM TODOS OS LOCAIS" JÁ ERA VERDADE — e foi MEDIDO antes de
//  escrever isto. Nenhuma tabela guarda cópia do nome da campanha
//  (`camp_disparos.nome` é o nome do DISPARO, `camp_marcos.titulo` é do marco), e
//  `camp_digitos_ativos()` lê `c.nome` AO VIVO. Renomear reflete sozinho na
//  barrinha, no dígito, no seletor do /doar e no app.
//
//  ⚠️⚠️ COM UMA EXCEÇÃO DELIBERADA: `pag_cobrancas.metadata.campanha` é SNAPSHOT
//  do que a pessoa viu no momento de doar, e NÃO é reescrito. Se a campanha
//  mudar de nome, o registro daquela doação tem de continuar dizendo para que ela
//  doou — reescrever apagaria a prova do que foi prometido. Quem casa a doação
//  com a campanha é `metadata.campanha_id`, então a barrinha continua certa.
//
//  ⚠️⚠️ E O SLUG NÃO MUDA. Medido: 0 triggers em `camp_campanhas` e `slug` fora
//  do patch do PUT. É o que preserva o link `/campanha/<slug>` que já foi
//  compartilhado, impresso em cartaz ou virou QR — renomear não pode matar
//  endereço que está na mão das pessoas.
//
//  ⚠️ Régua PURA (sem banco, sem rede) pra entrar no gate.
// ════════════════════════════════════════════════════════════════════════════

// Teto do nome. Não há limite no banco (`text`), mas nome de campanha aparece em
// título de tela, chip, `<option>` de seletor e no extrato do provedor de
// pagamento — texto sem teto vira layout quebrado em cinco lugares.
const MAX_NOME = 80;
// A descrição curta aparece embaixo do seletor no /doar.
const MAX_DESCRICAO_CURTA = 160;

/**
 * Valida e normaliza o nome. Devolve `{ ok, nome }` ou `{ ok: false, motivo }`.
 *
 * ⚠️⚠️ STRING VAZIA É O BURACO REAL AQUI. `camp_campanhas.nome` é NOT NULL, mas
 * `''` PASSA no NOT NULL — e o `PUT` não validava nada. Dava pra salvar campanha
 * com nome vazio, que apareceria como linha em branco no seletor do /doar, no
 * chip da barrinha e no retorno de `camp_digitos_ativos()`. O banco não protege
 * disso; quem protege é isto.
 */
function validarNome(valor) {
  if (valor === undefined) return { ok: true, nome: undefined }; // não veio: não mexe
  if (typeof valor !== 'string') return { ok: false, motivo: 'nome_invalido' };
  // ⚠️ Colapsa espaço interno também: "Reforma   do  Kids" e "Reforma do Kids"
  // são o mesmo nome, e deixar os dois cria duas grafias do mesmo lugar (a lição
  // dos bairros e dos motivos de inativação do Kids).
  const t = valor.replace(/\s+/g, ' ').trim();
  if (!t) return { ok: false, motivo: 'nome_vazio' };
  if (t.length > MAX_NOME) return { ok: false, motivo: 'nome_longo' };
  return { ok: true, nome: t };
}

/** Descrição curta: opcional, e VAZIO significa "apagar" (vira null). */
function validarDescricaoCurta(valor) {
  if (valor === undefined) return { ok: true, descricao_curta: undefined };
  if (valor === null) return { ok: true, descricao_curta: null };
  if (typeof valor !== 'string') return { ok: false, motivo: 'descricao_invalida' };
  const t = valor.replace(/\s+/g, ' ').trim();
  // ⚠️ Vazio vira `null`, não `''`: são a mesma ausência, e duas formas de
  // "sem descrição" fazem todo `if (c.descricao_curta)` decidir diferente
  // dependendo de qual chegou.
  if (!t) return { ok: true, descricao_curta: null };
  if (t.length > MAX_DESCRICAO_CURTA) return { ok: false, motivo: 'descricao_longa' };
  return { ok: true, descricao_curta: t };
}

const MENSAGEM = {
  nome_invalido: 'O nome da campanha precisa ser um texto.',
  nome_vazio: 'Dê um nome à campanha.',
  nome_longo: `O nome cabe em até ${MAX_NOME} caracteres.`,
  descricao_invalida: 'A descrição precisa ser um texto.',
  descricao_longa: `A descrição curta cabe em até ${MAX_DESCRICAO_CURTA} caracteres.`,
};

/** Mensagem para a tela. Motivo desconhecido NÃO devolve `undefined`. */
function mensagemDoMotivo(motivo) {
  return MENSAGEM[motivo] || 'Não foi possível salvar.';
}

module.exports = {
  MAX_NOME,
  MAX_DESCRICAO_CURTA,
  validarNome,
  validarDescricaoCurta,
  mensagemDoMotivo,
};
