// ============================================================================
// Conferência NOME × NÚMERO das decisões, SEPARADA POR TIPO
// ----------------------------------------------------------------------------
// Pedido do Marcos (15/09/2026), depois de a Renata mostrar a tela: *"ela pode
// ao clicar em adicionar pessoas colocar se a conversão foi presencial ou
// online, e ela pode colocar uma conversão online mesmo que não tenha número
// preenchido como conversão online — tenho medo de no fim esses números serem
// computados pelo indicador errado."*
//
// ⚠️⚠️ O QUE A MEDIÇÃO MOSTROU (produção, 15/09) — o mecanismo é pior que o
// medo: a pessoa nominal NÃO vai para o indicador errado, ela não vai para
// indicador NENHUM.
//
//   · Todo KPI de conversão lê os AGREGADOS (`cultos.decisoes_presenciais` e
//     `cultos.decisoes_online`), nunca as linhas de `cultos_decisoes_pessoas`.
//   · `decisoes_online` só sobe por DOIS caminhos: o trigger do formulário
//     público (+1 por pessoa que preenche cbrio.org/decisao) e o campo
//     "Online · chat e outros" (`decisoes_online_extra`).
//   · Cadastrar o NOME com tipo `online` não toca em nenhum dos dois.
//
// ⇒ Medido: **9 pessoas** cadastradas à mão como decisão online, em 5 cultos;
// em 4 deles o número online declarado é ZERO. Essas 9 aparecem na jornada e na
// NSM (o trigger cria `cui_convertidos` com área online) e somem do KPI.
//
// ⚠️⚠️ E A MISTURA DE TIPOS ESCONDE FALTA. O card de cobertura compara o TOTAL
// (presencial + online) dos dois lados, então sobra de um tipo CANCELA falta do
// outro dentro do mesmo culto. Caso real de 13/09, Domingo 11:30:
//
//     declarado  presencial 8 · online 1   (total 9)
//     nomes      presencial 0 · online 2   (total 2)
//     gap total ................. 7        ← o que a tela mostrava
//     gap presencial ............ 8        ← a falta real
//
// É o MESMO defeito de sinal que o comentário de `VisualizacaoDecisoes.tsx` já
// registra (o -8 de 12/07 cancelando a falta de outro culto), agora acontecendo
// por TIPO dentro de um culto só.
//
// ⚠️ Esta régua NÃO soma nada sozinha, de propósito. Fazer o cadastro nominal
// incrementar o agregado produziria DUPLA CONTAGEM com quem preencheu o
// formulário público e também foi cadastrado à mão. Aqui ela só DECLARA a
// divergência; quem lança o número é gente, no campo que já existe.
// ============================================================================

export type ContagemDecisoes = {
  /** `cultos.decisoes_presenciais` — digitado pela Integração. */
  declaradoPresencial: number | null | undefined;
  /** `cultos.decisoes_online` — TOTAL (formulário + chat). */
  declaradoOnline: number | null | undefined;
  /** Linhas de `cultos_decisoes_pessoas` com `tipo_decisao = 'presencial'`. */
  nomesPresencial: number;
  /** Linhas com `tipo_decisao = 'online'`. */
  nomesOnline: number;
};

export type DivergenciaTipo = {
  tipo: 'presencial' | 'online';
  declarado: number;
  nomes: number;
  /** > 0 = faltam nomes · < 0 = há mais nomes que o número declarado. */
  gap: number;
  faltamNomes: number;
  sobramNomes: number;
};

export type Cobertura = {
  presencial: DivergenciaTipo;
  online: DivergenciaTipo;
  /** Só os tipos que divergem — é o que a tela mostra. */
  divergentes: DivergenciaTipo[];
  /** Há nome online sem o número correspondente (o caso que o Marcos temia). */
  nomesOnlineSemNumero: boolean;
};

/** `null`/`undefined`/lixo viram 0 — "não lançado" e "lançou zero" pesam igual
 *  na conferência: nos dois casos não há número cobrindo aquele nome. */
function n(v: unknown): number {
  const x = Number(v);
  return Number.isFinite(x) && x > 0 ? Math.trunc(x) : 0;
}

function divergencia(
  tipo: 'presencial' | 'online',
  declarado: number,
  nomes: number,
): DivergenciaTipo {
  const gap = declarado - nomes;
  return {
    tipo,
    declarado,
    nomes,
    gap,
    faltamNomes: Math.max(0, gap),
    sobramNomes: Math.max(0, -gap),
  };
}

/**
 * Compara nome × número **dentro de cada tipo**.
 *
 * ⚠️⚠️ NUNCA somar os dois tipos antes de comparar: é isso que faz a sobra de
 * um cancelar a falta do outro. Cada tipo alimenta um indicador diferente, e a
 * conferência tem de ter a mesma granularidade do indicador que ela protege.
 */
export function conferirCobertura(c: ContagemDecisoes): Cobertura {
  const presencial = divergencia('presencial', n(c.declaradoPresencial), n(c.nomesPresencial));
  const online = divergencia('online', n(c.declaradoOnline), n(c.nomesOnline));
  return {
    presencial,
    online,
    divergentes: [presencial, online].filter((d) => d.gap !== 0),
    // ⚠️ `sobramNomes > 0` e não `declarado === 0`: com 1 declarado e 3 nomes,
    // duas pessoas seguem invisíveis para o KPI — o caso não é só o zero.
    nomesOnlineSemNumero: online.sobramNomes > 0,
  };
}

/**
 * Frase para a tela. `null` quando está tudo conferido — aviso que aparece
 * sempre deixa de ser lido, e aqui o silêncio é informação: os dois lados batem.
 */
export function textoDivergencia(cob: Cobertura): string | null {
  const partes: string[] = [];

  // ⚠️ A ordem não é estética: o online vem primeiro porque é o caso em que o
  // número NÃO é digitável direto (ele vem do formulário ou do campo do chat),
  // então é o que a pessoa não resolve sozinha sem saber onde mexer.
  if (cob.online.sobramNomes > 0) {
    partes.push(
      `${cob.online.sobramNomes} ${cob.online.sobramNomes === 1 ? 'nome online cadastrado não está' : 'nomes online cadastrados não estão'} no número de decisões online`
      + ` (${cob.online.nomes} ${cob.online.nomes === 1 ? 'nome' : 'nomes'} × ${cob.online.declarado} no total).`
      + ' Lance em "Online · chat e outros" — cadastrar o nome não soma sozinho.',
    );
  } else if (cob.online.faltamNomes > 0) {
    partes.push(`faltam ${cob.online.faltamNomes} ${cob.online.faltamNomes === 1 ? 'nome' : 'nomes'} de decisão online.`);
  }

  if (cob.presencial.faltamNomes > 0) {
    partes.push(`faltam ${cob.presencial.faltamNomes} ${cob.presencial.faltamNomes === 1 ? 'nome' : 'nomes'} de decisão presencial.`);
  } else if (cob.presencial.sobramNomes > 0) {
    partes.push(
      `${cob.presencial.sobramNomes} ${cob.presencial.sobramNomes === 1 ? 'nome presencial cadastrado não está' : 'nomes presenciais cadastrados não estão'} no número de decisões presenciais.`,
    );
  }

  return partes.length ? partes.join(' E ') : null;
}
