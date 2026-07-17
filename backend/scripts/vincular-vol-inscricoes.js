// ============================================================================
// vincular-vol-inscricoes · liga (ou cria) o cadastro das fichas de
// voluntariado órfãs (2026-07-17 · decisão do Marcos)
//
// Uso:  node backend/scripts/vincular-vol-inscricoes.js           (dry-run)
//       node backend/scripts/vincular-vol-inscricoes.js --apply   (grava)
//
// Contexto: 550 vol_inscricoes sem membro_id (546 = importação do formulário
// Google 2024-2026 · 402 já "integrado" servindo em ministério), das quais
// ~381 têm CPF DV-válido que não existe em nenhum membro vivo. Essas pessoas
// estão fora da base única (Membresia/jornada/cruzamentos).
//
// Garantias contra duplicata (as 2 preocupações do Marcos):
//   1. vol_profiles: se o CPF da ficha já tem profile de voluntário com
//      membro vinculado → LIGA nesse membro (não cria).
//   2. Matcher canônico ANTES de criar (acharOuCriarGuardado · CPF →
//      e-mail+nome → telefone+nome → nascimento+nome · inclui contatos
//      secundários de mem_contatos): quem já existe como stub sem CPF é
//      VINCULADO e o CPF consolidado nele (confiança fraca → pendência se o
//      nascimento não conferir dos 2 lados). Só cria quem não bate em NINGUÉM.
//
// Regras: só cria com CPF DV-válido; status 'nao_pode_ou_duplicata' nunca
// cria (só tenta ligar); criação nasce status 'visitante' +
// origem_cadastro 'voluntariado'. NÃO funde nada.
// ============================================================================

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { supabase } = require(path.join(__dirname, '..', 'utils', 'supabase'));
const { normalizarCpf, cpfValido } = require(path.join(__dirname, '..', 'utils', 'cpf'));
const { acharOuCriarGuardado, acharMembroGuardado } = require(path.join(__dirname, '..', 'services', 'membroMatch'));
const { reconciliarCpfTardio } = require(path.join(__dirname, '..', 'services', 'cpfReconciliar'));

const APPLY = process.argv.includes('--apply');

async function fetchAll(tabela, cols, decorate) {
  const page = 1000;
  let out = [], offset = 0;
  for (;;) {
    let q = supabase.from(tabela).select(cols).order('id', { ascending: true }).range(offset, offset + page - 1);
    if (decorate) q = decorate(q);
    const { data, error } = await q;
    if (error) throw new Error(`${tabela}: ${error.message}`);
    out = out.concat(data || []);
    if (!data || data.length < page) return out;
    offset += page;
  }
}

async function vincular(inscricaoId, membroId) {
  const { error } = await supabase.from('vol_inscricoes')
    .update({ membro_id: membroId, updated_at: new Date().toISOString() })
    .eq('id', inscricaoId).is('membro_id', null);
  if (error) throw error;
}

async function main() {
  console.log(`== Vincular fichas de voluntariado órfãs · ${APPLY ? 'APPLY' : 'DRY-RUN'} ==\n`);

  const fichas = await fetchAll('vol_inscricoes',
    'id, cpf, email, telefone, nome, sobrenome, nome_completo, data_nascimento, status, area, membro_id',
    (q) => q.is('membro_id', null));
  console.log(`fichas sem vínculo: ${fichas.length}`);

  // vol_profiles por CPF (garantia 1 do Marcos)
  const profiles = await fetchAll('vol_profiles', 'id, cpf, membresia_id');
  const profPorCpf = new Map();
  for (const p of profiles) {
    const c = normalizarCpf(p.cpf);
    if (c && p.membresia_id) profPorCpf.set(c, p);
  }
  console.log(`vol_profiles com membro vinculado: ${profPorCpf.size} CPFs\n`);

  const resumo = {};
  const conta = (k) => { resumo[k] = (resumo[k] || 0) + 1; };

  for (const f of fichas) {
    const cpf = normalizarCpf(f.cpf);
    const nome = f.nome_completo || [f.nome, f.sobrenome].filter(Boolean).join(' ');
    const dados = {
      cpf,
      email: f.email,
      telefone: f.telefone,
      nome,
      dataNascimento: f.data_nascimento || null,
    };

    try {
      // 1) profile de voluntário com o mesmo CPF já vinculado a um membro
      if (cpf && profPorCpf.has(cpf)) {
        const membroId = profPorCpf.get(cpf).membresia_id;
        conta('vinculado_via_vol_profile');
        if (APPLY) {
          await vincular(f.id, membroId);
          await reconciliarCpfTardio({
            membroId, cpf, origem: 'vol_ficha', origemId: f.id,
            dataNascimento: f.data_nascimento || null, confianca: 'fraca',
          });
        }
        continue;
      }

      // 2) já existe na base? (matcher canônico · READ-ONLY primeiro pra
      //    separar os contadores do dry-run)
      const hit = await acharMembroGuardado(dados);
      if (hit?.membro_id) {
        conta(hit.matched_by === 'cpf' ? 'vinculado_por_cpf' : `vinculado_por_${hit.matched_by}`);
        if (APPLY) {
          await vincular(f.id, hit.membro_id);
          if (cpf && hit.matched_by !== 'cpf') {
            await reconciliarCpfTardio({
              membroId: hit.membro_id, cpf, origem: 'vol_ficha', origemId: f.id,
              dataNascimento: f.data_nascimento || null, confianca: 'fraca',
            });
          }
        }
        continue;
      }

      // 3) não existe em lugar nenhum → cria SÓ com CPF DV-válido e nome,
      //    e nunca pra ficha já triada como 'nao_pode_ou_duplicata'
      if (!cpf || !cpfValido(cpf)) { conta('sem_cpf_valido (segue órfã)'); continue; }
      if (!nome || nome.trim().length < 2) { conta('sem_nome (segue órfã)'); continue; }
      if (f.status === 'nao_pode_ou_duplicata') { conta('nao_pode_ou_duplicata (não cria)'); continue; }

      conta('criar_membro_novo');
      if (APPLY) {
        const r = await acharOuCriarGuardado({
          ...dados,
          status: 'visitante',
          extra: {
            data_nascimento: f.data_nascimento || null,
            origem_cadastro: 'voluntariado',
          },
        });
        await vincular(f.id, r.membro_id);
        if (!r.created) conta('criar_virou_vinculo (corrida/lote)');
      }
    } catch (e) {
      console.error(`  [ERRO] ficha ${f.id} (${nome}):`, e.message);
      conta('erro');
    }
  }

  console.log(`\n== Resumo (${APPLY ? 'aplicado' : 'dry-run · nada gravado'}) ==`);
  for (const [k, v] of Object.entries(resumo).sort()) console.log(`  ${k}: ${v}`);
  if (!APPLY) console.log('\nRode com --apply para gravar.');
}

main().catch((e) => { console.error('ERRO:', e.message); process.exit(1); });
