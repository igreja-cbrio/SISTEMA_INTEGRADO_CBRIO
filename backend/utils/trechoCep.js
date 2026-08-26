// Trecho de CEP · a unidade do mapa por CEP do Perfil da Membresia.
//
// ⚠️⚠️ POR QUE 5 DÍGITOS E NÃO O CEP INTEIRO. CEP completo é RUA, e o mapa é
// aberto a quem tem Membresia nível 1. Com a base de hoje quase todo ponto
// teria uma pessoa só, e um ponto de uma pessoa no mapa É o endereço dela — o
// oposto do contrato escrito da aba ("nenhuma destas rotas devolve endereço de
// pessoa"). O trecho de 5 dígitos é a faixa postal logo abaixo do bairro:
// algumas dezenas de ruas, mais específico que bairro e sem apontar ninguém.
//
// ⚠️ ESPELHO EXATO de `vw_dem_pessoa.cep_regiao`, que é
// `CASE WHEN length(cep) = 8 THEN left(cep, 5) END` sobre o CEP já
// digits-only. Divergir aqui faria o filtro procurar uma chave que a view
// nunca produz — mapa e recorte discordariam em silêncio.

/** Só dígitos, ou string vazia. */
const soDigitos = (v) => String(v ?? '').replace(/\D/g, '');

/**
 * CEP (com ou sem máscara) → trecho de 5 dígitos, ou `null`.
 *
 * ⚠️ CEP incompleto devolve `null`, NUNCA os 5 primeiros do que veio: os 7
 * dígitos que o censo já coletou por engano viraram trecho errado se truncados,
 * e trecho errado põe a pessoa no lugar errado do mapa. A view exige 8 pelo
 * mesmo motivo.
 */
function regiaoDeCep(cepBruto) {
  const d = soDigitos(cepBruto);
  return d.length === 8 ? d.slice(0, 5) : null;
}

/**
 * O que chega na query string é trecho válido?
 *
 * ⚠️ Whitelist por FORMA, não por lista: trecho novo aparece sozinho quando
 * alguém atualiza o cadastro. Valor fora do formato é RECUSADO em vez de virar
 * filtro que não casa com ninguém — perfil vazio parece "a igreja não tem
 * ninguém aqui" em vez de "você digitou errado".
 */
function trechoValido(valor) {
  return soDigitos(valor).length === 5;
}

/** Rótulo para humano. Faixa, nunca um CEP fechado (que pareceria endereço). */
function rotuloTrecho(regiao, bairro) {
  const r = soDigitos(regiao);
  if (r.length !== 5) return null;
  return `${r}-xxx${bairro ? ` · ${bairro}` : ''}`;
}

/**
 * PISO DE PESSOAS POR PONTO — vale para desenhar E para filtrar.
 *
 * ⚠️ Sem ele, clicar num trecho de 1 pessoa mostraria o perfil completo dessa
 * pessoa (gênero, idade, estado civil, escolaridade, profissão) numa tela que
 * promete ser agregada. Espelha o `>= 3` de `fn_dem_perfil`.
 */
const MINIMO_POR_TRECHO = 3;

// ⚠️ REGISTRO HONESTO: o `Number.isFinite` aqui é DEFENSIVO e não observável
// pelos testes — a comparação sozinha já recusa `null`, `undefined`, `NaN` e
// texto (`NaN >= 3` é false, e `Number(null)` é 0). O mutante que o remove
// SOBREVIVE, e está declarado assim em vez de eu inventar um caso que não
// acontece. Ele fica pela intenção: contagem só decide quando é número finito.
const trechoTemMassa = (total) =>
  Number.isFinite(Number(total)) && Number(total) >= MINIMO_POR_TRECHO;

/**
 * CEP em 8 dígitos, ou `null`.
 *
 * ⚠️ Espelho de `src/lib/cepAutopreenche.cepCompleto` — o formulário público
 * valida no cliente e o servidor CONFERE. Divergir faria uma das duas coisas,
 * as duas ruins: formulário insubmissível (a tela deixa mandar e o servidor
 * recusa) ou CEP pela metade gravado como se fosse endereço.
 *
 * ⚠️ Incompleto NÃO é completado nem truncado: o censo já coletou CEP de 7
 * dígitos por engano, e truncar poria a pessoa na faixa postal errada — é a
 * mesma razão de `regiaoDeCep` exigir 8.
 */
function normalizarCep(valor) {
  const d = soDigitos(valor);
  return d.length === 8 ? d : null;
}

/** O CEP está completo (8 dígitos)? */
function cepCompleto(valor) {
  return normalizarCep(valor) !== null;
}

module.exports = {
  regiaoDeCep,
  normalizarCep,
  cepCompleto,
  trechoValido,
  rotuloTrecho,
  trechoTemMassa,
  MINIMO_POR_TRECHO,
};
