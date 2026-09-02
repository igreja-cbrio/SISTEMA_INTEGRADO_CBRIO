// ════════════════════════════════════════════════════════════════════════════
//  Média de arrecadação mensal — aba "Mensal" do Dashboard Semanal.
//
//  Pedido do Matheus (02/09/2026): "gostaria que tivesse nessa aba média de
//  arrecadação mensal, e que o nome da aba fosse Mensal ao invés de Tendência."
//
//  ⚠️⚠️ POR QUE ISTO NÃO É `total / 12`. O endpoint `/arrecadacao-anual` SEMPRE
//  devolve 12 meses, preenchendo com `receita: 0` o que não tem dado. Medido em
//  02/09/2026 sobre 2026 (8 meses fechados, setembro com 2 dias):
//
//    total / 12 ......................... R$   897.737   −33%
//    incluindo setembro em curso ........ R$ 1.196.982   −11%
//    só os 8 meses FECHADOS ............. R$ 1.339.963   ✅
//
//  Dividir por 12 em setembro não é "média conservadora", é média errada: ela
//  conta outubro, novembro e dezembro como R$ 0 arrecadado. E incluir o mês em
//  curso faz a média CAIR todo dia 1º e subir ao longo do mês — o número mudaria
//  de sentido conforme o dia em que a TV estivesse ligada.
//
//  ⚠️⚠️ POR QUE A MEDIANA ANDA JUNTO. Um único mês de campanha distorce a média:
//  julho/2026 fechou em R$ 3,06 mi, dos quais **R$ 2,08 mi são extraordinária**
//  (a ordinária de julho, R$ 976 mil, é normal — abaixo da média). Efeito medido:
//
//                       média          mediana      distância
//    com extraordinária   R$ 1.339.963   R$ 1.142.653   17%
//    sem extraordinária   R$ 1.017.975   R$ 1.003.718    1,4%
//
//  A distorção é INTEIRAMENTE a extraordinária — e o interruptor global "sem
//  extraordinárias" já existe nesta tela e já chega aqui, porque a média é
//  calculada sobre o MESMO array `meses` que o endpoint já devolveu filtrado.
//  Mostrar a mediana ao lado é o que impede ler um mês de campanha como o novo
//  normal, sem precisar de nenhuma detecção de outlier "inteligente".
//
//  ⚠️ Lei da casa aplicada: "todo corte mostra a BASE ao lado do número". A média
//  nunca aparece sozinha — vem com quantos meses a produziram.
// ════════════════════════════════════════════════════════════════════════════

export type MesArrecadacao = {
  /** 'AAAA-MM' */
  mes?: string;
  mes_label?: string;
  receita?: number;
};

export type MediaMensal = {
  /** Média sobre os meses fechados COM dado. `null` quando não há nenhum. */
  media: number | null;
  /** Mediana dos mesmos meses. `null` junto com a média. */
  mediana: number | null;
  /** ⚠️ A BASE — quantos meses produziram o número. Nunca omitir na tela. */
  base: number;
  /** Rótulos dos meses que entraram, na ordem. */
  meses: string[];
  /** Rótulo do mês em curso que ficou DE FORA (para a tela poder dizer). */
  emCurso: string | null;
  /**
   * Distância relativa entre média e mediana. Acima de ~0,1 significa que um
   * mês isolado está puxando a média — a tela avisa em vez de esconder.
   */
  assimetria: number;
  /** Rótulo do maior mês (o suspeito quando `assimetria` é alta). */
  maiorMes: string | null;
};

const VAZIO: MediaMensal = {
  media: null, mediana: null, base: 0, meses: [],
  emCurso: null, assimetria: 0, maiorMes: null,
};

/**
 * ⚠️ "Fechado" por comparação de string 'AAAA-MM' contra o mês corrente. Trata
 * ano passado (tudo fechado), ano corrente (parcial) e ano futuro (nada
 * fechado) com a MESMA regra — sem ramo especial por ano, que é onde este tipo
 * de conta costuma errar.
 */
export function mesCorrenteISO(hoje: Date = new Date()): string {
  return `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}`;
}

export function calcularMediaMensal(
  meses: MesArrecadacao[] | null | undefined,
  hoje: Date = new Date(),
): MediaMensal {
  if (!Array.isArray(meses) || meses.length === 0) return VAZIO;

  const corrente = mesCorrenteISO(hoje);
  let emCurso: string | null = null;
  const usados: { label: string; receita: number }[] = [];

  for (const m of meses) {
    const chave = typeof m?.mes === 'string' ? m.mes.slice(0, 7) : '';
    const receita = Number(m?.receita);
    const label = m?.mes_label || chave || '—';

    if (chave === corrente) {
      // ⚠️ Só anuncia "em curso" se houver dado — mês corrente zerado é mês sem
      // lançamento nenhum, e dizer "setembro está fora" sobre um mês vazio
      // sugere que existe algo escondido lá.
      if (Number.isFinite(receita) && receita > 0) emCurso = label;
      continue;
    }
    if (!chave || chave > corrente) continue;          // futuro nunca entra
    if (!Number.isFinite(receita) || receita <= 0) continue; // sem dado ≠ zero
    usados.push({ label, receita });
  }

  if (usados.length === 0) return { ...VAZIO, emCurso };

  const valores = usados.map((u) => u.receita);
  const soma = valores.reduce((a, b) => a + b, 0);
  const media = soma / valores.length;

  const ord = [...valores].sort((a, b) => a - b);
  const meio = Math.floor(ord.length / 2);
  const mediana = ord.length % 2 === 1 ? ord[meio] : (ord[meio - 1] + ord[meio]) / 2;

  const maior = usados.reduce((a, b) => (b.receita > a.receita ? b : a), usados[0]);

  return {
    media,
    mediana,
    base: usados.length,
    meses: usados.map((u) => u.label),
    emCurso,
    assimetria: mediana > 0 ? Math.abs(media - mediana) / mediana : 0,
    maiorMes: maior.label,
  };
}

/**
 * ⚠️ O limiar de aviso. Abaixo disso média e mediana contam a mesma história e o
 * aviso seria ruído; acima, um mês isolado está mandando no número. Medido em
 * 2026: 17% com extraordinária × 1,4% sem — o corte em 10% separa os dois casos
 * com folga nos dois lados.
 */
export const LIMIAR_ASSIMETRIA = 0.1;

export function mediaPuxadaPorUmMes(r: MediaMensal): boolean {
  return r.base >= 3 && r.assimetria > LIMIAR_ASSIMETRIA;
}

/** Frase da base, para não deixar a média aparecer sozinha na tela. */
export function textoBase(r: MediaMensal): string {
  if (r.base === 0) return 'sem mês fechado com dado';
  const plural = r.base === 1 ? 'mês fechado' : 'meses fechados';
  return r.emCurso
    ? `${r.base} ${plural} · ${r.emCurso} em curso está fora`
    : `${r.base} ${plural}`;
}
