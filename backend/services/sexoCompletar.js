// ════════════════════════════════════════════════════════════════════════════
//  Completar o SEXO de quem está sem — em duas camadas separadas de propósito
//
//  Pedido do Matheus (14/08/2026): "tem muito que é só o sexo. Será que
//  conseguimos usar IA para ver pelo nome se é feminino ou masculino?"
//
//  ⚠️⚠️ A LEI (10/08) segue de pé: NUNCA inferir sexo por nome e gravar como se
//  fosse declaração. O sexo é REGRA DE NEGÓCIO nos grupos (a trava de categoria
//  Homens/Mulheres recusa inscrição quando não bate), então palpite errado
//  impede alguém de entrar no grupo certo — e ninguém sabe quais estão errados.
//
//  CAMADA 1 · `colherDeclaracoes` — a pessoa JÁ declarou o sexo em outra porta
//    (voluntariado, Next, batismo, cadastro pendente). É dado dela: grava
//    direto, só-onde-vazio, sem revisão. Mesma política de telefone e e-mail.
//
//  CAMADA 2 · `sugerirPorNome` + `confirmarSexos` — palpite do modelo vira
//    SUGESTÃO efêmera; só a confirmação HUMANA grava. E é essa confirmação que
//    legitima o dado: deixa de ser palpite da máquina e vira decisão da igreja.
//
//  ⚠️ A sugestão NÃO É PERSISTIDA de propósito (sem tabela de fila): fila de
//  sugestão envelhece — a pessoa declara o sexo pelo censo e a linha antiga
//  continua lá propondo o contrário. Recalcular custa centavos; divergir custa
//  um cadastro errado.
// ════════════════════════════════════════════════════════════════════════════

const Anthropic = require('@anthropic-ai/sdk');
const { supabase } = require('../utils/supabase');
const { registrarObservacaoSegura } = require('./identidadeProgressiva');
const {
  normalizarSexo,
  consolidarDeclaracoes,
  primeiroNomeParaPalpite,
  palpitesUsaveis,
  casarPalpites,
} = require('../utils/sexoDeclarado');

const LOTE_IN = 200;       // `.in()` maior estoura a URL do PostgREST
const PAGINA = 1000;       // cap server-side do PostgREST
const TETO_PALPITE = 150;  // por chamada — o cliente aborta em 30s (14/08)

function clienteAnthropic() {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY não configurada');
  return new Anthropic();
}

/** Lê tudo, paginando (a base passa de 1000 e o cap trunca em silêncio). */
async function lerPaginado(tabela, colunas, aplicarFiltros) {
  let todas = [];
  let offset = 0;
  for (;;) {
    let q = supabase.from(tabela).select(colunas).range(offset, offset + PAGINA - 1);
    if (aplicarFiltros) q = aplicarFiltros(q);
    const { data, error } = await q;
    if (error) throw error;
    todas = todas.concat(data || []);
    if (!data || data.length < PAGINA) break;
    offset += PAGINA;
  }
  return todas;
}

/**
 * Pessoas vivas sem sexo.
 *
 * ⚠️ `apenasIds` restringe ao universo de quem chamou (a aba Pessoas passa o
 * universo dos GRUPOS). Sem ele, um endpoint guardado por `grupos` estaria
 * escrevendo na base inteira — inclusive em quem nunca passou por um grupo.
 */
async function pessoasSemSexo({ apenasIds = null } = {}) {
  // ⚠️ `.order('id')` NÃO é enfeite: sem ORDER BY, `range()` pode repetir e
  // perder linhas entre páginas (lição do /comunicacao/custo), e o `offset` que
  // a tela usa pra varrer em blocos ficaria dependendo de sorte — pessoas
  // apareceriam duas vezes e outras nunca.
  const linhas = await lerPaginado(
    'mem_membros',
    'id, nome',
    q => q.is('deleted_at', null).is('genero', null).order('id'),
  );
  const filtradas = apenasIds ? linhas.filter(m => apenasIds.has(m.id)) : linhas;
  return filtradas.filter(m => m.nome);
}

// ── CAMADA 1 ────────────────────────────────────────────────────────────────

/**
 * Colhe o sexo que a própria pessoa declarou em outras portas.
 *
 * ⚠️ Divergência entre portas NÃO desempata: vira `conflito` e fica pra decisão
 * humana (`consolidarDeclaracoes`). Uma das duas está errada, ou são pessoas
 * diferentes fundidas por engano — gravar qualquer uma é gravar um erro com
 * cara de dado.
 *
 * @param {{aplicar?:boolean}} opts `aplicar:false` = dry-run (padrão)
 */
