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

module.exports = {
  chavePessoa, PORTA_VINCULO, COLUNAS_ORFA, lerLinhasOrfas, agruparPorPessoa,
  ordemAncora, digitosOrfa: dig, normOrfa: norm,
};
