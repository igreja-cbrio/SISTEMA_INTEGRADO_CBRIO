// ============================================================================
// Genesis CBA · série PERMANENTE de eventos em igrejas parceiras (24/09/2026)
// ============================================================================
// Cada Genesis é uma EDIÇÃO da série `genesis` com data e igreja sede. As
// perguntas padrão da CBA moram no backend (backend/utils/genesisCba.js), que é
// quem cria a edição. Aqui fica só o que é de tela.
// ============================================================================

/**
 * Caminho público do formulário. Evento de igreja parceira sai por
 * `/genesis/:slug`; o resto, `/evento/:slug`. As duas rotas abrem a MESMA
 * página — o que muda é o endereço divulgado.
 */
export function caminhoPublicoEvento(ev: { slug?: string | null; igreja_id?: string | null }): string {
  const slug = String(ev?.slug || '').trim();
  if (!slug) return '';
  return ev?.igreja_id ? `/genesis/${slug}` : `/evento/${slug}`;
}

export type EdicaoGenesis = {
  igreja_id?: string | null;
  igreja?: { nome?: string | null } | null;
  data?: string | null;
  inscritos?: number | null;
};

/**
 * "Em quais igrejas fizemos o Genesis": uma linha por igreja, com quantos
 * Genesis, quantos inscritos e a data do mais recente. Igreja casa pelo ID
 * (nome repete e muda); edição sem igreja fica numa linha própria, declarada.
 */
export function agruparPorIgreja(edicoes: EdicaoGenesis[]) {
  const mapa = new Map<string, { chave: string; nome: string; edicoes: number; inscritos: number; ultima: string | null }>();
  for (const e of edicoes || []) {
    const chave = e.igreja_id || 'sem-igreja';
    const atual = mapa.get(chave) || {
      chave, nome: e.igreja?.nome || (e.igreja_id ? 'Igreja' : 'Sem igreja definida'),
      edicoes: 0, inscritos: 0, ultima: null,
    };
    atual.edicoes += 1;
    atual.inscritos += Number(e.inscritos) || 0;
    if (e.data && (!atual.ultima || e.data > atual.ultima)) atual.ultima = e.data;
    mapa.set(chave, atual);
  }
  return [...mapa.values()].sort((a, b) => b.edicoes - a.edicoes || a.nome.localeCompare(b.nome));
}
