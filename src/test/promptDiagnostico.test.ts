import { describe, it, expect } from 'vitest';
import { montarPromptDiagnostico, montarPromptLote, TETO_LOTE } from '../lib/promptDiagnostico';

// ⚠️ `agora` INJETADO em todo caso: teste que lê o relógio da máquina é o que
// mordeu no `faixaEtaria.test.ts`.
const AGORA = new Date('2026-08-31T12:00:00Z');

/** Achado real (o único reproduzível de 31/08), encurtado. */
function achado(over: Record<string, unknown> = {}) {
  return {
    titulo: 'Causa provável: Erro de lógica de negócio no endpoint de confirmação de check-in',
    resumo: 'Falha crítica em rota POST /api/public/evento-checkin/:token/confirmar com erro HTTP 500 e código [P0001] modo de check-in inválido. 44 ocorrências em 15 minutos em produção.',
    severidade: 'critico',
    modulo: 'sistema',
    quando: '2026-08-29T11:55:00Z',
    classificacao: 'codigo',
    confianca: 'media',
    risco: 'critico',
    decisao_necessaria: true,
    pergunta_de_decisao: 'Deve-se fazer rollback imediato do release atual ou investigar a causa raiz?',
    evidencias: ['44 ocorrências em 15 minutos', 'código [P0001]'],
    plano_de_acao: ['Acessar logs estruturados com o request_id', 'Verificar o changelog do release'],
    passos_de_validacao: ['Reproduzir o POST em staging'],
    autonomia: { faixa: 'pr', motivo: 'o incidente não foi reproduzido — o conserto vai para PR e o merge é seu', avisos: [] },
    andamento: 'precisa_de_voce',
    andamento_motivo: 'o incidente não foi reproduzido — o conserto vai para PR e o merge é seu',
    incidente: {
      id: 'ed361cd9-162d-40fd-8dc2-a341576afb58',
      titulo: 'POST /api/public/evento-checkin/:token/confirmar',
      status: 'investigando',
      severidade: 'critical',
      ambiente: 'production',
      request_id: '018f2d5a-9fd3-4dd1-8115-6d777fc5eb93',
      release: 'abc123def456',
      impacto: '44 requisições falhando',
      aberto_em: '2026-08-29T11:50:00Z',
    },
    tarefa: null,
    ...over,
  };
}

describe('prompt · o endereço do problema', () => {
  it('leva o título do incidente, o resumo e o id da tabela', () => {
    const p = montarPromptDiagnostico(achado(), AGORA);
    expect(p).toContain('# POST /api/public/evento-checkin/:token/confirmar');
    expect(p).toContain('44 ocorrências em 15 minutos em produção');
    expect(p).toContain('ed361cd9-162d-40fd-8dc2-a341576afb58');
    expect(p).toContain('system_incidents');
  });

  it('leva o rastreio e o release — é por eles que se acha o log', () => {
    const p = montarPromptDiagnostico(achado(), AGORA);
    expect(p).toContain('018f2d5a-9fd3-4dd1-8115-6d777fc5eb93');
    expect(p).toContain('abc123def456');
  });

  it('⚠️⚠️ data em BRT e explícita — não depende do fuso da máquina', () => {
    // ⚠️ FORÇA o fuso, e é isso que faz o caso guardar algo: nesta máquina o TZ
    // é America/Sao_Paulo e no gate é UTC. Sem forçar, tirar o `timeZone` da
    // régua passa aqui e quebra a data só no CI — foi um mutante SOBREVIVENDO
    // que revelou isto (a mesma lição de 24/08, no `divisorMandala`).
    const tzOriginal = process.env.TZ;
    try {
      process.env.TZ = 'UTC';
      // 02:30Z é 23:30 do dia ANTERIOR no Rio: em UTC daria 30/08.
      const p = montarPromptDiagnostico(achado({
        incidente: { ...achado().incidente, aberto_em: '2026-08-30T02:30:00Z' },
      }), AGORA);
      expect(p).toContain('aberto em: 29/08/2026');
    } finally {
      process.env.TZ = tzOriginal;
    }
  });

  it('evidências, plano e validação viram listas numeradas', () => {
    const p = montarPromptDiagnostico(achado(), AGORA);
    expect(p).toContain('## Evidências que o agente viu');
    expect(p).toContain('1. 44 ocorrências em 15 minutos');
    expect(p).toContain('## Plano de ação proposto pelo agente');
    expect(p).toContain('## Como validar');
  });

  it('seção vazia NÃO aparece como cabeçalho órfão', () => {
    const p = montarPromptDiagnostico(achado({ evidencias: [], passos_de_validacao: null }), AGORA);
    expect(p).not.toContain('## Evidências');
    expect(p).not.toContain('## Como validar');
  });
});

