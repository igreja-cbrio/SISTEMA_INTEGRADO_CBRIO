#!/usr/bin/env node
/**
 * AMI CAMP 2027 · importa a planilha do E-Inscrição pra `inscricoes`
 * ============================================================================
 * Pedido do Marcos (09/09/2026): *"temos essa planilha que vem do E-Inscrição,
 * são inscritos do retiro, quero que você adicione essas pessoas no nosso
 * sistema, identifique que ela foi inscrita pelo E-inscrição, coloque o valor
 * referente ao que cobramos lá (retire os 5,5% de taxa)"*.
 *
 * O que faz, por linha da planilha (régua em `backend/utils/eInscricao.js`):
 *   1. vira UMA `inscricoes` do evento, `origem = 'e_inscricao'`, status
 *      `confirmada` (a plataforma só exporta quem pagou), `created_at` = o
 *      instante REAL da compra lá (posição no lote é por created_at);
 *   2. `valor_cobrado_centavos` = LÍQUIDO (bruto − 5,5%) — R$ 850 → R$ 803,25;
 *   3. respostas nas MESMAS keys do nosso formulário; bloco de menor nas
 *      colunas `responsavel_*`; código/forma/parcelas/aceites da plataforma em
 *      `dados.e_inscricao`;
 *   4. liga (ou cria) a pessoa na membresia pelo matcher oficial — mesma
 *      política da porta pública (`politica = cpf ? 'criar' : 'ligar'`).
 *
 * IDEMPOTENTE: roda de novo com a exportação da semana que vem e só entra quem
 * ainda não está (chave = CPF vivo no evento OU `dados.e_inscricao.codigo`).
 * Linha marcada "Cancelada? = Sim" cancela a inscrição correspondente aqui.
 * ⚠️ Nunca sobrescreve inscrição já existente (nem valor, nem respostas).
 *
 * ⚠️⚠️ NÃO mexe em `insc_eventos.lotes`: a inscrição importada JÁ ocupa posição
 * na régua do lote e da vaga (linha viva não-cancelada). Reduzir `lotes[0].vagas`
 * por cima contaria a mesma pessoa duas vezes.
 *
 * Uso:
 *   node backend/scripts/_importar_einscricao_retiro.cjs [caminho.csv]         (simulação)
 *   node backend/scripts/_importar_einscricao_retiro.cjs [caminho.csv] --exec
 *   Sem caminho: pega o `retiro-ami-2027 - inscricoes*.csv` mais novo em ~/Downloads.
 *
 * Roda de worktree: acha `.env` + `node_modules` no checkout principal.
 */
const fs = require('fs');
const path = require('path');
const Module = require('module');

const EXEC = process.argv.includes('--exec');
const ARGS = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const HOME = process.env.USERPROFILE || process.env.HOME;
const ID_RETIRO = 'f16e5e78-a513-421e-b229-d60c5460e5db';
const SLUG_RETIRO = 'retiro-ami-2027';

// ── conexão: .env + node_modules do backend (worktree cai no checkout principal) ──
const CANDIDATOS = [path.resolve(__dirname, '..'), path.join(HOME, 'SISTEMA_INTEGRADO_CBRIO', 'backend')];
const BASE_DEPS = CANDIDATOS.find((p) => fs.existsSync(path.join(p, 'node_modules', '@supabase', 'supabase-js')));
const BASE_ENV = CANDIDATOS.find((p) => fs.existsSync(path.join(p, '.env')));
if (!BASE_DEPS || !BASE_ENV) { console.error('Não achei backend/.env ou backend/node_modules.'); process.exit(1); }
for (const linha of fs.readFileSync(path.join(BASE_ENV, '.env'), 'utf8').split(/\r?\n/)) {
  const m = linha.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].trim().replace(/^"(.*)"$/, '$1');
}
process.env.NODE_PATH = [process.env.NODE_PATH, path.join(BASE_DEPS, 'node_modules')].filter(Boolean).join(path.delimiter);
Module._initPaths();

const { supabase } = require('../utils/supabase');
const { acharOuCriarGuardado } = require('../services/membroMatch');
const ei = require('../utils/eInscricao');

function acharCsv() {
  if (ARGS[0]) return path.resolve(ARGS[0]);
  const dir = path.join(HOME, 'Downloads');
  const cands = fs.readdirSync(dir)
    .filter((f) => /^retiro-ami-2027 - inscricoes.*\.csv$/i.test(f))
    .map((f) => ({ f, t: fs.statSync(path.join(dir, f)).mtimeMs }))
    .sort((a, b) => b.t - a.t);
  if (!cands.length) throw new Error('Nenhum "retiro-ami-2027 - inscricoes*.csv" em ~/Downloads. Passe o caminho.');
  return path.join(dir, cands[0].f);
}

const fmt = (c) => (c == null ? '—' : `R$ ${(c / 100).toFixed(2).replace('.', ',')}`);

