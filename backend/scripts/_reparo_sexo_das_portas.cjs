#!/usr/bin/env node
// ============================================================================
// Reparo · o sexo que a PORTA guardou e o cadastro não tem (2026-08-18)
//
// Pergunta do Marcos: "estou vendo locais que resolvemos os cadastros vindo aqui
// para o módulo de entradas com dados a menos... faça uma varredura completa."
//
// A varredura achou a causa-raiz SISTÊMICA: `genero` **nunca foi parâmetro do
// funil canônico** até 17/08. As portas coletam o sexo (o Contrato de Inscrição
// o exige desde 28/07 e várias respondem 400 sem ele) e o gravam na tabela
// DELAS; o `acharOuCriarGuardado` não tinha por onde recebê-lo, então o cadastro
// nascia sem. A única porta que gravava era a `membresia_aprovacao`, porque ela
// passa o payload inteiro em `extra` — e é justamente a que mede 94-100%.
//
// Consertado no funil (17/08) e nas portas (18/08: batismo, next, app). Este
// script é o PASSADO: devolve ao cadastro o sexo que a porta guardou.
//
// ⚠️ SÓ-ONDE-VAZIO, com guarda de corrida. A equipe pode ter corrigido à mão;
// formulário não sobrescreve correção humana.
//
// ⚠️⚠️ DIVERGÊNCIA NÃO É DESEMPATE. Se duas portas declararam sexos diferentes
// para a mesma pessoa, uma está errada (ou são duas pessoas fundidas por engano)
// — escolher "a mais recente" gravaria um erro com cara de dado. Vai pra decisão
// humana, DECLARADO. Quem decide é `utils/sexoDeclarado.consolidarDeclaracoes`,
// a régua canônica de 14/08 — não uma cópia local.
//
// ⚠️ Registra a origem em `mem_identidade_observacoes` (`sexo_colhido_porta`):
// sem isso, em um ano ninguém distingue o que a pessoa declarou do que foi
// palpite confirmado — e é essa distinção que permite rever a decisão.
//
// COMO RODAR
//   node backend/scripts/_reparo_sexo_das_portas.cjs          (dry-run)
//   node backend/scripts/_reparo_sexo_das_portas.cjs --exec   (aplica)
// ============================================================================
const path = require('path');
const fs = require('fs');
const os = require('os');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { createClient } = require('@supabase/supabase-js');
const { consolidarDeclaracoes } = require('../utils/sexoDeclarado');

const EXEC = process.argv.includes('--exec');
const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Faltam SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY no backend/.env');
  process.exit(1);
}
const sb = createClient(url, key, { auth: { persistSession: false } });

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

// Cada fonte declara a COLUNA e o vocabulário dela. `batismo_inscricoes.sexo` é
// curto (M/F) e `next_matriculas.sexo` é canônico — normalizar é papel do
// `consolidarDeclaracoes`, que aceita as duas formas.
const FONTES = [
  ['batismo_inscricoes', 'membro_id', 'sexo'],
  ['next_matriculas', 'membro_id', 'sexo'],
  ['vol_inscricoes', 'membro_id', 'sexo'],
  ['inscricoes', 'membro_id', 'sexo'],
  ['mem_cadastros_pendentes', 'duplicado_de_id', 'genero'],
];

