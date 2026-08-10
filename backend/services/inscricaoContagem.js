// ============================================================================
// CONTAGEM DE INSCRITOS POR EVENTO · leitor único (2026-08-10)
//
// ⚠️⚠️ EXISTE PORQUE O EMBED `inscricoes(count)` DO POSTGREST NÃO FILTRA
// SOFT-DELETE. Reportado pelo Matheus: o card da série RETIRO dizia
// **"14 no total"** e o detalhe do mesmo evento dizia **0** — as 14 inscrições
// eram testes dele, TODAS com `deleted_at` preenchido. O detalhe estava certo
// (usa `contadoresEvento`, que faz COUNT com `.is('deleted_at', null)`); quem
// contava linha apagada era o card. O Celebra 2026 também estava inflado:
// 201 exibido contra 200 vivas.
//
// ⚠️ Filtro em recurso EMBUTIDO foi descartado de propósito: não deu pra
// verificar, neste ambiente, se o `count` de um embed respeita filtro do embed
// — e contagem que a liderança lê pra decidir não pode depender de suposição
// sobre o comportamento do PostgREST. Aqui a contagem é explícita.
//
// ⚠️ A RÉGUA É A MESMA do `contadoresEvento.inscritos` (linhas VIVAS, cancelada
// inclusa) — é isso que faz card e detalhe passarem a bater. Excluir cancelada
// só aqui recriaria, do outro lado, a divergência que este arquivo fecha.
// Se algum dia a igreja decidir que cancelada não conta, muda nos DOIS.
// ============================================================================

/** Cap server-side do PostgREST: ler sem paginar TRUNCA em silêncio. */
const PAGINA = 1000;
/** `.in()` com lista longa estoura a URL do PostgREST. */
const LOTE_IDS = 200;

/**
 * Quantas inscrições VIVAS cada evento tem.
 * @param {object} db cliente supabase (injetado — é o que torna isto testável)
 * @param {string[]} eventoIds
 * @returns {Promise<Map<string, number>>} id do evento → contagem
 */
async function contarInscritosVivos(db, eventoIds) {
  const contagem = new Map();
  const ids = [...new Set((eventoIds || []).filter(Boolean))];
  if (!ids.length) return contagem;

  for (let i = 0; i < ids.length; i += LOTE_IDS) {
    const lote = ids.slice(i, i + LOTE_IDS);
    for (let off = 0; ; off += PAGINA) {
      // Só `evento_id`: a contagem não precisa de PII nenhuma.
      const { data, error } = await db.from('inscricoes')
        .select('evento_id')
        .in('evento_id', lote)
        .is('deleted_at', null)
        .range(off, off + PAGINA - 1);
      if (error) throw error;
      for (const r of (data || [])) {
        contagem.set(r.evento_id, (contagem.get(r.evento_id) || 0) + 1);
      }
      if (!data || data.length < PAGINA) break;
    }
  }
  return contagem;
}

module.exports = { contarInscritosVivos, PAGINA, LOTE_IDS };
