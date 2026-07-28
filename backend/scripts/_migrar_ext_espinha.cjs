// ============================================================================
// MIGRAÇÃO Eventos Externos → ESPINHA (SPEC-04 passos 2-3 · F3.2)
//
// Copia ext_eventos → insc_eventos e ext_inscricoes → inscricoes com
// legado_ref/legado_fonte, preservando id de origem, created_at, número da
// sorte, respostas (dados) e soft-deletes. IDEMPOTENTE: upsert lógico por
// legado_ref (o UNIQUE parcial da migration 20260729040000 é o guarda-corpo).
//
// A VIRADA do público é o flip rascunho→publicado: a página /evento/:slug é
// fonte dupla (espinha primeiro), então publicar o evento migrado move o QR
// pra espinha na hora, no mesmo endereço. ROLLBACK: soft-delete do evento na
// espinha → o público volta a cair no ext em segundos.
//
// Uso (na raiz do repo, com backend/.env presente):
//   node backend/scripts/_migrar_ext_espinha.cjs               # DRY-RUN (só relatório)
//   node backend/scripts/_migrar_ext_espinha.cjs --exec        # migra + flip + catch-up + verificação
//   node backend/scripts/_migrar_ext_espinha.cjs --verificar   # só a verificação §3 (re-conferir depois)
//
// Sequência do --exec:
//   1. snapshot do ext          4. verificação PRÉ-flip (contagens batem?)
//   2. eventos como RASCUNHO    5. FLIP → publicado (público vira pra espinha)
//   3. cópia das inscrições     6. catch-up (o que entrou no ext no meio)
//      + sorteios               7. verificação FINAL (SPEC-04 §3)
// ============================================================================
const fs = require('fs');
const path = require('path');
const os = require('os');

// Roda tanto do checkout principal quanto de um worktree (que não tem
// node_modules/.env próprios — cai no checkout principal).
const CANDIDATOS = [
  path.join(__dirname, '..'),
  path.join(os.homedir(), 'SISTEMA_INTEGRADO_CBRIO', 'backend'),
];
const BACKEND_DEPS = CANDIDATOS.find((p) => fs.existsSync(path.join(p, 'node_modules', '@supabase', 'supabase-js')));
const BACKEND_ENV = CANDIDATOS.find((p) => fs.existsSync(path.join(p, '.env')));
if (!BACKEND_DEPS || !BACKEND_ENV) {
  console.error('Não achei node_modules/@supabase/supabase-js ou o .env do backend.');
  process.exit(1);
}
const { createClient } = require(path.join(BACKEND_DEPS, 'node_modules', '@supabase', 'supabase-js'));

