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
  const janelas = await janelasDeGrupos(ids);
  const out = {};
  for (const [id, j] of Object.entries(janelas)) if (j.inicio) out[id] = j.inicio;
  return out;
}

/**
 * `{ [grupoId]: { inicio, fim } }` — a JANELA da temporada do grupo.
 *
 * ⚠️⚠️ Existe por decisão do Marcos (28/08/2026): *"a temporada de grupos abriu
 * 02/08, nenhum grupo reuniu antes disso; coloque essa contagem para abrir junto
 * com a temporada e fechar junto com ela também."*
 *
 * O PISO já valia (`iniciosDeGrupos`, 25/08). O que faltava era o TETO: medido
 * no grupo da Mariana, a T2 termina em **31/12/2026** e a agenda oferecia
 * encontros em **16/01, 13/02 e 13/03 de 2027** — um ciclo que ninguém decidiu
 * que existe. E, no passado, grupo de temporada ENCERRADA seguiria acumulando
 * "presença não registrada" para sempre.
 *
 * Precedência do início: temporada → `created_at` (rede pra grupo sem
 * temporada). O FIM não tem rede: sem temporada não há teto, e inventar um
 * esconderia agenda legítima.
 *
 * ⚠️ Best-effort: falha devolve `{}` e as duas réguas voltam ao comportamento
 * de antes (sem piso e sem teto), nunca derrubam a tela.
 */
async function janelasDeGrupos(ids) {
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
    const temp = {};
    for (let i = 0; i < tempIds.length; i += 200) {
      const { data } = await supabase.from('mem_temporadas')
        .select('id, data_inicio, data_fim').in('id', tempIds.slice(i, i + 200));
      (data || []).forEach(t => {
        temp[t.id] = {
          inicio: t.data_inicio ? String(t.data_inicio).slice(0, 10) : null,
          fim: t.data_fim ? String(t.data_fim).slice(0, 10) : null,
        };
      });
    }
    for (const g of grupos) {
      const t = (g.temporada && temp[g.temporada]) || null;
      const inicio = t?.inicio || (g.created_at ? String(g.created_at).slice(0, 10) : null);
      // ⚠️ O fim vem SÓ da temporada: `created_at` não diz nada sobre quando o
      // ciclo acaba, e chutar um teto esconderia agenda legítima.
      const fim = t?.fim || null;
      if (inicio || fim) out[g.id] = { inicio, fim };
    }
  } catch (e) { console.warn('[grupoAncora] inicio de grupo indisponivel:', e.message); }
  return out;
}

module.exports = { ancorasDeGrupos, iniciosDeGrupos, janelasDeGrupos };
