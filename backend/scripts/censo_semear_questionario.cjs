#!/usr/bin/env node
// Semeia (ou atualiza) o questionário do Censo CBRio a partir do JSON que é a
// FONTE DE VERDADE: backend/data/censoQuestionario2026.json.
//
// Por que script e não migration: o questionário é DADO, não schema. Ele vai
// ser revisado (a especificação deixou três listas de opções em aberto), e
// revisar dado editando migration antiga é o caminho para duas versões
// divergentes do mesmo censo. Aqui há um arquivo, versionado, com teste
// (src/test/censoQuestionario2026.test.ts), e este script o aplica.
//
//   node backend/scripts/censo_semear_questionario.cjs            # aplica
//   node backend/scripts/censo_semear_questionario.cjs --dry-run  # só mostra
//
// Idempotente: casa pela `slug`. Se a pesquisa já existe, ATUALIZA as perguntas
// preservando id, status e respostas já coletadas.
//
// ⚠️ TRAVA: não altera perguntas de pesquisa que já tem resposta, a menos que
//    venha --forcar. Trocar o questionário por baixo de dado coletado deixa
//    resposta órfã e gráfico zerado — é o erro que não dá para desfazer.

const path = require('path');
const { supabase } = require('../utils/supabase');
const { validarPerguntas } = require('../utils/censoPerguntas');

const ARQUIVO = path.join(__dirname, '..', 'data', 'censoQuestionario2026.json');
const dryRun = process.argv.includes('--dry-run');
const forcar = process.argv.includes('--forcar');

async function main() {
  const doc = require(ARQUIVO);
  const { ok, erros, perguntas } = validarPerguntas(doc.perguntas);
  if (!ok) {
    console.error('Questionário inválido — nada foi aplicado:');
    for (const e of erros) console.error('  ·', e);
    process.exit(1);
  }

  const respondiveis = perguntas.filter((p) => p.tipo !== 'secao');
  const gatilhos = respondiveis.filter((p) => p.acao === 'cuidado');
  console.log(`${doc.titulo} (${doc.slug})`);
  console.log(`  ${perguntas.filter((p) => p.tipo === 'secao').length} blocos · ${respondiveis.length} perguntas`);
  console.log(`  ${respondiveis.filter((p) => p.mostrar_se).length} condicionais · ${respondiveis.filter((p) => p.sensivel).length} sensíveis`);
  console.log(`  gatilhos de cuidado: ${gatilhos.map((p) => p.cuidado_tipo).join(', ') || 'nenhum'}`);

  const { data: existente, error: e0 } = await supabase
    .from('cen_pesquisa').select('id, status, titulo')
    .eq('slug', doc.slug).is('deleted_at', null).maybeSingle();
  if (e0) throw new Error(e0.message);

  if (existente) {
    const { count } = await supabase
      .from('cen_resposta').select('id', { count: 'exact', head: true })
      .eq('pesquisa_id', existente.id).is('deleted_at', null);
    if ((count || 0) > 0 && !forcar) {
      console.error(`\nA pesquisa já tem ${count} resposta(s). Trocar o questionário agora`);
      console.error('deixaria resposta órfã e gráfico zerado. Use --forcar se for isso mesmo.');
      process.exit(1);
    }
    if (dryRun) { console.log('\n[dry-run] atualizaria a pesquisa existente', existente.id); return; }
    const { error } = await supabase.from('cen_pesquisa').update({
      titulo: doc.titulo, subtitulo: doc.subtitulo ?? null, tipo: doc.tipo || 'censo', perguntas,
    }).eq('id', existente.id);
    if (error) throw new Error(error.message);
    console.log(`\natualizada: ${existente.id} (status ${existente.status}, preservado)`);
    return;
  }

  if (dryRun) { console.log('\n[dry-run] criaria a pesquisa em rascunho'); return; }
  const { data, error } = await supabase.from('cen_pesquisa').insert({
    slug: doc.slug,
    titulo: doc.titulo,
    subtitulo: doc.subtitulo ?? null,
    tipo: doc.tipo || 'censo',
    status: 'rascunho',   // publicar é ato separado e explícito
    perguntas,
    config: { exige_identificacao: true, permite_anonimo: false, mostrar_progresso: true },
  }).select('id').single();
  if (error) throw new Error(error.message);
  console.log(`\ncriada em rascunho: ${data.id}`);
  console.log('Abra /censo para revisar e publicar.');
}

main().catch((e) => { console.error(e.message); process.exit(1); });
