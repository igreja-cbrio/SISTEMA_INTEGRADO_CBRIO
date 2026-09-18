#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════════
//  Dois acertos pedidos/achados em 16/09, depois da auditoria nome-a-nome.
//
//  1 · O PREFIXO no nome da Cristiane (decisão do Marcos: "tirando o prefixo").
//      "Mergulho inesquecível Cristiane Cruz" -> "Cristiane Cruz".
//      ⚠️⚠️ O prefixo NÃO foi digitado no cadastro: ele veio do formulário de
//      BATISMO de 13/05, cujo campo `nome` é literalmente "Mergulho
//      inesquecível" — alguém escreveu ali o TEMA do evento.
//      ⚠️ Isto ENCURTA um nome, que a régua `nomeMaisCompleto` recusa de
//      propósito (ela só promove quando o atual é subsequência do novo). Por
//      isso é script, com o valor anterior guardado e a guarda de corrida —
//      não é caso de automação.
//      ⏳ FICA EM ABERTO e NÃO é decidido aqui: as 2 portas que ELA preencheu
//      (formulário de grupos 02/08 · inscrição 04/08) dizem "Cristiane FIRULA",
//      e o e-mail do cadastro é `mariafirulaa@gmail.com` — então o sobrenome
//      "Cruz" também é suspeito. Tirar o prefixo é ganho certo; trocar o
//      sobrenome exige falar com ela.
//
//  2 · O "SOS urgente" de TESTE que está PENDENTE na fila pastoral.
//      ⚠️⚠️ Medido em 16/09: a Caixa de entrada do Cuidados tem 20 pedidos e
//      **UM pendente — e é este**, aberto pela conta `Apple Review (Demo)` em
//      29/08 durante a revisão da loja. Fila pastoral com pendência falsa é
//      como a equipe aprende a não olhar a fila.
//      ⚠️ NÃO apaga a linha: marca `tratamento_status='concluido'`, que é o que
//      a equipe faria na tela, e é reversível por lá.
//
//    node backend/scripts/_reparo_nome_e_sos_20260916.cjs           # dry-run
//    node backend/scripts/_reparo_nome_e_sos_20260916.cjs --exec    # aplica
// ════════════════════════════════════════════════════════════════════════════

const os = require('os');
const path = require('path');
const fs = require('fs');
const { supabase } = require('../utils/supabase');
const { nomeNormalizado } = require('../services/identidadeProgressiva');

const exec = process.argv.includes('--exec');

const RENOMEAR = {
  id: 'b82858d7',
  de: 'Mergulho inesquecível Cristiane Cruz',
  para: 'Cristiane Cruz',
  cpf: '13656505705',
  motivo: 'prefixo "Mergulho inesquecivel" veio do campo nome do formulario de batismo de 13/05 (tema do evento)',
};

// ⚠️ A conta é identificada pelo UUID, nunca por "tem review no nome": nome é
// texto livre e um dia pode haver gente de verdade com isso escrito.
const SOS_CONTA = '0b52057a';

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
  const membros = (await todas('mem_membros', 'id, nome, cpf, deleted_at')).filter((m) => !m.deleted_at);
  const problemas = [];

  // 1 · o nome
  let rename = null;
  const cand = membros.filter((m) => m.id.startsWith(RENOMEAR.id));
  if (cand.length !== 1) problemas.push(`nome: esperava 1 cadastro vivo, achei ${cand.length}`);
  else if (cand[0].nome === RENOMEAR.para) problemas.push(`nome: JA e "${RENOMEAR.para}"`);
  else if (cand[0].nome !== RENOMEAR.de) problemas.push(`nome: esperava "${RENOMEAR.de}", achei "${cand[0].nome}" — NAO vou tocar`);
  else if (String(cand[0].cpf || '') !== RENOMEAR.cpf) problemas.push('nome: cpf nao bate — NAO vou tocar');
  else rename = { ...RENOMEAR, uuid: cand[0].id };

  // 2 · o SOS de teste
  const conta = membros.find((m) => m.id.startsWith(SOS_CONTA));
  let sos = [];
  if (!conta) problemas.push('sos: conta de revisao nao encontrada');
  else {
    const { data, error } = await supabase
      .from('app_inscricoes')
      .select('id, tipo, tratamento_status, created_at')
      .eq('membro_id', conta.id)
      .in('tipo', ['sos', 'aconselhamento', 'oracao', 'contato', 'visita']);
    if (error) problemas.push(`sos: ${error.message}`);
    else sos = (data || []).filter((a) => !a.tratamento_status || a.tratamento_status === 'pendente');
  }

  console.log('== NOME ==');
  if (rename) {
    console.log(`  "${rename.de}"`);
    console.log(`    -> "${rename.para}"`);
    console.log(`    ${rename.motivo}`);
  } else console.log('  nada a fazer');

  console.log('\n== FILA PASTORAL · pedidos de teste PENDENTES ==');
  if (!sos.length) console.log('  nenhum');
  sos.forEach((a) => console.log(`  ${a.tipo} de ${String(a.created_at).slice(0, 10)} · tratamento=${a.tratamento_status || '(nulo)'} -> concluido`));

  if (problemas.length) {
    console.log('\n⚠️  NAO aplicados:');
    problemas.forEach((p) => console.log(`  · ${p}`));
  }

  if (!exec) { console.log('\nDRY-RUN. Rode com --exec para aplicar.'); return; }
  if (!rename && !sos.length) { console.log('\nNada a aplicar.'); return; }

  // ⚠️ Carimbo com hora e minuto: dois backups do mesmo dia NAO podem colidir
  // (lição de 16/09, quando a 2a execucao comeu o backup da 1a).
  const carimbo = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '');
  const arquivo = path.join(os.homedir(), 'Downloads', `_bk_${carimbo}_nome_e_sos.json`);
  if (fs.existsSync(arquivo)) { console.error(`ERRO: ja existe ${arquivo}`); process.exit(1); }
  fs.writeFileSync(arquivo, JSON.stringify({ rename, sos }, null, 1));
  console.log(`\nBackup: ${arquivo}`);

  if (rename) {
    const { data, error } = await supabase
      .from('mem_membros')
      .update({ nome: rename.para })
      .eq('id', rename.uuid)
      .eq('nome', rename.de)     // guarda de corrida
      .eq('cpf', rename.cpf)     // e o cpf amarra a evidencia a ESTE cadastro
      .is('deleted_at', null)
      .select('id, nome');
    if (error) console.error(`  ✗ nome: ${error.message}`);
    else if (!data || !data.length) console.error('  ⚠ nome: 0 linhas (mudou no meio do caminho)');
    else {
      console.log(`  ✓ nome -> ${rename.para}`);
      const { error: eObs } = await supabase.from('mem_identidade_observacoes').insert({
        membro_id: rename.uuid,
        origem: 'nome_correcao_auditoria',
        nome: rename.para,
        nome_normalizado: nomeNormalizado(rename.para) || null,
        dados: { nome_anterior: rename.de, motivo: rename.motivo, auditoria: '2026-09-16' },
      });
      if (eObs) console.error('  (observacao nao registrada:', eObs.message, ')');
    }
  }

  for (const a of sos) {
    const { error } = await supabase
      .from('app_inscricoes')
      .update({ tratamento_status: 'concluido', tratado_em: new Date().toISOString() })
      .eq('id', a.id);
    if (error) console.error(`  ✗ sos ${a.id}: ${error.message}`);
    else console.log(`  ✓ ${a.tipo} de ${String(a.created_at).slice(0, 10)} marcado como concluido`);
  }
}

main().catch((e) => { console.error('ERRO:', e.message); process.exit(1); });
