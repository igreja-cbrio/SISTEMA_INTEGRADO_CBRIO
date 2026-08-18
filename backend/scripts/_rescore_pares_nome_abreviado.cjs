#!/usr/bin/env node
// ============================================================================
// Re-score da fila de duplicidades depois da régua do nome abreviado (2026-08-17)
//
// `mem_identidade_pares` é MATERIALIZADA: o score foi calculado quando o par
// nasceu. A régua nova (nome contido vale 25) só vale pra par novo — os
// existentes seguem com a nota antiga até uma observação tocá-los. Foi o que
// deixou o par da Andrea Palladino em 30/`descoberta` mesmo com o conserto no ar.
//
// ⚠️⚠️ SÓ SOBE, NUNCA DESCE. O bônus de PONTE (+35) é um EVENTO — ele depende da
// observação que ligou os dois lados no momento em que chegou, e nem sempre é
// reconstruível a partir dos perfis de hoje. Recalcular e gravar um score MENOR
// apagaria evidência que o motor viu e eu não consigo reproduzir. Por isso o
// UPDATE é condicionado a `novo > atual` — a régua nova só acrescenta.
//
// ⚠️ Não cria par nenhum. Par que nunca existiu (porque nunca houve observação
// ligando os dois) continua não existindo — a fila é incremental por desenho, e
// varrer a base inteira por nome é o que a fila LEGADA (`GET /duplicados`) faz.
// Caso real: "Andreia Palladino" (15/05, sem telefone/e-mail/CPF/nascimento) não
// forma par com ninguém, e nada aqui muda isso.
//
// COMO RODAR
//   node backend/scripts/_rescore_pares_nome_abreviado.cjs          (dry-run)
//   node backend/scripts/_rescore_pares_nome_abreviado.cjs --exec   (aplica)
// Backup em ~/Downloads antes de escrever, com nome único por execução.
// ============================================================================
const path = require('path');
const fs = require('fs');
const os = require('os');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { createClient } = require('@supabase/supabase-js');
const { perfil, pontuarPar } = require('../services/identidadeProgressiva');

const EXEC = process.argv.includes('--exec');
const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Faltam SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY no backend/.env');
  process.exit(1);
}
const sb = createClient(url, key, { auth: { persistSession: false } });

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

