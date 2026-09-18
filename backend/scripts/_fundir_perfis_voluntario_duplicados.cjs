/**
 * FUSÃO de perfis de voluntário duplicados (2026-09-16)
 *
 * Pedido do Marcos: *"pode resolver o caso do thiago, meu e dos demais"* — 7
 * membros com 2 `vol_profiles` cada.
 *
 * ⚠️⚠️ NUNCA DELETA PERFIL. `vol_profiles` tem 15 FKs apontando pra ela e
 * **5 são ON DELETE CASCADE** (`vol_user_roles`, `vol_team_members`,
 * `vol_availability`, `vol_1x1_meetings`, `vol_escala_template_item_pessoas`):
 * apagar o perfil apagaria vínculo de equipe, papel de permissão e
 * disponibilidade em cascata. É a mesma lei já registrada pra `vol_teams`:
 * **fusão = mover os filhos + APOSENTAR**.
 *
 * ⚠️⚠️ QUEM SOBREVIVE é o perfil que está no ROSTER ATIVO do Planning Center
 * (`arquivado = false` com `planning_center_id`). Arquivar o que está no roster
 * seria DESFEITO pelo próximo sync — `reconciliarComRosterPCO` "desarquiva os
 * que reapareceram".
 *
 * ⚠️ MOVER É DURÁVEL: conferido que `upsertScheduleResilient` NÃO escreve
 * `volunteer_id` (o payload do PCO só tem `planning_center_person_id`,
 * `volunteer_name`, `team_name`, `position_name`, `confirmation_status`), e não
 * existe passo de sync que re-ligue `volunteer_id` a partir do pc_id.
 *
 * Uso:
 *   node backend/scripts/_fundir_perfis_voluntario_duplicados.cjs          # dry-run
 *   node backend/scripts/_fundir_perfis_voluntario_duplicados.cjs --exec   # aplica
 */
require('dotenv').config();
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const EXEC = process.argv.includes('--exec');
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// As 15 FKs que apontam pra vol_profiles. ⚠️ `acao` é informativa: nada é
// deletado, mas CASCADE marca o que sumiria se alguém deletasse o perfil.
const FILHOS = [
  ['vol_user_roles', 'profile_id', 'CASCADE'],
  ['vol_schedules', 'volunteer_id', 'SET NULL'],
  ['vol_check_ins', 'volunteer_id', 'SET NULL'],
  ['vol_teams', 'leader_profile_id', 'SET NULL'],
  ['vol_team_members', 'volunteer_profile_id', 'CASCADE'],
  ['vol_availability', 'volunteer_profile_id', 'CASCADE'],
  ['int_visitantes', 'responsavel_id', 'SET NULL'],
  ['int_acompanhamentos', 'voluntario_id', 'SET NULL'],
  ['vol_1x1_meetings', 'volunteer_profile_id', 'CASCADE'],
  ['vol_inscricoes', 'vol_profile_id', 'SET NULL'],
  ['vol_servicos_historico', 'vol_profile_id', 'SET NULL'],
  ['vol_inscritos', 'vol_profile_id', 'SET NULL'],
  ['kids_sala_voluntarios', 'vol_profile_id', 'SET NULL'],
  ['vol_email_disparo_destinatarios', 'vol_profile_id', 'SET NULL'],
  ['vol_escala_template_item_pessoas', 'volunteer_id', 'CASCADE'],
];

// ⚠️ Tabelas com UNIQUE que a fusão pode violar. Mover uma linha do perdedor
// pra um par (chave) que o sobrevivente JÁ tem estoura 23505 — então essas são
// deixadas no perdedor (arquivado, portanto inertes) e DECLARADAS no relatório.
// `vol_team_members` é o caso real: os 2 vínculos do Thiago existem dos 2 lados.
const CHAVE_UNICA = {
  vol_team_members: ['team_id', 'position_id'],
  vol_check_ins: ['service_id'],
  vol_availability: ['service_id'],
};

