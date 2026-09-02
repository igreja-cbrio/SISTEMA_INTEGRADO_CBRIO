// ============================================================================
// CPF/CNPJ do MEMO de extrato bancário · fonte ÚNICA (2026-09-02)
//
// ⚠️⚠️ POR QUE ISTO EXISTE. A extração vivia COPIADA em 5 lugares
// (`ofxParser.js`, `santander.js` ×2, `santanderCron.js` ×2) com o MESMO bug, e
// o bug só apareceu quando o Matheus mandou um extrato bom:
//
//     memo:  "PIX RECEBIDO ANDREA 04/06 ANDREA M VIEIRA SANTOS 052.044.777-80"
//     antes: memo.replace(/\D/g,'') → "040605204477780"
//            .match(/\d{14}/)       → "04060520447778"  ← CNPJ que não existe
//
// A data `04/06` do próprio memo colava no CPF e produzia um documento
// inventado. Medido no arquivo real de 90 dias (04/06→02/09/2026): dos **5.921
// créditos que trazem CPF**, o parser antigo acertou **ZERO** e devolveu 5.921
// CNPJs falsos. E o ramo do CPF nem chegava a rodar — ele procurava 11 dígitos
// CONTÍGUOS no memo original, e o CPF vem formatado com ponto e hífen.
//
// As três causas, todas corrigidas aqui:
//   1. COLAPSAR o memo em dígitos (`replace(/\D/g,'')`) apaga a fronteira entre
//      campos. A busca agora é no memo ORIGINAL — é ISTO que impede a data de
//      colar no CPF, não a fronteira (ver o mutante declarado abaixo).
//   2. Devolver o PRIMEIRO candidato sem validar. Agora todo candidato passa
//      por dígito verificador; sem DV válido é descartado, não devolvido.
//   3. CNPJ antes de CPF sem validar nenhum dos dois. Agora a ordem é por
//      FORÇA DO SINAL: formatado (a pontuação é a evidência mais forte) antes
//      de cru, e dentro do formatado o CNPJ primeiro (a barra é inequívoca).
//
// ⚠️ A BLACKLIST não é enfeite. O CNPJ da própria igreja aparece no memo do
// repasse (a igreja é a favorecida) e já entrou como "contraparte" em 10
// créditos de R$ 360.680 — que são transferência entre contas próprias, nem
// receita são. Adquirente idem: o repasse dela é agregado de N doações, nunca
// um doador.
// ============================================================================

/** Dígito verificador de CPF. Rejeita os 11 dígitos repetidos. */
function cpfValido(valor) {
  const c = String(valor || '').replace(/\D/g, '');
  if (c.length !== 11 || /^(\d)\1{10}$/.test(c)) return false;
  let soma = 0;
  for (let i = 0; i < 9; i++) soma += Number(c[i]) * (10 - i);
  let d1 = (soma * 10) % 11;
  if (d1 === 10) d1 = 0;
  if (d1 !== Number(c[9])) return false;
  soma = 0;
  for (let i = 0; i < 10; i++) soma += Number(c[i]) * (11 - i);
  let d2 = (soma * 10) % 11;
  if (d2 === 10) d2 = 0;
  return d2 === Number(c[10]);
}

/**
 * Dígito verificador de CNPJ.
 *
 * ⚠️ NÃO EXISTIA no sistema inteiro (conferido em 02/09/2026: nenhuma
 * `fn_cnpj_dv_valido` no banco, nenhuma função em `backend/`). Era por isso que
 * qualquer sequência de 14 dígitos virava CNPJ — inclusive
 * `23765921258137`, que nasceu de "237.6592.JOAO M N JOAO MORAES NETO"
 * (banco + agência colados) e virou "CNPJ" de uma pessoa física.
 */
function cnpjValido(valor) {
  const c = String(valor || '').replace(/\D/g, '');
  if (c.length !== 14 || /^(\d)\1{13}$/.test(c)) return false;
  const calc = (base) => {
    let peso = base.length - 7;
    let soma = 0;
    for (let i = 0; i < base.length; i++) {
      soma += Number(base[i]) * peso;
      peso -= 1;
      if (peso < 2) peso = 9;
    }
    const r = soma % 11;
    return r < 2 ? 0 : 11 - r;
  };
  if (calc(c.slice(0, 12)) !== Number(c[12])) return false;
  return calc(c.slice(0, 13)) === Number(c[13]);
}

// Documentos que NUNCA são contraparte de uma doação, por mais válidos que
// sejam. Dígitos apenas.
//
// ⚠️ `07023068000135` é o CNPJ da CBRio. Ele aparece no memo do repasse porque
// a igreja é quem RECEBE — tratá-lo como contraparte transforma transferência
// entre contas próprias em "doação da igreja para a igreja".
const CNPJ_IGREJA = '07023068000135';

// Adquirentes e instituições de pagamento: o crédito delas é REPASSE agregado
// de N doações (a LEI nº 6 do núcleo de pagamentos), nunca um doador.
const CNPJ_ADQUIRENTES = [
  '01027058000191', // Cielo
  '00749048760142', // Redecard / Rede
  '16501555000157', // Stone
  '08561701000101', // PagSeguro
  '10573521000191', // Mercado Pago
  '17351180000159', // Getnet
];