(async () => {
  console.log(`\n=== Re-score da fila (nome abreviado) · ${EXEC ? 'EXECUÇÃO' : 'DRY-RUN'} ===\n`);

  // ⚠️ A tabela NÃO tem coluna `id`: a chave é o PAR (membro_a_id, membro_b_id).
  const pares = await todas('mem_identidade_pares', 'membro_a_id, membro_b_id, score, prioridade, evidencias, contradicoes');
  const ids = [...new Set(pares.flatMap((p) => [p.membro_a_id, p.membro_b_id]).filter(Boolean))];
  console.log(`pares na fila: ${pares.length} · cadastros envolvidos: ${ids.length}`);

  // ⚠️ `.in()` em lotes de 200: lista grande estoura a URL do PostgREST.
  const membros = new Map();
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await sb.from('mem_membros')
      .select('id, nome, cpf, telefone, email, data_nascimento, genero, deleted_at')
      .in('id', ids.slice(i, i + 200));
    if (error) throw new Error(`mem_membros: ${error.message}`);
    for (const m of data || []) membros.set(m.id, m);
  }
  const obsPor = new Map();
  for (let i = 0; i < ids.length; i += 100) {
    const { data, error } = await sb.from('mem_identidade_observacoes')
      .select('membro_id, origem, nome, nome_normalizado, cpf, telefone, email, data_nascimento, observado_em')
      .in('membro_id', ids.slice(i, i + 100));
    if (error) throw new Error(`observacoes: ${error.message}`);
    for (const o of data || []) {
      if (!obsPor.has(o.membro_id)) obsPor.set(o.membro_id, []);
      obsPor.get(o.membro_id).push(o);
    }
  }

  const sobem = []; const descem = []; const iguais = [];
  for (const p of pares) {
    const ma = membros.get(p.membro_a_id); const mb = membros.get(p.membro_b_id);
    if (!ma || !mb || ma.deleted_at || mb.deleted_at) continue;   // par de cadastro morto: não é assunto daqui
    const novo = pontuarPar(
      perfil(ma, obsPor.get(ma.id) || []),
      perfil(mb, obsPor.get(mb.id) || []),
    );
    const linha = { p, ma, mb, novo };
    if (novo.score > p.score) sobem.push(linha);
    else if (novo.score < p.score) descem.push(linha);
    else iguais.push(linha);
  }

  console.log(`\n── O que muda ──`);
  console.log(`  pares que SOBEM (a régua nova acrescenta):     ${sobem.length}`);
  console.log(`\n── O que o script NÃO toca ──`);
  console.log(`  pares que ficariam MENORES (bônus de ponte não reconstruível): ${descem.length}`);
  console.log(`  pares sem mudança:                                            ${iguais.length}`);

  const mudouPrioridade = sobem.filter((l) => l.novo.prioridade !== l.p.prioridade);
  console.log(`\n  desses, mudam de PRIORIDADE (é o que muda a ordem da fila): ${mudouPrioridade.length}`);
  for (const l of sobem.slice(0, 25)) {
    const seta = l.novo.prioridade !== l.p.prioridade ? `${l.p.prioridade} → ${l.novo.prioridade}` : l.p.prioridade;
    console.log(`    ${String(l.p.score).padStart(3)} → ${String(l.novo.score).padStart(3)}  ${seta.padEnd(28)} ${l.ma.nome} × ${l.mb.nome}`);
  }
  if (sobem.length > 25) console.log(`    … e outros ${sobem.length - 25}`);

  if (descem.length) {
    console.log(`\n  ⚠️ os que ficariam menores (preservados como estão):`);
    for (const l of descem.slice(0, 10)) console.log(`    ${l.p.score} → ${l.novo.score}  ${l.ma.nome} × ${l.mb.nome}`);
  }

  if (!EXEC) {
    console.log(`\n(dry-run · nada foi escrito. Rode com --exec para aplicar.)\n`);
    return;
  }

  const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '');
  const destino = path.join(os.homedir(), 'Downloads', `_bk_${stamp}_rescore_pares.json`);
  fs.writeFileSync(destino, JSON.stringify({
    gerado_em: new Date().toISOString(),
    antes: sobem.map((l) => ({
      membro_a_id: l.p.membro_a_id, membro_b_id: l.p.membro_b_id,
      nomes: `${l.ma.nome} × ${l.mb.nome}`,
      score: l.p.score, prioridade: l.p.prioridade, evidencias: l.p.evidencias, contradicoes: l.p.contradicoes,
    })),
  }, null, 2), 'utf8');
  console.log(`\nbackup: ${destino}`);

  let ok = 0; const erros = [];
  for (const l of sobem) {
    // ⚠️ `.lt('score', novo)` é a guarda de corrida: se o motor recalculou o par
    // para um valor maior entre a leitura e agora, o dele fica.
    const { data, error } = await sb.from('mem_identidade_pares').update({
      score: l.novo.score,
      prioridade: l.novo.prioridade,
      evidencias: l.novo.evidencias,
      contradicoes: l.novo.contradicoes,
      // ⚠️ `atualizado_em` NÃO é tocado de propósito: ele significa "chegou
      // evidência nova", e isto é um RE-SCORE da régua. Mexer nele faria a fila
      // mentir sobre quando o par foi visto pela última vez.
    }).eq('membro_a_id', l.p.membro_a_id).eq('membro_b_id', l.p.membro_b_id)
      .lt('score', l.novo.score).select('membro_a_id');
    if (error) { erros.push(`${l.ma.nome} × ${l.mb.nome}: ${error.message}`); continue; }
    if (data && data.length) ok += 1;
  }

  console.log(`\n── Resultado ──`);
  console.log(`  pares re-pontuados: ${ok} de ${sobem.length}`);
  if (erros.length) {
    console.log(`  ⚠️ ${erros.length} erro(s):`);
    for (const e of erros.slice(0, 10)) console.log(`     ${e}`);
  }
  console.log('');
})().catch((e) => { console.error('\nFALHOU:', e.message, '\n'); process.exit(1); });
