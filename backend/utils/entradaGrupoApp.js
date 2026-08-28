/**
 * QUEM PODE PEDIR PRA ENTRAR NUM GRUPO — régua PURA (10/08/2026).
 * Sem banco, sem rede, sem relógio → entra no gate de deploy.
 *
 * ⚠️⚠️ O QUE ISTO CONSERTA: `POST /api/app/inscricoes` **não validava NADA**.
 * Não lia categoria/gênero, nem `ativo`, nem `aceitando_inscricoes`, nem
 * `modo_inscricao='fechado'`, nem temporada. **Cinco buracos no mesmo lugar.**
 * O app não "escapava" da trava do site — ele nunca chegava lá: o site trava em
 * `routes/publicGrupos.js` (o formulário público), e o app tem porta própria.
 *
 * Achado pelo Marcos testando no aparelho: *"eu sou homem e consigo ver os
 * grupos apenas para mulheres e posso tentar me inscrever, e isso não é
 * possível no nosso webapp."*
 *
 * ⚠️⚠️ ESTA RÉGUA É A MESMA DO SITE, DE PROPÓSITO. Ela foi extraída de
 * `publicGrupos.js:940-1000` pra existir num lugar só. Duas cópias divergindo é
 * a doença recorrente deste sistema (já custou: o app lia `app_grupos_temporada`
 * enquanto o site lia `mem_temporadas`, e o app dizia "fechada" com a temporada
 * aberta). **Mudou aqui, o site usa daqui.**
 *
 * ⚠️ LEI DE 14/07/2026 (Marcos): **SÓ GÊNERO bloqueia.** Idade fora da faixa,
 * pessoa em vários grupos ao mesmo tempo e grupos no mesmo horário **NÃO**
 * impedem a inscrição — quem decide isso é o líder na aprovação. Não
 * acrescente trava nova aqui sem decisão dele.
 */

/** Categorias que restringem por sexo. Nada além disto trava. */
const CATEGORIAS_POR_SEXO = { mulheres: 'feminino', homens: 'masculino' };

/** Normaliza o sexo pro vocabulário do banco, ou `null` se não der pra saber. */
function sexoNormalizado(valor) {
  const s = String(valor ?? '').trim().toLowerCase();
  if (s === 'masculino' || s === 'm') return 'masculino';
  if (s === 'feminino' || s === 'f') return 'feminino';
  return null;
}

/**
 * A pessoa pode PEDIR pra entrar neste grupo?
 *
 * @param grupo  linha de `mem_grupos` (id, categoria, ativo,
 *               aceitando_inscricoes, modo_inscricao, temporada, deleted_at)
 * @param genero sexo da pessoa — do corpo do pedido OU de `mem_membros.genero`
 * @param temporadaAberta  `true`/`false` quando a temporada foi consultada,
 *               `null` quando não havia temporada a consultar
 *
 * @returns `{ ok: true }` ou `{ ok:false, status, codigo, erro }`
 */
function avaliarEntradaNoGrupo({ grupo, genero, temporadaAberta } = {}) {
  if (!grupo || grupo.deleted_at) {
    return { ok: false, status: 404, codigo: 'grupo_nao_encontrado', erro: 'Grupo não encontrado.' };
  }

  // ⚠️ `ativo === false` é o interruptor de operação do grupo (o "DELETE" do
  // web é justamente `ativo=false`). Grupo pausado aparece no catálogo pra
  // quem já é membro, mas não recebe pedido novo.
  if (grupo.ativo === false) {
    return {
      ok: false, status: 403, codigo: 'inscricoes_fechadas',
      erro: 'Este grupo não está recebendo novas inscrições no momento.',
    };
  }

  // ⚠️⚠️ 'fechado' NÃO barra mais (Marcos · 11/08/2026 — ver o cabeçalho do
  // mesmo trecho em `routes/publicGrupos.js`). O grupo continua invisível em
  // toda lista pública; quem tem o link foi convidado pelo líder, e a inscrição
  // ainda vira PEDIDO que ele aprova. Bloquear aqui deixava o líder sem nenhuma
  // forma de convidar — que é o oposto do que 'por convite do líder' promete.

  if (grupo.aceitando_inscricoes === false) {
    return {
      ok: false, status: 403, codigo: 'inscricoes_fechadas',
      erro: 'Este grupo não está recebendo novas inscrições no momento.',
    };
  }

  // ⚠️ `sempre_aberto` recebe o ano todo, MESMO com a temporada fechada — é o
  // que permite grupo de porta aberta fora do ciclo. Quem consulta a temporada
  // é o chamador; aqui só se decide com o resultado.
  if (grupo.temporada && String(grupo.modo_inscricao || '') !== 'sempre_aberto' && temporadaAberta !== true) {
    return {
      ok: false, status: 403, codigo: 'inscricoes_fechadas',
      erro: 'As inscrições para esta temporada estão fechadas no momento. Aguarde a próxima abertura.',
    };
  }

  const exigido = CATEGORIAS_POR_SEXO[String(grupo.categoria || '').trim().toLowerCase()];
  if (exigido) {
    const meu = sexoNormalizado(genero);
    // ⚠️⚠️ UMA REGRA SÓ: o sexo TEM que bater. Desconhecido não bate.
    //
    // Eu tinha feito diferente — um caminho especial (`sexo_necessario`) que
    // deixava passar quem não tinha o dado, porque só 16 das 54 contas do app
    // tinham `genero`. O Marcos derrubou isso em 10/08, e com razão:
    // *"parece que estamos criando algo que é pra resolver 40 pessoas, mas que
    // vai quebrar quando abrir pra igreja; prefiro que tenham pedidos errados e
    // recusados dessas pessoas do que do restante todo da igreja."*
    //
    // ⚠️ E o que fecha o argumento: **o portão de identidade JÁ EXIGE o sexo.**
    // `GET /app/identidade/status` põe `'sexo'` em `falta`, e `bloqueiam` só o
    // dispensa nas contas de revisão da Apple (`contaDeRevisaoLoja`). Ou seja,
    // quem consegue chegar na tela de grupo já passou pelo portão e TEM o dado.
    // As contas sem `genero` são de antes do portão ligar e serão cobradas na
    // próxima abertura. Não havia buraco a acomodar — só máquina a mais.
    //
    // A mensagem distingue os dois casos (não bate × não sabemos) porque isso é
    // ser honesto com a pessoa, não um segundo caminho de decisão.
    if (meu !== exigido) {
      return {
        ok: false, status: 422, codigo: 'grupo_incompativel',
        erro: !meu
          ? 'Complete seu cadastro no app (inclusive o sexo) para se inscrever neste grupo.'
          : exigido === 'feminino'
            ? 'Este é um grupo só de mulheres, então sua inscrição não pode seguir nele.'
            : 'Este é um grupo só de homens, então sua inscrição não pode seguir nele.',
      };
    }
  }

  return { ok: true };
}

module.exports = { CATEGORIAS_POR_SEXO, sexoNormalizado, avaliarEntradaNoGrupo };
