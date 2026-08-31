// ============================================================================
//  Régua PURA · o PROMPT que o Matheus cola no Claude Code para consertar à mão
//
//  Pedido dele (31/08/2026), logo depois do botão "Resolver todos": *"ou então,
//  se não der para consertar pelo sistema, coloque uma funcionalidade para
//  copiar o prompt para eu enviar por aqui pelo claude code mesmo, para corrigir
//  o erro."*
//
//  ⚠️ Isto NÃO é o mesmo texto que vai para o `developer_agent`. Aquele
//  (`backend/services/diagnosticoResolver.montarDiagnostico`) alimenta um
//  executor que já roda dentro do repositório, com o board e as tools na mão.
//  Este é para uma SESSÃO NOVA, que não sabe nada: precisa do endereço do
//  problema, do porquê a automação não pegou, e das leis da casa que ela tem de
//  respeitar. Dois públicos, dois textos — juntar faria o prompt mentir para um
//  dos dois.
//
//  ⚠️ Mora em `src/lib` porque só o navegador monta e copia — sem round-trip e
//  sem engordar o payload de 19 achados. Entra no gate pelo `npm test`.
// ============================================================================

/** Só o que a régua precisa. Espelha o item que `/agents/diagnosticos` devolve. */
export interface AchadoParaPrompt {
  titulo?: string | null;
  resumo?: string | null;
  severidade?: string | null;
  modulo?: string | null;
  quando?: string | null;
  classificacao?: string | null;
  confianca?: string | null;
  risco?: string | null;
  decisao_necessaria?: boolean;
  pergunta_de_decisao?: string | null;
  evidencias?: string[] | null;
  plano_de_acao?: string[] | null;
  passos_de_validacao?: string[] | null;
  autonomia?: { faixa?: string; motivo?: string; avisos?: string[] } | null;
  andamento?: string | null;
  andamento_motivo?: string | null;
  incidente?: {
    id?: string | null;
    titulo?: string | null;
    status?: string | null;
    severidade?: string | null;
    ambiente?: string | null;
    request_id?: string | null;
    release?: string | null;
    impacto?: string | null;
    aberto_em?: string | null;
  } | null;
  tarefa?: { status?: string | null; pull_request_url?: string | null } | null;
}

/**
 * ⚠️ Data SEMPRE no fuso da igreja e explícito no formatador.
 *
 * Sem `timeZone`, o mesmo achado renderiza um dia diferente conforme a máquina
 * (o gate roda em UTC, o navegador do Matheus em BRT) — e "de quando é este
 * achado?" é justamente o que decide se ele ainda vale.
 */
function dataCurta(iso?: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}

function lista(titulo: string, itens?: string[] | null): string | null {
  const xs = (Array.isArray(itens) ? itens : []).map((x) => String(x || '').trim()).filter(Boolean);
  if (!xs.length) return null;
  return [`## ${titulo}`, ...xs.map((x, i) => `${i + 1}. ${x}`)].join('\n');
}

/**
 * Por que a automação não resolveu — é o primeiro contexto que a sessão precisa.
 *
 * ⚠️ Sai da régua de autonomia (`autonomia.motivo`) e do andamento da tarefa,
 * NUNCA de um texto inventado aqui: a tela, o prompt e o board têm de dar a
 * mesma resposta. Duas explicações para o mesmo fato é como a pessoa passa a
 * não confiar em nenhuma.
 */
function porQueNaoFoiAutomatico(a: AchadoParaPrompt): string {
  const partes: string[] = [];
  if (a.autonomia?.motivo) partes.push(a.autonomia.motivo);
  // Só acrescenta o andamento quando ele diz algo que a faixa não disse.
  if (a.andamento_motivo && a.andamento_motivo !== a.autonomia?.motivo) {
    partes.push(a.andamento_motivo);
  }
  if (a.tarefa?.pull_request_url) {
    partes.push(`Já existe um PR aberto pelo agente: ${a.tarefa.pull_request_url}`);
  }
  if (!partes.length) return 'Não registrado — confira a aba Diagnósticos.';
  return partes.join('. ');
}

