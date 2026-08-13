// ============================================================================
// utils/telefoneVoluntario · "qual é o telefone DESTE voluntário?"
// ============================================================================
// Régua PURA (sem banco, sem rede, sem relógio) da CADEIA de resolução do
// telefone de um voluntário escalado. Mora em `utils/` pra entrar no gate de
// deploy; quem lê o banco é `services/agenteVoluntariado.js`.
//
// ⚠️ POR QUE ISTO EXISTE (medido em produção em 2026-08-13)
//
// O Agente de Voluntariado lia o telefone SÓ de `vol_profiles.phone` — a cópia
// local do módulo. Números da base viva naquele dia:
//
//   vol_profiles ........ 930 linhas · 8 com telefone (0,9%) · 24 com CPF
//                         922 de 930 com origem='planning_center'
//   mem_membros ......... 3.995 vivos · 3.587 com telefone (90%)
//   vol_inscricoes ...... 827 vivas · 775 com telefone (94%)
//
// O import do Planning Center **nunca trouxe telefone**. Resultado: das 87
// escalas pendentes de confirmação, **as 87** apareciam como "sem telefone" no
// painel — e 59 delas (68%) tinham telefone no sistema, em `mem_membros` ou no
// próprio formulário público de voluntariado que a pessoa preencheu.
//
// Isso é a LEI do Contrato de porta aplicada à LEITURA: uma pessoa = um
// cadastro (`mem_membros`) = fonte única que todos os módulos leem. Módulo não
// tem "base local de pessoas" — `vol_profiles` é linha-satélite e aponta pro
// membro por `membresia_id`. Ler contato da satélite e concluir "não tem" é
// confundir "não procurei no lugar certo" com "a pessoa não tem telefone".
//
// ⚠️ E o silêncio era o pior: "sem telefone" some da revisão porque PARECE um
// dado. Ninguém investiga um campo vazio.
// ============================================================================

const { telefoneAlcancavel, digitos } = require('../services/contatoPessoa');
// ⚠️ A régua de nome tem UM dono e ele é este. NÃO reimplementar aqui.
//
// E é `nomesPodemSerMesmaPessoa` (duplicidadePolicy), NÃO o
// `membroMatch.nomesMesmaPessoa` — a diferença decide 10 dos 16 casos:
// o Planning Center guarda o nome CURTO e o formulário tem o nome civil
// completo, então o Dice global de `nomesMesmaPessoa` desaba e recusa pares
// como "Eliane Santana" × "Eliane dos Santos Santana Sobrinho". A régua daqui
// exige o MESMO primeiro nome + ≥75% dos tokens do nome menor, que é
// exatamente o padrão "versão abreviada do mesmo nome".
//
// Medido nos 16 pares reais de produção (13/08/2026): esta aceita 13/13 e
// recusa as 6 contraprovas de parentesco ("Ana Souza Lima" × "João Souza Lima",
// "Maria Silva" × "João Maria Silva", …). Ambos os módulos são PUROS (zero
// require), então importar não arrasta banco pra dentro do gate.
const { nomesPodemSerMesmaPessoa } = require('../services/duplicidadePolicy');

// Ordem = confiança decrescente. A primeira fonte que produz um telefone
// alcançável vence; as demais nem são consultadas.
const ORIGENS = {
  PERFIL: 'perfil',
  MEMBRO: 'membro',
  CPF: 'cpf',
  INSCRICAO: 'inscricao',
  CONTATO: 'contato_secundario',
};

// Rótulo pra TELA. O painel declara de onde veio o número — sem isso, um
// telefone recuperado por caminho indireto fica indistinguível de um digitado
// pela própria pessoa, e a equipe não tem como julgar se confia nele.
const ROTULO_ORIGEM = {
  [ORIGENS.PERFIL]: 'cadastro do voluntariado',
  [ORIGENS.MEMBRO]: 'cadastro da pessoa',
  [ORIGENS.CPF]: 'cadastro da pessoa (CPF)',
  [ORIGENS.INSCRICAO]: 'formulário de voluntariado',
  [ORIGENS.CONTATO]: 'contato secundário',
};

const MOTIVO_DESCARTE = {
  NUMERO_ERRADO: 'numero_errado',     // formato que o nosso envio não alcança
  NOME_DIVERGENTE: 'nome_divergente', // veto de identidade
  SEM_DADO: 'sem_dado',
};

/**
 * ⚠️ VETO DE IDENTIDADE, e ele roda ANTES de aceitar qualquer evidência forte.
 *
 * `vol_profiles.membresia_id` NÃO é garantia de que é a mesma pessoa: o
 * backfill de 2026-06-10 ligou perfis órfãos a membros existentes "por
 * CPF/e-mail" — e **e-mail sozinho nunca identifica** (família compartilha
 * caixa). Então, quando os dois lados têm nome conhecido e os nomes são
 * INCOMPATÍVEIS, o telefone daquele cadastro é descartado.
 *
 * Só veta quando pode comparar: nome ausente de um dos lados não é divergência,
 * é ausência de sinal — e tratar ausência como conflito jogaria fora o caso
 * mais comum (perfil do Planning Center sem nome completo).
 */
function _nomeVeta(nomeVol, nomeOutro) {
  const a = String(nomeVol || '').trim();
  const b = String(nomeOutro || '').trim();
  if (!a || !b) return false;
  return !nomesPodemSerMesmaPessoa(a, b);
}

function _candidato(origem, telefone, membroId) {
  const t = String(telefone || '').trim();
  if (!t) return null;
  return { origem, telefone: t, membro_id: membroId || null };
}

