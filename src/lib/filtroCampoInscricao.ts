/**
 * Filtro da lista de inscritos pelos CAMPOS EXTRAS do form-builder do evento
 * (ex.: "Em qual ministério você serve?" do Celebra 2026).
 *
 * A resposta vive em `inscricoes.dados[<key>]`, não em coluna — então quem
 * define as opções do filtro é o próprio evento, e o mesmo código serve
 * qualquer evento sem precisar de caso especial por evento.
 *
 * ⚠️⚠️ AS OPÇÕES SÃO O CATÁLOGO ∪ O QUE ESTÁ RESPONDIDO, nunca só o catálogo.
 * Medido no Celebra 2026 em 10/08/2026: 209 inscritos, e **"Cuidados - Bazar"
 * (1 pessoa) NÃO está entre as 19 opções do formulário** — opção que mudou
 * depois de alguém já ter respondido. Montar o filtro só com `campos[].opcoes`
 * deixaria essa pessoa inalcançável por qualquer filtro, que é a classe de bug
 * "some em silêncio" (a mesma razão pela qual o Resumo do NPS semeia as barras
 * com `opcoes[] ∪ valores observados`).
 *
 * ⚠️ E existe resposta AUSENTE mesmo em campo obrigatório (1 inscrito do
 * Celebra) — daí a opção própria "sem resposta". Sem ela, filtrar por qualquer
 * ministério faria essa pessoa desaparecer da tela sem explicação.
 */

/** Tipos do form-builder que têm conjunto FECHADO de respostas (Inscricoes.tsx). */
export const TIPOS_FILTRAVEIS = new Set(['select', 'escolha', 'multi']);

/** Valor sentinela do "sem resposta" no <select> do filtro. */
export const SEM_RESPOSTA = '__sem_resposta__';

/** Valor sentinela de "não filtrar por este campo". */
export const TODOS = '';

export type OpcaoFiltro = {
  /** Valor CRU, do jeito que está gravado — é por ele que se compara. */
  valor: string;
  /** Texto exibido (espaços colapsados). NUNCA usado pra comparar. */
  rotulo: string;
  total: number;
  /** true quando o valor não está no catálogo do formulário. */
  foraDoCatalogo: boolean;
};

export type CampoFiltravel = {
  key: string;
  label: string;
  multiplo: boolean;
  opcoes: OpcaoFiltro[];
  semResposta: number;
};

/**
 * ⚠️ Só colapsa espaço pra EXIBIR. O valor gravado no Celebra é
 * `"Check-in  - Voluntariado"` com DOIS espaços; comparar pelo rótulo
 * normalizado não casaria com o dado e o filtro devolveria zero.
 */
function rotuloDe(valor: string): string {
  return String(valor).replace(/\s+/g, ' ').trim();
}

/**
 * Respostas de um inscrito para um campo, sempre como lista (campo `multi`
 * grava array). Vazio = não respondeu.
 */
export function valoresDaResposta(dados: any, key: string): string[] {
  const v = dados?.[key];
  if (v == null) return [];
  const lista = Array.isArray(v) ? v : [v];
  return lista
    .filter(x => x != null && typeof x !== 'object')
    .map(x => String(x))
    .filter(x => x.trim() !== '');
}

/**
 * Monta os filtros disponíveis a partir da definição do evento + do que os
 * inscritos responderam de fato.
 *
 * Ordem das opções: a do FORMULÁRIO primeiro (a sequência é escolha de quem
 * montou o evento), e os valores fora do catálogo no fim, marcados — mesma
 * régua da lista impressa, onde chave desconhecida vai pro fim em vez de
 * desaparecer.
 */
export function camposFiltraveis(campos: any[], inscritos: any[]): CampoFiltravel[] {
  const defs = (campos || []).filter(c => c && c.key && TIPOS_FILTRAVEIS.has(String(c.tipo)));
  if (!defs.length) return [];

  return defs.map(c => {
    const key = String(c.key);
    const contagem = new Map<string, number>();
    let semResposta = 0;

    for (const i of inscritos || []) {
      const vals = valoresDaResposta(i?.dados, key);
      if (!vals.length) { semResposta++; continue; }
      // `multi`: a pessoa conta em cada opção que marcou.
      for (const v of new Set(vals)) contagem.set(v, (contagem.get(v) || 0) + 1);
    }

    const doCatalogo = (c.opcoes || [])
      .filter((o: any) => o != null && String(o).trim() !== '')
      .map((o: any) => String(o));
    const vistos = new Set(doCatalogo);

    const opcoes: OpcaoFiltro[] = doCatalogo.map(valor => ({
      valor,
      rotulo: rotuloDe(valor),
      total: contagem.get(valor) || 0,
      foraDoCatalogo: false,
    }));

    // O que foi respondido e o catálogo não conhece (opção renomeada/removida).
    for (const [valor, total] of contagem) {
      if (vistos.has(valor)) continue;
      opcoes.push({ valor, rotulo: rotuloDe(valor), total, foraDoCatalogo: true });
    }

    return {
      key,
      label: String(c.label || key),
      multiplo: String(c.tipo) === 'multi',
      opcoes,
      semResposta,
    };
  }).filter(c => c.opcoes.length > 0 || c.semResposta > 0);
}

/**
 * Aplica os filtros escolhidos. `filtros` é `{ [key]: valor }`; valor vazio
 * (TODOS) não filtra. Vários campos combinam em E — quem filtra por dois
 * campos espera as duas condições, não a união.
 */
export function aplicarFiltroCampos<T extends { dados?: any }>(
  inscritos: T[],
  filtros: Record<string, string>,
): T[] {
  const ativos = Object.entries(filtros || {}).filter(([, v]) => v != null && v !== TODOS);
  if (!ativos.length) return inscritos || [];

  return (inscritos || []).filter(i =>
    ativos.every(([key, alvo]) => {
      const vals = valoresDaResposta(i?.dados, key);
      if (alvo === SEM_RESPOSTA) return vals.length === 0;
      return vals.includes(alvo); // comparação pelo valor CRU
    }),
  );
}

/** Quantos filtros de campo estão ativos (pra rótulo de "limpar filtros"). */
export function contarFiltrosAtivos(filtros: Record<string, string>): number {
  return Object.values(filtros || {}).filter(v => v != null && v !== TODOS).length;
}
