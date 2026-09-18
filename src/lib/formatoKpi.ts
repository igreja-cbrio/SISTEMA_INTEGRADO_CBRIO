// ════════════════════════════════════════════════════════════════════════════
//  Como um valor de KPI tático é ESCRITO na tela.
//
//  ⚠️ Achado de 02/09/2026: o Matheus abriu o Dashboard Semanal do financeiro,
//  viu o card "Valor total arrecadado no ciclo" mostrando **871406** e
//  perguntou o que era — sem `R$`, sem separador de milhar. O componente
//  (`KpiTaticoOficial`) fazia `${valor}${unidade === '%' ? '%' : ''}`: tratava
//  UMA unidade e ignorava as outras nove. Medido no banco no mesmo dia:
//
//    null 97 · % 46 · nota 18 · # 4 · pessoas 3 · ocorrências 2 · views 2
//    · dias 1 · R$ 1 · cards 1
//
//  Ou seja 97 KPIs sem unidade também saíam sem separador de milhar. O card
//  aparece em SEIS telas (financeiro, grupos, cuidados, integração,
//  voluntariado e a de área), então o conserto vale para todas.
//
//  ⚠️ A unidade JÁ ESTAVA CERTA no banco (`unidade = 'R$'`). Não era dado
//  ruim — era a tela que não lia o que o dado dizia.
// ════════════════════════════════════════════════════════════════════════════

/** Unidades que o banco usa hoje. Texto livre, então a régua tolera o que não conhece. */
export type UnidadeKpi = string | null | undefined;

const ehMoeda = (u: UnidadeKpi) => /^(r\$|brl|reais)$/i.test(String(u || '').trim());
const ehPercent = (u: UnidadeKpi) => String(u || '').trim() === '%';

/**
 * ⚠️ Unidades que NÃO viram sufixo: `#` é notação de "quantidade" e ficaria
 * "12 #" na tela; `nota` viraria "9 nota". As duas se leem melhor só com o
 * número — o rótulo do KPI já diz o que é.
 */
const SEM_SUFIXO = new Set(['#', 'nota']);

/**
 * Formata o valor de um KPI conforme a unidade cadastrada.
 *
 * ⚠️ Devolve `'—'` para valor ausente — NUNCA `0`. "Sem dado registrado" e
 * "o valor medido é zero" levam a decisões opostas, e é lei do projeto que o
 * segundo não pode se disfarçar do primeiro.
 */
export function formatarValorKpi(valor: unknown, unidade?: UnidadeKpi): string {
  if (valor == null || valor === '') return '—';
  const n = typeof valor === 'number' ? valor : Number(valor);
  if (!Number.isFinite(n)) return '—';

  if (ehMoeda(unidade)) {
    // ⚠️ Sem centavos quando o valor é inteiro: R$ 871.406 é o que a pessoa lê
    // em voz alta numa reunião. Com centavos, só quando eles existem — truncar
    // um valor que TEM centavos esconderia diferença real.
    const temCentavos = Math.abs(n % 1) > 1e-9;
    return n.toLocaleString('pt-BR', {
      style: 'currency', currency: 'BRL',
      minimumFractionDigits: temCentavos ? 2 : 0,
      maximumFractionDigits: temCentavos ? 2 : 0,
    });
  }

  // ⚠️ Percentual mantém 1 casa quando ela existe (28,1% é diferente de 28%),
  // e some quando é inteiro (30% e não 30,0%).
  const casas = Math.abs(n % 1) > 1e-9 ? 1 : 0;
  const num = n.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });

  if (ehPercent(unidade)) return `${num}%`;

  const u = String(unidade || '').trim();
  if (!u || SEM_SUFIXO.has(u)) return num;
  return `${num} ${u}`;
}

/**
 * A meta, escrita do mesmo jeito que o valor — senão a comparação lado a lado
 * ("871406 · meta 30") fica ilegível, que é exatamente o que estava na tela.
 */
export function formatarMetaKpi(meta: unknown, unidade?: UnidadeKpi): string | null {
  if (meta == null || meta === '') return null;
  const txt = formatarValorKpi(meta, unidade);
  return txt === '—' ? null : `meta ${txt}`;
}
