// ============================================================================
// APRESENTAÇÃO DE CRIANÇA PELO APP · a régua (11/08/2026)
//
// Pedido do Marcos: *"Apresentação de Bebês está fora do app, quero que tudo seja
// dentro do app. Quando a pessoa marcar que quer apresentar bebê, já que já temos
// os dados dela dentro do app, tem que perguntar se o filho é dela; se sim,
// indicar o vínculo, completar os dados se a criança não existir como família já.
// Se for outra pessoa, ela tem que preencher os dados completos dos responsáveis
// e criança, tudo dentro do app e não em link externo."*
//
// E a regra de identidade, dele: *"quando cadastrar uma criança deve gerar pessoa
// no sistema que aparece em minha família, com as regras de criança, SEM CPF,
// identificamos pelo pai."*
//
// ⚠️ POR QUE ISTO NÃO É "MAIS UM FORMULÁRIO": a porta que existia era um LINK
// MORTO. `inscricoes.tsx` abria `cbrio.org/apresentacao-criancas`, rota que **não
// existe no ERP** (0 referências em `src/`) e devolve HTTP 200 só pelo catch-all
// do SPA da Vercel. `apresentacao_bebes` tem **0 linhas** — ninguém nunca
// conseguiu se inscrever, por porta nenhuma.
//
// ⚠️⚠️ O QUE ESTA PORTA **NÃO** FAZ: não cria `kids_responsaveis` e não liga
// `autorizado_buscar`. Autorização de RETIRADA de criança no totem é decisão de
// proteção de criança que o Marcos arquivou em 11/08 pra conversar com a Mari.
// Vínculo de FAMÍLIA (o que ele pediu aqui) e ficha do Kids são outra coisa —
// nenhuma das duas autoriza ninguém a buscar criança nenhuma.
// ============================================================================

// ⚠️ `cpfValido` faz o DV oficial da Receita e recusa sequência repetida. Vive em
// `utils/` (não carrega o Supabase), então entra no gate junto com esta régua.
const { cpfValido, soDigitos } = require('./cpf');
// ⚠️ As 3 perguntas de saúde são as MESMAS do formulário público
// (`utils/saudeCrianca`). Duas listas de perguntas fariam a criança entrar
// com dado diferente conforme a porta — que é exatamente o que o Marcos
// mandou consertar.
const { normalizarSaude } = require('./saudeCrianca');
// ⚠️⚠️ `mem_membros.genero` guarda **masculino/feminino**, nunca M/F (medido em
// 11/08: 579 pessoas com sexo, ZERO com valor curto). Comparar com 'M' aqui era
// condição sempre FALSA — e é ela que decide se quem preencheu entra como pai ou
// como mãe no snapshot que o balcão lê no domingo. `sexoPara` traduz.
const { sexoPara } = require('./dadosDoCadastro');

/** ⚠️ CPF nunca entra aqui PRA A CRIANÇA — ela é identificada pelo responsável. */
const CAMPOS_PROIBIDOS_CRIANCA = ['cpf', 'cnpj'];

/**
 * O 2º domingo do mês — a data em que a igreja apresenta as crianças.
 *
 * ⚠️ Espelha `_proximoSegundoDomingo` de `routes/membresia.js` (o totem), de
 * propósito: se as duas discordassem, o app marcaria a família para um domingo e
 * o balcão esperaria noutro. Aritmética em hora LOCAL — `toISOString()` aqui
 * devolveria o dia anterior em fuso negativo (a armadilha da faixa etária).
 */
function segundoDomingo(ano, mes0) {
  const primeiro = new Date(ano, mes0, 1);
  const dow = primeiro.getDay();
  const primeiroDomingo = dow === 0 ? 1 : 8 - dow;
  return new Date(ano, mes0, primeiroDomingo + 7);
}

function proximoSegundoDomingo(hoje = new Date()) {
  const ref = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  const candidato = segundoDomingo(ref.getFullYear(), ref.getMonth());
  if (candidato >= ref) return candidato;
  const mes = ref.getMonth() === 11 ? 0 : ref.getMonth() + 1;
  const ano = ref.getMonth() === 11 ? ref.getFullYear() + 1 : ref.getFullYear();
  return segundoDomingo(ano, mes);
}