/**
 * ⚠️⚠️ A SEÇÃO MAIS IMPORTANTE DO PROMPT.
 *
 * Medido em 31/08: **6 dos 7 achados abertos estão `nao_reproduzido`** e são de
 * 12–14/08, e vários endereçam rotas que outra frente já consertou depois. Uma
 * sessão que receba "conserte isto" sobre um defeito que não existe mais vai
 * PRODUZIR um conserto — plausível, revisável, e inútil. Então o prompt manda
 * confirmar primeiro e autoriza explicitamente a resposta "já está resolvido".
 */
function comoTrabalhar(a: AchadoParaPrompt, hoje: Date): string {
  const naoReproduzido = String(a.incidente?.status || '').toLowerCase() === 'nao_reproduzido';
  const dias = a.incidente?.aberto_em || a.quando
    ? Math.max(0, Math.round((hoje.getTime() - new Date(a.incidente?.aberto_em || a.quando || '').getTime()) / 86_400_000))
    : null;

  const linhas = [
    '## Antes de mexer em uma linha',
    dias !== null && dias > 2
      ? `1. ⚠️ Este achado tem ${dias} dia(s). Pode já ter sido corrigido por outra frente — **confirme no código e no banco vivo que o defeito AINDA existe** antes de escrever qualquer coisa.`
      : '1. Confirme no código e no banco vivo que o defeito realmente acontece.',
    naoReproduzido
      ? '2. ⚠️⚠️ O incidente está marcado como **não reproduzido**: ninguém conseguiu fazê-lo acontecer de novo. A causa provável acima é HIPÓTESE do agente, não fato medido. Não trate como diagnóstico fechado.'
      : '2. A causa provável acima é a hipótese do agente. Confirme antes de adotá-la.',
    '3. Se concluir que **já está resolvido** ou que o diagnóstico está errado, **diga isso e pare** — não invente conserto para fechar o card. Nesse caso o que resolve é encerrar o incidente em `/sistema`.',
    '',
    '## Regras da casa que valem aqui',
    '- Medir antes de afirmar: o banco vivo manda, não o arquivo de migration.',
    '- **Migration é decisão minha**: se o conserto precisar de mudança de schema, pare e me pergunte.',
    '- Nada de tocar autenticação, financeiro/pagamentos ou o módulo Sistema sem falar comigo.',
    '- Portão antes do PR: `npm run typecheck` (sem cache), `npm run build`, `npm test` e os scripts do gate em `.github/workflows/deploy-vercel.yml`.',
    '- Régua nova vai em `backend/utils/` ou `src/lib/` com teste, e o teste entra no gate.',
    '- Ao terminar: abra o PR e me diga o que ficou de fora e por quê.',
  ];
  // ⚠️ SEM `filter(Boolean)` aqui: ele comeria as strings vazias, que são
  // exatamente as linhas em branco que separam os dois blocos no markdown.
  return linhas.join('\n');
}

/**
 * Monta o prompt de UM achado.
 *
 * @param agora injetável só para teste — produção usa o relógio.
 */
