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
// ⚠️⚠️ O QUE ESTA PORTA **NÃO** FAZ: não cria `kids_criancas`, não cria
// `kids_responsaveis` e não liga `autorizado_buscar`. Autorização de RETIRADA de
// criança no totem é decisão de proteção de criança que o Marcos arquivou em
// 11/08 pra conversar com a Mari. Vínculo de FAMÍLIA (o que ele pediu aqui) é
// outra coisa. Não juntar as duas.
// ============================================================================

/** ⚠️ CPF nunca entra aqui: a criança é identificada pelo responsável. */
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
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return `${n}|${String(dataNascimento ?? '').slice(0, 10)}`;
}

/** A criança já existe nesta família? Compara pela chave, não por id. */
function acharCriancaNaFamilia(pessoas, nome, dataNascimento) {
  const alvo = chaveCrianca(nome, dataNascimento);
  return (pessoas || []).find((p) => chaveCrianca(p.nome, p.data_nascimento) === alvo) || null;
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

  const sexo = c.sexo === 'M' || c.sexo === 'F' ? c.sexo : null;

  if (propria) {
    if (!membro?.id) return { ok: false, erro: 'Complete seu cadastro antes de apresentar uma criança' };
    return {
      ok: true,
      dados: {
        propria: true,
        crianca: { nome, data_nascimento: nasc, sexo },
        responsavel: { membro_id: membro.id, nome: membro.nome || null, telefone: membro.telefone || null },
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
      crianca: { nome, data_nascimento: nasc, sexo },
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
    genero: crianca.sexo || null,
    status: 'visitante',
    active: true,
    origem_cadastro: 'apresentacao_crianca_app',
    ...(igrejaId ? { igreja_id: igrejaId } : {}),
  };
}

module.exports = {
  proximoSegundoDomingo,
  iso,
  chaveCrianca,
  acharCriancaNaFamilia,
  validarPedido,
  pessoaDaCrianca,
  CAMPOS_PROIBIDOS_CRIANCA,
};
