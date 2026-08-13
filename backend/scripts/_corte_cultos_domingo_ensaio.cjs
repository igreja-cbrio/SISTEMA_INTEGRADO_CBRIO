#!/usr/bin/env node
// ENSAIO do corte dos cultos de domingo (24/08/2026) — 100% SOMENTE LEITURA.
// Par do backend/scripts/corte-cultos-domingo-20260824.sql (o corte em si).
//
// O que faz:
//   1. Grava em ~/Downloads um JSON com o estado ANTERIOR de tudo que o corte
//      muda (backup FORA do banco — as tabelas _bk_ do SQL ficam DENTRO).
//   2. Confere as pré-condições do script (Lote 2 aplicado · Lote 3 aplicado ·
//      tipos 08:30/10:00 acháveis · slot financeiro do 10:00 presente).
//   3. Conta os BLOQUEADORES: cultos futuros dos tipos que saem com dado ou
//      satélite (a mesma guarda do passo 0 do SQL) — se houver, lista quais.
//   4. Imprime o plano do que o corte real faria, com os números de hoje.
//
// Uso:  node backend/scripts/_corte_cultos_domingo_ensaio.cjs
// (não tem --exec — este script NUNCA escreve; quem escreve é o SQL, no dia)
const fs = require('fs');
const path = require('path');
const os = require('os');

const PRINCIPAL = path.join(os.homedir(), 'SISTEMA_INTEGRADO_CBRIO', 'backend');
const LOCAL = path.join(__dirname, '..');

