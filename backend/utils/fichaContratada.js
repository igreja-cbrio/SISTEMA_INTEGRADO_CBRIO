/**
 * Régua PURA da **Ficha Cadastral e de Qualificação da CONTRATADA** (Anexo II).
 *
 * Vive em `utils/` (sem supabase, sem rede, sem banco) porque entra no gate de
 * deploy: é ela que decide se uma ficha está completa, se a chave PIX é
 * utilizável e se o colaborador pode receber o link. Régua que decide algo e
 * mora em código impuro é guarda que nenhum teste alcança (lição de 01/09).
 *
 * ⚠️⚠️ POR QUE ESTE MÓDULO EXISTE, medido em 21/09/2026
 * A igreja paga **32 PJ por PIX** e a chave não está em lugar nenhum do
 * sistema: 0 de 32 têm `pj_pix`, 1 tem `pj_cnpj`. O formulário de PJ existe
 * desde 06/2026 (`src/pages/admin/rh/admissao.jsx`) e só abre com o status
 * `em_admissao` — quem já é ativo não tem por onde preencher, nem pelo RH.
 * Além do dado faltando, isso quebra um consumidor vivo: a conciliação da
 * folha (`rh.js` · `_termosFuncionario`) casa lançamento por CNPJ e razão
 * social, e com ambos nulos ela cai em match por NOME com `includes`.
 *
 * ⚠️ CAMPOS CORTADOS do PDF, com autorização do dono do produto (21/09):
 * **nacionalidade, estado civil e profissão** do representante não passam no
 * princípio da necessidade (LGPD art. 6º, III) — são cópia do preâmbulo de
 * escritura pública e nada num contrato de prestação de serviços com PJ
 * depende deles. **Comprovante de endereço da sede** saiu por ser redundante
 * (o endereço já consta do cartão CNPJ) e por normalmente estar em nome de
 * terceiro, o que importaria um titular sem base legal nenhuma.
 */
const { cpfValido, cnpjValido } = require('./documentoBr');

/** Só dígitos. */
function digitos(v) {
  return String(v == null ? '' : v).replace(/\D/g, '');
}

/**
 * Regimes aceitos. Lista FECHADA de propósito: é o que decide o tratamento
 * fiscal da nota, e texto livre aqui vira o mesmo regime escrito de cinco
 * formas — a doença que o módulo Cuidados pagou para descobrir (o mesmo pastor
 * em 4 grafias, com o total dele partido em 4 cards).
 */
const REGIMES = ['MEI', 'SIMPLES', 'PRESUMIDO', 'REAL'];

/** Tipos de chave PIX. `aleatoria` é o EVP (UUID v4). */
const TIPOS_PIX = ['cpf', 'cnpj', 'email', 'telefone', 'aleatoria'];

const RE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const RE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * A chave PIX é utilizável?
 *
 * ⚠️⚠️ Valida POR TIPO DECLARADO, nunca por regex genérico que tente adivinhar.
 * Adivinhar erra no caso mais comum desta base: uma chave de 11 dígitos é CPF
 * **ou** telefone sem o 9, e tratar as duas como a mesma coisa manda dinheiro
 * para a conta errada. Quem declara o tipo é quem é dono da chave.
 *
 * ⚠️ CPF e CNPJ conferem o DÍGITO VERIFICADOR (reusando a fonte única
 * `documentoBr`, nunca uma terceira cópia): chave com dígito errado é rejeitada
 * pelo banco no dia do pagamento, e aí já é tarde — a pessoa não recebeu.
 */
function pixValido(tipo, chave) {
  const t = String(tipo || '').toLowerCase();
  const c = String(chave == null ? '' : chave).trim();
  if (!TIPOS_PIX.includes(t) || !c) return false;
  if (t === 'cpf') return cpfValido(c);
  if (t === 'cnpj') return cnpjValido(c);
  if (t === 'email') return c.length <= 77 && RE_EMAIL.test(c);
  if (t === 'telefone') {
    const d = digitos(c);
    // Aceita com ou sem o 55 do país, mas o resto tem que ser DDD + número.
    const semPais = d.length > 11 && d.startsWith('55') ? d.slice(2) : d;
    return semPais.length === 10 || semPais.length === 11;
  }
  return RE_UUID.test(c); // aleatoria
}

/**
 * Campos que a ficha EXIGE. A lista é curta de propósito.
 *
 * ⚠️⚠️ A régua irmã (`rhOnboardingProntidao.js`) traz escrito no topo o aviso
 * que vale aqui: **exigir mais do que a porta coleta faz o cadastro entrar na
 * fila de pendentes e NUNCA sair**. Régua e porta mudam no mesmo commit.
 *
 * `inscricao_municipal` fica FORA: MEI normalmente não tem.
 */
