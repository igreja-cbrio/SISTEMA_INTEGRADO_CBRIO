// ============================================================================
// TESTE DE CARGA · Totem Kids (check-in 3 PCs + portão) · PRODUÇÃO ISOLADA
// ----------------------------------------------------------------------------
// Simula o culto cheio: ~60 check-ins pela API real com concorrência 3 (como
// 3 PCs), corridas de duplicidade, unicidade de código, portão (feliz, reuso,
// corrida) e desfazer. Fixtures 100% sintéticas e isoladas:
//   - culto ANTIGO (mar-abr/2026) que nunca teve sessão Kids
//   - sessão de teste criada nele (nunca é encerrada → não consolida nada)
//   - crianças "[TESTE CARGA]" via service role (sem responsáveis/membros)
//   - check-ins com responsavel_nome_manual (snapshot · não cria mem_membros)
// LIMPEZA TOTAL no final (scans → checkins → crianças → sessão) + verificação.
// ============================================================================
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const { createClient } = require('@supabase/supabase-js');

const BASE = 'https://crmcbrio.vercel.app/api';
const N_CRIANCAS = 66;          // 60 fluxo feliz + 5 corrida + 1 corrida portão
const CONCORRENCIA = 3;         // "3 PCs"

const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

const pct = (arr, p) => { const s = [...arr].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
const resumoLat = (ms) => `n=${ms.length} · p50=${pct(ms, 0.5)}ms · p95=${pct(ms, 0.95)}ms · max=${Math.max(...ms)}ms`;

async function api(token, metodo, rota, body) {
  const t0 = Date.now();
  const r = await fetch(BASE + rota, {
    method: metodo,
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = await r.json().catch(() => null);
  return { status: r.status, j, ms: Date.now() - t0 };
}

// Pool de concorrência simples
async function pool(items, limite, fn) {
  const out = [];
  let i = 0;
  const workers = Array.from({ length: limite }, async () => {
    while (i < items.length) { const idx = i++; out[idx] = await fn(items[idx], idx); }
  });
  await Promise.all(workers);
  return out;
}

(async () => {
  const falhas = [];
  const ok = (cond, msg) => { console.log((cond ? '  ✓ ' : '  ✗ ') + msg); if (!cond) falhas.push(msg); };

  // ── logins (2 contas do totem · 3 lanes) ──────────────────────────────────
  const tokens = [];
  for (const email of ['totem.kids1@cbrio.org', 'totem.kids2@cbrio.org']) {
    const c = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
    const r = await c.auth.signInWithPassword({ email, password: 'kids1234' });
    if (r.error) { console.error('login', email, r.error.message); process.exit(1); }
    tokens.push(r.data.session.access_token);
  }
  const tokenDe = (i) => tokens[i % tokens.length];

  // ── fixture: culto antigo sem sessão ──────────────────────────────────────
  const { data: cultos } = await admin.from('cultos')
    .select('id, nome, data, service_type:vol_service_types(has_kids)')
    .gte('data', '2026-03-01').lte('data', '2026-04-30').order('data');
  const { data: sessExist } = await admin.from('kids_sessoes').select('culto_id');
  const comSessao = new Set((sessExist || []).map(s => s.culto_id));
  const culto = (cultos || []).find(c => c.service_type?.has_kids && !comSessao.has(c.id));
  if (!culto) { console.error('nenhum culto antigo livre'); process.exit(1); }
  console.log(`Fixture: culto "${culto.nome}" ${culto.data} (${culto.id})`);

  const { data: sessao, error: eS } = await admin.from('kids_sessoes')
    .insert({ culto_id: culto.id, status: 'aberta', abrir_em: new Date().toISOString() })
    .select('id').single();
  if (eS) { console.error('criar sessão:', eS.message); process.exit(1); }
  console.log('Sessão de teste:', sessao.id);

  const { data: salas } = await admin.from('kids_salas').select('id, nome').eq('ativo', true).limit(3);
  if (!salas?.length) { console.error('sem salas'); process.exit(1); }

  // crianças sintéticas (insert direto · sem responsáveis)
  const payloadCriancas = Array.from({ length: N_CRIANCAS }, (_, i) => ({
    nome: `[TESTE CARGA] Criança ${String(i + 1).padStart(2, '0')}`,
    data_nascimento: '2019-05-10',
    visitante: true,
  }));
  const { data: criancas, error: eC } = await admin.from('kids_criancas').insert(payloadCriancas).select('id, nome');
  if (eC) { console.error('criar crianças:', eC.message); await limpar(sessao.id); process.exit(1); }
  console.log(`Crianças de teste: ${criancas.length}`);

  const checkinBody = (criancaId, i) => ({
    sessao_id: sessao.id, crianca_id: criancaId, sala_id: salas[i % salas.length].id,
    responsavel_nome_manual: 'Responsável Teste Carga', responsavel_telefone_manual: '21999990000',
    responsavel_parentesco: 'outro',
  });

  // ── F1 · aquecimento ──────────────────────────────────────────────────────
  console.log('\nF1 · aquecimento (2 sequenciais)');
  for (let i = 0; i < 2; i++) {
    const r = await api(tokenDe(i), 'POST', '/totem-kids/checkin', checkinBody(criancas[i].id, i));
    ok(r.status === 201, `warmup ${i + 1}: ${r.status} em ${r.ms}ms`);
  }

  // ── F2 · rajada: 58 check-ins, concorrência 3 ─────────────────────────────
  console.log(`\nF2 · rajada de ${60 - 2} check-ins · concorrência ${CONCORRENCIA} (3 PCs)`);
  const alvoF2 = criancas.slice(2, 60);
  const t2 = Date.now();
  const rs2 = await pool(alvoF2, CONCORRENCIA, (c, i) => api(tokenDe(i), 'POST', '/totem-kids/checkin', checkinBody(c.id, i)));
  const okF2 = rs2.filter(r => r.status === 201);
  ok(okF2.length === alvoF2.length, `todos 201: ${okF2.length}/${alvoF2.length} · total ${(Date.now() - t2) / 1000}s · ${resumoLat(rs2.map(r => r.ms))}`);
  for (const r of rs2.filter(x => x.status !== 201).slice(0, 3)) console.log('    erro:', r.status, JSON.stringify(r.j).slice(0, 140));

  // códigos coletados até aqui
  const codigos = [];
  for (let i = 0; i < 2; i++) codigos.push(null); // warmups preenchidos abaixo
  const { data: rowsCk } = await admin.from('kids_checkins').select('id, crianca_id, codigo_seguranca').eq('sessao_id', sessao.id);
  const codigoPorCrianca = new Map((rowsCk || []).map(r => [r.crianca_id, r.codigo_seguranca]));

  // ── F3 · corrida de duplicidade: mesma criança, 2 PCs simultâneos ─────────
  console.log('\nF3 · corrida: mesma criança em 2 PCs ao mesmo tempo (×5)');
  for (let k = 0; k < 5; k++) {
    const cri = criancas[60 + k];
    const [a, b] = await Promise.all([
      api(tokens[0], 'POST', '/totem-kids/checkin', checkinBody(cri.id, k)),
      api(tokens[1], 'POST', '/totem-kids/checkin', checkinBody(cri.id, k)),
    ]);
    const par = [a.status, b.status].sort().join('+');
    ok(par === '201+409', `par ${k + 1}: ${par} (esperado 201+409)`);
  }

  // ── F4 · unicidade dos códigos ativos ─────────────────────────────────────
  console.log('\nF4 · unicidade dos códigos');
  const { data: ativos } = await admin.from('kids_checkins').select('codigo_seguranca').eq('sessao_id', sessao.id).is('checkout_at', null);
  const lista = (ativos || []).map(a => a.codigo_seguranca);
  ok(new Set(lista).size === lista.length, `códigos distintos: ${new Set(lista).size}/${lista.length}`);

  // ── F5 · portão: fila de saída (todos os códigos, concorrência 2) ─────────
  console.log('\nF5 · portão: saída de todos (fila · concorrência 2)');
  const t5 = Date.now();
  const rs5 = await pool(lista.slice(0, 60), 2, (cod, i) => api(tokenDe(i), 'POST', '/totem-kids/portao/scan', { codigo: cod }));
  const okF5 = rs5.filter(r => r.status === 200 && r.j?.resultado === 'ok');
  ok(okF5.length === Math.min(60, lista.length), `verdes: ${okF5.length}/${Math.min(60, lista.length)} · total ${(Date.now() - t5) / 1000}s · ${resumoLat(rs5.map(r => r.ms))}`);
  ok(rs5.every(r => r.j?.sala?.nome), 'todos retornaram a sala');

  // ── F6 · portão: anomalias ────────────────────────────────────────────────
  console.log('\nF6 · portão: código reusado + lixo');
  const rs6 = await pool(lista.slice(0, 10), 2, (cod, i) => api(tokenDe(i), 'POST', '/totem-kids/portao/scan', { codigo: cod }));
  ok(rs6.every(r => r.j?.resultado === 'ja_retirada'), `re-scan → ja_retirada: ${rs6.filter(r => r.j?.resultado === 'ja_retirada').length}/10`);
  const lixo = await api(tokens[0], 'POST', '/totem-kids/portao/scan', { codigo: 'QQ11' });
  ok(lixo.j?.resultado === 'nao_reconhecido', `código lixo → ${lixo.j?.resultado}`);

  // ── F7 · portão: corrida no MESMO código ──────────────────────────────────
  console.log('\nF7 · corrida no portão (2 scans simultâneos do mesmo código)');
  const cri66 = criancas[65];
  const ck66 = await api(tokens[0], 'POST', '/totem-kids/checkin', checkinBody(cri66.id, 0));
  const cod66 = ck66.j?.codigo_seguranca;
  const [s1, s2] = await Promise.all([
    api(tokens[0], 'POST', '/totem-kids/portao/scan', { codigo: cod66 }),
    api(tokens[1], 'POST', '/totem-kids/portao/scan', { codigo: cod66 }),
  ]);
  const parPortao = [s1.j?.resultado, s2.j?.resultado].sort().join('+');
  ok(parPortao === 'ja_retirada+ok' || parPortao === 'ok+ja_retirada'.split('+').sort().join('+'), `par: ${parPortao} (esperado ja_retirada+ok)`);

  // ── F8 · desfazer (reabrir) ───────────────────────────────────────────────
  console.log('\nF8 · desfazer check-out (reabrir)');
  const alvo8 = (rowsCk || [])[0];
  const re = await api(tokens[0], 'POST', `/totem-kids/checkin/${alvo8.id}/reabrir`, {});
  ok(re.status === 200 && re.j?.ok, `reabrir: ${re.status} ${JSON.stringify(re.j)}`);

  // ── LIMPEZA TOTAL ─────────────────────────────────────────────────────────
  console.log('\n══ LIMPEZA ══');
  await limpar(sessao.id);

  console.log('\n══ RESULTADO ══');
  console.log(falhas.length === 0 ? '✅ TODOS OS TESTES PASSARAM' : `❌ ${falhas.length} falha(s):\n- ` + falhas.join('\n- '));
})().catch(async (e) => { console.error('ERRO FATAL', e); process.exit(1); });

async function limpar(sessaoId) {
  // scans do portão (dos check-ins da sessão de teste + o código lixo QQ11)
  const { data: cks } = await admin.from('kids_checkins').select('id').eq('sessao_id', sessaoId);
  const ids = (cks || []).map(c => c.id);
  if (ids.length) {
    const { error } = await admin.from('kids_portao_scans').delete().in('checkin_id', ids);
    console.log('scans (por checkin):', error?.message || 'ok');
  }
  const { error: eLixo } = await admin.from('kids_portao_scans').delete().eq('codigo', 'QQ11');
  console.log('scans (lixo QQ11):', eLixo?.message || 'ok');
  const { error: e1 } = await admin.from('kids_checkins').delete().eq('sessao_id', sessaoId);
  console.log('checkins:', e1?.message || 'ok');
  const { error: e2 } = await admin.from('kids_criancas').delete().like('nome', '[TESTE CARGA]%');
  console.log('crianças:', e2?.message || 'ok');
  const { error: e3 } = await admin.from('kids_sessoes').delete().eq('id', sessaoId);
  console.log('sessão:', e3?.message || 'ok');
  // verificação
  const { count: c1 } = await admin.from('kids_checkins').select('*', { count: 'exact', head: true }).eq('sessao_id', sessaoId);
  const { count: c2 } = await admin.from('kids_criancas').select('*', { count: 'exact', head: true }).like('nome', '[TESTE CARGA]%');
  const { count: c3 } = await admin.from('kids_sessoes').select('*', { count: 'exact', head: true }).eq('id', sessaoId);
  console.log(`verificação → checkins:${c1 ?? 0} crianças:${c2 ?? 0} sessão:${c3 ?? 0} (esperado 0/0/0)`);
}