const env = {};
for (const linha of fs.readFileSync(path.join(BACKEND_ENV, '.env'), 'utf8').split(/\r?\n/)) {
  const m = linha.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const EXEC = process.argv.includes('--exec');
const SO_VERIFICAR = process.argv.includes('--verificar');

// Decisão do Marcos (28/07): área "Sede" pros dois eventos do Celebra.
// Evento futuro sem entrada aqui também cai em Sede (revisar se mudar).
const AREA_POR_SLUG = {};
const AREA_DEFAULT = 'Sede';

async function fetchAll(tabela, select = '*', mod = (q) => q) {
  const out = [];
  const page = 1000;
  for (let off = 0; ; off += page) {
    const { data, error } = await mod(
      supabase.from(tabela).select(select).range(off, off + page - 1)
    );
    if (error) throw new Error(`${tabela}: ${error.message}`);
    out.push(...(data || []));
    if (!data || data.length < page) break;
  }
  return out;
}

function linhaInscricao(i, eventoEspinhaId) {
  return {
    evento_id: eventoEspinhaId,
    membro_id: i.membro_id,
    nome_completo: i.nome,
    telefone: i.telefone || null,
    cpf: i.cpf || null,
    email: i.email || null,
    data_nascimento: i.data_nascimento || null,
    sexo: i.sexo || null,
    endereco: i.endereco || null,
    dados: i.dados || {},
    dados_anterior: i.dados_anterior || null,
    status: i.status === 'cancelada' ? 'cancelada' : 'confirmada',
    origem: i.origem || 'formulario_publico',
    numero_sorte: i.numero_sorte,
    whatsapp_optin: !!i.whatsapp_optin,
    whatsapp_optin_em: i.whatsapp_optin_em || null,
    created_at: i.created_at,
    updated_at: i.updated_at || i.created_at,
    deleted_at: i.deleted_at || null,
    legado_ref: i.id,
    legado_fonte: 'ext_inscricoes',
  };
}

// Campos comparados na amostra da verificação (§3: "20 linhas campo a campo")
const CAMPOS_AMOSTRA = [
  ['nome', 'nome_completo'], ['telefone', 'telefone'], ['cpf', 'cpf'],
  ['email', 'email'], ['data_nascimento', 'data_nascimento'], ['sexo', 'sexo'],
  ['endereco', 'endereco'], ['status', 'status'], ['origem', 'origem'],
  ['numero_sorte', 'numero_sorte'], ['whatsapp_optin', 'whatsapp_optin'],
  ['created_at', 'created_at'], ['deleted_at', 'deleted_at'],
];

async function verificar(extEventos, prefixo) {
  console.log(`\n=== VERIFICAÇÃO ${prefixo} (SPEC-04 §3) ===`);
  let ok = true;

  const espEventos = await fetchAll('insc_eventos', 'id, slug, nome, status, legado_ref, legado_fonte',
    (q) => q.eq('legado_fonte', 'ext_eventos'));
  const porLegado = new Map(espEventos.map((e) => [e.legado_ref, e]));

  for (const ev of extEventos) {
    const esp = porLegado.get(ev.id);
    if (!esp) { console.log(`✗ "${ev.nome}": SEM evento correspondente na espinha`); ok = false; continue; }

    const extInsc = await fetchAll('ext_inscricoes', '*', (q) => q.eq('evento_id', ev.id));
    const espInsc = await fetchAll('inscricoes', '*',
      (q) => q.eq('evento_id', esp.id).eq('legado_fonte', 'ext_inscricoes'));

    const extAtivas = extInsc.filter((i) => !i.deleted_at).length;
    const espAtivas = espInsc.filter((i) => !i.deleted_at).length;
    const bate = extAtivas === espAtivas;
    if (!bate) ok = false;
    console.log(`${bate ? '✓' : '✗'} "${ev.nome}" [${esp.status}]: ext ativas=${extAtivas} · espinha legadas ativas=${espAtivas}${bate ? '' : '  ⚠️ DIVERGÊNCIA'}`);

    // amostra: 10 primeiras + 10 últimas por created_at, campo a campo
    const espPorRef = new Map(espInsc.map((i) => [i.legado_ref, i]));
    const ordenadas = [...extInsc].sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
    const amostra = [...ordenadas.slice(0, 10), ...ordenadas.slice(-10)]
      .filter((v, idx, arr) => arr.findIndex((x) => x.id === v.id) === idx);
    let divergentes = 0;
    for (const orig of amostra) {
      const mig = espPorRef.get(orig.id);
      if (!mig) { console.log(`  ✗ amostra: ${orig.id} não migrada`); divergentes++; continue; }
      for (const [de, para] of CAMPOS_AMOSTRA) {
        const a = orig[de]; const b = mig[para];
        const igual = (a ?? null) === (b ?? null)
          || String(a ?? '') === String(b ?? '')
          || (de === 'status' && !a && b === 'confirmada');
        if (!igual) { console.log(`  ✗ ${orig.id} campo ${de}: ext=${JSON.stringify(a)} espinha=${JSON.stringify(b)}`); divergentes++; }
      }
      if (JSON.stringify(orig.dados || {}) !== JSON.stringify(mig?.dados || {})) {
        console.log(`  ✗ ${orig.id} campo dados: JSON difere`); divergentes++;
      }
    }
    if (divergentes) ok = false;
    console.log(`  amostra de ${amostra.length} linhas campo a campo: ${divergentes === 0 ? '✓ todas idênticas' : `✗ ${divergentes} divergências`}`);

    const extSorteios = await fetchAll('ext_sorteios', 'id', (q) => q.eq('evento_id', ev.id));
    const espSorteios = await fetchAll('insc_sorteios', 'id', (q) => q.eq('evento_id', esp.id));
    console.log(`  sorteios: ext=${extSorteios.length} · espinha=${espSorteios.length} ${extSorteios.length === espSorteios.length ? '✓' : '(espinha pode ter sorteios novos pós-virada)'}`);
  }
  console.log(ok ? '\n✅ VERIFICAÇÃO PASSOU — zero diferença de contagem.' : '\n❌ VERIFICAÇÃO FALHOU — ver divergências acima.');
  return ok;
}

(async () => {
  const snapshotIso = new Date(Date.now() - 60 * 1000).toISOString(); // margem de 60s pro catch-up

  const extEventos = (await fetchAll('ext_eventos', '*')).filter((e) => !e.deleted_at);
  if (SO_VERIFICAR) { await verificar(extEventos, 'AVULSA'); return; }

  const extInscricoes = await fetchAll('ext_inscricoes', '*');
  const extSorteios = await fetchAll('ext_sorteios', '*');
  const jaMigradosEv = await fetchAll('insc_eventos', 'id, slug, legado_ref', (q) => q.eq('legado_fonte', 'ext_eventos'));
  const jaMigradasInsc = await fetchAll('inscricoes', 'legado_ref', (q) => q.eq('legado_fonte', 'ext_inscricoes'));
  const slugsEspinha = new Set((await fetchAll('insc_eventos', 'slug', (q) => q.is('deleted_at', null))).map((e) => e.slug));
  const evMigrado = new Map(jaMigradosEv.map((e) => [e.legado_ref, e]));
  const inscMigrada = new Set(jaMigradasInsc.map((i) => i.legado_ref));

  console.log(`=== PLANO ${EXEC ? '(EXECUÇÃO REAL)' : '(DRY-RUN — nada será escrito)'} ===`);
  for (const ev of extEventos) {
    const insc = extInscricoes.filter((i) => i.evento_id === ev.id);
    const faltam = insc.filter((i) => !inscMigrada.has(i.id)).length;
    const area = AREA_POR_SLUG[ev.slug] || AREA_DEFAULT;
    const conflitoSlug = !evMigrado.has(ev.id) && slugsEspinha.has(ev.slug);
    console.log([
      evMigrado.has(ev.id) ? '· evento JÁ migrado' : '+ criar evento',
      `"${ev.nome}" slug=${ev.slug} área=${area}`,
      `inscrições: ${insc.length} total (${faltam} a copiar)`,
      `sorteios: ${extSorteios.filter((s) => s.evento_id === ev.id).length}`,
      conflitoSlug ? '⚠️ CONFLITO DE SLUG (evento nativo já usa — ABORTARIA)' : '',
    ].filter(Boolean).join(' · '));
    if (conflitoSlug) { console.log('ABORTADO: resolva o slug antes.'); process.exit(1); }
  }
  if (!EXEC) { console.log('\nDry-run. Rode com --exec pra migrar de verdade.'); return; }

  // ── 2+3. eventos (rascunho) + inscrições + sorteios ──
  const idEspinhaPorExt = new Map();
  for (const ev of extEventos) {
    let alvo = evMigrado.get(ev.id);
    if (!alvo) {
      const { data, error } = await supabase.from('insc_eventos').insert({
        nome: ev.nome, slug: ev.slug,
        area: AREA_POR_SLUG[ev.slug] || AREA_DEFAULT,
        tipo: 'evento',
        descricao: ev.descricao, data: ev.data, hora: ev.hora, local: ev.local,
        capa_url: ev.capa_url, campos: ev.campos || [],
        vagas: null,
        inscricoes_encerram_em: ev.inscricoes_encerram_em,
        msg_sucesso_titulo: ev.msg_sucesso_titulo, msg_sucesso_texto: ev.msg_sucesso_texto,
        msg_whatsapp: ev.msg_whatsapp,
        tem_sorteio: !!ev.tem_sorteio, premios: ev.premios || [],
        checkin_ativo: false,
        status: 'rascunho', // o flip pra publicado é a VIRADA — só após conferir contagens
        created_by: ev.created_by || null,
        created_at: ev.created_at,
        legado_ref: ev.id, legado_fonte: 'ext_eventos',
      }).select('id, slug').single();
      if (error) throw new Error(`criar evento "${ev.nome}": ${error.message}`);
      alvo = data;
      console.log(`+ evento criado (rascunho): "${ev.nome}" → ${data.id}`);
    }
    idEspinhaPorExt.set(ev.id, alvo.id);

    const pendentes = extInscricoes
      .filter((i) => i.evento_id === ev.id && !inscMigrada.has(i.id))
      .map((i) => linhaInscricao(i, alvo.id));
    for (let k = 0; k < pendentes.length; k += 200) {
      const lote = pendentes.slice(k, k + 200);
      const { error } = await supabase.from('inscricoes').insert(lote);
      if (error) throw new Error(`copiar inscrições de "${ev.nome}" (lote ${k / 200 + 1}): ${error.message}`);
    }
    if (pendentes.length) console.log(`+ ${pendentes.length} inscrições copiadas de "${ev.nome}"`);

    // sorteios históricos (hoje 0 — cobre re-execuções futuras)
    const sorteiosEv = extSorteios.filter((s) => s.evento_id === ev.id);
    if (sorteiosEv.length) {
      const { data: jaTem } = await supabase.from('insc_sorteios').select('id').eq('evento_id', alvo.id).limit(1);
      if (!jaTem || !jaTem.length) {
        const refInsc = await fetchAll('inscricoes', 'id, legado_ref',
          (q) => q.eq('evento_id', alvo.id).eq('legado_fonte', 'ext_inscricoes'));
        const idPorRef = new Map(refInsc.map((i) => [i.legado_ref, i.id]));
        const { error } = await supabase.from('insc_sorteios').insert(sorteiosEv.map((s) => ({
          evento_id: alvo.id, premio: s.premio, numero_sorteado: s.numero_sorteado,
          inscricao_id: idPorRef.get(s.inscricao_id) || null,
          ganhador_nome: s.ganhador_nome, sorteado_em: s.sorteado_em, sorteado_por: s.sorteado_por || null,
        })));
        if (error) throw new Error(`copiar sorteios de "${ev.nome}": ${error.message}`);
        console.log(`+ ${sorteiosEv.length} sorteios copiados de "${ev.nome}"`);
      }
    }
  }

  // ── 4. verificação PRÉ-flip: contagens têm que bater ANTES de virar o público ──
  const preOk = await verificar(extEventos, 'PRÉ-FLIP');
  if (!preOk) { console.log('\n⛔ FLIP NÃO EXECUTADO — contagens divergem. Nada mudou pro público.'); process.exit(1); }

  // ── 5. FLIP: publicado → o QR passa a resolver na espinha (mesmo endereço) ──
  for (const ev of extEventos) {
    const { error } = await supabase.from('insc_eventos')
      .update({ status: 'publicado' })
      .eq('id', idEspinhaPorExt.get(ev.id)).eq('status', 'rascunho');
    if (error) throw new Error(`flip de "${ev.nome}": ${error.message}`);
    console.log(`🔁 FLIP: "${ev.nome}" publicado — /evento/${ev.slug} agora é servido pela espinha`);
  }

  // ── 6. catch-up: inscrições que entraram/mudaram no ext entre snapshot e flip ──
  const { data: tardias, error: eT } = await supabase.from('ext_inscricoes')
    .select('*').gte('updated_at', snapshotIso);
  if (eT) throw new Error(`catch-up: ${eT.message}`);
  let novas = 0, atualizadas = 0;
  for (const i of tardias || []) {
    const alvo = idEspinhaPorExt.get(i.evento_id);
    if (!alvo) continue;
    const { data: exist } = await supabase.from('inscricoes')
      .select('id').eq('legado_fonte', 'ext_inscricoes').eq('legado_ref', i.id).maybeSingle();
    if (exist) {
      const l = linhaInscricao(i, alvo);
      delete l.created_at; delete l.evento_id; delete l.legado_ref; delete l.legado_fonte;
      const { error } = await supabase.from('inscricoes').update(l).eq('id', exist.id);
      if (!error) atualizadas++;
    } else {
      const { error } = await supabase.from('inscricoes').insert(linhaInscricao(i, alvo));
      if (!error) novas++;
    }
  }
  console.log(`catch-up: ${novas} novas · ${atualizadas} atualizadas (janela desde ${snapshotIso})`);

  // ── 7. verificação FINAL ──
  await verificar(extEventos, 'FINAL');
  console.log('\nPronto. Rollback de emergência: soft-delete dos eventos migrados na espinha (o público volta pro ext na hora).');
})().catch((e) => { console.error('ERRO:', e.message); process.exit(1); });
