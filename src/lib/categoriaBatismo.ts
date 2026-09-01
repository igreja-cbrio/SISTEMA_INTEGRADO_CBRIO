// Categoria etária do BATIZANDO — faixas da igreja (definidas em 19/08/2026):
//
//   Criança      0 a 12 anos, 11 meses e 29 dias   → idade < 13
//   Adolescente  13 a 17 anos, 11 meses e 29 dias  → 13 a 17
//   Jovem        18 a 25 anos, 11 meses e 29 dias  → 18 a 25
//   Adulto       26 em diante                      → 26+
//
// ⚠️ Espelho EXATO de `tg_batismo_categoria_etaria()` (migration
// 20260819160000). Mudou lá, muda aqui — duas réguas fariam a tag da tela
// discordar do que está gravado na tabela e do que o app do staff lê.
//
// ⚠️ Desde 19/08/2026 estas SÃO as faixas da igreja inteira (decisão do
// Matheus): este arquivo NÃO tem régua própria — ele delega a
// `faixaPorIdade` de `./faixaEtaria`, que é o espelho de `fn_faixa_etaria`.
// O que sobra aqui é só o que é específico do batismo: a ordem de precedência
// dos sinais (eh_crianca > data > coluna gravada), os rótulos com o intervalo e
// as cores da tag.
//
// ⚠️ A idade muda com o tempo, então a categoria é derivada da DATA a cada
// leitura. A coluna `categoria_etaria` do banco é snapshot do último
// insert/update e só entra quando não há data de nascimento.

import { idadeEmAnos, faixaPorIdade, type Faixa } from './faixaEtaria';

export type CategoriaEtaria = Faixa;

export const CATEGORIAS: CategoriaEtaria[] = ['crianca', 'adolescente', 'jovem', 'adulto'];

export const CATEGORIA_LABEL: Record<CategoriaEtaria, string> = {
  crianca: 'Criança',
  adolescente: 'Adolescente',
  jovem: 'Jovem',
  adulto: 'Adulto',
};

/** Rótulo com a faixa, para o seletor de filtro e para a legenda. */
export const CATEGORIA_LABEL_FAIXA: Record<CategoriaEtaria, string> = {
  crianca: 'Criança (até 12)',
  adolescente: 'Adolescente (13–17)',
  jovem: 'Jovem (18–25)',
  adulto: 'Adulto (26+)',
};

export const CATEGORIA_COR: Record<CategoriaEtaria, string> = {
  crianca: '#ec4899',      // rosa
  adolescente: '#a855f7',  // roxo
  jovem: '#f59e0b',        // âmbar
  adulto: '#0ea5e9',       // azul
};

/** Régua única do sistema — delega, não duplica. */
export const categoriaPorIdade = faixaPorIdade;

type Batizando = {
  data_nascimento?: string | null;
  eh_crianca?: boolean | null;
  categoria_etaria?: CategoriaEtaria | string | null;
};

/**
 * Categoria do batizando. A ordem é a mesma do trigger:
 *
 *   1. `eh_crianca = true` vence — é declaração de quem cadastrou, e o fluxo do
 *      Kids depende dela (criança de 13 anos marcada como criança continua
 *      criança para efeito de batismo).
 *   2. Data de nascimento → a régua.
 *   3. Sem data, a categoria gravada no banco (registro antigo, cadastro que
 *      não pediu nascimento).
 *
 * `agora` só existe para teste.
 */
export function categoriaBatismo(b: Batizando | null | undefined, agora?: Date): CategoriaEtaria | null {
  if (!b) return null;
  if (b.eh_crianca === true) return 'crianca';

  const porData = categoriaPorIdade(idadeEmAnos(b.data_nascimento, agora));
  if (porData) return porData;

  const salva = String(b.categoria_etaria || '') as CategoriaEtaria;
  return CATEGORIAS.includes(salva) ? salva : null;
}
