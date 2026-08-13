// ============================================================================
// Inscrição órfã · a PESSOA sem cadastro e onde cada porta guarda o ponteiro
// ============================================================================
// Fonte ÚNICA da régua "estas linhas da view unificada são a mesma pessoa".
// Antes vivia copiada dentro do script de enfileiramento; a rota que LIGA a
// inscrição ao cadastro precisa da mesma régua, e duas cópias divergindo é
// como a fila passa a apontar pra linha diferente da que o clique liga.
//
// ⚠️ A chave é DERIVADA (cpf > telefone > nome), nunca persistida como
// identidade: ela agrupa linhas pra decisão humana, não afirma que são a mesma
// pessoa. Quem afirma é quem clica.
// ============================================================================

const dig = (v) => String(v || '').replace(/\D/g, '');
const norm = (v) => String(v || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/\s+/g, ' ').trim();

/**
 * Chave da pessoa por trás de uma linha órfã da `vw_inscricoes_unificadas`.
 * Ordem = força da evidência. `ref:<id>` é o caso sem chave nenhuma (linha só
 * com nome vazio) — cada uma fica sozinha, que é o certo: não há o que agrupar.
 */
function chavePessoa(linha) {
  const c = dig(linha.cpf_norm);
  if (c.length === 11) return 'cpf:' + c;
  const t = dig(linha.telefone_norm);
  if (t.length >= 10) return 'tel:' + t;
  const n = norm(linha.nome_display);
  return n ? 'nome:' + n : 'ref:' + linha.ref_id;
}

// ── Onde cada porta guarda o ponteiro de pessoa ────────────────────────────
// Espelha `escritores` de services/inscricaoPortas.js, mas indexado pelos nomes
// de PORTA da view (que não são os mesmos do catálogo: 'apresentacao' lá são
// duas portas aqui). ⚠️ A apresentação usa `responsavel_membro_id` — a criança
// não é a pessoa do vínculo —, por isso a coluna é declarada por porta em vez
// de assumida como `membro_id`.
const PORTA_VINCULO = Object.freeze({
  next: { tabela: 'next_matriculas', col: 'membro_id' },
  voluntariado: { tabela: 'vol_inscricoes', col: 'membro_id' },
  inscricoes: { tabela: 'inscricoes', col: 'membro_id' },
  eventos_externos: { tabela: 'ext_inscricoes', col: 'membro_id' },
  batismo: { tabela: 'batismo_inscricoes', col: 'membro_id' },
  grupos: { tabela: 'mem_grupo_pedidos', col: 'membro_id' },
  grupos_lider: { tabela: 'mem_lider_inscricoes', col: 'membro_id' },
  apresentacao_criancas: { tabela: 'apresentacao_criancas', col: 'responsavel_membro_id' },
  apresentacao_bebes: { tabela: 'apresentacao_bebes', col: 'responsavel_membro_id' },
});

const COLUNAS_ORFA = 'porta,ref_id,membro_id,nome_display,telefone_norm,cpf_norm,email_norm,nascimento,criado_em,evento_rotulo';

/**
 * Todas as linhas da view SEM `membro_id`, paginadas (o cap de 1000 do
 * PostgREST vale aqui: a view tem ~3.5k linhas).
 */
