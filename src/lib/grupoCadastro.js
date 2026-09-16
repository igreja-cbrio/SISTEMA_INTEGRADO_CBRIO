// ============================================================================
// O que falta no CADASTRO de um grupo de conexão.
//
// Vive aqui (e não dentro da tela) porque é a régua que monta a FILA DE
// TRABALHO da coordenação: o chip "Cadastro incompleto" da aba Grupos, o
// recorte por campo, o selo da linha e o checklist da ficha leem esta função.
// Acusar falta que não existe custa a credibilidade da lista inteira — quem
// abre 5 grupos e não acha nada errado para de abrir o sexto.
// ============================================================================

// Grupo diário acontece TODOS os dias (Marcos · 17/07): sem dia da semana fixo,
// aparece em qualquer filtro de dia e mostra "Diário" no lugar do dia.
export const ehDiario = (g) => (g?.recorrencia || '').toLowerCase().trim() === 'diario';

// Campos exigidos pro cadastro do grupo estar completo (capacidade e foto são
// opcionais). Devolve os rótulos do que falta — lista vazia = cadastro completo.
// Telefone do líder: na lista vem em lider_telefone; no detalhe, em lider.telefone.
export function camposFaltantes(g) {
  const faltas = [];
  if (!g.lider_id) faltas.push('Líder');
  // ⚠️ Líder APAGADO é pendência própria, e é a mais grave da lista: o aviso de
  // WhatsApp do grupo vai pro `lider_id` (lei de 31/07 · um destinatário só), ou
  // seja, pra um cadastro morto. Só o servidor sabe disso (`lider_apagado`);
  // `undefined` ⇒ vale o teste de telefone de sempre.
  else if (g.lider_apagado === true) faltas.push('Líder (cadastro apagado)');
  else if (!(g.lider?.telefone ?? g.lider_telefone)) faltas.push('Telefone do líder');
  // Grupo diário não tem dia da semana de propósito — não é campo faltante.
  if (g.dia_semana == null && !ehDiario(g)) faltas.push('Dia da semana');
  if (!g.horario) faltas.push('Horário');
  // ENDEREÇO · o servidor manda `eh_online`, `endereco_publico` (rua + número
  // já limpos) e `endereco_tem_numero` — é a régua ÚNICA, a MESMA do formulário
  // público (`backend/utils/enderecoGrupoPublico.js` · Natasha 16/09). Grupo
  // online não tem endereço a cobrar.
  // ⚠️⚠️ `undefined` (servidor ou bundle antigo) cai no teste de ausência de
  // sempre: nunca acusa falta que não foi medida. Só o `=== null` / `=== false`
  // explícito, que só o servidor novo produz, vira pendência.
  if (!g.eh_online) {
    // "(endereço não informado)" é string preenchida e passava como cadastro
    // completo — o servidor devolve `endereco_publico: null` nesse caso.
    if (!g.endereco || g.endereco_publico === null) faltas.push('Endereço');
    else if (g.endereco_tem_numero === false) faltas.push('Número no endereço');
  }
  if (!g.bairro) faltas.push('Bairro');
  if (!g.faixa_etaria) faltas.push('Faixa etária');
  // Grupo com cara de faixa etária (rótulo ou nome) sem limites numéricos vira
  // pendência pra liderança resolver (Marcos · 2026-07-13) — é o limite que arma
  // a trava de idade do form público. Grupos gerais não precisam.
  const rotuloEtario = ['adolescentes', 'jovens', 'jovens adultos'].includes(String(g.faixa_etaria || '').toLowerCase());
  const nomeEtario = /jovens|jovem|adolescente|teen/i.test(g.nome || '');
  if ((rotuloEtario || nomeEtario) && g.idade_min == null && g.idade_max == null) faltas.push('Idades da faixa (mín/máx)');
  if (!g.categoria) faltas.push('Categoria');
  if (!g.rede_id) faltas.push('Rede');
  return faltas;
}

// A fila de trabalho: quantos grupos faltam CADA campo, do maior lote pro
// menor. É por campo que a coordenação fecha o cadastro — "78 incompletos" não
// diz o que fazer; "74 sem rede" e "13 sem número" dizem.
export function faltasPorCampo(grupos) {
  const c = {};
  (grupos || []).forEach(g => camposFaltantes(g).forEach(f => { c[f] = (c[f] || 0) + 1; }));
  return Object.entries(c).sort((a, b) => b[1] - a[1]);
}
