#!/usr/bin/env node
// ============================================================================
// Faxina · pares da fila que HOJE não têm sinal nenhum (2026-08-18)
//
// Autorizado pelo Marcos: "pode apagar esses matches então, pois não são a mesma
// pessoa."
//
// O QUE SÃO
// Pares que sobraram de réguas antigas: recalculando `pontuarPar` com os perfis
// de hoje o score dá **0** — nenhuma evidência, nenhum sinal em comum. Eles
// apareceram no relatório do re-score de 17/08 como "ficariam menores", e foram
// PRESERVADOS lá porque aquele script só sobe nota (o bônus de ponte é um evento
// não reconstruível). Aqui é o oposto: são os que não sustentam mais nada.
//
// Medidos em 17/08, os três:
//   CELIA DE OLIVEIRA MELLO × ANA PAULA BENETTI                   35 → 0
//   CELIA DE OLIVEIRA MELLO × Raphaela Cristina de Pinho Fernandes 35 → 0
//   Carlos Henrique Machado × CARLOS ALBERTO SILVA GAGO            35 → 0
//
// ⚠️ Os dois primeiros são as PONTES que contaminavam o grupo de 4 que o Marcos
// viu ("CELIA | ANA PAULA | Raphaela | Célia"): é por elas que gente diferente
// entrava no mesmo componente conexo por transitividade.
//
// ⚠️ APAGAR aqui é diferente de apagar em `mem_membros`: `mem_identidade_pares` é
// FILA MATERIALIZADA, derivada de observações — não é dado de pessoa, e a pessoa
// continua intacta nos dois lados. Se um sinal novo aparecer amanhã, o motor
// recria o par, e isso é o comportamento certo: evidência nova merece um olhar
// novo.
//
// ⚠️ Guarda dupla: só apaga quando o recálculo dá **0** E não há CPF em comum. A
// segunda é redundante (CPF em comum daria +100), e existe de propósito — se um
// dia o cálculo mudar, ela impede a faxina de encostar num par com a chave mais
// forte que existe.
//
// COMO RODAR
//   node backend/scripts/_faxina_pares_sem_sinal.cjs          (dry-run)
//   node backend/scripts/_faxina_pares_sem_sinal.cjs --exec   (apaga)
// Backup em ~/Downloads antes de apagar, com nome único por execução.
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
const digits = (v) => String(v || '').replace(/\D/g, '');

async function todas(tabela, select) {
  let off = 0; const acc = [];
  for (;;) {
    const { data, error } = await sb.from(tabela).select(select).range(off, off + 999);
    if (error) throw new Error(`${tabela}: ${error.message}`);
    acc.push(...(data || []));
    if (!data || data.length < 1000) break;
    off += 1000;
  }
  return acc;
}

(async () => {
  console.log(`\n=== Faxina dos pares sem sinal · ${EXEC ? 'EXECUÇÃO' : 'DRY-RUN'} ===\n`);

  const pares = await todas('mem_identidade_pares', 'membro_a_id, membro_b_id, score, prioridade, evidencias, contradicoes');
  const ids = [...new Set(pares.flatMap((p) => [p.membro_a_id, p.membro_b_id]).filter(Boolean))];
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
  console.log(`pares na fila: ${pares.length} · cadastros: ${membros.size}`);

  const apagar = []; const comCpf = []; const ficam = [];
  for (const p of pares) {
    const ma = membros.get(p.membro_a_id); const mb = membros.get(p.membro_b_id);
    if (!ma || !mb || ma.deleted_at || mb.deleted_at) { ficam.push(p); continue; }
    const novo = pontuarPar(perfil(ma, obsPor.get(ma.id) || []), perfil(mb, obsPor.get(mb.id) || []));
    if (novo.score !== 0) { ficam.push(p); continue; }
    const ca = digits(ma.cpf); const cb = digits(mb.cpf);
    if (ca.length === 11 && ca === cb) { comCpf.push({ p, ma, mb }); continue; }
    apagar.push({ p, ma, mb, novo });
  }

  console.log(`\n── O que o script vai fazer ──`);
  console.log(`  apagar (recálculo dá 0 e sem CPF em comum): ${apagar.length}`);
  console.log(`\n── O que o script NÃO toca ──`);
  console.log(`  pares que ainda têm sinal:                  ${ficam.length}`);
  console.log(`  score 0 mas com CPF em comum (nunca apagar): ${comCpf.length}`);

  for (const a of apagar) {
    console.log(`\n  ${a.ma.nome} × ${a.mb.nome}`);
    console.log(`    hoje na fila: score ${a.p.score} (${a.p.prioridade}) ${JSON.stringify(a.p.evidencias)}`);
    console.log(`    recálculo:    score ${a.novo.score} ${JSON.stringify(a.novo.evidencias)}`);
  }
  for (const c of comCpf) console.log(`\n  ⚠️ PRESERVADO (CPF em comum): ${c.ma.nome} × ${c.mb.nome}`);

  if (!EXEC) {
    console.log(`\n(dry-run · nada foi apagado. Rode com --exec para aplicar.)\n`);
    return;
  }

  const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '');
  const destino = path.join(os.homedir(), 'Downloads', `_bk_${stamp}_pares_sem_sinal.json`);
  fs.writeFileSync(destino, JSON.stringify({
    gerado_em: new Date().toISOString(),
    // Guarda a linha INTEIRA: sem isso não há como recriar o par se a decisão mudar.
    apagados: apagar.map((a) => ({ ...a.p, nomes: `${a.ma.nome} × ${a.mb.nome}` })),
  }, null, 2), 'utf8');
  console.log(`\nbackup: ${destino}`);

  let ok = 0; const erros = [];
  for (const a of apagar) {
    // A chave é o PAR (a tabela não tem coluna `id`).
    const { error } = await sb.from('mem_identidade_pares').delete()
      .eq('membro_a_id', a.p.membro_a_id).eq('membro_b_id', a.p.membro_b_id);
    if (error) erros.push(`${a.ma.nome} × ${a.mb.nome}: ${error.message}`);
    else ok += 1;
  }

  console.log(`\n── Resultado ──`);
  console.log(`  pares apagados: ${ok} de ${apagar.length}`);
  if (erros.length) {
    console.log(`  ⚠️ ${erros.length} erro(s):`);
    for (const e of erros) console.log(`     ${e}`);
  }
  console.log(`\n  ⚠️ Se um sinal novo ligar os dois lados, o motor recria o par — é o correto.\n`);
})().catch((e) => { console.error('\nFALHOU:', e.message, '\n'); process.exit(1); });
