// ============================================================================
// Sorteio do evento · quem pode ganhar (regras do Marcos · 2026-07-31)
// ============================================================================
// Decisões dele, nesta conversa:
//   1. "deve ser apenas as pessoas que fizeram check-in, mais correto" →
//      presença é PRÉ-REQUISITO. Quem se inscreveu e não veio não concorre.
//   2. "todos os 97 devem participar, não apenas quem se inscreveu após o
//      módulo de inscrições" → inscrição MIGRADA do Celebra antigo concorre
//      igual. Por isso o filtro NUNCA pode exigir CPF, membro_id nem
//      `legado_fonte IS NULL` (85 das 98 do Celebra são migradas e 82 não têm
//      CPF — exigir qualquer um desses cortaria a maioria do salão).
//   3. "uma pessoa não pode ganhar dois prêmios no mesmo sorteio do mesmo
//      evento" → o dedup é por PESSOA, não por linha de inscrição. Antes era
//      `insc_sorteios.inscricao_id`, o que deixaria a mesma pessoa com duas
//      inscrições ganhar duas vezes (hoje não há caso no Celebra, mas a regra
//      é da casa, não do dado de hoje).
//
// Funções PURAS de propósito: a decisão de quem entra no bolo é a parte que
// precisa de teste, e teste que depende de banco ninguém roda no palco.
// ============================================================================

const dig = (v) => String(v || '').replace(/\D/g, '');
const norm = (v) => String(v || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/\s+/g, ' ').trim();

/**
 * Identidade da PESSOA por trás de uma inscrição, na ordem de força.
 * `membro_id` primeiro: é o único que sobrevive a grafia diferente do nome.
 */
function chavePessoaInscricao(i) {
  if (i?.membro_id) return 'mem:' + i.membro_id;
  const c = dig(i?.cpf);
  if (c.length === 11) return 'cpf:' + c;
  const t = dig(i?.telefone);
  if (t.length >= 10) return 'tel:' + t;
  const n = norm(i?.nome_completo);
  return n ? 'nome:' + n : 'insc:' + i?.id;
}

/**
 * Quem pode ser sorteado agora.
 * @param inscritos      linhas de `inscricoes` do evento (id, status, numero_sorte, membro_id, cpf, telefone, nome_completo)
 * @param presentesIds   ids de inscrição COM check-in
 * @param sorteios       linhas de `insc_sorteios` do evento (inscricao_id, substituido_em)
 */
function elegiveisDoSorteio({ inscritos = [], presentesIds = [], sorteios = [] } = {}) {
  const presentes = new Set(presentesIds);
  const porId = new Map(inscritos.map((i) => [i.id, i]));

  // Chaves de PESSOA que já levaram prêmio. Sorteio substituído (re-sorteio do
  // mesmo prêmio) NÃO conta — senão o ganhador trocado ficaria bloqueado sem
  // ter prêmio na mão.
  const jaGanharam = new Set();
  for (const s of sorteios) {
    if (s?.substituido_em) continue;
    const i = porId.get(s?.inscricao_id);
    // Inscrição apagada depois do sorteio: guarda a própria referência, senão
    // um ganhador excluído voltaria a concorrer por baixo do pano.
    jaGanharam.add(i ? chavePessoaInscricao(i) : 'insc:' + s?.inscricao_id);
  }

  return inscritos.filter((i) => i
    && i.status !== 'cancelada'
    && i.numero_sorte != null
    && presentes.has(i.id)
    && !jaGanharam.has(chavePessoaInscricao(i)));
}

/**
 * Por que não há elegível — a portaria/palco precisa da razão CERTA, não de
 * "sem inscritos pra sortear" (a mensagem antiga, que mentia nos 3 casos).
 */
function motivoSemElegivel({ inscritos = [], presentesIds = [], sorteios = [] } = {}) {
  const ativos = inscritos.filter((i) => i.status !== 'cancelada' && i.numero_sorte != null);
  if (!ativos.length) return { motivo: 'sem_inscritos', presentes: 0, ativos: 0 };
  const presentes = ativos.filter((i) => presentesIds.includes(i.id));
  if (!presentes.length) return { motivo: 'ninguem_presente', presentes: 0, ativos: ativos.length };
  return {
    motivo: 'todos_presentes_ja_ganharam',
    presentes: presentes.length,
    ativos: ativos.length,
    sorteios: sorteios.filter((s) => !s.substituido_em).length,
  };
}

module.exports = { chavePessoaInscricao, elegiveisDoSorteio, motivoSemElegivel };