/**
 * Resolve o telefone de um voluntário a partir das fontes JÁ CARREGADAS pelo
 * serviço. Puro: não consulta nada.
 *
 * @param {object} entrada
 * @param {string} entrada.nome            nome exibido do voluntário
 * @param {string} [entrada.perfilTelefone] vol_profiles.phone
 * @param {object} [entrada.membro]         { id, nome, telefone } · via vol_profiles.membresia_id
 * @param {object} [entrada.membroPorCpf]   { id, nome, telefone } · achado pelo CPF do perfil
 * @param {Array}  [entrada.inscricoes]     [{ nome, telefone }] · vol_inscricoes do MESMO e-mail
 * @param {Array}  [entrada.contatos]       [{ telefone }] · mem_contatos do membro aceito
 * @returns {{telefone: string|null, origem: string|null, rotulo: string|null,
 *            membro_id: string|null, descartados: Array}}
 */
function resolverTelefoneVoluntario(entrada = {}) {
  const nome = entrada.nome;
  const descartados = [];
  const vazio = { telefone: null, origem: null, rotulo: null, membro_id: null };

  // Aceita um candidato só se o número for ALCANÇÁVEL pelo nosso envio.
  // ⚠️ Régua reusada de `services/contatoPessoa.telefoneAlcancavel` (DDD real +
  // o 9 do celular + DDI 55), NÃO reimplementada: foi ela que pegou o número
  // suíço e o `996013179` de 9 dígitos. Número que o envio transforma em outro
  // número é PIOR que telefone ausente — a mensagem chega a um estranho.
  const aceitar = (cand) => {
    if (!cand) return null;
    if (!telefoneAlcancavel(cand.telefone)) {
      descartados.push({ origem: cand.origem, motivo: MOTIVO_DESCARTE.NUMERO_ERRADO, valor: digitos(cand.telefone) });
      return null;
    }
    return {
      telefone: cand.telefone,
      origem: cand.origem,
      rotulo: ROTULO_ORIGEM[cand.origem] || null,
      membro_id: cand.membro_id,
      descartados,
    };
  };

  // 1 · O próprio cadastro do voluntariado. É o que a pessoa (ou a equipe)
  //     digitou aqui dentro; nada é mais específico que isso.
  const doPerfil = aceitar(_candidato(ORIGENS.PERFIL, entrada.perfilTelefone));
  if (doPerfil) return doPerfil;

  // 2 · O cadastro da PESSOA, pelo vínculo que o módulo já declara
  //     (`membresia_id`). Fonte única do Contrato de porta.
  const membro = entrada.membro;
  if (membro && membro.telefone) {
    if (_nomeVeta(nome, membro.nome)) {
      descartados.push({ origem: ORIGENS.MEMBRO, motivo: MOTIVO_DESCARTE.NOME_DIVERGENTE, nome_outro: membro.nome });
    } else {
      const r = aceitar(_candidato(ORIGENS.MEMBRO, membro.telefone, membro.id));
      if (r) return r;
    }
  }

  // 3 · O cadastro da pessoa achado pelo CPF do perfil. CPF é a chave mais
  //     forte do matcher — mas o veto de nome roda igual, porque CPF errado
  //     digitado existe e é justamente o que a fila de identidade trata.
  const porCpf = entrada.membroPorCpf;
  if (porCpf && porCpf.telefone) {
    if (_nomeVeta(nome, porCpf.nome)) {
      descartados.push({ origem: ORIGENS.CPF, motivo: MOTIVO_DESCARTE.NOME_DIVERGENTE, nome_outro: porCpf.nome });
    } else {
      const r = aceitar(_candidato(ORIGENS.CPF, porCpf.telefone, porCpf.id));
      if (r) return r;
    }
  }

  // 4 · O formulário público de voluntariado que a própria pessoa preencheu.
  //     ⚠️ Casado por e-mail, e aqui o nome é OBRIGATÓRIO — não é veto, é
  //     EXIGÊNCIA. É o ramo "e-mail + NOME compatível" do matcher canônico:
  //     e-mail sozinho é o sinal que a família compartilha, e sem o nome esta
  //     fonte mandaria o lembrete de escala pro telefone do cônjuge.
  for (const insc of Array.isArray(entrada.inscricoes) ? entrada.inscricoes : []) {
    if (!insc || !insc.telefone) continue;
    const a = String(nome || '').trim();
    const b = String(insc.nome || '').trim();
    if (!a || !b || !nomesPodemSerMesmaPessoa(a, b)) {
      descartados.push({ origem: ORIGENS.INSCRICAO, motivo: MOTIVO_DESCARTE.NOME_DIVERGENTE, nome_outro: insc.nome || null });
      continue;
    }
    const r = aceitar(_candidato(ORIGENS.INSCRICAO, insc.telefone, null));
    if (r) return r;
  }

  // 5 · Contato secundário acumulado em `mem_contatos` — só do membro que
  //     JÁ passou pelos vetos acima (o serviço só carrega os contatos dele).
  //     É o telefone novo que a pessoa deu numa porta sem sobrescrever o
  //     principal; para "conseguir falar com ela" vale mais que nada.
  for (const c of Array.isArray(entrada.contatos) ? entrada.contatos : []) {
    if (!c || !c.telefone) continue;
    const r = aceitar(_candidato(ORIGENS.CONTATO, c.telefone, membro?.id || porCpf?.id || null));
    if (r) return r;
  }

  return { ...vazio, descartados };
}

module.exports = {
  ORIGENS,
  ROTULO_ORIGEM,
  MOTIVO_DESCARTE,
  resolverTelefoneVoluntario,
};