async function colherDeclaracoes({ aplicar = false, apenasIds = null } = {}) {
  const alvo = await pessoasSemSexo({ apenasIds });
  const ids = alvo.map(p => p.id);
  const porPessoa = new Map(ids.map(id => [id, []]));

  // ⚠️ Cada fonte num bloco PRÓPRIO: tabela que falte (ou coluna que mude) não
  // pode derrubar a colheita inteira — perderíamos as outras 3 em silêncio.
  // ⚠️ `mem_cadastros_pendentes` ficou de FORA: o backfill de 10/08 já colheu as
  // 51 declarações de lá, e a única ligação daquela tabela com o cadastro é
  // `duplicado_de_id` — que existe só quando a linha foi marcada como duplicata,
  // não como vínculo de identidade. Usá-la como chave colheria sexo de uma
  // pessoa para o cadastro de outra nos casos em que o "duplicado" estava errado.
  const FONTES = [
    { fonte: 'voluntariado', tabela: 'vol_inscricoes',     soft: true },
    { fonte: 'next',         tabela: 'next_matriculas',    soft: false },
    { fonte: 'batismo',      tabela: 'batismo_inscricoes', soft: true },
  ];

  const avisos = [];
  for (const f of FONTES) {
    const coluna = f.coluna || 'sexo';
    const chave = f.chave || 'membro_id';
    try {
      for (let i = 0; i < ids.length; i += LOTE_IN) {
        const bloco = ids.slice(i, i + LOTE_IN);
        let q = supabase.from(f.tabela).select(`${chave}, ${coluna}`).in(chave, bloco).not(coluna, 'is', null);
        if (f.soft) q = q.is('deleted_at', null);
        const { data, error } = await q;
        if (error) throw error;
        for (const linha of data || []) {
          const alvoId = linha[chave];
          if (porPessoa.has(alvoId)) porPessoa.get(alvoId).push({ fonte: f.fonte, sexo: linha[coluna] });
        }
      }
    } catch (e) {
      avisos.push(`${f.fonte}: ${e.message}`);
      console.error(`[sexoCompletar] fonte ${f.fonte} falhou:`, e.message);
    }
  }

  const aplicaveis = [];
  const conflitos = [];
  for (const p of alvo) {
    const r = consolidarDeclaracoes(porPessoa.get(p.id) || []);
    if (r.conflito) { conflitos.push({ membro_id: p.id, nome: p.nome, fontes: r.fontes }); continue; }
    if (r.sexo) aplicaveis.push({ membro_id: p.id, nome: p.nome, sexo: r.sexo, fontes: r.fontes });
  }

  let gravados = 0;
  if (aplicar) {
    for (const a of aplicaveis) {
      // ⚠️ `.is('genero', null)` de guarda: entre a leitura e a
      // escrita a pessoa pode ter declarado o sexo pelo censo, e declaração
      // recente vence colheita de porta antiga.
      const { data, error } = await supabase
        .from('mem_membros')
        .update({ genero: a.sexo })
        .eq('id', a.membro_id)
        .is('deleted_at', null)
        .is('genero', null)
        .select('id');
      if (error) { console.error('[sexoCompletar] gravar declaração:', error.message); continue; }
      if (data && data.length) {
        gravados += 1;
        await registrarObservacaoSegura({
          membroId: a.membro_id,
          origem: 'sexo_colhido_porta',
          origemId: a.fontes.join(','),
          nome: a.nome,
          dados: { genero: a.sexo, fontes: a.fontes },
        });
      }
    }
  }

  return {
    sem_sexo: alvo.length,
    aplicaveis: aplicaveis.length,
    conflitos,
    gravados,
    avisos,
    exemplos: aplicaveis.slice(0, 10).map(a => `${a.nome} → ${a.sexo} (${a.fontes.join(', ')})`),
  };
}

// ── CAMADA 2 ────────────────────────────────────────────────────────────────

// ⚠️ Formato COMPACTO por decisão de TEMPO: o formato por objeto (um `{nome,
// sexo, confianca}` por nome) gera ~8x mais tokens de saída, e o cliente aborta
// a requisição em 30s — foi o que aconteceu no 1º uso real (14/08), com a tela
// presa em "Consultando a IA…" e nada voltando. Aqui o modelo devolve só os
// nomes de que tem certeza, em duas listas; o ambíguo nem trafega — que é
// exatamente a política (ambíguo não vira sugestão).
const PROMPT = `Você recebe uma lista de PRIMEIROS NOMES brasileiros.

Responda SOMENTE este JSON, sem texto em volta e sem quebras de linha:
{"masculino":["..."],"feminino":["..."]}

REGRAS:
- Inclua um nome APENAS se ele for inequivocamente masculino ou feminino no Brasil.
- OMITA (não coloque em nenhuma das listas) nomes unissex (Alex, Ariel, Darci, Jean, Yuri, Nicola, Lindomar), nomes estrangeiros que você não conhece, apelidos, iniciais e qualquer caso em que você hesitaria.
- Na dúvida, OMITA. Um palpite errado aqui vai para o cadastro de uma pessoa real e decide em qual grupo ela pode entrar — errar é pior do que não responder.
- Copie o nome exatamente como veio. Não invente nomes fora da lista.`;