const OBRIGATORIOS = [
  ['razao_social', 'razão social'],
  ['cnpj', 'CNPJ'],
  ['regime_tributario', 'regime tributário'],
  ['endereco_sede', 'endereço da sede'],
  ['email_contratual', 'e-mail para comunicações'],
  ['rep_nome', 'nome do representante legal'],
  ['rep_cpf', 'CPF do representante legal'],
  ['pix_tipo', 'tipo da chave PIX'],
  ['pix_chave', 'chave PIX'],
  ['conta_titular', 'titular da conta'],
];

/**
 * Valida a ficha inteira. Devolve `{ ok, erros: {campo: motivo} }`.
 *
 * ⚠️ Devolve TODOS os erros de uma vez, não o primeiro: um formulário de ~15
 * campos que aponta um erro por vez faz a pessoa enviar cinco vezes, e é aí
 * que ela desiste. A adesão é o gargalo medido desta feature (18 de 35 na
 * porta irmã, que pede só 5 campos fáceis).
 */
function validarFicha(ficha) {
  const f = ficha || {};
  const erros = {};

  for (const [campo, rotulo] of OBRIGATORIOS) {
    if (!String(f[campo] == null ? '' : f[campo]).trim()) erros[campo] = `Informe ${rotulo}.`;
  }

  if (f.cnpj && !cnpjValido(f.cnpj)) erros.cnpj = 'CNPJ inválido (confira os números).';
  if (f.rep_cpf && !cpfValido(f.rep_cpf)) erros.rep_cpf = 'CPF inválido (confira os números).';
  if (f.regime_tributario && !REGIMES.includes(String(f.regime_tributario).toUpperCase())) {
    erros.regime_tributario = 'Escolha um regime da lista.';
  }
  if (f.email_contratual && !RE_EMAIL.test(String(f.email_contratual).trim())) {
    erros.email_contratual = 'E-mail inválido.';
  }
  if (f.pix_tipo && f.pix_chave && !pixValido(f.pix_tipo, f.pix_chave)) {
    erros.pix_chave = 'Chave PIX não confere com o tipo escolhido.';
  }

  // ⚠️⚠️ O PDF exige que o titular da conta COINCIDA com a CONTRATADA — e a
  // prática bancária não garante isso (MEI recebendo em conta PF, PIX que é o
  // CPF do sócio, conta do cônjuge). NÃO bloqueamos: bloquear trava submissão
  // legítima e a pessoa fica sem receber. Exigimos DECLARAÇÃO EXPLÍCITA, e
  // quando não coincide o motivo é obrigatório e vai destacado para o RH.
  //
  // ⚠️ E NUNCA comparar titular com razão social por string: com MEI, acento e
  // "& CIA LTDA" o falso-positivo é garantido. Quem declara é a pessoa.
  if (f.titular_confere === false && !String(f.titular_motivo || '').trim()) {
    erros.titular_motivo = 'Explique por que o titular da conta é diferente da contratada.';
  }
  if (f.titular_confere !== true && f.titular_confere !== false) {
    erros.titular_confere = 'Informe se o titular da conta é a própria contratada.';
  }

  return { ok: Object.keys(erros).length === 0, erros };
}

/**
 * Normaliza a ficha para gravação. NUNCA inventa valor.
 *
 * ⚠️ Documento vai digits-only (padrão da casa: a exibição formata na tela).
 * Gravar mascarado deixa o CNPJ fora do padrão que a conciliação da folha usa
 * para casar lançamento — que é exatamente o consumidor que esta ficha veio
 * consertar.
 */
function normalizarFicha(ficha) {
  const f = ficha || {};
  const texto = (v, max) => {
    const s = String(v == null ? '' : v).trim();
    return s ? s.slice(0, max) : null;
  };
  return {
    razao_social: texto(f.razao_social, 200),
    nome_fantasia: texto(f.nome_fantasia, 200),
    cnpj: digitos(f.cnpj) || null,
    regime_tributario: f.regime_tributario ? String(f.regime_tributario).toUpperCase() : null,
    inscricao_municipal: texto(f.inscricao_municipal, 40),
    endereco_sede: texto(f.endereco_sede, 300),
    telefone_sede: digitos(f.telefone_sede) || null,
    email_contratual: f.email_contratual ? String(f.email_contratual).trim().toLowerCase().slice(0, 150) : null,
    whatsapp_contratual: digitos(f.whatsapp_contratual) || null,
    rep_nome: texto(f.rep_nome, 200),
    rep_cpf: digitos(f.rep_cpf) || null,
    rep_endereco: texto(f.rep_endereco, 300),
    banco: texto(f.banco, 100),
    agencia: texto(f.agencia, 20),
    conta: texto(f.conta, 30),
    conta_tipo: texto(f.conta_tipo, 20),
    pix_tipo: f.pix_tipo ? String(f.pix_tipo).toLowerCase() : null,
    pix_chave: texto(f.pix_chave, 100),
    conta_titular: texto(f.conta_titular, 200),
    titular_confere: f.titular_confere === true ? true : (f.titular_confere === false ? false : null),
    titular_motivo: texto(f.titular_motivo, 300),
  };
}

