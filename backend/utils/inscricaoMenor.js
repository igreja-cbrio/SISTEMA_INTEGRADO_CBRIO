// ============================================================================
// MENOR DE IDADE NA INSCRIÇÃO — dados do responsável (LGPD art. 14 §1º)
// 2026-08-17 · perguntas do retiro 2027 (PDF do Arthur)
//
// O PDF pede, *"caso for menor de idade"*: nome completo, CPF, grau de
// parentesco, celular e e-mail do responsável, mais a autorização dele pra a
// pessoa se batizar no retiro.
//
// ⚠️⚠️ ISTO NÃO É "MAIS SEIS CAMPOS DO CONSTRUTOR." O bloco existe como régua de
// primeira classe por três razões, e cada uma sozinha bastaria:
//   1. **É consentimento de terceiro** — quem autoriza o tratamento do dado de
//      quem tem menos de 18 é o responsável (LGPD art. 14 §1º), e isso vira
//      linha em `inscricao_consentimentos` (tipo `menor_responsavel`), não
//      resposta de formulário. Prova legal não mora em jsonb de pergunta.
//   2. **Precisa de VALIDAÇÃO** — CPF com dígito verificador, telefone com DDD,
//      nome sem abreviação. Campo livre do construtor aceita qualquer coisa, e
//      um telefone errado aqui é o contato de emergência de um adolescente que
//      está a duas horas do Rio.
//   3. **O contato do responsável é operacional** — a equipe do retiro liga pra
//      esse número. Ele não pode depender de uma `key` do construtor que alguém
//      renomeia num sábado.
//
// ⚠️ Régua PURA (`utils/`, entra no gate) e com o "hoje" INJETÁVEL: teste que lê
// o relógio da máquina foi o que mordeu no `faixaEtaria.test.ts`.
// ============================================================================

const { cpfValido, soDigitos } = require('./cpf');
const {
  tirarCodigoPaisTelefone, emailValido, temAbreviacaoNome,
} = require('./camposContato');

const MAIORIDADE = 18;

/** Grau de parentesco — lista FECHADA, com escape. */
const PARENTESCOS = ['Mãe', 'Pai', 'Avó', 'Avô', 'Tia', 'Tio', 'Irmã', 'Irmão', 'Responsável legal', 'Outro'];

/**
 * O dia de HOJE no fuso da igreja (BRT, UTC-3).
 *
 * ⚠️ Nunca `new Date().toISOString().slice(0,10)` cru: das 21h do Rio em diante
 * o dia UTC já virou, e quem faz aniversário de 18 amanhã seria tratado como
 * maior hoje à noite. Mesma armadilha do censo, do totem Kids e do "culto de
 * agora".
 */
function hojeBRT(agoraMs = Date.now()) {
  return new Date(agoraMs - 3 * 3600 * 1000).toISOString().slice(0, 10);
}

/**
 * Idade em anos completos na data de referência. `null` quando não dá pra saber.
 *
 * Comparação em STRING `YYYY-MM-DD` de propósito — `new Date('2009-03-01')` é
 * meia-noite UTC, que no Rio é o dia anterior às 21h.
 */
function idadeEmAnos(nascimentoISO, refISO) {
  const nasc = String(nascimentoISO || '').slice(0, 10);
  const ref = String(refISO || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(nasc) || !/^\d{4}-\d{2}-\d{2}$/.test(ref)) return null;
  if (nasc > ref) return null;
  let anos = Number(ref.slice(0, 4)) - Number(nasc.slice(0, 4));
  // Ainda não fez aniversário neste ano (compara mês-dia como texto).
  if (ref.slice(5) < nasc.slice(5)) anos -= 1;
  return anos;
}

/**
 * A pessoa é menor de idade?
 *
 * ⚠️ A referência é **HOJE (a data da INSCRIÇÃO)**, não a data do evento — e a
 * escolha é deliberada nos dois sentidos:
 *   · o que a LGPD governa é a COLETA do dado, que acontece hoje;
 *   · "menor hoje" é um conjunto MAIOR que "menor no evento" (quem tem 17 no
 *     retiro tem no máximo 17 hoje), então nenhum adolescente escapa do bloco.
 * O caso oposto — 17 hoje, 18 na viagem — preenche o bloco à toa, com o
 * consentimento do responsável registrado. Dado a mais com prova; o inverso
 * seria dado de menor colhido sem autorização.
 *
 * ⚠️ Nascimento ilegível devolve **false** porque este caminho é inalcançável:
 * `validarCamposPadrao` exige nascimento válido e recusa ANTES (`exigirNascimento`
 * é `true` em toda porta de inscrição). Se um dia deixar de exigir, esta régua
 * passa a precisar de decisão própria — o teste fixa o comportamento atual.
 */
