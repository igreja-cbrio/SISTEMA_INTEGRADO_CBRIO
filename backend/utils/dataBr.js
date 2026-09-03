// ============================================================================
//  Data no formato BR → `YYYY-MM-DD` · régua PURA (sem dependência nenhuma)
//
//  ⚠️⚠️ POR QUE ELA MORA EM `utils/` (03/09/2026). Esta função nasceu dentro de
//  `services/pixExtratoParser.js`, que requer **`xlsx`** — uma dependência de
//  `backend/package.json`. Qualquer régua do GATE que a importasse arrastava o
//  `xlsx` atrás de si e quebrava no CI com `Cannot find module 'xlsx'`, mesmo
//  passando na máquina de quem escreveu (onde o pacote resolve). Foi
//  exatamente o que aconteceu com `utils/paginacaoExtrato`.
//
//  É a mesma lição que já tinha mudado `validarNascimento`/`emailValido` de
//  `inscricaoContrato.js` para `utils/camposContato.js`: **régua no gate não
//  pode depender da árvore de `backend/`**. O parser segue re-exportando, então
//  nenhum dos importadores existentes muda.
//
//  ⚠️ REGRA DE NEGÓCIO QUE ELA GUARDA: o Santander manda `transactionDate` em
//  **DD/MM/YYYY**. Passar essa string crua pro Postgres (DateStyle ISO,MDY)
//  troca dia por mês EM SILÊNCIO quando o dia é ≤ 12 ("06/08/2026" virava
//  8 de junho) e estoura 22008 quando o dia é > 12 — foi isso que zerou 8
//  sincronizações seguidas em 08/2026. Regressão coberta por
//  `backend/services/santander/dataBr.test.js`.
// ============================================================================

/**
 * Parseia data BR (DD/MM/YYYY) ou ISO (YYYY-MM-DD). Devolve `YYYY-MM-DD`,
 * ou `null` quando não reconhece — nunca chuta.
 */
function parseDateBR(raw) {
  if (!raw) return null;
  if (raw instanceof Date) {
    const pad = (n) => String(n).padStart(2, '0');
    return `${raw.getFullYear()}-${pad(raw.getMonth() + 1)}-${pad(raw.getDate())}`;
  }
  const s = String(raw).trim();
  // DD/MM/YYYY
  const br = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (br) {
    return `${br[3]}-${String(br[2]).padStart(2, '0')}-${String(br[1]).padStart(2, '0')}`;
  }
  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  return null;
}

module.exports = { parseDateBR };
