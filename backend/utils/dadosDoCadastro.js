// ============================================================================
// CARREGAR O QUE O CADASTRO JÁ TEM · o contrato sem perguntar de novo
//                                                        (11/08/2026)
//
// Pedido do Marcos, depois da auditoria das 7 portas: *"caso alguém tenha baixado
// e não tenha esses campos, já colocamos a tela de preencher; quando elas
// voltarem terão, e aí vamos passar isso."*
//
// ⚠️⚠️ POR QUE PREENCHER E NÃO EXIGIR. Medido em 11/08: as inscrições feitas pelo
// APP nascem sem CPF, nascimento e sexo — **e o cadastro da pessoa já tem os três
// em 10 dos 12 casos**. Ou seja: o dado existe, o app só não o carregava. Exigir
// na porta reprovaria **74 das 104 contas** (as que ainda não passaram pelo portão
// de identidade de 05/08) e derrubaria inclusive o SOS. Carregar não reprova
// ninguém e conserta o que dá pra consertar hoje; o resto entra sozinho conforme
// as pessoas passam pelo portão.
//
// ⚠️ SÓ PREENCHE CAMPO VAZIO. Nunca sobrescreve o que veio no formulário: a
// política de "só-onde-vazio" é a mesma do censo e do CPF tardio, e existe porque
// sobrescrever dado que a pessoa digitou (ou que a equipe corrigiu) com um valor
// de outra origem é como se perde correção humana em silêncio.
// ============================================================================

const vazio = (v) => v === null || v === undefined || String(v).trim() === '';

/**
 * Traduz sexo entre os dois vocabulários do sistema.
 *
 * ⚠️⚠️ **`mem_membros.genero` guarda `masculino`/`feminino`, NÃO `M`/`F`** —
 * medido em 11/08 na base inteira: **4.045 vivos · 579 com sexo · ZERO com `M`
 * ou `F`**, e as 14 origens que preenchem (app, wifi, voluntariado, grupos,
 * membresia, PCO, Next…) usam todas o canônico. Vários comentários deste repo
 * afirmam o contrário; a base é que manda.
 *
 * ⚠️ Isso não é purismo: `if (genero === 'M')` **nunca é verdade** em produção.
 * Era assim que a derivação de pai/mãe da apresentação estava morta — o campo
 * saía sempre nulo, e o balcão receberia a criança sem o nome de nenhum dos dois.
 *
 * O vocabulário CURTO existe de verdade, mas noutras tabelas: `kids_criancas.sexo`
 * é `M`/`F` (867 M · 1.058 F) e `batismo_inscricoes.sexo` também. Já
 * `vol_inscricoes.sexo` e `next_matriculas.sexo` são canônicos, como o Contrato de
 * Inscrição manda. Por isso a tradução é EXPLÍCITA por destino: copiar cru de uma
 * pra outra grava valor que nenhum filtro encontra depois.
 *
 * Aceita as duas formas na ENTRADA de propósito — quem chama não deveria precisar
 * saber de qual tabela o valor veio.
 */
function sexoPara(destino, valor) {
  const v = String(valor ?? '').trim().toLowerCase();
  const canonico = (v === 'm' || v === 'masculino') ? 'masculino'
    : (v === 'f' || v === 'feminino') ? 'feminino'
      : null;
  if (!canonico) return null;
  return destino === 'curto' ? (canonico === 'masculino' ? 'M' : 'F') : canonico;
}

/**
 * Monta o patch de campos do contrato a partir do cadastro.
 *
 * @param linha   o registro da inscrição como está hoje
 * @param membro  `mem_membros` da pessoa (cpf, data_nascimento, genero, email, telefone)
 * @param mapa    de campo do contrato → nome da coluna na tabela de destino.
 *                Campo ausente do mapa **não é tocado** — é assim que uma tabela
 *                sem coluna de sexo (o caso de `next_inscricoes`) simplesmente
 *                não recebe sexo, em vez de estourar 42703 e derrubar o UPDATE
 *                inteiro (a armadilha do `parcelas_max`).
 * @param opcoes  `{ sexo: 'canonico' | 'curto' }`
 */
function patchDoCadastro(linha, membro, mapa, { sexo = 'canonico' } = {}) {
  if (!linha || !membro || !mapa) return {};
  const patch = {};

  const por = {
    cpf: () => String(membro.cpf ?? '').replace(/\D/g, '') || null,
    data_nascimento: () => membro.data_nascimento || null,
    sexo: () => sexoPara(sexo, membro.genero),
    email: () => (membro.email ? String(membro.email).toLowerCase().trim() : null),
    telefone: () => String(membro.telefone ?? '').replace(/\D/g, '') || null,
  };

  for (const [campo, coluna] of Object.entries(mapa)) {
    if (!coluna || !por[campo]) continue;
    // ⚠️ A coluna precisa EXISTIR na linha lida. Se `linha` não a trouxe, não dá
    // pra saber se está vazia — e mandar coluna inexistente faz o PostgREST
    // recusar o UPDATE inteiro, ou seja: perderíamos também o que dava pra gravar.
    if (!(coluna in linha)) continue;
    if (!vazio(linha[coluna])) continue;   // já tem: não toca
    const valor = por[campo]();
    if (!vazio(valor)) patch[coluna] = valor;
  }
  return patch;
}

/** Faltou alguma coisa do contrato nesta linha? (pra log/telemetria, não pra travar) */
function faltaDoContrato(linha, mapa) {
  if (!linha || !mapa) return [];
  return Object.entries(mapa)
    .filter(([, col]) => col && col in linha && vazio(linha[col]))
    .map(([campo]) => campo);
}

module.exports = { patchDoCadastro, faltaDoContrato, sexoPara };