/**
 * Pede palpites ao modelo para os nomes que sobraram.
 *
 * ⚠️ Manda SÓ o primeiro nome (LGPD · minimização): sobrenome não ajuda a
 * decidir sexo, e mandar o nome completo de milhares de pessoas expõe mais do
 * que a tarefa exige.
 *
 * ⚠️ Nomes REPETIDOS viram uma pergunta só ("Maria" aparece 300 vezes): o
 * palpite é sobre o NOME, não sobre a pessoa. Sem isso a chamada custaria 10x e
 * o modelo poderia responder diferente pro mesmo nome na mesma lista.
 */
async function sugerirPorNome({ limite = TETO_PALPITE, offset = 0, apenasIds = null } = {}) {
  const todas = await pessoasSemSexo({ apenasIds });
  const inicio = Math.max(0, Number(offset) || 0);
  const tamanho = Math.max(1, Math.min(Number(limite) || TETO_PALPITE, TETO_PALPITE));
  const alvo = todas.slice(inicio, inicio + tamanho);

  const nomes = new Set();
  for (const p of alvo) {
    const pn = primeiroNomeParaPalpite(p.nome);
    if (pn) nomes.add(pn);
  }
  const base = {
    total: todas.length,
    offset: inicio,
    proximo_offset: inicio + alvo.length < todas.length ? inicio + alvo.length : null,
    sem_sexo: alvo.length,
  };
  if (!nomes.size) return { ...base, sugestoes: [], nomes_perguntados: 0, sem_sugestao: alvo.length };

  const lista = [...nomes];
  const client = clienteAnthropic();
  let palpites = [];

  // ⚠️ Blocos de 60 nomes (era 150) e `max_tokens` menor: o cliente aborta a
  // requisição em 30s, e o que estourava esse teto era o TEMPO DE GERAÇÃO da
  // resposta. Bloco menor + formato compacto devolve em poucos segundos.
  for (let i = 0; i < lista.length; i += 60) {
    const bloco = lista.slice(i, i + 60);
    const r = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2000,
      system: PROMPT,
      messages: [{ role: 'user', content: JSON.stringify(bloco) }],
    });
    const texto = (r.content || []).map(c => c.text || '').join('');
    try {
      const json = JSON.parse(texto.replace(/```json|```/g, '').trim());
      palpites = palpites.concat(palpitesUsaveis(json));
    } catch (e) {
      // ⚠️ Bloco que não parseou é DECLARADO, não engolido: sem isso a tela
      // mostraria menos sugestões sem ninguém entender por quê.
      console.error('[sexoCompletar] resposta do modelo não parseou:', e.message);
    }
  }

  const sugestoes = casarPalpites(alvo, palpites);
  return {
    ...base,
    sugestoes,
    nomes_perguntados: lista.length,
    sem_sexo: alvo.length,
    // Quem o modelo marcou ambíguo (ou não conhecia) simplesmente não aparece —
    // e é assim que tem que ser: essas pessoas declaram pelo censo.
    sem_sugestao: alvo.length - sugestoes.length,
  };
}

/**
 * Grava o que uma PESSOA confirmou. É esta função que legitima o palpite.
 *
 * ⚠️ Revalida tudo no servidor: o payload diz QUAIS, nunca "se pode". E só
 * escreve em quem está sem sexo — confirmar por cima de declaração alheia
 * seria o palpite vencendo o dado real.
 */
async function confirmarSexos(itens, { por = null } = {}) {
  const lista = (Array.isArray(itens) ? itens : []).slice(0, TETO_PALPITE);
  let gravados = 0;
  const recusados = [];

  for (const item of lista) {
    const sexo = normalizarSexo(item?.sexo);
    const id = item?.membro_id;
    if (!id || !sexo) { recusados.push({ membro_id: id || null, motivo: 'sexo_invalido' }); continue; }

    const { data, error } = await supabase
      .from('mem_membros')
      .update({ genero: sexo })
      .eq('id', id)
      .is('deleted_at', null)
      .is('genero', null)
      .select('id, nome');
    if (error) { recusados.push({ membro_id: id, motivo: error.message }); continue; }
    if (!data || !data.length) { recusados.push({ membro_id: id, motivo: 'ja_tinha_sexo' }); continue; }

    gravados += 1;
    // ⚠️ A ORIGEM fica registrada pra sempre. Sem isso, daqui a um ano ninguém
    // distingue o que a pessoa declarou do que foi palpite confirmado — e essa
    // distinção é o que permite rever a decisão se ela se mostrar ruim.
    await registrarObservacaoSegura({
      membroId: id,
      origem: 'sexo_inferido_ia',
      origemId: por ? String(por) : null,
      nome: data[0].nome,
      dados: { genero: sexo, confirmado_por: por || null },
    });
  }

  return { gravados, recusados };
}

module.exports = { colherDeclaracoes, sugerirPorNome, confirmarSexos, pessoasSemSexo };
