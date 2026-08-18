#!/usr/bin/env node
// ============================================================================
// Reparo · devolver ao cadastro o nascimento que a porta OBSERVOU (2026-08-17)
//
// O QUE ISTO CONSERTA
// Até 17/08 o INSERT de `acharOuCriarGuardado` não gravava `data_nascimento`: o
// valor era calculado, usado para DECIDIR identidade e descartado na criação.
// A data não se perdeu — `mem_identidade_observacoes` guarda o que cada porta
// viu. Este script a devolve ao cadastro.
//
// MEDIDO EM PRODUÇÃO (17/08): 62 cadastros VIVOS com nascimento na observação e
// a coluna do cadastro em branco, de 8 portas (54 observados nos 17 dias
// anteriores). Casos que o Marcos pegou: Wesley Barros Ramos (censo ·
// 1955-09-29) e Pedro Moreira Gonçalez (batismo · 2006-10-08).
//
// ⚠️ SÓ-ONDE-VAZIO, com guarda de corrida (`.is('data_nascimento', null)`).
// Sobrescrever data que a equipe corrigiu depois é exatamente o que a política
// do censo proíbe — e aqui seria pior, porque o valor da observação pode ser
// mais antigo que a correção humana.
//
// ⚠️ DIVERGÊNCIA entre observações NÃO é desempate. Se duas portas observaram
// datas diferentes para a mesma pessoa, uma delas está errada (ou são duas
// pessoas fundidas por engano) — escolher "a mais recente" gravaria um erro com
// cara de dado. Esses casos são DECLARADOS e ficam para decisão humana.
//
// ⚠️ Não mexe em `genero`: a observação não tem coluna de sexo. Quem colhe o
// sexo declarado nas portas é o fluxo de 14/08 (`utils/sexoDeclarado.js` +
// "Completar o sexo" na aba Pessoas dos Grupos) — usar aquele caminho, que
// registra a origem do dado.
//
// COMO RODAR
//   node backend/scripts/_reparo_nascimento_da_observacao.cjs          (dry-run)
//   node backend/scripts/_reparo_nascimento_da_observacao.cjs --exec   (aplica)
// Backup em ~/Downloads antes de qualquer escrita, com nome único por execução.
// ============================================================================
const path = require('path');
const fs = require('fs');
const os = require('os');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { createClient } = require('@supabase/supabase-js');

const EXEC = process.argv.includes('--exec');
const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Faltam SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY no backend/.env');
  process.exit(1);
}
const sb = createClient(url, key, { auth: { persistSession: false } });

// Cap de 1000 do PostgREST: leitura de tabela que cresce vai paginada.
async function todas(tabela, select, filtro) {
  let off = 0; const acc = [];
  for (;;) {
    let q = sb.from(tabela).select(select);
    if (filtro) q = filtro(q);
    const { data, error } = await q.range(off, off + 999);
    if (error) throw new Error(`${tabela}: ${error.message}`);
    acc.push(...(data || []));
    if (!data || data.length < 1000) break;
    off += 1000;
  }
  return acc;
}

const dia = (v) => String(v || '').slice(0, 10);