function iso(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Chave de identidade da criança.
 *
 * ⚠️⚠️ É `nome normalizado + data de nascimento`, e o escopo é a FAMÍLIA — não a
 * pessoa que preencheu. Se fosse por quem preencheu, o pai e a mãe cadastrando o
 * MESMO filho criariam **duas pessoas** e a criança apareceria duplicada em
 * "Minha família" das duas contas. Não existe CPF pra desempatar (é o ponto da
 * regra do Marcos), então o nome+nascimento dentro da família É a chave.
 *
 * Normaliza acento e caixa porque "José" e "jose" são a mesma criança, e a
 * pessoa digita à mão nas duas vezes.
 */
function chaveCrianca(nome, dataNascimento) {
  const n = String(nome ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return `${n}|${String(dataNascimento ?? '').slice(0, 10)}`;
}

/**
 * A criança já existe nesta família?
 *
 * ⚠⚠ A CHAVE TEM TRÊS PARTES, e a terceira é o PAI/MÃE. Refinamento do Marcos
 * (11/08): *"a criança não tem match, mas o pai tem — não deve gerar duplicidade
 * os homônimos com data de nascimento igual, se tiverem pais diferentes; se os 3
 * forem iguais, aí sim passa pelo match."*
 *
 * Sem a 3ª parte, dois PRIMOS com o mesmo nome e a mesma data de nascimento numa
 * família estendida (avós, tios — há households com 9 pessoas) seriam fundidos
 * numa criança só, e um deles desapareceria da lista do domingo.
 *
 * ⚠️ `paisPorCrianca` é um Map id-da-criança → [ids de quem é pai/mãe dela].
 * Candidata **sem pai registrado** CASA: aí não sabemos que os pais são
 * diferentes, e estamos DENTRO da família — recusar criaria a duplicata que esta
 * função existe pra evitar (o caso real: criança que entrou por outra porta, como o
 * import do Kids, tem `familia_id` e não tem vínculo). Candidata com pai
 * registrado que **não está entre os nossos** é recusada — essa é a regra dele.
 */
function acharCriancaNaFamilia(pessoas, nome, dataNascimento, paisPorCrianca = null, paisEsperados = []) {
  const alvo = chaveCrianca(nome, dataNascimento);
  const nossos = new Set((paisEsperados || []).filter(Boolean));
  const candidatas = (pessoas || []).filter((p) => chaveCrianca(p.nome, p.data_nascimento) === alvo);

  for (const c of candidatas) {
    if (!paisPorCrianca || !nossos.size) return c;      // sem como comparar ⇒ família manda
    const pais = paisPorCrianca.get?.(c.id) ?? paisPorCrianca[c.id];
    if (!pais || !pais.length) return c;                // não sabemos ⇒ casa
    if (pais.some((id) => nossos.has(id))) return c;     // pai em comum ⇒ mesma criança
    // pais registrados e NENHUM é nosso ⇒ outra criança (homônima). Segue olhando.
  }
  return null;
}

/**
 * Valida o pedido. Devolve `{ ok, erro?, dados? }`.
 *
 * ⚠️ Os DOIS caminhos aceitam. A diferença NÃO é de rigor, é de quem age:
 *   · `propria: true`  → quem está logado é o responsável. O servidor já sabe
 *     quem é (nome, telefone), então **não pedimos de novo** — foi exatamente o
 *     que o Marcos pediu ("já que já temos os dados dela").
 *   · `propria: false` → é filho de outra pessoa. Aí os dados dos responsáveis
 *     são obrigatórios, porque ninguém no sistema respondeu por eles ainda.
 */
function validarPedido(body, membro) {
  const propria = body?.propria === true;
  const c = body?.crianca || {};
  const nome = String(c.nome ?? '').trim();
  if (nome.length < 2) return { ok: false, erro: 'Informe o nome da criança' };

  const nasc = String(c.data_nascimento ?? '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(nasc)) return { ok: false, erro: 'Informe a data de nascimento da criança' };
  // ⚠️ Data de nascimento de criança NÃO pode ser futura, e a régua vive aqui e
  // não no cliente: `new Date('2026-13-45')` não estoura, vira Invalid Date.
  const d = new Date(`${nasc}T12:00:00`);
  if (Number.isNaN(d.getTime())) return { ok: false, erro: 'Data de nascimento inválida' };
  if (iso(d) !== nasc) return { ok: false, erro: 'Data de nascimento inválida' };
  if (d > new Date()) return { ok: false, erro: 'A data de nascimento não pode ser no futuro' };

  for (const campo of CAMPOS_PROIBIDOS_CRIANCA) {
    if (c[campo]) return { ok: false, erro: 'Não pedimos documento da criança' };
  }

  // A tela do app manda M/F; guardamos no formato CURTO porque o destino imediato
  // é `kids_criancas.sexo` (M/F). Quem precisa do canônico converte na hora.
  const sexo = sexoPara('curto', c.sexo);

  if (propria) {
    if (!membro?.id) return { ok: false, erro: 'Complete seu cadastro antes de apresentar uma criança' };
    // ⚠️ O responsável ADICIONAL só existe neste caminho. Quem pede pra criança
    // de OUTRA pessoa não pode montar a família de terceiros — foi a linha que o
    // Marcos concordou em manter ("se não for a mãe ou pai, melhor não gerar
    // família, mais seguro").
    const ex = validarResponsavelExtra(body?.responsavel_extra);
    if (!ex.ok) return { ok: false, erro: ex.erro };
    return {
      ok: true,
      dados: {
        propria: true,
        crianca: { nome, data_nascimento: nasc, sexo, saude: normalizarSaude(c) },
        responsavel: {
          membro_id: membro.id,
          nome: membro.nome || null,
          telefone: membro.telefone || null,
          sexo: sexoPara('curto', membro.genero),
        },
        responsavel_extra: ex.dados,
        observacoes: obs(body?.observacoes),
      },
    };
  }

  const r = body?.responsavel || {};
  const rNome = String(r.nome ?? '').trim();
  if (rNome.length < 2) return { ok: false, erro: 'Informe o nome do responsável' };
  const tel = String(r.telefone ?? '').replace(/\D/g, '');
  if (tel.length < 10 || tel.length > 11) return { ok: false, erro: 'Informe um telefone válido do responsável' };

  return {
    ok: true,
    dados: {
      propria: false,
      crianca: { nome, data_nascimento: nasc, sexo, saude: normalizarSaude(c) },
      responsavel: {
        membro_id: null,
        nome: rNome,
        telefone: tel,
        email: r.email ? String(r.email).toLowerCase().trim() : null,
        nome_pai: r.nome_pai ? String(r.nome_pai).trim() : null,
        nome_mae: r.nome_mae ? String(r.nome_mae).trim() : null,
      },
      observacoes: obs(body?.observacoes),
    },
  };
}

/**
 * O responsável ADICIONAL (o outro pai/mãe), pedido pelo Marcos em 11/08:
 * *"preciso que esse formulário tenha a opção de adicionar responsável, e aí já
 * vamos criar essa família no sistema e se esse pai baixar o app já aparece lá
 * pra ele a sua família alinhada, **tem que ter CPF**."*
 *
 * ⚠️⚠️ Aqui o CPF é **OBRIGATÓRIO**, o oposto da criança — e não é incoerência:
 * é ADULTO, e adulto entra no sistema pelo Contrato de porta, onde o CPF é a
 * chave mais forte do matcher. É justamente ele que faz "se esse pai baixar o
 * app" reencontrar o cadastro em vez de criar um segundo.
 *
 * ⚠️ DV conferido no SERVIDOR: CPF sem DV vira identidade errada na base, e é a
 * chave que o matcher usa com mais confiança — errar aqui contamina tudo.
 */
function validarResponsavelExtra(v) {
  if (!v) return { ok: true, dados: null };          // é opcional
  const nome = String(v.nome ?? '').trim();
  const cpf = soDigitos(v.cpf);
  if (!nome && !cpf) return { ok: true, dados: null }; // bloco em branco = não quis
  if (nome.length < 2) return { ok: false, erro: 'Informe o nome do outro responsável' };
  if (!nome.includes(' ')) return { ok: false, erro: 'Informe o nome COMPLETO do outro responsável' };
  if (!cpf) return { ok: false, erro: 'O CPF do outro responsável é obrigatório' };
  if (!cpfValido(cpf)) return { ok: false, erro: 'O CPF do outro responsável não é válido' };

  const tel = soDigitos(v.telefone);
  return {
    ok: true,
    dados: {
      nome,
      cpf,
      // ⚠️ Telefone só entra se for alcançável: 9 dígitos sem DDD (o caso real do
      // saneamento de 31/07) é pior que campo vazio — a equipe liga e não completa.
      telefone: tel.length >= 10 && tel.length <= 11 ? tel : null,
      sexo: sexoPara('curto', v.sexo),
    },
  };
}

/**
 * Quem vai em `nome_pai` e quem vai em `nome_mae` na linha do pedido.
 *
 * ⚠️ Deriva do SEXO e, sem sexo, deixa NULO em vez de chutar. Marcos: *"se for
 * uma mulher preenchendo e coloque como filho, ela entra como mãe"* — o sistema
 * não tem tipo `mae`/`pai` em `mem_vinculos_familiares` (o CHECK é `pai_mae`), e
 * inventar valor de enum quebraria o insert. Então o parentesco é `pai_mae` pros
 * dois e estes dois campos de TEXTO é que carregam quem é quem, pro balcão.
 */
function nomesDosPais(principal, extra) {
  const slot = { nome_pai: null, nome_mae: null };
  for (const p of [principal, extra]) {
    if (!p?.nome) continue;
    if (p.sexo === 'M' && !slot.nome_pai) slot.nome_pai = p.nome;
    else if (p.sexo === 'F' && !slot.nome_mae) slot.nome_mae = p.nome;
  }
  return slot;
}

function obs(v) {
  const s = String(v ?? '').trim();
  return s ? s.slice(0, 1000) : null;
}

/**
 * O que a criança vira em `mem_membros`.
 *
 * ⚠️⚠️ `status: 'visitante'` e NÃO `membro_ativo`. A base de membresia (1.826
 * `membro_ativo`) alimenta o NSM e os KPIs da igreja — criança apresentada não é
 * membro, e entrar como `membro_ativo` inflaria o numerador de todo indicador de
 * membresia por um ato que é dos pais. Já existem **53 crianças ≤12 anos** em
 * `mem_membros` hoje (27 `membro_ativo`, 26 `visitante`), então a porta não é
 * inédita — o que é novo é ela ser consistente.
 *
 * ⚠️ `origem_cadastro` marcado: sem isso, um dia alguém olha 4.000 pessoas e não
 * sabe quais entraram por qual porta — foi assim que os 21 cadastros do gatilho
 * de `auth.users` viraram trabalho de arqueologia.
 *
 * ⚠️ **`cpf` nunca é setado** (nem como string vazia): CPF é a chave MAIS FORTE
 * do matcher canônico, e um valor placeholder ligaria a criança a quem tivesse
 * aquele número.
 */
function pessoaDaCrianca(crianca, igrejaId = null) {
  return {
    nome: crianca.nome,
    data_nascimento: crianca.data_nascimento,
    // ⚠️ CANÔNICO aqui. `mem_membros.genero` é masculino/feminino em 100% das 579
    // linhas preenchidas — gravar 'M' criaria a única pessoa da base num
    // vocabulário que nenhum filtro do sistema procura (a régua de gênero dos
    // grupos, entre outros).
    genero: sexoPara('canonico', crianca.sexo),
    status: 'visitante',
    active: true,
    origem_cadastro: 'apresentacao_crianca_app',
    ...(igrejaId ? { igreja_id: igrejaId } : {}),
  };
}

module.exports = {
  validarResponsavelExtra,
  nomesDosPais,
  proximoSegundoDomingo,
  iso,
  chaveCrianca,
  acharCriancaNaFamilia,
  validarPedido,
  pessoaDaCrianca,
  CAMPOS_PROIBIDOS_CRIANCA,
};
