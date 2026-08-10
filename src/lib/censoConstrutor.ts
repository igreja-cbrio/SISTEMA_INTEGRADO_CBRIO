// Regras PURAS do construtor de perguntas do censo.
//
// Moram aqui, e não no componente, por dois motivos: o linter avisa (arquivo que
// exporta componente e função quebra o fast refresh) e — o que importa mais —
// estas três funções são as que podem DESTRUIR dado já coletado se errarem. Regra
// dessas merece ser testada sozinha, sem depender de conseguir clicar num Select.
//
// A regra que manda: o `id` da pergunta é a coluna da resposta no banco
// (`cen_resposta_item.pergunta_id`). Se ele mudar, as respostas viram órfãs e o
// gráfico daquela pergunta zera — sem erro na tela, só um número que some.

export type Pergunta = {
  /** Coluna da resposta no banco. IMUTÁVEL depois da primeira gravação.
   *  Ausente = pergunta nova; o servidor gera a partir do texto. */
  id?: string;
  tipo: string;
  texto: string;
  descricao?: string;
  obrigatoria?: boolean;
  opcoes?: string[];
  /** Opções que NÃO são resposta ("Prefiro não dizer"): saem de médias e
   *  percentuais, e numa múltipla limpam as outras marcações. */
  opcoes_neutras?: string[];
  rotulos?: { min?: string; max?: string };
  max?: number;
  min_num?: number;
  max_num?: number;
  formato?: string;
  /** Condicional. Só pode apontar para uma pergunta ANTERIOR. */
  mostrar_se?: { pergunta: string; valores: string[] };
  /** Bloco sensível: agregado é livre, nominal só para a equipe de cuidado. */
  sensivel?: boolean;
  /** 'cuidado' = pedido de ajuda. Vira fila, não gráfico. */
  acao?: string;
  cuidado_tipo?: string;
  permite_nao_se_aplica?: boolean;
  /** Campo do cadastro que esta pergunta preenche (ex.: 'telefone'). */
  preenche_de?: string;
};

const COM_OPCOES = ['opcao_unica', 'multipla'];
const ESCALAS = ['escala_5', 'estrelas_5'];

/**
 * Troca o tipo de uma pergunta preservando o que é trabalho de verdade: o `id`
 * (coluna da resposta no banco), o texto e a condicional. Joga fora só o que não
 * faz sentido no tipo novo.
 * PURA de propósito: é a regra que, se errar, apaga dado coletado — e regra
 * dessas não deve depender de conseguir clicar num Select.
 */
export function trocarTipoPergunta(p: Pergunta, tipo: string): Pergunta {
  const limpo: Pergunta = {
    id: p.id, tipo, texto: p.texto, descricao: p.descricao,
    obrigatoria: p.obrigatoria, mostrar_se: p.mostrar_se, sensivel: p.sensivel,
  };
  if (COM_OPCOES.includes(tipo)) {
    limpo.opcoes = p.opcoes?.length ? p.opcoes : ['Opção 1', 'Opção 2'];
    const neutras = p.opcoes_neutras?.filter((n) => limpo.opcoes?.includes(n));
    if (neutras?.length) limpo.opcoes_neutras = neutras;
  }
  if (ESCALAS.includes(tipo)) {
    limpo.rotulos = p.rotulos;
    if (p.permite_nao_se_aplica) limpo.permite_nao_se_aplica = true;
  }
  if (tipo === 'nps') limpo.max = 10;
  if (tipo === 'numero') { limpo.min_num = p.min_num ?? 0; limpo.max_num = p.max_num ?? 99; }
  if (tipo === 'texto_curto') limpo.formato = p.formato;
  if (tipo === 'sim_nao' && p.acao === 'cuidado') {
    limpo.acao = 'cuidado'; limpo.cuidado_tipo = p.cuidado_tipo;
  }
  if (tipo === 'secao') { delete limpo.obrigatoria; delete limpo.sensivel; delete limpo.mostrar_se; }
  return limpo;
}

/**
 * Condicional só pode olhar para TRÁS. Reordenar de modo que uma pergunta fique
 * antes daquela de que ela depende cria um campo que nunca aparece.
 * Devolve a mensagem do problema, ou null.
 */
export function validarOrdem(lista: Pergunta[]): string | null {
  const vistos = new Set<string>();
  for (const p of lista) {
    const dep = p.mostrar_se?.pergunta;
    if (dep && !vistos.has(dep)) {
      return `“${p.texto}” só aparece dependendo de uma pergunta anterior. Nesta ordem ela ficaria antes da pergunta de que depende.`;
    }
    if (p.id) vistos.add(p.id);
  }
  return null;
}

/**
 * Move a pergunta da posição `de` para `para` e devolve a lista nova, ou o erro
 * que impede o movimento.
 *
 * ⚠️ MOVE, não troca. Subir/descer de 1 em 1 podia ser um swap (com vizinho dá
 * no mesmo), mas arrastar da posição 1 para a 6 com swap embaralharia as outras
 * quatro perguntas. É a diferença entre "reordenei uma" e "mexi em cinco".
 *
 * ⚠️ A ordem é validada AQUI, antes de aplicar: condicional só pode apontar
 * para pergunta anterior, e arrastar é justamente o gesto que mais fácil quebra
 * isso (o servidor recusaria no fim, com o trabalho já perdido de vista).
 *
 * `para` é saturado nas bordas em vez de recusado: soltar depois do último item
 * significa "põe no fim", não "cancela".
 */