function carregarEnv() {
  for (const dir of [LOCAL, PRINCIPAL]) {
    const f = path.join(dir, '.env');
    if (!fs.existsSync(f)) continue;
    const env = {};
    for (const l of fs.readFileSync(f, 'utf8').split(/\r?\n/)) {
      const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
    if (env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY) return env;
  }
  throw new Error('SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY não encontrados em .env');
}
function resolverModulo(nome) {
  for (const dir of [LOCAL, PRINCIPAL]) {
    try { return require(path.join(dir, 'node_modules', nome)); } catch { /* tenta o próximo */ }
  }
  return require(nome);
}

const env = carregarEnv();
const { createClient } = resolverModulo('@supabase/supabase-js');
const sb = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const CORTE = '2026-08-30'; // 1º domingo do formato novo (linhas futuras >= aqui)
const ok = (b) => (b ? '✅' : '🔴');
const avisos = [];
let bloqueio = false;

async function todas(tabela, select, filtro) {
  let linhas = [];
  for (let from = 0; ; from += 1000) {
    let q = sb.from(tabela).select(select).range(from, from + 999);
    if (filtro) q = filtro(q);
    const { data, error } = await q;
    if (error) throw new Error(`${tabela}: ${error.message}`);
    linhas = linhas.concat(data || []);
    if (!data || data.length < 1000) break;
  }
  return linhas;
}

async function existeSatelite(tabela, cultoIds, extra) {
  // devolve o Set de culto_id que TÊM linha na satélite (em lotes de 200)
  const tem = new Set();
  for (let i = 0; i < cultoIds.length; i += 200) {
    let q = sb.from(tabela).select('culto_id').in('culto_id', cultoIds.slice(i, i + 200));
    if (extra) q = extra(q);
    const { data, error } = await q;
    if (error) {
      avisos.push(`satélite ${tabela} não conferida (${error.message}) — o SQL confere de novo no dia`);
      return tem;
    }
    for (const r of data || []) tem.add(r.culto_id);
  }
  return tem;
}

(async () => {
  console.log('== ENSAIO DO CORTE 24/08 · somente leitura ==\n');

  // ── 1 · pré-condições ──────────────────────────────────────────────────────
  const { data: gate, error: eGate } = await sb.rpc('fn_dash_vol_service_no_bloco', { p_nome: 'Domingo 09:30' });
  const gateOk = !eGate && gate === true;
  console.log(`${ok(gateOk)} régua do voluntariado aceita 'Domingo 09:30' (Lote 2)${eGate ? ` — ${eGate.message}` : ''}`);
  if (!gateOk) bloqueio = true;

  const { error: eLote3 } = await sb.from('vol_service_types')
    .select('id, vigente_de, vigente_ate, linhagem_key, consolidacao_key').limit(1);
  console.log(`${ok(!eLote3)} colunas do Lote 3 presentes (20260813150000)${eLote3 ? ` — ${eLote3.message}` : ''}`);
  if (eLote3) bloqueio = true;

  const { data: cfg, error: eCfg } = await sb.from('cultos_config').select('lentes_domingo_publicas').maybeSingle();
  console.log(`${ok(!eCfg && cfg)} cultos_config existe · véu ${cfg ? (cfg.lentes_domingo_publicas ? 'JÁ ABERTO' : 'fechado (esperado)') : '—'}`);
  if (eCfg || !cfg) bloqueio = true;

  const tipos = await todas('vol_service_types', '*', (q) => q.eq('recurrence_day', 0));
  const t0830 = tipos.find((t) => t.name === 'Domingo 08:30');
  const t1000 = tipos.find((t) => t.name === 'Domingo 10:00');
  const t0930 = tipos.find((t) => t.name === 'Domingo 09:30');
  console.log(`${ok(t0830 && t1000)} tipos 'Domingo 08:30' e 'Domingo 10:00' acháveis pelo nome exato`);
  if (!t0830 || !t1000) bloqueio = true;
  if (t0930) console.log(`   ℹ️ tipo 'Domingo 09:30' JÁ EXISTE (o corte é idempotente — segue)`);

  const { data: slot10, error: eSlot } = await sb.from('fin_culto_slots')
    .select('id, nome, hora_inicio, hora_fim, plano_contas_dizimo_id, plano_contas_oferta_id, ativo')
    .eq('service_type_slug', 'domingo-10h').maybeSingle();
  console.log(`${ok(!eSlot && slot10)} slot financeiro 'domingo-10h' presente (fallback D2 das contas)`);
  if (eSlot || !slot10) bloqueio = true;

  // ── 2 · backup JSON pra Downloads ──────────────────────────────────────────
  const slots = await todas('fin_culto_slots', '*', (q) => q.eq('dia_semana', 0));
  const batismo = await todas('batismo_horarios', '*');
  const idsQueSaem = [t0830?.id, t1000?.id].filter(Boolean);
  const futuros = idsQueSaem.length
    ? await todas('cultos', '*', (q) => q.in('service_type_id', idsQueSaem).gte('data', CORTE).is('deleted_at', null))
    : [];
  const templates = t1000
    ? await todas('vol_escala_template_tipos', '*', (q) => q.eq('service_type_id', t1000.id))
    : [];

  const backup = {
    gerado_em: new Date().toISOString(),
    corte: CORTE,
    vol_service_types_domingo: tipos,
    cultos_futuros_dos_tipos_que_saem: futuros,
    fin_culto_slots_domingo: slots,
    batismo_horarios: batismo,
    cultos_config: cfg || null,
    vol_escala_template_tipos_do_1000: templates,
  };
  const arq = path.join(os.homedir(), 'Downloads', `backup_corte_cultos_20260824_pre_${Date.now()}.json`);
  fs.writeFileSync(arq, JSON.stringify(backup, null, 2));
  console.log(`\n💾 backup do estado anterior: ${arq}`);

  // ── 3 · bloqueadores (a guarda do passo 0 do SQL, antecipada) ──────────────
  const cIds = futuros.map((c) => c.id);
  const contadores = ['presencial_adulto', 'presencial_kids', 'decisoes_presenciais', 'decisoes_online',
    'decisoes_kids', 'online_pico', 'online_ds', 'online_ddus', 'voluntarios_escalados', 'voluntarios_checkin'];
  const comDado = futuros.filter((c) => contadores.some((k) => (c[k] || 0) > 0));

  const sat = {};
  if (cIds.length) {
    sat.kids_sessoes = await existeSatelite('kids_sessoes', cIds);
    sat.culto_producao = await existeSatelite('culto_producao', cIds);
    sat.cultos_dados_submissoes = await existeSatelite('cultos_dados_submissoes', cIds);
    sat.cultos_decisoes_pessoas = await existeSatelite('cultos_decisoes_pessoas', cIds, (q) => q.is('deleted_at', null));
    sat.app_decisoes = await existeSatelite('app_decisoes', cIds, (q) => q.is('deleted_at', null));
    sat.apresentacao_bebes = await existeSatelite('apresentacao_bebes', cIds);
  }
  const bloqueados = futuros.filter((c) =>
    contadores.some((k) => (c[k] || 0) > 0) || Object.values(sat).some((s) => s.has(c.id)));

  console.log(`\n== BLOQUEADORES (culto futuro dos tipos que saem com dado/satélite) ==`);
  if (!bloqueados.length) {
    console.log('✅ nenhum — as linhas futuras estão vazias, o DELETE do corte é seguro');
  } else {
    bloqueio = true;
    for (const c of bloqueados) {
      const motivos = [
        ...contadores.filter((k) => (c[k] || 0) > 0).map((k) => `${k}=${c[k]}`),
        ...Object.entries(sat).filter(([, s]) => s.has(c.id)).map(([t]) => t),
      ];
      console.log(`🔴 ${c.data} · ${c.nome} — ${motivos.join(', ')}`);
    }
    console.log('→ decidir na mão ANTES do dia 24 (mover o dado pro 09:30 ou aceitar perder).');
  }
  if (comDado.length && !bloqueados.length) {
    console.log(`(ℹ️ ${comDado.length} com contador >0 mas já listados acima)`);
  }

  // ── 4 · o plano, com os números de hoje ────────────────────────────────────
  const datas = [...new Set(futuros.filter((c) => c.service_type_id === t1000?.id).map((c) => c.data))];
  const slotsAtivos = slots.filter((s) => s.ativo);
  const batAbertos = batismo.filter((b) => !b.deleted_at && b.aberto).map((b) => b.horario);
  console.log(`\n== O QUE O CORTE REAL FARIA (números de hoje) ==`);
  console.log(`· criar tipo 'Domingo 09:30' herdando do 10:00 (has_kids=${t1000?.has_kids} · online=${t1000?.has_online}/${t1000?.has_online_stream} · label='${t1000?.presencial_label}')`);
  console.log(`· encerrar 08:30 e 10:00 (is_active=false + vigente_ate=2026-08-23)`);
  console.log(`· clonar ${templates.length} vínculo(s) de template de escala do 10:00 pro 09:30${templates.length ? '' : ' — ⚠️ ZERO: conferir a escala de 30/08 na mão'}`);
  console.log(`· criar ${datas.length} culto(s) 09:30 (domingos ${datas.sort()[0] || '—'} → ${datas.sort().slice(-1)[0] || '—'}) e remover ${futuros.length} linha(s) futuras dos tipos que saem`);
  console.log(`· financeiro: desativar ${slotsAtivos.filter((s) => ['domingo-8h30', 'domingo-10h'].includes(s.service_type_slug)).length} slot(s) e criar 'Domingo 9:30' 06:00–11:00 (contas ${slot10 ? 'do 10:00 (interim D2) — ou a conta NOVA se os uuids forem preenchidos' : '—'})`);
  console.log(`· batismo: fechar 08:30/10:00 e abrir 09:30 + 11:30 limite 11 (abertos hoje: ${batAbertos.join(', ') || 'nenhum'})`);
  console.log(`· view do voluntariado: anchor do bloco Domingo Manhã 08:30→09:30 (patch dinâmico, guard count==1)`);
  console.log(`· abrir o véu (cultos_config.lentes_domingo_publicas=true)`);

  for (const a of avisos) console.log(`⚠️ ${a}`);
  console.log(`\n${bloqueio
    ? '🔴 HÁ PENDÊNCIA acima — resolver antes do dia 24. O SQL aborta sozinho se rodar assim.'
    : '✅ TUDO PRONTO. No dia 24: preencher os uuids da conta nova (se houver ok do financeiro), trocar v_executar := true e rodar o SQL no editor.'}`);
})().catch((e) => { console.error('ERRO:', e.message); process.exit(1); });
