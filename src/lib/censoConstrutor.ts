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