(async () => {
  console.log(`\n=== Reparo do nascimento observado · ${EXEC ? 'EXECUÇÃO' : 'DRY-RUN'} ===\n`);

  const obs = await todas(
    'mem_identidade_observacoes',
    'membro_id, origem, data_nascimento, observado_em',
    (q) => q.not('data_nascimento', 'is', null),
  );
  const membros = await todas('mem_membros', 'id, nome, data_nascimento, deleted_at');
  const vivos = new Map(membros.filter((m) => !m.deleted_at).map((m) => [m.id, m]));
  console.log(`observações com nascimento: ${obs.length} · cadastros vivos: ${vivos.size}`);

  // Agrupa as datas observadas por pessoa (dia, pra não separar por fuso/hora).
  const porMembro = new Map();
  for (const o of obs) {
    if (!o.membro_id || !vivos.has(o.membro_id)) continue;
    const m = vivos.get(o.membro_id);
    if (m.data_nascimento) continue;          // cadastro já tem: não é caso nosso
    if (!porMembro.has(o.membro_id)) porMembro.set(o.membro_id, []);
    porMembro.get(o.membro_id).push(o);
  }

  const aplicar = [];
  const divergentes = [];
  for (const [mid, lista] of porMembro) {
    const datas = [...new Set(lista.map((o) => dia(o.data_nascimento)))];
    if (datas.length > 1) { divergentes.push({ mid, lista, datas }); continue; }
    const escolhida = lista.slice().sort((a, b) => String(a.observado_em) < String(b.observado_em) ? -1 : 1)[0];
    aplicar.push({ mid, nome: vivos.get(mid).nome, nascimento: datas[0], porta: escolhida.origem, observado_em: escolhida.observado_em });
  }

  console.log(`\n── O que o script vai fazer ──`);
  console.log(`  preencher nascimento (cadastro vazio, observação única): ${aplicar.length}`);
  console.log(`\n── O que o script NÃO toca ──`);
  console.log(`  observações DIVERGENTES na mesma pessoa (humano decide):  ${divergentes.length}`);

  const porPorta = {};
  for (const a of aplicar) porPorta[a.porta || '(sem porta)'] = (porPorta[a.porta || '(sem porta)'] || 0) + 1;
  console.log(`  por porta que observou: ${JSON.stringify(porPorta)}`);

  for (const a of aplicar.slice(0, 20)) {
    console.log(`    ${a.nome.padEnd(38).slice(0, 38)} ${a.nascimento}  ${a.porta || '—'}  ${dia(a.observado_em)}`);
  }
  if (aplicar.length > 20) console.log(`    … e outros ${aplicar.length - 20}`);

  for (const d of divergentes) {
    console.log(`\n  ⚠️ DIVERGENTE · ${vivos.get(d.mid).nome}: ${d.datas.join(' × ')}`);
    for (const o of d.lista) console.log(`     ${dia(o.data_nascimento)} observado por ${o.origem} em ${dia(o.observado_em)}`);
    console.log(`     duas portas discordam da data — ou uma está errada, ou são 2 pessoas fundidas por engano.`);
  }

  if (!EXEC) {
    console.log(`\n(dry-run · nada foi escrito. Rode com --exec para aplicar.)\n`);
    return;
  }

  // Nome único por EXECUÇÃO (hora e minuto): nome só de data faz a 2ª rodada do
  // dia sobrescrever o backup da 1ª — aconteceu de verdade em 14/08.
  const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '');
  const destino = path.join(os.homedir(), 'Downloads', `_bk_${stamp}_nascimento_da_observacao.json`);
  fs.writeFileSync(destino, JSON.stringify({
    gerado_em: new Date().toISOString(),
    aplicar,
    divergentes: divergentes.map((d) => ({ membro_id: d.mid, nome: vivos.get(d.mid).nome, datas: d.datas })),
  }, null, 2), 'utf8');
  console.log(`\nbackup: ${destino}`);

  let ok = 0; let semLinha = 0; const erros = [];
  for (const a of aplicar) {
    // ⚠️ `.is('data_nascimento', null)` é a guarda de corrida: se alguém
    // preencheu entre a leitura e agora, 0 linhas e o valor humano fica.
    const { data, error } = await sb.from('mem_membros')
      .update({ data_nascimento: a.nascimento, updated_at: new Date().toISOString() })
      .eq('id', a.mid).is('data_nascimento', null).is('deleted_at', null)
      .select('id');
    if (error) { erros.push(`${a.nome}: ${error.message}`); continue; }
    if (!data || !data.length) { semLinha += 1; continue; }
    ok += 1;
  }

  console.log(`\n── Resultado ──`);
  console.log(`  nascimentos preenchidos:          ${ok}`);
  console.log(`  já preenchidos no meio do caminho: ${semLinha}`);
  if (erros.length) {
    console.log(`\n  ⚠️ ${erros.length} erro(s):`);
    for (const e of erros.slice(0, 20)) console.log(`     ${e}`);
  }
  console.log(`\n  desfazer: os valores anteriores eram NULOS — o backup lista quem foi tocado.\n`);
})().catch((e) => { console.error('\nFALHOU:', e.message, '\n'); process.exit(1); });
