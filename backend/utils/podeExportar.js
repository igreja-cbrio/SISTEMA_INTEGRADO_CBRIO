// Quem pode EXPORTAR dado pessoal de um módulo.
//
// ⚠️⚠️ A flag `pode_exportar` existe na matriz de permissões desde sempre,
// aparece na tela de Permissões — e NÃO ERA APLICADA EM NENHUMA ROTA. Medido em
// 21/09/2026 no módulo `censo`: **34 cargos com nível >= 2 e só "Dev" com
// `pode_exportar = true`**. Ou seja, um botão de CSV sem esta guarda entregaria
// a 33 cargos exatamente o que a matriz diz que eles não podem fazer — e o
// arquivo sai do sistema, onde não há trilha nem revogação.
//
// ⚠️ Régua PURA e em `utils/` de propósito: guarda que decide algo e mora no
// serviço que lê banco é guarda que nenhum mutante alcança.
//
// ⚠️ `is_super_admin` e os papéis `admin`/`diretor` passam por cima da matriz em
// todo o resto do sistema (`authorizeModule` os libera antes de olhar nível), e
// manter isso aqui é o que impede a tela dizer "você pode ver, mas não exportar"
// para quem administra o sistema inteiro.
function podeExportar(user, modulo) {
  if (!user || !modulo) return false;
  if (user.is_super_admin === true) return true;
  if (user.role === 'admin' || user.role === 'diretor') return true;
  const perms = user.granular?.modulePerms;
  if (!perms || typeof perms !== 'object') return false;
  // ⚠️ O mapa é indexado por NOME e por SLUG (legado: alguns lookups usam
  // 'Financeiro'). Procurar só por um devolve `undefined` em silêncio, que vira
  // "não pode" — o lado seguro, mas esconderia o botão de quem tem o direito.
  const entry = perms[modulo] || perms[String(modulo).toLowerCase()];
  return entry?.pode_exportar === true;
}

module.exports = { podeExportar };
