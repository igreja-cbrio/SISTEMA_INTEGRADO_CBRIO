import { describe, it, expect } from 'vitest';
// Régua CommonJS de backend/utils — padrão dos testes da casa.
import reg from '../../backend/utils/diagnosticoAutonomia.js';

const { FAIXAS, avaliarAutonomia, distribuir, areaProtegida, foiReproduzido } = reg;

/** Achado mínimo que PASSA na régua — cada teste degrada um campo. */
function achado(over: Record<string, unknown> = {}) {
  return {
    id: 'run-1:0',
    titulo: 'Causa provável: erro de lógica no handler da rota',
    resumo: 'Falha crítica em rota POST /api/public/evento-checkin/:token/confirmar com erro HTTP 500.',
    estado: 'aberto',
    severidade: 'critico',
    classificacao: 'codigo',
    confianca: 'media',
    risco: 'critico',
    decisao_necessaria: true,
    plano_de_acao: ['Acessar logs estruturados', 'Verificar changelog do release'],
    incidente: { id: 'inc-1', status: 'investigando' },
    ...over,
  };
}

describe('autonomia · quem o agente resolve sozinho', () => {
  it('achado reproduzível, de código e com plano vira AUTO (corrige + PR + merge)', () => {
    const r = avaliarAutonomia(achado());
    expect(r.faixa).toBe(FAIXAS.AUTO);
    expect(r.motivo).toMatch(/mergeia/);
  });

  it('⚠️⚠️ `decisao_necessaria` NÃO trava — veio true em 19 de 19 diagnósticos', () => {
    // Se ele fosse portão, o botão nunca resolveria nada, para sempre.
    expect(avaliarAutonomia(achado({ decisao_necessaria: true })).faixa).toBe(FAIXAS.AUTO);
    // Mas o card DECLARA a pergunta como ressalva.
    expect(avaliarAutonomia(achado({ decisao_necessaria: true })).avisos.join(' '))
      .toMatch(/pergunta de decisão/);
  });

  it('confiança média entra no AUTO, mas fica declarada', () => {
    expect(avaliarAutonomia(achado({ confianca: 'media' })).avisos.join(' ')).toMatch(/média/);
  });
});

describe('PR sem merge · conserta e para', () => {
  it('⚠️⚠️ incidente NÃO REPRODUZIDO nunca é mergeado sozinho', () => {
    const r = avaliarAutonomia(achado({ incidente: { id: 'inc-2', status: 'nao_reproduzido' } }));
    expect(r.faixa).toBe(FAIXAS.PR);
    expect(r.motivo).toMatch(/não foi reproduzido/);
  });

  it('confiança BAIXA não é mergeada sozinha', () => {
    const r = avaliarAutonomia(achado({ confianca: 'baixa' }));
    expect(r.faixa).toBe(FAIXAS.PR);
  });

  it('não reproduzido VENCE a confiança baixa na mensagem (o motivo mais acionável)', () => {
    const r = avaliarAutonomia(achado({ confianca: 'baixa', incidente: { id: 'i', status: 'nao_reproduzido' } }));
    expect(r.motivo).toMatch(/não foi reproduzido/);
  });
});

