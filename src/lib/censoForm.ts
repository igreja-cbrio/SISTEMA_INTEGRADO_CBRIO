// Régua do formulário do censo NO CLIENTE.
//
// ⚠️ Isto é um espelho deliberado de `backend/utils/censoPerguntas.js`. O
// servidor é a autoridade — ele revalida tudo e é ele que decide o que entra no
// banco. Esta cópia existe só para o formulário saber o que mostrar e o que
// cobrar antes de enviar.
//
// Por que duplicar em vez de importar: o util do backend é CommonJS e nenhum
// arquivo de `src/` importa de `backend/` no bundle do cliente hoje (só os
// testes fazem isso). Puxá-lo para dentro do bundle seria um precedente que
// ninguém escolheu.
//
// O risco da duplicação — as duas divergirem e alguém ser barrado por uma
// pergunta obrigatória que nunca viu — está travado por
// `src/test/censoFormEspelho.test.ts`, que compara as duas implementações
// sobre o questionário real em centenas de combinações de resposta.

export type Pergunta = {
  id: string;
  tipo: string;
  texto: string;
  descricao?: string;
  obrigatoria?: boolean;
  opcoes?: string[];
  opcoes_neutras?: string[];
  rotulos?: { min?: string; max?: string };
  max?: number;
  min_num?: number;
  max_num?: number;
  formato?: string;
  mostrar_se?: { pergunta: string; valores: string[] };
  sensivel?: boolean;
  acao?: string;
  cuidado_tipo?: string;
  permite_nao_se_aplica?: boolean;
  preenche_de?: string;
  /** Tipo `busca`: qual catálogo consultar ('igrejas_rj' | 'grupos_ativos').
   *  As opções NÃO vivem na pergunta — 1.911 igrejas em cada abertura do
   *  questionário seria absurdo; vêm por /catalogo/:nome?q=. */
  catalogo?: string;
  /** Tipo `busca`: aceita valor fora do catálogo. Verdadeiro por padrão, porque
   *  lista incompleta sem escape faz a pessoa responder qualquer coisa só para
   *  poder avançar. */
  permite_outro?: boolean;
};

export type Respostas = Record<string, unknown>;

export const NAO_SE_APLICA = 'Não se aplica';
export const TIPOS_SEM_RESPOSTA = ['secao'];

/** A pergunta aparece, dadas as respostas até agora? */
export function visivel(p: Pergunta, respostas: Respostas): boolean {
  const cond = p?.mostrar_se;
  if (!cond?.pergunta) return true;
  const bruto = respostas?.[cond.pergunta];
  if (bruto === undefined || bruto === null) return false;
  const dadas = (Array.isArray(bruto) ? bruto : [bruto]).map((v) => String(v).trim());
  return cond.valores.some((v) => dadas.includes(String(v).trim()));
}

export function ehNeutra(p: Pergunta, valor: unknown): boolean {
  const v = String(valor ?? '').trim();
  if (p?.permite_nao_se_aplica === true && v === NAO_SE_APLICA) return true;
  return (p?.opcoes_neutras || []).includes(v);
}

/**
 * "Prefiro não dizer" é exclusiva: marcar junto com outra opção é
 * contraditório. O servidor aplica a mesma regra — aqui é só para a pessoa ver
 * acontecer na hora.
 */
export function aplicarNeutraExclusiva(p: Pergunta, valores: unknown[]): string[] {
  const opts = (valores || []).map((v) => String(v ?? '').trim()).filter(Boolean);
  const neutra = opts.find((o) => ehNeutra(p, o));
  return neutra ? [neutra] : opts;
}

/** Alterna uma opção numa múltipla, respeitando a exclusividade da neutra. */
export function alternarOpcao(p: Pergunta, atuais: unknown, opcao: string): string[] {
  const lista = Array.isArray(atuais) ? atuais.map(String) : [];
  const jaTem = lista.includes(opcao);
  // Clicar na neutra limpa o resto; clicar em outra remove a neutra.
  if (ehNeutra(p, opcao)) return jaTem ? [] : [opcao];
  const semNeutra = lista.filter((o) => !ehNeutra(p, o));
  return jaTem ? semNeutra.filter((o) => o !== opcao) : [...semNeutra, opcao];
}

function vazio(v: unknown): boolean {
  return v === undefined || v === null
    || (typeof v === 'string' && v.trim() === '')
    || (Array.isArray(v) && v.length === 0);
}

/**
 * Obrigatórias VISÍVEIS ainda sem resposta. A palavra "visíveis" é a regra
 * inteira: cobrar uma pergunta que a pessoa nunca viu trava o formulário sem
 * que ela tenha como descobrir o porquê.
 */
export function faltando(perguntas: Pergunta[], respostas: Respostas): Pergunta[] {
  return (perguntas || []).filter((p) => (
    !TIPOS_SEM_RESPOSTA.includes(p.tipo)
    && p.obrigatoria === true
    && visivel(p, respostas)
    && vazio(respostas[p.id])
  ));
}

export type Bloco = { titulo: string; perguntas: Pergunta[] };

/**
 * Quebra o questionário em blocos pelas seções. Um bloco por tela: 93 campos
 * numa rolagem única é o caminho mais curto para a pessoa desistir.
 * Blocos sem nenhuma pergunta visível somem — é o que faz o formulário encurtar
 * de verdade para quem não é casado, não tem filhos ou não serve.
 */
export function blocosVisiveis(perguntas: Pergunta[], respostas: Respostas): Bloco[] {
  const blocos: Bloco[] = [];
  let atual: Bloco | null = null;
  for (const p of perguntas || []) {
    if (p.tipo === 'secao') { atual = { titulo: p.texto, perguntas: [] }; blocos.push(atual); continue; }
    if (!visivel(p, respostas)) continue;
    if (!atual) { atual = { titulo: '', perguntas: [] }; blocos.push(atual); }
    atual.perguntas.push(p);
  }
  return blocos.filter((b) => b.perguntas.length > 0);
}

/** Quantas respondidas de quantas visíveis — alimenta a barra de progresso. */
export function progresso(perguntas: Pergunta[], respostas: Respostas): { feitas: number; total: number; pct: number } {
  const visiveis = (perguntas || []).filter(
    (p) => !TIPOS_SEM_RESPOSTA.includes(p.tipo) && visivel(p, respostas),
  );
  const feitas = visiveis.filter((p) => !vazio(respostas[p.id])).length;
  const total = visiveis.length;
  return { feitas, total, pct: total ? Math.round((feitas / total) * 100) : 0 };
}

/**
 * Limpa resposta de pergunta que ficou invisível depois de a pessoa voltar e
 * mudar uma condicional. Sem isto, "tenho filhos: não" ainda mandaria o número
 * de filhos digitado antes — o servidor descartaria, mas o progresso mentiria.
 */
export function limparInvisiveis(perguntas: Pergunta[], respostas: Respostas): Respostas {
  const out: Respostas = {};
  for (const p of perguntas || []) {
    if (TIPOS_SEM_RESPOSTA.includes(p.tipo)) continue;
    if (respostas[p.id] !== undefined && visivel(p, respostas)) out[p.id] = respostas[p.id];
  }
  return out;
}
