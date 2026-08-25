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

/**
 * `{ [grupoId]: 'YYYY-MM-DD' }` — de quando a contagem do grupo COMEÇA, pra a
 * cadência não-semanal poder ser derivada quando não há encontro registrado.
 *
 * ⚠️⚠️ Existe por decisão do Marcos (25/08/2026): *"os encontros de grupos
 * quinzenais ou mensais devem aparecer na aba de encontros — todas as datas que
 * os grupos deveriam ter feito o encontro."* Sem isto, aqueles grupos ficavam
 * com histórico permanentemente VAZIO, porque a régua exigia âncora real.
 *
 * ⚠️ MEDIDO em 25/08/2026: dos 108 grupos ativos, **35 são não-semanais** e
 * apenas **1 deles** tem encontro registrado. Ou seja: sem âncora era o caso
 * NORMAL (34 de 35), não a exceção. Todos os 35 têm `temporada` e `dia_semana`
 * preenchidos, então a derivação alcança todos.
 *
 * Precedência: início da TEMPORADA do grupo → criação do grupo. A temporada é a
 * resposta certa (é o ciclo em que o grupo se reúne); `created_at` é a rede pra
 * grupo sem temporada, que hoje não existe entre os ativos mas pode existir.
 *
 * ⚠️ Best-effort: sem isto a aba volta ao comportamento de antes (histórico
 * vazio no não-semanal), nunca derruba a tela.
 */
async function iniciosDeGrupos(ids) {
  const out = {};
  if (!ids || !ids.length) return out;
  try {
    const grupos = [];
    for (let i = 0; i < ids.length; i += 200) {
      const { data, error } = await supabase.from('mem_grupos')
        .select('id, temporada, created_at').in('id', ids.slice(i, i + 200));
      if (error) throw error;
      grupos.push(...(data || []));
    }
    const tempIds = [...new Set(grupos.map(g => g.temporada).filter(Boolean))];
    const inicioTemp = {};
    for (let i = 0; i < tempIds.length; i += 200) {
      const { data } = await supabase.from('mem_temporadas')
        .select('id, data_inicio').in('id', tempIds.slice(i, i + 200));
      (data || []).forEach(t => { if (t.data_inicio) inicioTemp[t.id] = String(t.data_inicio).slice(0, 10); });
    }
    for (const g of grupos) {
      const ini = (g.temporada && inicioTemp[g.temporada])
        || (g.created_at ? String(g.created_at).slice(0, 10) : null);
      if (ini) out[g.id] = ini;
    }
  } catch (e) { console.warn('[grupoAncora] inicio de grupo indisponivel:', e.message); }
  return out;
}

module.exports = { ancorasDeGrupos, iniciosDeGrupos };
