#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════════
//  CENSO · unifica resposta antiga que hoje tem outro rótulo
//
//  Uso:  node backend/scripts/_unificar_vocabulario_censo.cjs          (simula)
//        node backend/scripts/_unificar_vocabulario_censo.cjs --exec   (grava)
//
//  ⚠️⚠️ POR QUE (14/09/2026 · pedido do Marcos: *"escolaridade superior e ensino
//  superior são a mesma coisa... adeque as respostas antigas"*).
//
//  A opção da pergunta de escolaridade se chamava **"Superior"** e virou
//  **"Superior completo"**. O gráfico passou a mostrar DUAS barras para a mesma
//  escolaridade, e o cadastro guardou dois slugs: 310 `superior_completo` e
//  7 `superior`.
//
//  ⚠️ O VALOR VIVE EM TRÊS LUGARES, e mexer em um só é pior que não mexer:
//    1. `cen_resposta_item.valor_texto` → é o que o gráfico agrega;
//    2. `cen_resposta.payload`          → é a FONTE que reconstrói o item
//       (`reconstruirItensSeFaltam`); se ficar para trás, o valor antigo volta;
//    3. `mem_membros.escolaridade`      → é o que a ficha da pessoa mostra.
//
//  ⚠️ CONVERSÃO SÓ QUANDO É A MESMA COISA. As faixas de idade dos filhos também
//  mudaram ("6 a 12 anos" virou "7 a 9" + "10 a 12"), e essas NÃO entram aqui:
//  escolher uma das novas seria inventar a idade do filho de alguém. Elas ficam
//  como estão, com o rótulo antigo, que é honesto.
// ════════════════════════════════════════════════════════════════════════════
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const fs = require('fs');
const path = require('path');

const URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };
const EXEC = process.argv.includes('--exec');
const PESQUISA_SLUG = 'censo-cbrio-2026';

/** De-para do que é a MESMA resposta com outro nome. Rótulo antigo → atual. */
const ROTULOS = {
  p13_escolaridade: { Superior: 'Superior completo' },
};
/** No cadastro o valor é slug, não rótulo. */
const SLUGS_CADASTRO = {
  escolaridade: { superior: 'superior_completo' },
};

async function tudo(q) {
  const out = [];
  for (let de = 0; ; de += 1000) {
    const r = await fetch(`${URL}/rest/v1/${q}`, { headers: { ...H, Range: `${de}-${de + 999}` } });
    const l = await r.json();
    if (!Array.isArray(l)) throw new Error(JSON.stringify(l).slice(0, 200));
    out.push(...l);
    if (l.length < 1000 || de > 60000) return out;
  }
}
const patch = (q, body) => fetch(`${URL}/rest/v1/${q}`, {
  method: 'PATCH', headers: { ...H, Prefer: 'return=minimal' }, body: JSON.stringify(body),
});

(async () => {
  const [pesq] = await tudo(`cen_pesquisa?slug=eq.${PESQUISA_SLUG}&select=id`);
  const P = pesq.id;
  const plano = { itens: [], payloads: [], cadastros: [] };

  // ── 1. itens (o que o gráfico soma) ──
  for (const [perguntaId, mapa] of Object.entries(ROTULOS)) {
    for (const [antigo, novo] of Object.entries(mapa)) {
      const linhas = await tudo(
        `cen_resposta_item?pesquisa_id=eq.${P}&pergunta_id=eq.${perguntaId}`
        + `&valor_texto=eq.${encodeURIComponent(antigo)}&select=id,resposta_id`,
      );
      for (const l of linhas) plano.itens.push({ id: l.id, resposta_id: l.resposta_id, perguntaId, antigo, novo });
    }
  }

  // ── 2. payload (a fonte que reconstrói o item) ──
  const respostas = await tudo(`cen_resposta?pesquisa_id=eq.${P}&deleted_at=is.null&select=id,payload`);
  for (const r of respostas) {
    for (const [perguntaId, mapa] of Object.entries(ROTULOS)) {
      const v = r.payload && r.payload[perguntaId];
      if (typeof v === 'string' && mapa[v]) {
        plano.payloads.push({ id: r.id, perguntaId, antigo: v, novo: mapa[v] });
      }
    }
  }

  // ── 3. cadastro (o que a ficha mostra) ──
  for (const [coluna, mapa] of Object.entries(SLUGS_CADASTRO)) {
    for (const [antigo, novo] of Object.entries(mapa)) {
      const linhas = await tudo(`mem_membros?${coluna}=eq.${antigo}&select=id,nome`);
      for (const l of linhas) plano.cadastros.push({ id: l.id, nome: l.nome, coluna, antigo, novo });
    }
  }

  console.log('═'.repeat(64));
  console.log(EXEC ? 'UNIFICANDO VOCABULÁRIO' : 'SIMULAÇÃO (use --exec para gravar)');
  console.log('═'.repeat(64));
  console.log(`  itens do censo a renomear:   ${plano.itens.length}`);
  console.log(`  payloads a acertar:          ${plano.payloads.length}`);
  console.log(`  cadastros a unificar:        ${plano.cadastros.length}`);
  for (const c of plano.cadastros.slice(0, 10)) console.log(`     ${String(c.nome).slice(0, 34).padEnd(34)} ${c.antigo} → ${c.novo}`);

  if (!EXEC) { console.log('\n(nada gravado)'); return; }

  const backup = path.join(__dirname, `_backup_vocabulario_${Date.now()}.json`);
  fs.writeFileSync(backup, JSON.stringify(plano, null, 2));
  console.log(`\nbackup do de-para: ${backup}`);

  let ok = 0; let erro = 0;
  for (const i of plano.itens) {
    const r = await patch(`cen_resposta_item?id=eq.${i.id}`, { valor_texto: i.novo });
    r.ok ? ok++ : (erro++, console.log('  falhou item', i.id, await r.text()));
  }
  for (const p of plano.payloads) {
    const [atual] = await tudo(`cen_resposta?id=eq.${p.id}&select=payload`);
    const novoPayload = { ...(atual.payload || {}), [p.perguntaId]: p.novo };
    const r = await patch(`cen_resposta?id=eq.${p.id}`, { payload: novoPayload });
    r.ok ? ok++ : (erro++, console.log('  falhou payload', p.id, await r.text()));
  }
  for (const c of plano.cadastros) {
    const r = await patch(`mem_membros?id=eq.${c.id}`, { [c.coluna]: c.novo });
    r.ok ? ok++ : (erro++, console.log('  falhou cadastro', c.id, await r.text()));
  }
  console.log(`\n✔ ${ok} atualização(ões) · ${erro} falha(s)`);
})().catch((e) => { console.error('ERRO:', e.message); process.exit(1); });
