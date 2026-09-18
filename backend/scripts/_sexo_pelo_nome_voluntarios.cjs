/**
 * SEXO PELO NOME · voluntários com check-in (2026-09-16)
 *
 * Pedido do Marcos: *"pelo nome das pessoas, as que forem óbvias, já resolva o
 * sexo, se for joão é homem, se for maria é mulher"* + *"me diga se tiver algum
 * caso mais dificil que eu valido com a ariel"*.
 *
 * ⚠️⚠️ A LEI DE 10/08 CONTINUA VALENDO: "nunca inferir sexo por nome e gravar
 * como DECLARADO". O que este script grava fica marcado como
 * `origem='sexo_inferido_nome'` em `mem_identidade_observacoes` — é palpite
 * confirmado por decisão do Marcos, não declaração da pessoa. Quem for auditar
 * daqui a um ano precisa conseguir distinguir os dois.
 *
 * ⚠️ SÓ-ONDE-VAZIO: nunca sobrescreve `genero` preenchido. O UPDATE leva
 * `.is('genero', null)` como guarda de corrida — entre ler e escrever, a própria
 * pessoa pode ter respondido o censo.
 *
 * ⚠️ Escopo: SÓ voluntários com check-in na janela (o pedido nasceu do modal de
 * completar cadastro). A base inteira é outra decisão, com outro tamanho.
 *
 * Uso:
 *   node backend/scripts/_sexo_pelo_nome_voluntarios.cjs            # dry-run
 *   node backend/scripts/_sexo_pelo_nome_voluntarios.cjs --exec     # grava
 */
require('dotenv').config();
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const { sexoPeloNome } = require('../utils/sexoPeloNome');

const EXEC = process.argv.includes('--exec');
const DIAS = 182;

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function paginar(tabela, select, mod) {
  let out = [];
  for (let from = 0; ; from += 1000) {
    let q = sb.from(tabela).select(select).range(from, from + 999);
    if (mod) q = mod(q);
    const { data, error } = await q;
    // ⚠️ LANÇA: lista truncada em silêncio faria o script reportar "resolvi 40"
    // quando havia 95 — e ninguém conferiria os 55 que ficaram de fora.
    if (error) throw new Error(`${tabela}: ${error.message}`);
    out = out.concat(data || []);
    if (!data || data.length < 1000) break;
  }
  return out;
}

(async () => {
  const desde = new Date(Date.now() - DIAS * 864e5).toISOString();

  const checkins = await paginar('vol_check_ins', 'volunteer_id', (q) => q.gte('checked_in_at', desde));
  const ativos = new Set(checkins.map((c) => c.volunteer_id).filter(Boolean));

  const perfis = (await paginar('vol_profiles', 'id, full_name, membresia_id'))
    .filter((v) => ativos.has(v.id) && v.membresia_id);

  const ids = [...new Set(perfis.map((v) => v.membresia_id))];
  const membros = {};
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await sb
      .from('mem_membros')
      .select('id, nome, genero, deleted_at')
      .in('id', ids.slice(i, i + 200));
    if (error) throw new Error(`mem_membros: ${error.message}`);
    for (const m of data || []) membros[m.id] = m;
  }

  const resolver = [];
  const manual = [];
  for (const v of perfis) {
    const m = membros[v.membresia_id];
    if (!m || m.deleted_at || m.genero) continue;
    // ⚠️ O nome LEGAL do cadastro vem primeiro; o do perfil é o nome CURTO do
    // Planning Center e só entra como segunda tentativa.
    const sexo = sexoPeloNome(m.nome) || sexoPeloNome(v.full_name);
    if (sexo) resolver.push({ id: m.id, nome: m.nome, sexo });
    else manual.push({ id: m.id, nome: m.nome, perfil: v.full_name });
  }

  console.log(`\nJanela: últimos ${DIAS} dias · voluntários com check-in e cadastro: ${perfis.length}`);
  console.log(`Sem sexo: ${resolver.length + manual.length}`);
  console.log(`  → resolvidos pelo nome : ${resolver.length}`);
  console.log(`  → para a Ariel validar : ${manual.length}`);

  console.log('\n--- OS QUE FICAM PARA DECISÃO HUMANA ---');
  manual.forEach((c, i) => console.log(`  ${String(i + 1).padStart(2)}. ${c.nome}`));

  if (!EXEC) {
    console.log('\nDRY-RUN. Nada foi gravado. Use --exec para aplicar.');
    console.log('Amostra do que seria gravado:');
    resolver.slice(0, 10).forEach((c) => console.log(`  ${c.nome} → ${c.sexo}`));
    return;
  }

  const backup = path.join(os.homedir(), 'Downloads', `_bk_${new Date().toISOString().slice(0, 10).replace(/-/g, '')}_sexo_pelo_nome.json`);
  fs.writeFileSync(backup, JSON.stringify(resolver, null, 2));
  console.log(`\nBackup: ${backup}`);

  let ok = 0;
  let pulados = 0;
  const falhas = [];
  for (const c of resolver) {
    // ⚠️ `.is('genero', null)` é a guarda de corrida: 0 linhas = alguém
    // preencheu no meio do caminho, e a declaração dela vence o nosso palpite.
    const { data, error } = await sb
      .from('mem_membros')
      .update({ genero: c.sexo })
      .eq('id', c.id)
      .is('genero', null)
      .select('id');
    if (error) { falhas.push({ ...c, erro: error.message }); continue; }
    if (!data || data.length === 0) { pulados++; continue; }
    ok++;
    // Trilha da ORIGEM. Best-effort: perder a observação não desfaz a gravação,
    // mas sem ela ninguém distingue palpite de declaração.
    await sb.from('mem_identidade_observacoes').insert({
      membro_id: c.id,
      origem: 'sexo_inferido_nome',
      dados: { genero: c.sexo, nome_usado: c.nome, decidido_por: 'marcos', regra: 'utils/sexoPeloNome' },
    }).then(() => {}, () => {});
  }

  console.log(`\nGravados : ${ok}`);
  console.log(`Pulados  : ${pulados} (alguém preencheu no meio do caminho — a declaração vence)`);
  console.log(`Falhas   : ${falhas.length}`);
  falhas.forEach((f) => console.log(`  ${f.nome}: ${f.erro}`));
})().catch((e) => { console.error('ERRO:', e.message); process.exit(1); });
