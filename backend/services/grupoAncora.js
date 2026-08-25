// ============================================================================
// ÂNCORA DA CADÊNCIA do grupo · régua ÚNICA
//
// ⚠️⚠️ Quinzenal e mensal NÃO se derivam de `dia_semana` sozinho: "de 14 em 14
// às terças" não diz EM QUAL terça. A única evidência no banco é o último
// encontro REALIZADO (`mem_grupo_encontros`) — e medido em 18/08/2026, **36 dos
// 37 grupos não-semanais nunca registraram um**. Sem âncora, a régua de agenda
// (`utils/agendaGrupo`) devolve UMA ocorrência marcada como incerta pra frente e
// **nada** pra trás, em vez de listar uma agenda inteira que é palpite.
//
// ⚠️ Extraído de `routes/app.js` em 25/08/2026, quando o ERP passou a precisar da
// MESMA âncora pro card de "encontros sem chamada". Duas cópias divergiriam no
// primeiro ajuste, e o sintoma seria o app e o web discordando sobre em que
// semana um grupo quinzenal se reuniu — praticamente indepurável.
//
// ⚠️ Best-effort: falhar aqui não pode derrubar a tela do grupo. Devolve `{}` e
// quem chama trata como "sem âncora".
// ============================================================================
const { supabase } = require('../utils/supabase');

/** `{ [grupoId]: 'YYYY-MM-DD' }` — o encontro REALIZADO mais recente de cada grupo. */
async function ancorasDeGrupos(ids) {
  const out = {};
  if (!ids || !ids.length) return out;
  try {
    // `.in()` em lotes de 200: lista longa estoura a URL do PostgREST.
    for (let i = 0; i < ids.length; i += 200) {
      const { data, error } = await supabase.from('mem_grupo_encontros')
        .select('grupo_id, data').in('grupo_id', ids.slice(i, i + 200))
        .order('data', { ascending: false });
      if (error) throw error;
      // O primeiro que aparece por grupo é o mais recente (ordem desc).
      for (const e of data || []) if (e.data && !out[e.grupo_id]) out[e.grupo_id] = String(e.data).slice(0, 10);
    }
  } catch (e) { console.warn('[grupoAncora] ancora de agenda indisponivel:', e.message); }
  return out;
}

module.exports = { ancorasDeGrupos };
