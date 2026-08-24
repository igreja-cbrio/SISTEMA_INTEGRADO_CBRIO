// ============================================================================
// _reparo_inscricoes_valor_vinculo · backfill dos dois defeitos achados na 1ª
// inscrição paga real do AMI CAMP 2027 (23/08/2026).
//
//   A) `inscricoes.valor_cobrado_centavos` NULL em quem PAGOU. A coluna só era
//      escrita pela `aplicarBeneficio` (bolsa/desconto); quem pagou o valor
//      cheio ficava em branco. Preenche com o valor do pagamento `pago`.
//
//   B) `inscricoes.membro_id` NULL. A porta de eventos usava `politica:'ligar'`
//      (só ACHAVA cadastro existente), então pessoa nova ficava fora da
//      membresia. Passa cada inscrição COM CPF VÁLIDO pelo matcher oficial
//      (`acharOuCriarGuardado`), que liga no cadastro quando o CPF bate e cria
//      quando a pessoa é nova de verdade.
//
// ⚠️ SÓ mexe em inscrição com CPF de 11 dígitos. Sem CPF não se fabrica
//    cadastro — é exatamente a regra que a #2170 fechou ("para de fabricar
//    cadastro sem chave"). Essas ficam para decisão humana.
// ⚠️ Nunca sobrescreve `membro_id` nem `valor_cobrado_centavos` já preenchidos.
//
// Uso:  node backend/scripts/_reparo_inscricoes_valor_vinculo.cjs [--exec]
//       (sem --exec = simulação · grava o backup e não escreve nada)
// ============================================================================
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { supabase } = require('../utils/supabase');
const { acharOuCriarGuardado } = require('../services/membroMatch');
const { normalizarCpf } = require('../services/identidadeProgressiva');

const EXEC = process.argv.includes('--exec');
const HOME = process.env.USERPROFILE || process.env.HOME;

async function paginar(tabela, select, filtro = '') {
  const out = [];
  for (let de = 0; ; de += 1000) {
    let q = supabase.from(tabela).select(select).range(de, de + 999);
    if (filtro) q = filtro(q);
    const { data, error } = await q;
    if (error) throw new Error(`${tabela}: ${error.message}`);
    out.push(...data);
    if (data.length < 1000) return out;
  }
}

(async () => {
  console.log(EXEC ? '=== EXECUTANDO ===' : '=== SIMULACAO (use --exec para gravar) ===');

  const inscricoes = (await paginar('inscricoes',
    'id, evento_id, nome_completo, cpf, email, telefone, data_nascimento, sexo, membro_id, status, valor_cobrado_centavos, codigo',
    (q) => q.is('deleted_at', null)));
  const pagamentos = await paginar('insc_pagamentos', 'inscricao_id, status, valor_centavos');
  const pagoPor = {};
  for (const p of pagamentos) if (p.status === 'pago') pagoPor[p.inscricao_id] = p.valor_centavos;

  const alvoValor = inscricoes.filter((i) => i.valor_cobrado_centavos == null && pagoPor[i.id] > 0);
  const alvoVinculo = inscricoes.filter((i) => !i.membro_id && normalizarCpf(i.cpf));
  const semCpf = inscricoes.filter((i) => !i.membro_id && !normalizarCpf(i.cpf));

  console.log(`inscricoes vivas: ${inscricoes.length}`);
  console.log(`A) valor a preencher: ${alvoValor.length}`);
  console.log(`B) vinculo a resolver (com CPF): ${alvoVinculo.length}`);
  console.log(`   sem CPF, ficam para decisao humana: ${semCpf.length}`);

  const backup = {
    gerado_em: new Date().toISOString(),
    valor: alvoValor.map((i) => ({ id: i.id, codigo: i.codigo, nome: i.nome_completo, valor_antes: i.valor_cobrado_centavos, valor_depois: pagoPor[i.id] })),
    vinculo: alvoVinculo.map((i) => ({ id: i.id, codigo: i.codigo, nome: i.nome_completo, membro_id_antes: i.membro_id })),
  };
  const arqBackup = path.join(HOME, 'Downloads', `_bk_20260823_inscricoes_valor_vinculo.json`);
  fs.writeFileSync(arqBackup, JSON.stringify(backup, null, 1));
  console.log(`backup: ${arqBackup}`);

  // ---- A) valor cobrado ----
  let okValor = 0;
  for (const i of alvoValor) {
    console.log(`  [valor] ${String(i.nome_completo).slice(0, 26).padEnd(28)} R$ ${(pagoPor[i.id] / 100).toFixed(2)}`);
    if (!EXEC) continue;
    const { error } = await supabase.from('inscricoes')
      .update({ valor_cobrado_centavos: pagoPor[i.id] }).eq('id', i.id).is('valor_cobrado_centavos', null);
    if (error) console.error(`     ERRO: ${error.message}`);
    else okValor++;
  }

  // ---- B) vinculo com o cadastro ----
  let ligados = 0; let criados = 0; let falhas = 0;
  for (const i of alvoVinculo) {
    let r = null;
    if (EXEC) {
      try {
        r = await acharOuCriarGuardado({
          cpf: i.cpf, email: i.email, telefone: i.telefone, nome: i.nome_completo,
          dataNascimento: i.data_nascimento, genero: i.sexo, status: 'visitante',
          extra: { data_nascimento: i.data_nascimento || null },
          origem: 'reparo_inscricoes_20260823', origemId: i.id,
        });
      } catch (e) { console.error(`  [vinculo] ${i.nome_completo}: ${e.message}`); falhas++; continue; }
    }
    const acao = !EXEC ? 'simulado' : (r && r.created ? 'CRIOU' : `ligou (${(r && r.matched_by) || '?'})`);
    console.log(`  [vinculo] ${String(i.nome_completo).slice(0, 26).padEnd(28)} ${acao}`);
    if (!EXEC) continue;
    if (!r || !r.membro_id) { falhas++; continue; }
    const { error } = await supabase.from('inscricoes')
      .update({ membro_id: r.membro_id }).eq('id', i.id).is('membro_id', null);
    if (error) { console.error(`     ERRO ao gravar vinculo: ${error.message}`); falhas++; continue; }
    if (r.created) criados++; else ligados++;
  }

  console.log('\n=== RESULTADO ===');
  console.log(`valores preenchidos : ${EXEC ? okValor : alvoValor.length + ' (simulado)'}`);
  console.log(`ligados a cadastro  : ${EXEC ? ligados : '?'}`);
  console.log(`cadastros criados   : ${EXEC ? criados : '?'}`);
  console.log(`falhas              : ${falhas}`);
  console.log(`sem CPF (intocadas) : ${semCpf.length}`);
})().catch((e) => { console.error(e); process.exit(1); });