/**
 * ⚠️⚠️ Campos da ficha que NUNCA voltam numa resposta pública.
 *
 * O padrão da porta irmã — devolver o CPF já gravado "para pré-preencher" — é
 * o DEFEITO, não o modelo: o link vai por WhatsApp, é encaminhável, e somar
 * banco/conta/PIX ao payload transforma um link repassado na ficha bancária
 * completa do prestador. Estes campos são **write-only pela porta pública**.
 */
const NUNCA_NO_PUBLICO = [
  'banco', 'agencia', 'conta', 'conta_tipo', 'pix_chave', 'pix_tipo', 'rep_cpf', 'conta_titular',
  // ⚠️ IP e user-agent de quem assinou são LASTRO de auditoria, não informação
  // para a tela. Achado no teste ponta a ponta contra produção (21/09): eles
  // voltavam no GET, então quem recebesse o link ENCAMINHADO via o IP de quem
  // preencheu — dado pessoal (LGPD art. 5º, I) exposto a terceiro, sem servir
  // para nada. `aceite_em` e `aceite_texto` FICAM: a pessoa precisa saber que
  // já aceitou e o que leu.
  'aceite_ip', 'aceite_user_agent',
];

/** Remove do objeto tudo que não pode sair numa resposta pública. */
function semSegredos(ficha) {
  const f = { ...(ficha || {}) };
  for (const c of NUNCA_NO_PUBLICO) delete f[c];
  return f;
}

/**
 * Quem deve receber a ficha da CONTRATADA?
 *
 * ⚠️⚠️ SÓ PJ. Há 13 CLT e 1 PREBENDA ativos, e o motor de disparo do onboarding
 * filtra por STATUS, não por tipo de contrato — pendurar a ficha nele sem esta
 * régua manda 14 pessoas que não têm empresa preencherem CNPJ.
 *
 * ⚠️ Fail-closed: tipo desconhecido NÃO recebe. Um `tipo_contrato` novo (a
 * coluna é texto livre, editável pelo PUT) não pode passar a receber pedido de
 * CNPJ só por existir.
 */
function ehContratada(tipoContrato) {
  const t = String(tipoContrato || '').toUpperCase().trim();
  return t === 'PJ' || t === 'PJ+';
}

/**
 * Estado da ficha de um colaborador. É o que a tela do RH e a régua de
 * bloqueio consomem.
 *
 * Devolve `{ aplicavel, preenchida, completa, aceita, faltando[] }`.
 *
 * ⚠️ `aplicavel:false` (CLT) NÃO é pendência — é gente para quem a ficha não
 * faz sentido. Colapsar os dois faz o painel cobrar 14 pessoas indevidamente.
 */
function estadoFicha(funcionario) {
  const f = funcionario || {};
  if (!ehContratada(f.tipo_contrato)) {
    return { aplicavel: false, preenchida: false, completa: false, aceita: false, faltando: [] };
  }
  const ficha = f.ficha_contratada || null;
  if (!ficha) {
    return {
      aplicavel: true, preenchida: false, completa: false, aceita: false,
      faltando: OBRIGATORIOS.map(([, rotulo]) => rotulo),
    };
  }
  const { ok, erros } = validarFicha(ficha);
  const faltando = OBRIGATORIOS.filter(([campo]) => erros[campo]).map(([, rotulo]) => rotulo);
  return {
    aplicavel: true,
    preenchida: true,
    completa: ok,
    aceita: !!ficha.aceite_em,
    faltando,
  };
}

/**
 * ⚠️⚠️ A TRAVA DA FOLHA, autorizada pelo dono do produto em 21/09.
 *
 * ⚠️ HONESTIDADE SOBRE O QUE ISTO É: o sistema **não emite folha de
 * pagamento** — `rh_folha_snapshots` é um agregado mensal de 3 linhas e o
 * módulo só CONCILIA o que já foi pago. Não existe botão de pagamento para
 * travar. Então esta régua não impede um PIX de sair; ela torna o bloqueio
 * VISÍVEL e impossível de ignorar na tela de quem libera.
 *
 * Prometer "folha travada" quando o software não paga seria a tela afirmando
 * o que o produto não faz.
 */
function bloqueioFolha(funcionario) {
  const e = estadoFicha(funcionario);
  if (!e.aplicavel) return { bloqueado: false, motivo: null };
  if (!e.preenchida) return { bloqueado: true, motivo: 'Ficha da contratada não preenchida' };
  if (!e.completa) return { bloqueado: true, motivo: `Ficha incompleta: falta ${e.faltando.join(', ')}` };
  return { bloqueado: false, motivo: null };
}

module.exports = {
  REGIMES,
  TIPOS_PIX,
  OBRIGATORIOS,
  NUNCA_NO_PUBLICO,
  digitos,
  pixValido,
  validarFicha,
  normalizarFicha,
  semSegredos,
  ehContratada,
  estadoFicha,
  bloqueioFolha,
};
