// ============================================================================
// Agrupar cultos por TURNO no gráfico (pedido do Matheus, 31/08)
//
// "por culto" mostra Dom 09:30, Dom 11:30 e Dom 19:00 separados. "por turno"
// junta a MANHÃ (até 12h) e deixa a NOITE, mantendo Quarta/AMI/Bridge como
// estão — turno é uma divisão do DOMINGO, não dos outros dias.
//
// ⚠️⚠️ ESPELHO de `backend/utils/lentesDomingo.turnoDoTipo` (a lente da aba
// Domingo). A fronteira das 12h tem que ser a MESMA nos dois: divergir faria o
// mesmo culto contar na manhã num lugar e na noite no outro. Há teste nos dois.
// ============================================================================
export const LIMITE_MANHA = '12:00';

export type ItemCulto = {
  nome: string;
  service_type_id?: string | null;
  valor_absoluto?: number | null;
  media?: number | null;
  taxa_ocupacao?: number | null;
  recurrence_day?: number | null;
  recurrence_time?: string | null;
};

/** Turno do culto — só faz sentido no DOMINGO (`recurrence_day === 0`). */
export function turnoDoCulto(item: ItemCulto): 'manha' | 'noite' | null {
  if (Number(item?.recurrence_day) !== 0) return null;
  const h = String(item?.recurrence_time || '').slice(0, 5);
  // ⚠️ Sem horário NÃO vira manhã: colocaria a frequência na série errada e
  // ninguém perceberia. Fica como culto próprio.
  if (!/^\d{2}:\d{2}$/.test(h)) return null;
  return h < LIMITE_MANHA ? 'manha' : 'noite';
}

const ROTULO = { manha: 'Dom manhã', noite: 'Dom noite' } as const;

/**
 * Agrupa os itens de domingo por turno. Não-domingo passa intacto.
 *
 * ⚠️ A TAXA DE OCUPAÇÃO do grupo é a MÉDIA das taxas dos membros, não a soma:
 * somar diria "157%" para dois cultos de 78% cada — o que a tela já mostra
 * errado no card de cima. Juntar dois cultos dobra os lugares OFERECIDOS, e é
 * por isso que a média é a conta certa (soma ÷ (n × capacidade) = média das
 * taxas, com capacidade uniforme).
 */
export function agruparPorTurno(items: ItemCulto[]): (ItemCulto & { cultos?: number })[] {
  const grupos = new Map<string, ItemCulto[]>();
  const out: (ItemCulto & { cultos?: number })[] = [];

  for (const i of items || []) {
    const t = turnoDoCulto(i);
    if (!t) { out.push({ ...i, cultos: 1 }); continue; }
    if (!grupos.has(t)) grupos.set(t, []);
    (grupos.get(t) as ItemCulto[]).push(i);
  }

  for (const t of ['manha', 'noite'] as const) {
    const membros = grupos.get(t);
    if (!membros || !membros.length) continue;
    const soma = (f: keyof ItemCulto) =>
      membros.reduce((a, m) => a + (Number(m[f]) || 0), 0);
    const comTaxa = membros.filter((m) => m.taxa_ocupacao != null);
    out.push({
      nome: ROTULO[t],
      // ⚠️ Sem `service_type_id`: o grupo não É um culto, e mandar o id de um
      // membro faria o clique na barra abrir o culto errado e o realce por
      // culto pintar só uma parte do grupo.
      service_type_id: null,
      valor_absoluto: soma('valor_absoluto'),
      media: soma('media'),
      taxa_ocupacao: comTaxa.length
        ? Math.round((comTaxa.reduce((a, m) => a + Number(m.taxa_ocupacao), 0) / comTaxa.length) * 10) / 10
        : null,
      recurrence_day: 0,
      // Guarda a hora do 1º membro só pra ORDENAR junto dos outros dias.
      recurrence_time: membros
        .map((m) => String(m.recurrence_time || '99:99').slice(0, 5))
        .sort()[0],
      cultos: membros.length,
    });
  }

  return out;
}
