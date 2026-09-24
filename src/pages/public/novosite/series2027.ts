/**
 * CONTEÚDO da aba de Séries do site (cbrio.com.br/series).
 *
 * É o ÚNICO arquivo a editar para preencher/atualizar as séries do ano.
 * Nada aqui é "publicado" à mão: cada mensagem libera vídeo e PDF sozinha
 * quando a DATA dela chega (dia BRT · regra em src/lib/seriesSite.ts).
 *
 * Como preencher uma série:
 *   - titulo: null  → o card do mês aparece como "Série em breve".
 *   - slug: vira o endereço (/series/<slug>) · minúsculas, hífen, sem acento.
 *     ⚠️ NÃO trocar o slug depois de divulgado: link compartilhado quebra.
 *   - imagem: arte da série em /public/series/2027/<arquivo>.webp (opcional ·
 *     sem imagem o card usa o degradê de `cor`).
 *   - pdf / devocional.pdf / mensagem.pdf: arquivos em /public/series/2027/.
 *     Caminho começando com "/" (ex.: '/series/2027/fevereiro-guia.pdf').
 *   - youtube: o ID ou a URL do vídeo da pregação (entra depois do culto).
 *
 * ⚠️ Arquivo PÚBLICO: nada de nome de membro, telefone ou dado pessoal aqui.
 */

export type Mensagem = {
  /** 'YYYY-MM-DD' · dia do culto. Antes disso, a mensagem aparece como "em breve". */
  data: string;
  titulo: string;
  /** Texto bíblico abordado, ex.: 'João 3:1-21'. */
  texto: string;
  pregador?: string;
  resumo?: string;
  /** ID ou URL do YouTube. */
  youtube?: string;
  /** PDF da mensagem (esboço/anotações). */
  pdf?: string;
};

export type Devocional = {
  titulo: string;
  descricao?: string;
  /** PDF do devocional da série. */
  pdf?: string;
  /** Link externo (ex.: plano no app). */
  url?: string;
};

export type Serie = {
  slug: string;
  mes: number; // 1..12
  titulo: string | null;
  subtitulo?: string;
  /** Objetivo da série (o "por quê" que os pastores definiram). */
  objetivo?: string;
  /** Textos bíblicos-base da série. */
  textos?: string[];
  /** Duas cores do degradê do card quando não há imagem. */
  cor: [string, string];
  imagem?: string;
  /** PDF geral da série (guia de estudo, material para grupos). */
  pdf?: string;
  devocional?: Devocional;
  mensagens: Mensagem[];
};

export const ANO_SERIES = 2027;

/** Tema anual (vem dos pastores). `titulo: null` esconde o bloco. */
export const TEMA_ANUAL: { titulo: string | null; descricao?: string; versiculo?: string; referencia?: string } = {
  titulo: null,
  descricao: undefined,
  versiculo: undefined,
  referencia: undefined,
};

const CORES: [string, string][] = [
  ['#00839D', '#00ACB3'], ['#2F4858', '#00839D'], ['#8E9562', '#C9B37E'],
  ['#00ACB3', '#7CC6C2'], ['#5B4B8A', '#00839D'], ['#B5654A', '#E0A46B'],
  ['#1F6F78', '#8E9562'], ['#00839D', '#2F4858'], ['#9C4F5B', '#D98A7E'],
  ['#3E6B48', '#8E9562'], ['#2F4858', '#5B4B8A'], ['#B5654A', '#00839D'],
];

const SLUG_MES = ['janeiro', 'fevereiro', 'marco', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

/** Uma série por mês. Troque os placeholders pelo conteúdo real. */
export const SERIES: Serie[] = SLUG_MES.map((s, i) => ({
  slug: `${s}-${ANO_SERIES}`,
  mes: i + 1,
  titulo: null,
  cor: CORES[i],
  mensagens: [],
}));

/** Fundo do card/hero: a arte da série, ou o degradê de `cor` sem arte. */
export function fundoSerie(s: Serie): { backgroundImage: string } {
  return s.imagem
    ? { backgroundImage: `linear-gradient(180deg, rgba(0,0,0,.05), rgba(0,30,40,.55)), url(${s.imagem})` }
    : { backgroundImage: `linear-gradient(135deg, ${s.cor[0]}, ${s.cor[1]})` };
}
