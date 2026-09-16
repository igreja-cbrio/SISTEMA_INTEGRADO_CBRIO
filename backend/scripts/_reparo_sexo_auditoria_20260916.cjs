#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════════
//  Repara o SEXO dos cadastros apontados pela auditoria nome-a-nome de 16/09.
//
//  Contexto: a varredura dos 931 pares nome→sexo da base (1.856 pessoas com o
//  campo) achou 28 suspeitos — e NENHUM veio do palpite de IA de 13/09.
//
//  ⚠️⚠️ A LEI QUE DECIDE O QUE ENTRA AQUI: **a declaração da própria pessoa
//  vence o palpite pelo nome.** É a lei de 10/08 ("nunca inferir sexo por nome e
//  gravar como se fosse declarado") aplicada ao contrário — sobrescrever o que
//  alguém declarou de si porque o nome "parece" de outro sexo é exatamente o
//  constrangimento que esta auditoria existe pra evitar, na direção oposta.
//
//  Por isso TRÊS casos do relatório original NÃO estão aqui, e não devem entrar
//  sem alguém falar com a pessoa:
//    · CAIO CESAR COSTA DOS SANTOS  — respondeu "Feminino" no próprio censo
//    · Isabella Amaral              — declarou masculino no cadastro pendente
//    · Isabela Macedo dos santos    — declarou M no batismo (e é menor, nasc/2012)
//
//  ⚠️ DURABILIDADE conferida antes de escrever: os 12 caminhos automáticos que
//  gravam `mem_membros.genero` são TODOS só-onde-vazio (`.is('genero', null)` ou
//  `if (!mem.genero)`), então nenhuma porta reescreve a correção. A ÚNICA
//  exceção é `aprovarCadastroCore` no ramo de ATUALIZAÇÃO (membresia.js ~4220),
//  que reaplica o formulário inteiro — e os 2 pendentes que apontam para alvos
//  estão com status `aplicado`, que a própria rota bloqueia com 400.
//
//    node backend/scripts/_reparo_sexo_auditoria_20260916.cjs           # dry-run
//    node backend/scripts/_reparo_sexo_auditoria_20260916.cjs --exec    # aplica
// ════════════════════════════════════════════════════════════════════════════

const os = require('os');
const path = require('path');
const fs = require('fs');
const { supabase } = require('../utils/supabase');
const { nomeNormalizado } = require('../services/identidadeProgressiva');

const exec = process.argv.includes('--exec');

// id · sexo ATUAL esperado · sexo CORRETO · a evidência que sustenta a troca.
// ⚠️ `de` não é enfeite: ele vai no UPDATE como guarda de corrida. Se alguém
// corrigir à mão entre o dry-run e o --exec, a linha não é tocada.
const CORRECOES = [
  { id: '5c02519f', de: 'masculino', para: 'feminino',
    evidencia: 'e MAE de crianca no Kids (kids_responsaveis.parentesco)' },
  { id: '152c41be', de: 'masculino', para: 'feminino',
    evidencia: 'e MAE de 2 criancas no Kids (kids_responsaveis.parentesco)' },
  { id: '45925e81', de: 'feminino', para: 'masculino',
    evidencia: 'a propria pessoa declarou masculino no cadastro pendente' },
  { id: '2e038216', de: 'feminino', para: 'masculino',
    evidencia: 'nome inequivoco em pt-BR, sem nenhuma declaracao em contrario' },
  { id: '3678ca9b', de: 'feminino', para: 'masculino',
    evidencia: 'nome inequivoco em pt-BR, sem nenhuma declaracao em contrario' },
  { id: '84be6440', de: 'masculino', para: 'feminino',
    evidencia: 'nome inequivoco em pt-BR, sem nenhuma declaracao em contrario' },
  { id: '96c3467e', de: 'masculino', para: 'feminino',
    evidencia: 'nome inequivoco em pt-BR, sem nenhuma declaracao em contrario' },
];