describe('humano · nem tenta, e DIZ por quê', () => {
  it('sem incidente (achado de auditoria) não tem chave para acompanhar', () => {
    const r = avaliarAutonomia(achado({ incidente: null }));
    expect(r.faixa).toBe(FAIXAS.HUMANO);
    expect(r.motivo).toMatch(/auditoria/);
  });

  it('encerrado não é pendência', () => {
    expect(avaliarAutonomia(achado({ estado: 'encerrado' })).faixa).toBe(FAIXAS.HUMANO);
    expect(avaliarAutonomia(achado({ estado: 'sem_incidente' })).faixa).toBe(FAIXAS.HUMANO);
  });

  it('sem plano de ação não há o que implementar', () => {
    expect(avaliarAutonomia(achado({ plano_de_acao: [] })).faixa).toBe(FAIXAS.HUMANO);
  });

  it('classificação que não é código sai com o motivo ESPECÍFICO de cada uma', () => {
    const casos: Array<[string, RegExp]> = [
      ['dados', /DADO/],
      ['dependencia_externa', /EXTERNA/],
      ['experiencia_usuario', /experiência de uso/],
      ['desconhecido', /NÃO identificou a causa/],
    ];
    for (const [classificacao, re] of casos) {
      const r = avaliarAutonomia(achado({ classificacao }));
      expect(r.faixa, classificacao).toBe(FAIXAS.HUMANO);
      expect(r.motivo, classificacao).toMatch(re);
    }
  });

  it('classificação desconhecida pelo mapa NÃO vira faixa silenciosa — cita o valor', () => {
    const r = avaliarAutonomia(achado({ classificacao: 'coisa_nova' }));
    expect(r.faixa).toBe(FAIXAS.HUMANO);
    expect(r.motivo).toMatch(/coisa_nova/);
  });

  it('classificação AUSENTE não bloqueia (achado antigo, sem diagnóstico estruturado)', () => {
    expect(avaliarAutonomia(achado({ classificacao: null })).faixa).toBe(FAIXAS.AUTO);
  });
});

describe('áreas protegidas · o agente não escreve nesses arquivos', () => {
  it('dinheiro, autenticação e migration saem da automação', () => {
    expect(areaProtegida(achado({ resumo: 'falha ao gerar cobrança no Mercado Pago' }))).toBe('pagamentos');
    expect(areaProtegida(achado({ resumo: 'erro na conciliação do dízimo' }))).toBe('financeiro');
    expect(areaProtegida(achado({ titulo: 'Falha no login com senha' }))).toBe('autenticação e permissão');
    expect(areaProtegida(achado({ plano_de_acao: ['criar migration para a coluna'] }))).toBe('banco de dados');
    expect(avaliarAutonomia(achado({ resumo: 'erro no checkout do Pix' })).faixa).toBe(FAIXAS.HUMANO);
  });

  it('⚠️⚠️ "token" em rota assinada NÃO é área protegida', () => {
    // `/evento-checkin/:token`, `/g/a/:token`, `/e/:token` — metade dos links
    // assinados da casa. Barrar por "token" mandaria pro humano justamente o
    // único achado reproduzível de hoje.
    expect(areaProtegida(achado())).toBeNull();
    expect(areaProtegida(achado({ resumo: 'GET /e/:token respondeu 500' }))).toBeNull();
  });

  it('"checkin" não é "checkout"', () => {
    expect(areaProtegida(achado({ resumo: 'POST /api/public/evento-checkin/:token/confirmar' }))).toBeNull();
  });

  it('achado sem texto nenhum não estoura', () => {
    expect(areaProtegida({})).toBeNull();
    expect(areaProtegida(null)).toBeNull();
  });
});

