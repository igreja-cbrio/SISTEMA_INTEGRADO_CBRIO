// ============================================================================
// Genesis CBA · a SÉRIE permanente (24/09/2026) · régua PURA (entra no gate)
// ============================================================================
// Um Genesis = uma EDIÇÃO da série `genesis`, com data e igreja sede (igreja
// parceira). A pessoa inscrita NÃO vira cadastro da CBRio
// (services/igrejaParceira.js). Aqui mora o que não depende do banco: o molde
// das perguntas, o nome da edição e o resumo "todas as vezes que fizemos".
// ============================================================================

const SLUG_BASE_GENESIS = 'genesis';

// Perguntas que a igreja parceira pediu. Os campos padrão (nome, CPF, e-mail,
// celular, nascimento, sexo, LGPD) vêm do Contrato de Inscrição, não daqui.
// ⚠️ `key` FIXA em toda edição: é o que deixa uma edição comparável com a outra.
const GENESIS_CAMPOS = Object.freeze([
  { key: 'c_genesis_igreja', label: 'Qual o nome da sua igreja ou instituição?', tipo: 'texto', obrigatorio: true, opcoes: [] },
  { key: 'c_genesis_endereco', label: 'Preencha o endereço completo da sua igreja ou instituição:', tipo: 'textarea', obrigatorio: true, opcoes: [] },
  { key: 'c_genesis_cargo', label: 'Qual seu cargo na sua igreja ou instituição?', tipo: 'texto', obrigatorio: true, opcoes: [] },
  { key: 'c_genesis_ja_participou', label: 'Você já participou do Gênesis?', tipo: 'escolha', obrigatorio: true, opcoes: ['Sim', 'Não'] },
  { key: 'c_genesis_como_soube', label: 'Como você ficou sabendo do Gênesis?', tipo: 'texto', obrigatorio: false, opcoes: [] },
]);

/** Cópia do molde (nunca o objeto congelado). */
function camposGenesis() {
  return GENESIS_CAMPOS.map((c) => ({ ...c, opcoes: [...c.opcoes] }));
}

/** "Genesis CBA · <igreja>" — o nome diz ONDE, que é o que distingue uma edição. */
function nomeEdicao(nomeIgreja) {
  const ig = String(nomeIgreja || '').trim();
  return ig ? `Genesis CBA · ${ig}` : 'Genesis CBA';
}

/** Rótulo de edição = a data (a série é 'custom', sem régua de calendário). */
function rotuloEdicaoGenesis(data) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(data || '')) ? String(data) : null;
}

/**
 * Resumo da série. Conta inscritos VIVOS que o chamador já contou por edição.
 * `ativas` = publicadas (formulário no ar). Igreja conta uma vez por id.
 */
function resumoGenesis(edicoes) {
  const lista = Array.isArray(edicoes) ? edicoes : [];
  const igrejas = new Set();
  let inscritos = 0; let ativas = 0;
  for (const e of lista) {
    if (e?.igreja_id) igrejas.add(e.igreja_id);
    inscritos += Number(e?.inscritos) || 0;
    if (e?.status === 'publicado') ativas += 1;
  }
  return { edicoes: lista.length, ativas, igrejas: igrejas.size, inscritos };
}

module.exports = {
  SLUG_BASE_GENESIS, GENESIS_CAMPOS, camposGenesis, nomeEdicao, rotuloEdicaoGenesis, resumoGenesis,
};
