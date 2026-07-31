// ============================================================================
// Enfileira em Entradas os pares "inscrição órfã × cadastro candidato".
// ============================================================================
// Pedido do Marcos (2026-07-30): "não resolva duplicatas, adicione os pares lá."
//
// NUNCA liga, funde ou cria cadastro. Só INSERE pendência `inscricao_sem_vinculo`
// com o candidato e a evidência, pra decisão humana no painel de Entradas.
//
// Régua da evidência (a mesma do matcher canônico, na mesma ordem de força):
//   cpf            · prova forte — CPF de 11 dígitos igual
//   telefone+nome  · forte-ish — telefone igual E nome compatível (igual ou
//                    mesmo primeiro nome). Telefone SOZINHO nunca entra:
//                    família compartilha número.
//   nome           · FRACO — só nome exato. Entra marcado como fraco no detalhe,
//                    porque nome igual não é prova (a lei da casa).
//
// Dedup: 1 pendência ABERTA por (tipo, membro candidato) — é o UNIQUE da tabela
// com NULLS NOT DISTINCT. Reenfileirar é no-op (23505 engolido).
//
// Dry-run por padrão. `--exec` grava.
// ============================================================================
require('dotenv').config();
const { supabase } = require('../utils/supabase');

const EXEC = process.argv.includes('--exec');
const dig = (v) => String(v || '').replace(/\D/g, '');
const norm = (v) => String(v || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/\s+/g, ' ').trim();

const pag = async (t, sel, f = (q) => q) => {
  let all = [], off = 0;
  for (;;) {
    const { data, error } = await f(supabase.from(t).select(sel)).range(off, off + 999);
    if (error) throw new Error(t + ': ' + error.message);
    all = all.concat(data || []);
    if (!data || data.length < 1000) break;
    off += 1000;
  }
  return all;
};