function ehMenorDeIdade(nascimentoISO, refISO) {
  const idade = idadeEmAnos(nascimentoISO, refISO || hojeBRT());
  if (idade === null) return false;
  return idade < MAIORIDADE;
}

/**
 * O evento pede os dados do responsável para ESTA pessoa?
 *
 * Precisa das duas coisas: o evento estar marcado (`exige_dados_menor`) **e** a
 * pessoa ser menor. Evento sem a marca não pergunta nada — a maioria não tem
 * menor, e um bloco de 6 campos aparecendo "por precaução" derruba conversão.
 */
function exigeResponsavel(evento, nascimentoISO, refISO) {
  if (!evento || !evento.exige_dados_menor) return false;
  return ehMenorDeIdade(nascimentoISO, refISO);
}

/** Grau de parentesco declarado, ou `null`. Aceita texto livre em "Outro". */
function normalizarParentesco(v) {
  const s = String(v ?? '').trim().slice(0, 60);
  return s || null;
}

/**
 * Valida o bloco do responsável.
 *
 * Devolve `{ erros, valores }` no MESMO formato do `validarCamposPadrao` — as
 * chaves de `erros` são prefixadas com `responsavel_` pra a tela conseguir
 * apontar o campo exato.
 *
 * ⚠️ **O CPF do responsável exige dígito verificador**, igual ao da pessoa: sem
 * DV, um erro de digitação vira identidade errada, e é por CPF que o matcher
 * canônico liga gente (a lei do Contrato de porta).
 *
 * ⚠️ **O e-mail é obrigatório** aqui, e não é excesso: é o canal por onde o
 * termo de responsabilidade assinado volta pro responsável, e o PDF o lista.
 *
 * ⚠️ `autoriza_batismo` aceita ausente (a pergunta é sobre INTERESSE em batizar
 * — quem não pretende não precisa responder), mas quando vem tem que ser um dos
 * dois valores. Texto solto virando `true` seria autorização fabricada.
 */
function validarResponsavel(body = {}) {
  const erros = {};

  const nome = String(body.responsavel_nome ?? '').trim().replace(/\s+/g, ' ');
  if (nome.length < 5 || nome.split(' ').length < 2) {
    erros.responsavel_nome = 'Informe o nome completo do responsável.';
  } else if (temAbreviacaoNome(nome)) {
    erros.responsavel_nome = 'Escreva o nome do responsável sem abreviações.';
  }

  const cpfDigitos = soDigitos(body.responsavel_cpf);
  if (!cpfValido(cpfDigitos)) erros.responsavel_cpf = 'Informe um CPF válido do responsável.';

  const parentesco = normalizarParentesco(body.responsavel_parentesco);
  if (!parentesco) erros.responsavel_parentesco = 'Informe o grau de parentesco com o menor.';

  const telefone = tirarCodigoPaisTelefone(soDigitos(body.responsavel_telefone));
  if (telefone.length < 10 || telefone.length > 11) {
    erros.responsavel_telefone = 'Informe o celular do responsável, com DDD.';
  }

  const email = String(body.responsavel_email ?? '').trim().toLowerCase();
  if (!emailValido(email)) erros.responsavel_email = 'Informe um e-mail válido do responsável.';

  // Autorização de batismo: tri-estado (sim · não · não respondeu).
  let autorizaBatismo = null;
  const autorizaBruto = body.responsavel_autoriza_batismo;
  if (autorizaBruto === true || autorizaBruto === false) {
    autorizaBatismo = autorizaBruto;
  } else if (autorizaBruto !== undefined && autorizaBruto !== null && String(autorizaBruto).trim() !== '') {
    const s = String(autorizaBruto).trim().toLowerCase();
    if (s === 'sim' || s === 'true') autorizaBatismo = true;
    else if (s === 'nao' || s === 'não' || s === 'false') autorizaBatismo = false;
    else erros.responsavel_autoriza_batismo = 'Responda sim ou não sobre a autorização de batismo.';
  }

  return {
    erros,
    valores: {
      responsavelNome: nome,
      responsavelCpf: cpfValido(cpfDigitos) ? cpfDigitos : null,
      responsavelParentesco: parentesco,
      responsavelTelefone: telefone.length >= 10 && telefone.length <= 11 ? telefone : null,
      responsavelEmail: emailValido(email) ? email : null,
      responsavelAutorizaBatismo: autorizaBatismo,
    },
  };
}

module.exports = {
  MAIORIDADE,
  PARENTESCOS,
  hojeBRT,
  idadeEmAnos,
  ehMenorDeIdade,
  exigeResponsavel,
  normalizarParentesco,
  validarResponsavel,
};
