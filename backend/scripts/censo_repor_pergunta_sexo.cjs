#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════════
//  Repõe a pergunta "Sexo" no questionário do censo — SEM tocar em mais nada.
//
//  Contexto (16/09/2026 · pedido do Marcos): o Matheus criou a pergunta de sexo
//  com o censo já em campo (~500 respostas), o Marcos a removeu por volta das
//  800, e 299 pessoas alcançaram a janela e responderam. Depois disso a tela
//  continuou mostrando um bloco "Sexo" — mas ele NUNCA veio da pesquisa: vem de
//  `mem_membros.genero`, pelo LEFT JOIN da `vw_cen_resposta_pessoa`. Como 910
//  dos 940 respondentes têm o campo preenchido no cadastro, parecia dado do
//  censo, e 38,4% desse número é palpite de IA pelo primeiro nome confirmado em
//  lote (medido em 16/09).
//
//  ⚠️⚠️ POR QUE O ID TEM QUE SER `sexo` E AS OPÇÕES TÊM QUE SER ESTAS:
//  as 299 respostas já gravadas estão em `cen_resposta_item` com
//  `pergunta_id='sexo'` e `valor_texto` 'Masculino'/'Feminino'. Repor a
//  pergunta com OUTRO id (ou com rótulo 'M'/'F', ou 'Homem'/'Mulher') criaria
//  uma pergunta NOVA: as 299 continuariam órfãs e a tela mostraria duas
//  contagens da mesma coisa. Mesmo id + mesmos rótulos = os números somam
//  sozinhos, que é exatamente o que foi pedido ("somar os números dessa que já
//  temos, não criar uma análise extra").
//
//  ⚠️ POR QUE NÃO USAR `censo_semear_questionario.cjs`: aquele script aplica o
//  JSON INTEIRO (108 perguntas do catálogo) e a pesquisa viva tem 33 — o
//  Matheus a editou pelo construtor. Rodar o semeador aqui trocaria o
//  questionário de campo por outro. Este script é cirúrgico: insere UMA
//  pergunta e preserva o resto byte a byte.
//
//  ⚠️ NÃO mexe em `mem_membros`. Quem grava é o reconciliador, e ele só
//  preenche campo VAZIO — declaração nova não sobrescreve sexo existente, vira
//  conflito para decisão humana. É assim que a pergunta passa a AUDITAR os
//  palpites de IA em vez de apagá-los em silêncio.
//
//    node backend/scripts/censo_repor_pergunta_sexo.cjs           # dry-run
//    node backend/scripts/censo_repor_pergunta_sexo.cjs --exec    # aplica
// ════════════════════════════════════════════════════════════════════════════

const { supabase } = require('../utils/supabase');
const { validarPerguntas } = require('../utils/censoPerguntas');

const SLUG = process.env.CENSO_SLUG || 'censo-cbrio-2026';
const exec = process.argv.includes('--exec');

// A pergunta, exatamente como as 299 respostas a conhecem.
const PERGUNTA_SEXO = {
  id: 'sexo',
  tipo: 'opcao_unica',
  texto: 'Sexo',
  obrigatoria: true,
  preenche_de: 'genero',
  opcoes: ['Masculino', 'Feminino'],
};

// Vai logo depois do nome, no bloco de identificação — é onde
// ela estava e é onde a pessoa espera respondê-la.
const DEPOIS_DE = 'nome';

async function main() {
  const { data: pesquisas, error } = await supabase
    .from('cen_pesquisa')
    .select('id, slug, titulo, status, perguntas')
    .eq('slug', SLUG);
  if (error) throw error;

  // ⚠️ Slug duplicado existe na base (há uma 2ª "Censo CBRio 2026" em
  // rascunho). Escolher "a primeira" gravaria no questionário errado.
  const abertas = (pesquisas || []).filter((p) => p.status !== 'rascunho');
  if (abertas.length !== 1) {
    console.error(`Esperava 1 pesquisa não-rascunho com slug '${SLUG}', achei ${abertas.length}.`);
    (pesquisas || []).forEach((p) => console.error(`  · ${p.id} | ${p.titulo} | ${p.status}`));
    process.exit(1);
  }
  const pesquisa = abertas[0];
  const perguntas = Array.isArray(pesquisa.perguntas) ? pesquisa.perguntas : [];

  console.log(`${pesquisa.titulo} (${pesquisa.id}) · status=${pesquisa.status} · ${perguntas.length} perguntas`);

  if (perguntas.some((p) => p.id === PERGUNTA_SEXO.id)) {
    console.log('A pergunta "sexo" JÁ está no questionário — nada a fazer.');
    return;
  }
  // Destino ocupado por outra pergunta é sinal de que o questionário mudou de
  // forma que este script não previu. Para em vez de gravar no lugar errado.
  const jaTemDestino = perguntas.find((p) => p.preenche_de === 'genero');
  if (jaTemDestino) {
    console.error(`Já existe pergunta com preenche_de='genero' (id=${jaTemDestino.id}). Nada foi aplicado.`);
    process.exit(1);
  }

  const i = perguntas.findIndex((p) => p.id === DEPOIS_DE);
  const pos = i >= 0 ? i + 1 : perguntas.length;
  const novas = [...perguntas.slice(0, pos), PERGUNTA_SEXO, ...perguntas.slice(pos)];

  const { ok, erros } = validarPerguntas(novas);
  if (!ok) {
    console.error('Questionário ficaria inválido — nada foi aplicado:');
    erros.forEach((e) => console.error('  ·', e));
    process.exit(1);
  }

  // Quantas respostas já existem para esta pergunta — é o número que passa a
  // somar no bloco "Quem respondeu" assim que ela volta.
  const { count } = await supabase
    .from('cen_resposta_item')
    .select('id', { count: 'exact', head: true })
    .eq('pesquisa_id', pesquisa.id)
    .eq('pergunta_id', PERGUNTA_SEXO.id);

  console.log(`  posição: ${pos} de ${novas.length} (depois de '${DEPOIS_DE}')`);
  console.log(`  respostas já gravadas que voltam a contar: ${count ?? '?'}`);

  if (!exec) {
    console.log('\nDRY-RUN. Rode com --exec para aplicar.');
    return;
  }

  // ⚠️ Guarda otimista: só grava se as perguntas ainda forem as que li. Outra
  // sessão editando pelo construtor entre a leitura e a escrita perderia a
  // edição inteira — o `perguntas` daqui é o array COMPLETO.
  const { data: atual } = await supabase
    .from('cen_pesquisa').select('perguntas').eq('id', pesquisa.id).maybeSingle();
  if (JSON.stringify(atual?.perguntas) !== JSON.stringify(perguntas)) {
    console.error('O questionário mudou durante a execução. Nada foi aplicado — rode de novo.');
    process.exit(1);
  }

  const { error: eUp } = await supabase
    .from('cen_pesquisa')
    .update({ perguntas: novas, updated_at: new Date().toISOString() })
    .eq('id', pesquisa.id);
  if (eUp) throw eUp;

  console.log(`\n✅ Pergunta "Sexo" reposta. ${novas.length} perguntas no questionário.`);
}

main().catch((e) => { console.error('ERRO:', e.message); process.exit(1); });