export function montarPromptDiagnostico(a: AchadoParaPrompt, agora: Date = new Date()): string {
  const inc = a.incidente || null;
  const tituloProblema = String(inc?.titulo || a.titulo || 'Achado sem título').trim();

  const identificacao = [
    '## Identificação do incidente',
    inc?.id ? `- id (tabela \`system_incidents\`): \`${inc.id}\`` : '- sem incidente aberto (achado de auditoria)',
    inc?.status ? `- status: ${inc.status}` : null,
    (inc?.severidade || a.severidade) ? `- severidade: ${inc?.severidade || a.severidade}` : null,
    inc?.ambiente ? `- ambiente: ${inc.ambiente}` : null,
    inc?.request_id ? `- rastreio (request_id): \`${inc.request_id}\`` : null,
    inc?.release ? `- release: \`${inc.release}\`` : null,
    dataCurta(inc?.aberto_em) ? `- aberto em: ${dataCurta(inc?.aberto_em)}` : null,
    dataCurta(a.quando) ? `- diagnosticado em: ${dataCurta(a.quando)}` : null,
    a.modulo ? `- módulo declarado: ${a.modulo}` : null,
  ].filter(Boolean).join('\n');

  const causa = [
    '## Causa provável (hipótese do agente)',
    a.titulo ? String(a.titulo).trim() : null,
    [
      a.classificacao ? `classificação: ${a.classificacao}` : null,
      a.confianca ? `confiança: ${a.confianca}` : null,
      a.risco ? `risco: ${a.risco}` : null,
    ].filter(Boolean).join(' · ') || null,
  ].filter(Boolean).join('\n');

  const pergunta = a.decisao_necessaria && a.pergunta_de_decisao
    ? ['## Pergunta que o agente deixou aberta',
       `${a.pergunta_de_decisao}`,
       '⚠️ Não decida isso sozinho — se o conserto depender da resposta, pare e me pergunte.'].join('\n')
    : null;

  // ⚠️ Blocos juntados com LINHA EM BRANCO: sem ela o markdown não separa os
  // títulos `##` do parágrafo anterior, e o prompt chega numa parede de texto —
  // que é justamente o que faz uma sessão nova ler pela metade.
  return [
    'Preciso corrigir um erro do ERP da CBRio. O achado abaixo saiu do módulo Agentes & Auditoria (aba Diagnósticos) e o agente desenvolvedor NÃO o corrigiu sozinho.',
    [`# ${tituloProblema}`, a.resumo ? String(a.resumo).trim() : null].filter(Boolean).join('\n'),
    inc?.impacto ? `Impacto relatado: ${inc.impacto}` : null,
    ['## Por que a automação não resolveu', porQueNaoFoiAutomatico(a)].join('\n'),
    identificacao,
    causa,
    lista('Evidências que o agente viu', a.evidencias),
    lista('Plano de ação proposto pelo agente', a.plano_de_acao),
    lista('Como validar', a.passos_de_validacao),
    pergunta,
    comoTrabalhar(a, agora),
  ].filter((x) => x !== null && x !== undefined && x !== '').join('\n\n').replace(/\n{3,}/g, '\n\n').trim();
}

/**
 * Prompt de VÁRIOS achados de uma vez.
 *
 * ⚠️ O teto existe e é DECLARADO no próprio texto: prompt de 40 achados não é
 * uma tarefa, é um despejo — a sessão perde o fio e conserta mal os primeiros.
 * Cortar em silêncio seria pior: quem colar acha que mandou tudo.
 */
export const TETO_LOTE = 5;

export function montarPromptLote(achados: AchadoParaPrompt[], agora: Date = new Date()): string {
  const xs = (Array.isArray(achados) ? achados : []).filter(Boolean);
  if (!xs.length) return '';
  if (xs.length === 1) return montarPromptDiagnostico(xs[0], agora);

  const usados = xs.slice(0, TETO_LOTE);
  const deFora = xs.length - usados.length;

  return [
    `Preciso corrigir ${usados.length} erros do ERP da CBRio. Todos saíram do módulo Agentes & Auditoria (aba Diagnósticos) e o agente desenvolvedor não os corrigiu sozinho.`,
    '',
    '⚠️ Trate um por vez, na ordem, e me diga ao fim de cada um o que você concluiu. Se algum já estiver resolvido, diga e passe para o seguinte — não invente conserto.',
    deFora > 0
      ? `\n⚠️ Há ${deFora} outro(s) achado(s) além destes ${usados.length}. Copie de novo depois de fechar esta rodada.`
      : null,
    '',
    ...usados.map((a, i) => [
      '',
      `═══════════ ${i + 1} de ${usados.length} ═══════════`,
      '',
      montarPromptDiagnostico(a, agora),
    ].join('\n')),
  ].filter((x) => x !== null).join('\n').replace(/\n{4,}/g, '\n\n\n').trim();
}