describe('foiReproduzido', () => {
  it('só `nao_reproduzido` é não-reproduzido', () => {
    expect(foiReproduzido({ incidente: { status: 'investigando' } })).toBe(true);
    expect(foiReproduzido({ incidente: { status: 'monitorado' } })).toBe(true);
    expect(foiReproduzido({ incidente: { status: 'nao_reproduzido' } })).toBe(false);
    expect(foiReproduzido({ incidente: { status: 'NAO_REPRODUZIDO' } })).toBe(false);
    // Sem incidente, a régua de faixa já barrou antes — aqui não inventa.
    expect(foiReproduzido({})).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  ⚠️⚠️ CONTRATO CENTRAL · os 7 achados ABERTOS medidos em produção (31/08).
//  Se este bloco ficar vermelho, a régua passou a decidir diferente sobre o
//  que vai a produção sozinho — e isso tem de ser uma escolha, nunca um efeito
//  colateral.
// ═══════════════════════════════════════════════════════════════════════════
// ⚠️ `resumo` e `plano` são os TEXTOS REAIS gravados no banco (encurtados só no
// fim). Importam porque é sobre eles que a heurística de área protegida corre —
// uma palavra como "banco", "dados" ou "token" no meio de um plano de ação não
// pode tirar o achado da automação.
const ABERTOS_EM_PRODUCAO = [
  {
    rota: 'POST /api/public/evento-checkin/:token/confirmar',
    status: 'investigando', classificacao: 'codigo', confianca: 'media', esperado: FAIXAS.AUTO,
    resumo: 'Falha crítica em rota POST /api/public/evento-checkin/:token/confirmar com erro HTTP 500 e código [P0001] modo de check-in inválido. 44 ocorrências em 15 minutos em produção.',
    plano: ['Acessar logs estruturados ou Sentry com request_id fornecido para examinar payload POST e parâmetros :token',
            'Consultar base de dados para validar se houve alterações recentes em enums ou validações de \'modo de check-in\''],
  },
  {
    rota: 'DELETE /api/events/:id',
    status: 'nao_reproduzido', classificacao: 'codigo', confianca: 'media', esperado: FAIXAS.PR,
    resumo: 'DELETE /api/events/:id retorna HTTP 500 sem exceção capturada. Resposta vazia indica falha silenciosa no handler ou middleware, possivelmente ligada à release em produção.',
    plano: ['Revisar código do handler: procurar por res.status(500).send() ou res.json() sem throw',
            'Testar DELETE /api/events/:id com ID válido e inválido em staging antes de produção'],
  },
  {
    rota: 'POST /api/wa-inbox/conversas/:id/transferir',
    status: 'nao_reproduzido', classificacao: 'codigo', confianca: 'media', esperado: FAIXAS.PR,
    resumo: 'POST /api/wa-inbox/conversas/:id/transferir retorna HTTP 500 em produção. Rota respondendo com erro genérico sem exceção capturada.',
    plano: ['Verificar integridade de conexões externas (filas, banco, webhooks) usadas pela rota',
            'Revisar middleware e tratamento de erros da rota para detectar swallow de exceções'],
  },
  {
    rota: 'GET /api/painel-rh/comunicados',
    status: 'nao_reproduzido', classificacao: 'codigo', confianca: 'media', esperado: FAIXAS.PR,
    resumo: 'GET /api/painel-rh/comunicados retorna HTTP 500 em produção sem exceção capturada. Rota responde erro silenciosamente.',
    plano: ["Validar integridade de dados/configuração da fonte de dados de 'comunicados'",
            'Verificar release anterior: comparar diff de código na rota e dependências'],
  },
  {
    rota: 'GET /api/painel-rh/eventos',
    status: 'nao_reproduzido', classificacao: 'codigo', confianca: 'media', esperado: FAIXAS.PR,
    resumo: 'Rota GET /api/painel-rh/eventos respondeu com HTTP 500 em produção. Resposta de erro foi entregue sem exceção capturada.',
    plano: ['Verificar dependências externas (BD, APIs, cache) acessadas pela rota no período do erro',
            'Inspecionar handler em busca de try-catch que consome erro sem relançar'],
  },
  {
    rota: 'GET /api/events/',
    status: 'nao_reproduzido', classificacao: 'desconhecido', confianca: 'baixa', esperado: FAIXAS.HUMANO,
    resumo: 'GET /api/events/ retornando HTTP 500 em produção. Rota respondendo sem exceção lançada; falha provavelmente em lógica interna ou dependência.',
    plano: ['Consultar logs da função (handler) do endpoint GET /api/events/ usando os request_ids do Sentry'],
  },
  {
    rota: 'POST /api/membresia/identidade-pendencias/:id/ligar-inscricao',
    status: 'nao_reproduzido', classificacao: 'codigo', confianca: 'media', esperado: FAIXAS.PR,
    resumo: 'POST /api/membresia/identidade-pendencias/:id/ligar-inscricao retorna HTTP 500 sem exceção capturada. 2 ocorrências em 15 minutos em produção.',
    plano: ['Verificar código da rota para blocos try-catch sem logging',
            'Revisar middlewares que podem estar interceptando exceções'],
  },
];

describe('os 7 abertos de 31/08/2026 (dado real de produção)', () => {
  const itens = ABERTOS_EM_PRODUCAO.map((c, i) => achado({
    id: `real-${i}`,
    titulo: `Causa provável: falha na rota ${c.rota}`,
    resumo: c.resumo,
    incidente: { id: `inc-real-${i}`, status: c.status },
    classificacao: c.classificacao,
    confianca: c.confianca,
    plano_de_acao: c.plano,
  }));

  it('⚠️ nenhum deles é tirado da automação pela heurística de área protegida', () => {
    // "banco", "dados", "release", ":token" e "middleware" aparecem nos textos
    // reais. Se um deles passar a casar, o achado sai da fila em silêncio.
    itens.forEach((item, i) => {
      expect(areaProtegida(item), ABERTOS_EM_PRODUCAO[i].rota).toBeNull();
    });
  });

  it('cada um cai na faixa esperada', () => {
    itens.forEach((item, i) => {
      expect(avaliarAutonomia(item).faixa, ABERTOS_EM_PRODUCAO[i].rota)
        .toBe(ABERTOS_EM_PRODUCAO[i].esperado);
    });
  });

  it('a distribuição do dia é 1 auto · 5 PR · 1 humano', () => {
    const d = distribuir(itens);
    expect(d.resumo).toMatchObject({ total: 7, auto: 1, pr: 5, humano: 1, despachaveis: 6 });
  });

  it('⚠️ o único mergeado sozinho é o reproduzível — o das 44 ocorrências', () => {
    const d = distribuir(itens);
    expect(d.auto).toHaveLength(1);
    expect(d.auto[0].resumo).toMatch(/evento-checkin/);
  });
});

describe('distribuir', () => {
  it('anota `autonomia` em todo item, sem perder nenhum', () => {
    const d = distribuir([achado(), achado({ estado: 'encerrado' })]);
    expect(d.itens).toHaveLength(2);
    expect(d.itens.every((i: any) => i.autonomia?.faixa)).toBe(true);
    expect(d.resumo.total).toBe(2);
  });

  it('lista vazia/ausente devolve resumo zerado, nunca estoura', () => {
    expect(distribuir([]).resumo.total).toBe(0);
    expect(distribuir(undefined as never).resumo.total).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  ANDAMENTO · as três caixas da aba
// ═══════════════════════════════════════════════════════════════════════════
const { ANDAMENTO, andamentoDoAchado, resumirAndamento } = reg;

describe('andamento · resolvido / sendo resolvido / precisa de você', () => {
  const auto = { autonomia: { faixa: FAIXAS.AUTO, motivo: 'm', avisos: [] } };

  it('concluída com PR é RESOLVIDO e diz que foi mergeado', () => {
    const r = andamentoDoAchado(auto, { status: 'concluida', pull_request_url: 'https://x/1' });
    expect(r.andamento).toBe(ANDAMENTO.RESOLVIDO);
    expect(r.motivo).toMatch(/mergeado/);
  });

  it('concluída SEM PR não afirma merge', () => {
    expect(andamentoDoAchado(auto, { status: 'concluida' }).motivo).not.toMatch(/mergeado/);
  });

  it('agendada é fila; em_andamento é trabalho', () => {
    expect(andamentoDoAchado(auto, { status: 'agendada' }).andamento).toBe(ANDAMENTO.NA_FILA);
    expect(andamentoDoAchado(auto, { status: 'em_andamento' }).andamento).toBe(ANDAMENTO.TRABALHANDO);
    expect(andamentoDoAchado(auto, { status: 'em_diagnostico' }).andamento).toBe(ANDAMENTO.TRABALHANDO);
  });

  it('⚠️⚠️ aguardando_revisao é PRECISA DE VOCÊ, não "em andamento"', () => {
    // O agente já terminou; o PR espera gente. Chamar de "em andamento" faria a
    // pessoa esperar por um trabalho que só ela destrava.
    const r = andamentoDoAchado(auto, { status: 'aguardando_revisao', pull_request_url: 'https://x/2' });
    expect(r.andamento).toBe(ANDAMENTO.PRECISA_DE_VOCE);
    expect(r.motivo).toMatch(/revisar e mergear/);
  });

  it('falhou e bloqueada explicam o que aconteceu, sem frase genérica', () => {
    expect(andamentoDoAchado(auto, { status: 'falhou' }).motivo).toMatch(/tentou e falhou/);
    expect(andamentoDoAchado(auto, { status: 'bloqueada' }).motivo).toMatch(/CI ficou vermelho 3/);
  });

  it('sem tarefa: faixa humano já nasce sinalizada com o motivo da régua', () => {
    const item = { autonomia: { faixa: FAIXAS.HUMANO, motivo: 'é dado, não código', avisos: [] } };
    const r = andamentoDoAchado(item, null);
    expect(r.andamento).toBe(ANDAMENTO.PRECISA_DE_VOCE);
    expect(r.motivo).toBe('é dado, não código');
  });

  it('sem tarefa e despachável: não iniciado', () => {
    expect(andamentoDoAchado(auto, null).andamento).toBe(ANDAMENTO.NAO_INICIADO);
    expect(andamentoDoAchado({ autonomia: { faixa: FAIXAS.PR } }, undefined).andamento).toBe(ANDAMENTO.NAO_INICIADO);
  });

  it('status desconhecido não vira "resolvido" por acidente', () => {
    // Fail-safe: status novo no board cai em não-iniciado, nunca em resolvido.
    expect(andamentoDoAchado(auto, { status: 'coisa_nova' }).andamento).toBe(ANDAMENTO.NAO_INICIADO);
  });

  it('resumirAndamento soma fila + trabalhando numa caixa só', () => {
    const r = resumirAndamento([
      { andamento: ANDAMENTO.RESOLVIDO }, { andamento: ANDAMENTO.NA_FILA },
      { andamento: ANDAMENTO.TRABALHANDO }, { andamento: ANDAMENTO.PRECISA_DE_VOCE },
      { andamento: ANDAMENTO.PRECISA_DE_VOCE }, { andamento: ANDAMENTO.NAO_INICIADO },
    ]);
    expect(r).toEqual({ fila_travada: null, encerrados: 0, resolvidos: 1, em_andamento: 2, precisam_de_voce: 2, nao_iniciados: 1 });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  ⚠️⚠️ ENCERRADO ≠ PRECISA DE VOCÊ
//
//  Defeito REAL do primeiro uso (31/08 · 13:33): o "Copiar prompt" montou um
//  lote de 5 achados em que 4 diziam "já decidido — o plano aqui é histórico",
//  e o contador prometia "há 11 outros". A faixa `humano` cobre coisas OPOSTAS
//  e eu mapeei as duas para a mesma caixa.
// ═══════════════════════════════════════════════════════════════════════════
describe('encerrado não é pendência de ninguém', () => {
  const encerrado = {
    estado: 'encerrado',
    autonomia: { faixa: FAIXAS.HUMANO, motivo: 'já decidido (resolvido ou risco aceito) — o plano aqui é histórico', avisos: [] },
  };

  it('incidente resolvido vira ENCERRADO, não "precisa da sua ação"', () => {
    const r = andamentoDoAchado(encerrado, null);
    expect(r.andamento).toBe(ANDAMENTO.ENCERRADO);
    expect(r.motivo).toMatch(/histórico/);
  });

  it('e sai da contagem de "precisam de você"', () => {
    const r = resumirAndamento([
      { andamento: ANDAMENTO.ENCERRADO }, { andamento: ANDAMENTO.ENCERRADO },
      { andamento: ANDAMENTO.PRECISA_DE_VOCE },
    ]);
    expect(r).toMatchObject({ encerrados: 2, precisam_de_voce: 1 });
  });

  it('⚠️ achado de AUDITORIA (sem incidente) CONTINUA em "precisa da sua ação"', () => {
    // São 43 achados fora da janela atual. Mandá-los pra "encerrado"
    // esconderia constatação que ninguém decidiu ainda.
    const auditoria = {
      estado: 'sem_incidente',
      autonomia: { faixa: FAIXAS.HUMANO, motivo: 'achado de auditoria, sem incidente aberto', avisos: [] },
    };
    expect(andamentoDoAchado(auditoria, null).andamento).toBe(ANDAMENTO.PRECISA_DE_VOCE);
  });

  it('⚠️ tarefa em curso VENCE o estado do incidente', () => {
    // Se alguém mandou consertar e o agente está trabalhando, o que vale é a
    // tarefa — senão o card diria "histórico" com trabalho em andamento.
    expect(andamentoDoAchado(encerrado, { status: 'em_andamento' }).andamento).toBe(ANDAMENTO.TRABALHANDO);
    expect(andamentoDoAchado(encerrado, { status: 'agendada' }).andamento).toBe(ANDAMENTO.NA_FILA);
    expect(andamentoDoAchado(encerrado, { status: 'falhou' }).andamento).toBe(ANDAMENTO.PRECISA_DE_VOCE);
    expect(andamentoDoAchado(encerrado, { status: 'concluida' }).andamento).toBe(ANDAMENTO.RESOLVIDO);
  });

  it('aberto segue em "precisa da sua ação" quando a faixa é humano', () => {
    const aberto = { estado: 'aberto', autonomia: { faixa: FAIXAS.HUMANO, motivo: 'é dado, não código' } };
    expect(andamentoDoAchado(aberto, null).andamento).toBe(ANDAMENTO.PRECISA_DE_VOCE);
  });
});

// ⚠️⚠️ FILA QUE NÃO ANDA TEM DE DIZER QUE NÃO ANDA (02/09/2026).
// A linha do `agendada` prometeu "o executor pega em até 10 minutos" por DOIS
// DIAS com a fila parada (faltava o `git` no worker). O comentário na tarefa
// dizia a verdade; o resumo do card, não.
describe('fila travada por ambiente', () => {
  const achado = { estado: 'aberto', autonomia: { faixa: 'auto', motivo: '' } };
  const BLOQ = 'o binário `git` NÃO existe no container do worker (spawn ENOENT).';

  it('agendada SEM bloqueio mantém o texto de sempre', () => {
    const r = andamentoDoAchado(achado, { status: 'agendada' });
    expect(r.andamento).toBe('na_fila');
    expect(r.motivo).toContain('10 minutos');
    expect(r.fila_travada).toBeFalsy();
  });

  it('agendada COM bloqueio para de prometer prazo e diz o motivo', () => {
    const r = andamentoDoAchado(achado, { status: 'agendada', bloqueio_ambiente: BLOQ });
    expect(r.motivo).not.toContain('10 minutos');
    expect(r.motivo).toContain('NÃO está andando');
    expect(r.motivo).toContain('git');
    expect(r.fila_travada).toBe(BLOQ);
  });

  // ⚠️ NÃO vira "precisa da sua ação": a causa é UMA para N tarefas, e promover
  // cada uma inflaria o contador com N cópias do mesmo problema.
  it('travada CONTINUA na fila — não infla "precisa da sua ação"', () => {
    const r = andamentoDoAchado(achado, { status: 'agendada', bloqueio_ambiente: BLOQ });
    expect(r.andamento).toBe('na_fila');
    expect(r.andamento).not.toBe('precisa_de_voce');
  });

  it('bloqueio vazio ou de tipo errado NÃO inventa aviso', () => {
    for (const ruim of ['', '   ', null, undefined, 42, {}]) {
      const r = andamentoDoAchado(achado, { status: 'agendada', bloqueio_ambiente: ruim as never });
      expect(r.motivo).toContain('10 minutos');
      expect(r.fila_travada).toBeFalsy();
    }
  });

  it('o resumo declara a causa UMA vez, com a contagem', () => {
    const t = { andamento: 'na_fila', fila_travada: BLOQ };
    const r = resumirAndamento([t, { ...t }, { andamento: 'resolvido' }]);
    expect(r.fila_travada).toEqual({ qtd: 2, motivo: BLOQ });
    expect(r.em_andamento).toBe(2);
  });

  it('sem nada travado, o resumo devolve null (a faixa não aparece)', () => {
    expect(resumirAndamento([{ andamento: 'na_fila' }]).fila_travada).toBeNull();
    expect(resumirAndamento([]).fila_travada).toBeNull();
  });
});