(async () => {
  console.log(EXEC ? '=== EXECUTANDO ===' : '=== SIMULAÇÃO (use --exec para gravar) ===');
  const arquivo = acharCsv();
  console.log(`planilha: ${arquivo}`);
  // A exportação vem em Windows-1252 (não UTF-8).
  const texto = new TextDecoder('windows-1252').decode(fs.readFileSync(arquivo));
  const recs = ei.parseCsvEInscricao(texto);
  const agora = new Date().toISOString();
  const linhas = recs.map((r) => ei.mapearLinhaEInscricao(r, { arquivo: path.basename(arquivo), importadoEm: agora }));
  console.log(`linhas na planilha: ${linhas.length}`);

  const { data: ev, error: eEv } = await supabase.from('insc_eventos')
    .select('id, nome, slug, vagas, lotes, campos').eq('id', ID_RETIRO).is('deleted_at', null).maybeSingle();
  if (eEv) throw eEv;
  if (!ev || ev.slug !== SLUG_RETIRO) throw new Error(`Evento ${ID_RETIRO} não é o ${SLUG_RETIRO}`);
  const keysEvento = new Set((ev.campos || []).map((c) => c.key));

  // Quem já está (todas as vivas do evento — inclusive canceladas, que seguram o CPF no UNIQUE parcial).
  const { data: vivas, error: eV } = await supabase.from('inscricoes')
    .select('id, codigo, nome_completo, cpf, status, origem, valor_cobrado_centavos, dados, created_at')
    .eq('evento_id', ev.id).is('deleted_at', null);
  if (eV) throw eV;
  const porCpf = new Map(vivas.filter((v) => v.cpf).map((v) => [v.cpf, v]));
  const porCodigo = new Map(vivas.filter((v) => v.dados?.e_inscricao?.codigo).map((v) => [v.dados.e_inscricao.codigo, v]));

  const inserir = []; const cancelar = []; const pular = []; const invalidas = [];
  for (const l of linhas) {
    const ja = (l.codigo_plataforma && porCodigo.get(l.codigo_plataforma)) || (l.cpf && porCpf.get(l.cpf));
    if (l.status === 'cancelada') {
      if (ja && ja.status !== 'cancelada' && ja.origem === ei.ORIGEM_E_INSCRICAO) cancelar.push({ l, ja });
      else pular.push({ l, motivo: ja ? 'já cancelada aqui' : 'cancelada lá e nunca entrou aqui' });
      continue;
    }
    if (ja) { pular.push({ l, motivo: `já existe (${ja.codigo} · ${ja.origem} · ${ja.status})` }); continue; }
    // Contrato da espinha (CHECK chk_inscricoes_contrato): sem estes 5 o INSERT é recusado.
    if (!l.cpf || !l.telefone || !l.email || !l.data_nascimento || !l.sexo) { invalidas.push(l); continue; }
    for (const k of Object.keys(l.dados)) if (k !== 'e_inscricao' && !keysEvento.has(k)) console.warn(`  ⚠️ key ${k} não existe no evento (resposta fica gravada mesmo assim)`);
    inserir.push(l);
  }

  console.log(`\na inserir : ${inserir.length}`);
  for (const l of inserir) {
    const idade = Math.floor((Date.now() - Date.parse(l.data_nascimento)) / (365.25 * 864e5));
    const flags = [];
    if (idade < 18 && !l.responsavel_nome) flags.push('MENOR SEM RESPONSÁVEL');
    if (idade < 5 || idade > 90) flags.push(`idade ${idade} suspeita — conferir nascimento`);
    if (l.avisos.length) flags.push(...l.avisos);
    console.log(`  + ${l.nome_completo.slice(0, 34).padEnd(36)} ${l.codigo_plataforma}  ${fmt(l.valor_cobrado_centavos)}  ${l.created_at}  ${idade}a${l.responsavel_nome ? ' · resp: ' + l.responsavel_nome.slice(0, 20) : ''}${flags.length ? '  ⚠️ ' + flags.join(' · ') : ''}`);
  }
  console.log(`a cancelar: ${cancelar.length}`);
  for (const { l, ja } of cancelar) console.log(`  × ${l.nome_completo} (${ja.codigo})`);
  console.log(`puladas   : ${pular.length}`);
  for (const { l, motivo } of pular) console.log(`  = ${l.nome_completo.slice(0, 34).padEnd(36)} ${motivo}`);
  if (invalidas.length) {
    console.log(`inválidas (fora do contrato · NÃO entram): ${invalidas.length}`);
    for (const l of invalidas) console.log(`  ! ${l.nome_completo.slice(0, 34).padEnd(36)} ${l.avisos.join(' · ')}`);
  }

  const bruto = inserir.reduce((s, l) => s + (l.dados.e_inscricao.valor_bruto_centavos || 0), 0);
  const liquido = inserir.reduce((s, l) => s + (l.valor_cobrado_centavos || 0), 0);
  console.log(`\ndinheiro a entrar: bruto ${fmt(bruto)} · líquido ${fmt(liquido)} (taxa ${ei.TAXA_E_INSCRICAO_PCT}%)`);

  const backup = { gerado_em: agora, arquivo, evento: ev.id, inserir, cancelar: cancelar.map((c) => ({ id: c.ja.id, codigo: c.ja.codigo, nome: c.ja.nome_completo, status_antes: c.ja.status })) };
  const arqBackup = path.join(HOME, 'Downloads', `_bk_${agora.slice(0, 10).replace(/-/g, '')}_import_einscricao_retiro.json`);
  fs.writeFileSync(arqBackup, JSON.stringify(backup, null, 1));
  console.log(`backup do que vai ser gravado: ${arqBackup}`);

  if (!EXEC) { await placar(ev); return; }

  let ok = 0; let ligados = 0; let criados = 0; let semVinculo = 0; let falhas = 0;
  for (const l of inserir) {
    const { avisos, codigo_plataforma, ...row } = l;
    const { data: ins, error } = await supabase.from('inscricoes')
      .insert({ ...row, evento_id: ev.id, whatsapp_optin: false })
      .select('id, codigo').single();
    if (error) { console.error(`  ERRO ${l.nome_completo}: ${error.message}`); falhas++; continue; }
    ok++;
    // Vínculo com a membresia — depois do INSERT pra o matcher registrar o id da inscrição como origem.
    let r = null;
    try {
      r = await acharOuCriarGuardado({
        cpf: l.cpf, email: l.email, telefone: l.telefone, nome: l.nome_completo,
        dataNascimento: l.data_nascimento, genero: l.sexo, status: 'visitante',
        extra: { data_nascimento: l.data_nascimento },
        origem: 'inscricoes_e_inscricao', origemId: ins.id,
      });
    } catch (e) { console.error(`  [vínculo] ${l.nome_completo}: ${e.message}`); }
    if (r?.membro_id) {
      const { error: eM } = await supabase.from('inscricoes').update({ membro_id: r.membro_id }).eq('id', ins.id).is('membro_id', null);
      if (eM) console.error(`  [vínculo] gravar ${l.nome_completo}: ${eM.message}`);
      else if (r.created) criados++; else ligados++;
    } else semVinculo++;
    console.log(`  ✓ ${l.nome_completo.slice(0, 34).padEnd(36)} ${ins.codigo}  ${r?.membro_id ? (r.created ? 'CRIOU cadastro' : `ligou (${r.matched_by})`) : 'sem vínculo'}`);
  }
  for (const { l, ja } of cancelar) {
    const { error } = await supabase.from('inscricoes').update({ status: 'cancelada' }).eq('id', ja.id).neq('status', 'cancelada');
    if (error) { console.error(`  ERRO cancelar ${l.nome_completo}: ${error.message}`); falhas++; }
    else console.log(`  × ${l.nome_completo} cancelada`);
  }

  console.log('\n=== RESULTADO ===');
  console.log(`inseridas          : ${ok}`);
  console.log(`ligadas a cadastro : ${ligados}`);
  console.log(`cadastros criados  : ${criados}`);
  console.log(`sem vínculo        : ${semVinculo}${semVinculo ? '  → rodar backend/scripts/_reparo_inscricoes_valor_vinculo.cjs --exec' : ''}`);
  console.log(`canceladas         : ${cancelar.length}`);
  console.log(`falhas             : ${falhas}`);
  await placar(ev);
})().catch((e) => { console.error(e); process.exit(1); });

