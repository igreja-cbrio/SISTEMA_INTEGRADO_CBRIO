// ============================================================================
// Relatório (SOMENTE LEITURA) de bens agrupados por categoria, pra revisão
// humana + IA de categorização (pedido do usuário 2026-07-31: "reavalie as
// categorias existentes e veja se precisa criar mais ou trocar algum bem mal
// categorizado").
//
// NÃO grava nada — só lê pat_categorias/pat_bens e imprime um relatório
// agrupado por categoria (nomes distintos + contagem), pra facilitar achar
// item fora do lugar sem precisar rolar milhares de linhas repetidas.
//
// Uso: node backend/scripts/_patrimonio_categorias_relatorio.cjs
//      (precisa de backend/.env com SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY)
// ============================================================================
require('dotenv').config();
const { supabase } = require('../utils/supabase');

const pag = async (t, sel, f = (q) => q) => {
  let all = [], off = 0;
  for (;;) {
    const { data, error } = await f(supabase.from(t).select(sel)).range(off, off + 999);
    if (error) throw new Error(t + ': ' + error.message);
    all = all.concat(data || []);
    if (!data || data.length < 1000) break;
    off += 1000;
  }
  return all;
};

async function main() {
  const [categorias, bens] = await Promise.all([
    pag('pat_categorias', 'id, nome, pai_id, vida_util_meses'),
    pag('pat_bens', 'id, nome, categoria_id, status', (q) => q.order('nome')),
  ]);

  const catById = new Map(categorias.map((c) => [c.id, c]));
  const porCategoria = new Map(); // categoria_id|'__sem__' -> Map(nomeNorm -> {nome, count})

  for (const b of bens) {
    const chave = b.categoria_id || '__sem__';
    if (!porCategoria.has(chave)) porCategoria.set(chave, new Map());
    const grupo = porCategoria.get(chave);
    const norm = (b.nome || '(sem nome)').trim();
    const atual = grupo.get(norm.toLowerCase()) || { nome: norm, count: 0 };
    atual.count += 1;
    grupo.set(norm.toLowerCase(), atual);
  }

  console.log(`\n=== RESUMO: ${categorias.length} categorias cadastradas · ${bens.length} bens no total ===\n`);

  // Categorias SEM nenhum bem (candidatas a remover/consolidar)
  const vazias = categorias.filter((c) => !porCategoria.has(c.id));
  if (vazias.length) {
    console.log(`Categorias SEM bens (${vazias.length}): ${vazias.map((c) => c.nome).join(', ')}\n`);
  }

  // Ordena categorias por quantidade de bens (maior primeiro), "sem categoria" por último
  const chaves = [...porCategoria.keys()].sort((a, b) => {
    if (a === '__sem__') return 1;
    if (b === '__sem__') return -1;
    const totalA = [...porCategoria.get(a).values()].reduce((s, v) => s + v.count, 0);
    const totalB = [...porCategoria.get(b).values()].reduce((s, v) => s + v.count, 0);
    return totalB - totalA;
  });

  for (const chave of chaves) {
    const cat = chave === '__sem__' ? null : catById.get(chave);
    const grupo = porCategoria.get(chave);
    const totalBens = [...grupo.values()].reduce((s, v) => s + v.count, 0);
    const nomeCat = cat ? cat.nome : 'SEM CATEGORIA';
    const vidaUtil = cat?.vida_util_meses ? ` · vida útil ${cat.vida_util_meses}m` : '';
    console.log(`\n=== ${nomeCat} — ${totalBens} bens, ${grupo.size} nomes distintos${vidaUtil} ===`);
    const linhas = [...grupo.values()].sort((a, b) => b.count - a.count || a.nome.localeCompare(b.nome, 'pt-BR'));
    for (const l of linhas) {
      console.log(`  ${String(l.count).padStart(4)}x  ${l.nome}`);
    }
  }

  console.log('\n=== FIM DO RELATÓRIO ===\n');
}

main().catch((e) => { console.error('Erro:', e.message); process.exit(1); });
