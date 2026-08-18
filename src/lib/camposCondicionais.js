// ============================================================================
// ESPELHO de backend/utils/camposCondicionais.js — pergunta que só aparece
// dependendo de outra (`mostrar_se`) · 2026-08-17
//
// ⚠️⚠️ ESTE ARQUIVO E O DO BACKEND DECIDEM A MESMA COISA E TÊM QUE CONCORDAR.
// Critérios divergentes dão um de dois estragos, e os dois já morderam este
// sistema (o `exige_dados_menor` do voluntariado, 28/07): ou o formulário fica
// INSUBMISSÍVEL (o servidor exige campo que a tela não mostrou), ou o inverso —
// resposta gravada de pergunta que a pessoa nunca viu.
//
// `src/test/camposCondicionais.test.ts` roda a MESMA tabela de casos nos dois
// lados e falha quando eles divergem. Mudou aqui? Muda lá.
//
// ⚠️ Cópia e não import de `backend/` porque este bundle vai pro navegador — é o
// mesmo arranjo de `src/lib/inscricao.js` × `services/inscricaoContrato.js`.
// ============================================================================

export function normalizar(v) {
  return String(v ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .trim().toLowerCase().replace(/\s+/g, ' ');
}

/** Múltipla escolha guarda "A, B" numa string só — compara item a item. */
export function respostasDe(valor) {
  const bruto = String(valor ?? '').trim();
  if (!bruto) return [];
  return bruto.split(',').map(normalizar).filter(Boolean);
}

export function condicaoDe(campo) {
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
 * Keys visíveis, em cascata. Condição apontando pra pergunta inexistente é
 * FAIL-OPEN (o campo aparece) — ver o porquê no arquivo do backend.
 */
export function keysVisiveis(campos, respostas = {}) {
  const lista = Array.isArray(campos) ? campos.filter((c) => c && c.key) : [];
  const existentes = new Set(lista.map((c) => String(c.key)));
  const visiveis = new Set(lista.map((c) => String(c.key)));

  for (let passada = 0; passada <= lista.length; passada++) {
    let mudou = false;
    for (const campo of lista) {
      const key = String(campo.key);
      if (!visiveis.has(key)) continue;
      const cond = condicaoDe(campo);
      if (!cond) continue;
      if (!existentes.has(cond.key)) continue;
      const maeVisivel = visiveis.has(cond.key);
      const marcadas = maeVisivel ? respostasDe(respostas[cond.key]) : [];
      const casa = marcadas.some((m) => cond.valores.includes(m));
      if (!casa) { visiveis.delete(key); mudou = true; }
    }
    if (!mudou) break;
  }
  return visiveis;
}

export function camposVisiveis(campos, respostas = {}) {
  const vis = keysVisiveis(campos, respostas);
  return (Array.isArray(campos) ? campos : []).filter((c) => c && c.key && vis.has(String(c.key)));
}

export function campoVisivel(campos, key, respostas = {}) {
  return keysVisiveis(campos, respostas).has(String(key));
}
