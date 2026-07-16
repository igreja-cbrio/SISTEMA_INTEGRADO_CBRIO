// ============================================================================
// reconciliar-cpf-backfill · consolida CPF tardio no estoque existente
//
// Uso:  node backend/scripts/reconciliar-cpf-backfill.js           (dry-run)
//       node backend/scripts/reconciliar-cpf-backfill.js --apply   (grava)
//
// O que faz (leitura via REST paginado · cap-1000 respeitado):
//   1. Satélites (batismo_inscricoes, vol_inscricoes, next_matriculas) com CPF
//      válido:
//      · sem membro_id  → vincula ao dono ativo do CPF (se existir)
//      · membro deletado → repoint pro dono ativo do CPF
//      · membro ativo SEM cpf → preenche o CPF no membro (reconciliarCpfTardio ·
//        conflito vira pendência, nunca auto-funde)
//      · membro ativo com CPF DIFERENTE → pendência vinculo_divergente
//   2. cui_convertidos sem CPF cujo membro tem CPF → espelha (coorte BAT90/
//      NEXT90 cruza por cpf · menos dependência do match por nome).
//
// NÃO cria membro novo em massa (conservador) e NÃO funde cadastros — pares
// suspeitos vão pra identidade_pendencias / vw_membros_duplicados (fila humana).
// ============================================================================

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { supabase } = require(path.join(__dirname, '..', 'utils', 'supabase'));
const { normalizarCpf, cpfValido } = require(path.join(__dirname, '..', 'utils', 'cpf'));
const { reconciliarCpfTardio, registrarPendencia } = require(path.join(__dirname, '..', 'services', 'cpfReconciliar'));
const { nomesMesmaPessoa } = require(path.join(__dirname, '..', 'services', 'membroMatch'));

const APPLY = process.argv.includes('--apply');

async function fetchAll(tabela, cols, decorate) {
  const page = 1000;
  let out = [], offset = 0;
  for (;;) {
    // .order é obrigatório: sem ordenação estável, offset-pagination pode pular
    // ou duplicar linhas entre páginas (plano muda / escrita concorrente).
    let q = supabase.from(tabela).select(cols).order('id', { ascending: true }).range(offset, offset + page - 1);
    if (decorate) q = decorate(q);
    const { data, error } = await q;
    if (error) throw new Error(`${tabela}: ${error.message}`);
    out = out.concat(data || []);
    if (!data || data.length < page) return out;
    offset += page;
  }
}

