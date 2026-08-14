// ════════════════════════════════════════════════════════════════════════════
//  SEXO · o que é DECLARAÇÃO da pessoa e o que é PALPITE
//
//  Pedido do Matheus (14/08/2026): "tem muito que é só o sexo. Será que
//  conseguimos usar IA para ver pelo nome se é feminino ou masculino?"
//
//  ⚠️⚠️ A LEI do projeto (10/08) continua valendo: **NUNCA inferir sexo por NOME
//  e gravar como se fosse declarado.** O sexo é REGRA DE NEGÓCIO nos grupos — a
//  trava de categoria (Homens/Mulheres) recusa inscrição quando não bate — então
//  um palpite errado impede alguém de entrar no grupo certo, ou o admite no
//  errado, e ninguém sabe quais. Errar isso também constrange uma pessoa real.
//
//  Por isso este arquivo separa DUAS coisas que não podem se confundir:
//
//    1. DECLARAÇÃO — a pessoa preencheu o sexo em alguma porta (voluntariado,
//       Next, batismo, cadastro pendente). Isso é dado dela: propaga direto,
//       só-onde-vazio, sem ninguém revisar. É a mesma política que já vale pra
//       telefone e e-mail.
//    2. PALPITE — inferência por nome. NUNCA grava sozinho: vira SUGESTÃO que
//       uma pessoa confirma, e é a confirmação humana que a legitima.
//
//  Este módulo é PURO (sem Supabase, sem rede, sem relógio) pra entrar no gate
//  de deploy. Quem lê o banco e chama a IA é `services/sexoCompletar.js`.
// ════════════════════════════════════════════════════════════════════════════

// Vocabulário canônico do Contrato de Inscrição em todas as 7 portas.
// ⚠️ NUNCA "outro" — decisão registrada desde 28/07.
const CANONICO = ['masculino', 'feminino'];

/**
 * Traduz qualquer vocabulário de sexo do sistema pro canônico.
 *
 * ⚠️ As tabelas NÃO falam a mesma língua (medido em 11/08): `mem_membros.genero`,
 * `vol_inscricoes.sexo` e `next_matriculas.sexo` são canônicos; `kids_criancas`
 * e `batismo_inscricoes` usam M/F. Ler um com a régua do outro devolve null e o
 * dado é descartado em silêncio — foi assim que a derivação de pai/mãe da
 * apresentação ficou morta.
 *
 * @returns {'masculino'|'feminino'|null}
 */
function normalizarSexo(v) {
  const s = String(v ?? '').trim().toLowerCase();
  if (!s) return null;
  if (s === 'm' || s === 'masculino') return 'masculino';
  if (s === 'f' || s === 'feminino') return 'feminino';
  return null; // "outro", lixo, vazio — não inventa
}

/**
 * Consolida o que as portas declararam sobre UMA pessoa.
 *
 * ⚠️⚠️ DIVERGÊNCIA ENTRE PORTAS NÃO É DESEMPATE — é conflito, e conflito não se
 * resolve por ordem de preferência nem por "a mais recente vence". Se o
 * voluntariado diz masculino e o batismo diz feminino, uma das duas está errada
 * (ou são pessoas diferentes fundidas por engano), e gravar qualquer uma das
 * duas é gravar um erro com cara de dado. Devolve `conflito` pra decisão humana.
 *
 * @param {Array<{fonte:string, sexo:*}>} declaracoes
 * @returns {{sexo:string|null, fontes:string[], conflito:boolean}}
 */
function consolidarDeclaracoes(declaracoes) {
  const vistos = new Map(); // sexo canônico → fontes que o declararam
  for (const d of declaracoes || []) {
    const s = normalizarSexo(d?.sexo);
    if (!s) continue;
    if (!vistos.has(s)) vistos.set(s, []);
    vistos.get(s).push(String(d.fonte || '?'));
  }
  if (vistos.size === 0) return { sexo: null, fontes: [], conflito: false };
  if (vistos.size > 1) {
    return {
      sexo: null,
      fontes: [...vistos.entries()].map(([s, fs]) => `${s}:${fs.join('/')}`),
      conflito: true,
    };
  }
  const [sexo, fontes] = [...vistos.entries()][0];
  return { sexo, fontes, conflito: false };
}

/**
 * O primeiro nome, que é o único pedaço que a IA precisa ver.
 *
 * ⚠️ Manda-se SÓ o primeiro nome ao modelo de propósito: sobrenome não ajuda a
 * decidir sexo e mandar o nome completo de 3.500 pessoas para fora é expor mais
 * dado do que a tarefa exige (LGPD · minimização).
 */
function primeiroNomeParaPalpite(nome) {
  const limpo = String(nome ?? '').trim().replace(/\s+/g, ' ');
  if (!limpo) return null;
  const t = limpo.split(' ')[0];
  // Token de 1 letra é inicial ("R. Silva"), não nome — não dá pra palpitar.
  if (t.replace(/\./g, '').length < 2) return null;
  return t;
}

/**
 * Filtra o que o modelo devolveu. Só sobrevive palpite USÁVEL.
 *
 * ⚠️ `confianca` tem que vir 'alta'. Nome unissex (Alex, Ariel, Darci, Jean,
 * Yuri, Nicola, Lindomar) DEVE voltar como ambíguo, e ambíguo não vira
 * sugestão — some da lista e a pessoa declara quando preencher o censo.
 * Aceitar 'media' aqui é transformar a fila de revisão numa fila de erros
 * plausíveis, que é o pior tipo: parecem certos e ninguém confere.
 */
function palpitesUsaveis(saidaDoModelo) {
  const out = [];
  for (const p of Array.isArray(saidaDoModelo) ? saidaDoModelo : []) {
    const sexo = normalizarSexo(p?.sexo);
    const nome = String(p?.nome ?? '').trim();
    if (!sexo || !nome) continue;
    if (String(p?.confianca ?? '').trim().toLowerCase() !== 'alta') continue;
    out.push({ nome, sexo });
  }
  return out;
}

/**
 * Casa os palpites (por primeiro nome) com as pessoas da lista.
 *
 * ⚠️ Comparação por primeiro nome NORMALIZADO (sem acento, minúsculo): o modelo
 * pode devolver "José" para um "JOSE" da base, e comparação crua perderia o
 * palpite em silêncio — o defeito ficaria invisível, parecendo que a IA não
 * respondeu.
 */
function casarPalpites(pessoas, palpites) {
  const chave = (s) => String(s ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .trim().toLowerCase();

  const mapa = new Map();
  for (const p of palpites || []) mapa.set(chave(p.nome), p.sexo);

  const out = [];
  for (const pessoa of pessoas || []) {
    const pn = primeiroNomeParaPalpite(pessoa?.nome);
    if (!pn) continue;
    const sexo = mapa.get(chave(pn));
    if (!sexo) continue;
    out.push({ membro_id: pessoa.membro_id ?? pessoa.id, nome: pessoa.nome, primeiro_nome: pn, sexo });
  }
  return out;
}

module.exports = {
  CANONICO,
  normalizarSexo,
  consolidarDeclaracoes,
  primeiroNomeParaPalpite,
  palpitesUsaveis,
  casarPalpites,
};