describe('prompt · por que a automação não resolveu', () => {
  it('⚠️⚠️ o motivo sai da RÉGUA, não de texto inventado', () => {
    const p = montarPromptDiagnostico(achado(), AGORA);
    expect(p).toContain('## Por que a automação não resolveu');
    expect(p).toContain('o incidente não foi reproduzido');
  });

  it('não repete o mesmo motivo duas vezes', () => {
    // `autonomia.motivo` e `andamento_motivo` costumam ser iguais.
    const p = montarPromptDiagnostico(achado(), AGORA);
    const ocorrencias = p.split('o conserto vai para PR e o merge é seu').length - 1;
    expect(ocorrencias).toBe(1);
  });

  it('acrescenta o andamento quando ele diz algo NOVO', () => {
    const p = montarPromptDiagnostico(achado({
      autonomia: { faixa: 'humano', motivo: 'é dado, não código' },
      andamento_motivo: 'o agente tentou e falhou',
    }), AGORA);
    expect(p).toContain('é dado, não código');
    expect(p).toContain('o agente tentou e falhou');
  });

  it('cita o PR já aberto, se houver — a sessão não deve começar do zero', () => {
    const p = montarPromptDiagnostico(achado({
      tarefa: { status: 'aguardando_revisao', pull_request_url: 'https://github.com/x/y/pull/9' },
    }), AGORA);
    expect(p).toContain('https://github.com/x/y/pull/9');
  });

  it('sem motivo nenhum, DECLARA que não sabe — nunca frase inventada', () => {
    const p = montarPromptDiagnostico(achado({ autonomia: null, andamento_motivo: null }), AGORA);
    expect(p).toContain('Não registrado');
  });
});

describe('⚠️⚠️ prompt · a proteção contra consertar o que já foi consertado', () => {
  it('achado antigo avisa a idade em dias e manda confirmar antes', () => {
    // Medido em 31/08: 6 dos 7 abertos são de 12–14/08, e várias rotas já
    // foram consertadas por outra frente desde então.
    const p = montarPromptDiagnostico(achado({
      incidente: { ...achado().incidente, aberto_em: '2026-08-14T12:00:00Z' },
    }), AGORA);
    expect(p).toMatch(/tem 17 dia\(s\)/);
    expect(p).toContain('AINDA existe');
  });

  it('achado de hoje não finge idade', () => {
    const p = montarPromptDiagnostico(achado({
      incidente: { ...achado().incidente, aberto_em: '2026-08-31T09:00:00Z' },
    }), AGORA);
    expect(p).not.toMatch(/tem \d+ dia\(s\)/);
  });

  it('⚠️⚠️ `nao_reproduzido` é dito com todas as letras', () => {
    const p = montarPromptDiagnostico(achado({
      incidente: { ...achado().incidente, status: 'nao_reproduzido' },
    }), AGORA);
    expect(p).toContain('não reproduzido');
    expect(p).toContain('HIPÓTESE do agente, não fato medido');
  });

  it('incidente reproduzido NÃO recebe o aviso de não-reproduzido', () => {
    const p = montarPromptDiagnostico(achado(), AGORA);
    expect(p).not.toContain('HIPÓTESE do agente, não fato medido');
  });

  it('autoriza explicitamente a resposta "já está resolvido"', () => {
    const p = montarPromptDiagnostico(achado(), AGORA);
    expect(p).toContain('já está resolvido');
    expect(p).toContain('não invente conserto');
  });
});

