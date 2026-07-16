// ============================================================================
// utils/cpf · normalização e validação de CPF (fonte única)
//
// Antes desta unificação havia 8 cópias de validador espalhadas pelas rotas
// públicas. Rotas novas usam este util; as antigas migram gradualmente.
// ============================================================================

function soDigitos(v) {
  return String(v || '').replace(/\D/g, '');
}

// 11 dígitos ou null. NÃO valida dígito verificador — use cpfValido pra isso.
function normalizarCpf(v) {
  const d = soDigitos(v);
  return d.length === 11 ? d : null;
}

// Dígito verificador oficial da Receita. Rejeita sequências repetidas
// (111.111.111-11 passa no algoritmo mas não é CPF real).
function cpfValido(v) {
  const d = soDigitos(v);
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  for (const n of [9, 10]) {
    let soma = 0;
    for (let i = 0; i < n; i++) soma += Number(d[i]) * (n + 1 - i);
    const dv = ((soma * 10) % 11) % 10;
    if (dv !== Number(d[n])) return false;
  }
  return true;
}

module.exports = { soDigitos, normalizarCpf, cpfValido };
