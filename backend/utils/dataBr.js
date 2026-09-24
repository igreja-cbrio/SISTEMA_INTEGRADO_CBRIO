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

// ─── Cabeçalho de "hoje/mês" no fuso do Brasil ───────────────────────
//
// ⚠️ Vercel roda em UTC. `new Date().toISOString().slice(0, 10)` responde
// o dia no UTC — entre 21h e 24h BRT (00:00-03:00 UTC) já virou "amanhã".
// Isso quebrava vários KPIs às noites: conta com vencimento HOJE saía de
// "vencidas" 3h antes da meia-noite (D6 do code review); o mês atual em
// KPIs de cuidados/eventos avançava cedo demais (D15). As funções abaixo
// devolvem sempre o dia/mês *no fuso do Brasil*, independente de onde o
// processo está rodando.

const TZ_BR = 'America/Sao_Paulo';

/** Retorna `YYYY-MM-DD` do "hoje" no fuso America/Sao_Paulo. */
function hojeBR() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ_BR, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
}

/** Retorna `YYYY-MM-DD` (fuso BR) de uma Date/ISO qualquer. */
function toYmdBR(d) {
  const date = d instanceof Date ? d : new Date(d);
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ_BR, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(date);
}

/** Retorna `YYYY-MM-01` do primeiro dia do mês atual no fuso BR. */
function inicioDoMesBR() {
  return `${hojeBR().slice(0, 7)}-01`;
}

module.exports = { parseDateBR, hojeBR, toYmdBR, inicioDoMesBR, TZ_BR };