(async () => {
  console.log(`\n=== Reparo do sexo declarado nas portas · ${EXEC ? 'EXECUÇÃO' : 'DRY-RUN'} ===\n`);

  const membros = (await todas('mem_membros', 'id, nome, genero, origem_cadastro, created_at, deleted_at'))
    .filter((m) => !m.deleted_at);
  const semSexo = new Map(membros.filter((m) => !m.genero).map((m) => [m.id, m]));
  console.log(`cadastros vivos: ${membros.length} · SEM sexo: ${semSexo.size}`);

  const declaracoes = new Map();
  for (const [tabela, col, campo] of FONTES) {
    let linhas = [];
    try {
      linhas = await todas(tabela, `${col}, ${campo}`);
    } catch (e) {
      console.log(`  (fonte ignorada) ${tabela}: ${e.message.slice(0, 60)}`);
      continue;
    }
    let n = 0;
    for (const r of linhas) {
      const id = r[col]; const v = r[campo];
      if (!id || !v || !semSexo.has(id)) continue;
      if (!declaracoes.has(id)) declaracoes.set(id, []);
      declaracoes.get(id).push({ fonte: tabela, sexo: v });
      n += 1;
    }
    console.log(`  ${tabela.padEnd(26)} ${String(n).padStart(4)} declaracoes uteis`);
  }

  const aplicar = []; const conflitos = [];
  for (const [id, lista] of declaracoes) {
    const r = consolidarDeclaracoes(lista);
    if (r.conflito) { conflitos.push({ m: semSexo.get(id), r }); continue; }
    if (r.sexo) aplicar.push({ m: semSexo.get(id), sexo: r.sexo, fontes: r.fontes });
  }

  console.log(`\n-- O que o script vai fazer --`);
  console.log(`  preencher o sexo (cadastro vazio, portas concordam): ${aplicar.length}`);
  console.log(`\n-- O que o script NAO toca --`);
  console.log(`  portas DISCORDAM do sexo (decisao humana):           ${conflitos.length}`);
  console.log(`  sem nenhuma declaracao em porta:                     ${semSexo.size - declaracoes.size}`);

  const porPorta = {};
  for (const a of aplicar) {
    const k = a.m.origem_cadastro || '(nulo)';
    porPorta[k] = (porPorta[k] || 0) + 1;
  }
  console.log(`  por porta do cadastro: ${JSON.stringify(porPorta)}`);
  for (const a of aplicar.slice(0, 20)) {
    console.log(`    ${a.m.nome.padEnd(34).slice(0, 34)} ${a.sexo.padEnd(9)} (${a.fontes.join(', ')})`);
  }
  if (aplicar.length > 20) console.log(`    ... e outros ${aplicar.length - 20}`);
  for (const c of conflitos) console.log(`\n  CONFLITO · ${c.m.nome}: ${c.r.fontes.join(' x ')}`);

  if (!EXEC) {
    console.log(`\n(dry-run · nada foi escrito. Rode com --exec para aplicar.)\n`);
    return;
  }

  const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '');
  const destino = path.join(os.homedir(), 'Downloads', `_bk_${stamp}_sexo_das_portas.json`);
  fs.writeFileSync(destino, JSON.stringify({
    gerado_em: new Date().toISOString(),
    aplicar,
    conflitos: conflitos.map((c) => ({ id: c.m.id, nome: c.m.nome, fontes: c.r.fontes })),
  }, null, 2), 'utf8');
  console.log(`\nbackup: ${destino}`);

  let ok = 0; let jaTinha = 0; const erros = [];
  for (const a of aplicar) {
    const { data, error } = await sb.from('mem_membros')
      .update({ genero: a.sexo, updated_at: new Date().toISOString() })
      .eq('id', a.m.id).is('genero', null).is('deleted_at', null).select('id');
    if (error) { erros.push(`${a.m.nome}: ${error.message}`); continue; }
    if (!data || !data.length) { jaTinha += 1; continue; }
    ok += 1;
    // Origem do dado — best-effort, nunca derruba o reparo.
    const { error: eObs } = await sb.from('mem_identidade_observacoes').insert({
      membro_id: a.m.id,
      origem: 'sexo_colhido_porta',
      nome: a.m.nome,
      dados: { sexo: a.sexo, fontes: a.fontes, script: '_reparo_sexo_das_portas' },
    });
    if (eObs) console.warn(`  (observacao nao registrada para ${a.m.nome}: ${eObs.message})`);
  }

  console.log(`\n-- Resultado --`);
  console.log(`  sexos preenchidos:                 ${ok}`);
  console.log(`  ja preenchidos no meio do caminho: ${jaTinha}`);
  if (erros.length) {
    console.log(`  ${erros.length} erro(s):`);
    for (const e of erros.slice(0, 10)) console.log(`     ${e}`);
  }
  console.log('');
})().catch((e) => { console.error('\nFALHOU:', e.message, '\n'); process.exit(1); });