// ── Nome que é um ENDEREÇO DE E-MAIL ────────────────────────────────────────
// ⚠️⚠️ Renomear pessoa é irreversível na prática e `nome` é chave de match, então
// aqui NÃO se adivinha: só entra quem escreveu o próprio nome completo numa porta
// COM O MESMO CPF. Esta é a mãe do Murilo Mendes, o follow-up que o CLAUDE.md
// registra em aberto desde 05/08 ("não vou adivinhar num registro de responsável
// Kids") — ela respondeu o censo em 14/09 e o nome deixou de ser adivinhação.
//
// ⚠️ `nomeMaisCompleto` NÃO promove isto sozinho de propósito: ele exige que o
// nome atual seja subsequência do novo, e um e-mail nunca é.
const RENOMEACOES = [
  { id: '605896c4', de: 'Juliafuncionalfight@gmail.com', para: 'Julia Carolina Mendes Alvarez',
    cpf: '05475623902',
    evidencia: 'ela mesma respondeu o censo em 14/09 com este nome e o MESMO cpf' },
];

async function todas(tabela, cols) {
  let out = [], off = 0;
  for (;;) {
    const { data, error } = await supabase.from(tabela).select(cols).order('id').range(off, off + 999);
    if (error) throw new Error(`${tabela}: ${error.message}`);
    out = out.concat(data || []);
    if (!data || data.length < 1000) break;
    off += 1000;
  }
  return out;
}

