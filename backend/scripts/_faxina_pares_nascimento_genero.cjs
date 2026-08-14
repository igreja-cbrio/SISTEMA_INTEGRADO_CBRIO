#!/usr/bin/env node
/**
 * Faxina da fila de duplicidades: tira os pares que a régua de 2026-08-14 não
 * criaria mais — nascimento igual SOZINHO e gênero divergente sem CPF em comum.
 *
 * ⚠️ NÃO re-pontua a fila. O bônus de "ponte" (+35) foi um EVENTO (a observação
 * que conectou os dois cadastros) e não se reconstrói; recalcular sem ele
 * rebaixaria par BOM em silêncio — por exemplo os `quase_confirmado` de
 * Fernanda/Valéria/Christiana, que a fila progressiva acerta e a política legada
 * erraria. Então aqui aplicamos só os DOIS predicados que mudaram, e o resto da
 * fila fica byte-idêntico.
 *
 * ⚠️ Apagar linha de `mem_identidade_pares` é seguro por construção: a tabela é
 * "materialização incremental derivada das observações" (COMMENT da
 * 20260718190000) e o próprio `merge_membros` a apaga antes de repontar. Se um
 * sinal de verdade aparecer depois, o par volta sozinho na próxima observação.
 * Não toca em `mem_duplicados_ignorados` nem em `entradas_pares_adiados`.
 *
 * ⚠️ RESÍDUO DECLARADO (não é exato, e não dá pra ser): sem a observação-ponte
 * original não há como afirmar que a régua nova jamais recriaria um par de
 * "só nascimento". Existe um caminho estreito em que ela recria — bônus de ponte
 * com CPF de um lado e nome do outro — e ali o par volta como **descoberta (35)**,
 * nunca como a **alta (70)** que a soma 35+35 produzia. Ou seja: o que esta
 * faxina tira do topo da fila não voltaria pro topo. E como a tabela é derivada,
 * a próxima observação daquelas pessoas reconstrói o que for legítimo.
 *
 * Uso:
 *   node backend/scripts/_faxina_pares_nascimento_genero.cjs           # dry-run
 *   node backend/scripts/_faxina_pares_nascimento_genero.cjs --exec    # aplica
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { supabase } = require('../utils/supabase');
const { perfil, similaridadeNome, sexoCanonico } = require('../services/identidadeProgressiva');

const EXEC = process.argv.includes('--exec');
const COLS_MEMBRO = 'id,nome,cpf,telefone,email,data_nascimento,genero';

(async () => {
  // Paginado: o cap de 1000 do PostgREST trunca em SILÊNCIO, e faxina que só vê
  // as 1000 primeiras linhas relata "limpei tudo" tendo deixado o resto.
  const pares = [];
  for (let off = 0; ; off += 1000) {
    const { data, error } = await supabase.from('mem_identidade_pares')
      .select('membro_a_id,membro_b_id,score,prioridade,evidencias,contradicoes,fontes,ultima_evidencia_em')
      .order('membro_a_id', { ascending: true }).order('membro_b_id', { ascending: true })
      .range(off, off + 999);
    if (error) throw new Error(`mem_identidade_pares: ${error.message}`);
    pares.push(...data);
    if (data.length < 1000) break;
  }
  console.log(`pares na fila: ${pares.length}`);

  const ids = [...new Set(pares.flatMap((p) => [p.membro_a_id, p.membro_b_id]))];
  const membros = new Map();
  for (let i = 0; i < ids.length; i += 150) {
    const { data, error } = await supabase.from('mem_membros')
      .select(COLS_MEMBRO).in('id', ids.slice(i, i + 150)).is('deleted_at', null);
    if (error) throw new Error(`mem_membros: ${error.message}`);
    for (const m of data || []) membros.set(m.id, m);
  }

  // Observações por membro — o perfil da fila é membro + histórico das portas,
  // e decidir sobre o retrato atual daria veredito diferente do que a tela mostra.
  const obsPorMembro = new Map();
  for (let i = 0; i < ids.length; i += 100) {
    const { data, error } = await supabase.from('mem_identidade_observacoes')
      .select('membro_id,origem,nome,nome_normalizado,cpf,telefone,email,data_nascimento')
      .in('membro_id', ids.slice(i, i + 100)).limit(5000);
    if (error) throw new Error(`observacoes: ${error.message}`);
    for (const o of data || []) {
      if (!obsPorMembro.has(o.membro_id)) obsPorMembro.set(o.membro_id, []);
      obsPorMembro.get(o.membro_id).push(o);
    }
  }

  const paraApagar = [];
  const mantidos = [];
  for (const p of pares) {
    const ma = membros.get(p.membro_a_id);
    const mb = membros.get(p.membro_b_id);
    // Lado apagado/soft-deletado: a fila já não exibe (o carregador filtra), mas
    // a linha fica pendurada. Não é o alvo desta faxina — não mexer.
    if (!ma || !mb) { mantidos.push({ ...p, motivo_mantido: 'um dos lados não está vivo' }); continue; }

    const a = perfil(ma, obsPorMembro.get(ma.id) || []);
    const b = perfil(mb, obsPorMembro.get(mb.id) || []);
    const inter = (x, y) => [...x].filter((v) => y.has(v)).length > 0;
    const cpfComum = inter(a.cpfs, b.cpfs);
    const telComum = inter(a.telefones, b.telefones);
    const emailComum = inter(a.emails, b.emails);
    const nascComum = inter(a.nascimentos, b.nascimentos);
    let melhorNome = 0;
    for (const na of a.nomes) for (const nb of b.nomes) melhorNome = Math.max(melhorNome, similaridadeNome(na, nb));
    const outroSinal = cpfComum || telComum || emailComum || melhorNome >= 0.82;
    const generoConflitante = a.generos.size > 0 && b.generos.size > 0 && !inter(a.generos, b.generos);

    // ⚠️⚠️ O escopo é EXATAMENTE as duas regras que mudaram — nada além.
    // Em particular NÃO apagar par "sem nenhum sinal verificável em comum": esse
    // é o caso-INSÍGNIA do motor, o par que existe porque um cadastro NOVO fez a
    // PONTE entre os dois (A tem o CPF, B tem telefone+nome, e a observação nova
    // tem os três). A régua nova continua criando esse par, então apagá-lo seria
    // desfazer trabalho legítimo — e é justamente o cenário do 1º caso do
    // `identidadeProgressiva.test.js`.
    let motivo = null;
    if (generoConflitante && !cpfComum) motivo = 'gênero divergente sem CPF em comum';
    else if (nascComum && !outroSinal) motivo = 'só o nascimento em comum';

    if (motivo) {
      paraApagar.push({
        ...p, motivo,
        a: { id: ma.id, nome: ma.nome, nasc: ma.data_nascimento, genero: sexoCanonico(ma.genero) },
        b: { id: mb.id, nome: mb.nome, nasc: mb.data_nascimento, genero: sexoCanonico(mb.genero) },
        sim_nome: Number(melhorNome.toFixed(2)),
      });
    } else {
      mantidos.push({ membro_a_id: p.membro_a_id, membro_b_id: p.membro_b_id, score: p.score, prioridade: p.prioridade });
    }
  }

  console.log(`\npares que a régua nova NÃO criaria: ${paraApagar.length}`);
  const porMotivo = {};
  const porPrio = {};
  for (const p of paraApagar) {
    porMotivo[p.motivo] = (porMotivo[p.motivo] || 0) + 1;
    porPrio[p.prioridade] = (porPrio[p.prioridade] || 0) + 1;
  }
  console.log('  por motivo:', JSON.stringify(porMotivo));
  console.log('  por prioridade exibida hoje:', JSON.stringify(porPrio));
  console.log(`pares MANTIDOS (score e prioridade intocados): ${mantidos.length}`);

  console.log('\n-- os de prioridade alta/quase_confirmado que saem --');
  for (const p of paraApagar.filter((x) => ['alta', 'quase_confirmado'].includes(x.prioridade))) {
    console.log(`  [${p.prioridade} ${p.score}] ${String(p.a.nome).slice(0, 30).padEnd(30)} × ${String(p.b.nome).slice(0, 30).padEnd(30)} | ${p.motivo} | nasc ${p.a.nasc} | simNome ${p.sim_nome} | gen ${p.a.genero || '?'}/${p.b.genero || '?'}`);
  }

  if (!paraApagar.length) { console.log('\nnada a fazer.'); return; }

  const arquivo = path.join(os.homedir(), 'Downloads', `_bk_${new Date().toISOString().slice(0, 10).replace(/-/g, '')}_pares_nascimento_genero.json`);
  fs.writeFileSync(arquivo, JSON.stringify({ apagados: paraApagar, mantidos_total: mantidos.length }, null, 1));
  console.log(`\nbackup: ${arquivo}`);

  if (!EXEC) {
    console.log('\n(dry-run — rode com --exec pra apagar)');
    return;
  }

  let ok = 0;
  const falhas = [];
  for (const p of paraApagar) {
    const { error } = await supabase.from('mem_identidade_pares').delete()
      .eq('membro_a_id', p.membro_a_id).eq('membro_b_id', p.membro_b_id);
    if (error) falhas.push({ par: `${p.membro_a_id}/${p.membro_b_id}`, erro: error.message });
    else ok += 1;
  }
  console.log(`\napagados: ${ok} de ${paraApagar.length}`);
  if (falhas.length) {
    console.log(`falhas: ${falhas.length}`);
    for (const f of falhas.slice(0, 10)) console.log('  ' + JSON.stringify(f));
  }
})().catch((e) => { console.error('ERRO:', e.message); process.exitCode = 1; });