async function lerLinhasOrfas(supabase, colunas = COLUNAS_ORFA) {
  const out = [];
  for (let off = 0; ; off += 1000) {
    const { data, error } = await supabase.from('vw_inscricoes_unificadas')
      .select(colunas).is('membro_id', null).range(off, off + 999);
    if (error) throw new Error('vw_inscricoes_unificadas: ' + error.message);
    out.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  return out;
}

/** Map chave -> linhas[], com a linha mais informativa da pessoa na frente. */
function agruparPorPessoa(linhas) {
  const mapa = new Map();
  for (const l of linhas) {
    const k = chavePessoa(l);
    if (!mapa.has(k)) mapa.set(k, []);
    mapa.get(k).push(l);
  }
  for (const ls of mapa.values()) ls.sort(ordemAncora);
  return mapa;
}

/**
 * Âncora = a linha que melhor descreve a pessoa: quem tem CPF primeiro, depois
 * a mais recente. É dela que sai o nome exibido no detalhe da pendência.
 */
function ordemAncora(a, b) {
  const d = dig(b.cpf_norm).length - dig(a.cpf_norm).length;
  if (d !== 0) return d;
  return String(b.criado_em || '').localeCompare(String(a.criado_em || ''));
}

// ── Força da evidência · o que decide se ligar em LOTE é honesto ───────────
// ⚠️ NÃO confundir com `chavePessoa`. A chave diz "estas linhas órfãs são a
// mesma pessoa" (agrupa pra decisão). A FORÇA diz "este cadastro candidato é
// essa pessoa" — é outra pergunta, e é ela que autoriza ligar sem conferir.
//
// Medido em 05/08, e é o bug que o Matheus viu: `origem_id = 'cpf:...'`
// significa que a INSCRIÇÃO trouxe CPF, **não** que o candidato foi achado por
// ele. Das 7 pendências com chave `cpf:`, 4 casaram por telefone+nome com um
// cadastro que não tem CPF nenhum (caso Ana Luisa Dib Silvestre) — e a tela
// prometia "ligar é seguro sem conferir nome".
//
// A régua é a do **matcher canônico** (Contrato de porta): CPF, ou
// telefone+NOME. Nada aqui é mais frouxo que o que já liga sozinho em toda
// porta do sistema; o que é mais frouxo (primeiro nome igual + telefone, que o
// enfileiramento aceita pra SUGERIR) fica de fora, porque é exatamente o caso
// mãe/filha no telefone da casa.
const FORCA = Object.freeze({ CPF: 'forte_cpf', TEL_NOME: 'forte_telefone_nome', MANUAL: 'manual' });

/**
 * @param {object} insc  linha órfã ÂNCORA (nome_display, telefone_norm, cpf_norm, nascimento)
 * @param {object} cad   cadastro candidato (nome, telefone, cpf, data_nascimento)
 * @returns {{forca:string, motivo:string, veto:string|null}}
 */
function avaliarForcaOrfa(insc, cad) {
  if (!insc || !cad) return { forca: FORCA.MANUAL, motivo: 'sem dados dos dois lados', veto: null };

  // VETO antes de tudo: nascimento conferível e DIFERENTE é contradição, não
  // sinal fraco. A duplicidadePolicy exclui par com nascimento conflitante, e a
  // mesma régua vale aqui — nenhuma outra evidência compra isso de volta.
  const nInsc = String(insc.nascimento || '').slice(0, 10);
  const nCad = String(cad.data_nascimento || '').slice(0, 10);
  if (nInsc && nCad && nInsc !== nCad) {
    return { forca: FORCA.MANUAL, motivo: 'nascimento divergente entre a inscrição e o cadastro', veto: 'nascimento_divergente' };
  }

  const cpfInsc = dig(insc.cpf_norm);
  const cpfCad = dig(cad.cpf);
  // 2º VETO, e ele vem ANTES das evidências fortes de propósito: CPF diferente
  // dos dois lados é evidência CONTRA, e cair no ramo telefone+nome depois dela
  // seria escolher a evidência que convém.
  if (cpfInsc.length === 11 && cpfCad.length === 11 && cpfInsc !== cpfCad) {
    return { forca: FORCA.MANUAL, motivo: 'a inscrição trouxe CPF diferente do CPF do cadastro', veto: 'cpf_divergente' };
  }
  if (cpfInsc.length === 11 && cpfInsc === cpfCad) {
    return { forca: FORCA.CPF, motivo: 'o CPF da inscrição é o CPF do cadastro', veto: null };
  }

  const telInsc = dig(insc.telefone_norm);
  const telCad = dig(cad.telefone);
  const nomeInsc = norm(insc.nome_display);
  const nomeCad = norm(cad.nome);
  // Telefone SOZINHO nunca identifica (lei do Contrato de porta) e primeiro
  // nome igual também não — exige o nome COMPLETO idêntico.
  if (telInsc.length >= 10 && telInsc === telCad && nomeInsc && nomeInsc === nomeCad) {
    return { forca: FORCA.TEL_NOME, motivo: 'mesmo telefone e nome completo idêntico', veto: null };
  }

  if (telInsc.length >= 10 && telInsc === telCad) {
    return { forca: FORCA.MANUAL, motivo: 'telefone igual mas o nome não é o mesmo — telefone é compartilhado em família', veto: null };
  }
  return { forca: FORCA.MANUAL, motivo: 'sem chave forte em comum — confira antes de ligar', veto: null };
}

const forcaPodeLote = (f) => f === FORCA.CPF || f === FORCA.TEL_NOME;

module.exports = {
  chavePessoa, PORTA_VINCULO, COLUNAS_ORFA, lerLinhasOrfas, agruparPorPessoa,
  ordemAncora, digitosOrfa: dig, normOrfa: norm,
  FORCA, avaliarForcaOrfa, forcaPodeLote,
};