describe('prompt · as leis da casa', () => {
  it('migration é decisão do Matheus, e isso vai escrito', () => {
    const p = montarPromptDiagnostico(achado(), AGORA);
    expect(p).toContain('Migration é decisão minha');
  });

  it('leva o portão de deploy e as áreas intocáveis', () => {
    const p = montarPromptDiagnostico(achado(), AGORA);
    expect(p).toContain('npm run typecheck');
    expect(p).toContain('npm test');
    expect(p).toMatch(/autenticação, financeiro/);
  });

  it('a pergunta aberta vem com a instrução de não decidir sozinho', () => {
    const p = montarPromptDiagnostico(achado(), AGORA);
    expect(p).toContain('rollback imediato');
    expect(p).toContain('Não decida isso sozinho');
  });

  it('sem pergunta declarada, a seção não aparece', () => {
    const p = montarPromptDiagnostico(achado({ decisao_necessaria: false }), AGORA);
    expect(p).not.toContain('## Pergunta que o agente deixou aberta');
  });
});

describe('prompt · achado de auditoria (sem incidente)', () => {
  it('não inventa id e diz que não há incidente', () => {
    const p = montarPromptDiagnostico(achado({ incidente: null }), AGORA);
    expect(p).toContain('sem incidente aberto');
    expect(p).not.toContain('system_incidents`): `undefined');
    // Cai no título do próprio achado.
    expect(p).toContain('# Causa provável');
  });

  it('achado vazio não estoura e ainda produz prompt utilizável', () => {
    const p = montarPromptDiagnostico({} as never, AGORA);
    expect(p).toContain('Achado sem título');
    expect(p).toContain('Antes de mexer');
  });
});

describe('lote', () => {
  it('um item só devolve o prompt individual, sem cabeçalho de lote', () => {
    const p = montarPromptLote([achado()], AGORA);
    expect(p).not.toContain('1 de 1');
    expect(p).toContain('# POST /api/public/evento-checkin');
  });

  it('vários numeram e separam cada achado', () => {
    const p = montarPromptLote([achado(), achado({ incidente: { ...achado().incidente, titulo: 'GET /api/events/' } })], AGORA);
    expect(p).toContain('Preciso corrigir 2 erros');
    expect(p).toContain('1 de 2');
    expect(p).toContain('2 de 2');
    expect(p).toContain('GET /api/events/');
  });

  it('⚠️ teto DECLARADO no texto — corte silencioso faria achar que mandou tudo', () => {
    const muitos = Array.from({ length: TETO_LOTE + 3 }, () => achado());
    const p = montarPromptLote(muitos, AGORA);
    expect(p).toContain(`${TETO_LOTE} erros`);
    expect(p).toContain('Há 3 outro(s) achado(s)');
  });

  it('dentro do teto não promete achado que não existe', () => {
    const p = montarPromptLote([achado(), achado()], AGORA);
    expect(p).not.toContain('outro(s) achado(s)');
  });

  it('lista vazia devolve string vazia (a tela não oferece o botão)', () => {
    expect(montarPromptLote([], AGORA)).toBe('');
    expect(montarPromptLote(undefined as never, AGORA)).toBe('');
  });

  it('manda tratar um por vez', () => {
    const p = montarPromptLote([achado(), achado()], AGORA);
    expect(p).toContain('Trate um por vez');
  });
});

describe('⚠️ formato · o markdown tem de respirar', () => {
  it('todo título ## tem linha em branco antes', () => {
    // Regressão real: um `filter(Boolean)` comeu as strings vazias e o prompt
    // saiu como parede de texto — que é o que faz a sessão ler pela metade.
    const p = montarPromptDiagnostico(achado(), AGORA);
    const linhas = p.split('\n');
    linhas.forEach((l, i) => {
      if (i > 0 && l.startsWith('## ')) {
        expect(linhas[i - 1], `título sem linha em branco antes: ${l}`).toBe('');
      }
    });
  });

  it('não deixa três linhas em branco seguidas', () => {
    expect(montarPromptDiagnostico(achado(), AGORA)).not.toMatch(/\n{3,}/);
  });

  it('no lote, cada achado também respira', () => {
    const p = montarPromptLote([achado(), achado()], AGORA);
    const linhas = p.split('\n');
    linhas.forEach((l, i) => {
      if (i > 0 && l.startsWith('## ')) expect(linhas[i - 1]).toBe('');
    });
  });
});
