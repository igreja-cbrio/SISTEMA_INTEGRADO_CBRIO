// ============================================================================
// lib/jornadaMarcadores · APRESENTAÇÃO dos marcadores de jornada (ERP)
// ============================================================================
// Só cor/rótulo/tooltip. A RÉGUA (o que é marcador, o que é sensível, quem pode
// ver) vive em `backend/utils/jornadaMarcadores.js` e é aplicada no SERVIDOR —
// filtrar no cliente seria maquiagem, o dado já teria saído pela rede.
//
// ⚠️ As chaves aqui têm que cobrir EXATAMENTE as do catálogo do backend. Há um
// teste no gate (`src/test/jornadaMarcadores.test.ts`) que compara os dois: um
// marcador novo no backend sem entrada aqui apareceria como flag sem nome.
//
// ⚠️ As cores espelham as flags que a Membresia já mostrava (VOL violeta, GRP
// azul, NXT verde, CTB rosa) de propósito — a equipe já lê essas cores.
// ============================================================================

export type ChaveMarcador =
  | 'batismo' | 'next' | 'grupo' | 'servir' | 'devocional' | 'generosidade';

export interface MarcadorUI {
  /** Sigla curta, pra linha de lista. */
  curto: string;
  /** Rótulo por extenso, pra ficha. */
  label: string;
  /** Vira o `title` (tooltip nativo). */
  ajuda: string;
  cor: string;
  fundo: string;
}

export const MARCADOR_UI: Record<ChaveMarcador, MarcadorUI> = {
  batismo: {
    curto: 'BAT', label: 'Batizado',
    ajuda: 'O sistema tem registro de batismo realizado.',
    cor: '#0369a1', fundo: '#e0f2fe',
  },
  next: {
    curto: 'NEXT', label: 'Fez o Next',
    ajuda: 'Concluiu o Next (aula 1 e aula 2, em qualquer turma).',
    cor: '#065f46', fundo: '#d1fae5',
  },
  grupo: {
    curto: 'GRUPO', label: 'Em grupo de conexão',
    ajuda: 'Tem vínculo ativo em algum grupo de conexão.',
    cor: '#1e3a8a', fundo: '#dbeafe',
  },
  servir: {
    curto: 'SERVE', label: 'Serve como voluntário',
    ajuda: 'Tem vínculo de voluntariado em aberto.',
    cor: '#6b21a8', fundo: '#ede9fe',
  },
  devocional: {
    curto: 'DEVO', label: 'Devocional em dia',
    ajuda: 'Registrou devocional concluído nos últimos 90 dias.',
    cor: '#92400e', fundo: '#fef3c7',
  },
  generosidade: {
    curto: 'CONTRIB', label: 'Contribui',
    ajuda: 'Registrou dízimo ou oferta nos últimos 90 dias.',
    cor: '#831843', fundo: '#fce7f3',
  },
};

/** Payload que o backend anexa em cada pessoa. */
export interface Marcadores {
  chaves: ChaveMarcador[];
  detalhes?: Partial<Record<ChaveMarcador, string>>;
  sensiveis_ocultos?: boolean;
  /** Sinais que o servidor não conseguiu ler NESTA resposta (ver componente). */
  indisponiveis?: string[];
}

export const ORDEM_MARCADORES: ChaveMarcador[] =
  ['batismo', 'next', 'grupo', 'servir', 'devocional', 'generosidade'];

/**
 * ⚠️ O texto que a tela usa quando a pessoa não tem marcador nenhum.
 * NÃO dizer "não fez" — o sistema sabe o que tem REGISTRO, não o que a pessoa
 * viveu. Quem se batizou há 20 anos em outra igreja e nunca declarou aparece
 * aqui, e um líder que lê "não batizado" vai cobrar batismo dela.
 */
export const TEXTO_SEM_MARCADOR = 'Sem marcador registrado';

export const TEXTO_AJUDA_GERAL =
  'Marcadores mostram o que o sistema tem REGISTRO de. Não ter um marcador não '
  + 'significa que a pessoa não passou por aquela etapa — pode ser só falta de registro.';