async function main() {
  const membros = (await todas('mem_membros', 'id, nome, genero, cpf, deleted_at'))
    .filter((m) => !m.deleted_at);

  const plano = [];
  const problemas = [];
  for (const c of CORRECOES) {
    const achados = membros.filter((m) => m.id.startsWith(c.id));
    if (achados.length !== 1) {
      problemas.push(`${c.id}: esperava 1 cadastro vivo, achei ${achados.length}`);
      continue;
    }
    const m = achados[0];
    if (m.genero === c.para) { problemas.push(`${c.id} (${m.nome}): JA esta ${c.para} — nada a fazer`); continue; }
    if (m.genero !== c.de) {
      problemas.push(`${c.id} (${m.nome}): esperava "${c.de}", achei "${m.genero}" — NAO vou tocar`);
      continue;
    }
    plano.push({ ...c, uuid: m.id, nome: m.nome });
  }

  console.log(`Cadastros vivos: ${membros.length} · correcoes planejadas: ${plano.length}\n`);
  for (const p of plano) {
    console.log(`  ${String(p.nome).slice(0, 34).padEnd(34)} ${p.de} -> ${p.para}`);
    console.log(`     ${p.evidencia}`);
  }
  if (problemas.length) {
    console.log('\n⚠️  NAO aplicados:');
    problemas.forEach((p) => console.log(`  · ${p}`));
  }

  // ── Renomeações (bloco separado: é outra decisão) ─────────────────────────
  const renomear = [];
  for (const r of RENOMEACOES) {
    const achados = membros.filter((m) => m.id.startsWith(r.id));
    if (achados.length !== 1) { problemas.push(`${r.id}: esperava 1 cadastro vivo, achei ${achados.length}`); continue; }
    const m = achados[0];
    if (m.nome === r.para) { problemas.push(`${r.id}: nome JA e "${r.para}"`); continue; }
    if (m.nome !== r.de) { problemas.push(`${r.id}: esperava nome "${r.de}", achei "${m.nome}" — NAO vou tocar`); continue; }
    // ⚠️ O CPF e o que amarra o nome do censo a ESTE cadastro. Sem ele, seria
    // renomear pessoa a partir de um texto que pode ser de outra.
    if (String(m.cpf || '') !== r.cpf) { problemas.push(`${r.id}: cpf do cadastro nao bate com o da evidencia — NAO vou tocar`); continue; }
    renomear.push({ ...r, uuid: m.id, nomeAtual: m.nome });
  }
  if (renomear.length) {
    console.log('\n== NOME (endereco de e-mail no campo nome) ==');
    renomear.forEach((r) => {
      console.log(`  "${r.de}"`);
      console.log(`    -> "${r.para}"`);
      console.log(`    ${r.evidencia}`);
    });
  }

  if (!exec) { console.log('\nDRY-RUN. Rode com --exec para aplicar.'); return; }
  if (!plano.length && !renomear.length) { console.log('\nNada a aplicar.'); return; }

  // Backup ANTES de escrever — o estado anterior tem que existir em disco mesmo
  // que o processo morra no meio (lei de 04/08).
  const arquivo = path.join(os.homedir(), 'Downloads',
    `_bk_${new Date().toISOString().slice(0, 10).replace(/-/g, '')}_sexo_auditoria.json`);
  fs.writeFileSync(arquivo, JSON.stringify({ plano, renomear }, null, 1));
  console.log(`\nBackup: ${arquivo}`);

  const aplicados = [];
  for (const p of plano) {
    // ⚠️ `.eq('genero', p.de)` é a guarda de corrida: quem mudou nesse meio-tempo
    // nao e sobrescrito, e volta declarado abaixo.
    const { data, error } = await supabase
      .from('mem_membros')
      .update({ genero: p.para })
      .eq('id', p.uuid)
      .eq('genero', p.de)
      .is('deleted_at', null)
      .select('id, nome, genero');
    if (error) { console.error(`  ✗ ${p.nome}: ${error.message}`); continue; }
    if (!data || !data.length) { console.error(`  ⚠ ${p.nome}: 0 linhas (mudou no meio do caminho)`); continue; }
    aplicados.push(p);
    console.log(`  ✓ ${p.nome} -> ${p.para}`);
  }

  // A PROCEDENCIA fica registrada: sem isso, daqui a um ano ninguem distingue o
  // que a pessoa declarou do que a auditoria corrigiu — e e essa distincao que
  // permite rever a decisao. Best-effort: perder o registro e ruim, desfazer o
  // que ja foi gravado e pior.
  const obs = aplicados.map((p) => ({
    membro_id: p.uuid,
    origem: 'sexo_correcao_auditoria',
    nome: String(p.nome).trim().slice(0, 250),
    nome_normalizado: nomeNormalizado(p.nome) || null,
    dados: { genero: p.para, genero_anterior: p.de, motivo: p.evidencia, auditoria: '2026-09-16' },
  })).filter((o) => o.nome);
  if (obs.length) {
    const { error } = await supabase.from('mem_identidade_observacoes').insert(obs);
    if (error) console.error('  (observacoes nao registradas:', error.message, ')');
  }

  // ── Aplica as renomeações ──────────────────────────────────────────────────
  const renomeados = [];
  for (const r of renomear) {
    const { data, error } = await supabase
      .from('mem_membros')
      .update({ nome: r.para })
      .eq('id', r.uuid)
      .eq('nome', r.de)          // guarda de corrida, como no sexo
      .eq('cpf', r.cpf)          // e o cpf amarra a evidência a ESTE cadastro
      .is('deleted_at', null)
      .select('id, nome');
    if (error) { console.error(`  ✗ nome ${r.de}: ${error.message}`); continue; }
    if (!data || !data.length) { console.error(`  ⚠ nome ${r.de}: 0 linhas (mudou no meio do caminho)`); continue; }
    renomeados.push(r);
    console.log(`  ✓ nome -> ${r.para}`);
    const { error: eObs } = await supabase.from('mem_identidade_observacoes').insert({
      membro_id: r.uuid,
      origem: 'nome_correcao_auditoria',
      nome: r.para.slice(0, 250),
      nome_normalizado: nomeNormalizado(r.para) || null,
      dados: { nome_anterior: r.de, motivo: r.evidencia, auditoria: '2026-09-16' },
    });
    if (eObs) console.error('  (observacao do nome nao registrada:', eObs.message, ')');
  }

  console.log(`\n✅ ${aplicados.length} de ${plano.length} sexos corrigidos · ${renomeados.length} de ${renomear.length} nomes.`);
}

main().catch((e) => { console.error('ERRO:', e.message); process.exit(1); });
