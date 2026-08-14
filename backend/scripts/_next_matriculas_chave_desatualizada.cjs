#!/usr/bin/env node
// ============================================================================
// Next · a `origem_mes_key` que ENVELHECEU depois da fusão (2026-08-14)
//
// O QUE ESTE SCRIPT CONSERTA
// `next_matriculas.origem_mes_key` é `'YYYY-MM|<membro_id>'` e é a chave que
// (a) torna o espelho do app idempotente (`services/nextMatricula.js`) e
// (b) DEDUPA a camada legada (`next_inscricoes`) contra a matrícula dentro da
// `vw_inscricoes_unificadas`. Ela guarda o `membro_id` DENTRO do texto.
//
// Quando duas pessoas são fundidas, `merge_membros` reaponta a coluna
// `membro_id` (a FK entrou em 20260730120000) e **não tem como saber que o id
// antigo também está escrito no meio de uma string** — a chave fica velha,
// aponta pra um cadastro que não existe mais, e as duas consequências acima
// param de valer:
//   1. o espelho do app não reconhece a matrícula do mês e cria OUTRA;
//   2. a view unificada deixa de deduplicar e a mesma inscrição é contada 2×.
//
// ⚠️ Isto NÃO é falta de UNIQUE: `uq_next_matriculas_origem_mes_key` existe. É
// que duas chaves DIFERENTES (a velha e a nova) descrevem a MESMA pessoa no
// MESMO mês, então a constraint não vê conflito nenhum. Diagnóstico anterior
// meu ("falta um UNIQUE") estava errado.
//
// MEDIDO EM PRODUÇÃO (14/08 · 1.908 matrículas vivas):
//   · 145 linhas com chave DESATUALIZADA (o id do texto ≠ `membro_id` atual) —
//     quase todas com UUID **v5**, os ids determinísticos que o backfill das
//     listas manuscritas de 13/05 gerou e que depois foram fundidos;
//   · 71 pares (MESMA turma, mesma pessoa) com 2 matrículas VIVAS = 144 linhas,
//     54 com check-in;
//   · confirmado na `vw_inscricoes_unificadas`: a mesma pessoa aparece 2× no
//     mesmo dia (ex.: 2025-01-19 e 2025-03-16). Contagem dupla real.
//
// COMO RODAR
//   node backend/scripts/_next_matriculas_chave_desatualizada.cjs          (dry-run)
//   node backend/scripts/_next_matriculas_chave_desatualizada.cjs --exec   (aplica)
// Backup do estado anterior em ~/Downloads antes de qualquer escrita.
//
// ⚠️⚠️ ESTE SCRIPT MEXE EM PRESENÇA. `next_matriculas.check_in_at` é lido por
// `GET /next/turmas/:id` (filtro com_checkin) e pelo card de presença do mês em
// `routes/next.js`. Por isso: a linha que fica é SEMPRE a que tem a presença, o
// check-in é consolidado no keep, e **par com DUAS presenças em DIAS diferentes
// NÃO é consolidado** — ali as duas linhas descrevem dois encontros reais e a
// tabela só tem um campo de check-in. Esse caso vai pra revisão humana.
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

// Cap de 1000 do PostgREST: leitura de tabela que cresce com o uso vai paginada.
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

const chaveEsperada = (mes, membroId) => (mes && membroId ? `${mes}|${membroId}` : null);

// Rank do status: o keep herda o MELHOR estado do grupo. Perder um 'formado'
// porque a outra linha era 'matriculado' seria apagar a conclusão do Next.
const RANK_STATUS = { formado: 4, matriculado: 3, recebida: 2, incompleto: 1 };
const rank = (s) => RANK_STATUS[String(s || '').toLowerCase()] || 0;

const dia = (iso) => (iso ? String(iso).slice(0, 10) : null);

/** Escolha do keep — determinística e nesta ordem, de propósito:
 *  1. tem check-in (presença é o dado que não se recria);
 *  2. check-in mais ANTIGO (a primeira presença registrada é o fato);
 *  3. `created_at` mais antigo;  4. id (desempate estável).
 *  Sem (4) duas execuções poderiam escolher linhas diferentes. */
function escolherKeep(linhas) {
  return [...linhas].sort((a, b) => {
    const ca = a.check_in_at ? 0 : 1; const cb = b.check_in_at ? 0 : 1;
    if (ca !== cb) return ca - cb;
    if (a.check_in_at && b.check_in_at && a.check_in_at !== b.check_in_at) {
      return a.check_in_at < b.check_in_at ? -1 : 1;
    }
    if (a.created_at !== b.created_at) return String(a.created_at) < String(b.created_at) ? -1 : 1;
    return String(a.id) < String(b.id) ? -1 : 1;
  })[0];
}

