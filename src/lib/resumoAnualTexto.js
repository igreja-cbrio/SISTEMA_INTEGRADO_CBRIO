// ============================================================================
// O texto do comparativo do ano, pronto pra colar no WhatsApp.
//
// ⚠️ POR QUE EXISTE (27/08/2026): o Matheus pediu esses números duas vezes por
// conversa e depois pediu "de um jeito de copiar pro wpp". O comparativo JÁ
// existia no sistema (Dashboard Semanal → aba Mensal → bloco do acumulado), mas
// mostra UM indicador por vez e não tinha como copiar — então na prática ele
// pedia os números por fora.
//
// ⚠️ Régua PURA e no gate: este texto é colado em grupo de liderança. Número
// formatado errado (ou ano faltando em silêncio) vira decisão errada, e a única
// forma de travar isso é teste.
// ============================================================================

/**
 * `71417` → `71.417`. Sem casa decimal: são contagens de gente.
 *
 * ⚠️⚠️ A guarda de nulo vem ANTES do `Number()`, e não é preciosismo:
 * `Number(null) === 0` e `Number.isFinite(0)` é `true`, então sem ela "sem dado"
 * viraria **"0"** num texto colado em grupo de liderança. É a MESMA armadilha
 * que este projeto já registrou no `dia_semana` (0 = domingo), na âncora de
 * agenda e na alçada de compra — e ela me pegou de novo aqui, achada pelo teste.
 */
export function numeroBr(v) {
  if (v === null || v === undefined || v === '') return '—';
  const n = Number(v);
  if (!Number.isFinite(n)) return '—';
  return Math.round(n).toLocaleString('pt-BR');
}

/**
 * ⚠️ O RÓTULO DO PERÍODO VAI JUNTO, sempre. "71.417" sem "até 27/08" é o número
 * que alguém compara com o ano fechado do ano passado — é a lição registrada no
 * censo ("a JANELA vai colada no número") e ela vale em dobro aqui, porque o
 * texto sai do sistema e vira mensagem sem contexto nenhum em volta.
 */
export function montarResumoAnual({ titulo, periodo, linhas = [], observacao } = {}) {
  const partes = [];
  partes.push(`*${titulo || 'CBRio · comparativo'}*`);
  if (periodo) partes.push(`_${periodo}_`);

  for (const linha of linhas) {
    const anos = Array.isArray(linha?.anos) ? linha.anos : [];
    // ⚠️ Linha sem NENHUM ano com dado não entra: bloco com três "—" no
    // WhatsApp parece sistema quebrado. Quem declara a ausência é a TELA.
    // ⚠️ `a?.valor != null` e NÃO `Number.isFinite(Number(...))`: o segundo
    // trata `null` como 0 e a linha vazia entraria assim mesmo.
    if (!anos.some((a) => a?.valor != null)) continue;
    partes.push('');
    partes.push(`*${linha.rotulo}*`);
    for (const a of anos) {
      partes.push(`${a.ano}: ${numeroBr(a.valor)}`);
    }
  }

  if (observacao) {
    partes.push('');
    partes.push(`_${observacao}_`);
  }
  return partes.join('\n');
}

/**
 * Junta as respostas do `/dashboard-semanal/ytd` (uma por indicador) nas linhas
 * do resumo. Batismos vêm de carona no payload de qualquer indicador.
 *
 * ⚠️⚠️ `tem_dado` MANDA sobre o `total`. O endpoint devolve `total: 0` para ano
 * sem dado nenhum (é o `acc.total || 0`) — tratar isso como zero escreveria
 * "Decisões 2024: 0" num texto de WhatsApp que ninguém volta pra conferir.
 * Sem dado vira `null`, e a tela mostra "—".
 *
 * ⚠️ Batismos NÃO têm `tem_dado` no payload (a contagem é `head: true`), então
 * `s.tem_dado === false` nunca casa neles e zero é zero de verdade — nenhum
 * batismo naquele recorte. (Eu tinha um parâmetro `exigeTemDado` aqui; o
 * mutation test mostrou que era CÓDIGO MORTO, e código morto que parece guarda
 * engana a próxima leitura.)
 */
export function linhasDoYtd({ anos = [], frequencia, decisoes, batismos } = {}) {
  const porAno = (serie) => {
    const mapa = new Map((serie || []).map((s) => [Number(s.ano), s]));
    return anos.map((ano) => {
      const s = mapa.get(Number(ano));
      const v = Number(s?.total);
      const semDado = !s || s.tem_dado === false || !Number.isFinite(v);
      return { ano, valor: semDado ? null : v };
    });
  };
  return [
    { chave: 'frequencia', rotulo: 'Frequência', anos: porAno(frequencia) },
    { chave: 'decisoes', rotulo: 'Decisões', anos: porAno(decisoes) },
    { chave: 'batismos', rotulo: 'Batismos', anos: porAno(batismos) },
  ];
}
