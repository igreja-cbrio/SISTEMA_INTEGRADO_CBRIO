// ============================================================================
// Chave dos campos extras do formulário de inscrição.
//
// ⚠️ INCIDENTE 2026-08-03 · é este o motivo do módulo existir.
// O `sanitizeCampos` de routes/inscricoes.js testava `/^c_[a-z0-9_]+$/`, então
// TODA chave que não começasse com `c_` era considerada inválida e substituída
// por uma nova. Os eventos migrados do Celebra guardam as perguntas com chave em
// formato de slug do rótulo (`nome_da_empresa_negocio`), que não casa com aquele
// padrão — então, na PRIMEIRA vez que alguém abriu e salvou o evento
// "Patrocinadores - Celebra 2026" no construtor (30/07 11:58), as 7 chaves foram
// trocadas de uma vez e as 15 respostas já gravadas ficaram ÓRFÃS: a tela passou
// a mostrar "—" em tudo, embora o dado seguisse intacto em `inscricoes.dados`.
//
// O mesmo estava ARMADO para o "Celebra 2026" (114 inscrições · evento em 29/08):
// a chave dele também é slug, e as respostas ainda casavam só porque ninguém
// havia salvado aquele evento pelo construtor.
//
// A LEI: mudar a chave de um campo é o que orfana resposta. Chave existente é
// PRESERVADA byte a byte; chave nova só quando não existe nenhuma. NUNCA derivar
// a chave do label (é o que o comentário do `novaKeyCampo` já dizia — a régua é
// que estava estreita demais).
// ============================================================================

// Gerada 1x por campo novo. Opaca de propósito: editar o label não pode mexer nela.
function novaKeyCampo() {
  return `c_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

// Charset conferido contra o banco vivo em 2026-08-03: as 15 chaves de formulário
// (insc_eventos + ext_eventos) e as 10 chaves presentes em respostas (inscricoes +
// ext_inscricoes) passam todas. Aceita tanto `c_ms4yx5n3_01ax` quanto
// `nome_da_empresa_negocio`.
const KEY_CAMPO_OK = /^[a-z0-9_]{1,60}$/;

function keyCampoPreservada(bruta) {
  const k = String(bruta || '');
  return KEY_CAMPO_OK.test(k) ? k : novaKeyCampo();
}

module.exports = { novaKeyCampo, keyCampoPreservada, KEY_CAMPO_OK };