(async () => {
  console.log(`\n=== Next · chave do mês desatualizada · ${EXEC ? 'EXECUÇÃO' : 'DRY-RUN'} ===\n`);

  const turmas = await todas('next_turmas', 'id, origem_mes, nome, deleted_at');
  const mesDaTurma = new Map(turmas.map((t) => [t.id, t.origem_mes]));
  const nomeDaTurma = new Map(turmas.map((t) => [t.id, t.nome]));

  const todasMatriculas = await todas(
    'next_matriculas',
    'id, membro_id, turma_id, origem_mes_key, nome, sobrenome, status, origem, check_in_at, check_in_by, created_at, deleted_at',
  );
  const vivas = todasMatriculas.filter((r) => !r.deleted_at);
  console.log(`matrículas: ${todasMatriculas.length} no total · ${vivas.length} vivas · ${turmas.length} turmas`);

  // ── Grupos (TURMA, membro) com 2+ vivas ───────────────────────────────────
  // ⚠️ Agrupa por TURMA, não por mês: existem turmas distintas no mesmo mês
  // ("Agosto/01" e "Agosto/02"), e matrícula em duas delas é LEGÍTIMA — as duas
  // aulas do Next não são sequenciais. Agrupar por mês fundiria matrícula boa.
  const grupos = new Map();
  for (const r of vivas) {
    if (!r.membro_id || !r.turma_id) continue; // sem chave possível: não tocar
    const k = `${r.turma_id}|${r.membro_id}`;
    if (!grupos.has(k)) grupos.set(k, []);
    grupos.get(k).push(r);
  }

  const consolidar = [];
  const revisarNaMao = [];
  for (const [, linhas] of grupos) {
    if (linhas.length < 2) continue;
    const diasDeCheckin = new Set(linhas.map((r) => dia(r.check_in_at)).filter(Boolean));
    if (diasDeCheckin.size > 1) { revisarNaMao.push(linhas); continue; }
    consolidar.push(linhas);
  }

  // ── Linhas ÚNICAS com a chave velha (só precisam do refresh) ──────────────
  const idsEmGrupo = new Set(consolidar.flat().concat(revisarNaMao.flat()).map((r) => r.id));
  const soRefresh = vivas.filter((r) => {
    if (idsEmGrupo.has(r.id)) return false;
    if (!r.membro_id || !r.turma_id || !r.origem_mes_key) return false;
    const esperada = chaveEsperada(mesDaTurma.get(r.turma_id), r.membro_id);
    return !!esperada && r.origem_mes_key !== esperada;
  });

  // ⚠️ Refresh que COLIDIRIA com a chave de outra linha viva fica de fora: o
  // UPDATE tomaria 23505 na UNIQUE. Nenhum caso hoje, mas o script não pode
  // depender disso — e a colisão é sinal de par que a régua de grupo não pegou.
  const chavesVivas = new Set(vivas.map((r) => r.origem_mes_key).filter(Boolean));
  const colidiriam = [];
  const refreshSeguro = soRefresh.filter((r) => {
    const esperada = chaveEsperada(mesDaTurma.get(r.turma_id), r.membro_id);
    if (chavesVivas.has(esperada)) { colidiriam.push({ ...r, chave_alvo: esperada }); return false; }
    return true;
  });

  console.log(`\n── O que o script vai fazer ──`);
  console.log(`  consolidar (2+ vivas na MESMA turma, 1 dia de presença): ${consolidar.length} grupos · ${consolidar.flat().length} linhas`);
  console.log(`  só atualizar a chave (linha única com chave velha):      ${refreshSeguro.length}`);
  console.log(`\n── O que o script NÃO toca ──`);
  console.log(`  presenças em DIAS diferentes na mesma turma (humano decide): ${revisarNaMao.length} grupos`);
  console.log(`  refresh que colidiria com chave de outra linha viva:         ${colidiriam.length}`);
  console.log(`  linhas sem membro_id ou sem turma (chave indeterminável):    ${vivas.filter((r) => !r.membro_id || !r.turma_id).length}`);

  for (const linhas of consolidar.slice(0, 12)) {
    const keep = escolherKeep(linhas);
    const fora = linhas.filter((r) => r.id !== keep.id);
    console.log(`\n  ${nomeDaTurma.get(keep.turma_id) || '(turma ?)'} · ${keep.nome} ${keep.sobrenome || ''}`.trimEnd());
    console.log(`    fica:  ${keep.id.slice(0, 8)} status=${keep.status} check_in=${dia(keep.check_in_at) || '—'} key=${keep.origem_mes_key}`);
    for (const r of fora) console.log(`    sai:   ${r.id.slice(0, 8)} status=${r.status} check_in=${dia(r.check_in_at) || '—'} key=${r.origem_mes_key}`);
  }
  if (consolidar.length > 12) console.log(`\n  … e outros ${consolidar.length - 12} grupos`);

  for (const linhas of revisarNaMao) {
    console.log(`\n  ⚠️ REVISAR À MÃO · ${nomeDaTurma.get(linhas[0].turma_id) || '(turma ?)'} · ${linhas[0].nome}`);
    for (const r of linhas) console.log(`     ${r.id.slice(0, 8)} status=${r.status} check_in=${dia(r.check_in_at) || '—'}`);
    console.log(`     duas presenças em dias diferentes: são 2 encontros reais e a tabela tem 1 campo de check-in.`);
  }

  if (!EXEC) {
    console.log(`\n(dry-run · nada foi escrito. Rode com --exec para aplicar.)\n`);
    return;
  }

  // ── Backup ANTES de escrever ──────────────────────────────────────────────
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const destino = path.join(os.homedir(), 'Downloads', `_bk_${stamp}_next_matriculas_chave.json`);
  const alvo = [...consolidar.flat(), ...refreshSeguro];
  fs.writeFileSync(destino, JSON.stringify({
    gerado_em: new Date().toISOString(),
    consolidar: consolidar.map((g) => g.map((r) => r.id)),
    refresh: refreshSeguro.map((r) => r.id),
    linhas: alvo,
  }, null, 2), 'utf8');
  console.log(`\nbackup: ${destino} (${alvo.length} linhas)`);

  let soltas = 0; let apagadas = 0; let atualizadas = 0; const erros = [];

  for (const linhas of consolidar) {
    const keep = escolherKeep(linhas);
    const fora = linhas.filter((r) => r.id !== keep.id);
    const checkIn = linhas.map((r) => r.check_in_at).filter(Boolean).sort()[0] || null;
    const checkBy = linhas.find((r) => r.check_in_at === checkIn)?.check_in_by || keep.check_in_by || null;
    const status = [...linhas].sort((a, b) => rank(b.status) - rank(a.status))[0].status;

    // ⚠️ A ORDEM É ESSENCIAL, e vem da lição "soft-delete NÃO limpa ponteiro":
    // não se sabe se `uq_next_matriculas_origem_mes_key` é índice PARCIAL. Se
    // não for, a linha soft-deletada continua OCUPANDO a chave e o UPDATE do
    // keep tomaria 23505. Anular a chave da redundante ANTES resolve nos dois
    // casos, e morrer no meio deixa o estado de hoje (uma viva com chave velha),
    // nunca pior. Idempotente na reexecução.
    let falhou = false;
    for (const r of fora) {
      const { error: e1 } = await sb.from('next_matriculas')
        .update({ origem_mes_key: null, updated_at: new Date().toISOString() })
        .eq('id', r.id).is('deleted_at', null);
      if (e1) { erros.push(`soltar chave ${r.id}: ${e1.message}`); falhou = true; continue; }
      soltas += 1;
      const { error: e2 } = await sb.rpc('app_soft_delete', {
        p_table_name: 'next_matriculas', p_row_id: r.id, p_deleted_by: null,
      });
      if (e2) { erros.push(`soft-delete ${r.id}: ${e2.message}`); falhou = true; continue; }
      apagadas += 1;
    }
    if (falhou) continue; // não atualiza o keep sem ter liberado a chave

    const { error: e3 } = await sb.from('next_matriculas').update({
      origem_mes_key: chaveEsperada(mesDaTurma.get(keep.turma_id), keep.membro_id),
      check_in_at: checkIn,
      check_in_by: checkBy,
      status,
      updated_at: new Date().toISOString(),
    }).eq('id', keep.id).is('deleted_at', null);
    if (e3) erros.push(`keep ${keep.id}: ${e3.message}`);
    else atualizadas += 1;
  }

  for (const r of refreshSeguro) {
    const { error } = await sb.from('next_matriculas').update({
      origem_mes_key: chaveEsperada(mesDaTurma.get(r.turma_id), r.membro_id),
      updated_at: new Date().toISOString(),
    }).eq('id', r.id).is('deleted_at', null);
    if (error) erros.push(`refresh ${r.id}: ${error.message}`);
    else atualizadas += 1;
  }

  console.log(`\n── Resultado ──`);
  console.log(`  chaves liberadas na redundante: ${soltas}`);
  console.log(`  matrículas soft-deletadas:      ${apagadas}`);
  console.log(`  linhas com chave atualizada:    ${atualizadas}`);
  if (erros.length) {
    console.log(`\n  ⚠️ ${erros.length} erro(s):`);
    for (const e of erros.slice(0, 20)) console.log(`     ${e}`);
  }
  console.log(`\n  desfazer: select app_restore('next_matriculas','<id>') + os valores do backup\n`);
})().catch((e) => { console.error('\nFALHOU:', e.message, '\n'); process.exit(1); });