/** Placar depois da operação: posições ocupadas × lote atual × por plataforma. */
async function placar(ev) {
  const { data: vivas } = await supabase.from('inscricoes')
    .select('origem, status, valor_cobrado_centavos').eq('evento_id', ev.id).is('deleted_at', null);
  const { data: pagos } = await supabase.from('vw_insc_pagamento_estado')
    .select('valor_pago_centavos').eq('evento_id', ev.id).eq('status_pagamento', 'pago');
  const arrec = (pagos || []).reduce((s, p) => s + Number(p.valor_pago_centavos || 0), 0);
  const r = ei.resumoPorPlataforma(vivas || [], arrec);
  const { loteAtual } = require('../utils/lotesEvento');
  const lote = loteAtual(ev.lotes, r.total_inscritos);
  console.log('\n=== PLACAR ATUAL (banco) ===');
  console.log(`E-Inscrição : ${r.externo.inscritos} inscritos · ${fmt(r.externo.valor_liquido_centavos)} líquidos`);
  console.log(`Sistema     : ${r.sistema.inscritos} inscritos · ${fmt(r.sistema.arrecadado_centavos)} pagos`);
  console.log(`Total       : ${r.total_inscritos} posições de ${ev.vagas} vagas · ${fmt(r.total_centavos)}`);
  if (lote) console.log(`Lote atual  : ${lote.nome} a ${fmt(lote.valor_centavos)}${lote.restantes_no_lote != null ? ` · restam ${lote.restantes_no_lote} neste preço` : ''}`);
}