// ⚠️ Tabela declarada em migration mas AUSENTE em produção (é o caso de
// `vol_1x1_meetings`) é PULADA e DECLARADA — nunca em silêncio. Qualquer outro
// erro LANÇA: contagem truncada faria a fusão "mover 0 filhos" e reportar
// sucesso, deixando histórico para trás sem ninguém saber.
const AUSENTES = new Set();
function tabelaAusente(error) {
  return !!error && (error.code === 'PGRST205' || /Could not find the table/i.test(error.message || ''));
}

async function linhas(tab, col, id, extra) {
  const sel = ['id', col].concat(extra || []).join(', ');
  const { data, error } = await sb.from(tab).select(sel).eq(col, id);
  if (error) {
    if (tabelaAusente(error)) { AUSENTES.add(tab); return []; }
    throw new Error(`${tab}.${col}: ${error.message}`);
  }
  return data || [];
}

(async () => {
  const { data: vps, error: e1 } = await sb
    .from('vol_profiles')
    .select('id, full_name, membresia_id, origem, planning_center_id, arquivado, auth_user_id, created_at');
  if (e1) throw new Error(`vol_profiles: ${e1.message}`);

  const porMembro = {};
  for (const v of vps) if (v.membresia_id) (porMembro[v.membresia_id] ||= []).push(v);
  const dups = Object.entries(porMembro).filter(([, a]) => a.length > 1);

  const { data: ms } = await sb.from('mem_membros').select('id, nome').in('id', dups.map((d) => d[0]));
  const NOME = Object.fromEntries((ms || []).map((m) => [m.id, m.nome]));

  const plano = [];

  for (const [mid, arr] of dups) {
    // Contagem de filhos por perfil decide quem tem o histórico.
    const peso = {};
    for (const v of arr) {
      let n = 0;
      for (const [tab, col] of FILHOS) {
        const { count, error } = await sb.from(tab).select('*', { count: 'exact', head: true }).eq(col, v.id);
        if (error) {
          if (tabelaAusente(error)) { AUSENTES.add(tab); continue; }
          throw new Error(`${tab}.${col}: ${error.message}`);
        }
        n += count || 0;
      }
      peso[v.id] = n;
    }

    // ⚠️ SOBREVIVENTE: no roster ativo (não arquivado) vence; empate, quem tem
    // mais histórico. Nunca eleger um arquivado tendo um ativo — o sync do PCO
    // desfaria o arquivamento do outro.
    const ordenado = arr.slice().sort((a, b) => {
      if (a.arquivado !== b.arquivado) return a.arquivado ? 1 : -1;
      return peso[b.id] - peso[a.id];
    });
    const fica = ordenado[0];
    const vaiSair = ordenado.slice(1);

    for (const sai of vaiSair) {
      const mover = [];
      const deixar = [];
      for (const [tab, col] of FILHOS) {
        const chave = CHAVE_UNICA[tab];
        const filhosSai = await linhas(tab, col, sai.id, chave);
        if (!filhosSai.length) continue;
        if (!chave) { mover.push({ tab, col, ids: filhosSai.map((r) => r.id) }); continue; }
        const filhosFica = await linhas(tab, col, fica.id, chave);
        const jaTem = new Set(filhosFica.map((r) => chave.map((k) => r[k]).join('|')));
        const ok = filhosSai.filter((r) => !jaTem.has(chave.map((k) => r[k]).join('|')));
        const colide = filhosSai.filter((r) => jaTem.has(chave.map((k) => r[k]).join('|')));
        if (ok.length) mover.push({ tab, col, ids: ok.map((r) => r.id) });
        if (colide.length) deixar.push({ tab, col, n: colide.length, motivo: `o sobrevivente já tem (${chave.join('+')})` });
      }
      plano.push({
        membro: NOME[mid],
        fica: { id: fica.id, nome: fica.full_name, pc: fica.planning_center_id, arq: fica.arquivado, auth: fica.auth_user_id, filhos: peso[fica.id] },
        sai: { id: sai.id, nome: sai.full_name, pc: sai.planning_center_id, arq: sai.arquivado, auth: sai.auth_user_id, filhos: peso[sai.id] },
        mover,
        deixar,
        // ⚠️ O índice de auth_user_id é UNIQUE parcial: pra mover, LIMPA o
        // perdedor primeiro e só então grava no sobrevivente.
        moverLogin: !!(sai.auth_user_id && !fica.auth_user_id),
        doisLogins: !!(sai.auth_user_id && fica.auth_user_id),
      });
    }
  }

  console.log(`\n${'='.repeat(70)}\nPLANO DE FUSÃO · ${plano.length} perfis a aposentar\n${'='.repeat(70)}`);
  if (AUSENTES.size) console.log(`⚠️ tabelas do catálogo AUSENTES em produção (puladas): ${[...AUSENTES].join(', ')}`);
  for (const p of plano) {
    console.log(`\n${p.membro}`);
    console.log(`  FICA : ${p.fica.id.slice(0, 8)} "${p.fica.nome}" pc=${p.fica.pc || '-'} arq=${p.fica.arq} filhos=${p.fica.filhos}`);
    console.log(`  SAI  : ${p.sai.id.slice(0, 8)} "${p.sai.nome}" pc=${p.sai.pc || '-'} arq=${p.sai.arq} filhos=${p.sai.filhos}`);
    if (p.mover.length) p.mover.forEach((m) => console.log(`    mover ${m.tab}.${m.col}: ${m.ids.length}`));
    else console.log('    mover: NADA');
    p.deixar.forEach((d) => console.log(`    ⚠️ fica no aposentado ${d.tab}: ${d.n} (${d.motivo})`));
    if (p.moverLogin) console.log('    ⚠️ MOVER LOGIN (auth_user_id) pro sobrevivente');
    if (p.doisLogins) console.log('    ⚠️⚠️ DUAS CONTAS DE LOGIN — não mexo, é decisão humana');
    if (!p.sai.arq) console.log('    arquivar o perfil que sai');
  }

  if (!EXEC) {
    console.log('\nDRY-RUN. Nada foi gravado. Use --exec para aplicar.');
    return;
  }

  const bk = path.join(os.homedir(), 'Downloads', `_bk_${new Date().toISOString().slice(0, 10).replace(/-/g, '')}_fusao_perfis_vol.json`);
  fs.writeFileSync(bk, JSON.stringify(plano, null, 2));
  console.log(`\nBackup do plano: ${bk}`);

  for (const p of plano) {
    console.log(`\n→ ${p.membro}`);
    for (const m of p.mover) {
      // ⚠️ Em lotes de 100: `.in()` com lista longa estoura a URL do PostgREST.
      for (let i = 0; i < m.ids.length; i += 100) {
        const lote = m.ids.slice(i, i + 100);
        const { error } = await sb.from(m.tab).update({ [m.col]: p.fica.id }).in('id', lote);
        if (error) { console.log(`   ✗ ${m.tab}: ${error.message}`); continue; }
      }
      console.log(`   ✓ ${m.tab}.${m.col}: ${m.ids.length} movidos`);
    }
    if (p.moverLogin) {
      // ⚠️ ORDEM OBRIGATÓRIA: limpa o perdedor ANTES de gravar no sobrevivente
      // (vol_profiles_auth_user_idx é UNIQUE). O inverso estoura 23505.
      const { error: e2 } = await sb.from('vol_profiles').update({ auth_user_id: null }).eq('id', p.sai.id);
      if (e2) { console.log(`   ✗ limpar login: ${e2.message}`); }
      else {
        const { error: e3 } = await sb.from('vol_profiles').update({ auth_user_id: p.sai.auth }).eq('id', p.fica.id);
        if (e3) {
          console.log(`   ✗ mover login: ${e3.message} — DEVOLVENDO ao perfil de origem`);
          await sb.from('vol_profiles').update({ auth_user_id: p.sai.auth }).eq('id', p.sai.id);
        } else console.log('   ✓ login movido pro perfil com histórico');
      }
    }
    if (!p.sai.arq) {
      const { error } = await sb.from('vol_profiles')
        .update({ arquivado: true, arquivado_em: new Date().toISOString(), arquivado_manual: true })
        .eq('id', p.sai.id);
      console.log(error ? `   ✗ arquivar: ${error.message}` : '   ✓ perfil aposentado');
    }
  }
  console.log('\nFeito.');
})().catch((e) => { console.error('ERRO:', e.message); process.exit(1); });
