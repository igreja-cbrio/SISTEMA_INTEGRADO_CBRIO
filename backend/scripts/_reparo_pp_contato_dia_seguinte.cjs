#!/usr/bin/env node
/**
 * Reparo · Próximos passos: primeiro_contato_em = data_culto + 1 dia (Marcelo · 2026-09-01)
 *
 * Contexto: a equipe manda a mensagem de 1º contato SEMPRE no dia seguinte ao
 * culto, mas o status só era marcado quando a pessoa respondia — e é o marcar
 * que carimba primeiro_contato_em. Resultado: o KPI de contato ≤3d media a data
 * da RESPOSTA, não a do contato. Pedido do Marcelo (via Marcos): as datas já
 * marcadas passam a valer como "1 dia depois do culto"; daqui pra frente o
 * status novo "contactada" carimba a data real no dia do envio.
 *
 * O que muda: nos convertidos vivos com status de contato FEITO
 * (atendido_respondido / nao_respondeu / nao_atendido / respondeu / nao_compareceu),
 *   • primeiro_contato_em > data_culto+1d  → vira data_culto+1d 12:00 BRT
 *   • primeiro_contato_em NULO (legado)    → idem (backfill pela regra do Marcelo)
 * NÃO toca: numero_errado / sem_retorno (nunca carimbam), em ≤ culto+1d (já
 * plausível/real), em ANTES do culto (anomalia — só lista), status 'contactada'
 * (daqui pra frente a data é real por construção).
 *
 * Uso:  node backend/scripts/_reparo_pp_contato_dia_seguinte.cjs         (dry-run)
 *       node backend/scripts/_reparo_pp_contato_dia_seguinte.cjs --exec
 * Backup: ~/Downloads/_bk_<data>_pp_contato_dia_seguinte.json (id + valor antigo).
 * Reverter: update linha a linha com o backup.
 */
const fs = require('fs');
const path = require('path');
const os = require('os');

// .env: o do diretório atual, com fallback no checkout principal (worktree nasce sem .env)
const envLocal = path.join(__dirname, '..', '.env');
const envPrincipal = path.join(os.homedir(), 'SISTEMA_INTEGRADO_CBRIO', 'backend', '.env');
require('dotenv').config({ path: fs.existsSync(envLocal) ? envLocal : envPrincipal });
const { createClient } = require('@supabase/supabase-js');
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY não encontrados (.env local nem no principal).');
  process.exit(1);
}
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const EXEC = process.argv.includes('--exec');
const DIA = 86400000;
// Status que carimbam contato feito e cuja data segue a regra "dia seguinte".
const STATUS_ALVO = new Set(['atendido_respondido', 'nao_respondeu', 'nao_atendido', 'respondeu', 'nao_compareceu']);

// data_culto (DATE) + 1 dia, ao meio-dia BRT — meia-noite UTC é 21h do dia
// anterior no Rio, e meio-dia evita qualquer deslize de dia nos dois fusos.
function diaSeguinteBRT(dataCulto) {
  const d = new Date(dataCulto + 'T12:00:00Z');
  const seguinte = new Date(d.getTime() + DIA).toISOString().slice(0, 10);
  return seguinte + 'T12:00:00-03:00';
}
// Fim do dia seguinte em BRT — o corte "além de culto+1d".
function fimDoDiaSeguinteBRT(dataCulto) {
  const d = new Date(dataCulto + 'T12:00:00Z');
  const seguinte = new Date(d.getTime() + DIA).toISOString().slice(0, 10);
  return new Date(seguinte + 'T23:59:59-03:00').getTime();
}

(async () => {
  const linhas = [];
  for (let ofs = 0; ; ofs += 1000) {
    const { data, error } = await sb.from('cui_convertidos')
      .select('id, nome, data_culto, primeiro_contato_em, primeiro_contato_status, responsavel_atendimento')
      .is('deleted_at', null)
      .range(ofs, ofs + 999);
    if (error) throw error;
    linhas.push(...data);
    if (data.length < 1000) break;
  }

  const corrigir = [];   // em > culto+1d
  const backfill = [];   // status feito · em nulo
  const anomalias = [];  // em antes do culto
  for (const c of linhas) {
    if (!c.data_culto || !STATUS_ALVO.has(c.primeiro_contato_status)) continue;
    const novo = diaSeguinteBRT(c.data_culto);
    if (!c.primeiro_contato_em) { backfill.push({ ...c, novo }); continue; }
    const em = new Date(c.primeiro_contato_em).getTime();
    if (em < new Date(c.data_culto + 'T00:00:00-03:00').getTime()) { anomalias.push(c); continue; }
    if (em > fimDoDiaSeguinteBRT(c.data_culto)) corrigir.push({ ...c, novo });
  }

  console.log(`vivos: ${linhas.length} · corrigir (em > culto+1d): ${corrigir.length} · backfill (status sem data): ${backfill.length} · anomalias (em antes do culto · intocadas): ${anomalias.length}`);
  const alvo = [...corrigir, ...backfill];
  if (!alvo.length) { console.log('Nada a fazer.'); return; }

  if (!EXEC) {
    console.log('\nDRY-RUN · amostra (10):');
    for (const c of alvo.slice(0, 10)) {
      console.log(` ${c.nome} · culto ${c.data_culto} · em ${c.primeiro_contato_em || '(nulo)'} → ${c.novo}`);
    }
    console.log('\nRode com --exec pra aplicar (backup automático em ~/Downloads).');
    return;
  }

  // Backup ANTES de escrever
  const bkPath = path.join(os.homedir(), 'Downloads', `_bk_${new Date().toISOString().slice(0, 10).replace(/-/g, '')}_pp_contato_dia_seguinte.json`);
  fs.writeFileSync(bkPath, JSON.stringify(alvo.map(c => ({ id: c.id, primeiro_contato_em: c.primeiro_contato_em })), null, 1));
  console.log('backup:', bkPath);

  let ok = 0, falhas = 0;
  for (const c of alvo) {
    const { error } = await sb.from('cui_convertidos')
      .update({ primeiro_contato_em: c.novo })
      .eq('id', c.id)
      .is('deleted_at', null);
    if (error) { falhas++; console.error(` FALHOU ${c.id}: ${error.message}`); }
    else ok++;
  }
  console.log(`aplicado: ${ok} · falhas: ${falhas}`);
})().catch(e => { console.error('ERRO:', e.message); process.exit(1); });
