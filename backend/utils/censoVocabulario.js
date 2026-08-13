// ════════════════════════════════════════════════════════════════════════════
//  CENSO · tradução entre o vocabulário do BANCO e o das OPÇÕES do questionário
//
//  O PROBLEMA (achado em 07/08, com o Matheus respondendo o censo): o cadastro
//  guarda `estado_civil` como slug minúsculo — 'casado', 'solteiro',
//  'uniao_estavel', 'divorciado', 'viuvo' — e as opções do questionário são
//  escritas para gente ler: 'Casado(a)', 'Solteiro(a)', 'União estável'.
//
//  Isso quebrava as DUAS pontas, e a segunda em silêncio:
//   · IDA (banco → formulário): o pré-preenchimento devolvia 'casado', que não
//     casa com nenhuma opção. Nada aparecia marcado e a pessoa tinha que
//     escolher de novo — parecendo que o "buscar meu cadastro" não funcionou.
//   · VOLTA (formulário → banco): a reconciliação gravaria 'Casado(a)' numa
//     coluna que só tem slugs, criando um SEGUNDO vocabulário no cadastro. Esse
//     é o lado perigoso: ninguém vê acontecer, e depois todo filtro por estado
//     civil passa a mentir.
//
//  Estratégia deliberadamente assimétrica:
//   · IDA usa um normalizador GENÉRICO (sem lista fixa), então funciona para
//     qualquer enum que o cadastro tenha hoje ou venha a ter.
//   · VOLTA usa mapa EXPLÍCITO. Escrever no cadastro exige saber exatamente o
//     vocabulário de destino; adivinhar na escrita é como se cria bagunça.
//     Campo sem mapa não é escrito — melhor não gravar que gravar errado.
// ════════════════════════════════════════════════════════════════════════════

/**
 * Reduz um rótulo à sua essência comparável: sem acento, sem pontuação, sem o
 * sufixo de gênero "(a)"/"(o)", sem separador. 'União estável' e 'uniao_estavel'
 * caem no mesmo 'uniaoestavel'; 'Casado(a)' e 'casado' caem em 'casado'.
 */
function chave(v) {
  return String(v ?? '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\([ao]s?\)/g, '')       // "Casado(a)" -> "casado"
    .replace(/[^a-z0-9]/g, '');
}

/**
 * IDA · acha, entre as opções da pergunta, a que corresponde ao valor do banco.
 * Devolve o RÓTULO exato da opção (que é o que o formulário precisa para marcar
 * o botão), ou null se nenhuma corresponder — e null é resposta honesta: melhor
 * a pessoa escolher do que a gente marcar a opção errada por ela.
 */
function casarComOpcao(valorDoBanco, opcoes) {
  const alvo = chave(valorDoBanco);
  if (!alvo || !Array.isArray(opcoes)) return null;
  return opcoes.find((o) => chave(o) === alvo) || null;
}

// VOLTA · vocabulário de destino de cada campo do cadastro, por chave
// normalizada. Só o que o censo realmente escreve e que é enum no banco.
const PARA_BANCO = {
  estado_civil: {
    solteiro: 'solteiro',
    casado: 'casado',
    uniaoestavel: 'uniao_estavel',
    divorciado: 'divorciado',
    viuvo: 'viuvo',
    separado: 'divorciado',        // vocabulário informal que aparece em form
    amasiado: 'uniao_estavel',
  },
};

/** Campos que o censo pode escrever no cadastro sem tradução (texto livre). */
const TEXTO_LIVRE = new Set([
  'telefone', 'email', 'data_nascimento', 'cidade', 'bairro', 'cep',
  'endereco', 'profissao',
]);

/**
 * VOLTA · converte o valor escolhido no formulário para o vocabulário do banco.
 * Devolve `undefined` quando não sabe traduzir — e aí o chamador NÃO grava o
 * campo. Um estado civil não preenchido é um problema pequeno; a coluna com dois
 * vocabulários é um problema que contamina relatório.
 */
function paraBanco(campo, valorDoFormulario) {
  if (valorDoFormulario === null || valorDoFormulario === undefined) return undefined;
  if (TEXTO_LIVRE.has(campo)) {
    const v = String(valorDoFormulario).trim();
    return v === '' ? undefined : v;
  }
  const mapa = PARA_BANCO[campo];
  if (!mapa) return undefined;                  // enum desconhecido: não grava
  return mapa[chave(valorDoFormulario)];        // sem correspondência: undefined
}

/**
 * Traduz um lote inteiro do formulário para o banco, descartando o que não sabe
 * traduzir. É o que a reconciliação recebe.
 */
function loteParaBanco(dados = {}) {
  const out = {};
  for (const [campo, valor] of Object.entries(dados)) {
    const traduzido = paraBanco(campo, valor);
    if (traduzido !== undefined) out[campo] = traduzido;
  }
  return out;
}

module.exports = { chave, casarComOpcao, paraBanco, loteParaBanco, PARA_BANCO, TEXTO_LIVRE };
