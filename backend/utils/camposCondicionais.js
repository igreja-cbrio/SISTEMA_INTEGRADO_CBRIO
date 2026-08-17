// ============================================================================
// PERGUNTA QUE SÓ APARECE DEPENDENDO DE OUTRA (`mostrar_se`) — 2026-08-17
//
// Origem: as perguntas do retiro 2027 (PDF do Arthur) são condicionais na
// própria redação — *"Caso não seja membro Ami/CBRio, qual a sua igreja?"*,
// *"Qual medicamento? (caso sim)"*. Sem esta régua, o construtor só sabe fazer
// lista plana: a pessoa lê "caso" em toda pergunta e responde no vazio.
//
// Forma no `insc_eventos.campos`:
//   { key, label, tipo, obrigatorio, opcoes, mostrar_se: { key, valores[] } }
//
// ⚠️⚠️ A LEI DESTE ARQUIVO: **a MESMA régua decide na tela e no servidor.**
// Critérios divergentes dão um de dois estragos, e os dois já morderam este
// sistema (o `exige_dados_menor` do voluntariado, 28/07): ou o formulário fica
// INSUBMISSÍVEL (400 exigindo campo que a tela não mostrou), ou o inverso —
// resposta gravada de pergunta que a pessoa nunca viu. Por isso a régua é PURA
// e mora em `utils/` (entra no gate de deploy), com espelho em
// `src/lib/camposCondicionais.js` amarrado por teste.
//
// ⚠️ Régua de leitura: campo INVISÍVEL não é exigido **e a resposta dele é
// DESCARTADA**. Quem marcou "tenho alergia", escreveu o medicamento e depois
// voltou pra "não tenho" não pode deixar o remédio gravado na ficha — a equipe
// leria como fato clínico.
// ============================================================================

/** Normaliza pra comparar rótulo de opção: sem acento, sem caixa, sem espaço extra. */
function normalizar(v) {
  return String(v ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * As respostas de UMA pergunta, como conjunto normalizado.
 *
 * ⚠️ Múltipla escolha guarda "A, B" numa string só (é o formato que o
 * `PillSelect` emite e o que está gravado em `inscricoes.dados`). Comparar a
 * string inteira faria a condição falhar sempre que a pessoa marcasse 2 opções.
 */
function respostasDe(valor) {
  const bruto = String(valor ?? '').trim();
  if (!bruto) return [];
  return bruto.split(',').map(normalizar).filter(Boolean);
}

/**
 * A condição está declarada e é utilizável?
 *
 * Devolve `{ key, valores[] }` normalizado ou `null`. Nunca lança: `mostrar_se`
 * é digitado por gente na tela do construtor.
 */
function condicaoDe(campo) {
  const c = campo && campo.mostrar_se;
  if (!c || typeof c !== 'object') return null;
  const key = String(c.key ?? '').trim();
  if (!key) return null;
  const brutos = Array.isArray(c.valores) ? c.valores : (c.valor !== undefined ? [c.valor] : []);
  const valores = [...new Set(brutos.map(normalizar).filter(Boolean))];
  if (!valores.length) return null;
  return { key, valores };
}

/**
 * Quais campos aparecem, dadas as respostas até agora.
 *
 * Devolve um `Set` de keys visíveis. Resolve em CASCATA: filho de pergunta
 * escondida também fica escondido, mesmo que a resposta antiga da mãe ainda
 * casasse (é o caso de quem preencheu e depois mudou a resposta de cima).
 *
 * ⚠️⚠️ **FAIL-OPEN em condição quebrada**: `mostrar_se` apontando pra uma key
 * que não existe no formulário (pergunta-mãe apagada, key digitada errada)
 * deixa o campo **VISÍVEL**. Fechar seria sumir com uma pergunta em silêncio —
 * a equipe montaria o formulário, publicaria, e a pergunta simplesmente nunca
 * apareceria pra ninguém. Visível de volta é o comportamento de antes desta
 * régua existir: no pior caso sobra uma pergunta "caso...", que a pessoa lê e
 * responde.
 *
 * ⚠️ Ciclo (A depende de B que depende de A) resolve como visível nos dois — o
 * laço para quando não há mais mudança, e o teto de iterações é o nº de campos.
 */
function keysVisiveis(campos, respostas = {}) {
  const lista = Array.isArray(campos) ? campos.filter((c) => c && c.key) : [];
  const existentes = new Set(lista.map((c) => String(c.key)));
  const visiveis = new Set(lista.map((c) => String(c.key)));

  // Cada passada só ESCONDE. Repete enquanto algo mudar (cascata), com teto no
  // número de campos — cadeia mais longa possível.
  for (let passada = 0; passada <= lista.length; passada++) {
    let mudou = false;
    for (const campo of lista) {
      const key = String(campo.key);
      if (!visiveis.has(key)) continue;
      const cond = condicaoDe(campo);
      if (!cond) continue;
      // Condição quebrada (mãe inexistente) → fica visível. Ver o ⚠️ acima.
      if (!existentes.has(cond.key)) continue;
      // Mãe escondida ⇒ filho escondido, independente da resposta guardada.
      const maeVisivel = visiveis.has(cond.key);
      const marcadas = maeVisivel ? respostasDe(respostas[cond.key]) : [];
      const casa = marcadas.some((m) => cond.valores.includes(m));
      if (!casa) { visiveis.delete(key); mudou = true; }
    }
    if (!mudou) break;
  }
  return visiveis;
}

/** Os campos que a tela deve renderizar, na ordem original. */
function camposVisiveis(campos, respostas = {}) {
  const vis = keysVisiveis(campos, respostas);
  return (Array.isArray(campos) ? campos : []).filter((c) => c && c.key && vis.has(String(c.key)));
}

/** Este campo aparece agora? */
function campoVisivel(campos, key, respostas = {}) {
  return keysVisiveis(campos, respostas).has(String(key));
}

module.exports = {
  normalizar,
  respostasDe,
  condicaoDe,
  keysVisiveis,
  camposVisiveis,
  campoVisivel,
};
