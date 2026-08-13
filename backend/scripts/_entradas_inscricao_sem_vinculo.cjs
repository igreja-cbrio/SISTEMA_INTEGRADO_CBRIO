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
// ⚠️ DEDUP POR PESSOA ÓRFÃ, não por candidato (corrigido 2026-07-31): a versão
// anterior gravava `origem_id = ref_id` (UMA linha) e dependia do UNIQUE
// (tipo, membro_id) — então duas pessoas órfãs diferentes apontando pro MESMO
// cadastro colapsavam numa pendência só e a segunda desaparecia da fila sem
// registro (5 casos em produção, e em todos sobrevivia a evidência mais FRACA,
// porque quem ganhava era a ordem de inserção). Agora `origem_id` é a CHAVE DA
// PESSOA (`cpf:…`/`tel:…`/`nome:…`) e o UNIQUE parcial da migration
// 20260731120000 é (tipo, origem_id) → 1 decisão por pessoa órfã, e o clique
// liga TODAS as linhas dela.
//
// Dry-run por padrão. `--exec` grava.
// ============================================================================
require('dotenv').config();
const { supabase } = require('../utils/supabase');
const {
  chavePessoa, PORTA_VINCULO, lerLinhasOrfas, agruparPorPessoa,
  digitosOrfa: dig, normOrfa: norm,
} = require('../services/inscricaoOrfas');

const EXEC = process.argv.includes('--exec');

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
  const orfas = await lerLinhasOrfas(supabase);
  console.log('linhas da view sem membro_id:', orfas.length);

  const pessoas = agruparPorPessoa(orfas);

  const membros = await pag('mem_membros', 'id,nome,cpf,telefone,email', (q) => q.is('deleted_at', null));
  const porCpf = new Map(), porTel = new Map(), porNome = new Map();
  for (const m of membros) {
    const c = dig(m.cpf); if (c.length === 11 && !porCpf.has(c)) porCpf.set(c, m);
    const t = dig(m.telefone); if (t.length >= 10) { if (!porTel.has(t)) porTel.set(t, []); porTel.get(t).push(m); }
    const n = norm(m.nome); if (n) { if (!porNome.has(n)) porNome.set(n, []); porNome.get(n).push(m); }
  }

  const pares = [];
  const semCandidato = [];
  for (const [chave, ls] of pessoas) {
    const l = ls[0]; // âncora (quem tem CPF, depois a mais recente)
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
    pares.push({ chave, linha: l, todas: ls, candidato: cand, via });
  }

  const porVia = {};
  for (const p of pares) porVia[p.via] = (porVia[p.via] || 0) + 1;
  console.log('');
  console.log('pessoas órfãs distintas:', pessoas.size);
  console.log('  COM candidato na base:', pares.length, JSON.stringify(porVia));
  console.log('  SEM candidato (não estão na base):', semCandidato.length);

  // Linhas que a fila cobre = TODAS as linhas das pessoas com candidato. Antes
  // só 1 por pessoa entrava, e as outras ficavam órfãs mesmo depois do clique.
  const linhasCobertas = pares.reduce((a, p) => a + p.todas.length, 0);
  const multi = pares.filter((p) => p.todas.length > 1);
  console.log('  linhas cobertas por essas pendências:', linhasCobertas,
    `(${multi.length} pessoas com 2+ linhas)`);

  // Um mesmo candidato pode servir a 2 pessoas-chave diferentes — e isso agora
  // gera DUAS pendências (uma por pessoa), de propósito.
  const candDup = new Map();
  for (const p of pares) candDup.set(p.candidato.id, (candDup.get(p.candidato.id) || 0) + 1);
  const colididos = [...candDup.values()].filter((n) => n > 1).length;
  if (colididos) console.log('  candidatos apontados por mais de uma pessoa órfã:', colididos, '(2 pendências, decisão separada)');

  // Porta sem ponteiro mapeado: o clique não conseguiria ligar. Avisar aqui
  // (e não descobrir no clique) é o ponto do dry-run.
  const semMapa = new Set();
  for (const p of pares) for (const l of p.todas) if (!PORTA_VINCULO[l.porta]) semMapa.add(l.porta);
  if (semMapa.size) console.log('  ⚠️ portas SEM ponteiro em PORTA_VINCULO:', [...semMapa].join(', '));

  console.log('');
  console.log('amostra (10):');
  for (const p of pares.slice(0, 10)) {
    console.log('  [' + p.via + '] "' + p.linha.nome_display + '" (' + p.todas.length + ' linha(s): '
      + [...new Set(p.todas.map((x) => x.porta))].join(', ') + ') -> cadastro "' + p.candidato.nome + '"');
  }

  if (!EXEC) {
    console.log('');
    console.log('DRY-RUN. Nada foi gravado. Rode com --exec pra enfileirar em Entradas.');
    console.log('⚠️ Exige as migrations 20260730170000 (tipo no CHECK) e 20260731120000 (UNIQUE por pessoa).');
    return;
  }

  let inseridas = 0, jaExistia = 0, erros = 0;
  for (const p of pares) {
    const portas = [...new Set(p.todas.map((x) => x.porta))].join(', ');
    const detalhe = `Inscrição sem cadastro em ${portas}: "${p.linha.nome_display}"`
      + ` (tel ${p.linha.telefone_norm || '—'}${p.linha.cpf_norm ? ', CPF informado' : ', sem CPF'}).`
      + ` Candidato achado por ${p.via}: "${p.candidato.nome}".`
      + ` ${p.todas.length} linha(s) de inscrição desta pessoa — ligar resolve todas.`
      + (p.via.includes('FRACO') ? ' ⚠️ SINAL FRACO — nome igual não é prova; confira antes de ligar.' : '');
    const { error } = await supabase.from('identidade_pendencias').insert({
      tipo: 'inscricao_sem_vinculo',
      membro_id: p.candidato.id,
      membro_conflito_id: null,
      origem: p.linha.porta,          // porta que revelou (rótulo)
      origem_id: p.chave,             // CHAVE DA PESSOA — é o que a rota usa
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
