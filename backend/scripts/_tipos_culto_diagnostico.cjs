#!/usr/bin/env node
// Diagnóstico dos TIPOS DE CULTO (`vol_service_types`) — 100% SOMENTE LEITURA.
// Este script NUNCA escreve: não tem --exec e não existe caminho de UPDATE aqui.
//
// Por que ele existe (24/09/2026): até esta data o CRUD de tipo de culto não
// aceitava as flags que DEFINEM o culto, então todo tipo criado pela tela nasceu
// nos defaults da coluna — e os defaults são OPOSTOS entre si:
//
//   has_online_stream  DEFAULT true    ← é o portão do cron que MATERIALIZA culto
//   has_kids           DEFAULT false   ← sem isto, criança não faz check-in
//   has_online         DEFAULT false   ← sem isto, o pipeline online ignora
//   presencial_label   DEFAULT 'Presencial'  ← 'Sede' é o discriminador do templo
//
// O conserto do CRUD vale daqui pra frente. Este script responde a outra
// pergunta: **o que já está errado hoje?** As flags certas dependem do que o
// culto É — o código não sabe. Por isso ele RELATA e nunca conserta: quem decide
// é gente.
//
// Uso:  node backend/scripts/_tipos_culto_diagnostico.cjs
const fs = require('fs');
const path = require('path');
const os = require('os');

const LOCAL = path.join(__dirname, '..');
const PRINCIPAL = path.join(os.homedir(), 'Documents', 'SISTEMA_INTEGRADO_CBRIO', 'backend');
const CANDIDATOS = [LOCAL, PRINCIPAL, path.join(os.homedir(), 'SISTEMA_INTEGRADO_CBRIO', 'backend')];

function carregarEnv() {
  for (const dir of CANDIDATOS) {
    const f = path.join(dir, '.env');
    if (!fs.existsSync(f)) continue;
    const env = {};
    for (const l of fs.readFileSync(f, 'utf8').split(/\r?\n/)) {
      const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
    if (env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY) return env;
  }
  throw new Error(
    'SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY não encontrados. Procurei em:\n  ' +
    CANDIDATOS.map((d) => path.join(d, '.env')).join('\n  ')
  );
}
function resolverModulo(nome) {
  for (const dir of [LOCAL, PRINCIPAL]) {
    try { return require(path.join(dir, 'node_modules', nome)); } catch { /* próximo */ }
  }
  return require(nome);
}

const env = carregarEnv();
const { createClient } = resolverModulo('@supabase/supabase-js');
const sb = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

// "Hoje" em BRT — o dia de operação da igreja não é UTC (às 21h do Rio o dia
// UTC já virou, e a janela de 90 dias sairia deslocada).
const hojeBRT = () => new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10);
const somaDias = (iso, n) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

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

(async () => {
  const hoje = hojeBRT();
  const ha90 = somaDias(hoje, -90);

  const tipos = await todas('vol_service_types', '*');
  // ⚠️ `cultos` não tem soft-delete próprio aqui; se um dia tiver, filtrar.
  const cultos = await todas('cultos', 'id, service_type_id, data, presencial_kids, decisoes_kids',
    (q) => q.gte('data', ha90));

  const porTipo = new Map();
  for (const c of cultos) {
    if (!c.service_type_id) continue;
    const a = porTipo.get(c.service_type_id) || { total: 0, futuros: 0, kids: 0 };
    a.total += 1;
    if (c.data > hoje) a.futuros += 1;
    if ((c.presencial_kids || 0) > 0 || (c.decisoes_kids || 0) > 0) a.kids += 1;
    porTipo.set(c.service_type_id, a);
  }

  const achados = [];
  const linha = (t) => {
    const a = porTipo.get(t.id) || { total: 0, futuros: 0, kids: 0 };
    return { t, a };
  };

  console.log(`\n=== TIPOS DE CULTO · diagnóstico (${hoje} BRT · janela 90 dias) ===\n`);
  console.log('ativo  materializa  kids  online  rótulo            cultos/90d  nome');
  console.log('-'.repeat(96));

  for (const { t, a } of tipos.map(linha).sort((x, y) => Number(y.t.is_active) - Number(x.t.is_active) || x.t.name.localeCompare(y.t.name))) {
    const m = t.has_online_stream ? 'sim' : 'NÃO';
    console.log(
      `${t.is_active ? '  ✓  ' : '  –  '}  ${m.padEnd(11)}  ${(t.has_kids ? 'sim' : 'não').padEnd(4)}  ` +
      `${(t.has_online ? 'sim' : 'não').padEnd(6)}  ${String(t.presencial_label || '').padEnd(16)}  ` +
      `${String(a.total).padStart(10)}  ${t.name}`
    );

    if (!t.is_active) continue;

    // A · o caso Bridge: o cron não materializa, mas os cultos existem.
    if (!t.has_online_stream && a.total > 0) {
      achados.push(`[A] "${t.name}": has_online_stream=false (o cron NÃO cria os cultos dele) e mesmo assim há ${a.total} culto(s) nos últimos 90 dias — alguém os cria à mão, ou eles vieram de outro caminho.`);
    }
    // B · materializa mas o pipeline online o ignora.
    if (t.has_online_stream && !t.has_online) {
      achados.push(`[B] "${t.name}": materializa culto (has_online_stream=true) mas has_online=false — o live-monitor o ignora e devolve "fora_de_janela", que aponta a causa errada.`);
    }
    // C · culto de domingo fora do discriminador do templo.
    if (/^domingo/i.test(t.name) && t.presencial_label !== 'Sede') {
      achados.push(`[C] "${t.name}": presencial_label='${t.presencial_label}' — o Dashboard Semanal separa os cultos do templo por 'Sede', então este fica FORA do bloco de domingo e da ocupação.`);
    }
    // D · houve criança num culto de tipo marcado sem Kids.
    if (!t.has_kids && a.kids > 0) {
      achados.push(`[D] "${t.name}": has_kids=false, mas ${a.kids} culto(s) dos últimos 90 dias têm presença ou decisão de Kids lançada — o totem e o resumo Kids tratam este tipo como sem Kids.`);
    }
    // E · ativo e inerte.
    if (t.recurrence_day == null || !t.recurrence_time) {
      achados.push(`[E] "${t.name}": ativo mas sem dia/hora de recorrência — nunca vai ser materializado pelo cron.`);
    }
  }

  console.log(`\n${tipos.length} tipos (${tipos.filter((t) => t.is_active).length} ativos) · ${cultos.length} cultos na janela\n`);

  if (!achados.length) {
    console.log('Nenhuma incoerência encontrada nas 5 regras conferidas.\n');
  } else {
    console.log(`=== ${achados.length} PONTO(S) PARA DECISÃO HUMANA ===\n`);
    for (const a of achados) console.log(`  · ${a}\n`);
    console.log('Este script NÃO corrige nada: a flag certa depende do que o culto É.');
    console.log('Corrija pela tela (Voluntariado → Tipos de Culto → editar).\n');
  }
})().catch((e) => { console.error('\n🔴', e.message, '\n'); process.exit(1); });
