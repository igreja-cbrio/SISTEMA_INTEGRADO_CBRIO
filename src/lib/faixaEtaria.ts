// Faixa etária da IGREJA — espelho EXATO de `public.fn_faixa_etaria(date)`
// (migration 20260819180000):
//
//   < 13 → crianca · 13–17 → adolescente · 18–25 → jovem · 26+ → adulto
//
// ⚠️ Faixas definidas pelo Matheus em 19/08/2026 ("essa régua deve ser para a
// igreja toda"), em cima do que já valia no batismo. Antes, aqui, jovem ia até
// 30 e adulto começava em 31 — 154 membros de 26 a 30 anos mudaram de faixa na
// Membresia e no painel de área. É a régua nova, não erro de dado.
//
// ⚠️ Existe em JS porque a lista de inscritos deriva a faixa na leitura, e
// chamar a função SQL por linha custaria uma consulta por pessoa. Se a régua
// mudar no banco, mudar AQUI TAMBÉM — duas réguas diferentes fariam a lista
// impressa discordar do que o KPI conta.
//
// O slug (`crianca`, sem cedilha) é identificador e nunca leva acento; o rótulo
// exibido leva.

export type Faixa = 'crianca' | 'adolescente' | 'jovem' | 'adulto';

export const FAIXAS: Faixa[] = ['crianca', 'adolescente', 'jovem', 'adulto'];

export const FAIXA_LABEL: Record<Faixa, string> = {
  crianca: 'Criança (até 12)',
  adolescente: 'Adolescente (13–17)',
  jovem: 'Jovem (18–25)',
  adulto: 'Adulto (26+)',
};

export const FAIXA_LABEL_CURTO: Record<Faixa, string> = {
  crianca: 'Criança',
  adolescente: 'Adolescente',
  jovem: 'Jovem',
  adulto: 'Adulto',
};

/**
 * Idade em anos completos. Aceita 'YYYY-MM-DD' (formato do banco) e Date.
 *
 * Trata a data como LOCAL (`+T00:00:00`): sem isso, 'YYYY-MM-DD' é parseado
 * como UTC e, em fuso negativo, vira o dia anterior — quem nasceu dia 1º
 * apareceria um dia mais velho, e no limiar da faixa isso muda a
 * classificação.
 */
export function idadeEmAnos(nascimento?: string | Date | null, agora?: Date): number | null {
  if (!nascimento) return null;
  const d = nascimento instanceof Date
    ? nascimento
    : new Date(`${String(nascimento).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;

  // `agora` é opcional e existe para TESTE: régua de idade que lê o relógio da
  // máquina passa hoje e falha no aniversário seguinte. Em produção ninguém
  // passa o parâmetro e o comportamento é o de sempre.
  const hoje = agora instanceof Date && !Number.isNaN(agora.getTime()) ? agora : new Date();
  let anos = hoje.getFullYear() - d.getFullYear();
  const m = hoje.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && hoje.getDate() < d.getDate())) anos -= 1;
  return anos < 0 || anos > 130 ? null : anos;   // data absurda não vira idade
}

/** A régua, sobre a idade em anos completos. Um lugar só — o resto delega. */
export function faixaPorIdade(idade?: number | null): Faixa | null {
  if (idade == null || !Number.isFinite(idade) || idade < 0) return null;
  if (idade < 13) return 'crianca';
  if (idade < 18) return 'adolescente';
  if (idade < 26) return 'jovem';
  return 'adulto';
}

export function faixaEtaria(nascimento?: string | Date | null, agora?: Date): Faixa | null {
  return faixaPorIdade(idadeEmAnos(nascimento, agora));
}

export function faixaLabel(nascimento?: string | Date | null, curto = false): string {
  const f = faixaEtaria(nascimento);
  if (!f) return 'Sem data de nascimento';
  return curto ? FAIXA_LABEL_CURTO[f] : FAIXA_LABEL[f];
}

// `sexo` é canônico no banco (`masculino` | `feminino`, nunca "outro" — decisão
// do Contrato de Inscrição). Aqui só o rótulo de exibição.
export const SEXO_LABEL: Record<string, string> = {
  masculino: 'Masculino',
  feminino: 'Feminino',
};

export function sexoLabel(sexo?: string | null): string {
  if (!sexo) return 'Não informado';
  return SEXO_LABEL[sexo] || sexo;
}
