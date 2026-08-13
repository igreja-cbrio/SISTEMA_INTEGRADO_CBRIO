/**
 * Réguas PURAS de campo de contato (telefone · e-mail · nascimento).
 *
 * Estavam dentro de `services/inscricaoContrato.js`, que carrega o cliente do
 * Supabase — então não podiam ser testadas no gate sem banco/env. Aqui são
 * puras: sem rede, sem banco, sem relógio obrigatório. O `inscricaoContrato`
 * segue **re-exportando** as três, byte a byte com o mesmo comportamento, pra
 * nenhuma das 7 portas públicas notar a mudança.
 *
 * ⚠️ São a MESMA régua das portas públicas. Mudar aqui muda o Contrato de
 * Inscrição inteiro — é o preço de ter uma régua só, e é o objetivo.
 */

/** Só os dígitos. `null`/`undefined` viram string vazia (nunca "null"). */
function soDigitos(v) {
  return String(v == null ? '' : v).replace(/\D/g, '');
}

/**
 * Tira o código do país do telefone brasileiro.
 *
 * ⚠️ **DDD 55 é Santa Maria/RS e é legítimo**: só remove o `55` quando o que
 * sobra AINDA é telefone completo (12-13 dígitos no total). `replace(/^55/,'')`
 * cru destruiria todo número de lá — é a armadilha registrada em
 * `src/test/telefoneCodigoPais.test.ts`, que é mutation-testado contra
 * exatamente essa simplificação.
 */
function tirarCodigoPaisTelefone(digitos) {
  const d = String(digitos || '');
  if (d.length >= 12 && d.length <= 13 && d.startsWith('55')) return d.slice(2);
  return d;
}

/**
 * Máscara canônica de exibição do telefone brasileiro: `(21) 99999-9999`.
 * É o formato que o `/perfil` do sistema e o app Staff gravam em
 * `profiles.telefone` (staff.js · src/pages/Perfil.jsx) — a mesma função,
 * agora única, pra o app de membros e o ERP nunca divergirem no que é "canônico".
 * Recebe dígitos (ou texto com máscara — os não-dígitos são descartados).
 *
 * ⚠️ **ORDEM importa** (bug documentado em src/test/telefoneCodigoPais.test.ts):
 * `tirarCodigoPaisTelefone` ANTES de truncar. O slice(0,11) antes da
 * normalização comia os 2 últimos dígitos de "+55 21 99999-8888" e gravava um
 * número que não existe.
 */
function mascaraTelefone(v) {
  const d = tirarCodigoPaisTelefone(soDigitos(v)).slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

/** Regex única de e-mail do sistema. NÃO normaliza (quem normaliza é o chamador). */
function emailValido(v) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v || ''));
}

/**
 * Nascimento em ISO (YYYY-MM-DD) ou `null`. Rejeita data inexistente (31/02),
 * ano < 1900 e data no futuro.
 *
 * ⚠️ `hoje` é INJETÁVEL (YYYY-MM-DD) pra o teste não depender do relógio da
 * máquina — a lição do `faixaEtaria.test.ts`, que passava ou falhava conforme a
 * hora em que rodava. Sem o parâmetro o comportamento é idêntico ao anterior.
 */
function validarNascimento(v, hoje) {
  const s = String(v || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s) return null;
  if (Number(s.slice(0, 4)) < 1900) return null;
  const limite = hoje || new Date().toISOString().slice(0, 10);
  if (s > limite) return null;
  return s;
}

module.exports = { soDigitos, tirarCodigoPaisTelefone, mascaraTelefone, emailValido, validarNascimento };