(async () => {
  const linhas = await pag('vw_inscricoes_unificadas',
    'porta,ref_id,membro_id,nome_display,telefone_norm,cpf_norm,email_norm,criado_em,evento_rotulo');
  const orfas = linhas.filter((l) => !l.membro_id);
  console.log('linhas na view:', linhas.length, '| sem membro_id:', orfas.length);

  // Uma pendência por PESSOA, não por linha (a decisão é sobre a pessoa).
  const chaveP = (l) => {
    const c = dig(l.cpf_norm); if (c.length === 11) return 'cpf:' + c;
    const t = dig(l.telefone_norm); if (t.length >= 10) return 'tel:' + t;
    const n = norm(l.nome_display); return n ? 'nome:' + n : 'ref:' + l.ref_id;
  };
  const pessoas = new Map();
  for (const l of orfas) {
    const k = chaveP(l);
    if (!pessoas.has(k)) pessoas.set(k, []);
    pessoas.get(k).push(l);
  }

  const membros = await pag('mem_membros', 'id,nome,cpf,telefone,email', (q) => q.is('deleted_at', null));
  const porCpf = new Map(), porTel = new Map(), porNome = new Map();
  for (const m of membros) {
    const c = dig(m.cpf); if (c.length === 11 && !porCpf.has(c)) porCpf.set(c, m);
    const t = dig(m.telefone); if (t.length >= 10) { if (!porTel.has(t)) porTel.set(t, []); porTel.get(t).push(m); }
    const n = norm(m.nome); if (n) { if (!porNome.has(n)) porNome.set(n, []); porNome.get(n).push(m); }
  }

  const pares = [];
  const semCandidato = [];
  for (const [, ls] of pessoas) {
    // A linha mais informativa da pessoa vira a "âncora" do par.
    const l = ls.slice().sort((a, b) =>
      (dig(b.cpf_norm).length - dig(a.cpf_norm).length)
      || (String(b.criado_em) > String(a.criado_em) ? 1 : -1))[0];
    const c = dig(l.cpf_norm), t = dig(l.telefone_norm), n = norm(l.nome_display);
    let cand = null, via = null;

    if (c.length === 11 && porCpf.has(c)) { cand = porCpf.get(c); via = 'cpf'; }
    if (!cand && t.length >= 10 && porTel.has(t)) {
      const achou = porTel.get(t).find((m) => {
        const mn = norm(m.nome);
        return mn && n && (mn === n || mn.split(' ')[0] === n.split(' ')[0]);
      });
      if (achou) { cand = achou; via = 'telefone+nome'; }
    }
    if (!cand && n && porNome.has(n) && porNome.get(n).length === 1) {
      // Só quando o nome é ÚNICO na base — homônimo múltiplo não é candidato.
      cand = porNome.get(n)[0]; via = 'nome (FRACO)';
    }

    if (!cand) { semCandidato.push({ porta: [...new Set(ls.map((x) => x.porta))].join('+'), nome: l.nome_display }); continue; }
    pares.push({ linha: l, todas: ls, candidato: cand, via });
  }

  const porVia = {};
  for (const p of pares) porVia[p.via] = (porVia[p.via] || 0) + 1;
  console.log('');
  console.log('pessoas órfãs distintas:', pessoas.size);
  console.log('  COM candidato na base:', pares.length, JSON.stringify(porVia));
  console.log('  SEM candidato (não estão na base):', semCandidato.length);

  // Um mesmo candidato pode servir a 2 pessoas-chave diferentes; o UNIQUE da
  // tabela deduplica, mas avisar aqui evita susto na contagem final.
  const candDup = new Map();
  for (const p of pares) candDup.set(p.candidato.id, (candDup.get(p.candidato.id) || 0) + 1);
  const colididos = [...candDup.values()].filter((n) => n > 1).length;
  if (colididos) console.log('  ⚠️ candidatos apontados por mais de uma chave:', colididos, '(o UNIQUE vai deduplicar)');

  console.log('');
  console.log('amostra (10):');
  for (const p of pares.slice(0, 10)) {
    console.log('  [' + p.via + '] "' + p.linha.nome_display + '" (' + p.linha.porta + ')'
      + ' -> cadastro "' + p.candidato.nome + '"');
  }

  if (!EXEC) {
    console.log('');
    console.log('DRY-RUN. Nada foi gravado. Rode com --exec pra enfileirar em Entradas.');
    console.log('⚠️ Exige a migration 20260730170000 aplicada (tipo inscricao_sem_vinculo no CHECK).');
    return;
  }

  let inseridas = 0, jaExistia = 0, erros = 0;
  for (const p of pares) {
    const portas = [...new Set(p.todas.map((x) => x.porta))].join(', ');
    const detalhe = `Inscrição sem cadastro em ${portas}: "${p.linha.nome_display}"`
      + ` (tel ${p.linha.telefone_norm || '—'}${p.linha.cpf_norm ? ', CPF informado' : ', sem CPF'}).`
      + ` Candidato achado por ${p.via}: "${p.candidato.nome}".`
      + ` ${p.todas.length} linha(s) de inscrição desta pessoa.`
      + (p.via.includes('FRACO') ? ' ⚠️ SINAL FRACO — nome igual não é prova; confira antes de ligar.' : '');
    const { error } = await supabase.from('identidade_pendencias').insert({
      tipo: 'inscricao_sem_vinculo',
      membro_id: p.candidato.id,
      membro_conflito_id: null,
      origem: p.linha.porta,
      origem_id: String(p.linha.ref_id),
      detalhe: detalhe.slice(0, 1000),
      status: 'pendente',
    });
    if (!error) inseridas++;
    else if (error.code === '23505') jaExistia++;
    else { erros++; if (erros <= 3) console.error('  erro:', error.code, error.message); }
  }
  console.log('');
  console.log('enfileiradas:', inseridas, '| já existiam (dedup):', jaExistia, '| erros:', erros);
  const { count } = await supabase.from('identidade_pendencias')
    .select('*', { count: 'exact', head: true })
    .eq('tipo', 'inscricao_sem_vinculo').eq('status', 'pendente');
  console.log('fila inscricao_sem_vinculo/pendente agora:', count);
})().catch((e) => { console.error('ERRO:', e.message); process.exit(1); });