export function moverPergunta(
  lista: Pergunta[],
  de: number,
  para: number,
): { lista: Pergunta[]; erro: string | null } {
  if (de < 0 || de >= lista.length) return { lista, erro: null };
  const destino = Math.max(0, Math.min(lista.length - 1, para));
  if (destino === de) return { lista, erro: null };

  const proximo = [...lista];
  const [movida] = proximo.splice(de, 1);
  proximo.splice(destino, 0, movida);

  const erro = validarOrdem(proximo);
  if (erro) return { lista, erro };
  return { lista: proximo, erro: null };
}

/**
 * Remove VÁRIAS perguntas de uma vez.
 *
 * ⚠️ A guarda é calculada sobre o que SOBRA, e isso muda o resultado: apagar a
 * pergunta "Tem filhos?" sozinha é proibido enquanto "Quantos?" depender dela —
 * mas apagar as DUAS juntas é legítimo. Reaproveitar a regra do apagar-um
 * (que olha a lista inteira) recusaria a seleção certa e obrigaria a pessoa a
 * apagar na ordem exata, sem dizer qual é.
 *
 * Devolve o erro nomeando quem ficaria órfã — "não é possível" sem dizer quem
 * é o mesmo que não explicar nada.
 */
export function removerPerguntas(
  lista: Pergunta[],
  indices: number[],
): { lista: Pergunta[]; erro: string | null } {
  const alvo = new Set(indices.filter((i) => i >= 0 && i < lista.length));
  if (!alvo.size) return { lista, erro: null };

  const idsRemovidos = new Set(
    [...alvo].map((i) => lista[i].id).filter((id): id is string => !!id),
  );
  const restantes = lista.filter((_, i) => !alvo.has(i));

  const orfas = restantes.filter(
    (q) => q.mostrar_se?.pergunta && idsRemovidos.has(q.mostrar_se.pergunta),
  );
  if (orfas.length) {
    const nomes = orfas.map((o) => `“${o.texto || 'sem texto'}”`).join(', ');
    return {
      lista,
      erro: `Não é possível apagar: ${nomes} ${orfas.length > 1 ? 'dependem' : 'depende'} de uma pergunta da seleção. Inclua ${orfas.length > 1 ? 'essas perguntas' : 'essa pergunta'} na seleção ou remova a condicional ${orfas.length > 1 ? 'delas' : 'dela'} primeiro.`,
    };
  }
  return { lista: restantes, erro: null };
}

/**
 * Reordena as OPÇÕES de resposta de uma pergunta.
 *
 * ⚠️ Seguro para dado já coletado: a resposta é gravada pelo TEXTO da opção
 * (`cen_resposta_item.valor_texto` / `valor_opcoes`), não pela posição — então
 * mudar a ordem não mexe em resposta nenhuma. Se algum dia a resposta passar a
 * guardar índice, esta função vira destrutiva e precisa de outra régua.
 *
 * ⚠️ `opcoes_neutras` também aponta pelo texto, por isso NÃO é tocada aqui —
 * reescrevê-la por índice é justamente o que faria a marca de "não conta"
 * pousar na opção errada.
 */
export function moverOpcao(p: Pergunta, de: number, para: number): Partial<Pergunta> {
  const opcoes = p.opcoes || [];
  if (de < 0 || de >= opcoes.length) return {};
  const destino = Math.max(0, Math.min(opcoes.length - 1, para));
  if (destino === de) return {};
  const proximo = [...opcoes];
  const [movida] = proximo.splice(de, 1);
  proximo.splice(destino, 0, movida);
  return { opcoes: proximo };
}

/** Quantas da seleção JÁ FORAM gravadas (têm id) — são as que têm resposta a perder. */
export function selecionadasComResposta(lista: Pergunta[], indices: number[]): number {
  const alvo = new Set(indices);
  return lista.filter((p, i) => alvo.has(i) && !!p.id).length;
}

/**
 * Para onde vai o índice da pergunta ABERTA depois de um movimento. Sem isto, o
 * painel expandido passa a mostrar a edição de OUTRA pergunta — e quem estava
 * editando não percebe que digitou no lugar errado.
 */
export function indiceApos(aberta: number | null, de: number, para: number): number | null {
  if (aberta === null) return null;
  if (aberta === de) return para;
  // arrastou de cima para baixo: quem está no meio sobe uma posição
  if (de < aberta && aberta <= para) return aberta - 1;
  // arrastou de baixo para cima: quem está no meio desce uma
  if (para <= aberta && aberta < de) return aberta + 1;
  return aberta;
}

/**
 * Renomear uma opção precisa renomear a marca de "não conta" junto — senão a
 * marca aponta para um texto que não existe mais e o servidor recusa a gravação.
 */
export function renomearOpcao(p: Pergunta, i: number, valor: string): Partial<Pergunta> {
  const opcoes = p.opcoes || [];
  const antigo = opcoes[i];
  const neutras = p.opcoes_neutras || [];
  return {
    opcoes: opcoes.map((o, j) => (j === i ? valor : o)),
    opcoes_neutras: neutras.map((n) => (n === antigo ? valor : n)),
  };
}