async function main() {
  console.log(`== Reconciliação de CPF tardio · ${APPLY ? 'APPLY' : 'DRY-RUN'} ==\n`);

  // Mapa de membros: cpf→dono ativo · id→membro (inclui deletados p/ repoint)
  const membros = await fetchAll('mem_membros', 'id, nome, cpf, deleted_at');
  const porId = new Map(membros.map((m) => [m.id, m]));
  const donoPorCpf = new Map();
  for (const m of membros) {
    const c = normalizarCpf(m.cpf);
    if (c && !m.deleted_at) donoPorCpf.set(c, m);
  }
  console.log(`mem_membros: ${membros.length} (${donoPorCpf.size} CPFs ativos distintos)\n`);

  const resumo = {};
  const conta = (k) => { resumo[k] = (resumo[k] || 0) + 1; };

  const SATELITES = [
    { tabela: 'batismo_inscricoes', cols: 'id, cpf, membro_id, nome, sobrenome', temDeletedAt: true, origem: 'backfill_batismo' },
    { tabela: 'vol_inscricoes', cols: 'id, cpf, membro_id, nome_completo', temDeletedAt: false, origem: 'backfill_vol' },
    { tabela: 'next_matriculas', cols: 'id, cpf, membro_id, nome, sobrenome', temDeletedAt: true, origem: 'backfill_next' },
  ];

  for (const sat of SATELITES) {
    const rows = await fetchAll(sat.tabela, sat.cols, (q) => {
      q = q.not('cpf', 'is', null);
      if (sat.temDeletedAt) q = q.is('deleted_at', null);
      return q;
    });
    console.log(`-- ${sat.tabela}: ${rows.length} linhas com CPF`);

    for (const r of rows) {
      const cpf = normalizarCpf(r.cpf);
      if (!cpf) { conta(`${sat.tabela}.cpf_malformado`); continue; }
      if (!cpfValido(cpf)) { conta(`${sat.tabela}.cpf_dv_invalido`); continue; }
      const dono = donoPorCpf.get(cpf) || null;
      const vinculado = r.membro_id ? porId.get(r.membro_id) : null;

      // sem vínculo → liga ao dono ativo do CPF
      if (!r.membro_id) {
        if (!dono) { conta(`${sat.tabela}.cpf_sem_dono (segue sem vínculo)`); continue; }
        conta(`${sat.tabela}.vinculado_ao_dono`);
        if (APPLY) {
          const { error } = await supabase.from(sat.tabela)
            .update({ membro_id: dono.id }).eq('id', r.id).is('membro_id', null);
          if (error) { console.error(`  [ERRO] ${sat.tabela} ${r.id}:`, error.message); conta(`${sat.tabela}.erro`); }
        }
        continue;
      }

      // vínculo aponta pra membro deletado → repoint pro dono ativo, MAS só
      // com o nome da linha compatível com o do dono. Sem esse gate, uma linha
      // corretamente ligada à esposa (tel+nome) com o CPF do marido digitado
      // errado seria movida pro MARIDO quando o cadastro da esposa fosse
      // fundido — apagando um vínculo certo (e, em batismo 'realizado', o
      // trigger trg_batismo_realizado promoveria a pessoa errada).
      if ((!vinculado || vinculado.deleted_at) && dono) {
        const nomeLinha = r.nome_completo || [r.nome, r.sobrenome].filter(Boolean).join(' ');
        if (!nomesMesmaPessoa(dono.nome, nomeLinha)) {
          conta(`${sat.tabela}.repoint_nome_incompativel_pendencia`);
          if (APPLY) {
            await registrarPendencia({
              tipo: 'vinculo_divergente', membroId: dono.id, conflitoId: null,
              origem: sat.origem, origemId: r.id,
              detalhe: `Vínculo aponta pra membro deletado; o dono ativo do CPF tem nome incompatível com a linha (${nomeLinha || 'sem nome'}) — decidir o repoint manualmente.`,
            });
          }
          continue;
        }
        conta(`${sat.tabela}.repoint_membro_deletado`);
        if (APPLY) {
          const { error } = await supabase.from(sat.tabela)
            .update({ membro_id: dono.id }).eq('id', r.id).eq('membro_id', r.membro_id);
          if (error) { console.error(`  [ERRO] ${sat.tabela} ${r.id}:`, error.message); conta(`${sat.tabela}.erro`); }
        }
        continue;
      }
      if (!vinculado || vinculado.deleted_at) { conta(`${sat.tabela}.vinculo_morto_sem_dono`); continue; }

      const cpfMembro = normalizarCpf(vinculado.cpf);
      if (cpfMembro === cpf) { conta(`${sat.tabela}.ok`); continue; }

      // membro ligado SEM cpf → preenche (o coração do "converteu antes,
      // inscreveu depois": o CPF da inscrição consolida no stub)
      if (!cpfMembro) {
        conta(dono ? `${sat.tabela}.conflito_pendencia (stub + dono do CPF separados)` : `${sat.tabela}.preencher_cpf_no_membro`);
        if (APPLY) {
          try {
            const res = await reconciliarCpfTardio({
              membroId: vinculado.id, cpf, origem: sat.origem, origemId: r.id,
            });
            if (res.acao === 'cpf_preenchido') {
              vinculado.cpf = cpf;               // mantém o mapa coerente
              donoPorCpf.set(cpf, vinculado);
            } else if (res.acao !== 'ja_tinha') {
              conta(`${sat.tabela}.reconciliar_${res.acao}`);
            }
          } catch (e) {
            console.error(`  [ERRO reconciliar] ${sat.tabela} ${r.id}:`, e.message);
            conta(`${sat.tabela}.erro_reconciliar`);
          }
        }
        continue;
      }

      // membro ligado tem OUTRO cpf → divergência (humano decide)
      conta(`${sat.tabela}.vinculo_divergente_pendencia`);
      if (APPLY) {
        await registrarPendencia({
          tipo: 'vinculo_divergente', membroId: vinculado.id,
          conflitoId: dono ? dono.id : null,
          origem: sat.origem, origemId: r.id,
          detalhe: `${sat.tabela} tem CPF que não bate com o CPF do membro vinculado.`,
        });
      }
    }
  }

  // cui_convertidos · espelha o CPF do membro no convertido sem CPF
  const convertidos = await fetchAll('cui_convertidos', 'id, cpf, membro_id',
    (q) => q.is('deleted_at', null).is('cpf', null).not('membro_id', 'is', null));
  let espelhar = 0;
  for (const cv of convertidos) {
    const m = porId.get(cv.membro_id);
    const cpf = m && !m.deleted_at ? normalizarCpf(m.cpf) : null;
    if (!cpf) continue;
    espelhar += 1;
    if (APPLY) {
      const { error } = await supabase.from('cui_convertidos')
        .update({ cpf }).eq('id', cv.id).is('cpf', null);
      if (error) console.error(`  [ERRO] cui_convertidos ${cv.id}:`, error.message);
    }
  }
  resumo['cui_convertidos.espelhar_cpf_do_membro'] = espelhar;

  console.log(`\n== Resumo (${APPLY ? 'aplicado' : 'dry-run · nada gravado'}) ==`);
  for (const [k, v] of Object.entries(resumo).sort()) console.log(`  ${k}: ${v}`);
}

main().catch((e) => { console.error('ERRO:', e.message); process.exit(1); });