const BLACKLIST = new Set([CNPJ_IGREJA, ...CNPJ_ADQUIRENTES]);

/** Acrescenta documentos à blacklist em runtime (config/env), sem editar código. */
function bloquearDocumentos(lista) {
  for (const d of lista || []) {
    const c = String(d || '').replace(/\D/g, '');
    if (c.length === 11 || c.length === 14) BLACKLIST.add(c);
  }
}

function ehBloqueado(digitos) {
  return BLACKLIST.has(String(digitos || '').replace(/\D/g, ''));
}

// ⚠️ Fronteira de DÍGITO nos dois lados — é o que impede pegar um pedaço de um
// número maior (id de transação, agência+conta).
//
// ⚠️⚠️ Ela NÃO precisa incluir `.`, `/` e `-`: a primeira versão incluía, e o
// mutante que os removeu SOBREVIVEU aos 13 casos. Investigado em vez de
// remendado — quem impede a data `04/06` de colar no CPF não é a fronteira, é
// não COLAPSAR o memo em dígitos; e exigir que não haja ponto antes rejeitaria
// CPF legítimo em memo tipo "REF.11144477735". Guarda que não guarda vira
// complexidade que a próxima sessão acha que está protegendo algo.
const BORDA_ANTES = '(?<!\\d)';
const BORDA_DEPOIS = '(?!\\d)';

const RE = {
  cnpjFormatado: new RegExp(`${BORDA_ANTES}\\d{2}\\.\\d{3}\\.\\d{3}/\\d{4}-\\d{2}${BORDA_DEPOIS}`, 'g'),
  cpfFormatado: new RegExp(`${BORDA_ANTES}\\d{3}\\.\\d{3}\\.\\d{3}-\\d{2}${BORDA_DEPOIS}`, 'g'),
  cnpjCru: new RegExp(`${BORDA_ANTES}\\d{14}${BORDA_DEPOIS}`, 'g'),
  cpfCru: new RegExp(`${BORDA_ANTES}\\d{11}${BORDA_DEPOIS}`, 'g'),
};

function candidatos(memo, re, tipo, ehValido) {
  const achados = [];
  for (const m of String(memo).matchAll(re)) {
    const digitos = m[0].replace(/\D/g, '');
    if (!ehValido(digitos)) continue;
    if (ehBloqueado(digitos)) continue;
    achados.push({ documento: digitos, tipo, formatado: m[0] });
  }
  return achados;
}

/**
 * Extrai o documento da contraparte a partir do MEMO.
 *
 * @returns {{documento: string, tipo: 'cpf'|'cnpj', formatado: string} | null}
 *
 * ⚠️ Devolve `null` COM MOTIVO em `motivo` quando o memo tem dois documentos
 * válidos e DIFERENTES do mesmo tipo — ali não dá pra saber qual é a
 * contraparte, e escolher um é chutar identidade. Régua da casa: erro nunca
 * vira vazio mudo.
 */
function extrairDocumentoDoMemo(memo) {
  if (!memo) return null;
  const texto = String(memo);

  // ⚠️⚠️ A ambiguidade é apurada por TIPO, juntando formatado E cru — não por
  // etapa. A primeira versão desta função buscava formatado primeiro e devolvia
  // assim que achasse UM; com `"PIX 111.444.777-35 12345678909"` ela devolvia o
  // formatado e nem olhava o segundo CPF. O teste pegou.
  //
  // "Pontuação é sinal mais forte" continua valendo — mas só para escolher entre
  // TIPOS (CNPJ formatado vence CPF cru). Entre dois CPFs diferentes, escolher
  // um é chutar a QUEM pertence o dinheiro, e esse erro é caro: vai para
  // revisão humana, não para o palpite.
  const porTipo = [
    { tipo: 'cnpj', achados: [...candidatos(texto, RE.cnpjFormatado, 'cnpj', cnpjValido),
                              ...candidatos(texto, RE.cnpjCru, 'cnpj', cnpjValido)] },
    { tipo: 'cpf', achados: [...candidatos(texto, RE.cpfFormatado, 'cpf', cpfValido),
                             ...candidatos(texto, RE.cpfCru, 'cpf', cpfValido)] },
  ];

  for (const { achados } of porTipo) {
    if (!achados.length) continue;
    const unicos = [...new Set(achados.map((a) => a.documento))];
    if (unicos.length > 1) {
      return { documento: null, tipo: null, formatado: null, motivo: 'ambiguo' };
    }
    // Entre iguais, o formatado é o representante (guarda a forma original).
    return achados.find((a) => /\D/.test(a.formatado)) || achados[0];
  }
  return null;
}

module.exports = {
  cpfValido,
  cnpjValido,
  extrairDocumentoDoMemo,
  bloquearDocumentos,
  ehBloqueado,
  CNPJ_IGREJA,
  CNPJ_ADQUIRENTES,
};
